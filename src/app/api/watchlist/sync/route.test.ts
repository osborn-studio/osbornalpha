import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  auth: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth }, from: mocks.from })),
}));
vi.mock('@/lib/watchlist/security-validation', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/watchlist/security-validation')>();
  return { ...original, validateSelectableSecuritiesWithClient: mocks.validate };
});

import { PUT } from './route';

describe('PUT /api/watchlist/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('rejects the complete snapshot before any destructive query', async () => {
    mocks.validate.mockResolvedValue({ valid: false, canonicalTickers: [], rejected: ['MISSING'] });
    const response = await PUT(new Request('https://example.com/api/watchlist/sync', {
      method: 'PUT',
      body: JSON.stringify({ groups: [{ id: 'one', name: 'One', tickers: ['MISSING'] }] }),
    }));
    expect(response.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
