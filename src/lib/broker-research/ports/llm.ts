// Flag-gated platform LLM boundary (spec §4.3/§6.4). No user-owned key enters broker processing.
import {canonicalJson,sha256Hex} from '../hash';
import {registryModels,registryProviders} from '../../llm/registry/derive';
import {classifyLlmError} from '../../llm/errors';
import {resolvePlatformLlm} from '../../llm/resolve';
export interface LlmRequest{system:string;user:string;maxTokens:number;responseJson:boolean;timeoutMs:number}
export interface LlmResponse{content:string;modelId:string;usage?:{inputTokens:number;outputTokens:number}}
export interface LlmInfo{modelId:string;providerId:string;registryHash:string;contextTokens:number}
export interface LlmPort{info():LlmInfo|null;complete(req:LlmRequest):Promise<LlmResponse>}
export class LlmError extends Error{constructor(readonly code:'llm_unavailable'|'llm_quota'|'llm_failed',message?:string){super(message??code);this.name='LlmError';}}
export const REGISTRY_HASH=sha256Hex(canonicalJson({providers:registryProviders,models:registryModels}));
const DEFAULT_CONTEXT=32768;
export const contextOf=(provider:string,model:string)=>registryModels.providers[provider]?.[model]?.context??DEFAULT_CONTEXT;
export function productionLlmPort(env:Record<string,string|undefined>=process.env):LlmPort{
 const resolve=()=>env.BROKER_RESEARCH_LLM_ENABLED==='1'?resolvePlatformLlm():null;
 return {
  info(){const r=resolve();return r?{modelId:r.model,providerId:r.provider,registryHash:REGISTRY_HASH,contextTokens:contextOf(r.provider,r.model)}:null;},
  async complete(req){const r=resolve();if(!r)throw new LlmError('llm_unavailable');
   try{const {chatResolved}=await import('../../data/sources/llm');
    const out=await chatResolved(r,{system:req.system,messages:[{role:'user',content:req.user}],max_tokens:req.maxTokens,temperature:0,responseJson:req.responseJson,timeoutMs:req.timeoutMs});
    return {content:out.content,modelId:r.model,usage:{inputTokens:out.usage.inputTokens,outputTokens:out.usage.outputTokens}};
   }catch(e){const c=classifyLlmError(e).class;throw new LlmError(c==='quota'||c==='rate_limited'?'llm_quota':'llm_failed',c);}
  },
 };
}
export function recordedLlmPort(script:readonly (string|LlmError)[]|((req:LlmRequest,call:number)=>string|LlmError),info:Partial<LlmInfo>={}):LlmPort&{calls:LlmRequest[]}{
 const calls:LlmRequest[]=[];const full:LlmInfo={modelId:'recorded-model',providerId:'recorded',registryHash:REGISTRY_HASH,contextTokens:64000,...info};
 return {calls,info:()=>full,async complete(req){const n=calls.push(req)-1;const a=typeof script==='function'?script(req,n):script[n];
  if(a===undefined)throw new LlmError('llm_failed','script_exhausted');if(a instanceof LlmError)throw a;
  return {content:a,modelId:full.modelId,usage:{inputTokens:req.user.length,outputTokens:a.length}};
 }};
}
