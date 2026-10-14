import { act, renderHook } from '@testing-library/react';

import { THEME_STORAGE_KEY, useThemeStore } from '@/shared/stores/theme.store';

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
