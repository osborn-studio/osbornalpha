// src/lib/company/snapshot-read.ts
// Same-snapshot read (spec §0.1 item 3): company_read_snapshot returns {facts: read_facts envelope,
// filings: FilingSummary[]} from ONE statement, so a statements grid / drawer / digest never mixes a
// fact envelope and a filing list from two database states. The facts envelope is converted with the
// facts layer's resultFromEnvelope (value = value_text, sequences normalised). memorySnapshotReader
// reproduces the function over memoryFactsDb for unit tests. Callers check `truncated` themselves.
import type {SupabaseClient} from '@supabase/supabase-js';
import {resultFromEnvelope} from '../facts/db';
import type {ReadFactsEnvelope} from '../facts/db';
import type {MemoryFactsDb} from '../facts/memory-facts-db';
import type {FilingRow} from '../facts/types';
import {toCompanyDbError} from './db';
import {CompanyDbError} from './types';
import type {PgErrorLike} from './db';
import type {FilingSummary,Market,ReadSnapshotOptions,ReadSnapshotResult} from './types';

export type SnapshotReader=(issuer:string,market:Market,opts:ReadSnapshotOptions)=>Promise<ReadSnapshotResult>;
export interface SnapshotEnvelope{facts:ReadFactsEnvelope;filings:Record<string,unknown>[]}
/** Anything with Supabase's rpc shape (SupabaseClient, or the pg adapter of Task 4). */
export interface RpcClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:PgErrorLike|null}>}

export function snapshotArgs(issuer:string,market:Market,o:ReadSnapshotOptions):Record<string,unknown>{
 return {p_issuer:issuer,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history,p_limit:o.limit??null};
}
/** Same rule as citationOf in src/lib/facts/public-route.ts: US → edgar; CN → linked when document_ref is non-empty, else pending. */
export const citationOfFiling=(g:Pick<FilingRow,'market'|'document_ref'>):FilingSummary['citation']=>g.market==='US'?'edgar':g.document_ref?'linked':'pending';
export function filingSummaryFromJson(r:Record<string,unknown>):FilingSummary{
 const s=(v:unknown)=>v===null||v===undefined?null:String(v);
 return {filingId:String(r.filingId),formType:String(r.formType),fiscalYear:r.fiscalYear===null||r.fiscalYear===undefined?null:Number(r.fiscalYear),fiscalPeriod:s(r.fiscalPeriod),
  periodEnd:s(r.periodEnd),availableDate:String(r.availableDate),sourceRef:String(r.sourceRef),source:r.source as FilingSummary['source'],url:s(r.url),documentUrl:s(r.documentUrl),
  citation:r.citation as FilingSummary['citation'],linkAttempts:Number(r.linkAttempts),factCount:Number(r.factCount),mappingGen:Number(r.mappingGen)};
}
export function filingSummaryOf(g:FilingRow,factCount:number):FilingSummary{
 return {filingId:g.filing_id,formType:g.form_type,fiscalYear:g.fiscal_year,fiscalPeriod:g.fiscal_period,periodEnd:g.period_end,availableDate:g.available_date,sourceRef:g.source_ref,
  source:g.source,url:g.url,documentUrl:g.document_url,citation:citationOfFiling(g),linkAttempts:g.link_attempts,factCount,mappingGen:g.mapping_gen};
}
export function snapshotFromEnvelope(env:SnapshotEnvelope):ReadSnapshotResult{
 return {...resultFromEnvelope(env.facts),filings:(env.filings??[]).map(filingSummaryFromJson)};
}
export async function readSnapshot(client:SupabaseClient|RpcClient,issuer:string,market:Market,opts:ReadSnapshotOptions):Promise<ReadSnapshotResult>{
 const c=client as unknown as RpcClient;
 const {data,error}=await c.rpc('company_read_snapshot',snapshotArgs(issuer,market,opts));
 if(error)throw toCompanyDbError(error);
 return snapshotFromEnvelope(data as SnapshotEnvelope);
}
export const snapshotReader=(client:SupabaseClient|RpcClient):SnapshotReader=>(issuer,market,opts)=>readSnapshot(client,issuer,market,opts);

/** Bounded retries of the memory reader before it gives up on a stream that keeps publishing. */
const SNAPSHOT_TRIES=5;
/**
 * company_read_snapshot over memoryFactsDb: readFacts + filings with mapping_gen > 0 and available by asOf, factCount over ok rows of the filing's generation.
 * memoryFactsDb serialises its calls, so the facts envelope and the later sync captures of filings/facts could straddle a queued publish; the read is
 * repeated until the state_rev before the read, in the envelope and after capturing filings all agree (else CompanyDbError('internal','snapshot_unstable')).
 */
export function memorySnapshotReader(facts:MemoryFactsDb):SnapshotReader{
 const revOf=(issuer:string,market:Market)=>facts.scope().find(s=>s.issuer_id===issuer&&s.market===market)?.state_rev??0;
 return async(issuer,market,o)=>{
  for(let attempt=0;attempt<SNAPSHOT_TRIES;attempt++){
   const start=revOf(issuer,market);
   const known=[...new Set(facts.facts().filter(f=>f.issuer_id===issuer&&f.market===market).map(f=>f.concept))].sort();
   const concepts=o.concepts??known;
   const env=concepts.length
    ?await facts.readFacts(issuer,market,{concepts,asOf:o.asOf,from:o.from??undefined,to:o.to??undefined,history:o.history,limit:o.limit})
    :{stateRev:revOf(issuer,market),rows:[],truncated:false};
   const mine=facts.facts().filter(f=>f.issuer_id===issuer&&f.market===market);
   const filings=facts.filings().filter(g=>g.issuer_id===issuer&&g.market===market&&g.mapping_gen>0&&g.available_date<=o.asOf)
    .sort((a,b)=>a.available_date<b.available_date?1:a.available_date>b.available_date?-1:a.filing_id<b.filing_id?-1:a.filing_id>b.filing_id?1:0);
   if(start!==env.stateRev||revOf(issuer,market)!==start)continue;
   return {...env,filings:filings.map(g=>filingSummaryOf(g,mine.filter(f=>f.filing_id===g.filing_id&&f.status==='ok'&&f.mapping_gen===g.mapping_gen&&f.available_date<=o.asOf).length))};
  }
  throw new CompanyDbError('internal','snapshot_unstable');
 };
}
