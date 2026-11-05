// src/lib/facts/read.test.ts
import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {factInsert,filingInsert} from './db-contract';
import {memoryFactsDb} from './memory-facts-db';
import {sequencesOf,currentFacts} from './read';
import type {FactRow} from './types';

const F1='10000000-0000-4000-8000-000000000001',F2='10000000-0000-4000-8000-000000000002',F3='10000000-0000-4000-8000-000000000003';
let n=0;
const cmpS=(a:string,b:string)=>a<b?-1:a>b?1:0;
const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:'i',market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
const filings=new Map([[F1,1],[F2,1],[F3,1]]);
// AAPL FY2023 revenue: 10-K filed 2023-11-03, repeated unchanged in the FY2024 10-K filed 2024-11-01.
const fy23=row(F1,'383285000000','2023-11-03');
const fy24=row(F2,'383285000000','2024-11-01');

describe('sequencesOf',()=>{
 it('replays the disclosure visible at asOf: the 2023 10-K row at 2024-06-30, seq 2 unrevised at 2025-06-30',()=>{
  const at2024=sequencesOf([fy23,fy24],{asOf:'2024-06-30',filings,history:true});
  expect(at2024).toHaveLength(1);
  expect(at2024[0]).toMatchObject({fact_id:fy23.fact_id,filing_id:F1,disclosure_seq:1,is_current:true,is_revision:false});
  const at2025=sequencesOf([fy23,fy24],{asOf:'2025-06-30',filings,history:true});
  expect(at2025.map(r=>[r.filing_id,r.disclosure_seq,r.is_current,r.is_revision])).toEqual([[F1,1,false,false],[F2,2,true,false]]);
  expect(currentFacts([fy23,fy24],{asOf:'2025-06-30',filings}).map(r=>r.fact_id)).toEqual([fy24.fact_id]);
 });
 it('marks a changed value as a revision using canonical decimal comparison',()=>{
  const revised=row(F3,'3.83286e11','2025-02-01');
  const same=row(F3,'383285000000.00','2025-02-01');
  expect(sequencesOf([fy23,revised],{asOf:'2025-12-31',filings,history:true}).map(r=>r.is_revision)).toEqual([false,true]);
  expect(sequencesOf([fy23,same],{asOf:'2025-12-31',filings,history:true}).map(r=>r.is_revision)).toEqual([false,false]);
 });
 it('drops rows whose mapping_gen is not the filing\'s activated generation, and rows of unknown filings',()=>{
  const old=row(F1,'1','2023-11-03',{mapping_gen:0});
  const orphan=row('10000000-0000-4000-8000-00000000dead','1','2023-11-03');
  expect(sequencesOf([old,orphan,fy23],{asOf:'2030-01-01',filings,history:true}).map(r=>r.fact_id)).toEqual([fy23.fact_id]);
  expect(sequencesOf([fy23],{asOf:'2030-01-01',filings:new Map([[F1,2]]),history:true})).toEqual([]);
 });
 it('hides staged and quarantined rows unless includeNonOk, which lists them OUTSIDE the sequence (no seq, never current) like the SQL window (round-1 #14)',()=>{
  const parked=row(F2,'1','2024-11-01',{status:'quarantined'});
  const staged=row(F3,'2','2025-01-01',{status:'staged'});
  expect(sequencesOf([fy23,parked,staged],{asOf:'2030-01-01',filings,history:true}).map(r=>r.fact_id)).toEqual([fy23.fact_id]);
  const all=sequencesOf([fy23,parked,staged],{asOf:'2030-01-01',filings,history:true,includeNonOk:true});
  expect(all.map(r=>[r.status,r.disclosure_seq??null,r.is_current,r.is_revision])).toEqual([['ok',1,true,false],['quarantined',null,false,false],['staged',null,false,false]]);
  expect(sequencesOf([fy23,parked,staged],{asOf:'2030-01-01',filings,history:false,includeNonOk:true}).map(r=>r.fact_id)).toEqual([fy23.fact_id]);
 });
 it('agrees with memoryFactsDb.readFacts on one fixture: ok rows sequence, quarantined rows listed without sequence fields (round-1 #14)',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
  const disclose=async(available:string,value:string)=>{const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss,{availableDate:available});await db.stageFilings(run,[f]);const x=factInsert(iss,f,{value});await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);return x.fact_id;};
  await disclose('2024-02-01','100');await disclose('2024-05-01','100');await disclose('2024-08-01','120');
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss,{availableDate:'2024-09-01'});await db.stageFilings(run,[f]);
  const qd=factInsert(iss,f,{value:'121'});await db.stageFacts(run,[qd]);
  const itemId=randomUUID();
  await db.tables.insert('dq_quarantine',{id:itemId,dataset:'facts.us',table_name:'financial_facts',natural_key:`${iss}:US:IS:x`,reason_code:'identity_gp',status:'open',payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run},detail:{},batch_id:b,resolved_by:null,resolved_at:null,created_at:'2026-01-01T00:00:00.000Z'});
  await db.quarantineFacts(run,[qd.fact_id],itemId);await db.publishRun(run,[f.filing_id]);
  const gens=new Map(db.filings().map(g=>[g.filing_id,g.mapping_gen]));
  const shape=(rs:FactRow[])=>rs.map(r=>[r.fact_id,r.status,r.disclosure_seq??null,r.is_current,r.is_revision]).sort((a,b)=>cmpS(String(a[0]),String(b[0])));
  for(const history of [true,false]){
   const fromDb=(await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history,includeNonOk:true})).rows;
   const pure=sequencesOf(db.facts(),{asOf:'2030-01-01',filings:gens,history,includeNonOk:true,concepts:['revenue']});
   expect(shape(pure)).toEqual(shape(fromDb));
   expect(pure.filter(r=>r.status==='ok').map(r=>r.disclosure_seq)).toEqual(history?[1,2,3]:[3]);
   expect(pure.filter(r=>r.status!=='ok').map(r=>[r.disclosure_seq??null,r.is_current])).toEqual(history?[[null,false]]:[]);
  }
 });
 it('orders ties by created_at then fact_id and keys by concept, period_end, period_start, unit',()=>{
  const b=row(F2,'2','2023-11-03',{created_at:'2024-01-01T00:00:00.000Z',fact_id:'20000000-0000-4000-8000-00000000000b'});
  const a=row(F1,'1','2023-11-03',{created_at:'2024-01-01T00:00:00.000Z',fact_id:'20000000-0000-4000-8000-00000000000a'});
  const cash=row(F1,'9','2023-11-03',{concept:'cash',statement:'BS',period_start:null,duration:'INSTANT'});
  const out=sequencesOf([b,cash,a],{asOf:'2030-01-01',filings,history:true});
  expect(out.map(r=>[r.concept,r.fact_id,r.disclosure_seq])).toEqual([['cash',cash.fact_id,1],['revenue',a.fact_id,1],['revenue',b.fact_id,2]]);
 });
 it('filters by concepts and period_end window',()=>{
  const cash=row(F1,'9','2023-11-03',{concept:'cash',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2022-09-30'});
  expect(sequencesOf([fy23,cash],{asOf:'2030-01-01',filings,history:true,concepts:['cash']}).map(r=>r.concept)).toEqual(['cash']);
  expect(sequencesOf([fy23,cash],{asOf:'2030-01-01',filings,history:true,from:'2023-01-01'}).map(r=>r.concept)).toEqual(['revenue']);
  expect(sequencesOf([fy23,cash],{asOf:'2030-01-01',filings,history:true,to:'2022-12-31'}).map(r=>r.concept)).toEqual(['cash']);
 });
 it('uses C-collation string order and instant-aware created_at ordering, not localeCompare',()=>{
  const upper=row(F1,'1','2023-11-03',{concept:'Zeta',created_at:'2024-01-01T00:00:00.000Z'});
  const lower=row(F1,'2','2023-11-03',{concept:'alpha',created_at:'2024-01-01T00:00:00.000Z'});
  expect(sequencesOf([lower,upper],{asOf:'2030-01-01',filings,history:true}).map(r=>r.concept)).toEqual(['Zeta','alpha']);
  const early=row(F2,'1','2023-11-03',{created_at:'2024-01-01T01:00:00+01:00',fact_id:'20000000-0000-4000-8000-0000000000f2'});
  const late=row(F1,'2','2023-11-03',{created_at:'2024-01-01T00:30:00.000Z',fact_id:'20000000-0000-4000-8000-0000000000f1'});
  expect(sequencesOf([late,early],{asOf:'2030-01-01',filings,history:true}).map(r=>[r.fact_id,r.disclosure_seq])).toEqual([[early.fact_id,1],[late.fact_id,2]]);
 });
 it('scopes sequences per issuer and market',()=>{
  const a=row(F1,'1','2023-11-03',{issuer_id:'A'});const b=row(F1,'2','2024-11-03',{issuer_id:'B'});const c=row(F1,'3','2024-11-04',{issuer_id:'A',market:'CN'});
  const out=sequencesOf([a,b,c],{asOf:'2030-01-01',filings,history:true});
  expect(out.map(r=>[r.issuer_id,r.market,r.disclosure_seq,r.is_current,r.is_revision])).toEqual([['A','CN',1,true,false],['A','US',1,true,false],['B','US',1,true,false]]);
 });
 it('compares equal instants as equal so fact_id breaks the tie; unparseable created_at sorts last',()=>{
  const x=row(F1,'1','2023-11-03',{created_at:'2024-02-01T01:00:00+01:00',fact_id:'20000000-0000-4000-8000-0000000000b2'});
  const y=row(F2,'2','2023-11-03',{created_at:'2024-02-01T00:00:00Z',fact_id:'20000000-0000-4000-8000-0000000000a1'});
  expect(sequencesOf([x,y],{asOf:'2030-01-01',filings,history:true}).map(r=>r.fact_id)).toEqual([y.fact_id,x.fact_id]);
  const bad=row(F3,'3','2023-11-03',{created_at:'garbage',fact_id:'20000000-0000-4000-8000-0000000000a0'});
  expect(sequencesOf([bad,x,y],{asOf:'2030-01-01',filings,history:true}).map(r=>r.fact_id)).toEqual([y.fact_id,x.fact_id,bad.fact_id]);
 });
 it('separates units and consolidations, keeps null period_start rows in one sequence, flags A to B to A as revisions',()=>{
  const usd=row(F1,'1','2023-11-03');const eur=row(F1,'1','2023-11-03',{unit:'EUR'});const other=row(F1,'1','2023-11-03',{consolidation:'parent'});
  expect(sequencesOf([usd,eur,other],{asOf:'2030-01-01',filings,history:true}).map(r=>r.disclosure_seq)).toEqual([1,1,1]);
  const c1=row(F1,'9','2023-11-03',{concept:'cash',statement:'BS',period_start:null,duration:'INSTANT'});
  const c2=row(F2,'9','2024-11-03',{concept:'cash',statement:'BS',period_start:null,duration:'INSTANT'});
  expect(sequencesOf([c1,c2],{asOf:'2030-01-01',filings,history:true}).map(r=>r.disclosure_seq)).toEqual([1,2]);
  const a1=row(F1,'1','2023-11-03'),b=row(F2,'2','2024-11-03'),a2=row(F3,'1','2025-11-03');
  expect(sequencesOf([a1,b,a2],{asOf:'2030-01-01',filings,history:true}).map(r=>r.is_revision)).toEqual([false,true,true]);
 });
 it('rejects malformed asOf/from/to',()=>{
  expect(()=>sequencesOf([],{asOf:'2024-6-30',filings})).toThrow(RangeError);
  expect(()=>sequencesOf([],{asOf:'2024-06-30',filings,from:'x'})).toThrow(RangeError);
  expect(()=>sequencesOf([],{asOf:'2024-06-30',filings,to:'2024-13-45'})).toThrow(RangeError);
 });
 it('agrees with memoryFactsDb.readFacts over several keys (revisions, null period_start, two concepts)',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
  const disclose=async(available:string,vals:[string,string][])=>{const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss,{availableDate:available});await db.stageFilings(run,[f]);await db.stageFacts(run,vals.map(([concept,value])=>factInsert(iss,f,{concept,value,...(concept==='cash'?{statement:'BS',period_start:null,duration:'INSTANT'}:{})} as never)));await db.publishRun(run,[f.filing_id]);};
  await disclose('2024-02-01',[['revenue','100'],['cash','5']]);await disclose('2024-05-01',[['revenue','110'],['cash','5']]);await disclose('2024-08-01',[['revenue','100'],['cash','6']]);
  const gens=new Map(db.filings().map(g=>[g.filing_id,g.mapping_gen]));
  const shape=(rs:FactRow[])=>rs.map(r=>[r.fact_id,r.disclosure_seq??null,r.is_current,r.is_revision]).sort((x,y)=>cmpS(String(x[0]),String(y[0])));
  for(const history of [true,false]){
   const fromDb=(await db.readFacts(iss,'US',{concepts:['revenue','cash'],asOf:'2030-01-01',history})).rows;
   expect(shape(sequencesOf(db.facts(),{asOf:'2030-01-01',filings:gens,history,concepts:['revenue','cash']}))).toEqual(shape(fromDb));
  }
 });
});
