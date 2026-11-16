import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';
import type {Market} from '@/lib/facts/types';

const mocks = vi.hoisted(() => ({deps: null as unknown as KitDeps, requireAdmin: vi.fn()}));
vi.mock('@/lib/company/deps', () => ({productionReadDeps: () => mocks.deps}));
vi.mock('@/lib/admin/auth', () => {
  class AdminUnauthenticated extends Error {}
  class AdminForbidden extends Error {}
  return {AdminUnauthenticated, AdminForbidden, requireAdminUser: mocks.requireAdmin};
});

import {GET} from '@/app/api/companies/[ticker]/overview/route';
import {GET as ADMIN_GET} from '@/app/api/admin/companies/[ticker]/overview/route';
import {buildGated, gateFilingOf} from '@/lib/company/route';
import {
  CN, OLD, US, FIL_CN_PENDING, cnSummary, emptySnapshot, eventRow, filingRow,
  makeDeps, realFact, realRecord, seededTables, summary,
} from '@/lib/company/route-test-kit';

describe('independent release audit: real HTTP evidence withholding', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.deps = makeDeps(await seededTables());
    mocks.requireAdmin.mockResolvedValue({id: 'audit-admin'});
  });

  for (const market of ['US', 'CN'] as const) {
    for (const admin of [false, true]) {
      it(`${market} ${admin ? 'admin' : 'public'}: another run cannot publish a fact or event value`, async () => {
        const cn = market === 'CN';
        const ticker = cn ? '600519.SH' : 'AAPL';
        const issuer = cn ? CN : US;
        const concept = cn ? 'revenue_operating' : 'revenue';
        const secretValue = '918273645.12345';
        const fact = realFact({
          issuer_id: issuer, market, concept, unit: cn ? 'CNY' : 'USD',
          filing_id: cn ? FIL_CN_PENDING : summary().filingId,
          value: secretValue, value_text: secretValue,
        });
        const doc = 'https://static.cninfo.com.cn/audit.PDF';
        const filing = cn ? cnSummary({citation: 'linked', documentUrl: doc}) : summary();
        vi.mocked(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows: [fact], filings: [filing]}));
        vi.mocked(mocks.deps.pdf.locate).mockResolvedValue(new Map([[fact.fact_id, {
          page: 1, table: null, row: 'Revenue', column: 'Current', documentUrl: doc,
        }]]));
        vi.mocked(mocks.deps.company.eventsOfIssuer).mockResolvedValue({rows: [eventRow({
          issuer_id: issuer, market, filing_id: fact.filing_id,
          payload: {headline: {[concept]: {factId: fact.fact_id, value: secretValue, unit: fact.unit}}},
        })], nextCursor: null});
        let runId = fact.run_id;
        vi.mocked(mocks.deps.company.evidenceOf).mockImplementation(async () => new Map([
          [fact.fact_id, {...realRecord(fact), run_id: runId}],
        ]));
        const handler = admin ? ADMIN_GET : GET;
        const call = () => handler(new Request(`https://audit.example/api/companies/${ticker}/overview`), {
          params: Promise.resolve({ticker}),
        });

        // Establish that the response would publish the value with matching provenance.
        const control = await call();
        expect(control.status).toBe(200);
        const good = await control.json();
        expect(good.latest.facts[concept]).toMatchObject({kind: 'fact', value: secretValue});
        expect(good.recentEvents[0].payload.headline[concept].value).toBe(secretValue);
        expect(good.evidence[fact.fact_id].run.runId).toBe(fact.run_id);

        for (runId of ['another-run', ' \t ']) {
          const response = await call();
          expect(response.status).toBe(200);
          if (admin) expect(response.headers.get('cache-control')).toBe('private, no-store');
          const text = await response.text();
          const body = JSON.parse(text);
          const withheld = {kind: 'withheld', reason: 'evidence_incomplete', factId: fact.fact_id};
          expect(body.latest.facts[concept]).toEqual(withheld);
          expect(body.recentEvents[0].payload.headline[concept].value).toEqual(withheld);
          expect(body.evidence).toEqual({});
          expect(text).not.toContain(secretValue);
        }
        if (!admin) expect(mocks.requireAdmin).not.toHaveBeenCalled();
      });
    }
  }

  it.each(['US', 'CN'] as const)('%s: admin cannot waive a filing owned by another lineage member', async (market: Market) => {
    const issuer = market === 'CN' ? CN : US;
    const fact = realFact({issuer_id: OLD, market, unit: market === 'CN' ? 'CNY' : 'USD'});
    vi.mocked(mocks.deps.company.evidenceOf).mockResolvedValue(new Map([[fact.fact_id, realRecord(fact)]]));
    const ctx = {
      deps: mocks.deps, admin: true, lineage: new Set([issuer, OLD]),
      issuer: {issuerId: issuer, ticker: market === 'CN' ? '600519.SH' : 'AAPL', market,
        tickerAsOf: '2024-06-30', validFromMethod: 'curated'},
    };
    const owned = filingRow({filing_id: fact.filing_id, issuer_id: OLD, market});
    const control = await buildGated(ctx, [fact.fact_id], [fact], [gateFilingOf(owned)]);
    expect(control.reasonOf(fact.fact_id)).toBeNull();
    const wrongOwner = await buildGated(ctx, [fact.fact_id], [fact], [gateFilingOf({...owned, issuer_id: issuer})]);
    expect(wrongOwner.reasonOf(fact.fact_id)).toBe('evidence_incomplete');
    expect(wrongOwner.evidence).toEqual({});
  });
});
