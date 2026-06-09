export const DEFAULT_REDIS_URL = 'redis://localhost:6379';
export const DEFAULT_REDIS_KEY_PREFIX = 'convene:';

export function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.REDIS_URL;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REDIS_URL;
  const trimmed = raw.trim();
  if (!/^rediss?:\/\//.test(trimmed)) {
    throw new Error(`REDIS_URL은 redis:// 또는 rediss:// 스킴이어야 합니다: "${raw}"`);
  }
  return trimmed;
}

export function resolveRedisKeyPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.REDIS_KEY_PREFIX;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REDIS_KEY_PREFIX;
  return raw.trim();
}
