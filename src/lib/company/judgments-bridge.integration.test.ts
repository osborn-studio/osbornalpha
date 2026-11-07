// PG17: the production F4 list handler and company consumer share the anon-gated issuer contract.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {pgJudgmentsDb} from '@/lib/judgments/pg-judgments-db';
import {checkJudgmentsResponse,judgmentsUrl} from './judgments';
import {toJudgmentCard} from '@/lib/judgments/adapters/recommendation';
import {fixtureRecommendation} from '@/lib/judgments/testing/recommendation-fixture';
import {cardBody,visiblePercent} from '@/components/judgments/view-model';

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
 it('an owner-only issuer recommendation stays off the anon list and uses F4 card semantics',async()=>{
  const issuer=randomUUID(),owner=randomUUID();
  const c=await pool.connect();
  try{
   await c.query('begin');
   await c.query('insert into auth.users(id,email) values($1,$2)',[owner,`${owner}@example.test`]);
   const profile=(await c.query("insert into public.analyst_profiles(user_id,display_name,is_self) values($1,'me',true) returning id",[owner])).rows[0] as {id:string};
   const inserted=(await c.query("insert into public.recommendations(user_id,analyst_id,ticker,market,action,reference_price,confidence,rationale) values($1,$2,'NVDA','US','buy',120.5,70,'private call') returning id",[owner,profile.id])).rows[0] as {id:string};
   await c.query('grant usage on schema public to anon, authenticated');
   await c.query('grant select on public.recommendations to anon, authenticated');
   await c.query('set local role anon');
   expect((await c.query('select id from public.recommendations where id=$1',[inserted.id])).rows).toEqual([]);
   await c.query('reset role');
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   await c.query('set local role authenticated');
   expect((await c.query('select id from public.recommendations where id=$1',[inserted.id])).rows).toEqual([{id:inserted.id}]);
   await c.query('reset role');
   const recommendation=fixtureRecommendation({id:inserted.id,user_id:owner,analyst_id:profile.id,ticker:'NVDA',market:'US'});
   const ownerCard=toJudgmentCard(recommendation,null,{issuerOf:()=>issuer});
   expect(ownerCard).toMatchObject({source:'recommendation',subject:{type:'issuer',key:issuer},calibration:'self_assessed'});
   expect(visiblePercent(ownerCard)).toBeNull();
   expect(cardBody(ownerCard,'en').type).toBe('band');
   const anonymous=checkJudgmentsResponse(await (await GET(new Request(`https://alpha.example${judgmentsUrl(issuer,null)}`))).json(),null);
   expect(anonymous).toEqual({ok:true,cards:[]});
  }finally{await c.query('rollback');c.release();}
 });
});
