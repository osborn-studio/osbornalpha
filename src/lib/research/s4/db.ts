import {createHash} from 'node:crypto';
import {assertRuntimePrivileges} from '../runtime/privileges';
import {researchConfig} from '../runtime/config';
import { Pool, type PoolClient } from 'pg';
import { fail } from '../ingest/pa-v1/json.js';
import { validateCandidateBinding, type CandidateBinding } from '../ingest/candidate';

export interface S4Actor { userId: string; kind: 'human' | 'agent' }
let pool: Pool | undefined;
let poolConfigDigest: string | undefined;
export function s4Pool(): Pool {
  if (process.env.ALPHA_S4_ENABLED !== '1') fail('not_configured');
  let config;
  try {config=researchConfig();} catch {fail('scope_denied');}
  // I1a validates production candidates but does not release a production runtime.
  if(!config||config.mode!=='local')fail('not_configured');
  const digest=createHash('sha256').update(JSON.stringify(config!.db)).digest('hex');
  if(pool&&poolConfigDigest!==digest)fail('not_configured');
  if(!pool){pool=new Pool(config!.db);poolConfigDigest=digest;}
  return pool;
}
export async function closeS4Pool() { await pool?.end(); pool = undefined; poolConfigDigest=undefined; }
export async function transaction<T>(actor: S4Actor, work: (db: PoolClient) => Promise<T>, preAuth?: (db:PoolClient)=>Promise<void>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(actor.userId) || !['human','agent'].includes(actor.kind)) fail('scope_denied');
  const db = await s4Pool().connect();
  let released=false;
  try {
    // Queued owner-lock work must observe the preceding owner's committed writes.
    await db.query('begin isolation level read committed');
    await assertRuntimePrivileges(db);
    await db.query("select pg_catalog.set_config('request.jwt.claim.sub',$1,true)", [actor.userId]);
    // Machine sessions reject invalid tokens before contending for the owner lock.
    // Their caller must recheck after acquiring it to serialize revocation.
    await preAuth?.(db);
    // Serializes one owner's mutations + export. Sequence allocation cannot race
    // export visibility, and two equal CAS submissions cannot both succeed.
    await db.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))', [actor.userId]);
    const profile = await db.query('select role from public.profiles where id=$1', [actor.userId]);
    if (profile.rows[0]?.role !== 'admin') fail('scope_denied');
    const result = await work(db);
    await db.query('commit');
    return result;
  } catch (e) { try{await db.query('rollback');}catch{db.release(true);released=true;throw e;} throw e; }
  finally { if(!released)db.release(); }
}
export async function serverTime(db: PoolClient): Promise<string> {
  return (await db.query('select pg_catalog.clock_timestamp() as t')).rows[0].t.toISOString();
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
