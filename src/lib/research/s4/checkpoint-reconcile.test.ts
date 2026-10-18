import {describe,expect,it} from 'vitest';
import {reconcileCheckpoint,type CheckpointRef,type ReconcileInput} from './checkpoint-reconcile';

// ADR 2026-10-18 §4 recovery matrix: the independent registry is the only artefact that
// survives a rollback of both the database and the journal, and detection is scoped to
// the last confirmed checkpoint. Every disagreement pauses; nothing is auto-repaired.
const h=(c:string)=>c.repeat(64);
const registry:CheckpointRef={last_sequence:'40',last_hash:h('a'),generation:3},cache:CheckpointRef={last_sequence:'40',last_hash:h('a'),generation:3};
const base:ReconcileInput={
 manifestGeneration:3,
 registryGeneration:3,
 registry,
 cache,
 database:{last_anchored_sequence:'42',receipt_hash_at_registry_sequence:h('a'),generation:3},
};
describe('checkpoint reconciliation at runner start',()=>{
 it('is consistent when registry, cache and database agree, and resumes after the registry sequence',()=>{
  expect(reconcileCheckpoint(base)).toEqual({state:'consistent',confirmedThrough:'40',pendingFrom:'41'});
 });
 it('treats a fresh deployment with no registry row and no cache as consistent from sequence 1',()=>{
  expect(reconcileCheckpoint({...base,registry:null,cache:null,database:{last_anchored_sequence:null,receipt_hash_at_registry_sequence:null,generation:3}})).toEqual({state:'consistent',confirmedThrough:null,pendingFrom:'1'});
 });
 it('pauses when the registry is ahead of the database (database restored to an older copy)',()=>{
  expect(reconcileCheckpoint({...base,database:{...base.database,last_anchored_sequence:'39',receipt_hash_at_registry_sequence:null}})).toEqual({state:'paused',reason:'registry_ahead_of_database',confirmedThrough:'40'});
 });
 it('pauses when the registry is behind the cached checkpoint (registry restored to an older copy)',()=>{
  expect(reconcileCheckpoint({...base,registry:{...registry,last_sequence:'30',last_hash:h('b')}})).toEqual({state:'paused',reason:'registry_behind_cache',confirmedThrough:'30'});
  expect(reconcileCheckpoint({...base,registry:null})).toEqual({state:'paused',reason:'registry_behind_cache',confirmedThrough:null});
 });
 it('pauses when the database receipt at the registry sequence carries a different hash',()=>{
  expect(reconcileCheckpoint({...base,database:{...base.database,receipt_hash_at_registry_sequence:h('c')}})).toEqual({state:'paused',reason:'hash_mismatch',confirmedThrough:'40'});
  expect(reconcileCheckpoint({...base,cache:{...cache,last_hash:h('c')}})).toEqual({state:'paused',reason:'hash_mismatch',confirmedThrough:'40'});
 });
 it('pauses when the manifest, the registry identity or the database identity generations disagree, or a checkpoint row is from a later generation',()=>{
  for(const input of [
   {...base,manifestGeneration:2},
   {...base,registryGeneration:4},
   {...base,database:{...base.database,generation:4}},
   {...base,registry:{...registry,generation:4}},
   {...base,cache:{...cache,generation:4}},
  ])expect(reconcileCheckpoint(input)).toMatchObject({state:'paused',reason:'generation_mismatch'});
 });
 it('accepts checkpoint rows written under an earlier generation after a legitimate advance',()=>{
  expect(reconcileCheckpoint({...base,manifestGeneration:4,registryGeneration:4,database:{...base.database,generation:4},registry:{...registry,generation:2},cache:{...cache,generation:3}})).toEqual({state:'consistent',confirmedThrough:'40',pendingFrom:'41'});
 });
 it('allows the cache to lag the registry (cache write lost after registry confirm) and resumes from the registry',()=>{
  expect(reconcileCheckpoint({...base,cache:{...cache,last_sequence:'38',last_hash:h('d')}})).toEqual({state:'consistent',confirmedThrough:'40',pendingFrom:'41'});
 });
 it('rejects malformed sequences and hashes instead of guessing',()=>{
  expect(()=>reconcileCheckpoint({...base,registry:{...registry,last_sequence:'-1'}})).toThrow('invalid_schema');
  expect(()=>reconcileCheckpoint({...base,registry:{...registry,last_hash:'xyz'}})).toThrow('invalid_schema');
  expect(()=>reconcileCheckpoint({...base,database:{...base.database,last_anchored_sequence:'1e3'}})).toThrow('invalid_schema');
 });
});
