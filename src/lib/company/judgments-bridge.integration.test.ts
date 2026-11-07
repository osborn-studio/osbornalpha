// PG17: the production F4 list handler and company consumer share the anon-gated issuer contract.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {pgJudgmentsDb} from '@/lib/judgments/pg-judgments-db';
import {pgTableClient} from '@/lib/db/pg-table-client';
import {startBatch} from '@/lib/dq/batches';
import {judgmentFixture,methodologyFixture} from '@/lib/judgments/db-contract';
import {checkJudgmentsResponse,judgmentsUrl} from './judgments';

const bridge=vi.hoisted(()=>({db:null as ReturnType<typeof pgJudgmentsDb>|null}));
const company=vi.hoisted(()=>({data:null as unknown}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:bridge.db})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));
vi.mock('@/lib/company/client',()=>({JUDGMENTS_FLAG:true}));
vi.mock('@/components/company/useCompanyFetch',()=>({useCompanyFetch:()=>({state:{status:'success',data:company.data},retry:()=>{}})}));
vi.mock('next-intl',()=>({useLocale:()=> 'en',useTranslations:()=> (key:string)=>key}));
import {GET} from '@/app/api/judgments/route';
import {JudgmentsView} from '@/components/company/JudgmentsView';

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
   const parsed=checkJudgmentsResponse(await response.json(),asOf,issuer);
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
  const parsed=checkJudgmentsResponse(await response.json(),today,issuer);
  expect(parsed.ok).toBe(true);
  if(parsed.ok)expect(parsed.cards.map(c=>c.judgment_id)).toEqual([fixture.row.judgment_id]);
 });
 // F4 has no owner-only list path; owner rendering is a future F4 interface.
 it('keeps an owner private recommendation in the ledger and out of the anon company view',async()=>{
  const issuer=randomUUID(),tables=pgTableClient(pool),db=bridge.db!;
  await pool.query(`with s as (select set_config('entities.allow_topology_write','on',true)) insert into public.issuers(issuer_id,canonical_name_en,status) select $1,'ZZ Private recommendation','active' from s`,[issuer]);
  const method=methodologyFixture({judgment_type:'recommendation_call',publishable:false});
  await db.syncMethodology(method,'script',null);
  const {batchId}=await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.ztest'});
  const fixture=judgmentFixture(method,batchId,{subject:{type:'issuer',key:issuer},as_of:'2026-03-01'});
  await db.registerJudgment(fixture.row,fixture.queue);
  const ledger=await pool.query('select judgment_id, judgment_type, subject_key from public.judgments where judgment_id=$1::uuid',[fixture.row.judgment_id]);
  expect(ledger.rows).toMatchObject([{judgment_id:fixture.row.judgment_id,judgment_type:'recommendation_call',subject_key:issuer}]);
  const response=await GET(new Request(`https://alpha.example${judgmentsUrl(issuer,null)}`));
  expect(response.status).toBe(200);
  company.data=await response.json();
  expect(checkJudgmentsResponse(company.data,null,issuer)).toEqual({ok:true,cards:[]});
  const html=renderToStaticMarkup(createElement(JudgmentsView,{issuerId:issuer,asOf:null}));
  expect(html).toContain('>none</div>');
  expect(html).not.toContain('%');
  expect(html).not.toContain('<article');
 });
});
