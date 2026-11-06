// src/lib/documents/lease.ts
// Lease heartbeat (codex plan round 2, R1-P2-7 not closed by round 1): renewing only BETWEEN phases
// lets a phase longer than the 600 s lease (a large PDF, generation and checks of a big statement,
// one issuer's promotion) be taken over mid-way. withLeaseHeartbeat runs the awaited phase while a
// timer renews every intervalMs; renew() false (another batch took over, or the row moved on)
// aborts the phase's AbortSignal and rejects with DocumentsDbError('lease_lost') at once. A renew()
// that throws is transient: the next beat retries (the SQL lease checks still guard every write).
// The phase receives the signal; guardCalls(target, signal) wraps a port/db/store/table client so
// every call after the abort throws lease_lost — the abandoned phase writes nothing more even
// though JavaScript cannot cancel it. When the phase ends (either way) the timer stops and the
// signal is aborted, so a leftover background step can never write later. Before the phase's result
// is returned the timer is stopped and a renewal still in flight is awaited (bounded by drainMs), so
// no renewal of ours runs after the caller's next step (codex plan round 3 R3-P2-1); renew() must be
// holder-only (renew_document_extract_lease, renew_candidates_lease, renew_hk_fact_lease) so that a
// renewal arriving late can never re-acquire a released lease. Codex plan round 4 (R4-P2-2): with
// remainingMs/reserveMs every wait is also bounded by the execution budget left after a reserve
// for the caller's final writes and release — no beat starts inside the reserve, a renewal request
// is awaited at most min(intervalMs, budget) (an unanswered one is transient), the drain at most
// min(drainMs, budget) — and every wait timer is cleared whichever side wins, so a finished phase
// leaves no timer behind.
import {DocumentsDbError} from './types';

/** Beat interval: well inside the 600 s lease TTL, so two beats may fail before the lease lapses. */
export const HEARTBEAT_MS=120_000;
/** Budget kept for the caller's final writes and release (R4-P2-2). */
export const FINAL_RESERVE_MS=20_000;
/** drainMs: how long the end of the phase waits for a renewal still in flight (default intervalMs);
 *  remainingMs: the caller's execution budget left (default unbounded); reserveMs: kept out of every wait. */
export interface HeartbeatOptions{intervalMs:number;drainMs?:number;remainingMs?:()=>number;reserveMs?:number}
const lost=(why:string)=>new DocumentsDbError('lease_lost',`lease_lost: ${why}`);
/** p, or undefined after ms; the timer is cleared either way (R4-P2-2: no leaked timer). */
async function within<T>(p:Promise<T>,ms:number):Promise<T|undefined>{
 if(ms<=0)return undefined;
 let t:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([p,new Promise<undefined>(r=>{t=setTimeout(()=>r(undefined),ms);})]);}
 finally{if(t!==undefined)clearTimeout(t);}
}

/** fn gets the abort signal and quiesce(): stop the beats and settle one in flight — call it right before the phase releases its own lease (R3-P2-1). */
export async function withLeaseHeartbeat<T>(renew:()=>Promise<boolean>,fn:(signal:AbortSignal,quiesce:()=>Promise<void>)=>Promise<T>,opts:HeartbeatOptions):Promise<T>{
 if(!Number.isInteger(opts.intervalMs)||opts.intervalMs<1)throw new DocumentsDbError('invalid_input','invalid_interval');
 const ac=new AbortController();
 let reject:(e:DocumentsDbError)=>void=()=>{};
 const refused=new Promise<never>((_,r)=>{reject=r;});
 refused.catch(()=>{});
 const left=()=>(opts.remainingMs?opts.remainingMs():Number.POSITIVE_INFINITY)-(opts.reserveMs??0);
 let inflight:Promise<void>|null=null;let stopped=false;
 const timer=setInterval(()=>{
  if(inflight!==null||stopped||ac.signal.aborted||left()<=0)return;   // no beat inside the reserve
  const request=renew();request.catch(()=>{});
  inflight=within(request,Math.min(opts.intervalMs,left())).then(ok=>{
   if(ok===false&&!stopped&&!ac.signal.aborted){const e=lost('heartbeat renewal refused');ac.abort(e);reject(e);}
  },()=>{/* transient: retried on the next beat */}).finally(()=>{inflight=null;});   // unanswered in time: transient too (holder-only renewal)
 },opts.intervalMs);
 // R3-P2-1: stop scheduling, then settle the renewal still in flight (bounded by drainMs) — before a
 // release inside the phase (quiesce) and always before the result is handed back
 let drained:Promise<void>|null=null;
 const quiesce=()=>{                                                    // idempotent: one bounded wait at most
  if(drained===null){
   stopped=true;clearInterval(timer);
   const pending:Promise<void>|null=inflight;
   drained=pending===null?Promise.resolve():within(pending,Math.min(opts.drainMs??opts.intervalMs,left())).then(()=>undefined);
  }
  return drained;
 };
 const work=fn(ac.signal,quiesce);
 work.catch(()=>{});   // after an abort the phase may still settle (usually with lease_lost); nobody awaits it
 try{return await Promise.race([work,refused]);}
 finally{
  await quiesce();
  if(!ac.signal.aborted)ac.abort(lost('phase finished'));
 }
}
/** `target` with every method call refused (lease_lost) once `signal` is aborted. */
export function guardCalls<T extends object>(target:T,signal:AbortSignal):T{
 return new Proxy(target,{get(t,k,r){
  const v=Reflect.get(t,k,r);
  if(typeof v!=='function')return v;
  return (...args:unknown[])=>{if(signal.aborted)throw lost('the lease heartbeat stopped');return (v as (...a:unknown[])=>unknown).apply(t,args);};
 }});
}
