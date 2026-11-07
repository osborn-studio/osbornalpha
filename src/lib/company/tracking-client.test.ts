import {afterEach,describe,expect,it,vi} from 'vitest';
import {fetchInbox,markRowsRead,removeWatch,TrackingApiError} from './tracking-client';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ok=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
afterEach(()=>vi.unstubAllGlobals());

describe('tracking client',()=>{
 it('fetchInbox builds the query string and never caches',async()=>{
  const f=vi.fn(async(_url:string,_init?:RequestInit)=>ok({rows:[],nextCursor:null,evidence:{}}));vi.stubGlobal('fetch',f);
  await fetchInbox({cursor:'c_1',limit:50,kinds:['fact_revised'],unreadOnly:true,issuerId:A});
  expect(f.mock.calls[0][0]).toBe(`/api/tracking/inbox?limit=50&kinds=fact_revised&unreadOnly=1&issuerId=${A}&cursor=c_1`);
  expect(f.mock.calls[0][1]).toMatchObject({cache:'no-store'});
 });
 it('mutations send JSON with the content type; errors carry the API code',async()=>{
  const f=vi.fn(async()=>ok({error:{code:'watch_not_found',message:'x'}},404));vi.stubGlobal('fetch',f);
  await expect(removeWatch(A)).rejects.toEqual(new TrackingApiError('watch_not_found',404));
  expect(f).toHaveBeenCalledWith(`/api/tracking/watches/${A}`,expect.objectContaining({method:'DELETE',body:'{}',headers:{'content-type':'application/json'}}));
 });
 it('markRowsRead posts only unread ids, per issuer, and sums inserted',async()=>{
  const f=vi.fn(async(_url:string,init?:RequestInit)=>ok({inserted:(JSON.parse(String(init?.body)) as {eventIds:string[]}).eventIds.length}));vi.stubGlobal('fetch',f);
  const n=await markRowsRead([{eventId:'1'.repeat(64),issuerId:A,read:false},{eventId:'2'.repeat(64),issuerId:B,read:false},{eventId:'3'.repeat(64),issuerId:A,read:true}]);
  expect(n).toBe(2);
  expect(f.mock.calls.map(c=>[c[0],JSON.parse(String(c[1]?.body))])).toEqual([
   [`/api/tracking/watches/${A}/read`,{eventIds:['1'.repeat(64)]}],[`/api/tracking/watches/${B}/read`,{eventIds:['2'.repeat(64)]}],
  ]);
 });
});

describe('isWatching',()=>{
 it('200 → true; 404 watch_not_found → false; any other failure throws (fail closed)',async()=>{
  const {isWatching}=await import('./tracking-client');
  vi.stubGlobal('fetch',vi.fn(async()=>ok({rows:[],nextCursor:null,evidence:{}})));
  expect(await isWatching(A)).toBe(true);
  vi.stubGlobal('fetch',vi.fn(async()=>ok({error:{code:'watch_not_found',message:'x'}},404)));
  expect(await isWatching(A)).toBe(false);
  vi.stubGlobal('fetch',vi.fn(async()=>ok({error:{code:'not_found',message:'x'}},404)));
  await expect(isWatching(A)).rejects.toMatchObject({code:'not_found',status:404});
  vi.stubGlobal('fetch',vi.fn(async()=>ok({error:{code:'not_authenticated',message:'x'}},401)));
  await expect(isWatching(A)).rejects.toMatchObject({code:'not_authenticated',status:401});
 });
 it('watch_limit carries the server-reported cap',async()=>{
  const {addWatch}=await import('./tracking-client');
  vi.stubGlobal('fetch',vi.fn(async()=>ok({error:{code:'watch_limit',message:'at most 200 tracked companies'}},409)));
  await expect(addWatch({issuerId:A})).rejects.toMatchObject({code:'watch_limit',limit:200});
 });
});
