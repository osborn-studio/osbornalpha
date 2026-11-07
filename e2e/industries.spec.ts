import { test, expect } from '@playwright/test';

// Industry research pages (spec §13.5): three routes + source drawer + table view + unlicensed +
// reconstruction badge + mobile viewport. Runs against a dev server in fixture mode only:
//   INDUSTRY_E2E_FIXTURES=1 npx playwright test e2e/industries.spec.ts
// with NO Supabase env (the (app) layout lets an unconfigured dev server through), so the pages read
// the synthetic dependencies of src/lib/industry/e2e-fixture.ts. Read-only; never submits a write.
test.skip(process.env.INDUSTRY_E2E_FIXTURES !== '1', 'fixture mode only (INDUSTRY_E2E_FIXTURES=1, no Supabase env)');
// The app picks the locale from Accept-Language (src/lib/i18n/locale.ts); the assertions use the zh copy.
test.use({ locale: 'zh-CN' });

test('list: heatmap with reconstruction badge, a cell opens the drawer and replays, table view', async ({ page }) => {
  await page.goto('/intel/industries');
  await expect(page.getByRole('heading', { level: 1, name: '行业研究' })).toBeVisible();
  await expect(page.locator('[data-history-class="reconstruction"]').first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '历史重建' })).toBeVisible();
  const heatmap = page.getByRole('region', { name: '热力图' });
  await expect(heatmap).toBeVisible();
  await expect(heatmap.getByText('47.8%')).toBeVisible();
  await expect(heatmap.getByText('—').first()).toBeVisible();          // 银行 gross margin: financial_excluded, never 0

  await heatmap.getByRole('button', { name: /^食品饮料 · 2025-12-31/ }).click();
  const drawer = page.getByRole('dialog', { name: '来源抽屉' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('原样回放')).toBeVisible();
  await expect(drawer.locator('[data-reproduced="true"]')).toBeVisible({ timeout: 30_000 });   // the happy path must REPRODUCE (first dev compile of the replay route is slow)
  await expect(drawer.locator('[data-reproduced="false"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await page.getByRole('link', { name: '表格', exact: true }).click();
  await page.waitForURL('**/intel/industries?view=table');
  const table = page.getByRole('region', { name: '表格视图' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('link', { name: '食品饮料' })).toBeVisible();
  await expect(page.getByText('估值未启用')).toBeVisible();
  await expect(page.getByText('未设判断')).toBeVisible();
});

test('a tampered cell (stored value ≠ its manifest) shows the not-reproduced state (Codex round 1 #8)', async ({ page }) => {
  await page.goto('/intel/industries');
  const heatmap = page.getByRole('region', { name: '热力图' });
  await heatmap.getByRole('button', { name: /^电子 · 2025-12-31/ }).click();   // E2E_TAMPERED in src/lib/industry/e2e-fixture.ts
  const drawer = page.getByRole('dialog', { name: '来源抽屉' });
  await expect(drawer.locator('[data-reproduced="false"]')).toBeVisible({ timeout: 30_000 });
  await expect(drawer.locator('[data-reproduced="true"]')).toHaveCount(0);
});

test('detail: series with its table equivalent, member summary, valuation not enabled, judgments off', async ({ page }) => {
  await page.goto('/intel/industries/sw2021/801120.SI');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('食品饮料');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('801120.SI');
  await expect(page.getByText('表格等价视图')).toBeVisible();
  await expect(page.locator('[data-history-class="reconstruction"]').first()).toBeVisible();
  await expect(page.getByText('估值未启用')).toBeVisible();
  await expect(page.locator('[data-judgments="disabled"]')).toBeVisible();
  await page.getByRole('link', { name: /查看成分/ }).click();
  await page.waitForURL('**/intel/industries/sw2021/801120.SI/constituents');
});

test('constituents: date-driven members, unresolved as a count, membership drawer', async ({ page }) => {
  await page.goto('/intel/industries/sw2021/801120.SI/constituents?on=2026-01-01');
  await expect(page.getByText('600519.SH')).toBeVisible();
  await expect(page.getByText('1 未解析成分（只给计数）')).toBeVisible();
  await page.getByRole('button', { name: /贵州茅台 2021-07-30/ }).click();
  await expect(page.locator('[data-drawer-kind="membership"]')).toBeVisible();
  await page.goto('/intel/industries/sw2021/801120.SI/constituents?on=2020-01-01');
  await expect(page.getByText('600519.SH')).toBeHidden();             // included 2021-07-30: not a member yet
});

test('unlicensed: no number is shown and SIC is offered', async ({ page }) => {
  await page.goto('/intel');
  await page.context().addCookies([{ name: 'industry_e2e', value: 'unlicensed', url: page.url() }]);
  await page.goto('/intel/industries');
  await expect(page.getByText('申万 2021 数据授权待确认')).toBeVisible();
  await expect(page.getByRole('region', { name: '热力图' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '切换到 SIC' })).toBeVisible();
});

test('mobile 390px: no horizontal page scroll, drawer is a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/intel/industries');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('region', { name: '热力图' }).getByRole('button', { name: /^食品饮料 · 2025-12-31/ }).click();
  const box = await page.getByRole('dialog', { name: '来源抽屉' }).boundingBox();
  expect(box?.width).toBeGreaterThan(360);                           // full width (minus a scrollbar), not the 440px side panel
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBeGreaterThanOrEqual(840);   // anchored to the bottom edge
  await page.goto('/intel/industries/sw2021/801120.SI');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
