// Shared orchestration helpers: manifest membership, row mapping, bounded work and dry-run reporting.
import {decCmp,decMul} from './decimal';
import {DISPLAY_MIN_COVERAGE} from './method-constants';
import type {AggregateManifest,ManifestMember,MembershipRow,SourceMembershipRow,StagedMetricCell} from './types';
export function memberOf(row:MembershipRow,src:SourceMembershipRow|undefined):ManifestMember{
 const p=row.provenance;
 return {issuer_id:row.issuer_id,ticker:src?.ts_code??null,valid_from:row.valid_from,valid_to:row.valid_to,available_date:row.available_date,valid_to_available_date:row.valid_to_available_date,
  source_membership_id:row.source_membership_id,raw_hash:typeof p.raw_hash==='string'?p.raw_hash:null,locator:p.locator&&typeof p.locator==='object'?structuredClone(p.locator as Record<string,unknown>):null,resolution_method:src?.resolution.method??null};
}
export const rowOf=(code:string,periodEnd:string,c:AggregateManifest['cells'][number],hash:string|null):StagedMetricCell=>({
 code,metric:c.metric,period_start:c.period_start,period_end:periodEnd,duration:c.duration,status:c.status,missing_reason:c.status==='missing'?c.missing_reason??null:null,
 value:c.status==='ok'?c.value_text??null:null,unit:c.unit,n_members:c.n_members,n_with_data:c.n_with_data,n_unresolved:c.n_unresolved,manifest_hash:c.status==='ok'?hash:null});
export const AGGREGATION_CONCURRENCY=8;
/** Preserve input order; settle in-flight workers before returning an error (no late mutations). */
export async function mapBounded<T,R>(xs:readonly T[],fn:(x:T)=>Promise<R>,limit=AGGREGATION_CONCURRENCY):Promise<R[]>{
 if(!Number.isInteger(limit)||limit<1)throw new Error('invalid_concurrency');
 const out:R[]=new Array(xs.length);let next=0;let failed=false;let error:unknown;
 await Promise.all(Array.from({length:Math.min(limit,xs.length)},async()=>{
  while(!failed){const i=next++;if(i>=xs.length)return;try{out[i]=await fn(xs[i]);}catch(e){failed=true;error=e;}}
 }));
 if(failed)throw error;return out;
}
type SampleValue={value:string|null;n_with_data:number};
export interface AggregationPreview{roleReasons?:Record<string,number>;industriesMinMembers:number;displayableValueCells:number;sample:{code:string;n_members:number;revenue_sum:SampleValue|null;net_margin:SampleValue|null}[]}
export function aggregationPreview(rows:readonly StagedMetricCell[]):AggregationPreview{
 const latest=rows.map(r=>r.period_end).sort().at(-1);
 const codes=[...new Set(rows.map(r=>r.code))];
 const ranked=codes.map(code=>({code,n:Math.max(0,...rows.filter(r=>r.code===code&&r.period_end===latest).map(r=>r.n_members))})).sort((a,b)=>b.n-a.n||a.code.localeCompare(b.code));
 const sample=ranked.slice(0,5).map(({code,n})=>{
  const value=(metric:string):SampleValue|null=>{const r=rows.find(r=>r.code===code&&r.period_end===latest&&r.metric===metric&&r.duration==='12M');return r?{value:r.value,n_with_data:r.n_with_data}:null;};
  return {code,n_members:n,revenue_sum:value('revenue_sum'),net_margin:value('net_margin')};
 });
 return {industriesMinMembers:ranked.filter(x=>x.n>=5).length,displayableValueCells:rows.filter(r=>r.metric!=='member_count'&&r.status==='ok'&&r.n_members>=5&&decCmp(String(r.n_with_data),decMul(DISPLAY_MIN_COVERAGE,String(r.n_members+r.n_unresolved)))>=0).length,sample};
}
