import {unstable_cache} from 'next/cache';
import {OverviewFactsCache} from './overview-facts-cache';
import type {OverviewFacts,OverviewFactsStore} from './overview-facts-cache';

const TTL_MS=300_000;
export interface StoredOverviewFacts{createdAt:number;expiresAt:number;facts:OverviewFacts}
export type OverviewDataCacheFunction=(load:()=>Promise<StoredOverviewFacts>,keyParts:string[],options:{revalidate:number})=>()=>Promise<StoredOverviewFacts>;
/** Next Data Cache holds ONLY immutable facts, never the HTTP response or collection/session data.
 * The explicit deployment key also invalidates entries that Next retains across deployments.
 * No process tier wraps this store: that could extend the lifetime of a shared entry.
 */
export class OverviewDataCache implements OverviewFactsStore{
 constructor(private readonly codeVersion:string,private readonly cache:OverviewDataCacheFunction=unstable_cache,private readonly now=Date.now){}
 async get(key:string,load:()=>Promise<OverviewFacts>):Promise<OverviewFacts>{
  let fresh:Promise<OverviewFacts>|undefined;
  const loadFresh=()=>fresh??=load();
  const read=this.cache(async()=>{
   const createdAt=this.now();
   // load reads frozen observation/provenance IDs only. All request-scoped selection,
   // publication state and collection reads have already completed outside this callback.
   const facts=await loadFresh();
   return {createdAt,expiresAt:createdAt+TTL_MS,facts};
  },['macro-overview-facts/2',this.codeVersion,key],{revalidate:300});
  let entry:StoredOverviewFacts;
  try{entry=await read();}catch{
   // Cache infrastructure may be unavailable outside Next or during an outage. A failed
   // fact load stays rejected in `fresh`, so it is neither retried here nor cached.
   return structuredClone(await loadFresh());
  }
  const now=this.now();
  // Next may return stale data while revalidating, including after a failed refresh.
  // Never serve those facts at/after the hard limit, or after a clock rollback.
  if(!entry||!Number.isFinite(entry.createdAt)||entry.createdAt>now||entry.expiresAt!==entry.createdAt+TTL_MS||now>=entry.expiresAt){
   return structuredClone(await loadFresh());
  }
  return structuredClone(entry.facts);
 }
}
/** Opt out with MACRO_OVERVIEW_DATA_CACHE=0. Without a deployment identity, only a
 * bounded module-local cache is safe: it is discarded with the code that produced it. */
export function overviewFactsStore():OverviewFactsStore{
 const version=process.env.VERCEL_GIT_COMMIT_SHA?.trim();
 return process.env.NODE_ENV==='production'&&version&&process.env.MACRO_OVERVIEW_DATA_CACHE!=='0'
  ?new OverviewDataCache(version):new OverviewFactsCache();
}
