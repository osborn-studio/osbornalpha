import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN' });

test('login only advertises authentication providers configured in production', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'GitHub', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apple', exact: true })).toHaveCount(0);
});

test('a 50-stock watchlist is fetched in bounded chunks without dropping tickers', async ({ page }) => {
  const tickers = Array.from({ length: 50 }, (_, index) => `${String(600000 + index).padStart(6, '0')}.SH`);
  const requestedChunks: string[][] = [];

  await page.addInitScript((seedTickers) => {
    localStorage.setItem('stock-monitor:watchlist:v2', JSON.stringify([
      { id: 'stability-board', name: '稳定性验收', tickers: seedTickers },
    ]));
    localStorage.setItem('stock-monitor:watchlist:view', 'table');
  }, tickers);
  await page.route('**/api/watchlist/sync', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Unauthorized' }),
  }));
  await page.route('**/api/quote/batch?*', async (route) => {
    const requestTickers = new URL(route.request().url()).searchParams.get('tickers')?.split(',') ?? [];
    requestedChunks.push(requestTickers);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const quotes = Object.fromEntries(requestTickers.map((ticker, index) => [ticker, {
      source: 'test', ticker, name: ticker, market: 'A', currency: '¥', price: 10 + index,
      change: 0, change_pct: 0, open: 10, high: 10, low: 10, prev_close: 10,
      volume: 0, amount: 0, amplitude: 0, market_cap: null, market_cap_label: '—',
      pe_ttm: null, pb: null, turnover: null, volume_ratio: null,
      updated_at: '2026-07-19T00:00:00+08:00', delayed: false,
    }]));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ quotes, meta: { failed: 0, stale: 0, failed_tickers: [] } }),
    });
  });
  await page.route('**/api/events', (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/watchlist');
  await expect.poll(() => new Set(requestedChunks.flat()).size).toBe(50);

  expect(requestedChunks.every((chunk) => chunk.length <= 10)).toBe(true);
  expect(new Set(requestedChunks.map((chunk) => chunk.join(','))).size).toBe(5);
});
