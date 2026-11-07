// src/lib/documents/fact-citations.integration.test.ts
// F3 migration two on real PostgreSQL (spec §4.8, §4.9, §4.12, §11.2 second paragraph): the
// additive extension of the spec-2 check constraints (landed names, HK rows through the spec-2
// functions, financial_metrics untouched), fact_citations / filing_documents (cascades, guards,
// privileges, RLS), the fact-linked document_citations policy, publish_hk_run's lock order and
// SQL-level guards, ensure_hk_fact_scope, resolve_hk_facts_quarantine atomicity, the spec-2
// functions and triggers left byte-for-byte unchanged, and the pgHkFactsPort contract. Rows are
// never cleaned up (append-only by design; test:db creates a fresh database); every case uses
// its own issuer.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {quarantine} from '../dq/quarantine';
import {freshMigratedDatabase,replayFiles} from './fresh-db';
import {HK_PUB_GEN} from './types';
import {pgDocumentsDb} from './pg-documents-db';
import {pgHkFactsPort} from './hk-facts/pg-facts-port';
import {code,hkCite,hkExtraction,hkFactsPortContract,hkFilingRow,hkStagedRun,hkWorld,sha256,stateRev} from './hk-facts/facts-port-contract';
import type {HkPortHarness} from './hk-facts/facts-port-contract';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION_TWO='supabase/migrations/20261108091000_fact_citations.sql';
const SPEC2_MIGRATION='supabase/migrations/20261106090000_financial_facts.sql';
const SPEC2_TABLES=['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'];
const SPEC2_FUNCTIONS=['financial_facts_lifecycle','filings_limited_update','fact_scope_lock','fact_run_lock','fact_abandon_run','fact_item_members','fact_promote_rows','reconcile_fact_sync_scope','claim_fact_sync_lease','begin_sync_run','stage_filings','stage_facts','quarantine_facts','publish_sync_run','abandon_sync_run','release_fact_sync_lease','promote_quarantined','resolve_facts_quarantine','replace_financial_metrics','fact_state_rev','read_facts'];
const F3_RPC=['public.bind_filing_documents(uuid,jsonb)','public.insert_fact_citations(uuid,jsonb)','public.publish_hk_run(uuid,uuid,uuid,uuid[],bigint,jsonb)','public.finish_candidate_publications(uuid)','public.abandon_candidate_publications(uuid)','public.ensure_hk_fact_scope(uuid,text)','public.renew_hk_fact_lease(uuid,uuid,int)','public.resolve_hk_facts_quarantine(uuid,uuid[],uuid)','public.hk_promotion_due(int,text,int)','public.hk_zero_output_documents(uuid,int)'];
const F3_INTERNAL=['public.assert_run_evidence_complete(uuid)','public.fact_citations_guard()','public.filing_documents_guard()'];

/** Runs body inside one transaction on its own connection (pid known); rolls back unless committed. */
interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
 const c=await pool.connect();let open=false;let broken:Error|undefined;
 try{
  await c.query('begin');open=true;
  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
 }finally{
  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
  c.release(broken);
 }
}
/** Polls (20 ms, <= 3 s) until some backend waits on `pid`, then asserts p is still pending. */
async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
 let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
 for(const deadline=Date.now()+3000;;){
  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
  if(n>=1)break;
  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
  await new Promise(r=>setTimeout(r,20));
 }
 expect(settled).toBe(false);
}
type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);

interface PgHkHarness extends HkPortHarness{pool:Pool;close():Promise<void>}
async function pgHkHarness():Promise<PgHkHarness>{
 const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
 const pool=new Pool({connectionString:state.adminUrl,statement_timeout:8000});   // a regression that blocks fails cleanly instead of hanging afterAll
 return {
  pool,port:pgHkFactsPort(pool),docs:pgDocumentsDb(pool),tables:pgTableClient(pool),
  issuer:async()=>{const id=randomUUID();await pool.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ HK Port Test')`,[id]);return id;},
  batch:async()=>{const id=randomUUID();await pool.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'documents-candidates','documents.candidates')`,[id]);return id;},
  user:async()=>{const id=randomUUID();await pool.query(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@example.invalid`]);return id;},
  expireHkLease:async iss=>{await pool.query(`update public.fact_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1 and market='HK'`,[iss]);},
  close:async()=>{await pool.end();},
 };
}

describe.skipIf(!enabled)('F3 migration two (fact_citations, filing_documents, HK functions) on real PostgreSQL',()=>{
 let admin:Pool;let adminUrl='';let h:PgHkHarness;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const count=async(text:string,values:unknown[]=[])=>Number(await one(text,values));
 /** Runs one statement as `role` inside a rolled-back transaction. */
 const asRole=async(role:'anon'|'authenticated'|'service_role',text:string,values:unknown[]=[])=>{
  const c=await admin.connect();
  try{await c.query('begin');await c.query(`set local role ${role}`);return (await c.query(text,values)).rows as Record<string,any>[];}
  finally{await c.query('rollback').catch(()=>{});c.release();}
 };
 const checksOf=(table:string)=>q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid=('public.'||$1)::regclass and contype='c' order by conname`,[table]);
 /** Definitions of the spec-2 functions and triggers, read through `read` (the shared or a fresh database). */
 const spec2Defs=async(read:(text:string,values?:unknown[])=>Promise<Record<string,any>[]>=q)=>({
  functions:await read(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1) order by 1`,[SPEC2_FUNCTIONS]),
  triggers:await read(`select c.relname, t.tgname, md5(pg_get_triggerdef(t.oid)) h from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) and not t.tgisinternal order by 1,2`,[SPEC2_TABLES]),
 });

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  adminUrl=state.adminUrl;admin=new Pool({connectionString:adminUrl});
  h=await pgHkHarness();
 });
 afterAll(async()=>{await h?.close();await admin?.end();});

 it('extends exactly the landed market checks and filings.source/origin by name, one check per column; financial_metrics stays US/CN',async()=>{
  const only=async(table:string,pick:RegExp)=>(await checksOf(table)).filter(r=>pick.test(String(r.def)));
  const market=/\(market = ANY/;
  for(const t of ['fact_sync_runs','filings','financial_facts','fact_sync_scope']){
   const rows=await only(t,market);
   expect(rows.map(r=>r.conname)).toEqual([`${t}_market_check`]);
   expect(String(rows[0].def)).toMatch(/'US'::text, 'CN'::text, 'HK'::text/);
  }
  // F3 review (codex Task 13 F3): market-dependent, still one check per column — US/CN keep the original domains, HK must be hkex
  const src=await only('filings',/\bsource = /);
  expect(src.map(r=>r.conname)).toEqual(['filings_source_check']);
  expect(String(src[0].def)).toMatch(/market = 'HK'::text\) AND \(source = 'hkex'::text/);expect(String(src[0].def)).toMatch(/'edgar'::text, 'tushare'::text\]/);expect(String(src[0].def)).not.toMatch(/'tushare'::text, 'hkex'/);
  const origin=await only('filings',/\borigin = /);
  expect(origin.map(r=>r.conname)).toEqual(['filings_origin_check']);
  expect(String(origin[0].def)).toMatch(/market = 'HK'::text\) AND \(origin = 'hkex'::text/);expect(String(origin[0].def)).toMatch(/'sec'::text, 'sse'::text, 'szse'::text, 'bse'::text\]/);expect(String(origin[0].def)).not.toMatch(/'bse'::text, 'hkex'/);
  const metrics=await only('financial_metrics',market);
  expect(metrics.map(r=>r.conname)).toEqual(['financial_metrics_market_check']);expect(String(metrics[0].def)).not.toMatch(/HK/);
 });

 it('HK facts published through publish_hk_run read back through the unchanged spec-2 read_facts; financial_metrics refuses HK',async()=>{
  const w=await hkWorld(h);const r=await hkStagedRun(h,w);
  expect(await h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],await stateRev(h,w.iss),[])).toBe(2);
  const env=await one(`select public.read_facts($1,'HK',array['revenue'],'2030-01-01',null,null,true,null,false) v`,[w.iss]);
  expect(env.rows.map((x:Record<string,unknown>)=>[x.fact_id,x.market,x.value]).sort()).toEqual([[r.fact24.fact_id,'HK','1000000'],[r.fact25.fact_id,'HK','1234000']].sort());
  expect((await q(`select market,source,origin,mapping_gen from public.filings where filing_id=$1`,[r.filingId]))[0]).toEqual({market:'HK',source:'hkex',origin:'hkex',mapping_gen:1});
  const e=await fails(q(`select public.replace_financial_metrics($1,'HK',1,$2::jsonb)`,[w.iss,JSON.stringify([{metric:'gross_margin',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'0.4',unit:'pure',input_unit:'CNY',basis:'us_standard',formula_version:'t',inputs:[],as_of:'2026-03-20'}])]));
  expect(e.code).toBe('23514');expect(e.message).toMatch(/financial_metrics_market_check/);
 });

 it('F3: filings source/origin are market-aware through the unchanged stage_filings — US/CN keep their domains, HK must be hkex',async()=>{
  const us=await h.issuer();const ub=await h.batch();const hk=await h.issuer();const hb=await h.batch();
  await q(`select public.reconcile_fact_sync_scope('US',$1::jsonb)`,[JSON.stringify([{issuer_id:us,reasons:['t'],priority:1,fetch_key:'0000000002'}])]);
  expect(await one(`select public.claim_fact_sync_lease($1,'US',$2,600) v`,[us,ub])).toBe(true);
  const urun=await one(`select public.begin_sync_run($1,'US',$2,1) v`,[us,ub]);
  await q(`select public.ensure_hk_fact_scope($1,'00268')`,[hk]);
  expect(await one(`select public.claim_fact_sync_lease($1,'HK',$2,600) v`,[hk,hb])).toBe(true);
  const hrun=await one(`select public.begin_sync_run($1,'HK',$2,1) v`,[hk,hb]);
  const stage=(run:string,source:string,origin:string,form:string)=>q(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:randomUUID(),source,origin,form_type:form,fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',available_date:'2026-03-20',source_ref:randomUUID(),url:null}])]);
  for(const [run,source,origin,form,check] of [[urun,'hkex','sec','10-K','filings_source_check'],[urun,'edgar','hkex','10-K','filings_origin_check'],[urun,'hkex','hkex','10-K','filings_(source|origin)_check'],
   [hrun,'edgar','hkex','annual','filings_source_check'],[hrun,'hkex','sec','annual','filings_origin_check'],[hrun,'tushare','sse','annual','filings_(source|origin)_check']] as const){
   const e=await fails(stage(run,source,origin,form));
   expect({run:run===urun?'US':'HK',source,origin,code:e.code,check:new RegExp(check).test(e.message)}).toEqual({run:run===urun?'US':'HK',source,origin,code:'23514',check:true});
  }
  await expect(stage(urun,'edgar','sec','10-K')).resolves.toBeDefined();                    // the original US domain still works
  await expect(stage(hrun,'hkex','hkex','annual')).resolves.toBeDefined();
 });

 // KNOWN RESIDUAL RISK, out of contract. spec-2's publish_sync_run is landed and not ours to change; service_role
 // keeps EXECUTE on it and it knows nothing of HK evidence, so an HK run CAN be published through it with no
 // citations and no revision guard. F3 code never does (publish-boundary.test.ts pins that statically) and
 // publish_hk_run is the only supported path. Interface request to spec-2: market-aware authorization on
 // publish_sync_run (HK runs only via the F3 function). Recorded in the PR as an accepted residual risk. The
 // assertions below document the present behaviour; they are not a success path anyone may rely on and must be
 // inverted when spec-2 closes the gap.
 it('RESIDUAL RISK (interface request to spec-2): publish_sync_run does not itself refuse an HK run — it publishes it without any evidence',async()=>{
  const iss=await h.issuer();const b=await h.batch();
  await q(`select public.ensure_hk_fact_scope($1,'00268')`,[iss]);
  expect(await one(`select public.claim_fact_sync_lease($1,'HK',$2,600) v`,[iss,b])).toBe(true);
  const run=await one(`select public.begin_sync_run($1,'HK',$2,1) v`,[iss,b]);
  const fid=randomUUID();const sref=`hkex:${randomUUID()}_c:v1`;
  await q(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:fid,source:'hkex',origin:'hkex',form_type:'annual',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',available_date:'2026-03-20',source_ref:sref,url:null}])]);
  const fact=randomUUID();
  await q(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify([{fact_id:fact,filing_id:fid,concept:'revenue',source_concept:'收益',statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'1',unit:'CNY',consolidation:'consolidated',available_date:'2026-03-20',mapping_version:'hk-facts/1/hk-facts/1.0',raw_hash:'hkex:x'}])]);
  await q(`select public.publish_sync_run($1,$2::uuid[],null)`,[run,[fid]]);
  expect(await count(`select count(*) v from public.fact_citations where fact_id=$1`,[fact])).toBe(0);   // published with zero evidence: exactly what publish_hk_run exists to prevent
 });

 it('creates the two tables with RLS, select-only grants and guarded triggers; function privileges; replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) order by 1`,[['fact_citations','filing_documents']]);
  expect(rows).toEqual([{relname:'fact_citations',relrowsecurity:true},{relname:'filing_documents',relrowsecurity:true}]);
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const t of ['fact_citations','filing_documents'])for(const role of ['anon','authenticated','service_role']){
   expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
   for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({t,role,p,ok:await priv(role,t,p)}).toEqual({t,role,p,ok:false});
  }
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const sig of F3_RPC){
   for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
   expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
  }
  for(const sig of F3_INTERNAL)for(const role of ['anon','authenticated','service_role'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
  // P2-3: every function migration two defines is listed (enumerated from pg_proc by the names in the file)
  const names=[...new Set([...readFileSync(MIGRATION_TWO,'utf8').matchAll(/create or replace function public\.(\w+)\(/g)].map(m=>m[1]))];
  const defined=(await q(`select 'public.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1) order by 1`,[names]))
   .map(r=>String(r.sig).replace(/, /g,',').replace(/\binteger\b/g,'int'));
  expect(defined.sort()).toEqual([...F3_RPC,...F3_INTERNAL].sort());
  expect((await q(`select policyname from pg_policies where schemaname='public' and tablename='document_citations' order by 1`)).map(r=>r.policyname)).toEqual(['document_citations public read','document_citations service read']);
  // P2-2: replays run in a dedicated temporary database, never in the shared one
  const fresh=await freshMigratedDatabase(adminUrl);
  try{
   await expect(replayFiles(fresh.pool,[MIGRATION_TWO,MIGRATION_TWO])).resolves.toBeUndefined();
   expect((await fresh.pool.query(`select policyname from pg_policies where schemaname='public' and tablename='document_citations' order by 1`)).rows.map(r=>r.policyname)).toEqual(['document_citations public read','document_citations service read']);
  }finally{await fresh.drop();}
 },120000);

 it('spec-2 functions and triggers are unchanged: identical definitions before and after replaying the spec-2 migration and then migration two; migration two defines none of them',async()=>{
  const before=await spec2Defs();
  expect(before.functions.map(r=>String(r.sig).split('(')[0]).sort()).toEqual([...SPEC2_FUNCTIONS].sort());   // one overload each
  expect(before.triggers.map(r=>[r.relname,r.tgname])).toEqual([['filings','filings_limited_update'],['financial_facts','financial_facts_lifecycle']]);
  // P2-2: replaying the spec-2 migration drops 'HK' from its market checks until migration two runs
  // again — so this happens in a dedicated temporary database, never in the shared one
  const fresh=await freshMigratedDatabase(adminUrl);
  try{
   const read=async(text:string,values:unknown[]=[])=>(await fresh.pool.query(text,values)).rows as Record<string,any>[];
   expect(await spec2Defs(read)).toEqual(before);
   await replayFiles(fresh.pool,[SPEC2_MIGRATION]);
   const spec2=await spec2Defs(read);
   await replayFiles(fresh.pool,[MIGRATION_TWO]);
   const after=await spec2Defs(read);
   expect(spec2).toEqual(before);
   expect(after).toEqual(before);
  }finally{await fresh.drop();}
  const sql=readFileSync(MIGRATION_TWO,'utf8');
  for(const name of SPEC2_FUNCTIONS)expect({name,defined:new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,'i').test(sql)}).toEqual({name,defined:false});
  expect(/create\s+trigger[^;]*\son\s+public\.(fact_sync_runs|filings|financial_facts|financial_metrics|fact_sync_scope)\b/i.test(sql)).toBe(false);
 },120000);

 it('fact_citations and filing_documents are never updated nor deleted directly; abandoning a staged run cascades both; ok facts keep their evidence',async()=>{
  const w=await hkWorld(h);const r=await hkStagedRun(h,w);
  const ids=[r.fact25.fact_id,r.fact24.fact_id];
  expect(await count(`select count(*) v from public.fact_citations where fact_id=any($1::uuid[])`,[ids])).toBe(10);
  await expect(q(`update public.fact_citations set role='label' where fact_id=$1 and role='value'`,[r.fact25.fact_id])).rejects.toThrow(/append_only:/);
  await expect(q(`delete from public.fact_citations where fact_id=$1`,[r.fact25.fact_id])).rejects.toThrow(/append_only:/);
  await expect(q(`update public.filing_documents set created_at=now() where filing_id=$1`,[r.filingId])).rejects.toThrow(/append_only:/);
  await expect(q(`delete from public.filing_documents where filing_id=$1`,[r.filingId])).rejects.toThrow(/append_only:/);
  await h.port.beginRun(w.iss,r.batch,HK_PUB_GEN);                     // same lease: abandons r.run, deletes its staged facts, prunes the empty gen-0 filing
  expect(await count(`select count(*) v from public.fact_citations where fact_id=any($1::uuid[])`,[ids])).toBe(0);
  expect(await count(`select count(*) v from public.filing_documents where filing_id=$1`,[r.filingId])).toBe(0);
  expect(await count(`select count(*) v from public.filings where filing_id=$1`,[r.filingId])).toBe(0);
  const v=await hkWorld(h);const s=await hkStagedRun(h,v);
  expect(await h.port.publishHkRun(v.iss,s.batch,s.run,[s.filingId],await stateRev(h,v.iss),[])).toBe(2);
  await expect(q(`delete from public.financial_facts where fact_id=$1`,[s.fact25.fact_id])).rejects.toThrow(/append_only:/);
  expect(await count(`select count(*) v from public.fact_citations where fact_id=$1`,[s.fact25.fact_id])).toBe(5);
 });

 it('a private uploaded document can be neither bound to a filing nor cited as evidence',async()=>{
  const w=await hkWorld(h);const r=await hkStagedRun(h,w,{evidence:false});
  const content=sha256(`private:${randomUUID()}`);
  const up=await h.docs.insertUploadDocument(w.user,{issuer_id:w.iss,source:'upload',market:'other',source_ref:`${w.user}/${content}`,form_type:null,doc_class:'other',classifier_gen:1,title:'私人研報',language:null,source_url:null,
   content_sha256:content,bytes:10,mime:'application/pdf',storage_path:`blobs/${content}.pdf`,acquisition:{uploaded_at:'2026-11-06T00:00:00.000Z',filename:'r.pdf'},published_at:'2026-11-06T00:00:00.000Z',published_at_precision:'instant',
   available_at:'2026-11-06T00:00:00.000Z',available_date:'2026-11-06',fiscal_year:null,fiscal_period:null,period_end:null,filing_source_ref:null,permission:'private',owner_user_id:w.user,license_ref:null,batch_id:w.docBatch,code_version:'test'});
  const ext=await hkExtraction(h,up.document_id,w.docBatch,content);
  const cit=await hkCite(h,up.document_id,ext,'收益');
  const g=hkFilingRow(w,{sourceRef:`hkex:${w.user}/${content}:v1`});
  const gid=(await h.port.stageFilings(r.run,[g])).get(g.sourceRef)!;
  expect(await code(h.port.bindFilingDocuments(r.run,[{filing_id:gid,document_id:up.document_id}]))).toBe('invalid_input');
  expect(await code(h.port.insertFactCitations(r.run,[{fact_id:r.fact25.fact_id,citation_id:cit,role:'value'}]))).toBe('invalid_citation');
  expect(await count(`select count(*) v from public.fact_citations where citation_id=$1`,[cit])).toBe(0);
 });

 it('publish_hk_run: a null expected revision fails at the SQL boundary; the scope row is locked before the document rows',async()=>{
  const w=await hkWorld(h);const r=await hkStagedRun(h,w);const rev=await stateRev(h,w.iss);
  const e=await fails(q(`select public.publish_hk_run($1,$2,$3,$4::uuid[],null,'[]'::jsonb)`,[w.iss,r.batch,r.run,[r.filingId]]));
  expect(e.message).toBe('invalid_expected_rev');expect(e.code).toBe('22023');
  const z=await fails(q(`select public.publish_hk_run($1,$2,$3,$4::uuid[],$5,null)`,[w.iss,r.batch,r.run,[r.filingId],rev]));
  expect(z.message).toBe('invalid_input');expect(z.code).toBe('22023');
  await inTx(admin,async({c,pid,commit})=>{
   await c.query(`select 1 from public.disclosure_documents where document_id=$1 for update`,[w.docId]);
   const p=h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],rev,[{document_id:w.docId,extraction_id:w.extractionId}]);p.catch(()=>{});
   await stillBlockedBehind(admin,pid,p);                                          // publish waits on the document row …
   const nowait=await fails(admin.query(`select 1 from public.fact_sync_scope where issuer_id=$1 and market='HK' for update nowait`,[w.iss]));
   expect(nowait.code).toBe('55P03');                                               // … while already holding the scope row
   await commit();
   expect(await p).toBe(2);
  });
 });

 it('ensure_hk_fact_scope inserts once and never changes an existing row; a malformed key is refused',async()=>{
  const iss=await h.issuer();const b=await h.batch();
  await q(`select public.ensure_hk_fact_scope($1,'00268')`,[iss]);
  expect(await one(`select public.claim_fact_sync_lease($1,'HK',$2,600) v`,[iss,b])).toBe(true);
  const row=async()=>(await q(`select * from public.fact_sync_scope where issuer_id=$1 and market='HK'`,[iss]))[0];
  const before=await row();
  expect(before).toMatchObject({priority:0,fetch_key:'00268',reasons:['documents'],lease_batch_id:b});
  await q(`select public.ensure_hk_fact_scope($1,'99999')`,[iss]);
  expect(await row()).toEqual(before);
  const e=await fails(q(`select public.ensure_hk_fact_scope($1,'268')`,[iss]));
  expect(e.message).toBe('invalid_input');expect(e.code).toBe('22023');
 });

 it('resolve_hk_facts_quarantine: verdict, promotion and the done hook commit together; a US item is refused untouched',async()=>{
  const w=await hkWorld(h);const r=await hkStagedRun(h,w);
  const item=await quarantine(h.tables,{dataset:'facts.hk',table:'financial_facts',naturalKey:`${w.iss}:HK:revenue:2024-01-01:2024-12-31:consolidated:CNY:2026-03-20`,reasonCode:'identity_gp',batchId:r.batch,payload:{fact_ids:[],run_id:r.run}});
  await h.port.quarantineFacts(r.run,[r.fact24.fact_id],item);
  await h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],await stateRev(h,w.iss),[]);
  const state=async()=>(await q(`select q.status, q.detail->'hook' hook, f.status fact from public.dq_quarantine q, public.financial_facts f where q.id=$1 and f.fact_id=$2`,[item,r.fact24.fact_id]))[0];
  await inTx(admin,async({c})=>{                                                    // rolled back: nothing of it may survive
   const v=(await c.query(`select public.resolve_hk_facts_quarantine($1,'{}'::uuid[],$2) v`,[item,w.user])).rows[0].v;
   expect(v).toMatchObject({promoted:1,skipped:0});
   const inside=(await c.query(`select status, detail->'hook' hook from public.dq_quarantine where id=$1`,[item])).rows[0];
   expect(inside.status).toBe('resolved_accept');expect(inside.hook).toMatchObject({stage:'done',state:'done',message:'hk_no_metrics'});
  });
  expect(await state()).toEqual({status:'open',hook:null,fact:'quarantined'});
  expect(await h.port.resolveHkFactsQuarantine(item,[],w.user)).toMatchObject({promoted:1});
  expect(await state()).toMatchObject({status:'resolved_accept',hook:{stage:'done',state:'done',message:'hk_no_metrics'},fact:'ok'});
  // a US item
  const us=await h.issuer();const ub=await h.batch();
  await q(`select public.reconcile_fact_sync_scope('US',$1::jsonb)`,[JSON.stringify([{issuer_id:us,reasons:['t'],priority:1,fetch_key:'0000000001'}])]);
  expect(await one(`select public.claim_fact_sync_lease($1,'US',$2,600) v`,[us,ub])).toBe(true);
  const urun=await one(`select public.begin_sync_run($1,'US',$2,1) v`,[us,ub]);
  const ufil=randomUUID();const uref=randomUUID();
  await q(`select public.stage_filings($1,$2::jsonb)`,[urun,JSON.stringify([{filing_id:ufil,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',available_date:'2026-02-01',source_ref:uref,url:null}])]);
  const ufact=randomUUID();
  await q(`select public.stage_facts($1,$2::jsonb)`,[urun,JSON.stringify([{fact_id:ufact,filing_id:ufil,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'1',unit:'USD',consolidation:'consolidated',available_date:'2026-02-01',mapping_version:'facts-map/1',raw_hash:'h'}])]);
  const uitem=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${us}:US:revenue:x`,reasonCode:'identity_gp',batchId:ub,payload:{fact_ids:[],run_id:urun}});
  await q(`select public.quarantine_facts($1,$2::uuid[],$3)`,[urun,[ufact],uitem]);
  await q(`select public.publish_sync_run($1,$2::uuid[],null)`,[urun,[ufil]]);
  const e=await fails(q(`select public.resolve_hk_facts_quarantine($1,'{}'::uuid[],$2)`,[uitem,w.user]));
  expect(e.message).toBe('not_hk_item');
  expect((await q(`select status, detail from public.dq_quarantine where id=$1`,[uitem]))[0]).toEqual({status:'open',detail:{}});
 });

 it('document_citations follow their fact: anon/authenticated see a citation only once a fact citing it is ok; fact_citations and filing_documents likewise',async()=>{
  const w=await hkWorld(h);const r=await hkStagedRun(h,w);
  const loose=await hkCite(h,w.docId,w.extractionId,'附註');                       // never linked to a fact
  const item=await quarantine(h.tables,{dataset:'facts.hk',table:'financial_facts',naturalKey:`${w.iss}:HK:vis:${randomUUID()}`,reasonCode:'identity_gp',batchId:r.batch,payload:{fact_ids:[],run_id:r.run}});
  await h.port.quarantineFacts(r.run,[r.fact24.fact_id],item);
  const all=[w.cit.v25,w.cit.v24,w.cit.col24,w.cit.title,w.cit.label,w.cit.unit,w.cit.col25,loose];
  const seen=async(role:'anon'|'authenticated')=>({
   citations:(await asRole(role,`select citation_id::text id from public.document_citations where citation_id=any($1::uuid[])`,[all])).map(x=>String(x.id)).sort(),
   facts:(await asRole(role,`select distinct fact_id::text id from public.fact_citations where fact_id=any($1::uuid[])`,[[r.fact25.fact_id,r.fact24.fact_id]])).map(x=>String(x.id)).sort(),
   filings:(await asRole(role,`select filing_id::text id from public.filing_documents where filing_id=$1`,[r.filingId])).map(x=>String(x.id)),
  });
  for(const role of ['anon','authenticated'] as const)expect(await seen(role)).toEqual({citations:[],facts:[],filings:[]});
  await h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],await stateRev(h,w.iss),[]);       // fact25 ok, fact24 quarantined
  const okOnly=[w.cit.v25,w.cit.title,w.cit.label,w.cit.unit,w.cit.col25].sort();
  for(const role of ['anon','authenticated'] as const)expect(await seen(role)).toEqual({citations:okOnly,facts:[r.fact25.fact_id],filings:[r.filingId]});
  expect((await asRole('service_role',`select count(*)::int n from public.document_citations where citation_id=any($1::uuid[])`,[all]))[0].n).toBe(8);
 });

 it('roles: a service_role session cannot write the two tables; anon cannot call an F3 function',async()=>{
  await expect(asRole('service_role',`insert into public.fact_citations(fact_id,citation_id,role) values($1,$2,'value')`,[randomUUID(),randomUUID()])).rejects.toMatchObject({code:'42501'});
  await expect(asRole('service_role',`insert into public.filing_documents(filing_id,document_id) values($1,$2)`,[randomUUID(),randomUUID()])).rejects.toMatchObject({code:'42501'});
  await expect(asRole('anon',`select public.ensure_hk_fact_scope($1,'00268')`,[randomUUID()])).rejects.toMatchObject({code:'42501'});
  await expect(asRole('authenticated',`select public.hk_promotion_due(1,'x',10)`)).rejects.toMatchObject({code:'42501'});
  await expect(asRole('service_role',`select public.assert_run_evidence_complete($1)`,[randomUUID()])).rejects.toMatchObject({code:'42501'});
 });

 // The same scenarios memoryHkFactsPort passes in facts-port.test.ts, now against migration two.
 hkFactsPortContract('pgHkFactsPort contract',pgHkHarness);
});
