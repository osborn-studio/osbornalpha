// src/lib/broker-research/broker-research.integration.test.ts
// Foreign broker research on real PostgreSQL (spec §4, §6.3, §6.5, §7.3, §10.2, §12.2): block 1 (A1)
// tables, constraints, bucket, grants and table-level triggers; block 2 (A2) SQL functions and
// function-backed triggers; block 3 (A3) public views under the real anon/authenticated roles;
// block 4 (A5) the pgBrokerResearchDb contract. Rows are never cleaned up: test:db builds a fresh
// database per run and every test seeds its own licence/document/report.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const M1='supabase/migrations/20261117090000_broker_research.sql';
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
