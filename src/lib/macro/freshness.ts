// src/lib/macro/freshness.ts
// Two freshness notions kept apart (spec §4.5, §0.2 M11): release timeliness per series (pure;
// next period end + releaseLagDays + 3 days) and collection status per dataset (shared
// dq_freshness via freshnessOf, recomputed at read time). Also the period arithmetic other macro
// modules share (month ends, previous-quarter lookups).
import {freshnessOf} from '../dq/freshness';
import type {FreshnessStatus} from '../dq/freshness';
import type {TableClient} from '../db/table-client';
import type {MacroSeriesDef,Region,Timeliness} from './types';
import {nextPeriodEnd} from './regime-selection';
export {monthEnd,shiftMonthEnd,nextPeriodEnd} from './regime-selection';

const DAY=86_400_000;
const GRACE_DAYS=3;
const ISO_DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function parseDate(d:string):number{
 if(!ISO_DATE.test(d))throw new Error(`invalid_date:${d}`);
 const t=Date.parse(`${d}T00:00:00Z`);
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==d)throw new Error(`invalid_date:${d}`);
 return t;
}
/** current | late | missing | n/a. Repeated fetches of an old value never make it current: only period_end counts. */
export function releaseTimeliness(def:Pick<MacroSeriesDef,'nativeFrequency'|'period'|'releaseLagDays'>,latestPeriodEnd:string|null,today:string):Timeliness{
 if(def.nativeFrequency==='event'||def.releaseLagDays===undefined)return 'n/a';
 if(latestPeriodEnd===null)return 'missing';
 const deadline=parseDate(nextPeriodEnd(def.period,latestPeriodEnd))+(def.releaseLagDays+GRACE_DAYS)*DAY;
 return parseDate(today)>deadline?'late':'current';
}
export const MACRO_DATASETS=['macro.fred','macro.akshare'] as const;
export type MacroDataset=typeof MACRO_DATASETS[number];
export const datasetOf=(region:Region):MacroDataset=>region==='US'?'macro.fred':'macro.akshare';
export interface CollectionStatus{dataset:MacroDataset;status:FreshnessStatus;lastOkAt:string|null;lastAttemptAt:string|null}
const isoOrNull=(v:unknown):string|null=>{if(v===null||v===undefined)return null;const t=Date.parse(String(v));return Number.isFinite(t)?new Date(t).toISOString():null;};
/** Both macro datasets, status recomputed at `now`; a dataset never recorded reads as missing. */
export async function collectionStatus(tables:TableClient,now=new Date()):Promise<CollectionStatus[]>{
 const rows=await freshnessOf(tables,now);
 return MACRO_DATASETS.map(dataset=>{
  const r=rows.find(x=>x.dataset===dataset);
  return r?{dataset,status:r.status,lastOkAt:isoOrNull(r.last_ok_at),lastAttemptAt:isoOrNull(r.last_attempt_at)}:{dataset,status:'missing' as const,lastOkAt:null,lastAttemptAt:null};
 });
}
