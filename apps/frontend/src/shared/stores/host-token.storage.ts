/*
 * 회의 종료 권한자(host) 토큰의 클라이언트 보관소.
 *
 * 회의 생성 응답으로 받은 hostToken을 회의 code 별로 sessionStorage에 저장한다.
 * sessionStorage를 쓰는 이유는, 새로고침/재접속 후에도 host가 회의를 종료할 수 있어야 하기 때문이다.
 */

const keyOf = (code: string): string => `hostToken:${code}`;

export function saveHostToken(code: string, token: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(keyOf(code), token);
}

export function getHostToken(code: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(keyOf(code));
}
