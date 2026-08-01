import { MEETING_EVENTS } from '@convene/shared-interfaces';
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

const NOTHING_RECOVERED: MeetingRecoveryOutcome = {
  scanned: 0,
  reopened: 0,
  detachedParticipants: 0,
};

/**
 * 재시작 후 redis에 남아 있는 열린 회의를 지금 프로세스와 다시 맞춘다.
 */
@Injectable()
export class MeetingRecoveryService implements OnApplicationBootstrap {
  constructor(private readonly deps: MeetingRecoveryServiceDeps) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover();
  }

  async recover(): Promise<MeetingRecoveryOutcome> {
    let codes: string[];
    try {
      codes = await this.deps.repository.listOpenCodes();
    } catch (error) {
      this.deps.logger.error({ err: error }, '회의 복구를 위한 열린 회의 조회 실패');
      return NOTHING_RECOVERED;
    }

    let reopened = 0;
    let detachedParticipants = 0;
    for (const code of codes) {
      try {
        const detached = await this.recoverOne(code);
        if (detached === null) continue;
        reopened += 1;
        detachedParticipants += detached;
      } catch (error) {
        this.deps.logger.error({ meetingCode: code, err: error }, '회의 복구 실패');
      }
    }

    if (reopened > 0) {
      this.deps.logger.info(
        { scanned: codes.length, reopened, detachedParticipants },
        '재시작 후 회의 복구',
      );
    }
    return { scanned: codes.length, reopened, detachedParticipants };
  }

  /** 복구 대상이 아니면 null, 맞으면 떼어낸 유령 참가자 수. */
  private async recoverOne(code: string): Promise<number | null> {
    const meeting = await this.deps.repository.findByCode(code);
    if (meeting === null || !meeting.isOpen) return null;

    await this.deps.eventPublisher.publish(MEETING_EVENTS.OPENED, { code });

    const ghosts = meeting
      .snapshot()
      .participants.filter((p) => p.leftAt === null)
      .map((p) => p.id);
    for (const participantId of ghosts) {
      await this.deps.meetingService.leaveMeeting({ code, participantId });
    }
    // 유령이 있었다 = 재시작 직전까지 사람이 있었다. 재접속에 idleTimeout 만큼의 유예를 준다.
    // 이미 비어 있던 회의는 그대로 둬 다음 idle sweep에 정리되게 한다.
    if (ghosts.length > 0) {
      await this.extendIdleWindow(code);
    }
    return ghosts.length;
  }

  private async extendIdleWindow(code: string): Promise<void> {
    // leave 유스케이스가 저장한 최신 상태를 다시 읽는다.
    const meeting = await this.deps.repository.findByCode(code);
    if (meeting === null || !meeting.isOpen) return;
    meeting.markActive(this.deps.clock.now());
    await this.deps.repository.save(meeting);
  }
}
