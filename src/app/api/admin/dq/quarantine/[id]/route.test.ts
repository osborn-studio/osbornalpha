import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryTableClient } from '@/lib/db/memory-table-client';
import { FactsDbError } from '@/lib/facts/types';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn(), resolve: vi.fn(), resolveFacts: vi.fn(), markAudited: vi.fn(), insert: vi.fn(), from: vi.fn(), client: null as unknown }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
vi.mock('@/lib/db/table-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/db/table-client')>(), supabaseTableClient: () => mocks.client }));
vi.mock('@/lib/dq/quarantine', () => ({ resolveQuarantine: mocks.resolve }));
vi.mock('@/lib/dq/facts-resolver', () => ({ resolveFactsItem: mocks.resolveFacts, markAudited: mocks.markAudited }));
vi.mock('@/lib/facts/db', () => ({ supabaseFactsDb: () => ({ facts: 'db' }) }));

import { POST } from './route';

const ID = '3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b';
const ADMIN = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const FACT_A = '20000000-0000-4000-8000-00000000000a', FACT_B = '20000000-0000-4000-8000-00000000000b';
const URL_ = `https://alpha.example/api/admin/dq/quarantine/${ID}`;
const ctx = { params: Promise.resolve({ id: ID }) };
const post = (headers: Record<string, string>, body = JSON.stringify({ status: 'resolved_accept' })) =>
  POST(new Request(URL_, { method: 'POST', headers, body }), ctx);
const json = (body: Record<string, unknown>) => post({ 'content-type': 'application/json' }, JSON.stringify(body));
const HOOK = { stage: 'done', state: 'done', at: '2026-11-04T09:00:00.000Z' };

describe('POST /api/admin/dq/quarantine/[id]', () => {
  let client: ReturnType<typeof memoryTableClient>;
  beforeEach(async () => {
    vi.clearAllMocks();
    client = memoryTableClient({ dq_quarantine: ['id'] });
    mocks.client = client;
    await client.insert('dq_quarantine', { id: ID, dataset: 'macro', table_name: 't', natural_key: 'k', reason_code: 'range', status: 'open', payload: {}, detail: {} });
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.getAdmin.mockReturnValue({ from: mocks.from });
    mocks.resolve.mockResolvedValue('resolved');
    mocks.markAudited.mockResolvedValue(undefined);
    mocks.resolveFacts.mockResolvedValue({ outcome: 'resolved', hook: HOOK, promoted: 1, skipped: 0, chosenFactIds: [FACT_A] });
  });
  const facts = () => client.update('dq_quarantine', { id: ID }, { dataset: 'facts.us', table_name: 'financial_facts', reason_code: 'same_day_conflict', payload: { key: { issuer_id: 'i', market: 'US' }, fact_ids: [FACT_A, FACT_B] } });

  it('resolves a same-origin JSON request', async () => {
    const res = await post({ 'content-type': 'application/json; charset=utf-8', origin: 'https://alpha.example' });
    expect(res.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), ID, { status: 'resolved_accept', resolvedBy: 'admin-1' });
    expect(mocks.resolveFacts).not.toHaveBeenCalled();
  });

  it('writes a research_audit_log row for a resolved item', async () => {
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    await post({ 'content-type': 'application/json' }, JSON.stringify({ status: 'resolved_reject' }));
    expect(mocks.from).toHaveBeenCalledWith('research_audit_log');
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: ADMIN, actor: 'user', action: 'dq.quarantine_resolve', object_type: 'dq', object_id: ID,
      detail: { id: ID, status: 'resolved_reject', outcome: 'resolved' },
    });
  });

  it('does not audit when nothing was resolved', async () => {
    mocks.resolve.mockResolvedValue('already_resolved');
    await post({ 'content-type': 'application/json' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('still answers 200 when the audit insert fails, and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: { message: 'audit down' } });
    const res = await post({ 'content-type': 'application/json' });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('[admin/dq] audit failed', 'audit down');
    spy.mockRestore();
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

  it('maps already_resolved to 409 and an unknown id to 404 without calling a resolver', async () => {
    mocks.resolve.mockResolvedValue('already_resolved');
    expect((await post({ 'content-type': 'application/json' })).status).toBe(409);
    await client.update('dq_quarantine', { id: ID }, { id: '00000000-0000-4000-8000-00000000dead' });
    const res = await post({ 'content-type': 'application/json' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ id: ID, outcome: 'not_found' });
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
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

  it('routes facts.* items through resolveFactsItem with chosen_fact_ids and returns the hook state', async () => {
    await facts();
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    const res = await json({ status: 'resolved_accept', chosen_fact_ids: [FACT_A] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, outcome: 'resolved', hook: HOOK, promoted: 1, skipped: 0, chosen_fact_ids: [FACT_A] });
    expect(mocks.resolveFacts).toHaveBeenCalledWith({ facts: 'db' }, client, expect.objectContaining({ id: ID, dataset: 'facts.us' }), { status: 'resolved_accept', chosenFactIds: [FACT_A], resolvedBy: ADMIN });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ detail: { id: ID, status: 'resolved_accept', outcome: 'resolved', chosen_fact_ids: [FACT_A], hook: HOOK } });
  });

  it('answers 409 run_pending when a member row\'s run is still staged, without auditing', async () => {
    await facts();
    mocks.resolveFacts.mockRejectedValue(new FactsDbError('run_pending'));
    const res = await json({ status: 'resolved_accept' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ id: ID, outcome: 'run_pending' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('answers 200 hook_retried when a failed materialize is re-run, 409 when there is nothing to do', async () => {
    await facts();
    mocks.resolveFacts.mockResolvedValue({ outcome: 'hook_retried', hook: HOOK });
    const first = await json({ status: 'resolved_accept' });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ outcome: 'hook_retried', hook: HOOK });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    mocks.resolveFacts.mockResolvedValue({ outcome: 'already_resolved', hook: HOOK });
    const second = await json({ status: 'resolved_accept' });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ outcome: 'already_resolved', hook: HOOK });
  });

  it('rejects malformed chosen_fact_ids with 400 and an invalid verdict with invalid_choice', async () => {
    await facts();
    for (const bad of ['x', ['nope'], Array.from({ length: 101 }, () => FACT_A), [1]]) {
      const res = await json({ status: 'resolved_accept', chosen_fact_ids: bad });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_chosen_fact_ids' });
    }
    expect(mocks.resolveFacts).not.toHaveBeenCalled();
    mocks.resolveFacts.mockResolvedValue({ outcome: 'invalid_choice' });
    const res = await json({ status: 'resolved_accept', chosen_fact_ids: [FACT_A, FACT_B] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ outcome: 'invalid_choice' });
  });

  it('maps DB-final-authority errors: invalid_chosen to 400, item_not_open to 409 already_resolved', async () => {
    await facts();
    mocks.resolveFacts.mockRejectedValue(new FactsDbError('invalid_chosen'));
    const bad = await json({ status: 'resolved_accept', chosen_fact_ids: [FACT_A] });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ id: ID, outcome: 'invalid_choice' });
    mocks.resolveFacts.mockRejectedValue(new FactsDbError('item_not_open'));
    const gone = await json({ status: 'resolved_accept' });
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual({ id: ID, outcome: 'already_resolved' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('answers 400 when chosen_fact_ids is given for a reject or for a non-conflict reason', async () => {
    await facts();
    expect((await json({ status: 'resolved_reject', chosen_fact_ids: [FACT_A] })).status).toBe(400);
    await client.update('dq_quarantine', { id: ID }, { reason_code: 'identity_bs' });
    const res = await json({ status: 'resolved_accept', chosen_fact_ids: [FACT_A] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'chosen_fact_ids_not_applicable' });
    expect(mocks.resolveFacts).not.toHaveBeenCalled();
  });

  it('retry of an accepted item: audits as resolved when the first request never audited, marks it, and answers 502 when materialize fails again', async () => {
    await facts();
    const failed = { stage: 'materialize', state: 'failed', at: HOOK.at, message: 'stale_computation' };
    mocks.resolveFacts.mockResolvedValue({ outcome: 'hook_retried', hook: failed, auditAs: 'resolved' });
    const res = await json({ status: 'resolved_accept' });
    expect(res.status).toBe(502);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ detail: { outcome: 'resolved', hook: failed } });
    expect(mocks.markAudited).toHaveBeenCalledWith(client, ID);
  });

  it('a recovered resolved audit row uses the original resolver, accept status and committed ids, and names the retrying admin', async () => {
    await facts();
    mocks.requireAdmin.mockResolvedValue({ id: 'retrying-admin' });
    mocks.resolveFacts.mockResolvedValue({
      outcome: 'hook_retried', hook: HOOK, chosenFactIds: [FACT_A, FACT_B], auditAs: 'resolved',
      recovered: { resolvedBy: ADMIN, status: 'resolved_accept', chosenFactIds: [FACT_A, FACT_B], recoveredBy: 'retrying-admin', recoveredAt: HOOK.at },
    });
    expect((await json({ status: 'resolved_accept' })).status).toBe(200);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: ADMIN, detail: { status: 'resolved_accept', outcome: 'resolved', chosen_fact_ids: [FACT_A, FACT_B], recovered_by: 'retrying-admin', recovered_at: HOOK.at },
    });
  });

  it('retry of an already audited item writes no second audit row (null) and a hook_retried one when it finally succeeds', async () => {
    await facts();
    mocks.resolveFacts.mockResolvedValue({ outcome: 'hook_retried', hook: { ...HOOK, state: 'failed' }, auditAs: null });
    expect((await json({ status: 'resolved_accept' })).status).toBe(502);
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.resolveFacts.mockResolvedValue({ outcome: 'hook_retried', hook: HOOK, auditAs: 'hook_retried' });
    expect((await json({ status: 'resolved_accept' })).status).toBe(200);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ detail: { outcome: 'hook_retried' } });
  });

  it('re-throws other FactsDb errors as a 500', async () => {
    await facts();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.resolveFacts.mockRejectedValue(new FactsDbError('lease_lost'));
    expect((await json({ status: 'resolved_accept' })).status).toBe(500);
    spy.mockRestore();
  });
});
