import {expect,it,vi} from 'vitest';
// Next's server bootstrap normally installs this before loading cache modules.
vi.hoisted(async()=>{vi.stubGlobal('AsyncLocalStorage',(await import('node:async_hooks')).AsyncLocalStorage);});
import {OverviewDataCache,overviewFactsStore} from './overview-data-cache';
import {OverviewFactsCache} from './overview-facts-cache';
import type {OverviewDataCacheFunction,StoredOverviewFacts} from './overview-data-cache';
import type {OverviewFacts} from './overview-facts-cache';
const facts=(id:string):OverviewFacts=>({snapshotId:id,asOf:'2026-11-06',catalogVersion:'v',methodologyVersion:'m',indicators:[],changes:{counts:{new_release:0,revised:0,late:0,missing:0},items:[]},catalogCounts:null});
function sharedBackend(){
 const entries=new Map<string,StoredOverviewFacts>();
 const cache:OverviewDataCacheFunction=(load,parts,options)=>async()=>{
  expect(options.revalidate).toBe(300);const key=JSON.stringify(parts);
  if(!entries.has(key))entries.set(key,await load());
  return structuredClone(entries.get(key)!);
 };
 return {cache,entries};
}
it('shares immutable facts across isolated instances, keyed by deployment and full fact version',async()=>{
 const {cache}=sharedBackend();const load=vi.fn(async()=>facts('a'));
 const first=new OverviewDataCache('commit-a',cache,()=>0);
 await first.get('snapshot-and-input-revision-1',load);
 const second=new OverviewDataCache('commit-a',cache,()=>1);
 expect((await second.get('snapshot-and-input-revision-1',load)).snapshotId).toBe('a');expect(load).toHaveBeenCalledTimes(1);
 await new OverviewDataCache('commit-b',cache,()=>1).get('snapshot-and-input-revision-1',load);
 await second.get('snapshot-and-input-revision-2',load);expect(load).toHaveBeenCalledTimes(3);
});
it('rejects stale-while-revalidate entries at absolute expiry, even on a new instance',async()=>{
 const {cache}=sharedBackend();await new OverviewDataCache('code',cache,()=>0).get('s',async()=>facts('old'));
 const load=vi.fn(async()=>facts('fresh'));
 expect((await new OverviewDataCache('code',cache,()=>299_999).get('s',load)).snapshotId).toBe('old');
 expect((await new OverviewDataCache('code',cache,()=>300_000).get('s',load)).snapshotId).toBe('fresh');
 expect((await new OverviewDataCache('code',cache,()=>900_000).get('s',load)).snapshotId).toBe('fresh');
 expect(load).toHaveBeenCalledTimes(2);
});
it('does not store failed loads and bypasses unavailable cache infrastructure',async()=>{
 const {cache}=sharedBackend();const instance=new OverviewDataCache('code',cache,()=>0);
 await expect(instance.get('s',async()=>{throw new Error('db');})).rejects.toThrow('db');
 expect((await instance.get('s',async()=>facts('retry'))).snapshotId).toBe('retry');
 const unavailable:OverviewDataCacheFunction=()=>async()=>{throw new Error('cache unavailable');};
 expect((await new OverviewDataCache('code',unavailable).get('s',async()=>facts('uncached'))).snapshotId).toBe('uncached');
});
it('enables production sharing only with a deployment identity and supports explicit opt-out',()=>{
 try{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL_GIT_COMMIT_SHA','commit-a');vi.stubEnv('MACRO_OVERVIEW_DATA_CACHE','1');
  expect(overviewFactsStore()).toBeInstanceOf(OverviewDataCache);
  vi.stubEnv('MACRO_OVERVIEW_DATA_CACHE','0');expect(overviewFactsStore()).toBeInstanceOf(OverviewFactsCache);
  vi.stubEnv('MACRO_OVERVIEW_DATA_CACHE','1');vi.stubEnv('VERCEL_GIT_COMMIT_SHA','');
  expect(overviewFactsStore()).toBeInstanceOf(OverviewFactsCache);
 }finally{vi.unstubAllEnvs();}
});
it('uses the installed Next cache adapter across separate instances with independent loaders',async()=>{
 // Exercise real unstable_cache serialization/key generation outside a request, using
 // only an in-memory IncrementalCache backend. No network or Next server is needed.
 const entries=new Map<string,unknown>();
 vi.stubGlobal('__incrementalCache',{
  generateSimpleCacheKey:async(key:string)=>key,
  get:async(key:string)=>entries.has(key)?{value:entries.get(key),isStale:false}:null,
  set:async(key:string,value:unknown)=>{entries.set(key,value);},
 });
 try{
  const first=vi.fn(async()=>facts('original')),second=vi.fn(async()=>facts('other-instance'));
  await new OverviewDataCache('next-adapter-a',undefined,()=>1).get('snapshot',first);
  expect(entries.size).toBe(1);
  const hit=await new OverviewDataCache('next-adapter-a',undefined,()=>2).get('snapshot',second);
  expect(hit.snapshotId).toBe('original');expect(second).not.toHaveBeenCalled();
  await new OverviewDataCache('next-adapter-b',undefined,()=>2).get('snapshot',second);
  expect(second).toHaveBeenCalledTimes(1);
 }finally{vi.unstubAllGlobals();}
});
