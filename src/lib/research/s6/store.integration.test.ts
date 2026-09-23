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
import {freezeMarket} from './market';
import {observationReport} from './report';
import {syntheticMapping} from '../../../../scripts/s6/fixtures';
import {runRelFixture} from './shadow';

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
  const marketIds=[];
  for(const security of [observation.securities[0],{...observation.securities[0],ticker:'SPY'}]){
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
