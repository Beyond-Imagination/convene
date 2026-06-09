export const DEFAULT_PORT = 5000;

/**
 * HTTP/WS 허용 origin 기본값.
 *
 * 기본값은 로컬 Next.js dev 서버이며, `CORS_ORIGIN` 환경변수로 재정의한다.
 */
export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`PORT 환경변수가 유효한 포트 번호가 아닙니다: "${raw}"`);
  }
  return parsed;
}

/**
 * 콤마 구분 origin 문자열을 trim/dedupe 한 배열로 변환한다.
 * 빈 문자열은 무시하며, 결과가 비면 디폴트 origin으로 fallback 한다.
 */
export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN;
  const parsed = raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (parsed.length === 0) return [DEFAULT_CORS_ORIGIN];
  return Array.from(new Set(parsed));
}
