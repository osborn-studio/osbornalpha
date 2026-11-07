// src/lib/documents/sync-hk.integration.test.ts
// Plan F3 Task 18 / spec §11.3, on real PostgreSQL (pgDocumentsDb, pgHkFactsPort, pgTableClient;
// memory object store — the local harness has no Storage service). Orchestration layer: synthetic
// bytes (their content_sha256 is their real hash) → runDocumentsSync with a listing adapter and a
// byte fetcher that never touch the network → runDocumentsExtract whose extractPdf returns the
// committed synthetic layout for those bytes → candidates + checks → human decisions → promote
// into the spec-2 tables; evidence is invisible to anon until the run publishes. Recorded layer:
// when fixtures/hkex/2026090300863_c.pages.json exists (recorded by record-fixture.ts at execution
// time) the same pipeline runs on it. Every recorded gold document is also checked offline below.
// HK gold gate mirrors src/lib/facts/sync-us.integration.test.ts: ready:false warns, ready:true
// enforces the §11.4 matrix. The cases run in order and SHARE STATE; do not reorder them.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {runDocumentsCandidates} from './candidates/run';
import type {CandidatesDeps} from './candidates/run';
import {cpSlice,sha256Hex} from './extract/pages-json';
import {runDocumentsExtract} from './extract/run';
import type {ExtractDeps} from './extract/run';
import {SYNTHETIC_ANCHORS,SYNTHETIC_SOURCE_REF,syntheticAnnualPages} from './fixtures/hkex/synthetic-annual';
import {HK_CONCEPT_IDS} from './hk-facts/checks';
import {goldNaturalKey,goldProvenanceGaps,isPendingGold,loadRecordedFixture,offlineHkCandidates,recordedOfflineDoc} from './hk-facts/eval';
import type {HkGoldEntry,HkGoldFile} from './hk-facts/eval';
import {pgHkFactsPort} from './hk-facts/pg-facts-port';
import type {HkFactsPort} from './hk-facts/facts-port';
import {memoryObjectStore} from './object-store';
import {pgDocumentsDb} from './pg-documents-db';
import type {SourceAdapter} from './sources/shared';
import {runDocumentsSync} from './sync';
import type {SyncDeps} from './sync';
import {HK_EXTRACTOR_REF,HK_PUB_GEN} from './types';
import type {CandidateRow,DocumentsDb,FinancialFactPayload,PageLayout} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const RECORDED_REF='2026090300863_c';
const HKEX_DIR=new URL('./fixtures/hkex/',import.meta.url);
const RECORDED=new URL(`${RECORDED_REF}.pages.json`,HKEX_DIR);
const recordedPresent=existsSync(RECORDED);
const RECORDED_SHA='c19912795721e6bdeeb0325bbca15873a313adbdd440f9ab2915d80219efc492';
const RECORDED_SMOKE:readonly (readonly [string,string])[]=[
 ['revenue:2026-01-01:2026-06-30:6M:CNY','3625422000'],['cost_of_revenue:2026-01-01:2026-06-30:6M:CNY','1169510000'],['gross_profit:2026-01-01:2026-06-30:6M:CNY','2455912000'],
 ['net_income:2026-01-01:2026-06-30:6M:CNY','48145000'],['total_assets::2026-06-30:INSTANT:CNY','13903111000'],['revenue:2025-01-01:2025-06-30:6M:CNY','3192499000']];
const GOLD=new URL('./fixtures/gold/hk-facts.json',import.meta.url);
const CODE='f3-integration';
const bytesOf=(tag:string)=>new TextEncoder().encode(`%PDF-1.4\n% F3 sync-hk integration ${tag}\n%%EOF\n`);
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const pdfUrl=(ref:string)=>`https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0325/${ref}.pdf`;
interface Doc{ref:string;title:string;headline:string;published:string;bytes:Uint8Array;pages:PageLayout[]}
/** sha256 → fixture file for every recorded fixtures/hkex/*.pages.json. */
function recordedFixtures():Map<string,string>{
 const out=new Map<string,string>();
 if(!existsSync(HKEX_DIR))return out;
 for(const f of readdirSync(HKEX_DIR).filter(n=>n.endsWith('.pages.json'))){
  try{out.set(loadRecordedFixture(JSON.parse(readFileSync(new URL(f,HKEX_DIR),'utf8'))).header.content_sha256,f);}catch{/* not a recorded fixture */}
 }
 return out;
}

describe.skipIf(!enabled)('F3 HK offline integration on real PostgreSQL',()=>{
 let admin:Pool;let db:DocumentsDb;let port:HkFactsPort;let issuer='';const adminUser=randomUUID();
 const store=memoryObjectStore();
 const listing:Doc[]=[];const layouts=new Map<string,PageLayout[]>();
 let syncDeps:SyncDeps;let extractDeps:ExtractDeps;let candDeps:CandidatesDeps;
 const adapter:SourceAdapter={source:'hkexnews',coverageGap:null,
  segments:()=>[{id:'2026',from:'2026-01-01',to:'2026-12-31'}],
  list:async()=>listing.map(d=>({source_ref:d.ref,source_url:pdfUrl(d.ref),title:d.title,form_type:`財務報表/環境、社會及管治資料 - [${d.headline}]`,headline:d.headline,published_at:d.published,precision:'instant' as const}))};
 const sync=()=>runDocumentsSync(syncDeps,{source:'hkexnews',limit:5,issuerIds:[issuer],sinceYear:2025,dryRun:false,triggeredBy:'script'});
 const docRow=async(ref:string)=>(await admin.query(`select document_id,issuer_id,market,language,doc_class,status,source_version,permission,mime,content_sha256,available_date::text available_date,current_extraction_id
  from public.disclosure_documents where source='hkexnews' and source_ref=$1 order by source_version desc limit 1`,[ref])).rows[0];
 const allCandidates=async(extractionId:string)=>{const out:CandidateRow[]=[];let cursor:string|null=null;do{const p=await db.candidatesOf({extractionId},{cursor,limit:1000});out.push(...p.rows);cursor=p.nextCursor;}while(cursor!==null);return out;};
 const asAnon=async<T,>(fn:(c:PoolClient)=>Promise<T>):Promise<T>=>{const c=await admin.connect();try{await c.query('set role anon');return await fn(c);}finally{await c.query('reset role').catch(()=>{});c.release();}};
 const valueCitation=(c:CandidateRow)=>(c.citations as {value:string}).value;

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  issuer=randomUUID();
  await admin.query(`insert into public.issuers(issuer_id,canonical_name_zh,country_code,hkex_stock_code_primary) values($1,'金蝶國際(F3 整合測試)','KY','00268')`,[issuer]);
  await admin.query(`insert into auth.users(id,email) values($1,'f3-hk-admin@example.test') on conflict do nothing`,[adminUser]);
  db=pgDocumentsDb(admin);port=pgHkFactsPort(admin);
  await db.reconcileScope('hkexnews',[{issuer_id:issuer,reasons:['test'],priority:10,fetch_key:'00268'}]);
  const tables=pgTableClient(admin);
  syncDeps={db,tables,store,adapter,
   fetchBytes:async(u:string)=>{const d=listing.find(x=>pdfUrl(x.ref)===u);if(!d)return 'not_found';return {bytes:d.bytes,mime:'application/pdf',status:200,headers:{'content-type':'application/pdf','content-length':String(d.bytes.length)},fetchedAt:new Date().toISOString()};},
   now:()=>new Date(),deadline:null,codeVersion:CODE,userAgent:'F3 integration test'};
  extractDeps={db,tables,store,
   extractPdf:async(bytes:Uint8Array)=>{const pages=layouts.get(sha(bytes));if(!pages)throw new Error('no layout for these bytes');return {pages,hasTextLayer:true};},
   extractHtml:()=>{throw new Error('not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:CODE};
  candDeps={db,tables,store,port,now:()=>new Date(),deadline:null,codeVersion:CODE};
  const synth:Doc={ref:SYNTHETIC_SOURCE_REF,title:'截至二零二五年十二月三十一日止年度之年報',headline:'年報',published:'2026-03-25T08:30:00.000Z',bytes:bytesOf('synthetic'),pages:syntheticAnnualPages()};
  listing.push(synth);layouts.set(sha(synth.bytes),synth.pages);
 });
 // Documents, facts and filings are append-only and test:db builds a fresh database per run; only the scope row is retired.
 afterAll(async()=>{
  if(db&&issuer)await db.reconcileScope('hkexnews',[{issuer_id:issuer,reasons:[],priority:0,fetch_key:'00268'}]).catch(()=>{});
  await admin?.end();
 });

 it('sync stores the synthetic annual report once (zh, HK, annual_report); a second sync adds nothing',async()=>{
  const r1=await sync();
  expect(r1.status).toBe('success');
  const d=await docRow(SYNTHETIC_SOURCE_REF);
  expect(d).toMatchObject({issuer_id:issuer,market:'HK',language:'zh',doc_class:'annual_report',status:'stored',source_version:1,permission:'public',mime:'application/pdf',content_sha256:sha(listing[0].bytes),available_date:'2026-03-25'});
  expect([...store.objects().keys()].some(k=>k.includes(sha(listing[0].bytes)))).toBe(true);
  const r2=await sync();
  expect(r2.status).toBe('success');
  expect(Number((await admin.query(`select count(*) n from public.disclosure_documents where source='hkexnews' and source_ref=$1`,[SYNTHETIC_SOURCE_REF])).rows[0].n)).toBe(1);
 },120_000);

 it('extract stores the layout as the current extraction (primary, candidates pending); page lengths are code points',async()=>{
  const d=await docRow(SYNTHETIC_SOURCE_REF);
  await runDocumentsExtract(extractDeps,{limit:5,documentIds:[d.document_id],dryRun:false,triggeredBy:'script'});
  const after=await docRow(SYNTHETIC_SOURCE_REF);
  expect(after.status).toBe('extracted');
  const ex=(await admin.query(`select candidates_role,candidates_status,has_text_layer,page_count from public.document_extractions where extraction_id=$1`,[after.current_extraction_id])).rows[0];
  expect(ex).toMatchObject({candidates_role:'primary',candidates_status:'pending',has_text_layer:true,page_count:3});
  const pages=(await admin.query(`select page_no,char_count,length(text) len,text from public.document_pages where extraction_id=$1 order by page_no`,[after.current_extraction_id])).rows;
  expect(pages).toHaveLength(3);
  const synthetic=syntheticAnnualPages();
  for(const p of pages){expect(p.char_count).toBe(Array.from(synthetic[p.page_no-1].text).length);expect(Number(p.len)).toBe(p.char_count);}
  expect(pages[0].text).toContain('綜合損益表');
 },120_000);

 it('candidates + checks: every anchor carries checks_passed, nothing is decided, and none of it is visible to anon',async()=>{
  const d=await docRow(SYNTHETIC_SOURCE_REF);
  const r=await runDocumentsCandidates(candDeps,{limit:5,extractionIds:[d.current_extraction_id],dryRun:false,triggeredBy:'script',phases:['candidates','auto']});
  expect(r.status).toBe('success');
  expect(r.extractions[0]).toMatchObject({extractionId:d.current_extraction_id,outcome:'done'});
  const cands=await allCandidates(d.current_extraction_id);
  for(const a of SYNTHETIC_ANCHORS){
   const c=cands.find(x=>x.natural_key===a.natural_key);
   expect(c,a.natural_key).toBeDefined();
   expect((c!.payload as FinancialFactPayload).value,a.natural_key).toBe(a.value);
   expect(c!.checks_passed,`${a.natural_key} ${JSON.stringify(c!.checks.filter(x=>x.passed===false))}`).toBe(true);
  }
  expect(cands.every(c=>c.status==='candidate'&&c.extractor_ref===HK_EXTRACTOR_REF)).toBe(true);
  const revenue=cands.find(x=>x.natural_key===SYNTHETIC_ANCHORS[0].natural_key)!;
  await asAnon(async c=>{
   await expect(c.query('select 1 from public.extraction_candidates limit 1')).rejects.toThrow(/permission denied/);
   expect((await c.query('select citation_id from public.document_citations where citation_id=$1',[valueCitation(revenue)])).rows).toEqual([]);
  });
 },120_000);

 it('human confirmation and the promote phase publish HK facts with evidence; anon sees the evidence only after publish (spec §12 example 3)',async()=>{
  const d=await docRow(SYNTHETIC_SOURCE_REF);
  const main=(await allCandidates(d.current_extraction_id)).filter(c=>c.checks_passed);
  expect(main.length).toBeGreaterThanOrEqual(SYNTHETIC_ANCHORS.filter(a=>a.natural_key.includes(':2025-12-31:')).length);
  for(const c of main)await db.decideCandidate(c.candidate_id,{kind:'human',decided_by:adminUser,status:'confirmed'});
  const revenue=main.find(c=>c.natural_key===SYNTHETIC_ANCHORS[0].natural_key)!;
  await asAnon(async c=>{expect((await c.query('select 1 from public.document_citations where citation_id=$1',[valueCitation(revenue)])).rows).toEqual([]);});
  expect((await port.promotionDue(HK_PUB_GEN,100)).map(x=>x.issuerId)).toContain(issuer);
  const r=await runDocumentsCandidates(candDeps,{limit:100,dryRun:false,triggeredBy:'script',phases:['promote']});
  expect(r.promote.find(p=>p.issuerId===issuer)).toMatchObject({outcome:'published'});
  await asAnon(async c=>{
   const envelope=(await c.query("select public.read_facts($1,'HK',null,'2026-12-31',null,null,false,100,false) facts",[issuer])).rows[0].facts;
   expect(envelope.truncated).toBe(false);
   expect(envelope.rows).toHaveLength(main.length);
   const expectedCells=[['收益','6,256,000'],['銷售成本','(2,100,000)'],['毛利','4,156,000'],['資產總值','20,000,000'],
    ['經營活動所得現金淨額','900,000'],['投資活動所用現金淨額','(500,000)'],['收益','5,679,000']];
   for(const [index,anchor] of SYNTHETIC_ANCHORS.entries()){
    const fact=envelope.rows.find((f:FinancialFactPayload)=>goldNaturalKey(f)===anchor.natural_key);
    expect(fact,`public fact ${anchor.natural_key}`).toBeDefined();
    expect(fact.value,anchor.natural_key).toBe(anchor.value);
    expect(fact).toMatchObject({status:'ok',market:'HK',mapping_gen:HK_PUB_GEN});
    const filing=(await c.query('select source,origin,source_ref,mapping_gen from public.filings where filing_id=$1',[fact.filing_id])).rows[0];
    expect(filing).toMatchObject({source:'hkex',origin:'hkex',source_ref:`hkex:${SYNTHETIC_SOURCE_REF}:v1`,mapping_gen:HK_PUB_GEN});
    const candidate=main.find(x=>x.natural_key===anchor.natural_key)!;
    const cites=candidate.citations as {value:string;label:string;unit:string;unit_currency?:string;period:{citation_id:string}[]};
    const expectedRoles=[['value',cites.value],['label',cites.label],['unit',cites.unit],
     ...(cites.unit_currency?[['unit_currency',cites.unit_currency]]:[]),...cites.period.map(p=>['period',p.citation_id])];
    const links=(await c.query('select role,citation_id from public.fact_citations where fact_id=$1',[fact.fact_id])).rows;
    expect(links.map(x=>[x.role,x.citation_id]).sort()).toEqual(expectedRoles.sort());
    expect(cites.period.length).toBeGreaterThanOrEqual(2);
    for(const link of links){
     const evidence=(await c.query(`select dc.*,p.text,p.text_hash page_hash,d.current_extraction_id
      from public.document_citations dc join public.document_pages p using(extraction_id,page_no)
      join public.disclosure_documents d on d.document_id=dc.document_id where dc.citation_id=$1`,[link.citation_id])).rows[0];
     expect(evidence).toBeDefined();
     expect(evidence.document_id).toBe(d.document_id);
     expect(evidence.extraction_id).toBe(d.current_extraction_id);
     expect(evidence.extraction_id).toBe(evidence.current_extraction_id);
     expect(evidence.text_hash).toBe(sha256Hex(evidence.text));
     expect(evidence.page_hash).toBe(evidence.text_hash);
     expect(cpSlice(evidence.text,evidence.char_start,evidence.char_end)).toBe(evidence.snippet);
     const page=syntheticAnnualPages()[evidence.page_no-1];
     expect(evidence.text).toBe(page.text);
     if(link.role==='value'||link.role==='label'){
      const expected=expectedCells[index][link.role==='label'?0:1];
      const cell=page.tables.flatMap(t=>t.cells).find(cell=>cell.text===expected);
      expect(cell).toBeDefined();
      expect(evidence).toMatchObject({snippet:expected,char_start:cell!.char_start,char_end:cell!.char_end});
     }else{
      const header=page.tables.flatMap(t=>t.header_lines).flatMap(line=>[line,...line.items]);
      expect(header.some(h=>h.text===evidence.snippet&&h.char_start===evidence.char_start&&h.char_end===evidence.char_end)).toBe(true);
      if(link.role==='unit')expect(evidence.snippet).toBe('人民幣千元');
     }
     if(link.role==='value')expect(fact.raw_hash).toBe(`hkex:${String(d.content_sha256).slice(0,16)}:${d.current_extraction_id}:p${evidence.page_no}:c${evidence.char_start}-${evidence.char_end}`);
    }
    expect((await c.query('select document_id from public.filing_documents where filing_id=$1',[fact.filing_id])).rows.map(r=>r.document_id)).toContain(d.document_id);
   }
  });
  expect((await allCandidates(d.current_extraction_id)).filter(c=>c.status==='promoted')).toHaveLength(main.length);
 },120_000);

 it('nothing is due afterwards: the next promote phase does not touch this issuer',async()=>{
  expect((await port.promotionDue(HK_PUB_GEN,100)).map(x=>x.issuerId)).not.toContain(issuer);
  const r=await runDocumentsCandidates(candDeps,{limit:100,dryRun:false,triggeredBy:'script',phases:['promote']});
  expect(r.promote.find(p=>p.issuerId===issuer)).toBeUndefined();
 },120_000);

 // Always runs (critical suites may not skip): without the recorded fixture it only warns.
 it('recorded 0268.HK layout: the pipeline runs on it and agrees with every recorded gold entry of that document (warns while the fixture is not recorded)',async()=>{
  if(!recordedPresent){console.warn(`HK RECORDED FIXTURE MISSING: ${RECORDED_REF}.pages.json not recorded yet (record-fixture.ts --hkex <url>); recorded layer not run. Commander step blocks F3-4.`);return;}
  const fixture=loadRecordedFixture(JSON.parse(readFileSync(RECORDED,'utf8')));
  const doc:Doc={ref:RECORDED_REF,title:'截至二零二六年六月三十日止六個月之中期報告',headline:'中期/半年度報告',published:'2026-09-03T08:38:00.000Z',bytes:bytesOf('recorded-0268'),pages:fixture.pages.pages};
  listing.push(doc);layouts.set(sha(doc.bytes),doc.pages);
  await sync();
  const d=await docRow(RECORDED_REF);
  expect(d).toMatchObject({doc_class:'interim_report',language:'zh'});
  await runDocumentsExtract(extractDeps,{limit:5,documentIds:[d.document_id],dryRun:false,triggeredBy:'script'});
  const ex=(await docRow(RECORDED_REF)).current_extraction_id as string;
  const r=await runDocumentsCandidates(candDeps,{limit:5,extractionIds:[ex],dryRun:false,triggeredBy:'script',phases:['candidates']});
  expect(r.extractions[0]).toMatchObject({outcome:'done'});
  const cands=await allCandidates(ex);
  expect(cands.length).toBeGreaterThan(0);
  const gold=JSON.parse(readFileSync(GOLD,'utf8')) as HkGoldFile;
  const mine=gold.entries.filter(e=>!isPendingGold(e)&&e.source.document_sha256===fixture.header.content_sha256);
  if(mine.length===0)console.warn(`HK GOLD: no recorded entry for ${RECORDED_REF} (sha ${fixture.header.content_sha256}); only the pipeline ran`);
  // Pipeline smoke on the recorded layout (NOT the gold set, which a person other than the implementer transcribes):
  // figures printed on the H1 2026 income statement (p.47) and balance sheet (p.44-46), RMB thousands x 1000.
  if(fixture.header.content_sha256===RECORDED_SHA){
   for(const [nk,value] of RECORDED_SMOKE){
    const c=cands.find(x=>x.natural_key===nk);
    expect(c,nk).toBeDefined();expect(c!.checks_passed,`${nk} ${JSON.stringify(c!.checks.filter(x=>x.passed===false))}`).toBe(true);
    expect((c!.payload as FinancialFactPayload).value,nk).toBe(value);
   }
  }
  for(const e of mine){
   const c=cands.find(x=>x.natural_key===goldNaturalKey(e)&&x.checks_passed);
   if(e.value==='missing')expect(c,`${goldNaturalKey(e)} must stay missing`).toBeUndefined();
   else{expect(c,goldNaturalKey(e)).toBeDefined();expect((c!.payload as FinancialFactPayload).value,goldNaturalKey(e)).toBe(e.value);}
  }
 },300_000);

 it('HK gold gate: while ready:false it only reports; ready:true enforces 3 issuers × 2 periods × 18 concepts, provenance and recorded fixtures',()=>{
  const gold=JSON.parse(readFileSync(GOLD,'utf8')) as HkGoldFile;
  expect(gold.entries.length).toBeGreaterThan(0);
  for(const e of gold.entries)expect(HK_CONCEPT_IDS,`${e.issuer.ticker}/${e.concept}`).toContain(e.concept);
  const pending=gold.entries.filter(isPendingGold);
  const gaps=gold.entries.filter(e=>!isPendingGold(e)).map(e=>({e,g:goldProvenanceGaps(e)})).filter(x=>x.g.length>0).map(x=>`${x.e.issuer.ticker}/${x.e.concept}/${x.e.period_end}: ${x.g.join(',')}`);
  const fixtures=recordedFixtures();
  if(!gold.ready){
   console.warn(`HK GOLD INCOMPLETE (ready:false, not failing): ${pending.length}/${gold.entries.length} entries still <pending>; recorded fixtures: ${fixtures.size}; incomplete provenance: ${gaps.join(' | ')||'-'}. Owner step (spec §14 黄金集抄录) blocks F3-4.`);
   return;
  }
  expect(pending.map(e=>`${e.issuer.ticker}/${e.concept}/${e.period_end}`),'pending entries in a ready gold file').toEqual([]);
  expect(gaps,'gold entries with incomplete provenance in a ready gold file').toEqual([]);
  const byIssuer=new Map<string,Map<string,Set<string>>>();
  for(const e of gold.entries){
   const periods=byIssuer.get(e.issuer.ticker)??byIssuer.set(e.issuer.ticker,new Map()).get(e.issuer.ticker)!;
   (periods.get(e.period_end)??periods.set(e.period_end,new Set()).get(e.period_end)!).add(e.concept);
  }
  if(gold.required.HK)expect(byIssuer.size,'§11.4: at least 3 HK issuers').toBeGreaterThanOrEqual(3);
  for(const [t,periods] of byIssuer){
   const full=[...periods].filter(([,c])=>c.size>=HK_CONCEPT_IDS.length).map(([p])=>p);
   expect(full.length,`${t}: 2 periods carrying all 18 concepts (have ${[...periods].map(([p,c])=>`${p}:${c.size}`).join(', ')})`).toBeGreaterThanOrEqual(2);
  }
  for(const s of new Set(gold.entries.map(e=>e.source.document_sha256)))expect(fixtures.has(s),`no recorded fixture for document ${s} (record-fixture.ts --hkex <url>)`).toBe(true);
 });
});

// The recorded extraction layer does not need PostgreSQL: run the real generator and checks for
// every non-pending gold document, even while ready:false. Missing recordings must not silently
// suppress assertions for already transcribed gold entries.
async function assertRecordedGold(gold:HkGoldFile,load:(hash:string)=>ReturnType<typeof loadRecordedFixture>){
 const entries=gold.entries.filter(e=>!isPendingGold(e));
 for(const hash of new Set(entries.map(e=>e.source.document_sha256))){
  const fixture=load(hash);
  const {candidates,results}=await offlineHkCandidates(fixture.pages,recordedOfflineDoc(fixture.header,hash));
  const passed=new Set(results.filter(r=>r.checks_passed).map(r=>r.candidate_id));
  for(const entry of entries.filter(e=>e.source.document_sha256===hash)){
   const found=candidates.filter(c=>c.natural_key===goldNaturalKey(entry)&&passed.has(c.candidate_id));
   const context=`${entry.issuer.ticker} ${hash} ${goldNaturalKey(entry)}`;
   if(entry.value==='missing')expect(found,`${context} must stay missing`).toEqual([]);
   else{
    expect(found,context).toHaveLength(1);
    expect((found[0].payload as FinancialFactPayload).value,context).toBe(entry.value);
   }
  }
 }
}
describe('HK recorded gold extraction coverage',()=>{
 it('generates and checks every recorded gold document, including missing entries',async()=>{
  const gold=JSON.parse(readFileSync(GOLD,'utf8')) as HkGoldFile;
  const fixtures=recordedFixtures();
  await assertRecordedGold(gold,hash=>{
   const file=fixtures.get(hash);
   expect(file,`recorded gold requires fixture ${hash}`).toBeDefined();
   return loadRecordedFixture(JSON.parse(readFileSync(new URL(file!,HKEX_DIR),'utf8')));
  });
 });
 it('detects wrong values and unexpected missing-entry candidates in the second document',async()=>{
  const hashes=['a'.repeat(64),'b'.repeat(64)];
  const entry=(hash:string,value:string):HkGoldEntry=>({issuer:{ticker:'TEST.HK'},concept:'revenue',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',unit:'CNY',value,
   source:{document_sha256:hash,page:1,line_text:'收益 6,256,000 5,679,000'},recorded_by:'synthetic regression',recorded_at:'2026-11-06T00:00:00Z'});
  const load=(hash:string)=>loadRecordedFixture({header:{content_sha256:hash,doc_class:'annual_report'},pages_json:{content_sha256:hash,extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:CODE,has_text_layer:true,pages:syntheticAnnualPages()}});
  const gold:HkGoldFile={version:1,ready:false,required:{HK:true},issuers:[],entries:[entry(hashes[0],'6256000000'),entry(hashes[1],'6256000000')]};
  await expect(assertRecordedGold(gold,load)).resolves.toBeUndefined();
  gold.entries[1].value='1';
  await expect(assertRecordedGold(gold,load)).rejects.toThrow(hashes[1]);
  gold.entries[1].value='missing';
  await expect(assertRecordedGold(gold,load)).rejects.toThrow('must stay missing');
  gold.entries[1].concept='capital_expenditure';
  await expect(assertRecordedGold(gold,load)).resolves.toBeUndefined();
 });
});
