// src/lib/broker-research/hash.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';

describe('canonicalJson',()=>{
 it('sorts keys by UTF-16 code unit, keeps array order, has no whitespace, writes numbers as decimal strings',()=>{
  expect(canonicalJson({b:1,a:[3,'x',null,true],'é':{z:false,y:0.5}})).toBe('{"a":["3","x",null,true],"b":"1","é":{"y":"0.5","z":false}}');
  expect(canonicalJson({B:1,a:1,_:1})).toBe('{"B":"1","_":"1","a":"1"}');
  expect(canonicalJson(['a','é'])).toBe(JSON.stringify(['a','é']));          // behavior.ts hashes JSON.stringify of a string array (B1)
 });
 it('drops undefined object keys, maps undefined array items to null, rejects non-finite numbers and functions',()=>{
  expect(canonicalJson({a:undefined,b:[undefined]})).toBe('{"b":[null]}');
  expect(()=>canonicalJson({x:Number.NaN})).toThrow('canonical_json_non_finite');
  expect(()=>canonicalJson({f:()=>1})).toThrow('canonical_json_unsupported:function');
 });
 it('sha256Hex hashes the UTF-8 bytes',()=>{
  expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(sha256Hex('研报')).toBe(createHash('sha256').update(Buffer.from('研报','utf8')).digest('hex'));
 });
});
