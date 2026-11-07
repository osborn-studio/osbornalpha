// src/lib/macro/strategy/strategy.integration.test.ts
// Macro strategy storage on real PostgreSQL (spec §4.4 draft 3, §12; critical suite): the 20261115090000 migration
// replays; six RLS tables with select-only grants per role; the projection is readable only by its owner; the eight
// RPCs are service-role only; every RPC state-machine branch: macro_put_manifest idempotency, macro_publish_review
// (absent pointer = generation 0, replayed before stale, A→B→A, stale generation, older cutoff, concurrency, attempt
// log), macro_record_review_attempt, macro_claim_explanation (claimed / existing / payload_conflict / abandoned after
// five minutes — made testable by moving claimed_at back), the row lock shared by claim / expire and finish (an expiring
// claim never overwrites a concurrent finish), macro_record_completion (durable raw output + finalize payload),
// macro_finish_explanation (idempotent, invalid_transition, late_output, stores a missing finalize payload, never
// overwrites one), macro_mark_finalized (needs a recorded payload, any state) and macro_expire_explanations; a running row
// with a recorded completion is never abandoned (claim and expire skip it). Rows are never cleaned up: test:db creates a fresh database per run, and
// every case uses its own month or random user / request ids.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261115090000_macro_strategy.sql';
const TABLES=['macro_strategy_manifests','macro_review_results','macro_review_current','macro_review_attempts','macro_explanation_runs','macro_explanations'];
const PUBLIC_READ=['macro_strategy_manifests','macro_review_results','macro_review_current'];
const SERVICE_ONLY=['macro_review_attempts','macro_explanation_runs'];
const RPCS=['public.macro_put_manifest(text,jsonb,text,timestamptz,text,text,text)','public.macro_publish_review(text,text,bigint,timestamptz,text,uuid,text,jsonb,text,text)',
 'public.macro_record_review_attempt(text,text,text,jsonb)','public.macro_claim_explanation(uuid,uuid,text,text,text,text,uuid)',
 'public.macro_record_completion(uuid,jsonb,jsonb)','public.macro_finish_explanation(uuid,text,text,text,text,text,jsonb,jsonb,jsonb,text[],jsonb,jsonb)',
 'public.macro_mark_finalized(uuid)','public.macro_expire_explanations(uuid)'];

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}
type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const HEX=(c:string)=>c.repeat(64);
// A month no other case uses: consecutive months from a random year in 3000–4999 (contract cases use 6000+), so a rerun
// against a reused database does not collide either.
let monthSeq=(3000+Math.floor(Math.random()*2000))*12;
const freshMonth=()=>{const n=monthSeq++;return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;};

describe.skipIf(!enabled)('macro strategy migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 /** Runs `sql` as `role` (optionally with auth.uid() = sub) in its own rolled-back transaction. */
 const asRole=async(role:string,sql:string,values:unknown[]=[],sub?:string)=>{
  const c=await admin.connect();
  try{
   await c.query('begin');
   if(sub)await c.query(`select set_config('request.jwt.claim.sub',$1,true)`,[sub]);
   await c.query(`set local role ${role}`);
   return (await c.query(sql,values)).rows as Record<string,any>[];
  }finally{await c.query('rollback').catch(()=>{});c.release();}
 };
 const manifestBody=(kind:string,salt:string=randomUUID())=>({kind,params:{salt},cutoff:'3000-01-31T23:59:59.000Z',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],catalog_version:'cv',method_version:'mv',code_version:'code'});
 /** macro_put_manifest with an explicit hash (the TS side computes sha256 of the canonical body; any hex64 works here). */
 const put=(kind:string,hash:string,body:Record<string,unknown>=manifestBody(kind),cutoff='3000-01-31T23:59:59Z')=>
  one(`select public.macro_put_manifest($1,$2::jsonb,$3,$4,'mv','code','cv') v`,[kind,JSON.stringify(body),hash,cutoff]) as Promise<string>;
 const newHash=()=>randomUUID().replace(/-/g,'').padEnd(64,'0');
 const reviewManifest=async()=>{const h=newHash();return {id:await put('review',h),hash:h};};
 const publish=(region:string,month:string,expected:number,m:{id:string;hash:string},cutoff='3000-01-31T23:59:59Z')=>
  one(`select public.macro_publish_review($1,$2,$3,$4,'ok',$5,$6,$7::jsonb,'macro-review/1','code') v`,[region,month,expected,cutoff,m.id,m.hash,JSON.stringify({region,month})]) as Promise<{result_id:string;generation:number;outcome:string}>;
 const pointer=async(region:string,month:string)=>(await q(`select result_id,generation::int generation,cutoff from public.macro_review_current where region=$1 and month=$2`,[region,month]))[0]??null;
 const attempts=async(region:string,month:string)=>(await q(`select status,result_id from public.macro_review_attempts where region=$1 and month=$2 order by created_at,attempt_id`,[region,month]));
 const explainManifest=()=>put('explain_facts',newHash());
 type Claim={outcome:string;explanation_id:string;usage_audit_key:string;projection:Record<string,any>};
 const claim=(a:{user:string;request:string;payload?:string;manifest:string})=>
  one(`select public.macro_claim_explanation($1,$2,$3,'review','subject-1','zh',$4) v`,[a.user,a.request,a.payload??HEX('a'),a.manifest]) as Promise<Claim>;
 const newClaim=async()=>{const a={user:randomUUID(),request:randomUUID(),manifest:await explainManifest()};return {a,c:await claim(a)};};
 const FINISH_SQL=`select public.macro_finish_explanation($1,$2,'prov','model','macro-explain-prompt/1','macro-explain-validator/1',$3::jsonb,'{"ok":true}'::jsonb,$4::jsonb,$5::text[],$6::jsonb,$7::jsonb) v`;
 type FinishOpts={rendered?:unknown;codes?:string[];accounting?:unknown;payload?:unknown};
 const finishArgs=(id:string,state:string,raw:unknown,o:FinishOpts={})=>
  [id,state,JSON.stringify(raw),o.rendered===undefined?null:JSON.stringify(o.rendered),o.codes??[],JSON.stringify(o.accounting??{tokens:1}),o.payload===undefined?null:JSON.stringify(o.payload)];
 const finish=(id:string,state:string,raw:unknown,o:FinishOpts={})=>
  one(FINISH_SQL,finishArgs(id,state,raw,o)) as Promise<Record<string,any>>;
 const PAYLOAD={status:'completed',provider:'prov',model:'model',inputTokens:3,outputTokens:2,costMicrormb:5,pricingVersion:'p1',usdCnyMicros:7100000,usageEstimated:false,byo:false};
 const record=(id:string,raw:unknown,payload:unknown=PAYLOAD)=>
  one(`select public.macro_record_completion($1,$2::jsonb,$3::jsonb) v`,[id,JSON.stringify(raw),payload===null?null:JSON.stringify(payload)]);
 const expire=(user:string)=>one(`select public.macro_expire_explanations($1) v`,[user]) as Promise<number>;
 const run=async(id:string)=>(await q(`select state,finalized,raw_output,finalize_payload,accounting,late_output,finished_at from public.macro_explanation_runs where explanation_id=$1`,[id]))[0];
 /** Runs `first` in an open transaction, starts `second` (which must wait on the row lock), commits, then awaits `second`. */
 const serialized=async<T>(first:{sql:string;values:unknown[]},second:()=>Promise<T>):Promise<T>=>{
  const c=await admin.connect();
  try{
   await c.query('begin');await c.query(first.sql,first.values);
   const pending=second();await sleep(300);
   await c.query('commit');
   return await pending;
  }catch(e){await c.query('rollback').catch(()=>{});throw e;}
  finally{c.release();}
 };
 const age=(id:string,minutes:number)=>q(`update public.macro_explanation_runs set claimed_at=claimed_at-make_interval(mins=>$2) where explanation_id=$1`,[id,minutes]);
 const RENDERED={facts:[{fact_id:'f1',text:'t'}],hypotheses:[{text:'h',fact_ids:['f1']}],counterpoints:[]};

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl,statement_timeout:10000});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates six RLS tables with select-only grants, eight service-only RPCs, and replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const t of PUBLIC_READ)for(const role of ['anon','authenticated','service_role'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
  for(const t of SERVICE_ONLY){for(const role of ['anon','authenticated'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:false});expect(await priv('service_role',t,'SELECT')).toBe(true);}
  expect(await priv('anon','macro_explanations','SELECT')).toBe(false);
  expect(await priv('authenticated','macro_explanations','SELECT')).toBe(true);
  expect(await priv('service_role','macro_explanations','SELECT')).toBe(true);
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const sig of RPCS){
   for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
   expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
  }
  for(const role of ['anon','authenticated','service_role'])expect(await fn(role,'public.macro_explanation_projection(uuid)')).toBe(false);
  for(const sig of RPCS)expect(await one(`select p.prosecdef v from pg_proc p where p.oid=$1::regprocedure`,[sig])).toBe(true);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },60000);

 it('RLS: anon reads manifests and reviews, never runs, attempts or projections; a user reads only their own projection',async()=>{
  const m=await reviewManifest();const month=freshMonth();await publish('US',month,0,m);
  expect((await asRole('anon',`select manifest_id from public.macro_strategy_manifests where manifest_id=$1`,[m.id])).length).toBe(1);
  expect((await asRole('anon',`select result_id from public.macro_review_current where month=$1`,[month])).length).toBe(1);
  expect((await asRole('anon',`select result_id from public.macro_review_results where month=$1`,[month])).length).toBe(1);
  for(const t of [...SERVICE_ONLY,'macro_explanations'])await expect(asRole('anon',`select 1 from public.${t}`)).rejects.toMatchObject({code:'42501'});
  for(const t of SERVICE_ONLY)await expect(asRole('authenticated',`select 1 from public.${t}`,[],randomUUID())).rejects.toMatchObject({code:'42501'});
  const {a,c}=await newClaim();
  expect((await asRole('authenticated',`select explanation_id from public.macro_explanations where explanation_id=$1`,[c.explanation_id],a.user)).map(r=>r.explanation_id)).toEqual([c.explanation_id]);
  expect(await asRole('authenticated',`select explanation_id from public.macro_explanations where explanation_id=$1`,[c.explanation_id],randomUUID())).toEqual([]);
  expect(await asRole('authenticated',`select explanation_id from public.macro_explanations where explanation_id=$1`,[c.explanation_id])).toEqual([]);   // no auth.uid()
  for(const role of ['anon','authenticated'])await expect(asRole(role,`select public.macro_mark_finalized($1)`,[c.explanation_id],randomUUID())).rejects.toMatchObject({code:'42501'});
  for(const role of ['anon','authenticated'])await expect(asRole(role,`insert into public.macro_strategy_manifests(kind,body,manifest_hash,cutoff,method_version,code_version,catalog_version) values('review','{"kind":"review"}',$1,now(),'m','c','k')`,[newHash()],randomUUID())).rejects.toMatchObject({code:'42501'});
  expect((await asRole('service_role',`select public.macro_put_manifest('review',$1::jsonb,$2,now(),'m','c','k') v`,[JSON.stringify(manifestBody('review')),newHash()]))[0].v).toMatch(/^[0-9a-f-]{36}$/);
 });

 it('macro_put_manifest: same hash → same id; other hash → other id; same hash with another body → payload_conflict; checks hash, kind and body.kind',async()=>{
  const h=newHash();const body=manifestBody('transmission','x');
  const id=await put('transmission',h,body);
  expect(await put('transmission',h,body)).toBe(id);
  expect(await put('transmission',h,{...body})).toBe(id);   // jsonb equality ignores key order
  expect(await put('transmission',newHash(),manifestBody('transmission','y'))).not.toBe(id);
  expect(await fails(put('transmission',h,manifestBody('transmission','z')))).toMatchObject({message:'payload_conflict'});
  expect(await fails(put('transmission','ABC',body))).toMatchObject({code:'23514'});
  expect(await fails(put('weather',newHash(),{...body,kind:'weather'}))).toMatchObject({code:'23514'});
  expect(await fails(put('review',newHash(),body))).toMatchObject({code:'23514'});   // body.kind must equal kind
  expect(await q(`select kind,manifest_hash,cutoff=$2::timestamptz same_cutoff,method_version,code_version,catalog_version from public.macro_strategy_manifests where manifest_id=$1`,[id,'3000-01-31T23:59:59Z']))
   .toEqual([{kind:'transmission',manifest_hash:h,same_cutoff:true,method_version:'mv',code_version:'code',catalog_version:'cv'}]);
 });

 it('macro_publish_review: absent pointer = generation 0 → first publish 1; stale is a return value with an attempt row',async()=>{
  const month=freshMonth();const A=await reviewManifest();
  expect(await pointer('US',month)).toBeNull();
  const s=await publish('US',month,1,A);
  expect(s).toMatchObject({generation:0,outcome:'stale'});
  expect(await pointer('US',month)).toBeNull();
  const a=await publish('US',month,0,A);
  expect(a).toEqual({result_id:s.result_id,generation:1,outcome:'advanced'});   // the stale call already stored the immutable result
  expect(await pointer('US',month)).toMatchObject({result_id:a.result_id,generation:1});
  expect((await attempts('US',month)).map(r=>r.status)).toEqual(['stale','ok']);
  expect(await q(`select count(*)::int n from public.macro_review_results where region='US' and month=$1`,[month])).toEqual([{n:1}]);
 });

 it('macro_publish_review: replayed before stale; A→B→A moves the pointer back to the same A row; stale generation; older cutoff',async()=>{
  const month=freshMonth();const A=await reviewManifest(),B=await reviewManifest(),C=await reviewManifest();
  const a1=await publish('US',month,0,A);expect(a1.outcome).toBe('advanced');
  expect(await publish('US',month,0,A)).toEqual({result_id:a1.result_id,generation:1,outcome:'replayed'});    // expected 0 is stale, but the pointer already is A
  expect(await publish('US',month,7,A)).toEqual({result_id:a1.result_id,generation:1,outcome:'replayed'});
  const b0=await publish('US',month,0,B);expect(b0).toMatchObject({generation:1,outcome:'stale'});
  const b1=await publish('US',month,1,B);expect(b1).toEqual({result_id:b0.result_id,generation:2,outcome:'advanced'});
  const a3=await publish('US',month,2,A);expect(a3).toEqual({result_id:a1.result_id,generation:3,outcome:'advanced'});
  expect(await publish('US',month,3,C,'3000-01-30T00:00:00Z')).toMatchObject({generation:3,outcome:'stale'});   // older cutoff never advances
  const c4=await publish('US',month,3,C,'3000-02-01T00:00:00Z');expect(c4).toMatchObject({generation:4,outcome:'advanced'});
  expect(await pointer('US',month)).toMatchObject({result_id:c4.result_id,generation:4});
  expect(new Date((await pointer('US',month)).cutoff).toISOString()).toBe('3000-02-01T00:00:00.000Z');
  expect((await attempts('US',month)).map(r=>r.status)).toEqual(['ok','replayed','replayed','stale','ok','ok','stale','ok']);
  expect(await pointer('CN',month)).toBeNull();   // (region, month) is the pointer key
 });

 it('macro_publish_review: not_found for an unknown manifest, a hash mismatch or a non-review manifest; status / month / region checked',async()=>{
  const month=freshMonth();const A=await reviewManifest();const th=newHash();const T={id:await put('transmission',th),hash:th};
  expect(await fails(publish('US',month,0,{id:randomUUID(),hash:A.hash}))).toMatchObject({message:'not_found'});
  expect(await fails(publish('US',month,0,{id:A.id,hash:HEX('e')}))).toMatchObject({message:'not_found'});
  expect(await fails(publish('US',month,0,T))).toMatchObject({message:'not_found'});
  expect(await fails(publish('JP',month,0,A))).toMatchObject({code:'23514'});
  expect(await fails(publish('US','3000-13',0,A))).toMatchObject({code:'23514'});
  expect(await fails(one(`select public.macro_publish_review('US',$1,0,now(),'great',$2,$3,'{}'::jsonb,'m','c') v`,[month,A.id,A.hash]))).toMatchObject({code:'23514'});
  expect(await attempts('US',month)).toEqual([]);   // a failed call rolls back with its attempt row
 });

 it('macro_publish_review: concurrent publishes of two results at the same expected generation → exactly one advances',async()=>{
  const month=freshMonth();const A=await reviewManifest(),B=await reviewManifest();
  const out=await Promise.all([publish('CN',month,0,A),publish('CN',month,0,B)]);
  expect(out.map(o=>o.outcome).sort()).toEqual(['advanced','stale']);
  expect(await pointer('CN',month)).toMatchObject({generation:1,result_id:out.find(o=>o.outcome==='advanced')!.result_id});
 });

 it('macro_record_review_attempt: failed only',async()=>{
  const month=freshMonth();
  await one(`select public.macro_record_review_attempt('US',$1,'failed','{"stage":"manifest"}'::jsonb) v`,[month]);
  expect(await q(`select status,result_id,error from public.macro_review_attempts where month=$1`,[month])).toEqual([{status:'failed',result_id:null,error:{stage:'manifest'}}]);
  expect(await fails(one(`select public.macro_record_review_attempt('US',$1,'ok',null) v`,[month]))).toMatchObject({message:'invalid_status'});
 });

 it('macro_claim_explanation: claimed with an RPC-made id and audit key; repeat → existing; other payload → payload_conflict; manifest must be explain_facts',async()=>{
  const {a,c}=await newClaim();
  expect(c.outcome).toBe('claimed');
  expect(c.usage_audit_key).toBe(`${c.explanation_id}`);
  expect(c.projection).toMatchObject({explanation_id:c.explanation_id,subject_kind:'review',subject_id:'subject-1',locale:'zh',manifest_id:a.manifest,state:'running',rendered:null,failure_codes:[],finished_at:null});
  expect(await run(c.explanation_id)).toMatchObject({state:'running',finalized:false,raw_output:null,late_output:null});
  const again=await claim(a);
  expect(again).toMatchObject({outcome:'existing',explanation_id:c.explanation_id,usage_audit_key:c.usage_audit_key,projection:{state:'running'}});
  expect(await fails(claim({...a,payload:HEX('b')}))).toMatchObject({message:'payload_conflict'});
  const rm=await reviewManifest();
  expect(await fails(claim({...a,request:randomUUID(),manifest:rm.id}))).toMatchObject({message:'not_found'});
  expect(await fails(claim({...a,request:randomUUID(),manifest:randomUUID()}))).toMatchObject({message:'not_found'});
  expect(await q(`select count(*)::int n from public.macro_explanation_runs where user_id=$1`,[a.user])).toEqual([{n:1}]);
 });

 it('macro_claim_explanation: concurrent claims of one request → one claimed, one existing, same id',async()=>{
  const a={user:randomUUID(),request:randomUUID(),manifest:await explainManifest()};
  const out=await Promise.all([claim(a),claim(a)]);
  expect(out.map(o=>o.outcome).sort()).toEqual(['claimed','existing']);
  expect(out[0].explanation_id).toBe(out[1].explanation_id);
 });

 it('macro_claim_explanation: running for more than five minutes → abandoned, projection failed {abandoned}; under five minutes stays running',async()=>{
  const young=await newClaim();await age(young.c.explanation_id,4);
  expect((await claim(young.a)).projection.state).toBe('running');
  const old=await newClaim();await age(old.c.explanation_id,6);
  const again=await claim(old.a);
  expect(again).toMatchObject({outcome:'existing',explanation_id:old.c.explanation_id,projection:{state:'failed',failure_codes:['abandoned'],rendered:null}});
  expect(again.projection.finished_at).not.toBeNull();
  expect(await run(old.c.explanation_id)).toMatchObject({state:'abandoned'});
  expect((await claim(old.a)).projection).toMatchObject({state:'failed',failure_codes:['abandoned']});   // stays abandoned
 });

 it('macro_finish_explanation: running → accepted; idempotent on same state + raw; invalid_transition otherwise; rendered only when accepted',async()=>{
  const {c}=await newClaim();
  const p=await finish(c.explanation_id,'accepted',{points:[1]},{rendered:RENDERED,accounting:{tokens:9}});
  expect(p).toMatchObject({state:'accepted',rendered:RENDERED,failure_codes:[],provider:'prov',model:'model',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1'});
  expect(p.finished_at).not.toBeNull();
  expect(await run(c.explanation_id)).toMatchObject({state:'accepted',raw_output:{points:[1]},accounting:{tokens:9},finalized:false});
  expect(await finish(c.explanation_id,'accepted',{points:[1]},{rendered:RENDERED})).toEqual(p);   // idempotent: unchanged projection
  expect(await fails(finish(c.explanation_id,'accepted',{points:[2]},{rendered:RENDERED}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(finish(c.explanation_id,'rejected',{points:[1]},{codes:['numeral']}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(finish(c.explanation_id,'running',{}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(finish(randomUUID(),'failed',null))).toMatchObject({message:'not_found'});
  const r=await newClaim();
  expect(await finish(r.c.explanation_id,'rejected','3% text',{rendered:RENDERED,codes:['numeral']})).toMatchObject({state:'rejected',rendered:null,failure_codes:['numeral']});
  const n=await newClaim();
  expect(await fails(finish(n.c.explanation_id,'accepted',{x:1}))).toMatchObject({code:'23514'});   // accepted needs a rendered body
  expect(await run(n.c.explanation_id)).toMatchObject({state:'running'});
 });

 it('macro_finish_explanation after abandoned: writes late_output and accounting only; projection stays failed',async()=>{
  const {a,c}=await newClaim();await age(c.explanation_id,6);await claim(a);
  const p=await finish(c.explanation_id,'accepted',{points:['late']},{rendered:RENDERED,accounting:{tokens:42}});
  expect(p).toMatchObject({state:'failed',failure_codes:['abandoned'],rendered:null});
  const row=await run(c.explanation_id);
  expect(row).toMatchObject({state:'abandoned',raw_output:null,accounting:{tokens:42},late_output:{state:'accepted',raw_output:{points:['late']},rendered:RENDERED,provider:'prov'}});
 });

 it('claim / expire and finish share the run row lock: an expiring claim never overwrites a concurrent finish',async()=>{
  // finish commits first → the waiting expired claim reads accepted and leaves it alone
  const x=await newClaim();await age(x.c.explanation_id,6);
  const got=await serialized({sql:FINISH_SQL,values:finishArgs(x.c.explanation_id,'accepted',{points:[1]},{rendered:RENDERED})},()=>claim(x.a));
  expect(got).toMatchObject({outcome:'existing',projection:{state:'accepted',rendered:RENDERED}});
  expect(await run(x.c.explanation_id)).toMatchObject({state:'accepted',late_output:null});
  // the expiring claim commits first → the waiting finish sees abandoned and writes late_output only
  const y=await newClaim();await age(y.c.explanation_id,6);
  const late=await serialized({sql:`select public.macro_claim_explanation($1,$2,$3,'review','subject-1','zh',$4) v`,values:[y.a.user,y.a.request,HEX('a'),y.a.manifest]},
   ()=>finish(y.c.explanation_id,'accepted',{points:[2]},{rendered:RENDERED}));
  expect(late).toMatchObject({state:'failed',failure_codes:['abandoned']});
  expect(await run(y.c.explanation_id)).toMatchObject({state:'abandoned',late_output:{state:'accepted'}});
  // macro_expire_explanations waits on the same lock
  const z=await newClaim();await age(z.c.explanation_id,6);
  expect(await serialized({sql:FINISH_SQL,values:finishArgs(z.c.explanation_id,'rejected','3%',{codes:['numeral']})},()=>expire(z.a.user))).toBe(0);
  expect(await run(z.c.explanation_id)).toMatchObject({state:'rejected'});
 },30000);

 it('macro_record_completion: stores raw output + finalize payload on running and abandoned rows; same values → no-op; otherwise invalid_transition',async()=>{
  const {c}=await newClaim();
  await record(c.explanation_id,{content:'x'});
  expect(await run(c.explanation_id)).toMatchObject({state:'running',raw_output:{content:'x'},finalize_payload:PAYLOAD,finalized:false});
  await record(c.explanation_id,{content:'x'});   // same values: no-op
  expect(await fails(record(c.explanation_id,{content:'y'}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(record(c.explanation_id,{content:'x'},{...PAYLOAD,status:'failed'}))).toMatchObject({message:'invalid_transition'});
  expect(await finish(c.explanation_id,'accepted',{content:'x'},{rendered:RENDERED})).toMatchObject({state:'accepted'});   // finish keeps the recorded raw output
  const ab=await newClaim();await age(ab.c.explanation_id,6);await claim(ab.a);
  await record(ab.c.explanation_id,null,{...PAYLOAD,status:'failed'});
  expect(await run(ab.c.explanation_id)).toMatchObject({state:'abandoned',finalize_payload:{status:'failed'}});
  const done=await newClaim();await finish(done.c.explanation_id,'failed',null,{codes:['provider_error']});
  expect(await fails(record(done.c.explanation_id,null))).toMatchObject({message:'invalid_transition'});   // a final row without a recorded payload
  const n=await newClaim();
  expect(await fails(record(n.c.explanation_id,null,null))).toMatchObject({message:'invalid_transition'});
  expect(await fails(record(n.c.explanation_id,null,{status:'pending'}))).toMatchObject({code:'23514'});
  expect(await fails(record(randomUUID(),null))).toMatchObject({message:'not_found'});
 });

 it('macro_finish_explanation stores p_finalize_payload when none is recorded (a failed record_completion) and never overwrites one',async()=>{
  const {c}=await newClaim();
  await finish(c.explanation_id,'accepted',{content:'x'},{rendered:RENDERED,payload:PAYLOAD});
  expect(await run(c.explanation_id)).toMatchObject({state:'accepted',raw_output:{content:'x'},finalize_payload:PAYLOAD,finalized:false});
  await one(`select public.macro_mark_finalized($1) v`,[c.explanation_id]);   // settles from the payload finish stored
  expect(await run(c.explanation_id)).toMatchObject({finalized:true});
  const r=await newClaim();await record(r.c.explanation_id,{content:'y'});
  await finish(r.c.explanation_id,'accepted',{content:'y'},{rendered:RENDERED,payload:{...PAYLOAD,pricingVersion:'p2'}});
  expect(await run(r.c.explanation_id)).toMatchObject({finalize_payload:PAYLOAD});   // the recorded payload stays
  const i=await newClaim();await finish(i.c.explanation_id,'failed',null,{codes:['provider_error']});
  await finish(i.c.explanation_id,'failed',null,{codes:['provider_error'],payload:{...PAYLOAD,status:'failed'}});   // idempotent replay fills a missing payload
  expect(await run(i.c.explanation_id)).toMatchObject({state:'failed',finalize_payload:{status:'failed'}});
  const ab=await newClaim();await age(ab.c.explanation_id,6);await expire(ab.a.user);
  await finish(ab.c.explanation_id,'accepted',{content:'z'},{rendered:RENDERED,payload:PAYLOAD});
  expect(await run(ab.c.explanation_id)).toMatchObject({state:'abandoned',finalize_payload:PAYLOAD,late_output:{state:'accepted'}});
  const bad=await newClaim();
  expect(await fails(finish(bad.c.explanation_id,'failed',null,{payload:{status:'pending'}}))).toMatchObject({code:'23514'});
 });

 it('a recorded completion is never abandoned: the claim and macro_expire_explanations skip running rows whose raw output is recorded',async()=>{
  const rec=await newClaim();await record(rec.c.explanation_id,{content:'x'});await age(rec.c.explanation_id,6);
  expect((await claim(rec.a)).projection).toMatchObject({state:'running'});
  expect(await expire(rec.a.user)).toBe(0);
  expect(await run(rec.c.explanation_id)).toMatchObject({state:'running',raw_output:{content:'x'}});
  const threw=await newClaim();await record(threw.c.explanation_id,null,{...PAYLOAD,status:'failed'});await age(threw.c.explanation_id,6);   // provider threw: no output to recover
  expect(await expire(threw.a.user)).toBe(1);
  expect(await run(threw.c.explanation_id)).toMatchObject({state:'abandoned',finalize_payload:{status:'failed'}});
  expect(await finish(rec.c.explanation_id,'accepted',{content:'x'},{rendered:RENDERED})).toMatchObject({state:'accepted'});   // completion recovery finishes it
 });

 it('macro_mark_finalized: needs a recorded finalize payload, then finalizes in any state (running after a failed finish, final, abandoned); idempotent; unknown → not_found',async()=>{
  const {c}=await newClaim();
  expect(await fails(one(`select public.macro_mark_finalized($1) v`,[c.explanation_id]))).toMatchObject({message:'invalid_transition'});
  await finish(c.explanation_id,'failed',null,{codes:['provider_error']});
  expect(await fails(one(`select public.macro_mark_finalized($1) v`,[c.explanation_id]))).toMatchObject({message:'invalid_transition'});   // final, but nothing recorded
  const r=await newClaim();await record(r.c.explanation_id,{content:'x'});
  await one(`select public.macro_mark_finalized($1) v`,[r.c.explanation_id]);   // finish never ran: still running, payload settled
  await one(`select public.macro_mark_finalized($1) v`,[r.c.explanation_id]);
  expect(await run(r.c.explanation_id)).toMatchObject({state:'running',finalized:true});
  const ab=await newClaim();await age(ab.c.explanation_id,6);await expire(ab.a.user);await record(ab.c.explanation_id,null,{...PAYLOAD,status:'failed'});
  await one(`select public.macro_mark_finalized($1) v`,[ab.c.explanation_id]);
  expect(await run(ab.c.explanation_id)).toMatchObject({state:'abandoned',finalized:true});
  expect(await fails(one(`select public.macro_mark_finalized($1) v`,[randomUUID()]))).toMatchObject({message:'not_found'});
 });

 it('macro_expire_explanations: only the user\'s running rows claimed more than five minutes ago → abandoned + projection failed {abandoned}',async()=>{
  const user=randomUUID();
  const mk=async()=>claim({user,request:randomUUID(),manifest:await explainManifest()});
  const old=await mk(),young=await mk(),done=await mk();
  await age(old.explanation_id,6);await age(young.explanation_id,4);await age(done.explanation_id,6);
  await finish(done.explanation_id,'rejected','3%',{codes:['numeral']});
  const other=await newClaim();await age(other.c.explanation_id,6);
  expect(await expire(user)).toBe(1);
  expect(await run(old.explanation_id)).toMatchObject({state:'abandoned'});
  expect((await run(old.explanation_id)).finished_at).not.toBeNull();
  expect(await q(`select state,failure_codes from public.macro_explanations where explanation_id=$1`,[old.explanation_id])).toEqual([{state:'failed',failure_codes:['abandoned']}]);
  expect(await run(young.explanation_id)).toMatchObject({state:'running'});
  expect(await run(done.explanation_id)).toMatchObject({state:'rejected'});
  expect(await run(other.c.explanation_id)).toMatchObject({state:'running'});
  expect(await expire(user)).toBe(0);
 });
});
