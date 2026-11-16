// src/components/judgments/view-model.test.ts
// Task 21 (spec §9.1–§9.3, §9.5–§9.6): the judgment UI's pure view rules — percent only for probability × calibrated, brass
// only for the calibrated badge and selected state, hit / miss tones, table equivalents, timeline steps, admin actions.
import {describe,expect,it} from 'vitest';
import type {CalibrationRow,JudgmentCard,ReliabilityBin,SettlementRow} from '@/lib/judgments/types';
import type {MethodologyListItem,QueueItem} from './api-types';
import {BRASS_BADGE,LINK,NEUTRAL_BADGE,SELECTED,TONE,UNSELECTED,badgeClass,calibrationMsg,cardBody,collapsedView,confusionView,footerView,gatesView,holdoutRows,
 inputRows,lifecycleView,methodRows,methodState,queueActions,refText,registeredValue,reliabilityPoints,reliabilityRows,segmentClass,targetText,timelineSteps,visiblePercent} from './view-model';

type Summary=NonNullable<JudgmentCard['calibration_summary']>;
const summary=(p:Partial<Summary>={}):Summary=>({n_independent:12,n_total:30,threshold_n:100,brier:null,brier_skill:null,ece_raw_holdout:null,valid_until:'2026-11-20T00:00:00.000Z',hit_rate:null,href:'/intel/methods/thesis_win_rate/v1',...p});
function card(p:Partial<JudgmentCard>={}):JudgmentCard{
 return {judgment_id:'11111111-2222-8333-8444-555555555555',subject:{type:'issuer',key:'iss-1'},judgment_type:'thesis_win_rate',kind:'probability',lifecycle:'open',outcome:null,
  calibration:'insufficient',retrospective:false,as_of:'2026-11-01',registered_at:'2026-11-01T04:00:00.000Z',
  methodology:{id:'thesis_win_rate',version:'v1',title:{zh:'论点胜率',en:'Thesis win rate'},href:'/intel/methods/thesis_win_rate/v1'},
  display:{headline:{zh:'FY2026 营收同比 ≥ 8%',en:'FY2026 revenue yoy ≥ 8%'},percent:null,value:0.71,band:'high'},
  condition:{text:{zh:'FY2026 revenue_yoy ≥ 8%',en:'FY2026 revenue_yoy ≥ 8%'},horizon:{unit:'fiscal_quarters',n:4},
   target:{kind:'fiscal_period',period_end:'2026-12-31',calendar:{anchor_period_end:'2025-12-31',months:3},extrapolated:false},label_policy:'first_observed',
   settle_after:'2027-01-01T00:00:00.000Z',settle_by:'2027-05-01T00:00:00.000Z'},
  settlement:null,calibration_summary:summary(),
  inputs:[{kind:'financial_fact',ref:{fact_id:'f-1'},available_at:'2025-04-03T23:59:59.999Z',origin:{publisher:'巨潮资讯',adapter:'tushare',locator:'x'},href:'/api/facts/600519?factIds=f-1'}],...p};
}
const macro=(p:Partial<JudgmentCard>={})=>card({judgment_type:'macro_regime',kind:'categorical',subject:{type:'macro_region',key:'US'},display:{headline:{zh:'US 2026-09 象限',en:'US 2026-09 regime'},percent:null,value:'recovery'},...p});
const settlement=(p:Partial<SettlementRow>):SettlementRow=>({settlement_id:'s',judgment_id:'j',seq:1,kind:'settled',outcome:'hit',realized:{value:'recovery',unit:null,from:null,to:null,label_policy:'cutoff_vintage'},evidence:{},resolver:'macro_regime_replay',resolver_version:'1',reason:null,actor:'cron',settled_at:'2027-01-31T03:00:00.000Z',request_key:'k-00000001',request_digest:'0'.repeat(64),code_version:'abcdefg',batch_id:'b',...p});
const bin=(lo:number,n:number,mean:number|null,hit:number|null):ReliabilityBin=>({bin_low:lo,bin_high:Math.round((lo+0.1)*10)/10,n,mean_p:mean,hit_rate:hit,wilson_low:hit===null?null:Math.max(0,hit-0.1),wilson_high:hit===null?null:Math.min(1,hit+0.1)});
function calRow(p:Partial<CalibrationRow>={}):CalibrationRow{
 return {calibration_id:'c',methodology_id:'thesis_win_rate',methodology_version:'v1',scope_type:'all',scope_key:'',window_from:'2023-11-01',window_to:'2026-11-01',n_registered:500,n_settled:486,n_independent:214,n_void:4,n_retrospective_excluded:2,
  threshold_n:100,ece_max:0.1,kind:'probability',state:'calibrated',valid_until:'2026-12-01T00:00:00.000Z',validity_revision:7,metrics:{brier:0.181,brier_skill:0.12,ece_raw:0.05,temporal_split:{ece_raw_holdout:0.046,brier_holdout:0.17,brier_skill_holdout:0.1,n_holdout:64}},
  reliability:[],isotonic_segments:null,cohort_path:'p',cohort_sha256:'0'.repeat(64),query_bounds:{window_from:'2023-11-01',window_to:'2026-11-01',registered_at_lte:'x',settled_at_lte:'x',frozen_at:'x',n:0},fingerprint:'f',algorithm_version:'a',code_version:'abcdefg',computed_at:'2026-11-01T04:00:00.000Z',batch_id:'b',...p};
}

describe('percent and band (spec §9.3)',()=>{
 it('renders a percent only for probability × calibrated, whatever the server sends',()=>{
  expect(visiblePercent(card({calibration:'calibrated',display:{headline:{zh:'',en:''},percent:62,value:0.62}}))).toBe(62);
  for(const calibration of ['insufficient','failed','self_assessed','evaluated'] as const)expect(visiblePercent(card({calibration,display:{headline:{zh:'',en:''},percent:62,value:0.62}}))).toBeNull();
  expect(visiblePercent(macro({calibration:'calibrated',display:{headline:{zh:'',en:''},percent:71,value:'recovery'}}))).toBeNull();
 });
 it('probability: calibrated → percent + hit rate; uncalibrated → band + sample note; failed → ECE note',()=>{
  const cal=card({calibration:'calibrated',display:{headline:{zh:'',en:''},percent:62,value:0.62},calibration_summary:summary({n_independent:214,hit_rate:{rate:0.58,low:0.52,high:0.64}})});
  expect(cardBody(cal,'zh')).toEqual({type:'percent',text:'62%',hitRate:{key:'ui.card.hitRate',values:{rate:'58%',low:'52%',high:'64%',n:214}}});
  expect(cardBody(card(),'zh')).toEqual({type:'band',band:'high',note:{key:'ui.calibration.insufficientN',values:{n:12,threshold:100}}});
  expect(cardBody(card({calibration:'failed',calibration_summary:summary({ece_raw_holdout:0.14})}),'zh')).toEqual({type:'band',band:'high',note:{key:'ui.calibration.failedEce',values:{ece:'0.14'}}});
 });
 it('categorical: selected class, realized class once settled, accuracy only when calibrated, never a percent of the distribution',()=>{
  expect(cardBody(macro(),'zh')).toEqual({type:'category',selected:'recovery',realized:null,accuracy:null});
  expect(cardBody(macro({calibration:'calibrated',calibration_summary:summary({n_independent:214,accuracy:0.71})}),'zh')).toMatchObject({accuracy:{key:'ui.card.accuracy',values:{rate:'71%',n:214}}});
  expect(cardBody(macro({lifecycle:'settled',outcome:'miss',settlement:{kind:'settled',outcome:'miss',realized:{value:'overheat',unit:null,from:null,to:null,label_policy:'cutoff_vintage'},settled_at:'2027-01-31T03:00:00.000Z',evidence_summary:{zh:'',en:''}}}),'zh')).toMatchObject({type:'category',realized:'overheat'});
 });
 it('score: value on its scale, missing dimensions marked, widths clamped to [0,100]',()=>{
  const b=cardBody(card({kind:'score',judgment_type:'industry_prosperity',display:{headline:{zh:'',en:''},percent:null,value:52,scale:{min:0,max:100},
   dims:[{id:'profit',label:{zh:'盈利',en:'Profit'},value:38,coverage:true},{id:'cash',label:{zh:'现金流',en:'Cash'},value:null,coverage:false},{id:'x',label:{zh:'x',en:'x'},value:140,coverage:true}]}}),'en');
  expect(b).toMatchObject({type:'score',value:'52',scale:'0–100',dims:[{id:'profit',label:'Profit',value:'38',width:38,missing:false},{id:'cash',value:'—',width:0,missing:true},{id:'x',width:100}]});
 });
 it('interval: signed range, nominal coverage as a share, realized once settled',()=>{
  expect(cardBody(card({kind:'interval',judgment_type:'return_range',display:{headline:{zh:'',en:''},percent:null,value:[-6,18],nominal_coverage:0.8}}),'zh')).toEqual({type:'interval',range:'-6.00 ~ +18.00',nominal:'80%',realized:null,coverage:null});
 });
 it('abstained cards render the reason and the missing inputs, nothing else',()=>{
  expect(cardBody(card({lifecycle:'abstained',condition:null,abstain_reason:'target_unresolvable',missing:['filings']}),'zh')).toEqual({type:'abstained',reason:'target_unresolvable',missing:['filings']});
 });
});

describe('brass, tones, labels',()=>{
 it('brass only on the calibrated badge and the selected state',()=>{
  expect(badgeClass('calibrated')).toBe(BRASS_BADGE);
  for(const s of ['insufficient','failed','evaluated','self_assessed'] as const)expect(badgeClass(s)).toBe(NEUTRAL_BADGE);
  expect(segmentClass(true)).toBe(SELECTED);expect(segmentClass(false)).toBe(UNSELECTED);
  for(const c of [NEUTRAL_BADGE,UNSELECTED,LINK,...Object.values(TONE)])expect(c).not.toMatch(/accent/);
  expect(BRASS_BADGE).toMatch(/--accent/);expect(SELECTED).toMatch(/--accent/);
 });
 it('hit uses --up, miss uses --down, everything else is neutral',()=>{
  expect(lifecycleView({lifecycle:'settled',outcome:'hit'})).toEqual({msg:{key:'ui.lifecycle.hit'},tone:'up'});
  expect(lifecycleView({lifecycle:'settled',outcome:'miss'})).toEqual({msg:{key:'ui.lifecycle.miss'},tone:'down'});
  expect(lifecycleView({lifecycle:'void',outcome:null})).toEqual({msg:{key:'ui.lifecycle.void'},tone:'neutral'});
  expect(TONE.up).toBe('text-[var(--up)]');expect(TONE.down).toBe('text-[var(--down)]');
 });
 it('calibration messages per state',()=>{
  expect(calibrationMsg('calibrated',null)).toEqual({key:'ui.calibration.calibrated'});
  expect(calibrationMsg('insufficient',null)).toEqual({key:'ui.calibration.insufficient'});
  expect(calibrationMsg('evaluated',summary({spearman:0.31,n_independent:120}))).toEqual({key:'ui.calibration.evaluatedSpearman',values:{rho:'0.31',n:120}});
  expect(calibrationMsg('self_assessed',null)).toEqual({key:'ui.calibration.selfAssessed'});
 });
 it('mobile collapsed view: percent only when calibrated, band otherwise, lifecycle for non-probability',()=>{
  expect(collapsedView(card({calibration:'calibrated',display:{headline:{zh:'复苏',en:'Recovery'},percent:62,value:0.62}}),'en')).toMatchObject({title:'Recovery',percent:'62%',band:null,type:{key:'ui.type.thesis_win_rate'}});
  expect(collapsedView(card(),'zh')).toMatchObject({percent:null,band:'high'});
  expect(collapsedView(macro(),'zh')).toMatchObject({percent:null,band:null,lifecycle:{key:'ui.lifecycle.open'}});
 });
 it('footer line and target text for every target kind',()=>{
  expect(footerView(card(),'zh')).toEqual({method:'thesis_win_rate@v1',asOf:'2026-11-01',condition:'FY2026 revenue_yoy ≥ 8%',target:'2026-12-31'});
  expect([targetText({kind:'session_index',base_date:'2026-09-14',n:5}),targetText({kind:'date',date:'2026-12-01'}),targetText({kind:'period',period:'2026-12'}),
   targetText({kind:'fiscal_period',period_end:'2027-03-31',calendar:{anchor_period_end:'2026-12-31',months:3},extrapolated:true})]).toEqual(['2026-09-14 +5','2026-12-01','2026-12','2027-03-31*']);
 });
});

describe('drawer and timeline',()=>{
 it('input rows: locator per kind, available date, origin and licence',()=>{
  expect(inputRows(card())).toEqual([{key:'financial_fact:0',kind:'financial_fact',ref:'f-1',date:'2025-04-03',origin:'巨潮资讯 · tushare',href:'/api/facts/600519?factIds=f-1'}]);
  expect(refText('macro_observation',{series_id:'US_CPI_YOY',period_end:'2026-08-31',vintage_id:'bls-2026-09-11'})).toBe('US_CPI_YOY 2026-08-31 (bls-2026-09-11)');
  expect(refText('price_bar',{ticker:'600519',market:'A',date:'2026-09-14',source:'eastmoney',adjustment:'qfq'})).toBe('A:600519 2026-09-14 qfq');
  expect(refText('table_rows',{table:'macro_series',natural_key:'US'})).toBe('macro_series US');
  expect(refText('legacy_fill',{recommendation_id:'r-1'})).toBe('r-1');
 });
 it('registered value: p as a decimal while uncalibrated, nothing once calibrated, categorical scores without %',()=>{
  expect(registeredValue(card(),null)).toEqual({type:'p',text:'0.71'});
  expect(registeredValue(card({calibration:'calibrated',display:{headline:{zh:'',en:''},percent:71,value:0.71}}),null)).toBeNull();
  const scores=registeredValue(macro(),{claim:{selected:'recovery',classes:['recovery','overheat','stagflation','recession'],distribution:{recovery:0.3258,overheat:0.2348,stagflation:0.2197,recession:0.2197}}});
  expect(scores).toEqual({type:'scores',rows:[{cls:'recovery',score:'0.326'},{cls:'overheat',score:'0.235'},{cls:'stagflation',score:'0.220'},{cls:'recession',score:'0.220'}]});
  expect(JSON.stringify(scores)).not.toContain('%');
 });
 it('timeline: open → registered, target, pending; append-only history settled → withdrawn → reopened → settled; abstained',()=>{
  expect(timelineSteps(card(),undefined,'zh').map(s=>s.key)).toEqual(['ui.timeline.registered','ui.timeline.target','ui.timeline.pending']);
  const history=[settlement({seq:4,kind:'settled',outcome:'hit'}),settlement({seq:1,kind:'settled',outcome:'miss',realized:{value:21.4,label:'21.4%',unit:'pct',from:null,to:null,label_policy:'first_observed'}}),
   settlement({seq:2,kind:'withdrawn',outcome:null,realized:null,reason:'restated half-year report'}),settlement({seq:3,kind:'reopened',outcome:null,realized:null,reason:'refetch'})];
  const steps=timelineSteps(card({lifecycle:'settled',outcome:'hit'}),history,'zh');
  expect(steps.map(s=>[s.key,s.tone])).toEqual([['ui.timeline.registered','neutral'],['ui.timeline.target','neutral'],['ui.timeline.settledMiss','down'],['ui.timeline.withdrawn','neutral'],['ui.timeline.reopened','neutral'],['ui.timeline.settledHit','up']]);
  expect(steps[2].detail).toBe('21.4%');expect(steps[3].detail).toBe('restated half-year report');
  expect(timelineSteps(card({lifecycle:'abstained',condition:null,abstain_reason:'no_data'}),undefined,'zh').map(s=>s.key)).toEqual(['ui.timeline.registered','ui.timeline.abstained']);
  expect(timelineSteps(card({lifecycle:'pending_fill',condition:null}),undefined,'zh').map(s=>s.key)).toEqual(['ui.timeline.registered','ui.timeline.pendingFill']);
 });
 it('reliability table rows keep empty bins (null → —) and the chart only plots populated bins',()=>{
  const bins=[bin(0,31,0.05,0.03),bin(0.1,0,null,null)];
  expect(reliabilityRows(bins)).toEqual([{range:'0.0–0.1',n:31,meanP:'0.05',hitRate:'0.03',wilson:'0.00–0.13'},{range:'0.1–0.2',n:0,meanP:'—',hitRate:'—',wilson:'—'}]);
  expect(reliabilityPoints(bins)).toEqual([{x:0.05,y:0.03,n:31}]);
 });
});

describe('methods and admin',()=>{
 const calSummary=(c:CalibrationRow,valid:boolean):MethodologyListItem['calibration']=>({state:valid?c.state:'insufficient',valid,n_independent:c.n_independent,threshold_n:c.threshold_n,computed_at:c.computed_at,valid_until:c.valid_until,metrics:c.metrics});
 const item=(p:Partial<MethodologyListItem['methodology']>,cal:MethodologyListItem['calibration']):MethodologyListItem=>({methodology:{methodology_id:'thesis_win_rate',version:'v1',judgment_type:'thesis_win_rate',kind:'probability',producer_kind:'model',subject_types:['issuer'],input_kinds:['financial_fact'],markets:null,title_zh:'论点胜率',title_en:'Thesis win rate',doc_path:'d',doc_sha256:'0'.repeat(64),implementation_sha256:'0'.repeat(64),params:{threshold_n:100},params_json:{},horizon:{unit:'fiscal_quarters',n:4},upstream:{},deps_sha256:'0'.repeat(64),formula_hash:'0'.repeat(64),status:'active',publishable:true,code_version:'abcdefg',created_at:'2026-06-01T00:00:00.000Z',synced_at:'2026-11-01T00:00:00.000Z',...p},calibration:cal});
 it('registry rows: filters, state from the valid scope=all report only, Brier only for probability',()=>{
  const items=[item({},calSummary(calRow(),true)),item({methodology_id:'macro_regime',kind:'categorical',subject_types:['macro_region'],title_zh:'宏观象限'},calSummary(calRow({kind:'categorical',state:'calibrated'}),false))];
  const rows=methodRows(items,'all','all');
  expect(rows.map(r=>[r.id,r.domain,r.state,r.brier,r.validUntil])).toEqual([['thesis_win_rate','company','calibrated',0.181,'2026-12-01'],['macro_regime','macro','insufficient',null,null]]);
  expect(methodRows(items,'categorical','all').map(r=>r.id)).toEqual(['macro_regime']);
  expect(methodRows(items,'all','macro').map(r=>r.href)).toEqual(['/intel/methods/macro_regime/v1']);
  expect(methodState(null)).toBe('insufficient');
 });
 it('gates: sample gate from n_independent ≥ threshold_n, calibration gate from the stored state, validity',()=>{
  expect(gatesView(calRow(),true)).toEqual({sample:{ok:true,n:214,threshold:100,total:486},
   calibration:{ok:true,metric:{key:'ui.method.gateEce',values:{ece:'0.05',max:'0.10',skill:'+0.10'}}},validity:{valid:true,validUntil:'2026-12-01',computedAt:'2026-11-01',revision:7}});
  expect(gatesView(calRow({n_independent:99,state:'insufficient'}),false)).toMatchObject({sample:{ok:false},calibration:{ok:null},validity:{valid:false}});
  expect(gatesView(calRow({state:'failed'}),true)?.calibration.ok).toBe(false);
  expect(gatesView(null,false)).toBeNull();
 });
 it('confusion matrix marks the diagonal; holdout rows for probability only',()=>{
  const v=confusionView(calRow({kind:'categorical',metrics:{confusion:{recovery:{recovery:48,overheat:6},overheat:{recovery:5,overheat:31}}}}));
  expect(v).toEqual({classes:['recovery','overheat'],rows:[{cls:'recovery',cells:[{n:48,diagonal:true},{n:6,diagonal:false}]},{cls:'overheat',cells:[{n:5,diagonal:false},{n:31,diagonal:true}]}]});
  expect(holdoutRows(calRow()).map(r=>[r.key,r.n,r.ece])).toEqual([['ui.method.splitAll',214,'0.050'],['ui.method.splitHoldout',64,'0.046']]);
  expect(holdoutRows(calRow({kind:'categorical'}))).toEqual([]);
 });
 it('queue actions: due → settle; not yet due / leased / closed disable settle; withdraw after settled; reopen after void or withdrawn',()=>{
  const now='2026-11-06T03:00:00.000Z';
  const q=(p:Partial<QueueItem>):QueueItem=>({judgment_id:'j',settle_after:'2026-11-01T00:00:00.000Z',settle_by:'2026-12-01T00:00:00.000Z',label_policy:'first_observed',next_attempt_at:now,attempts:0,last_status:null,last_detail:{},leased_until:null,lease_token:null,override:null,closed_at:null,updated_at:now,
   judgment:{subject_type:'issuer',subject_key:'iss-1',methodology_id:'m',methodology_version:'v1',target:null},latest_settlement:null,...p});
  expect(queueActions(q({}),now)).toEqual({settle:'enabled',withdraw:false,reopen:false});
  expect(queueActions(q({settle_after:'2026-11-10T00:00:00.000Z'}),now).settle).toBe('not_due');
  expect(queueActions(q({leased_until:'2026-11-06T03:10:00.000Z'}),now)).toEqual({settle:'leased',withdraw:false,reopen:false});
  expect(queueActions(q({closed_at:now,latest_settlement:{kind:'settled',outcome:'miss',settled_at:now}}),now)).toEqual({settle:'closed',withdraw:true,reopen:false});
  expect(queueActions(q({closed_at:now,latest_settlement:{kind:'withdrawn',outcome:null,settled_at:now}}),now)).toEqual({settle:'closed',withdraw:false,reopen:true});
  expect(queueActions(q({closed_at:now,latest_settlement:{kind:'void',outcome:null,settled_at:now}}),now).reopen).toBe(true);
 });
});

describe('committed wire and calibration contracts',()=>{
 it('reads holdout metrics from temporal_split and categorical Wilson from accuracy_wilson',()=>{
  const c=calRow({metrics:{brier:0.18,ece_raw:0.05,temporal_split:{n_holdout:64,brier_holdout:0.17,brier_skill_holdout:0.1,ece_raw_holdout:0.046}}});
  expect(holdoutRows(c)[1]).toMatchObject({n:64,brier:'0.170',skill:'+0.10',ece:'0.046'});
  expect(gatesView(c,true)?.calibration.metric.values).toEqual({ece:'0.05',max:'0.10',skill:'+0.10'});
  expect(gatesView(calRow({kind:'categorical',metrics:{accuracy_wilson:{low:0.61,high:0.8},majority_rate:0.4}}),true)?.calibration.metric.values).toEqual({low:'61%',base:'40%'});
 });
 it('never renders invalid probability percentages',()=>{
  for(const percent of [NaN,Infinity,-1,101])expect(visiblePercent(card({calibration:'calibrated',display:{...card().display,percent}}))).toBeNull();
 });
 it('wire cards with percent omitted remain usable without a cast',()=>{
  const display={headline:card().display.headline,value:0.71,band:'high' as const};
  const wire={...card(),display};
  expect(visiblePercent(wire)).toBeNull();
  expect(cardBody(wire,'en').type).toBe('band');
 });
});
