import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), signOut: vi.fn(), getUserById: vi.fn(), generateLink: vi.fn() }));
vi.mock('@/lib/supabase/anon', () => ({
  getAnonSupabase: () => ({ auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => ({ auth: { admin: { getUserById: mocks.getUserById, generateLink: mocks.generateLink } } }),
}));
import { POST } from './route';

const owner = '11111111-2222-4333-8444-555555555555';
const token = 'i'.repeat(40);
const revoke = (auth?: string) => POST(new Request('https://alpha.example/api/integrations/feishu/shared-login/revoke', {
  method: 'POST', headers: auth ? { authorization: auth } : {},
}));

describe('shared login revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED', 'true');
    vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN', token);
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID', owner);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', '{}');
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'sim@example.test' } }, error: null });
    mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash-1' } }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires the connector token', async () => {
    expect((await revoke()).status).toBe(401);
    expect((await revoke('Bearer ' + 'x'.repeat(40))).status).toBe(401);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('signs the simulation account out everywhere', async () => {
    const response = await revoke('Bearer ' + token);
    expect(response.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('reports a failed sign-out', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('down') });
    expect((await revoke('Bearer ' + token)).status).toBe(503);
  });
});
