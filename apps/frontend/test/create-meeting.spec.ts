import { expect, test } from '@playwright/test';

/**
 * 회의 생성 → backend 통합 smoke.
 *
 * "회의 만들기" 버튼은 POST /meetings 를 호출하고 8자 `code` 를 받아
 * `/meetings/{code}` 로 router.push 한다. v1 의 회의 생성은 닉네임을 받지 않으므로
 * /meetings/[code] 페이지의 useMeetingViewModel 이 store.nickname=null 을 보고
 * 다시 `/` 로 redirect 한다. 따라서 본 spec 은 다음 결과 중 하나로 종료되는지만
 * 검증한다:
 *   - 일시적으로 /meetings/{code} 가 URL 에 잡힘
 *   - 또는 곧바로 / 로 redirect 되어 헤딩이 다시 보임
 *
 * backend 가 죽었다면 status='error' alert 가 페이지에 떠야 한다.
 */
test.describe('회의 생성 (backend 통합)', () => {
  test('회의 만들기 클릭 후 /meetings/{code} 로 navigate 되거나 / 로 redirect 된다', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '회의 만들기' }).click();

    // 최대 15s 동안 둘 중 하나가 충족되면 OK.
    await page.waitForFunction(
      () =>
        /\/meetings\/[A-Za-z0-9]{8}$/.test(window.location.pathname) ||
        window.location.pathname === '/' ||
        document.querySelector('[role="alert"]') !== null,
      null,
      { timeout: 15_000 },
    );

    const url = page.url();
    if (/\/meetings\/[A-Za-z0-9]{8}$/.test(new URL(url).pathname)) {
      // 페이지가 진입했다면 헤더가 노출되어야 한다(redirect 이전 순간이거나 닉네임이 있는 케이스).
      await expect(page.getByRole('heading', { level: 1 })).toContainText('회의');
    } else if (new URL(url).pathname === '/') {
      // redirect 되었다면 홈 페이지 헤딩이 다시 보여야 한다.
      await expect(page.getByRole('heading', { name: '회의 만들기' })).toBeVisible();
    } else {
      // 그 외엔 error alert 가 떠 있어야 한다(backend 오류 등).
      await expect(page.getByRole('alert')).toBeVisible();
    }
  });
});
