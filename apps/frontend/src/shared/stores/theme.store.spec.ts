import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, useThemeStore } from '@/shared/stores/theme.store';

const root = (): HTMLElement => document.documentElement;

describe('useThemeStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete root().dataset.theme;
    delete root().dataset.themePref;
    useThemeStore.setState({ preference: 'system' });
  });

  it('라이트/다크를 고르면 저장하고 문서에 바로 적용한다', () => {
    useThemeStore.getState().setPreference('dark');
    expect(useThemeStore.getState().preference).toBe('dark');
    expect(root().dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(root().dataset.themePref).toBe('dark');

    useThemeStore.getState().setPreference('light');
    expect(root().dataset.theme).toBe('light');
  });

  it('시스템을 고르면 문서 지정을 지워 OS 설정을 따르게 한다', () => {
    useThemeStore.getState().setPreference('dark');
    useThemeStore.getState().setPreference('system');
    expect(root().dataset.theme).toBeUndefined();
    expect(root().dataset.themePref).toBe('system');
    expect(useThemeStore.getState().preference).toBe('system');
  });

  it('hydrate는 저장된 선택을 읽고, 알 수 없는 값이면 시스템으로 본다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().preference).toBe('dark');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().preference).toBe('system');
  });

  it('저장소를 쓸 수 없어도 선택은 이번 화면에 적용된다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    useThemeStore.getState().setPreference('dark');
    expect(root().dataset.theme).toBe('dark');
    spy.mockRestore();
  });
});

describe('THEME_INIT_SCRIPT', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete root().dataset.theme;
    delete root().dataset.themePref;
  });

  it('첫 화면을 그리기 전에 저장된 라이트/다크를 문서에 적용한다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    new Function(THEME_INIT_SCRIPT)();
    expect(root().dataset.theme).toBe('dark');
    expect(root().dataset.themePref).toBe('dark');
  });

  it('시스템이거나 저장값이 없으면 테마는 지정하지 않고 선택만 시스템으로 적는다', () => {
    new Function(THEME_INIT_SCRIPT)();
    expect(root().dataset.theme).toBeUndefined();
    expect(root().dataset.themePref).toBe('system');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    new Function(THEME_INIT_SCRIPT)();
    expect(root().dataset.theme).toBeUndefined();
  });
});
