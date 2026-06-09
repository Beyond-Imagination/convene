import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Frontend vitest 설정.
 *
 * - happy-dom 환경 (jsdom보다 빠른 DOM polyfill, package.json devDeps)
 * - globals: true → describe/it/expect를 import 없이 사용 (백엔드 jest와 동일 DX)
 * - path alias: tsconfig.json의 `@/*`를 그대로 반영
 * - setup: @testing-library/jest-dom의 vitest matchers 등록
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // unit spec만 vitest가 실행한다 (src 인라인). src 외부의 test/ / e2e/ 는
    // Playwright e2e 전용이라 vitest가 건드리지 않는다.
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // tsconfig의 jsx가 'preserve' 라 esbuild에 자동 runtime을 직접 지정한다.
  // (Next.js는 자체 SWC로 처리하므로 vitest만 영향받음)
  esbuild: {
    jsx: 'automatic',
  },
});
