import {describe,expect,it} from 'vitest';
import {toCard} from '@/lib/judgments/display';
import {envelope} from '@/lib/judgments/testing/envelopes';
import {serializeBody} from '@/lib/judgments/route-utils';
import {cardBody,visiblePercent} from '@/components/judgments/view-model';
import {checkJudgmentsResponse,companyJudgmentCard,displayPercent,judgmentsUrl} from './judgments';

const issuer='11111111-1111-4111-8111-111111111111';
const card=()=>serializeBody(toCard(envelope(),{title:{zh:'测试',en:'Test'},now:'2026-06-30T23:59:59.999Z'}));
const body=(c:unknown,asOf:string|null=null)=>({codeVersion:'abc1234',subject:{type:'issuer',key:issuer},view:asOf?'as_known':'latest',asOf,cards:[c]});

describe('company ↔ F4 contract',()=>{
 it('requests latest and as_known using F4 parameter names',()=>{
  expect(judgmentsUrl(issuer,null)).toBe(`/api/judgments?subject_type=issuer&subject_key=${issuer}&view=latest`);
  expect(judgmentsUrl(issuer,'2026-06-30')).toBe(`/api/judgments?subject_type=issuer&subject_key=${issuer}&view=as_known&asOf=2026-06-30`);
 });
 it('strips a calibrated percentage after void while retaining F4 card semantics',()=>{
  const c=card();c.calibration='calibrated';c.lifecycle='void';c.display.percent=70;
  const parsed=checkJudgmentsResponse(body(c),null);expect(parsed.ok).toBe(true);
  if(parsed.ok){expect(displayPercent(parsed.cards[0])).toBeNull();expect(visiblePercent(companyJudgmentCard(parsed.cards[0]))).toBeNull();}
 });
 it('accepts F4 serialization, including omitted uncalibrated percent and null input href',()=>{
  const c=card();expect(c.display).not.toHaveProperty('percent');
  const r=checkJudgmentsResponse(body(c),null);
  expect(r.ok).toBe(true);
  if(r.ok){expect(r.cards[0].inputs[0].href).toBeNull();expect(displayPercent(r.cards[0])).toBeNull();expect(visiblePercent(r.cards[0])).toBeNull();expect(cardBody(r.cards[0],'en').type).toBe('band');}
 });
 it('rejects view and replay echoes',()=>{
  expect(checkJudgmentsResponse(body(card()),'2026-06-30')).toEqual({ok:false,reason:'view_mismatch'});
  expect(checkJudgmentsResponse(body(card(),'2026-06-30'),'2026-06-29')).toEqual({ok:false,reason:'asof_mismatch'});
 });
 it('rejects late registration, settlement and calibration timestamps',()=>{
  const c=card();c.registered_at='2026-07-01T00:00:00Z';
  expect(checkJudgmentsResponse(body(c,'2026-06-30'),'2026-06-30')).toEqual({ok:false,reason:'post_cutoff'});
  const s=card() as typeof c&{settlement:unknown};s.settlement={kind:'settled',outcome:'hit',realized:null,settled_at:'2026-07-01T00:00:00Z',evidence_summary:{zh:'结果',en:'result'}};
  expect(checkJudgmentsResponse(body(s,'2026-06-30'),'2026-06-30')).toEqual({ok:false,reason:'post_cutoff'});
  const cal=card() as typeof c&{calibration_summary:unknown};cal.calibration_summary={n_independent:0,n_total:0,threshold_n:30,brier:null,brier_skill:null,ece_raw_holdout:null,valid_until:'2026-07-30T00:00:00Z',hit_rate:null,href:'/method',computed_at:'2026-07-01T00:00:00Z'};
  expect(checkJudgmentsResponse(body(cal,'2026-06-30'),'2026-06-30')).toEqual({ok:false,reason:'post_cutoff'});
 });
 it('F4 serializes calibration provenance for replay validation',()=>{
  const c=serializeBody(toCard(envelope({calibration:{computed_at:'2026-06-01T00:00:00Z',valid_until:'2026-07-30T00:00:00Z'}}),{title:{zh:'测试',en:'Test'},now:'2026-06-30T23:59:59.999Z'}));
  expect(c.calibration_summary?.computed_at).toBe('2026-06-01T00:00:00Z');
  expect(checkJudgmentsResponse(body(c,'2026-06-30'),'2026-06-30').ok).toBe(true);
 });
 it('accepts zero counts and every F4 nullable display and settlement variant',()=>{
  const c=card() as Record<string,any>;
  c.display.value=null;
  c.calibration_summary={n_independent:0,n_total:0,threshold_n:0,brier:null,brier_skill:null,ece_raw_holdout:null,valid_until:'2026-07-30T00:00:00Z',hit_rate:null,href:'/method'};
  c.settlement={kind:'void',outcome:null,realized:null,settled_at:'2026-03-02T00:00:00Z',evidence_summary:{zh:'无效',en:'void'}};
  expect(checkJudgmentsResponse(body(c),null).ok).toBe(true);
  c.kind='interval';c.display.value=[-1,2];expect(checkJudgmentsResponse(body(c),null).ok).toBe(true);
 });
 it('accepts the F4 self_assessed and nullable condition variants without inventing a percentage',()=>{
  const c=card() as Record<string,any>;c.calibration='self_assessed';c.condition=null;c.calibration_summary=null;c.display.value=null;
  expect(checkJudgmentsResponse(body(c),null).ok).toBe(true);
  expect(displayPercent(c as any)).toBeNull();
 });
 it.each(['financial_fact','financial_metric','macro_observation','macro_snapshot','price_bar','table_rows','judgment','legacy_fill','document_span'])('accepts F4 input kind %s with typed origin',kind=>{
  const c=card() as Record<string,any>;c.inputs[0]={kind,ref:{},available_at:'2026-01-02T00:00:00Z',origin:{publisher:'x',adapter:'x',locator:'x'},href:null};
  expect(checkJudgmentsResponse(body(c),null).ok).toBe(true);
 });
 it.each([{range:[]},{range:[2,1]},{range:[0,1,2]}])('rejects invalid interval bounds $range',({range})=>{
  const c=card() as Record<string,any>;c.kind='interval';c.display.value=range;
  expect(checkJudgmentsResponse(body(c),null)).toEqual({ok:false,reason:'malformed'});
 });
 it('rejects unknown fields throughout the typed F4 card',()=>{
  for(const mutate of [(c:Record<string,any>)=>{c.unknown=true;},(c:Record<string,any>)=>{c.subject.unknown=true;},(c:Record<string,any>)=>{c.inputs[0].origin.unknown=true;},(c:Record<string,any>)=>{c.settlement={kind:'settled',outcome:'hit',realized:{value:'',unit:null,from:null,to:null,label_policy:'first_observed'},settled_at:'2026-03-02T00:00:00Z',evidence_summary:{zh:'x',en:'x'}};}]){
   const c=card() as Record<string,any>;mutate(c);expect(checkJudgmentsResponse(body(c),null)).toEqual({ok:false,reason:'malformed'});
  }
 });
 it('requires merge metadata to name the original issuer',()=>{
  const c=card() as Record<string,any>;c.subject.key='22222222-2222-4222-8222-222222222222';c.merged_from='33333333-3333-4333-8333-333333333333';
  expect(checkJudgmentsResponse(body(c),null)).toEqual({ok:false,reason:'malformed'});
  c.merged_from=c.subject.key;expect(checkJudgmentsResponse(body(c),null).ok).toBe(true);
 });
 it.each([
  ['subject key',c=>{c.subject.key=7;}],['method href',c=>{c.methodology.href='javascript:alert(1)';}],
  ['input href',c=>{c.inputs[0].href='//evil.test';}],['input origin',c=>{delete c.inputs[0].origin;}],
  ['condition target',c=>{c.condition.target={kind:'bogus'};}],['settlement kind',c=>{c.settlement={kind:'resolved',outcome:'hit',settled_at:'2026-03-01T00:00:00Z'};}],
  ['uncalibrated percent',c=>{c.display.percent=70;}],['display band',c=>{c.display.band='huge';}],
 ] as Array<[string,(c:Record<string,any>)=>void]>)('fails closed on incompatible %s',(_name,mut)=>{
  const c=card() as unknown as Record<string,any>;mut(c);
  expect(checkJudgmentsResponse(body(c),null)).toEqual({ok:false,reason:'malformed'});
 });
});
