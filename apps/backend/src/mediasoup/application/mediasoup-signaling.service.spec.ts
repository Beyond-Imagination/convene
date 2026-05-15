import {
  ConsumeResponse,
  CreateTransportResponse,
  MEDIASOUP_EVENTS,
  MediaType,
  TransportDirection,
} from '@migration/shared-interfaces';

import { ParticipantMedia } from '@/mediasoup/domain/participant-media';
import {
  ConsumeInput,
  CreateWebRtcTransportInput,
  MediaRouterPort,
  MediaTransportPort,
  ParticipantMediaRepository,
  ProduceInput,
} from '@/mediasoup/domain/ports';

import { ParticipantMediaNotFoundError } from './mediasoup.errors';
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
      publish: (name: string, payload: unknown) => {
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

const makeService = () => {
  const router = makeRouterPort();
  const transport = makeTransportPort();
  const repo = makeRepository();
  const { events, publisher } = makeEventPublisher();
  const service = new MediasoupSignalingService({
    routerPort: router.port,
    transportPort: transport.port,
    participantMediaRepository: repo.repository,
    eventPublisher: publisher,
  });
  return { service, router, transport, repo, events };
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
    expect(media?.producers).toEqual([{ id: 'p-1', kind: 'audio', source: 'audio' }]);

    expect(events).toEqual([
      {
        name: MEDIASOUP_EVENTS.PRODUCER_CREATED,
        payload: {
          meetingCode,
          participantId: 's1',
          producerId: 'p-1',
          kind: 'audio',
          source: 'audio',
        },
      },
    ]);
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
