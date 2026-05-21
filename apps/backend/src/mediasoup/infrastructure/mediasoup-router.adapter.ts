import { Logger } from '@nestjs/common';
import { Producer, Router, RtpCodecCapability } from 'mediasoup/node/lib/types';

import { MediaRouterPort } from '@/mediasoup/domain/ports';

import { MediasoupWorkerPool } from './mediasoup-worker.pool';

export interface MediasoupRouterAdapterOptions {
  /** router 1 개의 참가자 capacity. assignParticipant 가 이를 초과하면 lazy add. */
  participantsPerRouter: number;
  mediaCodecs: RtpCodecCapability[];
}

interface PipeProducerInfo {
  readonly targetRouter: Router;
  readonly pipeProducer: Producer;
}

interface RouterPipeRegistry {
  /** originalProducerId 가 어느 router 에서 처음 만들어졌는지. 새 router 가 들어왔을 때
   *  기존 producer 를 그 새 router 로 pipe 하기 위해 필요. */
  readonly sourceRouterIndex: number;
  /** 그 producer 가 pipe 된 target router 들. */
  readonly pipes: PipeProducerInfo[];
}

/**
 * `MediaRouterPort` 의 mediasoup 어댑터.
 *
 * **동적 router pool** — plum 은 회의 생성 시 router 를 사전 N 개 만들지만
 * migration 회의는 인원 가변이라 capacity 기반 lazy add 전략을 쓴다:
 *   - createRoom: router 1 개 시작
 *   - assignParticipant: 빈 자리(capacity 미달) 있는 router 에 할당. 모두 가득
 *     차면 새 router 추가 + **모든 기존 producer 를 새 router 로 pipe**.
 *   - releaseParticipant: 그 router 의 참가자 0 명이면 해당 router 정리 (다음 Cycle).
 *
 * `pipeProducerToAllRouters` 는 produce 시점에 호출되어 다른 모든 router 로 pipe.
 * `cleanupPipeProducers` 는 producer close 시 호출.
 */
export class MediasoupRouterAdapter implements MediaRouterPort {
  private readonly logger = new Logger(MediasoupRouterAdapter.name);
  private readonly routers = new Map<string, Router[]>();
  /** participantId → routerIndex (per meeting). */
  private readonly assignments = new Map<string, Map<string, number>>();
  /** routerIndex → 현재 참가자 수 (per meeting). assignments 와 redundant 하지만
   *  O(1) capacity 검사를 위해 분리. */
  private readonly routerLoads = new Map<string, Map<number, number>>();
  /** originalProducerId → RouterPipeRegistry (per meeting). */
  private readonly producerPipes = new Map<string, Map<string, RouterPipeRegistry>>();
  /** 회의별로 점유 중인 worker 인덱스 Set. 같은 회의의 두 router 가 같은 worker
   *  에 들어가지 않게 하기 위한 affinity tracking. */
  private readonly workerIdxByRoom = new Map<string, Set<number>>();
  /** 다음 회의 spawn 시 어느 worker idx 부터 후보를 돌릴지. 회의 간 worker 부하
   *  분산 — round-robin global pointer. */
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
    // 최초 router 1 개로 시작. 더 필요한 만큼은 assignParticipant 가 lazy add.
    const first = await this.spawnRouter(meetingCode);
    this.routers.set(meetingCode, [first]);
    this.assignments.set(meetingCode, new Map());
    this.routerLoads.set(meetingCode, new Map([[0, 0]]));
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
    this.routerLoads.delete(meetingCode);
    this.producerPipes.delete(meetingCode);
    this.workerIdxByRoom.delete(meetingCode);
  }

  async getRtpCapabilities(meetingCode: string): Promise<unknown> {
    const list = this.routers.get(meetingCode);
    if (!list || list.length === 0) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" not opened`);
    }
    // 같은 회의의 router 들은 동일 mediaCodecs 로 만들어졌으므로 어느 것이든 OK.
    return list[0].rtpCapabilities;
  }

  async assignParticipant(meetingCode: string, participantId: string): Promise<number> {
    const list = this.routers.get(meetingCode);
    const loads = this.routerLoads.get(meetingCode);
    if (!list || !loads) {
      throw new Error(`MediasoupRouterAdapter: room "${meetingCode}" not opened`);
    }
    const capacity = this.options.participantsPerRouter;

    // 빈 자리 있는 router 가 있으면 가장 낮은 인덱스 router 에 할당 (균등 분배).
    let target = -1;
    for (let i = 0; i < list.length; i += 1) {
      if ((loads.get(i) ?? 0) < capacity) {
        target = i;
        break;
      }
    }

    if (target === -1) {
      // 모든 router 가 가득 참.
      const usedWorkers = this.workerIdxByRoom.get(meetingCode)!;
      if (usedWorkers.size < this.workerPool.size) {
        // 이 회의가 아직 점유하지 않은 worker 가 있음 → 새 router 추가.
        // (list.length 가 아니라 usedWorkers.size 로 cap 을 정의해야 한다.
        // 다중 방으로 globally round-robin idx 가 어긋날 때 list.length 기반
        // cap 은 같은 worker 안에 같은 회의의 두 router 가 들어가는 걸 못 막는다.)
        target = await this.addRouter(meetingCode);
      } else {
        // 이 회의가 모든 worker 를 점유 중. 새 router 를 만들면 같은 worker
        // 에 두 router 가 생겨 pipeToRouter 가 동일 producerId 를 등록하려다
        // mediasoup native 가 "Channel request handler with ID ... already
        // exists" 로 거절한다. 그래서 가장 한가한 기존 router 에 over-allocate.
        let minLoad = Number.POSITIVE_INFINITY;
        let minIdx = 0;
        for (let i = 0; i < list.length; i += 1) {
          const load = loads.get(i) ?? 0;
          if (load < minLoad) {
            minLoad = load;
            minIdx = i;
          }
        }
        target = minIdx;
        this.logger.warn(
          `worker cap reached (code=${meetingCode}, usedWorkers=${usedWorkers.size}/${this.workerPool.size}) — over-allocating participant to router#${target}`,
        );
      }
    }

    loads.set(target, (loads.get(target) ?? 0) + 1);
    this.assignments.get(meetingCode)!.set(participantId, target);
    this.logger.log(
      `participant assigned (code=${meetingCode}, pid=${participantId}, routerIndex=${target}, load=${loads.get(target)}/${capacity})`,
    );
    return target;
  }

  async releaseParticipant(meetingCode: string, participantId: string): Promise<void> {
    const assignments = this.assignments.get(meetingCode);
    const loads = this.routerLoads.get(meetingCode);
    if (!assignments || !loads) return;
    const idx = assignments.get(participantId);
    if (idx === undefined) return;
    assignments.delete(participantId);
    const prev = loads.get(idx) ?? 0;
    loads.set(idx, Math.max(0, prev - 1));
    this.logger.log(
      `participant released (code=${meetingCode}, pid=${participantId}, routerIndex=${idx}, load=${loads.get(idx)})`,
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
      // 현재는 single-router 이지만 미래 새 router 가 추가되면 그 시점에 pipe 가
      // 필요하니, sourceRouterIndex 만 등록해두고 pipes 는 빈 채로 저장.
      if (!existing) roomPipes.set(producerId, { sourceRouterIndex, pipes: [] });
      return;
    }

    const pipedTargets = new Set((existing?.pipes ?? []).map((p) => p.targetRouter));
    const targets = list.filter(
      (r, idx) => idx !== sourceRouterIndex && !pipedTargets.has(r),
    );
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
   * 새 router 를 생성하고 기존 producer 들을 그 새 router 로 pipe 한다.
   * assignParticipant 가 capacity 초과 시 호출. 호출 전 회의가 점유하지 않은
   * worker 가 1 개 이상 남아 있다는 게 보장되어야 한다 (usedWorkers.size <
   * workerPool.size). 그 보장이 깨지면 spawnRouter 가 throw.
   */
  private async addRouter(meetingCode: string): Promise<number> {
    const list = this.routers.get(meetingCode)!;
    const newRouter = await this.spawnRouter(meetingCode);
    const newIndex = list.length;
    list.push(newRouter);
    this.routerLoads.get(meetingCode)!.set(newIndex, 0);

    // 기존 모든 producer 를 새 router 로 pipe.
    const roomPipes = this.producerPipes.get(meetingCode);
    if (roomPipes && roomPipes.size > 0) {
      const pipeOps = Array.from(roomPipes.entries()).map(
        async ([producerId, record]) => {
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
        },
      );
      await Promise.allSettled(pipeOps);
    }

    this.logger.log(
      `router added (code=${meetingCode}, newIndex=${newIndex}, existing pipes pre-loaded)`,
    );
    return newIndex;
  }

  /**
   * 이 회의가 점유하지 않은 worker 인덱스를 골라 그 worker 에 router 를
   * 만든다. `nextWorkerIdx` 부터 시계방향으로 후보를 도는 round-robin —
   * 회의 간 worker 부하 분산 + 회의 내 affinity 동시 달성. router 의 appData
   * 에 workerIndex 를 심어 검증/디버깅 시 추적 가능.
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
