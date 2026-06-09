/*
 * 입장 닉네임의 클라이언트 보관소 — 회의 code 별 sessionStorage.
 *
 * zustand는 in-memory 라 새로고침/페이지 이동 시 소실된다.
 * 정적 호스팅에선 `create/join → /meetings/{code}` 이동이 사실상 풀 리로드라, 방금 입력한 닉네임이 날아가 "새 유저"로 인식되는 문제가 있다.
 * code 별 sessionStorage에 보관해 같은 탭 세션 동안 닉네임을 유지한다.
 */

const keyOf = (code: string): string => `nickname:${code}`;

export function saveNickname(code: string, nickname: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(keyOf(code), nickname);
}

export function getNickname(code: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(keyOf(code));
}

export function clearStoredNickname(code: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(keyOf(code));
}
