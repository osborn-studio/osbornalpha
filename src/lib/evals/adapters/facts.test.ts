// src/lib/evals/adapters/facts.test.ts
import {describe,expect,it} from 'vitest';
import {FORMULA_VERSION} from '../../facts/derive';
import type {FilingRow} from '../../facts/types';
import type {FactTarget,MetricTarget} from '../types';
import {factsReader,selectFiling} from './facts';
import type {FactsReadDb} from './facts';
import {UNIT_ISSUER,companyFactsDoc,memoryWorld} from './memory-world';
import type {CfEntry,MemoryWorld} from './memory-world';

const A1='0009990611-24-000001',A2='0009990611-24-000002';
const FY={start:'2023-01-01',end:'2023-12-31'};
const BASE:CfEntry[]=[
 {tag:'Revenues',...FY,val:'1000',accn:A1,filed:'2024-02-15'},
 {tag:'CostOfRevenue',...FY,val:'600',accn:A1,filed:'2024-02-15'},
 {tag:'GrossProfit',...FY,val:'400',accn:A1,filed:'2024-02-15'},
 {tag:'NetIncomeLoss',...FY,val:'100',accn:A1,filed:'2024-02-15'},
 {tag:'Assets',end:'2023-12-31',val:'5000',accn:A1,filed:'2024-02-15'},
 {tag:'EarningsPerShareDiluted',unit:'USD/shares',...FY,val:'1.25',accn:A1,filed:'2024-02-15'},
];
const AMEND:CfEntry={tag:'Revenues',...FY,val:'1001',accn:A2,form:'10-K/A',filed:'2024-06-01'};
const doc=(extra:CfEntry[]=[])=>companyFactsDoc('9990611','ZZ Eval Unit Co',[...BASE,...extra]);
const TODAY='2026-11-20';
const usd={kind:'currency',currency:'USD'} as const;
const revenue:FactTarget={type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:usd};
const assets:FactTarget={type:'fact',concept:'total_assets',period_start:null,period_end:'2023-12-31',duration:'INSTANT',consolidation:'consolidated',unit:usd};
const margin:MetricTarget={type:'metric',metric:'gross_margin',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:FORMULA_VERSION,unit:{kind:'ratio'}};
const accn=(value:string)=>({kind:'edgar_accession' as const,value});
const REF={issuerId:UNIT_ISSUER,market:'US' as const};
async function world(extra:CfEntry[]=[]):Promise<MemoryWorld>{const w=await memoryWorld();const r=await w.sync(doc(extra));expect(r.detail.published).toBe(1);return w;}
const readerOf=(w:MemoryWorld,db:FactsReadDb=w.db,stateRev:()=>Promise<number|null>=async()=>null)=>factsReader({db,tables:w.tables,stateRev});

describe('factsReader.resolveSubject',()=>{
 it('resolves by cik and by ticker; unknown, invalid and identifier-less subjects are null',async()=>{
  const r=readerOf(await world());
  expect(await r.resolveSubject({market:'US',cik:'9990611'},TODAY)).toEqual(REF);
  expect(await r.resolveSubject({market:'US',cik:'0009990611'},TODAY)).toEqual(REF);
  expect(await r.resolveSubject({market:'US',ticker:'ZZEVU'},TODAY)).toEqual(REF);
  expect(await r.resolveSubject({market:'US',cik:'9990699'},TODAY)).toBeNull();
  expect(await r.resolveSubject({market:'US',cik:'not-a-cik'},TODAY)).toBeNull();
  expect(await r.resolveSubject({market:'US'},TODAY)).toBeNull();
  expect(await r.resolveSubject({market:'CN',cik:'9990611'},TODAY)).toBeNull();
 });
});

describe('factsReader.readDocumentBound (spec §5.1.2, §4.2)',()=>{
 it('returns the filing row with its full source chain and never filters by unit',async()=>{
  const r=readerOf(await world());
  const res=await r.readDocumentBound(REF,{...revenue,unit:{kind:'currency',currency:'EUR'}},accn(A1),TODAY);
  expect(res.error).toBeUndefined();expect(res.truncated).toBe(false);expect(res.stateRev).toBeGreaterThan(0);
  expect(res.rows).toHaveLength(1);
  expect(res.rows[0]).toMatchObject({value_text:'1000',unit:'USD',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',source_ref:A1,mapping_gen:1,mapping_version:'facts-map/1',status:'ok'});
  for(const k of ['fact_id','filing_id','raw_hash','run_id'] as const)expect(res.rows[0][k]).toMatch(/\S/);
 });
 it('matches instants on period_start null, and a legacy target without period_start on the other key parts',async()=>{
  const r=readerOf(await world());
  expect((await r.readDocumentBound(REF,assets,accn(A1),TODAY)).rows.map(x=>x.value_text)).toEqual(['5000']);
  const legacy:FactTarget={...revenue};delete legacy.period_start;
  expect((await r.readDocumentBound(REF,legacy,accn(A1),TODAY)).rows.map(x=>x.value_text)).toEqual(['1000']);
  expect((await r.readDocumentBound(REF,{...revenue,period_start:'2023-01-02'},accn(A1),TODAY)).rows).toEqual([]);
  expect((await r.readDocumentBound(REF,{...revenue,duration:'9M'},accn(A1),TODAY)).rows).toEqual([]);
 });
 it('an accession that is not this issuer’s filing is read_error(filing_not_found); a metric target is read_failed',async()=>{
  const r=readerOf(await world());
  expect(await r.readDocumentBound(REF,revenue,accn('0009990611-99-000009'),TODAY)).toEqual({rows:[],truncated:false,stateRev:null,error:'filing_not_found'});
  expect((await r.readDocumentBound(REF,margin,accn(A1),TODAY)).error).toBe('read_failed');
  expect((await r.readDocumentBound(REF,revenue,{kind:'file_sha256',value:'a'.repeat(64)},TODAY)).error).toBe('filing_not_found');
 });
 it('a later 10-K/A leaves the document-bound row unchanged',async()=>{
  const w=await world();
  await w.sync(doc([AMEND]));
  const r=readerOf(w);
  expect((await r.readDocumentBound(REF,revenue,accn(A1),TODAY)).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1000',A1]]);
  expect((await r.readDocumentBound(REF,revenue,accn(A2),TODAY)).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1001',A2]]);
 });
 it('a truncated envelope is read_error(truncated)',async()=>{
  const w=await world();
  const truncating:FactsReadDb={...w.db,readFacts:async()=>({stateRev:9,rows:[],truncated:true})};
  expect(await readerOf(w,truncating).readDocumentBound(REF,revenue,accn(A1),TODAY)).toEqual({rows:[],truncated:true,stateRev:9,error:'truncated'});
 });
});

describe('factsReader.readCurrent',()=>{
 it('facts: the current row at asOf, replayable on both sides of an amendment',async()=>{
  const w=await world();await w.sync(doc([AMEND]));
  const r=readerOf(w);
  expect((await r.readCurrent(REF,revenue,'2024-05-31')).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1000',A1]]);
  expect((await r.readCurrent(REF,revenue,'2024-06-01')).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1001',A2]]);
  expect((await r.readCurrent(REF,revenue,'2024-01-01')).rows).toEqual([]);
 });
 it('metrics: derived live from DERIVE_CONCEPTS history rows (never the cache), basedOnRev = envelope state_rev',async()=>{
  const w=await world();
  let reads=0;let cacheReads=0;
  const counting:FactsReadDb={...w.db,readFacts:async(i,m,o)=>{reads++;return w.db.readFacts(i,m,o);},metricsOfIssuer:async(i,m,f)=>{cacheReads++;return w.db.metricsOfIssuer(i,m,f);}};
  const res=await readerOf(w,counting).readCurrent(REF,margin,TODAY);
  expect(reads).toBe(1);expect(cacheReads).toBe(0);
  expect(res.rows).toHaveLength(1);
  const row=res.rows[0];
  expect(row).toMatchObject({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15'});
  expect(row.metric).toMatchObject({metric:'gross_margin',formula_version:FORMULA_VERSION,basis:'us_standard',input_unit:'USD',based_on_rev:res.stateRev});
  expect(row.metric!.inputs.map(i=>i.concept).sort()).toEqual(['gross_profit','revenue']);
 });
 it('metrics: a target formula_version other than FORMULA_VERSION is read_error(formula_version_mismatch) without reading',async()=>{
  const w=await world();let reads=0;
  const counting:FactsReadDb={...w.db,readFacts:async(i,m,o)=>{reads++;return w.db.readFacts(i,m,o);}};
  expect((await readerOf(w,counting).readCurrent(REF,{...margin,formula_version:'v1'},TODAY)).error).toBe('formula_version_mismatch');
  expect(reads).toBe(0);
 });
 it('metrics: a truncated envelope is read_error(truncated)',async()=>{
  const w=await world();
  const truncating:FactsReadDb={...w.db,readFacts:async()=>({stateRev:4,rows:[],truncated:true})};
  expect((await readerOf(w,truncating).readCurrent(REF,margin,TODAY))).toMatchObject({error:'truncated',truncated:true,stateRev:4});
 });
});

describe('factsReader.stateRev / project',()=>{
 it('stateRev: the injected value when non-null, else the largest envelope state_rev seen (null before any read)',async()=>{
  const w=await world();
  const r=readerOf(w);
  expect(await r.stateRev()).toBeNull();
  const res=await r.readCurrent(REF,revenue,TODAY);
  expect(await r.stateRev()).toBe(res.stateRev);
  expect(await readerOf(w,w.db,async()=>42).stateRev()).toBe(42);
 });
 it('project delegates to the injected projector and rejects with projector_missing without one',async()=>{
  const w=await world();
  const request={issuer:{market:'US' as const,cik:'9990611'},concepts:['revenue'],asOf:TODAY};
  await expect(readerOf(w).project(request,TODAY)).rejects.toThrow('projector_missing');
  const r=factsReader({db:w.db,tables:w.tables,stateRev:async()=>null,projector:async(req,today)=>({module:'facts',rows:[{asOf:req.asOf,today}]})});
  expect(await r.project(request,TODAY)).toEqual({module:'facts',rows:[{asOf:TODAY,today:TODAY}]});
 });
 it('the reader exposes no write method of FactsDb',async()=>{
  const r=readerOf(await world()) as unknown as Record<string,unknown>;
  for(const k of ['stageFacts','stageFilings','publishRun','replaceMetrics','quarantineFacts','resolveFactsQuarantine','insert','update','upsert'])expect(r[k]).toBeUndefined();
 });
});

describe('selectFiling (spec §4.2, §0 R5-8)',()=>{
 const g=(o:Partial<FilingRow>):FilingRow=>({filing_id:'g',issuer_id:UNIT_ISSUER,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-04-03',source_ref:'600519.SH:20231231:1:20240403',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2026-01-01T00:00:00.000Z',...o});
 const cn=(value:string)=>({kind:'cninfo_announcement' as const,value});
 const t2023:FactTarget={...revenue,period_start:'2023-01-01',period_end:'2023-12-31'};
 const t2022:FactTarget={...revenue,period_start:'2022-01-01',period_end:'2022-12-31'};
 it('edgar_accession: source edgar and source_ref; none → filing_not_found',()=>{
  const us=g({filing_id:'u',market:'US',source:'edgar',origin:'sec',form_type:'10-K',source_ref:A1});
  expect(selectFiling([us],revenue,accn(A1))).toEqual({filing:us});
  expect(selectFiling([us],revenue,accn(A2))).toEqual({error:'filing_not_found'});
  expect(selectFiling([{...us,source:'tushare'}],revenue,accn(A1))).toEqual({error:'filing_not_found'});
 });
 it('cninfo_announcement: one document_ref match wins',()=>{
  const a=g({filing_id:'a',document_ref:'1219000001'});
  expect(selectFiling([a,g({filing_id:'b',document_ref:'other'})],t2023,cn('1219000001'))).toEqual({filing:a});
 });
 it('cninfo_announcement: every match first, then the target period (a restatement linked to the next annual report)',()=>{
  const annual=g({filing_id:'a',document_ref:'D'});
  const restated=g({filing_id:'r',document_ref:'D',form_type:'restatement',period_end:'2022-12-31',source_ref:'600519.SH:20221231:4:20240403'});
  expect(selectFiling([annual,restated],t2023,cn('D'))).toEqual({filing:annual});
  expect(selectFiling([annual,restated],t2022,cn('D'))).toEqual({filing:restated});
 });
 it('cninfo_announcement: same period → the periodic form of that month; still > 1 or none left → filing_ambiguous',()=>{
  const annual=g({filing_id:'a',document_ref:'D'});
  const restated=g({filing_id:'r',document_ref:'D',form_type:'restatement',source_ref:'600519.SH:20231231:4:20240403'});
  expect(selectFiling([annual,restated],t2023,cn('D'))).toEqual({filing:annual});
  expect(selectFiling([annual,g({filing_id:'a2',document_ref:'D',source_ref:'600519.SH:20231231:5:20240410'})],t2023,cn('D'))).toEqual({error:'filing_ambiguous'});
  expect(selectFiling([annual,restated],{...t2023,period_end:'2021-12-31'},cn('D'))).toEqual({error:'filing_ambiguous'});
 });
 it('cninfo_announcement: no match → filing_not_linked when an unlinked filing of the period exists, else filing_not_found',()=>{
  expect(selectFiling([g({filing_id:'u',document_ref:null})],t2023,cn('D'))).toEqual({error:'filing_not_linked'});
  expect(selectFiling([g({filing_id:'u',document_ref:null,period_end:'2022-12-31'})],t2023,cn('D'))).toEqual({error:'filing_not_found'});
  expect(selectFiling([],t2023,{kind:'official_release',value:'x'})).toEqual({error:'filing_not_found'});
 });
});
