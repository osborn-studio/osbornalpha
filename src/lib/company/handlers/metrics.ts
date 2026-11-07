// src/lib/company/handlers/metrics.ts
// GET /api/companies/[ticker]/metrics — the page's metrics proxy (spec §5.4, §6.1, §0 #67). Without asOf:
// lineage + stateRevs → metricsOfIssuer → lineage + stateRevs; membership and the complete
// revision vector must stay fixed, and every row's based_on_lineage must equal that vector,
// otherwise (or metrics_unstable) {metrics: [], stale: true} with STALE_CACHE_CONTROL; current rows use
// FRESH_METRICS_CACHE_CONTROL (both from the landed /api/facts/[ticker]/metrics). computedAt of
// materialized rows is selected from financial_metrics (MetricRow lacks it). With asOf: live deriveLineageMetrics
// on one history snapshot (computedAtKind 'live'). Any ineligible input fact withholds the whole row.
import {lineageRevsEqual} from '@/lib/facts/db';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveLineageMetrics,metricNames} from '@/lib/facts/derive';
import {FRESH_METRICS_CACHE_CONTROL,QueryError,STALE_CACHE_CONTROL,dateParam,intParam,listParam,lineageFilings,publicConflict,publicResolution} from '@/lib/facts/public-route';
import {FactsDbError} from '@/lib/facts/types';
import type {FactsDb,FactRow,LineageConflict,MetricDuration,MetricRow} from '@/lib/facts/types';
import {metricKey} from '../metrics-computed-at';
import {buildGated,countWithheld,gateCell,gateFilingOf} from '../route';
import type {Handler} from '../route';
import {derivedCellOf} from '../statements-grid';
import type {DerivedCell,EvidenceDto,FilingSummary,WithheldCell,WithheldCounts} from '../types';

// 计划第 3 轮审计 R5: company-only `periods` (8|20|40) keeps ALL metric rows of the newest N period keys;
// the landed row `limit` applies only when `periods` is absent (it would otherwise eat later metric names).
export const METRICS_PARAMS=['metrics','from','to','asOf','limit','periods'] as const;
const METRIC_PERIOD_CHOICES=new Set(['8','20','40']);
// 计划第 3 轮审计 R6: inputUnit / basis are part of a landed metric's identity; top-level so a withheld cell
// still tells same-period alternatives (USD vs EUR FCF) apart.
export interface MetricDto{metric:string;periodStart:string;periodEnd:string;duration:MetricDuration;inputUnit:string;basis:string;basedOnRev:number;basedOnLineage:MetricRow['based_on_lineage'];computedAt:string|null;computedAtKind:'materialized'|'live';cell:DerivedCell|WithheldCell}
export interface MetricsDto{lineage:string[];resolution:ReturnType<typeof publicResolution>;conflicts:ReturnType<typeof publicConflict>[];issuerId:string;ticker:string;market:'US'|'CN';asOf:string|null;mappingGen:number;formulaVersion:string;truncated:boolean;stale:boolean;metrics:MetricDto[];evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}
export const metricsHandler:Handler=async(ctx)=>{
 const {params:p,issuer,deps,asOf}=ctx;
 const from=dateParam(p,'from'),to=dateParam(p,'to'),limit=intParam(p,'limit',200,1000);
 const periodsRaw=p.get('periods');
 if(periodsRaw!==undefined&&!METRIC_PERIOD_CHOICES.has(periodsRaw))throw new QueryError('periods');
 const names=metricNames(issuer.market);
 const wanted=listParam(p,'metrics',new Set(names),names.length);
 const lineage=await deps.facts.lineageOf(issuer.issuerId);
 let conflicts:LineageConflict[]=[];
 let rows:MetricRow[]=[],truncated=false,stale=false,known:FactRow[]=[],filings:FilingSummary[]=[];
 let computedAt:(m:MetricRow)=>string|null;
 if(!ctx.asOfGiven){
  const before=await deps.facts.stateRevs(lineage,issuer.market);
  try{rows=await deps.facts.metricsOfIssuer(issuer.issuerId,issuer.market,FORMULA_VERSION);
   const env=await deps.facts.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf:ctx.today,limit:1});
   conflicts=env.conflicts;}
  catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
  if(!stale){
   // Match the landed route: membership/revisions are checked even when no rows were read.
   const lineageAfter=await deps.facts.lineageOf(issuer.issuerId);
   const after=await deps.facts.stateRevs(lineageAfter,issuer.market);
   if(lineageAfter.join(',')!==lineage.join(',')||!lineageRevsEqual(before,after)||rows.some(m=>!lineageRevsEqual(m.based_on_lineage,before))){rows=[];conflicts=[];stale=true;}
  }
  const at=rows.length>0?await deps.metricsComputedAt(issuer.issuerId,issuer.market,FORMULA_VERSION):new Map();
  computedAt=m=>{const x=at.get(metricKey(m));return x&&lineageRevsEqual(x.basedOnLineage,m.based_on_lineage)?x.computedAt:null;};
 }else{
  const snap=await deps.facts.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
  truncated=snap.truncated;known=snap.rows;conflicts=snap.conflicts;
  filings=(await lineageFilings(deps.facts as FactsDb,lineage,issuer.market)).map(gateFilingOf);
  rows=truncated?[]:deriveLineageMetrics(snap.rows,issuer.issuerId,lineage,{market:issuer.market,asOf,basedOn:snap.stateRevs});
  const at=ctx.now.toISOString();computedAt=()=>at;
 }
 const set=wanted?new Set(wanted):null;
 rows=rows.filter(m=>(!set||set.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to));
 if(periodsRaw!==undefined){
  // Same column key and order as the UI (metrics-model.ts): periodEnd desc, then key asc; keep every row of those keys.
  const keyOf=(m:MetricRow)=>`${m.period_start}:${m.period_end}:${m.duration}`;
  const cols=new Map<string,string>();for(const m of rows)cols.set(keyOf(m),m.period_end);
  const keep=new Set([...cols.entries()].sort((a,b)=>b[1].localeCompare(a[1])||a[0].localeCompare(b[0])).slice(0,Number(periodsRaw)).map(([k])=>k));
  rows=rows.filter(m=>keep.has(keyOf(m)));
 }else rows=rows.slice(0,limit);
 const g=await buildGated({...ctx,lineage:new Set(lineage)},rows.flatMap(m=>m.inputs.map(i=>i.fact_id)),known,filings);
 const metrics:MetricDto[]=rows.map(m=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,inputUnit:m.input_unit,basis:m.basis,basedOnRev:m.based_on_rev,basedOnLineage:m.based_on_lineage,computedAt:computedAt(m),computedAtKind:ctx.asOfGiven?'live':'materialized',cell:gateCell(derivedCellOf(m),g) as DerivedCell|WithheldCell}));
 const body:MetricsDto={lineage,resolution:publicResolution(issuer),conflicts:conflicts.map(publicConflict),issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:ctx.asOfGiven?asOf:null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,metrics,evidence:g.evidence,withheld:countWithheld(metrics.map(x=>x.cell))};
 const cacheControl=stale?STALE_CACHE_CONTROL:!ctx.asOfGiven&&metrics.length>0?FRESH_METRICS_CACHE_CONTROL:undefined;
 return {body,empty:metrics.length===0||truncated,cacheControl};
};
