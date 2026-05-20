import { Logger } from '@nestjs/common';
import { Producer, Router, RtpCodecCapability } from 'mediasoup/node/lib/types';

import { MediaRouterPort } from '@/mediasoup/domain/ports';

import { MediasoupWorkerPool } from './mediasoup-worker.pool';

export interface MediasoupRouterAdapterOptions {
  routersPerRoom: number;
  mediaCodecs: RtpCodecCapability[];
}

interface PipeProducerInfo {
  readonly targetRouter: Router;
  readonly pipeProducer: Producer;
}

/**
 * `MediaRouterPort` 의 mediasoup 어댑터.
 *
 * 회의 1 건 = router N 개 (options.routersPerRoom) 묶음. 각 router 는 다른 worker
 * 에 분산되어 CPU 부하를 균등화한다.
 *
 * 참가자 할당은 plum `MultiRouterManagerService.assignRouterForParticipant` 와
 * 동등 stateless round-robin — `(hash(roomCode) + participantCount-1) % routerCount`
 * 로 방마다 다른 시작점을 갖는다.
 *
 * `pipeProducerToAllRouters` 는 producer 를 다른 모든 router 로 즉시 pipe 해
 * 어떤 router 의 transport 에서도 `transport.consume({producerId})` 가 동작
 * 하게 한다(plum eager loading 패턴). `cleanupPipeProducers` 는 producer 종료
 * 시 묶인 모든 pipeProducer 를 close.
 */
export class MediasoupRouterAdapter implements MediaRouterPort {
  private readonly logger = new Logger(MediasoupRouterAdapter.name);
  private readonly routers = new Map<string, Router[]>();
  private readonly assignments = new Map<string, Map<string, number>>();
  /** room 마다 누적된 참가자 수 — plum stateless round-robin 의 입력. */
  private readonly participantCounts = new Map<string, number>();
  /** room 마다 originalProducerId → 그 producer 의 모든 pipeProducer 추적. */
  private readonly pipeProducers = new Map<string, Map<string, PipeProducerInfo[]>>();

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
    this.participantCounts.set(meetingCode, 0);
    this.pipeProducers.set(meetingCode, new Map());
    this.logger.log(`room created (code=${meetingCode}, routers=${list.length})`);
  }

  async closeRoom(meetingCode: string): Promise<void> {
    // pipeProducer 먼저 정리 (router close 가 cascade 되지만 명시적으로 stale 제거)
    const roomPipes = this.pipeProducers.get(meetingCode);
    if (roomPipes) {
      for (const producerId of Array.from(roomPipes.keys())) {
        await this.cleanupPipeProducers(meetingCode, producerId);
      }
    }
    const list = this.routers.get(meetingCode);
    if (list) {
      for (const router of list) {
        if (!router.closed) router.close();
      }
    }
    this.routers.delete(meetingCode);
    this.assignments.delete(meetingCode);
    this.participantCounts.delete(meetingCode);
    this.pipeProducers.delete(meetingCode);
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
    // plum 동일 알고리즘: hash(roomCode) + participantCount → 방마다 다른 시작점.
    const prevCount = this.participantCounts.get(meetingCode) ?? 0;
    const nextCount = prevCount + 1;
    this.participantCounts.set(meetingCode, nextCount);

    const idx = (this.hashString(meetingCode) + nextCount - 1) % list.length;
    this.assignments.get(meetingCode)!.set(participantId, idx);
    this.logger.log(
      `participant assigned (code=${meetingCode}, pid=${participantId}, routerIndex=${idx})`,
    );
    return idx;
  }

  async releaseParticipant(meetingCode: string, participantId: string): Promise<void> {
    this.assignments.get(meetingCode)?.delete(participantId);
  }

  async pipeProducerToAllRouters(
    meetingCode: string,
    producerId: string,
    sourceRouterIndex: number,
  ): Promise<void> {
    const list = this.routers.get(meetingCode);
    if (!list || list.length <= 1) {
      // single-router 또는 room 없음 → no-op.
      return;
    }
    const sourceRouter = list[sourceRouterIndex];
    if (!sourceRouter) {
      throw new Error(
        `MediasoupRouterAdapter: sourceRouterIndex ${sourceRouterIndex} out of range for room "${meetingCode}"`,
      );
    }
    const roomPipes = this.pipeProducers.get(meetingCode)!;
    const existing = roomPipes.get(producerId) ?? [];

    // 이미 pipe 된 target 은 skip (idempotent).
    const pipedTargets = new Set(existing.map((p) => p.targetRouter));
    const targets = list.filter(
      (r, idx) => idx !== sourceRouterIndex && !pipedTargets.has(r),
    );
    if (targets.length === 0) return;

    const results = await Promise.allSettled(
      targets.map(async (targetRouter) => {
        const { pipeProducer } = await sourceRouter.pipeToRouter({
          producerId,
          router: targetRouter,
        });
        if (!pipeProducer) {
          throw new Error('pipeToRouter returned undefined pipeProducer');
        }
        return { targetRouter, pipeProducer };
      }),
    );

    const ok: PipeProducerInfo[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') ok.push(r.value);
      else
        this.logger.error(
          `pipe FAIL (code=${meetingCode}, producerId=${producerId}): ${(r.reason as Error).message}`,
        );
    }
    roomPipes.set(producerId, [...existing, ...ok]);
    this.logger.log(
      `pipe ok (code=${meetingCode}, producerId=${producerId}, src=#${sourceRouterIndex}, +${ok.length} targets)`,
    );
  }

  async cleanupPipeProducers(meetingCode: string, producerId: string): Promise<void> {
    const roomPipes = this.pipeProducers.get(meetingCode);
    if (!roomPipes) return;
    const infos = roomPipes.get(producerId);
    if (!infos || infos.length === 0) return;
    for (const info of infos) {
      try {
        if (!info.pipeProducer.closed) info.pipeProducer.close();
      } catch (err) {
        this.logger.error(
          `pipeProducer close 실패 (code=${meetingCode}, producerId=${producerId}): ${(err as Error).message}`,
        );
      }
    }
    roomPipes.delete(producerId);
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

  /** 참가자에게 할당된 router 를 lookup. TransportAdapter 가 transport 를 만들 때 호출. */
  getParticipantRouter(meetingCode: string, participantId: string): Router {
    const assignment = this.assignments.get(meetingCode)?.get(participantId);
    if (assignment === undefined) {
      throw new Error(
        `MediasoupRouterAdapter: participant "${participantId}" not assigned in room "${meetingCode}"`,
      );
    }
    return this.getRouterFor(meetingCode, assignment);
  }

  /**
   * plum `hashString` 동등 — 문자열의 32-bit 해시. assignParticipant 의 stateless
   * 시작점 계산에 사용.
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
