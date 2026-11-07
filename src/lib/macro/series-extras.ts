// src/lib/macro/series-extras.ts
// Detail-page extras for GET /api/macro/series/[id] (spec §3.3, §6): derived US policy events, the FOMC calendar,
// cycle segments and enabled same-region asset moves per cycle. Reads full histories through
// MacroDb.seriesHistory, which pages to completion and throws `truncated` beyond maxRows; a partial series is never
// segmented. With asOf, every read is limited to rows available at asOf.
import {MACRO_CATALOG} from './catalog';
import {CYCLES_VERSION,assetChangeOverCycle,lastCompleteMonthEnd,policyCycles,seriesCycles,type AssetCycleChange,type Cycle,type InsufficientSegment} from './cycles';
import type {MacroDb} from './db';
import {EVENTS_VERSION,US_TARGET_LOWER_ID,US_TARGET_UPPER_ID,derivePolicyEvents,type PolicyEvent} from './events';
import {fomcCalendarEvents,type CalendarEvent} from './fomc';
import type {Bilingual,MacroSeriesDef} from './types';
export const DAILY_MAX_ROWS=20_000,MONTHLY_MAX_ROWS=5_000;
export interface AssetByCycle extends AssetCycleChange{cycle_index:number;asset_id:string;asset_name:Bilingual}
export interface SeriesExtras{events:PolicyEvent[];calendar:CalendarEvent[];cycles:Cycle[];insufficient:InsufficientSegment[];assetsByCycle:AssetByCycle[];eventsVersion:string;cyclesVersion:string}
export async function seriesExtras(db:Pick<MacroDb,'seriesHistory'>,def:MacroSeriesDef,opts:{asOf?:string}):Promise<SeriesExtras>{
 const read=(id:string,maxRows:number)=>db.seriesHistory(id,{asOf:opts.asOf,maxRows});
 let events:PolicyEvent[]=[];let lastTargetDay:string|null=null;
 if(def.region==='US'){
  const [upper,lower]=await Promise.all([read(US_TARGET_UPPER_ID,DAILY_MAX_ROWS),read(US_TARGET_LOWER_ID,DAILY_MAX_ROWS)]);
  events=derivePolicyEvents(upper,lower);
  lastTargetDay=upper.length?upper[upper.length-1].period_end:null;
 }
 let cycles:Cycle[]=[],insufficient:InsufficientSegment[]=[];
 if(def.region==='US'&&def.type==='policy_rate'){if(lastTargetDay)cycles=policyCycles(events,lastTargetDay);}
 else if(def.period==='month'&&def.role!=='event_source'){
  const r=seriesCycles(await read(def.aliasOf??def.id,MONTHLY_MAX_ROWS));cycles=r.cycles;insufficient=r.insufficient;
 }
 const self=def.aliasOf??def.id;
 const assets=MACRO_CATALOG.filter(a=>a.role==='asset'&&a.period==='month'&&a.status==='active'&&a.region===def.region&&a.id!==def.id&&(a.aliasOf??a.id)!==self);
 const assetsByCycle:AssetByCycle[]=[];
 if(cycles.length&&assets.length){
  const histories=await Promise.all(assets.map(a=>read(a.aliasOf??a.id,MONTHLY_MAX_ROWS)));
  cycles.forEach((c,ci)=>{
   const end=c.ongoing?lastCompleteMonthEnd(c.end):c.end;
   assets.forEach((a,ai)=>assetsByCycle.push({cycle_index:ci,asset_id:a.id,asset_name:a.name,...assetChangeOverCycle(histories[ai],{start:c.start,end},a.changeKind)}));
  });
 }
 return {events,calendar:def.region==='US'?fomcCalendarEvents(opts.asOf):[],cycles,insufficient,assetsByCycle,eventsVersion:EVENTS_VERSION,cyclesVersion:CYCLES_VERSION};
}
