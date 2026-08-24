import { expect, test } from '@playwright/test';

const position = (ticker: string, shares: number, avgCost: number, currency: string) => ({
  user_id: 'fixture-user', ticker, shares, avg_cost: avgCost, realized_pnl: 0,
  currency, opened_at: '2026-01-01T00:00:00Z', closed_at: null,
});

const quote = (ticker: string, name: string, market: 'A' | 'HK' | 'US', currency: string, price: number) => ({
  source: 'fixture', ticker, name, market, currency, price,
  change: 1, change_pct: 1, open: price, high: price, low: price, prev_close: price - 1,
  volume: 1, amount: 1, amplitude: 1, market_cap: null, market_cap_label: '',
  pe_ttm: null, pb: null, turnover: null, volume_ratio: null,
  updated_at: '2026-08-09T00:00:00Z', delayed: false,
});

test('groups holdings by market and sums each market value independently', async ({ page }) => {
  const positions = [
    position('AAPL', 10, 180, 'CNY'),
    position('00700.HK', 100, 450, 'CNY'),
    position('03690.HK', 20, 90, 'CNY'),
    position('002624.SZ', 1000, 17, 'CNY'),
  ];
  const quotes = {
    AAPL: quote('AAPL', 'Apple', 'US', 'USD', 200),
    '00700.HK': quote('00700.HK', '腾讯控股', 'HK', 'HKD', 500),
    '03690.HK': quote('03690.HK', '美团-W', 'HK', 'HKD', 100),
    '002624.SZ': quote('002624.SZ', '完美世界', 'A', 'CNY', 18),
  };

  await page.route('**/api/portfolio', (route) => route.fulfill({
    json: { positions, totals: { realized_pnl: 0, open_count: positions.length } },
  }));
  await page.route('**/api/decisions*', (route) => route.fulfill({ json: { decisions: [] } }));
  await page.route('**/api/watchlist/sync', (route) => route.fulfill({
    json: { mode: 'server', ownerId: 'fixture-user', groups: [] },
  }));
  await page.route('**/api/quote/batch*', (route) => route.fulfill({ json: { quotes, failed: [] } }));
  await page.route('**/api/kline/**', (route) => route.fulfill({ json: { bars: [], source: 'fixture' } }));
  await page.route('**/api/signals/**', (route) => route.fulfill({ json: { signals: [] } }));

  await page.goto('/portfolio');

  const us = page.locator('[data-market-group="US"]');
  const hk = page.locator('[data-market-group="HK"]');
  const cn = page.locator('[data-market-group="A"]');

  await expect(us).toContainText('$2,000.00');
  await expect(us).toContainText('Apple');
  await expect(hk).toContainText('HK$52,000.00');
  await expect(hk).toContainText('腾讯控股');
  await expect(hk).toContainText('美团-W');
  await expect(cn).toContainText('¥18,000.00');
  await expect(cn).toContainText('完美世界');

  const perfectWorld = cn.locator('[data-position-ticker="002624.SZ"]');
  await expect(perfectWorld).toContainText('完美世界');
  await expect(perfectWorld).toContainText('002624.SZ');
  await expect(perfectWorld).toContainText('+¥1,000.00');
  await expect(perfectWorld).toContainText('+5.88%');
  await expect(perfectWorld).not.toContainText(/持仓数量|Shares Held/);
  await expect(perfectWorld).not.toContainText(/总市值|Total Market Value/);
  await expect(perfectWorld).not.toContainText(/现价|Current Price/);
  await expect(perfectWorld).not.toContainText(/均价|Average Price/);

  await expect(page.getByText(/^(持仓数量|Shares Held)$/).first()).toBeVisible();
  await expect(page.getByText(/^(现价|Current Price)$/).first()).toBeVisible();
  await expect(page.getByText(/^(均价|Average Price)$/).first()).toBeVisible();

  const railBox = await page.locator('[data-positions-rail]').boundingBox();
  expect(railBox?.width).toBe(320);
  const screenshotPath = test.info().outputPath('simplified-cockpit.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await test.info().attach('simplified-cockpit', {
    path: screenshotPath,
    contentType: 'image/png',
  });
});
