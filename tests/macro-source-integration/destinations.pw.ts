/**
 * Actual macro route functions and client components, synthetic transport only.
 * The harness models main's /intel/macro -> /macro redirect; it does not execute
 * Next middleware, authentication, deployed routing, or live upstream services.
 */
import { expect, test as base, type Page, type Response } from '@playwright/test';
import { fixtures } from './fixtures';
import { installMacroFixtures } from './transport';

const origin = process.env.MACRO_FIXTURE_BASE_URL ?? 'http://127.0.0.1:3147';
const test = base.extend<{ macroRegistry: Awaited<ReturnType<typeof installMacroFixtures>> }>({
  macroRegistry: [async ({ page }, runTest, info) => {
    const registry = await installMacroFixtures(page, 'valid');
    const errors: string[] = [];
    const documents: { url: string; status: number; headers: Record<string, string> }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.request().isNavigationRequest()) {
        documents.push({ url: response.url(), status: response.status(), headers: response.headers() });
      }
    });
    // ReviewIndex computes its closed-month grid at render time.
    await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') });
    try {
      await runTest(registry);
      registry.assertNoUnexpectedRequests();
      expect(errors, 'actual destination client must not crash').toEqual([]);
    } finally {
      await info.attach('destination-fixture-evidence', {
        body: JSON.stringify({ fixtureOnly: true, documents, requests: registry.hits, rejected: registry.rejected, errors }, null, 2),
        contentType: 'application/json',
      });
      await registry.dispose();
    }
  }, { auto: true }],
});

test.use({ serviceWorkers: 'block' });

function destinationURL(path: string): string { return new URL(path, origin).href; }

async function capture(page: Page, name: string) {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

async function loadedDestination(page: Page, response: Response | null, path: string) {
  expect(response, 'destination navigation must produce a document').not.toBeNull();
  expect(response!.status(), 'a 404/error/redirect-only result is never a loaded destination').toBe(200);
  expect(response!.headers()['x-fixture-render']).toBe('real-page-function-ssr');
  expect(response!.headers()['x-fixture-only']).toBe('true');
  const alias = response!.request().redirectedFrom();
  expect(alias?.url(), 'config-derived alias preserves the exact destination query').toBe(destinationURL(`/intel${path}`));
  const redirect = await alias!.response();
  expect(redirect?.status()).toBe(308);
  expect(redirect!.headers()['x-fixture-redirect']).toBe('simulated');
  await expect(page).toHaveURL(destinationURL(path));
  await expect(page.locator('[data-fixture-only=true]')).toBeVisible();
  await expect(page.getByText(/No such record|Macro data foundation not ready|Could not load/)).toHaveCount(0);
}

function apiQueries(registry: Awaited<ReturnType<typeof installMacroFixtures>>, path: string): string[] {
  return registry.hits.flatMap((hit) => {
    const url = new URL(hit.url, origin);
    return url.pathname === path ? [url.search] : [];
  });
}

test('indicator detail loads observations and the real chart/table controls', async ({ page, macroRegistry }) => {
  const response = await page.goto(destinationURL('/intel/macro/US_CPI_YOY'));
  await loadedDestination(page, response, '/macro/US_CPI_YOY');
  await expect(page.getByRole('heading', { name: 'U.S. CPI, year over year', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Time window' }).getByRole('button', { name: '5Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Chart or table view' }).getByRole('button', { name: 'Table view', exact: true }).click();
  const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Version', exact: true }) });
  const observation = fixtures.valid.detail.observations.at(-1)!;
  const row = table.getByRole('row').filter({ has: page.getByRole('cell', { name: observation.period_end.slice(0, 7), exact: true }) });
  await expect(row).toContainText(`${observation.value_text}%`);
  await expect(row).toContainText(`v${observation.version}`);
  await expect(row).toContainText(`${observation.available_at.slice(0, 10)} ${observation.available_at.slice(11, 16)} UTC`);
  expect(apiQueries(macroRegistry, '/api/macro/series/US_CPI_YOY').length).toBeGreaterThan(0);
  for (const query of apiQueries(macroRegistry, '/api/macro/series/US_CPI_YOY')) {
    const params = new URLSearchParams(query);
    expect(params.has('transform')).toBe(false);
    expect(params.get('from')).toBe('2021-11-07');
    expect([...params.keys()].sort()).toEqual(['from', 'to']);
    expect(params.get('to')).toBe('2026-11-07');
  }
  await capture(page, 'detail-observations');
  await page.getByRole('group', { name: 'Chart or table view' }).getByRole('button', { name: 'Chart', exact: true }).click();
  const chart = page.getByRole('img', { name: 'U.S. CPI, year over year history', exact: true });
  await expect(chart).toBeVisible();
  await expect(chart.locator('canvas').first(), 'real lightweight-charts canvas renders after the table toggle').toBeVisible();
});

test('history month_end reaches a rendered episode and preserves exact boundary switching', async ({ page, macroRegistry }) => {
  const response = await page.goto(destinationURL('/intel/macro/history?boundary=month_end'));
  await loadedDestination(page, response, '/macro/history?boundary=month_end');
  const boundary = page.getByRole('group', { name: 'Boundary', exact: true });
  await expect(boundary.getByRole('button', { name: 'Month end', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: /Fed policy action episodes/ })).toBeVisible();
  const episode = fixtures.valid.history.episodes[0];
  const row = page.getByRole('table').first().getByRole('row').filter({ hasText: `${episode.start} → ${episode.end}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Upper bound');
  await expect(row.getByRole('button').first()).toContainText('+12.5%');
  await expect(row).toContainText('100 (2024-09-30) → 112.5 (2025-12-31)');
  await expect(page.getByRole('columnheader', { name: 'Synthetic local asset %', exact: true })).toBeVisible();
  expect(apiQueries(macroRegistry, '/api/macro/strategy/cycle-table')).toEqual(['?boundary=month_end']);
  await capture(page, 'history-month-end');
  await boundary.getByRole('button', { name: 'Event day', exact: true }).click();
  await expect(page).toHaveURL(destinationURL('/macro/history?boundary=event_day'));
  await expect(boundary.getByRole('button', { name: 'Event day', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => apiQueries(macroRegistry, '/api/macro/strategy/cycle-table')).toEqual(['?boundary=month_end', '?boundary=event_day']);
  await expect(page.getByText('From = the last daily observation before', { exact: false })).toBeVisible();
});

test('transmission CN renders its nodes and requests the selected region exactly', async ({ page, macroRegistry }) => {
  const response = await page.goto(destinationURL('/intel/macro/transmission?region=CN'));
  await loadedDestination(page, response, '/macro/transmission?region=CN');
  const region = page.getByRole('group', { name: 'Region', exact: true });
  await expect(region.getByRole('button', { name: 'China', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Live transmission flow', exact: true })).toBeVisible();
  const node = fixtures.valid.transmission.CN.transmission.stages.flatMap((stage) => stage.nodes).find((item) => item.state === 'observed')!;
  await expect(page.getByText(node.label.en, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`${node.value_text}%`, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Playbooks/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Fed policy → US and China asset response/ })).toBeVisible();
  await expect(page.getByText('Synthetic historical response; local fixture only.', { exact: true })).toBeVisible();
  expect(apiQueries(macroRegistry, '/api/macro/strategy/transmission')).toEqual(['?region=CN']);
  expect(apiQueries(macroRegistry, '/api/macro/strategy/policy-response')).toEqual(['?window=3']);
  await capture(page, 'transmission-cn');
  await region.getByRole('button', { name: 'US', exact: true }).click();
  await expect(page).toHaveURL(destinationURL('/macro/transmission?region=US'));
  await expect.poll(() => apiQueries(macroRegistry, '/api/macro/strategy/transmission')).toEqual(['?region=CN', '?region=US']);
  await expect(region.getByRole('button', { name: 'US', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Synthetic US economy node', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Synthetic CN economy node', { exact: true })).toHaveCount(0);
});

test('real strategy tab opens the review grid and generated review link renders facts', async ({ page, macroRegistry }) => {
  const response = await page.goto(destinationURL('/intel/macro/history?boundary=month_end'));
  await loadedDestination(page, response, '/macro/history?boundary=month_end');
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page).toHaveURL(destinationURL('/macro/review'));
  await expect(page.getByRole('heading', { name: 'Monthly review', exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '2026-10', exact: true }) });
  await expect(row.getByRole('link', { name: 'Generated', exact: true })).toBeVisible();
  await expect(row.getByRole('link', { name: 'Insufficient data', exact: true })).toBeVisible();
  expect(apiQueries(macroRegistry, '/api/macro/strategy/reviews').sort()).toEqual(['?region=CN', '?region=US']);
  await row.getByRole('link', { name: 'Generated', exact: true }).click();
  await expect(page).toHaveURL(destinationURL('/macro/review/US/2026-10'));
  await expect(page.getByRole('heading', { name: 'US · 2026-10', exact: true })).toBeVisible();
  for (const name of ['New releases', 'Revisions', 'Late and missing', 'Policy events', 'Policy episode changes', 'Monthly asset moves', 'Catalog coverage (counts)']) {
    await expect(page.getByRole('heading', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')} \\d+$`) })).toBeVisible();
  }
  await expect(page.getByText(fixtures.valid.reviewDetail.result.manifest_id, { exact: false })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'U.S. CPI, year over year' }).first()).toContainText(
    'U.S. CPI, year over year released 2026-09-30 at 2.5% (baseline latest 2026-08-31: 2.4%).',
  );
  await expect(page.getByText('Snapshot catalog counts: verified 1, missing 0, restricted 0.', { exact: true })).toBeVisible();
  await capture(page, 'review-facts');
  expect(apiQueries(macroRegistry, '/api/macro/strategy/reviews/US/2026-10')).toEqual(['']);
  // Follow a real ReviewView fact link into the actual indicator renderer.
  await page.locator('a[href="/intel/macro/US_CPI_YOY"]').first().click();
  await expect(page).toHaveURL(destinationURL('/macro/US_CPI_YOY'));
  await expect(page.getByRole('heading', { name: 'U.S. CPI, year over year', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View evidence and revisions', exact: true })).toBeVisible();
});

// Negative control: invalid routes must not receive the successful generic shell.
// These deliberate 404s never substitute for any positive destination assertion.
test('real page validation rejects an unknown series and malformed review month', async ({ page }) => {
  for (const path of ['/macro/NOT_A_CATALOG_SERIES', '/macro/review/US/2026-13']) {
    const response = await page.goto(destinationURL(path));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'U.S. CPI, year over year', exact: true })).toHaveCount(0);
  }
});
