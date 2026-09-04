import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getStockReports: vi.fn(), authorize: vi.fn() }));
vi.mock('@/lib/stocks/external-research', () => ({ getStockReports: mocks.getStockReports }));
vi.mock('@/lib/auth/external-evidence-auth', () => ({ authorizeExternalEvidenceRequest: mocks.authorize }));

import { GET } from './route';

describe('GET /api/reports/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ ok: true });
  });

  it('returns normalized report results', async () => {
    mocks.getStockReports.mockResolvedValue({ ticker: '600519.SH', items: [{ id: 'r1' }], consensus: null, meta: { status: 'complete' } });
    const response = await GET(new Request('http://localhost/api/reports/600519.sh'), {
      params: Promise.resolve({ ticker: '600519.sh' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getStockReports).toHaveBeenCalledWith('600519.SH');
  });

  it('rejects path-shaped ticker input', async () => {
    const response = await GET(new Request('http://localhost/api/reports/bad'), {
      params: Promise.resolve({ ticker: '..%2Fadmin' }),
    });
    expect(response.status).toBe(400);
    expect(mocks.getStockReports).not.toHaveBeenCalled();
  });
});
