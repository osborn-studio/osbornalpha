import type {OverviewJson} from './view-model';
/** One instance per mounted hook. Only in-flight requests are reused; there is no anonymous
 * module-level response memory that could survive navigation or a change of account. */
export class OverviewRequest{
 private pending?:{query:string;controller:AbortController;promise:Promise<OverviewJson>};
 constructor(private readonly fetcher:typeof fetch=(...args)=>fetch(...args)){}
 invalidate(){this.pending?.controller.abort();this.pending=undefined;}
 load(query:string):Promise<OverviewJson>{
  if(this.pending?.query===query)return this.pending.promise;
  this.invalidate();
  const controller=new AbortController();
  const promise=this.fetcher(`/api/macro/overview?${query}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal})
   .then(async r=>{const b=await r.json().catch(()=>null);if(!r.ok)throw new Error(b?.error?.code??`http_${r.status}`);return b as OverviewJson;})
   .finally(()=>{if(this.pending?.promise===promise)this.pending=undefined;});
  this.pending={query,controller,promise};
  return promise;
 }
}
