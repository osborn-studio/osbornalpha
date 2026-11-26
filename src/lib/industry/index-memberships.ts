// Latest monthly index_weight snapshot. The RPC plans or applies the entire membership change atomically.
import {callRpc,TableError} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchError} from '../dq/batches';
import {DATASETS,inventoryEntry} from '../dq/datasets';
import {recordAttempt} from '../dq/freshness';
import type {IndustryJobDeps,IndustryJobOptions,RunnerReceipt} from './jobs';
import {defaultTushareCall,fetchPaged,IndustryProviderError,ymdToIso} from './providers/tushare-industry';

const SOURCE='tushare:index_weight';
const FIELDS=['index_code','con_code','trade_date','weight'];
const TICKER=/^[0-9]{6}\.(SH|SZ|BJ)$/;
type MembershipCounts={fetched:number;activated:number;kept:number;deactivated:number;unknown:number};

export const INDEX_UNIVERSES={
 csi300:{indexCode:'000300.SH',min:250,max:350},
 star50:{indexCode:'000688.SH',min:40,max:60},
} as const;
type IndexUniverse=keyof typeof INDEX_UNIVERSES;

async function latestSnapshot(deps:IndustryJobDeps,today:string,universe:IndexUniverse){
 const {indexCode,min,max}=INDEX_UNIVERSES[universe];
 const compact=(iso:string)=>iso.replaceAll('-','');
 const start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-62);
 const params={index_code:indexCode,start_date:compact(start.toISOString().slice(0,10)),end_date:compact(today)};
 const call=deps.tushare??defaultTushareCall({fetch:deps.fetch});
 const pages=await fetchPaged(call,'index_weight',params,FIELDS,(fields,items)=>{
  const date=fields.indexOf('trade_date'),code=fields.indexOf('con_code');
  return items.map(row=>({trade_date:row[date],con_code:row[code]}));
 },{now:deps.now,snapshots:deps.snapshots?{store:deps.snapshots}:undefined});
 const rows=pages.flatMap(p=>p.rows);
 let latest='';
 for(const row of rows){
  const date=row.trade_date;
  if(typeof date!=='string'||!ymdToIso(date))throw new IndustryProviderError('parse_error');
  if(date>latest)latest=date;
 }
 const tickers=new Set<string>();
 for(const row of rows){
  if(row.trade_date!==latest)continue;
  if(typeof row.con_code!=='string'||!TICKER.test(row.con_code))throw new Error('index_bad_code');
  tickers.add(row.con_code);
 }
 if(tickers.size<min||tickers.size>max)throw new Error('index_count_out_of_range');
 return {asOf:ymdToIso(latest)!,tickers:[...tickers]};
}

export async function runIndexMembership(deps:IndustryJobDeps,opts:IndustryJobOptions,universe:IndexUniverse):Promise<RunnerReceipt>{
 const dataset=DATASETS.universe[universe],{cadence,producer}=inventoryEntry(dataset);
 const batchId=opts.dryRun?null:(await startBatch(deps.tables,{dataset,producer,codeVersion:deps.codeVersion!,triggeredBy:opts.triggeredBy})).batchId;
 const batch=emptyCounts(),counts:Record<string,number>={},errors:BatchError[]=[];
 try{
  const {asOf,tickers}=await latestSnapshot(deps,opts.today??deps.now().toISOString().slice(0,10),universe);
  const {fetched,activated,kept,deactivated,unknown}=await callRpc(deps.tables,'apply_index_membership',{
   p_universe:universe,p_as_of:asOf,p_source:SOURCE,p_tickers:tickers,p_dry_run:opts.dryRun,
  }) as MembershipCounts;
  Object.assign(counts,{fetched,activated,kept,deactivated,unknown,as_of:Number(asOf.replaceAll('-',''))});
  // Unknown tickers wait for stocks_universe to catch up; even an all-unknown snapshot has an accounted outcome.
  Object.assign(batch,{fetched,inserted:activated,duplicates:kept,versioned:deactivated,deferred:unknown});
  if(unknown)errors.push({code:'skipped_summary',message:JSON.stringify({unknown_ticker:unknown})});
 }catch(e){
  let code='index_sync_error';
  if(e instanceof IndustryProviderError)code=e.code;
  else if(e instanceof Error&&['index_bad_code','index_count_out_of_range'].includes(e.message))code=e.message;
  else if(e instanceof TableError&&e.code==='22023')code=e.message.includes('stale_index_snapshot')?'stale_index_snapshot':'invalid_index_snapshot';
  errors.push({code});batch.failed=1;
 }
 if(batchId===null)return {batchId,status:batch.failed?'failed':'dry_run',counts,errors};
 const status=await finishBatch(deps.tables,batchId,{counts:batch,errors},deps.now());
 await recordAttempt(deps.tables,dataset,{ok:status==='success',cadence,now:deps.now()});
 return {batchId,status:status==='success'?'success':'failed',counts,errors};
}
