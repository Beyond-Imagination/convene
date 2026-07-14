import { REPORT_EVENTS } from '@convene/shared-interfaces';

import { ParticipantEntry, TranscriptSegment } from '@/reports/domain/entries';
import { MeetingReport } from '@/reports/domain/meeting-report';
import {
  NotionPort,
  ReportIdGenerator,
  ReportRepository,
  SummarizerPort,
} from '@/reports/domain/ports';
import { Clock, DomainEventPublisher, LoggerPort } from '@/shared-kernel/domain/ports';
import {
  ChatEntry,
  ExternalReference,
  MeetingType,
  Source,
} from '@/shared-kernel/domain/value-objects';

import { ReportNotFoundError, ReportNotResummarizableError } from './report.errors';

interface ReportFinalizationServiceDeps {
  repository: ReportRepository;
  summarizer: SummarizerPort;
  notion: NotionPort;
  idGenerator: ReportIdGenerator;
  clock: Clock;
  eventPublisher: DomainEventPublisher;
  logger: LoggerPort;
}

export interface CreateDraftCommand {
  meetingId: string;
  code: string;
  source: Source;
  meetingType: MeetingType;
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

/**
 * 회의록 생성·후처리 파이프라인을 처리하는 서비스.
 *
 * `meeting.ended` 이벤트를 받아 회의록 draft를 생성한 뒤 STT/Summary 파이프라인을 따라 `MeetingReport`를 진행시키고,
 * 그 결과를 도메인 이벤트로 발행한다.
 */
export class ReportFinalizationService {
  constructor(private readonly deps: ReportFinalizationServiceDeps) {}

  async createDraft(command: CreateDraftCommand): Promise<MeetingReport> {
    const report = MeetingReport.fromEndedMeeting({
      id: this.deps.idGenerator.next(),
      meetingId: command.meetingId,
      code: command.code,
      source: command.source,
      meetingType: command.meetingType,
      externalReference: command.externalReference,
      startedAt: command.startedAt,
      endedAt: command.endedAt,
      participants: command.participants,
      chat: command.chat,
      title: command.title ?? null,
    });
    await this.deps.repository.save(report);
    // STT가 speaker를 nickname으로 채울 수 있도록 participantId→nickname 매핑을 함께 발행한다.
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
    this.deps.logger.info(
      { reportId: report.id, meetingCode: report.code },
      'report draft created',
    );
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
      this.deps.logger.info({ reportId: report.id }, 'report summary completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.markSummaryFailed(message, this.deps.clock.now());
      await this.deps.repository.save(report);
      this.deps.logger.error({ reportId: report.id, err }, 'report summary failed');
    }

    if (report.isFinalized) {
      await this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
        reportId: report.id,
      });
      this.deps.logger.info({ reportId: report.id }, 'report finalized');
    }
  }

  /**
   * 관리자 재요약. 저장된 transcript+chat을 SummarizerPort로 다시 요약해 기존 summary를 교체한다.
   *
   * 재요약 조건:
   *  - STT 완료로 transcript가 있고, 1차 요약이 끝난 (summaryStatus=done/failed) 회의록.
   *  - STT가 실패/미완료면 transcript가 비어 빈 입력으로 LLM을 호출하게 되므로 거부하고, 요약이 진행 중이어도 거부한다
   *    (둘 다 `ReportNotResummarizableError` → 409).
   *
   * 실패 시 **상태를 바꾸거나 저장하지 않는다** — 이미 done 이던 회의록이 일시적 LLM 장애로 "요약 실패" 로 보이는 문제를 막기 위함이다.
   */
  async resummarize(reportId: string): Promise<MeetingReport> {
    const report = await this.requireReport(reportId);
    if (report.pipeline.sttStatus !== 'done') {
      throw new ReportNotResummarizableError(
        reportId,
        `STT가 완료되지 않아(sttStatus=${report.pipeline.sttStatus}) 재요약할 transcript가 없습니다`,
      );
    }
    if (report.pipeline.summaryStatus === 'pending') {
      throw new ReportNotResummarizableError(
        reportId,
        '요약이 진행 중입니다(summaryStatus=pending)',
      );
    }

    // summarize 실패는 catch 하지 않고 전파한다.
    // 이 시점 이전에는 어떤 상태 변경/저장도 하지 않았으므로 기존 회의록 상태(done/failed)는 그대로 보존된다.
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
    // 재요약 대상은 이미 STT가 끝난 회의록이므로 pipeline은 항상 final 상태다.
    // 1차 파이프라인과 동일하게 finalized 이벤트를 발행한다.
    await this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
      reportId: report.id,
    });
    this.deps.logger.info({ reportId }, 'report resummarized');
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
    // STT가 실패하면 summary 입력이 없으므로 cascade로 종료 처리(재시도 없음).
    report.markSummaryFailed(`Skipped due to transcription failure: ${command.error}`, at);
    await this.deps.repository.save(report);
    this.deps.logger.warn(
      { reportId: command.reportId, error: command.error },
      'report transcription failed',
    );

    if (report.isFinalized) {
      await this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
        reportId: report.id,
      });
      this.deps.logger.info({ reportId: report.id }, 'report finalized');
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
