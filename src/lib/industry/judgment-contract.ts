// src/lib/industry/judgment-contract.ts
// Industry consumer of F4's public card and list route.
// The industry page renders judgments only through this card (spec §7.2) and only when
// INDUSTRY_JUDGMENTS_ENABLED=1 (server flag; default off → "no judgment", no request). Owner decision
// D default: an uncalibrated card shows its category label, a badge and the falsifiable condition —
// never a percent, a score, a band or a colour grade.
import type {CardView as F4CardView,JudgmentCard,Lifecycle,Subject} from '@/lib/judgments/types';
export type {JudgmentCard} from '@/lib/judgments/types';
export interface JudgmentsResponse{subject:Subject;asOf:string|null;view:F4CardView;cards:JudgmentCard[]}
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==='string';
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const nullable=(v:unknown,check:(x:unknown)=>boolean)=>v===null||check(v);
const keys=(v:Record<string,unknown>,allowed:readonly string[])=>Object.keys(v).every(k=>allowed.includes(k));
const exact=(v:unknown,allowed:readonly string[]):v is Record<string,unknown>=>obj(v)&&keys(v,allowed);
const bilingual=(v:unknown)=>exact(v,['zh','en'])&&str(v.zh)&&str(v.en);
const oneOf=(v:unknown,values:readonly string[])=>str(v)&&values.includes(v);
const date=(v:unknown)=>str(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const timestamp=(v:unknown)=>str(v)&&Number.isFinite(Date.parse(v));
const horizon=(v:unknown)=>exact(v,['unit','n'])&&oneOf(v.unit,['trading_sessions','calendar_days','calendar_months','fiscal_quarters'])&&num(v.n)&&v.n>0;
const target=(v:unknown)=>obj(v)&&(
 (exact(v,['kind','base_date','n'])&&v.kind==='session_index'&&date(v.base_date)&&num(v.n))||
 (exact(v,['kind','date'])&&v.kind==='date'&&date(v.date))||
 (exact(v,['kind','period'])&&v.kind==='period'&&str(v.period))||
 (exact(v,['kind','period_end','calendar','extrapolated'])&&v.kind==='fiscal_period'&&date(v.period_end)&&exact(v.calendar,['anchor_period_end','months'])&&date(v.calendar.anchor_period_end)&&v.calendar.months===3&&typeof v.extrapolated==='boolean'));
const realized=(v:unknown)=>exact(v,['value','label','unit','from','to','label_policy'])&&(['number','string','boolean'].includes(typeof v.value))&&
 (v.label===undefined||str(v.label))&&nullable(v.unit,str)&&nullable(v.from,str)&&nullable(v.to,str)&&oneOf(v.label_policy,['first_observed','cutoff_vintage']);
const summary=(v:unknown)=>exact(v,['n_independent','n_total','threshold_n','brier','brier_skill','ece_raw_holdout','valid_until','hit_rate','accuracy','coverage','spearman','href'])&&
 ['n_independent','n_total','threshold_n'].every(k=>num(v[k]))&&['brier','brier_skill','ece_raw_holdout','accuracy','coverage','spearman'].every(k=>v[k]===undefined||nullable(v[k],num))&&timestamp(v.valid_until)&&
 nullable(v.hit_rate,x=>exact(x,['rate','low','high'])&&num(x.rate)&&nullable(x.low,num)&&nullable(x.high,num))&&str(v.href);
function cardOf(v:unknown,key:string):v is JudgmentCard{
 if(!exact(v,['judgment_id','subject','judgment_type','kind','lifecycle','outcome','calibration','retrospective','as_of','registered_at','methodology','display','condition','settlement','calibration_summary','inputs','abstain_reason','missing','merged_from'])||
 !exact(v.subject,['type','key'])||v.subject.type!=='industry'||v.subject.key!==key||!str(v.judgment_id)||!oneOf(v.judgment_type,['macro_regime','macro_regime_asset_pair','recommendation_call','industry_lifecycle_stage','industry_prosperity','valuation_verdict','thesis_win_rate','return_range','sellside_rating','sellside_target_price','synthetic_fact_metric'])||
 !oneOf(v.kind,['probability','categorical','score','interval'])||!oneOf(v.lifecycle,['abstained','open','settled','void','withdrawn','pending_fill'])||!nullable(v.outcome,x=>oneOf(x,['hit','miss']))||
 !oneOf(v.calibration,['insufficient','failed','calibrated','evaluated','self_assessed'])||typeof v.retrospective!=='boolean'||!date(v.as_of)||!timestamp(v.registered_at)||
 !exact(v.methodology,['id','version','title','href'])||!str(v.methodology.id)||!str(v.methodology.version)||!bilingual(v.methodology.title)||!str(v.methodology.href)||
 !exact(v.display,['headline','percent','value','scale','dims','band','nominal_coverage'])||!bilingual(v.display.headline)||!('value' in v.display)||
 !nullable(v.display.value,x=>num(x)||str(x)||Array.isArray(x)&&x.length===2&&x.every(num))||
 (v.display.percent!==undefined&&!nullable(v.display.percent,num))||
 (num(v.display.percent)&&(v.kind!=='probability'||v.calibration!=='calibrated'))||
 (v.display.scale!==undefined&&(!exact(v.display.scale,['min','max'])||!num(v.display.scale.min)||!num(v.display.scale.max)))||
 (v.display.dims!==undefined&&(!Array.isArray(v.display.dims)||!v.display.dims.every(x=>exact(x,['id','label','value','coverage'])&&str(x.id)&&bilingual(x.label)&&nullable(x.value,num)&&typeof x.coverage==='boolean')))||
 (v.display.band!==undefined&&!oneOf(v.display.band,['low','mid','high']))||(v.display.nominal_coverage!==undefined&&!num(v.display.nominal_coverage)))return false;
 if(v.condition!==null&&(!exact(v.condition,['text','horizon','target','label_policy','settle_after','settle_by'])||!bilingual(v.condition.text)||!horizon(v.condition.horizon)||!target(v.condition.target)||!oneOf(v.condition.label_policy,['first_observed','cutoff_vintage'])||!timestamp(v.condition.settle_after)||!timestamp(v.condition.settle_by)))return false;
 if(v.settlement!==null&&(!exact(v.settlement,['kind','outcome','realized','settled_at','evidence_summary'])||!oneOf(v.settlement.kind,['settled','void','withdrawn','reopened'])||!nullable(v.settlement.outcome,x=>oneOf(x,['hit','miss']))||!nullable(v.settlement.realized,realized)||!timestamp(v.settlement.settled_at)||!bilingual(v.settlement.evidence_summary)))return false;
 if(!nullable(v.calibration_summary,summary)||!Array.isArray(v.inputs)||!v.inputs.every(i=>exact(i,['kind','ref','available_at','origin','href'])&&oneOf(i.kind,['financial_fact','financial_metric','macro_observation','macro_snapshot','price_bar','table_rows','judgment','legacy_fill','document_span'])&&'ref' in i&&timestamp(i.available_at)&&obj(i.origin)&&keys(i.origin,['publisher','adapter','locator','transform'])&&str(i.origin.publisher)&&str(i.origin.adapter)&&str(i.origin.locator)&&nullable(i.href,str)))return false;
 return (v.abstain_reason===undefined||str(v.abstain_reason))&&(v.missing===undefined||Array.isArray(v.missing)&&v.missing.every(str))&&(v.merged_from===undefined||str(v.merged_from));
}
function responseOf(v:unknown,key:string):v is JudgmentsResponse{
 return exact(v,['codeVersion','subject','asOf','view','cards'])&&obj(v.subject)&&v.subject.type==='industry'&&v.subject.key===key&&
 (v.codeVersion===undefined||nullable(v.codeVersion,str))&&oneOf(v.view,['latest','as_known'])&&
 ((v.view==='latest'&&v.asOf===null)||(v.view==='as_known'&&date(v.asOf)))&&Array.isArray(v.cards)&&v.cards.every(c=>cardOf(c,key));
}

/** F4 §3.1 industry subject key: `${scheme}:${version}:${code}`. */
export const industrySubjectKey=(scheme:string,version:string,code:string)=>`${scheme}:${version}:${code}`;
export const judgmentsEnabled=(env:Record<string,string|undefined>=process.env)=>env.INDUSTRY_JUDGMENTS_ENABLED==='1';
export const judgmentsUrl=(subjectKey:string)=>`/api/judgments?subject_type=industry&subject_key=${encodeURIComponent(subjectKey)}&include_abstained=1`;

export type JudgmentsState={state:'disabled'}|{state:'ok';cards:JudgmentCard[]}|{state:'error';code:string};
/** Client fetch of the F4 cards; never called while the flag is off. */
export async function fetchIndustryJudgments(subjectKey:string,opts:{enabled:boolean;fetch?:typeof fetch;signal?:AbortSignal}):Promise<JudgmentsState>{
 if(!opts.enabled)return {state:'disabled'};
 try{
  const r=await (opts.fetch??fetch)(judgmentsUrl(subjectKey),{signal:opts.signal});
  if(!r.ok)return {state:'error',code:`http_${r.status}`};
  const body:unknown=await r.json();
  return responseOf(body,subjectKey)?{state:'ok',cards:body.cards}:{state:'error',code:'malformed'};
 }catch(e){
  return {state:'error',code:(e as {name?:string}).name==='AbortError'?'aborted':'network'};
 }
}

/** The result of one fetch, tagged with the subject it was fetched for. */
export interface LoadedJudgments{key:string;result:JudgmentsState}
export type JudgmentsView=JudgmentsState|{state:'loading'};
/** What the area shows now: disabled when off or without a subject; loading until the fetched subject
 *  matches the current one (a stale result of another subject or of an earlier enabled state is never shown). */
export function judgmentsViewState(enabled:boolean,subjectKey:string|null,loaded:LoadedJudgments|null):JudgmentsView{
 if(!enabled||subjectKey===null)return {state:'disabled'};
 return loaded!==null&&loaded.key===subjectKey?loaded.result:{state:'loading'};
}
/** Starts the fetch for an active area (never while disabled); returns the cleanup that aborts it. */
export function startJudgmentsLoad(opts:{enabled:boolean;subjectKey:string|null;onResult:(l:LoadedJudgments)=>void;fetch?:typeof fetch}):()=>void{
 const key=opts.subjectKey;
 if(!opts.enabled||key===null)return ()=>{};
 const ctrl=new AbortController();
 fetchIndustryJudgments(key,{enabled:true,fetch:opts.fetch,signal:ctrl.signal}).then(result=>{if(!ctrl.signal.aborted)opts.onResult({key,result});});
 return ()=>ctrl.abort();
}

export interface CardView{
 title:string;headline:string;
 badge:{kind:'uncalibrated';n:number;threshold:number}|{kind:'failed';ece:number|null}|{kind:'calibrated'}|{kind:'evaluated'}|{kind:'self_assessed'};
 /** only probability × calibrated (F4 §9.3); null everywhere else */
 percent:number|null;
 condition:string|null;abstainReason:string|null;lifecycle:Lifecycle;retrospective:boolean;
 footer:{method:string;asOf:string;settleBy:string|null;target:string|null;horizon:string|null};
 inputs:{kind:string;ref:string;availableAt:string;href:string|null}[];
 settlement:{outcome:string|null;realized:string|null;settledAt:string}|null;
}
const plain=(v:unknown):string|null=>{
 if(v===null||v===undefined)return null;
 if(typeof v==='string')return v||null;
 if(typeof v==='number'||typeof v==='boolean')return String(v);
 if(typeof v==='object'&&Object.keys(v as object).length===0)return null;
 return JSON.stringify(v);
};
/** F4 §9.3 rendering rules with owner decision D: uncalibrated → label + badge + condition only. */
export function judgmentCardView(card:JudgmentCard,locale:'zh'|'en'):CardView{
 const calibrated=card.calibration==='calibrated';
 const s=card.calibration_summary;
 const badge:CardView['badge']=calibrated?{kind:'calibrated'}:card.calibration==='evaluated'?{kind:'evaluated'}:card.calibration==='self_assessed'?{kind:'self_assessed'}:card.calibration==='failed'?{kind:'failed',ece:s?.ece_raw_holdout??null}:{kind:'uncalibrated',n:s?.n_independent??0,threshold:s?.threshold_n??0};
 return {
  title:card.methodology.title[locale],headline:card.display.headline[locale],badge,
  percent:card.kind==='probability'&&calibrated&&typeof card.display.percent==='number'?card.display.percent:null,
  condition:card.condition?.text[locale]??null,abstainReason:card.lifecycle==='abstained'?card.abstain_reason??null:null,
  lifecycle:card.lifecycle,retrospective:card.retrospective,
  footer:{method:`${card.methodology.id}@${card.methodology.version}`,asOf:card.as_of,settleBy:card.condition?.settle_by??null,target:plain(card.condition?.target),horizon:plain(card.condition?.horizon)},
  inputs:(card.inputs??[]).map(i=>({kind:i.kind,ref:plain(i.ref)??'',availableAt:i.available_at,href:i.href})),
  settlement:card.settlement?{outcome:card.settlement.outcome,realized:plain(card.settlement.realized),settledAt:card.settlement.settled_at}:null,
 };
}
