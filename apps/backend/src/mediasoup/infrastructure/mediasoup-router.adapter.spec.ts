import { RtpCodecCapability, WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';

import { MediasoupRouterAdapter } from './mediasoup-router.adapter';
import { MediasoupWorkerPool } from './mediasoup-worker.pool';

const mediaCodecs = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
] as RtpCodecCapability[];

const newWorkerPool = (numWorkers: number) =>
  new MediasoupWorkerPool({
    numWorkers,
    worker: {
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
      logLevel: 'error' as WorkerLogLevel,
      logTags: ['info'] as WorkerLogTag[],
    },
  });

const setup = async (numWorkers: number, routersPerRoom: number) => {
  const pool = newWorkerPool(numWorkers);
  await pool.onModuleInit();
  const adapter = new MediasoupRouterAdapter(pool, { routersPerRoom, mediaCodecs });
  return {
    pool,
    adapter,
    cleanup: async () => {
      // 회의 정리 후 worker 종료
      for (const code of ['CODE1111', 'CODE2222']) {
        try {
          await adapter.closeRoom(code);
        } catch {
          // ignore
        }
      }
      await pool.onModuleDestroy();
    },
  };
};

describe('MediasoupRouterAdapter', () => {
  it('createRoom 후 회의 1 건에 routersPerRoom 개의 router 가 묶이고 getRtpCapabilities 가 동작한다', async () => {
    const { adapter, cleanup } = await setup(1, 2);
    try {
      await adapter.createRoom('CODE1111');
      const caps = await adapter.getRtpCapabilities('CODE1111');
      expect(caps).toBeTruthy();
      // primary router 의 rtpCapabilities 는 codecs/headerExtensions 를 갖는다.
      expect((caps as { codecs: unknown[] }).codecs).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it('assignParticipant 는 routersPerRoom 안에서 round-robin 으로 인덱스를 부여한다', async () => {
    const { adapter, cleanup } = await setup(1, 2);
    try {
      await adapter.createRoom('CODE1111');
      const a = await adapter.assignParticipant('CODE1111', 's1');
      const b = await adapter.assignParticipant('CODE1111', 's2');
      const c = await adapter.assignParticipant('CODE1111', 's3');
      const d = await adapter.assignParticipant('CODE1111', 's4');
      expect([a, b, c, d]).toEqual([0, 1, 0, 1]);
    } finally {
      await cleanup();
    }
  });

  it('createRoom 미호출 회의에 assignParticipant 하면 실패한다', async () => {
    const { adapter, cleanup } = await setup(1, 1);
    try {
      await expect(adapter.assignParticipant('CODE-NO', 's1')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('releaseParticipant 후 동일 회의에 새 참가자를 assign 해도 다시 0 부터 시작하진 않고 round-robin 카운터를 유지한다', async () => {
    const { adapter, cleanup } = await setup(1, 2);
    try {
      await adapter.createRoom('CODE1111');
      await adapter.assignParticipant('CODE1111', 's1'); // 0
      await adapter.assignParticipant('CODE1111', 's2'); // 1
      await adapter.releaseParticipant('CODE1111', 's1');
      const next = await adapter.assignParticipant('CODE1111', 's3');
      expect(next).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it('closeRoom 후 해당 회의의 모든 router 가 closed 상태가 된다', async () => {
    const { adapter, cleanup } = await setup(1, 2);
    try {
      await adapter.createRoom('CODE1111');
      const r0 = adapter.getRouterFor('CODE1111', 0);
      const r1 = adapter.getRouterFor('CODE1111', 1);
      await adapter.closeRoom('CODE1111');
      expect(r0.closed).toBe(true);
      expect(r1.closed).toBe(true);
      expect(() => adapter.getRouterFor('CODE1111', 0)).toThrow();
    } finally {
      await cleanup();
    }
  });

  it('서로 다른 회의의 router 풀은 독립적이다', async () => {
    const { adapter, cleanup } = await setup(2, 1);
    try {
      await adapter.createRoom('CODE1111');
      await adapter.createRoom('CODE2222');
      const r1 = adapter.getRouterFor('CODE1111', 0);
      const r2 = adapter.getRouterFor('CODE2222', 0);
      expect(r1.id).not.toBe(r2.id);
    } finally {
      await cleanup();
    }
  });
});
