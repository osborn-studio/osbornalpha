import {seriesById} from '@/lib/macro/series-registry';
import type {SeriesJson,SeriesObsJson} from './view-model';
export const FED_DISPLAY_IDS=['US_WALCL','US_RRPONTSYD','US_WTREGEN'] as const;
export interface DisplayLoad {data?:SeriesJson;error?:string}
export interface DisplayRow {id:string;name:string;unit:string;weight:0;latest:SeriesObsJson|null;observations:SeriesObsJson[];error?:string}
/** Separate display model: never assignable to a scored WeightedRow. */
export function displaySeriesRows(region:'US'|'CN',loads:Readonly<Record<string,DisplayLoad>>,locale:'zh'|'en'):DisplayRow[] {
 if(region!=='US')return [];
 return FED_DISPLAY_IDS.map(id=>{
  const def=seriesById(id)!;
  const observations=loads[id]?.data?.observations??[];
  const latest=[...observations].sort((a,b)=>a.period_end.localeCompare(b.period_end)).at(-1)??null;
  return {id,name:def.name[locale],unit:def.unit,weight:0,latest,observations,error:loads[id]?.error};
 });
}
