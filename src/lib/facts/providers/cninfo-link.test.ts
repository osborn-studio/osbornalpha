// src/lib/facts/providers/cninfo-link.test.ts
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Budget} from '../types';
import {CNINFO_HISTORY,CNINFO_TOPSEARCH} from '../../research/ingest/collectors/cninfo';
import {cninfoQueryBody,CNINFO_STATIC,linkCninfoFiling,matchesAnnouncement,resetCninfoPacing,type LinkFiling} from './cninfo-link';

beforeEach(()=>resetCninfoPacing());

const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
const ann=(id:string,title:string)=>({announcementId:id,announcementTitle:title,announcementTime:1743552000000,adjunctUrl:`finalpage/2025-04-03/${id}.PDF`,adjunctType:'PDF'});
const page=(list:unknown[],hasMore=false)=>JSON.stringify({announcements:list,hasMore,totalAnnouncement:list.length});
const annual:LinkFiling={form_type:'annual',fiscal_year:2024,period_end:'2024-12-31',available_date:'2025-04-03'};
const server=(pages:string[],onBody?:(b:string)=>void)=>vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);const body=String(init?.body);onBody?.(body);
 if(url===CNINFO_HISTORY){const n=Number(/pageNum=(\d+)/.exec(body)![1]);return new Response(pages[n-1]??page([]),{status:200});}
 if(url===CNINFO_TOPSEARCH)return new Response(JSON.stringify([{code:'000333',orgId:'9900001929',zwjc:'美的集团'}]));
 return new Response('nope',{status:404});
});

describe('matchesAnnouncement',()=>{
 it('needs the fiscal year and a kind word, rejects 摘要/英文/已取消/补充, and 更正 unless the filing was corrected',()=>{
  expect(matchesAnnouncement('贵州茅台：2024年年度报告',annual)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：<em>2024</em>年 年度报告',annual)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告摘要',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告（英文版）',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告（已取消）',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告的补充公告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2023年年度报告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年第三季度报告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2024年年度报告的更正公告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2024年年度报告的更正公告',{...annual,corrected:true})).toBe(true);
  // G1: a restatement (report_type 4) links the plain report of fiscal_year + 1 of the same kind, never a 更正 title
  const restated:LinkFiling={form_type:'restatement',fiscal_year:2023,period_end:'2023-06-30',available_date:'2024-08-03'};
  expect(matchesAnnouncement('贵州茅台：2024年半年度报告',restated)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2023年半年度报告',restated)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2023年半年度报告的更正公告',restated)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告',restated)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年第一季度报告',{...annual,form_type:'q1',period_end:'2024-03-31'})).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年半年度报告',{...annual,form_type:'semiannual'})).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告',{...annual,form_type:'other'})).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告',{...annual,fiscal_year:null})).toBe(false);
 });
 it('report kinds are mutually exclusive: a semiannual title never matches an annual filing and vice versa (round-1 #8)',()=>{
  const semi:LinkFiling={...annual,form_type:'semiannual',period_end:'2024-06-30',available_date:'2024-08-03'};
  for(const t of ['贵州茅台：2024年半年度报告','贵州茅台：2024年半年报','贵州茅台：2024年中期报告','贵州茅台：关于2024年半年度报告的更正公告'])expect(matchesAnnouncement(t,annual),t).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2024年半年度报告的更正公告',{...annual,corrected:true})).toBe(false);
  for(const t of ['贵州茅台：2024年年度报告','贵州茅台：2024年年报','贵州茅台：2024年第三季度报告'])expect(matchesAnnouncement(t,semi),t).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年半年度报告',semi)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年半年报',semi)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年年报',annual)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年第一季度报告',{...annual,form_type:'q3',period_end:'2024-09-30'})).toBe(false);
 });
});

describe('linkCninfoFiling',()=>{
 it('queries available_date ± 3 days with the collector body shape and links the single matching announcement',async()=>{
  let body='';
  const fetch=server([page([ann('1','贵州茅台：2024年年度报告摘要'),ann('2','贵州茅台：2024年年度报告'),ann('3','贵州茅台：关于召开2024年度股东大会的通知')])],b=>{body=b;});
  const r=await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'9900000227'},{fetch,budget:budget(),minIntervalMs:0});
  expect(r).toEqual({document_ref:'2',document_url:`${CNINFO_STATIC}finalpage/2025-04-03/2.PDF`});
  expect(body).toBe(cninfoQueryBody({code:'600519',orgId:'9900000227',column:'sse',availableDate:'2025-04-03',pageNum:1}));
  expect(body).toContain('seDate=2025-03-31%7E2025-04-06');expect(body).toContain('stock=600519%2C9900000227');expect(body).toContain('column=sse');
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("returns 'none' for zero matches and 'ambiguous' for several",async()=>{
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:server([page([ann('1','2024年年度报告摘要')])]),budget:budget(),minIntervalMs:0})).toBe('none');
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:server([page([ann('1','2024年年度报告'),ann('2','2024年年度报告（修订版）')])]),budget:budget(),minIntervalMs:0})).toBe('ambiguous');
 });
 it('walks every page while hasMore and the page is full; a short page ends the walk',async()=>{
  const full=Array.from({length:30},(_,i)=>ann(`f${i}`,`其他公告${i}`));
  const fetch=server([page(full,true),page([ann('77','2024年年度报告')],true)]);
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:budget(),minIntervalMs:0})).toEqual({document_ref:'77',document_url:`${CNINFO_STATIC}finalpage/2025-04-03/77.PDF`});
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('uses column=szse for Shenzhen and resolves a missing orgId via topSearch; BJ and non-report filings never hit the network',async()=>{
  const bodies:string[]=[];
  const fetch=server([page([ann('9','美的集团：2024年年度报告')])],b=>bodies.push(b));
  expect(await linkCninfoFiling(annual,{ts_code:'000333.SZ',cninfo_org_id:null},{fetch,budget:budget(),minIntervalMs:0})).toEqual({document_ref:'9',document_url:`${CNINFO_STATIC}finalpage/2025-04-03/9.PDF`});
  expect(fetch.mock.calls.map(c=>String(c[0]))).toEqual([CNINFO_TOPSEARCH,CNINFO_HISTORY]);
  expect(bodies[1]).toContain('column=szse');expect(bodies[1]).toContain('stock=000333%2C9900001929');
  const noCall=vi.fn();
  expect(await linkCninfoFiling(annual,{ts_code:'830799.BJ',cninfo_org_id:'o'},{fetch:noCall,budget:budget()})).toBe('none');
  expect(await linkCninfoFiling({...annual,form_type:'other'},{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:noCall,budget:budget()})).toBe('none');
  expect(noCall).not.toHaveBeenCalled();
 });
 it('throws on HTTP failure and on an exhausted budget (the caller counts the attempt)',async()=>{
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:async()=>new Response('',{status:500}),budget:budget(),minIntervalMs:0})).rejects.toThrow(/cninfo 500/);
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:vi.fn(),budget:{remainingMs:()=>1000,signal:new AbortController().signal}})).rejects.toThrow(/budget_exhausted/);
 });
 const FIXTURE=new URL('../fixtures/cninfo/600519.SH-2024-annual.json',import.meta.url);
 type Fx={__recorded:{org_id:string;available_date:string;fiscal_year:number;form_type:LinkFiling['form_type']};pages:{request_body:string;http_status:number;bytes:number;sha256:string;body:string}[]};
 const REPORT_URL='https://static.cninfo.com.cn/finalpage/2025-04-03/1222993920.PDF';
 it.skipIf(!existsSync(FIXTURE))('the recorded pages carry raw bytes, sha256, http status and the request body',()=>{
  const fx=JSON.parse(readFileSync(FIXTURE,'utf8')) as Fx;
  expect(fx.pages.length).toBeGreaterThan(0);
  for(const p of fx.pages){
   expect(p.http_status).toBe(200);expect(p.request_body).toContain('seDate=2025-03-31%7E2025-04-06');
   expect(createHash('sha256').update(p.body).digest('hex')).toBe(p.sha256);expect(Buffer.byteLength(p.body)).toBe(p.bytes);
  }
 });
 it.skipIf(!existsSync(FIXTURE))('links the recorded 600519.SH 2024 annual report to exactly one PDF',async()=>{
  const fx=JSON.parse(readFileSync(FIXTURE,'utf8')) as Fx;
  const fetch=server(fx.pages.map(p=>p.body));
  const r=await linkCninfoFiling({form_type:fx.__recorded.form_type,fiscal_year:fx.__recorded.fiscal_year,period_end:`${fx.__recorded.fiscal_year}-12-31`,available_date:fx.__recorded.available_date},{ts_code:'600519.SH',cninfo_org_id:fx.__recorded.org_id},{fetch,budget:budget(),minIntervalMs:0});
  expect(r).toEqual({document_ref:'1222993920',document_url:REPORT_URL});
 });
 it.skipIf(!existsSync(FIXTURE))('G1: a restatement FY2023 announced 2025-04-03 links the plain 2024 annual report from the same recording',async()=>{
  const fx=JSON.parse(readFileSync(FIXTURE,'utf8')) as Fx;
  const r=await linkCninfoFiling({form_type:'restatement',fiscal_year:2023,period_end:'2023-12-31',available_date:'2025-04-03'},{ts_code:'600519.SH',cninfo_org_id:fx.__recorded.org_id},{fetch:server(fx.pages.map(p=>p.body)),budget:budget(),minIntervalMs:0});
  expect(r).toEqual({document_ref:'1222993920',document_url:REPORT_URL});
 });
});

describe('whole-title matching (follow-up P2)',()=>{
 it('rejects documents that merely mention the report: inquiry letters, opinions, resolutions, notices',()=>{
  for(const t of [
   '关于贵州茅台2024年年度报告的信息披露监管问询函','贵州茅台：关于2024年年度报告的信息披露监管问询函','贵州茅台：2024年年度报告的董事会审议意见',
   '贵州茅台：董事会关于2024年年度报告的审议意见','贵州茅台：第四届董事会关于审议2024年年度报告的决议公告','贵州茅台：关于披露2024年年度报告的提示性公告',
   '贵州茅台：2024年年度报告披露时间的公告','贵州茅台：2024年年度报告（草案）','贵州茅台：2024年年度报告全文及摘要','贵州茅台：监事会关于2024年年度报告的书面审核意见',
  ])expect(matchesAnnouncement(t,annual),t).toBe(false);
 });
 it('accepts the report with an optional short name and only the permitted suffixes',()=>{
  for(const t of ['2024年年度报告','贵州茅台2024年年度报告','贵州茅台：2024年年度报告','贵州茅台：2024年年度报告（修订版）','贵州茅台：2024年年度报告（更正后）','贵州茅台：2024年年度报告(更新后)'])expect(matchesAnnouncement(t,annual),t).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告（其他）',annual)).toBe(false);
 });
 it('correction announcements use their own pattern',()=>{
  const c={...annual,corrected:true};
  for(const t of ['贵州茅台：关于2024年年度报告的更正公告','关于2024年年度报告更正公告','贵州茅台：关于2024年年度报告的更正说明公告'])expect(matchesAnnouncement(t,c),t).toBe(true);
  for(const t of ['贵州茅台：2024年年度报告','贵州茅台：关于2024年年度报告的问询函','贵州茅台：关于2024年年度报告的更正公告摘要'])expect(matchesAnnouncement(t,c),t).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2024年年度报告的更正公告',annual)).toBe(false);
 });
 it('an inquiry letter plus the report in one result page links exactly the report',async()=>{
  const fetch=server([page([ann('1','贵州茅台：关于2024年年度报告的信息披露监管问询函'),ann('2','贵州茅台：2024年年度报告'),ann('3','贵州茅台：2024年年度报告的董事会审议意见')])]);
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:budget(),minIntervalMs:0})).toMatchObject({document_ref:'2'});
 });
});

describe('budget handling (follow-up P2)',()=>{
 const issuer={ts_code:'000333.SZ',cninfo_org_id:null};
 it('checks the budget before the org-id lookup and before every request, with fixed codes',async()=>{
  const fetch=vi.fn();
  const ctl=new AbortController();ctl.abort();
  await expect(linkCninfoFiling(annual,issuer,{fetch,budget:{remainingMs:()=>300_000,signal:ctl.signal},minIntervalMs:0})).rejects.toThrow(/^budget_aborted$/);
  await expect(linkCninfoFiling(annual,issuer,{fetch,budget:{remainingMs:()=>20_000,signal:new AbortController().signal},minIntervalMs:0})).rejects.toThrow(/^budget_exhausted$/);
  expect(fetch).not.toHaveBeenCalled();
  // budget runs out between the lookup and the first history request
  let left=300_000;
  const f2=server([page([ann('9','美的集团：2024年年度报告')])]);
  const b:Budget={remainingMs:()=>left,signal:new AbortController().signal};
  const wrapped=vi.fn(async(i:RequestInfo|URL,init?:RequestInit)=>{const r=await f2(i,init);left=10_000;return r;});
  await expect(linkCninfoFiling(annual,issuer,{fetch:wrapped,budget:b,minIntervalMs:0})).rejects.toThrow(/^budget_exhausted$/);
  expect(wrapped).toHaveBeenCalledTimes(1);
 });
 it('passes a combined signal: aborting the budget mid-request cancels fetch and body wait',async()=>{
  const ctl=new AbortController();
  const fetch=vi.fn((_u:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((_,rej)=>init!.signal!.addEventListener('abort',()=>rej(new Error('aborted')))));
  const p=linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:{remainingMs:()=>300_000,signal:ctl.signal},minIntervalMs:0});
  await new Promise(r=>setTimeout(r,10));ctl.abort();
  await expect(p).rejects.toThrow(/^budget_aborted$/);
 });
 it('caps the per-request timeout at remaining minus the 20 s reserve',async()=>{
  const fetch=vi.fn((_u:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((_,rej)=>init!.signal!.addEventListener('abort',()=>rej(new Error('aborted')))));
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:{remainingMs:()=>20_050,signal:new AbortController().signal},minIntervalMs:0})).rejects.toThrow(/^cninfo_timeout$/);
 });
 it('aborting while queued for a pacing slot gives budget_aborted',async()=>{
  const ctl=new AbortController();
  const fetch=server([page([])]);
  const b={remainingMs:()=>300_000,signal:ctl.signal};
  await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:b});   // reserves a slot 500 ms ahead
  const p=linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:b});
  setTimeout(()=>ctl.abort(),20);
  await expect(p).rejects.toThrow(/^budget_aborted$/);
 });
 it('error messages never carry response bodies',async()=>{
  const fetch=async()=>new Response('SECRET-BODY',{status:503});
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:budget(),minIntervalMs:0})).rejects.toThrow(/^cninfo 503$/);
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:async()=>new Response('SECRET-BODY',{status:200}),budget:budget(),minIntervalMs:0})).rejects.toThrow(/^cninfo_bad_body$/);
 });
});

describe('shared pacing (follow-up P2)',()=>{
 const clock=()=>{let t=1_000_000;const starts:number[]=[];return {now:()=>t,sleep:async(ms:number)=>{const target=t+ms;await Promise.resolve();t=Math.max(t,target);},starts,fetch:vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{starts.push(t);return server([page([])])(input,init);})};};
 it('spaces org lookup and history pages >= 500 ms apart',async()=>{
  const c=clock();
  await linkCninfoFiling(annual,{ts_code:'000333.SZ',cninfo_org_id:null},{fetch:c.fetch,budget:budget(),now:c.now,sleep:c.sleep});
  expect(c.starts).toHaveLength(2);expect(c.starts[1]-c.starts[0]).toBeGreaterThanOrEqual(500);
 });
 it('spaces successive and concurrent calls through one module-level slot queue',async()=>{
  vi.useFakeTimers();
  try{
   const starts:number[]=[];
   const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{starts.push(Date.now());return server([page([])])(input,init);});
   const o={fetch,budget:budget()};
   const issuer={ts_code:'600519.SH',cninfo_org_id:'o'};
   await linkCninfoFiling(annual,issuer,o);
   const all=Promise.all([linkCninfoFiling(annual,issuer,o),linkCninfoFiling(annual,issuer,o),linkCninfoFiling(annual,issuer,o)]);
   await vi.advanceTimersByTimeAsync(5000);await all;
   expect(starts).toHaveLength(4);
   for(let i=1;i<starts.length;i++)expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(500);
  }finally{vi.useRealTimers();}
 });
});

describe('real title forms (review G1/1-4)',()=>{
 it('annual title forms: 年度报告 without the doubled 年, long company names',()=>{
  for(const t of ['招商银行2024年度报告','招商银行股份有限公司2024年度报告','招商银行：2024年度报告','招商银行：2024年年度报告','招商银行2024年年报'])expect(matchesAnnouncement(t,annual),t).toBe(true);
  expect(matchesAnnouncement('招商银行2024年度独立董事述职报告',annual)).toBe(false);
  expect(matchesAnnouncement('招商银行2024年度报告',{...annual,form_type:'semiannual'})).toBe(false);
 });
 it('全文 and （A股） are accepted, 正文 and H股 are not',()=>{
  for(const t of ['招商银行：2024年年度报告全文','招商银行2024年度报告全文','招商银行：2024年年度报告（A股）','招商银行：2024年年度报告全文（A股）','招商银行：2024年年度报告(A股)'])expect(matchesAnnouncement(t,annual),t).toBe(true);
  for(const t of ['招商银行：2024年年度报告正文','招商银行：2024年年度报告（H股）','招商银行：2024年年度报告全文（H股）','招商银行：2024年年度报告摘要（A股）'])expect(matchesAnnouncement(t,annual),t).toBe(false);
 });
 it('correction titles for a corrected filing',()=>{
  const c={...annual,corrected:true};
  for(const t of ['贵州茅台：关于2024年年度报告的更正公告','贵州茅台：关于2024年年度报告及摘要的更正公告','贵州茅台：关于2024年年度报告部分内容的更正公告','贵州茅台：关于2024年年度报告及摘要部分内容的更正公告','贵州茅台：关于2024年年度报告的更正的公告','关于更正2024年年度报告的公告','贵州茅台：关于更正2024年年度报告及摘要的公告','招商银行：关于2024年度报告的更正说明公告','贵州茅台：2024年年度报告（更正后）','贵州茅台：2024年年度报告（修订版）'])expect(matchesAnnouncement(t,c),t).toBe(true);
  for(const t of ['贵州茅台：2024年年度报告','贵州茅台：关于2024年年度报告的更正及补充公告','贵州茅台：关于2024年年度报告的更正公告（英文版）','贵州茅台：关于2023年年度报告的更正公告'])expect(matchesAnnouncement(t,c),t).toBe(false);
 });
 it('rejects adjunct urls outside finalpage/<date>/<digits>.PDF and caps paging',async()=>{
  const bad={...ann('5','贵州茅台：2024年年度报告'),adjunctUrl:'../x/5.PDF'};
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:server([page([bad])]),budget:budget(),minIntervalMs:0})).toBe('none');
  const full=Array.from({length:30},(_,i)=>ann(`${100+i}`,`其他${i}`));
  const endless=vi.fn(async()=>new Response(page(full,true)));
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:endless,budget:budget(),minIntervalMs:0})).rejects.toThrow(/^cninfo_too_many_pages$/);
  expect(endless).toHaveBeenCalledTimes(10);
  const two=vi.fn(async()=>new Response(JSON.stringify({announcements:full,hasMore:true,totalpages:2})));
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:two,budget:budget(),minIntervalMs:0})).toBe('none');
  expect(two).toHaveBeenCalledTimes(2);
 });
 it('cancels failed response bodies and caps successful ones',async()=>{
  const cancel=vi.fn();
  const failed=vi.fn(async()=>({ok:false,status:502,body:{cancel}}) as unknown as Response);
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:failed,budget:budget(),minIntervalMs:0})).rejects.toThrow(/^cninfo 502$/);
  expect(cancel).toHaveBeenCalled();
  const huge=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1024*1024));c.enqueue(new Uint8Array(1024*1024+1));c.close();}}),{status:200});
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:async()=>huge,budget:budget(),minIntervalMs:0})).rejects.toThrow(/^cninfo_response_too_large$/);
 });
});
