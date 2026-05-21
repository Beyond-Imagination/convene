/**
 * ai-worker(FastAPI + faster-whisper) HTTP base URL 을 환경변수에서 해석한다.
 *
 * `server.config.ts` / `redis.config.ts` / `mongo.config.ts` 와 동일하게
 * 부트스트랩 단계의 env 해석만 담당하는 순수 함수.
 *
 * 디폴트는 docker-compose.local 의 서비스 이름 `ai-worker` 가 아니라
 * `http://localhost:8000` 으로 두어, host 에서 직접 띄우는 dev 시나리오와
 * 호환되게 한다. compose 로 띄울 땐 `AI_WORKER_BASE_URL=http://ai-worker:8000`.
 */

export const DEFAULT_AI_WORKER_BASE_URL = 'http://localhost:8000';

export function resolveAiWorkerBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.AI_WORKER_BASE_URL;
  if (raw === undefined || raw.trim() === '') return DEFAULT_AI_WORKER_BASE_URL;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error(
      `AI_WORKER_BASE_URL 은 http:// 또는 https:// 스킴이어야 합니다: "${raw}"`,
    );
  }
  return trimmed;
}
