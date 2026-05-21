import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { RedisAudioBufferRepository } from './redis-audio-buffer.repository';

describe('RedisAudioBufferRepository', () => {
  let redis: Redis;
  let repo: RedisAudioBufferRepository;

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    repo = new RedisAudioBufferRepository(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('append 한 번도 호출된 적 없는 회의는 consume 이 null 을 돌려준다', async () => {
    expect(await repo.consume('abc12xyz')).toBeNull();
  });

  it('단일 chunk append 후 consume 은 같은 Buffer 를 돌려준다', async () => {
    const chunk = Buffer.from('hello');
    await repo.append('abc12xyz', chunk);
    const result = await repo.consume('abc12xyz');
    expect(result).not.toBeNull();
    expect(result!.equals(chunk)).toBe(true);
  });

  it('여러 chunk 를 append 하면 consume 은 순서대로 concat 한 Buffer 를 돌려준다', async () => {
    await repo.append('abc12xyz', Buffer.from('foo'));
    await repo.append('abc12xyz', Buffer.from('bar'));
    await repo.append('abc12xyz', Buffer.from('baz'));
    const result = await repo.consume('abc12xyz');
    expect(result!.toString()).toBe('foobarbaz');
  });

  it('consume 후에는 같은 code 로 다시 consume 하면 null 을 돌려준다(즉시 폐기, PLAN.md §3)', async () => {
    await repo.append('abc12xyz', Buffer.from('x'));
    await repo.consume('abc12xyz');
    expect(await repo.consume('abc12xyz')).toBeNull();
  });

  it('서로 다른 회의의 버퍼는 독립적이다', async () => {
    await repo.append('aaa11aaa', Buffer.from('A'));
    await repo.append('bbb22bbb', Buffer.from('B'));
    const a = await repo.consume('aaa11aaa');
    const b = await repo.consume('bbb22bbb');
    expect(a!.toString()).toBe('A');
    expect(b!.toString()).toBe('B');
  });

  it('UTF-8 비호환 byte 가 섞인 binary chunk 도 그대로 round-trip 된다', async () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x10, 0xab]);
    await repo.append('abc12xyz', binary);
    const result = await repo.consume('abc12xyz');
    expect(result!.equals(binary)).toBe(true);
  });
});
