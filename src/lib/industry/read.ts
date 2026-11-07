// src/lib/industry/read.ts
// Read models of the industry pages and public routes (spec §8, §9): list, detail, constituents,
// an issuer's industries, and replay (original | recompute, spec §5.5). `deps.db` is the anon
// IndustryDb: the RLS licence gate (spec §4.8) makes rows of a non-public dataset read as nothing, so
// every view asks isDatasetPublic first and answers 'unlicensed'. Only the admin internal preview
// (spec §8.1) passes the service-role IndustryDb with preview=true. Source records are service-role
// only and reach the views as counts through deps.unresolved; the manifest bucket is private and is
// read only after the anon authorization chain passed (dataset public → run visible → cell exists).
// Values stay decimal strings; a missing cell keeps its reason and is never turned into 0.
import {computeFreshness} from '../dq/freshness';
import type {FreshnessStatus} from '../dq/freshness';
import {canonicalDecimal} from '../facts/json-numbers';
import type {FactRow,FactsDb,Market} from '../facts/types';
import {cellDisplay} from './display';
import type {CellDisplay} from './display';
import {schemeDatasetKey} from './licenses';
import {isMemberAt} from './memberships';
import {CONFIG_HASH,METHOD_CONFIG,METHOD_VERSION,cellSpecs} from './method';
import {InputIndex,pickInputs} from './aggregate';
import type {PoolDerived,PoolFact} from './aggregate';
import {canonicalJson} from './canonical-json';
import {replayCell,replayFromManifest} from './replay';
import type {AggDuration,AggMetric,AggregateManifest,CellStatus,ClassificationRow,DatasetKey,FreshnessRow,HistoryClass,IndustryDb,ManifestCell,ManifestStore,ManifestUnresolved,MembershipRow,MetricCellRow,MetricRunRow,MissingReason,Scheme,SchemeVersion,ValuationCellRow} from './types';

export const SCHEME_VERSION:Record<Scheme,SchemeVersion>={sw2021:'2021',sic:'sec-current'};
export const AGG_METRICS:readonly AggMetric[]=['revenue_sum','net_income_parent_sum','gross_margin','roe','revenue_yoy','net_income_yoy','member_count'];
export const AGG_DURATIONS:readonly AggDuration[]=['12M','3M','TTM','INSTANT'];
/** Spec §5.2: the durations each metric is computed for (first = page default). */
export const METRIC_DURATIONS:Record<AggMetric,readonly AggDuration[]>={revenue_sum:['12M','3M'],net_income_parent_sum:['12M','3M'],gross_margin:['12M'],roe:['TTM'],revenue_yoy:['12M','3M'],net_income_yoy:['12M','3M'],member_count:['INSTANT']};
/** The stored YoY metric shown next to a sum in the table view (no page-side arithmetic). */
export const YOY_COMPANION:Partial<Record<AggMetric,AggMetric>>={revenue_sum:'revenue_yoy',net_income_parent_sum:'net_income_yoy'};
/** dq_freshness datasets written by the jobs (Task 12 aggregate, Task 7 SW memberships, Task 9 SIC). */
export const AGG_FRESHNESS:Record<Scheme,string>={sw2021:'industry.agg.sw2021',sic:'industry.sic.memberships'};
export const MEMBERSHIP_FRESHNESS:Record<Scheme,string>={sw2021:'industry.sw2021.memberships',sic:'industry.sic.memberships'};
export type SourceId='sw_via_tushare'|'exchange_via_tushare'|'tushare_statements'|'sec_submissions'|'edgar_companyfacts';
export const SOURCES:Record<Scheme,readonly SourceId[]>={sw2021:['sw_via_tushare','exchange_via_tushare','tushare_statements'],sic:['sec_submissions','edgar_companyfacts']};
export const OFFICIAL_DATASET:DatasetKey='official:tushare-sw_daily';
export type Window='5y'|'10y'|'all';
export const utcDate=(d:Date)=>d.toISOString().slice(0,10);

export type ReadDb=Pick<IndustryDb,'isDatasetPublic'|'classificationTree'|'freshness'|'activeMetricRun'|'metricRun'|'metricRowsOfRun'|'metricRunVisible'|'activeValuationRun'|'publishedValuations'|'membershipCandidates'|'membershipsOfIssuer'>;
export interface IssuerCard{issuerId:string;nameZh:string|null;nameEn:string|null;ticker:string|null}
export interface ReadDeps{
 db:ReadDb;
 /** service role: industry_source_memberships is not public (spec §4.3); only counts leave it */
 unresolved:Pick<IndustryDb,'unresolvedCount'>;
 issuers:(ids:string[],today:string)=>Promise<Map<string,IssuerCard>>;
 facts?:Pick<FactsDb,'readFacts'>;
 memberCounts?:(scheme:Scheme,version:SchemeVersion,on:string)=>Promise<Map<string,number>>;
 now:Date;
 /** admin internal preview over the service-role db: the licence gate is skipped and the page says so */
 preview:boolean;
}

export interface NodeView{code:string;level:number;nameZh:string|null;nameEn:string|null;parentCode:string|null}
export interface RunHeader{methodVersion:string;runId:string;generation:number;level:number;factsAsOf:string;knowledgeDate:string;historyClass:HistoryClass;activatedAt:string|null;configHash:string;formulaVersion:string;codeVersion:string}
export interface PublicCell{code:string;metric:AggMetric;duration:AggDuration;periodStart:string;periodEnd:string;status:CellStatus;missingReason:MissingReason|null;value:string|null;unit:string;nMembers:number;nWithData:number;nUnresolved:number;manifestHash:string|null;updatedAt:string|null;display:CellDisplay}
export interface PublicValuation{code:string;tradeDate:string;metric:ValuationCellRow['metric'];value:string;factsAsOf:string;nMembers:number|null;nWithData:number|null;nUnresolved:number|null;mcapCoverage:string|null;manifestHash:string|null;updatedAt:string|null}
export type ValuationBlock=
 |{state:'not_enabled'}
 |{state:'unpublished';runId:string;reconciliation:Record<string,unknown>}
 |{state:'published';runId:string;methodVersion:string;reconciliation:Record<string,unknown>;cells:PublicValuation[]};
interface Base{datasetKey:DatasetKey;preview:boolean;freshness:FreshnessStatus}

export interface ListQuery{scheme:Scheme;version:SchemeVersion;level:number;metric:AggMetric;duration:AggDuration;periods:number}
export type ListView=
 |{state:'unlicensed';datasetKey:DatasetKey}
 |(Base&{state:'empty';kind:'aggregate';nodes:NodeView[]})
 |(Base&{state:'ok';kind:'aggregate';header:RunHeader;nodes:NodeView[];metric:AggMetric;duration:AggDuration;periodEnds:string[];cells:PublicCell[];companion:PublicCell[];valuation:ValuationBlock})
 |(Base&{state:'ok';kind:'navigation';nodes:(NodeView&{members:number|null})[]});

export interface MethodInfo{methodVersion:string;configHash:string;formulaVersion:string|null;codeVersion:string|null;config:unknown}
export interface DetailQuery{scheme:Scheme;version:SchemeVersion;code:string;metrics:AggMetric[];durations:AggDuration[]|null;window:Window}
export type DetailView=
 |{state:'unlicensed';datasetKey:DatasetKey}
 |{state:'unknown_industry'}
 |(Base&{state:'ok';node:NodeView;ancestors:NodeView[];children:NodeView[];header:RunHeader|null;aggregated:boolean;members:{count:number;unresolved:number;lastAddition:string|null};periodEnds:string[];series:PublicCell[];valuation:ValuationBlock;method:MethodInfo;sources:readonly SourceId[]});

export interface FactCellView{factId:string;concept:string;value:string;unit:string;periodStart:string|null;periodEnd:string;duration:string;availableDate:string;filingId:string;rawHash:string}
export interface MembershipView{membershipId:string;code:string;level:number;validFrom:string;validTo:string|null;availableDate:string;validToAvailableDate:string|null;source:string;sourceMembershipId:string|null;batchId:string;availability:string;rawHash:string|null;locator:Record<string,unknown>|null}
export interface ConstituentRow{issuerId:string;ticker:string|null;nameZh:string|null;nameEn:string|null;membership:MembershipView;path:NodeView[];revenue:FactCellView|null;netIncome:FactCellView|null}
export interface ConstituentsQuery{scheme:Scheme;version:SchemeVersion;code:string;on:string;page:number;pageSize:number}
export type ConstituentsView=
 |{state:'unlicensed';datasetKey:DatasetKey}
 |{state:'unknown_industry'}
 |(Base&{state:'ok';node:NodeView;on:string;knownBy:string;total:number;page:number;pageSize:number;unresolvedCount:number;currentOnly:boolean;rows:ConstituentRow[]});

export interface IssuerIndustry{scheme:Scheme;version:SchemeVersion;datasetKey:DatasetKey;currentOnly:boolean;since:string;membershipId:string;path:NodeView[]}
export type IssuerIndustriesView=
 |{state:'unknown_issuer'}
 |{state:'ok';issuerId:string;on:string;industries:IssuerIndustry[];schemes:{scheme:Scheme;version:SchemeVersion;datasetKey:DatasetKey;public:boolean}[]};

const nodeView=(r:ClassificationRow):NodeView=>({code:r.code,level:r.level,nameZh:r.name_zh,nameEn:r.name_en,parentCode:r.parent_code});
const byCode=(a:{code:string},b:{code:string})=>a.code<b.code?-1:a.code>b.code?1:0;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

export function runHeader(r:MetricRunRow):RunHeader{
 return {methodVersion:r.method_version,runId:r.run_id,generation:Number(r.generation),level:r.level,factsAsOf:r.facts_as_of,knowledgeDate:r.knowledge_date,historyClass:r.history_class,activatedAt:r.activated_at,configHash:r.config_hash,formulaVersion:r.formula_version,codeVersion:r.code_version};
}
export function publicCell(r:MetricCellRow):PublicCell{
 return {code:r.code,metric:r.metric,duration:r.duration,periodStart:r.period_start,periodEnd:r.period_end,status:r.status,missingReason:r.missing_reason,value:r.value,unit:r.unit,nMembers:r.n_members,nWithData:r.n_with_data,nUnresolved:r.n_unresolved,manifestHash:r.manifest_hash,updatedAt:r.updated_at,display:cellDisplay(r)};
}
const publicValuation=(r:ValuationCellRow):PublicValuation=>({code:r.code,tradeDate:r.trade_date,metric:r.metric,value:r.value??'',factsAsOf:r.facts_as_of,nMembers:r.n_members,nWithData:r.n_with_data,nUnresolved:r.n_unresolved,mcapCoverage:r.mcap_coverage,manifestHash:r.manifest_hash,updatedAt:r.updated_at});
const factView=(r:FactRow):FactCellView=>({factId:r.fact_id,concept:r.concept,value:r.value_text,unit:r.unit,periodStart:r.period_start,periodEnd:r.period_end,duration:r.duration,availableDate:r.available_date,filingId:r.filing_id,rawHash:r.raw_hash});
const membershipView=(m:MembershipRow):MembershipView=>({membershipId:m.membership_id,code:m.code,level:m.level,validFrom:m.valid_from,validTo:m.valid_to,availableDate:m.available_date,validToAvailableDate:m.valid_to_available_date,source:m.source,sourceMembershipId:m.source_membership_id,batchId:m.batch_id,availability:m.provenance.availability,rawHash:m.provenance.raw_hash??null,locator:m.provenance.locator??null});

/** Stored status, recomputed against the weekly window when not error (a stopped job never writes again; spec §4.6). */
export function effectiveFreshness(rows:FreshnessRow[],dataset:string,now:Date):FreshnessStatus{
 const r=rows.find(x=>x.dataset===dataset);
 if(!r)return 'missing';
 if(r.status==='error')return 'error';
 return computeFreshness({cadence:'weekly',lastOkAt:r.last_ok_at?new Date(r.last_ok_at):null,consecutiveErrors:0,now});
}
async function licensed(deps:ReadDeps,key:DatasetKey):Promise<boolean>{return deps.preview||await deps.db.isDatasetPublic(key);}
export function windowStart(w:Window,today:string):string|null{
 if(w==='all')return null;
 return `${Number(today.slice(0,4))-(w==='5y'?5:10)}-01-01`;
}
/** Grid period ends for a duration: annual (12M) cells live on 12-31 only; others on every grid end. */
export function periodEndsFor(run:MetricRunRow,duration:AggDuration|null,opts:{count?:number;from?:string|null}):string[]{
 const all=[...new Set(run.expected_grid.period_ends)].sort(cmp).filter(e=>duration!=='12M'||e.endsWith('-12-31')).filter(e=>!opts.from||e>=opts.from);
 return opts.count===undefined?all:all.slice(-opts.count);
}

async function valuationBlock(deps:ReadDeps,scheme:Scheme,version:SchemeVersion,level:number,filter:{codes?:string[];from?:string}):Promise<ValuationBlock>{
 if(scheme!=='sw2021')return {state:'not_enabled'};
 const run=await deps.db.activeValuationRun(scheme,version,level);
 if(!run)return {state:'not_enabled'};
 const rows=(await deps.db.publishedValuations(run.run_id,filter)).filter(r=>r.published&&r.status==='ok'&&r.value!==null);
 if(rows.length===0)return {state:'unpublished',runId:run.run_id,reconciliation:run.reconciliation};
 return {state:'published',runId:run.run_id,methodVersion:run.method_version,reconciliation:run.reconciliation,cells:rows.map(publicValuation)};
}
/** Snapshot = the latest published date per (code, metric) within the last 45 days. */
function latestPerKey(b:ValuationBlock):ValuationBlock{
 if(b.state!=='published')return b;
 const latest=new Map<string,PublicValuation>();
 for(const c of b.cells){const k=`${c.code}:${c.metric}`;const p=latest.get(k);if(!p||c.tradeDate>p.tradeDate)latest.set(k,c);}
 return {...b,cells:[...latest.values()].sort((x,y)=>cmp(`${x.code}:${x.metric}`,`${y.code}:${y.metric}`))};
}
const daysBefore=(today:string,n:number)=>new Date(Date.parse(`${today}T00:00:00Z`)-n*86_400_000).toISOString().slice(0,10);

export async function industryListView(deps:ReadDeps,q:ListQuery):Promise<ListView>{
 const datasetKey=schemeDatasetKey(q.scheme,q.version);
 if(!await licensed(deps,datasetKey))return {state:'unlicensed',datasetKey};
 const [tree,fresh]=await Promise.all([deps.db.classificationTree(q.scheme,q.version),deps.db.freshness()]);
 const today=utcDate(deps.now);
 if(q.scheme==='sic'){
  const counts=deps.memberCounts?await deps.memberCounts(q.scheme,q.version,today):null;
  const nodes=tree.map(nodeView).sort(byCode).map(n=>({...n,members:counts?counts.get(n.code)??0:null}));
  return {state:'ok',kind:'navigation',datasetKey,preview:deps.preview,freshness:effectiveFreshness(fresh,MEMBERSHIP_FRESHNESS.sic,deps.now),nodes};
 }
 const freshness=effectiveFreshness(fresh,AGG_FRESHNESS[q.scheme],deps.now);
 const nodes=tree.filter(n=>n.level===q.level).map(nodeView).sort(byCode);
 const run=await deps.db.activeMetricRun(q.scheme,q.version,q.level);
 if(!run)return {state:'empty',kind:'aggregate',datasetKey,preview:deps.preview,freshness,nodes};
 const periodEnds=periodEndsFor(run,q.duration,{count:q.periods});
 const companion=YOY_COMPANION[q.metric];
 const rows=periodEnds.length===0?[]:await deps.db.metricRowsOfRun(run.run_id,{metrics:companion?[q.metric,companion]:[q.metric],periodEnds,durations:[q.duration]});
 const valuation=latestPerKey(await valuationBlock(deps,q.scheme,q.version,q.level,{from:daysBefore(today,45)}));
 return {state:'ok',kind:'aggregate',datasetKey,preview:deps.preview,freshness,header:runHeader(run),nodes,metric:q.metric,duration:q.duration,periodEnds,
  cells:rows.filter(r=>r.metric===q.metric).map(publicCell),companion:companion?rows.filter(r=>r.metric===companion).map(publicCell):[],valuation};
}

function ancestorsOf(tree:ClassificationRow[],row:ClassificationRow):NodeView[]{
 const byId=new Map(tree.map(n=>[n.code,n]));const out:NodeView[]=[];
 for(let p=row.parent_code;p!==null&&out.length<4;){const n=byId.get(p);if(!n)break;out.unshift(nodeView(n));p=n.parent_code;}
 return out;
}
async function currentMembers(deps:ReadDeps,q:{scheme:Scheme;version:SchemeVersion;code:string;level:number;on:string;knownBy:string}):Promise<MembershipRow[]>{
 return (await deps.db.membershipCandidates({scheme:q.scheme,version:q.version,code:q.code,level:q.level,on:q.on})).filter(m=>m.code===q.code&&isMemberAt(m,q.on,q.knownBy));
}
const seriesOrder=(a:PublicCell,b:PublicCell)=>cmp(a.metric,b.metric)||cmp(a.duration,b.duration)||cmp(a.periodEnd,b.periodEnd);

export async function industryDetailView(deps:ReadDeps,q:DetailQuery):Promise<DetailView>{
 const datasetKey=schemeDatasetKey(q.scheme,q.version);
 if(!await licensed(deps,datasetKey))return {state:'unlicensed',datasetKey};
 const tree=await deps.db.classificationTree(q.scheme,q.version);
 const row=tree.find(n=>n.code===q.code);
 if(!row)return {state:'unknown_industry'};
 const today=utcDate(deps.now);
 const [fresh,members,unresolved,run]=await Promise.all([
  deps.db.freshness(),
  currentMembers(deps,{scheme:q.scheme,version:q.version,code:q.code,level:row.level,on:today,knownBy:today}),
  q.scheme==='sw2021'?deps.unresolved.unresolvedCount({code:q.code,level:row.level,on:today,knownBy:today}):Promise.resolve(0),
  q.scheme==='sw2021'?deps.db.activeMetricRun(q.scheme,q.version,row.level):Promise.resolve(null),
 ]);
 const from=windowStart(q.window,today);
 let periodEnds:string[]=[],series:PublicCell[]=[];
 if(run){
  periodEnds=periodEndsFor(run,null,{from});
  if(periodEnds.length>0)series=(await deps.db.metricRowsOfRun(run.run_id,{codes:[q.code],metrics:q.metrics,periodEnds,durations:q.durations??undefined})).filter(r=>r.code===q.code).map(publicCell).sort(seriesOrder);
 }
 const valuation=await valuationBlock(deps,q.scheme,q.version,row.level,{codes:[q.code],from:from??undefined});
 const lastAddition=members.reduce<string|null>((m,r)=>m===null||r.valid_from>m?r.valid_from:m,null);
 return {
  state:'ok',datasetKey,preview:deps.preview,freshness:effectiveFreshness(fresh,run?AGG_FRESHNESS[q.scheme]:MEMBERSHIP_FRESHNESS[q.scheme],deps.now),
  node:nodeView(row),ancestors:ancestorsOf(tree,row),children:tree.filter(n=>n.parent_code===q.code).map(nodeView).sort(byCode),
  header:run?runHeader(run):null,aggregated:run!==null,members:{count:new Set(members.map(m=>m.issuer_id)).size,unresolved,lastAddition},
  periodEnds,series,valuation,
  method:{methodVersion:run?.method_version??METHOD_VERSION,configHash:run?.config_hash??CONFIG_HASH,formulaVersion:run?.formula_version??null,codeVersion:run?.code_version??null,config:METHOD_CONFIG},
  sources:SOURCES[q.scheme],
 };
}

async function mapLimit<T,R>(items:T[],limit:number,fn:(t:T)=>Promise<R>):Promise<R[]>{
 const out=new Array<R>(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i]);}}));
 return out;
}
/** Latest 12M revenue / net_income_parent visible on `on` (anon read_facts: ok rows only). */
async function latestAnnual(facts:Pick<FactsDb,'readFacts'>,issuer:string,market:Market,on:string):Promise<{revenue:FactCellView|null;netIncome:FactCellView|null}>{
 const env=await facts.readFacts(issuer,market,{concepts:['revenue','net_income_parent'],asOf:on,from:`${Number(on.slice(0,4))-2}-01-01`,to:on});
 if(env.truncated)return {revenue:null,netIncome:null};
 const pick=(c:string)=>{const r=env.rows.filter(x=>x.concept===c&&x.duration==='12M'&&x.status==='ok').sort((a,b)=>cmp(b.period_end,a.period_end))[0];return r?factView(r):null;};
 return {revenue:pick('revenue'),netIncome:pick('net_income_parent')};
}
function pathOf(rows:MembershipRow[],on:string,knownBy:string,tree:Map<string,ClassificationRow>):NodeView[]{
 return rows.filter(m=>isMemberAt(m,on,knownBy)).sort((a,b)=>a.level-b.level).map(m=>{const n=tree.get(m.code);return n?nodeView(n):{code:m.code,level:m.level,nameZh:null,nameEn:null,parentCode:null};});
}

export async function constituentsView(deps:ReadDeps,q:ConstituentsQuery):Promise<ConstituentsView>{
 const datasetKey=schemeDatasetKey(q.scheme,q.version);
 if(!await licensed(deps,datasetKey))return {state:'unlicensed',datasetKey};
 const tree=await deps.db.classificationTree(q.scheme,q.version);
 const row=tree.find(n=>n.code===q.code);
 if(!row)return {state:'unknown_industry'};
 const today=utcDate(deps.now);
 const [fresh,members,unresolvedCount]=await Promise.all([
  deps.db.freshness(),
  currentMembers(deps,{scheme:q.scheme,version:q.version,code:q.code,level:row.level,on:q.on,knownBy:today}),
  q.scheme==='sw2021'?deps.unresolved.unresolvedCount({code:q.code,level:row.level,on:q.on,knownBy:today}):Promise.resolve(0),
 ]);
 const sorted=[...members].sort((a,b)=>cmp(a.valid_from,b.valid_from)||cmp(a.issuer_id,b.issuer_id));
 const pageRows=sorted.slice((q.page-1)*q.pageSize,q.page*q.pageSize);
 const cards=pageRows.length?await deps.issuers([...new Set(pageRows.map(m=>m.issuer_id))],today):new Map<string,IssuerCard>();
 const treeMap=new Map(tree.map(n=>[n.code,n]));
 const market:Market=q.scheme==='sw2021'?'CN':'US';
 const rows=await mapLimit(pageRows,8,async(m):Promise<ConstituentRow>=>{
  const card=cards.get(m.issuer_id);
  const path=q.scheme==='sw2021'?pathOf(await deps.db.membershipsOfIssuer(m.issuer_id,{scheme:q.scheme,on:q.on}),q.on,today,treeMap):[nodeView(row)];
  const f=deps.facts?await latestAnnual(deps.facts,m.issuer_id,market,q.on):{revenue:null,netIncome:null};
  return {issuerId:m.issuer_id,ticker:card?.ticker??null,nameZh:card?.nameZh??null,nameEn:card?.nameEn??null,membership:membershipView(m),path,revenue:f.revenue,netIncome:f.netIncome};
 });
 return {state:'ok',datasetKey,preview:deps.preview,freshness:effectiveFreshness(fresh,MEMBERSHIP_FRESHNESS[q.scheme],deps.now),node:nodeView(row),on:q.on,knownBy:today,total:sorted.length,page:q.page,pageSize:q.pageSize,unresolvedCount,currentOnly:q.scheme==='sic',rows};
}

/** Industries of one issuer on `on`, public schemes only (spec §7.3: GET /api/entities/[issuerId]/industries). */
export async function issuerIndustriesView(deps:ReadDeps,q:{issuerId:string;on:string}):Promise<IssuerIndustriesView>{
 const today=utcDate(deps.now);
 if(!(await deps.issuers([q.issuerId],today)).has(q.issuerId))return {state:'unknown_issuer'};
 const schemes=await Promise.all((['sw2021','sic'] as const).map(async scheme=>{const version=SCHEME_VERSION[scheme];const datasetKey=schemeDatasetKey(scheme,version);return {scheme,version,datasetKey,public:await licensed(deps,datasetKey)};}));
 const industries:IssuerIndustry[]=[];
 for(const s of schemes){
  if(!s.public)continue;
  const [rows,tree]=await Promise.all([deps.db.membershipsOfIssuer(q.issuerId,{scheme:s.scheme,on:q.on}),deps.db.classificationTree(s.scheme,s.version)]);
  const current=rows.filter(m=>m.scheme===s.scheme&&m.version===s.version&&isMemberAt(m,q.on,today));
  if(current.length===0)continue;
  const treeMap=new Map(tree.map(n=>[n.code,n]));
  if(s.scheme==='sw2021'){
   const deepest=current.reduce((a,b)=>b.level>a.level?b:a);
   industries.push({scheme:s.scheme,version:s.version,datasetKey:s.datasetKey,currentOnly:false,since:deepest.valid_from,membershipId:deepest.membership_id,path:pathOf(current,q.on,today,treeMap)});
  }else{
   for(const m of current.sort((a,b)=>cmp(a.code,b.code)))industries.push({scheme:s.scheme,version:s.version,datasetKey:s.datasetKey,currentOnly:true,since:m.valid_from,membershipId:m.membership_id,path:pathOf([m],q.on,today,treeMap)});
  }
 }
 return {state:'ok',issuerId:q.issuerId,on:q.on,industries,schemes};
}

// ---------- replay (spec §5.5, §9) ----------
export interface ReplayQuery{scheme:Scheme;version:SchemeVersion;code:string;runId:string;metric:AggMetric;duration:AggDuration|null;periodEnd:string;mode:'original'|'recompute'}
export interface RecomputeQuery{scheme:Scheme;version:SchemeVersion;level:number;code:string;periodEnd:string;factsAsOf:string;knowledgeDate:string;historyClass:HistoryClass}
export interface ReplayDeps{
 /** anon: the authorization chain runs under RLS */
 db:Pick<IndustryDb,'isDatasetPublic'|'metricRun'|'metricRunVisible'|'metricRowsOfRun'|'freshness'>;
 /** service role: the manifest bucket is private */
 manifests:Pick<ManifestStore,'get'>;
 /** service role: the same per-group computation a run performs (Task 12 buildCellManifest), no writes */
 recompute:(q:RecomputeQuery)=>Promise<AggregateManifest>;
 now:Date;
}
export interface ReplayDiff{
 members:{added:string[];removed:string[];modified:string[]};unresolved:{added:string[];removed:string[]};facts:{added:string[];removed:string[]};
 stateRevs:{issuerId:string;from:number|null;to:number|null}[];
 cells:{metric:AggMetric;duration:AggDuration;periodStart:string;stored:ManifestCell|null;recomputed:ManifestCell|null}[];
}
export type ReplayResult=
 |{state:'unlicensed';datasetKey:DatasetKey}
 |{state:'unknown_run'}|{state:'unknown_cell'}|{state:'ambiguous_duration'}
 |{state:'ok';mode:'original';header:RunHeader;freshness:FreshnessStatus;cell:PublicCell;manifestHash:string;manifest:AggregateManifest;replay:ManifestCell[];reproduced:boolean}
 |{state:'ok';mode:'recompute';header:RunHeader;freshness:FreshnessStatus;cell:PublicCell;manifestHash:string;result:'match'|'changed';diff:ReplayDiff};

function sameDecimal(a:string,b:string):boolean{try{return canonicalDecimal(a)===canonicalDecimal(b);}catch{return a===b;}}
/** The replayed cell equals the stored row: ok, same decimal value, same three counts. */
export function reproduces(c:ManifestCell|undefined,row:MetricCellRow):boolean{
 return !!c&&c.status==='ok'&&row.status==='ok'&&c.value_text!==undefined&&row.value!==null&&sameDecimal(c.value_text,row.value)&&c.n_members===row.n_members&&c.n_with_data===row.n_with_data&&c.n_unresolved===row.n_unresolved;
}
const sameCell=(c:ManifestCell,metric:AggMetric,duration:AggDuration,periodStart:string)=>c.metric===metric&&c.duration===duration&&c.period_start===periodStart;

/**
 * Spec §9 per-cell filtering: members / unresolved / member_state_revs in full; roles only for the metric and
 * the cell's duration (ManifestRole carries duration); cells only the requested one; facts and derived only the
 * inputs the requested cell actually used: for every included role the exact rows pickInputs selects (metric,
 * duration and periods of THIS cell, so a 2025 annual revenue_sum does not carry the prior-year revenue only
 * YoY needs, and an annual cell carries no quarterly derived rows), plus the facts those derived rows cite.
 */
export function filterManifest(m:AggregateManifest,metric:AggMetric,cell:{duration:AggDuration;period_start:string}):AggregateManifest{
 type F=PoolFact&{src:AggregateManifest['facts'][number]};type D=PoolDerived&{src:AggregateManifest['derived'][number]};
 const facts:F[]=m.facts.map(f=>({issuer_id:f.issuer_id,concept:f.concept,period_start:f.period_start,period_end:f.period_end,duration:f.duration,unit:f.unit,value:f.value_text,src:f}));
 const derivedPool:D[]=m.derived.map(d=>({issuer_id:d.issuer_id,metric:d.metric,period_start:d.period_start,period_end:d.period_end,duration:d.duration,unit:d.unit,value:d.value,src:d}));
 const idx=new InputIndex(facts,derivedPool);
 const roles=m.roles.filter(r=>r.metric===metric&&r.duration===cell.duration);
 const spec=cellSpecs(m.period_end).find(s=>s.metric===metric&&s.duration===cell.duration&&s.period_start===cell.period_start);
 const usedFacts=new Set<AggregateManifest['facts'][number]>(),usedDerived=new Set<AggregateManifest['derived'][number]>();
 if(spec&&metric!=='member_count')for(const r of roles){
  if(r.role!=='included')continue;
  const p=pickInputs(spec,r.issuer_id,idx);
  if(!p.ok)continue;
  for(const f of p.facts)usedFacts.add(f.src);
  for(const d of p.derived)usedDerived.add(d.src);
 }
 const cited=new Set([...usedDerived].flatMap(d=>d.inputs.map(i=>i.fact_id)));
 return {...m,facts:m.facts.filter(f=>usedFacts.has(f)||cited.has(f.fact_id)),derived:m.derived.filter(d=>usedDerived.has(d)),roles,cells:m.cells.filter(c=>sameCell(c,metric,cell.duration,cell.period_start))};
}
function setDiff(a:string[],b:string[]){const A=new Set(a),B=new Set(b);return {added:[...B].filter(x=>!A.has(x)).sort(cmp),removed:[...A].filter(x=>!B.has(x)).sort(cmp)};}
/** Members keyed as before (issuer, window), compared by the complete evidence-bearing record. */
function memberDiff(a:AggregateManifest['members'],b:AggregateManifest['members']){
 const key=(x:AggregateManifest['members'][number])=>`${x.issuer_id}:${x.valid_from}:${x.valid_to??''}:${x.valid_to_available_date??''}`;
 const A=new Map(a.map(x=>[key(x),canonicalJson(x)])),B=new Map(b.map(x=>[key(x),canonicalJson(x)]));
 return {...setDiff([...A.keys()],[...B.keys()]),modified:[...A.keys()].filter(k=>B.has(k)&&A.get(k)!==B.get(k)).sort(cmp)};
}
function sameManifestCell(a:ManifestCell,b:ManifestCell):boolean{
 return a.status===b.status&&(a.missing_reason??null)===(b.missing_reason??null)&&a.n_members===b.n_members&&a.n_with_data===b.n_with_data&&a.n_unresolved===b.n_unresolved&&a.unit===b.unit
  &&((a.value_text===undefined&&b.value_text===undefined)||(a.value_text!==undefined&&b.value_text!==undefined&&sameDecimal(a.value_text,b.value_text)));
}
/** What changed between the frozen manifest and a recompute on current evidence (spec §5.5 'changed'). */
export function manifestDiff(stored:AggregateManifest,now:AggregateManifest):ReplayDiff{
 const unresolvedKey=(x:ManifestUnresolved)=>`${x.ts_code}:${x.in_date}:${x.out_date??''}:${x.source_membership_id}`;
 const revA=new Map(stored.member_state_revs.map(r=>[r.issuer_id,r.state_rev])),revB=new Map(now.member_state_revs.map(r=>[r.issuer_id,r.state_rev]));
 const stateRevs=[...new Set([...revA.keys(),...revB.keys()])].sort(cmp).filter(i=>revA.get(i)!==revB.get(i)).map(i=>({issuerId:i,from:revA.get(i)??null,to:revB.get(i)??null}));
 const cellKey=(c:ManifestCell)=>`${c.metric}:${c.duration}:${c.period_start}`;
 const cellsA=new Map(stored.cells.map(c=>[cellKey(c),c])),cellsB=new Map(now.cells.map(c=>[cellKey(c),c]));
 const cells=[...new Set([...cellsA.keys(),...cellsB.keys()])].sort(cmp).flatMap(k=>{
  const a=cellsA.get(k)??null,b=cellsB.get(k)??null;
  if(a&&b&&sameManifestCell(a,b))return [];
  const ref=(a??b)!;
  return [{metric:ref.metric,duration:ref.duration,periodStart:ref.period_start,stored:a,recomputed:b}];
 });
 return {members:memberDiff(stored.members,now.members),unresolved:setDiff(stored.unresolved.map(unresolvedKey),now.unresolved.map(unresolvedKey)),facts:setDiff(stored.facts.map(f=>f.fact_id),now.facts.map(f=>f.fact_id)),stateRevs,cells};
}
export const isEmptyDiff=(d:ReplayDiff)=>d.members.added.length+d.members.removed.length+d.members.modified.length+d.unresolved.added.length+d.unresolved.removed.length+d.facts.added.length+d.facts.removed.length+d.stateRevs.length+d.cells.length===0;

/** Spec §9 authorization order: dataset public → run visible (active, same scheme/version) → cell exists and is ok; only then the private manifest. */
export async function replayView(deps:ReplayDeps,q:ReplayQuery):Promise<ReplayResult>{
 const datasetKey=schemeDatasetKey(q.scheme,q.version);
 if(!await deps.db.isDatasetPublic(datasetKey))return {state:'unlicensed',datasetKey};
 if(!await deps.db.metricRunVisible(q.runId))return {state:'unknown_run'};
 const run=await deps.db.metricRun(q.runId);
 if(!run||run.scheme!==q.scheme||run.version!==q.version)return {state:'unknown_run'};
 const rows=(await deps.db.metricRowsOfRun(q.runId,{codes:[q.code],metrics:[q.metric],periodEnds:[q.periodEnd],durations:q.duration?[q.duration]:undefined}))
  .filter(r=>r.code===q.code&&r.metric===q.metric&&r.period_end===q.periodEnd&&(q.duration===null||r.duration===q.duration));
 if(rows.length===0)return {state:'unknown_cell'};
 if(rows.length>1)return {state:'ambiguous_duration'};
 const cell=rows[0];
 if(cell.status!=='ok'||cell.manifest_hash===null)return {state:'unknown_cell'};
 const [fresh,stored]=await Promise.all([deps.db.freshness(),deps.manifests.get(cell.manifest_hash)]);
 const base={header:runHeader(run),freshness:effectiveFreshness(fresh,AGG_FRESHNESS[q.scheme],deps.now),cell:publicCell(cell),manifestHash:cell.manifest_hash};
 const original=filterManifest(stored,q.metric,cell);
 if(q.mode==='original'){
  // validate the exact single-cell payload returned, not the full grid
  const rc=replayCell(original,{metric:q.metric,duration:cell.duration,period_start:cell.period_start});
  const replay=rc.cell?[rc.cell]:[];
  return {state:'ok',mode:'original',...base,manifest:original,replay,reproduced:rc.reproduced&&reproduces(rc.cell??undefined,cell)};
 }
 const recomputed=await deps.recompute({scheme:q.scheme,version:q.version,level:run.level,code:q.code,periodEnd:q.periodEnd,factsAsOf:run.facts_as_of,knowledgeDate:run.knowledge_date,historyClass:run.history_class});
 const diff=manifestDiff(original,filterManifest(recomputed,q.metric,cell));
 return {state:'ok',mode:'recompute',...base,result:isEmptyDiff(diff)?'match':'changed',diff};
}

export type ValuationMetric=ValuationCellRow['metric'];
export interface ValuationReplayDeps{
 db:Pick<IndustryDb,'isDatasetPublic'|'publishedValuations'>;
 /** service role read of industry_valuation_pairs: the official value of a 'within' pair, else null */
 officialValue:(q:{runId:string;scheme:Scheme;version:SchemeVersion;code:string;tradeDate:string;metric:ValuationMetric})=>Promise<string|null>;
}
export type ValuationReplayResult=
 |{state:'unlicensed';datasetKey:DatasetKey}|{state:'unknown_cell'}
 |{state:'ok';kind:'valuation';cell:PublicValuation;manifestHash:string|null;replay:'deferred_i3';officialValue?:string};
/**
 * Valuation cells (spec §9): anon publishedValuations already applies industry_valuation_run_visible
 * and `published` (RLS), so a non-published or invisible cell is unknown_cell. officialValue is attached
 * only when the official dataset is public; the manifest replay of valuations is the deferred I-3 work.
 */
export async function valuationReplayView(deps:ValuationReplayDeps,q:{scheme:Scheme;version:SchemeVersion;code:string;runId:string;metric:ValuationMetric;tradeDate:string}):Promise<ValuationReplayResult>{
 const datasetKey=schemeDatasetKey(q.scheme,q.version);
 if(!await deps.db.isDatasetPublic(datasetKey))return {state:'unlicensed',datasetKey};
 const rows=(await deps.db.publishedValuations(q.runId,{codes:[q.code],from:q.tradeDate,to:q.tradeDate}))
  .filter(r=>r.scheme===q.scheme&&r.version===q.version&&r.code===q.code&&r.trade_date===q.tradeDate&&r.metric===q.metric&&r.published&&r.status==='ok'&&r.value!==null);
 if(rows.length!==1)return {state:'unknown_cell'};
 const out={state:'ok' as const,kind:'valuation' as const,cell:publicValuation(rows[0]),manifestHash:rows[0].manifest_hash,replay:'deferred_i3' as const};
 if(!await deps.db.isDatasetPublic(OFFICIAL_DATASET))return out;
 const officialValue=await deps.officialValue({runId:q.runId,scheme:q.scheme,version:q.version,code:q.code,tradeDate:q.tradeDate,metric:q.metric});
 return officialValue===null?out:{...out,officialValue};
}

export interface AdminReplayDeps{db:Pick<IndustryDb,'metricRun'|'metricRowsOfRun'|'unresolvedOf'>;manifests:Pick<ManifestStore,'get'>}
export interface ReplayFocus{cell:PublicCell;manifestHash:string;manifest:AggregateManifest;replay:ManifestCell[];reproduced:boolean}
export type AdminReplayResult=
 |{state:'unknown_run'}|{state:'unknown_cell'}
 |{state:'ok';run:MetricRunRow;cells:(PublicCell&{reproduced:boolean|null})[];manifestHashes:string[];manifest:AggregateManifest|null;replay:ManifestCell[]|null;unresolved:ManifestUnresolved[];focus:ReplayFocus|null};
/** Admin replay (spec §9): any run status, the full manifest, every cell of the (code, period_end) group, the unresolved list. */
export async function adminReplayView(deps:AdminReplayDeps,q:{runId:string;code:string;periodEnd:string;metric:AggMetric|null;duration:AggDuration|null}):Promise<AdminReplayResult>{
 const run=await deps.db.metricRun(q.runId);
 if(!run)return {state:'unknown_run'};
 const rows=(await deps.db.metricRowsOfRun(q.runId,{codes:[q.code],periodEnds:[q.periodEnd]})).filter(r=>r.code===q.code&&r.period_end===q.periodEnd);
 if(rows.length===0)return {state:'unknown_cell'};
 const manifestHashes=[...new Set(rows.map(r=>r.manifest_hash).filter((h):h is string=>h!==null))].sort(cmp);
 const manifest=manifestHashes.length?await deps.manifests.get(manifestHashes[0]):null;   // one manifest per (code, period_end) group (spec §5.3)
 const replay=manifest?replayFromManifest(manifest).cells:null;
 const unresolved=await deps.db.unresolvedOf({code:q.code,level:run.level,on:q.periodEnd,knownBy:run.knowledge_date});
 const cells=rows.map(r=>({...publicCell(r),reproduced:r.status==='ok'&&replay?reproduces(replay.find(c=>sameCell(c,r.metric,r.duration,r.period_start)),r):null}));
 let focus:ReplayFocus|null=null;
 const pick=q.metric?rows.filter(r=>r.metric===q.metric&&(q.duration===null||r.duration===q.duration)):[];
 if(pick.length===1&&pick[0].status==='ok'&&pick[0].manifest_hash&&manifest&&replay){
  const c=pick[0];const fm=filterManifest(manifest,c.metric,c);
  const rc=replayCell(fm,{metric:c.metric,duration:c.duration,period_start:c.period_start});
  focus={cell:publicCell(c),manifestHash:c.manifest_hash!,manifest:fm,replay:rc.cell?[rc.cell]:[],reproduced:rc.reproduced&&reproduces(rc.cell??undefined,c)};
 }
 return {state:'ok',run,cells,manifestHashes,manifest,replay,unresolved,focus};
}
