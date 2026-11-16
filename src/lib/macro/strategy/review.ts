// src/lib/macro/strategy/review.ts
// Monthly review (spec 2026-11-07 §6.2, macro-review/1): a month-end vs month-end comparison, not a daily activity
// ledger. cutoff = the 3rd of the next month 00:00:00Z, baseline cutoff = the 3rd of the review month (manifest.ts
// monthCutoff); the cutoff decides what was known, the compared periods stay month end vs month end. buildReviewManifest uses two manifest builders — one per cutoff — and merges them: the region's snapshot at
// each cutoff (snapshotUpTo; ties by snapshot_id) with the latest value per level indicator (purposes 'review' and
// 'review_base'), the month's and the previous month's month-end asset rows (seriesHistory asOf each cutoff, purposes
// 'asset_end' / 'asset_base'), every policy event up to the cutoff, the catalog projection of the region and the timeliness
// states computed for the cutoff date. reviewFromManifest is pure and reads only the manifest (replay never touches the
// port or the live catalog); snapshot sections use only inputs whose source is the snapshot. Episode identity =
// (direction, start); "opened" = present at the cutoff, absent at the baseline; "ended" = ongoing at the baseline, present and
// no longer ongoing at the cutoff. A history_truncated event gap puts one explicit 'events_truncated' fact into both the
// policy_events and episode_changes sections (never an ordinary empty section). Percent asset moves keep the exact ratio
// (unit 'pct_ratio'). runReview drives one (region, month) unit for the cron.
import type {Episode,Fact,FrozenSeriesDef,ManifestInput,ManifestRead,ObservationRow,Region,ReviewFacts,ReviewStatus,SnapshotRecord,StrategyManifest,StrategyPolicyEvent,Timeliness} from './contract';
import {VERSIONS} from './contract';
import {policyEpisodes} from './cycle-table';
import type {StrategyDb} from './db';
import {eventFact,evidenceRoles,levelIndicators} from './facts';
import {inputRole,inputsWithRole,manifestBuilder,manifestHash,monthCutoff,monthEnd,monthOf,prevMonth,readState,utcDate} from './manifest';
import {pctRatio,sign,subtract,toBp} from './numeric';
import {readPolicyEvents} from './policy-events';
import type {StrategyReadPort} from './port';

const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
export const REVIEW_PURPOSE='review';export const BASELINE_PURPOSE='review_base';
export const ASSET_END_PURPOSE='asset_end';export const ASSET_BASE_PURPOSE='asset_base';
/** Perspective columns that are indicators in P1 but appear as asset moves (spec §5.5 columns). */
export const PERSPECTIVE_SERIES:Record<Region,readonly string[]>={US:['US_DTWEXBGS'],CN:['CN_USDCNY_CP']};
export function assertMonth(month:string):void{if(!MONTH.test(month))throw new Error(`invalid_month:${month}`);}
/** Asset-move columns of a region: active monthly assets plus the perspective series; aliasOf resolves the series read. */
export function assetColumns(catalog:readonly FrozenSeriesDef[],region:Region):{def:FrozenSeriesDef;readId:string;kind:'pct'|'bp'}[]{
 return catalog.filter(d=>d.region===region&&d.status==='active'&&d.period==='month'&&(d.role==='asset'||PERSPECTIVE_SERIES[region].includes(d.id)))
  .map(d=>({def:d,readId:d.aliasOf??d.id,kind:d.changeKind==='bp'?'bp' as const:'pct' as const}));
}
const byKey=<T>(k:(x:T)=>string)=>(x:T,y:T)=>k(x)<k(y)?-1:k(x)>k(y)?1:0;

export async function buildReviewManifest(port:StrategyReadPort,region:Region,month:string,codeVersion:string):Promise<StrategyManifest>{
 assertMonth(month);
 const baseMonth=prevMonth(month);const cutoff=monthCutoff(month);const baselineCutoff=monthCutoff(baseMonth);const end=monthEnd(month);const today=utcDate(cutoff);
 const [cur,base]=await Promise.all([port.snapshotUpTo(region,cutoff),port.snapshotUpTo(region,baselineCutoff)]);
 const pair=(s:SnapshotRecord|null)=>region==='US'?{US:s,CN:null}:{US:null,CN:s};
 const b=manifestBuilder(port,cutoff);const bb=manifestBuilder(port,baselineCutoff);
 await Promise.all([b.useSnapshots(pair(cur)),bb.useSnapshots(pair(base))]);
 const live=port.catalog();
 for(const d of live)if(d.region===region&&d.role!=='event_source')b.def(d.id);
 const inSnapshot=(s:SnapshotRecord|null)=>{const ids=new Set(s?[...s.observation_ids,...s.history_ids]:[]);return (id:string|undefined)=>id!==undefined&&ids.has(id);};
 const inCur=inSnapshot(cur);
 const timeliness:{series_id:string;state:Timeliness}[]=[];
 const levels=levelIndicators(live,region).filter(d=>d.status==='active');
 const ids=levels.map(d=>d.id);
 const assets=assetColumns(live,region);
 // Distinct builders keep the current and baseline availability cutoffs isolated. Each fallback is one batch.
 const [{events,gaps},current]=await Promise.all([
  readPolicyEvents(b),
  cur?b.snapshotValues(ids,REVIEW_PURPOSE):Promise.resolve(new Map<string,ObservationRow|null>()),
  base?bb.snapshotValues(ids,BASELINE_PURPOSE):Promise.resolve(),
  ...assets.flatMap(c=>[
   b.history(c.readId,ASSET_END_PURPOSE,'month_end',{from:`${month}-01`,to:end}),
   bb.history(c.readId,ASSET_BASE_PURPOSE,'month_end',{from:`${baseMonth}-01`,to:monthEnd(baseMonth)}),
  ]),
 ]);
 if(cur)for(const d of levels){
  const l=current.get(d.id);
  timeliness.push({series_id:d.id,state:port.timeliness(d,inCur(l?.observation_id)?l!.period_end:null,today)});
 }
 const params={region,month};
 const mb=bb.build({kind:'review',params,methodVersion:VERSIONS.review,codeVersion});
 const m=b.build({kind:'review',params,methodVersion:VERSIONS.review,codeVersion,extra:{baseline:{cutoff:baselineCutoff,...mb.snapshots},events,gaps,timeliness}});
 const catalog=new Map(m.catalog.map(d=>[d.id,d]));for(const d of mb.catalog)if(!catalog.has(d.id))catalog.set(d.id,d);
 return {...m,catalog:[...catalog.values()].sort(byKey<FrozenSeriesDef>(d=>d.id)),
  reads:[...m.reads,...mb.reads].sort(byKey<ManifestRead>(r=>`${r.purpose}|${r.series_id}`)),
  inputs:[...m.inputs,...mb.inputs].sort(byKey<ManifestInput>(i=>`${i.role}|${i.period_end}|${i.observation_id}`))};
}

const episodeKey=(e:Pick<Episode,'direction'|'start'>)=>`${e.direction}:${e.start}`;
function episodeFact(e:Episode,change:'opened'|'ended',events:readonly StrategyPolicyEvent[],m:StrategyManifest):Fact{
 const evidence=events.filter(x=>x.effective_date>=e.start&&x.effective_date<=e.end).flatMap(x=>[...x.evidence]);
 return {fact_id:`ep:${episodeKey(e)}:${change}`,kind:'episode',template:change==='opened'?'episode_opened':'episode_ended',
  slots:{direction:e.direction,start:e.start,end:e.end,events:{value_text:String(e.events),unit:'count'},upper_from:{value_text:e.upper_from,unit:'pct'},upper_to:{value_text:e.upper_to,unit:'pct'},cumulative:{value_text:e.cumulative_bp,unit:'bp'}},
  period_end:e.end,source_inputs:evidenceRoles(m,evidence)};
}
/** Pure: the seven sections from the manifest alone. status = 'insufficient' when the month has no snapshot (reason no_snapshot). */
export function reviewFromManifest(m:StrategyManifest):{status:ReviewStatus;facts:ReviewFacts}{
 if(m.kind!=='review'||!m.baseline)throw new Error(`not_review_manifest:${m.kind}`);
 const region=String(m.params.region) as Region;const month=String(m.params.month);const baseMonth=prevMonth(month);const today=utcDate(m.cutoff);
 const cur=m.snapshots[region];const base=m.baseline[region];
 const snapIn=(purpose:string,id:string)=>m.inputs.find(i=>i.role===inputRole(purpose,id,'latest')&&i.source.kind==='snapshot')??null;
 const indicators=levelIndicators(m.catalog,region).filter(d=>d.status==='active');
 const releases:Fact[]=[];const revisions:Fact[]=[];const baselineGaps:Fact[]=[];
 if(cur&&base)for(const d of indicators){
  const l=snapIn(REVIEW_PURPOSE,d.id);const b=snapIn(BASELINE_PURPOSE,d.id);if(!l)continue;
  const value={value_text:l.value_text,unit:d.unit};
  if(!b){
   // A truncated (or never recorded) baseline read proves nothing about the baseline: no release_first / revision is produced
   // and the evidence gap is an explicit coverage fact. 'ok' (read outside the snapshot) and 'missing' stay confirmed absences.
   const state=readState(m,d.id,BASELINE_PURPOSE);
   if(state==='truncated'||state===null){baselineGaps.push({fact_id:`cov:base:${d.id}`,kind:'coverage',template:'baseline_unavailable',slots:{series:d.id,state:state??'not_read'},series_id:d.id,source_inputs:[l.role]});continue;}
   releases.push({fact_id:`rel:${d.id}`,kind:'release',template:'release_first',slots:{series:d.id,period:l.period_end,value},series_id:d.id,period_end:l.period_end,source_inputs:[l.role]});
  }
  else if(l.period_end>b.period_end)releases.push({fact_id:`rel:${d.id}`,kind:'release',template:'release',slots:{series:d.id,prev_period:b.period_end,prev_value:{value_text:b.value_text,unit:d.unit},period:l.period_end,value},series_id:d.id,period_end:l.period_end,source_inputs:[b.role,l.role]});
  else if(l.period_end===b.period_end&&l.version>b.version)revisions.push({fact_id:`rev:${d.id}`,kind:'revision',template:'revision',slots:{series:d.id,period:l.period_end,from:{value_text:b.value_text,unit:d.unit},to:value},series_id:d.id,period_end:l.period_end,source_inputs:[b.role,l.role]});
 }
 const timeliness:Fact[]=[];
 for(const t of m.timeliness??[]){
  if(t.state!=='late'&&t.state!=='missing')continue;
  const l=snapIn(REVIEW_PURPOSE,t.series_id);
  timeliness.push(t.state==='late'&&l
   ?{fact_id:`tml:${t.series_id}`,kind:'timeliness',template:'timeliness_late',slots:{series:t.series_id,date:today,period:l.period_end},series_id:t.series_id,period_end:l.period_end,source_inputs:[l.role]}
   :{fact_id:`tml:${t.series_id}`,kind:'timeliness',template:'timeliness_missing',slots:{series:t.series_id,date:today},series_id:t.series_id,source_inputs:[]});
 }
 const events=[...(m.events??[])].sort((x,y)=>x.effective_date<y.effective_date?-1:x.effective_date>y.effective_date?1:0);
 const gaps=m.gaps??[];
 const truncated=gaps.find(g=>g.kind==='history_truncated');
 const truncatedFact=(section:'evt'|'ep'):Fact=>({fact_id:`${section}:truncated`,kind:'coverage',template:'events_truncated',slots:{date:truncated!.near,sources:truncated!.reason},source_inputs:[]});
 const policy_events=truncated?[truncatedFact('evt')]:events.filter(e=>monthOf(e.effective_date)===month).map(e=>eventFact(e,m));
 const cutDate=utcDate(m.cutoff);const baseDate=utcDate(m.baseline.cutoff);
 const episode_changes:Fact[]=[];
 if(truncated)episode_changes.push(truncatedFact('ep'));
 else{
  const atCut=policyEpisodes(events,gaps,cutDate);const atBase=new Map(policyEpisodes(events.filter(e=>e.effective_date<=baseDate),gaps,baseDate).map(e=>[episodeKey(e),e]));
  for(const e of atCut){
   const prior=atBase.get(episodeKey(e));
   if(!prior)episode_changes.push(episodeFact(e,'opened',events,m));
   else if(prior.ongoing&&!e.ongoing)episode_changes.push(episodeFact(e,'ended',events,m));
  }
 }
 const asset_moves:Fact[]=[];
 for(const c of assetColumns(m.catalog,region)){
  const end=inputsWithRole(m,inputRole(ASSET_END_PURPOSE,c.readId,'month_end')).find(i=>monthOf(i.period_end)===month);
  const start=inputsWithRole(m,inputRole(ASSET_BASE_PURPOSE,c.readId,'month_end')).find(i=>monthOf(i.period_end)===baseMonth);
  const missing=(reason:string):Fact=>({fact_id:`mv:${c.def.id}`,kind:'asset_move',template:'asset_missing',slots:{series:c.def.id,base_month:baseMonth,month,reason},series_id:c.def.id,source_inputs:[start,end].filter((x):x is ManifestInput=>!!x).map(x=>x.role)});
  if(!end||!start){asset_moves.push(missing('out_of_coverage'));continue;}
  let change:{value_text:string;unit:string};
  if(c.kind==='bp')change={value_text:toBp(subtract(end.value_text,start.value_text)),unit:'bp'};
  else if(sign(start.value_text)<=0){asset_moves.push(missing('non_positive_base'));continue;}
  else change={value_text:pctRatio(end.value_text,start.value_text),unit:'pct_ratio'};
  asset_moves.push({fact_id:`mv:${c.def.id}`,kind:'asset_move',template:'asset_move',
   slots:{series:c.def.id,base_period:start.period_end,period:end.period_end,from:{value_text:start.value_text,unit:c.def.unit},to:{value_text:end.value_text,unit:c.def.unit},change},
   series_id:c.def.id,period_end:end.period_end,source_inputs:[start.role,end.role]});
 }
 const coverage:Fact[]=[];
 if(cur){
  const n=cur.catalog_counts;
  coverage.push({fact_id:'cov:counts',kind:'coverage',template:'coverage',slots:{verified:{value_text:String(n.verified),unit:'count'},missing:{value_text:String(n.missing),unit:'count'},restricted:{value_text:String(n.restricted),unit:'count'}},source_inputs:[]});
  for(const d of m.catalog)if(d.region===region&&d.role!=='event_source'&&(d.status==='missing'||d.status==='restricted'))
   coverage.push({fact_id:`cov:${d.id}`,kind:'coverage',template:'catalog_unavailable',slots:{series:d.id,status:d.status},series_id:d.id,source_inputs:[]});
 }
 coverage.push(...baselineGaps);
 return {status:cur?'ok':'insufficient',facts:{region,month,cutoff:m.cutoff,baseline_cutoff:m.baseline.cutoff,snapshot_id:cur?.snapshot_id??null,baseline_snapshot_id:base?.snapshot_id??null,baseline_missing:!base,
  releases,revisions,timeliness,policy_events,episode_changes,asset_moves,coverage}};
}

export interface ReviewReceipt{region:Region;month:string;outcome:'advanced'|'replayed'|'stale'|'preview'|'failed';status:ReviewStatus|null;manifest_hash:string|null;manifest_id:string|null;result_id:string|null;generation:number|null;error?:string}
/** One cron unit. preview → zero writes. Any exception → failed attempt logged, pointer untouched; stale is an outcome, not an error. */
export async function runReview(d:{port:StrategyReadPort;db:StrategyDb;codeVersion:string},region:Region,month:string,opts:{preview:boolean}):Promise<ReviewReceipt>{
 const empty={status:null,manifest_hash:null,manifest_id:null,result_id:null,generation:null};
 try{
  const current=await d.db.reviewCurrent(region,month);
  const body=await buildReviewManifest(d.port,region,month,d.codeVersion);
  const {status,facts}=reviewFromManifest(body);
  if(opts.preview)return {...empty,region,month,outcome:'preview',status,manifest_hash:manifestHash(body),generation:current?.generation??0};
  const stored=await d.db.putManifest(body);
  const r=await d.db.publishReview({region,month,expectedGeneration:current?.generation??0,cutoff:body.cutoff,status,manifestId:stored.manifest_id,manifestHash:stored.manifest_hash,facts,methodVersion:VERSIONS.review,codeVersion:d.codeVersion});
  return {region,month,outcome:r.outcome,status,manifest_hash:stored.manifest_hash,manifest_id:stored.manifest_id,result_id:r.result_id,generation:r.generation};
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  if(!opts.preview){try{await d.db.recordReviewAttempt(region,month,'failed',{message});}catch{/* the attempt log is best-effort; the pointer is already untouched */}}
  return {...empty,region,month,outcome:'failed',error:message};
 }
}
