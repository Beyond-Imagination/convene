/**
 * 관리자 전용 엔드포인트(예: 회의록 재요약)의 인증 토큰을 env 에서 해석한다.
 * 미설정/빈 값이면 `null`.
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
