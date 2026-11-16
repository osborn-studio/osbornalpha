// Server-only digest correlation. The scope contains only an optional upstream request UUID;
// it never travels through CompanyDbError, receipts, or public DTOs.
import {AsyncLocalStorage} from 'node:async_hooks';

const requests=new AsyncLocalStorage<{id?:string}>();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVIDENCE_PATH='/rest/v1/rpc/replace_company_fact_evidence';
export function withEvidenceRequest<T>(run:()=>Promise<T>):Promise<T>{return requests.run({},run);}
export function evidenceRequestId():string|undefined{return requests.getStore()?.id;}

/** Observe only response metadata; the SDK alone consumes the body and converts errors. */
export function companyEvidenceFetch(fetcher:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  const response=await fetcher(input,init);
  try{
   const scope=requests.getStore();
   if(scope&&init?.method==='POST'&&new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url).pathname===EVIDENCE_PATH){
    // Clear on each matching response so a later response cannot inherit an earlier ID.
    scope.id=undefined;
    if(!response.ok){const id=response.headers.get('sb-request-id');if(id?.length===36&&UUID.test(id))scope.id=id;}
   }
  }catch{/* Observability must not change the original response or error semantics. */}
  return response;
 };
}
