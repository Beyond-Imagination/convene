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
} from '@migration/shared-interfaces';

import { MeetingService } from '@/meeting/application/meeting.service';
import { JoinMeetingDto } from '@/meeting/interface/dto/join-meeting.dto';

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
}
