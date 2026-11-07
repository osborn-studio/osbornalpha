// src/lib/judgments/public-reads.test.ts
// The anon read paths with a recording fake of the supabase-js query builder, the document reader
// against a temp directory, and the cohort sample reader against the memory store.
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

type R={data:unknown;error:{message:string}|null};
const mocks=vi.hoisted(()=>({calls:[] as unknown[][],result:{data:null as unknown,error:null as {message:string}|null},queue:[] as {data:unknown;error:{message:string}|null}[],store:null as unknown,dbArgs:[] as unknown[]}));
/** Each awaited query takes the next queued result, else `result` (an empty list ends a paging loop). */
const nextResult=():R=>mocks.queue.length>0?mocks.queue.shift()!:mocks.result;
function builder(){
 const b:Record<string,unknown>={};
 for(const m of ['select','eq','gt','order','limit'])b[m]=(...a:unknown[])=>{mocks.calls.push([m,...a]);return b;};
 b.maybeSingle=()=>{mocks.calls.push(['maybeSingle']);return Promise.resolve(nextResult());};
 b.then=(ok:(r:unknown)=>unknown,bad:(e:unknown)=>unknown)=>Promise.resolve(nextResult()).then(ok,bad);
 return b;
}
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({tag:'anon',from:(t:string)=>{mocks.calls.push(['from',t]);return builder();}})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({tag:'admin'})}));
vi.mock('@/lib/judgments/db',()=>({supabaseJudgmentsDb:(c:unknown)=>{mocks.dbArgs.push(c);return {tag:'db'};}}));
vi.mock('@/lib/judgments/cohort-store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/judgments/cohort-store')>(),supabaseCohortStore:()=>mocks.store}));

import {memoryCohortStore} from './cohort-store';
import {sha256} from './canonical';
import {publicReads,readCohortSample,readMethodologyDoc} from './public-reads';

describe('publicReads',()=>{
 beforeEach(()=>{mocks.calls=[];mocks.result={data:null,error:null};mocks.queue=[];mocks.dbArgs=[];});
 it('wires JudgmentsDb with the anon client in both slots',()=>{
  publicReads();
  expect(mocks.dbArgs[0]).toEqual({anon:expect.objectContaining({tag:'anon'}),admin:expect.objectContaining({tag:'anon'})});
 });
 it('judgmentLocator selects the five locator columns by id through anon',async()=>{
  mocks.result={data:{subject_type:'issuer',subject_key:'k',judgment_type:'synthetic_fact_metric',methodology_id:'m',methodology_version:'v1'},error:null};
  expect(await publicReads().judgmentLocator('id-1')).toMatchObject({subject_key:'k'});
  expect(mocks.calls).toEqual([['from','judgments'],['select','subject_type,subject_key,judgment_type,methodology_id,methodology_version'],['eq','judgment_id','id-1'],['maybeSingle']]);
  mocks.result={data:null,error:null};
  expect(await publicReads().judgmentLocator('id-2')).toBeNull();
 });
 it('settlements are ordered by seq and normalised to toISOString() timestamps',async()=>{
  mocks.queue=[{data:[{settlement_id:'s',seq:'1',settled_at:'2026-03-01T03:00:00+00:00',kind:'settled'}],error:null},{data:[],error:null}];
  expect(await publicReads().settlements('id-1')).toEqual([{settlement_id:'s',seq:1,settled_at:'2026-03-01T03:00:00.000Z',kind:'settled'}]);
  expect(mocks.calls).toContainEqual(['order','seq',{ascending:true}]);
 });
 it('settlement history pages by seq until an EMPTY page: a server cap below the page size never truncates it (P2-01)',async()=>{
  const s=(seq:number)=>({settlement_id:`s${seq}`,seq,settled_at:'2026-03-01T03:00:00+00:00',kind:seq===1?'settled':seq%2===0?'withdrawn':'reopened'});
  mocks.queue=[{data:[s(1),s(2)],error:null},{data:[s(3)],error:null},{data:[s(4),s(5)],error:null},{data:[],error:null}];   // capped at 2 rows per response
  expect((await publicReads().settlements('id-1')).map(x=>x.seq)).toEqual([1,2,3,4,5]);
  expect(mocks.calls.filter(c=>c[0]==='gt')).toEqual([['gt','seq',0],['gt','seq',2],['gt','seq',3],['gt','seq',5]]);
  expect(mocks.calls).toContainEqual(['limit',500]);
 });
 it('recentSettlements inner-joins judgments of the method and flattens the subject',async()=>{
  mocks.result={data:[{settlement_id:'s',seq:2,settled_at:'2026-03-01T03:00:00+00:00',judgments:{subject_type:'issuer',subject_key:'k',judgment_type:'t',methodology_id:'m',methodology_version:'v1'}}],error:null};
  const r=await publicReads().recentSettlements('m','v1',20);
  expect(r).toEqual([{settlement_id:'s',seq:2,settled_at:'2026-03-01T03:00:00.000Z',subject_type:'issuer',subject_key:'k',judgment_type:'t'}]);
  expect(mocks.calls).toEqual(expect.arrayContaining([['eq','judgments.methodology_id','m'],['eq','judgments.methodology_version','v1'],['order','settled_at',{ascending:false}],['limit',20]]));
 });
 it('a PostgREST error is thrown without leaking into the result',async()=>{
  mocks.result={data:null,error:{message:'permission denied'}};
  await expect(publicReads().settlements('x')).rejects.toThrow('settlements_failed');
 });
});

describe('readMethodologyDoc',()=>{
 const cwd=process.cwd();let dir:string;
 beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'f4-doc-'));mkdirSync(join(dir,'docs/methodologies/macro_regime'),{recursive:true});writeFileSync(join(dir,'docs/methodologies/macro_regime/v1.md'),'# macro');process.chdir(dir);});
 afterEach(()=>{process.chdir(cwd);});
 it('reads the registry path under docs/methodologies and checks its sha256',async()=>{
  expect(await readMethodologyDoc('docs/methodologies/macro_regime/v1.md',sha256(Buffer.from('# macro')))).toEqual({markdown:'# macro',sha256_matches:true});
  expect(await readMethodologyDoc('docs/methodologies/macro_regime/v1.md','0'.repeat(64))).toEqual({markdown:'# macro',sha256_matches:false});
  expect(await readMethodologyDoc('docs/methodologies/macro_regime/v2.md','0'.repeat(64))).toEqual({markdown:null,sha256_matches:false});
 });
 it('never leaves docs/methodologies',async()=>{
  for(const p of ['../etc/passwd','docs/methodologies/../../secret.md','docs/methodologies/macro_regime/v1.txt'])expect(await readMethodologyDoc(p,'0'.repeat(64))).toEqual({markdown:null,sha256_matches:false});
 });
});

describe('readCohortSample',()=>{
 it.each(['null','{','[]'])('reports invalid cohort JSON %s as integrity_failed',async raw=>{
  const store=memoryCohortStore();mocks.store=store;
  const bytes=new TextEncoder().encode(raw),sha=sha256(bytes),path=`cohorts/${sha}.json`;
  await store.put(path,bytes,{upsert:false});
  expect(await readCohortSample(path,sha)).toEqual({status:'integrity_failed',entries:null});
 });
 it('returns entries only when the bytes match cohort_sha256',async()=>{
  const store=memoryCohortStore();mocks.store=store;
  const bytes=new TextEncoder().encode(JSON.stringify({entries:[{judgment_id:'a'}]}));
  const sha=sha256(bytes);const path=`cohorts/${sha}.json`;
  await store.put(path,bytes,{upsert:false});
  expect(await readCohortSample(path,sha)).toEqual({status:'ok',entries:[{judgment_id:'a'}]});
  expect(await readCohortSample(path,'0'.repeat(64))).toEqual({status:'integrity_failed',entries:null});
  expect(await readCohortSample(`cohorts/${'1'.repeat(64)}.json`,'1'.repeat(64))).toEqual({status:'missing',entries:null});
 });
});
