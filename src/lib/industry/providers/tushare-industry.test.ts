// src/lib/industry/providers/tushare-industry.test.ts
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {decodeText,defaultTushareCall,fetchDailyBasic,fetchIndexClassify,fetchIndexMembers,fetchStockBasic,fixtureTushareCall,INDUSTRY_PAGING_DIR,industrySnapshotPath,IndustryProviderError,INDEX_MEMBER_FIELDS,locatorOf,ymdToIso} from './tushare-industry';
import {memorySnapshotStore,SNAPSHOT_BUCKET} from '../../facts/snapshot-store';
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
  expect(locatorOf(y[1],1)).toEqual({api:'index_member_all',params:{l1_code:'801120.SI',is_new:'Y'},page:2,offset:50,row:1,request:{api:'index_member_all',params:{l1_code:'801120.SI',is_new:'Y',limit:50,offset:50},fields:INDEX_MEMBER_FIELDS.join(',')}});
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

const MEMBER_ROW=['a','b','c','d','e','f','g','h','20210101',null,'Y'];
describe('malformed responses are rejected before projection (parse_error)',()=>{
 const resp=(fields:string[],items:unknown[][]):TushareCall=>async()=>({fields,items,has_more:false,raw:new Uint8Array([1])});
 const F=[...INDEX_MEMBER_FIELDS] as string[];
 it('a row narrower than the field list (an absent out_date) never becomes null',async()=>{
  await expect(fetchIndexMembers(resp(F,[MEMBER_ROW.slice(0,10)]),{l1Code:'a',isNew:'Y'},{sleep:noSleep})).rejects.toMatchObject({code:'parse_error',message:'row_width:10'});
  await expect(fetchIndexMembers(resp(F,[[...MEMBER_ROW,'x']]),{l1Code:'a',isNew:'Y'},{sleep:noSleep})).rejects.toMatchObject({code:'parse_error'});
  await expect(fetchStockBasic(resp(['ts_code','symbol','name','fullname','exchange','list_status','list_date','delist_date'],[['600519.SH','600519','n','f','SSE','L','20010827']]),{listStatus:'L'},{sleep:noSleep})).rejects.toMatchObject({code:'parse_error'});
  await expect(fetchIndexClassify(resp(['index_code','industry_name','parent_code','level','industry_code','is_pub','src'],[['801010.SI']]),{level:'L1'},{sleep:noSleep})).rejects.toMatchObject({code:'parse_error'});
  await expect(fetchDailyBasic(resp(['ts_code','trade_date','close','total_share','free_share','total_mv'],[['600519.SH','20241231']]),{tradeDate:'20241231'},{sleep:noSleep})).rejects.toMatchObject({code:'parse_error'});
 });
 it('duplicate field names and non-array rows are rejected',async()=>{
  await expect(fetchIndexMembers(resp([...F,'ts_code'],[[...MEMBER_ROW,'x']]),{l1Code:'a',isNew:'Y'},{sleep:noSleep})).rejects.toMatchObject({code:'parse_error',message:'duplicate_field'});
  await expect(fetchIndexMembers(resp(F,['oops' as unknown as unknown[]]),{l1Code:'a',isNew:'Y'},{sleep:noSleep})).rejects.toMatchObject({code:'parse_error'});
 });
 it('a well-formed page with extra upstream columns still passes (projection happens after the check)',async()=>{
  const pages=await fetchIndexMembers(resp([...F,'extra'],[[...MEMBER_ROW,'z']]),{l1Code:'a',isNew:'Y'},{sleep:noSleep});
  expect(pages[0].rows[0]).toMatchObject({ts_code:'g',out_date:null});
 });
});

describe('page evidence snapshots (spec §4.4: one snapshot per page)',()=>{
 const bytesOf=(n:number)=>new TextEncoder().encode(`{"page":${n}}`);
 const pager:TushareCall=async(_a,p)=>{
  const off=Number(p.offset);
  return {fields:[...INDEX_MEMBER_FIELDS],items:[[...MEMBER_ROW.slice(0,6),`t${off}`,...MEMBER_ROW.slice(7)]],has_more:off<1,raw:bytesOf(off)};
 };
 it('stores the exact bytes of every page, keeps raw_hash = sha256(bytes) and carries the reference plus full request in the locator',async()=>{
  const store=memorySnapshotStore();
  const pages=await fetchIndexMembers(pager,{l1Code:'801120.SI',isNew:'Y'},{sleep:noSleep,pageSize:1,snapshots:{store},now:NOW});
  expect(pages).toHaveLength(2);
  for(const [i,pg] of pages.entries()){
   const path=industrySnapshotPath('index_member_all',pg.raw_hash);
   expect(path).toMatch(/^tushare\/[0-9a-f-]{36}\/[0-9a-f]{64}\.json$/);
   expect(pg.raw_hash).toBe(createHash('sha256').update(bytesOf(i)).digest('hex'));
   expect(pg.snapshot).toEqual({bucket:SNAPSHOT_BUCKET,path,sha256:pg.raw_hash});
   expect(store.read(path)).toEqual(bytesOf(i));
   const loc=locatorOf(pg,0);
   expect(loc.snapshot).toEqual(pg.snapshot);
   expect(loc.request).toEqual({api:'index_member_all',params:{l1_code:'801120.SI',is_new:'Y',limit:1,offset:i},fields:INDEX_MEMBER_FIELDS.join(',')});
   expect(JSON.parse(String(store.read(path.replace(/\.json$/,'.meta.json'))))).toMatchObject({source:'tushare',api:'index_member_all',page:i+1,has_more:i===0,params:{limit:1,offset:i}});
  }
  expect(store.objects.size).toBe(4);   // 2 pages × (bytes + meta)
 });
 it('without a store no snapshot is recorded (dry run) and the locator carries only the request',async()=>{
  const pages=await fetchIndexMembers(pager,{l1Code:'a',isNew:'Y'},{sleep:noSleep,pageSize:1});
  expect(pages[0].snapshot).toBeNull();expect('snapshot' in locatorOf(pages[0],0)).toBe(false);
 });
 it('a failed upload aborts the fetch with the store error',async()=>{
  const store={put:async()=>{throw new Error('snapshot_upload_failed');}};
  await expect(fetchIndexMembers(pager,{l1Code:'a',isNew:'Y'},{sleep:noSleep,snapshots:{store}})).rejects.toThrow('snapshot_upload_failed');
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
