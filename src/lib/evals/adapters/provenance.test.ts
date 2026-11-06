// src/lib/evals/adapters/provenance.test.ts
import {describe,expect,it} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {rawHashOf,sha256Hex,snapshotOf} from '../../facts/providers/shared';
import {metaPath} from '../../facts/snapshot-store';
import {memoryTableClient} from '../../db/memory-table-client';
import type {FactCandidate,FactRow,FilingRow} from '../../facts/types';
import {parseTushareStatements} from '../../facts/providers/tushare-statements';
import type {FactTarget,MetricTarget,ReadRow} from '../types';
import {FORMULA_VERSION} from '../../facts/derive';
import {NonVisibleReadError,privilegedFactsReader,readRowOfFact} from './facts';
import type {FactsReadDb} from './facts';
import {memoryRawStorage,missingFields,provenanceResolver,supabaseRawStorage} from './provenance';
import type {FactProvenance,SnapshotParsers} from './provenance';
import {CODE_VERSION,UNIT_ISSUER,companyFactsDoc,memoryWorld} from './memory-world';
import type {CfEntry,MemoryWorld} from './memory-world';

const A1='0009990611-24-000001',A2='0009990611-24-000002',A3='0009990611-24-000003';
const FY={start:'2023-01-01',end:'2023-12-31'};
const BASE:CfEntry[]=[
 {tag:'Revenues',...FY,val:'1000',accn:A1,filed:'2024-02-15'},
 {tag:'CostOfRevenue',...FY,val:'600',accn:A1,filed:'2024-02-15'},
 {tag:'GrossProfit',...FY,val:'400',accn:A1,filed:'2024-02-15'},
 {tag:'NetIncomeLoss',...FY,val:'100',accn:A1,filed:'2024-02-15'},
];
const CONFLICT:CfEntry={tag:'NetIncomeLoss',...FY,val:'101',accn:A3,form:'10-K/A',filed:'2024-02-15'};
const AMEND:CfEntry={tag:'Revenues',...FY,val:'1001',accn:A2,form:'10-K/A',filed:'2024-06-01'};
const doc=(entries:CfEntry[])=>companyFactsDoc('9990611','ZZ Eval Unit Co',entries);
const TODAY='2026-11-20';
const REF={issuerId:UNIT_ISSUER,market:'US' as const};
const usd={kind:'currency',currency:'USD'} as const;
const revenue:FactTarget={type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:usd};
const netIncome:FactTarget={...revenue,concept:'net_income_parent'};
const margin:MetricTarget={type:'metric',metric:'gross_margin',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:FORMULA_VERSION,unit:{kind:'ratio'}};
const accn=(value:string)=>({kind:'edgar_accession' as const,value});
const PARSERS:SnapshotParsers={edgar:(s,o)=>parseCompanyFacts(s,{sinceYear:o.sinceYear}),tushare:(s,o)=>parseTushareStatements(s,{sinceYear:o.sinceYear})};
const priv=(w:MemoryWorld)=>privilegedFactsReader({db:w.db,tables:w.overlay,stateRev:async()=>null,storage:memoryRawStorage(w.storage.objects),parsers:PARSERS});
async function world(entries:CfEntry[]=BASE,at?:string):Promise<MemoryWorld>{const w=await memoryWorld();expect((await w.sync(doc(entries),at?{at}:{})).detail.published).toBe(1);return w;}
const revenueRow=async(w:MemoryWorld)=>(await priv(w).readDocumentBound(REF,revenue,accn(A1),TODAY)).rows[0];
const objectPath=(w:MemoryWorld)=>[...w.storage.objects.keys()].find(k=>/\/[0-9a-f]{64}\.json$/.test(k))!;

describe('missingFields (spec §5.1.4 required fields)',()=>{
 const row:ReadRow={value_text:'1',unit:'USD',period_start:null,period_end:'2023-12-31',duration:'INSTANT',consolidation:'consolidated',available_date:'2024-02-15',fact_id:'f',filing_id:'g',source_ref:A1,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'a'.repeat(64),run_id:'r'};
 it('facts: every required field present → none; blanks are listed in field order',()=>{
  expect(missingFields(row)).toEqual([]);
  expect(missingFields({...row,raw_hash:'',run_id:undefined,source_ref:undefined})).toEqual(['source_ref','raw_hash','run_id']);
 });
 it('metrics: metric, formula_version, basis, input_unit, inputs[].fact_id, based_on_rev',()=>{
  const m={metric:'gross_margin',formula_version:FORMULA_VERSION,basis:'us_standard',input_unit:'USD',based_on_rev:3,inputs:[{fact_id:'f',concept:'revenue',filing_id:'g',available_date:'2024-02-15'}]};
  expect(missingFields({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',metric:m})).toEqual([]);
  expect(missingFields({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',metric:{...m,basis:'',inputs:[]}})).toEqual(['basis','inputs[].fact_id']);
 });
});

describe('resolveProvenance — facts rows (spec §0 R5-5)',()=>{
 it('lists the issuer prefix, verifies sha256(bytes) = object name, re-parses and finds the candidate whose rawHash = raw_hash',async()=>{
  const w=await world();
  const row=await revenueRow(w);
  const p=await priv(w).resolveProvenance(REF,row,{artifacts:true});
  expect(p).toEqual({ok:true,missing:[],producer_code_version:CODE_VERSION,object_path:`edgar/${UNIT_ISSUER}/${sha256Hex(doc(BASE))}.json`,locator:expect.stringMatching(/^facts\.us-gaap\.Revenues\.units\.USD\[0\]\(accn=0009990611-24-000001,start=2023-01-01,end=2023-12-31\)$/)});
 });
 it('without artifacts: eligibility, filing and producer only (no object)',async()=>{
  const w=await world();
  expect(await priv(w).resolveProvenance(REF,await revenueRow(w),{artifacts:false})).toEqual({ok:true,missing:[],producer_code_version:CODE_VERSION});
 });
 it('missing fields are reported before any lookup',async()=>{
  const w=await world();
  expect(await priv(w).resolveProvenance(REF,{...await revenueRow(w),raw_hash:undefined},{artifacts:true})).toEqual({ok:false,missing:['raw_hash'],reason:'fields_missing'});
 });
 it('object bytes that do not hash to their name are never used: object_hash_mismatch',async()=>{
  const w=await world();const row=await revenueRow(w);
  const path=objectPath(w);const bytes=w.storage.objects.get(path) as Uint8Array;
  w.storage.objects.set(path,new Uint8Array([...bytes,0x20]));
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'object_hash_mismatch'});
 });
 it('valid objects without the candidate → candidate_not_found; no object at all → no_raw_objects',async()=>{
  const w=await world();const row=await revenueRow(w);
  const path=objectPath(w);w.storage.objects.delete(path);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'no_raw_objects'});
  const other=doc([{...BASE[0],val:'999'}]);
  w.storage.objects.set(`edgar/${UNIT_ISSUER}/${sha256Hex(other)}.json`,other);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'candidate_not_found'});
 });
 it('a row that disagrees with the stored fact is refused: value, raw_hash, run_id, source_ref',async()=>{
  const w=await world();const row=await revenueRow(w);const r=priv(w);
  expect(await r.resolveProvenance(REF,{...row,value_text:'1001'},{artifacts:true})).toMatchObject({ok:false,reason:'row_mismatch:value'});
  expect(await r.resolveProvenance(REF,{...row,raw_hash:'b'.repeat(64)},{artifacts:true})).toMatchObject({ok:false,reason:'row_mismatch:raw_hash'});
  expect(await r.resolveProvenance(REF,{...row,run_id:'00000000-0000-4000-8000-0000000000aa'},{artifacts:true})).toMatchObject({ok:false,reason:'row_mismatch:run_id'});
  expect(await r.resolveProvenance(REF,{...row,source_ref:A2},{artifacts:true})).toMatchObject({ok:false,reason:'source_ref_mismatch'});
  expect(await r.resolveProvenance({...REF,issuerId:'00000000-0000-4000-8000-0000000000bb'},row,{artifacts:true})).toMatchObject({ok:false,reason:'fact_not_eligible'});
 });
 it('producer_code_version comes from fact_sync_runs → ingest_batches; an empty code_version is producer_code_version_missing',async()=>{
  const w=await world();const row=await revenueRow(w);
  const batch=w.db.runs().find(r=>r.run_id===row.run_id)!.batch_id;
  expect(await w.tables.update('ingest_batches',{batch_id:batch},{code_version:null})).toBe(1);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'producer_code_version_missing'});
 });
});

describe('resolveProvenance — metric rows (spec §0 R5-6)',()=>{
 it('every input fact is eligible and resolved to its snapshot; inputs are listed with their own chain',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  const p=await priv(w).resolveProvenance(REF,row,{artifacts:true}) as FactProvenance;
  expect(p).toMatchObject({ok:true,missing:[],producer_code_version:CODE_VERSION});
  expect(p.input_chains?.map(i=>[i.concept,i.ok,i.source_ref,i.object_path!.startsWith(`edgar/${UNIT_ISSUER}/`),/^facts\.us-gaap\./.test(i.locator!)]).sort()).toEqual([['gross_profit',true,A1,true,true],['revenue',true,A1,true,true]]);
 });
 it('an input on a superseded generation is input_not_eligible',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  expect((await w.sync(doc(BASE),{mappingGen:2})).detail.published).toBe(1);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'input_not_eligible'});
 });
 it('an unknown input id is input_missing',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  const bad={...row,metric:{...row.metric!,inputs:[{...row.metric!.inputs[0],fact_id:'00000000-0000-4000-8000-0000000000cc'}]}};
  expect(await priv(w).resolveProvenance(REF,bad,{artifacts:false})).toMatchObject({ok:false,reason:'input_missing'});
 });
});

describe('readNonVisible (spec §5.1.1)',()=>{
 it('a same-day conflict quarantines the published row: document-bound → quarantined (current binding too)',async()=>{
  const w=await world();
  expect((await w.sync(doc([...BASE,CONFLICT]))).counts.quarantined).toBeGreaterThanOrEqual(1);
  const r=priv(w);
  expect((await r.readDocumentBound(REF,netIncome,accn(A1),TODAY)).rows).toEqual([]);
  expect(await r.readNonVisible(REF,netIncome,accn(A1),TODAY)).toBe('quarantined');
  expect(await r.readNonVisible(REF,netIncome,null,TODAY)).toBe('quarantined');
  expect(await r.readNonVisible(REF,revenue,accn(A1),TODAY)).toBeNull();
 });
 it('a key the new generation no longer carries → superseded_generation',async()=>{
  const w=await world();
  expect((await w.sync(doc(BASE.filter(e=>e.tag!=='NetIncomeLoss')),{mappingGen:2})).detail.published).toBe(1);
  const r=priv(w);
  expect((await r.readDocumentBound(REF,netIncome,accn(A1),TODAY)).rows).toEqual([]);
  expect(await r.readNonVisible(REF,netIncome,accn(A1),TODAY)).toBe('superseded_generation');
  expect(await r.readNonVisible(REF,netIncome,null,TODAY)).toBe('superseded_generation');
  expect(await r.readNonVisible(REF,netIncome,null,'2024-01-01')).toBeNull();
  expect(await r.readNonVisible(REF,netIncome,accn('0009990611-99-000009'),TODAY)).toBeNull();
  expect(await r.readNonVisible(REF,margin,null,TODAY)).toBeNull();
 });
});

describe('hints (spec §5.3.2)',()=>{
 it('late_fact (created after since), quarantine_resolved (same key prefix) and mapping_gen_raised, ordered by time',async()=>{
  const w=await world(BASE,'2026-01-01T00:00:00.000Z');
  const since='2026-02-01T00:00:00.000Z';
  await w.sync(doc([...BASE,CONFLICT]),{at:'2026-03-01T00:00:00.000Z'});
  const [item]=await w.db.openConflicts(UNIT_ISSUER,'US');
  w.db.setNow('2026-03-02T00:00:00.000Z');
  const members=await w.db.factsByIds(item.fact_ids);
  await w.db.resolveFactsQuarantine(item.id,[members.find(m=>m.value_text==='100')!.fact_id],'00000000-0000-4000-8000-0000000000dd');
  await w.sync(doc([...BASE,AMEND]),{at:'2026-04-01T00:00:00.000Z',mappingGen:2});
  const request={issuer:{market:'US' as const,cik:'9990611'},concepts:['net_income_parent'],asOf:TODAY};
  const hints=await priv(w).hints(request,since);
  const late=hints.filter(h=>h.kind==='late_fact');
  expect(late.length).toBeGreaterThanOrEqual(2);
  expect(late[0].at).toBe('2026-03-01T00:00:00.000Z');
  expect(hints.filter(h=>h.kind==='quarantine_resolved')).toEqual([{kind:'quarantine_resolved',ref:item.id,at:'2026-03-02T00:00:00.000Z'}]);
  expect(hints.filter(h=>h.kind==='mapping_gen_raised').map(h=>h.at)).toEqual(['2026-04-01T00:00:00.000Z']);
  expect(hints.map(h=>h.at)).toEqual([...hints.map(h=>h.at)].sort());
  expect(await priv(w).hints(request,'2026-05-01T00:00:00.000Z')).toEqual([]);
  expect(await priv(w).hints({...request,issuer:{market:'US',cik:'9990699'}},since)).toEqual([]);
 });
});

describe('raw object storage',()=>{
 it('memoryRawStorage lists by prefix in order and returns bytes for string or binary objects',async()=>{
  const s=memoryRawStorage(new Map<string,string|Uint8Array>([['edgar/x/b.json',new Uint8Array([1])],['edgar/x/a.meta.json','{"a":1}'],['edgar/y/c.json','z']]));
  expect(await s.list('edgar/x/')).toEqual(['edgar/x/a.meta.json','edgar/x/b.json']);
  expect(await s.get('edgar/x/a.meta.json')).toEqual(new TextEncoder().encode('{"a":1}'));
  expect(await s.get('edgar/x/none.json')).toBeNull();
 });
 it('supabaseRawStorage pages the listing, keeps snapshot names only, maps not-found to null',async()=>{
  const names=[...Array.from({length:1000},(_,i)=>`${i.toString(16).padStart(64,'0')}.json`),'notes.txt','f'.repeat(64)+'.meta.json'];
  const calls:{dir:string;offset:number}[]=[];
  const fake={storage:{from:(bucket:string)=>{expect(bucket).toBe('disclosure-raw');return {
   list:async(dir:string,o:{limit:number;offset:number})=>{calls.push({dir,offset:o.offset});return {data:names.slice(o.offset,o.offset+o.limit).map(name=>({name})),error:null};},
   download:async(path:string)=>path.endsWith('missing.json')?{data:null,error:{message:'Object not found',statusCode:'404'}}:path.endsWith('boom.json')?{data:null,error:{message:'internal',statusCode:'500'}}:{data:new Blob([new Uint8Array([7,8])]),error:null},
  };}}} as unknown as SupabaseClient;
  const s=supabaseRawStorage(fake);
  const listed=await s.list('edgar/x/');
  expect(calls).toEqual([{dir:'edgar/x',offset:0},{dir:'edgar/x',offset:1000}]);
  expect(listed).toHaveLength(1001);expect(listed.every(p=>p.startsWith('edgar/x/'))).toBe(true);expect(listed).not.toContain('edgar/x/notes.txt');
  expect(await s.get('edgar/x/a.json')).toEqual(new Uint8Array([7,8]));
  expect(await s.get('edgar/x/missing.json')).toBeNull();
  await expect(s.get('edgar/x/boom.json')).rejects.toThrow('storage_download_failed:internal');
 });
});

const GP_CONFLICT:CfEntry={tag:'GrossProfit',...FY,val:'401',accn:A3,form:'10-K/A',filed:'2024-02-15'};

describe('resolveProvenance — eligibility (spec §0 R5-6)',()=>{
 it('a quarantined top-level fact is fact_not_eligible',async()=>{
  const w=await world();
  const row=(await priv(w).readDocumentBound(REF,netIncome,accn(A1),TODAY)).rows[0];
  await w.sync(doc([...BASE,CONFLICT]));
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'fact_not_eligible'});
 });
 it('a metric with a quarantined input is input_not_eligible',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  await w.sync(doc([...BASE,GP_CONFLICT]));
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'input_not_eligible'});
 });
 it('a top-level row left behind by a gen-2 sync is not_active_generation',async()=>{
  const w=await world();const row=await revenueRow(w);
  expect((await w.sync(doc(BASE),{mappingGen:2})).detail.published).toBe(1);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'not_active_generation'});
 });
 it('a market other than the stored fact’s is fact_not_eligible',async()=>{
  const w=await world();const row=await revenueRow(w);
  expect(await priv(w).resolveProvenance({...REF,market:'CN'},row,{artifacts:true})).toMatchObject({ok:false,reason:'fact_not_eligible'});
 });
});

describe('resolveProvenance — the row must equal the stored fact (spec §0 R5-5)',()=>{
 it.each([['filing_id','00000000-0000-4000-8000-0000000000f1'],['mapping_gen',7],['unit','EUR'],['period_start','2023-01-02'],['period_end','2023-12-30']] as const)('%s disagreement is a row_mismatch',async(field,bad)=>{
  const w=await world();const row=await revenueRow(w);
  expect(await priv(w).resolveProvenance(REF,{...row,[field]:bad},{artifacts:false})).toMatchObject({ok:false,reason:`row_mismatch:${field}`});
 });
 it('a metric input whose filing_id disagrees is input:row_mismatch:filing_id',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  const bad={...row,metric:{...row.metric!,inputs:row.metric!.inputs.map(i=>({...i,filing_id:'00000000-0000-4000-8000-0000000000f1'}))}};
  expect(await priv(w).resolveProvenance(REF,bad,{artifacts:false})).toMatchObject({ok:false,reason:'input:row_mismatch:filing_id'});
 });
});

describe('resolveProvenance — the located candidate must agree (spec §0 R5-5)',()=>{
 type Cand=FactCandidate&{locator?:string};
 const stubbed=async(mutate:(c:Cand)=>Cand)=>{
  const w=await world();const row=await revenueRow(w);
  const parsers:SnapshotParsers={...PARSERS,edgar:(s,o)=>{const r=PARSERS.edgar(s,o);return {...r,candidates:r.candidates.map(c=>c.rawHash===row.raw_hash?mutate(c as Cand):c)};}};
  const r=privilegedFactsReader({db:w.db,tables:w.overlay,stateRev:async()=>null,storage:memoryRawStorage(w.storage.objects),parsers});
  return r.resolveProvenance(REF,row,{artifacts:true});
 };
 it('same rawHash but another value, unit or filing → candidate_mismatch:value|unit|source_ref',async()=>{
  expect(await stubbed(c=>({...c,value:'999'}))).toMatchObject({ok:false,reason:'candidate_mismatch:value'});
  expect(await stubbed(c=>({...c,unit:'EUR'}))).toMatchObject({ok:false,reason:'candidate_mismatch:unit'});
  expect(await stubbed(c=>({...c,filingRef:A2}))).toMatchObject({ok:false,reason:'candidate_mismatch:source_ref'});
 });
 it('a candidate without a locator is locator_missing',async()=>{
  expect(await stubbed(c=>{const {locator:_l,...rest}=c;return rest as Cand;})).toMatchObject({ok:false,reason:'locator_missing'});
 });
 it('a locator that does not rehash to the stored raw_hash is locator_hash_mismatch (the parser’s rawHash alone is not trusted)',async()=>{
  expect(await stubbed(c=>({...c,locator:`${c.locator}x`}))).toMatchObject({ok:false,reason:'locator_hash_mismatch'});
 });
 it('a failed object read is not cached: the next call retries',async()=>{
  const w=await world();const row=await revenueRow(w);
  const base=memoryRawStorage(w.storage.objects);let failures=1;
  const flaky={list:base.list,get:async(p:string)=>{if(failures-->0)throw new Error('storage_download_failed:boom');return base.get(p);}};
  const r=privilegedFactsReader({db:w.db,tables:w.overlay,stateRev:async()=>null,storage:flaky,parsers:PARSERS});
  await expect(r.resolveProvenance(REF,row,{artifacts:true})).rejects.toThrow('boom');
  expect(await r.resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:true});
 });
});

describe('resolveProvenance — Tushare rows (one statement row feeds many concepts; Codex P1)',()=>{
 const CN='00000000-0000-4000-8000-000009990622',RUN='00000000-0000-4000-8000-0000000000a1',CN_REF={issuerId:CN,market:'CN' as const};
 const fields=['ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type','update_flag','total_revenue','revenue','oper_cost','sell_exp','admin_exp'];
 const text=`{"request_id":"r","code":0,"msg":null,"data":{"fields":${JSON.stringify(fields)},"items":[["600519.SH","20240403","20240403","20231231",1,1,"4",1,1000,900,400,30,12.5]],"has_more":false}}`;
 const bytes=new TextEncoder().encode(text);
 const snap=snapshotOf(bytes,{source:'tushare',api:'income',params:{ts_code:'600519.SH',report_type:'1'},page:1});
 const parsed=parseTushareStatements([snap],{sinceYear:1900});
 const filing:FilingRow={filing_id:'fil-cn',issuer_id:CN,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-04-03',source_ref:parsed.filings[0].sourceRef,url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:RUN,created_at:'2026-01-01T00:00:00.000Z'};
 const factOf=(c:FactCandidate):FactRow=>({fact_id:`f-${c.concept}`,issuer_id:CN,market:'CN',filing_id:'fil-cn',run_id:RUN,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,duration:c.duration,value:c.value,value_text:c.value,unit:c.unit,consolidation:'consolidated',available_date:'2024-04-03',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:c.rawHash,created_at:'2026-01-01T00:00:00.000Z'});
 const facts=parsed.candidates.map(factOf);
 const path=`tushare/${CN}/${snap.sha256}.json`;
 const resolver=async()=>{
  const tables=memoryTableClient({});
  await tables.insert('fact_sync_runs',{run_id:RUN,batch_id:'b1'});
  await tables.insert('ingest_batches',{batch_id:'b1',code_version:CODE_VERSION});
  const storage=memoryRawStorage(new Map<string,string|Uint8Array>([[path,bytes],[metaPath(path),JSON.stringify({...snap.meta,sha256:snap.sha256,bytes:bytes.byteLength})]]));
  return provenanceResolver({db:{factsByIds:async ids=>facts.filter(f=>ids.includes(f.fact_id)),filingsOfIssuer:async()=>[filing]},tables,storage,parsers:PARSERS});
 };
 it('every concept of the shared row resolves to its own candidate, a summed concept included',async()=>{
  expect(new Set(facts.map(f=>f.raw_hash)).size).toBe(1);
  const resolve=await resolver();
  for(const concept of ['revenue','revenue_operating','cost_of_revenue','sga_expense']){
   const f=facts.find(x=>x.concept===concept)!;
   const p=await resolve(CN_REF,readRowOfFact(f,filing.source_ref),{artifacts:true});
   expect(p).toMatchObject({ok:true,missing:[],object_path:path,producer_code_version:CODE_VERSION});
   expect(p.locator).toMatch(/^income:rt1:p1\[end_date=20231231,ann=20240403,/);
  }
  expect(facts.find(x=>x.concept==='sga_expense')!.value_text).toBe('42.5');
 });
 it('a stored concept the row does not carry is candidate_not_found',async()=>{
  const resolve=await resolver();
  const f={...facts.find(x=>x.concept==='revenue')!,concept:'total_assets'};
  facts.push({...f,fact_id:'f-ghost'});
  expect(await resolve(CN_REF,readRowOfFact({...f,fact_id:'f-ghost'},filing.source_ref),{artifacts:true})).toMatchObject({ok:false,reason:'candidate_not_found'});
  facts.pop();
 });
});

describe('readNonVisible — superseded only counts ok rows below the active generation',()=>{
 it('a staged (then abandoned) gen-2 run is not a superseded generation',async()=>{
  const w=await world();
  const batch='00000000-0000-4000-8000-0000000000ee';
  expect(await w.db.claimLease(UNIT_ISSUER,'US',batch,60)).toBe(true);
  const run=await w.db.beginRun(UNIT_ISSUER,'US',batch,2);
  const ni=w.db.facts().find(f=>f.concept==='net_income_parent')!;
  expect(await w.db.stageFacts(run,[{fact_id:'00000000-0000-4000-8000-0000000000e1',issuer_id:UNIT_ISSUER,market:'US',filing_id:ni.filing_id,concept:ni.concept,source_concept:ni.source_concept,statement:ni.statement,period_start:ni.period_start,period_end:ni.period_end,duration:ni.duration,value:ni.value_text,unit:ni.unit,consolidation:'consolidated',available_date:ni.available_date,mapping_gen:2,mapping_version:ni.mapping_version,raw_hash:ni.raw_hash}])).toBe(1);
  expect(await priv(w).readNonVisible(REF,netIncome,accn(A1),TODAY)).toBeNull();
  await w.db.abandonRun(run);
  expect(await priv(w).readNonVisible(REF,netIncome,accn(A1),TODAY)).toBeNull();
 });
 it('a truncated includeNonOk read is a NonVisibleReadError(truncated), never a silent null',async()=>{
  const w=await world();
  const truncating:FactsReadDb={...w.db,readFacts:async()=>({stateRev:3,rows:[],truncated:true})};
  const r=privilegedFactsReader({db:truncating,tables:w.overlay,stateRev:async()=>null,storage:memoryRawStorage(w.storage.objects),parsers:PARSERS});
  await expect(r.readNonVisible(REF,netIncome,null,TODAY)).rejects.toMatchObject({name:'NonVisibleReadError',reason:'truncated'});
  expect(new NonVisibleReadError('truncated')).toBeInstanceOf(Error);
 });
});
