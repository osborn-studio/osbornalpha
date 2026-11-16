import type {Envelope} from './views';

export type OverviewFacts=Omit<Envelope,'collection'>;
export interface OverviewFactsStore{get(key:string,load:()=>Promise<OverviewFacts>):Promise<OverviewFacts>}
type Entry={expires:number;value:Promise<OverviewFacts>};
/** Process-local only: 32 entries, five minute maximum lifetime, including in-flight work.
 * No Next persistent/CDN cache: a new deployment/module instance discards all facts, so code
 * changes invalidate automatically. Callers must key ALL snapshot/catalog/day inputs and must
 * never put sessions, signed URLs, collection health or user-specific data here.
 */
export class OverviewFactsCache implements OverviewFactsStore{
 private readonly entries=new Map<string,Entry>();
 constructor(private readonly capacity=32,private readonly ttlMs=300_000,private readonly now=Date.now){}
 async get(key:string,load:()=>Promise<OverviewFacts>):Promise<OverviewFacts>{
  const now=this.now();
  for(const [k,e] of this.entries)if(e.expires<=now)this.entries.delete(k);
  let entry=this.entries.get(key);
  if(!entry){
   while(this.entries.size>=this.capacity&&this.entries.size)this.entries.delete(this.entries.keys().next().value!);
   entry={expires:now+this.ttlMs,value:Promise.resolve().then(load).then(value=>structuredClone(value))};
   this.entries.set(key,entry);
  }
  try{return structuredClone(await entry.value);}
  catch(error){if(this.entries.get(key)===entry)this.entries.delete(key);throw error;}
 }
}
