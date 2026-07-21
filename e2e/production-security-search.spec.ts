import { expect, test } from '@playwright/test';

const enabled = process.env.E2E_WRITE_ENABLED === 'true'
  && Boolean(process.env.E2E_EMAIL)
  && Boolean(process.env.E2E_PASSWORD);

test.skip(!enabled, 'production write verification is opt-in and requires temporary credentials');

test.use({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });

test('a signed-in user adds 002463 without confirmation and the server keeps it', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem('stock-monitor:watchlist:v2', JSON.stringify([
      { id: 'production-e2e', name: '生产验收', tickers: [] },
    ]));
    localStorage.setItem('stock-monitor:watchlist:view', 'kanban');
  });

  let dialogCount = 0;
  page.on('dialog', async (dialog) => {
    dialogCount += 1;
    await dialog.dismiss();
  });

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.E2E_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/today');

  const seedResponse = await page.request.put('/api/watchlist/sync', {
    data: { groups: [{ id: 'production-e2e', name: '生产验收', tickers: [] }] },
  });
  expect(seedResponse.ok()).toBeTruthy();

  const initialSync = page.waitForResponse((response) => (
    response.url().endsWith('/api/watchlist/sync')
      && response.request().method() === 'GET'
      && response.status() === 200
  ));
  await page.goto('/watchlist');
  await initialSync;
  await expect(page.getByText('生产验收')).toBeVisible();
  await page.getByRole('button', { name: '＋ 加入股票' }).click();

  const input = page.getByPlaceholder(/代码 \/ 名称/);
  const searchResponse = page.waitForResponse((response) => (
    response.url().includes('/api/search?q=002463') && response.status() === 200
  ));
  await input.fill('002463');
  const response = await searchResponse;
  expect((await response.json()).source).toBe('security-master');

  const result = page.getByRole('button', { name: /沪电股份.*002463\.SZ/ });
  await expect(result).toBeVisible();
  const syncResponse = page.waitForResponse((candidate) => (
    candidate.url().endsWith('/api/watchlist/sync')
      && candidate.request().method() === 'PUT'
      && candidate.status() === 200
  ));
  await result.click();
  await syncResponse;

  await expect(page.locator('a[href="/stock/002463.SZ"]')).toContainText('沪电股份');
  await expect(page.getByText(/强制加入/)).toHaveCount(0);
  expect(dialogCount).toBe(0);

  await page.evaluate(() => localStorage.removeItem('stock-monitor:watchlist:v2'));
  await page.reload();
  await expect(page.locator('a[href="/stock/002463.SZ"]')).toContainText('沪电股份');
  await page.screenshot({ path: 'test-results/security-search-production.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('a[href="/stock/002463.SZ"]')).toContainText('沪电股份');
  const horizontalOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  expect(browserErrors).toEqual([]);
  await page.screenshot({ path: 'test-results/security-search-production-mobile.png', fullPage: true });
});
