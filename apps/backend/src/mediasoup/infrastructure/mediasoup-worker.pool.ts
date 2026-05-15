import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
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
    for (let i = 0; i < this.options.numWorkers; i += 1) {
      const worker = await mediasoup.createWorker({
        rtcMinPort: this.options.worker.rtcMinPort,
        rtcMaxPort: this.options.worker.rtcMaxPort,
        logLevel: this.options.worker.logLevel,
        logTags: this.options.worker.logTags,
      });
      worker.on('died', () => {
        this.logger.error(
          `mediasoup worker (pid=${worker.pid}) died — exiting process for supervisor restart`,
        );
        process.exit(1);
      });
      this.workers.push(worker);
    }
    this.logger.log(`mediasoup workers ready (count=${this.workers.length})`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const worker of this.workers) {
      if (!worker.closed) worker.close();
    }
    this.workers.length = 0;
  }

  get size(): number {
    return this.workers.length;
  }

  getNextWorker(): Worker {
    if (this.workers.length === 0) {
      throw new Error('MediasoupWorkerPool not initialized (call onModuleInit first)');
    }
    const worker = this.workers[this.nextIdx];
    this.nextIdx = (this.nextIdx + 1) % this.workers.length;
    return worker;
  }
}
