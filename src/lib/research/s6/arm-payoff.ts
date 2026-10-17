import {computeAlpha} from 'dsh-trade-strategy-evaluator/engine';
import {fail} from '../ingest/pa-v1/json.js';
import {exactPlanObject} from './arm-plan-object';
export const ARM_PAYOFF_PROTOCOL='alpha-arm-price-payoff/1.0';
export interface ArmPayoffPlan {protocol:typeof ARM_PAYOFF_PROTOCOL;position:'long'|'cash'}
/** Prospective explicit choice only. Never infer position from adopt/reject or card kind.
 * This pure function proves neither consent, plan timing nor source authorization. */
export function parseArmPayoffPlan(value:unknown):Readonly<ArmPayoffPlan>{
 const {protocol,position}=exactPlanObject(value,['protocol','position']);
 if(protocol!==ARM_PAYOFF_PROTOCOL||!['long','cash'].includes(position as string))fail('invalid_schema');
 return Object.freeze({protocol,position} as ArmPayoffPlan);
}
/** Hypothetical unit-notional gross price return; cash earns zero by protocol.
 * Excludes dividends, fees, interest, financing, taxes and execution. Not trade P&L.
 * Caller must supply a verified resolved price window under the frozen common anchor. */
export function computeArmPricePayoff(plan:unknown,window:{status:string;price_return:number;benchmark_price_return:number}){
 const selected=parseArmPayoffPlan(plan);
 if(window.status!=='resolved')fail('not_configured');
 const price=window.price_return,benchmark=window.benchmark_price_return;
 if(!Number.isFinite(price)||!Number.isFinite(benchmark)||price< -1||benchmark< -1)fail('invalid_schema');
 const gross=selected.position==='long'?price:0;
 const difference=computeAlpha({strategyReturn:gross,benchmarkReturn:benchmark,decimals:10});
 if(!Number.isFinite(difference))fail('invalid_schema');
 return Object.freeze({protocol:ARM_PAYOFF_PROTOCOL,position:selected.position,gross_price_return:gross,benchmark_difference:difference,
  unit:'fraction' as const,cash_return_assumption:'zero' as const,metric:'hypothetical_unit_notional_gross_price_return' as const});
}
