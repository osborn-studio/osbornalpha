import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { signedIn, load } = vi.hoisted(() => ({ signedIn: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/analyst/store', () => ({ requireUser: signedIn }));
vi.mock('@/lib/analyst/report-store', () => ({ loadAnalystReport: load }));

const owner = '714ecc4c-8f8c-4be1-91f6-7086b634a51d';
const analyst = 'e1bccb26-ee2e-4d62-b1aa-45c6082cdbe3';
const client = {};
const token = 'fixture'.repeat(8);
const request = new Request('https://example.test/api/analyst/report?analyst=other&owner=other', { headers: { Authorization: 'Bearer '+token } });

describe('signed-in group analyst report', () => {
  beforeEach(() => {
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID', owner);
    vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN', token);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', JSON.stringify({ lina: analyst }));
    signedIn.mockResolvedValue({ supabase: client, userId: owner });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

  it('pins the session owner and analyst IDs server-side and prevents caching', async () => {
    const data = { generatedAt: new Date().toISOString(), analysts: [], recommendations: [], trades: [] };
    load.mockResolvedValue(data);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(data);
    const [db, account, ids, signal] = load.mock.calls[0];
    expect([db, account, [...ids], signal]).toEqual([client, owner, [analyst], request.signal]);
  });

  it('rejects unauthenticated requests, other accounts, and incomplete group configuration before reading', async () => {
    signedIn.mockRejectedValueOnce(new Error('not authenticated'));
    expect((await GET(request)).status).toBe(401);
    signedIn.mockResolvedValueOnce({ supabase: client, userId: analyst });
    expect((await GET(request)).status).toBe(403);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', 'invalid');
    expect((await GET(request)).status).toBe(503);
    expect(load).not.toHaveBeenCalled();
  });

  it('distinguishes unavailable data from an actual empty report', async () => {
    load.mockRejectedValue(new Error('private DB message'));
    const response = await GET(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'report_unavailable' });
  });
});
