import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), groups: vi.fn(), alerts: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/server-repository', () => ({ loadWatchlistOverviewRows: mocks.groups }));
vi.mock('@/lib/watchlist/alert-repository', () => ({ listWatchlistAlerts: mocks.alerts }));

import { GET } from './route';

describe('GET /api/watchlist/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.groups.mockResolvedValue([]);
    mocks.alerts.mockResolvedValue({ data: [], error: null });
  });

  it('returns a private downloadable YAML asset', async () => {
    const response = await GET(new Request('http://localhost/api/watchlist/export?format=yaml'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toContain('.yml');
    expect(await response.text()).toContain('format_version: 3');
  });

  it('rejects unknown formats before loading data', async () => {
    const response = await GET(new Request('http://localhost/api/watchlist/export?format=pdf'));
    expect(response.status).toBe(400);
    expect(mocks.groups).not.toHaveBeenCalled();
  });
});
