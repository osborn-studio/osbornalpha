// src/lib/company/judgments.ts
// Company-page consumer of F4 judgment cards (plan 2026-11-06 Task 13; spec §10.4; F4 spec §9.2, §10).
// The page never computes a percentage: it renders display.percent only behind a client-side
// fail-closed check, and in replay accepts only an as_known response echoing the requested asOf
// with nothing registered or settled after the cutoff (asOf end of day).
export interface JudgmentCardDto{
 judgment_id:string;kind:string;lifecycle:string;calibration:string;retrospective?:boolean;
 as_of:string;registered_at:string;
 methodology:{id:string;version:string;title:{zh:string;en:string};href?:string};
 display:{headline:{zh:string;en:string};percent:unknown;value?:unknown;band?:'low'|'mid'|'high'};
 condition:{text:{zh:string;en:string}}|null;
 settlement:{outcome:string|null;settled_at:string;realized?:unknown}|null;
 calibration_summary:{n_independent?:number;n_total?:number;brier?:number|null;href?:string}|null;
}
export type JudgmentsCheck={ok:true;cards:JudgmentCardDto[]}|{ok:false;reason:'view_mismatch'|'asof_mismatch'|'post_cutoff'|'malformed'};

export function judgmentsUrl(issuerId:string,asOf:string|null):string{
 const q=new URLSearchParams({subject_type:'issuer',subject_key:issuerId,view:asOf?'as_known':'latest'});
 if(asOf)q.set('asOf',asOf);
 return `/api/judgments?${q.toString()}`;
}
const isCard=(c:unknown):c is JudgmentCardDto=>{
 const x=c as JudgmentCardDto|null;
 return typeof x==='object'&&x!==null&&typeof x.judgment_id==='string'&&typeof x.lifecycle==='string'&&typeof x.calibration==='string'&&typeof x.registered_at==='string'&&typeof x.display==='object'&&x.display!==null;
};
export function checkJudgmentsResponse(body:unknown,asOf:string|null):JudgmentsCheck{
 const b=body as {view?:unknown;asOf?:unknown;cards?:unknown}|null;
 if(typeof b!=='object'||b===null||!Array.isArray(b.cards)||!b.cards.every(isCard))return {ok:false,reason:'malformed'};
 if(b.view!==(asOf?'as_known':'latest'))return {ok:false,reason:'view_mismatch'};
 const cards=b.cards as JudgmentCardDto[];
 if(asOf){
  if(b.asOf!==asOf)return {ok:false,reason:'asof_mismatch'};
  const cutoff=`${asOf}T23:59:59.999Z`;
  const late=(t:string|undefined|null)=>{
   if(typeof t!=='string')return false;
   const ms=Date.parse(t);
   return Number.isNaN(ms)||new Date(ms).toISOString()>cutoff;   // an unparseable timestamp cannot be shown to precede the cutoff: fail closed
  };
  if(cards.some(c=>late(c.registered_at)||late(c.settlement?.settled_at)))return {ok:false,reason:'post_cutoff'};
 }
 return {ok:true,cards};
}
/** spec §10.4 defence: calibrated ∧ lifecycle ∈ {open, settled} ∧ finite number; otherwise no percentage. */
export function displayPercent(c:JudgmentCardDto):number|null{
 const p=c.display.percent;
 return c.calibration==='calibrated'&&(c.lifecycle==='open'||c.lifecycle==='settled')&&typeof p==='number'&&Number.isFinite(p)?p:null;
}
