// src/lib/documents/sources/hkexnews.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {hkexSourceRef,hkexnewsAdapter} from './hkexnews';
import {HOST_POLICY,makeDocBudget,politeHttp} from './shared';
import type {DocScopeRow} from '../types';

const fx=(n:string)=>readFileSync(new URL(`../../research/ingest/__fixtures__/collectors/${n}`,import.meta.url),'utf8');
const budget=makeDocBudget(null);
const NOW=new Date('2026-11-06T00:00:00Z');
const scope=(code='00268'):DocScopeRow=>({issuer_id:'i',source:'hkexnews',reasons:[],priority:10,fetch_key:code,backfill_cursor:{},backfill_done:false,poll_cursor:{},next_due_at:NOW.toISOString(),lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:NOW.toISOString()});
/** zh = the recorded Chinese page; en defaults to the same layout with the _e files (no English fixture is recorded yet: the English path is UNVERIFIED until commander step b records a real lang=en page; this synthetic page cannot show English titles, headlines or real _e URLs). */
function server(zh:string,en=zh.replace(/_c\.pdf/g,'_e.pdf')){
 const calls:{url:string;body:string}[]=[];
 const http=politeHttp({...HOST_POLICY.hkexnews,sleep:async()=>{},fetch:async(u,init)=>{
  const url=String(u);calls.push({url,body:String(init?.body??'')});
  if(url.includes('/search/prefix.do'))return new Response(fx('hkex-prefix-0268.js'));
  return new Response(url.includes('lang=en')?en:zh,{headers:{'content-type':'text/html'}});
 }});
 return {http,calls};
}
const SEG={id:'y2026',from:'2026-01-01',to:'2026-11-06'};

describe('hkexnewsAdapter',()=>{
 it('source_ref is the PDF file id',()=>{
  expect(hkexSourceRef('https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf')).toBe('2026090300863_c');
  expect(hkexSourceRef('https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0903/2026090300863_e.htm')).toBe('2026090300863_e');
  expect(hkexSourceRef('not a url')).toBeNull();
 });
 it('recorded table: periodic classes only by default, stable order, headline kept; the stockId lookup uses the 4-digit name',async()=>{
  const {http,calls}=server(fx('hkex-titlesearch-0268.html'));
  const rows=await hkexnewsAdapter({http}).list(scope(),SEG,budget);
  expect(rows.map(r=>r.source_ref)).toEqual(['2026081100556_c','2026081100556_e','2026090300863_c','2026090300863_e']);
  expect(rows[2]).toEqual({source_ref:'2026090300863_c',source_url:'https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf',title:'二零二六年中期報告',
   form_type:'財務報表/環境、社會及管治資料 - [中期/半年度報告]',headline:'財務報表/環境、社會及管治資料 - [中期/半年度報告]',published_at:'2026-09-03T08:38:00.000Z',precision:'instant'});
  expect(calls[0].url).toContain('name=0268');
  const q=new URLSearchParams(calls[1].body);
  expect(q.get('lang')).toBe('ZH');expect(q.get('stockId')).toBe('9332');expect(q.get('from')).toBe('20260101');expect(q.get('to')).toBe('20261106');
  expect(calls[2].url).toContain('lang=en');expect(new URLSearchParams(calls[2].body).get('lang')).toBe('EN');
 });
 it('allAnnouncements keeps every row; the stockId is looked up once per run',async()=>{
  const {http,calls}=server(fx('hkex-titlesearch-0268.html'));
  const a=hkexnewsAdapter({http,allAnnouncements:true});
  expect((await a.list(scope(),SEG,budget))).toHaveLength(6);
  expect(await hkexnewsAdapter({http:server(fx('hkex-titlesearch-0268.html')).http,languages:['zh']}).list(scope(),SEG,budget)).toHaveLength(2);
  await a.list(scope(),{id:'y2025',from:'2025-01-01',to:'2025-12-31'},budget);
  expect(calls.filter(c=>c.url.includes('prefix.do'))).toHaveLength(1);
 });
 it('an empty result page is an empty list; layout drift and an unknown code throw',async()=>{
  expect(await hkexnewsAdapter({http:server(fx('hkex-empty-0268.html')).http}).list(scope(),SEG,budget)).toEqual([]);
  await expect(hkexnewsAdapter({http:server('<html>maintenance</html>').http}).list(scope(),SEG,budget)).rejects.toThrow('layout_changed');
  await expect(hkexnewsAdapter({http:server('').http}).list(scope('06608'),SEG,budget)).rejects.toThrow('hkex_stock_unresolved');
 });
 it('completeness: total-records splits the window, a damaged row throws, an off-allowlist link is reported',async()=>{
  const page=fx('hkex-titlesearch-0268.html');
  const zh=(http:ReturnType<typeof politeHttp>)=>hkexnewsAdapter({http,languages:['zh']});
  // advertised 4 but 3 shown over a 2-day window: split into two single days (each page now advertises 3)
  const calls:string[]=[];
  const http=politeHttp({...HOST_POLICY.hkexnews,sleep:async()=>{},fetch:async(u,init)=>{
   const url=String(u);if(url.includes('prefix.do'))return new Response(fx('hkex-prefix-0268.js'));
   const q=new URLSearchParams(String(init?.body));calls.push(`${q.get('from')}-${q.get('to')}`);
   return new Response(q.get('from')===q.get('to')?page:page.replace('共有 3 紀錄','共有 4 紀錄'));
  }});
  const rows=await zh(http).list(scope(),{id:'x',from:'2026-01-01',to:'2026-01-02'},budget);
  expect(calls).toEqual(['20260101-20260102','20260101-20260101','20260102-20260102']);
  expect(rows).toHaveLength(2);   // the same two periodic rows twice, de-duplicated by source_ref
  // still short on a single day → hkex_truncated
  const short=server(page.replace('共有 3 紀錄','共有 9 紀錄')).http;
  await expect(zh(short).list(scope(),{id:'x',from:'2026-01-01',to:'2026-01-02'},budget)).rejects.toThrow('hkex_truncated');
  // more rows than advertised, or a missing total → layout_changed
  await expect(zh(server(page.replace('共有 3 紀錄','共有 2 紀錄')).http).list(scope(),SEG,budget)).rejects.toThrow('layout_changed');
  await expect(zh(server(page.replace(/total-records/g,'x-records')).http).list(scope(),SEG,budget)).rejects.toThrow('layout_changed');
  // a damaged release-time cell: the row is not silently dropped
  await expect(zh(server(page.replace('03/09/2026 16:38','??')).http).list(scope(),SEG,budget)).rejects.toThrow('layout_changed');
  // an absolute link to another host never reaches the fetcher: dropped and reported
  const evil=page.replace('/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf','http://169.254.169.254/2026090300863_c.pdf');
  const a=hkexnewsAdapter({http:server(evil).http,languages:['zh']});
  expect((await a.list(scope(),SEG,budget)).map(r=>r.source_ref)).toEqual(['2026081100556_c']);
  expect(a.rejected).toEqual([{source_ref:'2026090300863_c',url:'http://169.254.169.254/2026090300863_c.pdf',reason:'host_not_allowed: 169.254.169.254'}]);
 });
});
