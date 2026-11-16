import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the external auth/database boundary is mocked. Request, URL and
// NextResponse.redirect remain real so URL authority parsing is exercised.
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), getUser: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.getUser },
    from: () => ({ insert: mocks.insert }),
  }),
}));
import { GET } from './route';

const origin = 'https://alpha.example';
function callback(next?: string, extra: Record<string, string> = {}) {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('code', 'test-code');
  if (next !== undefined) url.searchParams.set('next', next);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return GET(new Request(url));
}

describe('auth callback destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchange.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it.each([
    '@evil.example', 'https://evil.example', '//evil.example', '\\evil.example',
    '/\\evil.example', '/%2f%2fevil.example', '/%252f%252fevil.example',
    '%2f%2fevil.example', '/%5cevil.example', '/\nevil.example',
    '/login?next=//evil.example', '/auth/callback', '/api/private',
    '/en//evil.example', '/x/../login', '/reset-password?next=//evil.example',
    '/en/reset-password#token', '/reset-password/', '/%72eset-password',
    '/reset-password#token', '/en/reset-password/', '/en/reset-password?x=1',
  ])('rejects unsafe next=%j in the actual redirect response', async (next) => {
    const response = await callback(next);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${origin}/macro`);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { next: '/macro', channel: 'oauth' },
    }));
  });

  it.each([
    [undefined, '/macro'], ['', '/macro'], ['/portfolio', '/portfolio'],
    ['/research/companies', '/research/companies'], ['/intel/companies', '/intel/companies'],
    ['/en/intel/industries?scheme=sw2021&metric=roe&level=2&duration=TTM&view=table&periods=12',
      '/intel/industries?scheme=sw2021&metric=roe&level=2&duration=TTM&view=table&periods=12'],
    ['/intel/industries?scheme=sic&level=1&next=//evil.example&code=secret&view=bad#token',
      '/intel/industries?scheme=sic&level=1'],
    ['/portfolio?code=secret#access_token=secret', '/portfolio'],
    ['/reset-password', '/reset-password'], ['/en/reset-password', '/en/reset-password'],
  ])('preserves safe destination %j as %s', async (next, path) => {
    const response = await callback(next);
    expect(response.headers.get('location')).toBe(`${origin}${path}`);
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('test-code');
  });

  it.each([undefined, '/portfolio'])('preserves email confirmation attribution with next=%j', async (next) => {
    const path = next ?? '/macro';
    const response = await callback(next, { aid: 'anonymous-id-123456' });
    expect(response.headers.get('location')).toBe(`${origin}${path}`);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      anonymous_id: 'anonymous-id-123456', event_name: 'email_confirmation_succeeded',
      metadata: { next: path, channel: 'email' },
    }));
  });

  it('fails closed when the code exchange fails', async () => {
    mocks.exchange.mockResolvedValue({ error: { message: 'expired code' } });
    const response = await callback('@evil.example');
    expect(response.headers.get('location')).toBe(`${origin}/login?error=auth_failed`);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('fails closed without a code', async () => {
    const response = await GET(new Request(`${origin}/auth/callback?next=@evil.example`));
    expect(response.headers.get('location')).toBe(`${origin}/login?error=auth_failed`);
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
