import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {MAX_TUSHARE_RESPONSE_BYTES,TUSHARE_ENDPOINT,TushareError,tushareCallRaw} from './tushare';

const body='{"request_id":"r-1","code":0,"msg":null,"data":{"fields":["ts_code","end_date","report_type","total_revenue"],"items":[["600519.SH","20231231",1,1.5056e11],["600519.SH","20221231",1,12345678901234567890]],"has_more":true}}';
// Mocks typed against the real `typeof fetch` input (RequestInfo | URL, init optional), round-1 #5.
type FetchFn=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
describe('tushareCallRaw',()=>{
 it('posts api/params/fields with limit+offset, keeps bytes, sha256, request_id, has_more and raw number literals, never the token in the result',async()=>{
  const fetch=vi.fn<FetchFn>(async()=>new Response(body,{status:200}));
  const r=await tushareCallRaw('income',{ts_code:'600519.SH',start_date:'20140101',report_type:'1'},'ts_code,end_date,report_type,total_revenue',{limit:2000,offset:4000,fetch,token:'tok'});
  expect(fetch.mock.calls[0][0]).toBe(TUSHARE_ENDPOINT);
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({api_name:'income',token:'tok',params:{ts_code:'600519.SH',start_date:'20140101',report_type:'1',limit:2000,offset:4000},fields:'ts_code,end_date,report_type,total_revenue'});
  expect(Buffer.from(r.bytes).toString('utf8')).toBe(body);
  expect(r.sha256).toBe(createHash('sha256').update(body).digest('hex'));
  expect(r).toMatchObject({httpStatus:200,requestId:'r-1',code:0,msg:'',hasMore:true,fields:['ts_code','end_date','report_type','total_revenue']});
  expect(r.items[0]).toEqual(['600519.SH','20231231',{__num:'1'},{__num:'1.5056e11'}]);
  expect(r.items[1][3]).toEqual({__num:'12345678901234567890'});
  expect(JSON.stringify(r)).not.toContain('tok');
 });
 it('returns code/msg for API errors, treats data:null as empty, throws TushareError on HTTP failure or missing token',async()=>{
  const err=await tushareCallRaw('income',{},'',{fetch:async()=>new Response('{"request_id":"r","code":40203,"msg":"抱歉，您每分钟最多访问该接口50次","data":null}'),token:'t'});
  expect(err).toMatchObject({code:40203,msg:'抱歉，您每分钟最多访问该接口50次',items:[],fields:[],hasMore:false});
  await expect(tushareCallRaw('income',{},'',{fetch:async()=>new Response('x',{status:429}),token:'t'})).rejects.toMatchObject({code:429});
  await expect(tushareCallRaw('income',{},'',{fetch:async()=>new Response('{}'),token:''})).rejects.toBeInstanceOf(TushareError);
 });
 it('never puts response bodies into thrown messages',async()=>{
  const e=await tushareCallRaw('income',{},'',{fetch:async()=>new Response('SECRET-BODY',{status:500}),token:'t'}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect(e.message).toBe('HTTP 500');
  const m=await tushareCallRaw('income',{},'',{fetch:async()=>new Response('{"code":0,"data":SECRET-BODY}'),token:'t'}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect(m.message).not.toContain('SECRET');
 });
 it('aborts on the budget and on the per-call timeout',async()=>{
  const ctl=new AbortController();ctl.abort(new Error('budget'));
  const fetch=vi.fn<FetchFn>(async(_u,init)=>{init?.signal?.throwIfAborted();return new Response(body);});
  await expect(tushareCallRaw('income',{},'',{fetch,token:'t',budget:{remainingMs:()=>60_000,signal:ctl.signal}})).rejects.toMatchObject({message:'budget'});
  await expect(tushareCallRaw('income',{},'',{fetch,token:'t',budget:{remainingMs:()=>10_000,signal:new AbortController().signal}})).rejects.toMatchObject({code:-2});
 });
 it('applies the reserve from options (reserveMs 0 leaves the whole remaining time) and caps the response size',async()=>{
  const fetch=vi.fn<FetchFn>(async()=>new Response(body));
  await expect(tushareCallRaw('income',{},'',{fetch,token:'t',reserveMs:0,budget:{remainingMs:()=>10_000,signal:new AbortController().signal}})).resolves.toMatchObject({code:0});
  const big=new Response('x',{headers:{'content-length':String(MAX_TUSHARE_RESPONSE_BYTES+1)}});
  await expect(tushareCallRaw('income',{},'',{fetch:async()=>big,token:'t'})).rejects.toMatchObject({code:-4,message:'response too large'});
  const stream=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_TUSHARE_RESPONSE_BYTES));c.enqueue(new Uint8Array(1));c.close();}}));
  await expect(tushareCallRaw('income',{},'',{fetch:async()=>stream,token:'t'})).rejects.toMatchObject({code:-4});
 });
});
