// src/lib/entities/identifiers/openfigi.ts
// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
// documented limits (no key: 25 requests/min and 10 jobs/request; key: 250/min and 100 jobs),
// backs off BACKOFF_MS once on 429/5xx/network failure and then gives up the rest of the run
// (exhausted → the caller records quota_exhausted). Each request's job array and the exact
// response bytes go to reconcile-raw; the API key travels only in a header and is never stored.
// groupFigiResults is pure: equity filter, EXCH_MAP, grouping by compositeFIGI (composite level)
// or figi (venue level), sorted so the order of API results never changes the outcome. No venue
// preference is invented: several groups for one ticker means "do not write, file claims".
import type {Budget} from '../../facts/types';
import type {RawStore} from '../../dq/raw-store';
import {normalizeSecurityTicker} from '../../securities/ticker';

export const OPENFIGI_URL='https://api.openfigi.com/v3/mapping';
export const OPENFIGI_VERSION='v3';
export const EXCH_MAP_VERSION='exch-map/1';
/** True only after the Task 3b live check (verification.md). fill-identifiers/link-ah --apply refuse while false. */
export const EXCH_MAP_VERIFIED:boolean=false;
/** openfigi.com/about/exchange-codes. CG→.SH, CS→.SZ, CH (China composite) by code prefix (6/9→.SH, 0/3→.SZ). */
export const EXCH_MAP:Readonly<Record<string,'US'|'SH'|'SZ'|'CH'|'HK'>>={US:'US',UN:'US',UW:'US',UA:'US',UR:'US',UP:'US',UQ:'US',CG:'SH',CS:'SZ',CH:'CH',HK:'HK'};
/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
export const ALLOWED_SECURITY_TYPES:ReadonlySet<string>=new Set(['Common Stock','ADR','GDR']);
export const BACKOFF_MS=60_000;
const FIGI=/^BBG[A-Z0-9]{9}$/;

export type FigiMarket='US'|'CN'|'HK';
export interface FigiJob{idType:'ID_ISIN'|'TICKER';idValue:string;exchCode?:string}
export interface FigiRecord{figi:string;compositeFIGI?:string|null;ticker?:string|null;exchCode?:string|null;securityType?:string|null;securityType2?:string|null;marketSector?:string|null;name?:string|null;shareClassFIGI?:string|null}
export interface FigiEvidence{request_sha256:string;response_sha256:string;index:number}
export type FigiJobResult=
 |{job:FigiJob;status:'ok';records:FigiRecord[];evidence:FigiEvidence}
 |{job:FigiJob;status:'not_found'|'error';message:string;evidence:FigiEvidence};
export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number}
export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number}
export interface OpenFigiDeps{fetch:typeof fetch;raw:RawStore;apiKey?:string|null;sleep?:(ms:number)=>Promise<void>;now?:()=>number;budget?:Budget}
export class OpenFigiError extends Error{
 constructor(readonly code:'invalid_schema'|'openfigi_http',detail?:string){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
}

export function openFigiLimits(apiKey?:string|null):{jobsPerRequest:number;minIntervalMs:number}{
 const keyed=!!apiKey;
 const perMinute=Math.floor((keyed?250:25)*0.8);
 return {jobsPerRequest:keyed?100:10,minIntervalMs:Math.ceil(60_000/perMinute)};
}

function parseItem(job:FigiJob,item:unknown,evidence:FigiEvidence):FigiJobResult{
 if(!item||typeof item!=='object'||Array.isArray(item))throw new OpenFigiError('invalid_schema','job result');
 const o=item as {data?:unknown;error?:unknown;warning?:unknown};
 if(Array.isArray(o.data)){
  const records=o.data.map(r=>{
   if(!r||typeof r!=='object'||typeof (r as FigiRecord).figi!=='string')throw new OpenFigiError('invalid_schema','record');
   return r as FigiRecord;
  });
  return records.length?{job,status:'ok',records,evidence}:{job,status:'not_found',message:'empty data',evidence};
 }
 if(typeof o.warning==='string')return {job,status:'not_found',message:o.warning,evidence};
 if(typeof o.error==='string')return {job,status:'error',message:o.error,evidence};
 throw new OpenFigiError('invalid_schema','job result');
}

export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise<MapResult>{
 const {jobsPerRequest,minIntervalMs}=openFigiLimits(deps.apiKey);
 const sleep=deps.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const now=deps.now??Date.now;
 const results:(FigiJobResult|null)[]=jobs.map(()=>null);
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(deps.apiKey)headers['X-OPENFIGI-APIKEY']=deps.apiKey;
 let last:number|null=null,requests=0;
 const send=async(body:string):Promise<Response|null>=>{
  if(last!==null){const wait=last+minIntervalMs-now();if(wait>0)await sleep(wait);}
  last=now();requests++;
  try{return await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:deps.budget?.signal});}
  catch(e){if(deps.budget?.signal.aborted)throw e;return null;}
 };
 const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
 for(let start=0;start<jobs.length;start+=jobsPerRequest){
  const chunk=jobs.slice(start,start+jobsPerRequest);
  const body=JSON.stringify(chunk);
  let res=await send(body);
  if(retryable(res)){await sleep(BACKOFF_MS);res=await send(body);}
  if(res===null||retryable(res))return {results,exhausted:true,requests};
  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status));
  const bytes=new Uint8Array(await res.arrayBuffer());
  const req=await deps.raw.put({kind:'openfigi',bytes:new TextEncoder().encode(body),contentType:'application/json',meta:{role:'request',jobs:chunk.length}},deps.budget);
  const resp=await deps.raw.put({kind:'openfigi',bytes,contentType:'application/json',meta:{role:'response',request_sha256:req.sha256}},deps.budget);
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new OpenFigiError('invalid_schema','response is not JSON');}
  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length');
  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:resp.sha256,index:i});});
 }
 return {results,exhausted:false,requests};
}

function keyed(keys:readonly string[],jobs:FigiJob[],out:MapResult,unsupported:string[]):MappedBy{
 const byKey=new Map<string,FigiJobResult>();const unprocessed:string[]=[];
 keys.forEach((k,i)=>{const r=out.results[i];if(r)byKey.set(k,r);else unprocessed.push(k);});
 return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests};
}

export async function mapIsins(isins:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys=[...new Set(isins)];
 const jobs=keys.map(idValue=>({idType:'ID_ISIN' as const,idValue}));
 return keyed(keys,jobs,await mapJobs(jobs,deps),[]);
}

/** Reverse lookup for TICKER jobs (spec §4.1.3); null = no OpenFIGI exchange code for this ticker. */
export function exchCodeFor(ticker:string):{exchCode:string;idValue:string}|null{
 const cn=/^(\d{6})\.(SH|SZ)$/.exec(ticker);
 if(cn)return {exchCode:cn[2]==='SH'?'CG':'CS',idValue:cn[1]};
 const hk=/^(\d{5})\.HK$/.exec(ticker);
 if(hk)return {exchCode:'HK',idValue:hk[1].replace(/^0+(?=\d)/,'')};
 if(/^[A-Z][A-Z0-9.]{0,7}$/.test(ticker)&&!/\.(SH|SZ|BJ|HK)$/.test(ticker))return {exchCode:'US',idValue:ticker.replace(/\./g,'/')};
 return null;
}

export async function mapTickers(tickers:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys:string[]=[],jobs:FigiJob[]=[],unsupported:string[]=[];
 for(const t of [...new Set(tickers)]){
  const x=exchCodeFor(t);
  if(!x){unsupported.push(t);continue;}
  keys.push(t);jobs.push({idType:'TICKER',idValue:x.idValue,exchCode:x.exchCode});
 }
 return keyed(keys,jobs,await mapJobs(jobs,deps),unsupported);
}

export function securityTickerFor(exchCode:string|null|undefined,ticker:string|null|undefined):{ok:true;market:FigiMarket;ticker:string}|{ok:false;reason:string}{
 const kind=exchCode?EXCH_MAP[exchCode]:undefined;
 if(!kind)return {ok:false,reason:`exch_unknown:${exchCode??'null'}`};
 const raw=(ticker??'').trim().toUpperCase();
 if(kind==='US'){const t=normalizeSecurityTicker(raw,'US');return t?{ok:true,market:'US',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(kind==='HK'){const t=normalizeSecurityTicker(raw,'HK');return t?{ok:true,market:'HK',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(!/^\d{6}$/.test(raw))return {ok:false,reason:'ticker_invalid'};
 const suffix=kind==='SH'?'SH':kind==='SZ'?'SZ':/^[69]/.test(raw)?'SH':/^[03]/.test(raw)?'SZ':null;
 if(!suffix)return {ok:false,reason:`exch_unknown:CH:${raw[0]}`};
 return {ok:true,market:'CN',ticker:`${raw}.${suffix}`};
}

export interface FigiGroup{figi:string;level:'composite'|'venue';exchCodes:string[];securityType:string}
export interface FigiCandidate{market:FigiMarket;ticker:string;groups:FigiGroup[]}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

export function groupFigiResults(records:readonly FigiRecord[]):{candidates:FigiCandidate[];skipped:string[]}{
 const sorted=[...records].sort((a,b)=>cmp(a.compositeFIGI??a.figi,b.compositeFIGI??b.figi)||cmp(a.exchCode??'',b.exchCode??'')||cmp(a.figi,b.figi));
 const byTicker=new Map<string,{market:FigiMarket;ticker:string;groups:Map<string,FigiGroup>}>();
 const skipped:string[]=[];
 for(const r of sorted){
  if(r.marketSector!=='Equity'){skipped.push(`market_sector:${r.marketSector??'null'}`);continue;}
  if(!r.securityType||!ALLOWED_SECURITY_TYPES.has(r.securityType)){skipped.push(`security_type:${r.securityType??'null'}`);continue;}
  const composite=typeof r.compositeFIGI==='string'&&r.compositeFIGI!=='';
  const figi=composite?r.compositeFIGI!:r.figi;
  if(!FIGI.test(figi)){skipped.push('invalid_figi');continue;}
  const t=securityTickerFor(r.exchCode,r.ticker);
  if(!t.ok){skipped.push(t.reason);continue;}
  const key=`${t.market}|${t.ticker}`;
  const entry=byTicker.get(key)??{market:t.market,ticker:t.ticker,groups:new Map<string,FigiGroup>()};
  byTicker.set(key,entry);
  const gk=`${composite?'c':'v'}:${figi}`;
  const g=entry.groups.get(gk)??{figi,level:composite?'composite':'venue',exchCodes:[],securityType:r.securityType};
  if(r.exchCode&&!g.exchCodes.includes(r.exchCode))g.exchCodes.push(r.exchCode);
  entry.groups.set(gk,g);
 }
 const candidates=[...byTicker.values()]
  .sort((a,b)=>cmp(`${a.market}|${a.ticker}`,`${b.market}|${b.ticker}`))
  .map(e=>({market:e.market,ticker:e.ticker,groups:[...e.groups.values()].map(g=>({...g,exchCodes:[...g.exchCodes].sort()})).sort((a,b)=>cmp(a.figi,b.figi))}));
 return {candidates,skipped:skipped.sort()};
}
