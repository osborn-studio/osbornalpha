// Read-only macro strategy latency profiler. Use an anon key; no manifest writes occur.
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
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!url||!key)throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:countingFetch}});
const db=supabaseMacroDb({admin:client,anon:client}),basePort=macroDbStrategyPort(db);
let reportedPublishFailure=false;
const port:StrategyReadPort={...basePort,publishState:async region=>{
 try{return await basePort.publishState(region);}
 catch{if(!reportedPublishFailure){reportedPublishFailure=true;console.log(JSON.stringify({route:'memo-validation',publishState:'unavailable'}));}return null;}
}};
async function run(name:string,f:()=>Promise<StrategyManifest|null>){
 reqs=0;bytes=0;maxInflight=0;log.length=0;const t=Date.now(),m=await f(),ms=Date.now()-t;
 console.log(JSON.stringify({route:name,requests:reqs,kb:Math.round(bytes/1024),ms,max_concurrency:maxInflight,inputs:m?.inputs.length??null,hash:m?manifestHash(m).slice(0,16):null}));
 if(process.env.VERBOSE==='1')for(const l of log)console.log('   ',l);
}
async function main(){
 const memoMode=process.argv.includes('--memo');
 if(!memoMode){
  try{const state=await readMemoState(port);console.log(JSON.stringify({route:'memo-validation',publishState:state.state,snapshots:{US:state.snapshots.US?.snapshot_id??null,CN:state.snapshots.CN?.snapshot_id??null}}));}
  catch{console.log(JSON.stringify({route:'memo-validation',publishState:'unavailable'}));}
 }
 const now=new Date(),codeVersion='profile';
 const routes:{name:string;kind:ManifestKind;params:Record<string,string|number>;build:(snapshots?:Awaited<ReturnType<typeof readMemoState>>['snapshots'])=>Promise<StrategyManifest|null>}[]=[
  {name:'transmission?region=US',kind:'transmission',params:{region:'US'},build:snapshots=>buildTransmissionManifest(port,{now,codeVersion,region:'US',snapshots})},
  {name:'transmission?region=CN',kind:'transmission',params:{region:'CN'},build:snapshots=>buildTransmissionManifest(port,{now,codeVersion,region:'CN',snapshots})},
  {name:'policy-response?window=3',kind:'policy_response',params:{window:3},build:snapshots=>buildPolicyResponseManifest(port,{now,codeVersion,window:3,snapshots})},
  {name:'cycle-table?boundary=event_day',kind:'cycle_table',params:{boundary:'event_day'},build:snapshots=>buildCycleTableManifest(port,{now,codeVersion,boundary:'event_day',snapshots})},
 ];
 for(const route of routes){
  if(!memoMode){await run(route.name,()=>route.build());if(process.argv.includes('--repeat'))await run(`${route.name}&repeat=2`,()=>route.build());continue;}
  for(let call=0;call<2;call++){
   reqs=0;bytes=0;maxInflight=0;log.length=0;const start=Date.now();
   const state=await readMemoState(port),key=memoKey({kind:route.kind,params:route.params,state,codeVersion});
   const replayable=state.snapshots.US!==null||state.snapshots.CN!==null;
   const {value,outcome}=replayable?await strategyMemo.getOrCompute(key,()=>route.build(state.snapshots)):{value:await route.build(state.snapshots),outcome:'miss' as const};
   console.log(JSON.stringify({route:route.name,outcome,requests:reqs,kb:Math.round(bytes/1024),ms:Date.now()-start,inputs:value?.inputs.length??null,hash:value?manifestHash(value).slice(0,16):null}));
   if(process.env.VERBOSE==='1')for(const l of log)console.log('   ',l);
  }
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
