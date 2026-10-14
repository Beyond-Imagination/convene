'use client';

import { useEffect } from 'react';

import { type ThemePreference, useThemeStore } from '@/shared/stores/theme.store';

export interface UseSettingsViewModel {
  readonly theme: ThemePreference;
  readonly setTheme: (theme: ThemePreference) => void;
}

/** 설정 페이지와 회의 중 설정 모달이 함께 쓴다. */
export function useSettingsViewModel(): UseSettingsViewModel {
  const theme = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.setPreference);
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return { theme, setTheme };
}
