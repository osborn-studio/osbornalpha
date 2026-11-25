// server-only: never import from a client component
// Each instance serializes attempts through body consumption. Backoff leaves the slot available.
import {createPacer,PacerError,sha256Hex,sleep,type Pacer} from '../../facts/providers/shared';
import type {Budget} from '../../facts/types';
import {canonicalRequest,VendorError,type VendorRequest,type VendorSource} from '../source';
import {redactSecret} from './redact';
import {swL1Financials,swL1Members} from './templates';

export const GILDATA_VENDOR='gildata',GILDATA_PRODUCT='datamap-mcp';
export const GILDATA_ENDPOINT='https://api.gildata.com/mcp-servers/aidata-assistant-srv-tool';
interface Options{apiKey:string;fetch?:typeof fetch;timeoutMs?:number;maxRetries?:number;minIntervalMs?:number;maxCalls?:number;now?:()=>Date;sleep?:typeof sleep;pacer?:Pacer}

// Retryability belongs to the transport outcome, independently of the redacted message.
class RetryableError extends VendorError{}

function reviewedRequest(r:VendorRequest):VendorRequest{
 const {industry,from_year,to_year}=r.args;
 if(typeof industry==='string'){
  let expected:VendorRequest|undefined;
  if(r.templateId==='sw_l1_members')expected=swL1Members({nameZh:industry});
  if(r.templateId==='sw_l1_financials'&&typeof from_year==='number'&&typeof to_year==='number')
   expected=swL1Financials({nameZh:industry,fromYear:from_year,toYear:to_year});
  if(expected&&expected.tool===r.tool&&expected.query===r.query&&expected.templateVersion===r.templateVersion
   &&Object.keys(expected.args).length===Object.keys(r.args).length)return expected;
 }
 throw new VendorError('vendor_unavailable','invalid_template_args');
}

export function createGildataSource(opts:Options):VendorSource{
 const key=opts.apiKey,transport=opts.fetch??fetch,wait=opts.sleep??sleep,now=opts.now??(()=>new Date());
 const interval=opts.minIntervalMs??1000,pacer=opts.pacer??createPacer(interval);
 const maxCalls=opts.maxCalls??80,maxRetries=opts.maxRetries??2;
 let calls=0,tail=Promise.resolve();
 function check(budget:Budget){
  if(budget.signal.aborted)throw new VendorError('budget_aborted');
  if(budget.remainingMs()<=0)throw new VendorError('budget_exhausted');
  if(calls>=maxCalls)throw new VendorError('vendor_call_budget_exceeded');
 }
 async function dispatch(request:VendorRequest,budget:Budget,attempt:number){
  check(budget);
  await pacer.admit({budget,reserveMs:0,now:()=>now().getTime(),sleep:wait,minIntervalMs:interval});
  check(budget);
  const timeout=AbortSignal.timeout(opts.timeoutMs??60000);
  const signal=AbortSignal.any([timeout,budget.signal]);
  const init={method:'POST',redirect:'manual' as const,signal,headers:{
   'content-type':'application/json',accept:'application/json, text/event-stream',authorization:`Bearer ${key}`,
  },body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:request.tool,arguments:{query:request.query}}})};
  let status:number;
  try{
   calls++;
   const res=await transport(GILDATA_ENDPOINT,init);
   status=res.status;
   if(status===200){
    const bytes=new Uint8Array(await res.arrayBuffer());
    signal.throwIfAborted();
    return {vendor:GILDATA_VENDOR,product:GILDATA_PRODUCT,request,bytes,sha256:sha256Hex(bytes),httpStatus:status,fetchedAt:now().toISOString(),attempt};
   }
   void res.body?.cancel().catch(()=>undefined);
  }catch{
   if(budget.signal.aborted)throw new VendorError('budget_aborted');
   if(timeout.aborted)throw new RetryableError('vendor_timeout');
   throw new RetryableError('vendor_network_error');
  }
  if(status===401||status===403)throw new VendorError('vendor_auth_failed');
  if(status===429)throw new RetryableError('vendor_rate_limited');
  if(status>=500&&status<600)throw new RetryableError('vendor_http_error',String(status));
  throw new VendorError('vendor_http_error',String(status));
 }
 return {vendor:GILDATA_VENDOR,product:GILDATA_PRODUCT,callsMade:()=>calls,async fetch(input,original){
  // budgetFor exposes a remaining duration, but its signal only fires on explicit cancellation.
  const remaining=original.remainingMs();
  const deadline=remaining>0&&remaining<=2147483647?AbortSignal.timeout(Math.ceil(remaining)):undefined;
  const signal=deadline?AbortSignal.any([deadline,original.signal]):original.signal;
  const budget={remainingMs:original.remainingMs.bind(original),signal};
  let onAbort:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{onAbort=()=>reject(new VendorError('budget_aborted'));});
  signal.addEventListener('abort',onAbort,{once:true});
  try{
   if(!key.trim())throw new VendorError('vendor_unavailable');
   const canonical=JSON.stringify(canonicalRequest(input));
   if(canonical.includes(key)||redactSecret(canonical,key)!==canonical)throw new VendorError('vendor_unavailable','request_contains_secret');
   const request=reviewedRequest(input);
   for(let attempt=1;;attempt++){
    check(budget);
    const work=tail.then(()=>dispatch(request,budget,attempt));
    tail=work.then(()=>{},()=>{});
    try{return await Promise.race([work,cancelled]);}
    catch(e){
     if(!(e instanceof RetryableError)||attempt>maxRetries)throw e;
     check(budget);
     const delay=1000*2**(attempt-1);
     if(budget.remainingMs()<=delay)throw new VendorError('budget_exhausted');
     await Promise.race([wait(delay,signal),cancelled]);
    }
   }
  }catch(e){
   let error=e instanceof VendorError?e:new VendorError(e instanceof PacerError?e.code:'vendor_unavailable');
   if(original.signal.aborted)error=new VendorError('budget_aborted');
   else if(deadline?.aborted)error=new VendorError('budget_exhausted');
   error.message=redactSecret(error.message,key);
   throw error;
  }finally{signal.removeEventListener('abort',onAbort);}
 }};
}

export function gildataSourceFromEnv(env:Record<string,string|undefined>,overrides:Omit<Options,'apiKey'>={}):VendorSource|null{
 const apiKey=env.GILDATA_API_KEY?.trim();
 if(!apiKey)return null;
 function integer(name:string,min:number,max:number,fallback:number){
  const raw=env[name];
  if(raw===undefined)return fallback;
  const n=Number(raw);
  if(!/^\d+$/.test(raw)||!Number.isInteger(n)||n<min||n>max)throw Error(`invalid_env:${name}`);
  return n;
 }
 return createGildataSource({apiKey,maxCalls:integer('GILDATA_MAX_CALLS_PER_RUN',1,500,80),
  minIntervalMs:integer('GILDATA_MIN_INTERVAL_MS',0,60000,1000),...overrides});
}
