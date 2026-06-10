/**
 * ai-worker HTTP base URL을 환경변수에서 해석한다.
 */

export const DEFAULT_AI_WORKER_BASE_URL = 'http://localhost:8000';

export function resolveAiWorkerBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.AI_WORKER_BASE_URL;
  if (raw === undefined || raw.trim() === '') return DEFAULT_AI_WORKER_BASE_URL;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error(`AI_WORKER_BASE_URL must use the http:// or https:// scheme: "${raw}"`);
  }
  return trimmed;
}
