// PG17 bridge: real active industry rows, F4 input freeze, and F4's public empty-card route.
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {pgIndustryDb} from './pg-industry-db';
import {industryTableRowsInput,metricsNaturalKey,valuationsNaturalKey} from './judgment-input';
import {pgJudgmentInputsDb} from '@/lib/judgments/testing/pg-inputs-db';
import {digest} from '@/lib/judgments/canonical';
import {buildInput} from '@/lib/judgments/inputs';
import {JudgmentError} from '@/lib/judgments/errors';
import {pgJudgmentsDb} from '@/lib/judgments/pg-judgments-db';
import {fetchIndustryJudgments,judgmentsViewState} from './judgment-contract';

const routeDb=vi.hoisted(()=>({current:null as unknown}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:routeDb.current})}));
import {GET} from '@/app/api/judgments/route';

const enabled=!!process.env.S4_TEST_STATE;
const adminUrl=()=>JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl as string;
describe.skipIf(!enabled)('PG17 judgments → industry bridge',()=>{
 let admin:Pool,anon:Pool,runId:string,inactiveRunId:string,version:string,manifest:string;
 const code='I'+randomUUID().slice(0,7);
 const period='2025-12-31';
 beforeAll(async()=>{
  admin=new Pool({connectionString:adminUrl(),max:2});
  anon=new Pool({connectionString:adminUrl(),max:1});
  await anon.query('set role anon');
  version='sec-current';
  runId=randomUUID();inactiveRunId=randomUUID();manifest=randomBytes(32).toString('hex');
  const batch=randomUUID();
  await admin.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'industry-bridge','industry.bridge')`,[batch]);
  await admin.query(`insert into public.industry_classifications(scheme,version,code,level,name_zh) values('sic',$1,$2,1,'桥接测试')`,[version,code]);
  await admin.query(`select public.put_industry_manifest($1,'aggregate',10)`,[manifest]);
  await admin.query(`insert into public.industry_metric_runs(run_id,scheme,version,level,generation,facts_as_of,knowledge_date,history_class,method_version,config_hash,formula_version,code_version,expected_grid,fingerprint_at,batch_id,status,activated_at)
   values($1,'sic',$2,1,1,$3,$3,'reconstruction','industry-agg/1.0',$4,'derive/1','bridge-test','{}',now(),$5,'active',now())`,[runId,version,period,'b'.repeat(64),batch]);
  await admin.query(`insert into public.industry_metrics(run_id,code,metric,period_start,period_end,duration,status,missing_reason,value,unit,n_members,n_with_data,n_unresolved,manifest_hash,updated_at)
   values($1,$2,'member_count',$3,$3,'INSTANT','ok',null,2,'count',2,2,0,$4,now())`,[runId,code,period,manifest]);
  await admin.query(`insert into public.industry_metric_runs(run_id,scheme,version,level,generation,facts_as_of,knowledge_date,history_class,method_version,config_hash,formula_version,code_version,expected_grid,fingerprint_at,batch_id,status)
   values($1,'sic',$2,1,2,$3,$3,'reconstruction','industry-agg/1.0',$4,'derive/1','bridge-test','{}',now(),$5,'building')`,[inactiveRunId,version,period,'b'.repeat(64),batch]);
  routeDb.current=pgJudgmentsDb(anon);
 });
 afterAll(async()=>{await anon?.end();await admin?.end();});
 it('freezes active anon rows with the shipped adapter hash and rejects deferred valuations',async()=>{
  const industry=pgIndustryDb(anon);
  // CI has no PostgREST/Next server; real-SQL adapters implement the production interfaces under PG RLS.
  const db=pgJudgmentInputsDb(anon,{industry});
  const ref={table:'industry_metrics' as const,natural_key:metricsNaturalKey(runId,code,period)};
  const actual=await buildInput({kind:'table_rows',ref},db,'2099-01-01','2099-01-01T23:59:59.999Z');
  const adapted=await industryTableRowsInput(industry,ref);
  const stamp=(await admin.query(`select updated_at from public.industry_metrics where run_id=$1 and code=$2`,[runId,code])).rows[0].updated_at as Date;
  const expected={table:'industry_metrics',natural_key:ref.natural_key,rows:[{run_id:runId,code,metric:'member_count',period_start:period,period_end:period,duration:'INSTANT',status:'ok',missing_reason:null,value:'2',unit:'count',n_members:2,n_with_data:2,n_unresolved:0,manifest_hash:manifest,updated_at:stamp.toISOString()}]};
  await expect(industryTableRowsInput(industry,{table:'industry_metrics',natural_key:metricsNaturalKey(inactiveRunId,code,period)})).rejects.toMatchObject({code:'input_not_public'});
  expect(actual.snapshot).toEqual(expected);
  expect(adapted.snapshot).toEqual(expected);
  expect(actual.hash).toBe(adapted.hash);
  expect(actual.hash).toBe(digest(expected));
  expect(await db.tableRows('industry_metrics',ref.natural_key)).toEqual(adapted.snapshot.rows);
  expect(adapted.snapshot).toMatchObject({table:'industry_metrics',natural_key:ref.natural_key,rows:[{run_id:runId,code,metric:'member_count',period_end:period,status:'ok',manifest_hash:manifest}]});
  expect(actual.origin.locator).toBe(`manifest:${manifest}`);
  await expect(buildInput({kind:'table_rows',ref},db,'2020-01-01','2020-01-01T23:59:59.999Z')).rejects.toMatchObject({code:'input_not_public'});
  await expect(buildInput({kind:'table_rows',ref:{table:'industry_valuations' as 'industry_metrics',natural_key:valuationsNaturalKey(runId,code,period)}},db,'2099-01-01','2099-01-01T23:59:59.999Z')).rejects.toMatchObject({code:'input_not_allowed'} satisfies Partial<JudgmentError>);
 });
 it('real F4 list handler has no industry card; consumer shows no judgments',async()=>{
  const key=`sic:${version}:${code}`;
  const url=`http://localhost/api/judgments?subject_type=industry&subject_key=${key}&include_abstained=1`;
  const response=await GET(new Request(url));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({subject:{type:'industry',key},asOf:null,view:'latest',cards:[]});
  const result=await fetchIndustryJudgments(key,{enabled:true,fetch:async()=>(await GET(new Request(url))) as Response});
  expect(judgmentsViewState(true,key,{key,result})).toEqual({state:'ok',cards:[]});
 });
});
