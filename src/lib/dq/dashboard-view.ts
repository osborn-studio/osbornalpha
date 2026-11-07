// src/lib/dq/dashboard-view.ts
// Pure view rules for the /admin/dq panels (spec §7.2), kept out of the client component so they are
// unit-tested (the repo has no component-test setup: vitest runs src/**/*.test.ts in node). Tones are
// existing tokens only (text-danger / text-warn / text-text-muted / text-text-dim); no new colours.
export type Tone=''|'text-danger'|'text-warn'|'text-text-dim'|'text-text-muted'|'text-text-muted italic';
const DISCLOSURE_TONE:Record<string,Tone>={overdue:'text-danger',filed_not_ingested:'text-warn',unknown_upstream:'text-text-muted italic',pending:'text-text-dim',received_late:'text-warn',received:''};
export const disclosureTone=(state:string):Tone=>DISCLOSURE_TONE[state]??'text-text-dim';
/** Whole days past the due date for an overdue row; null otherwise (never for estimated / no_rule rows). */
export function overdueDays(row:{disclosure_state?:unknown;due_date?:unknown},today:string):number|null{
 if(row.disclosure_state!=='overdue'||typeof row.due_date!=='string')return null;
 const d=Math.round((Date.parse(`${today}T00:00:00Z`)-Date.parse(`${row.due_date}T00:00:00Z`))/86_400_000);
 return Number.isFinite(d)&&d>0?d:null;
}
export const sumByMarket=(b:{US:number;CN:number}|undefined)=>b?b.US+b.CN:0;

/** Claims panel: what the accept control does for a row. */
export type ClaimMode='accept'|'amend'|'sql_only';
export const claimMode=(op:unknown):ClaimMode=>op==='legacy'?'sql_only':op==='evidence_only'?'amend':'accept';

export interface AmendForm{op:'backdate_window'|'close_security';issuerId:string;ticker:string;validFrom:string;date:string;method:string}
export const AMEND_METHODS={backdate_window:['listing_date','ticker_change','curated'],close_security:['delisting','ticker_change','curated']} as const;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
/** POST /api/admin/dq/claims/[id] body for an evidence_only acceptance (spec §4.2.1 target/params per op), or an error key. */
export function amendBody(f:AmendForm):{ok:true;body:{status:'accepted';amend:{op:AmendForm['op'];target:{issuer_id:string;ticker:string;valid_from:string};params:Record<string,string>}}}|{ok:false;error:'amend_security'|'amend_date'|'amend_method'}{
 if(!f.ticker||!ISO.test(f.validFrom))return {ok:false,error:'amend_security'};
 if(!ISO.test(f.date))return {ok:false,error:'amend_date'};
 if(!(AMEND_METHODS[f.op] as readonly string[]).includes(f.method))return {ok:false,error:'amend_method'};
 const params:Record<string,string>=f.op==='backdate_window'?{new_valid_from:f.date,valid_from_method:f.method}:{valid_to:f.date,valid_to_method:f.method};
 return {ok:true,body:{status:'accepted',amend:{op:f.op,target:{issuer_id:f.issuerId,ticker:f.ticker,valid_from:f.validFrom},params}}};
}
/** The suggested op stored by the producer (params.suggested_op), defaulting to backdate_window. */
export const suggestedOp=(detail:unknown):AmendForm['op']=>{
 const op=(detail as {params?:{suggested_op?:unknown}}|null)?.params?.suggested_op;
 return op==='close_security'?'close_security':'backdate_window';
};

/** Quarantine inline interactions (spec §7.2): which control a row shows. */
export type QuarantineControl={kind:'candidates';options:{index:number;label:string}[]}|{kind:'lineage';options:{factId:string;label:string}[]}|{kind:'restore';enabled:boolean;reason:'passing'|'not_passing'|'no_result'|'inputs_changed'}|{kind:'plain'};
const str=(v:unknown)=>v===null||v===undefined?'—':String(v);
export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;detail?:unknown;restorable?:unknown}):QuarantineControl{
 const payload=(row.payload??{}) as Record<string,unknown>;
 if(row.reason_code==='ambiguous_value'&&Array.isArray(payload.candidates))
  return {kind:'candidates',options:(payload.candidates as Record<string,unknown>[]).map((c,index)=>({index,label:`${str(c.value)} ${str(c.unit)} · ${str(c.sourceConcept)} · ${str(c.filingRef)}`}))};
 if(row.reason_code==='lineage_conflict'&&Array.isArray(payload.fact_ids)){
  const values=Array.isArray(payload.values)?payload.values as Record<string,unknown>[]:[];
  return {kind:'lineage',options:(payload.fact_ids as unknown[]).map((id,i)=>{const v=values.find(x=>x.fact_id===id)??values[i]??{};return {factId:String(id),label:`${str(v.value)} · ${str(v.issuer_id)} · ${str(v.filing)}`};})};
 }
 if(row.reason_code==='reconcile_mismatch'){
  const latest=((row.detail??{}) as {latest_result?:{passed?:unknown}}).latest_result;
  if(!latest)return {kind:'restore',enabled:false,reason:'no_result'};
  if(latest.passed!==true)return {kind:'restore',enabled:false,reason:'not_passing'};
  // server-computed (loadDqDashboard): passed AND latest inputs_hash === inputsHashNow(row)
  return row.restorable===true?{kind:'restore',enabled:true,reason:'passing'}:{kind:'restore',enabled:false,reason:'inputs_changed'};
 }
 return {kind:'plain'};
}
/** POST /api/admin/dq/quarantine/[id] body for an accept with a selection (spec §4.4, §4.6). */
export function quarantineAcceptBody(c:QuarantineControl,choice:number|string|null):{status:'resolved_accept';chosen_candidate_index?:number;keep_fact_id?:string}|null{
 if(c.kind==='candidates'){if(typeof choice!=='number'||!c.options.some(o=>o.index===choice))return null;return {status:'resolved_accept',chosen_candidate_index:choice};}
 if(c.kind==='lineage'){if(typeof choice!=='string'||!c.options.some(o=>o.factId===choice))return null;return {status:'resolved_accept',keep_fact_id:choice};}
 if(c.kind==='restore'&&!c.enabled)return null;
 return {status:'resolved_accept'};
}
