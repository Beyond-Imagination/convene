import {
  DEFAULT_REDIS_KEY_PREFIX,
  DEFAULT_REDIS_URL,
  REDIS_MAX_RETRIES_PER_REQUEST,
  REDIS_RECONNECT_MAX_DELAY_MS,
  redisRetryStrategy,
  resolveRedisKeyPrefix,
  resolveRedisUrl,
} from './redis.config';

describe('resolveRedisUrl', () => {
  it('REDIS_URL이 없으면 DEFAULT_REDIS_URL를 돌려준다', () => {
    expect(resolveRedisUrl({})).toBe(DEFAULT_REDIS_URL);
  });

  it('REDIS_URL이 빈 문자열이면 DEFAULT_REDIS_URL로 fallback', () => {
    expect(resolveRedisUrl({ REDIS_URL: '' })).toBe(DEFAULT_REDIS_URL);
    expect(resolveRedisUrl({ REDIS_URL: '   ' })).toBe(DEFAULT_REDIS_URL);
  });

  it('redis:// 스킴 url을 그대로 돌려준다', () => {
    expect(resolveRedisUrl({ REDIS_URL: 'redis://localhost:6380' })).toBe('redis://localhost:6380');
  });

  it('rediss:// 스킴(TLS) url도 허용한다', () => {
    expect(resolveRedisUrl({ REDIS_URL: 'rediss://user:pw@example.com:6380/0' })).toBe(
      'rediss://user:pw@example.com:6380/0',
    );
  });

  it('redis:// 또는 rediss:// 스킴이 아니면 throw', () => {
    expect(() => resolveRedisUrl({ REDIS_URL: 'http://localhost:6379' })).toThrow(/REDIS_URL/);
    expect(() => resolveRedisUrl({ REDIS_URL: 'localhost:6379' })).toThrow(/REDIS_URL/);
  });
});

describe('resolveRedisKeyPrefix', () => {
  it('REDIS_KEY_PREFIX가 없으면 DEFAULT_REDIS_KEY_PREFIX를 돌려준다', () => {
    expect(resolveRedisKeyPrefix({})).toBe(DEFAULT_REDIS_KEY_PREFIX);
  });

  it('REDIS_KEY_PREFIX가 비어 있으면 디폴트로 fallback', () => {
    expect(resolveRedisKeyPrefix({ REDIS_KEY_PREFIX: '' })).toBe(DEFAULT_REDIS_KEY_PREFIX);
    expect(resolveRedisKeyPrefix({ REDIS_KEY_PREFIX: '   ' })).toBe(DEFAULT_REDIS_KEY_PREFIX);
  });

  it('명시된 prefix를 trim 해서 돌려준다', () => {
    expect(resolveRedisKeyPrefix({ REDIS_KEY_PREFIX: '  test:  ' })).toBe('test:');
  });
});

describe('redisRetryStrategy', () => {
  it('첫 재연결은 즉시에 가깝게 시도한다', () => {
    expect(redisRetryStrategy(1)).toBeLessThanOrEqual(500);
  });

  it('재시도가 쌓일수록 간격을 늘린다', () => {
    expect(redisRetryStrategy(2)).toBeGreaterThan(redisRetryStrategy(1));
  });

  it('간격은 상한을 넘지 않는다', () => {
    expect(redisRetryStrategy(1_000)).toBe(REDIS_RECONNECT_MAX_DELAY_MS);
  });

  it('명령 재시도 한도가 redis 컨테이너 재기동(수 초)을 버틸 만큼 잡혀 있다', () => {
    // 최악(상한 간격)으로 잡아도 10초 이상은 기다려 준다.
    expect(REDIS_MAX_RETRIES_PER_REQUEST * REDIS_RECONNECT_MAX_DELAY_MS).toBeGreaterThanOrEqual(
      10_000,
    );
  });
});
