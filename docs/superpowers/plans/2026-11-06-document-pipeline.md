# F3 披露文档管道 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-document-pipeline-design.md`（第 6 稿；Codex 第五轮 R5-1–R5-13 已按原方案落入，§0 列出修订点）：全局文档库（`disclosure_documents` 及子表、私有桶 `disclosure-docs`）、三来源采集（EDGAR / 巨潮 / HKEXnews）、PDF/HTML 抽取与码点级引用、读接口、授权上传接口、港股财务事实候选 → 检查 → 决定 → 经规格二运行模型发布（`fact_citations` 证据随事实原子可见）。owner 决策取规格 §14 默认：A 港股范围 = `in_scope` 队列；B 巨潮/HKEX 只入库定期报告类；C 无审批行、全部人工决定；D 新依赖 `pdfjs-dist`（Vercel 冒烟失败则抽取与候选只在本机脚本运行）；E `file_size_limit = 52428800`；F 授权研报片段仅持有人可见；G 已由事实决定（规格二已落地）。

**Architecture:** 两个迁移（`20261108090000_disclosure_documents.sql`：九表 + 视图 + 桶 + 函数 + 触发器 + 权限；`20261108091000_fact_citations.sql`：`fact_citations`、`filing_documents`、规格二约束的加法扩展、HK 发布与证据函数）。`src/lib/documents/db.ts` 的 `DocumentsDb` 契约有 Supabase（rpc）/ 内存 / pg 三实现；港股事实经 `src/lib/documents/hk-facts/facts-port.ts` 的 `HkFactsPort` 调规格二（不改 `src/lib/facts/*` 已有文件）。采集、抽取、候选、晋升四个核心都只依赖注入的 db / store / 抓取函数，单测在内存实现上跑，离线集成测试在真实 PostgreSQL 上跑。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`、`tsx`、`pdfjs-dist`（4.x，legacy build）。计划一的 `TableClient`、`startBatch/finishBatch`、`quarantine()`、`recordAttempt` 用于批次/隔离/新鲜度；计划二的 `FactsDb`、`planFactWrites`、`readFacts` 用于港股事实。

实施按 owner 规则：Opus 5.5 指挥，**Sonnet 5.5 子代理写代码**，每个任务经 Opus 规格复审、质量复审与 Codex（gpt-6-astra，medium）审计与挑战；日志 `docs/audits/2026-11-06-document-pipeline/implementation-log.md`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4`，分支 `claude/document-pipeline-3cfbb4`。不要 cd 出去；不要裸 `git stash`；只动本任务 Files 列表里的文件。
- **协作边界（兄弟模块并行开发）**：不得修改 `src/lib/facts/*` 已有文件（可以 import；新文件只放 `src/lib/documents/`）、`src/lib/judgments/*`、`src/lib/evals/*`。不得替换规格二的 SQL 函数与触发器（迁移二只 `drop constraint if exists … add constraint …` 扩展检查约束、新增本规格自有函数）。对 `src/lib/dq/batches.ts::INFO_CODES`、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts::criticalSuites`、`vercel.json`、`package.json` 的改动放在**独立块**并加 `// F3` 注释（JSON 文件无注释：放在数组/对象末尾，提交信息说明），便于与兄弟分支合并。
- **迁移**：`supabase/migrations/20261108090000_disclosure_documents.sql`、`supabase/migrations/20261108091000_fact_citations.sql`；可重放（`create table if not exists`、`create or replace function`、`drop policy if exists` 后 `create policy`、`drop trigger if exists` 后 `create trigger`、`drop constraint if exists` 后 `add constraint`、桶 `insert … on conflict (id) do update`）。写入 `supabase/migrations.lock.json`（追加 `{file, sha256}`，文件字节 hex；**已锁文件不可再改**——锁在该任务全部复审通过后的最后一个提交里加）。`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移时间戳晚于已锁最新（当前 `20261106090000`）。
- **测试数据库**：`test:db`（`scripts/ci/research-db.ts`）起本地 PostgreSQL 17，按序执行全部迁移，再跑 vitest。集成测试用 `process.env.S4_TEST_STATE` 读 `adminUrl`，`describe.skipIf(!enabled)`。**任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 都必须加进 `criticalSuites`**，否则 "Database suite inventory drift"。重放迁移用计划一/二的 `replayMigration` 助手（复制到新测试文件，它未导出；见 `src/lib/facts/facts.integration.test.ts`）。真实角色测试按 `src/lib/facts/facts.integration.test.ts` 的 `set local role anon|authenticated|service_role` 写法。
- **单文件跑数据库测试**：`.claude/scratch/db-one.ts`（未提交；内容见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5，丢了按原文重建）：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/documents/documents.integration.test.ts`。
- **本地 harness 限制**：只有 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)`，迁移不得引用 `storage.objects`；没有 PostgREST（`max_rows=1000` 截断只在真实 Supabase）；托管实例 `postgres` 非超级用户（`security definer` owner = 迁移角色，`set search_path = public`，不要 `alter function … owner to`）。
- **权限模式**：所有新表 `revoke all on … from public, anon, authenticated, service_role`，再按规格 §4.12 授权。Supabase 默认给 anon/authenticated 新函数 EXECUTE：**每个函数后显式 `revoke execute on function … from public, anon, authenticated`**，再 `grant execute … to service_role`（`read_documents` 例外：anon/authenticated/service_role）。内部助手函数连 service_role 也 revoke。
- **database.types.ts**：手工维护；新表加 `Row/Insert/Update` 并登记到 `Database['public']['Tables']`，整块放在文件中一处并以 `// F3 document pipeline` 注释起止；RPC 不登记（`rpc(... as never)` 窄类型写法同 `src/lib/facts/db.ts`）。
- **服务端客户端**：`getAdminSupabase()`（service_role）、`getAnonSupabase()`（`src/lib/supabase/anon.ts`）、`getServerSupabase()`（会话）；管理员 `requireAdminUser()`（`src/lib/admin/auth.ts`）；管理写路由的 JSON 内容类型与 Origin 校验照抄 `src/app/api/admin/dq/quarantine/[id]/route.ts`；cron 的 `authorized()` 照抄 `src/app/api/cron/facts-sync/route.ts`（含 `VERCEL_GIT_COMMIT_SHA` 缺失 → 503）。
- **数值**：港股值一律十进制字符串；`src/lib/documents/decimal.ts` 做字符串乘 10 的幂与带符号加减；检查用 `hk-facts/exact.ts`（BigInt 定标）；规范形式用 `src/lib/facts/json-numbers.ts::canonicalDecimal`（import，不改）。任何财务值不经 `Number`。
- **码点**：所有字符偏移是 Unicode 码点（`Array.from(text)`），与 PostgreSQL `length/substr` 一致；禁止 `String.prototype.slice/substring/length` 参与偏移计算（夹具含增补平面汉字 `𠀋` 与 emoji `😀`）。
- **提交**：`git commit` **单独一条命令**（钩子拦截同一命令里任何 `-n` 记号，包括 `grep -n`、`head -n`）；信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理）或 `Claude Opus 5.5`（指挥）；不得 `--no-verify`。
- **命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）；`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`、`… npm run test:migrations`（`LC_ALL=C` 只给这两个，**不要导出给 `npm test`**）。Codex 自己跑 vitest 报 `__dirname is not defined` 是其 `--configLoader runner` 问题，忽略。
- **代码风格**：`src/lib/facts`、`src/lib/dq` 的紧凑风格（单空格缩进、少空行、`interface` 单行可接受）；每个文件顶部一段注释说明职责与规格条目（`spec §x.y`）。
- **环境变量**：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`CRON_SECRET`、`EDGAR_USER_AGENT`（缺省 `DEFAULT_USER_AGENT`，`src/lib/research/ingest/collectors/shared.ts`）、`VERCEL_GIT_COMMIT_SHA`、`DOCUMENTS_EXTRACT_ENABLED`（`'1'` 才让 cron 抽取/候选路由工作；冒烟前不开，§12 降级）。
- **网络**：单测与 CI 不联网。真实网络只在脚本（`record-fixture.ts`、`--dry-run` 冒烟、`validate-extraction.ts`）里，由指挥在执行期手动跑。

## 文件结构

```
supabase/migrations/20261108090000_disclosure_documents.sql   迁移一（Task 1）
supabase/migrations/20261108091000_fact_citations.sql         迁移二（Task 13）
supabase/migrations.lock.json                                 追加 2 条（Task 1、13）
src/lib/supabase/database.types.ts                            + F3 块（Task 1、13）
src/lib/dq/batches.ts                                         INFO_CODES += F3 块（Task 14）
scripts/ci/research-checks.ts                                 criticalSuites += F3 块（Task 1、13、18）
package.json / package-lock.json                              + pdfjs-dist（Task 4）
vercel.json                                                   + 3 条 documents-sync（Task 8）；extract/candidates 条目在冒烟通过后由指挥加（Task 19）
src/lib/documents/types.ts          共享契约（本文件 §共享契约 原样落地；Task 2）
src/lib/documents/db.ts             DocumentsDbError 归一、supabaseDocumentsDb、游标编解码、行归一（Task 2）
src/lib/documents/memory-documents-db.ts   memoryDocumentsDb（Task 2）
src/lib/documents/db-contract.ts    documentsDbContract（内存与 pg 共用；非测试文件；Task 2）
src/lib/documents/pg-documents-db.ts       pgDocumentsDb(pool)（Task 3）
src/lib/documents/object-store.ts   ObjectStore 两实现 + blobPath/pagesJsonPath（Task 4）
src/lib/documents/decimal.ts        十进制字符串算术（Task 4）
src/lib/documents/classify.ts       classify + CLASSIFIER_GEN + cnDate（Task 5）
src/lib/documents/scope.ts          reconcileDocumentScope（Task 5）
src/lib/documents/sources/{shared,edgar,cninfo,hkexnews}.ts   段、列表、抓取（Task 6）
src/lib/documents/sync.ts           runDocumentsSync（Task 7）
src/lib/documents/deps.ts           productionDocumentsDeps / resolveCodeVersion 复用（Task 8）
src/lib/documents/extract/{pdf,tables,html,pages-json}.ts    抽取（Task 9）
src/lib/documents/citations.ts      cite / verify / citationView（Task 10）
src/lib/documents/extract/run.ts    runDocumentsExtract（Task 10）
src/lib/documents/read-route.ts     读路由共用参数/缓存/行形状（Task 11）
src/lib/documents/upload.ts         ingestUpload / readOwnedDocument（Task 12）
src/lib/documents/hk-facts/facts-port.ts   HkFactsPort 三实现（Task 13）
src/lib/documents/hk-facts/{exact,locate,period,scale,labels,values,generate}.ts   候选生成（Task 14）
src/lib/documents/hk-facts/checks.ts       确定性检查（Task 15）
src/lib/documents/candidates/run.ts        runDocumentsCandidates 三阶段（Task 15 阶段 1–2；Task 16 接入阶段 3）
src/lib/documents/hk-facts/promote.ts      runHkFactsSync（Task 16）
src/lib/documents/hk-facts/resolve.ts      resolveHkFactsItem + finalizeHkHooks（Task 17）
src/lib/documents/fixtures/{pdf,hkex,edgar,gold}/…              夹具
src/lib/documents/*.test.ts、**/*.test.ts                        单测
src/lib/documents/documents.integration.test.ts                 迁移一（critical；Task 1、3）
src/lib/documents/fact-citations.integration.test.ts            迁移二（critical；Task 13）
src/lib/documents/sync-hk.integration.test.ts                   港股端到端（critical；Task 18）
src/lib/documents/sync-us.integration.test.ts                   美股文档（critical；Task 18）
src/app/api/cron/documents-sync/route.ts                        Task 8
src/app/api/cron/documents-extract/route.ts                     Task 10
src/app/api/cron/documents-candidates/route.ts                  Task 16
src/app/api/documents/[ticker]/route.ts                         Task 11
src/app/api/documents/doc/[id]/route.ts、…/pages/[n]/route.ts、…/file/route.ts   Task 11（持有人分支 Task 12）
src/app/api/citations/[id]/route.ts                             Task 11
src/app/api/citations/route.ts（?factId=）                       Task 17
src/app/api/admin/documents/[id]/reprocess/route.ts             Task 11
src/app/api/admin/documents/candidates/route.ts、…/[id]/route.ts、…/regenerate/route.ts、src/app/api/admin/documents/approvals/route.ts、src/app/api/admin/documents/hk-quarantine/[id]/route.ts   Task 17
messages/{zh,en}/documents.json                                 Task 11
scripts/documents/{sync,extract,candidates,promote-hk,record-fixture,eval-hk-facts,validate-extraction,smoke-pdf}.ts   Task 8/10/15/16/10/18/18/4
docs/runbooks/document-pipeline.md                              Task 19
docs/audits/2026-11-06-document-pipeline/implementation-log.md  每个任务追加一行
docs/superpowers/specs/2026-11-04-document-pipeline-design.md   §17 偏差（Task 19）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/documents/types.ts` 原样落地）

```ts
// src/lib/documents/types.ts
// Shared contract of the document pipeline (plan F3 §共享契约, spec §4). Every task uses these
// names verbatim. DocumentsDb has three implementations: supabaseDocumentsDb (db.ts, rpc + read-only
// from()), memoryDocumentsDb (memory-documents-db.ts, unit tests), pgDocumentsDb (pg-documents-db.ts,
// integration tests). Row types mirror the SQL columns (snake_case); timestamps are ISO strings,
// dates 'YYYY-MM-DD'.
export const EXTRACTOR_VERSION='docs-extract/1.0';
export const TABLE_ALGO_VERSION='tables/1.0';
export const CLASSIFIER_GEN=1;
export const HK_LABEL_GEN=1;
export const HK_RULES_VERSION='hk-facts/1.0';
export const HK_EXTRACTOR_REF=`hk-facts/${HK_LABEL_GEN}/${HK_RULES_VERSION}`;   // 'hk-facts/1/hk-facts/1.0'
export const HK_PUB_GEN=1;
export const MAX_DOC_BYTES=52428800;
export const DOCS_BUCKET='disclosure-docs';
export const PAGE_LIMIT_MAX=1000;

export type DocSource='edgar'|'cninfo'|'hkexnews'|'upload';
export type ListedSource=Exclude<DocSource,'upload'>;
export type DocMarket='US'|'CN'|'HK'|'other';
export type DocClass='annual_report'|'interim_report'|'quarterly_report'|'results_announcement'|'current_report'|'registration'|'proxy'|'ownership'|'other';
export type DocStatus='stored'|'extracted'|'no_text_layer'|'extract_failed';
export type Permission='public'|'licensed'|'private';
export type DocMime='application/pdf'|'text/html'|'application/xhtml+xml'|'application/xml'|'text/xml'|'application/json';
export type FiscalPeriod='FY'|'H1'|'Q1'|'Q3';
export type CandidatesRole='none'|'primary'|'comparison';
export type CandidatesStatus='n/a'|'pending'|'done'|'failed'|'exhausted';
export type CandidateKind='financial_fact'|'table_cell'|'field';
export type ExtractorKind='rule'|'llm';
export type CandidateStatus='candidate'|'confirmed'|'rejected'|'promoted';
export type DecisionKind='human'|'auto';
export type PublicationState='staged'|'published'|'abandoned';
export type CitationCreator='extractor'|'human'|'llm'|'module';
export type CitationRole='value'|'label'|'period'|'unit';
export type AssetRole='filing_index'|'xbrl_instance'|'exhibit';

export interface Page<T>{rows:T[];nextCursor:string|null}
export interface PageOpts{cursor?:string|null;limit:number}

export interface Acquisition{fetched_at?:string;http_status?:number;content_type?:string|null;content_length?:number|null;etag?:string|null;last_modified?:string|null;user_agent?:string;uploaded_at?:string;filename?:string}
export interface DocumentRow{
 document_id:string;issuer_id:string|null;source:DocSource;market:DocMarket;source_ref:string;source_version:number;
 supersedes_document_id:string|null;observed_replacement:boolean;form_type:string|null;doc_class:DocClass;classifier_gen:number;
 title:string;language:'zh'|'en'|null;source_url:string|null;content_sha256:string;bytes:number;mime:DocMime;storage_path:string;
 acquisition:Acquisition;published_at:string;published_at_precision:'instant'|'date';available_at:string;available_date:string;
 fiscal_year:number|null;fiscal_period:FiscalPeriod|null;period_end:string|null;filing_source_ref:string|null;
 permission:Permission;owner_user_id:string|null;license_ref:string|null;status:DocStatus;current_extraction_id:string|null;
 extract_lease_until:string|null;extract_lease_batch_id:string|null;extract_attempts:number;batch_id:string;code_version:string;created_at:string;
}
/** insert_document_version p_doc / insert_upload_document p_doc: the writer-side fields (document_id, version, supersedes, observed_replacement, status, created_at come from the function). */
export type DocumentInsert=Omit<DocumentRow,'document_id'|'source_version'|'supersedes_document_id'|'observed_replacement'|'status'|'current_extraction_id'|'extract_lease_until'|'extract_lease_batch_id'|'extract_attempts'|'created_at'>;
export interface AssetRow{asset_id:string;document_id:string;role:AssetRole;filename:string;source_url:string;content_sha256:string;bytes:number;mime:string;storage_path:string;acquisition:Acquisition;created_at:string}
export type AssetInsert=Omit<AssetRow,'asset_id'|'document_id'|'created_at'>;
export interface InsertVersionResult{outcome:'inserted'|'versioned'|'duplicate';document_id:string}

export interface ExtractionRow{
 extraction_id:string;document_id:string;extractor_version:string;table_algo_version:string;code_version:string;has_text_layer:boolean;page_count:number;
 pages_json_path:string;pages_json_sha256:string;candidates_role:CandidatesRole;candidates_status:CandidatesStatus;candidates_attempts:number;
 candidates_lease_until:string|null;candidates_lease_batch_id:string|null;batch_id:string;created_at:string;
}
/** finish_document_extract p_extraction (role/status are decided inside the function, spec §7.3). */
export interface ExtractionInsert{extractor_version:string;table_algo_version:string;code_version:string;has_text_layer:boolean;page_count:number;pages_json_path:string;pages_json_sha256:string}
export interface PageRow{extraction_id:string;page_no:number;text:string;text_hash:string;char_count:number;width:number|null;height:number|null;line_count:number;has_tables:boolean}
export type PageInsert=Omit<PageRow,'extraction_id'>;

export interface CitationRow{
 citation_id:string;document_id:string;extraction_id:string;page_no:number;char_start:number;char_end:number;
 bbox:{x0:number;y0:number;x1:number;y1:number}|null;snippet:string;text_hash:string;visibility:'internal'|'public';
 created_by:CitationCreator;created_ref:string;created_at:string;
}
export type CitationInsert=Omit<CitationRow,'citation_id'|'visibility'|'created_at'>;

export interface PeriodEvidence{role:'statement_title'|'column_header';citation_id:string}
export interface FactCitations{value:string;label:string;unit:string;period:PeriodEvidence[]}
export interface FinancialFactPayload{
 concept:string;statement:'IS'|'BS'|'CF';period_start:string|null;period_end:string;duration:'6M'|'12M'|'INSTANT';
 value:string;presented:string;unit:string;scale:'1'|'0.01'|'1000'|'1000000';sign_flip:boolean;
 period_derivation:{rule:'title_duration'|'title_year_substitution'|'column_date'|'title_instant';title_date:string;column_text:string};
 consolidation:'consolidated';
}
export interface CheckResult{check:string;blocking:boolean;passed:boolean|null;detail?:Record<string,unknown>}   // passed=null ⇒ 'unavailable'/'skipped' (non-blocking only)
export interface InputSnapshot{content_sha256:string;pages_json_sha256:string;page_nos:number[];extractor_version:string;table_algo_version:string;code_version:string;hk_label_gen?:number;hk_rules_version?:string;model_id?:string;prompt_version?:string}
export interface CandidateRow{
 candidate_id:string;document_id:string;extraction_id:string;kind:CandidateKind;extractor_kind:ExtractorKind;extractor_ref:string;natural_key:string;
 citations:FactCitations|Record<string,unknown>;payload:FinancialFactPayload|Record<string,unknown>;fingerprint:string;
 checks:CheckResult[];checks_passed:boolean;status:CandidateStatus;decision_kind:DecisionKind|null;decided_by:string|null;approval_id:string|null;
 decided_at:string|null;inherited_from:string|null;input_snapshot:InputSnapshot;batch_id:string;created_at:string;
}
export type CandidateInsert=Pick<CandidateRow,'kind'|'extractor_kind'|'extractor_ref'|'natural_key'|'citations'|'payload'|'fingerprint'|'input_snapshot'>;
export interface PublicationRow{candidate_id:string;pub_gen:number;run_id:string;fact_id:string;state:PublicationState;created_at:string;updated_at:string}
export interface ApprovalRow{approval_id:string;extractor_ref:string;extractor_version:string;table_algo_version:string;code_version:string;concepts:string[];gold_sha256:string;precision:string;recall:string;report_path:string;approved_by:string;approved_at:string;revoked_at:string|null}
export interface DocScopeCursor{segment:string|null;index:number;item_attempts:number}
export interface DocScopeRow{
 issuer_id:string;source:ListedSource;reasons:string[];priority:number;fetch_key:string;backfill_cursor:DocScopeCursor|Record<string,never>;backfill_done:boolean;
 poll_cursor:DocScopeCursor|Record<string,never>;next_due_at:string;lease_until:string|null;lease_batch_id:string|null;
 last_attempt_at:string|null;last_success_at:string|null;last_status:'success'|'failed'|null;updated_at:string;
}
export interface DocScopeInput{issuer_id:string;reasons:string[];priority:number;fetch_key:string}

export type HumanDecision={kind:'human';decided_by:string;status:'confirmed'|'rejected'|'candidate'};
export type AutoDecision={kind:'auto';approval_id:string};
export interface CandidatesFilter{source?:ListedSource;issuer_id?:string;document_id?:string}

export type DocumentsDbErrorCode='lease_lost'|'not_eligible'|'revision_exists'|'evidence_incomplete'|'approval_revoked'|'not_publishable'|'invalid_citation'|'decided'|'already_staged'|'binding_conflict'|'invalid_expected_rev'|'stale_plan'|'not_hk_item'|'run_pending'|'invalid_chosen'|'item_not_open'|'too_many_approvals'|'not_found'|'invalid_input'|'unknown';
export class DocumentsDbError extends Error{constructor(public code:DocumentsDbErrorCode,message?:string){super(message??code);this.name='DocumentsDbError';}}

export interface DocumentsDb{
 // writes (rpc, one per §4.8 function of migration one)
 reconcileScope(source:ListedSource,rows:DocScopeInput[]):Promise<number>;
 claimSyncLease(issuer:string,source:ListedSource,batch:string,ttlSeconds:number):Promise<boolean>;
 insertDocumentVersion(issuer:string,source:ListedSource,batch:string,doc:DocumentInsert,assets:AssetInsert[]):Promise<InsertVersionResult>;
 insertUploadDocument(owner:string,doc:DocumentInsert):Promise<InsertVersionResult>;
 advanceCursor(issuer:string,source:ListedSource,batch:string,mode:'backfill'|'poll',cursor:DocScopeCursor|null,done:boolean):Promise<void>;
 releaseSyncLease(issuer:string,source:ListedSource,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
 reclassifyDocument(document:string,patch:Partial<Pick<DocumentRow,'doc_class'|'classifier_gen'|'fiscal_year'|'fiscal_period'|'period_end'|'filing_source_ref'>>,actor:string):Promise<void>;
 claimExtractLease(document:string,batch:string,ttlSeconds:number):Promise<boolean>;
 finishExtract(document:string,batch:string,extraction:ExtractionInsert,pages:PageInsert[]):Promise<string>;
 failExtract(document:string,batch:string,code:string):Promise<void>;
 requestExtract(document:string,actor:string):Promise<void>;
 claimCandidatesLease(extraction:string,batch:string,ttlSeconds:number):Promise<boolean>;
 finishCandidates(extraction:string,batch:string,status:'done'|'failed'):Promise<void>;
 requestCandidatesRegen(filter:CandidatesFilter,actor:string):Promise<number>;
 writeCandidateChecks(extraction:string,batch:string,rows:{candidate_id:string;checks:CheckResult[];checks_passed:boolean}[]):Promise<{written:number;inherited:number}>;
 insertCitation(row:CitationInsert):Promise<string>;
 publishCitations(ids:string[]):Promise<number>;
 insertCandidates(extraction:string,batch:string,rows:CandidateInsert[]):Promise<{inserted:number}>;
 decideCandidate(candidate:string,decision:HumanDecision|AutoDecision):Promise<{status:CandidateStatus}>;
 stageCandidatePublication(candidate:string,pubGen:number,run:string,factId:string):Promise<void>;
 insertApproval(row:Omit<ApprovalRow,'approval_id'|'approved_at'|'revoked_at'>):Promise<string>;
 revokeApproval(approvalId:string):Promise<void>;
 // reads: paged, or bounded with an explicit limit
 documentVersions(source:DocSource,sourceRef:string,page:PageOpts):Promise<Page<DocumentRow>>;
 knownSourceRefs(issuer:string,source:ListedSource,refs:string[]):Promise<Set<string>>;            // refs chunked ≤ 500
 readDocuments(issuer:string,opts:{asOf:string;source?:DocSource;docClass?:DocClass;from?:string;to?:string;allVersions?:boolean}&PageOpts):Promise<Page<DocumentRow>>;
 documentById(id:string):Promise<DocumentRow|null>;
 assetsOf(documentId:string):Promise<AssetRow[]>;                                                  // ≤ 100 (unique per role/filename)
 extractionsOf(documentId:string,page:PageOpts):Promise<Page<ExtractionRow>>;
 extractionById(id:string):Promise<ExtractionRow|null>;
 pagesOf(extractionId:string,pageNos:number[]):Promise<PageRow[]>;                                 // ≤ 100 page numbers
 citationById(id:string):Promise<CitationRow|null>;
 citationsByIds(ids:string[]):Promise<CitationRow[]>;                                              // ≤ 100
 candidatesOf(where:{extractionId:string}|{status:CandidateStatus}|{issuerId:string;status?:CandidateStatus},page:PageOpts):Promise<Page<CandidateRow>>;
 candidateById(id:string):Promise<CandidateRow|null>;
 publicationsOf(where:{candidateIds:string[]}|{runId:string}|{issuerId:string;pubGen:number;state?:PublicationState},page:PageOpts):Promise<Page<PublicationRow>>;
 approvalsFor(extractorRef:string,opts:{limit:number}):Promise<ApprovalRow[]>;                    // > limit rows → DocumentsDbError('too_many_approvals')
 storedDue(limit:number):Promise<DocumentRow[]>;
 candidatesDue(limit:number):Promise<ExtractionRow[]>;
 scopeDue(source:ListedSource,now:string,limit:number):Promise<DocScopeRow[]>;
 scopeRows(source:ListedSource,issuerIds:string[]):Promise<DocScopeRow[]>;
}
export interface ObjectStore{
 put(path:string,bytes:Uint8Array,mime:string):Promise<'created'|'exists'>;
 get(path:string):Promise<Uint8Array>;
 head(path:string):Promise<{bytes:number}|null>;
 signedUrl(path:string,expiresSeconds:number):Promise<string>;
}

// pages.json (spec §7.2); offsets are code points relative to the page text
export interface LayoutLine{index:number;y:number;x0:number;x1:number;text:string;char_start:number;char_end:number}
export interface LayoutCell{row:number;col:number;text:string;bbox:{x0:number;y0:number;x1:number;y1:number}|null;line_index:number;char_start:number;char_end:number;numeric:boolean}
export interface LayoutTable{header_lines:LayoutLine[];cells:LayoutCell[];row_count:number;col_count:number;col_x0:number[]}
export interface PageLayout{page_no:number;width:number|null;height:number|null;text:string;lines:LayoutLine[];tables:LayoutTable[]}
export interface PagesJson{extractor_version:string;table_algo_version:string;code_version:string;content_sha256:string;has_text_layer:boolean;pages:PageLayout[]}
```

`HkFactsPort`（Task 13，`src/lib/documents/hk-facts/facts-port.ts`）不进 `types.ts`，签名如下（跨 Part 必须按此调用）：

```ts
export type HkMarket='HK';
export interface HkFilingInsert{filing_id:string;issuer_id:string;source:'hkex';origin:'hkex';formType:'annual'|'semiannual';fiscalYear:number|null;fiscalPeriod:'FY'|'H1'|null;periodEnd:string|null;availableDate:string;sourceRef:string;url:string|null}
export interface HkFactsPort{
 // pass-through to spec-2 rpc with market='HK' (cast lives only in this file)
 claimLease(issuer:string,batch:string,ttlSeconds:number):Promise<boolean>;
 beginRun(issuer:string,batch:string,mappingGen:number):Promise<string>;
 stageFilings(run:string,rows:HkFilingInsert[]):Promise<Map<string,string>>;
 stageFacts(run:string,rows:FactInsert[]):Promise<number>;                // FactInsert from src/lib/facts/types (market typed 'US'|'CN'; port casts)
 quarantineFacts(run:string,factIds:string[],itemId:string):Promise<number>;
 abandonRun(run:string):Promise<void>;
 releaseLease(issuer:string,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
 readFacts(issuer:string,opts:ReadFactsOptions):Promise<ReadFactsResult>;
 factsByIds(ids:string[]):Promise<FactRow[]>;
 openConflicts(issuer:string):Promise<ConflictItem[]>;
 runStatus(run:string):Promise<'staged'|'published'|'abandoned'|null>;
 // F3-owned functions of migration two
 ensureHkScope(issuer:string,fetchKey:string):Promise<void>;
 bindFilingDocuments(run:string,rows:{filing_id:string;document_id:string}[]):Promise<number>;
 insertFactCitations(run:string,rows:{fact_id:string;citation_id:string;role:CitationRole}[]):Promise<number>;
 publishHkRun(issuer:string,batch:string,run:string,manifest:string[],expectedRev:number):Promise<number>;
 finishCandidatePublications(run:string):Promise<{published:number;still_staged:number;abandoned:number}>;
 abandonCandidatePublications(run:string):Promise<number>;
 promotionDue(pubGen:number,limit:number):Promise<{issuerId:string}[]>;
 zeroOutputDocuments(issuer:string,pubGen:number):Promise<string[]>;      // document ids hitting promotionDue condition (d) for this issuer
 resolveHkFactsQuarantine(item:string,chosen:string[],resolvedBy:string):Promise<{promoted:number;skipped:number;chosenFactIds:string[]}>;
 citationsOfFact(factId:string):Promise<{role:CitationRole;citation_id:string}[]>;
 hkFilingOfDocument(documentId:string):Promise<{filing_id:string;mapping_gen:number}|null>;
}
export function supabaseHkFactsPort(admin:SupabaseClient):HkFactsPort;
export function pgHkFactsPort(pool:Pool):HkFactsPort;
export function memoryHkFactsPort(facts:MemoryFactsDb,docs:MemoryDocumentsDb):HkFactsPort;
```

### 契约补充（各 Part 在各自文件定义；跨 Part 必须按此签名）

| 文件（任务） | 导出 | 签名 / 形状 |
|---|---|---|
| `db.ts`（2） | `toDocumentsDbError(e:{message?;code?})`、`encodeCursor(parts:(string|number)[])`、`decodeCursor(c):(string|number)[]`、`chunk`、`supabaseDocumentsDb(client):DocumentsDb` | 错误码从 SQL 异常消息首词（`raise exception 'lease_lost'`）归一；未知 → `'unknown'` |
| `memory-documents-db.ts`（2） | `memoryDocumentsDb(opts?:{now?:()=>Date}):MemoryDocumentsDb` | `MemoryDocumentsDb extends DocumentsDb{setNow(iso|null);expireSyncLease(issuer,source);expireExtractLease(doc);expireCandidatesLease(extraction);documents():DocumentRow[];extractions():ExtractionRow[];pages():PageRow[];citations():CitationRow[];candidates():CandidateRow[];publications():PublicationRow[];approvals():ApprovalRow[];scope():DocScopeRow[];assets():AssetRow[];_raw:{…可变 Map，供 memoryHkFactsPort}}` |
| `db-contract.ts`（2） | `documentsDbContract(label,setup:()=>Promise<DocsContractHarness>)`、`DocsContractHarness={db:DocumentsDb;issuerId:string;batchId:()=>Promise<string>;expire(kind,…)}`、`docInsert(o?)`、`assetInsert(o?)` | 内存与 pg 共用 |
| `pg-documents-db.ts`（3） | `pgDocumentsDb(pool:Pool):DocumentsDb` | 仅测试 |
| `object-store.ts`（4） | `supabaseObjectStore(client,bucket=DOCS_BUCKET)`、`memoryObjectStore()`（附 `objects():Map`）、`blobPath(sha256,mime)`、`pagesJsonPath(contentSha,pagesSha)`、`extOfMime(mime)` | `put` 把"已存在"归一为 `'exists'` |
| `decimal.ts`（4） | `scaleDecimal(digits:string,scale:'1'|'0.01'|'1000'|'1000000'):string`、`negate(d)`、`addDecimal(a,b)`、`subDecimal(a,b)`、`isDecimal(s)`、`parsePresented(cell:string):{digits:string;negative:boolean}|'dash'|null` | 结果经 `canonicalDecimal` |
| `classify.ts`（5） | `classify(source,input:{form_type?;title;headline?;source_ref}):{doc_class;fiscal_year;fiscal_period;period_end;filing_source_ref;language}`、`cnDate(s):string|null`、`CLASSIFIER_GEN`（re-export） | |
| `scope.ts`（5） | `reconcileDocumentScope(deps:{tables:TableClient;db:Pick<DocumentsDb,'reconcileScope'|'scopeRows'>},source:ListedSource,opts?:{today?}):Promise<{desired:number;retired:number}>`、`hkFetchKey(issuer)`、`cninfoFetchKey(code,orgId)` | 复用 `src/lib/facts/scope.ts::currentSecurities`（import） |
| `sources/shared.ts`（6） | `Segment={id:string;from:string;to:string}`、`Listed={source_ref;source_url;title;form_type:string|null;headline?:string;published_at:string;precision:'instant'|'date';assets?:{role:AssetRole;filename:string;url:string;required:boolean}[]}`、`Budget={deadline:Date|null;remainingMs():number}`、`FetchedBytes={bytes:Uint8Array;mime:string;status:number;headers:Record<string,string>;fetchedAt:string}`、`fetchBytes(url,budget,maxBytes,opts?):Promise<FetchedBytes|'too_large'|'not_found'>`、`SourceAdapter={source;segments(scope,mode,sinceYear,now):Segment[];list(scope,segment,budget):Promise<Listed[]>}` | `fetchBytes` 429/503 退避 1→2→4→8 s；超时 `min(60s, remaining−20s)` |
| `sources/{edgar,cninfo,hkexnews}.ts`（6） | `edgarAdapter(opts)`、`cninfoAdapter(opts)`、`hkexnewsAdapter(opts)`，各返回 `SourceAdapter` | |
| `sync.ts`（7） | `runDocumentsSync(deps:SyncDeps,opts:{source;limit;issuerIds?;sinceYear;refetch?;dryRun;triggeredBy;maxPerIssuer?}):Promise<DocSyncReceipt>`、`SyncDeps={db;tables;store;adapter:SourceAdapter;fetchBytes;now;deadline;codeVersion:string|null;userAgent:string}` | `DocSyncReceipt={batchId;status;counts;errors;issuers:{issuerId;outcome;code?;counts}[];idle}` |
| `deps.ts`（8） | `productionDocumentsDeps(source,{deadline,codeVersion}):SyncDeps`、`productionExtractDeps(…)`、`productionCandidatesDeps(…)`、`documentsCodeVersion()` | 后者委托 `src/lib/facts/sync.ts::resolveCodeVersion` |
| `extract/pdf.ts`（9） | `extractPdf(bytes,budget):Promise<{pages:PageLayout[];hasTextLayer:boolean}>` | |
| `extract/tables.ts`（9） | `detectTables(lines:LayoutLine[]):LayoutTable[]`、`isNumericItem(s)` | |
| `extract/html.ts`（9） | `extractHtml(bytes):PageLayout[]` | |
| `extract/pages-json.ts`（9） | `buildPagesJson(…):{json:PagesJson;bytes:Uint8Array;sha256:string}`、`pageInsertsOf(json):PageInsert[]`、`sha256Hex(bytes)`、`cpLength(s)`、`cpSlice(s,start,end)` | |
| `citations.ts`（10） | `cite(db,input:{document_id;extraction_id;page_no;char_start;char_end;bbox?;created_by;created_ref}):Promise<string>`、`verify(db,citationId):Promise<{integrity:'ok'|'corrupt';currentExtraction:boolean}|null>`、`citationView(db,citation)` | |
| `extract/run.ts`（10） | `runDocumentsExtract(deps:ExtractDeps,opts:{limit;documentIds?;dryRun;triggeredBy}):Promise<ExtractReceipt>`、`ExtractDeps={db;tables;store;extractPdf;extractHtml;now;deadline;codeVersion}` | |
| `read-route.ts`（11） | `docParams`、`publicDocumentView(row)`、`cacheHeadersFor(kind,asOf,now)`、`resolveDocIssuer(ticker,today)` | HK ticker（`.HK`）在此支持（文档路由不受规格二公共路由限制） |
| `upload.ts`（12） | `ingestUpload(deps,{ownerUserId,bytes,filename,mime,permission,license?,issuerId?,title?})`、`readOwnedDocument(deps,{documentId,requester,route,…})` | |
| `hk-facts/exact.ts`（14） | `toScaled(a:string,b:string):{a:bigint;b:bigint;scale:number}`、`exactIdentity(left,right,tol:{num:bigint;den:bigint}):{passed:boolean;diff:string}`、`sumDecimals(xs:string[]):string` | |
| `hk-facts/generate.ts`（14） | `generateHkCandidates(pages:PagesJson,ctx:{document:DocumentRow;extraction:ExtractionRow;cite:(…)=>Promise<string>}):Promise<{candidates:CandidateInsert[];info:BatchError[]}>` | 引用先于候选 |
| `hk-facts/checks.ts`（15） | `runHkChecks(candidates:CandidateRow[],ctx:CheckContext):{candidate_id;checks;checks_passed}[]`、`CheckContext={verify;priorFacts;enCandidates}` | |
| `candidates/run.ts`（15/16） | `runDocumentsCandidates(deps:CandidatesDeps,opts:{limit;extractionIds?;dryRun;triggeredBy;phases?:('candidates'|'auto'|'promote')[]}):Promise<CandidatesReceipt>` | Task 15 实现 candidates/auto；Task 16 加 promote |
| `hk-facts/promote.ts`（16） | `runHkFactsSync(deps:PromoteDeps,opts:{issuerIds:string[];batchId:string;triggeredBy}):Promise<HkIssuerOutcome[]>` | |
| `hk-facts/resolve.ts`（17） | `resolveHkFactsItem(port,tables,item,input)`、`finalizeHkHooks(tables,now)` | |

### 规格覆盖表

| 规格条目 | 任务 |
|---|---|
| §4.1–4.8、§4.10、§4.12 迁移一（表、视图、桶、函数、触发器、权限） | 1 |
| §4.11 `DocumentsDb` 三实现、游标分页 | 2、3 |
| §4.10 `ObjectStore`；§7.1 `pdfjs-dist` 与冒烟；§7.5-5 十进制 | 4 |
| §5.1–5.4 标识、时点、分类；§6.4 范围 | 5 |
| §6.2 来源适配器 | 6 |
| §6.1 同步核心、§10 采集错误 | 7 |
| §6.3 触发（cron、脚本、`vercel.json`） | 8（sync）、10（extract）、16（candidates） |
| §7.2 抽取；§11.1 码点夹具 | 9 |
| §7.3 抽取调度、§7.4 引用 | 10 |
| §9 读接口、§9.1 契约、i18n | 11 |
| §8.2–8.3 私有与上传 | 12 |
| §4.9 迁移二、`HkFactsPort` | 13 |
| §7.5 港股候选生成 | 14 |
| §7.6 检查、§7.3 候选与自动决定阶段 | 15 |
| §7.7 晋升、candidates cron | 16 |
| §9 管理接口、`/api/citations?factId=`、R5-12 隔离裁决 | 17 |
| §11.3 离线集成、§11.4 黄金集与评测、真实字节验证 | 18 |
| §12 F3-6 runbook、§17 偏差、全量门禁 | 19 |

### 执行顺序

| 序 | 任务 | Part | 依赖 |
|---|---|---|---|
| 1 | Task 1 迁移一 + 锁 + types + 集成测试骨架 | A | — |
| 2 | Task 2 契约、Supabase 与内存实现 | A | 1 |
| 3 | Task 3 pg 实现 + 契约/游标集成 | A | 2 |
| 4 | Task 4 ObjectStore、decimal、pdfjs-dist、冒烟脚本 | A | 2 |
| 5 | Task 5 classify + scope | B | 2 |
| 6 | Task 6 来源适配器 | B | 5 |
| 7 | Task 7 sync 核心 | B | 4、6 |
| 8 | Task 8 cron/脚本/deps/vercel | B | 7 |
| 9 | Task 9 抽取 pdf/tables/html | C | 4 |
| 10 | Task 10 citations + extract run + cron + record-fixture | C | 9、3 |
| 11 | Task 11 读路由 + i18n + reprocess | C | 10 |
| 12 | Task 12 上传与持有人路由 | C | 11 |
| 13 | Task 13 迁移二 + HkFactsPort | D1 | 3 |
| 14 | Task 14 港股候选生成 | D1 | 10、4 |
| 15 | Task 15 检查 + candidates 阶段 1–2 | D2 | 14、13 |
| 16 | Task 16 promote + candidates cron | D2 | 15 |
| 17 | Task 17 管理接口 + citations?factId + 隔离裁决 | D2 | 16 |
| 18 | Task 18 离线集成 + 评测/验证脚本 + 黄金模板 | D2 | 17、8 |
| 19 | Task 19 runbook、§17、全量门禁、冒烟记录 | E | 全部 |

任何任务都不得修改比它晚执行的任务创建的文件；可以修改更早任务的文件仅当本任务 Files 列表明示。

---

<!-- PARTS: Part A (Tasks 1–4), Part B (5–8), Part C (9–12), Part D1 (13–14), Part D2 (15–18), Part E (19) are inserted below by the integrator. -->
