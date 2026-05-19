import { expect, test } from '@playwright/test';

/**
 * 회의 생성 → backend 통합 smoke.
 *
 * 회의 만들기 폼은 닉네임 + "회의 만들기" 버튼 1개를 받는다. submit 성공 시:
 *   1) `session.store.setNickname(trim)`
 *   2) POST /meetings 호출 → 8자 `code` 응답
 *   3) `/meetings/{code}` 로 router.push
 *
 * 이전엔 닉네임이 없어 `/meetings/{code}` 진입 직후 useMeetingViewModel 이
 * `/` 로 redirect 시켰지만, 이제는 store 에 닉네임이 있어 페이지가 유지된다.
 *
 * NOTE: Next.js 의 `#__next-route-announcer__` 는 `role="alert"` 라 strict 모드
 * 에서 selector 충돌이 생긴다. 본 spec 은 URL 변화만으로 판정한다.
 */
test.describe('회의 생성 (backend 통합)', () => {
  test('닉네임 입력 후 회의 만들기 클릭 → /meetings/{code} 로 이동한다', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('닉네임').first().fill('e2e-user');
    await page.getByRole('button', { name: '회의 만들기' }).click();
    await page.waitForURL(/\/meetings\/[A-Za-z0-9]{8}/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('회의');
  });

  test('닉네임을 비워둔 채 클릭하면 검증 에러로 URL 이 유지된다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '회의 만들기' }).click();
    // 검증 alert 가 form 내부에 한정되어 떠야 한다(Next route announcer 와 분리).
    await expect(
      page.locator('form[aria-label="create-form"] [role="alert"]').first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
