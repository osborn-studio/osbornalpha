// src/lib/industry/providers/tushare-industry.ts
// Tushare adapters of the industry module (spec §2 field lists, §4.2, §4.4, §4.7, §6.1). Adapters only
// produce immutable page records (decoded rows + raw_hash of the page bytes + row locator); they never
// write. Calls go through IndustryDeps.tushare (contract: raw columns/items as returned by the landed
// tushareCallRaw, numbers still {__num} tokens); defaultTushareCall wraps tushareCallRaw, and
// fixtureTushareCall serves the real recordings of fixtures/tushare (spec 7th draft K1–K3) emulating the
// server's param filter and limit/offset paging, so has_more paging is exercised offline.
// Decoding: stock_basic / index_classify / index_member_all are text APIs (codes and YYYYMMDD dates):
// every cell decodes to a string (a numeric token keeps its literal text, so '000001' or '0926'-like
// values are never reformatted); daily_basic decodes with the landed decodeColumns and a decimal schema.
// Errors carry fixed codes only (a Tushare msg never reaches an Error message).
import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {TushareError,tushareCallRaw} from '../../data/sources/tushare';
import {isTushareQuotaMessage} from '../../facts/providers/tushare-statements';
import type {NumberSchema} from '../../facts/json-numbers';
import {decodeColumns,isNumToken,scanJsonNumbers} from '../../facts/json-numbers';
import type {Budget,RawSnapshot} from '../../facts/types';
import type {SnapshotStore} from '../../facts/snapshot-store';
import {SNAPSHOT_BUCKET} from '../../facts/snapshot-store';
import type {IndustryDeps} from '../types';

export type TushareCall=NonNullable<IndustryDeps['tushare']>;
export type IndustryProviderErrorCode='quota_exhausted'|'tushare_unavailable'|'tushare_error'|'paging_not_advancing'|'too_many_pages'|'row_shape'|'parse_error'|'fixture_missing';
export class IndustryProviderError extends Error{constructor(public code:IndustryProviderErrorCode,message?:string){super(message??code);this.name='IndustryProviderError';}}

export const STOCK_BASIC_FIELDS=['ts_code','symbol','name','fullname','exchange','list_status','list_date','delist_date'] as const;
export const INDEX_CLASSIFY_FIELDS=['index_code','industry_name','parent_code','level','industry_code','is_pub','src'] as const;
export const INDEX_MEMBER_FIELDS=['l1_code','l1_name','l2_code','l2_name','l3_code','l3_name','ts_code','name','in_date','out_date','is_new'] as const;
export const DAILY_BASIC_FIELDS=['ts_code','trade_date','close','total_share','free_share','total_mv'] as const;
/** daily_basic numbers stay canonical decimal strings (spec §6.1; total_share/free_share in 万股, total_mv in 万元; K2: total_share = all classes A+H+B). */
export const DAILY_BASIC_SCHEMA:NumberSchema={control:[],decimal:['close','total_share','free_share','total_mv']};
/** Documented single-call row caps (spec §2): index_member_all 2000, daily_basic 6000; stock_basic/index_classify are small. */
export const PAGE_SIZE:Record<string,number>={stock_basic:5000,index_classify:2000,index_member_all:2000,daily_basic:6000};
export const TUSHARE_MIN_INTERVAL_MS=350;
const MAX_PAGES=200;

/** Full request of one page (spec §4.4): params include limit/offset; fields are the requested column list. */
export interface PageRequest{api:string;params:Record<string,unknown>;fields:string}
/** Reference to the stored exact response bytes of a page (bucket disclosure-raw; sha256 = raw_hash). */
export interface SnapshotRef{bucket:string;path:string;sha256:string}
export interface TusharePage<T>{api:string;params:Record<string,unknown>;page:number;offset:number;has_more:boolean;raw_hash:string;fetched_at:string;request:PageRequest;snapshot:SnapshotRef|null;rows:T[]}
/** Row locator stored with every source record (spec §4.4: raw_hash + locator). */
export interface RowLocator{api:string;params:Record<string,unknown>;page:number;offset:number;row:number;request?:PageRequest;snapshot?:SnapshotRef}
export const locatorOf=(p:TusharePage<unknown>,row:number):RowLocator=>({api:p.api,params:p.params,page:p.page,offset:p.offset,row,request:p.request,...(p.snapshot?{snapshot:p.snapshot}:{})});

/** Where page evidence goes: every fetched page's exact response bytes are put into the plan-2 snapshot store before its rows are used. */
export interface SnapshotCapture{store:SnapshotStore;budget?:Budget}
export interface FetchOptions{sleep?:(ms:number)=>Promise<void>;minIntervalMs?:number;pageSize?:number;now?:()=>Date;snapshots?:SnapshotCapture}
const UNBOUNDED:Budget={remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal};
/**
 * Snapshot path of a page: the landed store only accepts `tushare/<uuid>/<sha256>.json`, so the industry pages of one api
 * live under a fixed per-api uuid derived from `industry:tushare:<api>` (no new bucket, no change to the store's validation).
 */
export function industrySnapshotPath(api:string,sha256:string):string{
 const h=createHash('sha256').update(`industry:tushare:${api}`).digest('hex');
 return `tushare/${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}/${sha256}.json`;
}
const sha256Hex=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const defaultSleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

/** Text decode: strings stay, null stays, a numeric token keeps its literal text. */
export function decodeText(fields:string[],items:unknown[][]):Record<string,string|null>[]{
 return items.map(row=>{
  if(row.length!==fields.length)throw new IndustryProviderError('row_shape',`row_width:${row.length}`);
  return Object.fromEntries(fields.map((f,i)=>{
   const v=row[i];
   if(v===null||v===undefined)return [f,null];
   if(typeof v==='string')return [f,v];
   if(isNumToken(v))return [f,v.__num];
   throw new IndustryProviderError('row_shape',`cell_type:${f}`);
  }));
 });
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' when it is a real calendar date; null/'' → null; anything else → undefined (invalid). */
export function ymdToIso(v:string|null):string|null|undefined{
 if(v===null||v==='')return null;
 const m=/^(\d{4})(\d{2})(\d{2})$/.exec(v);
 if(!m)return undefined;
 const iso=`${m[1]}-${m[2]}-${m[3]}`;
 const ms=Date.parse(`${iso}T00:00:00Z`);
 return Number.isNaN(ms)||new Date(ms).toISOString().slice(0,10)!==iso?undefined:iso;
}

/** Wraps the landed tushareCallRaw; API-level errors → quota_exhausted / tushare_error, HTTP 429 → quota_exhausted. */
export function defaultTushareCall(opts:{fetch?:typeof fetch;token?:string}={}):TushareCall{
 return async(api,params,fields)=>{
  const {limit,offset,...rest}=params as Record<string,unknown>&{limit?:number;offset?:number};
  let raw;
  try{raw=await tushareCallRaw(api,rest,fields,{fetch:opts.fetch,token:opts.token,limit,offset});}
  catch(e){
   if(e instanceof TushareError&&e.code===429)throw new IndustryProviderError('quota_exhausted','http_429');
   if(e instanceof TushareError)throw new IndustryProviderError('tushare_unavailable',`tushare_${e.code}`);
   throw new IndustryProviderError('tushare_unavailable','request_failed');
  }
  if(raw.code!==0)throw new IndustryProviderError(isTushareQuotaMessage(raw.msg)?'quota_exhausted':'tushare_error',`api_code_${raw.code}`);
  return {fields:raw.fields,items:raw.items,has_more:raw.hasMore,raw:raw.bytes};
 };
}

// Paths from the repo root (tests and scripts run there), NOT new URL(dir, import.meta.url): Next bundles this module into
// the cron route and webpack cannot resolve a directory URL as an asset (`next build` fails — Codex round 1 #1 build gate).
export const INDUSTRY_FIXTURE_DIR=join(process.cwd(),'src/lib/industry/fixtures/tushare');
export const INDUSTRY_PAGING_DIR=join(process.cwd(),'src/lib/industry/fixtures/tushare/paging');
/** Serializes a scanJsonNumbers value back to JSON text, numeric tokens as their original literals. */
function serializeTokens(v:unknown):string{
 if(isNumToken(v))return v.__num;
 if(Array.isArray(v))return `[${v.map(serializeTokens).join(',')}]`;
 if(v!==null&&typeof v==='object')return `{${Object.entries(v as Record<string,unknown>).map(([k,x])=>`${JSON.stringify(k)}:${serializeTokens(x)}`).join(',')}}`;
 return JSON.stringify(v);
}
interface FixtureDoc{request?:{api_name?:unknown};data:{fields:string[];items:unknown[][]}}

/**
 * Serves the recordings in `dirs` (every `*.json` directly inside; envelope {request:{api_name,params,fields},
 * response_sha256, request_id, code, msg, data}) whose request.api_name is `api`. Emulates the server: each
 * recording's rows are filtered by every param whose name is one of its fields (level, src, l1_code, is_new,
 * list_status, trade_date, ts_code); the rows of all recordings are merged in file-name order (projected onto the
 * requested fields; an identical row is kept once), then sliced by limit/offset; has_more = rows remain after the
 * slice. `raw` are the bytes of a synthesized page response, so raw_hash differs per page like upstream.
 */
export function fixtureTushareCall(dirs:string|readonly string[]=INDUSTRY_FIXTURE_DIR):TushareCall{
 const list=typeof dirs==='string'?[dirs]:[...dirs];
 return async(api,params,fields)=>{
  const docs:FixtureDoc[]=[];
  for(const dir of list){
   if(!existsSync(dir))continue;
   for(const f of readdirSync(dir).filter(n=>n.endsWith('.json')).sort()){
    const doc=scanJsonNumbers(new Uint8Array(readFileSync(join(dir,f)))) as FixtureDoc;
    if(doc.request?.api_name===api)docs.push(doc);
   }
  }
  if(docs.length===0)throw new IndustryProviderError('fixture_missing',api);
  const want=fields.split(',').map(s=>s.trim()).filter(Boolean);
  const text=(v:unknown)=>v===null||v===undefined?null:isNumToken(v)?v.__num:String(v);
  const rows:unknown[][]=[];const seen=new Set<string>();
  for(const doc of docs){
   const all=doc.data.fields;
   for(const f of want)if(!all.includes(f))throw new IndustryProviderError('row_shape',`fixture_field_missing:${f}`);
   const filters=Object.entries(params).filter(([k])=>k!=='limit'&&k!=='offset'&&all.includes(k));
   for(const r of doc.data.items){
    if(!filters.every(([k,v])=>text(r[all.indexOf(k)])===String(v)))continue;
    const out=want.map(f=>r[all.indexOf(f)]);const sig=serializeTokens(out);
    if(!seen.has(sig)){seen.add(sig);rows.push(out);}
   }
  }
  const offset=Number(params.offset??0),limit=params.limit===undefined?rows.length:Number(params.limit);
  const slice=rows.slice(offset,offset+limit);
  const has_more=offset+limit<rows.length;
  const body={request_id:'fixture',code:0,msg:'',data:{fields:want,items:slice,has_more}};
  return {fields:want,items:slice,has_more,raw:new TextEncoder().encode(serializeTokens(body))};
 };
}

/** limit/offset paging until has_more=false; one TusharePage per response. A page identical to the previous one stops with paging_not_advancing. */
export async function fetchPaged<T>(call:TushareCall,api:string,params:Record<string,unknown>,fields:readonly string[],decode:(f:string[],items:unknown[][])=>T[],opts:FetchOptions):Promise<TusharePage<T>[]>{
 const size=opts.pageSize??PAGE_SIZE[api]??2000;const wait=opts.sleep??defaultSleep;const gap=opts.minIntervalMs??TUSHARE_MIN_INTERVAL_MS;const now=opts.now??(()=>new Date());
 const out:TusharePage<T>[]=[];let prev:string|null=null;
 for(let page=1,offset=0;;page++){
  if(page>MAX_PAGES)throw new IndustryProviderError('too_many_pages',api);
  if(page>1)await wait(gap);
  const res=await call(api,{...params,limit:size,offset},fields.join(','));
  // structure first: duplicate names or a row of another width would let projection turn an absent cell into null
  if(new Set(res.fields).size!==res.fields.length)throw new IndustryProviderError('parse_error','duplicate_field');
  for(const r of res.items)if(!Array.isArray(r)||r.length!==res.fields.length)throw new IndustryProviderError('parse_error',`row_width:${Array.isArray(r)?r.length:'not_array'}`);
  for(const f of fields)if(!res.fields.includes(f))throw new IndustryProviderError('row_shape',`missing_field:${f}`);
  const ordered=res.items.map(r=>fields.map(f=>r[res.fields.indexOf(f)]));
  const sig=JSON.stringify(ordered);
  if(page>1&&(sig===prev||(res.items.length===0&&res.has_more)))throw new IndustryProviderError('paging_not_advancing',api);
  prev=sig;
  const rawHash=sha256Hex(res.raw);const fetchedAt=now().toISOString();
  const request:PageRequest={api,params:{...params,limit:size,offset},fields:fields.join(',')};
  let snapshot:SnapshotRef|null=null;
  if(opts.snapshots){
   const path=industrySnapshotPath(api,rawHash);
   const snap:RawSnapshot={bytes:res.raw,sha256:rawHash,meta:{source:'tushare',api,params:request.params,fields:request.fields,fetched_at:fetchedAt,http_status:200,has_more:res.has_more,page}};
   await opts.snapshots.store.put(snap,path,opts.snapshots.budget??UNBOUNDED);
   snapshot={bucket:SNAPSHOT_BUCKET,path,sha256:rawHash};
  }
  out.push({api,params,page,offset,has_more:res.has_more,raw_hash:rawHash,fetched_at:fetchedAt,request,snapshot,rows:decode([...fields],ordered)});
  if(!res.has_more)return out;
  offset+=res.items.length;
 }
}

export interface StockBasicRow{ts_code:string;symbol:string|null;name:string|null;fullname:string|null;exchange:string|null;list_status:string|null;list_date:string|null;delist_date:string|null}
export interface IndexClassifyRow{index_code:string;industry_name:string|null;parent_code:string|null;level:string|null;industry_code:string|null;is_pub:string|null;src:string|null}
export interface IndexMemberRow{l1_code:string;l1_name:string|null;l2_code:string;l2_name:string|null;l3_code:string;l3_name:string|null;ts_code:string;name:string|null;in_date:string|null;out_date:string|null;is_new:string|null}
export interface DailyBasicRow{ts_code:string;trade_date:string;close:string|null;total_share:string|null;free_share:string|null;total_mv:string|null}

const asText=<T>(f:string[],items:unknown[][])=>decodeText(f,items) as unknown as T[];

/** stock_basic for one list_status ('L' listed, 'D' delisted, 'P' paused) and optionally one exact ticker. */
export function fetchStockBasic(call:TushareCall,q:{listStatus:'L'|'D'|'P';tsCode?:string},opts:FetchOptions={}):Promise<TusharePage<StockBasicRow>[]>{
 const params={list_status:q.listStatus};
 if(q.tsCode===undefined)return fetchPaged(call,'stock_basic',params,STOCK_BASIC_FIELDS,asText<StockBasicRow>,opts);
 const tsCode=q.tsCode;
 const scopedCall:TushareCall=async(api,request,fields)=>{
  const response=await call(api,request,fields);
  const tickerColumn=response.fields.indexOf('ts_code');
  const statusColumn=response.fields.indexOf('list_status');
  // Refuse an ignored filter or ambiguous result before the paging layer stores its raw response.
  if(response.has_more||response.items.length>1||response.items.some(row=>row[tickerColumn]!==tsCode||row[statusColumn]!==q.listStatus))
   throw new IndustryProviderError('row_shape',`stock_basic_scope_mismatch:${tsCode}:${q.listStatus}`);
  return response;
 };
 return fetchPaged(scopedCall,'stock_basic',{...params,ts_code:tsCode},STOCK_BASIC_FIELDS,asText<StockBasicRow>,opts);
}
/** index_classify for one level of SW2021 (src defaults to SW2014 upstream, so it is always passed). */
export function fetchIndexClassify(call:TushareCall,q:{level:'L1'|'L2'|'L3';src?:'SW2021'},opts:FetchOptions={}):Promise<TusharePage<IndexClassifyRow>[]>{
 return fetchPaged(call,'index_classify',{level:q.level,src:q.src??'SW2021'},INDEX_CLASSIFY_FIELDS,asText<IndexClassifyRow>,opts);
}
/** index_member_all for one L1 and one is_new pass ('Y' current, 'N' historical), has_more paging. */
export function fetchIndexMembers(call:TushareCall,q:{l1Code:string;isNew:'Y'|'N'},opts:FetchOptions={}):Promise<TusharePage<IndexMemberRow>[]>{
 return fetchPaged(call,'index_member_all',{l1_code:q.l1Code,is_new:q.isNew},INDEX_MEMBER_FIELDS,asText<IndexMemberRow>,opts);
}
/** daily_basic for one trade date (YYYYMMDD); close/total_share/free_share/total_mv as canonical decimal strings. */
export function fetchDailyBasic(call:TushareCall,q:{tradeDate:string},opts:FetchOptions={}):Promise<TusharePage<DailyBasicRow>[]>{
 if(!/^\d{8}$/.test(q.tradeDate))throw new IndustryProviderError('row_shape','bad_trade_date');
 return fetchPaged(call,'daily_basic',{trade_date:q.tradeDate},DAILY_BASIC_FIELDS,(f,items)=>decodeColumns(f,items,DAILY_BASIC_SCHEMA).map(r=>({...r,ts_code:String(r.ts_code),trade_date:String(r.trade_date)})) as unknown as DailyBasicRow[],opts);
}
