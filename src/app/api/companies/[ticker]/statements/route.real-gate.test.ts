// Statements route with the REAL applyGate (no gate mock): hash chain, index version, CN citation (plan Task 9 review).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/statements/route';
import {rawHashOf} from '@/lib/facts/providers/shared';
import {periodKeyOf} from '@/lib/company/statements-grid';
import {EVIDENCE_INDEX_VERSION} from '@/lib/company/types';
import {cnFact,cnSummary,emptySnapshot,fact,makeDeps,record,seededTables,summary} from '@/lib/company/route-test-kit';

const get=(h:typeof GET,ticker:string)=>h(new Request(`https://alpha.example/x/${ticker}?statement=IS&basis=annual`),{params:Promise.resolve({ticker})});
const KEY=periodKeyOf({period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M'});
const CN_KEY=periodKeyOf({period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M'});
const SHA='a'.repeat(64),LOC='us-gaap/Revenues/USD/0';
const goodRecord=(id:string,hash:string)=>record(id,{raw_hash:hash,snapshot_sha256:SHA,hash_locator:LOC,index_version:EVIDENCE_INDEX_VERSION});

describe('statements with the real evidence gate',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});});
 const setup=(rows:ReturnType<typeof fact>[],filings:ReturnType<typeof summary>[],records:Map<string,ReturnType<typeof record>>)=>{
  (mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot({rows,filings}));
  (mocks.deps.company.evidenceOf as ReturnType<typeof vi.fn>).mockImplementation(async(ids:string[])=>new Map(ids.filter(i=>records.has(i)).map(i=>[i,records.get(i)!])));
 };
 const revCell=async()=>(await (await get(GET,'AAPL')).json()).rows.find((r:{concept:string})=>r.concept==='revenue').cells[KEY];
 it('US: a verifiable chain publishes the value; a tampered raw_hash is withheld evidence_incomplete',async()=>{
  const h=rawHashOf(SHA,LOC);
  const good=fact({raw_hash:h});
  setup([good],[summary()],new Map([[good.fact_id,goodRecord(good.fact_id,h)]]));
  expect(await revCell()).toMatchObject({kind:'fact',value:'383285000000'});
  const bad=fact({raw_hash:'b'.repeat(64)});
  setup([bad],[summary()],new Map([[bad.fact_id,goodRecord(bad.fact_id,'b'.repeat(64))]]));
  expect(await revCell()).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:bad.fact_id});
 });
 it('CN pending: withheld publicly, present through the admin twin',async()=>{
  const h=rawHashOf(SHA,LOC);
  const v=cnFact({raw_hash:h});
  const rec={...goodRecord(v.fact_id,h),source:'tushare' as const,json_pointer:''};
  setup([v],[cnSummary()],new Map([[v.fact_id,rec]]));
  const cell=async(h2:typeof GET)=>(await (await get(h2,'600519.SH')).json()).rows.find((r:{concept:string})=>r.concept==='revenue_operating').cells[CN_KEY];
  expect(await cell(GET)).toEqual({kind:'withheld',reason:'citation_pending',factId:v.fact_id});
  expect(await cell(ADMIN_GET)).toMatchObject({kind:'fact',value:'147693604994.14'});
 });
});
