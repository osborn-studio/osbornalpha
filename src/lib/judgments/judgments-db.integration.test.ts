// src/lib/judgments/judgments-db.integration.test.ts
// F4 Task 4 (spec §5.7, §14.2): pgJudgmentsDb against the shared JudgmentsDb contract on real
// PostgreSQL (public reads under `set local role anon`, the rest under service_role), plus
// concurrency through two independent pools: appendSettlement on one judgment (applied +
// already_final; same request_key → applied + already_applied; never 23505), claimDue never hands a
// row out twice, registerJudgment races on one id, quarantine acceptance vs rejection on one item (P1-04/05),
// setJobState races on one expectation. The two-connection MVCC cohort freeze test is SQL-level (Task 3).
// Claims run under F4_CLAIM_LOCK (db-contract.ts) like every other judgments suite.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {startBatch} from '../dq/batches';
import {judgmentFixture,judgmentsDbContract,methodologyFixture,settlementFixture,withClaimLock} from './db-contract';
import type {JudgmentsContractHarness} from './db-contract';
import {jobKey} from './job-keys';
import {pgJudgmentsDb} from './pg-judgments-db';

const enabled=!!process.env.S4_TEST_STATE;
const adminUrl=()=>JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl as string;

describe.skipIf(!enabled)('pgJudgmentsDb on real PostgreSQL',()=>{
 judgmentsDbContract('pgJudgmentsDb contract',async():Promise<JudgmentsContractHarness>=>{
  const pool=new Pool({connectionString:adminUrl(),max:8});const tables=pgTableClient(pool);
  return {db:pgJudgmentsDb(pool),tables,
   batch:async()=>(await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.ztest'})).batchId,
   issuer:async(o={})=>{const id=randomUUID();/* plan 3 issuers_topology_guard: non-active issuers need the transaction-local switch */await pool.query(`with s as (select set_config('entities.allow_topology_write','on',true)) insert into public.issuers(issuer_id,canonical_name_en,status,merged_into) select $1,'ZZ Judgments Contract',$2,$3 from s`,[id,o.status??'active',o.mergedInto??null]);return id;},
   industry:async()=>{const code=randomUUID().slice(0,8);await pool.query(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('custom','ztest',$1,1,'ZZ test industry')`,[code]);return `custom:ztest:${code}`;},
   adminUser:async()=>{const id=randomUUID();await pool.query(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@judgments.test`]);return id;},
   exclusiveClaims:fn=>withClaimLock(pool,fn),
   close:()=>pool.end()};
 });

 describe('concurrency through two pools',()=>{
  let p1:Pool,p2:Pool;
  beforeAll(()=>{p1=new Pool({connectionString:adminUrl(),max:4});p2=new Pool({connectionString:adminUrl(),max:4});});
  afterAll(async()=>{await p1?.end();await p2?.end();});
  const setup=async()=>{
   const d1=pgJudgmentsDb(p1),d2=pgJudgmentsDb(p2);const m=methodologyFixture();await d1.syncMethodology(m,'script',null);
   const {batchId:b}=await startBatch(pgTableClient(p1),{producer:'ts-judgments',dataset:'judgments.ztest'});
   return {d1,d2,m,b};
  };
  it('appendSettlement on one judgment from two pools: applied + already_final with different keys, applied + already_applied with one key; never 23505',async()=>{
   const {d1,d2,m,b}=await setup();
   await withClaimLock(p1,async()=>{
    for(const sameKey of [false,true]){
     const f=judgmentFixture(m,b,{target:{kind:'date',date:'2026-01-10'}});await d1.registerJudgment(f.row,f.queue);const j=f.row.judgment_id;
     const t=(await d1.claimDue(100,600)).find(r=>r.judgment_id===j)!.lease_token!;
     const row=settlementFixture(b);
     const out=await Promise.all([d1.appendSettlement(j,t,`${b}:${j}:A`,row),d2.appendSettlement(j,t,sameKey?`${b}:${j}:A`:`${b}:${j}:B`,row)]);
     expect(out.map(o=>o.status).sort()).toEqual(sameKey?['already_applied','applied']:['already_final','applied']);
     expect(out.every(o=>o.seq===1)).toBe(true);
     expect(await d2.settlementsOf([j])).toHaveLength(1);
    }
   });
  });
  it('claimDue from two pools at once never hands out the same row twice',async()=>{
   const {d1,d2,m,b}=await setup();
   await withClaimLock(p1,async()=>{
    const ids:string[]=[];
    for(let i=0;i<6;i++){const f=judgmentFixture(m,b,{target:{kind:'date',date:'2026-01-10'}});await d1.registerJudgment(f.row,f.queue);ids.push(f.row.judgment_id);}
    const [x,y]=await Promise.all([d1.claimDue(3,600),d2.claimDue(3,600)]);
    const got=[...x,...y].filter(r=>ids.includes(r.judgment_id));
    expect(got).toHaveLength(6);expect(new Set(got.map(r=>r.judgment_id)).size).toBe(6);
    for(const r of got)await d1.releaseLease(r.judgment_id,r.lease_token!,{last_status:'pending',last_detail:{},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0});
   });
  });
  it('registerJudgment racing on one id: one succeeds, the other gets duplicate_key',async()=>{
   const {d1,d2,m,b}=await setup();const f=judgmentFixture(m,b);
   const out=await Promise.allSettled([d1.registerJudgment(f.row,f.queue),d2.registerJudgment(f.row,f.queue)]);
   expect(out.filter(o=>o.status==='fulfilled')).toHaveLength(1);
   expect(out.find(o=>o.status==='rejected')).toMatchObject({reason:{code:'duplicate_key'}});
  });
  it('applyQuarantineOverride vs rejectQuarantinedSettlement on one item from two pools: exactly one wins, the other writes nothing (P1-04, P1-05)',async()=>{
   const {d1,d2,m,b}=await setup();
   const tables=pgTableClient(p1);
   const by=randomUUID();await p1.query(`insert into auth.users(id,email) values($1,$2)`,[by,`${by}@judgments.test`]);
   await withClaimLock(p1,async()=>{
    for(let round=0;round<3;round++){
     const f=judgmentFixture(m,b,{target:{kind:'date',date:'2026-01-10'}});await d1.registerJudgment(f.row,f.queue);const j=f.row.judgment_id;
     const H='e'.repeat(64),cutoff='2026-03-02T04:00:00.000Z';
     const t=(await d1.claimDue(100,600)).find(r=>r.judgment_id===j)!.lease_token!;
     const attempt={reason_code:'settlement_basis_mismatch',evidence_hash:H,cutoff};
     const item=(await d1.quarantineSettlement(j,t,'settlement_basis_mismatch',{evidence_hash:H,cutoff,judgment_id:j},
      {last_status:'inconsistent',last_detail:{...attempt,incident:{...attempt,quarantined_at:cutoff}},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0},b)).quarantine_id!;
     const override={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched' as const,evidence_hash:H,evidence:{}},evidence_hash:H,resolved_by:by,at:new Date().toISOString(),cutoff};
     const row=settlementFixture(b,{kind:'void',outcome:null,realized:null,reason:'quarantine_rejected',actor:`admin:${by}`});
     const [acc,rej]=await Promise.all([d1.applyQuarantineOverride(j,override,item,{}),d2.rejectQuarantinedSettlement(j,item,{evidence_hash:H,cutoff},`adm:${randomUUID()}`,row,{})]);
     expect([acc==='applied',rej.status==='applied'].filter(Boolean)).toHaveLength(1);
     const [it]=await tables.select('dq_quarantine',{id:item});
     const q=(await d1.queueRow(j))!;
     if(acc==='applied'){expect(rej.status).toBe('item_not_open');expect(it.status).toBe('resolved_accept');expect(await d1.settlementsOf([j])).toEqual([]);
      const mine=(await d1.claimDue(100,600)).find(r=>r.judgment_id===j)!;await d1.releaseLease(j,mine.lease_token!,{last_status:'pending',last_detail:{},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0});}
     else{expect(acc).toBe('item_not_open');expect(it.status).toBe('resolved_reject');expect(q.override).toBeNull();expect(q.closed_at).not.toBeNull();}
    }
   });
  });
  it('setJobState racing on one expectation: exactly one writer wins',async()=>{
   const {d1,d2}=await setup();
   const job=jobKey('produce',`ztest_${randomUUID().replaceAll('-','').slice(0,16)}`,'v1');
   expect((await d1.setJobState(job,null,{marker:0})).ok).toBe(true);
   const s=(await d1.jobState(job))!;
   const out=await Promise.all([d1.setJobState(job,s.updated_at,{marker:1}),d2.setJobState(job,s.updated_at,{marker:2})]);
   expect(out.filter(x=>x.ok)).toHaveLength(1);
  });
 });
});
