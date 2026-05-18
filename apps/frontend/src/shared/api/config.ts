/**
 * Frontend → Backend HTTP / WS base URL.
 *
 * 정적 export 빌드에서 `NEXT_PUBLIC_API_URL` 이 빌드 타임에 인라인된다.
 * 로컬 개발 fallback 은 backend main.ts 가 listen 하는 포트(3000)에 맞춘다.
 */
export const API_BASE_URL: string = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');
