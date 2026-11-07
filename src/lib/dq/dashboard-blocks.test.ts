// src/lib/dq/dashboard-blocks.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {CALENDAR_ROWS_MAX,loadCalendarBlock,loadClaimsBlock,loadReconciliationsByPair} from './dashboard-blocks';
import {RECONCILE_PAIR_IDS} from './reconcile/types';

const NOW=new Date('2026-11-05T08:00:00Z');
const I1='00000000-0000-4000-8000-0000000000d1',I2='00000000-0000-4000-8000-0000000000d2';
const exp=(issuer:string,market:'US'|'CN',period_end:string,disclosure_state:string,p:Record<string,unknown>={})=>({issuer_id:issuer,market,report_kind:market==='US'?'10-Q':'q3',period_end,period_end_estimated:false,deadline_state:'statutory',due_date:null,disclosure_state,detail:{},...p});

describe('loadCalendarBlock',()=>{
 async function seeded(){
  const t=memoryTableClient();
  const rows=[
   exp(I1,'US','2026-06-30','overdue',{due_date:'2026-08-10'}),
   exp(I1,'US','2026-03-31','filed_not_ingested',{due_date:'2026-05-11'}),
   exp(I1,'US','2026-09-30','pending',{due_date:'2026-11-09'}),            // due in 4 days → shown
   exp(I2,'US','2026-09-30','pending',{due_date:'2026-11-20'}),            // due in 15 days → not shown
   exp(I2,'US','2026-06-27','pending',{period_end_estimated:true,deadline_state:'estimated',due_date:'2026-11-12'}),
   exp(I2,'US','2025-12-31','pending',{deadline_state:'no_rule',due_date:null}),
   exp(I1,'CN','2026-09-30','unknown_upstream',{due_date:'2026-10-31'}),
   exp(I1,'CN','2026-06-30','overdue',{due_date:'2026-08-31'}),
   exp(I1,'US','2025-06-30','received',{due_date:'2025-08-11'}),
  ];
  for(const r of rows)await t.insert('dq_filing_expectations',r);
  return t;
 }
 it('counts per market regardless of the filter and lists attention rows in order',async()=>{
  const b=await loadCalendarBlock(await seeded(),undefined,NOW);
  expect(b.overdueByMarket).toEqual({US:1,CN:1});
  expect(b.filedNotIngestedByMarket).toEqual({US:1,CN:0});
  expect(b.unknownUpstreamByMarket).toEqual({US:0,CN:1});
  expect(b.noRuleByMarket).toEqual({US:1,CN:0});
  expect(b.estimatedByMarket).toEqual({US:1,CN:0});
  expect(b.rows.map(r=>[r.market,r.period_end,r.disclosure_state])).toEqual([
   ['US','2026-06-30','overdue'],['CN','2026-06-30','overdue'],['US','2026-03-31','filed_not_ingested'],['US','2026-09-30','pending'],['US','2026-06-27','pending'],['CN','2026-09-30','unknown_upstream']]);
  expect(b.noRuleRows.map(r=>r.period_end)).toEqual(['2025-12-31']);
 });
 it('the market filter narrows rows but not the per-market counts',async()=>{
  const b=await loadCalendarBlock(await seeded(),'CN',NOW);
  expect(b.rows.map(r=>r.market)).toEqual(['CN','CN']);
  expect(b.overdueByMarket).toEqual({US:1,CN:1});
  expect(b.noRuleRows).toEqual([]);
 });
 it('applies the attention order before the limit: dated rows first, ties on the boundary by period end descending',async()=>{
  const t=memoryTableClient();
  const pe=(i:number)=>`${2000+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}-28`;
  for(let i=0;i<60;i++)await t.insert('dq_filing_expectations',exp(`n-${String(i).padStart(3,'0')}`,'CN',pe(i),'unknown_upstream',{due_date:null}));
  for(let i=0;i<60;i++)await t.insert('dq_filing_expectations',exp(`d-${String(i).padStart(3,'0')}`,'CN','2026-09-30','unknown_upstream',{due_date:`2026-10-${String(i%28+1).padStart(2,'0')}`}));
  const rows=(await loadCalendarBlock(t,'CN',NOW)).rows;
  expect(rows).toHaveLength(CALENDAR_ROWS_MAX);
  expect(rows.slice(0,60).every(r=>r.due_date!=null)).toBe(true);
  expect(rows.slice(60).every(r=>r.due_date==null)).toBe(true);
  expect(rows.slice(60).map(r=>r.period_end)).toEqual(Array.from({length:40},(_,k)=>pe(59-k)));   // the 40 newest null-deadline periods, newest first
  const dues=rows.slice(0,60).map(r=>String(r.due_date));
  expect(dues).toEqual([...dues].sort());
 });
 it('caps the attention list',async()=>{
  const t=memoryTableClient();
  for(let i=0;i<150;i++)await t.insert('dq_filing_expectations',exp(`i-${String(i).padStart(3,'0')}`,'US','2026-06-30','overdue',{due_date:'2026-08-10'}));
  expect((await loadCalendarBlock(t,'US',NOW)).rows).toHaveLength(CALENDAR_ROWS_MAX);
 });
});

describe('loadClaimsBlock',()=>{
 it('pending claims newest first with a real total, and securities only for evidence_only issuers',async()=>{
  const t=memoryTableClient();
  await t.insert('issuer_identifier_claims',{id:'c1',issuer_id:I1,op:'evidence_only',status:'pending',created_at:'2026-11-01T00:00:00Z'});
  await t.insert('issuer_identifier_claims',{id:'c2',issuer_id:I2,op:'set_identifier',status:'pending',created_at:'2026-11-02T00:00:00Z'});
  await t.insert('issuer_identifier_claims',{id:'c3',issuer_id:I2,op:'legacy',status:'accepted',created_at:'2026-11-03T00:00:00Z'});
  await t.insert('issuer_securities',{issuer_id:I1,ticker:'OLD',valid_from:'2020-01-01',valid_to:'2026-01-01',valid_from_method:'first_observed',is_primary:true});
  await t.insert('issuer_securities',{issuer_id:I1,ticker:'NEW',valid_from:'2026-01-01',valid_to:null,valid_from_method:'first_observed',is_primary:true});
  await t.insert('issuer_securities',{issuer_id:I2,ticker:'ZZ',valid_from:'2020-01-01',valid_to:null,is_primary:true});
  const b=await loadClaimsBlock(t);
  expect(b.rows.map(r=>r.id)).toEqual(['c2','c1']);
  expect(b.total).toBe(2);
  expect(Object.keys(b.securitiesByIssuer)).toEqual([I1]);
  expect(b.securitiesByIssuer[I1].map(s=>s.ticker)).toEqual(['OLD','NEW']);
 });
});

describe('loadReconciliationsByPair',()=>{
 it('failed count for every registered pair and the latest cycle for cycle pairs only',async()=>{
  const t=memoryTableClient();
  await t.insert('dq_reconciliations',{id:'r1',pair:'us.companyfacts_vs_ixbrl',natural_key:'k1',passed:false,created_at:'2026-11-01T00:00:00Z'});
  await t.insert('dq_reconciliations',{id:'r2',pair:'us.companyfacts_vs_ixbrl',natural_key:'k2',passed:true,created_at:'2026-11-01T00:00:00Z'});
  await t.insert('dq_reconciliations',{id:'r3',pair:'sec.filer_category',natural_key:'k3',passed:false,created_at:'2026-11-01T00:00:00Z'});
  await t.insert('dq_reconcile_cycles',{pair:'us.companyfacts_vs_ixbrl',cycle_id:'a',started_at:'2026-11-01T02:00:00Z',status:'complete',finished_at:'2026-11-01T02:03:00Z'});
  await t.insert('dq_reconcile_cycles',{pair:'us.companyfacts_vs_ixbrl',cycle_id:'b',started_at:'2026-11-04T02:00:00Z',status:'running',finished_at:null});
  const b=await loadReconciliationsByPair(t);
  expect(Object.keys(b)).toEqual([...RECONCILE_PAIR_IDS]);
  expect(b['us.companyfacts_vs_ixbrl']).toEqual({failed:1,lastCycle:{cycle_id:'b',status:'running',finished_at:null}});
  expect(b['sec.filer_category']).toEqual({failed:1,lastCycle:null});
  expect(b['facts.lineage_same_day']).toEqual({failed:0,lastCycle:null});
 });
 it('counts distinct natural keys by their latest row, not raw rows (Task 14c best-effort dedupe)',async()=>{
  const t=memoryTableClient();
  const p='sec.filer_category';
  await t.insert('dq_reconciliations',{id:'a1',pair:p,natural_key:'dup',passed:false,created_at:'2026-11-01T00:00:00Z'});
  await t.insert('dq_reconciliations',{id:'a2',pair:p,natural_key:'dup',passed:false,created_at:'2026-11-02T00:00:00Z'});
  await t.insert('dq_reconciliations',{id:'a3',pair:p,natural_key:'dup',passed:false,created_at:'2026-11-03T00:00:00Z'});
  await t.insert('dq_reconciliations',{id:'b1',pair:p,natural_key:'fixed',passed:false,created_at:'2026-11-01T00:00:00Z'});
  await t.insert('dq_reconciliations',{id:'b2',pair:p,natural_key:'fixed',passed:true,created_at:'2026-11-02T00:00:00Z'});
  await t.insert('dq_reconciliations',{id:'c1',pair:p,natural_key:'other',passed:false,created_at:'2026-11-01T00:00:00Z'});
  expect((await loadReconciliationsByPair(t))[p].failed).toBe(2);
 });
});
