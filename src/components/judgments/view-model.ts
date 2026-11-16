// src/components/judgments/view-model.ts
// Pure view logic for the judgment UI (spec §9.3, §9.5, §9.6; canvas boards 1–7). Rules enforced here, tested in
// view-model.test.ts: a percent is rendered only for probability × calibrated; brass (the accent) is used only for the
// calibrated badge and the selected state, and every accent class of src/components/judgments lives in this file;
// hit / miss use --up / --down; charts have table equivalents. Components turn the returned message keys into text with
// useTranslations('judgments'). Type-only imports, so the file is safe in client bundles.
import type {CalibrationRow,CalibrationState,InputKind,Kind,Lifecycle,ReliabilityBin,SettlementRow,Target} from '@/lib/judgments/types';
import type {WireCard as JudgmentCard,MethodologyListItem,QueueItem} from './api-types';

export type Locale='zh'|'en';
export type Msg={key:string;values?:Record<string,string|number>};
export type Tone='up'|'down'|'neutral';
export type AnyCard=JudgmentCard&{source?:'recommendation'};

// ── classes (the only accent usages of the judgment UI) ──
export const BRASS_BADGE='border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]';
export const NEUTRAL_BADGE='border-[var(--border)] text-[var(--text-dim)]';
export const SELECTED='bg-[var(--accent-wash)] text-[var(--text)] shadow-[inset_0_-2px_0_var(--accent)]';
export const UNSELECTED='text-[var(--text-dim)] hover:text-[var(--text)]';
export const LINK='text-[var(--text)] underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text-dim)]';
export const TONE:Record<Tone,string>={up:'text-[var(--up)]',down:'text-[var(--down)]',neutral:'text-[var(--text-dim)]'};
export const badgeClass=(s:CalibrationState)=>s==='calibrated'?BRASS_BADGE:NEUTRAL_BADGE;
export const segmentClass=(selected:boolean)=>selected?SELECTED:UNSELECTED;

// ── numbers ──
export const fmt=(v:number|null|undefined,d=2)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toFixed(d);
/** Statistics (hit rate, accuracy, coverage) as a share; never used for a registered p. */
export const share=(v:number|null|undefined)=>v===null||v===undefined||!Number.isFinite(v)?'—':`${Math.round(v*100)}%`;
export const signed=(v:number|null|undefined,d=2)=>v===null||v===undefined||!Number.isFinite(v)?'—':`${v>0?'+':''}${v.toFixed(d)}`;
export const num=(m:Record<string,unknown>|null|undefined,k:string):number|null=>typeof m?.[k]==='number'&&Number.isFinite(m[k])?m[k] as number:null;
export const metricObject=(m:Record<string,unknown>|null|undefined,k:string):Record<string,unknown>=>{const v=m?.[k];return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};};
export const day=(iso:string|null|undefined)=>iso?iso.slice(0,10):'—';
export const minute=(iso:string|null|undefined)=>iso?`${iso.slice(0,10)} ${iso.slice(11,16)}`:'—';

// ── badges and states ──
export function calibrationMsg(state:CalibrationState,s:JudgmentCard['calibration_summary']):Msg{
 switch(state){
  case 'calibrated':return {key:'ui.calibration.calibrated'};
  case 'insufficient':return s?{key:'ui.calibration.insufficientN',values:{n:s.n_independent,threshold:s.threshold_n}}:{key:'ui.calibration.insufficient'};
  case 'failed':return s&&s.ece_raw_holdout!==null?{key:'ui.calibration.failedEce',values:{ece:fmt(s.ece_raw_holdout)}}:{key:'ui.calibration.failed'};
  case 'evaluated':return s&&typeof s.spearman==='number'?{key:'ui.calibration.evaluatedSpearman',values:{rho:fmt(s.spearman),n:s.n_independent}}:{key:'ui.calibration.evaluated'};
  case 'self_assessed':return {key:'ui.calibration.selfAssessed'};
 }
}
export function lifecycleView(c:Pick<JudgmentCard,'lifecycle'|'outcome'>):{msg:Msg;tone:Tone}{
 if(c.lifecycle==='settled'&&c.outcome)return {msg:{key:`ui.lifecycle.${c.outcome}`},tone:c.outcome==='hit'?'up':'down'};
 return {msg:{key:`ui.lifecycle.${c.lifecycle}`},tone:'neutral'};
}
/** Spec §9.3: a percent only for probability × calibrated; whatever else the server sends is not rendered. */
export function visiblePercent(c:Pick<JudgmentCard,'kind'|'calibration'|'display'>):number|null{
 return c.kind==='probability'&&c.calibration==='calibrated'&&typeof c.display.percent==='number'&&Number.isFinite(c.display.percent)&&c.display.percent>=0&&c.display.percent<=100?c.display.percent:null;
}
export function targetText(t:Target):string{
 switch(t.kind){
  case 'session_index':return `${t.base_date} +${t.n}`;
  case 'date':return t.date;
  case 'period':return t.period;
  case 'fiscal_period':return t.extrapolated?`${t.period_end}*`:t.period_end;
 }
}

// ── card body ──
export type CardBody=
 |{type:'percent';text:string;hitRate:Msg|null}
 |{type:'band';band:'low'|'mid'|'high'|null;note:Msg}
 |{type:'category';selected:string;realized:string|null;accuracy:Msg|null}
 |{type:'score';value:string;scale:string;dims:Array<{id:string;label:string;value:string;width:number;missing:boolean}>;evaluation:Msg}
 |{type:'interval';range:string;nominal:string|null;realized:string|null;coverage:Msg|null}
 |{type:'abstained';reason:string;missing:string[]};
const realizedText=(c:JudgmentCard)=>c.settlement?.realized?String(c.settlement.realized.label??c.settlement.realized.value):null;
export function cardBody(c:JudgmentCard,locale:Locale):CardBody{
 const s=c.calibration_summary;
 if(c.lifecycle==='abstained')return {type:'abstained',reason:c.abstain_reason??'',missing:c.missing??[]};
 switch(c.kind){
  case 'probability':{
   const pct=visiblePercent(c);
   if(pct!==null)return {type:'percent',text:`${pct}%`,hitRate:s?.hit_rate?{key:'ui.card.hitRate',values:{rate:share(s.hit_rate.rate),low:share(s.hit_rate.low),high:share(s.hit_rate.high),n:s.n_independent}}:null};
   return {type:'band',band:c.display.band??null,note:calibrationMsg(c.calibration,s)};
  }
  case 'categorical':
   return {type:'category',selected:String(c.display.value??''),realized:c.lifecycle==='settled'?realizedText(c):null,
    accuracy:c.calibration==='calibrated'&&typeof s?.accuracy==='number'?{key:'ui.card.accuracy',values:{rate:share(s.accuracy),n:s.n_independent}}:null};
  case 'score':{
   const scale=c.display.scale??{min:0,max:100};const span=scale.max-scale.min||1;
   return {type:'score',value:typeof c.display.value==='number'?fmt(c.display.value,0):'—',scale:`${scale.min}–${scale.max}`,
    dims:(c.display.dims??[]).map(d=>({id:d.id,label:d.label[locale],value:d.value===null?'—':fmt(d.value,0),width:d.value===null?0:Math.max(0,Math.min(100,((d.value-scale.min)/span)*100)),missing:!d.coverage||d.value===null})),
    evaluation:calibrationMsg(c.calibration,s)};
  }
  case 'interval':{
   const v=c.display.value;const range=Array.isArray(v)?`${signed(v[0])} ~ ${signed(v[1])}`:'—';
   return {type:'interval',range,nominal:typeof c.display.nominal_coverage==='number'?share(c.display.nominal_coverage):null,realized:c.lifecycle==='settled'?realizedText(c):null,
    coverage:c.calibration==='calibrated'&&typeof s?.coverage==='number'?{key:'ui.card.coverage',values:{rate:share(s.coverage),nominal:share(c.display.nominal_coverage)}}:null};
  }
 }
}
/** Mobile collapsed row (canvas board 7): title, type + calibration line, and a right-hand value (percent, band or lifecycle). */
export function collapsedView(c:JudgmentCard,locale:Locale):{title:string;type:Msg;calibration:Msg;percent:string|null;band:'low'|'mid'|'high'|null;lifecycle:Msg}{
 const pct=visiblePercent(c);
 return {title:c.display.headline[locale],type:{key:`ui.type.${c.judgment_type}`},calibration:calibrationMsg(c.calibration,c.calibration_summary),
  percent:pct===null?null:`${pct}%`,band:c.kind==='probability'&&pct===null?c.display.band??null:null,lifecycle:lifecycleView(c).msg};
}
/** Card foot line (spec §9.3 "方法 id@version · 截至 as_of · 条件 · 目标 · 结算"). */
export function footerView(c:JudgmentCard,locale:Locale):{method:string;asOf:string;condition:string|null;target:string|null}{
 return {method:`${c.methodology.id}@${c.methodology.version}`,asOf:c.as_of,condition:c.condition?c.condition.text[locale]:null,target:c.condition?targetText(c.condition.target):null};
}

// ── inputs drawer ──
export function refText(kind:InputKind,ref:unknown):string{
 const r=(ref??{}) as Record<string,unknown>;const s=(k:string)=>String(r[k]??'');
 switch(kind){
  case 'financial_fact':return s('fact_id');
  case 'financial_metric':return `${s('metric')} ${s('period_start')}–${s('period_end')}`;
  case 'macro_observation':return `${s('series_id')} ${s('period_end')} (${s('vintage_id')})`;
  case 'macro_snapshot':return s('snapshot_id');
  case 'price_bar':return `${s('market')}:${s('ticker')} ${s('date')} ${s('adjustment')}`;
  case 'table_rows':return `${s('table')} ${s('natural_key')}`;
  case 'judgment':return s('judgment_id');
  case 'legacy_fill':return s('recommendation_id');
  default:return JSON.stringify(ref);
 }
}
export function inputRows(c:JudgmentCard){
 return c.inputs.map((i,idx)=>({key:`${i.kind}:${idx}`,kind:i.kind,ref:refText(i.kind,i.ref),date:day(i.available_at),origin:`${i.origin.publisher} · ${i.origin.adapter}${i.origin.transform?` · ${i.origin.transform}`:''}`,href:i.href}));
}
/** Registered value shown only in the drawer (spec §9.3): p as a decimal while uncalibrated; categorical scores without %. */
export function registeredValue(c:JudgmentCard,judgment:{claim:unknown}|null):{type:'p';text:string}|{type:'scores';rows:Array<{cls:string;score:string}>}|null{
 if(c.kind==='probability'&&visiblePercent(c)===null&&typeof c.display.value==='number')return {type:'p',text:c.display.value.toFixed(2)};
 const claim=judgment?.claim as {classes?:string[];distribution?:Record<string,number>}|null|undefined;
 if(c.kind==='categorical'&&claim?.distribution){const order=claim.classes??Object.keys(claim.distribution);return {type:'scores',rows:order.filter(k=>k in claim.distribution!).map(k=>({cls:k,score:fmt(claim.distribution![k],3)}))};}
 return null;
}

// ── settlement timeline ──
export interface Step{key:string;at:string|null;detail:string|null;tone:Tone;done:boolean}
const SETTLEMENT_KEY=(s:Pick<SettlementRow,'kind'|'outcome'>)=>s.kind==='settled'?(s.outcome==='miss'?'ui.timeline.settledMiss':'ui.timeline.settledHit'):`ui.timeline.${s.kind}`;
export function timelineSteps(c:JudgmentCard,settlements:SettlementRow[]|undefined,locale:Locale):Step[]{
 const steps:Step[]=[{key:'ui.timeline.registered',at:c.registered_at,detail:`${c.methodology.id}@${c.methodology.version} · ${c.inputs.length}`,tone:'neutral',done:true}];
 if(c.lifecycle==='abstained')return [...steps,{key:'ui.timeline.abstained',at:null,detail:c.abstain_reason??null,tone:'neutral',done:true}];
 if(c.condition)steps.push({key:'ui.timeline.target',at:c.condition.settle_after,detail:`${targetText(c.condition.target)} · settle_by ${day(c.condition.settle_by)}`,tone:'neutral',done:false});
 const rows=settlements&&settlements.length?[...settlements].sort((a,b)=>a.seq-b.seq).map(s=>({kind:s.kind,outcome:s.outcome,at:s.settled_at,detail:s.realized?String(s.realized.label??s.realized.value):s.reason}))
  :c.settlement?[{kind:c.settlement.kind,outcome:c.settlement.outcome,at:c.settlement.settled_at,detail:c.settlement.evidence_summary[locale]}]:[];
 for(const r of rows)steps.push({key:SETTLEMENT_KEY(r),at:r.at,detail:r.detail,tone:r.kind==='settled'?(r.outcome==='miss'?'down':'up'):'neutral',done:true});
 const last=rows.at(-1)?.kind;
 if(c.lifecycle==='open'||c.lifecycle==='pending_fill'||last==='reopened')steps.push({key:c.lifecycle==='pending_fill'?'ui.timeline.pendingFill':'ui.timeline.pending',at:null,detail:null,tone:'neutral',done:false});
 return steps;
}

// ── reliability (table equivalent of the chart) ──
export function reliabilityRows(bins:ReliabilityBin[]){
 return bins.map(b=>({range:`${b.bin_low.toFixed(1)}–${b.bin_high.toFixed(1)}`,n:b.n,meanP:fmt(b.mean_p),hitRate:fmt(b.hit_rate),
  wilson:b.wilson_low===null||b.wilson_high===null?'—':`${fmt(b.wilson_low)}–${fmt(b.wilson_high)}`}));
}
export const reliabilityPoints=(bins:ReliabilityBin[])=>bins.filter(b=>b.n>0&&b.mean_p!==null&&b.hit_rate!==null).map(b=>({x:b.mean_p!,y:b.hit_rate!,n:b.n}));

// ── methods registry and detail ──
export type Domain='all'|'macro'|'industry'|'company';
export const DOMAINS:readonly Domain[]=['all','macro','industry','company'];
export const KINDS:readonly (Kind|'all')[]=['all','probability','categorical','score','interval'];
export const domainOf=(subjectTypes:readonly string[]):Exclude<Domain,'all'>=>subjectTypes.some(s=>s.startsWith('macro'))?'macro':subjectTypes.includes('industry')?'industry':'company';
/** Spec §9.1: only a valid scope='all' report counts; otherwise the method shows as insufficient. */
export const methodState=(cal:{state:CalibrationState;valid:boolean}|null):CalibrationState=>cal&&cal.valid?cal.state:'insufficient';
export const methodHref=(id:string,version:string)=>`/intel/methods/${encodeURIComponent(id)}/${encodeURIComponent(version)}`;
export function methodRows(items:MethodologyListItem[],kind:Kind|'all',domain:Domain){
 return items.filter(({methodology:row})=>(kind==='all'||row.kind===kind)&&(domain==='all'||domainOf(row.subject_types)===domain)).map(({methodology:row,calibration})=>({
  id:row.methodology_id,version:row.version,href:methodHref(row.methodology_id,row.version),title:{zh:row.title_zh,en:row.title_en},kind:row.kind,
  domain:domainOf(row.subject_types),status:row.status,publishable:row.publishable,state:methodState(calibration),
  nIndependent:calibration?calibration.n_independent:0,thresholdN:calibration?calibration.threshold_n:Number(row.params.threshold_n??100),
  brier:row.kind==='probability'?num(calibration?.metrics,'brier'):null,validUntil:calibration?.valid?day(calibration.valid_until):null}));
}
/** Two gates of spec §8.2 / §8.4 as displayed on the method page (gate 2's verdict is the stored state, not recomputed). */
export function gatesView(cal:CalibrationRow|null,valid:boolean){
 if(!cal)return null;
 const m=cal.metrics;
 const metric:Msg=cal.kind==='probability'?{key:'ui.method.gateEce',values:{ece:fmt(num(metricObject(m,'temporal_split'),'ece_raw_holdout')),max:fmt(cal.ece_max),skill:signed(num(metricObject(m,'temporal_split'),'brier_skill_holdout'))}}
  :cal.kind==='categorical'?{key:'ui.method.gateAccuracy',values:{low:share(num(metricObject(m,'accuracy_wilson'),'low')),base:share(num(m,'majority_rate'))}}
  :cal.kind==='interval'?{key:'ui.method.gateCoverage',values:{coverage:share(num(m,'coverage')),nominal:share(num(m,'nominal_coverage')),ratio:fmt(num(m,'width_ratio'))}}
  :{key:'ui.method.gateSpearman',values:{rho:fmt(num(m,'spearman'))}};
 return {sample:{ok:cal.n_independent>=cal.threshold_n,n:cal.n_independent,threshold:cal.threshold_n,total:cal.n_settled},
  calibration:{ok:cal.state==='calibrated'?true:cal.state==='failed'?false:null,metric},
  validity:{valid,validUntil:day(cal.valid_until),computedAt:day(cal.computed_at),revision:cal.validity_revision}};
}
export function confusionView(cal:CalibrationRow|null){
 const raw=cal?.metrics.confusion;
 if(!raw||typeof raw!=='object')return null;
 const conf=raw as Record<string,Record<string,number>>;
 const classes=[...new Set([...Object.keys(conf),...Object.values(conf).flatMap(r=>Object.keys(r))])];
 return {classes,rows:classes.map(sel=>({cls:sel,cells:classes.map(real=>({n:conf[sel]?.[real]??0,diagonal:sel===real}))}))};
}
export function holdoutRows(cal:CalibrationRow|null){
 if(!cal||cal.kind!=='probability')return [];
 const m=cal.metrics;
 return [{key:'ui.method.splitAll',n:cal.n_independent,brier:fmt(num(m,'brier'),3),skill:signed(num(m,'brier_skill')),ece:fmt(num(m,'ece_raw'),3)},
  {key:'ui.method.splitHoldout',n:num(metricObject(m,'temporal_split'),'n_holdout')??0,brier:fmt(num(metricObject(m,'temporal_split'),'brier_holdout'),3),skill:signed(num(metricObject(m,'temporal_split'),'brier_skill_holdout')),ece:fmt(num(metricObject(m,'temporal_split'),'ece_raw_holdout'),3)}];
}

// ── admin queue ──
export type SettleAction='enabled'|'not_due'|'leased'|'closed';
export function queueActions(q:QueueItem,now:string):{settle:SettleAction;withdraw:boolean;reopen:boolean}{
 const leased=q.leased_until!==null&&q.leased_until>now;
 const last=q.latest_settlement?.kind??null;
 return {settle:leased?'leased':q.closed_at!==null?'closed':q.settle_after>now?'not_due':'enabled',
  withdraw:!leased&&last==='settled',reopen:!leased&&(last==='void'||last==='withdrawn')};
}
export const LIFECYCLES:readonly Lifecycle[]=['abstained','open','settled','void','withdrawn','pending_fill'];
