import { test, expect } from '@playwright/test';

// Authenticated smoke suite. Skips entirely when credentials are not provided
// via env vars. Read-only — never submits a write action.
test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'no credentials');

test('login flow reaches /macro, then key authed pages render', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.E2E_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /登录/ }).click();

  await page.waitForURL('**/macro');
  await expect(page.getByRole('heading', { name: '宏观工作台' })).toBeVisible();

  await page.goto('/watchlist');
  await expect(page.locator('table')).toBeVisible();

  await page.goto('/intel');
  await expect(page.getByText('🧭 发现')).toBeVisible();

  await page.goto('/portfolio');
  await expect(page.locator('.grid.grid-cols-1.gap-4.lg\\:grid-cols-\\[280px_1fr_320px\\]')).toBeVisible();

  await page.goto('/analyst');
  await expect(page.getByText(/不构成投资建议/)).toBeVisible();

  await page.goto('/tools');
  await expect(page.locator('.grid.gap-3.sm\\:grid-cols-2')).toBeVisible();
});
