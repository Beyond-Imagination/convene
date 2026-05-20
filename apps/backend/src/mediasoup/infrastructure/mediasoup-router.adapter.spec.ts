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

  it('assignParticipant 는 routersPerRoom 안에서 round-robin 으로 인덱스를 부여한다 (plum hash 기반)', async () => {
    // plum 동일 알고리즘: (hash(roomCode) + participantCount) % routerCount.
    // 시작점은 회의 코드 해시에 따라 다르지만, 같은 회의 안의 연속 할당은
    // 항상 [base, base+1, base, base+1, ...] 패턴이라 두 개 라우터를 균등하게 사용한다.
    const { adapter, cleanup } = await setup(1, 2);
    try {
      await adapter.createRoom('CODE1111');
      const a = await adapter.assignParticipant('CODE1111', 's1');
      const b = await adapter.assignParticipant('CODE1111', 's2');
      const c = await adapter.assignParticipant('CODE1111', 's3');
      const d = await adapter.assignParticipant('CODE1111', 's4');
      // 첫 두 명이 서로 다른 router, 그 다음 두 명도 첫 두 명과 동일한 토글 패턴.
      expect(a).not.toBe(b);
      expect(c).toBe(a);
      expect(d).toBe(b);
      expect(new Set([a, b])).toEqual(new Set([0, 1]));
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

  it('releaseParticipant 후 동일 회의에 새 참가자를 assign 해도 카운터는 그대로 누적되어 round-robin 이 계속된다', async () => {
    const { adapter, cleanup } = await setup(1, 2);
    try {
      await adapter.createRoom('CODE1111');
      const a = await adapter.assignParticipant('CODE1111', 's1');
      await adapter.assignParticipant('CODE1111', 's2');
      await adapter.releaseParticipant('CODE1111', 's1');
      // 3번째 참가자의 인덱스는 (hash + 2) % 2 = (hash + 0) % 2 = s1 의 인덱스와 동일.
      const next = await adapter.assignParticipant('CODE1111', 's3');
      expect(next).toBe(a);
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
    // 동작하는지 검증. plum eager pipe 의 핵심 효과.
    const { adapter, pool, cleanup } = await setup(2, 2);
    try {
      await adapter.createRoom('CODE1111');
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
