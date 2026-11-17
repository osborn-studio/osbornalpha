// Compact, anon/RLS history transport. Column order is shared with macro_strategy_histories SQL.
import type {SupabaseClient} from '@supabase/supabase-js';
import {MacroDbError,observationFromRow} from '../db';
import type {ObservationRow} from './contract';

export interface HistoryResult{series_id:string;raw_count:number;rows:ObservationRow[]}
export interface HistoryBounds{asOf:string;from?:string;to?:string}
export type HistoriesReader=(series:string[],bounds:HistoryBounds)=>Promise<HistoryResult[]>;
const columns=['observation_id','period_end','value_text','version','available_at','ingested_at','retrieval_id','derived_from','transform'] as const;
export function strategyHistoriesReader(client:SupabaseClient):HistoriesReader{
 return async(series,{asOf,from,to})=>{
  const {data,error}=await client.rpc('macro_strategy_histories',{p_series:series,p_as_of:asOf,p_from:from??null,p_to:to??null});
  if(error)throw error;
  if(!Array.isArray(data))throw new MacroDbError('rpc_failed','incomplete_series_history');
  return data.map((r:{series_id:string;raw_count:number;rows:unknown[][]})=>{
   if(!Number.isSafeInteger(r.raw_count)||r.raw_count<0||!Array.isArray(r.rows))throw new MacroDbError('rpc_failed','incomplete_series_history');
   return {series_id:r.series_id,raw_count:r.raw_count,rows:r.rows.map(values=>{
    if(!Array.isArray(values)||values.length!==columns.length)throw new MacroDbError('rpc_failed','incomplete_series_history');
    const raw=Object.fromEntries(columns.map((key,i)=>[key,values[i]]));
    const o=observationFromRow({...raw,series_id:r.series_id,status:'ok'});
    return {observation_id:o.observation_id,series_id:o.series_id,period_end:o.period_end,value_text:o.value_text,version:o.version,available_at:o.available_at,
     availability_basis:o.availability_basis,ingested_at:o.ingested_at,status:o.status,retrieval_id:o.retrieval_id,derived_from:o.derived_from,transform:o.transform};
   })};
  });
 };
}
