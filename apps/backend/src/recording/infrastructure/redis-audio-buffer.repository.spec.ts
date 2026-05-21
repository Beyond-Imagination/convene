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

  it('append 한 번도 호출된 적 없는 회의는 consume 이 빈 배열을 돌려준다', async () => {
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  it('단일 participant 의 단일 chunk 가 그대로 round-trip 된다', async () => {
    const chunk = Buffer.from('hello');
    await repo.append('abc12xyz', 's1', chunk);
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe('s1');
    expect(result[0].audio.equals(chunk)).toBe(true);
  });

  it('같은 participant 의 여러 chunk 는 시간순 concat 된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('foo'));
    await repo.append('abc12xyz', 's1', Buffer.from('bar'));
    await repo.append('abc12xyz', 's1', Buffer.from('baz'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].audio.toString()).toBe('foobarbaz');
  });

  it('서로 다른 participant 는 별도 entry 로 분리된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.append('abc12xyz', 's2', Buffer.from('B'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(2);
    const byPid = new Map(result.map((e) => [e.participantId, e.audio.toString()]));
    expect(byPid.get('s1')).toBe('A');
    expect(byPid.get('s2')).toBe('B');
  });

  it('consume 후 같은 code 로 다시 consume 하면 빈 배열(즉시 폐기)', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('x'));
    await repo.consume('abc12xyz');
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  it('UTF-8 비호환 binary chunk 도 그대로 round-trip 된다', async () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x10, 0xab]);
    await repo.append('abc12xyz', 's1', binary);
    const result = await repo.consume('abc12xyz');
    expect(result[0].audio.equals(binary)).toBe(true);
  });
});
