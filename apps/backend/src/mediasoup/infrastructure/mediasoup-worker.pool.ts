import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { Worker, WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';

import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

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
 * mediasoup `Worker` 풀.
 * NestJS lifecycle hook에 묶여 onModuleInit에 워커 N 개를 생성하고 onModuleDestroy에 정리한다.
 * Worker가 `died` 이벤트로 죽으면 무결성 보장이 불가하므로 프로세스를 종료한다.
 */
export class MediasoupWorkerPool implements OnModuleInit, OnModuleDestroy {
  private readonly workers: Worker[] = [];
  private nextIdx = 0;

  constructor(
    private readonly options: MediasoupWorkerPoolOptions,
    private readonly logger: PinoLoggerAdapter,
  ) {}

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
          { pid: worker.pid },
          'mediasoup worker died, exiting process for supervisor restart',
        );
        process.exit(1);
      });
      this.workers.push(worker);
    }
    this.logger.info({ count: this.workers.length }, 'mediasoup workers ready');
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

  getWorker(idx: number): Worker {
    if (idx < 0 || idx >= this.workers.length) {
      throw new Error(
        `MediasoupWorkerPool: worker index ${idx} out of range (size=${this.workers.length})`,
      );
    }
    return this.workers[idx];
  }
}
