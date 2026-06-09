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
      });
      p.leave(at1);
      expect(p.snapshot()).toEqual({
        id: 'socket-1',
        nickname: 'alice',
        joinedAt: at0,
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
  });
});
