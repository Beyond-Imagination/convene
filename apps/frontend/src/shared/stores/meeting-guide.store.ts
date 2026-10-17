import { create } from 'zustand';

/**
 * 회의 화면 가이드를 보여 줄지 (zustand).
 *
 * 한 번 보거나 건너뛰면 기기에 'seen' 으로 남겨 다시 띄우지 않는다. 설정에서 다시 켜면 'show'.
 * 저장값이 없으면 처음 쓰는 기기로 보고 보여 준다.
 */
export const MEETING_GUIDE_STORAGE_KEY = 'convene.meetingGuide';

const readStored = (): boolean => {
  try {
    return window.localStorage.getItem(MEETING_GUIDE_STORAGE_KEY) !== 'seen';
  } catch {
    return true;
  }
};

export interface MeetingGuideState {
  readonly showMeetingGuide: boolean;
  /** 저장값을 읽기 전에는 가이드를 띄우지 않는다. 기본값 true 로 이미 본 사람에게 뜨는 것을 막는다. */
  readonly isHydrated: boolean;
  readonly hydrate: () => void;
  readonly setShowMeetingGuide: (show: boolean) => void;
}

export const useMeetingGuideStore = create<MeetingGuideState>((set) => ({
  showMeetingGuide: true,
  isHydrated: false,
  hydrate: () => set({ showMeetingGuide: readStored(), isHydrated: true }),
  setShowMeetingGuide: (show) => {
    try {
      window.localStorage.setItem(MEETING_GUIDE_STORAGE_KEY, show ? 'show' : 'seen');
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 모드 등)는 이번 화면에만 적용한다.
    }
    set({ showMeetingGuide: show });
  },
}));
