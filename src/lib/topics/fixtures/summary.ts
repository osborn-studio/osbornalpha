import type {LlmDeps} from '@/lib/macro/strategy/validated-run';
export function fixtureSummaryLlm(locale:'en'|'zh'):LlmDeps{
 return {resolve:async()=>({provider:'fixture',model:'fixture',byo:true}),checkQuota:async()=>null,begin:async()=>{},
  async call(_system,user){
   const fact_ids=[user.slice(0,user.indexOf(': '))],hypothesis=locale==='zh'?'需求可能随之调整。':'Demand may adjust.';
   return {content:JSON.stringify({points:[{fact_ids,hypothesis}],counterpoints:[]}),accounting:null};
  },finalizePayload:status=>({status}),finalize:async()=>{}};
}
