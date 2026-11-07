// src/components/company/focus-target.ts
// Deep link into the statements view (event links, event-text.ts eventLink): ?concept=&periodEnd=&unit=&factId=.
// Pure: validation of the query, the statement tab the concept lives on, and which drawer to open once the
// grid has loaded. Server-safe (used by stock/[ticker]/page.tsx) and browser-safe.
import { conceptById } from '@/lib/facts/concepts';
import type { StatementsResponse } from '@/lib/company/client';
import type { StatementKind } from '@/lib/company/types';
import type { DrawerTarget } from './DrawerHost';

export interface FocusTarget{concept:string|null;periodEnd:string|null;unit:string|null;factId:string|null}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one=(v:string|string[]|undefined)=>typeof v==='string'?v:undefined;
function realDate(v:string|undefined):string|null{
 if(v===undefined||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
 const ms=Date.parse(`${v}T00:00:00Z`);return !Number.isNaN(ms)&&new Date(ms).toISOString().slice(0,10)===v?v:null;
}
/** Invalid parts are dropped; a target needs a known concept with a period, or a fact id. */
export function parseFocus(q:Record<string,string|string[]|undefined>):FocusTarget|null{
 const c=one(q.concept),concept=c!==undefined&&conceptById(c)?c:null;
 const periodEnd=realDate(one(q.periodEnd));
 const u=one(q.unit),unit=u!==undefined&&u.length>0&&u.length<=32?u:null;
 const f=one(q.factId),factId=f!==undefined&&UUID.test(f)?f:null;
 if(concept&&periodEnd)return {concept,periodEnd,unit,factId};
 if(factId)return {concept:null,periodEnd:null,unit:null,factId};
 return null;
}
/** Statement tab of a concept; DEI concepts (shares outstanding…) are shown on the balance sheet. */
export function focusStatement(f:FocusTarget|null):StatementKind{
 const s=f?.concept?conceptById(f.concept)?.statement:undefined;
 return s==='BS'||s==='CF'||s==='IS'?s:s?'BS':'IS';
}
/** Navigation identity of a focus: its four parts plus the replay date. */
export const focusSignature=(f:FocusTarget|null,asOf:string|null)=>f?`${focusKey(f)}@${asOf??''}`:null;
/** A NEW non-null signature re-syncs the statement tab (once); the same one never overrides a manual tab change. */
export const shouldSyncFocus=(prev:string|null,next:string|null)=>next!==null&&next!==prev;
export const focusKey=(f:FocusTarget)=>`${f.concept??''}|${f.periodEnd??''}|${f.unit??''}|${f.factId??''}`;
/** The drawer to open for `f` against a loaded grid; null when the grid is another statement or nothing matches. */
export function resolveFocusOpen(f:FocusTarget,r:StatementsResponse,scaleExp:number):DrawerTarget|null{
 if(r.truncated||r.statement!==focusStatement(f))return null;
 if(f.factId)return {kind:'historyByFact',factId:f.factId,scaleExp};
 const row=r.rows.find(x=>x.concept===f.concept);if(!row)return null;
 for(const p of r.periods){
  if(p.periodEnd!==f.periodEnd)continue;
  const c=row.cells[p.key];
  if(c?.kind==='fact'&&(f.unit===null||c.unit===f.unit))
   return {kind:'history',key:{concept:row.concept,periodStart:p.periodStart,periodEnd:p.periodEnd,unit:c.unit},duration:p.duration,otherUnits:c.otherUnits,scaleExp:row.unitKind==='money'?scaleExp:0};
 }
 return null;
}
