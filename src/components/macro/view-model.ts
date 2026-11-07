// src/components/macro/view-model.ts
// API JSON → view models for the macro workbench UI (spec §3, §8). This is the only UI file that knows the
// overview / series / versions JSON field names; components receive plain view objects. Task 13 (views.ts) owns the
// overview shapes; the *Json interfaces below declare exactly the fields this file reads, and the compile-time checks
// assert Task 13's IndicatorRow / ChangeItem / Envelope stay assignable to them: a drift fails typecheck instead of
// rendering blanks. Period kind and full source come from the catalog (catalog.ts is pure TS, safe in client code).
import {catalogById} from '@/lib/macro/catalog';
import type {AssetByCycle} from '@/lib/macro/series-extras';
import type {Cycle,InsufficientSegment} from '@/lib/macro/cycles';
import type {PolicyEvent} from '@/lib/macro/events';
import type {CalendarEvent} from '@/lib/macro/fomc';
import type {ChangeItem,Envelope,IndicatorRow} from '@/lib/macro/views';
import type {Adapter,Bilingual,CatalogCounts,ChangeKind,Locator,MacroSeriesDef,Rights,SeriesStatus,Timeliness} from '@/lib/macro/types';
import {MISSING,formatChange,formatInstant,formatPeriod,formatValueText,unitSuffix,type TypedChange} from './macro-format';
import type {MacroT} from './use-macro-t';
export type Locale='zh'|'en';
export const pick=(b:Bilingual|null|undefined,locale:Locale):string=>b?b[locale]:'';
// ---- overview JSON (GET /api/macro/overview; shapes owned by src/lib/macro/views.ts, Task 13) ----
export interface SourceJson{publisher:Bilingual;via:Bilingual|null;fetch_host:string;adapter:Adapter;rights:Rights;attribution:Bilingual}
export interface IndicatorRowJson{observation_id:string|null;series_id:string;name:Bilingual;value_text:string|null;unit:string;change:{kind:ChangeKind;value_text:string}|null;
 period_end:string|null;available_at:string|null;timeliness:Timeliness;status:'A'|'M'|'R';reason?:Bilingual;retrieval_id:string|null;sparkline:string[]}
export type ChangeKindJson='new_release'|'revised'|'late'|'missing';
export interface ChangeItemJson{series_id:string;kind:ChangeKindJson;period_end:string|null}
export type CollectionStatus='fresh'|'stale'|'error'|'missing';
export interface OverviewEnvelopeJson{snapshotId:string|null;asOf:string|null;catalogVersion:string;methodologyVersion:string|null;
 collection:{dataset:string;status:CollectionStatus;lastOkAt:string|null}[];indicators:IndicatorRowJson[];
 changes:{counts:Record<ChangeKindJson,number>;items:ChangeItemJson[]};catalogCounts:CatalogCounts|null}
export interface OverviewJson{regions:{US?:OverviewEnvelopeJson;CN?:OverviewEnvelopeJson}}
type Assert<T extends true>=T;
/** Compile-time contract with src/lib/macro/views.ts (Task 13). */
export type IndicatorRowContract=Assert<IndicatorRow extends IndicatorRowJson?true:false>;
export type ChangeItemContract=Assert<ChangeItem extends ChangeItemJson?true:false>;
export type EnvelopeContract=Assert<Envelope extends OverviewEnvelopeJson?true:false>;
const STATUS:Record<IndicatorRowJson['status'],SeriesStatus>={A:'active',M:'missing',R:'restricted'};
/** Drawer source block for a series: the catalog source without the adapter-internal series key. */
export function sourceOf(seriesId:string):SourceJson|null{
 const s=catalogById(seriesId)?.source;
 return s?{publisher:s.publisher,via:s.via??null,fetch_host:s.fetchHost,adapter:s.adapter,rights:s.rights,attribution:s.attribution}:null;
}
// ---- series JSON (GET /api/macro/series/[id]) ----
export interface SeriesObsJson{observation_id:string;period_end:string;value_text:string;version:number;available_at:string;availability_basis:'first_seen';retrieval_id:string|null;evidence_sha256:string|null;locator:Locator|null}
export interface SeriesJson{def:MacroSeriesDef;observations:SeriesObsJson[];cycles:Cycle[];insufficient:InsufficientSegment[];events:PolicyEvent[];calendar:CalendarEvent[];assetsByCycle:AssetByCycle[];eventsVersion:string;cyclesVersion:string}
// ---- versions JSON (GET /api/macro/series/[id]/versions) ----
export interface ProvenanceJson{observation_id:string;series_id:string;version:number;value_text:string;available_at:string;availability_basis:'first_seen';
 retrieval:{retrieval_id:string;fetch_url:string;fetch_host:string;http_status:number;fetched_at:string;tool_versions:Record<string,string>}|null;
 evidence:{sha256:string;adapter:Adapter;content_type:string;byte_length:number}|null;locator:Locator|null;transform:string|null;derived_from:string[]|null}
export type MissingInput={observation_id:string;missing:true};
export interface VersionJson extends ProvenanceJson{inputs:(ProvenanceJson|MissingInput)[]}
export interface VersionsJson{series_id:string;read_series_id:string;period_end:string;versions:VersionJson[]}

export interface IndicatorView{seriesId:string;observationId:string|null;name:string;status:SeriesStatus;reason:string|null;muted:boolean;value:string;valueText:string|null;unit:string;change:TypedChange|null;
 period:string;periodEnd:string|null;available:string;timeliness:Timeliness;spark:string[];hasEvidence:boolean;source:SourceJson|null}
export function toIndicatorView(row:IndicatorRowJson,locale:Locale):IndicatorView{
 const status=STATUS[row.status];const period=catalogById(row.series_id)?.period??'month';const has=row.value_text!==null&&row.period_end!==null;
 return {seriesId:row.series_id,observationId:row.observation_id,name:pick(row.name,locale),status,reason:row.reason?pick(row.reason,locale):null,muted:status!=='active'||!has,
  value:row.value_text!==null?formatValueText(row.value_text):MISSING,valueText:row.value_text,unit:row.value_text!==null?unitSuffix(row.unit):'',
  change:row.change?formatChange(row.change):null,
  period:row.period_end?formatPeriod(row.period_end,period):MISSING,periodEnd:row.period_end,available:row.available_at?formatInstant(row.available_at):MISSING,
  timeliness:row.timeliness,spark:row.sparkline,hasEvidence:has,source:status==='active'?sourceOf(row.series_id):null};
}
/** Status pill key: catalog status first (missing / restricted), then publication timeliness. */
export const statusKey=(v:Pick<IndicatorView,'status'|'timeliness'>):string=>v.status!=='active'?`status.${v.status}`:`timeliness.${v.timeliness==='n/a'?'na':v.timeliness}`;
export function sourceLabel(s:SourceJson|null,locale:Locale):string|null{if(!s)return null;return s.via?`${pick(s.publisher,locale)} via ${pick(s.via,locale)}`:pick(s.publisher,locale);}
export function sourceLabels(rows:readonly IndicatorRowJson[],locale:Locale):string[]{
 return [...new Set(rows.flatMap(r=>{const l=r.status==='A'?sourceLabel(sourceOf(r.series_id),locale):null;return l?[l]:[];}))];
}
export interface CoverageView{verified:number;total:number;notVerified:{seriesId:string;name:string;status:SeriesStatus;reason:string}[]}
/** Counts from the snapshot; before any snapshot (catalogCounts null) they are counted from the catalog rows shown. */
export function coverageOf(env:OverviewEnvelopeJson,locale:Locale):CoverageView{
 const c=env.catalogCounts??{verified:env.indicators.filter(r=>r.status==='A').length,missing:env.indicators.filter(r=>r.status==='M').length,restricted:env.indicators.filter(r=>r.status==='R').length};
 return {verified:c.verified,total:c.verified+c.missing+c.restricted,
  notVerified:env.indicators.filter(r=>r.status!=='A').map(r=>({seriesId:r.series_id,name:pick(r.name,locale),status:STATUS[r.status],reason:r.reason?pick(r.reason,locale):''}))};
}
export const changeCounts=(env:Pick<OverviewEnvelopeJson,'changes'>):Record<ChangeKindJson,number>=>({...env.changes.counts});
export interface ChangeLine{kind:ChangeKindJson;seriesId:string;name:string;value:string;previous:string|null;period:string}
/** Change lines name the row and show its current published value (the envelope carries no previous value text). */
export function changeLines(env:OverviewEnvelopeJson,locale:Locale,limit=6):ChangeLine[]{
 const by=new Map(env.indicators.map(r=>[r.series_id,r]));
 return env.changes.items.slice(0,limit).map(c=>{
  const r=by.get(c.series_id);const u=r?unitSuffix(r.unit):'';const period=catalogById(c.series_id)?.period??'month';
  const shown=c.kind!=='missing'&&r?.value_text!=null&&r.period_end===c.period_end?r.value_text:null;
  return {kind:c.kind,seriesId:c.series_id,name:r?pick(r.name,locale):c.series_id,value:shown?formatValueText(shown)+u:MISSING,previous:null,
   period:c.period_end?formatPeriod(c.period_end,period):MISSING};
 });
}
export interface CollectionView{dataset:string;status:CollectionStatus;lastOk:string}
const SEVERITY:CollectionStatus[]=['error','stale','missing','fresh'];
export function collectionOf(env:Pick<OverviewEnvelopeJson,'collection'>):{items:CollectionView[];overall:CollectionStatus}{
 const items=env.collection.map(c=>({dataset:c.dataset,status:c.status,lastOk:c.lastOkAt?formatInstant(c.lastOkAt):MISSING}));
 return {items,overall:SEVERITY.find(s=>items.some(i=>i.status===s))??'missing'};
}
/** Today / /intel key indicators (spec §3.5) = Task 13's COMPACT_KEYS (asserted in view-model.test.ts). Only rows present
 *  in the envelope are shown; nothing is invented. */
export const GLANCE_IDS={US:['US_DFF','US_DGS10','US_CPI_YOY'],CN:['CN_CPI_YOY','CN_PMI_MFG','CN_CGB_10Y']} as const;
export function glanceRows(o:OverviewJson,locale:Locale):{region:'US'|'CN';asOf:string|null;overall:CollectionStatus;rows:IndicatorView[]}[]{
 return (['US','CN'] as const).flatMap(region=>{
  const env=o.regions[region];if(!env)return [];
  const by=new Map(env.indicators.map(r=>[r.series_id,r]));
  return [{region,asOf:env.asOf,overall:collectionOf(env).overall,rows:GLANCE_IDS[region].flatMap(id=>{const r=by.get(id);return r?[toIndicatorView(r,locale)]:[];})}];
 });
}
// ---- evidence drawer rows ----
export interface DrawerRow{key:string;label:string;value:string;mono:boolean;missing:boolean;href?:string}
const drawerRow=(t:MacroT,key:string,value:string|null|undefined,mono=false,href?:string):DrawerRow=>({key,label:t(`drawer.${key}`),value:value??t('drawer.missing'),mono,missing:value==null,...(href&&value!=null?{href}:{})});
export function locatorText(l:Locator|null,t:MacroT):string|null{
 if(!l)return null;
 if(l.kind==='csv_row')return t('drawer.csvRow',{line:l.line,column:l.column});
 if(l.kind==='html_cell')return t('drawer.htmlCell',{table:l.table,row:l.row,cell:l.cell});
 return t('drawer.jsonPointer',{pointer:l.pointer});
}
export function sourceRows(s:SourceJson|null,t:MacroT,locale:Locale):DrawerRow[]{
 return [drawerRow(t,'publisher',s?pick(s.publisher,locale):null),drawerRow(t,'via',s?(s.via?pick(s.via,locale):t('drawer.noVia')):null),
  drawerRow(t,'rights',s?t(`drawer.rightsValues.${s.rights}`):null),drawerRow(t,'attribution',s?pick(s.attribution,locale):null)];
}
/** Proof for one observation. A field that cannot be shown keeps its name and reads 缺失 (canvas SourceDrawer). */
export function proofRows(p:ProvenanceJson,t:MacroT):DrawerRow[]{
 const tools=p.retrieval?Object.entries(p.retrieval.tool_versions).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join(' · '):null;
 return [
  drawerRow(t,'fetchUrl',p.retrieval?.fetch_url,true,p.retrieval?.fetch_url),
  drawerRow(t,'host',p.retrieval?.fetch_host,true),
  drawerRow(t,'fetchedAt',p.retrieval?formatInstant(p.retrieval.fetched_at):null,true),
  drawerRow(t,'available',formatInstant(p.available_at),true),
  drawerRow(t,'sha256',p.evidence?.sha256,true,p.evidence?`/api/macro/evidence/${p.evidence.sha256}`:undefined),
  drawerRow(t,'locator',locatorText(p.locator,t),true),
  drawerRow(t,'transform',p.transform??t('drawer.none'),true),
  drawerRow(t,'adapter',p.evidence?t(`drawer.adapters.${p.evidence.adapter}`):null),
  drawerRow(t,'toolVersions',tools||null,true),
 ];
}
export interface RevisionRow{version:string;value:string;available:string;note:string;superseded:boolean}
export function revisionRows(versions:readonly ProvenanceJson[],t:MacroT):RevisionRow[]{
 const sorted=[...versions].sort((a,b)=>b.version-a.version);const top=sorted[0]?.version;
 return sorted.map((v,i)=>({version:`v${v.version}`,value:formatValueText(v.value_text),available:formatInstant(v.available_at),note:i===0?t('drawer.current'):t('drawer.superseded',{version:top}),superseded:i>0}));
}
export const isMissingInput=(x:ProvenanceJson|MissingInput):x is MissingInput=>'missing' in x;
/** The version the drawer proves (第 4 稿 P1-9): exactly the displayed observation; an id that is not among the versions
 *  gives null (never another version's evidence); no id → the newest (versions arrive newest first). */
export function selectVersion(versions:readonly VersionJson[],observationId:string|null):VersionJson|null{
 if(observationId===null)return versions[0]??null;
 return versions.find(v=>v.observation_id===observationId)??null;
}
