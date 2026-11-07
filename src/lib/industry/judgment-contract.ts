// src/lib/industry/judgment-contract.ts
// Industry consumer of F4's public card and list route.
// The industry page renders judgments only through this card (spec §7.2) and only when
// INDUSTRY_JUDGMENTS_ENABLED=1 (server flag; default off → "no judgment", no request). Owner decision
// D default: an uncalibrated card shows its category label, a badge and the falsifiable condition —
// never a percent, a score, a band or a colour grade.
import type {JudgmentCard,Lifecycle,Subject} from '@/lib/judgments/types';
export type {JudgmentCard} from '@/lib/judgments/types';
export interface JudgmentsResponse{subject:Subject;asOf:string|null;view:'latest'|'as_known';cards:JudgmentCard[]}
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==='string';
const bilingual=(v:unknown)=>obj(v)&&str(v.zh)&&str(v.en);
const oneOf=(v:unknown,values:readonly string[])=>str(v)&&values.includes(v);
function cardOf(v:unknown,key:string):v is JudgmentCard{
 if(!obj(v)||!obj(v.subject)||v.subject.type!=='industry'||v.subject.key!==key||!str(v.judgment_id)||!str(v.judgment_type)||!oneOf(v.kind,['probability','categorical','score','interval'])||!oneOf(v.lifecycle,['abstained','open','settled','void','withdrawn','pending_fill'])||!oneOf(v.calibration,['insufficient','failed','calibrated','evaluated','self_assessed'])||typeof v.retrospective!=='boolean'||!str(v.as_of)||!str(v.registered_at))return false;
 if(!obj(v.methodology)||!str(v.methodology.id)||!str(v.methodology.version)||!str(v.methodology.href)||!bilingual(v.methodology.title)||!obj(v.display)||!bilingual(v.display.headline)||!('value' in v.display)||!Array.isArray(v.inputs))return false;
 if('percent' in v.display&&v.display.percent!==null&&(typeof v.display.percent!=='number'||!Number.isFinite(v.display.percent)))return false;
 if(v.condition!==null&&(!obj(v.condition)||!bilingual(v.condition.text)||!str(v.condition.settle_by)))return false;
 if(v.settlement!==null&&(!obj(v.settlement)||!str(v.settlement.outcome)||!str(v.settlement.settled_at)))return false;
 if(v.calibration_summary!==null&&(!obj(v.calibration_summary)||typeof v.calibration_summary.n_independent!=='number'||typeof v.calibration_summary.threshold_n!=='number'))return false;
 return v.inputs.every(i=>obj(i)&&str(i.kind)&&str(i.available_at)&&('ref' in i)&&(i.href===null||str(i.href)));
}
function responseOf(v:unknown,key:string):v is JudgmentsResponse{
 return obj(v)&&obj(v.subject)&&v.subject.type==='industry'&&v.subject.key===key&&(v.asOf===null||str(v.asOf))&&oneOf(v.view,['latest','as_known'])&&((v.view==='latest'&&v.asOf===null)||(v.view==='as_known'&&str(v.asOf)))&&Array.isArray(v.cards)&&v.cards.every(c=>cardOf(c,key));
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
