// src/lib/judgments/abort.ts
// Bounded waits for the settle cron (plan audit T-03). A provider / database call that ignores the run's AbortSignal must not
// hold the 280 s budget hostage: raceAbort settles with AbortedError the moment the signal fires (or BoundedWaitTimeout after
// boundMs) and leaves the abandoned promise to finish unobserved — its result is never used, so nothing is written from it.
export class AbortedError extends Error{constructor(public readonly label:string){super(`aborted:${label}`);this.name='AbortedError';}}
export class BoundedWaitTimeout extends Error{constructor(public readonly label:string,public readonly boundMs:number){super(`timeout:${label}:${boundMs}ms`);this.name='BoundedWaitTimeout';}}
export function raceAbort<T>(p:Promise<T>,signal:AbortSignal|undefined,label:string,boundMs?:number):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  if(signal?.aborted){p.catch(()=>undefined);reject(new AbortedError(label));return;}
  let timer:ReturnType<typeof setTimeout>|undefined;
  const done=()=>{signal?.removeEventListener('abort',onAbort);if(timer!==undefined)clearTimeout(timer);};
  const onAbort=()=>{done();reject(new AbortedError(label));};
  signal?.addEventListener('abort',onAbort,{once:true});
  if(boundMs!==undefined)timer=setTimeout(()=>{done();reject(new BoundedWaitTimeout(label,boundMs));},boundMs);
  p.then(v=>{done();resolve(v);},e=>{done();reject(e);});
 });
}
