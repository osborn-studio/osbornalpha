// src/app/api/admin/dq/claims/[id]/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminForbidden, AdminUnauthenticated } from '@/lib/admin/auth';
import { memoryTableClient } from '@/lib/db/memory-table-client';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn(), rpc: vi.fn(), insert: vi.fn(), from: vi.fn(), client: null as unknown }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
vi.mock('@/lib/db/table-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/db/table-client')>(), supabaseTableClient: () => mocks.client }));

import { POST } from './route';

const ID = '3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b';
const ADMIN = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ISSUER = '10000000-0000-4000-8000-000000000009';
const URL_ = `https://alpha.example/api/admin/dq/claims/${ID}`;
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }, id = ID) =>
  POST(new Request(URL_, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id));
const EVIDENCE = { source: 'sec_submissions', as_of: '2026-11-05', evidence_sha256: 'f'.repeat(64), locator: 'recent#accessionNumber=0000999001-25-000031' };
const CLAIM = {
  id: ID, issuer_id: ISSUER, id_type: 'ticker', value: '0000999001-25-000031', source: 'sec_submissions', op: 'evidence_only', status: 'pending',
  detail: { schema: 'claim/1', evidence_kind: 'filing_form', target: { issuer_id: ISSUER }, params: { suggested_op: 'close_security' }, evidence: EVIDENCE, sources: [EVIDENCE] },
};
const AMEND = { op: 'close_security', target: { issuer_id: ISSUER, ticker: 'ZZF', valid_from: '2020-01-01' }, params: { valid_to: '2025-09-22', valid_to_method: 'delisting' } };

describe('POST /api/admin/dq/claims/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const client = memoryTableClient({ issuer_identifier_claims: ['id'] });
    await client.insert('issuer_identifier_claims', CLAIM);
    mocks.client = client;
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.getAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.rpc.mockResolvedValue({ data: { op: 'close_security', applied: true, amended: true }, error: null });
  });

  it('accepts with an amend: calls resolve_identifier_claim, audits and answers 200', async () => {
    const res = await post({ status: 'accepted', amend: AMEND }, { 'content-type': 'application/json; charset=utf-8', origin: 'https://alpha.example' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, status: 'accepted', op: 'close_security', applied: true, amended: true });
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_identifier_claim', { p_id: ID, p_status: 'accepted', p_resolved_by: ADMIN, p_amend: AMEND });
    expect(mocks.from).toHaveBeenCalledWith('research_audit_log');
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ user_id: ADMIN, action: 'dq.claim_resolve', object_type: 'dq', object_id: ID,
      detail: { id: ID, status: 'accepted', op: 'close_security', applied: true, amended: true } });
  });

  it('rejects without an amend and passes p_amend null', async () => {
    mocks.rpc.mockResolvedValue({ data: { op: 'evidence_only', applied: false, amended: false }, error: null });
    const res = await post({ status: 'rejected' });
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_identifier_claim', { p_id: ID, p_status: 'rejected', p_resolved_by: ADMIN, p_amend: null });
  });

  it('checks auth first (401/403), then content type (415), then Origin (403), then the id (400)', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));
    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain' })).status).toBe(401);
    mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain' })).status).toBe(403);
    expect((await post({ status: 'accepted' }, { 'content-type': 'text/plain', origin: 'https://evil.example' })).status).toBe(415);
    expect((await POST(new Request(URL_, { method: 'POST', body: '{}' }), ctx())).status).toBe(415);
    expect((await post({ status: 'accepted' }, { 'content-type': 'application/json', origin: 'https://evil.example' }, 'nope')).status).toBe(403);
    const bad = await post({ status: 'accepted' }, { 'content-type': 'application/json' }, 'nope');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_id' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('400 for a bad status, an amend on a rejection, a malformed amend or one that fails validateClaimDetail', async () => {
    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
    expect(await code({ status: 'resolved_accept' })).toEqual([400, 'invalid_status']);
    expect(await code('not json')).toEqual([400, 'invalid_status']);
    expect(await code({ status: 'rejected', amend: AMEND })).toEqual([400, 'amend_not_applicable']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'legacy' } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'evidence_only' } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { op: 'close_security', target: AMEND.target } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, extra: 1 } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, target: { ...AMEND.target, issuer_id: '10000000-0000-4000-8000-0000000000ff' } } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, params: {} } })).toEqual([400, 'invalid_amend']);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('amend is limited to evidence_only claims and to attach/close/backdate ops', async () => {
    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'set_identifier', params: {} } })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: { ...AMEND, op: 'correct_identifier' } })).toEqual([400, 'invalid_amend']);
    const client = memoryTableClient({ issuer_identifier_claims: ['id'] });
    await client.insert('issuer_identifier_claims', { ...CLAIM, op: 'attach_security', detail: { ...CLAIM.detail, params: {} } });
    mocks.client = client;
    const res = await post({ status: 'accepted', amend: AMEND });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ id: ID, error: 'amend_not_applicable' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('an attach_security amend needs a valid params.ticker', async () => {
    const attach = (params: Record<string, unknown>) => ({ op: 'attach_security', target: { issuer_id: ISSUER }, params: { share_class: 'H', valid_from: '2005-06-30', valid_from_method: 'listing_date', source: 'hkex_list_name_match', ...params } });
    const code = async (body: unknown) => { const r = await post(body); return [r.status, (await r.json()).error]; };
    expect(await code({ status: 'accepted', amend: attach({}) })).toEqual([400, 'invalid_amend']);
    expect(await code({ status: 'accepted', amend: attach({ ticker: 'not a ticker!' }) })).toEqual([400, 'invalid_amend']);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await post({ status: 'accepted', amend: attach({ ticker: '00700.HK' }) })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('404 for an unknown claim without calling the function', async () => {
    const res = await post({ status: 'accepted' }, { 'content-type': 'application/json' }, '00000000-0000-4000-8000-00000000dead');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ id: '00000000-0000-4000-8000-00000000dead', error: 'claim_not_found' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('404 when the claim vanishes between the read and the function (claim_not_found)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'claim_not_found' } });
    const res = await post({ status: 'accepted' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ id: ID, error: 'claim_not_found' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('409 for every claim conflict code, without auditing', async () => {
    for (const code of ['already_resolved', 'legacy_claim', 'amend_required', 'value_conflict', 'ownership_conflict', 'already_closed', 'issuer_not_active']) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      const res = await post({ status: 'accepted' });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ id: ID, error: code });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('500 for any other function error and for unexpected exceptions, logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_claim', details: 'params.ticker' } });
    expect((await post({ status: 'accepted' })).status).toBe(500);
    expect(log).toHaveBeenCalledWith('[admin/dq/claims]', 'invalid_claim', 'params.ticker');
    mocks.rpc.mockRejectedValueOnce(new Error('db down'));
    const res = await post({ status: 'accepted' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'claim resolve unavailable' });
    expect(log).toHaveBeenCalledWith('[admin/dq/claims]', 'db down');
    log.mockRestore();
  });

  it('still answers 200 when the audit insert fails, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: { message: 'audit down' } });
    expect((await post({ status: 'accepted', amend: AMEND })).status).toBe(200);
    expect(log).toHaveBeenCalledWith('[admin/dq/claims] audit failed', 'audit down');
    log.mockRestore();
  });
});
