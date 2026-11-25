import type {TableClient} from '../../db/table-client';
import {dateParam,intParam,QueryError,readParams} from '../../facts/public-route';
import {FINANCIAL_METRICS} from '../../vendor/gildata/parse-financials';
import type {VendorIndustryDb} from './db';
import {byIndexCode} from './sw2021-gildata-codes';
import {VENDOR_DATASET_KEYS,type Run,type Retrieval} from './types';
const views={runs:[],classifications:[],memberships:['code'],observations:['code','metric','from','to'],retrievals:['limit']} as const;

function header({run_id,kind,generation,activated_at,parser_version,mapping_version,content_hash,dataset_key}:Run){
 return {run_id,kind,generation,activated_at,parser_version,mapping_version,content_hash,dataset_key,origin:'vendor_reported',history_class:'reconstruction'};
}
function source(r:Retrieval,locator:unknown){
 return {vendor:r.vendor,product:r.product,retrieval_id:r.retrieval_id,sha256:r.sha256,canonical_sha256:r.canonical_sha256,
  api_names:r.api_names_returned,template:{id:r.query_template_id,version:r.query_template_version},fetched_at:r.fetched_at,locator};
}
export async function readVendorAdmin(url:URL,{db,tables}:{db:VendorIndustryDb;tables:TableClient}){
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
 if(view!=='classifications'&&!byIndexCode(code))throw new QueryError('code');
 const metric=params.get('metric');
 if(metric!==undefined&&!FINANCIAL_METRICS.some(m=>m.metric===metric))throw new QueryError('metric');
 const from=dateParam(params,'from'),to=dateParam(params,'to');
 if(from&&to&&from>to)throw new QueryError('to');
 const run=await db.activeRun(view==='memberships'?'memberships':'financials');
 if(!run)return {run:null,rows:[]};
 const rows=view==='classifications'?await db.classificationsOfRun(run.run_id):view==='memberships'?await db.membershipsOfRun(run.run_id,code):
  await db.observationsOfRun(run.run_id,{code,metric,from,to});
 const ids=new Set(rows.flatMap(r=>r.retrieval_id?[r.retrieval_id]:[]));
 const evidence=new Map((await db.retrievalsByIds([...ids])).map(r=>[r.retrieval_id,r]));
 return {run:header(run),rows:rows.map(r=>{
  const retrieval=r.retrieval_id?evidence.get(r.retrieval_id):null;
  if(r.retrieval_id&&!retrieval)throw Error('retrieval_unavailable');
  return {...r,source:retrieval?source(retrieval,'locator' in r?r.locator:null):null};
 })};
}
