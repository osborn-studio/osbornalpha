// src/lib/dq/reconcile/inputs-hash.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {computeInputsHash} from './inputs-hash';

const base={left_raw_hash:'aa',right_sha256:'bb',gold_or_sample_sha256:'cc',parser_version:'ixbrl/1'};
describe('computeInputsHash (spec §5.6)',()=>{
 it('is sha256 hex of the four fields joined by \\n in the fixed order',()=>{
  expect(computeInputsHash(base)).toBe(createHash('sha256').update('aa\nbb\ncc\nixbrl/1').digest('hex'));
 });
 it('changes when any one input changes, and when two inputs swap',()=>{
  const h=computeInputsHash(base);
  for(const k of Object.keys(base) as (keyof typeof base)[])expect(computeInputsHash({...base,[k]:`${base[k]}x`}),k).not.toBe(h);
  expect(computeInputsHash({...base,left_raw_hash:'bb',right_sha256:'aa'})).not.toBe(h);
 });
 it('rejects a field containing a newline (the separator) or a non-string',()=>{
  expect(()=>computeInputsHash({...base,right_sha256:'b\nb'})).toThrow('invalid_inputs:right_sha256');
  expect(()=>computeInputsHash({...base,parser_version:undefined as unknown as string})).toThrow('invalid_inputs:parser_version');
 });
 it('accepts empty strings (a side that does not exist)',()=>{
  expect(computeInputsHash({...base,left_raw_hash:''})).toMatch(/^[0-9a-f]{64}$/);
 });
});
