import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryTableClient } from '@/lib/db/memory-table-client';
import { FactsDbError } from '@/lib/facts/types';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn(), resolve: vi.fn(), resolveFacts: vi.fn(), markAudited: vi.fn(), hashNow: vi.fn(), insert: vi.fn(), from: vi.fn(), client: null as unknown }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
vi.mock('@/lib/db/table-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/db/table-client')>(), supabaseTableClient: () => mocks.client }));
vi.mock('@/lib/dq/quarantine', () => ({ resolveQuarantine: mocks.resolve }));
vi.mock('@/lib/dq/facts-resolver', () => ({ resolveFactsItem: mocks.resolveFacts, markAudited: mocks.markAudited }));
vi.mock('@/lib/dq/reconcile/deps', () => ({ restoreInputsHashNow: () => mocks.hashNow }));
vi.mock('@/lib/facts/db', () => ({ supabaseFactsDb: () => ({ facts: 'db' }) }));

// F4
const f4 = vi.hoisted(() => ({ resolveJudgments: vi.fn(), judgmentsDb: vi.fn(), codeVersion: vi.fn() }));
vi.mock('@/lib/dq/judgments-resolver', () => ({ resolveJudgmentsItem: f4.resolveJudgments }));
vi.mock('@/lib/judgments/deps', () => ({ adminJudgmentsDb: f4.judgmentsDb, resolveCodeVersion: f4.codeVersion }));
// /F4

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
    expect(mocks.resolveFacts).toHaveBeenCalledWith({ facts: 'db' }, client, expect.objectContaining({ id: ID, dataset: 'facts.us' }), { status: 'resolved_accept', chosenFactIds: [FACT_A], resolvedBy: ADMIN, inputsHashNow: mocks.hashNow });
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
  const facts3 = (reason: string) => client.update('dq_quarantine', { id: ID }, { dataset: 'facts.us', table_name: 'financial_facts', reason_code: reason, payload: { fact_ids: [FACT_A] } });
  it('passes chosen_candidate_index (ambiguous_value) and keep_fact_id (lineage_conflict) through, and audits the index and the adopted fact', async () => {
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    await facts3('ambiguous_value');
    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, adoptedFactId: FACT_B, chosenCandidateIndex: 1, chosenFactIds: [FACT_B] });
    const res = await json({ status: 'resolved_accept', chosen_candidate_index: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, outcome: 'resolved', hook: HOOK, promoted: null, skipped: null, chosen_fact_ids: [FACT_B], adopted_fact_id: FACT_B, chosen_candidate_index: 1 });
    expect(mocks.resolveFacts.mock.calls[0][3]).toMatchObject({ status: 'resolved_accept', chosenCandidateIndex: 1, resolvedBy: ADMIN });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ detail: { chosen_candidate_index: 1, adopted_fact_id: FACT_B } });
    await facts3('lineage_conflict');
    await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
    expect(mocks.resolveFacts.mock.calls[1][3]).toMatchObject({ keepFactId: FACT_A });
  });
  it('injects the restore-side inputs hash into resolveFactsItem (plan 3 Task 14c)', async () => {
    await facts3('reconcile_mismatch');
    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, promoted: 1, restore: { promoted: 1, skipped: [] } });
    expect((await json({ status: 'resolved_accept' })).status).toBe(200);
    expect(mocks.resolveFacts.mock.calls.at(-1)?.[3]).toMatchObject({ inputsHashNow: mocks.hashNow });
  });
  it('validates and scopes the new body fields: bad values 400, not applicable 400', async () => {
    await facts3('ambiguous_value');
    for (const v of [-1, 1.5, '1', 1000]) expect((await json({ status: 'resolved_accept', chosen_candidate_index: v })).status).toBe(400);
    expect(await (await json({ status: 'resolved_reject', chosen_candidate_index: 0 })).json()).toEqual({ error: 'chosen_candidate_index_not_applicable' });
    expect(await (await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).json()).toEqual({ error: 'keep_fact_id_not_applicable' });
    expect((await json({ status: 'resolved_accept', keep_fact_id: 'not-a-uuid' })).status).toBe(400);
    expect(mocks.resolveFacts).not.toHaveBeenCalled();
  });
  it('maps the new outcomes: rule_failed / invalid_choice 400, conflict 409, body {id, outcome, error, detail?}; restore detail on 200; no audit for refusals', async () => {
    await facts3('reconcile_mismatch');
    for (const [outcome, code, status] of [['rule_failed', 'identity_bs', 400], ['invalid_choice', 'invalid_candidate', 400], ['conflict', 'not_passing', 409]] as const) {
      mocks.resolveFacts.mockResolvedValueOnce({ outcome, code });
      const res = await json({ status: 'resolved_accept' });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ id: ID, outcome, error: code });
    }
    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'conflict', code: 'not_passing', restoreNote: 'reconcile_wiring_missing' });
    const unwired = await json({ status: 'resolved_accept' });
    expect(unwired.status).toBe(409);
    expect(await unwired.json()).toEqual({ id: ID, outcome: 'conflict', error: 'not_passing', detail: { restore_note: 'reconcile_wiring_missing' } });
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.resolveFacts.mockResolvedValueOnce({ outcome: 'resolved', hook: HOOK, promoted: 0, restore: { promoted: 0, skipped: [{ fact_id: FACT_A, reason: 'ineligible' }] }, restoreNote: 'no_rows_promoted' });
    const ok = await json({ status: 'resolved_accept' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ outcome: 'resolved', restore: { promoted: 0 }, detail: { restore_note: 'no_rows_promoted' } });
    expect((await (await json({ status: 'resolved_accept' })).json())).toBeDefined();
  });
  it('maps SQL codes thrown past the resolver: conflict codes 409, choice codes 400, body {id, outcome, error}; unknown codes stay a 500', async () => {
    await facts3('lineage_conflict');
    for (const code of ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'not_passing', 'unresolved'] as const) {
      mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError(code));
      const res = await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ id: ID, outcome: 'conflict', error: code });
    }
    for (const code of ['invalid_choice', 'invalid_candidate'] as const) {
      mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError(code));
      const res = await json({ status: 'resolved_accept', keep_fact_id: FACT_A });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ id: ID, outcome: 'invalid_choice', error: code });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const code of ['unknown', 'batch_mismatch'] as const) {
      mocks.resolveFacts.mockRejectedValueOnce(new FactsDbError(code, 'boom'));
      expect((await json({ status: 'resolved_accept', keep_fact_id: FACT_A })).status).toBe(500);
    }
    spy.mockRestore();
  });
  it('review: a recovery retry reports and audits the PERSISTED index / adopted fact / keep, not the retry body', async () => {
    mocks.requireAdmin.mockResolvedValue({ id: 'retrying-admin' });
    await facts3('ambiguous_value');
    mocks.resolveFacts.mockResolvedValueOnce({
      outcome: 'hook_retried', hook: HOOK, adoptedFactId: FACT_B, chosenCandidateIndex: 0, chosenFactIds: [FACT_B], auditAs: 'resolved',
      recovered: { resolvedBy: ADMIN, status: 'resolved_accept', chosenFactIds: [FACT_B], recoveredBy: 'retrying-admin', recoveredAt: HOOK.at },
    });
    const res = await json({ status: 'resolved_accept', chosen_candidate_index: 7 });
    expect(await res.json()).toMatchObject({ chosen_candidate_index: 0, adopted_fact_id: FACT_B });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ user_id: ADMIN, detail: { chosen_candidate_index: 0, adopted_fact_id: FACT_B, recovered_by: 'retrying-admin' } });
    expect(mocks.insert.mock.calls[0][0].detail.chosen_candidate_index).not.toBe(7);
  });
});

// F4
describe('POST /api/admin/dq/quarantine/[id] — judgments items (F4, spec §7.6)', () => {
  const JUDGMENT = '7c1e2d3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
  const H = 'e'.repeat(64);
  let client: ReturnType<typeof memoryTableClient>;
  beforeEach(async () => {
    vi.clearAllMocks();
    client = memoryTableClient({ dq_quarantine: ['id'] });
    mocks.client = client;
    await client.insert('dq_quarantine', { id: ID, dataset: 'judgments', table_name: 'judgment_settlements', natural_key: JUDGMENT, reason_code: 'settlement_basis_mismatch', status: 'open', payload: { evidence_hash: H }, detail: {} });
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.getAdmin.mockReturnValue({ from: mocks.from });
    f4.judgmentsDb.mockReturnValue({ judgments: 'db' });
    f4.codeVersion.mockReturnValue('a'.repeat(40));
  });

  it('routes judgments items to resolveJudgmentsItem with the resolution body; an accept audited by the RPC is not audited again', async () => {
    f4.resolveJudgments.mockResolvedValue({ outcome: 'resolved', audited: true, judgmentId: JUDGMENT, resolution: 'accept_refetched', seq: null });
    const res = await json({ status: 'resolved_accept', resolution: { kind: 'accept_refetched', evidence_hash: H } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, outcome: 'resolved', judgment_id: JUDGMENT, resolution: 'accept_refetched', seq: null });
    expect(f4.judgmentsDb).toHaveBeenCalledWith({ from: mocks.from });
    expect(f4.codeVersion).toHaveBeenCalledWith({ allowGit: false });
    expect(f4.resolveJudgments).toHaveBeenCalledWith(
      { db: { judgments: 'db' }, tables: client, codeVersion: 'a'.repeat(40) },
      expect.objectContaining({ id: ID, dataset: 'judgments', reason_code: 'settlement_basis_mismatch' }),
      { status: 'resolved_accept', resolution: { kind: 'accept_refetched', evidence_hash: H }, resolvedBy: ADMIN },
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.resolveFacts).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('a reject of an already-final judgment (plain flip, audited: false) is audited by the route with the judgment, verdict and settlement seq', async () => {
    f4.resolveJudgments.mockResolvedValue({ outcome: 'resolved', audited: false, judgmentId: JUDGMENT, resolution: 'quarantine_rejected', seq: 2 });
    const res = await json({ status: 'resolved_reject' });
    expect(res.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: ADMIN, action: 'dq.quarantine_resolve', object_id: ID,
      detail: { id: ID, status: 'resolved_reject', outcome: 'resolved', judgment_id: JUDGMENT, resolution: 'quarantine_rejected', seq: 2 },
    });
  });

  it('maps hook outcomes to HTTP statuses without auditing failures', async () => {
    const cases: [string, number][] = [['resolution_not_applicable', 400], ['invalid_resolution', 400], ['unknown_judgment', 404], ['code_version_unavailable', 503], ['already_resolved', 409], ['stale', 409]];
    for (const [outcome, status] of cases) {
      f4.resolveJudgments.mockResolvedValueOnce({ outcome, audited: false, judgmentId: JUDGMENT, resolution: null, seq: null });
      const res = await json({ status: 'resolved_accept', resolution: { kind: 'accept_refetched', evidence_hash: H } });
      expect({ outcome, status: res.status }).toEqual({ outcome, status });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('non-judgments datasets never reach the judgments hook', async () => {
    await client.update('dq_quarantine', { id: ID }, { dataset: 'macro', table_name: 't' });
    mocks.resolve.mockResolvedValue('resolved');
    expect((await json({ status: 'resolved_accept', resolution: { kind: 'accept_refetched' } })).status).toBe(200);
    expect(f4.resolveJudgments).not.toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });
});
// /F4
