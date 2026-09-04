import { expect, test, type Page } from '@playwright/test';

const fetchedAt = '2026-09-03T20:00:00.000Z';

async function mockStockShell(page: Page) {
  await page.route('**/api/quote/AAPL', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      source: 'test-feed', ticker: 'AAPL', name: 'Apple', market: 'US', currency: '$',
      price: 228.4, change: 2.1, change_pct: 0.93, open: 226.1, high: 229.2, low: 225.8,
      prev_close: 226.3, volume: 42_000_000, amount: 9_500_000_000, amplitude: 1.5,
      market_cap: 3_400_000_000_000, market_cap_label: '3.4T', pe_ttm: 34.2, pb: 48.1,
      turnover: 0.3, volume_ratio: 1.1, updated_at: fetchedAt, delayed: false,
    }),
  }));
  await page.route('**/api/kline/AAPL**', (route) => route.abort('internetdisconnected'));
  await page.route('**/api/watchlist/sync', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/events', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }));
}

test('News / Reports renders verified links and exposes partial source coverage', async ({ page }) => {
  await mockStockShell(page);
  await page.route('**/api/news/AAPL', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ticker: 'AAPL',
      items: [{
        id: 'web_news_1', title: 'Apple raises services outlook', source: 'reuters.com',
        url: 'https://www.reuters.com/technology/apple-services-outlook',
        snippet: 'Management raised its services outlook after the latest quarter.', sentiment: 0.5,
        publishedAt: '2026-09-02T15:00:00.000Z', fetchedAt, trustScore: 0.78, sourceType: 'news',
      }],
      meta: { status: 'complete', providers: ['tavily'], fetchedAt, warnings: [] },
    }),
  }));
  await page.route('**/api/reports/AAPL', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ticker: 'AAPL',
      items: [{
        id: 'web_report_1', title: 'Apple valuation update', broker: 'Example Securities', rating: 'Buy',
        targetPriceMin: 250, targetPriceMax: 260, targetChangePct: null,
        url: 'https://research.example.com/apple-valuation', publishedAt: '2026-09-01T12:00:00.000Z',
        source: 'public-search', trustScore: 0.68,
      }],
      consensus: { targetMedian: 255, targetMin: 250, targetMax: 260, count: 2 },
      meta: { status: 'partial', providers: ['tavily'], fetchedAt, warnings: ['broker:timeout'] },
    }),
  }));

  await page.goto('/en/stock/AAPL');
  await page.getByRole('button', { name: 'News / Reports' }).click();

  await expect(page.getByRole('status')).toContainText('Some external sources were unavailable');
  const newsLink = page.getByRole('link', { name: 'Apple raises services outlook' });
  await expect(newsLink).toHaveAttribute('href', 'https://www.reuters.com/technology/apple-services-outlook');
  await expect(newsLink).toHaveAttribute('target', '_blank');
  const reportLink = page.getByRole('link', { name: 'Apple valuation update' });
  await expect(reportLink).toHaveAttribute('href', 'https://research.example.com/apple-valuation');
  await expect(page.getByText('Sell-side consensus target $255.00')).toBeVisible();
  await expect(page.getByText('Sources: tavily')).toBeVisible();
  await expect(page.getByText('Apple Intelligence 中国合作伙伴敲定')).toHaveCount(0);
});

test('News / Reports shows an explicit unavailable state without mock fallback', async ({ page }) => {
  await mockStockShell(page);
  const unavailable = { status: 'unavailable', providers: [], fetchedAt, warnings: ['search_provider_not_configured'] };
  await page.route('**/api/news/AAPL', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ticker: 'AAPL', items: [], meta: unavailable }),
  }));
  await page.route('**/api/reports/AAPL', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ticker: 'AAPL', items: [], consensus: null, meta: unavailable }),
  }));

  await page.goto('/en/stock/AAPL');
  await page.getByRole('button', { name: 'News / Reports' }).click();

  await expect(page.getByRole('status')).toContainText('Web search is not configured');
  await expect(page.getByText('No recent reports')).toBeVisible();
  await expect(page.getByText('No recent verified news')).toBeVisible();
  await expect(page.getByText('Apple Intelligence 中国合作伙伴敲定')).toHaveCount(0);
});
