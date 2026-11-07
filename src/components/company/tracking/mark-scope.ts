// Pure scope rules of "mark read" (plan Task 17 step S; audit S2/S3). The ids submitted are the unread rows shown
// in the selected market stream at click time; a reply only touches those ids, and only while the scope
// (filters / issuer / page load) it was submitted from is still the current generation.
export interface MarkRow{eventId:string;issuerId:string;market:string;read:boolean}
/** A dual-market issuer (US + CN streams) shows and marks only the selected stream's rows. */
export const marketRows=<T extends {market:string}>(rows:T[],market:string):T[]=>rows.filter(r=>r.market===market);
/** The unread ids shown right now (what a click submits). */
export const unreadIds=(rows:{eventId:string;read:boolean}[]):Set<string>=>new Set(rows.filter(r=>!r.read).map(r=>r.eventId));
/** A reply applies only when no newer load / scope change happened since the request was sent. */
export const shouldApply=(sent:number,current:number):boolean=>sent===current;
/** unreadOnly: drop the submitted rows; else mark them read. Rows that arrived later are untouched. */
export function applyMarkResult<T extends {eventId:string;read:boolean}>(rows:T[],submitted:Set<string>,o:{unreadOnly:boolean}):T[]{
 return o.unreadOnly?rows.filter(r=>!submitted.has(r.eventId)):rows.map(r=>submitted.has(r.eventId)?{...r,read:true}:r);
}

/** Scope fingerprint of the inbox (issuer / kind / unread-only): rows and cursor belong to exactly one scope. */
export const scopeKey=(s:{issuer:string|null;kind:string;unreadOnly:boolean}):string=>`${s.issuer??''}|${s.kind}|${s.unreadOnly?1:0}`;
/** Mark-read and load-more are enabled only once the CURRENT scope has loaded successfully (a failed A→B switch keeps them off). */
export const scopeReady=(loaded:string|null,current:string):boolean=>loaded===current;

export type MarkOutcome<T>={kind:'stale'}|{kind:'applied';n:number;apply:(prev:T[])=>T[]};
/**
 * The "mark this page read" flow. Submits the unread rows shown now; the reply is applied only to the ids it
 * submitted and only if `generation()` still equals the value captured before sending. Rejections propagate
 * (the caller decides with shouldApply whether to surface them).
 */
export async function markPageFlow<T extends {eventId:string;read:boolean}>(o:{
 rows:T[];unreadOnly:boolean;generation:()=>number;submit:(rows:T[])=>Promise<number>;
}):Promise<MarkOutcome<T>>{
 const sent=o.generation(),submitted=unreadIds(o.rows);
 const n=await o.submit(o.rows.filter(r=>submitted.has(r.eventId)));
 if(!shouldApply(sent,o.generation()))return {kind:'stale'};
 return {kind:'applied',n,apply:(prev)=>applyMarkResult(prev,submitted,{unreadOnly:o.unreadOnly})};
}
