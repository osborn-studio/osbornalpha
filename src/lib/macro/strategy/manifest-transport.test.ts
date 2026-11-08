// Installed Supabase client + real adapter; only HTTP is simulated. No production/network access.
import {createClient} from '@supabase/supabase-js';
import {writeFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import type {StrategyManifest} from './contract';
import {buildCycleTable,buildCycleTableManifest} from './cycle-table';
import {strategyDbOver,supabaseTransport} from './db';
import {testManifest} from './db-contract';
import {canonicalJson,sha256Hex} from './hash';
import {memoryStrategyPort} from './port';
import {fedTargetFixture,fixture,monthly,obs,snap} from './testing/fixture';

const ID='11111111-1111-4111-8111-111111111111',CREATED='2026-11-07T00:00:00.000Z';
type Row=Record<string,unknown>;
function transport(opts:{rpcResult?:unknown;rpcError?:string;rows?:(row:Row)=>Row[];duringRpc?:()=>void;fullRead?:boolean;selectError?:boolean}={}){
 let row:Row|undefined;
 const calls:{method:string;select:string|null;requestBytes:number;responseBytes:number}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),body=await request.text();
  let result:unknown,status=200;
  if(url.pathname==='/rest/v1/rpc/macro_put_manifest_json'){
   const args=JSON.parse(body);
   if(opts.rpcError){status=400;result={code:'P0001',message:opts.rpcError};}
   else if(row&&row.manifest_hash===args.p_manifest_hash&&canonicalJson(row.body)!==canonicalJson(args.p_body)){
    status=400;result={code:'P0001',message:'payload_conflict'};
   }else{
    row??={manifest_id:ID,manifest_hash:args.p_manifest_hash,body:args.p_body,created_at:CREATED};
    result='rpcResult' in opts?opts.rpcResult:ID;
   }
   opts.duringRpc?.();
  }else if(url.pathname==='/rest/v1/macro_strategy_manifests'){
   expect(request.method).toBe('GET');expect(url.searchParams.get('manifest_id')).toBe(`eq.${ID}`);
   expect(url.searchParams.get('limit')).toBe('1');
   if(opts.selectError){status=400;result={message:'fixture unavailable'};}
   else{
    const columns=url.searchParams.get('select');
    const projected=columns==='*'?row:Object.fromEntries((columns??'').split(',').map(key=>[key,row?.[key]]));
    result=opts.rows?opts.rows(projected!):[projected];
   }
  }else throw new Error(`unexpected fixture HTTP path: ${url.pathname}`);
  const response=JSON.stringify(result??null);
  calls.push({method:request.method,select:url.searchParams.get('select'),requestBytes:Buffer.byteLength(body),responseBytes:Buffer.byteLength(response)});
  return new Response(response,{status,headers:{'content-type':'application/json'}});
 };
 const client=createClient('https://fixture.invalid','explicit-fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}});
 const real=supabaseTransport({admin:client,anon:client});
 return {db:strategyDbOver({...real,select:(role,spec)=>real.select(role,opts.fullRead?{...spec,columns:undefined}:spec)}),calls,row:()=>row!};
}
it('reads metadata only after RPC, preserves canonical body/hash and replay, while manifest GET still reads full evidence',async()=>{
 const t=transport(),body=testManifest('cycle_table',{salt:'fixed'});
 body.params.optional=undefined as unknown as string;
 const expected=JSON.parse(canonicalJson(body));
 const stored=await t.db.putManifest(body),replayed=await t.db.putManifest(body);
 expect(t.calls.filter(c=>c.method==='GET').map(c=>c.select)).toEqual(Array(2).fill('manifest_id,manifest_hash,created_at'));
 expect(stored).toEqual({...replayed,body:expected});expect(stored.body).not.toBe(body);
 expect(stored.manifest_hash).toBe(sha256Hex(canonicalJson(expected)));
 expect(await t.db.manifest(ID)).toEqual(stored);expect(t.calls.at(-1)?.select).toBe('*');
 stored.body.params.salt='changed';expect(t.row().body).toEqual(expected);expect(body.params.salt).toBe('fixed');
});
it('captures the submitted canonical JSON before awaiting transport, excluding undefined without losing exact decimal evidence',async()=>{
 const body=testManifest('cycle_table',{salt:'fixed'});
 body.inputs=[{series_id:'s',role:'col:s:history',observation_id:'o',period_end:'2026-10-31',value_text:'123456789.00000000001',version:1,
  available_at:'2026-11-01T00:00:00Z',source:{kind:'history',as_of:body.cutoff}}];
 const expected=JSON.parse(canonicalJson(body));
 const t=transport({duringRpc:()=>{body.inputs[0].value_text='mutated';}});
 const stored=await t.db.putManifest(body);
 expect(stored.body).toEqual(expected);expect(stored.manifest_hash).toBe(sha256Hex(canonicalJson(stored.body)));
 expect(stored.body).toEqual(t.row().body);
});
it.each([null,undefined,{},42,'bad-id'])('rejects malformed RPC identity %j before selecting',async rpcResult=>{
 const t=transport({rpcResult});await expect(t.db.putManifest(testManifest('cycle_table'))).rejects.toMatchObject({code:'rpc_failed'});
 expect(t.calls).toHaveLength(1);
});
it.each([
 ['missing',()=>[]],['wrong-id',(r:Row)=>[{...r,manifest_id:'22222222-2222-4222-8222-222222222222'}]],
 ['missing-id',(r:Row)=>[{...r,manifest_id:undefined}]],['wrong-hash',(r:Row)=>[{...r,manifest_hash:'0'.repeat(64)}]],
 ['missing-hash',(r:Row)=>[{...r,manifest_hash:undefined}]],['null-date',(r:Row)=>[{...r,created_at:null}]],
 ['missing-date',(r:Row)=>[{...r,created_at:undefined}]],['bad-date',(r:Row)=>[{...r,created_at:'nonsense'}]],
 ['numeric-date',(r:Row)=>[{...r,created_at:0}]],['date-only',(r:Row)=>[{...r,created_at:'2026-11-07'}]],
 ['duplicate',(r:Row)=>[r,r]],
] as const)('fails closed for %s metadata',async(_name,rows)=>{
 const t=transport({rows});await expect(t.db.putManifest(testManifest('cycle_table'))).rejects.toMatchObject({code:'rpc_failed'});
});
it('normalizes PostgreSQL Date metadata without changing the projection contract',async()=>{
 const body=testManifest('cycle_table',{salt:'fixed'}),hash=sha256Hex(canonicalJson(body));
 const db=strategyDbOver({rpc:async()=>ID,select:async(role,spec)=>{
  expect(role).toBe('admin');expect(spec.columns).toEqual(['manifest_id','manifest_hash','created_at']);
  return [{manifest_id:ID,manifest_hash:hash,created_at:new Date(CREATED)}];
 }});
 expect(await db.putManifest(body)).toEqual({manifest_id:ID,manifest_hash:hash,body,created_at:CREATED});
});
it('preserves RPC conflict/error and metadata read errors',async()=>{
 for(const rpcError of ['payload_conflict','invalid_argument','connection reset']){
  const t=transport({rpcError});await expect(t.db.putManifest(testManifest('cycle_table'))).rejects.toMatchObject({code:rpcError==='connection reset'?'rpc_failed':rpcError});
  expect(t.calls).toHaveLength(1);
 }
 const t=transport({selectError:true});await expect(t.db.putManifest(testManifest('cycle_table'))).rejects.toMatchObject({code:'rpc_failed'});
});

async function largeCycle():Promise<StrategyManifest>{
 const series=['US_DGS10_D','US_WTI_D','US_DTWEXBGS_D','CN_CGB_10Y_D','CN_USDCNY_CP_D'];
 const observations=[...fedTargetFixture(),...series.flatMap(id=>Array.from({length:4300},(_,i)=>
  obs(id,new Date(Date.UTC(2007,0,1+i)).toISOString().slice(0,10),`${100+i}.00000000001`))),
 ...['US_DGS10','US_WTI','US_DTWEXBGS','CN_CGB_10Y','CN_USDCNY_CP'].flatMap(id=>monthly(id,'2007-01',Array.from({length:160},(_,i)=>String(100+i))))];
 return buildCycleTableManifest(memoryStrategyPort(fixture({observations,snapshots:[snap('US',CREATED,[]),snap('CN',CREATED,[])]})),
  {now:new Date(CREATED),codeVersion:'fixture-cycle-transport',boundary:'event_day'});
}
it('bounds returned bytes for a representative large real cycle manifest without dropping evidence',async()=>{
 const body=await largeCycle(),before=transport({fullRead:true}),after=transport();
 const firstStart=performance.now();await before.db.putManifest(body);const beforeMs=performance.now()-firstStart;
 const nextStart=performance.now(),optimized=await after.db.putManifest(body),afterMs=performance.now()-nextStart;
 const oldBytes=before.calls.reduce((n,c)=>n+c.responseBytes,0),newBytes=after.calls.reduce((n,c)=>n+c.responseBytes,0);
 expect(body.inputs.length).toBeGreaterThan(22_000);expect(oldBytes).toBeGreaterThan(6_000_000);
 expect(newBytes).toBeLessThan(300);expect(after.calls[0].requestBytes).toBe(before.calls[0].requestBytes);
 const persisted={manifest_id:ID,manifest_hash:String(before.row().manifest_hash),body:before.row().body as StrategyManifest,created_at:CREATED};
 expect(canonicalJson(optimized)).toBe(canonicalJson(persisted));expect(optimized.body).toEqual(after.row().body);
 expect(optimized.manifest_hash).toBe(sha256Hex(canonicalJson(body)));expect(buildCycleTable(optimized)).toEqual(buildCycleTable(persisted));
 const report={scope:'Installed Supabase client + real StrategyDb adapter with simulated HTTP; JSON UTF-8 bytes, uncompressed, excluding headers. Synthetic real-builder cycle manifest. No production latency measurement.',
  inputs:body.inputs.length,manifestHash:optimized.manifest_hash,bodyBytes:Buffer.byteLength(JSON.stringify(body)),
  before:{responseBytes:oldBytes,requestBytes:before.calls[0].requestBytes,localMs:beforeMs},after:{responseBytes:newBytes,requestBytes:after.calls[0].requestBytes,localMs:afterMs}};
 const output=process.env.CYCLE_TRANSPORT_BENCHMARK_OUTPUT;
 if(output){if(!output.startsWith('/tmp/osstack/'))throw new Error('scratch output must be under /tmp/osstack');writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report));
});
