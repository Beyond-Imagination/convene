import { create } from 'zustand';

/**
 * 영상 화질 선택 (zustand). 기기에 남도록 localStorage 에 둔다.
 *  - auto: 타일 크기에 맞춰 받는다.
 *  - saver: 받는 화질을 가장 낮추고 내 카메라 송출도 중간까지로 줄인다.
 *  - high: 보이는 영상은 가장 높은 화질로 받는다.
 */
export type VideoQuality = 'auto' | 'saver' | 'high';

export const VIDEO_QUALITY_STORAGE_KEY = 'convene.videoQuality';

const isQuality = (value: unknown): value is VideoQuality =>
  value === 'auto' || value === 'saver' || value === 'high';

const readStored = (): VideoQuality => {
  try {
    const value = window.localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY);
    return isQuality(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
};

export interface VideoQualityState {
  readonly quality: VideoQuality;
  readonly hydrate: () => void;
  readonly setQuality: (quality: VideoQuality) => void;
}

export const useVideoQualityStore = create<VideoQualityState>((set) => ({
  quality: 'auto',
  hydrate: () => set({ quality: readStored() }),
  setQuality: (quality) => {
    try {
      window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, quality);
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 모드 등)는 이번 화면에만 적용한다.
    }
    set({ quality });
  },
}));
