import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { evaluateQuoteWindow } from './evaluators';
const enabled = !!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('quote alert bounded scalar snapshot isolated PostgreSQL', () => {
  let pool: Pool; let db: PoolClient;
  const from = '2018-01-01T00:00:00Z'; const to = '2018-01-01T00:15:00Z';
  beforeAll(() => { const state = JSON.parse(readFileSync(process.env.S4_TEST_STATE!, 'utf8')); pool = new Pool({ connectionString: state.adminUrl }); });
  beforeEach(async () => { db = await pool.connect(); await db.query('begin'); await db.query('grant usage on schema public to service_role; grant select on public.user_events to service_role'); });
  afterEach(async () => { await db.query('rollback'); db.release(); });
  afterAll(async () => { await pool.end(); });
  async function snapshot(start = from, end = to) { return (await db.query('select public.quote_alert_window_samples($1,$2) as samples', [start, end])).rows[0].samples; }
  it('returns1500 samples in one JSON scalar with existing evaluator semantics and no unrelated metadata', async () => {
    await db.query(`insert into public.user_events(event_name,metadata,created_at) select case when g=1 then 'quote_batch_failed' when g=2 then 'quote_batch_degraded' else 'quote_batch_loaded' end, '{"count":2,"stale":1,"private":"synthetic-only","nested":{"ignored":true}}'::jsonb, $1::timestamptz from generate_series(1,1500) g`, [from]);
    await db.query(`insert into public.user_events(event_name,created_at) values ('unrelated',$1),('quote_batch_loaded',$2)`, [from, to]);
    await db.query('set local role service_role'); const rows = await snapshot();
    expect(rows).toHaveLength(1500); expect(Object.keys(rows[0]).sort()).toEqual(['event_name', 'metadata']);
    expect(rows.every((row: { metadata: object }) => Object.keys(row.metadata).sort().join(',') === 'count,stale')).toBe(true);
    expect(evaluateQuoteWindow(rows).metrics).toMatchObject({ batches: 1500, full_failures: 1, degraded_batches: 1, attempted_tickers: 3000, stale_tickers: 1500, cache_ratio: .5 });
  });
  it('bounds oversized windows with10001 sentinel instead of an unbounded result', async () => {
    await db.query(`insert into public.user_events(event_name,metadata,created_at) select 'quote_batch_loaded','{"count":1}', $1::timestamptz from generate_series(1,11000)`, [from]);
    await db.query('set local role service_role'); expect(await snapshot()).toHaveLength(10001);
  });
  it.each(['anon', 'authenticated'])('denies %s execution without widening table policies', async role => {
    await db.query(`set local role ${role}`); await expect(snapshot()).rejects.toMatchObject({ code: '42501' });
  });
  it.each([[null, to], [from, null], ['infinity', to], [from, 'infinity'], [from, '2018-01-01T00:30:00Z'], [to, from]])('rejects non-finite/null/non15m window %s %s', async (start, end) => {
    await expect(db.query('select public.quote_alert_window_samples($1,$2)', [start, end])).rejects.toMatchObject({ code: '22023' });
  });
  it.each([0, 1])('preserves projected JSON/evaluator numeric parity with caller extra_float_digits=%s', async digits => {
    const values = ['null', 'true', '"3"', '{}', '-1', '0.49999999999999994', '0.5', '1e400', '1e-400', '1.7976931348623157e308'];
    await db.query(`set local extra_float_digits = ${digits}`);
    for (const value of values) {
      await db.query('reset role');
      await db.query('delete from public.user_events where created_at >= $1 and created_at < $2', [from, to]);
      await db.query(`insert into public.user_events(event_name,metadata,created_at) values ('quote_batch_loaded',jsonb_build_object('count',$1::jsonb,'stale',0),$2)`, [value, from]);
      await db.query('set local role service_role');
      const projected = await snapshot();
      expect(projected.every((r: { metadata: { count: unknown } }) => r.metadata.count === null || typeof r.metadata.count === 'number' && Number.isFinite(r.metadata.count))).toBe(true);
      expect(evaluateQuoteWindow(projected)).toEqual(evaluateQuoteWindow([{ event_name: 'quote_batch_loaded', metadata: { count: JSON.parse(value), stale: 0 } }]));
    }
  });
  it('only sees committed rows at read time; late commits require separate reconciliation', async () => {
    const writer = await pool.connect();
    try {
      await writer.query('begin');
      await writer.query(`insert into public.user_events(event_name,created_at) values ('quote_batch_failed',$1)`, [from]);
      await db.query('set local role service_role'); expect(await snapshot()).toEqual([]);
      await writer.query('commit'); expect(await snapshot()).toHaveLength(1);
    } finally {
      await writer.query('rollback');
      await writer.query('delete from public.user_events where created_at >= $1 and created_at < $2', [from, to]);
      writer.release();
    }
  });
  it('is invoker/stable with locked search path, empty result and no writes', async () => {
    const funcs = (await db.query(`select proname,provolatile,prosecdef,proconfig from pg_proc where oid in ('public.quote_alert_window_samples(timestamptz,timestamptz)'::regprocedure,'public.quote_alert_number(jsonb)'::regprocedure)`)).rows;
    expect(funcs.find(f => f.proname === 'quote_alert_window_samples')).toMatchObject({ provolatile: 's', prosecdef: false });
    expect(funcs.every(f => f.proconfig.includes('search_path=""'))).toBe(true);
    const before = (await db.query('select count(*) n from public.user_events')).rows[0].n;
    await db.query('set local role service_role'); expect(await snapshot()).toEqual([]);
    expect((await db.query('select count(*) n from public.user_events')).rows[0].n).toBe(before);
  });
});
