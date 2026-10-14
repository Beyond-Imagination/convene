'use client';

import type { ThemePreference } from '@/shared/stores/theme.store';

export interface UseSettingsViewModel {
  readonly theme: ThemePreference;
  readonly setTheme: (theme: ThemePreference) => void;
}

export function useSettingsViewModel(): UseSettingsViewModel {
  throw new Error('not implemented');
}
