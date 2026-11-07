// PG17 receipt visibility: S4 harness creates a fresh database and applies migrations before this suite.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {typeParsers} from '../db/pg-table-client';
import {catalogById} from './catalog';
import {memoryMacroDb} from './memory-db';
import {observationFromRow,selectEligibleHistoryAsOf} from './db';
import {macroReadApi} from './read-api';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('classifyAsOf batch visibility (PG17)',()=>{
 let pg:Pool;
 beforeAll(()=>{const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));pg=new Pool({connectionString:state.adminUrl,types:typeParsers});});
 afterAll(async()=>{await pg?.end();});
 it('uses A before B finalizes and B afterward for one series and period',async()=>{
  const series='US_UNRATE',period='2026-09-30',before='2026-10-18T00:00:00.000Z',after='2026-10-25T00:00:00.000Z';
  const version=`macro-catalog/${randomUUID().replaceAll('-','').slice(0,12)}`;
  await pg.query('select public.macro_upsert_catalog($1,$2,$3::jsonb)',[version,'macro-rules/1',JSON.stringify([catalogById(series)])]);
  const seed=async(value:string,finished:string)=>{
   const batch=randomUUID(),hash=createHash('sha256').update(batch).digest('hex');
   await pg.query(`insert into public.ingest_batches(batch_id,producer,dataset,started_at) values($1,'ts-fred','macro.fred',$2)`,[batch,'2026-10-01T00:00:00Z']);
   const retrieval=(await pg.query(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',1,'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE','fred.stlouisfed.org',200,$3,$4,'{"node":"22"}'::jsonb,null) v`,[hash,`fred_csv/${hash}.csv`,'2026-10-15T00:00:00Z',batch])).rows[0].v;
   const result=(await pg.query(`select public.macro_write_observations($1,'test-code',$2::jsonb,null) v`,[batch,JSON.stringify([{series_id:series,period_end:period,value_text:value,available_at:'2026-10-15T00:00:00Z',revisable:true,retrieval_id:retrieval,locator:{kind:'csv_row',line:2,column:1}}])])).rows[0].v;
   expect(result.inserted+result.versioned).toBe(1);
   await pg.query(`update public.ingest_batches set status='success',finished_at=$2 where batch_id=$1 and status='running'`,[batch,finished]);
   return batch;
  };
  await seed('4.1','2026-10-16T00:00:00Z');
  await seed('4.2','2026-10-20T00:00:00Z');
  expect((await pg.query('select period_end from public.macro_observations where series_id=$1 limit 1',[series])).rows[0].period_end).toBe(period);
  expect((await pg.query('select value_text from public.macro_latest_eligible_observations($1,$2,$3,null)',[[series],after,'2026-10-31'])).rows.map(r=>r.value_text)).toEqual(['4.2']);
  const db={...memoryMacroDb(),
   eligibleHistoryAsOf:async(id:string,o:{to:string;asOf:string;maxRows:number})=>{
    const candidates=(await pg.query(`select * from public.macro_observations where series_id=$1 and status='ok' and period_end<=$2 and available_at<=$3 order by period_end,version`,[id,o.to,o.asOf])).rows.map(observationFromRow);
    return selectEligibleHistoryAsOf(candidates,o.asOf,o.maxRows,
     async ids=>ids.length?(await pg.query('select * from public.macro_observations where observation_id=any($1)',[ids])).rows.map(observationFromRow):[],
     async ids=>Object.fromEntries((ids.length?(await pg.query('select batch_id,status,finished_at from public.ingest_batches where batch_id=any($1)',[ids])).rows:[]).map(r=>[r.batch_id,{status:r.status,finished_at:r.finished_at?new Date(r.finished_at).toISOString():null}])));
   },
   observationsByIds:async(ids:string[])=>(await pg.query('select * from public.macro_observations where observation_id=any($1)',[ids])).rows.map(observationFromRow),
   batchFinishedAt:async(ids:string[])=>Object.fromEntries((await pg.query('select batch_id,status,finished_at from public.ingest_batches where batch_id=any($1)',[ids])).rows.map(r=>[r.batch_id,['success','partial'].includes(r.status)&&r.finished_at?new Date(r.finished_at).toISOString():null])),
  };
  const api=macroReadApi(db,{judgments:true});
  const early=await api.classifyAsOf('US','2026-10',before,'v1.0');
  const late=await api.classifyAsOf('US','2026-10',after,'v1.0');
  expect(early.observation_refs).toEqual([expect.objectContaining({series_id:series,value:4.1,vintage_id:'1'})]);
  expect(late.observation_refs).toEqual([expect.objectContaining({series_id:series,value:4.2,vintage_id:'2'})]);
 });
});
