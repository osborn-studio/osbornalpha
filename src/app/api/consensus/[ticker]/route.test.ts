// Consensus fallback behavior after removing mock broker reports (spec §9.4).
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({configured:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/data/sources/tushare-cached',async()=>{
 class TushareError extends Error{constructor(public code:number,msg:string){super(msg);}}
 return {isTushareConfigured:mocks.configured,fetchTushareReportRc:mocks.fetch,TushareError};
});
import {GET} from './route';
import {TushareError} from '@/lib/data/sources/tushare-cached';

const call=(t:string)=>GET(new Request(`http://localhost/api/consensus/${t}`),{params:Promise.resolve({ticker:t})});
beforeEach(()=>{vi.clearAllMocks();mocks.configured.mockReturnValue(false);});

describe('GET /api/consensus/[ticker] without the mock fallback (spec §9.4)',()=>{
 it('returns source none for tickers whose mock stub has broker reports',async()=>{
  for(const t of ['00700.HK','NVDA','600519.SH']){
   const res=await call(t);
   expect(res.status).toBe(200);expect(await res.json()).toEqual({source:'none',ticker:t,consensus:null});
  }
 });
 it('falls to none (not mock) on a Tushare error or zero usable reports',async()=>{
  mocks.configured.mockReturnValue(true);
  mocks.fetch.mockRejectedValueOnce(new TushareError(40203,'quota'));
  expect((await (await call('600519.SH')).json()).source).toBe('none');
  mocks.fetch.mockResolvedValueOnce([]);
  expect((await (await call('600519.SH')).json()).source).toBe('none');
 });
 it('keeps 502 for unexpected errors',async()=>{
  mocks.configured.mockReturnValue(true);mocks.fetch.mockRejectedValueOnce(new Error('boom'));
  expect((await call('600519.SH')).status).toBe(502);
 });
});
