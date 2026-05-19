import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import {
  MEDIASOUP_EVENTS,
  MEDIASOUP_WS_EVENTS,
  type ConsumeResponse,
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  type ListProducersResponse,
  type MediaType,
  type NewProducerBroadcast,
  type ProduceResponse,
} from '@migration/shared-interfaces';

import { MediasoupSignalingService } from '@/mediasoup/application/mediasoup-signaling.service';
import { ConnectTransportDto } from '@/mediasoup/interface/dto/connect-transport.dto';
import { ConsumeDto } from '@/mediasoup/interface/dto/consume.dto';
import { CreateTransportDto } from '@/mediasoup/interface/dto/create-transport.dto';
import { GetRtpCapabilitiesDto } from '@/mediasoup/interface/dto/get-rtp-capabilities.dto';
import { ListProducersDto } from '@/mediasoup/interface/dto/list-producers.dto';
import { ProduceDto } from '@/mediasoup/interface/dto/produce.dto';
import { ResumeConsumerDto } from '@/mediasoup/interface/dto/resume-consumer.dto';

const roomOf = (code: string): string => `meeting:${code}`;

interface ProducerCreatedPayload {
  meetingCode: string;
  participantId: string;
  producerId: string;
  kind: 'audio' | 'video';
  source: MediaType;
}

/**
 * Mediasoup bounded context 의 WebSocket Interface layer.
 * mediasoup:* RPC 6 개 핸들러 + `mediasoup.producer.created` 도메인 이벤트 구독.
 *
 * Meeting BC 의 `MeetingGateway` 와 동일한 socket.io 네임스페이스(/)를 공유한다.
 * 회의 room 이름은 `roomOf(code)` 로 양쪽이 일관되게 사용.
 */
@WebSocketGateway()
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
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
export class MediasoupGateway {
  private readonly logger = new Logger(MediasoupGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly service: MediasoupSignalingService) {}

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES)
  async handleGetRtpCapabilities(
    @MessageBody() dto: GetRtpCapabilitiesDto,
    @ConnectedSocket() _client: Socket,
  ): Promise<GetRtpCapabilitiesResponse> {
    const rtpCapabilities = await this.service.getRtpCapabilities({ meetingCode: dto.code });
    return { rtpCapabilities };
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT)
  async handleCreateTransport(
    @MessageBody() dto: CreateTransportDto,
    @ConnectedSocket() client: Socket,
  ): Promise<CreateTransportResponse> {
    return this.service.createTransport({
      meetingCode: dto.code,
      participantId: client.id,
      direction: dto.direction,
    });
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT)
  async handleConnectTransport(
    @MessageBody() dto: ConnectTransportDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.service.connectTransport({
      meetingCode: dto.code,
      participantId: client.id,
      transportId: dto.transportId,
      dtlsParameters: dto.dtlsParameters,
    });
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.PRODUCE)
  async handleProduce(
    @MessageBody() dto: ProduceDto,
    @ConnectedSocket() client: Socket,
  ): Promise<ProduceResponse> {
    return this.service.produce({
      meetingCode: dto.code,
      participantId: client.id,
      transportId: dto.transportId,
      kind: dto.kind,
      source: dto.source,
      rtpParameters: dto.rtpParameters,
    });
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.CONSUME)
  async handleConsume(
    @MessageBody() dto: ConsumeDto,
    @ConnectedSocket() client: Socket,
  ): Promise<ConsumeResponse> {
    return this.service.consume({
      meetingCode: dto.code,
      participantId: client.id,
      transportId: dto.transportId,
      producerId: dto.producerId,
      rtpCapabilities: dto.rtpCapabilities,
    });
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.RESUME_CONSUMER)
  async handleResumeConsumer(
    @MessageBody() dto: ResumeConsumerDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.service.resumeConsumer({
      meetingCode: dto.code,
      participantId: client.id,
      consumerId: dto.consumerId,
    });
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.LIST_PRODUCERS)
  async handleListProducers(
    @MessageBody() dto: ListProducersDto,
    @ConnectedSocket() client: Socket,
  ): Promise<ListProducersResponse> {
    return this.service.listProducers({
      meetingCode: dto.code,
      participantId: client.id,
    });
  }

  @OnEvent(MEDIASOUP_EVENTS.PRODUCER_CREATED)
  onProducerCreated(payload: ProducerCreatedPayload): void {
    const room = roomOf(payload.meetingCode);
    const broadcast: NewProducerBroadcast = {
      peerSocketId: payload.participantId,
      producerId: payload.producerId,
      kind: payload.kind,
      source: payload.source,
    };
    this.server
      .to(room)
      .except(payload.participantId)
      .emit(MEDIASOUP_WS_EVENTS.NEW_PRODUCER, broadcast);
  }
}
