// Bounded process singleflight plus Next Data Cache for strategy fact views only.
// Per-process, bounded strategy view memo. Each Vercel instance owns its own entries; publish and input revisions invalidate them.
// Snapshot rows are immutable except active→superseded status. Republish inserts a new snapshot id at revision+1 and bumps publish revision; every observation write bumps input_revision. Catalog version is content-addressed and code version is the deploy sha. Snapshot (id, revision, created_at), publish state, catalog and code therefore identify all fact-manifest inputs; a write during a build changes the key before another reader can see its result.
// clear() is a test/administrative reset: an in-flight build still returns its value to callers but is not stored.
import {unstable_cache} from 'next/cache';
import type {ManifestKind,SnapshotRecord} from './contract';
import {canonicalJson} from './hash';
import type {StrategyReadPort} from './port';

export const MEMO_MAX_ENTRIES=32;
type PublishState={revision:number;input_revision:number}|null;
export interface MemoState{snapshots:{US:SnapshotRecord|null;CN:SnapshotRecord|null};state:{US:PublishState;CN:PublishState};catalog_version:string}
export async function readMemoState(port:StrategyReadPort):Promise<MemoState>{
 const [US,CN,usState,cnState]=await Promise.all([port.activeSnapshot('US'),port.activeSnapshot('CN'),port.publishState('US'),port.publishState('CN')]);
 return {snapshots:{US,CN},state:{US:usState,CN:cnState},catalog_version:port.catalogVersion()};
}
export function memoKey(a:{kind:ManifestKind;params:Record<string,string|number>;state:MemoState;codeVersion:string}):string{
 const snap=(s:SnapshotRecord|null)=>s?{snapshot_id:s.snapshot_id,revision:s.revision,created_at:s.created_at}:null;
 return canonicalJson({kind:a.kind,params:a.params,US:snap(a.state.snapshots.US),CN:snap(a.state.snapshots.CN),state:a.state.state,catalog_version:a.state.catalog_version,code_version:a.codeVersion});
}
export type MemoOutcome='hit'|'miss'|'coalesced';
// Each canonical key has one route-owned value shape; callers supply that shape at the typed boundary.
const memoValue=<T>(value:unknown):T=>value as T;
export class StrategyMemo<V>{
 private entries=new Map<string,V>();private pending=new Map<string,Promise<unknown>>();private hits=0;private misses=0;private generation=0;
 get(key:string):V|undefined{if(!this.entries.has(key)){this.misses++;return undefined;}const v=this.entries.get(key)!;this.entries.delete(key);this.entries.set(key,v);this.hits++;return v;}
 set(key:string,value:V):void{this.entries.delete(key);this.entries.set(key,value);if(this.entries.size>MEMO_MAX_ENTRIES)this.entries.delete(this.entries.keys().next().value!);}
 async getOrCompute<T extends V=V>(key:string,compute:()=>Promise<T>):Promise<{value:T;outcome:MemoOutcome}>{
  const cached=this.get(key);if(cached!==undefined)return {value:memoValue<T>(cached),outcome:'hit'};
  const existing=this.pending.get(key);if(existing)return {value:memoValue<T>(await existing),outcome:'coalesced'};
  const generation=this.generation,task=Promise.resolve().then(compute);this.pending.set(key,task);
  try{const value=await task;if(this.generation===generation)this.set(key,value);return {value,outcome:'miss'};}
  finally{if(this.pending.get(key)===task)this.pending.delete(key);}
 }
 delete(key:string):void{this.entries.delete(key);}
 clear():void{this.generation++;this.entries.clear();this.pending.clear();this.hits=0;this.misses=0;}
 stats(){return {size:this.entries.size,hits:this.hits,misses:this.misses};}
}
export const strategyMemo=new StrategyMemo<unknown>();

export const FACT_VIEW_SCHEMA='macro-strategy-fact-view/1';
export const FACT_VIEW_TTL_SECONDS=300;
/** Both regions affect histories, including a region with no active snapshot. Missing revision
 * rows cannot prove freshness, so fail closed for BOTH cache layers. Read this state per request. */
export function canCacheFacts(state:MemoState):boolean{
 const valid=(s:PublishState)=>s!=null&&Number.isSafeInteger(s.revision)&&s.revision>=0&&Number.isSafeInteger(s.input_revision)&&s.input_revision>=0;
 return (state.snapshots.US!==null||state.snapshots.CN!==null)&&valid(state.state.US)&&valid(state.state.CN);
}
type FactEnvelope<T>={expiresAt:number;value:T};
/** Auth/flags and readMemoState MUST run before this helper. compute may only build small,
 * JSON fact views after putManifest succeeds; never capture a session, cookies, headers,
 * judgments, explanations or quota. The full existing memo identity is schema-namespaced.
 * Next 15 serves stale entries during revalidation: enforce absolute expiry ourselves too.
 * Keep the process singleflight around shared lookup/build; rejected promises never fill it.
 */
export async function factView<T extends {manifest_id:string}>(key:string,state:MemoState,compute:()=>Promise<T>,memo:StrategyMemo<unknown>=strategyMemo):Promise<{value:T;outcome:MemoOutcome}>{
 if(!canCacheFacts(state))return {value:await compute(),outcome:'miss'};
 const identity=canonicalJson({schema:FACT_VIEW_SCHEMA,memoKey:key});
 const build=async():Promise<FactEnvelope<T>>=>{
  const started=Date.now(),value=await compute();
  if(!value.manifest_id)throw new Error('fact_view_manifest_missing');
  return {expiresAt:started+FACT_VIEW_TTL_SECONDS*1000,value};
 };
 const load=async()=>{
  const cached=await unstable_cache(build,[identity],{revalidate:FACT_VIEW_TTL_SECONDS})();
  // Do not serve stale data even if Next background refresh fails. Errors propagate and retry.
  return cached.expiresAt>Date.now()?cached:await build();
 };
 let result=await memo.getOrCompute(identity,load);
 if(result.value.expiresAt<=Date.now()){
  memo.delete(identity);result=await memo.getOrCompute(identity,load);
 }
 return {value:result.value.value,outcome:result.outcome};
}
