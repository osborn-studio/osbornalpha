// src/lib/evidence/hash.test.ts
import {describe,expect,it} from 'vitest';
import * as evidence from './hash';
import * as macro from '@/lib/macro/strategy/hash';
describe('evidence hash',()=>{
 it('is the same function object the macro module exports',()=>{
  expect(macro.canonicalJson).toBe(evidence.canonicalJson);expect(macro.sha256Hex).toBe(evidence.sha256Hex);
 });
 it('sorts keys, drops undefined and keeps array order',()=>{
  expect(evidence.canonicalJson({b:1,a:[2,{d:undefined,c:'x'}]})).toBe('{"a":[2,{"c":"x"}],"b":1}');
 });
 it('hashes UTF-8 text',()=>{expect(evidence.sha256Hex('专题')).toBe('395f735c3a5da93487c71d74101ebde1dcaf186562c0a59e50df5a4106b99103');});
});
