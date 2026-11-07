// src/lib/broker-research/broker-research.integration.test.ts
// Foreign broker research on real PostgreSQL (spec §4, §6.3, §6.5, §7.3, §10.2, §12.2): block 1 (A1)
// tables, constraints, bucket, grants and table-level triggers; block 2 (A2) SQL functions and
// function-backed triggers; block 3 (A3) public views under the real anon/authenticated roles;
// block 4 (A5) the pgBrokerResearchDb contract. Rows are never cleaned up: test:db builds a fresh
// database per run and every test seeds its own licence/document/report.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {CLAIM_METHODOLOGY_VERSION,DISCLOSURE_VERSION,RULES_VERSION,UPSIDE_FORMULA_VERSION} from './versions';

const enabled=!!process.env.S4_TEST_STATE;
const M1='supabase/migrations/20261119090000_broker_research.sql';
const TABLES=['broker_research_settings','broker_report_licences','broker_report_upload_intents','broker_report_documents','broker_report_runs','broker_research_reports','broker_report_targets','broker_report_target_overrides','broker_report_fields','broker_report_snippets','broker_report_summaries','broker_report_publications','broker_report_rule_receipts','broker_purge_steps','research_institutions','research_rating_scales','research_analysts','broker_report_analysts','broker_report_access_log','broker_eval_receipts','broker_outbox','broker_storage_writes'];

// Same replay policy as facts.integration.test.ts (not exported there).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);return;}
  catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}
/** broker_research_settings is one global row (public_enabled, approved_gold_corpus_hash). Every describe that reads its
 * defaults or toggles it holds this session-level advisory lock from beforeAll to afterAll (pipeline.integration.test.ts
 * does the same), so parallel test files never interleave. The release restores the defaults, then unlocks. */
async function lockSettings(pool:Pool):Promise<()=>Promise<void>>{
 const c=await pool.connect();
 await c.query(`select pg_advisory_lock(hashtext('broker_research_settings'))`);
 return async()=>{
  try{await c.query(`update public.broker_research_settings set public_enabled=false,approved_gold_corpus_hash=null,approved_gold_corpus_by=null,approved_gold_corpus_at=null where id=1`);}
  finally{await c.query(`select pg_advisory_unlock(hashtext('broker_research_settings'))`).catch(()=>{});c.release();}
 };
}
type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const PASS={version:'disclosure/1',inputs_hash:'0'.repeat(64),passed:true,hits:[]};

/** Seed helpers over the admin (superuser) pool: plain table writes, valid under every block's triggers. */
function seeds(pool:Pool){
 const q=async(text:string,values:unknown[]=[])=>(await pool.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const user=()=>randomUUID();
 const licence=async(o:Record<string,unknown>={},confirm=true)=>{
  const cols:Record<string,unknown>={source_label:'Test terminal',licence_kind:'terminal_subscription',holder:'Owner',terms_summary:'test terms',allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,snippet_max_chars:200,valid_from:'2020-01-01',...o};
  const k=Object.keys(cols);
  const id=await one(`insert into public.broker_report_licences(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')}) returning licence_id as v`,k.map(c=>cols[c]));
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw new Error(`seed licence: expected uuid, got ${String(id)}`);
  if(confirm)await q(`update public.broker_report_licences set confirmed_by=$2,confirmed_at=now(),confirmed_version=version where licence_id=$1`,[id,user()]);
  return id as string;
 };
 const document=async(licenceId:string,o:{sha?:string;uploadedAt?:string}={})=>{
  const s=o.sha??sha(randomUUID());
  return await one(`insert into public.broker_report_documents(document_id,sha256,storage_path,byte_size,licence_id,uploaded_by,uploaded_at,original_filename) values(gen_random_uuid(),$1,'reports/'||$1||'.pdf',1024,$2,$3,coalesce($4::timestamptz,now()),'r.pdf') returning document_id as v`,[s,licenceId,user(),o.uploadedAt??null]) as string;
 };
 /** A succeeded parse run made current: uploaded → parsing → parsed. */
 const parsed=async(documentId:string)=>{
  const run=randomUUID();const s=(await q(`select sha256 from public.broker_report_documents where document_id=$1`,[documentId]))[0].sha256;
  await q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version) values($1,$2,'parse','f3/1','test',1)`,[run,documentId]);
  await q(`update public.broker_report_runs set status='succeeded',artifact_path=$2,artifact_hash=$3 where run_id=$1`,[run,`reports/${s}.extract.${run}.json`,sha(run)]);
  await q(`update public.broker_report_documents set status='parsing' where document_id=$1`,[documentId]);
  await q(`update public.broker_report_documents set status='parsed',current_parse_run_id=$2,page_count=10 where document_id=$1`,[documentId,run]);
  return run;
 };
 const extractRun=async(documentId:string,parseRun:string,digest=sha('behavior'))=>{
  const run=randomUUID();
  await q(`insert into public.broker_report_runs(run_id,document_id,kind,parse_run_id,model_id,registry_hash,prompt_version,schema_version,code_version,behavior_digest,licence_version) values($1,$2,'extract',$3,'m-test','r'||repeat('0',63),'broker-extract/1','extract-schema/1','test',$4,1)`,[run,documentId,parseRun,digest]);
  return run;
 };
 const report=async(documentId:string)=>await one(`insert into public.broker_research_reports(document_id,code_version) values($1,'test') returning report_id as v`,[documentId]) as string;
 /** A human 'confirmed' evidence row with a span (valid under every constraint). */
 const field=async(reportId:string,parseRun:string,o:Record<string,unknown>)=>{
  const cols:Record<string,unknown>={report_id:reportId,parse_run_id:parseRun,field:'title',occurrence:1,value_text:'Title',page:1,char_start:0,char_end:5,value_source_text:'Title',extractor:`human:${randomUUID()}`,status:'confirmed',...o};
  const k=Object.keys(cols);
  return await one(`insert into public.broker_report_fields(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')}) returning field_id as v`,k.map(c=>{const v=cols[c];return v!==null&&typeof v==='object'?JSON.stringify(v):v;})) as string;
 };
 const stock=async(ticker:string,market:'A'|'HK'|'US')=>{await q(`insert into public.stocks_universe(ticker,name,market) values($1,$1,$2::market_t) on conflict (ticker) do nothing`,[ticker,market]);};
 const issuer=async()=>await one(`insert into public.issuers(issuer_id,canonical_name_en) values(gen_random_uuid(),'ZZ Broker Test') returning issuer_id as v`) as string;
 const institution=async(name=`ZZ Broker ${randomUUID()}`)=>await one(`insert into public.research_institutions(name_en) values($1) returning institution_id as v`,[name]) as string;
 /** Simulates broker_report_publish at table level (A1 has no functions): receipt, publication, status flip in one transaction under the publishing setting. */
 const forcePublish=async(reportId:string,licenceVersion=1)=>{
  const c=await pool.connect();
  try{
   await c.query('begin');
   await c.query(`select set_config('broker.publishing',$1,true)`,[reportId]);
   const rr=(await c.query(`insert into public.broker_report_rule_receipts(report_id,rules_version,input_hash,results,code_version) values($1,'broker-rules/1',$2,'[]','test') returning receipt_id`,[reportId,sha(reportId)])).rows[0].receipt_id;
   const pub=(await c.query(`insert into public.broker_report_publications(report_id,revision,snapshot,snapshot_hash,licence_version,rules_receipt_id,published_by) select report_id,revision,'{}'::jsonb,$2,$3,$4,$5 from public.broker_research_reports where report_id=$1 returning publication_id`,[reportId,sha('snap'+reportId),licenceVersion,rr,randomUUID()])).rows[0].publication_id;
   await c.query(`update public.broker_research_reports set status='published',current_publication_id=$2 where report_id=$1`,[reportId,pub]);
   await c.query('commit');return pub as string;
  }catch(e){await c.query('rollback');throw e;}finally{c.release();}
 };
 return {q,one,user,licence,document,parsed,extractRun,report,field,stock,issuer,institution,forcePublish};
}

describe.skipIf(!enabled)('A1 broker research tables, constraints, bucket, grants and table triggers',()=>{
 let admin:Pool;let s:ReturnType<typeof seeds>;let unlock:(()=>Promise<void>)|undefined;
 beforeAll(async()=>{admin=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});s=seeds(admin);unlock=await lockSettings(admin);},60000);
 afterAll(async()=>{await unlock?.();await admin?.end();});

 it('creates 22 RLS tables, the private bucket, service-role-only grants, the settings singleton, and replays',async()=>{
  const rows=await s.q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect(await s.q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='broker-research'`)).toEqual([{id:'broker-research',public:false,file_size_limit:'52428800',allowed_mime_types:['application/pdf','application/json','image/png']}]);
  const priv=(role:string,t:string,p:string)=>s.one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated'])for(const t of TABLES)for(const p of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const t of TABLES){
   expect({t,ok:await priv('service_role',t,'SELECT')}).toEqual({t,ok:true});
   expect({t,ok:await priv('service_role',t,'UPDATE')}).toEqual({t,ok:true});
   expect({t,ok:await priv('service_role',t,'TRUNCATE')}).toEqual({t,ok:false});
   const dml=t!=='broker_research_settings';
   expect({t,ok:await priv('service_role',t,'INSERT')}).toEqual({t,ok:dml});
   expect({t,ok:await priv('service_role',t,'DELETE')}).toEqual({t,ok:dml});
  }
  expect(await s.q(`select id,public_enabled,approved_gold_corpus_hash from public.broker_research_settings`)).toEqual([{id:1,public_enabled:false,approved_gold_corpus_hash:null}]);
  expect((await fails(s.q(`insert into public.broker_research_settings(id) values(2)`))).message).toMatch(/broker_research_settings_singleton/);
  await expect(replayMigration(admin,readFileSync(M1,'utf8'))).resolves.toBeUndefined();
  expect(await s.one(`select count(*)::int v from public.broker_research_settings`)).toBe(1);
 },60000);

 it('constraints: sha/storage path, intents staging path, lease pair, field shapes, corrected payload, effective uniqueness, snippet length',async()=>{
  const lic=await s.licence();
  const bad=sha('x').toUpperCase();
  expect((await fails(s.q(`insert into public.broker_report_documents(document_id,sha256,storage_path,byte_size,licence_id,uploaded_by,original_filename) values(gen_random_uuid(),$1,'reports/'||$1||'.pdf',1,$2,gen_random_uuid(),'a.pdf')`,[bad,lic]))).message).toMatch(/broker_documents_sha256_format/);
  const h=sha(randomUUID());
  expect((await fails(s.q(`insert into public.broker_report_documents(document_id,sha256,storage_path,byte_size,licence_id,uploaded_by,original_filename) values(gen_random_uuid(),$1,'reports/other.pdf',1,$2,gen_random_uuid(),'a.pdf')`,[h,lic]))).message).toMatch(/broker_documents_storage_path/);
  const doc=await s.document(lic);
  expect((await fails(s.document(lic,{sha:(await s.q(`select sha256 from public.broker_report_documents where document_id=$1`,[doc]))[0].sha256}))).code).toBe('23505');
  expect((await fails(s.q(`update public.broker_report_documents set lease_token=gen_random_uuid() where document_id=$1`,[doc]))).message).toMatch(/broker_documents_lease_pair/);
  const iid=randomUUID();
  expect((await fails(s.q(`insert into public.broker_report_upload_intents(intent_id,sha256,byte_size,licence_id,original_filename,created_by,expires_at,status,staging_path) values($1,$2,1,$3,'a.pdf',gen_random_uuid(),now()+interval '2 hours','open','staging/other.pdf')`,[iid,h,lic]))).message).toMatch(/broker_intents_staging_path/);
  const pr=await s.parsed(doc);const rep=await s.report(doc);
  expect((await fails(s.field(rep,pr,{status:'confirmed',char_start:null,char_end:null,value_source_text:null}))).message).toMatch(/broker_fields_confirmed_span/);
  expect((await fails(s.field(rep,pr,{field:'title',status:'absent',value_text:'ABSENT',char_start:null,char_end:null,value_source_text:null}))).message).toMatch(/broker_fields_absent_shape/);
  await s.field(rep,pr,{field:'target_price',target_key:'9988.HK',status:'absent',value_text:'ABSENT',char_start:null,char_end:null,value_source_text:null});
  expect((await fails(s.field(rep,pr,{field:'rating',target_key:null}))).message).toMatch(/broker_fields_target_key_level/);
  expect((await fails(s.field(rep,pr,{field:'institution',target_key:'9988.HK'}))).message).toMatch(/broker_fields_target_key_level/);
  expect((await fails(s.field(rep,pr,{field:'published_date',status:'extracted',extractor:'llm:m@r'}))).message).toMatch(/broker_fields_candidate_run/);
  expect((await fails(s.field(rep,pr,{field:'published_date',status:'corrected',corrected:{value_num:'1'}}))).message).toMatch(/broker_fields_corrected_payload/);
  expect((await fails(s.field(rep,pr,{field:'published_date',status:'corrected',corrected:{value_text:'x',other:1}}))).message).toMatch(/broker_fields_corrected_payload/);
  expect((await fails(s.field(rep,pr,{field:'published_date',status:'corrected',corrected:{value_text:'x',value_num:'1e5'}}))).message).toMatch(/broker_fields_corrected_payload/);
  expect((await fails(s.field(rep,pr,{field:'published_date',status:'confirmed',corrected:{value_text:'x'}}))).message).toMatch(/broker_fields_corrected_iff/);
  await s.field(rep,pr,{field:'published_date',status:'corrected',corrected:{value_text:'2026-01-02',value_date:'2026-01-02',value_num:null}});
  expect((await fails(s.field(rep,pr,{field:'published_date'}))).code).toBe('23505');   // second effective row for the identity
  expect((await fails(s.field(rep,pr,{field:'title',value_currency:'usd'}))).message).toMatch(/broker_fields_value_currency/);
  expect((await fails(s.q(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,created_by) values($1,'thesis',$2,1,0,501,repeat('a',501),gen_random_uuid())`,[rep,pr]))).message).toMatch(/broker_snippets_text_length/);
  expect((await fails(s.q(`insert into public.broker_report_licences(source_label,licence_kind,holder,terms_summary,snippet_max_chars,valid_from) values('x','other','h','t',501,'2020-01-01')`))).message).toMatch(/broker_licences_snippet_max/);
 });

 it('licence_material_change: material edit bumps version, clears confirmation, drafts approved texts, flags reports, writes licence.changed; non-material edit does not',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);const pr=await s.parsed(doc);const rep=await s.report(doc);
  const ext=await s.extractRun(doc,pr);
  await s.q(`update public.broker_research_reports set summary_input_digest=$2 where report_id=$1`,[rep,sha('d')]);
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,status,disclosure_check,approved_by,approved_at,created_by) values($1,'thesis',$2,1,0,4,'abcd','approved',$3,gen_random_uuid(),now(),gen_random_uuid()) returning snippet_id as v`,[rep,pr,JSON.stringify(PASS)]);
  const su=await s.one(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check,status,approved_by,approved_at) values($1,'zh',$2,$3,'摘要',3,'{"version":"grounding/1","passed":true,"assertions":[],"failures":[]}',$4,'approved',gen_random_uuid(),now()) returning summary_id as v`,[rep,ext,sha('d'),JSON.stringify(PASS)]);
  const before=Number(await s.one(`select count(*)::int v from public.broker_outbox where kind='licence.changed' and payload->>'licence_id'=$1`,[lic]));
  await s.q(`update public.broker_report_licences set source_label='Renamed', evidence_path='licences/'||$2||'.pdf' where licence_id=$1`,[lic,sha('evidence')]);
  expect((await s.q(`select version,confirmed_version from public.broker_report_licences where licence_id=$1`,[lic]))[0]).toEqual({version:1,confirmed_version:1});
  expect((await fails(s.q(`update public.broker_report_licences set version=7 where licence_id=$1`,[lic]))).message).toMatch(/^licence_version_managed/);
  await s.q(`update public.broker_report_licences set allows_public_target_price=false where licence_id=$1`,[lic]);
  expect((await s.q(`select version,confirmed_by,confirmed_at,confirmed_version from public.broker_report_licences where licence_id=$1`,[lic]))[0]).toEqual({version:2,confirmed_by:null,confirmed_at:null,confirmed_version:null});
  expect((await s.q(`select status,approved_by,approved_at,draft_reason from public.broker_report_snippets where snippet_id=$1`,[sn]))[0]).toEqual({status:'draft',approved_by:null,approved_at:null,draft_reason:'licence_version'});
  expect((await s.q(`select status,draft_reason from public.broker_report_summaries where summary_id=$1`,[su]))[0]).toEqual({status:'draft',draft_reason:'licence_version'});
  expect(await s.one(`select disclosure_ok v from public.broker_research_reports where report_id=$1`,[rep])).toBe(false);
  const ev=await s.q(`select payload from public.broker_outbox where kind='licence.changed' and payload->>'licence_id'=$1 order by created_at`,[lic]);
  expect(ev.length).toBe(before+1);expect(ev.at(-1)!.payload).toMatchObject({licence_id:lic,version:2,previous_version:1});
  expect(typeof ev.at(-1)!.payload.event_id).toBe('string');
  expect((await fails(s.q(`update public.broker_report_licences set confirmed_by=gen_random_uuid(),confirmed_at=now(),confirmed_version=1 where licence_id=$1`,[lic]))).message).toMatch(/broker_licences_confirmed_version/);
  expect((await fails(s.q(`delete from public.broker_report_licences where licence_id=$1`,[lic]))).message).toMatch(/^append_only:/);
 });

 it('documents: status machine, immutable identity, promotion_pending only clears, promotion_lost recovery, never deleted',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);
  const set=(sql:string)=>s.q(`update public.broker_report_documents set ${sql} where document_id=$1`,[doc]);
  expect((await fails(set(`status='parsed'`))).message).toMatch(/^document_transition_invalid:uploaded->parsed/);
  await set(`status='parsing'`);await set(`status='parse_failed'`);await set(`status='parsing'`);
  expect((await fails(set(`status='parsed'`))).message).toMatch(/^document_parse_run_required/);
  expect((await fails(set(`sha256='${sha('other')}'`))).message).toMatch(/^document_immutable/);
  expect((await fails(set(`byte_size=2`))).message).toMatch(/^document_immutable/);
  expect((await fails(set(`promotion_pending=true`))).message).toMatch(/^document_promotion_pending_only_clears/);
  await set(`status='parse_failed'`);
  await set(`status='withdrawn',withdrawn_at=now(),withdrawn_reason='promotion_lost'`);
  await set(`status='uploaded',withdrawn_at=null,withdrawn_reason=null`);                      // FR4-01 recovery
  await set(`status='withdrawn',withdrawn_at=now(),withdrawn_reason='owner request'`);
  expect((await fails(set(`status='uploaded',withdrawn_at=null,withdrawn_reason=null`))).message).toMatch(/^document_transition_invalid:withdrawn->uploaded/);
  expect((await fails(s.q(`delete from public.broker_report_documents where document_id=$1`,[doc]))).message).toMatch(/^append_only:/);
 });

 it('intents: legal transitions only, checkpoint_at stamped on every status change, document_id set once',async()=>{
  const lic=await s.licence();const id=randomUUID();
  await s.q(`insert into public.broker_report_upload_intents(intent_id,sha256,byte_size,licence_id,original_filename,created_by,expires_at,status,staging_path) values($1::uuid,$2,10,$3,'a.pdf',gen_random_uuid(),now()+interval '2 hours','open','staging/'||$1::text||'.pdf')`,[id,sha(id),lic]);
  const set=(sql:string)=>s.q(`update public.broker_report_upload_intents set ${sql} where intent_id=$1`,[id]);
  expect(await s.one(`select checkpoint_at v from public.broker_report_upload_intents where intent_id=$1`,[id])).toBeNull();
  await set(`status='validating'`);
  expect(await s.one(`select checkpoint_at is not null v from public.broker_report_upload_intents where intent_id=$1`,[id])).toBe(true);
  expect((await fails(set(`status='committed'`))).message).toMatch(/^intent_transition_invalid:validating->committed/);
  await set(`status='validated'`);await set(`status='promoting'`);
  expect((await fails(set(`status='committed'`))).message).toMatch(/broker_intents_committed_document/);
  const doc=await s.document(lic);
  await set(`document_id='${doc}'`);
  expect((await fails(set(`document_id='${await s.document(lic)}'`))).message).toMatch(/^intent_document_set_once/);
  await set(`status='committed'`);
  expect((await fails(set(`status='abandoned'`))).message).toMatch(/^intent_transition_invalid:committed->abandoned/);
  expect((await fails(set(`sha256='${sha('z')}'`))).message).toMatch(/^intent_immutable/);
 });

 it('runs: inserted running, finished once with finished_at stamped, finishing columns only, never deleted',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);const run=randomUUID();
  expect((await fails(s.q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version,status) values($1,$2,'parse','f3/1','t',1,'succeeded')`,[run,doc]))).message).toMatch(/^append_only:/);
  const run0=randomUUID();await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,code_version,licence_version) values($1,$2,'parse','t',1)`,[run0,doc]);   // extractor_version may arrive at finish
  expect((await fails(s.q(`update public.broker_report_runs set status='succeeded',artifact_path=$2,artifact_hash=$3 where run_id=$1`,[run0,`reports/${sha('x')}.extract.${run0}.json`,sha('y')]))).message).toMatch(/broker_runs_parse_extractor/);
  expect((await fails(s.q(`insert into public.broker_report_runs(run_id,document_id,kind,code_version,licence_version,model_id,registry_hash,prompt_version,schema_version) values($1,$2,'extract','t',1,'m','r','p','s')`,[run,doc]))).message).toMatch(/broker_runs_parse_link/);
  await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version) values($1,$2,'parse','f3/1','t',1)`,[run,doc]);
  expect((await fails(s.q(`update public.broker_report_runs set code_version='x' where run_id=$1`,[run]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`update public.broker_report_runs set status='failed',extractor_version='f3/2' where run_id=$1`,[run]))).message).toMatch(/^extractor_version_immutable/);
  expect((await fails(s.q(`update public.broker_report_runs set status='succeeded' where run_id=$1`,[run]))).message).toMatch(/broker_runs_parse_artifact/);
  await s.q(`update public.broker_report_runs set status='failed',detail='{"error_code":"f3_failed"}' where run_id=$1`,[run]);
  expect(await s.one(`select finished_at is not null v from public.broker_report_runs where run_id=$1`,[run])).toBe(true);
  expect((await fails(s.q(`update public.broker_report_runs set detail='{}' where run_id=$1`,[run]))).message).toMatch(/^append_only:run .* is already finished/);
  expect((await fails(s.q(`delete from public.broker_report_runs where run_id=$1`,[run]))).message).toMatch(/^append_only:/);
 });

 it('broker_storage_writes: pending by default with server started_at; writer / status / reconciled constraints (P-R5-01)',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);
  const w=await s.one(`insert into public.broker_storage_writes(document_id,path,writer) values($1,'runs/x.request.json','extract') returning write_id as v`,[doc]);
  expect((await s.q(`select status,started_at is not null s,finished_at,reconciled_at from public.broker_storage_writes where write_id=$1`,[w]))[0]).toEqual({status:'pending',s:true,finished_at:null,reconciled_at:null});
  expect((await fails(s.q(`insert into public.broker_storage_writes(document_id,path,writer) values($1,'p','browser')`,[doc]))).message).toMatch(/broker_storage_writes_writer/);
  expect((await fails(s.q(`update public.broker_storage_writes set status='done' where write_id=$1`,[w]))).message).toMatch(/broker_storage_writes_finished/);
  expect((await fails(s.q(`update public.broker_storage_writes set status='abandoned',finished_at=now() where write_id=$1`,[w]))).message).toMatch(/broker_storage_writes_finished/);
  expect((await fails(s.q(`update public.broker_storage_writes set finished_at=now() where write_id=$1`,[w]))).message).toMatch(/broker_storage_writes_finished/);
  expect((await fails(s.q(`update public.broker_storage_writes set status='reconciled' where write_id=$1`,[w]))).message).toMatch(/broker_storage_writes_deleted/);
  expect((await fails(s.q(`update public.broker_storage_writes set status='reconciled',reconciled_at=now(),deleted_at=now() where write_id=$1`,[w]))).message).toMatch(/broker_storage_writes_finished/);
  expect((await fails(s.q(`update public.broker_storage_writes set status='reconciled',finished_at=now(),deleted_at=now() where write_id=$1`,[w]))).message).toMatch(/broker_storage_writes_reconciled/);
  expect((await s.q(`select attempts, next_attempt_at is not null scheduled, deleted_at from public.broker_storage_writes where write_id=$1`,[w]))[0]).toEqual({attempts:0,scheduled:true,deleted_at:null});
  expect((await fails(s.q(`update public.broker_storage_writes set status='reconciled',finished_at=now(),reconciled_at=now() where write_id=$1`,[w]))).message).toMatch(/broker_storage_writes_deleted/);
  await s.q(`update public.broker_storage_writes set status='reconciled',finished_at=now(),deleted_at=now(),reconciled_at=now() where write_id=$1`,[w]);
  const abandoned=await s.one(`insert into public.broker_storage_writes(document_id,path,writer) values($1,'runs/abandoned.request.json','extract') returning write_id as v`,[doc]);
  await s.q(`update public.broker_storage_writes set status='abandoned' where write_id=$1`,[abandoned]);
  expect((await s.q(`select status,finished_at,reconciled_at from public.broker_storage_writes where write_id=$1`,[abandoned]))[0]).toEqual({status:'abandoned',finished_at:null,reconciled_at:null});
 });

 it('child guard on every attached table: insert/update/delete compile and behave on draft and published reports (P-R1-02)',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);const pr=await s.parsed(doc);const rep=await s.report(doc);const ext=await s.extractRun(doc,pr);
  await s.stock('ZZCG','US');const inst=await s.institution();
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name) values($1,'Pat Placeholder') returning analyst_id as v`,[inst]);
  const af=await s.field(rep,pr,{field:'analyst',value_text:'Pat Placeholder',value_source_text:'Pat P',char_end:5});
  // draft: every table accepts insert and update; targets / overrides / bindings also delete; fields / snippets / summaries are append-only
  await s.q(`insert into public.broker_report_targets(report_id,target_key,basis,ticker_as_stated,input_hash) values($1,'ZZCG','candidate','ZZCG US',$2)`,[rep,sha('t')]);
  await s.q(`update public.broker_report_targets set rating_raw='Buy' where report_id=$1`,[rep]);
  await s.q(`insert into public.broker_report_target_overrides(report_id,target_key,security_ticker,set_by) values($1,'ZZCG','ZZCG',gen_random_uuid())`,[rep]);
  await s.q(`update public.broker_report_target_overrides set note='n' where report_id=$1`,[rep]);
  const fid=await s.field(rep,pr,{field:'sector',value_text:'Tech',value_source_text:'Tech',char_end:4});
  await s.q(`update public.broker_report_fields set status='rejected' where field_id=$1`,[fid]);
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,created_by) values($1,'thesis',$2,1,0,4,'abcd',gen_random_uuid()) returning snippet_id as v`,[rep,pr]);
  await s.q(`update public.broker_report_snippets set status='rejected' where snippet_id=$1`,[sn]);
  const su=await s.one(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check) values($1,'en',$2,$3,'S',0,'{"passed":false}','{"passed":false}') returning summary_id as v`,[rep,ext,sha('i')]);
  await s.q(`update public.broker_report_summaries set status='rejected' where summary_id=$1`,[su]);
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,af]);
  await s.q(`update public.broker_report_analysts set role='lead' where report_id=$1`,[rep]);
  expect((await fails(s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,fid]))).message).toMatch(/analyst_field_mismatch|duplicate key/);
  for(const t of ['broker_report_fields','broker_report_snippets','broker_report_summaries'])
   expect((await fails(s.q(`delete from public.${t} where report_id=$1`,[rep]))).message).toMatch(/^append_only:/);
  await s.q(`delete from public.broker_report_analysts where report_id=$1`,[rep]);
  await s.q(`delete from public.broker_report_target_overrides where report_id=$1`,[rep]);
  await s.q(`delete from public.broker_report_targets where report_id=$1`,[rep]);
  // published: every table rejects every write with published_immutable (no "record new has no field" error)
  await s.q(`insert into public.broker_report_targets(report_id,target_key,basis,ticker_as_stated,input_hash) values($1,'ZZCG','candidate','ZZCG US',$2)`,[rep,sha('t')]);
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,af]);
  await s.forcePublish(rep);
  const writes:[string,unknown[]][]=[
   [`insert into public.broker_report_targets(report_id,target_key,basis,ticker_as_stated,input_hash) values($1,'ZZCH','candidate','ZZCH US',$2)`,[rep,sha('u')]],
   [`update public.broker_report_targets set rating_raw='Sell' where report_id=$1`,[rep]],
   [`delete from public.broker_report_targets where report_id=$1`,[rep]],
   [`insert into public.broker_report_target_overrides(report_id,target_key,security_ticker,set_by) values($1,'ZZCG','ZZCG',gen_random_uuid())`,[rep]],
   [`update public.broker_report_fields set reviewed_at=now() where field_id=$1`,[fid]],
   [`update public.broker_report_snippets set text='abce' where snippet_id=$1`,[sn]],
   [`update public.broker_report_summaries set summary_md='T' where summary_id=$1`,[su]],
   [`update public.broker_report_analysts set role='x' where report_id=$1`,[rep]],
   [`delete from public.broker_report_analysts where report_id=$1`,[rep]],
  ];
  for(const [sql,args] of writes){const e=await fails(s.q(sql,args));expect(e.message).toMatch(/^published_immutable:/);expect(e.message).not.toMatch(/has no field/);}
 });

 it('reports guard and child guards: draft-only insert, publish_direct_forbidden, published immutability, frozen children, snippets/summaries may only fall back',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);const pr=await s.parsed(doc);const rep=await s.report(doc);
  expect((await fails(s.q(`insert into public.broker_research_reports(document_id,code_version,status) values($1,'t','published')`,[await s.document(lic)]))).message).toMatch(/^publish_direct_forbidden/);
  expect((await fails(s.q(`update public.broker_research_reports set status='published' where report_id=$1`,[rep]))).message).toMatch(/^publish_direct_forbidden/);
  expect((await fails(s.q(`update public.broker_research_reports set revision=2 where report_id=$1`,[rep]))).message).toMatch(/^report_column_managed/);
  const fid=await s.field(rep,pr,{field:'title'});
  await s.q(`update public.broker_research_reports set summary_input_digest=$2 where report_id=$1`,[rep,sha('d')]);
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,status,disclosure_check,approved_by,approved_at,created_by) values($1,'thesis',$2,1,0,4,'abcd','approved',$3,gen_random_uuid(),now(),gen_random_uuid()) returning snippet_id as v`,[rep,pr,JSON.stringify(PASS)]);
  const pub=await s.forcePublish(rep);
  expect((await s.q(`select status,current_publication_id from public.broker_research_reports where report_id=$1`,[rep]))[0]).toEqual({status:'published',current_publication_id:pub});
  expect((await fails(s.q(`update public.broker_research_reports set title_public='x' where report_id=$1`,[rep]))).message).toMatch(/^published_immutable/);
  await s.q(`update public.broker_research_reports set evidence_ok=false where report_id=$1`,[rep]);                   // allowed
  await s.q(`update public.broker_research_reports set evidence_ok=true, disclosure_ok=true where report_id=$1`,[rep]);
  expect((await fails(s.q(`update public.broker_research_reports set status='draft' where report_id=$1`,[rep]))).message).toMatch(/^unpublish_direct_forbidden/);
  expect((await fails(s.q(`update public.broker_research_reports set status='withdrawn' where report_id=$1`,[rep]))).message).toMatch(/^withdraw_direct_forbidden/);
  expect((await fails(s.field(rep,pr,{field:'sector',value_text:'Tech'}))).message).toMatch(/^published_immutable:broker_report_fields/);
  expect((await fails(s.q(`update public.broker_report_fields set status='rejected' where field_id=$1`,[fid]))).message).toMatch(/^published_immutable/);
  expect((await fails(s.q(`update public.broker_report_snippets set text='abce' where snippet_id=$1`,[sn]))).message).toMatch(/^published_immutable/);
  expect((await fails(s.q(`insert into public.broker_report_target_overrides(report_id,target_key,security_ticker,set_by) values($1,'X',null,gen_random_uuid())`,[rep]))).message).toMatch(/published_immutable|null value/);
  await s.q(`update public.broker_report_snippets set status='draft',approved_by=null,approved_at=null,draft_reason='licence_version' where snippet_id=$1`,[sn]);   // fallback allowed
  expect((await fails(s.q(`delete from public.broker_report_snippets where snippet_id=$1`,[sn]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`delete from public.broker_research_reports where report_id=$1`,[rep]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`update public.broker_report_publications set snapshot='{"x":1}' where publication_id=$1`,[pub]))).message).toMatch(/^append_only:/);
  await s.q(`update public.broker_report_publications set unpublished_at=now(),unpublish_reason='t' where publication_id=$1`,[pub]);
  expect((await fails(s.q(`update public.broker_report_publications set unpublished_at=now() where publication_id=$1`,[pub]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`insert into public.broker_report_publications(report_id,revision,snapshot,snapshot_hash,licence_version,rules_receipt_id,published_by) select report_id,9,'{}',$2,1,rules_receipt_id,published_by from public.broker_report_publications where publication_id=$1`,[pub,sha('p')]))).message).toMatch(/^publish_direct_forbidden:publication/);
 });

 it('fields guard: identity and values immutable, legal status moves only, superseded set once; analyst bindings point at analyst rows',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);const pr=await s.parsed(doc);const rep=await s.report(doc);const ext=await s.extractRun(doc,pr);
  const c=await s.field(rep,pr,{field:'title',status:'unverified',extractor:'llm:m@r',run_id:ext,char_start:null,char_end:null,value_source_text:null});
  const set=(sql:string,id=c)=>s.q(`update public.broker_report_fields set ${sql} where field_id=$1`,[id]);
  expect((await fails(set(`value_text='Other'`))).message).toMatch(/^field_immutable/);
  expect((await fails(set(`field='sector'`))).message).toMatch(/^field_immutable/);
  expect((await fails(set(`status='absent'`))).message).toMatch(/^field_transition_invalid/);
  const ext2=await s.extractRun(doc,pr);
  await set(`superseded_by_run_id='${ext2}'`);
  expect((await fails(set(`superseded_by_run_id='${ext}'`))).message).toMatch(/^field_superseded_once/);
  await set(`status='rejected'`);
  expect((await fails(set(`status='extracted'`))).message).toMatch(/^field_transition_invalid/);
  const t=await s.field(rep,pr,{field:'title',occurrence:2});
  const inst=await s.institution();
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name) values($1,'A. Analyst') returning analyst_id as v`,[inst]);
  expect((await fails(s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,t]))).message).toMatch(/^analyst_field_mismatch/);
  const af=await s.field(rep,pr,{field:'analyst',value_text:'A. Analyst'});
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,af]);
  expect((await fails(s.q(`delete from public.broker_report_fields where field_id=$1`,[t]))).message).toMatch(/^append_only:/);
 });

 it('rating scales are close-only; analyst_disclosure_change flags reports and drafts their approved texts; append-only logs; outbox claim uniqueness',async()=>{
  const inst=await s.institution();
  const sc=await s.one(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'Buy','buy','https://example.test/r','2020-01-01',gen_random_uuid()) returning scale_id as v`,[inst]);
  expect((await fails(s.q(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'BUY','sell','https://example.test/r','2020-01-01',gen_random_uuid())`,[inst]))).code).toBe('23505');
  expect((await fails(s.q(`update public.research_rating_scales set normalized='sell' where scale_id=$1`,[sc]))).message).toMatch(/^scale_close_only/);
  expect((await fails(s.q(`update public.research_rating_scales set valid_to='2025-01-01' where scale_id=$1`,[sc]))).message).toMatch(/^scale_closed_by_required/);
  await s.q(`update public.research_rating_scales set valid_to='2025-01-01',closed_by=gen_random_uuid() where scale_id=$1`,[sc]);
  expect(await s.one(`select closed_at is not null v from public.research_rating_scales where scale_id=$1`,[sc])).toBe(true);
  expect((await fails(s.q(`update public.research_rating_scales set valid_to='2026-01-01',closed_by=gen_random_uuid() where scale_id=$1`,[sc]))).message).toMatch(/^scale_closed/);
  expect((await fails(s.q(`delete from public.research_rating_scales where scale_id=$1`,[sc]))).message).toMatch(/^append_only:/);

  const lic=await s.licence();const doc=await s.document(lic);const pr=await s.parsed(doc);const rep=await s.report(doc);
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name) values($1,'B. Analyst') returning analyst_id as v`,[inst]);
  const af=await s.field(rep,pr,{field:'analyst',value_text:'B. Analyst'});
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,af]);
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,status,disclosure_check,approved_by,approved_at,created_by) values($1,'thesis',$2,1,0,4,'abcd','approved',$3,gen_random_uuid(),now(),gen_random_uuid()) returning snippet_id as v`,[rep,pr,JSON.stringify(PASS)]);
  await s.q(`update public.research_analysts set created_at=created_at where analyst_id=$1`,[an]);            // no disclosure input changed
  expect(await s.one(`select disclosure_ok v from public.broker_research_reports where report_id=$1`,[rep])).toBe(true);
  await s.q(`update public.research_analysts set public_display=true where analyst_id=$1`,[an]);
  expect(await s.one(`select disclosure_ok v from public.broker_research_reports where report_id=$1`,[rep])).toBe(false);
  expect((await s.q(`select status,draft_reason from public.broker_report_snippets where snippet_id=$1`,[sn]))[0]).toEqual({status:'draft',draft_reason:'analyst_disclosure'});

  const log=await s.one(`insert into public.broker_report_access_log(document_id,user_id,action) values($1,gen_random_uuid(),'text_viewed') returning id as v`,[doc]);
  expect((await fails(s.q(`update public.broker_report_access_log set action='upload' where id=$1`,[log]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`insert into public.broker_report_access_log(document_id,user_id,action) values($1,gen_random_uuid(),'ip_logged')`,[doc]))).message).toMatch(/broker_access_log_action/);
  const ev=await s.one(`insert into public.broker_eval_receipts(corpus_kind,corpus_hash,behavior_digest,extractor_version,model_id,registry_hash,prompt_version,schema_version,code_version,n_docs,per_field,absence,precision_min,recall_min,passed,ran_by) values('synthetic',$1,$1,'f3/1','m','r','p','s','t',1,'{}','{"tp":0,"fp":0,"fn":0}',0.99,0.99,true,gen_random_uuid()) returning receipt_id as v`,[sha('c')]);
  expect((await fails(s.q(`update public.broker_eval_receipts set passed=false where receipt_id=$1`,[ev]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`insert into public.broker_eval_receipts(corpus_kind,corpus_hash,behavior_digest,extractor_version,model_id,registry_hash,prompt_version,schema_version,code_version,n_docs,per_field,absence,precision_min,recall_min,passed,ran_by) values('gold',$1,$1,'f3/1','m','r','p','s','t',30,'{}','{"tp":0,"fp":0,"fn":0}',0.5,0.99,true,gen_random_uuid())`,[sha('c')]))).message).toMatch(/broker_eval_passed_rule/);
  const key=`broker_target_price:${randomUUID()}:9988.HK`;
  await s.q(`insert into public.broker_outbox(kind,payload) values('claim.register',jsonb_build_object('claim_key',$1::text,'claim_seq',1))`,[key]);
  expect((await fails(s.q(`insert into public.broker_outbox(kind,payload) values('claim.register',jsonb_build_object('claim_key',$1::text,'claim_seq',1))`,[key]))).code).toBe('23505');
  await s.q(`insert into public.broker_outbox(kind,payload) values('licence.changed',jsonb_build_object('claim_key',$1::text,'claim_seq',1))`,[key]);   // index is partial
  const e=await s.one(`select event_id v from public.broker_outbox where payload->>'claim_key'=$1 and kind='claim.register'`,[key]);
  expect((await fails(s.q(`update public.broker_outbox set payload='{}' where event_id=$1`,[e]))).message).toMatch(/^append_only:/);
  await s.q(`update public.broker_outbox set attempts=1,last_error='x' where event_id=$1`,[e]);
 });
});

// ---- shared by blocks 2–4 (A2 writes these; A3/A5 reuse them). Each block's beforeAll rebinds
// the pool; describes run sequentially within this file, so the module-level bindings are safe.
const M2='supabase/migrations/20261119091000_broker_research_functions.sql';
let pool:Pool;let s:ReturnType<typeof seeds>;
const bind=()=>{pool=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});s=seeds(pool);};
 const J=(v:unknown)=>JSON.stringify(v);
 const lease=async(doc:string,token=randomUUID(),ttl=300)=>{expect(await s.one(`select public.broker_document_claim_lease($1,$2,$3) v`,[doc,token,ttl])).toBe(true);return token;};
 const commit=(doc:string,token:string,run:string,rows:unknown[])=>s.one(`select public.broker_extract_commit($1,$2,$3,$4::jsonb) v`,[doc,token,run,J(rows)]);
 const review=(f:string,action:string,payload:Record<string,unknown>={},by=randomUUID())=>s.one(`select public.broker_field_review($1,$2,$3::jsonb,$4) v`,[f,action,J(payload),by]);
 const add=(rep:string,row:Record<string,unknown>,by=randomUUID())=>s.one(`select public.broker_field_add($1,$2::jsonb,$3) v`,[rep,J(row),by]);
 const materialize=(rep:string)=>s.one(`select public.broker_report_materialize($1) v`,[rep]);
 const blockers=async(rep:string)=>(await s.one(`select public.broker_report_publish_blockers($1) v`,[rep])) as string[];
 const publish=(rep:string,by=randomUUID())=>s.one(`select public.broker_report_publish($1,$2) v`,[rep,by]) as Promise<string>;
 const unpublish=(rep:string,reason='test',by=randomUUID())=>s.q(`select public.broker_report_unpublish($1,$2,$3)`,[rep,by,reason]);
 const report=async(rep:string)=>(await s.q(`select r.*,r.published_date::text as published_date,r.price_as_of_date::text as price_as_of_date from public.broker_research_reports r where report_id=$1`,[rep]))[0];
 const targets=(rep:string)=>s.q(`select target_key,basis,ticker_as_stated,security_ticker,issuer_id,rating_raw,rating_normalized,scale_id,target_price::text tp,target_currency,target_horizon_months,price_at_report::text pr,price_currency,price_as_of_date::text pd,upside_pct::text up,upside_formula_version from public.broker_report_targets where report_id=$1 order by target_key`,[rep]);
 const cand=(o:Record<string,unknown>)=>({target_key:null,occurrence:1,value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',extractor:'llm:m-test@r',extractor_confidence:0.9,conflict_group:null,detail:{},status:'extracted',...o});
 const live=(rep:string,field:string,tk:string|null=null)=>s.q(`select field_id,status from public.broker_report_fields where report_id=$1 and field=$2 and target_key is not distinct from $3 and status in ('extracted','unverified') and superseded_by_run_id is null order by created_at,field_id`,[rep,field,tk]);
 const batch=async()=>await s.one(`insert into public.ingest_batches(batch_id,producer,dataset) values(gen_random_uuid(),'broker-research-extract','broker_research') returning batch_id as v`) as string;
 const outbox=(kind:string,pub:string)=>s.q(`select payload from public.broker_outbox where kind=$1 and payload->'source'->>'publication_id'=$2 order by payload->>'claim_key'`,[kind,pub]);
 const GOLD=sha('gold-corpus');
 const TARGET_FIELDS=['ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date'];
 /** A single-issuer draft through extract_commit: 3 report-level + 7 target candidates for one HK ticker. */
 const world=async(o:{licence?:Record<string,unknown>;extra?:(tk:string)=>Record<string,unknown>[];tickers?:number;tk?:string;issuer?:string;inst?:string;published?:string;prices?:{target_price:string;price_at_report:string;target_currency:string;price_currency:string};ratingOnly?:boolean}={})=>{
  const tks:string[]=[];const issuers:string[]=[];
  for(let i=0;i<(o.tickers??1);i++){const tk=i===0&&o.tk?o.tk:`${1000+Math.floor(Math.random()*8999)}.HK`;await s.stock(tk,'HK');tks.push(tk);issuers.push(i===0&&o.issuer?o.issuer:await s.issuer());}
  const lic=await s.licence(o.licence??{});const doc=await s.document(lic,{uploadedAt:'2026-03-10T00:00:00Z'});const pr=await s.parsed(doc);
  const rep=await s.report(doc);const digest=sha(randomUUID());const ext=await s.extractRun(doc,pr,digest);const token=await lease(doc);
  const rows:Record<string,unknown>[]=[
   cand({field:'institution',value_text:'Test Securities'}),
   cand({field:'published_date',value_text:o.published??'2026-03-05',value_date:o.published??'2026-03-05'}),
   cand({field:'title',value_text:'Alibaba: Upgrade',detail:{lang:'en'}}),
  ];
  tks.forEach((tk,i)=>rows.push(
   cand({field:'ticker',target_key:tk,value_text:tk.replace('.',' '),resolution:{method:'parseBrokerTicker/1',resolver:'resolveIssuer',today:'2026-03-10',issuer_securities_row:{issuer_id:issuers[i],ticker:tk,valid_from:'2000-01-01',valid_to:null}}}),
   cand({field:'rating',target_key:tk,value_text:'Buy'}),
   cand({field:'target_price',target_key:tk,value_text:o.prices?.target_price??'120',value_num:o.prices?.target_price??'120',value_unit:'price'}),
   cand({field:'target_currency',target_key:tk,value_text:o.prices?.target_currency??'HK$',value_currency:o.prices?.target_currency??'HKD'}),
   cand({field:'price_at_report',target_key:tk,value_text:o.prices?.price_at_report??'100',value_num:o.prices?.price_at_report??'100',value_unit:'price'}),
   cand({field:'price_currency',target_key:tk,value_text:o.prices?.price_currency??'HKD',value_currency:o.prices?.price_currency??'HKD'}),
   cand({field:'price_as_of_date',target_key:tk,value_text:'4 Mar 2026',value_date:'2026-03-04'}),
   ...(o.extra?.(tk)??[])));
  const receipt=await commit(doc,token,ext,o.ratingOnly?rows.filter(row=>!['price_at_report','price_currency','target_currency'].includes(row.field as string)):rows);
  return {tk:tks[0],tks,iss:issuers[0],issuers,lic,doc,pr,rep,ext,token,digest,inst:o.inst??await s.institution(),receipt};
 };
 type World=Awaited<ReturnType<typeof world>>;
 const rules=async(rep:string,results?:unknown[])=>{
  const r=await report(rep);
  const surfaces=['title_original','title_public','title_zh','title_en'].filter(k=>r[k]!==null);
  const def=surfaces.map(surface=>({rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface,hits:[]}}));
  return await s.one(`insert into public.broker_report_rule_receipts(report_id,rules_version,input_hash,results,code_version) values($1,$2,$3,$4::jsonb,'test') returning receipt_id as v`,[rep,RULES_VERSION,r.rules_input_hash,J(results??def)]) as string;
 };
 const allFields=['institution','published_date','title',...TARGET_FIELDS];
 const gold=async(digest:string,o:{passed?:boolean;perField?:Record<string,unknown>;nDocs?:number;kind?:string}={})=>{
  await s.q(`update public.broker_research_settings set approved_gold_corpus_hash=$1 where id=1`,[GOLD]);
  const pf=o.perField??Object.fromEntries(allFields.map(f=>[f,{tp:5,fp:0,fn:0,precision:1,recall:1}]));
  const ok=o.passed??true;
  await s.q(`insert into public.broker_eval_receipts(corpus_kind,corpus_hash,behavior_digest,extractor_version,model_id,registry_hash,prompt_version,schema_version,code_version,n_docs,per_field,absence,precision_min,recall_min,passed,ran_by,ran_at) values($1,$2,$3,'f3/1','m-test','r','p','s','t',$4,$5::jsonb,'{"tp":0,"fp":0,"fn":0}',$6,$6,$7,gen_random_uuid(),clock_timestamp())`,[o.kind??'gold',GOLD,digest,o.nDocs??30,J(pf),ok?1:0.5,ok]);
 };
 /** A newer matching gold receipt that also covers `extra` fields (e.g. 'analyst' once a fixture adds a human analyst row):
  * blocker 13 covers every effective field of a gated report (P-R1-12), so readiness fixtures must cover what they add (P-R3-03). */
 const goldCovering=(digest:string,extra:string[])=>gold(digest,{perField:Object.fromEntries([...allFields,...extra].map(f=>[f,{tp:5,fp:0,fn:0,precision:1,recall:1}]))});
 /** world → every candidate confirmed, institution/scope bound, scale row, rules receipt, review approved, gold receipt: blockers []. */
 const ready=async(o:Parameters<typeof world>[0]={}):Promise<World>=>{
  const w=await world(o);
  for(const f of await s.q(`select field_id,field from public.broker_report_fields where report_id=$1 and status in ('extracted','unverified') and superseded_by_run_id is null`,[w.rep]))await review(f.field_id,o.ratingOnly&&f.field==='target_price'?'absent':'confirm',o.ratingOnly&&f.field==='target_price'?{page:1}:{});
  await s.q(`update public.broker_research_reports set institution_id=$2,scope=$3,review_status='approved' where report_id=$1`,[w.rep,w.inst,w.tks.length>1?'multi_issuer':'single_issuer']);
  await s.q(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'Buy','buy','https://example.test/scale','2020-01-01',gen_random_uuid()) on conflict (institution_id, lower(btrim(raw_label)), valid_from) do nothing`,[w.inst]);
  await materialize(w.rep);await rules(w.rep);await gold(w.digest);
  expect(await blockers(w.rep)).toEqual([]);
  return w;
 };


describe.skipIf(!enabled)('A2 broker research SQL functions and function-backed triggers',()=>{
 let unlock:(()=>Promise<void>)|undefined;
 beforeAll(async()=>{bind();unlock=await lockSettings(pool);},60000);        // gold() sets approved_gold_corpus_hash
 afterAll(async()=>{await unlock?.();await pool?.end();});
 it('publication and child writes serialize on the report row lock: the child write waits, then fails published_immutable (P-R1-03)',async()=>{
  const PASSJ=J({version:DISCLOSURE_VERSION,inputs_hash:sha('i'),passed:true,hits:[]});
  const cases:{name:string;sql:(w:World,sn:string)=>[string,unknown[]]}[]=[
   {name:'insert snippet',sql:(w)=>[`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,created_by) values($1,'risk',$2,1,0,4,'text',gen_random_uuid())`,[w.rep,w.pr]]},
   {name:'approve snippet',sql:(_w,sn)=>[`update public.broker_report_snippets set status='approved',approved_by=gen_random_uuid(),approved_at=now(),disclosure_check=$2::jsonb where snippet_id=$1`,[sn,PASSJ]]},
   {name:'update field',sql:(w)=>[`update public.broker_report_fields set reviewed_at=now() where report_id=$1 and field='title' and status='confirmed'`,[w.rep]]},
  ];
  for(const c of cases){
   const w=await ready();
   const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,created_by) values($1,'thesis',$2,1,0,4,'text',gen_random_uuid()) returning snippet_id as v`,[w.rep,w.pr]) as string;
   const counts=()=>s.q(`select (select count(*)::int from public.broker_report_snippets where report_id=$1) n_snip,(select count(*)::int from public.broker_report_fields where report_id=$1 and status in ('confirmed','corrected','absent')) n_eff`,[w.rep]);
   const before=await counts();
   const a=await pool.connect(),b=await pool.connect();
   try{
    await a.query('begin');
    const pub=(await a.query(`select public.broker_report_publish($1,gen_random_uuid()) v`,[w.rep])).rows[0].v as string;   // holds the report row lock
    const bpid=(await b.query('select pg_backend_pid() p')).rows[0].p;
    const [sql,args]=c.sql(w,sn);
    const pending=b.query(sql,args).then(()=>'committed',(e:Error)=>e.message);
    await new Promise(r=>setTimeout(r,300));
    expect({c:c.name,waiting:(await s.q(`select wait_event_type from pg_stat_activity where pid=$1`,[bpid]))[0].wait_event_type}).toEqual({c:c.name,waiting:'Lock'});
    await a.query('commit');
    expect({c:c.name,r:await pending}).toEqual({c:c.name,r:expect.stringMatching(/^published_immutable:/)});
    const snap=(await s.q(`select jsonb_array_length(snapshot->'fields') n from public.broker_report_publications where publication_id=$1`,[pub]))[0].n;
    expect(await counts()).toEqual(before);expect(snap).toBe(before[0].n_eff);
   }finally{await a.query('rollback').catch(()=>{});a.release();b.release();}
  }
 },120000);

 it('blocker 13 coverage: once a report has an LLM row, every effective field needs coverage — a human wacc row uncovered blocks (P-R1-12)',async()=>{
  const w=await ready();
  await add(w.rep,{target_key:null,field:'wacc',occurrence:1,value_text:'8.5%',value_num:'0.085',value_currency:null,value_unit:'pct',value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',parse_run_id:w.pr,status:'confirmed'});
  await rules(w.rep);
  expect(await blockers(w.rep)).toEqual(['eval_receipt_missing']);                            // LLM title etc. covered, human wacc not
  await gold(w.digest,{perField:Object.fromEntries([...allFields,'wacc'].map(f=>[f,{tp:5,fp:0,fn:0,precision:1,recall:1}]))});
  expect(await blockers(w.rep)).toEqual([]);
 });

 it('blocker 13 coverage includes absent fields: an uncovered absent(target_horizon) blocks (P-R1-12, round 2)',async()=>{
  const w=await ready();
  await add(w.rep,{target_key:w.tk,field:'target_horizon',occurrence:1,value_text:'ABSENT',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:null,char_end:null,value_source_text:null,parse_run_id:w.pr,status:'absent'});
  await rules(w.rep);
  expect(await blockers(w.rep)).toEqual(['eval_receipt_missing']);
  await gold(w.digest,{perField:Object.fromEntries([...allFields,'target_horizon'].map(f=>[f,{tp:5,fp:0,fn:0,precision:1,recall:1}]))});
  expect(await blockers(w.rep)).toEqual([]);
 });

 it('spec §14 sample 7 (second half): a report whose effective rows are all human publishes with no gold receipt and approved_gold_corpus_hash null',async()=>{
  const lic=await s.licence();const doc=await s.document(lic,{uploadedAt:'2026-03-10T00:00:00Z'});const pr=await s.parsed(doc);const rep=await s.report(doc);const inst=await s.institution();
  const row=(field:string,value_text:string,extra:Record<string,unknown>={})=>({target_key:null,field,occurrence:1,value_text,value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',parse_run_id:pr,status:'confirmed',...extra});
  for(const r of [row('institution','Test Securities'),row('published_date','2026-03-05',{value_date:'2026-03-05'}),row('title','Sector outlook'),row('sector','Internet')])await add(rep,r);
  await s.q(`update public.broker_research_reports set institution_id=$2,scope='sector',review_status='approved' where report_id=$1`,[rep,inst]);
  await materialize(rep);await rules(rep);
  await s.q(`update public.broker_research_settings set approved_gold_corpus_hash=null where id=1`);
  expect((await s.q(`select count(*)::int n from public.broker_report_fields where report_id=$1 and extractor like 'llm:%'`,[rep]))[0].n).toBe(0);
  expect(await blockers(rep)).toEqual([]);                                                    // no eval_receipt_missing
  const pub=await publish(rep);expect(pub).toMatch(/^[0-9a-f-]{36}$/);
  expect((await report(rep)).status).toBe('published');
 });

 it('disclosure re-check (spec §4.11 重跑规则): licence / analyst disclosure change → disclosure_ok=false → re-check restores → republish (P-R1-08)',async()=>{
  const titles=async(rep:string)=>{const r=await report(rep);return Object.fromEntries(['title_original','title_public','title_zh','title_en'].filter(k=>r[k]!==null).map(k=>[k,PASS]));};
  const digest=(rep:string)=>s.one(`select public.broker_report_disclosure_digest($1) v`,[rep]);
  const recheck=async(rep:string,o:Record<string,unknown>={})=>s.one(`select public.broker_report_disclosure_recheck($1,gen_random_uuid(),$2::jsonb) v`,[rep,J({expected_digest:await digest(rep),titles:await titles(rep),snippets:{},summaries:{},...o})]);
  const p=await ready();await publish(p.rep);
  await s.q(`update public.broker_report_licences set allows_public_target_price=false where licence_id=$1`,[p.lic]);
  expect((await report(p.rep)).disclosure_ok).toBe(false);
  expect((await fails(s.one(`select public.broker_report_disclosure_recheck($1,gen_random_uuid(),$2::jsonb) v`,[p.rep,J({expected_digest:sha('stale'),titles:{},snippets:{},summaries:{}})])))).toMatchObject({message:'disclosure_inputs_changed'});
  expect(await recheck(p.rep,{titles:{...(await titles(p.rep)),title_original:{...PASS,passed:false}}})).toEqual({restored:false,failures:['restricted_value_in_text:title_original']});
  expect((await report(p.rep)).disclosure_ok).toBe(false);
  expect(await recheck(p.rep)).toEqual({restored:true,failures:[]});                       // published report: k_live allows the flag
  expect((await report(p.rep)).disclosure_ok).toBe(true);
  // republish under the new licence version
  await unpublish(p.rep);
  await s.q(`update public.broker_report_licences set confirmed_by=gen_random_uuid(),confirmed_at=now(),confirmed_version=version where licence_id=$1`,[p.lic]);
  await materialize(p.rep);await rules(p.rep);await s.q(`update public.broker_research_reports set review_status='approved' where report_id=$1`,[p.rep]);
  expect(await blockers(p.rep)).toEqual([]);
  expect(await publish(p.rep)).toMatch(/^[0-9a-f-]{36}$/);
  // analyst disclosure change on a draft → disclosure_stale → re-check restores
  const q=await ready();
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name) values($1,'Rae Analyst') returning analyst_id as v`,[q.inst]) as string;
  const af=(await add(q.rep,{target_key:null,field:'analyst',occurrence:1,value_text:'Rae Analyst',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',parse_run_id:q.pr,status:'confirmed'})).field_id;
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[q.rep,an,af]);
  await materialize(q.rep);await rules(q.rep);await goldCovering(q.digest,['analyst']);         // P-R3-03
  await s.q(`update public.research_analysts set public_display=true where analyst_id=$1`,[an]);
  expect((await report(q.rep)).disclosure_ok).toBe(false);
  await materialize(q.rep);await rules(q.rep);
  expect(await blockers(q.rep)).toEqual(['disclosure_stale']);
  expect(await recheck(q.rep)).toEqual({restored:true,failures:[]});
  expect(await blockers(q.rep)).toEqual([]);
 },120000);

 it('function grants: module RPCs are service_role only, internal helpers no client role; migration replays',async()=>{
  const fn=(role:string,sig:string)=>s.one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  const fnOid=(role:string,oid:number)=>s.one(`select has_function_privilege($1::name,$2::int::oid,'EXECUTE') v`,[role,oid]);   // inventory: by OID (P-R4-01)
  const rpcs=['public.broker_document_withdraw(uuid,text,boolean,uuid)','public.broker_field_effective(jsonb,text,numeric,text,text,date)','public.broker_report_materialize(uuid)','public.broker_field_review(uuid,text,jsonb,uuid)','public.broker_field_add(uuid,jsonb,uuid)','public.broker_target_override(uuid,text,text,uuid,uuid,text)','public.broker_extract_commit(uuid,uuid,uuid,jsonb)','public.broker_report_publish_blockers(uuid)','public.broker_report_publish(uuid,uuid)','public.broker_report_unpublish(uuid,uuid,text)','public.broker_quarantine_resolve(uuid,text,uuid,jsonb)','public.broker_document_claim_lease(uuid,uuid,integer)','public.broker_document_fenced_update(uuid,uuid,jsonb,boolean)','public.broker_run_finish(uuid,uuid,jsonb)','public.broker_outbox_mark(uuid,boolean,text)','public.broker_purge_step_record(uuid,text,boolean,text)','public.broker_report_disclosure_digest(uuid)','public.broker_report_disclosure_recheck(uuid,uuid,jsonb)','public.broker_summary_commit(uuid,uuid,uuid,jsonb)','public.broker_title_commit(uuid,uuid,uuid,jsonb)'];
  for(const sig of rpcs){for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});}
  for(const sig of ['public.broker_sha256(text)','public.broker_lock_draft(uuid)','public.broker_report_picks(uuid)','public.broker_report_effective_rows(uuid)','public.broker_report_live_digests(uuid)','public.broker_outbox_retract(uuid,text)','public.broker_llm_fence(uuid,uuid,uuid,text)']){
   for(const role of ['anon','authenticated','service_role'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
  }
  // every migration-owned function, trigger functions included (P-R1-05): no client role holds EXECUTE
  // qualified names built from catalog columns (regprocedure::text drops 'public.' when public is on the search path; P-R3-02)
  const all=await s.q(`select p.oid::int oid, format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'broker\\_%' order by 2`);
  expect(all.length).toBeGreaterThanOrEqual(40);
  for(const {sig,oid} of all)for(const role of ['public','anon','authenticated'])
   expect({sig,role,ok:role==='public'?await s.one(`select exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=$1::int::oid and a.grantee=0 and a.privilege_type='EXECUTE') v`,[oid]):await fnOid(role,Number(oid))}).toEqual({sig,role,ok:false});   // sig is diagnostic output only
  const oids=new Set(all.map(r=>Number(r.oid)));
  for(const trig of ['public.broker_licences_version()','public.broker_report_child_guard()','public.broker_snippets_approval()','public.broker_reports_after_change()'])
   expect({trig,inInventory:oids.has(Number(await s.one(`select $1::regprocedure::oid::int v`,[trig])))}).toEqual({trig,inInventory:true});   // compared by OID, never by display text
  await expect(replayMigration(pool,readFileSync(M2,'utf8'))).resolves.toBeUndefined();
 },60000);

 it('broker_field_effective: a present corrected key wins (explicit null clears), a missing key inherits',async()=>{
  const v=await s.one(`select public.broker_field_effective('{"value_text":"121","value_currency":null}'::jsonb,'120',120.50,'HKD','price','2026-01-01') v`);
  expect(v).toEqual({value_text:'121',value_num:'120.50',value_currency:null,value_unit:'price',value_date:'2026-01-01'});
  expect(await s.one(`select public.broker_field_effective(null,'x',null,null,null,null) v`)).toEqual({value_text:'x',value_num:null,value_currency:null,value_unit:null,value_date:null});
 });

 it('extract_commit: rejects an older parse run without inserting field rows (A2-08)',async()=>{
  const doc=await s.document(await s.licence());
  const olderParse=await s.parsed(doc);
  const currentParse=await s.parsed(doc);
  const rep=await s.report(doc);
  const ext=await s.extractRun(doc,olderParse);
  const token=await lease(doc);
  expect(currentParse).not.toBe(olderParse);
  expect(await s.one(`select current_parse_run_id v from public.broker_report_documents where document_id=$1`,[doc])).toBe(currentParse);
  expect(await s.one(`select count(*)::int v from public.broker_report_fields where report_id=$1`,[rep])).toBe(0);
  expect(await fails(commit(doc,token,ext,[cand({field:'title',value_text:'Stale title'})]))).toMatchObject({message:'stale_parse_run'});
  expect(await s.one(`select count(*)::int v from public.broker_report_fields where report_id=$1`,[rep])).toBe(0);
 });

 it('extract_commit: lease fence, row validation, supersedes earlier candidates, keeps resolution, candidate-basis materialize',async()=>{
  const w=await world();
  expect(w.receipt).toMatchObject({targets:1,basis:'candidate'});
  expect(w.receipt.effectiveHash).toMatch(/^[0-9a-f]{64}$/);expect(w.receipt.materializedHash).toBe(w.receipt.effectiveHash);
  const [t]=await targets(w.rep);
  expect(t).toMatchObject({target_key:w.tk,basis:'candidate',security_ticker:w.tk,issuer_id:w.iss,rating_raw:'Buy',tp:'120',target_currency:'HKD',pr:'100',price_currency:'HKD',pd:'2026-03-04',up:'0.200000',upside_formula_version:UPSIDE_FORMULA_VERSION});
  expect((await report(w.rep))).toMatchObject({title_original:'Alibaba: Upgrade',title_lang:'en',published_date:'2026-03-05',price_as_of_date:'2026-03-04'});
  const ext2=await s.extractRun(w.doc,w.pr,w.digest);
  expect((await fails(commit(w.doc,randomUUID(),ext2,[])))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect((await fails(commit(w.doc,w.token,ext2,[cand({field:'title',value_text:'x',status:'confirmed'})])))).toMatchObject({message:'invalid_rows:status'});
  expect((await fails(s.one(`select public.broker_extract_commit($1,$2,$3,'{}'::jsonb) v`,[w.doc,w.token,ext2])))).toMatchObject({message:'invalid_rows'});
  expect((await fails(commit(w.doc,w.token,w.pr,[])))).toMatchObject({message:'run_invalid'});
  const before=(await s.q(`select count(*)::int n from public.broker_report_fields where report_id=$1`,[w.rep]))[0].n;
  await commit(w.doc,w.token,ext2,[cand({field:'title',value_text:'Alibaba: Upgrade (2)'})]);
  expect((await s.q(`select count(*)::int n from public.broker_report_fields where report_id=$1`,[w.rep]))[0].n).toBe(before+1);       // nothing deleted
  expect((await s.q(`select count(*)::int n from public.broker_report_fields where report_id=$1 and superseded_by_run_id=$2`,[w.rep,ext2]))[0].n).toBe(before);
  expect((await report(w.rep)).title_original).toBe('Alibaba: Upgrade (2)');
  expect(await targets(w.rep)).toEqual([]);                                                  // the old ticker candidate is superseded
  await s.q(`update public.broker_report_documents set lease_until=now()-interval '1 second' where document_id=$1`,[w.doc]);
  expect((await fails(commit(w.doc,w.token,ext2,[])))).toMatchObject({message:'lease_lost'});        // token equal but expired
 });

 it('materialize: effective basis only when every required field is effective; upside rules; absent target price; exact-one scale; summaries invalidated only by a digest change',async()=>{
  const w=await world();
  for(const f of TARGET_FIELDS.filter(f=>f!=='price_as_of_date'))await review((await live(w.rep,f,w.tk))[0].field_id,'confirm');
  expect((await targets(w.rep))[0].basis).toBe('candidate');
  const r=await review((await live(w.rep,'price_as_of_date',w.tk))[0].field_id,'confirm');
  expect(r).toMatchObject({targets:1,basis:'effective'});
  await s.q(`update public.broker_research_reports set institution_id=$2 where report_id=$1`,[w.rep,w.inst]);
  await s.q(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'BUY','buy','https://example.test/s','2020-01-01',gen_random_uuid())`,[w.inst]);
  await materialize(w.rep);
  expect((await targets(w.rep))[0]).toMatchObject({rating_normalized:'buy'});
  const rt=(await s.q(`select field_id from public.broker_report_fields where report_id=$1 and field='rating' and status='confirmed'`,[w.rep]))[0].field_id;
  await review(rt,'correct',{value_text:' Buy '});                                             // key = lower(btrim(label)), same as rules.ts ratingKey
  expect((await targets(w.rep))[0]).toMatchObject({rating_raw:' Buy ',rating_normalized:'buy'});
  await review(rt,'correct',{value_text:'Buy'});
  await s.q(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'buy','overweight','https://example.test/s','2026-01-01',gen_random_uuid())`,[w.inst]);
  await materialize(w.rep);
  expect((await targets(w.rep))[0]).toMatchObject({rating_normalized:null,scale_id:null});     // two rows valid on 2026-03-05 → none chosen
  // correct the price currency to USD → no upside
  const pc=(await s.q(`select field_id from public.broker_report_fields where report_id=$1 and field='price_currency' and status='confirmed'`,[w.rep]))[0].field_id;
  await review(pc,'correct',{value_text:'USD',value_currency:'USD'});
  expect((await targets(w.rep))[0]).toMatchObject({price_currency:'USD',up:null,upside_formula_version:null});
  await review(pc,'correct',{value_text:'HKD',value_currency:'HKD'});
  const tp=(await s.q(`select field_id from public.broker_report_fields where report_id=$1 and field='target_price' and status='confirmed'`,[w.rep]))[0].field_id;
  await review(tp,'correct',{value_text:'133.335',value_num:'133.335'});
  expect((await targets(w.rep))[0].up).toBe('0.333350');
  await review(tp,'correct',{value_text:'99.99995',value_num:'99.99995'});
  expect((await targets(w.rep))[0].up).toBe('-0.000001');                                     // round half away from zero at 6 places
  await review(tp,'absent',{page:1});
  expect((await targets(w.rep))[0]).toMatchObject({basis:'effective',tp:null,up:null});
  // summary invalidation: a materialize that changes nothing keeps an approved summary approved
  const d=(await report(w.rep)).summary_input_digest;
  const su=await s.one(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check,status,approved_by) values($1,'en',$2,$3,'Summary',1,'{"passed":true}',$4,'approved',gen_random_uuid()) returning summary_id as v`,[w.rep,w.ext,d,J(PASS)]);
  await materialize(w.rep);
  expect(await s.one(`select status v from public.broker_report_summaries where summary_id=$1`,[su])).toBe('approved');
  await review((await s.q(`select field_id from public.broker_report_fields where report_id=$1 and field='title' and status in ('extracted','unverified')`,[w.rep]))[0].field_id,'confirm');
  expect((await s.q(`select status,draft_reason from public.broker_report_summaries where summary_id=$1`,[su]))[0]).toEqual({status:'draft',draft_reason:'summary_stale'});
 });

 it('field_review: identity siblings rejected on confirm, typed corrections with span, invalid payload rolls back, effective_exists, absent action, published_immutable',async()=>{
  const w=await world({extra:tk=>[cand({field:'rating',target_key:tk,value_text:'Overweight',conflict_group:'g1'})]});
  const ratings=await s.q(`select field_id,value_text from public.broker_report_fields where report_id=$1 and field='rating' order by value_text`,[w.rep]);
  expect(ratings.map(r=>r.value_text)).toEqual(['Buy','Overweight']);
  expect((await targets(w.rep))[0].rating_raw).toBeNull();                                    // conflicting candidates: none chosen
  expect((await fails(review(ratings[1].field_id,'confirm',{detail:'x'})))).toMatchObject({message:'invalid_payload:detail'});
  await review(ratings[1].field_id,'confirm',{detail:{framed:true}});
  expect((await s.q(`select status,detail->>'framed' fr from public.broker_report_fields where field_id=$1`,[ratings[1].field_id]))[0]).toEqual({status:'confirmed',fr:'true'});   // payload.detail merged
  expect((await s.q(`select status from public.broker_report_fields where field_id=$1`,[ratings[0].field_id]))[0].status).toBe('rejected');
  expect((await targets(w.rep))[0].rating_raw).toBe('Overweight');
  const title=(await live(w.rep,'title'))[0].field_id;
  const snap=async()=>(await s.q(`select status,corrected,page,char_start from public.broker_report_fields where field_id=$1`,[title]))[0];
  const was=await snap();
  expect((await fails(review(title,'correct',{value_text:'X',value_date:'2026-02-30'})))).toMatchObject({message:'invalid_payload:value_date'});
  expect((await fails(review(title,'correct',{value_text:'X',char_start:3})))).toMatchObject({message:'invalid_payload:span'});
  expect((await fails(review(title,'correct',{value_num:'1'})))).toMatchObject({message:'invalid_payload:corrected'});
  expect((await fails(review(title,'shout')))).toMatchObject({message:'invalid_action:shout'});
  expect(await snap()).toEqual(was);                                                           // atomic: nothing changed
  await review(title,'correct',{value_text:'Alibaba: Upgrade to Buy',value_num:null,page:2,char_start:10,char_end:33,value_source_text:'Alibaba: Upgrade to Buy'});
  expect(await snap()).toEqual({status:'corrected',corrected:{value_text:'Alibaba: Upgrade to Buy',value_num:null},page:2,char_start:10});
  expect((await report(w.rep)).title_original).toBe('Alibaba: Upgrade to Buy');
  expect((await fails(add(w.rep,{target_key:null,field:'title',occurrence:1,value_text:'T',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:1,value_source_text:'T',parse_run_id:w.pr,status:'confirmed'})))).toMatchObject({message:'effective_exists'});
  const tp=(await live(w.rep,'target_price',w.tk))[0].field_id;
  expect((await fails(review((await live(w.rep,'institution'))[0].field_id,'absent',{page:1})))).toMatchObject({message:'absent_not_allowed:institution'});
  await review(tp,'absent',{page:3});
  const rows=await s.q(`select status,value_text,page,extractor from public.broker_report_fields where report_id=$1 and field='target_price' order by created_at`,[w.rep]);
  expect(rows.map(r=>r.status)).toEqual(['rejected','absent']);expect(rows[1]).toMatchObject({value_text:'ABSENT',page:3});expect(rows[1].extractor).toMatch(/^human:/);
  expect((await fails(review(randomUUID(),'confirm')))).toMatchObject({message:'field_not_found'});
  const p=await ready();
  expect((await fails(publish(p.rep).then(async()=>review((await s.q(`select field_id from public.broker_report_fields where report_id=$1 limit 1`,[p.rep]))[0].field_id,'reject'))))).toMatchObject({message:'published_immutable'});
 });

 it('field_add and target_override: human rows and resolution overrides go through the same lock + materialize',async()=>{
  const w=await world();
  const out=await add(w.rep,{target_key:null,field:'sector',occurrence:1,value_text:'Internet',value_num:null,value_currency:null,value_unit:null,value_date:null,page:2,char_start:0,char_end:8,value_source_text:'Internet',parse_run_id:w.pr,status:'confirmed'});
  expect(out.field_id).toMatch(/^[0-9a-f-]{36}$/);expect(out.receipt).toMatchObject({targets:1});
  expect((await report(w.rep)).sector_as_stated).toBe('Internet');
  expect((await fails(add(w.rep,{target_key:null,field:'sector',occurrence:2,value_text:'x',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:1,value_source_text:'x',parse_run_id:randomUUID(),status:'confirmed'})))).toMatchObject({message:'invalid_payload:parse_run_id'});
  expect((await fails(add(w.rep,{target_key:null,field:'sector',occurrence:2,value_text:'x',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:1,value_source_text:'x',parse_run_id:w.pr,status:'extracted'})))).toMatchObject({message:'invalid_payload:status'});
  await s.stock('BABA','US');const other=await s.issuer();
  const rc=await s.one(`select public.broker_target_override($1,$2,'BABA',$3,$4,'manual') v`,[w.rep,w.tk,other,randomUUID()]);
  expect(rc).toMatchObject({targets:1});
  const [t]=await targets(w.rep);expect(t).toMatchObject({security_ticker:'BABA',issuer_id:other});
  expect((await s.q(`select resolution from public.broker_report_targets where report_id=$1`,[w.rep]))[0].resolution.override_id).toMatch(/^[0-9a-f-]{36}$/);
  await s.one(`select public.broker_target_override($1,$2,$3,$4,$5,null) v`,[w.rep,w.tk,w.tk,w.iss,randomUUID()]);     // idempotent upsert on (report, target_key)
  expect((await s.q(`select count(*)::int n from public.broker_report_target_overrides where report_id=$1`,[w.rep]))[0].n).toBe(1);
 });

 it('publish_blockers: a fresh extraction lists the expected reasons in spec order',async()=>{
  const w=await world();
  expect(await blockers(w.rep)).toEqual(['review_not_approved','report_incomplete:scope','report_incomplete:institution_id',
   'required_field_missing:institution','required_field_missing:published_date','required_field_missing:title',
   'field_pending:institution','field_pending:published_date','field_pending:title','rules_stale','restricted_value_in_text:title_original']);
 });

 it('publish_blockers: every reason flips on and off against a ready report',async()=>{
  const w=await ready();const R=w.rep;const set=(sql:string,v:unknown[]=[])=>s.q(`update public.broker_research_reports set ${sql} where report_id=$1`,[R,...v]);
  await set(`review_status='in_review'`);expect(await blockers(R)).toEqual(['review_not_approved']);await set(`review_status='approved'`);
  await s.q(`update public.broker_report_documents set status='parsing' where document_id=$1`,[w.doc]);expect(await blockers(R)).toEqual(['document_not_parsed']);
  await s.q(`update public.broker_report_documents set status='parsed' where document_id=$1`,[w.doc]);
  const b=await batch();const qid=randomUUID();const docSha=(await s.q(`select sha256 from public.broker_report_documents where document_id=$1`,[w.doc]))[0].sha256;
  await s.q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'broker_research','broker_research_reports',$2,'upside_mismatch',$3,'{}')`,[qid,`${docSha}:upside_identity:${w.tk}`,b]);
  await s.q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values(gen_random_uuid(),'broker_research','broker_research_reports',$1,'possible_version',$2,'{}')`,[`${docSha}:possible_version:-`,b]);
  expect(await blockers(R)).toEqual(['quarantine_open:upside_mismatch']);                     // possible_version is not blocking
  expect(await s.one(`select public.broker_quarantine_resolve($1,'resolved_accept',$2,'{}'::jsonb) v`,[qid,randomUUID()])).toBe('resolved');
  expect(await blockers(R)).toEqual([]);
  await set(`title_public='Alibaba: rewritten',title_public_by=gen_random_uuid()`);
  expect(await blockers(R)).toEqual(['materialize_stale','restricted_value_in_text:title_public']);
  await materialize(R);expect(await blockers(R)).toEqual(['rules_stale','restricted_value_in_text:title_public']);
  await rules(R);expect(await blockers(R)).toEqual([]);
  await rules(R,[{rule:'R2',passed:false,blocking:true,target_key:w.tk,reason_code:'upside_mismatch',detail:{}},{rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface:'title_original'}},{rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface:'title_public'}}]);
  expect(await blockers(R)).toEqual(['rules_stale']);
  await rules(R);expect(await blockers(R)).toEqual([]);                                       // newest matching receipt wins
  await gold(w.digest,{passed:false});expect(await blockers(R)).toEqual(['eval_receipt_missing']);
  await gold(w.digest,{perField:{title:{tp:1,fp:0,fn:0}}});expect(await blockers(R)).toEqual(['eval_receipt_missing']);   // a report field without coverage
  await gold(w.digest,{kind:'synthetic'});expect(await blockers(R)).toEqual(['eval_receipt_missing']);
  await gold(w.digest,{nDocs:29});expect(await blockers(R)).toEqual(['eval_receipt_missing']);
  await gold(w.digest);expect(await blockers(R)).toEqual([]);
  await s.q(`update public.broker_research_settings set approved_gold_corpus_hash=null where id=1`);expect(await blockers(R)).toEqual(['eval_receipt_missing']);
  await gold(w.digest);
  const dg=(await report(R)).summary_input_digest;
  await s.q(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check,status,approved_by) values($1,'zh',$2,$3,'摘要',1,'{"passed":true}',$4,'approved',gen_random_uuid())`,[R,w.ext,dg,J(PASS)]);
  expect(await blockers(R)).toEqual([]);
  await set(`summary_input_digest=$2`,[sha('other')]);expect(await blockers(R)).toEqual(['materialize_stale','summary_stale']);
  await materialize(R);expect(await blockers(R)).toEqual([]);                                 // digest back to the live value: the summary stays approved
  await rules(R,[{rule:'disclosure',passed:false,blocking:false,target_key:null,reason_code:'restricted_value',detail:{surface:'title_original'}},{rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface:'title_public'}}]);
  expect(await blockers(R)).toEqual([]);                                                       // title_original fails but title_public replaces it
  await set(`title_public=null,title_public_by=null`);await materialize(R);
  await rules(R,[{rule:'disclosure',passed:false,blocking:false,target_key:null,reason_code:'restricted_value',detail:{surface:'title_original'}}]);
  expect(await blockers(R)).toEqual(['restricted_value_in_text:title_original']);
  await rules(R);
  await set(`evidence_ok=false`);expect(await blockers(R)).toEqual(['evidence_drift']);await set(`evidence_ok=true`);
  await set(`disclosure_ok=false`);expect(await blockers(R)).toEqual(['disclosure_stale']);await set(`disclosure_ok=true`);
  await s.q(`update public.broker_report_licences set allows_public_metadata=false where licence_id=$1`,[w.lic]);
  expect(await blockers(R)).toEqual(expect.arrayContaining(['licence_unconfirmed','licence_no_public_metadata','materialize_stale','disclosure_stale']));
  const w2=await ready();
  await s.q(`update public.broker_report_licences set valid_to='2021-01-01' where licence_id=$1`,[w2.lic]);
  await s.q(`update public.broker_report_licences set confirmed_by=gen_random_uuid(),confirmed_at=now(),confirmed_version=version where licence_id=$1`,[w2.lic]);
  expect(await blockers(w2.rep)).toContain('licence_unconfirmed');                             // confirmed but expired
 },120000);

 it('publish_blockers: conflicts, pending fields, unresolved targets, cardinality, scope-specific required fields',async()=>{
  const w=await world({extra:tk=>[cand({field:'rating',target_key:tk,value_text:'Hold',conflict_group:'g'})]});
  for(const f of await s.q(`select field_id,field from public.broker_report_fields where report_id=$1 and status in ('extracted','unverified') and field<>'rating'`,[w.rep]))await review(f.field_id,'confirm');
  await s.q(`update public.broker_research_reports set institution_id=$2,scope='single_issuer',review_status='approved' where report_id=$1`,[w.rep,w.inst]);
  await materialize(w.rep);await rules(w.rep);await gold(w.digest);
  expect(await blockers(w.rep)).toEqual([`required_field_missing:rating:${w.tk}`,'field_pending:rating',`target_unresolved:${w.tk}`,`conflict_unresolved:rating:${w.tk}`]);
  await s.q(`update public.broker_research_reports set scope='multi_issuer' where report_id=$1`,[w.rep]);await materialize(w.rep);await rules(w.rep);
  expect(await blockers(w.rep)).toContain('target_cardinality');
  await s.q(`update public.broker_research_reports set scope='sector' where report_id=$1`,[w.rep]);await materialize(w.rep);await rules(w.rep);
  expect(await blockers(w.rep)).toEqual(expect.arrayContaining(['required_field_missing:sector','target_cardinality']));
  const m=await ready({tickers:2});
  expect(await blockers(m.rep)).toEqual([]);                                                   // multi_issuer with two issuers
  const u=await world();
  await s.q(`update public.broker_report_fields set detail='{}' where report_id=$1 and field='ticker'`,[u.rep]);   // detail is mutable on drafts: the resolution snapshot is removed
  for(const f of await s.q(`select field_id from public.broker_report_fields where report_id=$1 and status in ('extracted','unverified')`,[u.rep]))await review(f.field_id,'confirm');
  await s.q(`update public.broker_research_reports set institution_id=$2,scope='single_issuer',review_status='approved' where report_id=$1`,[u.rep,u.inst]);
  await materialize(u.rep);await rules(u.rep);await gold(u.digest);
  expect(await blockers(u.rep)).toEqual(expect.arrayContaining([`target_unresolved:${u.tk}`,'target_cardinality']));
 },120000);

 it('publish: blocked publish raises publish_blocked:<reasons> and writes nothing; success writes an immutable snapshot hashed in SQL, flips status, registers one claim per target with a price',async()=>{
  const w=await world();
  const e=await fails(publish(w.rep));expect(e.message).toMatch(/^publish_blocked:review_not_approved,/);
  expect(await s.one(`select count(*)::int v from public.broker_report_publications where report_id=$1`,[w.rep])).toBe(0);
  const p=await ready({tickers:2});
  const tp=(await s.q(`select field_id from public.broker_report_fields where report_id=$1 and field='target_price' and target_key=$2 and status='confirmed'`,[p.rep,p.tks[1]]))[0].field_id;
  await review(tp,'absent',{page:1});await materialize(p.rep);await rules(p.rep);
  expect(await blockers(p.rep)).toEqual([]);
  const by=randomUUID();const pub=await publish(p.rep,by);
  const row=(await s.q(`select *,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') recomputed from public.broker_report_publications where publication_id=$1`,[pub]))[0];
  expect(row.snapshot_hash).toBe(row.recomputed);expect(row).toMatchObject({report_id:p.rep,revision:1,licence_version:1,published_by:by,unpublished_at:null});
  expect(row.rules_receipt_id).toMatch(/^[0-9a-f-]{36}$/);expect(row.eval_receipt_id).toMatch(/^[0-9a-f-]{36}$/);
  const snap=row.snapshot;
  expect(snap.report).toMatchObject({report_id:p.rep,status:'published',current_publication_id:pub,title_restricted:false});
  expect(snap.targets.map((t:{target_key:string})=>t.target_key)).toEqual([...p.tks].sort());
  expect(snap.targets.find((t:{target_key:string})=>t.target_key===p.tks[0])).toMatchObject({target_price:'120',price_at_report:'100',upside_pct:'0.200000'});
  expect(snap.targets.find((t:{target_key:string})=>t.target_key===p.tks[1]).target_price).toBeNull();
  expect(snap.fields.length).toBe((await s.q(`select 1 from public.broker_report_fields where report_id=$1 and status in ('confirmed','corrected','absent')`,[p.rep])).length);
  for(const k of ['field_id','field','target_key','occurrence','status','extractor','parse_run_id','run_id','artifact_hash','page','char_start','char_end','value_source_text','value_source_sha256','framed','extracted','value'])
   expect({k,has:snap.fields.every((f:Record<string,unknown>)=>k in f)}).toEqual({k,has:true});          // replay inputs frozen in the snapshot (P-R1-10)
  const tf=snap.fields.find((f:Record<string,unknown>)=>f.field==='title');
  expect(tf).toMatchObject({value_source_text:'text',value_source_sha256:sha('text'),framed:false});
  expect(snap.disclosure_inputs.licence).toMatchObject({licence_id:p.lic,version:1,allows_public_target_price:true});
  expect(snap.digests.rules_input_hash).toBe((await report(p.rep)).rules_input_hash);
  expect((await report(p.rep))).toMatchObject({status:'published',current_publication_id:pub});
  const regs=await outbox('claim.register',pub);
  expect(regs).toHaveLength(1);                                                                 // the absent-price target registers nothing
  const c=regs[0].payload;
  expect(c).toMatchObject({kind:'claim.register',claim_seq:1,claim_type:'broker_target_price',methodology_version:CLAIM_METHODOLOGY_VERSION,
   claim_key:`broker_target_price:${pub}:${p.tks[0]}`,subject:{security_ticker:p.tks[0],issuer_id:p.issuers[0],market:'HK',currency:'HKD'},claimant:{kind:'institution',id:p.inst},
   claim:{direction:1,target_price:'120',currency:'HKD',horizon_months:null,reference_price:'100',reference_currency:'HKD',reference_date:'2026-03-04'},
   stated_at:'2026-03-05',source:{report_id:p.rep,publication_id:pub,snapshot_hash:row.snapshot_hash},visibility_ref:{view:'broker_report_targets_public_v',report_id:p.rep,target_key:p.tks[0]}});
  expect(c.event_id).toBe((await s.q(`select event_id from public.broker_outbox where payload->>'claim_key'=$1`,[c.claim_key]))[0].event_id);
  expect((await fails(s.q(`update public.broker_report_publications set snapshot='{}' where publication_id=$1`,[pub]))).message).toMatch(/^append_only:/);
  expect((await fails(publish(p.rep)))).toMatchObject({message:'report_not_draft'});
  expect(await s.one(`select current_setting('broker.publishing',true) v`)).not.toBe(p.rep);
 },120000);

 it('publication snapshots and outbox preserve decimal amounts beyond JavaScript number precision',async()=>{
  const amount='12345678901234567890.123456789';
  const w=await ready({prices:{target_price:amount,price_at_report:'100',target_currency:'HKD',price_currency:'HKD'}});
  const pub=await publish(w.rep);
  const snap=await s.one(`select snapshot v from public.broker_report_publications where publication_id=$1`,[pub]);
  expect(snap.targets[0]).toMatchObject({target_price:amount,price_at_report:'100'});
  expect(typeof snap.targets[0].upside_pct).toBe('string');
  expect(snap.fields.find((f:{field:string})=>f.field==='target_price').value.value_num).toBe(amount);
  expect((await outbox('claim.register',pub))[0].payload.claim.target_price).toBe(amount);
 });

 it('publish with a restricted original title writes title_restricted=true; unpublish bumps revision, closes the snapshot once, reopens review, retracts once; republish is a new claim',async()=>{
  const w=await ready();
  await s.q(`update public.broker_research_reports set title_public='Rewritten title',title_public_by=gen_random_uuid() where report_id=$1`,[w.rep]);await materialize(w.rep);
  await rules(w.rep,[{rule:'disclosure',passed:false,blocking:false,target_key:null,reason_code:'restricted_value',detail:{surface:'title_original'}},{rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface:'title_public'}}]);
  const pub=await publish(w.rep);
  expect((await report(w.rep)).title_restricted).toBe(true);
  expect((await fails(s.q(`select public.broker_report_unpublish($1,$2,'')`,[w.rep,randomUUID()])))).toMatchObject({message:'reason_required'});
  await unpublish(w.rep,'owner asked');
  expect(await report(w.rep)).toMatchObject({status:'draft',revision:2,current_publication_id:null,review_status:'in_review'});
  expect((await s.q(`select unpublish_reason from public.broker_report_publications where publication_id=$1`,[pub]))[0].unpublish_reason).toBe('owner asked');
  const ret=await outbox('claim.retract',pub);
  expect(ret.map(x=>x.payload)).toEqual([expect.objectContaining({kind:'claim.retract',claim_seq:2,claim_key:`broker_target_price:${pub}:${w.tk}`,reason:'unpublish'})]);
  expect((await fails(unpublish(w.rep)))).toMatchObject({message:'report_not_published'});
  await s.q(`update public.broker_research_reports set review_status='approved' where report_id=$1`,[w.rep]);
  expect(await blockers(w.rep)).toEqual([]);
  const pub2=await publish(w.rep);expect(pub2).not.toBe(pub);
  expect((await s.q(`select revision from public.broker_report_publications where publication_id=$1`,[pub2]))[0].revision).toBe(2);
  expect(await outbox('claim.register',pub2)).toHaveLength(1);
 },120000);

 it('retract triggers: disclosure_ok/evidence_ok false on a published report retract once; document withdraw withdraws the report, closes the snapshot, keeps one retract',async()=>{
  const w=await ready();const pub=await publish(w.rep);
  await s.q(`update public.broker_research_reports set disclosure_ok=false where report_id=$1`,[w.rep]);
  expect((await outbox('claim.retract',pub)).map(x=>x.payload.reason)).toEqual(['disclosure_ok']);
  await s.q(`update public.broker_research_reports set disclosure_ok=true where report_id=$1`,[w.rep]);
  await s.q(`update public.broker_research_reports set evidence_ok=false where report_id=$1`,[w.rep]);
  expect(await outbox('claim.retract',pub)).toHaveLength(1);                                  // (claim_key, claim_seq) unique: one retract per claim
  await s.q(`update public.broker_report_documents set status='withdrawn',withdrawn_at=now(),withdrawn_reason='licence revoked' where document_id=$1`,[w.doc]);
  expect((await report(w.rep)).status).toBe('withdrawn');
  expect((await s.q(`select unpublish_reason from public.broker_report_publications where publication_id=$1`,[pub]))[0].unpublish_reason).toBe('withdrawn:licence revoked');
  expect(await outbox('claim.retract',pub)).toHaveLength(1);
  expect((await fails(materialize(w.rep)))).toMatchObject({message:'report_withdrawn'});
  const d=await ready();
  await s.q(`update public.broker_report_documents set status='withdrawn',withdrawn_at=now(),withdrawn_reason='dup' where document_id=$1`,[d.doc]);
  expect((await report(d.rep)).status).toBe('withdrawn');                                      // draft → withdrawn, no claim existed
 },120000);

 it('approval triggers: snippets need length <= N, a passed disclosure check and an approver; summaries also need overlap <= N, grounding and input_hash = digest',async()=>{
  const w=await world({licence:{snippet_max_chars:10}});
  const ins=(text:string,check:unknown=PASS)=>s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,disclosure_check,created_by) values($1,'thesis',$2,1,0,$3,$4,$5::jsonb,gen_random_uuid()) returning snippet_id as v`,[w.rep,w.pr,text.length,text,J(check)]) as Promise<string>;
  const approve=(id:string,by:string|null=randomUUID())=>s.q(`update public.broker_report_snippets set status='approved',approved_by=$2 where snippet_id=$1`,[id,by]);
  expect((await fails(approve(await ins('01234567890')))).message).toMatch(/^snippet_too_long:11/);
  expect((await fails(approve(await ins('short',{...PASS,passed:false})))).message).toMatch(/^disclosure_failed/);
  expect((await fails(approve(await ins('short',{...PASS,version:'disclosure/0'})))).message).toMatch(/^disclosure_failed/);
  expect((await fails(approve(await ins('short'),null))).message).toMatch(/^approver_required/);
  const ok=await ins('short');await approve(ok);
  expect(await s.one(`select approved_at is not null v from public.broker_report_snippets where snippet_id=$1`,[ok])).toBe(true);
  await s.q(`update public.broker_report_snippets set status='draft' where snippet_id=$1`,[ok]);
  expect((await s.q(`select approved_by,approved_at from public.broker_report_snippets where snippet_id=$1`,[ok]))[0]).toEqual({approved_by:null,approved_at:null});
  const dg=(await report(w.rep)).summary_input_digest;
  const sum=(o:Record<string,unknown>)=>s.one(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check) values($1,'en',$2,$3,'S',$4,$5::jsonb,$6::jsonb) returning summary_id as v`,[w.rep,w.ext,o.hash??dg,o.overlap??1,J(o.grounding??{passed:true}),J(o.check??PASS)]) as Promise<string>;
  const app=(id:string)=>s.q(`update public.broker_report_summaries set status='approved',approved_by=gen_random_uuid() where summary_id=$1`,[id]);
  expect((await fails(app(await sum({overlap:11})))).message).toMatch(/^summary_overlap:11/);
  expect((await fails(app(await sum({grounding:{passed:false}})))).message).toMatch(/^summary_ungrounded/);
  expect((await fails(app(await sum({check:{...PASS,passed:false}})))).message).toMatch(/^disclosure_failed/);
  expect((await fails(app(await sum({hash:sha('stale')})))).message).toMatch(/^summary_stale/);
  const a=await sum({});await app(a);
  expect((await fails(app(await sum({})))).code).toBe('23505');                               // one approved summary per (report, lang)
  expect(DISCLOSURE_VERSION).toBe('disclosure/1');
 });

 it('quarantine_resolve: already_resolved and not_found are results; hook_params_required rolls back; ticker override, rating scale, possible_version and reject hooks; published_immutable',async()=>{
  const w=await world();const b=await batch();const docSha=(await s.q(`select sha256 from public.broker_report_documents where document_id=$1`,[w.doc]))[0].sha256;
  const item=async(reason:string,payload:Record<string,unknown>={})=>{const id=randomUUID();await s.q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'broker_research','broker_research_reports',$2,$3,$4,$5::jsonb)`,[id,`${docSha}:${reason}:${w.tk}:${id}`,reason,b,J(payload)]);return id;};
  const resolve=(id:string,status:string,p:Record<string,unknown>={})=>s.one(`select public.broker_quarantine_resolve($1,$2,$3,$4::jsonb) v`,[id,status,randomUUID(),J(p)]);
  expect(await resolve(randomUUID(),'resolved_accept')).toBe('not_found');
  const t=await item('unresolved_ticker');
  expect((await fails(resolve(t,'resolved_accept',{target_key:w.tk})))).toMatchObject({message:'hook_params_required'});
  expect((await s.q(`select status from public.dq_quarantine where id=$1`,[t]))[0].status).toBe('open');      // rolled back
  await s.stock('9999.HK','HK');const iss2=await s.issuer();
  expect(await resolve(t,'resolved_accept',{target_key:w.tk,security_ticker:'9999.HK',issuer_id:iss2})).toBe('resolved');
  expect((await targets(w.rep))[0]).toMatchObject({security_ticker:'9999.HK',issuer_id:iss2});
  expect(await resolve(t,'resolved_accept',{target_key:w.tk,security_ticker:'9999.HK'})).toBe('already_resolved');
  expect((await s.q(`select status,resolved_by is not null r from public.dq_quarantine where id=$1`,[t]))[0]).toEqual({status:'resolved_accept',r:true});
  const sc=await item('unknown_rating_label',{rating_raw:'Buy'});
  expect((await fails(resolve(sc,'resolved_accept',{normalized:'buy',source_url:'https://example.test/s',valid_from:'2020-01-01'})))).toMatchObject({message:'hook_params_required'});   // no institution bound yet
  await s.q(`update public.broker_research_reports set institution_id=$2 where report_id=$1`,[w.rep,w.inst]);
  expect(await resolve(sc,'resolved_accept',{normalized:'buy',source_url:'https://example.test/s',valid_from:'2020-01-01'})).toBe('resolved');
  expect((await targets(w.rep))[0].rating_normalized).toBe('buy');
  const prev=await world();
  const pv=await item('possible_version');
  expect(await resolve(pv,'resolved_accept',{supersedes_report_id:prev.rep})).toBe('resolved');
  expect((await report(w.rep)).supersedes_report_id).toBe(prev.rep);
  expect(await resolve(await item('date_order'),'resolved_reject')).toBe('resolved');
  expect((await report(w.rep)).review_status).toBe('rejected');
  expect((await fails(resolve(await item('upside_mismatch'),'resolved_maybe')))).toMatchObject({message:'invalid_status'});
  const p=await ready();await publish(p.rep);
  const pSha=(await s.q(`select sha256 from public.broker_report_documents where document_id=$1`,[p.doc]))[0].sha256;
  const pid=randomUUID();await s.q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'broker_research','broker_research_reports',$2,'span_drift',$3,'{}')`,[pid,`${pSha}:span_verbatim:-`,b]);
  expect((await fails(resolve(pid,'resolved_accept')))).toMatchObject({message:'published_immutable'});
 },120000);

 it('leases, fenced updates, run finish, outbox mark and purge steps',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);
  const claim=(t:string,ttl=300)=>s.one(`select public.broker_document_claim_lease($1,$2,$3) v`,[doc,t,ttl]);
  expect(await s.one(`select public.broker_document_fenced_update($1,null,'{"status":"parsing"}'::jsonb,false) v`,[doc])).toBe('lease_lost');
  expect(await s.one(`select status v from public.broker_report_documents where document_id=$1`,[doc])).toBe('uploaded');
  const noLeaseRun=randomUUID();
  await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,code_version,licence_version) values($1,$2,'parse','t',1)`,[noLeaseRun,doc]);
  expect(await s.one(`select public.broker_run_finish($1,null,'{"status":"failed"}'::jsonb) v`,[noLeaseRun])).toBe('lease_lost');
  expect(await s.one(`select detail->>'error_code' v from public.broker_report_runs where run_id=$1`,[noLeaseRun])).toBe('lease_lost');
  const a=randomUUID(),b=randomUUID();
  expect(await claim(a)).toBe(true);expect(await claim(b)).toBe(false);
  expect(await s.one(`select public.broker_document_fenced_update($1,$2,'{"status":"parsing"}'::jsonb,false) v`,[doc,b])).toBe('lease_lost');
  expect(await s.one(`select public.broker_document_fenced_update($1,$2,'{"status":"parsing"}'::jsonb,false) v`,[doc,a])).toBe('ok');
  expect((await fails(s.one(`select public.broker_document_fenced_update($1,$2,'{"withdrawn_at":"x"}'::jsonb,false) v`,[doc,a])))).toMatchObject({message:'invalid_patch'});
  const run=randomUUID();await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version) values($1,$2,'parse','f3/1','t',1)`,[run,doc]);
  await s.q(`update public.broker_report_documents set lease_until=now()-interval '1 second' where document_id=$1`,[doc]);
  expect(await claim(b)).toBe(true);                                                           // expired → taken over
  expect((await s.q(`select status,detail->>'error_code' e from public.broker_report_runs where run_id=$1`,[run]))[0]).toEqual({status:'failed',e:'lease_expired'});
  const run2=randomUUID();await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version) values($1,$2,'parse','f3/1','t',1)`,[run2,doc]);
  expect(await s.one(`select public.broker_run_finish($1,$2,'{"status":"succeeded"}'::jsonb) v`,[run2,a])).toBe('lease_lost');
  expect((await s.q(`select status,detail->>'error_code' e,(detail->>'lease_lost')::boolean l from public.broker_report_runs where run_id=$1`,[run2]))[0]).toEqual({status:'failed',e:'lease_lost',l:true});
  const run4=randomUUID();await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version) values($1,$2,'parse','f3/1','t',1)`,[run4,doc]);
  expect((await fails(s.one(`select public.broker_run_finish($1,$2,'{"status":"failed","extractor_version":"f3/2"}'::jsonb) v`,[run4,b])))).toMatchObject({message:'extractor_version_immutable'});
  await s.one(`select public.broker_run_finish($1,$2,'{"status":"failed"}'::jsonb) v`,[run4,b]);
  const run3=randomUUID();await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,code_version,licence_version) values($1,$2,'parse','t',1)`,[run3,doc]);   // parse version learnt from F3 at finish
  const s3=(await s.q(`select sha256 from public.broker_report_documents where document_id=$1`,[doc]))[0].sha256;
  expect(await s.one(`select public.broker_run_finish($1,$2,$3::jsonb) v`,[run3,b,J({status:'succeeded',extractor_version:'f3/1',artifact_path:`reports/${s3}.extract.${run3}.json`,artifact_hash:sha('a'),detail:{chunks:1}})])).toBe('ok');
  expect(await s.one(`select extractor_version v from public.broker_report_runs where run_id=$1`,[run3])).toBe('f3/1');
  expect((await fails(s.one(`select public.broker_run_finish($1,$2,'{"status":"failed"}'::jsonb) v`,[run3,b])))).toMatchObject({message:'run_finished'});
  expect(await s.one(`select public.broker_document_fenced_update($1,$2,$3::jsonb,true) v`,[doc,b,J({status:'parsed',current_parse_run_id:run3,page_count:4})])).toBe('ok');
  expect((await s.q(`select status,lease_token,page_count from public.broker_report_documents where document_id=$1`,[doc]))[0]).toEqual({status:'parsed',lease_token:null,page_count:4});
  const ev=await s.one(`insert into public.broker_outbox(kind,payload) values('licence.changed','{}') returning event_id as v`);
  for(let i=0;i<9;i++)await s.q(`select public.broker_outbox_mark($1,false,'boom')`,[ev]);
  expect((await s.q(`select status,attempts from public.broker_outbox where event_id=$1`,[ev]))[0]).toEqual({status:'pending',attempts:9});
  await s.q(`select public.broker_outbox_mark($1,false,'boom')`,[ev]);
  expect((await s.q(`select status,attempts,last_error from public.broker_outbox where event_id=$1`,[ev]))[0]).toEqual({status:'failed',attempts:10,last_error:'boom'});
  const ev2=await s.one(`insert into public.broker_outbox(kind,payload) values('licence.changed','{}') returning event_id as v`);
  await s.q(`select public.broker_outbox_mark($1,true,null)`,[ev2]);
  expect((await s.q(`select status,delivered_at is not null d from public.broker_outbox where event_id=$1`,[ev2]))[0]).toEqual({status:'delivered',d:true});
  await s.q(`select public.broker_purge_step_record($1,'pdf',false,'io')`,[doc]);await s.q(`select public.broker_purge_step_record($1,'pdf',true,null)`,[doc]);
  expect((await s.q(`select status,attempts,last_error from public.broker_purge_steps where document_id=$1`,[doc]))[0]).toEqual({status:'done',attempts:2,last_error:null});
 });

 it('SQL version strings equal the TS constants',async()=>{
  const fn=await s.one(`select string_agg(pg_get_functiondef(p.oid),' ') v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('broker_report_materialize','broker_report_live_digests','broker_report_publish_blockers','broker_report_publish','broker_snippets_approval')`);
  expect(fn).toContain(`'${UPSIDE_FORMULA_VERSION}'`);expect(fn).toContain(`'${RULES_VERSION}'`);expect(fn).toContain(`'${CLAIM_METHODOLOGY_VERSION}'`);expect(fn).toContain(`'${DISCLOSURE_VERSION}'`);
 });
});

describe.skipIf(!enabled)('A3 public views under the real anon and authenticated roles',()=>{
 const M3='supabase/migrations/20261119092000_broker_research_views.sql';
 const VIEWS=['broker_reports_public_v','broker_report_targets_public_v','broker_report_citations_v','broker_report_snippets_public_v','broker_report_summaries_public_v','broker_analysts_public_v','broker_rating_history_v','broker_spread_latest_v','research_institutions_public_v','research_rating_scales_public_v'];
 let unlock:(()=>Promise<void>)|undefined;
 beforeAll(async()=>{bind();unlock=await lockSettings(pool);},60000);        // toggles public_enabled; ready() sets the gold hash
 afterAll(async()=>{await unlock?.();await pool?.end();});
 const asRole=async<T>(role:'anon'|'authenticated',fn:(c:PoolClient)=>Promise<T>):Promise<T>=>{
  const c=await pool.connect();
  try{await c.query('begin');await c.query(`set local role ${role}`);return await fn(c);}
  finally{await c.query('rollback').catch(()=>{});c.release();}
 };
 const anon=async(sql:string,v:unknown[]=[])=>asRole('anon',async c=>(await c.query(sql,v)).rows as Record<string,any>[]);
 const enable=(on:boolean)=>s.q(`update public.broker_research_settings set public_enabled=$1 where id=1`,[on]);
 /** Rows per view for one report (institution/scale views by its institution). */
 const seen=async(rep:string,inst:string,role:'anon'|'authenticated'='anon')=>asRole(role,async c=>{
  const n=async(sql:string,v:unknown[])=>Number((await c.query(sql,v)).rows[0].n);
  return {
   reports:await n(`select count(*) n from public.broker_reports_public_v where report_id=$1`,[rep]),
   targets:await n(`select count(*) n from public.broker_report_targets_public_v where report_id=$1`,[rep]),
   citations:await n(`select count(*) n from public.broker_report_citations_v where report_id=$1`,[rep]),
   snippets:await n(`select count(*) n from public.broker_report_snippets_public_v where report_id=$1`,[rep]),
   summaries:await n(`select count(*) n from public.broker_report_summaries_public_v where report_id=$1`,[rep]),
   analysts:await n(`select count(*) n from public.broker_analysts_public_v where report_id=$1`,[rep]),
   history:await n(`select count(*) n from public.broker_rating_history_v where report_id=$1`,[rep]),
   spread:await n(`select count(*) n from public.broker_spread_latest_v where report_id=$1`,[rep]),
   institutions:await n(`select count(*) n from public.research_institutions_public_v where institution_id=$1`,[inst]),
   scales:await n(`select count(*) n from public.research_rating_scales_public_v where institution_id=$1`,[inst]),
  };
 });
 const NONE={reports:0,targets:0,citations:0,snippets:0,summaries:0,analysts:0,history:0,spread:0,institutions:0,scales:0};
 /** A published report with one approved snippet, one approved zh summary and a public analyst. */
 const published=async(o:Parameters<typeof world>[0]={})=>{
  const w=await ready(o);
  const af=(await s.one(`select public.broker_field_add($1,$2::jsonb,$3) v`,[w.rep,J({target_key:null,field:'analyst',occurrence:1,value_text:'Ann Analyst',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:5,char_end:16,value_source_text:'Ann Analyst',parse_run_id:w.pr,status:'confirmed'}),randomUUID()])).field_id;
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name,public_display) values($1,'Ann Analyst',true) returning analyst_id as v`,[w.inst]);
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,role,field_id) values($1,$2,'lead',$3)`,[w.rep,an,af]);
  await materialize(w.rep);await rules(w.rep);await goldCovering(w.digest,['analyst']);          // the analyst row is now an effective field (P-R3-03)
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,target_key,purpose,parse_run_id,page,char_start,char_end,text,disclosure_check,created_by) values($1,$2,'thesis',$3,2,0,8,'Thesis!!',$4::jsonb,gen_random_uuid()) returning snippet_id as v`,[w.rep,w.tk,w.pr,J(PASS)]);
  await s.q(`update public.broker_report_snippets set status='approved',approved_by=gen_random_uuid() where snippet_id=$1`,[sn]);
  const sumRun=randomUUID();
  await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,parse_run_id,model_id,registry_hash,prompt_version,code_version,licence_version) values($1,$2,'summary',$3,'m-sum','reg1','independent-summary/1','test',1)`,[sumRun,w.doc,w.pr]);
  const dg=(await report(w.rep)).summary_input_digest;
  await s.q(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check,status,approved_by) values($1,'zh',$2,$3,'独立摘要',1,$4::jsonb,$5::jsonb,'approved',gen_random_uuid())`,[w.rep,sumRun,dg,J({version:'grounding/1',passed:true,assertions:[{sentence_idx:0,target_key:w.tk,field:'price_at_report',value:'100',unit:'price',field_id:randomUUID()}],failures:[]}),J(PASS)]);
  expect(await blockers(w.rep)).toEqual([]);
  const pub=await publish(w.rep);
  return {...w,pub,analyst:an,analystField:af,snippet:sn};
 };

 it('ten views: owner rights, security_invoker=false, security_barrier=true; select-only for both roles; base tables and RPCs unreachable; replays',async()=>{
  const rows=await s.q(`select c.relname,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and c.relname=any($1)`,[VIEWS]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...VIEWS].sort());
  for(const r of rows)expect({v:r.relname,o:[...r.reloptions].sort()}).toEqual({v:r.relname,o:['security_barrier=true','security_invoker=false']});
  const priv=(role:string,t:string,p:string)=>s.one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated','service_role'])for(const v of VIEWS){
   expect({role,v,ok:await priv(role,v,'SELECT')}).toEqual({role,v,ok:true});
   for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({role,v,p,ok:await priv(role,v,p)}).toEqual({role,v,p,ok:false});
  }
  for(const role of ['anon','authenticated'] as const){
   for(const v of VIEWS)await asRole(role,c=>c.query(`select count(*) from public.${v}`));
   for(const v of VIEWS){
    const column=await s.one(`select attname v from pg_attribute where attrelid=$1::regclass and attnum=1 and not attisdropped`,[`public.${v}`]) as string;
    for(const sql of [`insert into public.${v} default values`,`update public.${v} set ${column}=${column}`,`delete from public.${v}`]){
     const code=(await fails(asRole(role,c=>c.query(sql)))).code;
     expect(['42501','55000']).toContain(code);
    }
   }
   for(const t of TABLES)expect({role,t,code:(await fails(asRole(role,c=>c.query(`select 1 from public.${t} limit 1`)))).code}).toEqual({role,t,code:'42501'});
   expect((await fails(asRole(role,c=>c.query(`select public.broker_report_publish_blockers(gen_random_uuid())`))))).toMatchObject({code:'42501'});
   expect((await fails(asRole(role,c=>c.query(`select public.broker_report_publish(gen_random_uuid(),gen_random_uuid())`))))).toMatchObject({code:'42501'});
   expect((await fails(asRole(role,c=>c.query(`select public.broker_field_effective(null,'x',null,null,null,null)`))))).toMatchObject({code:'42501'});
  }
  await expect(replayMigration(pool,readFileSync(M3,'utf8'))).resolves.toBeUndefined();
 },120000);

 it('visibility: the published report is in every view for both roles; public_enabled=false empties every view',async()=>{
  const w=await published();
  await enable(true);
  const all={reports:1,targets:1,citations:11,snippets:1,summaries:1,analysts:1,history:1,spread:1,institutions:1,scales:1};
  expect(await seen(w.rep,w.inst)).toEqual(all);
  expect(await seen(w.rep,w.inst,'authenticated')).toEqual(all);
  expect((await anon(`select rules_version,title_model_id from public.broker_reports_public_v where report_id=$1`,[w.rep]))[0]).toEqual({rules_version:RULES_VERSION,title_model_id:null});
  expect((await anon(`select target_facets,has_summary from public.broker_reports_public_v where report_id=$1`,[w.rep]))[0]).toEqual({target_facets:[{issuer_id:w.iss,rating:'buy',security_ticker:w.tk,currency:'HKD'}],has_summary:true});   // P-R3-05 / P-R4-02 filter columns
  expect((await anon(`select count(*)::int n from public.broker_reports_public_v where report_id=$1 and target_facets @> $2::jsonb`,[w.rep,J([{issuer_id:w.iss,rating:'sell'}])]))[0].n).toBe(0);   // correlated: issuer ok, rating not
  expect((await anon(`select grounding_assertions g from public.broker_report_summaries_public_v where report_id=$1`,[w.rep]))[0].g)
   .toEqual([{sentence_idx:0,target_key:w.tk,field:'price_at_report',value:'100',unit:'price'}]);              // field_id never leaves the private table
  await enable(false);
  for(const v of VIEWS)expect({v,n:Number((await anon(`select count(*) n from public.${v}`))[0].n)}).toEqual({v,n:0});
 },120000);

 it('visibility CTE: every condition flipped hides the report from every view',async()=>{
  await enable(true);
  const w=await published();const R=w.rep;
  const flip=async(on:string,off:string,table='broker_research_reports',key='report_id',id=R)=>{
   await s.q(`update public.${table} set ${on} where ${key}=$1`,[id]);
   expect({on,v:await seen(R,w.inst)}).toEqual({on,v:NONE});
   await s.q(`update public.${table} set ${off} where ${key}=$1`,[id]);
   expect((await seen(R,w.inst)).reports).toBe(1);
  };
  await flip(`evidence_ok=false`,`evidence_ok=true`);
  await flip(`disclosure_ok=false`,`disclosure_ok=true`);
  await flip(`confirmed_by=null,confirmed_at=null,confirmed_version=null`,`confirmed_by=gen_random_uuid(),confirmed_at=now(),confirmed_version=version`,'broker_report_licences','licence_id',w.lic);
  // a material change bumps the version: hidden, and still hidden after re-confirmation (snapshot licence_version 1 ≠ 2)
  await s.q(`update public.broker_report_licences set terms_summary='new terms' where licence_id=$1`,[w.lic]);
  expect(await seen(R,w.inst)).toEqual(NONE);
  await s.q(`update public.broker_report_licences set confirmed_by=gen_random_uuid(),confirmed_at=now(),confirmed_version=version where licence_id=$1`,[w.lic]);
  await s.q(`update public.broker_research_reports set disclosure_ok=true where report_id=$1`,[R]);
  expect(await seen(R,w.inst)).toEqual(NONE);
  const v2=await published();
  await s.q(`update public.broker_report_licences set allows_public_metadata=false where licence_id=$1`,[v2.lic]);
  expect(await seen(v2.rep,v2.inst)).toEqual(NONE);
  const v3=await published();
  await s.q(`update public.broker_report_licences set valid_from=current_date+1 where licence_id=$1`,[v3.lic]);
  await s.q(`update public.broker_report_licences set confirmed_by=gen_random_uuid(),confirmed_at=now(),confirmed_version=version where licence_id=$1`,[v3.lic]);
  expect(await seen(v3.rep,v3.inst)).toEqual(NONE);
  const v4=await published();
  await unpublish(v4.rep,'test');
  expect(await seen(v4.rep,v4.inst)).toEqual(NONE);
  const v5=await published();
  await s.q(`update public.broker_report_documents set status='withdrawn',withdrawn_at=now(),withdrawn_reason='t' where document_id=$1`,[v5.doc]);
  expect(await seen(v5.rep,v5.inst)).toEqual(NONE);
 },180000);

 it('target price not public: no target value, upside or target citation reaches any view (value-level, real anon role)',async()=>{
  await enable(true);
  const w=await published({licence:{allows_public_target_price:false}});
  const [t]=await anon(`select target_price,target_currency,target_horizon_months,upside_pct,target_price_public,price_at_report::text pr from public.broker_report_targets_public_v where report_id=$1`,[w.rep]);
  expect(t).toEqual({target_price:null,target_currency:null,target_horizon_months:null,upside_pct:null,target_price_public:false,pr:'100'});
  expect((await anon(`select field from public.broker_report_citations_v where report_id=$1 order by field`,[w.rep])).map(r=>r.field))
   .toEqual(['analyst','institution','price_as_of_date','price_at_report','price_currency','published_date','rating','ticker','title']);
  const dump:unknown[]=[];
  for(const v of VIEWS.filter(v=>!v.startsWith('research_')))dump.push(...await anon(`select * from public.${v} where report_id=$1`,[w.rep]));
  const leaves=(x:unknown):unknown[]=>x!==null&&typeof x==='object'?Object.values(x as object).flatMap(leaves):[x];
  const values=dump.flatMap(leaves).map(String);
  for(const bad of ['120','0.200000','0.2','HK$'])expect({bad,hit:values.includes(bad)}).toEqual({bad,hit:false});
  expect((await anon(`select target_price_public from public.broker_reports_public_v where report_id=$1`,[w.rep]))[0].target_price_public).toBe(false);
 },120000);

 it('snippets over the current N disappear; analysts need public_display; restricted titles drop the title citation; citations carry the SQL effective value',async()=>{
  await enable(true);
  const w=await published();
  // defense in depth: shrink N without the licence trigger (as if a row slipped through) → the 8-char snippet is filtered by the view
  const c=await pool.connect();
  try{await c.query('begin');await c.query(`set local session_replication_role=replica`);await c.query(`update public.broker_report_licences set snippet_max_chars=5 where licence_id=$1`,[w.lic]);await c.query('commit');}
  finally{c.release();}
  expect(await seen(w.rep,w.inst)).toMatchObject({reports:1,snippets:0});
  await s.q(`update public.research_analysts set public_display=false where analyst_id=$1`,[w.analyst]);
  await s.q(`update public.broker_research_reports set disclosure_ok=true where report_id=$1`,[w.rep]);     // admin re-ran the disclosure check
  expect(await seen(w.rep,w.inst)).toMatchObject({reports:1,analysts:0});
  expect((await anon(`select field from public.broker_report_citations_v where report_id=$1 and field='analyst'`,[w.rep]))).toEqual([]);
  // restricted title: title_public shown and marked rewritten, no 'title' citation
  const r=await ready();
  await s.q(`update public.broker_research_reports set title_public='Rewritten',title_public_by=gen_random_uuid() where report_id=$1`,[r.rep]);await materialize(r.rep);
  await rules(r.rep,[{rule:'disclosure',passed:false,blocking:false,target_key:null,reason_code:'restricted_value',detail:{surface:'title_original'}},{rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface:'title_public'}}]);
  const pr=(await s.q(`select field_id from public.broker_report_fields where report_id=$1 and field='price_at_report' and status='confirmed'`,[r.rep]))[0].field_id;
  await review(pr,'correct',{value_text:'HK$100.0',value_num:'100.0',value_unit:null});await rules(r.rep,[{rule:'disclosure',passed:false,blocking:false,target_key:null,reason_code:'restricted_value',detail:{surface:'title_original'}},{rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface:'title_public'}}]);
  await publish(r.rep);
  expect((await anon(`select title,title_is_rewritten from public.broker_reports_public_v where report_id=$1`,[r.rep]))[0]).toEqual({title:'Rewritten',title_is_rewritten:true});
  expect(await anon(`select 1 from public.broker_report_citations_v where report_id=$1 and field='title'`,[r.rep])).toEqual([]);
  expect((await anon(`select value_text,value_num::text n,value_unit from public.broker_report_citations_v where report_id=$1 and field='price_at_report'`,[r.rep]))[0]).toEqual({value_text:'HK$100.0',n:'100.0',value_unit:null});
  const mismatched=await s.one(`select count(*)::int v from public.broker_report_citations_v c join public.broker_report_fields f on f.report_id=c.report_id and f.field=c.field and f.target_key is not distinct from c.target_key and f.occurrence=c.occurrence and f.status in ('confirmed','corrected','absent')
   where jsonb_build_object('value_text',c.value_text,'value_num',c.value_num::text,'value_currency',c.value_currency,'value_unit',c.value_unit,'value_date',c.value_date::text)
         is distinct from public.broker_field_effective(f.corrected,f.value_text,f.value_num,f.value_currency,f.value_unit,f.value_date)`);
  expect(mismatched).toBe(0);
 },180000);

 it('binding a private analyst after a snippet naming them was approved returns it to draft; nothing with the name reaches anon (P-R1-04)',async()=>{
  await enable(true);
  const r=await ready();
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name,public_display) values($1,'Quinn Hidden',false) returning analyst_id as v`,[r.inst]) as string;
  const af=(await add(r.rep,{target_key:null,field:'analyst',occurrence:1,value_text:'Quinn Hidden',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',parse_run_id:r.pr,status:'confirmed'})).field_id;
  await rules(r.rep);await goldCovering(r.digest,['analyst']);                                   // P-R3-03
  const text='Quinn Hidden sees upside';
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,created_by) values($1,'thesis',$2,1,0,$3,$4,gen_random_uuid()) returning snippet_id as v`,[r.rep,r.pr,text.length,text]) as string;
  const before=await s.one(`select public.broker_report_disclosure_digest($1) v`,[r.rep]) as string;
  // the analyst is not bound yet, so the TS check passes; the approval stamps the current digest
  await s.q(`update public.broker_report_snippets set status='approved',approved_by=gen_random_uuid(),disclosure_check=$2::jsonb where snippet_id=$1`,[sn,J({...PASS,db_digest:before})]);
  expect((await s.q(`select status,disclosure_check->>'db_digest' d from public.broker_report_snippets where snippet_id=$1`,[sn]))[0]).toEqual({status:'approved',d:before});
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[r.rep,an,af]);
  expect((await s.q(`select status,draft_reason from public.broker_report_snippets where snippet_id=$1`,[sn]))[0]).toEqual({status:'draft',draft_reason:'analyst_disclosure'});
  expect(await s.one(`select public.broker_report_disclosure_digest($1) v`,[r.rep])).not.toBe(before);
  // re-approving with the check computed against the old inputs is refused
  expect((await fails(s.q(`update public.broker_report_snippets set status='approved',approved_by=gen_random_uuid(),disclosure_check=$2::jsonb where snippet_id=$1`,[sn,J({...PASS,db_digest:before})]))).message).toMatch(/^disclosure_inputs_changed/);
  await materialize(r.rep);await rules(r.rep);
  await publish(r.rep);
  const dump:unknown[]=[];
  for(const v of VIEWS.filter(v=>!v.startsWith('research_')))dump.push(...await anon(`select * from public.${v} where report_id=$1`,[r.rep]));
  expect(JSON.stringify(dump)).not.toContain('Quinn');
  expect(await anon(`select 1 from public.broker_report_snippets_public_v where snippet_id=$1`,[sn])).toEqual([]);
 },120000);

 it('spread public allowlist and grants under both roles (NEW-04)',async()=>{
  await enable(true);
  const r=await published({licence:{allows_public_target_price:false}});
  for(const role of ['anon','authenticated'] as const)await asRole(role,async c=>{
   const rows=(await c.query('select * from public.broker_spread_latest_v where report_id=$1',[r.rep])).rows;
   expect(rows).toHaveLength(1);
   expect(Object.keys(rows[0]).sort()).toEqual(['report_id','published_date','institution_id','security_ticker','issuer_id','currency'].sort());
   // Exact allowlist proves no target price, evidence, raw text/model payload or path is reachable.
   expect(rows[0].currency).toBe('HKD'); // report price remains public under this licence
   const target=(await c.query('select target_price,target_currency,target_horizon_months,upside_pct from public.broker_report_targets_public_v where report_id=$1',[r.rep])).rows[0];
   expect(Object.values(target)).toEqual([null,null,null,null]);
  });
 });

 it('spread excludes a rating-only target with no public target or report price',async()=>{
  await enable(true);
  const r=await ready({ratingOnly:true});
  await publish(r.rep);
  expect(await anon(`select report_id from public.broker_reports_public_v where report_id=$1`,[r.rep])).toEqual([{report_id:r.rep}]);
  expect(await anon(`select target_price,price_at_report,rating_normalized from public.broker_report_targets_public_v where report_id=$1`,[r.rep]))
   .toEqual([expect.objectContaining({target_price:null,price_at_report:null,rating_normalized:'buy'})]);
  expect(await anon(`select report_id from public.broker_spread_latest_v where report_id=$1`,[r.rep])).toEqual([]);
 });

 it('spread page-51 regression: 10,000 newer A reports cannot hide B; lower window and visibility gates apply (P-R6-05)',async()=>{
  await enable(true);
  const tk=`${1000+Math.floor(Math.random()*8999)}.HK`;await s.stock(tk,'HK');const issuer=await s.issuer();const inst=await s.institution();
  // Use real published fixtures, not a mocked view or a client-side DISTINCT substitute.
  const prices={target_price:'120',price_at_report:'100',target_currency:'HKD',price_currency:'HKD'};
  for(let n=0;n<10_000;n++)await published({tk,issuer,inst,published:'2026-10-01',prices});
  const b=await published({tk,issuer,published:'2026-03-01',prices});
  const eligible=await anon(`select t.report_id from public.broker_report_targets_public_v t join public.broker_reports_public_v r using(report_id)
   where t.security_ticker=$1 and t.issuer_id=$2 and r.published_date >= '2025-11-06'
   and t.target_price=120 and t.price_at_report=100 and t.target_currency='HKD' and t.price_currency='HKD'
   and (case when t.target_price is not null then t.target_currency when t.price_at_report is not null then t.price_currency else null end)='HKD'`,[tk,issuer]);
  expect(eligible).toHaveLength(10_001);
  const rows=await anon(`select * from public.broker_spread_latest_v where security_ticker=$1 and currency='HKD' and published_date >= '2025-11-06'`,[tk]);
  expect(rows).toHaveLength(2);expect(rows.map(r=>r.report_id)).toContain(b.rep);
  expect(await anon(`select * from public.broker_spread_latest_v where report_id=$1 and published_date >= '2026-04-01'`,[b.rep])).toEqual([]);
  await enable(false);expect(await anon(`select * from public.broker_spread_latest_v where security_ticker=$1`,[tk])).toEqual([]);
 },6_000_000);

 it('rating history: lag per (institution, security, currency) ordered by (published_date, report_id); superseded predecessors excluded; per-institution partitions',async()=>{
  await enable(true);
  const tk=`${1000+Math.floor(Math.random()*8999)}.HK`;await s.stock(tk,'HK');const iss=await s.issuer();const inst=await s.institution();
  const a=await published({tk,issuer:iss,inst,published:'2026-01-05'});
  const b=await ready({tk,issuer:iss,inst,published:'2026-02-05'});await publish(b.rep);
  const c=await ready({tk,issuer:iss,inst,published:'2026-03-05'});
  await s.q(`update public.broker_research_reports set supersedes_report_id=$2 where report_id=$1`,[c.rep,b.rep]);await materialize(c.rep);await rules(c.rep);
  await publish(c.rep);
  const other=await published({tk,issuer:iss,published:'2026-02-10'});                         // another institution
  const h=await anon(`select report_id,prev_report_id,published_date::text d,prev_published_date::text pd,target_price::text tp,prev_target_price::text ptp,target_currency from public.broker_rating_history_v where security_ticker=$1 and institution_id=$2 order by published_date`,[tk,inst]);
  expect(h).toEqual([{report_id:a.rep,prev_report_id:null,d:'2026-01-05',pd:null,tp:'120',ptp:null,target_currency:'HKD'},
                     {report_id:c.rep,prev_report_id:a.rep,d:'2026-03-05',pd:'2026-01-05',tp:'120',ptp:'120',target_currency:'HKD'}]);
  expect((await anon(`select prev_report_id from public.broker_rating_history_v where report_id=$1`,[other.rep]))).toEqual([{prev_report_id:null}]);
 },180000);

 it('institutions and rating scales appear only for an institution with a visible report, and only while public_enabled',async()=>{
  await enable(true);
  const inst=await s.institution();
  await s.q(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'Buy','buy','https://example.test/s','2020-01-01',gen_random_uuid())`,[inst]);
  expect(await anon(`select 1 from public.research_institutions_public_v where institution_id=$1`,[inst])).toEqual([]);
  expect(await anon(`select 1 from public.research_rating_scales_public_v where institution_id=$1`,[inst])).toEqual([]);
  const w=await published({inst});
  expect((await anon(`select name_en,report_count,last_published_date::text d,last_available_at is not null a from public.research_institutions_public_v where institution_id=$1`,[inst])))
   .toEqual([{name_en:expect.any(String),report_count:1,d:'2026-03-05',a:true}]);
  expect((await anon(`select raw_label,normalized from public.research_rating_scales_public_v where institution_id=$1`,[inst]))).toEqual([{raw_label:'Buy',normalized:'buy'}]);
  await enable(false);
  expect(await seen(w.rep,inst)).toEqual(NONE);
 },120000);
});
