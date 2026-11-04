// Pure view-model helpers for the /admin/dq dashboard. The API route does the reads; this
// module only shapes them so the counting and query validation stay unit-testable.

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

/** Rows whose `field` timestamp is within `ms` before `now`; unparseable timestamps are excluded. */
export function within<T extends Record<string,unknown>>(rows:T[],field:string,now:Date,ms:number):T[]{
 const from=now.getTime()-ms;
 return rows.filter(r=>{const t=Date.parse(String(r[field]??''));return Number.isFinite(t)&&t>=from&&t<=now.getTime();});
}

export const DQ_DEFAULT_PAGE_SIZE=50;
export const DQ_MAX_PAGE_SIZE=200;
const DATASET_RE=/^[a-z0-9._-]{1,64}$/;
export type DqQuery={dataset?:string;page:number;pageSize:number};

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
 return {ok:true,query:{dataset:rawDataset?rawDataset:undefined,page,pageSize}};
}
