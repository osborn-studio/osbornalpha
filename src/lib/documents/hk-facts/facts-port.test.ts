// src/lib/documents/hk-facts/facts-port.test.ts
// memoryHkFactsPort runs the shared port contract (spec §7.7, §11.1) over memoryFactsDb +
// memoryDocumentsDb, plus the HK helpers that keep the 'HK' cast inside facts-port.ts.
import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {memoryDocumentsDb} from '../memory-documents-db';
import {HK_EXTRACTOR_REF,HK_PUB_GEN} from '../types';
import {HK_MARKET,evaluateHkFactRules,memoryHkFactsPort,planHkFactWrites,sqlError,supabaseHkFactsPort,toFilingInsert} from './facts-port';
import {hkFactsPortContract} from './facts-port-contract';

hkFactsPortContract('memoryHkFactsPort contract',async()=>{
 const facts=memoryFactsDb();const docs=memoryDocumentsDb();
 return {port:memoryHkFactsPort(facts,docs),docs,tables:facts.tables,
  issuer:async()=>randomUUID(),batch:async()=>randomUUID(),user:async()=>randomUUID(),
  expireHkLease:async iss=>{facts.expireLease(iss,HK_MARKET);}};
});

describe('HK helpers of facts-port.ts',()=>{
 const filing={filing_id:randomUUID(),issuer_id:randomUUID(),source:'hkex' as const,origin:'hkex' as const,formType:'annual' as const,fiscalYear:2025,fiscalPeriod:'FY' as const,periodEnd:'2025-12-31',availableDate:'2026-03-20',sourceRef:'hkex:2026032000001_c:v1',url:null};
 it('toFilingInsert keeps the HK market, source and origin strings at runtime',()=>{
  expect(toFilingInsert(filing)).toEqual({filing_id:filing.filing_id,issuer_id:filing.issuer_id,sourceRef:filing.sourceRef,market:'HK',source:'hkex',origin:'hkex',formType:'annual',fiscalYear:2025,fiscalPeriod:'FY',periodEnd:'2025-12-31',availableDate:'2026-03-20',url:null});
 });
 it('planHkFactWrites plans with market HK (the spec-2 planner unchanged)',()=>{
  const plan=planHkFactWrites({existing:[],openConflicts:[],filingCandidates:[toFilingInsert(filing)],filings:new Map([[filing.sourceRef,filing.filing_id]]),issuerId:filing.issuer_id,mappingGen:HK_PUB_GEN,mappingVersion:HK_EXTRACTOR_REF,
   candidates:[{concept:'revenue',sourceConcept:'收益',statement:'IS',periodStart:'2025-01-01',periodEnd:'2025-12-31',duration:'12M',value:'1234000',unit:'CNY',consolidation:'consolidated',filingRef:filing.sourceRef,rawHash:'hkex:x'}]});
  expect(plan.inserts).toHaveLength(1);
  expect(plan.inserts[0]).toMatchObject({market:'HK',filing_id:filing.filing_id,mapping_gen:HK_PUB_GEN,value:'1234000',available_date:'2026-03-20'});
  expect(plan.counts).toMatchObject({inserted:1,quarantined:0});
 });
 it('evaluateHkFactRules runs identity_bs on HK rows (exact decimals)',()=>{
  const base={fact_id:'',issuer_id:filing.issuer_id,market:HK_MARKET,filing_id:filing.filing_id,source_concept:'x',statement:'BS' as const,period_start:null,period_end:'2025-12-31',duration:'INSTANT' as const,unit:'HKD',consolidation:'consolidated' as const,available_date:'2026-03-20',mapping_gen:HK_PUB_GEN,mapping_version:HK_EXTRACTOR_REF,raw_hash:'h'};
  const rows=[{...base,fact_id:randomUUID(),concept:'total_assets',value:'2000'},{...base,fact_id:randomUUID(),concept:'total_liabilities',value:'800'},{...base,fact_id:randomUUID(),concept:'equity_total',value:'1000'}];
  const out=evaluateHkFactRules({newRows:rows,okRows:[],sourceRefOf:new Map([[filing.filing_id,filing.sourceRef]]),issuerId:filing.issuer_id,mappingGen:HK_PUB_GEN});
  expect(out.quarantine.map(q=>q.reason)).toEqual(['identity_bs']);
 });
});

/** A PostgREST stand-in: select/eq/order/range/limit over fixed rows, never returning more than `cap` rows per request (max_rows). */
function cappedClient(all:{role:string;citation_id:string}[],cap:number,seen:number[]){
 return {from:(table:string)=>{
  expect(table).toBe('fact_citations');
  let offset=0,limit=Infinity;
  const b:Record<string,unknown>={
   select:()=>b,eq:()=>b,order:()=>b,limit:(n:number)=>{limit=n;return b;},range:(a:number,z:number)=>{offset=a;limit=z-a+1;return b;},
   then:(ok:(v:unknown)=>unknown)=>{const page=all.slice(offset,offset+Math.min(limit,cap));seen.push(page.length);return Promise.resolve({data:page,error:null}).then(ok);},
  };
  return b;
 }};
}
describe('supabaseHkFactsPort.citationsOfFact (F4: PostgREST row cap)',()=>{
 const links=Array.from({length:2300},(_,i)=>({role:'period',citation_id:`c${String(i).padStart(5,'0')}`}));
 for(const cap of [1000,100]){
  it(`returns every link when the server caps a request at ${cap} rows`,async()=>{
   const seen:number[]=[];
   const port=supabaseHkFactsPort(cappedClient(links,cap,seen) as never);
   const got=await port.citationsOfFact(randomUUID());
   expect(got).toHaveLength(2300);
   expect(got.map(x=>x.citation_id)).toEqual(links.map(x=>x.citation_id));
   expect(seen.every(n=>n<=cap)).toBe(true);
  });
 }
});
describe('sqlError (carries the SQL detail like the memory port)',()=>{
 it('uses the detail as the message for known codes and keeps unknown errors as they are',()=>{
  const e=sqlError({message:'evidence_incomplete',code:'P0001',detail:'unit:abc'});
  expect([e.code,e.message]).toEqual(['evidence_incomplete','unit:abc']);
  expect(sqlError({message:'invalid_citation',code:'22023',details:'role'}).message).toBe('role');
  expect(sqlError({message:'boom',code:'XX000',detail:'x'}).message).toBe('boom');
  expect(sqlError({message:'stale_plan',code:'P0001'}).message).toBe('stale_plan');
 });
});
