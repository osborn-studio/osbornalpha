// src/lib/facts/deps.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryRawStore} from '../dq/raw-store';
import {cninfoLinker,productionSyncDeps,resolveCodeVersion} from './deps';
import {coverageSummary,parseTushareStatements} from './providers/tushare-statements';
import {loadTushareFixtures} from './providers/tushare-fixtures';
import type {Budget,FactsDb,FilingRow} from './types';

// Per-test overrides for the production wiring's Supabase-backed collaborators (null = the real factory).
const over=vi.hoisted(()=>({facts:null as unknown,tables:null as unknown,raw:null as unknown}));
vi.mock('./db',async importOriginal=>{const o=await importOriginal<typeof import('./db')>();return {...o,supabaseFactsDb:((sb:never)=>over.facts??o.supabaseFactsDb(sb)) as typeof o.supabaseFactsDb};});
vi.mock('../db/table-client',async importOriginal=>{const o=await importOriginal<typeof import('../db/table-client')>();return {...o,supabaseTableClient:((sb:never)=>over.tables??o.supabaseTableClient(sb)) as typeof o.supabaseTableClient};});
vi.mock('../dq/raw-store',async importOriginal=>{const o=await importOriginal<typeof import('../dq/raw-store')>();return {...o,supabaseRawStore:((sb:never)=>over.raw??o.supabaseRawStore(sb)) as typeof o.supabaseRawStore};});

const SHA='c'.repeat(40);
const original=process.env.VERCEL_GIT_COMMIT_SHA;
afterEach(()=>{if(original===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=original;});

describe('resolveCodeVersion',()=>{
 it('prefers a 40-hex VERCEL_GIT_COMMIT_SHA',()=>{process.env.VERCEL_GIT_COMMIT_SHA=SHA;expect(resolveCodeVersion({allowGit:true})).toBe(SHA);expect(resolveCodeVersion({allowGit:false})).toBe(SHA);});
 it('returns null without a valid env value when git is not allowed',()=>{
  delete process.env.VERCEL_GIT_COMMIT_SHA;expect(resolveCodeVersion({allowGit:false})).toBeNull();
  process.env.VERCEL_GIT_COMMIT_SHA='deadbeef';expect(resolveCodeVersion({allowGit:false})).toBeNull();   // not a full sha → not trusted
 });
 it('falls back to git rev-parse HEAD (with -dirty when the tree is dirty) when allowed',()=>{
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  expect(resolveCodeVersion({allowGit:true})).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
 });
});

describe('cninfoLinker',()=>{
 const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
 const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:'g',issuer_id:'I',market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-04-03',source_ref:'600519.SH:20241231:1:20250403',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2025-04-03T00:00:00Z',accepted_at:null,acceptance_source:null,...p});
 const fakeDb=(filings:FilingRow[])=>({filingsOfIssuer:async()=>filings}) as unknown as Pick<FactsDb,'filingsOfIssuer'>;
 async function tablesWithMoutai(){
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:null});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.OLD',is_primary:true,valid_from:'1990-01-01',valid_to:'2001-08-26'});
  return tables;
 }
 it('resolves ts_code and org id once per issuer, queries cninfo with the collector body, and flags a type-1 filing with a type-5 sibling as corrected',async()=>{
  const bodies:string[]=[];
  const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[{announcementId:'2',announcementTitle:'贵州茅台：关于2024年年度报告的更正公告',adjunctUrl:'finalpage/2025-04-03/2.PDF'}],hasMore:false}),{status:200});});
  const db=fakeDb([filing(),filing({filing_id:'h',source_ref:'600519.SH:20241231:5:20250301',available_date:'2025-03-01'})]);
  const link=cninfoLinker(await tablesWithMoutai(),db,{fetch,minIntervalMs:0});
  expect(await link(filing(),budget())).toEqual({document_ref:'2',document_url:'https://static.cninfo.com.cn/finalpage/2025-04-03/2.PDF'});   // corrected → a 更正 title is the match
  expect(bodies[0]).toContain('stock=600519%2C9900000227');expect(bodies[0]).toContain('column=sse');expect(bodies[0]).toContain('seDate=2025-03-31%7E2025-04-06');
  expect(await link(filing({filing_id:'q',form_type:'q1',period_end:'2024-03-31',source_ref:'600519.SH:20240331:1:20240426',available_date:'2024-04-26'}),budget())).toBe('none');   // not corrected → 更正 title excluded
  expect(fetch).toHaveBeenCalledTimes(2);   // issuer context is cached: only the two hisAnnouncement queries
 });
 it("answers 'unlinkable' (no attempt consumed) without touching the network when the issuer has no current A-share listing",async()=>{
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'U',cninfo_org_id:null,status:'active'});
  const fetch=vi.fn();
  const link=cninfoLinker(tables,fakeDb([]),{fetch});
  expect(await link(filing({issuer_id:'U'}),budget())).toBe('unlinkable');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('uses the scope A-share selection: B shares are excluded, two undecidable A-shares are ambiguous (unlinkable), a sole non-primary A-share is used',async()=>{
  const mk=async(secs:{ticker:string;is_primary:boolean;share_class?:string}[])=>{
   const t=memoryTableClient({issuers:['issuer_id']});
   await t.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
   for(const x of secs)await t.insert('issuer_securities',{issuer_id:'I',valid_from:'2001-08-27',valid_to:null,...x});
   return t;
  };
  const body=async(t:Awaited<ReturnType<typeof mk>>)=>{
   const bodies:string[]=[];
   const fetch=vi.fn(async(_i:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[],hasMore:false}),{status:200});});
   const r=await cninfoLinker(t,fakeDb([]),{fetch,minIntervalMs:0,today:'2026-11-04'})(filing(),budget());
   return {r,bodies};
  };
  const b=await body(await mk([{ticker:'900901.SH',is_primary:true},{ticker:'600519.SH',is_primary:false}]));
  expect(b.bodies[0]).toContain('stock=600519%2C');                       // the B share (900xxx.SH) is never queried
  expect((await body(await mk([{ticker:'900901.SH',is_primary:true}]))).r).toBe('unlinkable');
  expect((await body(await mk([{ticker:'600519.SH',is_primary:true},{ticker:'000001.SZ',is_primary:true}]))).r).toBe('unlinkable');   // ambiguous
  expect((await body(await mk([{ticker:'600519.SH',is_primary:false}]))).bodies.length).toBe(1);
 });
 it('reads the current A-share listing by the landed validity predicate: a scheduled future end still counts, a past end does not',async()=>{
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:'2030-12-31'});
  const bodies:string[]=[];
  const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[],hasMore:false}),{status:200});});
  expect(await cninfoLinker(tables,fakeDb([]),{fetch,minIntervalMs:0,today:'2026-11-04'})(filing(),budget())).toBe('none');
  expect(bodies[0]).toContain('stock=600519%2C9900000227');                                            // the listing was resolved → a query went out
  const noCall=vi.fn();
  expect(await cninfoLinker(tables,fakeDb([]),{fetch:noCall,today:'2031-01-01'})(filing(),budget())).toBe('unlinkable');   // listing ended → no ts_code → no request
  expect(noCall).not.toHaveBeenCalled();
 });
});

describe('productionSyncDeps',()=>{
 it('assembles both adapters, the cninfo linker and the CN coverage summary over the admin client (round-1 #12)',()=>{
  const saved={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-role-test-key';   // createClient never connects at construction
  try{
   const deps=productionSyncDeps({deadline:null,codeVersion:'c'.repeat(40)});
   for(const k of ['fetchUs','fetchCn','parseUs','parseCn','linkCn','coverageCn','enrichAcceptance','now'] as const)expect(typeof deps[k],k).toBe('function');
   expect(deps.coverageCn).toBe(coverageSummary);
   const parsed=parseTushareStatements(loadTushareFixtures('600519.SH'),{sinceYear:2014});
   expect(deps.coverageCn!(parsed)).toEqual(coverageSummary(parsed));
   expect(deps.coverageCn!(parsed).find(x=>x.api==='income'&&x.report_type===1)).toBeDefined();
   expect(deps).toMatchObject({deadline:null,codeVersion:'c'.repeat(40)});
  }finally{
   if(saved.url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=saved.url;
   if(saved.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=saved.key;
  }
 });
});


describe('productionSyncDeps step 9b date-mismatch recording (plan 3 Task 14c)',()=>{
 afterEach(()=>{over.facts=null;over.tables=null;over.raw=null;vi.unstubAllGlobals();});
 it('writes a sec.filing_date_vs_submissions row (cycle-less, no batch) when the submissions filingDate differs from available_date',async()=>{
  const tables=memoryTableClient({});
  const availableDate=new Date(Date.now()-10*86_400_000).toISOString().slice(0,10);
  const filing={filing_id:'F1',issuer_id:'I',market:'US',source:'edgar',source_ref:'0000320193-26-000001',available_date:availableDate,accepted_at:null} as unknown as FilingRow;
  const setAcceptance=vi.fn(async()=>true);
  over.facts={filingsOfIssuer:async()=>[filing],setFilingAcceptance:setAcceptance};over.tables=tables;over.raw=memoryRawStore();
  const main={cik:'320193',name:'Apple',tickers:[],exchanges:[],filings:{recent:{accessionNumber:[filing.source_ref],filingDate:['2020-01-02'],form:['10-K'],acceptanceDateTime:['2020-01-02T06:00:00.000Z']},files:[]}};
  const fetchStub=vi.fn(async()=>new Response(JSON.stringify(main),{status:200,headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',fetchStub);
  const deps=productionSyncDeps({deadline:null,codeVersion:SHA,admin:{} as never});
  const budget:Budget={remainingMs:()=>300_000,signal:new AbortController().signal};
  const out=await deps.enrichAcceptance!('I','0000320193',budget);
  expect(fetchStub).toHaveBeenCalledTimes(1);
  expect(out.mismatches).toHaveLength(1);
  expect(setAcceptance).not.toHaveBeenCalled();   // a mismatching filing is not stamped
  const rows=await tables.select('dq_reconciliations',{pair:'sec.filing_date_vs_submissions'});
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({dataset:'reconcile.sec.filing_date_vs_submissions',kind:'date',outcome:'compared',passed:false,batch_id:null,cycle_id:null,issuer_id:null,natural_key:`320193:${filing.source_ref}`});
  expect(rows[0].detail).toMatchObject({left_text:availableDate,right_text:'2020-01-02'});
 });
});
