// PG17 receipt visibility: S4 harness creates a fresh database and applies migrations before this suite.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {memoryMacroDb} from './memory-db';
import {observationFromRow} from './db';
import {macroReadApi} from './read-api';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('classifyAsOf batch visibility (PG17)',()=>{
 let pg:Pool;
 beforeAll(()=>{const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));pg=new Pool({connectionString:state.adminUrl});});
 afterAll(async()=>{await pg?.end();});
 it('fails closed before finalization and returns the observation after finalization',async()=>{
  const batch=randomUUID(),observation=randomUUID(),retrieval=randomUUID(),hash='a'.repeat(64);
  const suffix=randomUUID().replaceAll('-','').slice(0,12),version=`macro-catalog/${suffix}`;
  const before='2026-11-01T00:00:00.000Z',finished='2026-11-02T00:00:00.000Z',after='2026-11-03T00:00:00.000Z';
  await pg.query(`insert into public.macro_catalog_versions(catalog_version,catalog,rules_version) values($1,'[]','test')`,[version]);
  await pg.query(`insert into public.macro_series(id,region,role,type,name,unit,native_frequency,period,adjustment,status,source,revision_policy,weight,change_kind,definition_version,catalog_version)
   values('US_DFF','US','indicator','policy_rate','{}','%', 'daily','month','na','active','{}','revisable',25,'bp',1,$1)
   on conflict(id) do nothing`,[version]);
  await pg.query(`insert into public.ingest_batches(batch_id,producer,dataset,status,started_at,finished_at) values($1,'test','macro.fred','success',$2,$3)`,[batch,'2026-10-01T00:00:00Z',finished]);
  await pg.query(`insert into public.macro_evidence_objects(sha256,object_path,adapter,content_type,byte_length) values($1,$2,'fred_csv','text/csv',1) on conflict do nothing`,[hash,`fred_csv/${hash}.csv`]);
  await pg.query(`insert into public.macro_retrievals(retrieval_id,sha256,fetch_url,fetch_host,http_status,fetched_at,batch_id,tool_versions) values($1,$2,'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF','fred.stlouisfed.org',200,$3,$4,'{}')`,[retrieval,hash,'2026-10-15T00:00:00Z',batch]);
  await pg.query(`insert into public.macro_observations(observation_id,series_id,period_end,value,value_text,version,available_at,status,retrieval_id,locator,code_version,batch_id)
   values($1,'US_DFF','2026-10-31',4.1,'4.1',1,'2026-10-15T00:00:00Z','ok',$2,'{"kind":"csv_row","line":2,"column":1}','test',$3)`,[observation,retrieval,batch]);
  const db={...memoryMacroDb(),
   latestEligible:async(ids:string[],opts?:{asOf?:string;periodEndLte?:string})=>(await pg.query('select * from public.macro_latest_eligible_observations($1,$2,$3,null)',[ids,opts?.asOf??null,opts?.periodEndLte??null])).rows.map(observationFromRow),
   eligibleHistory:async(id:string,o:{from?:string;to?:string;asOf?:string})=>(await pg.query('select * from public.macro_eligible_history($1,$2,$3,$4,null,null,1000)',[id,o.from??null,o.to??null,o.asOf??null])).rows.map(observationFromRow),
   observationsByIds:async(ids:string[])=>(await pg.query('select * from public.macro_observations where observation_id=any($1)',[ids])).rows.map(observationFromRow),
   batchFinishedAt:async(ids:string[])=>Object.fromEntries((await pg.query('select batch_id,finished_at from public.ingest_batches where batch_id=any($1)',[ids])).rows.map(r=>[r.batch_id,new Date(r.finished_at).toISOString()])),
  };
  const api=macroReadApi(db,{judgments:true});
  await expect(api.classifyAsOf('US','2026-10',before,'v1.0')).rejects.toMatchObject({code:'historical_cutoff_unsupported'});
  expect((await api.classifyAsOf('US','2026-10',after,'v1.0')).observation_refs).toEqual([expect.objectContaining({series_id:'US_DFF',value:4.1})]);
 });
});
