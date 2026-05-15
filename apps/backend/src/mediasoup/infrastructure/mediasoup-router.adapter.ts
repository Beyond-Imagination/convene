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

  async createRoom(meetingCode: string): Promise<void> {
    if (this.routers.has(meetingCode)) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" already exists`);
    }
    const list: Router[] = [];
    for (let i = 0; i < this.options.routersPerRoom; i += 1) {
      const worker = this.workerPool.getNextWorker();
      const router = await worker.createRouter({ mediaCodecs: this.options.mediaCodecs });
      list.push(router);
    }
    this.routers.set(meetingCode, list);
    this.assignments.set(meetingCode, new Map());
    this.counters.set(meetingCode, 0);
    this.logger.log(`room created (code=${meetingCode}, routers=${list.length})`);
  }

  async closeRoom(meetingCode: string): Promise<void> {
    const list = this.routers.get(meetingCode);
    if (list) {
      for (const router of list) {
        if (!router.closed) router.close();
      }
    }
    this.routers.delete(meetingCode);
    this.assignments.delete(meetingCode);
    this.counters.delete(meetingCode);
  }

  async getRtpCapabilities(meetingCode: string): Promise<unknown> {
    const list = this.routers.get(meetingCode);
    if (!list || list.length === 0) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" not opened`);
    }
    return list[0].rtpCapabilities;
  }

  async assignParticipant(meetingCode: string, participantId: string): Promise<number> {
    const list = this.routers.get(meetingCode);
    if (!list || list.length === 0) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" not opened`);
    }
    const counter = this.counters.get(meetingCode) ?? 0;
    const idx = counter % list.length;
    this.assignments.get(meetingCode)!.set(participantId, idx);
    this.counters.set(meetingCode, counter + 1);
    return idx;
  }

  async releaseParticipant(meetingCode: string, participantId: string): Promise<void> {
    this.assignments.get(meetingCode)?.delete(participantId);
  }

  getRouterFor(meetingCode: string, routerIndex: number): Router {
    const list = this.routers.get(meetingCode);
    if (!list || !list[routerIndex]) {
      throw new Error(
        `MediasoupRouterAdapter: router index ${routerIndex} of room "${meetingCode}" not found`,
      );
    }
    return list[routerIndex];
  }
}
