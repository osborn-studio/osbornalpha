// src/lib/dq/reconcile/ixbrl.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {IXBRL_PARSER_VERSION,IxbrlParseError,decodeEntities,indexIxFacts,ixFactKey,parseInlineXbrl,tokenizeXml} from './ixbrl';
import type {IxFact} from './ixbrl';

const AAPL=readFileSync(new URL('../fixtures/ixbrl/aapl-10k-2023.handtrim.htm',import.meta.url),'utf8');
/** Renames every prefix: xmlns declarations, element names, QName attribute values and QName text (measure, explicitMember). */
function rewritePrefixes(doc:string,map:Record<string,string>):string{
 let out=doc;
 for(const [from,to] of Object.entries(map)){
  const esc=from.replace(/[-]/g,'\\-');
  out=out.replaceAll(`xmlns:${from}=`,`xmlns:${to}=`).replace(new RegExp(`(?<=[<\\/"\\s>])${esc}:`,'g'),`${to}:`);
 }
 return out;
}
const HEAD='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:ixt3="http://www.xbrl.org/inlineXBRL/transformation/2015-02-26" xmlns:ixt5="http://www.xbrl.org/inlineXBRL/transformation/2022-02-16" xmlns:ixt-sec="http://www.sec.gov/inlineXBRL/transformation/2015-08-31" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
const ENTITY='<xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>';
const DUR='<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>';
const ctx=(id:string,period:string,o:{segment?:string;scenario?:string}={})=>`<xbrli:context id="${id}"><xbrli:entity>${ENTITY}${o.segment?`<xbrli:segment>${o.segment}</xbrli:segment>`:''}</xbrli:entity><xbrli:period>${period}</xbrli:period>${o.scenario?`<xbrli:scenario>${o.scenario}</xbrli:scenario>`:''}</xbrli:context>`;
const USD='<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
const RES=ctx('d',DUR)+ctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')+USD;
const doc=(body:string,res=RES)=>`${HEAD}<body><div style="display:none"><ix:header><ix:resources>${res}</ix:resources></ix:header></div>${body}</body></html>`;
const nf=(attrs:string,text:string,name='us-gaap:Revenues',contextRef='d',unitRef='usd')=>`<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="${unitRef}" ${attrs}>${text}</ix:nonFraction>`;
const one=(body:string,res?:string)=>parseInlineXbrl(doc(body,res));
const valueOf=(body:string)=>{const d=one(body);return d.facts.length===1?d.facts[0].value:d.unsupported.map(u=>u.reason).join(',');};
const byName=(facts:IxFact[],name:string)=>facts.filter(f=>f.name===name);

describe('parseInlineXbrl on the AAPL FY2023 10-K fixture',()=>{
 const d=parseInlineXbrl(AAPL);
 it('extracts the 11 non-dimensional facts with canonical names, contexts, units and scaled values',()=>{
  expect(IXBRL_PARSER_VERSION).toBe('ixbrl/1');
  expect(d.unsupported).toEqual([]);
  expect(d.facts).toHaveLength(11);
  const rev=byName(d.facts,'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax');
  expect(rev.map(f=>[f.periodStart,f.periodEnd,f.value])).toEqual([['2022-09-25','2023-09-30','383285000000'],['2021-09-26','2022-09-24','394328000000'],['2020-09-27','2021-09-25','365817000000'],['2022-09-25','2023-09-30','383285000000']]);
  expect(rev[0]).toMatchObject({unit:'USD',decimals:'-6',scale:6,entity:'http://www.sec.gov/CIK#0000320193',contextRef:'c-1',unitRef:'usd'});
  expect(byName(d.facts,'us-gaap:EarningsPerShareBasic')[0]).toMatchObject({value:'6.16',unit:'USD/share',decimals:'2',scale:0});
  expect(byName(d.facts,'us-gaap:NetCashProvidedByUsedInInvestingActivities').map(f=>f.value)).toEqual(['3705000000','-22354000000']);
  expect(byName(d.facts,'us-gaap:Assets')[0]).toMatchObject({periodStart:null,periodEnd:'2023-09-30',value:'352583000000'});
  expect(byName(d.facts,'dei:EntityCommonStockSharesOutstanding')[0]).toMatchObject({periodStart:null,periodEnd:'2023-10-20',unit:'shares',value:'15552752000',decimals:'INF'});
 });
 it('skips the dimensional (segment) context: the iPhone member value is not a fact and not unsupported',()=>{
  expect(d.facts.some(f=>f.value==='200583000000')).toBe(false);
 });
 it('reads only the three dei nonNumeric facts, whitespace-collapsed',()=>{
  expect(d.nonNumeric).toEqual({'dei:DocumentFiscalYearFocus':'2023','dei:DocumentPeriodEndDate':'September 30, 2023','dei:EntityFilerCategory':'Large Accelerated Filer'});
 });
 it('repeated tagging of one value collapses to one value per right-side key',()=>{
  const idx=indexIxFacts(d.facts);
  const k=ixFactKey(byName(d.facts,'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax')[0]);
  expect(idx.get(k)?.values).toEqual(['383285000000']);
  expect(idx.get(k)?.facts).toHaveLength(2);
 });
 it('resolves namespaces by xmlns declarations: a document with every prefix renamed parses identically',()=>{
  const variant=rewritePrefixes(AAPL,{ix:'inl',xbrli:'xi',xbrldi:'xd',iso4217:'cur','us-gaap':'g',dei:'d',ixt:'tr',srt:'s'});
  expect(variant).not.toContain('<ix:nonFraction');expect(variant).toContain('<inl:nonFraction name="g:Assets"');expect(variant).toContain('>cur:USD<');
  expect(parseInlineXbrl(variant)).toEqual(d);
 });
 it('an element named nonFraction in a foreign namespace is not a fact',()=>{
  const foreign=AAPL.replace('</body>','<p><foo:nonFraction xmlns:foo="urn:not-ix" name="us-gaap:Liabilities" contextRef="c-4" unitRef="usd">1</foo:nonFraction></p></body>');
  expect(parseInlineXbrl(foreign).facts).toHaveLength(11);
 });
});

describe('ix:nonFraction text grammar by format (spec §5.2 regexes)',()=>{
 it.each([
  ['',' 1,234.5 ','1234.5'],
  ['','-12','-12'],
  ['','1.234,5','format'],
  ['format="ixt:num-dot-decimal"','1,234,567.89','1234567.89'],
  ['format="ixt3:numdotdecimal"','12.5','12.5'],
  ['format="ixt5:num-dot-decimal"','7','7'],
  ['format="ixt:num-comma-decimal"','1.234.567,89','1234567.89'],
  ['format="ixt3:numcommadecimal"','12,5','12.5'],
  ['format="ixt:fixed-zero"','—','0'],
  ['format="ixt3:zerodash"','-','0'],
  ['format="ixt3:numwordsen"',' None ','0'],
  ['format="ixt3:numwordsen"','no','0'],
  ['format="ixt3:numwordsen"','three','format'],
  ['format="ixt-sec:numwordsen"','no','format'],
  ['format="ixt:date-monthname-day-year-en"','1','format'],
  ['format="foo:num-dot-decimal"','1','format'],
  ['format="ixt:num-dot-decimal"','1,000&#160;','1000'],
 ])('%s %j → %s',(attrs,text,want)=>{expect(valueOf(nf(attrs,text))).toBe(want);});
 it('applies scale and sign; rejects a malformed scale or sign',()=>{
  expect(valueOf(nf('scale="3"','1.5'))).toBe('1500');
  expect(valueOf(nf('scale="-2"','150'))).toBe('1.5');
  expect(valueOf(nf('scale="6" sign="-"','22,354'))).toBe('-22354000000');
  expect(valueOf(nf('sign="-"','0'))).toBe('0');
  expect(valueOf(nf('sign="+"','1'))).toBe('sign');
  expect(valueOf(nf('scale="x"','1'))).toBe('scale');
 });
 it('xsi:nil → unsupported(nil) with name and period, never a fact',()=>{
  const d=one(nf('xsi:nil="true"',''));
  expect(d.facts).toEqual([]);
  expect(d.unsupported).toEqual([{reason:'nil',name:'us-gaap:Revenues',contextRef:'d',periodStart:'2024-01-01',periodEnd:'2024-12-31'}]);
 });
 it('a nested nonFraction gives the outer fact the innermost text; ix:exclude text is not fact text',()=>{
  const d=one(`<ix:nonFraction name="us-gaap:Assets" contextRef="i" unitRef="usd">(<ix:nonFraction name="us-gaap:LiabilitiesAndStockholdersEquity" contextRef="i" unitRef="usd">5</ix:nonFraction>)</ix:nonFraction><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer<ix:exclude> (see note 1)</ix:exclude></ix:nonNumeric>`);
  expect(d.facts.map(f=>[f.name,f.value])).toEqual([['us-gaap:LiabilitiesAndStockholdersEquity','5'],['us-gaap:Assets','5']]);
  expect(d.nonNumeric['dei:EntityFilerCategory']).toBe('Accelerated Filer');
 });
});

describe('contexts and units',()=>{
 it('ANY child element of segment or scenario makes the context dimensional (skipped, not unsupported)',()=>{
  const res=RES+ctx('typed',DUR,{segment:'<xbrldi:typedMember dimension="us-gaap:X"><us-gaap:Y>1</us-gaap:Y></xbrldi:typedMember>'})+ctx('scen',DUR,{scenario:'<foo:Plan xmlns:foo="urn:x">budget</foo:Plan>'})+ctx('emptyseg',DUR,{segment:' '});
  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','typed')+nf('','2','us-gaap:Revenues','scen')+nf('','3','us-gaap:Revenues','emptyseg'),res));
  expect(d.facts.map(f=>f.value)).toEqual(['3']);   // an empty segment has no child element
  expect(d.unsupported).toEqual([]);
 });
 it('two contexts with the same entity and period give facts with the same key (normalised dedupe)',()=>{
  const d=parseInlineXbrl(doc(nf('','10','us-gaap:Revenues','d')+nf('','10','us-gaap:Revenues','d2')+nf('','11','us-gaap:Revenues','d3'),RES+ctx('d2',DUR)+ctx('d3',DUR)));
  const keys=d.facts.map(ixFactKey);
  expect(new Set(keys).size).toBe(1);
  expect(indexIxFacts(d.facts).get(keys[0])?.values).toEqual(['10','11']);   // two values under one key → right_ambiguous at the pair
 });
 it('unknown context, unknown unit, forever period, non-ISO date → unsupported with a reason',()=>{
  const res=RES+ctx('f','<xbrli:forever/>')+ctx('bad','<xbrli:instant>2024-12-31T00:00:00</xbrli:instant>');
  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','nope')+nf('','1','us-gaap:Revenues','d','nounit')+nf('','1','us-gaap:Revenues','f')+nf('','1','us-gaap:Revenues','bad'),res));
  expect(d.facts).toEqual([]);
  expect(d.unsupported.map(u=>u.reason)).toEqual(['context','unit','period','period']);
 });
 it('divide → <num>/<den> normalised by units.ts; multiplied or unknown measures → unsupported(unit)',()=>{
  const res=RES+'<xbrli:unit id="eps"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>'
   +'<xbrli:unit id="two"><xbrli:measure>iso4217:USD</xbrli:measure><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>'
   +'<xbrli:unit id="yr" xmlns:utr="http://www.xbrl.org/2009/utr"><xbrli:measure>utr:Y</xbrli:measure></xbrli:unit>'
   +'<xbrli:unit id="pure"><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>';
  const d=parseInlineXbrl(doc(nf('','1.5','us-gaap:EarningsPerShareBasic','d','eps')+nf('','1','us-gaap:Revenues','d','two')+nf('','1','us-gaap:Revenues','d','yr')+nf('','0.2','us-gaap:Revenues','d','pure'),res));
  expect(d.facts.map(f=>[f.unit,f.value])).toEqual([['EUR/share','1.5'],['pure','0.2']]);
  expect(d.unsupported.map(u=>u.reason)).toEqual(['unit','unit']);
 });
});

describe('document-level behaviour and the tokenizer bounds',()=>{
 it('a document without any ix element is not_inline_xbrl',()=>{
  expect(parseInlineXbrl('<html><body><p>Annual report</p></body></html>')).toEqual({facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]});
 });
 it('ix:fraction, ix:tuple and tuple members are unsupported; conflicting dei texts drop the key and report',()=>{
  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"></ix:tuple><ix:fraction name="us-gaap:F" contextRef="d" unitRef="usd"><ix:numerator>1</ix:numerator><ix:denominator>2</ix:denominator></ix:fraction>'+nf('tupleRef="t1"','1')+'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>');
  expect(d.facts).toEqual([]);
  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','ix_fraction','tuple_member','nonnumeric_conflict']);
  expect(d.nonNumeric['dei:EntityFilerCategory']).toBeUndefined();   // conflicting → unavailable
 });
 it('decodes the five XML entities, &nbsp; and numeric references; leaves unknown entities literal',()=>{
  expect(decodeEntities('a&lt;b&gt;&amp;&quot;&apos;&nbsp;&#65;&#x42;&bogus;')).toBe('a<b>&"\' AB&bogus;');
 });
 it('skips comments, PIs, a DOCTYPE without internal subset; script content is raw text; CDATA is text',()=>{
  const d=parseInlineXbrl('<?xml version="1.0"?><!DOCTYPE html>'+doc('<!-- <ix:nonFraction> --><script>if(a<b&&c){x()}</script><![CDATA[ignored]]>'+nf('','4')));
  expect(d.facts.map(f=>f.value)).toEqual(['4']);
 });
 it('refuses an internal DTD subset, a mismatched close tag and unclosed elements with IxbrlParseError codes',()=>{
  const code=(s:string)=>{try{parseInlineXbrl(s);return 'parsed';}catch(e){return e instanceof IxbrlParseError?e.code:'other';}};
  expect(code('<!DOCTYPE x [<!ENTITY a "b">]><x/>')).toBe('dtd_unsupported');
  expect(code('<a><b></a>')).toBe('mismatched_close');
  expect(code('<a><b></b>')).toBe('unclosed_elements');
  expect(code('<a x=1></a>')).toBe('bad_attribute');
 });
 it('tokens carry source offsets (used by the trimmer)',()=>{
  const src='<a x="1">hi</a>';
  expect([...tokenizeXml(src)].map(t=>[t.t,src.slice(t.start,t.end)])).toEqual([['open','<a x="1">'],['text','hi'],['close','</a>']]);
 });
});

describe('plan-review hardening (Codex round)',()=>{
 it('facts nested anywhere inside ix:tuple are excluded and reported, with or without tupleRef',()=>{
  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:tuple name="us-gaap:U" tupleID="t2">'+nf('','7')+'</ix:tuple></ix:tuple>'+nf('','8','us-gaap:Assets','i'));
  expect(d.facts.map(f=>f.value)).toEqual(['8']);
  expect(d.nonNumeric).toEqual({});
  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','tuple_member','ix_tuple','tuple_member']);
 });
 it('validates measure namespace and local name together',()=>{
  const res=RES+'<xbrli:unit id="bad1"><xbrli:measure>xbrli:USD</xbrli:measure></xbrli:unit><xbrli:unit id="bad2"><xbrli:measure>iso4217:shares</xbrli:measure></xbrli:unit><xbrli:unit id="bad3"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>iso4217:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>';
  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','d','bad1')+nf('','1','us-gaap:Revenues','d','bad2')+nf('','1','us-gaap:Revenues','d','bad3')+nf('','1'),res));
  expect(d.unsupported.map(u=>u.reason)).toEqual(['unit','unit','unit']);
  expect(d.facts.map(f=>f.unit)).toEqual(['USD']);
 });
 it('a repeated value after a conflict does not resurrect the dei key',()=>{
  const e=(t:string)=>`<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">${t}</ix:nonNumeric>`;
  const d=one(e('A')+e('B')+e('A')+e('B'));
  expect(d.nonNumeric).toEqual({});
  expect(d.unsupported.map(u=>u.reason)).toEqual(['nonnumeric_conflict']);
 });
 it('continuedAt facts are unsupported(continuation); fragments never reach nonNumeric',()=>{
  const d=one('<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d" continuedAt="k1">Large Acc</ix:nonNumeric><ix:continuation id="k1">elerated Filer</ix:continuation>'+nf('continuedAt="k2"','1')+nf('','2','us-gaap:Assets','i'));
  expect(d.nonNumeric).toEqual({});
  expect(d.facts.map(f=>f.value)).toEqual(['2']);
  expect(d.unsupported.map(u=>u.reason)).toEqual(['continuation','continuation']);
 });
 it('an out-of-bounds numeric literal is a fact-level unsupported(decimal_bounds); other facts survive',()=>{
  const d=one(nf('','1'.repeat(513))+nf('','5','us-gaap:Assets','i')+nf('scale="99"','1'.repeat(450),'us-gaap:Liabilities'));
  expect(d.facts.map(f=>f.value)).toEqual(['5']);
  expect(d.unsupported.map(u=>u.reason)).toEqual(['decimal_bounds','decimal_bounds']);
 });
 it('a duplicate context id makes facts referencing it unsupported; a context without identifier is unsupported(entity)',()=>{
  const noId='<xbrli:context id="noid"><xbrli:entity></xbrli:entity><xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period></xbrli:context>';
  const res=RES+ctx('dup',DUR)+ctx('dup','<xbrli:instant>2024-01-01</xbrli:instant>')+noId;
  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','dup')+nf('','2','us-gaap:Revenues','noid')+nf('','3'),res));
  expect(d.facts.map(f=>f.value)).toEqual(['3']);
  expect(d.unsupported.map(u=>[u.reason,u.contextRef])).toEqual([['context_duplicate','dup'],['entity','noid']]);
 });
});
