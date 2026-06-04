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

const setup = async (numWorkers: number, participantsPerRouter: number) => {
  const pool = newWorkerPool(numWorkers);
  await pool.onModuleInit();
  const adapter = new MediasoupRouterAdapter(pool, { participantsPerRouter, mediaCodecs });
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
  it('createRoom 직후엔 router 1 개만 묶이고 getRtpCapabilities 가 동작한다 (lazy add)', async () => {
    const { adapter, cleanup } = await setup(1, 5);
    try {
      await adapter.createRoom('CODE1111');
      const caps = await adapter.getRtpCapabilities('CODE1111');
      expect(caps).toBeTruthy();
      expect((caps as { codecs: unknown[] }).codecs).toBeDefined();
      // 두 번째 router 는 아직 없다.
      expect(() => adapter.getRouterFor('CODE1111', 1)).toThrow();
    } finally {
      await cleanup();
    }
  });

  it('assignParticipant 는 capacity 안에서 같은 router 에 할당된다', async () => {
    const { adapter, cleanup } = await setup(1, 3);
    try {
      await adapter.createRoom('CODE1111');
      const a = await adapter.assignParticipant('CODE1111', 's1');
      const b = await adapter.assignParticipant('CODE1111', 's2');
      const c = await adapter.assignParticipant('CODE1111', 's3');
      expect([a, b, c]).toEqual([0, 0, 0]);
    } finally {
      await cleanup();
    }
  });

  it('capacity 초과 시 새 router 가 lazy 하게 추가되고 다음 참가자는 그쪽에 할당된다', async () => {
    const { adapter, cleanup } = await setup(2, 2);
    try {
      await adapter.createRoom('CODE1111');
      const a = await adapter.assignParticipant('CODE1111', 's1'); // 0
      const b = await adapter.assignParticipant('CODE1111', 's2'); // 0 (capacity 2)
      const c = await adapter.assignParticipant('CODE1111', 's3'); // 1 (new router)
      const d = await adapter.assignParticipant('CODE1111', 's4'); // 1
      expect([a, b, c, d]).toEqual([0, 0, 1, 1]);
      // router#1 이 추가됐으니 getRouterFor 도 동작.
      expect(adapter.getRouterFor('CODE1111', 1)).toBeDefined();
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

  it('releaseParticipant 후 빈 자리가 생기면 같은 router 에 다음 참가자가 들어간다', async () => {
    const { adapter, cleanup } = await setup(2, 2);
    try {
      await adapter.createRoom('CODE1111');
      await adapter.assignParticipant('CODE1111', 's1'); // 0
      await adapter.assignParticipant('CODE1111', 's2'); // 0
      await adapter.assignParticipant('CODE1111', 's3'); // 1 (new)
      // s1 release → router#0 에 빈 자리 1개
      await adapter.releaseParticipant('CODE1111', 's1');
      const next = await adapter.assignParticipant('CODE1111', 's4');
      expect(next).toBe(0); // 새 router 추가 없이 router#0 빈 자리 사용
    } finally {
      await cleanup();
    }
  });

  it('closeRoom 후 해당 회의의 모든 router 가 closed 상태가 된다', async () => {
    const { adapter, cleanup } = await setup(2, 1);
    try {
      await adapter.createRoom('CODE1111');
      // capacity 초과로 router 2 개 만들기
      await adapter.assignParticipant('CODE1111', 's1');
      await adapter.assignParticipant('CODE1111', 's2');
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

  it('getParticipantRouter 는 assignParticipant 결과의 router 와 동일 인스턴스를 돌려준다', async () => {
    const { adapter, cleanup } = await setup(1, 2);
    try {
      await adapter.createRoom('CODE1111');
      const idx = await adapter.assignParticipant('CODE1111', 's1');
      expect(adapter.getParticipantRouter('CODE1111', 's1')).toBe(
        adapter.getRouterFor('CODE1111', idx),
      );
    } finally {
      await cleanup();
    }
  });

  it('assign 안 된 참가자의 getParticipantRouter 는 throw 한다', async () => {
    const { adapter, cleanup } = await setup(1, 1);
    try {
      await adapter.createRoom('CODE1111');
      expect(() => adapter.getParticipantRouter('CODE1111', 's-no')).toThrow();
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

  it('pipeProducerToAllRouters: 다른 router 의 transport 에서도 동일 producerId 로 consume 가능해진다', async () => {
    // 실제 mediasoup native worker 두 개로 router 2 개를 묶고, router#0 에 만든
    // producer 를 router#1 로 pipe → router#1 의 transport.consume 이 같은 id 로
    // 동작하는지 검증.
    const { adapter, cleanup } = await setup(2, 1);
    try {
      await adapter.createRoom('CODE1111');
      // capacity=1 이라 두 명 입장하면 router 2 개가 자동 생성된다.
      await adapter.assignParticipant('CODE1111', 's1');
      await adapter.assignParticipant('CODE1111', 's2');
      const router0 = adapter.getRouterFor('CODE1111', 0);
      const router1 = adapter.getRouterFor('CODE1111', 1);

      // router#0 에 send transport + producer 생성
      const sendTransport = await router0.createWebRtcTransport({
        listenIps: [{ ip: '127.0.0.1' }],
      });
      const producer = await sendTransport.produce({
        kind: 'audio',
        rtpParameters: {
          codecs: [
            {
              mimeType: 'audio/opus',
              clockRate: 48000,
              channels: 2,
              payloadType: 100,
              rtcpFeedback: [],
            },
          ],
          headerExtensions: [],
          encodings: [{ ssrc: 11111 }],
          rtcp: { cname: 'test' },
        },
      });

      // pipe 호출 전: router#1 에서 producer 못 찾음
      const recvTransport = await router1.createWebRtcTransport({
        listenIps: [{ ip: '127.0.0.1' }],
      });
      await expect(
        recvTransport.consume({
          producerId: producer.id,
          rtpCapabilities: router1.rtpCapabilities,
          paused: true,
        }),
      ).rejects.toThrow();

      // pipe 호출
      await adapter.pipeProducerToAllRouters('CODE1111', producer.id, 0);

      // pipe 후: router#1 의 transport.consume 동작
      const consumer = await recvTransport.consume({
        producerId: producer.id,
        rtpCapabilities: router1.rtpCapabilities,
        paused: true,
      });
      expect(consumer.producerId).toBe(producer.id);

      // cleanup: pipeProducer close
      await adapter.cleanupPipeProducers('CODE1111', producer.id);
      sendTransport.close();
      recvTransport.close();
    } finally {
      await cleanup();
    }
  }, 15_000);

  it('worker 수보다 더 많은 router 가 필요해져도 router 수는 worker 수로 cap 되고, 초과 참가자는 가장 한가한 router 에 over-allocate 된다', async () => {
    // worker 1개 + capacity 1 → router 1개가 max. 두번째 참가자가 와도 같은
    // router 에 over-allocate (mediasoup 가 worker 내 같은 producerId 를 2개
    // router 에 등록할 수 없어서 pipeToRouter 가 channel handler 충돌로 깨짐).
    const { adapter, cleanup } = await setup(1, 1);
    try {
      await adapter.createRoom('CODE1111');
      const a = await adapter.assignParticipant('CODE1111', 's1');
      const b = await adapter.assignParticipant('CODE1111', 's2');
      const c = await adapter.assignParticipant('CODE1111', 's3');
      expect([a, b, c]).toEqual([0, 0, 0]);
      // router#1 은 생성되지 않음
      expect(() => adapter.getRouterFor('CODE1111', 1)).toThrow();
    } finally {
      await cleanup();
    }
  });

  it('한 회의의 router 들은 모두 서로 다른 worker 에 spawn 된다 (다중 방으로 round-robin idx 가 어긋나도)', async () => {
    // 다중 방 시나리오에서 globally round-robin 인 worker idx 가 어긋나
    // 같은 회의의 두 router 가 같은 worker 에 들어가면, pipeToRouter 가 같은
    // producerId 를 한 worker 의 두 router 에 등록하려다 channel handler ID
    // 충돌로 깨진다. 그래서 회의별 worker affinity 가 필요.
    const { adapter, pool, cleanup } = await setup(4, 1);
    try {
      await adapter.createRoom('CODE1111'); // A0 on workerIdx=0
      await adapter.createRoom('CODE2222'); // B0 on workerIdx=1
      await adapter.assignParticipant('CODE1111', 'a1'); // A0 사용
      await adapter.assignParticipant('CODE1111', 'a2'); // A1 추가 (worker !=0)
      await adapter.assignParticipant('CODE1111', 'a3'); // A2 추가 (worker !=0, !=A1)
      await adapter.assignParticipant('CODE1111', 'a4'); // A3 추가 (worker !=0, !=A1, !=A2)

      const usedWorkerIndexes = [0, 1, 2, 3]
        .map((i) => adapter.getRouterFor('CODE1111', i))
        .map((r) => (r.appData as { workerIndex?: number }).workerIndex);
      // 회의 A 의 router 4 개는 모두 다른 worker 에.
      expect(new Set(usedWorkerIndexes).size).toBe(4);
      expect(usedWorkerIndexes.every((idx) => typeof idx === 'number')).toBe(true);
      // pool size 와 동일.
      expect(pool.size).toBe(4);
    } finally {
      await cleanup();
    }
  });

  it('pipeProducerToAllRouters 는 routersPerRoom === 1 이면 no-op (호출만 swallow)', async () => {
    const { adapter, cleanup } = await setup(1, 1);
    try {
      await adapter.createRoom('CODE1111');
      // 존재하지 않는 producerId 라도 single-router 면 throw 하지 않는다.
      await expect(
        adapter.pipeProducerToAllRouters('CODE1111', 'non-existent', 0),
      ).resolves.toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});
