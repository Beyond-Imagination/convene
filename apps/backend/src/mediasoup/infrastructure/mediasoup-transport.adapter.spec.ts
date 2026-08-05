import { RtpCodecCapability, WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';

import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { stub } from '@/shared-kernel/testing/stub';

import { MediasoupRouterAdapter } from './mediasoup-router.adapter';
import { MediasoupTransportAdapter } from './mediasoup-transport.adapter';
import { MediasoupWorkerPool } from './mediasoup-worker.pool';

const noopLogger = stub<PinoLoggerAdapter>({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

const mediaCodecs = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
] as RtpCodecCapability[];

const setup = async () => {
  const pool = new MediasoupWorkerPool(
    {
      numWorkers: 1,
      worker: {
        rtcMinPort: 40000,
        rtcMaxPort: 49999,
        logLevel: 'error' as WorkerLogLevel,
        logTags: ['info'] as WorkerLogTag[],
      },
    },
    noopLogger,
  );
  await pool.onModuleInit();
  const routerAdapter = new MediasoupRouterAdapter(
    pool,
    {
      participantsPerRouter: 5,
      mediaCodecs,
    },
    noopLogger,
  );
  const transportAdapter = new MediasoupTransportAdapter(routerAdapter, {
    listenIps: [{ ip: '127.0.0.1', announcedIp: '127.0.0.1' }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
  });
  await routerAdapter.createRoom('CODE1111');
  await routerAdapter.assignParticipant('CODE1111', 's1');
  return {
    pool,
    routerAdapter,
    transportAdapter,
    cleanup: async () => {
      await routerAdapter.closeRoom('CODE1111');
      await pool.onModuleDestroy();
    },
  };
};

describe('MediasoupTransportAdapter', () => {
  it('createWebRtcTransport는 회의의 router 위에서 transport를 만들고 wire format 응답을 반환한다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      const res = await transportAdapter.createWebRtcTransport({
        meetingCode: 'CODE1111',
        participantId: 's1',
        direction: 'send',
      });

      expect(typeof res.id).toBe('string');
      expect(res.id.length).toBeGreaterThan(0);
      expect(res.iceParameters).toEqual(
        expect.objectContaining({
          usernameFragment: expect.any(String),
          password: expect.any(String),
        }),
      );
      expect(Array.isArray(res.iceCandidates)).toBe(true);
      expect((res.iceCandidates as unknown[]).length).toBeGreaterThan(0);
      expect(res.dtlsParameters).toEqual(
        expect.objectContaining({ fingerprints: expect.any(Array) }),
      );
    } finally {
      await cleanup();
    }
  });

  it('assign 안 된 참가자의 createWebRtcTransport는 throw 한다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      await expect(
        transportAdapter.createWebRtcTransport({
          meetingCode: 'CODE1111',
          participantId: 's-no',
          direction: 'send',
        }),
      ).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('createWebRtcTransport 호출 후 closeTransport로 닫으면 transport가 더이상 동작하지 않는다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      const res = await transportAdapter.createWebRtcTransport({
        meetingCode: 'CODE1111',
        participantId: 's1',
        direction: 'send',
      });
      await transportAdapter.closeTransport(res.id);
      // 같은 transportId로 connect 시도 시 throw (없거나 닫힘)
      await expect(
        transportAdapter.connectTransport(res.id, { fingerprints: [] }),
      ).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('알 수 없는 transportId로 connectTransport를 호출하면 throw 한다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      await expect(
        transportAdapter.connectTransport('t-unknown', { fingerprints: [] }),
      ).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('알 수 없는 transportId로 produce를 호출하면 throw 한다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      await expect(
        transportAdapter.produce({
          meetingCode: 'CODE1111',
          participantId: 's1',
          transportId: 't-unknown',
          kind: 'audio',
          source: 'audio',
          rtpParameters: {},
        }),
      ).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('알 수 없는 consumerId로 resumeConsumer를 호출하면 throw 한다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      await expect(transportAdapter.resumeConsumer('c-unknown')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('알 수 없는 producerId로 pauseProducer를 호출하면 throw 한다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      await expect(transportAdapter.pauseProducer('p-unknown')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('알 수 없는 producerId로 resumeProducer를 호출하면 throw 한다', async () => {
    const { transportAdapter, cleanup } = await setup();
    try {
      await expect(transportAdapter.resumeProducer('p-unknown')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });
});
