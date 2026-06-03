import {
  ConsumeResponse,
  CreateTransportResponse,
  MEDIASOUP_EVENTS,
  MediaType,
  TransportDirection,
} from '@convene/shared-interfaces';

import { ParticipantMedia } from '@/mediasoup/domain/participant-media';
import {
  AudioCapturePort,
  AudioCaptureStartInput,
  ConsumeInput,
  CreateWebRtcTransportInput,
  MediaRouterPort,
  MediaTransportPort,
  ParticipantMediaRepository,
  ProduceInput,
} from '@/mediasoup/domain/ports';

import { ParticipantMediaNotFoundError, ScreenShareConflictError } from './mediasoup.errors';
import { MediasoupSignalingService } from './mediasoup-signaling.service';

interface CapturedEvent {
  name: string;
  payload: unknown;
}
interface CapturedCall {
  name: string;
  args: unknown[];
}

const makeEventPublisher = () => {
  const events: CapturedEvent[] = [];
  return {
    events,
    publisher: {
      publish: async (name: string, payload: unknown): Promise<void> => {
        events.push({ name, payload });
      },
    },
  };
};

const makeRouterPort = () => {
  const calls: CapturedCall[] = [];
  const rooms = new Map<string, { closed: boolean; assignments: Map<string, number> }>();
  const port: MediaRouterPort = {
    async createRoom(code) {
      calls.push({ name: 'createRoom', args: [code] });
      rooms.set(code, { closed: false, assignments: new Map() });
    },
    async closeRoom(code) {
      calls.push({ name: 'closeRoom', args: [code] });
      const room = rooms.get(code);
      if (room) room.closed = true;
    },
    async getRtpCapabilities(code) {
      calls.push({ name: 'getRtpCapabilities', args: [code] });
      return { fakeRtpCaps: code };
    },
    async assignParticipant(code, pid) {
      calls.push({ name: 'assignParticipant', args: [code, pid] });
      const room = rooms.get(code);
      if (!room) throw new Error(`room ${code} not opened`);
      const idx = room.assignments.size;
      room.assignments.set(pid, idx);
      return idx;
    },
    async releaseParticipant(code, pid) {
      calls.push({ name: 'releaseParticipant', args: [code, pid] });
      rooms.get(code)?.assignments.delete(pid);
    },
    async pipeProducerToAllRouters(code, producerId, sourceRouterIndex) {
      calls.push({
        name: 'pipeProducerToAllRouters',
        args: [code, producerId, sourceRouterIndex],
      });
    },
    async cleanupPipeProducers(code, producerId) {
      calls.push({ name: 'cleanupPipeProducers', args: [code, producerId] });
    },
  };
  return { calls, rooms, port };
};

const makeTransportPort = () => {
  const calls: CapturedCall[] = [];
  let transportCounter = 0;
  let producerCounter = 0;
  let consumerCounter = 0;
  const port: MediaTransportPort = {
    async createWebRtcTransport(input: CreateWebRtcTransportInput): Promise<CreateTransportResponse> {
      calls.push({ name: 'createWebRtcTransport', args: [input] });
      transportCounter += 1;
      return {
        id: `t-${transportCounter}`,
        iceParameters: { usernameFragment: 'u' },
        iceCandidates: [{ ip: '1.2.3.4', port: 1234 }],
        dtlsParameters: { fingerprints: [] },
      };
    },
    async connectTransport(transportId, dtlsParameters) {
      calls.push({ name: 'connectTransport', args: [transportId, dtlsParameters] });
    },
    async produce(input: ProduceInput) {
      calls.push({ name: 'produce', args: [input] });
      producerCounter += 1;
      return { producerId: `p-${producerCounter}` };
    },
    async consume(input: ConsumeInput): Promise<ConsumeResponse> {
      calls.push({ name: 'consume', args: [input] });
      consumerCounter += 1;
      return {
        id: `c-${consumerCounter}`,
        producerId: input.producerId,
        kind: 'audio',
        rtpParameters: {},
      };
    },
    async resumeConsumer(consumerId) {
      calls.push({ name: 'resumeConsumer', args: [consumerId] });
    },
    async pauseProducer(producerId) {
      calls.push({ name: 'pauseProducer', args: [producerId] });
    },
    async resumeProducer(producerId) {
      calls.push({ name: 'resumeProducer', args: [producerId] });
    },
    async closeProducer(producerId) {
      calls.push({ name: 'closeProducer', args: [producerId] });
    },
    async closeTransport(transportId) {
      calls.push({ name: 'closeTransport', args: [transportId] });
    },
  };
  return { calls, port };
};

const makeRepository = () => {
  const store = new Map<string, ParticipantMedia>();
  const repository: ParticipantMediaRepository = {
    async save(media) {
      store.set(media.participantId, media);
    },
    async findByParticipantId(pid) {
      return store.get(pid) ?? null;
    },
    async findByMeetingCode(code) {
      return Array.from(store.values()).filter((m) => m.meetingCode === code);
    },
    async removeByParticipantId(pid) {
      store.delete(pid);
    },
    async removeAllByMeetingCode(code) {
      for (const [pid, m] of store) {
        if (m.meetingCode === code) store.delete(pid);
      }
    },
  };
  return { store, repository };
};

const makeAudioCapture = () => {
  const calls: CapturedCall[] = [];
  const port: AudioCapturePort = {
    async start(input: AudioCaptureStartInput) {
      calls.push({ name: 'start', args: [input] });
    },
    async stop(code, pid) {
      calls.push({ name: 'stop', args: [code, pid] });
    },
    async stopAll(code) {
      calls.push({ name: 'stopAll', args: [code] });
    },
  };
  return { calls, port };
};

const makeService = () => {
  const router = makeRouterPort();
  const transport = makeTransportPort();
  const repo = makeRepository();
  const audioCapture = makeAudioCapture();
  const { events, publisher } = makeEventPublisher();
  const service = new MediasoupSignalingService({
    routerPort: router.port,
    transportPort: transport.port,
    participantMediaRepository: repo.repository,
    audioCapture: audioCapture.port,
    eventPublisher: publisher,
  });
  return { service, router, transport, repo, audioCapture, events };
};

const meetingCode = 'ABCDEFGH';

describe('MediasoupSignalingService.openRoom', () => {
  it('routerPort.createRoom 을 meetingCode 와 함께 호출한다', async () => {
    const { service, router } = makeService();
    await service.openRoom({ meetingCode });
    expect(router.calls).toEqual([{ name: 'createRoom', args: [meetingCode] }]);
  });
});

describe('MediasoupSignalingService.closeRoom', () => {
  it('회의에 속한 ParticipantMedia 전부 제거 후 routerPort.closeRoom 을 호출한다', async () => {
    const { service, router, repo } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.admitParticipant({ meetingCode, participantId: 's2' });
    await service.closeRoom({ meetingCode });
    expect(repo.store.size).toBe(0);
    expect(router.calls.some((c) => c.name === 'closeRoom' && c.args[0] === meetingCode)).toBe(
      true,
    );
  });

  it('회의 단위로 audioCapture.stopAll 을 호출한다', async () => {
    const { service, audioCapture } = makeService();
    await service.openRoom({ meetingCode });
    await service.closeRoom({ meetingCode });
    expect(audioCapture.calls).toEqual([{ name: 'stopAll', args: [meetingCode] }]);
  });
});

describe('MediasoupSignalingService.admitParticipant', () => {
  it('routerPort.assignParticipant 로 받은 routerIndex 로 ParticipantMedia 를 생성·저장한다', async () => {
    const { service, router, repo } = makeService();
    await service.openRoom({ meetingCode });
    const media = await service.admitParticipant({ meetingCode, participantId: 's1' });
    expect(media.routerIndex).toBe(0);
    expect(media.participantId).toBe('s1');
    expect(media.meetingCode).toBe(meetingCode);
    expect(await repo.repository.findByParticipantId('s1')).not.toBeNull();
    expect(
      router.calls.some(
        (c) =>
          c.name === 'assignParticipant' && c.args[0] === meetingCode && c.args[1] === 's1',
      ),
    ).toBe(true);
  });

  it('두 번째 참가자의 routerIndex 는 routerPort 가 반환한 값을 그대로 따른다', async () => {
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    const m2 = await service.admitParticipant({ meetingCode, participantId: 's2' });
    expect(m2.routerIndex).toBe(1);
  });
});

describe('MediasoupSignalingService.dismissParticipant', () => {
  it('ParticipantMedia 를 제거하고 routerPort.releaseParticipant 를 호출한다', async () => {
    const { service, router, repo } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.dismissParticipant({ meetingCode, participantId: 's1' });
    expect(repo.store.has('s1')).toBe(false);
    expect(
      router.calls.some(
        (c) => c.name === 'releaseParticipant' && c.args[1] === 's1',
      ),
    ).toBe(true);
  });

  it('ParticipantMedia 가 없어도 routerPort.releaseParticipant 는 호출되어 멱등이다', async () => {
    const { service, router } = makeService();
    await service.openRoom({ meetingCode });
    await service.dismissParticipant({ meetingCode, participantId: 's-unknown' });
    expect(
      router.calls.some(
        (c) => c.name === 'releaseParticipant' && c.args[1] === 's-unknown',
      ),
    ).toBe(true);
  });

  it('audioCapture.stop 도 함께 호출한다(capture 가 없으면 어댑터가 멱등 처리)', async () => {
    const { service, audioCapture } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    audioCapture.calls.length = 0;
    await service.dismissParticipant({ meetingCode, participantId: 's1' });
    expect(
      audioCapture.calls.some(
        (c) => c.name === 'stop' && c.args[0] === meetingCode && c.args[1] === 's1',
      ),
    ).toBe(true);
  });
});

describe('MediasoupSignalingService.getRtpCapabilities', () => {
  it('routerPort.getRtpCapabilities 의 반환을 그대로 노출한다', async () => {
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    const caps = await service.getRtpCapabilities({ meetingCode });
    expect(caps).toEqual({ fakeRtpCaps: meetingCode });
  });
});

describe('MediasoupSignalingService.createTransport', () => {
  it('transportPort.createWebRtcTransport 응답을 그대로 반환하고 ParticipantMedia.attachTransport 한다', async () => {
    const { service, repo } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });

    const dir: TransportDirection = 'send';
    const res = await service.createTransport({
      meetingCode,
      participantId: 's1',
      direction: dir,
    });

    expect(res.id).toBe('t-1');
    expect(res.iceParameters).toEqual({ usernameFragment: 'u' });

    const media = await repo.repository.findByParticipantId('s1');
    expect(media?.sendTransportId).toBe('t-1');
    expect(media?.recvTransportId).toBeNull();
  });

  it('recv 방향이면 recvTransportId 에 저장한다', async () => {
    const { service, repo } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'recv' });
    const media = await repo.repository.findByParticipantId('s1');
    expect(media?.recvTransportId).toBe('t-1');
    expect(media?.sendTransportId).toBeNull();
  });

  it('admit 하지 않은 참가자라면 ParticipantMediaNotFoundError 를 던진다', async () => {
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    await expect(
      service.createTransport({ meetingCode, participantId: 's-no', direction: 'send' }),
    ).rejects.toBeInstanceOf(ParticipantMediaNotFoundError);
  });
});

describe('MediasoupSignalingService.connectTransport', () => {
  it('transportPort.connectTransport 에 transportId/dtlsParameters 를 그대로 위임한다', async () => {
    const { service, transport } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });

    await service.connectTransport({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      dtlsParameters: { fingerprints: ['fp'] },
    });

    expect(
      transport.calls.some(
        (c) =>
          c.name === 'connectTransport' &&
          c.args[0] === 't-1' &&
          JSON.stringify(c.args[1]) === JSON.stringify({ fingerprints: ['fp'] }),
      ),
    ).toBe(true);
  });
});

describe('MediasoupSignalingService.produce', () => {
  it('transportPort.produce → ParticipantMedia.addProducer → PRODUCER_CREATED 발행', async () => {
    const { service, repo, events } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });

    const audio: MediaType = 'audio';
    const res = await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'audio',
      source: audio,
      rtpParameters: { codecs: [] },
    });

    expect(res.producerId).toBe('p-1');

    const media = await repo.repository.findByParticipantId('s1');
    expect(media?.producers).toEqual([
      { id: 'p-1', kind: 'audio', source: 'audio', paused: false },
    ]);

    expect(events).toEqual([
      {
        name: MEDIASOUP_EVENTS.PRODUCER_CREATED,
        payload: {
          meetingCode,
          participantId: 's1',
          producerId: 'p-1',
          kind: 'audio',
          source: 'audio',
          paused: false,
        },
      },
    ]);
  });

  it('paused:true 로 produce 하면 transportPort.produce·addProducer·PRODUCER_CREATED 에 모두 실린다', async () => {
    const { service, repo, events, transport } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });

    await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'video',
      source: 'video',
      rtpParameters: { codecs: [] },
      paused: true,
    });

    // 1) transport 어댑터에 paused 가 전달돼 paused producer 로 생성된다.
    const produceCall = transport.calls.find((c) => c.name === 'produce');
    expect(produceCall?.args[0]).toMatchObject({ paused: true });

    // 2) 도메인에도 paused 가 반영된다(늦은 입장자 LIST_PRODUCERS 정확성).
    const media = await repo.repository.findByParticipantId('s1');
    expect(media?.producers[0].paused).toBe(true);

    // 3) NEW_PRODUCER 로 나갈 payload 에도 paused 가 실린다.
    expect(events[0]).toMatchObject({
      name: MEDIASOUP_EVENTS.PRODUCER_CREATED,
      payload: { producerId: 'p-1', paused: true },
    });
  });

  it('admit 안 된 참가자의 produce 는 거부한다', async () => {
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    await expect(
      service.produce({
        meetingCode,
        participantId: 's-no',
        transportId: 't-x',
        kind: 'audio',
        source: 'audio',
        rtpParameters: {},
      }),
    ).rejects.toBeInstanceOf(ParticipantMediaNotFoundError);
  });

  it('audio producer 가 생기면 audioCapture.start 를 producerId 와 함께 호출한다', async () => {
    const { service, audioCapture } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });
    audioCapture.calls.length = 0;

    await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'audio',
      source: 'audio',
      rtpParameters: {},
    });

    expect(audioCapture.calls).toEqual([
      {
        name: 'start',
        args: [{ meetingCode, participantId: 's1', producerId: 'p-1' }],
      },
    ]);
  });

  it('video producer 에 대해서는 audioCapture.start 를 호출하지 않는다', async () => {
    const { service, audioCapture } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });
    audioCapture.calls.length = 0;

    await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'video',
      source: 'video',
      rtpParameters: {},
    });

    expect(audioCapture.calls.filter((c) => c.name === 'start')).toEqual([]);
  });

  it('produce 직후 routerPort.pipeProducerToAllRouters 를 자기 routerIndex 로 호출한다 (plum eager pipe)', async () => {
    const { service, router } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });
    router.calls.length = 0;

    await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'video',
      source: 'video',
      rtpParameters: {},
    });

    const pipeCall = router.calls.find((c) => c.name === 'pipeProducerToAllRouters');
    expect(pipeCall).toBeDefined();
    expect(pipeCall!.args[0]).toBe(meetingCode);
    expect(pipeCall!.args[1]).toBe('p-1');
    // s1 의 routerIndex (assign 시 받은 값) 가 sourceRouterIndex 로 전달되어야 한다.
    expect(typeof pipeCall!.args[2]).toBe('number');
  });

  it('이미 다른 참가자가 screen 공유 중이면 screen produce 를 ScreenShareConflictError 로 거부한다', async () => {
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.admitParticipant({ meetingCode, participantId: 's2' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });
    await service.createTransport({ meetingCode, participantId: 's2', direction: 'send' });
    // s1 이 먼저 화면 공유.
    await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'video',
      source: 'screen',
      rtpParameters: {},
    });
    // s2 가 화면 공유 시도 → 동시 1인 제약 위반으로 거부.
    await expect(
      service.produce({
        meetingCode,
        participantId: 's2',
        transportId: 't-2',
        kind: 'video',
        source: 'screen',
        rtpParameters: {},
      }),
    ).rejects.toBeInstanceOf(ScreenShareConflictError);
  });

  it('다른 참가자가 screen 공유 중이어도 일반 video/audio produce 는 허용한다', async () => {
    const { service, repo } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.admitParticipant({ meetingCode, participantId: 's2' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });
    await service.createTransport({ meetingCode, participantId: 's2', direction: 'send' });
    await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'video',
      source: 'screen',
      rtpParameters: {},
    });
    const res = await service.produce({
      meetingCode,
      participantId: 's2',
      transportId: 't-2',
      kind: 'video',
      source: 'video',
      rtpParameters: {},
    });
    expect(res.producerId).toBeDefined();
    const s2 = await repo.repository.findByParticipantId('s2');
    expect(s2?.producers.some((p) => p.source === 'video')).toBe(true);
  });

  it('같은 참가자가 자기 screen producer 를 (정리 후) 다시 만드는 것은 막지 않는다', async () => {
    // backend 는 "자기 자신을 제외한" 다른 참가자의 screen 만 충돌로 본다.
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'send' });
    await service.produce({
      meetingCode,
      participantId: 's1',
      transportId: 't-1',
      kind: 'video',
      source: 'screen',
      rtpParameters: {},
    });
    // 같은 s1 의 추가 screen produce 는 conflict 가 아니다(자기 자신 제외).
    await expect(
      service.produce({
        meetingCode,
        participantId: 's1',
        transportId: 't-1',
        kind: 'video',
        source: 'screen',
        rtpParameters: {},
      }),
    ).resolves.toBeDefined();
  });
});

describe('MediasoupSignalingService.closeProducer', () => {
  const setupWithScreenProducer = async (participantId = 's1') => {
    const ctx = makeService();
    await ctx.service.openRoom({ meetingCode });
    await ctx.service.admitParticipant({ meetingCode, participantId });
    await ctx.service.createTransport({ meetingCode, participantId, direction: 'send' });
    const produced = await ctx.service.produce({
      meetingCode,
      participantId,
      transportId: 't-1',
      kind: 'video',
      source: 'screen',
      rtpParameters: {},
    });
    return { ...ctx, producerId: produced.producerId, participantId };
  };

  it('transportPort.closeProducer 위임 + ParticipantMedia 에서 producer 제거 + pipe 정리', async () => {
    const { service, transport, router, repo, producerId } = await setupWithScreenProducer();
    transport.calls.length = 0;
    router.calls.length = 0;

    await service.closeProducer({ meetingCode, participantId: 's1', producerId });

    expect(transport.calls).toContainEqual({ name: 'closeProducer', args: [producerId] });
    expect(router.calls).toContainEqual({
      name: 'cleanupPipeProducers',
      args: [meetingCode, producerId],
    });
    const media = await repo.repository.findByParticipantId('s1');
    expect(media?.producers.some((p) => p.id === producerId)).toBe(false);
  });

  it('자기 소유가 아닌 producerId 의 close 는 거부하고 transport 를 건드리지 않는다', async () => {
    const { service, transport, producerId } = await setupWithScreenProducer();
    await service.admitParticipant({ meetingCode, participantId: 's2' });
    transport.calls.length = 0;
    await expect(
      service.closeProducer({ meetingCode, participantId: 's2', producerId }),
    ).rejects.toThrow();
    expect(transport.calls).toEqual([]);
  });

  it('producer 를 close 하면 같은 source 로 다시 produce 할 수 있다(제약 해제 검증)', async () => {
    const { service, producerId } = await setupWithScreenProducer();
    await service.closeProducer({ meetingCode, participantId: 's1', producerId });
    // s2 가 이제 화면 공유 가능(s1 이 점유 해제).
    await service.admitParticipant({ meetingCode, participantId: 's2' });
    await service.createTransport({ meetingCode, participantId: 's2', direction: 'send' });
    await expect(
      service.produce({
        meetingCode,
        participantId: 's2',
        transportId: 't-2',
        kind: 'video',
        source: 'screen',
        rtpParameters: {},
      }),
    ).resolves.toBeDefined();
  });
});

describe('MediasoupSignalingService.consume', () => {
  const setupTwoPeersWithS2Producer = async () => {
    const ctx = makeService();
    const { service } = ctx;
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.admitParticipant({ meetingCode, participantId: 's2' });
    await service.createTransport({ meetingCode, participantId: 's2', direction: 'send' });
    const produced = await service.produce({
      meetingCode,
      participantId: 's2',
      transportId: 't-1',
      kind: 'audio',
      source: 'audio',
      rtpParameters: {},
    });
    await service.createTransport({ meetingCode, participantId: 's1', direction: 'recv' });
    return { ...ctx, producerId: produced.producerId };
  };

  it('transportPort.consume 응답을 반환하고 ParticipantMedia.addConsumer 한다', async () => {
    const { service, repo, producerId } = await setupTwoPeersWithS2Producer();
    const res = await service.consume({
      meetingCode,
      participantId: 's1',
      transportId: 't-2',
      producerId,
      rtpCapabilities: {},
    });
    expect(res.id).toBe('c-1');
    expect(res.producerId).toBe(producerId);

    const media = await repo.repository.findByParticipantId('s1');
    expect(media?.consumers).toHaveLength(1);
    expect(media?.consumers[0]).toMatchObject({
      id: 'c-1',
      producerId,
      kind: 'audio',
      source: 'audio',
    });
  });

  it('admit 안 된 참가자의 consume 은 거부한다', async () => {
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    await expect(
      service.consume({
        meetingCode,
        participantId: 's-no',
        transportId: 't-x',
        producerId: 'p-x',
        rtpCapabilities: {},
      }),
    ).rejects.toBeInstanceOf(ParticipantMediaNotFoundError);
  });
});

describe('MediasoupSignalingService.resumeConsumer', () => {
  it('transportPort.resumeConsumer 에 consumerId 를 그대로 위임한다', async () => {
    const { service, transport } = makeService();
    await service.openRoom({ meetingCode });
    await service.admitParticipant({ meetingCode, participantId: 's1' });
    await service.resumeConsumer({ meetingCode, participantId: 's1', consumerId: 'c-1' });
    expect(
      transport.calls.some(
        (c) => c.name === 'resumeConsumer' && c.args[0] === 'c-1',
      ),
    ).toBe(true);
  });
});

describe('MediasoupSignalingService.listProducers', () => {
  const setupTwoProducers = async () => {
    const ctx = makeService();
    await ctx.service.openRoom({ meetingCode });
    await ctx.service.admitParticipant({ meetingCode, participantId: 's1' });
    await ctx.service.admitParticipant({ meetingCode, participantId: 's2' });
    await ctx.service.createTransport({
      meetingCode,
      participantId: 's1',
      direction: 'send',
    });
    const s1Media = (
      await ctx.repo.repository.findByMeetingCode(meetingCode)
    ).find((p) => p.participantId === 's1')!;
    await ctx.service.produce({
      meetingCode,
      participantId: 's1',
      transportId: s1Media.sendTransportId!,
      kind: 'audio',
      source: 'audio',
      rtpParameters: {},
    });
    await ctx.service.produce({
      meetingCode,
      participantId: 's1',
      transportId: s1Media.sendTransportId!,
      kind: 'video',
      source: 'video',
      rtpParameters: {},
    });
    return ctx;
  };

  it('회의 안의 다른 참가자 producer 들을 NewProducerBroadcast 배열로 반환한다', async () => {
    const { service } = await setupTwoProducers();
    const res = await service.listProducers({
      meetingCode,
      participantId: 's2',
    });
    expect(res.producers).toHaveLength(2);
    expect(res.producers.map((p) => p.kind).sort()).toEqual(['audio', 'video']);
    expect(res.producers.every((p) => p.peerSocketId === 's1')).toBe(true);
  });

  it('자기 자신의 producer 는 제외한다', async () => {
    const { service } = await setupTwoProducers();
    const res = await service.listProducers({
      meetingCode,
      participantId: 's1',
    });
    expect(res.producers).toEqual([]);
  });

  it('회의에 admit 되지 않은 참가자라도 다른 참가자 producer 목록은 받을 수 있다', async () => {
    const { service } = await setupTwoProducers();
    const res = await service.listProducers({
      meetingCode,
      participantId: 'unknown-sid',
    });
    expect(res.producers).toHaveLength(2);
  });
});

describe('MediasoupSignalingService.toggleProducer', () => {
  const setupWithProducer = async () => {
    const ctx = makeService();
    await ctx.service.openRoom({ meetingCode });
    await ctx.service.admitParticipant({ meetingCode, participantId: 's1' });
    await ctx.service.createTransport({
      meetingCode,
      participantId: 's1',
      direction: 'send',
    });
    const s1Media = (await ctx.repo.repository.findByMeetingCode(meetingCode)).find(
      (p) => p.participantId === 's1',
    )!;
    const produced = await ctx.service.produce({
      meetingCode,
      participantId: 's1',
      transportId: s1Media.sendTransportId!,
      kind: 'audio',
      source: 'audio',
      rtpParameters: {},
    });
    return { ...ctx, producerId: produced.producerId };
  };

  it('paused:true 면 transportPort.pauseProducer 에 위임한다', async () => {
    const { service, transport, producerId } = await setupWithProducer();
    transport.calls.length = 0;
    await service.toggleProducer({
      meetingCode,
      participantId: 's1',
      producerId,
      paused: true,
    });
    expect(transport.calls).toEqual([{ name: 'pauseProducer', args: [producerId] }]);
  });

  it('paused:false 면 transportPort.resumeProducer 에 위임한다', async () => {
    const { service, transport, producerId } = await setupWithProducer();
    transport.calls.length = 0;
    await service.toggleProducer({
      meetingCode,
      participantId: 's1',
      producerId,
      paused: false,
    });
    expect(transport.calls).toEqual([{ name: 'resumeProducer', args: [producerId] }]);
  });

  it('자기 소유가 아닌 producerId 는 거부하고 transport 를 건드리지 않는다', async () => {
    const { service, transport, producerId } = await setupWithProducer();
    await service.admitParticipant({ meetingCode, participantId: 's2' });
    transport.calls.length = 0;
    await expect(
      service.toggleProducer({
        meetingCode,
        participantId: 's2',
        producerId,
        paused: true,
      }),
    ).rejects.toThrow();
    expect(transport.calls).toEqual([]);
  });

  it('admit 안 된 참가자의 toggleProducer 는 거부한다', async () => {
    const { service } = makeService();
    await service.openRoom({ meetingCode });
    await expect(
      service.toggleProducer({
        meetingCode,
        participantId: 's-no',
        producerId: 'p-x',
        paused: true,
      }),
    ).rejects.toBeInstanceOf(ParticipantMediaNotFoundError);
  });
});
