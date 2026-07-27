import { MEETING_EVENTS } from '@convene/shared-interfaces';

import { MeetingNotFoundError, NotHostError } from '@/meeting/application/meeting.errors';
import { Meeting } from '@/meeting/domain/meeting';
import { Participant } from '@/meeting/domain/participant';
import {
  ChatRepository,
  HostTokenGenerator,
  MeetingCodeGenerator,
  MeetingRepository,
} from '@/meeting/domain/ports';
import { IdleTimeout } from '@/meeting/domain/value-objects';
import { MeetingEndedPayload, MeetingEndedReason } from '@/shared-kernel/domain/events';
import { Clock, DomainEventPublisher, LoggerPort } from '@/shared-kernel/domain/ports';
import {
  ChatEntry,
  chatEntry,
  ExternalReference,
  MeetingType,
  Source,
} from '@/shared-kernel/domain/value-objects';

interface MeetingServiceDeps {
  repository: MeetingRepository;
  chatRepository: ChatRepository;
  codeGenerator: MeetingCodeGenerator;
  hostTokenGenerator: HostTokenGenerator;
  clock: Clock;
  eventPublisher: DomainEventPublisher;
  logger: LoggerPort;
}

interface CreateMeetingCommand {
  source: Source;
  meetingType?: MeetingType;
  externalReference: ExternalReference;
  title?: string | null;
}

interface JoinMeetingCommand {
  code: string;
  participantId: string;
  nickname: string;
}

interface JoinMeetingResult {
  meeting: Meeting;
  participant: Participant;
  /** host 권한을 가져간 참가자에게만 준다. 아니면 null. */
  hostToken: string | null;
}

interface LeaveMeetingCommand {
  code: string;
  participantId: string;
}

interface LeaveMeetingResult {
  meeting: Meeting;
  participant: Participant;
}

interface PostChatCommand {
  code: string;
  participantId: string;
  text: string;
}

type CloseMeetingReason = 'manual' | 'idle';

interface CloseMeetingCommand {
  code: string;
  reason: CloseMeetingReason;
  hostToken: string;
}

interface DetectIdleAndCloseCommand {
  code: string;
}

export interface IdleSweepOutcome {
  /** 훑은 열린 회의 수. */
  readonly scanned: number;
  readonly closed: number;
}

export class MeetingService {
  constructor(private readonly deps: MeetingServiceDeps) {}

  async createMeeting(command: CreateMeetingCommand): Promise<Meeting> {
    const code = this.deps.codeGenerator.next();
    const startedAt = this.deps.clock.now();
    const meeting = Meeting.create({
      code,
      source: command.source,
      meetingType: command.meetingType,
      externalReference: command.externalReference,
      idleTimeout: IdleTimeout.default(),
      startedAt,
      hostToken: this.deps.hostTokenGenerator.next(),
      title: command.title ?? null,
    });
    await this.deps.repository.save(meeting);
    await this.deps.eventPublisher.publish(MEETING_EVENTS.CREATED, {
      code: code.value,
      source: command.source,
      startedAt,
    });
    this.deps.logger.info({ meetingCode: code.value, source: command.source }, 'meeting created');
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
    await this.deps.eventPublisher.publish(MEETING_EVENTS.PARTICIPANT_JOINED, {
      code: command.code,
      participantId: participant.id,
      nickname: participant.nickname,
      joinedAt: participant.joinedAt,
    });
    this.deps.logger.info(
      { meetingCode: command.code, participantId: participant.id },
      'participant joined',
    );
    return { meeting, participant, hostToken: null };
  }

  async leaveMeeting(command: LeaveMeetingCommand): Promise<LeaveMeetingResult> {
    const meeting = await this.requireMeeting(command.code);
    const participant = meeting.removeParticipant(command.participantId, this.deps.clock.now());
    await this.deps.repository.save(meeting);
    await this.deps.eventPublisher.publish(MEETING_EVENTS.PARTICIPANT_LEFT, {
      code: command.code,
      participantId: participant.id,
      leftAt: participant.leftAt,
    });
    this.deps.logger.info(
      { meetingCode: command.code, participantId: participant.id },
      'participant left',
    );
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
    const entry = chatEntry({ nickname: participant.nickname, text: command.text, sentAt: now });
    meeting.markActive(now);
    await this.deps.chatRepository.append(command.code, entry);
    await this.deps.repository.save(meeting);
    this.deps.logger.debug(
      { meetingCode: command.code, participantId: command.participantId },
      'chat posted',
    );
    return entry;
  }

  async closeMeeting(command: CloseMeetingCommand): Promise<Meeting> {
    const meeting = await this.requireMeeting(command.code);
    // 수동 종료는 host 토큰을 제시한 요청자만 가능하다. idle 자동 종료는 별도 경로로 처리하므로 본 검증을 거치지 않는다.
    if (!meeting.isHost(command.hostToken)) {
      throw new NotHostError(command.code);
    }
    const endedAt = this.deps.clock.now();
    meeting.close(endedAt);
    await this.deps.repository.save(meeting);
    const payload = await this.buildEndedPayload(meeting, command.code, endedAt, command.reason);
    await this.deps.eventPublisher.publish(MEETING_EVENTS.ENDED, payload);
    this.deps.logger.info({ meetingCode: command.code, reason: command.reason }, 'meeting closed');
    return meeting;
  }

  /**
   * 열린 회의를 한 번 훑어 idle인 회의를 닫는다. 스케줄러가 주기적으로 호출한다.
   * 한 회의의 실패가 나머지 순회를 막지 않는다.
   */
  async sweepIdleMeetings(): Promise<IdleSweepOutcome> {
    const codes = await this.deps.repository.listOpenCodes();
    let closed = 0;
    for (const code of codes) {
      try {
        if (await this.detectIdleAndClose({ code })) closed += 1;
      } catch (error) {
        this.deps.logger.error({ meetingCode: code, err: error }, 'idle 판정 실패');
      }
    }
    return { scanned: codes.length, closed };
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
    await this.deps.eventPublisher.publish(MEETING_EVENTS.IDLE_DETECTED, {
      code: command.code,
      detectedAt: now,
    });
    const payload = await this.buildEndedPayload(meeting, command.code, now, 'idle');
    await this.deps.eventPublisher.publish(MEETING_EVENTS.ENDED, payload);
    this.deps.logger.info({ meetingCode: command.code }, 'meeting closed by idle timeout');
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
      meetingType: snapshot.meetingType,
      externalReference: snapshot.externalReference,
      startedAt: snapshot.startedAt,
      endedAt,
      reason,
      participants: snapshot.participants,
      chat,
      title: snapshot.title,
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
