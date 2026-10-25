import { act, renderHook } from '@testing-library/react';

import {
  MEETING_GUIDE_STORAGE_KEY,
  useMeetingGuideStore,
} from '@/shared/stores/meeting-guide.store';
import { THEME_STORAGE_KEY, useThemeStore } from '@/shared/stores/theme.store';
import {
  useVideoQualityStore,
  VIDEO_QUALITY_STORAGE_KEY,
} from '@/shared/stores/video-quality.store';

import { useSettingsViewModel } from './useSettingsViewModel';

describe('useSettingsViewModel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    useThemeStore.setState({ preference: 'system' });
  });

  it('마운트하면 저장된 테마 선택을 보여 준다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = renderHook(() => useSettingsViewModel());
    expect(result.current.theme).toBe('light');
  });

  it('setTheme으로 테마를 바꾼다', () => {
    const { result } = renderHook(() => useSettingsViewModel());
    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('useSettingsViewModel - 회의 화면 가이드', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useMeetingGuideStore.setState({ showMeetingGuide: true, isHydrated: false });
  });

  it('가이드를 이미 본 기기에서는 꺼진 채로 보여 준다', () => {
    window.localStorage.setItem(MEETING_GUIDE_STORAGE_KEY, 'seen');
    const { result } = renderHook(() => useSettingsViewModel());
    expect(result.current.meetingGuide).toBe(false);
  });

  it('다시 켜면 다음에 가이드를 보여 주도록 남긴다', () => {
    window.localStorage.setItem(MEETING_GUIDE_STORAGE_KEY, 'seen');
    const { result } = renderHook(() => useSettingsViewModel());
    act(() => result.current.setMeetingGuide(true));
    expect(result.current.meetingGuide).toBe(true);
    expect(window.localStorage.getItem(MEETING_GUIDE_STORAGE_KEY)).toBe('show');
  });
});

describe('useSettingsViewModel - 영상 화질', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useVideoQualityStore.setState({ quality: 'auto' });
  });

  it('마운트하면 저장된 화질 선택을 보여 준다', () => {
    window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, 'high');
    const { result } = renderHook(() => useSettingsViewModel());
    expect(result.current.videoQuality).toBe('high');
  });

  it('setVideoQuality로 화질을 바꾼다', () => {
    const { result } = renderHook(() => useSettingsViewModel());
    act(() => result.current.setVideoQuality('saver'));
    expect(result.current.videoQuality).toBe('saver');
  });
});
