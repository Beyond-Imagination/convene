import { MEETING_EVENTS } from '@migration/shared-interfaces';

import { Meeting } from '@/meeting/domain/meeting';
import { Participant } from '@/meeting/domain/participant';
import {
  ChatRepository,
  MeetingCodeGenerator,
  MeetingRepository,
} from '@/meeting/domain/ports';
import { IdleTimeout } from '@/meeting/domain/value-objects';
import { Clock, DomainEventPublisher } from '@/shared-kernel/domain/ports';
import {
  ChatEntry,
  chatEntry,
  ExternalReference,
  Source,
} from '@/shared-kernel/domain/value-objects';

/**
 * Meeting Bounded Context의 Application Service.
 *
 * Use case 단위로 도메인 객체를 조립하고 Repository / Clock / CodeGenerator
 * 같은 Port 의존성을 호출한다. 도메인 이벤트 발행도 본 layer에서 수행한다
 * (ARCHITECTURE.md §3).
 */

export interface CreateMeetingCommand {
  source: Source;
  externalReference: ExternalReference;
}

export interface JoinMeetingCommand {
  code: string;
  participantId: string;
  nickname: string;
}

export interface JoinMeetingResult {
  meeting: Meeting;
  participant: Participant;
}

export interface LeaveMeetingCommand {
  code: string;
  participantId: string;
}

export interface LeaveMeetingResult {
  meeting: Meeting;
  participant: Participant;
}

export interface PostChatCommand {
  code: string;
  nickname: string;
  text: string;
}

export type CloseMeetingReason = 'manual' | 'idle';

export interface CloseMeetingCommand {
  code: string;
  reason: CloseMeetingReason;
}

export interface DetectIdleAndCloseCommand {
  code: string;
}

export interface MeetingServiceDeps {
  repository: MeetingRepository;
  chatRepository: ChatRepository;
  codeGenerator: MeetingCodeGenerator;
  clock: Clock;
  eventPublisher: DomainEventPublisher;
}

export class MeetingService {
  constructor(private readonly deps: MeetingServiceDeps) {}

  async createMeeting(command: CreateMeetingCommand): Promise<Meeting> {
    const code = this.deps.codeGenerator.next();
    const meeting = Meeting.create({
      code,
      source: command.source,
      externalReference: command.externalReference,
      idleTimeout: IdleTimeout.default(),
      startedAt: this.deps.clock.now(),
    });
    await this.deps.repository.save(meeting);
    return meeting;
  }

  async joinMeeting(command: JoinMeetingCommand): Promise<JoinMeetingResult> {
    const meeting = await this.requireMeeting(command.code);
    const participant = meeting.addParticipant(
      command.participantId,
      command.nickname,
      this.deps.clock.now(),
    );
    await this.deps.repository.save(meeting);
    return { meeting, participant };
  }

  async leaveMeeting(_command: LeaveMeetingCommand): Promise<LeaveMeetingResult> {
    throw new Error('not implemented');
  }

  async postChat(command: PostChatCommand): Promise<ChatEntry> {
    const meeting = await this.requireMeeting(command.code);
    const now = this.deps.clock.now();
    // ChatEntry 검증을 markActive보다 먼저 수행 → 검증 실패 시 Meeting 상태 미변경.
    const entry = chatEntry({ nickname: command.nickname, text: command.text, sentAt: now });
    meeting.markActive(now);
    await this.deps.chatRepository.append(command.code, entry);
    await this.deps.repository.save(meeting);
    return entry;
  }

  async closeMeeting(command: CloseMeetingCommand): Promise<Meeting> {
    const meeting = await this.requireMeeting(command.code);
    const endedAt = this.deps.clock.now();
    meeting.close(endedAt);
    await this.deps.repository.save(meeting);
    this.deps.eventPublisher.publish(MEETING_EVENTS.ENDED, {
      code: command.code,
      endedAt,
      reason: command.reason,
    });
    return meeting;
  }

  /**
   * idle 스케줄러가 주기적으로 호출하는 멱등 use case.
   * 이미 종료됐거나 idle 조건 미충족이면 no-op(false). idle이면 close + 이벤트 두 건.
   */
  async detectIdleAndClose(command: DetectIdleAndCloseCommand): Promise<boolean> {
    const meeting = await this.requireMeeting(command.code);
    if (!meeting.isOpen) return false;
    const now = this.deps.clock.now();
    if (!meeting.isIdleSince(now)) return false;
    meeting.close(now);
    await this.deps.repository.save(meeting);
    this.deps.eventPublisher.publish(MEETING_EVENTS.IDLE_DETECTED, {
      code: command.code,
      detectedAt: now,
    });
    this.deps.eventPublisher.publish(MEETING_EVENTS.ENDED, {
      code: command.code,
      endedAt: now,
      reason: 'idle',
    });
    return true;
  }

  private async requireMeeting(code: string): Promise<Meeting> {
    const meeting = await this.deps.repository.findByCode(code);
    if (!meeting) {
      throw new Error(`Meeting "${code}" not found`);
    }
    return meeting;
  }
}
