// Tushare three-statement adapter (spec §6.3, §5.1, §4.7 raw_hash). fetchTushareStatements: income /
// balancesheet / cashflow × report_type 1/4/5 since <sinceYear>0101, paged by limit/offset (upstream
// semantics unverified, §15 — never claim completeness before the runbook check), one RawSnapshot per page,
// quota messages / HTTP 429 → ProviderError quota_exhausted. parseTushareStatements: columns by name from
// data.fields, control columns → number, EVERY value column of tushareFieldsFor(api) → canonical decimal
// (TUSHARE_NUMBER_SCHEMA is built from the catalogue, the single source; an unlisted numeric column would
// silently become a JS number), YTD period_start = Jan 1 of end_date's year, source_ref
// '<ts_code>:<end_date>:<report_type>:<f_ann_date ?? ann_date>', form_type 1/5 by month and 4 → restatement,
// same filing + same key + different values → ambiguous_value, is_calc = 1 skipped. coverageSummary feeds
// the coverage_summary info code.
// Deviations from the first plan text: (1) fetch errors carry fixed tokens only (api_code_<n>, http_429,
// request_failed_<n>): sync stores non-parse_error SyncError messages verbatim, so a Tushare msg/body must
// never reach them. (2) Parked rows (oddDuration, ambiguous candidates, missingAvailableDate) carry a
// row-level `locator` (EDGAR convention); missingAvailableDate entries also carry the lossless value columns
// of the row (`values`, decimal strings) and `snapshot_sha256`. (3) A page that repeats the previous page's
// bytes (offset ignored upstream) stops the fetch with tushare_unavailable instead of looping.
// (4) Invalid calendar dates in end_date / ann dates are treated as row_shape / missing available date.
// Review follow-up: (5) every row's ts_code must equal the snapshot's requested ts_code and all snapshots of one
// parse must be for the same requested issuer (parse_error ts_code_mismatch). (6) has_more=true always continues
// (even on a short page); an empty page with has_more=true or a page whose fields+items hash equals the previous
// page's (request_id and other envelope fields are ignored) fails as paging_not_advancing; a full page with
// has_more=false is reported as skipped reason page_full_no_more. (7) A present-but-invalid f_ann_date never
// falls back to ann_date: the row is parked as missing_available_date with both original strings; ann_date is
// used only when f_ann_date is absent/null/empty. (8) Budget: the 20 s reserve is applied once, here (the raw call
// gets reserveMs 0 and an explicit timeout); TushareError -2 → budget_exhausted, -4 → snapshot_too_large, abort of
// the budget signal → budget_aborted, any other abort/timeout → request_timeout. Parse failures of the JSON text
// carry the fixed message json_invalid.
import type {Budget,ConceptDef,Duration,FactCandidate,FilingCandidate,FormType,Origin,ParseResult,RawSnapshot} from '../types';
import {FACT_CONCEPTS,tushareFieldsFor} from '../concepts';
import type {NumberSchema} from '../json-numbers';
import {TUSHARE_CONTROL_FIELDS,canonicalDecimal,decodeColumns,scanJsonNumbers} from '../json-numbers';
import {classifyDuration,isDate} from '../classify';
import {tushareCallRaw,type TushareRaw} from '../../data/sources/tushare';
import {nearestDuration,ProviderError,rawHashOf,sha256Hex,sleep,snapshotOf,ymd} from './shared';

export type TushareApi='income'|'balancesheet'|'cashflow';
export const TUSHARE_APIS:TushareApi[]=['income','balancesheet','cashflow'];
export const TUSHARE_REPORT_TYPES=[1,4,5] as const;
export const COMMON_FIELDS=['ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type','update_flag'];
export const PAGE_SIZE=2000;
export const TUSHARE_MIN_INTERVAL_MS=300;
const MAX_PAGES=200;
const RESERVE_MS=20_000;
const CALL_TIMEOUT_MS=30_000;
const API_OF_STATEMENT:Record<string,TushareApi|undefined>={IS:'income',BS:'balancesheet',CF:'cashflow'};
/** Decimal columns = every value column of every api, from the catalogue (single source, tushareFieldsFor). */
export const TUSHARE_NUMBER_SCHEMA:NumberSchema={control:TUSHARE_CONTROL_FIELDS,decimal:[...new Set(TUSHARE_APIS.flatMap(a=>tushareFieldsFor(a)))]};
let nextSlotAt=0;   // module-level pace across callers of this process (slot reserved synchronously)
/** Test hook: forget the reserved pacing slots. */
export const resetTusharePacing=()=>{nextSlotAt=0;};

function valueFieldsOf(api:TushareApi,concepts:readonly ConceptDef[]):string[]{
 if(concepts===FACT_CONCEPTS)return tushareFieldsFor(api);
 const set=new Set<string>();
 for(const c of concepts){const t=c.tushare;if(!t||t.api!==api)continue;if('field' in t)set.add(t.field);else t.sum.forEach(f=>set.add(f));}
 return [...set];
}
// `readonly ConceptDef[]` throughout: FACT_CONCEPTS is a readonly catalogue and must not be assigned to a mutable parameter (TS4104, round-1 #4).
export function fieldsFor(api:TushareApi,concepts:readonly ConceptDef[]=FACT_CONCEPTS):string{
 const set=new Set(COMMON_FIELDS);
 if(api==='cashflow')set.add('is_calc');
 for(const f of valueFieldsOf(api,concepts))set.add(f);
 return [...set].join(',');
}
export const isTushareQuotaMessage=(msg:string)=>/积分|权限|每分钟|每天最多|最多访问|访问频率|超过.*次/.test(msg);

export interface FetchTushareOptions{call?:typeof tushareCallRaw;pageSize?:number;sleep?:typeof sleep;now?:()=>number;concepts?:readonly ConceptDef[]}
export async function fetchTushareStatements(tsCode:string,sinceYear:number,budget:Budget,opts:FetchTushareOptions={}):Promise<RawSnapshot[]>{
 if(!/^\d{6}\.(SH|SZ|BJ)$/.test(tsCode))throw new ProviderError('parse_error','bad_ts_code');
 const call=opts.call??tushareCallRaw,pageSize=opts.pageSize??PAGE_SIZE,wait=opts.sleep??sleep,now=opts.now??Date.now;
 const out:RawSnapshot[]=[];
 for(const api of TUSHARE_APIS)for(const rt of TUSHARE_REPORT_TYPES){
  const fields=fieldsFor(api,opts.concepts);
  const params={ts_code:tsCode,start_date:`${sinceYear}0101`,report_type:String(rt)};
  let previousContent:string|null=null;
  for(let page=1,offset=0;;page++){
   if(page>MAX_PAGES)throw new ProviderError('tushare_unavailable','too_many_pages');
   if(budget.remainingMs()<=RESERVE_MS)throw new ProviderError('tushare_unavailable','budget_exhausted');
   const at=Math.max(now(),nextSlotAt);nextSlotAt=at+TUSHARE_MIN_INTERVAL_MS;
   const gap=at-now();
   if(gap>0){try{await wait(gap,budget.signal);}catch{throw new ProviderError('tushare_unavailable','budget_aborted');}}
   // re-check after the pacing wait: the budget may have run out while queued
   if(budget.signal.aborted)throw new ProviderError('tushare_unavailable','budget_aborted');
   if(budget.remainingMs()<=RESERVE_MS)throw new ProviderError('tushare_unavailable','budget_exhausted');
   let raw:TushareRaw;
   try{raw=await call(api,params,fields,{limit:pageSize,offset,budget,reserveMs:0,timeoutMs:Math.min(CALL_TIMEOUT_MS,budget.remainingMs()-RESERVE_MS)});}
   catch(e){
    const code=(e as {code?:unknown}).code;
    if(code===429)throw new ProviderError('quota_exhausted','http_429');
    if(code===-2)throw new ProviderError('tushare_unavailable','budget_exhausted');
    if(code===-4)throw new ProviderError('snapshot_too_large','response_too_large');
    if(budget.signal.aborted)throw new ProviderError('tushare_unavailable','budget_aborted');
    const name=(e as {name?:unknown}).name;
    if(name==='AbortError'||name==='TimeoutError')throw new ProviderError('tushare_unavailable','request_timeout');
    throw new ProviderError('tushare_unavailable',`request_failed_${typeof code==='number'&&Number.isInteger(code)?code:'x'}`);
   }
   if(raw.code!==0)throw new ProviderError(isTushareQuotaMessage(raw.msg)?'quota_exhausted':'tushare_unavailable',`api_code_${Number.isInteger(raw.code)?raw.code:'x'}`);
   // content hash over fields+items only: a real response carries a unique request_id, so whole-body equality never repeats
   const content=sha256Hex(JSON.stringify([raw.fields,raw.items]));
   if(raw.hasMore&&raw.items.length===0)throw new ProviderError('tushare_unavailable','paging_not_advancing');
   if(previousContent!==null&&previousContent===content)throw new ProviderError('tushare_unavailable','paging_not_advancing');
   previousContent=content;
   out.push(snapshotOf(raw.bytes,{source:'tushare',api,params:{...params,limit:pageSize,offset},fields,http_status:raw.httpStatus,has_more:raw.hasMore,page}));
   if(!raw.hasMore)break;
   offset+=raw.items.length;
  }
 }
 return out;
}

interface Decoded{api:TushareApi;tsCode:string;reportType:number;page:number;sha256:string;rows:Record<string,unknown>[];limit:number|null;hasMore:boolean}
function decodeSnapshot(s:RawSnapshot):Decoded{
 const api=s.meta.api as TushareApi;
 if(!TUSHARE_APIS.includes(api))throw new ProviderError('parse_error','snapshot_api');
 const rt=Number((s.meta.params as {report_type?:string}|undefined)?.report_type);
 if(!(TUSHARE_REPORT_TYPES as readonly number[]).includes(rt))throw new ProviderError('parse_error','snapshot_report_type');
 const requested=(s.meta.params as {ts_code?:unknown}|undefined)?.ts_code;
 if(typeof requested!=='string'||requested==='')throw new ProviderError('parse_error','ts_code_missing');
 let json:{data?:{fields?:unknown;items?:unknown;has_more?:unknown}|null};
 try{json=scanJsonNumbers(s.bytes) as typeof json;}catch{throw new ProviderError('parse_error','json_invalid');}
 const data=json.data??null;
 const fields=Array.isArray(data?.fields)?data!.fields as string[]:[];
 const items=Array.isArray(data?.items)?data!.items as unknown[][]:[];
 let rows:Record<string,unknown>[];
 try{rows=decodeColumns(fields,items,TUSHARE_NUMBER_SCHEMA);}catch(e){throw new ProviderError('parse_error',(e as Error).message);}
 const limit=(s.meta.params as {limit?:unknown}|undefined)?.limit;
 return {api,tsCode:requested,reportType:rt,page:s.meta.page??1,sha256:s.sha256,rows,limit:typeof limit==='number'&&limit>0?limit:null,hasMore:data?.has_more===true};
}
/** After decodeColumns a value column is a canonical decimal string (or null); control columns are integers. */
const decOf=(v:unknown):string|null=>{if(typeof v!=='string'||v==='')return null;try{return canonicalDecimal(v);}catch{return null;}};
const numOf=(v:unknown):number|null=>{if(typeof v==='number')return v;if(typeof v==='string'&&/^-?\d+$/.test(v))return Number(v);return null;};
const strOf=(v:unknown):string|null=>typeof v==='string'&&v!==''?v:null;
const dateOf=(v:unknown):string|null=>{const s=strOf(v);return s!==null&&/^\d{8}$/.test(s)&&isDate(ymd(s))?s:null;};
/** Exact decimal addition on canonical strings (BigInt on the common scale). */
export function addDecimals(a:string,b:string):string{
 const [ai,af='']=a.split('.'),[bi,bf='']=b.split('.');const scale=Math.max(af.length,bf.length);
 const toInt=(i:string,f:string)=>BigInt(i+f.padEnd(scale,'0'));
 const sum=toInt(ai,af)+toInt(bi,bf);const neg=sum<0n;const digits=(neg?-sum:sum).toString().padStart(scale+1,'0');
 return canonicalDecimal((neg?'-':'')+(scale?`${digits.slice(0,-scale)}.${digits.slice(-scale)}`:digits));
}
const FORM_BY_MONTH:Record<string,FormType|undefined>={'03':'q1','06':'semiannual','09':'q3','12':'annual'};
const FP_BY_MONTH:Record<string,FilingCandidate['fiscalPeriod']>={'03':'Q1','06':'H1','09':'9M','12':'FY'};
const formTypeOf=(rt:number,endDate:string):FormType=>rt===4?'restatement':FORM_BY_MONTH[endDate.slice(4,6)]??'other';
const originOf=(tsCode:string):Origin=>tsCode.endsWith('.SH')?'sse':tsCode.endsWith('.SZ')?'szse':'bse';
const unitOf=(c:ConceptDef)=>c.unitKind==='money'?'CNY':c.unitKind==='per_share'?'CNY/share':'shares';

export interface ParseTushareOptions{concepts?:readonly ConceptDef[];sinceYear?:number;today?:Date}
export function parseTushareStatements(snapshots:RawSnapshot[],opts:ParseTushareOptions={}):ParseResult{
 const concepts=opts.concepts??FACT_CONCEPTS;
 const sinceYear=opts.sinceYear??(opts.today??new Date()).getUTCFullYear()-10;
 const out:ParseResult={candidates:[],filings:[],skipped:[],ambiguous:[],oddDuration:[],missingAvailableDate:[]};
 const skip=new Map<string,number>();const bump=(r:string)=>skip.set(r,(skip.get(r)??0)+1);
 let issuerCode:string|null=null;
 const filings=new Map<string,FilingCandidate>();
 const groups=new Map<string,{first:FactCandidate;values:Set<string>;all:FactCandidate[]}>();
 for(const s of snapshots){
  const d=decodeSnapshot(s);
  if(issuerCode===null)issuerCode=d.tsCode;else if(issuerCode!==d.tsCode)throw new ProviderError('parse_error','ts_code_mismatch');
  if(!d.hasMore&&d.limit!==null&&d.rows.length>=d.limit)bump('page_full_no_more');
  d.rows.forEach((row,rowNo)=>{
   const tsCode=strOf(row.ts_code),endDate=dateOf(row.end_date),rt=numOf(row.report_type);
   if(tsCode!==null&&tsCode!==d.tsCode)throw new ProviderError('parse_error','ts_code_mismatch');
   if(!tsCode||!endDate||rt===null){bump('row_shape');return;}
   if(rt!==d.reportType){bump('report_type_mismatch');return;}
   if(Number(endDate.slice(0,4))<sinceYear){bump('before_since_year');return;}
   if(d.api==='cashflow'&&numOf(row.is_calc)===1){bump('is_calc');return;}
   const updateFlag=numOf(row.update_flag);
   const rowLocator=(ann:string)=>`${d.api}:rt${rt}:p${d.page}[end_date=${endDate},ann=${ann},update_flag=${updateFlag??''},row=${rowNo}]`;
   // f_ann_date wins when present; an invalid one NEVER falls back to ann_date (that would invent an availability date)
   const present=(v:unknown)=>v!==undefined&&v!==null&&v!=='';
   const original=(v:unknown):string|null=>!present(v)?null:typeof v==='string'?v:String(v);
   const ann=present(row.f_ann_date)?dateOf(row.f_ann_date):dateOf(row.ann_date);
   if(!ann){
    const values:Record<string,string>={};
    for(const f of tushareFieldsFor(d.api)){const v=decOf(row[f]);if(v!==null)values[f]=v;}
    out.missingAvailableDate.push({ts_code:tsCode,end_date:endDate,report_type:rt,api:d.api,page:d.page,row:rowNo,update_flag:updateFlag,f_ann_date:original(row.f_ann_date),ann_date:original(row.ann_date),values,snapshot_sha256:d.sha256,locator:rowLocator('')});
    return;
   }
   const sourceRef=`${tsCode}:${endDate}:${rt}:${ann}`;
   if(!filings.has(sourceRef))filings.set(sourceRef,{sourceRef,market:'CN',source:'tushare',origin:originOf(tsCode),formType:formTypeOf(rt,endDate),fiscalYear:Number(endDate.slice(0,4)),fiscalPeriod:FP_BY_MONTH[endDate.slice(4,6)]??null,periodEnd:ymd(endDate),availableDate:ymd(ann),url:null});
   const locator=rowLocator(ann);
   for(const c of concepts){
    const t=c.tushare;if(!t||t.api!==d.api)continue;
    let value:string|null;
    if('field' in t)value=decOf(row[t.field]);
    else{const parts=t.sum.map(f=>decOf(row[f]));value=parts.every((p):p is string=>p!==null)?parts.reduce(addDecimals):null;}
    if(value===null){bump(`null:${c.id}`);continue;}
    const periodEnd=ymd(endDate);
    const periodStart=c.nature==='instant'?null:`${endDate.slice(0,4)}-01-01`;
    const duration:Duration|'odd'=periodStart?classifyDuration(periodStart,periodEnd):'INSTANT';
    const days=periodStart?Math.round((Date.parse(periodEnd)-Date.parse(periodStart))/86_400_000):0;
    const cand:FactCandidate&{locator:string}={concept:c.id,sourceConcept:`${d.api}.${'field' in t?t.field:t.sum.join('+')}`,statement:c.statement,periodStart,periodEnd,duration:duration==='odd'?nearestDuration(days):duration,value,unit:unitOf(c),consolidation:'consolidated',filingRef:sourceRef,rawHash:rawHashOf(d.sha256,locator),locator};
    if(duration==='odd'){out.oddDuration.push(Object.assign(cand,{periodDays:days}));continue;}
    const key=`${sourceRef}|${c.id}|${periodStart??''}|${periodEnd}|${cand.unit}`;
    const g=groups.get(key);
    if(!g)groups.set(key,{first:cand,values:new Set([value]),all:[cand]});else{g.values.add(value);g.all.push(cand);}
   }
  });
 }
 for(const [key,g] of groups){if(g.values.size>1)out.ambiguous.push({key,candidates:g.all});else out.candidates.push(g.first);}
 out.filings=[...filings.values()].sort((a,b)=>a.availableDate.localeCompare(b.availableDate)||a.sourceRef.localeCompare(b.sourceRef));
 out.skipped=[...skip].map(([reason,n])=>({reason,n}));
 return out;
}

export interface CoverageSummary{api:TushareApi;report_type:number;years:Record<string,number>}
/** Distinct end dates per (api, report_type, year) over the parsed candidates — the coverage_summary info payload. */
export function coverageSummary(result:ParseResult):CoverageSummary[]{
 const acc=new Map<string,Map<string,Set<string>>>();
 for(const c of result.candidates){
  const api=API_OF_STATEMENT[c.statement];if(!api)continue;
  const k=`${api}:${c.filingRef.split(':')[2]}`;
  const years=acc.get(k)??new Map<string,Set<string>>();acc.set(k,years);
  const y=c.periodEnd.slice(0,4);const ends=years.get(y)??new Set<string>();years.set(y,ends);ends.add(c.periodEnd);
 }
 return [...acc].map(([k,years])=>{const [api,rt]=k.split(':');return {api:api as TushareApi,report_type:Number(rt),years:Object.fromEntries([...years].map(([y,s])=>[y,s.size] as const).sort())};}).sort((a,b)=>a.api.localeCompare(b.api)||a.report_type-b.report_type);
}
