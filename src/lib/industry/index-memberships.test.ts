import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {sourceByName} from '../sources/catalog';
import {inventoryEntry} from '../dq/datasets';
import {parseSyncArgs,runIndustryJob} from './jobs';
import type {IndustryJobDeps} from './jobs';

const codes=Array.from({length:300},(_,i)=>`${710000+i}.SZ`);
const starCodes=codes.slice(0,50);
function harness(csi:(string|number)[]=codes,star:(string|number)[]=starCodes){
 const tables=memoryTableClient(),rpc=vi.spyOn(tables,'rpc');
 const tushare=vi.fn(async(_api:string,{index_code}:{index_code:string})=>{
  const latest=index_code==='000300.SH'?csi:star;
  return {fields:['index_code','con_code','trade_date','weight'],
   items:[...latest,latest[0]].map(t=>[index_code,t,'20261030',1]).concat([[index_code,'719999.SH','20260930',1]]),
   has_more:false,raw:new TextEncoder().encode('invented response')};
 });
 const put=vi.fn();
 const counts={fetched:300,activated:55,kept:243,deactivated:3,unknown:2};
 rpc.mockImplementation(async(_name,args)=>args.p_universe==='csi300'?{...counts,unknown_tickers:codes.slice(0,2)}:
  {fetched:50,activated:50,kept:0,deactivated:0,unknown:0});
 const deps={tables,tushare,snapshots:{put},now:()=>new Date('2026-11-25T01:02:03Z'),codeVersion:'test'} as unknown as IndustryJobDeps;
 const run=(dryRun:boolean)=>runIndustryJob('memberships-index',deps,{dryRun,triggeredBy:'script'});
 return {tables,tushare,rpc,put,run};
}

describe('memberships-index',()=>{
 it('defaults to a preview on the CLI and registers monthly Tushare freshness',()=>{
  expect(parseSyncArgs(['--job','memberships-index'])).toMatchObject({ok:true,args:{apply:false}});
  expect(sourceByName('tushare:index_weight')?.id).toBe('tushare');
  for(const dataset of ['universe.csi300','universe.star50'])
   expect(inventoryEntry(dataset)).toMatchObject({cadence:'monthly',producer:'memberships-index',source:'tushare'});
 });
 it.each([true,false])('sends distinct latest-date members in order and accounts for each index (dryRun=%s)',async dryRun=>{
  const {tables,tushare,rpc,put,run}=harness();
  const result=await run(dryRun);
  for(const [i,universe,index_code,tickers] of [[1,'csi300','000300.SH',codes],[2,'star50','000688.SH',starCodes]] as const){
   expect(tushare).toHaveBeenNthCalledWith(i,'index_weight',{index_code,start_date:'20260924',end_date:'20261125',limit:6000,offset:0},'index_code,con_code,trade_date,weight');
   expect(rpc).toHaveBeenNthCalledWith(i,'apply_index_membership',{p_universe:universe,p_tickers:tickers,p_source:'tushare:index_weight',p_as_of:'2026-10-30',p_dry_run:dryRun});
  }
  expect(put).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({receipt:{status:dryRun?'dry_run':'success',counts:{'csi300.fetched':300,'star50.fetched':50,'star50.unknown':0,'csi300.unknown':2,'csi300.as_of':20261030},errors:[{key:'csi300',code:'skipped_summary',message:'{"unknown_ticker":2}'}]}});
  expect(JSON.stringify(result)).not.toContain(codes[0]);
  if(dryRun){
   expect(tables.rows('ingest_batches')).toEqual([]);expect(tables.rows('dq_freshness')).toEqual([]);
  }else{
   expect(tables.rows('ingest_batches')).toMatchObject([
    {dataset:'universe.csi300',producer:'memberships-index',status:'success',counts:{inserted:55,duplicates:243,versioned:3}},
    {dataset:'universe.star50',producer:'memberships-index',status:'success',counts:{inserted:50}},
   ]);
   expect(tables.rows('dq_freshness')).toMatchObject(['csi300','star50'].map(u=>({dataset:`universe.${u}`,status:'fresh',expected_cadence:'monthly'})));
  }
 });
 it.each([
  [codes.slice(0,249),starCodes,'csi300','index_count_out_of_range'],
  [[...codes.slice(0,-1),'broken'],starCodes,'csi300','index_bad_code'],
  [codes,[...starCodes.slice(0,-1),712345],'star50','index_bad_code'],
  [codes,codes.slice(0,61),'star50','index_count_out_of_range'],
 ] as const)('isolates an invalid snapshot to one dataset (%#)',async(csi,star,universe,code)=>{
  const {rpc,run,tables}=harness([...csi],[...star]);
  const result=await run(false);
  expect(result).toMatchObject({receipt:{status:'failed',errors:expect.arrayContaining([{key:universe,code}])}});
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(tables.rows('dq_freshness')).toContainEqual(expect.objectContaining({dataset:`universe.${universe}`,consecutive_errors:1}));
 });
 it('treats an entirely unknown snapshot as an informational skip',async()=>{
  const {rpc,run}=harness();
  rpc.mockResolvedValueOnce({fetched:300,activated:0,kept:0,deactivated:0,unknown:300,unknown_tickers:codes});
  expect(await run(false)).toMatchObject({receipt:{status:'success',errors:[{key:'csi300',code:'skipped_summary',message:'{"unknown_ticker":300}'}]}});
 });
});
