import {describe,it,expect} from 'vitest';
import type {FactRow} from '../facts/types';
import type {IssuerFacts} from './aggregate';
import {computeAggregateCellUs,pickInputsUs} from './aggregate-us';
import {buildAggregateManifest} from './manifest';
import {CONFIG_HASH_US,CONFIG_HASH_US_V1_0,cellSpecsUs} from './method-us';
import {replayFromManifest,replayCell} from './replay';
let seq=0;
export function usFact(concept:string,value:string,o:Partial<FactRow>={}):FactRow{
 return {fact_id:`us-${++seq}`,issuer_id:'A',market:'US',filing_id:'filing',run_id:'run',concept,source_concept:concept,statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:'2026-02-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'hash',created_at:'2026-02-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...o};
}
const env=(rows:FactRow[],o:Partial<IssuerFacts>={}):IssuerFacts=>({issuer_id:'A',stateRev:1,truncated:false,rows,derived:[],...o});
const compute=(rows:FactRow[],o:{code?:string;truncated?:boolean;members?:string[]}={})=>computeAggregateCellUs({code:o.code??'2000',period_end:'2025-12-31',members:o.members??['A'],issuers:new Map([['A',env(rows,{truncated:o.truncated??false})]])});
const cell=(r:ReturnType<typeof compute>,metric='revenue_sum')=>r.cells.find(c=>c.metric===metric)!;
const reason=(r:ReturnType<typeof compute>,metric='revenue_sum')=>r.roles.find(c=>c.metric===metric)?.reason;
describe('US fiscal bucket aggregation',()=>{
 it('sums exact decimals, ratios and comparable-set YoY',()=>{
  const rows=[usFact('revenue','0.3'),usFact('net_income_parent','0.1'),usFact('gross_profit','0.2'),usFact('revenue','0.2',{period_start:'2024-01-01',period_end:'2024-12-31'})];
  const r=compute(rows);
  expect(cell(r).value_text).toBe('0.3');expect(cell(r,'net_margin').value_text).toBe('0.3333333333');expect(cell(r,'gross_margin').value_text).toBe('0.6666666667');expect(cell(r,'revenue_yoy').value_text).toBe('0.5');
  const b=env([usFact('revenue','0.1',{issuer_id:'B'})],{issuer_id:'B'});
  const sum=computeAggregateCellUs({code:'2000',period_end:'2025-12-31',members:['A','B'],issuers:new Map([['A',env(rows)],['B',b]])});
  expect(cell(sum).value_text).toBe('0.4');expect(cell(sum,'revenue_yoy')).toMatchObject({value_text:'0.5',n_with_data:1});
 });
 it.each(['2025-09-27','2025-01-31'])('retains actual fiscal periods for %s in bucket 2025',pe=>{
  const r=compute([usFact('revenue','12',{period_start:'2024-09-29',period_end:pe})]);
  expect(cell(r)).toMatchObject({value_text:'12',period_start:'2025-01-01'});expect(r.facts[0].period_end).toBe(pe);
 });
 it('excludes ambiguous USD periods even with other currencies present',()=>expect(reason(compute([usFact('revenue','1'),usFact('revenue','2',{period_end:'2025-01-31'}),usFact('revenue','3',{unit:'EUR'})]))).toBe('ambiguous_period'));
 it('keeps a CNY SEC reporter in the denominator only',()=>{
  const r=compute([usFact('revenue','10',{unit:'CNY'})]);expect(reason(r)).toBe('unit_excluded');expect(cell(r)).toMatchObject({status:'missing',n_members:1,n_with_data:0,missing_reason:'empty_set'});
 });
 const foreign=[['Baidu','129079000000','18458000000'],['JD.com','1309085000000','187197000000'],['PDD Holdings','431845713000','61753116000']] as const;
 const usdOnly=[['Daqo New Energy','665415000'],['Grab Holdings','3370000000']] as const;
 const revenue=(issuer_id:string,value:string,unit='USD')=>usFact('revenue',value,{issuer_id,unit});
 const industry=(rows:FactRow[])=>{
  const members=[...new Set(rows.map(f=>f.issuer_id))];
  return computeAggregateCellUs({code:'2000',period_end:'2025-12-31',members,issuers:new Map(members.map(id=>[id,env(rows.filter(f=>f.issuer_id===id),{issuer_id:id})]))});
 };
 it.each(foreign)('excludes the USD translation for %s', (issuer_id,cny,usd)=>{
  const r=industry([revenue(issuer_id,cny,'CNY'),revenue(issuer_id,usd),usFact('net_income_parent','7',{issuer_id,unit:'CNY'}),usFact('net_income_parent','1',{issuer_id})]);
  for(const metric of ['revenue_sum','net_income_parent_sum','net_margin'])expect(reason(r,metric)).toBe('dual_currency');
  expect(cell(r)).toMatchObject({status:'missing',missing_reason:'empty_set',n_members:1,n_with_data:0});
 });
 it.each(usdOnly)('includes USD-only reporter %s',(id,value)=>expect(cell(industry([revenue(id,value)]))).toMatchObject({value_text:value,n_with_data:1}));
 it('counts all three members while summing only USD reporters',()=>{
  const [id,cny,usd]=foreign[0],r=industry([revenue(id,cny,'CNY'),revenue(id,usd),...usdOnly.map(([name,value])=>revenue(name,value))]);
  expect(cell(r)).toMatchObject({value_text:'4035415000',n_members:3,n_with_data:2});
  expect(cell(r,'member_count').value_text).toBe('3');
 });
 it('checks other concepts for a matching non-USD period',()=>{
  const r=compute([usFact('revenue','10'),usFact('gross_profit','4'),usFact('net_income_parent','1'),usFact('net_income_parent','7',{unit:'CNY'})]);
  for(const metric of ['revenue_sum','gross_margin'])expect(reason(r,metric)).toBe('dual_currency');
 });
 it('requires both fiscal dates to match',()=>{
  for(const dates of [{period_start:'2025-01-02'},{period_end:'2025-12-30'}])expect(cell(compute([usFact('revenue','2'),usFact('revenue','3',{unit:'EUR',...dates})])).value_text).toBe('2');
 });
 it('distinguishes a dual-currency prior year from a dual-currency current year for YoY',()=>{
  const prior={period_start:'2024-01-01',period_end:'2024-12-31'},rows=[usFact('revenue','2'),usFact('revenue','1',prior)];
  expect(reason(compute([...rows,usFact('revenue','7',{...prior,unit:'CNY'})]),'revenue_yoy')).toBe('not_in_comparable_set');
  expect(reason(compute([...rows,usFact('revenue','14',{unit:'CNY'})]),'revenue_yoy')).toBe('dual_currency');
 });
 it('picks the single USD row alongside another currency under the legacy rule',()=>{
  const rows=[usFact('revenue','2'),usFact('revenue','3',{unit:'EUR'})];
  expect(pickInputsUs(cellSpecsUs('2025-12-31')[0],'A',rows,{dualCurrency:false})).toMatchObject({ok:true,values:['2']});
 });
 it('requires current ok consolidated annual rows in this bucket',()=>{
  for(const o of [{is_current:false},{status:'quarantined' as const},{consolidation:'standalone' as const},{duration:'3M' as const},{period_end:'2026-01-01'}])expect(reason(compute([usFact('revenue','1',o)]))).toBe('missing_concept');
 });
 it('requires ratios to have identical actual periods',()=>{
  const r=compute([usFact('revenue','10'),usFact('gross_profit','3',{period_start:'2024-12-31'}),usFact('net_income_parent','2',{period_end:'2025-09-27'})]);
  expect(reason(r,'gross_margin')).toBe('period_mismatch');expect(reason(r,'net_margin')).toBe('period_mismatch');
 });
 it('requires a picked prior year for YoY',()=>{
  expect(reason(compute([usFact('revenue','10')]),'revenue_yoy')).toBe('not_in_comparable_set');
  expect(reason(compute([]),'revenue_yoy')).toBe('missing_concept');
 });
 it('excludes financial gross margins only in 6000–6799',()=>{
  for(const code of ['6000','6799']){const r=compute([],{code});expect(reason(r,'gross_margin')).toBe('financial_excluded');expect(cell(r,'gross_margin').missing_reason).toBe('financial_excluded');}
  for(const code of ['5999','6800'])expect(reason(compute([],{code}),'gross_margin')).toBe('missing_concept');
 });
 it('excludes truncated envelopes from every value cell',()=>{
  const r=compute([usFact('revenue','1')],{truncated:true});expect(r.roles.filter(x=>x.metric!=='member_count').every(x=>x.reason==='read_truncated')).toBe(true);expect(cell(r,'member_count').status).toBe('ok');
 });
 it('preserves zero denominator and no member status precedence',()=>{
  expect(cell(compute([usFact('revenue','0'),usFact('net_income_parent','1')]),'net_margin')).toMatchObject({missing_reason:'zero_denominator',n_with_data:1});
  expect(compute([],{members:[],code:'6000'}).cells.every(c=>c.missing_reason==='no_members')).toBe(true);
 });
 it.each(['industry-agg-us/1.0','industry-agg-us/1.1'])('replays a %s manifest offline and detects a tampered value',method_version=>{
  const result=compute([usFact('revenue','10',{period_start:'2024-09-29',period_end:'2025-09-27'}),usFact('net_income_parent','2',{period_start:'2024-09-29',period_end:'2025-09-27'})]);
  const m=buildAggregateManifest({header:{scheme:'sic',version:'sec-current',code:'2000',level:1,period_end:'2025-12-31',facts_as_of:'2026-04-01',knowledge_date:'2026-04-01',history_class:'reconstruction',method_version,config_hash:method_version==='industry-agg-us/1.0'?CONFIG_HASH_US_V1_0:CONFIG_HASH_US,formula_version:'facts-derive/1.0',code_version:'test'},members:[{issuer_id:'A',ticker:null,valid_from:'2026-04-01',valid_to:null,available_date:'2026-04-01',valid_to_available_date:null,source_membership_id:null,raw_hash:null,locator:null,resolution_method:null}],unresolved:[],memberStateRevs:[{issuer_id:'A',state_rev:1}],result,filings:new Map()});
  expect(replayFromManifest(m)).toMatchObject({reproduced:true,cells:m.cells});expect(replayCell(m,m.cells[0]).reproduced).toBe(true);
  const tampered=structuredClone(m);tampered.facts.find(f=>f.concept==='revenue')!.value_text='20';expect(replayFromManifest(tampered).reproduced).toBe(false);
 });
});
