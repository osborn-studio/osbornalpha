// src/lib/company/client.test.ts
import {describe,it,expect,vi,afterEach} from 'vitest';
import {VIEW_IDS,parseView,parseAsOf,companyHref,companyApi,fetchCompanyJson,isWithheld,flagOn,REPLAY_UNSUPPORTED,trackStateOf} from './client';

describe('view and asOf parsing',()=>{
 it('has the nine views in tab order; news and unknown fall back to overview',()=>{
  expect(VIEW_IDS).toEqual(['overview','statements','metrics','filings','tracking','judgments','ai','signals','holdings']);
  expect(parseView('news')).toBe('overview');
  expect(parseView(undefined)).toBe('overview');
  expect(parseView('fundamentals')).toBe('overview');
  expect(parseView('metrics')).toBe('metrics');
  expect(parseView(['statements','metrics'])).toBe('statements');
 });
 it('accepts a real calendar date not after today, else null',()=>{
  expect(parseAsOf('2024-06-30','2026-11-06')).toBe('2024-06-30');
  expect(parseAsOf('2026-11-06','2026-11-06')).toBe('2026-11-06');
  expect(parseAsOf('2026-11-07','2026-11-06')).toBeNull();
  expect(parseAsOf('2024-02-30','2026-11-06')).toBeNull();
  expect(parseAsOf('20240630','2026-11-06')).toBeNull();
  expect(parseAsOf(undefined,'2026-11-06')).toBeNull();
 });
 it('replay is unsupported for ai, signals and holdings only',()=>{
  expect([...REPLAY_UNSUPPORTED].sort()).toEqual(['ai','holdings','signals']);
 });
});

describe('hrefs and api urls',()=>{
 it('keeps asOf across tabs, drops overview default and encodes the ticker',()=>{
  expect(companyHref('600519.SH',{view:'statements',asOf:'2024-06-30'})).toBe('/stock/600519.SH?view=statements&asOf=2024-06-30');
  expect(companyHref('BRK.A',{view:'overview',asOf:null})).toBe('/stock/BRK.A');
  expect(companyHref('A/B',{view:'filings',asOf:null,extra:{highlight:'f1'}})).toBe('/stock/A%2FB?view=filings&highlight=f1');
 });
 it('builds public and admin api urls, omitting empty params',()=>{
  expect(companyApi('statements','AAPL',{statement:'IS',basis:'annual',asOf:undefined})).toBe('/api/companies/AAPL/statements?statement=IS&basis=annual');
  expect(companyApi('facts','AAPL',{concept:'revenue'},true)).toBe('/api/admin/companies/AAPL/facts?concept=revenue');
  expect(companyApi('filings','AAPL',{},true)).toBe('/api/admin/companies/AAPL/filings');
 });
});

describe('fetchCompanyJson',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('returns ok data, error codes from the envelope, internal for 5xx and network failures',async()=>{
  vi.stubGlobal('fetch',vi.fn()
   .mockResolvedValueOnce(new Response(JSON.stringify({a:1}),{status:200}))
   .mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'unknown_ticker'}}),{status:404}))
   .mockResolvedValueOnce(new Response('oops',{status:502}))
   .mockRejectedValueOnce(new TypeError('network')));
  expect(await fetchCompanyJson('/x')).toEqual({status:'ok',data:{a:1}});
  expect(await fetchCompanyJson('/x')).toEqual({status:'error',httpStatus:404,code:'unknown_ticker'});
  expect(await fetchCompanyJson('/x')).toEqual({status:'error',httpStatus:502,code:'internal'});
  expect(await fetchCompanyJson('/x')).toEqual({status:'error',httpStatus:0,code:'network'});
 });
});

describe('misc guards',()=>{
 it('recognizes withheld payload values and flags',()=>{
  expect(isWithheld({kind:'withheld',reason:'citation_pending',factId:'f'})).toBe(true);
  expect(isWithheld({factId:'f',value:'1'})).toBe(false);
  expect(isWithheld(null)).toBe(false);
  expect(flagOn('1')).toBe(true);expect(flagOn('true')).toBe(true);expect(flagOn(undefined)).toBe(false);expect(flagOn('0')).toBe(false);
 });
});

describe('trackStateOf',()=>{
 it('maps the watches response to the button state',()=>{
  expect(trackStateOf({status:'ok',data:{watches:[{issuerId:'a'}]}},'a')).toBe('tracked');
  expect(trackStateOf({status:'ok',data:{watches:[]}},'a')).toBe('untracked');
  expect(trackStateOf({status:'error',httpStatus:401,code:'not_authenticated'},'a')).toBe('login');
  expect(trackStateOf({status:'error',httpStatus:404,code:'http_404'},'a')).toBe('unavailable');
  expect(trackStateOf({status:'error',httpStatus:500,code:'internal'},'a')).toBe('unavailable');
 });
});
