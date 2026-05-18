import { InMemoryAudioBufferRepository } from './in-memory-audio-buffer.repository';

describe('InMemoryAudioBufferRepository', () => {
  it('append이 한 번도 호출된 적 없는 회의는 consume이 null을 돌려준다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    expect(await repo.consume('abc12xyz')).toBeNull();
  });

  it('단일 chunk append 후 consume은 같은 Buffer를 돌려준다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    const chunk = Buffer.from('hello');
    await repo.append('abc12xyz', chunk);
    const result = await repo.consume('abc12xyz');
    expect(result).not.toBeNull();
    expect(result!.equals(chunk)).toBe(true);
  });

  it('여러 chunk를 append하면 consume은 순서대로 concat한 Buffer를 돌려준다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    await repo.append('abc12xyz', Buffer.from('foo'));
    await repo.append('abc12xyz', Buffer.from('bar'));
    await repo.append('abc12xyz', Buffer.from('baz'));
    const result = await repo.consume('abc12xyz');
    expect(result!.toString()).toBe('foobarbaz');
  });

  it('consume 후에는 같은 code로 다시 consume하면 null을 돌려준다 (즉시 폐기)', async () => {
    const repo = new InMemoryAudioBufferRepository();
    await repo.append('abc12xyz', Buffer.from('x'));
    await repo.consume('abc12xyz');
    expect(await repo.consume('abc12xyz')).toBeNull();
  });

  it('서로 다른 회의의 버퍼는 독립적이다', async () => {
    const repo = new InMemoryAudioBufferRepository();
    await repo.append('aaa11aaa', Buffer.from('A'));
    await repo.append('bbb22bbb', Buffer.from('B'));
    const a = await repo.consume('aaa11aaa');
    const b = await repo.consume('bbb22bbb');
    expect(a!.toString()).toBe('A');
    expect(b!.toString()).toBe('B');
  });
});
