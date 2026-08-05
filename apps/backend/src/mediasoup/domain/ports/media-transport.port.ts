import {
  ConsumeResponse,
  CreateTransportResponse,
  MediaType,
  TransportDirection,
} from '@convene/shared-interfaces';

export const MEDIA_TRANSPORT = Symbol('MEDIA_TRANSPORT');

/**
 * WebRTC Transport/Producer/Consumer의 lifecycle
 *
 * `MediaRouterPort`가 routerIndex를 정해 주면, 본 포트는 그 routerIndex 위에서 동작하는 transport·producer·consumer를 만들고 닫는다.
 */

export interface CreateWebRtcTransportInput {
  meetingCode: string;
  participantId: string;
  direction: TransportDirection;
}

export interface ProduceInput {
  meetingCode: string;
  participantId: string;
  transportId: string;
  kind: 'audio' | 'video';
  source: MediaType;
  rtpParameters: unknown;
  paused?: boolean;
}

export interface ConsumeInput {
  meetingCode: string;
  participantId: string;
  transportId: string;
  producerId: string;
  rtpCapabilities: unknown;
}

export interface MediaTransportPort {
  createWebRtcTransport(input: CreateWebRtcTransportInput): Promise<CreateTransportResponse>;

  connectTransport(transportId: string, dtlsParameters: unknown): Promise<void>;

  produce(input: ProduceInput): Promise<{ producerId: string }>;

  consume(input: ConsumeInput): Promise<ConsumeResponse>;

  resumeConsumer(consumerId: string): Promise<void>;

  pauseProducer(producerId: string): Promise<void>;

  resumeProducer(producerId: string): Promise<void>;

  closeProducer(producerId: string): Promise<void>;

  closeTransport(transportId: string): Promise<void>;
}
