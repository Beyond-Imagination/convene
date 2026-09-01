import type { Config } from 'tailwindcss';

/**
 * Convene 디자인 시스템 Tailwind 설정.
 * 색은 전부 globals.css 의 CSS 변수를 가리키고, 값은 알파 유틸리티가 먹도록 RGB 채널로 받는다.
 * 폰트 변수는 app/layout.tsx 의 next/font 가 <html> 에 심는다.
 */
const token = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        paper: token('paper'),
        surface: token('surface'),
        border: token('border'),
        text: token('text'),
        muted: token('muted'),
        'tile-off': token('tile-off'),
        'screen-bg': token('screen-bg'),
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          active: token('accent-active'),
          on: token('accent-on'),
          fg: token('accent-fg'),
        },
        danger: {
          DEFAULT: token('danger'),
          hover: token('danger-hover'),
          on: token('danger-on'),
          fg: token('danger-fg'),
        },
        positive: token('positive'),
        pending: token('pending'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
