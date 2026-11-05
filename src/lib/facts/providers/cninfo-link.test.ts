// src/lib/facts/providers/cninfo-link.test.ts
import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import type {Budget} from '../types';
import {CNINFO_HISTORY,CNINFO_TOPSEARCH} from '../../research/ingest/collectors/cninfo';
import {cninfoQueryBody,CNINFO_STATIC,linkCninfoFiling,matchesAnnouncement,type LinkFiling} from './cninfo-link';

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
 it('needs the fiscal year and a kind word, rejects 摘要/英文/已取消/补充, and 更正 unless the filing is a restatement or was corrected',()=>{
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
  expect(matchesAnnouncement('贵州茅台：关于2023年半年度报告的更正公告',{form_type:'restatement',fiscal_year:2023,period_end:'2023-06-30',available_date:'2024-08-03'})).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2023年半年度报告',{form_type:'restatement',fiscal_year:2023,period_end:'2023-06-30',available_date:'2024-08-03'})).toBe(false);
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
  const fetch=server([page(full,true),page([ann('x','2024年年度报告')],true)]);
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:budget(),minIntervalMs:0})).toEqual({document_ref:'x',document_url:`${CNINFO_STATIC}finalpage/2025-04-03/x.PDF`});
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
 it.skipIf(!existsSync(FIXTURE))('links the recorded 600519.SH 2024 annual report to exactly one PDF',async()=>{
  const fx=JSON.parse(readFileSync(FIXTURE,'utf8')) as {__recorded:{org_id:string;available_date:string;fiscal_year:number;form_type:LinkFiling['form_type']};pages:unknown[]};
  const fetch=server(fx.pages.map(p=>JSON.stringify(p)));
  const r=await linkCninfoFiling({form_type:fx.__recorded.form_type,fiscal_year:fx.__recorded.fiscal_year,period_end:`${fx.__recorded.fiscal_year}-12-31`,available_date:fx.__recorded.available_date},{ts_code:'600519.SH',cninfo_org_id:fx.__recorded.org_id},{fetch,budget:budget(),minIntervalMs:0});
  expect(r).toMatchObject({document_ref:expect.stringMatching(/^\d+$/),document_url:expect.stringMatching(/^http:\/\/static\.cninfo\.com\.cn\/.+\.PDF$/i)});
 });
});
