// src/lib/facts/sync-cn.integration.test.ts
// Plan 2 §11.3 A-share offline replay on real PostgreSQL with the RECORDED Tushare pages (fetchCn) and the recorded
// cninfo page set (linkCn, wired through deps.ts::cninfoLinker): publish (with coverage_summary and the policy parks
// of real data), revision pair (type 5 vs corrected type 1 of 000858.SZ, asOf on both sides of the correction date,
// same-day type-1/type-5 pair without a conflict), same-day conflict from a SECOND filing (a type-4 page row with the
// same K and announcement date, round-1 #16), same-filing re-publication as plain duplicates, the annual filing linked
// to a cninfo PDF, and the CN gold gate. The cases run in order and SHARE STATE (published rows, quarantine items).
// Deviations from the plan text (the plan was written before real data existed):
//  - four fixture issuers are ingested (TS_CODES; 600519.SH is the cninfo-linked one, 000858.SZ the revision pair);
//  - the revision pair is picked from the real shape: the type-1 counterpart must differ in value and be later, and the
//    history is not asserted to grow by exactly one row (type-1 original + type-5 on the same day, the corrected type-1
//    row, and the type-4 comparative a year later all exist);
//  - linkCn is the production cninfoLinker (per-issuer ts_code / org id resolved from the issuer tables);
//  - the cninfo case is an `it` and beforeAll throws when the fixture is missing (a critical suite may not skip);
//  - the gold gate is warn-only while gold.ready is false (as in the US suite), recorded entries always replay and must
//    carry real provenance, and template as_of dates / concepts are checked against the recorded Tushare filings.
import {existsSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgFactsDb} from './pg-facts-db';
import {memorySnapshotStore} from './snapshot-store';
import {runFactsSync} from './sync';
import type {SyncDeps} from './sync';
import {conceptById} from './concepts';
import {cninfoLinker} from './deps';
import {scanJsonNumbers} from './json-numbers';
import {ProviderError,snapshotOf,stringifyPreservingNumbers} from './providers/shared';
import {coverageSummary,parseTushareStatements} from './providers/tushare-statements';
import {loadTushareFixtures,TUSHARE_FIXTURE_DIR} from './providers/tushare-fixtures';
import {CNINFO_HISTORY,CNINFO_TOPSEARCH} from '../research/ingest/collectors/cninfo';
import type {FactsDb,RawSnapshot} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const TS_CODE='600519.SH';              // the cninfo-linked issuer (recorded cninfo page set)
const REVISION_TS_CODE='000858.SZ';     // the recorded company whose income.rt5 / corrected rt1 rows form the revision pair (17-tushare-verification.md)
const TS_CODES=[TS_CODE,'000333.SZ','600036.SH',REVISION_TS_CODE] as const;
const CNINFO_FIXTURE=new URL('./fixtures/cninfo/600519.SH-2024-annual.json',import.meta.url);
const today=()=>new Date().toISOString().slice(0,10);
const shift=(ymd:string,d:number)=>new Date(Date.parse(`${ymd}T00:00:00Z`)+d*86_400_000).toISOString().slice(0,10);
const rt=(ref:string)=>ref.split(':')[2];
interface GoldEntry{issuer:{ticker:string;market:'US'|'CN'};concept:string;period_end:string;unit:string;duration?:string;value:string;as_of?:string|null;source?:{document?:string;page_or_row?:string;url?:string};recorded_by:string;recorded_at?:string|null}
interface GoldFile{ready:boolean;required:{US:boolean;CN:boolean};entries:GoldEntry[]}
const isPending=(e:GoldEntry)=>e.recorded_by==='<pending>'||e.value==='<pending>';
const blank=(v:unknown)=>typeof v!=='string'||v.trim()===''||v.trim()==='<pending>';
/** Provenance a human must have written down: document, page/row, url and a recording timestamp. Returns the missing fields. */
const provenanceGaps=(e:GoldEntry):string[]=>[...(['document','page_or_row','url'] as const).filter(k=>blank(e.source?.[k])).map(k=>`source.${k}`),...(e.recorded_at==null||blank(e.recorded_at)?['recorded_at']:[])];
type Page={data:{fields:string[];items:unknown[][]}|null};
const pageOf=(s:RawSnapshot)=>scanJsonNumbers(s.bytes) as Page;
const incomePage=(pages:RawSnapshot[],reportType:string)=>pages.find(s=>s.meta.api==='income'&&(s.meta.params as {report_type:string}).report_type===reportType)!;
const replacePage=(pages:RawSnapshot[],page:RawSnapshot,tree:Page)=>pages.map(s=>s===page?snapshotOf(new TextEncoder().encode(stringifyPreservingNumbers(tree)),{...page.meta}):s);
interface CninfoPage{page:number;request_body:string;http_status:number;body:string}
interface CninfoFixture{__recorded:{org_id:string;available_date:string;fiscal_year:number;ts_code:string};pages:CninfoPage[]}

describe.skipIf(!enabled)('F2-4 A-share offline replay on real PostgreSQL',()=>{
 let admin:Pool;let db:FactsDb;let deps:SyncDeps;
 const issuers:Record<string,string>={};
 const snapshots:Record<string,RawSnapshot[]>={};
 let cninfo:CninfoFixture;
 const run=(ids:string[])=>{
  deps.linkCn=cninfoLinker(deps.tables,db,{fetch:cninfoFetch,minIntervalMs:0});   // fresh linker cache per run, wired exactly like deps.ts
  return runFactsSync(deps,{market:'CN',limit:10,issuerIds:ids,dryRun:false,triggeredBy:'script'});
 };
 // Replays the recorded cninfo pages by their exact recorded request body; every other cninfo request gets an empty answer.
 const cninfoFetch=async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  const url=String(input);
  if(url===CNINFO_TOPSEARCH)return new Response('[]',{status:200});
  if(url!==CNINFO_HISTORY)return new Response('not found',{status:404});
  const hit=cninfo.pages.find(p=>p.request_body===String(init?.body));
  return new Response(hit?hit.body:'{"announcements":[],"hasMore":false}',{status:hit?hit.http_status:200});
 };
 beforeAll(async()=>{
  if(!existsSync(CNINFO_FIXTURE))throw new Error('cninfo fixture required: src/lib/facts/fixtures/cninfo/600519.SH-2024-annual.json (a critical suite may not skip)');
  cninfo=JSON.parse(readFileSync(CNINFO_FIXTURE,'utf8')) as CninfoFixture;
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  for(const code of TS_CODES){
   snapshots[code]=loadTushareFixtures(code,TUSHARE_FIXTURE_DIR);
   const orgId=code===TS_CODE?cninfo.__recorded.org_id:null;
   await admin.query(`insert into public.stocks_universe(ticker,name,market) values($1,$1,'A') on conflict (ticker) do nothing`,[code]);
   let id=(await admin.query(`select issuer_id from public.issuer_securities where ticker=$1 order by valid_from limit 1`,[code])).rows[0]?.issuer_id as string|undefined;
   if(!id){
    id=randomUUID();
    await admin.query(`insert into public.issuers(issuer_id,canonical_name_zh,country_code,cninfo_org_id) values($1,$2,'CN',$3)`,[id,code,orgId]);
    await admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'A',true,'2000-01-01','test') on conflict do nothing`,[id,code]);
   }else if(orgId)await admin.query(`update public.issuers set cninfo_org_id=$1 where issuer_id=$2 and cninfo_org_id is null`,[orgId,id]);
   issuers[code]=id;
  }
  db=pgFactsDb(admin);
  await db.reconcileScope('CN',TS_CODES.map(code=>({issuer_id:issuers[code],reasons:['test'],priority:10,fetch_key:code})));
  deps={db,tables:pgTableClient(admin),storage:memorySnapshotStore(),
   fetchUs:async()=>{throw new ProviderError('sec_unavailable','not in this suite');},
   fetchCn:async(tsCode:string)=>{const s=snapshots[tsCode];if(!s)throw new ProviderError('tushare_unavailable',tsCode);return s;},
   parseUs:()=>{throw new ProviderError('parse_error','not in this suite');},
   parseCn:(pages,o)=>parseTushareStatements(pages,{sinceYear:o.sinceYear}),
   coverageCn:coverageSummary,   // wired exactly like deps.ts (round-1 #12)
   now:()=>new Date(),deadline:null,codeVersion:'test'};
 });
 // Facts and filings are append-only and test:db builds a fresh database per run: retire the scope rows (priority 0) so no
 // scheduled-path test of another suite picks these issuers up.
 afterAll(async()=>{
  if(db&&Object.keys(issuers).length>0)await db.reconcileScope('CN',TS_CODES.filter(c=>issuers[c]).map(code=>({issuer_id:issuers[code],reasons:[],priority:0,fetch_key:code}))).catch(()=>{});
  await admin?.end();
 });

 it('publishes ten years of three statements for every fixture issuer; revenue FY rows are 12M CNY facts; real ambiguous_value parks are quarantined by policy',async()=>{
  const r=await run(Object.values(issuers));
  expect(r.detail).toMatchObject({published:TS_CODES.length,failed:0});
  expect(r.errors.some(e=>e.code==='coverage_summary')).toBe(true);
  expect(['success','partial']).toContain(r.status);
  // 000333.SZ and 600036.SH carry update_flag 0/1 rows of one filing with different values (17-tushare-verification.md): parked, never guessed.
  const parks=(await admin.query(`select natural_key from public.dq_quarantine where table_name='financial_facts' and reason_code='ambiguous_value' and status='open' and (natural_key like $1 or natural_key like $2)`,[`${issuers['000333.SZ']}:%`,`${issuers['600036.SH']}:%`])).rows;
  expect(parks.length).toBeGreaterThan(0);
  expect(r.counts.quarantined).toBeGreaterThanOrEqual(parks.length);
  for(const code of TS_CODES){
   const rows=(await db.readFacts(issuers[code],'CN',{concepts:['revenue'],asOf:today()})).rows.filter(x=>x.duration==='12M');
   expect(rows.length,`${code}: ten years of annual revenue`).toBeGreaterThanOrEqual(5);
   for(const x of rows)expect(x).toMatchObject({unit:'CNY',period_start:`${x.period_end.slice(0,4)}-01-01`,status:'ok'});
  }
 },300_000);

 it('a type-5 (pre-correction) row and its corrected type-1 counterpart coexist; asOf before the correction date reads the old value, on the date the corrected one',async()=>{
  const parsed=parseTushareStatements(snapshots[REVISION_TS_CODE],{sinceYear:2000});
  const avail=(ref:string)=>parsed.filings.find(f=>f.sourceRef===ref)!.availableDate;
  const sameK=(a:{concept:string;periodStart:string|null;periodEnd:string;unit:string},b:typeof a)=>b.concept===a.concept&&b.periodStart===a.periodStart&&b.periodEnd===a.periodEnd&&b.unit===a.unit;
  // The type-1 counterpart is picked among ALL type-1 rows of the key: the original type-1 row (same value as the type-5 row) must not shadow the corrected one.
  const pair=parsed.candidates.filter(a=>rt(a.filingRef)==='5').map(a=>[a,parsed.candidates.find(b=>rt(b.filingRef)==='1'&&sameK(a,b)&&b.value!==a.value&&avail(a.filingRef)<avail(b.filingRef))] as const).find(([,b])=>b);
  expect(pair,'fixture needs a type-5 row and a later type-1 row of the same key with another value (§11.1)').toBeDefined();
  const [old,cur]=pair!;
  const corrected=avail(cur!.filingRef);
  const read=(asOf:string,includeNonOk=false)=>db.readFacts(issuers[REVISION_TS_CODE],'CN',{concepts:[old.concept],asOf,from:old.periodEnd,to:old.periodEnd,history:true,includeNonOk}).then(r=>r.rows.filter(x=>x.unit===old.unit&&x.period_start===old.periodStart));
  const before=await read(shift(corrected,-1));
  expect(before.length).toBeGreaterThan(0);
  expect(before.at(-1)).toMatchObject({value_text:old.value,is_current:true,is_revision:false});
  expect(before.every(x=>x.value_text===old.value)).toBe(true);
  const onDay=await read(corrected);
  expect(onDay.at(-1)).toMatchObject({value_text:cur!.value,is_current:true,is_revision:true,available_date:corrected});
  expect(onDay.length).toBeGreaterThan(before.length);
  const now=await read(today());
  expect(now.at(-1)).toMatchObject({value_text:cur!.value,is_current:true});                 // later comparatives (type 4) repeat the corrected value
  expect(new Set(now.map(x=>x.value_text))).toEqual(new Set([old.value,cur!.value]));         // history holds both values
  // The type-1 original and the type-5 row were announced the same day with the same value: two filings, no conflict, both ok.
  const first=(await read(today(),true)).filter(x=>x.available_date===avail(old.filingRef));
  expect(new Set(first.map(x=>x.filing_id)).size).toBeGreaterThanOrEqual(2);
  expect(first.every(x=>x.status==='ok'&&x.value_text===old.value)).toBe(true);
  const conflicts=(await admin.query(`select 1 from public.dq_quarantine where reason_code='same_day_conflict' and table_name='financial_facts' and natural_key like $1`,[`${issuers[REVISION_TS_CODE]}:CN:${old.concept}:%:${avail(old.filingRef)}`])).rows;
  expect(conflicts).toEqual([]);
 });

 it('a SECOND filing (type-4 page row) with the same K on the same announcement date and another value → same_day_conflict: both rows quarantined, the day has no ok value (round-1 #16)',async()=>{
  const parsed=parseTushareStatements(snapshots[TS_CODE],{sinceYear:2000});
  const target=parsed.candidates.filter(c=>c.concept==='revenue'&&c.duration==='12M'&&rt(c.filingRef)==='1').sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd))[0];
  const page1=incomePage(snapshots[TS_CODE],'1'),page4=incomePage(snapshots[TS_CODE],'4');
  const t1=pageOf(page1),t4=pageOf(page4);
  const fields=t1.data!.fields;const ei=fields.indexOf('end_date'),ri=fields.indexOf('report_type'),fi=fields.indexOf('total_revenue');
  const src=t1.data!.items.find(r=>r[ei]===target.periodEnd.replace(/-/g,''))!;
  // Clone the type-1 row into the type-4 page: same end_date and f_ann_date/ann_date (→ same K and available_date) under
  // report_type 4 (→ a distinct source_ref / filing), value + 1. Control columns arrive as strings, value cells as {__num}.
  // A changed value inside the SAME filing would be a duplicate candidate key, not a second conflicting fact (next test).
  const row=[...src];row[ri]='4';row[fi]={__num:`${target.value}1`};
  const data4=t4.data??{fields,items:[]};
  expect(data4.fields,'the type-4 page must carry the type-1 columns').toEqual(fields);
  const mutated=replacePage(snapshots[TS_CODE],page4,{data:{fields,items:[...data4.items,row]}});
  const original=snapshots[TS_CODE];snapshots[TS_CODE]=mutated;
  let r;try{r=await run([issuers[TS_CODE]]);}finally{snapshots[TS_CODE]=original;}
  expect(r.detail).toMatchObject({published:1,failed:0});
  expect(r.counts.quarantined).toBeGreaterThanOrEqual(1);   // counted per conflict item; the two rows are asserted below
  const avail=parsed.filings.find(f=>f.sourceRef===target.filingRef)!.availableDate;
  const where={concepts:['revenue'],asOf:today(),from:target.periodEnd,to:target.periodEnd};
  const rows=(await db.readFacts(issuers[TS_CODE],'CN',{...where,history:true,includeNonOk:true})).rows.filter(x=>x.duration==='12M'&&x.available_date===avail);
  expect(rows.length).toBe(2);expect(rows.every(x=>x.status==='quarantined')).toBe(true);
  expect(new Set(rows.map(x=>x.filing_id)).size).toBe(2);                                             // two filings: the type-1 row and the type-4 restatement
  expect(new Set(rows.map(x=>x.value_text))).toEqual(new Set([target.value,`${target.value}1`]));
  expect((await db.readFacts(issuers[TS_CODE],'CN',where)).rows.filter(x=>x.duration==='12M'&&x.available_date===avail)).toEqual([]);   // the day has no ok value
  const items=(await admin.query(`select payload from public.dq_quarantine where reason_code='same_day_conflict' and status='open' and table_name='financial_facts' and natural_key like $1`,[`${issuers[TS_CODE]}:CN:revenue:%:${avail}`])).rows;
  expect(items).toHaveLength(1);expect((items[0].payload as {fact_ids:string[]}).fact_ids.sort()).toEqual(rows.map(x=>x.fact_id).sort());
 },300_000);

 it('the same page re-published with a changed value inside the SAME filing is a duplicate candidate key: no new row, no conflict',async()=>{
  const parsed=parseTushareStatements(snapshots[TS_CODE],{sinceYear:2000});
  const target=parsed.candidates.filter(c=>c.concept==='revenue'&&c.duration==='12M'&&rt(c.filingRef)==='1').sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd))[1];   // a day the previous test did not dispute
  const page1=incomePage(snapshots[TS_CODE],'1');const t1=pageOf(page1);
  const fields=t1.data!.fields;const ei=fields.indexOf('end_date'),fi=fields.indexOf('total_revenue');
  const row=t1.data!.items.find(r=>r[ei]===target.periodEnd.replace(/-/g,''))!;row[fi]={__num:`${target.value}1`};
  const original=snapshots[TS_CODE];snapshots[TS_CODE]=replacePage(snapshots[TS_CODE],page1,t1);
  let r;try{r=await run([issuers[TS_CODE]]);}finally{snapshots[TS_CODE]=original;}
  expect(r.detail).toMatchObject({published:1,failed:0});expect(r.counts).toMatchObject({inserted:0,versioned:0,quarantined:0});expect(r.counts.duplicates).toBeGreaterThan(0);
  const filingId=(await db.filingsOfIssuer(issuers[TS_CODE],'CN',{})).find(f=>f.source_ref===target.filingRef)!.filing_id;
  const rows=(await db.readFacts(issuers[TS_CODE],'CN',{concepts:['revenue'],asOf:today(),from:target.periodEnd,to:target.periodEnd,history:true,includeNonOk:true})).rows.filter(x=>x.duration==='12M'&&x.filing_id===filingId);
  expect(rows.map(x=>[x.status,x.value_text])).toEqual([['ok',target.value]]);   // one row for that filing, the stored value untouched
 },300_000);

 it('the recorded annual filing is linked to one cninfo PDF; other filings carry a counted attempt',async()=>{
  const filings=await db.filingsOfIssuer(issuers[TS_CODE],'CN',{});
  const annual=filings.find(f=>f.form_type==='annual'&&f.fiscal_year===cninfo.__recorded.fiscal_year&&f.available_date===cninfo.__recorded.available_date);
  expect(annual,'annual filing on the recorded date').toBeDefined();
  expect(annual).toMatchObject({document_ref:expect.stringMatching(/^\d+$/),document_url:expect.stringMatching(/^https:\/\/static\.cninfo\.com\.cn\//),link_attempts:1});
  const other=filings.filter(f=>f.form_type==='q1'&&f.document_ref===null);
  expect(other.length).toBeGreaterThan(0);for(const f of other)expect(f.link_attempts).toBeGreaterThanOrEqual(1);
 });

 it('CN gold gate: templates match the recorded Tushare annual filings; recorded entries need provenance and replay; required.CN / ready enforce the matrix (round-1 #19)',async()=>{
  const gold=JSON.parse(readFileSync(new URL('./fixtures/gold/plan2.json',import.meta.url),'utf8')) as GoldFile;
  const cn=gold.entries.filter(e=>e.issuer.market==='CN');
  expect(cn.length).toBeGreaterThan(0);
  for(const e of cn)expect((TS_CODES as readonly string[]).includes(e.issuer.ticker),`${e.issuer.ticker}: no recorded Tushare fixture (every asserted issuer is ingested by this suite)`).toBe(true);
  // Structure, always: every entry (template or recorded) pairs with an rt1 annual filing in the recorded fixtures — as_of is its announcement date, the concept/unit exist there.
  for(const code of new Set(cn.map(e=>e.issuer.ticker))){
   const parsed=parseTushareStatements(snapshots[code],{sinceYear:2000});
   for(const e of cn.filter(x=>x.issuer.ticker===code)){
    const label=`${code}/${e.concept}/${e.period_end}`;
    expect(e.as_of,`${label}: as_of is the original annual announcement date`).toBeTruthy();
    const hit=parsed.candidates.find(c=>c.concept===e.concept&&c.periodEnd===e.period_end&&c.unit===e.unit&&rt(c.filingRef)==='1'&&parsed.filings.find(f=>f.sourceRef===c.filingRef)?.formType==='annual'&&parsed.filings.find(f=>f.sourceRef===c.filingRef)?.availableDate===e.as_of);
    expect(hit,`${label}: no type-1 annual fact on ${e.as_of} in the recorded fixtures`).toBeDefined();
   }
  }
  const recorded=cn.filter(e=>!isPending(e));
  const gaps=recorded.map(e=>({e,gaps:provenanceGaps(e)})).filter(x=>x.gaps.length>0).map(x=>`${x.e.issuer.ticker}/${x.e.concept}/${x.e.period_end}: ${x.gaps.join(',')}`);
  expect(gaps,'recorded CN entries must carry document, page_or_row, url and recorded_at (a human transcribed them from the cninfo PDF)').toEqual([]);
  if(!gold.ready&&!gold.required.CN){
   console.warn(`CN GOLD INCOMPLETE (not failing): ${cn.filter(isPending).length}/${cn.length} CN entries still <pending>; no recorded entry for ${TS_CODES.filter(c=>!recorded.some(e=>e.issuer.ticker===c)).join(', ')||'-'}. Owner step (runbook 8.11-5/6): transcribe value + page from the cninfo PDF, then set required.CN.`);
  }
  if(gold.required.CN)for(const code of TS_CODES)expect(recorded.some(e=>e.issuer.ticker===code),`gold entry for ${code} is still <pending> — owner step (runbook 8.11-5/6)`).toBe(true);
  if(gold.ready){
   expect(cn.filter(isPending).map(e=>`${e.issuer.ticker}/${e.concept}/${e.period_end}`),'pending CN entries in a ready gold file').toEqual([]);
   for(const code of new Set(cn.map(e=>e.issuer.ticker))){   // per-period matrix for each CN issuer (round-2 N2); the 6-issuer total is checked by the US suite over the whole file
    const periods=new Map<string,Set<string>>();for(const e of cn.filter(e=>e.issuer.ticker===code))(periods.get(e.period_end)??periods.set(e.period_end,new Set()).get(e.period_end)!).add(e.concept);
    expect([...periods.values()].filter(c=>c.size>=6).length,`${code}: at least 2 periods with >= 6 concepts each`).toBeGreaterThanOrEqual(2);
   }
  }
  for(const e of recorded){   // every recorded entry replays against the published facts (ready or not)
   const issuer=issuers[e.issuer.ticker];expect(issuer,`no fixture-backed issuer for ${e.issuer.ticker}`).toBeDefined();
   const res=await db.readFacts(issuer,'CN',{concepts:[e.concept],asOf:e.as_of??today(),from:e.period_end,to:e.period_end});
   const duration=e.duration??(conceptById(e.concept)?.nature==='instant'?'INSTANT':'12M');
   const row=res.rows.find(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===duration&&r.is_current);
   expect(row,`${e.issuer.ticker} ${e.concept} ${e.period_end} ${duration} ${e.unit}`).toBeDefined();expect(row!.value_text).toBe(e.value);
  }
 });
});
