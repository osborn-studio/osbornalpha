# 外资研报模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-foreign-research-design.md`（第 5 稿；Codex 第四轮 "READY WITH P2 FIXES"，第五轮增量审计 FR5-01–04 已落实）：私有研报馆藏（版本化许可、内容寻址私有桶、意向—暂存—提交状态机）、不可变运行、证据行与物化、发布不变量（SQL 阻断函数 + 唯一发布函数 + 不可变快照）、内容级披露检查、独立摘要三检查、公开只读视图与 API、公开页面与管理员页面、核验 cron 与 outbox。

**Architecture:** 三个迁移（表与触发器 / 函数 / 视图）；`src/lib/broker-research/db.ts` 的 `BrokerResearchDb` 契约有 Supabase（rpc + 表）/ 内存 / pg 三实现；处理服务（上传、解析、抽取、摘要、发布）只依赖注入的 `BrokerResearchDb`、`BrokerStorage`、`F3Port`、`LlmPort`、`TableClient`；抽取、类型化、定位、合并、规则、披露、落地检查都是纯函数；公开读一律经 anon 客户端读视图。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`ajv@8`、`tsx` 脚本、next-intl。

**范围（本计划交付 / 不交付）**

| 工作包 | 本计划 | 说明 |
|---|---|---|
| FR-0 迁移、视图、函数、契约 | 全部 | Part A |
| FR-1 许可、上传、存储 | 全部；`test:storage` 只交付脚本 `scripts/broker-research/storage-check.ts` 与 npm 脚本，实际运行是发布前人工门禁（规格 §12.3） | Part C |
| FR-2 解析、抽取、复核、评测回执 | 全部，**F3 与 LLM 经可注入端口**：生产端口默认关闭（`BROKER_RESEARCH_F3_ENABLED`、`BROKER_RESEARCH_LLM_ENABLED` 未设为 `1` 时返回 `f3_unavailable` / `llm_unavailable`）；测试用伪 F3 + 录制 LLM 响应 | F3 §11.1 契约由 F3 规格第 6 稿 §8.3 交付；O13 签字未完成，见 PR 依赖清单 |
| FR-3 摘要、发布、公开页（预览） | 全部 | Part B、C、D |
| FR-4 实体与历史 | 全部 | Part A（视图）、D（页面） |
| FR-5 核验与 outbox cron | 路由 + `replay.ts` + runbook；**两条 cron 都不登记进 `vercel.json`**（核验 cron 在首篇发布前无事可做；outbox 依赖 F4 消费端点，F4 规格 §12.3 把卖方登记列为延期项）。登记是 owner 合并后事项 | Part E |
| FR-6 对外发布 | 不做（D1 许可确认前不得开启；`broker_research_settings.public_enabled` 默认 `false`） | owner |
| FR-7 F4 适配 | 只交付 `F4Port` 接口 + 关闭的生产实现（`BROKER_RESEARCH_F4_URL` 未设 → outbox 事件保持 `pending`） | 依赖 F4 |

**Owner 默认值（规格 §15.2 / §15.3，owner 未答复，按规格记录的默认值实施，PR 列为假设）**：D2 片段硬上限 500（许可行 `snippet_max_chars` 由 owner 填，check ≤ 500）；D3 `allows_public_target_price` 默认 `false`；D4 `public_display` 默认 `false`；D5 平台 LLM 走 `resolvePlatformLlm()`、分块 8 页 / 上下文 60%、每文档调用上限 = 分块数（无额外上限）；D7 §15.3 全部提案值原样；O11 清除时摘要文本**保留**（只置 `rejected`）；O14 `approved_gold_corpus_hash` 为 null → 含 LLM 字段的报告恒阻断 `eval_receipt_missing`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/foreign-research-f63683`，分支 `claude/foreign-research-f63683`。不要 `cd` 到主检出；不要用裸 `git stash`（栈与其他工作树共享）。
- **并行兄弟模块**（plan 3、F3、F4、F6、行业、公司、A 股启用）同时在别的工作树开发。本模块**只拥有**：`src/lib/broker-research/**`、`src/app/(app)/intel/foreign-research/**`、`src/app/(app)/admin/broker-research/**`、`src/app/api/broker-research/**`、`src/app/api/admin/broker-research/**`、`src/app/api/cron/broker-research-*/**`、`scripts/broker-research/**`、`messages/{zh,en}/foreign-research.json`、`supabase/migrations/20261113*_broker_research*.sql`、`docs/audits/2026-11-06-foreign-research/**`。对共享文件的修改**必须**包在注释围栏里，便于合并：TS/JS 用 `// FOREIGN ↓` … `// FOREIGN ↑`，JSON 无法注释时把新增项追加在数组 / 对象末尾并在任务里写明。共享文件清单（只允许这些）：`supabase/migrations.lock.json`（末尾追加）、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`（`criticalSuites` 追加）、`src/lib/dq/batches.ts`（`INFO_CODES` 追加 `eval_receipt_absent`）、`src/i18n/request.ts`（`MESSAGE_DOMAINS` 追加 `'foreign-research'`）、`src/app/api/admin/dq/quarantine/[id]/route.ts`（`broker_research` 分支）、`src/app/(app)/stock/[ticker]/page.tsx`（mock 块移除 + 馆藏块）、`src/app/api/consensus/[ticker]/route.ts`（mock 分支）、`src/app/(app)/intel/page.tsx`（入口）、`package.json`（`test:storage` 脚本）、`docs/runbooks/`（新文件 `broker-research.md`，不改既有文件）。
- **迁移**：只用 `supabase/migrations/20261113HHMMSS_*`。本计划三个文件：`20261113090000_broker_research.sql`（表、约束、索引、桶、表权限、表级触发器）、`20261113091000_broker_research_functions.sql`（全部 SQL 函数与依赖函数的触发器）、`20261113092000_broker_research_views.sql`（公开视图与视图权限）。可重放（`create table if not exists`、`create or replace function`、`drop trigger if exists` 后 `create trigger`、`create or replace view`、`insert … on conflict`）。每个迁移完成时把 `{file, sha256}`（文件字节 hex）**追加**到 `supabase/migrations.lock.json` 末尾；已锁文件不可再改（后续任务需要改动就在**同一任务尚未锁定前**改，或新增迁移文件 `20261113093000_*` 起）。`migrationInventory` 要求未锁迁移晚于已锁最新（目前 `20261106090000`）。
- **本地 harness**：`test:db`（`scripts/ci/research-db.ts`）起本地 PostgreSQL 17，按序执行全部迁移再跑 vitest。集成测试读 `process.env.S4_TEST_STATE` 的 `adminUrl`，`describe.skipIf(!enabled)`。**任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 必须加进 `criticalSuites`**（否则 `Database suite inventory drift`）。本地只有 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)` 桩表：迁移只能 `insert into storage.buckets … on conflict (id) do update`，不得引用 `storage.objects`。角色 `anon`、`authenticated`、`service_role` 存在；角色断言用 `has_table_privilege` / `has_function_privilege` 与 `set local role anon` 后真实查询（参照 `src/lib/facts/facts.integration.test.ts` 第 120–145 行）。单文件跑法：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts <file>`（`db-one.ts` 内容见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5，未提交，丢了就重建）。`LC_ALL=C` 只给 `test:db`/`test:migrations`，不要导出给 `npm test`。
- **托管实例**：`postgres` 非超级用户；`security definer` 函数内 `set search_path = public`；不要 `alter … owner to`。Supabase 默认给 `anon/authenticated` 新函数 EXECUTE：每个函数后 `revoke execute on function … from public, anon, authenticated; grant execute … to service_role`。视图 owner 是迁移角色，`with (security_invoker=false, security_barrier=true)`；视图内**不调用任何本模块函数**（许可谓词、生效值选择器都内联为 SQL 表达式）。
- **类型**：`src/lib/supabase/database.types.ts` 手工维护（新增 21 张表的 `Row/Insert/Update` 放在 `// FOREIGN ↓ … ↑` 围栏里）；RPC 不登记到 `Functions`，调用用 `(client.rpc as never as RpcFn)(...)` 窄类型办法（见 `src/lib/supabase/admin.ts` 注释与 `src/lib/facts/db.ts`）。
- **服务端客户端**：管理员门禁 `requireAdminUser()`（`src/lib/admin/auth.ts`）；写库 `getAdminSupabase()`（`src/lib/supabase/admin.ts`）；公共读 `getAnonSupabase()`（`src/lib/supabase/anon.ts`）；批次 / 隔离 / 新鲜度用计划一 `TableClient`（`src/lib/db/table-client.ts`）+ `startBatch/finishBatch`（`src/lib/dq/batches.ts`）+ `quarantine()`（`src/lib/dq/quarantine.ts`）+ `recordAttempt`（只由核验 cron 调用）。
- **管理员 POST 路由**：沿用 `src/app/api/admin/dq/quarantine/[id]/route.ts` 的 Content-Type（`application/json`，否则 415）与 Origin（与 `request.nextUrl.origin` 不同则 403）校验；未登录 401、非管理员 403（`requireAdminUser` 抛出时的映射照抄该路由）。★ 路由（返回全文 / 跨度 / 签名 URL）**先写** `broker_report_access_log` 再返回，写日志失败 → `500 access_log_failed` 且无正文；`withdrawn` 文档 → `410 document_withdrawn`。全部管理员响应 `Cache-Control: no-store`。
- **公开路由**：`export const dynamic='force-dynamic'`；anon 客户端只读视图；**全部响应 `Cache-Control: no-store`**（规格 §8.1，与 facts 公共路由的缓存头不同）；参数解析复用 `src/lib/facts/public-route.ts` 的 `readParams/dateParam/intParam/QueryError/TICKER_RE/UUID_RE`（只 import，不改该文件）；错误体 `{error:{code,message}}`。
- **代码风格**：沿用 `src/lib/dq`、`src/lib/entities`、`src/lib/facts` 的紧凑风格（单空格缩进、少空行）；每个新文件顶部一段注释说明职责与对应规格条目。页面与组件沿用 `src/app/(app)/admin/dq/*` 与现有 `(app)` 页面的模式；样式只用 `DESIGN.md` / `src/app/globals.css` 的 tokens 与既有工具类（黄铜唯一强调色，无紫色、无渐变；评级标准化用中性徽标不用红绿）；图表为内联 SVG 且有表格视图切换。
- **UI 设计来源**：Claude Design 画布 `https://claude.ai/artifact/KG9LYefBtdGUE7ppir6cqg`，画板 HTML 已复制到 `docs/superpowers/plans/assets/2026-11-06-foreign-research-canvas/project/*.dc.html`（Main、ListStates、Detail、Drawer、Institution、Charts、Bilingual、M-List、M-Detail、AdminOverview、Upload、Licences、Document、Review、Publish、AccessLog、Preview）。实现时按画板结构与文案，**示例数值不得进入代码**（画布数值是版式示意）。三级文字色用画布的 `#8b8b94` 偏差尚待 owner 确认：实现用 `globals.css` 既有 token，不新增颜色。
- **i18n**：新域 `foreign-research`（文件 `messages/{zh,en}/foreign-research.json`，在 `src/i18n/request.ts::MESSAGE_DOMAINS` 末尾 `// FOREIGN` 围栏内追加）；命名空间 `foreign-research.public.*`、`foreign-research.admin.*`、`foreign-research.rating.*`（规格 §9.7 写的是 `intel.foreignResearch.*` / `admin.brokerResearch.*` / `common.rating.*`：为不改共享 `intel.json`/`admin.json`/`common.json`，改为独立域，记入规格 §17）。zh/en parity 测试（既有）必须绿。
- **版本常量**（全部在 `src/lib/broker-research/versions.ts`，Task B1 创建）：`TYPED_VERSION='typed/1'`、`MERGE_VERSION='merge/1'`、`LOCATE_VERSION='locate/1'`、`TICKER_VERSION='parseBrokerTicker/1'`、`CURRENCY_MARKS_VERSION='currency-marks/1'`、`RULES_VERSION='broker-rules/1'`、`DISCLOSURE_VERSION='disclosure/1'`、`GROUNDING_VERSION='grounding/1'`、`OVERLAP_VERSION='overlap/1'`、`SCHEMA_VERSION='extract-schema/1'`、`EXTRACT_PROMPT_VERSION='broker-extract/1'`、`SUMMARY_PROMPT_VERSION='independent-summary/1'`、`UPSIDE_FORMULA_VERSION='upside/1'`、`CLAIM_METHODOLOGY_VERSION='broker-claim/1'`。SQL 里出现的版本串（`upside/1`、`broker-rules/1`）与 TS 常量必须相等，集成测试断言。
- **代码版本**：`resolveCodeVersion({allowGit})`（`src/lib/facts/deps.ts`，只 import）；路由里 `allowGit:false`，脚本 `allowGit:true`；为 null 时写 `'unknown'`。
- **提交**：`git commit` 单独一条命令；同一命令里不得出现任何 `-n` 记号（包括 `grep -n`、`head -n`），仓库钩子会拦截；不要 `--no-verify`。提交信息末尾：`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理用自己的模型名）。
- **测试命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`、同前缀 `npm run test:migrations`。
- **不提交真实研报**：夹具一律合成（`src/lib/broker-research/fixtures/`：合成页文本 JSON、预期 `DocumentExtraction`、录制格式的 LLM 响应 JSON）。不抓取任何网站。

## 文件结构

```
supabase/migrations/20261113090000_broker_research.sql            21 表 + 约束/索引 + 桶 + 表权限 + 表级触发器（Task A1）
supabase/migrations/20261113091000_broker_research_functions.sql  函数 + 函数型触发器（Task A2）
supabase/migrations/20261113092000_broker_research_views.sql      9 个公开视图 + 视图权限（Task A3）
supabase/migrations.lock.json                                      追加 3 条（A1、A2、A3 各一）
src/lib/supabase/database.types.ts                                 + 21 表类型（// FOREIGN 围栏；A1）
src/lib/broker-research/types.ts            共享契约（本文件 §共享契约 原样落地；A4）
src/lib/broker-research/versions.ts         版本常量（B1）
src/lib/broker-research/db.ts               BrokerResearchDb 再导出 + BrokerResearchDbError + supabaseBrokerResearchDb（A4）
src/lib/broker-research/memory-db.ts        memoryBrokerResearchDb（单测；实现触发器/函数等价规则；A4）
src/lib/broker-research/db-contract.ts      内存与 pg 共用契约用例 brokerResearchDbContract（非测试文件；A4）
src/lib/broker-research/pg-db.ts            pgBrokerResearchDb(pool)（集成测试；A5）
src/lib/broker-research/effective.ts        effectiveValue()（TS 生效值选择器，与 SQL 同规则；A4）
src/lib/broker-research/broker-research.integration.test.ts   迁移/触发器/函数/视图/角色 + pg 契约（critical；A1、A2、A3、A5 依次追加 describe 块）
src/lib/broker-research/behavior.ts         BEHAVIOR_DIGEST_INPUTS、behaviorDigest()（B1）
src/lib/broker-research/extract/schema.ts   extract-schema/1（ajv 编译）+ validateExtraction（B1）
src/lib/broker-research/extract/locate.ts   locateQuote（UTF-16 码元；代理对）（B1）
src/lib/broker-research/extract/typed.ts    toTyped(field, valueText, quote?)（§5.3 转换表）+ CURRENCY_MARKS（B1）
src/lib/broker-research/tickers.ts          parseBrokerTicker + resolveTargets（resolveIssuer 快照）（B2）
src/lib/broker-research/extract/merge.ts    mergeChunks（冲突组；B3）
src/lib/broker-research/rules.ts            evaluateRules R1–R10 + BLOCKING_REASONS + RULES_PARAMS（B4）
src/lib/broker-research/disclosure.ts       checkDisclosure（B5）
src/lib/broker-research/summary/overlap.ts  maxVerbatimOverlap（B5）
src/lib/broker-research/summary/grounding.ts checkGrounding + GROUNDING_KEYWORDS（B5）
src/lib/broker-research/hash.ts             canonicalJson / sha256Hex（A4；与 SQL 规范化 JSON 一致，见契约）
src/lib/broker-research/storage.ts          BrokerStorage 接口 + supabaseBrokerStorage + memoryBrokerStorage（C1）
src/lib/broker-research/admin-route.ts      管理员路由助手：guardAdmin / guardPost / withAccessLog / jsonNoStore / errorJson（C1）
src/lib/broker-research/licences.ts         许可服务（C2）
src/lib/broker-research/upload.ts           createIntent / commitIntent 状态机 / orphanCleanup / signedReadUrl（C3）
src/lib/broker-research/ports/f3.ts         F3Port + fakeF3Port + productionF3Port（flag）（C4）
src/lib/broker-research/ports/llm.ts        LlmPort + recordedLlmPort + productionLlmPort（flag）（C4）
src/lib/broker-research/ports/f4.ts         F4Port + productionF4Port（flag）（E1）
src/lib/broker-research/parse.ts            runParse（租约、运行、批次）（C4）
src/lib/broker-research/extract/run.ts      runExtract（分块、请求/响应入桶、ajv、定位、合并、extract_commit、规则回执、隔离、批次）（C5）
src/lib/broker-research/review.ts           review 服务：fieldAction / addField / markAbsent / bind / override / runRulesAfterChange（C6）
src/lib/broker-research/quarantine-hook.ts  resolveBrokerQuarantine（调用 broker_quarantine_resolve；C6）
src/lib/broker-research/summary/run.ts      runSummary / approveSummary / translateTitle（C7）
src/lib/broker-research/snippets.ts         createSnippet / approveSnippet / rejectSnippet（C7）
src/lib/broker-research/withdraw.ts         withdrawDocument / purgeDocument（步骤表）（C7）
src/lib/broker-research/eval.ts             evalReceiptFrom(perField…) + writeEvalReceipt（C8）
src/lib/broker-research/replay.ts           replayPublication（不写库；C8）
src/lib/broker-research/pipeline.integration.test.ts  端到端（critical；C8）
src/lib/broker-research/public-dto.ts       公开 DTO 白名单序列化（D1）
src/lib/broker-research/verify.ts           runVerify（核验；E1）
src/lib/broker-research/outbox.ts           deliverOutbox（E1）
src/lib/broker-research/fixtures/*           合成夹具（B1 起逐步添加）
src/lib/broker-research/**/*.test.ts         单测
src/app/api/admin/broker-research/**         管理员路由（C2–C7）
src/app/api/broker-research/**               公开路由（D1）
src/app/api/cron/broker-research-verify/route.ts、src/app/api/cron/broker-research-outbox/route.ts（E1）
src/app/(app)/intel/foreign-research/page.tsx、[reportId]/page.tsx、institutions/[institutionId]/page.tsx + components/*（D2）
src/app/(app)/admin/broker-research/**       管理员页面（D4、D5）
messages/{zh,en}/foreign-research.json      （D2 创建；D3–D5 追加键）
scripts/broker-research/replay.ts、eval-gold.ts、storage-check.ts（C8、C8、E1）
docs/runbooks/broker-research.md             （E1）
docs/audits/2026-11-06-foreign-research/10-implementation-log.md   实施记录（每任务一行）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/broker-research/types.ts` 原样落地）

```ts
// src/lib/broker-research/types.ts
// Shared contract of the foreign broker research module (plan 2026-11-06 §共享契约; spec §4).
// Every task uses these names verbatim. BrokerResearchDb has three implementations:
// supabaseBrokerResearchDb (db.ts), memoryBrokerResearchDb (memory-db.ts, unit tests),
// pgBrokerResearchDb (pg-db.ts, integration tests).

export type LicenceKind='terminal_subscription'|'direct_from_broker'|'owner_authored'|'other';
export type IntentStatus='open'|'validating'|'validated'|'promoting'|'committed'|'expired'|'abandoned';
export type DocumentStatus='uploaded'|'parsing'|'parsed'|'parse_failed'|'withdrawn';
export type RunKind='parse'|'extract'|'summary'|'translate'|'verify';
export type RunStatus='running'|'succeeded'|'failed';
export type ReportScope='single_issuer'|'multi_issuer'|'sector'|'macro_strategy';
export type ReviewStatus='pending'|'in_review'|'approved'|'rejected';
export type ReportStatus='draft'|'published'|'withdrawn';
export type TargetBasis='candidate'|'effective';
export type FieldName='institution'|'analyst'|'published_date'|'price_as_of_date'|'ticker'|'rating'|'target_price'|'target_currency'|'target_horizon'|'price_at_report'|'price_currency'|'upside_stated'|'wacc'|'terminal_growth'|'terminal_value_share'|'valuation_method'|'sector'|'title';
export type FieldStatus='extracted'|'unverified'|'confirmed'|'corrected'|'rejected'|'absent';
export type ValueUnit='pct'|'ratio'|'months'|'price';
export type SnippetPurpose='rating'|'target'|'thesis'|'risk'|'method'|'other';
export type TextStatus='draft'|'approved'|'rejected';
export type Lang='zh'|'en';
export type NormalizedRating='buy'|'overweight'|'neutral'|'underweight'|'sell'|'not_rated';
export type AccessAction='upload'|'signed_url_issued'|'text_viewed'|'parse_run'|'extract_run'|'summary_run'|'unpublish'|'withdraw'|'purge'|'orphan_cleanup';
export type OutboxKind='claim.register'|'claim.revise'|'claim.retract'|'licence.changed'|'mapping.changed';
export type PurgeStep='pdf'|'artifacts'|'runs'|'fields_text'|'snippets_text'|'summaries'|'quarantine_payload';
export type FieldAction='confirm'|'correct'|'reject'|'absent';

/** Typed value components of an evidence row (spec §4.6, §5.3). */
export interface TypedValue{value_text:string;value_num:string|null;value_currency:string|null;value_unit:ValueUnit|null;value_date:string|null}
/** `corrected` payload: present key with null = explicit clear; missing key = inherit; value_text must be present and non-null. */
export type CorrectedValue={value_text:string}&Partial<Omit<TypedValue,'value_text'>>;

export interface LicenceRow{
 licence_id:string;version:number;source_label:string;licence_kind:LicenceKind;holder:string;terms_summary:string;evidence_path:string|null;
 allows_llm_processing:boolean;allows_public_metadata:boolean;allows_public_snippets:boolean;allows_public_summary:boolean;allows_public_target_price:boolean;
 snippet_max_chars:number;valid_from:string;valid_to:string|null;
 confirmed_by:string|null;confirmed_at:string|null;confirmed_version:number|null;created_at:string;updated_at:string;
}
export type LicenceInput=Pick<LicenceRow,'source_label'|'licence_kind'|'holder'|'terms_summary'|'evidence_path'|'allows_llm_processing'|'allows_public_metadata'|'allows_public_snippets'|'allows_public_summary'|'allows_public_target_price'|'snippet_max_chars'|'valid_from'|'valid_to'>;
export interface SettingsRow{public_enabled:boolean;approved_gold_corpus_hash:string|null;approved_gold_corpus_by:string|null;approved_gold_corpus_at:string|null;updated_by:string|null;updated_at:string}
export interface IntentRow{
 intent_id:string;sha256:string;byte_size:number;licence_id:string;original_filename:string;created_by:string;created_at:string;expires_at:string;
 status:IntentStatus;staging_path:string;document_id:string|null;error_code:string|null;checkpoint_at:string|null;
}
export interface DocumentRow{
 document_id:string;sha256:string;storage_path:string;byte_size:number;page_count:number|null;licence_id:string;
 uploaded_by:string;uploaded_at:string;original_filename:string;current_parse_run_id:string|null;status:DocumentStatus;
 lease_token:string|null;lease_until:string|null;promotion_pending:boolean;last_verified_at:string|null;verify_status:'ok'|'failed'|'error'|null;
 withdrawn_at:string|null;withdrawn_reason:string|null;purged_at:string|null;
}
export interface RunRow{
 run_id:string;document_id:string;kind:RunKind;parse_run_id:string|null;extractor_version:string|null;artifact_path:string|null;artifact_hash:string|null;
 model_id:string|null;registry_hash:string|null;prompt_version:string|null;schema_version:string|null;code_version:string;behavior_digest:string|null;
 licence_version:number;request_path:string|null;response_path:string|null;batch_id:string|null;status:RunStatus;started_at:string;finished_at:string|null;
 detail:Record<string,unknown>;
}
export interface ReportRow{
 report_id:string;document_id:string;revision:number;scope:ReportScope|null;institution_id:string|null;
 title_original:string|null;title_lang:string|null;title_zh:string|null;title_en:string|null;title_run_id:string|null;title_public:string|null;title_public_by:string|null;
 published_date:string|null;price_as_of_date:string|null;report_type:string|null;sector_as_stated:string|null;primary_target_key:string|null;
 effective_hash:string|null;materialized_hash:string|null;rules_input_hash:string|null;summary_input_digest:string|null;
 title_restricted:boolean;evidence_ok:boolean;disclosure_ok:boolean;review_status:ReviewStatus;status:ReportStatus;
 current_publication_id:string|null;supersedes_report_id:string|null;code_version:string;created_at:string;updated_at:string;
}
export interface TargetRow{
 report_id:string;target_key:string;basis:TargetBasis;ticker_as_stated:string;security_ticker:string|null;issuer_id:string|null;
 resolution:Record<string,unknown>;rating_raw:string|null;rating_normalized:NormalizedRating|null;scale_id:string|null;
 target_price:string|null;target_currency:string|null;target_horizon_months:number|null;
 price_at_report:string|null;price_currency:string|null;price_as_of_date:string|null;upside_pct:string|null;upside_formula_version:string|null;input_hash:string;
}
export interface FieldRow extends TypedValue{
 field_id:string;report_id:string;parse_run_id:string|null;run_id:string|null;superseded_by_run_id:string|null;target_key:string|null;
 field:FieldName;occurrence:number;page:number|null;char_start:number|null;char_end:number|null;value_source_text:string|null;
 extractor:string;extractor_confidence:number|null;status:FieldStatus;corrected:CorrectedValue|null;conflict_group:string|null;
 detail:Record<string,unknown>;reviewed_by:string|null;reviewed_at:string|null;created_at:string;
}
/** Candidate rows written by broker_extract_commit (field_id/report_id/timestamps assigned by the DB). */
export type CandidateFieldInput=Pick<FieldRow,'target_key'|'field'|'occurrence'|'value_text'|'value_num'|'value_currency'|'value_unit'|'value_date'|'page'|'char_start'|'char_end'|'value_source_text'|'extractor'|'extractor_confidence'|'conflict_group'|'detail'>&{status:'extracted'|'unverified';resolution?:Record<string,unknown>};
/** Human-added evidence row (broker_field_add). */
export type HumanFieldInput=Pick<FieldRow,'target_key'|'field'|'occurrence'|'page'|'char_start'|'char_end'|'value_source_text'>&TypedValue&{parse_run_id:string;status:'confirmed'|'absent'};
export interface SnippetRow{snippet_id:string;report_id:string;target_key:string|null;purpose:SnippetPurpose;parse_run_id:string;page:number;char_start:number;char_end:number;text:string|null;field_id:string|null;status:TextStatus;disclosure_check:DisclosureCheck|null;approved_by:string|null;approved_at:string|null;created_by:string;created_at:string}
export interface SummaryRow{summary_id:string;report_id:string;lang:Lang;kind:'independent_summary';run_id:string;input_hash:string;summary_md:string;max_verbatim_overlap:number;numeric_grounding:GroundingResult;disclosure_check:DisclosureCheck;status:TextStatus;approved_by:string|null;approved_at:string|null;generated_at:string}
export interface PublicationRow{publication_id:string;report_id:string;revision:number;snapshot:Record<string,unknown>;snapshot_hash:string;licence_version:number;rules_receipt_id:string;eval_receipt_id:string|null;published_at:string;published_by:string;unpublished_at:string|null;unpublish_reason:string|null}
export interface RuleReceiptRow{receipt_id:string;report_id:string;rules_version:string;input_hash:string;results:RuleResult[];code_version:string;created_at:string}
export interface InstitutionRow{institution_id:string;name_en:string;name_zh:string|null;aliases:string[];kind:string|null;rating_disclosure_url:string|null;created_at:string}
export interface RatingScaleRow{scale_id:string;institution_id:string;raw_label:string;normalized:NormalizedRating;source_url:string;valid_from:string;valid_to:string|null;created_by:string;created_at:string;closed_by:string|null;closed_at:string|null}
export interface AnalystRow{analyst_id:string;institution_id:string;display_name:string;name_variants:string[];public_display:boolean;created_at:string}
export interface ReportAnalystRow{report_id:string;analyst_id:string;role:string|null;field_id:string}
export interface AccessLogInput{document_id:string|null;user_id:string;action:AccessAction;detail:Record<string,unknown>}
export interface EvalFieldStats{tp:number;fp:number;fn:number;precision:number|null;recall:number|null}
export interface EvalReceiptRow{
 receipt_id:string;corpus_kind:'gold'|'synthetic';corpus_hash:string;behavior_digest:string;extractor_version:string;model_id:string;registry_hash:string;
 prompt_version:string;schema_version:string;code_version:string;n_docs:number;per_field:Record<string,EvalFieldStats>;absence:{tp:number;fp:number;fn:number};
 precision_min:number|null;recall_min:number|null;passed:boolean;ran_at:string;ran_by:string;
}
export interface OutboxEvent{event_id:string;kind:OutboxKind;payload:Record<string,unknown>;status:'pending'|'delivered'|'failed';attempts:number;last_error:string|null;created_at:string;delivered_at:string|null}
export interface PurgeStepRow{document_id:string;step:PurgeStep;status:'pending'|'done'|'failed';attempts:number;last_error:string|null;at:string}

export interface MaterializeReceipt{effectiveHash:string;materializedHash:string;targets:number;basis:'candidate'|'effective'|'mixed'}
export interface RuleResult{rule:string;passed:boolean;blocking:boolean;target_key:string|null;reason_code:string|null;detail:Record<string,unknown>}
export interface DisclosureCheck{version:string;inputs_hash:string;passed:boolean;hits:{kind:'restricted_value:target'|'restricted_name';token:string;target_key?:string;analyst_id?:string}[]}
export interface GroundingAssertion{sentence_idx:number;target_key:string;field:FieldName;value:string;unit:ValueUnit;field_id:string}
export interface GroundingResult{version:string;passed:boolean;assertions:GroundingAssertion[];failures:{sentence_idx:number;reason:string}[]}

/** Error raised by BrokerResearchDb implementations; `code` is the SQL `raise exception` message prefix (e.g. 'publish_blocked', 'published_immutable', 'lease_lost'). */
export class BrokerResearchDbError extends Error{
 constructor(readonly code:string,message?:string,readonly detail?:string){super(message??code);this.name='BrokerResearchDbError';}
}

export interface ReviewQueueOptions{status?:ReviewStatus;limit?:number}
export interface PublicReportFilter{institutionId?:string;issuerId?:string;rating?:NormalizedRating;scope?:ReportScope;from?:string;to?:string;limit:number;cursor?:{publishedDate:string;reportId:string}}

export interface BrokerResearchDb{
 // settings & licences
 getSettings():Promise<SettingsRow>;
 setPublicEnabled(flag:boolean,by:string):Promise<void>;
 listLicences():Promise<LicenceRow[]>;
 getLicence(licenceId:string):Promise<LicenceRow|null>;
 insertLicence(input:LicenceInput):Promise<LicenceRow>;
 updateLicence(licenceId:string,patch:Partial<LicenceInput>):Promise<LicenceRow>;      // trigger bumps version on material change
 confirmLicence(licenceId:string,by:string,version:number):Promise<'confirmed'|'version_mismatch'>;
 // intents & documents
 insertIntent(row:Omit<IntentRow,'created_at'|'checkpoint_at'|'error_code'>):Promise<void>;
 getIntent(intentId:string):Promise<IntentRow|null>;
 transitionIntent(intentId:string,from:IntentStatus,to:IntentStatus,patch?:Partial<Pick<IntentRow,'document_id'|'error_code'>>):Promise<boolean>;   // CAS; sets checkpoint_at
 findDocumentBySha(sha256:string):Promise<DocumentRow|null>;
 getDocument(documentId:string):Promise<DocumentRow|null>;
 insertDocument(row:Pick<DocumentRow,'document_id'|'sha256'|'storage_path'|'byte_size'|'licence_id'|'uploaded_by'|'original_filename'>):Promise<'inserted'|'duplicate'>;  // status='uploaded', promotion_pending=true
 updateDocument(documentId:string,patch:Partial<Pick<DocumentRow,'promotion_pending'|'status'|'withdrawn_at'|'withdrawn_reason'|'purged_at'|'page_count'|'last_verified_at'|'verify_status'>>):Promise<void>;
 claimLease(documentId:string,token:string,ttlSeconds:number):Promise<boolean>;                         // CAS
 fencedUpdateDocument(documentId:string,token:string,patch:Partial<Pick<DocumentRow,'status'|'current_parse_run_id'|'page_count'>>&{releaseLease?:boolean}):Promise<'ok'|'lease_lost'>;
 // runs
 insertRun(row:Omit<RunRow,'started_at'|'finished_at'|'status'|'detail'>&{detail?:Record<string,unknown>}):Promise<void>;
 finishRun(runId:string,token:string,patch:Pick<RunRow,'status'>&Partial<Pick<RunRow,'artifact_path'|'artifact_hash'|'request_path'|'response_path'|'detail'>>):Promise<'ok'|'lease_lost'>;
 getRun(runId:string):Promise<RunRow|null>;
 listRuns(documentId:string):Promise<RunRow[]>;
 // reports & evidence
 ensureReport(documentId:string,codeVersion:string):Promise<ReportRow>;
 getReport(reportId:string):Promise<ReportRow|null>;
 reportByDocument(documentId:string):Promise<ReportRow|null>;
 updateReportDraft(reportId:string,patch:Partial<Pick<ReportRow,'scope'|'institution_id'|'report_type'|'primary_target_key'|'supersedes_report_id'|'title_public'|'title_public_by'|'title_zh'|'title_en'|'title_run_id'|'review_status'|'disclosure_ok'|'evidence_ok'>>):Promise<void>;
 extractCommit(documentId:string,leaseToken:string,runId:string,rows:CandidateFieldInput[]):Promise<MaterializeReceipt>;   // rpc broker_extract_commit
 fieldReview(fieldId:string,action:FieldAction,payload:Record<string,unknown>,by:string):Promise<MaterializeReceipt>;    // rpc broker_field_review
 insertHumanField(reportId:string,row:HumanFieldInput,by:string):Promise<{fieldId:string;receipt:MaterializeReceipt}>;  // rpc broker_field_add
 upsertTargetOverride(row:{report_id:string;target_key:string;security_ticker:string;issuer_id:string|null;set_by:string;note:string|null}):Promise<MaterializeReceipt>;  // rpc broker_target_override
 materialize(reportId:string):Promise<MaterializeReceipt>;                                                                // rpc broker_report_materialize
 listFields(reportId:string,opts?:{includeSuperseded?:boolean}):Promise<FieldRow[]>;
 listTargets(reportId:string):Promise<TargetRow[]>;
 bindAnalyst(row:ReportAnalystRow):Promise<void>;
 insertRuleReceipt(row:Omit<RuleReceiptRow,'receipt_id'|'created_at'>):Promise<string>;
 // snippets & summaries
 insertSnippet(row:Omit<SnippetRow,'snippet_id'|'created_at'|'approved_by'|'approved_at'|'status'>&{status?:'draft'}):Promise<string>;
 setSnippetStatus(snippetId:string,patch:{status:TextStatus;disclosure_check?:DisclosureCheck;approved_by?:string|null}):Promise<void>;
 listSnippets(reportId:string):Promise<SnippetRow[]>;
 insertSummary(row:Omit<SummaryRow,'summary_id'|'approved_by'|'approved_at'|'generated_at'>):Promise<string>;
 setSummaryStatus(summaryId:string,patch:{status:TextStatus;approved_by?:string|null}):Promise<void>;
 listSummaries(reportId:string):Promise<SummaryRow[]>;
 // publish
 publishBlockers(reportId:string):Promise<string[]>;
 publish(reportId:string,by:string):Promise<{publicationId:string}>;
 unpublish(reportId:string,by:string,reason:string):Promise<void>;
 getPublication(publicationId:string):Promise<PublicationRow|null>;
 // entities
 upsertInstitution(row:Omit<InstitutionRow,'institution_id'|'created_at'>&{institution_id?:string}):Promise<string>;
 listInstitutions():Promise<InstitutionRow[]>;
 insertRatingScale(row:Omit<RatingScaleRow,'scale_id'|'created_at'|'closed_by'|'closed_at'|'valid_to'>):Promise<string>;
 closeRatingScale(scaleId:string,validTo:string,by:string):Promise<void>;
 listRatingScales(institutionId:string):Promise<RatingScaleRow[]>;
 upsertAnalyst(row:Omit<AnalystRow,'analyst_id'|'created_at'>&{analyst_id?:string}):Promise<string>;
 listAnalysts(institutionId:string):Promise<AnalystRow[]>;
 // logs, receipts, outbox, purge
 reviewQueue(opts:ReviewQueueOptions):Promise<ReportRow[]>;
 logAccess(row:AccessLogInput):Promise<void>;
 listAccessLog(opts:{documentId?:string;limit:number}):Promise<(AccessLogInput&{id:string;created_at:string})[]>;
 insertEvalReceipt(row:Omit<EvalReceiptRow,'receipt_id'|'ran_at'>):Promise<string>;
 latestEvalReceipt(behaviorDigest:string):Promise<EvalReceiptRow|null>;
 takePendingOutbox(limit:number):Promise<OutboxEvent[]>;
 markOutbox(eventId:string,outcome:{delivered:true}|{delivered:false;error:string}):Promise<void>;   // attempts+1; ≥10 failures → 'failed'
 upsertPurgeStep(documentId:string,step:PurgeStep,outcome:{ok:true}|{ok:false;error:string}):Promise<void>;
 purgeSteps(documentId:string):Promise<PurgeStepRow[]>;
 // public (anon client, views only)
 publicReports(filter:PublicReportFilter):Promise<PublicReportBundle[]>;
 publicReport(reportId:string):Promise<PublicReportDetail|null>;
 publicInstitutions():Promise<Record<string,unknown>[]>;
 ratingHistory(opts:{securityTicker:string;institutionId?:string;currency?:string;limit:number}):Promise<Record<string,unknown>[]>;
}
/** Rows read from the public views (column names as in spec §4.11). */
export interface PublicReportBundle{report:Record<string,unknown>;targets:Record<string,unknown>[];hasSummary:{zh:boolean;en:boolean};snippetCount:number;institution:Record<string,unknown>|null}
export interface PublicReportDetail extends PublicReportBundle{citations:Record<string,unknown>[];snippets:Record<string,unknown>[];summaries:Record<string,unknown>[];analysts:Record<string,unknown>[]}

/** Injected dependencies of every processing service (C3–C8, E1). */
export interface BrokerDeps{db:BrokerResearchDb;storage:import('./storage').BrokerStorage;tables:import('../db/table-client').TableClient;f3:import('./ports/f3').F3Port;llm:import('./ports/llm').LlmPort;now:()=>Date;codeVersion:string;newId:()=>string}
```

**契约补充**

- **规范化 JSON 与哈希**（`hash.ts`，A4）：`canonicalJson(v)` = 键按 UTF-16 码元排序、无空白、数组保序、数值一律以十进制字符串出现（证据行的 `value_num` 本来就是字符串）；`sha256Hex(s)` = UTF-8 字节的 sha256 hex。SQL 端 `effective_hash` 等由 `broker_report_materialize` 用 `encode(sha256(convert_to(<jsonb>::text,'UTF8')),'hex')` 计算——**jsonb 的文本形式与 `canonicalJson` 不同**，因此**哈希只在 SQL 端计算与比较**；TS 端从不重算 `effective_hash/rules_input_hash/summary_input_digest`，只读取并原样比较（规则回执 `input_hash` = 读到的 `rules_input_hash`）。`canonicalJson` 只用于 TS 自己产生的哈希（`behavior_digest`、`disclosure_check.inputs_hash`、`snapshot_hash` 不在 TS 算——发布快照哈希也在 SQL 端）。
- **生效值选择器**：TS `effectiveValue(row:FieldRow):TypedValue`（`effective.ts`）与 SQL 内联表达式同规则：对每个分量 k，`row.corrected` 有键 k → 取该值（可为 null），否则取 `row.value_k`。A2 的函数 `broker_field_effective` 与 A3 视图内联 `case` 都实现同一规则；A5 的 pg 契约用例断言三者一致。
- **数值**：证据行与 targets 的 `numeric` 列在 TS 侧一律是十进制字符串（`value_num:string|null`）；pg/supabase 实现把 `numeric` 读成字符串（PostgREST 默认返回 JSON number——supabase 实现在 select 时用 `value_num::text` 别名，或在 rpc 返回 jsonb 时以 `to_jsonb(x::text)` 输出；A4 定）。规则与检查的数值比较用 `src/lib/facts/json-numbers.ts` 的 `canonicalDecimal/decimalEquals`（只 import）与 BigInt 定标运算，**不经 `Number`**（空间恒等容差 0.005 与 1 位小数四舍五入也用定标整数）。
- **RPC 错误**：SQL `raise exception '<code>[:<detail>]'`；三实现都把它映射为 `BrokerResearchDbError(code, message, detail)`（code = 第一个冒号前的串）。路由把 `publish_blocked` → `409 publish_blocked:<reasons>`，`published_immutable` → 409，`lease_lost` → 409，`version_mismatch` → 409，`hook_params_required` → 400。
- **租约**：TTL 300 s；`claimLease` 返回 false → `409 lease_held`；收尾一律 `fencedUpdateDocument(..., {releaseLease:true})`。`extractCommit` 在 SQL 内校验 `lease_token` 相等且 `lease_until > now()`。
- **outbox**：`claim.register` / `claim.retract` 由 SQL 函数（`broker_report_publish` / `broker_report_unpublish` / 文档撤回触发器 / `disclosure_ok` 或 `evidence_ok` 置 false 的触发器）写入；`licence.changed` 由许可 after update 触发器写入。唯一索引 `(payload->>'claim_key', payload->>'claim_seq')` 部分索引（`kind in ('claim.register','claim.retract')`）。TS 只负责投递（E1）。
- **隔离键**：`naturalKey = ${sha256}:${rule}:${target_key ?? '-'}`，`dataset='broker_research'`，`table='broker_research_reports'`，`payload` 只含值与页码，不含跨度文本。
- **批次**：`producer` ∈ `broker-research-parse` / `broker-research-extract` / `broker-research-summary` / `broker-research-verify`；`dataset='broker_research'`；计数规则见规格 §6.2。只有核验 cron 调 `recordAttempt`（`cadence:'daily'`）。

## 推荐执行顺序

任何任务都不得修改比它晚执行的任务创建的文件；只能修改本任务 Files 列表里的文件。

| 序 | 任务 | 依赖 |
|---|---|---|
| 1 | A1 迁移一（表/约束/索引/桶/表权限/表级触发器）+ 锁 + types + 集成测试块 1 | — |
| 2 | B1 versions / behavior / schema / locate / typed + 夹具 | — |
| 3 | A2 迁移二（函数 + 函数型触发器）+ 锁 + 集成测试块 2 | A1 |
| 4 | A3 迁移三（视图）+ 锁 + 集成测试块 3（真实角色） | A2 |
| 5 | A4 types.ts / hash / effective / db.ts（supabase）/ memory-db / db-contract + 单测 | A3、B1 |
| 6 | A5 pg-db + pg 契约（集成测试块 4） | A4 |
| 7 | B2 tickers | A4 |
| 8 | B3 merge | B1、B2 |
| 9 | B4 rules | A4、B1 |
| 10 | B5 disclosure / overlap / grounding | A4、B1 |
| 11 | C1 storage / admin-route | A4 |
| 12 | C2 许可与设置服务 + 路由 | C1 |
| 13 | C3 上传状态机 + 路由 + 孤儿清理 + 签名 URL | C2 |
| 14 | C4 F3/LLM 端口 + parse 服务 + 路由 | C3 |
| 15 | C5 extract 服务 + 路由 | C4、B2、B3、B4 |
| 16 | C6 复核服务 + 路由 + 隔离钩子 + `INFO_CODES` | C5 |
| 17 | C7 摘要 / 片段 / 撤回 / 清除 + 发布路由 | C6、B5 |
| 18 | C8 eval / replay + scripts + pipeline.integration（critical） | C7 |
| 19 | D1 公开 DTO + 公开路由 | A4、C8 |
| 20 | D2 i18n + 公开列表 / 详情 / 机构页 + 图表 | D1 |
| 21 | D3 `/stock` 块 + mock 移除 + consensus `none` + `/intel` 入口 | D2 |
| 22 | D4 管理员页面：总览 / 上传 / 许可 / 访问日志 | D2、C7 |
| 23 | D5 管理员页面：文档 / 复核双栏 / 发布对话框 / 预览 | D4 |
| 24 | E1 核验 cron + outbox 投递 + F4 端口 + storage-check + runbook | C8 |
| 25 | E2 规格 §17 实施记录 + 全量门禁 | 全部 |

---

<!-- PART A / B / C / D / E task sections are appended below by the part writers. -->
