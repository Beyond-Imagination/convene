import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * 두 명의 참가자 시나리오 (실제 socket.io broadcast + mediasoup pipeline 까지 검증).
 *
 * Chromium fake media device(`--use-fake-device-for-media-stream`)로 카메라/마이크
 * 없이 video/audio track 을 송출한다. 두 개의 BrowserContext 를 분리해 두 명의
 * 참가자가 다른 세션(닉네임 + zustand store) 으로 동시에 같은 회의에 입장하는
 * 흐름을 재현.
 *
 * 검증 범위:
 *   - 양쪽 모두 자기 LocalVideoTile 의 video.srcObject 가 부착된다(getUserMedia 동작).
 *   - 두 번째 참가자(B) 의 화면에서 A 가 참가자 리스트에 즉시 노출된다
 *     (서버가 join 직후 PARTICIPANTS broadcast 로 기존 참가자 목록을 전달).
 *   - 첫 번째 참가자(A) 의 화면에서도 B 가 PARTICIPANT_JOINED 로 노출된다.
 *
 * 원격 RTP 실제 수신(`remote-video-tile` 의 srcObject 부착)은 mediasoup ICE/DTLS
 * 가 호스트 OS 방화벽·UDP 라우팅에 의존해 CI 환경에서 결정적이지 않다. v1 단계
 * 에선 frontend ↔ backend 의 시그널링 / 참가자 목록 합치까지만 결정적으로 검증.
 */

const expectVideoAttached = async (page: Page, testId: string) => {
  await expect.poll(
    async () =>
      page.evaluate((id) => {
        const tile = document.querySelector(`[data-testid="${id}"]`);
        const video = tile?.querySelector('video');
        return video !== null && video !== undefined && video.srcObject !== null;
      }, testId),
    { timeout: 20_000 },
  ).toBe(true);
};

const createMeeting = async (page: Page, nickname: string): Promise<string> => {
  await page.goto('/');
  await page.getByLabel('닉네임').first().fill(nickname);
  await page.getByRole('button', { name: '회의 만들기' }).click();
  await page.waitForURL(/\/meetings\/[A-Za-z0-9]{8}/, { timeout: 15_000 });
  const url = new URL(page.url());
  const code = url.pathname.split('/').filter(Boolean)[1]!;
  return code;
};

const joinMeeting = async (page: Page, code: string, nickname: string) => {
  await page.goto('/');
  await page
    .locator('form[aria-label="join-form"]')
    .getByLabel('회의 코드')
    .fill(code);
  await page
    .locator('form[aria-label="join-form"]')
    .getByLabel('닉네임')
    .fill(nickname);
  await page.getByRole('button', { name: '입장' }).click();
  await page.waitForURL(new RegExp(`/meetings/${code}`), { timeout: 15_000 });
};

test.describe('두 참가자 - 시그널링 통합', () => {
  test.setTimeout(60_000);

  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser }) => {
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    pageA = await ctxA.newPage();
    pageB = await ctxB.newPage();
  });

  test.afterEach(async () => {
    await ctxA.close();
    await ctxB.close();
  });

  test('A 회의 만들기 → B 입장 → 양쪽 자기 비디오 + 상대방 참가자 노출', async () => {
    const code = await createMeeting(pageA, 'alice');
    await expectVideoAttached(pageA, 'local-video-tile');

    await joinMeeting(pageB, code, 'bob');
    await expectVideoAttached(pageB, 'local-video-tile');

    // B 에서 A 가 보임 (서버의 PARTICIPANTS broadcast)
    await expect(pageB.getByTestId('remote-participant').first()).toContainText('alice');

    // A 에서 B 가 보임 (B 입장 시 server 가 PARTICIPANT_JOINED 를 같은 room 에 broadcast)
    await expect(pageA.getByTestId('remote-participant').first()).toContainText('bob');

    // RemoteVideoTile DOM 이 양쪽에 렌더된다 (mediasoup 시그널링 이후)
    await expect(pageA.getByTestId('remote-video-tile')).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByTestId('remote-video-tile')).toBeVisible({ timeout: 15_000 });

    // 모든 video element 가 muted (autoplay 정책 회피)
    const aLocalMuted = await pageA
      .locator('[data-testid="local-video-tile"] video')
      .first()
      .evaluate((v) => (v as HTMLVideoElement).muted);
    const aRemoteMuted = await pageA
      .locator('[data-testid="remote-video-tile"] video')
      .first()
      .evaluate((v) => (v as HTMLVideoElement).muted);
    expect(aLocalMuted).toBe(true);
    expect(aRemoteMuted).toBe(true);

    // RemoteAudioPlayer 컨테이너가 존재한다 (audio entry 유무와 무관, 컨테이너 자체)
    await expect(pageA.getByTestId('remote-audio-player')).toBeAttached();
    await expect(pageB.getByTestId('remote-audio-player')).toBeAttached();
  });
});
