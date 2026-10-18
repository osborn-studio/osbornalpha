import {fail} from '../ingest/pa-v1/json.js';

/** A checkpoint reference as held by the independent registry, the Alpha cache, or the manifest. */
export interface CheckpointRef { last_sequence:string; last_hash:string; generation:number }
export interface ReconcileInput {
 manifestGeneration:number;
 /** Latest row in the independent registry for this owner, or null when it has none. */
 registry:CheckpointRef|null;
 /** `research_s4_anchor_checkpoints` row in the Alpha database, or null. */
 cache:CheckpointRef|null;
 database:{
  /** Highest acknowledged outbox sequence for the owner, or null when nothing is anchored. */
  last_anchored_sequence:string|null;
  /** Outbox `receipt_hash` at the registry's sequence, or null when that row is absent or unanchored. */
  receipt_hash_at_registry_sequence:string|null;
  /** `research_s4_runtime_identity.generation`. */
  generation:number;
 };
}
export type ReconcileResult=
 |{state:'consistent';confirmedThrough:string|null;pendingFrom:string}
 |{state:'paused';reason:'generation_mismatch'|'registry_ahead_of_database'|'registry_behind_cache'|'hash_mismatch';confirmedThrough:string|null};

const SEQUENCE=/^[1-9][0-9]{0,17}$/,HASH=/^[0-9a-f]{64}$/;
function sequence(value:string|null):bigint|null{
 if(value===null)return null;
 if(typeof value!=='string'||!SEQUENCE.test(value))fail('invalid_schema');
 return BigInt(value);
}
function hash(value:string|null):string|null{
 if(value===null)return null;
 if(typeof value!=='string'||!HASH.test(value))fail('invalid_schema');
 return value;
}
function generation(value:number):number{
 if(!Number.isSafeInteger(value)||value<1)fail('invalid_schema');
 return value;
}
function ref(value:CheckpointRef|null){
 if(value===null)return null;
 return {sequence:sequence(value.last_sequence)!,hash:hash(value.last_hash)!,generation:generation(value.generation)};
}

/** Start-of-run reconciliation (ADR 2026-10-18 §4, 02 §3 recovery states). Pure: the caller
 * supplies the three views and acts on the verdict. Detection is scoped to the last confirmed
 * checkpoint; tails never confirmed in the registry are, by construction, still pending. */
export function reconcileCheckpoint(input:ReconcileInput):ReconcileResult{
 const manifest=generation(input.manifestGeneration),registry=ref(input.registry),cache=ref(input.cache);
 const dbGeneration=generation(input.database.generation),anchored=sequence(input.database.last_anchored_sequence),dbHash=hash(input.database.receipt_hash_at_registry_sequence);
 const generations=[manifest,dbGeneration,...(registry?[registry.generation]:[]),...(cache?[cache.generation]:[])];
 const confirmedThrough=registry?registry.sequence.toString():null;
 if(generations.some(g=>g!==manifest))return {state:'paused',reason:'generation_mismatch',confirmedThrough};
 if(!registry){
  if(cache)return {state:'paused',reason:'registry_behind_cache',confirmedThrough:null};
  return {state:'consistent',confirmedThrough:null,pendingFrom:'1'};
 }
 if(cache&&registry.sequence<cache.sequence)return {state:'paused',reason:'registry_behind_cache',confirmedThrough};
 if(anchored===null||registry.sequence>anchored)return {state:'paused',reason:'registry_ahead_of_database',confirmedThrough};
 if(dbHash!==registry.hash)return {state:'paused',reason:'hash_mismatch',confirmedThrough};
 if(cache&&cache.sequence===registry.sequence&&cache.hash!==registry.hash)return {state:'paused',reason:'hash_mismatch',confirmedThrough};
 return {state:'consistent',confirmedThrough,pendingFrom:(registry.sequence+1n).toString()};
}
