import { randomUUID } from 'node:crypto';

import { MEETING_EVENTS } from '@convene/shared-interfaces';
import { Inject, Injectable } from '@nestjs/common';

import { MeetingNotFoundError, NotHostError } from '@/meeting/application/meeting.errors';
import { Meeting } from '@/meeting/domain/meeting';
import { Participant } from '@/meeting/domain/participant';
import { CHAT_REPOSITORY, ChatRepository } from '@/meeting/domain/ports/chat.repository';
import { MEETING_REPOSITORY, MeetingRepository } from '@/meeting/domain/ports/meeting.repository';
import { IdleTimeout } from '@/meeting/domain/value-objects/idle-timeout';
import { RandomMeetingCodeGenerator } from '@/meeting/infrastructure/random-meeting-code.generator';
import { MeetingEndedPayload, MeetingEndedReason } from '@/shared-kernel/domain/domain-event.payloads';
import { ChatEntry, chatEntry } from '@/shared-kernel/domain/value-objects/chat-entry';
import { ExternalReference } from '@/shared-kernel/domain/value-objects/external-reference';
import { MeetingType } from '@/shared-kernel/domain/value-objects/meeting-type';
import { Source } from '@/shared-kernel/domain/value-objects/source';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/** 다른 BC가 회의를 생성할 때 쓰는 입력. Meeting Aggregate를 노출하지 않는다. */
export interface CreateMeetingInput {
  readonly source: Source;
  readonly meetingType?: MeetingType;
  readonly externalReference: ExternalReference;
  readonly title?: string | null;
  /** true면 코드·링크만 발급하고 방은 첫 참가자가 들어올 때 열린다. */
  readonly scheduled?: boolean;
}

export interface CreatedMeeting {
  readonly code: string;
  readonly hostToken: string;
  readonly startedAt: Date;
}

interface CreateMeetingCommand {
  source: Source;
  meetingType?: MeetingType;
  externalReference: ExternalReference;
  title?: string | null;
  /** true면 코드만 발급하고 방은 첫 참가자가 들어올 때 연다. */
  scheduled?: boolean;
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

@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_REPOSITORY) private readonly repository: MeetingRepository,
    @Inject(CHAT_REPOSITORY) private readonly chatRepository: ChatRepository,
    private readonly codeGenerator: RandomMeetingCodeGenerator,
    private readonly clock: SystemClock,
    private readonly eventPublisher: NestEventBusDomainEventPublisher,
    private readonly logger: PinoLoggerAdapter,
  ) {}

  /** 다른 BC(notion 등)가 회의를 생성하는 진입점. */
  async create(input: CreateMeetingInput): Promise<CreatedMeeting> {
    const meeting = await this.createMeeting({
      source: input.source,
      meetingType: input.meetingType,
      externalReference: input.externalReference,
      title: input.title ?? null,
      scheduled: input.scheduled,
    });
    return {
      code: meeting.code.value,
      hostToken: meeting.hostToken,
      startedAt: meeting.startedAt,
    };
  }

  async createMeeting(command: CreateMeetingCommand): Promise<Meeting> {
    const code = this.codeGenerator.next();
    const now = this.clock.now();
    const input = {
      code,
      source: command.source,
      meetingType: command.meetingType,
      externalReference: command.externalReference,
      idleTimeout: IdleTimeout.default(),
      hostToken: randomUUID(),
      title: command.title ?? null,
    };
    // 예약 회의는 코드만 발급하고 방은 첫 참가자가 열게 둔다. 아무도 오지 않는 동안
    // 미디어 리소스를 잡지 않고 idle 만료로 죽지도 않는다.
    const meeting = command.scheduled
      ? Meeting.createScheduled({ ...input, createdAt: now })
      : Meeting.create({ ...input, startedAt: now });
    await this.repository.save(meeting);
    await this.eventPublisher.publish(MEETING_EVENTS.CREATED, {
      code: code.value,
      source: command.source,
      startedAt: now,
    });
    if (meeting.isOpen) {
      await this.eventPublisher.publish(MEETING_EVENTS.OPENED, { code: code.value });
    }
    this.logger.info(
      { meetingCode: code.value, source: command.source, status: meeting.status },
      'meeting created',
    );
    return meeting;
  }

  /** 입장하지 않고 상태만 읽는다. 종료된 회의도 그대로 돌려준다(카드에 "종료됨"을 보여야 한다). */
  async getMeeting(code: string): Promise<Meeting> {
    return this.requireMeeting(code);
  }

  async joinMeeting(command: JoinMeetingCommand): Promise<JoinMeetingResult> {
    const meeting = await this.requireMeeting(command.code);
    // 빈 방에 들어오는 사람이 방장이 된다. 노션이 만든 회의는 생성자(백엔드)가 접속하지 않아
    // 이 승격이 없으면 아무도 회의를 종료할 수 없다.
    const claimsHost = meeting.activeParticipantCount === 0;
    const wasScheduled = meeting.status === 'scheduled';
    const participant = meeting.addParticipant(
      command.participantId,
      command.nickname,
      this.clock.now(),
    );
    await this.repository.save(meeting);
    // 참가자 입장을 알리기 전에 방부터 연다(미디어 리소스가 먼저 준비돼야 한다).
    if (wasScheduled) {
      await this.eventPublisher.publish(MEETING_EVENTS.OPENED, { code: command.code });
    }
    await this.eventPublisher.publish(MEETING_EVENTS.PARTICIPANT_JOINED, {
      code: command.code,
      participantId: participant.id,
      nickname: participant.nickname,
      joinedAt: participant.joinedAt,
    });
    this.logger.info(
      { meetingCode: command.code, participantId: participant.id },
      'participant joined',
    );
    return { meeting, participant, hostToken: claimsHost ? meeting.hostToken : null };
  }

  async leaveMeeting(command: LeaveMeetingCommand): Promise<LeaveMeetingResult> {
    const meeting = await this.requireMeeting(command.code);
    const participant = meeting.removeParticipant(command.participantId, this.clock.now());
    await this.repository.save(meeting);
    await this.eventPublisher.publish(MEETING_EVENTS.PARTICIPANT_LEFT, {
      code: command.code,
      participantId: participant.id,
      leftAt: participant.leftAt,
    });
    this.logger.info(
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
    const now = this.clock.now();
    const entry = chatEntry({ nickname: participant.nickname, text: command.text, sentAt: now });
    meeting.markActive(now);
    await this.chatRepository.append(command.code, entry);
    await this.repository.save(meeting);
    this.logger.debug(
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
    const endedAt = this.clock.now();
    meeting.close(endedAt);
    await this.repository.save(meeting);
    const payload = await this.buildEndedPayload(meeting, command.code, endedAt, command.reason);
    await this.eventPublisher.publish(MEETING_EVENTS.ENDED, payload);
    this.logger.info({ meetingCode: command.code, reason: command.reason }, 'meeting closed');
    return meeting;
  }

  /**
   * 열린 회의를 한 번 훑어 idle인 회의를 닫는다. 스케줄러가 주기적으로 호출한다.
   * 한 회의의 실패가 나머지 순회를 막지 않는다.
   */
  async sweepIdleMeetings(): Promise<IdleSweepOutcome> {
    const codes = await this.repository.listOpenCodes();
    let closed = 0;
    for (const code of codes) {
      try {
        if (await this.detectIdleAndClose({ code })) closed += 1;
      } catch (error) {
        this.logger.error({ meetingCode: code, err: error }, 'idle 판정 실패');
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
    const now = this.clock.now();
    if (!meeting.isIdleSince(now)) return false;
    meeting.close(now);
    await this.repository.save(meeting);
    await this.eventPublisher.publish(MEETING_EVENTS.IDLE_DETECTED, {
      code: command.code,
      detectedAt: now,
    });
    const payload = await this.buildEndedPayload(meeting, command.code, now, 'idle');
    await this.eventPublisher.publish(MEETING_EVENTS.ENDED, payload);
    this.logger.info({ meetingCode: command.code }, 'meeting closed by idle timeout');
    return true;
  }

  private async buildEndedPayload(
    meeting: Meeting,
    code: string,
    endedAt: Date,
    reason: MeetingEndedReason,
  ): Promise<MeetingEndedPayload> {
    const snapshot = meeting.snapshot();
    const chat = await this.chatRepository.listByCode(code);
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
    const meeting = await this.repository.findByCode(code);
    if (!meeting) {
      throw new MeetingNotFoundError(code);
    }
    return meeting;
  }
}
