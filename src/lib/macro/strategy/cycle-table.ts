// src/lib/macro/strategy/cycle-table.ts
// Policy action episodes × asset interval changes (spec 2026-11-07 §5.5; table macro-cycle-table/1, episodes
// macro-policy-episodes/1). An episode is a run of same-direction §5.4 events: start = first event, end = LAST event
// (P2 policyCycles instead extends to the day before a flip and adds plateaus — a different definition). A §5.4 gap breaks
// a run and marks the episode before it gap_after; left_censored = the first episode; ongoing = the last episode when the
// manifest cutoff is less than 12 months after its last event (a label only; end stays the last event).
// Columns resolve through aliasOf and derive.from to the native daily series (day boundaries) and the month-end series
// (month_end boundary). Boundaries: event_day = last daily row before start / last on or before end; first_trading_day =
// first row on or after start / on or after end; month_end = month end before the start month / of the end month (end
// month not yet closed at the cutoff → month_not_closed). A chosen row more than 7 calendar days from its boundary, or a
// boundary outside the series' first..last row → out_of_coverage; both ends on one row → degenerate. pct = (to/from − 1) × 100
// (from ≤ 0 → non_positive_base; change_text = the exact ratio '<to>/<from>'), bp = toBp(to − from). Rounding is a display
// concern. The boundary and the ordered column ids are calculation parameters frozen in manifest.params ({boundary, columns as
// canonical JSON text}); buildCycleTable reads both only from there (no caller override), so each has its own manifest
// identity. The cutoff becomes a date through utcDate (UTC calendar date of the instant, any offset). A history_truncated gap (event source read truncated) yields no
// episodes and stays in view.gaps, so the page shows the truncation instead of an empty history.
import {VERSIONS} from './contract';
import type {Boundary,CycleCell,CycleColumn,CycleTableView,Episode,EventGap,FrozenSeriesDef,ManifestInput,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {canonicalJson} from './hash';
import {addMonthsDate,addMonthsYm,dayDiff,freezeDef,inputRole,inputsWithRole,latestCutoff,manifestBuilder,monthEnd,monthOf,readState,toObsRef,utcDate} from './manifest';
import {add,pctChange,pctRatio,sign,subtract,toBp} from './numeric';
import {readPolicyEvents} from './policy-events';
import type {StrategyReadPort} from './port';

export const COL_PURPOSE='col';
export const CYCLE_COLUMNS_V1:readonly string[]=['US_UST10Y','CN_CGB10Y','US_WTI','US_DTWEXBGS','CN_USDCNY_CP','US_SP500','US_NASDAQCOM','US_DJIA','CN_CSI300'];
export const MAX_BOUNDARY_GAP_DAYS=7;
export const ONGOING_MONTHS=12;
export const BOUNDARIES:readonly Boundary[]=['event_day','first_trading_day','month_end'];
/** The boundary frozen in a cycle_table manifest's params. */
export function boundaryParam(m:StrategyManifest):Boundary{
 const b=m.params.boundary;
 if(typeof b!=='string'||!(BOUNDARIES as readonly string[]).includes(b))throw new Error(`invalid_manifest_params:boundary`);
 return b as Boundary;
}

/** The ordered column ids frozen in a cycle_table manifest's params (canonical JSON text, hashed with the body). */
export function columnsParam(m:StrategyManifest):readonly string[]{
 const t=m.params.columns;
 if(typeof t!=='string')throw new Error('invalid_manifest_params:columns');
 let v:unknown;
 try{v=JSON.parse(t);}catch{throw new Error('invalid_manifest_params:columns');}
 if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))throw new Error('invalid_manifest_params:columns');
 return v as string[];
}

/** Column resolution over a catalog projection: alias → target; month series → its derive.from daily; daily series → the month_end row derived from it. */
export function resolveColumn(id:string,defs:readonly FrozenSeriesDef[]):CycleColumn{
 const by=(x:string)=>defs.find(d=>d.id===x)??null;
 const d=by(id);
 if(!d)return {id,label:{zh:id,en:id},change_kind:'pct',daily_series:null,monthly_series:null,restricted:false};
 const t=d.aliasOf?by(d.aliasOf):d;
 const restricted=d.status==='restricted'||t?.status==='restricted';
 const base={id,label:d.name,change_kind:d.changeKind==='bp'?'bp' as const:'pct' as const,restricted};
 if(!t||t.status!=='active'||d.status!=='active')return {...base,daily_series:null,monthly_series:null};
 if(t.period==='day')return {...base,daily_series:t.id,monthly_series:defs.find(x=>x.derive?.kind==='month_end'&&x.derive.from===t.id)?.id??null};
 return {...base,daily_series:t.derive?.kind==='month_end'?t.derive.from:null,monthly_series:t.id};
}

/** Episodes from ascending events (zero-bp events ignored). cutoffDate = YYYY-MM-DD of the manifest cutoff. */
export function policyEpisodes(events:readonly StrategyPolicyEvent[],gaps:readonly EventGap[],cutoffDate:string):Episode[]{
 const evs=events.filter(e=>sign(e.change_bp)!==0).sort((a,b)=>a.effective_date<b.effective_date?-1:a.effective_date>b.effective_date?1:0);
 const gapDates=gaps.filter(g=>g.kind==='transition_unverified').map(g=>g.near);
 const out:Episode[]=[];
 for(const e of evs){
  const dir=sign(e.change_bp)>0?'hike':'cut';
  const cur=out[out.length-1];
  const gapBetween=cur!==undefined&&gapDates.some(g=>cur.end<g&&g<=e.effective_date);
  if(cur&&cur.direction===dir&&!gapBetween){cur.end=e.effective_date;cur.events++;cur.upper_to=e.upper_to;cur.cumulative_bp=add(cur.cumulative_bp,e.change_bp);continue;}
  if(cur&&gapBetween)cur.gap_after=true;
  out.push({index:out.length,direction:dir,start:e.effective_date,end:e.effective_date,events:1,upper_from:e.upper_from,upper_to:e.upper_to,cumulative_bp:e.change_bp,left_censored:out.length===0,ongoing:false,gap_after:false});
 }
 const last=out[out.length-1];
 if(last){
  if(gapDates.some(g=>g>last.end))last.gap_after=true;
  last.ongoing=cutoffDate<addMonthsDate(last.end,ONGOING_MONTHS);
 }
 return out;
}

export async function buildCycleTableManifest(port:StrategyReadPort,o:{now:Date;codeVersion:string;boundary:Boundary;columns?:readonly string[]}):Promise<StrategyManifest>{
 const columns=o.columns??CYCLE_COLUMNS_V1;
 const snapshots={US:await port.activeSnapshot('US'),CN:await port.activeSnapshot('CN')};
 const b=manifestBuilder(port,latestCutoff(snapshots,o.now));
 await b.useSnapshots(snapshots,{loadRows:false});
 const {events,gaps}=await readPolicyEvents(b);
 const live=port.catalog().map(freezeDef);
 for(const id of columns){
  const c=resolveColumn(id,live);
  const d=b.def(id);if(d?.aliasOf)b.def(d.aliasOf);
  if(c.restricted)continue;
  if(c.daily_series)await b.history(c.daily_series,COL_PURPOSE,'history');
  if(c.monthly_series)await b.history(c.monthly_series,COL_PURPOSE,'month_end');
 }
 return b.build({kind:'cycle_table',params:{boundary:o.boundary,columns:canonicalJson(columns)},methodVersion:VERSIONS.cycleTable,codeVersion:o.codeVersion,extra:{events,gaps}});
}

type Missing=Extract<CycleCell,{status:'missing'}>['reason'];
type Pick1=ManifestInput|Missing;
const miss=(reason:Missing):CycleCell=>({status:'missing',reason});
function dayPick(rows:readonly ManifestInput[],date:string,mode:'before'|'on_or_before'|'on_or_after'):Pick1{
 if(rows.length===0||date<rows[0].period_end||date>rows[rows.length-1].period_end)return 'out_of_coverage';
 let hit:ManifestInput|undefined;
 if(mode==='on_or_after')hit=rows.find(r=>r.period_end>=date);
 else for(const r of rows){if(mode==='before'?r.period_end<date:r.period_end<=date)hit=r;else break;}
 if(!hit||Math.abs(dayDiff(hit.period_end,date))>MAX_BOUNDARY_GAP_DAYS)return 'out_of_coverage';
 return hit;
}
function change(from:ManifestInput,to:ManifestInput,kind:'pct'|'bp'):CycleCell{
 if(from.observation_id===to.observation_id)return miss('degenerate');
 if(kind==='pct'){
  if(sign(from.value_text)<=0)return miss('non_positive_base');
  return {status:'ok',from:toObsRef(from),to:toObsRef(to),change_raw:pctChange(to.value_text,from.value_text),change_text:pctRatio(to.value_text,from.value_text),change_kind:'pct'};
 }
 const text=toBp(subtract(to.value_text,from.value_text));
 return {status:'ok',from:toObsRef(from),to:toObsRef(to),change_raw:Number(text),change_text:text,change_kind:'bp'};
}
function cellOf(m:StrategyManifest,ep:Episode,c:CycleColumn,boundary:Boundary,cutoffDate:string):CycleCell{
 if(c.restricted)return {status:'restricted'};
 if(boundary==='month_end'){
  if(!c.monthly_series)return miss('out_of_coverage');
  if(readState(m,c.monthly_series,COL_PURPOSE)==='truncated')return miss('history_truncated');
  const toM=monthOf(ep.end);
  if(monthEnd(toM)>cutoffDate)return miss('month_not_closed');
  const byMonth=new Map(inputsWithRole(m,inputRole(COL_PURPOSE,c.monthly_series,'month_end')).map(i=>[monthOf(i.period_end),i]));
  const from=byMonth.get(addMonthsYm(monthOf(ep.start),-1)),to=byMonth.get(toM);
  if(!from||!to)return miss('out_of_coverage');
  return change(from,to,c.change_kind);
 }
 if(!c.daily_series)return miss('out_of_coverage');
 if(readState(m,c.daily_series,COL_PURPOSE)==='truncated')return miss('history_truncated');
 const rows=inputsWithRole(m,inputRole(COL_PURPOSE,c.daily_series,'history'));
 const from=boundary==='event_day'?dayPick(rows,ep.start,'before'):dayPick(rows,ep.start,'on_or_after');
 const to=boundary==='event_day'?dayPick(rows,ep.end,'on_or_before'):dayPick(rows,ep.end,'on_or_after');
 if(typeof from==='string')return miss(from);
 if(typeof to==='string')return miss(to);
 return change(from,to,c.change_kind);
}
export function buildCycleTable(stored:StoredManifest):CycleTableView{
 const m=stored.body;
 if(m.kind!=='cycle_table')throw new Error(`manifest_kind_mismatch:${m.kind}`);
 const boundary=boundaryParam(m);
 const columns=columnsParam(m);
 const cutoffDate=utcDate(m.cutoff);
 const episodes=policyEpisodes(m.events??[],m.gaps??[],cutoffDate);
 const cols=columns.map(id=>resolveColumn(id,m.catalog));
 const cells:CycleTableView['cells']={};
 for(const ep of episodes){const row:Record<string,CycleCell>={};for(const c of cols)row[c.id]=cellOf(m,ep,c,boundary,cutoffDate);cells[String(ep.index)]=row;}
 return {version:VERSIONS.cycleTable,episodes_version:VERSIONS.episodes,boundary,manifest_id:stored.manifest_id,cutoff:m.cutoff,episodes,columns:cols,cells,gaps:m.gaps??[]};
}
