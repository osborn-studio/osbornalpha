// e2e/company.spec.ts
// spec §12.3 items 1–11 (+ the AAPL filing gold list once transcribed). Prerequisite: a LOCAL Supabase stack
// prepared by scripts/company/e2e-seed.ts and a Next dev server pointed at it (docs/runbooks/company-research.md
// §6). Opt-in: E2E_COMPANY=1 with E2E_EMAIL / E2E_PASSWORD. Decision I default: the HTML report (screenshots +
// traces) is attached to the PR and the reviewer re-runs it once. Item 6 follows decision J's default: no K-line
// and no quote row on the company page.
import { expect, test, type Page } from '@playwright/test';
import { readyExpectation } from '../src/lib/company/fixtures/manifest';

test.skip(
  process.env.E2E_COMPANY !== '1' || !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  'company e2e needs E2E_COMPANY=1, E2E_EMAIL, E2E_PASSWORD and the seeded local database',
);
test.skip(({ baseURL }) => {
  try { return !['localhost', '127.0.0.1'].includes(new URL(baseURL ?? '').hostname); }
  catch { return true; }
}, 'company e2e mutates data and requires a localhost/127.0.0.1 base URL');
test.describe.configure({ mode: 'serial' });
test.use({ screenshot: 'on', trace: 'on' });

const PERIOD = '2022-09-25:2023-09-30:12M';

async function login(page: Page) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: process.env.E2E_BASE_URL ?? 'http://localhost:3000' }]);
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.locator('input[type="email"]').fill(process.env.E2E_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/today');
}
type GridCell = { kind: string; value?: string; availableDate?: string; disclosureSeq?: number; isRevision?: boolean } | null;
type Grid = { rows: { concept: string; cells: Record<string, GridCell> }[] };
const cellOf = (g: Grid, concept: string, key: string) => g.rows.find((r) => r.concept === concept)?.cells[key] ?? null;

test.beforeEach(async ({ page }) => { await login(page); });

test('1 header: English name, security chip, CIK, data status', async ({ page }) => {
  await page.goto('/stock/AAPL');
  const header = page.getByTestId('company-header');
  await expect(header).toContainText('Apple Inc.');
  await expect(header.getByTestId('security-chip').filter({ hasText: 'AAPL' })).toBeVisible();
  await expect(header).toContainText('320193');
  await expect(header.getByTestId('data-status')).toBeVisible();
});

test('2 statements: revenue row; a cell opens the disclosure drawer by keyboard', async ({ page }) => {
  await page.goto('/stock/AAPL?view=statements');
  const row = page.getByTestId('grid-row-revenue');
  await expect(row).toBeVisible();
  const cell = row.locator('button[data-testid^="cell-revenue-"]').first();
  await cell.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('drawer-available-date').first()).toHaveText(/\d{4}-\d{2}-\d{2}/);
  await expect(drawer.locator('a[href*="sec.gov"]').first()).toBeVisible();
  await expect(drawer.getByTestId('drawer-transform-chain').first()).toBeVisible();
  await expect(drawer.getByTestId('drawer-code-version').first()).toHaveText(/^[0-9a-f]{7,40}$/);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(cell).toBeFocused();
});

test('3 replay asOf=2024-06-30: replay bar, disclosureSeq 1, valuation callout; asOf=2025-06-30 is seq 2', async ({ page }) => {
  const resp = page.waitForResponse((r) => r.url().includes('/api/companies/AAPL/statements') && r.url().includes('statement=IS') && r.url().includes('asOf=2024-06-30'));
  await page.goto('/stock/AAPL?view=statements&asOf=2024-06-30');
  await expect(page.getByTestId('replay-bar')).toContainText('2024-06-30');
  const response = await resp;
  expect(response.ok()).toBe(true);
  const replay = cellOf(await response.json() as Grid, 'revenue', PERIOD);
  expect(replay).toMatchObject({ kind: 'fact', availableDate: '2023-11-03', disclosureSeq: 1 });
  const gold = readyExpectation('aapl-revenue-fy2023-replay');
  if (gold) expect(replay?.value).toBe((gold.expected as { value: string }).value);
  else test.info().annotations.push({ type: 'pending', description: 'aapl-revenue-fy2023-replay: value not transcribed yet (spec §0 #72)' });
  await page.goto('/stock/AAPL?view=metrics&asOf=2024-06-30');
  const valuation = page.getByTestId('valuation-section');
  await expect(valuation).toBeVisible();
  await expect(valuation.getByText('回放模式下不运行估值模型', { exact: true })).toBeVisible();
  await expect(valuation.getByTestId('dcf-studio')).toHaveCount(0);
  const latest = await page.request.get('/api/companies/AAPL/statements?statement=IS&basis=annual&asOf=2025-06-30');
  expect(latest.ok()).toBe(true);
  expect(cellOf(await latest.json() as Grid, 'revenue', PERIOD)).toMatchObject({ kind: 'fact', disclosureSeq: 2, isRevision: false });
});

test('4 metrics: gross_margin row; formula drawer shows the formula version', async ({ page }) => {
  const resp = page.waitForResponse((r) => r.url().includes('/api/companies/AAPL/metrics'));
  await page.goto('/stock/AAPL?view=metrics');
  const response = await resp;
  expect(response.ok()).toBe(true);
  const body = await response.json() as { formulaVersion?: string; metrics?: { formulaVersion?: string }[] };
  await expect(page.getByTestId('valuation-section')).toBeVisible();
  await expect(page.getByTestId('valuation-section').getByTestId('dcf-studio')).toBeVisible();
  const version = body.formulaVersion ?? body.metrics?.[0]?.formulaVersion;
  expect(version).toBeTruthy();
  const row = page.getByTestId('metric-row-gross_margin');
  await expect(row).toBeVisible();
  await row.locator('button').first().click();
  await expect(page.getByRole('dialog')).toContainText(String(version));
});

test('5 filings: a 10-K with the edgar badge', async ({ page }) => {
  await page.goto('/stock/AAPL?view=filings');
  const tenK = page.getByTestId('filing-row').filter({ hasText: '10-K' }).first();
  await expect(tenK).toBeVisible();
  await expect(tenK).toContainText('edgar');
});

test('6 overview: no K-line and no quote row (decision J default)', async ({ page }) => {
  await page.goto('/stock/AAPL?view=overview');
  await expect(page.getByTestId('company-header')).toBeVisible();
  await expect(page.getByTestId('kline-chart')).toHaveCount(0);
  await expect(page.getByTestId('company-header').getByText('行情行与 K 线暂不显示（行情链路尚无回放契约）', { exact: true })).toBeVisible();
});

test('7 HK issuer: F3 missing-state copy, no proxy numbers', async ({ page }) => {
  await page.goto('/stock/00700.HK?view=statements');
  await expect(page.getByText(/港股披露事实待文档管道/)).toBeVisible();
  await expect(page.getByTestId('grid-row-revenue')).toHaveCount(0);
});

test('8 tracking: track → listed → mark read to zero → remove', async ({ page }) => {
  await page.goto('/stock/AAPL');
  const track = page.getByTestId('track-button');
  await expect(track).toBeEnabled();
  await track.click();
  await expect(page.getByTestId('track-button')).toHaveText(/跟踪.*✓/);
  await page.goto('/watchlist/tracking');
  const item = page.getByTestId('watch-item').filter({ hasText: 'Apple' });
  await expect(item).toBeVisible();
  const filtered = page.waitForResponse((r) => r.url().includes('/api/tracking/inbox?') && r.url().includes('issuerId='));
  await item.locator('button').first().click();                       // filter the inbox to this issuer
  expect((await filtered).ok()).toBe(true);
  await expect(page.getByTestId('inbox-list')).toBeVisible();
  const more = page.getByRole('button', { name: '加载更多' });
  for (let i = 0; i < 50 && await more.isVisible(); i++) {
    const loaded = page.waitForResponse((r) => r.url().includes('/api/tracking/inbox?') && r.url().includes('cursor='));
    await more.click();
    expect((await loaded).ok()).toBe(true);
    await expect(page.getByText('加载中…', { exact: true })).toHaveCount(0);
  }
  await expect(more).toHaveCount(0);
  await page.getByRole('button', { name: '标记本页已读' }).click();
  await expect(item.getByTestId('unread-count')).toHaveText('0');
  await item.getByRole('button', { name: '移除' }).click();
  await item.getByRole('button', { name: /确认移除/ }).click();
  await expect(page.getByTestId('watch-item').filter({ hasText: 'Apple' })).toHaveCount(0);
});

test('9 directory: AAPL listed; market=US keeps it; q=AAP matches', async ({ page }) => {
  await page.goto('/intel/companies');
  const aapl = page.getByTestId('directory-row').filter({ hasText: 'AAPL' });
  await expect(aapl).toBeVisible();
  await page.getByRole('button', { name: '美股' }).click();
  await expect(aapl).toBeVisible();
  const searched = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/companies' && new URL(r.url()).searchParams.get('q') === 'AAP');
  await page.getByTestId('directory-search').fill('AAP');
  expect((await searched).ok()).toBe(true);
  await expect(page.getByTestId('directory-row').filter({ hasText: 'AAPL' })).toBeVisible();
  await expect(page.getByTestId('directory-row').filter({ hasText: 'MSFT' })).toHaveCount(0);
});

test('10 unknown ticker: not found', async ({ page }) => {
  const res = await page.goto('/stock/ZZZZ');
  expect(res?.status()).toBe(404);
});

test('11 language: NEXT_LOCALE=en renders English tabs and drawer labels', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseURL ?? 'http://localhost:3000' }]);
  await page.goto('/stock/AAPL?view=statements');
  await expect(page.getByRole('link', { name: 'Statements', exact: true })).toBeVisible();
  await page.getByTestId('grid-row-revenue').locator('button[data-testid^="cell-revenue-"]').first().click();
  await expect(page.getByRole('dialog')).toContainText(/Available/i);
});

test('gold: AAPL last 10 filing_published events match the transcribed EDGAR index', async ({ page }) => {
  const gold = readyExpectation('aapl-filings-last10');
  test.skip(!gold, 'aapl-filings-last10 not transcribed yet (spec §0 #72, events-gold.md)');
  const res = await page.request.get('/api/companies/AAPL/events?kinds=filing_published&limit=10');
  expect(res.ok()).toBe(true);
  const body = await res.json() as { rows: { occurredOn: string; payload: { formType: string; sourceRef: string } }[] };
  const expected = (gold!.expected as { filings: { accession: string; form: string; filed: string }[] }).filings;
  expect(body.rows.map((r) => ({ accession: r.payload.sourceRef, form: r.payload.formType, filed: r.occurredOn }))).toEqual(expected);
});

test('gold: 6 issuers × 2 periods × 6 concepts statement matrix (spec §14, §0 #72)', async ({ page }) => {
  const gold = readyExpectation('gold-matrix-6x2x6');
  test.skip(!gold, 'gold-matrix-6x2x6 not transcribed yet (spec §0 #72) — the matrix may not be claimed as passed');
  type GoldCell = { query: string; concept: string; periodKey: string; value: string; unit: string; availableDate: string; disclosureSeq: number; isRevision: boolean };
  const cells = (gold!.expected as { cells: GoldCell[] }).cells;
  expect(cells).toHaveLength(72);
  for (const c of cells) {
    const res = await page.request.get(c.query);   // recorded statements URL, e.g. /api/companies/AAPL/statements?statement=IS&basis=annual
    expect(res.ok(), c.query).toBe(true);
    const got = cellOf(await res.json() as Grid, c.concept, c.periodKey);
    expect(got, `${c.query} ${c.concept} ${c.periodKey}`).toMatchObject({ kind: 'fact', value: c.value, unit: c.unit, availableDate: c.availableDate, disclosureSeq: c.disclosureSeq, isRevision: c.isRevision });
  }
});
