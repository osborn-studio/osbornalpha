// src/lib/entities/coverage.test.ts
import {describe,it,expect} from 'vitest';
import {coverageE1,coverageE2,meetsThreshold,ratio} from './coverage';

describe('ratio',()=>{
 it('formats a truncated two-decimal percentage with integer arithmetic and null for an empty denominator',()=>{
  expect(ratio(2,3)).toEqual({num:2,den:3,pct:'66.66'});
  expect(ratio(19,20)).toEqual({num:19,den:20,pct:'95.00'});
  expect(ratio(0,0)).toEqual({num:0,den:0,pct:null});
  expect(meetsThreshold(ratio(19,20),95)).toBe(true);
  expect(meetsThreshold(ratio(18,19),95)).toBe(false);
  expect(meetsThreshold(ratio(0,0),95)).toBe(false);
 });
});

describe('coverageE1',()=>{
 it('counts open rows of US in-scope issuers (priority > 0); the ISIN denominator keeps issuers with a LEI',()=>{
  const scope=[{issuer_id:'a',market:'US',priority:3},{issuer_id:'b',market:'US',priority:1},{issuer_id:'c',market:'US',priority:0},{issuer_id:'d',market:'CN',priority:5}];
  const issuers=[{issuer_id:'a',lei:'HWUPKR0MPOU8FGXBT394'},{issuer_id:'b',lei:null},{issuer_id:'c',lei:'X'},{issuer_id:'d',lei:'Y'}];
  const securities=[
   {issuer_id:'a',ticker:'AAPL',valid_to:null,figi:'BBG000B9XRY4',isin:'US0378331005'},
   {issuer_id:'a',ticker:'AAPL.OLD',valid_to:'2020-01-01',figi:null,isin:null},
   {issuer_id:'b',ticker:'ZZB',valid_to:null,figi:null,isin:null},
   {issuer_id:'c',ticker:'ZZC',valid_to:null,figi:null,isin:null},
   {issuer_id:'d',ticker:'600519.SH',valid_to:null,figi:null,isin:null},
  ];
  expect(coverageE1({scope,securities,issuers})).toEqual({
   figi:{num:1,den:2,pct:'50.00'},isin:{num:1,den:1,pct:'100.00'},passes:{figi:false,isin:true},
  });
 });
});

describe('coverageE2',()=>{
 it('counts research-queue A/H earliest rows with a list_date and no open quarantine; reports the rest separately',()=>{
  const rows=[
   {issuer_id:'q',ticker:'600519.SH',valid_from:'2001-08-27',valid_from_method:'listing_date'},
   {issuer_id:'q',ticker:'000001.SZ',valid_from:'2024-01-01',valid_from_method:'first_observed'},
   {issuer_id:'q',ticker:'00700.HK',valid_from:'2024-01-01',valid_from_method:'first_observed'},
   {issuer_id:'q',ticker:'600000.SH',valid_from:'2020-01-01',valid_from_method:'first_observed'},
   {issuer_id:'old',ticker:'600000.SH',valid_from:'2010-01-01',valid_from_method:'first_observed'},
   {issuer_id:'q',ticker:'AAPL',valid_from:'2024-01-01',valid_from_method:'first_observed'},
   {issuer_id:'other',ticker:'601318.SH',valid_from:'2024-01-01',valid_from_method:'first_observed'},
  ];
  const listDates=new Map([['600519.SH','2001-08-27'],['000001.SZ','1991-04-03'],['00700.HK','2004-06-16'],['600000.SH','1999-11-10'],['601318.SH','2007-03-01']]);
  const r=coverageE2({rows,listDates,queueIssuers:new Set(['q']),openQuarantineKeys:new Set(['00700.HK:2024-01-01'])});
  expect(r).toEqual({backfillable:{num:1,den:2,pct:'50.00'},not_backfillable:2,open_quarantine:1,passes:false});
 });
});

describe('coverageE2 Beijing',()=>{
 it('counts an unbackfilled .BJ row as backfillable work',()=>{
  const rows=[{issuer_id:'q',ticker:'430047.BJ',valid_from:'2024-01-01',valid_from_method:'first_observed'}];
  const r=coverageE2({rows,listDates:new Map([['430047.BJ','2020-07-27']]),queueIssuers:new Set(['q']),openQuarantineKeys:new Set()});
  expect(r).toEqual({backfillable:{num:0,den:1,pct:'0.00'},not_backfillable:0,open_quarantine:0,passes:false});
 });
});
