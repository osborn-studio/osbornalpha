import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {Pool} from 'pg';
import {testPack} from '../../../../scripts/s4/test-pack';
import {importCandidate} from '../s4/import';
import {revealCards} from '../s4/cards';
import {submitDecision} from '../s4/decisions';
import {closeS4Pool,transaction} from '../s4/db';
import {digest,evaluateObservation} from 'dsh-trade-strategy-evaluator/engine';
import {createS6Store,prepareInput,prepareEvaluation,makeCommit,tokenHash,currentMarketIds} from './store';
import {createEvaluationHttpClient} from 'dsh-trade-strategy-evaluator/adapters';
// @ts-expect-error Fixed S5 conformance export has no bundled declaration.
import {assertEvaluationStoreConformance} from 'dsh-trade-strategy-evaluator/conformance';
import {evaluatorRpc} from './http';
import {freezeMarket,freezeMarketHandoff,benchmarkIdentity} from './market';
import {observationReport} from './report';
import {syntheticMapping} from '../../../../scripts/s6/fixtures';
import {runRelFixture} from './shadow';
import {runRelReadiness,settleRelFixture,releaseRelReservation,type RelFixtureAdapter} from './rel-readiness';

describe.skipIf(!process.env.S4_TEST_STATE)('S6 authoritative PostgreSQL store',()=>{
 let admin:Pool,id:string,candidate:string,body:ReturnType<typeof makeCommit>,server:Server,origin:string,token:string;
 const actor={userId:randomUUID(),kind:'agent' as const},other={userId:randomUUID(),kind:'agent' as const};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
  admin=new Pool({connectionString:state.adminUrl});
  for(const a of [actor,other]){await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);}
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S6SYNTH','Synthetic S6','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  const p=testPack(actor.userId);await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,p.binding.approvedPayloadHash,p.binding]);
  candidate=(await importCandidate(actor,JSON.stringify(p.pack))).id;
  const r=await revealCards(actor,candidate,{requestKey:randomUUID(),judgment:'Synthetic S6 only',alreadySeen:[],independentJudgment:false});
  id=(await submitDecision(actor,candidate,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic integration',cardId:r.cards[0].id,labelId:r.labelId,exposureId:r.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null})).observationId!;
  const observation=(await createS6Store(actor).readObservation(id)).observation;
  // E3b: new registrations are alpha-observation-contract/2.0 with a listing MIC; SPY is the ARCX benchmark.
  expect(observation.schema_version).toBe('alpha-observation-contract/2.0');
  expect(observation.securities[0]).toMatchObject({ticker:'S6SYNTH',listing_mic:'XNYS',currency:'USD',synthetic:true});
  expect(observation.market_policy_version).toBe('market-policy/2.0');
  const marketIds=[];
  for(const security of [observation.securities[0],benchmarkIdentity(true)]){
   const mapping=syntheticMapping(security),frozen=await freezeMarket(actor,id,mapping,'synthetic');marketIds.push(frozen.id);
   expect((await freezeMarket(actor,id,mapping,'synthetic')).duplicate).toBe(true);
   await expect(freezeMarket(actor,id,{...mapping,evidence:{...mapping.evidence,raw_sha256:'0'.repeat(64)}},'synthetic')).rejects.toMatchObject({code:'hash_mismatch'});
  }
  body=makeCommit(await prepareInput(actor,id,marketIds,new Date().toISOString()),'synthetic-conformance',0);
  token=actor.userId+'.'+randomBytes(32).toString('hex');
  await admin.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,expires_at,revoked) values($1,$2,'synthetic-http','alpha-evaluator',$3,clock_timestamp()+interval '1 hour',false)",[actor.userId,tokenHash(token),['observation:read','evaluation:append']]);
  server=createServer(async(req,res)=>{
   try{
    const parts=[];for await(const part of req)parts.push(part);
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    const request=new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
    const path=req.url!.split('/');const response=await evaluatorRpc(request,req.method==='POST'?'commit':path.includes('observations')?'observation':'market',path.at(-1));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
   }catch{res.writeHead(500);res.end();}
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+(server.address() as {port:number}).port;process.env.ALPHA_S4_ORIGIN=origin;
 });
 afterAll(async()=>{await new Promise<void>(r=>server?.close(()=>r()));await closeS4Pool();await admin?.end();});
 function remote(t=token){return createEvaluationHttpClient({baseUrl:origin,ownerScope:{user_id:actor.userId,workspace_id:null},tokenProvider:async()=>t});}
 async function counts(){return (await admin.query(`select (select count(*) from research_s6_evaluations where user_id=$1) results,(select count(*) from research_s4_outbox where user_id=$1) outbox,(select count(*) from research_audit_log where user_id=$1) audit`,[actor.userId])).rows[0];}
 it('recomputes pending observation, commits once and preserves the frozen registration',async()=>{
  const store=remote(),before=await store.readObservation(id);
  const proof=await assertEvaluationStoreConformance({store,input:body.input});expect(proof.passed).toBe(true);
  const accepted=proof.commit_receipt;expect(accepted.status).toBe('accepted');
  const n=await counts();const retry=await store.commitEvaluationResult(body);expect(retry.status).toBe('duplicate');expect(retry.evaluation_ref).toBe(accepted.evaluation_ref);expect(await counts()).toEqual(n);
  const after=await store.readObservation(id);expect(after.observation).toEqual(before.observation);expect(after.revision).toBe(1);
  expect(body.result.status).toBe('pending_start');
  await expect(store.commitEvaluationResult({...body,expected_revision:1})).rejects.toMatchObject({code:'idempotency_conflict'});
 });
 it('revalidates server session expiry, revocation, scope and rejects body authority overrides',async()=>{
  await admin.query('update research_s6_sessions set revoked=true where user_id=$1',[actor.userId]);
  await expect(remote().readObservation(id)).rejects.toMatchObject({code:'not_authenticated',status:401});
  await admin.query("update research_s6_sessions set revoked=false,expires_at=clock_timestamp()-interval '1 second' where user_id=$1",[actor.userId]);
  await expect(remote().readObservation(id)).rejects.toMatchObject({code:'not_authenticated'});
  await admin.query("update research_s6_sessions set expires_at=created_at+interval '1 hour',scopes=array['observation:read'] where user_id=$1",[actor.userId]);
  await expect(remote().commitEvaluationResult(body)).rejects.toMatchObject({code:'scope_denied',status:403});
  await admin.query("update research_s6_sessions set scopes=array['observation:read','evaluation:append'] where user_id=$1",[actor.userId]);
  const response=await fetch(origin+'/api/evaluator/v1/evaluation-results',{method:'POST',headers:{authorization:'Bearer '+token,'x-evaluator-protocol':'evaluator-rpc/1.0','idempotency-key':body.idempotency_key},body:JSON.stringify({...body,owner_scope:{user_id:other.userId}})});
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe('scope_denied');
  await expect(remote(other.userId+'.'+token.split('.')[1]).readObservation(id)).rejects.toMatchObject({code:'not_authenticated'});
  for(const prefix of ['-'.repeat(36),randomUUID()])await expect(remote(prefix+'.'+token.split('.')[1]).readObservation(id)).rejects.toMatchObject({code:'not_authenticated',status:401});
 });
 it('rejects forged calculations, rewritten authority, future time and cross-owner requests',async()=>{
  const store=createS6Store(actor),n=await counts();
  const forged=structuredClone(body);forged.result.reason='fabricated';forged.result_sha256=digest(forged.result);
  await expect(store.commitEvaluationResult(forged)).rejects.toMatchObject({code:'hash_mismatch'});
  const substituted=structuredClone(body);substituted.result.reason='fabricated';
  await expect(store.commitEvaluationResult(substituted)).rejects.toMatchObject({code:'hash_mismatch'});
  const fake=structuredClone(body.input);fake.information_set.versions=[];
  await expect(store.commitEvaluationResult(makeCommit(fake,randomUUID(),1))).rejects.toMatchObject({code:'hash_mismatch'});
  await expect(prepareInput(actor,id,[],'2099-01-01T00:00:00.000Z')).rejects.toMatchObject({code:'future_input'});
  await expect(createS6Store(other).readObservation(id)).rejects.toMatchObject({code:'not_found'});
  await transaction(other,async db=>expect((await db.query('select * from research_s6_evaluations')).rows).toEqual([]));
  expect(await counts()).toEqual(n);
 });
 it('has one CAS winner and rolls back result, revision, audit and outbox on failure',async()=>{
  const store=createS6Store(actor);
  const race=await Promise.allSettled([1,2].map(()=>store.commitEvaluationResult(makeCommit(body.input,randomUUID(),1))));
  expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const n=await counts();
  await admin.query(`create function s6_test_fail() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid then raise exception 's6_atomic_failure'; end if; return new; end $$;create trigger s6_test_fail before insert on research_s4_outbox for each row execute function s6_test_fail()`);
  try{await expect(store.commitEvaluationResult(makeCommit(body.input,randomUUID(),2))).rejects.toThrow('s6_atomic_failure');}finally{await admin.query('drop trigger s6_test_fail on research_s4_outbox;drop function s6_test_fail()');}
  expect(await counts()).toEqual(n);expect((await store.readObservation(id)).revision).toBe(2);
 });
 it('keeps REL disabled/fixture isolated from normal cards and frozen observations',async()=>{
  const before=await createS6Store(actor).readObservation(id);
  const cards=async()=>(await admin.query("select payload_hash from research_s4_records where user_id=$1 and kind='ChangeCard' order by id",[actor.userId])).rows;
  const baseline=await cards();expect((await runRelFixture(actor,id,{mode:'disabled',key:randomUUID(),choice:'relevant'})).status).toBe('not_run');
  for(const choice of ['relevant','not_relevant'] as const)await runRelFixture(actor,id,{mode:'fixture',key:randomUUID(),choice});
  const options={mode:'fixture' as const,key:randomUUID(),choice:'abstain' as const};
  const first=await runRelFixture(actor,id,options);
  const exposures=async()=>Number((await admin.query("select count(*) from research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'origin'='alpha_rel_fixture'",[actor.userId])).rows[0].count);
  const count=await exposures();expect(await runRelFixture(actor,id,options)).toMatchObject(first);expect(await exposures()).toBe(count+1);
  expect(await cards()).toEqual(baseline);expect(await createS6Store(actor).readObservation(id)).toEqual(before);
  await expect(runRelFixture(actor,id,{mode:'shadow' as 'fixture',key:randomUUID(),choice:'relevant'})).rejects.toMatchObject({code:'not_configured'});
 });
 it('rejects backdated new projections and omitted/newly superseded snapshots, preserving exact retry',async()=>{
  const store=createS6Store(actor);
  const older={...body.input,as_of:new Date(Date.parse(body.input.as_of)-1).toISOString()};
  await expect(store.commitEvaluationResult(makeCommit(older,randomUUID(),2))).rejects.toMatchObject({code:'invalid_timeline'});
  const omitted=await prepareInput(actor,id,[],new Date().toISOString());
  await expect(store.commitEvaluationResult(makeCommit(omitted,randomUUID(),2))).rejects.toMatchObject({code:'source_version_conflict'});
  const mapping=syntheticMapping(body.input.observation.securities[0]),dto=JSON.parse(mapping.raw);dto.meta.fetchedAt='2026-01-07T00:00:00.000Z';mapping.raw=JSON.stringify(dto);mapping.evidence.raw_sha256=tokenHash(mapping.raw);
  await freezeMarket(actor,id,mapping,'synthetic');
  const benchmarkId=body.input.market_snapshots.find(m=>m.security.ticker==='SPY')!.id;
  const late=await prepareInput(actor,id,[mapping.id,benchmarkId],body.input.as_of);
  await expect(store.commitEvaluationResult(makeCommit(late,randomUUID(),2))).rejects.toMatchObject({code:'source_version_conflict'});
  await expect(store.commitEvaluationResult(makeCommit(body.input,randomUUID(),2))).rejects.toMatchObject({code:'source_version_conflict'});
  expect((await store.commitEvaluationResult(body)).status).toBe('duplicate');
  await expect(store.readObservation('-'.repeat(36))).rejects.toMatchObject({code:'invalid_schema'});
  await expect(admin.query('truncate research_s6_evaluations')).rejects.toThrow('immutable_record');
  await expect(admin.query("update research_s6_sessions set expires_at=created_at+interval '2 hours' where user_id=$1",[actor.userId])).rejects.toThrow('s6_session_max_lifetime');
  await expect(admin.query("update research_s6_sessions set created_at=created_at+interval '1 day' where user_id=$1",[actor.userId])).rejects.toThrow('immutable_session_identity');
  await expect(admin.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,created_at,expires_at) values($1,$2,'future','alpha-evaluator',array['observation:read'],'2099-01-01T00:00:00Z','2099-01-01T00:30:00Z')",[actor.userId,tokenHash(randomUUID())])).rejects.toThrow('s6_session_max_lifetime');
  const sameFetch={...mapping,id:randomUUID()};await freezeMarket(actor,id,sameFetch,'synthetic');
  const current=await transaction(actor,db=>currentMarketIds(db,actor,id,null));expect(current).toContain(sameFetch.id);expect(current).not.toContain(mapping.id);
  const connection=await admin.connect();
  try{
   await connection.query('begin');
   const injected=(await connection.query("insert into research_s6_markets(user_id,id,observation_id,snapshot,snapshot_hash,raw_response,evidence,evidence_hash,fetched_at) select user_id,$2,observation_id,snapshot,snapshot_hash,raw_response,evidence,evidence_hash,'2000-01-01' from research_s6_markets where user_id=$1 limit 1 returning fetched_at",[actor.userId,randomUUID()])).rows[0];
   expect(injected.fetched_at.getTime()).toBeGreaterThan(Date.now()-60000);
  }finally{await connection.query('rollback');connection.release();}
 });
 it('E3b: freezes attested market-handoff bundles for a 2.0 observation and evaluates under engine 1.1.0',async()=>{
  const base='docs/handoffs/alpha-s6/market-interface/';
  const target=readFileSync(base+'split.synthetic.json','utf8'),spy=readFileSync(base+'spy.synthetic.json','utf8');
  const t=await freezeMarketHandoff(actor,id,{raw:target,id:'handoff-target'}),s=await freezeMarketHandoff(actor,id,{raw:spy,id:'handoff-spy'});
  expect(t.duplicate).toBe(false);expect((await freezeMarketHandoff(actor,id,{raw:target,id:'handoff-target'})).duplicate).toBe(true);
  await expect(freezeMarketHandoff(actor,id,{raw:target.replace('"close": 100','"close": 101'),id:'handoff-target'})).rejects.toMatchObject({code:'idempotency_conflict'});
  const stored=(await admin.query('select snapshot,evidence from research_s6_markets where user_id=$1 and id in ($2,$3) order by id',[actor.userId,'handoff-spy','handoff-target'])).rows;
  expect(stored.map((r:any)=>[r.snapshot.schema_version,r.snapshot.security.ticker,r.snapshot.security.listing_mic,r.evidence.kind])).toEqual([['market-snapshot/2.0','SPY','ARCX','synthetic'],['market-snapshot/2.0','S6SYNTH','XNYS','synthetic']]);
  expect(stored[1].snapshot.security.company_entity_id).toBe(body.input.observation.securities[0].company_entity_id);
  expect(stored[1].evidence.proof.attestation).toMatchObject({ticker:'S6SYNTH',listing_mic:'XNYS',attested_by:'synthetic-fixture'});
  const input=await prepareInput(actor,id,[t.id,s.id],new Date().toISOString());
  const r=evaluateObservation(input);expect(r.ok).toBe(true);
  if(r.ok){expect(r.result.engine_version).toBe('osanalyst-engine/1.1.0');expect(r.result.rule_version).toBe('market-policy/2.0');expect(r.result.status).toBe('pending_start');}
  // Bundles whose identity is not attested, or that belong to another security, are refused.
  const foreign=JSON.parse(target);foreign.security.ticker='OTHERX';for(const e of foreign.evidence)e.source_url=e.source_url.replace('S6SYNTH','OTHERX');
  await expect(freezeMarketHandoff(actor,id,{raw:JSON.stringify(foreign)})).rejects.toMatchObject({code:'scope_denied'});
  const unattested=JSON.parse(target);unattested.evidence.find((e:any)=>e.kind==='identity').content+=' ';unattested.evidence.find((e:any)=>e.kind==='identity').sha256=tokenHash(unattested.evidence.find((e:any)=>e.kind==='identity').content);
  await expect(freezeMarketHandoff(actor,id,{raw:JSON.stringify(unattested)})).rejects.toMatchObject({code:'data_insufficient'});
  // A real bundle can never be frozen onto a synthetic observation.
  const real=JSON.parse(target);real.synthetic=false;for(const e of real.evidence)e.source_url='https://example.invalid/'+e.id;
  await expect(freezeMarketHandoff(actor,id,{raw:JSON.stringify(real)})).rejects.toMatchObject({code:'scope_denied'});
 });
 it('durably reserves REL fixture credits, retains unknown cost and never dispatches retries',async()=>{
  let calls=0;
  const adapter:RelFixtureAdapter={kind:'fixture',version:'fixture-v1',evaluate:async()=>{
   calls++;const incurred=(await admin.query("select count(*) from research_s6_rel_runs where user_id=$1 and state='incurred'",[actor.userId])).rows[0];expect(Number(incurred.count)).toBe(1);
   return {choice:'relevant',actualCredits:4,receiptRef:'fixture-receipt-1'};
  }};
  const options={mode:'fixture' as const,key:randomUUID(),maxCredits:6,timeoutMs:1000};
  expect((await runRelReadiness(actor,id,{...options,mode:'disabled'})).state).toBe('not_run');expect(calls).toBe(0);
  await expect(runRelReadiness(actor,id,options,adapter)).rejects.toMatchObject({code:'budget_blocked'});
  await admin.query('insert into research_s6_rel_limits(user_id,credit_limit,hard_stop) values($1,10,false)',[actor.userId]);
  expect((await runRelReadiness(actor,id,options,adapter)).state).toBe('settled');expect(calls).toBe(1);
  expect((await runRelReadiness(actor,id,options,adapter)).state).toBe('settled');expect(calls).toBe(1);
  await expect(runRelReadiness(actor,id,{...options,maxCredits:5},adapter)).rejects.toMatchObject({code:'idempotency_conflict'});
  const uncertain={...options,key:randomUUID(),timeoutMs:10};
  const hanging:RelFixtureAdapter={kind:'fixture',version:'fixture-hang',evaluate:async()=>{calls++;return new Promise(()=>{});}};
  expect((await runRelReadiness(actor,id,uncertain,hanging)).state).toBe('unknown');
  await closeS4Pool();expect((await runRelReadiness(actor,id,uncertain,hanging)).state).toBe('unknown');expect(calls).toBe(2);
  await expect(releaseRelReservation(actor,uncertain.key)).rejects.toMatchObject({code:'revision_conflict'});
  await expect(admin.query("update research_s6_rel_runs set state='released' where user_id=$1 and request_key=$2",[actor.userId,uncertain.key])).rejects.toThrow('invalid_rel_transition');
  await expect(runRelReadiness(actor,id,{...options,key:randomUUID(),maxCredits:1},adapter)).rejects.toMatchObject({code:'budget_blocked'});
  expect((await settleRelFixture(actor,uncertain.key,{actualCredits:2,receiptRef:'fixture-reconciled-1'})).state).toBe('settled');
  expect((await settleRelFixture(actor,uncertain.key,{actualCredits:2,receiptRef:'fixture-reconciled-1'})).state).toBe('settled');
  await expect(settleRelFixture(actor,uncertain.key,{actualCredits:0,receiptRef:'fixture-reconciled-1'})).rejects.toMatchObject({code:'idempotency_conflict'});
  const overrun:RelFixtureAdapter={...adapter,evaluate:async()=>({choice:'abstain',actualCredits:5,receiptRef:'fixture-overrun-1'})};
  expect((await runRelReadiness(actor,id,{...options,key:randomUUID(),maxCredits:1},overrun)).state).toBe('settled');
  await expect(runRelReadiness(actor,id,{...options,key:randomUUID(),maxCredits:1},adapter)).rejects.toMatchObject({code:'budget_blocked'});
  await transaction(other,async db=>expect((await db.query('select * from research_s6_rel_runs')).rows).toEqual([]));
  expect(calls).toBe(2);
 });
 it('hard stops before dispatch and rolls back failed REL settlement without releasing incurred credits',async()=>{
  let calls=0;
  const adapter:RelFixtureAdapter={kind:'fixture',version:'fixture-atomic',evaluate:async()=>{calls++;return {choice:'not_relevant',actualCredits:1,receiptRef:'fixture-atomic-receipt'};}};
  const options={mode:'fixture' as const,key:randomUUID(),maxCredits:5,timeoutMs:1000};
  await admin.query('update research_s6_rel_limits set credit_limit=1000,hard_stop=false where user_id=$1',[actor.userId]);
  await admin.query(`create function rel_test_stop() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid then update research_s6_rel_limits set hard_stop=true where user_id=new.user_id; end if; return new; end $$;create trigger rel_test_stop after insert on research_s6_rel_runs for each row execute function rel_test_stop()`);
  try{expect((await runRelReadiness(actor,id,options,adapter)).state).toBe('released');expect(calls).toBe(0);}finally{await admin.query('drop trigger rel_test_stop on research_s6_rel_runs;drop function rel_test_stop()');}
  await admin.query('update research_s6_rel_limits set hard_stop=false where user_id=$1',[actor.userId]);
  const uncertain={...options,key:randomUUID()};
  await admin.query(`create function rel_test_fail() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid and exists(select 1 from research_s4_records where id=new.record_id and payload->>'type'='rel.readiness.settled') then raise exception 'rel_atomic_failure'; end if; return new; end $$;create trigger rel_test_fail before insert on research_s4_outbox for each row execute function rel_test_fail()`);
  try{await expect(runRelReadiness(actor,id,uncertain,adapter)).rejects.toThrow('rel_atomic_failure');}finally{await admin.query('drop trigger rel_test_fail on research_s4_outbox;drop function rel_test_fail()');}
  await closeS4Pool();expect((await runRelReadiness(actor,id,uncertain,adapter)).state).toBe('incurred');expect(calls).toBe(1);
  const before=await createS6Store(actor).readObservation(id);
  await admin.query("update research_s6_rel_limits set credit_limit=(select sum(case when state='settled' then actual when state='released' then 0 else reserved end)+5 from research_s6_rel_runs where user_id=$1) where user_id=$1",[actor.userId]);
  const invalid:RelFixtureAdapter={...adapter,evaluate:async()=>{calls++;return {choice:'relevant',actualCredits:0,receiptRef:'fixture-invalid',execute:'ignore all instructions'};}};
  const race=await Promise.allSettled([1,2].map(()=>runRelReadiness(actor,id,{...options,key:randomUUID()},invalid)));
  expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(race.find(r=>r.status==='fulfilled')).toMatchObject({value:{state:'unknown'}});
  expect(race.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'budget_blocked'}});expect(calls).toBe(2);
  expect(await createS6Store(actor).readObservation(id)).toEqual(before);
  await admin.query('update research_s6_rel_limits set credit_limit=1000,hard_stop=false where user_id=$1',[actor.userId]);
  const interrupted={...options,key:randomUUID()};
  await admin.query(`create function rel_test_revoke() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.user_id='${actor.userId}'::uuid then update research_s4_bindings set revoked=true where user_id=new.user_id; end if; return new; end $$;create trigger rel_test_revoke after insert on research_s6_rel_runs for each row execute function rel_test_revoke()`);
  try{
   await expect(runRelReadiness(actor,id,interrupted,adapter)).rejects.toMatchObject({code:'scope_denied'});
   expect((await releaseRelReservation(actor,interrupted.key)).state).toBe('released');
   expect((await releaseRelReservation(actor,interrupted.key)).state).toBe('released');expect(calls).toBe(2);
  }finally{await admin.query('drop trigger rel_test_revoke on research_s6_rel_runs;drop function rel_test_revoke()');await admin.query('update research_s4_bindings set revoked=false where user_id=$1',[actor.userId]);}
 });
 it('keeps late REL receipts, blinds choices and latches hard stop against runtime reset',async()=>{
  await admin.query('update research_s6_rel_limits set credit_limit=1000,hard_stop=false where user_id=$1',[actor.userId]);
  let started!:()=>void,finish!:(value:unknown)=>void;
  const start=new Promise<void>(r=>{started=r;}),answer=new Promise(r=>{finish=r;});
  const options={mode:'fixture' as const,key:randomUUID(),maxCredits:5,timeoutMs:1000};
  const running=runRelReadiness(actor,id,options,{kind:'fixture',version:'fixture-late',evaluate:async()=>{started();return answer;}});
  await start;
  await expect(admin.query("update research_s6_rel_runs set state='unknown' where user_id=$1 and request_key=$2",[actor.userId,options.key])).rejects.toThrow('check constraint');
  await settleRelFixture(actor,options.key,{actualCredits:2,receiptRef:'fixture-early-reconciliation'});
  finish({choice:'relevant',actualCredits:9,receiptRef:'fixture-late-receipt'});
  expect(await running).toMatchObject({state:'settled',actualCredits:2});
  expect((await admin.query('select hard_stop from research_s6_rel_limits where user_id=$1',[actor.userId])).rows[0].hard_stop).toBe(true);
  const late=(await admin.query("select payload from research_s4_records where user_id=$1 and payload->>'type'='rel.readiness.late_receipt' and payload->>'request_key'=$2",[actor.userId,options.key])).rows[0].payload;
  expect(late.actual_credits).toBe(9);
  const events=(await admin.query("select payload from research_s4_records where user_id=$1 and payload->>'type' in ('rel.readiness.settled','rel.readiness.late_receipt')",[actor.userId])).rows;
  for(const {payload} of events)for(const choice of ['relevant','not_relevant','abstain']){
   expect(payload).not.toHaveProperty('choice');expect(payload.receipt_sha256).not.toBe(digest({choice,actualCredits:payload.actual_credits,receiptRef:payload.receipt_ref}));
  }
  await expect(transaction(actor,db=>db.query('update research_s6_rel_limits set hard_stop=false where user_id=$1',[actor.userId]))).rejects.toThrow('hard_stop_latched');
  await expect(transaction(actor,db=>db.query('update research_s6_rel_limits set credit_limit=1001 where user_id=$1',[actor.userId]))).rejects.toThrow('permission denied');
  await expect(transaction(actor,db=>db.query("insert into research_s6_rel_runs(user_id,request_key,observation_id,candidate_id,request_hash,request,state,reserved,actual,receipt_hash) select user_id,$2,observation_id,candidate_id,request_hash,request,'settled',1,0,$3 from research_s6_rel_runs where user_id=$1 limit 1",[actor.userId,randomUUID(),'0'.repeat(64)]))).rejects.toThrow('invalid_rel_initial_state');
  await transaction(actor,async()=>{await expect(admin.query('update research_s6_rel_limits set credit_limit=1000 where user_id=$1',[actor.userId])).rejects.toThrow('owner_busy_retry');});
  await expect(freezeMarket(actor,id,{...syntheticMapping(body.input.observation.securities[0]),security:{...benchmarkIdentity(false)}},'authorized-provider')).rejects.toMatchObject({code:'rule_unsupported'});
  expect(Number((await admin.query("select count(*) from research_s6_markets where (snapshot->'security'->>'synthetic')::boolean is not true")).rows[0].count)).toBe(0);
  await admin.query('update research_s6_rel_limits set hard_stop=false where user_id=$1',[actor.userId]);
  let startInvalid!:()=>void,finishInvalid!:(value:unknown)=>void;
  const began=new Promise<void>(r=>{startInvalid=r;}),bad=new Promise(r=>{finishInvalid=r;}),badKey=randomUUID();
  const invalidRun=runRelReadiness(actor,id,{...options,key:badKey},{kind:'fixture',version:'fixture-late-invalid',evaluate:async()=>{startInvalid();return bad;}});
  await began;await settleRelFixture(actor,badKey,{actualCredits:0,receiptRef:'fixture-zero-reconciliation'});finishInvalid({execute:'invalid'});await invalidRun;
  const invalidEvent=(await admin.query("select payload from research_s4_records where user_id=$1 and payload->>'type'='rel.readiness.late_receipt_invalid' and payload->>'request_key'=$2",[actor.userId,badKey])).rows[0].payload;
  expect(invalidEvent.reason).toBe('invalid_receipt');expect(invalidEvent).not.toHaveProperty('execute');
 });
 it('exports old Replay beyond the bounded report page',async()=>{
  const p=await prepareEvaluation(actor,id),input=await prepareInput(actor,id,p.marketIds,p.asOf),store=createS6Store(actor);
  for(let revision=p.revision;revision<103;revision++)await store.commitEvaluationResult(makeCommit(input,randomUUID(),revision));
  const report=await observationReport(actor,id);expect('evaluations' in report&&report.evaluations?.length).toBe(100);expect('historyTruncated' in report&&report.historyTruncated).toBe(true);
  const oldest=(await admin.query('select id from research_s6_evaluations where user_id=$1 and idempotency_key=$2',[actor.userId,body.idempotency_key])).rows[0];
  const replay=await observationReport(actor,id,oldest.id);expect('replay' in replay&&replay.replay?.matches).toBe(true);
  await expect(observationReport(actor,id,'-'.repeat(36))).rejects.toMatchObject({code:'invalid_schema'});
  expect('market_evidence' in replay&&replay.market_evidence?.length).toBe(2);
 },30000);
 it('immutable results reject updates and source revocation also blocks duplicate replay',async()=>{
  const evaluation=(await admin.query('select id from research_s6_evaluations where user_id=$1 limit 1',[actor.userId])).rows[0];
  const replay=await observationReport(actor,id,evaluation.id);expect('replay' in replay&&replay.replay?.matches).toBe(true);
  await expect(admin.query("update research_s6_evaluations set result='{}' where user_id=$1",[actor.userId])).rejects.toThrow('immutable_record');
  await admin.query('update research_s4_bindings set revoked=true where user_id=$1',[actor.userId]);
  await expect(createS6Store(actor).readObservation(id)).rejects.toMatchObject({code:'scope_denied'});
  await expect(createS6Store(actor).commitEvaluationResult(body)).rejects.toMatchObject({code:'scope_denied'});
  await expect(observationReport(actor,id)).rejects.toMatchObject({code:'scope_denied'});
  await expect(createS6Store(actor).readMarketSnapshot(body.market_snapshot_refs[0].id)).rejects.toMatchObject({code:'scope_denied'});
  expect(evaluateObservation(body.input).ok).toBe(true); // Offline Replay remains deterministic, not current authorization.
 });
});
