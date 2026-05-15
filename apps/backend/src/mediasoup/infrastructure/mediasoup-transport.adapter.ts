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
import { ConsumeResponse, CreateTransportResponse } from '@migration/shared-interfaces';

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
 * `MediasoupRouterAdapter.getRouterFor(code, routerIndex)` 로 회의·참가자에
 * 매핑된 router 를 찾아 그 위에서 `WebRtcTransport`/`Producer`/`Consumer`
 * 를 생성한다. 참가자의 routerIndex 는 application service 가 보유한
 * `ParticipantMedia.routerIndex` 에서 가져온다.
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

  async createWebRtcTransport(_input: CreateWebRtcTransportInput): Promise<CreateTransportResponse> {
    throw new Error('not implemented');
  }

  async connectTransport(_transportId: string, _dtlsParameters: unknown): Promise<void> {
    throw new Error('not implemented');
  }

  async produce(_input: ProduceInput): Promise<{ producerId: string }> {
    throw new Error('not implemented');
  }

  async consume(_input: ConsumeInput): Promise<ConsumeResponse> {
    throw new Error('not implemented');
  }

  async resumeConsumer(_consumerId: string): Promise<void> {
    throw new Error('not implemented');
  }

  async closeProducer(_producerId: string): Promise<void> {
    throw new Error('not implemented');
  }

  async closeTransport(_transportId: string): Promise<void> {
    throw new Error('not implemented');
  }
}
