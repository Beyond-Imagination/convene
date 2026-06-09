import { expect, test } from '@playwright/test';

/**
 * 홈 페이지(`/`) smoke.
 * - 회의 만들기 / 입장 폼이 dumb View로 렌더되고 필수 컨트롤이 보인다.
 * - backend 호출 없이도 통과한다(폼 제출 직전까지의 정적 UI 검증).
 */
test.describe('home page', () => {
  test('회의 만들기 / 입장 폼이 모두 노출된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '회의 만들기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '회의 만들기' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '회의 입장' })).toBeVisible();
    await expect(page.getByRole('button', { name: '입장' })).toBeVisible();
  });

  test('입장 폼은 빈 값으로 제출하면 검증 에러를 노출하고 URL이 유지된다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '입장' }).click();
    // react-hook-form의 zod 검증이 발동되면 form 내부에 alert가 1 개 이상 떠야 한다.
    await expect(page.locator('form[aria-label="join-form"] [role="alert"]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('회의록 보기 링크를 누르면 /reports로 이동한다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '회의록 보기' }).click();
    await expect(page).toHaveURL(/\/reports\/?$/);
  });
});
