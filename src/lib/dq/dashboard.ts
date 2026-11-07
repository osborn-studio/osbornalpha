// View-model helpers for the /admin/dq dashboard. loadDqDashboard does the reads over a
// TableClient (stubbable in tests); the rest is pure shaping and query validation.
import type {Row,TableClient} from '../db/table-client';
import {DQ_DATASET_INVENTORY} from './datasets';
import type {Market} from '../facts/types';
import {freshnessOf} from './freshness';
import {loadCalendarBlock,loadClaimsBlock,loadReconciliationsByPair} from './dashboard-blocks';
import type {CalendarBlock,ClaimsBlock,ReconciliationsByPair} from './dashboard-blocks';
import type {InputsHashNow} from './facts-resolver';

export interface DqSummaryInput{
 batches:{dataset:string;status:string}[];
 freshness:{dataset:string;status:string;stored_status:string}[];
 /** Real total from count(), never the length of a page. */
 openQuarantineTotal:number;
 failedReconciliationsTotal:number;
}
export interface DqNotFresh{dataset:string;status:string;stored_status:string;drifted:boolean}
export interface DqSummary{
 batchesByStatus:Record<string,number>;
 freshnessTotal:number;
 notFresh:DqNotFresh[];
 notFreshByStatus:{stale:number;missing:number;error:number};
 openQuarantineTotal:number;
 failedReconciliationsTotal:number;
}

export function summarizeDq(input:DqSummaryInput):DqSummary{
 const batchesByStatus:Record<string,number>={};
 for(const b of input.batches)batchesByStatus[b.status]=(batchesByStatus[b.status]??0)+1;
 const notFreshByStatus={stale:0,missing:0,error:0};
 const notFresh:DqNotFresh[]=[];
 for(const f of input.freshness){
  if(f.status==='fresh')continue;
  notFresh.push({dataset:f.dataset,status:f.status,stored_status:f.stored_status,drifted:f.status!==f.stored_status});
  if(f.status==='stale'||f.status==='missing'||f.status==='error')notFreshByStatus[f.status]++;
 }
 return {
  batchesByStatus,freshnessTotal:input.freshness.length,notFresh,notFreshByStatus,
  openQuarantineTotal:input.openQuarantineTotal,failedReconciliationsTotal:input.failedReconciliationsTotal,
 };
}

/** Writer clocks may run slightly ahead of ours; rows up to this far in the future still count. */
export const CLOCK_SKEW_MS=60_000;

/** Rows whose `field` timestamp is within `ms` before `now` (+ CLOCK_SKEW_MS ahead); unparseable timestamps are excluded. */
export function within<T extends Record<string,unknown>>(rows:T[],field:string,now:Date,ms:number):T[]{
 const from=now.getTime()-ms,to=now.getTime()+CLOCK_SKEW_MS;
 return rows.filter(r=>{const t=Date.parse(String(r[field]??''));return Number.isFinite(t)&&t>=from&&t<=to;});
}

export const DQ_DEFAULT_PAGE_SIZE=50;
export const DQ_MAX_PAGE_SIZE=200;
// Used only as an equality filter (parameterised by PostgREST); the DB enforces length 1..64.
const DATASET_RE=/^[^\x00-\x1f\x7f]{1,64}$/u;
export type DqQuery={dataset?:string;page:number;pageSize:number;market?:Market};

const positiveInt=(raw:string|null,fallback:number):number|null=>{
 if(raw===null)return fallback;
 if(!/^[1-9][0-9]{0,6}$/.test(raw))return null;
 return Number(raw);
};

/** Validates dashboard query params; returns an error code instead of throwing. */
export function parseDqQuery(params:URLSearchParams):{ok:true;query:DqQuery}|{ok:false;error:string}{
 const page=positiveInt(params.get('page'),1);
 if(page===null)return {ok:false,error:'invalid_page'};
 const pageSize=positiveInt(params.get('pageSize'),DQ_DEFAULT_PAGE_SIZE);
 if(pageSize===null||pageSize>DQ_MAX_PAGE_SIZE)return {ok:false,error:'invalid_page_size'};
 const rawDataset=params.get('dataset');
 if(rawDataset!==null&&rawDataset!==''&&!DATASET_RE.test(rawDataset))return {ok:false,error:'invalid_dataset'};
 const markets=params.getAll('market');
 const rawMarket=markets[0]??null;
 if(markets.length>1||(rawMarket!==null&&rawMarket!==''&&rawMarket!=='US'&&rawMarket!=='CN'))return {ok:false,error:'invalid_market'};
 const market=rawMarket==='US'||rawMarket==='CN'?rawMarket:undefined;
 return {ok:true,query:{dataset:rawDataset?rawDataset:undefined,page,pageSize,...(market?{market}:{})}};
}

export const DQ_RECENT_BATCHES=50;
export const DQ_RECENT_RECONCILIATIONS=50;
const DAY_MS=86_400_000;

export interface DqDashboard{
 summary:DqSummary;
 batches24hTruncated:boolean;
 batches:Row[];
 freshness:Awaited<ReturnType<typeof freshnessOf>>;
 quarantine:{rows:Row[];page:number;pageSize:number;total:number};
 reconciliations:Row[];
 calendar:CalendarBlock;
 claims:ClaimsBlock;
 reconciliationsByPair:ReconciliationsByPair;
 /** Dataset filter options: the registry plus every dataset this response loaded (spec 3 §6.3, E9). */
 datasets:string[];
 refreshedAt:string;
}

/** Registry datasets ∪ loaded ones ∪ the current selection, unique and sorted (non-strings and '' are ignored). */
export function dashboardDatasets(loaded:Iterable<unknown>,selected?:string):string[]{
 const out=new Set<string>(DQ_DATASET_INVENTORY.map(e=>e.dataset));
 for(const d of loaded)if(typeof d==='string'&&d!=='')out.add(d);
 if(selected)out.add(selected);
 return [...out].sort();
}

/** Server-side restore eligibility of a reconcile_mismatch item (spec §7.2): passing latest_result AND its inputs_hash equals the CURRENT inputs hash (same function as the restore route; an {unavailable} answer is never equal → false). */
export async function restorableOf(row:Row,hashNow?:InputsHashNow):Promise<boolean>{
 const latest=((row.detail??{}) as {latest_result?:{passed?:unknown;inputs_hash?:unknown}}).latest_result;
 if(!hashNow||latest?.passed!==true||typeof latest.inputs_hash!=='string')return false;
 try{return (await hashNow(row))===latest.inputs_hash;}catch{return false;}
}

/**
 * All dashboard reads. The open-quarantine KPI is a global count; the pager total is a
 * separate count filtered by the selected dataset, so filtering never changes the KPI.
 */
export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date,opts:{inputsHashNow?:InputsHashNow}={}):Promise<DqDashboard>{
 const {dataset,page,pageSize,market}=query;
 const openMatch:Row={status:'open'};
 const pageMatch:Row=dataset?{status:'open',dataset}:openMatch;
 const [batches,freshness,openQuarantineTotal,quarantineTotal,quarantineRows,failedReconciliationsTotal,reconciliations]=
  await Promise.all([
   client.select('ingest_batches',{},{orderBy:'started_at',desc:true,limit:DQ_RECENT_BATCHES}),
   freshnessOf(client,now),
   client.count('dq_quarantine',openMatch),
   dataset?client.count('dq_quarantine',pageMatch):null,
   client.select('dq_quarantine',pageMatch,{orderBy:'created_at',desc:true,limit:pageSize,offset:(page-1)*pageSize}),
   client.count('dq_reconciliations',{passed:false}),
   client.select('dq_reconciliations',{passed:false},{orderBy:'created_at',desc:true,limit:DQ_RECENT_RECONCILIATIONS}),
  ]);
 const [calendar,claims,reconciliationsByPair]=await Promise.all([loadCalendarBlock(client,market,now),loadClaimsBlock(client),loadReconciliationsByPair(client)]);
 const batches24h=within(batches,'started_at',now,DAY_MS);
 const summary=summarizeDq({
  batches:batches24h.map(b=>({dataset:String(b.dataset),status:String(b.status)})),
  freshness:freshness.map(f=>({dataset:String(f.dataset),status:f.status,stored_status:f.stored_status})),
  openQuarantineTotal,
  failedReconciliationsTotal,
 });
 return {
  summary,
  // The 24h tile is derived from the latest DQ_RECENT_BATCHES rows; if all of them fall in
  // the window there may be more, and the client shows the count as a lower bound.
  batches24hTruncated:batches.length===DQ_RECENT_BATCHES&&batches24h.length===DQ_RECENT_BATCHES,
  batches,
  freshness,
  quarantine:{rows:await Promise.all(quarantineRows.map(async r=>r.reason_code==='reconcile_mismatch'?{...r,restorable:await restorableOf(r,opts.inputsHashNow)}:r)),page,pageSize,total:quarantineTotal??openQuarantineTotal},
  reconciliations,
  calendar,claims,reconciliationsByPair,
  datasets:dashboardDatasets([...batches,...freshness,...quarantineRows].map(r=>r.dataset),dataset),
  refreshedAt:now.toISOString(),
 };
}
