import { InMemoryAudioBufferRepository } from './in-memory-audio-buffer.repository';

describe('InMemoryAudioBufferRepository', () => {
  it('append 한 번도 호출된 적 없는 회의는 consume 이 빈 배열을 돌려준다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  it('단일 participant 의 단일 chunk 가 그대로 round-trip 된다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    const chunk = Buffer.from('hello');
    await repo.append('abc12xyz', 's1', chunk);
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe('s1');
    expect(result[0].audio.equals(chunk)).toBe(true);
  });

  it('같은 participant 의 여러 chunk 는 시간순 concat 된다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    await repo.append('abc12xyz', 's1', Buffer.from('foo'));
    await repo.append('abc12xyz', 's1', Buffer.from('bar'));
    await repo.append('abc12xyz', 's1', Buffer.from('baz'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].audio.toString()).toBe('foobarbaz');
  });

  it('서로 다른 participant 는 별도 entry 로 분리된다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.append('abc12xyz', 's2', Buffer.from('B'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(2);
    const byPid = new Map(result.map((e) => [e.participantId, e.audio.toString()]));
    expect(byPid.get('s1')).toBe('A');
    expect(byPid.get('s2')).toBe('B');
  });

  it('consume 후 같은 code 로 다시 consume 하면 빈 배열(즉시 폐기, PLAN.md §3)', async () => {
    const repo = new InMemoryAudioBufferRepository();
    await repo.append('abc12xyz', 's1', Buffer.from('x'));
    await repo.consume('abc12xyz');
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  it('서로 다른 회의의 버퍼는 독립적이다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    await repo.append('aaa11aaa', 's1', Buffer.from('A'));
    await repo.append('bbb22bbb', 's2', Buffer.from('B'));
    const a = await repo.consume('aaa11aaa');
    const b = await repo.consume('bbb22bbb');
    expect(a).toEqual([{ participantId: 's1', audio: Buffer.from('A') }]);
    expect(b).toEqual([{ participantId: 's2', audio: Buffer.from('B') }]);
  });
});
