import { expect, test, type Page } from '@playwright/test';

const identities = {
  '002463': { t: '002463.SZ', n: '沪电股份', py: 'hdgf', m: 'A', asset_type: 'stock', exchange: 'SZSE' },
  '00700': { t: '00700.HK', n: '腾讯控股', py: 'txkg', m: 'HK', asset_type: 'stock', exchange: 'HKEX' },
  AAPL: { t: 'AAPL', n: 'Apple Inc.', py: '', m: 'US', asset_type: 'stock', exchange: 'NASDAQ' },
  BABA: { t: 'BABA', n: 'Alibaba Group Holding Limited American Depositary Shares', py: '', m: 'US', asset_type: 'stock', exchange: 'NYSE' },
} as const;

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('stock-monitor:watchlist:v2', JSON.stringify([
      { id: 'test-board', name: '我的股票池', tickers: [] },
    ]));
    localStorage.setItem('stock-monitor:watchlist:view', 'kanban');
  });
  await page.route('**/api/watchlist/sync', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Unauthorized' }),
  }));
  await page.route('**/api/search?*', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q')?.toUpperCase() ?? '';
    const identity = identities[query as keyof typeof identities];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'security-master',
        results: identity ? [{
          ...identity,
          list_status: 'listed',
          match_kind: 'exact_symbol',
          verification_status: 'verified',
          selectable: true,
        }] : [],
      }),
    });
  });
  await page.route('**/api/quote/batch?*', (route) => route.abort('internetdisconnected'));
  await page.route('**/api/events', (route) => route.fulfill({ status: 204, body: '' }));
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, locale: 'zh-CN' });

    test('verified identities search and 002463 adds once without a confirm dialog', async ({ page }) => {
      await prepare(page);
      let dialogCount = 0;
      page.on('dialog', async (dialog) => {
        dialogCount += 1;
        await dialog.dismiss();
      });

      await page.goto('/watchlist');
      await page.getByRole('button', { name: '搜索并添加' }).click();
      const input = page.getByPlaceholder(/代码 \/ 名称/);

      for (const code of ['00700', 'AAPL', 'BABA']) {
        await input.fill(code);
        const identity = identities[code as keyof typeof identities];
        const result = page.getByRole('button', { name: new RegExp(identity.t.replace('.', '\\.')) });
        await expect(result).toBeVisible();
        await expect(result).toBeEnabled();
      }

      await input.fill('002463');
      const result = page.getByRole('button', { name: /沪电股份.*002463\.SZ/ });
      await expect(result).toBeVisible();
      await result.click();

      await expect(page.getByText('已加入股票池，行情暂不可用。')).toBeVisible();
      const card = page.locator('a[href="/stock/002463.SZ"]');
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('沪电股份');
      await expect(page.getByText('强制加入')).toHaveCount(0);
      expect(dialogCount).toBe(0);

      await page.screenshot({
        path: `test-results/security-search-${viewport.name}.png`,
        fullPage: true,
      });
    });
  });
}
