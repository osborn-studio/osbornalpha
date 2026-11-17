// US-only batch transport; shares the single-issuer normaliser without widening pinned FactsDb.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Pool} from 'pg';
import {resultFromEnvelope,toFactsDbError} from './db';
import type {PgErrorLike,ReadFactsEnvelope} from './db';
import {FactsDbError} from './types';
import type {FactsDb,Market,ReadFactsResult} from './types';
export const FACTS_BATCH_MAX=200;
export interface ReadFactsBatchOptions{concepts:readonly string[];asOf:string;history:boolean}
export interface FactsBatchReader{
 /** One ReadFactsResult per requested issuer (same content as FactsDb.readFacts with these options). */
 readFactsBatch(issuers:readonly string[],market:Market,opts:ReadFactsBatchOptions):Promise<Map<string,ReadFactsResult>>;
}
function members(issuers:readonly string[],opts:ReadFactsBatchOptions):string[]{
 const ids=[...new Set(issuers)];
 if(ids.length>FACTS_BATCH_MAX)throw new FactsDbError('unknown','batch_too_large');
 if(!opts.concepts?.length)throw new FactsDbError('unknown','empty_concepts');
 return ids;
}
function envelopes(ids:string[],data:unknown):Map<string,ReadFactsResult>{
 const out=new Map<string,ReadFactsResult>(),requested=new Set(ids);
 for(const env of (Array.isArray(data)?data:[]) as (ReadFactsEnvelope&{issuer_id:string})[]){
  if(!requested.has(env.issuer_id)||out.has(env.issuer_id))throw new FactsDbError('unknown',`batch_incomplete:${env.issuer_id}`);
  out.set(env.issuer_id,resultFromEnvelope(env));
 }
 for(const id of ids)if(!out.has(id))throw new FactsDbError('unknown',`batch_incomplete:${id}`);
 return out;
}
export function supabaseFactsBatchReader(client:SupabaseClient):FactsBatchReader{
 const c=client as unknown as {rpc(fn:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:PgErrorLike|null}>};
 return {async readFactsBatch(issuers,market,opts){
  const ids=members(issuers,opts);if(!ids.length)return new Map();
  const {data,error}=await c.rpc('read_facts_batch',{p_issuers:ids,p_market:market,p_concepts:opts.concepts,p_as_of:opts.asOf,p_history:opts.history});
  if(error)throw toFactsDbError(error);
  return envelopes(ids,data);
 }};
}
/** Test-only node-postgres adapter. JSONB is already parsed by pg; no scalar date/numeric columns. */
export function pgFactsBatchReader(pool:Pool):FactsBatchReader{
 return {async readFactsBatch(issuers,market,opts){
  const ids=members(issuers,opts);if(!ids.length)return new Map();
  let data:unknown;
  try{data=(await pool.query('select public.read_facts_batch($1::uuid[],$2::text,$3::text[],$4::date,$5::boolean) as v',[ids,market,opts.concepts,opts.asOf,opts.history])).rows[0].v;}
  catch(e){throw toFactsDbError(e as PgErrorLike);}
  return envelopes(ids,data);
 }};
}
export function memoryFactsBatchReader(db:Pick<FactsDb,'readFacts'>):FactsBatchReader{
 return {async readFactsBatch(issuers,market,opts){
  const ids=members(issuers,opts),out=new Map<string,ReadFactsResult>();
  for(const id of ids){const value=await db.readFacts(id,market,{...opts,concepts:[...opts.concepts]});if(!value)throw new FactsDbError('unknown',`batch_incomplete:${id}`);out.set(id,value);}
  return out;
 }};
}
