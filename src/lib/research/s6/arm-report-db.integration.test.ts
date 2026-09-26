import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {closeS4Pool} from '../s4/db';
import {loadArmRows} from './arm-report-db';
import {testPack} from '../../../../scripts/s4/test-pack';
import {importCandidate} from '../s4/import';
import {revealCards} from '../s4/cards';
import {submitDecision} from '../s4/decisions';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('E4 arm report loader on real PostgreSQL',()=>{
 let admin:Pool;const actor={userId:randomUUID(),kind:'agent' as const};const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
 let thesisId:string,candidateId:string,revision=0;
 // Observations come from the real S4 path so observationFor's authorization checks apply exactly as in production.
 const seedObservation=async()=>{
  const r=await revealCards(actor,candidateId,{requestKey:randomUUID(),judgment:'E4 arm report fixture',alreadySeen:[],independentJudgment:false});
  const d=await submitDecision(actor,candidateId,{requestKey:randomUUID(),expectedRevision:revision,action:'observe',reason:'E4 fixture',cardId:r.cards[0].id,labelId:r.labelId,exposureId:r.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null});
  revision=d.revision;return d.observationId!;
 };
 const evaluation=async(obs:string,revision:number,priceReturn:number)=>{
  const result={status:'resolved',windows:[{trading_sessions:5,status:'resolved',result:{price_return:priceReturn,benchmark_price_return:0.01,benchmark_difference:priceReturn-0.01,max_drawdown:0.02,benchmark:'SPY',currency:'USD'}}]};
  await admin.query(`insert into public.research_s6_evaluations(user_id,id,observation_id,idempotency_key,body_hash,input,result,result_hash,receipt) values($1,$2,$3,$4,$5,'{}',$6,$7,$8)`,[actor.userId,randomUUID(),obs,'k-'+randomUUID(),sha('body'),result,sha(JSON.stringify(result)),{revision}]);
 };
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  await admin.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,`${actor.userId}@example.test`]);
  await admin.query("update public.profiles set role='admin' where id=$1",[actor.userId]);
  thesisId=randomUUID();await admin.query(`insert into public.research_theses(id,user_id,title) values($1,$2,'thesis')`,[thesisId,actor.userId]);
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S6SYNTH','Synthetic S6','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  const p=testPack(actor.userId);await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,p.binding.approvedPayloadHash,p.binding]);
  candidateId=(await importCandidate(actor,JSON.stringify(p.pack))).id;
 });
 afterAll(async()=>{await closeS4Pool();await admin?.end();});
 it('joins decisions to the latest evaluation of their observation and filters by week',async()=>{
  const a=await seedObservation(),b=await seedObservation();
  await evaluation(a,1,0.05);await evaluation(a,2,0.07); // revision 2 is current
  const insert=(arm:string,week:string,obs:string|null)=>admin.query(`insert into public.research_decisions(user_id,id,thesis_id,week_of,arm,action,reason,observation_id,frozen_at,created_at) values($1,$2,$3,$4,$5,'adopt','r',$6,$7,now())`,[actor.userId,randomUUID(),thesisId,week,arm,obs,arm==='human_baseline'?'2026-09-20T08:00:00Z':null]);
  await insert('human_baseline','2026-09-21',a);await insert('ai_candidate','2026-09-21',b);await insert('collab','2026-09-14',null);
  const rows=await loadArmRows(actor);
  expect(rows).toHaveLength(3);
  expect(rows.map(r=>r.week_of).sort()).toEqual(['2026-09-14','2026-09-21','2026-09-21']); // date-only, never shifted by the process time zone
  const withA=rows.find(r=>r.observation_id===a)!;expect(withA.arm).toBe('human_baseline');expect(withA.evaluation?.windows[0].result?.price_return).toBe(0.07);
  expect(rows.find(r=>r.observation_id===b)!.evaluation).toBeNull();
  expect(rows.find(r=>r.arm==='collab')!.observation_id).toBeNull();
  expect((await loadArmRows(actor,{since:'2026-09-21'})).map(r=>r.arm).sort()).toEqual(['ai_candidate','human_baseline']);
  await expect(loadArmRows(actor,{since:'2026-9-1'})).rejects.toThrow('invalid_schema');
  // Observation-level authorization applies exactly as in observationReport: a cancelled observation's evaluation is not exported.
  await admin.query("update public.research_s4_observation_state set status='cancelled' where user_id=$1 and observation_id=$2",[actor.userId,a]);
  const afterCancel=(await loadArmRows(actor)).find(r=>r.observation_id===a)!;
  expect(afterCancel.evaluation).toBeNull();expect(afterCancel.blocked).toBe('policy_blocked');
 });
});
