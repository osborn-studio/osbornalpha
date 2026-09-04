import { expect, test } from '@playwright/test';

const bars = [
  { time: 1786354200, open: 100, high: 103, low: 99, close: 102, volume: 1000, previousClose: 99, change: 3, changePct: 3.0303030303030303 },
  { time: 1786354260, open: 102, high: 104, low: 101, close: 103, volume: 1200, previousClose: 102, change: 1, changePct: 0.9803921568627451 },
];

test('ticker chart requests the selected business range and exposes provenance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ranges: string[] = [];
  await page.route('**/api/quote/**', (route) => route.abort('internetdisconnected'));
  await page.route('**/api/kline/**', async (route) => {
    const range = new URL(route.request().url()).searchParams.get('range');
    if (range) ranges.push(range);
    const interval = range === '1d' || range === '5d' ? 'minute' : range === '5y' ? 'week' : range === 'all' ? 'month' : 'day';
    const requestedBars = range === '1d' ? 390 : range === '5d' ? 390
      : range === '1m' ? 32 : range === '6m' ? 140 : range === 'ytd' ? 175 : range === '1y' ? 260
      : range === '5y' ? 275 : 600;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'eastmoney', bars,
        meta: {
          range,
          interval,
          granularity: range === '1d' ? '1m' : range === '5d' ? '5m' : interval === 'day' ? '1d' : interval === 'week' ? '1w' : '1mo',
          source: 'eastmoney',
          adjustment: interval === 'minute' ? 'intraday' : 'none',
          rangeBasis: interval === 'minute' ? 'trading-sessions' : 'calendar-window',
          coverageStart: '2026-08-10 09:30:00',
          coverageEnd: '2026-08-10 09:31:00',
          asOf: '2026-08-10 09:31:00',
          timezone: 'America/New_York',
          fetchedAt: '2026-08-10T13:31:00.000Z',
          delayed: false,
          cacheTtlSeconds: 60,
          market: 'US',
          currency: '$',
          currencyCode: 'USD',
          pricePrecision: 2,
          minMove: 0.01,
          volumeUnit: 'shares',
          requestedBars,
          returnedBars: bars.length,
          availableBars: 40,
          missingBars: Math.max(0, requestedBars - 40),
          freshness: 'fresh',
          fallbackUsed: false,
          cacheStatus: 'shared-swr',
          completeness: 'partial',
          partial: false,
          warnings: ['partial_coverage'],
        },
      }),
    });
  });
  await page.goto('/en/stock/NVDA');

  const chart = page.getByTestId('kline-chart');
  await expect(chart).toBeVisible();
  await expect(page.getByText('Live quote unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('$1,180.50')).toHaveCount(0);
  await expect(chart.getByText('Source: Eastmoney')).toBeVisible();
  await chart.getByText('Data details').click();
  await expect(chart.getByText('Currency: USD')).toBeVisible();
  await expect(chart.getByText('Volume unit: shares')).toBeVisible();
  await expect(chart.getByText('Shared SWR cache hit')).toBeVisible();
  await expect(chart.getByText('Partial range coverage')).toBeVisible();
  await expect(chart.getByTestId('kline-tooltip')).toContainText('O 102.00');
  await expect(chart.getByTestId('kline-tooltip')).toContainText('C 103.00');
  await expect(chart.getByTestId('kline-tooltip')).toContainText('vs prev close +1.00 (+0.98%)');
  await expect(chart.getByTestId('kline-tooltip')).toContainText('Volume 1.2K shares');
  await expect(chart.getByRole('button', { name: '1D' })).toBeEnabled();
  await chart.getByRole('button', { name: '1Y' }).click();
  await expect.poll(() => ranges).toContain('1y');
  await expect(chart.locator('canvas').first()).toBeVisible();
});

test('ticker chart offers an explicit retry after a provider failure', async ({ page }) => {
  await page.route('**/api/quote/**', (route) => route.abort('internetdisconnected'));
  let attempts = 0;
  await page.route('**/api/kline/**', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'provider_unavailable', bars: [] }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'eastmoney',
        bars,
        meta: {
          range: '1d', interval: 'minute', granularity: '1m', source: 'eastmoney', adjustment: 'intraday',
          rangeBasis: 'trading-sessions',
          coverageStart: '2026-08-10', coverageEnd: '2026-08-11', asOf: '2026-08-11',
          timezone: 'America/New_York', fetchedAt: '2026-08-11T20:00:00.000Z', delayed: false,
          cacheTtlSeconds: 60, currency: '$', currencyCode: 'USD', pricePrecision: 2, minMove: 0.01,
          market: 'US', volumeUnit: 'shares', requestedBars: 390,
          returnedBars: bars.length, availableBars: 68, missingBars: 0,
          freshness: 'fresh', fallbackUsed: false, cacheStatus: 'none',
          completeness: 'partial', partial: false, warnings: ['partial_coverage'],
        },
      }),
    });
  });
  await page.goto('/en/stock/NVDA');

  const chart = page.getByTestId('kline-chart');
  await expect(chart.getByText('Market-data providers are temporarily unavailable. Try again shortly.')).toBeVisible();
  await chart.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(chart.locator('canvas').first()).toBeVisible();
});
