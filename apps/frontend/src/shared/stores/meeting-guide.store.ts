import { create } from 'zustand';

export const MEETING_GUIDE_STORAGE_KEY = 'convene.meetingGuide';

export interface MeetingGuideState {
  readonly showMeetingGuide: boolean;
  readonly isHydrated: boolean;
  readonly hydrate: () => void;
  readonly setShowMeetingGuide: (show: boolean) => void;
}

export const useMeetingGuideStore = create<MeetingGuideState>(() => ({
  showMeetingGuide: true,
  isHydrated: false,
  hydrate: () => {
    throw new Error('not implemented');
  },
  setShowMeetingGuide: () => {
    throw new Error('not implemented');
  },
}));
