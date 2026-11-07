// src/lib/company/client.ts
// Client-side helpers of the company page (plan 2026-11-06 Task 11; spec §5.1, §5.10, §6.1):
// view/asOf parsing, hrefs, api urls, one fetch wrapper, and the client view of every route DTO
// the page consumes. Only `import type` from ./types and ./event-dto (erased at build), so client
// components may import this file.
import type {Market,Cell,DerivedCell,WithheldCell,WithheldReason,WithheldCounts,PeriodCol,GridRow,FilingSummary,EvidenceDto,CoverageRow,StatementKind,Basis} from './types';
import type {LineageRev,LineageConflict} from '@/lib/facts/types';
import type {PublicEvent} from './event-dto';

export const VIEW_IDS=['overview','statements','metrics','filings','tracking','judgments','ai','signals','holdings'] as const;
export type ViewId=typeof VIEW_IDS[number];
export const REPLAY_UNSUPPORTED:ReadonlySet<ViewId>=new Set<ViewId>(['ai','signals','holdings']);
/** Views whose content comes from the facts store (need a published stream). */
export const FACT_VIEWS:ReadonlySet<ViewId>=new Set<ViewId>(['overview','statements','metrics','filings']);
const VIEW_SET=new Set<string>(VIEW_IDS);
const first=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]:v;
/** `news` is retired (decision D) and lands on overview, like any unknown value. */
export function parseView(raw:string|string[]|undefined):ViewId{const v=first(raw);return v!==undefined&&VIEW_SET.has(v)?v as ViewId:'overview';}
/** A real calendar date YYYY-MM-DD not after `today` (UTC); anything else is ignored (no replay). */
export function parseAsOf(raw:string|string[]|undefined,today:string):string|null{
 const v=first(raw);if(v===undefined||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
 const ms=Date.parse(`${v}T00:00:00Z`);if(Number.isNaN(ms)||new Date(ms).toISOString().slice(0,10)!==v)return null;
 return v<=today?v:null;
}
export const utcToday=()=>new Date().toISOString().slice(0,10);
const qs=(params:Record<string,string|null|undefined>)=>{const u=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!=null&&v!=='')u.set(k,v);const s=u.toString();return s?`?${s}`:'';};
/** Page link; `view=overview` is the default and omitted; asOf is preserved by every caller. */
export function companyHref(ticker:string,o:{view:ViewId;asOf:string|null;extra?:Record<string,string|null|undefined>}):string{
 return `/stock/${encodeURIComponent(ticker)}${qs({view:o.view==='overview'?null:o.view,asOf:o.asOf,...o.extra})}`;
}
export type CompanyRoute='statements'|'facts'|'overview'|'events'|'metrics'|'filings';
/** Public route, or the admin variant (Task 9/10 build an admin twin of every composed route, filings included). */
export function companyApi(route:CompanyRoute,ticker:string,params:Record<string,string|null|undefined>,admin=false):string{
 const base=admin?'/api/admin/companies':'/api/companies';
 return `${base}/${encodeURIComponent(ticker)}/${route}${qs(params)}`;
}
export type FetchResult<T>={status:'ok';data:T}|{status:'error';httpStatus:number;code:string};
/** One GET; never throws. 5xx → code 'internal' (the page shows an error card, never a fallback source). */
export async function fetchCompanyJson<T>(url:string,signal?:AbortSignal):Promise<FetchResult<T>>{
 let res:Response;
 try{res=await fetch(url,{signal,cache:'no-store',headers:{Accept:'application/json'}});}
 catch(e){return {status:'error',httpStatus:0,code:e instanceof DOMException&&e.name==='AbortError'?'aborted':'network'};}
 if(res.status>=500)return {status:'error',httpStatus:res.status,code:'internal'};
 let body:unknown=null;try{body=await res.json();}catch{body=null;}
 if(!res.ok){const code=(body as {error?:{code?:unknown}}|null)?.error?.code;return {status:'error',httpStatus:res.status,code:typeof code==='string'?code:`http_${res.status}`};}
 return {status:'ok',data:body as T};
}
export const isWithheld=(x:unknown):x is WithheldCell=>typeof x==='object'&&x!==null&&(x as {kind?:unknown}).kind==='withheld';
export const flagOn=(v:string|undefined)=>v==='1'||v==='true';
export const f3DrawerFlagOn=(v:string|undefined)=>v===undefined||flagOn(v);
// NEXT_PUBLIC_* must be referenced literally to be inlined into the client bundle.
export const F3_DRAWER_FLAG=f3DrawerFlagOn(process.env.NEXT_PUBLIC_COMPANY_F3_DRAWER);
export const JUDGMENTS_FLAG=flagOn(process.env.NEXT_PUBLIC_COMPANY_JUDGMENTS);

// ---- client view of the route DTOs (Task 9/10; see part D "依赖的跨组接口") ----
// Field-for-field the server DTOs of Task 9 (handlers/statements.ts StatementsDto, handlers/facts.ts FactSeriesDto),
// Task 10 (event-dto.ts PublicEvent, handlers/overview.ts OverviewDto, handlers/metrics.ts MetricsDto,
// handlers/filings.ts FilingsDto). Declared here because client components must not import handler modules.
export interface StatementsResponse{issuerId:string;ticker:string;market:Market;asOf:string;mappingGen:number;stateRev:number;truncated:boolean;statement:StatementKind;basis:Basis;periods:PeriodCol[];rows:GridRow[];filings:Record<string,FilingSummary>;
 /** concept → period keys with only a non-primary unit (cell null → render "—" + U). */
 otherUnitOnly:Record<string,string[]>;
 /** concept → period keys with a primary-unit value AND other-unit facts (U badge on the value cell; committed DTO field, Task 7/9). */
 otherUnitsAlso:Record<string,string[]>;evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}
interface SeriesBase{factId:string;availableDate:string;filingId:string;disclosureSeq:number|null;isCurrent:boolean|null;isRevision:boolean|null;sourceConcept:string;mappingVersion:string;mappingGen:number;unit:string}
export type SeriesEntry=(SeriesBase&{kind:'fact';value:string;rawHash:string;runId:string;unitRule:string|null;delta:string|null;relChange:string|null})|(SeriesBase&{kind:'withheld';reason:WithheldReason});
export interface FactSeriesResponse{issuerId:string;ticker:string;market:Market;asOf:string;mappingGen:number;stateRev:number;truncated:boolean;history:true;concept:string;periodStart:string;periodEnd:string;unit:string;
 otherUnits:string[];series:SeriesEntry[];otherUnitSeries:SeriesEntry[];filings:Record<string,FilingSummary>;evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}
export type {PublicEvent} from './event-dto';
export interface OverviewResponse{ticker:string;market:Market;asOf:string;coverage:CoverageRow|null;coverageOtherMarket:CoverageRow|null;latestFiling:FilingSummary|null;
 latest:{periodKey:string|null;facts:Record<string,Cell>;derived:Record<string,Cell>;stateRev:number;truncated:boolean}|null;recentEvents:PublicEvent[];eventsComputed:'materialized'|'live';evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}
// inputUnit / basis mirror MetricDto (计划第 3 轮审计 R6): grid rows key on (metric, inputUnit, basis).
export interface MetricEntry{metric:string;periodStart:string;periodEnd:string;duration:string;inputUnit:string;basis:string;basedOnRev:number;basedOnLineage?:LineageRev[];computedAt:string|null;computedAtKind:'materialized'|'live';cell:DerivedCell|WithheldCell}
export interface MetricsResponse{lineage?:string[];resolution?:{tickerAsOf:string;issuerId:string;validFromMethod:string|null};conflicts?:{key:LineageConflict['key'];availableDate:string;factIds:string[]}[];issuerId:string;ticker:string;market:Market;asOf:string|null;mappingGen:number;formulaVersion:string;stale:boolean;truncated:boolean;metrics:MetricEntry[];evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}
export type FreshnessStatus='fresh'|'stale'|'error'|'missing';
export interface FreshnessResponse{datasets:{dataset:string;status:FreshnessStatus|null;lastOkAt:string|null;lastAttemptAt:string|null}[]}
export interface CompanyFilingsResponse{issuerId:string;ticker:string;market:Market;asOf:string|null;stateRev:number;filings:FilingSummary[]}
/** Spec-2 /api/facts?factIds= row, used only to locate a fact's natural key (its value is never displayed, §0 #68). */
export interface FactKeyRow{factId:string;concept:string;periodStart:string|null;periodEnd:string;duration:string;unit:string}
export interface FactIdsResponse{facts:FactKeyRow[]}

/** Track button state from GET /api/tracking/watches (Task 16): 404 = routes not deployed yet. */
export type TrackState='loading'|'tracked'|'untracked'|'login'|'unavailable';
export function trackStateOf(r:FetchResult<{watches?:{issuerId?:unknown}[]}>,issuerId:string):TrackState{
 if(r.status==='ok')return (r.data.watches??[]).some(w=>w.issuerId===issuerId)?'tracked':'untracked';
 if(r.httpStatus===401)return 'login';
 return 'unavailable';
}
