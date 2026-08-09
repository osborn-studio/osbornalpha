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

  const us = page.locator('section').filter({ hasText: '(USD)' });
  const hk = page.locator('section').filter({ hasText: '(HKD)' });
  const cn = page.locator('section').filter({ hasText: '(RMB)' });

  await expect(us).toContainText('$2,000.00');
  await expect(us).toContainText('Apple');
  await expect(hk).toContainText('HK$52,000.00');
  await expect(hk).toContainText('腾讯控股');
  await expect(hk).toContainText('美团-W');
  await expect(cn).toContainText('¥18,000.00');
  await expect(cn).toContainText('完美世界');
  await expect(page.getByText(/持仓数量|Shares Held/).first()).toBeVisible();
  await expect(page.getByText(/现价 \/ 均价|Current Price \/ Average Price/).first()).toBeVisible();
});
