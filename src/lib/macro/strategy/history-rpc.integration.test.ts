// Local PostgreSQL only: S4_TEST_STATE is produced by scripts/s4/local-db.ts.
// Real RLS/table reads and RPC SQL; the HTTP envelope alone is simulated.
// Migration replays take DDL locks, so they run in a private database (see fresh-db.ts).
import {freshMigratedDatabase} from '../../documents/fresh-db';
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {MACRO_CATALOG} from '../catalog';
import {buildCycleTableManifest} from './cycle-table';
import {strategyHistoriesReader} from './history-rpc';
import {manifestHash} from './manifest';
import {buildPolicyResponseManifest} from './policy-response';
import {snap} from './testing/fixture';
import {buildTransmissionManifest} from './transmission';
import type {macroDbStrategyPort} from './wiring';

const enabled=!!process.env.S4_TEST_STATE;
// Keep fixture keys away from other suites' committed, recent observations.
const asOf='1901-11-07T00:00:00.000Z';
const fixtureBounds={from:'1901-08-31',to:'1901-10-31'};
describe.skipIf(!enabled)('strategy history RPC on PostgreSQL with public-read projection',()=>{
 let fresh:Awaited<ReturnType<typeof freshMigratedDatabase>>,c:PoolClient;
 let legacy:ReturnType<typeof macroDbStrategyPort>,rpc:ReturnType<typeof macroDbStrategyPort>;
 let read:ReturnType<typeof strategyHistoriesReader>;
 let fixtureSeries:string[],historySeries:string,bondSeries:string,capSeries:string,emptySeries:string;
 let rpcCalls=0;
 beforeAll(async()=>{
  // Other suites may have latched the process-wide missing-RPC fallback. Reload both
  // wiring and db so their MacroDbError identity still matches for truncation handling.
  vi.resetModules();
  const {macroDbStrategyPort}=await import('./wiring');
  const {supabaseMacroDb}=await import('../db');
  const required=(kind:string,predicate:(d:(typeof MACRO_CATALOG)[number])=>boolean)=>{
   const def=MACRO_CATALOG.find(predicate);
   if(!def)throw new Error(`history RPC fixture requires catalog series: ${kind}`);
   return def;
  };
  const labor=required('active US monthly labor rate',d=>d.region==='US'&&d.status==='active'&&d.period==='month'&&d.type==='labor_rate');
  const bond=required('active US month-end bond yield',d=>d.region==='US'&&d.status==='active'&&d.period==='month'&&d.type==='bond_yield'&&d.derive?.kind==='month_end');
  const dailyBond=required('native daily input of bond yield',d=>d.id===bond.derive?.from&&d.status==='active'&&d.period==='day');
  const targets=['DFEDTAR','DFEDTARU','DFEDTARL'].map(key=>required(`active US daily policy source ${key}`,d=>d.region==='US'&&d.status==='active'&&d.period==='day'&&d.role==='event_source'&&d.source?.seriesKey===key));
  fixtureSeries=[labor,bond,dailyBond,...targets].map(d=>d.id);
  historySeries=labor.id;bondSeries=bond.id;
  capSeries=required('separate active US monthly cap series',d=>d.region==='US'&&d.status==='active'&&d.period==='month'&&!d.aliasOf&&!fixtureSeries.includes(d.id)).id;
  emptySeries=required('separate active monthly empty series',d=>d.status==='active'&&d.period==='month'&&!d.aliasOf&&!fixtureSeries.includes(d.id)&&d.id!==capSeries).id;
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  // Never accept a remote database, even if a state file is accidentally supplied.
  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(state.adminUrl).hostname))throw new Error('local database required');
  fresh=await freshMigratedDatabase(state.adminUrl);c=await fresh.pool.connect();
  await c.query("begin; set local statement_timeout='10s'");
  const catalogVersion=`macro-catalog/${randomBytes(6).toString('hex')}`;
  const upsert=await c.query('select public.macro_upsert_catalog($1,$2,$3::jsonb) n',[catalogVersion,'test-rules',JSON.stringify(MACRO_CATALOG)]);
  expect(upsert.rows[0].n).toBe(MACRO_CATALOG.length);
  // Verify all six history IDs plus the cap/empty IDs in the actual FK target,
  // including on a fresh database (not just in macro_catalog_versions JSON).
  const ids=[...fixtureSeries,capSeries,emptySeries];
  const mirror=await c.query('select id from public.macro_series where id=any($1::text[]) and catalog_version=$2 order by id',[ids,catalogVersion]);
  expect(mirror.rows.map(r=>r.id)).toEqual([...ids].sort());
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
  for(const id of fixtureSeries){
   for(const [period,version,status,batch,available] of [
    ['1901-08-31',1,'ok','success','1901-09-01T02:00:00+02:00'],
    ['1901-08-31',2,'ok','partial','1901-09-02T00:00:00Z'],
    ['1901-08-31',3,'ok','success','1901-12-01T00:00:00Z'],
    ['1901-09-30',1,'ok','success','1901-10-01T00:00:00Z'],
    ['1901-10-31',1,'quarantined','success','1901-11-01T00:00:00Z'],
    ['1901-10-31',2,'rejected','success','1901-11-01T00:00:00Z'],
    ['1901-10-31',3,'ok','running','1901-11-01T00:00:00Z'],
    ['1901-10-31',4,'ok','failed','1901-11-01T00:00:00Z'],
    ['1901-10-31',5,'ok','rejected','1901-11-01T00:00:00Z'],
   ] as const){
    const native=version===1;
    await c.query(`insert into public.macro_observations(observation_id,series_id,period_end,value,value_text,version,available_at,ingested_at,status,retrieval_id,locator,derived_from,transform,code_version,batch_id)
     values($1,$2,$3,$4::text::numeric,$4::text,$5,$6,'1901-11-01T00:00:00.123456Z',$7,$8,$9,$10,$11,'test',$12)`,
    [randomUUID(),id,period,String(version),version,available,status,native?retrieval:null,native?{kind:'csv_row'}:null,native?null:[randomUUID()],native?null:'test_transform',batches[batch]]);
   }
  }
  // One period with enough vintages to cross the final 16x cap (maxRows=1).
  await c.query(`insert into public.macro_observations(observation_id,series_id,period_end,value,value_text,version,available_at,status,retrieval_id,locator,code_version,batch_id)
   select gen_random_uuid(),$3,'1901-08-31',1,'1',v,
    case when v=17 then '1901-10-02T00:00:00Z'::timestamptz else '1901-10-01T00:00:00Z'::timestamptz end,
    'ok',$1,'{"kind":"csv_row"}'::jsonb,'test',$2 from generate_series(1,17) v`,[retrieval,batches.success,capSeries]);
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
  legacy=macroDbStrategyPort(db);rpc=macroDbStrategyPort(db,{historiesReader:async(ids,bounds)=>{rpcCalls++;return read(ids,bounds);}});
 },60000);
 // Catalog, batches, evidence, observations and migration replay all stay uncommitted.
 afterAll(async()=>{
  try{if(c)await c.query('rollback');}
  finally{try{c?.release();}finally{await fresh?.drop();}}
 });
 it('matches legacy visible rows, raw counts, empty series and inclusive bounds in multi-series calls',async()=>{
  for(const bounds of [fixtureBounds,{...fixtureBounds,from:'1901-09-01'},{...fixtureBounds,to:'1901-08-31'},{from:'1901-08-31',to:'1901-09-30'}]){
   const ids=[historySeries,bondSeries,emptySeries];
   const result=await read(ids,{asOf,...bounds});
   const actual=await Promise.all(ids.map(id=>rpc.seriesHistory(id,{asOf,...bounds,maxRows:10})));
   const expected=await Promise.all(ids.map(id=>legacy.seriesHistory(id,{asOf,...bounds,maxRows:10})));
   expect(actual).toEqual(expected);
   expect(result.map(r=>r.raw_count)).toEqual(bounds.from==='1901-09-01'?[1,1,0]:bounds.to==='1901-08-31'?[2,2,0]:[3,3,0]);
   expect(result[2]).toEqual({series_id:emptySeries,raw_count:0,rows:[]});
  }
  expect(rpcCalls).toBeGreaterThan(0);
  const early={...fixtureBounds,asOf:'1901-09-01T00:00:00Z',maxRows:10};
  expect(await rpc.seriesHistory(historySeries,early)).toEqual(await legacy.seriesHistory(historySeries,early));
  expect((await rpc.seriesHistory(historySeries,early))[0].version).toBe(1);
 });
 it('preserves every full manifest hash for transmission, policy windows and cycle boundaries',async()=>{
  const options={now:new Date(asOf),codeVersion:'test',snapshots:{US:snap('US',asOf,[]),CN:snap('CN',asOf,[])}};
  for(const region of ['US','CN'] as const)expect(manifestHash((await buildTransmissionManifest(rpc,{...options,region}))!)).toBe(manifestHash((await buildTransmissionManifest(legacy,{...options,region}))!));
  for(const window of [1,3,6] as const)expect(manifestHash(await buildPolicyResponseManifest(rpc,{...options,window}))).toBe(manifestHash(await buildPolicyResponseManifest(legacy,{...options,window})));
  for(const boundary of ['event_day','first_trading_day','month_end'] as const)expect(manifestHash(await buildCycleTableManifest(rpc,{...options,boundary}))).toBe(manifestHash(await buildCycleTableManifest(legacy,{...options,boundary})));
 });
 it('retains period truncation semantics with real vintage counts',async()=>{
  for(const maxRows of [1,2,3])expect(await Promise.allSettled([rpc.seriesHistory(historySeries,{...fixtureBounds,asOf,maxRows})])).toEqual(await Promise.allSettled([legacy.seriesHistory(historySeries,{...fixtureBounds,asOf,maxRows})]));
 });
 it('matches the raw-vintage cap ladder at and beyond its final rung',async()=>{
  const bounded={...fixtureBounds,asOf:'1901-10-01T00:00:00Z',maxRows:1};
  expect(await rpc.seriesHistory(capSeries,bounded)).toEqual(await legacy.seriesHistory(capSeries,bounded));
  expect((await read([capSeries],bounded))[0].raw_count).toBe(16);
  expect((await read([capSeries],{...fixtureBounds,asOf}))[0].raw_count).toBe(17);
  for(const port of [legacy,rpc])await expect(port.seriesHistory(capSeries,{...fixtureBounds,asOf,maxRows:1})).rejects.toThrow('truncated');
 });
 it('matches the legacy anon reader for every fixture series under every caller role',async()=>{
  const ids=[...fixtureSeries,capSeries,emptySeries],bounds={...fixtureBounds,asOf,maxRows:100};
  await c.query('set local role anon');
  const expected=await Promise.all(ids.map(id=>legacy.seriesHistory(id,bounds)));
  for(const role of ['anon','authenticated','service_role']){
   try{
    await c.query(`set local role ${role}`);
    expect(await Promise.all(ids.map(id=>rpc.seriesHistory(id,bounds)))).toEqual(expected);
    const result=await read(ids,bounds);
    expect(result.map(r=>r.series_id)).toEqual(ids);
    // Only success/partial ok rows count; hidden higher vintages must not win.
    expect(result.map(r=>r.raw_count)).toEqual([...fixtureSeries.map(()=>3),17,0]);
    for(const history of result.slice(0,fixtureSeries.length)){
     expect(history.rows.map(r=>[r.period_end,r.version])).toEqual([['1901-08-31',2],['1901-09-30',1]]);
    }
   }finally{await c.query('set local role anon');}
  }
 });
 it('guards against public-read policy and batch eligibility drift',async()=>{
  const policies=(await c.query(`select p.polname,p.polcmd,p.polpermissive,
   array(select r.rolname::text from pg_roles r where r.oid=any(p.polroles) order by r.rolname) roles,
   pg_get_expr(p.polqual,p.polrelid) qual
   from pg_policy p where p.polrelid='public.macro_observations'::regclass
    and p.polcmd in ('r','*') and (0::oid=any(p.polroles) or p.polroles &&
     array(select oid from pg_roles where rolname in ('anon','authenticated')))
   order by p.polname`)).rows;
  expect(policies).toEqual([{
   polname:'macro_observations public read',polcmd:'r',polpermissive:true,roles:['anon','authenticated'],
   qual:"((status = 'ok'::text) AND macro_batch_eligible(batch_id))",
  }]);
  const source=(await c.query("select prosrc from pg_proc where oid='public.macro_batch_eligible(uuid)'::regprocedure")).rows[0].prosrc;
  expect(source.trim().replace(/\s+/g,' ')).toBe("select exists (select 1 from public.ingest_batches b where b.batch_id = p_batch_id and b.status in ('success','partial'))");
 });
 it('is stable, SECURITY DEFINER, has a fixed search_path and preserves execute privileges',async()=>{
  const info=(await c.query("select l.lanname,p.provolatile,p.prosecdef,p.proconfig from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.macro_strategy_histories(text[],timestamptz,date,date)'::regprocedure")).rows[0];
  expect(info).toMatchObject({lanname:'plpgsql',provolatile:'s',prosecdef:true,proconfig:['search_path=pg_catalog, public']});
  expect((await c.query("select exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.macro_strategy_histories(text[],timestamptz,date,date)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') v")).rows[0].v).toBe(false);
  for(const role of ['anon','authenticated','service_role']){
   expect((await c.query("select has_function_privilege($1,'public.macro_strategy_histories(text[],timestamptz,date,date)','EXECUTE') v",[role])).rows[0].v).toBe(true);
  }
 });
 it('replays the definer migration idempotently without changing the definition, grants or results',async()=>{
  const definition=async()=>(await c.query("select pg_get_functiondef(oid) definition,proacl from pg_proc where oid='public.macro_strategy_histories(text[],timestamptz,date,date)'::regprocedure")).rows;
  const before=await definition(),ids=[...fixtureSeries,capSeries,emptySeries];
  const expected=await read(ids,{...fixtureBounds,asOf});
  const migration=readFileSync('supabase/migrations/20261126120000_macro_strategy_histories_definer.sql','utf8');
  for(let replay=0;replay<2;replay++){
   try{
    await c.query('reset role');
    await c.query(migration);
    expect(await definition()).toEqual(before);
   }finally{await c.query('set local role anon');}
   expect(await read(ids,{...fixtureBounds,asOf})).toEqual(expected);
  }
 });
 it('rejects null, empty and more than 64 series with invalid_argument and accepts 64',async()=>{
  for(const series of [null,[],Array.from({length:65},()=> 'EMPTY')]){
   await c.query('savepoint invalid_argument');
   await expect(c.query('select public.macro_strategy_histories($1,$2)',[series,asOf])).rejects.toMatchObject({message:'invalid_argument',code:'22023'});
   await c.query('rollback to savepoint invalid_argument');
  }
  expect((await read(Array.from({length:64},(_,i)=>`EMPTY_${i}`),{...fixtureBounds,asOf}))).toHaveLength(64);
 });
});
