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
 it('returns an empty map without calling the backend',async()=>{const {reader,call,readFacts}=setup();expect(await reader.readFactsBatch([],'US',opts)).toEqual(new Map());expect(call).not.toHaveBeenCalled();expect(readFacts).not.toHaveBeenCalled();});
 if(kind!=='memory')it.each([['a'],['a','b','extra']])('rejects incomplete/extra responses %j',async(...ids)=>{
  const {reader}=setup(ids);await expect(reader.readFactsBatch(['a','b'],'US',opts)).rejects.toThrow('batch_incomplete:');
 });
});
