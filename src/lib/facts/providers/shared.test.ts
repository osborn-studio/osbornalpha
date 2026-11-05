import {describe,expect,it,vi} from 'vitest';
import type {Budget} from '../types';
import {createPacer,PacerError} from './shared';

const budget=(ms=300_000,signal=new AbortController().signal):Budget=>({remainingMs:()=>ms,signal});

describe('createPacer',()=>{
 it('keeps >= interval between ACTUAL dispatches even when timers fire late past several slots',async()=>{
  const pacer=createPacer(500);
  let t=0;const starts:number[]=[];
  // every timer is delayed by 1300 ms (more than two slots) on top of the requested wait
  const sleep=vi.fn(async(ms:number)=>{await Promise.resolve();t+=ms+1300;});
  const go=async()=>{await pacer.admit({budget:budget(),reserveMs:20_000,now:()=>t,sleep});starts.push(t);};
  await Promise.all([go(),go(),go(),go()]);
  expect(starts).toHaveLength(4);
  for(let i=1;i<starts.length;i++)expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(500);
 });
 it('does not sleep when the previous start is old enough, and records the actual start',async()=>{
  const pacer=createPacer(500);let t=0;const sleep=vi.fn(async(ms:number)=>{t+=ms;});
  await pacer.admit({budget:budget(),reserveMs:0,now:()=>t,sleep});
  t=10_000;
  await pacer.admit({budget:budget(),reserveMs:0,now:()=>t,sleep});
  expect(sleep).not.toHaveBeenCalled();
  t=10_100;
  await pacer.admit({budget:budget(),reserveMs:0,now:()=>t,sleep});
  expect(sleep).toHaveBeenCalledWith(400,expect.anything());
 });
 it('rejects up front when the wait would end inside the reserve, without sleeping',async()=>{
  const pacer=createPacer(500);let t=0;const sleep=vi.fn(async()=>{});
  await pacer.admit({budget:budget(20_400),reserveMs:20_000,now:()=>t,sleep});
  await expect(pacer.admit({budget:budget(20_400),reserveMs:20_000,now:()=>t,sleep})).rejects.toMatchObject({code:'budget_exhausted'});
  expect(sleep).not.toHaveBeenCalled();
  await expect(pacer.admit({budget:budget(20_000),reserveMs:20_000,now:()=>t+10_000,sleep})).rejects.toBeInstanceOf(PacerError);
 });
 it('a rejected admission does not poison the queue or move the last start',async()=>{
  const pacer=createPacer(500);let t=0;const sleep=vi.fn(async(ms:number)=>{t+=ms;});
  await pacer.admit({budget:budget(),reserveMs:0,now:()=>t,sleep});
  await expect(pacer.admit({budget:budget(100),reserveMs:20_000,now:()=>t,sleep})).rejects.toThrow('budget_exhausted');
  await pacer.admit({budget:budget(),reserveMs:0,now:()=>t,sleep});
  expect(t).toBe(500);
 });
 it('aborted budget → budget_aborted, also when aborted during the wait; reset forgets the last start',async()=>{
  const pacer=createPacer(500);let t=0;
  const ctl=new AbortController();ctl.abort();
  await expect(pacer.admit({budget:budget(300_000,ctl.signal),reserveMs:0,now:()=>t})).rejects.toThrow('budget_aborted');
  await pacer.admit({budget:budget(),reserveMs:0,now:()=>t});
  const ctl2=new AbortController();
  const p=pacer.admit({budget:budget(300_000,ctl2.signal),reserveMs:0,now:()=>t,sleep:(_ms,s)=>new Promise((_,rej)=>s.addEventListener('abort',()=>rej(new Error('x'))))});
  setTimeout(()=>ctl2.abort(),5);
  await expect(p).rejects.toThrow('budget_aborted');
  pacer.reset();
  const sleep=vi.fn();
  await pacer.admit({budget:budget(),reserveMs:0,now:()=>t,sleep});
  expect(sleep).not.toHaveBeenCalled();
 });
 it('a queued admission is released at once when its own signal aborts; its entry is skipped and the next one still waits the full interval',async()=>{
  vi.useFakeTimers();
  try{
   const pacer=createPacer(500);const starts:number[]=[];const mk=()=>new AbortController();
   const c1=mk(),c2=mk(),c3=mk();
   const admit=async(c:AbortController,tag:string)=>{await pacer.admit({budget:budget(300_000,c.signal),reserveMs:0});starts.push(Date.now());return tag;};
   await admit(c1,'prime');starts.length=0;           // last start = now
   const p1=admit(c1,'1').catch(()=>'x');             // sleeping 500 ms
   const p2=admit(c2,'2');
   const p3=admit(c3,'3');
   const r3=expect(p3).rejects.toMatchObject({code:'budget_aborted'});
   await vi.advanceTimersByTimeAsync(100);
   c3.abort();
   await r3;                                           // rejected promptly, while the 1st is still sleeping
   expect(starts).toHaveLength(0);
   await vi.advanceTimersByTimeAsync(5000);
   await p1;await p2;
   expect(starts).toHaveLength(2);
   expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(500);
  }finally{vi.useRealTimers();}
 });
});
