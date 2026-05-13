import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

import { MEETING_WS_EVENTS } from '@migration/shared-interfaces';

import { MeetingService } from '@/meeting/application/meeting.service';
import { JoinMeetingDto } from '@/meeting/interface/dto/join-meeting.dto';

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
    @MessageBody() _dto: JoinMeetingDto,
    @ConnectedSocket() _client: Socket,
  ): Promise<void> {
    void this.service;
    throw new Error('not implemented');
  }
}
