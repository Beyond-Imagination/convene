import { create } from 'zustand';

/**
 * 화면 테마 선택 (zustand).
 *
 * 라이트/다크는 `<html data-theme>` 로 고정하고, 시스템은 속성을 지워 globals.css 의
 * prefers-color-scheme 를 따르게 한다. 선택은 기기에 남도록 localStorage 에 둔다.
 * `<html data-theme-pref>` 는 선택 자체(시스템 포함)다. 정적 HTML 은 '시스템' 으로 그려지므로
 * 설정 UI 의 선택 표시는 React 상태 대신 이 속성을 보고 첫 페인트부터 맞게 칠한다.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'convene.theme';

/**
 * `<head>` 에서 첫 페인트 전에 돌린다. React 가 붙기 전에 적용해야 다크 선택자가
 * 라이트 화면을 한 번 보고 넘어가는 깜박임이 없다. 정적 export 라 서버가 대신 못 해 준다.
 */
export const THEME_INIT_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='system';d.dataset.themePref=t;if(t!=='system')d.dataset.theme=t}catch(e){}`;

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

const readStored = (): ThemePreference => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
};

const applyToDocument = (preference: ThemePreference): void => {
  const root = document.documentElement;
  root.dataset.themePref = preference;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
};

export interface ThemeState {
  readonly preference: ThemePreference;
  /** 정적 HTML 은 'system' 으로 그려지므로 마운트 뒤에 저장된 선택을 읽어 맞춘다. */
  readonly hydrate: () => void;
  readonly setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  hydrate: () => set({ preference: readStored() }),
  setPreference: (preference) => {
    applyToDocument(preference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 모드 등)는 이번 화면에만 적용한다.
    }
    set({ preference });
  },
}));
