// src/components/company/metrics-model.ts
// Pure model of the metrics view (plan 2026-11-06 Task 13; spec §5.4).
import type {MetricEntry,MetricsResponse} from '@/lib/company/client';
import {formatValue,unitKindOfUnit} from './format';

export interface MetricCol{key:string;periodStart:string;periodEnd:string;duration:string}
/** One grid row = one landed metric identity (metric, inputUnit, basis); `alt` numbers a metric's rows (计划第 3 轮审计 R6). */
export interface MetricGridRow{id:string;metric:string;inputUnit:string|null;basis:string|null;alt:number;cells:Record<string,MetricEntry>}
export const metricKey=(e:{periodStart:string;periodEnd:string;duration:string})=>`${e.periodStart}:${e.periodEnd}:${e.duration}`;
const rowIdOf=(e:{metric:string;inputUnit:string;basis:string})=>JSON.stringify([e.metric,e.inputUnit,e.basis]);
export function metricsGrid(r:MetricsResponse,names:readonly string[],periods:number):{cols:MetricCol[];rows:MetricGridRow[]}{
 const cols=new Map<string,MetricCol>();
 for(const e of r.metrics)cols.set(metricKey(e),{key:metricKey(e),periodStart:e.periodStart,periodEnd:e.periodEnd,duration:e.duration});
 const ordered=[...cols.values()].sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd)||a.key.localeCompare(b.key)).slice(0,periods);
 const keep=new Set(ordered.map(c=>c.key));
 const extras=[...new Set(r.metrics.map(e=>e.metric))].filter(m=>!names.includes(m)).sort();
 // Group by (metric, inputUnit, basis): same-period alternatives in different currencies never overwrite each other.
 const groups=new Map<string,MetricGridRow>();
 for(const e of r.metrics){
  const id=rowIdOf(e);
  const g=groups.get(id)??{id,metric:e.metric,inputUnit:e.inputUnit,basis:e.basis,alt:0,cells:{}};
  if(keep.has(metricKey(e)))g.cells[metricKey(e)]=e;
  groups.set(id,g);
 }
 const rows:MetricGridRow[]=[];
 for(const metric of [...names,...extras]){
  const mine=[...groups.values()].filter(g=>g.metric===metric).sort((a,b)=>(a.inputUnit??'').localeCompare(b.inputUnit??'')||(a.basis??'').localeCompare(b.basis??''));
  if(mine.length===0)rows.push({id:JSON.stringify([metric,null,null]),metric,inputUnit:null,basis:null,alt:0,cells:{}});
  else mine.forEach((g,i)=>rows.push({...g,alt:i}));
 }
 return {cols:ordered,rows};
}
export function metricText(e:MetricEntry,scaleExp:number):string|null{
 if(e.cell.kind!=='derived')return null;
 return formatValue(e.cell.value,e.cell.unit==='pure'?'ratio':unitKindOfUnit(e.cell.unit),scaleExp);
}
export const basedOnRevOf=(r:MetricsResponse)=>r.metrics[0]?.basedOnRev??null;
