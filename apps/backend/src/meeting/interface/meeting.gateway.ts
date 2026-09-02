import {
  type ChatPostedBroadcast,
  type JoinMeetingRejectReason,
  type JoinMeetingResponse,
  MEETING_EVENTS,
  MEETING_WS_EVENTS,
  type MeetingEndedBroadcast,
  type MeetingParticipantsBroadcast,
  type ParticipantDisconnectedBroadcast,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
  type ParticipantReconnectedBroadcast,
} from '@convene/shared-interfaces';
import { UsePipes } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Server, Socket } from 'socket.io';

import {
  MeetingClosedError,
  MeetingNotFoundError,
  NicknameTakenError,
} from '@/meeting/application/meeting.errors';
import { JoinMeetingResult, MeetingService } from '@/meeting/application/meeting.service';
import { ChatDto, JoinMeetingDto, LeaveMeetingDto } from '@/meeting/interface/meeting.dto';
import { MeetingEndedPayload } from '@/shared-kernel/domain/domain-event.payloads';
import { wsValidationPipe } from '@/shared-kernel/interface/ws-validation.pipe';

const roomOf = (code: string): string => `meeting:${code}`;

const rejectReasonOf = (error: unknown): JoinMeetingRejectReason | null => {
  if (error instanceof MeetingNotFoundError) return 'not-found';
  if (error instanceof MeetingClosedError) return 'closed';
  if (error instanceof NicknameTakenError) return 'nickname-taken';
  return null;
};

interface ParticipantJoinedPayload {
  code: string;
  participantId: string;
  nickname: string;
  joinedAt: Date;
}
interface ParticipantLeftPayload {
  code: string;
  participantId: string;
  leftAt: Date | null;
}
interface ParticipantDisconnectedPayload {
  code: string;
  participantId: string;
  disconnectedAt: Date;
}
interface ParticipantReconnectedPayload {
  code: string;
  participantId: string;
  reconnectedAt: Date;
}

/**
 * Socket.io 단일 네임스페이스에서 `meeting:join`, `meeting:leave`, `meeting:chat` 요청을 처리하고
 * 같은 room에 `meeting:*Broadcast` 이벤트를 emit한다.
 *
 * 참가자 broadcast는 전부 도메인 이벤트 구독으로 나간다 — 유예 만료처럼 스케줄러가 일으킨 변화도
 * 같은 경로로 클라이언트에 닿아야 한다.
 */
@WebSocketGateway()
@UsePipes(wsValidationPipe())
export class MeetingGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly service: MeetingService,
    @InjectPinoLogger(MeetingGateway.name) private readonly logger: PinoLogger,
  ) {}

  @SubscribeMessage(MEETING_WS_EVENTS.JOIN)
  async handleJoin(
    @MessageBody() dto: JoinMeetingDto,
    @ConnectedSocket() client: Socket,
  ): Promise<JoinMeetingResponse> {
    // Promise<void> 는 NestJS socket.io가 ack 미호출 → emitWithAck 영원 대기.
    const participantId = dto.participantId ?? client.id;
    let joined: JoinMeetingResult;
    try {
      joined = await this.service.joinMeeting({
        code: dto.code,
        participantId,
        connectionId: client.id,
        nickname: dto.nickname,
      });
    } catch (error) {
      const reason = rejectReasonOf(error);
      if (reason === null) throw error;
      this.logger.info({ meetingCode: dto.code, participantId, reason }, 'join rejected');
      return { ok: false, reason };
    }
    const { meeting, participant, hostToken, reconnected, chat } = joined;
    await client.join(roomOf(dto.code));
    // socket.id가 바뀌어도 이 참가자를 지목·제외할 수 있게 하는 room.
    await client.join(participantId);
    // handleDisconnect에서 어느 회의·참가자였는지 복원하기 위해 저장.
    client.data.code = dto.code;
    client.data.participantId = participantId;

    // 늦게 입장한 클라이언트가 stale 한 빈 목록을 보지 않도록 본인에게만 기존
    // 참가자 목록을 전달. 자기 자신은 제외.
    const snapshot = meeting.snapshot();
    const existing: MeetingParticipantsBroadcast = {
      participants: snapshot.participants
        .filter((p) => p.id !== participant.id && p.leftAt === null)
        .map((p) => ({
          participantId: p.id,
          nickname: p.nickname,
          joinedAt: p.joinedAt.toISOString(),
          disconnected: p.disconnectedAt != null,
        })),
    };
    client.emit(MEETING_WS_EVENTS.PARTICIPANTS, existing);
    return {
      ok: true,
      hostToken,
      participantId: participant.id,
      reconnected,
      chat: chat.map((entry) => ({
        nickname: entry.nickname,
        text: entry.text,
        sentAt: entry.sentAt.toISOString(),
      })),
    };
  }

  @SubscribeMessage(MEETING_WS_EVENTS.LEAVE)
  async handleLeave(
    @MessageBody() dto: LeaveMeetingDto,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true }> {
    const participantId = this.participantIdOf(client);
    // await 사이에 소켓이 닫히면 handleDisconnect가 leave 이전 상태를 따로 읽어 되살린다.
    // 먼저 비워 그 경로를 닫는다.
    client.data.code = undefined;
    try {
      await this.service.leaveMeeting({ code: dto.code, participantId });
    } catch (error) {
      // race: '회의 종료' 직후 다른 탭의 useEffect cleanup이 leave를 한 번 더
      // emit 할 수 있다(또는 idle 자동 종료와 leave 충돌). 이미 종료된 회의나
      // 이미 leave 한 참가자에 대한 leave는 best-effort로 swallow.
      this.logger.debug(
        { meetingCode: dto.code, participantId, err: error },
        'handleLeave swallowed',
      );
    }
    await client.leave(roomOf(dto.code));
    await client.leave(participantId);
    return { ok: true };
  }

  /** 퇴장으로 확정하지 않고 유예 대기로 넘긴다. 만료는 idle 스케줄러가 확정한다. */
  async handleDisconnect(client: Socket): Promise<void> {
    const code = client.data?.code as string | undefined;
    if (!code) return;
    try {
      await this.service.disconnectParticipant({ code, connectionId: client.id });
    } catch (error) {
      this.logger.debug(
        { meetingCode: code, connectionId: client.id, err: error },
        'handleDisconnect swallowed',
      );
    }
  }

  @OnEvent(MEETING_EVENTS.PARTICIPANT_JOINED)
  onParticipantJoined(payload: ParticipantJoinedPayload): void {
    const broadcast: ParticipantJoinedBroadcast = {
      participantId: payload.participantId,
      nickname: payload.nickname,
      joinedAt: payload.joinedAt.toISOString(),
    };
    this.broadcast(payload.code, MEETING_WS_EVENTS.PARTICIPANT_JOINED, broadcast, payload.participantId);
  }

  @OnEvent(MEETING_EVENTS.PARTICIPANT_LEFT)
  onParticipantLeft(payload: ParticipantLeftPayload): void {
    const broadcast: ParticipantLeftBroadcast = {
      participantId: payload.participantId,
      leftAt: (payload.leftAt ?? new Date()).toISOString(),
    };
    this.broadcast(payload.code, MEETING_WS_EVENTS.PARTICIPANT_LEFT, broadcast, payload.participantId);
  }

  @OnEvent(MEETING_EVENTS.PARTICIPANT_DISCONNECTED)
  onParticipantDisconnected(payload: ParticipantDisconnectedPayload): void {
    const broadcast: ParticipantDisconnectedBroadcast = {
      participantId: payload.participantId,
      disconnectedAt: payload.disconnectedAt.toISOString(),
    };
    this.broadcast(
      payload.code,
      MEETING_WS_EVENTS.PARTICIPANT_DISCONNECTED,
      broadcast,
      payload.participantId,
    );
  }

  @OnEvent(MEETING_EVENTS.PARTICIPANT_RECONNECTED)
  onParticipantReconnected(payload: ParticipantReconnectedPayload): void {
    const broadcast: ParticipantReconnectedBroadcast = {
      participantId: payload.participantId,
      reconnectedAt: payload.reconnectedAt.toISOString(),
    };
    this.broadcast(
      payload.code,
      MEETING_WS_EVENTS.PARTICIPANT_RECONNECTED,
      broadcast,
      payload.participantId,
    );
  }

  /**
   * Meeting BC의 `meeting.ended` 도메인 이벤트(수동 종료/idle 자동 종료 공통)를
   * 구독해 같은 room의 모든 참가자에게 WS `meeting:ended`를 broadcast 한다.
   *
   * 종료를 직접 트리거한 본인은 이미 socket.disconnect 한 뒤이므로 본 이벤트를
   * 받지 않고, 나머지 참가자만 받아 자동으로 회의 화면을 떠난다(frontend
   * useMeetingViewModel).
   */
  @OnEvent(MEETING_EVENTS.ENDED)
  onMeetingEnded(payload: MeetingEndedPayload): void {
    const broadcast: MeetingEndedBroadcast = {
      code: payload.code,
      endedAt: payload.endedAt.toISOString(),
    };
    this.server.to(roomOf(payload.code)).emit(MEETING_WS_EVENTS.ENDED, broadcast);
  }

  @SubscribeMessage(MEETING_WS_EVENTS.CHAT)
  async handleChat(
    @MessageBody() dto: ChatDto,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true }> {
    const entry = await this.service.postChat({
      code: dto.code,
      participantId: this.participantIdOf(client),
      text: dto.text,
    });
    const broadcast: ChatPostedBroadcast = {
      nickname: entry.nickname,
      text: entry.text,
      sentAt: entry.sentAt.toISOString(),
    };
    // 자신도 자기 메시지를 받아야 하므로 except 없이 room 전체에 보낸다.
    this.server.to(roomOf(dto.code)).emit(MEETING_WS_EVENTS.CHAT_POSTED, broadcast);
    return { ok: true };
  }

  /** join 이전 요청이나 구버전 클라이언트는 socket.id를 신원으로 쓴다. */
  private participantIdOf(client: Socket): string {
    return (client.data?.participantId as string | undefined) ?? client.id;
  }

  private broadcast(
    code: string,
    event: string,
    payload: unknown,
    exceptParticipantId: string,
  ): void {
    this.server.to(roomOf(code)).except(exceptParticipantId).emit(event, payload);
  }
}
