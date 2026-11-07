// F4 judgment response handling (spec §3.2): tolerant card extraction, percent only when numeric, contributions.
import {describe,expect,it} from 'vitest';
import type {JudgmentCardView} from '@/lib/macro/judgment-contract';
import {parseJudgments,contributionText,contributionsFrom,percentOf,clockFrom,basisFrom} from './judgment-view';
// `satisfies` keeps lifecycle/calibration as their literal types (an unannotated literal widens them to string; 第 4 稿 P1-1).
const card={judgment_id:'j1',lifecycle:'open',calibration:'insufficient_sample',as_of:'2026-11-03T03:20:00Z',methodology:{id:'macro_regime',version:'1.0',title:{zh:'宏观状态',en:'Macro regime'},href:'/methods/macro_regime'},display:{headline:{zh:'复苏',en:'Recovery'},percent:null,value:null}} satisfies JudgmentCardView;
describe('judgment view',()=>{
 it('accepts an array, {judgments}, {cards} or {judgment}; a valid empty list is ok, anything malformed is not',()=>{
  expect(parseJudgments([card])).toMatchObject({ok:true,cards:[{judgment_id:'j1',input_snapshot_id:null}]});
  expect(parseJudgments({judgments:[card]})).toMatchObject({ok:true});
  expect(parseJudgments({cards:[card]})).toMatchObject({ok:true});expect(parseJudgments({judgment:card})).toMatchObject({ok:true});
  expect(parseJudgments([])).toEqual({ok:true,cards:[]});expect(parseJudgments({judgments:[]})).toEqual({ok:true,cards:[]});
  expect(parseJudgments({judgments:[card,{judgment_id:3}]})).toEqual({ok:false});
  expect(parseJudgments({error:'x'})).toEqual({ok:false});expect(parseJudgments(null)).toEqual({ok:false});expect(parseJudgments('x')).toEqual({ok:false});
 });
 it('every rendered nested field is validated',()=>{
  expect(parseJudgments([{...card,methodology:{}}])).toEqual({ok:false});
  expect(parseJudgments([{...card,methodology:{...card.methodology,title:{zh:'x'}}}])).toEqual({ok:false});
  expect(parseJudgments([{...card,methodology:{...card.methodology,href:'javascript:alert(1)'}}])).toEqual({ok:false});
  expect(parseJudgments([{...card,display:{headline:{zh:'a'},percent:null}}])).toEqual({ok:false});
  expect(parseJudgments([{...card,display:{...card.display,percent:'62'}}])).toEqual({ok:false});
  expect(parseJudgments([{...card,lifecycle:'weird'}])).toEqual({ok:false});
  expect(parseJudgments([{...card,abstain_reason:3}])).toEqual({ok:false});
 });
 it('the input snapshot id is read from the card, never assumed',()=>{
  expect(parseJudgments([{...card,input_snapshot_id:'s1'}])).toMatchObject({cards:[{input_snapshot_id:'s1'}]});
  expect(parseJudgments([{...card,inputs:{snapshot_id:'s2'}}])).toMatchObject({cards:[{input_snapshot_id:'s2'}]});
 });
 it('percent only when display.percent is a finite number',()=>{
  expect(percentOf(card)).toBeNull();
  expect(percentOf({...card,display:{...card.display,percent:62}})).toBe(62);
  expect(percentOf({...card,display:{...card.display,percent:'62' as unknown as number}})).toBeNull();
 });
 it('contributions from the snapshot response',()=>{
  const c={series_id:'US_CPI_YOY',observation_id:'o',rule_id:'infl.yoy',weight:15,support:{},contribution:{recovery:0,overheat:4.5,stagflation:0,recession:0}};
  expect(contributionsFrom({contributions:[c,{bad:1}]})).toEqual([c]);
  expect(contributionsFrom({regime:{contributions:[c]}})).toEqual([c]);
  expect(contributionsFrom({})).toEqual([]);
  expect(contributionsFrom({contributions:[{...c,contribution:{overheat:'4'}}]})).toEqual([]);
  expect(contributionText(c)).toBe('overheat 4.5');
 });
});

describe('live clock selection',()=>{
 const live={...card,calibration:'insufficient',judgment_type:'macro_regime',kind:'categorical',subject:{type:'macro_region',key:'US'},retrospective:false,methodology:{...card.methodology,version:'v2'},display:{...card.display,value:'overheat'},inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'exact-input'}}]};
 const select=(raw:unknown)=>{const p=parseJudgments(raw);return clockFrom(p.ok?p.cards:[], 'US');};
 it('uses only the F4 selected value, not the headline, and reads the actual input array',()=>{
  expect(select({cards:[live]})).toMatchObject({selected:'overheat',card:{input_snapshot_id:'exact-input'}});
 });
 it.each(['recovery','overheat','stagflation','recession'])('accepts validated %s',value=>{
  expect(select({cards:[{...live,display:{...live.display,value}}]}).selected).toBe(value);
 });
 it.each(['abstained','void','withdrawn','settled','pending_fill'])('leaves %s unselected even if a category remains',lifecycle=>{
  expect(select([{...live,lifecycle,abstain_reason:'coverage'}]).selected).toBeNull();
 });
 it('rejects wrong methods, wrong region, retrospective and missing selected values without headline inference',()=>{
  for(const invalid of [{...live,methodology:{...live.methodology,version:'v1'}},{...live,subject:{type:'macro_region',key:'CN'}},{...live,retrospective:true},{...live,kind:'probability'},{...live,display:{...live.display,value:null}},{...live,inputs:[]}])expect(select([invalid]).selected).toBeNull();
  expect(select([])).toMatchObject({selected:null,reason:'missing'});
 });
 it('does not interpret categorical percentages or a headline as a live claim',()=>{
  expect(select([{...live,display:{...live.display,percent:92}}])).toMatchObject({selected:null,reason:'invalid'});
  expect(select([{...live,inputs:undefined,input_snapshot_id:'legacy-only'}])).toMatchObject({selected:null,reason:'snapshot'});
  expect(parseJudgments({cards:[{...live,methodology:{...live.methodology,href:'https://other.example/method'}}]})).toEqual({ok:false});
 });
 it('does not fall back to an older open card when the latest is withdrawn or ambiguous',()=>{
  expect(select([live,{...live,lifecycle:'withdrawn'}]).selected).toBeNull();
 });
 it('requires the basis DTO to identify the requested snapshot',()=>{
  const c={series_id:'US_CPI_YOY',observation_id:'o',rule_id:'infl.gt4',weight:15,support:{},contribution:{recovery:0,overheat:6,stagflation:9,recession:0}};
  expect(basisFrom({snapshot:{snapshot_id:'exact-input'},contributions:[c]},'exact-input')).toEqual([c]);
  expect(basisFrom({snapshot:{snapshot_id:'current'},contributions:[c]},'exact-input')).toBeNull();
 });
});
