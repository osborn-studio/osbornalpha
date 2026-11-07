// src/lib/company/inbox.test.ts
// spec §12.1 inbox.test: keyset paging with tied first_seen_at, receipts by event id, rows outside the page
// or outside the filter are never marked, same-issuer same-day fold, muted issuers excluded.
import {describe,expect,it} from 'vitest';
import type {EventKind,EventRow} from './types';
import {
 assembleInbox,decodeInboxCursor,encodeInboxCursor,firstSeenSection,foldSameIssuerDay,formatUnread,inboxFingerprint,
 inboxIssuerIds,isUpdated,readBatches,unreadCounts,READ_BATCH_MAX,UNREAD_CAP,type InboxSources,
} from './inbox';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const hex=(n:number)=>n.toString(16).padStart(64,'0');
const ev=(n:number,issuer:string,firstSeen:string,kind:EventKind='filing_published',occurredOn='2025-10-31'):EventRow=>({
 event_id:hex(n),issuer_id:issuer,market:'US',kind,natural_key:`k${n}`,occurred_on:occurredOn,period_end:null,concept:null,filing_id:null,
 payload:{},meta:{},payload_hash:'h',based_on_rev:1,first_seen_at:firstSeen,payload_changed_at:null,retired_at:null,
 rebuilt_at:firstSeen,rebuild_id:'r',rebuild_batch_id:'b',
});
/** Reference keyset source over (first_seen_at desc, event_id desc); its cursor is opaque to the code under test. */
function fakeSource(events:EventRow[],receipts:Set<string>=new Set()):InboxSources&{calls:{issuers:string[];limit:number}[];receipts:Set<string>}{
 const order=(x:EventRow,y:EventRow)=>x.first_seen_at===y.first_seen_at?(x.event_id<y.event_id?1:-1):(x.first_seen_at<y.first_seen_at?1:-1);
 const calls:{issuers:string[];limit:number}[]=[];
 return {calls,receipts,
  async eventsOfIssuers(issuers,{kinds,cursor,limit}){
   calls.push({issuers,limit});
   let rows=events.filter(e=>e.retired_at===null&&issuers.includes(e.issuer_id)&&(!kinds||kinds.includes(e.kind))).sort(order);
   if(cursor){const [fs,id]=JSON.parse(cursor) as [string,string];rows=rows.filter(e=>e.first_seen_at<fs||(e.first_seen_at===fs&&e.event_id<id));}
   const page=rows.slice(0,limit);
   const last=page[page.length-1];
   return {rows:page,nextCursor:rows.length>limit&&last?JSON.stringify([last.first_seen_at,last.event_id]):null};
  },
  async readEventIds(ids){if(ids.length>100)throw new Error('chunk too large');return new Set(ids.filter(id=>receipts.has(id)));},
 };
}
const T1='2026-11-02T03:20:00.000Z',T0='2026-11-01T03:20:00.000Z';
async function drain(src:InboxSources,q:Omit<Parameters<typeof assembleInbox>[1],'cursor'>){
 const out:string[]=[];let cursor:string|null=null;let guard=0;
 do{const p=await assembleInbox(src,{...q,cursor});out.push(...p.rows.map(r=>r.event_id));cursor=p.nextCursor;}while(cursor!==null&&++guard<50);
 return out;
}

describe('assembleInbox keyset paging',()=>{
 it('pages over tied first_seen_at without gaps or repeats, newest first',async()=>{
  const events=[ev(1,A,T0),ev(2,A,T1),ev(3,B,T1),ev(4,A,T1),ev(5,B,T1),ev(6,C,T1),ev(7,A,T0)];
  const src=fakeSource(events);
  const ids=await drain(src,{issuerIds:[A,B],unreadOnly:false,limit:2});
  expect(ids).toEqual([hex(5),hex(4),hex(3),hex(2),hex(7),hex(1)]);   // C is not watched; ties ordered by event_id desc
  expect(src.calls.every(c=>c.limit<=2)).toBe(true);
 });
 it('attaches read by receipt id, and unreadOnly skips read rows without losing later unread ones',async()=>{
  const events=[1,2,3,4,5,6].map(n=>ev(n,A,T1));
  const src=fakeSource(events,new Set([hex(6),hex(5),hex(3)]));
  const first=await assembleInbox(src,{issuerIds:[A],unreadOnly:false,limit:3,cursor:null});
  expect(first.rows.map(r=>[r.event_id,r.read])).toEqual([[hex(6),true],[hex(5),true],[hex(4),false]]);
  expect(await drain(src,{issuerIds:[A],unreadOnly:true,limit:2})).toEqual([hex(4),hex(2),hex(1)]);
 });
 it('maxScans bounds an unreadOnly page: it may be short but keeps a cursor',async()=>{
  const events=[1,2,3,4,5].map(n=>ev(n,A,T1));
  const src=fakeSource(events,new Set([hex(5),hex(4),hex(3)]));
  const p=await assembleInbox(src,{issuerIds:[A],unreadOnly:true,limit:1,cursor:null,maxScans:2});
  expect(p.rows).toEqual([]);
  expect(p.nextCursor).not.toBeNull();
  const rest=await drain(src,{issuerIds:[A],unreadOnly:true,limit:1});
  expect(rest).toEqual([hex(2),hex(1)]);
 });
 it('no watched issuers → empty page, the source is never called',async()=>{
  const src=fakeSource([ev(1,A,T1)]);
  expect(await assembleInbox(src,{issuerIds:[],unreadOnly:false,limit:50,cursor:null})).toEqual({rows:[],nextCursor:null});
  expect(src.calls).toEqual([]);
 });
});

describe('marking read only touches the ids the client was shown',()=>{
 it('rows outside the page and outside the kind filter stay unread',async()=>{
  const events=[ev(1,A,T1,'fact_revised'),ev(2,A,T1),ev(3,A,T1,'fact_revised'),ev(4,A,T1),ev(5,A,T1)];
  const src=fakeSource(events);
  const page=await assembleInbox(src,{issuerIds:[A],kinds:['filing_published'],unreadOnly:false,limit:2,cursor:null});
  const batches=readBatches(page.rows.map(r=>({eventId:r.event_id,issuerId:r.issuer_id,read:r.read})));
  expect(batches).toEqual([{issuerId:A,eventIds:[hex(5),hex(4)]}]);
  for(const b of batches)for(const id of b.eventIds)src.receipts.add(id);
  const all=await assembleInbox(src,{issuerIds:[A],unreadOnly:false,limit:10,cursor:null});
  expect(all.rows.filter(r=>!r.read).map(r=>r.event_id)).toEqual([hex(3),hex(2),hex(1)]);   // out-of-page (2) and filtered-out (1, 3) untouched
 });
 it('a late-committed older event is not covered by an earlier mark (receipts are ids, not a timestamp)',async()=>{
  const events=[ev(2,A,T1)];
  const src=fakeSource(events);
  const page=await assembleInbox(src,{issuerIds:[A],unreadOnly:false,limit:10,cursor:null});
  for(const b of readBatches(page.rows.map(r=>({eventId:r.event_id,issuerId:r.issuer_id,read:r.read}))))for(const id of b.eventIds)src.receipts.add(id);
  events.push(ev(1,A,T0));   // committed after the mark, first_seen_at older than the marked row
  const after=await assembleInbox(src,{issuerIds:[A],unreadOnly:true,limit:10,cursor:null});
  expect(after.rows.map(r=>r.event_id)).toEqual([hex(1)]);
 });
 it('readBatches: unread only, grouped per issuer in display order, at most READ_BATCH_MAX ids per batch',()=>{
  const rows=[...Array.from({length:READ_BATCH_MAX+3},(_,i)=>({eventId:hex(1000+i),issuerId:A,read:false})),{eventId:hex(1),issuerId:B,read:false},{eventId:hex(2),issuerId:B,read:true}];
  const b=readBatches(rows);
  expect(b.map(x=>[x.issuerId,x.eventIds.length])).toEqual([[A,READ_BATCH_MAX],[A,3],[B,1]]);
 });
});

describe('fold, sections, badges',()=>{
 const pe=(id:string,issuerId:string,occurredOn:string,firstSeenAt:string)=>({eventId:id,issuerId,occurredOn,firstSeenAt});
 it('folds same issuer + same occurred_on + same first-seen day, keeping first-appearance order',()=>{
  const g=foldSameIssuerDay([pe('1',A,'2025-11-06',T1),pe('2',B,'2025-10-31',T1),pe('3',A,'2025-11-06',T1),pe('4',A,'2025-11-06',T0),pe('5',A,'2025-11-05',T1)]);
  expect(g.map(x=>[x.head.eventId,x.rest.map(r=>r.eventId)])).toEqual([['1',['3']],['2',[]],['4',[]],['5',[]]]);
 });
 it('first-seen section is by UTC day',()=>{
  expect(firstSeenSection(T1,'2026-11-02')).toBe('today');
  expect(firstSeenSection(T0,'2026-11-02')).toBe('earlier');
  expect(firstSeenSection(null,'2026-11-02')).toBe('earlier');
 });
 it('isUpdated only when payload_changed_at is strictly after first_seen_at',()=>{
  expect(isUpdated({firstSeenAt:T0,payloadChangedAt:T1})).toBe(true);
  expect(isUpdated({firstSeenAt:T1,payloadChangedAt:T1})).toBe(false);
  expect(isUpdated({firstSeenAt:T1,payloadChangedAt:null})).toBe(false);
  expect(isUpdated({firstSeenAt:'2026-11-02T03:20:00+00:00',payloadChangedAt:'2026-11-02T03:20:00.000Z'})).toBe(false);   // same instant, two spellings
 });
 it('formatUnread: 99+ at the cap, n+ when the scan was incomplete, null when muted',()=>{
  expect(formatUnread(UNREAD_CAP,true)).toBe('99+');
  expect(formatUnread(99,true)).toBe('99');
  expect(formatUnread(0,true)).toBe('0');
  expect(formatUnread(37,false)).toBe('37+');
  expect(formatUnread(UNREAD_CAP,false)).toBe('99+');
  expect(formatUnread(null,true)).toBeNull();
 });
});

describe('muted issuers and cursors',()=>{
 const w=(issuer_id:string,muted:boolean)=>({user_id:'u',issuer_id,note:null,muted,created_at:T0,updated_at:T0});
 it('inbox reads non-muted watches only; an explicit watched issuer is included even when muted; unwatched → null',()=>{
  const watches=[w(A,false),w(B,true)];
  expect(inboxIssuerIds(watches,null)).toEqual([A]);
  expect(inboxIssuerIds(watches,B)).toEqual([B]);
  expect(inboxIssuerIds(watches,C)).toBeNull();
 });
 it('cursor round-trips and is bound to the filter fingerprint',()=>{
  const f=inboxFingerprint({kinds:['fact_revised','filing_published'],unreadOnly:true,issuerId:null});
  expect(f).toBe(inboxFingerprint({kinds:['filing_published','fact_revised'],unreadOnly:true,issuerId:null}));
  const c=encodeInboxCursor('["2026-11-02T03:20:00Z","ab"]',f);
  expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeInboxCursor(c,f)).toBe('["2026-11-02T03:20:00Z","ab"]');
  expect(()=>decodeInboxCursor(c,inboxFingerprint({unreadOnly:false,issuerId:null}))).toThrow('invalid_cursor');
  for(const bad of ['', '***', 'x'.repeat(2000), encodeInboxCursor('',f)])expect(()=>decodeInboxCursor(bad,f)).toThrow('invalid_cursor');
 });
});

describe('unreadCounts',()=>{
 it('saturated issuers drop out of later scans: a sparse issuer behind a flood is still counted right',async()=>{
  const events=[...Array.from({length:120},(_,i)=>ev(1000+i,A,T1)),ev(1,B,T0),ev(2,B,T0),ev(3,B,T0)];
  const src=fakeSource(events);
  const r=await unreadCounts(src,[A,B],{pageSize:50});
  expect(r.counts.get(A)).toBe(UNREAD_CAP);expect(r.counts.get(B)).toBe(3);expect(r.complete).toBe(true);
  expect(src.calls.some(c=>c.issuers.length===1&&c.issuers[0]===B)).toBe(true);   // A was dropped once saturated
 });
 it('counts unread per issuer, stops at the cap (99+), muted issuers are simply not passed in',async()=>{
  const events=[...Array.from({length:150},(_,i)=>ev(10+i,A,T1)),ev(1,B,T0),ev(2,B,T0)];
  const src=fakeSource(events,new Set([hex(1)]));
  const r=await unreadCounts(src,[A,B],{pageSize:40});
  expect(r.complete).toBe(true);
  expect(r.counts.get(A)).toBe(UNREAD_CAP);
  expect(r.counts.get(B)).toBe(1);
 });
 it('reports an incomplete scan as lower bounds',async()=>{
  const events=Array.from({length:30},(_,i)=>ev(10+i,A,T1));
  const r=await unreadCounts(fakeSource(events),[A],{pageSize:10,maxScans:2});
  expect(r).toEqual({counts:new Map([[A,20]]),complete:false});
 });
 it('no issuers → complete, no calls',async()=>{
  const src=fakeSource([]);
  expect(await unreadCounts(src,[])).toEqual({counts:new Map(),complete:true});
  expect(src.calls).toEqual([]);
 });
});
