// src/lib/industry/csi300.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {sourceByName} from '../sources/catalog';
import {inventoryEntry} from '../dq/datasets';
import {parseSyncArgs,runIndustryJob} from './jobs';
import type {IndustryJobDeps} from './jobs';

const codes=Array.from({length:300},(_,i)=>`${710000+i}.SZ`);
function harness(latest:(string|number|null)[]=codes){
 const tables=memoryTableClient(),rpc=vi.spyOn(tables,'rpc');
 const tushare=vi.fn().mockResolvedValue({fields:['index_code','con_code','trade_date','weight'],
  items:[...latest,latest[0]].map(t=>['000300.SH',t,'20261030',1]).concat([['000300.SH','719999.SH','20260930',1]]),
  has_more:false,raw:new TextEncoder().encode('invented response')});
 const put=vi.fn();
 const counts={fetched:300,activated:55,kept:243,deactivated:3,unknown:2};
 rpc.mockResolvedValue({...counts,as_of:'2026-10-30',unknown_tickers:codes.slice(0,2)});
 const deps={tables,tushare,snapshots:{put},now:()=>new Date('2026-11-25T01:02:03Z'),codeVersion:'test'} as unknown as IndustryJobDeps;
 const run=(dryRun:boolean)=>runIndustryJob('memberships-csi300',deps,{dryRun,triggeredBy:'script'});
 return {tables,tushare,rpc,put,run,counts};
}

describe('memberships-csi300',()=>{
 it('defaults to a preview on the CLI and registers monthly Tushare freshness',()=>{
  expect(parseSyncArgs(['--job','memberships-csi300'])).toMatchObject({ok:true,args:{apply:false}});
  expect(sourceByName('tushare:index_weight')?.id).toBe('tushare');
  expect(inventoryEntry('universe.csi300')).toMatchObject({cadence:'monthly',producer:'memberships-csi300',source:'tushare'});
 });
 it.each([true,false])('sends only distinct latest-date members and exposes counts (dryRun=%s)',async dryRun=>{
  const {tables,tushare,rpc,put,run,counts}=harness();
  const result=await run(dryRun);
  expect(tushare).toHaveBeenCalledWith('index_weight',{index_code:'000300.SH',start_date:'20260924',end_date:'20261125',limit:6000,offset:0},'index_code,con_code,trade_date,weight');
  expect(put).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('apply_csi300_membership',{p_tickers:codes,p_source:'tushare:index_weight',p_as_of:'2026-10-30',p_dry_run:dryRun});
  expect(result).toMatchObject({receipt:{status:dryRun?'dry_run':'success',counts:{...counts,as_of:20261030},errors:[{code:'skipped_summary',message:'{"unknown_ticker":2}'}]}});
  expect(JSON.stringify(result)).not.toContain(codes[0]);
  if(dryRun){
   expect(tables.rows('ingest_batches')).toEqual([]);expect(tables.rows('dq_freshness')).toEqual([]);
  }else{
   expect(tables.rows('ingest_batches')[0]).toMatchObject({dataset:'universe.csi300',producer:'memberships-csi300',status:'success',counts:{fetched:300,inserted:55,duplicates:243,versioned:3}});
   expect(tables.rows('dq_freshness')[0]).toMatchObject({status:'fresh',expected_cadence:'monthly'});
  }
 });
 it.each([[codes.slice(0,249),'csi300_count_out_of_range'],[[...codes.slice(0,-1),'broken'],'csi300_bad_code'],[[...codes.slice(0,-1),712345],'csi300_bad_code']] as const)('rejects invalid latest constituents before the RPC (%#)',async(latest,code)=>{
  const {rpc,run,tables}=harness([...latest]);
  expect(await run(false)).toMatchObject({receipt:{status:'failed',errors:[{code}]}});
  expect(rpc).not.toHaveBeenCalled();expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1});
 });
 it('treats an entirely unknown snapshot as an informational skip',async()=>{
  const {rpc,run}=harness();
  rpc.mockResolvedValue({fetched:300,activated:0,kept:0,deactivated:0,unknown:300,unknown_tickers:codes,as_of:'2026-10-30'});
  expect(await run(false)).toMatchObject({receipt:{status:'success',errors:[{code:'skipped_summary',message:'{"unknown_ticker":300}'}]}});
 });
});
