// Private response correlation only; never attach metadata to errors or public results.
import {AsyncLocalStorage} from 'node:async_hooks';

const requests=new AsyncLocalStorage<{id?:string}>();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH='/rest/v1/rpc/macro_put_manifest_json';
export function withManifestRequest<T>(run:()=>Promise<T>):Promise<T>{return requests.run({},run);}
export function manifestRequestId():string|undefined{return requests.getStore()?.id;}

/** Client-local fetch hook. The SDK alone consumes the original response body. */
export function manifestFetch(fetcher:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  let scope: {id?:string}|undefined;
  try{
   const method=init?.method??(input instanceof Request?input.method:'GET');
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(method==='POST'&&url.pathname===PATH&&!url.search&&!url.hash){scope=requests.getStore();if(scope)scope.id=undefined;}
  }catch{/* Metadata inspection must not affect the request. */}
  // Clear before fetch so network failures cannot inherit a previous response ID.
  const response=await fetcher(input,init);
  try{
   if(scope&&!response.ok){const id=response.headers.get('sb-request-id');if(id?.length===36&&UUID.test(id))scope.id=id;}
  }catch{/* Preserve response identity and SDK error handling. */}
  return response;
 };
}
