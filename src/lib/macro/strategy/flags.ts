// src/lib/macro/strategy/flags.ts
// Feature switches and the capability matrix (spec §9.1). Order for every strategy route: session (401, the route's
// job) → MACRO_STRATEGY_ENABLED (404 strategy_disabled) → [explanation POST idempotent replay] → foundation (port
// null → 503 macro_foundation_unavailable) → subject / params → judgment layer. Composite routes (transmission,
// review detail) stay 200 and carry judgment_status; only the pure judgment route (deviations) answers 404
// judgments_disabled, or 503 judgments_unavailable when F4 cannot be read (decided by the caller at read time).
import type {JudgmentStatus} from './contract';
import type {StrategyReadPort} from './port';
import {macroJudgmentsEnabled} from '../flags';

export type FlagEnv=Readonly<Record<string,string|undefined>>;
/** MACRO_STRATEGY_ENABLED === '1' (unset = off). */
export const strategyEnabled=(env:FlagEnv=process.env):boolean=>env.MACRO_STRATEGY_ENABLED==='1';
/** MACRO_JUDGMENTS_ENABLED === '1' (P1 flag, unset = off). */
export const judgmentsEnabled=macroJudgmentsEnabled;

export type GateFailure={ok:false;status:404;code:'strategy_disabled'}|{ok:false;status:503;code:'macro_foundation_unavailable'};
export type StrategyGate=GateFailure|{ok:true;port:StrategyReadPort;judgments:boolean};
/** Feature switch first, then foundation. Never inspects the session (routes do that before calling). */
export function strategyGate(env:FlagEnv,port:StrategyReadPort|null):StrategyGate{
 if(!strategyEnabled(env))return {ok:false,status:404,code:'strategy_disabled'};
 if(port===null)return {ok:false,status:503,code:'macro_foundation_unavailable'};
 return {ok:true,port,judgments:judgmentsEnabled(env)};
}
/** Pure judgment routes (deviations) after strategyGate passed: judgment layer off → 404 judgments_disabled. */
export function judgmentGate(env:FlagEnv):{ok:true}|{ok:false;status:404;code:'judgments_disabled'}{
 return judgmentsEnabled(env)?{ok:true}:{ok:false,status:404,code:'judgments_disabled'};
}
/** judgment_status of a composite response: off → disabled; on and F4 read failed → unavailable; else ok. */
export function judgmentStatus(env:FlagEnv,f4Read:'ok'|'failed'|'not_attempted'):JudgmentStatus{
 if(!judgmentsEnabled(env))return 'disabled';
 return f4Read==='ok'?'ok':'unavailable';
}
