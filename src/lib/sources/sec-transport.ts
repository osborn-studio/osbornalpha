import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
import {createPacer} from './pacer';
import type {AdmitOptions,Pacer} from './pacer';

export const SEC_MIN_INTERVAL_MS=150;
export const secPacer=createPacer(SEC_MIN_INTERVAL_MS);
export const SEC_HOSTS:readonly string[]=['www.sec.gov','data.sec.gov'];

export function isSecUrl(url:string):boolean{
 try{return SEC_HOSTS.includes(new URL(url).host);}catch{return false;}
}

// For callers whose original pacing had no cancellation or deadline checks.
export function admitSec(pacer:Pacer=secPacer,opts:Omit<AdmitOptions,'budget'|'reserveMs'>={}):Promise<void>{
 return pacer.admit({...opts,budget:{signal:new AbortController().signal,remainingMs:()=>Infinity},reserveMs:0,propagateSleepError:true});
}

interface SecOptions extends Pick<RequestInit,'method'|'body'|'redirect'|'signal'>{
 accept?:string;userAgent?:string;headers?:Record<string,string>;fetch?:typeof fetch;
}
export async function secGet(url:string,opts:SecOptions):Promise<Response>{
 if(!isSecUrl(url))throw new Error('sec_host_rejected');
 const {accept,userAgent,headers,fetch:send=fetch,...init}=opts;
 return send(url,{...init,headers:{'User-Agent':userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,...headers,...(accept===undefined?{}:{Accept:accept})}});
}
