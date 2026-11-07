// src/lib/macro/read-api.ts
// MacroReadApi (F4 plan shared contract; F4 spec §11.1/§12.1; macro spec §5.4) over MacroDb's anon
// read paths (quarantined rows are never visible). classifyAsOf reuses the publishing pipeline's
// buildRegimeInput + classifyRegime: there is exactly one classification function. Server-only: stored judgments come from
// the service-only macro_regime_results (admin) and only when judgments are enabled (第 6 稿 P1-2); F4 builds its macro
// snapshot inputs through this API, never with anon table reads.
// Historical reads select only batches finalized by the cutoff, then verify their receipts.
// No migration currently freezes ingest_batches.finished_at after terminal status; a service-role edit could rewrite history.
import {CATALOG_VERSION,MACRO_CATALOG,catalogById} from './catalog';
import type {MacroDb} from './db';
import {monthEnd} from './freshness';
import type {MacroObservationRef,MacroReadApi,MacroSnapshotRow} from './judgment-contract';
import {METHODOLOGY_VERSION,RULES_VERSION,WEIGHTS_V1,classifyRegime,regionWeights} from './regime';
import {buildRegimeInput} from './snapshots';
import type {ObservationRow,Region,SnapshotRecord} from './types';

export const MAX_SNAPSHOTS_PAGE=200;
const PERIOD_RE=/^(\d{4})-(0[1-9]|1[0-2])$/;
// full ISO timestamp with zone required: a date-only cutoff is ambiguous (which instant of the day?)
const CUTOFF_RE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPOSITE_RE=/^([A-Za-z0-9_]+):(\d{4}-\d{2}-\d{2}):(\d+)$/;

/** F4 fixture semantics: the requested macro methodology / data is not available. */
export class MacroUnavailable extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='MacroUnavailable';this.code=code;}
}

function toRef(r:ObservationRow):MacroObservationRef{
 const unit=catalogById(r.series_id)?.unit;
 if(unit===undefined)throw new Error(`catalog_unit_missing:${r.series_id}`);
 return {series_id:r.series_id,period_end:r.period_end,vintage_id:String(r.version),value:Number(r.value_text),unit,available_at:r.available_at};
}
/** Composite F4 id series_id:period_end:vintage_id (vintage_id = String(version)) → exact, ok and eligible row, else null. */
async function byCompositeId(db:MacroDb,m:RegExpExecArray):Promise<ObservationRow|null>{
 const [,seriesId,periodEnd,vintage]=m;
 const version=Number(vintage);
 if(!Number.isSafeInteger(version)||String(version)!==vintage||!Number.isFinite(Date.parse(periodEnd)))return null;
 const row=(await db.versionsOf(seriesId,periodEnd)).find(r=>r.version===version);
 if(!row||row.status!=='ok')return null;
 const eligible=await db.eligibleHistory(seriesId,{from:periodEnd,to:periodEnd,maxRows:2});
 const top=eligible[0];
 if(!top||top.version<version)return null;                           // nothing publishable for this period, or this vintage is newer than every eligible one
 if(top.version===version&&top.observation_id!==row.observation_id)return null;
 return row;
}
async function toRow(db:MacroDb,s:SnapshotRecord,judgments:boolean):Promise<MacroSnapshotRow>{
 const regime=judgments?(await db.regimeOf(s.snapshot_id))?.regime??null:null;   // flag off: no judgment read at all
 return {snapshot_id:s.snapshot_id,region:s.region,as_of:s.as_of,methodology_version:s.methodology_version,catalog_version:s.catalog_version,
  observation_ids:[...s.observation_ids],regime,created_at:s.created_at,status:s.status};
}
async function assertHistoricalBatches(db:MacroDb,built:Awaited<ReturnType<typeof buildRegimeInput>>,cutoff:string):Promise<void>{
 const seen=new Map<string,ObservationRow>();
 let pending=[...new Set([...built.observations.map(r=>r.observation_id),...built.historyIds])];
 while(pending.length){
  const rows=await db.observationsByIds(pending);if(rows.length!==pending.length)throw new MacroUnavailable('historical_cutoff_unsupported');
  pending=[];
  for(const row of rows){seen.set(row.observation_id,row);for(const id of row.derived_from??[])if(!seen.has(id))pending.push(id);}
  pending=[...new Set(pending)];
 }
 const times=await db.batchFinishedAt([...new Set([...seen.values()].map(r=>r.batch_id))]);
 for(const row of seen.values()){const finished=times[row.batch_id];if(!finished||!Number.isFinite(Date.parse(finished))||Date.parse(finished)>Date.parse(cutoff))throw new MacroUnavailable('historical_cutoff_unsupported');}
}
/** F4 macro_snapshot input available_at: the latest available_at among the snapshot's observations (null when empty). */
export async function snapshotAvailableAt(db:MacroDb,snapshot:Pick<SnapshotRecord,'observation_ids'>):Promise<string|null>{
 if(snapshot.observation_ids.length===0)return null;
 const rows=await db.observationsByIds(snapshot.observation_ids);
 let best:string|null=null;
 for(const r of rows)if(best===null||Date.parse(r.available_at)>Date.parse(best))best=r.available_at;
 return best;
}
/** judgments: whether stored regimes are read (default false; callers pass the flag explicitly; 第 6 稿 P1-2). */
export function macroReadApi(db:MacroDb,opts:{judgments?:boolean}={}):MacroReadApi{
 const judgments=opts.judgments??false;
 return {
  async observation(observationId){
   if(typeof observationId!=='string')return null;
   const m=COMPOSITE_RE.exec(observationId);
   if(m){const r=await byCompositeId(db,m);return r?toRef(r):null;}
   if(!UUID_RE.test(observationId))return null;                          // never pass a non-uuid to the uuid column
   const [row]=await db.observationsByIds([observationId]);
   return row&&row.status==='ok'?toRef(row):null;
  },
  async snapshot(snapshotId){
   const s=await db.snapshot(snapshotId);
   return s?toRow(db,s,judgments):null;
  },
  async snapshotsSince(marker,limit){
   if(!Number.isInteger(limit)||limit<1||limit>MAX_SNAPSHOTS_PAGE)throw new Error('invalid_limit');
   const recs=(await db.snapshotsSince(marker,limit)).filter(s=>s.status==='active'||s.status==='superseded');
   const out:MacroSnapshotRow[]=[];
   for(const s of recs)out.push(await toRow(db,s,judgments));
   return out;
  },
  async seriesCatalog(region){
   return MACRO_CATALOG.filter(d=>d.region===region).map(d=>({
    series_id:d.id,region:d.region,role:d.role,type:d.type,name_zh:d.name.zh,name_en:d.name.en,unit:d.unit,
    native_frequency:d.nativeFrequency,period:d.period,adjustment:d.adjustment,status:d.status,reason:d.reason??null,
    weight:WEIGHTS_V1[d.id]??0,change_kind:d.changeKind,revision_policy:d.revisionPolicy,definition_version:d.definitionVersion,
    derive:d.derive??null,alias_of:d.aliasOf??null,publisher:d.source?.publisher??null,via:d.source?.via??null,
    fetch_host:d.source?.fetchHost??null,rights:d.source?.rights??null,catalog_version:CATALOG_VERSION,
   }));
  },
  async classifyAsOf(region,referencePeriod,cutoff,macroMethodologyVersion){
   if(macroMethodologyVersion!==METHODOLOGY_VERSION)throw new MacroUnavailable('methodology_mismatch');
   const m=PERIOD_RE.exec(referencePeriod);
   if(!m)throw new Error('invalid_reference_period');
   if(!CUTOFF_RE.test(cutoff)||!Number.isFinite(Date.parse(cutoff)))throw new Error('invalid_cutoff');
   let built:Awaited<ReturnType<typeof buildRegimeInput>>;
   try{built=await buildRegimeInput(db,region as Region,{asOf:cutoff,periodEndLte:monthEnd(Number(m[1]),Number(m[2]))});}
   catch(e){if(e instanceof Error&&e.message==='historical_cutoff_unsupported')throw new MacroUnavailable('historical_cutoff_unsupported');throw e;}
   await assertHistoricalBatches(db,built,cutoff);
   const regime=judgments?classifyRegime(built.input).regime:null;        // judgments disabled: no classification (regime = null)
   return {regime,observation_refs:built.observations.map(toRef),catalog:{version:CATALOG_VERSION,weights:regionWeights(region as Region),rules_version:RULES_VERSION}};
  },
 };
}
