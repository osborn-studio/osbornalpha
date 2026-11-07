// src/lib/documents/sync-us.integration.test.ts
// Plan F3 Task 18 / spec §11.3 美股文档, on real PostgreSQL: the recorded EDGAR submissions fixture
// gives the 8-K row (accession 0001321655-26-000039); runDocumentsSync stores the 8-K HTML as the
// main document and the synthetic index.json as its required filing_index asset in one call (no
// network: the byte fetcher serves fixtures); a second sync adds nothing. runDocumentsExtract with
// the real extractHtml splits the HTML into pages (no 200,000-character truncation, code-point
// lengths); a module citation of "Item 2.02" verifies ok and becomes visible to anon only after
// publish_citations. The cases share state and run in order.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {cite,verify} from './citations';
import {extractHtml} from './extract/html';
import {runDocumentsExtract} from './extract/run';
import type {ExtractDeps} from './extract/run';
import {memoryObjectStore} from './object-store';
import {pgDocumentsDb} from './pg-documents-db';
import type {Listed,SourceAdapter} from './sources/shared';
import {runDocumentsSync} from './sync';
import type {SyncDeps} from './sync';
import type {DocumentsDb} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const fixture=(rel:string)=>new Uint8Array(readFileSync(new URL(rel,import.meta.url)));
const SUBMISSIONS=JSON.parse(new TextDecoder().decode(fixture('../research/ingest/__fixtures__/collectors/edgar-submissions-1321655.json'))) as {filings:{recent:Record<string,(string|number)[]>}};
const EIGHT_K=fixture('../research/ingest/__fixtures__/collectors/edgar-8k-pltr-20260803.htm');
const INDEX=fixture('./fixtures/edgar/index-000132165526000039.json');
const ACCN='0001321655-26-000039';
const CIK='1321655';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** Code-point index of the first occurrence of needle (never UTF-16 offsets). */
function cpIndexOf(text:string,needle:string):number{
 const cps=Array.from(text),n=Array.from(needle);
 for(let i=0;i+n.length<=cps.length;i++)if(n.every((c,k)=>cps[i+k]===c))return i;
 return -1;
}

describe.skipIf(!enabled)('F3 US document offline integration on real PostgreSQL',()=>{
 let admin:Pool;let db:DocumentsDb;let issuer='';
 const store=memoryObjectStore();
 let listed:Listed;let syncDeps:SyncDeps;let extractDeps:ExtractDeps;
 const base=`https://www.sec.gov/Archives/edgar/data/${CIK}/${ACCN.replaceAll('-','')}`;
 const sync=()=>runDocumentsSync(syncDeps,{source:'edgar',limit:5,issuerIds:[issuer],sinceYear:2025,dryRun:false,triggeredBy:'script'});
 const docRow=async()=>(await admin.query(`select document_id,issuer_id,source,market,doc_class,language,mime,status,filing_source_ref,content_sha256,published_at,available_date::text available_date,current_extraction_id
  from public.disclosure_documents where source='edgar' and source_ref=$1`,[listed.source_ref])).rows;
 const asAnon=async<T,>(fn:(c:PoolClient)=>Promise<T>):Promise<T>=>{const c=await admin.connect();try{await c.query('set role anon');return await fn(c);}finally{await c.query('reset role').catch(()=>{});c.release();}};

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  await admin.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,'Palantir Technologies Inc.','US',$2) on conflict do nothing`,[randomUUID(),CIK]);
  issuer=(await admin.query(`select issuer_id from public.issuers where cik=$1`,[CIK])).rows[0].issuer_id;
  db=pgDocumentsDb(admin);
  await db.reconcileScope('edgar',[{issuer_id:issuer,reasons:['test'],priority:10,fetch_key:CIK.padStart(10,'0')}]);
  const r=SUBMISSIONS.filings.recent;const i=r.accessionNumber.indexOf(ACCN);
  expect(i).toBeGreaterThanOrEqual(0);
  const primary=String(r.primaryDocument[i]);
  listed={source_ref:`${ACCN}/${primary}`,source_url:`${base}/${primary}`,title:`${String(r.form[i])} ${String(r.primaryDocDescription?.[i]??'')}`.trim(),form_type:String(r.form[i]),
   published_at:new Date(String(r.acceptanceDateTime[i])).toISOString(),precision:'instant',assets:[{role:'filing_index',filename:'index.json',url:`${base}/index.json`,required:true}]};
  const adapter:SourceAdapter={source:'edgar',coverageGap:null,segments:()=>[{id:'recent',from:'2026-01-01',to:'2026-12-31'}],list:async()=>[listed]};
  const tables=pgTableClient(admin);
  syncDeps={db,tables,store,adapter,
   fetchBytes:async(u:string)=>{
    const now=new Date().toISOString();
    if(u===listed.source_url)return {bytes:EIGHT_K,mime:'text/html',status:200,headers:{'content-type':'text/html'},fetchedAt:now};
    if(u===`${base}/index.json`)return {bytes:INDEX,mime:'application/json',status:200,headers:{'content-type':'application/json'},fetchedAt:now};
    return 'not_found';
   },
   now:()=>new Date(),deadline:null,codeVersion:'f3-integration',userAgent:'F3 integration test'};
  extractDeps={db,tables,store,extractPdf:async()=>{throw new Error('not in this suite');},extractHtml,now:()=>new Date(),deadline:null,codeVersion:'f3-integration'};
 });
 afterAll(async()=>{
  if(db&&issuer)await db.reconcileScope('edgar',[{issuer_id:issuer,reasons:[],priority:0,fetch_key:CIK.padStart(10,'0')}]).catch(()=>{});
  await admin?.end();
 });

 it('sync stores the 8-K as an edgar current_report with its filing index asset in one call; a second sync adds nothing',async()=>{
  const r1=await sync();
  expect(r1.status).toBe('success');
  const rows=await docRow();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({issuer_id:issuer,source:'edgar',market:'US',doc_class:'current_report',language:'en',mime:'text/html',status:'stored',filing_source_ref:ACCN,content_sha256:sha(EIGHT_K),available_date:'2026-08-03'});
  expect(new Date(rows[0].published_at).toISOString()).toBe(listed.published_at);
  const assets=(await admin.query(`select role,filename,mime,content_sha256 from public.document_assets where document_id=$1`,[rows[0].document_id])).rows;
  expect(assets).toEqual([{role:'filing_index',filename:'index.json',mime:'application/json',content_sha256:sha(INDEX)}]);
  const keys=[...store.objects().keys()];
  expect(keys.some(k=>k.includes(sha(EIGHT_K)))).toBe(true);expect(keys.some(k=>k.includes(sha(INDEX)))).toBe(true);
  expect((await sync()).status).toBe('success');
  expect(await docRow()).toHaveLength(1);
  expect(Number((await admin.query(`select count(*) n from public.document_assets where document_id=$1`,[rows[0].document_id])).rows[0].n)).toBe(1);
 },120_000);

 it('extract splits the HTML into pages without truncation; no candidates role for US documents; lengths are code points',async()=>{
  const [d]=await docRow();
  await runDocumentsExtract(extractDeps,{limit:5,documentIds:[d.document_id],dryRun:false,triggeredBy:'script'});
  const [after]=await docRow();
  expect(after.status).toBe('extracted');
  const ex=(await admin.query(`select candidates_role,candidates_status,has_text_layer,page_count from public.document_extractions where extraction_id=$1`,[after.current_extraction_id])).rows[0];
  expect(ex).toMatchObject({candidates_role:'none',candidates_status:'n/a',has_text_layer:true});
  expect(ex.page_count).toBeGreaterThanOrEqual(1);
  const pages=(await admin.query(`select page_no,char_count,length(text) len,text from public.document_pages where extraction_id=$1 order by page_no`,[after.current_extraction_id])).rows;
  expect(pages).toHaveLength(ex.page_count);
  for(const p of pages)expect(Number(p.len)).toBe(p.char_count);
  expect(pages.map(p=>p.text).join('\n')).toContain('Item 2.02');
 },120_000);

 it('a module citation verifies ok and is visible to anon only after publish_citations',async()=>{
  const [d]=await docRow();
  const page=(await admin.query(`select page_no,text from public.document_pages where extraction_id=$1 and position('Item 2.02' in text)>0 order by page_no limit 1`,[d.current_extraction_id])).rows[0];
  const start=cpIndexOf(page.text,'Item 2.02');
  expect(start).toBeGreaterThanOrEqual(0);
  const id=await cite(db,{document_id:d.document_id,extraction_id:d.current_extraction_id,page_no:page.page_no,char_start:start,char_end:start+9,created_by:'module',created_ref:'f3-integration'});
  expect(await verify(db,id)).toEqual({integrity:'ok',currentExtraction:true});
  expect((await admin.query(`select substr(text,$2::int+1,9) s from public.document_pages where extraction_id=$1 and page_no=$3`,[d.current_extraction_id,start,page.page_no])).rows[0].s).toBe('Item 2.02');
  await asAnon(async c=>{
   expect((await c.query('select 1 from public.document_citations where citation_id=$1',[id])).rows).toEqual([]);
   expect((await c.query('select 1 from public.disclosure_documents_public where document_id=$1',[d.document_id])).rows).toHaveLength(1);
  });
  expect(await db.publishCitations([id])).toBe(1);
  await asAnon(async c=>{expect((await c.query('select snippet from public.document_citations where citation_id=$1',[id])).rows).toEqual([{snippet:'Item 2.02'}]);});
 },120_000);
});
