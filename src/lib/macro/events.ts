// src/lib/macro/events.ts
// Read-time derived macro events (spec §6.1, version macro-events/1). Pure: the same observations give the
// same events. US policy events come from day-to-day changes of the official Fed target-range series
// (DFEDTARU / DFEDTARL via FRED). They are labelled 'derived' with their effective date and are never called
// "announcements". The FOMC meeting calendar is a separate 'calendar' kind (fomc.ts). China has no official
// automatic event source while LPR/MLF are missing (spec §6.1).
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {subtract} from './decimal';
import type {ObservationRow} from './types';
export const EVENTS_VERSION='macro-events/1';
export const US_TARGET_UPPER_ID='US_FED_TARGET_UPPER_D',US_TARGET_LOWER_ID='US_FED_TARGET_LOWER_D';
export type EventInput=Pick<ObservationRow,'observation_id'|'period_end'|'value_text'>;
export interface PolicyEvent{
 kind:'policy_target_change';region:'US';effective_date:string;upper_from:string;upper_to:string;lower_from:string;lower_to:string;change_bp:string;source:'derived';
 /** [upper prev, upper cur, lower prev, lower cur]: every input observation the event was derived from. */
 evidence:[string,string,string,string];version:string;
}
/** Exact decimal × 100 (percentage points → basis points). */
export const toBp=(delta:string):string=>canonicalDecimal(`${canonicalDecimal(delta)}e2`);
export const decimalSign=(v:string):-1|0|1=>{const c=canonicalDecimal(v);return c==='0'?0:c.startsWith('-')?-1:1;};
function assertAscending(rows:readonly EventInput[],label:string){
 for(let i=1;i<rows.length;i++)if(rows[i].period_end<=rows[i-1].period_end)throw new Error(`events_unsorted:${label}:${rows[i].period_end}`);
}
export function derivePolicyEvents(upper:readonly EventInput[],lower:readonly EventInput[]):PolicyEvent[]{
 assertAscending(upper,'upper');assertAscending(lower,'lower');
 const lowerBy=new Map(lower.map(r=>[r.period_end,r]));
 const days=upper.filter(u=>lowerBy.has(u.period_end)).map(u=>({u,l:lowerBy.get(u.period_end)!}));
 const out:PolicyEvent[]=[];
 for(let i=1;i<days.length;i++){
  const p=days[i-1],c=days[i];
  const du=subtract(c.u.value_text,p.u.value_text),dl=subtract(c.l.value_text,p.l.value_text);
  if(decimalSign(du)===0&&decimalSign(dl)===0)continue;
  out.push({kind:'policy_target_change',region:'US',effective_date:c.u.period_end,
   upper_from:canonicalDecimal(p.u.value_text),upper_to:canonicalDecimal(c.u.value_text),lower_from:canonicalDecimal(p.l.value_text),lower_to:canonicalDecimal(c.l.value_text),
   change_bp:toBp(decimalSign(du)!==0?du:dl),source:'derived',evidence:[p.u.observation_id,c.u.observation_id,p.l.observation_id,c.l.observation_id],version:EVENTS_VERSION});
 }
 return out;
}
