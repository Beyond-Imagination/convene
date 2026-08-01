import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import { MeetingService } from '@/meeting/application/meeting.service';
import { MeetingRepository } from '@/meeting/domain/ports';
import { Clock, DomainEventPublisher, LoggerPort } from '@/shared-kernel/domain/ports';

interface MeetingRecoveryServiceDeps {
  repository: MeetingRepository;
  meetingService: MeetingService;
  clock: Clock;
  eventPublisher: DomainEventPublisher;
  logger: LoggerPort;
}

export interface MeetingRecoveryOutcome {
  /** 훑은 열린 회의 수. */
  readonly scanned: number;
  readonly reopened: number;
  /** 재시작을 넘겨 leave 처리한 참가자 수. */
  readonly detachedParticipants: number;
}

@Injectable()
export class MeetingRecoveryService implements OnApplicationBootstrap {
  constructor(private readonly deps: MeetingRecoveryServiceDeps) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover();
  }

  async recover(): Promise<MeetingRecoveryOutcome> {
    throw new Error('not implemented');
  }
}
