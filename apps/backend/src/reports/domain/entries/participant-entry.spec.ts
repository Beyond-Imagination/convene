import { participantEntry } from './participant-entry';

describe('ParticipantEntry', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2026-01-01T00:01:00Z');

  it('정상 입력으로 entry를 생성한다 (leftAt=null 가능)', () => {
    const e = participantEntry({ id: 's1', nickname: 'alice', joinedAt: t0, leftAt: null });
    expect(e).toEqual({ id: 's1', nickname: 'alice', joinedAt: t0, leftAt: null });
  });

  it('leftAt이 joinedAt 이후면 그대로 보존한다', () => {
    const e = participantEntry({ id: 's1', nickname: 'alice', joinedAt: t0, leftAt: t1 });
    expect(e.leftAt).toBe(t1);
  });

  it.each(['', '   '])('id가 trim 후 비어 있으면 거부한다: "%s"', (id) => {
    expect(() =>
      participantEntry({ id, nickname: 'alice', joinedAt: t0, leftAt: null }),
    ).toThrow(/id/);
  });

  it.each(['', '   '])('nickname이 trim 후 비어 있으면 거부한다: "%s"', (n) => {
    expect(() =>
      participantEntry({ id: 's1', nickname: n, joinedAt: t0, leftAt: null }),
    ).toThrow(/nickname/);
  });

  it('nickname이 30자를 넘으면 거부한다', () => {
    expect(() =>
      participantEntry({ id: 's1', nickname: 'a'.repeat(31), joinedAt: t0, leftAt: null }),
    ).toThrow(/nickname/);
  });

  it('leftAt이 joinedAt보다 이르면 거부한다', () => {
    expect(() =>
      participantEntry({ id: 's1', nickname: 'alice', joinedAt: t1, leftAt: t0 }),
    ).toThrow(/leftAt/);
  });
});
