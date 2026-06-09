import {
  type ConsumeResponse,
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  type ListProducersResponse,
  MEDIASOUP_EVENTS,
  MEDIASOUP_WS_EVENTS,
  type MediaType,
  type NewProducerBroadcast,
  type ProducerClosedBroadcast,
  type ProduceResponse,
  type ProducerToggledBroadcast,
  type ToggleProducerResponse,
} from '@convene/shared-interfaces';
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

import { MediasoupSignalingService } from '@/mediasoup/application/mediasoup-signaling.service';
import { CloseProducerDto } from '@/mediasoup/interface/dto/close-producer.dto';
import { ConnectTransportDto } from '@/mediasoup/interface/dto/connect-transport.dto';
import { ConsumeDto } from '@/mediasoup/interface/dto/consume.dto';
import { CreateTransportDto } from '@/mediasoup/interface/dto/create-transport.dto';
import { GetRtpCapabilitiesDto } from '@/mediasoup/interface/dto/get-rtp-capabilities.dto';
import { ListProducersDto } from '@/mediasoup/interface/dto/list-producers.dto';
import { ProduceDto } from '@/mediasoup/interface/dto/produce.dto';
import { ResumeConsumerDto } from '@/mediasoup/interface/dto/resume-consumer.dto';
import { ToggleProducerDto } from '@/mediasoup/interface/dto/toggle-producer.dto';

const roomOf = (code: string): string => `meeting:${code}`;

interface ProducerCreatedPayload {
  meetingCode: string;
  participantId: string;
  producerId: string;
  kind: 'audio' | 'video';
  source: MediaType;
  paused?: boolean;
}

/**
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
  ): Promise<{ ok: true }> {
    // ⚠️ Promise<void> 반환 시 NestJS+socket.io 가 ack callback 을 호출하지 않아
    // client emitWithAck 가 영원히 대기한다. 명시 응답 객체 반환 필수.
    try {
      await this.service.connectTransport({
        meetingCode: dto.code,
        participantId: client.id,
        transportId: dto.transportId,
        dtlsParameters: dto.dtlsParameters,
      });
      this.logger.log(
        `[connectTransport] ok (sid=${client.id}, transportId=${dto.transportId})`,
      );
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[connectTransport] FAIL (sid=${client.id}, transportId=${dto.transportId}): ${message}`,
      );
      throw err;
    }
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.PRODUCE)
  async handleProduce(
    @MessageBody() dto: ProduceDto,
    @ConnectedSocket() client: Socket,
  ): Promise<ProduceResponse> {
    try {
      const res = await this.service.produce({
        meetingCode: dto.code,
        participantId: client.id,
        transportId: dto.transportId,
        kind: dto.kind,
        source: dto.source,
        rtpParameters: dto.rtpParameters,
        paused: dto.paused,
      });
      this.logger.log(
        `[produce] ok (sid=${client.id}, kind=${dto.kind}, source=${dto.source}, producerId=${res.producerId})`,
      );
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[produce] FAIL (sid=${client.id}, kind=${dto.kind}): ${message}`,
      );
      throw err;
    }
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.CONSUME)
  async handleConsume(
    @MessageBody() dto: ConsumeDto,
    @ConnectedSocket() client: Socket,
  ): Promise<ConsumeResponse> {
    try {
      const res = await this.service.consume({
        meetingCode: dto.code,
        participantId: client.id,
        transportId: dto.transportId,
        producerId: dto.producerId,
        rtpCapabilities: dto.rtpCapabilities,
      });
      this.logger.log(
        `[consume] ok (sid=${client.id}, producerId=${dto.producerId}, consumerId=${res.id})`,
      );
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[consume] FAIL (sid=${client.id}, producerId=${dto.producerId}): ${message}`,
      );
      throw err;
    }
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.RESUME_CONSUMER)
  async handleResumeConsumer(
    @MessageBody() dto: ResumeConsumerDto,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true }> {
    // Promise<void> 회피 — handleConnectTransport 주석 참조.
    await this.service.resumeConsumer({
      meetingCode: dto.code,
      participantId: client.id,
      consumerId: dto.consumerId,
    });
    return { ok: true };
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

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.TOGGLE_PRODUCER)
  async handleToggleProducer(
    @MessageBody() dto: ToggleProducerDto,
    @ConnectedSocket() client: Socket,
  ): Promise<ToggleProducerResponse> {
    // 소유 검증 + pause/resume 위임. 남의 producerId 면 service 가 throw.
    await this.service.toggleProducer({
      meetingCode: dto.code,
      participantId: client.id,
      producerId: dto.producerId,
      paused: dto.paused,
    });
    // 같은 회의의 다른 참가자에게 mute 상태 변경을 broadcast (본인 제외).
    const broadcast: ProducerToggledBroadcast = {
      producerId: dto.producerId,
      paused: dto.paused,
    };
    this.server
      .to(roomOf(dto.code))
      .except(client.id)
      .emit(MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED, broadcast);
    return { ok: true };
  }

  @SubscribeMessage(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER)
  async handleCloseProducer(
    @MessageBody() dto: CloseProducerDto,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: true }> {
    await this.service.closeProducer({
      meetingCode: dto.code,
      participantId: client.id,
      producerId: dto.producerId,
    });
    // 같은 회의의 다른 참가자에게 producer 종료를 알린다(본인은 이미 닫음).
    const broadcast: ProducerClosedBroadcast = { producerId: dto.producerId };
    this.server
      .to(roomOf(dto.code))
      .except(client.id)
      .emit(MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED, broadcast);
    return { ok: true };
  }

  @OnEvent(MEDIASOUP_EVENTS.PRODUCER_CREATED)
  onProducerCreated(payload: ProducerCreatedPayload): void {
    const room = roomOf(payload.meetingCode);
    const broadcast: NewProducerBroadcast = {
      peerSocketId: payload.participantId,
      producerId: payload.producerId,
      kind: payload.kind,
      source: payload.source,
      // produce 시점의 mute 상태를 그대로 전파(기본 OFF 입장이면 true). 이후 mute 변경은
      // PRODUCER_TOGGLED 로 전파한다.
      paused: payload.paused ?? false,
    };
    this.server
      .to(room)
      .except(payload.participantId)
      .emit(MEDIASOUP_WS_EVENTS.NEW_PRODUCER, broadcast);
  }
}
