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

test('/today permanently redirects to /macro, then to /login with next=/macro', async ({ page }) => {
  await page.goto('/today');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('next')).toBe('/macro');
});

test('/dashboard permanently redirects and ultimately lands on login with next containing macro', async ({ page }) => {
  await page.goto('/dashboard');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('next')).toContain('macro');
});

test('/intel/macro and /intel/macro/transmission redirect to /macro/*', async ({ page }) => {
  for (const [path, next] of [['/intel/macro', '/macro'], ['/intel/macro/transmission', '/macro/transmission']]) {
    await page.goto(path);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe(next);
  }
});

test('legacy paths answer 308 with the /macro location', async ({ request }) => {
  const redirects = [
    ['/today', '/macro'],
    ['/dashboard', '/macro'],
    ['/intel/macro', '/macro'],
    ['/intel/macro/transmission', '/macro/transmission'],
    ['/intel/macro/review/US/2026-10', '/macro/review/US/2026-10'],
  ] as const;

  for (const [path, destination] of redirects) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location?.endsWith(destination), path).toBe(true);
  }
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

// `/` auto-detects via Accept-Language (spec's resolution chain), so pin a
// Chinese browser context for the zh assertion; English browsers get EN on `/`
// by design, while `/en` is always English regardless of browser locale.
test.describe('zh-locale browser', () => {
  test.use({ locale: 'zh-CN' });
  test('/ serves Chinese for zh browsers', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AI 投资监控工作台/);
    expect(await page.locator('html').getAttribute('lang')).toBe('zh-CN');
  });
});

test('/en/<protected> lands on login without /en polluting the next param', async ({ page }) => {
  await page.goto('/en/portfolio');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('next')).toBe('/portfolio');
});
