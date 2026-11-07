// src/lib/industry/aggregate.test.ts
import {describe,it,expect} from 'vitest';
import {deriveMetrics} from '../facts/derive';
import type {Duration,FactRow} from '../facts/types';
import {computeAggregateCell} from './aggregate';
import type {AggregateCellInput,IssuerFacts} from './aggregate';
import type {ManifestCell} from './types';

const A='00000000-0000-4000-8000-00000000000a',B='00000000-0000-4000-8000-00000000000b',C='00000000-0000-4000-8000-00000000000c';
let n=0;
const DUR:Record<string,Duration>={'03':'3M','06':'6M','09':'9M','12':'12M'};
/** One current CN fact; filing per (issuer, period_end) unless given. */
function fact(issuer:string,concept:string,periodEnd:string,value:string,o:Partial<FactRow>={}):FactRow{
 const instant=concept==='equity_parent';
 const id=`f${String(++n).padStart(6,'0')}`;
 return {fact_id:id,issuer_id:issuer,market:'CN',filing_id:`${issuer}:${periodEnd}`,run_id:'r',concept,source_concept:concept,statement:instant?'BS':'IS',
  period_start:instant?null:`${periodEnd.slice(0,4)}-01-01`,period_end:periodEnd,duration:instant?'INSTANT':DUR[periodEnd.slice(5,7)],value,value_text:value,unit:'CNY',consolidation:'consolidated',
  available_date:'2025-04-30',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:`h${id}`,created_at:'2025-05-01T00:00:00.000Z',disclosure_seq:1,is_current:true,is_revision:false,...o};
}
/** YTD series of one concept for one year: values for Q1 (3M), H1 (6M), 9M, FY (12M); null skips a report. */
const ytd=(issuer:string,concept:string,year:number,values:(string|null)[])=>values.flatMap((v,i)=>v===null?[]:[fact(issuer,concept,`${year}-${['03-31','06-30','09-30','12-31'][i]}`,v)]);
const issuer=(id:string,rows:FactRow[],o:Partial<IssuerFacts>={}):IssuerFacts=>({issuer_id:id,stateRev:3,truncated:false,rows,derived:deriveMetrics(rows,{market:'CN',asOf:'2025-05-15',basedOnRev:3}),...o});
/** A and B: full 2023–2024 data; numbers chosen so every expected value below is checkable by hand. */
const dataA=()=>[
 ...ytd(A,'revenue',2023,[null,null,'600','800']),...ytd(A,'revenue',2024,[null,null,'700.25','1000.5']),
 ...ytd(A,'revenue_operating',2024,[null,null,null,'900']),...ytd(A,'cost_of_revenue',2024,[null,null,null,'600']),
 ...ytd(A,'net_income_parent',2023,[null,null,'35','50']),...ytd(A,'net_income_parent',2024,['10','25','45','70']),
 fact(A,'equity_parent','2023-12-31','500'),fact(A,'equity_parent','2024-12-31','600'),
];
const dataB=()=>[
 ...ytd(B,'revenue',2023,[null,null,'1200','1600']),...ytd(B,'revenue',2024,[null,null,'1500','2000']),
 ...ytd(B,'revenue_operating',2024,[null,null,null,'1800']),...ytd(B,'cost_of_revenue',2024,[null,null,null,'1000']),
 ...ytd(B,'net_income_parent',2023,[null,null,'50','70']),...ytd(B,'net_income_parent',2024,['20','40','60','90']),
 fact(B,'equity_parent','2023-12-31','900'),fact(B,'equity_parent','2024-12-31','1100'),
];
const input=(issuers:IssuerFacts[],o:Partial<AggregateCellInput>={}):AggregateCellInput=>({code:'801120.SI',period_end:'2024-12-31',financial:false,members:issuers.map(i=>i.issuer_id),nUnresolved:0,issuers:new Map(issuers.map(i=>[i.issuer_id,i])),...o});
const cell=(cells:ManifestCell[],metric:string,duration:string)=>cells.find(c=>c.metric===metric&&c.duration===duration)!;
const roleOf=(r:ReturnType<typeof computeAggregateCell>,id:string,metric:string,duration:string)=>r.roles.find(x=>x.issuer_id===id&&x.metric===metric&&x.duration===duration);

describe('computeAggregateCell',()=>{
 it('computes every cell of a December group by the whole method with exact decimals',()=>{
  const r=computeAggregateCell(input([issuer(A,dataA()),issuer(B,dataB())],{nUnresolved:1}));
  const v=(m:string,d:string)=>cell(r.cells,m,d).value_text;
  expect(v('revenue_sum','12M')).toBe('3000.5');                 // 1000.5 + 2000
  expect(v('revenue_sum','3M')).toBe('800.25');                  // (1000.5-700.25) + (2000-1500)
  expect(v('net_income_parent_sum','12M')).toBe('160');
  expect(v('net_income_parent_sum','3M')).toBe('55');            // 25 + 30
  expect(v('gross_margin','12M')).toBe('0.4074074074');          // (2700-1600)/2700
  expect(v('roe','TTM')).toBe('0.1032258065');                   // 2·160 / (500+600+900+1100)
  expect(v('revenue_yoy','12M')).toBe('0.2502083333');           // (3000.5-2400)/2400
  expect(v('revenue_yoy','3M')).toBe('0.33375');                 // (800.25-600)/600
  expect(v('net_income_yoy','12M')).toBe('0.3333333333');        // (160-120)/120
  expect(v('net_income_yoy','3M')).toBe('0.5714285714');         // (55-35)/35
  expect(v('member_count','INSTANT')).toBe('2');
  for(const c of r.cells){expect(c).toMatchObject({status:'ok',n_members:2,n_unresolved:1,n_with_data:2});expect(c.missing_reason).toBeUndefined();}
  expect(cell(r.cells,'roe','TTM')).toMatchObject({period_start:'2024-01-01',unit:'ratio'});
  expect(cell(r.cells,'revenue_sum','12M').unit).toBe('CNY');expect(cell(r.cells,'member_count','INSTANT').unit).toBe('count');
  expect(r.roles.every(x=>x.role==='included')).toBe(true);
  expect(r.roles).toHaveLength(2*11);
  // used inputs: the direct facts plus every input of the derived rows used (q_single, ttm)
  expect(r.derived.map(d=>`${d.issuer_id===A?'A':'B'}:${d.metric}:${d.period_start}`).sort()).toEqual([
   'A:q_single_net_income_parent:2023-10-01','A:q_single_net_income_parent:2024-10-01','A:q_single_revenue:2023-10-01','A:q_single_revenue:2024-10-01','A:ttm_net_income_parent:2024-01-01',
   'B:q_single_net_income_parent:2023-10-01','B:q_single_net_income_parent:2024-10-01','B:q_single_revenue:2023-10-01','B:q_single_revenue:2024-10-01','B:ttm_net_income_parent:2024-01-01']);
  const ids=new Set(r.facts.map(f=>f.fact_id));
  for(const d of r.derived)for(const i of d.inputs)expect(ids.has(i.fact_id)).toBe(true);
  expect(r.facts.some(f=>f.concept==='net_income_parent'&&f.duration==='3M'&&f.period_end==='2024-03-31')).toBe(true);   // TTM input
  expect(r.warnings).toEqual([]);
 });
 it('missing stays missing: a member without facts is excluded (never 0) and an all-empty set is missing:empty_set',()=>{
  const r=computeAggregateCell(input([issuer(A,dataA()),issuer(C,[])]));
  expect(cell(r.cells,'revenue_sum','12M')).toMatchObject({status:'ok',value_text:'1000.5',n_members:2,n_with_data:1});
  expect(roleOf(r,C,'revenue_sum','12M')).toEqual({issuer_id:C,metric:'revenue_sum',duration:'12M',role:'excluded',reason:'missing_concept'});
  expect(cell(r.cells,'member_count','INSTANT')).toMatchObject({value_text:'2',n_with_data:2});
  const empty=computeAggregateCell(input([issuer(C,[])]));
  for(const c of empty.cells.filter(x=>x.metric!=='member_count')){expect(c).toMatchObject({status:'missing',missing_reason:'empty_set',n_with_data:0});expect(c.value_text).toBeUndefined();}
 });
 it('another unit is excluded:unit_excluded; only CNY is summed',()=>{
  const rows=dataB().map(f=>f.concept==='revenue'&&f.period_end==='2024-12-31'?{...f,unit:'USD'}:f);
  const r=computeAggregateCell(input([issuer(A,dataA()),issuer(B,rows)]));
  expect(cell(r.cells,'revenue_sum','12M')).toMatchObject({value_text:'1000.5',n_with_data:1});
  expect(roleOf(r,B,'revenue_sum','12M')?.reason).toBe('unit_excluded');
 });
 it('a truncated envelope excludes the issuer from every value cell (read_truncated) but it stays a member',()=>{
  const r=computeAggregateCell(input([issuer(A,dataA()),issuer(B,[],{truncated:true,derived:[]})]));
  for(const c of r.cells.filter(x=>x.metric!=='member_count'))expect(roleOf(r,B,c.metric,c.duration)?.reason).toBe('read_truncated');
  expect(roleOf(r,B,'member_count','INSTANT')?.role).toBe('included');
  expect(cell(r.cells,'revenue_sum','12M')).toMatchObject({value_text:'1000.5',n_members:2,n_with_data:1});
  expect(r.warnings).toEqual([`read_truncated:${B}`]);
 });
 it('a YTD pair derive refuses (revised annual in another filing) is excluded:version_inconsistent; a missing pair is missing_concept',()=>{
  const revised=[...dataA(),fact(A,'revenue','2024-12-31','1100.5',{filing_id:`${A}:restated`,disclosure_seq:2,is_revision:true,available_date:'2025-04-30'})]
   .map(f=>f.concept==='revenue'&&f.period_end==='2024-12-31'&&f.filing_id===`${A}:2024-12-31`?{...f,is_current:false}:f);
  const r=computeAggregateCell(input([issuer(A,revised),issuer(B,dataB())]));
  expect(cell(r.cells,'revenue_sum','12M').value_text).toBe('3100.5');            // the current (restated) annual value
  expect(roleOf(r,A,'revenue_sum','3M')?.reason).toBe('version_inconsistent');
  expect(cell(r.cells,'revenue_sum','3M')).toMatchObject({value_text:'500',n_with_data:1});
  const no9m=dataA().filter(f=>!(f.concept==='revenue'&&f.period_end==='2024-09-30'));
  expect(roleOf(computeAggregateCell(input([issuer(A,no9m)])),A,'revenue_sum','3M')?.reason).toBe('missing_concept');
 });
 it('yoy uses the comparable set; a zero prior sum is zero_denominator',()=>{
  const noPrior=dataB().filter(f=>!(f.concept==='revenue'&&f.period_end.startsWith('2023')));
  const r=computeAggregateCell(input([issuer(A,dataA()),issuer(B,noPrior)]));
  expect(roleOf(r,B,'revenue_yoy','12M')?.reason).toBe('not_in_comparable_set');
  expect(cell(r.cells,'revenue_yoy','12M')).toMatchObject({value_text:'0.250625',n_with_data:1});   // (1000.5-800)/800
  expect(cell(r.cells,'revenue_sum','12M').value_text).toBe('3000.5');                              // the sum is not restricted
  const zero=dataA().map(f=>f.concept==='revenue'&&f.period_end==='2023-12-31'?{...f,value:'0',value_text:'0'}:f);
  expect(cell(computeAggregateCell(input([issuer(A,zero)])).cells,'revenue_yoy','12M')).toMatchObject({status:'missing',missing_reason:'zero_denominator',n_with_data:1});
 });
 it('gross margin: financial industries are missing:financial_excluded; zero revenue is zero_denominator',()=>{
  const fin=computeAggregateCell(input([issuer(A,dataA()),issuer(B,dataB())],{financial:true}));
  expect(cell(fin.cells,'gross_margin','12M')).toMatchObject({status:'missing',missing_reason:'financial_excluded',n_with_data:0});
  expect(fin.roles.filter(x=>x.metric==='gross_margin').map(x=>x.reason)).toEqual(['financial_excluded','financial_excluded']);
  expect(cell(fin.cells,'revenue_sum','12M').status).toBe('ok');
  const zero=dataA().map(f=>f.concept==='revenue_operating'?{...f,value:'0',value_text:'0'}:f);
  expect(cell(computeAggregateCell(input([issuer(A,zero)])).cells,'gross_margin','12M').missing_reason).toBe('zero_denominator');
 });
 it('roe with a non-positive equity sum is zero_denominator; a missing opening equity excludes the issuer',()=>{
  const neg=dataA().map(f=>f.concept==='equity_parent'?{...f,value:'-600',value_text:'-600'}:f);
  expect(cell(computeAggregateCell(input([issuer(A,neg)])).cells,'roe','TTM').missing_reason).toBe('zero_denominator');
  const noOpen=dataA().filter(f=>!(f.concept==='equity_parent'&&f.period_end==='2023-12-31'));
  const r=computeAggregateCell(input([issuer(A,noOpen),issuer(B,dataB())]));
  expect(roleOf(r,A,'roe','TTM')?.reason).toBe('missing_concept');
  expect(cell(r.cells,'roe','TTM').value_text).toBe('0.09');      // 2·90 / (900+1100)
 });
 it('no members: missing no_members, or unresolved_over_limit when every constituent is unresolved',()=>{
  const none=computeAggregateCell(input([],{nUnresolved:0}));
  expect(none.cells.every(c=>c.status==='missing'&&c.missing_reason==='no_members'&&c.n_members===0)).toBe(true);
  expect(none.roles).toEqual([]);
  const unres=computeAggregateCell(input([],{nUnresolved:3}));
  expect(unres.cells.every(c=>c.missing_reason==='unresolved_over_limit'&&c.n_unresolved===3)).toBe(true);
 });
 it('a March group has 3M, TTM and INSTANT cells only; every member needs an envelope',()=>{
  const r=computeAggregateCell(input([issuer(A,dataA())],{period_end:'2025-03-31'}));
  expect(r.cells.map(c=>`${c.metric}/${c.duration}`)).toEqual(['revenue_sum/3M','net_income_parent_sum/3M','roe/TTM','revenue_yoy/3M','net_income_yoy/3M','member_count/INSTANT']);
  expect(()=>computeAggregateCell({...input([issuer(A,dataA())]),members:[A,B]})).toThrow(`missing_envelope:${B}`);
 });
});
