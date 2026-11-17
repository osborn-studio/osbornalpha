// src/lib/broker-research/pipeline.integration.test.ts
// Critical end-to-end suite (spec §12.4) on real PostgreSQL (S4_TEST_STATE harness): synthetic PDF → resumable upload
// (memory storage) → fake F3 parse → recorded-LLM extraction (one quote off by a space → unverified) → review (framed
// confirm, bind institution/analyst, rating scale, rules) → re-extract keeps effective rows and supersedes old
// candidates → snippet + summary approved → a GOLD eval receipt plus approved_gold_corpus_hash written in the TEST
// database (blocker 13 accepts gold only; Part A convention 5) → review approve → publish → anon views → replay →
// unpublish → revision 2. The single broker_research_settings row is global: this describe holds the session advisory
// lock pg_advisory_lock(hashtext('broker_research_settings')) for its whole duration (same lock as A3's settings
// blocks) and restores the prior settings in afterAll. Cases share state and run in order.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgBrokerResearchDb} from './pg-db';
import {memoryBrokerStorage,brokerPaths} from './storage';
import type {MemoryBrokerStorage} from './storage';
import {fakeF3Port} from './ports/f3';
import {recordedLlmPort} from './ports/llm';
import {EXTRACT_RESPONSE,PAGES,PIPELINE_TICKER,SUMMARY_RESPONSE,pipelineExtraction} from './fixtures/pipeline';
import {ADMIN_ID,LICENCE_INPUT,sha256,syntheticPdf} from './testing';
import {commitIntent,createIntent} from './upload';
import {runParse} from './parse';
import {runExtract} from './extract/run';
import {bindReport,fieldAction,publishBlockersOf,publishReport,reviewAction,unpublishReport} from './review';
import {approveSnippet,createSnippet} from './snippets';
import {approveSummary,runSummary} from './summary/run';
import {replayPublication} from './replay';
import type {BrokerDeps} from './deps';
import type {FieldRow,SettingsRow} from './types';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('broker research pipeline (critical, real PostgreSQL)',()=>{
 let pool:Pool,lock:PoolClient,prior:SettingsRow,deps:BrokerDeps&{storage:MemoryBrokerStorage};
 let documentId='',reportId='',publicationId='';
 const requireDocument=()=>{if(!documentId)throw new Error('Pipeline prerequisite missing: upload step did not produce documentId');return documentId;};
 const requireReport=()=>{if(!reportId)throw new Error('Pipeline prerequisite missing: extraction step did not produce reportId');return reportId;};
 const requirePublication=()=>{if(!publicationId)throw new Error('Pipeline prerequisite missing: publish step did not produce publicationId');return publicationId;};
 const pdf=syntheticPdf(`pipeline-${randomUUID()}`);
 const deadline=()=>new Date(Date.now()+280_000);
 const live=(fs:FieldRow[])=>fs.filter(f=>f.superseded_by_run_id===null&&f.status!=='rejected');
 const span=(t:string,page=1)=>{const s=PAGES[page-1].indexOf(t);return {page,charStart:s,charEnd:s+t.length};};

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  pool=new Pool({connectionString:state.adminUrl});
  lock=await pool.connect();
  await lock.query(`select pg_advisory_lock(hashtext('broker_research_settings'))`);   // session-level; released in afterAll
  await pool.query(`insert into auth.users(id,email) values($1,'broker-admin@test.invalid') on conflict do nothing`,[ADMIN_ID]);
  await pool.query(`insert into public.stocks_universe(ticker,name,market) values($1,'ZZ Robotics Inc','US') on conflict (ticker) do nothing`,[PIPELINE_TICKER]);
  await pool.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,'ZZ Robotics Inc','US','9990777') on conflict do nothing`,[randomUUID()]);
  const issuer=(await pool.query(`select issuer_id from public.issuers where cik='9990777'`)).rows[0].issuer_id as string;
  await pool.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[issuer,PIPELINE_TICKER]);
  deps={db:pgBrokerResearchDb(pool),storage:memoryBrokerStorage(),tables:pgTableClient(pool),f3:fakeF3Port((i)=>pipelineExtraction(i.sha256)),
   llm:recordedLlmPort((req)=>req.system.startsWith('You write')?SUMMARY_RESPONSE:EXTRACT_RESPONSE),now:()=>new Date(),codeVersion:'pipeline-test',newId:randomUUID};
  prior=await deps.db.getSettings();
 });
 afterAll(async()=>{
  if(lock){
   try{await lock.query(`update public.broker_research_settings set public_enabled=$1,approved_gold_corpus_hash=$2,approved_gold_corpus_by=$3,approved_gold_corpus_at=$4 where id=1`,
    [prior.public_enabled,prior.approved_gold_corpus_hash,prior.approved_gold_corpus_by,prior.approved_gold_corpus_at]);}
   finally{await lock.query(`select pg_advisory_unlock(hashtext('broker_research_settings'))`);lock.release();}
  }
  await pool?.end();
 });

 it('uploads once; a second intent for the same bytes is 409 duplicate_document; one object, one upload log row',async()=>{
  const l=await deps.db.insertLicence({...LICENCE_INPUT,source_label:`pipeline ${randomUUID().slice(0,8)}`});
  expect(await deps.db.confirmLicence(l.licence_id,ADMIN_ID,l.version)).toBe('confirmed');
  const i=await createIntent(deps,{sha256:sha256(pdf),byte_size:pdf.byteLength,licence_id:l.licence_id,original_filename:'pipeline.pdf'},ADMIN_ID);
  expect(deps.storage.putSigned(brokerPaths.staging(i.intentId),i.token,pdf)).toBe('stored');
  documentId=(await commitIntent(deps,i.intentId,ADMIN_ID)).documentId;
  await expect(createIntent(deps,{sha256:sha256(pdf),byte_size:pdf.byteLength,licence_id:l.licence_id,original_filename:'again.pdf'},ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document'});
  expect([...deps.storage.objects.keys()].filter(k=>k.startsWith('reports/'))).toEqual([brokerPaths.report(sha256(pdf))]);
  expect((await deps.db.listAccessLog({documentId,limit:10})).map(r=>r.action)).toEqual(['upload']);
 });
 it('parses and extracts; the off-by-a-space quote is unverified and blocks field_pending:target_price',async()=>{
  requireDocument();
  expect((await runParse(deps,documentId,ADMIN_ID,{deadline:deadline()})).status).toBe('succeeded');
  const ex=await runExtract(deps,documentId,ADMIN_ID,{deadline:deadline()});
  expect(ex.status).toBe('succeeded');reportId=ex.reportId;
  const tp=live(await deps.db.listFields(reportId)).find(f=>f.field==='target_price')!;
  expect(tp.status).toBe('unverified');
  const [batch]=await deps.tables.select('ingest_batches',{batch_id:(await deps.db.getRun(ex.runId))!.batch_id!},{limit:1});
  expect(batch).toMatchObject({producer:'broker-research-extract',status:'partial'});
  expect((await publishBlockersOf(deps,reportId)).blockers).toContain('field_pending:target_price');
 });
 it('review: confirm every candidate (framed span for target_price), bind institution + analyst + scale; rules receipt current',async()=>{
  requireReport();
  for(const f of live(await deps.db.listFields(reportId))){
   if(f.status==='extracted')await fieldAction(deps,reportId,f.field_id,'confirm',{},ADMIN_ID);
   if(f.status==='unverified')await fieldAction(deps,reportId,f.field_id,'confirm',span('120.00'),ADMIN_ID);
  }
  const inst=await deps.db.upsertInstitution({name_en:`Synthetic Broker Research ${randomUUID().slice(0,6)}`,name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});
  await deps.db.insertRatingScale({institution_id:inst,raw_label:'Overweight',normalized:'overweight',source_url:'https://example.invalid/ratings',valid_from:'2000-01-01',created_by:ADMIN_ID});
  const analyst=await deps.db.upsertAnalyst({institution_id:inst,display_name:'Jane Placeholder',name_variants:[],public_display:false});
  const af=live(await deps.db.listFields(reportId)).find(f=>f.field==='analyst')!;
  await bindReport(deps,reportId,{institutionId:inst,scope:'single_issuer',analyst:{analystId:analyst,fieldId:af.field_id}},ADMIN_ID);
  const targets=await deps.db.listTargets(reportId);
  expect(targets).toHaveLength(1);
  expect(targets[0]).toMatchObject({basis:'effective',security_ticker:PIPELINE_TICKER,rating_normalized:'overweight'});
  expect(String(targets[0].target_price)).toMatch(/^120(\.0+)?$/);
  const b=(await publishBlockersOf(deps,reportId)).blockers;
  expect(b).not.toContain('field_pending:target_price');expect(b).not.toContain('rules_stale');expect(b).toContain('eval_receipt_missing');
 });
 it('re-extraction keeps the effective rows and marks the previous candidates superseded',async()=>{
  requireDocument();requireReport();
  const before=(await deps.db.listFields(reportId)).filter(f=>['confirmed','corrected','absent'].includes(f.status)).map(f=>f.field_id).sort();
  const ex=await runExtract(deps,documentId,ADMIN_ID,{deadline:deadline()});
  const all=await deps.db.listFields(reportId,{includeSuperseded:true});
  expect(all.filter(f=>['confirmed','corrected','absent'].includes(f.status)).map(f=>f.field_id).sort()).toEqual(before);
  expect(all.filter(f=>f.run_id!==ex.runId&&['extracted','unverified'].includes(f.status)).every(f=>f.superseded_by_run_id===ex.runId)).toBe(true);
  expect((await publishBlockersOf(deps,reportId)).blockers.some(b=>b.startsWith('field_pending'))).toBe(false);
 });
 it('snippet and summary are approved after the disclosure check',async()=>{
  requireReport();
  const s=await createSnippet(deps,reportId,{purpose:'rating',targetKey:null,fieldId:null,...span('Rating: Overweight')},ADMIN_ID);
  await approveSnippet(deps,s.snippetId,ADMIN_ID);
  const sum=await runSummary(deps,reportId,'zh',ADMIN_ID,{deadline:deadline()});
  expect(sum.status).toBe('draft');
  expect((await approveSummary(deps,sum.summaryId,ADMIN_ID)).status).toBe('approved');
 });
 it('a gold eval receipt + approved_gold_corpus_hash (test DB only) lifts blocker 13; publish succeeds; anon sees the report',async()=>{
  requireReport();
  expect((await publishBlockersOf(deps,reportId)).blockers).toContain('eval_receipt_missing');
  const effective=live(await deps.db.listFields(reportId)).filter(f=>f.extractor.startsWith('llm:'));
  const runs=await Promise.all(effective.map(f=>deps.db.getRun(f.run_id!)));
  const digests=new Set(runs.map(run=>run?.behavior_digest));
  expect(digests.size).toBe(1);
  const [digest]=digests;
  expect(digest).toBeTruthy();
  const run=runs[0]!;
  // blocker 13 covers EVERY effective field of a gated report, human rows and absent rows included (P-R1-12, P-R3-03)
  const covered=live(await deps.db.listFields(reportId)).filter(f=>f.status==='confirmed'||f.status==='corrected'||f.status==='absent');
  const per_field=Object.fromEntries([...new Set(covered.map(f=>f.field))].sort().map(f=>[f,{tp:30,fp:0,fn:0,precision:1,recall:1}]));
  const corpus=sha256(new TextEncoder().encode(`pipeline-gold-${randomUUID()}`));
  await deps.db.insertEvalReceipt({corpus_kind:'gold',corpus_hash:corpus,behavior_digest:digest!,extractor_version:run.extractor_version!,model_id:run.model_id!,registry_hash:run.registry_hash!,
   prompt_version:run.prompt_version!,schema_version:run.schema_version!,code_version:'pipeline-test',n_docs:30,per_field,absence:{tp:0,fp:0,fn:0},precision_min:1,recall_min:1,passed:true,ran_by:ADMIN_ID});
  expect((await publishBlockersOf(deps,reportId)).blockers).toContain('eval_receipt_missing');   // receipt alone is not enough
  await deps.db.setApprovedGoldCorpus(corpus,ADMIN_ID);
  expect((await publishBlockersOf(deps,reportId)).blockers).toEqual(['review_not_approved']);
  await reviewAction(deps,reportId,'approve',ADMIN_ID);
  publicationId=(await publishReport(deps,reportId,ADMIN_ID)).publicationId;
  await deps.db.setPublicEnabled(true,ADMIN_ID);
  const c=await pool.connect();
  try{
   await c.query('begin');await c.query('set local role anon');
   const r=await c.query(`select report_id from public.broker_reports_public_v where report_id=$1`,[reportId]);
   const t=await c.query(`select target_price from public.broker_report_targets_public_v where report_id=$1`,[reportId]);
   const a=await c.query(`select count(*)::int n from public.broker_analysts_public_v where report_id=$1`,[reportId]);
   expect(r.rowCount).toBe(1);expect(String(t.rows[0].target_price)).toMatch(/^120(\.0+)?$/);expect(a.rows[0].n).toBe(0);   // public_display=false
   await c.query('rollback');
  }finally{c.release();}
 });
 it('the publication replays cleanly from the snapshot and the bucket (framed target_price exempt from candidate replay)',async()=>{
  requirePublication();requireReport();
  const r=await replayPublication(deps,publicationId);
  expect(r.mismatches).toEqual([]);
  expect(r.checked).toBeGreaterThan(0);
  expect(live(await deps.db.listFields(reportId)).find(f=>f.field==='target_price')!.detail).toMatchObject({framed:true});
 });
 it('the receipt carries the title disclosure results and the publication records title_restricted=false',async()=>{
  requirePublication();
  const pub=(await deps.db.getPublication(publicationId))!;
  expect((pub.snapshot as {report:{title_restricted:boolean}}).report.title_restricted).toBe(false);
 });
 it('unpublish → draft, revision 2, anon sees nothing; switch back off',async()=>{
  requirePublication();requireReport();
  const rep=await unpublishReport(deps,reportId,'pipeline test',ADMIN_ID);
  expect(rep).toMatchObject({status:'draft',revision:2});
  expect((await deps.db.getPublication(publicationId))!.unpublished_at).not.toBeNull();
  const c=await pool.connect();
  try{await c.query('begin');await c.query('set local role anon');
   expect((await c.query(`select 1 from public.broker_reports_public_v where report_id=$1`,[reportId])).rowCount).toBe(0);
   await c.query('rollback');}finally{c.release();}
  // settings are restored to their prior values in afterAll (under the advisory lock)
 });
 it('after unpublish the same field is edited; replaying the old publication is unchanged (snapshot-only replay, P-R1-10)',async()=>{
  requirePublication();requireReport();
  const before=await replayPublication(deps,publicationId);
  const tp=live(await deps.db.listFields(reportId)).find(f=>f.field==='target_price')!;
  await deps.db.fieldReview(tp.field_id,'correct',{value_text:'121.00',value_num:'121.00',page:tp.page,char_start:tp.char_start,char_end:tp.char_end!-1,value_source_text:tp.value_source_text!.slice(0,-1)},ADMIN_ID);
  expect(await replayPublication(deps,publicationId)).toEqual(before);
 });
});
