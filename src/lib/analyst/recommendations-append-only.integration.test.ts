// Database-level append-only guarantee for public.recommendations
// (supabase/migrations/20261017120000_recommendations_append_only.sql).
// Runs against the isolated PostgreSQL cluster from scripts/s4/local-db.ts
// (S4_TEST_STATE), both as admin and as the owner through RLS, the way a
// browser holding the owner's JWT would reach PostgREST.

import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

const enabled = !!process.env.S4_TEST_STATE;
const appendOnly = { code: 'P0001', message: expect.stringContaining('recommendations are append-only') };

describe.skipIf(!enabled)('recommendations append-only trigger isolated PostgreSQL', () => {
  let pool: Pool; let db: PoolClient;
  let userId: string; let recId: string;

  beforeAll(() => { const state = JSON.parse(readFileSync(process.env.S4_TEST_STATE!, 'utf8')); pool = new Pool({ connectionString: state.adminUrl }); });
  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    db = await pool.connect(); await db.query('begin');
    userId = randomUUID();
    await db.query('insert into auth.users(id,email) values($1,$2)', [userId, `${userId}@example.test`]);
    const analyst = (await db.query("insert into public.analyst_profiles(user_id,display_name,is_self) values($1,'me',true) returning id", [userId])).rows[0].id;
    recId = (await db.query(`insert into public.recommendations(user_id,analyst_id,ticker,market,action,reference_price,confidence,rationale)
      values($1,$2,'NVDA','US','buy',120.5,70,'first call') returning id`, [userId, analyst])).rows[0].id;
  });
  afterEach(async () => { await db.query('rollback'); db.release(); });

  // Every statement runs under a savepoint so an expected trigger error does not abort the test transaction.
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    await db.query('savepoint s');
    try { const out = await fn(); await db.query('release savepoint s'); return out; }
    catch (e) { await db.query('rollback to savepoint s'); throw e; }
  }
  const update = (sql: string, params: unknown[] = []) => run(() => db.query(`update public.recommendations set ${sql} where id = $1`, [recId, ...params]));
  const row = async () => (await db.query('select * from public.recommendations where id = $1', [recId])).rows[0];

  it('rejects changes to any recorded column and names the column', async () => {
    await expect(update('reference_price = 1')).rejects.toMatchObject({ ...appendOnly, message: expect.stringContaining('reference_price') });
    await expect(update("recommended_at = now() - interval '30 days'")).rejects.toMatchObject({ ...appendOnly, message: expect.stringContaining('recommended_at') });
    await expect(update("action = 'sell', confidence = 99")).rejects.toMatchObject({ ...appendOnly, message: expect.stringContaining('action, confidence') });
    await expect(update("rationale = null")).rejects.toMatchObject({ ...appendOnly, message: expect.stringContaining('rationale') });
    await expect(update("target_price = 200")).rejects.toMatchObject({ ...appendOnly, message: expect.stringContaining('target_price') });
    await expect(update("source_ref = '{\"x\":1}'::jsonb")).rejects.toMatchObject({ ...appendOnly, message: expect.stringContaining('source_ref') });
    // A no-op update (same values, null stays null) is still allowed.
    await expect(update('rationale = rationale, target_price = null')).resolves.toMatchObject({ rowCount: 1 });
  });

  it('allows withdrawing once, then freezes the row', async () => {
    await expect(update("withdraw_reason = 'early'")).rejects.toMatchObject(appendOnly); // reason without withdrawing
    await expect(update("withdrawn_at = now(), withdraw_reason = 'thesis broken'")).resolves.toMatchObject({ rowCount: 1 });
    expect((await row()).withdraw_reason).toBe('thesis broken');
    await expect(update('withdrawn_at = null, withdraw_reason = null')).rejects.toMatchObject(appendOnly);
    await expect(update("withdraw_reason = 'changed my mind'")).rejects.toMatchObject(appendOnly);
    await expect(update("withdrawn_at = now() + interval '1 day'")).rejects.toMatchObject(appendOnly);
    await expect(update('fill_price = 10, fill_date = current_date')).rejects.toMatchObject(appendOnly);
    await expect(update('reference_price = 1')).rejects.toMatchObject(appendOnly);
  });

  it('allows the fill to be written once, together, then never again', async () => {
    await expect(update('fill_price = 121.25')).rejects.toMatchObject(appendOnly); // half a fill
    await expect(update("fill_price = 121.25, fill_date = '2026-06-01'")).resolves.toMatchObject({ rowCount: 1 });
    expect(await row()).toMatchObject({ fill_price: '121.25', fill_date: new Date('2026-06-01T00:00:00') });
    await expect(update('fill_price = 130')).rejects.toMatchObject(appendOnly);
    await expect(update("fill_date = '2026-06-02'")).rejects.toMatchObject(appendOnly);
    await expect(update('fill_price = null, fill_date = null')).rejects.toMatchObject(appendOnly);
    // Withdrawing a filled row is still a legal one-shot.
    await expect(update('withdrawn_at = now()')).resolves.toMatchObject({ rowCount: 1 });
  });

  it('matches the API write shapes: withdraw and scorer fill pass, owner JWT direct rewrite fails', async () => {
    // The API's exact statements (store.ts withdrawRecommendation, score-store.ts one-shot fill), run as the
    // owner through RLS. The bare harness has no Supabase default grants, so grant what PostgREST would have.
    await db.query('grant usage on schema public to authenticated; grant select, update on public.recommendations to authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await db.query('set local role authenticated');
    const fill = () => run(() => db.query('update public.recommendations set fill_price = $2, fill_date = $3 where id = $1 and user_id = $4 and fill_price is null', [recId, 121.25, '2026-06-01', userId]));
    expect((await fill()).rowCount).toBe(1);
    expect((await fill()).rowCount).toBe(0); // API guard: no row matched, no error
    // Direct rewrite through RLS as the owner: the policy lets the row through, the trigger does not.
    await expect(update("reference_price = 1, recommended_at = now() - interval '1 day'")).rejects.toMatchObject({ ...appendOnly, message: expect.stringContaining('reference_price, recommended_at') });
    await expect(update('fill_price = 1, fill_date = current_date')).rejects.toMatchObject(appendOnly);
    const withdraw = () => run(() => db.query('update public.recommendations set withdrawn_at = now(), withdraw_reason = $2 where id = $1 and user_id = $3 and withdrawn_at is null', [recId, null, userId]));
    expect((await withdraw()).rowCount).toBe(1);
    expect((await withdraw()).rowCount).toBe(0);
  });

  it('is installed as a BEFORE UPDATE row trigger on public.recommendations', async () => {
    const t = (await db.query(`select tgtype, tgenabled from pg_trigger where tgrelid = 'public.recommendations'::regclass and tgname = 'recommendations_append_only'`)).rows[0];
    expect(t).toBeDefined();
    // tgtype bits: 1 = row, 2 = before, 16 = update.
    expect(t.tgtype & 1).toBe(1); expect(t.tgtype & 2).toBe(2); expect(t.tgtype & 16).toBe(16);
    expect(t.tgenabled).toBe('O');
  });
});
