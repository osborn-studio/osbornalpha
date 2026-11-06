// src/lib/evals/adapters/provenance.test.ts
import {describe,expect,it} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {sha256Hex} from '../../facts/providers/shared';
import {parseTushareStatements} from '../../facts/providers/tushare-statements';
import type {FactTarget,MetricTarget,ReadRow} from '../types';
import {FORMULA_VERSION} from '../../facts/derive';
import {privilegedFactsReader} from './facts';
import {memoryRawStorage,missingFields,supabaseRawStorage} from './provenance';
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
