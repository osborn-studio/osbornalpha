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
