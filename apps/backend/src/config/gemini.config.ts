/**
 * Gemini(LLM 요약) 어댑터의 환경변수 해석 모듈.
 *
 * `server.config.ts` / `redis.config.ts` / `ai-worker.config.ts` 와 동일하게
 * 부트스트랩 단계의 env 해석만 담당하는 순수 함수.
 *
 * - `GEMINI_API_KEY` 가 비어 있으면 NoopSummarizer fallback 신호로 `null` 반환.
 *   ReportsModule 의 useFactory 가 null 일 때 NoopSummarizer 를 주입한다.
 * - 모델/타임아웃은 미설정 시 디폴트 사용.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_TIMEOUT_MS = 30_000;
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export interface GeminiConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly baseUrl: string;
}

export function resolveGeminiConfig(
  env: NodeJS.ProcessEnv = process.env,
): GeminiConfig | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) return null;

  const model = env.GEMINI_MODEL?.trim();
  const timeoutRaw = env.GEMINI_TIMEOUT_MS?.trim();
  const baseUrlRaw = env.GEMINI_BASE_URL?.trim();

  let timeoutMs = DEFAULT_GEMINI_TIMEOUT_MS;
  if (timeoutRaw !== undefined && timeoutRaw.length > 0) {
    const parsed = Number(timeoutRaw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `GEMINI_TIMEOUT_MS 는 양의 정수(ms)여야 합니다: "${timeoutRaw}"`,
      );
    }
    timeoutMs = parsed;
  }

  let baseUrl = DEFAULT_GEMINI_BASE_URL;
  if (baseUrlRaw !== undefined && baseUrlRaw.length > 0) {
    if (!/^https?:\/\//.test(baseUrlRaw)) {
      throw new Error(
        `GEMINI_BASE_URL 은 http:// 또는 https:// 스킴이어야 합니다: "${baseUrlRaw}"`,
      );
    }
    baseUrl = baseUrlRaw.replace(/\/+$/, '');
  }

  return {
    apiKey,
    model: model === undefined || model.length === 0 ? DEFAULT_GEMINI_MODEL : model,
    timeoutMs,
    baseUrl,
  };
}
