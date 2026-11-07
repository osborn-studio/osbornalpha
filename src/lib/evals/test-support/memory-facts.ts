// src/lib/evals/test-support/memory-facts.ts
// Test support (not a test file). publishFilings writes filings + facts into a memoryFactsDb through the
// real run lifecycle (scope → lease → beginRun → stageFilings → stageFacts → publishRun → release), so the
// rows a test reads carry exactly the SQL rules for mapping_gen, disclosure_seq, is_current, is_revision.
// seedZzeva publishes the three filings the projection / route-equivalence tests share: a 10-K, a 10-K/A
// revising FY2024 revenue by 1, and a 10-Q.
import {randomUUID} from 'node:crypto';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import type {Duration,FactInsert,FilingInsert,FormType,Market,Statement} from '../../facts/types';

export interface SeedFact{concept:string;statement?:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit?:string;source_concept?:string}
export interface SeedFiling{sourceRef:string;formType?:FormType;availableDate:string;periodEnd?:string|null;facts:SeedFact[]}
export interface Published{filingIds:Map<string,string>;factIds:string[]}

/** One published run per call; reconcileScope is idempotent for an unchanged scope row. */
export async function publishFilings(db:MemoryFactsDb,issuer:string,filings:SeedFiling[],market:Market='US'):Promise<Published>{
 await db.reconcileScope(market,[{issuer_id:issuer,reasons:['f6-test'],priority:10,fetch_key:issuer}]);
 const batch=randomUUID();
 if(!await db.claimLease(issuer,market,batch,600))throw new Error('seed: lease not claimed');
 const run=await db.beginRun(issuer,market,batch,1);
 const inserts=filings.map((f):FilingInsert=>({filing_id:randomUUID(),issuer_id:issuer,sourceRef:f.sourceRef,market,source:'edgar',origin:'sec',formType:f.formType??'10-K',fiscalYear:null,fiscalPeriod:null,periodEnd:f.periodEnd??null,availableDate:f.availableDate,url:null}));
 const ids=await db.stageFilings(run,inserts);
 const facts=filings.flatMap(f=>f.facts.map((x):FactInsert=>({fact_id:randomUUID(),issuer_id:issuer,market,filing_id:ids.get(f.sourceRef)!,concept:x.concept,source_concept:x.source_concept??x.concept,
  statement:x.statement??(x.duration==='INSTANT'?'BS':'IS'),period_start:x.period_start,period_end:x.period_end,duration:x.duration,value:x.value,unit:x.unit??'USD',consolidation:'consolidated',
  available_date:f.availableDate,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:randomUUID()})));
 await db.stageFacts(run,facts);
 await db.publishRun(run,[...new Set(ids.values())]);
 await db.releaseLease(issuer,market,batch,'success','2030-01-01T00:00:00.000Z');
 return {filingIds:ids,factIds:facts.map(f=>f.fact_id)};
}

export const ZZEVA_ISSUER='11111111-1111-4111-8111-111111111111';
export const ZZEVA_CIK='9990601';
export const SRC_A='0009990601-24-000001',SRC_B='0009990601-25-000002',SRC_C='0009990601-25-000003';

export async function seedZzeva(db:MemoryFactsDb):Promise<void>{
 await publishFilings(db,ZZEVA_ISSUER,[{sourceRef:SRC_A,availableDate:'2024-11-01',periodEnd:'2024-09-28',facts:[
  {concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value:'391035000000'},
  {concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value:'383285000000'},
  {concept:'gross_profit',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value:'180683000000'},
  {concept:'cash',period_start:null,period_end:'2024-09-28',duration:'INSTANT',value:'29943000000'}]}]);
 await publishFilings(db,ZZEVA_ISSUER,[{sourceRef:SRC_B,formType:'10-K/A',availableDate:'2025-01-15',periodEnd:'2024-09-28',facts:[
  {concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value:'391035000001'}]}]);
 await publishFilings(db,ZZEVA_ISSUER,[{sourceRef:SRC_C,formType:'10-Q',availableDate:'2025-02-01',periodEnd:'2024-12-28',facts:[
  {concept:'revenue',period_start:'2024-09-29',period_end:'2024-12-28',duration:'3M',value:'124300000000'},
  {concept:'cash',period_start:null,period_end:'2024-12-28',duration:'INSTANT',value:'30299000000'}]}]);
}
