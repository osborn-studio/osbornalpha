// src/lib/company/metrics-computed-at.ts
// financial_metrics.computed_at for the materialised rows (spec §0.1 item 3: MetricRow does not carry it;
// anon already has select on financial_metrics). Key = derive.ts row key: metric|period_end|period_start|input_unit|basis.
// Paged to exhaustion (PostgREST max_rows = 1000). Interface request §10.1 #3 / plan 接口请求 4.
import type {SupabaseClient} from '@supabase/supabase-js';
import {lineageRevsFrom} from '@/lib/facts/db';
import type {Market,MetricRow} from '@/lib/facts/types';

export type ComputedAtMap=Map<string,{computedAt:string;basedOnRev:number;basedOnLineage:MetricRow['based_on_lineage']}>;
export const metricKey=(m:Pick<MetricRow,'metric'|'period_end'|'period_start'|'input_unit'|'basis'>)=>`${m.metric}|${m.period_end}|${m.period_start}|${m.input_unit}|${m.basis}`;
const PAGE=1000;
export async function metricsComputedAt(sb:SupabaseClient,issuer:string,market:Market,formulaVersion:string):Promise<ComputedAtMap>{
 const out:ComputedAtMap=new Map();
 for(let from=0;;from+=PAGE){
  const {data,error}=await sb.from('financial_metrics').select('metric,period_start,period_end,input_unit,basis,computed_at,based_on_rev,based_on_lineage')
   .eq('issuer_id',issuer).eq('market',market).eq('formula_version',formulaVersion)
   .order('metric').order('period_end').order('period_start').order('input_unit').order('basis').range(from,from+PAGE-1);
  if(error)throw new Error('metrics_computed_at_failed');
  const rows=(data??[]) as {metric:string;period_start:string;period_end:string;input_unit:string;basis:string;computed_at:string;based_on_rev:number|string;based_on_lineage:unknown}[];
  for(const r of rows)out.set(metricKey(r),{computedAt:r.computed_at,basedOnRev:Number(r.based_on_rev),basedOnLineage:lineageRevsFrom(r.based_on_lineage)});
  if(rows.length<PAGE)return out;
 }
}
