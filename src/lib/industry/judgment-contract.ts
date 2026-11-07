// src/lib/industry/judgment-contract.ts
// Local copy of the F4 display contract (docs/superpowers/specs/2026-11-04-judgment-framework-design.md
// §3.1 Subject, §9.1 lifecycle/calibration, §9.2 JudgmentCard, §10 GET /api/judgments) until F4 lands
// and exports it; then replace these declarations with `import type … from '@/lib/judgments/contract'`.
// The industry page renders judgments only through this card (spec §7.2) and only when
// INDUSTRY_JUDGMENTS_ENABLED=1 (server flag; default off → "no judgment", no request). Owner decision
// D default: an uncalibrated card shows its category label, a badge and the falsifiable condition —
// never a percent, a score, a band or a colour grade.
export type Subject=
 |{type:'issuer';key:string}|{type:'industry';key:string}|{type:'macro_region';key:'US'|'CN'}
 |{type:'macro_series';key:string}|{type:'security';key:string}|{type:'document';key:string};
export type Kind='probability'|'categorical'|'score'|'interval';
export type Lifecycle='abstained'|'open'|'settled'|'void'|'withdrawn'|'pending_fill';
export type CalibrationState='insufficient'|'failed'|'calibrated'|'evaluated'|'self_assessed';
export interface Localized{zh:string;en:string}
export interface JudgmentCard{
 judgment_id:string;subject:Subject;judgment_type:string;kind:Kind;
 lifecycle:Lifecycle;calibration:CalibrationState;retrospective:boolean;
 as_of:string;registered_at:string;
 methodology:{id:string;version:string;title:Localized;href:string};
 display:{
  headline:Localized;
  percent:number|null;
  value:number|string|[number,number]|null;
  scale?:{min:number;max:number};dims?:{id:string;label:string;value:number|null;coverage:boolean}[];
  band?:'low'|'mid'|'high';
  nominal_coverage?:number;
 };
 condition:{text:Localized;horizon:unknown;target:unknown;label_policy:string;settle_after:string;settle_by:string}|null;
 settlement:{kind:string;outcome:string;realized:unknown;settled_at:string;evidence_summary:unknown}|null;
 calibration_summary:{n_independent:number;n_total:number;threshold_n:number;brier:number|null;brier_skill:number|null;ece_raw_holdout:number|null;valid_until:string|null;hit_rate:{rate:number;low:number;high:number}|null;href:string}|null;
 inputs:{kind:string;ref:unknown;available_at:string;origin:unknown;href:string|null}[];
 abstain_reason?:string;missing?:string[];
}
export interface JudgmentsResponse{subject:Subject;asOf:string;view:string;cards:JudgmentCard[]}

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
  const body=await r.json() as Partial<JudgmentsResponse>;
  return Array.isArray(body.cards)?{state:'ok',cards:body.cards}:{state:'error',code:'malformed'};
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
 settlement:{outcome:string;realized:string|null;settledAt:string}|null;
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
  percent:card.kind==='probability'&&calibrated&&card.display.percent!==null?card.display.percent:null,
  condition:card.condition?.text[locale]??null,abstainReason:card.lifecycle==='abstained'?card.abstain_reason??null:null,
  lifecycle:card.lifecycle,retrospective:card.retrospective,
  footer:{method:`${card.methodology.id}@${card.methodology.version}`,asOf:card.as_of,settleBy:card.condition?.settle_by??null,target:plain(card.condition?.target),horizon:plain(card.condition?.horizon)},
  inputs:(card.inputs??[]).map(i=>({kind:i.kind,ref:plain(i.ref)??'',availableAt:i.available_at,href:i.href})),
  settlement:card.settlement?{outcome:card.settlement.outcome,realized:plain(card.settlement.realized),settledAt:card.settlement.settled_at}:null,
 };
}
