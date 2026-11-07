// src/lib/judgments/uuid-v8.test.ts
// F4 spec §2.4 item 5: uuidV8 is the four lines formerly inside ledger.ts judgmentId(), unchanged:
// RFC 9562 v8 layout, version nibble 8, variant from hex[16]. ledger.test.ts stays untouched.
import {describe,expect,it} from 'vitest';
import {judgmentId} from '../research/s4/ledger';
import {digest} from '../research/ingest/pa-v1/json.js';
import {uuidV8} from './uuid-v8';

describe('uuidV8',()=>{
 it('formats 64 hex characters as an RFC 9562 v8 uuid',()=>{
  expect(uuidV8('0'.repeat(64))).toBe('00000000-0000-8000-8000-000000000000');
  expect(uuidV8('f'.repeat(64))).toBe('ffffffff-ffff-8fff-bfff-ffffffffffff');
  expect(uuidV8('0123456789abcdef'.repeat(4))).toBe('01234567-89ab-8def-8123-456789abcdef');
 });
 it('gives ledger.judgmentId exactly the id it produced before the extraction',()=>{
  const key={snapshot_id:'a'.repeat(64),question_set_version:'qs/1',backend:'rule' as const,backend_model:'m',question_id:'q1'};
  expect(judgmentId(key)).toBe('8e7a59e6-ada7-8a6a-88de-27e55f2d6ab2');
  expect(uuidV8(digest(key))).toBe('8e7a59e6-ada7-8a6a-88de-27e55f2d6ab2');
 });
 it('refuses anything but 64 lowercase hex characters',()=>{
  for(const bad of ['','a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'g'.repeat(64)])expect(()=>uuidV8(bad)).toThrow('invalid_schema');
 });
});
