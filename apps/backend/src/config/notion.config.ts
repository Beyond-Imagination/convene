/**
 * 노션 REST API 어댑터의 환경변수 해석 모듈.
 *
 * - `NOTION_TOKEN`이 비어 있으면 노션 기능 dormant 신호로 `null` 반환(gate).
 * - version/baseUrl/timeout은 미설정 시 디폴트. `databaseIds`(폴링용)는 미설정 시 빈 배열.
 *   이슈 관리 DB는 여럿(팀/프로젝트)이라 `NOTION_DB_IDS`를 콤마 구분 복수로 받는다.
 * - `signingSecret`(즉시 버튼 HMAC 검증)은 N-B 즉시 경로용. 없으면 컨트롤러 미등록.
 */

// 2025-09-03: 멀티소스 DB 도입. 조회는 databases/{id}/query가 아니라 data_sources/{id}/query.
export const DEFAULT_NOTION_VERSION = '2025-09-03';
export const DEFAULT_NOTION_BASE_URL = 'https://api.notion.com';
export const DEFAULT_NOTION_TIMEOUT_MS = 30_000;
export const DEFAULT_NOTION_POLL_CRON = '0 */30 * * * *';

export interface NotionConfig {
  readonly token: string;
  readonly version: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly databaseIds: ReadonlyArray<string>;
  readonly signingSecret: string | null;
}

export function resolveNotionPollCron(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.NOTION_POLL_CRON?.trim();
  return raw === undefined || raw.length === 0 ? DEFAULT_NOTION_POLL_CRON : raw;
}

export function resolveNotionConfig(env: NodeJS.ProcessEnv = process.env): NotionConfig | null {
  const token = env.NOTION_TOKEN?.trim();
  if (token === undefined || token.length === 0) return null;

  const versionRaw = env.NOTION_VERSION?.trim();
  const baseUrlRaw = env.NOTION_BASE_URL?.trim();
  const timeoutRaw = env.NOTION_TIMEOUT_MS?.trim();
  const databaseIds = (env.NOTION_DB_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  let timeoutMs = DEFAULT_NOTION_TIMEOUT_MS;
  if (timeoutRaw !== undefined && timeoutRaw.length > 0) {
    const parsed = Number(timeoutRaw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`NOTION_TIMEOUT_MS must be a positive integer (ms): "${timeoutRaw}"`);
    }
    timeoutMs = parsed;
  }

  let baseUrl = DEFAULT_NOTION_BASE_URL;
  if (baseUrlRaw !== undefined && baseUrlRaw.length > 0) {
    if (!/^https?:\/\//.test(baseUrlRaw)) {
      throw new Error(`NOTION_BASE_URL must use the http:// or https:// scheme: "${baseUrlRaw}"`);
    }
    baseUrl = baseUrlRaw.replace(/\/+$/, '');
  }

  const signingSecretRaw = env.NOTION_SIGNING_SECRET?.trim();
  const signingSecret =
    signingSecretRaw === undefined || signingSecretRaw.length === 0 ? null : signingSecretRaw;

  return {
    token,
    version: versionRaw === undefined || versionRaw.length === 0 ? DEFAULT_NOTION_VERSION : versionRaw,
    baseUrl,
    timeoutMs,
    databaseIds,
    signingSecret,
  };
}
