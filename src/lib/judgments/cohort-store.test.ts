// src/lib/judgments/cohort-store.test.ts
import {describe,expect,it} from 'vitest';
import {COHORT_BUCKET,isCohortPath,memoryCohortStore,supabaseCohortStore} from './cohort-store';
import type {SupabaseClient} from '@supabase/supabase-js';

const G='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',A='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',J='00000000-0000-4000-8000-000000000003';
const PARTIAL=`partial/macro_regime@v2.all/${G}/start.${A}.json`;
const bytes=(s:string)=>new TextEncoder().encode(s);

describe('cohort paths',()=>{
 it('accepts per-attempt partial pages and content-addressed cohorts only',()=>{
  for(const p of [PARTIAL,`partial/macro_regime@v2.market.HK/${G}/${J}.${A}.json`,`partial/m_x@v12.subject_type.macro_region/${G}/start.${A}.json`,`cohorts/${'a'.repeat(64)}.json`])expect(isCohortPath(p),p).toBe(true);
  for(const p of ['../x.json',`partial/macro_regime@v2.all/${G}/start.json`,`cohorts/${'a'.repeat(63)}.json`,`partial/Macro@v1.all/${G}/start.${A}.json`,`cohorts/${'A'.repeat(64)}.json`])expect(isCohortPath(p),p).toBe(false);
 });
});
describe('memoryCohortStore',()=>{
 it('upsert:false semantics, copies in and out, null for a missing object, remove',async()=>{
  const s=memoryCohortStore();const b=bytes('{"a":1}');
  expect(await s.put(PARTIAL,b,{upsert:false})).toBe('stored');
  b[0]=0;
  expect(new TextDecoder().decode((await s.get(PARTIAL))!)).toBe('{"a":1}');
  expect(await s.put(PARTIAL,bytes('{"b":2}'),{upsert:false})).toBe('exists');
  expect(new TextDecoder().decode((await s.get(PARTIAL))!)).toBe('{"a":1}');
  await s.remove(PARTIAL);
  expect(await s.get(PARTIAL)).toBeNull();
  await expect(s.put('x.json',b,{upsert:false})).rejects.toThrow('cohort_path_invalid');
 });
});
describe('supabaseCohortStore',()=>{
 function fake(responses:{upload?:unknown;download?:unknown;remove?:unknown}){
  const calls:unknown[][]=[];
  const api={upload:async(...a:unknown[])=>{calls.push(['upload',...a]);return responses.upload??{error:null};},download:async(...a:unknown[])=>{calls.push(['download',...a]);return responses.download??{data:new Blob(['{}']),error:null};},remove:async(...a:unknown[])=>{calls.push(['remove',...a]);return responses.remove??{error:null};}};
  const client={storage:{from:(b:string)=>{calls.push(['from',b]);return api;}}} as unknown as SupabaseClient;
  return {client,calls};
 }
 it('uploads to the judgments-calibration bucket with upsert:false; 409 → exists; other errors throw',async()=>{
  const f=fake({});
  expect(await supabaseCohortStore(f.client).put(PARTIAL,bytes('{}'),{upsert:false})).toBe('stored');
  expect(f.calls[0]).toEqual(['from',COHORT_BUCKET]);
  expect(f.calls[1]).toEqual(['upload',PARTIAL,bytes('{}'),{contentType:'application/json',upsert:false}]);
  expect(await supabaseCohortStore(fake({upload:{error:{message:'The resource already exists',statusCode:'409'}}}).client).put(PARTIAL,bytes('{}'),{upsert:false})).toBe('exists');
  await expect(supabaseCohortStore(fake({upload:{error:{message:'boom',statusCode:'500'}}}).client).put(PARTIAL,bytes('{}'),{upsert:false})).rejects.toThrow('cohort_upload_failed');
 });
 it('download: bytes, null when the object is missing, throw otherwise; remove',async()=>{
  expect(new TextDecoder().decode((await supabaseCohortStore(fake({download:{data:new Blob(['{"x":1}']),error:null}}).client).get(PARTIAL))!)).toBe('{"x":1}');
  expect(await supabaseCohortStore(fake({download:{data:null,error:{message:'Object not found',statusCode:'400'}}}).client).get(PARTIAL)).toBeNull();
  await expect(supabaseCohortStore(fake({download:{data:null,error:{message:'timeout',statusCode:'500'}}}).client).get(PARTIAL)).rejects.toThrow('cohort_download_failed');
  const f=fake({});await supabaseCohortStore(f.client).remove(PARTIAL);
  expect(f.calls).toContainEqual(['remove',[PARTIAL]]);
 });
});
