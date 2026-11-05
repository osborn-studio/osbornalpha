// src/lib/facts/pg-facts-db.ts
// TEST-ONLY FactsDb over node-postgres that calls the same SQL functions supabaseFactsDb calls
// through rpc, so the contract tests and the offline sync integration tests exercise the real
// schema (locks, leases, triggers, generations). Nothing in src/app imports this. Shares ident and
// typeParsers with pg-table-client.ts: date/timestamptz come back as text, jsonb is parsed, numeric
// and bigint arrive as strings (value comes from value_text; state_rev/based_on_rev are Number()ed
// by the db.ts normalisers). Errors are mapped with toFactsDbError exactly like PostgREST errors.
import type {Pool} from 'pg';
import {ident,typeParsers} from '../db/pg-table-client';
import {assertAllStaged,chunk,conflictFromItem,conflictPrefix,factRowFromTable,filingArgs,filingFromTable,linkPatch,metricArgs,metricFromTable,readArgs,resultFromEnvelope,scopeFromTable,toFactsDbError} from './db';
import type {PgErrorLike,ReadFactsEnvelope} from './db';
import type {FactsDb} from './types';

export function pgFactsDb(pool:Pool):FactsDb{
 const run=async(text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){throw toFactsDbError(e as PgErrorLike);}
 };
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await run(`select ${call} as v`,values)).rows[0].v as T;
 const rel=(table:string)=>`${ident('public')}.${ident(table)}`;
 return {
  claimLease:(issuer,market,batch,ttl)=>fn<boolean>('public.claim_fact_sync_lease($1,$2,$3,$4)',[issuer,market,batch,ttl]),
  beginRun:(issuer,market,batch,gen)=>fn<string>('public.begin_sync_run($1,$2,$3,$4)',[issuer,market,batch,gen]),
  async stageFilings(runId,input){
   const out=new Map<string,string>();
   for(const part of chunk(input)){const m=await fn<Record<string,string>|null>('public.stage_filings($1,$2::jsonb)',[runId,JSON.stringify(filingArgs(part))]);for(const [k,v] of Object.entries(m??{}))out.set(k,v);}
   return assertAllStaged(input,out);
  },
  async stageFacts(runId,input){let n=0;for(const part of chunk(input))n+=Number(await fn<number>('public.stage_facts($1,$2::jsonb)',[runId,JSON.stringify(part)]));return n;},
  quarantineFacts:(runId,ids,item)=>fn<number>('public.quarantine_facts($1,$2::uuid[],$3)',[runId,ids,item]),
  publishRun:(runId,manifest,expectedRev)=>fn<number>('public.publish_sync_run($1,$2::uuid[],$3::bigint)',[runId,manifest,expectedRev??null]),
  async abandonRun(runId){await fn('public.abandon_sync_run($1)',[runId]);},
  async releaseLease(issuer,market,batch,outcome,nextDue){await fn('public.release_fact_sync_lease($1,$2,$3,$4,$5::timestamptz)',[issuer,market,batch,outcome,nextDue]);},
  resolveFactsQuarantine:(item,chosen,by)=>fn<{promoted:number;skipped:number}>('public.resolve_facts_quarantine($1,$2::uuid[],$3)',[item,chosen,by]),
  replaceMetrics:(issuer,market,rev,input)=>fn<number>('public.replace_financial_metrics($1,$2,$3,$4::jsonb)',[issuer,market,rev,JSON.stringify(input.map(metricArgs))]),
  async readFacts(issuer,market,opts){
   const a=readArgs(issuer,market,opts);
   return resultFromEnvelope(await fn<ReadFactsEnvelope>('public.read_facts($1,$2,$3::text[],$4::date,$5::date,$6::date,$7,$8,$9)',[a.p_issuer,a.p_market,a.p_concepts,a.p_as_of,a.p_from,a.p_to,a.p_history,a.p_limit,a.p_include_non_ok]));
  },
  async factsByIds(ids){
   if(ids.length===0)return [];
   return (await run(`select * from ${rel('financial_facts')} where fact_id = any($1::uuid[]) order by fact_id`,[[...new Set(ids)]])).rows.map(r=>factRowFromTable(r));   // deduped, ordered by fact_id
  },
  async openConflicts(issuer,market){
   return (await run(`select id, natural_key, payload from ${rel('dq_quarantine')} where table_name = 'financial_facts' and reason_code = 'same_day_conflict' and status = 'open' and natural_key like $1 order by created_at, id`,[`${conflictPrefix(issuer,market)}%`])).rows.map(conflictFromItem);
  },
  async filingsOfIssuer(issuer,market,opts){
   const values:unknown[]=[issuer,market];let where=`issuer_id = $1 and market = $2`;
   if(opts.from!==undefined){values.push(opts.from);where+=` and available_date >= $${values.length}::date`;}
   if(opts.to!==undefined){values.push(opts.to);where+=` and available_date <= $${values.length}::date`;}
   if(opts.unlinkedOnly)where+=` and document_ref is null`;
   let limit='';
   if(opts.limit!==undefined){values.push(opts.limit);limit=` limit $${values.length}`;}   // no implicit cap (round-1 #7)
   return (await run(`select * from ${rel('filings')} where ${where} order by available_date desc, filing_id${limit}`,values)).rows.map(filingFromTable);
  },
  async updateFilingLink(filingId,patch){
   const p=linkPatch(patch);const cols=Object.keys(p);
   await run(`update ${rel('filings')} set ${cols.map((c,i)=>`${ident(c)} = $${i+2}`).join(', ')} where filing_id = $1`,[filingId,...cols.map(c=>p[c])]);
  },
  reconcileScope:(market,input)=>fn<number>('public.reconcile_fact_sync_scope($1,$2::jsonb)',[market,JSON.stringify(input)]),
  async scopeDue(market,now,limit){
   if(limit<1)return [];
   return (await run(`select * from ${rel('fact_sync_scope')} where market = $1 and priority > 0 and next_due_at <= $2::timestamptz order by next_due_at, priority desc, issuer_id limit $3`,[market,now,limit])).rows.map(r=>scopeFromTable(r));
  },
  async scopeRows(market,issuerIds){
   if(issuerIds.length===0)return [];
   return (await run(`select * from ${rel('fact_sync_scope')} where market = $1 and issuer_id = any($2::uuid[]) order by issuer_id`,[market,issuerIds])).rows.map(r=>scopeFromTable(r));
  },
  async scopeAll(market){
   return (await run(`select * from ${rel('fact_sync_scope')} where market = $1 order by issuer_id`,[market])).rows.map(r=>scopeFromTable(r));
  },
  async metricsOfIssuer(issuer,market,formulaVersion){
   return (await run(`select * from ${rel('financial_metrics')} where issuer_id = $1 and market = $2 and formula_version = $3 order by metric, period_end, period_start, input_unit, basis`,[issuer,market,formulaVersion])).rows.map(metricFromTable);
  },
 };
}
