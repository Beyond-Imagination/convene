import { expect, test } from '@playwright/test';

/**
 * `/reports` 페이지 smoke.
 *
 * webServer.url 이 GET /reports 200 응답으로 readiness 를 확인하므로 backend 는
 * 살아 있고, InMemory ReportRepository 라 항목은 비어 있다. 따라서 빈 상태 메시지
 * `report-list-empty` 가 등장해야 한다.
 *
 * NOTE: Next.js 는 페이지 전환 시 `<div role="alert" id="__next-route-announcer__">`
 * 를 항상 본문에 둔다. `getByRole('alert')` 가 이를 함께 잡아 strict mode 위반이
 * 나므로, ReportList 의 alert 만 찾으려면 testid 또는 본문 텍스트로 한정한다.
 */
test.describe('/reports', () => {
  test('빈 상태 메시지가 노출된다', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: '회의록' })).toBeVisible();
    await expect(page.getByTestId('report-list-empty')).toBeVisible();
  });

  test('홈으로 링크를 누르면 메인 페이지로 이동한다', async ({ page }) => {
    await page.goto('/reports');
    await page.getByRole('link', { name: '홈으로' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
