// src/lib/dcf/run-state.ts
// Pure decision logic of the DcfStudio run record (spec §5.4, §9.1): a POST response is accepted only if it answers
// the CURRENT request generation for the CURRENT ticker/asOf (no cross-company result), and a finished run is stale
// as soon as any input differs from the inputs it was run with.
import type {BridgeKey} from './bridge';

export interface RunInputs{wacc:number;terminalG:number;forecastYears:number;user:Partial<Record<BridgeKey,string>>}
export interface RunScope{generation:number;ticker:string;asOf:string|null}
const norm=(s:string)=>s.trim().toUpperCase();

/** Stable key of the inputs a run was made with (user bridge text trimmed; absent == empty). */
export function inputsKey(i:RunInputs):string{
 const u=(k:BridgeKey)=>(i.user[k]??'').trim();
 return JSON.stringify([i.wacc,i.terminalG,i.forecastYears,u('baseRevenue'),u('sharesDiluted'),u('netDebt')]);
}
/** Accept a response only for the latest request of the same ticker/asOf (the generation is bumped on every run and on ticker/asOf change). */
export function acceptRun(current:RunScope,request:RunScope,responseTicker:string|undefined):boolean{
 return request.generation===current.generation&&request.ticker===current.ticker&&request.asOf===current.asOf
  &&typeof responseTicker==='string'&&norm(responseTicker)===norm(request.ticker);
}
export const isStale=(runKey:string,currentKey:string)=>runKey!==currentKey;
