// src/lib/macro/snapshots.ts
// Fact-snapshot publishing (spec §4.4 steps 4–5, §5.3, §11; §0.2 M7/M16/N3; 第 4 稿 P1-5/P1-8). A snapshot
// is the frozen manifest of each weighted active item's latest, previous and 3-months-earlier ELIGIBLE
// observations (ok + batch success/partial + ancestors eligible) plus the frozen sparkline history
// (history_ids); it is published regardless of coverage (regime=null only means "no classification").
// Optimistic: (revision, input_revision) is read first; stale_publisher → one retry from scratch, then give
// up. Other failures record a failed snapshot; active is untouched. 第 5 稿: an optional publish key makes a repeated
// publish replay the stored snapshot (replayed:true) — its receipt is read back from the persisted snapshot and regime row
// (第 6 稿 P2-2); the ingest finish adds its owner fence, and `fenced` propagates.
import {CATALOG_VERSION,catalogById} from './catalog';
import {MacroDbError} from './db';
import type {MacroDb} from './db';
import {macroJudgmentsEnabled} from './flags';
import {METHODOLOGY_VERSION,RULES_VERSION,WEIGHTS_V1,classifyRegime} from './regime';
import type {CatalogCounts,MacroSeriesDef,Region,SnapshotRecord} from './types';
import {buildRegimeInputFromRows} from './regime-selection';
import type {BuiltRegimeInput} from './regime-selection';
export {HISTORY_MONTHS,SPARK_POINTS} from './regime-selection';
export type {BuiltRegimeInput} from './regime-selection';

/** Weighted catalog items of a region (active, missing and restricted), in WEIGHTS_V1 order: the overview rows and catalog counts. */
export function catalogItemsOf(region:Region):MacroSeriesDef[]{
 return Object.keys(WEIGHTS_V1).map(id=>catalogById(id)).filter((d):d is MacroSeriesDef=>d!==undefined&&d.region===region);
}
/** Build from database reads while keeping the selection rules in regime-selection. */
export async function buildRegimeInput(db:MacroDb,region:Region,opts:{asOf?:string;periodEndLte?:string}={}):Promise<BuiltRegimeInput>{
 return buildRegimeInputFromRows(region,opts,{latestEligible:db.latestEligible.bind(db),eligibleHistory:db.eligibleHistory.bind(db),eligibleHistoryAsOf:db.eligibleHistoryAsOf.bind(db)});
}
/** verified = active items with ≥ 1 ok observation; missing = status missing + active without data; restricted. */
export async function catalogCounts(db:MacroDb,region:Region):Promise<CatalogCounts>{
 const items=catalogItemsOf(region);
 const active=items.filter(d=>d.status==='active');
 const seen=new Set((await db.latestEligible(active.map(d=>d.id))).map(r=>r.series_id));
 return {
  verified:active.filter(d=>seen.has(d.id)).length,
  missing:items.filter(d=>d.status==='missing').length+active.filter(d=>!seen.has(d.id)).length,
  restricted:items.filter(d=>d.status==='restricted').length,
 };
}
export type OnPublished=(snapshot:SnapshotRecord)=>Promise<void>;
/** Default judgment hook: F4 wires produce(macro_regime_v2, …) here later (F4 spec §11.1). */
export const noopOnPublished:OnPublished=async()=>{};
export interface PublishDeps{db:MacroDb;onPublished?:OnPublished;env?:Record<string,string|undefined>}
/** publishKey: 'cron:<batch>' | 'ingest:<batch>' (第 5 稿 P1-4); fence: the ingest run's batch + owner token (P1-3). */
export interface PublishOptions{publishKey?:string;fence?:{batchId:string;ownerToken:string|null;finishToken:string|null}}
export type PublishReceipt=
 |{status:'published';region:Region;snapshot_id:string;revision:number;observation_count:number;regime:'classified'|'null';uncovered_weight:number;attempts:number;hook:'skipped'|'ok'|'failed';replayed:boolean}
 |{status:'stale';region:Region;attempts:number}
 |{status:'failed';region:Region;reason:string;failed_snapshot_id:string|null;attempts:number};
async function runHook(deps:PublishDeps,env:Record<string,string|undefined>,snapshotId:string):Promise<'skipped'|'ok'|'failed'>{
 if(!macroJudgmentsEnabled(env))return 'skipped';
 try{
  const snap=await deps.db.snapshot(snapshotId);
  if(!snap)return 'failed';
  await (deps.onPublished??noopOnPublished)(snap);
  return 'ok';
 }catch(e){console.error('[macro-publish] judgment hook failed',e instanceof Error?e.message:e);return 'failed';}
}
const isFenced=(e:unknown)=>e instanceof MacroDbError&&e.code==='fenced';
/** Every outcome is a receipt, except `fenced` (a superseded ingest owner; 第 5 稿 P1-3), which is rethrown so the finish stops.
 *  `today` is the snapshot's as_of (YYYY-MM-DD). */
export async function publishRegion(deps:PublishDeps,region:Region,today:string,opts:PublishOptions={}):Promise<PublishReceipt>{
 const env=deps.env??process.env;
 let attempts=0;
 try{
  for(;;){
   attempts++;
   try{
    const state=await deps.db.publishState(region);
    const built=await buildRegimeInput(deps.db,region);
    const cls=classifyRegime(built.input);
    const counts=await catalogCounts(deps.db,region);
    const res=await deps.db.publishSnapshot({
     region,expectedRevision:state.revision,expectedInputRevision:state.inputRevision,asOf:today,
     methodologyVersion:METHODOLOGY_VERSION,catalogVersion:CATALOG_VERSION,observationIds:built.observations.map(o=>o.observation_id),historyIds:built.historyIds,
     catalogCounts:counts,regime:cls.regime,contributions:cls.contributions,rulesVersion:RULES_VERSION,uncoveredWeight:cls.uncoveredWeight,
     publishKey:opts.publishKey,batchId:opts.fence?.batchId,ownerToken:opts.fence?.ownerToken,finishToken:opts.fence?.finishToken,
    });
    if(res.replayed){
     // An earlier attempt published under this key (and ran or lost its hook; F4's produce is never re-triggered from a replay).
     // The receipt describes THAT snapshot from its persisted fields (第 6 稿 P2-2), not the inputs rebuilt above, which may differ.
     const snap=await deps.db.snapshot(res.snapshot_id);
     if(!snap)throw new MacroDbError('rpc_failed',`replayed_snapshot_missing:${res.snapshot_id}`);
     const stored=await deps.db.regimeOf(res.snapshot_id);                                             // admin read (service-only table)
     if(!stored)throw new MacroDbError('rpc_failed',`replayed_regime_missing:${res.snapshot_id}`);     // never invent uncovered_weight 0
     return {status:'published',region,snapshot_id:res.snapshot_id,revision:res.revision,observation_count:snap.observation_ids.length,
      regime:stored.regime?'classified':'null',uncovered_weight:stored.uncovered_weight,attempts,hook:'skipped',replayed:true};
    }
    const hook=await runHook(deps,env,res.snapshot_id);
    return {status:'published',region,snapshot_id:res.snapshot_id,revision:res.revision,observation_count:built.observations.length,
     regime:cls.regime?'classified':'null',uncovered_weight:cls.uncoveredWeight,attempts,hook,replayed:false};
   }catch(e){
    if(e instanceof MacroDbError&&e.code==='stale_publisher'){if(attempts<2)continue;return {status:'stale',region,attempts};}
    throw e;
   }
  }
 }catch(e){
  if(isFenced(e))throw e;                                                                             // protocol abort, not a failed publication
  const reason=(e instanceof MacroDbError?e.code:e instanceof Error?e.message:String(e)).slice(0,500);
  let failed:string|null=null;
  try{failed=await deps.db.recordFailedSnapshot({region,asOf:today,methodologyVersion:METHODOLOGY_VERSION,catalogVersion:CATALOG_VERSION,reason});}
  catch(e2){console.error('[macro-publish] recordFailedSnapshot failed',e2 instanceof Error?e2.message:e2);}
  return {status:'failed',region,reason,failed_snapshot_id:failed,attempts};
 }
}
