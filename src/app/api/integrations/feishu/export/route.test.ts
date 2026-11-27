import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({}) }));
vi.mock('@/lib/feishu/formal-export', () => ({ readFormalExport: mocks.read }));
import { GET } from './route';

const owner = '11111111-2222-4333-8444-555555555555';
const analyst = '22222222-3333-4444-8555-666666666666';
const token = 'i'.repeat(40);
const get = (query: string, auth = 'Bearer ' + token) =>
  GET(new Request(`https://alpha.example/api/integrations/feishu/export?${query}`, { headers: { authorization: auth } }));

describe('formal export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED', 'true');
    vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN', token);
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID', owner);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', JSON.stringify({ lina: analyst }));
    mocks.read.mockResolvedValue({ ownerId: owner, analysts: [], recommendations: [], trades: [], positions: [] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reads the bound analysts of the configured owner', async () => {
    const response = await get(`owner=${owner}`);
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({}, { ownerId: owner, analysts: new Map([['lina', analyst]]) });
    expect(await response.json()).toMatchObject({ ownerId: owner, recommendations: [] });
  });

  it('refuses other tokens, owners and extra parameters', async () => {
    expect((await get(`owner=${owner}`, 'Bearer ' + 'x'.repeat(40))).status).toBe(401);
    expect((await get(`owner=${analyst}`)).status).toBe(403);
    expect((await get(`owner=${owner}&analyst=lina`)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('is off unless ingestion is enabled', async () => {
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED', 'false');
    expect((await get(`owner=${owner}`)).status).toBe(404);
  });
});
