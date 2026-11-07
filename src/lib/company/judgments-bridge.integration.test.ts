// PG17: the production F4 list handler and company consumer share the anon-gated issuer contract.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {pgJudgmentsDb} from '@/lib/judgments/pg-judgments-db';
import {pgTableClient} from '@/lib/db/pg-table-client';
import {startBatch} from '@/lib/dq/batches';
import {judgmentFixture,methodologyFixture} from '@/lib/judgments/db-contract';
import {checkJudgmentsResponse,judgmentsUrl} from './judgments';

const bridge=vi.hoisted(()=>({db:null as ReturnType<typeof pgJudgmentsDb>|null}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:bridge.db})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));
import {GET} from '@/app/api/judgments/route';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('company → F4 list route on PG17',()=>{
 let pool:Pool;
 beforeAll(()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')) as {adminUrl:string};
  pool=new Pool({connectionString:state.adminUrl});
  bridge.db=pgJudgmentsDb(pool);
 });
 afterAll(async()=>{bridge.db=null;await pool?.end();});
 it('returns an honest empty issuer list in latest and as_known; company selects no judgments',async()=>{
  const issuer=randomUUID(); // no issuer methodology is in F4 REGISTRY; no fixture is registered
  for(const asOf of [null,new Date().toISOString().slice(0,10)]){
   const response=await GET(new Request(`https://alpha.example${judgmentsUrl(issuer,asOf)}`));
   expect(response.status).toBe(200);
   const parsed=checkJudgmentsResponse(await response.json(),asOf);
   expect(parsed).toEqual({ok:true,cards:[]});
   if(parsed.ok)expect(parsed.cards.length===0).toBe(true); // JudgmentsView's `none` branch
  }
 });
 it('replays a SQL registered issuer card through the F4 list route and company parser',async()=>{
  const issuer=randomUUID(),tables=pgTableClient(pool),db=bridge.db!;
  await pool.query(`with s as (select set_config('entities.allow_topology_write','on',true)) insert into public.issuers(issuer_id,canonical_name_en,status) select $1,'ZZ Company judgment','active' from s`,[issuer]);
  const method=methodologyFixture({publishable:true});await db.syncMethodology(method,'script',null);
  const {batchId}=await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.ztest'});
  const fixture=judgmentFixture(method,batchId,{subject:{type:'issuer',key:issuer},as_of:'2026-03-01'});
  await db.registerJudgment(fixture.row,fixture.queue);
  const today=new Date().toISOString().slice(0,10);
  const response=await GET(new Request(`https://alpha.example${judgmentsUrl(issuer,today)}`));
  expect(response.status).toBe(200);
  const parsed=checkJudgmentsResponse(await response.json(),today);
  expect(parsed.ok).toBe(true);
  if(parsed.ok)expect(parsed.cards.map(c=>c.judgment_id)).toEqual([fixture.row.judgment_id]);
 });
 // F4's public list route always constructs an anon DB client and never reads recommendation_scores.
 // Owner identity cannot select a private recommendation through this route; a real Next/PostgREST
 // owner route is an accepted residual until F4 exposes one. Do not mislabel an adapter unit call as E2E.
 it.skip('owner-only recommendation through an authenticated F4 list route (route does not exist)',()=>{});
});
