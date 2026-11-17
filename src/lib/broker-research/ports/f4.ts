// src/lib/broker-research/ports/f4.ts
// F4 judgment-framework port (spec §11.2; plan FR-7 scope: interface + a production implementation that
// stays disabled until BROKER_RESEARCH_F4_URL is set). The consumer endpoint POST <F4>/claims/events
// dedupes by event_id and applies only the larger claim_seq per claim_key; this side only delivers.
import type {OutboxEvent} from '../types';

export type F4Delivery={ok:true;accepted:boolean;applied:boolean;claimId:string|null}|{ok:false;error:string};
export interface F4Port{readonly enabled:boolean;deliver(event:OutboxEvent):Promise<F4Delivery>}
export const disabledF4Port:F4Port={enabled:false,async deliver(){return {ok:false,error:'f4_disabled'};}};
export const eventBody=(e:OutboxEvent)=>({...e.payload,event_id:e.event_id,kind:e.kind});
const DELIVERY_TIMEOUT_MS=10_000;

export function productionF4Port(env:Record<string,string|undefined>=process.env,fetchImpl:typeof fetch=fetch):F4Port{
 const base=env.BROKER_RESEARCH_F4_URL?.trim();
 if(!base)return disabledF4Port;
 let url:URL;
 try{url=new URL('claims/events',base.endsWith('/')?base:`${base}/`);}catch{return disabledF4Port;}
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&/^(localhost|127\.0\.0\.1)$/.test(url.hostname)))return disabledF4Port;
 const token=env.BROKER_RESEARCH_F4_TOKEN?.trim();
 return {enabled:true,async deliver(e){
  try{
   const res=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(eventBody(e)),signal:AbortSignal.timeout(DELIVERY_TIMEOUT_MS)});
   if(!res.ok)return {ok:false,error:`http_${res.status}`};
   const b=await res.json().catch(()=>null) as {accepted?:unknown;applied?:unknown;claim_id?:unknown}|null;
   if(!b||typeof b.accepted!=='boolean')return {ok:false,error:'f4_bad_response'};
   return {ok:true,accepted:b.accepted,applied:b.applied===true,claimId:typeof b.claim_id==='string'?b.claim_id:null};
  }catch(err){return {ok:false,error:err instanceof Error&&err.name==='TimeoutError'?'f4_timeout':'f4_network'};}
 }};
}
