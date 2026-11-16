import {expect,it,vi} from 'vitest';
import {OverviewFactsCache} from './overview-facts-cache';
import type {OverviewFacts} from './overview-facts-cache';
const facts=():OverviewFacts=>({snapshotId:'s',asOf:'2026-11-06',catalogVersion:'v',methodologyVersion:'m',indicators:[],changes:{counts:{new_release:0,revised:0,late:0,missing:0},items:[]},catalogCounts:null});
it('coalesces in-flight facts and isolates mutations made by readers',async()=>{
 const cache=new OverviewFactsCache();const load=vi.fn(async()=>facts());
 const [a,b]=await Promise.all([cache.get('s',load),cache.get('s',load)]);
 expect(load).toHaveBeenCalledTimes(1);a.changes.counts.late=99;
 expect(b.changes.counts.late).toBe(0);expect((await cache.get('s',load)).changes.counts.late).toBe(0);
});
it('does not cache failures and expires and bounds successful facts',async()=>{
 let now=0;const cache=new OverviewFactsCache(2,100,()=>now);
 const load=vi.fn(async()=>facts());
 await expect(cache.get('s',async()=>{throw new Error('db');})).rejects.toThrow('db');
 await cache.get('s',load);expect(load).toHaveBeenCalledTimes(1);
 now=100;await cache.get('s',load);expect(load).toHaveBeenCalledTimes(2);
 await cache.get('b',load);await cache.get('c',load);await cache.get('s',load);
 expect(load).toHaveBeenCalledTimes(5);
});
