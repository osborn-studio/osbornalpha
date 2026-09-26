import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {digest} from '../ingest/pa-v1/json.js';
import {judgmentId,snapshotId} from './ledger';

const snapshot=()=>({source_id:randomUUID(),source_version:'1',thesis_id:randomUUID(),thesis_version:'3',entity_table_version:'2026-09-25'});
const key={snapshot_id:'a'.repeat(64),question_set_version:'v1.0',backend:'jev' as const,backend_model:'jev-1.13.0',question_id:'Q1'};
const UUID_V8=/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('judgmentId',()=>{
 it('is deterministic and independent of key order',()=>{
  const reordered={question_id:key.question_id,backend_model:key.backend_model,backend:key.backend,question_set_version:key.question_set_version,snapshot_id:key.snapshot_id};
  expect(judgmentId(key)).toBe(judgmentId(reordered));
  expect(judgmentId(key)).toMatch(UUID_V8);
 });
 it('changes when any addressed field changes',()=>{
  const base=judgmentId(key);
  for(const patch of [{snapshot_id:'b'.repeat(64)},{question_set_version:'v1.1'},{backend:'rule' as const},{backend_model:'rules-2'},{question_id:'Q2'}])
   expect(judgmentId({...key,...patch})).not.toBe(base);
 });
 it('rejects empty or unknown-backend keys',()=>{
  expect(()=>judgmentId({...key,backend:'oracle' as any})).toThrow('invalid_schema');
  expect(()=>judgmentId({...key,question_id:''})).toThrow('invalid_schema');
  expect(()=>judgmentId({...key,snapshot_id:'not-a-hash'})).toThrow('invalid_schema');
 });
});

describe('snapshotId',()=>{
 it('is the canonical digest of the five snapshot fields',()=>{
  const s=snapshot();
  expect(snapshotId(s)).toBe(digest(s));
  expect(snapshotId({...s,extra:'ignored'} as any)).toBe(digest(s));
 });
 it('rejects missing fields and non-uuid ids',()=>{
  const s=snapshot();
  expect(()=>snapshotId({...s,source_id:'src-1'})).toThrow('invalid_schema');
  expect(()=>snapshotId({...s,thesis_version:''})).toThrow('invalid_schema');
  const {entity_table_version:_,...missing}=s;
  expect(()=>snapshotId(missing as any)).toThrow('invalid_schema');
 });
});
