import { Logger } from '@nestjs/common';
import { Producer, Router, RtpCodecCapability } from 'mediasoup/node/lib/types';

import { MediaRouterPort } from '@/mediasoup/domain/ports';

import { MediasoupWorkerPool } from './mediasoup-worker.pool';

interface MediasoupRouterAdapterOptions {
  /** router 1 개의 참가자 capacity. assignParticipant가 이를 초과하면 lazy add. */
  participantsPerRouter: number;
  mediaCodecs: RtpCodecCapability[];
}

interface PipeProducerInfo {
  readonly targetRouter: Router;
  readonly pipeProducer: Producer;
}

interface RouterPipeRegistry {
  readonly sourceRouterIndex: number;
  readonly pipes: PipeProducerInfo[];
}

/**
 * `MediaRouterPort`의 mediasoup 어댑터.
 *
 * **동적 router pool** — 인원 가변이라 capacity 기반
 * lazy add 전략을 쓴다:
 *   - createRoom: router 1개 시작
 *   - assignParticipant: 빈 자리(capacity 미달) 있는 router에 할당. 모두 가득 차면 새 router 추가 + 모든 기존 producer를 새 router로 pipe.
 *   - releaseParticipant: 그 router의 참가자 0 명이면 해당 router 정리.
 *
 * `pipeProducerToAllRouters`는 produce 시점에 호출되어 다른 모든 router로 pipe.
 * `cleanupPipeProducers`는 producer close 시 호출.
 */
export class MediasoupRouterAdapter implements MediaRouterPort {
  private readonly logger = new Logger(MediasoupRouterAdapter.name);
  private readonly routers = new Map<string, Router[]>();
  /** participantId → routerIndex (per meeting). */
  private readonly assignments = new Map<string, Map<string, number>>();
  /** originalProducerId → RouterPipeRegistry (per meeting). */
  private readonly producerPipes = new Map<string, Map<string, RouterPipeRegistry>>();
  /** 회의별로 점유 중인 worker 인덱스 Set. 같은 회의의 두 router가 같은 worker에 들어가지 않게 하기 위한 affinity tracking. */
  private readonly workerIdxByRoom = new Map<string, Set<number>>();
  /** 다음 회의 spawn 시 어느 worker idx부터 후보를 돌릴지. 회의 간 worker 부하 분산 — round-robin global pointer. */
  private nextWorkerIdx = 0;

  constructor(
    private readonly workerPool: MediasoupWorkerPool,
    private readonly options: MediasoupRouterAdapterOptions,
  ) {}

  async createRoom(meetingCode: string): Promise<void> {
    if (this.routers.has(meetingCode)) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" already exists`);
    }
    this.workerIdxByRoom.set(meetingCode, new Set());
    // 최초 router 1 개로 시작. 더 필요한 만큼은 assignParticipant가 lazy add.
    const first = await this.spawnRouter(meetingCode);
    this.routers.set(meetingCode, [first]);
    this.assignments.set(meetingCode, new Map());
    this.producerPipes.set(meetingCode, new Map());
    this.logger.log(`room created (code=${meetingCode}, routers=1)`);
  }

  async closeRoom(meetingCode: string): Promise<void> {
    const roomPipes = this.producerPipes.get(meetingCode);
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
    this.producerPipes.delete(meetingCode);
    this.workerIdxByRoom.delete(meetingCode);
  }

  async getRtpCapabilities(meetingCode: string): Promise<unknown> {
    const list = this.routers.get(meetingCode);
    if (!list || list.length === 0) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" not opened`);
    }
    // 같은 회의의 router 들은 동일 mediaCodecs로 만들어졌으므로 어느 것이든 OK.
    return list[0].rtpCapabilities;
  }

  async assignParticipant(meetingCode: string, participantId: string): Promise<number> {
    const list = this.routers.get(meetingCode);
    const assignments = this.assignments.get(meetingCode);
    if (!list || !assignments) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" not opened`);
    }
    const capacity = this.options.participantsPerRouter;

    // 단일 진실원 assignments에서 router별 현재 부하를 즉석 집계(O(N), join당 1회라 무시 가능).
    const loadByRouter = new Array<number>(list.length).fill(0);
    for (const idx of assignments.values()) loadByRouter[idx] += 1;

    // 빈 자리(capacity 미달) 있는 가장 낮은 인덱스 router에 할당(균등 분배).
    let target = loadByRouter.findIndex((load) => load < capacity);

    if (target === -1) {
      // 모든 router가 가득 참.
      const usedWorkers = this.workerIdxByRoom.get(meetingCode)!;
      if (usedWorkers.size < this.workerPool.size) {
        // 이 회의가 아직 점유하지 않은 worker가 있음 → 새 router 추가.
        target = await this.addRouter(meetingCode);
      } else {
        // 이 회의가 모든 worker를 점유 중. 가장 한가한 기존 router에 over-allocate.
        let minIdx = 0;
        for (let i = 1; i < loadByRouter.length; i += 1) {
          if (loadByRouter[i] < loadByRouter[minIdx]) minIdx = i;
        }
        target = minIdx;
        this.logger.warn(
          `worker cap reached (code=${meetingCode}, usedWorkers=${usedWorkers.size}/${this.workerPool.size}) — over-allocating participant to router#${target}`,
        );
      }
    }

    assignments.set(participantId, target);
    const newLoad = (loadByRouter[target] ?? 0) + 1;
    this.logger.log(
      `participant assigned (code=${meetingCode}, pid=${participantId}, routerIndex=${target}, load=${newLoad}/${capacity})`,
    );
    return target;
  }

  async releaseParticipant(meetingCode: string, participantId: string): Promise<void> {
    const assignments = this.assignments.get(meetingCode);
    if (!assignments) return;
    const idx = assignments.get(participantId);
    if (idx === undefined) return;
    assignments.delete(participantId);
    this.logger.log(
      `participant released (code=${meetingCode}, pid=${participantId}, routerIndex=${idx})`,
    );
  }

  async pipeProducerToAllRouters(
    meetingCode: string,
    producerId: string,
    sourceRouterIndex: number,
  ): Promise<void> {
    const list = this.routers.get(meetingCode);
    if (!list) return;
    const sourceRouter = list[sourceRouterIndex];
    if (!sourceRouter) {
      throw new Error(
        `MediasoupRouterAdapter: sourceRouterIndex ${sourceRouterIndex} out of range for room "${meetingCode}"`,
      );
    }
    const roomPipes = this.producerPipes.get(meetingCode)!;
    const existing = roomPipes.get(producerId);

    if (list.length <= 1) {
      // 현재는 single-router 이지만 미래 새 router가 추가되면 그 시점에 pipe가 필요하니, sourceRouterIndex만 등록해두고 pipes는 빈 채로 저장.
      if (!existing) roomPipes.set(producerId, { sourceRouterIndex, pipes: [] });
      return;
    }

    const pipedTargets = new Set((existing?.pipes ?? []).map((p) => p.targetRouter));
    const targets = list.filter((r, idx) => idx !== sourceRouterIndex && !pipedTargets.has(r));
    if (targets.length === 0) {
      if (!existing) roomPipes.set(producerId, { sourceRouterIndex, pipes: [] });
      return;
    }

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
    roomPipes.set(producerId, {
      sourceRouterIndex,
      pipes: [...(existing?.pipes ?? []), ...ok],
    });
    this.logger.log(
      `pipe ok (code=${meetingCode}, producerId=${producerId}, src=#${sourceRouterIndex}, +${ok.length} targets)`,
    );
  }

  async cleanupPipeProducers(meetingCode: string, producerId: string): Promise<void> {
    const roomPipes = this.producerPipes.get(meetingCode);
    if (!roomPipes) return;
    const record = roomPipes.get(producerId);
    if (!record) return;
    for (const info of record.pipes) {
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
   * 새 router를 생성하고 기존 producer 들을 그 새 router로 pipe 한다.
   * 호출 전 회의가 점유하지 않은 worker가 1 개 이상 남아 있다는 게 보장되어야 한다. 그 보장이 깨지면 spawnRouter가 throw.
   */
  private async addRouter(meetingCode: string): Promise<number> {
    const list = this.routers.get(meetingCode)!;
    const newRouter = await this.spawnRouter(meetingCode);
    const newIndex = list.length;
    list.push(newRouter);

    // 기존 모든 producer를 새 router로 pipe.
    const roomPipes = this.producerPipes.get(meetingCode);
    if (roomPipes && roomPipes.size > 0) {
      const pipeOps = Array.from(roomPipes.entries()).map(async ([producerId, record]) => {
        if (record.sourceRouterIndex === newIndex) return; // self
        if (record.pipes.some((p) => p.targetRouter === newRouter)) return;
        const sourceRouter = list[record.sourceRouterIndex];
        if (!sourceRouter) return;
        try {
          const { pipeProducer } = await sourceRouter.pipeToRouter({
            producerId,
            router: newRouter,
          });
          if (!pipeProducer) return;
          record.pipes.push({ targetRouter: newRouter, pipeProducer });
        } catch (err) {
          this.logger.error(
            `addRouter pipe FAIL (code=${meetingCode}, producerId=${producerId}, newIndex=${newIndex}): ${(err as Error).message}`,
          );
        }
      });
      await Promise.allSettled(pipeOps);
    }

    this.logger.log(
      `router added (code=${meetingCode}, newIndex=${newIndex}, existing pipes pre-loaded)`,
    );
    return newIndex;
  }

  /**
   * 이 회의가 점유하지 않은 worker 인덱스를 골라 그 worker에 router를 만든다.
   * `nextWorkerIdx`부터 시계방향으로 후보를 도는 round-robin.
   * router의 appData에 workerIndex를 심어 검증/디버깅 시 추적 가능.
   */
  private async spawnRouter(meetingCode: string): Promise<Router> {
    const used = this.workerIdxByRoom.get(meetingCode);
    if (!used) {
      throw new Error(
        `MediasoupRouterAdapter: room "${meetingCode}" not initialized for affinity tracking`,
      );
    }
    const size = this.workerPool.size;
    let pickedIdx = -1;
    for (let i = 0; i < size; i += 1) {
      const candidate = (this.nextWorkerIdx + i) % size;
      if (!used.has(candidate)) {
        pickedIdx = candidate;
        break;
      }
    }
    if (pickedIdx === -1) {
      throw new Error(
        `MediasoupRouterAdapter: no free worker for room "${meetingCode}" (used=${used.size}/${size})`,
      );
    }
    this.nextWorkerIdx = (pickedIdx + 1) % size;
    used.add(pickedIdx);
    const worker = this.workerPool.getWorker(pickedIdx);
    return worker.createRouter({
      mediaCodecs: this.options.mediaCodecs,
      appData: { workerIndex: pickedIdx },
    });
  }
}
