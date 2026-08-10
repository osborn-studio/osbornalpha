import { expect, test } from '@playwright/test';

const bars = [
  { time: 1786354200, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: 1786354260, open: 102, high: 104, low: 101, close: 103, volume: 1200 },
];

test('ticker chart requests the selected business range and exposes provenance', async ({ page }) => {
  const ranges: string[] = [];
  await page.route('**/api/quote/**', (route) => route.abort('internetdisconnected'));
  await page.route('**/api/kline/**', async (route) => {
    const range = new URL(route.request().url()).searchParams.get('range');
    if (range) ranges.push(range);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'eastmoney', bars,
        meta: { range, interval: range === '1d' ? 'minute' : 'day', coverageStart: '2026-08-10 09:30:00', coverageEnd: '2026-08-10 09:31:00', asOf: '2026-08-10 09:31:00', timezone: 'America/New_York', fetchedAt: '2026-08-10T13:31:00.000Z', delayed: true, cacheTtlSeconds: 60 },
      }),
    });
  });
  await page.goto('/en/stock/NVDA');

  const chart = page.getByTestId('kline-chart');
  await expect(chart).toBeVisible();
  await expect(chart.getByText('Source: Eastmoney')).toBeVisible();
  await chart.getByRole('button', { name: '1Y' }).click();
  await expect.poll(() => ranges).toContain('1y');
});
