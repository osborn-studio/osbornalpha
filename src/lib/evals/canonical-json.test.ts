// src/lib/evals/canonical-json.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {canonicalJson,projectionHash,sha256Hex} from './canonical-json';

describe('canonicalJson',()=>{
 it('sorts keys at every depth, drops undefined members and writes no whitespace',()=>{
  expect(canonicalJson({b:1,a:{d:[1,{z:true,y:null}],c:'x'},u:undefined})).toBe('{"a":{"c":"x","d":[1,{"y":null,"z":true}]},"b":1}');
 });
 it('is independent of key insertion order',()=>{
  expect(canonicalJson({x:'1',y:'2'})).toBe(canonicalJson({y:'2',x:'1'}));
 });
 it('escapes strings and keys exactly like JSON.stringify and sorts keys by code unit',()=>{
  expect(canonicalJson({'é':'"\n','B':'a','a':' '})).toBe(`{"B":"a","a":${JSON.stringify(' ')},"é":${JSON.stringify('"\n')}}`);
 });
 it('keeps decimal strings verbatim (never converts to number)',()=>{
  expect(canonicalJson({v:'12345678901234567890.123456789012345678'})).toBe('{"v":"12345678901234567890.123456789012345678"}');
 });
 it('rejects non-finite numbers, undefined in arrays and non-plain objects',()=>{
  expect(()=>canonicalJson({n:Number.NaN})).toThrow(RangeError);
  expect(()=>canonicalJson({n:Infinity})).toThrow(RangeError);
  expect(()=>canonicalJson([1,undefined])).toThrow(TypeError);
  expect(()=>canonicalJson({d:new Date(0)})).toThrow(TypeError);
  expect(()=>canonicalJson(new Map())).toThrow(TypeError);
  expect(()=>canonicalJson({b:10n})).toThrow(TypeError);
 });
 it('accepts null-prototype objects',()=>{
  const o=Object.create(null) as Record<string,unknown>;o.b='2';o.a='1';
  expect(canonicalJson(o)).toBe('{"a":"1","b":"2"}');
 });
});

describe('sha256Hex / projectionHash',()=>{
 it('hashes strings as UTF-8 and bytes as given',()=>{
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
 });
 it('projectionHash = sha256Hex(canonicalJson(projection))',()=>{
  const p={module:'facts' as const,rows:[{concept:'revenue',value_text:'1'}]};
  expect(projectionHash(p)).toBe(createHash('sha256').update('{"module":"facts","rows":[{"concept":"revenue","value_text":"1"}]}').digest('hex'));
  expect(projectionHash({rows:[{value_text:'1',concept:'revenue'}],module:'facts'})).toBe(projectionHash(p));
 });
});
