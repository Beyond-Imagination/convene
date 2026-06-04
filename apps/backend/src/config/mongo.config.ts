/**
 * MongoDB 접속 옵션을 환경변수에서 해석한다.
 *
 * `MONGO_URI` 에는 cluster connection string 만 두고, database 는 `MONGO_DB_NAME`
 * 으로 분리해 `createConnection(uri, { dbName })` 옵션으로 주입한다.
 *
 * 본 파일은 `server.config.ts` / `redis.config.ts` 와 동일하게 순수 함수로
 * 부트스트랩 단계의 env 해석만 담당한다.
 */

export const DEFAULT_MONGO_URI = 'mongodb://localhost:27017';
export const DEFAULT_MONGO_DB_NAME = 'convene-dev';

export function resolveMongoUri(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MONGO_URI;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MONGO_URI;
  const trimmed = raw.trim();
  if (!/^mongodb(\+srv)?:\/\//.test(trimmed)) {
    throw new Error(
      `MONGO_URI 는 mongodb:// 또는 mongodb+srv:// 스킴이어야 합니다: "${raw}"`,
    );
  }
  return trimmed;
}

export function resolveMongoDbName(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MONGO_DB_NAME;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MONGO_DB_NAME;
  return raw.trim();
}
