// PG17 bridge: real F3 SQL functions, published filings, and anon RLS on the route resolver.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {resolveFilingDocument} from '../documents/by-filing';
import {pgDocumentsDb} from '../documents/pg-documents-db';
import {readPublicCitationById} from '../documents/citations';
import {pageDetail} from '../documents/read-route';
import type {ObjectStore} from '../documents/types';
import {readPublicFactCitations} from '../documents/public-citations';

const enabled=!!process.env.S4_TEST_STATE;
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const uuid=()=>randomUUID();

describe.skipIf(!enabled)('company ↔ F3 documents on PostgreSQL 17',()=>{
 let pool:Pool;
 const q=async(sql:string,args:unknown[]=[])=> (await pool.query(sql,args)).rows as Record<string,any>[];
 const one=async(sql:string,args:unknown[]=[])=> (await q(sql,args))[0]?.v;
 beforeAll(()=>{const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));pool=new Pool({connectionString:state.adminUrl});});
 afterAll(async()=>{await pool?.end();});

 async function fixture(){
  const issuer=uuid(),batch=uuid(),factsBatch=uuid(),ref=uuid(),filing=uuid(),fact=uuid();
  await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'Bridge test')`,[issuer]);
  await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'documents-sync','documents.edgar')`,[batch]);
  await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[factsBatch]);
  await one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[JSON.stringify([{issuer_id:issuer,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
  expect(await one(`select public.claim_fact_sync_lease($1,'US',$2,600) v`,[issuer,factsBatch])).toBe(true);
  const run=String(await one(`select public.begin_sync_run($1,'US',$2,1) v`,[issuer,factsBatch]));
  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:filing,source:'edgar',origin:'sec',form_type:'10-K',available_date:'2026-02-01',source_ref:ref,url:null}])]) as Record<string,string>;
  expect(m[ref]).toBe(filing);
  expect(await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify([{fact_id:fact,filing_id:filing,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'1234',unit:'USD',consolidation:'consolidated',available_date:'2026-02-01',mapping_version:'facts-map/1',raw_hash:sha('bridge-fact')}])])).toBe(1);
  await one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,[filing]]);
  expect(await one(`select public.reconcile_document_sync_scope('edgar',$1::jsonb) v`,[JSON.stringify([{issuer_id:issuer,reasons:['test'],priority:10,fetch_key:'0000000001'}])])).toBe(1);
  expect(await one(`select public.claim_document_sync_lease($1,'edgar',$2,600) v`,[issuer,batch])).toBe(true);
  return {issuer,batch,factsBatch,run,ref,filing,fact};
 }
 type Fixture=Awaited<ReturnType<typeof fixture>>;
 async function insertDoc(f:Fixture,sourceRef:string,filingRef=f.ref,day='2026-03-01'){
  const content=sha(uuid());const at=`${day}T00:00:00.000Z`;
  const doc={source_ref:sourceRef,market:'US',form_type:'10-K',doc_class:'annual_report',classifier_gen:1,title:'Test filing',language:'en',source_url:`https://www.sec.gov/${sourceRef}`,
   content_sha256:content,bytes:100,mime:'text/html',storage_path:`blobs/${content}.html`,acquisition:{fetched_at:at},published_at:at,published_at_precision:'instant',available_at:at,available_date:day,
   fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',filing_source_ref:filingRef,permission:'public',owner_user_id:null,license_ref:null,code_version:'test'};
  const result=await one(`select public.insert_document_version($1,'edgar',$2,$3::jsonb,'[]'::jsonb) v`,[f.issuer,f.batch,JSON.stringify(doc)]);
  return String(result.document_id);
 }
 // One anon transaction for both the filing filter and the real pgDocumentsDb RPC path.
 async function asAnon<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  const c=await pool.connect();try{await c.query('begin');await c.query('set local role anon');return await fn(c);}finally{await c.query('rollback').catch(()=>{});c.release();}
 }
 const resolve=(c:PoolClient,filing:string,asOf='2026-04-01')=>resolveFilingDocument(filing,asOf,pgDocumentsDb({query:(...args:Parameters<PoolClient['query']>)=>c.query(...args)} as unknown as Pool));
 it('matches exact filing_source_ref',async()=>{
  const f=await fixture();const id=await insertDoc(f,`${f.ref}/main`);
  await asAnon(async c=>expect((await resolve(c,f.filing))?.document?.documentId).toBe(id));
  await asAnon(async c=>expect(await resolve(c,f.filing,'2026-01-01')).toBeNull());
 });
 it('uses read_documents as-of version selection after exact binding',async()=>{
  const f=await fixture();const ref=`${f.ref}/main`;
  const v1=await insertDoc(f,ref,f.ref,'2026-03-01');const v2=await insertDoc(f,ref,f.ref,'2026-05-01');
  await asAnon(async c=>{
   expect((await resolve(c,f.filing,'2026-04-01'))?.document?.documentId).toBe(v1);
   expect((await resolve(c,f.filing,'2026-06-01'))?.document?.documentId).toBe(v2);
  });
 });
 it('does not let a competing version bound to another filing mask the exact bound version',async()=>{
  const f=await fixture();const ref=`${f.ref}/main`;
  const bound=await insertDoc(f,ref,f.ref);
  await insertDoc(f,ref,uuid(),'2026-03-02');
  await asAnon(async c=>expect((await resolve(c,f.filing))?.document?.documentId).toBe(bound));
 });
 it('follows the published filing generation across two mapping runs',async()=>{
  const f=await fixture();const id=await insertDoc(f,`${f.ref}/main`);
  const next=String(await one(`select public.begin_sync_run($1,'US',$2,2) v`,[f.issuer,f.factsBatch]));
  const mapping=await one(`select public.stage_filings($1,$2::jsonb) v`,[next,JSON.stringify([{filing_id:uuid(),source:'edgar',origin:'sec',form_type:'10-K',available_date:'2026-02-01',source_ref:f.ref,url:null}])]);
  expect(mapping[f.ref]).toBe(f.filing);
  await one(`select public.publish_sync_run($1,$2::uuid[]) v`,[next,[f.filing]]);
  await asAnon(async c=>{
   expect((await resolve(c,f.filing))?.document?.documentId).toBe(id);
   expect((await c.query('select mapping_gen from public.filings where filing_id=$1',[f.filing])).rows[0].mapping_gen).toBe(2);
  });
 });
 it('derives issuer and source from the filing and returns filing_found false for an unknown id',async()=>{
  const f=await fixture();const other=await fixture();await insertDoc(other,`${other.ref}/main`);
  await asAnon(async c=>{
   expect(await resolve(c,uuid())).toBeNull();
   expect((await resolve(c,f.filing))?.document).toBeNull();
   const value=(await c.query('select public.read_documents_by_filing($1,$2::date) v',[f.filing,'2026-04-01'])).rows[0].v;
   expect(value).toMatchObject({filing_found:true,rows:[]});
  });
 });
 it('never returns another filing document for the same issuer',async()=>{
  const f=await fixture();await insertDoc(f,`${uuid()}/main`,uuid());
  await asAnon(async c=>expect((await resolve(c,f.filing))?.document).toBeNull());
 });
 it('reports independent matching source documents as ambiguous',async()=>{
  const f=await fixture();await insertDoc(f,`${f.ref}/main`);await insertDoc(f,`${f.ref}/attachment`);
  await asAnon(async c=>expect((await resolve(c,f.filing))?.reason).toBe('ambiguous'));
 });
 it('hides a private document from anon',async()=>{
  const f=await fixture();const user=uuid();
  await q(`insert into auth.users(id,email) values($1,$2)`,[user,`${user}@example.test`]);
  const content=sha(uuid());
  const privateDoc={issuer_id:f.issuer,market:'US',form_type:'10-K',doc_class:'annual_report',classifier_gen:1,title:'Private filing',language:'en',content_sha256:content,bytes:100,mime:'text/html',storage_path:`blobs/${content}.html`,acquisition:{fetched_at:'2026-03-01T00:00:00Z'},published_at:'2026-03-01T00:00:00Z',published_at_precision:'instant',available_at:'2026-03-01T00:00:00Z',available_date:'2026-03-01',filing_source_ref:f.ref,permission:'private',batch_id:f.batch,code_version:'test'};
  const privateId=String((await one(`select public.insert_upload_document($1,$2::jsonb) v`,[user,JSON.stringify(privateDoc)])).document_id);
  await asAnon(async c=>{
   const result=await resolve(c,f.filing);
   expect(result).toMatchObject({document:null,reason:'not_found'});
   expect(JSON.stringify(result)).not.toContain(privateId);
   expect(JSON.stringify(result)).not.toContain('Private filing');
  });
  await asAnon(async c=>expect(await pgDocumentsDb({query:(...args:Parameters<PoolClient['query']>)=>c.query(...args)} as unknown as Pool).documentById(privateId)).toBeNull());
 });
 it('citation by factId resolves a slice whose hash matches page text',async()=>{
  const f=await fixture();const id=await insertDoc(f,`${f.ref}/main`);const text='Revenue 1,234 USD';const extBatch=uuid();
  await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'documents-extract','documents.extract')`,[extBatch]);
  expect(await one(`select public.claim_document_extract_lease($1,$2,600) v`,[id,extBatch])).toBe(true);
  const extraction={extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'test',has_text_layer:true,page_count:1,pages_json_path:`extractions/${sha(uuid())}.json`,pages_json_sha256:sha(uuid())};
  const pages=[{page_no:1,text,text_hash:sha(text),char_count:Array.from(text).length,width:595,height:842,line_count:1,has_tables:false}];
  await one(`select public.finish_document_extract($1,$2,$3::jsonb,$4::jsonb) v`,[id,extBatch,JSON.stringify(extraction),JSON.stringify(pages)]);
  const ext=(await q(`select current_extraction_id from public.disclosure_documents where document_id=$1`,[id]))[0].current_extraction_id;
  const start=Array.from(text).join('').indexOf('1,234');const citation=await one(`select public.insert_citation($1::jsonb) v`,[JSON.stringify({document_id:id,extraction_id:ext,page_no:1,char_start:start,char_end:start+5,bbox:null,snippet:'1,234',text_hash:sha(text),created_by:'module',created_ref:'bridge-test'})]);
  await one(`select public.publish_citations($1::uuid[]) v`,[[citation]]);
  await q(`insert into public.fact_citations(fact_id,citation_id,role) values($1,$2,'value')`,[f.fact,citation]);
  await asAnon(async c=>{
   expect((await resolve(c,f.filing))?.document?.documentId).toBe(id);
   const db=pgDocumentsDb({query:(...args:Parameters<PoolClient['query']>)=>c.query(...args)} as unknown as Pool);
   const result=await readPublicFactCitations(f.fact,{
    fact:async id=>(await c.query(`select fact_id,concept,period_start,period_end,unit,value_text,filing_id,status from public.financial_facts where fact_id=$1 and status='ok'`,[id])).rows[0]??null,
    filing:async id=>(await c.query(`select mapping_gen from public.filings where filing_id=$1`,[id])).rows[0]??null,
    links:async(id,from,to)=>(await c.query(`select role,citation_id from public.fact_citations where fact_id=$1 order by role,citation_id limit $2 offset $3`,[id,to-from+1,from])).rows,
   },db);
   expect(result?.citations.map(x=>x.citationId)).toContain(citation);
   const view=await readPublicCitationById(db,citation);expect(view?.snippet).toBe('1,234');expect(view?.integrity).toBe('ok');expect(view?.textHash).toBe(sha(text));
   const document=await db.documentById(id);
   const page=await pageDetail(db,{} as ObjectStore,document!,view!.pageNo,view!.extractionId,false);
   expect(page).toMatchObject({documentId:id,extractionId:ext,textHash:sha(text)});
   expect(sha(page!.text)).toBe(view!.textHash);
  });
 });
});
