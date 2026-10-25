'use client';

import { useEffect } from 'react';

import { useMeetingGuideStore } from '@/shared/stores/meeting-guide.store';
import { type ThemePreference, useThemeStore } from '@/shared/stores/theme.store';
import { useVideoQualityStore, type VideoQuality } from '@/shared/stores/video-quality.store';

export interface UseSettingsViewModel {
  readonly theme: ThemePreference;
  readonly setTheme: (theme: ThemePreference) => void;
  /** 다음 회의 입장 때(회의 중이면 설정을 닫자마자) 가이드를 보여 줄지. */
  readonly meetingGuide: boolean;
  readonly setMeetingGuide: (show: boolean) => void;
  readonly videoQuality: VideoQuality;
  readonly setVideoQuality: (quality: VideoQuality) => void;
}

/** 설정 페이지와 회의 중 설정 모달이 함께 쓴다. */
export function useSettingsViewModel(): UseSettingsViewModel {
  const theme = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.setPreference);
  const hydrate = useThemeStore((s) => s.hydrate);
  const meetingGuide = useMeetingGuideStore((s) => s.showMeetingGuide);
  const setMeetingGuide = useMeetingGuideStore((s) => s.setShowMeetingGuide);
  const hydrateGuide = useMeetingGuideStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    hydrateGuide();
  }, [hydrate, hydrateGuide]);

  const videoQuality = useVideoQualityStore((s) => s.quality);
  const setVideoQuality = useVideoQualityStore((s) => s.setQuality);

  return { theme, setTheme, meetingGuide, setMeetingGuide, videoQuality, setVideoQuality };
}
