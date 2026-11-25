import type {Budget} from '../facts/types';

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
export interface AdmitOptions{
 notBeforeMs?:number;budget:Budget;reserveMs:number;now?:()=>number;sleep?:typeof sleep;propagateSleepError?:boolean;minIntervalMs?:number}
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
  const gap=Math.max(lastStart+interval,o.notBeforeMs??-Infinity)-now();
  if(gap>0){
   if(o.budget.remainingMs()-gap<=o.reserveMs)throw new PacerError('budget_exhausted');
   try{await wait(gap,o.budget.signal);}catch(error){
    if(o.propagateSleepError)throw error;
    throw new PacerError('budget_aborted');
   }
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
