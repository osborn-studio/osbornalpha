import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {makeMockCtx,type MockStore} from '../../test-support';
import type {ResearchCtx} from '../../store';
import {collectCninfo,resolveOrgId} from './cninfo';
import type {CollectorCompany} from './types';

const fx=(n:string)=>readFileSync(new URL(`../__fixtures__/collectors/${n}`,import.meta.url),'utf8');
const hundsun:CollectorCompany={entity_id:'e-hs',names_en:['Hundsun Technologies Inc.'],names_zh:['恒生电子'],home_market:'A',cik:null,cninfo_org_id:null,exchange_codes:['600570.SH']};
let ctx:ResearchCtx,store:MockStore;
beforeEach(()=>{({ctx,store}=makeMockCtx() as unknown as {ctx:ResearchCtx;store:MockStore});});
const ok=(body:string)=>new Response(body,{status:200,headers:{'content-type':'application/json'}});

describe('cninfo collector',()=>{
 it('resolves a missing orgId through topSearch by exact code and ingests announcements with event_time from the timestamp',async()=>{
  const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);
   if(url.includes('topSearch/query')){expect(String(init?.body)).toContain('keyWord=600570');return ok(fx('cninfo-topsearch-600570.json'));}
   if(url.includes('hisAnnouncement/query')){const body=String(init?.body);expect(body).toContain('stock=600570%2Cgssh0600570');expect(body).toContain('column=sse');return ok(fx('cninfo-his-600570.json'));}
   return new Response('nope',{status:404});});
  const r=await collectCninfo({ctx,companies:[hundsun],since:'2026-09-01T00:00:00Z',until:'2026-09-26T00:00:00Z',fetch,minIntervalMs:0,now:()=>new Date('2026-09-26T05:00:00Z')});
  expect(r).toMatchObject({source:'cninfo',companies:1,lookups:1,ok:true,failures:[]});
  expect(r.inserted).toBe(5);
  const rows=store.rows('research_source_documents');
  const first=rows.find(x=>x.metadata?.announcement_id==='1225576776')!;
  expect(first).toMatchObject({source_type:'FILING',market:'A',permission:'public',origin_type:'filing',trust_level:'HIGH',entity_ids:['e-hs'],
   url:'http://static.cninfo.com.cn/finalpage/2026-09-23/1225576776.PDF',event_time:new Date(1790092800000).toISOString(),available_at:'2026-09-26T05:00:00.000Z',published_at:'2026-09-23'});
  expect(first.title).toContain('恒生电子');
  expect(first.raw_text).toContain(first.title);expect(first.raw_text).toContain(first.url);
  expect(first.metadata).toMatchObject({sec_code:'600570',org_id:'gssh0600570',adjunct_type:'PDF',collector:'cninfo'});
  // Rerun: all duplicates, no second lookup once the orgId is known.
  const again=await collectCninfo({ctx,companies:[{...hundsun,cninfo_org_id:'gssh0600570'}],since:'2026-09-01T00:00:00Z',until:'2026-09-26T00:00:00Z',fetch,minIntervalMs:0});
  expect(again).toMatchObject({inserted:0,duplicates:5,lookups:0});
 });
 it('uses column=szse for Shenzhen codes and reports a lookup failure when topSearch has no exact match',async()=>{
  const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);
   if(url.includes('topSearch/query')) return ok(JSON.stringify([{code:'300034',orgId:'gssz0300034',zwjc:'其他'}]));
   if(url.includes('hisAnnouncement/query')){expect(String(init?.body)).toContain('column=szse');return ok(JSON.stringify({announcements:[],hasMore:false,totalAnnouncement:0}));}
   return new Response('nope',{status:404});});
  const r=await collectCninfo({ctx,companies:[{...hundsun,entity_id:'e-th',names_zh:['同花顺'],exchange_codes:['300033.SZ']},{...hundsun,entity_id:'e-known',cninfo_org_id:'gssz0300059',exchange_codes:['300059.SZ']}],since:'2026-09-01T00:00:00Z',fetch,minIntervalMs:0});
  expect(r.failures).toEqual([{company:'Hundsun Technologies Inc.',stage:'lookup',message:expect.stringMatching(/orgId/),url:expect.stringContaining('topSearch')}]);
  expect(r.fetched).toBe(0);expect(r.ok).toBe(false);
 });
 it('follows hasMore pages up to maxPerCompany and isolates HTTP failures per company',async()=>{
  const page=(n:number,hasMore:boolean)=>JSON.stringify({hasMore,totalAnnouncement:60,announcements:Array.from({length:30},(_,i)=>({announcementId:`${n}-${i}`,announcementTitle:`公告 ${n}-${i}`,announcementTime:1790000000000+i*1000,adjunctUrl:`finalpage/2026-09-20/${n}-${i}.PDF`,adjunctType:'PDF',secCode:'600570',orgId:'gssh0600570'}))});
  let calls=0;
  const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const body=String(init?.body);if(body.includes('stock=600446')) return new Response('boom',{status:503});calls++;const pn=Number(/pageNum=(\d+)/.exec(body)?.[1]);return ok(page(pn,pn===1));});
  const r=await collectCninfo({ctx,companies:[{...hundsun,cninfo_org_id:'gssh0600570'},{...hundsun,entity_id:'e-kd',names_zh:['金证股份'],cninfo_org_id:'gssh0600446',exchange_codes:['600446.SH']}],since:'2026-09-01T00:00:00Z',fetch,minIntervalMs:0,maxPerCompany:45});
  expect(calls).toBe(2);
  expect(r.inserted).toBe(45);
  expect(r.failures).toEqual([{company:'Hundsun Technologies Inc.',stage:'list',message:expect.stringMatching(/503/),url:expect.stringContaining('hisAnnouncement')}]);
 });
 it('resolveOrgId matches the exact code only',async()=>{
  const fetch=vi.fn(async()=>ok(fx('cninfo-topsearch-600570.json')));
  expect(await resolveOrgId('600570',{fetch,userAgent:'ua'})).toEqual({orgId:'gssh0600570',name:'恒生电子',category:'A股'});
  expect(await resolveOrgId('600571',{fetch,userAgent:'ua'})).toBeNull();
 });
});
