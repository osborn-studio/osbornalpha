// src/lib/company/dcf-seed.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('./evidence-gate',async(orig)=>({...(await orig<typeof import('./evidence-gate')>()),applyGate:(await import('./route-test-kit')).fakeApplyGate}));
import {seedFromFacts} from './dcf-seed';
import {END,cnRows,inst,usRows} from './dcf-seed.test-rows';
import {CN,FIL_CN_LINKED,cnSummary,emptySnapshot,record,summary} from './route-test-kit';
import type {FactRow} from '@/lib/facts/types';
import type {PdfLocator} from './types';

const evidenceFor=(rows:FactRow[])=>new Map(rows.map(r=>[r.fact_id,record(r.fact_id)]));
const pdfFor=(rows:FactRow[])=>new Map<string,PdfLocator>(rows.map(r=>[r.fact_id,{page:1,table:'t',row:'r',column:'c',documentUrl:'https://static.cninfo.com.cn/x.PDF'}]));
const linked=cnSummary({filingId:FIL_CN_LINKED,citation:'linked',documentUrl:'https://static.cninfo.com.cn/x.PDF'});
const COMMON={shareClass:'common',openSecuritiesInMarket:1};

describe('seedFromFacts (spec §9.1, §0 #65)',()=>{
 it('US full seed: one envelope, divisor 1e6 applied identically, fact ids per leaf, us_standard net debt',()=>{
  const rows=usRows();
  const s=seedFromFacts(emptySnapshot({stateRev:3,rows,filings:[summary()]}),COMMON,{market:'US',asOf:'2026-11-06',evidence:evidenceFor(rows),pdf:new Map(),admin:false});
  expect(s.meta).toEqual({currency:'USD',currencyUnit:'百万',divisor:'1000000'});
  expect(s.seed.baseRevenue).toBeCloseTo(383285,6);
  expect(s.seed.grossMarginPct).toBeCloseTo(0.44131,4);
  expect(s.seed.sharesDiluted).toBeCloseTo(15550.061,6);
  expect(s.seed.netDebt).toBeCloseTo(75138,6);                        // 9822e6 + 95281e6 − 29965e6
  expect(s.provenance['netDebt']).toMatchObject({source:'fact',basis:'us_standard',metric:'borrowings_total',divisor:'1000000',periodEnd:END});
  expect(s.provenance['netDebt']!.factIds).toHaveLength(3);
  expect(s.provenance['sharesDiluted']).toMatchObject({basis:'shares_outstanding',divisor:'1000000'});
  expect(s.provenance['revenueLines[0].baseRevenue']).toMatchObject({divisor:'1000000',factIds:[rows[0].fact_id]});
  expect(new Set((['revenueLines[0].baseRevenue','sharesDiluted','netDebt'] as const).map(k=>s.provenance[k]!.divisor)).size).toBe(1);
  expect(s.missing).toEqual([]);
  expect(Object.keys(s.evidence).length).toBeGreaterThan(0);
 });
 it('share basis: unknown / ADR / preferred / H / other and a second open security → share_basis_unverified; common and A seed',()=>{
  const rows=usRows();const snap=emptySnapshot({rows,filings:[summary()]});const o={market:'US' as const,asOf:'2026-11-06',evidence:evidenceFor(rows),pdf:new Map(),admin:false};
  for(const shareClass of ['unknown','ADR','preferred','H','other'])
   expect(seedFromFacts(snap,{shareClass,openSecuritiesInMarket:1},o).missing).toEqual([{field:'sharesDiluted',reason:'share_basis_unverified'}]);
  expect(seedFromFacts(snap,{shareClass:'common',openSecuritiesInMarket:2},o).missing).toEqual([{field:'sharesDiluted',reason:'share_basis_unverified'}]);
  expect(seedFromFacts(snap,{shareClass:'A',openSecuritiesInMarket:1},o).seed.sharesDiluted).toBeDefined();
 });
 it('multi-class shares, period mismatch and unit mismatch never seed',()=>{
  const base=usRows();
  const multi=[...base,inst('shares_outstanding','100',{unit:'shares_classB'})];
  expect(seedFromFacts(emptySnapshot({rows:multi,filings:[summary()]}),COMMON,{market:'US',asOf:'2026-11-06',evidence:evidenceFor(multi),pdf:new Map(),admin:false}).missing).toContainEqual({field:'sharesDiluted',reason:'multi_class_shares'});
  const shifted=base.map(r=>r.concept==='cash'?{...r,period_end:'2023-07-01'}:r);
  expect(seedFromFacts(emptySnapshot({rows:shifted,filings:[summary()]}),COMMON,{market:'US',asOf:'2026-11-06',evidence:evidenceFor(shifted),pdf:new Map(),admin:false}).missing).toContainEqual({field:'netDebt',reason:'period_mismatch'});
  const eur=base.map(r=>r.concept==='cash'?{...r,unit:'EUR'}:r);
  expect(seedFromFacts(emptySnapshot({rows:eur,filings:[summary()]}),COMMON,{market:'US',asOf:'2026-11-06',evidence:evidenceFor(eur),pdf:new Map(),admin:false}).missing).toContainEqual({field:'netDebt',reason:'unit_mismatch'});
 });
 it('every fact leaf passes the gate: missing cash evidence → netDebt evidence_incomplete, other leaves still seed',()=>{
  const rows=usRows();const ev=evidenceFor(rows);ev.delete(rows.find(r=>r.concept==='cash')!.fact_id);
  const s=seedFromFacts(emptySnapshot({rows,filings:[summary()]}),COMMON,{market:'US',asOf:'2026-11-06',evidence:ev,pdf:new Map(),admin:false});
  expect(s.missing).toEqual([{field:'netDebt',reason:'evidence_incomplete'}]);
  expect(s.seed.netDebt).toBeUndefined();expect(s.seed.baseRevenue).toBeDefined();
 });
 it('CN with injected PDF locators: revenue_operating, divisor 1e8, net debt = borrowings_total − monetary_funds with the CN basis',()=>{
  const rows=cnRows();
  const s=seedFromFacts(emptySnapshot({rows,filings:[linked]}),{shareClass:'A',openSecuritiesInMarket:1},{market:'CN',asOf:'2026-11-06',evidence:evidenceFor(rows),pdf:pdfFor(rows),admin:false});
  expect(s.missing).toEqual([]);
  expect(s.meta).toEqual({currency:'CNY',currencyUnit:'亿',divisor:'100000000'});
  expect(s.seed.baseRevenue).toBeCloseTo(1476.93605,4);
  expect(s.seed.sharesDiluted).toBeCloseTo(12.561978,6);
  expect(s.seed.netDebt).toBeCloseTo(-693.21263,4);
  expect(s.provenance['netDebt']!.basis).toBe('cn_borrowings_less_monetary_funds_incl_restricted');
  expect(s.provenance['netDebt']!.factIds).toContain(rows.find(r=>r.concept==='monetary_funds')!.fact_id);
  expect(s.provenance['revenueLines[0].baseRevenue']!.factIds).toEqual([rows[0].fact_id]);
  expect(rows[0].concept).toBe('revenue_operating');
 });
 it('CN without PDF locators (public): no fact seed at all, reason citation_pending',()=>{
  const rows=cnRows();
  const s=seedFromFacts(emptySnapshot({rows,filings:[linked]}),{shareClass:'A',openSecuritiesInMarket:1},{market:'CN',asOf:'2026-11-06',evidence:evidenceFor(rows),pdf:new Map(),admin:false});
  expect(Object.keys(s.provenance)).toEqual([]);
  expect(s.missing.map(m=>m.reason)).toEqual(['citation_pending','citation_pending','citation_pending','citation_pending']);
 });
 it('no 12M revenue → every leaf no_fact; CN issuer id comes from the kit',()=>{
  expect(CN).toBeTruthy();
  const s=seedFromFacts(emptySnapshot(),COMMON,{market:'US',asOf:'2026-11-06',evidence:new Map(),pdf:new Map(),admin:false});
  expect(s.missing.map(m=>m.field)).toEqual(['revenueLines[0].baseRevenue','grossMarginPct','sharesDiluted','netDebt']);
  expect(s.meta).toEqual({currency:null,currencyUnit:null,divisor:null});
 });
});
