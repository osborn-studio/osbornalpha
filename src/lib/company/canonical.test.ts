// src/lib/company/canonical.test.ts
// canonicalJson / eventIdOf / payloadHashOf (plan Task 2, spec §4.6 ⑤): code-point key order, JSON.stringify
// string escaping, safe integers only, fixed vectors. SQL equality is asserted in company-research.integration.test.ts.
import {describe,expect,it} from 'vitest';
import {CanonicalJsonError,canonicalJson,compareCodePoints,eventIdOf,payloadHashOf,sha256Utf8} from './canonical';

describe('canonicalJson',()=>{
 it('sorts keys by code point, not by UTF-16 unit, and emits no whitespace',()=>{
  expect(canonicalJson({'�':1,'😀':2,'é':3,Z:4,a:5})).toBe('{"Z":4,"a":5,"é":3,"�":1,"😀":2}');
  expect(['😀','�'].sort()).toEqual(['😀','�']);                       // what default sort would do
  expect(['😀','�'].sort(compareCodePoints)).toEqual(['�','😀']);
  expect(canonicalJson({b:[1,{d:null,c:true}],a:{}})).toBe('{"a":{},"b":[1,{"c":true,"d":null}]}');
  expect(canonicalJson([])).toBe('[]');
 });
 it('escapes strings exactly like JSON.stringify (control chars lowercase \\u00xx; DEL, U+2028, "/" and non-ASCII raw)',()=>{
  const s='\u0001\u001f\u007f  é中😀"\\/\t\n\r\b\f';
  expect(canonicalJson({k:s})).toBe(`{"k":${JSON.stringify(s)}}`);
  expect(canonicalJson('\u001f')).toBe('"\\u001f"');
  expect(canonicalJson(' ')).toBe('" "');
 });
 it('accepts safe integers only; -0 is 0',()=>{
  expect(canonicalJson([0,-5,9007199254740991,-0])).toBe('[0,-5,9007199254740991,0]');
  for(const bad of [1.5,9007199254740992,Number.NaN,Number.POSITIVE_INFINITY])expect(()=>canonicalJson({x:bad})).toThrow(CanonicalJsonError);
 });
 it('omits undefined object values, refuses undefined array items, NUL, lone surrogates and non-plain objects',()=>{
  expect(canonicalJson({a:1,b:undefined})).toBe('{"a":1}');
  expect(()=>canonicalJson([undefined])).toThrow(CanonicalJsonError);
  expect(()=>canonicalJson('a\u0000b')).toThrow(CanonicalJsonError);
  expect(()=>canonicalJson({['\uD800']:1})).toThrow(CanonicalJsonError);
  expect(()=>canonicalJson('\uDC00x')).toThrow(CanonicalJsonError);
  expect(()=>canonicalJson(new Date(0))).toThrow(CanonicalJsonError);
  expect(()=>canonicalJson(1n)).toThrow(CanonicalJsonError);
 });
});

describe('event identities',()=>{
 it('eventIdOf hashes {issuer_id, market, kind, natural_key} with a lowercased issuer id (fixed vector)',()=>{
  const id=eventIdOf('11111111-1111-1111-1111-111111111111','US','filing_published','22222222-2222-2222-2222-222222222222');
  expect(id).toBe('17bf2678b623075b5467bd3e658c9769d6c2a606e50d53a3c366702c10e36860');
  expect(eventIdOf('11111111-1111-1111-1111-111111111111'.toUpperCase(),'US','filing_published','22222222-2222-2222-2222-222222222222')).toBe(id);
 });
 it('payloadHashOf is sha256 of the canonical payload (fixed vector)',()=>{
  const p={sourceRef:'0000320193-24-000123',formType:'10-K',factCount:3,fiscalYear:2024,fiscalPeriod:'FY',periodEnd:'2024-09-28',availableDate:'2024-11-01'};
  expect(canonicalJson(p)).toBe('{"availableDate":"2024-11-01","factCount":3,"fiscalPeriod":"FY","fiscalYear":2024,"formType":"10-K","periodEnd":"2024-09-28","sourceRef":"0000320193-24-000123"}');
  expect(payloadHashOf(p)).toBe('522bc8148259634c445138973c3ad81ad88d42ae6581306838453f67b55b28c6');
  expect(sha256Utf8('é')).toBe(sha256Utf8(Buffer.from([0xc3,0xa9]).toString('utf8')));
 });
});
