// src/app/api/consensus/[ticker]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({configured:vi.fn(),reportRc:vi.fn(),stub:vi.fn()}));
vi.mock('@/lib/data/sources/tushare-cached',async()=>{
 const {TushareError}=await vi.importActual<typeof import('@/lib/data/sources/tushare')>('@/lib/data/sources/tushare');
 return {isTushareConfigured:mocks.configured,fetchTushareReportRc:mocks.reportRc,TushareError};
});
vi.mock('@/lib/data/mock',()=>({getStockOrStub:mocks.stub}));
import {GET} from './route';
import {TushareError} from '@/lib/data/sources/tushare';

const get=(t:string)=>GET(new Request(`https://alpha.example/api/consensus/${t}`),{params:Promise.resolve({ticker:t})});

describe('GET /api/consensus/[ticker] (decision D: no mock fallback)',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.stub.mockReturnValue({broker_reports:[{target_price:100}]});});
 it('non-A-share or no token → {source:none, consensus:null}; the mock universe is never read',async()=>{
  mocks.configured.mockReturnValue(false);
  for(const t of ['AAPL','600519.SH'])expect(await (await get(t)).json()).toEqual({source:'none',ticker:t,consensus:null});
  expect(mocks.stub).not.toHaveBeenCalled();
 });
 it('Tushare with zero usable reports or a TushareError → none; other errors → 502',async()=>{
  mocks.configured.mockReturnValue(true);
  mocks.reportRc.mockResolvedValue([]);
  expect((await (await get('600519.SH')).json()).source).toBe('none');
  mocks.reportRc.mockRejectedValue(new TushareError(1,'quota'));
  expect((await (await get('600519.SH')).json()).source).toBe('none');
  mocks.reportRc.mockRejectedValue(new Error('boom'));
  expect((await get('600519.SH')).status).toBe(502);
 });
});
