import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WatchlistRequestError,
  watchlistJsonRequest,
  watchlistJsonResult,
  watchlistRequestErrorCode,
} from './api-client';

describe('watchlist JSON client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a successful JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(watchlistJsonRequest<{ ok: boolean }>('/api/test', undefined, 'fallback')).resolves.toEqual({ ok: true });
  });

  it('preserves the stable error contract and trace metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      errorCode: 'external_evidence_required', retryable: true, retryAfterSeconds: 30, requestId: 'request-1', quota: { used: 1 },
    }), { status: 424 })));
    const error = await watchlistJsonRequest('/api/test', undefined, 'fallback').catch((value) => value);
    expect(error).toBeInstanceOf(WatchlistRequestError);
    expect(error).toMatchObject({
      code: 'external_evidence_required', status: 424, retryable: true,
      retryAfterSeconds: 30, requestId: 'request-1', body: { quota: { used: 1 } },
    });
    expect(watchlistRequestErrorCode(error, 'fallback')).toBe('external_evidence_required');
  });

  it('uses the fallback code for an invalid error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 503 })));
    const error = await watchlistJsonRequest('/api/test', undefined, 'unavailable').catch((value) => value);
    expect(error).toMatchObject({ code: 'unavailable', status: 503, retryable: false });
  });

  it('normalizes network failures while preserving request cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network detail'); }));
    await expect(watchlistJsonRequest('/api/test', undefined, 'offline')).rejects.toMatchObject({
      code: 'offline', status: 0, body: null,
    });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); }));
    await expect(watchlistJsonRequest('/api/test', undefined, 'offline')).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('offers a result form for expected conflict branches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'watchlist_conflict', current: { version: 2 },
    }), { status: 409 })));
    await expect(watchlistJsonResult('/api/test', undefined, 'fallback')).resolves.toMatchObject({
      ok: false,
      status: 409,
      body: { code: 'watchlist_conflict', current: { version: 2 } },
      error: { code: 'watchlist_conflict' },
    });
  });
});
