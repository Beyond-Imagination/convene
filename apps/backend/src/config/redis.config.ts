/**
 * Redis 접속 옵션을 환경변수에서 해석한다.
 *
 * `@nestjs/config` ConfigService 는 모듈 인스턴스 이후에만 사용 가능하므로
 * `RedisModule` 의 useFactory 에서는 본 파일의 순수 함수로 환경변수를 읽는다
 * (`server.config.ts` 와 동일 패턴).
 *
 * 키 분리는 `keyPrefix` 옵션으로 처리한다.
 */

export const DEFAULT_REDIS_URL = 'redis://localhost:6379';
export const DEFAULT_REDIS_KEY_PREFIX = 'convene:';

export function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.REDIS_URL;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REDIS_URL;
  const trimmed = raw.trim();
  if (!/^rediss?:\/\//.test(trimmed)) {
    throw new Error(
      `REDIS_URL 은 redis:// 또는 rediss:// 스킴이어야 합니다: "${raw}"`,
    );
  }
  return trimmed;
}

export function resolveRedisKeyPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.REDIS_KEY_PREFIX;
  if (raw === undefined || raw.trim() === '') return DEFAULT_REDIS_KEY_PREFIX;
  return raw.trim();
}
