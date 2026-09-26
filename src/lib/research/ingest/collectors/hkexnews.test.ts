import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {makeMockCtx,type MockStore} from '../../test-support';
import type {ResearchCtx} from '../../store';
import {collectHkexnews,parseTitleSearch} from './hkexnews';
import type {CollectorCompany} from './types';

const fx=(n:string)=>readFileSync(new URL(`../__fixtures__/collectors/${n}`,import.meta.url),'utf8');
const kingdee:CollectorCompany={entity_id:'e-kd',names_en:['Kingdee International Software Group Company Limited'],names_zh:['金蝶国际'],home_market:'HK',cik:null,cninfo_org_id:null,exchange_codes:['0268.HK']};
let ctx:ResearchCtx,store:MockStore;
beforeEach(()=>{({ctx,store}=makeMockCtx() as unknown as {ctx:ResearchCtx;store:MockStore});});

describe('HKEX title search collector',()=>{
 it('parses the result table: release time (HKT→UTC), code, headline, title and PDF link',()=>{
  const rows=parseTitleSearch(fx('hkex-titlesearch-0268.html'));
  expect(rows.length).toBeGreaterThanOrEqual(3);
  expect(rows[0]).toEqual({released_at:'2026-09-03T08:38:00.000Z',stock_code:'00268',short_name:'金蝶國際',headline:'財務報表/環境、社會及管治資料 - [中期/半年度報告]',title:'二零二六年中期報告',document_url:'https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf'});
  expect(rows.every(r=>/^https:\/\/www1\.hkexnews\.hk\/listedco\//.test(r.document_url))).toBe(true);
 });
 it('returns an empty list for a genuine no-results page (recorded) instead of flagging layout drift',()=>{
  expect(parseTitleSearch(fx('hkex-empty-0268.html'))).toEqual([]);
 });
 it('returns an empty list with a layout_changed marker when the table is missing',()=>{
  expect(()=>parseTitleSearch('<html><body>maintenance</body></html>')).toThrow('layout_changed');
 });
 it('looks up the stockId, posts the title search with the date range, and ingests announcements',async()=>{
  const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);
   if(url.includes('/search/prefix.do')){expect(url).toContain('name=0268');return new Response(fx('hkex-prefix-0268.js'),{status:200});}
   if(url.includes('/search/titlesearch.xhtml')){const body=String(init?.body);expect(body).toContain('stockId=9332');expect(body).toContain('from=20260801');expect(body).toContain('to=20260926');return new Response(fx('hkex-titlesearch-0268.html'),{status:200,headers:{'content-type':'text/html'}});}
   return new Response('nope',{status:404});});
  const r=await collectHkexnews({ctx,companies:[kingdee],since:'2026-08-01T00:00:00Z',until:'2026-09-26T00:00:00Z',fetch,minIntervalMs:0,now:()=>new Date('2026-09-26T06:00:00Z')});
  expect(r).toMatchObject({source:'hkexnews',companies:1,lookups:1,ok:true,failures:[]});
  expect(r.inserted).toBeGreaterThanOrEqual(3);
  const row=store.rows('research_source_documents').find(x=>x.url?.endsWith('2026090300863_c.pdf'))!;
  expect(row).toMatchObject({source_type:'FILING',market:'HK',permission:'public',origin_type:'filing',trust_level:'HIGH',entity_ids:['e-kd'],title:'二零二六年中期報告',event_time:'2026-09-03T08:38:00.000Z',available_at:'2026-09-26T06:00:00.000Z',published_at:'2026-09-03'});
  expect(row.metadata).toMatchObject({stock_code:'00268',headline:'財務報表/環境、社會及管治資料 - [中期/半年度報告]',collector:'hkexnews'});
  expect(row.raw_text).toContain('二零二六年中期報告');
  // Only rows inside the window are kept.
  expect(store.rows('research_source_documents').every(x=>x.event_time>='2026-08-01T00:00:00Z')).toBe(true);
 });
 it('reports layout changes and lookup misses as failures without throwing',async()=>{
  const fetch=vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);
   if(url.includes('/search/prefix.do')) return new Response('callback({"stockInfo":[]})',{status:200});
   return new Response('<html>changed</html>',{status:200});});
  const r=await collectHkexnews({ctx,companies:[kingdee,{...kingdee,entity_id:'e2',exchange_codes:['6608.HK'],names_en:['Bairong Inc.']}],since:'2026-08-01T00:00:00Z',fetch,minIntervalMs:0});
  expect(r.failures.map(f=>f.stage)).toEqual(['lookup','lookup']);
  expect(r.ok).toBe(false);
 });
});
