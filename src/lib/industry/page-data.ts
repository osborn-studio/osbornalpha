// src/lib/industry/page-data.ts
// Server-side loading of the industry pages (spec §8.1, §11 "page: show the last good response +
// error badge; never 0 for missing"). Pages read the read models directly (no HTTP hop). A view that
// answers 'unlicensed' is rebuilt over the service role only for an admin viewer (internal preview,
// flagged on the page). The last good public view per query is kept in stale-views.ts (per instance,
// bounded, 2 h expiry) and shown with an error notice when a later read fails — but ONLY after the
// dataset's licence is re-checked as public right now; a failed or negative check fails closed and
// forgets the whole dataset (spec §4.8: a revoked licence never keeps serving old numbers).
import {requireAdminUser} from '../admin/auth';
import {schemeDatasetKey} from './licenses';
import {adminReadDeps,publicReadDeps} from './public-deps';
import {AGG_METRICS,METRIC_DURATIONS,SCHEME_VERSION,utcDate} from './read';
import type {ConstituentsQuery,DetailQuery,ListQuery,ReadDeps,Window} from './read';
import {CODE_RE,MAX_PAGE_SIZE,MAX_PERIODS} from './route-params';
import {forgetView,forgetViews,rememberView,rememberedView} from './stale-views';
import type {AggDuration,AggMetric,Scheme} from './types';

export interface PageLoad<T>{view:T|null;error:'read_failed'|null;staleAt:string|null;preview:boolean}
export interface PageDeps{publicDeps:(now:Date)=>ReadDeps;adminDeps:(now:Date)=>ReadDeps;isAdmin:()=>Promise<boolean>}

export async function isAdminViewer():Promise<boolean>{try{await requireAdminUser();return true;}catch{return false;}}
const DEFAULT_DEPS:PageDeps={publicDeps:publicReadDeps,adminDeps:adminReadDeps,isAdmin:isAdminViewer};

export async function loadView<T extends {state:string}>(key:string,build:(deps:ReadDeps)=>Promise<T>,opts:{scheme:Scheme;now?:Date;deps?:PageDeps}):Promise<PageLoad<T>>{
 const now=opts.now??new Date();const d=opts.deps??DEFAULT_DEPS;
 const datasetKey=schemeDatasetKey(opts.scheme,SCHEME_VERSION[opts.scheme]);
 const closed:PageLoad<T>={view:null,error:'read_failed',staleAt:null,preview:false};
 try{
  const view=await build(d.publicDeps(now));
  if(view.state==='unlicensed'){
   forgetViews(datasetKey);
   if(await d.isAdmin())return {view:await build(d.adminDeps(now)),error:null,staleAt:null,preview:true};
   return {view,error:null,staleAt:null,preview:false};
  }
  rememberView(key,view,datasetKey,now);
  return {view,error:null,staleAt:null,preview:false};
 }catch(e){
  console.error('[industries page]',e instanceof Error?e.message:e);
  const last=rememberedView(key,now);
  if(!last)return closed;
  if(last.datasetKey!==datasetKey){forgetView(key);return closed;}
  let stillPublic=false;
  try{stillPublic=await d.publicDeps(now).db.isDatasetPublic(datasetKey);}catch{stillPublic=false;}   // fail closed
  if(!stillPublic){forgetViews(datasetKey);return closed;}
  return {view:last.view as T,error:'read_failed',staleAt:last.at,preview:false};
 }
}

// ---------- tolerant search-param parsing (pages fall back to defaults instead of answering 400) ----------
type SP=Record<string,string|undefined>;
const one=<T extends string>(v:string|undefined,allowed:readonly T[],fallback:T):T=>v!==undefined&&(allowed as readonly string[]).includes(v)?v as T:fallback;
const intIn=(v:string|undefined,lo:number,hi:number,fallback:number)=>v!==undefined&&/^\d{1,5}$/.test(v)&&Number(v)>=lo&&Number(v)<=hi?Number(v):fallback;
const isDate=(v:string|undefined):v is string=>v!==undefined&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;

export function schemeFromSearch(sp:SP):Scheme{return one(sp.scheme,['sw2021','sic'] as const,'sw2021');}
/** Dynamic route segments → scheme / code, or null (the page answers notFound()). */
export const schemeOfPath=(raw:string):Scheme|null=>raw==='sw2021'||raw==='sic'?raw:null;
export function codeOfPath(raw:string):string|null{
 let s:string;
 try{s=decodeURIComponent(raw);}catch{return null;}
 return CODE_RE.test(s)?s:null;
}
export function listQueryFromSearch(sp:SP):ListQuery&{view:'heatmap'|'table'}{
 const scheme=schemeFromSearch(sp);
 const metric=one<AggMetric>(sp.metric,AGG_METRICS,'gross_margin');
 const duration=one<AggDuration>(sp.duration,METRIC_DURATIONS[metric],METRIC_DURATIONS[metric][0]);
 return {scheme,version:SCHEME_VERSION[scheme],level:scheme==='sic'?1:intIn(sp.level,1,3,1),metric,duration,periods:intIn(sp.periods,1,MAX_PERIODS,10),view:sp.view==='table'?'table':'heatmap'};
}
export function detailQueryFromSearch(scheme:Scheme,code:string,sp:SP):DetailQuery&{metric:AggMetric;duration:AggDuration;tableOnly:boolean}{
 const metric=one<AggMetric>(sp.metric,AGG_METRICS,'gross_margin');
 const duration=one<AggDuration>(sp.duration,METRIC_DURATIONS[metric],METRIC_DURATIONS[metric][0]);
 return {scheme,version:SCHEME_VERSION[scheme],code,metrics:[metric],durations:[duration],window:one<Window>(sp.window,['5y','10y','all'],'10y'),metric,duration,tableOnly:sp.view==='table'};
}
export function constituentsQueryFromSearch(scheme:Scheme,code:string,sp:SP,now:Date):ConstituentsQuery{
 const today=utcDate(now);
 return {scheme,version:SCHEME_VERSION[scheme],code,on:isDate(sp.on)&&sp.on<=today?sp.on:today,page:intIn(sp.page,1,10_000,1),pageSize:intIn(sp.pageSize,1,MAX_PAGE_SIZE,100)};
}
