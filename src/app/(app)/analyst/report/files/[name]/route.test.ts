import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({ storage: { from: mocks.from } }) }));
import { GET } from './route';

const owner = '11111111-2222-4333-8444-555555555555';
const get = (name: string) => GET(new Request(`https://alpha.example/analyst/report/files/${name}`), { params: Promise.resolve({ name }) });

describe('report download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN', 'i'.repeat(40));
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID', owner);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', '{}');
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner } } });
    mocks.from.mockReturnValue({ download: mocks.download });
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]), error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('streams the stored workbook to the simulation account', async () => {
    const response = await get('2026-11-27.xlsx');
    expect(response.status).toBe(200);
    expect(mocks.download).toHaveBeenCalledWith(`${owner}/2026-11-27.xlsx`);
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''%E9%A3%9E%E4%B9%A6");
    expect(new Uint8Array(await response.arrayBuffer())[0]).toBe(0x50);
  });

  it('hides workbooks from other accounts and anonymous visitors', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
    expect((await get('2026-11-27.xlsx')).status).toBe(404);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await get('2026-11-27.xlsx')).status).toBe(401);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects names outside the report pattern', async () => {
    expect((await get('..%2Fother.xlsx')).status).toBe(404);
  });
});
