import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The auth boundary (service role + cookie client) is mocked; Request, URL and redirects are real.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), verifyOtp: vi.fn(), insert: vi.fn(), getUserById: vi.fn(), generateLink: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: { getUser: mocks.getUser, verifyOtp: mocks.verifyOtp },
    from: () => ({ insert: mocks.insert }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => ({ auth: { admin: { getUserById: mocks.getUserById, generateLink: mocks.generateLink } } }),
}));
import { GET } from './route';

const origin = 'https://alpha.example';
const owner = '11111111-2222-4333-8444-555555555555';
const secret = 'k'.repeat(48);
const go = (token: string, next?: string) => {
  const url = new URL(`/auth/go/${token}`, origin);
  if (next !== undefined) url.searchParams.set('next', next);
  return GET(new Request(url), { params: Promise.resolve({ token }) });
};

describe('shared login link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('FEISHU_SHARED_LOGIN_TOKEN', secret);
    vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN', 'i'.repeat(40));
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID', owner);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', '{}');
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.getUserById.mockResolvedValue({ data: { user: { id: owner, email: 'sim@example.test' } }, error: null });
    mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash-1' } }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is off (404) without a configured secret, and never touches auth', async () => {
    vi.stubEnv('FEISHU_SHARED_LOGIN_TOKEN', '');
    const response = await go(secret);
    expect(response.status).toBe(404);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it.each(['wrong'.repeat(10), secret + 'x', secret.slice(1), 'short'])('rejects a wrong token %j with 404', async (token) => {
    const response = await go(token);
    expect(response.status).toBe(404);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it('signs the browser into the bound simulation account and lands on /analyst', async () => {
    const response = await go(secret);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${origin}/analyst`);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.getUserById).toHaveBeenCalledWith(owner);
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'sim@example.test' });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'hash-1' });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: owner, event_name: 'shared_login' }));
  });

  it('keeps an existing session of the same account without minting a new one', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner.toUpperCase() } } });
    const response = await go(secret, '/analyst/report');
    expect(response.headers.get('location')).toBe(`${origin}/analyst/report`);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it('switches a browser signed into another account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
    await go(secret);
    expect(mocks.verifyOtp).toHaveBeenCalled();
  });

  it.each([['//evil.example', '/macro'], ['/api/private', '/macro'], ['/analyst/report/files/2026-11-27.xlsx', '/analyst/report/files/2026-11-27.xlsx']])(
    'only follows local application paths: next=%j', async (next, expected) => {
      const response = await go(secret, next);
      expect(response.headers.get('location')).toBe(`${origin}${expected}`);
    });

  it('sends the visitor to the login error page when the session cannot be minted', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    const response = await go(secret);
    expect(response.headers.get('location')).toBe(`${origin}/login?error=auth_failed`);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
