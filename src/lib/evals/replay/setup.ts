// src/lib/evals/replay/setup.ts
// F6-owned deterministic world build (spec §5.3.1, §0 R5-2). verifySetup checks EVERYTHING before any write:
// setup_sha256 (sha256 of the canonical JSON of every other field), initial_state, today, mapping_gen = MAPPING_GEN,
// formula_version = FORMULA_VERSION, config_sha256 = sha256(concepts.ts ‖ units.ts ‖ rules.ts), the issuer seed and
// every fixture byte-for-byte against the manifest, sync_order ⊆ manifest. Then: the seed in FK order stocks_universe
// → issuers → issuer_securities (pg: on conflict do nothing; a stored issuer_id must equal the seed's), reconcileScope
// for the seed issuers, one runFactsSync (the only exported sync entry) per sync_order file with fetchUs serving that
// file's verified bytes, a memory snapshot store and a fixed clock (today 12:00Z), then the listed quarantine
// resolutions. A mismatch is {ok:false, mismatch:'<field>[:<detail>]'} (replay maps it to read_error(setup_mismatch));
// world.sync() of a later file throws SetupMismatch. Rebuilding on a database that already holds the world is a
// duplicate-only sync. Backends: buildFrozenDb(pool) = pgFactsDb + pgTableClient (integration tests; CLI ci with a
// test database); buildFrozenMemory() = memoryFactsDb (CLI ci without one; unit tests). runFactsSync always records
// dq_freshness 'facts.us' (sync.ts → dq/freshness.ts recordAttempt, no opt-out); with the fixed clock that row would be
// stale for every other suite sharing the database, so the world's sync deps get withoutFreshness(tables): writes to
// dq_freshness are dropped, reads pass through. The world build therefore leaves dq_freshness untouched.
// sealSetupFromPaths() seals a replay draft that names files by path only (Task 11's facts.frozen.json drafts).
// Declared initial state is enforced by isolation (Codex plan round 1 P2-1, round 2 R2-2): buildFrozenDb creates a fresh
// database per build (createIsolatedDatabase: harness bootstrap + every migration), so a rebuild of the same setup can
// never inherit another build's or a test's mutations; world.close() drops it. A listed quarantine resolution that is
// already resolved must have chosen exactly members carrying a listed value.
// groupSealedSetups() recomputes EVERY case's setup before grouping or caching (P1-6).
import {readFileSync,readdirSync} from 'node:fs';
import {basename,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {memoryTableClient} from '../../db/memory-table-client';
import {pgTableClient} from '../../db/pg-table-client';
import type {TableClient} from '../../db/table-client';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION} from '../../facts/derive';
import {decimalEquals} from '../../facts/json-numbers';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,padCik,snapshotOf} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {runFactsSync} from '../../facts/sync';
import type {SyncDeps,SyncReceipt} from '../../facts/sync';
import type {FactsDb} from '../../facts/types';
import {canonicalJson,sha256Hex} from '../canonical-json';

export interface SeedIssuer{issuer_id:string;ticker:string;cik:string;name:string}
export interface IssuerSeedFile{issuers:SeedIssuer[]}
export interface QuarantineResolution{natural_key:string;chosen_values:string[]}
export interface FrozenSetup{
 initial_state:'empty_after_migrations';
 issuer_seed:{path:string;sha256:string};
 fixture_manifest:{path:string;sha256:string}[];
 /** basenames of fixture_manifest entries, one runFactsSync each, in this order */
 sync_order:string[];
 today:string;mapping_gen:number;formula_version:string;
 quarantine_resolutions:QuarantineResolution[];
 config_sha256:string;setup_sha256:string;
}
export type FrozenSetupDraft=Omit<FrozenSetup,'setup_sha256'>;
export class SetupMismatch extends Error{
 constructor(public readonly field:string,public readonly info?:string){super(`setup_mismatch:${field}${info===undefined?'':`:${info}`}`);this.name='SetupMismatch';}
 /** '<field>' or '<field>:<detail>' — the FrozenBuild.mismatch string */
 get mismatch():string{return this.info===undefined?this.field:`${this.field}:${this.info}`;}
}
export interface FrozenWorld{
 db:FactsDb;tables:TableClient;storage:ReturnType<typeof memorySnapshotStore>;
 /** ticker → issuer_id */
 issuers:Record<string,string>;seed:SeedIssuer[];
 today:string;now:Date;setup:FrozenSetup;
 /** One more runFactsSync of a manifest fixture (verified bytes) for its seed issuer. */
 sync(name:string):Promise<SyncReceipt>;
 /** pg builds: the isolated database's pool (R2-2); memory: null. close() drops the isolated database (memory: no-op). */
 pool:Pool|null;close():Promise<void>;
}
export type FrozenBuild={ok:false;mismatch:string}|{ok:true;issuers:Record<string,string>;world:FrozenWorld};

export const CONFIG_FILES=['src/lib/facts/concepts.ts','src/lib/facts/units.ts','src/lib/facts/rules.ts'] as const;
export const SETUP_CODE_VERSION='f6-frozen-setup';
export const QUARANTINE_RESOLVER='f6000000-0000-4000-8000-00000000f6f6';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const FIXTURE_CIK=/^CIK(\d{10})\./;

export function configSha256(root=process.cwd()):string{return sha256Hex(new Uint8Array(Buffer.concat(CONFIG_FILES.map(f=>readFileSync(join(root,f))))));}
/** sha256 of the canonical JSON of every field except setup_sha256 (a sealed setup may be passed). */
export function setupSha256(s:FrozenSetupDraft):string{const rest={...s} as Record<string,unknown>;delete rest.setup_sha256;return sha256Hex(canonicalJson(rest));}
export function sealSetup(draft:FrozenSetupDraft):FrozenSetup{return {...draft,setup_sha256:setupSha256(draft)};}
/** A draft that names its files by path only (Task 11 replay drafts): every sha256 and config_sha256 is filled from the bytes under root. */
export type FrozenSetupPathsDraft=Omit<FrozenSetup,'issuer_seed'|'fixture_manifest'|'config_sha256'|'setup_sha256'>&{issuer_seed:{path:string};fixture_manifest:{path:string}[]};
export function sealSetupFromPaths(d:FrozenSetupPathsDraft,root=process.cwd()):FrozenSetup{
 const sha=(p:string)=>sha256Hex(new Uint8Array(readFileSync(join(root,p))));
 return sealSetup({...d,issuer_seed:{path:d.issuer_seed.path,sha256:sha(d.issuer_seed.path)},fixture_manifest:d.fixture_manifest.map(f=>({path:f.path,sha256:sha(f.path)})),config_sha256:configSha256(root)});
}
/** dq_freshness writes dropped, everything else passed through (see header). */
export function withoutFreshness(t:TableClient):TableClient{
 const skip=(table:string)=>table==='dq_freshness';
 return {insert:(table,row)=>skip(table)?Promise.resolve(row):t.insert(table,row),update:(table,m,p)=>skip(table)?Promise.resolve(0):t.update(table,m,p),
  select:(table,m,o)=>t.select(table,m,o),upsert:(table,row,c)=>skip(table)?Promise.resolve():t.upsert(table,row,c),count:(table,m,o)=>t.count(table,m,o)};
}
/** P1-6: group sealed case setups by their RECOMPUTED setup_sha256 (never the declared one); a case whose declared hash
 *  differs, or whose setup is not canonically equal to its group's, is returned in `mismatched` and never grouped. */
export function groupSealedSetups<T extends {case_id:string;setup:unknown}>(cases:T[]):{groups:{setup:FrozenSetup;cases:T[]}[];mismatched:{case:T;mismatch:string}[]}{
 const groups=new Map<string,{setup:FrozenSetup;canon:string;cases:T[]}>();const mismatched:{case:T;mismatch:string}[]=[];
 for(const c of cases){
  const s=c.setup as FrozenSetup;
  if(typeof s!=='object'||s===null||typeof s.setup_sha256!=='string'){mismatched.push({case:c,mismatch:'setup'});continue;}
  const got=setupSha256(s);
  if(got!==s.setup_sha256){mismatched.push({case:c,mismatch:'setup_sha256'});continue;}
  const canon=canonicalJson(s);const g=groups.get(got);
  if(!g)groups.set(got,{setup:s,canon,cases:[c]});
  else if(g.canon!==canon)mismatched.push({case:c,mismatch:'setup_not_equal'});
  else g.cases.push(c);
 }
 return {groups:[...groups.values()].map(g=>({setup:g.setup,cases:g.cases})),mismatched};
}
export function loadSetup(path:string,root=process.cwd()):FrozenSetup{return JSON.parse(readFileSync(join(root,path),'utf8')) as FrozenSetup;}

function readBytes(root:string,path:string,field:string):Uint8Array{
 try{return new Uint8Array(readFileSync(join(root,path)));}catch{throw new SetupMismatch(field,`${path} unreadable`);}
}
/** Every check of the setup, before any write; returns the verified seed and fixture bytes by basename. */
export function verifySetup(setup:FrozenSetup,root=process.cwd()):{seed:IssuerSeedFile;files:Map<string,Uint8Array>}{
 if(setupSha256(setup)!==setup.setup_sha256)throw new SetupMismatch('setup_sha256');
 if(setup.initial_state!=='empty_after_migrations')throw new SetupMismatch('initial_state',String(setup.initial_state));
 if(!DAY.test(setup.today)||Number.isNaN(Date.parse(`${setup.today}T00:00:00Z`))||new Date(`${setup.today}T00:00:00Z`).toISOString().slice(0,10)!==setup.today)throw new SetupMismatch('today',setup.today);
 if(setup.mapping_gen!==MAPPING_GEN)throw new SetupMismatch('mapping_gen',`${setup.mapping_gen} != ${MAPPING_GEN}`);
 if(setup.formula_version!==FORMULA_VERSION)throw new SetupMismatch('formula_version',`${setup.formula_version} != ${FORMULA_VERSION}`);
 if(configSha256(root)!==setup.config_sha256)throw new SetupMismatch('config_sha256');
 const seedBytes=readBytes(root,setup.issuer_seed.path,'issuer_seed');
 if(sha256Hex(seedBytes)!==setup.issuer_seed.sha256)throw new SetupMismatch('issuer_seed',setup.issuer_seed.path);
 const seed=JSON.parse(new TextDecoder().decode(seedBytes)) as IssuerSeedFile;
 const files=new Map<string,Uint8Array>();
 for(const f of setup.fixture_manifest){
  const bytes=readBytes(root,f.path,'fixture_manifest');
  if(sha256Hex(bytes)!==f.sha256)throw new SetupMismatch('fixture_manifest',f.path);
  const name=basename(f.path);
  if(files.has(name))throw new SetupMismatch('fixture_manifest',`duplicate ${name}`);
  files.set(name,bytes);
 }
 for(const name of setup.sync_order){
  const cik10=FIXTURE_CIK.exec(name)?.[1];
  if(!files.has(name)||!seed.issuers.some(s=>padCik(s.cik)===cik10))throw new SetupMismatch('sync_order',name);
 }
 return {seed,files};
}

interface Backend{db:FactsDb;tables:TableClient;provision(s:SeedIssuer):Promise<string>}

async function resolveListed(b:Backend,q:QuarantineResolution):Promise<void>{
 const key={table_name:'financial_facts',natural_key:q.natural_key};
 const [open]=await b.tables.select('dq_quarantine',{...key,status:'open'},{limit:1});
 if(!open){
  const [done]=await b.tables.select('dq_quarantine',key,{limit:1});
  if(done){                                          // resolved by an earlier build of the same world: verify its verdict (P2-1)
   const detail=(done.detail??{}) as {chosen_fact_ids?:unknown};
   const ids=Array.isArray(detail.chosen_fact_ids)?detail.chosen_fact_ids.filter((x):x is string=>typeof x==='string'):[];
   const rows=await b.db.factsByIds(ids);
   if(rows.length===0||rows.length!==ids.length||!rows.every(f=>q.chosen_values.some(v=>decimalEquals(v,f.value_text))))
    throw new SetupMismatch('quarantine_resolutions',`${q.natural_key}: the existing resolution chose other values`);
   return;
  }
  throw new SetupMismatch('quarantine_resolutions',q.natural_key);
 }
 const payload=(open.payload??{}) as {fact_ids?:unknown};
 const ids=Array.isArray(payload.fact_ids)?payload.fact_ids.filter((x):x is string=>typeof x==='string'):[];
 const chosen=(await b.db.factsByIds(ids)).filter(f=>q.chosen_values.some(v=>decimalEquals(v,f.value_text))).map(f=>f.fact_id);
 if(chosen.length===0)throw new SetupMismatch('quarantine_resolutions',`${q.natural_key}: no member has a chosen value`);
 await b.db.resolveFactsQuarantine(String(open.id),chosen,QUARANTINE_RESOLVER);
}

async function buildWorld(setup:FrozenSetup,root:string,backendAt:(now:Date)=>Backend):Promise<FrozenBuild>{
 let verified:{seed:IssuerSeedFile;files:Map<string,Uint8Array>};
 try{verified=verifySetup(setup,root);}catch(e){if(e instanceof SetupMismatch)return {ok:false,mismatch:e.mismatch};throw e;}
 const {seed,files}=verified;
 const now=new Date(`${setup.today}T12:00:00.000Z`);
 const backend=backendAt(now);
 try{
  const issuers:Record<string,string>={};
  for(const s of seed.issuers)issuers[s.ticker]=await backend.provision(s);
  await backend.db.reconcileScope('US',seed.issuers.map(s=>({issuer_id:issuers[s.ticker],reasons:['f6-frozen-setup'],priority:10,fetch_key:padCik(s.cik)})));
  const storage=memorySnapshotStore();
  const served=new Map<string,Uint8Array>();
  const deps:SyncDeps={db:backend.db,tables:withoutFreshness(backend.tables),storage,
   fetchUs:async cik10=>{const b=served.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10),fetched_at:now.toISOString()});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','the F6 frozen world is US only');},
   parseUs:(s,o)=>parseCompanyFacts(s,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','the F6 frozen world is US only');},
   now:()=>now,deadline:null,codeVersion:SETUP_CODE_VERSION};
  const sync=async(name:string):Promise<SyncReceipt>=>{
   const bytes=files.get(name);
   if(!bytes)throw new SetupMismatch('fixture_manifest',`${name} is not in the manifest`);
   const cik10=FIXTURE_CIK.exec(name)?.[1];
   const owner=seed.issuers.find(s=>padCik(s.cik)===cik10);
   if(cik10===undefined||!owner)throw new SetupMismatch('sync_order',name);
   served.set(cik10,bytes);
   const r=await runFactsSync(deps,{market:'US',limit:1,issuerIds:[issuers[owner.ticker]],dryRun:false,triggeredBy:'script',mappingGen:setup.mapping_gen});
   if(r.detail.published!==1||r.detail.failed>0)throw new SetupMismatch('sync',`${name}: ${r.issuers[0]?.code??r.status}`);
   return r;
  };
  for(const name of setup.sync_order)await sync(name);
  for(const q of setup.quarantine_resolutions)await resolveListed(backend,q);
  const world:FrozenWorld={db:backend.db,tables:backend.tables,storage,issuers,seed:seed.issuers,today:setup.today,now,setup,sync,pool:null,close:async()=>{}};
  return {ok:true,issuers,world};
 }catch(e){if(e instanceof SetupMismatch)return {ok:false,mismatch:e.mismatch};throw e;}
}

/** Bootstrap of a fresh test database — the same statements scripts/s4/local-db.ts runs before the migrations (roles are
 *  cluster-wide and already exist; that helper is not exported). */
const BOOTSTRAP_SQL=`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;
/** Codex plan round 2 R2-2: one isolated database per frozen build. `create database f6_frozen_<setup8>_<rand>` through the
 *  admin pool, the harness bootstrap, every supabase/migrations/*.sql in order (as scripts/s4/local-db.ts applies them);
 *  drop() ends the pool and drops the database (with force). */
export async function createIsolatedDatabase(admin:Pool,setup:FrozenSetup):Promise<{name:string;pool:Pool;drop():Promise<void>}>{
 const url=(admin as unknown as {options?:{connectionString?:string}}).options?.connectionString;
 if(!url)throw new Error('buildFrozenDb needs an admin pool created from a connection string');
 const name=`f6_frozen_${setup.setup_sha256.slice(0,8)}_${randomBytes(4).toString('hex')}`;
 await admin.query(`create database ${name}`);
 const u=new URL(url);u.pathname=`/${name}`;
 const pool=new Pool({connectionString:u.toString()});
 let dropped=false;
 const drop=async()=>{if(dropped)return;dropped=true;await pool.end().catch(()=>{});await admin.query(`drop database if exists ${name} with (force)`);};
 try{
  await pool.query(BOOTSTRAP_SQL);
  const dir=join(process.cwd(),'supabase/migrations');
  for(const file of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()){
   try{await pool.query(readFileSync(join(dir,file),'utf8'));}catch(e){throw new Error(`isolated frozen database: migration ${file}: ${(e as Error).message}`);}
  }
 }catch(e){await drop();throw e;}
 return {name,pool,drop};
}
/** Every hash is verified before anything is created; then a fresh isolated database (above) holds the build, so a
 *  rebuild of the same setup never sees state another build or test left behind. world.close() drops it. */
export async function buildFrozenDb(admin:Pool,setup:FrozenSetup,root=process.cwd()):Promise<FrozenBuild>{
 try{verifySetup(setup,root);}catch(e){if(e instanceof SetupMismatch)return {ok:false,mismatch:e.mismatch};throw e;}
 const iso=await createIsolatedDatabase(admin,setup);
 const pool=iso.pool;
 let b:FrozenBuild;
 try{
  b=await buildWorld(setup,root,()=>({db:pgFactsDb(pool),tables:pgTableClient(pool),
   async provision(s){
    await pool.query(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[s.ticker,s.name]);
    await pool.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[s.issuer_id,s.name,s.cik]);
    const id=(await pool.query(`select issuer_id from public.issuers where cik=$1`,[s.cik])).rows[0]?.issuer_id as string|undefined;
    if(id!==s.issuer_id)throw new SetupMismatch('issuer_seed',`cik ${s.cik} belongs to ${id??'nobody'}`);
    await pool.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','f6-seed') on conflict do nothing`,[s.issuer_id,s.ticker]);
    return s.issuer_id;
   }}));
 }catch(e){await iso.drop();throw e;}
 if(!b.ok){await iso.drop();return b;}
 b.world.pool=pool;b.world.close=iso.drop;
 return b;
}

export function buildFrozenMemory(setup:FrozenSetup,root=process.cwd()):Promise<FrozenBuild>{
 return buildWorld(setup,root,now=>{
  const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id']});
  const db=memoryFactsDb(tables);db.setNow(now.toISOString());
  return {db,tables,async provision(s){
   await tables.insert('issuers',{issuer_id:s.issuer_id,status:'active',cik:s.cik,canonical_name_en:s.name,canonical_name_zh:null,lei:null,usci:null,merged_into:null,country_code:'US'});
   await tables.insert('issuer_securities',{issuer_id:s.issuer_id,ticker:s.ticker,isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'f6-seed'});
   return s.issuer_id;
  }};
 });
}
