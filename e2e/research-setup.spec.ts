import { test, expect } from '@playwright/test';

// WP-A11 research setup wizard. Skips without credentials; read-only — opens both flows,
// checks the guided question card renders, never submits a write.
test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'no credentials');

test('setup wizard shows stage-0 progress and the first guided question of each flow', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.E2E_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /登录/ }).click();
  await page.waitForURL('**/today');

  await page.goto('/research');
  await page.getByRole('link', { name: /研究设置向导/ }).click();
  await page.waitForURL('**/research/setup');
  await expect(page.getByRole('heading', { name: '研究设置向导' })).toBeVisible();
  await expect(page.getByText('公司名单（in_scope）')).toBeVisible();
  await expect(page.getByText(/thesis（激活/)).toBeVisible();

  await page.getByRole('button', { name: /公司名单/ }).click();
  await expect(page.getByRole('heading', { name: /从候选里勾选要进名单的公司/ })).toBeVisible();
  await expect(page.getByText(/^范例：/)).toBeVisible();

  await page.getByRole('button', { name: /thesis（激活/ }).click();
  await expect(page.getByRole('heading', { name: /用一句话写出论点/ })).toBeVisible();
  // Guardrail: the first step refuses to advance without an answer.
  await page.getByRole('button', { name: '下一题' }).click();
  await expect(page.getByRole('alert')).toContainText('请用一句话写出论点');
});
