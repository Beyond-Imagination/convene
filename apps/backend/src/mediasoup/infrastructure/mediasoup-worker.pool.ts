import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';

export interface MediasoupWorkerPoolOptions {
  numWorkers: number;
  worker: {
    rtcMinPort: number;
    rtcMaxPort: number;
    logLevel: WorkerLogLevel;
    logTags: WorkerLogTag[];
  };
}

/**
 * mediasoup `Worker` 풀. NestJS lifecycle hook 에 묶여 onModuleInit 에
 * 워커 N 개를 생성하고 onModuleDestroy 에 정리한다.
 *
 * `getNextWorker()` 는 round-robin 으로 워커를 분배하므로 회의별 라우터를
 * 다른 워커에 분산시킬 수 있다 (MultiRouterManager 가 호출).
 *
 * Worker 가 `died` 이벤트로 죽으면 무결성 보장이 불가하므로 프로세스를 종료한다
 * (운영에서는 PM2/Docker 가 재시작).
 */
export class MediasoupWorkerPool implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediasoupWorkerPool.name);
  private readonly workers: Worker[] = [];
  private nextIdx = 0;

  constructor(private readonly options: MediasoupWorkerPoolOptions) {}

  async onModuleInit(): Promise<void> {
    throw new Error('not implemented');
  }

  async onModuleDestroy(): Promise<void> {
    throw new Error('not implemented');
  }

  get size(): number {
    return this.workers.length;
  }

  getNextWorker(): Worker {
    throw new Error('not implemented');
  }
}
