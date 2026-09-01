import { expect, test } from '@playwright/test';

/**
 * `/reports` 페이지 smoke.
 *
 * webServer.url이 GET /reports 200 응답으로 readiness를 확인하므로 backend는 살아 있다.
 * 다만 항목이 있는지는 붙은 DB에 달렸으므로, 목록과 빈 상태 중 무엇이 나올지는 고정할 수 없다.
 * 여기서 확인할 것은 로딩에서 멈추지 않고 둘 중 하나로 끝나는지다.
 *
 * NOTE: Next.js는 페이지 전환 시 `<div role="alert" id="__next-route-announcer__">`를 항상 본문에 둔다.
 * `getByRole('alert')`가 이를 함께 잡아 strict mode 위반이 나므로, ReportList의 alert만 찾으려면 testid 또는 본문 텍스트로 한정한다.
 */
test.describe('/reports', () => {
  test('목록 또는 빈 상태 메시지가 노출된다', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: '회의록' })).toBeVisible();
    await expect(
      page.getByTestId('report-list-empty').or(page.getByTestId('report-list-item').first()),
    ).toBeVisible();
  });

  test('워드마크를 누르면 메인 페이지로 이동한다', async ({ page }) => {
    await page.goto('/reports');
    await page.getByRole('link', { name: 'Convene' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
