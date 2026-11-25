import type {TableClient} from '../../db/table-client';
import {dateParam,intParam,QueryError,readParams} from '../../facts/public-route';
import type {VendorRawStore} from '../../vendor/raw-store';
import {FINANCIAL_METRICS,replayFinancialCell} from '../../vendor/gildata/parse-financials';
import type {VendorIndustryDb} from './db';
import {byIndexCode} from './sw2021-gildata-codes';
import {VENDOR_DATASET_KEYS,type Run,type Retrieval} from './types';
export class VendorNotFound extends Error{constructor(){super('not_found');}}
const views={grid:['metric','period_end'],replay:['code','metric','duration','period_end'],runs:[],classifications:[],memberships:['code'],observations:['code','metric','from','to'],retrievals:['limit']} as const;

function header({run_id,kind,generation,activated_at,parser_version,mapping_version,content_hash,dataset_key}:Run){
 return {run_id,kind,generation,activated_at,parser_version,mapping_version,content_hash,dataset_key,origin:'vendor_reported',history_class:'reconstruction'};
}
function source(r:Retrieval,locator:unknown){
 return {vendor:r.vendor,product:r.product,interface:r.interface,retrieval_id:r.retrieval_id,sha256:r.sha256,canonical_sha256:r.canonical_sha256,
  api_names:r.api_names_returned,template:{id:r.query_template_id,version:r.query_template_version},fetched_at:r.fetched_at,locator};
}
export async function readVendorAdmin(url:URL,{db,tables,raw}:{db:VendorIndustryDb;tables:TableClient;raw?:VendorRawStore}){
 const rawView=url.searchParams.get('view')??'runs';
 if(!Object.hasOwn(views,rawView))throw new QueryError('view');
 const view=rawView as keyof typeof views,allowed=['view',...views[view]];
 for(const key of url.searchParams.keys())if(!allowed.includes(key))throw new QueryError(key);
 const params=readParams(url,allowed);
 if(view==='runs'){
  const runs=await db.listRuns(undefined,50);
  const licenses=(await Promise.all(['scheme:sw2021:2021',...VENDOR_DATASET_KEYS].map(dataset_key=>tables.select('industry_dataset_licenses',{dataset_key})))).flat();
  return {run:null,rows:runs.map(r=>({...r,...header(r)})),licenses};
 }
 if(view==='retrievals'){
  const rows=await db.listRetrievals(intParam(params,'limit',50,200));
  return {run:null,rows:rows.map(r=>({...r,source:source(r,null)}))};
 }
 const code=params.get('code')??'';
 if(view!=='classifications'&&view!=='grid'&&!byIndexCode(code))throw new QueryError('code');
 const metric=params.get('metric');
 if(metric!==undefined&&!FINANCIAL_METRICS.some(m=>m.metric===metric))throw new QueryError('metric');
 const period=dateParam(params,'period_end'),duration=params.get('duration');
 if(view==='replay'||view==='grid'){
  if(!metric)throw new QueryError('metric');
  if(!period)throw new QueryError('period_end');
 }
 if(view==='replay'&&!['INSTANT','YTD','TTM'].includes(duration??''))throw new QueryError('duration');
 const from=dateParam(params,'from'),to=dateParam(params,'to');
 if(from&&to&&from>to)throw new QueryError('to');
 const run=await db.activeRun(view==='memberships'?'memberships':'financials');
 if(view==='replay'){
  if(!run)throw new VendorNotFound();
  const rows=await db.observationsOfRun(run.run_id,{code,metric,from:period,to:period});
  const row=rows.find(r=>r.duration===duration);
  if(!row)throw new VendorNotFound();
  const [r]=row.retrieval_id?await db.retrievalsByIds([row.retrieval_id]):[];
  if((row.status==='ok'||row.retrieval_id)&&!r)throw Error('retrieval_unavailable');
  const result={run:header(run),observation:{code,metric:row.metric,duration:row.duration,period_end:row.period_end,value_text:row.value_text},
   source:r?source(r,row.locator):null};
  if(row.status==='missing')return {...result,replayed_text:null,match:null};
  if(!raw||!row.locator)throw Error('replay_unavailable');
  const replayed_text=replayFinancialCell(await raw.get(r.vendor,r.sha256),row.locator,row.metric);
  return {...result,replayed_text,match:replayed_text===row.value_text};
 }
 if(!run)return {run:null,rows:[]};
 const rows=view==='grid'?await db.observationsGrid(run.run_id,{metrics:[metric!],periodEnds:[period!]}):view==='classifications'?await db.classificationsOfRun(run.run_id):view==='memberships'?await db.membershipsOfRun(run.run_id,code):
  await db.observationsOfRun(run.run_id,{code,metric,from,to});
 const ids=new Set(rows.flatMap(r=>r.retrieval_id?[r.retrieval_id]:[]));
 const evidence=new Map((await db.retrievalsByIds([...ids])).map(r=>[r.retrieval_id,r]));
 return {run:header(run),rows:rows.map(r=>{
  const retrieval=r.retrieval_id?evidence.get(r.retrieval_id):null;
  if((r.retrieval_id||('status' in r&&r.status==='ok'))&&!retrieval)throw Error('retrieval_unavailable');
  return {...r,source:retrieval?source(retrieval,'locator' in r?r.locator:null):null};
 })};
}
