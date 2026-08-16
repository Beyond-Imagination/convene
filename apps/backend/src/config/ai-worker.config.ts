/**
 * ai-worker(STT) 어댑터의 환경변수 해석 모듈.
 */

import { positiveInteger } from './required-env';

export const DEFAULT_AI_WORKER_BASE_URL = 'http://localhost:8000';

/** 첫 호출 포함 총 시도 횟수. 1이면 재시도 없음. */
export const DEFAULT_AI_WORKER_MAX_ATTEMPTS = 3;
export const DEFAULT_AI_WORKER_RETRY_BASE_DELAY_MS = 500;

export interface AiWorkerConfig {
  readonly baseUrl: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
}

export function resolveAiWorkerConfig(env: NodeJS.ProcessEnv = process.env): AiWorkerConfig {
  const raw = env.AI_WORKER_BASE_URL;

  let baseUrl = DEFAULT_AI_WORKER_BASE_URL;
  if (raw !== undefined && raw.trim() !== '') {
    baseUrl = raw.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(baseUrl)) {
      throw new Error(`AI_WORKER_BASE_URL must use the http:// or https:// scheme: "${raw}"`);
    }
  }

  return {
    baseUrl,
    maxAttempts: positiveInteger(env, 'AI_WORKER_MAX_ATTEMPTS', DEFAULT_AI_WORKER_MAX_ATTEMPTS),
    retryBaseDelayMs: positiveInteger(
      env,
      'AI_WORKER_RETRY_BASE_DELAY_MS',
      DEFAULT_AI_WORKER_RETRY_BASE_DELAY_MS,
    ),
  };
}
