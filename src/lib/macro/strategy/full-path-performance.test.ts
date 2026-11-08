// Fixture transport benchmark: real GET, wiring, Supabase adapters and Next cache adapter.
// No credentials or network; auth and PostgreSQL/Next storage backends are simulated.
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {closeSync,constants,openSync,realpathSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,resolve,sep} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
vi.hoisted(()=>{Object.assign(globalThis,{AsyncLocalStorage:require('node:async_hooks').AsyncLocalStorage});});
const deps=vi.hoisted(()=>({port:null as unknown,db:null as unknown}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:{id:'fixture-user'}},error:null})}})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:()=> 'fixture-full-path-v1'}));
vi.mock('./port',async orig=>({...await orig<typeof import('./port')>(),strategyPort:()=>deps.port}));
vi.mock('./db',async orig=>({...await orig<typeof import('./db')>(),supabaseStrategyDb:()=>deps.db}));
import {GET} from '@/app/api/macro/strategy/cycle-table/route';
import {HISTORY_PAGE_CONCURRENCY,supabaseMacroDb} from '../db';
import type {StoredManifest} from './contract';
import {buildCycleTable,buildCycleTableManifest} from './cycle-table';
import {strategyDbOver,supabaseTransport} from './db';
import {canonicalJson,sha256Hex} from './hash';
import {strategyMemo} from './memo';
import {memoryStrategyPort} from './port';
import {fedTargetFixture,fixture,monthly,obs,snap} from './testing/fixture';
import {macroDbStrategyPort} from './wiring';

const CREATED='2026-11-07T00:00:00.000Z';
const series=['US_DGS10','CN_CGB_10Y','US_WTI','US_DTWEXBGS','CN_USDCNY_CP'];
type Row=Record<string,unknown>;
type Call={query:Record<string,string>;metadata?:unknown;table:string;method:string;series:string|null;select:string|null;offset:number;limit:number|null;rows:number;status:number;requestBytes:number;responseBytes:number};
const digest=(v:unknown)=>sha256Hex(canonicalJson(v));

function fixtureTransport(fault?:{offset:number;kind:'timeout'|'short'}){
 const observations=[...fedTargetFixture(),...series.flatMap(id=>[
  ...Array.from({length:4300},(_,i)=>obs(`${id}_D`,new Date(Date.UTC(2007,0,1+i)).toISOString().slice(0,10),`${100+i}.00000000001`)),
  ...monthly(id,'2007-01',Array.from({length:216},(_,i)=>`${100+i}.00000000001`)),
 ])].map(o=>({...o,available_at:new Date(o.available_at).toISOString(),ingested_at:new Date(o.ingested_at).toISOString()}));
 const snapshots=[snap('US',CREATED,[]),snap('CN',CREATED,[])];
 const rows:Record<string,Row[]>={
  macro_observations:observations.map(o=>({...o,locator:{fixture:true},code_version:'fixture',batch_id:'fixture'})),
  macro_snapshots:snapshots,
  macro_publish_state:[{region:'US',revision:1,input_revision:1},{region:'CN',revision:1,input_revision:1}],
  macro_strategy_manifests:[],
 };
 const calls:Call[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),body=await req.text();
  if(url.origin!=='https://fixture.invalid')throw new Error('non-fixture transport forbidden');
  const table=url.pathname.replace('/rest/v1/','');
  let result:unknown,total=0,offset=0,rowCount=0;
  if(table==='rpc/macro_put_manifest_json'){
   expect(req.method).toBe('POST');
   const args=JSON.parse(body);
   expect(digest(args.p_body)).toBe(args.p_manifest_hash);
   let stored=rows.macro_strategy_manifests.find(r=>r.manifest_hash===args.p_manifest_hash);
   if(stored)expect(stored.body).toEqual(args.p_body);
   else{
    stored={manifest_id:`00000000-0000-4000-8000-${String(rows.macro_strategy_manifests.length+1).padStart(12,'0')}`,manifest_hash:args.p_manifest_hash,body:args.p_body,created_at:CREATED};
    rows.macro_strategy_manifests.push(stored);
   }
   result=stored.manifest_id;
  }else{
   expect(req.method).toBe('GET');
   if(!(table in rows))throw new Error(`unexpected fixture table:${table}`);
   let found=[...rows[table]];
   for(const [key,filter] of url.searchParams){
    if(['select','order','offset','limit'].includes(key))continue;
    const dot=filter.indexOf('.'),op=filter.slice(0,dot),value=filter.slice(dot+1);
    if(!['eq','gte','lte'].includes(op))throw new Error(`unsupported fixture filter:${key}:${op}`);
    found=found.filter(r=>op==='eq'?String(r[key])===value:op==='gte'?String(r[key])>=value:String(r[key])<=value);
   }
   const order=url.searchParams.get('order');
   if(order)found.sort((a,b)=>{
    for(const spec of order.split(',')){
     const [key,direction]=spec.split('.'),x=a[key],y=b[key];
     const cmp=x===y?0:String(x)<String(y)?-1:1;if(cmp)return direction==='desc'?-cmp:cmp;
    }
    return 0;
   });
   total=found.length;offset=Number(url.searchParams.get('offset')??0);
   found=found.slice(offset,offset+Number(url.searchParams.get('limit')??1000));
   rowCount=found.length;
   const select=url.searchParams.get('select');
   result=select&&select!=='*'?found.map(r=>Object.fromEntries(select.split(',').map(k=>[k,r[k]]))):found;
   if(table==='macro_observations'&&url.searchParams.get('series_id')==='eq.US_DGS10_D'&&offset===fault?.offset){
    if(fault.kind==='timeout')return new Response(JSON.stringify({code:'57014',message:'canceling statement due to statement timeout'}),{status:500,headers:{'content-type':'application/json'}});
    result=(result as Row[]).slice(0,-1);
   }
  }
  const response=JSON.stringify(result);
  calls.push({query:Object.fromEntries(url.searchParams),...(table==='macro_strategy_manifests'?{metadata:result}:{}),table,method:req.method,series:url.searchParams.get('series_id'),select:url.searchParams.get('select'),offset,limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):null,rows:rowCount,status:200,requestBytes:Buffer.byteLength(body),responseBytes:Buffer.byteLength(response)});
  return new Response(response,{headers:{'content-type':'application/json','content-range':`${offset}-${offset+Math.max(0,rowCount-1)}/${total}`}});
 };
 let active=0,peak=0;const historyHeaders:string[]=[];
 const boundedProbe:typeof fetch=async(input,init)=>{
  const request=new Request(input,init);
  if(new URL(request.url).pathname!=='/rest/v1/macro_observations')return fetcher(request);
  expect(request.headers.get('apikey')).toBe('fixture-anon-key');
  historyHeaders.push(request.headers.get('prefer')??'');active++;peak=Math.max(peak,active);
  try{
   // Hold overlapping requests until the next turn, so the concurrency assertion is deterministic.
   await new Promise<void>(resolve=>setImmediate(resolve));
   return await fetcher(request);
  }finally{active--;}
 };
 const client=(key:string)=>createClient('https://fixture.invalid',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedProbe}});
 const clients={admin:client('fixture-admin-key'),anon:client('fixture-anon-key')};
 const port=macroDbStrategyPort(supabaseMacroDb(clients));
 return {port,db:strategyDbOver(supabaseTransport(clients)),calls,rows,peak:()=>peak,historyHeaders,
  reference:memoryStrategyPort(fixture({observations,snapshots,catalog:[...port.catalog()],catalogVersion:port.catalogVersion(),rules:port.rules()}))};
}

afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();strategyMemo.clear();});
it('measures full fixture cold/warm cycle path and preserves complete frozen provenance',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(CREATED));
 vi.stubEnv('MACRO_STRATEGY_ENABLED','1');vi.stubEnv('MACRO_JUDGMENTS_ENABLED','0');
 const forbidden=vi.fn(async()=>{throw new Error('external network forbidden');});vi.stubGlobal('fetch',forbidden);
 const shared=new Map<string,{value:unknown;isStale:boolean}>();
 let sharedGets=0,sharedSets=0;
 vi.stubGlobal('__incrementalCache',{
  generateSimpleCacheKey:async(key:string)=>createHash('sha256').update(key).digest('hex'),
  get:async(key:string)=>{sharedGets++;return shared.get(key)??null;},
  set:async(key:string,value:unknown)=>{sharedSets++;shared.set(key,{value,isStale:false});},
 });
 const t=fixtureTransport();deps.port=t.port;deps.db=t.db;
 const samples:Record<string,unknown>[]=[];
 for(const boundary of ['event_day','first_trading_day','month_end'] as const){
  const reference=await buildCycleTableManifest(t.reference,{now:new Date(CREATED),codeVersion:'fixture-full-path-v1',boundary});
  let coldBody='';
  async function measure(phase:string){
   t.calls.length=0;t.historyHeaders.length=0;sharedGets=0;sharedSets=0;
   const start=performance.now();
   const response=await GET(new Request(`https://fixture.invalid/api/macro/strategy/cycle-table?boundary=${boundary}`));
   const body=await response.text(),elapsedMs=performance.now()-start;
   expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
   const parsed=JSON.parse(body);
   const stored=t.rows.macro_strategy_manifests.find(r=>r.manifest_id===parsed.manifest_id)! as unknown as StoredManifest;
   expect(stored).toBeDefined();expect(stored.body).toEqual(JSON.parse(canonicalJson(reference)));
   expect(stored.manifest_hash).toBe(digest(reference));
   expect(parsed).toEqual(buildCycleTable(stored));
   expect(parsed.episodes.length).toBeGreaterThan(0);
   expect(Object.values(parsed.cells as Record<string,Record<string,{status:string}>>).some(row=>Object.values(row).some(cell=>cell.status==='ok'))).toBe(true);
   if(phase==='cold')coldBody=body;else expect(body).toBe(coldBody);
   const byTable:Record<string,number>={};for(const call of t.calls)byTable[call.table]=(byTable[call.table]??0)+1;
   // Every read rechecks two active snapshots and both live publication revisions.
   expect(byTable.macro_snapshots).toBe(2);expect(byTable.macro_publish_state).toBe(2);
   expect(t.calls.filter(c=>c.table==='macro_snapshots').map(c=>c.query).sort((a,b)=>a.region.localeCompare(b.region))).toEqual([
    {select:'*',region:'eq.CN',status:'eq.active'},{select:'*',region:'eq.US',status:'eq.active'},
   ]);
   expect(t.calls.filter(c=>c.table==='macro_publish_state').map(c=>c.query).sort((a,b)=>a.region.localeCompare(b.region))).toEqual([
    {select:'revision,input_revision',region:'eq.CN'},{select:'revision,input_revision',region:'eq.US'},
   ]);
   const cold=phase==='cold'||phase==='cache-reset-cold';
   if(cold){
    expect(t.peak()).toBe(HISTORY_PAGE_CONCURRENCY);
    expect(byTable['rpc/macro_put_manifest_json']).toBe(1);expect(byTable.macro_strategy_manifests).toBe(1);
    const histories=t.calls.filter(c=>c.table==='macro_observations');
    expect(t.historyHeaders.filter(h=>h==='count=exact')).toHaveLength(13);
    expect(new Set(histories.map(c=>c.series)).size).toBe(13);
    expect(histories).toHaveLength(33); // five daily x five pages, five monthly + three policy event reads
    for(const id of series){
     const pages=histories.filter(c=>c.series===`eq.${id}_D`).sort((a,b)=>a.offset-b.offset);
     expect(pages.map(c=>[c.offset,c.limit,c.rows])).toEqual([[0,1000,1000],[1000,1000,1000],[2000,1000,1000],[3000,1000,1000],[4000,300,300]]);
    }
    for(const id of [...series,'US_FED_TARGET_D','US_FED_TARGET_UPPER_D','US_FED_TARGET_LOWER_D']){
     const requests=histories.filter(c=>c.series===`eq.${id}`);
     expect(requests.map(c=>[c.offset,c.limit,c.rows])).toEqual([[0,1000,t.rows.macro_observations.filter(r=>r.series_id===id).length]]);
    }
    expect(t.calls).toHaveLength(39);
    expect(histories.reduce((sum,c)=>sum+c.rows,0)).toBe(reference.inputs.length);
    const metadata=t.calls.find(c=>c.table==='macro_strategy_manifests')!;
    expect(metadata.query).toEqual({select:'manifest_id,manifest_hash,created_at',manifest_id:`eq.${stored.manifest_id}`,limit:'1'});
    expect(metadata.metadata).toEqual([{manifest_id:stored.manifest_id,manifest_hash:stored.manifest_hash,created_at:CREATED}]);
    expect(sharedSets).toBe(1);
   }else{expect(t.calls).toHaveLength(4);expect(sharedSets).toBe(0);}
   expect(sharedGets).toBe(phase==='local-warm'?0:1);
   expect(response.headers.get('x-macro-strategy-memo')).toBe(phase==='local-warm'?'hit':'miss');
   samples.push({boundary,phase,elapsed_ms:elapsedMs,memo:response.headers.get('x-macro-strategy-memo'),requests:t.calls.length,by_table:byTable,
    shared_gets:sharedGets,shared_sets:sharedSets,request_body_bytes:t.calls.reduce((n,c)=>n+c.requestBytes,0),response_body_bytes:t.calls.reduce((n,c)=>n+c.responseBytes,0),
    handler_response_bytes:Buffer.byteLength(body),manifest_hash:stored.manifest_hash,manifest_inputs:stored.body.inputs.length,manifest_body_bytes:Buffer.byteLength(canonicalJson(stored.body)),
    view_sha256:sha256Hex(body),peak_history_requests:t.peak(),calls:[...t.calls]});
  }
  strategyMemo.clear();shared.clear();expect(strategyMemo.stats().size).toBe(0);expect(shared.size).toBe(0);await measure('cold');
  for(let i=0;i<5;i++)await measure('local-warm');
  strategyMemo.clear();await measure('shared-warm-local-reset');
  strategyMemo.clear();shared.clear();expect(strategyMemo.stats().size).toBe(0);expect(shared.size).toBe(0);await measure('cache-reset-cold');
 }
 expect(forbidden).not.toHaveBeenCalled();
 const output=process.env.MACRO_FULL_PATH_BENCHMARK_OUTPUT;
 if(output){
  const root=realpathSync('/tmp/osstack'),target=resolve(output),parent=realpathSync(dirname(target));
  if(parent!==root&&!parent.startsWith(root+sep))throw new Error('benchmark output must be under /tmp/osstack/');
  // Resolve parent symlinks and refuse a symlink at the output file itself.
  const fd=openSync(join(parent,basename(target)),constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW);
  try{writeFileSync(fd,JSON.stringify({node:process.version,scope:'Cache-cold, not process-cold. Real cycle GET + Supabase read/write adapters + Next cache adapter; simulated HTTP, fixture session, in-memory PostgreSQL/cache backend. Includes manifest canonicalization/hash/upload, metadata read, evaluation and response consumption. Excludes process startup, real auth, network/TLS, PostgreSQL execution/RLS and production cache persistence. No latency threshold or SLO claim.',samples},null,2)+'\n');}finally{closeSync(fd);}
 }
},60000);

it.each([{offset:0,kind:'timeout'},{offset:1000,kind:'timeout'},{offset:0,kind:'short'},{offset:1000,kind:'short'}] as const)(
 'rejects the real cycle GET for $kind at history offset $offset without persisting a partial manifest',async fault=>{
 vi.stubEnv('MACRO_STRATEGY_ENABLED','1');vi.stubEnv('MACRO_JUDGMENTS_ENABLED','0');
 const t=fixtureTransport(fault),pending:Promise<unknown>[]=[];
 deps.port={...t.port,publishState:async()=>null,seriesHistory:(...args:Parameters<typeof t.port.seriesHistory>)=>{
  const job=t.port.seriesHistory(...args);pending.push(job);return job;
 }};deps.db=t.db;
 const response=await GET(new Request('https://fixture.invalid/api/macro/strategy/cycle-table?boundary=event_day'));
 await Promise.allSettled(pending);
 expect(response.status).toBe(500);expect(await response.json()).toMatchObject({error:{code:'strategy_failed'}});
 expect(pending).toHaveLength(13);expect(t.peak()).toBeLessThanOrEqual(HISTORY_PAGE_CONCURRENCY);
 expect(t.rows.macro_strategy_manifests).toEqual([]);
 expect(t.calls.some(c=>c.table.startsWith('rpc/macro_put_manifest'))).toBe(false);
 expect(t.historyHeaders.filter(h=>h==='count=exact')).toHaveLength(13);
 });
