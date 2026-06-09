import { ParticipantMedia } from './participant-media';

const baseSpawn = () =>
  ParticipantMedia.spawn({
    participantId: 's1',
    meetingCode: 'ABCDEFGH',
    routerIndex: 0,
  });

describe('ParticipantMedia aggregate', () => {
  describe('spawn', () => {
    it('participantId/meetingCode/routerIndex가 모두 필수다', () => {
      expect(() =>
        ParticipantMedia.spawn({ participantId: '', meetingCode: 'ABCDEFGH', routerIndex: 0 }),
      ).toThrow();
      expect(() =>
        ParticipantMedia.spawn({ participantId: 's1', meetingCode: '', routerIndex: 0 }),
      ).toThrow();
      expect(() =>
        ParticipantMedia.spawn({ participantId: 's1', meetingCode: 'ABCDEFGH', routerIndex: -1 }),
      ).toThrow();
    });

    it('생성 직후엔 transport/producer/consumer 모두 비어있고 닫히지 않았다', () => {
      const pm = baseSpawn();
      expect(pm.participantId).toBe('s1');
      expect(pm.meetingCode).toBe('ABCDEFGH');
      expect(pm.routerIndex).toBe(0);
      expect(pm.sendTransportId).toBeNull();
      expect(pm.recvTransportId).toBeNull();
      expect(pm.producers).toEqual([]);
      expect(pm.consumers).toEqual([]);
      expect(pm.isClosed).toBe(false);
    });
  });

  describe('attachTransport', () => {
    it('send/recv 방향별로 transport id를 저장한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't-send-1');
      pm.attachTransport('recv', 't-recv-1');
      expect(pm.sendTransportId).toBe('t-send-1');
      expect(pm.recvTransportId).toBe('t-recv-1');
    });

    it('같은 방향에 두 번 부착하면 거부한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      expect(() => pm.attachTransport('send', 't2')).toThrow();
    });

    it('transportId가 빈 문자열이면 거부한다', () => {
      const pm = baseSpawn();
      expect(() => pm.attachTransport('send', '')).toThrow();
    });
  });

  describe('addProducer', () => {
    it('send transport 없이 추가하면 거부한다', () => {
      const pm = baseSpawn();
      expect(() => pm.addProducer('p1', { kind: 'audio', source: 'audio' })).toThrow();
    });

    it('producer를 추가하면 목록에 포함된다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.addProducer('p1', { kind: 'audio', source: 'audio' });
      expect(pm.producers).toEqual([{ id: 'p1', kind: 'audio', source: 'audio', paused: false }]);
    });

    it('같은 producerId 중복은 거부한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.addProducer('p1', { kind: 'audio', source: 'audio' });
      expect(() => pm.addProducer('p1', { kind: 'video', source: 'video' })).toThrow();
    });

    it('paused 초깃값을 주면 그대로 반영한다(기본 mute로 입장하는 경우)', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.addProducer('p1', { kind: 'audio', source: 'audio', paused: true });
      expect(pm.producers[0].paused).toBe(true);
    });

    it('paused를 생략하면 false로 시작한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.addProducer('p1', { kind: 'video', source: 'video' });
      expect(pm.producers[0].paused).toBe(false);
    });
  });

  describe('setProducerPaused', () => {
    it('producer의 paused 상태를 갱신한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.addProducer('p1', { kind: 'video', source: 'video' });
      pm.setProducerPaused('p1', true);
      expect(pm.producers[0].paused).toBe(true);
      pm.setProducerPaused('p1', false);
      expect(pm.producers[0].paused).toBe(false);
    });

    it('없는 producer 면 throw 한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      expect(() => pm.setProducerPaused('nope', true)).toThrow();
    });
  });

  describe('addConsumer', () => {
    it('recv transport 없이 추가하면 거부한다', () => {
      const pm = baseSpawn();
      expect(() =>
        pm.addConsumer('c1', { producerId: 'p1', kind: 'audio', source: 'audio' }),
      ).toThrow();
    });

    it('consumer를 추가하면 목록에 포함된다', () => {
      const pm = baseSpawn();
      pm.attachTransport('recv', 't1');
      pm.addConsumer('c1', { producerId: 'p1', kind: 'audio', source: 'audio' });
      expect(pm.consumers).toEqual([
        { id: 'c1', producerId: 'p1', kind: 'audio', source: 'audio' },
      ]);
    });

    it('같은 consumerId 중복은 거부한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('recv', 't1');
      pm.addConsumer('c1', { producerId: 'p1', kind: 'audio', source: 'audio' });
      expect(() =>
        pm.addConsumer('c1', { producerId: 'p2', kind: 'video', source: 'video' }),
      ).toThrow();
    });
  });

  describe('remove', () => {
    it('등록된 producer를 제거하면 목록에서 빠진다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.addProducer('p1', { kind: 'audio', source: 'audio' });
      pm.removeProducer('p1');
      expect(pm.producers).toEqual([]);
    });

    it('등록되지 않은 producer 제거는 거부한다', () => {
      const pm = baseSpawn();
      expect(() => pm.removeProducer('p-none')).toThrow();
    });

    it('등록된 consumer를 제거하면 목록에서 빠진다', () => {
      const pm = baseSpawn();
      pm.attachTransport('recv', 't1');
      pm.addConsumer('c1', { producerId: 'p1', kind: 'audio', source: 'audio' });
      pm.removeConsumer('c1');
      expect(pm.consumers).toEqual([]);
    });

    it('등록되지 않은 consumer 제거는 거부한다', () => {
      const pm = baseSpawn();
      expect(() => pm.removeConsumer('c-none')).toThrow();
    });
  });

  describe('close', () => {
    it('close 후엔 어떤 mutation도 거부한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.attachTransport('recv', 't2');
      pm.close();
      expect(pm.isClosed).toBe(true);
      expect(() => pm.attachTransport('send', 't3')).toThrow();
      expect(() => pm.addProducer('p1', { kind: 'audio', source: 'audio' })).toThrow();
      expect(() =>
        pm.addConsumer('c1', { producerId: 'p1', kind: 'audio', source: 'audio' }),
      ).toThrow();
      expect(() => pm.removeProducer('p1')).toThrow();
      expect(() => pm.removeConsumer('c1')).toThrow();
    });

    it('중복 close는 거부한다', () => {
      const pm = baseSpawn();
      pm.close();
      expect(() => pm.close()).toThrow();
    });
  });

  describe('snapshot', () => {
    it('snapshot은 현재 상태의 readonly 복사본을 반환한다', () => {
      const pm = baseSpawn();
      pm.attachTransport('send', 't1');
      pm.addProducer('p1', { kind: 'audio', source: 'audio' });
      const snap = pm.snapshot();
      expect(snap).toEqual({
        participantId: 's1',
        meetingCode: 'ABCDEFGH',
        routerIndex: 0,
        sendTransportId: 't1',
        recvTransportId: null,
        producers: [{ id: 'p1', kind: 'audio', source: 'audio', paused: false }],
        consumers: [],
        closed: false,
      });
    });
  });

  describe('fromSnapshot (복원)', () => {
    it('snapshot → fromSnapshot → snapshot은 round-trip 동등', () => {
      const original = baseSpawn();
      original.attachTransport('send', 't-send');
      original.attachTransport('recv', 't-recv');
      original.addProducer('p1', { kind: 'audio', source: 'audio' });
      original.addProducer('p2', { kind: 'video', source: 'video' });
      original.addConsumer('c1', { producerId: 'p-other', kind: 'audio', source: 'audio' });

      const restored = ParticipantMedia.fromSnapshot(original.snapshot());
      expect(restored.snapshot()).toEqual(original.snapshot());
    });

    it('closed 상태도 그대로 복원하고 mutation을 거부한다', () => {
      const original = baseSpawn();
      original.close();
      const restored = ParticipantMedia.fromSnapshot(original.snapshot());
      expect(restored.isClosed).toBe(true);
      expect(() => restored.attachTransport('send', 't1')).toThrow(/closed/);
    });

    it('복원된 ParticipantMedia는 이어서 mutation 가능하다(transport 부착·producer 추가)', () => {
      const original = baseSpawn();
      original.attachTransport('send', 't-send');
      const restored = ParticipantMedia.fromSnapshot(original.snapshot());

      restored.attachTransport('recv', 't-recv');
      restored.addProducer('p1', { kind: 'audio', source: 'audio' });
      expect(restored.producers).toEqual([
        { id: 'p1', kind: 'audio', source: 'audio', paused: false },
      ]);
    });
  });
});
