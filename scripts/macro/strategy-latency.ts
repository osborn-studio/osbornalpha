// Read-only macro strategy latency profiler. Use an anon key; no manifest writes occur.
import {resolve} from 'node:path';
import {strategyHistoriesReader} from '@/lib/macro/strategy/history-rpc';
import {createClient} from '@supabase/supabase-js';
import {supabaseMacroDb} from '@/lib/macro/db';
import {macroDbStrategyPort} from '@/lib/macro/strategy/wiring';
import {buildTransmissionManifest} from '@/lib/macro/strategy/transmission';
import {buildPolicyResponseManifest} from '@/lib/macro/strategy/policy-response';
import {buildCycleTableManifest} from '@/lib/macro/strategy/cycle-table';
import {manifestHash} from '@/lib/macro/strategy/manifest';
import {memoKey,readMemoState,strategyMemo} from '@/lib/macro/strategy/memo';
import type {StrategyReadPort} from '@/lib/macro/strategy/port';
import type {ManifestKind} from '@/lib/macro/strategy/contract';
import type {StrategyManifest} from '@/lib/macro/strategy/contract';

let reqs=0,bytes=0,inflight=0,maxInflight=0;const log:string[]=[];
const countingFetch:typeof fetch=async(input,init)=>{
 reqs++;inflight++;maxInflight=Math.max(maxInflight,inflight);const t=Date.now();
 try{
  const r=await fetch(input,init),b=await r.clone().arrayBuffer();bytes+=b.byteLength;
  const u=new URL(input instanceof Request?input.url:String(input));
  log.push(`${Date.now()-t}ms ${b.byteLength}B ${u.pathname.replace('/rest/v1/','')}?${decodeURIComponent(u.search).slice(1,90)}`);
  return r;
 }finally{inflight--;}
};
async function run(name:string,f:()=>Promise<StrategyManifest|null>,print=true){
 reqs=0;bytes=0;maxInflight=0;log.length=0;const t=Date.now(),m=await f(),ms=Date.now()-t;
 const sample={requests:reqs,kb:Math.round(bytes/1024),ms,max_concurrency:maxInflight,inputs:m?.inputs.length??null,hash:m?manifestHash(m):null};
 if(print)console.log(JSON.stringify({route:name,...sample}));
 if(process.env.VERBOSE==='1')for(const l of log)console.log('   ',l);
 return sample;
}
export async function main(args=process.argv.slice(2)){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:countingFetch}});
 const db=supabaseMacroDb({admin:client,anon:client}),basePort=macroDbStrategyPort(db);
 let reportedPublishFailure=false;
 const port:StrategyReadPort={...basePort,publishState:async region=>{
  try{return await basePort.publishState(region);}
  catch{if(!reportedPublishFailure){reportedPublishFailure=true;console.log(JSON.stringify({route:'memo-validation',publishState:'unavailable'}));}return null;}
 }};

 const compare=args.includes('--compare'),memoMode=args.includes('--memo');
 if(!memoMode&&!compare){
  try{const state=await readMemoState(port);console.log(JSON.stringify({route:'memo-validation',publishState:state.state,snapshots:{US:state.snapshots.US?.snapshot_id??null,CN:state.snapshots.CN?.snapshot_id??null}}));}
  catch{console.log(JSON.stringify({route:'memo-validation',publishState:'unavailable'}));}
 }
 const now=new Date(),codeVersion='profile';
 const routes:{name:string;kind:ManifestKind;params:Record<string,string|number>;build:(port:StrategyReadPort,snapshots?:Awaited<ReturnType<typeof readMemoState>>['snapshots'])=>Promise<StrategyManifest|null>}[]=[
  {name:'transmission?region=US',kind:'transmission',params:{region:'US'},build:(port,snapshots)=>buildTransmissionManifest(port,{now,codeVersion,region:'US',snapshots})},
  {name:'transmission?region=CN',kind:'transmission',params:{region:'CN'},build:(port,snapshots)=>buildTransmissionManifest(port,{now,codeVersion,region:'CN',snapshots})},
  ...((compare?[1,3,6]:[3]) as (1|3|6)[]).map(window=>({name:`policy-response?window=${window}`,kind:'policy_response' as const,params:{window},build:(port:StrategyReadPort,snapshots?:Awaited<ReturnType<typeof readMemoState>>['snapshots'])=>buildPolicyResponseManifest(port,{now,codeVersion,window,snapshots})})),
  ...((compare?['event_day','first_trading_day','month_end']:['event_day']) as ('event_day'|'first_trading_day'|'month_end')[]).map(boundary=>({name:`cycle-table?boundary=${boundary}`,kind:'cycle_table' as const,params:{boundary},build:(port:StrategyReadPort,snapshots?:Awaited<ReturnType<typeof readMemoState>>['snapshots'])=>buildCycleTableManifest(port,{now,codeVersion,boundary,snapshots})})),
 ];
 if(compare){
  // Pin snapshot identities and request time once for both readers. All clients use the anon key.
  const {snapshots}=await readMemoState(port);
  const rpcPort=macroDbStrategyPort(db,{historiesReader:strategyHistoriesReader(client)});
  for(const route of routes){
   const legacy=await run(route.name,()=>route.build(port,snapshots),false);
   const rpc=await run(route.name,()=>route.build(rpcPort,snapshots),false);
   console.log(JSON.stringify({route:route.name,legacy,rpc,equal:legacy.hash===rpc.hash}));
  }
  return;
 }
 for(const route of routes){
  if(!memoMode){await run(route.name,()=>route.build(port));if(args.includes('--repeat'))await run(`${route.name}&repeat=2`,()=>route.build(port));continue;}
  for(let call=0;call<2;call++){
   reqs=0;bytes=0;maxInflight=0;log.length=0;const start=Date.now();
   const state=await readMemoState(port),key=memoKey({kind:route.kind,params:route.params,state,codeVersion});
   const replayable=state.snapshots.US!==null||state.snapshots.CN!==null;
   const {value,outcome}=replayable?await strategyMemo.getOrCompute(key,()=>route.build(port,state.snapshots)):{value:await route.build(port,state.snapshots),outcome:'miss' as const};
   console.log(JSON.stringify({route:route.name,outcome,requests:reqs,kb:Math.round(bytes/1024),ms:Date.now()-start,inputs:value?.inputs.length??null,hash:value?manifestHash(value):null}));
   if(process.env.VERBOSE==='1')for(const l of log)console.log('   ',l);
  }
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve('scripts/macro/strategy-latency.ts'))main().catch(e=>{console.error(e);process.exitCode=1;});
