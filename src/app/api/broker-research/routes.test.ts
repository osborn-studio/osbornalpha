// src/app/api/broker-research/routes.test.ts
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({db:{publicReports:vi.fn(),publicReport:vi.fn(),publicInstitutions:vi.fn(),ratingHistory:vi.fn()},resolveIssuer:vi.fn()}));
vi.mock('@/lib/broker-research/public-read',async(orig)=>({...await orig<typeof import('@/lib/broker-research/public-read')>(),anonPublicDeps:()=>({db:mocks.db,tables:{}})}));
vi.mock('@/lib/entities/resolve',async(orig)=>({...await orig<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolveIssuer}));

import {GET as listGET} from './reports/route';
import {GET as detailGET} from './reports/[reportId]/route';
import {GET as instGET} from './institutions/route';
import {GET as histGET} from './history/route';
import {GET as tickerGET} from './by-ticker/[ticker]/route';

const RID='11111111-1111-4111-8111-111111111111';
const req=(path:string)=>new Request(`http://localhost/api/broker-research${path}`);
const bundle=(n=1)=>({report:{report_id:`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,title:'T',published_date:'2026-10-01',target_price_public:true,snippet_max_chars:50,summary_public:true},targets:[],hasSummary:{zh:false,en:false},snippetCount:0,institution:null});
async function expectError(res:Response,status:number,code:string){
 expect(res.status).toBe(status);expect(res.headers.get('Cache-Control')).toBe('no-store');expect((await res.json()).error.code).toBe(code);
}
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(console,'error').mockImplementation(()=>{});for(const f of Object.values(mocks.db))f.mockResolvedValue([]);mocks.db.publicReport.mockResolvedValue(null);});

describe('route modules',()=>{
 it('all five are force-dynamic',()=>{
  for(const rel of ['reports/route.ts','reports/[reportId]/route.ts','institutions/route.ts','history/route.ts','by-ticker/[ticker]/route.ts'])
   expect(readFileSync(join(process.cwd(),'src/app/api/broker-research',rel),'utf8'),rel).toMatch(/export const dynamic='force-dynamic'/);
 });
});

describe('GET /reports',()=>{
 it('400 on bad parameters, before any read',async()=>{
  for(const [qs,code] of [['?institution=x','institution'],['?rating=strong_buy','rating'],['?scope=x','scope'],['?from=2026-13-01','from'],['?from=2026-10-02&to=2026-10-01','to'],['?limit=0','limit'],['?limit=201','limit'],['?cursor=%21','cursor'],['?summary=yes','summary'],['?rating=buy&rating=sell','rating'],['?ticker=a%20b','ticker']])
   await expectError(await listGET(req(`/reports${qs}`)),400,`invalid_parameter:${code}`);
  expect(mocks.db.publicReports).not.toHaveBeenCalled();
 });
 it('404 not_found when the unfiltered library is empty (also what anon sees with the switch off); 200 [] when filtered',async()=>{
  await expectError(await listGET(req('/reports')),404,'not_found');
  await expectError(await listGET(req('/reports?limit=10')),404,'not_found');
  const res=await listGET(req('/reports?rating=buy'));
  expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(await res.json()).toEqual({reports:[],nextCursor:null,count:0});
 });
 it('ticker: 404 unknown_ticker, 409 ambiguous_ticker, else filters by issuer',async()=>{
  mocks.resolveIssuer.mockResolvedValueOnce(null);
  await expectError(await listGET(req('/reports?ticker=ZZZZ')),404,'unknown_ticker');
  mocks.resolveIssuer.mockRejectedValueOnce(new Error('ambiguous_owner'));
  await expectError(await listGET(req('/reports?ticker=AAPL')),409,'ambiguous_ticker');
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-9',securities:[{ticker:'AAPL',is_primary:true}]});
  mocks.db.publicReports.mockResolvedValue([bundle()]);
  const res=await listGET(req('/reports?ticker=aapl&limit=1'));
  expect(res.status).toBe(200);
  expect(mocks.db.publicReports).toHaveBeenCalledWith(expect.objectContaining({issuerId:'iss-9',limit:1}));
  expect((await res.json()).nextCursor).toEqual(expect.any(String));
 });
 it('500 internal with no-store when the view read fails',async()=>{
  mocks.db.publicReports.mockRejectedValue(new Error('boom'));
  await expectError(await listGET(req('/reports')),500,'internal');
 });
});

describe('GET /reports/[reportId]',()=>{
 const call=(id:string)=>detailGET(req(`/reports/${id}`),{params:Promise.resolve({reportId:id})});
 it('400 / 404 / 200 flat whitelisted body',async()=>{
  await expectError(await call('nope'),400,'invalid_parameter:reportId');
  await expectError(await call(RID),404,'not_found');
  mocks.db.publicReport.mockResolvedValue({...bundle(),citations:[],snippets:[],summaries:[],analysts:[]});
  const res=await call(RID);
  expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');
  const body=await res.json();expect(body.settlement).toBeNull();expect(body.licence).toEqual({snippetMaxChars:50,targetPricePublic:true,summaryPublic:true});
 });
});

describe('GET /institutions',()=>{
 it('404 when none are public, 200 with totals otherwise',async()=>{
  await expectError(await instGET(),404,'not_found');
  mocks.db.publicInstitutions.mockResolvedValue([{institution_id:'22222222-2222-4222-8222-222222222222',name_en:'Inst',report_count:3}]);
  const res=await instGET();
  expect(res.status).toBe(200);expect((await res.json()).totals).toMatchObject({institutions:1,reports:3});
  expect(mocks.db.publicReports).not.toHaveBeenCalled();   // counts come from the view, no paging
 });
});

describe('GET /history',()=>{
 it('validates, resolves the ticker, 404 when empty',async()=>{
  await expectError(await histGET(req('/history')),400,'invalid_parameter:ticker');
  await expectError(await histGET(req('/history?ticker=AAPL&currency=usd')),400,'invalid_parameter:currency');
  mocks.resolveIssuer.mockResolvedValueOnce(null);
  await expectError(await histGET(req('/history?ticker=ZZZZ')),404,'unknown_ticker');
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-9',securities:[{ticker:'AAPL',is_primary:true}]});
  await expectError(await histGET(req('/history?ticker=AAPL')),404,'not_found');
  mocks.db.ratingHistory.mockResolvedValue([{report_id:RID,security_ticker:'AAPL'}]);
  const res=await histGET(req('/history?ticker=AAPL&currency=USD&limit=10'));
  expect(res.status).toBe(200);
  expect(mocks.db.ratingHistory).toHaveBeenCalledWith({securityTicker:'AAPL',institutionId:undefined,currency:'USD',limit:10});
  expect((await res.json()).count).toBe(1);
 });
});

describe('GET /by-ticker/[ticker]',()=>{
 const call=(t:string,qs='')=>tickerGET(req(`/by-ticker/${t}${qs}`),{params:Promise.resolve({ticker:t})});
 it('defaults to 5, 404 when nothing is public for the issuer',async()=>{
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-9',securities:[{ticker:'600000.SH',is_primary:true}]});
  await expectError(await call('600000.SH'),404,'not_found');
  expect(mocks.db.publicReports).toHaveBeenCalledWith(expect.objectContaining({issuerId:'iss-9',limit:5}));
  await expectError(await call('600000.SH','?limit=21'),400,'invalid_parameter:limit');
  mocks.db.publicReports.mockResolvedValue([bundle()]);
  const res=await call('600000.SH');
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({ticker:'600000.SH',issuerId:'iss-9',count:1});
 });
});
