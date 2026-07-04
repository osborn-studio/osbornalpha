import { test, expect } from '@playwright/test';

// Unauthenticated smoke suite. Always runs — no credentials required.

test('/ returns 200 and contains osbornalpha', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('osbornalpha').first()).toBeVisible();
});

test('/design returns 200 and contains V3 Design System', async ({ page }) => {
  const response = await page.goto('/design');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('V3 Design System').first()).toBeVisible();
});

test('/portfolio redirects to /login with next=/portfolio', async ({ page }) => {
  await page.goto('/portfolio');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('next')).toBe('/portfolio');
});

test('/today redirects to /login with next=/today', async ({ page }) => {
  await page.goto('/today');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('next')).toBe('/today');
});

test('/dashboard permanently redirects and ultimately lands on login with next containing today', async ({ page }) => {
  await page.goto('/dashboard');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('next')).toContain('today');
});

test('GET /api/portfolio returns 401 JSON with an error field', async ({ request }) => {
  const response = await request.get('/api/portfolio');
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body).toHaveProperty('error');
});

test('/login shows email and password inputs', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

// --- G1a i18n: /en public prefix (middleware-rewrite strategy) ---

test('/en serves the English landing page', async ({ page }) => {
  const response = await page.goto('/en');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/AI Investment Cockpit/);
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
});

test('/ stays Chinese by default', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/AI 投资监控工作台/);
  expect(await page.locator('html').getAttribute('lang')).toBe('zh-CN');
});

test('/en/<protected> lands on login without /en polluting the next param', async ({ page }) => {
  await page.goto('/en/portfolio');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('next')).toBe('/portfolio');
});
