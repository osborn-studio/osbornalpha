// src/lib/macro/testing/seed.ts
// Test-only seeding over the public MacroDb contract (no backdoor into memory state). Shared by the
// snapshots, read-api, views, replay and route tests. Never imported by production code.
// 第 4 稿 P1-2: seeds write NATIVE inputs only (the SQL refuses native rows on derived series) and produce every
// derived row through Task 6's deriveAndWrite — the same derive path cron and ingest use — so derived rows carry
// derived_from / transform and their provenance is their ancestors' retrievals.
import {memoryTableClient} from '../../db/memory-table-client';
import {CATALOG_VERSION,MACRO_CATALOG,catalogById} from '../catalog';
import type {MacroDb} from '../db';
import type {MemoryMacroDb} from '../memory-db';
import {subtract} from '../decimal';
import {deriveAndWrite,derivedOf} from '../ingest';
import {shiftMonthEnd} from '../periods';
import {MACRO_RULES_VERSION} from '../quality';
import type {Region} from '../types';

export const SEED_BATCH='00000000-0000-4000-8000-0000000000b1';
export const SEED_FETCHED_AT='2026-11-01T05:30:00.000Z';
/** The derive clock: October 2026 is a completed month (month_end needs a later observation, here 2026-11-02). */
export const SEED_NOW=new Date('2026-11-06T06:00:00.000Z');
export interface SeedPoint{series_id:string;period_end:string;value_text:string;revisable?:boolean}
export interface Seeded{ids:Map<string,string>;retrievalId:string;sha256:string}
let seq=0;
export async function seedCatalog(db:MacroDb):Promise<void>{await db.upsertCatalog(MACRO_CATALOG,CATALOG_VERSION,MACRO_RULES_VERSION);}
export async function seedRetrieval(db:MacroDb,opts:{sha256?:string;fetchedAt?:string;batchId?:string}={}):Promise<{retrievalId:string;sha256:string}>{
 const sha256=opts.sha256??(++seq).toString(16).padStart(64,'0');
 const retrievalId=await db.putRetrieval(
  {sha256,object_path:`fred_csv/${sha256}.csv`,adapter:'fred_csv',content_type:'text/csv',byte_length:1},
  {fetch_url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=TEST',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:opts.fetchedAt??SEED_FETCHED_AT,batch_id:opts.batchId??SEED_BATCH,tool_versions:{seed:'1'}});
 return {retrievalId,sha256};
}
/** Index points whose derived yoy (decimal.ts::yoyPct) is exactly `yoy`: base 100 one year earlier, 100 + yoy at the period. */
export function yoyPoints(indexId:string,rows:readonly (readonly [string,string])[]):SeedPoint[]{
 return rows.flatMap(([periodEnd,yoy])=>[{series_id:indexId,period_end:shiftMonthEnd(periodEnd,-12),value_text:'100'},{series_id:indexId,period_end:periodEnd,value_text:subtract(yoy,'-100')}]);
}
/**
 * Writes native rows under one fresh retrieval, then runs deriveAndWrite for every touched region in the same batch.
 * Returns `${series_id}|${period_end}` → current observation id for the touched native series and every derived series
 * of those regions. Throws on any write conflict, quarantine or derive error (a seed must be clean).
 */
export async function seedPoints(db:MacroDb,points:SeedPoint[],opts:{fetchedAt?:string;batchId?:string}={}):Promise<Seeded>{
 // The memory twin writes only into a declared running batch and publishes only finished ones: the default SEED_BATCH runs while seeding
 // and is success afterwards; a caller-supplied batch keeps whatever status the test declared (open-batch tests leave it running).
 const twin=db as Partial<MemoryMacroDb>;
 if(opts.batchId===undefined)twin.setBatchStatus?.(SEED_BATCH,'running');
 try{return await seedPointsIn(db,points,opts);}
 finally{if(opts.batchId===undefined)twin.setBatchStatus?.(SEED_BATCH,'success');}
}
async function seedPointsIn(db:MacroDb,points:SeedPoint[],opts:{fetchedAt?:string;batchId?:string}):Promise<Seeded>{
 const fetchedAt=opts.fetchedAt??SEED_FETCHED_AT;const batchId=opts.batchId??SEED_BATCH;
 for(const p of points){const d=catalogById(p.series_id);if(!d||d.derive||d.aliasOf)throw new Error(`seed_not_native:${p.series_id}`);}
 const {retrievalId,sha256}=await seedRetrieval(db,{fetchedAt,batchId});
 const res=await db.writeObservations(batchId,'seed',points.map((p,i)=>({series_id:p.series_id,period_end:p.period_end,value_text:p.value_text,
  available_at:fetchedAt,revisable:p.revisable??catalogById(p.series_id)!.revisionPolicy==='revisable',retrieval_id:retrievalId,locator:{kind:'csv_row' as const,line:i+2,column:1}})));
 if(res.conflicts.length)throw new Error(`seed_conflict:${JSON.stringify(res.conflicts)}`);
 const regions=[...new Set(points.map(p=>catalogById(p.series_id)!.region))] as Region[];
 const deps={db,evidence:{put:async()=>{throw new Error('seed_no_evidence');}},tables:memoryTableClient({dq_quarantine:['id']}),codeVersion:'seed',now:()=>SEED_NOW};
 for(const region of regions){
  const rec=await deriveAndWrite(deps,region,batchId);
  if(rec.errors.length||rec.counts.failed||rec.counts.quarantined)throw new Error(`seed_derive:${region}:${JSON.stringify(rec)}`);
 }
 const ids=new Map<string,string>();
 const read=[...new Set([...points.map(p=>p.series_id),...regions.flatMap(r=>derivedOf(r).map(d=>d.id))])];
 // eligibleHistory with includeBatch: public reads hide rows of a batch that is still running (the open-batch tests seed into one)
 for(const id of read)for(const row of await db.eligibleHistory(id,{includeBatch:batchId,maxRows:5000}))ids.set(`${row.series_id}|${row.period_end}`,row.observation_id);
 return {ids,retrievalId,sha256};
}
const rowsOf=(seriesId:string,rows:readonly (readonly [string,string])[]):SeedPoint[]=>rows.map(([period_end,value_text])=>({series_id:seriesId,period_end,value_text}));
/**
 * The Task 10 US fixture as NATIVE inputs; deriveAndWrite turns them into the regime inputs with the hand-computed values:
 * US_DFF / US_DGS10 / US_DTWEXBGS month ends (Jul–Oct 2026; one November day completes October), US_CPI_YOY Jun–Sep
 * 2.7 / 2.7 / 2.6 / 2.9, US_PPI_FD_YOY Aug–Sep 3.1 / 3.4 (index pairs, base 100), US_UNRATE native.
 */
export const US_FIXTURE:SeedPoint[]=[
 ...rowsOf('US_FEDFUNDS_EFF_D',[['2026-07-31','4.33'],['2026-08-31','4.33'],['2026-09-30','4.33'],['2026-10-30','4.33'],['2026-11-02','4.33']]),
 ...rowsOf('US_DGS10_D',[['2026-07-31','3.95'],['2026-08-31','4.05'],['2026-09-30','4.15'],['2026-10-30','4.25'],['2026-11-02','4.3']]),
 ...rowsOf('US_DTWEXBGS_D',[['2026-07-31','122'],['2026-08-31','123'],['2026-09-30','125'],['2026-10-30','126.5'],['2026-11-02','126']]),
 ...yoyPoints('US_CPI_INDEX',[['2026-06-30','2.7'],['2026-07-31','2.7'],['2026-08-31','2.6'],['2026-09-30','2.9']]),
 ...rowsOf('US_UNRATE',[['2026-06-30','3.8'],['2026-07-31','3.9'],['2026-08-31','4'],['2026-09-30','4.1']]),
 ...yoyPoints('US_PPI_FD_INDEX',[['2026-08-31','3.1'],['2026-09-30','3.4']]),
];
