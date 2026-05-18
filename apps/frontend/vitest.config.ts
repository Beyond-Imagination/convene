import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Frontend vitest 설정.
 *
 * - happy-dom 환경 (jsdom 보다 빠른 DOM polyfill, package.json devDeps)
 * - globals: true → describe/it/expect 를 import 없이 사용 (백엔드 jest 와 동일 DX)
 * - path alias: tsconfig.json 의 `@/*` 를 그대로 반영
 * - setup: @testing-library/jest-dom 의 vitest matchers 등록
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // tsconfig 의 jsx 가 'preserve' 라 esbuild 에 자동 runtime 을 직접 지정한다.
  // (Next.js 는 자체 SWC 로 처리하므로 vitest 만 영향받음)
  esbuild: {
    jsx: 'automatic',
  },
});
