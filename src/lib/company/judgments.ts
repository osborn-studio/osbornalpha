// src/lib/company/judgments.ts
// Company-page consumer of F4 judgment cards (plan 2026-11-06 Task 13; spec §10.4; F4 spec §9.2, §10).
// The page never computes a percentage: it renders display.percent only behind a client-side
// fail-closed check, and in replay accepts only an as_known response echoing the requested asOf
// with nothing registered, settled or calibrated after the cutoff (asOf end of day).
// Every field the card adapter reads is validated here, so a malformed body fails closed instead of crashing the render.
export interface Bilingual{zh:string;en:string}
/** One F4 evidence input. Only `href` and a label are rendered; the rest of F4's shape is kept untouched. */
export interface JudgmentInput{href?:string;label?:string|Bilingual;[k:string]:unknown}
export interface JudgmentCardDto{
 judgment_id:string;kind:string;lifecycle:string;calibration:string;retrospective?:boolean;
 as_of:string;registered_at:string;
 methodology:{id:string;version:string;title:Bilingual;href?:string};
 display:{headline:Bilingual;percent:unknown;value?:unknown;band?:'low'|'mid'|'high'};
 condition:{text:Bilingual}|null;
 settlement:{outcome:string|null;settled_at:string;realized?:unknown}|null;
 calibration_summary:{n_independent?:number;n_total?:number;brier?:number|null;href?:string;computed_at?:string;valid_until?:string}|null;
 inputs:JudgmentInput[];
}
export type JudgmentsCheck={ok:true;cards:JudgmentCardDto[]}|{ok:false;reason:'view_mismatch'|'asof_mismatch'|'post_cutoff'|'malformed'};

export function judgmentsUrl(issuerId:string,asOf:string|null):string{
 const q=new URLSearchParams({subject_type:'issuer',subject_key:issuerId,view:asOf?'as_known':'latest'});
 if(asOf)q.set('asOf',asOf);
 return `/api/judgments?${q.toString()}`;
}
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==='string';
const bi=(v:unknown):v is Bilingual=>obj(v)&&str(v.zh)&&str(v.en);
const optStr=(v:unknown)=>v===undefined||str(v);
const ts=(v:unknown)=>str(v)&&!Number.isNaN(Date.parse(v));
/** A link the page may render: same-site path or https; anything else (javascript:, data:, //host) is malformed. */
export const safeHref=(v:unknown):v is string=>str(v)&&(/^\/(?!\/)/.test(v)||/^https:\/\//i.test(v));
function normalizeCard(c:unknown):JudgmentCardDto|null{
 if(!obj(c))return null;
 const {methodology:m,display:d}=c;
 if(!str(c.judgment_id)||!str(c.kind)||!str(c.lifecycle)||!str(c.calibration)||!str(c.as_of)||!ts(c.registered_at))return null;
 if(c.retrospective!==undefined&&typeof c.retrospective!=='boolean')return null;
 if(!obj(m)||!str(m.id)||!str(m.version)||!bi(m.title)||(m.href!==undefined&&!safeHref(m.href)))return null;
 if(!obj(d)||!bi(d.headline)||(d.band!==undefined&&d.band!=='low'&&d.band!=='mid'&&d.band!=='high'))return null;
 const cond=c.condition??null;
 if(cond!==null&&!(obj(cond)&&bi(cond.text)))return null;
 const st=c.settlement??null;
 if(st!==null&&!(obj(st)&&ts(st.settled_at)&&(st.outcome===null||st.outcome===undefined||str(st.outcome))))return null;
 const cs=c.calibration_summary??null;
 if(cs!==null){
  if(!obj(cs))return null;
  if((cs.n_independent!==undefined&&typeof cs.n_independent!=='number')||!optStr(cs.computed_at)||!optStr(cs.valid_until))return null;
  if(cs.href!==undefined&&!safeHref(cs.href))return null;
 }
 const inputs=c.inputs??[];
 if(!Array.isArray(inputs))return null;
 for(const i of inputs){
  if(!obj(i)||(i.href!==undefined&&!safeHref(i.href)))return null;
  if(i.label!==undefined&&!str(i.label)&&!bi(i.label))return null;
 }
 return {...c,condition:cond,settlement:st,calibration_summary:cs,inputs} as unknown as JudgmentCardDto;
}
export function checkJudgmentsResponse(body:unknown,asOf:string|null):JudgmentsCheck{
 if(!obj(body)||!Array.isArray(body.cards))return {ok:false,reason:'malformed'};
 const cards:JudgmentCardDto[]=[];
 for(const raw of body.cards){const c=normalizeCard(raw);if(!c)return {ok:false,reason:'malformed'};cards.push(c);}
 if(body.view!==(asOf?'as_known':'latest'))return {ok:false,reason:'view_mismatch'};
 if(asOf){
  if(body.asOf!==asOf)return {ok:false,reason:'asof_mismatch'};
  const cutoff=`${asOf}T23:59:59.999Z`;
  const late=(t:string|undefined|null)=>{
   if(typeof t!=='string')return false;
   const ms=Date.parse(t);
   return Number.isNaN(ms)||new Date(ms).toISOString()>cutoff;   // an unparseable timestamp cannot be shown to precede the cutoff: fail closed
  };
  // A calibration summary must prove it was computed by the cutoff (a missing computed_at cannot); valid_until is a horizon, not a computation time.
  const calLate=(c:JudgmentCardDto)=>c.calibration_summary!==null&&(c.calibration_summary.computed_at===undefined||late(c.calibration_summary.computed_at));
  if(cards.some(c=>late(c.registered_at)||late(c.settlement?.settled_at)||calLate(c)))return {ok:false,reason:'post_cutoff'};
 }
 return {ok:true,cards};
}
/** spec §10.4 defence: calibrated ∧ lifecycle ∈ {open, settled} ∧ finite number; otherwise no percentage. */
export function displayPercent(c:JudgmentCardDto):number|null{
 const p=c.display.percent;
 return c.calibration==='calibrated'&&(c.lifecycle==='open'||c.lifecycle==='settled')&&typeof p==='number'&&Number.isFinite(p)?p:null;
}
