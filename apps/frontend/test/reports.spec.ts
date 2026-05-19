import { expect, test } from '@playwright/test';

/**
 * `/reports` 페이지 smoke.
 *
 * backend 가 살아 있고 회의록이 없으면 빈 상태 메시지("아직 회의록이 없습니다.")
 * 가 노출되어야 한다. backend 가 꺼져 있으면 alert(role="alert") 가 노출되는데,
 * 둘 다 frontend View 가 정상 분기한 결과이므로 본 spec 은 두 케이스 모두 허용한다.
 */
test.describe('/reports', () => {
  test('빈 상태 또는 에러 메시지를 노출한다', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: '회의록' })).toBeVisible();

    const empty = page.getByTestId('report-list-empty');
    const error = page.getByRole('alert');
    await expect(empty.or(error)).toBeVisible();
  });
});
