import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { AbsoluteTranscriptSegment } from '@/recording/domain/ports';

import { RedisPartialTranscriptStore } from './redis-partial-transcript.store';

const seg = (
  speaker: string,
  text: string,
  absoluteStartMs: number,
): AbsoluteTranscriptSegment => ({
  speaker,
  text,
  absoluteStartMs,
  absoluteEndMs: absoluteStartMs + 1000,
});

describe('RedisPartialTranscriptStore', () => {
  let redis: Redis;
  let store: RedisPartialTranscriptStore;

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    store = new RedisPartialTranscriptStore(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('append 한 적 없는 회의는 consume 이 빈 배열', async () => {
    expect(await store.consume('abc12xyz')).toEqual([]);
  });

  it('append 한 segments 가 같은 순서로 consume 된다', async () => {
    await store.append('abc12xyz', [seg('s1', 'a', 100), seg('s2', 'b', 200)]);
    expect(await store.consume('abc12xyz')).toEqual([
      seg('s1', 'a', 100),
      seg('s2', 'b', 200),
    ]);
  });

  it('여러 번 append 하면 호출 순서로 누적된다', async () => {
    await store.append('abc12xyz', [seg('s1', 'a', 100)]);
    await store.append('abc12xyz', [seg('s2', 'b', 200)]);
    expect(await store.consume('abc12xyz')).toEqual([
      seg('s1', 'a', 100),
      seg('s2', 'b', 200),
    ]);
  });

  it('consume 후 같은 code consume 은 빈 배열(즉시 폐기)', async () => {
    await store.append('abc12xyz', [seg('s1', 'a', 100)]);
    await store.consume('abc12xyz');
    expect(await store.consume('abc12xyz')).toEqual([]);
  });

  it('빈 segments 배열 append 는 no-op', async () => {
    await store.append('abc12xyz', []);
    expect(await store.consume('abc12xyz')).toEqual([]);
  });
});
