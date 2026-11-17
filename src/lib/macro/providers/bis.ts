// BIS evidence fetcher; manual redirects prevent requests to another host.
import {createHash} from 'node:crypto';
import {BIS_PARSER_VERSION} from '../parsers/bis-cbpol';
import type {EvidenceInput} from '../types';

export const BIS_HOST='stats.bis.org';
export const BIS_FETCHER_VERSION='macro-bis-fetch/1';
export const BIS_BACKOFF_MS=[1000,2000,4000] as const;
const CODE=/^[A-Z]\.[A-Z]{2}$/;
const UA='OsbornAlpha-macro-sync/1 (+https://alpha.osborn.studio)';
export type BisFetchCode='fetch_timeout'|'fetch_network'|'fetch_http_5xx'|'fetch_http_retryable'|'fetch_http_4xx'|'fetch_aborted'|'fetch_wrong_host'|'bad_code';
export class BisFetchError extends Error{
 readonly code:BisFetchCode;readonly status:number|null;
 constructor(code:BisFetchCode,status:number|null=null){super(status===null?code:`${code}:${status}`);this.name='BisFetchError';this.code=code;this.status=status;}
}
export interface BisFetchOptions{fetch?:typeof fetch;signal?:AbortSignal;now?:()=>Date;sleep?:(ms:number)=>Promise<void>;timeoutMs?:number}
export const bisCbpolUrl=(key='M.CN')=>`https://${BIS_HOST}/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/${key}?startPeriod=2019-08&format=csv`;
const defaultSleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const retryable=(e:BisFetchError)=>e.code==='fetch_timeout'||e.code==='fetch_network'||e.code==='fetch_http_5xx'||e.code==='fetch_http_retryable';

export async function fetchBisCbpol(code='M.CN',opts:BisFetchOptions={}):Promise<EvidenceInput>{
 if(!CODE.test(code))throw new BisFetchError('bad_code');
 const f=opts.fetch??globalThis.fetch,now=opts.now??(()=>new Date()),sleep=opts.sleep??defaultSleep,timeoutMs=opts.timeoutMs??20_000;
 const url=bisCbpolUrl(code);
 for(let attempt=0;;attempt++){
  if(opts.signal?.aborted)throw new BisFetchError('fetch_aborted');
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  const onAbort=()=>ctl.abort();
  opts.signal?.addEventListener('abort',onAbort,{once:true});
  let failure:BisFetchError;
  try{
   const res=await f(url,{signal:ctl.signal,headers:{'user-agent':UA,accept:'text/csv'},redirect:'manual',cache:'no-store'});
   if(res.status===200){
    const bytes=new Uint8Array(await res.arrayBuffer());
    const finalUrl=res.url||url;
    const host=new URL(finalUrl).host;
    if(host!==BIS_HOST)throw new BisFetchError('fetch_wrong_host');
    return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes,adapter:'bis_sdmx_csv',fetchUrl:finalUrl,fetchHost:host,httpStatus:200,
     contentType:res.headers.get('content-type')||'text/csv',fetchedAt:now().toISOString(),toolVersions:{fetcher:BIS_FETCHER_VERSION,parser:BIS_PARSER_VERSION}};
   }
   failure=new BisFetchError(res.status===429?'fetch_http_retryable':res.status>=500?'fetch_http_5xx':'fetch_http_4xx',res.status);
  }catch(e){
   if(e instanceof BisFetchError)throw e;
   failure=new BisFetchError(opts.signal?.aborted?'fetch_aborted':ctl.signal.aborted?'fetch_timeout':'fetch_network');
  }finally{
   clearTimeout(timer);opts.signal?.removeEventListener('abort',onAbort);
  }
  if(!retryable(failure)||attempt>=BIS_BACKOFF_MS.length)throw failure;
  await sleep(BIS_BACKOFF_MS[attempt]);
 }
}
