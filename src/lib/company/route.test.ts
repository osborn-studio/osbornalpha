// src/lib/company/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Cell,DerivedCell,FactCell} from './types';

const mocks=vi.hoisted(()=>({deps:null as unknown as import('./route-test-kit').KitDeps,requireAdmin:vi.fn()}));
vi.mock('./deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('./evidence-gate',async(orig)=>({...(await orig<typeof import('./evidence-gate')>()),applyGate:(await import('./route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});

import {buildGated,companyRoute,countWithheld,gateCell} from './route';
import {CN,OLD,FIL_CN_LINKED,US,BRKA,secRow,cnFact,cnSummary,fact,makeDeps,seededTables,summary} from './route-test-kit';

const ok={issuerId:US,ticker:'AAPL',market:'US' as const,tickerAsOf:'2024-06-30',validFromMethod:'curated'};
const call=(mode:'public'|'admin',ticker:string,qs='')=>companyRoute({tag:'t',mode,params:['asOf','x'],handler:async(ctx)=>({body:{issuer:ctx.issuer,asOf:ctx.asOf,admin:ctx.admin,userId:ctx.userId},empty:false})})(new Request(`https://alpha.example/x/${ticker}?${qs}`),{params:Promise.resolve({ticker})});

describe('companyRoute',()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));});
 afterEach(()=>vi.useRealTimers());
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u-admin'});});
 it('§0 #69 ticker cases over the real resolveIssuer',async()=>{
  for(const t of ['600519','SH600519','600519.SS','600519.SH'])expect((await (await call('public',t)).json()).issuer).toEqual({issuerId:CN,ticker:'600519.SH',market:'CN',tickerAsOf:new Date().toISOString().slice(0,10),validFromMethod:'curated'});
  expect((await (await call('public','BRK.A')).json()).issuer.ticker).toBe('BRK.A');
  expect((await (await call('public','OLDX')).json()).issuer).toEqual({issuerId:US,ticker:'OLDX',market:'US',tickerAsOf:new Date().toISOString().slice(0,10),validFromMethod:'curated'});
  const amb=await call('public','AMBG');expect(amb.status).toBe(409);expect((await amb.json()).error.code).toBe('ambiguous_ticker');
  const hk=await call('public','00700.HK');expect(hk.status).toBe(404);expect((await hk.json()).error.code).toBe('market_not_served');
  expect((await (await call('public','700')).json()).error.code).toBe('market_not_served');
  const nf=await call('public','ZZZZ');expect(nf.status).toBe(404);expect((await nf.json()).error.code).toBe('unknown_ticker');
  expect((await call('public','AA PL')).status).toBe(400);
 });
 it('asOf: defaults to today, ≤ today, duplicate → 400; past asOf → long shared cache',async()=>{
  const today=new Date().toISOString().slice(0,10);
  const r=await call('public','AAPL');expect((await r.json()).asOf).toBe(today);
  expect(r.headers.get('cache-control')).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=600$/);
  const past=await call('public','AAPL','asOf=2024-06-30');expect(past.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  for(const qs of ['asOf=2999-01-01','asOf=2024-02-30','asOf=2024-01-01&asOf=2024-01-02']){const b=await call('public','AAPL',qs);expect(b.status).toBe(400);expect(b.headers.get('cache-control')).toBe('no-store');}
 });
 it('tickerAsOf selects historical ownership independently of fact asOf, in public and admin routes',async()=>{
  await mocks.deps.tables.insert('issuer_securities',secRow(US,'REUSED',{valid_to:'2020-12-31'}));
  await mocks.deps.tables.insert('issuer_securities',secRow(BRKA,'REUSED',{valid_from:'2021-01-01'}));
  for(const mode of ['public','admin'] as const){
   expect((await (await call(mode,'REUSED','asOf=2019-06-30')).json()).issuer.issuerId).toBe(BRKA);
   expect((await (await call(mode,'REUSED','asOf=2024-06-30&tickerAsOf=2019-06-30')).json()).issuer).toMatchObject({issuerId:US,tickerAsOf:'2019-06-30',validFromMethod:'curated'});
   for(const qs of ['tickerAsOf=2999-01-01','tickerAsOf=2024-02-30','tickerAsOf=2020-01-01&tickerAsOf=2021-01-01']){
    const res=await call(mode,'REUSED',qs);
    expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:tickerAsOf');
   }
  }
 });
 it('public mode never reads the session; admin mode gates and is private, no-store on success and error',async()=>{
  await call('public','AAPL');expect(mocks.requireAdmin).not.toHaveBeenCalled();
  const a=await call('admin','AAPL','asOf=2024-06-30');
  expect(a.headers.get('cache-control')).toBe('private, no-store');expect((await a.json())).toMatchObject({admin:true,userId:'u-admin'});
  const {AdminUnauthenticated,AdminForbidden}=await import('@/lib/admin/auth');
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));
  const u=await call('admin','AAPL');expect(u.status).toBe(401);expect(u.headers.get('cache-control')).toBe('private, no-store');
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
  const f=await call('admin','AAPL');expect(f.status).toBe(403);expect(f.headers.get('cache-control')).toBe('private, no-store');
  const nf=await call('admin','ZZZZ');expect(nf.status).toBe(404);expect(nf.headers.get('cache-control')).toBe('private, no-store');
 });
 it('handler failures are a code-only 500',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await companyRoute({tag:'t',mode:'public',params:[],handler:async()=>{throw new Error('secret detail');}})(new Request('https://alpha.example/x/AAPL'),{params:Promise.resolve({ticker:'AAPL'})});
  spy.mockRestore();
  expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain('secret');
 });
});

describe('buildGated / gateCell',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());});
 it('public: missing evidence → evidence_incomplete; CN pending → citation_pending; unknown id → evidence_incomplete; evidence only for eligible',async()=>{
  const a=fact(),b=fact({concept:'net_income_parent'});mocks.deps.noEvidence.add(b.fact_id);
  const g=await buildGated({deps:mocks.deps,admin:false,issuer:ok},[a.fact_id,b.fact_id,'99999999-9999-4999-8999-999999999999'],[a,b],[summary()]);
  expect(g.reasonOf(a.fact_id)).toBeNull();expect(g.reasonOf(b.fact_id)).toBe('evidence_incomplete');
  expect(g.reasonOf('99999999-9999-4999-8999-999999999999')).toBe('evidence_incomplete');
  expect(Object.keys(g.evidence)).toEqual([a.fact_id]);
  const c=cnFact();
  const cn={issuerId:CN,ticker:'600519.SH',market:'CN' as const,tickerAsOf:'2024-06-30',validFromMethod:'curated'};
  expect((await buildGated({deps:mocks.deps,admin:false,issuer:cn},[c.fact_id],[c],[cnSummary()])).reasonOf(c.fact_id)).toBe('citation_pending');
  expect((await buildGated({deps:mocks.deps,admin:true,issuer:cn},[c.fact_id],[c],[cnSummary()])).reasonOf(c.fact_id)).toBeNull();
  const linked=cnFact({filing_id:FIL_CN_LINKED});mocks.deps.pdfFor.add(linked.fact_id);
  expect((await buildGated({deps:mocks.deps,admin:false,issuer:cn},[linked.fact_id],[linked],[cnSummary({filingId:FIL_CN_LINKED,citation:'linked',documentUrl:'https://static.cninfo.com.cn/x.PDF'})])).reasonOf(linked.fact_id)).toBeNull();
 });
 it('fetches unknown fact rows of THIS stream only and loads filings when not given',async()=>{
  const a=fact(),foreign=fact({issuer_id:CN});
  (mocks.deps.facts.factsByIds as ReturnType<typeof vi.fn>).mockResolvedValue([a,foreign]);
  (mocks.deps.facts.filingsOfIssuer as ReturnType<typeof vi.fn>).mockResolvedValue([(await import('./route-test-kit')).filingRow()]);
  const g=await buildGated({deps:mocks.deps,admin:false,issuer:ok},[a.fact_id,foreign.fact_id],[],[]);
  expect(g.reasonOf(a.fact_id)).toBeNull();expect(g.reasonOf(foreign.fact_id)).toBe('evidence_incomplete');
  expect(g.fact(a.fact_id)).toEqual(a);
 });
 it('CN predecessor locators and evidence are looked up for each owning member',async()=>{
  const old=cnFact({issuer_id:OLD,filing_id:FIL_CN_LINKED}),current=cnFact({filing_id:FIL_CN_LINKED});
  mocks.deps.pdfFor.add(old.fact_id);mocks.deps.pdfFor.add(current.fact_id);
  const g=await buildGated({deps:mocks.deps,admin:false,issuer:{...ok,issuerId:CN,market:'CN'},lineage:new Set([CN,OLD])},[old.fact_id,current.fact_id],[old,current],[cnSummary({filingId:FIL_CN_LINKED,citation:'linked',documentUrl:'https://static.cninfo.com.cn/x.PDF'})]);
  expect(g.reasonOf(old.fact_id)).toBeNull();
  expect(mocks.deps.pdf.locate).toHaveBeenCalledWith(OLD,'CN',[old.fact_id]);
  expect(mocks.deps.pdf.locate).toHaveBeenCalledWith(CN,'CN',[current.fact_id]);
  expect(mocks.deps.company.evidenceOf).toHaveBeenCalledWith([old.fact_id]);
 });
 it('gateCell: fact → withheld; derived → withheld if any input fails (evidence_incomplete wins); counts',async()=>{
  const a=fact(),b=fact({concept:'cost_of_revenue'});mocks.deps.noEvidence.add(b.fact_id);
  const g=await buildGated({deps:mocks.deps,admin:false,issuer:ok},[a.fact_id,b.fact_id],[a,b],[summary()]);
  const fc={kind:'fact',factId:b.fact_id} as FactCell;
  const dc={kind:'derived',metric:'gross_margin',value:'0.4',inputs:[{factId:a.fact_id,concept:'revenue',filingId:a.filing_id,availableDate:a.available_date},{factId:b.fact_id,concept:'cost_of_revenue',filingId:b.filing_id,availableDate:b.available_date}]} as DerivedCell;
  const cells:Cell[]=[gateCell(fc,g),gateCell(dc,g),gateCell({kind:'fact',factId:a.fact_id} as FactCell,g),null];
  expect(cells[0]).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:b.fact_id});
  expect(cells[1]).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:b.fact_id});
  expect(cells[2]).toMatchObject({kind:'fact'});
  expect(countWithheld(cells)).toEqual({evidenceIncomplete:2,citationPending:0});
 });
});
