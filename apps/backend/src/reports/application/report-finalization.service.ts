import { REPORT_EVENTS } from '@migration/shared-interfaces';

import { ParticipantEntry } from '@/reports/domain/entries';
import { MeetingReport } from '@/reports/domain/meeting-report';
import {
  NotionPort,
  ReportIdGenerator,
  ReportRepository,
  SummarizerPort,
} from '@/reports/domain/ports';
import { Clock, DomainEventPublisher } from '@/shared-kernel/domain/ports';
import { ChatEntry, ExternalReference, Source } from '@/shared-kernel/domain/value-objects';

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
}
