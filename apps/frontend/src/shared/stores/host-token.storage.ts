/**
 * 회의 종료 권한자(host) 토큰의 클라이언트 보관소.
 *
 * 회의 생성 응답으로 받은 hostToken 을 회의 code 별로 sessionStorage 에 저장한다.
 * zustand 메모리 스토어가 아니라 sessionStorage 를 쓰는 이유는, 새로고침/재접속
 * 후에도 host 가 회의를 종료할 수 있어야 하기 때문이다(같은 탭 세션 동안 유지).
 *
 * View/ViewModel 은 본 모듈을 통해서만 hostToken 에 접근한다.
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
