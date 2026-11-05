// src/app/api/financials/[ticker]/route.test.ts
import {describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({configured:vi.fn(()=>false),income:vi.fn()}));
vi.mock('@/lib/data/sources/tushare-cached',()=>({isTushareConfigured:mocks.configured,fetchTushareIncome:mocks.income,fetchTushareBalance:vi.fn(),fetchTushareCashflow:vi.fn(),fetchTushareFinaIndicator:vi.fn()}));
import {GET} from './route';

describe('GET /api/financials/[ticker] deprecation',()=>{
 it.each(['AAPL','600519.SH'])('answers %s with Deprecation and a successor-version Link to /api/facts',async(ticker)=>{
  const res=await GET(new Request(`https://alpha.example/api/financials/${ticker}`),{params:Promise.resolve({ticker})});
  expect(res.status).toBe(200);
  expect(res.headers.get('deprecation')).toBe('true');
  expect(res.headers.get('link')).toBe(`</api/facts/${encodeURIComponent(ticker)}>; rel="successor-version"`);
 });
 it('keeps the headers on the 502 error response and on a malformed-ticker 400',async()=>{
  mocks.configured.mockReturnValue(true);
  mocks.income.mockResolvedValue([{}]);   // no end_date → the handler throws
  const bad=await GET(new Request('https://alpha.example/api/financials/600519.SH'),{params:Promise.resolve({ticker:'600519.SH'})});
  expect(bad.status).toBe(502);
  expect(bad.headers.get('deprecation')).toBe('true');
  expect(bad.headers.get('link')).toContain('rel="successor-version"');
  const mal=await GET(new Request('https://alpha.example/api/financials/%E0%A4%A'),{params:Promise.resolve({ticker:'%E0%A4%A'})});
  expect(mal.status).toBe(400);
  expect(mal.headers.get('deprecation')).toBe('true');
 });
});
