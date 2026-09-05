import { describe, expect, it } from 'vitest';
import {
  evaluateWatchlistRlsObservation,
  watchlistRlsCanaryPassed,
  WATCHLIST_RLS_TABLES,
} from './rls-canary';

describe('Watchlist RLS canary', () => {
  it('requires full two-account evidence for baseline tables', () => {
    expect(evaluateWatchlistRlsObservation({
      table: 'watchlists', required: true,
      accountAOwn: true, accountBOwn: false,
      accountAReadsB: false, accountBReadsA: false,
    })).toMatchObject({ ok: false, coverage: 'account-a-only', detail: 'required_fixture_missing' });
  });

  it('fails any observed cross-tenant read', () => {
    expect(evaluateWatchlistRlsObservation({
      table: 'perspectives', required: true,
      accountAOwn: true, accountBOwn: true,
      accountAReadsB: true, accountBReadsA: false,
    })).toMatchObject({ ok: false, coverage: 'full', detail: 'cross_tenant_read' });
  });

  it('requires two-account fixtures for every private table', () => {
    const missing = evaluateWatchlistRlsObservation({
      table: 'perspectives', required: true,
      accountAOwn: false, accountBOwn: false,
      accountAReadsB: false, accountBReadsA: false,
    });
    expect(missing).toMatchObject({ ok: false, coverage: 'none', detail: 'required_fixture_missing' });
    const results = WATCHLIST_RLS_TABLES.map(({ table, required }) => evaluateWatchlistRlsObservation({
      table, required,
      accountAOwn: true, accountBOwn: true,
      accountAReadsB: false, accountBReadsA: false,
    }));
    expect(watchlistRlsCanaryPassed(results)).toBe(true);
  });
});
