import { ConsumeResponse, CreateTransportResponse } from '@migration/shared-interfaces';
import { Logger } from '@nestjs/common';
import {
  Consumer,
  DtlsParameters,
  Producer,
  RtpCapabilities,
  RtpParameters,
  WebRtcTransport,
} from 'mediasoup/node/lib/types';

import {
  ConsumeInput,
  CreateWebRtcTransportInput,
  MediaTransportPort,
  ProduceInput,
} from '@/mediasoup/domain/ports';

import { MediasoupRouterAdapter } from './mediasoup-router.adapter';

export interface MediasoupTransportAdapterOptions {
  listenIps: Array<{ ip: string; announcedIp?: string }>;
  enableUdp: boolean;
  enableTcp: boolean;
  preferUdp: boolean;
  initialAvailableOutgoingBitrate: number;
}

/**
 * `MediaTransportPort` 의 mediasoup 어댑터.
 *
 * `MediasoupRouterAdapter.getParticipantRouter(code, participantId)` 로
 * 회의·참가자에 매핑된 router 를 찾아 그 위에서 `WebRtcTransport`/`Producer`/
 * `Consumer` 를 생성한다.
 *
 * mediasoup 객체는 본 어댑터 내부 Map 에만 보관되고, application/domain 으로는
 * 식별자(string) 와 wire format 응답만 노출한다.
 */
export class MediasoupTransportAdapter implements MediaTransportPort {
  private readonly logger = new Logger(MediasoupTransportAdapter.name);
  private readonly transports = new Map<string, WebRtcTransport>();
  private readonly producers = new Map<string, Producer>();
  private readonly consumers = new Map<string, Consumer>();

  constructor(
    private readonly routerAdapter: MediasoupRouterAdapter,
    private readonly options: MediasoupTransportAdapterOptions,
  ) {}

  async createWebRtcTransport(input: CreateWebRtcTransportInput): Promise<CreateTransportResponse> {
    const router = this.routerAdapter.getParticipantRouter(input.meetingCode, input.participantId);
    const transport = await router.createWebRtcTransport({
      listenIps: this.options.listenIps,
      enableUdp: this.options.enableUdp,
      enableTcp: this.options.enableTcp,
      preferUdp: this.options.preferUdp,
      initialAvailableOutgoingBitrate: this.options.initialAvailableOutgoingBitrate,
      appData: { ownerId: input.participantId, direction: input.direction },
    });
    this.transports.set(transport.id, transport);
    transport.observer.on('close', () => {
      this.transports.delete(transport.id);
    });
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(transportId: string, dtlsParameters: unknown): Promise<void> {
    const transport = this.requireTransport(transportId);
    await transport.connect({ dtlsParameters: dtlsParameters as DtlsParameters });
  }

  async produce(input: ProduceInput): Promise<{ producerId: string }> {
    const transport = this.requireTransport(input.transportId);
    const producer = await transport.produce({
      kind: input.kind,
      rtpParameters: input.rtpParameters as RtpParameters,
      // 기본 OFF 로 입장하는 audio/video 는 paused 로 생성해, NEW_PRODUCER 가 처음부터
      // 정확한 mute 상태로 나가게 한다(produce 후 별도 pause 전파 race 제거).
      paused: input.paused ?? false,
      appData: { ownerId: input.participantId, source: input.source },
    });
    this.producers.set(producer.id, producer);
    producer.observer.on('close', () => {
      this.producers.delete(producer.id);
    });
    return { producerId: producer.id };
  }

  async consume(input: ConsumeInput): Promise<ConsumeResponse> {
    const transport = this.requireTransport(input.transportId);
    const producer = this.producers.get(input.producerId);
    if (!producer) {
      throw new Error(`MediasoupTransportAdapter: producer "${input.producerId}" not found`);
    }
    const consumer = await transport.consume({
      producerId: input.producerId,
      rtpCapabilities: input.rtpCapabilities as RtpCapabilities,
      paused: true,
      appData: { ownerId: input.participantId },
    });
    this.consumers.set(consumer.id, consumer);
    consumer.observer.on('close', () => {
      this.consumers.delete(consumer.id);
    });
    return {
      id: consumer.id,
      producerId: input.producerId,
      kind: consumer.kind as 'audio' | 'video',
      rtpParameters: consumer.rtpParameters,
    };
  }

  async resumeConsumer(consumerId: string): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`MediasoupTransportAdapter: consumer "${consumerId}" not found`);
    }
    await consumer.resume();
  }

  async pauseProducer(producerId: string): Promise<void> {
    const producer = this.producers.get(producerId);
    if (!producer || producer.closed) {
      throw new Error(`MediasoupTransportAdapter: producer "${producerId}" not found`);
    }
    await producer.pause();
  }

  async resumeProducer(producerId: string): Promise<void> {
    const producer = this.producers.get(producerId);
    if (!producer || producer.closed) {
      throw new Error(`MediasoupTransportAdapter: producer "${producerId}" not found`);
    }
    await producer.resume();
  }

  async closeProducer(producerId: string): Promise<void> {
    const producer = this.producers.get(producerId);
    if (producer && !producer.closed) producer.close();
  }

  async closeTransport(transportId: string): Promise<void> {
    const transport = this.transports.get(transportId);
    if (transport && !transport.closed) transport.close();
  }

  private requireTransport(transportId: string): WebRtcTransport {
    const transport = this.transports.get(transportId);
    if (!transport || transport.closed) {
      throw new Error(`MediasoupTransportAdapter: transport "${transportId}" not found`);
    }
    return transport;
  }
}
