import { Participant } from './participant';

describe('Participant', () => {
  const at0 = new Date('2026-01-01T00:00:00Z');
  const at1 = new Date('2026-01-01T00:01:00Z');

  describe('join', () => {
    it('정상 입력으로 active 상태의 Participant를 만든다', () => {
      const p = Participant.join('socket-1', 'alice', at0);
      expect(p.id).toBe('socket-1');
      expect(p.nickname).toBe('alice');
      expect(p.joinedAt).toBe(at0);
      expect(p.leftAt).toBeNull();
      expect(p.isActive).toBe(true);
    });

    it('닉네임 앞뒤 공백은 자동 trim 한다', () => {
      const p = Participant.join('socket-1', '  alice  ', at0);
      expect(p.nickname).toBe('alice');
    });

    it.each(['', '   '])('id가 비어 있으면 거부한다: "%s"', (id) => {
      expect(() => Participant.join(id, 'alice', at0)).toThrow(/Participant\.id/);
    });

    it.each(['', '   '])('닉네임이 trim 후 비어 있으면 거부한다: "%s"', (nick) => {
      expect(() => Participant.join('socket-1', nick, at0)).toThrow(/nickname/);
    });

    it('닉네임이 30자를 넘으면 거부한다', () => {
      const long = 'a'.repeat(31);
      expect(() => Participant.join('socket-1', long, at0)).toThrow(/nickname/);
    });
  });

  describe('leave', () => {
    it('leave 호출 후 inactive 상태가 되고 leftAt이 기록된다', () => {
      const p = Participant.join('socket-1', 'alice', at0);
      p.leave(at1);
      expect(p.isActive).toBe(false);
      expect(p.leftAt).toBe(at1);
    });

    it('이미 leave한 Participant를 다시 leave하면 거부한다', () => {
      const p = Participant.join('socket-1', 'alice', at0);
      p.leave(at1);
      expect(() => p.leave(at1)).toThrow(/already left/);
    });

    it('leftAt이 joinedAt보다 이르면 거부한다', () => {
      const p = Participant.join('socket-1', 'alice', at1);
      expect(() => p.leave(at0)).toThrow(/cannot be earlier/);
    });
  });

  describe('identity', () => {
    it('equals는 id만으로 동등성을 판단한다(닉네임 무관)', () => {
      const p1 = Participant.join('socket-1', 'alice', at0);
      const p2 = Participant.join('socket-1', 'bob', at1);
      const p3 = Participant.join('socket-2', 'alice', at0);
      expect(p1.equals(p2)).toBe(true);
      expect(p1.equals(p3)).toBe(false);
    });
  });

  describe('snapshot', () => {
    it('현재 상태를 plain object로 노출한다(영속화·이관용)', () => {
      const p = Participant.join('socket-1', 'alice', at0);
      expect(p.snapshot()).toEqual({
        id: 'socket-1',
        nickname: 'alice',
        joinedAt: at0,
        leftAt: null,
        connectionId: 'socket-1',
        disconnectedAt: null,
      });
      p.leave(at1);
      expect(p.snapshot()).toEqual({
        id: 'socket-1',
        nickname: 'alice',
        joinedAt: at0,
        connectionId: 'socket-1',
        disconnectedAt: null,
        leftAt: at1,
      });
    });
  });

  describe('fromSnapshot', () => {
    it('active 상태 snapshot으로부터 동일한 Participant를 복원한다', () => {
      const restored = Participant.fromSnapshot({
        id: 'socket-1',
        nickname: 'alice',
        joinedAt: at0,
        leftAt: null,
      });
      expect(restored.id).toBe('socket-1');
      expect(restored.nickname).toBe('alice');
      expect(restored.joinedAt).toBe(at0);
      expect(restored.isActive).toBe(true);
      expect(restored.leftAt).toBeNull();
    });

    it('leave 한 snapshot으로부터 inactive 상태를 그대로 복원한다', () => {
      const restored = Participant.fromSnapshot({
        id: 'socket-1',
        nickname: 'alice',
        joinedAt: at0,
        leftAt: at1,
      });
      expect(restored.isActive).toBe(false);
      expect(restored.leftAt).toBe(at1);
      expect(() => restored.leave(at1)).toThrow(/already left/);
    });

    it('snapshot → fromSnapshot → snapshot은 round-trip 동등', () => {
      const original = Participant.join('socket-1', 'alice', at0);
      original.leave(at1);
      const restored = Participant.fromSnapshot(original.snapshot());
      expect(restored.snapshot()).toEqual(original.snapshot());
    });

    it('connectionId·disconnectedAt이 없는 구버전 snapshot은 id를 연결로 보고 복원한다', () => {
      const restored = Participant.fromSnapshot({
        id: 'socket-1',
        nickname: 'alice',
        joinedAt: at0,
        leftAt: null,
      });
      expect(restored.connectionId).toBe('socket-1');
      expect(restored.isDisconnected).toBe(false);
    });
  });

  describe('연결 끊김과 재접속', () => {
    const at2 = new Date('2026-01-01T00:02:00Z');

    it('id와 별개로 현재 연결(connectionId)을 갖는다', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      expect(p.id).toBe('p-1');
      expect(p.connectionId).toBe('socket-a');
    });

    it('connectionId를 주지 않으면 id를 그대로 연결로 쓴다', () => {
      const p = Participant.join('p-1', 'alice', at0);
      expect(p.connectionId).toBe('p-1');
    });

    it('disconnect는 퇴장이 아니다 — 활성 상태와 leftAt은 그대로다', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      p.disconnect(at1);
      expect(p.isDisconnected).toBe(true);
      expect(p.disconnectedAt).toBe(at1);
      expect(p.isActive).toBe(true);
      expect(p.leftAt).toBeNull();
    });

    it('중복 disconnect는 유예 시작 시각을 미루지 않는다', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      p.disconnect(at1);
      p.disconnect(at2);
      expect(p.disconnectedAt).toBe(at1);
    });

    it('reconnect는 새 연결로 갈아끼우고 끊김 상태를 해제한다', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      p.disconnect(at1);
      p.reconnect('socket-b', at2);
      expect(p.connectionId).toBe('socket-b');
      expect(p.isDisconnected).toBe(false);
      expect(p.disconnectedAt).toBeNull();
      expect(p.joinedAt).toBe(at0);
    });

    it('끊긴 적 없어도 reconnect로 연결을 교체할 수 있다 (새로고침이 이전 소켓의 disconnect를 앞지르는 경우)', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      p.reconnect('socket-b', at1);
      expect(p.connectionId).toBe('socket-b');
      expect(p.isDisconnected).toBe(false);
    });

    it('이미 퇴장한 참가자는 disconnect·reconnect 모두 거부한다', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      p.leave(at1);
      expect(() => p.disconnect(at2)).toThrow(/already left/);
      expect(() => p.reconnect('socket-b', at2)).toThrow(/already left/);
    });

    it('유예가 만료돼 퇴장한 참가자도 rejoin으로 다시 들어올 수 있다', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      p.disconnect(at1);
      p.leave(at1);
      p.rejoin('socket-b', at2);
      expect(p.isActive).toBe(true);
      expect(p.leftAt).toBeNull();
      expect(p.isDisconnected).toBe(false);
      expect(p.connectionId).toBe('socket-b');
      // 같은 사람이므로 회의록에 두 번 실리지 않도록 최초 입장 시각을 유지한다.
      expect(p.joinedAt).toBe(at0);
    });

    it('유예 경과 판정은 disconnectedAt 기준이며, 연결된 참가자는 항상 false', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      expect(p.isDisconnectedLongerThan(1_000, at2)).toBe(false);
      p.disconnect(at1);
      // at1 → at2 는 60초.
      expect(p.isDisconnectedLongerThan(30_000, at2)).toBe(true);
      expect(p.isDisconnectedLongerThan(90_000, at2)).toBe(false);
    });

    it('connectionId·disconnectedAt은 snapshot round-trip에서 보존된다', () => {
      const p = Participant.join('p-1', 'alice', at0, 'socket-a');
      p.disconnect(at1);
      const restored = Participant.fromSnapshot(p.snapshot());
      expect(restored.connectionId).toBe('socket-a');
      expect(restored.disconnectedAt).toEqual(at1);
      expect(restored.snapshot()).toEqual(p.snapshot());
    });
  });
});
