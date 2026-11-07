// src/components/macro/detail-model.ts
// Indicator detail helpers (spec §3.3). Period changes and yoy come from the server (transform=diff|yoy, exact decimals);
// numbers become floats only as chart coordinates. Long histories load as bounded date chunks. Event markers: derived policy events (arrows) and FOMC calendar entries (circles).
import type {AssetByCycle} from '@/lib/macro/series-extras';
import type {Cycle} from '@/lib/macro/cycles';
import {MACRO_CATALOG} from '@/lib/macro/catalog';
import type {PolicyEvent} from '@/lib/macro/events';
import type {CalendarEvent} from '@/lib/macro/fomc';
import type {MacroSeriesDef,PeriodKind} from '@/lib/macro/types';
import type {ChartBand,ChartMarker,LinePoint} from './charts/MacroLineChart';
import {MISSING,roundDecimalText} from './macro-format';
import type {SeriesJson,SeriesObsJson,SourceJson} from './view-model';
export type DetailWindow='y1'|'y3'|'y5'|'y10'|'all';
const YEARS:Record<Exclude<DetailWindow,'all'>,number>={y1:1,y3:3,y5:5,y10:10};
/** Windows offered per series: daily series stop at 5Y (their history is long and dense), the rest start at 3Y. */
export const windowsFor=(period:PeriodKind):DetailWindow[]=>period==='day'?['y1','y3','y5']:['y3','y5','y10','all'];
export const defaultWindow=(period:PeriodKind):DetailWindow=>period==='day'?'y1':'y5';
/** Start of the history requested for `all` (before any catalog series begins). */
export const ALL_START='1940-01-01';
export function windowFrom(w:DetailWindow,today:string):string{
 if(w==='all')return ALL_START;
 const d=`${Number(today.slice(0,4))-YEARS[w]}${today.slice(4,10)}`;
 return d.endsWith('-02-29')?`${d.slice(0,8)}28`:d;
}
const DAY_MS=86_400_000;
const shiftDays=(d:string,n:number)=>new Date(Date.parse(`${d}T00:00:00Z`)+n*DAY_MS).toISOString().slice(0,10);
/** Chunk spans that keep every request under the API's 600-point limit: daily 500 days, monthly 40 years, quarterly 100 years. */
const SPAN:Record<PeriodKind,{days?:number;years?:number}>={day:{days:500},month:{years:40},quarter:{years:100}};
export function dateChunks(from:string,to:string,period:PeriodKind):{from:string;to:string}[]{
 const out:{from:string;to:string}[]=[];const span=SPAN[period];
 let start=from;
 while(start<=to){
  const next=span.days?shiftDays(start,span.days):`${Number(start.slice(0,4))+(span.years??1)}${start.slice(4,10)}`;
  const end=next>to?to:shiftDays(next,-1);
  out.push({from:start,to:end});
  if(next>to)break;
  start=next;
 }
 return out;
}
export type Transform='raw'|'yoy'|'diff';
/** Fetches bounded date chunks in parallel and merges them (oldest first); extras (cycles, events, def) come from the last chunk. */
export async function fetchSeriesWindow(seriesId:string,from:string,to:string,period:PeriodKind,transform:Transform,fetcher:typeof fetch=fetch):Promise<SeriesJson>{
 const chunks=dateChunks(from,to,period);
 const parts=await Promise.all(chunks.map(async c=>{
  const q=new URLSearchParams({from:c.from,to:c.to});if(transform!=='raw')q.set('transform',transform);
  const r=await fetcher(`/api/macro/series/${encodeURIComponent(seriesId)}?${q}`);
  const b=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(b?.error?.code??`http_${r.status}`);
  return b as SeriesJson;
 }));
 const last=parts[parts.length-1];
 const seen=new Set<string>();
 const observations=parts.flatMap(p=>p.observations).filter(o=>{const k=`${o.period_end}|${o.observation_id??o.computed?.inputs[1]}`;if(seen.has(k))return false;seen.add(k);return true;})
  .sort((x,y)=>x.period_end<y.period_end?-1:x.period_end>y.period_end?1:0);
 return {...last,observations};
}
/** Declared yoy derivation of a series: the yoy series that derives from it, or itself when it is the yoy. */
export function yoyOf(def:Pick<MacroSeriesDef,'id'|'derive'>,catalog:readonly Pick<MacroSeriesDef,'id'|'derive'>[]=MACRO_CATALOG):{self:boolean;id:string}|null{
 const isYoy=(d:Pick<MacroSeriesDef,'derive'>)=>d.derive?.kind==='yoy_from_index'||d.derive?.kind==='index_minus_100';
 if(isYoy(def))return {self:true,id:def.id};
 const child=catalog.find(d=>isYoy(d)&&d.derive?.from===def.id);
 return child?{self:false,id:child.id}:null;
}
/** Chart coordinates (floats only here). In diff mode the observations are the server's computed diff rows. */
export const chartPoints=(obs:readonly Pick<SeriesObsJson,'period_end'|'value_text'>[]):LinePoint[]=>obs.map(o=>({time:o.period_end,value:Number(o.value_text)}));
/** Computed diff text by period (server rows with computed.kind = diff). */
export const diffByPeriod=(rows:readonly SeriesObsJson[]):Map<string,string>=>new Map(rows.filter(r=>r.computed?.kind==='diff').map(r=>[r.period_end,r.value_text]));
/** Transform id/version shown in the table header: the computed diff version, else the stored transform of the first row. */
export const transformLabel=(rows:readonly SeriesObsJson[],diff:boolean):string|null=>{
 const r=rows[0];if(!r)return null;
 return diff?r.computed?.version??null:r.transform??null;
};
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
