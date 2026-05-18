import { MEETING_EVENTS } from '@migration/shared-interfaces';

import { MeetingNotFoundError } from '@/meeting/application/meeting.errors';
import { Meeting } from '@/meeting/domain/meeting';
import { Participant } from '@/meeting/domain/participant';
import {
  ChatRepository,
  MeetingCodeGenerator,
  MeetingRepository,
} from '@/meeting/domain/ports';
import { IdleTimeout } from '@/meeting/domain/value-objects';
import { MeetingEndedPayload, MeetingEndedReason } from '@/shared-kernel/domain/events';
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
  participantId: string;
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
    const startedAt = this.deps.clock.now();
    const meeting = Meeting.create({
      code,
      source: command.source,
      externalReference: command.externalReference,
      idleTimeout: IdleTimeout.default(),
      startedAt,
    });
    await this.deps.repository.save(meeting);
    this.deps.eventPublisher.publish(MEETING_EVENTS.CREATED, {
      code: code.value,
      source: command.source,
      startedAt,
    });
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
    this.deps.eventPublisher.publish(MEETING_EVENTS.PARTICIPANT_JOINED, {
      code: command.code,
      participantId: participant.id,
      nickname: participant.nickname,
      joinedAt: participant.joinedAt,
    });
    return { meeting, participant };
  }

  async leaveMeeting(command: LeaveMeetingCommand): Promise<LeaveMeetingResult> {
    const meeting = await this.requireMeeting(command.code);
    const participant = meeting.removeParticipant(
      command.participantId,
      this.deps.clock.now(),
    );
    await this.deps.repository.save(meeting);
    this.deps.eventPublisher.publish(MEETING_EVENTS.PARTICIPANT_LEFT, {
      code: command.code,
      participantId: participant.id,
      leftAt: participant.leftAt,
    });
    return { meeting, participant };
  }

  async postChat(command: PostChatCommand): Promise<ChatEntry> {
    const meeting = await this.requireMeeting(command.code);
    const participant = meeting.findParticipant(command.participantId);
    if (!participant) {
      throw new Error(
        `Participant "${command.participantId}" not found in meeting "${command.code}"`,
      );
    }
    const now = this.deps.clock.now();
    // ChatEntry 검증을 markActive보다 먼저 수행 → 검증 실패 시 Meeting 상태 미변경.
    const entry = chatEntry({ nickname: participant.nickname, text: command.text, sentAt: now });
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
    const payload = await this.buildEndedPayload(meeting, command.code, endedAt, command.reason);
    this.deps.eventPublisher.publish(MEETING_EVENTS.ENDED, payload);
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
    const payload = await this.buildEndedPayload(meeting, command.code, now, 'idle');
    this.deps.eventPublisher.publish(MEETING_EVENTS.ENDED, payload);
    return true;
  }

  private async buildEndedPayload(
    meeting: Meeting,
    code: string,
    endedAt: Date,
    reason: MeetingEndedReason,
  ): Promise<MeetingEndedPayload> {
    const snapshot = meeting.snapshot();
    const chat = await this.deps.chatRepository.listByCode(code);
    return {
      code,
      source: snapshot.source,
      externalReference: snapshot.externalReference,
      startedAt: snapshot.startedAt,
      endedAt,
      reason,
      participants: snapshot.participants,
      chat,
    };
  }

  private async requireMeeting(code: string): Promise<Meeting> {
    const meeting = await this.deps.repository.findByCode(code);
    if (!meeting) {
      throw new MeetingNotFoundError(code);
    }
    return meeting;
  }
}
