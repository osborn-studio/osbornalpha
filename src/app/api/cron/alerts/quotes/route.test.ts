import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), deliver: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getQuoteAlertSupabase: mocks.admin }));
vi.mock('@/lib/observability/service', () => ({ recordAndDeliverCheck: mocks.deliver }));
import { GET } from './route';
const event = () => ({ event_name: 'quote_batch_loaded', metadata: { count: 1, stale: 0 } });
describe('quote window snapshot RPC evidence before delivery', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret'); vi.clearAllMocks();
    mocks.admin.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.deliver.mockResolvedValue({ ok: true }); vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const request = () => new Request('https://example.test/api/cron/alerts/quotes', { headers: { authorization: 'Bearer synthetic-cron-secret' } });
  it('rejects missing secret and unauthorized requests before database work', async () => {
    vi.stubEnv('CRON_SECRET', ''); expect((await GET(request())).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
    for (const header of ['', 'Bearer wrong-synthetic', 'Bearer ']) expect((await GET(new Request('https://example.test', { headers: { authorization: header } }))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('handles1500 samples in a single scalar RPC without per-row server-cap truncation', async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 1500 }, event), error: null });
    expect((await GET(request())).status).toBe(200); expect(mocks.deliver.mock.calls[0][1].metrics.batches).toBe(1500);
    expect(mocks.rpc).toHaveBeenCalledOnce(); const [name, window] = mocks.rpc.mock.calls[0];
    expect(name).toBe('quote_alert_window_samples'); expect(Date.parse(window.p_to) - Date.parse(window.p_from)).toBe(900000);
  });
  it('refuses the10001 sentinel without persistence/delivery', async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 10001 }, event), error: null });
    expect((await GET(request())).status).toBe(500); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each([null, undefined, {}, 'synthetic'])('refuses unavailable/malformed RPC data %s', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null }); expect((await GET(request())).status).toBe(500); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each([null, { event_name: 'unknown', metadata: { count: 1, stale: 0 } }, { event_name: 'quote_batch_loaded', metadata: {} }, { event_name: 'quote_batch_loaded', metadata: { count: '1', stale: 0 } }, { event_name: 'quote_batch_loaded', metadata: { count: Infinity, stale: 0 } }])('refuses malformed projected row %s', async row => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null }); expect((await GET(request())).status).toBe(500); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('accepts exact-cap complete snapshot and preserves failures and normalized-null counts', async () => {
    const rows = Array.from({ length: 10000 }, event); rows[0].event_name = 'quote_batch_failed';
    mocks.rpc.mockResolvedValue({ data: rows, error: null }); expect((await GET(request())).status).toBe(200);
    expect(mocks.deliver.mock.calls[0][1].metrics.batches).toBe(10000); expect(mocks.deliver.mock.calls[0][1].violations).toContainEqual({ code: 'quote_batch_failed', value: 1, threshold: 0 });
    mocks.rpc.mockResolvedValue({ data: [{ event_name: 'quote_batch_loaded', metadata: { count: null, stale: null } }], error: null });
    expect((await GET(request())).status).toBe(200);
  });
  it('distinguishes actual empty snapshot from missing RPC/migration/source error', async () => {
    expect((await GET(request())).status).toBe(200); expect(mocks.deliver.mock.calls[0][1].metrics.batches).toBe(0); mocks.deliver.mockClear();
    mocks.rpc.mockResolvedValue({ data: [], error: { message: 'synthetic-private' } });
    const response = await GET(request()); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'quote alert check unavailable' });
    expect(mocks.deliver).not.toHaveBeenCalled(); expect(console.error).toHaveBeenCalledWith('quote 15-minute alert check failed');
  });
});
