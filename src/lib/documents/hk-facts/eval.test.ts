// src/lib/documents/hk-facts/eval.test.ts
// Gold scoring, recorded-fixture loading and the committed gold template (plan F3 Task 18, spec §11.4).
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {HK_CONCEPT_IDS} from './checks';
import {goldNaturalKey,goldProvenanceGaps,isPendingGold,loadRecordedFixture,ratio,scoreHkFacts} from './eval';
import type {HkGoldEntry,HkGoldFile,ScoredCandidate} from './eval';

const SHA='a'.repeat(64),OTHER='b'.repeat(64);
const V={extractor_ref:'hk-facts/1/hk-facts/1.0',extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'c'};
const entry=(concept:string,value:string,o:Partial<HkGoldEntry>={}):HkGoldEntry=>({issuer:{ticker:'0268.HK'},concept,period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',unit:'CNY',value,
 source:{document_sha256:SHA,page:12,line_text:`${concept} line`},recorded_by:'reviewer',recorded_at:'2026-11-20T00:00:00Z',...o});
const gold=(entries:HkGoldEntry[]):HkGoldFile=>({version:1,ready:false,required:{HK:true},issuers:[],entries});
const cand=(concept:string,value:string,passed=true,sha=SHA):ScoredCandidate=>({document_sha256:sha,natural_key:`${concept}:2025-01-01:2025-12-31:12M:CNY`,value,checks_passed:passed});

describe('ratio',()=>{
 it('floors to four decimals in canonical form, integer arithmetic only',()=>{
  expect([ratio(29,30),ratio(1,1),ratio(0,0),ratio(19,20),ratio(2,3)]).toEqual(['0.9666','1','0','0.95','0.6666']);
 });
});
describe('scoreHkFacts',()=>{
 it('precision over checks-passed candidates matched to gold; recall over valued gold entries; pending gold and unmatched candidates do not count',()=>{
  const g=gold([entry('revenue','100'),entry('cost_of_revenue','missing'),entry('gross_profit','40'),entry('cash','<pending>',{recorded_by:'<pending>'}),entry('net_income','9')]);
  const r=scoreHkFacts(g,OTHER,[cand('revenue','100.0'),cand('cost_of_revenue','5'),cand('gross_profit','41'),cand('total_assets','7'),cand('net_income','9',false),cand('revenue','100',true,OTHER)],V);
  expect(r).toMatchObject({...V,gold_sha256:OTHER,precision:'0.3333',recall:'0.3333',counts:{considered:3,matched:1,gold_values:3,covered:1,unscored:2}});
  expect(r.concepts).toEqual(['cost_of_revenue','gross_profit','net_income','revenue']);
  expect(r.mismatches.map(m=>[m.natural_key.split(':')[0],m.kind])).toEqual([['cost_of_revenue','missing_but_extracted'],['gross_profit','value_mismatch'],['net_income','not_extracted']]);
 });
 it('an empty candidate set scores 0 / 0 without throwing',()=>{
  expect(scoreHkFacts(gold([entry('revenue','1')]),SHA,[],V)).toMatchObject({precision:'0',recall:'0'});
 });
});
describe('gold helpers',()=>{
 it('pending, natural key and provenance gaps',()=>{
  expect(isPendingGold(entry('revenue','<pending>'))).toBe(true);
  expect(isPendingGold(entry('revenue','1',{source:{document_sha256:'<pending>',page:1,line_text:'x'}}))).toBe(true);
  expect(goldNaturalKey(entry('total_assets','1',{period_start:null,duration:'INSTANT'}))).toBe('total_assets::2025-12-31:INSTANT:CNY');
  expect(goldProvenanceGaps(entry('revenue','1'))).toEqual([]);
  expect(goldProvenanceGaps(entry('revenue','1',{source:{document_sha256:'x',page:'<pending>',line_text:' '},recorded_at:null}))).toEqual(['source.document_sha256','source.page','source.line_text','recorded_at']);
 });
 it('loadRecordedFixture accepts {header, pages_json} and the flat shape, and rejects anything else',()=>{
  const pages={extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'c',content_sha256:SHA,has_text_layer:true,pages:[]};
  const header={recorded_at:'2026-11-20T00:00:00Z',source_url:'https://www1.hkexnews.hk/x.pdf',content_sha256:SHA,bytes:1,page_count:0,extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0'};
  expect(loadRecordedFixture({header,pages_json:pages})).toEqual({header,pages,recordedPageNos:[]});
  const one={page_no:2,width:595,height:842,text:'綜合損益表',lines:[],tables:[]};
  const sub=loadRecordedFixture({...header,page_count:3,pages_subset:true,pages_json:{...pages,pages:[one]}});
  expect(sub.recordedPageNos).toEqual([2]);
  expect(sub.pages.pages.map(p=>[p.page_no,p.text])).toEqual([[1,''],[2,'綜合損益表'],[3,'']]);
  expect(()=>loadRecordedFixture({...header,page_count:1,pages_subset:true,pages_json:{...pages,pages:[one]}})).toThrow('recorded_fixture_shape');
  const flat={...header,...pages};
  expect(loadRecordedFixture(flat).header.content_sha256).toBe(SHA);expect(loadRecordedFixture(flat).pages.pages).toEqual([]);
  expect(()=>loadRecordedFixture({pages:[]})).toThrow('recorded_fixture_shape');
 });
 it('the committed gold template is a ready:false 0268.HK × 2 periods × 18 concepts skeleton, all pending',()=>{
  const g=JSON.parse(readFileSync(new URL('../fixtures/gold/hk-facts.json',import.meta.url),'utf8')) as HkGoldFile;
  expect(g).toMatchObject({version:1,ready:false,required:{HK:true}});
  expect(g.entries).toHaveLength(36);
  expect(g.entries.every(isPendingGold)).toBe(true);
  for(const pe of ['2026-06-30','2025-12-31'])expect(new Set(g.entries.filter(e=>e.period_end===pe).map(e=>e.concept))).toEqual(new Set(HK_CONCEPT_IDS));
  expect(g.issuers.map(i=>i.ticker)).toEqual(['0268.HK','<pending-issuer-2>','<pending-issuer-3>']);
 });
});
