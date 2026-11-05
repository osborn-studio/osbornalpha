// src/lib/facts/plan.test.ts
import {describe,it,expect} from 'vitest';
import {planFactWrites} from './plan';
import {sameDayConflictKey} from './keys';
import type {ConflictItem,FactCandidate,FactRow,FilingCandidate} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const F1='10000000-0000-4000-8000-000000000001',F2='10000000-0000-4000-8000-000000000002',F3='10000000-0000-4000-8000-000000000003';
const filings=new Map([['acc-1',F1],['acc-2',F2],['acc-3',F3]]);
const fc=(ref:string,availableDate:string):FilingCandidate=>({sourceRef:ref,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate,url:null});
const filingCandidates=[fc('acc-1','2023-11-03'),fc('acc-2','2023-11-03'),fc('acc-3','2024-11-01')];
const cand=(ref:string,value:string,over:Partial<FactCandidate>={}):FactCandidate=>({concept:'revenue',sourceConcept:'Revenues',statement:'IS',periodStart:'2022-10-01',periodEnd:'2023-09-30',duration:'12M',value,unit:'USD',consolidation:'consolidated',filingRef:ref,rawHash:'h',...over});
let n=0;
const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
const ids=(()=>{let i=0;return ()=>`30000000-0000-4000-8000-${String(++i).padStart(12,'0')}`;})();
const plan=(over:Partial<Parameters<typeof planFactWrites>[0]>)=>planFactWrites({existing:[],openConflicts:[],candidates:[],filingCandidates,filings,issuerId:ISSUER,market:'US',mappingGen:1,mappingVersion:'facts-map/1',newId:ids,...over});
const K={concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'};

describe('planFactWrites',()=>{
 it('inserts a first disclosure as inserted and builds the FactInsert from the filing date',()=>{
  const out=plan({candidates:[cand('acc-1','383285000000')]});
  expect(out.counts).toEqual({inserted:1,versioned:0,duplicates:0,quarantined:0});
  expect(out.inserts).toHaveLength(1);
  expect(out.inserts[0]).toMatchObject({issuer_id:ISSUER,market:'US',filing_id:F1,concept:'revenue',value:'383285000000',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',period_start:'2022-10-01',period_end:'2023-09-30'});
  expect(out.outcomes.get(out.inserts[0].fact_id)).toBe('inserted');
 });
 it('skips candidates whose candidate key exists in any status, but not rows of another generation',()=>{
  const dup=row(F1,'1','2023-11-03',{status:'quarantined'});
  const oldGen=row(F2,'1','2023-11-03',{mapping_gen:0});
  const out=plan({existing:[dup,oldGen],candidates:[cand('acc-1','1'),cand('acc-2','1')]});
  expect(out.duplicates).toHaveLength(1);expect(out.duplicates[0].filingRef).toBe('acc-1');
  expect(out.inserts.map(r=>r.filing_id)).toEqual([F2]);
  expect(out.counts).toEqual({inserted:1,versioned:0,duplicates:1,quarantined:0});
 });
 it('treats a repeated identical candidate as a duplicate and different values for one key as ambiguous_value with no rows',()=>{
  const same=plan({candidates:[cand('acc-1','100'),cand('acc-1','1e2')]});
  expect(same.inserts).toHaveLength(1);expect(same.counts).toEqual({inserted:1,versioned:0,duplicates:1,quarantined:0});
  const amb=plan({candidates:[cand('acc-1','100'),cand('acc-1','101')]});
  expect(amb.inserts).toHaveLength(0);
  expect(amb.ambiguous).toHaveLength(1);
  expect(amb.ambiguous[0]).toMatchObject({naturalKey:`${ISSUER}:US:revenue:2022-10-01:2023-09-30:consolidated:USD:acc-1:1`,key:{issuer_id:ISSUER,market:'US',concept:'revenue',unit:'USD'}});
  expect(amb.ambiguous[0].candidates).toHaveLength(2);
  expect(amb.counts).toEqual({inserted:0,versioned:0,duplicates:0,quarantined:2});
 });
 it('counts versioned when the value differs from the current visible value and inserted when it equals it',()=>{
  const first=row(F1,'100','2023-11-03');
  const same=plan({existing:[first],candidates:[cand('acc-3','100.0')]});
  expect(same.counts).toEqual({inserted:1,versioned:0,duplicates:0,quarantined:0});
  const changed=plan({existing:[first],candidates:[cand('acc-3','101')]});
  expect(changed.counts).toEqual({inserted:0,versioned:1,duplicates:0,quarantined:0});
  // the current value is the last ok row by (available_date, created_at, fact_id); quarantined rows do not count
  const parked=row(F2,'999','2023-11-03',{status:'quarantined'});
  expect(plan({existing:[first,parked],candidates:[cand('acc-3','100')]}).counts.inserted).toBe(1);
 });
 it('parks all same-day candidates with different values and references the ok row that disagrees',()=>{
  const out=plan({candidates:[cand('acc-1','100'),cand('acc-2','200')]});
  expect(out.inserts).toHaveLength(2);
  expect(out.conflicts).toHaveLength(1);
  const c=out.conflicts[0];
  expect(c.naturalKey).toBe(sameDayConflictKey(ISSUER,'US',K,'2023-11-03'));
  expect(c.newFactIds).toEqual(out.inserts.map(r=>r.fact_id));
  expect(c.existingOkFactIds).toEqual([]);
  expect(c.key).toEqual({issuer_id:ISSUER,market:'US',concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD',available_date:'2023-11-03'});
  expect(c.values.map(v=>v.value).sort()).toEqual(['100','200']);
  expect(out.counts).toEqual({inserted:0,versioned:0,duplicates:0,quarantined:2});
  expect(out.quarantinedFactIds).toEqual(c.newFactIds);
  const withOk=plan({existing:[row(F1,'100','2023-11-03')],candidates:[cand('acc-2','200')]});
  expect(withOk.conflicts[0].existingOkFactIds).toHaveLength(1);
  expect(withOk.conflicts[0].newFactIds).toHaveLength(1);
  // same value on the same day from another filing is a normal insert
  expect(plan({existing:[row(F1,'100','2023-11-03')],candidates:[cand('acc-2','100')]}).conflicts).toHaveLength(0);
 });
 it('does not conflict a re-mapped filing with its own superseded row, but still detects distinct-filing conflicts',()=>{
  const old=row(F1,'100','2023-11-03',{mapping_gen:0});
  const fix=plan({existing:[old],candidates:[cand('acc-1','101')]});
  expect(fix.conflicts).toHaveLength(0);expect(fix.counts).toEqual({inserted:0,versioned:1,duplicates:0,quarantined:0});
  const other=row(F2,'100','2023-11-03');
  expect(plan({existing:[old,other],candidates:[cand('acc-1','101')]}).conflicts).toHaveLength(1);
  const old2=row(F2,'200','2023-11-03',{mapping_gen:0});
  expect(plan({existing:[old2],candidates:[cand('acc-1','100')]}).conflicts).toHaveLength(0);
 });
 it('is independent of arrival order: one run with both, or either filing first, yields the same conflict',()=>{
  const both=plan({candidates:[cand('acc-1','100'),cand('acc-2','200')]});
  const bothReversed=plan({candidates:[cand('acc-2','200'),cand('acc-1','100')]});
  const aFirst=plan({existing:[row(F1,'100','2023-11-03')],candidates:[cand('acc-2','200')]});
  const bFirst=plan({existing:[row(F2,'200','2023-11-03')],candidates:[cand('acc-1','100')]});
  const shape=(p:ReturnType<typeof plan>)=>p.conflicts.map(c=>({key:c.naturalKey,values:c.values.map(v=>`${v.filing}=${v.value}`).sort(),n:c.newFactIds.length+c.existingOkFactIds.length}));
  expect(shape(bothReversed)).toEqual(shape(both));
  expect(shape(aFirst)).toEqual(shape(both));
  expect(shape(bFirst)).toEqual(shape(both));
  for(const p of [both,bothReversed,aFirst,bFirst])expect(p.counts.inserted+p.counts.versioned).toBe(0);
 });
 it('joins an open conflict item for (K, date) whatever the value, instead of creating a new one',()=>{
  const item:ConflictItem={id:'44444444-0000-4000-8000-000000000001',natural_key:sameDayConflictKey(ISSUER,'US',K,'2023-11-03'),fact_ids:['x'],available_date:'2023-11-03',key:{}};
  const out=plan({existing:[row(F1,'100','2023-11-03',{status:'quarantined'})],openConflicts:[item],candidates:[cand('acc-2','100')]});
  expect(out.conflicts).toHaveLength(0);
  expect(out.contestedJoins).toEqual([{itemId:item.id,factIds:[out.inserts[0].fact_id]}]);
  expect(out.counts).toEqual({inserted:0,versioned:0,duplicates:0,quarantined:1});
  // a different date for the same K is not contested
  expect(plan({openConflicts:[item],candidates:[cand('acc-3','100')]}).contestedJoins).toHaveLength(0);
 });
 it('keeps instants, units and consolidation apart in K',()=>{
  const out=plan({candidates:[cand('acc-1','1',{concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT'}),cand('acc-2','2',{concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT',unit:'EUR'})]});
  expect(out.conflicts).toHaveLength(0);expect(out.inserts).toHaveLength(2);
  expect(out.inserts[0].period_start).toBeNull();
 });
 it('throws on a candidate whose filing was not staged',()=>{
  expect(()=>plan({candidates:[cand('acc-9','1')]})).toThrow('unknown_filing:acc-9');
 });
});
