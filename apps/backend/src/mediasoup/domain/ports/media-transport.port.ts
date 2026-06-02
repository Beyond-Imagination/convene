import {
  ConsumeResponse,
  CreateTransportResponse,
  MediaType,
  TransportDirection,
} from '@migration/shared-interfaces';

/**
 * WebRTC Transport / Producer / Consumer 의 lifecycle 을 추상화한 도메인 포트.
 *
 * `MediaRouterPort` 가 routerIndex 를 정해 주면, 본 포트는 그 routerIndex 위에서
 * 동작하는 transport·producer·consumer 를 만들고 닫는다. mediasoup 라이브러리의
 * `RtpParameters` / `DtlsParameters` 등은 본 인터페이스에 `unknown` 으로 전달된다.
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
  /** producer 를 paused(mute) 상태로 생성할지. 생략하면 false. */
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

  /** 자기 producer 일시정지(mute). mediasoup `producer.pause()`. */
  pauseProducer(producerId: string): Promise<void>;

  /** 자기 producer 재개(unmute). mediasoup `producer.resume()`. */
  resumeProducer(producerId: string): Promise<void>;

  closeProducer(producerId: string): Promise<void>;

  closeTransport(transportId: string): Promise<void>;
}
