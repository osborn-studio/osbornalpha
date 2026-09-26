import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {closeS4Pool,transaction} from '../s4/db';
import {recordDecision,recordOutcome} from '../s4/ledger';
import {importCalls,type HiphonCall} from './calls-import';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('WP-A10 calls import on real PostgreSQL',()=>{
 let admin:Pool;const actor={userId:randomUUID(),kind:'agent' as const};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  await admin.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,`${actor.userId}@example.test`]);
  await admin.query("update public.profiles set role='admin' where id=$1",[actor.userId]);
 });
 afterAll(async()=>{await closeS4Pool();await admin?.end();});
 // Thesis side goes through SQL here (production uses createThesis via the service client); ledger side is the real S4 path.
 const deps={
  theses:{find:async(title:string)=>(await admin.query('select id from public.research_theses where user_id=$1 and title=$2',[actor.userId,title])).rows[0]?.id??null,
   create:async(input:any)=>{const id=randomUUID();await admin.query(`insert into public.research_theses(id,user_id,title,body,invalidation_conditions,watch_metrics,next_review_at,status) values($1,$2,$3,$4,$5,$6,$7,'DRAFT')`,[id,actor.userId,input.title,input.body,JSON.stringify(input.invalidation_conditions),JSON.stringify(input.watch_metrics),input.next_review_at]);return id;}},
  ledger:{existingCardIds:async()=>new Set<string>((await transaction(actor,db=>db.query("select card_id from public.research_decisions where user_id=$1 and card_id like 'hiphon:%'",[actor.userId]))).rows.map((r:any)=>r.card_id)),
   recordDecision:(input:any)=>recordDecision(actor,input),recordOutcome:(input:any)=>recordOutcome(actor,input)},
 };
 const call=(id:string,rating:HiphonCall['rating'],ts:string):HiphonCall=>({kind:'call',call_id:id,ts_utc:ts,exchange_session:'A:'+ts.slice(0,10),ticker:'000000.TEST',name:'合成',market:'A',rating,thesis:'合成 thesis '+id,entry_basis:'next_open',entry_price_ref:1,target_pct:10,stop_price:0.9,stop_pct:-10,size_pct:1,horizon_days:250,signal_mix:['x'],chain_role:null,evidence:'low',source:'test'});
 it('records frozen human_baseline decisions and manual-close outcomes, idempotently',async()=>{
  const rows=[call('c-1','buy','2026-07-01T02:00:00Z'),call('c-2','hold','2026-07-08T02:00:00Z'),{kind:'event',call_id:'c-1',ts_utc:'2026-08-01T07:00:00Z',event:'manual_close',note:'cut'}];
  const journal=rows.map(r=>JSON.stringify(r)).join('\n');
  const first=await importCalls({journal,scorecard:{closed:{n:0,hits:0,hit_rate:null,by_rating:{}},open:{n:2,unrealized_avg_pct:0}},dryRun:false,...deps});
  expect(first).toMatchObject({calls:2,imported:2,theses_created:2,outcomes:1,scorecard:{consistent:true}});
  const decisions=(await admin.query("select arm,action,card_id,frozen_at,week_of::text as week_of,reason from public.research_decisions where user_id=$1 order by card_id",[actor.userId])).rows;
  expect(decisions.map((d:any)=>[d.arm,d.action,d.card_id,d.frozen_at.toISOString(),d.week_of])).toEqual([['human_baseline','adopt','hiphon:c-1','2026-07-01T02:00:00.000Z','2026-06-29'],['human_baseline','shadow','hiphon:c-2','2026-07-08T02:00:00.000Z','2026-07-06']]);
  const outcome=(await admin.query('select o.window_weeks,o.judged_by,o.price_result,d.card_id from public.research_outcomes o join public.research_decisions d on d.user_id=o.user_id and d.id=o.decision_id where o.user_id=$1',[actor.userId])).rows;
  expect(outcome).toHaveLength(1);expect(outcome[0]).toMatchObject({window_weeks:50,judged_by:'hiphon-pm-journal',card_id:'hiphon:c-1',price_result:{state:'closed',reason:'manual',note:'cut'}});
  const theses=(await admin.query("select title,status from public.research_theses where user_id=$1 order by title",[actor.userId])).rows;
  expect(theses.map((t:any)=>[t.title,t.status])).toEqual([['[hiphon-pm] c-1','DRAFT'],['[hiphon-pm] c-2','DRAFT']]);
  const again=await importCalls({journal,scorecard:null,dryRun:false,...deps});
  expect(again).toMatchObject({imported:0,skipped:2,outcomes:0,outcomes_unmatched:['c-1']});
  expect(Number((await admin.query('select count(*) from public.research_decisions where user_id=$1',[actor.userId])).rows[0].count)).toBe(2);
 });
});
