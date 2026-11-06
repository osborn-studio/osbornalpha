// src/lib/documents/lease.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {guardCalls,withLeaseHeartbeat} from './lease';

const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
describe('withLeaseHeartbeat (R1-P2-7, codex plan round 2)',()=>{
 beforeEach(()=>{vi.useFakeTimers();});
 afterEach(()=>{vi.useRealTimers();});
 it('renews on a timer while a long phase runs, then stops',async()=>{
  const renew=vi.fn(async()=>true);
  const p=withLeaseHeartbeat(renew,async()=>{await sleep(10_000);return 'done';},{intervalMs:1_000});
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await p).toBe('done');
  expect(renew.mock.calls.length).toBeGreaterThanOrEqual(9);
  const n=renew.mock.calls.length;await vi.advanceTimersByTimeAsync(5_000);
  expect(renew).toHaveBeenCalledTimes(n);                                       // the timer stopped with the phase
 });
 it('a refused renewal (takeover) rejects with lease_lost at once and aborts the signal; guarded calls then throw',async()=>{
  let ok=true;const renew=vi.fn(async()=>ok);const write=vi.fn(async()=>'written');
  let signal:AbortSignal|null=null;let after:unknown=null;
  const p=withLeaseHeartbeat(renew,async s=>{
   signal=s;const store=guardCalls({write},s);
   await sleep(60_000);
   try{await store.write();}catch(e){after=e;}
   return 'never';
  },{intervalMs:1_000});
  p.catch(()=>{});
  await vi.advanceTimersByTimeAsync(2_000);
  ok=false;                                                                      // another batch took the lease
  await vi.advanceTimersByTimeAsync(1_000);
  await expect(p).rejects.toMatchObject({name:'DocumentsDbError',code:'lease_lost'});
  expect(signal!.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);                                     // the abandoned phase resumes …
  expect(write).not.toHaveBeenCalled();                                          // … and writes nothing
  expect(after).toMatchObject({code:'lease_lost'});
 });
 it('R3-P2-1: the result is held back until a renewal in flight has settled; nothing renews after that',async()=>{
  let release:()=>void=()=>{};const renew=vi.fn(()=>new Promise<boolean>(r=>{release=()=>r(true);}));
  let done=false;
  const p=withLeaseHeartbeat(renew,async()=>{await sleep(1_500);return 'x';},{intervalMs:1_000,drainMs:10_000}).then(v=>{done=true;return v;});
  await vi.advanceTimersByTimeAsync(1_500);                                    // a beat at 1 s is still in flight when the phase ends at 1.5 s
  expect(renew).toHaveBeenCalledTimes(1);expect(done).toBe(false);
  release();await vi.advanceTimersByTimeAsync(0);
  expect(await p).toBe('x');
  await vi.advanceTimersByTimeAsync(5_000);
  expect(renew).toHaveBeenCalledTimes(1);
 });
 it('R4-P2-2: at the deadline edge a stalled renewal is waited for only up to the budget left after the reserve',async()=>{
  const renew=vi.fn(()=>new Promise<boolean>(()=>{}));                        // never answers
  let now=0;const deadline=200_000;
  const p=withLeaseHeartbeat(renew,async()=>{await sleep(150_000);return 'ok';},{intervalMs:120_000,remainingMs:()=>deadline-now,reserveMs:20_000});
  const tick=async(ms:number)=>{now+=ms;await vi.advanceTimersByTimeAsync(ms);};
  await tick(120_000);expect(renew).toHaveBeenCalledTimes(1);                 // beat at 120 s: 80 s of budget, 60 s after the reserve
  await tick(30_000);                                                          // the phase ends at 150 s with the renewal still unanswered
  let done=false;void p.then(()=>{done=true;});
  await tick(9_000);expect(done).toBe(false);
  await tick(1_000);                                                           // budget left after the reserve: 200 − 150 − 20 = 30 s from the beat → ends ≤ 180 s
  await tick(20_000);
  expect(await p).toBe('ok');
  expect(now).toBeLessThanOrEqual(deadline-20_000);                            // the reserve is untouched
  expect(vi.getTimerCount()).toBe(0);
 });
 it('R4-P2-2: no beat starts inside the reserve, and a successful drain leaves no timer behind',async()=>{
  let now=0;const renew=vi.fn(async()=>{await sleep(10);return true;});
  const p=withLeaseHeartbeat(renew,async()=>{await sleep(1_005);return 1;},{intervalMs:1_000,drainMs:60_000,remainingMs:()=>10_000-now,reserveMs:0});
  await vi.advanceTimersByTimeAsync(1_100);now=1_100;
  expect(await p).toBe(1);
  expect(renew).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);                                          // interval and drain timers both cleared
  const q=withLeaseHeartbeat(renew,async()=>{await sleep(5_000);return 2;},{intervalMs:1_000,remainingMs:()=>15_000,reserveMs:20_000});
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await q).toBe(2);
  expect(renew).toHaveBeenCalledTimes(1);                                      // inside the reserve: no beat at all
  expect(vi.getTimerCount()).toBe(0);
 });
 it('a renewal that throws is transient (retried); the signal is aborted after a normal finish too',async()=>{
  let n=0;const renew=vi.fn(async()=>{n++;if(n===1)throw new Error('network');return true;});
  let signal:AbortSignal|null=null;
  const p=withLeaseHeartbeat(renew,async s=>{signal=s;await sleep(3_500);return 1;},{intervalMs:1_000});
  await vi.advanceTimersByTimeAsync(3_500);
  expect(await p).toBe(1);
  expect(renew).toHaveBeenCalledTimes(3);
  expect(signal!.aborted).toBe(true);
  await expect(withLeaseHeartbeat(renew,async()=>1,{intervalMs:0})).rejects.toMatchObject({code:'invalid_input'});
 });
});
