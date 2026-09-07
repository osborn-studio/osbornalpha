import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync(new URL('../../../scripts/watchlist-runtime-check.ts', import.meta.url), 'utf8');

describe('Watchlist runtime check contract', () => {
  it('requires the exact deployment URL and fails when Vercel protection masks the app', () => {
    expect(script).toContain('resolveWatchlistRuntimeUrl()');
    expect(script).not.toContain('https://stock-monitor-nu.vercel.app');
    expect(script).toContain('deployment_protection_blocked');
  });

  it('covers the user read model and all worker domains', () => {
    for (const path of [
      '/watchlist',
      '/api/watchlist/overview',
      '/api/cron/watchlist-dispatch',
      '/api/cron/watchlist-perspectives',
      '/api/cron/watchlist-metrics',
      '/api/cron/watchlist-research',
      '/api/cron/watchlist-alerts',
    ]) expect(script).toContain(`path: '${path}'`);
  });

  it('validates authenticated user-domain reads and request tracing', () => {
    expect(script).toContain('WATCHLIST_RUNTIME_READ_CONTRACTS');
    expect(script).toContain("headers.get('x-request-id')");
    expect(script).toContain('isWatchlistRuntimeReadPayload(path, body)');
  });

  it('covers whole-Perspective and claim-scoped feedback routes', () => {
    expect(script).toContain("path: '/api/watchlist/perspective-feedback'");
    expect(script).toContain("path: '/api/watchlist/perspective-claim-feedback'");
  });
});
