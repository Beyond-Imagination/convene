export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/** 미설정이면 `fallback`. 설정됐는데 양의 정수가 아니면 부팅을 세운다. */
export function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw.length === 0) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer: "${raw}"`);
  }
  return parsed;
}

/**
 * 환경마다 달라야 하는 값을 해석한다. 디폴트는 **로컬 개발 편의용**이며 운영에서는 쓰이지 않는다.
 *
 * 운영에서 디폴트로 조용히 폴백하면 잘못된 대상에 붙고도 부팅이 성공한다
 * (예: `MONGO_DB_NAME` 누락 → dev DB 에 쓰기). 그래서 운영에서는 미설정을 실패로 다룬다.
 */
export function requireInProduction(
  env: NodeJS.ProcessEnv,
  name: string,
  developmentDefault: string,
): string {
  const raw = env[name];
  if (raw !== undefined && raw.trim() !== '') return raw.trim();
  if (isProductionEnv(env)) {
    throw new Error(`${name} must be set in production (no fallback outside development)`);
  }
  return developmentDefault;
}
