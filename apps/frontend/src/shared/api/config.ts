/**
 * Frontend → Backend HTTP / WS base URL.
 */
export const API_BASE_URL: string = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'
).replace(/\/$/, '');
