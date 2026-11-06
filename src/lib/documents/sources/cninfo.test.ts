// src/lib/documents/sources/cninfo.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {cninfoAdapter,parseCninfoKey} from './cninfo';
import {makeDocBudget,politeHttp} from './shared';
import type {DocScopeRow} from '../types';

const fx=(n:string)=>readFileSync(new URL(`../../research/ingest/__fixtures__/collectors/${n}`,import.meta.url),'utf8');
const budget=makeDocBudget(null);
const NOW=new Date('2026-11-06T00:00:00Z');
const scope=(key:string):DocScopeRow=>({issuer_id:'i',source:'cninfo',reasons:[],priority:10,fetch_key:key,backfill_cursor:{},backfill_done:false,poll_cursor:{},next_due_at:NOW.toISOString(),lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:NOW.toISOString()});
const ann=(id:number,title:string,day:number)=>({announcementId:String(id),announcementTitle:title,announcementTime:Date.UTC(2025,2,day)-8*3600_000,adjunctUrl:`finalpage/2025-03-${String(day).padStart(2,'0')}/${id}.PDF`,adjunctType:'PDF'});
function server(pages:unknown[]){
 const bodies:string[]=[];
 const http=politeHttp({sleep:async()=>{},fetch:async(u,init)=>{
  const url=String(u);const body=String(init?.body??'');
  if(url.includes('topSearch'))return new Response(fx('cninfo-topsearch-600570.json'));
  bodies.push(body);
  const n=Number(new URLSearchParams(body).get('pageNum'));
  return new Response(JSON.stringify(pages[n-1]??{announcements:[],hasMore:false}));
 }});
 return {http,bodies};
}

describe('cninfoAdapter',()=>{
 it('fetch key parsing',()=>{
  expect(parseCninfoKey('600570,gssh0600570')).toEqual({code:'600570',orgId:'gssh0600570'});
  expect(parseCninfoKey('000001,')).toEqual({code:'000001',orgId:null});
  expect(()=>parseCninfoKey('600570.SH')).toThrow('invalid_fetch_key');
 });
 it('backfill segments are calendar years; poll is one window',()=>{
  const a=cninfoAdapter({http:politeHttp()});
  expect(a.segments(scope('600570,x'),'backfill',2025,NOW).map(s=>s.id)).toEqual(['y2025','y2026']);
  expect(a.segments(scope('600570,x'),'poll',2025,NOW)).toHaveLength(1);
  expect(a.coverageGap).toBeNull();
 });
 it('recorded page: non-periodic announcements are filtered by default and kept with allAnnouncements',async()=>{
  const page=JSON.parse(fx('cninfo-his-600570.json'));
  expect((await cninfoAdapter({http:server([page]).http}).list(scope('600570,gssh0600570'),{id:'y2026',from:'2026-01-01',to:'2026-11-06'},budget))).toEqual([]);
  const {http,bodies}=server([page]);
  const all=await cninfoAdapter({http,allAnnouncements:true}).list(scope('600570,gssh0600570'),{id:'y2026',from:'2026-01-01',to:'2026-11-06'},budget);
  expect(all).toHaveLength(5);
  expect(all[0]).toMatchObject({source_ref:'1225553659',source_url:'http://static.cninfo.com.cn/finalpage/2026-09-09/1225553659.PDF',form_type:'PDF',published_at:'2026-09-08T16:00:00.000Z',precision:'date'});
  const q=new URLSearchParams(bodies[0]);
  expect(q.get('stock')).toBe('600570,gssh0600570');expect(q.get('column')).toBe('sse');expect(q.get('seDate')).toBe('2026-01-01~2026-11-06');expect(q.get('category')).toBe('');
  expect(bodies).toHaveLength(1);   // hasMore=true but a short page is the last page
 });
 it('walks every page, keeps periodic reports, resolves an unknown orgId by topSearch',async()=>{
  const filler=Array.from({length:29},(_,i)=>ann(1000+i,`关于第${i}次董事会决议的公告`,10));
  const pages=[{announcements:[ann(1,'恒生电子2024年年度报告',28),...filler],hasMore:true},{announcements:[ann(2,'恒生电子2024年年度报告摘要',28),ann(3,'恒生电子2025年第一季度报告',29)],hasMore:false}];
  const {http,bodies}=server(pages);
  const rows=await cninfoAdapter({http}).list(scope('600570,'),{id:'y2025',from:'2025-01-01',to:'2025-12-31'},budget);
  expect(rows.map(r=>r.source_ref)).toEqual(['1','3']);
  expect(bodies).toHaveLength(2);
  expect(new URLSearchParams(bodies[0]).get('stock')).toBe('600570,gssh0600570');
 });
 it('szse column for non-6 codes; malformed rows are layout_changed',async()=>{
  const {http,bodies}=server([{announcements:[{announcementId:'1'}],hasMore:false}]);
  await expect(cninfoAdapter({http}).list(scope('000001,gssz0000001'),{id:'y2025',from:'2025-01-01',to:'2025-12-31'},budget)).rejects.toThrow('layout_changed');
  expect(new URLSearchParams(bodies[0]).get('column')).toBe('szse');
 });
});
