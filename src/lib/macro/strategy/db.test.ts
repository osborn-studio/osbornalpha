// src/lib/macro/strategy/db.test.ts
// memoryStrategyDb against the shared contract, plus the supabaseStrategyDb wiring (RPC names and argument names,
// select chains per role, row normalisation, error mapping) over stub clients.
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';
import {StrategyDbError,memoryStrategyDb,supabaseStrategyDb,toStrategyDbError} from './db';
import {strategyDbContract,testManifest} from './db-contract';

strategyDbContract('memoryStrategyDb contract',async()=>{
 let t=Date.parse('2026-11-07T00:00:00.000Z');
 const db=memoryStrategyDb({now:()=>new Date(t)});
 return {db,asUser:id=>db._userId(id),ageClaim:async(_id,minutes)=>{t+=minutes*60000+1;}};
},5000);

type Call=[string,...unknown[]];
/** Stub Supabase client: records every call; rpc answers from `rpc`, table selects answer rows from `tables`. */
function stub(rpc:(fn:string,args:Record<string,unknown>)=>{data:unknown;error:unknown},tables:Record<string,Record<string,unknown>[]>={}){
 const calls:Call[]=[];
 const client={
  rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push(['rpc',fn,args]);return rpc(fn,args);},
  from:(table:string)=>{
   const b={
    select:(cols:string)=>{calls.push(['select',table,cols]);return b;},
    eq:(k:string,v:unknown)=>{calls.push(['eq',k,v]);return b;},
    in:(k:string,v:unknown)=>{calls.push(['in',k,v]);return b;},
    order:(k:string,o:unknown)=>{calls.push(['order',k,o]);return b;},
    limit:async(n:number)=>{calls.push(['limit',n]);return {data:tables[table]??[],error:null};},
   };
   return b;
  },
 };
 return {calls,client:client as unknown as SupabaseClient};
}

describe('supabaseStrategyDb wiring',()=>{
 it('putManifest sends the canonical hash and the body fields to macro_put_manifest, then reads only validated metadata as admin',async()=>{
  const body=testManifest('cycle_table',{salt:'s'});const hash=sha256Hex(canonicalJson(body));
  const row={manifest_id:'11111111-1111-4111-8111-111111111111',manifest_hash:hash,body,created_at:'2026-11-07 01:02:03.456789+00'};
  const admin=stub(()=>({data:row.manifest_id,error:null}),{macro_strategy_manifests:[row]});const anon=stub(()=>({data:null,error:null}));
  const db=supabaseStrategyDb({admin:admin.client,anon:anon.client});
  expect(await db.putManifest(body)).toEqual({manifest_id:row.manifest_id,manifest_hash:hash,body,created_at:'2026-11-07T01:02:03.456Z'});
  expect(admin.calls[0]).toEqual(['rpc','macro_put_manifest_json',{p_kind:'cycle_table',p_body:body,p_manifest_hash:hash,p_cutoff:body.cutoff,p_method_version:body.method_version,p_code_version:body.code_version,p_catalog_version:body.catalog_version}]);
  expect(admin.calls.slice(1)).toEqual([['select','macro_strategy_manifests','manifest_id,manifest_hash,created_at'],['eq','manifest_id',row.manifest_id],['limit',1]]);
  expect(anon.calls).toEqual([]);
 });
 it('reads reviews through the anon client and normalises generation and timestamps',async()=>{
  const rid='22222222-2222-4222-8222-222222222222';
  const anon=stub(()=>({data:null,error:null}),{
   macro_review_current:[{region:'US',month:'2026-10',result_id:rid,generation:'3',cutoff:'2026-11-03T00:00:00+00:00',updated_at:'2026-11-01T00:00:00+00:00'}],
   macro_review_results:[{result_id:rid,region:'US',month:'2026-10',status:'ok',manifest_id:'m',manifest_hash:'h',facts:{},method_version:'macro-review/1',code_version:'c',created_at:'2026-11-01T00:00:00+00:00'}],
  });
  const db=supabaseStrategyDb({admin:stub(()=>({data:null,error:null})).client,anon:anon.client});
  expect(await db.reviewCurrent('US','2026-10')).toMatchObject({generation:3,cutoff:'2026-11-03T00:00:00.000Z',result:{result_id:rid,created_at:'2026-11-01T00:00:00.000Z'}});
  expect(await db.reviewIndex('US',36)).toEqual([{month:'2026-10',status:'ok',generation:3,result_id:rid,updated_at:'2026-11-01T00:00:00.000Z'}]);
  expect(anon.calls).toContainEqual(['order','month',{ascending:false}]);
  expect(anon.calls).toContainEqual(['in','result_id',[rid]]);
 });
 it('maps raised codes to StrategyDbError and everything else to rpc_failed',async()=>{
  const admin=stub(()=>({data:null,error:{message:'payload_conflict',code:'P0001'}}));
  const db=supabaseStrategyDb({admin:admin.client,anon:stub(()=>({data:null,error:null})).client});
  await expect(db.claimExplanation({userId:'u',requestId:'r',payloadHash:'a'.repeat(64),subjectKind:'review',subjectId:'s',locale:'en',manifestId:'m'})).rejects.toMatchObject({name:'StrategyDbError',code:'payload_conflict'});
  expect(toStrategyDbError({message:'invalid_transition'}).code).toBe('invalid_transition');
  expect(toStrategyDbError({message:'not_found'}).code).toBe('not_found');
  expect(toStrategyDbError({message:'cutoff_mismatch'}).code).toBe('cutoff_mismatch');
  expect(toStrategyDbError({message:'invalid_argument'}).code).toBe('invalid_argument');
  expect(toStrategyDbError(new Error('connection reset'))).toMatchObject({code:'rpc_failed',message:'connection reset'});
  const e=new StrategyDbError('stale_generation');expect(toStrategyDbError(e)).toBe(e);
 });
 it('publishReview sends a missing expected generation as null so the RPC raises invalid_argument, and maps it',async()=>{
  const admin=stub(()=>({data:null,error:{message:'invalid_argument',code:'P0001'}}));
  const db=supabaseStrategyDb({admin:admin.client,anon:stub(()=>({data:null,error:null})).client});
  await expect(db.publishReview({region:'US',month:'2026-10',expectedGeneration:undefined as unknown as number,cutoff:'2026-11-03T00:00:00.000Z',status:'ok',manifestId:'m',manifestHash:'h',facts:{} as never,methodVersion:'v',codeVersion:'c'})).rejects.toMatchObject({code:'invalid_argument'});
  expect(admin.calls[0]).toMatchObject(['rpc','macro_publish_review',{p_expected_generation:null,p_cutoff:'2026-11-03T00:00:00.000Z'}]);
 });
 it('explanationsOf needs the session client; it filters by subject and orders newest first',async()=>{
  const db=supabaseStrategyDb({admin:stub(()=>({data:null,error:null})).client,anon:stub(()=>({data:null,error:null})).client});
  await expect(db.explanationsOf('session','review','x',20)).rejects.toMatchObject({code:'rpc_failed',message:'no_session_client'});
  const session=stub(()=>({data:null,error:null}),{macro_explanations:[]});
  const db2=supabaseStrategyDb({admin:stub(()=>({data:null,error:null})).client,anon:stub(()=>({data:null,error:null})).client,session:session.client});
  expect(await db2.explanationsOf('session','review','x',20)).toEqual([]);
  expect(session.calls).toEqual([['select','macro_explanations','*'],['eq','subject_kind','review'],['eq','subject_id','x'],['order','created_at',{ascending:false}],['order','explanation_id',{ascending:false}],['limit',20]]);
 });
 it('recordCompletion / expireExplanations call their RPCs with the argument names; reviewResult reads one result as anon',async()=>{
  const rid='22222222-2222-4222-8222-222222222222',uid='33333333-3333-4333-8333-333333333333';
  const admin=stub(fn=>({data:fn==='macro_expire_explanations'?2:null,error:null}));
  const anon=stub(()=>({data:null,error:null}),{macro_review_results:[{result_id:rid,region:'CN',month:'2026-09',status:'ok',manifest_id:'m',manifest_hash:'h',facts:{},method_version:'macro-review/1',code_version:'c',created_at:'2026-10-03T00:00:00+00:00'}]});
  const db=supabaseStrategyDb({admin:admin.client,anon:anon.client});
  await db.recordCompletion({explanationId:rid,rawOutput:undefined,finalizePayload:{status:'failed',byo:true}});
  expect(admin.calls[0]).toEqual(['rpc','macro_record_completion',{p_explanation_id:rid,p_raw_output:null,p_finalize_payload:{status:'failed',byo:true}}]);
  expect(await db.expireExplanations(uid)).toBe(2);
  expect(admin.calls[1]).toEqual(['rpc','macro_expire_explanations',{p_user_id:uid}]);
  expect(await db.reviewResult(rid)).toMatchObject({result_id:rid,region:'CN',created_at:'2026-10-03T00:00:00.000Z'});
  expect(anon.calls).toEqual([['select','macro_review_results','*'],['eq','result_id',rid],['limit',1]]);
  expect(await db.reviewResult('CN:2026-09')).toBeNull();expect(await db.expireExplanations('x')).toBe(0);
  expect(admin.calls).toHaveLength(2);expect(anon.calls).toHaveLength(3);
 });
 it('finishExplanation sends p_finalize_payload; runDetail and recoverableRuns read run rows as admin',async()=>{
  const rid='22222222-2222-4222-8222-222222222222',uid='33333333-3333-4333-8333-333333333333';
  const proj={explanation_id:rid,subject_kind:'review',subject_id:'s',locale:'zh',manifest_id:'m',state:'failed',rendered:null,failure_codes:['provider_error'],provider:null,model:null,
   prompt_version:'p',validator_version:'v',created_at:'2026-11-07T00:00:00+00:00',finished_at:'2026-11-07T00:00:01+00:00'};
  const row=(id:string,raw:unknown)=>({explanation_id:id,user_id:uid,state:'running',locale:'en',manifest_id:'m',usage_audit_key:id,raw_output:raw,finalize_payload:null,finalized:false});
  const admin=stub(()=>({data:proj,error:null}),{macro_explanation_runs:[row(rid,{content:'x'}),row('44444444-4444-4444-8444-444444444444',null)]});
  const db=supabaseStrategyDb({admin:admin.client,anon:stub(()=>({data:null,error:null})).client});
  await db.finishExplanation({explanationId:rid,state:'failed',provider:null,model:null,promptVersion:'p',validatorVersion:'v',rawOutput:null,validation:{},rendered:null,failureCodes:['provider_error'],accounting:null,finalizePayload:{status:'failed',byo:false}});
  expect(admin.calls[0]).toEqual(['rpc','macro_finish_explanation',{p_explanation_id:rid,p_state:'failed',p_provider:null,p_model:null,p_prompt_version:'p',p_validator_version:'v',p_raw_output:null,
   p_validation:{},p_rendered:null,p_failure_codes:['provider_error'],p_accounting:null,p_finalize_payload:{status:'failed',byo:false}}]);
  expect(await db.runDetail(rid)).toEqual(row(rid,{content:'x'}));   // the stub answers its first row
  expect(admin.calls.slice(1,4)).toEqual([['select','macro_explanation_runs','*'],['eq','explanation_id',rid],['limit',1]]);
  expect(await db.recoverableRuns(uid,3)).toEqual([rid]);            // the row without a recorded output is dropped
  expect(admin.calls.slice(4)).toEqual([['select','macro_explanation_runs','*'],['eq','user_id',uid],['eq','state','running'],['order','claimed_at',{ascending:true}],['order','explanation_id',{ascending:true}],['limit',50]]);
  expect(await db.runDetail('x')).toBeNull();expect(await db.recoverableRuns('x',3)).toEqual([]);
  expect(admin.calls).toHaveLength(10);
 });
 it('runOf and manifest short-circuit non-uuid ids without a query',async()=>{
  const admin=stub(()=>({data:null,error:null}));const anon=stub(()=>({data:null,error:null}));
  const db=supabaseStrategyDb({admin:admin.client,anon:anon.client});
  expect(await db.runOf('x','y')).toBeNull();expect(await db.manifest('nope')).toBeNull();
  expect([...admin.calls,...anon.calls]).toEqual([]);
 });
});

describe('memoryStrategyDb specifics',()=>{
 it('recordReviewAttempt rejects a non-failed status like the SQL function',async()=>{
  const db=memoryStrategyDb();
  await expect(db.recordReviewAttempt('US','2026-10','ok' as 'failed',{})).rejects.toMatchObject({code:'rpc_failed',message:'invalid_status'});
 });
 it('explanationsOf without a session identity returns nothing (auth.uid() is null)',async()=>{
  const db=memoryStrategyDb();const m=await db.putManifest(testManifest('explain_facts'));
  await db.claimExplanation({userId:'00000000-0000-4000-8000-000000000001',requestId:'00000000-0000-4000-8000-000000000002',payloadHash:'a'.repeat(64),subjectKind:'snapshot',subjectId:'snap:US:x',locale:'en',manifestId:m.manifest_id});
  expect(await db.explanationsOf('session','snapshot','snap:US:x',20)).toEqual([]);
 });
});
