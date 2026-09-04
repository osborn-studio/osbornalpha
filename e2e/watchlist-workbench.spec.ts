import { expect, test } from '@playwright/test';

const bars = [
  { time: 1756684800, open: 100, high: 103, low: 98, close: 102, volume: 1000, amount: 102000, previousClose: 99, change: 3, changePct: (3 / 99) * 100 },
  { time: 1764547200, open: 102, high: 110, low: 101, close: 108, volume: 1300, amount: 140400, previousClose: 102, change: 6, changePct: (6 / 102) * 100 },
  { time: 1772323200, open: 108, high: 109, low: 90, close: 94, volume: 1700, amount: 159800, previousClose: 108, change: -14, changePct: (-14 / 108) * 100 },
  { time: 1788220800, open: 94, high: 116, low: 93, close: 112, volume: 1500, amount: 168000, previousClose: 94, change: 18, changePct: (18 / 94) * 100 },
];

function quote(ticker: string, index: number) {
  const price = 100 + index * 20;
  return {
    source: 'test-feed', ticker, name: ticker === 'AAPL' ? 'Apple' : ticker === 'NVDA' ? 'NVIDIA' : 'Kweichow Moutai',
    market: ticker.endsWith('.SH') ? 'A' : 'US', currency: ticker.endsWith('.SH') ? '¥' : '$',
    price, change: index - 1, change_pct: (index - 1) * 1.25, open: price - 1, high: price + 3, low: price - 4,
    prev_close: price - index + 1, volume: 1_000_000 * (index + 1), amount: price * 1_000_000,
    amplitude: 5.5, market_cap: price * 1_000_000_000, market_cap_label: `${price}B`, pe_ttm: 20 + index,
    pb: 3 + index, turnover: 1.2 + index, volume_ratio: 1.1 + index / 10,
    updated_at: '2026-09-03T20:00:00.000Z', delayed: false,
  };
}

test('watchlist workbench filters, changes presets and opens a multi-chart quick view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem('stock-monitor:watchlist:v2', JSON.stringify([
      { id: 'core', name: 'Core', tickers: ['AAPL', 'NVDA'] },
      { id: 'cn', name: 'China', tickers: ['600519.SH'] },
    ]));
  });
  await page.route('**/api/watchlist/sync', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/events', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/quote/batch**', async (route) => {
    const tickers = new URL(route.request().url()).searchParams.get('tickers')?.split(',') ?? [];
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ quotes: Object.fromEntries(tickers.map((ticker, index) => [ticker, quote(ticker, index)])), meta: { failed: 0 } }),
    });
  });
  await page.route('**/api/kline/**', async (route) => {
    const range = new URL(route.request().url()).searchParams.get('range') ?? '1d';
    const interval = range === '1d' || range === '5d' ? 'minute' : 'day';
    const requestedBars = range === '1d' || range === '5d' ? 390
      : range === '1m' ? 32 : range === '6m' ? 140 : range === 'ytd' ? 175
      : range === '1y' ? 260 : range === '5y' ? 275 : 600;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'eastmoney', bars,
        meta: {
          range, interval, granularity: interval === 'minute' ? '1m' : '1d', source: 'eastmoney',
          adjustment: interval === 'minute' ? 'intraday' : 'none', rangeBasis: interval === 'minute' ? 'trading-sessions' : 'calendar-window',
          coverageStart: '2025-09-01', coverageEnd: '2026-09-01', asOf: '2026-09-01', timezone: 'America/New_York',
          fetchedAt: '2026-09-03T20:00:00.000Z', delayed: false, cacheTtlSeconds: 60, market: 'US', currency: '$',
          currencyCode: 'USD', pricePrecision: 2, minMove: 0.01, volumeUnit: 'shares', requestedBars,
          returnedBars: bars.length, availableBars: bars.length, missingBars: 0, freshness: 'fresh', fallbackUsed: false,
          cacheStatus: 'none', completeness: 'complete', partial: false, warnings: [],
        },
      }),
    });
  });

  await page.goto('/watchlist');
  await expect(page.getByRole('button', { name: 'Market', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Valuation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sort by PE (TTM)' })).toBeVisible();

  await page.getByPlaceholder('Search ticker or company').fill('AAPL');
  await expect(page.getByRole('link', { name: 'AAPL' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'NVDA' })).toHaveCount(0);
  await page.getByPlaceholder('Search ticker or company').fill('');
  await page.screenshot({ path: 'test-results/watchlist-table-desktop.png', fullPage: true });

  const appleRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'AAPL' }) });
  await appleRow.getByRole('button', { name: 'View' }).click();
  const drawer = page.getByRole('dialog', { name: 'Quick quote for AAPL' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('1Y price return')).toBeVisible();
  await expect(drawer.locator('canvas').first()).toBeVisible();
  await drawer.getByLabel('Chart type').selectOption('baseline');
  await expect(drawer.locator('canvas').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/watchlist-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Close quick quote' })).toBeVisible();
  await page.screenshot({ path: 'test-results/watchlist-mobile.png', fullPage: false });
  await drawer.getByRole('button', { name: 'Close quick quote' }).click();
  await expect(drawer).toBeHidden();
  await page.screenshot({ path: 'test-results/watchlist-table-mobile.png', fullPage: false });
});
