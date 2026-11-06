// src/lib/documents/documents.integration.test.ts
// F3-0 (document pipeline spec §4, §11.2): migration one on real PostgreSQL — nine tables, the
// public view, the disclosure-docs bucket, constraints, every trigger, every SQL function (sync
// scope and lease, version allocation, uploads, extract and candidates leases with attempts,
// citations, candidates, decisions, publications, read_documents and the service reads), real role
// privileges and RLS, code-point semantics, and (Task 3) the pgDocumentsDb contract with keyset
// paging over more than 1,000 rows. Rows are never cleaned up (append-only by design; test:db
// creates a fresh database per run); every test uses its own issuer.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {freshMigratedDatabase,replayFiles} from './fresh-db';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261108090000_disclosure_documents.sql';
const TABLES=['disclosure_documents','document_assets','document_extractions','document_pages','document_citations','extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'];
const PUBLIC_TABLES=['disclosure_documents','document_assets','document_extractions','document_pages','document_citations'];
const SERVICE_TABLES=['extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'];
const WRITE_FUNCTIONS=[
 'public.reconcile_document_sync_scope(text,jsonb)','public.claim_document_sync_lease(uuid,text,uuid,int)','public.insert_document_version(uuid,text,uuid,jsonb,jsonb)',
 'public.insert_upload_document(uuid,jsonb)','public.advance_document_cursor(uuid,text,uuid,text,jsonb,boolean,boolean)','public.release_document_sync_lease(uuid,text,uuid,text,timestamptz)',
 'public.reclassify_document(uuid,jsonb,uuid)','public.claim_document_extract_lease(uuid,uuid,int)','public.finish_document_extract(uuid,uuid,jsonb,jsonb)',
 'public.fail_document_extract(uuid,uuid,text)','public.request_document_extract(uuid,uuid,text,text)','public.claim_candidates_lease(uuid,uuid,int)',
 'public.finish_candidates(uuid,uuid,text)','public.request_candidates_regen(jsonb,uuid)','public.write_candidate_checks(uuid,uuid,jsonb)','public.insert_citation(jsonb)',
 'public.publish_citations(uuid[])','public.insert_candidates(uuid,uuid,jsonb)','public.decide_candidate(uuid,jsonb)','public.stage_candidate_publication(uuid,int,uuid,uuid)',
 'public.documents_stored_due(int)','public.extractions_candidates_due(int)','public.known_source_refs(uuid,text,text[])','public.list_candidates(uuid,text,uuid,jsonb,int)',
 'public.list_candidate_publications(uuid[],uuid,uuid,int,text,jsonb,int)','public.renew_document_extract_lease(uuid,uuid,int)','public.renew_candidates_lease(uuid,uuid,int)',
];
const INTERNAL_FUNCTIONS=['public.doc_scope_lock(uuid,text,uuid)','public.doc_extract_lock(uuid,uuid)','public.doc_candidates_lock(uuid,uuid)','public.candidate_citation_ids(jsonb)'];
/** Trigger-only functions (P2-3): no client role may execute them. */
const TRIGGER_FUNCTIONS=['public.disclosure_documents_limited_update()','public.document_rows_immutable()','public.document_extractions_limited_update()','public.document_citations_limited_update()',
 'public.extraction_candidates_lifecycle()','public.candidate_publications_lifecycle()','public.extraction_approvals_limited_update()'];
const READ_DOCUMENTS='public.read_documents(uuid,date,text,text,date,date,jsonb,int,boolean)';

/** Runs body as `role` on one connection inside a transaction that is always rolled back. */
async function asRole(pool:Pool,role:'anon'|'authenticated'|'service_role',body:(c:PoolClient)=>Promise<void>):Promise<void>{
 const c=await pool.connect();
 try{await c.query('begin');await c.query(`set local role ${role}`);await body(c);}
 finally{await c.query('rollback').catch(()=>{});c.release();}
}
/** One statement under a savepoint so an expected failure does not abort the surrounding transaction. */
async function tryAs(c:PoolClient,text:string,values:unknown[]=[]):Promise<{ok:true;rows:Record<string,unknown>[]}|{ok:false;code:string;message:string}>{
 await c.query('savepoint s');
 try{const r=await c.query(text,values);await c.query('release savepoint s');return {ok:true,rows:r.rows};}
 catch(e){await c.query('rollback to savepoint s');return {ok:false,code:String((e as {code?:string}).code),message:(e as Error).message};}
}

type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const cps=(s:string)=>Array.from(s);
/** Text with a supplementary-plane Han character (U+2000B) and an emoji before the cited words. */
const TEXT='綜合損益表 a\u{2000B}b\u{1F600}c 收益 1,234\n毛利 (56)';

describe.skipIf(!enabled)('F3-0 disclosure documents migration on real PostgreSQL',()=>{
 let admin:Pool;let adminUrl='';
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Docs Test')`,[id]);return id;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'documents-sync','documents.hkexnews')`,[id]);return id;};
 const user=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@example.test`]);return id;};
 const docJson=(o:Record<string,unknown>={})=>{
  const content=sha(randomUUID());const ref=`${Date.now()}${Math.floor(Math.random()*1e6)}_c`;
  return {source_ref:ref,market:'HK',form_type:'Annual Report',doc_class:'annual_report',classifier_gen:1,title:'年報',language:'zh',source_url:`https://www1.hkexnews.hk/x/${ref}.pdf`,
   content_sha256:content,bytes:1024,mime:'application/pdf',storage_path:`blobs/${content}.pdf`,acquisition:{fetched_at:'2026-03-20T10:00:00.000Z',http_status:200},
   published_at:'2026-03-20T09:00:00.000Z',published_at_precision:'instant',available_at:'2026-03-20T09:00:00.000Z',available_date:'2026-03-20',fiscal_year:2025,fiscal_period:'FY',
   period_end:'2025-12-31',filing_source_ref:null,permission:'public',owner_user_id:null,license_ref:null,code_version:'test-code',...o};
 };
 const pageJson=(n:number,text:string,o:Record<string,unknown>={})=>({page_no:n,text,text_hash:sha(text),char_count:cps(text).length,width:595,height:842,line_count:1,has_tables:false,...o});
 const extJson=(pages:number,o:Record<string,unknown>={})=>({extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'test-code',has_text_layer:true,page_count:pages,
  pages_json_path:`extractions/${sha('c')}/${sha('p')}.pages.json`,pages_json_sha256:sha(randomUUID()),...o});
 const scope=(iss:string,source='hkexnews',priority=10)=>one(`select public.reconcile_document_sync_scope($1,$2::jsonb) v`,[source,JSON.stringify([{issuer_id:iss,reasons:['test'],priority,fetch_key:'00268'}])]);
 const claim=(iss:string,b:string,source='hkexnews',ttl=600)=>one(`select public.claim_document_sync_lease($1,$2,$3,$4) v`,[iss,source,b,ttl]);
 const insertDoc=(iss:string,b:string,doc:Record<string,unknown>,assets:unknown[]=[],source='hkexnews')=>one(`select public.insert_document_version($1,$2,$3,$4::jsonb,$5::jsonb) v`,[iss,source,b,JSON.stringify(doc),JSON.stringify(assets)]);
 const ready=async(source='hkexnews')=>{const iss=await issuer();const b=await batch();expect(await scope(iss,source)).toBe(1);expect(await claim(iss,b,source)).toBe(true);return {iss,b};};
 const storedDoc=async(o:Record<string,unknown>={},source='hkexnews')=>{const {iss,b}=await ready(source);const r=await insertDoc(iss,b,docJson(o),[],source);return {iss,b,doc:r.document_id as string};};
 const claimExtract=(doc:string,b:string,ttl=600)=>one(`select public.claim_document_extract_lease($1,$2,$3) v`,[doc,b,ttl]);
 const finish=(doc:string,b:string,ext:Record<string,unknown>,pages:unknown[])=>one(`select public.finish_document_extract($1,$2,$3::jsonb,$4::jsonb) v`,[doc,b,JSON.stringify(ext),JSON.stringify(pages)]);
 const extracted=async(o:Record<string,unknown>={},texts=[TEXT,'第二頁'],source='hkexnews')=>{
  const s=await storedDoc(o,source);expect(await claimExtract(s.doc,s.b)).toBe(true);
  const ext=await finish(s.doc,s.b,extJson(texts.length),texts.map((t,i)=>pageJson(i+1,t)));
  return {...s,ext:ext as string};
 };
 const cite=(doc:string,ext:string,needle:string,by='extractor',text=TEXT)=>{
  const cp=cps(text);const n=cps(needle).length;const start=cp.findIndex((_,i)=>cp.slice(i,i+n).join('')===needle);
  return one(`select public.insert_citation($1::jsonb) v`,[JSON.stringify({document_id:doc,extraction_id:ext,page_no:1,char_start:start,char_end:start+n,bbox:null,snippet:needle,text_hash:sha(text),created_by:by,created_ref:'test'})]) as Promise<string>;
 };
 const claimCand=(ext:string,b:string,ttl=600)=>one(`select public.claim_candidates_lease($1,$2,$3) v`,[ext,b,ttl]);
 const candRow=(cits:{value:string;label:string;unit:string;period:string},o:Record<string,unknown>={})=>({kind:'financial_fact',extractor_kind:'rule',extractor_ref:'hk-facts/1/hk-facts/1.0',
  natural_key:'revenue::2025-12-31:12M:HKD',citations:{value:cits.value,label:cits.label,unit:cits.unit,period:[{role:'statement_title',citation_id:cits.period},{role:'column_header',citation_id:cits.period}]},
  payload:{concept:'revenue',value:'1234000'},fingerprint:sha('fp-revenue'),input_snapshot:{content_sha256:sha('x')},...o});
 const insertCands=(ext:string,b:string,rows:unknown[])=>one(`select public.insert_candidates($1,$2,$3::jsonb) v`,[ext,b,JSON.stringify(rows)]);
 const writeChecks=(ext:string,b:string,rows:unknown[])=>one(`select public.write_candidate_checks($1,$2,$3::jsonb) v`,[ext,b,JSON.stringify(rows)]);
 const decide=(cand:string,d:Record<string,unknown>)=>one(`select public.decide_candidate($1,$2::jsonb) v`,[cand,JSON.stringify(d)]);
 const stagePub=(cand:string,gen:number,run=randomUUID(),fact=randomUUID())=>one(`select public.stage_candidate_publication($1,$2,$3,$4) v`,[cand,gen,run,fact]);
 const approval=(o:Record<string,unknown>={})=>{
  const r={extractor_ref:'hk-facts/1/hk-facts/1.0',extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'test-code',concepts:['revenue'],gold_sha256:sha('gold'),precision:'0.96',recall:'0.97',report_path:'docs/audits/r.json',...o};
  return async(by:string)=>one(`insert into public.extraction_approvals(extractor_ref,extractor_version,table_algo_version,code_version,concepts,gold_sha256,precision,recall,report_path,approved_by)
   values($1,$2,$3,$4,$5::text[],$6,$7::numeric,$8::numeric,$9,$10) returning approval_id v`,[r.extractor_ref,r.extractor_version,r.table_algo_version,r.code_version,r.concepts,r.gold_sha256,r.precision,r.recall,r.report_path,by]) as Promise<string>;
 };
 /** A primary HK extraction under a candidates lease with one candidate whose citations are real. */
 const candidateReady=async()=>{
  const x=await extracted();expect(await claimCand(x.ext,x.b)).toBe(true);
  const cits={value:await cite(x.doc,x.ext,'1,234'),label:await cite(x.doc,x.ext,'收益'),unit:await cite(x.doc,x.ext,'綜合損益表'),period:await cite(x.doc,x.ext,'綜合損益表')};
  return {...x,cits};
 };
 const candidateIds=async(ext:string)=>(await q(`select candidate_id,natural_key,extractor_ref from public.extraction_candidates where extraction_id=$1 order by created_at,candidate_id`,[ext]));

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  adminUrl=state.adminUrl;admin=new Pool({connectionString:adminUrl});
  expect(await one(`select getdatabaseencoding() v`)).toBe('UTF8');   // code-point offsets need a UTF8 database (harness --encoding=UTF8)
 });
 afterAll(async()=>{await admin?.end();});

 it('creates nine RLS tables, the public view, the disclosure-docs bucket, select-only grants, function grants, and replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect(await one(`select reloptions v from pg_class where relname='disclosure_documents_public'`)).toEqual(['security_invoker=true']);
  expect(await q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='disclosure-docs'`)).toEqual([{id:'disclosure-docs',public:false,file_size_limit:'52428800',
   allowed_mime_types:['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json']}]);
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)for(const p of ['UPDATE','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)expect({role,t,ok:await priv(role,t,'INSERT')}).toEqual({role,t,ok:role==='service_role'&&t==='extraction_approvals'});
  for(const t of PUBLIC_TABLES)for(const role of ['anon','authenticated','service_role'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
  for(const t of SERVICE_TABLES){for(const role of ['anon','authenticated'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:false});expect(await priv('service_role',t,'SELECT')).toBe(true);}
  for(const role of ['anon','authenticated','service_role'])expect(await priv(role,'disclosure_documents_public','SELECT')).toBe(true);
  for(const role of ['anon','authenticated','service_role'])expect(await priv(role,'disclosure_documents_public','INSERT')).toBe(false);
  expect(await one(`select has_column_privilege('service_role','public.extraction_approvals','revoked_at','UPDATE') v`)).toBe(true);
  expect(await one(`select has_column_privilege('service_role','public.extraction_approvals','precision','UPDATE') v`)).toBe(false);
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const sig of WRITE_FUNCTIONS){
   for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
   expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
  }
  for(const sig of [...INTERNAL_FUNCTIONS,...TRIGGER_FUNCTIONS])for(const role of ['anon','authenticated','service_role'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
  for(const role of ['anon','authenticated','service_role'])expect(await fn(role,READ_DOCUMENTS)).toBe(true);
  // P2-3: every function the migration defines is in exactly one list — enumerated from pg_proc by the names in the file
  const names=[...new Set([...readFileSync(MIGRATION,'utf8').matchAll(/create or replace function public\.(\w+)\(/g)].map(m=>m[1]))];
  const defined=(await q(`select 'public.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1) order by 1`,[names]))
   .map(r=>String(r.sig).replace(/, /g,',').replace(/\binteger\b/g,'int').replace(/timestamp with time zone/g,'timestamptz'));
  expect(defined.sort()).toEqual([...WRITE_FUNCTIONS,...INTERNAL_FUNCTIONS,...TRIGGER_FUNCTIONS,READ_DOCUMENTS].sort());
  for(const sig of defined)for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:sig===READ_DOCUMENTS});
  // P2-2: the replay runs in a dedicated temporary database (every migration applied, then migration one again), never in the shared one
  const fresh=await freshMigratedDatabase(adminUrl);
  try{
   await expect(replayFiles(fresh.pool,[MIGRATION,MIGRATION])).resolves.toBeUndefined();
   expect((await fresh.pool.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n).toBeGreaterThan(0);
  }finally{await fresh.drop();}
  expect(await one(`select count(*)::int v from pg_database where datname=$1`,[fresh.name])).toBe(0);   // dropped
 },120000);

 it('enforces the document checks, both unique keys, de_role_status, ec_decision_shape and ea_threshold',async()=>{
  const iss=await issuer();const b=await batch();const owner=await user();
  const raw=(o:Record<string,unknown>)=>{
   const r:Record<string,unknown>={document_id:randomUUID(),issuer_id:iss,source:'hkexnews',market:'HK',source_ref:`raw-${randomUUID()}`,source_version:1,doc_class:'other',classifier_gen:1,title:'t',
    source_url:'https://x',content_sha256:sha(randomUUID()),bytes:1,mime:'application/pdf',storage_path:'blobs/x.pdf',acquisition:'{}',published_at:'2026-01-01T00:00:00Z',
    published_at_precision:'instant',available_at:'2026-01-01T00:00:00Z',available_date:'2026-01-01',permission:'public',batch_id:b,code_version:'c',...o};
   const k=Object.keys(r);return q(`insert into public.disclosure_documents(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));
  };
  await raw({});
  await expect(raw({permission:'private'})).rejects.toThrow(/dd_owner_iff_private/);
  await expect(raw({owner_user_id:owner})).rejects.toThrow(/dd_owner_iff_private/);
  await expect(raw({issuer_id:null})).rejects.toThrow(/dd_issuer_required/);
  await raw({issuer_id:null,permission:'licensed',owner_user_id:owner,source:'upload',source_url:null});   // uploads may have no issuer
  await expect(raw({source:'upload',source_url:'https://x',permission:'private',owner_user_id:owner})).rejects.toThrow(/dd_upload_shape/);
  await expect(raw({source_url:null})).rejects.toThrow(/dd_upload_shape/);
  await expect(raw({status:'extracted'})).rejects.toThrow(/dd_extracted_fields/);
  await expect(raw({observed_replacement:true})).rejects.toThrow(/dd_replacement_version/);
  await expect(raw({content_sha256:'ABC'})).rejects.toThrow(/content_sha256_check/);
  await expect(raw({mime:'image/png'})).rejects.toThrow(/mime_check/);
  const ref=`dup-${randomUUID()}`;const h=sha(ref);
  await raw({source_ref:ref,content_sha256:h});
  await expect(raw({source_ref:ref,content_sha256:sha('other')})).rejects.toThrow(/disclosure_documents_version_uniq/);
  await expect(raw({source_ref:ref,source_version:2,content_sha256:h})).rejects.toThrow(/disclosure_documents_content_uniq/);
  await expect(raw({current_extraction_id:randomUUID()})).rejects.toThrow(/dd_current_extraction_fkey/);
  const x=await extracted();
  const rawExt=(o:Record<string,unknown>)=>q(`insert into public.document_extractions(extraction_id,document_id,extractor_version,table_algo_version,code_version,has_text_layer,page_count,pages_json_path,pages_json_sha256,candidates_role,candidates_status,batch_id)
   values($1,$2,$3,'tables/1.0','c',true,0,'p',$4,$5,$6,$7)`,[randomUUID(),x.doc,o.v??`v-${randomUUID().slice(0,8)}`,sha('j'),o.role,o.status,b]);
  await expect(rawExt({role:'primary',status:'n/a'})).rejects.toThrow(/de_role_status/);
  await expect(rawExt({role:'none',status:'pending'})).rejects.toThrow(/de_role_status/);
  await expect(rawExt({role:'none',status:'n/a',v:'docs-extract/1.0'})).rejects.toThrow(/document_extractions_version_uniq/);
  const cit=await cite(x.doc,x.ext,'收益');
  const rawCand=(o:Record<string,unknown>)=>{
   const r:Record<string,unknown>={candidate_id:randomUUID(),document_id:x.doc,extraction_id:x.ext,kind:'financial_fact',extractor_kind:'rule',extractor_ref:'r',natural_key:`k-${randomUUID()}`,
    citations:JSON.stringify({value:cit}),payload:'{}',fingerprint:sha('f'),input_snapshot:'{}',batch_id:b,...o};
   const k=Object.keys(r);return q(`insert into public.extraction_candidates(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));
  };
  await rawCand({});
  await expect(rawCand({status:'confirmed'})).rejects.toThrow(/ec_decision_shape/);
  await expect(rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'human'})).rejects.toThrow(/ec_decision_shape/);
  await rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'human',decided_by:owner});
  await expect(rawCand({decision_kind:'human',decided_by:owner})).rejects.toThrow(/ec_decision_shape/);
  const A=await approval()(owner);
  await expect(rawCand({status:'rejected',decided_at:'2026-01-01Z',decision_kind:'auto',approval_id:A})).rejects.toThrow(/ec_decision_shape/);
  await expect(rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'auto',approval_id:A,decided_by:owner})).rejects.toThrow(/ec_decision_shape/);
  await rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'auto',approval_id:A});
  await expect(rawCand({extraction_id:(await extracted()).ext})).rejects.toThrow(/extraction_candidates_extraction_fkey/);   // document and extraction must agree
  const nk=`same-${randomUUID()}`;await rawCand({natural_key:nk});
  await expect(rawCand({natural_key:nk})).rejects.toThrow(/extraction_candidates_key_uniq/);
  await expect(approval({precision:'0.94'})(owner)).rejects.toThrow(/ea_threshold/);
  await expect(approval({recall:'0.949'})(owner)).rejects.toThrow(/ea_threshold/);
 });

 it('triggers: documents change processing/classification only, along the allowed status moves; assets, pages, extractions, citations, candidates, publications and approvals guard their lifecycles; nothing is deleted',async()=>{
  const x=await extracted();const owner=await user();
  const append=/append_only:/;
  await expect(q(`update public.disclosure_documents set title='x' where document_id=$1`,[x.doc])).rejects.toThrow(append);
  await expect(q(`update public.disclosure_documents set available_at=now() where document_id=$1`,[x.doc])).rejects.toThrow(append);
  await expect(q(`update public.disclosure_documents set status='extract_failed' where document_id=$1`,[x.doc])).rejects.toThrow(append);   // extracted → extract_failed
  await q(`update public.disclosure_documents set status='stored',classifier_gen=2,doc_class='interim_report' where document_id=$1`,[x.doc]);                 // extracted → stored
  await q(`update public.disclosure_documents set status='extract_failed' where document_id=$1`,[x.doc]);                                                       // stored → extract_failed
  await expect(q(`update public.disclosure_documents set status='no_text_layer' where document_id=$1`,[x.doc])).rejects.toThrow(append);
  await expect(q(`delete from public.disclosure_documents where document_id=$1`,[x.doc])).rejects.toThrow(append);
  const {iss,b}=await ready('edgar');
  const d2=(await insertDoc(iss,b,docJson({market:'US',language:'en'}),[{role:'filing_index',filename:'index.json',source_url:'https://sec/x',content_sha256:sha('i'),bytes:5,mime:'application/json',storage_path:'blobs/i.json',acquisition:{}}],'edgar')).document_id;
  await expect(q(`update public.document_assets set bytes=6 where document_id=$1`,[d2])).rejects.toThrow(append);
  await expect(q(`delete from public.document_assets where document_id=$1`,[d2])).rejects.toThrow(append);
  await expect(q(`update public.document_pages set text='x' where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  await expect(q(`delete from public.document_pages where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  await expect(q(`update public.document_extractions set page_count=9 where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  await q(`update public.document_extractions set candidates_status='done',candidates_attempts=1 where extraction_id=$1`,[x.ext]);
  await expect(q(`delete from public.document_extractions where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  const ec=await cite(x.doc,x.ext,'收益');const hc=await cite(x.doc,x.ext,'毛利','human');
  await expect(q(`update public.document_citations set snippet='x' where citation_id=$1`,[ec])).rejects.toThrow(append);
  await expect(q(`update public.document_citations set visibility='public' where citation_id=$1`,[ec])).rejects.toThrow(append);   // extractor citations are never published directly
  await q(`update public.document_citations set visibility='public' where citation_id=$1`,[hc]);
  await expect(q(`update public.document_citations set visibility='internal' where citation_id=$1`,[hc])).rejects.toThrow(append);
  await expect(q(`delete from public.document_citations where citation_id=$1`,[hc])).rejects.toThrow(append);
  const y=await candidateReady();
  await insertCands(y.ext,y.b,[candRow(y.cits)]);
  const [c]=await candidateIds(y.ext);
  await expect(q(`update public.extraction_candidates set payload='{"concept":"x"}' where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`update public.extraction_candidates set status='promoted',decision_kind='human',decided_by=$2,decided_at=now() where candidate_id=$1`,[c.candidate_id,owner])).rejects.toThrow(append);
  await q(`update public.extraction_candidates set status='rejected',decision_kind='human',decided_by=$2,decided_at=now() where candidate_id=$1`,[c.candidate_id,owner]);
  await expect(q(`update public.extraction_candidates set checks='[{"check":"x"}]' where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`update public.extraction_candidates set status='candidate',decision_kind=null,decided_by=null,decided_at=null where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`delete from public.extraction_candidates where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  const run=randomUUID(),fact=randomUUID();
  await q(`insert into public.candidate_publications(candidate_id,pub_gen,run_id,fact_id,state) values($1,1,$2,$3,'staged')`,[c.candidate_id,run,fact]);
  await expect(q(`update public.candidate_publications set run_id=$2 where candidate_id=$1`,[c.candidate_id,randomUUID()])).rejects.toThrow(append);
  await q(`update public.candidate_publications set state='abandoned' where candidate_id=$1`,[c.candidate_id]);
  await q(`update public.candidate_publications set state='staged',run_id=$2,fact_id=$3 where candidate_id=$1`,[c.candidate_id,randomUUID(),randomUUID()]);
  await q(`update public.candidate_publications set state='published' where candidate_id=$1`,[c.candidate_id]);
  await expect(q(`update public.candidate_publications set state='staged' where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`update public.candidate_publications set pub_gen=2 where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`delete from public.candidate_publications where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  const A=await approval()(owner);
  await expect(q(`update public.extraction_approvals set concepts='{x}' where approval_id=$1`,[A])).rejects.toThrow(append);
  await q(`update public.extraction_approvals set revoked_at=now() where approval_id=$1`,[A]);
  await expect(q(`update public.extraction_approvals set revoked_at=now()+interval '1 day' where approval_id=$1`,[A])).rejects.toThrow(append);
  await expect(q(`delete from public.extraction_approvals where approval_id=$1`,[A])).rejects.toThrow(append);
 });

 it('sync scope: reconcile upserts scheduling inputs only; one of eight racing batches wins the lease; cursor, release and insert need the holder',async()=>{
  const iss=await issuer();const b=await batch();
  expect(await claim(iss,b)).toBe(false);                                   // no scope row yet
  expect(await scope(iss)).toBe(1);expect(await scope(iss)).toBe(0);
  expect(await claim(iss,b)).toBe(true);
  await q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r2","settled":[],"attempts":{},"seq":2}'::jsonb,false)`,[iss,b]);
  const regress=await fails(q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r1","settled":[],"attempts":{},"seq":1}'::jsonb,false)`,[iss,b]));
  expect(regress).toMatchObject({message:'cursor_regression',code:'P0001'});   // P2-4: never backwards …
  await q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r1","settled":[],"attempts":{},"seq":1}'::jsonb,false,true)`,[iss,b]);   // … unless reset
  await q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r2","settled":[],"attempts":{},"seq":2}'::jsonb,false)`,[iss,b]);
  expect(await scope(iss,'hkexnews',5)).toBe(1);                             // priority change counted …
  expect((await q(`select priority,backfill_cursor,lease_batch_id from public.document_sync_scope where issuer_id=$1`,[iss]))[0]).toEqual({priority:5,backfill_cursor:{segment:'2024',last_ref:'r2',settled:[],attempts:{},seq:2},lease_batch_id:b});   // … cursor and lease untouched
  await q(`update public.document_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1`,[iss]);
  const racers=await Promise.all(Array.from({length:8},()=>batch()));
  const won=await Promise.all(racers.map(r=>claim(iss,r)));
  expect(won.filter(Boolean)).toHaveLength(1);const holder=racers[won.indexOf(true)];
  expect(await fails(q(`select public.advance_document_cursor($1,'hkexnews',$2,'poll',null,false)`,[iss,b]))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect(await fails(insertDoc(iss,b,docJson()))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect(await fails(q(`select public.release_document_sync_lease($1,'hkexnews',$2,'failed',now())`,[iss,b]))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect((await fails(q(`select public.release_document_sync_lease($1,'hkexnews',$2,'maybe',now())`,[iss,holder]))).message).toMatch(/^invalid_input/);
  expect((await fails(q(`select public.advance_document_cursor($1,'hkexnews',$2,'sideways',null,false)`,[iss,holder]))).message).toMatch(/^invalid_input/);
  expect((await fails(claim(iss,holder,'hkexnews',0))).message).toMatch(/^invalid_input/);
  expect((await fails(q(`select public.reconcile_document_sync_scope('upload','[]'::jsonb)`))).code).toBe('22023');
  await q(`select public.release_document_sync_lease($1,'hkexnews',$2,'success',now()+interval '1 day')`,[iss,holder]);
  expect((await q(`select lease_until,lease_batch_id,last_status,last_success_at is not null ok,next_due_at>now() due from public.document_sync_scope where issuer_id=$1`,[iss]))[0]).toEqual({lease_until:null,lease_batch_id:null,last_status:'success',ok:true,due:true});
 });

 it('insert_document_version: version allocation under the lease, duplicates write nothing, assets land with the document, foreign refs are refused',async()=>{
  const {iss,b}=await ready('edgar');
  const d=docJson({market:'US',language:'en',source_ref:`0000000000-26-${randomUUID().slice(0,6)}/a.htm`,mime:'text/html',permission:'private',owner_user_id:randomUUID(),issuer_id:randomUUID()});
  const asset={role:'filing_index',filename:'index.json',source_url:'https://sec/i',content_sha256:sha('idx'),bytes:5,mime:'application/json',storage_path:'blobs/idx.json',acquisition:{http_status:200}};
  const r1=await insertDoc(iss,b,d,[asset],'edgar');expect(r1.outcome).toBe('inserted');
  expect((await q(`select issuer_id,source,permission,owner_user_id,source_version,status,batch_id,extract_attempts from public.disclosure_documents where document_id=$1`,[r1.document_id]))[0])
   .toEqual({issuer_id:iss,source:'edgar',permission:'public',owner_user_id:null,source_version:1,status:'stored',batch_id:b,extract_attempts:0});   // arguments win over p_doc
  expect(await insertDoc(iss,b,d,[asset],'edgar')).toEqual({outcome:'duplicate',document_id:r1.document_id});
  expect(Number(await one(`select count(*) v from public.document_assets where document_id=$1`,[r1.document_id]))).toBe(1);
  const r2=await insertDoc(iss,b,{...d,content_sha256:sha('v2'),available_at:'2026-05-01T00:00:00Z',available_date:'2026-05-01'},[],'edgar');
  expect(r2.outcome).toBe('versioned');
  expect((await q(`select source_version,supersedes_document_id,observed_replacement from public.disclosure_documents where document_id=$1`,[r2.document_id]))[0]).toEqual({source_version:2,supersedes_document_id:r1.document_id,observed_replacement:true});
  const before=Number(await one(`select count(*) v from public.disclosure_documents where issuer_id=$1`,[iss]));
  expect((await fails(insertDoc(iss,b,{...d,content_sha256:sha('v3')},[asset,asset],'edgar'))).message).toMatch(/^invalid_input/);       // duplicate role/filename
  expect((await fails(insertDoc(iss,b,{...d,content_sha256:sha('v4'),mime:'image/png'},[],'edgar'))).code).toBe('23514');                  // check violation rolls back
  expect((await fails(insertDoc(iss,b,{...d,content_sha256:sha('v5')},[{...asset,content_sha256:'bad'}],'edgar'))).code).toBe('23514');    // a bad asset rolls the document back too
  expect(Number(await one(`select count(*) v from public.disclosure_documents where issuer_id=$1`,[iss]))).toBe(before);
  const other=await ready('edgar');
  expect((await fails(insertDoc(other.iss,other.b,{...d,content_sha256:sha('v6')},[],'edgar'))).message).toMatch(/^invalid_input: source_ref belongs to another issuer/);
  expect((await fails(insertDoc(iss,b,d,[],'upload'))).message).toMatch(/^invalid_input/);
  expect(await one(`select public.known_source_refs($1,'edgar',$2::text[]) v`,[iss,[d.source_ref,'nope']])).toEqual([d.source_ref]);
 });

 it('insert_upload_document: owner-scoped source_ref and dedupe, licensed/private only, issuer optional',async()=>{
  const owner=await user();const b=await batch();
  const up=(o:string,extra:Record<string,unknown>={})=>one(`select public.insert_upload_document($1,$2::jsonb) v`,[o,JSON.stringify(docJson({source_url:null,market:'other',language:null,permission:'licensed',owner_user_id:o,license_ref:'lic',batch_id:b,content_sha256:sha('report'),...extra}))]);
  const a=await up(owner);expect(a.outcome).toBe('inserted');
  expect(await up(owner)).toEqual({outcome:'duplicate',document_id:a.document_id});
  const other=await user();expect((await up(other)).document_id).not.toBe(a.document_id);
  expect((await q(`select source,source_ref,issuer_id,owner_user_id,permission from public.disclosure_documents where document_id=$1`,[a.document_id]))[0]).toEqual({source:'upload',source_ref:`${owner}/${sha('report')}`,issuer_id:null,owner_user_id:owner,permission:'licensed'});
  expect((await fails(up(await user(),{permission:'public',owner_user_id:null}))).message).toMatch(/^invalid_input: permission/);
  expect((await fails(q(`select public.insert_upload_document(null,'{}'::jsonb)`))).message).toMatch(/^invalid_input/);
 });

 it('extract lease and finish: attempts counted at claim, the claim after a third crash closes extract_failed, finish validates pages and decides the candidates role, request refuses an existing revision',async()=>{
  const {doc,b}=await storedDoc();const b2=await batch();const actor=await user();
  const due=async()=>((await one(`select public.documents_stored_due(1000) v`)) as {document_id:string}[]).some(r=>r.document_id===doc);
  expect(await due()).toBe(true);
  const racers=await Promise.all(Array.from({length:6},()=>batch()));
  const won=await Promise.all(racers.map(r=>claimExtract(doc,r)));
  expect(won.filter(Boolean)).toHaveLength(1);expect(await due()).toBe(false);
  const expire=()=>q(`update public.disclosure_documents set extract_lease_until=now()-interval '1 second' where document_id=$1`,[doc]);
  await expire();expect(await claimExtract(doc,b)).toBe(true);
  await expire();expect(await claimExtract(doc,b2)).toBe(true);
  expect(await one(`select extract_attempts v from public.disclosure_documents where document_id=$1`,[doc])).toBe(3);
  await expire();expect(await due()).toBe(true);
  expect(await claimExtract(doc,b)).toBe(false);
  expect((await q(`select status,extract_lease_batch_id from public.disclosure_documents where document_id=$1`,[doc]))[0]).toEqual({status:'extract_failed',extract_lease_batch_id:null});
  expect(await fails(q(`select public.fail_document_extract($1,$2,'extract_error')`,[doc,b]))).toMatchObject({message:'lease_lost',code:'55P03'});
  await q(`select public.request_document_extract($1,$2,'docs-extract/1.0','tables/1.0')`,[doc,actor]);
  expect((await q(`select status,extract_attempts from public.disclosure_documents where document_id=$1`,[doc]))[0]).toEqual({status:'stored',extract_attempts:0});
  expect(await claimExtract(doc,b)).toBe(true);
  expect((await fails(finish(doc,b,extJson(2),[pageJson(1,'a'),pageJson(2,'b',{char_count:9})]))).message).toMatch(/^invalid_input: pages/);
  expect((await fails(finish(doc,b,extJson(2),[pageJson(1,'a')]))).message).toMatch(/^invalid_input: pages/);
  expect((await fails(finish(doc,b,extJson(1),[pageJson(1,'a',{text_hash:sha('b')})]))).message).toMatch(/^invalid_input: pages/);
  expect(await fails(finish(doc,b2,extJson(1),[pageJson(1,'a')]))).toMatchObject({message:'lease_lost',code:'55P03'});
  const ext=await finish(doc,b,extJson(2),[pageJson(1,TEXT),pageJson(2,'')]);
  expect((await q(`select candidates_role,candidates_status,page_count,batch_id from public.document_extractions where extraction_id=$1`,[ext]))[0]).toEqual({candidates_role:'primary',candidates_status:'pending',page_count:2,batch_id:b});
  expect((await q(`select status,current_extraction_id,extract_lease_until from public.disclosure_documents where document_id=$1`,[doc]))[0]).toEqual({status:'extracted',current_extraction_id:ext,extract_lease_until:null});
  expect((await q(`select page_no,char_count,length(text) n from public.document_pages where extraction_id=$1 order by page_no`,[ext]))).toEqual([{page_no:1,char_count:cps(TEXT).length,n:cps(TEXT).length},{page_no:2,char_count:0,n:0}]);
  expect(await fails(q(`select public.request_document_extract($1,$2,'docs-extract/1.0','tables/1.0')`,[doc,actor]))).toMatchObject({message:'revision_exists',code:'P0001'});
  await q(`select public.request_document_extract($1,$2,'docs-extract/2.0','tables/1.0')`,[doc,actor]);   // a newer extractor re-queues; the old version and its pages stay
  expect(await claimExtract(doc,b)).toBe(true);
  const ext2=await finish(doc,b,extJson(1,{extractor_version:'docs-extract/2.0'}),[pageJson(1,'v2')]);
  expect(Number(await one(`select count(*) v from public.document_pages where extraction_id=any($1::uuid[])`,[[ext,ext2]]))).toBe(3);
  expect(await one(`select current_extraction_id v from public.disclosure_documents where document_id=$1`,[doc])).toBe(ext2);
  expect(await fails(q(`select public.request_document_extract($1,$2,'docs-extract/1.0','tables/1.0')`,[randomUUID(),actor]))).toMatchObject({message:'not_found',code:'P0002'});
  const en=await extracted({language:'en',source_ref:`${Date.now()}_e`});
  expect(await one(`select candidates_role v from public.document_extractions where extraction_id=$1`,[en.ext])).toBe('comparison');
  const us=await extracted({market:'US',language:'en',source_ref:`0000000000-26-${randomUUID().slice(0,6)}/b.htm`,mime:'text/html'},[TEXT],'edgar');
  expect((await q(`select candidates_role,candidates_status from public.document_extractions where extraction_id=$1`,[us.ext]))[0]).toEqual({candidates_role:'none',candidates_status:'n/a'});
  const s=await storedDoc();await claimExtract(s.doc,s.b);
  const scan=await finish(s.doc,s.b,extJson(1,{has_text_layer:false}),[pageJson(1,'')]);
  expect((await q(`select d.status,e.candidates_role from public.disclosure_documents d join public.document_extractions e on e.extraction_id=d.current_extraction_id where d.document_id=$1`,[s.doc]))[0]).toEqual({status:'no_text_layer',candidates_role:'none'});
  expect(scan).toBeTruthy();
 });

 it('code points: PostgreSQL length/substr equal JS Array.from slicing over supplementary-plane characters; insert_citation refuses UTF-16 offsets',async()=>{
  const x=await extracted();
  const cp=cps(TEXT);const start=cp.indexOf('收');
  expect(TEXT.indexOf('收')).toBe(start+2);                                                                   // U+2000B and U+1F600 are two UTF-16 units each
  const row=(await q(`select length(text) n,substr(text,$2::int+1,2) s,substr(text,$3::int+1,1) h,substr(text,$4::int+1,1) e from public.document_pages where extraction_id=$1 and page_no=1`,[x.ext,start,cp.indexOf('\u{2000B}'),cp.indexOf('\u{1F600}')]))[0];
  expect(row).toEqual({n:cp.length,s:'收益',h:'\u{2000B}',e:'\u{1F600}'});
  const id=await cite(x.doc,x.ext,'收益');
  expect((await q(`select char_start,char_end,snippet,visibility,text_hash from public.document_citations where citation_id=$1`,[id]))[0]).toEqual({char_start:start,char_end:start+2,snippet:'收益',visibility:'internal',text_hash:sha(TEXT)});
  const base={document_id:x.doc,extraction_id:x.ext,page_no:1,bbox:{x0:1,y0:2,x1:3,y1:4},text_hash:sha(TEXT),created_by:'extractor',created_ref:'t'};
  const ins=(o:Record<string,unknown>)=>one(`select public.insert_citation($1::jsonb) v`,[JSON.stringify({...base,...o})]);
  const u=TEXT.indexOf('收');
  expect(await fails(ins({char_start:u,char_end:u+2,snippet:TEXT.slice(u,u+2)}))).toMatchObject({message:'invalid_citation: snippet',code:'22023'});
  expect(await fails(ins({char_start:0,char_end:cp.length+1,snippet:TEXT}))).toMatchObject({message:'invalid_citation: range'});
  expect(await fails(ins({char_start:4,char_end:4,snippet:''}))).toMatchObject({message:'invalid_citation: range'});
  expect(await fails(ins({char_start:0,char_end:2,snippet:cp.slice(0,2).join(''),text_hash:sha('x')}))).toMatchObject({message:'invalid_citation: text_hash'});
  expect(await fails(ins({page_no:3,char_start:0,char_end:1,snippet:'x'}))).toMatchObject({message:'invalid_citation: page'});
  expect(await fails(ins({document_id:(await storedDoc()).doc,char_start:0,char_end:1,snippet:cp[0]}))).toMatchObject({message:'invalid_citation: page'});
  const e=await ins({char_start:cp.indexOf('\u{1F600}'),char_end:cp.indexOf('\u{1F600}')+1,snippet:'\u{1F600}'});
  expect(await one(`select bbox v from public.document_citations where citation_id=$1`,[e])).toEqual({x0:1,y0:2,x1:3,y1:4});
 });

 it('publish_citations: only human/module citations of public documents, all or nothing',async()=>{
  const x=await extracted();
  const ec=await cite(x.doc,x.ext,'收益');const hc=await cite(x.doc,x.ext,'毛利','human');const mc=await cite(x.doc,x.ext,'1,234','module');
  expect(await fails(q(`select public.publish_citations($1::uuid[])`,[[hc,ec]]))).toMatchObject({message:'not_publishable',code:'P0001'});
  expect(await one(`select visibility v from public.document_citations where citation_id=$1`,[hc])).toBe('internal');
  expect(await one(`select public.publish_citations($1::uuid[]) v`,[[hc,mc,hc]])).toBe(2);
  expect(await one(`select public.publish_citations($1::uuid[]) v`,[[hc]])).toBe(0);
  expect(await fails(q(`select public.publish_citations($1::uuid[])`,[[randomUUID()]]))).toMatchObject({message:'not_publishable'});
  const owner=await user();const b=await batch();
  const up=await one(`select public.insert_upload_document($1,$2::jsonb) v`,[owner,JSON.stringify(docJson({source_url:null,market:'other',permission:'private',owner_user_id:owner,batch_id:b}))]);
  expect(await claimExtract(up.document_id,b)).toBe(true);
  const upExt=await finish(up.document_id,b,extJson(1),[pageJson(1,TEXT)]);
  expect(await one(`select candidates_role v from public.document_extractions where extraction_id=$1`,[upExt])).toBe('none');
  const pc=await cite(up.document_id,upExt,'收益','human');
  expect(await fails(q(`select public.publish_citations($1::uuid[])`,[[pc]]))).toMatchObject({message:'not_publishable'});
 });

 it('candidates: claim counts attempts and exhausts; insert checks the lease and every citation; checks are the only writer of checks and apply human inheritance; regen resets current versions',async()=>{
  const y=await candidateReady();const b2=await batch();const actor=await user();
  expect(await claimCand(y.ext,b2)).toBe(false);
  expect(await fails(insertCands(y.ext,b2,[candRow(y.cits)]))).toMatchObject({message:'lease_lost',code:'55P03'});
  const foreign=await extracted();const fcit=await cite(foreign.doc,foreign.ext,'收益');
  expect(await fails(insertCands(y.ext,y.b,[candRow({...y.cits,label:fcit})]))).toMatchObject({message:'invalid_citation: reference',code:'22023'});
  expect(await fails(insertCands(y.ext,y.b,[candRow({...y.cits,label:'nope'})]))).toMatchObject({message:'invalid_citation: reference'});
  expect(await fails(insertCands(y.ext,y.b,[candRow(y.cits,{citations:{value:y.cits.value}})]))).toMatchObject({message:'invalid_citation: shape'});
  expect(await insertCands(y.ext,y.b,[candRow(y.cits,{kind:'field',natural_key:'field-1',citations:{value:y.cits.value}})])).toEqual({inserted:1});   // non-fact kinds need value only
  expect(await insertCands(y.ext,y.b,[candRow(y.cits),candRow(y.cits,{natural_key:'cost_of_revenue::2025-12-31:12M:HKD',fingerprint:sha('fp-cost')})])).toEqual({inserted:2});
  expect(await insertCands(y.ext,y.b,[candRow(y.cits)])).toEqual({inserted:0});
  const ids=await candidateIds(y.ext);const rev=ids.find(r=>r.natural_key.startsWith('revenue'))!.candidate_id;const cost=ids.find(r=>r.natural_key.startsWith('cost'))!.candidate_id;
  expect((await q(`select status,checks,checks_passed,decision_kind,batch_id from public.extraction_candidates where candidate_id=$1`,[rev]))[0]).toEqual({status:'candidate',checks:[],checks_passed:false,decision_kind:null,batch_id:y.b});
  const ok=[{check:'citation_verified',blocking:true,passed:true}];
  expect(await writeChecks(y.ext,y.b,[{candidate_id:rev,checks:ok,checks_passed:true},{candidate_id:cost,checks:ok,checks_passed:false}])).toEqual({written:2,inherited:0});
  expect(await fails(writeChecks(y.ext,y.b,[{candidate_id:rev,checks:'x',checks_passed:true}]))).toMatchObject({message:'invalid_input: checks'});
  expect(await fails(writeChecks(y.ext,y.b,[{candidate_id:randomUUID(),checks:[],checks_passed:false}]))).toMatchObject({message:'not_found',code:'P0002'});
  expect(await decide(rev,{kind:'human',decided_by:actor,status:'confirmed'})).toEqual({status:'confirmed'});
  expect(await fails(writeChecks(y.ext,y.b,[{candidate_id:rev,checks:ok,checks_passed:true}]))).toMatchObject({message:'decided',code:'P0001'});
  await q(`select public.finish_candidates($1,$2,'done')`,[y.ext,y.b]);
  expect(await fails(q(`select public.finish_candidates($1,$2,'done')`,[y.ext,y.b]))).toMatchObject({message:'lease_lost'});
  expect(await one(`select public.request_candidates_regen($1::jsonb,$2) v`,[JSON.stringify({document_id:y.doc}),actor])).toBe(1);
  expect((await fails(q(`select public.request_candidates_regen('{"bogus":1}'::jsonb,$1)`,[actor]))).message).toMatch(/^invalid_input: filter/);
  expect(await claimCand(y.ext,b2)).toBe(true);
  expect(await insertCands(y.ext,b2,[candRow(y.cits,{extractor_ref:'hk-facts/2/hk-facts/1.0'})])).toEqual({inserted:1});
  const regen=(await candidateIds(y.ext)).find(r=>r.extractor_ref==='hk-facts/2/hk-facts/1.0')!.candidate_id;
  expect(await writeChecks(y.ext,b2,[{candidate_id:regen,checks:ok,checks_passed:true}])).toEqual({written:1,inherited:1});
  expect((await q(`select status,decision_kind,decided_by,inherited_from,decided_at is not null d from public.extraction_candidates where candidate_id=$1`,[regen]))[0]).toEqual({status:'confirmed',decision_kind:'human',decided_by:actor,inherited_from:rev,d:true});
  // attempts: the claim after the third crash closes the version as exhausted
  const expire=()=>q(`update public.document_extractions set candidates_lease_until=now()-interval '1 second' where extraction_id=$1`,[y.ext]);
  await expire();expect(await claimCand(y.ext,y.b)).toBe(true);
  await expire();expect(await claimCand(y.ext,b2)).toBe(true);
  expect(await one(`select candidates_attempts v from public.document_extractions where extraction_id=$1`,[y.ext])).toBe(3);
  await expire();
  expect(((await one(`select public.extractions_candidates_due(1000) v`)) as {extraction_id:string}[]).some(r=>r.extraction_id===y.ext)).toBe(true);
  expect(await claimCand(y.ext,y.b)).toBe(false);
  expect((await q(`select candidates_status,candidates_lease_batch_id from public.document_extractions where extraction_id=$1`,[y.ext]))[0]).toEqual({candidates_status:'exhausted',candidates_lease_batch_id:null});
  expect(((await one(`select public.extractions_candidates_due(1000) v`)) as {extraction_id:string}[]).some(r=>r.extraction_id===y.ext)).toBe(false);
 });

 it('decide_candidate and stage_candidate_publication: human and auto rules, the publication state machine, and a committed reversion on a revoked approval',async()=>{
  const y=await candidateReady();const actor=await user();
  const keys=['a','b','c','d'];
  await insertCands(y.ext,y.b,keys.map(k=>candRow(y.cits,{natural_key:`${k}::2025-12-31:12M:HKD`,fingerprint:sha(`fp-${k}`),payload:{concept:k==='d'?'gross_profit':'revenue'}})));
  const ids=Object.fromEntries((await candidateIds(y.ext)).map(r=>[r.natural_key.slice(0,1),r.candidate_id as string]));
  const ok=[{check:'citation_verified',blocking:true,passed:true}];
  await writeChecks(y.ext,y.b,['a','b','d'].map(k=>({candidate_id:ids[k],checks:ok,checks_passed:true})));
  expect(await fails(decide(ids.c,{kind:'human',decided_by:actor,status:'confirmed'}))).toMatchObject({message:'not_eligible',code:'P0001'});
  expect(await decide(ids.c,{kind:'human',decided_by:actor,status:'rejected'})).toEqual({status:'rejected'});
  expect(await fails(decide(ids.c,{kind:'human',decided_by:actor,status:'confirmed'}))).toMatchObject({message:'decided'});
  expect((await fails(decide(ids.c,{kind:'human',status:'confirmed'}))).message).toMatch(/^invalid_input/);
  const A=await approval()(actor);const B=await approval({gold_sha256:sha('gold-b')})(actor);const wrong=await approval({table_algo_version:'tables/0.9'})(actor);
  expect(await fails(decide(ids.a,{kind:'auto',approval_id:wrong}))).toMatchObject({message:'not_eligible'});
  expect(await fails(decide(ids.d,{kind:'auto',approval_id:A}))).toMatchObject({message:'not_eligible'});          // concept outside the approval
  expect(await fails(decide(ids.a,{kind:'auto',approval_id:randomUUID()}))).toMatchObject({message:'not_eligible'});
  expect(await decide(ids.a,{kind:'auto',approval_id:A})).toEqual({status:'confirmed'});
  expect(await decide(ids.a,{kind:'auto',approval_id:A})).toEqual({status:'confirmed'});
  expect(await decide(ids.b,{kind:'auto',approval_id:B})).toEqual({status:'confirmed'});
  expect(await fails(stagePub(ids.c,1))).toMatchObject({message:'not_eligible'});
  const run=randomUUID();
  expect(await stagePub(ids.a,1,run)).toEqual({outcome:'staged'});
  expect(await fails(stagePub(ids.a,1))).toMatchObject({message:'already_staged',code:'P0001'});
  expect(await fails(decide(ids.a,{kind:'human',decided_by:actor,status:'candidate'}))).toMatchObject({message:'not_eligible'});
  await q(`update public.candidate_publications set state='abandoned' where candidate_id=$1`,[ids.a]);   // migration two's abandon_candidate_publications does this
  const run2=randomUUID(),fact2=randomUUID();
  expect(await stagePub(ids.a,1,run2,fact2)).toEqual({outcome:'staged'});
  expect((await q(`select run_id,fact_id,state,updated_at>created_at moved from public.candidate_publications where candidate_id=$1`,[ids.a]))[0]).toEqual({run_id:run2,fact_id:fact2,state:'staged',moved:true});
  await q(`update public.extraction_approvals set revoked_at=now() where approval_id=$1`,[B]);
  expect(await stagePub(ids.b,1)).toEqual({outcome:'approval_revoked'});                                  // answered, not raised …
  expect((await q(`select status,decision_kind,approval_id,decided_at from public.extraction_candidates where candidate_id=$1`,[ids.b]))[0]).toEqual({status:'candidate',decision_kind:null,approval_id:null,decided_at:null});   // … so the reversion is committed
  expect(Number(await one(`select count(*) v from public.candidate_publications where candidate_id=$1`,[ids.b]))).toBe(0);
  expect(await fails(decide(ids.b,{kind:'auto',approval_id:B}))).toMatchObject({message:'approval_revoked',code:'P0001'});
  const listed=await one(`select public.list_candidate_publications(null,null,$1,1,'staged',null,10) v`,[y.iss]);
  expect(listed.rows.map((r:{candidate_id:string})=>r.candidate_id)).toEqual([ids.a]);expect(listed.next_cursor).toBeNull();
  const page1=await one(`select public.list_candidates($1,null,null,null,2) v`,[y.ext]);
  expect(page1.rows).toHaveLength(2);expect(page1.next_cursor).toMatchObject({candidate_id:page1.rows[1].candidate_id});
  const page2=await one(`select public.list_candidates($1,null,null,$2::jsonb,2) v`,[y.ext,JSON.stringify(page1.next_cursor)]);
  expect(page2.rows).toHaveLength(2);expect(page2.next_cursor).toBeNull();
  expect(new Set([...page1.rows,...page2.rows].map((r:{candidate_id:string})=>r.candidate_id))).toEqual(new Set(Object.values(ids)));
  expect((await fails(q(`select public.list_candidates(null,null,null,null,10)`))).message).toMatch(/^invalid_input: where/);
 });

 it('read_documents: as-of version selection, every version on request, window filters, keyset cursor envelope, limit bounds',async()=>{
  const {iss,b}=await ready();const ref=`${Date.now()}_c`;
  const v1=(await insertDoc(iss,b,docJson({source_ref:ref,available_at:'2026-01-10T01:00:00.123456Z',available_date:'2026-01-10'}))).document_id;
  const v2=(await insertDoc(iss,b,docJson({source_ref:ref,available_at:'2026-03-10T01:00:00Z',available_date:'2026-03-10'}))).document_id;
  const r2=(await insertDoc(iss,b,docJson({doc_class:'interim_report',available_at:'2026-02-01T01:00:00Z',available_date:'2026-02-01'}))).document_id;
  const read=(asOf:string,o:{source?:string|null;cls?:string|null;from?:string|null;to?:string|null;cursor?:unknown;limit?:number;all?:boolean}={},c:Pool|PoolClient=admin)=>
   c.query(`select public.read_documents($1,$2::date,$3,$4,$5::date,$6::date,$7::jsonb,$8,$9) v`,[iss,asOf,o.source??null,o.cls??null,o.from??null,o.to??null,o.cursor===undefined?null:JSON.stringify(o.cursor),o.limit??10,o.all??false]).then(r=>r.rows[0].v);
  const ids=(env:{rows:{document_id:string}[]})=>env.rows.map(r=>r.document_id);
  expect(ids(await read('2026-02-15'))).toEqual([r2,v1]);
  expect(ids(await read('2026-04-01'))).toEqual([v2,r2]);
  expect(ids(await read('2026-04-01',{all:true}))).toEqual([v2,r2,v1]);
  expect(ids(await read('2026-04-01',{cls:'interim_report'}))).toEqual([r2]);
  expect(ids(await read('2026-04-01',{from:'2026-03-01',to:'2026-03-31'}))).toEqual([v2]);
  expect(ids(await read('2026-04-01',{source:'cninfo'}))).toEqual([]);
  const p1=await read('2026-04-01',{all:true,limit:2});
  expect(p1).toMatchObject({row_count:2,next_cursor:{document_id:r2}});
  expect(p1.next_cursor.available_at).toBe(p1.rows[1].available_at);
  const p2=await read('2026-04-01',{all:true,limit:2,cursor:p1.next_cursor});
  expect(p2).toMatchObject({row_count:1,next_cursor:null});expect(ids(p2)).toEqual([v1]);
  expect(new Date(p2.rows[0].available_at).toISOString()).toBe('2026-01-10T01:00:00.123Z');
  expect(p2.rows[0].available_at).toMatch(/:00\.123456[+-]/);                                              // microseconds survive the envelope (server time zone offset)
  expect(p2.rows[0]).not.toHaveProperty('rn');
  expect((await fails(read('2026-04-01',{limit:1001}))).message).toMatch(/^invalid_input: limit/);
  expect((await fails(read('2026-04-01',{limit:0}))).message).toMatch(/^invalid_input: limit/);
  expect((await fails(read('2026-04-01',{cursor:{available_at:'2026-01-01'}}))).message).toMatch(/^invalid_input: cursor/);
 });

 it('roles: anon and authenticated see public rows only — tables, the view and read_documents — never candidates, scope, approvals or unpublished citations, and cannot call write functions; service_role reads everything but writes approvals only',async()=>{
  const pub=await extracted();
  const internal=await cite(pub.doc,pub.ext,'收益');const published=await cite(pub.doc,pub.ext,'毛利','human');
  await q(`select public.publish_citations($1::uuid[])`,[[published]]);
  const owner=await user();const b=await batch();
  const lic=(await one(`select public.insert_upload_document($1,$2::jsonb) v`,[owner,JSON.stringify(docJson({source_url:null,market:'HK',permission:'licensed',owner_user_id:owner,issuer_id:pub.iss,license_ref:'lic',batch_id:b}))])).document_id;
  expect(await claimExtract(lic,b)).toBe(true);
  const licExt=await finish(lic,b,extJson(1),[pageJson(1,TEXT)]);
  const licCit=await cite(lic,licExt,'收益','human');
  const A=await approval()(owner);
  expect(await claimCand(pub.ext,pub.b)).toBe(true);
  await insertCands(pub.ext,pub.b,[candRow({value:internal,label:internal,unit:internal,period:internal})]);
  for(const role of ['anon','authenticated'] as const){
   await asRole(admin,role,async c=>{
    const ids=async(sql:string,v:unknown[])=>(await c.query(sql,v)).rows.map(r=>Object.values(r)[0]);
    expect(await ids(`select document_id from public.disclosure_documents where document_id=any($1::uuid[]) order by 1`,[[pub.doc,lic]])).toEqual([pub.doc]);
    expect(await ids(`select document_id from public.disclosure_documents_public where document_id=any($1::uuid[])`,[[pub.doc,lic]])).toEqual([pub.doc]);
    expect((await c.query(`select * from public.disclosure_documents_public where document_id=$1`,[pub.doc])).rows[0]).not.toHaveProperty('owner_user_id');
    expect(await ids(`select extraction_id from public.document_extractions where extraction_id=any($1::uuid[])`,[[pub.ext,licExt]])).toEqual([pub.ext]);
    expect(await ids(`select page_no from public.document_pages where extraction_id=$1`,[licExt])).toEqual([]);
    expect((await ids(`select page_no from public.document_pages where extraction_id=$1 order by 1`,[pub.ext]))).toEqual([1,2]);
    expect(await ids(`select citation_id from public.document_citations where citation_id=any($1::uuid[])`,[[internal,published,licCit]])).toEqual([published]);
    const env=(await c.query(`select public.read_documents($1,'2030-01-01',null,null,null,null,null,100,true) v`,[pub.iss])).rows[0].v;
    expect(env.rows.map((r:{document_id:string})=>r.document_id)).toEqual([pub.doc]);
    for(const t of SERVICE_TABLES)expect({t,r:await tryAs(c,`select 1 from public.${t} limit 1`)}).toMatchObject({t,r:{ok:false,code:'42501'}});
    expect(await tryAs(c,`select public.insert_citation('{}'::jsonb)`)).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`select public.claim_document_sync_lease($1,'hkexnews',$2,60)`,[pub.iss,b])).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`select public.decide_candidate($1,'{}'::jsonb)`,[randomUUID()])).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`select public.documents_stored_due(10)`)).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`insert into public.document_citations(citation_id,document_id,extraction_id,page_no,char_start,char_end,snippet,text_hash,created_by,created_ref) values($1,$2,$3,1,0,1,'x',$4,'human','x')`,[randomUUID(),pub.doc,pub.ext,sha(TEXT)])).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`update public.disclosure_documents set title='x' where document_id=$1`,[pub.doc])).toMatchObject({ok:false,code:'42501'});
   });
  }
  await asRole(admin,'service_role',async c=>{
   expect((await c.query(`select count(*)::int n from public.disclosure_documents where document_id=any($1::uuid[])`,[[pub.doc,lic]])).rows[0].n).toBe(2);
   expect((await c.query(`select count(*)::int n from public.document_citations where citation_id=any($1::uuid[])`,[[internal,published,licCit]])).rows[0].n).toBe(3);
   expect((await c.query(`select count(*)::int n from public.extraction_candidates where extraction_id=$1`,[pub.ext])).rows[0].n).toBe(1);
   expect((await c.query(`select count(*)::int n from public.document_sync_scope where issuer_id=$1`,[pub.iss])).rows[0].n).toBe(1);
   for(const [sql,v] of [
    [`insert into public.disclosure_documents select * from public.disclosure_documents where document_id=$1`,[pub.doc]],
    [`update public.disclosure_documents set status='stored' where document_id=$1`,[pub.doc]],
    [`delete from public.disclosure_documents where document_id=$1`,[pub.doc]],
    [`update public.document_citations set visibility='public' where citation_id=$1`,[internal]],
    [`delete from public.document_pages where extraction_id=$1`,[pub.ext]],
    [`update public.extraction_candidates set status='rejected' where extraction_id=$1`,[pub.ext]],
    [`insert into public.candidate_publications(candidate_id,pub_gen,run_id,fact_id,state) select candidate_id,1,gen_random_uuid(),gen_random_uuid(),'staged' from public.extraction_candidates where extraction_id=$1`,[pub.ext]],
    [`update public.document_sync_scope set priority=99 where issuer_id=$1`,[pub.iss]],
    [`update public.extraction_approvals set concepts='{x}' where approval_id=$1`,[A]],
    [`delete from public.extraction_approvals where approval_id=$1`,[A]],
   ] as [string,unknown[]][])expect({sql,r:await tryAs(c,sql,v)}).toMatchObject({sql,r:{ok:false,code:'42501'}});
   expect(await tryAs(c,`update public.extraction_approvals set revoked_at=now() where approval_id=$1`,[A])).toMatchObject({ok:true});
   expect(await tryAs(c,`insert into public.extraction_approvals(extractor_ref,extractor_version,table_algo_version,code_version,concepts,gold_sha256,precision,recall,report_path,approved_by) values('r','v','t','c','{revenue}',$1,0.99,0.99,'p',$2)`,[sha('g2'),owner])).toMatchObject({ok:true});
   expect(await tryAs(c,`select public.documents_stored_due(5)`)).toMatchObject({ok:true});
  });
 });

 // F3 review fixes (Task 1 review round): one regression test per finding.
 it('review fix: auto decision needs explicit concept membership (missing concept, NULL in approval concepts)',async()=>{
  const y=await candidateReady();const actor=await user();
  await insertCands(y.ext,y.b,[candRow(y.cits,{natural_key:'n1',fingerprint:sha('n1'),payload:{}}),
   candRow(y.cits,{natural_key:'n2',fingerprint:sha('n2'),payload:{concept:'gross_profit'}}),candRow(y.cits,{natural_key:'n3',fingerprint:sha('n3'),payload:{concept:'revenue'}})]);
  const ids=Object.fromEntries((await candidateIds(y.ext)).map(r=>[r.natural_key,r.candidate_id as string]));
  const ok=[{check:'citation_verified',blocking:true,passed:true}];
  await writeChecks(y.ext,y.b,['n1','n2','n3'].map(k=>({candidate_id:ids[k],checks:ok,checks_passed:true})));
  const A=await approval()(actor);const N=await approval({concepts:['revenue',null],gold_sha256:sha('gold-null')})(actor);
  expect(await fails(decide(ids.n1,{kind:'auto',approval_id:A}))).toMatchObject({message:'not_eligible'});   // payload without concept
  expect(await fails(decide(ids.n2,{kind:'auto',approval_id:N}))).toMatchObject({message:'not_eligible'});   // NULL in the approval's concepts must not admit anything
  expect(await fails(decide(ids.n3,{kind:'auto',approval_id:N}))).toMatchObject({message:'not_eligible'});   // … and an approval containing NULL is unusable
  expect(await decide(ids.n3,{kind:'auto',approval_id:A})).toEqual({status:'confirmed'});
  expect((await q(`select status from public.extraction_candidates where candidate_id=any($1::uuid[]) order by natural_key`,[[ids.n1,ids.n2]])).map(r=>r.status)).toEqual(['candidate','candidate']);
 });

 it('review fix: every citations.period element must be an object with a valid citation id',async()=>{
  const y=await candidateReady();
  for(const bad of [[null],[123],['not-a-citation'],[{role:'statement_title',citation_id:y.cits.period},null],[{role:'statement_title'}]]){
   const row=candRow(y.cits);row.citations.period=bad as never;
   expect({bad,r:await fails(insertCands(y.ext,y.b,[row]))}).toMatchObject({r:{message:'invalid_citation: reference',code:'22023'}});
  }
  expect(Number(await one(`select count(*) v from public.extraction_candidates where extraction_id=$1`,[y.ext]))).toBe(0);
  expect(await insertCands(y.ext,y.b,[candRow(y.cits)])).toEqual({inserted:1});
 });

 it('review fix: a backfill cursor cannot be cleared without reset unless it completes the backfill (clear-then-regress)',async()=>{
  const {iss,b}=await ready();
  const cur=(seq:number)=>JSON.stringify({segment:'2024',last_ref:`r${seq}`,settled:[],attempts:{},seq});
  const adv=(c:string|null,done:boolean,reset=false)=>q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill',$3::jsonb,$4,$5)`,[iss,b,c,done,reset]);
  await adv(cur(2),false);
  expect(await fails(adv(null,false))).toMatchObject({message:'cursor_regression',code:'P0001'});
  expect(await fails(adv(cur(1),false))).toMatchObject({message:'cursor_regression',code:'P0001'});
  const row=async()=>(await q(`select backfill_cursor,backfill_done from public.document_sync_scope where issuer_id=$1`,[iss]))[0];
  expect(await row()).toEqual({backfill_cursor:JSON.parse(cur(2)),backfill_done:false});   // the original checkpoint survived both refusals
  await adv(null,true);                                                                     // clearing is allowed when it completes the backfill
  expect(await row()).toEqual({backfill_cursor:{},backfill_done:true});
 });

 it('review fix: ec_decision_shape is NULL-safe (decided state with NULL decision_kind is refused)',async()=>{
  const x=await extracted();const b=await batch();const owner=await user();const cit=await cite(x.doc,x.ext,'收益');
  const ins=(status:string,kind:string|null)=>q(`insert into public.extraction_candidates(candidate_id,document_id,extraction_id,kind,extractor_kind,extractor_ref,natural_key,citations,payload,fingerprint,input_snapshot,batch_id,status,decision_kind,decided_by,decided_at)
   values($1,$2,$3,'financial_fact','rule','r',$4,$5,'{}',$6,'{}',$7,$8,$9,$10,'2026-01-01Z')`,[randomUUID(),x.doc,x.ext,`k-${randomUUID()}`,JSON.stringify({value:cit}),sha('f'),b,status,kind,owner]);
  for(const status of ['confirmed','rejected','promoted'])await expect(ins(status,null)).rejects.toThrow(/ec_decision_shape/);
  await ins('confirmed','human');
 });

 it('review fix: renew_document_extract_lease and renew_candidates_lease are holder-only and never acquire',async()=>{
  const renewDoc=(doc:string,b:string|null,ttl=600)=>one(`select public.renew_document_extract_lease($1,$2,$3) v`,[doc,b,ttl]);
  const renewCand=(ext:string,b:string|null,ttl=600)=>one(`select public.renew_candidates_lease($1,$2,$3) v`,[ext,b,ttl]);
  // extract lease
  const s=await storedDoc();const other=await batch();
  expect(await renewDoc(s.doc,s.b)).toBe(false);expect(await renewDoc(s.doc,null)).toBe(false);   // unowned: cannot be acquired by renewing
  expect((await q(`select extract_lease_batch_id,extract_lease_until,extract_attempts from public.disclosure_documents where document_id=$1`,[s.doc]))[0]).toEqual({extract_lease_batch_id:null,extract_lease_until:null,extract_attempts:0});
  expect(await claimExtract(s.doc,s.b,60)).toBe(true);
  const until=async()=>new Date(await one(`select extract_lease_until v from public.disclosure_documents where document_id=$1`,[s.doc])).getTime();
  const u1=await until();
  expect(await renewDoc(s.doc,s.b,3600)).toBe(true);
  expect(await until()).toBeGreaterThan(u1);
  expect(await one(`select extract_attempts v from public.disclosure_documents where document_id=$1`,[s.doc])).toBe(1);   // no attempt counted
  expect(await renewDoc(s.doc,other)).toBe(false);expect(await renewDoc(s.doc,null)).toBe(false);
  expect(await one(`select extract_lease_batch_id v from public.disclosure_documents where document_id=$1`,[s.doc])).toBe(s.b);
  await finish(s.doc,s.b,extJson(1),[pageJson(1,TEXT)]);                                       // terminal for the lease: status extracted, lease cleared
  expect(await renewDoc(s.doc,s.b)).toBe(false);
  // candidates lease
  const y=await candidateReady();const other2=await batch();
  const cu=async()=>new Date(await one(`select candidates_lease_until v from public.document_extractions where extraction_id=$1`,[y.ext])).getTime();
  const c1=await cu();
  expect(await renewCand(y.ext,y.b,3600)).toBe(true);expect(await cu()).toBeGreaterThan(c1);
  expect(await one(`select candidates_attempts v from public.document_extractions where extraction_id=$1`,[y.ext])).toBe(1);
  expect(await renewCand(y.ext,other2)).toBe(false);expect(await renewCand(y.ext,null)).toBe(false);
  await q(`select public.finish_candidates($1,$2,'done')`,[y.ext,y.b]);
  expect(await renewCand(y.ext,y.b)).toBe(false);                                              // released / terminal
  const z=await extracted();                                                                    // pending, never claimed
  expect(await renewCand(z.ext,z.b)).toBe(false);expect(await renewCand(z.ext,null)).toBe(false);
  expect((await q(`select candidates_lease_batch_id,candidates_lease_until,candidates_attempts from public.document_extractions where extraction_id=$1`,[z.ext]))[0]).toEqual({candidates_lease_batch_id:null,candidates_lease_until:null,candidates_attempts:0});
 });

 it('review fix: reconcile_document_sync_scope rejects duplicate issuer ids; lock modes (approval share locks, no-key-update on documents)',async()=>{
  const iss=await issuer();
  const rows=[{issuer_id:iss,reasons:['a'],priority:1,fetch_key:'1'},{issuer_id:iss,reasons:['b'],priority:2,fetch_key:'2'}];
  expect(await fails(one(`select public.reconcile_document_sync_scope('hkexnews',$1::jsonb) v`,[JSON.stringify(rows)]))).toMatchObject({message:'invalid_input: duplicate issuer',code:'22023'});
  expect(Number(await one(`select count(*) v from public.document_sync_scope where issuer_id=$1`,[iss]))).toBe(0);
  const def=async(fn:string)=>String(await one(`select pg_get_functiondef(p.oid) v from pg_proc p where p.proname=$1 and p.pronamespace='public'::regnamespace`,[fn]));
  for(const fn of ['decide_candidate','stage_candidate_publication'])expect(await def(fn)).toMatch(/extraction_approvals[^;]*for share/i);
  expect(await def('write_candidate_checks')).toMatch(/for share of s/i);
  for(const fn of ['doc_extract_lock','claim_document_extract_lease','renew_document_extract_lease','reclassify_document','request_document_extract']){
   const d=await def(fn);expect(d).toMatch(/for no key update/i);expect(d).not.toMatch(/disclosure_documents where document_id = p_document for update/i);
  }
 });
});
