// src/app/api/macro/routes.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {MacroDbError} from '@/lib/macro/db';
import type {MacroDb} from '@/lib/macro/db';
import {memoryMacroDb} from '@/lib/macro/memory-db';
import type {MacroRouteDeps} from '@/lib/macro/route-helpers';
import {publishRegion} from '@/lib/macro/snapshots';
import {US_FIXTURE,seedCatalog,seedPoints} from '@/lib/macro/testing/seed';

const authGetUser=vi.hoisted(()=>vi.fn());
const state=vi.hoisted(()=>({deps:null as unknown}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn(async()=>({auth:{getUser:authGetUser}}))}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/macro/route-helpers',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/macro/route-helpers')>(),macroRouteDeps:()=>state.deps}));

import {GET as overview} from './overview/route';
import {GET as series} from './series/[id]/route';
import {GET as snapshot} from './snapshots/[id]/route';
import {GET as evidence} from './evidence/[sha256]/route';

const BASE='https://alpha.example/api/macro';
const req=(path:string)=>new Request(`${BASE}${path}`);
let db:MacroDb,seed:Awaited<ReturnType<typeof seedPoints>>,snapshotId:string;
function depsFor(db:MacroDb):MacroRouteDeps{
 return {db,tables:memoryTableClient({dq_freshness:['dataset']}),signedUrl:async(path,expiresIn)=>`https://signed.example/${path}?e=${expiresIn}`};
}

beforeEach(async()=>{
 vi.unstubAllEnvs();
 authGetUser.mockResolvedValue({data:{user:{id:'u-1'}},error:null});
 db=memoryMacroDb();await seedCatalog(db);
 seed=await seedPoints(db,US_FIXTURE);
 const r=await publishRegion({db,env:{}},'US','2026-11-06');
 if(r.status!=='published')throw new Error('setup');
 snapshotId=r.snapshot_id;
 state.deps=depsFor(db);
});

describe('auth (spec §2: every route checks the session itself)',()=>{
 it('returns 401 unauthenticated without a user on all four routes',async()=>{
  authGetUser.mockResolvedValue({data:{user:null},error:null});
  const responses=[
   await overview(req('/overview?region=US')),
   await series(req('/series/US_DGS10'),{params:Promise.resolve({id:'US_DGS10'})}),
   await snapshot(req(`/snapshots/${snapshotId}`),{params:Promise.resolve({id:snapshotId})}),
   await evidence(req(`/evidence/${seed.sha256}`),{params:Promise.resolve({sha256:seed.sha256})}),
  ];
  for(const res of responses){
   expect(res.status).toBe(401);
   expect((await res.json()).error.code).toBe('unauthenticated');
   expect(res.headers.get('cache-control')).toBe('no-store');
  }
 });
});

describe('GET /api/macro/overview',()=>{
 it('returns per-region envelopes with the private cache header and no judgment fields',async()=>{
  const res=await overview(req('/overview?region=all'));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, max-age=60');
  const body=await res.json();
  expect(Object.keys(body.regions).sort()).toEqual(['CN','US']);
  expect(body.regions.US.snapshotId).toBe(snapshotId);
  expect(body.regions.CN.snapshotId).toBeNull();
  expect(typeof body.catalogVersion).toBe('string');
  expect(JSON.stringify(body)).not.toMatch(/"regime"|margin_pp|primary_state/);
 });
 it('compact=1 and region=US; invalid region / unknown params are 400',async()=>{
  const body=await (await overview(req('/overview?region=US&compact=1'))).json();
  expect(Object.keys(body.regions)).toEqual(['US']);
  expect(body.regions.US.indicators).toHaveLength(3);
  expect((await overview(req('/overview?region=EU'))).status).toBe(400);
  expect((await overview(req('/overview?region=US&foo=1'))).status).toBe(400);
  expect((await overview(req('/overview?compact=yes'))).status).toBe(400);
 });
});

describe('GET /api/macro/series/[id]',()=>{
 const get=(id:string,qs='')=>series(req(`/series/${id}${qs}`),{params:Promise.resolve({id})});
 it('returns observations with evidence sha256 and locator, and Task 14 placeholders',async()=>{
  const res=await get('US_DGS10');
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, max-age=60');
  const body=await res.json();
  expect(body.observations.map((o:{value_text:string})=>o.value_text)).toEqual(['3.95','4.05','4.15','4.25']);
  // US_DGS10 is derived (month_end of US_DGS10_D): no own retrieval; its provenance is the daily input row (第 4 稿 P1-2)
  expect(body.observations[0]).toMatchObject({version:1,availability_basis:'first_seen',retrieval_id:null,evidence_sha256:null,locator:null,transform:'month_end@1'});
  expect(body.observations[0].derived_from).toContain(seed.ids.get('US_DGS10_D|2026-07-31'));   // + the month-completion witness input
  const daily=await (await get('US_DGS10_D','?from=2026-07-31&to=2026-07-31')).json();
  expect(daily.observations[0]).toMatchObject({retrieval_id:seed.retrievalId,evidence_sha256:seed.sha256,locator:{kind:'csv_row'}});
  expect(body).toMatchObject({transform:'raw',seriesRead:'US_DGS10',eventsVersion:'macro-events/1',cyclesVersion:'macro-cycles/1'});
  for(const k of ['cycles','insufficient','events','calendar','assetsByCycle'])expect(Array.isArray(body[k]),k).toBe(true);
  expect(body.def.id).toBe('US_DGS10');
  expect(body.provenance).toMatchObject({adapter:'fred_csv'});
 });
 it('whitelists catalog ids; validates from/to/asOf/transform',async()=>{
  expect((await get('NOT_A_SERIES')).status).toBe(404);
  expect((await get('US_DGS10','?from=2026-13-01')).status).toBe(400);
  expect((await get('US_DGS10','?from=2026-10-01&to=2026-09-01')).status).toBe(400);
  expect((await get('US_DGS10','?transform=log')).status).toBe(400);
  expect((await get('US_DGS10','?transform=yoy')).status).toBe(400);   // no yoy derivation declared for DGS10
  const ranged=await (await get('US_DGS10','?from=2026-09-01&to=2026-09-30')).json();
  expect(ranged.observations.map((o:{period_end:string})=>o.period_end)).toEqual(['2026-09-30']);
  const asOf=await (await get('US_DGS10','?asOf=2026-10-01')).json();
  expect(asOf.observations).toEqual([]);   // seed became available 2026-11-01
 });
 it('diff transform gives exact decimal period-over-period differences',async()=>{
  const body=await (await get('US_DGS10','?transform=diff')).json();
  expect(body.observations.map((o:{value_text:string})=>o.value_text)).toEqual(['0.1','0.1','0.1']);
 });
 it('more than 600 points → 400 too_many_points',async()=>{
  state.deps={...depsFor(db),db:new Proxy(db,{get(t,k,r){
   if(k==='seriesHistory')return async()=>{throw new MacroDbError('truncated');};
   const v=Reflect.get(t,k,r);return typeof v==='function'?v.bind(t):v;}})};
  const res=await get('US_DGS10');
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe('too_many_points');
 });
 it('missing and restricted catalog items return their definition and no observations',async()=>{
  const body=await (await get('US_ISM_PMI')).json();
  expect(body.def.status).toBe('missing');
  expect(body.observations).toEqual([]);
 });
});

describe('GET /api/macro/snapshots/[id]',()=>{
 const get=(id:string)=>snapshot(req(`/snapshots/${id}`),{params:Promise.resolve({id})});
 it('judgment layer off → manifest and counts, no regime or contributions',async()=>{
  const body=await (await get(snapshotId)).json();
  expect(body.snapshot).toMatchObject({snapshot_id:snapshotId,status:'active',catalog_counts:{verified:6,missing:1,restricted:1}});
  expect(body.observations).toHaveLength(17);
  expect('regime' in body).toBe(false);
  expect('contributions' in body).toBe(false);
  expect(JSON.stringify(body)).not.toMatch(/primary_state|rule_id/);
 });
 it('judgment layer on → regime and contributions included',async()=>{
  vi.stubEnv('MACRO_JUDGMENTS_ENABLED','1');
  const body=await (await get(snapshotId)).json();
  expect(body.regime).toMatchObject({primary_state:'overheat',secondary_state:'stagflation'});
  expect(body.contributions).toHaveLength(6);
  expect(body.rulesVersion).toBe('macro-regime-rules/1.0');
 });
 it('400 on a non-uuid, 404 on an unknown id',async()=>{
  expect((await get('nope')).status).toBe(400);
  expect((await get('00000000-0000-4000-8000-00000000dead')).status).toBe(404);
 });
});

describe('GET /api/macro/evidence/[sha256]',()=>{
 const get=(sha:string)=>evidence(req(`/evidence/${sha}`),{params:Promise.resolve({sha256:sha})});
 it('returns metadata, retrievals and a 60-second signed URL',async()=>{
  const res=await get(seed.sha256);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, max-age=60');
  const body=await res.json();
  expect(body.evidence).toMatchObject({sha256:seed.sha256,adapter:'fred_csv',content_type:'text/csv'});
  expect(body.retrievals).toHaveLength(1);
  expect(body.retrievals[0]).toMatchObject({retrieval_id:seed.retrievalId,fetch_host:'fred.stlouisfed.org'});
  expect(body.download).toEqual({url:`https://signed.example/fred_csv/${seed.sha256}.csv?e=60`,expiresIn:60});
 });
 it('400 on a malformed hash, 404 on an unknown one',async()=>{
  expect((await get('ABC')).status).toBe(400);
  expect((await get('f'.repeat(64))).status).toBe(404);
 });
});
