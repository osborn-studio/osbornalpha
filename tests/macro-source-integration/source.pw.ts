/**
 * Render the production SourceDrawer against synthetic API/evidence fixtures.
 * These tests prove browser wiring and captured lineage, not live upstream data.
 * Run with this directory's Playwright config; it uses headless Chromium only.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Locator, type Page, type Response } from '@playwright/test';
import { fixtures, hashes } from './fixtures';
import { installMacroFixtures } from './transport';
import type { ProvenanceJson } from '../../src/components/macro/view-model';

/** Keep assertions independent of production proofRows/formatting helpers. */
function instant(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function definition(scope: Locator, label: string): Locator {
  return scope.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
}

async function assertProof(scope: Locator, input: ProvenanceJson): Promise<void> {
  expect(input.retrieval, 'proof fixture must carry a retrieval').not.toBeNull();
  expect(input.evidence, 'proof fixture must carry archived evidence').not.toBeNull();
  const retrieval = input.retrieval!;
  const evidence = input.evidence!;
  await expect(definition(scope, 'Fetch URL')).toHaveText(retrieval.fetch_url);
  await expect(definition(scope, 'Host')).toHaveText(retrieval.fetch_host);
  await expect(definition(scope, 'Fetched')).toHaveText(instant(retrieval.fetched_at));
  await expect(definition(scope, 'Available')).toHaveText(instant(input.available_at));
  await expect(definition(scope, 'SHA-256')).toHaveText(evidence.sha256);
  await expect(definition(scope, 'Code version')).toHaveText(input.code_version!);
  await expect(definition(scope, 'Transform')).toHaveText(input.transform ?? 'None (raw value)');
  await expect(definition(scope, 'Adapter')).toHaveText(evidence.adapter === 'fred_csv' ? 'FRED public CSV' : 'AKShare');
  await expect(definition(scope, 'Tool versions')).toHaveText(
    Object.entries(retrieval.tool_versions).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(' · '),
  );
  const locator = input.locator;
  expect(locator, 'proof fixture must carry a locator').not.toBeNull();
  const expectedLocator = locator!.kind === 'csv_row'
    ? `CSV line ${locator!.line} · column ${locator!.column + 1} (both 1-based)`
    : locator!.kind === 'html_cell'
      ? `HTML table ${locator!.table} · row ${locator!.row} · cell ${locator!.cell} (0-based)`
      : `JSON pointer ${locator!.pointer}`;
  await expect(definition(scope, 'Locator')).toHaveText(expectedLocator);
}

async function openSource(page: Page, scenario: string): Promise<Locator> {
  const response = await page.goto(`/fixture/source?case=${scenario}`);
  expect(response?.status(), 'real component harness must load').toBe(200);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Loading evidence…', { exact: true })).toHaveCount(0);
  return dialog;
}

/** Follow the real anchor: href-only assertions would miss failed popup requests. */
async function clickPreview(page: Page, scope: Locator, sha256: string): Promise<{ popup: Page; response: Response }> {
  const link = scope.getByRole('link', { name: sha256, exact: true });
  await expect(link).toHaveCount(1);
  const popupPromise = page.waitForEvent('popup');
  const responsePromise = page.context().waitForEvent('response', {
    predicate: (response) => new URL(response.url()).pathname === `/api/macro/evidence/${sha256}` && response.request().isNavigationRequest(),
  });
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  expect(new URL(popup.url()).pathname).toBe(`/api/macro/evidence/${sha256}`);
  return { popup, response: await responsePromise };
}

type Scenario = keyof typeof fixtures;
type Registry = Awaited<ReturnType<typeof installMacroFixtures>>;
const test = base.extend<{ scenario: Scenario; registry: Registry }>({
  scenario: ['valid', { option: true }],
  registry: async ({ page, scenario }, provide, testInfo) => {
    const registry = await installMacroFixtures(page, scenario);
    const runtimeErrors: string[] = [];
    page.context().on('weberror', (event) => runtimeErrors.push(event.error().message));
    try {
      await provide(registry);
    } finally {
      const evidencePath = testInfo.outputPath('fixture-requests.json');
      await writeFile(evidencePath, JSON.stringify({ scenario, hits: registry.hits, rejected: registry.rejected, runtimeErrors }, null, 2));
      await testInfo.attach('synthetic-fixture-request-evidence', { path: evidencePath, contentType: 'application/json' });
      try {
        registry.assertNoUnexpectedRequests();
        expect(runtimeErrors, 'production component must render without uncaught browser errors').toEqual([]);
      } finally {
        await registry.dispose();
      }
    }
  },
});

function inputCard(dialog: Locator, input: ProvenanceJson): Locator {
  return dialog.getByText(`Input ${input.series_id} · v${input.version}`, { exact: true }).locator('..')
    .filter({ has: dialog.page().getByRole('link', { name: input.evidence!.sha256, exact: true }) });
}

async function assertArchivedContent(page: Page, scope: Locator, input: ProvenanceJson, scenario: Scenario): Promise<void> {
  const sha = input.evidence!.sha256;
  const { popup, response } = await clickPreview(page, scope, sha);
  expect(response.status(), 'evidence metadata navigation must succeed').toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const metadata = await response.json();
  expect(metadata.evidence.sha256).toBe(sha);
  expect(metadata.retrievals).toEqual(expect.arrayContaining([
    expect.objectContaining({ retrieval_id: input.retrieval!.retrieval_id }),
  ]));
  expect(metadata.download.expiresIn).toBe(60);
  await expect(popup.locator('body')).toContainText(sha);
  await expect(popup.locator('body')).toContainText(input.retrieval!.retrieval_id);

  // The production anchor opens metadata; the archived bytes are behind download.url.
  const downloadURL = new URL(metadata.download.url, popup.url());
  expect(downloadURL.origin, 'archive fixture must stay on the harness origin').toBe(new URL(page.url()).origin);
  expect(downloadURL.pathname).toBe(`/__fixture/evidence/${sha}`);
  const rawPage = await page.context().newPage();
  const rawResponse = await rawPage.goto(downloadURL.href);
  expect(rawResponse?.status(), 'archived raw response must load, never 404-pass').toBe(200);
  const expectedBody = fixtures[scenario].evidenceBodies[sha];
  expect(expectedBody, 'each preview must have a known raw payload').toContain('SYNTHETIC LOCAL FIXTURE ONLY');
  const actualBody = await rawResponse!.text();
  expect(actualBody).toBe(expectedBody);
  expect(createHash('sha256').update(actualBody).digest('hex')).toBe(sha);
  await expect(rawPage.locator('body')).toContainText('SYNTHETIC LOCAL FIXTURE ONLY');
  // Confirm meaningful data, not only a fixture marker or success status.
  await expect(rawPage.locator('body')).toContainText(input.value_text);
  await rawPage.close();
  await popup.close();
}

test.describe('captured SourceDrawer lineage (synthetic local fixtures)', () => {
  test('keeps the captured published value and exact input proofs when a newer revision exists', async ({ page, registry }, testInfo) => {
    const fixture = fixtures.valid;
    expect(fixture.drawerTarget.observationId).toBe('11111111-1111-4111-8111-111111111111');
    expect(fixture.versions.versions[0].observation_id).toBe('22222222-2222-4222-8222-222222222222');
    const captured = fixture.versions.versions.find((version) => version.observation_id === fixture.drawerTarget.observationId)!;
    const newer = fixture.versions.versions[0];
    const dialog = await openSource(page, 'valid');
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText('2.5%');
    await expect(definition(dialog, 'Publisher')).toHaveText('Synthetic Bureau of Local Fixtures');
    await expect(definition(dialog, 'Via')).toHaveText('Synthetic fixture archive');
    await expect(definition(dialog, 'Rights')).toHaveText('Public domain');
    await expect(definition(dialog, 'Attribution')).toHaveText('SYNTHETIC LOCAL FIXTURE ONLY');
    await expect(dialog.locator('tr[aria-current="true"]')).toHaveCount(1);
    const displayed = dialog.locator('tr[aria-current="true"]');
    await expect(displayed.getByRole('cell').nth(0)).toHaveText('v1');
    await expect(displayed.getByRole('cell').nth(1)).toHaveText('2.5%');
    await expect(displayed.getByRole('cell').nth(3)).toHaveText('Displayed');
    const later = dialog.getByRole('row').filter({ has: page.getByRole('cell', { name: 'v2', exact: true }) });
    await expect(later.getByRole('cell').nth(1)).toHaveText('2.5% → 2.75%');
    await expect(later.getByRole('cell').nth(3)).toHaveText('Later revision');
    await expect(later).not.toHaveAttribute('aria-current', 'true');
    const derivedProof = dialog.locator('dl').filter({ has: page.locator('dd', { hasText: 'yoy_from_index@1' }) });
    await expect(definition(derivedProof, 'Transform')).toHaveText('yoy_from_index@1');
    await expect(definition(derivedProof, 'Available')).toHaveText(instant(captured.available_at));
    await expect(definition(derivedProof, 'Code version')).toHaveText(captured.code_version!);
    await expect(dialog.getByText('Derived from 2 input observations', { exact: true })).toBeVisible();
    expect(captured.inputs).toHaveLength(2);
    for (const input of captured.inputs) {
      expect('missing' in input).toBe(false);
      if ('missing' in input) throw new Error('valid captured input is missing');
      await assertProof(inputCard(dialog, input), input);
    }
    for (const input of newer.inputs) {
      if (!('missing' in input) && !captured.inputs.some((old) => !('missing' in old) && old.evidence?.sha256 === input.evidence?.sha256)) {
        await expect(dialog.getByRole('link', { name: input.evidence!.sha256, exact: true })).toHaveCount(0);
        await expect(dialog.getByText(input.retrieval!.fetch_url, { exact: true })).toHaveCount(0);
      }
    }
    expect(registry.hits.some((hit) => hit.path.includes('/versions'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('captured-source.png'), fullPage: true });
  });

  test('opens each captured derived input preview and reads its exact archived content', async ({ page, registry }) => {
    const dialog = await openSource(page, 'valid');
    const captured = fixtures.valid.versions.versions.find((version) => version.observation_id === fixtures.valid.drawerTarget.observationId)!;
    for (const input of captured.inputs) {
      if ('missing' in input) throw new Error('valid captured input is missing');
      await assertArchivedContent(page, inputCard(dialog, input), input, 'valid');
    }
    expect(registry.hits.filter((hit) => hit.path.startsWith('/api/macro/evidence/'))).toHaveLength(2);
  });
});

test.describe('missing SourceDrawer input', () => {
  test.use({ scenario: 'missing-input' });
  test('retains the missing input with an explicit error and never substitutes newer evidence', async ({ page, registry }) => {
    const dialog = await openSource(page, 'missing-input');
    const missing = dialog.getByText('Input 44444444-4444-4444-8444-444444444444', { exact: true }).locator('..');
    await expect(missing.getByText('Input observation unreadable', { exact: true })).toBeVisible();
    await expect(missing.getByRole('link')).toHaveCount(0);
    await expect(dialog.getByText('Derived from 2 input observations', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText('2.5%');
    await expect(dialog.getByRole('link', { name: hashes.newer, exact: true })).toHaveCount(0);
    expect(registry.hits.some((hit) => hit.path.includes('/versions'))).toBe(true);
  });
});

test.describe('unavailable archived preview', () => {
  test.use({ scenario: 'missing-input' });
  test('opens the real input proof link and displays an explicit missing-evidence response', async ({ page, registry }) => {
    const sha = hashes.current;
    const path = `/api/macro/evidence/${sha}`;
    const requests: string[] = [];
    // Additional deterministic failure fixture, scoped to this test only. The
    // shared registry continues to own versions and reject unexpected traffic.
    await page.context().route(`**${path}`, async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: { 'x-fixture-only': 'true' },
        body: JSON.stringify({ error: { code: 'not_found', message: 'Synthetic archived evidence unavailable' } }),
      });
    });
    const dialog = await openSource(page, 'missing-input');
    await expect(dialog.getByText('Input observation unreadable', { exact: true })).toBeVisible();
    const { popup, response } = await clickPreview(page, dialog, sha);
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Synthetic archived evidence unavailable' } });
    await expect(popup.locator('body')).toContainText('not_found');
    await expect(popup.locator('body')).toContainText('Synthetic archived evidence unavailable');
    await expect(popup.locator('body')).not.toContainText('download');
    expect(requests).toEqual([new URL(path, page.url()).href]);
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText('2.5%');
    expect(registry.hits.some((hit) => hit.path.includes('/versions'))).toBe(true);
    await popup.close();
  });
});

test.describe('raw SourceDrawer observation', () => {
  test.use({ scenario: 'raw' });
  test('renders raw proof and opens metadata plus actual archived response content', async ({ page, registry }) => {
    const fixture = fixtures.raw;
    const dialog = await openSource(page, 'raw');
    const raw = fixture.versions.versions.find((version) => version.observation_id === fixture.drawerTarget.observationId)!;
    expect(raw.derived_from).toBeNull();
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText(fixture.drawerTarget.display);
    await assertProof(dialog, raw);
    await expect(dialog.getByText(/^Derived from /)).toHaveCount(0);
    await assertArchivedContent(page, dialog, raw, 'raw');
    expect(registry.hits.some((hit) => hit.path === `/api/macro/evidence/${raw.evidence!.sha256}`)).toBe(true);
  });
});

test.describe('failed SourceDrawer versions read', () => {
  test.use({ scenario: 'versions-error' });
  test('shows an explicit evidence error while preserving the published snapshot value', async ({ page, registry }) => {
    const dialog = await openSource(page, 'versions-error');
    await expect(dialog.getByText('Evidence could not be read; page values still come from the published snapshot.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText('2.5%');
    await expect(dialog.getByText(/US_CPI_YOY · 2026-09-30/)).toBeVisible();
    await expect(dialog.getByRole('link')).toHaveCount(0);
    await expect(dialog.getByText('Publisher', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('table')).toHaveCount(0);
    expect(registry.hits.find((hit) => hit.path.includes('/versions'))?.status).toBe(fixtures['versions-error'].versionsStatus);
  });
});
