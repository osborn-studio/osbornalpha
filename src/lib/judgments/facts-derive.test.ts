// src/lib/judgments/facts-derive.test.ts
import {describe,expect,it} from 'vitest';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics} from '@/lib/facts/derive';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import type {FactsDb} from '@/lib/facts/types';
import {deriveMetricsAsOf} from './facts-derive';
import {JudgmentError} from './errors';
import {FIXED_NOW,factCandidate,filingCandidate,publishFacts} from './testing/facts-fixture';

const ISSUER='00000000-0000-4000-8000-0000000000a1';
async function seeded(){
 const db=memoryFactsDb();db.setNow(FIXED_NOW);
 await publishFacts(db,{issuer:ISSUER,market:'US',filings:[filingCandidate({sourceRef:'q1',availableDate:'2024-05-01',periodEnd:'2024-03-31'}),filingCandidate({sourceRef:'q2',availableDate:'2024-08-01',periodEnd:'2024-06-30'})],facts:[
  factCandidate({filingRef:'q1',concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'1000'}),
  factCandidate({filingRef:'q1',concept:'gross_profit',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'400'}),
  factCandidate({filingRef:'q2',concept:'revenue',periodStart:'2024-04-01',periodEnd:'2024-06-30',duration:'3M',value:'1200'}),
  factCandidate({filingRef:'q2',concept:'gross_profit',periodStart:'2024-04-01',periodEnd:'2024-06-30',duration:'3M',value:'600'})]});
 return db;
}
describe('deriveMetricsAsOf (spec §12.2 S03: composed like GET /api/facts/[ticker]/metrics?asOf=)',()=>{
 it('derives over the cutoff envelope with basedOnRev = state_rev and returns the envelope',async()=>{
  const db=await seeded();
  const r=await deriveMetricsAsOf(db,ISSUER,'US','2024-06-30',FORMULA_VERSION);
  expect(r.metrics.filter(m=>m.metric==='gross_margin').map(m=>[m.period_end,m.value])).toEqual([['2024-03-31','0.4']]);
  const env=await db.readFacts(ISSUER,'US',{concepts:[...DERIVE_CONCEPTS.US],asOf:'2024-06-30',history:true});
  expect(r.envelope).toEqual(env);
  expect(r.metrics).toEqual(deriveMetrics(env.rows,{market:'US',asOf:'2024-06-30',basedOnRev:env.stateRev}));
  expect(r.metrics.every(m=>m.based_on_rev===env.stateRev&&m.as_of==='2024-06-30')).toBe(true);
  const later=await deriveMetricsAsOf(db,ISSUER,'US','2024-08-01',FORMULA_VERSION);
  expect(later.metrics.filter(m=>m.metric==='gross_margin').map(m=>m.period_end)).toEqual(['2024-03-31','2024-06-30']);
 });
 it('refuses another formula version, a truncated envelope and a malformed date',async()=>{
  const db=await seeded();
  await expect(deriveMetricsAsOf(db,ISSUER,'US','2024-08-01','facts-derive/0.9')).rejects.toMatchObject({code:'unsupported_formula_version'});
  const truncated:Pick<FactsDb,'readFacts'>={readFacts:async()=>({stateRev:3,rows:[],truncated:true})};
  const e=await deriveMetricsAsOf(truncated,ISSUER,'US','2024-08-01',FORMULA_VERSION).catch(x=>x);
  expect(e).toBeInstanceOf(JudgmentError);expect(e.code).toBe('read_truncated');
  await expect(deriveMetricsAsOf(db,ISSUER,'US','2024/08/01',FORMULA_VERSION)).rejects.toThrow(/YYYY-MM-DD/);
 });
});
