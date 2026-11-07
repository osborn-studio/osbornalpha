// src/lib/macro/strategy/policy-events.ts
// US policy events across the 2008 regime change (spec 2026-11-07 §5.4, version macro-strategy-events/1).
// - from 2008-12-16: the P2 derivation over the target range (port.derivePolicyEvents), unchanged, basis 'range';
// - single-target era: neighbouring US_FED_TARGET_D observations whose values differ → one event on the later date,
//   upper = lower = the single target, evidence [prev, cur, prev, cur], basis 'single_target';
// - the switch: exactly three dated observations — the single target's last row on 2008-12-15 and the first upper and
//   lower rows on 2008-12-16 — give one 'single_to_range' event, every value read from those rows (no constants),
//   change_bp = toBp(u − s) from the UPPER bound always (spec §5.4; an unchanged upper with a moved lower is a 0 bp event
//   that episodes and the matrix skip), evidence [s, u, s, l]. Anything else → no event and an explicit gap
//   {kind:'transition_unverified', near:'2008-12-16'}.
// Inputs must be strictly ascending (P2 assertAscending). Same inputs → same output. Event-source histories are recorded
// as reads (purpose 'events') and only the rows needed to derive and verify each event are frozen (role
// 'events:<series>:evidence'): every evidence id of every event plus the transition tuple (the single target's last row,
// the first upper and lower rows), so each event re-derives from the manifest alone; the whole daily target history is
// too large to copy into every manifest. A truncated source read → no events and one gap {kind:'history_truncated',
// near: cutoff date} that every view shows (never an ordinary empty history).
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {VERSIONS} from './contract';
import type {EventGap,EventInput,PolicyEvent,StrategyPolicyEvent} from './contract';
import type {ManifestBuilder} from './manifest';
import {sign,subtract,toBp} from './numeric';
export const US_TARGET_SINGLE_ID='US_FED_TARGET_D',US_TARGET_UPPER_ID='US_FED_TARGET_UPPER_D',US_TARGET_LOWER_ID='US_FED_TARGET_LOWER_D';
export const TRANSITION_SINGLE_DATE='2008-12-15',TRANSITION_RANGE_DATE='2008-12-16';
export const EVENTS_PURPOSE='events';
type Derive=(upper:readonly EventInput[],lower:readonly EventInput[])=>PolicyEvent[];
function assertAscending(rows:readonly EventInput[],label:string){
 for(let i=1;i<rows.length;i++)if(rows[i].period_end<=rows[i-1].period_end)throw new Error(`events_unsorted:${label}:${rows[i].period_end}`);
}
function singleTargetEvents(single:readonly EventInput[]):StrategyPolicyEvent[]{
 const out:StrategyPolicyEvent[]=[];
 for(let i=1;i<single.length;i++){
  const p=single[i-1],c=single[i];const d=subtract(c.value_text,p.value_text);
  if(sign(d)===0)continue;
  const from=canonicalDecimal(p.value_text),to=canonicalDecimal(c.value_text);
  out.push({kind:'policy_target_change',region:'US',effective_date:c.period_end,upper_from:from,upper_to:to,lower_from:from,lower_to:to,change_bp:toBp(d),source:'derived',
   evidence:[p.observation_id,c.observation_id,p.observation_id,c.observation_id],version:VERSIONS.events,basis:'single_target'});
 }
 return out;
}
/** Merge the three event sources. derive = port.derivePolicyEvents (P2). */
export function mergePolicyEvents(derive:Derive,single:readonly EventInput[],upper:readonly EventInput[],lower:readonly EventInput[]):{events:StrategyPolicyEvent[];gaps:EventGap[]}{
 assertAscending(single,'single');assertAscending(upper,'upper');assertAscending(lower,'lower');
 const events:StrategyPolicyEvent[]=[...singleTargetEvents(single)];
 const gaps:EventGap[]=[];
 const rangeStartsByTransition=[upper[0],lower[0]].some(r=>r!==undefined&&r.period_end<=TRANSITION_RANGE_DATE);
 if(single.length>0||rangeStartsByTransition){
  const s=single[single.length-1],u=upper[0],l=lower[0];
  const reasons:string[]=[];
  if(!s)reasons.push('single_target_missing');else if(s.period_end!==TRANSITION_SINGLE_DATE)reasons.push(`single_target_last_not_${TRANSITION_SINGLE_DATE}`);
  if(!u)reasons.push('upper_missing');else if(u.period_end!==TRANSITION_RANGE_DATE)reasons.push(`upper_first_not_${TRANSITION_RANGE_DATE}`);
  if(!l)reasons.push('lower_missing');else if(l.period_end!==TRANSITION_RANGE_DATE)reasons.push(`lower_first_not_${TRANSITION_RANGE_DATE}`);
  if(reasons.length)gaps.push({kind:'transition_unverified',reason:reasons.join(';'),near:TRANSITION_RANGE_DATE});
  else{
   const du=subtract(u.value_text,s.value_text),dl=subtract(l.value_text,s.value_text);
   if(sign(du)!==0||sign(dl)!==0){
    const from=canonicalDecimal(s.value_text);
    events.push({kind:'policy_target_change',region:'US',effective_date:TRANSITION_RANGE_DATE,upper_from:from,upper_to:canonicalDecimal(u.value_text),lower_from:from,lower_to:canonicalDecimal(l.value_text),
     change_bp:toBp(du),source:'derived',evidence:[s.observation_id,u.observation_id,s.observation_id,l.observation_id],version:VERSIONS.events,basis:'single_to_range'});
   }
  }
 }
 for(const e of derive(upper,lower))events.push({...e,basis:'range'});
 events.sort((a,b)=>a.effective_date<b.effective_date?-1:a.effective_date>b.effective_date?1:0);
 return {events,gaps};
}
/** Read the three event-source histories asOf the builder cutoff, merge, and freeze the evidence rows plus the transition
 *  tuple. Any truncated read → no events and a history_truncated gap (the read state says which source). */
export async function readPolicyEvents(b:ManifestBuilder):Promise<{events:StrategyPolicyEvent[];gaps:EventGap[]}>{
 const opts={keepInputs:false};
 const single=await b.history(US_TARGET_SINGLE_ID,EVENTS_PURPOSE,'history',opts);
 const upper=await b.history(US_TARGET_UPPER_ID,EVENTS_PURPOSE,'history',opts);
 const lower=await b.history(US_TARGET_LOWER_ID,EVENTS_PURPOSE,'history',opts);
 if(!single||!upper||!lower){
  const truncated=[[US_TARGET_SINGLE_ID,single],[US_TARGET_UPPER_ID,upper],[US_TARGET_LOWER_ID,lower]].filter(([,r])=>r===null).map(([id])=>id);
  return {events:[],gaps:[{kind:'history_truncated',reason:truncated.join(';'),near:b.cutoff.slice(0,10)}]};
 }
 const merged=mergePolicyEvents((u,l)=>b.port.derivePolicyEvents(u,l),single,upper,lower);
 const needed=new Set(merged.events.flatMap(e=>[...e.evidence]));
 for(const r of [single[single.length-1],upper[0],lower[0]])if(r)needed.add(r.observation_id);
 b.keep([...single,...upper,...lower].filter(o=>needed.has(o.observation_id)),EVENTS_PURPOSE,'evidence');
 return merged;
}
