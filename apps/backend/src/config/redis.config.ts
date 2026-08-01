export const DEFAULT_REDIS_URL = 'redis://localhost:6379';
export const DEFAULT_REDIS_KEY_PREFIX = 'convene:';

export const REDIS_RECONNECT_MAX_DELAY_MS = 0;
export const REDIS_MAX_RETRIES_PER_REQUEST = 0;

export function redisRetryStrategy(_attempt: number): number {
  throw new Error('not implemented');
}

export function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.REDIS_URL;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REDIS_URL;
  const trimmed = raw.trim();
  if (!/^rediss?:\/\//.test(trimmed)) {
    throw new Error(`REDIS_URL must use the redis:// or rediss:// scheme: "${raw}"`);
  }
  return trimmed;
}

export function resolveRedisKeyPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.REDIS_KEY_PREFIX;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REDIS_KEY_PREFIX;
  return raw.trim();
}
