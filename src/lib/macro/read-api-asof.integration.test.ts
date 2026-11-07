// PG17 receipt visibility: S4 harness creates a fresh database and applies migrations before this suite.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {Pool} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {typeParsers} from '../db/pg-table-client';
import {catalogById} from './catalog';
import {supabaseMacroDb} from './db';
import {macroReadApi} from './read-api';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('classifyAsOf batch visibility (PG17)',()=>{
 let pg:Pool, gateway:ChildProcess, origin:string, secret:string;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  pg=new Pool({connectionString:state.adminUrl,types:typeParsers});secret=randomBytes(32).toString('hex');
  const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
  origin=`http://127.0.0.1:${port}`;
  const config=`${state.directory}/macro-asof-postgrest.conf`;
  writeFileSync(config,`db-uri = "${state.adminUrl}"\ndb-schemas = "public"\ndb-anon-role = "anon"\ndb-max-rows = 1000\njwt-secret = "${secret}"\nserver-host = "127.0.0.1"\nserver-port = ${port}\n`,{mode:0o600});
  gateway=spawn(process.env.MACRO_TEST_POSTGREST_BIN??'/opt/homebrew/bin/postgrest',[config],{stdio:'ignore'});
  await new Promise<void>((resolve,reject)=>{gateway.once('spawn',resolve);gateway.once('error',reject);});
  for(let attempt=0;attempt<50;attempt++){
   if(gateway.exitCode!==null)throw new Error('macro_postgrest_exited');
   try{if((await fetch(origin,{signal:AbortSignal.timeout(500)})).ok)return;}catch{/* retry readiness */}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('macro_postgrest_not_ready');
 });
 afterAll(async()=>{gateway?.kill();await pg?.end();});
 const token=()=>{const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');const data=`${encode({alg:'HS256',typ:'JWT'})}.${encode({role:'service_role',exp:Math.floor(Date.now()/1000)+600})}`;return `${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`;};
 it('uses A before B finalizes and B afterward for one series and period',async()=>{
  const series='US_UNRATE',period='2026-09-30',before='2026-10-18T00:00:00.000Z',after='2026-10-25T00:00:00.000Z';
  const version=`macro-catalog/${randomUUID().replaceAll('-','').slice(0,12)}`;
  await pg.query('select public.macro_upsert_catalog($1,$2,$3::jsonb)',[version,'macro-rules/1',JSON.stringify([catalogById(series)])]);
  const seed=async(value:string,finished:string|null,available='2026-10-15T00:00:00Z')=>{
   const batch=randomUUID(),hash=createHash('sha256').update(batch).digest('hex');
   await pg.query(`insert into public.ingest_batches(batch_id,producer,dataset,started_at) values($1,'ts-fred','macro.fred',$2)`,[batch,'2026-10-01T00:00:00Z']);
   const retrieval=(await pg.query(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',1,'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE','fred.stlouisfed.org',200,$3,$4,'{"node":"22"}'::jsonb,null) v`,[hash,`fred_csv/${hash}.csv`,available,batch])).rows[0].v;
   const result=(await pg.query(`select public.macro_write_observations($1,'test-code',$2::jsonb,null) v`,[batch,JSON.stringify([{series_id:series,period_end:period,value_text:value,available_at:available,revisable:true,retrieval_id:retrieval,locator:{kind:'csv_row',line:2,column:1}}])])).rows[0].v;
   expect(result.inserted+result.versioned).toBe(1);
   if(finished)await pg.query(`update public.ingest_batches set status='success',finished_at=$2 where batch_id=$1 and status='running'`,[batch,finished]);
   return batch;
  };
  await seed('4.1','2026-10-16T00:00:00Z');
  await seed('4.2','2026-10-20T00:00:00Z');
  expect((await pg.query('select period_end from public.macro_observations where series_id=$1 limit 1',[series])).rows[0].period_end).toBe(period);
  expect((await pg.query('select value_text from public.macro_latest_eligible_observations($1,$2,$3,null)',[[series],after,'2026-10-31'])).rows.map(r=>r.value_text)).toEqual(['4.2']);
  const client=createClient(origin,token(),{auth:{persistSession:false}});
  const db=supabaseMacroDb({admin:client,anon:client});
  const api=macroReadApi(db,{judgments:true});
  const early=await api.classifyAsOf('US','2026-10',before,'v1.0');
  const late=await api.classifyAsOf('US','2026-10',after,'v1.0');
  expect(early.observation_refs).toEqual([expect.objectContaining({series_id:series,value:4.1,vintage_id:'1'})]);
  expect(late.observation_refs).toEqual([expect.objectContaining({series_id:series,value:4.2,vintage_id:'2'})]);
  const unproved=await seed('4.3',null,'2026-10-22T00:00:00Z');
  expect((await pg.query('select finished_at from public.ingest_batches where batch_id=$1',[unproved])).rows[0].finished_at).toBeNull();
  expect((await api.classifyAsOf('US','2026-10',before,'v1.0')).observation_refs).toEqual(early.observation_refs);
 });
});
