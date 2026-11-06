// src/lib/entities/coverage.test.ts
import {describe,it,expect} from 'vitest';
import {coverageE1,meetsThreshold,ratio} from './coverage';

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
