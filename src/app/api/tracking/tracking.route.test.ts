// src/app/api/tracking/tracking.route.test.ts
// spec §6.2 / §11 / §12.1 tracking routes: 401, private no-store on every response, CSRF (Origin + JSON),
// eventIds validation, import-watchlist, inbox paging/filters/muted/gating. issuer_events reads go through
// the SERVICE-ROLE CompanyDb with exactly the user's watched issuer ids (§0 #64); watches and receipts through
// the SESSION CompanyDb.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {EventRow,WatchRow} from '@/lib/company/types';
import {CompanyDbError} from '@/lib/company/types';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER='11111111-1111-4111-8111-111111111111';
const hex=(n:number)=>n.toString(16).padStart(64,'0');
const m=vi.hoisted(()=>({
 user:null as null|{id:string},
 session:{watchesOf:vi.fn(),upsertWatch:vi.fn(),patchWatch:vi.fn(),deleteWatch:vi.fn(),markRead:vi.fn(),readEventIds:vi.fn()},
 service:{eventsOfIssuers:vi.fn()},
 anonDb:{coverageOf:vi.fn()},
 resolve:vi.fn(),selectIssuer:vi.fn(),watchlistTickers:vi.fn(),loadIssuerLites:vi.fn(),gate:vi.fn(),
}));
vi.mock('@/lib/supabase/server',()=>({
 serverIsSupabaseConfigured:()=>true,
 getServerSupabase:async()=>({tag:'session',auth:{getUser:async()=>({data:{user:m.user}})},
  from:(t:string)=>({select:()=>({order:()=>({order:()=>({range:async(a:number,b:number)=>t==='watchlist_items'?m.watchlistTickers(a,b):{data:[],error:null}})})})})}),
}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({tag:'admin'})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({tag:'anon'})}));
vi.mock('@/lib/company/db',async(orig)=>({...await orig<typeof import('@/lib/company/db')>(),supabaseCompanyDb:(c:{tag:string})=>c.tag==='session'?m.session:c.tag==='admin'?m.service:m.anonDb}));
vi.mock('@/lib/db/table-client',async(orig)=>({...await orig<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>({select:m.selectIssuer})}));
vi.mock('@/lib/entities/resolve',async(orig)=>({...await orig<typeof import('@/lib/entities/resolve')>(),resolveIssuer:m.resolve}));
vi.mock('@/lib/company/tracking-issuers',async(orig)=>({...await orig<typeof import('@/lib/company/tracking-issuers')>(),loadIssuerLites:m.loadIssuerLites}));
vi.mock('@/lib/company/deps',()=>({productionEventGateDeps:()=>({})}));
vi.mock('@/lib/company/event-dto',()=>({gateEventRows:m.gate}));

import {GET as getWatches,POST as postWatch} from './watches/route';
import {PATCH as patchWatch,DELETE as deleteWatch} from './watches/[issuerId]/route';
import {POST as postRead} from './watches/[issuerId]/read/route';
import {POST as postImport} from './watches/import-watchlist/route';
import {GET as getInbox} from './inbox/route';

const ORIGIN='https://alpha.example';
const json=(method:string,path:string,body:unknown,headers:Record<string,string>={})=>new Request(`${ORIGIN}${path}`,{method,body:JSON.stringify(body),headers:{'content-type':'application/json',origin:ORIGIN,...headers}});
const ctx=(issuerId:string)=>({params:Promise.resolve({issuerId})});
const w=(issuer_id:string,p:Partial<WatchRow>={}):WatchRow=>({user_id:USER,issuer_id,note:null,muted:false,created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',...p});
const ev=(n:number,issuer:string,first:string):EventRow=>({event_id:hex(n),issuer_id:issuer,market:'US',kind:'filing_published',natural_key:`k${n}`,occurred_on:'2025-10-31',period_end:null,concept:null,filing_id:null,payload:{},meta:{},payload_hash:'h',based_on_rev:1,first_seen_at:first,payload_changed_at:null,retired_at:null,rebuilt_at:first,rebuild_id:'r',rebuild_batch_id:'b'});
const pub=(r:EventRow)=>({eventId:r.event_id,issuerId:r.issuer_id,market:r.market,kind:r.kind,naturalKey:r.natural_key,occurredOn:r.occurred_on,periodEnd:null,concept:null,filingId:null,payload:{},meta:{},firstSeenAt:r.first_seen_at,payloadChangedAt:null,filing:null});
const expectPrivate=(res:Response)=>expect(res.headers.get('cache-control')).toBe('private, no-store');

beforeEach(()=>{
 vi.clearAllMocks();
 m.user={id:USER};
 m.session.watchesOf.mockResolvedValue([w(A),w(B,{muted:true})]);
 m.session.readEventIds.mockImplementation(async()=>new Set<string>());
 m.service.eventsOfIssuers.mockResolvedValue({rows:[],nextCursor:null});
 m.anonDb.coverageOf.mockResolvedValue([]);
 m.loadIssuerLites.mockResolvedValue({issuers:[],securities:[]});
 m.gate.mockImplementation(async(rows:EventRow[])=>({events:rows.map(pub),evidence:{f:{factId:'f'}}}));
 m.selectIssuer.mockResolvedValue([{issuer_id:A,status:'active',merged_into:null}]);
});

describe('authentication and headers',()=>{
 it('every route answers 401 not_authenticated with private, no-store when signed out',async()=>{
  m.user=null;
  const responses=[
   await getWatches(),
   await postWatch(json('POST','/api/tracking/watches',{issuerId:A})),
   await patchWatch(json('PATCH',`/api/tracking/watches/${A}`,{muted:true}),ctx(A)),
   await deleteWatch(json('DELETE',`/api/tracking/watches/${A}`,{}),ctx(A)),
   await postRead(json('POST',`/api/tracking/watches/${A}/read`,{eventIds:[hex(1)]}),ctx(A)),
   await postImport(json('POST','/api/tracking/watches/import-watchlist',{})),
   await getInbox(new Request(`${ORIGIN}/api/tracking/inbox`)),
  ];
  for(const res of responses){expect(res.status).toBe(401);expectPrivate(res);expect(await res.json()).toEqual({error:{code:'not_authenticated',message:expect.any(String)}});}
 });
 it('mutations require application/json and a same-origin Origin',async()=>{
  const noType=new Request(`${ORIGIN}/api/tracking/watches`,{method:'POST',body:'{}',headers:{origin:ORIGIN}});
  const r1=await postWatch(noType);expect(r1.status).toBe(415);expectPrivate(r1);
  const r2=await postWatch(json('POST','/api/tracking/watches',{issuerId:A},{origin:'https://evil.example'}));expect(r2.status).toBe(403);
  const r3=await deleteWatch(new Request(`${ORIGIN}/api/tracking/watches/${A}`,{method:'DELETE',headers:{origin:ORIGIN}}),ctx(A));expect(r3.status).toBe(415);
  expect(m.session.upsertWatch).not.toHaveBeenCalled();expect(m.session.deleteWatch).not.toHaveBeenCalled();
 });
});

describe('GET /api/tracking/watches',()=>{
 it('reads events with the service client for the NON-muted watched issuers only and labels 99+',async()=>{
  m.service.eventsOfIssuers.mockResolvedValue({rows:Array.from({length:120},(_,i)=>ev(i+1,A,'2026-11-02T00:00:00Z')),nextCursor:null});
  const res=await getWatches();
  expect(res.status).toBe(200);expectPrivate(res);
  const body=await res.json();
  expect(m.service.eventsOfIssuers).toHaveBeenCalledWith([A],expect.objectContaining({limit:200}));
  expect(body).toMatchObject({count:2,limit:200,unreadComplete:true});
  const byId=Object.fromEntries(body.watches.map((c:{issuerId:string})=>[c.issuerId,c]));
  expect(byId[A]).toMatchObject({unread:100,unreadLabel:'99+',muted:false});
  expect(byId[B]).toMatchObject({unread:null,unreadLabel:null,muted:true});
 });
});

describe('POST /api/tracking/watches',()=>{
 it('201 on create by ticker, 200 with the original row when it exists',async()=>{
  m.resolve.mockResolvedValue({issuer_id:C,status:'active',names:{zh:null,en:'X'},identifiers:{cik:null,lei:null,usci:null},securities:[]});
  m.session.upsertWatch.mockResolvedValueOnce({row:w(C),created:true}).mockResolvedValueOnce({row:w(C,{note:'kept'}),created:false});
  const r1=await postWatch(json('POST','/api/tracking/watches',{ticker:'00700.HK'}));
  expect(r1.status).toBe(201);expect((await r1.json()).watch).toMatchObject({issuerId:C,created:true});
  const r2=await postWatch(json('POST','/api/tracking/watches',{ticker:'00700.HK'}));
  expect(r2.status).toBe(200);expect((await r2.json()).watch).toMatchObject({issuerId:C,note:'kept',created:false});
  expect(m.session.upsertWatch).toHaveBeenCalledWith(USER,C);
 });
 it('409 watch_limit, 404 unknown_ticker, 400 for a malformed body',async()=>{
  m.session.upsertWatch.mockRejectedValue(new CompanyDbError('watch_limit'));
  expect((await postWatch(json('POST','/api/tracking/watches',{issuerId:A}))).status).toBe(409);
  m.resolve.mockResolvedValue(null);
  const r=await postWatch(json('POST','/api/tracking/watches',{ticker:'ZZZZ'}));
  expect(r.status).toBe(404);expect((await r.json()).error.code).toBe('unknown_ticker');
  for(const body of [{},{issuerId:A,ticker:'AAPL'},{issuerId:'nope'},{ticker:'a b'}]){
   const x=await postWatch(json('POST','/api/tracking/watches',body));expect(x.status).toBe(400);expectPrivate(x);
  }
 });
 it('an unknown issuer id is 404 unknown_issuer',async()=>{
  m.selectIssuer.mockResolvedValue([]);
  const r=await postWatch(json('POST','/api/tracking/watches',{issuerId:C}));
  expect(r.status).toBe(404);expect((await r.json()).error.code).toBe('unknown_issuer');
 });
});

describe('PATCH / DELETE /api/tracking/watches/[issuerId]',()=>{
 it('patches note and muted; validates; 404 when not watching',async()=>{
  m.session.patchWatch.mockResolvedValueOnce(w(A,{note:'x',muted:true})).mockResolvedValueOnce(null);
  const ok=await patchWatch(json('PATCH',`/api/tracking/watches/${A}`,{note:'x',muted:true}),ctx(A));
  expect(ok.status).toBe(200);expect(m.session.patchWatch).toHaveBeenCalledWith(USER,A,{note:'x',muted:true});
  expect((await patchWatch(json('PATCH',`/api/tracking/watches/${A}`,{muted:false}),ctx(A))).status).toBe(404);
  for(const body of [{},{note:'a'.repeat(2001)},{muted:'yes'},{other:1}])expect((await patchWatch(json('PATCH',`/api/tracking/watches/${A}`,body),ctx(A))).status).toBe(400);
  expect((await patchWatch(json('PATCH','/api/tracking/watches/nope',{muted:true}),ctx('nope'))).status).toBe(400);
 });
 it('deletes (receipts cascade in the database); 404 when absent',async()=>{
  m.session.deleteWatch.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await deleteWatch(json('DELETE',`/api/tracking/watches/${A}`,{}),ctx(A))).status).toBe(200);
  expect((await deleteWatch(json('DELETE',`/api/tracking/watches/${A}`,{}),ctx(A))).status).toBe(404);
 });
});

describe('POST /api/tracking/watches/[issuerId]/read',()=>{
 it('writes receipts for exactly the posted ids',async()=>{
  m.session.markRead.mockResolvedValue({inserted:2});
  const res=await postRead(json('POST',`/api/tracking/watches/${A}/read`,{eventIds:[hex(1),hex(2),hex(1)]}),ctx(A));
  expect(res.status).toBe(200);expectPrivate(res);
  expect(await res.json()).toEqual({inserted:2});
  expect(m.session.markRead).toHaveBeenCalledWith(USER,A,[hex(1),hex(2)]);
 });
 it('400 invalid_parameter:eventIds for missing, empty, > 500, malformed, or another issuer’s ids',async()=>{
  for(const body of [{},{eventIds:[]},{eventIds:Array.from({length:501},(_,i)=>hex(i))},{eventIds:['x']},{eventIds:'a'}]){
   const r=await postRead(json('POST',`/api/tracking/watches/${A}/read`,body),ctx(A));
   expect(r.status).toBe(400);expect((await r.json()).error.code).toBe('invalid_parameter:eventIds');
  }
  m.session.markRead.mockRejectedValue(new CompanyDbError('invalid_read'));
  const r=await postRead(json('POST',`/api/tracking/watches/${A}/read`,{eventIds:[hex(9)]}),ctx(A));
  expect(r.status).toBe(400);expect((await r.json()).error.code).toBe('invalid_parameter:eventIds');
 });
 it('404 watch_not_found when the user does not watch the issuer',async()=>{
  const r=await postRead(json('POST',`/api/tracking/watches/${C}/read`,{eventIds:[hex(1)]}),ctx(C));
  expect(r.status).toBe(404);expect(m.session.markRead).not.toHaveBeenCalled();
 });
});

describe('POST /api/tracking/watches/import-watchlist',()=>{
 it('409 no_server_watchlist when the user has no server-side watchlist rows',async()=>{
  m.watchlistTickers.mockResolvedValue({data:[],error:null});
  const r=await postImport(json('POST','/api/tracking/watches/import-watchlist',{}));
  expect(r.status).toBe(409);expect((await r.json()).error.code).toBe('no_server_watchlist');
 });
 it('returns added / existing / unresolved / skippedByLimit',async()=>{
  m.watchlistTickers.mockResolvedValue({data:[{ticker:'AAPL'},{ticker:'MSFT'},{ticker:'NVTS'}],error:null});
  m.resolve.mockImplementation(async(_t:unknown,q:{ticker:string})=>q.ticker==='AAPL'?{issuer_id:A}:q.ticker==='MSFT'?{issuer_id:C}:null);
  m.session.upsertWatch.mockResolvedValue({row:w(C),created:true});
  const r=await postImport(json('POST','/api/tracking/watches/import-watchlist',{}));
  expect(r.status).toBe(200);expectPrivate(r);
  expect(await r.json()).toEqual({added:[{ticker:'MSFT',issuerId:C}],existing:[{ticker:'AAPL',issuerId:A}],unresolved:[{ticker:'NVTS'}],skippedByLimit:[]});
 });
});

describe('GET /api/tracking/inbox',()=>{
 it('excludes muted issuers, gates payloads through the shared gate, returns read flags and evidence',async()=>{
  m.service.eventsOfIssuers.mockResolvedValue({rows:[ev(2,A,'2026-11-02T00:00:00Z'),ev(1,A,'2026-11-01T00:00:00Z')],nextCursor:null});
  m.session.readEventIds.mockImplementation(async(_u:string,ids:string[])=>new Set(ids.filter(id=>id===hex(1))));
  const res=await getInbox(new Request(`${ORIGIN}/api/tracking/inbox`));
  expect(res.status).toBe(200);expectPrivate(res);
  const body=await res.json();
  expect(m.service.eventsOfIssuers).toHaveBeenCalledWith([A],expect.objectContaining({limit:50,cursor:null}));
  expect(m.gate).toHaveBeenCalledWith(expect.any(Array),expect.anything(),{admin:false});
  expect(body.rows.map((r:{eventId:string;read:boolean})=>[r.eventId,r.read])).toEqual([[hex(2),false],[hex(1),true]]);
  expect(body).toMatchObject({nextCursor:null,evidence:{f:{factId:'f'}}});
 });
 it('issues a cursor bound to the filters and rejects it under other filters',async()=>{
  m.service.eventsOfIssuers.mockResolvedValue({rows:[ev(2,A,'2026-11-02T00:00:00Z')],nextCursor:'db-cursor-1'});
  const first=await (await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?limit=1&kinds=filing_published`))).json();
  expect(first.nextCursor).toEqual(expect.any(String));
  await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?limit=1&kinds=filing_published&cursor=${first.nextCursor}`));
  expect(m.service.eventsOfIssuers).toHaveBeenLastCalledWith([A],expect.objectContaining({cursor:'db-cursor-1',kinds:['filing_published']}));
  const bad=await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?limit=1&cursor=${first.nextCursor}`));
  expect(bad.status).toBe(400);expect((await bad.json()).error.code).toBe('invalid_parameter:cursor');
 });
 it('validates limit, kinds, unreadOnly, issuerId; repeated parameters are 400',async()=>{
  for(const qs of ['limit=201','limit=0','kinds=price_move','unreadOnly=true','issuerId=nope','limit=1&limit=2','cursor=***']){
   const r=await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?${qs}`));expect(r.status,qs).toBe(400);expectPrivate(r);
  }
 });
 it('issuerId: a muted watched issuer is included; an unwatched one is 404 watch_not_found',async()=>{
  await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?issuerId=${B}`));
  expect(m.service.eventsOfIssuers).toHaveBeenCalledWith([B],expect.anything());
  const r=await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?issuerId=${C}`));
  expect(r.status).toBe(404);
 });
 it('no non-muted watches → empty page without reading issuer_events',async()=>{
  m.session.watchesOf.mockResolvedValue([w(B,{muted:true})]);
  const body=await (await getInbox(new Request(`${ORIGIN}/api/tracking/inbox`))).json();
  expect(body).toEqual({rows:[],nextCursor:null,evidence:{}});
  expect(m.service.eventsOfIssuers).not.toHaveBeenCalled();
 });
 it('unreadOnly skips read rows',async()=>{
  m.service.eventsOfIssuers.mockResolvedValueOnce({rows:[ev(2,A,'2026-11-02T00:00:00Z')],nextCursor:'c1'}).mockResolvedValueOnce({rows:[ev(1,A,'2026-11-01T00:00:00Z')],nextCursor:null});
  m.session.readEventIds.mockImplementation(async(_u:string,ids:string[])=>new Set(ids.filter(id=>id===hex(2))));
  const body=await (await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?limit=1&unreadOnly=1`))).json();
  expect(body.rows.map((r:{eventId:string})=>r.eventId)).toEqual([hex(1)]);
 });
});

describe('review fixes',()=>{
 const UP=A.toUpperCase();
 it('import-watchlist pages past 1000 rows, dedupes across lists, finds a new issuer on page 2',async()=>{
  const page1=Array.from({length:1000},(_,i)=>({ticker:i<999?'AAPL':'MSFT'}));   // duplicates across lists
  m.watchlistTickers.mockImplementation(async(a:number)=>a===0?{data:page1,error:null}:{data:[{ticker:'msft'},{ticker:'NEWCO'}],error:null});
  m.resolve.mockImplementation(async(_t:unknown,q:{ticker:string})=>q.ticker==='AAPL'?{issuer_id:A}:q.ticker==='NEWCO'?{issuer_id:C}:q.ticker==='MSFT'?{issuer_id:A}:null);
  m.session.upsertWatch.mockResolvedValue({row:w(C),created:true});
  const r=await postImport(json('POST','/api/tracking/watches/import-watchlist',{}));
  expect(r.status).toBe(200);
  expect(m.watchlistTickers).toHaveBeenCalledTimes(2);
  expect(m.watchlistTickers).toHaveBeenNthCalledWith(2,1000,1999);
  expect(m.resolve).toHaveBeenCalledTimes(3);   // AAPL, MSFT, NEWCO — deduped
  expect((await r.json()).added).toEqual([{ticker:'NEWCO',issuerId:C}]);
 });
 it('uppercase issuer ids: read route and inbox filter compare in lower case',async()=>{
  m.session.markRead.mockResolvedValue({inserted:1});
  const r=await postRead(json('POST',`/api/tracking/watches/${UP}/read`,{eventIds:[hex(1)]}),ctx(UP));
  expect(r.status).toBe(200);expect(m.session.markRead).toHaveBeenCalledWith(USER,A,[hex(1)]);
  const i=await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?issuerId=${UP}`));
  expect(i.status).toBe(200);expect(m.service.eventsOfIssuers).toHaveBeenCalledWith([A],expect.anything());
 });
 it('a forged inner cursor that the database rejects is 400 invalid_parameter:cursor',async()=>{
  m.service.eventsOfIssuers.mockResolvedValueOnce({rows:[ev(2,A,'2026-11-02T00:00:00Z')],nextCursor:'db-cursor-1'});
  const first=await (await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?limit=1`))).json();
  m.service.eventsOfIssuers.mockRejectedValueOnce(new CompanyDbError('invalid_read'));
  const r=await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?limit=1&cursor=${first.nextCursor}`));
  expect(r.status).toBe(400);expect((await r.json()).error.code).toBe('invalid_parameter:cursor');
 });
 it('merged issuer: redirect target must exist and not be merged',async()=>{
  const MID='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  m.session.upsertWatch.mockResolvedValue({row:w(C),created:true});
  m.selectIssuer.mockResolvedValueOnce([{issuer_id:A,status:'merged',merged_into:C}]).mockResolvedValueOnce([{issuer_id:C,status:'active',merged_into:null}]);
  expect((await postWatch(json('POST','/api/tracking/watches',{issuerId:A}))).status).toBe(201);
  expect(m.session.upsertWatch).toHaveBeenLastCalledWith(USER,C);
  m.selectIssuer.mockResolvedValueOnce([{issuer_id:A,status:'merged',merged_into:C}]).mockResolvedValueOnce([]);
  expect((await postWatch(json('POST','/api/tracking/watches',{issuerId:A}))).status).toBe(404);
  m.selectIssuer.mockResolvedValueOnce([{issuer_id:A,status:'merged',merged_into:MID}]).mockResolvedValueOnce([{issuer_id:MID,status:'merged',merged_into:C}]);
  const r=await postWatch(json('POST','/api/tracking/watches',{issuerId:A}));
  expect(r.status).toBe(404);expect((await r.json()).error.code).toBe('unknown_issuer');
 });
 it('CSRF on PATCH, read and import; unwatched inbox issuerId never reads events; 500 is private no-store',async()=>{
  const bad=(method:string,path:string)=>new Request(`${ORIGIN}${path}`,{method,body:'{}',headers:{'content-type':'application/json',origin:'https://evil.example'}});
  expect((await patchWatch(bad('PATCH',`/api/tracking/watches/${A}`),ctx(A))).status).toBe(403);
  expect((await postRead(bad('POST',`/api/tracking/watches/${A}/read`),ctx(A))).status).toBe(403);
  expect((await postImport(bad('POST','/api/tracking/watches/import-watchlist'))).status).toBe(403);
  expect((await postImport(new Request(`${ORIGIN}/api/tracking/watches/import-watchlist`,{method:'POST',body:'{}',headers:{origin:ORIGIN}}))).status).toBe(415);
  expect(m.session.patchWatch).not.toHaveBeenCalled();expect(m.session.markRead).not.toHaveBeenCalled();
  const r=await getInbox(new Request(`${ORIGIN}/api/tracking/inbox?issuerId=${C}`));
  expect(r.status).toBe(404);expect(m.service.eventsOfIssuers).not.toHaveBeenCalled();
  vi.spyOn(console,'error').mockImplementation(()=>undefined);
  m.session.watchesOf.mockRejectedValue(new Error('db down'));
  const e=await getWatches();
  expect(e.status).toBe(500);expectPrivate(e);expect((await e.json()).error.code).toBe('internal');
 });
});
