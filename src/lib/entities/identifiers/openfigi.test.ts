// src/lib/entities/identifiers/openfigi.test.ts
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {memoryRawStore} from '../../dq/raw-store';
import {
 ALLOWED_SECURITY_TYPES,BACKOFF_MS,EXCH_MAP,EXCH_MAP_VERSION,OPENFIGI_URL,OpenFigiError,
 exchCodeFor,groupFigiResults,mapIsins,mapJobs,mapTickers,openFigiLimits,securityTickerFor,type FigiRecord,
} from './openfigi';

const eq=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
// Trimmed ID_ISIN result shapes (spec §9.1): AAPL composite + US venues + a German line; Moutai CG/CH; Tencent HK.
const AAPL:FigiRecord[]=[eq({}),eq({figi:'BBG000B9XVV8',exchCode:'UW'}),eq({figi:'BBG000B9Y5X2',exchCode:'UN'}),eq({figi:'BBG000BG9JS1',compositeFIGI:'BBG000BG9DH4',exchCode:'GR'})];
const MOUTAI:FigiRecord[]=[eq({figi:'BBG000MOUTA1',compositeFIGI:'BBG000MOUTA1',ticker:'600519',exchCode:'CH'}),eq({figi:'BBG000MOUTA2',compositeFIGI:'BBG000MOUTA1',ticker:'600519',exchCode:'CG'})];
const TENCENT:FigiRecord[]=[eq({figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1',ticker:'700',exchCode:'HK'})];
const BOND:FigiRecord[]=[eq({figi:'BBG00BOND001',compositeFIGI:null,ticker:'AAPL 2.4 05/03/23',exchCode:null,securityType:'GLOBAL',marketSector:'Corp'})];
const VENUES:FigiRecord[]=[eq({figi:'BBG000VENUE1',compositeFIGI:null,ticker:'ZZX'}),eq({figi:'BBG000VENUE2',compositeFIGI:null,ticker:'ZZX'})];

type Reply=()=>Response;
const ok=(body:unknown):Reply=>()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
const status=(s:number):Reply=>()=>new Response('{}',{status:s});
const boom:Reply=()=>{throw new TypeError('fetch failed');};
function harness(replies:Reply[]){
 const calls:{url:string;init:RequestInit}[]=[];const sleeps:number[]=[];let t=0;
 const fetch=(async(url:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(url),init:init??{}});const r=replies.shift();if(!r)throw new Error('unexpected fetch');return r();}) as typeof globalThis.fetch;
 const raw=memoryRawStore();
 return {calls,sleeps,raw,deps:{fetch,raw,now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;}}};
}
const isinItems=(n:number)=>Array.from({length:n},()=>({data:AAPL}));

describe('limits and EXCH_MAP',()=>{
 it('throttles to 80% of the documented limits',()=>{
  expect(openFigiLimits(null)).toEqual({jobsPerRequest:10,minIntervalMs:3000});
  expect(openFigiLimits('k')).toEqual({jobsPerRequest:100,minIntervalMs:300});
  expect(EXCH_MAP_VERSION).toBe('exch-map/1');
  expect(Object.keys(EXCH_MAP).sort()).toEqual(['CG','CH','CS','HK','UA','UN','UP','UQ','UR','US','UW']);
  expect([...ALLOWED_SECURITY_TYPES].sort()).toEqual(['ADR','Common Stock','GDR']);
 });
 it('maps exchange codes to security tickers and back',()=>{
  expect(securityTickerFor('UW','AAPL')).toEqual({ok:true,market:'US',ticker:'AAPL'});
  expect(securityTickerFor('US','BRK/B')).toEqual({ok:true,market:'US',ticker:'BRK.B'});
  expect(securityTickerFor('CG','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SH'});
  expect(securityTickerFor('CS','000001')).toEqual({ok:true,market:'CN',ticker:'000001.SZ'});
  expect(securityTickerFor('CH','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SH'});
  expect(securityTickerFor('CH','300750')).toEqual({ok:true,market:'CN',ticker:'300750.SZ'});
  expect(securityTickerFor('CH','430047')).toEqual({ok:false,reason:'exch_unknown:CH:4'});
  expect(securityTickerFor('HK','700')).toEqual({ok:true,market:'HK',ticker:'00700.HK'});
  expect(securityTickerFor('GR','AAPL')).toEqual({ok:false,reason:'exch_unknown:GR'});
  expect(securityTickerFor(null,'AAPL')).toEqual({ok:false,reason:'exch_unknown:null'});
  expect(exchCodeFor('AAPL')).toEqual({exchCode:'US',idValue:'AAPL'});
  expect(exchCodeFor('BRK.B')).toEqual({exchCode:'US',idValue:'BRK/B'});
  expect(exchCodeFor('600519.SH')).toEqual({exchCode:'CG',idValue:'600519'});
  expect(exchCodeFor('000001.SZ')).toEqual({exchCode:'CS',idValue:'000001'});
  expect(exchCodeFor('00700.HK')).toEqual({exchCode:'HK',idValue:'700'});
  expect(exchCodeFor('430047.BJ')).toBeNull();
 });
});

describe('groupFigiResults',()=>{
 it('groups by compositeFIGI, drops unknown venues and non-equity lines',()=>{
  const g=groupFigiResults([...AAPL,...BOND]);
  expect(g.candidates).toEqual([{market:'US',ticker:'AAPL',groups:[{figi:'BBG000B9XRY4',level:'composite',exchCodes:['UN','US','UW'],securityType:'Common Stock'}]}]);
  expect(g.skipped).toEqual(['exch_unknown:GR','market_sector:Corp']);
  expect(groupFigiResults(MOUTAI).candidates).toEqual([{market:'CN',ticker:'600519.SH',groups:[{figi:'BBG000MOUTA1',level:'composite',exchCodes:['CG','CH'],securityType:'Common Stock'}]}]);
  expect(groupFigiResults(TENCENT).candidates[0]).toMatchObject({market:'HK',ticker:'00700.HK'});
 });
 it('keeps venue-level results without compositeFIGI as separate groups (never picks a venue)',()=>{
  const g=groupFigiResults(VENUES);
  expect(g.candidates).toEqual([{market:'US',ticker:'ZZX',groups:[
   {figi:'BBG000VENUE1',level:'venue',exchCodes:['US'],securityType:'Common Stock'},
   {figi:'BBG000VENUE2',level:'venue',exchCodes:['US'],securityType:'Common Stock'},
  ]}]);
 });
 it('is independent of result order (permuted fixtures give identical output)',()=>{
  const all=[...AAPL,...MOUTAI,...VENUES,...BOND];
  const base=groupFigiResults(all);
  for(const perm of [[...all].reverse(),[...all.slice(3),...all.slice(0,3)],[all[5],all[0],...all.slice(1,5),...all.slice(6)]])expect(groupFigiResults(perm)).toEqual(base);
 });
 it('skips security types outside the allowed set and malformed FIGIs',()=>{
  const g=groupFigiResults([eq({securityType:'Preference'}),eq({figi:'XX1',compositeFIGI:null})]);
  expect(g.candidates).toEqual([]);expect(g.skipped).toEqual(['invalid_figi','security_type:Preference']);
 });
});

describe('mapJobs',()=>{
 it('splits into 10-job requests without a key, waits 3 s between them, stores request and response bytes',async()=>{
  const h=harness([ok(isinItems(10)),ok(isinItems(10)),ok(isinItems(5))]);
  const isins=Array.from({length:25},(_,i)=>`US03783310${String(i).padStart(2,'0')}`);
  const out=await mapIsins(isins,h.deps);
  expect(h.calls).toHaveLength(3);
  expect(h.calls[0].url).toBe(OPENFIGI_URL);
  expect(JSON.parse(String(h.calls[0].init.body))).toHaveLength(10);
  expect(JSON.parse(String(h.calls[0].init.body))[0]).toEqual({idType:'ID_ISIN',idValue:isins[0]});
  expect((h.calls[0].init.headers as Record<string,string>)['X-OPENFIGI-APIKEY']).toBeUndefined();
  expect(h.sleeps).toEqual([3000,3000]);
  expect(out.exhausted).toBe(false);expect(out.byKey.size).toBe(25);expect(out.requests).toBe(3);
  const r=out.byKey.get(isins[24])!;
  expect(r.status).toBe('ok');
  // content-addressed store: the two identical 10-item responses share one object (3 requests + 2 responses),
  // and memoryRawStore keeps a .meta.json sidecar per stored object: 5 objects + 5 sidecars
  expect(h.raw.objects.size).toBe(10);
  const bytes=[...h.raw.objects.values()].map(b=>createHash('sha256').update(b).digest('hex'));
  expect(bytes).toContain(r.evidence.request_sha256);expect(bytes).toContain(r.evidence.response_sha256);
  expect(r.evidence.index).toBe(4);
 });
 it('sends 100 jobs per request with a key, and never stores the key',async()=>{
  const h=harness([ok(isinItems(25))]);
  await mapIsins(Array.from({length:25},(_,i)=>`US03783310${String(i).padStart(2,'0')}`),{...h.deps,apiKey:'secret-key'});
  expect(h.calls).toHaveLength(1);
  expect((h.calls[0].init.headers as Record<string,string>)['X-OPENFIGI-APIKEY']).toBe('secret-key');
  for(const b of h.raw.objects.values())expect(new TextDecoder().decode(b)).not.toContain('secret-key');
 });
 it('backs off 60 s once on 429, 5xx or a network error, then succeeds',async()=>{
  for(const first of [status(429),status(503),boom]){
   const h=harness([first,ok([{data:TENCENT}])]);
   const out=await mapJobs([{idType:'ID_ISIN',idValue:'KYG875721634'}],h.deps);
   expect(h.sleeps).toContain(BACKOFF_MS);
   expect(out.exhausted).toBe(false);expect(out.results[0]?.status).toBe('ok');
  }
 });
 it('gives up the rest of the run after a second failure (exhausted, unprocessed listed)',async()=>{
  const h=harness([ok(isinItems(10)),status(429),status(429)]);
  const isins=Array.from({length:15},(_,i)=>`US03783310${String(i).padStart(2,'0')}`);
  const out=await mapIsins(isins,h.deps);
  expect(out.exhausted).toBe(true);
  expect(out.byKey.size).toBe(10);
  expect(out.unprocessed).toEqual(isins.slice(10));
 });
 it('maps warning to not_found and error to error; rejects malformed responses and other HTTP errors',async()=>{
  const h=harness([ok([{warning:'No identifier found.'},{error:'Invalid idValue format.'},{data:[]}])]);
  const out=await mapJobs([{idType:'ID_ISIN',idValue:'A'},{idType:'ID_ISIN',idValue:'B'},{idType:'ID_ISIN',idValue:'C'}],h.deps);
  expect(out.results.map(r=>r?.status)).toEqual(['not_found','error','not_found']);
  await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],harness([ok([])]).deps)).rejects.toThrow(OpenFigiError);
  await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],harness([ok([{nope:1}])]).deps)).rejects.toThrow('invalid_schema');
  await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],harness([status(400)]).deps)).rejects.toThrow('openfigi_http');
 });
 it('mapTickers builds TICKER jobs with the reverse exchCode and lists unsupported tickers',async()=>{
  const h=harness([ok([{data:AAPL},{data:TENCENT}])]);
  const out=await mapTickers(['AAPL','00700.HK','430047.BJ'],h.deps);
  expect(JSON.parse(String(h.calls[0].init.body))).toEqual([{idType:'TICKER',idValue:'AAPL',exchCode:'US'},{idType:'TICKER',idValue:'700',exchCode:'HK'}]);
  expect(out.unsupported).toEqual(['430047.BJ']);
  expect([...out.byKey.keys()]).toEqual(['AAPL','00700.HK']);
 });
});

describe('failure evidence, shared throttling, own-property lookups',()=>{
 const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 const stored=(h:{raw:{objects:Map<string,Uint8Array>}})=>[...h.raw.objects.entries()].filter(([k])=>!k.endsWith('.meta.json')).map(([,v])=>sha(v));
 it('stores the request before sending and every failure body before retrying or throwing',async()=>{
  const body=(t:string)=>()=>new Response(t,{status:429});
  const h=harness([body('{"error":"first"}'),body('slow down')]);
  const out=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h.deps);
  expect(out.exhausted).toBe(true);expect(out.failures).toHaveLength(2);
  const hashes=stored(h);
  expect(hashes).toContain(out.failures[0].request_sha256);
  expect(hashes).toContain(sha(new TextEncoder().encode('{"error":"first"}')));
  expect(out.failures.map(f=>f.response_sha256)).toEqual([sha(new TextEncoder().encode('{"error":"first"}')),sha(new TextEncoder().encode('slow down'))]);
  expect(out.failures.map(f=>f.status)).toEqual([429,429]);
  // terminal 4xx: the error carries the evidence and the body is stored
  const h2=harness([()=>new Response('{"error":"bad"}',{status:400})]);
  const err=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h2.deps).catch(e=>e) as OpenFigiError;
  expect(err).toBeInstanceOf(OpenFigiError);expect(err.evidence?.status).toBe(400);
  expect(stored(h2)).toContain(err.evidence!.response_sha256);expect(stored(h2)).toContain(err.evidence!.request_sha256);
  // a network error stores the request only
  const h3=harness([boom,boom]);
  const net=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h3.deps);
  expect(net.failures.map(f=>f.response_sha256)).toEqual([null,null]);expect(stored(h3)).toContain(net.failures[0].request_sha256);
 });
 it('spaces requests across mapIsins then mapTickers with shared deps',async()=>{
  const h=harness([ok([{data:AAPL}]),ok([{data:AAPL}])]);
  const times:number[]=[];const f0=h.deps.fetch;
  const deps={...h.deps,fetch:(async(...a:Parameters<typeof fetch>)=>{times.push(h.deps.now());return f0(...a);}) as typeof fetch};
  await mapIsins(['US0378331005'],deps);
  await mapTickers(['AAPL'],deps);
  expect(times[1]-times[0]).toBeGreaterThanOrEqual(3000);
  expect(h.sleeps).toEqual([3000]);
 });
 it('queues concurrent calls on one limiter',async()=>{
  const h=harness([ok([{data:AAPL}]),ok([{data:AAPL}]),ok([{data:AAPL}])]);
  await Promise.all([mapIsins(['A1'],h.deps),mapIsins(['A2'],h.deps),mapTickers(['AAPL'],h.deps)]);
  // three requests, each queued 3 s behind the previous one (virtual clock: sleeps accumulate to 6 s)
  expect(h.calls).toHaveLength(3);expect(h.sleeps).toEqual([3000,3000]);expect(h.deps.now()).toBe(6000);
 });
 it('treats Object.prototype names as unknown exchange codes',()=>{
  for(const c of ['toString','__proto__','constructor','hasOwnProperty'])expect(securityTickerFor(c,'AAPL')).toEqual({ok:false,reason:`exch_unknown:${c}`});
  expect(groupFigiResults([eq({exchCode:'constructor'})]).skipped).toEqual(['exch_unknown:constructor']);
 });
 it('infers the board from the code prefix only for CH',()=>{
  expect(securityTickerFor('CG','000001')).toEqual({ok:true,market:'CN',ticker:'000001.SH'});
  expect(securityTickerFor('CS','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SZ'});
 });
});

const RECORDED=new URL('../fixtures/openfigi/recorded-probe-isin.json',import.meta.url);
describe('recorded probe (Task 3b Step 8)',()=>{
 it.skipIf(!existsSync(RECORDED))('maps AAPL, 600519 and 0700 to exactly one group per ticker (Tencent ISIN also lists 80700.HK and the OTC line TCTZF)',()=>{
  const items=JSON.parse(readFileSync(RECORDED,'utf8')) as {data?:FigiRecord[]}[];
  const tickers=items.map(i=>groupFigiResults(i.data??[]).candidates.map(c=>`${c.ticker}:${c.groups.length}`));
  expect(tickers).toEqual([['AAPL:1'],['600519.SH:1'],['00700.HK:1','80700.HK:1','TCTZF:1']]);
 });
});
