'use client';

import type { ThemePreference } from '@/shared/stores/theme.store';

export function ThemeSetting(_props: {
  readonly value: ThemePreference;
  readonly onChange: (value: ThemePreference) => void;
}) {
  return null;
}

export function SettingsPanel() {
  return null;
}

export function SettingsDialog(_props: { readonly isOpen: boolean; readonly onClose: () => void }) {
  return null;
}
