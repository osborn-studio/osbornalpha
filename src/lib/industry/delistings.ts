// src/lib/industry/delistings.ts
// Delisting dates (spec 7th draft K4): stock_basic(list_status 'D') pages → industry_security_delistings rows through
// IndustryDb.upsertDelistings (load-a-share and the membership resolver both call this; the first write of a date wins its
// evidence, a changed date updates the row and is quarantined `delist_date_changed`).
// A 'D' row without a usable delist_date is NOT "no delisting": its ts_code is reported in `missing` so callers can withhold
// membership windows for it and report incomplete coverage.
import type {BatchError} from '../dq/batches';
import {quarantine} from '../dq/quarantine';
import {errorMessage} from '../entities/load-sec';
import type {DelistingInput,IndustryDeps} from './types';
import type {StockBasicRow,TusharePage} from './providers/tushare-industry';
import {ymdToIso} from './providers/tushare-industry';

export interface DelistingScan{inputs:DelistingInput[];missing:string[]}

/** Pure: delisted rows of stock_basic pages (any page; non-'D' rows are ignored). First row per ts_code wins. */
export function scanDelistings(pages:TusharePage<StockBasicRow>[]):DelistingScan{
 const out:DelistingScan={inputs:[],missing:[]};const seen=new Set<string>();
 for(const p of pages)for(const r of p.rows){
  if(r.list_status!=='D')continue;
  const ts=(r.ts_code??'').trim().toUpperCase();
  if(!ts||seen.has(ts))continue;
  seen.add(ts);
  const d=ymdToIso(r.delist_date);
  if(typeof d==='string')out.inputs.push({ts_code:ts,delist_date:d,list_status:'D',observed_at:p.fetched_at,raw_hash:p.raw_hash});
  else out.missing.push(ts);
 }
 return out;
}

/**
 * Persists the scan. Never throws: a write failure becomes a non-info `delisting_write_error`; each changed date a
 * `delist_date_changed` error + quarantine item (a quarantine failure adds `quarantine_error`). Returns false when the
 * rows could not be written.
 */
export async function persistDelistings(deps:Pick<IndustryDeps,'tables'|'db'>,batchId:string,dataset:string,scan:DelistingScan,errors:BatchError[]):Promise<boolean>{
 if(scan.inputs.length===0)return true;
 try{
  const res=await deps.db.upsertDelistings(batchId,scan.inputs);
  for(const c of res.changed){
   errors.push({code:'delist_date_changed',key:c.ts_code});
   try{
    await quarantine(deps.tables,{dataset,table:'industry_security_delistings',naturalKey:`stock_basic:${c.ts_code}`,reasonCode:'delist_date_changed',
     detail:{old_date:c.old_date,new_date:c.new_date},payload:{ts_code:c.ts_code,old_date:c.old_date,new_date:c.new_date},batchId});
   }catch(e){errors.push({code:'quarantine_error',key:c.ts_code,message:errorMessage(e)});}
  }
  return true;
 }catch(e){
  errors.push({code:'delisting_write_error',message:errorMessage(e)});
  return false;
 }
}
