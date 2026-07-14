/**
 * 노션 REST API 어댑터의 환경변수 해석 모듈.
 *
 * - `NOTION_TOKEN`이 비어 있으면 노션 기능 dormant 신호로 `null` 반환(gate).
 * - version/baseUrl/timeout은 미설정 시 디폴트. `databaseId`(폴링용)는 미설정 시 `null`.
 * - 노션 REST 는 SDK 없이 직접 호출한다(base `https://api.notion.com`, `Authorization: Bearer`,
 *   `Notion-Version` 헤더 필수).
 */

export const DEFAULT_NOTION_VERSION = '2026-03-11';
export const DEFAULT_NOTION_BASE_URL = 'https://api.notion.com';
export const DEFAULT_NOTION_TIMEOUT_MS = 30_000;

export interface NotionConfig {
  readonly token: string;
  readonly version: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly databaseId: string | null;
}

export function resolveNotionConfig(env: NodeJS.ProcessEnv = process.env): NotionConfig | null {
  const token = env.NOTION_TOKEN?.trim();
  if (token === undefined || token.length === 0) return null;

  const versionRaw = env.NOTION_VERSION?.trim();
  const baseUrlRaw = env.NOTION_BASE_URL?.trim();
  const timeoutRaw = env.NOTION_TIMEOUT_MS?.trim();
  const databaseIdRaw = env.NOTION_DB_ID?.trim();

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

  return {
    token,
    version: versionRaw === undefined || versionRaw.length === 0 ? DEFAULT_NOTION_VERSION : versionRaw,
    baseUrl,
    timeoutMs,
    databaseId: databaseIdRaw === undefined || databaseIdRaw.length === 0 ? null : databaseIdRaw,
  };
}
