import {describe,it,expect} from 'vitest';
import {computeReturn,computeAlpha} from 'dsh-trade-strategy-evaluator/engine';
import {ARM_PAYOFF_PROTOCOL,parseArmPayoffPlan,computeArmPricePayoff} from './arm-payoff';
const plan=(position:string)=>({protocol:ARM_PAYOFF_PROTOCOL,position});
describe('prospective explicit price-payoff protocol, synthetic only',()=>{
 it('matches exported trade BUY price-return semantics on rising, falling, flat and total-loss paths',()=>{
  for(const exit of [0,50,100,125,200]){
   const price=computeReturn({action:'BUY',entryPrice:100,exitPrice:exit,decimals:10});
   for(const benchmark of [-1,-.2,0,.02,.19999999995]){
    const out=computeArmPricePayoff(plan('long'),{status:'resolved',price_return:price,benchmark_price_return:benchmark});
    expect(out.gross_price_return).toBe((exit-100)/100);expect(out.benchmark_difference).toBe(computeAlpha({strategyReturn:price,benchmarkReturn:benchmark,decimals:10}));expect(Object.isFrozen(out)).toBe(true);
   }
  }
 });
 it('cash is zero under either rising or falling markets, never an inferred short',()=>{
  for(const price of [-.2,.2])expect(computeArmPricePayoff(plan('cash'),{status:'resolved',price_return:price,benchmark_price_return:.05})).toMatchObject({gross_price_return:0,benchmark_difference:-.05,cash_return_assumption:'zero'});
 });
 it('rejects legacy decisions, card kinds, unsupported positions and hidden parameters',()=>{
  for(const value of ['adopt','reject','evidence','counter','SELL','short',null,{},plan('short'),{...plan('long'),fees:0},{...plan('cash'),protocol:'other'}])expect(()=>parseArmPayoffPlan(value)).toThrow('invalid_schema');
 });
 it('rejects payoff accessors, symbols, foreign prototypes and Proxy traps',()=>{
  let reads=0;const input=plan('long');Object.defineProperty(input,'position',{enumerable:true,get(){reads++;return 'long';}});
  expect(()=>parseArmPayoffPlan(input)).toThrow('invalid_schema');expect(reads).toBe(0);
  expect(()=>parseArmPayoffPlan({...plan('long'),[Symbol('extra')]:1})).toThrow('invalid_schema');
  expect(()=>parseArmPayoffPlan(Object.assign(Object.create({authority:true}),plan('long')))).toThrow('invalid_schema');
  expect(()=>parseArmPayoffPlan(new Proxy(plan('long'),{getPrototypeOf(){reads++;return Object.prototype;}}))).toThrow('invalid_schema');expect(reads).toBe(0);
  expect(()=>parseArmPayoffPlan({protocol:ARM_PAYOFF_PROTOCOL})).toThrow('invalid_schema');
 });
 it('does not turn pending or invalid data into zero for cash',()=>{
  for(const position of ['long','cash']){
   expect(()=>computeArmPricePayoff(plan(position),{status:'pending_start',price_return:0,benchmark_price_return:0})).toThrow('not_configured');
   for(const benchmark of [NaN,Infinity,-Infinity,-1.01])expect(()=>computeArmPricePayoff(plan(position),{status:'resolved',price_return:0,benchmark_price_return:benchmark})).toThrow('invalid_schema');
   expect(computeArmPricePayoff(plan(position),{status:'resolved',price_return:0,benchmark_price_return:-1}).benchmark_difference).toBe(1);
   for(const price of [NaN,Infinity,-1.01])expect(()=>computeArmPricePayoff(plan(position),{status:'resolved',price_return:price,benchmark_price_return:0})).toThrow('invalid_schema');
  }
 });
});
