// Real installed Next adapter over a shared incremental-cache test backend. Distinct
// StrategyMemo instances model cold workers; no network/session dependency enters the callback.
import {createHash} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.hoisted(()=>{Object.assign(globalThis,{AsyncLocalStorage:require('node:async_hooks').AsyncLocalStorage});});
import {workAsyncStorage} from 'next/dist/server/app-render/work-async-storage.external';
import {canCacheFacts,factView,FACT_VIEW_SCHEMA,FACT_VIEW_TTL_SECONDS,memoKey,StrategyMemo,type MemoState} from './memo';
import {snap} from './testing/fixture';

const state=():MemoState=>({snapshots:{US:snap('US','2026-11-03T00:00:00Z',[]),CN:null},state:{US:{revision:1,input_revision:2},CN:{revision:0,input_revision:0}},catalog_version:'cat/1'});
const key=(s=state(),codeVersion='code/1',params={region:'US'})=>memoKey({kind:'transmission',params,state:s,codeVersion});
const entries=new Map<string,{value:unknown;isStale:boolean}>();
let identities:string[],revalidates:number[];
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-07T00:00:00Z'));
 entries.clear();identities=[];revalidates=[];
 Object.assign(globalThis,{__incrementalCache:{
  generateSimpleCacheKey:async(k:string)=>{identities.push(k);return createHash('sha256').update(k).digest('hex');},
  get:async(k:string)=>entries.get(k)??null,
  set:async(k:string,value:unknown,opts:{fetchCache:boolean})=>{expect(opts.fetchCache).toBe(true);revalidates.push((value as {revalidate:number}).revalidate);entries.set(k,{value,isStale:false});},
 }});
});
afterEach(()=>{vi.useRealTimers();Reflect.deleteProperty(globalThis,'__incrementalCache');});

describe('shared strategy fact views (installed Next)',()=>{
 it('reuses a persisted small view across independent process memos and singleflights locally',async()=>{
  const compute=vi.fn(async()=>({manifest_id:'persisted',view:{rows:[1,2]}}));
  const a=new StrategyMemo<unknown>(),b=new StrategyMemo<unknown>();
  const first=await Promise.all(Array.from({length:10},()=>factView(key(),state(),compute,a)));
  expect(first.map(r=>r.outcome)).toEqual(['miss',...Array(9).fill('coalesced')]);
  expect((await factView(key(),state(),compute,b)).value).toEqual(first[0].value);
  expect(compute).toHaveBeenCalledTimes(1);expect(revalidates).toEqual([300]);
  expect(identities[0]).toContain(FACT_VIEW_SCHEMA);expect(identities[0]).toContain('input_revision');
  expect(JSON.stringify([...entries.values()])).not.toMatch(/session|judgment|quota|explanation/);
 });
 it('invalidates for the full existing identity: params, snapshot, both revisions, catalog and deploy',async()=>{
  const compute=vi.fn(async()=>({manifest_id:'persisted'}));const s=state();
  await factView(key(s),s,compute,new StrategyMemo());
  for(const change of [
   (v:MemoState)=>{v.state.US!.revision++;},(v:MemoState)=>{v.state.CN!.input_revision++;},
   (v:MemoState)=>{v.snapshots.US!.snapshot_id='new';},(v:MemoState)=>{v.snapshots.US!.revision++;},
   (v:MemoState)=>{v.snapshots.US!.created_at='2026-11-04T00:00:00Z';},(v:MemoState)=>{v.catalog_version='cat/2';},
  ]){const next=state();change(next);await factView(key(next),next,compute,new StrategyMemo());}
  await factView(key(s,'code/2'),s,compute,new StrategyMemo());
  await factView(key(s,'code/1',{region:'CN'}),s,compute,new StrategyMemo());
  expect(compute).toHaveBeenCalledTimes(9);
 });
 it('rejects unverifiable state, including absent snapshots, without either cache',async()=>{
  const compute=vi.fn(async()=>({manifest_id:'persisted'}));
  for(const modify of [
   (s:MemoState)=>{s.snapshots={US:null,CN:null};},(s:MemoState)=>{s.state.CN=null;},
   (s:MemoState)=>{s.state.US!.input_revision=NaN;},(s:MemoState)=>{s.state.US!.revision=1.5;},
  ]){const s=state();modify(s);expect(canCacheFacts(s)).toBe(false);const memo=new StrategyMemo();
   await factView('unused',s,compute,memo);await factView('unused',s,compute,memo);expect(memo.stats().size).toBe(0);
  }
  expect(entries.size).toBe(0);expect(identities).toEqual([]);
 });
 it('never stores rejected builds or a view without a persisted manifest id; retry succeeds',async()=>{
  const memo=new StrategyMemo();const compute=vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({manifest_id:'persisted'});
  await expect(factView(key(),state(),compute,memo)).rejects.toThrow('down');expect(entries.size).toBe(0);
  expect((await factView(key(),state(),compute,memo)).value.manifest_id).toBe('persisted');expect(compute).toHaveBeenCalledTimes(2);
  await expect(factView('invalid',state(),async()=>({manifest_id:''}),memo)).rejects.toThrow('fact_view_manifest_missing');
  expect(entries.size).toBe(1);
 });
 it('propagates an expired-entry refresh failure and retries without retaining it locally',async()=>{
  const memo=new StrategyMemo();const compute=vi.fn(async()=>({manifest_id:'persisted',generation:1}));
  await factView(key(),state(),compute,memo);
  vi.setSystemTime(Date.now()+FACT_VIEW_TTL_SECONDS*1000);
  for(const entry of entries.values())entry.isStale=true;
  compute.mockRejectedValue(new Error('refresh down'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const work={nextFetchId:1,pendingRevalidates:{}};
  await expect(workAsyncStorage.run(work as never,()=>factView(key(),state(),compute,memo))).rejects.toThrow('refresh down');
  await Promise.all(Object.values(work.pendingRevalidates));
  expect(memo.stats().size).toBe(0);
  compute.mockResolvedValue({manifest_id:'persisted',generation:2});
  expect((await factView(key(),state(),compute,memo)).value.generation).toBe(2);
  log.mockRestore();
 });
 it('enforces five-minute absolute expiry across both cache layers despite Next stale-while-revalidate',async()=>{
  const memo=new StrategyMemo();let generation=0;
  const compute=vi.fn(async()=>({manifest_id:'persisted',generation:++generation}));
  expect((await factView(key(),state(),compute,memo)).value.generation).toBe(1);
  vi.setSystemTime(Date.now()+FACT_VIEW_TTL_SECONDS*1000);
  for(const entry of entries.values())entry.isStale=true;
  // App Router context deliberately returns stale immediately and refreshes in background.
  const work={nextFetchId:1,pendingRevalidates:{}};
  const result=await workAsyncStorage.run(work as never,()=>factView(key(),state(),compute,memo));
  expect(result.value.generation).toBeGreaterThan(1);
  await Promise.all(Object.values(work.pendingRevalidates));
 });
});
