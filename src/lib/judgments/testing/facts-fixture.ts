// src/lib/judgments/testing/facts-fixture.ts
// Test helper (not a test file): publishes filings + facts into a memoryFactsDb through the real
// FactsDb lifecycle (scope → lease → run → stage → [quarantine] → publish → release) with
// deterministic ids (uuidV8 of the source refs), so input builders, replay fixtures and their
// reconciliation see byte-identical rows on every run (call db.setNow(FIXED_NOW) first so
// created_at is fixed too). aaplParse() parses the plan-2 recorded EDGAR fixture
// (spec §14.1 inputs.test.ts: fixtures/edgar/CIK0000320193.trimmed.json).
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {quarantine} from '@/lib/dq/quarantine';
import {MAPPING_VERSION} from '@/lib/facts/concepts';
import type {MemoryFactsDb} from '@/lib/facts/memory-facts-db';
import {parseCompanyFacts} from '@/lib/facts/providers/edgar-companyfacts';
import {snapshotOf} from '@/lib/facts/providers/shared';
import type {Duration,FactCandidate,FactInsert,FilingCandidate,FormType,ParseResult,Statement} from '@/lib/facts/types';
import {uuidV8} from '@/lib/judgments/uuid-v8';
import type {FactsMarket} from '../types';

export const AAPL_ISSUER='00000000-0000-4000-8000-000000320193';
export const FIXED_NOW='2026-11-06T00:00:00.000Z';
const hex=(s:string)=>createHash('sha256').update(s).digest('hex');
export const seedFilingId=(issuer:string,sourceRef:string)=>uuidV8(hex(`filing:${issuer}:${sourceRef}`));
export const seedFactId=(issuer:string,filingRef:string,rawHash:string)=>uuidV8(hex(`fact:${issuer}:${filingRef}:${rawHash}`));

export function filingCandidate(o:{sourceRef:string;availableDate:string;periodEnd:string|null;market?:FactsMarket;formType?:FormType;fiscalYear?:number|null;fiscalPeriod?:FilingCandidate['fiscalPeriod']}):FilingCandidate{
 const market=o.market??'US';
 return {sourceRef:o.sourceRef,market,source:market==='US'?'edgar':'tushare',origin:market==='US'?'sec':'sse',formType:o.formType??(market==='US'?'10-Q':'q1'),fiscalYear:o.fiscalYear??null,fiscalPeriod:o.fiscalPeriod??null,periodEnd:o.periodEnd,availableDate:o.availableDate,url:null};
}
export function factCandidate(o:{filingRef:string;concept:string;periodStart:string|null;periodEnd:string;duration:Duration;value:string;unit?:string;statement?:Statement;rawHash?:string}):FactCandidate{
 return {concept:o.concept,sourceConcept:`test:${o.concept}`,statement:o.statement??(o.duration==='INSTANT'?'BS':'IS'),periodStart:o.periodStart,periodEnd:o.periodEnd,duration:o.duration,value:o.value,unit:o.unit??'USD',consolidation:'consolidated',filingRef:o.filingRef,rawHash:o.rawHash??`${o.filingRef}|${o.concept}|${o.periodStart??''}|${o.periodEnd}|${o.value}`};
}
export interface PublishInput{issuer:string;market:FactsMarket;filings:FilingCandidate[];facts:FactCandidate[];quarantineRawHashes?:string[];publish?:boolean}
/** One run for the issuer. publish:false leaves the run staged (its facts stay non-ok); a later publishFacts call for the same issuer abandons it (beginRun). */
export async function publishFacts(db:MemoryFactsDb,o:PublishInput):Promise<{runId:string;filingIds:Map<string,string>;factIds:Map<string,string>}>{
 await db.reconcileScope(o.market,[{issuer_id:o.issuer,reasons:['test'],priority:10,fetch_key:o.issuer}]);
 const batch=randomUUID();
 if(!await db.claimLease(o.issuer,o.market,batch,3600))throw new Error(`seed_lease_busy:${o.issuer}`);
 const runId=await db.beginRun(o.issuer,o.market,batch,1);
 const filingIds=await db.stageFilings(runId,o.filings.map(f=>({...f,filing_id:seedFilingId(o.issuer,f.sourceRef),issuer_id:o.issuer})));
 const byRef=new Map(o.filings.map(f=>[f.sourceRef,f] as const));
 const factIds=new Map<string,string>();
 const rows:FactInsert[]=o.facts.map(c=>{
  const filingId=filingIds.get(c.filingRef);const f=byRef.get(c.filingRef);
  if(!filingId||!f)throw new Error(`seed_unknown_filing:${c.filingRef}`);
  const fact_id=seedFactId(o.issuer,c.filingRef,c.rawHash);factIds.set(c.rawHash,fact_id);
  return {fact_id,issuer_id:o.issuer,market:o.market,filing_id:filingId,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,duration:c.duration,value:c.value,unit:c.unit,consolidation:'consolidated',available_date:f.availableDate,mapping_gen:1,mapping_version:MAPPING_VERSION,raw_hash:c.rawHash};
 });
 await db.stageFacts(runId,rows);
 if(o.quarantineRawHashes&&o.quarantineRawHashes.length>0){
  const item=await quarantine(db.tables,{dataset:`facts.${o.market.toLowerCase()}`,table:'financial_facts',naturalKey:`${o.issuer}:seed:${runId}`,reasonCode:'identity_bs',batchId:batch});
  await db.quarantineFacts(runId,o.quarantineRawHashes.map(h=>{const id=factIds.get(h);if(!id)throw new Error(`seed_unknown_raw_hash:${h}`);return id;}),item);
 }
 if(o.publish!==false)await db.publishRun(runId,[...new Set(filingIds.values())]);
 await db.releaseLease(o.issuer,o.market,batch,'success','2100-01-01T00:00:00.000Z');
 return {runId,filingIds,factIds};
}
export function aaplParse(sinceYear=2022):ParseResult{
 const bytes=new Uint8Array(readFileSync(new URL('../../facts/fixtures/edgar/CIK0000320193.trimmed.json',import.meta.url)));
 return parseCompanyFacts(snapshotOf(bytes,{source:'edgar'}),{sinceYear,today:new Date(FIXED_NOW)});
}
