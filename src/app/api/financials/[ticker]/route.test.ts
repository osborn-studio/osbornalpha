// src/app/api/financials/[ticker]/route.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/data/sources/tushare-cached',()=>({isTushareConfigured:()=>false,fetchTushareIncome:vi.fn(),fetchTushareBalance:vi.fn(),fetchTushareCashflow:vi.fn(),fetchTushareFinaIndicator:vi.fn()}));
import {GET} from './route';

describe('GET /api/financials/[ticker] deprecation',()=>{
 it.each(['AAPL','600519.SH'])('answers %s with Deprecation and a successor-version Link to /api/facts',async(ticker)=>{
  const res=await GET(new Request(`https://alpha.example/api/financials/${ticker}`),{params:Promise.resolve({ticker})});
  expect(res.status).toBe(200);
  expect(res.headers.get('deprecation')).toBe('true');
  expect(res.headers.get('link')).toBe(`</api/facts/${encodeURIComponent(ticker)}>; rel="successor-version"`);
 });
});
