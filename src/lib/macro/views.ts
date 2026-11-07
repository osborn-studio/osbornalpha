// src/lib/macro/views.ts
// Overview read model (spec §3.2, §4.5, §8 Envelope; 第 4 稿 P1-3/P1-8/P1-9/P2-3). Facts only: no regime field
// ever appears here (judgments come from F4 /api/judgments). Values come from the active snapshot's frozen
// manifest, sparklines from its frozen history_ids; one observationsByIds call reads both (plus the previous
// snapshot's manifest for "changes"), then ancestors are resolved one batched read per derivation level and
// their retrievals in one call. Never a per-indicator history query. compact skips history and provenance.
import type {TableClient} from '../db/table-client';
import {CATALOG_VERSION} from './catalog';
import type {MacroDb} from './db';
import {canonical,compare,subtract,yoyPct} from './decimal';
import {collectionStatus,datasetOf,releaseTimeliness} from './freshness';
import type {CollectionStatus} from './freshness';
import {catalogCounts,catalogItemsOf} from './snapshots';
import type {Bilingual,CatalogCounts,ChangeKind,MacroSeriesDef,ObservationRow,Region,Timeliness} from './types';

export interface IndicatorRow{
 /** The exact manifest version shown (the drawer selects it); null without data. */
 observation_id:string|null;
 series_id:string;name:Bilingual;value_text:string|null;unit:string;change:{kind:ChangeKind;value_text:string}|null;
 period_end:string|null;available_at:string|null;availability_basis:'first_seen'|null;
 /** Release timeliness (schedule) — independent of presence (data in this snapshot or not). */
 timeliness:Timeliness;presence:'present'|'missing';
 status:'A'|'M'|'R';reason?:Bilingual;publisher:Bilingual|null;via:Bilingual|null;
 /** First native ancestor's retrieval; evidence = every native ancestor (derived provenance = ancestors' retrievals). */
 retrieval_id:string|null;evidence:{retrieval_id:string;sha256:string}[];sparkline:string[];
}
export type ChangeItemKind='new_release'|'revised'|'late'|'missing';
export interface ChangeItem{series_id:string;kind:ChangeItemKind;period_end:string|null}
export interface Changes{counts:Record<ChangeItemKind,number>;items:ChangeItem[]}
export interface Envelope{
 snapshotId:string|null;asOf:string|null;catalogVersion:string;methodologyVersion:string|null;
 collection:CollectionStatus[];indicators:IndicatorRow[];changes:Changes;catalogCounts:CatalogCounts|null;
}
export interface ViewDeps{db:MacroDb;tables:TableClient;now?:()=>Date}
export const COMPACT_KEYS:Record<Region,readonly string[]>={US:['US_DFF','US_DGS10','US_CPI_YOY'],CN:['CN_CPI_YOY','CN_PMI_MFG','CN_CGB_10Y']};
const SPARK_POINTS=24;
const MAX_DEPTH=4;
const STATUS_LETTER={active:'A',missing:'M',restricted:'R'} as const;

/** Exact ×100 of a canonical decimal (pct-point difference → bp). */
export function scaleBy100(text:string):string{
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
 if(!m)throw new Error(`invalid_decimal:${text}`);
 const frac=(m[3]??'').padEnd(2,'0');
 return canonical(`${m[1]}${m[2]}${frac.slice(0,2)}${frac.length>2?`.${frac.slice(2)}`:''}`);
}
/** Change vs the previous comparable period in the series' declared kind; pct against zero → null. */
export function changeOf(kind:ChangeKind,cur:string,prev:string):{kind:ChangeKind;value_text:string}|null{
 if(kind==='bp')return {kind,value_text:scaleBy100(subtract(cur,prev))};
 if(kind==='pct')return compare(prev,'0')===0?null:{kind,value_text:yoyPct(cur,prev)};   // exact zero test: no float here (§0.2 M8)
 return {kind,value_text:subtract(cur,prev)};
}
/** series → [latest, previous] by period_end (a manifest holds one row per period). */
function latestTwo(rows:ObservationRow[]):Map<string,ObservationRow[]>{
 const by=new Map<string,ObservationRow[]>();
 for(const r of rows){const a=by.get(r.series_id)??[];a.push(r);by.set(r.series_id,a);}
 for(const [k,a] of by)by.set(k,a.sort((x,y)=>x.period_end<y.period_end?1:x.period_end>y.period_end?-1:y.version-x.version).slice(0,2));
 return by;
}
type Provenance={retrieval_ids:string[];evidence:{retrieval_id:string;sha256:string}[]};
/** Native retrievals behind each row (derived: all ancestors), resolved level by level: one observationsByIds per
 *  derivation level and one retrievalsByIds for everything (第 4 稿 P2-3). */
async function provenanceOf(db:MacroDb,rows:ObservationRow[]):Promise<Map<string,Provenance>>{
 const known=new Map(rows.map(r=>[r.observation_id,r]));
 let frontier=[...new Set(rows.flatMap(r=>r.derived_from??[]))].filter(id=>!known.has(id));
 for(let depth=0;frontier.length>0&&depth<MAX_DEPTH;depth++){
  const got=await db.observationsByIds(frontier);
  for(const r of got)known.set(r.observation_id,r);
  frontier=[...new Set(got.flatMap(r=>r.derived_from??[]))].filter(id=>!known.has(id));
 }
 const leaves=(r:ObservationRow,depth=0):string[]=>r.retrieval_id?[r.retrieval_id]:depth>=MAX_DEPTH?[]:(r.derived_from??[]).flatMap(id=>{const i=known.get(id);return i?leaves(i,depth+1):[];});
 const perRow=new Map(rows.map(r=>[r.observation_id,[...new Set(leaves(r))]]));
 const sha=new Map((await db.retrievalsByIds([...new Set([...perRow.values()].flat())])).map(x=>[x.retrieval_id,x.sha256]));
 return new Map([...perRow].map(([id,ids])=>[id,{retrieval_ids:ids,evidence:ids.flatMap(rid=>{const h=sha.get(rid);return h?[{retrieval_id:rid,sha256:h}]:[];})}]));
}
function emptyRow(def:MacroSeriesDef,timeliness:Timeliness):IndicatorRow{
 return {observation_id:null,series_id:def.id,name:def.name,value_text:null,unit:def.unit,change:null,period_end:null,available_at:null,availability_basis:null,timeliness,presence:'missing',
  status:STATUS_LETTER[def.status],...(def.reason?{reason:def.reason}:{}),publisher:def.source?.publisher??null,via:def.source?.via??null,retrieval_id:null,evidence:[],sparkline:[]};
}
/** "missing" in the changes card = no data in the snapshot (presence), restricted items excluded (第 4 稿 P1-3). */
const countsAsMissing=(r:IndicatorRow)=>r.presence==='missing'&&r.status!=='R';
const timelinessOf=(def:MacroSeriesDef,latest:string|null,today:string):Timeliness=>
 def.status==='missing'?'missing':def.status==='restricted'?'n/a':releaseTimeliness(def,latest,today);

export async function overviewEnvelope(deps:ViewDeps,region:Region,today:string,opts:{compact?:boolean}={}):Promise<Envelope>{
 const now=deps.now?.()??new Date();
 const [snap,allCollection]=await Promise.all([deps.db.activeSnapshot(region),collectionStatus(deps.tables,now)]);
 const collection=allCollection.filter(c=>c.dataset===datasetOf(region));
 const items=catalogItemsOf(region);
 const keep=(id:string)=>!opts.compact||COMPACT_KEYS[region].includes(id);
 const counts:Record<ChangeItemKind,number>={new_release:0,revised:0,late:0,missing:0};
 const changeItems:ChangeItem[]=[];
 const note=(series_id:string,kind:ChangeItemKind,period_end:string|null)=>{counts[kind]++;changeItems.push({series_id,kind,period_end});};
 if(!snap){
  const rows=items.map(d=>emptyRow(d,timelinessOf(d,null,today)));
  for(const r of rows)if(countsAsMissing(r))note(r.series_id,'missing',null);
  return {snapshotId:null,asOf:null,catalogVersion:CATALOG_VERSION,methodologyVersion:null,collection,
   indicators:rows.filter(r=>keep(r.series_id)),changes:{counts,items:opts.compact?[]:changeItems},catalogCounts:null};
 }
 const prevSnap=await deps.db.previousSnapshot(region,snap.created_at);
 // One read for everything shown: frozen manifest, frozen sparkline history, previous manifest (第 4 稿 P1-8/P2-3).
 const wanted=[...new Set([...snap.observation_ids,...(opts.compact?[]:snap.history_ids),...(prevSnap?.observation_ids??[])])];
 const byId=new Map((await deps.db.observationsByIds(wanted)).map(r=>[r.observation_id,r]));
 const pick=(ids:readonly string[])=>ids.flatMap(id=>{const r=byId.get(id);return r?[r]:[];});
 const manifest=latestTwo(pick(snap.observation_ids));
 const prevLatest=prevSnap?latestTwo(pick(prevSnap.observation_ids)):null;
 const history=new Map<string,ObservationRow[]>();
 for(const r of opts.compact?[]:pick(snap.history_ids)){const a=history.get(r.series_id)??[];a.push(r);history.set(r.series_id,a);}
 const shown=[...manifest.values()].map(a=>a[0]);
 const provenance=opts.compact?new Map<string,Provenance>():await provenanceOf(deps.db,shown);
 const rows:IndicatorRow[]=[];
 for(const def of items){
  const [latest,prev]=manifest.get(def.id)??[];
  const timeliness=timelinessOf(def,latest?.period_end??null,today);
  if(!latest){
   const row=emptyRow(def,timeliness);rows.push(row);
   if(countsAsMissing(row))note(def.id,'missing',null);
   continue;
  }
  const sparkline=(history.get(def.id)??[]).sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0).slice(-SPARK_POINTS).map(h=>h.value_text);
  const prov=provenance.get(latest.observation_id);
  rows.push({observation_id:latest.observation_id,series_id:def.id,name:def.name,value_text:latest.value_text,unit:def.unit,change:prev?changeOf(def.changeKind,latest.value_text,prev.value_text):null,
   period_end:latest.period_end,available_at:latest.available_at,availability_basis:latest.availability_basis,timeliness,presence:'present',status:STATUS_LETTER[def.status],
   ...(def.reason?{reason:def.reason}:{}),publisher:def.source?.publisher??null,via:def.source?.via??null,
   retrieval_id:prov?prov.retrieval_ids[0]??null:latest.retrieval_id,evidence:prov?.evidence??[],sparkline});
  if(prevLatest){
   const [p]=prevLatest.get(def.id)??[];
   if(!p||latest.period_end>p.period_end)note(def.id,'new_release',latest.period_end);
   else if(latest.period_end===p.period_end&&latest.observation_id!==p.observation_id)note(def.id,'revised',latest.period_end);
  }
  if(timeliness==='late')note(def.id,'late',latest.period_end);
 }
 return {snapshotId:snap.snapshot_id,asOf:snap.as_of,catalogVersion:snap.catalog_version,methodologyVersion:snap.methodology_version,collection,
  indicators:rows.filter(r=>keep(r.series_id)),changes:{counts,items:opts.compact?[]:changeItems},catalogCounts:snap.catalog_counts??await catalogCounts(deps.db,region)};
}
