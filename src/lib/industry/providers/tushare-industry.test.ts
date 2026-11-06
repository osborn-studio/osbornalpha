// src/lib/industry/providers/tushare-industry.test.ts
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {decodeText,defaultTushareCall,fetchDailyBasic,fetchIndexClassify,fetchIndexMembers,fetchStockBasic,fixtureTushareCall,INDUSTRY_PAGING_DIR,IndustryProviderError,locatorOf,ymdToIso} from './tushare-industry';
import type {TushareCall} from './tushare-industry';

const noSleep=async()=>{};
const NOW=()=>new Date('2026-11-06T00:00:00.000Z');
const fx=fixtureTushareCall();

describe('decodeText / ymdToIso',()=>{
 it('keeps strings, keeps the literal text of numeric tokens and nulls; rejects other cell types and wrong widths',()=>{
  expect(decodeText(['a','b','c'],[['000001',{__num:'0926'},null]])).toEqual([{a:'000001',b:'0926',c:null}]);
  expect(()=>decodeText(['a'],[[true]])).toThrow(IndustryProviderError);
  expect(()=>decodeText(['a','b'],[['x']])).toThrow('row_width:1');
 });
 it('converts YYYYMMDD to ISO, null/empty to null, and invalid dates to undefined',()=>{
  expect(ymdToIso('20210730')).toBe('2021-07-30');
  expect(ymdToIso(null)).toBeNull();expect(ymdToIso('')).toBeNull();
  expect(ymdToIso('20230230')).toBeUndefined();expect(ymdToIso('2023-01-01')).toBeUndefined();
 });
});

describe('fixtureTushareCall + fetchers (real recordings, 2026-11-06)',()=>{
 it('stock_basic: one call per list_status (upstream returns only L unless asked), filtered like the server, page bytes hashed',async()=>{
  const listed=await fetchStockBasic(fx,{listStatus:'L'},{sleep:noSleep,now:NOW});
  expect(listed).toHaveLength(1);
  expect(listed[0].rows.map(r=>r.ts_code)).toEqual(['000001.SZ','000858.SZ','000869.SZ','600036.SH','600519.SH','600887.SH','601166.SH','601318.SH','601398.SH','603288.SH']);
  expect(listed[0]).toMatchObject({api:'stock_basic',params:{list_status:'L'},page:1,offset:0,has_more:false,fetched_at:'2026-11-06T00:00:00.000Z'});
  expect(listed[0].raw_hash).toMatch(/^[0-9a-f]{64}$/);
  const delisted=await fetchStockBasic(fx,{listStatus:'D'},{sleep:noSleep});
  expect(delisted[0].rows.map(r=>[r.ts_code,r.list_status,r.list_date,r.delist_date])).toEqual([['002770.SZ','D','20150630','20220623'],['600090.SH','D','19970616','20220707']]);
  expect(delisted[0].rows[0]).toMatchObject({fullname:'河南科迪乳业股份有限公司',exchange:'SZSE'});
  expect((await fetchStockBasic(fx,{listStatus:'P'},{sleep:noSleep}))[0].rows).toEqual([]);
 });
 it('index_classify: one call per level with src=SW2021; the full tree is 31/134/346; parent_code is an industry_code',async()=>{
  const l1=await fetchIndexClassify(fx,{level:'L1'},{sleep:noSleep});
  expect(l1[0].params).toEqual({level:'L1',src:'SW2021'});
  expect(l1[0].rows).toHaveLength(31);
  expect(l1[0].rows[0]).toEqual({index_code:'801010.SI',industry_name:'农林牧渔',parent_code:'0',level:'L1',industry_code:'110000',is_pub:'1',src:'SW2021'});
  expect((await fetchIndexClassify(fx,{level:'L2'},{sleep:noSleep}))[0].rows).toHaveLength(134);
  const l3=(await fetchIndexClassify(fx,{level:'L3'},{sleep:noSleep}))[0].rows;
  expect(l3).toHaveLength(346);
  expect(l3.find(r=>r.index_code==='851251.SI')).toMatchObject({industry_name:'白酒Ⅲ',parent_code:'340500',industry_code:'340501'});
 });
 it('index_member_all: l1/is_new filters, limit/offset paging with one page record per response',async()=>{
  const sleep=vi.fn(noSleep);
  const y=await fetchIndexMembers(fx,{l1Code:'801120.SI',isNew:'Y'},{sleep,pageSize:50});
  expect(y.map(p=>[p.page,p.offset,p.has_more,p.rows.length])).toEqual([[1,0,true,50],[2,50,true,50],[3,100,false,29]]);
  expect(new Set(y.map(p=>p.raw_hash)).size).toBe(3);
  expect(sleep).toHaveBeenCalledTimes(2);
  expect(locatorOf(y[1],1)).toEqual({api:'index_member_all',params:{l1_code:'801120.SI',is_new:'Y'},page:2,offset:50,row:1});
  const n=await fetchIndexMembers(fx,{l1Code:'801120.SI',isNew:'N'},{sleep:noSleep});
  expect(n[0].rows).toHaveLength(58);
  expect(n[0].rows.slice(0,2).map(r=>[r.ts_code,r.in_date,r.out_date,r.is_new])).toEqual([['600866.SH','19940818','20210729','N'],['000869.SZ','20001010','20070629','N']]);
  expect((await fetchIndexMembers(fx,{l1Code:'801780.SI',isNew:'N'},{sleep:noSleep}))[0].rows).toEqual([]);
  expect((await fetchIndexMembers(fx,{l1Code:'801010.SI',isNew:'Y'},{sleep:noSleep}))[0].rows).toEqual([]);   // not recorded → empty, like an L1 without members
 });
 it('the recorded limit=50 pages (paging/) reproduce the single-call list exactly',async()=>{
  const paged=await fetchIndexMembers(fixtureTushareCall(INDUSTRY_PAGING_DIR),{l1Code:'801120.SI',isNew:'Y'},{sleep:noSleep,pageSize:50});
  expect(paged.map(p=>p.rows.length)).toEqual([50,50,29]);
  const single=await fetchIndexMembers(fx,{l1Code:'801120.SI',isNew:'Y'},{sleep:noSleep});
  expect(paged.flatMap(p=>p.rows)).toEqual(single.flatMap(p=>p.rows));
 });
 it('unknown api → fixture_missing',async()=>{
  await expect(fx('no_such_api',{},'a')).rejects.toMatchObject({code:'fixture_missing'});
 });
 it('stops with paging_not_advancing when the upstream ignores offset, and too_many_pages is bounded',async()=>{
  const stuck:TushareCall=async()=>({fields:['l1_code','l1_name','l2_code','l2_name','l3_code','l3_name','ts_code','name','in_date','out_date','is_new'],items:[['a','b','c','d','e','f','g','h','20210101',null,'Y']],has_more:true,raw:new Uint8Array([1])});
  await expect(fetchIndexMembers(stuck,{l1Code:'a',isNew:'Y'},{sleep:noSleep})).rejects.toMatchObject({code:'paging_not_advancing'});
  const empty:TushareCall=async(_a,p)=>({fields:['l1_code','l1_name','l2_code','l2_name','l3_code','l3_name','ts_code','name','in_date','out_date','is_new'],items:Number(p.offset)===0?[['a','b','c','d','e','f','g','h','20210101',null,'Y']]:[],has_more:true,raw:new Uint8Array([Number(p.offset)])});
  await expect(fetchIndexMembers(empty,{l1Code:'a',isNew:'Y'},{sleep:noSleep})).rejects.toMatchObject({code:'paging_not_advancing'});
 });
 it('rejects a response missing a requested field (row_shape)',async()=>{
  const bad:TushareCall=async()=>({fields:['ts_code'],items:[['600519.SH']],has_more:false,raw:new Uint8Array()});
  await expect(fetchStockBasic(bad,{listStatus:'L'},{sleep:noSleep})).rejects.toMatchObject({code:'row_shape',message:'missing_field:symbol'});
 });
 it('daily_basic: decimals stay canonical strings through decodeColumns',async()=>{
  const call:TushareCall=async(api,params,fields)=>{
   expect([api,params.trade_date,fields]).toEqual(['daily_basic','20241231','ts_code,trade_date,close,total_share,free_share,total_mv']);
   return {fields:['ts_code','trade_date','close','total_share','free_share','total_mv'],items:[['600519.SH','20241231',{__num:'1524.00'},{__num:'125619.78'},null,{__num:'1.914446447e8'}]],has_more:false,raw:new Uint8Array([7])};
  };
  const pages=await fetchDailyBasic(call,{tradeDate:'20241231'},{sleep:noSleep});
  expect(pages[0].rows).toEqual([{ts_code:'600519.SH',trade_date:'20241231',close:'1524',total_share:'125619.78',free_share:null,total_mv:'191444644.7'}]);
  const real=await fetchDailyBasic(fx,{tradeDate:'20261030'},{sleep:noSleep});
  expect(real[0].rows).toHaveLength(10);
  expect(real[0].rows.find(r=>r.ts_code==='600036.SH')).toEqual({ts_code:'600036.SH',trade_date:'20261030',close:'43.55',total_share:'2521984.5601',free_share:'1171836.1832',total_mv:'109832427.588'});
  expect(pages[0].raw_hash).toBe(createHash('sha256').update(new Uint8Array([7])).digest('hex'));
  expect(()=>fetchDailyBasic(call,{tradeDate:'2024-12-31'})).toThrow('bad_trade_date');
 });
});

describe('defaultTushareCall',()=>{
 const resp=(body:string,status=200)=>new Response(body,{status,headers:{'content-type':'application/json'}});
 it('passes limit/offset through, returns raw columns with numeric tokens and the response bytes',async()=>{
  const fetchFn=vi.fn(async(_u:unknown,init?:RequestInit)=>{
   const sent=JSON.parse(String(init!.body));
   expect(sent).toMatchObject({api_name:'index_member_all',params:{l1_code:'801080.SI',is_new:'Y',limit:2,offset:4},fields:'ts_code'});
   return resp('{"request_id":"r","code":0,"msg":"","data":{"fields":["ts_code","x"],"items":[["600584.SH",1.50]],"has_more":false}}');
  });
  const call=defaultTushareCall({fetch:fetchFn as unknown as typeof fetch,token:'t'});
  const out=await call('index_member_all',{l1_code:'801080.SI',is_new:'Y',limit:2,offset:4},'ts_code');
  expect(out.fields).toEqual(['ts_code','x']);
  expect(out.items).toEqual([['600584.SH',{__num:'1.50'}]]);
  expect(out.has_more).toBe(false);
  expect(new TextDecoder().decode(out.raw)).toContain('"600584.SH"');
 });
 it('maps quota messages and HTTP 429 to quota_exhausted, other API codes to tushare_error, never echoing the upstream message',async()=>{
  const quota=defaultTushareCall({fetch:(async()=>resp('{"request_id":"r","code":40203,"msg":"抱歉，您每分钟最多访问该接口200次","data":null}')) as unknown as typeof fetch,token:'t'});
  await expect(quota('index_member_all',{},'ts_code')).rejects.toMatchObject({code:'quota_exhausted',message:'api_code_40203'});
  const other=defaultTushareCall({fetch:(async()=>resp('{"request_id":"r","code":40001,"msg":"secret detail","data":null}')) as unknown as typeof fetch,token:'t'});
  await expect(other('index_member_all',{},'ts_code')).rejects.toMatchObject({code:'tushare_error',message:'api_code_40001'});
  const http429=defaultTushareCall({fetch:(async()=>resp('',429)) as unknown as typeof fetch,token:'t'});
  await expect(http429('index_member_all',{},'ts_code')).rejects.toMatchObject({code:'quota_exhausted'});
  const noToken=defaultTushareCall({fetch:(async()=>resp('{}')) as unknown as typeof fetch,token:''});
  await expect(noToken('index_member_all',{},'ts_code')).rejects.toMatchObject({code:'tushare_unavailable',message:'tushare_-1'});
 });
});
