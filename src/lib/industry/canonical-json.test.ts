// src/lib/industry/canonical-json.test.ts
import {describe,it,expect} from 'vitest';
import {canonicalJson,sha256Hex} from './canonical-json';

describe('canonicalJson',()=>{
 it('sorts keys at every depth, keeps array order, drops undefined members and leaves strings untouched',()=>{
  const a=canonicalJson({b:1,a:{d:[3,1,{z:'1.50',y:null}],c:'x'},u:undefined});
  const b=canonicalJson({a:{c:'x',d:[3,1,{y:null,z:'1.50'}]},b:1});
  expect(a).toBe(b);
  expect(a).toBe('{"a":{"c":"x","d":[3,1,{"y":null,"z":"1.50"}]},"b":1}');
  expect(canonicalJson(['b','a'])).toBe('["b","a"]');
  expect(canonicalJson({'é':1,e:2,E:3})).toBe('{"E":3,"e":2,"é":1}');
  expect(canonicalJson({q:'line\n"quoted"'})).toBe('{"q":"line\\n\\"quoted\\""}');
  expect(canonicalJson(-0)).toBe('0');
 });
 it('accepts only safe integers as numbers and only plain objects',()=>{
  expect(()=>canonicalJson({v:0.8})).toThrow('canonical_json_number:$.v');
  expect(()=>canonicalJson([Number.NaN])).toThrow('canonical_json_number');
  expect(()=>canonicalJson(2**60)).toThrow('canonical_json_number');
  expect(()=>canonicalJson({d:new Date(0)})).toThrow('canonical_json_type:$.d');
  expect(()=>canonicalJson([undefined])).toThrow('canonical_json_type');
  expect(()=>canonicalJson(1n)).toThrow('canonical_json_type');
  expect(canonicalJson(Object.assign(Object.create(null),{b:true,a:false}))).toBe('{"a":false,"b":true}');
 });
 it('sha256Hex is lower-case hex of the UTF-8 bytes',()=>{
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
 });
});
