// src/lib/facts/json-numbers.test.ts
import {describe,it,expect} from 'vitest';
import {scanJsonNumbers,canonicalDecimal,decimalEquals,decodeWithSchema,decodeColumns,isNumToken,EDGAR_NUMBER_SCHEMA,TUSHARE_CONTROL_FIELDS} from './json-numbers';

describe('scanJsonNumbers',()=>{
 it('wraps numeric literals outside strings and keeps strings, booleans and null intact',()=>{
  const out=scanJsonNumbers('{"a":12345678901234567890,"b":-1.50e+3,"s":"x 1e5 \\" 7","t":true,"n":null,"arr":[0,1.25,"2"]}') as Record<string,unknown>;
  expect(out.a).toEqual({__num:'12345678901234567890'});
  expect(out.b).toEqual({__num:'-1.50e+3'});
  expect(out.s).toBe('x 1e5 " 7');
  expect(out.t).toBe(true);expect(out.n).toBeNull();
  expect(out.arr).toEqual([{__num:'0'},{__num:'1.25'},'2']);
  expect(isNumToken(out.a)).toBe(true);expect(isNumToken({__num:'1',x:1})).toBe(false);
 });
 it('fails closed on the reserved marker key, also escaped, and on leading zeros',()=>{
  expect(()=>scanJsonNumbers('{"val":{"__num":"123"}}')).toThrow('reserved_key');
  expect(()=>scanJsonNumbers('{"val":{"\\u005f_num":"123"}}')).toThrow('reserved_key');
  expect(()=>scanJsonNumbers('{"a":01}')).toThrow();
  expect(()=>scanJsonNumbers('{"a":-01}')).toThrow();
  expect(scanJsonNumbers('{"a":0.5,"b":-0,"c":10}')).toEqual({a:{__num:'0.5'},b:{__num:'-0'},c:{__num:'10'}});
 });
 it('rejects the marker only as a key, not as a string value',()=>{
  expect(scanJsonNumbers('{"label":"__num","val":1}')).toEqual({label:'__num',val:{__num:'1'}});
  expect(scanJsonNumbers('["__num",{"k":"\\u005f_num"}, 2]')).toEqual(['__num',{k:'__num'},{__num:'2'}]);
  expect(()=>scanJsonNumbers('{ "__num"\n : 1}')).toThrow('reserved_key');
  expect(()=>scanJsonNumbers('[{"\\u005f_num":1}]')).toThrow('reserved_key');
 });
 it('fails fast on malformed input and handles escapes, whitespace and nesting',()=>{
  const bad='{"a":"'+'\\"'.repeat(40000);
  const t0=performance.now();expect(()=>scanJsonNumbers(bad)).toThrow();expect(performance.now()-t0).toBeLessThan(200);
  expect(scanJsonNumbers('["a\\\\",5]')).toEqual(['a\\',{__num:'5'}]);
  expect(scanJsonNumbers(' {\n "a" :\t [ [1, [2.5]] , [] ]\r\n} ')).toEqual({a:[[{__num:'1'},[{__num:'2.5'}]],[]]});
 });
 it('accepts bytes (utf-8) and rejects invalid JSON or invalid utf-8',()=>{
  expect(scanJsonNumbers(new TextEncoder().encode('{"val":1e5,"name":"贵州茅台"}'))).toEqual({val:{__num:'1e5'},name:'贵州茅台'});
  expect(()=>scanJsonNumbers('{"a":}')).toThrow();
  expect(()=>scanJsonNumbers(new Uint8Array([0x7b,0xff,0x7d]))).toThrow();
 });
});

describe('canonicalDecimal',()=>{
 it('keeps 20-digit integers exactly and treats 1e5 and 100000 as equal',()=>{
  expect(canonicalDecimal('12345678901234567890')).toBe('12345678901234567890');
  expect(canonicalDecimal('1e5')).toBe('100000');
  expect(decimalEquals('1e5','100000')).toBe(true);
  expect(decimalEquals('1E5','100000.000')).toBe(true);
  expect(decimalEquals('383285000000','383285000001')).toBe(false);
 });
 it('removes exponents, trailing zeros, leading zeros and negative zero',()=>{
  expect(canonicalDecimal('-1.50e+3')).toBe('-1500');
  expect(canonicalDecimal('1.500')).toBe('1.5');
  expect(canonicalDecimal('000.25')).toBe('0.25');
  expect(canonicalDecimal('0.000123e3')).toBe('0.123');
  expect(canonicalDecimal('123.456e-2')).toBe('1.23456');
  expect(canonicalDecimal('5e-3')).toBe('0.005');
  expect(canonicalDecimal('-0')).toBe('0');expect(canonicalDecimal('-0.000')).toBe('0');expect(canonicalDecimal('0e9')).toBe('0');
  expect(canonicalDecimal('2.5')).toBe('2.5');expect(canonicalDecimal('-7')).toBe('-7');
 });
 it('rejects over-long literals quickly',()=>{
  const t0=performance.now();
  expect(()=>canonicalDecimal('1'.repeat(1_000_000))).toThrow('invalid_decimal:length');
  expect(()=>canonicalDecimal('0.'+'0'.repeat(300))).toThrow('invalid_decimal:length');
  expect(performance.now()-t0).toBeLessThan(200);
  expect(canonicalDecimal('1.'+'0'.repeat(200))).toBe('1');
 });
 it('rejects non-decimal text and absurd exponents',()=>{
  for(const bad of ['','abc','1.','.5','1e','0x10','NaN','Infinity',' 1','1e1001'])expect(()=>canonicalDecimal(bad)).toThrow('invalid_decimal');
 });
});

describe('decodeWithSchema',()=>{
 it('decodes control fields as integers, decimal fields as canonical strings, others as numbers',()=>{
  const scanned=scanJsonNumbers('{"cik":320193,"fy":2023,"facts":{"us-gaap":{"Revenues":{"units":{"USD":[{"val":383285000000,"fy":2023,"frame":"CY2023","start":"2022-10-01","end":"2023-09-30"},{"val":1e5,"fp":"FY"}]}}}},"other":1.5}');
  const out=decodeWithSchema(scanned,EDGAR_NUMBER_SCHEMA) as {cik:number;fy:number;facts:{'us-gaap':{Revenues:{units:{USD:{val:string;fy?:number}[]}}}};other:number};
  expect(out.cik).toBe(320193);expect(typeof out.cik).toBe('number');
  expect(out.fy).toBe(2023);
  const entries=out.facts['us-gaap'].Revenues.units.USD;
  expect(entries[0].val).toBe('383285000000');expect(typeof entries[0].val).toBe('string');
  expect(entries[0].fy).toBe(2023);
  expect(entries[1].val).toBe('100000');
  expect(out.other).toBe(1.5);
 });
 it('fails loudly when a control field is not an integer',()=>{
  expect(()=>decodeWithSchema(scanJsonNumbers('{"cik":"320193"}'),EDGAR_NUMBER_SCHEMA)).not.toThrow();
  expect(()=>decodeWithSchema(scanJsonNumbers('{"fy":2023.5}'),EDGAR_NUMBER_SCHEMA)).toThrow('invalid_control_field:fy');
 });
 it('validates control fields on the exact decimal text before Number()',()=>{
  for(const bad of ['1.00000000000000001','1e-400','9007199254740993','1.5'])expect(()=>decodeWithSchema(scanJsonNumbers(`{"fy":${bad}}`),EDGAR_NUMBER_SCHEMA)).toThrow('invalid_control_field:fy');
  expect(decodeWithSchema(scanJsonNumbers('{"fy":2023.0}'),EDGAR_NUMBER_SCHEMA)).toEqual({fy:2023});
 });
 it('keeps __proto__ as an own data property',()=>{
  const out=decodeWithSchema(scanJsonNumbers('{"__proto__":{"polluted":1},"a":1}'),EDGAR_NUMBER_SCHEMA) as Record<string,unknown>;
  expect(Object.keys(out)).toEqual(['__proto__','a']);
  expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  expect((out as {polluted?:unknown}).polluted).toBeUndefined();
  expect(Object.getOwnPropertyDescriptor(out,'__proto__')?.value).toEqual({polluted:1});
  expect(({} as {polluted?:unknown}).polluted).toBeUndefined();
  const rows=decodeColumns(['__proto__','a'],[[1,2]],{control:[],decimal:[]});
  expect(Object.keys(rows[0])).toEqual(['__proto__','a']);expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
 });
 it('decodes positional Tushare rows by column name',()=>{
  const schema={control:TUSHARE_CONTROL_FIELDS,decimal:['total_revenue','basic_eps']};
  const scanned=scanJsonNumbers('{"code":0,"data":{"fields":["ts_code","end_date","report_type","total_revenue","basic_eps"],"items":[["600519.SH","20231231",1,150560000000.00,38.1000]],"has_more":false}}') as {code:unknown;data:{fields:string[];items:unknown[][];has_more:boolean}};
  expect(decodeWithSchema(scanned.code,schema,'code')).toBe(0);
  expect(decodeColumns(scanned.data.fields,scanned.data.items,schema)).toEqual([{ts_code:'600519.SH',end_date:'20231231',report_type:1,total_revenue:'150560000000',basic_eps:'38.1'}]);
  expect(()=>decodeColumns(['a'],[[1,2]],schema)).toThrow('invalid_row_width');
 });
});
