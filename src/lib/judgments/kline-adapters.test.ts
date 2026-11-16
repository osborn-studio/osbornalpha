// src/lib/judgments/kline-adapters.test.ts
// F4 fences in the two daily adapters (spec §7.4): historical end dates and the close-only signal.
// The adapters' own test files are untouched; this file covers only the F4 additions.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {eastmoneyEnd,fetchEastmoneyKline} from '@/lib/data/sources/eastmoney';
import {datagatewayDailyKlineBody,fetchDatagatewayDailyKline,parseDatagatewayDailyKline} from '@/lib/data/sources/datagateway';

describe('F4 endDate options in the daily adapters (spec §7.4)',()=>{
 afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
 it('Eastmoney: end= is endDate as YYYYMMDD; the default stays 20500101; malformed → protocol error',async()=>{
  const fetchMock=vi.fn().mockImplementation(async()=>new Response('cb({"data":{"klines":["2024-06-18,1,2,3,0.5,10"]}});',{status:200}));
  vi.stubGlobal('fetch',fetchMock);
  await fetchEastmoneyKline('600519.SH','D',60,{adjustment:'qfq',endDate:'2024-06-20'});
  expect(String(fetchMock.mock.calls[0][0])).toContain('&lmt=60&end=20240620&');
  await fetchEastmoneyKline('600519.SH','D',60,{adjustment:'qfq'});
  expect(String(fetchMock.mock.calls[1][0])).toContain('&lmt=60&end=20500101&');
  expect(eastmoneyEnd()).toBe('20500101');
  expect(()=>eastmoneyEnd('2024/06/20')).toThrow(/endDate/);
  await expect(fetchEastmoneyKline('600519.SH','D',60,{endDate:'20240620'})).rejects.toMatchObject({kind:'protocol'});
 });
 it('DataGateway: the body carries startDate/endDate when given and is unchanged otherwise',()=>{
  expect(datagatewayDailyKlineBody({ticker:'NVDA',market:'US',limit:60,startDate:'2024-05-01',endDate:'2024-06-30'})).toEqual({symbols:['NVDA'],startDate:'2024-05-01',endDate:'2024-06-30',mode:'strict_sync'});
  expect(datagatewayDailyKlineBody({ticker:'NVDA',market:'US',limit:10,endDate:'2024-06-30'})).toEqual({symbols:['NVDA'],startDate:'2024-05-31',endDate:'2024-06-30',mode:'strict_sync'});
  expect(datagatewayDailyKlineBody({ticker:'NVDA',market:'US',limit:10})?.endDate).toBe(new Date().toISOString().slice(0,10));
  expect(datagatewayDailyKlineBody({ticker:'NVDA',market:'US',limit:10,endDate:'20240630'})).toBeNull();
 });
 it('DataGateway: the close-only MarketDataItem shape fires onCloseOnly once; OHLCV bars do not',()=>{
  const hook=vi.fn();
  const s=parseDatagatewayDailyKline({data:[{symbol:'NVDA',date:'2024-06-07',value:1208.88},{symbol:'NVDA',date:'2024-06-10',value:121.79}]},'qfq',{onCloseOnly:hook});
  expect(s.bars.map(b=>b.close)).toEqual([1208.88,121.79]);expect(hook).toHaveBeenCalledTimes(1);
  const hook2=vi.fn();
  parseDatagatewayDailyKline({data:{bars:[{date:'2024-06-10',open:1,high:2,low:0.5,close:1.5,volume:10}]}},'qfq',{onCloseOnly:hook2});
  expect(hook2).not.toHaveBeenCalled();
 });
 it('fetchDatagatewayDailyKline posts the window and forwards onCloseOnly',async()=>{
  vi.stubEnv('DATAGATEWAY_BASE_URL','https://dg.example.test');vi.stubEnv('DATAGATEWAY_API_KEY','unit-test-placeholder');
  const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({data:[{symbol:'NVDA',date:'2024-06-10',value:121.79}]}),{status:200}));
  const hook=vi.fn();
  const s=await fetchDatagatewayDailyKline('NVDA','US',60,'qfq',{fetchImpl:fetchImpl as unknown as typeof fetch,startDate:'2024-06-01',endDate:'2024-06-11',onCloseOnly:hook});
  const init=(fetchImpl.mock.calls[0] as unknown as [URL,RequestInit])[1];
  expect(JSON.parse(String(init.body))).toEqual({symbols:['NVDA'],startDate:'2024-06-01',endDate:'2024-06-11',mode:'strict_sync'});
  expect(hook).toHaveBeenCalledTimes(1);expect(s?.bars).toHaveLength(1);
 });
});
