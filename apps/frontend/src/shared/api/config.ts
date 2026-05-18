/**
 * Frontend → Backend HTTP / WS base URL.
 *
 * 정적 export 빌드에서 `NEXT_PUBLIC_API_URL` 이 빌드 타임에 인라인된다.
 * 로컬 개발 fallback 은 backend main.ts 의 DEFAULT_PORT(5000)에 맞춘다.
 * Next.js dev 서버가 3000 을 점유하므로 backend 는 5000 을 사용한다.
 */
export const API_BASE_URL: string = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'
).replace(/\/$/, '');
