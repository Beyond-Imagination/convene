/*
 * 회의 code 별 클라이언트 보관소 — 닉네임과 host 토큰. 둘 다 sessionStorage.
 *
 * zustand는 in-memory 라 새로고침/페이지 이동 시 소실된다. 정적 호스팅에선
 * `create/join → /meetings/{code}` 이동이 사실상 풀 리로드라, 방금 입력한 닉네임이
 * 날아가 "새 유저"로 인식된다. hostToken도 마찬가지로 새로고침/재접속 후에 host가
 * 회의를 종료할 수 있어야 한다. 같은 탭 세션 동안만 유지하면 되므로 sessionStorage.
 */

const read = (key: string): string | null =>
  typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);

const write = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(key, value);
};

const remove = (key: string): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
};

const nicknameKey = (code: string): string => `nickname:${code}`;
const hostTokenKey = (code: string): string => `hostToken:${code}`;

export const saveNickname = (code: string, nickname: string): void =>
  write(nicknameKey(code), nickname);

export const getNickname = (code: string): string | null => read(nicknameKey(code));

export const clearStoredNickname = (code: string): void => remove(nicknameKey(code));

export const saveHostToken = (code: string, token: string): void =>
  write(hostTokenKey(code), token);

export const getHostToken = (code: string): string | null => read(hostTokenKey(code));
