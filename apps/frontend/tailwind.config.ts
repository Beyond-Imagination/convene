import type { Config } from 'tailwindcss';

/**
 * Convene 디자인 시스템 Tailwind 설정.
 * 색은 전부 globals.css 의 CSS 변수를 가리키고, 값은 알파 유틸리티가 먹도록 RGB 채널로 받는다.
 * 폰트 변수는 app/layout.tsx 의 next/font 가 <html> 에 심는다.
 */
const token = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * 390px에서 min, 1920px에서 max가 되는 유동 값. 그 사이는 뷰포트에 비례해 흐른다.
 * 브레이크포인트로 끊으면 경계에서 글자가 한 번에 튀고, 그 사이 폭에서는 아무것도 안 변한다.
 */
const fluid = (minPx: number, maxPx: number): string => {
  const slope = (maxPx - minPx) / (1920 - 390);
  const intercept = (minPx - slope * 390) / 16;
  return `clamp(${minPx / 16}rem, ${intercept.toFixed(4)}rem + ${(slope * 100).toFixed(4)}vw, ${maxPx / 16}rem)`;
};

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
      fontSize: {
        cap: [fluid(11, 13), { lineHeight: '1.2' }],
        meta: [fluid(12, 16), { lineHeight: '1.45' }],
        lead: [fluid(13.5, 18), { lineHeight: '1.7' }],
        body: [fluid(15, 16), { lineHeight: '1.65' }],
        action: [fluid(14, 16), { lineHeight: '1.2' }],
        field: [fluid(16, 22), { lineHeight: '1.4' }],
        title: [fluid(16, 26), { lineHeight: '1.2' }],
        code: [fluid(14, 23), { lineHeight: '1.2' }],
        display: [fluid(22, 40), { lineHeight: '1.15' }],
        wordmark: [fluid(24, 36), { lineHeight: '1.1' }],
      },
      spacing: {
        gutter: fluid(20, 64),
        'gutter-sm': fluid(12, 32),
        'panel-y': fluid(20, 70),
        'btn-y': fluid(14, 20),
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
