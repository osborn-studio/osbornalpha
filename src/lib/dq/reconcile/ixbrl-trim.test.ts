// src/lib/dq/reconcile/ixbrl-trim.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {IxbrlParseError,parseInlineXbrl} from './ixbrl';
import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from './ixbrl-trim';

const AAPL=readFileSync(new URL('../fixtures/ixbrl/aapl-10k-2023.handtrim.htm',import.meta.url),'utf8');

describe('trimInlineXbrl (reproducible fixture trimming)',()=>{
 it('keeps every catalogue fact with its contexts and units: the trimmed document parses to the same facts and dei texts',()=>{
  const t=trimInlineXbrl(AAPL,{keep:factConceptKeep});
  expect(IXBRL_TRIM_VERSION).toBe('ixbrl-trim/1');
  expect(t).toMatchObject({facts:14,contexts:5,units:3});   // 11 nonFraction + 3 dei nonNumeric; c-6 (iPhone segment) dropped
  const a=parseInlineXbrl(AAPL),b=parseInlineXbrl(t.html);
  expect(b.facts).toEqual(a.facts);expect(b.nonNumeric).toEqual(a.nonNumeric);expect(b.unsupported).toEqual([]);
  expect(t.html).not.toContain('IPhoneMember');
  expect(t.html.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<!-- ixbrl-trim/1: 14 facts -->\n<html xmlns="http://www.w3.org/1999/xhtml"')).toBe(true);
 });
 it('is deterministic and idempotent',()=>{
  const once=trimInlineXbrl(AAPL,{keep:factConceptKeep}).html;
  expect(trimInlineXbrl(AAPL,{keep:factConceptKeep}).html).toBe(once);
  expect(trimInlineXbrl(once,{keep:factConceptKeep}).html).toBe(once);
 });
 it('keeps only what `keep` selects, with just the referenced context and unit',()=>{
  const t=trimInlineXbrl(AAPL,{keep:n=>n==='us-gaap:Assets'});
  expect(t).toMatchObject({facts:1,contexts:1,units:1});
  expect(parseInlineXbrl(t.html).facts.map(f=>[f.name,f.value])).toEqual([['us-gaap:Assets','352583000000']]);
 });
 it('dropDimensional:false keeps the segment fact and its context',()=>{
  const t=trimInlineXbrl(AAPL,{keep:factConceptKeep,dropDimensional:false});
  expect(t).toMatchObject({facts:15,contexts:6});
  expect(t.html).toContain('IPhoneMember');
 });
 it('refuses a document that is not inline XBRL',()=>{
  expect(()=>trimInlineXbrl('<html><body><p>x</p></body></html>',{keep:factConceptKeep})).toThrow(IxbrlParseError);
 });
});
