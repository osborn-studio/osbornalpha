import {randomUUID} from 'node:crypto';
import {memoryFactsDb} from './memory-facts-db';
import {factInsert,filingInsert} from './db-contract';
import {describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Pool} from 'pg';
import {memoryFactsBatchReader,pgFactsBatchReader,supabaseFactsBatchReader} from './read-batch';
const opts={concepts:['revenue'],asOf:'2026-04-01',history:true};
const env={state_rev:'7',rows:[],truncated:false,row_count:0};
describe.each(['supabase','pg','memory'] as const)('%s batch reader',kind=>{
 function setup(ids=['a','b']){
  const call=vi.fn(async()=>kind==='supabase'?{data:ids.map(issuer_id=>({issuer_id,...env})),error:null}:{rows:[{v:ids.map(issuer_id=>({issuer_id,...env}))}]});
  const readFacts=vi.fn(async()=>({stateRev:7,rows:[],truncated:false}));
  const reader=kind==='supabase'?supabaseFactsBatchReader({rpc:call} as unknown as SupabaseClient):kind==='pg'?pgFactsBatchReader({query:call} as unknown as Pool):memoryFactsBatchReader({readFacts});
  return {reader,call,readFacts};
 }
 it('dedupes and preserves the readFacts result',async()=>{
  const {reader,call,readFacts}=setup();const out=await reader.readFactsBatch(['a','b','a'],'US',opts);
  expect([...out]).toEqual(['a','b'].map(id=>[id,{stateRev:7,rows:[],truncated:false}]));
  if(kind==='memory')expect(readFacts).toHaveBeenCalledTimes(2);else expect(call).toHaveBeenCalledTimes(1);
 });
 it('rejects oversized batches and empty concepts before reading',async()=>{
  const {reader,call,readFacts}=setup();
  await expect(reader.readFactsBatch(Array.from({length:201},(_,i)=>String(i)),'US',opts)).rejects.toThrow('batch_too_large');
  await expect(reader.readFactsBatch(['a'],'US',{...opts,concepts:[]})).rejects.toThrow('empty_concepts');
  expect(call).not.toHaveBeenCalled();expect(readFacts).not.toHaveBeenCalled();
 });
 it('routes slices and passes all bounds explicitly',async()=>{
  const {reader,call,readFacts}=setup();
  const sliced={...opts,history:false,from:'2022-01-01',to:'2025-12-31',durations:['12M']};
  await reader.readFactsBatch(['a','b'],'US',sliced);
  if(kind==='supabase')expect(call).toHaveBeenCalledWith('read_facts_batch_slice',{p_issuers:['a','b'],p_market:'US',p_concepts:opts.concepts,p_as_of:opts.asOf,p_from:sliced.from,p_to:sliced.to,p_history:false,p_durations:['12M']});
  else if(kind==='pg')expect(call).toHaveBeenCalledWith(expect.stringContaining('public.read_facts_batch_slice('),[['a','b'],'US',opts.concepts,opts.asOf,sliced.from,sliced.to,false,['12M']]);
  else expect(readFacts).toHaveBeenCalledWith('a','US',{concepts:opts.concepts,asOf:opts.asOf,history:false,from:sliced.from,to:sliced.to});
 });
 it('keeps the legacy route for empty durations and sends null unbounded slice dates',async()=>{
  const {reader,call}=setup();
  await reader.readFactsBatch(['a','b'],'US',{...opts,durations:[]});
  if(kind==='supabase')expect(call).toHaveBeenLastCalledWith('read_facts_batch',{p_issuers:['a','b'],p_market:'US',p_concepts:opts.concepts,p_as_of:opts.asOf,p_history:true});
  if(kind==='pg')expect(call).toHaveBeenLastCalledWith(expect.stringContaining('public.read_facts_batch('),[['a','b'],'US',opts.concepts,opts.asOf,true]);
  await reader.readFactsBatch(['a','b'],'US',{...opts,durations:['12M','3M']});
  if(kind==='supabase')expect(call).toHaveBeenLastCalledWith('read_facts_batch_slice',expect.objectContaining({p_from:null,p_to:null,p_durations:['12M','3M']}));
  if(kind==='pg')expect(call).toHaveBeenLastCalledWith(expect.stringContaining('public.read_facts_batch_slice('),[['a','b'],'US',opts.concepts,opts.asOf,null,null,true,['12M','3M']]);
 });
 it('rejects bounds without nonempty durations',async()=>{
  const {reader,call,readFacts}=setup();
  for(const bounds of [{from:'2022-01-01'},{to:'2025-12-31'},{from:'2022-01-01',durations:[]}])await expect(reader.readFactsBatch(['a'],'US',{...opts,...bounds})).rejects.toThrow('slice_requires_durations');
  expect(call).not.toHaveBeenCalled();expect(readFacts).not.toHaveBeenCalled();
 });
 it('returns an empty map without calling the backend',async()=>{const {reader,call,readFacts}=setup();expect(await reader.readFactsBatch([],'US',opts)).toEqual(new Map());expect(call).not.toHaveBeenCalled();expect(readFacts).not.toHaveBeenCalled();});
 if(kind!=='memory')it.each([['a'],['a','b','extra']])('rejects incomplete/extra responses %j',async(...ids)=>{
  const {reader}=setup(ids);await expect(reader.readFactsBatch(['a','b'],'US',opts)).rejects.toThrow('batch_incomplete:');
 });
});

it('filters memory readFacts rows without changing disclosure metadata or hiding truncation',async()=>{
 const annual={duration:'12M',disclosure_seq:2,is_current:true,is_revision:true} as import('./types').FactRow;
 const quarterly={...annual,duration:'3M'} as import('./types').FactRow;
 const readFacts=vi.fn(async()=>({stateRev:7,rows:[quarterly,annual],truncated:false}));
 const reader=memoryFactsBatchReader({readFacts});
 expect((await reader.readFactsBatch(['a'],'US',{...opts,durations:['12M']})).get('a')).toEqual({stateRev:7,rows:[annual],truncated:false});
 readFacts.mockResolvedValueOnce({stateRev:7,rows:[],truncated:true});
 expect((await reader.readFactsBatch(['a'],'US',{...opts,durations:['12M']})).get('a')).toEqual({stateRev:7,rows:[],truncated:true});
});

it('matches real memory readFacts filtered after disclosure windows and date bounds',async()=>{
 const db=memoryFactsDb(),iss=randomUUID(),batch=randomUUID();
 await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',batch,60);
 const run=await db.beginRun(iss,'US',batch,1),files=[];
 for(const [i,duration] of (['3M','12M','3M','12M'] as const).entries()){
  const f=filingInsert(iss,{availableDate:`2024-0${i+1}-01`});files.push(f);
  await db.stageFilings(run,[f]);
  await db.stageFacts(run,[factInsert(iss,f,{period_start:'2023-01-01',duration,value:String(100+i)})]);
 }
 await db.stageFacts(run,[factInsert(iss,files[0],{period_start:'2021-01-01',period_end:'2021-12-31',duration:'12M'})]);
 await db.publishRun(run,files.map(f=>f.filing_id));
 const reader=memoryFactsBatchReader(db);
 for(const history of [true,false])for(const bounds of [{},{from:'2023-01-01',to:'2023-12-31'}])for(const durations of [['12M'],['12M','3M']]){
  const readOpts={...opts,history,...bounds},full=await db.readFacts(iss,'US',readOpts);
  expect((await reader.readFactsBatch([iss],'US',{...readOpts,durations})).get(iss)).toEqual({...full,rows:full.rows.filter(r=>durations.includes(r.duration))});
 }
});
it('caps memory slices after filtering the available rows',async()=>{
 const annual={duration:'12M'} as import('./types').FactRow,quarterly={duration:'3M'} as import('./types').FactRow;
 const readFacts=vi.fn(async()=>({stateRev:7,rows:[...Array(10001).fill(quarterly),annual],truncated:false}));
 const reader=memoryFactsBatchReader({readFacts});
 expect((await reader.readFactsBatch(['a'],'US',{...opts,durations:['12M']})).get('a')).toEqual({stateRev:7,rows:[annual],truncated:false});
 readFacts.mockResolvedValueOnce({stateRev:7,rows:Array(10001).fill(annual),truncated:false});
 expect((await reader.readFactsBatch(['a'],'US',{...opts,durations:['12M']})).get('a')).toEqual({stateRev:7,rows:[],truncated:true});
});
