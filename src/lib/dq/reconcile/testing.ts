// src/lib/dq/reconcile/testing.ts
// TEST-ONLY helpers for the reconcile unit tests (nothing in src/app imports this file). reconcileTables
// declares the primary keys the in-memory TableClient enforces for the tables the runner and memoryFactsDb
// share; seedPublished drives the real FactsDb API (scope → lease → run → filing → facts → publish →
// release) so seeded rows are exactly what a sync would have published (generation 1, status ok).
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../../db/memory-table-client';
import type {Duration,FactInsert,FormType,Market,Source,Statement} from '../../facts/types';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';

export const reconcileTables=()=>memoryTableClient({dq_quarantine:['id'],dq_reconciliations:['id'],dq_reconcile_cycles:['pair','cycle_id'],dq_reconcile_cursor:['pair','cycle_id','issuer_id','market'],ingest_batches:['batch_id'],dq_freshness:['dataset'],issuers:['issuer_id']});

export interface SeedFact{concept:string;value:string;period_start:string|null;period_end:string;unit?:string;source_concept?:string;statement?:Statement;duration?:Duration}
export async function seedPublished(db:MemoryFactsDb,o:{issuer:string;market:Market;sourceRef:string;availableDate:string;facts:SeedFact[];formType?:FormType;source?:Source;mappingGen?:number}):Promise<{filingId:string;runId:string;factIds:string[]}>{
 const batch=randomUUID();
 if((await db.scopeRows(o.market,[o.issuer])).length===0)await db.reconcileScope(o.market,[{issuer_id:o.issuer,reasons:['test'],priority:1,fetch_key:o.market==='US'?'0000000001':'600000.SH'}]);
 if(!(await db.claimLease(o.issuer,o.market,batch,600)))throw new Error('seed_lease_not_acquired');
 const run=await db.beginRun(o.issuer,o.market,batch,o.mappingGen??1);
 const map=await db.stageFilings(run,[{filing_id:randomUUID(),issuer_id:o.issuer,sourceRef:o.sourceRef,market:o.market,source:o.source??(o.market==='US'?'edgar':'tushare'),origin:o.market==='US'?'sec':'sse',formType:o.formType??(o.market==='US'?'10-K':'annual'),fiscalYear:null,fiscalPeriod:null,periodEnd:null,availableDate:o.availableDate,url:null}]);
 const filingId=map.get(o.sourceRef)!;
 const rows:FactInsert[]=o.facts.map(f=>({fact_id:randomUUID(),issuer_id:o.issuer,market:o.market,filing_id:filingId,concept:f.concept,source_concept:f.source_concept??`us-gaap:${f.concept}`,statement:f.statement??(f.period_start===null?'BS':'IS'),period_start:f.period_start,period_end:f.period_end,duration:f.duration??(f.period_start===null?'INSTANT':'12M'),value:f.value,unit:f.unit??(o.market==='US'?'USD':'CNY'),consolidation:'consolidated',available_date:o.availableDate,mapping_gen:o.mappingGen??1,mapping_version:'facts-map/1',raw_hash:`raw:${o.sourceRef}:${f.concept}:${f.period_end}`}));
 await db.stageFacts(run,rows);
 await db.publishRun(run,[filingId]);
 await db.releaseLease(o.issuer,o.market,batch,'success',new Date(Date.now()+86_400_000).toISOString());
 return {filingId,runId:run,factIds:rows.map(r=>r.fact_id)};
}
