import { REPORT_EVENTS } from '@migration/shared-interfaces';

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

import { ReportNotFoundError } from './report.errors';

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
    });
    await this.deps.repository.save(report);
    this.deps.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_REQUESTED, {
      reportId: report.id,
      meetingId: report.meetingId,
      code: report.code,
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
      this.deps.eventPublisher.publish(REPORT_EVENTS.SUMMARY_COMPLETED, {
        reportId: report.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.markSummaryFailed(message, this.deps.clock.now());
      await this.deps.repository.save(report);
    }

    if (report.isFinalized) {
      this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
        reportId: report.id,
      });
    }
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
      this.deps.eventPublisher.publish(REPORT_EVENTS.FINALIZED, {
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
