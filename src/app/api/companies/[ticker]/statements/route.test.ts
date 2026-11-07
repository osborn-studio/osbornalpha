// src/app/api/companies/[ticker]/statements/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn(),serverSupabase:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:mocks.serverSupabase}));

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/statements/route';
import {FACT_CONCEPTS} from '@/lib/facts/concepts';
import {Q_SINGLE_CONCEPTS} from '@/lib/facts/derive';
import {periodKeyOf} from '@/lib/company/statements-grid';
import {CN,US,cnFact,cnSummary,emptySnapshot,fact,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';

const get=(h:typeof GET,ticker:string,qs:string)=>h(new Request(`https://alpha.example/api/companies/${ticker}/statements?${qs}`),{params:Promise.resolve({ticker})});
const KEY=periodKeyOf({period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M'});
const CN_KEY=periodKeyOf({period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M'});
const isConcepts=FACT_CONCEPTS.filter(c=>c.statement==='IS').map(c=>c.id);

describe('GET /api/companies/[ticker]/statements',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u-admin'});});
 const setSnap=(s:Parameters<typeof emptySnapshot>[0])=>(mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot(s));

 it('annual IS: one snapshot read of the statement concepts (history false), DTO per §6.1, evidence + withheld counts',async()=>{
  const rev=fact();setSnap({stateRev:7,rows:[rev],filings:[summary()]});
  const res=await get(GET,'AAPL','statement=IS&basis=annual&asOf=2024-06-30');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:US,ticker:'AAPL',market:'US',asOf:'2024-06-30',mappingGen:1,stateRev:7,truncated:false,statement:'IS',basis:'annual',withheld:{evidenceIncomplete:0,citationPending:0}});
  expect(body.periods[0]).toMatchObject({key:KEY,periodStart:'2022-09-25',periodEnd:'2023-09-30',duration:'12M'});
  const row=body.rows.find((r:{concept:string})=>r.concept==='revenue');
  expect(row.cells[KEY]).toMatchObject({kind:'fact',factId:rev.fact_id,value:'383285000000',availableDate:'2023-11-03',disclosureSeq:1});
  expect(body.otherUnitOnly).toEqual({});expect(body.otherUnitsAlso).toEqual({});
  expect(Object.keys(body.evidence)).toEqual([rev.fact_id]);
  expect(body.filings[rev.filing_id]).toMatchObject({citation:'edgar',formType:'10-K'});
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:isConcepts,asOf:'2024-06-30',history:false});
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
 });
 it('a fact without verified evidence is withheld server-side: no value anywhere in the body',async()=>{
  const rev=fact({value:'987654321012',value_text:'987654321012'});mocks.deps.noEvidence.add(rev.fact_id);setSnap({rows:[rev],filings:[summary()]});
  const body=await (await get(GET,'AAPL','statement=IS&basis=annual')).json();
  expect(body.rows.find((r:{concept:string})=>r.concept==='revenue').cells[KEY]).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:rev.fact_id});
  expect(body.withheld).toEqual({evidenceIncomplete:1,citationPending:0});
  expect(JSON.stringify(body)).not.toContain('987654321012');
  expect(body.evidence).toEqual({});
 });
 it('CN pending citation: public withheld citation_pending; admin twin shows the value and is private, no-store',async()=>{
  const v=cnFact();setSnap({rows:[v],filings:[cnSummary()]});
  const pub=await (await get(GET,'600519.SH','statement=IS&basis=annual')).json();
  expect(pub.market).toBe('CN');
  expect(pub.rows.find((r:{concept:string})=>r.concept==='revenue_operating').cells[CN_KEY]).toEqual({kind:'withheld',reason:'citation_pending',factId:v.fact_id});
  expect(pub.withheld).toEqual({evidenceIncomplete:0,citationPending:1});
  const adm=await get(ADMIN_GET,'600519.SH','statement=IS&basis=annual');
  expect(adm.headers.get('cache-control')).toBe('private, no-store');
  expect((await adm.json()).rows.find((r:{concept:string})=>r.concept==='revenue_operating').cells[CN_KEY]).toMatchObject({kind:'fact',value:'147693604994.14'});
 });
 it('shared-cache fixture: an admin request then an anonymous request of the SAME public URL carry no pending-CN value; the public route never reads the session',async()=>{
  const v=cnFact();setSnap({rows:[v],filings:[cnSummary()]});
  await get(ADMIN_GET,'600519.SH','statement=IS&basis=annual');                 // admin twin first (would warm any shared object)
  const asAdminOnPublic=await get(GET,'600519.SH','statement=IS&basis=annual'); // an admin session calling the public URL
  const anon=await get(GET,'600519.SH','statement=IS&basis=annual');
  for(const r of [asAdminOnPublic,anon])expect(JSON.stringify(await r.json())).not.toContain('147693604994.14');
  expect(mocks.serverSupabase).not.toHaveBeenCalled();
  expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);   // only the admin twin
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(3);  // every request assembles from its own snapshot read
 });
 it('quarterly IS: history read of the market Q_SINGLE concepts of that statement; derived cells gated by every input',async()=>{
  const q1=fact({period_start:'2023-10-01',period_end:'2023-12-30',duration:'3M',value:'119575000000',value_text:'119575000000',available_date:'2024-02-02'});
  setSnap({rows:[q1],filings:[summary()]});
  const body=await (await get(GET,'AAPL','statement=IS&basis=quarterly&asOf=2024-06-30')).json();
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:Q_SINGLE_CONCEPTS.US.filter(c=>FACT_CONCEPTS.find(d=>d.id===c)!.statement==='IS'),asOf:'2024-06-30',history:true});
  const cells=body.rows.flatMap((r:{cells:Record<string,{kind:string}>})=>Object.values(r.cells)).filter(Boolean);
  expect(cells.some((c:{kind:string;metric?:string})=>c.kind==='derived'&&c.metric==='q_single_revenue')).toBe(true);
  mocks.deps.noEvidence.add(q1.fact_id);
  const gated=await (await get(GET,'AAPL','statement=IS&basis=quarterly&asOf=2024-06-30')).json();
  expect(JSON.stringify(gated)).not.toContain('119575000000');
  expect(gated.withheld.evidenceIncomplete).toBeGreaterThan(0);
 });
 it('truncated → 200 truncated:true with empty rows, no-store',async()=>{
  setSnap({truncated:true});
  const res=await get(GET,'AAPL','statement=IS');
  expect(await res.json()).toMatchObject({truncated:true,rows:[],periods:[],evidence:{},withheld:{evidenceIncomplete:0,citationPending:0}});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('parameters: statement required; BS + quarterly → 400 basis; periods ∈ {8,20,40}; duplicates; CF ok',async()=>{
  const bad=async(qs:string,code:string)=>{const r=await get(GET,'AAPL',qs);expect(r.status).toBe(400);expect((await r.json()).error.code).toBe(code);};
  await bad('','invalid_parameter:statement');
  await bad('statement=XX','invalid_parameter:statement');
  await bad('statement=BS&basis=quarterly','invalid_parameter:basis');
  await bad('statement=IS&basis=ttm','invalid_parameter:basis');
  await bad('statement=IS&periods=10','invalid_parameter:periods');
  await bad('statement=IS&statement=BS','invalid_parameter:statement');
  expect((await get(GET,'AAPL','statement=CF&periods=40')).status).toBe(200);
  expect((await get(GET,'00700.HK','statement=IS')).status).toBe(404);
 });
 it('grid guard errors (missing sequence fields) are a code-only 500',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const bad=fact();delete (bad as {disclosure_seq?:number}).disclosure_seq;setSnap({rows:[bad],filings:[summary()]});
  const r=await get(GET,'AAPL','statement=IS&basis=annual');spy.mockRestore();
  expect(r.status).toBe(500);expect((await r.json()).error.code).toBe('internal');
 });
 it('admin twin rejects non-admins with 401/403, private no-store',async()=>{
  const {AdminForbidden}=await import('@/lib/admin/auth');
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
  const r=await get(ADMIN_GET,'AAPL','statement=IS');
  expect(r.status).toBe(403);expect(r.headers.get('cache-control')).toBe('private, no-store');
 });
});
