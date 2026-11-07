// src/lib/macro/strategy/hash.test.ts
// hash.ts (spec §4.4 N3, §4.5): the canonical JSON and SHA-256 behind every manifest_hash and explanation payload hash.
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';

describe('canonicalJson',()=>{
 it('sorts object keys by UTF-16 code unit, drops undefined members, keeps array order',()=>{
  expect(canonicalJson({b:1,a:[2,{d:undefined,c:'x'}],B:null})).toBe('{"B":null,"a":[2,{"c":"x"}],"b":1}');
  expect(canonicalJson([3,1,2])).toBe('[3,1,2]');
  expect(canonicalJson('é"')).toBe('"é\\""');
 });
 it('rejects non-finite numbers and unsupported values',()=>{
  expect(()=>canonicalJson({a:Number.NaN})).toThrow(/canonical_json_unsupported/);
  expect(()=>canonicalJson({a:Number.POSITIVE_INFINITY})).toThrow(/canonical_json_unsupported/);
  expect(()=>canonicalJson({a:()=>1})).toThrow('canonical_json_unsupported:function');
 });
 it('rejects sparse arrays, so a stored body (holes become null) always reproduces its hash',()=>{
  expect(()=>canonicalJson(Array(1))).toThrow('canonical_json_unsupported:sparse_array');
  expect(()=>canonicalJson({a:[1,,3]})).toThrow('canonical_json_unsupported:sparse_array');
  expect(()=>canonicalJson([undefined])).toThrow('canonical_json_unsupported:undefined');   // an undefined element would store as null
  const body={a:[1,null,3]};
  expect(sha256Hex(canonicalJson(JSON.parse(JSON.stringify(body))))).toBe(sha256Hex(canonicalJson(body)));
 });
});
describe('sha256Hex',()=>{
 it('matches the FIPS 180-4 test vector',()=>{
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Hex(canonicalJson({b:2,a:1}))).toBe(sha256Hex('{"a":1,"b":2}'));
 });
});
