import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { evidenceBodies, fixtures, hashes, ids, rawInputs, resolveFixture, versions } from './fixtures';
import { installMacroFixtures } from './transport';

let browser: Browser;
let server: Server;
let origin: string;
const actualRequests: string[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    actualRequests.push(req.url!);
    if (req.url === '/redirect-external' || req.url === '/redirect-chain-external') {
      res.writeHead(302, { Location: req.url === '/redirect-external' ? 'https://fixture-external.invalid/blocked' : '/redirect-external' });
      res.end(); return;
    }
    if (req.url === '/redirect-api') { res.writeHead(302, { Location: '/api/not-registered' }); res.end(); return; }
    if (req.url === '/legacy-local') { res.writeHead(308, { Location: '/canonical-local?boundary=month_end', 'X-Fixture-Redirect': 'simulated' }); res.end(); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Local transport contract</title>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ headless: true });
}, 20000);
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
});
async function localTest(run: (page: Page, context: BrowserContext) => Promise<void>) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try { const page = await context.newPage(); await run(page, context); }
  finally { await context.close(); }
}
async function fetchJson(page: Page, path: string) {
  return page.evaluate(async path => { const r = await fetch(path); return { status: r.status, body: await r.json() }; }, path);
}

describe('synthetic macro fixture lineage', () => {
  it('keeps displayed old observation and captured inputs distinct from newer versions', () => {
    expect(versions.versions.map(v => v.observation_id)).toEqual([ids.new, ids.old]);
    const old = versions.versions[1];
    expect(fixtures.valid.drawerTarget.observationId).toBe(old.observation_id);
    expect(old.derived_from).toEqual([ids.inputCurrent, ids.inputPrevious]);
    expect(old.inputs).toEqual([rawInputs.current, rawInputs.previous]);
    expect(versions.versions[0].inputs[0]).toEqual(rawInputs.newer);
    expect(rawInputs.current.evidence!.sha256).not.toBe(rawInputs.newer.evidence!.sha256);
    expect(old.available_at).toBe(rawInputs.current.available_at);
  });
  it('archives bytes whose SHA and length agree with the evidence receipt', () => {
    for (const [hash, body] of Object.entries(evidenceBodies)) {
      expect(createHash('sha256').update(body).digest('hex')).toBe(hash);
      expect(fixtures.valid.evidence[hash].evidence.byte_length).toBe(Buffer.byteLength(body));
      expect(fixtures.valid.evidence[hash].evidence.object_path).toBe(`fred_csv/${hash}.csv`);
      expect(body).toContain('SYNTHETIC LOCAL FIXTURE ONLY');
    }
  });
  it('preserves missing input identity and isolates each resolved scenario', () => {
    const missing = resolveFixture('missing-input');
    expect(missing.versions.versions[1].inputs[1]).toEqual({ observation_id: ids.inputPrevious, missing: true });
    expect(missing.versions.versions[1].derived_from).toContain(ids.inputPrevious);
    missing.versions.versions[1].inputs.length = 0;
    expect(resolveFixture('valid').versions.versions[1].inputs).toHaveLength(2);
    expect(resolveFixture('missing-input').versions.versions[1].inputs).toHaveLength(2);
    expect(() => resolveFixture('unknown')).toThrow('Unknown macro fixture');
  });
});

describe('local-only API registry in real headless Chromium', () => {
  it('records exact versions requests and returns the captured lineage', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    await page.goto(origin);
    const path = '/api/macro/series/US_CPI_YOY/versions?period_end=2026-09-30';
    const result = await fetchJson(page, path);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(versions);
    expect(registry.hits.filter(h => h.path.startsWith('/api/'))).toMatchObject([{ path, method: 'GET', registered: true, status: 200 }]);
    registry.assertNoUnexpectedRequests();
    expect(actualRequests).not.toContain(path);
  }));
  it('rejects wrong periods, extra/duplicate query parameters, unknown APIs and wrong methods', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    await page.goto(origin);
    const paths = [
      '/api/macro/series/US_CPI_YOY/versions?period_end=2026-08-31',
      '/api/macro/series/US_CPI_YOY/versions?period_end=2026-09-30&extra=1',
      '/api/macro/series/US_CPI_YOY/versions?period_end=2026-09-30&period_end=2026-09-30',
      '/api/not-registered',
    ];
    for (const path of paths) expect(await page.evaluate(async path => fetch(path).then(() => false, () => true), path)).toBe(true);
    expect(await page.evaluate(async () => fetch('/api/macro/overview', { method: 'POST' }).then(() => false, () => true))).toBe(true);
    expect(registry.rejected).toHaveLength(5);
    expect(() => registry.assertNoUnexpectedRequests()).toThrow('Unregistered API');
    for (const path of paths) expect(actualRequests).not.toContain(path);
  }));
  it('rejects external requests before they reach the network', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    await page.goto(origin);
    // Reserved .invalid origin: no DNS/production service is involved, interception must abort first.
    expect(await page.evaluate(async () => fetch('https://fixture-external.invalid/api/macro/overview').then(() => false, () => true))).toBe(true);
    expect(registry.rejected).toMatchObject([{ reason: 'External request', url: 'https://fixture-external.invalid/api/macro/overview' }]);
  }));
  it('returns faithful metadata and exact CSV bytes in popup pages', () => localTest(async (page, context) => {
    const registry = await installMacroFixtures(page);
    await page.goto(origin);
    await page.setContent(`<a target="_blank" href="/api/macro/evidence/${hashes.current}">Open proof</a>`);
    const newPage = context.waitForEvent('page');
    await page.getByText('Open proof').click();
    const popup = await newPage;
    await popup.waitForLoadState('domcontentloaded');
    const metadata = JSON.parse(await popup.locator('body').innerText());
    expect(metadata.evidence.sha256).toBe(hashes.current);
    expect(metadata.retrievals[0].retrieval_id).toBe(rawInputs.current.retrieval!.retrieval_id);
    expect(metadata.download.expiresIn).toBe(60);
    const response = await popup.goto(new URL(metadata.download.url, popup.url()).href);
    expect(response!.status()).toBe(200);
    expect(await response!.text()).toBe(evidenceBodies[hashes.current]);
    expect(registry.hits.some(h => h.path === `/api/macro/evidence/${hashes.current}`)).toBe(true);
    registry.assertNoUnexpectedRequests();
  }));
  it.each(['missing-input', 'versions-error', 'raw'] as const)('serves the %s scenario without manufacturing a success', scenario => localTest(async page => {
    const registry = await installMacroFixtures(page, scenario);
    await page.goto(origin);
    const target = fixtures[scenario].drawerTarget;
    const result = await fetchJson(page, `/api/macro/series/${target.seriesId}/versions?period_end=${target.periodEnd}`);
    expect(result.status).toBe(fixtures[scenario].versionsStatus);
    if (scenario === 'versions-error') expect(result.body).toMatchObject({ error: { code: 'synthetic_versions_unavailable' } });
    else expect(result.body).toEqual(fixtures[scenario].versions);
    registry.assertNoUnexpectedRequests();
  }));
  it('resolves registered fixture redirect chains and explicitly labels simulated hops', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    registry.register({ path: '/api/fixture/redirect', redirect: '/api/macro/series/US_CPI_YOY/versions?period_end=2026-09-30' });
    await page.goto(origin);
    expect((await fetchJson(page, '/api/fixture/redirect')).body).toEqual(versions);
    expect(registry.hits.filter(h => h.path.startsWith('/api/'))).toMatchObject([
      { path: '/api/fixture/redirect', status: 302 },
      { path: '/api/macro/series/US_CPI_YOY/versions?period_end=2026-09-30', status: 200, redirectedFrom: `${origin}/api/fixture/redirect`, simulatedRedirect: true },
    ]);
    registry.assertNoUnexpectedRequests();
  }));
  it('blocks external and unregistered API redirects from the local server before following them', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    await page.goto(origin);
    for (const path of ['/redirect-external', '/redirect-chain-external', '/redirect-api']) {
      expect(await page.evaluate(async path => fetch(path).then(() => false, () => true), path)).toBe(true);
    }
    expect(registry.rejected.map(r => r.reason)).toEqual(['External server redirect', 'External server redirect', 'API server redirects must be registered fixtures']);
    expect(actualRequests).not.toContain('/api/not-registered');
  }));
  it('preserves query and final URL for verified local-server alias redirects', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    const response = await page.goto(`${origin}/legacy-local`);
    expect(response!.status()).toBe(200);
    expect(page.url()).toBe(`${origin}/canonical-local?boundary=month_end`);
    registry.assertNoUnexpectedRequests();
  }));
  it('rejects unregistered fixture redirect targets and cycles', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    registry.register({ path: '/api/missing-redirect', redirect: '/api/not-registered' });
    registry.register({ path: '/api/cycle-a', redirect: '/api/cycle-b' });
    registry.register({ path: '/api/cycle-b', redirect: '/api/cycle-a' });
    await page.goto(origin);
    for (const path of ['/api/missing-redirect', '/api/cycle-a']) {
      expect(await page.evaluate(async path => fetch(path).then(() => false, () => true), path)).toBe(true);
    }
    expect(registry.rejected.map(r => r.reason)).toEqual(['Unregistered API redirect target', 'Fixture redirect cycle or limit']);
    expect(actualRequests).not.toContain('/api/not-registered');
  }));
  it('refuses external redirect targets and duplicate registrations; disposal restores local server routing', () => localTest(async page => {
    const registry = await installMacroFixtures(page);
    expect(() => registry.register({ path: '/api/redirect', redirect: 'https://fixture-external.invalid/' })).toThrow('loopback');
    expect(() => registry.register({ path: '/api/macro/overview', json: {} })).toThrow('Duplicate');
    expect(() => registry.register({ path: '/api/header-redirect', headers: { location: 'https://fixture-external.invalid/' } })).toThrow('Use redirect');
    expect(() => registry.register({ path: '/api/unsafe-302', status: 302 })).toThrow('requires redirect');
    await registry.dispose();
    await page.goto(`${origin}/api/after-dispose`);
    expect(actualRequests).toContain('/api/after-dispose');
  }));
});
