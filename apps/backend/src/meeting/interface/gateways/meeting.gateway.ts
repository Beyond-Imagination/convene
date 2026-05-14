import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

import {
  MEETING_WS_EVENTS,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
} from '@migration/shared-interfaces';

import { MeetingService } from '@/meeting/application/meeting.service';
import { JoinMeetingDto } from '@/meeting/interface/dto/join-meeting.dto';
import { LeaveMeetingDto } from '@/meeting/interface/dto/leave-meeting.dto';

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
  }),
)
export class MeetingGateway {
  constructor(private readonly service: MeetingService) {}

  @SubscribeMessage(MEETING_WS_EVENTS.JOIN)
  async handleJoin(
    @MessageBody() dto: JoinMeetingDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { participant } = await this.service.joinMeeting({
      code: dto.code,
      participantId: client.id,
      nickname: dto.nickname,
    });
    const room = roomOf(dto.code);
    await client.join(room);
    const broadcast: ParticipantJoinedBroadcast = {
      socketId: participant.id,
      nickname: participant.nickname,
      joinedAt: participant.joinedAt.toISOString(),
    };
    client.to(room).emit(MEETING_WS_EVENTS.PARTICIPANT_JOINED, broadcast);
  }

  @SubscribeMessage(MEETING_WS_EVENTS.LEAVE)
  async handleLeave(
    @MessageBody() dto: LeaveMeetingDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { participant } = await this.service.leaveMeeting({
      code: dto.code,
      participantId: client.id,
    });
    const room = roomOf(dto.code);
    // broadcast 먼저, 그 뒤 socket.leave — 남은 참가자에게 알림이 가도록 한다.
    const leftAt = participant.leftAt ?? new Date();
    const broadcast: ParticipantLeftBroadcast = {
      socketId: participant.id,
      leftAt: leftAt.toISOString(),
    };
    client.to(room).emit(MEETING_WS_EVENTS.PARTICIPANT_LEFT, broadcast);
    await client.leave(room);
  }
}
