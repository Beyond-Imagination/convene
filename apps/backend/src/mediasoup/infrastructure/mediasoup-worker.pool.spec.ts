import { WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';

import { LoggerPort } from '@/shared-kernel/domain/ports/logger';

import { MediasoupWorkerPool } from './mediasoup-worker.pool';

const noopLogger: LoggerPort = { debug() {}, info() {}, warn() {}, error() {} };

const baseOptions = (numWorkers: number) => ({
  numWorkers,
  worker: {
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
    logLevel: 'error' as WorkerLogLevel,
    logTags: ['info'] as WorkerLogTag[],
  },
});

describe('MediasoupWorkerPool', () => {
  it('onModuleInit 후 options.numWorkers 만큼의 살아있는 worker를 보유한다', async () => {
    const pool = new MediasoupWorkerPool(baseOptions(1), noopLogger);
    try {
      await pool.onModuleInit();
      expect(pool.size).toBe(1);
      const worker = pool.getNextWorker();
      expect(worker.pid).toBeGreaterThan(0);
      expect(worker.closed).toBe(false);
    } finally {
      await pool.onModuleDestroy();
    }
  });

  it('getNextWorker는 round-robin으로 순환한다', async () => {
    const pool = new MediasoupWorkerPool(baseOptions(2), noopLogger);
    try {
      await pool.onModuleInit();
      const w1 = pool.getNextWorker();
      const w2 = pool.getNextWorker();
      const w3 = pool.getNextWorker();
      expect(w1.pid).not.toBe(w2.pid);
      expect(w3.pid).toBe(w1.pid);
    } finally {
      await pool.onModuleDestroy();
    }
  });

  it('onModuleDestroy 후엔 모든 worker가 closed 상태가 된다', async () => {
    const pool = new MediasoupWorkerPool(baseOptions(1), noopLogger);
    await pool.onModuleInit();
    const worker = pool.getNextWorker();
    await pool.onModuleDestroy();
    expect(worker.closed).toBe(true);
  });
});
