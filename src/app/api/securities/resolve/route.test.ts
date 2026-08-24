import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: authGetUser } })),
}));
const adminClient = {};
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: vi.fn(() => adminClient) }));
vi.mock('@/lib/securities/discovery', () => ({
  consumeResolveQuota: vi.fn(async () => true),
  findExistingSecurity: vi.fn(async () => null),
  resolveTrustedSecurity: vi.fn(),
  promoteTrustedSecurity: vi.fn(async () => undefined),
  discoverExternalCandidate: vi.fn(async () => null),
  queueDiscoveryCandidate: vi.fn(async () => undefined),
}));

import {
  consumeResolveQuota,
  discoverExternalCandidate,
  findExistingSecurity,
  promoteTrustedSecurity,
  queueDiscoveryCandidate,
  resolveTrustedSecurity,
} from '@/lib/securities/discovery';
import { POST } from './route';

const trusted = {
  ticker: '002463.SZ',
  security: { ticker: '002463.SZ', name: '沪电股份', market: 'A', asset_type: 'stock', pinyin: 'hdgf', exchange: 'SZSE', list_status: 'listed' },
  aliases: [],
  memberships: [],
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://example.com/api/securities/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/securities/resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SECURITY_RATE_LIMIT_SECRET = 'rate-secret';
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    vi.mocked(consumeResolveQuota).mockResolvedValue(true);
    vi.mocked(findExistingSecurity).mockResolvedValue(null);
    vi.mocked(resolveTrustedSecurity).mockResolvedValue(trusted as never);
  });
  afterEach(() => vi.useRealTimers());

  it('requires authentication before provider work', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(request({ query: '002463' }));
    expect(response.status).toBe(401);
    expect(resolveTrustedSecurity).not.toHaveBeenCalled();
  });

  it('rejects names and malformed codes', async () => {
    expect((await POST(request({ query: '沪电股份' }))).status).toBe(400);
    expect((await POST(request({ query: '' }))).status).toBe(400);
  });

  it('rate-limits both user and IP before resolving', async () => {
    vi.mocked(consumeResolveQuota).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const response = await POST(request({ query: '002463' }, { 'x-forwarded-for': '203.0.113.10' }));
    expect(response.status).toBe(429);
    expect(consumeResolveQuota).toHaveBeenCalledTimes(2);
    expect(resolveTrustedSecurity).not.toHaveBeenCalled();
  });

  it('promotes a trusted exact result once and reuses the master identity', async () => {
    const existing = { t: '002463.SZ', n: '沪电股份', py: 'hdgf', m: 'A', asset_type: 'stock', selectable: true };
    vi.mocked(findExistingSecurity).mockResolvedValueOnce(null).mockResolvedValueOnce(existing as never);
    const first = await POST(request({ query: '002463' }));
    const second = await POST(request({ query: '002463' }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(promoteTrustedSecurity).toHaveBeenCalledTimes(1);
  });

  it('clears the timeout after a successful resolution', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const response = await POST(request({ query: '002463' }));
    expect(response.status).toBe(200);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('queues external-only discovery as non-selectable', async () => {
    vi.mocked(resolveTrustedSecurity).mockResolvedValue(null);
    vi.mocked(discoverExternalCandidate).mockResolvedValue({
      ticker: '002463.SZ', name: '沪电股份', pinyin: 'HDGF', market: 'A', asset_type: 'stock',
      source: 'eastmoney', verification_status: 'external-unverified', selectable: false,
    });
    const response = await POST(request({ query: '002463' }));
    expect(await response.json()).toMatchObject({ result: { verification_status: 'external-unverified', selectable: false } });
    expect(queueDiscoveryCandidate).toHaveBeenCalledTimes(1);
  });

  it('returns a stable timeout without provider details', async () => {
    vi.useFakeTimers();
    vi.mocked(resolveTrustedSecurity).mockImplementation(() => new Promise(() => {}));
    const pending = POST(request({ query: '002463' }));
    await vi.advanceTimersByTimeAsync(6100);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'security_resolve_timeout' });
  });
});
