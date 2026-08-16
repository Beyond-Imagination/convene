/**
 * Gemini(LLM 요약) 어댑터의 환경변수 해석 모듈.
 *
 * - `GEMINI_API_KEY`가 비어 있으면 NoopSummarizer fallback 신호로 `null` 반환.
 * - 모델/타임아웃/재시도는 미설정 시 디폴트 사용.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_TIMEOUT_MS = 30_000;
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

/** 첫 호출 포함 총 시도 횟수. 1이면 재시도 없음. */
export const DEFAULT_GEMINI_MAX_ATTEMPTS = 3;
export const DEFAULT_GEMINI_RETRY_BASE_DELAY_MS = 500;

export interface GeminiConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly baseUrl: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
}

function positiveInteger(raw: string | undefined, name: string, fallback: number): number {
  const value = raw?.trim();
  if (value === undefined || value.length === 0) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer: "${value}"`);
  }
  return parsed;
}

export function resolveGeminiConfig(env: NodeJS.ProcessEnv = process.env): GeminiConfig | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) return null;

  const model = env.GEMINI_MODEL?.trim();
  const baseUrlRaw = env.GEMINI_BASE_URL?.trim();

  let baseUrl = DEFAULT_GEMINI_BASE_URL;
  if (baseUrlRaw !== undefined && baseUrlRaw.length > 0) {
    if (!/^https?:\/\//.test(baseUrlRaw)) {
      throw new Error(`GEMINI_BASE_URL must use the http:// or https:// scheme: "${baseUrlRaw}"`);
    }
    baseUrl = baseUrlRaw.replace(/\/+$/, '');
  }

  return {
    apiKey,
    model: model === undefined || model.length === 0 ? DEFAULT_GEMINI_MODEL : model,
    timeoutMs: positiveInteger(
      env.GEMINI_TIMEOUT_MS,
      'GEMINI_TIMEOUT_MS',
      DEFAULT_GEMINI_TIMEOUT_MS,
    ),
    baseUrl,
    maxAttempts: positiveInteger(
      env.GEMINI_MAX_ATTEMPTS,
      'GEMINI_MAX_ATTEMPTS',
      DEFAULT_GEMINI_MAX_ATTEMPTS,
    ),
    retryBaseDelayMs: positiveInteger(
      env.GEMINI_RETRY_BASE_DELAY_MS,
      'GEMINI_RETRY_BASE_DELAY_MS',
      DEFAULT_GEMINI_RETRY_BASE_DELAY_MS,
    ),
  };
}
