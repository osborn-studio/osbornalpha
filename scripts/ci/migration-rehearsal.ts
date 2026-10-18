/** Fresh vs seeded pre-migration upgrade. Local synthetic data only. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { startLocalDatabase, stopLocalDatabase, ownedPool } from '../s4/local-db';
import { migrationInventory, recoveredMigration } from './research-checks';

async function main() {
  migrationInventory();
  mkdirSync('reports', { recursive: true }); rmSync('reports/migration-rehearsal.json', { force: true });
  const states: Awaited<ReturnType<typeof startLocalDatabase>>[] = [];
  let seeded = false, schemaHash = '', interrupted = false;
  let primaryError: unknown;
  const stop = () => { interrupted = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    states.push(await startLocalDatabase({ rehearsalDefaultTableGrants: true }));
    states.push(await startLocalDatabase({ rehearsalDefaultTableGrants: true, beforeMigration: async (db, file) => {
      if (file !== recoveredMigration.file) return;
      await db.query(`insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','migration@example.test');
        insert into public.stocks_universe(ticker,name,market,exchange,currency) values('SYNTH','Synthetic','US','XNYS','USD');
        insert into public.watchlists(id,user_id,name) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Synthetic');
        insert into public.watchlist_items(id,watchlist_id,user_id,ticker,notes) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','SYNTH','preserve me');
        insert into public.broker_reports(user_id,ticker,broker) values('00000000-0000-4000-8000-000000000001','SYNTH','Synthetic');
        insert into public.briefs(id,user_id,brief_date) values('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','2026-01-01');
        insert into public.perspectives(brief_id,user_id,ticker,persona,stance) values('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','SYNTH','buffett','neutral');
        insert into public.news_items(id,user_id,ticker,title,published_at) values('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','SYNTH','Synthetic',now());`);
      seeded = true;
    } }));
    if (!seeded) throw new Error('Upgrade fixture was not inserted before recovered migration');
    const dump = (state: typeof states[number]) => {
      const url = new URL(state.adminUrl); const password = url.password; url.password = '';
      return execFileSync(join(state.bin, 'pg_dump'), ['--schema-only', '--no-owner', '--schema=public', '--dbname', url.toString()], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: password }, maxBuffer: 8 * 1024 * 1024, timeout: 30_000 })
        .split('\n').filter(line => !line.startsWith('\\restrict ') && !line.startsWith('\\unrestrict ')).join('\n');
    };
    const fresh = dump(states[0]);
    if (fresh !== dump(states[1])) throw new Error('Fresh and seeded-upgrade public schemas differ');
    schemaHash = createHash('sha256').update(fresh).digest('hex');
    const db = ownedPool({ connectionString: states[1].adminUrl });
    try {
      const item = (await db.query("select notes,status,decision_version from public.watchlist_items where ticker='SYNTH'")).rows[0];
      if (item?.notes !== 'preserve me' || item.status !== 'watching' || item.decision_version !== 0) throw new Error('Upgrade did not preserve existing item/defaults');
      const news = (await db.query("select id::text,source_key from public.news_items where ticker='SYNTH'")).rows[0];
      if (!news || news.id !== news.source_key) throw new Error('Existing news source_key not backfilled');
      const broker = (await db.query("select id::text,source_key from public.broker_reports where ticker='SYNTH'")).rows[0];
      if (!broker || broker.id !== broker.source_key) throw new Error('Existing broker source_key not backfilled');
      const perspective = (await db.query("select brief_id from public.perspectives where ticker='SYNTH'")).rows[0];
      if (!perspective?.brief_id) throw new Error('Existing perspective origin lost');
      const acl = (await db.query(`select has_table_privilege('authenticated','public.watchlist_alerts','UPDATE') as default_update_allowed,
        has_table_privilege('authenticated','public.watchlist_alert_events','UPDATE') as update_allowed,
        has_function_privilege('authenticated','public.claim_watchlist_alert_events(integer)','EXECUTE') as claim_allowed,
        has_function_privilege('anon','public.update_watchlist_item_decision(uuid,integer,jsonb)','EXECUTE') as anon_allowed,
        has_function_privilege('authenticated','public.update_watchlist_item_decision(uuid,integer,jsonb)','EXECUTE') as owner_allowed`)).rows[0];
      if (!acl.default_update_allowed || acl.update_allowed || acl.claim_allowed || acl.anon_allowed || !acl.owner_allowed) throw new Error('Recovered migration ACL regression');
    } finally { await db.end(); }
    // Exercise cleanup when a cluster has already stopped, without touching any external cluster.
    execFileSync(join(states[0].bin, 'pg_ctl'), ['-D', join(states[0].directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe', timeout: 30_000 });
    if (interrupted) throw new Error('Rehearsal interrupted');
  } catch (e) { primaryError = e; throw e; } finally {
    const failures: unknown[] = [];
    for (const state of states.reverse()) { try { stopLocalDatabase(state); } catch (e) { failures.push(e); } }
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    if (failures.length) throw new AggregateError(primaryError ? [primaryError, ...failures] : failures, `${primaryError instanceof Error ? primaryError.message + '; ' : ''}Local rehearsal cleanup failed`);
  }
  writeFileSync('reports/migration-rehearsal.json', JSON.stringify({ schemaHash, fresh: 'passed', seededUpgrade: 'passed', cleanup: 'stopped', productionEquivalence: 'not_verified', acl: 'passed', scope: 'public schema and ACL excluding owners; not full Supabase parity' }, null, 2));
  console.log('PASS: fresh schema equals seeded upgrade; existing rows preserved; both local clusters stopped.');
}
main().catch(e => { console.error((e as Error).message); process.exitCode = 1; });
