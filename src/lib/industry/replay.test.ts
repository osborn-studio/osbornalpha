// src/lib/industry/replay.test.ts
import {describe,it,expect} from 'vitest';
import {deriveMetrics} from '../facts/derive';
import type {Duration,FactRow,FilingRow} from '../facts/types';
import {computeAggregateCell} from './aggregate';
import type {IssuerFacts} from './aggregate';
import {buildAggregateManifest,encodeManifest} from './manifest';
import type {BuildManifestInput} from './manifest';
import {filterManifest} from './read';
import {replayCell,replayFromManifest} from './replay';
import type {AggregateManifest,ManifestMember} from './types';

const A='00000000-0000-4000-8000-00000000000a',B='00000000-0000-4000-8000-00000000000b',C='00000000-0000-4000-8000-00000000000c';
let n=0;
const DUR:Record<string,Duration>={'03':'3M','06':'6M','09':'9M','12':'12M'};
function fact(issuer:string,concept:string,periodEnd:string,value:string):FactRow{
 const instant=concept==='equity_parent';const id=`f${String(++n).padStart(6,'0')}`;
 return {fact_id:id,issuer_id:issuer,market:'CN',filing_id:`g:${issuer}:${periodEnd}`,run_id:'r',concept,source_concept:concept,statement:instant?'BS':'IS',period_start:instant?null:`${periodEnd.slice(0,4)}-01-01`,period_end:periodEnd,
  duration:instant?'INSTANT':DUR[periodEnd.slice(5,7)],value,value_text:value,unit:'CNY',consolidation:'consolidated',available_date:'2025-04-30',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:`h${id}`,created_at:'2025-05-01T00:00:00.000Z',disclosure_seq:1,is_current:true,is_revision:false};
}
const ytd=(i:string,c:string,y:number,vs:(string|null)[])=>vs.flatMap((v,k)=>v===null?[]:[fact(i,c,`${y}-${['03-31','06-30','09-30','12-31'][k]}`,v)]);
const rowsOf=(i:string,s:number)=>[
 ...ytd(i,'revenue',2023,['100','250','390','600'].map(v=>String(Number(v)*s))),...ytd(i,'revenue',2024,['120','270','450','700.5'].map(v=>(Number(v)*s).toFixed(1))),
 ...ytd(i,'revenue_operating',2024,[null,null,null,String(650*s)]),...ytd(i,'cost_of_revenue',2024,[null,null,null,String(400*s)]),
 ...ytd(i,'net_income_parent',2023,['10','20','30','45'].map(v=>String(Number(v)*s))),...ytd(i,'net_income_parent',2024,['12','25','38','52'].map(v=>String(Number(v)*s))),
 fact(i,'equity_parent','2023-12-31',String(300*s)),fact(i,'equity_parent','2024-12-31',String(340*s)),
];
const env=(id:string,rows:FactRow[]):IssuerFacts=>({issuer_id:id,stateRev:7,truncated:false,rows,derived:deriveMetrics(rows,{market:'CN',asOf:'2025-05-15',basedOnRev:7})});
const member=(id:string,ticker:string):ManifestMember=>({issuer_id:id,ticker,valid_from:'2021-12-13',valid_to:null,available_date:'2021-12-13',valid_to_available_date:null,source_membership_id:`s-${ticker}`,raw_hash:`rh-${ticker}`,locator:{api:'index_member_all',row:1},resolution_method:'today'});
function build(order:'asc'|'desc'='asc'):{input:BuildManifestInput;manifest:AggregateManifest}{
 n=0;   // deterministic fact ids per build
 const envs=[env(A,rowsOf(A,1)),env(B,rowsOf(B,3)),env(C,[])];
 const members=[member(A,'600001.SH'),member(B,'000002.SZ'),member(C,'830003.BJ')];
 const result=computeAggregateCell({code:'801120.SI',period_end:'2024-12-31',financial:false,members:envs.map(e=>e.issuer_id),nUnresolved:1,issuers:new Map(envs.map(e=>[e.issuer_id,e]))});
 const filings=new Map<string,FilingRow>();
 for(const f of result.facts)filings.set(f.filing_id,{filing_id:f.filing_id,issuer_id:f.issuer_id,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:f.period_end,available_date:f.available_date,source_ref:`ref:${f.filing_id}`,url:null,document_ref:f.issuer_id===A?'doc':null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2025-05-01T00:00:00.000Z'});
 const rev=<T>(xs:T[])=>order==='asc'?xs:[...xs].reverse();
 const input:BuildManifestInput={header:{scheme:'sw2021',version:'2021',code:'801120.SI',level:1,period_end:'2024-12-31',facts_as_of:'2025-05-15',knowledge_date:'2025-05-15',history_class:'reconstruction',method_version:'industry-agg/1.0',config_hash:'c'.repeat(64),formula_version:'facts-derive/1.0',code_version:'abc'},
  members:rev(members),unresolved:[{ts_code:'600999.SH',in_date:'2021-12-13',out_date:null,source_membership_id:'s-u'}],memberStateRevs:rev(envs.map(e=>({issuer_id:e.issuer_id,state_rev:e.stateRev}))),
  result:{...result,cells:rev(result.cells),roles:rev(result.roles),facts:rev(result.facts),derived:rev(result.derived)},filings};
 return {input,manifest:buildAggregateManifest(input)};
}

describe('replayFromManifest',()=>{
 it('reproduces every cell from facts, derived and roles alone and equals the aggregate output',()=>{
  const {manifest}=build();
  const r=replayFromManifest(manifest);
  expect(r.reproduced).toBe(true);expect(r.mismatches).toEqual([]);
  expect(r.cells).toEqual(manifest.cells);
  expect(manifest.cells.find(c=>c.metric==='revenue_sum'&&c.duration==='12M')).toMatchObject({status:'ok',value_text:'2802',n_members:3,n_with_data:2,n_unresolved:1});   // 700.5 + 2101.5
  expect(manifest.cells.filter(c=>c.status==='ok')).toHaveLength(11);
 });
 it('shuffled inputs give the same manifest bytes and hash',()=>{
  const a=encodeManifest(build('asc').manifest),b=encodeManifest(build('desc').manifest);
  expect(b.canonical).toBe(a.canonical);expect(b.hash).toBe(a.hash);
 });
 it('a tampered fact value, derived value or role is detected (reproduced=false), naming only the affected cells',()=>{
  const {manifest}=build();
  const t1=structuredClone(manifest);
  const f=t1.facts.find(x=>x.concept==='revenue'&&x.duration==='12M'&&x.period_end==='2024-12-31'&&x.issuer_id===A)!;f.value_text='700.6';
  const r1=replayFromManifest(t1);
  expect(r1.reproduced).toBe(false);
  expect(r1.mismatches).toEqual(['revenue_sum:12M:2024-01-01','revenue_yoy:12M:2024-01-01']);
  const t2=structuredClone(manifest);
  t2.derived.find(x=>x.metric==='ttm_net_income_parent')!.value='1';
  expect(replayFromManifest(t2).mismatches).toEqual(['roe:TTM:2024-01-01']);
  const t3=structuredClone(manifest);
  const role=t3.roles.find(x=>x.metric==='net_income_parent_sum'&&x.duration==='12M'&&x.issuer_id===B)!;role.role='excluded';role.reason='missing_concept';
  expect(replayFromManifest(t3).mismatches).toEqual(['net_income_parent_sum:12M:2024-01-01']);
  const t4=structuredClone(manifest);
  t4.facts=t4.facts.filter(x=>!(x.concept==='equity_parent'&&x.issuer_id===B));
  const r4=replayFromManifest(t4);
  expect(r4.cells.find(c=>c.metric==='roe')).toMatchObject({status:'missing',missing_reason:'manifest_mismatch'});
  expect(r4.mismatches).toEqual(['roe:TTM:2024-01-01']);
  const t5=structuredClone(manifest);t5.unresolved=[];
  expect(replayFromManifest(t5).mismatches).toHaveLength(11);   // n_unresolved is part of every cell
 });
 it('asserts the method units and the cell grid: a wrong stored unit or a missing/extra cell is a mismatch',()=>{
  const {manifest}=build();
  const t1=structuredClone(manifest);t1.cells.find(c=>c.metric==='revenue_sum'&&c.duration==='12M')!.unit='USD';
  expect(replayFromManifest(t1)).toMatchObject({reproduced:false,mismatches:['revenue_sum:12M:2024-01-01']});
  const t2=structuredClone(manifest);t2.cells=t2.cells.filter(c=>c.metric!=='roe');
  expect(replayFromManifest(t2).mismatches).toEqual(['missing_cell:roe:TTM:2024-01-01']);
  const t3=structuredClone(manifest);t3.cells.push({...t3.cells[0],metric:'revenue_sum',duration:'6M' as never,period_start:'2024-01-01'});
  const r3=replayFromManifest(t3);expect(r3.reproduced).toBe(false);expect(r3.mismatches).toEqual(['unexpected_cell:revenue_sum:6M:2024-01-01']);
 });
 it('treats all-financial_excluded gross margin roles as the financial flag',()=>{
  const {input}=build();
  const fin=computeAggregateCell({code:'801780.SI',period_end:'2024-12-31',financial:true,members:[A,B],nUnresolved:0,issuers:new Map([[A,env(A,rowsOf(A,1))],[B,env(B,rowsOf(B,3))]])});
  const m=buildAggregateManifest({...input,header:{...input.header,code:'801780.SI'},members:input.members.filter(x=>x.issuer_id!==C),memberStateRevs:[],unresolved:[],result:fin});
  const r=replayFromManifest(m);
  expect(r.reproduced).toBe(true);
  expect(r.cells.find(c=>c.metric==='gross_margin')).toMatchObject({status:'missing',missing_reason:'financial_excluded'});
  expect(()=>replayFromManifest({...m,schema:'industry-manifest/1' as never})).toThrow('unsupported_manifest');
 });
});

describe('replayCell (single-cell payload)',()=>{
 const CELLS=[['revenue_sum','12M','2024-01-01'],['roe','TTM','2024-01-01'],['revenue_yoy','12M','2024-01-01'],['gross_margin','12M','2024-01-01'],['member_count','INSTANT','2024-12-31']] as const;
 it('the per-cell filtered payload validates on its own (the full-grid validator rejects it)',()=>{
  const {manifest}=build();
  for(const [metric,duration,period_start] of CELLS){
   const payload=filterManifest(manifest,metric,{duration,period_start});
   expect(replayFromManifest(payload).reproduced).toBe(false);   // grid incomplete: ingestion validation unchanged
   const r=replayCell(payload,{metric,duration,period_start});
   expect(r.mismatches).toEqual([]);expect(r.reproduced).toBe(true);
   expect(r.cell).toEqual(manifest.cells.find(c=>c.metric===metric&&c.duration===duration&&c.period_start===period_start));
  }
 });
 it('a tampered input of the requested cell is detected; a tamper of another cell is not this cell’s problem',()=>{
  const {manifest}=build();
  const key={metric:'revenue_sum' as const,duration:'12M' as const,period_start:'2024-01-01'};
  const payload=structuredClone(filterManifest(manifest,key.metric,key));
  payload.facts.find(f=>f.issuer_id===A)!.value_text='1';
  expect(replayCell(payload,key)).toMatchObject({reproduced:false,mismatches:['revenue_sum:12M:2024-01-01']});
  const other=structuredClone(manifest);
  other.facts.find(f=>f.concept==='equity_parent')!.value_text='1';
  expect(replayCell(other,key)).toMatchObject({mismatches:[],reproduced:true});
 });
 it('an off-grid or absent cell is reported, never silently reproduced',()=>{
  const {manifest}=build();
  expect(replayCell(manifest,{metric:'roe',duration:'3M',period_start:'2024-01-01'})).toMatchObject({cell:null,reproduced:false,mismatches:['unexpected_cell:roe:3M:2024-01-01']});
  const t=structuredClone(manifest);t.cells=t.cells.filter(c=>c.metric!=='roe');
  expect(replayCell(t,{metric:'roe',duration:'TTM',period_start:'2024-01-01'})).toMatchObject({cell:null,reproduced:false,mismatches:['missing_cell:roe:TTM:2024-01-01']});
 });
});
