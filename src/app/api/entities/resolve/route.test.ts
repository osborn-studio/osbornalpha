import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveIssuer: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/anon', () => ({ getAnonSupabase: () => ({ from: mocks.from }) }));
vi.mock('@/lib/entities/resolve', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/entities/resolve')>();
  return { ...original, resolveIssuer: mocks.resolveIssuer };
});

import { GET } from './route';

const get = (qs: string) => GET(new Request(`http://localhost/api/entities/resolve${qs}`));
async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect((await res.json()).error.code).toBe(code);
}

describe('GET /api/entities/resolve', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('400 empty_query with no-store', async () => {
    await expectError(await get(''), 400, 'empty_query');
    await expectError(await get('?ticker='), 400, 'empty_query');
    expect(mocks.resolveIssuer).not.toHaveBeenCalled();
  });

  it('400 invalid_identifier for unsafe characters instead of dropping the param', async () => {
    await expectError(await get('?cik=%21'), 400, 'invalid_identifier:cik');
    await expectError(await get('?ticker=AAPL%20X'), 400, 'invalid_identifier:ticker');
    expect(mocks.resolveIssuer).not.toHaveBeenCalled();
  });

  it('400 duplicate_parameter', async () => {
    await expectError(await get('?ticker=AAPL&ticker=MSFT'), 400, 'duplicate_parameter');
  });

  it('400 ambiguous_query for more than one identifier', async () => {
    await expectError(await get('?ticker=AAPL&cik=320193'), 400, 'ambiguous_query');
    expect(mocks.resolveIssuer).not.toHaveBeenCalled();
  });

  it('400 when includeExpired is anything but 1', async () => {
    await expectError(await get('?ticker=AAPL&includeExpired=2'), 400, 'invalid_parameter');
    await expectError(await get('?ticker=AAPL&includeExpired=1&includeExpired=1'), 400, 'duplicate_parameter');
  });

  it('404 with no-store when the resolver returns null', async () => {
    mocks.resolveIssuer.mockResolvedValue(null);
    await expectError(await get('?ticker=ZZZZ'), 404, 'not_found');
  });

  it('200 with bounded shared caching and passes includeExpired and slash tickers through', async () => {
    mocks.resolveIssuer.mockResolvedValue({ issuer_id: 'a' });
    const res = await get('?ticker=brk%2Fb&includeExpired=1');
    expect(res.status).toBe(200);
    const cc = res.headers.get('Cache-Control') ?? '';
    expect(cc).toContain('s-maxage=');
    expect(cc).toContain('stale-while-revalidate=600');
    expect(await res.json()).toEqual({ issuer_id: 'a' });
    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'brk/b' }, { includeExpired: true, today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uses one clock for today and the cache lifetime', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T23:30:00Z'));
    mocks.resolveIssuer.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-11-05T23:45:00Z'));
      return { issuer_id: 'a' };
    });
    const res = await get('?ticker=AAPL');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=1800, stale-while-revalidate=600');
    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'AAPL' }, { includeExpired: false, today: '2026-11-05' });
  });

  it('responds no-store when the UTC date flips while resolving', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T23:59:59Z'));
    mocks.resolveIssuer.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-11-06T00:00:01Z'));
      return { issuer_id: 'a' };
    });
    const res = await get('?ticker=AAPL');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ issuer_id: 'a' });
    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'AAPL' }, { includeExpired: false, today: '2026-11-05' });
  });

  it('maps resolver validation errors to 400 and anything else to a logged, opaque 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.resolveIssuer.mockRejectedValueOnce(new Error('invalid_identifier:isin'));
    await expectError(await get('?isin=US123'), 400, 'invalid_identifier:isin');
    expect(log).not.toHaveBeenCalled();
    mocks.resolveIssuer.mockRejectedValueOnce(new Error('issuers select: secret detail'));
    const res = await get('?ticker=AAPL');
    await expectError(res.clone(), 500, 'internal');
    expect(JSON.stringify(await res.json())).not.toContain('secret');
    expect(log).toHaveBeenCalledWith('[entities/resolve]', 'issuers select: secret detail');
    mocks.resolveIssuer.mockRejectedValueOnce('not an error');
    await expectError(await get('?ticker=AAPL'), 500, 'internal');
    expect(log).toHaveBeenLastCalledWith('[entities/resolve]', 'not an error');
  });

  it('treats invalid_today from the resolver as a server error, not a client one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.resolveIssuer.mockRejectedValueOnce(new Error('invalid_today'));
    await expectError(await get('?ticker=AAPL'), 500, 'internal');
  });
});
