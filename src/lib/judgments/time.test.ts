// src/lib/judgments/time.test.ts
// spec §3.4 (settle window arithmetic, leap years, month ends), §3.7 S08 (exchange close instants via
// Intl, US DST switch days, consistency with forward.ts::exchangeDate), §3.3 S06 markets.ts.
import {describe,expect,it} from 'vitest';
import {exchangeDate} from '@/lib/scoring/forward';
import {JudgmentError} from './errors';
import {factsMarketOf,isFactsMarket,isPriceMarket,priceMarketOf} from './markets';
import {DEFAULT_GRACE_DAYS,EXCHANGE_CLOSE,addDaysIso,addMonthsPeriod,closeInstantUtc,endOfUtcDay,graceDaysOf,isIsoDate,monthEndIso,settleAfterDate,settleWindowOf} from './time';
import type {PriceMarket} from './types';

const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof JudgmentError?e.code:'other';}};

describe('closeInstantUtc',()=>{
 it('converts the local close to UTC, including both US DST switch weeks of 2026',()=>{
  expect(closeInstantUtc('2026-11-06','A')).toBe('2026-11-06T07:00:00.000Z');
  expect(closeInstantUtc('2026-11-06','HK')).toBe('2026-11-06T08:00:00.000Z');
  expect(closeInstantUtc('2026-03-06','US')).toBe('2026-03-06T21:00:00.000Z');   // Friday, EST
  expect(closeInstantUtc('2026-03-09','US')).toBe('2026-03-09T20:00:00.000Z');   // Monday after DST start (Mar 8), EDT
  expect(closeInstantUtc('2026-10-30','US')).toBe('2026-10-30T20:00:00.000Z');   // Friday, EDT
  expect(closeInstantUtc('2026-11-02','US')).toBe('2026-11-02T21:00:00.000Z');   // Monday after DST end (Nov 1), EST
 });
 it('agrees with forward.ts exchangeDate for every market (same time zones, S08)',()=>{
  expect(Object.keys(EXCHANGE_CLOSE).sort()).toEqual(['A','HK','US']);
  for(const m of Object.keys(EXCHANGE_CLOSE) as PriceMarket[])
   for(const d of ['2026-01-02','2026-03-06','2026-03-08','2026-03-09','2026-06-30','2026-10-30','2026-11-01','2026-11-02','2028-02-29'])
    expect({m,d,got:exchangeDate(closeInstantUtc(d,m),m)}).toEqual({m,d,got:d});
 });
 it('refuses invalid dates and markets',()=>{
  expect(code(()=>closeInstantUtc('2026-02-30','US'))).toBe('invalid_parameter');
  expect(code(()=>closeInstantUtc('2026-11-06','JP' as never))).toBe('invalid_parameter');
 });
});

describe('date arithmetic',()=>{
 it('endOfUtcDay, addDaysIso across month, year and leap boundaries, isIsoDate',()=>{
  expect(endOfUtcDay('2026-11-06')).toBe('2026-11-06T23:59:59.999Z');
  expect(addDaysIso('2028-02-28',1)).toBe('2028-02-29');
  expect(addDaysIso('2026-02-28',1)).toBe('2026-03-01');
  expect(addDaysIso('2026-12-31',1)).toBe('2027-01-01');
  expect(addDaysIso('2026-03-01',-1)).toBe('2026-02-28');
  expect(addDaysIso('2026-11-06',0)).toBe('2026-11-06');
  expect(isIsoDate('2028-02-29')).toBe(true);
  for(const v of ['2026-02-29','2026-13-01','2026-1-01','20261106',null,'0099-01-01'])expect({v,ok:isIsoDate(v)}).toEqual({v,ok:false});
  expect(code(()=>addDaysIso('2026-11-06',1.5))).toBe('invalid_parameter');
  expect(code(()=>endOfUtcDay('2026-11-31'))).toBe('invalid_parameter');
 });
 it('addMonthsPeriod and monthEndIso',()=>{
  expect(addMonthsPeriod('2026-11',3)).toBe('2027-02');
  expect(addMonthsPeriod('2026-01',-1)).toBe('2025-12');
  expect(addMonthsPeriod('2026-05',0)).toBe('2026-05');
  expect(addMonthsPeriod('2026-12',13)).toBe('2028-01');
  expect(monthEndIso('2028-02')).toBe('2028-02-29');
  expect(monthEndIso('2026-02')).toBe('2026-02-28');
  expect(monthEndIso('2026-12')).toBe('2026-12-31');
  for(const p of ['2026-13','2026-00','2026-1','202611'])expect({p,c:code(()=>monthEndIso(p))}).toEqual({p,c:'invalid_parameter'});
 });
});

describe('settleWindowOf (plan 契约补充 结算窗口算术; SQL twin in Task 3)',()=>{
 it('settle_after per target kind, settle_by = settle_after + default grace per horizon unit',()=>{
  expect(DEFAULT_GRACE_DAYS).toEqual({trading_sessions:60,calendar_days:30,calendar_months:30,fiscal_quarters:120});
  expect(settleWindowOf({kind:'session_index',base_date:'2026-11-06',n:5},{unit:'trading_sessions',n:5},{})).toEqual({settle_after:'2026-11-11T00:00:00.000Z',settle_by:'2027-01-10T00:00:00.000Z'});
  expect(settleWindowOf({kind:'date',date:'2026-12-01'},{unit:'calendar_days',n:25},{})).toEqual({settle_after:'2026-12-01T00:00:00.000Z',settle_by:'2026-12-31T00:00:00.000Z'});
  expect(settleWindowOf({kind:'period',period:'2028-02'},{unit:'calendar_months',n:1},{})).toEqual({settle_after:'2028-03-01T00:00:00.000Z',settle_by:'2028-03-31T00:00:00.000Z'});
  expect(settleWindowOf({kind:'period',period:'2026-12'},{unit:'calendar_months',n:0},{})).toEqual({settle_after:'2027-01-01T00:00:00.000Z',settle_by:'2027-01-31T00:00:00.000Z'});
  expect(settleWindowOf({kind:'fiscal_period',period_end:'2026-12-31',calendar:{anchor_period_end:'2026-09-30',months:3},extrapolated:true},{unit:'fiscal_quarters',n:1},{})).toEqual({settle_after:'2027-01-01T00:00:00.000Z',settle_by:'2027-05-01T00:00:00.000Z'});
 });
 it('uses params.grace_days (integer >= 1, number or digit string) over the default',()=>{
  expect(settleWindowOf({kind:'date',date:'2026-12-01'},{unit:'calendar_days',n:25},{grace_days:7}).settle_by).toBe('2026-12-08T00:00:00.000Z');
  expect(graceDaysOf({grace_days:'14'},{unit:'calendar_days',n:1})).toBe(14);
  for(const g of [0,-1,1.5,'1.5','x'])expect({g,c:code(()=>graceDaysOf({grace_days:g},{unit:'calendar_days',n:1}))}).toEqual({g,c:'invalid_parameter'});
  expect(settleAfterDate({kind:'session_index',base_date:'2028-02-27',n:3})).toBe('2028-03-01');
  expect(code(()=>settleAfterDate({kind:'planet'} as never))).toBe('invalid_parameter');
 });
});

describe('markets (S06)',()=>{
 it('maps price markets to the facts domain and back; HK has no facts market',()=>{
  expect(factsMarketOf('A')).toBe('CN');expect(factsMarketOf('US')).toBe('US');expect(factsMarketOf('HK')).toBeNull();
  expect(priceMarketOf('CN')).toBe('A');expect(priceMarketOf('US')).toBe('US');
  expect(isPriceMarket('HK')).toBe(true);expect(isPriceMarket('JP')).toBe(false);expect(isPriceMarket(null)).toBe(false);
  expect(isFactsMarket('CN')).toBe(true);expect(isFactsMarket('A')).toBe(false);
 });
});
