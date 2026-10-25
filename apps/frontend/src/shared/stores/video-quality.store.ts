import { create } from 'zustand';

export type VideoQuality = 'auto' | 'saver' | 'high';

export const VIDEO_QUALITY_STORAGE_KEY = 'convene.videoQuality';

export interface VideoQualityState {
  readonly quality: VideoQuality;
  readonly hydrate: () => void;
  readonly setQuality: (quality: VideoQuality) => void;
}

export const useVideoQualityStore = create<VideoQualityState>(() => ({
  quality: 'auto',
  hydrate: () => {
    throw new Error('not implemented');
  },
  setQuality: () => {
    throw new Error('not implemented');
  },
}));
