## Part A — FR-0：迁移、函数、视图、契约

Part A 的设计决定（后续 Part 依赖，执行者不得自行改动）：

- **哈希只在 SQL 端算。** `broker_sha256(text)` = `encode(sha256(convert_to(t,'UTF8')),'hex')`。`broker_report_live_digests(report_id)` 根据当前活表**实时**重算 `effective_hash / rules_input_hash / summary_input_digest`；`broker_report_materialize` 把三者写进报告行；`broker_report_publish_blockers` 第 11 条 `materialize_stale` = 已存的三个值与实时重算值任一不等（或 `materialized_hash` 为空）。所以 `updateReportDraft` 改了 `institution_id / scope / title_* / supersedes_report_id` 之后、没有重新物化 + 重跑规则就不能发布。规格 §4.4 第 11 条原文（`materialized_hash <> effective_hash`）在两列同时由物化写入时恒为假；这里按其意图实施，记入规格 §17。
- **规则输入**（`rules_input_hash` 的 jsonb）包括：`rules_version='broker-rules/1'`、生效行（含生效值）、物化后的 targets（含 `resolution`，不含 `input_hash`）、覆盖行、选中的映射行、`institution_id`、`scope`、`published_date`、文档 `uploaded_at`、四个标题面、`supersedes_report_id`，以及披露输入（`allows_public_target_price`、许可 `version`、已绑定分析师的 `public_display/display_name/name_variants`）。
- **标题披露检查结果放在规则回执里**（无需新增列）：B4/C6 跑规则时，对每个非空标题面（`title_original`、`title_public`、`title_zh`、`title_en`）各写一条 `RuleResult{rule:'disclosure', passed, blocking:false, target_key:null, reason_code: passed?null:'restricted_value', detail:{surface:'<面名>', hits}}`。阻断第 15 条读与当前 `rules_input_hash` 匹配的最新回执：某非空标题面没有结果或 `passed=false` → `restricted_value_in_text:<面名>`（`title_original` 只在 `title_public` 为空时阻断）。发布函数写 `title_restricted := title_original 的结果不是 passed`。片段 / 摘要的披露检查仍在各自 `disclosure_check` 列，由批准触发器校验。
- **`upside/1` 定义**：`upside_pct = round(target_price / price_at_report − 1, 6)`（小数，不是百分数；PostgreSQL `round(numeric,6)` 半数远离零；文本恒 6 位小数，如 `0.200000`），仅当两个值都有、两币种相等且 `price_at_report <> 0`。内存实现用 BigInt 实现同一规则。B4 的 R2 与 B5 的披露检查都以此为准。
- **新增的基础 RPC**（不改 TS 契约，只是实现内部）：`broker_document_claim_lease`、`broker_document_fenced_update`、`broker_run_finish`、`broker_outbox_mark`、`broker_purge_step_record`（需要服务器时间或读改写原子性）。
- **片段 / 摘要回草稿的原因**：两表各加一列 `draft_reason text null`（`licence_version` / `analyst_disclosure` / `summary_stale` / `disclosure_inputs`），对应规格 §4.1、§4.9 的 `detail.reason`（这两张表没有 `detail` 列）。TS 行类型暂不声明（见文末契约修订建议 1）。
- **取消发布**：`status='draft'`、`revision+1`、`current_publication_id=null`、`review_status='in_review'`（重新编辑后必须重新复核；规格没写，记入 §17）。
- **撤回与 outbox**：报告的 after-update 触发器统一处理 `claim.retract`：旧状态是 `published`，并且（状态离开 `published`，或 `disclosure_ok` / `evidence_ok` 从 true 变 false）→ 对旧 `current_publication_id` 下的每条 `claim.register` 各写一条 retract（`on conflict do nothing`，同一 `claim_key` 只有一次）。
- **金额在 JSON 里一律是十进制字符串**（outbox `claim.target_price/reference_price`、快照）。

---

### Task A1: 迁移一 —— 21 张表、约束、索引、桶、表权限、表级触发器

**Files:**
- Create: `supabase/migrations/20261113090000_broker_research.sql`
- Create: `src/lib/broker-research/broker-research.integration.test.ts`（块 1）
- Modify: `supabase/migrations.lock.json`（末尾追加一条）
- Modify: `scripts/ci/research-checks.ts`（`criticalSuites` 追加）
- Modify: `src/lib/supabase/database.types.ts`（`// FOREIGN ↓ … ↑` 围栏内追加 21 张表类型）
- Modify: `docs/audits/2026-11-06-foreign-research/10-implementation-log.md`（追加一行；没有就新建）

- [ ] **Step 1: 写失败的集成测试（块 1）**

创建 `src/lib/broker-research/broker-research.integration.test.ts`。文件顶部的辅助函数被 A2/A3/A5 复用（后续任务只追加 `describe` 块，以及块内自己的辅助函数）。种子数据刻意满足 A2 的批准触发器（片段长度 ≤ N、`disclosure_check.passed`、摘要 `input_hash` = 报告 `summary_input_digest`），这样 A2/A3 落地后块 1 仍然绿。

```ts
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
const M1='supabase/migrations/20261113090000_broker_research.sql';
const TABLES=['broker_research_settings','broker_report_licences','broker_report_upload_intents','broker_report_documents','broker_report_runs','broker_research_reports','broker_report_targets','broker_report_target_overrides','broker_report_fields','broker_report_snippets','broker_report_summaries','broker_report_publications','broker_report_rule_receipts','broker_purge_steps','research_institutions','research_rating_scales','research_analysts','broker_report_analysts','broker_report_access_log','broker_eval_receipts','broker_outbox'];

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
  const id=await one(`insert into public.broker_report_licences(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')}) returning licence_id v`,k.map(c=>cols[c]));
  if(confirm)await q(`update public.broker_report_licences set confirmed_by=$2,confirmed_at=now(),confirmed_version=version where licence_id=$1`,[id,user()]);
  return id as string;
 };
 const document=async(licenceId:string,o:{sha?:string;uploadedAt?:string}={})=>{
  const s=o.sha??sha(randomUUID());
  return await one(`insert into public.broker_report_documents(document_id,sha256,storage_path,byte_size,licence_id,uploaded_by,uploaded_at,original_filename) values(gen_random_uuid(),$1,'reports/'||$1||'.pdf',1024,$2,$3,coalesce($4::timestamptz,now()),'r.pdf') returning document_id v`,[s,licenceId,user(),o.uploadedAt??null]) as string;
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
 const report=async(documentId:string)=>await one(`insert into public.broker_research_reports(document_id,code_version) values($1,'test') returning report_id v`,[documentId]) as string;
 /** A human 'confirmed' evidence row with a span (valid under every constraint). */
 const field=async(reportId:string,parseRun:string,o:Record<string,unknown>)=>{
  const cols:Record<string,unknown>={report_id:reportId,parse_run_id:parseRun,field:'title',occurrence:1,value_text:'Title',page:1,char_start:0,char_end:5,value_source_text:'Title',extractor:`human:${randomUUID()}`,status:'confirmed',...o};
  const k=Object.keys(cols);
  return await one(`insert into public.broker_report_fields(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')}) returning field_id v`,k.map(c=>{const v=cols[c];return v!==null&&typeof v==='object'?JSON.stringify(v):v;})) as string;
 };
 const stock=async(ticker:string,market:'A'|'HK'|'US')=>{await q(`insert into public.stocks_universe(ticker,name,market) values($1,$1,$2::market_t) on conflict (ticker) do nothing`,[ticker,market]);};
 const issuer=async()=>await one(`insert into public.issuers(issuer_id,canonical_name_en) values(gen_random_uuid(),'ZZ Broker Test') returning issuer_id v`) as string;
 const institution=async(name=`ZZ Broker ${randomUUID()}`)=>await one(`insert into public.research_institutions(name_en) values($1) returning institution_id v`,[name]) as string;
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
 let admin:Pool;let s:ReturnType<typeof seeds>;
 beforeAll(()=>{admin=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});s=seeds(admin);});
 afterAll(async()=>{await admin?.end();});

 it('creates 21 RLS tables, the private bucket, service-role-only grants, the settings singleton, and replays',async()=>{
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
  expect((await fails(s.document(lic,{sha:(await s.q(`select sha256 from public.broker_report_documents where document_id=$1`,[doc]))[0].sha256})))).code).toBe('23505');
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
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,status,disclosure_check,approved_by,approved_at,created_by) values($1,'thesis',$2,1,0,4,'abcd','approved',$3,gen_random_uuid(),now(),gen_random_uuid()) returning snippet_id v`,[rep,pr,JSON.stringify(PASS)]);
  const su=await s.one(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check,status,approved_by,approved_at) values($1,'zh',$2,$3,'摘要',3,'{"version":"grounding/1","passed":true,"assertions":[],"failures":[]}',$4,'approved',gen_random_uuid(),now()) returning summary_id v`,[rep,ext,sha('d'),JSON.stringify(PASS)]);
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
  await s.q(`insert into public.broker_report_upload_intents(intent_id,sha256,byte_size,licence_id,original_filename,created_by,expires_at,status,staging_path) values($1,$2,10,$3,'a.pdf',gen_random_uuid(),now()+interval '2 hours','open','staging/'||$1||'.pdf')`,[id,sha(id),lic]);
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
  expect((await fails(s.q(`insert into public.broker_report_runs(run_id,document_id,kind,code_version,licence_version) values($1,$2,'parse','t',1)`,[run,doc]))).message).toMatch(/broker_runs_parse_extractor/);
  expect((await fails(s.q(`insert into public.broker_report_runs(run_id,document_id,kind,code_version,licence_version,model_id,registry_hash,prompt_version,schema_version) values($1,$2,'extract','t',1,'m','r','p','s')`,[run,doc]))).message).toMatch(/broker_runs_parse_link/);
  await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version) values($1,$2,'parse','f3/1','t',1)`,[run,doc]);
  expect((await fails(s.q(`update public.broker_report_runs set code_version='x' where run_id=$1`,[run]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`update public.broker_report_runs set status='succeeded' where run_id=$1`,[run]))).message).toMatch(/broker_runs_parse_artifact/);
  await s.q(`update public.broker_report_runs set status='failed',detail='{"error_code":"f3_failed"}' where run_id=$1`,[run]);
  expect(await s.one(`select finished_at is not null v from public.broker_report_runs where run_id=$1`,[run])).toBe(true);
  expect((await fails(s.q(`update public.broker_report_runs set detail='{}' where run_id=$1`,[run]))).message).toMatch(/^append_only:run .* is already finished/);
  expect((await fails(s.q(`delete from public.broker_report_runs where run_id=$1`,[run]))).message).toMatch(/^append_only:/);
 });

 it('reports guard and child guards: draft-only insert, publish_direct_forbidden, published immutability, frozen children, snippets/summaries may only fall back',async()=>{
  const lic=await s.licence();const doc=await s.document(lic);const pr=await s.parsed(doc);const rep=await s.report(doc);
  expect((await fails(s.q(`insert into public.broker_research_reports(document_id,code_version,status) values($1,'t','published')`,[await s.document(lic)]))).message).toMatch(/^publish_direct_forbidden/);
  expect((await fails(s.q(`update public.broker_research_reports set status='published' where report_id=$1`,[rep]))).message).toMatch(/^publish_direct_forbidden/);
  expect((await fails(s.q(`update public.broker_research_reports set revision=2 where report_id=$1`,[rep]))).message).toMatch(/^report_column_managed/);
  const fid=await s.field(rep,pr,{field:'title'});
  await s.q(`update public.broker_research_reports set summary_input_digest=$2 where report_id=$1`,[rep,sha('d')]);
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,status,disclosure_check,approved_by,approved_at,created_by) values($1,'thesis',$2,1,0,4,'abcd','approved',$3,gen_random_uuid(),now(),gen_random_uuid()) returning snippet_id v`,[rep,pr,JSON.stringify(PASS)]);
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
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name) values($1,'A. Analyst') returning analyst_id v`,[inst]);
  expect((await fails(s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,t]))).message).toMatch(/^analyst_field_mismatch/);
  const af=await s.field(rep,pr,{field:'analyst',value_text:'A. Analyst'});
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,af]);
  expect((await fails(s.q(`delete from public.broker_report_fields where field_id=$1`,[t]))).message).toMatch(/^append_only:/);
 });

 it('rating scales are close-only; analyst_disclosure_change flags reports and drafts their approved texts; append-only logs; outbox claim uniqueness',async()=>{
  const inst=await s.institution();
  const sc=await s.one(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'Buy','buy','https://example.test/r','2020-01-01',gen_random_uuid()) returning scale_id v`,[inst]);
  expect((await fails(s.q(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'BUY','sell','https://example.test/r','2020-01-01',gen_random_uuid())`,[inst]))).code).toBe('23505');
  expect((await fails(s.q(`update public.research_rating_scales set normalized='sell' where scale_id=$1`,[sc]))).message).toMatch(/^scale_close_only/);
  expect((await fails(s.q(`update public.research_rating_scales set valid_to='2025-01-01' where scale_id=$1`,[sc]))).message).toMatch(/^scale_closed_by_required/);
  await s.q(`update public.research_rating_scales set valid_to='2025-01-01',closed_by=gen_random_uuid() where scale_id=$1`,[sc]);
  expect(await s.one(`select closed_at is not null v from public.research_rating_scales where scale_id=$1`,[sc])).toBe(true);
  expect((await fails(s.q(`update public.research_rating_scales set valid_to='2026-01-01',closed_by=gen_random_uuid() where scale_id=$1`,[sc]))).message).toMatch(/^scale_closed/);
  expect((await fails(s.q(`delete from public.research_rating_scales where scale_id=$1`,[sc]))).message).toMatch(/^append_only:/);

  const lic=await s.licence();const doc=await s.document(lic);const pr=await s.parsed(doc);const rep=await s.report(doc);
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name) values($1,'B. Analyst') returning analyst_id v`,[inst]);
  const af=await s.field(rep,pr,{field:'analyst',value_text:'B. Analyst'});
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,field_id) values($1,$2,$3)`,[rep,an,af]);
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,status,disclosure_check,approved_by,approved_at,created_by) values($1,'thesis',$2,1,0,4,'abcd','approved',$3,gen_random_uuid(),now(),gen_random_uuid()) returning snippet_id v`,[rep,pr,JSON.stringify(PASS)]);
  await s.q(`update public.research_analysts set created_at=created_at where analyst_id=$1`,[an]);            // no disclosure input changed
  expect(await s.one(`select disclosure_ok v from public.broker_research_reports where report_id=$1`,[rep])).toBe(true);
  await s.q(`update public.research_analysts set public_display=true where analyst_id=$1`,[an]);
  expect(await s.one(`select disclosure_ok v from public.broker_research_reports where report_id=$1`,[rep])).toBe(false);
  expect((await s.q(`select status,draft_reason from public.broker_report_snippets where snippet_id=$1`,[sn]))[0]).toEqual({status:'draft',draft_reason:'analyst_disclosure'});

  const log=await s.one(`insert into public.broker_report_access_log(document_id,user_id,action) values($1,gen_random_uuid(),'text_viewed') returning id v`,[doc]);
  expect((await fails(s.q(`update public.broker_report_access_log set action='upload' where id=$1`,[log]))).message).toMatch(/^append_only:/);
  expect((await fails(s.q(`insert into public.broker_report_access_log(document_id,user_id,action) values($1,gen_random_uuid(),'ip_logged')`,[doc]))).message).toMatch(/broker_access_log_action/);
  const ev=await s.one(`insert into public.broker_eval_receipts(corpus_kind,corpus_hash,behavior_digest,extractor_version,model_id,registry_hash,prompt_version,schema_version,code_version,n_docs,per_field,absence,precision_min,recall_min,passed,ran_by) values('synthetic',$1,$1,'f3/1','m','r','p','s','t',1,'{}','{"tp":0,"fp":0,"fn":0}',0.99,0.99,true,gen_random_uuid()) returning receipt_id v`,[sha('c')]);
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
```

- [ ] **Step 2: 运行，确认失败**

先把 `src/lib/broker-research/broker-research.integration.test.ts` 加进 `criticalSuites`（Step 5 的内容，先做，否则 `test:db` 因清单漂移直接拒跑），再运行：

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
```

Expected: FAIL —— 第一个用例 `relname` 列表为空（表不存在），其余用例 `relation "public.broker_report_licences" does not exist`。

- [ ] **Step 3: 写迁移 `supabase/migrations/20261113090000_broker_research.sql`**

```sql
-- supabase/migrations/20261113090000_broker_research.sql
-- FR-0 (foreign broker research spec §4): the private research library. 21 tables, their
-- constraints and indexes, the private bucket `broker-research`, table privileges (every base table
-- is service_role only; public reads go through the §4.11 views of 20261113092000), and the
-- TABLE-LEVEL triggers: licence_material_change (before + after), document / intent / run
-- lifecycles, broker_reports_guard, child-table guards, close-only rating scales,
-- analyst_disclosure_change, insert-only publications (unpublished_at once), append-only receipts
-- and logs, outbox immutability. Triggers that need the module's SQL functions (approval checks,
-- withdraw cascade, claim.retract) live in 20261113091000_broker_research_functions.sql.
-- Trigger errors carry the code as the message prefix (`<code>[:<detail>]`, SQLSTATE P0001 or
-- 23514 for append_only:*), which the TS adapters map to BrokerResearchDbError(code).
-- Hosted `postgres` is not a superuser: no `alter … owner`, `set search_path = public`.
-- Replayable: create table if not exists, constraint adds guarded by pg_constraint, create or
-- replace function, drop trigger if exists + create trigger, insert … on conflict. Only
-- storage.buckets is referenced (the local harness has no storage.objects).

-- ---------------------------------------------------------------- 4.1 settings, licences
create table if not exists public.broker_research_settings (
  id                        integer primary key,
  public_enabled            boolean not null default false,
  approved_gold_corpus_hash text,
  approved_gold_corpus_by   uuid,
  approved_gold_corpus_at   timestamptz,
  updated_by                uuid,
  updated_at                timestamptz not null default now(),
  constraint broker_research_settings_singleton check (id = 1),
  constraint broker_research_settings_gold_hash check (approved_gold_corpus_hash is null or approved_gold_corpus_hash ~ '^[0-9a-f]{64}$')
);
insert into public.broker_research_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.broker_report_licences (
  licence_id                 uuid primary key default gen_random_uuid(),
  version                    integer not null default 1,
  source_label               text not null,
  licence_kind               text not null,
  holder                     text not null,
  terms_summary              text not null,
  evidence_path              text,
  allows_llm_processing      boolean not null default false,
  allows_public_metadata     boolean not null default false,
  allows_public_snippets     boolean not null default false,
  allows_public_summary      boolean not null default false,
  allows_public_target_price boolean not null default false,
  snippet_max_chars          integer not null,
  valid_from                 date not null,
  valid_to                   date,
  confirmed_by               uuid,
  confirmed_at               timestamptz,
  confirmed_version          integer,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint broker_licences_version check (version >= 1),
  constraint broker_licences_source_label check (length(source_label) between 1 and 120),
  constraint broker_licences_kind check (licence_kind in ('terminal_subscription','direct_from_broker','owner_authored','other')),
  constraint broker_licences_holder check (length(holder) between 1 and 200),
  constraint broker_licences_terms check (length(terms_summary) between 1 and 4000),
  constraint broker_licences_evidence_path check (evidence_path is null or evidence_path ~ '^licences/[0-9a-f]{64}\.pdf$'),
  constraint broker_licences_snippet_max check (snippet_max_chars > 0 and snippet_max_chars <= 500),
  constraint broker_licences_validity check (valid_to is null or valid_to >= valid_from),
  constraint broker_licences_confirmed_triple check ((confirmed_at is null) = (confirmed_by is null) and (confirmed_at is null) = (confirmed_version is null)),
  constraint broker_licences_confirmed_version check (confirmed_version is null or confirmed_version = version)
);

-- ---------------------------------------------------------------- 4.9 entities (referenced by reports)
create table if not exists public.research_institutions (
  institution_id        uuid primary key default gen_random_uuid(),
  name_en               text not null,
  name_zh               text,
  aliases               text[] not null default '{}',
  kind                  text,
  rating_disclosure_url text,
  created_at            timestamptz not null default now(),
  constraint research_institutions_name check (length(name_en) between 1 and 200)
);
create unique index if not exists research_institutions_name_en_uniq on public.research_institutions (lower(name_en));

create table if not exists public.research_rating_scales (
  scale_id       uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.research_institutions(institution_id) on delete restrict,
  raw_label      text not null,
  normalized     text not null,
  source_url     text not null,
  valid_from     date not null,
  valid_to       date,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  closed_by      uuid,
  closed_at      timestamptz,
  constraint research_rating_scales_label check (length(raw_label) between 1 and 80),
  constraint research_rating_scales_normalized check (normalized in ('buy','overweight','neutral','underweight','sell','not_rated')),
  constraint research_rating_scales_source check (length(source_url) between 1 and 2000),
  constraint research_rating_scales_validity check (valid_to is null or valid_to > valid_from),
  constraint research_rating_scales_closed check ((valid_to is null) = (closed_at is null) and (closed_at is null) = (closed_by is null))
);
create unique index if not exists research_rating_scales_label_uniq on public.research_rating_scales (institution_id, lower(raw_label), valid_from);

create table if not exists public.research_analysts (
  analyst_id     uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.research_institutions(institution_id) on delete restrict,
  display_name   text not null,
  name_variants  text[] not null default '{}',
  public_display boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint research_analysts_name check (length(display_name) between 1 and 200)
);
create index if not exists research_analysts_institution_idx on public.research_analysts (institution_id);

-- ---------------------------------------------------------------- 4.2 documents, intents; 4.3 runs
create table if not exists public.broker_report_documents (
  document_id          uuid primary key,
  sha256               text not null,
  storage_path         text not null,
  byte_size            bigint not null,
  page_count           integer,
  licence_id           uuid not null references public.broker_report_licences(licence_id) on delete restrict,
  uploaded_by          uuid not null,
  uploaded_at          timestamptz not null default now(),
  original_filename    text not null,
  current_parse_run_id uuid,
  status               text not null default 'uploaded',
  lease_token          uuid,
  lease_until          timestamptz,
  promotion_pending    boolean not null default false,
  last_verified_at     timestamptz,
  verify_status        text,
  withdrawn_at         timestamptz,
  withdrawn_reason     text,
  purged_at            timestamptz,
  constraint broker_documents_sha256_uniq unique (sha256),
  constraint broker_documents_storage_path_uniq unique (storage_path),
  constraint broker_documents_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint broker_documents_storage_path check (storage_path = 'reports/' || sha256 || '.pdf'),
  constraint broker_documents_byte_size check (byte_size > 0),
  constraint broker_documents_page_count check (page_count is null or page_count > 0),
  constraint broker_documents_filename check (length(original_filename) between 1 and 255),
  constraint broker_documents_status check (status in ('uploaded','parsing','parsed','parse_failed','withdrawn')),
  constraint broker_documents_lease_pair check ((lease_token is null) = (lease_until is null)),
  constraint broker_documents_verify_status check (verify_status is null or verify_status in ('ok','failed','error')),
  constraint broker_documents_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null) and (withdrawn_at is null) = (withdrawn_reason is null)),
  constraint broker_documents_purged check (purged_at is null or status = 'withdrawn')
);
create index if not exists broker_documents_verify_idx on public.broker_report_documents (last_verified_at nulls first, document_id);
create index if not exists broker_documents_licence_idx on public.broker_report_documents (licence_id);

create table if not exists public.broker_report_upload_intents (
  intent_id         uuid primary key,
  sha256            text not null,
  byte_size         bigint not null,
  licence_id        uuid not null references public.broker_report_licences(licence_id) on delete restrict,
  original_filename text not null,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  status            text not null default 'open',
  staging_path      text not null,
  document_id       uuid references public.broker_report_documents(document_id) on delete restrict,
  error_code        text,
  checkpoint_at     timestamptz,
  constraint broker_intents_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint broker_intents_byte_size check (byte_size > 0),
  constraint broker_intents_filename check (length(original_filename) between 1 and 255),
  constraint broker_intents_status check (status in ('open','validating','validated','promoting','committed','expired','abandoned')),
  constraint broker_intents_staging_path check (staging_path = 'staging/' || intent_id::text || '.pdf'),
  constraint broker_intents_committed_document check (status <> 'committed' or document_id is not null),
  constraint broker_intents_expiry check (expires_at > created_at)
);
create index if not exists broker_intents_status_idx on public.broker_report_upload_intents (status, expires_at);
create index if not exists broker_intents_sha_idx on public.broker_report_upload_intents (sha256);

create table if not exists public.broker_report_runs (
  run_id            uuid primary key,
  document_id       uuid not null references public.broker_report_documents(document_id) on delete restrict,
  kind              text not null,
  parse_run_id      uuid references public.broker_report_runs(run_id) on delete restrict,
  extractor_version text,
  artifact_path     text,
  artifact_hash     text,
  model_id          text,
  registry_hash     text,
  prompt_version    text,
  schema_version    text,
  code_version      text not null,
  behavior_digest   text,
  licence_version   integer not null,
  request_path      text,
  response_path     text,
  batch_id          uuid references public.ingest_batches(batch_id) on delete restrict,
  status            text not null default 'running',
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  detail            jsonb not null default '{}',
  constraint broker_runs_kind check (kind in ('parse','extract','summary','translate','verify')),
  constraint broker_runs_status check (status in ('running','succeeded','failed')),
  constraint broker_runs_finished check ((status = 'running') = (finished_at is null)),
  constraint broker_runs_detail check (jsonb_typeof(detail) = 'object'),
  constraint broker_runs_licence_version check (licence_version >= 1),
  constraint broker_runs_parse_extractor check (kind <> 'parse' or extractor_version is not null),
  constraint broker_runs_parse_link check (kind not in ('extract','summary','translate') or parse_run_id is not null),
  constraint broker_runs_llm_lineage check (kind not in ('extract','summary','translate') or (model_id is not null and registry_hash is not null and prompt_version is not null)),
  constraint broker_runs_extract_lineage check (kind <> 'extract' or (schema_version is not null and behavior_digest ~ '^[0-9a-f]{64}$')),
  constraint broker_runs_parse_artifact check (not (kind = 'parse' and status = 'succeeded') or (artifact_path is not null and artifact_hash is not null)),
  constraint broker_runs_artifact_hash check (artifact_hash is null or artifact_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_runs_artifact_path check (artifact_path is null or artifact_path ~ '^reports/[0-9a-f]{64}\.extract\.[0-9a-f-]{36}\.json$'),
  constraint broker_runs_request_path check (request_path is null or request_path = 'runs/' || run_id::text || '.request.json'),
  constraint broker_runs_response_path check (response_path is null or response_path = 'runs/' || run_id::text || '.response.json')
);
create index if not exists broker_runs_document_idx on public.broker_report_runs (document_id, started_at desc);
create index if not exists broker_runs_running_idx on public.broker_report_runs (document_id) where status = 'running';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'broker_documents_parse_run_fkey') then
    alter table public.broker_report_documents add constraint broker_documents_parse_run_fkey
      foreign key (current_parse_run_id) references public.broker_report_runs(run_id) on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------- 4.4 reports
create table if not exists public.broker_research_reports (
  report_id              uuid primary key default gen_random_uuid(),
  document_id            uuid not null references public.broker_report_documents(document_id) on delete restrict,
  revision               integer not null default 1,
  scope                  text,
  institution_id         uuid references public.research_institutions(institution_id) on delete restrict,
  title_original         text,
  title_lang             text,
  title_zh               text,
  title_en               text,
  title_run_id           uuid references public.broker_report_runs(run_id) on delete restrict,
  title_public           text,
  title_public_by        uuid,
  published_date         date,
  price_as_of_date       date,
  report_type            text,
  sector_as_stated       text,
  primary_target_key     text,
  effective_hash         text,
  materialized_hash      text,
  rules_input_hash       text,
  summary_input_digest   text,
  title_restricted       boolean not null default false,
  evidence_ok            boolean not null default true,
  disclosure_ok          boolean not null default true,
  review_status          text not null default 'pending',
  status                 text not null default 'draft',
  current_publication_id uuid,
  supersedes_report_id   uuid references public.broker_research_reports(report_id) on delete restrict,
  code_version           text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint broker_reports_document_uniq unique (document_id),
  constraint broker_reports_revision check (revision >= 1),
  constraint broker_reports_scope check (scope is null or scope in ('single_issuer','multi_issuer','sector','macro_strategy')),
  constraint broker_reports_review_status check (review_status in ('pending','in_review','approved','rejected')),
  constraint broker_reports_status check (status in ('draft','published','withdrawn')),
  constraint broker_reports_published_publication check (status <> 'published' or current_publication_id is not null),
  constraint broker_reports_supersedes_self check (supersedes_report_id is null or supersedes_report_id <> report_id),
  constraint broker_reports_title_public_by check ((title_public is null) or (title_public_by is not null)),
  constraint broker_reports_hashes check ((effective_hash is null or effective_hash ~ '^[0-9a-f]{64}$') and (materialized_hash is null or materialized_hash ~ '^[0-9a-f]{64}$')
                                          and (rules_input_hash is null or rules_input_hash ~ '^[0-9a-f]{64}$') and (summary_input_digest is null or summary_input_digest ~ '^[0-9a-f]{64}$'))
);
create index if not exists broker_reports_status_idx on public.broker_research_reports (status, review_status);
create index if not exists broker_reports_institution_idx on public.broker_research_reports (institution_id, published_date desc);

-- ---------------------------------------------------------------- 4.5 targets, overrides
create table if not exists public.broker_report_targets (
  report_id              uuid not null references public.broker_research_reports(report_id) on delete cascade,
  target_key             text not null,
  basis                  text not null,
  ticker_as_stated       text not null,
  security_ticker        text references public.stocks_universe(ticker) on delete restrict,
  issuer_id              uuid references public.issuers(issuer_id) on delete restrict,
  resolution             jsonb not null default '{}',
  rating_raw             text,
  rating_normalized      text,
  scale_id               uuid references public.research_rating_scales(scale_id) on delete restrict,
  target_price           numeric,
  target_currency        text,
  target_horizon_months  integer,
  price_at_report        numeric,
  price_currency         text,
  price_as_of_date       date,
  upside_pct             numeric,
  upside_formula_version text,
  input_hash             text not null,
  primary key (report_id, target_key),
  constraint broker_targets_key check (length(target_key) between 1 and 128),
  constraint broker_targets_basis check (basis in ('candidate','effective')),
  constraint broker_targets_resolution check (jsonb_typeof(resolution) = 'object'),
  constraint broker_targets_rating check (rating_normalized is null or rating_normalized in ('buy','overweight','neutral','underweight','sell','not_rated')),
  constraint broker_targets_currencies check ((target_currency is null or target_currency ~ '^[A-Z]{3}$') and (price_currency is null or price_currency ~ '^[A-Z]{3}$')),
  constraint broker_targets_horizon check (target_horizon_months is null or target_horizon_months > 0),
  constraint broker_targets_upside check ((upside_pct is null) = (upside_formula_version is null))
);
create index if not exists broker_targets_security_idx on public.broker_report_targets (security_ticker);
create index if not exists broker_targets_issuer_idx on public.broker_report_targets (issuer_id);

create table if not exists public.broker_report_target_overrides (
  override_id     uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.broker_research_reports(report_id) on delete cascade,
  target_key      text not null,
  security_ticker text not null references public.stocks_universe(ticker) on delete restrict,
  issuer_id       uuid references public.issuers(issuer_id) on delete restrict,
  set_by          uuid not null,
  set_at          timestamptz not null default now(),
  note            text,
  constraint broker_overrides_uniq unique (report_id, target_key)
);

-- ---------------------------------------------------------------- 4.6 evidence rows
create table if not exists public.broker_report_fields (
  field_id             uuid primary key default gen_random_uuid(),
  report_id            uuid not null references public.broker_research_reports(report_id) on delete cascade,
  parse_run_id         uuid references public.broker_report_runs(run_id) on delete restrict,
  run_id               uuid references public.broker_report_runs(run_id) on delete restrict,
  superseded_by_run_id uuid references public.broker_report_runs(run_id) on delete restrict,
  target_key           text,
  field                text not null,
  occurrence           integer not null default 1,
  value_text           text not null,
  value_num            numeric,
  value_currency       text,
  value_unit           text,
  value_date           date,
  page                 integer,
  char_start           integer,
  char_end             integer,
  value_source_text    text,
  extractor            text not null,
  extractor_confidence double precision,
  status               text not null,
  corrected            jsonb,
  conflict_group       text,
  detail               jsonb not null default '{}',
  reviewed_by          uuid,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  constraint broker_fields_field check (field in ('institution','analyst','published_date','price_as_of_date','ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method','sector','title')),
  constraint broker_fields_status check (status in ('extracted','unverified','confirmed','corrected','rejected','absent')),
  constraint broker_fields_occurrence check (occurrence >= 1),
  constraint broker_fields_value_currency check (value_currency is null or value_currency ~ '^[A-Z]{3}$'),
  constraint broker_fields_value_unit check (value_unit is null or value_unit in ('pct','ratio','months','price')),
  constraint broker_fields_page check (page is null or page > 0),
  constraint broker_fields_span check ((char_start is null) = (char_end is null) and (char_start is null or (char_start >= 0 and char_end > char_start)) and (char_start is null or page is not null)),
  constraint broker_fields_span_run check (char_start is null or parse_run_id is not null),
  constraint broker_fields_source_text check (value_source_text is null or char_start is not null),
  constraint broker_fields_extractor check (extractor ~ '^(llm:.+|human:[0-9a-f-]{36})$'),
  constraint broker_fields_confidence check (extractor_confidence is null or (extractor_confidence >= 0 and extractor_confidence <= 1)),
  constraint broker_fields_detail check (jsonb_typeof(detail) = 'object'),
  constraint broker_fields_target_key_level check (
    (field in ('ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','price_as_of_date','upside_stated')) = (target_key is not null)),
  constraint broker_fields_confirmed_span check (status not in ('confirmed','corrected') or (page is not null and char_start is not null and char_end is not null and value_source_text is not null and parse_run_id is not null)),
  constraint broker_fields_absent_shape check (status <> 'absent' or (extractor like 'human:%' and field in ('rating','target_price','analyst','target_horizon')
                                               and page is not null and char_start is null and value_source_text is null and value_text = 'ABSENT' and parse_run_id is not null)),
  constraint broker_fields_candidate_run check (status not in ('extracted','unverified') or (run_id is not null and extractor like 'llm:%')),
  constraint broker_fields_corrected_iff check ((status = 'corrected') = (corrected is not null)),
  constraint broker_fields_corrected_payload check (corrected is null or (
        jsonb_typeof(corrected) = 'object'
    and corrected - array['value_text','value_num','value_currency','value_unit','value_date'] = '{}'::jsonb
    and jsonb_typeof(corrected -> 'value_text') = 'string'
    and (not corrected ? 'value_num' or jsonb_typeof(corrected -> 'value_num') = 'null' or (jsonb_typeof(corrected -> 'value_num') = 'string' and corrected ->> 'value_num' ~ '^-?[0-9]+(\.[0-9]+)?$'))
    and (not corrected ? 'value_currency' or jsonb_typeof(corrected -> 'value_currency') = 'null' or corrected ->> 'value_currency' ~ '^[A-Z]{3}$')
    and (not corrected ? 'value_unit' or jsonb_typeof(corrected -> 'value_unit') = 'null' or corrected ->> 'value_unit' in ('pct','ratio','months','price'))
    and (not corrected ? 'value_date' or jsonb_typeof(corrected -> 'value_date') = 'null' or corrected ->> 'value_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')))
);
create unique index if not exists broker_fields_effective_uniq on public.broker_report_fields (report_id, coalesce(target_key, ''), field, occurrence) where status in ('confirmed','corrected','absent');
create index if not exists broker_fields_report_idx on public.broker_report_fields (report_id, field, target_key);
create index if not exists broker_fields_run_idx on public.broker_report_fields (run_id);

-- ---------------------------------------------------------------- 4.7 snippets, summaries
create table if not exists public.broker_report_snippets (
  snippet_id       uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.broker_research_reports(report_id) on delete cascade,
  target_key       text,
  purpose          text not null,
  parse_run_id     uuid not null references public.broker_report_runs(run_id) on delete restrict,
  page             integer not null,
  char_start       integer not null,
  char_end         integer not null,
  text             text,
  field_id         uuid references public.broker_report_fields(field_id) on delete restrict,
  status           text not null default 'draft',
  disclosure_check jsonb,
  draft_reason     text,
  approved_by      uuid,
  approved_at      timestamptz,
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  constraint broker_snippets_purpose check (purpose in ('rating','target','thesis','risk','method','other')),
  constraint broker_snippets_status check (status in ('draft','approved','rejected')),
  constraint broker_snippets_span check (page > 0 and char_start >= 0 and char_end > char_start),
  constraint broker_snippets_text_length check (text is null or length(text) <= 500),
  constraint broker_snippets_text_required check (status = 'rejected' or text is not null),
  constraint broker_snippets_approved check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint broker_snippets_draft_reason check (draft_reason is null or draft_reason in ('licence_version','analyst_disclosure','disclosure_inputs'))
);
create index if not exists broker_snippets_report_idx on public.broker_report_snippets (report_id, status);

create table if not exists public.broker_report_summaries (
  summary_id           uuid primary key default gen_random_uuid(),
  report_id            uuid not null references public.broker_research_reports(report_id) on delete cascade,
  lang                 text not null,
  kind                 text not null default 'independent_summary',
  run_id               uuid not null references public.broker_report_runs(run_id) on delete restrict,
  input_hash           text not null,
  summary_md           text not null,
  max_verbatim_overlap integer not null,
  numeric_grounding    jsonb not null,
  disclosure_check     jsonb not null,
  status               text not null default 'draft',
  draft_reason         text,
  approved_by          uuid,
  approved_at          timestamptz,
  generated_at         timestamptz not null default now(),
  constraint broker_summaries_lang check (lang in ('zh','en')),
  constraint broker_summaries_kind check (kind = 'independent_summary'),
  constraint broker_summaries_input_hash check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_summaries_overlap check (max_verbatim_overlap >= 0),
  constraint broker_summaries_status check (status in ('draft','approved','rejected')),
  constraint broker_summaries_approved check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint broker_summaries_draft_reason check (draft_reason is null or draft_reason in ('licence_version','analyst_disclosure','summary_stale'))
);
create unique index if not exists broker_summaries_approved_uniq on public.broker_report_summaries (report_id, lang) where status = 'approved';

-- ---------------------------------------------------------------- 4.8 rule receipts, publications
create table if not exists public.broker_report_rule_receipts (
  receipt_id    uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.broker_research_reports(report_id) on delete restrict,
  rules_version text not null,
  input_hash    text not null,
  results       jsonb not null,
  code_version  text not null,
  created_at    timestamptz not null default now(),
  constraint broker_rule_receipts_hash check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_rule_receipts_results check (jsonb_typeof(results) = 'array')
);
create index if not exists broker_rule_receipts_lookup_idx on public.broker_report_rule_receipts (report_id, input_hash, created_at desc);

create table if not exists public.broker_eval_receipts (
  receipt_id        uuid primary key default gen_random_uuid(),
  corpus_kind       text not null,
  corpus_hash       text not null,
  behavior_digest   text not null,
  extractor_version text not null,
  model_id          text not null,
  registry_hash     text not null,
  prompt_version    text not null,
  schema_version    text not null,
  code_version      text not null,
  n_docs            integer not null,
  per_field         jsonb not null,
  absence           jsonb not null,
  precision_min     double precision,
  recall_min        double precision,
  passed            boolean not null,
  ran_at            timestamptz not null default now(),
  ran_by            uuid not null,
  constraint broker_eval_corpus_kind check (corpus_kind in ('gold','synthetic')),
  constraint broker_eval_hashes check (corpus_hash ~ '^[0-9a-f]{64}$' and behavior_digest ~ '^[0-9a-f]{64}$'),
  constraint broker_eval_n_docs check (n_docs >= 0),
  constraint broker_eval_shapes check (jsonb_typeof(per_field) = 'object' and jsonb_typeof(absence) = 'object'),
  constraint broker_eval_passed_rule check (passed = coalesce(precision_min >= 0.95 and recall_min >= 0.95, false))
);
create index if not exists broker_eval_digest_idx on public.broker_eval_receipts (behavior_digest, ran_at desc);

create table if not exists public.broker_report_publications (
  publication_id   uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.broker_research_reports(report_id) on delete restrict,
  revision         integer not null,
  snapshot         jsonb not null,
  snapshot_hash    text not null,
  licence_version  integer not null,
  rules_receipt_id uuid not null references public.broker_report_rule_receipts(receipt_id) on delete restrict,
  eval_receipt_id  uuid references public.broker_eval_receipts(receipt_id) on delete restrict,
  published_at     timestamptz not null default now(),
  published_by     uuid not null,
  unpublished_at   timestamptz,
  unpublish_reason text,
  constraint broker_publications_revision_uniq unique (report_id, revision),
  constraint broker_publications_snapshot check (jsonb_typeof(snapshot) = 'object'),
  constraint broker_publications_hash check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_publications_unpublished check ((unpublished_at is null) = (unpublish_reason is null))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'broker_reports_publication_fkey') then
    alter table public.broker_research_reports add constraint broker_reports_publication_fkey
      foreign key (current_publication_id) references public.broker_report_publications(publication_id) on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------- analysts binding, purge, logs, outbox
create table if not exists public.broker_report_analysts (
  report_id  uuid not null references public.broker_research_reports(report_id) on delete cascade,
  analyst_id uuid not null references public.research_analysts(analyst_id) on delete restrict,
  role       text,
  field_id   uuid not null references public.broker_report_fields(field_id) on delete restrict,
  primary key (report_id, analyst_id)
);
create index if not exists broker_report_analysts_analyst_idx on public.broker_report_analysts (analyst_id);

create table if not exists public.broker_purge_steps (
  document_id uuid not null references public.broker_report_documents(document_id) on delete restrict,
  step        text not null,
  status      text not null default 'pending',
  attempts    integer not null default 0,
  last_error  text,
  at          timestamptz not null default now(),
  primary key (document_id, step),
  constraint broker_purge_steps_step check (step in ('pdf','artifacts','runs','fields_text','snippets_text','summaries','quarantine_payload')),
  constraint broker_purge_steps_status check (status in ('pending','done','failed')),
  constraint broker_purge_steps_attempts check (attempts >= 0)
);

create table if not exists public.broker_report_access_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references public.broker_report_documents(document_id) on delete restrict,
  user_id     uuid not null,
  action      text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  constraint broker_access_log_action check (action in ('upload','signed_url_issued','text_viewed','parse_run','extract_run','summary_run','unpublish','withdraw','purge','orphan_cleanup')),
  constraint broker_access_log_detail check (jsonb_typeof(detail) = 'object')
);
create index if not exists broker_access_log_document_idx on public.broker_report_access_log (document_id, created_at desc);
create index if not exists broker_access_log_created_idx on public.broker_report_access_log (created_at desc);

create table if not exists public.broker_outbox (
  event_id     uuid primary key default gen_random_uuid(),
  kind         text not null,
  payload      jsonb not null,
  status       text not null default 'pending',
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,
  constraint broker_outbox_kind check (kind in ('claim.register','claim.revise','claim.retract','licence.changed','mapping.changed')),
  constraint broker_outbox_payload check (jsonb_typeof(payload) = 'object'),
  constraint broker_outbox_status check (status in ('pending','delivered','failed')),
  constraint broker_outbox_delivered check ((status = 'delivered') = (delivered_at is not null)),
  constraint broker_outbox_attempts check (attempts >= 0)
);
create unique index if not exists broker_outbox_claim_uniq on public.broker_outbox ((payload ->> 'claim_key'), (payload ->> 'claim_seq')) where kind in ('claim.register','claim.retract');
create index if not exists broker_outbox_pending_idx on public.broker_outbox (created_at, event_id) where status = 'pending';
create index if not exists broker_outbox_publication_idx on public.broker_outbox ((payload -> 'source' ->> 'publication_id')) where kind = 'claim.register';

-- ---------------------------------------------------------------- 4.12 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('broker-research', 'broker-research', false, 52428800, array['application/pdf','application/json','image/png'])
on conflict (id) do update
set public = false, name = excluded.name, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers: shared
-- Generic append-only backstop (rule receipts, eval receipts, access log).
create or replace function public.broker_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'append_only:% rows are never updated or deleted', tg_table_name using errcode = '23514';
end $$;
drop trigger if exists broker_append_only on public.broker_report_rule_receipts;
create trigger broker_append_only before update or delete on public.broker_report_rule_receipts for each row execute function public.broker_append_only();
drop trigger if exists broker_append_only on public.broker_eval_receipts;
create trigger broker_append_only before update or delete on public.broker_eval_receipts for each row execute function public.broker_append_only();
drop trigger if exists broker_append_only on public.broker_report_access_log;
create trigger broker_append_only before update or delete on public.broker_report_access_log for each row execute function public.broker_append_only();

-- ---------------------------------------------------------------- triggers: licences (§4.1)
-- before: inserts start at version 1, unconfirmed; version is trigger-managed; a material change
-- (allows_*, snippet_max_chars, validity, terms_summary, licence_kind, holder) bumps the version
-- and clears the confirmation. after: a version bump drafts every approved snippet/summary of the
-- licence's reports (draft_reason='licence_version'), sets disclosure_ok=false on its non-withdrawn
-- reports (A2's report trigger turns that into claim.retract for published ones), and writes
-- outbox licence.changed.
create or replace function public.broker_licences_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_licences rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    new.version := 1; new.confirmed_by := null; new.confirmed_at := null; new.confirmed_version := null;
    return new;
  end if;
  if new.licence_id <> old.licence_id or new.created_at <> old.created_at then raise exception 'licence_immutable'; end if;
  if new.version <> old.version then raise exception 'licence_version_managed'; end if;
  if (new.allows_llm_processing, new.allows_public_metadata, new.allows_public_snippets, new.allows_public_summary, new.allows_public_target_price,
      new.snippet_max_chars, new.valid_from, new.valid_to, new.terms_summary, new.licence_kind, new.holder)
     is distinct from
     (old.allows_llm_processing, old.allows_public_metadata, old.allows_public_snippets, old.allows_public_summary, old.allows_public_target_price,
      old.snippet_max_chars, old.valid_from, old.valid_to, old.terms_summary, old.licence_kind, old.holder) then
    new.version := old.version + 1;
    new.confirmed_by := null; new.confirmed_at := null; new.confirmed_version := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists licence_material_change on public.broker_report_licences;
create trigger licence_material_change before insert or update or delete on public.broker_report_licences
  for each row execute function public.broker_licences_version();

create or replace function public.broker_licences_after_change() returns trigger
language plpgsql set search_path = public as $$
declare v_event uuid := gen_random_uuid();
begin
  if new.version = old.version then return null; end if;
  update public.broker_report_snippets s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'licence_version'
  from public.broker_research_reports r join public.broker_report_documents d on d.document_id = r.document_id
  where s.report_id = r.report_id and d.licence_id = new.licence_id and s.status = 'approved';
  update public.broker_report_summaries s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'licence_version'
  from public.broker_research_reports r join public.broker_report_documents d on d.document_id = r.document_id
  where s.report_id = r.report_id and d.licence_id = new.licence_id and s.status = 'approved';
  update public.broker_research_reports r set disclosure_ok = false
  from public.broker_report_documents d
  where d.document_id = r.document_id and d.licence_id = new.licence_id and r.status <> 'withdrawn' and r.disclosure_ok;
  insert into public.broker_outbox (event_id, kind, payload)
  values (v_event, 'licence.changed', jsonb_build_object('event_id', v_event, 'kind', 'licence.changed', 'licence_id', new.licence_id, 'version', new.version, 'previous_version', old.version));
  return null;
end $$;
drop trigger if exists licence_material_change_after on public.broker_report_licences;
create trigger licence_material_change_after after update on public.broker_report_licences
  for each row execute function public.broker_licences_after_change();

-- ---------------------------------------------------------------- triggers: intents, documents, runs (§4.2, §4.3, §6.1)
create or replace function public.broker_intents_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_upload_intents rows are never deleted' using errcode = '23514'; end if;
  if (new.intent_id, new.sha256, new.byte_size, new.licence_id, new.original_filename, new.created_by, new.created_at, new.expires_at, new.staging_path)
     is distinct from (old.intent_id, old.sha256, old.byte_size, old.licence_id, old.original_filename, old.created_by, old.created_at, old.expires_at, old.staging_path) then
    raise exception 'intent_immutable';
  end if;
  if old.document_id is not null and new.document_id is distinct from old.document_id then raise exception 'intent_document_set_once'; end if;
  if new.status <> old.status then
    if not ((old.status, new.status) in (('open','validating'),('open','expired'),('open','abandoned'),
            ('validating','validated'),('validating','abandoned'),('validating','expired'),
            ('validated','promoting'),('validated','abandoned'),('validated','expired'),
            ('promoting','committed'),('promoting','abandoned'))) then
      raise exception 'intent_transition_invalid:%->%', old.status, new.status;
    end if;
    new.checkpoint_at := now();
  end if;
  return new;
end $$;
drop trigger if exists broker_intents_lifecycle on public.broker_report_upload_intents;
create trigger broker_intents_lifecycle before update or delete on public.broker_report_upload_intents
  for each row execute function public.broker_intents_lifecycle();

create or replace function public.broker_documents_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_documents rows are never deleted' using errcode = '23514'; end if;
  if (new.document_id, new.sha256, new.storage_path, new.byte_size, new.licence_id, new.uploaded_by, new.uploaded_at, new.original_filename)
     is distinct from (old.document_id, old.sha256, old.storage_path, old.byte_size, old.licence_id, old.uploaded_by, old.uploaded_at, old.original_filename) then
    raise exception 'document_immutable';
  end if;
  if new.promotion_pending and not old.promotion_pending then raise exception 'document_promotion_pending_only_clears'; end if;
  if old.purged_at is not null and new.purged_at is distinct from old.purged_at then raise exception 'document_purged'; end if;
  if new.status <> old.status then
    if old.status = 'withdrawn' then
      if not (new.status = 'uploaded' and old.withdrawn_reason = 'promotion_lost' and old.purged_at is null) then
        raise exception 'document_transition_invalid:%->%', old.status, new.status;
      end if;
    elsif new.status <> 'withdrawn' and not ((old.status, new.status) in (('uploaded','parsing'),('parse_failed','parsing'),('parsed','parsing'),('parsing','parsed'),('parsing','parse_failed'))) then
      raise exception 'document_transition_invalid:%->%', old.status, new.status;
    end if;
  end if;
  if new.status = 'parsed' and new.current_parse_run_id is null then raise exception 'document_parse_run_required'; end if;
  if new.current_parse_run_id is distinct from old.current_parse_run_id and new.current_parse_run_id is not null
     and not exists (select 1 from public.broker_report_runs r where r.run_id = new.current_parse_run_id and r.document_id = new.document_id and r.kind = 'parse' and r.status = 'succeeded') then
    raise exception 'document_parse_run_invalid';
  end if;
  return new;
end $$;
drop trigger if exists broker_documents_lifecycle on public.broker_report_documents;
create trigger broker_documents_lifecycle before update or delete on public.broker_report_documents
  for each row execute function public.broker_documents_lifecycle();

create or replace function public.broker_runs_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['status','finished_at','detail','artifact_path','artifact_hash','request_path','response_path'];
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_runs rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'running' or new.finished_at is not null then raise exception 'append_only:runs are inserted running' using errcode = '23514'; end if;
    return new;
  end if;
  if old.status <> 'running' then raise exception 'append_only:run % is already finished', old.run_id using errcode = '23514'; end if;
  if new.status = 'running' then raise exception 'append_only:a run update must finish the run' using errcode = '23514'; end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then raise exception 'append_only:runs allow only the finishing columns to change' using errcode = '23514'; end if;
  new.finished_at := now();
  return new;
end $$;
drop trigger if exists broker_runs_lifecycle on public.broker_report_runs;
create trigger broker_runs_lifecycle before insert or update or delete on public.broker_report_runs
  for each row execute function public.broker_runs_lifecycle();

-- ---------------------------------------------------------------- triggers: reports (§4.4 broker_reports_guard)
-- Insert as draft only. draft→published only under set_config('broker.publishing', report_id)
-- (broker_report_publish) and only status/current_publication_id/title_restricted change;
-- published→published only updated_at/evidence_ok/disclosure_ok/supersedes_report_id;
-- published→draft only under 'broker.unpublishing' (status, revision+1, current_publication_id,
-- review_status); →withdrawn only under 'broker.withdrawing' (the document cascade); withdrawn is
-- terminal; draft→draft never touches revision/current_publication_id/document_id/created_at.
create or replace function public.broker_reports_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  k_pub   text[] := array['status','current_publication_id','updated_at','title_restricted'];
  k_live  text[] := array['updated_at','evidence_ok','disclosure_ok','supersedes_report_id'];
  k_unpub text[] := array['status','revision','current_publication_id','review_status','updated_at'];
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_research_reports rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.current_publication_id is not null or new.revision <> 1 then raise exception 'publish_direct_forbidden:insert'; end if;
    return new;
  end if;
  new.updated_at := now();
  if old.status = 'withdrawn' then
    if (to_jsonb(new) - 'updated_at') <> (to_jsonb(old) - 'updated_at') then raise exception 'report_withdrawn'; end if;
    return new;
  end if;
  if new.status = 'withdrawn' then
    if current_setting('broker.withdrawing', true) is distinct from new.report_id::text
       or (to_jsonb(new) - array['status','updated_at']) <> (to_jsonb(old) - array['status','updated_at']) then
      raise exception 'withdraw_direct_forbidden';
    end if;
    return new;
  end if;
  if old.status = 'draft' and new.status = 'published' then
    if current_setting('broker.publishing', true) is distinct from new.report_id::text then raise exception 'publish_direct_forbidden'; end if;
    if (to_jsonb(new) - k_pub) <> (to_jsonb(old) - k_pub) or new.current_publication_id is null then raise exception 'publish_direct_forbidden:columns'; end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'published' then
    if (to_jsonb(new) - k_live) <> (to_jsonb(old) - k_live) then raise exception 'published_immutable'; end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'draft' then
    if current_setting('broker.unpublishing', true) is distinct from new.report_id::text then raise exception 'unpublish_direct_forbidden'; end if;
    if new.revision <> old.revision + 1 or (to_jsonb(new) - k_unpub) <> (to_jsonb(old) - k_unpub) then raise exception 'unpublish_direct_forbidden:columns'; end if;
    return new;
  end if;
  if new.revision <> old.revision or new.current_publication_id is distinct from old.current_publication_id
     or new.document_id <> old.document_id or new.created_at <> old.created_at then
    raise exception 'report_column_managed';
  end if;
  return new;
end $$;
drop trigger if exists broker_reports_guard on public.broker_research_reports;
create trigger broker_reports_guard before insert or update or delete on public.broker_research_reports
  for each row execute function public.broker_reports_guard();

-- ---------------------------------------------------------------- triggers: child tables (§4.4, §4.6, §4.9)
-- A published report freezes targets, overrides, fields, snippets, summaries and analyst bindings;
-- the one exception is a snippet/summary falling back to draft|rejected (only status, approved_*,
-- draft_reason change). Fields, snippets and summaries are never deleted. Field identity and
-- extracted values are immutable; status moves: never into 'extracted', never into 'absent', an
-- absent row may only become rejected; superseded_by_run_id is set once. Analyst bindings must
-- point at an 'analyst' row of the same report.
create or replace function public.broker_report_child_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  v_report uuid; v_status text;
  k_fall  text[] := array['status','approved_by','approved_at','draft_reason'];
  k_field text[] := array['status','corrected','reviewed_by','reviewed_at','superseded_by_run_id','detail','page','char_start','char_end','value_source_text'];
begin
  if tg_op = 'DELETE' then v_report := old.report_id; else v_report := new.report_id; end if;
  if tg_op = 'UPDATE' and new.report_id <> old.report_id then raise exception 'child_report_immutable'; end if;
  if tg_op = 'DELETE' and tg_table_name in ('broker_report_fields','broker_report_snippets','broker_report_summaries') then
    raise exception 'append_only:% rows are never deleted', tg_table_name using errcode = '23514';
  end if;
  select r.status into v_status from public.broker_research_reports r where r.report_id = v_report;
  if v_status = 'published' then
    if tg_op = 'UPDATE' and tg_table_name in ('broker_report_snippets','broker_report_summaries')
       and new.status in ('draft','rejected') and (to_jsonb(new) - k_fall) = (to_jsonb(old) - k_fall) then
      return new;
    end if;
    raise exception 'published_immutable:%', tg_table_name;
  end if;
  if tg_table_name = 'broker_report_fields' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - k_field) <> (to_jsonb(old) - k_field) then raise exception 'field_immutable'; end if;
    if old.superseded_by_run_id is not null and new.superseded_by_run_id is distinct from old.superseded_by_run_id then raise exception 'field_superseded_once'; end if;
    if new.status <> old.status and (new.status in ('extracted','absent') or (old.status = 'absent' and new.status <> 'rejected')) then
      raise exception 'field_transition_invalid:%->%', old.status, new.status;
    end if;
  end if;
  if tg_table_name = 'broker_report_analysts' and tg_op <> 'DELETE'
     and not exists (select 1 from public.broker_report_fields f where f.field_id = new.field_id and f.report_id = new.report_id and f.field = 'analyst') then
    raise exception 'analyst_field_mismatch';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['broker_report_targets','broker_report_target_overrides','broker_report_fields','broker_report_snippets','broker_report_summaries','broker_report_analysts'] loop
    execute format('drop trigger if exists broker_report_child_guard on public.%I', t);
    execute format('create trigger broker_report_child_guard before insert or update or delete on public.%I for each row execute function public.broker_report_child_guard()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- triggers: publications (§4.8)
create or replace function public.broker_publications_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_publications rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if current_setting('broker.publishing', true) is distinct from new.report_id::text then raise exception 'publish_direct_forbidden:publication'; end if;
    if new.unpublished_at is not null then raise exception 'publish_direct_forbidden:publication'; end if;
    return new;
  end if;
  if old.unpublished_at is not null or new.unpublished_at is null
     or (to_jsonb(new) - array['unpublished_at','unpublish_reason']) <> (to_jsonb(old) - array['unpublished_at','unpublish_reason']) then
    raise exception 'append_only:publications are immutable except one unpublished_at' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists broker_publications_guard on public.broker_report_publications;
create trigger broker_publications_guard before insert or update or delete on public.broker_report_publications
  for each row execute function public.broker_publications_guard();

-- ---------------------------------------------------------------- triggers: entities (§4.9)
create or replace function public.broker_rating_scales_close_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:research_rating_scales rows are never deleted' using errcode = '23514'; end if;
  if old.valid_to is not null then raise exception 'scale_closed'; end if;
  if new.valid_to is null or (to_jsonb(new) - array['valid_to','closed_by','closed_at']) <> (to_jsonb(old) - array['valid_to','closed_by','closed_at']) then
    raise exception 'scale_close_only';
  end if;
  if new.closed_by is null then raise exception 'scale_closed_by_required'; end if;
  new.closed_at := now();
  return new;
end $$;
drop trigger if exists broker_rating_scales_close_only on public.research_rating_scales;
create trigger broker_rating_scales_close_only before update or delete on public.research_rating_scales
  for each row execute function public.broker_rating_scales_close_only();

create or replace function public.broker_analysts_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:research_analysts rows are never deleted' using errcode = '23514'; end if;
  if new.analyst_id <> old.analyst_id or new.institution_id <> old.institution_id or new.created_at <> old.created_at then raise exception 'analyst_immutable'; end if;
  return new;
end $$;
drop trigger if exists broker_analysts_guard on public.research_analysts;
create trigger broker_analysts_guard before update or delete on public.research_analysts
  for each row execute function public.broker_analysts_guard();

create or replace function public.broker_analyst_disclosure_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.public_display, new.display_name, new.name_variants) is not distinct from (old.public_display, old.display_name, old.name_variants) then return null; end if;
  update public.broker_research_reports r set disclosure_ok = false
  where r.report_id in (select a.report_id from public.broker_report_analysts a where a.analyst_id = new.analyst_id) and r.status <> 'withdrawn' and r.disclosure_ok;
  update public.broker_report_snippets s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'analyst_disclosure'
  where s.status = 'approved' and s.report_id in (select a.report_id from public.broker_report_analysts a where a.analyst_id = new.analyst_id);
  update public.broker_report_summaries s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'analyst_disclosure'
  where s.status = 'approved' and s.report_id in (select a.report_id from public.broker_report_analysts a where a.analyst_id = new.analyst_id);
  return null;
end $$;
drop trigger if exists analyst_disclosure_change on public.research_analysts;
create trigger analyst_disclosure_change after update of public_display, display_name, name_variants on public.research_analysts
  for each row execute function public.broker_analyst_disclosure_change();

-- ---------------------------------------------------------------- triggers: outbox (§4.10)
create or replace function public.broker_outbox_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_outbox rows are never deleted' using errcode = '23514'; end if;
  if (new.event_id, new.kind, new.payload, new.created_at) is distinct from (old.event_id, old.kind, old.payload, old.created_at) then
    raise exception 'append_only:outbox events change only status, attempts, last_error, delivered_at' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists broker_outbox_guard on public.broker_outbox;
create trigger broker_outbox_guard before update or delete on public.broker_outbox
  for each row execute function public.broker_outbox_guard();

-- ---------------------------------------------------------------- 4.13 table privileges
-- RLS on, no policies: service_role (bypassrls) is the only reader/writer; anon/authenticated get
-- nothing (Supabase grants ALL on new public tables by default and RLS does not stop TRUNCATE).
-- settings has no insert/delete (singleton row created above).
do $$ declare t text; begin
  foreach t in array array['broker_research_settings','broker_report_licences','broker_report_upload_intents','broker_report_documents','broker_report_runs',
    'broker_research_reports','broker_report_targets','broker_report_target_overrides','broker_report_fields','broker_report_snippets','broker_report_summaries',
    'broker_report_publications','broker_report_rule_receipts','broker_purge_steps','research_institutions','research_rating_scales','research_analysts',
    'broker_report_analysts','broker_report_access_log','broker_eval_receipts','broker_outbox'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    if t = 'broker_research_settings' then
      execute format('grant select, update on public.%I to service_role', t);
    else
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
end $$;
```

- [ ] **Step 4: 运行，确认通过**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
```

Expected: PASS（块 1 九个用例）。若 `published_immutable|null value` 用例因 `security_ticker` 非空先报 `null value` 也可接受（该断言故意允许二者之一）。

- [ ] **Step 5: `criticalSuites` 与类型**

`scripts/ci/research-checks.ts`：在 `criticalSuites` 的 `.concat(...)` 参数列表末尾追加（JSON 风格数组无法放围栏注释时，行尾注释即围栏）：

```ts
  'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts',
  // FOREIGN ↓
  'src/lib/broker-research/broker-research.integration.test.ts',
  // FOREIGN ↑
);
```

（即把原来最后一个参数后的 `)` 拆开；不改其他项。）

`src/lib/supabase/database.types.ts`：在 `export type Database` 之前追加接口，在 `Tables` 对象末尾（`fact_sync_scope` 之后）追加 21 条登记，都包在围栏里：

```ts
// FOREIGN ↓ broker research (supabase/migrations/20261113090000_broker_research.sql). Service-role
// only; numeric columns are typed string (adapters select them ::text, spec 契约补充).
export interface BrokerResearchSettings { id: 1; public_enabled: boolean; approved_gold_corpus_hash: string | null; approved_gold_corpus_by: string | null; approved_gold_corpus_at: string | null; updated_by: string | null; updated_at: string }
export interface BrokerReportLicence { licence_id: string; version: number; source_label: string; licence_kind: 'terminal_subscription' | 'direct_from_broker' | 'owner_authored' | 'other'; holder: string; terms_summary: string; evidence_path: string | null; allows_llm_processing: boolean; allows_public_metadata: boolean; allows_public_snippets: boolean; allows_public_summary: boolean; allows_public_target_price: boolean; snippet_max_chars: number; valid_from: string; valid_to: string | null; confirmed_by: string | null; confirmed_at: string | null; confirmed_version: number | null; created_at: string; updated_at: string }
export interface BrokerReportUploadIntent { intent_id: string; sha256: string; byte_size: number; licence_id: string; original_filename: string; created_by: string; created_at: string; expires_at: string; status: 'open' | 'validating' | 'validated' | 'promoting' | 'committed' | 'expired' | 'abandoned'; staging_path: string; document_id: string | null; error_code: string | null; checkpoint_at: string | null }
export interface BrokerReportDocument { document_id: string; sha256: string; storage_path: string; byte_size: number; page_count: number | null; licence_id: string; uploaded_by: string; uploaded_at: string; original_filename: string; current_parse_run_id: string | null; status: 'uploaded' | 'parsing' | 'parsed' | 'parse_failed' | 'withdrawn'; lease_token: string | null; lease_until: string | null; promotion_pending: boolean; last_verified_at: string | null; verify_status: 'ok' | 'failed' | 'error' | null; withdrawn_at: string | null; withdrawn_reason: string | null; purged_at: string | null }
export interface BrokerReportRun { run_id: string; document_id: string; kind: 'parse' | 'extract' | 'summary' | 'translate' | 'verify'; parse_run_id: string | null; extractor_version: string | null; artifact_path: string | null; artifact_hash: string | null; model_id: string | null; registry_hash: string | null; prompt_version: string | null; schema_version: string | null; code_version: string; behavior_digest: string | null; licence_version: number; request_path: string | null; response_path: string | null; batch_id: string | null; status: 'running' | 'succeeded' | 'failed'; started_at: string; finished_at: string | null; detail: Record<string, unknown> }
export interface BrokerResearchReport { report_id: string; document_id: string; revision: number; scope: 'single_issuer' | 'multi_issuer' | 'sector' | 'macro_strategy' | null; institution_id: string | null; title_original: string | null; title_lang: string | null; title_zh: string | null; title_en: string | null; title_run_id: string | null; title_public: string | null; title_public_by: string | null; published_date: string | null; price_as_of_date: string | null; report_type: string | null; sector_as_stated: string | null; primary_target_key: string | null; effective_hash: string | null; materialized_hash: string | null; rules_input_hash: string | null; summary_input_digest: string | null; title_restricted: boolean; evidence_ok: boolean; disclosure_ok: boolean; review_status: 'pending' | 'in_review' | 'approved' | 'rejected'; status: 'draft' | 'published' | 'withdrawn'; current_publication_id: string | null; supersedes_report_id: string | null; code_version: string; created_at: string; updated_at: string }
export interface BrokerReportTarget { report_id: string; target_key: string; basis: 'candidate' | 'effective'; ticker_as_stated: string; security_ticker: string | null; issuer_id: string | null; resolution: Record<string, unknown>; rating_raw: string | null; rating_normalized: string | null; scale_id: string | null; target_price: string | null; target_currency: string | null; target_horizon_months: number | null; price_at_report: string | null; price_currency: string | null; price_as_of_date: string | null; upside_pct: string | null; upside_formula_version: string | null; input_hash: string }
export interface BrokerReportTargetOverride { override_id: string; report_id: string; target_key: string; security_ticker: string; issuer_id: string | null; set_by: string; set_at: string; note: string | null }
export interface BrokerReportField { field_id: string; report_id: string; parse_run_id: string | null; run_id: string | null; superseded_by_run_id: string | null; target_key: string | null; field: string; occurrence: number; value_text: string; value_num: string | null; value_currency: string | null; value_unit: 'pct' | 'ratio' | 'months' | 'price' | null; value_date: string | null; page: number | null; char_start: number | null; char_end: number | null; value_source_text: string | null; extractor: string; extractor_confidence: number | null; status: 'extracted' | 'unverified' | 'confirmed' | 'corrected' | 'rejected' | 'absent'; corrected: Record<string, unknown> | null; conflict_group: string | null; detail: Record<string, unknown>; reviewed_by: string | null; reviewed_at: string | null; created_at: string }
export interface BrokerReportSnippet { snippet_id: string; report_id: string; target_key: string | null; purpose: 'rating' | 'target' | 'thesis' | 'risk' | 'method' | 'other'; parse_run_id: string; page: number; char_start: number; char_end: number; text: string | null; field_id: string | null; status: 'draft' | 'approved' | 'rejected'; disclosure_check: Record<string, unknown> | null; draft_reason: string | null; approved_by: string | null; approved_at: string | null; created_by: string; created_at: string }
export interface BrokerReportSummary { summary_id: string; report_id: string; lang: 'zh' | 'en'; kind: 'independent_summary'; run_id: string; input_hash: string; summary_md: string; max_verbatim_overlap: number; numeric_grounding: Record<string, unknown>; disclosure_check: Record<string, unknown>; status: 'draft' | 'approved' | 'rejected'; draft_reason: string | null; approved_by: string | null; approved_at: string | null; generated_at: string }
export interface BrokerReportPublication { publication_id: string; report_id: string; revision: number; snapshot: Record<string, unknown>; snapshot_hash: string; licence_version: number; rules_receipt_id: string; eval_receipt_id: string | null; published_at: string; published_by: string; unpublished_at: string | null; unpublish_reason: string | null }
export interface BrokerReportRuleReceipt { receipt_id: string; report_id: string; rules_version: string; input_hash: string; results: Record<string, unknown>[]; code_version: string; created_at: string }
export interface BrokerPurgeStep { document_id: string; step: 'pdf' | 'artifacts' | 'runs' | 'fields_text' | 'snippets_text' | 'summaries' | 'quarantine_payload'; status: 'pending' | 'done' | 'failed'; attempts: number; last_error: string | null; at: string }
export interface ResearchInstitution { institution_id: string; name_en: string; name_zh: string | null; aliases: string[]; kind: string | null; rating_disclosure_url: string | null; created_at: string }
export interface ResearchRatingScale { scale_id: string; institution_id: string; raw_label: string; normalized: 'buy' | 'overweight' | 'neutral' | 'underweight' | 'sell' | 'not_rated'; source_url: string; valid_from: string; valid_to: string | null; created_by: string; created_at: string; closed_by: string | null; closed_at: string | null }
export interface ResearchAnalyst { analyst_id: string; institution_id: string; display_name: string; name_variants: string[]; public_display: boolean; created_at: string }
export interface BrokerReportAnalyst { report_id: string; analyst_id: string; role: string | null; field_id: string }
export interface BrokerReportAccessLog { id: string; document_id: string | null; user_id: string; action: string; detail: Record<string, unknown>; created_at: string }
export interface BrokerEvalReceipt { receipt_id: string; corpus_kind: 'gold' | 'synthetic'; corpus_hash: string; behavior_digest: string; extractor_version: string; model_id: string; registry_hash: string; prompt_version: string; schema_version: string; code_version: string; n_docs: number; per_field: Record<string, unknown>; absence: Record<string, unknown>; precision_min: number | null; recall_min: number | null; passed: boolean; ran_at: string; ran_by: string }
export interface BrokerOutboxEvent { event_id: string; kind: 'claim.register' | 'claim.revise' | 'claim.retract' | 'licence.changed' | 'mapping.changed'; payload: Record<string, unknown>; status: 'pending' | 'delivered' | 'failed'; attempts: number; last_error: string | null; created_at: string; delivered_at: string | null }
// FOREIGN ↑
```

`Tables` 末尾：

```ts
      // FOREIGN ↓
      broker_research_settings: { Row: BrokerResearchSettings; Insert: Partial<BrokerResearchSettings>; Update: Partial<BrokerResearchSettings> };
      broker_report_licences: { Row: BrokerReportLicence; Insert: Partial<BrokerReportLicence>; Update: Partial<BrokerReportLicence> };
      broker_report_upload_intents: { Row: BrokerReportUploadIntent; Insert: Partial<BrokerReportUploadIntent>; Update: Partial<BrokerReportUploadIntent> };
      broker_report_documents: { Row: BrokerReportDocument; Insert: Partial<BrokerReportDocument>; Update: Partial<BrokerReportDocument> };
      broker_report_runs: { Row: BrokerReportRun; Insert: Partial<BrokerReportRun>; Update: Partial<BrokerReportRun> };
      broker_research_reports: { Row: BrokerResearchReport; Insert: Partial<BrokerResearchReport>; Update: Partial<BrokerResearchReport> };
      broker_report_targets: { Row: BrokerReportTarget; Insert: Partial<BrokerReportTarget>; Update: Partial<BrokerReportTarget> };
      broker_report_target_overrides: { Row: BrokerReportTargetOverride; Insert: Partial<BrokerReportTargetOverride>; Update: Partial<BrokerReportTargetOverride> };
      broker_report_fields: { Row: BrokerReportField; Insert: Partial<BrokerReportField>; Update: Partial<BrokerReportField> };
      broker_report_snippets: { Row: BrokerReportSnippet; Insert: Partial<BrokerReportSnippet>; Update: Partial<BrokerReportSnippet> };
      broker_report_summaries: { Row: BrokerReportSummary; Insert: Partial<BrokerReportSummary>; Update: Partial<BrokerReportSummary> };
      broker_report_publications: { Row: BrokerReportPublication; Insert: Partial<BrokerReportPublication>; Update: Partial<BrokerReportPublication> };
      broker_report_rule_receipts: { Row: BrokerReportRuleReceipt; Insert: Partial<BrokerReportRuleReceipt>; Update: Partial<BrokerReportRuleReceipt> };
      broker_purge_steps: { Row: BrokerPurgeStep; Insert: Partial<BrokerPurgeStep>; Update: Partial<BrokerPurgeStep> };
      research_institutions: { Row: ResearchInstitution; Insert: Partial<ResearchInstitution>; Update: Partial<ResearchInstitution> };
      research_rating_scales: { Row: ResearchRatingScale; Insert: Partial<ResearchRatingScale>; Update: Partial<ResearchRatingScale> };
      research_analysts: { Row: ResearchAnalyst; Insert: Partial<ResearchAnalyst>; Update: Partial<ResearchAnalyst> };
      broker_report_analysts: { Row: BrokerReportAnalyst; Insert: Partial<BrokerReportAnalyst>; Update: Partial<BrokerReportAnalyst> };
      broker_report_access_log: { Row: BrokerReportAccessLog; Insert: Partial<BrokerReportAccessLog>; Update: Partial<BrokerReportAccessLog> };
      broker_eval_receipts: { Row: BrokerEvalReceipt; Insert: Partial<BrokerEvalReceipt>; Update: Partial<BrokerEvalReceipt> };
      broker_outbox: { Row: BrokerOutboxEvent; Insert: Partial<BrokerOutboxEvent>; Update: Partial<BrokerOutboxEvent> };
      // FOREIGN ↑
```

- [ ] **Step 6: 全量 DB 门禁、typecheck、lint**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
npm run typecheck && npm run lint
```

Expected: 全绿（`test:migrations` 的 fresh/seeded 对比也覆盖新表；`verifyCriticalSuiteInventory` 不再漂移）。

- [ ] **Step 7: 锁定迁移**（测试全绿之后；锁定后此文件不可再改）

```bash
node -e "const fs=require('fs'),c=require('crypto');const f='20261113090000_broker_research.sql';const p='supabase/migrations.lock.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.migrations.some(m=>m.file===f))throw new Error('already locked');j.migrations.push({file:f,sha256:c.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+f)).digest('hex')});fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
npx tsx -e "import('./scripts/ci/research-checks.ts').then(m=>{m.migrationInventory();console.log('inventory ok')})"
```

Expected: `inventory ok`；`git diff supabase/migrations.lock.json` 只在数组末尾多一项。

- [ ] **Step 8: 实施记录 + 提交**

`docs/audits/2026-11-06-foreign-research/10-implementation-log.md` 追加一行：`| A1 | 20261113090000_broker_research.sql 锁定；21 表 + 表级触发器；集成块 1 | <sha 待填> |`。

```bash
git add supabase/migrations/20261113090000_broker_research.sql supabase/migrations.lock.json src/lib/broker-research/broker-research.integration.test.ts scripts/ci/research-checks.ts src/lib/supabase/database.types.ts docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): FR-0 migration 1 — 21 tables, bucket, grants, table triggers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task A2: 迁移二 —— 全部 SQL 函数与函数型触发器

**Files:**
- Create: `supabase/migrations/20261113091000_broker_research_functions.sql`
- Modify: `src/lib/broker-research/broker-research.integration.test.ts`（追加块 2）
- Modify: `supabase/migrations.lock.json`（末尾追加一条）
- Modify: `docs/audits/2026-11-06-foreign-research/10-implementation-log.md`

依赖：A1（表）、B1（`src/lib/broker-research/versions.ts` 的常量，测试 import）。

- [ ] **Step 1: 写失败的集成测试（块 2）**

在 `broker-research.integration.test.ts` 顶部 import 区追加：

```ts
import {CLAIM_METHODOLOGY_VERSION,DISCLOSURE_VERSION,RULES_VERSION,UPSIDE_FORMULA_VERSION} from './versions';
```

文件末尾追加：

```ts
// ---- shared by blocks 2–4 (A2 writes these; A3/A5 reuse them). Each block's beforeAll rebinds
// the pool; describes run sequentially within this file, so the module-level bindings are safe.
const M2='supabase/migrations/20261113091000_broker_research_functions.sql';
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
 const report=async(rep:string)=>(await s.q(`select * from public.broker_research_reports where report_id=$1`,[rep]))[0];
 const targets=(rep:string)=>s.q(`select target_key,basis,ticker_as_stated,security_ticker,issuer_id,rating_raw,rating_normalized,scale_id,target_price::text tp,target_currency,target_horizon_months,price_at_report::text pr,price_currency,price_as_of_date::text pd,upside_pct::text up,upside_formula_version from public.broker_report_targets where report_id=$1 order by target_key`,[rep]);
 const cand=(o:Record<string,unknown>)=>({target_key:null,occurrence:1,value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',extractor:'llm:m-test@r',extractor_confidence:0.9,conflict_group:null,detail:{},status:'extracted',...o});
 const live=(rep:string,field:string,tk:string|null=null)=>s.q(`select field_id,status from public.broker_report_fields where report_id=$1 and field=$2 and target_key is not distinct from $3 and status in ('extracted','unverified') and superseded_by_run_id is null order by created_at,field_id`,[rep,field,tk]);
 const batch=async()=>await s.one(`insert into public.ingest_batches(batch_id,producer,dataset) values(gen_random_uuid(),'broker-research-extract','broker_research') returning batch_id v`) as string;
 const outbox=(kind:string,pub:string)=>s.q(`select payload from public.broker_outbox where kind=$1 and payload->'source'->>'publication_id'=$2 order by payload->>'claim_key'`,[kind,pub]);
 const GOLD=sha('gold-corpus');
 const TARGET_FIELDS=['ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date'];
 /** A single-issuer draft through extract_commit: 3 report-level + 7 target candidates for one HK ticker. */
 const world=async(o:{licence?:Record<string,unknown>;extra?:(tk:string)=>Record<string,unknown>[];tickers?:number;tk?:string;issuer?:string;inst?:string;published?:string}={})=>{
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
   cand({field:'target_price',target_key:tk,value_text:'120',value_num:'120',value_unit:'price'}),
   cand({field:'target_currency',target_key:tk,value_text:'HK$',value_currency:'HKD'}),
   cand({field:'price_at_report',target_key:tk,value_text:'100',value_num:'100',value_unit:'price'}),
   cand({field:'price_currency',target_key:tk,value_text:'HKD',value_currency:'HKD'}),
   cand({field:'price_as_of_date',target_key:tk,value_text:'4 Mar 2026',value_date:'2026-03-04'}),
   ...(o.extra?.(tk)??[])));
  const receipt=await commit(doc,token,ext,rows);
  return {tk:tks[0],tks,iss:issuers[0],issuers,lic,doc,pr,rep,ext,token,digest,inst:o.inst??await s.institution(),receipt};
 };
 type World=Awaited<ReturnType<typeof world>>;
 const rules=async(rep:string,results?:unknown[])=>{
  const r=await report(rep);
  const surfaces=['title_original','title_public','title_zh','title_en'].filter(k=>r[k]!==null);
  const def=surfaces.map(surface=>({rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface,hits:[]}}));
  return await s.one(`insert into public.broker_report_rule_receipts(report_id,rules_version,input_hash,results,code_version) values($1,$2,$3,$4::jsonb,'test') returning receipt_id v`,[rep,RULES_VERSION,r.rules_input_hash,J(results??def)]) as string;
 };
 const allFields=['institution','published_date','title',...TARGET_FIELDS];
 const gold=async(digest:string,o:{passed?:boolean;perField?:Record<string,unknown>;nDocs?:number;kind?:string}={})=>{
  await s.q(`update public.broker_research_settings set approved_gold_corpus_hash=$1 where id=1`,[GOLD]);
  const pf=o.perField??Object.fromEntries(allFields.map(f=>[f,{tp:5,fp:0,fn:0,precision:1,recall:1}]));
  const ok=o.passed??true;
  await s.q(`insert into public.broker_eval_receipts(corpus_kind,corpus_hash,behavior_digest,extractor_version,model_id,registry_hash,prompt_version,schema_version,code_version,n_docs,per_field,absence,precision_min,recall_min,passed,ran_by,ran_at) values($1,$2,$3,'f3/1','m-test','r','p','s','t',$4,$5::jsonb,'{"tp":0,"fp":0,"fn":0}',$6,$6,$7,gen_random_uuid(),clock_timestamp())`,[o.kind??'gold',GOLD,digest,o.nDocs??30,J(pf),ok?1:0.5,ok]);
 };
 /** world → every candidate confirmed, institution/scope bound, scale row, rules receipt, review approved, gold receipt: blockers []. */
 const ready=async(o:Parameters<typeof world>[0]={}):Promise<World>=>{
  const w=await world(o);
  for(const f of await s.q(`select field_id from public.broker_report_fields where report_id=$1 and status in ('extracted','unverified') and superseded_by_run_id is null`,[w.rep]))await review(f.field_id,'confirm');
  await s.q(`update public.broker_research_reports set institution_id=$2,scope=$3,review_status='approved' where report_id=$1`,[w.rep,w.inst,w.tks.length>1?'multi_issuer':'single_issuer']);
  await s.q(`insert into public.research_rating_scales(institution_id,raw_label,normalized,source_url,valid_from,created_by) values($1,'Buy','buy','https://example.test/scale','2020-01-01',gen_random_uuid()) on conflict (institution_id, lower(raw_label), valid_from) do nothing`,[w.inst]);
  await materialize(w.rep);await rules(w.rep);await gold(w.digest);
  expect(await blockers(w.rep)).toEqual([]);
  return w;
 };


describe.skipIf(!enabled)('A2 broker research SQL functions and function-backed triggers',()=>{
 beforeAll(bind);
 afterAll(async()=>{await pool?.end();});
 it('function grants: module RPCs are service_role only, internal helpers no client role; migration replays',async()=>{
  const fn=(role:string,sig:string)=>s.one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  const rpcs=['public.broker_field_effective(jsonb,text,numeric,text,text,date)','public.broker_report_materialize(uuid)','public.broker_field_review(uuid,text,jsonb,uuid)','public.broker_field_add(uuid,jsonb,uuid)','public.broker_target_override(uuid,text,text,uuid,uuid,text)','public.broker_extract_commit(uuid,uuid,uuid,jsonb)','public.broker_report_publish_blockers(uuid)','public.broker_report_publish(uuid,uuid)','public.broker_report_unpublish(uuid,uuid,text)','public.broker_quarantine_resolve(uuid,text,uuid,jsonb)','public.broker_document_claim_lease(uuid,uuid,integer)','public.broker_document_fenced_update(uuid,uuid,jsonb,boolean)','public.broker_run_finish(uuid,uuid,jsonb)','public.broker_outbox_mark(uuid,boolean,text)','public.broker_purge_step_record(uuid,text,boolean,text)'];
  for(const sig of rpcs){for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});}
  for(const sig of ['public.broker_sha256(text)','public.broker_lock_draft(uuid)','public.broker_report_picks(uuid)','public.broker_report_effective_rows(uuid)','public.broker_report_live_digests(uuid)','public.broker_outbox_retract(uuid,text)'])
   for(const role of ['anon','authenticated','service_role'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
  await expect(replayMigration(pool,readFileSync(M2,'utf8'))).resolves.toBeUndefined();
 },60000);

 it('broker_field_effective: a present corrected key wins (explicit null clears), a missing key inherits',async()=>{
  const v=await s.one(`select public.broker_field_effective('{"value_text":"121","value_currency":null}'::jsonb,'120',120.50,'HKD','price','2026-01-01') v`);
  expect(v).toEqual({value_text:'121',value_num:'120.50',value_currency:null,value_unit:'price',value_date:'2026-01-01'});
  expect(await s.one(`select public.broker_field_effective(null,'x',null,null,null,null) v`)).toEqual({value_text:'x',value_num:null,value_currency:null,value_unit:null,value_date:null});
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
  const su=await s.one(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check,status,approved_by) values($1,'en',$2,$3,'Summary',1,'{"passed":true}',$4,'approved',gen_random_uuid()) returning summary_id v`,[w.rep,w.ext,d,J(PASS)]);
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
  await review(ratings[1].field_id,'confirm');
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
  expect((await fails(publish(p.rep).then(()=>review((await s.q(`select field_id from public.broker_report_fields where report_id=$1 limit 1`,[p.rep]))[0].field_id,'reject'))))).toMatchObject({message:'published_immutable'});
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
  expect(snap.fields.length).toBe((await s.q(`select 1 from public.broker_report_fields where report_id=$1 and status in ('confirmed','corrected','absent')`,[p.rep])).length);
  expect(snap.fields[0]).toHaveProperty('artifact_hash');expect(snap.fields[0]).toHaveProperty('value');
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
  const ins=(text:string,check:unknown=PASS)=>s.one(`insert into public.broker_report_snippets(report_id,purpose,parse_run_id,page,char_start,char_end,text,disclosure_check,created_by) values($1,'thesis',$2,1,0,$3,$4,$5::jsonb,gen_random_uuid()) returning snippet_id v`,[w.rep,w.pr,text.length,text,J(check)]) as Promise<string>;
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
  const sum=(o:Record<string,unknown>)=>s.one(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check) values($1,'en',$2,$3,'S',$4,$5::jsonb,$6::jsonb) returning summary_id v`,[w.rep,w.ext,o.hash??dg,o.overlap??1,J(o.grounding??{passed:true}),J(o.check??PASS)]) as Promise<string>;
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
  const run3=randomUUID();await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,extractor_version,code_version,licence_version) values($1,$2,'parse','f3/1','t',1)`,[run3,doc]);
  const s3=(await s.q(`select sha256 from public.broker_report_documents where document_id=$1`,[doc]))[0].sha256;
  expect(await s.one(`select public.broker_run_finish($1,$2,$3::jsonb) v`,[run3,b,J({status:'succeeded',artifact_path:`reports/${s3}.extract.${run3}.json`,artifact_hash:sha('a'),detail:{chunks:1}})])).toBe('ok');
  expect((await fails(s.one(`select public.broker_run_finish($1,$2,'{"status":"failed"}'::jsonb) v`,[run3,b])))).toMatchObject({message:'run_finished'});
  expect(await s.one(`select public.broker_document_fenced_update($1,$2,$3::jsonb,true) v`,[doc,b,J({status:'parsed',current_parse_run_id:run3,page_count:4})])).toBe('ok');
  expect((await s.q(`select status,lease_token,page_count from public.broker_report_documents where document_id=$1`,[doc]))[0]).toEqual({status:'parsed',lease_token:null,page_count:4});
  const ev=await s.one(`insert into public.broker_outbox(kind,payload) values('licence.changed','{}') returning event_id v`);
  for(let i=0;i<9;i++)await s.q(`select public.broker_outbox_mark($1,false,'boom')`,[ev]);
  expect((await s.q(`select status,attempts from public.broker_outbox where event_id=$1`,[ev]))[0]).toEqual({status:'pending',attempts:9});
  await s.q(`select public.broker_outbox_mark($1,false,'boom')`,[ev]);
  expect((await s.q(`select status,attempts,last_error from public.broker_outbox where event_id=$1`,[ev]))[0]).toEqual({status:'failed',attempts:10,last_error:'boom'});
  const ev2=await s.one(`insert into public.broker_outbox(kind,payload) values('licence.changed','{}') returning event_id v`);
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
```

注：`field_review` 用例最后一段把 `publish(...).then(()=>review(...))` 串起来，是为了断言**已发布**报告上复核被拒（`published_immutable`）。

- [ ] **Step 2: 运行，确认失败**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
```

Expected: 块 1 PASS；块 2 FAIL，报 `function public.broker_document_claim_lease(uuid, uuid, integer) does not exist`。

- [ ] **Step 3: 写迁移 `supabase/migrations/20261113091000_broker_research_functions.sql`**

```sql
-- supabase/migrations/20261113091000_broker_research_functions.sql
-- FR-0 (spec §4.4–§4.8, §6.2, §6.3, §6.5, §7.3, §10.2): every SQL function of the broker research
-- module and the triggers that depend on them. Hashes are computed HERE only (plan 契约补充):
-- broker_report_live_digests recomputes effective_hash / rules_input_hash / summary_input_digest
-- from the live tables; materialize stores them; publish_blockers #11 compares stored vs live.
-- Lock order everywhere: licence (share) → document → report → quarantine item is never taken
-- after a report lock except in broker_quarantine_resolve (item → report), which no other path
-- reverses. Every report-changing RPC starts with broker_lock_draft (select … for update; published
-- → published_immutable; withdrawn → report_withdrawn).
-- Errors: raise exception '<code>[:<detail>]' (lease_lost uses 55P03, not-found codes P0002).
-- Every client-callable function: revoke execute from public, anon, authenticated; grant to
-- service_role. Internal helpers: revoked from service_role too (they run inside security definer
-- callers as the owner). Trigger functions are security definer so they may call the helpers.
-- Replayable: create or replace function, drop trigger if exists + create trigger.

-- ---------------------------------------------------------------- helpers
create or replace function public.broker_sha256(p text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;
revoke execute on function public.broker_sha256(text) from public, anon, authenticated, service_role;

-- Effective value selector (spec §4.6): for each component a present `corrected` key wins (JSON
-- null = explicit clear), a missing key inherits the extracted value. value_num/value_date come
-- back as JSON strings ('120.50', '2026-01-02'). The §4.11 views inline the same rule.
create or replace function public.broker_field_effective(p_corrected jsonb, p_value_text text, p_value_num numeric, p_value_currency text, p_value_unit text, p_value_date date)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'value_text',     case when p_corrected ? 'value_text'     then p_corrected -> 'value_text'     else to_jsonb(p_value_text) end,
    'value_num',      case when p_corrected ? 'value_num'      then p_corrected -> 'value_num'      else to_jsonb(p_value_num::text) end,
    'value_currency', case when p_corrected ? 'value_currency' then p_corrected -> 'value_currency' else to_jsonb(p_value_currency) end,
    'value_unit',     case when p_corrected ? 'value_unit'     then p_corrected -> 'value_unit'     else to_jsonb(p_value_unit) end,
    'value_date',     case when p_corrected ? 'value_date'     then p_corrected -> 'value_date'     else to_jsonb(p_value_date::text) end)
$$;
revoke execute on function public.broker_field_effective(jsonb, text, numeric, text, text, date) from public, anon, authenticated;
grant execute on function public.broker_field_effective(jsonb, text, numeric, text, text, date) to service_role;

create or replace function public.broker_lock_draft(p_report_id uuid) returns public.broker_research_reports
language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports;
begin
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  if r.status = 'published' then raise exception 'published_immutable'; end if;
  if r.status = 'withdrawn' then raise exception 'report_withdrawn'; end if;
  return r;
end $$;
revoke execute on function public.broker_lock_draft(uuid) from public, anon, authenticated, service_role;

-- Picks (spec §6.2/§6.3): every effective row (confirmed/corrected/absent), plus every live
-- candidate (extracted/unverified, not superseded) whose identity (target_key, field, occurrence)
-- has no effective row AND exactly one live candidate. A conflict (>= 2 candidates) yields nothing.
create or replace function public.broker_report_picks(p_report_id uuid)
returns table(target_key text, field text, occurrence integer, field_id uuid, status text, is_eff boolean, v jsonb, detail jsonb)
language sql stable security definer set search_path = public as $$
  with eff as (
    select f.target_key, f.field, f.occurrence, f.field_id, f.status, true as is_eff,
           public.broker_field_effective(f.corrected, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date) as v, f.detail
    from public.broker_report_fields f
    where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent')
  ), cand as (
    select f.target_key, f.field, f.occurrence, f.field_id, f.status, false as is_eff,
           public.broker_field_effective(null, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date) as v, f.detail,
           count(*) over (partition by coalesce(f.target_key, ''), f.field, f.occurrence) as n
    from public.broker_report_fields f
    where f.report_id = p_report_id and f.status in ('extracted','unverified') and f.superseded_by_run_id is null
      and not exists (select 1 from public.broker_report_fields e
                      where e.report_id = f.report_id and e.status in ('confirmed','corrected','absent')
                        and coalesce(e.target_key, '') = coalesce(f.target_key, '') and e.field = f.field and e.occurrence = f.occurrence)
  )
  select e.target_key, e.field, e.occurrence, e.field_id, e.status, e.is_eff, e.v, e.detail from eff e
  union all
  select c.target_key, c.field, c.occurrence, c.field_id, c.status, c.is_eff, c.v, c.detail from cand c where c.n = 1
$$;
revoke execute on function public.broker_report_picks(uuid) from public, anon, authenticated, service_role;

-- The effective rows as one canonical jsonb array (ordered by identity under C collation).
create or replace function public.broker_report_effective_rows(p_report_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'field_id', f.field_id, 'target_key', f.target_key, 'field', f.field, 'occurrence', f.occurrence, 'status', f.status,
           'extractor', f.extractor, 'parse_run_id', f.parse_run_id, 'run_id', f.run_id, 'page', f.page, 'char_start', f.char_start, 'char_end', f.char_end,
           'value', public.broker_field_effective(f.corrected, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date))
         order by coalesce(f.target_key, '') collate "C", f.field collate "C", f.occurrence), '[]'::jsonb)
  from public.broker_report_fields f
  where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent')
$$;
revoke execute on function public.broker_report_effective_rows(uuid) from public, anon, authenticated, service_role;

-- Live digests (spec §4.4, §6.3 step 3): effective_hash; rules_input_hash over every rules input
-- (plan Part A 设计决定); summary_input_digest = sha256(effective_hash|artifact_hash|institution_id|title_public).
create or replace function public.broker_report_live_digests(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.broker_research_reports; d public.broker_report_documents; l public.broker_report_licences;
        v_eff jsonb; v_eff_hash text; v_art text; v_rules jsonb;
begin
  select * into r from public.broker_research_reports where report_id = p_report_id;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select * into d from public.broker_report_documents where document_id = r.document_id;
  select * into l from public.broker_report_licences where licence_id = d.licence_id;
  v_eff := public.broker_report_effective_rows(p_report_id);
  v_eff_hash := public.broker_sha256(v_eff::text);
  select ru.artifact_hash into v_art from public.broker_report_runs ru where ru.run_id = d.current_parse_run_id;
  v_rules := jsonb_build_object(
    'rules_version', 'broker-rules/1',
    'effective', v_eff,
    'targets', (select coalesce(jsonb_agg(to_jsonb(t) - 'input_hash' order by t.target_key collate "C"), '[]'::jsonb) from public.broker_report_targets t where t.report_id = p_report_id),
    'overrides', (select coalesce(jsonb_agg(jsonb_build_object('override_id', o.override_id, 'target_key', o.target_key, 'security_ticker', o.security_ticker, 'issuer_id', o.issuer_id) order by o.target_key collate "C"), '[]'::jsonb)
                  from public.broker_report_target_overrides o where o.report_id = p_report_id),
    'scales', (select coalesce(jsonb_agg(to_jsonb(s) order by s.scale_id), '[]'::jsonb) from public.research_rating_scales s
               where s.scale_id in (select t.scale_id from public.broker_report_targets t where t.report_id = p_report_id)),
    'institution_id', r.institution_id, 'scope', r.scope, 'published_date', r.published_date, 'uploaded_at', d.uploaded_at,
    'supersedes_report_id', r.supersedes_report_id,
    'titles', jsonb_build_object('title_original', r.title_original, 'title_public', r.title_public, 'title_zh', r.title_zh, 'title_en', r.title_en),
    'disclosure', jsonb_build_object('licence_version', l.version, 'allows_public_target_price', l.allows_public_target_price,
      'analysts', (select coalesce(jsonb_agg(jsonb_build_object('analyst_id', a.analyst_id, 'public_display', ra.public_display, 'display_name', ra.display_name, 'name_variants', to_jsonb(ra.name_variants)) order by a.analyst_id), '[]'::jsonb)
                   from public.broker_report_analysts a join public.research_analysts ra on ra.analyst_id = a.analyst_id where a.report_id = p_report_id)));
  return jsonb_build_object(
    'effective_hash', v_eff_hash,
    'rules_input_hash', public.broker_sha256(v_rules::text),
    'summary_input_digest', public.broker_sha256(v_eff_hash || '|' || coalesce(v_art, '') || '|' || coalesce(r.institution_id::text, '') || '|' || coalesce(r.title_public, '')));
end $$;
revoke execute on function public.broker_report_live_digests(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- materialize (§6.3)
-- 1. lock (draft only); 2. report-level columns from the first pick per field (effective first):
-- title_original/title_lang(detail.lang)/published_date/sector_as_stated; 3. targets rebuilt: one
-- row per target_key that has a live or effective ticker row; basis='effective' iff ticker, rating
-- and target_price are effective and (target_price is absent or target_currency, price_at_report,
-- price_currency and price_as_of_date are effective) — then only effective picks are used,
-- otherwise effective-or-unique-candidate picks; currencies come from value_currency; resolution:
-- override row > ticker row detail.resolution; scale: the unique row valid on published_date
-- (none/many → null); upside/1 = round(tp/pr − 1, 6) iff both present, same currency, pr <> 0;
-- input_hash = sha256 of the chosen rows; 4. report price_as_of_date = primary target's, else the
-- single distinct value; 5. digests stored (materialized_hash := effective_hash); 6. approved
-- summaries whose input_hash <> new digest → draft(summary_stale); approved snippets → draft
-- (disclosure_inputs) when any target's (target_price, upside_pct) changed. Returns the receipt.
create or replace function public.broker_report_materialize(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.broker_research_reports; v_old_disc text; v_new_disc text; v_dig jsonb;
  v_title text; v_lang text; v_pub date; v_sector text; v_pad date; v_n int; v_eff int;
begin
  r := public.broker_lock_draft(p_report_id);
  select public.broker_sha256(coalesce(jsonb_agg(jsonb_build_object('k', t.target_key, 'tp', t.target_price::text, 'up', t.upside_pct::text) order by t.target_key collate "C"), '[]'::jsonb)::text)
    into v_old_disc from public.broker_report_targets t where t.report_id = p_report_id;

  select max(x.v ->> 'value_text') filter (where x.field = 'title'),
         max(x.detail ->> 'lang') filter (where x.field = 'title'),
         (max(x.v ->> 'value_date') filter (where x.field = 'published_date'))::date,
         max(x.v ->> 'value_text') filter (where x.field = 'sector')
    into v_title, v_lang, v_pub, v_sector
  from (select distinct on (p.field) p.* from public.broker_report_picks(p_report_id) p
        where p.target_key is null and p.status <> 'absent' order by p.field, p.is_eff desc, p.occurrence) x;

  delete from public.broker_report_targets where report_id = p_report_id;
  insert into public.broker_report_targets (report_id, target_key, basis, ticker_as_stated, security_ticker, issuer_id, resolution, rating_raw, rating_normalized, scale_id,
                                            target_price, target_currency, target_horizon_months, price_at_report, price_currency, price_as_of_date, upside_pct, upside_formula_version, input_hash)
  with p as (select * from public.broker_report_picks(p_report_id) pk where pk.target_key is not null),
  keys as (
    select distinct f.target_key from public.broker_report_fields f
    where f.report_id = p_report_id and f.field = 'ticker'
      and (f.status in ('confirmed','corrected') or (f.status in ('extracted','unverified') and f.superseded_by_run_id is null))),
  flags as (
    select k.target_key,
      coalesce(bool_or(p.is_eff and p.field = 'ticker'), false) and coalesce(bool_or(p.is_eff and p.field = 'rating'), false)
      and coalesce(bool_or(p.is_eff and p.field = 'target_price'), false)
      and (coalesce(bool_or(p.is_eff and p.field = 'target_price' and p.status = 'absent'), false)
           or (coalesce(bool_or(p.is_eff and p.field = 'target_currency'), false) and coalesce(bool_or(p.is_eff and p.field = 'price_at_report'), false)
               and coalesce(bool_or(p.is_eff and p.field = 'price_currency'), false) and coalesce(bool_or(p.is_eff and p.field = 'price_as_of_date'), false))) as eff_basis
    from keys k left join p on p.target_key = k.target_key group by k.target_key),
  chosen as (
    select distinct on (p.target_key, p.field) p.*
    from p join flags fl on fl.target_key = p.target_key
    where p.is_eff or not fl.eff_basis
    order by p.target_key, p.field, p.is_eff desc, p.occurrence),
  vals as (
    select fl.target_key, fl.eff_basis,
      max(c.v ->> 'value_text') filter (where c.field = 'ticker') as ticker_text,
      max(c.v ->> 'value_text') filter (where c.field = 'rating' and c.status <> 'absent') as rating_raw,
      max(c.v ->> 'value_num') filter (where c.field = 'target_price' and c.status <> 'absent') as tp,
      max(c.v ->> 'value_currency') filter (where c.field = 'target_currency') as tc,
      max(c.v ->> 'value_num') filter (where c.field = 'target_horizon' and c.status <> 'absent') as horizon,
      max(c.v ->> 'value_num') filter (where c.field = 'price_at_report') as pr,
      max(c.v ->> 'value_currency') filter (where c.field = 'price_currency') as pc,
      max(c.v ->> 'value_date') filter (where c.field = 'price_as_of_date') as pd,
      (array_agg(c.detail -> 'resolution') filter (where c.field = 'ticker' and jsonb_typeof(c.detail -> 'resolution') = 'object'))[1] as resolution,
      coalesce(jsonb_agg(jsonb_build_object('field_id', c.field_id, 'field', c.field, 'status', c.status, 'v', c.v) order by c.field collate "C") filter (where c.field_id is not null), '[]'::jsonb) as inputs
    from flags fl left join chosen c on c.target_key = fl.target_key group by fl.target_key, fl.eff_basis)
  select p_report_id, v.target_key, case when v.eff_basis then 'effective' else 'candidate' end,
    coalesce(v.ticker_text, v.target_key),
    case when o.override_id is not null then o.security_ticker else v.resolution -> 'issuer_securities_row' ->> 'ticker' end,
    case when o.override_id is not null then o.issuer_id else (v.resolution -> 'issuer_securities_row' ->> 'issuer_id')::uuid end,
    coalesce(v.resolution, '{}'::jsonb) || case when o.override_id is not null then jsonb_build_object('override_id', o.override_id) else '{}'::jsonb end,
    v.rating_raw, sc.normalized, sc.scale_id,
    v.tp::numeric, v.tc,
    case when v.horizon::numeric > 0 then round(v.horizon::numeric)::int end,
    v.pr::numeric, v.pc, v.pd::date,
    case when v.tp is not null and v.pr is not null and v.tc = v.pc and v.pr::numeric <> 0 then round(v.tp::numeric / v.pr::numeric - 1, 6) end,
    case when v.tp is not null and v.pr is not null and v.tc = v.pc and v.pr::numeric <> 0 then 'upside/1' end,
    public.broker_sha256(v.inputs::text)
  from vals v
  left join public.broker_report_target_overrides o on o.report_id = p_report_id and o.target_key = v.target_key
  left join lateral (
    select (array_agg(s.scale_id))[1] as scale_id, (array_agg(s.normalized))[1] as normalized
    from public.research_rating_scales s
    where v.rating_raw is not null and v_pub is not null and s.institution_id = r.institution_id
      and lower(s.raw_label) = lower(v.rating_raw) and s.valid_from <= v_pub and v_pub < coalesce(s.valid_to, 'infinity'::date)
    having count(*) = 1) sc on true;

  if r.primary_target_key is not null then
    select t.price_as_of_date into v_pad from public.broker_report_targets t where t.report_id = p_report_id and t.target_key = r.primary_target_key;
  else
    select case when count(distinct t.price_as_of_date) = 1 then min(t.price_as_of_date) end into v_pad from public.broker_report_targets t where t.report_id = p_report_id;
  end if;
  update public.broker_research_reports
  set title_original = v_title, title_lang = coalesce(v_lang, title_lang), published_date = v_pub, sector_as_stated = v_sector, price_as_of_date = v_pad
  where report_id = p_report_id;

  v_dig := public.broker_report_live_digests(p_report_id);
  update public.broker_research_reports
  set effective_hash = v_dig ->> 'effective_hash', materialized_hash = v_dig ->> 'effective_hash',
      rules_input_hash = v_dig ->> 'rules_input_hash', summary_input_digest = v_dig ->> 'summary_input_digest'
  where report_id = p_report_id;
  update public.broker_report_summaries set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'summary_stale'
  where report_id = p_report_id and status = 'approved' and input_hash is distinct from v_dig ->> 'summary_input_digest';

  select public.broker_sha256(coalesce(jsonb_agg(jsonb_build_object('k', t.target_key, 'tp', t.target_price::text, 'up', t.upside_pct::text) order by t.target_key collate "C"), '[]'::jsonb)::text)
    into v_new_disc from public.broker_report_targets t where t.report_id = p_report_id;
  if v_new_disc is distinct from v_old_disc then
    update public.broker_report_snippets set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'disclosure_inputs'
    where report_id = p_report_id and status = 'approved';
  end if;

  select count(*), count(*) filter (where t.basis = 'effective') into v_n, v_eff from public.broker_report_targets t where t.report_id = p_report_id;
  return jsonb_build_object('effectiveHash', v_dig ->> 'effective_hash', 'materializedHash', v_dig ->> 'effective_hash', 'targets', v_n,
                            'basis', case when v_n = v_eff then 'effective' when v_eff = 0 then 'candidate' else 'mixed' end);
end $$;
revoke execute on function public.broker_report_materialize(uuid) from public, anon, authenticated;
grant execute on function public.broker_report_materialize(uuid) to service_role;

-- ---------------------------------------------------------------- review RPCs (§6.3)
-- broker_field_review(field, action, payload, by): lock the parent report first (published →
-- published_immutable), then the field. Actions: confirm (extracted|unverified|corrected →
-- confirmed; span required); correct (any live/effective row → corrected; payload = the corrected
-- keys ⊆ value_text/value_num/value_currency/value_unit/value_date with value_text a string, plus
-- an optional span page/char_start/char_end/value_source_text that replaces the row's span);
-- reject; absent (field ∈ rating/target_price/analyst/target_horizon: this row → rejected and a
-- human 'absent' row for the same identity on payload.page, else the row's page). confirm/correct/
-- absent reject every other live candidate of the same identity (the conflict group). Then
-- materialize; one transaction (any error leaves nothing changed).
create or replace function public.broker_field_review(p_field_id uuid, p_action text, p_payload jsonb, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.broker_report_fields; v_report uuid; v_corr jsonb; v_page int; v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_action is null or p_action not in ('confirm','correct','reject','absent') then raise exception 'invalid_action:%', coalesce(p_action, ''); end if;
  if p_by is null then raise exception 'invalid_reviewer'; end if;
  select report_id into v_report from public.broker_report_fields where field_id = p_field_id;
  if not found then raise exception 'field_not_found' using errcode = 'P0002'; end if;
  perform public.broker_lock_draft(v_report);
  select * into f from public.broker_report_fields where field_id = p_field_id for update;
  if p_action in ('confirm','correct') and exists (
       select 1 from public.broker_report_fields e where e.report_id = f.report_id and e.field_id <> f.field_id and e.status in ('confirmed','corrected','absent')
         and e.target_key is not distinct from f.target_key and e.field = f.field and e.occurrence = f.occurrence) then
    raise exception 'effective_exists';
  end if;
  if p_action = 'confirm' then
    if f.status not in ('extracted','unverified','corrected') then raise exception 'field_not_reviewable:%', f.status; end if;
    if f.char_start is null then raise exception 'span_required'; end if;
    update public.broker_report_fields set status = 'confirmed', corrected = null, reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;
  elsif p_action = 'correct' then
    if f.status not in ('extracted','unverified','confirmed','corrected') then raise exception 'field_not_reviewable:%', f.status; end if;
    v_corr := v_payload - array['page','char_start','char_end','value_source_text'];
    if v_corr - array['value_text','value_num','value_currency','value_unit','value_date'] <> '{}'::jsonb or jsonb_typeof(v_corr -> 'value_text') is distinct from 'string' then
      raise exception 'invalid_payload:corrected';
    end if;
    if v_corr ->> 'value_num' is not null and v_corr ->> 'value_num' !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'invalid_payload:value_num'; end if;
    if v_corr ->> 'value_date' is not null then
      begin perform (v_corr ->> 'value_date')::date; exception when others then raise exception 'invalid_payload:value_date'; end;
      if v_corr ->> 'value_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_payload:value_date'; end if;
    end if;
    if v_payload ?| array['page','char_start','char_end','value_source_text'] then
      if not (v_payload ? 'page' and v_payload ? 'char_start' and v_payload ? 'char_end' and jsonb_typeof(v_payload -> 'value_source_text') = 'string') then raise exception 'invalid_payload:span'; end if;
      update public.broker_report_fields
      set page = (v_payload ->> 'page')::int, char_start = (v_payload ->> 'char_start')::int, char_end = (v_payload ->> 'char_end')::int, value_source_text = v_payload ->> 'value_source_text'
      where field_id = p_field_id;
    elsif f.char_start is null then
      raise exception 'span_required';
    end if;
    update public.broker_report_fields set status = 'corrected', corrected = v_corr, reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;
  elsif p_action = 'reject' then
    if f.status = 'rejected' then raise exception 'field_not_reviewable:rejected'; end if;
    update public.broker_report_fields set status = 'rejected', reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;
  else
    if f.field not in ('rating','target_price','analyst','target_horizon') then raise exception 'absent_not_allowed:%', f.field; end if;
    if f.status = 'absent' then raise exception 'field_not_reviewable:absent'; end if;
    v_page := coalesce((v_payload ->> 'page')::int, f.page);
    if v_page is null or v_page < 1 then raise exception 'invalid_payload:page'; end if;
    if exists (select 1 from public.broker_report_fields e where e.report_id = f.report_id and e.field_id <> f.field_id and e.status in ('confirmed','corrected','absent')
                 and e.target_key is not distinct from f.target_key and e.field = f.field and e.occurrence = f.occurrence) then
      raise exception 'effective_exists';
    end if;
    if f.status <> 'rejected' then
      update public.broker_report_fields set status = 'rejected', reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;
    end if;
    insert into public.broker_report_fields (report_id, parse_run_id, target_key, field, occurrence, value_text, page, extractor, status, reviewed_by, reviewed_at, detail)
    values (f.report_id, f.parse_run_id, f.target_key, f.field, f.occurrence, 'ABSENT', v_page, 'human:' || p_by::text, 'absent', p_by, now(), jsonb_build_object('replaces', f.field_id));
  end if;
  if p_action in ('confirm','correct','absent') then
    update public.broker_report_fields set status = 'rejected', reviewed_by = p_by, reviewed_at = now()
    where report_id = f.report_id and field_id <> f.field_id and status in ('extracted','unverified') and superseded_by_run_id is null
      and target_key is not distinct from f.target_key and field = f.field and occurrence = f.occurrence;
  end if;
  return public.broker_report_materialize(f.report_id);
end $$;
revoke execute on function public.broker_field_review(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.broker_field_review(uuid, text, jsonb, uuid) to service_role;

-- broker_field_add(report, row, by): a human row (HumanFieldInput: status confirmed|absent;
-- parse_run_id must be a succeeded parse run of the report's document). Returns {field_id, receipt}.
create or replace function public.broker_field_add(p_report_id uuid, p_row jsonb, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports; v_id uuid; v_status text := p_row ->> 'status'; v_absent boolean; v_occ int := coalesce((p_row ->> 'occurrence')::int, 1);
begin
  if p_by is null then raise exception 'invalid_reviewer'; end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'invalid_payload:row'; end if;
  r := public.broker_lock_draft(p_report_id);
  if v_status is null or v_status not in ('confirmed','absent') then raise exception 'invalid_payload:status'; end if;
  if not exists (select 1 from public.broker_report_runs ru where ru.run_id = (p_row ->> 'parse_run_id')::uuid and ru.document_id = r.document_id and ru.kind = 'parse' and ru.status = 'succeeded') then
    raise exception 'invalid_payload:parse_run_id';
  end if;
  if exists (select 1 from public.broker_report_fields e where e.report_id = p_report_id and e.status in ('confirmed','corrected','absent')
               and e.target_key is not distinct from (p_row ->> 'target_key') and e.field = p_row ->> 'field' and e.occurrence = v_occ) then
    raise exception 'effective_exists';
  end if;
  v_absent := v_status = 'absent';
  insert into public.broker_report_fields (report_id, parse_run_id, target_key, field, occurrence, value_text, value_num, value_currency, value_unit, value_date,
                                           page, char_start, char_end, value_source_text, extractor, status, reviewed_by, reviewed_at)
  values (p_report_id, (p_row ->> 'parse_run_id')::uuid, p_row ->> 'target_key', p_row ->> 'field', v_occ,
          case when v_absent then 'ABSENT' else p_row ->> 'value_text' end,
          case when v_absent then null else (p_row ->> 'value_num')::numeric end,
          case when v_absent then null else p_row ->> 'value_currency' end,
          case when v_absent then null else p_row ->> 'value_unit' end,
          case when v_absent then null else (p_row ->> 'value_date')::date end,
          (p_row ->> 'page')::int,
          case when v_absent then null else (p_row ->> 'char_start')::int end,
          case when v_absent then null else (p_row ->> 'char_end')::int end,
          case when v_absent then null else p_row ->> 'value_source_text' end,
          'human:' || p_by::text, v_status, p_by, now())
  returning field_id into v_id;
  return jsonb_build_object('field_id', v_id, 'receipt', public.broker_report_materialize(p_report_id));
end $$;
revoke execute on function public.broker_field_add(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.broker_field_add(uuid, jsonb, uuid) to service_role;

-- broker_target_override: upsert on (report_id, target_key); a null issuer is resolved from
-- issuer_securities at the document's upload date ([valid_from, valid_to)), exactly one issuer or null.
create or replace function public.broker_target_override(p_report_id uuid, p_target_key text, p_security_ticker text, p_issuer_id uuid, p_by uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports; v_day date; v_issuer uuid := p_issuer_id;
begin
  if p_target_key is null or p_security_ticker is null or p_by is null then raise exception 'invalid_override'; end if;
  r := public.broker_lock_draft(p_report_id);
  if v_issuer is null then
    select d.uploaded_at::date into v_day from public.broker_report_documents d where d.document_id = r.document_id;
    select case when count(distinct s.issuer_id) = 1 then (array_agg(s.issuer_id))[1] end into v_issuer
    from public.issuer_securities s where s.ticker = p_security_ticker and s.valid_from <= v_day and (s.valid_to is null or s.valid_to > v_day);
  end if;
  insert into public.broker_report_target_overrides (report_id, target_key, security_ticker, issuer_id, set_by, note)
  values (p_report_id, p_target_key, p_security_ticker, v_issuer, p_by, p_note)
  on conflict (report_id, target_key) do update
    set security_ticker = excluded.security_ticker, issuer_id = excluded.issuer_id, set_by = excluded.set_by, set_at = now(), note = excluded.note;
  return public.broker_report_materialize(p_report_id);
end $$;
revoke execute on function public.broker_target_override(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.broker_target_override(uuid, text, text, uuid, uuid, text) to service_role;

-- broker_extract_commit (§6.2): document lock + lease (token equal AND lease_until > now(), else
-- lease_lost 55P03, nothing written); the run must be this document's running extract run; the
-- report (created by ensureReport) must be a draft; earlier live candidates → superseded_by_run_id;
-- candidate rows inserted (status extracted|unverified; parse_run_id = the run's; resolution kept
-- in detail.resolution); materialize. One transaction.
create or replace function public.broker_extract_commit(p_document_id uuid, p_lease_token uuid, p_run_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.broker_report_documents; ru public.broker_report_runs; v_report uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where jsonb_typeof(x) <> 'object' or coalesce(x ->> 'status', '') not in ('extracted','unverified')) then
    raise exception 'invalid_rows:status' using errcode = '22023';
  end if;
  select * into d from public.broker_report_documents where document_id = p_document_id for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if d.lease_token is distinct from p_lease_token or d.lease_until is null or d.lease_until <= now() then raise exception 'lease_lost' using errcode = '55P03'; end if;
  select * into ru from public.broker_report_runs where run_id = p_run_id;
  if not found or ru.document_id <> p_document_id or ru.kind <> 'extract' or ru.status <> 'running' then raise exception 'run_invalid'; end if;
  select report_id into v_report from public.broker_research_reports where document_id = p_document_id;
  if v_report is null then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  perform public.broker_lock_draft(v_report);
  update public.broker_report_fields set superseded_by_run_id = p_run_id
  where report_id = v_report and status in ('extracted','unverified') and superseded_by_run_id is null and run_id is distinct from p_run_id;
  insert into public.broker_report_fields (report_id, parse_run_id, run_id, target_key, field, occurrence, value_text, value_num, value_currency, value_unit, value_date,
                                           page, char_start, char_end, value_source_text, extractor, extractor_confidence, status, conflict_group, detail)
  select v_report, ru.parse_run_id, p_run_id, x ->> 'target_key', x ->> 'field', coalesce((x ->> 'occurrence')::int, 1), x ->> 'value_text',
         (x ->> 'value_num')::numeric, x ->> 'value_currency', x ->> 'value_unit', (x ->> 'value_date')::date,
         (x ->> 'page')::int, (x ->> 'char_start')::int, (x ->> 'char_end')::int, x ->> 'value_source_text',
         x ->> 'extractor', (x ->> 'extractor_confidence')::double precision, x ->> 'status', x ->> 'conflict_group',
         coalesce(case when jsonb_typeof(x -> 'detail') = 'object' then x -> 'detail' end, '{}'::jsonb)
           || case when jsonb_typeof(x -> 'resolution') = 'object' then jsonb_build_object('resolution', x -> 'resolution') else '{}'::jsonb end
  from jsonb_array_elements(p_rows) x;
  return public.broker_report_materialize(v_report);
end $$;
revoke execute on function public.broker_extract_commit(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_extract_commit(uuid, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- publish blockers (§4.4, 17 items)
create or replace function public.broker_report_publish_blockers(p_report_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  r public.broker_research_reports; d public.broker_report_documents; l public.broker_report_licences; st public.broker_research_settings;
  rr public.broker_report_rule_receipts; b text[] := '{}'; v_live jsonb; v_n int; v_ni int; v_res jsonb; v_surface text; v_text text;
  v_target_scope boolean; v_required text[];
begin
  select * into r from public.broker_research_reports where report_id = p_report_id;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select * into d from public.broker_report_documents where document_id = r.document_id;
  select * into l from public.broker_report_licences where licence_id = d.licence_id;
  select * into st from public.broker_research_settings where id = 1;
  v_target_scope := r.scope in ('single_issuer','multi_issuer');
  -- 1–4
  if r.review_status <> 'approved' then b := array_append(b, 'review_not_approved'); end if;
  if not (l.confirmed_at is not null and l.confirmed_version = l.version and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)) then
    b := array_append(b, 'licence_unconfirmed');
  end if;
  if not l.allows_public_metadata then b := array_append(b, 'licence_no_public_metadata'); end if;
  if d.status <> 'parsed' or d.promotion_pending then b := array_append(b, 'document_not_parsed'); end if;
  -- 5
  if r.scope is null then b := array_append(b, 'report_incomplete:scope'); end if;
  if r.title_original is null then b := array_append(b, 'report_incomplete:title_original'); end if;
  if r.published_date is null then b := array_append(b, 'report_incomplete:published_date'); end if;
  if r.institution_id is null then b := array_append(b, 'report_incomplete:institution_id'); end if;
  -- 6 required_field_missing (§5.1): effective row, and for numeric/date fields an effective value
  b := b || coalesce((
    with e as (select * from public.broker_report_picks(p_report_id) pk where pk.is_eff),
    req as (
      select null::text as target_key, x.field, 1 as ord from unnest(array['institution','published_date','title']) as x(field)
      union all select null, 'sector', 1 where r.scope in ('sector','macro_strategy')
      union all select t.target_key, x.field, 2 from public.broker_report_targets t cross join unnest(array['ticker','rating','target_price']) as x(field)
        where t.report_id = p_report_id and v_target_scope
      union all select t.target_key, x.field, 2 from public.broker_report_targets t cross join unnest(array['target_currency','price_at_report','price_currency','price_as_of_date']) as x(field)
        where t.report_id = p_report_id and v_target_scope
          and exists (select 1 from e where e.target_key = t.target_key and e.field = 'target_price' and e.status <> 'absent'))
    select array_agg('required_field_missing:' || q.field || coalesce(':' || q.target_key, '') order by q.ord, q.target_key collate "C", q.field collate "C")
    from req q
    where not exists (select 1 from e where e.target_key is not distinct from q.target_key and e.field = q.field
                        and (e.status = 'absent' or case q.field
                               when 'published_date' then e.v ->> 'value_date' is not null
                               when 'price_as_of_date' then e.v ->> 'value_date' is not null
                               when 'target_price' then e.v ->> 'value_num' is not null
                               when 'price_at_report' then e.v ->> 'value_num' is not null
                               when 'target_currency' then e.v ->> 'value_currency' is not null
                               when 'price_currency' then e.v ->> 'value_currency' is not null
                               else true end))), '{}');
  -- 7 field_pending: a live candidate of a required field whose identity has no effective row
  v_required := array['institution','published_date','title']
             || case when r.scope in ('sector','macro_strategy') then array['sector'] else '{}'::text[] end
             || case when v_target_scope then array['ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date'] else '{}'::text[] end;
  b := b || coalesce((
    select array_agg(distinct 'field_pending:' || f.field order by 'field_pending:' || f.field)
    from public.broker_report_fields f
    where f.report_id = p_report_id and f.status in ('extracted','unverified') and f.superseded_by_run_id is null and f.field = any(v_required)
      and not exists (select 1 from public.broker_report_fields e where e.report_id = f.report_id and e.status in ('confirmed','corrected','absent')
                        and e.target_key is not distinct from f.target_key and e.field = f.field and e.occurrence = f.occurrence)), '{}');
  -- 8, 9
  if v_target_scope then
    b := b || coalesce((select array_agg('target_unresolved:' || t.target_key order by t.target_key collate "C") from public.broker_report_targets t
                        where t.report_id = p_report_id and (t.issuer_id is null or t.basis <> 'effective')), '{}');
  end if;
  select count(*), count(distinct t.issuer_id) into v_n, v_ni from public.broker_report_targets t where t.report_id = p_report_id;
  if (r.scope = 'single_issuer' and (v_ni <> 1 or v_n < 1)) or (r.scope = 'multi_issuer' and v_ni < 2) or (r.scope in ('sector','macro_strategy') and v_n <> 0) then
    b := array_append(b, 'target_cardinality');
  end if;
  -- 10 blocking quarantine items of this document
  b := b || coalesce((
    select array_agg(distinct 'quarantine_open:' || q.reason_code order by 'quarantine_open:' || q.reason_code)
    from public.dq_quarantine q
    where q.dataset = 'broker_research' and q.status = 'open' and q.natural_key like d.sha256 || ':%'
      and q.reason_code in ('upside_mismatch','currency_mismatch','date_order','nonpositive_price','unknown_rating_label','ambiguous_rating_label','ticker_issuer_conflict','unresolved_ticker')), '{}');
  -- 11 stored digests vs live recomputation
  v_live := public.broker_report_live_digests(p_report_id);
  if r.materialized_hash is null or r.materialized_hash is distinct from v_live ->> 'effective_hash' or r.effective_hash is distinct from v_live ->> 'effective_hash'
     or r.rules_input_hash is distinct from v_live ->> 'rules_input_hash' or r.summary_input_digest is distinct from v_live ->> 'summary_input_digest' then
    b := array_append(b, 'materialize_stale');
  end if;
  -- 12 newest receipt for the stored rules_input_hash; any failed blocking result
  select * into rr from public.broker_report_rule_receipts x
  where x.report_id = p_report_id and x.input_hash = r.rules_input_hash and x.rules_version = 'broker-rules/1'
  order by x.created_at desc, x.receipt_id desc limit 1;
  if rr.receipt_id is null or exists (select 1 from jsonb_array_elements(rr.results) e where e ->> 'passed' = 'false' and e ->> 'blocking' = 'true') then
    b := array_append(b, 'rules_stale');
  end if;
  -- 13 gold eval receipt per behavior digest of the effective LLM rows; coverage (tp+fn > 0) is
  -- required for every field that has an effective LLM-extracted (non-absent) row
  if exists (select 1 from public.broker_report_fields f where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.extractor like 'llm:%') then
    if st.approved_gold_corpus_hash is null or exists (
         select 1
         from (select distinct ru.behavior_digest from public.broker_report_fields f join public.broker_report_runs ru on ru.run_id = f.run_id
               where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.extractor like 'llm:%') g
         left join lateral (select * from public.broker_eval_receipts e where e.behavior_digest = g.behavior_digest order by e.ran_at desc, e.receipt_id desc limit 1) e on true
         where e.receipt_id is null
            or not (e.passed and e.corpus_kind = 'gold' and e.corpus_hash = st.approved_gold_corpus_hash and e.n_docs >= 30)
            or exists (select 1 from (select distinct f.field from public.broker_report_fields f where f.report_id = p_report_id and f.status in ('confirmed','corrected') and f.extractor like 'llm:%') ff
                       where coalesce((e.per_field -> ff.field ->> 'tp')::int, 0) + coalesce((e.per_field -> ff.field ->> 'fn')::int, 0) = 0)) then
      b := array_append(b, 'eval_receipt_missing');
    end if;
  end if;
  -- 14
  if exists (select 1 from public.broker_report_summaries su where su.report_id = p_report_id and su.status = 'approved' and su.input_hash is distinct from r.summary_input_digest) then
    b := array_append(b, 'summary_stale');
  end if;
  -- 15 title surfaces (results in the rules receipt), approved snippets / summaries (own checks)
  foreach v_surface in array array['title_original','title_public','title_zh','title_en'] loop
    v_text := case v_surface when 'title_original' then r.title_original when 'title_public' then r.title_public when 'title_zh' then r.title_zh else r.title_en end;
    continue when v_text is null;
    v_res := null;
    if rr.receipt_id is not null then
      select e into v_res from jsonb_array_elements(rr.results) e where e ->> 'rule' = 'disclosure' and e -> 'detail' ->> 'surface' = v_surface limit 1;
    end if;
    if v_res is null or v_res ->> 'passed' <> 'true' then
      if v_surface <> 'title_original' or r.title_public is null then b := array_append(b, 'restricted_value_in_text:' || v_surface); end if;
    end if;
  end loop;
  b := b || coalesce((select array_agg('restricted_value_in_text:snippet:' || sn.snippet_id::text order by sn.snippet_id) from public.broker_report_snippets sn
                      where sn.report_id = p_report_id and sn.status = 'approved' and coalesce(sn.disclosure_check ->> 'passed', 'false') <> 'true'), '{}');
  b := b || coalesce((select array_agg('restricted_value_in_text:summary:' || su.lang order by su.lang) from public.broker_report_summaries su
                      where su.report_id = p_report_id and su.status = 'approved' and coalesce(su.disclosure_check ->> 'passed', 'false') <> 'true'), '{}');
  -- 16
  if not r.evidence_ok then b := array_append(b, 'evidence_drift'); end if;
  if not r.disclosure_ok then b := array_append(b, 'disclosure_stale'); end if;
  -- 17
  b := b || coalesce((
    select array_agg('conflict_unresolved:' || g.field || coalesce(':' || g.target_key, '') order by g.field collate "C", g.target_key collate "C")
    from (select f.target_key, f.field, f.occurrence from public.broker_report_fields f
          where f.report_id = p_report_id and f.status in ('extracted','unverified') and f.superseded_by_run_id is null
          group by f.target_key, f.field, f.occurrence having count(*) >= 2) g
    where not exists (select 1 from public.broker_report_fields e where e.report_id = p_report_id and e.status in ('confirmed','corrected','absent')
                        and e.target_key is not distinct from g.target_key and e.field = g.field and e.occurrence = g.occurrence)), '{}');
  return b;
end $$;
revoke execute on function public.broker_report_publish_blockers(uuid) from public, anon, authenticated;
grant execute on function public.broker_report_publish_blockers(uuid) to service_role;

-- ---------------------------------------------------------------- publish / unpublish (§4.4, §4.8, §10.2)
-- Lock order: licence (share) → document (share) → report (update). Under
-- set_config('broker.publishing', report_id, true): blockers on committed state (non-empty →
-- publish_blocked:<comma list>), snapshot built here and hashed here, publication inserted, report
-- flipped, one claim.register per target with a target price. Returns publication_id.
create or replace function public.broker_report_publish(p_report_id uuid, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.broker_research_reports; d public.broker_report_documents; l public.broker_report_licences; rr public.broker_report_rule_receipts;
  v_blockers text[]; v_pub uuid := gen_random_uuid(); v_now timestamptz := now(); v_snapshot jsonb; v_hash text; v_eval uuid; v_eval_ids jsonb; v_restricted boolean; v_doc uuid; v_lic uuid;
begin
  if p_by is null then raise exception 'invalid_publisher'; end if;
  select document_id into v_doc from public.broker_research_reports where report_id = p_report_id;
  if v_doc is null then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select licence_id into v_lic from public.broker_report_documents where document_id = v_doc;
  select * into l from public.broker_report_licences where licence_id = v_lic for share;
  select * into d from public.broker_report_documents where document_id = v_doc for share;
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if r.status <> 'draft' then raise exception 'report_not_draft'; end if;
  perform set_config('broker.publishing', p_report_id::text, true);
  v_blockers := public.broker_report_publish_blockers(p_report_id);
  if cardinality(v_blockers) > 0 then raise exception 'publish_blocked:%', array_to_string(v_blockers, ','); end if;
  select * into rr from public.broker_report_rule_receipts x where x.report_id = p_report_id and x.input_hash = r.rules_input_hash and x.rules_version = 'broker-rules/1'
  order by x.created_at desc, x.receipt_id desc limit 1;
  select coalesce(bool_or(e ->> 'passed' = 'true'), false) is false into v_restricted
  from jsonb_array_elements(rr.results) e where e ->> 'rule' = 'disclosure' and e -> 'detail' ->> 'surface' = 'title_original';
  select coalesce(jsonb_agg(x.receipt_id order by x.ran_at desc), '[]'::jsonb), (array_agg(x.receipt_id order by x.ran_at desc))[1] into v_eval_ids, v_eval
  from (select distinct on (e.behavior_digest) e.receipt_id, e.ran_at
        from public.broker_eval_receipts e
        where e.behavior_digest in (select ru.behavior_digest from public.broker_report_fields f join public.broker_report_runs ru on ru.run_id = f.run_id
                                    where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.extractor like 'llm:%')
        order by e.behavior_digest, e.ran_at desc, e.receipt_id desc) x;
  v_snapshot := jsonb_build_object(
    'publication_id', v_pub, 'revision', r.revision, 'published_at', v_now, 'published_by', p_by,
    'report', to_jsonb(r) || jsonb_build_object('status', 'published', 'current_publication_id', v_pub, 'title_restricted', v_restricted),
    'document', jsonb_build_object('document_id', d.document_id, 'sha256', d.sha256, 'uploaded_at', d.uploaded_at, 'licence_id', d.licence_id, 'current_parse_run_id', d.current_parse_run_id, 'page_count', d.page_count),
    'targets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.target_key collate "C"), '[]'::jsonb) from public.broker_report_targets t where t.report_id = p_report_id),
    'fields', (select coalesce(jsonb_agg(jsonb_build_object('field_id', f.field_id, 'target_key', f.target_key, 'field', f.field, 'occurrence', f.occurrence, 'status', f.status,
                 'extractor', f.extractor, 'parse_run_id', f.parse_run_id, 'run_id', f.run_id, 'artifact_hash', pr.artifact_hash, 'page', f.page, 'char_start', f.char_start, 'char_end', f.char_end,
                 'value', public.broker_field_effective(f.corrected, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date))
               order by coalesce(f.target_key, '') collate "C", f.field collate "C", f.occurrence), '[]'::jsonb)
               from public.broker_report_fields f left join public.broker_report_runs pr on pr.run_id = f.parse_run_id
               where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent')),
    'snippets', (select coalesce(jsonb_agg(jsonb_build_object('snippet_id', sn.snippet_id, 'target_key', sn.target_key, 'purpose', sn.purpose, 'parse_run_id', sn.parse_run_id, 'page', sn.page,
                   'char_start', sn.char_start, 'char_end', sn.char_end, 'text', sn.text, 'field_id', sn.field_id, 'disclosure_check', sn.disclosure_check) order by sn.snippet_id), '[]'::jsonb)
                 from public.broker_report_snippets sn where sn.report_id = p_report_id and sn.status = 'approved'),
    'summaries', (select coalesce(jsonb_agg(jsonb_build_object('summary_id', su.summary_id, 'lang', su.lang, 'run_id', su.run_id, 'input_hash', su.input_hash, 'summary_md', su.summary_md,
                    'max_verbatim_overlap', su.max_verbatim_overlap, 'numeric_grounding', su.numeric_grounding, 'disclosure_check', su.disclosure_check) order by su.lang), '[]'::jsonb)
                  from public.broker_report_summaries su where su.report_id = p_report_id and su.status = 'approved'),
    'rating_scales', (select coalesce(jsonb_agg(to_jsonb(s) order by s.scale_id), '[]'::jsonb) from public.research_rating_scales s
                      where s.scale_id in (select t.scale_id from public.broker_report_targets t where t.report_id = p_report_id)),
    'overrides', (select coalesce(jsonb_agg(to_jsonb(o) order by o.target_key collate "C"), '[]'::jsonb) from public.broker_report_target_overrides o where o.report_id = p_report_id),
    'analysts', (select coalesce(jsonb_agg(jsonb_build_object('analyst_id', a.analyst_id, 'role', a.role, 'field_id', a.field_id) order by a.analyst_id), '[]'::jsonb)
                 from public.broker_report_analysts a where a.report_id = p_report_id),
    'disclosure_inputs', jsonb_build_object(
      'licence', jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'allows_public_metadata', l.allows_public_metadata, 'allows_public_snippets', l.allows_public_snippets,
                                    'allows_public_summary', l.allows_public_summary, 'allows_public_target_price', l.allows_public_target_price, 'snippet_max_chars', l.snippet_max_chars),
      'analysts', (select coalesce(jsonb_agg(jsonb_build_object('analyst_id', ra.analyst_id, 'public_display', ra.public_display, 'display_name', ra.display_name, 'name_variants', to_jsonb(ra.name_variants)) order by ra.analyst_id), '[]'::jsonb)
                   from public.broker_report_analysts a join public.research_analysts ra on ra.analyst_id = a.analyst_id where a.report_id = p_report_id)),
    'rules_receipt', jsonb_build_object('receipt_id', rr.receipt_id, 'rules_version', rr.rules_version, 'input_hash', rr.input_hash, 'results', rr.results),
    'eval_receipt_ids', v_eval_ids,
    'digests', jsonb_build_object('effective_hash', r.effective_hash, 'rules_input_hash', r.rules_input_hash, 'summary_input_digest', r.summary_input_digest));
  v_hash := public.broker_sha256(v_snapshot::text);
  insert into public.broker_report_publications (publication_id, report_id, revision, snapshot, snapshot_hash, licence_version, rules_receipt_id, eval_receipt_id, published_at, published_by)
  values (v_pub, p_report_id, r.revision, v_snapshot, v_hash, l.version, rr.receipt_id, v_eval, v_now, p_by);
  update public.broker_research_reports set status = 'published', current_publication_id = v_pub, title_restricted = v_restricted where report_id = p_report_id;
  insert into public.broker_outbox (event_id, kind, payload)
  select x.eid, 'claim.register', jsonb_build_object(
    'event_id', x.eid, 'claim_key', 'broker_target_price:' || v_pub::text || ':' || x.target_key, 'claim_seq', 1, 'kind', 'claim.register',
    'claim_type', 'broker_target_price', 'methodology_version', 'broker-claim/1',
    'subject', jsonb_build_object('security_ticker', x.security_ticker, 'issuer_id', x.issuer_id, 'market', su.market::text, 'currency', x.target_currency),
    'claimant', jsonb_build_object('kind', 'institution', 'id', r.institution_id),
    'claim', jsonb_build_object('direction', case when x.price_at_report is null then 0 else sign(x.target_price - x.price_at_report)::int end,
                                'target_price', x.target_price::text, 'currency', x.target_currency, 'horizon_months', x.target_horizon_months,
                                'reference_price', x.price_at_report::text, 'reference_currency', x.price_currency, 'reference_date', x.price_as_of_date),
    'stated_at', r.published_date, 'available_at', d.uploaded_at,
    'source', jsonb_build_object('report_id', p_report_id, 'publication_id', v_pub, 'snapshot_hash', v_hash,
                                 'field_ids', (select coalesce(jsonb_agg(f.field_id order by f.field_id), '[]'::jsonb) from public.broker_report_fields f
                                               where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.target_key = x.target_key)),
    'visibility_ref', jsonb_build_object('view', 'broker_report_targets_public_v', 'report_id', p_report_id, 'target_key', x.target_key))
  from (select t.*, gen_random_uuid() as eid from public.broker_report_targets t where t.report_id = p_report_id and t.target_price is not null) x
  left join public.stocks_universe su on su.ticker = x.security_ticker;
  perform set_config('broker.publishing', '', true);
  return v_pub;
end $$;
revoke execute on function public.broker_report_publish(uuid, uuid) from public, anon, authenticated;
grant execute on function public.broker_report_publish(uuid, uuid) to service_role;

-- claim.retract for every claim.register of a publication (claim_seq 2; unique (claim_key, claim_seq)
-- makes it once-only). Internal.
create or replace function public.broker_outbox_retract(p_publication uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.broker_outbox (event_id, kind, payload)
  select g.eid, 'claim.retract', jsonb_build_object('event_id', g.eid, 'claim_key', g.claim_key, 'claim_seq', 2, 'kind', 'claim.retract', 'reason', p_reason,
                                                    'source', jsonb_build_object('report_id', g.report_id, 'publication_id', p_publication))
  from (select gen_random_uuid() as eid, o.payload ->> 'claim_key' as claim_key, o.payload -> 'source' ->> 'report_id' as report_id
        from public.broker_outbox o where o.kind = 'claim.register' and o.payload -> 'source' ->> 'publication_id' = p_publication::text) g
  on conflict ((payload ->> 'claim_key'), (payload ->> 'claim_seq')) where kind in ('claim.register','claim.retract') do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.broker_outbox_retract(uuid, text) from public, anon, authenticated, service_role;

-- Unpublish: status draft, revision + 1, current_publication_id null, review_status in_review, the
-- snapshot's unpublished_at/reason written once; claim.retract comes from the report trigger below.
create or replace function public.broker_report_unpublish(p_report_id uuid, p_by uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports;
begin
  if p_by is null then raise exception 'invalid_publisher'; end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'reason_required'; end if;
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'published' then raise exception 'report_not_published'; end if;
  update public.broker_report_publications set unpublished_at = now(), unpublish_reason = p_reason where publication_id = r.current_publication_id;
  perform set_config('broker.unpublishing', p_report_id::text, true);
  update public.broker_research_reports set status = 'draft', revision = revision + 1, current_publication_id = null, review_status = 'in_review' where report_id = p_report_id;
  perform set_config('broker.unpublishing', '', true);
end $$;
revoke execute on function public.broker_report_unpublish(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.broker_report_unpublish(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------- quarantine hook (§7.3)
-- One transaction: (1) lock the item (missing → 'not_found'; not open → 'already_resolved', no
-- write); (2) lock the report of the document named by the natural key's sha256 prefix
-- (published → published_immutable); (3) hook writes by reason (accept): rating labels → mapping
-- row (+ optional close of payload.close_scale_id at payload.valid_to); tickers → override upsert;
-- possible_version → supersedes_report_id; other reasons → no write; reject → review_status
-- 'rejected'. Missing params → hook_params_required (rollback). (4) materialize; (5) flip the item.
create or replace function public.broker_quarantine_resolve(p_id uuid, p_status text, p_by uuid, p_payload jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; r public.broker_research_reports; v_doc uuid; v_payload jsonb := coalesce(p_payload, '{}'::jsonb); v_label text; v_wrote boolean := false;
begin
  if p_status is null or p_status not in ('resolved_accept','resolved_reject') then raise exception 'invalid_status'; end if;
  if p_by is null then raise exception 'invalid_resolver'; end if;
  select * into q from public.dq_quarantine where id = p_id for update;
  if not found then return 'not_found'; end if;
  if q.dataset <> 'broker_research' then raise exception 'wrong_dataset'; end if;
  if q.status <> 'open' then return 'already_resolved'; end if;
  select d.document_id into v_doc from public.broker_report_documents d where d.sha256 = split_part(q.natural_key, ':', 1);
  select * into r from public.broker_research_reports where document_id = v_doc for update;
  if r.report_id is not null and r.status = 'published' then raise exception 'published_immutable'; end if;
  if r.report_id is not null and r.status = 'draft' then
    if p_status = 'resolved_reject' then
      update public.broker_research_reports set review_status = 'rejected' where report_id = r.report_id;
    elsif q.reason_code in ('unknown_rating_label','ambiguous_rating_label') then
      if v_payload ? 'close_scale_id' then
        if not (v_payload ? 'valid_to') then raise exception 'hook_params_required'; end if;
        update public.research_rating_scales set valid_to = (v_payload ->> 'valid_to')::date, closed_by = p_by
        where scale_id = (v_payload ->> 'close_scale_id')::uuid and institution_id = r.institution_id and valid_to is null;
        v_wrote := true;
      end if;
      if v_payload ? 'normalized' then
        v_label := coalesce(v_payload ->> 'raw_label', q.payload ->> 'rating_raw');
        if r.institution_id is null or v_label is null or not (v_payload ? 'source_url' and v_payload ? 'valid_from') then raise exception 'hook_params_required'; end if;
        insert into public.research_rating_scales (institution_id, raw_label, normalized, source_url, valid_from, created_by)
        values (r.institution_id, v_label, v_payload ->> 'normalized', v_payload ->> 'source_url', (v_payload ->> 'valid_from')::date, p_by)
        on conflict (institution_id, lower(raw_label), valid_from) do nothing;
        v_wrote := true;
      end if;
      if not v_wrote then raise exception 'hook_params_required'; end if;
    elsif q.reason_code in ('unresolved_ticker','ticker_issuer_conflict') then
      if not (v_payload ? 'target_key' and v_payload ? 'security_ticker') then raise exception 'hook_params_required'; end if;
      perform public.broker_target_override(r.report_id, v_payload ->> 'target_key', v_payload ->> 'security_ticker', (v_payload ->> 'issuer_id')::uuid, p_by, 'quarantine:' || p_id::text);
    elsif q.reason_code = 'possible_version' then
      if not (v_payload ? 'supersedes_report_id') then raise exception 'hook_params_required'; end if;
      update public.broker_research_reports set supersedes_report_id = (v_payload ->> 'supersedes_report_id')::uuid where report_id = r.report_id;
    end if;
    perform public.broker_report_materialize(r.report_id);
  end if;
  update public.dq_quarantine
  set status = p_status, resolved_by = p_by, resolved_at = now(),
      detail = detail || jsonb_build_object('hook', jsonb_build_object('function', 'broker_quarantine_resolve', 'payload', v_payload, 'at', to_jsonb(now())))
  where id = p_id;
  return 'resolved';
end $$;
revoke execute on function public.broker_quarantine_resolve(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_quarantine_resolve(uuid, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- leases, runs, outbox, purge (§4.2, §4.3, §6.5, §8.3)
-- Claim: free or expired lease only (lease_until is null or < now()); taking over an expired lease
-- finishes that document's running parse/extract/summary/translate runs as failed:lease_expired.
create or replace function public.broker_document_claim_lease(p_document uuid, p_token uuid, p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.broker_report_documents;
begin
  if p_token is null or p_ttl_seconds is null or p_ttl_seconds < 1 then raise exception 'invalid_lease_args' using errcode = '22023'; end if;
  select * into d from public.broker_report_documents where document_id = p_document for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if d.lease_until is not null and d.lease_until >= now() then return false; end if;
  if d.lease_token is not null then
    update public.broker_report_runs set status = 'failed', detail = detail || jsonb_build_object('error_code', 'lease_expired')
    where document_id = p_document and status = 'running' and kind <> 'verify';
  end if;
  update public.broker_report_documents set lease_token = p_token, lease_until = now() + make_interval(secs => p_ttl_seconds) where document_id = p_document;
  return true;
end $$;
revoke execute on function public.broker_document_claim_lease(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.broker_document_claim_lease(uuid, uuid, integer) to service_role;

-- Fenced write: token equality only (an expired but not yet overwritten lease may still finish).
create or replace function public.broker_document_fenced_update(p_document uuid, p_token uuid, p_patch jsonb, p_release boolean)
returns text language plpgsql security definer set search_path = public as $$
declare d public.broker_report_documents; v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if v_patch - array['status','current_parse_run_id','page_count'] <> '{}'::jsonb then raise exception 'invalid_patch' using errcode = '22023'; end if;
  select * into d from public.broker_report_documents where document_id = p_document for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if d.lease_token is distinct from p_token then return 'lease_lost'; end if;
  update public.broker_report_documents
  set status = coalesce(v_patch ->> 'status', status),
      current_parse_run_id = case when v_patch ? 'current_parse_run_id' then (v_patch ->> 'current_parse_run_id')::uuid else current_parse_run_id end,
      page_count = case when v_patch ? 'page_count' then (v_patch ->> 'page_count')::int else page_count end,
      lease_token = case when coalesce(p_release, false) then null else lease_token end,
      lease_until = case when coalesce(p_release, false) then null else lease_until end
  where document_id = p_document;
  return 'ok';
end $$;
revoke execute on function public.broker_document_fenced_update(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.broker_document_fenced_update(uuid, uuid, jsonb, boolean) to service_role;

-- Run finish (fenced): lock the document, compare tokens (verify runs may pass a null token and are
-- not fenced). Mismatch → a still-running run is finished failed:lease_lost and 'lease_lost' is
-- returned; a finished run → run_finished. Patch: status (succeeded|failed) + artifact/request/
-- response paths + detail (merged).
create or replace function public.broker_run_finish(p_run uuid, p_token uuid, p_patch jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare ru public.broker_report_runs; v_tok uuid; v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if v_patch - array['status','artifact_path','artifact_hash','request_path','response_path','detail'] <> '{}'::jsonb
     or coalesce(v_patch ->> 'status', '') not in ('succeeded','failed') then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  select * into ru from public.broker_report_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  if not (ru.kind = 'verify' and p_token is null) then
    select lease_token into v_tok from public.broker_report_documents where document_id = ru.document_id for update;
    if v_tok is distinct from p_token then
      update public.broker_report_runs
      set status = 'failed', detail = detail || coalesce(case when jsonb_typeof(v_patch -> 'detail') = 'object' then v_patch -> 'detail' end, '{}'::jsonb)
                                     || jsonb_build_object('error_code', 'lease_lost', 'lease_lost', true)
      where run_id = p_run and status = 'running';
      return 'lease_lost';
    end if;
  end if;
  select * into ru from public.broker_report_runs where run_id = p_run;
  if ru.status <> 'running' then raise exception 'run_finished'; end if;
  update public.broker_report_runs
  set status = v_patch ->> 'status',
      artifact_path = coalesce(v_patch ->> 'artifact_path', artifact_path), artifact_hash = coalesce(v_patch ->> 'artifact_hash', artifact_hash),
      request_path = coalesce(v_patch ->> 'request_path', request_path), response_path = coalesce(v_patch ->> 'response_path', response_path),
      detail = detail || coalesce(case when jsonb_typeof(v_patch -> 'detail') = 'object' then v_patch -> 'detail' end, '{}'::jsonb)
  where run_id = p_run;
  return 'ok';
end $$;
revoke execute on function public.broker_run_finish(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_run_finish(uuid, uuid, jsonb) to service_role;

-- attempts + 1; delivered → 'delivered'; the 10th failure → 'failed' (spec §8.3).
create or replace function public.broker_outbox_mark(p_event uuid, p_delivered boolean, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.broker_outbox
  set attempts = attempts + 1,
      status = case when p_delivered then 'delivered' when attempts + 1 >= 10 then 'failed' else 'pending' end,
      last_error = case when p_delivered then null else p_error end,
      delivered_at = case when p_delivered then now() else null end
  where event_id = p_event and status = 'pending';
  if not found then raise exception 'event_not_pending'; end if;
end $$;
revoke execute on function public.broker_outbox_mark(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.broker_outbox_mark(uuid, boolean, text) to service_role;

create or replace function public.broker_purge_step_record(p_document uuid, p_step text, p_ok boolean, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.broker_purge_steps (document_id, step, status, attempts, last_error, at)
  values (p_document, p_step, case when p_ok then 'done' else 'failed' end, 1, case when p_ok then null else p_error end, now())
  on conflict (document_id, step) do update
    set status = excluded.status, attempts = public.broker_purge_steps.attempts + 1, last_error = excluded.last_error, at = now();
end $$;
revoke execute on function public.broker_purge_step_record(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.broker_purge_step_record(uuid, text, boolean, text) to service_role;

-- ---------------------------------------------------------------- function-backed triggers
-- Snippet approval (§4.7): text present, length <= the licence's current N, disclosure_check
-- passed with version disclosure/1, an approver; approved_at stamped. Leaving 'approved' clears
-- approved_by/approved_at. Checked on every write while approved.
create or replace function public.broker_snippets_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int;
begin
  if new.status = 'approved' then
    select l.snippet_max_chars into v_max from public.broker_research_reports r
      join public.broker_report_documents d on d.document_id = r.document_id join public.broker_report_licences l on l.licence_id = d.licence_id
    where r.report_id = new.report_id;
    if new.text is null or length(new.text) > v_max then raise exception 'snippet_too_long:%', coalesce(length(new.text), 0); end if;
    if new.disclosure_check is null or new.disclosure_check ->> 'passed' is distinct from 'true' or new.disclosure_check ->> 'version' is distinct from 'disclosure/1' then
      raise exception 'disclosure_failed';
    end if;
    if new.approved_by is null then raise exception 'approver_required'; end if;
    if tg_op = 'INSERT' or old.status <> 'approved' then new.approved_at := now(); new.draft_reason := null; end if;
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists broker_snippets_approval on public.broker_report_snippets;
create trigger broker_snippets_approval before insert or update on public.broker_report_snippets
  for each row execute function public.broker_snippets_approval();

-- Summary approval (§4.7): overlap <= N, grounding passed, disclosure passed, input_hash equals the
-- report's stored summary_input_digest, an approver.
create or replace function public.broker_summaries_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_digest text;
begin
  if new.status = 'approved' then
    select l.snippet_max_chars, r.summary_input_digest into v_max, v_digest from public.broker_research_reports r
      join public.broker_report_documents d on d.document_id = r.document_id join public.broker_report_licences l on l.licence_id = d.licence_id
    where r.report_id = new.report_id;
    if new.max_verbatim_overlap > v_max then raise exception 'summary_overlap:%', new.max_verbatim_overlap; end if;
    if new.numeric_grounding ->> 'passed' is distinct from 'true' then raise exception 'summary_ungrounded'; end if;
    if new.disclosure_check ->> 'passed' is distinct from 'true' or new.disclosure_check ->> 'version' is distinct from 'disclosure/1' then raise exception 'disclosure_failed'; end if;
    if new.input_hash is distinct from v_digest then raise exception 'summary_stale'; end if;
    if new.approved_by is null then raise exception 'approver_required'; end if;
    if tg_op = 'INSERT' or old.status <> 'approved' then new.approved_at := now(); new.draft_reason := null; end if;
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists broker_summaries_approval on public.broker_report_summaries;
create trigger broker_summaries_approval before insert or update on public.broker_report_summaries
  for each row execute function public.broker_summaries_approval();

-- Document withdrawn (§4.4, §6.5): its report → withdrawn (from draft or published, under
-- 'broker.withdrawing'); a current publication gets unpublished_at/'withdrawn:<reason>'; the report
-- trigger below writes claim.retract.
create or replace function public.broker_documents_withdraw_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports;
begin
  if new.status <> 'withdrawn' or old.status = 'withdrawn' then return null; end if;
  select * into r from public.broker_research_reports where document_id = new.document_id and status <> 'withdrawn' for update;
  if not found then return null; end if;
  if r.current_publication_id is not null then
    update public.broker_report_publications set unpublished_at = now(), unpublish_reason = 'withdrawn:' || new.withdrawn_reason
    where publication_id = r.current_publication_id and unpublished_at is null;
  end if;
  perform set_config('broker.withdrawing', r.report_id::text, true);
  update public.broker_research_reports set status = 'withdrawn' where report_id = r.report_id;
  perform set_config('broker.withdrawing', '', true);
  return null;
end $$;
drop trigger if exists broker_documents_withdraw_cascade on public.broker_report_documents;
create trigger broker_documents_withdraw_cascade after update of status on public.broker_report_documents
  for each row execute function public.broker_documents_withdraw_cascade();

-- claim.retract (§10.2): a published report that stops being published, or whose disclosure_ok /
-- evidence_ok turns false, retracts every claim of its (old) current publication once.
create or replace function public.broker_reports_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'published' and old.current_publication_id is not null then
    if new.status <> 'published' then
      perform public.broker_outbox_retract(old.current_publication_id, case when new.status = 'withdrawn' then 'withdraw' else 'unpublish' end);
    elsif old.disclosure_ok and not new.disclosure_ok then
      perform public.broker_outbox_retract(old.current_publication_id, 'disclosure_ok');
    elsif old.evidence_ok and not new.evidence_ok then
      perform public.broker_outbox_retract(old.current_publication_id, 'evidence_ok');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists broker_reports_after_change on public.broker_research_reports;
create trigger broker_reports_after_change after update on public.broker_research_reports
  for each row execute function public.broker_reports_after_change();
```

注：`broker_report_publish_blockers` 第 15 条的标题结果约定（`rule:'disclosure'`, `detail.surface`）必须由 B4/C6 的规则运行写入；`blocking:false`（否则第 12 条把 `title_original` 不通过误判为 `rules_stale`）。

- [ ] **Step 4: 运行，确认通过**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
```

Expected: 块 1 + 块 2 全 PASS。常见失败与处理：`array_agg(distinct … order by …)` 报 "in an aggregate with DISTINCT, ORDER BY expressions must appear in argument list" → 已保证 order by 表达式与参数相同，不要改成别的表达式；`snapshot.fields[0].artifact_hash` 为 `null` 说明 `parse_run_id` 未写入候选（检查 `broker_extract_commit` 用的是 `ru.parse_run_id`）。

- [ ] **Step 5: 全量门禁**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
npm run typecheck && npm run lint
```

- [ ] **Step 6: 锁定迁移**

```bash
node -e "const fs=require('fs'),c=require('crypto');const f='20261113091000_broker_research_functions.sql';const p='supabase/migrations.lock.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.migrations.some(m=>m.file===f))throw new Error('already locked');j.migrations.push({file:f,sha256:c.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+f)).digest('hex')});fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
npx tsx -e "import('./scripts/ci/research-checks.ts').then(m=>{m.migrationInventory();console.log('inventory ok')})"
```

- [ ] **Step 7: 实施记录 + 提交**

追加 `| A2 | 20261113091000_broker_research_functions.sql 锁定；物化/复核/阻断/发布/撤回/钩子/租约；集成块 2 | <sha> |`。

```bash
git add supabase/migrations/20261113091000_broker_research_functions.sql supabase/migrations.lock.json src/lib/broker-research/broker-research.integration.test.ts docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): FR-0 migration 2 — materialize, review, blockers, publish, hooks, leases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: 迁移三 —— 9 个公开视图与视图权限

**Files:**
- Create: `supabase/migrations/20261113092000_broker_research_views.sql`
- Modify: `src/lib/broker-research/broker-research.integration.test.ts`（追加块 3）
- Modify: `supabase/migrations.lock.json`
- Modify: `docs/audits/2026-11-06-foreign-research/10-implementation-log.md`

- [ ] **Step 1: 写失败的集成测试（块 3，真实 anon / authenticated 角色）**

顶部 import 区追加 `import type {PoolClient} from 'pg';`，文件末尾追加：

```ts
describe.skipIf(!enabled)('A3 public views under the real anon and authenticated roles',()=>{
 const M3='supabase/migrations/20261113092000_broker_research_views.sql';
 const VIEWS=['broker_reports_public_v','broker_report_targets_public_v','broker_report_citations_v','broker_report_snippets_public_v','broker_report_summaries_public_v','broker_analysts_public_v','broker_rating_history_v','research_institutions_public_v','research_rating_scales_public_v'];
 beforeAll(bind);
 afterAll(async()=>{await s?.q(`update public.broker_research_settings set public_enabled=false where id=1`);await pool?.end();});
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
   institutions:await n(`select count(*) n from public.research_institutions_public_v where institution_id=$1`,[inst]),
   scales:await n(`select count(*) n from public.research_rating_scales_public_v where institution_id=$1`,[inst]),
  };
 });
 const NONE={reports:0,targets:0,citations:0,snippets:0,summaries:0,analysts:0,history:0,institutions:0,scales:0};
 /** A published report with one approved snippet, one approved zh summary and a public analyst. */
 const published=async(o:Parameters<typeof world>[0]={})=>{
  const w=await ready(o);
  const af=(await s.one(`select public.broker_field_add($1,$2::jsonb,$3) v`,[w.rep,J({target_key:null,field:'analyst',occurrence:1,value_text:'Ann Analyst',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:5,char_end:16,value_source_text:'Ann Analyst',parse_run_id:w.pr,status:'confirmed'}),randomUUID()])).field_id;
  const an=await s.one(`insert into public.research_analysts(institution_id,display_name,public_display) values($1,'Ann Analyst',true) returning analyst_id v`,[w.inst]);
  await s.q(`insert into public.broker_report_analysts(report_id,analyst_id,role,field_id) values($1,$2,'lead',$3)`,[w.rep,an,af]);
  await materialize(w.rep);await rules(w.rep);
  const sn=await s.one(`insert into public.broker_report_snippets(report_id,target_key,purpose,parse_run_id,page,char_start,char_end,text,disclosure_check,created_by) values($1,$2,'thesis',$3,2,0,8,'Thesis!!',$4::jsonb,gen_random_uuid()) returning snippet_id v`,[w.rep,w.tk,w.pr,J(PASS)]);
  await s.q(`update public.broker_report_snippets set status='approved',approved_by=gen_random_uuid() where snippet_id=$1`,[sn]);
  const sumRun=randomUUID();
  await s.q(`insert into public.broker_report_runs(run_id,document_id,kind,parse_run_id,model_id,registry_hash,prompt_version,code_version,licence_version) values($1,$2,'summary',$3,'m-sum','reg1','independent-summary/1','test',1)`,[sumRun,w.doc,w.pr]);
  const dg=(await report(w.rep)).summary_input_digest;
  await s.q(`insert into public.broker_report_summaries(report_id,lang,run_id,input_hash,summary_md,max_verbatim_overlap,numeric_grounding,disclosure_check,status,approved_by) values($1,'zh',$2,$3,'独立摘要',1,'{"passed":true}',$4::jsonb,'approved',gen_random_uuid())`,[w.rep,sumRun,dg,J(PASS)]);
  expect(await blockers(w.rep)).toEqual([]);
  const pub=await publish(w.rep);
  return {...w,pub,analyst:an,analystField:af,snippet:sn};
 };

 it('nine views: owner rights, security_invoker=false, security_barrier=true; select-only for both roles; base tables and RPCs unreachable; replays',async()=>{
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
   expect((await fails(asRole(role,c=>c.query(`delete from public.broker_reports_public_v`))))).toMatchObject({code:'42501'});
   expect((await fails(asRole(role,c=>c.query(`update public.broker_report_targets_public_v set target_price=1`))))).toMatchObject({code:'42501'});
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
  const all={reports:1,targets:1,citations:11,snippets:1,summaries:1,analysts:1,history:1,institutions:1,scales:1};
  expect(await seen(w.rep,w.inst)).toEqual(all);
  expect(await seen(w.rep,w.inst,'authenticated')).toEqual(all);
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
  expect((await anon(`select name_en from public.research_institutions_public_v where institution_id=$1`,[inst]))).toHaveLength(1);
  expect((await anon(`select raw_label,normalized from public.research_rating_scales_public_v where institution_id=$1`,[inst]))).toEqual([{raw_label:'Buy',normalized:'buy'}]);
  await enable(false);
  expect(await seen(w.rep,inst)).toEqual(NONE);
 },120000);
});
```

（`citations:11` = 10 个已确认字段 `institution, published_date, title, ticker, rating, target_price, target_currency, price_at_report, price_currency, price_as_of_date` + 1 条公开分析师行。）

- [ ] **Step 2: 运行，确认失败**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
```

Expected: 块 1、2 PASS；块 3 FAIL（`relation "public.broker_reports_public_v" does not exist`）。

- [ ] **Step 3: 写迁移 `supabase/migrations/20261113092000_broker_research_views.sql`**

每个视图内联同一段 `visible_reports` CTE（规格 §4.11 原文 + 取 `published_at` 的发布行联接；`join … p.licence_version = l.version` 与规格的 `exists (…)` 等价，因为 `publication_id` 唯一）。视图不调用任何函数；生效值选择器以 `case` 内联。

```sql
-- supabase/migrations/20261113092000_broker_research_views.sql
-- FR-0 (spec §4.11, §4.13): the only public read path. Nine views owned by the migration role,
-- security_invoker=false + security_barrier=true, so anon/authenticated read through them with
-- the owner's rights while every base table stays service_role-only. No view calls a function
-- (a called function would need EXECUTE for the caller): the licence predicate and the effective
-- value selector (broker_field_effective) are inlined. Every view: revoke all, then grant select
-- to anon, authenticated, service_role. broker_rating_history_v reads the two public views it is
-- defined over (spec: "来自 targets_public_v"). Replayable: create or replace view.

-- ---------------------------------------------------------------- reports
create or replace view public.broker_reports_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select v.report_id, v.revision, v.current_publication_id as publication_id, v.scope, v.institution_id,
       coalesce(v.title_public, v.title_original) as title, (v.title_public is not null) as title_is_rewritten,
       v.title_zh, v.title_en, (v.title_run_id is not null) as title_is_translation,
       v.published_date, v.price_as_of_date, v.report_type, v.sector_as_stated, v.primary_target_key,
       v.uploaded_at as available_at, v.code_version, v.published_at, v.supersedes_report_id, v.page_count, v.snippet_max_chars,
       v.allows_public_target_price as target_price_public, v.allows_public_summary as summary_public, v.allows_public_snippets as snippets_public
from visible_reports v;

-- ---------------------------------------------------------------- targets
create or replace view public.broker_report_targets_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select t.report_id, v.current_publication_id as publication_id, t.target_key, t.ticker_as_stated, t.security_ticker, t.issuer_id,
       t.rating_raw, t.rating_normalized, t.scale_id,
       case when v.allows_public_target_price then t.target_price end as target_price,
       case when v.allows_public_target_price then t.target_currency end as target_currency,
       case when v.allows_public_target_price then t.target_horizon_months end as target_horizon_months,
       case when v.allows_public_target_price then t.upside_pct end as upside_pct,
       v.allows_public_target_price as target_price_public,
       t.price_at_report, t.price_currency, t.price_as_of_date,
       case when v.allows_public_target_price then t.upside_formula_version end as upside_formula_version
from visible_reports v
join public.broker_report_targets t on t.report_id = v.report_id;

-- ---------------------------------------------------------------- citations (effective rows, no spans)
create or replace view public.broker_report_citations_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select f.report_id, f.field_id, f.target_key, f.field, f.occurrence, f.page,
       case when f.corrected ? 'value_text' then f.corrected ->> 'value_text' else f.value_text end as value_text,
       case when f.corrected ? 'value_num' then (f.corrected ->> 'value_num')::numeric else f.value_num end as value_num,
       case when f.corrected ? 'value_currency' then f.corrected ->> 'value_currency' else f.value_currency end as value_currency,
       case when f.corrected ? 'value_unit' then f.corrected ->> 'value_unit' else f.value_unit end as value_unit,
       case when f.corrected ? 'value_date' then (f.corrected ->> 'value_date')::date else f.value_date end as value_date,
       f.status, split_part(f.extractor, ':', 1) as extractor_kind
from visible_reports v
join public.broker_report_fields f on f.report_id = v.report_id
where f.status in ('confirmed','corrected','absent')
  and not (f.field in ('target_price','target_currency','target_horizon','upside_stated') and not v.allows_public_target_price)
  and (f.field <> 'analyst' or exists (select 1 from public.broker_report_analysts a join public.research_analysts ra on ra.analyst_id = a.analyst_id
                                       where a.field_id = f.field_id and ra.public_display))
  and not (f.field = 'title' and v.title_restricted);

-- ---------------------------------------------------------------- snippets
create or replace view public.broker_report_snippets_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select sn.snippet_id, sn.report_id, sn.target_key, sn.purpose, sn.page, sn.text, sn.field_id
from visible_reports v
join public.broker_report_snippets sn on sn.report_id = v.report_id
where sn.status = 'approved' and v.allows_public_snippets and length(sn.text) <= v.snippet_max_chars;

-- ---------------------------------------------------------------- summaries
create or replace view public.broker_report_summaries_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select su.summary_id, su.report_id, su.lang, su.kind, ru.model_id, ru.registry_hash, ru.prompt_version, su.input_hash, su.summary_md, su.generated_at
from visible_reports v
join public.broker_report_summaries su on su.report_id = v.report_id
join public.broker_report_runs ru on ru.run_id = su.run_id
where su.status = 'approved' and v.allows_public_summary;

-- ---------------------------------------------------------------- analysts
create or replace view public.broker_analysts_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select a.report_id, a.analyst_id, ra.display_name, ra.institution_id, a.role
from visible_reports v
join public.broker_report_analysts a on a.report_id = v.report_id
join public.research_analysts ra on ra.analyst_id = a.analyst_id
where ra.public_display;

-- ---------------------------------------------------------------- rating / target history (facts, no judgement)
create or replace view public.broker_rating_history_v with (security_invoker = false, security_barrier = true) as
select h.report_id, h.prev_report_id, h.target_key, h.institution_id, h.security_ticker, h.issuer_id,
       h.published_date, h.prev_published_date, h.rating_normalized, h.prev_rating_normalized, h.scale_id, h.prev_scale_id,
       h.target_price, h.prev_target_price, h.target_currency, h.upside_formula_version, h.prev_upside_formula_version,
       h.code_version, h.prev_code_version, h.available_at, h.prev_available_at
from (
  select t.report_id, t.target_key, r.institution_id, t.security_ticker, t.issuer_id, r.published_date, t.rating_normalized, t.scale_id,
         t.target_price, t.target_currency, t.upside_formula_version, r.code_version, r.available_at,
         lag(t.report_id) over w as prev_report_id,
         lag(r.published_date) over w as prev_published_date,
         lag(t.rating_normalized) over w as prev_rating_normalized,
         lag(t.scale_id) over w as prev_scale_id,
         lag(t.target_price) over w as prev_target_price,
         lag(t.upside_formula_version) over w as prev_upside_formula_version,
         lag(r.code_version) over w as prev_code_version,
         lag(r.available_at) over w as prev_available_at
  from public.broker_report_targets_public_v t
  join public.broker_reports_public_v r on r.report_id = t.report_id
  where t.report_id not in (select x.supersedes_report_id from public.broker_reports_public_v x where x.supersedes_report_id is not null)
  window w as (partition by r.institution_id, t.security_ticker, t.target_currency order by r.published_date, t.report_id)
) h;

-- ---------------------------------------------------------------- institutions, rating scales
create or replace view public.research_institutions_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select i.institution_id, i.name_en, i.name_zh, i.aliases, i.kind, i.rating_disclosure_url
from public.research_institutions i
join public.broker_research_settings s on s.id = 1
where s.public_enabled and exists (select 1 from visible_reports v where v.institution_id = i.institution_id);

create or replace view public.research_rating_scales_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select sc.scale_id, sc.institution_id, sc.raw_label, sc.normalized, sc.source_url, sc.valid_from, sc.valid_to
from public.research_rating_scales sc
join public.broker_research_settings s on s.id = 1
where s.public_enabled and exists (select 1 from visible_reports v where v.institution_id = sc.institution_id);

-- ---------------------------------------------------------------- view privileges (§4.13)
do $$ declare v text; begin
  foreach v in array array['broker_reports_public_v','broker_report_targets_public_v','broker_report_citations_v','broker_report_snippets_public_v',
    'broker_report_summaries_public_v','broker_analysts_public_v','broker_rating_history_v','research_institutions_public_v','research_rating_scales_public_v'] loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v);
    execute format('grant select on public.%I to anon, authenticated, service_role', v);
  end loop;
end $$;
```

- [ ] **Step 4: 运行，确认通过**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
```

Expected: 块 1–3 全 PASS。

- [ ] **Step 5: 全量门禁、锁定、提交**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
npm run typecheck && npm run lint
node -e "const fs=require('fs'),c=require('crypto');const f='20261113092000_broker_research_views.sql';const p='supabase/migrations.lock.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.migrations.some(m=>m.file===f))throw new Error('already locked');j.migrations.push({file:f,sha256:c.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+f)).digest('hex')});fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
npx tsx -e "import('./scripts/ci/research-checks.ts').then(m=>{m.migrationInventory();console.log('inventory ok')})"
```

实施记录追加 `| A3 | 20261113092000_broker_research_views.sql 锁定；9 视图；集成块 3（真实角色） | <sha> |`。

```bash
git add supabase/migrations/20261113092000_broker_research_views.sql supabase/migrations.lock.json src/lib/broker-research/broker-research.integration.test.ts docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): FR-0 migration 3 — public views with inlined visibility predicate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A4: 契约落地 —— types / hash / effective / supabase 实现 / 内存实现 / 共用契约用例

**Files:**
- Create: `src/lib/broker-research/types.ts`
- Create: `src/lib/broker-research/hash.ts`、`src/lib/broker-research/hash.test.ts`
- Create: `src/lib/broker-research/effective.ts`、`src/lib/broker-research/effective.test.ts`
- Create: `src/lib/broker-research/db.ts`
- Create: `src/lib/broker-research/memory-db.ts`
- Create: `src/lib/broker-research/db-contract.ts`
- Create: `src/lib/broker-research/db.test.ts`
- Modify: `docs/audits/2026-11-06-foreign-research/10-implementation-log.md`

依赖：A3（SQL 全部落地，供 supabase 实现对照）、B1（`versions.ts`）。

- [ ] **Step 1: `types.ts` —— 共享契约原样落地**

把计划《共享契约》代码块**逐字**复制到 `src/lib/broker-research/types.ts`，唯一例外：最后的 `BrokerDeps` 接口暂不写入（它 import 的 `./storage`、`./ports/f3`、`./ports/llm` 分别由 C1、C4 创建，A4 时不存在，typecheck 会失败）。在原位置写一行注释：

```ts
// BrokerDeps (§共享契约) is appended by Task C4, once ./storage (C1) and ./ports/{f3,llm} (C4) exist.
```

（见文末契约修订建议 2；C4 的 Files 需包含 `types.ts`。）

- [ ] **Step 2: 写失败的 hash / effective 单测**

```ts
// src/lib/broker-research/hash.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';

describe('canonicalJson',()=>{
 it('sorts keys by UTF-16 code unit, keeps array order, has no whitespace, writes numbers as decimal strings',()=>{
  expect(canonicalJson({b:1,a:[3,'x',null,true],'é':{z:false,y:0.5}})).toBe('{"a":["3","x",null,true],"b":"1","é":{"y":"0.5","z":false}}');
  expect(canonicalJson({B:1,a:1,_:1})).toBe('{"B":"1","_":"1","a":"1"}');
 });
 it('drops undefined object keys, maps undefined array items to null, rejects non-finite numbers and functions',()=>{
  expect(canonicalJson({a:undefined,b:[undefined]})).toBe('{"b":[null]}');
  expect(()=>canonicalJson({x:Number.NaN})).toThrow('canonical_json_non_finite');
  expect(()=>canonicalJson({f:()=>1})).toThrow('canonical_json_unsupported:function');
 });
 it('sha256Hex hashes the UTF-8 bytes',()=>{
  expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(sha256Hex('研报')).toBe(createHash('sha256').update(Buffer.from('研报','utf8')).digest('hex'));
 });
});
```


```ts
// src/lib/broker-research/effective.test.ts
import {describe,expect,it} from 'vitest';
import {effectiveValue} from './effective';

const row={value_text:'120',value_num:'120.50',value_currency:'HKD',value_unit:'price' as const,value_date:null,corrected:null};
describe('effectiveValue (same rule as SQL broker_field_effective and the citations view)',()=>{
 it('returns the extracted components when there is no correction',()=>{
  expect(effectiveValue(row)).toEqual({value_text:'120',value_num:'120.50',value_currency:'HKD',value_unit:'price',value_date:null});
 });
 it('a present corrected key wins, including an explicit null; a missing key inherits',()=>{
  expect(effectiveValue({...row,corrected:{value_text:'121',value_currency:null}})).toEqual({value_text:'121',value_num:'120.50',value_currency:null,value_unit:'price',value_date:null});
  expect(effectiveValue({...row,corrected:{value_text:'x',value_num:null,value_unit:null,value_date:'2026-01-02'}})).toEqual({value_text:'x',value_num:null,value_currency:'HKD',value_unit:null,value_date:'2026-01-02'});
 });
});
```

- [ ] **Step 3: 运行，确认失败**

```bash
npm test -- src/lib/broker-research/hash.test.ts src/lib/broker-research/effective.test.ts
```

Expected: FAIL（`Cannot find module './hash'` / `'./effective'`）。

- [ ] **Step 4: 实现 `hash.ts` 与 `effective.ts`**

```ts
// src/lib/broker-research/hash.ts
// canonicalJson / sha256Hex (plan 契约补充). Used ONLY for hashes TS owns (behavior_digest,
// disclosure_check.inputs_hash) and for memoryBrokerResearchDb's stand-in digests. effective_hash,
// rules_input_hash, summary_input_digest and snapshot_hash are computed in SQL and never here:
// jsonb's text form differs from canonicalJson. Keys sorted by UTF-16 code unit, no whitespace,
// arrays in order, every number written as its decimal string, Dates as ISO strings.
import {createHash} from 'node:crypto';

export function canonicalJson(v:unknown):string{
 if(v===null)return 'null';
 if(typeof v==='string')return JSON.stringify(v);
 if(typeof v==='boolean')return v?'true':'false';
 if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('canonical_json_non_finite');return JSON.stringify(String(v));}
 if(typeof v==='bigint')return JSON.stringify(v.toString());
 if(v instanceof Date)return JSON.stringify(v.toISOString());
 if(Array.isArray(v))return '['+v.map(x=>x===undefined?'null':canonicalJson(x)).join(',')+']';
 if(typeof v==='object'){
  const o=v as Record<string,unknown>;
  return '{'+Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(o[k])).join(',')+'}';
 }
 throw new Error(`canonical_json_unsupported:${typeof v}`);
}
export const sha256Hex=(s:string):string=>createHash('sha256').update(s,'utf8').digest('hex');
```

```ts
// src/lib/broker-research/effective.ts
// effectiveValue (spec §4.6, plan 契约补充): for each typed component a present `corrected` key
// wins — JSON null clears — and a missing key inherits the extracted value. Same rule as SQL
// broker_field_effective (A2) and the inlined case expressions of broker_report_citations_v (A3);
// the pg contract (A5) asserts the three agree.
import type {FieldRow,TypedValue} from './types';

export const TYPED_KEYS=['value_text','value_num','value_currency','value_unit','value_date'] as const satisfies readonly (keyof TypedValue)[];
export function effectiveValue(row:Pick<FieldRow,'corrected'|keyof TypedValue>):TypedValue{
 const c=row.corrected as Record<string,unknown>|null;
 const pick=<K extends keyof TypedValue>(k:K):TypedValue[K]=>(c!==null&&Object.prototype.hasOwnProperty.call(c,k)?c[k]:row[k]) as TypedValue[K];
 return {value_text:pick('value_text'),value_num:pick('value_num'),value_currency:pick('value_currency'),value_unit:pick('value_unit'),value_date:pick('value_date')};
}
```

- [ ] **Step 5: 运行，确认通过**

```bash
npm test -- src/lib/broker-research/hash.test.ts src/lib/broker-research/effective.test.ts
```

Expected: PASS。

- [ ] **Step 6: 实现 `db.ts`（Supabase 实现 + 三实现共用的规范化工具）**

```ts
// src/lib/broker-research/db.ts
// BrokerResearchDb over Supabase (spec §4.14, plan §共享契约). Private methods use the service-role
// client (tables + RPCs of 20261113091000); public methods use the anon client and read only the
// §4.11 views. Every write that needs a lock, a lease, server time, an attempts counter or a hash
// is an RPC; plain CRUD goes through .from() (the A1 triggers still guard it). numeric columns are
// selected `::text` so decimals never pass through JS numbers; timestamps are normalised to
// toISOString(). Errors: SQL `raise '<code>[:<detail>]'` → BrokerResearchDbError(code, message,
// detail); 23505 → duplicate_key; other 23xxx → constraint_violation (detail = constraint name).
// The normalisers, column lists and bundle builder below are shared with pgBrokerResearchDb (A5).
// New RPCs are not registered in database.types.ts (repo convention): the client is narrowed here.
import type {SupabaseClient} from '@supabase/supabase-js';
import {BrokerResearchDbError} from './types';
import type {AccessLogInput,AnalystRow,BrokerResearchDb,DocumentRow,EvalReceiptRow,FieldRow,InstitutionRow,IntentRow,LicenceRow,MaterializeReceipt,OutboxEvent,PublicReportBundle,PublicationRow,PurgeStepRow,RatingScaleRow,ReportRow,RuleReceiptRow,RunRow,SettingsRow,SnippetRow,SummaryRow,TargetRow} from './types';
export {BrokerResearchDbError} from './types';
export type {BrokerResearchDb} from './types';

export const READ_PAGE=1000;
export const DEFAULT_QUEUE_LIMIT=50;
type R=Record<string,unknown>;

export interface PgErrorLike{message?:string;code?:string|null;details?:string|null}
/** PostgreSQL / PostgREST error → BrokerResearchDbError (shared by the Supabase and pg adapters). */
export function toBrokerResearchDbError(e:PgErrorLike):BrokerResearchDbError{
 if(e instanceof BrokerResearchDbError)return e;
 const message=e.message??'';
 if(e.code==='23505')return new BrokerResearchDbError('duplicate_key',message,/constraint "([^"]+)"/.exec(message)?.[1]);
 if(e.code==='55P03'||message==='lease_lost')return new BrokerResearchDbError('lease_lost',message);
 const m=/^([a-z][a-z0-9_]*)(?::([\s\S]*))?$/.exec(message);
 if(m&&(!e.code?.startsWith('23')||m[1]==='append_only'))return new BrokerResearchDbError(m[1],message,m[2]);
 if(e.code?.startsWith('23'))return new BrokerResearchDbError('constraint_violation',message,/constraint "([^"]+)"/.exec(message)?.[1]);
 return new BrokerResearchDbError('unknown',message||'unknown');
}

export const isoTs=(v:unknown):string=>new Date(String(v)).toISOString();
const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:isoTs(v);
const numOrNull=(v:unknown):number|null=>v===null||v===undefined?null:Number(v);
const strOrNull=(v:unknown):string|null=>v===null||v===undefined?null:String(v);
function norm<T>(r:R,o:{ts?:string[];num?:string[];dec?:string[]}):T{
 const x:R={...r};
 for(const k of o.ts??[])if(k in x)x[k]=isoOrNull(x[k]);
 for(const k of o.num??[])if(k in x)x[k]=numOrNull(x[k]);
 for(const k of o.dec??[])if(k in x)x[k]=strOrNull(x[k]);
 return x as T;
}
export const settingsFromRow=(r:R):SettingsRow=>{const x=norm<R>(r,{ts:['approved_gold_corpus_at','updated_at']});delete x.id;return x as unknown as SettingsRow;};
export const licenceFromRow=(r:R)=>norm<LicenceRow>(r,{ts:['confirmed_at','created_at','updated_at']});
export const intentFromRow=(r:R)=>norm<IntentRow>(r,{ts:['created_at','expires_at','checkpoint_at'],num:['byte_size']});
export const documentFromRow=(r:R)=>norm<DocumentRow>(r,{ts:['uploaded_at','lease_until','last_verified_at','withdrawn_at','purged_at'],num:['byte_size']});
export const runFromRow=(r:R)=>norm<RunRow>(r,{ts:['started_at','finished_at']});
export const reportFromRow=(r:R)=>norm<ReportRow>(r,{ts:['created_at','updated_at']});
export const targetFromRow=(r:R)=>norm<TargetRow>(r,{dec:['target_price','price_at_report','upside_pct']});
export const fieldFromRow=(r:R)=>norm<FieldRow>(r,{ts:['reviewed_at','created_at'],dec:['value_num'],num:['extractor_confidence']});
export const snippetFromRow=(r:R)=>norm<SnippetRow>(r,{ts:['approved_at','created_at']});
export const summaryFromRow=(r:R)=>norm<SummaryRow>(r,{ts:['approved_at','generated_at']});
export const publicationFromRow=(r:R)=>norm<PublicationRow>(r,{ts:['published_at','unpublished_at']});
export const ruleReceiptFromRow=(r:R)=>norm<RuleReceiptRow>(r,{ts:['created_at']});
export const institutionFromRow=(r:R)=>norm<InstitutionRow>(r,{ts:['created_at']});
export const scaleFromRow=(r:R)=>norm<RatingScaleRow>(r,{ts:['created_at','closed_at']});
export const analystFromRow=(r:R)=>norm<AnalystRow>(r,{ts:['created_at']});
export const evalFromRow=(r:R)=>norm<EvalReceiptRow>(r,{ts:['ran_at'],num:['precision_min','recall_min']});
export const outboxFromRow=(r:R)=>norm<OutboxEvent>(r,{ts:['created_at','delivered_at']});
export const purgeFromRow=(r:R)=>norm<PurgeStepRow>(r,{ts:['at']});
export const accessFromRow=(r:R)=>norm<AccessLogInput&{id:string;created_at:string}>(r,{ts:['created_at']});
export const PUBLIC_TS=['available_at','published_at','generated_at','prev_available_at'];
/** A public view row: timestamps ISO; decimals arrive as text (casts in the column lists). */
export const publicRow=(r:R):R=>norm<R>(r,{ts:PUBLIC_TS});
export function receiptFrom(x:unknown):MaterializeReceipt{
 const o=(x??{}) as R;
 return {effectiveHash:String(o.effectiveHash),materializedHash:String(o.materializedHash),targets:Number(o.targets),basis:o.basis as MaterializeReceipt['basis']};
}

// Column lists: PostgREST `alias:column::text` syntax; pg converts them with sqlColumns().
export const FIELD_COLUMNS='field_id,report_id,parse_run_id,run_id,superseded_by_run_id,target_key,field,occurrence,value_text,value_num:value_num::text,value_currency,value_unit,value_date,page,char_start,char_end,value_source_text,extractor,extractor_confidence,status,corrected,conflict_group,detail,reviewed_by,reviewed_at,created_at';
export const TARGET_COLUMNS='report_id,target_key,basis,ticker_as_stated,security_ticker,issuer_id,resolution,rating_raw,rating_normalized,scale_id,target_price:target_price::text,target_currency,target_horizon_months,price_at_report:price_at_report::text,price_currency,price_as_of_date,upside_pct:upside_pct::text,upside_formula_version,input_hash';
export const PUBLIC_TARGET_COLUMNS='report_id,publication_id,target_key,ticker_as_stated,security_ticker,issuer_id,rating_raw,rating_normalized,scale_id,target_price:target_price::text,target_currency,target_horizon_months,upside_pct:upside_pct::text,target_price_public,price_at_report:price_at_report::text,price_currency,price_as_of_date,upside_formula_version';
export const PUBLIC_CITATION_COLUMNS='report_id,field_id,target_key,field,occurrence,page,value_text,value_num:value_num::text,value_currency,value_unit,value_date,status,extractor_kind';
export const HISTORY_COLUMNS='report_id,prev_report_id,target_key,institution_id,security_ticker,issuer_id,published_date,prev_published_date,rating_normalized,prev_rating_normalized,scale_id,prev_scale_id,target_price:target_price::text,prev_target_price:prev_target_price::text,target_currency,upside_formula_version,prev_upside_formula_version,code_version,prev_code_version,available_at,prev_available_at';
/** PostgREST column list → SQL select list ("a:b::text" → "b::text as a"). */
export const sqlColumns=(list:string)=>list.split(',').map(c=>{const m=/^(\w+):(\w+)::text$/.exec(c);return m?`${m[2]}::text as ${m[1]}`:c;}).join(', ');

const byStr=(k:string)=>(a:R,b:R)=>{const x=String(a[k]??''),y=String(b[k]??'');return x<y?-1:x>y?1:0;};
/** Assembles list bundles from the public view rows of one page of reports (order of `reports` kept). */
export function bundles(reports:R[],targets:R[],summaries:R[],snippets:R[],institutions:R[]):PublicReportBundle[]{
 return reports.map(r=>({
  report:publicRow(r),
  targets:targets.filter(t=>t.report_id===r.report_id).map(publicRow).sort(byStr('target_key')),
  hasSummary:{zh:summaries.some(x=>x.report_id===r.report_id&&x.lang==='zh'),en:summaries.some(x=>x.report_id===r.report_id&&x.lang==='en')},
  snippetCount:snippets.filter(x=>x.report_id===r.report_id).length,
  institution:institutions.find(i=>i.institution_id===r.institution_id)??null,
 }));
}
/** fencedUpdateDocument patch → broker_document_fenced_update arguments. */
export function fencedArgs(patch:Partial<Pick<DocumentRow,'status'|'current_parse_run_id'|'page_count'>>&{releaseLease?:boolean}){
 const {releaseLease,...rest}=patch;
 return {patch:Object.fromEntries(Object.entries(rest).filter(([,v])=>v!==undefined)),release:releaseLease===true};
}
export const dropUndefined=<T extends R>(o:T):Partial<T>=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)) as Partial<T>;

interface Res{data:unknown;error:PgErrorLike|null}
type Builder=PromiseLike<Res>&{[k:string]:(...a:unknown[])=>Builder};
interface NarrowClient{rpc:(fn:string,args:R)=>PromiseLike<Res>;from:(t:string)=>Builder}

export function supabaseBrokerResearchDb(clients:{admin?:SupabaseClient|null;anon?:SupabaseClient|null}):BrokerResearchDb{
 const admin=()=>{if(!clients.admin)throw new BrokerResearchDbError('admin_client_required');return clients.admin as unknown as NarrowClient;};
 const anon=()=>{if(!clients.anon)throw new BrokerResearchDbError('anon_client_required');return clients.anon as unknown as NarrowClient;};
 const run=async<T>(q:PromiseLike<Res>):Promise<T>=>{const {data,error}=await q;if(error)throw toBrokerResearchDbError(error);return data as T;};
 const call=<T>(fn:string,args:R)=>run<T>(admin().rpc(fn,args));
 const from=(t:string)=>admin().from(t);
 /** Complete-set read in a fixed order (PostgREST max_rows truncates silently). */
 const pageAll=async(make:()=>Builder,limit?:number):Promise<R[]>=>{
  const out:R[]=[];
  for(let start=0;;start+=READ_PAGE){
   const size=limit===undefined?READ_PAGE:Math.min(READ_PAGE,limit-out.length);
   if(size<=0)return out;
   const part=(await run<R[]|null>(make().range(start,start+size-1)))??[];
   out.push(...part);if(part.length<size)return out;
  }
 };
 const maybe=async(q:Builder)=>(await run<R|null>(q.maybeSingle()));
 const required=async(q:Builder,what:string)=>{const r=await maybe(q);if(!r)throw new BrokerResearchDbError('not_found',`not_found:${what}`,what);return r;};
 const pub=(t:string)=>anon().from(t);
 return {
  async getSettings(){return settingsFromRow(await required(from('broker_research_settings').select('*').eq('id',1),'settings'));},
  async setPublicEnabled(flag,by){await run(from('broker_research_settings').update({public_enabled:flag,updated_by:by,updated_at:new Date().toISOString()}).eq('id',1));},
  async listLicences(){return (await pageAll(()=>from('broker_report_licences').select('*').order('created_at').order('licence_id'))).map(licenceFromRow);},
  async getLicence(id){const r=await maybe(from('broker_report_licences').select('*').eq('licence_id',id));return r?licenceFromRow(r):null;},
  async insertLicence(input){return licenceFromRow(await run<R>(from('broker_report_licences').insert(input).select('*').single()));},
  async updateLicence(id,patch){return licenceFromRow(await required(from('broker_report_licences').update(dropUndefined(patch)).eq('licence_id',id).select('*'),'licence'));},
  async confirmLicence(id,by,version){
   const hit=(await run<R[]|null>(from('broker_report_licences').update({confirmed_by:by,confirmed_at:new Date().toISOString(),confirmed_version:version}).eq('licence_id',id).eq('version',version).select('licence_id')))??[];
   if(hit.length)return 'confirmed';
   await required(from('broker_report_licences').select('licence_id').eq('licence_id',id),'licence');
   return 'version_mismatch';
  },
  async insertIntent(row){await run(from('broker_report_upload_intents').insert(row));},
  async getIntent(id){const r=await maybe(from('broker_report_upload_intents').select('*').eq('intent_id',id));return r?intentFromRow(r):null;},
  async transitionIntent(id,fromStatus,to,patch){
   const hit=(await run<R[]|null>(from('broker_report_upload_intents').update({status:to,...dropUndefined(patch??{})}).eq('intent_id',id).eq('status',fromStatus).select('intent_id')))??[];
   return hit.length>0;
  },
  async findDocumentBySha(sha){const r=await maybe(from('broker_report_documents').select('*').eq('sha256',sha));return r?documentFromRow(r):null;},
  async getDocument(id){const r=await maybe(from('broker_report_documents').select('*').eq('document_id',id));return r?documentFromRow(r):null;},
  async insertDocument(row){
   const {error}=await from('broker_report_documents').insert({...row,status:'uploaded',promotion_pending:true});
   if(!error)return 'inserted';
   const e=toBrokerResearchDbError(error);if(e.code==='duplicate_key')return 'duplicate';throw e;
  },
  async updateDocument(id,patch){await run(from('broker_report_documents').update(dropUndefined(patch)).eq('document_id',id));},
  async claimLease(id,token,ttl){return (await call<unknown>('broker_document_claim_lease',{p_document:id,p_token:token,p_ttl_seconds:ttl}))===true;},
  async fencedUpdateDocument(id,token,patch){const a=fencedArgs(patch);return await call<'ok'|'lease_lost'>('broker_document_fenced_update',{p_document:id,p_token:token,p_patch:a.patch,p_release:a.release});},
  async insertRun(row){await run(from('broker_report_runs').insert({...row,detail:row.detail??{}}));},
  async finishRun(runId,token,patch){return await call<'ok'|'lease_lost'>('broker_run_finish',{p_run:runId,p_token:token,p_patch:dropUndefined(patch)});},
  async getRun(id){const r=await maybe(from('broker_report_runs').select('*').eq('run_id',id));return r?runFromRow(r):null;},
  async listRuns(documentId){return (await pageAll(()=>from('broker_report_runs').select('*').eq('document_id',documentId).order('started_at').order('run_id'))).map(runFromRow);},
  async ensureReport(documentId,codeVersion){
   await run(from('broker_research_reports').upsert({document_id:documentId,code_version:codeVersion},{onConflict:'document_id',ignoreDuplicates:true}));
   return reportFromRow(await required(from('broker_research_reports').select('*').eq('document_id',documentId),'report'));
  },
  async getReport(id){const r=await maybe(from('broker_research_reports').select('*').eq('report_id',id));return r?reportFromRow(r):null;},
  async reportByDocument(id){const r=await maybe(from('broker_research_reports').select('*').eq('document_id',id));return r?reportFromRow(r):null;},
  async updateReportDraft(id,patch){const p=dropUndefined(patch);if(Object.keys(p).length)await run(from('broker_research_reports').update(p).eq('report_id',id));},
  async extractCommit(documentId,token,runId,rows){return receiptFrom(await call('broker_extract_commit',{p_document_id:documentId,p_lease_token:token,p_run_id:runId,p_rows:rows}));},
  async fieldReview(fieldId,action,payload,by){return receiptFrom(await call('broker_field_review',{p_field_id:fieldId,p_action:action,p_payload:payload,p_by:by}));},
  async insertHumanField(reportId,row,by){const x=await call<R>('broker_field_add',{p_report_id:reportId,p_row:row,p_by:by});return {fieldId:String(x.field_id),receipt:receiptFrom(x.receipt)};},
  async upsertTargetOverride(row){return receiptFrom(await call('broker_target_override',{p_report_id:row.report_id,p_target_key:row.target_key,p_security_ticker:row.security_ticker,p_issuer_id:row.issuer_id,p_by:row.set_by,p_note:row.note}));},
  async materialize(id){return receiptFrom(await call('broker_report_materialize',{p_report_id:id}));},
  async listFields(reportId,opts){
   return (await pageAll(()=>{let q=from('broker_report_fields').select(FIELD_COLUMNS).eq('report_id',reportId);if(!opts?.includeSuperseded)q=q.is('superseded_by_run_id',null);
    return q.order('target_key',{ascending:true,nullsFirst:true}).order('field').order('occurrence').order('created_at').order('field_id');})).map(fieldFromRow);
  },
  async listTargets(reportId){return (await pageAll(()=>from('broker_report_targets').select(TARGET_COLUMNS).eq('report_id',reportId).order('target_key'))).map(targetFromRow);},
  async bindAnalyst(row){await run(from('broker_report_analysts').upsert(row,{onConflict:'report_id,analyst_id'}));},
  async insertRuleReceipt(row){return String((await run<R>(from('broker_report_rule_receipts').insert(row).select('receipt_id').single())).receipt_id);},
  async insertSnippet(row){return String((await run<R>(from('broker_report_snippets').insert({...row,status:'draft'}).select('snippet_id').single())).snippet_id);},
  async setSnippetStatus(id,patch){await run(from('broker_report_snippets').update(dropUndefined(patch)).eq('snippet_id',id));},
  async listSnippets(reportId){return (await pageAll(()=>from('broker_report_snippets').select('*').eq('report_id',reportId).order('created_at').order('snippet_id'))).map(snippetFromRow);},
  async insertSummary(row){return String((await run<R>(from('broker_report_summaries').insert(row).select('summary_id').single())).summary_id);},
  async setSummaryStatus(id,patch){await run(from('broker_report_summaries').update(dropUndefined(patch)).eq('summary_id',id));},
  async listSummaries(reportId){return (await pageAll(()=>from('broker_report_summaries').select('*').eq('report_id',reportId).order('generated_at').order('summary_id'))).map(summaryFromRow);},
  async publishBlockers(id){return ((await call<string[]|null>('broker_report_publish_blockers',{p_report_id:id}))??[]).map(String);},
  async publish(id,by){return {publicationId:String(await call('broker_report_publish',{p_report_id:id,p_by:by}))};},
  async unpublish(id,by,reason){await call('broker_report_unpublish',{p_report_id:id,p_by:by,p_reason:reason});},
  async getPublication(id){const r=await maybe(from('broker_report_publications').select('*').eq('publication_id',id));return r?publicationFromRow(r):null;},
  async upsertInstitution(row){
   const q=row.institution_id?from('research_institutions').upsert(row,{onConflict:'institution_id'}):from('research_institutions').insert(row);
   return String((await run<R>(q.select('institution_id').single())).institution_id);
  },
  async listInstitutions(){return (await pageAll(()=>from('research_institutions').select('*').order('name_en').order('institution_id'))).map(institutionFromRow);},
  async insertRatingScale(row){return String((await run<R>(from('research_rating_scales').insert(row).select('scale_id').single())).scale_id);},
  async closeRatingScale(id,validTo,by){await required(from('research_rating_scales').update({valid_to:validTo,closed_by:by}).eq('scale_id',id).select('scale_id'),'rating_scale');},
  async listRatingScales(inst){return (await pageAll(()=>from('research_rating_scales').select('*').eq('institution_id',inst).order('raw_label').order('valid_from').order('scale_id'))).map(scaleFromRow);},
  async upsertAnalyst(row){
   const q=row.analyst_id?from('research_analysts').upsert(row,{onConflict:'analyst_id'}):from('research_analysts').insert(row);
   return String((await run<R>(q.select('analyst_id').single())).analyst_id);
  },
  async listAnalysts(inst){return (await pageAll(()=>from('research_analysts').select('*').eq('institution_id',inst).order('display_name').order('analyst_id'))).map(analystFromRow);},
  async reviewQueue(opts){
   const statuses=opts.status?[opts.status]:['pending','in_review'];
   return (await pageAll(()=>from('broker_research_reports').select('*').eq('status','draft').in('review_status',statuses).order('updated_at').order('report_id'),opts.limit??DEFAULT_QUEUE_LIMIT)).map(reportFromRow);
  },
  async logAccess(row){await run(from('broker_report_access_log').insert(row));},
  async listAccessLog(opts){
   return (await pageAll(()=>{let q=from('broker_report_access_log').select('*');if(opts.documentId)q=q.eq('document_id',opts.documentId);return q.order('created_at',{ascending:false}).order('id',{ascending:false});},opts.limit)).map(accessFromRow);
  },
  async insertEvalReceipt(row){return String((await run<R>(from('broker_eval_receipts').insert(row).select('receipt_id').single())).receipt_id);},
  async latestEvalReceipt(digest){
   const rows=(await run<R[]|null>(from('broker_eval_receipts').select('*').eq('behavior_digest',digest).order('ran_at',{ascending:false}).order('receipt_id',{ascending:false}).limit(1)))??[];
   return rows[0]?evalFromRow(rows[0]):null;
  },
  async takePendingOutbox(limit){return (await pageAll(()=>from('broker_outbox').select('*').eq('status','pending').order('created_at').order('event_id'),limit)).map(outboxFromRow);},
  async markOutbox(id,outcome){await call('broker_outbox_mark',{p_event:id,p_delivered:outcome.delivered,p_error:outcome.delivered?null:outcome.error});},
  async upsertPurgeStep(documentId,step,outcome){await call('broker_purge_step_record',{p_document:documentId,p_step:step,p_ok:outcome.ok,p_error:outcome.ok?null:outcome.error});},
  async purgeSteps(documentId){return (await pageAll(()=>from('broker_purge_steps').select('*').eq('document_id',documentId).order('step'))).map(purgeFromRow);},
  // ---- public: anon client, views only
  async publicReports(filter){
   let ids:string[]|null=null;
   if(filter.issuerId||filter.rating){
    let q=pub('broker_report_targets_public_v').select('report_id');
    if(filter.issuerId)q=q.eq('issuer_id',filter.issuerId);
    if(filter.rating)q=q.eq('rating_normalized',filter.rating);
    ids=[...new Set(((await run<R[]|null>(q.limit(5000)))??[]).map(r=>String(r.report_id)))];
    if(!ids.length)return [];
   }
   let q=pub('broker_reports_public_v').select('*');
   if(filter.institutionId)q=q.eq('institution_id',filter.institutionId);
   if(filter.scope)q=q.eq('scope',filter.scope);
   if(filter.from)q=q.gte('published_date',filter.from);
   if(filter.to)q=q.lte('published_date',filter.to);
   if(ids)q=q.in('report_id',ids);
   if(filter.cursor)q=q.or(`published_date.lt.${filter.cursor.publishedDate},and(published_date.eq.${filter.cursor.publishedDate},report_id.lt.${filter.cursor.reportId})`);
   const reports=(await run<R[]|null>(q.order('published_date',{ascending:false}).order('report_id',{ascending:false}).limit(filter.limit)))??[];
   if(!reports.length)return [];
   const page=reports.map(r=>String(r.report_id));
   const insts=[...new Set(reports.map(r=>r.institution_id).filter((x):x is string=>typeof x==='string'))];
   const [targets,summaries,snippets,institutions]=await Promise.all([
    run<R[]|null>(pub('broker_report_targets_public_v').select(PUBLIC_TARGET_COLUMNS).in('report_id',page)),
    run<R[]|null>(pub('broker_report_summaries_public_v').select('report_id,lang').in('report_id',page)),
    run<R[]|null>(pub('broker_report_snippets_public_v').select('report_id').in('report_id',page)),
    insts.length?run<R[]|null>(pub('research_institutions_public_v').select('*').in('institution_id',insts)):Promise.resolve([] as R[]),
   ]);
   return bundles(reports,targets??[],summaries??[],snippets??[],institutions??[]);
  },
  async publicReport(id){
   const report=await run<R|null>(pub('broker_reports_public_v').select('*').eq('report_id',id).maybeSingle());
   if(!report)return null;
   const [targets,citations,snippets,summaries,analysts,institutions]=await Promise.all([
    run<R[]|null>(pub('broker_report_targets_public_v').select(PUBLIC_TARGET_COLUMNS).eq('report_id',id)),
    run<R[]|null>(pub('broker_report_citations_v').select(PUBLIC_CITATION_COLUMNS).eq('report_id',id).order('target_key',{nullsFirst:true}).order('field').order('occurrence')),
    run<R[]|null>(pub('broker_report_snippets_public_v').select('*').eq('report_id',id).order('page').order('snippet_id')),
    run<R[]|null>(pub('broker_report_summaries_public_v').select('*').eq('report_id',id).order('lang')),
    run<R[]|null>(pub('broker_analysts_public_v').select('*').eq('report_id',id).order('display_name')),
    report.institution_id?run<R[]|null>(pub('research_institutions_public_v').select('*').eq('institution_id',String(report.institution_id))):Promise.resolve([] as R[]),
   ]);
   const [b]=bundles([report],targets??[],summaries??[],snippets??[],institutions??[]);
   return {...b,citations:citations??[],snippets:snippets??[],summaries:(summaries??[]).map(publicRow),analysts:analysts??[]};
  },
  async publicInstitutions(){return (await run<R[]|null>(pub('research_institutions_public_v').select('*').order('name_en')))??[];},
  async ratingHistory(opts){
   let q=pub('broker_rating_history_v').select(HISTORY_COLUMNS).eq('security_ticker',opts.securityTicker);
   if(opts.institutionId)q=q.eq('institution_id',opts.institutionId);
   if(opts.currency)q=q.eq('target_currency',opts.currency);
   return ((await run<R[]|null>(q.order('published_date',{ascending:false}).order('report_id',{ascending:false}).limit(opts.limit)))??[]).map(publicRow);
  },
 };
}
```

- [ ] **Step 7: 实现 `memory-db.ts`**

```ts
// src/lib/broker-research/memory-db.ts
// In-memory BrokerResearchDb for unit tests of the services (spec §4.14: "实现触发器/函数的等价规则").
// Emulated, with the same error codes as the SQL: licence version bump + confirmation clearing +
// approved texts → draft + disclosure_ok=false + licence.changed; intent and document transition
// tables; leases on an injectable clock (claim, expiry takeover failing running runs, fenced
// writes, finish once, lease_lost marking); extract_commit; materialize (picks, basis, upside/1 by
// BigInt, exact-one scale, report-level sync, summary/snippet invalidation); field_review,
// field_add, target_override; the 17 publish blockers in SQL order; publish (snapshot, outbox
// registers), unpublish, document withdraw cascade and every claim.retract path; the
// reports_guard rules for updateReportDraft; snippet/summary approval; close-only scales; analyst
// disclosure cascade; outbox attempts; purge steps; the quarantine hook; the nine public views on
// the clock's UTC date. DELIBERATELY SIMPLIFIED: (1) hashes are sha256Hex(canonicalJson(...)) of
// the same inputs — values differ from SQL, only equal/unequal relations carry over; (2) decimal
// strings are kept as given (PostgreSQL would print '0120' as '120'): pass canonical decimals;
// (3) a claim's subject.market comes from the ticker suffix (.HK → HK, .SH/.SZ/.BJ → A, else US),
// not from stocks_universe; (4) no foreign keys and only the check constraints named in the code;
// (5) no row locks — calls are serialised by the event loop.
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {Row,TableClient} from '../db/table-client';
import {bundles,publicRow} from './db';
import {effectiveValue} from './effective';
import {canonicalJson,sha256Hex} from './hash';
import {BrokerResearchDbError} from './types';
import type {AccessLogInput,AnalystRow,BrokerResearchDb,CandidateFieldInput,DocumentRow,DocumentStatus,EvalReceiptRow,FieldRow,InstitutionRow,IntentRow,IntentStatus,LicenceInput,LicenceRow,MaterializeReceipt,OutboxEvent,PublicationRow,PurgeStepRow,RatingScaleRow,ReportAnalystRow,ReportRow,RuleReceiptRow,RunRow,SettingsRow,SnippetRow,SummaryRow,TargetRow,TypedValue} from './types';
import {CLAIM_METHODOLOGY_VERSION,DISCLOSURE_VERSION,RULES_VERSION,UPSIDE_FORMULA_VERSION} from './versions';

type R=Record<string,unknown>;
type Snip=SnippetRow&{draft_reason:string|null};type Summ=SummaryRow&{draft_reason:string|null};
interface Override{override_id:string;report_id:string;target_key:string;security_ticker:string;issuer_id:string|null;set_by:string;set_at:string;note:string|null}
export interface MemoryBrokerResearchDb extends BrokerResearchDb{
 tables:TableClient;
 setNow(iso:string|null):void;
 expireLease(documentId:string):void;
 setGoldCorpusHash(hash:string|null):void;
 outbox():OutboxEvent[];
 draftReason(kind:'snippet'|'summary',id:string):string|null;
 /** Same contract as SQL broker_quarantine_resolve (契约修订建议 3). */
 quarantineResolve(id:string,status:'resolved_accept'|'resolved_reject',by:string,payload:R):Promise<'resolved'|'not_found'|'already_resolved'>;
}

const EFF=new Set(['confirmed','corrected','absent']);const CAND=new Set(['extracted','unverified']);
const MATERIAL:readonly (keyof LicenceInput)[]=['allows_llm_processing','allows_public_metadata','allows_public_snippets','allows_public_summary','allows_public_target_price','snippet_max_chars','valid_from','valid_to','terms_summary','licence_kind','holder'];
const INTENT_MOVES=new Set(['open>validating','open>expired','open>abandoned','validating>validated','validating>abandoned','validating>expired','validated>promoting','validated>abandoned','validated>expired','promoting>committed','promoting>abandoned']);
const DOC_MOVES=new Set(['uploaded>parsing','parse_failed>parsing','parsed>parsing','parsing>parsed','parsing>parse_failed']);
const BLOCKING_Q=new Set(['upside_mismatch','currency_mismatch','date_order','nonpositive_price','unknown_rating_label','ambiguous_rating_label','ticker_issuer_conflict','unresolved_ticker']);
const TARGET_FIELDS=new Set(['ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','price_as_of_date','upside_stated']);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const idKey=(f:{target_key:string|null;field:string;occurrence:number})=>`${f.target_key??''}\u0000${f.field}\u0000${f.occurrence}`;
const clone=<T>(v:T):T=>structuredClone(v);
function fail(code:string,detail?:string):never{throw new BrokerResearchDbError(code,detail===undefined?code:`${code}:${detail}`,detail);}
const same=(a:unknown,b:unknown)=>canonicalJson(a??null)===canonicalJson(b??null);
const dec=(s:string)=>{const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(s);if(!m)fail('invalid_decimal',s);const f=m[3]??'';return {n:BigInt(`${m[1]}${m[2]}${f}`),scale:f.length};};
/** sign(a − b) on decimal strings. */
export function decimalCompare(a:string,b:string):number{const x=dec(a),y=dec(b);const l=x.n*10n**BigInt(y.scale),r=y.n*10n**BigInt(x.scale);return l<r?-1:l>r?1:0;}
/** upside/1 = round(tp / pr − 1, 6), half away from zero, always 6 decimals (PostgreSQL round(numeric, 6)); null when pr = 0. */
export function upside1(tp:string,pr:string):string|null{
 const a=dec(tp),b=dec(pr);if(b.n===0n)return null;
 const A=a.n*10n**BigInt(b.scale),B=b.n*10n**BigInt(a.scale);
 const num=(A-B)*1000000n,den=B;
 let q=num/den;const r=num%den;
 if(2n*(r<0n?-r:r)>=(den<0n?-den:den))q+=(num<0n)!==(den<0n)?-1n:1n;
 const neg=q<0n;const s=(neg?-q:q).toString().padStart(7,'0');
 return `${neg?'-':''}${s.slice(0,-6)}.${s.slice(-6)}`;
}
const marketOf=(t:string|null)=>t===null?null:/\.HK$/.test(t)?'HK':/\.(SH|SZ|BJ)$/.test(t)?'A':'US';

export function memoryBrokerResearchDb(tables:TableClient=memoryTableClient({dq_quarantine:['id']})):MemoryBrokerResearchDb{
 let fixedNow:string|null=null;let last='';
 const now=()=>fixedNow??new Date().toISOString();
 /** Strictly increasing timestamps (row order = SQL insertion order). */
 const stamp=()=>{const t=now();last=t>last?t:new Date(Date.parse(last)+1).toISOString();return last;};
 const today=()=>now().slice(0,10);
 const plusSec=(s:number)=>new Date(Date.parse(now())+s*1000).toISOString();
 const settings:SettingsRow={public_enabled:false,approved_gold_corpus_hash:null,approved_gold_corpus_by:null,approved_gold_corpus_at:null,updated_by:null,updated_at:now()};
 const licences=new Map<string,LicenceRow>(),intents=new Map<string,IntentRow>(),documents=new Map<string,DocumentRow>(),runs=new Map<string,RunRow>();
 const reports=new Map<string,ReportRow>(),targets=new Map<string,TargetRow[]>(),overrides=new Map<string,Override>(),fields=new Map<string,FieldRow>();
 const snippets=new Map<string,Snip>(),summaries=new Map<string,Summ>(),publications=new Map<string,PublicationRow>();
 const ruleReceipts:RuleReceiptRow[]=[],evals:EvalReceiptRow[]=[],outbox:OutboxEvent[]=[],access:(AccessLogInput&{id:string;created_at:string})[]=[];
 const institutions=new Map<string,InstitutionRow>(),scales=new Map<string,RatingScaleRow>(),analysts=new Map<string,AnalystRow>(),bindings:ReportAnalystRow[]=[];
 const purge=new Map<string,PurgeStepRow>();
 const runSeq=new Map<string,number>();
 const req=<T>(m:Map<string,T>,id:string,what:string):T=>m.get(id)??fail(`${what}_not_found`);
 const docOf=(r:ReportRow)=>documents.get(r.document_id)!;const licOf=(r:ReportRow)=>licences.get(docOf(r).licence_id)!;
 const licenceOk=(l:LicenceRow)=>l.confirmed_at!==null&&l.confirmed_version===l.version&&today()>=l.valid_from&&(l.valid_to===null||today()<=l.valid_to);
 const fieldsOf=(rep:string)=>[...fields.values()].filter(f=>f.report_id===rep);
 const effOf=(rep:string)=>fieldsOf(rep).filter(f=>EFF.has(f.status)).sort((a,b)=>cmp(idKey(a),idKey(b)));
 const liveCand=(rep:string)=>fieldsOf(rep).filter(f=>CAND.has(f.status)&&f.superseded_by_run_id===null);

 // ---------------------------------------------------------------- outbox and report changes
 const enqueue=(kind:OutboxEvent['kind'],payload:R)=>{const id=randomUUID();outbox.push({event_id:id,kind,payload:{event_id:id,kind,...payload},status:'pending',attempts:0,last_error:null,created_at:stamp(),delivered_at:null});};
 const retract=(pub:string,reason:string)=>{
  for(const e of outbox.filter(x=>x.kind==='claim.register'&&(x.payload.source as R)?.publication_id===pub)){
   const key=String(e.payload.claim_key);
   if(outbox.some(x=>(x.kind==='claim.retract'||x.kind==='claim.register')&&x.payload.claim_key===key&&x.payload.claim_seq===2))continue;
   enqueue('claim.retract',{claim_key:key,claim_seq:2,reason,source:{report_id:(e.payload.source as R).report_id,publication_id:pub}});
  }
 };
 /** Writes a report row, then the after-update retract rule of the SQL trigger. */
 const setReport=(r:ReportRow,patch:Partial<ReportRow>)=>{
  const old={...r};Object.assign(r,patch,{updated_at:stamp()});
  if(old.status==='published'&&old.current_publication_id){
   if(r.status!=='published')retract(old.current_publication_id,r.status==='withdrawn'?'withdraw':'unpublish');
   else if(old.disclosure_ok&&!r.disclosure_ok)retract(old.current_publication_id,'disclosure_ok');
   else if(old.evidence_ok&&!r.evidence_ok)retract(old.current_publication_id,'evidence_ok');
  }
 };
 const draftTexts=(rep:string,reason:string,which:'both'|'snippets'='both')=>{
  for(const s of snippets.values())if(s.report_id===rep&&s.status==='approved')Object.assign(s,{status:'draft',approved_by:null,approved_at:null,draft_reason:reason});
  if(which==='both')for(const s of summaries.values())if(s.report_id===rep&&s.status==='approved')Object.assign(s,{status:'draft',approved_by:null,approved_at:null,draft_reason:reason});
 };
 const lockDraft=(rep:string)=>{const r=reports.get(rep)??fail('report_not_found');if(r.status==='published')fail('published_immutable');if(r.status==='withdrawn')fail('report_withdrawn');return r;};

 // ---------------------------------------------------------------- materialize (§6.3; mirrors SQL)
 type Pick={f:FieldRow;isEff:boolean;v:TypedValue};
 const picks=(rep:string):Pick[]=>{
  const effKeys=new Set(effOf(rep).map(idKey));
  const cand=liveCand(rep).filter(f=>!effKeys.has(idKey(f)));
  const n=new Map<string,number>();for(const c of cand)n.set(idKey(c),(n.get(idKey(c))??0)+1);
  return [...effOf(rep).map(f=>({f,isEff:true,v:effectiveValue(f)})),...cand.filter(c=>n.get(idKey(c))===1).map(f=>({f,isEff:false,v:effectiveValue({...f,corrected:null})}))];
 };
 const firstBy=(ps:Pick[])=>{const m=new Map<string,Pick>();for(const p of [...ps].sort((a,b)=>Number(b.isEff)-Number(a.isEff)||a.f.occurrence-b.f.occurrence))if(!m.has(p.f.field))m.set(p.f.field,p);return m;};
 const effRowsJson=(rep:string)=>effOf(rep).map(f=>({field_id:f.field_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,status:f.status,extractor:f.extractor,parse_run_id:f.parse_run_id,run_id:f.run_id,page:f.page,char_start:f.char_start,char_end:f.char_end,value:effectiveValue(f)}));
 const liveDigests=(rep:string)=>{
  const r=reports.get(rep)!;const d=docOf(r);const l=licOf(r);
  const eff=effRowsJson(rep);const effHash=sha256Hex(canonicalJson(eff));
  const art=d.current_parse_run_id?runs.get(d.current_parse_run_id)?.artifact_hash??'':'';
  const ts=(targets.get(rep)??[]).map(t=>{const {input_hash:_h,...rest}=t;void _h;return rest;});
  const rules={rules_version:RULES_VERSION,effective:eff,targets:ts,
   overrides:[...overrides.values()].filter(o=>o.report_id===rep).sort((a,b)=>cmp(a.target_key,b.target_key)).map(o=>({override_id:o.override_id,target_key:o.target_key,security_ticker:o.security_ticker,issuer_id:o.issuer_id})),
   scales:[...new Set(ts.map(t=>t.scale_id).filter((x):x is string=>!!x))].sort().map(id=>scales.get(id)),
   institution_id:r.institution_id,scope:r.scope,published_date:r.published_date,uploaded_at:d.uploaded_at,supersedes_report_id:r.supersedes_report_id,
   titles:{title_original:r.title_original,title_public:r.title_public,title_zh:r.title_zh,title_en:r.title_en},
   disclosure:{licence_version:l.version,allows_public_target_price:l.allows_public_target_price,
    analysts:bindings.filter(b=>b.report_id===rep).sort((a,b)=>cmp(a.analyst_id,b.analyst_id)).map(b=>{const a=analysts.get(b.analyst_id)!;return {analyst_id:a.analyst_id,public_display:a.public_display,display_name:a.display_name,name_variants:a.name_variants};})}};
  return {effective_hash:effHash,rules_input_hash:sha256Hex(canonicalJson(rules)),summary_input_digest:sha256Hex(`${effHash}|${art}|${r.institution_id??''}|${r.title_public??''}`)};
 };
 const discHash=(rep:string)=>canonicalJson((targets.get(rep)??[]).map(t=>({k:t.target_key,tp:t.target_price,up:t.upside_pct})));
 const materializeNow=(rep:string):MaterializeReceipt=>{
  const r=lockDraft(rep);const oldDisc=discHash(rep);
  const all=picks(rep);
  const rl=firstBy(all.filter(p=>p.f.target_key===null&&p.f.status!=='absent'));
  const pub=rl.get('published_date')?.v.value_date??null;
  const keys=[...new Set(fieldsOf(rep).filter(f=>f.field==='ticker'&&(f.status==='confirmed'||f.status==='corrected'||(CAND.has(f.status)&&f.superseded_by_run_id===null))).map(f=>f.target_key!))].sort(cmp);
  const out:TargetRow[]=[];
  for(const tk of keys){
   const mine=all.filter(p=>p.f.target_key===tk);
   const e=(fld:string,absent?:boolean)=>mine.some(p=>p.isEff&&p.f.field===fld&&(absent===undefined||(p.f.status==='absent')===absent));
   const effBasis=e('ticker')&&e('rating')&&e('target_price')&&(e('target_price',true)||(e('target_currency')&&e('price_at_report')&&e('price_currency')&&e('price_as_of_date')));
   const chosen=firstBy(mine.filter(p=>p.isEff||!effBasis));
   const val=(fld:string,k:keyof TypedValue,noAbsent=false)=>{const p=chosen.get(fld);if(!p||(noAbsent&&p.f.status==='absent'))return null;return p.v[k] as string|null;};
   const tp=val('target_price','value_num',true),pr=val('price_at_report','value_num'),tc=val('target_currency','value_currency'),pc=val('price_currency','value_currency');
   const res=chosen.get('ticker')?.f.detail?.resolution as R|undefined;const resolution=res&&typeof res==='object'?res:undefined;
   const o=overrides.get(`${rep}|${tk}`);const row=(resolution?.issuer_securities_row??{}) as R;
   const rating=val('rating','value_text',true);
   const hits=rating!==null&&pub!==null?[...scales.values()].filter(s=>s.institution_id===r.institution_id&&s.raw_label.toLowerCase()===rating.toLowerCase()&&s.valid_from<=pub&&pub<(s.valid_to??'9999-12-31')):[];
   const scale=hits.length===1?hits[0]:null;
   const up=tp!==null&&pr!==null&&tc!==null&&tc===pc?upside1(tp,pr):null;
   const h=val('target_horizon','value_num',true);
   const inputs=[...chosen.values()].sort((a,b)=>cmp(a.f.field,b.f.field)).map(p=>({field_id:p.f.field_id,field:p.f.field,status:p.f.status,v:p.v}));
   out.push({report_id:rep,target_key:tk,basis:effBasis?'effective':'candidate',ticker_as_stated:val('ticker','value_text')??tk,
    security_ticker:o?o.security_ticker:(row.ticker as string|undefined)??null,issuer_id:o?o.issuer_id:(row.issuer_id as string|undefined)??null,
    resolution:{...(resolution??{}),...(o?{override_id:o.override_id}:{})},rating_raw:rating,rating_normalized:scale?.normalized??null,scale_id:scale?.scale_id??null,
    target_price:tp,target_currency:tc,target_horizon_months:h!==null&&Number(h)>0?Math.round(Number(h)):null,price_at_report:pr,price_currency:pc,
    price_as_of_date:val('price_as_of_date','value_date'),upside_pct:up,upside_formula_version:up===null?null:UPSIDE_FORMULA_VERSION,input_hash:sha256Hex(canonicalJson(inputs))});
  }
  targets.set(rep,out);
  const pads=[...new Set(out.map(t=>t.price_as_of_date))];
  const pad=r.primary_target_key!==null?out.find(t=>t.target_key===r.primary_target_key)?.price_as_of_date??null:pads.length===1?pads[0]:null;
  setReport(r,{title_original:rl.get('title')?.v.value_text??null,title_lang:(rl.get('title')?.f.detail?.lang as string|undefined)??r.title_lang,published_date:pub,sector_as_stated:rl.get('sector')?.v.value_text??null,price_as_of_date:pad});
  const dg=liveDigests(rep);
  setReport(r,{effective_hash:dg.effective_hash,materialized_hash:dg.effective_hash,rules_input_hash:dg.rules_input_hash,summary_input_digest:dg.summary_input_digest});
  for(const s of summaries.values())if(s.report_id===rep&&s.status==='approved'&&s.input_hash!==dg.summary_input_digest)Object.assign(s,{status:'draft',approved_by:null,approved_at:null,draft_reason:'summary_stale'});
  if(discHash(rep)!==oldDisc)draftTexts(rep,'disclosure_inputs','snippets');
  const nEff=out.filter(t=>t.basis==='effective').length;
  return {effectiveHash:dg.effective_hash,materializedHash:dg.effective_hash,targets:out.length,basis:nEff===out.length?'effective':nEff===0?'candidate':'mixed'};
 };
 /** All-or-nothing: snapshot every map a call may touch, restore on error (= one SQL transaction). */
 const atomic=<T>(fn:()=>T):T=>{
  const snap=[new Map([...fields].map(([k,v])=>[k,clone(v)])),new Map([...reports].map(([k,v])=>[k,clone(v)])),new Map([...targets].map(([k,v])=>[k,clone(v)])),new Map([...overrides]),new Map([...snippets].map(([k,v])=>[k,clone(v)])),new Map([...summaries].map(([k,v])=>[k,clone(v)])),new Map([...scales].map(([k,v])=>[k,clone(v)])),outbox.length] as const;
  try{return fn();}catch(e){
   const restore=<K,V>(m:Map<K,V>,s:Map<K,V>)=>{m.clear();for(const [k,v] of s)m.set(k,v);};
   restore(fields,snap[0]);restore(reports,snap[1]);restore(targets,snap[2]);restore(overrides,snap[3]);restore(snippets,snap[4]);restore(summaries,snap[5]);restore(scales,snap[6]);outbox.length=snap[7];
   throw e;
  }
 };
 const effectiveExists=(f:{report_id:string;target_key:string|null;field:string;occurrence:number},except?:string)=>fieldsOf(f.report_id).some(e=>e.field_id!==except&&EFF.has(e.status)&&idKey(e)===idKey(f));
 const rejectSiblings=(f:FieldRow,by:string)=>{for(const x of liveCand(f.report_id))if(x.field_id!==f.field_id&&idKey(x)===idKey(f))Object.assign(x,{status:'rejected',reviewed_by:by,reviewed_at:now()});};
 const newField=(row:Partial<FieldRow>&Pick<FieldRow,'report_id'|'field'|'value_text'|'extractor'|'status'>):FieldRow=>{
  const f:FieldRow={field_id:randomUUID(),parse_run_id:null,run_id:null,superseded_by_run_id:null,target_key:null,occurrence:1,value_num:null,value_currency:null,value_unit:null,value_date:null,page:null,char_start:null,char_end:null,value_source_text:null,extractor_confidence:null,corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:stamp(),...row};
  if(TARGET_FIELDS.has(f.field)!==(f.target_key!==null))fail('constraint_violation','broker_fields_target_key_level');
  if(f.status==='absent'&&!(f.extractor.startsWith('human:')&&['rating','target_price','analyst','target_horizon'].includes(f.field)&&f.page!==null&&f.parse_run_id!==null))fail('constraint_violation','broker_fields_absent_shape');
  if((f.status==='confirmed'||f.status==='corrected')&&(f.page===null||f.char_start===null||f.value_source_text===null||f.parse_run_id===null))fail('constraint_violation','broker_fields_confirmed_span');
  if(EFF.has(f.status)&&effectiveExists(f))fail('duplicate_key','broker_fields_effective_uniq');
  fields.set(f.field_id,f);return f;
 };

 // ---------------------------------------------------------------- blockers (§4.4; SQL order)
 const blockersOf=(rep:string):string[]=>{
  const r=reports.get(rep)??fail('report_not_found');const d=docOf(r);const l=licOf(r);const b:string[]=[];
  const tScope=r.scope==='single_issuer'||r.scope==='multi_issuer';const ts=targets.get(rep)??[];
  const eff=picks(rep).filter(p=>p.isEff);
  if(r.review_status!=='approved')b.push('review_not_approved');
  if(!licenceOk(l))b.push('licence_unconfirmed');
  if(!l.allows_public_metadata)b.push('licence_no_public_metadata');
  if(d.status!=='parsed'||d.promotion_pending)b.push('document_not_parsed');
  for(const c of ['scope','title_original','published_date','institution_id'] as const)if(r[c]===null)b.push(`report_incomplete:${c}`);
  const reqs:{tk:string|null;field:string;ord:number}[]=['institution','published_date','title'].map(field=>({tk:null,field,ord:1}));
  if(r.scope==='sector'||r.scope==='macro_strategy')reqs.push({tk:null,field:'sector',ord:1});
  if(tScope)for(const t of ts){
   for(const field of ['ticker','rating','target_price'])reqs.push({tk:t.target_key,field,ord:2});
   if(eff.some(p=>p.f.target_key===t.target_key&&p.f.field==='target_price'&&p.f.status!=='absent'))for(const field of ['target_currency','price_at_report','price_currency','price_as_of_date'])reqs.push({tk:t.target_key,field,ord:2});
  }
  const hasValue=(p:Pick,field:string)=>p.f.status==='absent'||({published_date:p.v.value_date,price_as_of_date:p.v.value_date,target_price:p.v.value_num,price_at_report:p.v.value_num,target_currency:p.v.value_currency,price_currency:p.v.value_currency} as R)[field]!==null;
  b.push(...reqs.filter(q=>!eff.some(p=>p.f.target_key===q.tk&&p.f.field===q.field&&hasValue(p,q.field)))
   .sort((x,y)=>x.ord-y.ord||cmp(x.tk??'',y.tk??'')||cmp(x.field,y.field)).map(q=>`required_field_missing:${q.field}${q.tk?`:${q.tk}`:''}`));
  const required=new Set(['institution','published_date','title',...(r.scope==='sector'||r.scope==='macro_strategy'?['sector']:[]),...(tScope?['ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date']:[])]);
  const effKeys=new Set(effOf(rep).map(idKey));
  b.push(...[...new Set(liveCand(rep).filter(f=>required.has(f.field)&&!effKeys.has(idKey(f))).map(f=>`field_pending:${f.field}`))].sort(cmp));
  if(tScope)b.push(...ts.filter(t=>t.issuer_id===null||t.basis!=='effective').map(t=>`target_unresolved:${t.target_key}`).sort(cmp));
  const ni=new Set(ts.map(t=>t.issuer_id).filter(x=>x!==null)).size;
  if((r.scope==='single_issuer'&&(ni!==1||ts.length<1))||(r.scope==='multi_issuer'&&ni<2)||((r.scope==='sector'||r.scope==='macro_strategy')&&ts.length!==0))b.push('target_cardinality');
  const q=(tables as unknown as {rows?:(t:string)=>Row[]}).rows?.('dq_quarantine')??[];
  b.push(...[...new Set(q.filter(x=>x.dataset==='broker_research'&&x.status==='open'&&String(x.natural_key).startsWith(`${d.sha256}:`)&&BLOCKING_Q.has(String(x.reason_code))).map(x=>`quarantine_open:${String(x.reason_code)}`))].sort(cmp));
  const live=liveDigests(rep);
  if(r.materialized_hash===null||r.materialized_hash!==live.effective_hash||r.effective_hash!==live.effective_hash||r.rules_input_hash!==live.rules_input_hash||r.summary_input_digest!==live.summary_input_digest)b.push('materialize_stale');
  const rr=receiptFor(r);
  if(!rr||rr.results.some(x=>x.passed===false&&x.blocking===true))b.push('rules_stale');
  const llm=effOf(rep).filter(f=>f.extractor.startsWith('llm:'));
  if(llm.length){
   const digests=[...new Set(llm.map(f=>runs.get(f.run_id??'')?.behavior_digest??''))];
   const covered=[...new Set(llm.filter(f=>f.status!=='absent').map(f=>f.field))];
   const ok=settings.approved_gold_corpus_hash!==null&&digests.every(dg=>{const e=latestEval(dg);return !!e&&e.passed&&e.corpus_kind==='gold'&&e.corpus_hash===settings.approved_gold_corpus_hash&&e.n_docs>=30&&covered.every(fl=>((e.per_field[fl]?.tp??0)+(e.per_field[fl]?.fn??0))>0);});
   if(!ok)b.push('eval_receipt_missing');
  }
  if([...summaries.values()].some(s=>s.report_id===rep&&s.status==='approved'&&s.input_hash!==r.summary_input_digest))b.push('summary_stale');
  for(const surface of ['title_original','title_public','title_zh','title_en'] as const){
   if(r[surface]===null)continue;
   const res=rr?.results.find(x=>x.rule==='disclosure'&&x.detail?.surface===surface);
   if(!res||res.passed!==true)if(surface!=='title_original'||r.title_public===null)b.push(`restricted_value_in_text:${surface}`);
  }
  b.push(...[...snippets.values()].filter(s=>s.report_id===rep&&s.status==='approved'&&s.disclosure_check?.passed!==true).map(s=>`restricted_value_in_text:snippet:${s.snippet_id}`).sort(cmp));
  b.push(...[...summaries.values()].filter(s=>s.report_id===rep&&s.status==='approved'&&s.disclosure_check?.passed!==true).map(s=>`restricted_value_in_text:summary:${s.lang}`).sort(cmp));
  if(!r.evidence_ok)b.push('evidence_drift');
  if(!r.disclosure_ok)b.push('disclosure_stale');
  const groups=new Map<string,FieldRow[]>();for(const f of liveCand(rep))groups.set(idKey(f),[...(groups.get(idKey(f))??[]),f]);
  b.push(...[...groups.entries()].filter(([k,g])=>g.length>=2&&!effKeys.has(k)).map(([,g])=>g[0]).sort((x,y)=>cmp(x.field,y.field)||cmp(x.target_key??'',y.target_key??'')).map(f=>`conflict_unresolved:${f.field}${f.target_key?`:${f.target_key}`:''}`));
  return b;
 };
 const receiptFor=(r:ReportRow)=>[...ruleReceipts].reverse().find(x=>x.report_id===r.report_id&&x.input_hash===r.rules_input_hash&&x.rules_version===RULES_VERSION)??null;
 const latestEval=(digest:string)=>[...evals].reverse().find(e=>e.behavior_digest===digest)??null;

 // ---------------------------------------------------------------- approval checks (§4.7)
 const snippetGate=(s:Snip)=>{
  if(s.status!=='approved')return;
  const n=licOf(reports.get(s.report_id)!).snippet_max_chars;
  if(s.text===null||s.text.length>n)fail('snippet_too_long',String(s.text?.length??0));
  if(s.disclosure_check?.passed!==true||s.disclosure_check.version!==DISCLOSURE_VERSION)fail('disclosure_failed');
  if(!s.approved_by)fail('approver_required');
 };
 const summaryGate=(s:Summ)=>{
  if(s.status!=='approved')return;
  const r=reports.get(s.report_id)!;const n=licOf(r).snippet_max_chars;
  if(s.max_verbatim_overlap>n)fail('summary_overlap',String(s.max_verbatim_overlap));
  if(s.numeric_grounding?.passed!==true)fail('summary_ungrounded');
  if(s.disclosure_check?.passed!==true||s.disclosure_check.version!==DISCLOSURE_VERSION)fail('disclosure_failed');
  if(s.input_hash!==r.summary_input_digest)fail('summary_stale');
  if(!s.approved_by)fail('approver_required');
  if([...summaries.values()].some(x=>x.summary_id!==s.summary_id&&x.report_id===s.report_id&&x.lang===s.lang&&x.status==='approved'))fail('duplicate_key','broker_summaries_approved_uniq');
 };
 const childWritable=(rep:string)=>{const r=reports.get(rep);if(r?.status==='published')fail('published_immutable',`child`);};

 // ---------------------------------------------------------------- documents and the withdraw cascade
 const moveDocument=(d:DocumentRow,to:DocumentStatus,patch:Partial<DocumentRow>={})=>{
  const from=d.status;
  if(to!==from){
   if(from==='withdrawn'){if(!(to==='uploaded'&&d.withdrawn_reason==='promotion_lost'&&d.purged_at===null))fail('document_transition_invalid',`${from}->${to}`);}
   else if(to!=='withdrawn'&&!DOC_MOVES.has(`${from}>${to}`))fail('document_transition_invalid',`${from}->${to}`);
  }
  const next={...d,...patch,status:to};
  if(next.status==='parsed'&&next.current_parse_run_id===null)fail('document_parse_run_required');
  if(next.promotion_pending&&!d.promotion_pending)fail('document_promotion_pending_only_clears');
  Object.assign(d,next);
  if(to==='withdrawn'&&from!=='withdrawn'){
   const r=[...reports.values()].find(x=>x.document_id===d.document_id&&x.status!=='withdrawn');
   if(r){
    if(r.current_publication_id){const p=publications.get(r.current_publication_id)!;if(p.unpublished_at===null)Object.assign(p,{unpublished_at:now(),unpublish_reason:`withdrawn:${d.withdrawn_reason}`});}
    setReport(r,{status:'withdrawn'});
   }
  }
 };

 // ---------------------------------------------------------------- public views (§4.11)
 const visible=()=>[...reports.values()].filter(r=>{
  if(!settings.public_enabled||r.status!=='published'||!r.evidence_ok||!r.disclosure_ok)return false;
  const d=docOf(r),l=licOf(r),p=r.current_publication_id?publications.get(r.current_publication_id):undefined;
  return d.status!=='withdrawn'&&licenceOk(l)&&l.allows_public_metadata&&!!p&&p.licence_version===l.version;
 });
 const reportView=(r:ReportRow):R=>{const d=docOf(r),l=licOf(r),p=publications.get(r.current_publication_id!)!;
  return {report_id:r.report_id,revision:r.revision,publication_id:r.current_publication_id,scope:r.scope,institution_id:r.institution_id,title:r.title_public??r.title_original,title_is_rewritten:r.title_public!==null,
   title_zh:r.title_zh,title_en:r.title_en,title_is_translation:r.title_run_id!==null,published_date:r.published_date,price_as_of_date:r.price_as_of_date,report_type:r.report_type,sector_as_stated:r.sector_as_stated,
   primary_target_key:r.primary_target_key,available_at:d.uploaded_at,code_version:r.code_version,published_at:p.published_at,supersedes_report_id:r.supersedes_report_id,page_count:d.page_count,
   snippet_max_chars:l.snippet_max_chars,target_price_public:l.allows_public_target_price,summary_public:l.allows_public_summary,snippets_public:l.allows_public_snippets};};
 const targetView=(r:ReportRow)=>{const tpOk=licOf(r).allows_public_target_price;return (targets.get(r.report_id)??[]).map(t=>({report_id:t.report_id,publication_id:r.current_publication_id,target_key:t.target_key,ticker_as_stated:t.ticker_as_stated,security_ticker:t.security_ticker,issuer_id:t.issuer_id,
  rating_raw:t.rating_raw,rating_normalized:t.rating_normalized,scale_id:t.scale_id,target_price:tpOk?t.target_price:null,target_currency:tpOk?t.target_currency:null,target_horizon_months:tpOk?t.target_horizon_months:null,
  upside_pct:tpOk?t.upside_pct:null,target_price_public:tpOk,price_at_report:t.price_at_report,price_currency:t.price_currency,price_as_of_date:t.price_as_of_date,upside_formula_version:tpOk?t.upside_formula_version:null}) as R);};
 const citationView=(r:ReportRow)=>{const tpOk=licOf(r).allows_public_target_price;
  return effOf(r.report_id).filter(f=>!(['target_price','target_currency','target_horizon','upside_stated'].includes(f.field)&&!tpOk)&&(f.field!=='analyst'||bindings.some(b=>b.field_id===f.field_id&&analysts.get(b.analyst_id)?.public_display))&&!(f.field==='title'&&r.title_restricted))
   .map(f=>({report_id:f.report_id,field_id:f.field_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,page:f.page,...effectiveValue(f),status:f.status,extractor_kind:f.extractor.split(':')[0]}) as R);};
 const snippetView=(r:ReportRow)=>{const l=licOf(r);return [...snippets.values()].filter(s=>s.report_id===r.report_id&&s.status==='approved'&&l.allows_public_snippets&&(s.text??'').length<=l.snippet_max_chars).map(s=>({snippet_id:s.snippet_id,report_id:s.report_id,target_key:s.target_key,purpose:s.purpose,page:s.page,text:s.text,field_id:s.field_id}) as R);};
 const summaryView=(r:ReportRow)=>licOf(r).allows_public_summary?[...summaries.values()].filter(s=>s.report_id===r.report_id&&s.status==='approved').map(s=>{const ru=runs.get(s.run_id);return {summary_id:s.summary_id,report_id:s.report_id,lang:s.lang,kind:s.kind,model_id:ru?.model_id??null,registry_hash:ru?.registry_hash??null,prompt_version:ru?.prompt_version??null,input_hash:s.input_hash,summary_md:s.summary_md,generated_at:s.generated_at} as R;}):[];
 const analystView=(r:ReportRow)=>bindings.filter(b=>b.report_id===r.report_id&&analysts.get(b.analyst_id)?.public_display).map(b=>{const a=analysts.get(b.analyst_id)!;return {report_id:b.report_id,analyst_id:b.analyst_id,display_name:a.display_name,institution_id:a.institution_id,role:b.role} as R;});
 const institutionView=()=>{const vis=new Set(visible().map(r=>r.institution_id));return [...institutions.values()].filter(i=>settings.public_enabled&&vis.has(i.institution_id)).map(i=>({institution_id:i.institution_id,name_en:i.name_en,name_zh:i.name_zh,aliases:i.aliases,kind:i.kind,rating_disclosure_url:i.rating_disclosure_url}) as R);};
 const historyView=()=>{
  const vis=visible();const superseded=new Set(vis.map(r=>r.supersedes_report_id).filter(Boolean));
  const rows=vis.filter(r=>!superseded.has(r.report_id)).flatMap(r=>targetView(r).map(t=>({t,r:reportView(r)})));
  const part=(x:{t:R;r:R})=>`${x.r.institution_id}|${x.t.security_ticker}|${x.t.target_currency}`;
  rows.sort((a,b)=>cmp(part(a),part(b))||cmp(String(a.r.published_date),String(b.r.published_date))||cmp(String(a.t.report_id),String(b.t.report_id)));
  return rows.map((x,i)=>{const p=i>0&&part(rows[i-1])===part(x)?rows[i-1]:null;
   return {report_id:x.t.report_id,prev_report_id:p?.t.report_id??null,target_key:x.t.target_key,institution_id:x.r.institution_id,security_ticker:x.t.security_ticker,issuer_id:x.t.issuer_id,published_date:x.r.published_date,prev_published_date:p?.r.published_date??null,
    rating_normalized:x.t.rating_normalized,prev_rating_normalized:p?.t.rating_normalized??null,scale_id:x.t.scale_id,prev_scale_id:p?.t.scale_id??null,target_price:x.t.target_price,prev_target_price:p?.t.target_price??null,target_currency:x.t.target_currency,
    upside_formula_version:x.t.upside_formula_version,prev_upside_formula_version:p?.t.upside_formula_version??null,code_version:x.r.code_version,prev_code_version:p?.r.code_version??null,available_at:x.r.available_at,prev_available_at:p?.r.available_at??null} as R;});
 };

 const db:MemoryBrokerResearchDb={
  tables,
  setNow(iso){fixedNow=iso;},
  expireLease(id){const d=req(documents,id,'document');if(d.lease_token)d.lease_until=new Date(Date.parse(now())-1000).toISOString();},
  setGoldCorpusHash(hash){settings.approved_gold_corpus_hash=hash;},
  outbox:()=>clone(outbox),
  draftReason:(kind,id)=>(kind==='snippet'?snippets.get(id):summaries.get(id))?.draft_reason??null,
  async getSettings(){return clone(settings);},
  async setPublicEnabled(flag,by){Object.assign(settings,{public_enabled:flag,updated_by:by,updated_at:now()});},
  async listLicences(){return clone([...licences.values()].sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.licence_id,b.licence_id)));},
  async getLicence(id){return clone(licences.get(id)??null);},
  async insertLicence(input){
   if(!(input.snippet_max_chars>0&&input.snippet_max_chars<=500))fail('constraint_violation','broker_licences_snippet_max');
   const t=stamp();const l:LicenceRow={licence_id:randomUUID(),version:1,...input,confirmed_by:null,confirmed_at:null,confirmed_version:null,created_at:t,updated_at:t};
   licences.set(l.licence_id,l);return clone(l);
  },
  async updateLicence(id,patch){
   const l=licences.get(id)??fail('not_found','licence');
   if(patch.snippet_max_chars!==undefined&&!(patch.snippet_max_chars>0&&patch.snippet_max_chars<=500))fail('constraint_violation','broker_licences_snippet_max');
   const material=MATERIAL.some(k=>k in patch&&!same(patch[k],l[k]));
   Object.assign(l,Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined)),{updated_at:now()});
   if(material){
    Object.assign(l,{version:l.version+1,confirmed_by:null,confirmed_at:null,confirmed_version:null});
    for(const r of reports.values())if(docOf(r).licence_id===id){draftTexts(r.report_id,'licence_version');if(r.status!=='withdrawn'&&r.disclosure_ok)setReport(r,{disclosure_ok:false});}
    enqueue('licence.changed',{licence_id:id,version:l.version,previous_version:l.version-1});
   }
   return clone(l);
  },
  async confirmLicence(id,by,version){const l=licences.get(id)??fail('not_found','licence');if(l.version!==version)return 'version_mismatch';Object.assign(l,{confirmed_by:by,confirmed_at:now(),confirmed_version:version,updated_at:now()});return 'confirmed';},
  async insertIntent(row){if(intents.has(row.intent_id))fail('duplicate_key');if(row.staging_path!==`staging/${row.intent_id}.pdf`)fail('constraint_violation','broker_intents_staging_path');intents.set(row.intent_id,{...clone(row),created_at:stamp(),checkpoint_at:null,error_code:null});},
  async getIntent(id){return clone(intents.get(id)??null);},
  async transitionIntent(id,from,to,patch){
   const i=intents.get(id);if(!i||i.status!==from)return false;
   if(to!==from&&!INTENT_MOVES.has(`${from}>${to}`))fail('intent_transition_invalid',`${from}->${to}`);
   if(patch?.document_id!==undefined&&i.document_id!==null&&patch.document_id!==i.document_id)fail('intent_document_set_once');
   const next={...i,...patch,status:to as IntentStatus};
   if(next.status==='committed'&&next.document_id===null)fail('constraint_violation','broker_intents_committed_document');
   Object.assign(i,next,to!==from?{checkpoint_at:now()}:{});return true;
  },
  async findDocumentBySha(sha){return clone([...documents.values()].find(d=>d.sha256===sha)??null);},
  async getDocument(id){return clone(documents.get(id)??null);},
  async insertDocument(row){
   if([...documents.values()].some(d=>d.sha256===row.sha256||d.document_id===row.document_id))return 'duplicate';
   if(row.storage_path!==`reports/${row.sha256}.pdf`)fail('constraint_violation','broker_documents_storage_path');
   documents.set(row.document_id,{...row,page_count:null,uploaded_at:stamp(),current_parse_run_id:null,status:'uploaded',lease_token:null,lease_until:null,promotion_pending:true,last_verified_at:null,verify_status:null,withdrawn_at:null,withdrawn_reason:null,purged_at:null});
   return 'inserted';
  },
  async updateDocument(id,patch){const d=req(documents,id,'document');const {status,...rest}=patch;moveDocument(d,status??d.status,rest);},
  async claimLease(id,token,ttl){
   if(!token||!(ttl>=1))fail('invalid_lease_args');
   const d=req(documents,id,'document');
   if(d.lease_until!==null&&d.lease_until>=now())return false;
   if(d.lease_token!==null)for(const r of runs.values())if(r.document_id===id&&r.status==='running'&&r.kind!=='verify')Object.assign(r,{status:'failed',finished_at:now(),detail:{...r.detail,error_code:'lease_expired'}});
   Object.assign(d,{lease_token:token,lease_until:plusSec(ttl)});return true;
  },
  async fencedUpdateDocument(id,token,patch){
   const d=req(documents,id,'document');if(d.lease_token!==token)return 'lease_lost';
   const {releaseLease,status,...rest}=patch;
   moveDocument(d,status??d.status,Object.fromEntries(Object.entries(rest).filter(([,v])=>v!==undefined)));
   if(releaseLease)Object.assign(d,{lease_token:null,lease_until:null});
   return 'ok';
  },
  async insertRun(row){
   if(runs.has(row.run_id))fail('duplicate_key');
   if(row.kind==='parse'&&!row.extractor_version)fail('constraint_violation','broker_runs_parse_extractor');
   if(['extract','summary','translate'].includes(row.kind)&&!row.parse_run_id)fail('constraint_violation','broker_runs_parse_link');
   if(['extract','summary','translate'].includes(row.kind)&&!(row.model_id&&row.registry_hash&&row.prompt_version))fail('constraint_violation','broker_runs_llm_lineage');
   if(row.kind==='extract'&&!(row.schema_version&&row.behavior_digest))fail('constraint_violation','broker_runs_extract_lineage');
   runs.set(row.run_id,{...clone(row),detail:clone(row.detail??{}),status:'running',started_at:stamp(),finished_at:null});runSeq.set(row.run_id,runSeq.size);
  },
  async finishRun(id,token,patch){
   const r=runs.get(id)??fail('run_not_found');
   if(!(r.kind==='verify'&&token===null)){
    const d=documents.get(r.document_id)!;
    if(d.lease_token!==token){if(r.status==='running')Object.assign(r,{status:'failed',finished_at:now(),detail:{...r.detail,...(patch.detail??{}),error_code:'lease_lost',lease_lost:true}});return 'lease_lost';}
   }
   if(r.status!=='running')fail('run_finished');
   if(patch.status!=='succeeded'&&patch.status!=='failed')fail('invalid_patch');
   const next={...r,...Object.fromEntries(Object.entries(patch).filter(([k,v])=>v!==undefined&&k!=='detail')),detail:{...r.detail,...(patch.detail??{})},finished_at:now()} as RunRow;
   if(next.kind==='parse'&&next.status==='succeeded'&&!(next.artifact_path&&next.artifact_hash))fail('constraint_violation','broker_runs_parse_artifact');
   Object.assign(r,next);return 'ok';
  },
  async getRun(id){return clone(runs.get(id)??null);},
  async listRuns(documentId){return clone([...runs.values()].filter(r=>r.document_id===documentId).sort((a,b)=>cmp(a.started_at,b.started_at)||cmp(a.run_id,b.run_id)));},
  async ensureReport(documentId,codeVersion){
   const have=[...reports.values()].find(r=>r.document_id===documentId);if(have)return clone(have);
   req(documents,documentId,'document');const t=stamp();
   const r:ReportRow={report_id:randomUUID(),document_id:documentId,revision:1,scope:null,institution_id:null,title_original:null,title_lang:null,title_zh:null,title_en:null,title_run_id:null,title_public:null,title_public_by:null,
    published_date:null,price_as_of_date:null,report_type:null,sector_as_stated:null,primary_target_key:null,effective_hash:null,materialized_hash:null,rules_input_hash:null,summary_input_digest:null,
    title_restricted:false,evidence_ok:true,disclosure_ok:true,review_status:'pending',status:'draft',current_publication_id:null,supersedes_report_id:null,code_version:codeVersion,created_at:t,updated_at:t};
   reports.set(r.report_id,r);return clone(r);
  },
  async getReport(id){return clone(reports.get(id)??null);},
  async reportByDocument(id){return clone([...reports.values()].find(r=>r.document_id===id)??null);},
  async updateReportDraft(id,patch){
   const r=reports.get(id)??fail('report_not_found');
   if(r.status==='withdrawn')fail('report_withdrawn');
   const p=Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined)) as Partial<ReportRow>;
   if(r.status==='published'&&Object.entries(p).some(([k,v])=>!['evidence_ok','disclosure_ok','supersedes_report_id'].includes(k)&&!same((r as unknown as R)[k],v)))fail('published_immutable');
   if(p.title_public!==undefined&&p.title_public!==null&&!(p.title_public_by??r.title_public_by))fail('constraint_violation','broker_reports_title_public_by');
   setReport(r,p);
  },
  async extractCommit(documentId,token,runId,rows){return atomic(()=>{
   if(!Array.isArray(rows))fail('invalid_rows');
   if(rows.some(x=>x.status!=='extracted'&&x.status!=='unverified'))fail('invalid_rows','status');
   const d=documents.get(documentId)??fail('document_not_found');
   if(d.lease_token!==token||d.lease_until===null||d.lease_until<=now())fail('lease_lost');
   const run=runs.get(runId);if(!run||run.document_id!==documentId||run.kind!=='extract'||run.status!=='running')fail('run_invalid');
   const r=[...reports.values()].find(x=>x.document_id===documentId)??fail('report_not_found');lockDraft(r.report_id);
   for(const f of liveCand(r.report_id))if(f.run_id!==runId)f.superseded_by_run_id=runId;
   const t=stamp();
   for(const x of rows as CandidateFieldInput[]){const {resolution,...rest}=x;newField({...clone(rest),report_id:r.report_id,parse_run_id:run!.parse_run_id,run_id:runId,created_at:t,detail:{...(rest.detail??{}),...(resolution&&typeof resolution==='object'?{resolution:clone(resolution)}:{})}});}
   return materializeNow(r.report_id);
  });},
  async fieldReview(fieldId,action,payload,by){return atomic(()=>{
   if(!['confirm','correct','reject','absent'].includes(action))fail('invalid_action',String(action));
   const f0=fields.get(fieldId)??fail('field_not_found');lockDraft(f0.report_id);const f=f0;const p=payload??{};
   if((action==='confirm'||action==='correct')&&effectiveExists(f,f.field_id))fail('effective_exists');
   if(action==='confirm'){
    if(!['extracted','unverified','corrected'].includes(f.status))fail('field_not_reviewable',f.status);
    if(f.char_start===null)fail('span_required');
    Object.assign(f,{status:'confirmed',corrected:null,reviewed_by:by,reviewed_at:now()});
   }else if(action==='correct'){
    if(!['extracted','unverified','confirmed','corrected'].includes(f.status))fail('field_not_reviewable',f.status);
    const corr=Object.fromEntries(Object.entries(p).filter(([k])=>!['page','char_start','char_end','value_source_text'].includes(k)));
    if(Object.keys(corr).some(k=>!['value_text','value_num','value_currency','value_unit','value_date'].includes(k))||typeof corr.value_text!=='string')fail('invalid_payload','corrected');
    if(corr.value_num!=null&&!/^-?[0-9]+(\.[0-9]+)?$/.test(String(corr.value_num)))fail('invalid_payload','value_num');
    if(corr.value_date!=null){const s=String(corr.value_date);const dt=new Date(`${s}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==s)fail('invalid_payload','value_date');}
    if(['page','char_start','char_end','value_source_text'].some(k=>k in p)){
     if(!('page' in p&&'char_start' in p&&'char_end' in p&&typeof p.value_source_text==='string'))fail('invalid_payload','span');
     Object.assign(f,{page:Number(p.page),char_start:Number(p.char_start),char_end:Number(p.char_end),value_source_text:p.value_source_text});
    }else if(f.char_start===null)fail('span_required');
    Object.assign(f,{status:'corrected',corrected:corr,reviewed_by:by,reviewed_at:now()});
   }else if(action==='reject'){
    if(f.status==='rejected')fail('field_not_reviewable','rejected');
    Object.assign(f,{status:'rejected',reviewed_by:by,reviewed_at:now()});
   }else{
    if(!['rating','target_price','analyst','target_horizon'].includes(f.field))fail('absent_not_allowed',f.field);
    if(f.status==='absent')fail('field_not_reviewable','absent');
    const page=p.page!==undefined?Number(p.page):f.page;if(page===null||!(page>=1))fail('invalid_payload','page');
    if(effectiveExists(f,f.field_id))fail('effective_exists');
    if(f.status!=='rejected')Object.assign(f,{status:'rejected',reviewed_by:by,reviewed_at:now()});
    newField({report_id:f.report_id,parse_run_id:f.parse_run_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,value_text:'ABSENT',page,extractor:`human:${by}`,status:'absent',reviewed_by:by,reviewed_at:now(),detail:{replaces:f.field_id}});
   }
   if(action!=='reject')rejectSiblings(f,by);
   return materializeNow(f.report_id);
  });},
  async insertHumanField(reportId,row,by){return atomic(()=>{
   const r=lockDraft(reportId);
   if(row.status!=='confirmed'&&row.status!=='absent')fail('invalid_payload','status');
   const pr=runs.get(row.parse_run_id);if(!pr||pr.document_id!==r.document_id||pr.kind!=='parse'||pr.status!=='succeeded')fail('invalid_payload','parse_run_id');
   if(effectiveExists({report_id:reportId,target_key:row.target_key,field:row.field,occurrence:row.occurrence??1}))fail('effective_exists');
   const absent=row.status==='absent';
   const f=newField({report_id:reportId,parse_run_id:row.parse_run_id,target_key:row.target_key,field:row.field,occurrence:row.occurrence??1,value_text:absent?'ABSENT':row.value_text,value_num:absent?null:row.value_num,value_currency:absent?null:row.value_currency,value_unit:absent?null:row.value_unit,value_date:absent?null:row.value_date,
    page:row.page,char_start:absent?null:row.char_start,char_end:absent?null:row.char_end,value_source_text:absent?null:row.value_source_text,extractor:`human:${by}`,status:row.status,reviewed_by:by,reviewed_at:now()});
   return {fieldId:f.field_id,receipt:materializeNow(reportId)};
  });},
  async upsertTargetOverride(row){return atomic(()=>{
   lockDraft(row.report_id);const k=`${row.report_id}|${row.target_key}`;const had=overrides.get(k);
   overrides.set(k,{override_id:had?.override_id??randomUUID(),report_id:row.report_id,target_key:row.target_key,security_ticker:row.security_ticker,issuer_id:row.issuer_id,set_by:row.set_by,set_at:now(),note:row.note});
   return materializeNow(row.report_id);
  });},
  async materialize(id){return atomic(()=>materializeNow(id));},
  async listFields(reportId,opts){return clone(fieldsOf(reportId).filter(f=>opts?.includeSuperseded||f.superseded_by_run_id===null)
   .sort((a,b)=>(a.target_key===null?0:1)-(b.target_key===null?0:1)||cmp(a.target_key??'',b.target_key??'')||cmp(a.field,b.field)||a.occurrence-b.occurrence||cmp(a.created_at,b.created_at)||cmp(a.field_id,b.field_id)));},
  async listTargets(reportId){return clone(targets.get(reportId)??[]);},
  async bindAnalyst(row){
   childWritable(row.report_id);
   const f=fields.get(row.field_id);if(!f||f.report_id!==row.report_id||f.field!=='analyst')fail('analyst_field_mismatch');
   const i=bindings.findIndex(b=>b.report_id===row.report_id&&b.analyst_id===row.analyst_id);
   if(i>=0)bindings[i]={...row};else bindings.push({...row});
  },
  async insertRuleReceipt(row){const x:RuleReceiptRow={...clone(row),receipt_id:randomUUID(),created_at:stamp()};ruleReceipts.push(x);return x.receipt_id;},
  async insertSnippet(row){
   childWritable(row.report_id);
   if(row.text!==null&&row.text.length>500)fail('constraint_violation','broker_snippets_text_length');
   const s:Snip={...clone(row),snippet_id:randomUUID(),status:'draft',approved_by:null,approved_at:null,created_at:stamp(),draft_reason:null};
   if(s.text===null)fail('constraint_violation','broker_snippets_text_required');
   snippets.set(s.snippet_id,s);return s.snippet_id;
  },
  async setSnippetStatus(id,patch){
   const s=snippets.get(id)??fail('not_found','snippet');const r=reports.get(s.report_id)!;
   const next:Snip={...s,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))};
   if(r.status==='published'&&!(next.status==='draft'||next.status==='rejected'))fail('published_immutable','broker_report_snippets');
   if(next.status==='approved'){snippetGate(next);if(s.status!=='approved')Object.assign(next,{approved_at:now(),draft_reason:null});}
   else if(s.status==='approved')Object.assign(next,{approved_by:null,approved_at:null});
   Object.assign(s,next);
  },
  async listSnippets(reportId){return clone([...snippets.values()].filter(s=>s.report_id===reportId).sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.snippet_id,b.snippet_id)));},
  async insertSummary(row){
   childWritable(row.report_id);
   const s:Summ={...clone(row),summary_id:randomUUID(),approved_by:null,approved_at:null,generated_at:stamp(),draft_reason:null};
   if(s.status==='approved')fail('approver_required');
   summaries.set(s.summary_id,s);return s.summary_id;
  },
  async setSummaryStatus(id,patch){
   const s=summaries.get(id)??fail('not_found','summary');const r=reports.get(s.report_id)!;
   const next:Summ={...s,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))};
   if(r.status==='published'&&!(next.status==='draft'||next.status==='rejected'))fail('published_immutable','broker_report_summaries');
   if(next.status==='approved'){summaryGate(next);if(s.status!=='approved')Object.assign(next,{approved_at:now(),draft_reason:null});}
   else if(s.status==='approved')Object.assign(next,{approved_by:null,approved_at:null});
   Object.assign(s,next);
  },
  async listSummaries(reportId){return clone([...summaries.values()].filter(s=>s.report_id===reportId).sort((a,b)=>cmp(a.generated_at,b.generated_at)||cmp(a.summary_id,b.summary_id)));},
  async publishBlockers(id){return blockersOf(id);},
  async publish(id,by){return atomic(()=>{
   const r=reports.get(id)??fail('report_not_found');if(r.status!=='draft')fail('report_not_draft');
   const b=blockersOf(id);if(b.length)fail('publish_blocked',b.join(','));
   const d=docOf(r),l=licOf(r);const rr=receiptFor(r)!;const pubId=randomUUID();const at=now();
   const titleRes=rr.results.find(x=>x.rule==='disclosure'&&x.detail?.surface==='title_original');const restricted=titleRes?.passed!==true;
   const usedEvals=[...new Set(effOf(id).filter(f=>f.extractor.startsWith('llm:')).map(f=>runs.get(f.run_id??'')?.behavior_digest??''))].map(latestEval).filter((e):e is EvalReceiptRow=>!!e).sort((a,c)=>cmp(c.ran_at,a.ran_at));
   const ts=targets.get(id)??[];
   const snapshot:R={publication_id:pubId,revision:r.revision,published_at:at,published_by:by,
    report:{...clone(r),status:'published',current_publication_id:pubId,title_restricted:restricted},
    document:{document_id:d.document_id,sha256:d.sha256,uploaded_at:d.uploaded_at,licence_id:d.licence_id,current_parse_run_id:d.current_parse_run_id,page_count:d.page_count},
    targets:clone(ts),fields:effRowsJson(id).map(x=>({...x,artifact_hash:x.parse_run_id?runs.get(x.parse_run_id)?.artifact_hash??null:null})),
    snippets:[...snippets.values()].filter(s=>s.report_id===id&&s.status==='approved').map(s=>({snippet_id:s.snippet_id,target_key:s.target_key,purpose:s.purpose,parse_run_id:s.parse_run_id,page:s.page,char_start:s.char_start,char_end:s.char_end,text:s.text,field_id:s.field_id,disclosure_check:s.disclosure_check})),
    summaries:[...summaries.values()].filter(s=>s.report_id===id&&s.status==='approved').map(s=>({summary_id:s.summary_id,lang:s.lang,run_id:s.run_id,input_hash:s.input_hash,summary_md:s.summary_md,max_verbatim_overlap:s.max_verbatim_overlap,numeric_grounding:s.numeric_grounding,disclosure_check:s.disclosure_check})),
    rating_scales:ts.map(t=>t.scale_id).filter((x):x is string=>!!x).map(x=>clone(scales.get(x))),
    overrides:[...overrides.values()].filter(o=>o.report_id===id).map(clone),
    analysts:bindings.filter(x=>x.report_id===id).map(x=>({analyst_id:x.analyst_id,role:x.role,field_id:x.field_id})),
    disclosure_inputs:{licence:{licence_id:l.licence_id,version:l.version,allows_public_metadata:l.allows_public_metadata,allows_public_snippets:l.allows_public_snippets,allows_public_summary:l.allows_public_summary,allows_public_target_price:l.allows_public_target_price,snippet_max_chars:l.snippet_max_chars},
     analysts:bindings.filter(x=>x.report_id===id).map(x=>{const a=analysts.get(x.analyst_id)!;return {analyst_id:a.analyst_id,public_display:a.public_display,display_name:a.display_name,name_variants:a.name_variants};})},
    rules_receipt:{receipt_id:rr.receipt_id,rules_version:rr.rules_version,input_hash:rr.input_hash,results:clone(rr.results)},
    eval_receipt_ids:usedEvals.map(e=>e.receipt_id),
    digests:{effective_hash:r.effective_hash,rules_input_hash:r.rules_input_hash,summary_input_digest:r.summary_input_digest}};
   const hash=sha256Hex(canonicalJson(snapshot));
   publications.set(pubId,{publication_id:pubId,report_id:id,revision:r.revision,snapshot,snapshot_hash:hash,licence_version:l.version,rules_receipt_id:rr.receipt_id,eval_receipt_id:usedEvals[0]?.receipt_id??null,published_at:at,published_by:by,unpublished_at:null,unpublish_reason:null});
   setReport(r,{status:'published',current_publication_id:pubId,title_restricted:restricted});
   for(const t of ts.filter(x=>x.target_price!==null)){
    enqueue('claim.register',{claim_key:`broker_target_price:${pubId}:${t.target_key}`,claim_seq:1,claim_type:'broker_target_price',methodology_version:CLAIM_METHODOLOGY_VERSION,
     subject:{security_ticker:t.security_ticker,issuer_id:t.issuer_id,market:marketOf(t.security_ticker),currency:t.target_currency},claimant:{kind:'institution',id:r.institution_id},
     claim:{direction:t.price_at_report===null?0:decimalCompare(t.target_price!,t.price_at_report),target_price:t.target_price,currency:t.target_currency,horizon_months:t.target_horizon_months,reference_price:t.price_at_report,reference_currency:t.price_currency,reference_date:t.price_as_of_date},
     stated_at:r.published_date,available_at:d.uploaded_at,
     source:{report_id:id,publication_id:pubId,snapshot_hash:hash,field_ids:effOf(id).filter(f=>f.target_key===t.target_key).map(f=>f.field_id).sort(cmp)},
     visibility_ref:{view:'broker_report_targets_public_v',report_id:id,target_key:t.target_key}});
   }
   return {publicationId:pubId};
  });},
  async unpublish(id,by,reason){
   if(!by)fail('invalid_publisher');if(!reason||!reason.trim())fail('reason_required');
   const r=reports.get(id)??fail('report_not_found');if(r.status!=='published')fail('report_not_published');
   const p=publications.get(r.current_publication_id!)!;Object.assign(p,{unpublished_at:now(),unpublish_reason:reason});
   setReport(r,{status:'draft',revision:r.revision+1,current_publication_id:null,review_status:'in_review'});
  },
  async getPublication(id){return clone(publications.get(id)??null);},
  async upsertInstitution(row){
   const id=row.institution_id??randomUUID();
   if([...institutions.values()].some(i=>i.institution_id!==id&&i.name_en.toLowerCase()===row.name_en.toLowerCase()))fail('duplicate_key','research_institutions_name_en_uniq');
   const had=institutions.get(id);institutions.set(id,{institution_id:id,name_en:row.name_en,name_zh:row.name_zh,aliases:[...row.aliases],kind:row.kind,rating_disclosure_url:row.rating_disclosure_url,created_at:had?.created_at??stamp()});return id;
  },
  async listInstitutions(){return clone([...institutions.values()].sort((a,b)=>cmp(a.name_en,b.name_en)||cmp(a.institution_id,b.institution_id)));},
  async insertRatingScale(row){
   if([...scales.values()].some(s=>s.institution_id===row.institution_id&&s.raw_label.toLowerCase()===row.raw_label.toLowerCase()&&s.valid_from===row.valid_from))fail('duplicate_key','research_rating_scales_label_uniq');
   const s:RatingScaleRow={...row,scale_id:randomUUID(),valid_to:null,created_at:stamp(),closed_by:null,closed_at:null};scales.set(s.scale_id,s);return s.scale_id;
  },
  async closeRatingScale(id,validTo,by){
   const s=scales.get(id)??fail('not_found','rating_scale');
   if(s.valid_to!==null)fail('scale_closed');if(!by)fail('scale_closed_by_required');if(!(validTo>s.valid_from))fail('constraint_violation','research_rating_scales_validity');
   Object.assign(s,{valid_to:validTo,closed_by:by,closed_at:now()});
  },
  async listRatingScales(inst){return clone([...scales.values()].filter(s=>s.institution_id===inst).sort((a,b)=>cmp(a.raw_label,b.raw_label)||cmp(a.valid_from,b.valid_from)||cmp(a.scale_id,b.scale_id)));},
  async upsertAnalyst(row){
   const id=row.analyst_id??randomUUID();const had=analysts.get(id);
   if(had&&had.institution_id!==row.institution_id)fail('analyst_immutable');
   analysts.set(id,{analyst_id:id,institution_id:row.institution_id,display_name:row.display_name,name_variants:[...row.name_variants],public_display:row.public_display,created_at:had?.created_at??stamp()});
   if(had&&!same([had.public_display,had.display_name,had.name_variants],[row.public_display,row.display_name,row.name_variants])){
    for(const rep of new Set(bindings.filter(b=>b.analyst_id===id).map(b=>b.report_id))){const r=reports.get(rep)!;if(r.status!=='withdrawn'&&r.disclosure_ok)setReport(r,{disclosure_ok:false});draftTexts(rep,'analyst_disclosure');}
   }
   return id;
  },
  async listAnalysts(inst){return clone([...analysts.values()].filter(a=>a.institution_id===inst).sort((a,b)=>cmp(a.display_name,b.display_name)||cmp(a.analyst_id,b.analyst_id)));},
  async reviewQueue(opts){const st=opts.status?[opts.status]:['pending','in_review'];return clone([...reports.values()].filter(r=>r.status==='draft'&&st.includes(r.review_status)).sort((a,b)=>cmp(a.updated_at,b.updated_at)||cmp(a.report_id,b.report_id)).slice(0,opts.limit??50));},
  async logAccess(row){access.push({...clone(row),id:randomUUID(),created_at:stamp()});},
  async listAccessLog(opts){return clone(access.filter(a=>!opts.documentId||a.document_id===opts.documentId).sort((a,b)=>cmp(b.created_at,a.created_at)||cmp(b.id,a.id)).slice(0,opts.limit));},
  async insertEvalReceipt(row){
   const pass=row.precision_min!==null&&row.recall_min!==null&&row.precision_min>=0.95&&row.recall_min>=0.95;
   if(row.passed!==pass)fail('constraint_violation','broker_eval_passed_rule');
   const e:EvalReceiptRow={...clone(row),receipt_id:randomUUID(),ran_at:stamp()};evals.push(e);return e.receipt_id;
  },
  async latestEvalReceipt(digest){return clone(latestEval(digest));},
  async takePendingOutbox(limit){return clone(outbox.filter(e=>e.status==='pending').sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.event_id,b.event_id)).slice(0,limit));},
  async markOutbox(id,outcome){
   const e=outbox.find(x=>x.event_id===id&&x.status==='pending')??fail('event_not_pending');
   e.attempts+=1;
   if(outcome.delivered)Object.assign(e,{status:'delivered',last_error:null,delivered_at:now()});
   else Object.assign(e,{status:e.attempts>=10?'failed':'pending',last_error:outcome.error,delivered_at:null});
  },
  async upsertPurgeStep(documentId,step,outcome){
   const k=`${documentId}|${step}`;const had=purge.get(k);
   purge.set(k,{document_id:documentId,step,status:outcome.ok?'done':'failed',attempts:(had?.attempts??0)+1,last_error:outcome.ok?null:outcome.error,at:now()});
  },
  async purgeSteps(documentId){return clone([...purge.values()].filter(p=>p.document_id===documentId).sort((a,b)=>cmp(a.step,b.step)));},
  async publicReports(filter){
   let vis=visible();
   if(filter.issuerId||filter.rating){const ok=new Set(vis.flatMap(r=>targetView(r)).filter(t=>(!filter.issuerId||t.issuer_id===filter.issuerId)&&(!filter.rating||t.rating_normalized===filter.rating)).map(t=>String(t.report_id)));vis=vis.filter(r=>ok.has(r.report_id));}
   const rows=vis.map(reportView).filter(r=>(!filter.institutionId||r.institution_id===filter.institutionId)&&(!filter.scope||r.scope===filter.scope)&&(!filter.from||String(r.published_date)>=filter.from)&&(!filter.to||String(r.published_date)<=filter.to)
    &&(!filter.cursor||String(r.published_date)<filter.cursor.publishedDate||(r.published_date===filter.cursor.publishedDate&&String(r.report_id)<filter.cursor.reportId)))
    .sort((a,b)=>cmp(String(b.published_date),String(a.published_date))||cmp(String(b.report_id),String(a.report_id))).slice(0,filter.limit);
   const page=new Set(rows.map(r=>String(r.report_id)));const vr=vis.filter(r=>page.has(r.report_id));
   return clone(bundles(rows,vr.flatMap(targetView),vr.flatMap(summaryView),vr.flatMap(snippetView),institutionView()));
  },
  async publicReport(id){
   const r=visible().find(x=>x.report_id===id);if(!r)return null;
   const [b]=bundles([reportView(r)],targetView(r),summaryView(r),snippetView(r),institutionView());
   return clone({...b,citations:citationView(r).sort((x,y)=>cmp(String(x.target_key??''),String(y.target_key??''))||cmp(String(x.field),String(y.field))||Number(x.occurrence)-Number(y.occurrence)),snippets:snippetView(r),summaries:summaryView(r).map(publicRow),analysts:analystView(r)});
  },
  async publicInstitutions(){return clone(institutionView().sort((a,b)=>cmp(String(a.name_en),String(b.name_en))));},
  async ratingHistory(opts){return clone(historyView().filter(h=>h.security_ticker===opts.securityTicker&&(!opts.institutionId||h.institution_id===opts.institutionId)&&(!opts.currency||h.target_currency===opts.currency))
   .sort((a,b)=>cmp(String(b.published_date),String(a.published_date))||cmp(String(b.report_id),String(a.report_id))).slice(0,opts.limit));},
  async quarantineResolve(id,status,by,payload){
   if(status!=='resolved_accept'&&status!=='resolved_reject')fail('invalid_status');
   const [q]=await tables.select('dq_quarantine',{id});if(!q)return 'not_found';
   if(q.dataset!=='broker_research')fail('wrong_dataset');if(q.status!=='open')return 'already_resolved';
   const sha=String(q.natural_key).split(':')[0];const d=[...documents.values()].find(x=>x.sha256===sha);
   const r=d?[...reports.values()].find(x=>x.document_id===d.document_id):undefined;
   if(r?.status==='published')fail('published_immutable');
   atomic(()=>{
    if(r&&r.status==='draft'){
     const reason=String(q.reason_code);
     if(status==='resolved_reject')setReport(r,{review_status:'rejected'});
     else if(reason==='unknown_rating_label'||reason==='ambiguous_rating_label'){
      let wrote=false;
      if('close_scale_id' in payload){if(!('valid_to' in payload))fail('hook_params_required');const s=scales.get(String(payload.close_scale_id));if(s&&s.institution_id===r.institution_id&&s.valid_to===null)Object.assign(s,{valid_to:String(payload.valid_to),closed_by:by,closed_at:now()});wrote=true;}
      if('normalized' in payload){
       const label=(payload.raw_label as string|undefined)??((q.payload as R)?.rating_raw as string|undefined);
       if(!r.institution_id||!label||!('source_url' in payload&&'valid_from' in payload))fail('hook_params_required');
       if(![...scales.values()].some(s=>s.institution_id===r.institution_id&&s.raw_label.toLowerCase()===label!.toLowerCase()&&s.valid_from===payload.valid_from)){const sid=randomUUID();scales.set(sid,{scale_id:sid,institution_id:r.institution_id!,raw_label:label!,normalized:payload.normalized as RatingScaleRow['normalized'],source_url:String(payload.source_url),valid_from:String(payload.valid_from),valid_to:null,created_by:by,created_at:stamp(),closed_by:null,closed_at:null});}
       wrote=true;
      }
      if(!wrote)fail('hook_params_required');
     }else if(reason==='unresolved_ticker'||reason==='ticker_issuer_conflict'){
      if(!('target_key' in payload&&'security_ticker' in payload))fail('hook_params_required');
      const k=`${r.report_id}|${String(payload.target_key)}`;const had=overrides.get(k);
      overrides.set(k,{override_id:had?.override_id??randomUUID(),report_id:r.report_id,target_key:String(payload.target_key),security_ticker:String(payload.security_ticker),issuer_id:(payload.issuer_id as string|undefined)??null,set_by:by,set_at:now(),note:`quarantine:${id}`});
     }else if(reason==='possible_version'){
      if(!('supersedes_report_id' in payload))fail('hook_params_required');
      setReport(r,{supersedes_report_id:String(payload.supersedes_report_id)});
     }
     materializeNow(r.report_id);
    }
   });
   await tables.update('dq_quarantine',{id},{status,resolved_by:by,resolved_at:now(),detail:{...((q.detail as R)??{}),hook:{function:'broker_quarantine_resolve',payload,at:now()}}});
   return 'resolved';
  },
 };
 return db;
}
```

内存实现与 SQL 的已知差异（除文件头 5 条外）：`broker_target_override` 的 `issuer_id=null` 时 SQL 会按 `issuer_securities` 推断发行人，内存实现不推断（保持 null）。服务层单测需要该行为时直接传 `issuer_id`。

- [ ] **Step 8: 共用契约用例 `db-contract.ts`**

```ts
// src/lib/broker-research/db-contract.ts
// Shared BrokerResearchDb contract (spec §4.4–§4.14, §6.2–§6.5, §10.2): the same scenarios run
// against memoryBrokerResearchDb (db.test.ts) and pgBrokerResearchDb (broker-research.integration
// .test.ts block 4), so the rules the service unit tests rely on are the SQL functions' rules. Not
// a test file: it registers describe/it only when called. Hash VALUES are never compared across
// implementations (SQL jsonb text vs canonicalJson) — only equal/unequal relations.
import {createHash,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import {effectiveValue} from './effective';
import {BrokerResearchDbError} from './types';
import type {BrokerResearchDb,CandidateFieldInput,LicenceInput,OutboxEvent,RuleResult} from './types';
import {CLAIM_METHODOLOGY_VERSION,DISCLOSURE_VERSION,RULES_VERSION,UPSIDE_FORMULA_VERSION} from './versions';

export interface BrokerContractHarness{
 db:BrokerResearchDb;tables:TableClient;
 issuer():Promise<string>;
 stock(ticker:string,market:'A'|'HK'|'US'):Promise<void>;
 expireLease(documentId:string):Promise<void>;
 setGoldCorpusHash(hash:string|null):Promise<void>;
 outbox():Promise<OutboxEvent[]>;
 batch():Promise<string>;
 close?():Promise<void>;
}
export const hex64=()=>createHash('sha256').update(randomUUID()).digest('hex');
export const PASS_CHECK={version:DISCLOSURE_VERSION,inputs_hash:'0'.repeat(64),passed:true,hits:[]};
export function licenceInput(o:Partial<LicenceInput>={}):LicenceInput{
 return {source_label:'Contract terminal',licence_kind:'terminal_subscription',holder:'Owner',terms_summary:'contract terms',evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,snippet_max_chars:200,valid_from:'2020-01-01',valid_to:null,...o};
}
export function candidate(o:Partial<CandidateFieldInput>&Pick<CandidateFieldInput,'field'|'value_text'>):CandidateFieldInput{
 return {target_key:null,occurrence:1,value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:4,value_source_text:'text',extractor:'llm:m-test@r',extractor_confidence:0.9,conflict_group:null,detail:{},status:'extracted',...o};
}
const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof BrokerResearchDbError?e.code:`not_db_error:${String(e)}`);
const titlesPass=(surfaces:string[]):RuleResult[]=>surfaces.map(surface=>({rule:'disclosure',passed:true,blocking:false,target_key:null,reason_code:null,detail:{surface,hits:[]}}));

export function brokerResearchDbContract(label:string,setup:()=>Promise<BrokerContractHarness>):void{
 describe(label,()=>{
  let h:BrokerContractHarness;let db:BrokerResearchDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.setGoldCorpusHash(null).catch(()=>{});await db?.setPublicEnabled(false,randomUUID()).catch(()=>{});await h?.close?.();},30000);
  const by=randomUUID();
  /** Licence (confirmed) → document → leased parse (succeeded, current) → report → extract run → extract_commit. */
  const world=async(o:{licence?:Partial<LicenceInput>;tk?:string;extra?:(tk:string)=>CandidateFieldInput[]}={})=>{
   const lic=await db.insertLicence(licenceInput(o.licence));expect(await db.confirmLicence(lic.licence_id,by,1)).toBe('confirmed');
   const sha=hex64();const doc=randomUUID();
   expect(await db.insertDocument({document_id:doc,sha256:sha,storage_path:`reports/${sha}.pdf`,byte_size:10,licence_id:lic.licence_id,uploaded_by:by,original_filename:'r.pdf'})).toBe('inserted');
   await db.updateDocument(doc,{promotion_pending:false});
   const token=randomUUID();expect(await db.claimLease(doc,token,300)).toBe(true);
   const parse=randomUUID();
   await db.insertRun({run_id:parse,document_id:doc,kind:'parse',parse_run_id:null,extractor_version:'f3/1',artifact_path:null,artifact_hash:null,model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:'test',behavior_digest:null,licence_version:1,request_path:null,response_path:null,batch_id:null});
   expect(await db.fencedUpdateDocument(doc,token,{status:'parsing'})).toBe('ok');
   expect(await db.finishRun(parse,token,{status:'succeeded',artifact_path:`reports/${sha}.extract.${parse}.json`,artifact_hash:hex64()})).toBe('ok');
   expect(await db.fencedUpdateDocument(doc,token,{status:'parsed',current_parse_run_id:parse,page_count:10})).toBe('ok');
   const rep=(await db.ensureReport(doc,'test')).report_id;
   const digest=hex64();const ext=randomUUID();
   await db.insertRun({run_id:ext,document_id:doc,kind:'extract',parse_run_id:parse,extractor_version:null,artifact_path:null,artifact_hash:null,model_id:'m-test',registry_hash:'r'.repeat(64),prompt_version:'broker-extract/1',schema_version:'extract-schema/1',code_version:'test',behavior_digest:digest,licence_version:1,request_path:null,response_path:null,batch_id:null});
   const tk=o.tk??`${1000+Math.floor(Math.random()*8999)}.HK`;await h.stock(tk,'HK');const iss=await h.issuer();
   const rows=[
    candidate({field:'institution',value_text:'Contract Securities'}),
    candidate({field:'published_date',value_text:'2026-03-05',value_date:'2026-03-05'}),
    candidate({field:'title',value_text:'Contract: Upgrade',detail:{lang:'en'}}),
    candidate({field:'ticker',target_key:tk,value_text:tk.replace('.',' '),resolution:{method:'parseBrokerTicker/1',issuer_securities_row:{issuer_id:iss,ticker:tk,valid_from:'2000-01-01',valid_to:null}}}),
    candidate({field:'rating',target_key:tk,value_text:'Buy'}),
    candidate({field:'target_price',target_key:tk,value_text:'120',value_num:'120',value_unit:'price'}),
    candidate({field:'target_currency',target_key:tk,value_text:'HK$',value_currency:'HKD'}),
    candidate({field:'price_at_report',target_key:tk,value_text:'100',value_num:'100',value_unit:'price'}),
    candidate({field:'price_currency',target_key:tk,value_text:'HKD',value_currency:'HKD'}),
    candidate({field:'price_as_of_date',target_key:tk,value_text:'2026-03-04',value_date:'2026-03-04'}),
    ...(o.extra?.(tk)??[])];
   const receipt=await db.extractCommit(doc,token,ext,rows);
   return {lic,doc,sha,token,parse,rep,ext,digest,tk,iss,receipt};
  };
  const GOLD=hex64();
  const allFields=['institution','published_date','title','ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date'];
  const rules=async(rep:string,results?:RuleResult[])=>{
   const r=(await db.getReport(rep))!;
   const surfaces=(['title_original','title_public','title_zh','title_en'] as const).filter(k=>r[k]!==null);
   return db.insertRuleReceipt({report_id:rep,rules_version:RULES_VERSION,input_hash:r.rules_input_hash!,results:results??titlesPass(surfaces),code_version:'test'});
  };
  const gold=async(digest:string)=>{
   await h.setGoldCorpusHash(GOLD);
   return db.insertEvalReceipt({corpus_kind:'gold',corpus_hash:GOLD,behavior_digest:digest,extractor_version:'f3/1',model_id:'m-test',registry_hash:'r',prompt_version:'p',schema_version:'s',code_version:'t',n_docs:30,
    per_field:Object.fromEntries(allFields.map(f=>[f,{tp:5,fp:0,fn:0,precision:1,recall:1}])),absence:{tp:0,fp:0,fn:0},precision_min:1,recall_min:1,passed:true,ran_by:by});
  };
  const ready=async(o:Parameters<typeof world>[0]={})=>{
   const w=await world(o);
   for(const f of (await db.listFields(w.rep)).filter(x=>x.status==='extracted'||x.status==='unverified'))await db.fieldReview(f.field_id,'confirm',{},by);
   const inst=await db.upsertInstitution({name_en:`Contract Inst ${randomUUID()}`,name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});
   await db.updateReportDraft(w.rep,{institution_id:inst,scope:'single_issuer',review_status:'approved'});
   await db.insertRatingScale({institution_id:inst,raw_label:'Buy',normalized:'buy',source_url:'https://example.test/s',valid_from:'2020-01-01',created_by:by});
   await db.materialize(w.rep);await rules(w.rep);await gold(w.digest);
   expect(await db.publishBlockers(w.rep)).toEqual([]);
   return {...w,inst};
  };

  it('settings and licences: default off, version bump on material change only, confirmation by version',async()=>{
   expect((await db.getSettings()).public_enabled).toBe(false);
   await db.setPublicEnabled(true,by);expect((await db.getSettings())).toMatchObject({public_enabled:true,updated_by:by});await db.setPublicEnabled(false,by);
   const l=await db.insertLicence(licenceInput());
   expect(l).toMatchObject({version:1,confirmed_at:null,confirmed_version:null});
   expect(await db.confirmLicence(l.licence_id,by,2)).toBe('version_mismatch');
   expect(await db.confirmLicence(l.licence_id,by,1)).toBe('confirmed');
   expect(await db.updateLicence(l.licence_id,{source_label:'Renamed'})).toMatchObject({version:1,confirmed_version:1,source_label:'Renamed'});
   expect(await db.updateLicence(l.licence_id,{snippet_max_chars:150})).toMatchObject({version:2,confirmed_at:null,confirmed_by:null,confirmed_version:null});
   expect(await db.confirmLicence(l.licence_id,by,1)).toBe('version_mismatch');
   expect(await code(db.updateLicence(randomUUID(),{holder:'x'}))).toBe('not_found');
   expect(await code(db.insertLicence(licenceInput({snippet_max_chars:501})))).toBe('constraint_violation');
   expect((await db.listLicences()).some(x=>x.licence_id===l.licence_id)).toBe(true);
  });

  it('intents: compare-and-set transitions stamp checkpoint_at; an illegal move is intent_transition_invalid',async()=>{
   const l=await db.insertLicence(licenceInput());const id=randomUUID();
   await db.insertIntent({intent_id:id,sha256:hex64(),byte_size:10,licence_id:l.licence_id,original_filename:'a.pdf',created_by:by,expires_at:new Date(Date.now()+7200e3).toISOString(),status:'open',staging_path:`staging/${id}.pdf`,document_id:null});
   expect((await db.getIntent(id))).toMatchObject({status:'open',checkpoint_at:null});
   expect(await db.transitionIntent(id,'open','validating')).toBe(true);
   expect(await db.transitionIntent(id,'open','validating')).toBe(false);
   expect((await db.getIntent(id))!.checkpoint_at).not.toBeNull();
   expect(await code(db.transitionIntent(id,'validating','committed'))).toBe('intent_transition_invalid');
   expect(await db.transitionIntent(id,'validating','abandoned',{error_code:'sha_mismatch'})).toBe(true);
   expect(await db.getIntent(id)).toMatchObject({status:'abandoned',error_code:'sha_mismatch'});
  });

  it('documents and leases: duplicate sha, CAS claim, expiry takeover fails running runs, fenced writes, finish once',async()=>{
   const l=await db.insertLicence(licenceInput());const sha=hex64();const doc=randomUUID();
   const row={document_id:doc,sha256:sha,storage_path:`reports/${sha}.pdf`,byte_size:10,licence_id:l.licence_id,uploaded_by:by,original_filename:'r.pdf'};
   expect(await db.insertDocument(row)).toBe('inserted');expect(await db.insertDocument({...row,document_id:randomUUID()})).toBe('duplicate');
   expect(await db.findDocumentBySha(sha)).toMatchObject({document_id:doc,status:'uploaded',promotion_pending:true});
   expect(await code(db.updateDocument(doc,{status:'parsed'}))).toBe('document_transition_invalid');
   const a=randomUUID(),b=randomUUID();
   expect(await db.claimLease(doc,a,300)).toBe(true);expect(await db.claimLease(doc,b,300)).toBe(false);
   const r1=randomUUID();
   await db.insertRun({run_id:r1,document_id:doc,kind:'parse',parse_run_id:null,extractor_version:'f3/1',artifact_path:null,artifact_hash:null,model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:'t',behavior_digest:null,licence_version:1,request_path:null,response_path:null,batch_id:null});
   await h.expireLease(doc);
   expect(await db.claimLease(doc,b,300)).toBe(true);
   expect(await db.getRun(r1)).toMatchObject({status:'failed',detail:{error_code:'lease_expired'}});
   expect(await db.fencedUpdateDocument(doc,a,{status:'parsing'})).toBe('lease_lost');
   const r2=randomUUID();
   await db.insertRun({run_id:r2,document_id:doc,kind:'parse',parse_run_id:null,extractor_version:'f3/1',artifact_path:null,artifact_hash:null,model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:'t',behavior_digest:null,licence_version:1,request_path:null,response_path:null,batch_id:null});
   expect(await db.finishRun(r2,a,{status:'succeeded'})).toBe('lease_lost');
   expect(await db.getRun(r2)).toMatchObject({status:'failed',detail:{error_code:'lease_lost',lease_lost:true}});
   expect(await code(db.finishRun(r2,b,{status:'failed'}))).toBe('run_finished');
   expect(await db.fencedUpdateDocument(doc,b,{status:'parsing',releaseLease:true})).toBe('ok');
   expect(await db.getDocument(doc)).toMatchObject({status:'parsing',lease_token:null,lease_until:null});
   expect((await db.listRuns(doc)).map(r=>r.run_id)).toEqual([r1,r2]);
  });

  it('extractCommit: candidate-basis receipt, typed targets, lease fence, supersede on re-extraction',async()=>{
   const w=await world();
   expect(w.receipt).toMatchObject({targets:1,basis:'candidate'});expect(w.receipt.materializedHash).toBe(w.receipt.effectiveHash);
   expect(await db.listTargets(w.rep)).toEqual([expect.objectContaining({target_key:w.tk,basis:'candidate',security_ticker:w.tk,issuer_id:w.iss,target_price:'120',target_currency:'HKD',price_at_report:'100',upside_pct:'0.200000',upside_formula_version:UPSIDE_FORMULA_VERSION,price_as_of_date:'2026-03-04'})]);
   expect(await db.getReport(w.rep)).toMatchObject({title_original:'Contract: Upgrade',title_lang:'en',published_date:'2026-03-05'});
   const fields=await db.listFields(w.rep);expect(fields).toHaveLength(10);expect(fields[0].target_key).toBeNull();
   expect(typeof fields.find(f=>f.field==='target_price')!.value_num).toBe('string');
   const ext2=randomUUID();
   await db.insertRun({run_id:ext2,document_id:w.doc,kind:'extract',parse_run_id:w.parse,extractor_version:null,artifact_path:null,artifact_hash:null,model_id:'m-test',registry_hash:'r'.repeat(64),prompt_version:'p',schema_version:'s',code_version:'t',behavior_digest:w.digest,licence_version:1,request_path:null,response_path:null,batch_id:null});
   expect(await code(db.extractCommit(w.doc,randomUUID(),ext2,[]))).toBe('lease_lost');
   expect(await code(db.extractCommit(w.doc,w.token,ext2,[{...candidate({field:'title',value_text:'x'}),status:'confirmed' as 'extracted'}]))).toBe('invalid_rows');
   await db.extractCommit(w.doc,w.token,ext2,[candidate({field:'title',value_text:'Contract: Upgrade v2'})]);
   expect(await db.listFields(w.rep)).toHaveLength(1);
   expect(await db.listFields(w.rep,{includeSuperseded:true})).toHaveLength(11);
   expect(await db.listTargets(w.rep)).toEqual([]);
   await h.expireLease(w.doc);
   expect(await code(db.extractCommit(w.doc,w.token,ext2,[]))).toBe('lease_lost');
  });

  it('fieldReview: conflict siblings rejected, effective basis, typed corrections with explicit null, atomic failure, absent, effective_exists',async()=>{
   const w=await world({extra:tk=>[candidate({field:'rating',target_key:tk,value_text:'Overweight',conflict_group:'g'})]});
   const live=async(field:string)=>(await db.listFields(w.rep)).filter(f=>f.field===field&&(f.status==='extracted'||f.status==='unverified'));
   expect((await db.listTargets(w.rep))[0].rating_raw).toBeNull();
   const ow=(await live('rating')).find(f=>f.value_text==='Overweight')!;
   await db.fieldReview(ow.field_id,'confirm',{},by);
   expect((await db.listFields(w.rep)).filter(f=>f.field==='rating').map(f=>[f.value_text,f.status]).sort()).toEqual([['Buy','rejected'],['Overweight','confirmed']]);
   for(const f of (await db.listFields(w.rep)).filter(x=>x.status==='extracted'))await db.fieldReview(f.field_id,'confirm',{},by);
   expect((await db.listTargets(w.rep))[0]).toMatchObject({basis:'effective',rating_raw:'Overweight'});
   const pc=(await db.listFields(w.rep)).find(f=>f.field==='price_currency')!;
   const before=await db.listFields(w.rep);
   expect(await code(db.fieldReview(pc.field_id,'correct',{value_text:'USD',value_date:'2026-02-30'},by))).toBe('invalid_payload');
   expect(await code(db.fieldReview(pc.field_id,'shout' as 'confirm',{},by))).toBe('invalid_action');
   expect(await db.listFields(w.rep)).toEqual(before);
   const r=await db.fieldReview(pc.field_id,'correct',{value_text:'USD',value_currency:'USD',value_unit:null},by);
   expect(r).toMatchObject({targets:1,basis:'effective'});
   const corrected=(await db.listFields(w.rep)).find(f=>f.field_id===pc.field_id)!;
   expect(corrected).toMatchObject({status:'corrected',corrected:{value_text:'USD',value_currency:'USD',value_unit:null}});
   expect(effectiveValue(corrected)).toEqual({value_text:'USD',value_num:null,value_currency:'USD',value_unit:null,value_date:null});
   expect((await db.listTargets(w.rep))[0]).toMatchObject({price_currency:'USD',upside_pct:null,upside_formula_version:null});
   expect(await code(db.insertHumanField(w.rep,{target_key:w.tk,field:'price_currency',occurrence:1,value_text:'HKD',value_num:null,value_currency:'HKD',value_unit:null,value_date:null,page:1,char_start:0,char_end:3,value_source_text:'HKD',parse_run_id:w.parse,status:'confirmed'},by))).toBe('effective_exists');
   const tp=(await db.listFields(w.rep)).find(f=>f.field==='target_price')!;
   await db.fieldReview(tp.field_id,'absent',{page:2},by);
   expect((await db.listFields(w.rep)).filter(f=>f.field==='target_price').map(f=>f.status).sort()).toEqual(['absent','rejected']);
   expect((await db.listTargets(w.rep))[0]).toMatchObject({basis:'effective',target_price:null});
   expect(await code(db.fieldReview(randomUUID(),'confirm',{},by))).toBe('field_not_found');
  });

  it('insertHumanField and upsertTargetOverride go through materialize',async()=>{
   const w=await world();
   const out=await db.insertHumanField(w.rep,{target_key:null,field:'sector',occurrence:1,value_text:'Internet',value_num:null,value_currency:null,value_unit:null,value_date:null,page:2,char_start:0,char_end:8,value_source_text:'Internet',parse_run_id:w.parse,status:'confirmed'},by);
   expect(out.receipt.targets).toBe(1);expect((await db.getReport(w.rep))!.sector_as_stated).toBe('Internet');
   expect(await code(db.insertHumanField(w.rep,{target_key:null,field:'sector',occurrence:2,value_text:'x',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:1,value_source_text:'x',parse_run_id:randomUUID(),status:'confirmed'},by))).toBe('invalid_payload');
   await h.stock('BABA','US');const other=await h.issuer();
   await db.upsertTargetOverride({report_id:w.rep,target_key:w.tk,security_ticker:'BABA',issuer_id:other,set_by:by,note:null});
   expect((await db.listTargets(w.rep))[0]).toMatchObject({security_ticker:'BABA',issuer_id:other});
   expect(typeof (await db.listTargets(w.rep))[0].resolution.override_id).toBe('string');
  });

  it('publishBlockers: a fresh extraction lists the reasons in spec order; a ready report has none',async()=>{
   const w=await world();
   expect(await db.publishBlockers(w.rep)).toEqual(['review_not_approved','report_incomplete:scope','report_incomplete:institution_id','required_field_missing:institution','required_field_missing:published_date','required_field_missing:title','field_pending:institution','field_pending:published_date','field_pending:title','rules_stale','restricted_value_in_text:title_original']);
   const r=await ready();
   await db.updateReportDraft(r.rep,{title_public:'Rewritten',title_public_by:by});
   expect(await db.publishBlockers(r.rep)).toEqual(['materialize_stale','restricted_value_in_text:title_public']);
   await db.materialize(r.rep);expect(await db.publishBlockers(r.rep)).toEqual(['rules_stale','restricted_value_in_text:title_public']);
   await rules(r.rep);expect(await db.publishBlockers(r.rep)).toEqual([]);
   await db.updateReportDraft(r.rep,{evidence_ok:false});expect(await db.publishBlockers(r.rep)).toEqual(['evidence_drift']);await db.updateReportDraft(r.rep,{evidence_ok:true});
   const b=await h.batch();
   const qid=String((await h.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'broker_research',table_name:'broker_research_reports',natural_key:`${r.sha}:upside_identity:${r.tk}`,reason_code:'upside_mismatch',batch_id:b,payload:{},detail:{},status:'open',resolved_by:null,resolved_at:null,created_at:new Date().toISOString()})).id);
   expect(await db.publishBlockers(r.rep)).toEqual(['quarantine_open:upside_mismatch']);
   await h.tables.update('dq_quarantine',{id:qid},{status:'resolved_accept',resolved_by:by,resolved_at:new Date().toISOString()});
   expect(await db.publishBlockers(r.rep)).toEqual([]);
   await h.setGoldCorpusHash(null);expect(await db.publishBlockers(r.rep)).toEqual(['eval_receipt_missing']);await h.setGoldCorpusHash(GOLD);
  });

  it('publish: blocked → publish_blocked with the reasons; success → snapshot, published, immutable, one claim per priced target; unpublish → revision, retract, review reopened; republish → new claim',async()=>{
   const w=await world();
   const e=await db.publish(w.rep,by).then(()=>null,x=>x as BrokerResearchDbError);
   expect(e).toMatchObject({code:'publish_blocked'});expect(e!.detail).toMatch(/^review_not_approved,/);
   const r=await ready();
   const {publicationId:pub}=await db.publish(r.rep,by);
   const p=(await db.getPublication(pub))!;
   expect(p).toMatchObject({report_id:r.rep,revision:1,licence_version:1,published_by:by,unpublished_at:null});expect(p.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
   expect((p.snapshot.report as Record<string,unknown>).status).toBe('published');expect((p.snapshot.fields as unknown[]).length).toBe(10);
   expect(await db.getReport(r.rep)).toMatchObject({status:'published',current_publication_id:pub,title_restricted:false});
   expect(await code(db.updateReportDraft(r.rep,{title_public:'x',title_public_by:by}))).toBe('published_immutable');
   expect(await code(db.fieldReview((await db.listFields(r.rep))[0].field_id,'reject',{},by))).toBe('published_immutable');
   expect(await code(db.materialize(r.rep))).toBe('published_immutable');
   expect(await code(db.publish(r.rep,by))).toBe('report_not_draft');
   await db.updateReportDraft(r.rep,{evidence_ok:true});                                        // allowed (unchanged)
   const regs=(await h.outbox()).filter(x=>x.kind==='claim.register'&&(x.payload.source as Record<string,unknown>).publication_id===pub);
   expect(regs).toHaveLength(1);
   expect(regs[0].payload).toMatchObject({claim_key:`broker_target_price:${pub}:${r.tk}`,claim_seq:1,methodology_version:CLAIM_METHODOLOGY_VERSION,subject:{security_ticker:r.tk,market:'HK',currency:'HKD'},claim:{direction:1,target_price:'120',reference_price:'100'},source:{snapshot_hash:p.snapshot_hash}});
   expect(await code(db.unpublish(r.rep,by,' '))).toBe('reason_required');
   await db.unpublish(r.rep,by,'owner request');
   expect(await db.getReport(r.rep)).toMatchObject({status:'draft',revision:2,current_publication_id:null,review_status:'in_review'});
   expect(await db.getPublication(pub)).toMatchObject({unpublish_reason:'owner request'});
   const ret=(await h.outbox()).filter(x=>x.kind==='claim.retract'&&x.payload.claim_key===`broker_target_price:${pub}:${r.tk}`);
   expect(ret.map(x=>[x.payload.claim_seq,x.payload.reason])).toEqual([[2,'unpublish']]);
   await db.updateReportDraft(r.rep,{review_status:'approved'});
   const {publicationId:pub2}=await db.publish(r.rep,by);
   expect((await db.getPublication(pub2))!.revision).toBe(2);
   await db.updateReportDraft(r.rep,{disclosure_ok:false});
   expect((await h.outbox()).filter(x=>x.kind==='claim.retract'&&(x.payload.claim_key as string).includes(pub2)).map(x=>x.payload.reason)).toEqual(['disclosure_ok']);
   await db.updateDocument(r.doc,{status:'withdrawn',withdrawn_at:new Date().toISOString(),withdrawn_reason:'gone'});
   expect((await db.getReport(r.rep))!.status).toBe('withdrawn');
   expect((await h.outbox()).filter(x=>x.kind==='claim.retract'&&(x.payload.claim_key as string).includes(pub2))).toHaveLength(1);
  });

  it('snippets and summaries: approval gates; a material licence change drafts them and flags the report',async()=>{
   const w=await world({licence:{snippet_max_chars:10}});const lic=w.lic.licence_id;
   const sn=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:11,text:'01234567890',field_id:null,disclosure_check:PASS_CHECK,created_by:by});
   expect(await code(db.setSnippetStatus(sn,{status:'approved',approved_by:by}))).toBe('snippet_too_long');
   const ok=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:5,text:'short',field_id:null,disclosure_check:{...PASS_CHECK,passed:false},created_by:by});
   expect(await code(db.setSnippetStatus(ok,{status:'approved',approved_by:by}))).toBe('disclosure_failed');
   await db.setSnippetStatus(ok,{status:'approved',approved_by:by,disclosure_check:PASS_CHECK});
   expect((await db.listSnippets(w.rep)).find(s=>s.snippet_id===ok)).toMatchObject({status:'approved',approved_by:by});
   const dg=(await db.getReport(w.rep))!.summary_input_digest!;
   const su=await db.insertSummary({report_id:w.rep,lang:'en',kind:'independent_summary',run_id:w.ext,input_hash:dg,summary_md:'S',max_verbatim_overlap:1,numeric_grounding:{version:'grounding/1',passed:true,assertions:[],failures:[]},disclosure_check:PASS_CHECK,status:'draft'});
   const stale=await db.insertSummary({report_id:w.rep,lang:'zh',kind:'independent_summary',run_id:w.ext,input_hash:hex64(),summary_md:'S',max_verbatim_overlap:1,numeric_grounding:{version:'grounding/1',passed:true,assertions:[],failures:[]},disclosure_check:PASS_CHECK,status:'draft'});
   expect(await code(db.setSummaryStatus(stale,{status:'approved',approved_by:by}))).toBe('summary_stale');
   await db.setSummaryStatus(su,{status:'approved',approved_by:by});
   await db.updateLicence(lic,{allows_public_target_price:false});
   expect((await db.listSnippets(w.rep)).find(s=>s.snippet_id===ok)).toMatchObject({status:'draft',approved_by:null,approved_at:null});
   expect((await db.listSummaries(w.rep)).find(s=>s.summary_id===su)!.status).toBe('draft');
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(false);
   expect((await h.outbox()).some(e=>e.kind==='licence.changed'&&e.payload.licence_id===lic&&e.payload.version===2)).toBe(true);
  });

  it('entities: close-only rating scales; an analyst disclosure change flags bound reports and drafts their approved texts',async()=>{
   const inst=await db.upsertInstitution({name_en:`Entity Inst ${randomUUID()}`,name_zh:'机构',aliases:['EI'],kind:null,rating_disclosure_url:null});
   expect(await code(db.upsertInstitution({name_en:(await db.listInstitutions()).find(i=>i.institution_id===inst)!.name_en.toUpperCase(),name_zh:null,aliases:[],kind:null,rating_disclosure_url:null}))).toBe('duplicate_key');
   const sc=await db.insertRatingScale({institution_id:inst,raw_label:'Buy',normalized:'buy',source_url:'https://example.test/s',valid_from:'2020-01-01',created_by:by});
   expect(await code(db.insertRatingScale({institution_id:inst,raw_label:'BUY',normalized:'sell',source_url:'https://example.test/s',valid_from:'2020-01-01',created_by:by}))).toBe('duplicate_key');
   await db.closeRatingScale(sc,'2025-01-01',by);
   expect((await db.listRatingScales(inst))[0]).toMatchObject({valid_to:'2025-01-01',closed_by:by});
   expect(await code(db.closeRatingScale(sc,'2026-01-01',by))).toBe('scale_closed');
   const w=await world();
   const af=(await db.insertHumanField(w.rep,{target_key:null,field:'analyst',occurrence:1,value_text:'Ann',value_num:null,value_currency:null,value_unit:null,value_date:null,page:1,char_start:0,char_end:3,value_source_text:'Ann',parse_run_id:w.parse,status:'confirmed'},by)).fieldId;
   const an=await db.upsertAnalyst({institution_id:inst,display_name:'Ann',name_variants:[],public_display:false});
   expect(await code(db.bindAnalyst({report_id:w.rep,analyst_id:an,role:null,field_id:(await db.listFields(w.rep)).find(f=>f.field==='title')!.field_id}))).toBe('analyst_field_mismatch');
   await db.bindAnalyst({report_id:w.rep,analyst_id:an,role:'lead',field_id:af});
   const sn=await db.insertSnippet({report_id:w.rep,target_key:null,purpose:'thesis',parse_run_id:w.parse,page:1,char_start:0,char_end:4,text:'abcd',field_id:null,disclosure_check:PASS_CHECK,created_by:by});
   await db.setSnippetStatus(sn,{status:'approved',approved_by:by});
   await db.upsertAnalyst({analyst_id:an,institution_id:inst,display_name:'Ann',name_variants:[],public_display:false});      // unchanged → no cascade
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(true);
   await db.upsertAnalyst({analyst_id:an,institution_id:inst,display_name:'Ann',name_variants:['A. N.'],public_display:false});
   expect((await db.getReport(w.rep))!.disclosure_ok).toBe(false);
   expect((await db.listSnippets(w.rep)).find(s=>s.snippet_id===sn)!.status).toBe('draft');
   expect((await db.listAnalysts(inst)).map(a=>a.analyst_id)).toEqual([an]);
  });

  it('outbox attempts, purge steps, access log, eval receipts, review queue',async()=>{
   const l=await db.updateLicence((await db.insertLicence(licenceInput())).licence_id,{holder:'Other'});
   const ev=(await h.outbox()).find(e=>e.kind==='licence.changed'&&e.payload.licence_id===l.licence_id)!;
   expect((await db.takePendingOutbox(10000)).some(e=>e.event_id===ev.event_id)).toBe(true);
   for(let i=0;i<9;i++)await db.markOutbox(ev.event_id,{delivered:false,error:'boom'});
   expect((await h.outbox()).find(e=>e.event_id===ev.event_id)).toMatchObject({status:'pending',attempts:9});
   await db.markOutbox(ev.event_id,{delivered:false,error:'boom'});
   expect((await h.outbox()).find(e=>e.event_id===ev.event_id)).toMatchObject({status:'failed',attempts:10,last_error:'boom'});
   expect(await code(db.markOutbox(ev.event_id,{delivered:true}))).toBe('event_not_pending');
   const w=await world();
   await db.upsertPurgeStep(w.doc,'pdf',{ok:false,error:'io'});await db.upsertPurgeStep(w.doc,'pdf',{ok:true});await db.upsertPurgeStep(w.doc,'artifacts',{ok:true});
   expect((await db.purgeSteps(w.doc)).map(p=>[p.step,p.status,p.attempts,p.last_error])).toEqual([['artifacts','done',1,null],['pdf','done',2,null]]);
   await db.logAccess({document_id:w.doc,user_id:by,action:'signed_url_issued',detail:{expires_in:600}});await db.logAccess({document_id:w.doc,user_id:by,action:'text_viewed',detail:{}});
   expect((await db.listAccessLog({documentId:w.doc,limit:10})).map(a=>a.action)).toEqual(['text_viewed','signed_url_issued']);
   const dg=hex64();
   const base={corpus_kind:'synthetic' as const,corpus_hash:hex64(),behavior_digest:dg,extractor_version:'f3/1',model_id:'m',registry_hash:'r',prompt_version:'p',schema_version:'s',code_version:'t',n_docs:3,per_field:{},absence:{tp:0,fp:0,fn:0},ran_by:by};
   await db.insertEvalReceipt({...base,precision_min:0.9,recall_min:0.99,passed:false});
   const second=await db.insertEvalReceipt({...base,precision_min:0.99,recall_min:0.99,passed:true});
   expect((await db.latestEvalReceipt(dg))).toMatchObject({receipt_id:second,passed:true,precision_min:0.99});
   expect(await code(db.insertEvalReceipt({...base,precision_min:0.5,recall_min:0.99,passed:true}))).toBe('constraint_violation');
   expect((await db.reviewQueue({status:'pending',limit:10000})).some(r=>r.report_id===w.rep)).toBe(true);
  });

  it('public reads: nothing while public_enabled=false; bundles, detail, history and institutions after; target price hidden when not public',async()=>{
   const r=await ready();await db.publish(r.rep,by);
   const t=await ready({licence:{allows_public_target_price:false}});await db.publish(t.rep,by);
   await db.setPublicEnabled(false,by);
   expect((await db.publicReports({limit:200})).some(b=>b.report.report_id===r.rep)).toBe(false);
   expect(await db.publicReport(r.rep)).toBeNull();
   await db.setPublicEnabled(true,by);
   const list=await db.publicReports({institutionId:r.inst,limit:10});
   expect(list.map(b=>b.report.report_id)).toEqual([r.rep]);
   expect(list[0]).toMatchObject({hasSummary:{zh:false,en:false},snippetCount:0,institution:{institution_id:r.inst}});
   expect(list[0].targets[0]).toMatchObject({target_key:r.tk,target_price:'120',upside_pct:'0.200000',target_price_public:true});
   expect(await db.publicReports({issuerId:r.iss,limit:10})).toHaveLength(1);
   expect(await db.publicReports({rating:'sell',institutionId:r.inst,limit:10})).toEqual([]);
   const d=(await db.publicReport(t.rep))!;
   expect(d.targets[0]).toMatchObject({target_price:null,target_currency:null,upside_pct:null,target_price_public:false,price_at_report:'100'});
   expect(d.citations.map(c=>c.field)).not.toContain('target_price');
   expect(d.citations.find(c=>c.field==='price_at_report')).toMatchObject({value_num:'100',extractor_kind:'llm'});
   const hist=await db.ratingHistory({securityTicker:r.tk,limit:10});
   expect(hist.map(x=>[x.report_id,x.prev_report_id,x.target_price])).toEqual([[r.rep,null,'120']]);
   expect((await db.publicInstitutions()).some(i=>i.institution_id===r.inst)).toBe(true);
   await db.setPublicEnabled(false,by);
  });
 });
}
```

- [ ] **Step 9: 内存契约 + supabase 接线单测 `db.test.ts`**

```ts
// src/lib/broker-research/db.test.ts
// memoryBrokerResearchDb against the shared contract; memory-only rules (clock, upside rounding);
// supabaseBrokerResearchDb wiring (rpc names and argument names, ::text column lists, error
// mapping, admin/anon client separation) over a stub client.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {FIELD_COLUMNS,sqlColumns,supabaseBrokerResearchDb,toBrokerResearchDbError} from './db';
import {brokerResearchDbContract} from './db-contract';
import {decimalCompare,memoryBrokerResearchDb,upside1} from './memory-db';
import {BrokerResearchDbError} from './types';

brokerResearchDbContract('memoryBrokerResearchDb contract',async()=>{
 const db=memoryBrokerResearchDb();
 return {db,tables:db.tables,issuer:async()=>randomUUID(),stock:async()=>{},expireLease:async id=>db.expireLease(id),setGoldCorpusHash:async h=>db.setGoldCorpusHash(h),outbox:async()=>db.outbox(),batch:async()=>randomUUID()};
});

describe('memory specifics',()=>{
 it('upside/1 rounds half away from zero to 6 places; decimal compare without Number',()=>{
  expect(upside1('120','100')).toBe('0.200000');expect(upside1('133.335','100')).toBe('0.333350');
  expect(upside1('99.99995','100')).toBe('-0.000001');expect(upside1('100','100')).toBe('0.000000');expect(upside1('1','0')).toBeNull();
  expect(upside1('12345678901234567890.5','12345678901234567890')).toBe('0.000000');
  expect(decimalCompare('120.0','120')).toBe(0);expect(decimalCompare('0.10','0.09')).toBe(1);
 });
 it('leases expire against the injected clock',async()=>{
  const db=memoryBrokerResearchDb();db.setNow('2026-01-01T00:00:00.000Z');
  const l=await db.insertLicence({source_label:'x',licence_kind:'other',holder:'h',terms_summary:'t',evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,snippet_max_chars:100,valid_from:'2020-01-01',valid_to:null});
  const sha='a'.repeat(64);const doc=randomUUID();
  await db.insertDocument({document_id:doc,sha256:sha,storage_path:`reports/${sha}.pdf`,byte_size:1,licence_id:l.licence_id,uploaded_by:randomUUID(),original_filename:'a.pdf'});
  expect(await db.claimLease(doc,'t1',60)).toBe(true);
  db.setNow('2026-01-01T00:00:59.000Z');expect(await db.claimLease(doc,'t2',60)).toBe(false);
  db.setNow('2026-01-01T00:01:01.000Z');expect(await db.claimLease(doc,'t2',60)).toBe(true);
  expect((await db.getDocument(doc))!.lease_until).toBe('2026-01-01T00:02:01.000Z');
 });
});

describe('toBrokerResearchDbError',()=>{
 it('maps raise prefixes, lease_lost, unique and check violations',()=>{
  expect(toBrokerResearchDbError({message:'publish_blocked:review_not_approved,rules_stale',code:'P0001'})).toMatchObject({code:'publish_blocked',detail:'review_not_approved,rules_stale'});
  expect(toBrokerResearchDbError({message:'lease_lost',code:'55P03'})).toMatchObject({code:'lease_lost'});
  expect(toBrokerResearchDbError({message:'duplicate key value violates unique constraint "broker_documents_sha256_uniq"',code:'23505'})).toMatchObject({code:'duplicate_key',detail:'broker_documents_sha256_uniq'});
  expect(toBrokerResearchDbError({message:'new row for relation "x" violates check constraint "broker_fields_confirmed_span"',code:'23514'})).toMatchObject({code:'constraint_violation',detail:'broker_fields_confirmed_span'});
  expect(toBrokerResearchDbError({message:'append_only:broker_report_runs rows are never deleted',code:'23514'})).toMatchObject({code:'append_only'});
  expect(toBrokerResearchDbError({message:'permission denied for table broker_outbox',code:'42501'})).toMatchObject({code:'unknown'});
  const e=new BrokerResearchDbError('x');expect(toBrokerResearchDbError(e)).toBe(e);
 });
 it('sqlColumns turns PostgREST casts into SQL',()=>{
  expect(sqlColumns('a,b:b::text,c')).toBe('a, b::text as b, c');
  expect(FIELD_COLUMNS).toContain('value_num:value_num::text');
 });
});

/** Chainable PostgREST stub: records every call; resolves rpc by name and table reads from a queue. */
function stub(o:{rpc?:Record<string,{data:unknown;error:unknown}>;rows?:unknown[]}={}){
 const calls:unknown[][]=[];const rows=[...(o.rows??[])];
 const builder=(table:string)=>{
  const b:Record<string,unknown>={};
  for(const m of ['select','insert','update','upsert','eq','is','in','gte','lte','lt','or','order','limit','range','single','maybeSingle'])b[m]=(...a:unknown[])=>{calls.push(['from',table,m,...a]);return b;};
  b.then=(res:(v:unknown)=>unknown,rej?:(e:unknown)=>unknown)=>Promise.resolve({data:rows.length?rows.shift():null,error:null}).then(res,rej);
  return b;
 };
 const client={rpc:(fn:string,args:unknown)=>{calls.push(['rpc',fn,args]);return Promise.resolve(o.rpc?.[fn]??{data:null,error:null});},from:builder};
 return {calls,client:client as unknown as SupabaseClient};
}
describe('supabaseBrokerResearchDb wiring',()=>{
 it('calls the RPCs with their SQL argument names and maps the receipt',async()=>{
  const s=stub({rpc:{broker_extract_commit:{data:{effectiveHash:'e',materializedHash:'e',targets:2,basis:'mixed'},error:null},broker_report_publish:{data:'pub-1',error:null}}});
  const db=supabaseBrokerResearchDb({admin:s.client});
  expect(await db.extractCommit('d','t','r',[])).toEqual({effectiveHash:'e',materializedHash:'e',targets:2,basis:'mixed'});
  expect(await db.publish('rep','u')).toEqual({publicationId:'pub-1'});
  await db.fencedUpdateDocument('d','t',{status:'parsed',current_parse_run_id:'p',releaseLease:true});
  await db.upsertTargetOverride({report_id:'rep',target_key:'9988.HK',security_ticker:'9988.HK',issuer_id:null,set_by:'u',note:null});
  expect(s.calls.filter(c=>c[0]==='rpc')).toEqual([
   ['rpc','broker_extract_commit',{p_document_id:'d',p_lease_token:'t',p_run_id:'r',p_rows:[]}],
   ['rpc','broker_report_publish',{p_report_id:'rep',p_by:'u'}],
   ['rpc','broker_document_fenced_update',{p_document:'d',p_token:'t',p_patch:{status:'parsed',current_parse_run_id:'p'},p_release:true}],
   ['rpc','broker_target_override',{p_report_id:'rep',p_target_key:'9988.HK',p_security_ticker:'9988.HK',p_issuer_id:null,p_by:'u',p_note:null}],
  ]);
 });
 it('maps an rpc error to BrokerResearchDbError and keeps private and public clients apart',async()=>{
  const s=stub({rpc:{broker_report_publish:{data:null,error:{message:'publish_blocked:rules_stale',code:'P0001'}}}});
  await expect(supabaseBrokerResearchDb({admin:s.client}).publish('r','u')).rejects.toMatchObject({name:'BrokerResearchDbError',code:'publish_blocked',detail:'rules_stale'});
  await expect(supabaseBrokerResearchDb({admin:s.client}).publicReport('r')).rejects.toMatchObject({code:'anon_client_required'});
  await expect(supabaseBrokerResearchDb({anon:s.client}).getSettings()).rejects.toMatchObject({code:'admin_client_required'});
 });
 it('reads fields with the ::text column list',async()=>{
  const s=stub({rows:[[]]});
  await supabaseBrokerResearchDb({admin:s.client}).listFields('rep');
  expect(s.calls).toContainEqual(['from','broker_report_fields','select',FIELD_COLUMNS]);
  expect(s.calls).toContainEqual(['from','broker_report_fields','is','superseded_by_run_id',null]);
 });
});
```

- [ ] **Step 10: 运行，确认失败 → 通过**

先跑（`memory-db.ts`、`db.ts` 已写则直接期望通过；按 TDD 顺序应先写 Step 8/9 再写 Step 6/7，期望 `Cannot find module './memory-db'`）：

```bash
npm test -- src/lib/broker-research/
```

Expected（实现后）：PASS（hash、effective、memory 契约 12 个用例、memory 特性 2 个、错误映射 2 个、接线 3 个）。

- [ ] **Step 11: typecheck、lint、提交**

```bash
npm run typecheck && npm run lint
```

实施记录追加 `| A4 | types/hash/effective/db(supabase)/memory-db/db-contract；单测 | <sha> |`。

```bash
git add src/lib/broker-research/types.ts src/lib/broker-research/hash.ts src/lib/broker-research/hash.test.ts src/lib/broker-research/effective.ts src/lib/broker-research/effective.test.ts src/lib/broker-research/db.ts src/lib/broker-research/memory-db.ts src/lib/broker-research/db-contract.ts src/lib/broker-research/db.test.ts docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): BrokerResearchDb contract — supabase and memory implementations, shared cases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A5: `pgBrokerResearchDb` 与 pg 契约（集成块 4）

**Files:**
- Create: `src/lib/broker-research/pg-db.ts`
- Modify: `src/lib/broker-research/broker-research.integration.test.ts`（追加块 4）
- Modify: `docs/audits/2026-11-06-foreign-research/10-implementation-log.md`

- [ ] **Step 1: 写失败的集成测试（块 4）**

在文件顶部 import 区追加：

```ts
import {pgTableClient} from '../db/pg-table-client';
import {brokerResearchDbContract} from './db-contract';
import type {BrokerContractHarness} from './db-contract';
import {effectiveValue} from './effective';
import {pgBrokerResearchDb} from './pg-db';
import type {OutboxEvent} from './types';
```

文件末尾追加：

```ts
async function pgHarness():Promise<BrokerContractHarness>{
 const p=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl,statement_timeout:8000});
 return {
  db:pgBrokerResearchDb(p),tables:pgTableClient(p),
  issuer:async()=>(await p.query(`insert into public.issuers(issuer_id,canonical_name_en) values(gen_random_uuid(),'ZZ Broker Contract') returning issuer_id`)).rows[0].issuer_id,
  stock:async(t,m)=>{await p.query(`insert into public.stocks_universe(ticker,name,market) values($1,$1,$2::market_t) on conflict (ticker) do nothing`,[t,m]);},
  expireLease:async id=>{await p.query(`update public.broker_report_documents set lease_until=now()-interval '1 second' where document_id=$1 and lease_token is not null`,[id]);},
  setGoldCorpusHash:async h=>{await p.query(`update public.broker_research_settings set approved_gold_corpus_hash=$1 where id=1`,[h]);},
  outbox:async()=>(await p.query(`select * from public.broker_outbox order by created_at,event_id`)).rows.map(r=>({...r,created_at:new Date(r.created_at).toISOString(),delivered_at:r.delivered_at?new Date(r.delivered_at).toISOString():null}) as OutboxEvent),
  batch:async()=>(await p.query(`insert into public.ingest_batches(batch_id,producer,dataset) values(gen_random_uuid(),'broker-research-extract','broker_research') returning batch_id`)).rows[0].batch_id,
  close:async()=>{await p.end();},
 };
}
describe.skipIf(!enabled)('A5 pgBrokerResearchDb',()=>{
 brokerResearchDbContract('pgBrokerResearchDb contract',pgHarness);

 describe('effective value: TS effectiveValue = SQL broker_field_effective on every corrected shape',()=>{
  let h:BrokerContractHarness;let p:Pool;
  beforeAll(async()=>{h=await pgHarness();p=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
  afterAll(async()=>{await h?.close?.();await p?.end();});
  it('agrees for null, partial, explicit-null and full corrections read back through pgBrokerResearchDb',async()=>{
   const shapes=[null,{value_text:'121'},{value_text:'121',value_num:null},{value_text:'x',value_num:'99.50',value_currency:'USD',value_unit:'price',value_date:'2026-01-02'},{value_text:'y',value_currency:null,value_date:null}];
   for(const corrected of shapes){
    const sql=(await p.query(`select public.broker_field_effective($1::jsonb,'120',120.50,'HKD','price','2026-03-04') v`,[corrected===null?null:JSON.stringify(corrected)])).rows[0].v;
    const ts=effectiveValue({corrected,value_text:'120',value_num:'120.50',value_currency:'HKD',value_unit:'price',value_date:'2026-03-04'});
    expect({corrected,ts}).toEqual({corrected,ts:sql});
   }
  });
 });
});
```

- [ ] **Step 2: 运行，确认失败**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
```

Expected: FAIL（`Cannot find module './pg-db'`）。

- [ ] **Step 3: 实现 `pg-db.ts`**

```ts
// src/lib/broker-research/pg-db.ts
// TEST-ONLY BrokerResearchDb over node-postgres calling the same SQL functions and views the
// Supabase adapter calls through rpc/PostgREST, so the shared contract (db-contract.ts) runs on the
// real schema: triggers, locks, leases, hashes, views. Nothing in src/app imports this. Uses
// pg-table-client's typeParsers (date/timestamptz as text; numeric/bigint as strings) and the
// db.ts normalisers; errors go through toBrokerResearchDbError exactly like PostgREST errors.
import type {Pool} from 'pg';
import {ident,typeParsers} from '../db/pg-table-client';
import {DEFAULT_QUEUE_LIMIT,FIELD_COLUMNS,HISTORY_COLUMNS,PUBLIC_CITATION_COLUMNS,PUBLIC_TARGET_COLUMNS,TARGET_COLUMNS,accessFromRow,analystFromRow,bundles,documentFromRow,dropUndefined,evalFromRow,fencedArgs,fieldFromRow,institutionFromRow,intentFromRow,licenceFromRow,outboxFromRow,publicRow,publicationFromRow,purgeFromRow,receiptFrom,reportFromRow,runFromRow,scaleFromRow,settingsFromRow,snippetFromRow,sqlColumns,summaryFromRow,targetFromRow,toBrokerResearchDbError} from './db';
import type {PgErrorLike} from './db';
import {BrokerResearchDbError} from './types';
import type {BrokerResearchDb} from './types';

type R=Record<string,unknown>;
// Plain objects → JSON (jsonb parameters); JS arrays pass through as PostgreSQL arrays (uuid[]/text[]).
const J=(v:unknown)=>v!==null&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v;

export function pgBrokerResearchDb(pool:Pool):BrokerResearchDb{
 const q=async(text:string,values:unknown[]=[]):Promise<R[]>=>{
  try{return (await pool.query({text,values:values.map(J),types:typeParsers})).rows as R[];}
  catch(e){throw toBrokerResearchDbError(e as PgErrorLike);}
 };
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await q(`select ${call} as v`,values))[0].v as T;
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]??null;
 const rel=(t:string)=>`public.${ident(t)}`;
 /** insert/update helpers over validated identifiers. */
 const insert=async(t:string,row:R,returning='*')=>{const p=dropUndefined(row);const k=Object.keys(p);
  return (await q(`insert into ${rel(t)} (${k.map(ident).join(', ')}) values (${k.map((_,i)=>`$${i+1}`).join(', ')}) returning ${returning}`,k.map(c=>p[c])))[0];};
 const update=async(t:string,patch:R,where:string,whereValues:unknown[],returning='1')=>{const p=dropUndefined(patch);const k=Object.keys(p);if(!k.length)return [] as R[];
  return q(`update ${rel(t)} set ${k.map((c,i)=>`${ident(c)} = $${i+1+whereValues.length}`).join(', ')} where ${where} returning ${returning}`,[...whereValues,...k.map(c=>p[c])]);};
 const notFound=(what:string)=>new BrokerResearchDbError('not_found',`not_found:${what}`,what);
 return {
  async getSettings(){return settingsFromRow((await one(`select * from ${rel('broker_research_settings')} where id = 1`))!);},
  async setPublicEnabled(flag,by){await q(`update ${rel('broker_research_settings')} set public_enabled = $1, updated_by = $2, updated_at = now() where id = 1`,[flag,by]);},
  async listLicences(){return (await q(`select * from ${rel('broker_report_licences')} order by created_at, licence_id`)).map(licenceFromRow);},
  async getLicence(id){const r=await one(`select * from ${rel('broker_report_licences')} where licence_id = $1`,[id]);return r?licenceFromRow(r):null;},
  async insertLicence(input){return licenceFromRow(await insert('broker_report_licences',input as unknown as R));},
  async updateLicence(id,patch){const [r]=await update('broker_report_licences',patch as R,'licence_id = $1',[id],'*');if(!r)throw notFound('licence');return licenceFromRow(r);},
  async confirmLicence(id,by,version){
   const hit=await q(`update ${rel('broker_report_licences')} set confirmed_by = $2, confirmed_at = now(), confirmed_version = $3 where licence_id = $1 and version = $3 returning 1`,[id,by,version]);
   if(hit.length)return 'confirmed';
   if(!await one(`select 1 from ${rel('broker_report_licences')} where licence_id = $1`,[id]))throw notFound('licence');
   return 'version_mismatch';
  },
  async insertIntent(row){await insert('broker_report_upload_intents',row as unknown as R,'intent_id');},
  async getIntent(id){const r=await one(`select * from ${rel('broker_report_upload_intents')} where intent_id = $1`,[id]);return r?intentFromRow(r):null;},
  async transitionIntent(id,from,to,patch){return (await update('broker_report_upload_intents',{status:to,...(patch??{})},'intent_id = $1 and status = $2',[id,from])).length>0;},
  async findDocumentBySha(sha){const r=await one(`select * from ${rel('broker_report_documents')} where sha256 = $1`,[sha]);return r?documentFromRow(r):null;},
  async getDocument(id){const r=await one(`select * from ${rel('broker_report_documents')} where document_id = $1`,[id]);return r?documentFromRow(r):null;},
  async insertDocument(row){
   try{await insert('broker_report_documents',{...row,status:'uploaded',promotion_pending:true},'document_id');return 'inserted';}
   catch(e){if(e instanceof BrokerResearchDbError&&e.code==='duplicate_key')return 'duplicate';throw e;}
  },
  async updateDocument(id,patch){await update('broker_report_documents',patch as R,'document_id = $1',[id]);},
  claimLease:(id,token,ttl)=>fn<boolean>('public.broker_document_claim_lease($1,$2,$3)',[id,token,ttl]),
  async fencedUpdateDocument(id,token,patch){const a=fencedArgs(patch);return fn<'ok'|'lease_lost'>('public.broker_document_fenced_update($1,$2,$3::jsonb,$4)',[id,token,a.patch,a.release]);},
  async insertRun(row){await insert('broker_report_runs',{...row,detail:row.detail??{}},'run_id');},
  finishRun:(id,token,patch)=>fn<'ok'|'lease_lost'>('public.broker_run_finish($1,$2,$3::jsonb)',[id,token,dropUndefined(patch as R)]),
  async getRun(id){const r=await one(`select * from ${rel('broker_report_runs')} where run_id = $1`,[id]);return r?runFromRow(r):null;},
  async listRuns(documentId){return (await q(`select * from ${rel('broker_report_runs')} where document_id = $1 order by started_at, run_id`,[documentId])).map(runFromRow);},
  async ensureReport(documentId,codeVersion){
   await q(`insert into ${rel('broker_research_reports')} (document_id, code_version) values ($1, $2) on conflict (document_id) do nothing`,[documentId,codeVersion]);
   return reportFromRow((await one(`select * from ${rel('broker_research_reports')} where document_id = $1`,[documentId]))!);
  },
  async getReport(id){const r=await one(`select * from ${rel('broker_research_reports')} where report_id = $1`,[id]);return r?reportFromRow(r):null;},
  async reportByDocument(id){const r=await one(`select * from ${rel('broker_research_reports')} where document_id = $1`,[id]);return r?reportFromRow(r):null;},
  async updateReportDraft(id,patch){await update('broker_research_reports',patch as R,'report_id = $1',[id]);},
  async extractCommit(documentId,token,runId,rows){return receiptFrom(await fn('public.broker_extract_commit($1,$2,$3,$4::jsonb)',[documentId,token,runId,JSON.stringify(rows)]));},
  async fieldReview(fieldId,action,payload,by){return receiptFrom(await fn('public.broker_field_review($1,$2,$3::jsonb,$4)',[fieldId,action,payload,by]));},
  async insertHumanField(reportId,row,by){const x=await fn<R>('public.broker_field_add($1,$2::jsonb,$3)',[reportId,row,by]);return {fieldId:String(x.field_id),receipt:receiptFrom(x.receipt)};},
  async upsertTargetOverride(row){return receiptFrom(await fn('public.broker_target_override($1,$2,$3,$4,$5,$6)',[row.report_id,row.target_key,row.security_ticker,row.issuer_id,row.set_by,row.note]));},
  async materialize(id){return receiptFrom(await fn('public.broker_report_materialize($1)',[id]));},
  async listFields(reportId,opts){
   return (await q(`select ${sqlColumns(FIELD_COLUMNS)} from ${rel('broker_report_fields')} where report_id = $1${opts?.includeSuperseded?'':' and superseded_by_run_id is null'} order by target_key nulls first, field, occurrence, created_at, field_id`,[reportId])).map(fieldFromRow);
  },
  async listTargets(reportId){return (await q(`select ${sqlColumns(TARGET_COLUMNS)} from ${rel('broker_report_targets')} where report_id = $1 order by target_key`,[reportId])).map(targetFromRow);},
  async bindAnalyst(row){await q(`insert into ${rel('broker_report_analysts')} (report_id, analyst_id, role, field_id) values ($1,$2,$3,$4) on conflict (report_id, analyst_id) do update set role = excluded.role, field_id = excluded.field_id`,[row.report_id,row.analyst_id,row.role,row.field_id]);},
  async insertRuleReceipt(row){return String((await insert('broker_report_rule_receipts',{...row,results:JSON.stringify(row.results)},'receipt_id')).receipt_id);},
  async insertSnippet(row){return String((await insert('broker_report_snippets',{...row,status:'draft'},'snippet_id')).snippet_id);},
  async setSnippetStatus(id,patch){await update('broker_report_snippets',patch as R,'snippet_id = $1',[id]);},
  async listSnippets(reportId){return (await q(`select * from ${rel('broker_report_snippets')} where report_id = $1 order by created_at, snippet_id`,[reportId])).map(snippetFromRow);},
  async insertSummary(row){return String((await insert('broker_report_summaries',row as unknown as R,'summary_id')).summary_id);},
  async setSummaryStatus(id,patch){await update('broker_report_summaries',patch as R,'summary_id = $1',[id]);},
  async listSummaries(reportId){return (await q(`select * from ${rel('broker_report_summaries')} where report_id = $1 order by generated_at, summary_id`,[reportId])).map(summaryFromRow);},
  async publishBlockers(id){return ((await fn<string[]|null>('public.broker_report_publish_blockers($1)',[id]))??[]).map(String);},
  async publish(id,by){return {publicationId:String(await fn('public.broker_report_publish($1,$2)',[id,by]))};},
  async unpublish(id,by,reason){await q(`select public.broker_report_unpublish($1,$2,$3)`,[id,by,reason]);},
  async getPublication(id){const r=await one(`select * from ${rel('broker_report_publications')} where publication_id = $1`,[id]);return r?publicationFromRow(r):null;},
  async upsertInstitution(row){
   const r=row.institution_id
    ?await one(`insert into ${rel('research_institutions')} (institution_id, name_en, name_zh, aliases, kind, rating_disclosure_url) values ($1,$2,$3,$4::text[],$5,$6) on conflict (institution_id) do update set name_en = excluded.name_en, name_zh = excluded.name_zh, aliases = excluded.aliases, kind = excluded.kind, rating_disclosure_url = excluded.rating_disclosure_url returning institution_id`,[row.institution_id,row.name_en,row.name_zh,`{${row.aliases.map(a=>JSON.stringify(a)).join(',')}}`,row.kind,row.rating_disclosure_url])
    :await one(`insert into ${rel('research_institutions')} (name_en, name_zh, aliases, kind, rating_disclosure_url) values ($1,$2,$3::text[],$4,$5) returning institution_id`,[row.name_en,row.name_zh,`{${row.aliases.map(a=>JSON.stringify(a)).join(',')}}`,row.kind,row.rating_disclosure_url]);
   return String(r!.institution_id);
  },
  async listInstitutions(){return (await q(`select * from ${rel('research_institutions')} order by name_en, institution_id`)).map(institutionFromRow);},
  async insertRatingScale(row){return String((await insert('research_rating_scales',row as unknown as R,'scale_id')).scale_id);},
  async closeRatingScale(id,validTo,by){if(!(await q(`update ${rel('research_rating_scales')} set valid_to = $2, closed_by = $3 where scale_id = $1 returning 1`,[id,validTo,by])).length)throw notFound('rating_scale');},
  async listRatingScales(inst){return (await q(`select * from ${rel('research_rating_scales')} where institution_id = $1 order by raw_label, valid_from, scale_id`,[inst])).map(scaleFromRow);},
  async upsertAnalyst(row){
   const variants=`{${row.name_variants.map(a=>JSON.stringify(a)).join(',')}}`;
   const r=row.analyst_id
    ?await one(`insert into ${rel('research_analysts')} (analyst_id, institution_id, display_name, name_variants, public_display) values ($1,$2,$3,$4::text[],$5) on conflict (analyst_id) do update set display_name = excluded.display_name, name_variants = excluded.name_variants, public_display = excluded.public_display returning analyst_id`,[row.analyst_id,row.institution_id,row.display_name,variants,row.public_display])
    :await one(`insert into ${rel('research_analysts')} (institution_id, display_name, name_variants, public_display) values ($1,$2,$3::text[],$4) returning analyst_id`,[row.institution_id,row.display_name,variants,row.public_display]);
   return String(r!.analyst_id);
  },
  async listAnalysts(inst){return (await q(`select * from ${rel('research_analysts')} where institution_id = $1 order by display_name, analyst_id`,[inst])).map(analystFromRow);},
  async reviewQueue(opts){return (await q(`select * from ${rel('broker_research_reports')} where status = 'draft' and review_status = any($1::text[]) order by updated_at, report_id limit $2`,[opts.status?[opts.status]:['pending','in_review'],opts.limit??DEFAULT_QUEUE_LIMIT])).map(reportFromRow);},
  async logAccess(row){await insert('broker_report_access_log',row as unknown as R,'id');},
  async listAccessLog(opts){return (await q(`select * from ${rel('broker_report_access_log')}${opts.documentId?' where document_id = $2':''} order by created_at desc, id desc limit $1`,opts.documentId?[opts.limit,opts.documentId]:[opts.limit])).map(accessFromRow);},
  async insertEvalReceipt(row){return String((await insert('broker_eval_receipts',row as unknown as R,'receipt_id')).receipt_id);},
  async latestEvalReceipt(digest){const r=await one(`select * from ${rel('broker_eval_receipts')} where behavior_digest = $1 order by ran_at desc, receipt_id desc limit 1`,[digest]);return r?evalFromRow(r):null;},
  async takePendingOutbox(limit){return (await q(`select * from ${rel('broker_outbox')} where status = 'pending' order by created_at, event_id limit $1`,[limit])).map(outboxFromRow);},
  async markOutbox(id,outcome){await q(`select public.broker_outbox_mark($1,$2,$3)`,[id,outcome.delivered,outcome.delivered?null:outcome.error]);},
  async upsertPurgeStep(documentId,step,outcome){await q(`select public.broker_purge_step_record($1,$2,$3,$4)`,[documentId,step,outcome.ok,outcome.ok?null:outcome.error]);},
  async purgeSteps(documentId){return (await q(`select * from ${rel('broker_purge_steps')} where document_id = $1 order by step`,[documentId])).map(purgeFromRow);},
  // ---- public: views only (the admin pool reads them exactly as anon would: owner rights, no caller-dependent predicate)
  async publicReports(filter){
   const v:unknown[]=[];const w:string[]=[];const bind=(x:unknown)=>{v.push(x);return `$${v.length}`;};
   if(filter.institutionId)w.push(`r.institution_id = ${bind(filter.institutionId)}`);
   if(filter.scope)w.push(`r.scope = ${bind(filter.scope)}`);
   if(filter.from)w.push(`r.published_date >= ${bind(filter.from)}::date`);
   if(filter.to)w.push(`r.published_date <= ${bind(filter.to)}::date`);
   if(filter.issuerId||filter.rating)w.push(`exists (select 1 from public.broker_report_targets_public_v t where t.report_id = r.report_id${filter.issuerId?` and t.issuer_id = ${bind(filter.issuerId)}`:''}${filter.rating?` and t.rating_normalized = ${bind(filter.rating)}`:''})`);
   if(filter.cursor)w.push(`(r.published_date, r.report_id) < (${bind(filter.cursor.publishedDate)}::date, ${bind(filter.cursor.reportId)}::uuid)`);
   const reports=await q(`select r.* from public.broker_reports_public_v r${w.length?` where ${w.join(' and ')}`:''} order by r.published_date desc, r.report_id desc limit ${bind(filter.limit)}`,v);
   if(!reports.length)return [];
   const ids=reports.map(r=>r.report_id);const insts=[...new Set(reports.map(r=>r.institution_id).filter(Boolean))];
   const [targets,summaries,snippets,institutions]=await Promise.all([
    q(`select ${sqlColumns(PUBLIC_TARGET_COLUMNS)} from public.broker_report_targets_public_v where report_id = any($1::uuid[])`,[ids]),
    q(`select report_id, lang from public.broker_report_summaries_public_v where report_id = any($1::uuid[])`,[ids]),
    q(`select report_id from public.broker_report_snippets_public_v where report_id = any($1::uuid[])`,[ids]),
    q(`select * from public.research_institutions_public_v where institution_id = any($1::uuid[])`,[insts]),
   ]);
   return bundles(reports,targets,summaries,snippets,institutions);
  },
  async publicReport(id){
   const report=await one(`select * from public.broker_reports_public_v where report_id = $1`,[id]);
   if(!report)return null;
   const [targets,citations,snippets,summaries,analysts,institutions]=await Promise.all([
    q(`select ${sqlColumns(PUBLIC_TARGET_COLUMNS)} from public.broker_report_targets_public_v where report_id = $1`,[id]),
    q(`select ${sqlColumns(PUBLIC_CITATION_COLUMNS)} from public.broker_report_citations_v where report_id = $1 order by target_key nulls first, field, occurrence`,[id]),
    q(`select * from public.broker_report_snippets_public_v where report_id = $1 order by page, snippet_id`,[id]),
    q(`select * from public.broker_report_summaries_public_v where report_id = $1 order by lang`,[id]),
    q(`select * from public.broker_analysts_public_v where report_id = $1 order by display_name`,[id]),
    report.institution_id?q(`select * from public.research_institutions_public_v where institution_id = $1`,[report.institution_id]):Promise.resolve([] as R[]),
   ]);
   const [b]=bundles([report],targets,summaries,snippets,institutions);
   return {...b,citations,snippets,summaries:summaries.map(publicRow),analysts};
  },
  async publicInstitutions(){return q(`select * from public.research_institutions_public_v order by name_en`);},
  async ratingHistory(opts){
   const v:unknown[]=[opts.securityTicker];let w='security_ticker = $1';
   if(opts.institutionId){v.push(opts.institutionId);w+=` and institution_id = $${v.length}`;}
   if(opts.currency){v.push(opts.currency);w+=` and target_currency = $${v.length}`;}
   v.push(opts.limit);
   return (await q(`select ${sqlColumns(HISTORY_COLUMNS)} from public.broker_rating_history_v where ${w} order by published_date desc, report_id desc limit $${v.length}`,v)).map(publicRow);
  },
 };
}
```

注：`J` 只把普通对象 JSON 化（jsonb 参数）；JS 数组原样作为 PostgreSQL 数组传入（`uuid[]`、`text[]`）。jsonb **数组**参数（`extractCommit` 的 `rows`、规则回执的 `results`）在调用处显式 `JSON.stringify`；`text[]` 列（`aliases`、`name_variants`）以数组字面量字符串 + `::text[]` 传入。

- [ ] **Step 4: 运行，确认通过**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/broker-research.integration.test.ts
npm test -- src/lib/broker-research/
```

Expected: 块 1–4 全 PASS；内存契约仍绿（两实现同一组 12 个用例）。若某个契约用例只在一边失败，**以 SQL 为准修内存实现**（规格：内存实现等价于触发器 / 函数），并在提交说明里写清差异。

- [ ] **Step 5: 全量门禁与提交**

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
npm test && npm run typecheck && npm run lint
```

实施记录追加 `| A5 | pgBrokerResearchDb；pg 契约（集成块 4）；生效值三方一致 | <sha> |`。

```bash
git add src/lib/broker-research/pg-db.ts src/lib/broker-research/broker-research.integration.test.ts docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "test(broker-research): pgBrokerResearchDb and the shared contract on real PostgreSQL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Part A 对后续 Part 的约定（执行 B/C/D/E 前必读）

1. **规则回执里的标题披露结果**（B4 `evaluateRules` / C6 `runRulesAfterChange` 必须产出）：对报告每个非空标题面各一条 `{rule:'disclosure', passed, blocking:false, target_key:null, reason_code: passed?null:'restricted_value', detail:{surface:'title_original'|'title_public'|'title_zh'|'title_en', hits}}`。`blocking` 必须为 `false`。
2. **规则回执的 `input_hash`** = 读到的 `reports.rules_input_hash`（物化后）。`updateReportDraft` 改了 `institution_id / scope / title_* / supersedes_report_id`，或者绑定 / 解绑分析师之后，服务必须先 `materialize` 再跑规则；否则阻断 `materialize_stale`。
3. **`upside/1`** = `round(target_price / price_at_report − 1, 6)`，是小数；R2 与披露检查按此比较（`memory-db.ts` 导出 `upside1`、`decimalCompare`，B4/B5 可直接复用，或者 import 后再移到共享模块）。
4. **复核动作 `absent`**：把该行置 `rejected`，并为同一身份插入一条人工 `absent` 行（`payload.page`，否则沿用原行页码）。C6 的 `markAbsent`（没有候选行时）用 `insertHumanField(status:'absent')`。
5. **评测阻断**只认 `corpus_kind='gold'`。C8 的 `pipeline.integration.test.ts` 在测试库里插入一条 `gold` 回执，并设置 `approved_gold_corpus_hash`（直接 SQL），不要依赖 `synthetic`（见修订建议 6）。
6. **`supabaseBrokerResearchDb({admin, anon})`**：公开路由传 `{anon:getAnonSupabase()}`，管理员路由传 `{admin:getAdminSupabase()}`；用错客户端时抛 `anon_client_required` / `admin_client_required`。
7. **测试库全局状态**：`broker_research_settings`（`public_enabled`、`approved_gold_corpus_hash`）是单行全局状态。凡是改它的集成测试文件，都必须在用例里用本文件自己的 `institution_id / report_id` 过滤断言，并在 `afterAll` 里复原（见风险 3）。

### 契约修订建议

1. **`SnippetRow` / `SummaryRow` 增加 `draft_reason:string|null`。** 规格 §4.1、§4.9 说"回草稿时 `detail.reason`"，但这两张表没有 `detail` 列。A1 加了 `draft_reason` 列（取值 `licence_version|analyst_disclosure|disclosure_inputs|summary_stale`）；三个实现返回的行都已经带这一列，只是类型里没声明。D4/D5 的"受影响片段 / 摘要计数"需要它。
2. **`BrokerDeps` 推迟到 C4 写入 `types.ts`。** 它 import 的 `./storage`（C1）和 `./ports/{f3,llm}`（C4）在 A4 时还不存在，typecheck 会失败。C4 的 Files 需要加上 `src/lib/broker-research/types.ts`。
3. **`BrokerResearchDb` 增加 `quarantineResolve(id, status:'resolved_accept'|'resolved_reject', by, payload):Promise<'resolved'|'not_found'|'already_resolved'>`**（rpc `broker_quarantine_resolve`）。目前契约里没有这个方法，C6 的 `quarantine-hook.ts` 只能绕开契约直接 rpc，内存单测也无法覆盖。`MemoryBrokerResearchDb` 已经实现它（是扩展接口上的方法）；supabase/pg 两个实现各加一行即可。
4. **`BrokerResearchDb` 增加 `setApprovedGoldCorpus(hash:string|null, by:string):Promise<void>`**（写 `approved_gold_corpus_hash/by/at`）。规格 §4.1 要求 owner 批准黄金集哈希，但契约里没有写入方法，现在只能用 SQL 写（测试 harness 就是这么做的）。
5. **`DisclosureCheck` 之外的标题披露结果**放在规则回执里（约定 1）。如果更希望放在报告列上（例如 `title_disclosure jsonb`），需要同时改 `ReportRow`、`updateReportDraft` 的 patch 和阻断函数；Part A 选择不改契约。
6. **规格 §12.4 与 §4.4 第 13 条矛盾：** pipeline 测试"插入 `synthetic` 回执后发布"，而阻断函数只认 `gold`。建议把 §12.4 改为"测试库插入 `gold` 回执并设置 `approved_gold_corpus_hash`"。
7. **outbox / 快照中的金额是十进制字符串**（`claim.target_price`、`reference_price`）。规格 §10.2 的示例是数字；F4 消费端需要按字符串解析。
8. **几处按意图实施、偏离规格字面的地方**（记入规格 §17）：
   - 阻断第 11 条比较的是"已存的三项摘要 vs 实时重算"，不是 `materialized_hash <> effective_hash`（后者两列同时写入，恒为假）。
   - 第 7 条 `field_pending` 不计已有生效行的身份。
   - 第 13 条字段覆盖只要求"有 LLM 生效行的字段"（不含人工行与 `absent`）。
   - `unpublish` 把 `review_status` 置回 `in_review`。
   - 第 15 条"未检查"的标题面也按不通过阻断。

### 风险与未决

1. **SQL 未实跑。** 三个迁移和四个集成块是按落地模式写成的，没有在本地 harness 上运行过。预计第一次运行会有语法或类型小错（最可能出在：`array_agg(distinct … order by …)`、`insert … with … select`、`on conflict` 对表达式唯一索引的推断、`jsonb_array_elements(...) e` 的列引用）。执行者按 Step 2/4 的循环修，**修改必须在该迁移锁定之前**。
2. **`claim.retract` 只发一次。** 唯一键是 `(claim_key, claim_seq)`，所以 `disclosure_ok` 先变 false、又恢复为 true 之后，该 claim 仍然是撤回状态，不会重新登记（重新登记需要新的 `publication_id`）。这符合 §10.2"同一 claim_key 只发一次 retract"，但意味着恢复披露需要先 unpublish 再 publish。
3. **测试文件并行。** `test:db` 默认按文件并行执行 vitest。本文件与 C8 的 `pipeline.integration.test.ts` 都会改 `broker_research_settings`（`public_enabled`、黄金集哈希）。断言已经按自己的报告 / 机构过滤，但"开关关闭时全部视图 0 行"（A3）这类全局断言，在 C8 同时打开开关时可能偶发失败。建议 C8 不切换 `public_enabled`，或者两个文件都用 `describe.sequential` + 文件级锁（`pg_advisory_lock`）。
4. **内存实现的简化**（文件头 5 条，以及 override 不推断发行人）可能让服务单测在内存上绿、在 pg 上红。A5 的共享契约用例覆盖了主路径；B/C 任务新增依赖内存行为时，应当把对应场景补进 `db-contract.ts`。
5. **`rules_input_hash` 覆盖面很宽**（含许可版本、分析师披露字段、标题）。任何一项变化都会让草稿进入 `materialize_stale → rules_stale`，需要重跑物化和规则。这是有意为之，但 C6/C7 的 UI 流程必须在这些编辑之后自动执行"物化 + 规则"，否则管理员会一直看到阻断。
6. **`broker_runs_parse_extractor` 要求 parse 运行在插入时就有 `extractor_version`。** C4 的 `F3Port` 需要在调用前给出版本号（伪 F3 可以直接给；生产 F3 端口要在 O13 签字时确认）。
7. **托管实例差异。** 视图依赖"迁移角色 = 表 owner，且 RLS 不对 owner 生效"；`session_replication_role=replica` 只在 A3 的一个本地测试里使用（需要超级用户），托管实例上不使用。
8. **体量。** 块 2/3 的 `ready()` 每次大约需要 30 条语句，A3 的个别用例会建 5–6 个已发布报告，`test:db` 总时长会明显增加。超时已设为 120–180 s。
