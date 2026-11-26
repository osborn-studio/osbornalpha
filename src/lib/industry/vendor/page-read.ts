import type {TableClient} from '../../db/table-client';
import {freshnessOf,type FreshnessStatus} from '../../dq/freshness';
import {FINANCIAL_METRICS} from '../../vendor/gildata/parse-financials';
import {decCmp} from '../decimal';
import {vendorAccess} from './access';
import type {VendorIndustryDb} from './db';
import {deriveYoy,YOY_FORMULA_ID,type MissingReason} from './derive';
import {byIndexCode} from './sw2021-gildata-codes';
import {SW2021_L1_NAME_EN} from './sw2021-names-en';
import {FRESHNESS,type Run,type Observation,type Membership} from './types';
export type {MissingReason} from './derive';

export type VendorPageDeps={db:VendorIndustryDb;tables:TableClient;isSignedIn:()=>Promise<boolean>;isAdmin:()=>Promise<boolean>;now:Date};
type StoredMetric=typeof FINANCIAL_METRICS[number]['metric'];
export type DetailMetric=StoredMetric|'revenue_yoy';
export type ListMetric='revenue_yoy'|'net_income_parent_yoy'|'gross_margin'|'roe_avg';
export type Basis='annual'|'quarter';
export type VendorSource={vendor:string;product:string;interface:string;retrievalId:string;sha256:string;
 template:{id:string;version:number};apiNames:string[];fetchedAt:string;locator:{block:number;row:number;column?:string}|null};
export type RunHeader={licence:'public'|'internal';runId:string;kind:Run['kind'];generation:number;gridSize:{codes:number;periods:number};activatedAt:string|null;fetchedFrom:string;fetchedTo:string;
 parserVersion:string;mappingVersion:string;codeVersion:string;contentHash:string;datasetKey:string;origin:'vendor_reported';historyClass:'reconstruction'};
export type VendorCell={code:string;metric:string;duration:Observation['duration'];periodEnd:string;unit:'cny_10k'|'pct'|'count';
 status:'ok'|'missing';valueText:string|null;missingReason:MissingReason|null;source:VendorSource|null;
 derived:null|{formula:typeof YOY_FORMULA_ID;inputs:[VendorCell,VendorCell|null];memberSetChanged:boolean|null;memberCounts:{previous:string|null;current:string|null}}};
export type VendorNode={code:string;nameZh:string;nameEn:string;vendorCode:string;members:VendorCell|null};
export type ConstituentRow={securityCode:string;securityName:string;source:VendorSource};
export type VendorFreshness=Record<Run['kind'],{status:FreshnessStatus;lastOkAt:string|null}>;
type Active={state:'ok';header:RunHeader;freshness:VendorFreshness};
type Inactive={state:'withheld'}|{state:'empty';licence:RunHeader['licence']};
type UnknownIndustry={state:'unknown_industry'};
export type CnListView=Inactive|(Active&{nodes:VendorNode[];periodEnds:string[];cells:VendorCell[]});
export type CnDetailView=Inactive|UnknownIndustry|(Active&{node:VendorNode;latest:VendorCell[];series:VendorCell[];
 constituents:{header:RunHeader;total:number;preview:ConstituentRow[]}|null});
export type CnConstituentsView=Inactive|UnknownIndustry|(Active&{node:VendorNode;total:number;page:number;pageSize:number;rows:ConstituentRow[]});

export async function vendorPageLicence(deps:VendorPageDeps){
 const access=await vendorAccess({isSignedIn:deps.isSignedIn,isAdmin:deps.isAdmin,licenceStatus:async dataset_key=>{
  const [row]=await deps.tables.select('industry_dataset_licenses',{dataset_key});
  return typeof row?.status==='string'?row.status:null;
 }});
 return access==='preview'?'internal':access;
}
function header(r:Run,licence:RunHeader['licence']):RunHeader{
 return {licence,runId:r.run_id,kind:r.kind,generation:r.generation,gridSize:{codes:r.expected_grid.codes.length,periods:r.expected_grid.period_ends?.length??0},activatedAt:r.activated_at,fetchedFrom:r.fetched_from,fetchedTo:r.fetched_to,
  parserVersion:r.parser_version,mappingVersion:r.mapping_version,codeVersion:r.code_version,contentHash:r.content_hash,
  datasetKey:r.dataset_key,origin:'vendor_reported',historyClass:'reconstruction'};
}
async function freshness({tables,now}:VendorPageDeps):Promise<VendorFreshness>{
 async function stamp(kind:Run['kind']){
  const [row]=await freshnessOf(tables,now,FRESHNESS[kind]);
  return {status:row?.status??'missing',lastOkAt:typeof row?.last_ok_at==='string'?row.last_ok_at:null};
 }
 const [financials,memberships]=await Promise.all([stamp('financials'),stamp('memberships')]);
 return {financials,memberships};
}
function ends(run:Run,basis:Basis){
 return (run.expected_grid.period_ends??[]).filter(p=>basis==='annual'?p.endsWith('-12-31'):/-(03-31|06-30|09-30|12-31)$/.test(p)).sort();
}
function positive(n:number|undefined,fallback:number,max=Number.MAX_SAFE_INTEGER){
 return n!==undefined&&Number.isSafeInteger(n)&&n>0?Math.min(n,max):fallback;
}
const prior=(end:string)=>String(Number(end.slice(0,4))-1)+end.slice(4);

async function sources(db:VendorIndustryDb,rows:(Observation|Membership)[]){
 const ids=new Set(rows.flatMap(r=>r.retrieval_id?[r.retrieval_id]:[]));
 const map=new Map((await db.retrievalsByIds([...ids])).map(r=>[r.retrieval_id,r]));
 return (row:Observation|Membership):VendorSource=>{
  const r=map.get(row.retrieval_id??'');
  if(!r)throw Error('retrieval_unavailable');
  return {vendor:r.vendor,product:r.product,interface:r.interface,retrievalId:r.retrieval_id,sha256:r.sha256,
   template:{id:r.query_template_id,version:r.query_template_version},apiNames:r.api_names_returned,fetchedAt:r.fetched_at,locator:row.locator};
 };
}
type SourceOf=Awaited<ReturnType<typeof sources>>;
function cells(rows:Observation[],sourceOf:SourceOf,run:Run){
 const periods=new Set(run.expected_grid.period_ends);
 const key=(code:string,metric:string,end:string,duration:string)=>[code,metric,end,duration].join('/');
 const grid=new Map(rows.map(r=>[key(r.code,r.metric,r.period_end,r.duration),r]));
 function stored(code:string,metric:StoredMetric,periodEnd:string):VendorCell{
  const {duration,unit}=FINANCIAL_METRICS.find(m=>m.metric===metric)!;
  const r=grid.get(key(code,metric,periodEnd,duration)),ok=r?.status==='ok';
  return {code,metric,duration,unit,periodEnd,status:ok?'ok':'missing',valueText:ok?r.value_text:null,
   missingReason:!r?'not_in_run':ok?null:'vendor_not_provided',source:r&&(ok||r.retrieval_id)?sourceOf(r):null,derived:null};
 }
 return (code:string,metric:DetailMetric,end:string):VendorCell=>{
  if(metric!=='revenue_yoy')return stored(code,metric,end);
  const previous=prior(end),cur=stored(code,'revenue_cum',end);
  const base=periods.has(previous)?stored(code,'revenue_cum',previous):null;
  const a=stored(code,'member_count',end),b=stored(code,'member_count',previous);
  const result=deriveYoy(cur,base);
  return {code,metric,periodEnd:end,duration:'YTD',unit:'pct',source:null,status:result.status,
   valueText:result.status==='ok'?result.valueText:null,missingReason:result.status==='missing'?result.reason:null,
   derived:{formula:YOY_FORMULA_ID,inputs:[cur,base],memberCounts:{previous:b.valueText,current:a.valueText},memberSetChanged:a.valueText!==null&&b.valueText!==null?decCmp(a.valueText,b.valueText)!==0:null}};
 };
}
function node(code:string,nameZh:string,vendorCode:string,members:VendorCell|null):VendorNode{
 return {code,nameZh,vendorCode,nameEn:SW2021_L1_NAME_EN[code],members};
}
function memberRows(rows:Membership[],sourceOf:SourceOf):ConstituentRow[]{
 return rows.map(r=>({securityCode:r.security_code,securityName:r.security_name,source:sourceOf(r)}));
}
function sortedMembers(db:VendorIndustryDb,run:Run,code:string){
 return db.membershipsOfRun(run.run_id,code).then(rows=>rows.sort((a,b)=>a.security_code.localeCompare(b.security_code)));
}

export async function cnListView(deps:VendorPageDeps,q:{metric:ListMetric;basis:Basis;periods?:number}):Promise<CnListView>{
 const licence=await vendorPageLicence(deps);
 if(licence==='withheld')return {state:'withheld'};
 const {db}=deps,run=await db.activeRun('financials');
 if(!run)return {state:'empty',licence};
 const periodEnds=ends(run,q.basis).slice(-positive(q.periods,10,12)),latest=ends(run,'quarter').at(-1);
 const dates=new Set(periodEnds),derived=q.metric==='revenue_yoy';
 if(derived)for(const end of periodEnds)dates.add(prior(end));
 if(latest)dates.add(latest);
 const [classes,rows,registry]=await Promise.all([db.classificationsOfRun(run.run_id),
  db.observationsGrid(run.run_id,{metrics:[derived?'revenue_cum':q.metric,'member_count'],periodEnds:[...dates]}),freshness(deps)]);
 const cell=cells(rows,await sources(db,rows),run);
 const nodes=classes.map(c=>node(c.code,c.name_zh,c.vendor_code,latest?cell(c.code,'member_count',latest):null));
 return {state:'ok',header:header(run,licence),freshness:registry,nodes,periodEnds,
  cells:nodes.flatMap(n=>periodEnds.map(end=>cell(n.code,q.metric,end)))};
}
const latestMetrics=['revenue_cum','revenue_yoy','net_income_parent_cum','net_income_parent_yoy','gross_margin','roe_avg'] as const;
export async function cnDetailView(deps:VendorPageDeps,q:{code:string;metric:DetailMetric;basis:Basis;window:'5y'|'10y'|'all'}):Promise<CnDetailView>{
 const licence=await vendorPageLicence(deps);
 if(licence==='withheld')return {state:'withheld'};
 const industry=byIndexCode(q.code);
 if(!industry)return {state:'unknown_industry'};
 const {db}=deps,run=await db.activeRun('financials');
 if(!run)return {state:'empty',licence};
 const [rows,memberships]=await Promise.all([db.observationsOfRun(run.run_id,{code:q.code}),db.activeRun('memberships')]);
 const members=memberships?await sortedMembers(db,memberships,q.code):[],preview=members.slice(0,5);
 const sourceOf=await sources(db,[...rows,...preview]),cell=cells(rows,sourceOf,run);
 const annual=ends(run,'annual').at(-1),last=ends(run,'quarter').at(-1);
 const count=last?cell(q.code,'member_count',last):null;
 const dates=ends(run,q.basis),end=dates.at(-1);
 const cutoff=end&&q.window!=='all'?String(Number(end.slice(0,4))-(q.window==='5y'?5:10))+end.slice(4):'';
 return {state:'ok',header:header(run,licence),freshness:await freshness(deps),
  node:node(q.code,industry.nameZh,industry.gildataCode,count),latest:[...(annual?latestMetrics.map(m=>cell(q.code,m,annual)):[]),...(count?[count]:[])],
  series:dates.filter(d=>d>cutoff).map(d=>cell(q.code,q.metric,d)),
  constituents:memberships?{header:header(memberships,licence),total:members.length,preview:memberRows(preview,sourceOf)}:null};
}
export async function cnConstituentsView(deps:VendorPageDeps,q:{code:string;page?:number;pageSize?:number}):Promise<CnConstituentsView>{
 const licence=await vendorPageLicence(deps);
 if(licence==='withheld')return {state:'withheld'};
 const industry=byIndexCode(q.code);
 if(!industry)return {state:'unknown_industry'};
 const {db}=deps,run=await db.activeRun('memberships');
 if(!run)return {state:'empty',licence};
 const [members,financials]=await Promise.all([sortedMembers(db,run,q.code),db.activeRun('financials')]);
 const last=financials&&ends(financials,'quarter').at(-1);
 const counts=financials&&last?await db.observationsOfRun(financials.run_id,{code:q.code,metric:'member_count',from:last,to:last}):[];
 const pageSize=positive(q.pageSize,50,200),lastPage=Math.max(1,Math.ceil(members.length/pageSize));
 const page=positive(q.page,1,lastPage),offset=(page-1)*pageSize;
 const slice=members.slice(offset,offset+pageSize),sourceOf=await sources(db,[...counts,...slice]);
 return {state:'ok',header:header(run,licence),freshness:await freshness(deps),total:members.length,page,pageSize,
  node:node(q.code,industry.nameZh,industry.gildataCode,financials&&last&&counts.length?cells(counts,sourceOf,financials)(q.code,'member_count',last):null),
  rows:memberRows(slice,sourceOf)};
}
