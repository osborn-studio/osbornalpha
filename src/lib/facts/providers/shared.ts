// src/lib/facts/providers/shared.ts
// Provider plumbing shared by the EDGAR and Tushare adapters (spec §6.2/§6.3; §4.7 raw_hash rule):
// typed provider failures (ProviderError IS SyncError from ../errors, so sync.ts reads `code` as the
// batch error code without re-wrapping), snapshot construction with sha256, the raw_hash locator rule
// sha256(snapshot.sha256 + "\n" + locator), and a number-preserving JSON serialiser used by the
// fixture recorder (never JSON.parse → stringify a financial value).
import {createHash} from 'node:crypto';
import {SyncError} from '../errors';
import type {SyncErrorCode} from '../errors';
import type {Budget,Duration,RawSnapshot} from '../types';

export type ProviderErrorCode=SyncErrorCode;
export const ProviderError=SyncError;
export type ProviderError=SyncError;

export const sha256Hex=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
export const rawHashOf=(snapshotSha256:string,locator:string)=>sha256Hex(`${snapshotSha256}\n${locator}`);
export function snapshotOf(bytes:Uint8Array,meta:Partial<RawSnapshot['meta']>&{source:RawSnapshot['meta']['source']}):RawSnapshot{
 return {bytes,sha256:sha256Hex(bytes),meta:{fetched_at:new Date().toISOString(),http_status:200,...meta}};
}
export const padCik=(cik:string|number)=>String(cik).replace(/^0+/,'').padStart(10,'0');
export const ymd=(d:string)=>/^\d{8}$/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:d;
const BUCKETS:[number,Duration][]=[[90,'3M'],[182,'6M'],[273,'9M'],[365,'12M']];
/** Closest duration bucket for an odd period length; only used to type oddDuration candidates (never written as facts). */
export const nearestDuration=(days:number):Duration=>BUCKETS.reduce((best,cur)=>Math.abs(cur[0]-days)<Math.abs(best[0]-days)?cur:best)[1];
export function sleep(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const onAbort=()=>{clearTimeout(t);reject(signal.reason);};
  const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  signal.addEventListener('abort',onAbort,{once:true});
 });
}
/** Thrown by Pacer.admit; the message is the fixed code. Adapters map it to their own ProviderError code. */
export class PacerError extends Error{constructor(public readonly code:'budget_aborted'|'budget_exhausted'){super(code);this.name='PacerError';}}
export interface AdmitOptions{budget:Budget;reserveMs:number;now?:()=>number;sleep?:typeof sleep;minIntervalMs?:number}
export interface Pacer{admit(o:AdmitOptions):Promise<void>;reset():void}
/**
 * One process-wide request pacer per upstream. Admissions are SERIALISED (a promise chain), and each wait is computed from the
 * previous ACTUAL dispatch time recorded when admit() resolves, so a timer delayed by the event loop can never let two requests
 * start closer than the interval. A wait that would end inside the cleanup reserve (remaining - wait <= reserveMs) is rejected
 * up front with budget_exhausted instead of sleeping; an aborted budget gives budget_aborted (a queued caller is released as soon
 * as its own signal aborts, and its entry is skipped when its turn comes). The caller issues its request
 * right after admit() resolves.
 */
export function createPacer(defaultIntervalMs:number):Pacer{
 let chain:Promise<void>=Promise.resolve();let lastStart=-Infinity;
 const run=async(o:AdmitOptions)=>{
  const now=o.now??Date.now,wait=o.sleep??sleep,interval=o.minIntervalMs??defaultIntervalMs;
  const check=()=>{if(o.budget.signal.aborted)throw new PacerError('budget_aborted');if(o.budget.remainingMs()<=o.reserveMs)throw new PacerError('budget_exhausted');};
  check();
  const gap=lastStart+interval-now();
  if(gap>0){
   if(o.budget.remainingMs()-gap<=o.reserveMs)throw new PacerError('budget_exhausted');
   try{await wait(gap,o.budget.signal);}catch{throw new PacerError('budget_aborted');}
   check();                                  // the budget may have run out or been cancelled while waiting
  }
  lastStart=now();
 };
 return {
  admit(o){
   // The internal chain keeps serialising; the caller-facing promise also races its OWN signal, so an aborted caller is released
   // at once instead of waiting behind earlier admissions. When its turn comes the cancelled entry is skipped by run()'s first
   // check (no dispatch, lastStart unchanged).
   const p=chain.then(()=>run(o));chain=p.catch(()=>undefined);
   const signal=o.budget.signal;
   if(signal.aborted)return Promise.reject(new PacerError('budget_aborted'));
   return new Promise<void>((resolve,reject)=>{
    const onAbort=()=>reject(new PacerError('budget_aborted'));
    signal.addEventListener('abort',onAbort,{once:true});
    p.then(resolve,reject).finally(()=>signal.removeEventListener('abort',onAbort));
   });
  },
  reset(){chain=Promise.resolve();lastStart=-Infinity;},
 };
}
/** SEC fair-access spacing and THE process-wide SEC pacer: every SEC caller (companyfacts, submissions, ...) admits through it. */
export const SEC_MIN_INTERVAL_MS=120;
export const secPacer:Pacer=createPacer(SEC_MIN_INTERVAL_MS);
export function budgetFor(ms:number,parent?:AbortSignal):Budget{
 const until=Date.now()+ms;const ctl=new AbortController();
 parent?.addEventListener('abort',()=>ctl.abort(parent.reason),{once:true});
 return {remainingMs:()=>until-Date.now(),signal:ctl.signal};
}
/** JSON text of a scanJsonNumbers() tree with every {__num:'<literal>'} written back as the literal. */
export function stringifyPreservingNumbers(value:unknown,indent?:number):string{
 const text=JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&typeof (v as {__num?:unknown}).__num==='string'?`\u0000${(v as {__num:string}).__num}\u0000`:v,indent);
 return text.replace(/"\\u0000(-?[0-9.eE+]+)\\u0000"/g,'$1');
}
