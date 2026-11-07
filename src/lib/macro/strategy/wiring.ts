// src/lib/macro/strategy/wiring.ts
// WP-S6: StrategyReadPort over P1's MacroDb (spec §4.3). Pure over the MacroDb interface (no server imports), so it runs on
// the memory MacroDb in unit tests and on supabaseMacroDb in production (port.ts strategyPort()). Semantics are those of
// memoryStrategyPort: ok rows only, highest version <= asOf, ascending history, newest non-failed snapshot with ties on
// created_at -> greatest snapshot_id, Error('truncated') when a bounded read cannot finish.
import {MACRO_CATALOG,CATALOG_VERSION} from '../catalog';
import {MacroDbError} from '../db';
import type {MacroDb} from '../db';
import {derivePolicyEvents} from '../events';
import {releaseTimeliness} from '../freshness';
import {RULES,RULES_VERSION} from '../regime';
import type {ObservationRow as P1ObservationRow,SeriesType} from '../types';
import type {ObservationRow,RulesView,SnapshotRecord} from './contract';
import type {StrategyReadPort} from './port';

/** snapshotsSince page size (P1 read-api MAX_SNAPSHOTS_PAGE is 200; the memory twin and PostgREST both cap at 1000). */
export const SNAPSHOT_PAGE=200;
/** Pages read by one snapshotUpTo before it gives up: 200 x 200 = 40 000 snapshots, far beyond a daily cadence for decades. */
export const SNAPSHOT_MAX_PAGES=200;

/** seriesHistory internal read caps = maxRows x these (versions per period are few), bounded by the ceiling. */
const HISTORY_CAP_MULTIPLIERS=[1,4,16] as const;
const HISTORY_CAP_CEILING=100_000;

export interface WiringOptions{pageSize?:number;maxPages?:number}

const ms=(t:string)=>{const v=Date.parse(t);if(!Number.isFinite(v))throw new Error(`invalid_timestamp:${t}`);return v;};
/** Drops storage-only members (locator, code_version, batch_id): strategy code and manifests read the projection only. */
function toObservation(r:P1ObservationRow):ObservationRow{
 return {observation_id:r.observation_id,series_id:r.series_id,period_end:r.period_end,value_text:r.value_text,version:r.version,available_at:r.available_at,
  availability_basis:r.availability_basis,ingested_at:r.ingested_at,status:r.status,retrieval_id:r.retrieval_id,derived_from:r.derived_from,transform:r.transform};
}
/** The strategy layer matches message === 'truncated' (manifest.ts isTruncated); MacroDb throws MacroDbError(code 'truncated', detail message). */
async function normalizeTruncated<T>(p:Promise<T>):Promise<T>{
 try{return await p;}catch(e){if(e instanceof MacroDbError&&e.code==='truncated')throw new Error('truncated');throw e;}
}
const toSnapshot=(({failure_reason:_f,...rest}:import('../types').SnapshotRecord):SnapshotRecord=>rest);

/** Read-only projection of P1 regime.ts RULES in table order (spec §5.2). */
export function rulesView():RulesView{
 const rows=(Object.keys(RULES) as SeriesType[]).flatMap(type=>RULES[type].map(r=>({rule_id:r.id,type,condition:{zh:r.label.zh,en:r.label.en},support:{...r.support}})));
 return {rulesVersion:RULES_VERSION,rows};
}

export function macroDbStrategyPort(db:MacroDb,opts:WiringOptions={}):StrategyReadPort{
 const pageSize=opts.pageSize??SNAPSHOT_PAGE,maxPages=opts.maxPages??SNAPSHOT_MAX_PAGES;
 const rules=rulesView();
 return {
  async activeSnapshot(region){const s=await db.activeSnapshot(region);return s?toSnapshot(s):null;},
  async snapshot(id){const s=await db.snapshot(id);return s?toSnapshot(s):null;},
  async snapshotUpTo(region,cutoff){
   const cut=ms(cutoff);
   // snapshotsSince is ascending by (created_at, snapshot_id) over active + superseded rows of every region (failed rows excluded);
   // walk it with the keyset until a row is past the cutoff, keeping the last match (>= keeps the greatest id on a created_at tie).
   let best:SnapshotRecord|null=null;let marker:{created_at:string;snapshot_id:string}|null=null;
   for(let page=0;page<maxPages;page++){
    const rows:import('../types').SnapshotRecord[]=await normalizeTruncated(db.snapshotsSince(marker,pageSize));
    for(const s of rows){
     if(ms(s.created_at)>cut)return best;
     if(s.region===region&&s.status!=='failed')best=toSnapshot(s);
    }
    if(rows.length<pageSize)return best;
    const last=rows[rows.length-1];marker={created_at:last.created_at,snapshot_id:last.snapshot_id};
   }
   throw new Error('truncated');
  },
  async observationsByIds(ids){
   const by=new Map((await db.observationsByIds(ids)).map(o=>[o.observation_id,o]));
   return ids.flatMap(id=>{const o=by.get(id);return o&&o.status==='ok'?[toObservation(o)]:[];});
  },
  async latestObservations(seriesIds,{asOf}){
   const by=new Map((await db.latestObservations(seriesIds,{asOf})).map(o=>[o.series_id,o]));
   return [...new Set(seriesIds)].flatMap(id=>{const o=by.get(id);return o?[toObservation(o)]:[];});
  },
  async seriesHistory(seriesId,{from,to,asOf,maxRows}){
   // MacroDb counts every visible version against its cap, the port contract counts periods after the highest-version dedup:
   // read with growing internal caps, dedup (MacroDb already returns one row per period) and compare to maxRows ourselves.
   // Still 'truncated' when even the largest cap truncates, since completeness cannot be proven then.
   for(const mult of HISTORY_CAP_MULTIPLIERS){
    const cap=Math.min(maxRows*mult,Math.max(maxRows,HISTORY_CAP_CEILING));
    let rows:P1ObservationRow[];
    try{rows=await db.seriesHistory(seriesId,{from,to,asOf,maxRows:cap});}
    catch(e){if(e instanceof MacroDbError&&e.code==='truncated'&&cap<Math.max(maxRows,HISTORY_CAP_CEILING))continue;throw e instanceof MacroDbError&&e.code==='truncated'?new Error('truncated'):e;}
    if(rows.length>maxRows)throw new Error('truncated');
    return rows.map(toObservation);
   }
   throw new Error('truncated');
  },
  catalog:()=>MACRO_CATALOG,
  catalogVersion:()=>CATALOG_VERSION,
  rules:()=>rules,
  derivePolicyEvents,
  timeliness:(def,latestPeriodEnd,today)=>releaseTimeliness(def,latestPeriodEnd,today),
 };
}
