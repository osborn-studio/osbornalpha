// Chunk merge and candidate assembly regressions (spec §6.2, §5.2–§5.3).
import {describe,it,expect} from 'vitest';
import {buildCandidateRows,conflictGroupId,mergeChunks,normalizedValue,type ChunkExtraction} from './merge';
import type {DocumentExtraction,Evidence} from './schema';
import type {PageText} from './locate';
import fixture from '../fixtures/synthetic-extraction.json';
import pages from '../fixtures/synthetic-pages.json';

const FIX=fixture as DocumentExtraction;
const ev=(value:string,page:number,quote=value,confidence=0.9):Evidence=>({value,page,quote,confidence});
const doc=(o:Partial<DocumentExtraction>):DocumentExtraction=>({scope:'single_issuer',institution:ev('Synthetic Broker Ltd',1),analysts:[],published_date:ev('5 November 2026',1),title:ev('T',1),targets:[],...o});
const pick=(r:ReturnType<typeof mergeChunks>,tk:string|null,f:string)=>r.candidates.filter(c=>c.target_key===tk&&c.field===f);

describe('mergeChunks (spec §6.2)',()=>{
 it('a single chunk yields one candidate per evidence with targets keyed by parseBrokerTicker',()=>{
  const r=mergeChunks([{chunk:0,extraction:FIX}]);
  expect(r).toMatchObject({version:'merge/1',scope:'single_issuer',scopes:['single_issuer']});
  expect(r.targets).toEqual([{target_key:'NWND',tickers_as_stated:['NWND US'],exchange_hint:null},{target_key:'9999.HK',tickers_as_stated:['9999 HK'],exchange_hint:'HKEX'}]);
  expect(r.candidates.every(c=>c.conflict_group===null&&c.occurrence>=1)).toBe(true);
  expect(pick(r,null,'analyst').map(c=>[c.evidence.value,c.occurrence])).toEqual([['Jane Roe',1],['李明',2]]);
  expect(pick(r,'NWND','target_horizon')[0].evidence.value).toBe('12-month');
  expect(r.candidates).toHaveLength(7+2+9+6);
 });
 it('same analyst across chunks (case/space variants) is one occurrence: smallest page, merged_from',()=>{
  const r=mergeChunks([{chunk:1,extraction:doc({analysts:[ev('JANE  ROE',4)]})},{chunk:0,extraction:doc({analysts:[ev('Jane Roe',3),ev('John Doe',3)]})},{chunk:2,extraction:doc({analysts:[ev('jane roe',2)]})}]);
  expect(pick(r,null,'analyst').map(c=>[c.evidence.value,c.occurrence,c.evidence.page,c.merged_from,c.conflict_group])).toEqual([['jane roe',1,2,[0,1,2],null],['John Doe',2,3,[0],null]]);
 });
 it('ticker occurrences are by stated value inside one target_key',()=>{
  const r=mergeChunks([{chunk:0,extraction:doc({targets:[{ticker:ev('BABA US',1)}]})},{chunk:1,extraction:doc({targets:[{ticker:ev('BABA.N',5)},{ticker:ev('baba us',6)}]})}]);
  expect(r.targets).toEqual([{target_key:'BABA',tickers_as_stated:['BABA US','BABA.N','baba us'],exchange_hint:null}]);
  expect(pick(r,'BABA','ticker').map(c=>[c.evidence.value,c.occurrence,c.merged_from])).toEqual([['BABA US',1,[0,1]],['BABA.N',2,[1]]]);
 });
 it('equal typed values across chunks collapse (120.00 = US$120)',()=>{
  const r=mergeChunks([{chunk:0,extraction:doc({targets:[{ticker:ev('NWND US',1),target_price:ev('US$120.00',5)}]})},{chunk:1,extraction:doc({targets:[{ticker:ev('NWND US',9),target_price:ev('120',2)}]})}]);
  expect(pick(r,'NWND','target_price').map(c=>[c.evidence.value,c.evidence.page,c.merged_from,c.conflict_group])).toEqual([['120',2,[0,1],null]]);
 });
 it('different values keep every candidate in one conflict group and select none (confidence ignored)',()=>{
  const r=mergeChunks([
   {chunk:0,extraction:doc({targets:[{ticker:ev('NWND US',1),target_price:ev('120',2,'120',0.99)}]})},
   {chunk:1,extraction:doc({targets:[{ticker:ev('NWND US',9),target_price:ev('125',9,'125',0.10)}]})},
   {chunk:2,extraction:doc({targets:[{ticker:ev('NWND US',12),target_price:ev('US$120.00',12)}]})},
  ]);
  const tp=pick(r,'NWND','target_price');
  expect(tp.map(c=>[c.evidence.value,c.occurrence,c.merged_from,c.conflict_group])).toEqual([['120',1,[0,2],'conflict:NWND:target_price:1'],['125',1,[1],'conflict:NWND:target_price:1']]);
  expect(conflictGroupId(null,'title',1)).toBe('conflict:-:title:1');
 });
 it('report-level conflicts (published_date) and differing scopes',()=>{
  const r=mergeChunks([{chunk:0,extraction:doc({})},{chunk:1,extraction:doc({scope:'multi_issuer',published_date:ev('2026-11-06',8)})}]);
  expect(pick(r,null,'published_date').map(c=>c.conflict_group)).toEqual(['conflict:-:published_date:1','conflict:-:published_date:1']);
  expect(pick(r,null,'institution')).toHaveLength(1);
  expect(r).toMatchObject({scope:null,scopes:['single_issuer','multi_issuer']});
 });
 it('is independent of input order and rejects duplicate chunk ids',()=>{
  const a:ChunkExtraction={chunk:0,extraction:doc({analysts:[ev('A',1)]})},b:ChunkExtraction={chunk:1,extraction:doc({analysts:[ev('B',2)]})};
  expect(mergeChunks([b,a])).toEqual(mergeChunks([a,b]));
  expect(()=>mergeChunks([a,a])).toThrow('duplicate_chunk');
 });
 it('normalizedValue: typed where possible, squashed text otherwise',()=>{
  expect(normalizedValue('target_price','US$ 120.0')).toBe(normalizedValue('target_price','120'));
  expect(normalizedValue('published_date','5 Nov 2026')).toBe(normalizedValue('published_date','2026-11-05'));
  expect(normalizedValue('rating','Over weight')).toBe(normalizedValue('rating','overweight'));
  expect(normalizedValue('target_price','n/a')).toBe('text:n/a');
 });
});

describe('buildCandidateRows (spec §5.2, §5.3)',()=>{
 const P:PageText=pages;
 it('locates and types every fixture candidate; ticker rows carry the resolution snapshot',()=>{
  const res=new Map([['NWND',{outcome:'unresolved'}]]);
  const rows=buildCandidateRows(mergeChunks([{chunk:0,extraction:FIX}]),{pages:P,extractor:'llm:model-a@abc',resolutions:res});
  expect(rows.every(r=>r.status==='extracted')).toBe(true);
  const tp=rows.find(r=>r.target_key==='NWND'&&r.field==='target_price')!;
  expect(tp).toMatchObject({value_text:'120',value_num:'120',value_unit:'price',value_currency:null,page:1,value_source_text:'US$120.00',extractor:'llm:model-a@abc',extractor_confidence:0.95,conflict_group:null,status:'extracted'});
  expect(P[0].text.slice(tp.char_start!,tp.char_end!)).toBe('US$120.00');
  expect(rows.find(r=>r.field==='target_currency'&&r.target_key==='9999.HK')).toMatchObject({value_text:'HKD',value_currency:'HKD',value_source_text:'HK$'});
  expect(rows.find(r=>r.field==='upside_stated')).toMatchObject({value_num:'0.25',value_unit:'pct'});
  expect(rows.find(r=>r.field==='ticker'&&r.target_key==='NWND')!.resolution).toEqual({outcome:'unresolved'});
  expect(rows.find(r=>r.field==='ticker'&&r.target_key==='9999.HK')!.resolution).toBeUndefined();
  expect(rows.find(r=>r.field==='rating')!.detail).toMatchObject({merge:'merge/1',locate:'locate/1',typed:'typed/1',merged_from:[0],multiple_hits:[expect.any(Number),expect.any(Number)]});
 });
 it('a quote that differs by one space becomes unverified with no span (acceptance sample 2)',()=>{
  const x=structuredClone(FIX);x.targets[0].target_price={value:'US$120.00',page:1,quote:'US$ 120.00',confidence:0.9};
  const row=buildCandidateRows(mergeChunks([{chunk:0,extraction:x}]),{pages:P,extractor:'llm:m@h'}).find(r=>r.target_key==='NWND'&&r.field==='target_price')!;
  expect(row).toMatchObject({status:'unverified',page:1,char_start:null,char_end:null,value_source_text:null,value_num:'120',detail:{locate_failure:'not_found',quote:'US$ 120.00'}});
 });
 it('records typed failures and currency-mark mismatches without dropping the row',()=>{
  const x=structuredClone(FIX);x.targets[0].target_currency={value:'HKD',page:1,quote:'US$',confidence:0.9};x.wacc={value:'n/a',page:2,quote:'DCF',confidence:0.5};
  const rows=buildCandidateRows(mergeChunks([{chunk:0,extraction:x}]),{pages:P,extractor:'llm:m@h'});
  expect(rows.find(r=>r.field==='target_currency'&&r.target_key==='NWND')).toMatchObject({status:'extracted',value_currency:null,detail:{typed_failure:'currency_mark_mismatch'}});
  expect(rows.find(r=>r.field==='wacc')).toMatchObject({status:'extracted',value_num:null,detail:{typed_failure:'not_a_percentage'}});
 });
});
