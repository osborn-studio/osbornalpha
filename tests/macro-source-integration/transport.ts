/** Browser transport fixtures only; never calls a provider or a production API. */
import type { Page, Route, Request } from '@playwright/test';
import { subtract } from '../../src/lib/macro/decimal';
import { evidenceBodies, FIXTURE_ORIGIN, fixtures, hashes, ids, periodEnd, rawInputs, rawVersions, resolveFixture, type MacroScenario } from './fixtures';

export interface FixtureResponse {
  /** Local pathname with an exact query. Query order is ignored, duplicate keys are not. */
  path: string; method?: string; status?: number; headers?: Record<string, string>;
  json?: unknown; body?: string; redirect?: string;
}
export interface RequestHit {
  method: string; url: string; path: string; registered: boolean; status?: number; redirectedFrom?: string; simulatedRedirect?: boolean;
}
export interface RejectedRequest { method: string; url: string; path: string; reason: string }
export interface MacroFixtureRegistry {
  hits: RequestHit[]; rejected: RejectedRequest[];
  register(response: FixtureResponse): void;
  assertNoUnexpectedRequests(): void;
  dispose(): Promise<void>;
}
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
function isLocal(url: URL): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK.has(url.hostname) && !url.username && !url.password;
}
function localUrl(path: string): URL {
  const url = new URL(path, FIXTURE_ORIGIN);
  if (!isLocal(url)) throw new Error(`Fixture response must use a loopback URL: ${path}`);
  return url;
}
function canonicalPath(url: URL): string {
  const query = new URLSearchParams(url.search);
  query.sort();
  return `${url.pathname}${query.size ? `?${query}` : ''}`;
}
const requestKey = (method: string, url: URL): string => `${method.toUpperCase()} ${canonicalPath(url)}`;
function hasOnlyParams(url: URL, allowed: string[]): boolean {
  const keys = [...url.searchParams.keys()];
  return new Set(keys).size === keys.length && keys.every(key => allowed.includes(key));
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function detailResponse(url: URL, scenario: MacroScenario): FixtureResponse | null {
  if (!/^\/api\/macro\/series\/(US_CPI_YOY|US_CPI_INDEX)$/.test(url.pathname)) return null;
  if (!hasOnlyParams(url, ['from', 'to', 'asOf', 'transform'])) return null;
  const { searchParams: q } = url;
  const from = q.get('from'), to = q.get('to'), asOf = q.get('asOf');
  if ((from !== null && !validDate(from)) || (to !== null && !validDate(to)) || (from && to && from > to)) return null;
  if (asOf !== null && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(asOf) || !Number.isFinite(Date.parse(asOf)))) return null;
  const transform = q.get('transform') ?? 'raw';
  if (!['raw', 'yoy', 'diff'].includes(transform)) return null;
  const raw = url.pathname.endsWith('/US_CPI_INDEX') && transform !== 'yoy';
  // Only CPI_INDEX declares a yoy read in the real route; CPI_YOY cannot request yoy again.
  if (url.pathname.endsWith('/US_CPI_YOY') && transform === 'yoy') return null;
  const data = structuredClone(fixtures[raw ? 'raw' : scenario === 'raw' ? 'valid' : scenario].detail);
  data.transform = transform as typeof data.transform;
  const observations = data.observations.filter(row => (!from || row.period_end >= from) && (!to || row.period_end <= to)
    && (!asOf || Date.parse(row.available_at) <= Date.parse(asOf)));
  if (transform === 'diff') {
    data.observations = observations.slice(1).map((row, i) => ({ ...row, observation_id: null, version: null,
      value_text: subtract(row.value_text, observations[i].value_text), retrieval_id: null, evidence_sha256: null,
      locator: null, transform: null, code_version: null,
      computed: { kind: 'diff', version: 'macro-diff/1', inputs: [observations[i].observation_id!, row.observation_id!] } }));
  } else data.observations = observations;
  return { path: canonicalPath(url), json: data };
}

/**
 * Context routing catches the first request of target=_blank proof links as well as page fetches.
 * Consumers must create contexts with serviceWorkers:'block' (Playwright's documented route limitation).
 * Source: installed playwright-core/types/types.d.ts, BrowserContext.route / Page.route documentation.
 */
export async function installMacroFixtures(page: Page, scenario: MacroScenario = 'valid'): Promise<MacroFixtureRegistry> {
  const fixture = resolveFixture(scenario);
  const responses = new Map<string, FixtureResponse>();
  const hits: RequestHit[] = [];
  const rejected: RejectedRequest[] = [];
  function register(response: FixtureResponse): void {
    const url = localUrl(response.path);
    const key = requestKey(response.method ?? 'GET', url);
    if (responses.has(key)) throw new Error(`Duplicate fixture registration: ${key}`);
    if (Object.keys(response.headers ?? {}).some(key => key.toLowerCase() === 'location')) throw new Error('Use redirect instead of a Location header');
    if (response.status !== undefined && response.status >= 300 && response.status < 400 && !response.redirect) throw new Error('A redirect status requires redirect');
    if (response.redirect) {
      localUrl(response.redirect);
      if (response.status !== undefined && ![301, 302, 303, 307, 308].includes(response.status)) throw new Error('Invalid fixture redirect status');
    }
    if (response.redirect && (response.json !== undefined || response.body !== undefined)) throw new Error('A fixture redirect cannot also have a body');
    if (response.json !== undefined && response.body !== undefined) throw new Error('A fixture cannot have both json and body');
    responses.set(key, structuredClone(response));
  }
  const addJson = (path: string, json: unknown, status = 200) => register({ path, json, status });
  const versionsPath = `/api/macro/series/${fixture.drawerTarget.seriesId}/versions?period_end=${periodEnd}`;
  addJson(versionsPath, fixture.versionsStatus === 200 ? fixture.versions : { error: { code: 'synthetic_versions_unavailable', message: 'Synthetic fixture versions unavailable' } }, fixture.versionsStatus);
  // Raw input detail may open the same exact period from a derived scenario.
  if (fixture.drawerTarget.seriesId !== 'US_CPI_INDEX') addJson(`/api/macro/series/US_CPI_INDEX/versions?period_end=${periodEnd}`, rawVersions);
  addJson('/api/macro/series/US_CPI_INDEX/versions?period_end=2025-09-30', { ...rawVersions, period_end: '2025-09-30', versions: [{ ...rawInputs.previous, inputs: [] }] });
  for (const region of ['all', 'US', 'CN']) {
    const regions = region === 'all' ? fixture.overview.regions : { [region]: fixture.overview.regions[region as 'US' | 'CN'] };
    for (const compact of ['', '&compact=1', '&compact=0']) addJson(`/api/macro/overview?region=${region}${compact}`, { ...fixture.overview, regions });
  }
  addJson('/api/macro/overview', fixture.overview);
  for (const region of ['US', 'CN'] as const) {
    addJson(`/api/macro/strategy/transmission?region=${region}`, fixture.transmission[region]);
    addJson(`/api/macro/strategy/reviews?region=${region}`, fixture.reviewIndex[region]);
    addJson(`/api/macro/strategy/reviews/${region}/2026-10`, { ...fixture.reviewDetail,
      result: { ...fixture.reviewDetail.result, region, status: region === 'US' ? 'ok' : 'insufficient', facts: { ...fixture.reviewDetail.result.facts, region } } });
    addJson(`/api/macro/strategy/deviations?region=${region}`, { error: { code: 'judgments_disabled', message: 'Synthetic judgment layer disabled' } }, 404);
  }
  for (const window of [1, 3, 6]) addJson(`/api/macro/strategy/policy-response?window=${window}`, { ...fixture.policyResponse, window });
  for (const boundary of ['event_day', 'first_trading_day', 'month_end']) addJson(`/api/macro/strategy/cycle-table?boundary=${boundary}`, { ...fixture.history, boundary });
  for (const [kind, id] of [['snapshot', ids.snapshotUS], ['snapshot', ids.snapshotCN], ['review', ids.review]]) {
    addJson(`/api/macro/strategy/explanations?subject_kind=${kind}&subject_id=${id}`, { items: [] });
  }
  addJson('/api/usage/today', { usage: { perspectives: { used: 0, limit: 3 } } });
  for (const [hash, metadata] of Object.entries(fixture.evidence)) {
    addJson(`/api/macro/evidence/${hash}`, metadata);
    register({ path: `/__fixture/evidence/${hash}`, body: fixture.evidenceBodies[hash], headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  for (const key of ['current', 'previous', 'newer'] as const) {
    register({ path: `/__fixture/source/${key}.csv`, body: evidenceBodies[hashes[key]], headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  // Known missing evidence is an explicit fixture error, not a fallback for arbitrary hashes/APIs.
  addJson(`/api/macro/evidence/${'0'.repeat(64)}`, { error: { code: 'not_found', message: 'Synthetic evidence body unavailable' } }, 404);
  async function handler(route: Route, request: Request): Promise<void> {
    const url = new URL(request.url());
    const hit: RequestHit = { method: request.method(), url: request.url(), path: `${url.pathname}${url.search}`, registered: false,
      ...(request.redirectedFrom() ? { redirectedFrom: request.redirectedFrom()!.url() } : {}) };
    hits.push(hit);
    async function reject(reason: string) {
      rejected.push({ method: hit.method, url: hit.url, path: hit.path, reason });
      await route.abort('blockedbyclient');
    }
    if (!isLocal(url)) return reject('External request');
    const lookup = (method: string, target: URL) => responses.get(requestKey(method, target)) ?? (method === 'GET' ? detailResponse(target, scenario) : null);
    let response = lookup(hit.method, url);
    if (!response) {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return reject('Unregistered API');
      if (url.pathname.startsWith('/__fixture/evidence/') || url.pathname.startsWith('/__fixture/source/')) return reject('Unregistered evidence');
      // Inspect trusted local server redirects with automatic following disabled. Otherwise
      // Playwright's first-URL-only routing could let a server redirect escape the guard.
      const initial = await route.fetch({ maxRedirects: 0 });
      let localResponse = initial;
      let current = url;
      const visitedLocal = new Set([url.href]);
      while ([301, 302, 303, 307, 308].includes(localResponse.status()) && localResponse.headers().location) {
        const target = new URL(localResponse.headers().location, current);
        if (!isLocal(target)) return reject('External server redirect');
        if (target.pathname === '/api' || target.pathname.startsWith('/api/')) return reject('API server redirects must be registered fixtures');
        if (visitedLocal.has(target.href) || visitedLocal.size >= 20) return reject('Local server redirect cycle or limit');
        visitedLocal.add(target.href);
        localResponse = await route.fetch({ url: target.href, maxRedirects: 0 });
        current = target;
      }
      hit.status = initial.status();
      // Preserve native local alias URL semantics only after the entire deterministic fixture
      // server redirect chain is verified local. Server redirects remain labeled by its headers.
      await route.fulfill({ response: initial });
      return;
    }
    hit.registered = true;
    hit.status = response.status ?? (response.redirect ? 302 : 200);
    // Playwright does not re-route native redirect targets. Resolve registered fixture hops
    // ourselves so neither an unregistered API nor an external target can escape interception.
    // These recorded hops are explicitly simulated; Response.url remains the original URL.
    let currentUrl = url;
    let method = hit.method;
    const visited = new Set([requestKey(method, url)]);
    while (response.redirect) {
      const target = new URL(response.redirect, currentUrl);
      if (!isLocal(target)) return reject('External redirect');
      const status = response.status ?? 302;
      if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) method = 'GET';
      const key = requestKey(method, target);
      if (visited.has(key) || visited.size >= 20) return reject('Fixture redirect cycle or limit');
      visited.add(key);
      const next = lookup(method, target);
      if (!next) return reject('Unregistered API redirect target');
      hits.push({ method, url: target.href, path: `${target.pathname}${target.search}`, registered: true,
        status: next.status ?? (next.redirect ? 302 : 200), redirectedFrom: currentUrl.href, simulatedRedirect: true });
      currentUrl = target;
      response = next;
    }
    const finalStatus = response.status ?? 200;
    const headers = { 'Cache-Control': 'no-store', 'X-Macro-Fixture': 'synthetic-local-only', ...response.headers };
    if (response.json !== undefined) {
      await route.fulfill({ status: finalStatus, headers, json: response.json });
    } else await route.fulfill({ status: finalStatus, headers, body: response.body ?? '' });
  }
  const context = page.context();
  await context.route('**/*', handler);
  return { hits, rejected, register,
    assertNoUnexpectedRequests() {
      if (rejected.length) throw new Error(rejected.map(r => `${r.reason}: ${r.method} ${r.url}`).join('\n'));
    },
    async dispose() { await context.unroute('**/*', handler); },
  };
}
