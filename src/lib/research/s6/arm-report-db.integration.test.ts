import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {closeS4Pool} from '../s4/db';
import {loadArmRows} from './arm-report-db';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('E4 arm report loader on real PostgreSQL',()=>{
 let admin:Pool;const actor={userId:randomUUID(),kind:'agent' as const};const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
 let thesisId:string;const observations:string[]=[];
 const seedObservation=async()=>{
  const src=randomUUID(),ver=randomUUID(),cand=randomUUID(),obs=randomUUID(),hash=sha('pack'+cand);
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'MANUAL','t','b',$3)`,[src,actor.userId,sha('b'+src)]);
  await admin.query(`insert into public.research_source_versions(user_id,id,source_document_id,version_identity,source_key,source_ref,source_version) values($1,$2,$3,$4,$5,'{}','{}')`,[actor.userId,ver,src,'v-'+ver,'k-'+ver]);
  await admin.query(`insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)`,[actor.userId,hash,{localUserId:actor.userId,approvedPayloadHash:hash}]);
  await admin.query(`insert into public.research_s4_candidates(user_id,id,source_version_id,external_candidate_id,payload_hash,imported,status) values($1,$2,$3,$4,$5,'{}','observe')`,[actor.userId,cand,ver,randomUUID(),hash]);
  const payload={synthetic:true,n:observations.length};
  await admin.query(`insert into public.research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,'Observation',$4,$5)`,[actor.userId,obs,cand,JSON.stringify(payload),sha(JSON.stringify(payload))]);
  await admin.query(`insert into public.research_s4_observation_state(user_id,observation_id,status) values($1,$2,'pending_start')`,[actor.userId,obs]);
  observations.push(obs);return obs;
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
 });
 afterAll(async()=>{await closeS4Pool();await admin?.end();});
 it('joins decisions to the latest evaluation of their observation and filters by week',async()=>{
  const a=await seedObservation(),b=await seedObservation();
  await evaluation(a,1,0.05);await evaluation(a,2,0.07); // revision 2 is current
  const insert=(arm:string,week:string,obs:string|null)=>admin.query(`insert into public.research_decisions(user_id,id,thesis_id,week_of,arm,action,reason,observation_id,frozen_at,created_at) values($1,$2,$3,$4,$5,'adopt','r',$6,$7,now())`,[actor.userId,randomUUID(),thesisId,week,arm,obs,arm==='human_baseline'?'2026-09-20T08:00:00Z':null]);
  await insert('human_baseline','2026-09-21',a);await insert('ai_candidate','2026-09-21',b);await insert('collab','2026-09-14',null);
  const rows=await loadArmRows(actor);
  expect(rows).toHaveLength(3);
  const withA=rows.find(r=>r.observation_id===a)!;expect(withA.arm).toBe('human_baseline');expect(withA.evaluation?.windows[0].result?.price_return).toBe(0.07);
  expect(rows.find(r=>r.observation_id===b)!.evaluation).toBeNull();
  expect(rows.find(r=>r.arm==='collab')!.observation_id).toBeNull();
  expect((await loadArmRows(actor,{since:'2026-09-21'})).map(r=>r.arm).sort()).toEqual(['ai_candidate','human_baseline']);
  await expect(loadArmRows(actor,{since:'2026-9-1'})).rejects.toThrow('invalid_schema');
 });
});
