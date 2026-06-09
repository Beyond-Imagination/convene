import type { Config } from 'tailwindcss';

/**
 * Convene v1 디자인 시스템 Tailwind 설정.
 *
 * 의미 기반 컬러 토큰(bg/surface/border/text/muted)은 globals.css의 CSS 변수를
 * 가리킨다. 기본값은 라이트(메인·입장·reports)이고, 회의 화면 컨테이너에
 * `.theme-dark`를 걸면 같은 클래스(`bg-surface` 등)가 다크 값으로 치환된다.
 * accent(블루)·danger는 라이트/다크 공통이라 상수로 둔다.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          active: '#1d4ed8',
        },
        danger: {
          DEFAULT: '#ef4444',
          hover: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
