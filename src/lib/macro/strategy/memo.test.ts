// Process memo identity, eviction, and concurrent computation.
import {describe,expect,it,vi} from 'vitest';
import {MEMO_MAX_ENTRIES,StrategyMemo,memoKey,readMemoState} from './memo';
import {memoryStrategyPort} from './port';
import {fixture,snap} from './testing/fixture';

const base=()=>({snapshots:{US:snap('US','2026-11-03T00:00:00Z',[]),CN:null},state:{US:{revision:1,input_revision:2},CN:null},catalog_version:'cat/1'});
const key=(state=base(),params:Record<string,string|number>={region:'US'},codeVersion='code/1')=>memoKey({kind:'transmission',params,state,codeVersion});
describe('strategy memo',()=>{
 it('reads both snapshots and publish states, with missing state as null',async()=>{
  const port=memoryStrategyPort(fixture({snapshots:[base().snapshots.US!],publishState:{US:{revision:1,input_revision:2}}}));
  const got=await readMemoState(port);
  expect(got.snapshots.US?.snapshot_id).toBe(base().snapshots.US?.snapshot_id);
  expect(got.state).toEqual({US:{revision:1,input_revision:2},CN:null});
 });
 it('changes key for params, revisions, snapshot identity and creation, catalog, and code',()=>{
  const first=key();expect(key(base(),{region:'CN'})).not.toBe(first);
  for(const change of [
   (s:ReturnType<typeof base>)=>{s.state.US!.revision++;},
   (s:ReturnType<typeof base>)=>{s.state.US!.input_revision++;},
   (s:ReturnType<typeof base>)=>{s.snapshots.US!.snapshot_id='other';},
   (s:ReturnType<typeof base>)=>{s.snapshots.US!.created_at='2026-11-04T00:00:00Z';},
   (s:ReturnType<typeof base>)=>{s.catalog_version='cat/2';},
  ]){const s=base();change(s);expect(key(s)).not.toBe(first);}
  expect(key(base(),{region:'US'},'code/2')).not.toBe(first);
 });
 it('bounds LRU and refreshes recency on get',()=>{
  const memo=new StrategyMemo<number>();for(let i=0;i<MEMO_MAX_ENTRIES;i++)memo.set(String(i),i);
  expect(memo.get('0')).toBe(0);memo.set('extra',33);
  expect(memo.stats().size).toBe(MEMO_MAX_ENTRIES);expect(memo.get('1')).toBeUndefined();expect(memo.get('0')).toBe(0);
  memo.clear();expect(memo.stats()).toEqual({size:0,hits:0,misses:0});
 });
 it('clear prevents an earlier pending result from filling the new generation',async()=>{
  const memo=new StrategyMemo<unknown>();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const pending=memo.getOrCompute('a',async()=>{await gate;return 7;});
  memo.clear();release();expect(await pending).toEqual({value:7,outcome:'miss'});expect(memo.stats().size).toBe(0);
 });
 it('single flights ten concurrent callers and retries rejection',async()=>{
  const memo=new StrategyMemo<number>();const compute=vi.fn(async()=>{await new Promise(r=>setTimeout(r,1));return 7;});
  const results=await Promise.all(Array.from({length:10},()=>memo.getOrCompute('a',compute)));
  expect(compute).toHaveBeenCalledTimes(1);expect(results.map(r=>r.value)).toEqual(Array(10).fill(7));
  expect(results.map(r=>r.outcome)).toEqual(['miss',...Array(9).fill('coalesced')]);
  expect((await memo.getOrCompute('a',compute)).outcome).toBe('hit');
  await expect(memo.getOrCompute('bad',async()=>{throw new Error('bad');})).rejects.toThrow('bad');
  expect((await memo.getOrCompute('bad',async()=>9)).value).toBe(9);
 });
});
