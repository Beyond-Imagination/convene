import { REPORT_EVENTS } from '@convene/shared-interfaces';

import { ParticipantEntry, TranscriptSegment } from '@/reports/domain/entries';
import { MeetingReport } from '@/reports/domain/meeting-report';
import {
  NotionPort,
  ReportIdGenerator,
  ReportRepository,
  SummarizerPort,
} from '@/reports/domain/ports';
import { Clock, DomainEventPublisher } from '@/shared-kernel/domain/ports';
import { ChatEntry, ExternalReference, Source } from '@/shared-kernel/domain/value-objects';

import { ReportNotFoundError, ReportNotResummarizableError } from './report.errors';

/**
 * Reports Bounded Context의 Application Service.
 *
 * `meeting.ended` 이벤트를 받아 회의록 draft를 생성한 뒤 STT/Summary
 * 파이프라인을 따라 Aggregate(`MeetingReport`)를 진행시키고, 그 결과를
 * 도메인 이벤트로 발행한다(ARCHITECTURE.md §2.4 / §5).
 */

export interface CreateDraftCommand {
  meetingId: string;
  code: string;
  source: Source;
  externalReference: ExternalReference;
  startedAt: Date;
  endedAt: Date;
  participants: ReadonlyArray<ParticipantEntry>;
  chat: ReadonlyArray<ChatEntry>;
  /** 회의 생성 시 지정한 제목. 생략하면 null. */
  title?: string | null;
}

export interface CompleteTranscriptionCommand {
  reportId: string;
  transcript: ReadonlyArray<TranscriptSegment>;
}

export interface FailTranscriptionCommand {
  reportId: string;
  error: string;
}

export interface ReportFinalizationServiceDeps {
  repository: ReportRepository;
  summarizer: SummarizerPort;
  notion: NotionPort;
  idGenerator: ReportIdGenerator;
  clock: Clock;
  eventPublisher: DomainEventPublisher;
}

export class ReportFinalizationService {
  constructor(private readonly deps: ReportFinalizationServiceDeps) {}

  async createDraft(command: CreateDraftCommand): Promise<MeetingReport> {
    const report = MeetingReport.fromEndedMeeting({
      id: this.deps.idGenerator.next(),
      meetingId: command.meetingId,
      code: command.code,
      source: command.source,
      externalReference: command.externalReference,
      startedAt: command.startedAt,
      endedAt: command.endedAt,
      participants: command.participants,
      chat: command.chat,
      title: command.title ?? null,
    });
    await this.deps.repository.save(report);
    // STT 가 speaker 를 nickname 으로 채울 수 있도록 participantId→nickname 매핑을
    // 함께 발행한다(소비처에서 ID 를 재매핑하지 않도록 생산 시점에 전달).
    const participantNames: Record<string, string> = {};
    for (const p of report.participants) {
      participantNames[p.id] = p.nickname;
    }
    await this.deps.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_REQUESTED, {
      reportId: report.id,
      meetingId: report.meetingId,
      code: report.code,
      meetingStartedAtMs: report.startedAt.getTime(),
      participantNames,
    });
    return report;
  }

  async completeTranscription(command: CompleteTranscriptionCommand): Promise<void> {
    const report = await this.requireReport(command.reportId);
    report.applyTranscript(command.transcript);
    await this.deps.repository.save(report);

    try {
      const summary = await this.deps.summarizer.summarize({
        transcript: command.transcript,
        chat: report.chat,
        meta: {
          meetingId: report.meetingId,
          code: report.code,
          startedAt: report.startedAt,
          endedAt: report.endedAt,
        },
      });
      report.applySummary(summary);
      await this.deps.repository.save(report);
      await this.deps.eventPublisher.publish(REPORT_EVENTS.SUMMARY_COMPLETED, {
        reportId: report.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.markSummaryFailed(message, this.deps.clock.now());
      await this.deps.repository.save(report);
    }

    if (report.isFinalized) {
      await this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
        reportId: report.id,
      });
    }
  }

  /**
   * 관리자 재요약. 저장된 transcript+chat 을 SummarizerPort 로 다시 요약해 기존
   * summary 를 교체한다(요약 실패 회의록 재시도 / 새 프롬프트 A/B 비교 용도).
   *
   * 1차 요약이 끝난(done/failed) 회의록만 대상으로 한다. 진행 중(pending)이면
   * `ReportNotResummarizableError`. 결과는 중간 pending 없이 한 번에 done/failed 로
   * 교체하므로 재요약 도중 크래시가 나도 영구 pending 으로 갇히지 않는다.
   */
  async resummarize(reportId: string): Promise<MeetingReport> {
    const report = await this.requireReport(reportId);
    if (report.pipeline.summaryStatus === 'pending') {
      throw new ReportNotResummarizableError(reportId, report.pipeline.summaryStatus);
    }

    try {
      const summary = await this.deps.summarizer.summarize({
        transcript: report.transcript,
        chat: report.chat,
        meta: {
          meetingId: report.meetingId,
          code: report.code,
          startedAt: report.startedAt,
          endedAt: report.endedAt,
        },
      });
      report.replaceSummary(summary);
      await this.deps.repository.save(report);
      await this.deps.eventPublisher.publish(REPORT_EVENTS.SUMMARY_COMPLETED, {
        reportId: report.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.markResummaryFailed(message, this.deps.clock.now());
      await this.deps.repository.save(report);
    }

    // 재요약 대상은 이미 STT 가 끝난 회의록이므로 pipeline 은 항상 final 상태다.
    // 일관성을 위해 1차 파이프라인과 동일하게 finalized 이벤트를 발행한다.
    if (report.isFinalized) {
      await this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
        reportId: report.id,
      });
    }
    return report;
  }

  async listRecent(limit: number): Promise<MeetingReport[]> {
    return this.deps.repository.listRecent(limit);
  }

  async getById(reportId: string): Promise<MeetingReport> {
    return this.requireReport(reportId);
  }

  async failTranscription(command: FailTranscriptionCommand): Promise<void> {
    const report = await this.requireReport(command.reportId);
    const at = this.deps.clock.now();
    report.markTranscriptionFailed(command.error, at);
    // STT가 실패하면 summary 입력이 없으므로 cascade로 종료 처리.
    // 재시도 정책은 v2 운영 단계에서 다룬다(ARCHITECTURE §5).
    report.markSummaryFailed(`Skipped due to transcription failure: ${command.error}`, at);
    await this.deps.repository.save(report);

    if (report.isFinalized) {
      await this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
        reportId: report.id,
      });
    }
  }

  private async requireReport(reportId: string): Promise<MeetingReport> {
    const report = await this.deps.repository.findById(reportId);
    if (!report) {
      throw new ReportNotFoundError(reportId);
    }
    return report;
  }
}
