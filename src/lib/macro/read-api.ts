// src/lib/macro/read-api.ts
// MacroReadApi (F4 plan shared contract; F4 spec §11.1/§12.1; macro spec §5.4) over MacroDb's anon
// read paths (quarantined rows are never visible). classifyAsOf reuses the publishing pipeline's
// buildRegimeInput + classifyRegime: there is exactly one classification function. Server-only: stored judgments come from
// the service-only macro_regime_results (admin) and only when judgments are enabled (第 6 稿 P1-2); F4 builds its macro
// snapshot inputs through this API, never with anon table reads.
import {CATALOG_VERSION,MACRO_CATALOG,catalogById} from './catalog';
import type {MacroDb} from './db';
import {monthEnd} from './freshness';
import type {MacroObservationRef,MacroReadApi,MacroSnapshotRow} from './judgment-contract';
import {METHODOLOGY_VERSION,RULES_VERSION,WEIGHTS_V1,classifyRegime,regionWeights} from './regime';
import {buildRegimeInput} from './snapshots';
import type {ObservationRow,Region,SnapshotRecord} from './types';

export const MAX_SNAPSHOTS_PAGE=200;
const PERIOD_RE=/^(\d{4})-(0[1-9]|1[0-2])$/;
const CUTOFF_RE=/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2}))?$/;

function toRef(r:ObservationRow):MacroObservationRef{
 return {series_id:r.series_id,period_end:r.period_end,vintage_id:String(r.version),value:Number(r.value_text),unit:catalogById(r.series_id)?.unit??'',available_at:r.available_at};
}
async function toRow(db:MacroDb,s:SnapshotRecord,judgments:boolean):Promise<MacroSnapshotRow>{
 const regime=judgments?(await db.regimeOf(s.snapshot_id))?.regime??null:null;   // flag off: no judgment read at all
 return {snapshot_id:s.snapshot_id,region:s.region,as_of:s.as_of,methodology_version:s.methodology_version,catalog_version:s.catalog_version,
  observation_ids:[...s.observation_ids],regime,created_at:s.created_at,status:s.status};
}
/** F4 macro_snapshot input available_at: the latest available_at among the snapshot's observations (null when empty). */
export async function snapshotAvailableAt(db:MacroDb,snapshot:Pick<SnapshotRecord,'observation_ids'>):Promise<string|null>{
 if(snapshot.observation_ids.length===0)return null;
 const rows=await db.observationsByIds(snapshot.observation_ids);
 let best:string|null=null;
 for(const r of rows)if(best===null||Date.parse(r.available_at)>Date.parse(best))best=r.available_at;
 return best;
}
/** judgments: whether stored regimes are read (default MACRO_JUDGMENTS_ENABLED === '1'; 第 6 稿 P1-2). */
export function macroReadApi(db:MacroDb,opts:{judgments?:boolean}={}):MacroReadApi{
 const judgments=opts.judgments??process.env.MACRO_JUDGMENTS_ENABLED==='1';
 return {
  async observation(observationId){
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
   if(macroMethodologyVersion!==METHODOLOGY_VERSION)throw new Error('methodology_mismatch');
   const m=PERIOD_RE.exec(referencePeriod);
   if(!m)throw new Error('invalid_reference_period');
   if(!CUTOFF_RE.test(cutoff)||!Number.isFinite(Date.parse(cutoff)))throw new Error('invalid_cutoff');
   const built=await buildRegimeInput(db,region as Region,{asOf:cutoff,periodEndLte:monthEnd(Number(m[1]),Number(m[2]))});
   const {regime}=classifyRegime(built.input);
   return {regime,observation_refs:built.observations.map(toRef),catalog:{version:CATALOG_VERSION,weights:regionWeights(region as Region),rules_version:RULES_VERSION}};
  },
 };
}
