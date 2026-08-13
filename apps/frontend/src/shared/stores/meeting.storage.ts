/*
 * 회의 code 별 클라이언트 보관소 — 참가자 신원(닉네임·participantId·host 토큰).
 *
 * zustand는 in-memory 라 새로고침/페이지 이동 시 소실된다. 정적 호스팅에선
 * `create/join → /meetings/{code}` 이동이 사실상 풀 리로드라, 방금 입력한 닉네임이
 * 날아가 "새 유저"로 인식된다.
 *
 * **회의 신원은 sessionStorage**에 둔다. localStorage로 옮기면 같은 브라우저의 두 탭이
 * participantId를 공유해 서로를 재접속으로 인식하고 참가자가 하나로 합쳐진다.
 * 폼 기본값으로 쓰는 `lastNickname`만 탭·세션을 넘겨 재사용하므로 localStorage에 둔다.
 */

const readSession = (key: string): string | null =>
  typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);

const writeSession = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(key, value);
};

const removeSession = (key: string): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
};

const nicknameKey = (code: string): string => `nickname:${code}`;
const hostTokenKey = (code: string): string => `hostToken:${code}`;
const participantIdKey = (code: string): string => `participantId:${code}`;
const mediaIntentKey = (code: string): string => `mediaIntent:${code}`;
const LAST_NICKNAME_KEY = 'lastNickname';

/** 마이크·카메라를 켜 둔 상태였는지. 재연결·새로고침 뒤 그대로 되살리는 데 쓴다. */
export interface MediaIntent {
  audio: boolean;
  video: boolean;
}

const NO_MEDIA: MediaIntent = { audio: false, video: false };

export const saveNickname = (code: string, nickname: string): void =>
  writeSession(nicknameKey(code), nickname);

export const getNickname = (code: string): string | null => readSession(nicknameKey(code));

/**
 * 이 회의에 대한 클라이언트 상태를 전부 버린다. 정상 퇴장·종료 전용이다.
 * 비정상 종료에서 부르면 안 된다 — 남아 있어야 같은 신원으로 재접속한다.
 */
export const clearMeetingState = (code: string): void => {
  removeSession(nicknameKey(code));
  removeSession(hostTokenKey(code));
  removeSession(participantIdKey(code));
  removeSession(mediaIntentKey(code));
};

export const saveHostToken = (code: string, token: string): void =>
  writeSession(hostTokenKey(code), token);

export const getHostToken = (code: string): string | null => readSession(hostTokenKey(code));

/** 재연결·새로고침을 넘어 유지되는 내 식별자. 없으면 만들어 보관한다. */
export const getParticipantId = (code: string): string => {
  const existing = readSession(participantIdKey(code));
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
  writeSession(participantIdKey(code), created);
  return created;
};

export const getMediaIntent = (code: string): MediaIntent => {
  const raw = readSession(mediaIntentKey(code));
  if (raw === null) return NO_MEDIA;
  try {
    const parsed = JSON.parse(raw) as Partial<MediaIntent>;
    return { audio: parsed.audio === true, video: parsed.video === true };
  } catch {
    return NO_MEDIA;
  }
};

export const saveMediaIntent = (code: string, kind: keyof MediaIntent, on: boolean): void => {
  writeSession(mediaIntentKey(code), JSON.stringify({ ...getMediaIntent(code), [kind]: on }));
};

/** 입장 폼 기본값으로만 쓰고 퇴장 시 지우지 않는다. */
export const saveLastNickname = (nickname: string): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_NICKNAME_KEY, nickname);
};

export const getLastNickname = (): string =>
  typeof window === 'undefined' ? '' : (window.localStorage.getItem(LAST_NICKNAME_KEY) ?? '');
