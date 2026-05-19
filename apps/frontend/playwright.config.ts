import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e 설정.
 *
 * - testDir: `test/` 만 본다(vitest 가 `src/**\/*.spec` 을 가져가는 것과 분리,
 *   [[feedback-test-layout]] 규칙).
 * - webServer.frontend: `pnpm dev` (Next.js dev, port 3000). 정적 export 산출물
 *   대신 dev 서버를 쓰는 이유는 첫 단계에서 dev 흐름이 더 빠르고 디버깅이 쉽기
 *   때문이다(추후 `pnpm build && pnpm preview` 로 교체 가능).
 * - webServer.backend: 같은 monorepo 의 backend dev 도 같이 띄운다. backend 가
 *   존재해야 회의 생성/목록 흐름이 의미 있다(InMemory 어댑터라 외부 의존 없음).
 * - reuseExistingServer: 로컬에서 이미 떠 있으면 그대로 사용해 빠르게 반복.
 *
 * NOTE: 처음 실행 전에 `npx playwright install chromium` 로 browser binary
 * 설치가 필요하다.
 */
export default defineConfig({
  testDir: './test',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm dev',
      cwd: '../backend',
      // backend 가 listen 을 시작하면 GET /reports 가 빈 items 로 200 응답한다.
      // (health endpoint 가 따로 없어 200 을 보장하는 GET 엔드포인트를 readiness 신호로 쓴다)
      url: 'http://localhost:5000/reports',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // mediasoup 시나리오를 위한 Chromium fake media stream:
        //  - `--use-fake-ui-for-media-stream`: getUserMedia 권한 자동 허용
        //  - `--use-fake-device-for-media-stream`: 실제 카메라/마이크 없이
        //    test pattern video + sine wave audio 를 송출
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
        permissions: ['camera', 'microphone'],
      },
    },
  ],
});
