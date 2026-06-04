/**
 * 관리자 전용 엔드포인트(예: 회의록 재요약)의 인증 토큰을 해석하는 모듈.
 *
 * `gemini.config.ts` 등과 동일하게 부트스트랩 단계의 env 해석만 담당하는 순수 함수.
 *
 * - 회원/계정 개념이 없는 제품이라 단일 운영자 시크릿(`ADMIN_API_TOKEN`) 으로
 *   관리자 호출을 가른다. `Authorization: Bearer <token>` 헤더로 검증한다.
 * - 토큰이 비어 있으면 `null` 을 반환한다. 이때 `AdminGuard` 는 관리자 엔드포인트를
 *   비활성(403)으로 막아 실수로 무방비 노출되는 일이 없게 한다.
 */

export interface AdminConfig {
  readonly token: string;
}

export function resolveAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): AdminConfig | null {
  const token = env.ADMIN_API_TOKEN?.trim();
  if (token === undefined || token.length === 0) return null;
  return { token };
}
