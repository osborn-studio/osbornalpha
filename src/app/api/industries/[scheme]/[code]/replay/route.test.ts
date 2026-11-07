// src/app/api/industries/[scheme]/[code]/replay/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({replay:vi.fn(),valuation:vi.fn(),get:vi.fn(),recompute:vi.fn(),official:vi.fn()}));
vi.mock('@/lib/industry/public-deps',()=>({replayDeps:mocks.replay,valuationReplayDeps:mocks.valuation}));
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells}),replayCell:(m:{cells:{metric:string;duration:string;period_start:string}[]},k:{metric:string;duration:string;period_start:string})=>({cell:m.cells.find(c=>c.metric===k.metric&&c.duration===k.duration&&c.period_start===k.period_start)??null,reproduced:true,mismatches:[]})}));

import {RUN_ID,cellRow,manifestOf,missingCell,runRow,stubIndustryDb,valuationRow,valuationRunRow} from '@/lib/industry/fixture-rows';
import {replayLimiter} from '@/lib/industry/route-params';
import {GET} from './route';

const VAL_RUN=valuationRunRow().run_id;
let ip=0;
const get=(qs:string,opts:{ip?:string;scheme?:string;code?:string}={})=>GET(new Request(`https://alpha.example/api/industries/${opts.scheme??'sw2021'}/${opts.code??'801120.SI'}/replay?${qs}`,{headers:{'x-forwarded-for':opts.ip??`10.0.0.${++ip}`}}),{params:Promise.resolve({scheme:opts.scheme??'sw2021',code:opts.code??'801120.SI'})});
const setPublic=(pub:string[])=>{
 const db=stubIndustryDb({public:new Set(pub),runs:[runRow()],cells:[cellRow(),missingCell({period_end:'2024-12-31',period_start:'2024-01-01'})],valuationRuns:[valuationRunRow()],valuations:[valuationRow(),valuationRow({trade_date:'2026-10-23',published:false})]});
 mocks.replay.mockImplementation((now:Date)=>({db,manifests:{get:mocks.get},recompute:mocks.recompute,now}));
 mocks.valuation.mockImplementation(()=>({db,officialValue:mocks.official}));
};

describe('GET /api/industries/[scheme]/[code]/replay',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();replayLimiter.reset();
  mocks.get.mockResolvedValue(manifestOf());mocks.recompute.mockResolvedValue(manifestOf());mocks.official.mockResolvedValue('24.6');
  setPublic(['scheme:sw2021:2021']);
 });
 it('original: filtered manifest, replayed cell, reproduced=true, max-age=3600',async()=>{
  const res=await get(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31`);
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({methodVersion:'industry-agg/1.0',runId:RUN_ID,factsAsOf:'2026-11-03',historyClass:'reconstruction',mode:'original',reproduced:true,manifestHash:'e'.repeat(64)});
  expect(body.manifest.roles.every((r:{metric:string})=>r.metric==='gross_margin')).toBe(true);
  expect(body.manifest.cells).toHaveLength(1);
  expect(body).not.toHaveProperty('officialValue');
  expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
 });
 it('recompute: match|changed',async()=>{
  const res=await get(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31&mode=recompute`);
  expect(res.headers.get('cache-control')).toBe('no-store');   // current evidence is never cached
  const body=await res.json();
  expect(body).toMatchObject({mode:'recompute',result:'match'});
  expect(mocks.recompute).toHaveBeenCalledWith(expect.objectContaining({code:'801120.SI',periodEnd:'2025-12-31',factsAsOf:'2026-11-03',knowledgeDate:'2026-11-03',historyClass:'reconstruction',level:1}));
 });
 it('authorization order: 403 unlicensed, 404 unknown_run, 404 unknown_cell (missing / absent), manifest untouched',async()=>{
  setPublic([]);
  expect((await (await get(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31`)).json()).error.code).toBe('unlicensed');
  setPublic(['scheme:sw2021:2021']);
  const unknownRun=await get(`runId=00000000-0000-4000-8000-000000000000&metric=gross_margin&periodEnd=2025-12-31`);
  expect(unknownRun.status).toBe(404);expect((await unknownRun.json()).error.code).toBe('unknown_run');
  expect((await (await get(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2024-12-31`)).json()).error.code).toBe('unknown_cell');
  expect((await (await get(`runId=${RUN_ID}&metric=roe&periodEnd=2025-12-31`)).json()).error.code).toBe('unknown_cell');
  expect(mocks.get).not.toHaveBeenCalled();
 });
 it('valuation cells: unpublished → 404; officialValue absent while official is internal, present once public',async()=>{
  expect((await get(`runId=${VAL_RUN}&metric=pe_ttm&tradeDate=2026-10-23`)).status).toBe(404);
  const internal=await (await get(`runId=${VAL_RUN}&metric=pe_ttm&tradeDate=2026-10-30`)).json();
  expect(internal).toMatchObject({kind:'valuation',replay:'deferred_i3',cell:{value:'24.8'}});
  expect(internal).not.toHaveProperty('officialValue');
  expect(mocks.official).not.toHaveBeenCalled();
  setPublic(['scheme:sw2021:2021','official:tushare-sw_daily']);
  expect(await (await get(`runId=${VAL_RUN}&metric=pe_ttm&tradeDate=2026-10-30`)).json()).toMatchObject({officialValue:'24.6'});
 });
 it('parameters: runId uuid, exactly one of periodEnd/tradeDate, metric required, valuation original only',async()=>{
  const code=async(qs:string)=>(await (await get(qs)).json()).error.code;
  expect(await code('metric=gross_margin&periodEnd=2025-12-31')).toBe('invalid_parameter:runId');
  expect(await code(`runId=${RUN_ID}&metric=gross_margin`)).toBe('invalid_parameter:periodEnd');
  expect(await code(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31&tradeDate=2026-10-30`)).toBe('invalid_parameter:tradeDate');
  expect(await code(`runId=${RUN_ID}&periodEnd=2025-12-31`)).toBe('invalid_parameter:metric');
  expect(await code(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31&mode=again`)).toBe('invalid_parameter:mode');
  expect(await code(`runId=${VAL_RUN}&metric=pe_ttm&tradeDate=2026-10-30&mode=recompute`)).toBe('invalid_parameter:mode');
  expect(await code(`runId=${VAL_RUN}&metric=gross_margin&tradeDate=2026-10-30`)).toBe('invalid_parameter:metric');
 });
 it('rate limit: the 11th request from one IP within a minute is 429 rate_limited, before any read',async()=>{
  for(let i=0;i<10;i++)expect((await get(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31`,{ip:'7.7.7.7'})).status).toBe(200);
  const res=await get(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31`,{ip:'7.7.7.7'});
  expect(res.status).toBe(429);
  expect((await res.json()).error.code).toBe('rate_limited');
  expect(mocks.replay).toHaveBeenCalledTimes(10);
  expect((await get(`runId=${RUN_ID}&metric=gross_margin&periodEnd=2025-12-31`,{ip:'7.7.7.8'})).status).toBe(200);
 });
});
