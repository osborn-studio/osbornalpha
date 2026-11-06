// src/lib/dq/reconcile/ixbrl-trim.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {IxbrlParseError,parseInlineXbrl} from './ixbrl';
import {IXBRL_TRIM_VERSION,TrimError,equivalence,factConceptKeep,trimInlineXbrl} from './ixbrl-trim';

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

 describe('safety net and structure edge cases',()=>{
  const ROOT='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217">';
  const CTX=(id:string,extra='')=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>${extra}</xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period></xbrli:context>`;
  const USD='<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
  const ROOT_US=ROOT.replace('>',' xmlns:us-gaap="http://fasb.org/us-gaap/2023">');
  const mk=(res:string,body:string)=>`<?xml version="1.0"?>\n${ROOT_US}<head/><body><div><ix:header><ix:resources>${res}</ix:resources></ix:header></div>${body}</body></html>`;
  const NF=(n:string,v:string,ctx='c1')=>`<ix:nonFraction name="${n}" contextRef="${ctx}" unitRef="usd" decimals="0">${v}</ix:nonFraction>`;
  const keepAssets=(n:string)=>n==='us-gaap:Assets'||n==='us-gaap:Liabilities';
  it('re-declares namespaces bound on an ancestor (body) for facts, contexts and QName measures',()=>{
   const doc=`<?xml version="1.0"?>\n${ROOT}<head/><body xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:cur="http://www.xbrl.org/2003/iso4217"><ix:header><ix:resources>${CTX('c1')}<xbrli:unit id="usd"><xbrli:measure>cur:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${NF('us-gaap:Assets','5')}</body></html>`;
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   const p=parseInlineXbrl(t.html);
   expect(p.facts.map(f=>[f.name,f.value,f.unit])).toEqual([['us-gaap:Assets','5','USD']]);
   expect(t.html).toContain('xmlns:cur=');
  });
  it('refuses a selected tuple member instead of promoting it',()=>{
   const doc=mk(CTX('c1')+USD,`<ix:tuple name="us-gaap:T" tupleID="t1">${NF('us-gaap:Assets','5')}</ix:tuple>`);
   expect(()=>trimInlineXbrl(doc,{keep:keepAssets})).toThrow(TrimError);
   expect(()=>trimInlineXbrl(doc,{keep:keepAssets})).toThrow(/trim_tuple_member/);
  });
  it('keeps duplicate context ids so the facts stay unsupported, as in the source',()=>{
   const doc=mk(CTX('c1')+CTX('c1')+USD,NF('us-gaap:Assets','5'));
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t.contexts).toBe(2);
   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['context_duplicate']);
  });
  it('keeps duplicate unit ids',()=>{
   const doc=mk(CTX('c1')+USD+USD,NF('us-gaap:Assets','5'));
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t.units).toBe(2);
   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['unit']);
  });
  it('keeps a selected fact nested inside an unselected one and the contexts of every fact in a kept slice',()=>{
   const inner=NF('us-gaap:Liabilities','7','c2');
   const doc=mk(CTX('c1')+CTX('c2')+CTX('c3')+USD,`<ix:nonNumeric name="us-gaap:Other" contextRef="c3">x ${inner}</ix:nonNumeric>`);
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t).toMatchObject({facts:1,contexts:1});
   expect(parseInlineXbrl(t.html).facts.map(f=>f.name)).toEqual(['us-gaap:Liabilities']);
   // selected outer with an unselected nested fact: the nested fact's context travels with the slice
   const doc2=mk(CTX('c1')+CTX('c2')+USD,`<ix:nonNumeric name="us-gaap:Assets" contextRef="c1">y <ix:nonFraction name="us-gaap:Other" contextRef="c2" unitRef="usd">1</ix:nonFraction></ix:nonNumeric>`);
   expect(trimInlineXbrl(doc2,{keep:keepAssets})).toMatchObject({facts:1,contexts:2});
  });
  it('keeps a selected fact with a missing context (unsupported is preserved, not lost)',()=>{
   const doc=mk(USD,NF('us-gaap:Assets','5','missing'));
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['context']);
  });
  it('the equivalence check names every differing fact, dei text and unsupported entry',()=>{
   const a=parseInlineXbrl(mk(CTX('c1')+USD,NF('us-gaap:Assets','5')+NF('us-gaap:Liabilities','6','nope')));
   const b=parseInlineXbrl(mk(CTX('c1')+USD,NF('us-gaap:Assets','9')));
   const d=equivalence(a,b,keepAssets);
   expect(d.length).toBe(3);   // Assets 5 vs 9 (two entries) and the Liabilities unsupported entry
   expect(equivalence(a,a,keepAssets)).toEqual([]);
   expect(()=>{throw new TrimError('trim_not_equivalent',d);}).toThrow(/trim_not_equivalent/);
  });
 });
});
