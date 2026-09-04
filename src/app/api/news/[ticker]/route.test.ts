import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getStockNews: vi.fn(), authorize: vi.fn() }));
vi.mock('@/lib/stocks/external-research', () => ({ getStockNews: mocks.getStockNews }));
vi.mock('@/lib/auth/external-evidence-auth', () => ({ authorizeExternalEvidenceRequest: mocks.authorize }));

import { GET } from './route';

describe('GET /api/news/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ ok: true });
  });

  it('normalizes the ticker and delegates to the evidence service', async () => {
    mocks.getStockNews.mockResolvedValue({ ticker: 'AAPL', items: [], meta: { status: 'complete' } });
    const response = await GET(new Request('http://localhost/api/news/aapl?days=7'), {
      params: Promise.resolve({ ticker: 'aapl' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getStockNews).toHaveBeenCalledWith('AAPL', 7);
  });

  it('rejects malformed encoded tickers before calling providers', async () => {
    const response = await GET(new Request('http://localhost/api/news/bad'), {
      params: Promise.resolve({ ticker: '%E0%A4%A' }),
    });
    expect(response.status).toBe(400);
    expect(mocks.getStockNews).not.toHaveBeenCalled();
  });

  it('returns a stable error without leaking provider details', async () => {
    mocks.getStockNews.mockRejectedValue(new Error('secret upstream body'));
    const response = await GET(new Request('http://localhost/api/news/AAPL'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'news_unavailable', ticker: 'AAPL', items: [] });
  });

  it('fails closed before provider access when no session exists', async () => {
    mocks.authorize.mockResolvedValue({ ok: false, status: 401, error: 'not_authenticated' });
    const response = await GET(new Request('http://localhost/api/news/AAPL'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    expect(response.status).toBe(401);
    expect(mocks.getStockNews).not.toHaveBeenCalled();
  });
});
