// src/lib/judgments/display.test.ts
// spec §14.1 display bullets: lifecycle × calibration, probability band without percent, self_assessed
// never a percent, expired / invalidated rows → insufficient, publishable=false → no card, derived
// odds gates, bilingual headlines; plus acceptance examples 4 (percent only once calibrated) and 5/10
// (a withdrawn judgment, and an invalidated report showing insufficient).
import {describe,expect,it} from 'vitest';
import {digest} from './canonical';
import {CALIBRATION_STATES_BY_KIND,REACHABLE_COMBINATIONS,bandOf,calibrationStateOf,cardsOf,derivedOdds,lifecycleOf,methodKey,toCard} from './display';
import {calibrationRow,envelope,methodologyRow} from './testing/envelopes';
import type {EnvelopeSpec} from './testing/envelopes';
import type {Condition,Envelope,IntervalClaim,Kind} from './types';

const TITLE={zh:'合成事实判断',en:'Synthetic fact judgment'};
const NOW='2026-11-10T00:00:00.000Z';
const card=(spec:EnvelopeSpec)=>toCard(envelope(spec),{title:TITLE,now:NOW});
const CAL={state:'calibrated' as const};

describe('lifecycle and calibration state',()=>{
 it('lifecycle from the latest settlement; reopened is open again; abstained wins',()=>{
  expect(lifecycleOf(envelope())).toBe('open');
  expect(lifecycleOf(envelope({settlement:{}}))).toBe('settled');
  expect(lifecycleOf(envelope({settlement:{kind:'void',outcome:null,realized:null,reason:'no_data:late'}}))).toBe('void');
  expect(lifecycleOf(envelope({settlement:{kind:'withdrawn',outcome:null,realized:null,reason:'bad label'}}))).toBe('withdrawn');
  expect(lifecycleOf(envelope({settlement:{kind:'reopened',outcome:null,realized:null,reason:'fix'}}))).toBe('open');
  expect(lifecycleOf(envelope({judgment:{abstained:true,abstain_reason:'missing',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null}}))).toBe('abstained');
 });
 it('calibration: valid all-scope row of the same method and kind only; invalid, expired, other scope or kind → insufficient',()=>{
  expect(calibrationStateOf(envelope({calibration:CAL}),'probability',NOW)).toBe('calibrated');
  expect(calibrationStateOf(envelope({calibration:{state:'failed'}}),'probability',NOW)).toBe('failed');
  expect(calibrationStateOf(envelope(),'probability',NOW)).toBe('insufficient');
  expect(calibrationStateOf(envelope({calibration:CAL,calibration_valid:false}),'probability',NOW)).toBe('insufficient');
  expect(calibrationStateOf(envelope({calibration:{...CAL,valid_until:'2026-11-09T23:59:59.999Z'}}),'probability',NOW)).toBe('insufficient');
  expect(calibrationStateOf(envelope({calibration:{...CAL,scope_type:'market',scope_key:'A'}}),'probability',NOW)).toBe('insufficient');
  expect(calibrationStateOf(envelope({calibration:{...CAL,methodology_version:'v2'}}),'probability',NOW)).toBe('insufficient');
  expect(calibrationStateOf(envelope({calibration:{...CAL,kind:'interval'}}),'probability',NOW)).toBe('insufficient');
 });
 it('score rows are evaluated or insufficient, never calibrated',()=>{
  expect(calibrationStateOf(envelope({calibration:{kind:'score',state:'evaluated'}}),'score',NOW)).toBe('evaluated');
  expect(calibrationStateOf(envelope({calibration:{kind:'score',state:'insufficient'}}),'score',NOW)).toBe('insufficient');
  expect(calibrationStateOf(envelope({calibration:{kind:'score',state:'calibrated'}}),'score',NOW)).toBe('insufficient');
 });
 it('reachable combinations: percent only for probability × calibrated, band for every other probability state, private cards are self_assessed',()=>{
  for(const c of REACHABLE_COMBINATIONS){
   expect(CALIBRATION_STATES_BY_KIND[c.kind].includes(c.calibration)||c.calibration==='self_assessed').toBe(true);
   if(c.source==='recommendation')expect(c).toMatchObject({kind:'probability',calibration:'self_assessed',percent:false});
   if(c.lifecycle==='settled')expect(c.outcome).not.toBeNull();else expect(c.outcome).toBeNull();
  }
  expect(REACHABLE_COMBINATIONS.some(c=>c.kind==='score'&&c.calibration==='calibrated')).toBe(false);
  expect(REACHABLE_COMBINATIONS.some(c=>c.source==='public'&&c.lifecycle==='pending_fill')).toBe(false);
  expect(REACHABLE_COMBINATIONS.filter(c=>c.source==='recommendation').map(c=>c.lifecycle)).toEqual(['abstained','pending_fill','open','settled','settled','withdrawn']);
  expect(REACHABLE_COMBINATIONS).toHaveLength(3*3*6+2*6+6);
 });
 it('every public combination, built as a real envelope, renders what REACHABLE_COMBINATIONS says (percent / band presence, lifecycle, calibration, outcome)',()=>{
  const claims:Record<Kind,unknown>={probability:{p:0.7,event:{zh:'事件',en:'event'}},categorical:{selected:'recovery',classes:['recovery'],scores_are_not_probabilities:true},
   score:{value:1,scale:{min:0,max:10},dims:[],coverage:1,realized_metric:'m'},interval:{metric:'m',low:0,high:1,unit:'u',nominal_coverage:0.5}};
  for(const c of REACHABLE_COMBINATIONS.filter(x=>x.source==='public')){
   const abst={abstained:true,abstain_reason:'x',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null};
   const judgment={kind:c.kind,claim:claims[c.kind],...(c.lifecycle==='abstained'?abst:{})} as EnvelopeSpec['judgment'];
   const settlement=c.lifecycle==='settled'?{outcome:c.outcome}:c.lifecycle==='void'?{kind:'void' as const,outcome:null,realized:null,reason:'r'}:c.lifecycle==='withdrawn'?{kind:'withdrawn' as const,outcome:null,realized:null,reason:'r'}:undefined;
   const calibration=c.calibration==='insufficient'?undefined:{kind:c.kind,state:c.calibration as 'failed'|'calibrated'|'evaluated'};
   const k=toCard(envelope({judgment,settlement,calibration}),{title:TITLE,now:NOW});
   const label=JSON.stringify(c);
   expect(k.lifecycle,label).toBe(c.lifecycle);expect(k.calibration,label).toBe(c.calibration);expect(k.outcome,label).toBe(c.outcome);
   expect(k.display.percent!==null,label).toBe(c.percent);expect(k.display.band!==undefined,label).toBe(c.band);
  }
 });
 it('an expired report never speaks: valid_until 2026-01-01 at 2026-11-06 → insufficient, no percent, no % in the headline (K-01)',()=>{
  const k=toCard(envelope({calibration:{state:'calibrated',valid_until:'2026-01-01T00:00:00.000Z'}}),{title:TITLE,now:'2026-11-06T00:00:00.000Z'});
  expect(k.calibration).toBe('insufficient');expect(k.display.percent).toBeNull();expect(k.display.headline.zh).not.toContain('%');expect(k.display.headline.en).not.toContain('%');
  expect(k.calibration_summary).toBeNull();
 });
 it('a non-probability claim p (NaN, >1, <0, Infinity) is invalid: no percent, no band, invalid_claim marker (K-03)',()=>{
  for(const p of [NaN,1.5,-0.1,Infinity]){
   const k=card({judgment:{claim:{p,event:{zh:'事件',en:'event'}}},calibration:CAL});
   expect(k.display.percent,String(p)).toBeNull();expect(k.display.band).toBeUndefined();expect(k.missing).toEqual(['invalid_claim']);
   expect(k.display.headline.en).toContain('invalid claim');expect(k.display.headline.zh).not.toContain('%');
  }
  expect(card({}).missing).toBeUndefined();
 });
});

describe('toCard rendering (spec §9.3)',()=>{
 it('probability uncalibrated: percent null, band by tertile, sample count in the headline, raw p not on the card',()=>{
  const c=card({calibration:{state:'insufficient',n_independent:42,threshold_n:100}});
  expect(c.calibration).toBe('insufficient');
  expect(c.display.percent).toBeNull();
  expect(c.display.band).toBe('high');
  expect(c.display.value).toBeNull();
  expect(c.display.headline).toEqual({zh:'营收同比增长：信心高（未校准：有效样本 42/100）',en:'Revenue grows year over year: high confidence (uncalibrated: 42/100 independent samples)'});
  expect(JSON.stringify(c.display)).not.toContain('0.7');
  expect(JSON.stringify(c.display)).not.toContain('70');
 });
 it('band boundaries [0,1/3) [1/3,2/3) [2/3,1]',()=>{
  expect([0,0.33,1/3,0.5,0.6666,2/3,1].map(bandOf)).toEqual(['low','low','mid','mid','mid','high','high']);
 });
 it('probability failed: ECE in the headline, no percent',()=>{
  const c=card({calibration:{state:'failed',metrics:{temporal_split:{ece_raw_holdout:0.12}}}});
  expect(c.display.percent).toBeNull();
  expect(c.display.headline.zh).toBe('营收同比增长：信心高（校准未通过：ECE 0.12）');
 });
 it('probability calibrated: percent = round(p × 100), summary carried (acceptance example 4)',()=>{
  const c=card({calibration:CAL});
  expect(c.display).toMatchObject({percent:70,headline:{zh:'营收同比增长：70%',en:'Revenue grows year over year: 70%'}});
  expect(c.display.band).toBeUndefined();
  expect(c.calibration_summary).toMatchObject({n_independent:110,n_total:118,threshold_n:100,brier:0.18,brier_skill:0.21,ece_raw_holdout:0.06,hit_rate:{rate:0.64,low:0.55,high:0.72},href:'/intel/methods/synthetic_fact_metric/v1#calibration'});
 });
 it('an invalidated report (withdrawal bumped the revision) shows insufficient and no percent (acceptance examples 5 and 10)',()=>{
  const c=card({calibration:CAL,calibration_valid:false});
  expect(c.calibration).toBe('insufficient');
  expect(c.display.percent).toBeNull();
  expect(c.calibration_summary).toBeNull();
 });
 it('settled overlay, void and withdrawn reasons, retrospective flag',()=>{
  expect(card({settlement:{outcome:'miss'}}).display.headline.zh).toBe('营收同比增长：信心高（未校准） · 结果：未命中');
  const s=card({settlement:{outcome:'hit'}});
  expect(s).toMatchObject({lifecycle:'settled',outcome:'hit'});
  expect(s.settlement).toMatchObject({kind:'settled',outcome:'hit',evidence_summary:{zh:'fact_metric@1',en:'fact_metric@1'}});
  const v=card({settlement:{kind:'void',outcome:null,realized:null,reason:'no_data:late'}});
  expect(v).toMatchObject({lifecycle:'void',outcome:null});
  expect(v.display.headline.en).toContain(' · void: no_data:late');
  const w=card({settlement:{kind:'withdrawn',outcome:null,realized:null,reason:'label error'}});
  expect(w.lifecycle).toBe('withdrawn');expect(w.display.headline.zh).toContain('已撤回：label error');
  expect(card({judgment:{retrospective:true}}).retrospective).toBe(true);
 });
 it('abstained: reason headline, no condition, inputs may be empty',()=>{
  const c=card({judgment:{abstained:true,abstain_reason:'market_unsupported',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null,inputs:[]}});
  expect(c).toMatchObject({lifecycle:'abstained',condition:null,abstain_reason:'market_unsupported',inputs:[]});
  expect(c.display).toEqual({headline:{zh:'未判断：market_unsupported',en:'No judgment: market_unsupported'},percent:null,value:null});
 });
 it('categorical: selected class, no distribution and no percent unless calibrated accuracy',()=>{
  const cat={kind:'categorical' as Kind,judgment_type:'macro_regime' as const,claim:{selected:'overheat',classes:['recovery','overheat','stagflation','recession'],distribution:{recovery:0.2,overheat:0.5,stagflation:0.2,recession:0.1},scores_are_not_probabilities:true,margin_pp:30}};
  const u=card({judgment:cat});
  expect(u.display).toMatchObject({percent:null,value:'overheat',headline:{zh:'判定：过热（未校准）',en:'Call: overheat (uncalibrated)'}});
  expect(JSON.stringify(u)).not.toContain('distribution');
  const c=card({judgment:cat,calibration:{kind:'categorical',state:'calibrated',metrics:{accuracy:0.62,n_total:130}}});
  expect(c.display.headline.zh).toBe('判定：过热 · 历史准确率 62%（n=110）');
  expect(c.display.percent).toBeNull();
  expect(c.calibration_summary?.accuracy).toBe(0.62);
  const settled=card({judgment:cat,settlement:{outcome:'miss',realized:{value:'recession',unit:null,from:null,to:null,label_policy:'cutoff_vintage'}}});
  expect(settled.display.headline.zh).toBe('判定：过热（未校准） · 实现：衰退（未命中）');
 });
 it('score: value, scale and dims with gaps; evaluated shows Spearman; never a percent',()=>{
  const sc={kind:'score' as Kind,judgment_type:'industry_prosperity' as const,claim:{value:72,scale:{min:0,max:100},dims:[{id:'growth',value:80,weight:0.5,coverage:true},{id:'valuation',value:null,weight:0.5,coverage:false}],coverage:0.5,realized_metric:'revenue_cagr_3y'}};
  const e=card({judgment:sc,calibration:{kind:'score',state:'evaluated',metrics:{spearman:0.41,n_total:130}}});
  expect(e).toMatchObject({calibration:'evaluated',display:{percent:null,value:72,scale:{min:0,max:100}}});
  expect(e.display.dims).toEqual([{id:'growth',label:{zh:'growth',en:'growth'},value:80,coverage:true},{id:'valuation',label:{zh:'valuation',en:'valuation'},value:null,coverage:false}]);
  expect(e.display.headline.en).toBe('Score 72 (0–100) · Spearman 0.41 (n=110)');
  expect(card({judgment:sc}).display.headline.zh).toBe('分值 72（0–100） · 样本不足');
 });
 it('interval: range and nominal coverage; calibrated adds historical coverage',()=>{
  const iv={kind:'interval' as Kind,judgment_type:'return_range' as const,claim:{metric:'return_12m',low:-0.1,high:0.25,unit:'ratio',nominal_coverage:0.8}};
  expect(card({judgment:iv}).display).toMatchObject({percent:null,value:[-0.1,0.25],nominal_coverage:0.8,headline:{zh:'return_12m：-0.1 至 0.25 ratio（名义覆盖 80%）（未校准）'}});
  expect(card({judgment:iv,calibration:{kind:'interval',state:'calibrated',metrics:{coverage:0.78}}}).display.headline.zh).toBe('return_12m：-0.1 至 0.25 ratio（名义覆盖 80%） · 历史覆盖 78%（名义 80%）');
 });
 it('card frame: methodology link, condition, inputs drawer rows, bilingual headlines are non-empty',()=>{
  const c=card({});
  expect(c.methodology).toEqual({id:'synthetic_fact_metric',version:'v1',title:TITLE,href:'/intel/methods/synthetic_fact_metric/v1'});
  expect(c.condition).toMatchObject({text:{zh:'2025Q4 营收同比 > 0'},horizon:{unit:'calendar_days',n:10},label_policy:'first_observed'});
  expect(c.inputs).toEqual([expect.objectContaining({kind:'financial_fact',href:null,origin:{publisher:'SEC',adapter:'edgar',locator:'companyfacts'}})]);
  const claims={categorical:{selected:'recovery',classes:['recovery'],scores_are_not_probabilities:true},score:{value:1,scale:{min:0,max:10},dims:[],coverage:1,realized_metric:'m'},interval:{metric:'m',low:0,high:1,unit:'u',nominal_coverage:0.5}};
  for(const [kind,claim] of Object.entries(claims)){const h=card({judgment:{kind:kind as Kind,claim}}).display.headline;expect(h.zh.length>0&&h.en.length>0,kind).toBe(true);}
  expect(c.display.headline.zh.length>0&&c.display.headline.en.length>0).toBe(true);
 });
});

describe('cardsOf',()=>{
 const methods=new Map([[methodKey(methodologyRow()),methodologyRow()]]);
 it('publishable=false or an unknown method → no card (second gate after RLS)',()=>{
  expect(cardsOf([envelope()],new Map([[methodKey(methodologyRow()),methodologyRow({publishable:false})]]),{includeAbstained:false,now:NOW})).toEqual([]);
  expect(cardsOf([envelope()],new Map(),{includeAbstained:false,now:NOW})).toEqual([]);
  expect(cardsOf([envelope()],methods,{includeAbstained:false,now:NOW})).toHaveLength(1);
 });
 it('abstained only with include_abstained; merged issuers are marked',()=>{
  const ab=envelope({judgment:{n:2,abstained:true,abstain_reason:'x',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null}});
  expect(cardsOf([ab],methods,{includeAbstained:false,now:NOW})).toEqual([]);
  expect(cardsOf([ab],methods,{includeAbstained:true,now:NOW})).toHaveLength(1);
  const old='33333333-3333-4333-8333-333333333333';
  const [m]=cardsOf([envelope({judgment:{subject_key:old}})],methods,{includeAbstained:false,now:NOW,requestedKey:'44444444-4444-4444-8444-444444444444'});
  expect(m.merged_from).toBe(old);
  expect(cardsOf([envelope()],methods,{includeAbstained:false,now:NOW,requestedKey:envelope().judgment.subject_key})[0].merged_from).toBeUndefined();
 });
});

describe('derivedOdds (spec §9.4)',()=>{
 // Narrow member type (not the Condition union) so a predicate-replaced copy below is still a valid price_return condition (plan audit P1-01).
 const condition:Extract<Condition,{resolver:'price_return'}>={resolver:'price_return',params:{ticker:'AAPL',market:'US',adjustment:'qfq',source:'eastmoney',base_date:'2026-01-02'},predicate:{op:'>',rhs:0.1},text:{zh:'12 个月涨超 10%',en:'up >10% in 12 months'}};
 const target={kind:'date' as const,date:'2027-01-02'};
 const win=(p=0.6,over:EnvelopeSpec['judgment']={})=>envelope({judgment:{n:1,as_of:'2026-01-02',judgment_type:'thesis_win_rate',claim:{p,event:{zh:'涨超 10%',en:'up >10%'}},condition,target,...over},calibration:CAL});
 const range=(claim:Partial<IntervalClaim>={},over:EnvelopeSpec['judgment']={},cal:EnvelopeSpec['calibration']={kind:'interval',state:'calibrated'})=>envelope({judgment:{n:2,as_of:'2026-01-02',judgment_type:'return_range',kind:'interval',
  claim:{metric:'return_12m',low:-0.2,high:0.4,unit:'ratio',nominal_coverage:0.8,scenarios:[{label:'up',p:0.6,value:0.3},{label:'down',p:0.4,value:-0.15}],scenario_event_hash:digest(condition),...claim},condition,target,...over},calibration:cal});
 it('computes b and fractional Kelly when every gate passes',()=>{
  const r=derivedOdds(win(),range(),{k:0.5,now:NOW});
  expect(r.status).toBe('computed');
  if(r.status==='computed'){expect(r.b).toBeCloseTo(2,12);expect(r.f).toBeCloseTo(0.5*(0.6*2-0.4)/2,12);}
 });
 it('|p_up − p| ≤ 0.01 passes at the boundary and fails beyond it',()=>{
  expect(derivedOdds(win(0.61),range(),{k:0.5,now:NOW}).status).toBe('computed');
  expect(derivedOdds(win(0.62),range(),{k:0.5,now:NOW})).toEqual({status:'not_computed',reasons:['inputs_inconsistent']});
 });
 it('every precondition failure is a reason',()=>{
  const reasonsOf=(a:Envelope,b:Envelope,k=0.5)=>{const r=derivedOdds(a,b,{k,now:NOW});return r.status==='not_computed'?r.reasons:[];};
  expect(reasonsOf(win(0.6,{}),range({},{},{kind:'interval',state:'failed'}))).toEqual(['not_calibrated']);
  expect(reasonsOf(envelope({judgment:{n:1,as_of:'2026-01-02',judgment_type:'thesis_win_rate',claim:{p:0.6,event:{zh:'涨',en:'up'}},condition,target},calibration:CAL,settlement:{}}),range())).toEqual(['not_open']);
  expect(reasonsOf(win(),range({scenarios:undefined}))).toEqual(['scenarios_missing']);
  expect(reasonsOf(win(),range({scenarios:[{label:'up',p:0.6,value:0.3},{label:'down',p:0.5,value:-0.15}]}))).toEqual(['scenarios_not_normalized']);
  expect(reasonsOf(win(),range({scenarios:[{label:'up',p:0.6,value:-0.1},{label:'down',p:0.4,value:-0.15}]}))).toEqual(['scenario_values_invalid']);
  const otherEvent:Condition={...condition,predicate:{op:'>',rhs:0}};
  expect(reasonsOf(win(),range({scenario_event_hash:digest(otherEvent)}))).toEqual(['event_mismatch']);
  expect(reasonsOf(win(),range({},{as_of:'2026-01-05'}))).toContain('as_of_mismatch');
  expect(reasonsOf(win(),range({},{subject_key:'55555555-5555-4555-8555-555555555555'}))).toEqual(['subject_mismatch']);
  expect(reasonsOf(win(),range({},{target:{kind:'date',date:'2027-01-03'}}))).toEqual(['target_mismatch']);
  expect(reasonsOf(win(),range({},{horizon:{unit:'calendar_months',n:12}}))).toEqual(['unit_mismatch']);
  expect(reasonsOf(win(),range(),0)).toEqual(['invalid_k']);
  expect(reasonsOf(range(),win())).toContain('wrong_type');
 });
 it('non-finite odds are not computed (K-02): overflow in b, underflow to b = 0',()=>{
  for(const [u,d] of [[1e308,-1e-308],[1e-308,-1e308]]){
   const r=derivedOdds(win(),range({scenarios:[{label:'up',p:0.6,value:u},{label:'down',p:0.4,value:d}]}),{k:0.5,now:NOW});
   expect(r).toEqual({status:'not_computed',reasons:['odds_not_finite']});
  }
 });
 it('an invalid thesis p is not computed (K-03)',()=>{
  for(const p of [NaN,1.5,-0.1]){const r=derivedOdds(win(p),range(),{k:0.5,now:NOW});expect(r.status,String(p)).toBe('not_computed');if(r.status==='not_computed')expect(r.reasons).toContain('invalid_probability');}
 });
 it('uses calibrationRow defaults from the shared builder',()=>{expect(calibrationRow().state).toBe('calibrated');});
});
