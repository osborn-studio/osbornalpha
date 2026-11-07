import {test, expect, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const fixtureRoot = process.env.MACRO_FIXTURE_ROOT ?? '/tmp/osstack/widget-full-fixtures';
const capture = (region: string) => JSON.parse(readFileSync(join(fixtureRoot, `osbornalpha-${region.toLowerCase()}-snapshot.json`), 'utf8'));
async function ready(page: Page, region = 'US') {
  await page.goto(`/macro?region=${region}&locale=en`);
  await expect(page.locator('.investment-clock [data-current]')).toHaveAttribute('data-phase', region === 'US' ? 'overheat' : 'stagflation');
}
async function openEvidence(page: Page) {
  const panel = page.locator('.investment-clock [data-phase="overheat"]');
  await panel.locator('.clock-inspect').focus();
  await page.keyboard.press('Enter');
  const opener = panel.locator('.clock-evidence-links button').first();
  await expect(opener).toBeVisible();
  return opener;
}
test('snapshot-bound drawer chooses the captured observation over a newer revision', async ({page}) => {
  const dto = capture('US');
  const captured = dto.observations.find((o: {series_id: string; period_end: string}) => o.series_id === 'US_CPI_YOY' && o.period_end === '2026-09-30');
  expect(captured).toBeTruthy();
  const snapshots: string[] = [];
  page.on('request', r => {if (r.url().includes('/api/macro/snapshots/')) snapshots.push(r.url());});
  // Deliberately put a newer, conflicting revision first. Only this endpoint is overridden.
  let versionRequests = 0;
  await page.route('**/api/macro/series/US_CPI_YOY/versions?*', route => {
    versionRequests++;
    return route.fulfill({json: {
    series_id: captured.series_id, period_end: captured.period_end,
    versions: [
      {...captured, observation_id: 'audit-newer-revision', version: captured.version + 1, value_text: '99.99', transform: 'audit_newer_transform', inputs: [], retrieval: null, evidence: null},
      {...captured, inputs: [], retrieval: null, evidence: null},
    ],
  }});
  });
  await ready(page);
  const opener = await openEvidence(page);
  await opener.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeFocused();
  await expect(drawer.locator('h2')).toContainText('3.72%');
  await expect(drawer).toContainText('yoy_from_index@1');
  await expect(drawer).not.toContainText('audit_newer_transform');
  await expect(drawer.locator('tr[aria-current="true"]')).toContainText('3.72%');
  await expect(drawer.locator('tr[aria-current="true"]')).not.toContainText('99.99');
  expect(versionRequests).toBe(1);
  expect(snapshots.some(url => url.endsWith(dto.snapshot.snapshot_id))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
});
test('drawer keeps published value and marks proof unavailable on versions failure', async ({page}) => {
  await page.route('**/api/macro/series/*/versions?*', route => route.fulfill({status: 503, json: {error: {code: 'audit_unavailable'}}}));
  await ready(page);
  await (await openEvidence(page)).click();
  await expect(page.getByRole('dialog').locator('h2')).toContainText('3.72%');
  await expect(page.getByRole('dialog')).toContainText('Evidence could not be read');
});
test('region switch removes an open US drawer and binds the CN snapshot', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await ready(page);
  await (await openEvidence(page)).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const china = page.getByRole('group', {name: 'Region'}).getByRole('button', {name: 'China', exact: true});
  await china.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.investment-clock [data-current]')).toHaveAttribute('data-phase', 'stagflation');
  await expect(page).toHaveURL(/region=CN/);
  await expect(page.locator('.investment-clock .clock-limitations')).toContainText('tie');
  await expect(page.getByRole('group', {name: 'Region'}).getByRole('button', {name: 'China', exact: true})).toHaveAttribute('aria-pressed', 'true');
});
test('workbench tabs and strategy/history URLs retain their destinations', async ({page}) => {
  await ready(page);
  const nav = page.getByRole('navigation', {name: 'Workbench sections'});
  for (const [name, tab] of [['Method & sources', 'methodology'], ['Indicators', 'indicators'], ['Overview', 'overview']]) {
    const button = nav.getByRole('button', {name, exact: true});
    await button.focus(); await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
  }
  for (const path of ['transmission', 'history', 'review']) {
    await expect(nav.locator(`a[href="/intel/macro/${path}"]`)).toBeVisible();
  }
});
for (const width of [320, 390]) test(`mobile ${width}: navigation and keyboard expansions fit the viewport`, async ({page}) => {
  await page.setViewportSize({width, height: 900});
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  const inspect = page.locator('.investment-clock .clock-inspect');
  await expect(inspect).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const button = inspect.nth(i);
    await button.focus(); await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  }
  await page.screenshot({path: `/tmp/osstack/macro-integration-audit/mobile-${width}.png`, fullPage: true});
  const overflow = await page.locator('nav').evaluateAll(elements => elements.map(el => ({label: el.getAttribute('aria-label'), width: el.clientWidth, scroll: el.scrollWidth, right: el.getBoundingClientRect().right})));
  await test.info().attach('navigation-geometry', {body: JSON.stringify(overflow, null, 2), contentType: 'application/json'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'document horizontal overflow').toBeLessThanOrEqual(1);
  const nav = page.getByRole('navigation', {name: 'Workbench sections'});
  const bounds = await nav.evaluate(el => ({right: el.getBoundingClientRect().right, scroll: el.scrollWidth, client: el.clientWidth}));
  expect(bounds.right).toBeLessThanOrEqual(width);
  // A contained, horizontally scrollable nav is valid; each control must be keyboard reachable.
  const controls = await nav.locator('button, a').all();
  await controls[0].focus();
  for (const control of controls) {
    await expect(control).toBeFocused();
    await expect.poll(async () => {
      const rect = (await control.boundingBox())!;
      return rect.x >= -1 && rect.x + rect.width <= width + 1;
    }, {message: `Focused navigation control visible: ${await control.textContent()}`}).toBe(true);
    await page.keyboard.press('Tab');
  }
  expect(errors).toEqual([]);
});
test('mismatched snapshot cannot supply clock evidence', async ({page}) => {
  const dto = capture('US');
  let rejectedRequests = 0;
  await page.route('**/api/macro/snapshots/*', route => {
    rejectedRequests++;
    return route.fulfill({json: {...dto, snapshot: {...dto.snapshot, snapshot_id: 'audit-wrong-snapshot'}}});
  });
  await ready(page);
  const panel = page.locator('.investment-clock [data-phase="overheat"]');
  await panel.locator('.clock-inspect').click();
  await expect(panel).toContainText('No bound rule contributions available.');
  await expect(page.locator('.investment-clock')).not.toContainText('Loading snapshot evidence');
  expect(rejectedRequests).toBe(1);
  await expect(page.locator('.investment-clock .clock-evidence-links button')).toHaveCount(0);
  await expect(panel).not.toContainText('3.72%');
});
test('late US snapshot cannot overwrite China after region switching', async ({page}) => {
  const us = capture('US');
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route(`**/api/macro/snapshots/${us.snapshot.snapshot_id}`, async route => {
    await gate; await route.fulfill({json: us});
  });
  await ready(page);
  await page.getByRole('group', {name: 'Region'}).getByRole('button', {name: 'China', exact: true}).click();
  await expect(page.locator('.investment-clock [data-current]')).toHaveAttribute('data-phase', 'stagflation');
  const late = page.waitForResponse(r => r.url().endsWith(us.snapshot.snapshot_id));
  release(); await late;
  await expect(page.locator('.investment-clock .clock-limitations')).toContainText('tie');
  const panel = page.locator('.investment-clock [data-phase="stagflation"]');
  await panel.locator('.clock-inspect').click();
  await expect(panel.locator('.clock-evidence-links button').first()).toBeVisible();
  await panel.locator('.clock-evidence-links button').first().click();
  await expect(page.getByRole('dialog')).toContainText('CN_');
  await expect(page.getByRole('dialog')).not.toContainText('US_CPI');
});
