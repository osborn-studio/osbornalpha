// Pure regime observation selection and input construction. I/O is supplied by callers.
import {regimeInputsOf} from './catalog';
import type {ObsRef,RegimeInput,RegimeSeriesInput} from './regime';
import type {ObservationRow,Region,PeriodKind} from './types';

export class MacroDbError extends Error{constructor(readonly code:'stale_publisher'|'invalid_manifest'|'quota_exceeded'|'not_found'|'truncated'|'already_resolved'|'reject_only'|'fenced'|'quarantine_closed'|'rpc_failed',message?:string){super(message??code);this.name='MacroDbError';}}

const DAY=86_400_000;
const GRACE_DAYS=3;
const ISO_DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function parseDate(d:string):number{
 if(!ISO_DATE.test(d))throw new Error(`invalid_date:${d}`);
 const t=Date.parse(`${d}T00:00:00Z`);
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==d)throw new Error(`invalid_date:${d}`);
 return t;
}
const iso=(t:number)=>new Date(t).toISOString().slice(0,10);
/** Last day of month `month1` (1–12). */
export const monthEnd=(year:number,month1:number):string=>iso(Date.UTC(year,month1,0));
/** Month end `months` calendar months away from the month containing `periodEnd` (negative = earlier). */
export function shiftMonthEnd(periodEnd:string,months:number):string{
 parseDate(periodEnd);
 const idx=Number(periodEnd.slice(0,4))*12+Number(periodEnd.slice(5,7))-1+months;
 return monthEnd(Math.floor(idx/12),(idx%12)+1);
}
export function nextPeriodEnd(period:PeriodKind,periodEnd:string):string{
 if(period==='day')return iso(parseDate(periodEnd)+DAY);
 return shiftMonthEnd(periodEnd,period==='month'?1:3);
}

export async function selectEligibleHistoryAsOf(candidates:ObservationRow[],cutoff:string,maxRows:number,
 loadRows:(ids:string[])=>Promise<ObservationRow[]>,loadBatches:(ids:string[])=>Promise<Record<string,{status:string;finished_at:string|null}>>):Promise<ObservationRow[]>{
 if(!Number.isInteger(maxRows)||maxRows<1)throw new MacroDbError('rpc_failed','invalid_max_rows');
 const cutoffMs=Date.parse(cutoff);if(!Number.isFinite(cutoffMs))throw new Error('historical_cutoff_unsupported');
 const found=new Map(candidates.map(r=>[r.observation_id,r]));let pending=[...new Set(candidates.flatMap(r=>r.derived_from??[]))];
 for(let depth=1;pending.length;depth++){
  if(depth>8)throw new MacroDbError('rpc_failed','ancestry_too_deep');
  pending=pending.filter(id=>!found.has(id));if(!pending.length)break;
  const got=await loadRows(pending);const loaded=new Set(got.map(r=>r.observation_id));
  if(pending.some(id=>!loaded.has(id)))throw new Error('historical_cutoff_unsupported');
  for(const row of got)found.set(row.observation_id,row);
  pending=[...new Set(got.flatMap(r=>r.derived_from??[]))];
 }
 for(const row of found.values())if(!Number.isFinite(Date.parse(row.available_at)))throw new Error('historical_cutoff_unsupported');
 const batches=await loadBatches([...new Set([...found.values()].map(r=>r.batch_id))]);
 const eligible=(r:ObservationRow,depth=0):boolean=>{
  if(depth>8)throw new MacroDbError('rpc_failed','ancestry_too_deep');
  if(r.status!=='ok'||Date.parse(r.available_at)>cutoffMs)return false;
  const b=batches[r.batch_id];if(b&&!['success','partial'].includes(b.status))return false;
  if(!b?.finished_at||!Number.isFinite(Date.parse(b.finished_at)))throw new Error('historical_cutoff_unsupported');
  if(Date.parse(b.finished_at)>cutoffMs)return false;
  return (r.derived_from??[]).every(id=>eligible(found.get(id)!,depth+1));
 };
 const byPeriod=new Map<string,ObservationRow>();
 for(const r of [...candidates].sort((a,b)=>b.version-a.version))if(!byPeriod.has(r.period_end)&&eligible(r))byPeriod.set(r.period_end,r);
 if(byPeriod.size>maxRows)throw new MacroDbError('truncated',`eligible_history_asof:>${maxRows}`);
 return [...byPeriod.values()].sort((a,b)=>a.period_end.localeCompare(b.period_end));
}

/** Frozen manifest and display history built from eligible observations. */
export interface BuiltRegimeInput{input:RegimeInput;observations:ObservationRow[];historyIds:string[]}
export const HISTORY_MONTHS=24;
export const SPARK_POINTS=24;
const ref=(r:ObservationRow):ObsRef=>({observation_id:r.observation_id,period_end:r.period_end,value_text:r.value_text});
export interface RegimeLoaders{
 latestEligible:(ids:string[],opts:{asOf?:string;periodEndLte?:string})=>Promise<ObservationRow[]>;
 eligibleHistory:(id:string,opts:{from?:string;to?:string;asOf?:string;maxRows:number})=>Promise<ObservationRow[]>;
 eligibleHistoryAsOf:(id:string,opts:{to:string;asOf:string;maxRows:number})=>Promise<ObservationRow[]>;
}
export async function buildRegimeInputFromRows(region:Region,opts:{asOf?:string;periodEndLte?:string}={},loaders:RegimeLoaders):Promise<BuiltRegimeInput>{
 const defs=regimeInputsOf(region).filter(d=>d.region===region);
 const histories=opts.asOf?await Promise.all(defs.map(d=>loaders.eligibleHistoryAsOf(d.id,{to:opts.periodEndLte??'9999-12-31',asOf:opts.asOf!,maxRows:10000}))):null;
 const latest=histories?histories.flatMap(h=>h.length?[h[h.length-1]]:[]):await loaders.latestEligible(defs.map(d=>d.id),{asOf:opts.asOf,periodEndLte:opts.periodEndLte});
 const series:Record<string,RegimeSeriesInput>={};
 const used=new Map<string,ObservationRow>();
 const historyIds:string[]=[];
 for(const row of latest){
  const def=defs.find(d=>d.id===row.series_id);
  if(!def)continue;
  const span=def.period==='quarter'?3*SPARK_POINTS:SPARK_POINTS;   // months covering SPARK_POINTS periods
  const all=histories?histories[defs.indexOf(def)].filter(h=>h.period_end>=shiftMonthEnd(row.period_end,-span)):await loaders.eligibleHistory(row.series_id,{from:shiftMonthEnd(row.period_end,-span),to:row.period_end,asOf:opts.asOf,maxRows:4*SPARK_POINTS});
  historyIds.push(...all.slice(-SPARK_POINTS).map(h=>h.observation_id));
  const windowStart=shiftMonthEnd(row.period_end,-HISTORY_MONTHS);
  const earlier=all.filter(h=>h.period_end<row.period_end&&h.period_end>=windowStart);   // ascending by contract
  const prev=earlier.at(-1);
  const target3m=shiftMonthEnd(row.period_end,-3);
  const prev3m=earlier.find(h=>h.period_end===target3m);
  const s:RegimeSeriesInput={latest:ref(row)};used.set(row.observation_id,row);
  if(prev){s.prev=ref(prev);used.set(prev.observation_id,prev);}
  if(prev3m){s.prev3m=ref(prev3m);used.set(prev3m.observation_id,prev3m);}
  series[row.series_id]=s;
 }
 return {input:{region,series},observations:[...used.values()],historyIds:[...new Set(historyIds)]};
}

export async function verifyHistoricalBatches(built:BuiltRegimeInput,cutoff:string,loadRows:(ids:string[])=>Promise<ObservationRow[]>,loadBatches:(ids:string[])=>Promise<Record<string,string|null>>):Promise<void>{
 const cutoffMs=Date.parse(cutoff);if(!Number.isFinite(cutoffMs))throw new Error('historical_cutoff_unsupported');
 const seen=new Map<string,ObservationRow>();
 let pending=[...new Set([...built.observations.map(r=>r.observation_id),...built.historyIds])];
 while(pending.length){
  const rows=await loadRows(pending);const loaded=new Set(rows.map(r=>r.observation_id));
  if(pending.some(id=>!loaded.has(id)))throw new Error('historical_cutoff_unsupported');
  pending=[];
  for(const row of rows){seen.set(row.observation_id,row);for(const id of row.derived_from??[])if(!seen.has(id))pending.push(id);}
  pending=[...new Set(pending)];
 }
 const times=await loadBatches([...new Set([...seen.values()].map(r=>r.batch_id))]);
 for(const row of seen.values()){
  const available=Date.parse(row.available_at),finished=times[row.batch_id];
  if(!Number.isFinite(available)||available>cutoffMs||!finished||!Number.isFinite(Date.parse(finished))||Date.parse(finished)>cutoffMs)throw new Error('historical_cutoff_unsupported');
 }
}
