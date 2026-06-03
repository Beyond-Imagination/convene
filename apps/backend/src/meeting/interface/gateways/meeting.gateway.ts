import {
  type ChatPostedBroadcast,
  MEETING_EVENTS,
  MEETING_WS_EVENTS,
  type MeetingEndedBroadcast,
  type MeetingParticipantsBroadcast,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
} from '@convene/shared-interfaces';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { MeetingService } from '@/meeting/application/meeting.service';
import { ChatDto } from '@/meeting/interface/dto/chat.dto';
import { JoinMeetingDto } from '@/meeting/interface/dto/join-meeting.dto';
import { LeaveMeetingDto } from '@/meeting/interface/dto/leave-meeting.dto';
import { MeetingEndedPayload } from '@/shared-kernel/domain/events';

const roomOf = (code: string): string => `meeting:${code}`;

/**
 * Meeting bounded context의 WebSocket Interface layer.
 * Socket.io 단일 네임스페이스에서 `meeting:join`, `meeting:leave`, `meeting:chat`
 * 요청을 처리하고 같은 room에 `meeting:*Broadcast` 이벤트를 emit한다.
 */
@WebSocketGateway()
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // HTTP BadRequestException은 Nest 기본 WsExceptionFilter에 의해
    // 'Internal server error'로 가려져 client에 검증 정보가 전달되지 않는다.
    // WsException으로 명시 변환해 어떤 필드가 잘못됐는지 노출한다.
    // 페이로드의 status: 'error'는 NestJS 기본 fallback 포맷과 동일한 컨벤션.
    exceptionFactory: (errors) =>
      new WsException({
        status: 'error',
        message: 'validation failed',
        errors: errors.map((e) => ({
          property: e.property,
          constraints: e.constraints,
        })),
      }),
  }),
)
export class MeetingGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(MeetingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly service: MeetingService) {}

  @SubscribeMessage(MEETING_WS_EVENTS.JOIN)
  async handleJoin(
    @MessageBody() dto: JoinMeetingDto,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true }> {
    // Promise<void> 는 NestJS socket.io 가 ack 미호출 → emitWithAck 영원 대기.
    const { meeting, participant } = await this.service.joinMeeting({
      code: dto.code,
      participantId: client.id,
      nickname: dto.nickname,
    });
    const room = roomOf(dto.code);
    await client.join(room);
    // handleDisconnect에서 어느 회의 code였는지 복원하기 위해 저장.
    client.data.code = dto.code;
    const broadcast: ParticipantJoinedBroadcast = {
      socketId: participant.id,
      nickname: participant.nickname,
      joinedAt: participant.joinedAt.toISOString(),
    };
    client.to(room).emit(MEETING_WS_EVENTS.PARTICIPANT_JOINED, broadcast);

    // 늦게 입장한 클라이언트가 stale 한 빈 목록을 보지 않도록 본인에게만 기존
    // 참가자 목록을 전달. 자기 자신은 제외.
    const snapshot = meeting.snapshot();
    const existing: MeetingParticipantsBroadcast = {
      participants: snapshot.participants
        .filter((p) => p.id !== participant.id && p.leftAt === null)
        .map((p) => ({
          socketId: p.id,
          nickname: p.nickname,
          joinedAt: p.joinedAt.toISOString(),
        })),
    };
    client.emit(MEETING_WS_EVENTS.PARTICIPANTS, existing);
    return { ok: true };
  }

  @SubscribeMessage(MEETING_WS_EVENTS.LEAVE)
  async handleLeave(
    @MessageBody() dto: LeaveMeetingDto,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true }> {
    const room = roomOf(dto.code);
    try {
      const { participant } = await this.service.leaveMeeting({
        code: dto.code,
        participantId: client.id,
      });
      // broadcast 먼저, 그 뒤 socket.leave — 남은 참가자에게 알림이 가도록 한다.
      const leftAt = participant.leftAt ?? new Date();
      const broadcast: ParticipantLeftBroadcast = {
        socketId: participant.id,
        leftAt: leftAt.toISOString(),
      };
      client.to(room).emit(MEETING_WS_EVENTS.PARTICIPANT_LEFT, broadcast);
    } catch (error) {
      // race: '회의 종료' 직후 다른 탭의 useEffect cleanup 이 leave 를 한 번 더
      // emit 할 수 있다(또는 idle 자동 종료와 leave 충돌). 이미 종료된 회의나
      // 이미 leave 한 참가자에 대한 leave 는 best-effort 로 swallow.
      // handleDisconnect 와 동일 패턴.
      this.logger.debug(
        `handleLeave swallow for code=${dto.code} sid=${client.id}: ${(error as Error).message}`,
      );
    }
    await client.leave(room);
    return { ok: true };
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const code = client.data?.code as string | undefined;
    if (!code) return;
    try {
      const { participant } = await this.service.leaveMeeting({
        code,
        participantId: client.id,
      });
      const room = roomOf(code);
      const leftAt = participant.leftAt ?? new Date();
      const broadcast: ParticipantLeftBroadcast = {
        socketId: participant.id,
        leftAt: leftAt.toISOString(),
      };
      client.to(room).emit(MEETING_WS_EVENTS.PARTICIPANT_LEFT, broadcast);
    } catch (error) {
      // disconnect는 best-effort: 이미 leave했거나 회의가 종료된 경우 swallow.
      this.logger.debug(
        `handleDisconnect swallow for code=${code} sid=${client.id}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Meeting BC 의 `meeting.ended` 도메인 이벤트(수동 종료/idle 자동 종료 공통)를
   * 구독해 같은 room 의 모든 참가자에게 WS `meeting:ended` 를 broadcast 한다.
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
      participantId: client.id,
      text: dto.text,
    });
    const room = roomOf(dto.code);
    const broadcast: ChatPostedBroadcast = {
      nickname: entry.nickname,
      text: entry.text,
      sentAt: entry.sentAt.toISOString(),
    };
    // 자신도 자기 메시지를 받아야 하므로 client.to가 아닌 server.to를 사용.
    this.server.to(room).emit(MEETING_WS_EVENTS.CHAT_POSTED, broadcast);
    return { ok: true };
  }
}
