// src/lib/macro/strategy/f4-client.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cardLite,createF4Client,F4Unavailable,judgmentDetailOf} from './f4-client';

const CARD={judgment_id:'j1',judgment_type:'macro_regime',lifecycle:'open',calibration:'insufficient',as_of:'2026-10-15',registered_at:'2026-10-15T07:00:00Z',
 methodology:{id:'macro_regime',version:'v1',title:{zh:'宏观象限',en:'Macro quadrant'},href:'/intel/methods/macro_regime/v1'},display:{headline:{zh:'',en:''},percent:null,value:'overheat'}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
function client(handler:(url:URL)=>Response|Promise<Response>,o:{baseUrl?:string|null;timeoutMs?:number}={}){
 const urls:URL[]=[];
 const f=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(String(input));urls.push(u);expect(init?.signal).toBeInstanceOf(AbortSignal);return handler(u);});
 return {c:createF4Client({baseUrl:o.baseUrl===undefined?'https://alpha.test/':o.baseUrl,fetch:f as unknown as typeof fetch,timeoutMs:o.timeoutMs}),urls,f};
}
afterEach(()=>{vi.unstubAllEnvs();});

describe('createF4Client (spec §9.1: same-site HTTP, 3 s timeout, any failure → F4Unavailable)',()=>{
 it('latestRegimeCard reads /api/judgments for the region and projects number-free fields',async()=>{
  const {c,urls}=client(()=>json({subject:{},cards:[{...CARD,judgment_type:'other'},CARD]}));
  expect(await c.latestRegimeCard('US')).toEqual({judgment_id:'j1',lifecycle:'open',calibration:'insufficient',as_of:'2026-10-15',methodology:{id:'macro_regime',version:'v1'},selected:'overheat'});
  expect(urls[0].origin+urls[0].pathname).toBe('https://alpha.test/api/judgments');
  expect(Object.fromEntries(urls[0].searchParams)).toEqual({subject_type:'macro_region',subject_key:'US',types:'macro_regime'});
 });
 it('asOf switches to view=as_known',async()=>{
  const {c,urls}=client(()=>json({cards:[]}));
  expect(await c.latestRegimeCard('CN',{asOf:'2026-10-31'})).toBeNull();
  expect(urls[0].searchParams.get('view')).toBe('as_known');expect(urls[0].searchParams.get('asOf')).toBe('2026-10-31');
 });
 it('judgmentDetail: JSON 404 → null; HTML 404 (route absent) → F4Unavailable',async()=>{
  expect(await client(()=>json({error:{code:'not_found'}},404)).c.judgmentDetail('j9')).toBeNull();
  await expect(client(()=>new Response('<html>',{status:404,headers:{'content-type':'text/html'}})).c.judgmentDetail('j9')).rejects.toBeInstanceOf(F4Unavailable);
 });
 it('judgmentDetail keeps inputs and settlements (settlement rows pass through unknown fields)',async()=>{
  const {c,urls}=client(()=>json({card:CARD,judgment:{judgment_id:'j1',as_of:'2026-10-15',claim:{selected:'recession'},inputs:[{kind:'macro_observation',ref:{series_id:'US_CPI_YOY'},snapshot:{series_id:'US_CPI_YOY',period_end:'2026-09-30',vintage_id:'v1',value:2.9}}]},
   settlements:[{settlement_id:'s1',outcome:'miss',realized:'recovery',evidence:{observation_refs:[]},settled_at:'2027-02-01T00:00:00Z'}],calibration:null}));
  const d=await c.judgmentDetail('j 1');
  expect(urls[0].pathname).toBe('/api/judgments/j%201');
  expect(d).toMatchObject({judgment_id:'j1',as_of:'2026-10-15',selected:'recession',inputs:[{kind:'macro_observation',snapshot:{period_end:'2026-09-30'}}],settlements:[{outcome:'miss',realized:'recovery',settled_at:'2027-02-01T00:00:00Z'}]});
  expect(d!.settlements[0].settlement_id).toBe('s1');
 });
 it('history passes limit and before, accepts {cards} or {items}',async()=>{
  const {c,urls}=client(u=>u.searchParams.get('before')?json({items:[]}):json({cards:[CARD]}));
  expect((await c.history('j1',null,500)).map(x=>x.judgment_id)).toEqual(['j1']);
  expect(await c.history('j1','2026-10-15',500)).toEqual([]);
  expect(urls[0].pathname).toBe('/api/judgments/j1/history');
  expect(Object.fromEntries(urls[0].searchParams)).toEqual({limit:'500'});
  expect(Object.fromEntries(urls[1].searchParams)).toEqual({limit:'500',before:'2026-10-15'});
 });
 it.each([
  ['no base URL',()=>client(()=>json({cards:[]}),{baseUrl:null}).c],
  ['5xx',()=>client(()=>json({error:{}},503)).c],
  ['network error',()=>client(()=>{throw new TypeError('fetch failed');}).c],
  ['non-JSON 200',()=>client(()=>new Response('ok',{status:200,headers:{'content-type':'text/plain'}})).c],
  ['malformed list',()=>client(()=>json({nope:true})).c],
  ['malformed card',()=>client(()=>json({cards:[{judgment_type:'macro_regime'}]})).c],
 ])('%s → F4Unavailable',async(_,make)=>{
  await expect(make().latestRegimeCard('US')).rejects.toBeInstanceOf(F4Unavailable);
 });
 it('times out after timeoutMs',async()=>{
  const slow=createF4Client({baseUrl:'https://alpha.test',timeoutMs:20,fetch:((_:unknown,init?:RequestInit)=>new Promise((_r,reject)=>{init?.signal?.addEventListener('abort',()=>reject(init.signal!.reason));})) as typeof fetch});
  await expect(slow.latestRegimeCard('US')).rejects.toThrow(F4Unavailable);
 });
 it('defaults to NEXT_PUBLIC_SITE_URL',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://site.test');
  const f=vi.fn(async()=>json({cards:[]}));
  await createF4Client({fetch:f as unknown as typeof fetch}).latestRegimeCard('US');
  expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/site\.test\/api\/judgments\?/);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL','');
  await expect(createF4Client({fetch:f as unknown as typeof fetch}).latestRegimeCard('US')).rejects.toThrow('f4_unconfigured');
 });
 it.each([
  ...['https://site.test','http://localhost','http://127.0.0.1:3000'].flatMap(origin=>[`${origin}/path`,`${origin}/?x=1`,`${origin}/#frag`,origin.replace('://','://u:p@')]),
  'http://site.test','http://localhost.evil','http://[::1]','//site.test','javascript:alert(1)',
 ])('rejects unsafe base URL %s',async(baseUrl)=>{
  await expect(client(()=>json({cards:[]}),{baseUrl}).c.latestRegimeCard('US')).rejects.toThrow('f4_unconfigured');
 });
 it.each(['https://site.test','https://site.test/','https://SITE.TEST:443','http://localhost','http://localhost/','http://127.0.0.1:3000'])('accepts normalized origin URL %s',async(baseUrl)=>{
  const {c,urls}=client(()=>json({cards:[]}),{baseUrl});
  expect(await c.latestRegimeCard('US')).toBeNull();
  expect(urls[0].origin+urls[0].pathname).toBe(`${new URL(baseUrl).origin}/api/judgments`);
 });
});

describe('projections',()=>{
 it('cardLite drops every numeric display field and maps an unknown class to null',()=>{
  const lite=cardLite({...CARD,display:{percent:61,value:'sideways'},calibration_summary:{brier:0.2}});
  expect(lite).toEqual({judgment_id:'j1',lifecycle:'open',calibration:'insufficient',as_of:'2026-10-15',methodology:{id:'macro_regime',version:'v1'},selected:null});
 });
 it('judgmentDetailOf falls back to the card for selected and requires an id',()=>{
  expect(judgmentDetailOf({card:CARD,judgment:{judgment_id:'j1',as_of:'2026-10-15',inputs:[]},settlements:[]}).selected).toBe('overheat');
  expect(()=>judgmentDetailOf({judgment:{}})).toThrow(F4Unavailable);
 });
 it('judgmentDetailOf rejects malformed collections instead of normalizing them to empty / dropping entries',()=>{
  const j={judgment_id:'j1',as_of:'2026-10-15',inputs:[]};
  const S={outcome:'miss',realized:'recovery',evidence:{source:'test'},settled_at:'2027-02-01T00:00:00Z'};
  for(const bad of [
   {card:CARD,judgment:j},                                         // settlements missing
   {card:CARD,judgment:j,settlements:{}},                          // settlements not an array
   {card:CARD,judgment:j,settlements:[S,null]},                    // invalid entry
   {card:CARD,judgment:j,settlements:[S,{...S,settled_at:undefined}]},   // latest has no ordering field
   {card:CARD,judgment:j,settlements:[{...S,outcome:undefined}]},
   {card:CARD,judgment:j,settlements:[{...S,evidence:'x'}]},
   {card:CARD,judgment:{...j,inputs:undefined},settlements:[]},
   {card:CARD,judgment:{...j,inputs:[null]},settlements:[]},
   ...[undefined,null,{},[], 'bad'].map(ref=>({card:CARD,judgment:{...j,inputs:[{kind:'macro_observation',ref,snapshot:{value:1}}]},settlements:[]})),
   ...[undefined,null,{},[], 'bad'].map(snapshot=>({card:CARD,judgment:{...j,inputs:[{kind:'macro_observation',ref:{id:'x'},snapshot}]},settlements:[]})),
   ...[undefined,null,{}].map(evidence=>({card:CARD,judgment:j,settlements:[{...S,evidence}]})),
  ])expect(()=>judgmentDetailOf(bad)).toThrow(F4Unavailable);
  expect(judgmentDetailOf({card:CARD,judgment:j,settlements:[S]}).settlements).toHaveLength(1);
 });
});
