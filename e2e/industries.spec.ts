import { test, expect, type Page } from '@playwright/test';

// Industry research pages (spec §13.5): three routes + source drawer + table view + unlicensed +
// reconstruction badge + mobile viewport. Runs against a dev server in fixture mode only:
//   INDUSTRY_E2E_FIXTURES=1 npx playwright test e2e/industries.spec.ts
// with NO Supabase env (the (app) layout lets an unconfigured dev server through), so the pages read
// the synthetic SIC and SW 2021 fixtures. Read-only; never submits a write.
test.skip(process.env.INDUSTRY_E2E_FIXTURES !== '1', 'fixture mode only (INDUSTRY_E2E_FIXTURES=1, no Supabase env)');
// The app picks the locale from Accept-Language (src/lib/i18n/locale.ts); the assertions use the zh copy.
test.use({ locale: 'zh-CN' });

const vendorList = '/intel/industries?scheme=sw2021';
const electronics = '/intel/industries/sw2021/801080.SI';

test('vendor list opens derived inputs, replays a stored observation and switches to its table', async ({ page }) => {
  await page.goto(vendorList);
  const grid = page.locator('[data-cn-grid="heatmap"]');
  await expect(grid).toBeVisible();
  await expect(page.locator('#vendor-run [data-research-state="reconstructed"]')).toBeVisible();
  await grid.getByRole('button', { name: /^电子 · 2025-12-31 · 营收同比/ }).click();
  const derived = page.locator('[data-drawer-kind="vendor_derived"]');
  await expect(derived).toContainText('yoy/1');
  const inputs = derived.locator('[data-drawer-section="inputs"] button');
  await expect(inputs).toHaveCount(2);
  await inputs.filter({ hasText: '2025-12-31' }).click();
  const observation = page.locator('[data-drawer-kind="vendor_observation"]');
  await expect(observation).toContainText('响应 SHA-256');
  const replay = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/industries/vendor' &&
    new URL(r.url()).searchParams.get('view') === 'replay');
  await observation.getByRole('button', { name: '重放（原始响应）' }).click();
  const response = await replay;
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
  const proof = await response.json();
  expect(proof.match).toBe(true);
  expect(typeof proof.replayed_text).toBe('string');
  await expect(observation.getByRole('status')).toHaveText(`已复现 · ${proof.replayed_text}`);
  await page.keyboard.press('Escape');
  await expect(observation).toHaveCount(0);

  await page.getByRole('link', { name: '表格', exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=table(?:&|$)/);
  const table = page.locator('[data-cn-grid="table"]');
  await expect(table.getByRole('link', { name: /电子/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: '覆盖率' })).toHaveCount(0);
});

test('vendor detail pairs series with its table and links to the current membership snapshot', async ({ page }) => {
  await page.goto(electronics);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('电子');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('801080.SI');
  await expect(page.getByRole('img', { name: /电子.*序列/ })).toBeVisible();
  await expect(page.getByRole('table', { name: '表格等价视图' })).toBeVisible();
  await expect(page.locator('[data-state="noJudgment"]')).toBeVisible();
  await page.getByRole('link', { name: /全部成分/ }).click();
  await expect(page).toHaveURL(/801080\.SI\/constituents$/);
  await expect(page.locator('[data-state="currentOnly"]')).toContainText('供应商只返回当前成分');
  const member = page.getByRole('row').filter({ hasText: '样本股份甲' });
  await expect(member.getByText('000101', { exact: true })).toBeVisible();
  await member.getByRole('button').click();
  const drawer = page.locator('[data-drawer-kind="vendor_membership"]');
  await expect(drawer).toContainText('样本股份甲 · 000101 ∈ 电子');
  await expect(drawer).toContainText('快照取数时间');
  await expect(drawer).toContainText('暂不可用');
});

test('vendor routes withhold all industry and security identities when the viewer is unlicensed', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'industry_e2e', value: 'unlicensed', url: baseURL! }]);
  for (const path of [vendorList, electronics, `${electronics}/constituents`, '/intel/industries/sw2021/unknown']) {
    await page.goto(path);
    await expect(page.locator('[data-state="withheldCn"]')).toBeVisible();
    await expect(page.locator('[data-cn-grid], #vendor-run, [data-source-button]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/电子|样本股份甲/);
    await expect(page.getByRole('link', { name: '切换到 SIC', exact: true })).toBeVisible();
  }
});

test('vendor mobile shows one period with working previous and next links and fits a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(vendorList);
  const periods = page.getByRole('navigation', { name: '期间' });
  const headers = page.locator('[data-cn-grid]:visible').getByRole('columnheader', { name: /^FY/ });
  await expect(headers).toHaveCount(1);
  await expect(headers).toHaveText('FY2025');
  await periods.getByRole('link', { name: '上一页' }).click();
  await expect(page).toHaveURL(/[?&]period=2024-12-31(?:&|$)/);
  await expect(headers).toHaveText('FY2024');
  await periods.getByRole('link', { name: '下一页' }).click();
  await expect(headers).toHaveText('FY2025');
  for (const path of [vendorList, electronics, `${electronics}/constituents`]) {
    await page.goto(path);
    await expect(page.locator('#vendor-run')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('SIC snapshot: fiscal heatmap → reproduced drawer → table → detail', async ({ page }) => {
  await page.goto('/intel/industries?scheme=sic');
  await expect(page.locator('[data-state="reconstruction"]')).toContainText('2026-11-03');
  const heatmap = page.getByRole('region', { name: '热力图' });
  await expect(heatmap.getByText('FY2025')).toHaveAttribute('title', '财年结束于 2025 年');
  await expect(heatmap.getByText('成分不足 2<5').filter({ visible: true }).first()).toBeVisible();
  await heatmap.getByRole('button', { name: /^Semiconductors & Related Devices · 2025-12-31/ }).click();
  const drawer = page.getByRole('dialog', { name: /^来源 ·/ });
  await expect(drawer.locator('[data-reproduced="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(drawer.getByText('6.00 十亿美元', { exact: true })).toBeVisible();
  await expect(drawer.getByText('6/6', { exact: true })).toBeVisible();
  await expect(drawer.getByText(/industry-agg-us/)).toBeVisible();
  await expect(drawer.getByRole('button', { name: '按当前证据重算' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await page.getByRole('link', { name: '表格', exact: true }).click();
  const table = page.getByRole('region', { name: '表格视图' });
  await expect(table).toBeVisible();
  await table.getByRole('link', { name: 'Semiconductors & Related Devices' }).click();
  await expect(page).toHaveURL(/\/intel\/industries\/sic\/3674$/);
  await expect(page.getByText('表格等价视图').filter({ visible: true })).toBeVisible();
  await expect(page.locator('[data-state="reconstruction"]')).toBeVisible();
  await expect(page.getByRole('link', { name: /查看成分/ })).toBeVisible();
});

test('bare list defaults to the SIC fixture view', async ({ page }) => {
  await page.goto('/intel/industries');
  await expect(page.getByText(/有值 1 \/ 2 个行业/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: '方案', exact: true }).getByRole('link', { name: 'SIC · 美股（SEC）', exact: true })).toHaveAttribute('aria-current', 'page');
  const heatmap = page.getByRole('region', { name: '热力图' });
  await expect(heatmap).toBeVisible();
  await expect(heatmap.getByRole('button', { name: /^Semiconductors & Related Devices · 2025-12-31/ })).toBeVisible();
});

async function shot(page: Page, name: string) {
  if (process.env.UI_SHOT_DIR) await page.screenshot({ path: `${process.env.UI_SHOT_DIR}/${name}.png`, fullPage: true });
}

for (const [vw, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] as const)
  for (const locale of ['zh-CN', 'en-US'] as const) test.describe(`SIC notices · ${vw} · ${locale}`, () => {
    test.use({ viewport, locale });
    test('omits the raw code on both pages and localizes the constituents notice', async ({ page }) => {
      for (const [name, url] of [['sic', '/intel/industries?scheme=sic'], ['constituents', '/intel/industries/sic/3674/constituents']]) {
        await page.goto(url);
        if (name === 'constituents') {
          const notice = page.locator('[data-state="currentOnly"]');
          await expect(notice).toBeVisible();
          const label = await notice.innerText();
          expect.soft(label).toContain(locale === 'zh-CN' ? '仅当前值' : 'Current only');
          expect.soft(label).not.toContain('current_only');
        }
        expect.soft(await page.locator('body').innerText()).not.toContain('current_only');
        await shot(page, `industries-${name}-${vw}-${locale}`);
      }
    });
  });
