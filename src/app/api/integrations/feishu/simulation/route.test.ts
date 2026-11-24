import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({ rpc }) }));

const owner = '20a1921c-c0cc-4e7a-8211-ea92b4915f3b';
const analyst = 'c30e4bb6-5b9f-4b56-9abe-702afb336671';
const secret = 'simulation-ingestion-test-bearer-token-01';
const receipt = { recommendationId:'rec', decisionId:'decision', tradeId:'trade', replayed:false };
const suggestion = {
  expectedOwnerId:owner, sourceId:'om_event_one', analystKey:'A', approvedAt:'2026-01-02T10:12:10+08:00',
  recommendation:{ ticker:'700.HK', market:'HK', action:'add', rationale:'Example' },
  execution:{ price:430.20, quantity:5 },
};

function request(body: object = suggestion, token = secret) {
  return new Request('http://localhost/api/integrations/feishu/simulation', {
    method:'POST', headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' },
    body:JSON.stringify(body),
  });
}

describe('Feishu simulation import', () => {
  beforeEach(() => {
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED', 'true');
    vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN', secret);
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID', owner);
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', JSON.stringify({ A:analyst }));
    rpc.mockReset();
    rpc.mockResolvedValue({ data:receipt, error:null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires explicit enablement, authentication and the expected account', async () => {
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED', 'false');
    expect((await POST(request())).status).toBe(404);
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED', 'true');
    expect((await POST(request(suggestion, `${secret}-wrong`))).status).toBe(401);
    expect((await POST(request({ ...suggestion, expectedOwnerId:analyst }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('normalizes the ticker and captures both timestamps from the fixed approval time by default', async () => {
    const result = await POST(request());
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith('ingest_feishu_simulation', {
      p_owner:owner, p_analyst:analyst, p_source_id:suggestion.sourceId, p_payload_hash:expect.stringMatching(/^[0-9a-f]{64}$/),
      p_payload:{
        sourceId:suggestion.sourceId, analystKey:'A', approvedAt:'2026-01-02T02:12:10.000Z',
        recommendation:{ ticker:'00700.HK', market:'HK', action:'add', rationale:'Example', recommended_at:'2026-01-02T02:12:10.000Z' },
        execution:{ price:430.20, quantity:5, fee:0, executed_at:'2026-01-02T02:12:10.000Z' },
      },
    });
  });

  it('sends the same canonical event to the receipt lookup after a mapping is removed', async () => {
    await POST(request());
    const previous = rpc.mock.calls[0][1];
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS', '{}');
    rpc.mockResolvedValue({ data:{ ...receipt, replayed:true }, error:null });
    const result = await POST(request({ ...suggestion, approvedAt:'2026-01-02T02:12:10Z' }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ...receipt, replayed:true });
    expect(rpc.mock.calls[1][1]).toEqual({ ...previous, p_analyst:null });
  });

  it('records any suggestion without a fill and rejects an execution for an observation', async () => {
    const observe = { ...suggestion, recommendation:{ ...suggestion.recommendation, action:'hold' }, execution:undefined };
    rpc.mockResolvedValue({ data:{ ...receipt, decisionId:null, tradeId:null }, error:null });
    expect((await POST(request(observe))).status).toBe(201);
    expect(rpc.mock.calls[0][1].p_payload.execution).toBeNull();
    expect((await POST(request({ ...observe, execution:suggestion.execution }))).status).toBe(400);
    expect((await POST(request({ ...suggestion, execution:undefined }))).status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each(['5d', '10d'])('preserves the Demo horizon %s separately from the formal field', async (horizon) => {
    const response = await POST(request({ ...suggestion, recommendation:{ ...suggestion.recommendation, horizon } }));
    expect(response.status).toBe(201);
    const { p_payload } = rpc.mock.calls[0][1];
    expect(p_payload.requestedHorizon).toBe(horizon);
    expect(p_payload.recommendation.horizon).toBeUndefined();
  });

  it('rejects spoofed trade fields, inconsistent times and missing zones before database access', async () => {
    const invalid = [
      { ...suggestion, execution:{ ...suggestion.execution, currency:'USD' } },
      { ...suggestion, recommendation:{ ...suggestion.recommendation, analyst_id:analyst } },
      { ...suggestion, approvedAt:'2026-01-02T10:12:10' },
      { ...suggestion, approvedAt:'2026-02-30T10:12:10Z' },
      { ...suggestion, execution:{ ...suggestion.execution, executed_at:'2026-01-01T00:00:00Z' } },
    ];
    for (const body of invalid) expect((await POST(request(body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['P0403', 'analyst_unavailable', 403, 'analyst_unavailable'],
    ['P0409', 'payload_conflict', 409, 'payload_conflict'],
    ['P0409', 'oversell', 409, 'position_conflict'],
    ['55P03', 'private diagnostic', 503, 'integration_unavailable'],
  ])('maps database error %s without leaking diagnostics', async (code, message, status, error) => {
    rpc.mockResolvedValue({ data:null, error:{ code, message } });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });
});
