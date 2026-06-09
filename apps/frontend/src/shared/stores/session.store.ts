import { create } from 'zustand';

/**
 * 클라이언트 세션 상태 (zustand).
 *
 * v1은 회원 개념이 없으므로 "어떤 닉네임으로 회의에 입장했는가" 만 보관한다.
 * `/meetings/[code]` 페이지가 mount 될 때 본 store의 nickname으로 WS join 한다.
 *
 * persist 미적용 — 새 탭/리로드 시 다시 입력하도록 의도(개인정보 보존 최소화).
 */
export interface SessionState {
  readonly nickname: string | null;
  readonly setNickname: (nickname: string) => void;
  readonly clearNickname: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  nickname: null,
  setNickname: (nickname) => set({ nickname }),
  clearNickname: () => set({ nickname: null }),
}));
