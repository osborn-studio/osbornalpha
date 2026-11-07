// Local real-handler benchmark: explicit fixture auth, no HTTP/server startup/production I/O.
// Run: PATH=/opt/homebrew/opt/node@22/bin:$PATH npx vitest run src/lib/macro/strategy/handler-performance.test.ts --maxWorkers=1
// Optional JSON evidence: MACRO_HANDLER_BENCHMARK_OUTPUT=/tmp/osstack/cache-regression/handlers.json
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.hoisted(()=>{Object.assign(globalThis,{AsyncLocalStorage:require('node:async_hooks').AsyncLocalStorage});});
const deps=vi.hoisted(()=>({user:vi.fn(),port:null as unknown,db:null as unknown}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:deps.user}})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:()=> 'fixture-benchmark-v1'}));
vi.mock('./port',async orig=>({...await orig<typeof import('./port')>(),strategyPort:()=>deps.port}));
vi.mock('./db',async orig=>({...await orig<typeof import('./db')>(),supabaseStrategyDb:()=>deps.db}));
import {GET as transmission} from '@/app/api/macro/strategy/transmission/route';
import {GET as policyResponse} from '@/app/api/macro/strategy/policy-response/route';
import {GET as cycleTable} from '@/app/api/macro/strategy/cycle-table/route';
import {memoryStrategyDb} from './db';
import {strategyMemo} from './memo';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {fedTargetFixture,fixture,FIXTURE_CATALOG,monthly,snap} from './testing/fixture';

const entries=new Map<string,{value:unknown;isStale:boolean}>();
let counts:Record<string,number>;
const bump=(key:string)=>{counts[key]=(counts[key]??0)+1;};
const routes=[
 {name:'transmission-US',path:'transmission?region=US',handler:transmission},
 {name:'transmission-CN',path:'transmission?region=CN',handler:transmission},
 {name:'policy-response',path:'policy-response?window=3',handler:policyResponse},
 {name:'cycle-table',path:'cycle-table?boundary=event_day',handler:cycleTable},
];
const samples:{route:string;scenario:string;ms:number;bytes:number;status:number;memo:string|null;hash:string}[]=[];
const phases:{route:string;scenario:string;requests:number;counts:Record<string,number>}[]=[];
beforeEach(()=>{
 samples.length=0;phases.length=0;counts={};entries.clear();strategyMemo.clear();
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-07T00:00:00Z'));
 vi.stubEnv('MACRO_STRATEGY_ENABLED','1');vi.stubEnv('MACRO_JUDGMENTS_ENABLED','0');
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('fixture benchmark forbids network');}));
 vi.stubGlobal('__incrementalCache',{
  generateSimpleCacheKey:async(key:string)=>createHash('sha256').update(key).digest('hex'),
  get:async(key:string)=>{bump('shared.get');return entries.get(key)??null;},
  set:async(key:string,value:unknown)=>{bump('shared.set');entries.set(key,{value,isStale:false});},
 });
 deps.user.mockImplementation(async()=>{bump('auth');return {data:{user:{id:'fixture-account-a'}},error:null};});
 const observations=[...fedTargetFixture(),...FIXTURE_CATALOG.filter(d=>d.status==='active'&&d.period==='month')
  .flatMap(d=>monthly(d.id,'2023-01',Array.from({length:42},(_,i)=>String(100+i))))];
 const base=memoryStrategyPort(fixture({observations,snapshots:[snap('US','2026-11-03T00:00:00Z',[]),snap('CN','2026-11-03T00:00:00Z',[])],
  publishState:{US:{revision:1,input_revision:1},CN:{revision:1,input_revision:1}}}));
 deps.port=new Proxy(base,{get(target,key: keyof StrategyReadPort){
  const method=target[key];
  if(typeof method!=='function'||!['activeSnapshot','publishState','snapshot','snapshotUpTo','observationsByIds','latestObservations','seriesHistory'].includes(key))return method;
  return (...args:unknown[])=>{bump(key);return Reflect.apply(method,target,args);};
 }});
 const db=memoryStrategyDb();
 deps.db={...db,putManifest:async(...args:Parameters<typeof db.putManifest>)=>{bump('putManifest');return db.putManifest(...args);}};
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();strategyMemo.clear();});

it('measures authenticated real handlers, cache work budgets and cold concurrency without network',async()=>{
 for(const route of routes){
  async function call(scenario:string,status=200){
   const start=performance.now();
   const response=await route.handler(new Request(`http://fixture.invalid/api/macro/strategy/${route.path}`));
   const body=await response.text(),ms=performance.now()-start;
   expect(response.status).toBe(status);
   expect(response.headers.get('cache-control')).toMatch(/no-store/);
   const sample={route:route.name,scenario,ms,bytes:Buffer.byteLength(body),status:response.status,
    memo:response.headers.get('x-macro-strategy-memo'),hash:createHash('sha256').update(body).digest('hex')};
   samples.push(sample);return sample;
  }
  async function phase(scenario:string,n:number,concurrent=false){
   counts={};
   const batch=concurrent?await Promise.all(Array.from({length:n},()=>call(scenario))):[];
   if(!concurrent)for(let i=0;i<n;i++)batch.push(await call(scenario));
   expect(counts.auth).toBe(n);expect(counts.activeSnapshot).toBe(n*2);expect(counts.publishState).toBe(n*2);
   phases.push({route:route.name,scenario,requests:n,counts:{...counts}});return batch;
  }
  strategyMemo.clear();entries.clear();
  const [cold]=await phase('cold',1);expect(counts.putManifest).toBe(1);
  const historyBudget=route.name==='policy-response'?8:route.name==='cycle-table'?13:0;
  expect(counts.seriesHistory??0).toBe(historyBudget);
  const warm=await phase('warm',12);expect(counts.putManifest??0).toBe(0);expect(counts.seriesHistory??0).toBe(0);
  expect(warm.every(s=>s.memo==='hit'&&s.hash===cold.hash)).toBe(true);
  strategyMemo.clear();
  const [shared]=await phase('shared-warm-local-reset',1);
  expect(shared.hash).toBe(cold.hash);expect(counts.putManifest??0).toBe(0);expect(counts.seriesHistory??0).toBe(0);
  strategyMemo.clear();entries.clear();
  const batch=await phase('cold-concurrent',8,true);expect(counts.putManifest).toBe(1);
  expect(counts.seriesHistory??0).toBe(historyBudget);
  expect(batch.filter(s=>s.memo==='miss')).toHaveLength(1);expect(batch.filter(s=>s.memo==='coalesced')).toHaveLength(7);
  expect(batch.every(s=>s.hash===cold.hash)).toBe(true);
  deps.user.mockImplementation(async()=>{bump('auth');return {data:{user:{id:'fixture-account-b'}},error:null};});
  const [other]=await phase('other-account-warm',1);expect(other.hash).toBe(cold.hash);expect(counts.putManifest??0).toBe(0);
  const port=deps.port as StrategyReadPort;
  const originalState=port.publishState;
  deps.port={...port,publishState:async(region:Parameters<StrategyReadPort['publishState']>[0])=>{const state=await originalState(region);return state?{...state,input_revision:state.input_revision+1}:null;}};
  await phase('revision-change',1);expect(counts.putManifest).toBe(1);
  deps.port=port;
  deps.user.mockImplementation(async()=>{bump('auth');return {data:{user:null},error:null};});counts={};
  await call('signed-out-after-warm',401);expect(counts).toEqual({auth:1});
  deps.user.mockImplementation(async()=>{bump('auth');return {data:{user:{id:'fixture-account-a'}},error:null};});
 }
 expect(fetch).not.toHaveBeenCalled();
 const summaries=phases.map(phase=>{
  const times=samples.filter(s=>s.route===phase.route&&s.scenario===phase.scenario).map(s=>s.ms).sort((a,b)=>a-b);
  return {...phase,p50_ms:(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2,p95_ms:times[Math.ceil(times.length*.95)-1]};
 });
 const report={scope:'Local exported GET handlers + real builders + installed Next cache adapter; fixture auth/data/storage; in-memory incremental backend. Excludes production, HTTP/TLS, process startup, real auth/database latency and judgments.',
  node:process.version,concurrency:8,warmSamples:12,summaries,samples};
 const output=process.env.MACRO_HANDLER_BENCHMARK_OUTPUT;
 if(output){if(!output.startsWith('/tmp/osstack/'))throw new Error('benchmark output must be under /tmp/osstack/');writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report));
});
