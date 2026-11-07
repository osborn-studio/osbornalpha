// src/components/macro/detail-model.ts
// Indicator detail helpers (spec §3.3). Period changes are exact decimals in the series' change unit; numbers become
// floats only as chart coordinates. Event markers: derived policy events (arrows) and FOMC calendar entries (circles).
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import type {AssetByCycle} from '@/lib/macro/series-extras';
import type {Cycle} from '@/lib/macro/cycles';
import {subtract,yoyPct} from '@/lib/macro/decimal';
import type {PolicyEvent} from '@/lib/macro/events';
import type {CalendarEvent} from '@/lib/macro/fomc';
import type {ChangeKind,MacroSeriesDef} from '@/lib/macro/types';
import type {ChartBand,ChartMarker,LinePoint} from './charts/MacroLineChart';
import {MISSING,roundDecimalText} from './macro-format';
import type {SourceJson} from './view-model';
export type DetailWindow='y3'|'y5'|'y10'|'all';
export function windowFrom(w:DetailWindow,today:string):string|null{
 if(w==='all')return null;
 const years=w==='y3'?3:w==='y5'?5:10;
 const d=`${Number(today.slice(0,4))-years}${today.slice(4,10)}`;
 return d.endsWith('-02-29')?`${d.slice(0,8)}28`:d;
}
export function diffText(cur:string,prev:string,kind:ChangeKind):string|null{
 if(kind==='bp')return canonicalDecimal(`${subtract(cur,prev)}e2`);
 if(kind==='pct'){const p=canonicalDecimal(prev);if(p==='0'||p.startsWith('-'))return null;return yoyPct(cur,prev);}
 return subtract(cur,prev);
}
export interface ObsLike{observation_id:string;period_end:string;value_text:string;version:number;available_at:string}
export function diffRows<T extends ObsLike>(obs:readonly T[],kind:ChangeKind):(T&{diff_text:string|null})[]{
 return obs.map((o,i)=>({...o,diff_text:i===0?null:diffText(o.value_text,obs[i-1].value_text,kind)}));
}
export function chartPoints(obs:readonly ObsLike[],mode:'level'|'diff',kind:ChangeKind):LinePoint[]{
 if(mode==='level')return obs.map(o=>({time:o.period_end,value:Number(o.value_text)}));
 return diffRows(obs,kind).flatMap(o=>o.diff_text===null?[]:[{time:o.period_end,value:Number(o.diff_text)}]);
}
export const bandsOf=(cycles:readonly Cycle[]):ChartBand[]=>cycles.map(c=>({start:c.start,end:c.end,direction:c.direction}));
/** Markers dated on/after the first plotted month, sorted by time. */
export function markersOf(events:readonly Pick<PolicyEvent,'effective_date'|'change_bp'>[],calendar:readonly Pick<CalendarEvent,'start'|'end'>[],firstPeriod:string):ChartMarker[]{
 const m0=firstPeriod.slice(0,7);
 const ev=events.filter(e=>e.effective_date.slice(0,7)>=m0).map(e=>({time:e.effective_date,kind:'derived' as const,text:`${e.change_bp} bp`}));
 const cal=calendar.filter(c=>c.end.slice(0,7)>=m0).map(c=>({time:c.end,kind:'calendar' as const,text:'FOMC'}));
 return [...ev,...cal].sort((a,b)=>a.time.localeCompare(b.time)||a.kind.localeCompare(b.kind));
}
export const cycleKey=(c:Pick<Cycle,'basis'|'direction'>):string=>c.basis==='policy_events'?`detail.policyDirection.${c.direction}`:`detail.direction.${c.direction}`;
export function assetChangeView(a:Pick<AssetByCycle,'change_text'|'change_kind'>):{text:string;tone:'up'|'down'|'flat'|'missing'}{
 if(a.change_text===null)return {text:MISSING,tone:'missing'};
 const r=roundDecimalText(a.change_text,a.change_kind==='bp'?0:2);
 const neg=r.startsWith('-');const abs=neg?r.slice(1):r;const zero=/^0(\.0+)?$/.test(abs);
 const text=`${zero?'':neg?'−':'+'}${abs}${a.change_kind==='pct'?'%':` ${a.change_kind}`}`;
 return {text,tone:zero?'flat':neg?'down':'up'};
}
export function sourceJsonOf(def:Pick<MacroSeriesDef,'source'>):SourceJson|null{
 const s=def.source;
 return s?{publisher:s.publisher,via:s.via??null,fetch_host:s.fetchHost,adapter:s.adapter,rights:s.rights,attribution:s.attribution}:null;
}
