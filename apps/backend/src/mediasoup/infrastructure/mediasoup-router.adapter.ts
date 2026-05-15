import { Logger } from '@nestjs/common';
import { Router, RtpCodecCapability } from 'mediasoup/node/lib/types';

import { MediaRouterPort } from '@/mediasoup/domain/ports';

import { MediasoupWorkerPool } from './mediasoup-worker.pool';

export interface MediasoupRouterAdapterOptions {
  routersPerRoom: number;
  mediaCodecs: RtpCodecCapability[];
}

/**
 * `MediaRouterPort` 의 mediasoup 어댑터.
 *
 * 회의 1 건 = router N 개 (options.routersPerRoom) 묶음. 각 router 는 다른 worker
 * 에 분산(`workerPool.getNextWorker()` round-robin)되어 CPU 부하를 균등화한다.
 * 참가자는 같은 round-robin 으로 router index 를 할당받는다.
 *
 * `getRouterFor(code, idx)` 는 같은 회의의 `MediasoupTransportAdapter` 가
 * Transport/Producer/Consumer 를 생성할 때 호출하는 내부 API.
 */
export class MediasoupRouterAdapter implements MediaRouterPort {
  private readonly logger = new Logger(MediasoupRouterAdapter.name);
  private readonly routers = new Map<string, Router[]>();
  private readonly assignments = new Map<string, Map<string, number>>();
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly workerPool: MediasoupWorkerPool,
    private readonly options: MediasoupRouterAdapterOptions,
  ) {}

  async createRoom(_meetingCode: string): Promise<void> {
    throw new Error('not implemented');
  }

  async closeRoom(_meetingCode: string): Promise<void> {
    throw new Error('not implemented');
  }

  async getRtpCapabilities(_meetingCode: string): Promise<unknown> {
    throw new Error('not implemented');
  }

  async assignParticipant(_meetingCode: string, _participantId: string): Promise<number> {
    throw new Error('not implemented');
  }

  async releaseParticipant(_meetingCode: string, _participantId: string): Promise<void> {
    throw new Error('not implemented');
  }

  /** Transport adapter 가 transport 를 생성할 때 호출. */
  getRouterFor(_meetingCode: string, _routerIndex: number): Router {
    throw new Error('not implemented');
  }
}
