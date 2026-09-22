import { Pool, type PoolClient } from 'pg';
import { fail } from '../ingest/pa-v1/json.js';
import { validateCandidateBinding, type CandidateBinding } from '../ingest/candidate';

export interface S4Actor { userId: string; kind: 'human' | 'agent' }
let pool: Pool | undefined;
export function s4Pool(): Pool {
  if (process.env.ALPHA_S4_ENABLED !== '1') fail('not_configured');
  const url = new URL(process.env.ALPHA_S4_DATABASE_URL || 'postgres://unconfigured');
  // This delivery authorizes local acceptance only. No implicit production rollout.
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) fail('scope_denied');
  return pool ??= new Pool({ connectionString: url.toString(), max: 6, connectionTimeoutMillis: 5000,
    statement_timeout: 15000, idle_in_transaction_session_timeout:30000, application_name: 'alpha-s4' });
}
export async function closeS4Pool() { await pool?.end(); pool = undefined; }
export async function transaction<T>(actor: S4Actor, work: (db: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(actor.userId) || !['human','agent'].includes(actor.kind)) fail('scope_denied');
  const db = await s4Pool().connect();
  let released=false;
  try {
    await db.query('begin');
    const role = (await db.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls) fail('scope_denied');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.userId]);
    // Serializes one owner's mutations + export. Sequence allocation cannot race
    // export visibility, and two equal CAS submissions cannot both succeed.
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [actor.userId]);
    const profile = await db.query('select role from public.profiles where id=$1', [actor.userId]);
    if (profile.rows[0]?.role !== 'admin') fail('scope_denied');
    const result = await work(db);
    await db.query('commit');
    return result;
  } catch (e) { try{await db.query('rollback');}catch{db.release(true);released=true;throw e;} throw e; }
  finally { if(!released)db.release(); }
}
export async function serverTime(db: PoolClient): Promise<string> {
  return (await db.query('select clock_timestamp() as t')).rows[0].t.toISOString();
}
export async function bindingFor(db: PoolClient, actor: S4Actor, hash: string): Promise<CandidateBinding> {
  const row = (await db.query('select binding,revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2', [actor.userId,hash])).rows[0];
  if (!row || row.revoked) fail('scope_denied');
  const b = row.binding as CandidateBinding;
  validateCandidateBinding(b);
  const now = Date.parse(await serverTime(db));
  const config = b.trustedConfig as { rights?: { valid_until?: string }; grant?: { valid_until?: string } };
  if (b.localUserId !== actor.userId || b.revoked !== false ||
      ![config.rights?.valid_until,config.grant?.valid_until].every(t => t && Date.parse(t) > now)) fail('policy_blocked');
  return b;
}

export async function assertWritableChain(db:PoolClient,actor:S4Actor){
  if((await db.query("select 1 from public.research_s4_integrity where user_id=$1",[actor.userId])).rowCount)fail('anchor_integrity_failed');
}
