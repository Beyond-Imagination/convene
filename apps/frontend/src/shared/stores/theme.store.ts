import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'convene.theme';

export const THEME_INIT_SCRIPT = '';

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly hydrate: () => void;
  readonly setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>(() => ({
  preference: 'system',
  hydrate: () => {
    throw new Error('not implemented');
  },
  setPreference: () => {
    throw new Error('not implemented');
  },
}));
