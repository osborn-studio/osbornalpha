// src/lib/evals/cli/deps.ts
// Reader wiring per run mode (spec §7.1 table). ci: the F6 deterministic world (replay/setup.ts, base setup) over
// pgFactsDb on an isolated database created through the S4_TEST_STATE database's adminUrl when that file is named, else in memory — unprivileged either way,
// no store. report: production through the ANON client (read_facts RPC; RLS keeps it on ok rows), unprivileged, no
// store. report --write-db: production service_role — PrivilegedReader (raw-snapshot provenance over the
// disclosure-raw bucket, hints) and the dq_eval_* store. ReportEnvironment never carries a credential: db_host is a
// bare hostname. LANDED_PARSERS is the one place the landed EDGAR / Tushare parsers are bound for provenance.
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseFactsDb} from '../../facts/db';
import {parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {parseTushareStatements} from '../../facts/providers/tushare-statements';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {getAdminSupabase} from '../../supabase/admin';
import {getAnonSupabase} from '../../supabase/anon';
import {factsReader,privilegedFactsReader} from '../adapters/facts';
import {supabaseRawStorage} from '../adapters/provenance';
import type {SnapshotParsers} from '../adapters/provenance';
import {buildFrozenDb,buildFrozenMemory,loadSetup} from '../replay/setup';
import type {FrozenBuild} from '../replay/setup';
import {evalStore} from '../store';
import type {EvalStore} from '../store';
import type {EvalMode,ModuleReader,ReportEnvironment} from '../types';

export const F6_BASE_SETUP='src/lib/evals/fixtures/replay/f6-base.setup.json';
export const LANDED_PARSERS:SnapshotParsers={edgar:(s,o)=>parseCompanyFacts(s,{sinceYear:o.sinceYear}),tushare:(s,o)=>parseTushareStatements(s,{sinceYear:o.sinceYear})};
export interface RunDeps{reader:ModuleReader;environment:ReportEnvironment;store:EvalStore|null;fetchSource?:(url:string)=>Promise<Uint8Array>;close():Promise<void>}
export interface BuildRunDepsOptions{env?:Record<string,string|undefined>;setupPath?:string;root?:string}

export const hostOf=(url:string|undefined|null):string|null=>{if(!url)return null;try{return new URL(url).hostname||null;}catch{return null;}};
/** --verify-sources: the official document bytes (SEC asks for a User-Agent; nothing is stored). */
export async function fetchSourceBytes(url:string,fetchImpl:typeof fetch=fetch,userAgent:string=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT):Promise<Uint8Array>{
 const res=await fetchImpl(url,{headers:{'User-Agent':userAgent,Accept:'*/*'}});
 if(!res.ok)throw new Error(`source_http_${res.status}`);
 return new Uint8Array(await res.arrayBuffer());
}
const built=(b:FrozenBuild)=>{if(!b.ok)throw new Error(`setup_mismatch:${b.mismatch}`);return b.world;};

export async function buildRunDeps(mode:EvalMode,privileged:boolean,opts:BuildRunDepsOptions={}):Promise<RunDeps>{
 const env=opts.env??process.env;
 const none:ReportEnvironment={db_host:null,app_origin:null,db_state_rev:null};
 if(mode==='ci'){
  if(privileged)throw new Error('ci runs are never privileged (spec §7.1)');
  const setup=loadSetup(opts.setupPath??F6_BASE_SETUP,opts.root);
  const statePath=env.S4_TEST_STATE;
  if(statePath){
   const adminUrl=(JSON.parse(readFileSync(statePath,'utf8')) as {adminUrl:string}).adminUrl;
   const pool=new Pool({connectionString:adminUrl});
   let w:ReturnType<typeof built>;
   try{w=built(await buildFrozenDb(pool,setup,opts.root));}catch(e){await pool.end();throw e;}   // an isolated database (replay/setup.ts, R2-2)
   return {reader:factsReader({db:w.db,tables:w.tables,stateRev:async()=>null}),environment:{...none,db_host:hostOf(adminUrl)},store:null,close:async()=>{await w.close();await pool.end();}};
  }
  const world=built(await buildFrozenMemory(setup,opts.root));
  return {reader:factsReader({db:world.db,tables:world.tables,stateRev:async()=>null}),environment:none,store:null,close:async()=>{}};
 }
 const environment={...none,db_host:hostOf(env.NEXT_PUBLIC_SUPABASE_URL)};
 if(!privileged){
  const anon=getAnonSupabase();
  return {reader:factsReader({db:supabaseFactsDb(anon),tables:supabaseTableClient(anon),stateRev:async()=>null}),environment,store:null,fetchSource:url=>fetchSourceBytes(url),close:async()=>{}};
 }
 const admin=getAdminSupabase();
 const tables=supabaseTableClient(admin);
 return {reader:privilegedFactsReader({db:supabaseFactsDb(admin),tables,stateRev:async()=>null,storage:supabaseRawStorage(admin),parsers:LANDED_PARSERS}),
  environment,store:evalStore(tables),fetchSource:url=>fetchSourceBytes(url),close:async()=>{}};
}
