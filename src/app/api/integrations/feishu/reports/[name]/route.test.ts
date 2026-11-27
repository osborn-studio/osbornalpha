import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({ storage: { from: mocks.from } }) }));
import { PUT } from './route';

const owner = '11111111-2222-4333-8444-555555555555';
const token = 'i'.repeat(40);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const put = (name: string, body: Uint8Array = zip, headers: Record<string, string> = {}) =>
  PUT(new Request(`https://alpha.example/api/integrations/feishu/reports/${name}`, {
    method: 'PUT', body: body as unknown as BodyInit, headers: { authorization: 'Bearer ' + token, 'content-type': XLSX, ...headers },
  }), { params: Promise.resolve({ name }) });

describe('report upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED', 'true');
    vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN', token);
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID', owner);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', '{}');
    mocks.from.mockReturnValue({ upload: mocks.upload });
    mocks.upload.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('stores a workbook under the owner prefix and returns its download path', async () => {
    const response = await put('2026-11-27-1630.xlsx');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: '2026-11-27-1630.xlsx', path: '/analyst/report/files/2026-11-27-1630.xlsx' });
    expect(mocks.from).toHaveBeenCalledWith('feishu-reports');
    expect(mocks.upload).toHaveBeenCalledWith(`${owner}/2026-11-27-1630.xlsx`, zip, { contentType: XLSX, upsert: true });
  });

  it.each(['../x.xlsx', '2026-11-27.xls', 'report.xlsx', '2026-13-45.xlsx'])('rejects the name %j', async (name) => {
    expect((await put(name)).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects other tokens, types and non-zip bodies', async () => {
    expect((await put('2026-11-27.xlsx', zip, { authorization: 'Bearer ' + 'x'.repeat(40) })).status).toBe(401);
    expect((await put('2026-11-27.xlsx', zip, { 'content-type': 'text/html' })).status).toBe(415);
    expect((await put('2026-11-27.xlsx', new TextEncoder().encode('<html>'))).status).toBe(415);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
