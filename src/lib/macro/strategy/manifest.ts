// src/lib/macro/strategy/manifest.ts
// Strategy manifests (spec 2026-11-07 §4.5, draft 3 N1–N3): the single frozen input of every P3/P4 computation.
// - identity: manifest_hash = sha256Hex(canonicalJson(body)) over the whole body (kind, params, cutoff, frozen snapshots,
//   catalog projection, rules, read states, inputs, events, versions).
// - cutoff rules: latestCutoff (transmission / matrix / history: later of the two active snapshots, else request time),
//   monthCutoff (review: the 3rd of the next month 00:00:00Z, spec §6.2), pinSnapshots (snapshot explanation: the requested
//   snapshot fixes the cutoff, the other region = snapshotUpTo(cutoff)).
// - snapshot roles: per series in observation_ids ∪ history_ids, max period_end = 'latest', the previous period = 'prev',
//   the period 3 months earlier = 'prev3m' (quarterly: previous quarter); other rows stay out of the manifest. A snapshot
//   id that observationsByIds does not return (unknown or no longer ok) makes that region's snapshot incomplete (spec §4.3:
//   a missing referenced id is missing): every snapshot value of the region is then recorded 'truncated' and returns null —
//   a comparison row is never promoted to 'latest', and the region never falls back to latestObservations.
// - value rule: a series in its region's snapshot → that row (source snapshot); else latestObservations asOf cutoff
//   (source history). History windows → seriesHistory asOf cutoff; 'truncated' is recorded as a read state, never thrown.
// Builders read only through StrategyReadPort; views read only the manifest (replay never touches the port or catalog).
import type {FrozenSeriesDef,FrozenSnapshot,InputSource,ManifestInput,ManifestKind,ManifestRead,MacroSeriesDef,ObsRef,ObservationRow,Region,SnapshotRecord,SnapshotRole,StrategyManifest} from './contract';
import {canonicalJson,sha256Hex} from './hash';
import type {StrategyReadPort} from './port';

// ---------------------------------------------------------------- canonical JSON + hash (defined in hash.ts, Task 3; re-exported)
export {canonicalJson,sha256Hex};
export const manifestHash=(body:StrategyManifest):string=>sha256Hex(canonicalJson(body));

// ---------------------------------------------------------------- calendar (UTC dates as YYYY-MM-DD, months as YYYY-MM)
const ymParts=(ym:string):[number,number]=>{const m=/^(\d{4})-(\d{2})$/.exec(ym);if(!m)throw new Error(`invalid_month:${ym}`);return [Number(m[1]),Number(m[2])];};
/** The UTC calendar date (YYYY-MM-DD) of an ISO timestamp, whatever offset it is written with; the only way a cutoff becomes a date. */
export function utcDate(iso:string):string{const t=Date.parse(iso);if(!Number.isFinite(t))throw new Error(`invalid_timestamp:${iso}`);return new Date(t).toISOString().slice(0,10);}
export const monthOf=(date:string):string=>date.slice(0,7);
export function addMonthsYm(ym:string,n:number):string{const [y,m]=ymParts(ym);const t=y*12+(m-1)+n;return `${String(Math.floor(t/12)).padStart(4,'0')}-${String(t%12+1).padStart(2,'0')}`;}
export function monthEnd(ym:string):string{const [y,m]=ymParts(ym);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
export const prevMonth=(ym:string):string=>addMonthsYm(ym,-1);
/** Calendar months between two 'YYYY-MM' (b − a). */
export function monthsBetween(a:string,b:string):number{const [ya,ma]=ymParts(a),[yb,mb]=ymParts(b);return (yb*12+mb)-(ya*12+ma);}
/** Whole days b − a between two YYYY-MM-DD dates. */
export const dayDiff=(a:string,b:string):number=>Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000);
/** Same day n months later, clamped to the month end (2024-01-31 + 1 → 2024-02-29). */
export function addMonthsDate(date:string,n:number):string{
 const ym=addMonthsYm(monthOf(date),n);const end=monthEnd(ym);const day=date.slice(8,10);
 return day>end.slice(8,10)?end:`${ym}-${day}`;
}

// ---------------------------------------------------------------- cutoff rules (§4.5)
const later=(a:string,b:string)=>Date.parse(b)>Date.parse(a)?b:a;
/** Transmission / policy response / cycle table: later created_at of the two snapshots; one missing → the other; none → request time. */
export function latestCutoff(s:{US:SnapshotRecord|null;CN:SnapshotRecord|null},now:Date):string{
 if(s.US&&s.CN)return later(s.US.created_at,s.CN.created_at);
 return s.US?.created_at??s.CN?.created_at??now.toISOString();
}
/** Review (spec §6.2): the 3rd of the next month, 00:00:00Z — month-end derived observations first appear in the next month and
 *  the cron runs on the 3rd. Baseline = monthCutoff(prevMonth(month)) = the 3rd of the review month. The compared data periods
 *  stay month end vs month end; the cutoff only decides what was known. */
export const monthCutoff=(month:string):string=>`${addMonthsYm(month,1)}-03T00:00:00Z`;
const OTHER:Record<Region,Region>={US:'CN',CN:'US'};
/** Snapshot explanation (N1): the requested snapshot is its region's snapshot and fixes the cutoff; the other region = snapshotUpTo(cutoff). null = unknown or failed snapshot. */
export async function pinSnapshots(port:StrategyReadPort,snapshotId:string):Promise<{cutoff:string;snapshots:{US:SnapshotRecord|null;CN:SnapshotRecord|null}}|null>{
 const rec=await port.snapshot(snapshotId);
 if(!rec||rec.status==='failed')return null;
 const other=await port.snapshotUpTo(OTHER[rec.region],rec.created_at);
 return {cutoff:rec.created_at,snapshots:rec.region==='US'?{US:rec,CN:other}:{US:other,CN:rec}};
}

// ---------------------------------------------------------------- frozen projections and roles
export const freezeSnapshot=(r:SnapshotRecord):FrozenSnapshot=>({snapshot_id:r.snapshot_id,created_at:r.created_at,as_of:r.as_of,catalog_counts:{...r.catalog_counts},observation_ids:[...r.observation_ids],history_ids:[...r.history_ids]});
export function freezeDef(d:MacroSeriesDef):FrozenSeriesDef{
 const out:FrozenSeriesDef={id:d.id,region:d.region,role:d.role,type:d.type,name:{...d.name},unit:d.unit,status:d.status,changeKind:d.changeKind,nativeFrequency:d.nativeFrequency,period:d.period};
 if(d.reason)out.reason={...d.reason};
 if(d.aliasOf)out.aliasOf=d.aliasOf;
 if(d.derive)out.derive={...d.derive};
 if(d.releaseLagDays!==undefined)out.releaseLagDays=d.releaseLagDays;
 return out;
}
/** Role of each snapshot observation per series (N1). period decides prev3m: month/quarter → month end 3 months before latest; day → none. */
export function snapshotRoles(rows:readonly ObservationRow[],periodOf:(seriesId:string)=>'day'|'month'|'quarter'):Map<string,Partial<Record<SnapshotRole,ObservationRow>>>{
 const bySeries=new Map<string,Map<string,ObservationRow>>();
 for(const r of rows){
  const m=bySeries.get(r.series_id)??new Map<string,ObservationRow>();bySeries.set(r.series_id,m);
  const cur=m.get(r.period_end);if(!cur||cur.version<r.version)m.set(r.period_end,r);
 }
 const out=new Map<string,Partial<Record<SnapshotRole,ObservationRow>>>();
 for(const [id,m] of bySeries){
  const desc=[...m.values()].sort((a,b)=>a.period_end<b.period_end?1:a.period_end>b.period_end?-1:0);
  const roles:Partial<Record<SnapshotRole,ObservationRow>>={latest:desc[0]};
  if(desc[1])roles.prev=desc[1];
  if(periodOf(id)!=='day'){const target=monthEnd(addMonthsYm(monthOf(desc[0].period_end),-3));const r3=m.get(target);if(r3)roles.prev3m=r3;}
  out.set(id,roles);
 }
 return out;
}

// ---------------------------------------------------------------- input roles and manifest readers
export type InputTag=SnapshotRole|'base'|'end'|'from'|'to'|'month_end'|'history'|'evidence';
/** '<purpose>:<series_id>:<tag>' — every writer uses this helper. 'month_end' / 'history' tag whole monthly / daily windows;
 *  'evidence' tags single event-source rows (policy-events.ts). */
export const inputRole=(purpose:string,seriesId:string,tag:InputTag):string=>`${purpose}:${seriesId}:${tag}`;
export const toObsRef=(i:ManifestInput):ObsRef=>({observation_id:i.observation_id,series_id:i.series_id,period_end:i.period_end,value_text:i.value_text,version:i.version,available_at:i.available_at,source:i.source});
/** Inputs with this exact role, ascending period_end. */
export const inputsWithRole=(m:StrategyManifest,role:string):ManifestInput[]=>m.inputs.filter(i=>i.role===role).sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0);
export const frozenDef=(m:StrategyManifest,id:string):FrozenSeriesDef|null=>m.catalog.find(d=>d.id===id)??null;
export const readState=(m:StrategyManifest,seriesId:string,purpose:string):ManifestRead['state']|null=>m.reads.find(r=>r.series_id===seriesId&&r.purpose===purpose)?.state??null;

// ---------------------------------------------------------------- builder
export const HISTORY_MAX_ROWS=10000;
export interface ManifestBuilder{
 readonly port:StrategyReadPort;readonly cutoff:string;
 /** Catalog row by id, frozen into manifest.catalog on first use; null when the live catalog has no such id. */
 def(id:string):FrozenSeriesDef|null;
 /** Freeze the two snapshots; unless loadRows=false, load their observations (one observationsByIds per snapshot) for snapshotValue.
  *  Unresolved ids → read {series_id: snapshot_id, purpose: 'snapshot_rows', state: 'missing'} and the region is incomplete. */
 useSnapshots(s:{US:SnapshotRecord|null;CN:SnapshotRecord|null},opts?:{loadRows?:boolean}):Promise<void>;
 /** Latest value of a series (§4.5 value rule) plus the requested comparison roles from the snapshot; records one read.
  *  Region snapshot incomplete → 'truncated', null. */
 snapshotValue(seriesId:string,purpose:string,comparison?:readonly Exclude<SnapshotRole,'latest'>[]):Promise<ObservationRow|null>;
 /** Whole history asOf cutoff (highest version per period). keepInputs=false records only the read state (event sources). null = truncated. */
 history(seriesId:string,purpose:string,tag:'month_end'|'history',opts?:{from?:string;to?:string;keepInputs?:boolean}):Promise<ObservationRow[]|null>;
 /** Freeze chosen rows of a history read (source history asOf cutoff) under '<purpose>:<series>:<tag>'. */
 keep(rows:readonly ObservationRow[],purpose:string,tag:InputTag):void;
 build(a:{kind:ManifestKind;params:Record<string,string|number>;methodVersion:string;codeVersion:string;extra?:Pick<StrategyManifest,'baseline'|'rules'|'events'|'gaps'|'timeliness'>}):StrategyManifest;
}
const isTruncated=(e:unknown)=>e instanceof Error&&e.message==='truncated';
export const SNAPSHOT_ROWS_PURPOSE='snapshot_rows';
export function manifestBuilder(port:StrategyReadPort,cutoff:string):ManifestBuilder{
 const live=new Map(port.catalog().map(d=>[d.id,d]));
 const catalog=new Map<string,FrozenSeriesDef>();
 const reads=new Map<string,ManifestRead>();
 const inputs=new Map<string,ManifestInput>();
 let snapshots:{US:FrozenSnapshot|null;CN:FrozenSnapshot|null}={US:null,CN:null};
 const roles:Record<Region,Map<string,Partial<Record<SnapshotRole,ObservationRow>>>>={US:new Map(),CN:new Map()};
 const incomplete:Record<Region,boolean>={US:false,CN:false};
 const def=(id:string)=>{const d=live.get(id);if(!d)return null;let f=catalog.get(id);if(!f){f=freezeDef(d);catalog.set(id,f);}return f;};
 const read=(series_id:string,purpose:string,state:ManifestRead['state'])=>{reads.set(`${purpose}|${series_id}`,{series_id,purpose,state});};
 const put=(o:ObservationRow,role:string,source:InputSource)=>{
  inputs.set(`${role}|${o.observation_id}`,{series_id:o.series_id,role,observation_id:o.observation_id,period_end:o.period_end,value_text:o.value_text,version:o.version,available_at:o.available_at,source});
 };
 const periodOf=(id:string)=>live.get(id)?.period??'month';
 return {
  port,cutoff,def,
  async useSnapshots(s,opts={}){
   snapshots={US:s.US?freezeSnapshot(s.US):null,CN:s.CN?freezeSnapshot(s.CN):null};
   if(opts.loadRows===false)return;
   for(const r of ['US','CN'] as const){
    const rec=s[r];incomplete[r]=false;
    if(!rec){roles[r]=new Map();continue;}
    const ids=[...new Set([...rec.observation_ids,...rec.history_ids])];
    const rows=await port.observationsByIds(ids);
    const found=new Set(rows.map(o=>o.observation_id));
    if(ids.some(id=>!found.has(id))){incomplete[r]=true;read(rec.snapshot_id,SNAPSHOT_ROWS_PURPOSE,'missing');}
    roles[r]=snapshotRoles(rows,periodOf);
   }
  },
  async snapshotValue(seriesId,purpose,comparison=[]){
   const d=def(seriesId);
   const snapRec=d?snapshots[d.region]:null;
   if(d&&snapRec&&incomplete[d.region]){read(seriesId,purpose,'truncated');return null;}
   const r=d?roles[d.region].get(seriesId):undefined;
   if(snapRec&&r?.latest){
    const source:InputSource={kind:'snapshot',snapshot_id:snapRec.snapshot_id};
    put(r.latest,inputRole(purpose,seriesId,'latest'),source);
    for(const c of comparison){const o=r[c];if(o)put(o,inputRole(purpose,seriesId,c),source);}
    read(seriesId,purpose,'ok');return r.latest;
   }
   let rows:ObservationRow[];
   try{rows=await port.latestObservations([seriesId],{asOf:cutoff});}
   catch(e){if(isTruncated(e)){read(seriesId,purpose,'truncated');return null;}throw e;}
   const o=rows.find(x=>x.series_id===seriesId)??null;
   if(!o){read(seriesId,purpose,'missing');return null;}
   put(o,inputRole(purpose,seriesId,'latest'),{kind:'history',as_of:cutoff});read(seriesId,purpose,'ok');
   return o;
  },
  async history(seriesId,purpose,tag,opts={}){
   def(seriesId);
   let rows:ObservationRow[];
   try{rows=await port.seriesHistory(seriesId,{from:opts.from,to:opts.to,asOf:cutoff,maxRows:HISTORY_MAX_ROWS});}
   catch(e){if(isTruncated(e)){read(seriesId,purpose,'truncated');return null;}throw e;}
   read(seriesId,purpose,rows.length?'ok':'missing');
   if(opts.keepInputs!==false)for(const o of rows)put(o,inputRole(purpose,seriesId,tag),{kind:'history',as_of:cutoff});
   return rows;
  },
  keep(rows,purpose,tag){for(const o of rows){def(o.series_id);put(o,inputRole(purpose,o.series_id,tag),{kind:'history',as_of:cutoff});}},
  build(a){
   const byKey=<T>(k:(x:T)=>string)=>(x:T,y:T)=>k(x)<k(y)?-1:k(x)>k(y)?1:0;
   return {
    kind:a.kind,params:{...a.params},cutoff,snapshots,...(a.extra??{}),
    catalog:[...catalog.values()].sort(byKey(d=>d.id)),
    reads:[...reads.values()].sort(byKey(r=>`${r.purpose}|${r.series_id}`)),
    inputs:[...inputs.values()].sort(byKey(i=>`${i.role}|${i.period_end}|${i.observation_id}`)),
    catalog_version:port.catalogVersion(),method_version:a.methodVersion,code_version:a.codeVersion,
   };
  },
 };
}
