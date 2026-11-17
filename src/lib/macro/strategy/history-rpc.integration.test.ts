// Local PostgreSQL only: S4_TEST_STATE is produced by scripts/s4/local-db.ts.
// Real RLS/table reads and RPC SQL; the HTTP envelope alone is simulated.
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {MACRO_CATALOG} from '../catalog';
import {supabaseMacroDb} from '../db';
import {buildCycleTableManifest} from './cycle-table';
import {strategyHistoriesReader} from './history-rpc';
import {manifestHash} from './manifest';
import {buildPolicyResponseManifest} from './policy-response';
import {snap} from './testing/fixture';
import {buildTransmissionManifest} from './transmission';
import {macroDbStrategyPort} from './wiring';

const enabled=!!process.env.S4_TEST_STATE;
const asOf='2026-11-07T00:00:00.000Z';
describe.skipIf(!enabled)('strategy history RPC on PostgreSQL under anon RLS',()=>{
 let pool:Pool,c:PoolClient;
 let legacy:ReturnType<typeof macroDbStrategyPort>,rpc:ReturnType<typeof macroDbStrategyPort>;
 let read:ReturnType<typeof strategyHistoriesReader>;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  // Never accept a remote database, even if a state file is accidentally supplied.
  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(state.adminUrl).hostname))throw new Error('local database required');
  pool=new Pool({connectionString:state.adminUrl,statement_timeout:10000});c=await pool.connect();
  await c.query('begin');
  const catalogVersion=`macro-catalog/${randomBytes(6).toString('hex')}`;
  await c.query('select public.macro_upsert_catalog($1,$2,$3::jsonb)',[catalogVersion,'test-rules',JSON.stringify(MACRO_CATALOG)]);
  const batches:Record<string,string>={};
  for(const status of ['success','partial','running','failed','rejected']){
   const id=randomUUID();batches[status]=id;
   await c.query("insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ts-fred','macro.fred')",[id]);
   if(status!=='running')await c.query('update public.ingest_batches set status=$2,finished_at=now() where batch_id=$1',[id,status]);
  }
  // Native and derived provenance, microseconds/offsets, multiple periods and vintages.
  const retrieval=randomUUID(),hash=randomBytes(32).toString('hex');
  await c.query("insert into public.macro_evidence_objects(sha256,object_path,adapter,content_type,byte_length) values($1,$2,'fred_csv','text/csv',1)",[hash,`fred_csv/${hash}.csv`]);
  await c.query(`insert into public.macro_retrievals(retrieval_id,sha256,fetch_url,fetch_host,http_status,fetched_at,batch_id)
   values($1,$2,'https://fred.stlouisfed.org/test','fred.stlouisfed.org',200,now(),$3)`,[retrieval,hash,batches.success]);
  for(const id of ['US_UNRATE','US_DGS10','US_DGS10_D','US_FED_TARGET_D','US_FED_TARGET_UPPER_D','US_FED_TARGET_LOWER_D']){
   for(const [period,version,status,batch,available] of [
    ['2026-08-31',1,'ok','success','2026-09-01T02:00:00+02:00'],
    ['2026-08-31',2,'ok','partial','2026-09-02T00:00:00Z'],
    ['2026-08-31',3,'ok','success','2026-12-01T00:00:00Z'],
    ['2026-09-30',1,'ok','success','2026-10-01T00:00:00Z'],
    ['2026-10-31',1,'quarantined','success','2026-11-01T00:00:00Z'],
    ['2026-10-31',2,'rejected','success','2026-11-01T00:00:00Z'],
    ['2026-10-31',3,'ok','running','2026-11-01T00:00:00Z'],
    ['2026-10-31',4,'ok','failed','2026-11-01T00:00:00Z'],
    ['2026-10-31',5,'ok','rejected','2026-11-01T00:00:00Z'],
   ] as const){
    const native=version===1;
    await c.query(`insert into public.macro_observations(observation_id,series_id,period_end,value,value_text,version,available_at,ingested_at,status,retrieval_id,locator,derived_from,transform,code_version,batch_id)
     values($1,$2,$3,$4::text::numeric,$4::text,$5,$6,'2026-11-01T00:00:00.123456Z',$7,$8,$9,$10,$11,'test',$12)`,
    [randomUUID(),id,period,String(version),version,available,status,native?retrieval:null,native?{kind:'csv_row'}:null,native?null:[randomUUID()],native?null:'test_transform',batches[batch]]);
   }
  }
  // One period with enough vintages to cross the final 16x cap (maxRows=1).
  await c.query(`insert into public.macro_observations(observation_id,series_id,period_end,value,value_text,version,available_at,status,retrieval_id,locator,code_version,batch_id)
   select gen_random_uuid(),'US_DGS2','2026-08-31',1,'1',v,
    case when v=17 then '2026-10-02'::timestamptz else '2026-10-01'::timestamptz end,
    'ok',$1,'{"kind":"csv_row"}'::jsonb,'test',$2 from generate_series(1,17) v`,[retrieval,batches.success]);
  await c.query('set local role anon');
  const fetcher:typeof fetch=async(input,init)=>{
   const req=new Request(input,init),url=new URL(req.url);
   if(url.origin!=='https://fixture.invalid')throw new Error('external network forbidden');
   let data:unknown,count=0,offset=0;
   if(url.pathname==='/rest/v1/rpc/macro_strategy_histories'){
    const a=await req.json();data=(await c.query('select public.macro_strategy_histories($1,$2,$3,$4) v',[a.p_series,a.p_as_of,a.p_from,a.p_to])).rows[0].v;
   }else if(url.pathname==='/rest/v1/rpc/macro_latest_observations'){
    const a=await req.json();data=(await c.query('select row_to_json(o) v from public.macro_latest_observations($1,$2,$3) o',[a.p_series_ids,a.p_as_of,a.p_period_end_lte])).rows.map(r=>r.v);
   }else{
    expect(url.pathname).toBe('/rest/v1/macro_observations');
    const values:unknown[]=[],where:string[]=[];
    for(const [key,filter] of url.searchParams){
     if(['select','order','offset','limit'].includes(key))continue;
     if(!['series_id','status','period_end','available_at'].includes(key))throw new Error(`unexpected column:${key}`);
     const dot=filter.indexOf('.'),op=filter.slice(0,dot),operator={eq:'=',gte:'>=',lte:'<='}[op];
     if(!operator)throw new Error(`unexpected operator:${op}`);
     values.push(filter.slice(dot+1));where.push(`${key}${operator}$${values.length}`);
    }
    const clause=where.join(' and ');
    count=Number((await c.query(`select count(*) n from public.macro_observations where ${clause}`,values)).rows[0].n);
    offset=Number(url.searchParams.get('offset')??0);const limit=Number(url.searchParams.get('limit')??1000);
    data=(await c.query(`select row_to_json(o) v from (select * from public.macro_observations where ${clause} order by period_end,version offset ${offset} limit ${limit}) o`,values)).rows.map(r=>r.v);
   }
   return new Response(JSON.stringify(data),{headers:{'content-type':'application/json','content-range':`${offset}-${offset+Math.max(0,(Array.isArray(data)?data.length:0)-1)}/${count}`}});
  };
  const client=createClient('https://fixture.invalid','anon-fixture',{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false}});
  const db=supabaseMacroDb({admin:client,anon:client});read=strategyHistoriesReader(client);
  legacy=macroDbStrategyPort(db);rpc=macroDbStrategyPort(db,{historiesReader:read});
 },30000);
 afterAll(async()=>{if(c){await c.query('rollback');c.release();}await pool?.end();});
 it('matches legacy visible rows, raw counts, empty series and inclusive bounds in multi-series calls',async()=>{
  for(const bounds of [{},{from:'2026-09-01'},{to:'2026-08-31'},{from:'2026-08-31',to:'2026-09-30'}]){
   const ids=['US_UNRATE','US_DGS10','US_WTI'];
   const result=await read(ids,{asOf,...bounds});
   const actual=await Promise.all(ids.map(id=>rpc.seriesHistory(id,{asOf,...bounds,maxRows:10})));
   const expected=await Promise.all(ids.map(id=>legacy.seriesHistory(id,{asOf,...bounds,maxRows:10})));
   expect(actual).toEqual(expected);
   expect(result.map(r=>r.raw_count)).toEqual(bounds.from==='2026-09-01'?[1,1,0]:bounds.to==='2026-08-31'?[2,2,0]:[3,3,0]);
   expect(result[2]).toEqual({series_id:'US_WTI',raw_count:0,rows:[]});
  }
  const early={asOf:'2026-09-01T00:00:00Z',maxRows:10};
  expect(await rpc.seriesHistory('US_UNRATE',early)).toEqual(await legacy.seriesHistory('US_UNRATE',early));
  expect((await rpc.seriesHistory('US_UNRATE',early))[0].version).toBe(1);
 });
 it('preserves every full manifest hash for transmission, policy windows and cycle boundaries',async()=>{
  const options={now:new Date(asOf),codeVersion:'test',snapshots:{US:snap('US',asOf,[]),CN:snap('CN',asOf,[])}};
  for(const region of ['US','CN'] as const)expect(manifestHash((await buildTransmissionManifest(rpc,{...options,region}))!)).toBe(manifestHash((await buildTransmissionManifest(legacy,{...options,region}))!));
  for(const window of [1,3,6] as const)expect(manifestHash(await buildPolicyResponseManifest(rpc,{...options,window}))).toBe(manifestHash(await buildPolicyResponseManifest(legacy,{...options,window})));
  for(const boundary of ['event_day','first_trading_day','month_end'] as const)expect(manifestHash(await buildCycleTableManifest(rpc,{...options,boundary}))).toBe(manifestHash(await buildCycleTableManifest(legacy,{...options,boundary})));
 });
 it('retains period truncation semantics with real vintage counts',async()=>{
  for(const maxRows of [1,2,3])expect(await Promise.allSettled([rpc.seriesHistory('US_UNRATE',{asOf,maxRows})])).toEqual(await Promise.allSettled([legacy.seriesHistory('US_UNRATE',{asOf,maxRows})]));
 });
 it('matches the raw-vintage cap ladder at and beyond its final rung',async()=>{
  const bounded={asOf:'2026-10-01T00:00:00Z',maxRows:1};
  expect(await rpc.seriesHistory('US_DGS2',bounded)).toEqual(await legacy.seriesHistory('US_DGS2',bounded));
  expect((await read(['US_DGS2'],bounded))[0].raw_count).toBe(16);
  for(const port of [legacy,rpc])await expect(port.seriesHistory('US_DGS2',{asOf,maxRows:1})).rejects.toThrow('truncated');
 });
 it('is stable, SECURITY INVOKER, fixed search_path, replayable and executable by all table reader roles',async()=>{
  await c.query('reset role');
  const info=(await c.query("select l.lanname,p.provolatile,p.prosecdef,p.proconfig from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.macro_strategy_histories(text[],timestamptz,date,date)'::regprocedure")).rows[0];
  expect(info).toMatchObject({lanname:'plpgsql',provolatile:'s',prosecdef:false,proconfig:['search_path=public']});
  for(const role of ['anon','authenticated','service_role']){
   expect((await c.query("select has_function_privilege($1,'public.macro_strategy_histories(text[],timestamptz,date,date)','EXECUTE') v",[role])).rows[0].v).toBe(true);
   await c.query(`set local role ${role}`);
   const result=(await c.query('select public.macro_strategy_histories($1,$2) v',[['US_UNRATE'],asOf])).rows[0].v;
   expect(result[0].raw_count).toBe(role==='service_role'?6:3);
   await c.query('reset role');
  }
  await c.query(readFileSync('supabase/migrations/20261126100000_macro_strategy_histories.sql','utf8'));
  await c.query('set local role anon');
 });
 it('rejects null, empty and more than 64 series with invalid_argument and accepts 64',async()=>{
  for(const series of [null,[],Array.from({length:65},()=> 'EMPTY')]){
   await c.query('savepoint invalid_argument');
   await expect(c.query('select public.macro_strategy_histories($1,$2)',[series,asOf])).rejects.toMatchObject({message:'invalid_argument',code:'22023'});
   await c.query('rollback to savepoint invalid_argument');
  }
  expect((await read(Array.from({length:64},(_,i)=>`EMPTY_${i}`),{asOf}))).toHaveLength(64);
 });
});
