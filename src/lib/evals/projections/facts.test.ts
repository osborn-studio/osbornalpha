// src/lib/evals/projections/facts.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import {projectionHash} from '../canonical-json';
import {SRC_A,SRC_B,SRC_C,ZZEVA_CIK,ZZEVA_ISSUER,seedZzeva} from '../test-support/memory-facts';
import type {Projection,ReplayRequest} from '../types';
import {ProjectionError,diffProjections,projectFacts,projectRequest,rowIdentity} from './facts';
import type {ProjectionDb,ProjectionDeps} from './facts';

const TODAY='2026-11-06';
const issuer={market:'US' as const,cik:ZZEVA_CIK};
const req=(p:Partial<ReplayRequest>={}):ReplayRequest=>({issuer,concepts:['revenue','cash'],asOf:'2025-06-30',...p});
const fact=(p:Record<string,string|number|boolean|null>)=>({consolidation:'consolidated',unit:'USD',disclosure_seq:1,is_current:true,is_revision:false,...p});
const reason=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof ProjectionError?e.reason:`other:${String(e)}`);

let db:MemoryFactsDb;let deps:ProjectionDeps;
beforeEach(async()=>{
 db=memoryFactsDb();await seedZzeva(db);
 deps={db,resolve:async s=>s.cik===ZZEVA_CIK?{issuerId:ZZEVA_ISSUER,market:'US'}:null};
});

describe('projectFacts',()=>{
 it('keeps the replay fields, joins source_ref, and sorts by (concept, period_start, period_end, consolidation, unit, available_date, source_ref)',async()=>{
  const p=await projectFacts(deps,req(),TODAY);
  expect(p).toEqual({module:'facts',rows:[
   fact({concept:'cash',period_start:null,period_end:'2024-09-28',duration:'INSTANT',value_text:'29943000000',available_date:'2024-11-01',source_ref:SRC_A}),
   fact({concept:'cash',period_start:null,period_end:'2024-12-28',duration:'INSTANT',value_text:'30299000000',available_date:'2025-02-01',source_ref:SRC_C}),
   fact({concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value_text:'383285000000',available_date:'2024-11-01',source_ref:SRC_A}),
   fact({concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value_text:'391035000000',available_date:'2024-11-01',source_ref:SRC_A,is_current:false}),
   fact({concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value_text:'391035000001',available_date:'2025-01-15',source_ref:SRC_B,disclosure_seq:2,is_revision:true}),
   fact({concept:'revenue',period_start:'2024-09-29',period_end:'2024-12-28',duration:'3M',value_text:'124300000000',available_date:'2025-02-01',source_ref:SRC_C}),
  ]});
 });
 it('applies asOf (later disclosures invisible) and durations',async()=>{
  const early=await projectFacts(deps,req({concepts:['revenue'],asOf:'2024-12-31'}),TODAY);
  expect(early.rows.map(r=>[r.period_end,r.source_ref,r.disclosure_seq,r.is_current])).toEqual([['2023-09-30',SRC_A,1,true],['2024-09-28',SRC_A,1,true]]);
  const only12=await projectFacts(deps,req({durations:['12M']}),TODAY);
  expect(only12.rows.map(r=>r.duration)).toEqual(['12M','12M','12M']);
 });
 it('is stable: the same request twice hashes equal; empty concepts → empty facts projection',async()=>{
  expect(projectionHash(await projectFacts(deps,req(),TODAY))).toBe(projectionHash(await projectFacts(deps,req(),TODAY)));
  expect(await projectFacts(deps,req({concepts:[]}),TODAY)).toEqual({module:'facts',rows:[]});
 });
 it('read problems are ProjectionError reasons: subject_unresolved, truncated, projection_join_missing',async()=>{
  expect(await reason(projectFacts(deps,req({issuer:{market:'US',cik:'1'}}),TODAY))).toBe('subject_unresolved');
  const truncated:ProjectionDb={readFacts:async()=>({stateRev:1,rows:[],truncated:true}),filingsOfIssuer:db.filingsOfIssuer,factsByIds:db.factsByIds};
  expect(await reason(projectFacts({...deps,db:truncated},req(),TODAY))).toBe('truncated');
  const noFilings:ProjectionDb={readFacts:db.readFacts,filingsOfIssuer:async()=>[],factsByIds:db.factsByIds};
  expect(await reason(projectFacts({...deps,db:noFilings},req(),TODAY))).toBe('projection_join_missing');
 });
});

describe('projectMetrics (via projectRequest)',()=>{
 const mreq=req({concepts:[],metrics:['gross_margin','revenue_yoy']});
 it('derives live at asOf and enriches inputs with period_end and source_ref',async()=>{
  const p=await projectRequest(deps,mreq,TODAY);
  expect(p.module).toBe('metrics');
  expect(p.rows.map(r=>r.metric)).toEqual(['gross_margin','revenue_yoy']);
  const gm=p.rows[0];
  expect(gm).toMatchObject({period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',basis:'us_standard',formula_version:'facts-derive/1.0',unit:'pure'});
  expect(String(gm.value)).toMatch(/^0\.\d{1,10}$/);
  expect(gm.inputs).toEqual([{concept:'gross_profit',period_end:'2024-09-28',source_ref:SRC_A},{concept:'revenue',period_end:'2024-09-28',source_ref:SRC_B}]);
  const yoy=p.rows[1].inputs as {source_ref:string}[];
  expect(new Set(yoy.map(i=>i.source_ref))).toEqual(new Set([SRC_A,SRC_B]));
 });
 it('a missing factsByIds join is projection_join_missing; durations filter metric rows',async()=>{
  const noFacts:ProjectionDb={readFacts:db.readFacts,filingsOfIssuer:db.filingsOfIssuer,factsByIds:async()=>[]};
  expect(await reason(projectRequest({...deps,db:noFacts},mreq,TODAY))).toBe('projection_join_missing');
  expect((await projectRequest(deps,{...mreq,durations:['3M']},TODAY)).rows).toEqual([]);
 });
});

describe('diffProjections and rowIdentity',()=>{
 const base=async()=>projectFacts(deps,req(),TODAY);
 it('names a changed field with the spec notation; null period_start is the empty segment',async()=>{
  const before=await base();
  const after:Projection={...before,rows:before.rows.map(r=>r.source_ref===SRC_B?{...r,value_text:'391035000002'}:r)};
  expect(diffProjections(before,after)).toEqual([`facts[revenue/2023-10-01..2024-09-28/12M/USD/2025-01-15/${SRC_B}].value_text`]);
  expect(rowIdentity('facts',before.rows[0])).toBe(`cash/..2024-09-28/INSTANT/USD/2024-11-01/${SRC_A}`);
 });
 it('several fields, an added row and a removed row; module change; row order does not matter',async()=>{
  const before=await base();
  const changed={...before.rows[3],disclosure_seq:2,is_current:true};
  const after:Projection={module:'facts',rows:[...before.rows.slice(0,3),changed,...before.rows.slice(5),{...before.rows[0],source_ref:'0009990601-26-000009'}]};
  expect(diffProjections(before,after)).toEqual([
   `facts[cash/..2024-09-28/INSTANT/USD/2024-11-01/0009990601-26-000009]`,
   `facts[revenue/2023-10-01..2024-09-28/12M/USD/2024-11-01/${SRC_A}].disclosure_seq`,
   `facts[revenue/2023-10-01..2024-09-28/12M/USD/2024-11-01/${SRC_A}].is_current`,
   `facts[revenue/2023-10-01..2024-09-28/12M/USD/2025-01-15/${SRC_B}]`,
  ]);
  expect(diffProjections(before,{module:'metrics',rows:before.rows})).toEqual(['module']);
  expect(diffProjections(before,{module:'facts',rows:[...before.rows].reverse()})).toEqual([]);
 });
 it('metrics identity: metric/period/duration/basis/formula_version',async()=>{
  const p=await projectRequest(deps,req({concepts:[],metrics:['gross_margin']}),TODAY);
  const q:Projection={...p,rows:[{...p.rows[0],value:'0.5'}]};
  expect(diffProjections(p,q)).toEqual(['metrics[gross_margin/2023-10-01..2024-09-28/12M/us_standard/facts-derive/1.0].value']);
 });
});
