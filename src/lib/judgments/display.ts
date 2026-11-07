// src/lib/judgments/display.ts
// Display contract (spec §9.1–§9.4): two independent dimensions — lifecycle (one judgment: latest
// settlement row) and calibration (method level: the scope='all' row, only while calibration_valid,
// i.e. same validity revision and not expired) — decide what a card may show. A percent appears only
// for probability × calibrated; uncalibrated probabilities show a tertile band; categorical
// distributions never appear on the card; scores are evaluated, never calibrated. Headlines are
// built here in both languages (locale-independent; the UI picks one). derivedOdds() is the §9.4 gate
// for odds / Kelly: every precondition failure is returned as a reason, nothing is computed.
import {bandOf} from './band';
import type {Band} from './band';
import {canonicalize,digest} from './canonical';
import type {Bilingual,CalibrationRow,CalibrationState,CategoricalClaim,Envelope,Input,IntervalClaim,JudgmentCard,Kind,Lifecycle,MethodologyRow,ProbabilityClaim,ScoreClaim} from './types';

export const KINDS:readonly Kind[]=['probability','categorical','score','interval'];
export const PUBLIC_LIFECYCLES=['abstained','open','settled','void','withdrawn'] as const satisfies readonly Lifecycle[];
/** recommendation_call@v1 private cards (spec §11.2): no void; pending_fill before the fill is known. */
export const PRIVATE_LIFECYCLES=['abstained','pending_fill','open','settled','withdrawn'] as const satisfies readonly Lifecycle[];
export const CALIBRATION_STATES_BY_KIND:Readonly<Record<Kind,readonly CalibrationState[]>>={
 probability:['insufficient','failed','calibrated'],categorical:['insufficient','failed','calibrated'],
 score:['insufficient','evaluated'],interval:['insufficient','failed','calibrated'],
};
export interface CardCombination{source:'public'|'recommendation';kind:Kind;lifecycle:Lifecycle;outcome:'hit'|'miss'|null;calibration:CalibrationState;percent:boolean;band:boolean}
/** Every combination a card can reach (spec §9.6 item 1); the Claude Design canvas draws exactly these. */
export function reachableCombinations():CardCombination[]{
 const out:CardCombination[]=[];
 const push=(source:CardCombination['source'],kind:Kind,lifecycle:Lifecycle,calibration:CalibrationState)=>{
  for(const outcome of lifecycle==='settled'?(['hit','miss'] as const):[null]){
   const shown=lifecycle!=='abstained'&&lifecycle!=='pending_fill';
   out.push({source,kind,lifecycle,outcome,calibration,percent:shown&&kind==='probability'&&calibration==='calibrated',band:shown&&kind==='probability'&&calibration!=='calibrated'});
  }
 };
 for(const kind of KINDS)for(const lifecycle of PUBLIC_LIFECYCLES)for(const c of CALIBRATION_STATES_BY_KIND[kind])push('public',kind,lifecycle,c);
 for(const lifecycle of PRIVATE_LIFECYCLES)push('recommendation','probability',lifecycle,'self_assessed');
 return out;
}
export const REACHABLE_COMBINATIONS:readonly CardCombination[]=reachableCombinations();

/** spec §9.1: abstained | open | settled | void | withdrawn; a reopened judgment is open again. */
export function lifecycleOf(e:Envelope):Lifecycle{
 if(e.judgment.abstained)return 'abstained';
 const s=e.settlement;
 if(!s||s.kind==='reopened')return 'open';
 return s.kind;
}
/** The calibration row that may speak for the method: scope 'all', same method and kind, calibration_valid, not expired at `now`. */
export function validCalibration(e:Envelope,kind:Kind,now:string):CalibrationRow|null{
 const c=e.calibration;
 if(!c||!e.calibration_valid)return null;
 if(c.scope_type!=='all'||c.kind!==kind||c.methodology_id!==e.judgment.methodology_id||c.methodology_version!==e.judgment.methodology_version)return null;
 if(!(Date.parse(c.valid_until)>Date.parse(now)))return null;   // expiry is always enforced: `now` is required (as_known views pass their cutoff)
 return c;
}
/** spec §9.1: invalid, expired or missing → insufficient; score rows say evaluated or insufficient; never calibrated without a valid row. */
export function calibrationStateOf(e:Envelope,kind:Kind,now:string):CalibrationState{
 const c=validCalibration(e,kind,now);
 if(!c)return 'insufficient';
 if(kind==='score')return c.state==='evaluated'?'evaluated':'insufficient';
 return c.state==='calibrated'||c.state==='failed'?c.state:'insufficient';
}
export {bandOf};export type {Band};

const BAND:Record<Band,Bilingual>={low:{zh:'低',en:'low'},mid:{zh:'中',en:'medium'},high:{zh:'高',en:'high'}};
const CLASS_LABELS:Record<string,Bilingual>={recovery:{zh:'复苏',en:'recovery'},overheat:{zh:'过热',en:'overheat'},stagflation:{zh:'滞胀',en:'stagflation'},recession:{zh:'衰退',en:'recession'}};
export const classLabel=(c:string):Bilingual=>CLASS_LABELS[c]??{zh:c,en:c};
const fmt=(x:number,d=2)=>String(Number(x.toFixed(d)));
const pct=(x:number)=>String(Math.round(x*100));
const numOr=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const validP=(p:unknown)=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;
const both=(zh:string,en:string):Bilingual=>({zh,en});
const join=(a:Bilingual,b:Bilingual):Bilingual=>({zh:a.zh+b.zh,en:a.en+b.en});

type Summary=NonNullable<JudgmentCard['calibration_summary']>;
function summaryOf(c:CalibrationRow,kind:Kind):Summary{
 const m=c.metrics as Record<string,unknown>;
 const t=(m.temporal_split??{}) as Record<string,unknown>;
 const h=m.hit_rate as {rate?:unknown;low?:unknown;high?:unknown}|null|undefined;
 const s:Summary={n_independent:c.n_independent,n_total:numOr(m.n_total)??c.n_settled,threshold_n:c.threshold_n,brier:numOr(m.brier),brier_skill:numOr(m.brier_skill),
  ece_raw_holdout:numOr(t.ece_raw_holdout),valid_until:c.valid_until,
  hit_rate:h&&numOr(h.rate)!==null?{rate:numOr(h.rate)!,low:numOr(h.low),high:numOr(h.high)}:null,
  href:`/intel/methods/${c.methodology_id}/${c.methodology_version}#calibration`};
 if(kind==='categorical')s.accuracy=numOr(m.accuracy);
 if(kind==='interval')s.coverage=numOr(m.coverage);
 if(kind==='score')s.spearman=numOr(m.spearman);
 return s;
}
function tagOf(state:CalibrationState,s:Summary|null):Bilingual{
 switch(state){
  case 'calibrated':return both('','');
  case 'failed':return s&&s.ece_raw_holdout!==null?both(`（校准未通过：ECE ${fmt(s.ece_raw_holdout,3)}）`,` (calibration failed: ECE ${fmt(s.ece_raw_holdout,3)})`):both('（校准未通过）',' (calibration failed)');
  case 'self_assessed':return both('（自评，不可审计）',' (self-assessed, not auditable)');
  case 'evaluated':return both('','');
  default:return s?both(`（未校准：有效样本 ${s.n_independent}/${s.threshold_n}）`,` (uncalibrated: ${s.n_independent}/${s.threshold_n} independent samples)`):both('（未校准）',' (uncalibrated)');
 }
}

type Display=JudgmentCard['display'];
function displayOf(e:Envelope,state:CalibrationState,s:Summary|null):Display{
 const j=e.judgment;
 if(j.abstained||!j.claim)return {headline:both(`未判断：${j.abstain_reason??'—'}`,`No judgment: ${j.abstain_reason??'—'}`),percent:null,value:null};
 const tag=tagOf(state,s);
 switch(j.kind){
  case 'probability':{
   const c=j.claim as ProbabilityClaim;
   if(!validP(c.p))return {headline:both(`${c.event.zh}：判断值无效`,`${c.event.en}: invalid claim`),percent:null,value:null};
   if(state==='calibrated'){const p=Math.round(c.p*100);return {headline:both(`${c.event.zh}：${p}%`,`${c.event.en}: ${p}%`),percent:p,value:null};}
   const band=bandOf(c.p);
   return {headline:join(both(`${c.event.zh}：信心${BAND[band].zh}`,`${c.event.en}: ${BAND[band].en} confidence`),tag),percent:null,value:null,band};
  }
  case 'categorical':{
   const c=j.claim as CategoricalClaim;const l=classLabel(c.selected);
   const acc=state==='calibrated'&&s?.accuracy!=null?both(` · 历史准确率 ${pct(s.accuracy)}%（n=${s.n_independent}）`,` · historical accuracy ${pct(s.accuracy)}% (n=${s.n_independent})`):tag;
   return {headline:join(both(`判定：${l.zh}`,`Call: ${l.en}`),acc),percent:null,value:c.selected};
  }
  case 'score':{
   const c=j.claim as ScoreClaim;
   const ev=state==='evaluated'&&s?.spearman!=null?both(` · Spearman ${fmt(s.spearman)}（n=${s.n_independent}）`,` · Spearman ${fmt(s.spearman)} (n=${s.n_independent})`):both(' · 样本不足',' · insufficient samples');
   return {headline:join(both(`分值 ${fmt(c.value)}（${c.scale.min}–${c.scale.max}）`,`Score ${fmt(c.value)} (${c.scale.min}–${c.scale.max})`),ev),percent:null,value:c.value,scale:c.scale,
    dims:c.dims.map(d=>({id:d.id,label:both(d.id,d.id),value:d.value,coverage:d.coverage}))};
  }
  case 'interval':{
   const c=j.claim as IntervalClaim;
   const cov=state==='calibrated'&&s?.coverage!=null?both(` · 历史覆盖 ${pct(s.coverage)}%（名义 ${pct(c.nominal_coverage)}%）`,` · historical coverage ${pct(s.coverage)}% (nominal ${pct(c.nominal_coverage)}%)`):tag;
   return {headline:join(both(`${c.metric}：${fmt(c.low)} 至 ${fmt(c.high)} ${c.unit}（名义覆盖 ${pct(c.nominal_coverage)}%）`,`${c.metric}: ${fmt(c.low)} to ${fmt(c.high)} ${c.unit} (nominal coverage ${pct(c.nominal_coverage)}%)`),cov),percent:null,value:[c.low,c.high],nominal_coverage:c.nominal_coverage};
  }
 }
}
function overlay(e:Envelope,lifecycle:Lifecycle):Bilingual{
 const s=e.settlement;
 if(lifecycle==='settled'&&s){
  if(e.judgment.kind==='categorical'&&s.realized){const r=classLabel(String(s.realized.label??s.realized.value));return both(` · 实现：${r.zh}（${s.outcome==='hit'?'命中':'未命中'}）`,` · realized: ${r.en} (${s.outcome})`);}
  return both(` · 结果：${s.outcome==='hit'?'命中':'未命中'}`,` · result: ${s.outcome}`);
 }
 if(lifecycle==='void'&&s)return both(` · 作废：${s.reason??'—'}`,` · void: ${s.reason??'—'}`);
 if(lifecycle==='withdrawn'&&s)return both(` · 已撤回：${s.reason??'—'}`,` · withdrawn: ${s.reason??'—'}`);
 return both('','');
}
const inputHref=(i:Input):string|null=>i.kind==='judgment'?`/api/judgments/${i.ref.judgment_id}`:null;

export interface ToCardOptions{title:Bilingual;now:string;merged_from?:string}
/** Envelope → JudgmentCard (spec §9.2, §9.3). Pure; `now` (the cutoff for as_known views) is required so an expired report can never speak. */
export function toCard(e:Envelope,opts:ToCardOptions):JudgmentCard{
 const j=e.judgment;const lifecycle=lifecycleOf(e);
 const calibration=calibrationStateOf(e,j.kind,opts.now);
 const vc=validCalibration(e,j.kind,opts.now);
 const summary=vc?summaryOf(vc,j.kind):null;
 const display=displayOf(e,calibration,summary);
 display.headline=join(display.headline,overlay(e,lifecycle));
 const s=e.settlement;
 const card:JudgmentCard={
  judgment_id:j.judgment_id,subject:{type:j.subject_type,key:j.subject_key},judgment_type:j.judgment_type,kind:j.kind,
  lifecycle,outcome:lifecycle==='settled'&&s?s.outcome:null,calibration,retrospective:j.retrospective,as_of:j.as_of,registered_at:j.registered_at,
  methodology:{id:j.methodology_id,version:j.methodology_version,title:opts.title,href:`/intel/methods/${j.methodology_id}/${j.methodology_version}`},
  display,
  condition:j.abstained||!j.condition||!j.horizon||!j.target||!j.label_policy||!j.settle_after||!j.settle_by?null:{text:j.condition.text,horizon:j.horizon,target:j.target,label_policy:j.label_policy,settle_after:j.settle_after,settle_by:j.settle_by},
  settlement:s?{kind:s.kind,outcome:s.outcome,realized:s.realized,settled_at:s.settled_at,evidence_summary:both(`${s.resolver}@${s.resolver_version}${s.reason?` · 原因：${s.reason}`:''}`,`${s.resolver}@${s.resolver_version}${s.reason?` · reason: ${s.reason}`:''}`)}:null,
  calibration_summary:summary,
  inputs:j.inputs.map(i=>({kind:i.kind,ref:i.ref,available_at:i.available_at,origin:i.origin,href:inputHref(i)})),
 };
 if(!j.abstained&&j.kind==='probability'&&!validP((j.claim as ProbabilityClaim|null)?.p))card.missing=['invalid_claim'];
 if(j.abstained){card.abstain_reason=j.abstain_reason??undefined;}
 if(opts.merged_from!==undefined)card.merged_from=opts.merged_from;
 return card;
}

export interface CardsOptions{now:string;includeAbstained:boolean;requestedKey?:string}
/**
 * Envelopes → cards with the publication gate applied a second time (defence in depth over RLS,
 * spec §4.1): a method missing from `methods` or with publishable=false yields no card. Abstained
 * cards only when asked. A card whose subject_key differs from the requested issuer came through
 * the merged-issuer lookup (spec §12.4) and is marked merged_from.
 */
export function cardsOf(envelopes:Envelope[],methods:ReadonlyMap<string,MethodologyRow>,o:CardsOptions):JudgmentCard[]{
 const out:JudgmentCard[]=[];
 for(const e of envelopes){
  const m=methods.get(`${e.judgment.methodology_id}@${e.judgment.methodology_version}`);
  if(!m||!m.publishable)continue;
  if(e.judgment.abstained&&!o.includeAbstained)continue;
  const merged=o.requestedKey!==undefined&&e.judgment.subject_type==='issuer'&&e.judgment.subject_key!==o.requestedKey?e.judgment.subject_key:undefined;
  out.push(toCard(e,{title:{zh:m.title_zh,en:m.title_en},now:o.now,merged_from:merged}));
 }
 return out;
}
export const methodKey=(m:Pick<MethodologyRow,'methodology_id'|'version'>)=>`${m.methodology_id}@${m.version}`;

export type DerivedOdds={status:'not_computed';reasons:string[]}|{status:'computed';b:number;f:number};
const P_TOLERANCE=0.01,EPS=1e-9;
/**
 * spec §9.4: odds b = value_up / |value_down| and fractional Kelly f = k·(p·b − (1 − p)) / b, only when
 * both judgments are open and calibrated, the scenarios are the conditional distribution of the SAME
 * condition (scenario_event_hash = digest(winRate.condition)), Σp = 1, value_up > 0 > value_down, same
 * as_of / subject / target / horizon unit, |p_up − p| ≤ 0.01, and 0 < k ≤ 1. Otherwise every failed
 * precondition is listed and nothing is computed.
 */
export function derivedOdds(winRate:Envelope,returnRange:Envelope,opts:{k:number;now:string}):DerivedOdds{
 const reasons:string[]=[];
 const w=winRate.judgment,r=returnRange.judgment;
 if(w.judgment_type!=='thesis_win_rate'||w.kind!=='probability'||r.judgment_type!=='return_range'||r.kind!=='interval')reasons.push('wrong_type');
 if(lifecycleOf(winRate)!=='open'||lifecycleOf(returnRange)!=='open')reasons.push('not_open');
 if(calibrationStateOf(winRate,w.kind,opts.now)!=='calibrated'||calibrationStateOf(returnRange,r.kind,opts.now)!=='calibrated')reasons.push('not_calibrated');
 if(!(Number.isFinite(opts.k)&&opts.k>0&&opts.k<=1))reasons.push('invalid_k');
 const claim=r.claim as IntervalClaim|null;const p=(w.claim as ProbabilityClaim|null)?.p;
 if(!validP(p))reasons.push('invalid_probability');
 const sc=claim?.scenarios;
 const up=sc?.find(s=>s.label==='up'),down=sc?.find(s=>s.label==='down');
 if(!sc||sc.length!==2||!up||!down)reasons.push('scenarios_missing');
 else{
  if(!sc.every(s=>Number.isFinite(s.p)&&s.p>=0&&s.p<=1&&Number.isFinite(s.value)))reasons.push('scenario_values_invalid');
  else{
   if(Math.abs(up.p+down.p-1)>EPS)reasons.push('scenarios_not_normalized');
   if(!(up.value>0&&down.value<0))reasons.push('scenario_values_invalid');
   if(validP(p)&&Math.abs(up.p-(p as number))>P_TOLERANCE+EPS)reasons.push('inputs_inconsistent');
  }
 }
 if(!w.condition||!claim||claim.scenario_event_hash!==digest(w.condition))reasons.push('event_mismatch');
 if(w.as_of!==r.as_of)reasons.push('as_of_mismatch');
 if(w.subject_type!==r.subject_type||w.subject_key!==r.subject_key)reasons.push('subject_mismatch');
 if(!w.target||!r.target||canonicalize(w.target)!==canonicalize(r.target))reasons.push('target_mismatch');
 if(!w.horizon||!r.horizon||w.horizon.unit!==r.horizon.unit)reasons.push('unit_mismatch');
 if(reasons.length>0||!up||!down||typeof p!=='number')return {status:'not_computed',reasons:[...new Set(reasons)]};
 const b=up.value/Math.abs(down.value);
 const f=opts.k*(p*b-(1-p))/b;
 if(!(Number.isFinite(b)&&b>0&&Number.isFinite(f)))return {status:'not_computed',reasons:['odds_not_finite']};
 return {status:'computed',b,f};
}
