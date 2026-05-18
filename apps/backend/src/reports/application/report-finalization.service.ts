import { MeetingReport } from '@/reports/domain/meeting-report';
import { ParticipantEntry } from '@/reports/domain/entries';
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

  async createDraft(_command: CreateDraftCommand): Promise<MeetingReport> {
    throw new Error('ReportFinalizationService.createDraft not implemented');
  }
}
