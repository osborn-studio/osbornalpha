import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validate: vi.fn(),
  groups: vi.fn(),
  alerts: vi.fn(),
  apply: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/security-validation', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/watchlist/security-validation')>();
  return { ...original, validateSelectableSecuritiesWithClient: mocks.validate };
});
vi.mock('@/lib/watchlist/server-repository', () => ({
  loadWatchlistOverviewRows: mocks.groups,
  loadVersionedWatchlistSnapshot: mocks.snapshot,
}));
vi.mock('@/lib/watchlist/alert-repository', () => ({ listWatchlistAlerts: mocks.alerts }));
vi.mock('@/lib/watchlist/import-repository', () => ({ importPortableWatchlist: mocks.apply }));

import { POST } from './route';

const content = `
format_version: 3
groups:
  - name: Core
    description: null
    items:
      - ticker: AAPL
        status: watching
        conviction: 8
        confidence: 75
        target_price: 240
        review_at: null
        tags: [core]
        thesis: Services growth
        notes: null
        invalidation_conditions: Margin decline
        decision_version: 3
        alerts: []
`;

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/watchlist/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content,
      format: 'yaml',
      mode: 'merge',
      dryRun: true,
      ...overrides,
    }),
  });
}

describe('POST /api/watchlist/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.validate.mockResolvedValue({ valid: true, canonicalTickers: ['AAPL'], rejected: [] });
    mocks.groups.mockResolvedValue([]);
    mocks.alerts.mockResolvedValue({ data: [], error: null });
    mocks.apply.mockResolvedValue({ data: { version: 2 }, error: null });
    mocks.snapshot.mockResolvedValue({ ownerId: 'user-1', version: 2, groups: [] });
  });

  it('returns a no-write preview after validating every ticker', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      preview: {
        mode: 'merge',
        groups: { incoming: 1, create: 1 },
        items: { incoming: 1, create: 1 },
      },
    });
    expect(mocks.validate).toHaveBeenCalledWith(expect.anything(), ['AAPL']);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it('executes an idempotent replace and returns the canonical snapshot', async () => {
    const response = await POST(request({
      dryRun: false,
      mode: 'replace',
      mutationId: 'portable-import-123',
    }));
    expect(response.status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ formatVersion: 3 }),
      'replace',
      'portable-import-123',
    );
    expect(await response.json()).toMatchObject({
      result: { version: 2 },
      snapshot: { ownerId: 'user-1', version: 2 },
    });
  });

  it('rejects malformed content and non-selectable securities before the RPC', async () => {
    const malformed = await POST(request({ content: 'not: [valid' }));
    expect(malformed.status).toBe(400);
    mocks.validate.mockResolvedValue({ valid: false, canonicalTickers: [], rejected: ['AAPL'] });
    const rejected = await POST(request());
    expect(rejected.status).toBe(422);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
