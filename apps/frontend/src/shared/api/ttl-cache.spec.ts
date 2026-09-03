import { describe, expect, it, vi } from 'vitest';

import { ttlCache } from './ttl-cache';

const clock = (start = 0) => {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
};

describe('ttlCache', () => {
  it('TTL 안에서는 loader를 다시 부르지 않는다', async () => {
    const time = clock();
    const cache = ttlCache<number>(1000, time.now);
    const loader = vi.fn(async () => 1);

    expect(await cache.fetch('k', loader)).toBe(1);
    time.advance(999);
    expect(await cache.fetch('k', loader)).toBe(1);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('TTL이 지나면 다시 부른다', async () => {
    const time = clock();
    const cache = ttlCache<number>(1000, time.now);
    const loader = vi.fn(async () => 1);

    await cache.fetch('k', loader);
    time.advance(1001);
    await cache.fetch('k', loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('키가 다르면 따로 캐시한다', async () => {
    const cache = ttlCache<string>(1000, clock().now);
    const loader = vi.fn(async () => 'v');

    await cache.fetch('a', loader);
    await cache.fetch('b', loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('아직 끝나지 않은 같은 요청은 하나로 합친다', async () => {
    const cache = ttlCache<number>(1000, clock().now);
    let resolve!: (value: number) => void;
    const loader = vi.fn(() => new Promise<number>((r) => (resolve = r)));

    const first = cache.fetch('k', loader);
    const second = cache.fetch('k', loader);
    resolve(7);

    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('실패한 요청은 캐시하지 않는다', async () => {
    const cache = ttlCache<number>(1000, clock().now);
    const loader = vi
      .fn<[], Promise<number>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(2);

    await expect(cache.fetch('k', loader)).rejects.toThrow('boom');
    expect(await cache.fetch('k', loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('invalidate는 지정한 키만, 인자가 없으면 전부 버린다', async () => {
    const cache = ttlCache<string>(1000, clock().now);
    const loader = vi.fn(async () => 'v');

    await cache.fetch('a', loader);
    await cache.fetch('b', loader);
    cache.invalidate('a');
    await cache.fetch('a', loader);
    await cache.fetch('b', loader);
    expect(loader).toHaveBeenCalledTimes(3);

    cache.invalidate();
    await cache.fetch('a', loader);
    await cache.fetch('b', loader);
    expect(loader).toHaveBeenCalledTimes(5);
  });
});
