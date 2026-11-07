// src/lib/documents/hk-facts/facts-port.test.ts
// memoryHkFactsPort runs the shared port contract (spec §7.7, §11.1) over memoryFactsDb +
// memoryDocumentsDb, plus the HK helpers that keep the 'HK' cast inside facts-port.ts.
import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {memoryDocumentsDb} from '../memory-documents-db';
import {HK_EXTRACTOR_REF,HK_PUB_GEN} from '../types';
import {HK_MARKET,evaluateHkFactRules,memoryHkFactsPort,planHkFactWrites,toFilingInsert} from './facts-port';
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
