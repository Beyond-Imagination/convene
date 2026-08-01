import { requireInProduction } from './required-env';

/** 로컬 개발 편의 디폴트. 운영에서는 `MONGO_URI` 미설정이 부팅 실패다. */
export const DEFAULT_MONGO_URI = 'mongodb://localhost:27017';
/** 운영에서 이 디폴트로 폴백하면 dev DB 에 쓰게 되므로 운영에서는 미설정을 허용하지 않는다. */
export const DEFAULT_MONGO_DB_NAME = 'convene-dev';

export function resolveMongoUri(env: NodeJS.ProcessEnv = process.env): string {
  const value = requireInProduction(env, 'MONGO_URI', DEFAULT_MONGO_URI);
  if (!/^mongodb(\+srv)?:\/\//.test(value)) {
    throw new Error(`MONGO_URI must use the mongodb:// or mongodb+srv:// scheme: "${value}"`);
  }
  return value;
}

export function resolveMongoDbName(env: NodeJS.ProcessEnv = process.env): string {
  return requireInProduction(env, 'MONGO_DB_NAME', DEFAULT_MONGO_DB_NAME);
}
