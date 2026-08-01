import { requireInProduction } from './required-env';

/** 로컬 개발 편의 디폴트. 운영에서는 `REDIS_URL` 미설정이 부팅 실패다. */
export const DEFAULT_REDIS_URL = 'redis://localhost:6379';
export const DEFAULT_REDIS_KEY_PREFIX = 'convene:';

export const REDIS_RECONNECT_MAX_DELAY_MS = 2_000;
/** 명령 하나가 재연결을 기다려 주는 횟수. 상한 간격 기준 20초 — redis 컨테이너 재기동을 넘긴다. */
export const REDIS_MAX_RETRIES_PER_REQUEST = 10;

/** ioredis 재연결 backoff. 200ms 부터 늘려 상한에서 멈춘다. */
export function redisRetryStrategy(attempt: number): number {
  return Math.min(attempt * 200, REDIS_RECONNECT_MAX_DELAY_MS);
}

export function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = requireInProduction(env, 'REDIS_URL', DEFAULT_REDIS_URL);
  if (!/^rediss?:\/\//.test(value)) {
    throw new Error(`REDIS_URL must use the redis:// or rediss:// scheme: "${value}"`);
  }
  return value;
}

export function resolveRedisKeyPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.REDIS_KEY_PREFIX;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REDIS_KEY_PREFIX;
  return raw.trim();
}
