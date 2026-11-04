import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
vi.mock('@/lib/dq/quarantine', () => ({ resolveQuarantine: mocks.resolve }));

import { POST } from './route';

const ID = '3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b';
const URL_ = `https://alpha.example/api/admin/dq/quarantine/${ID}`;
const ctx = { params: Promise.resolve({ id: ID }) };
const post = (headers: Record<string, string>, body = JSON.stringify({ status: 'resolved_accept' })) =>
  POST(new Request(URL_, { method: 'POST', headers, body }), ctx);

describe('POST /api/admin/dq/quarantine/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
    mocks.getAdmin.mockReturnValue({});
    mocks.resolve.mockResolvedValue('resolved');
  });

  it('resolves a same-origin JSON request', async () => {
    const res = await post({ 'content-type': 'application/json; charset=utf-8', origin: 'https://alpha.example' });
    expect(res.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), ID, { status: 'resolved_accept', resolvedBy: 'admin-1' });
  });

  it('accepts a JSON request without an Origin header', async () => {
    expect((await post({ 'content-type': 'application/json' })).status).toBe(200);
  });

  it('returns 415 for a non-JSON content type', async () => {
    const res = await post({ 'content-type': 'text/plain', origin: 'https://alpha.example' });
    expect(res.status).toBe(415);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('returns 415 when content-type is missing', async () => {
    const res = await POST(new Request(URL_, { method: 'POST', body: new Uint8Array([123, 125]) }), ctx);
    expect(res.status).toBe(415);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('returns 403 for a cross-origin request', async () => {
    const res = await post({ 'content-type': 'application/json', origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('maps already_resolved to 409', async () => {
    mocks.resolve.mockResolvedValue('already_resolved');
    expect((await post({ 'content-type': 'application/json' })).status).toBe(409);
  });

  it('logs the server error and returns a generic 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.resolve.mockRejectedValue(new Error('db down'));
    const res = await post({ 'content-type': 'application/json' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'quarantine resolve unavailable' });
    expect(spy).toHaveBeenCalledWith('[admin/dq]', 'db down');
    spy.mockRestore();
  });
});
