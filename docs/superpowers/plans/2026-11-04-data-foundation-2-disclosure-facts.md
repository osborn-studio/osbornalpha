# 数据底座二：披露事实库 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（第 8 稿，Codex 第八轮判定可进入实施；owner 2026-11-04 决策 A/B/C 取默认值：A 股范围 = `research_entity_keys.in_scope` 队列，自选股不进入，A 股事实公共可见并带 `citation` 状态）：披露日志 `financial_facts`、`filings`、`fact_sync_runs`、`financial_metrics`、`fact_sync_scope`，全部写入经带租约校验的 SQL 函数，EDGAR companyfacts 与 Tushare 三表两个适配器，公共读接口，cron 与脚本。

**Architecture:** 一个迁移建五表、桶、全部 `security definer` 函数与触发器；`src/lib/facts/db.ts` 的 `FactsDb` 契约有 Supabase（rpc）/ 内存 / pg 三实现；采集核心 `sync.ts` 只依赖注入的 `FactsDb`、`SnapshotStore` 与抓取函数，单测在内存实现上跑，离线集成测试用录制夹具在真实 PostgreSQL 上跑；规划、规则、派生全是纯函数。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`tsx` 脚本。计划一的 `TableClient`、`startBatch/finishBatch`、`quarantine()`、`recordAttempt` 继续用于批次/隔离/新鲜度。

本计划是三份中的第二份；计划三（标识符补全 + 对账 + 日历新鲜度）在本计划完成后编写。实施按 owner 规则：代码由 Opus 5.5 子代理逐任务完成，每个任务经 Claude 规格复审、质量复审与 Codex（gpt-6-astra，medium）审计。

---

## 仓库约定（动手前必读）

- 迁移 `supabase/migrations/20261106090000_financial_facts.sql`，可重放（`create table if not exists`、`create or replace function`、`drop policy if exists` 后 `create policy`、`drop trigger if exists` 后 `create trigger`、`insert … on conflict`）；写入 `supabase/migrations.lock.json`（追加 `{file, sha256}`，sha256 为文件字节的 hex；已锁文件不可再改）。`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移时间戳晚于已锁最新（`20261105091000`）。
- `test:db`（`scripts/ci/research-db.ts`）启动本地 PostgreSQL 17，按序执行全部迁移，再跑 vitest。集成测试用 `process.env.S4_TEST_STATE` 读 `adminUrl`，`describe.skipIf(!enabled)`。**任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 都必须加进 `scripts/ci/research-checks.ts` 的 `criticalSuites`。** 重放迁移用计划一的 `replayMigration` 助手（`lock_timeout='3s'`，55P03/40P01 重试）——复制到新测试文件（它未导出）。
- 本地 harness 只建了 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)`；迁移里对桶只能 `insert into storage.buckets … on conflict (id) do update`，不要引用 `storage.objects`。
- 本地与托管都是 PostgreSQL 17：`unique nulls not distinct` 可用。本地 `supabase/config.toml` `max_rows = 1000`：返回表的函数会被截断，所以 `read_facts` 返回单个 `jsonb` 信封。
- 托管实例 `postgres` 角色**不是**超级用户：`security definer` 函数的 owner 就是迁移角色；函数内 `set search_path = public`；不要 `alter function … owner to`。
- 权限模式（规格 §4.7）：事实层五表对 `public, anon, authenticated, service_role` 先 `revoke all`，再 `grant select`（按表），**没有角色有 insert/update/delete**，例外只有 `filings` 三列对 `service_role` 的列级 `update` 与 `fact_sync_scope` 的 `reconcile_fact_sync_scope` 函数。Supabase 默认给 `anon/authenticated` 新函数 EXECUTE：每个函数后面显式 `revoke execute on function … from public, anon, authenticated` 再 `grant` 给需要的角色。
- 管理员门禁 `requireAdminUser()`（`src/lib/admin/auth.ts`）；服务端写库 `getAdminSupabase()`；公共读 `getAnonSupabase()`（`src/lib/supabase/anon.ts`）。
- `src/lib/supabase/database.types.ts` 手工维护：新表加 `Row/Insert/Update` 接口并登记到 `Database['public']['Tables']`；新 RPC 不登记到 `Functions`（用 `rpc` 时按 `getQuoteAlertSupabase` 的窄类型办法或 `as never` 调用，见 `src/lib/supabase/admin.ts` 的注释）。
- 提交：`git commit` 单独执行（仓库钩子会拦截同一命令里出现的 `-n`，包括 `grep -n`）；提交信息末尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- 测试命令：`npm test -- <path>`、`npm run typecheck`、`npm run lint`、`npm run test:db`（本机需 `LC_ALL=C` 且 PostgreSQL 17 在 PATH，只对 `test:db`/`test:migrations` 设置，不要导出给 `npm test`）、`npm run test:migrations`。
- 代码风格：计划一的 `src/lib/dq`、`src/lib/entities` 用紧凑风格（单空格缩进、少空行）；新文件沿用。每个文件顶部一段注释说明职责与规格条目。
- 环境变量：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`CRON_SECRET`、`EDGAR_USER_AGENT`（缺省 `DEFAULT_USER_AGENT` 来自 `src/lib/research/ingest/collectors/shared.ts`）、`TUSHARE_TOKEN`（本机没有；A 股夹具录制需 owner 提供，`node --env-file=<仓库外文件>`）、`VERCEL_GIT_COMMIT_SHA`。
- 本机没有 `TUSHARE_TOKEN`：F2-4 的夹具录制步骤若无法执行，按规格 §12 降级——交付单测与"未核对"记录，`sync-cn.integration.test.ts` 不创建，CN cron 不加入 `vercel.json`。

## 文件结构

```
supabase/migrations/20261106090000_financial_facts.sql     五表 + 桶 + 函数 + 触发器 + 权限
supabase/migrations.lock.json                              追加 1 条
src/lib/supabase/database.types.ts                         + Filing / FinancialFact / FinancialMetric / FactSyncRun / FactSyncScope
src/lib/facts/types.ts            共享类型（本文件 §共享契约 原样落地；Task 2）
src/lib/facts/db.ts               FactsDb 接口 re-export + FactsDbError + supabaseFactsDb + 信封/行归一助手（Task 2）
src/lib/facts/memory-facts-db.ts  内存实现 memoryFactsDb(tables?)（单测；Task 2）
src/lib/facts/db-contract.ts      内存与 pg 共用的 FactsDb 契约用例 factsDbContract（非测试文件；Task 2）
src/lib/facts/pg-facts-db.ts      pg 实现 pgFactsDb(pool)（集成测试；Task 3）
src/lib/facts/db.test.ts          内存契约 + supabaseFactsDb 桩测试（Task 2）
src/lib/facts/facts.integration.test.ts                    迁移/函数/触发器/权限 + pg 契约与并发（critical；Task 1、3）
src/lib/facts/concepts.ts         FACT_CONCEPTS、CONCEPT_IDS、MAPPING_GEN、MAPPING_VERSION、tushareFieldsFor（Task 4）
src/lib/facts/units.ts            normalizeUnit(raw) / rawUnitOf / allowedUnits / unitKindOf（Task 4）
src/lib/facts/json-numbers.ts     scanJsonNumbers / decodeWithSchema / decodeColumns / canonicalDecimal / decimalEquals（Task 4）
src/lib/facts/classify.ts         classifyDuration（period → Duration | 'odd'）（Task 4）
src/lib/facts/keys.ts             factKey / candidateKey / sameDayConflictKey / ambiguousKey / identityKey（§5.2 K 与 §7.1 自然键的唯一渲染点；Task 5）
src/lib/facts/plan.ts             planFactWrites（纯；Task 5）
src/lib/facts/rules.ts            evaluateFactRules / mergeWarnings / summarizeWarnings（复用 src/lib/dq/rules.ts；Task 6）
src/lib/facts/read.ts             sequencesOf / currentFacts（read_facts 语义的纯参考实现，供单测与派生；Task 7）
src/lib/facts/errors.ts           SyncError / SyncErrorCode（§10 非数据库错误；Task 8）
src/lib/facts/snapshot-store.ts   SnapshotStore 接口 + supabaseSnapshotStore + memorySnapshotStore（Task 8）
src/lib/facts/sync.ts             runFactsSync / syncIssuerFacts / SyncDeps / SyncReceipt（Task 8）
src/lib/facts/scope.ts            reconcileScope / fetchKey（Task 14）
src/lib/facts/derive.ts           deriveMetrics（纯）+ materialize（Task 15）
src/lib/facts/public-route.ts     三条公共读路由共用的参数/缓存/行形状约定（Task 16）
src/lib/facts/deps.ts             productionSyncDeps / resolveCodeVersion（cron 与脚本共用；Task 17）
src/lib/facts/providers/shared.ts               ProviderError(=SyncError) / snapshotOf / rawHashOf / stringifyPreservingNumbers（Task 10）
src/lib/facts/providers/edgar-companyfacts.ts   fetchCompanyFacts / parseCompanyFacts（Task 10）
src/lib/facts/providers/tushare-statements.ts   fetchTushareStatements / parseTushareStatements / coverageSummary（Task 12）
src/lib/facts/providers/tushare-fixtures.ts     loadTushareFixtures（测试与脚本共用；Task 12）
src/lib/facts/providers/cninfo-link.ts          linkCninfoFiling（Task 13）
src/lib/facts/fixtures/edgar/*.json, fixtures/tushare/_synthetic/*.json（+ 有 token 时 fixtures/tushare/*.json）, fixtures/cninfo/*.json, fixtures/gold/plan2.json
src/lib/facts/*.test.ts, src/lib/facts/providers/*.test.ts   单测
src/lib/facts/sync-us.integration.test.ts        录制回放（critical；Task 11，含"物化两次一致"用例——Task 11 在 Task 15 之后执行，见推荐顺序）
src/lib/facts/sync-cn.integration.test.ts        只在 A 股真实夹具存在时创建（critical；Task 13）
src/lib/dq/batches.ts             INFO_CODES += rule_warning_summary, coverage_summary, deadline_hit（Task 6）
src/lib/dq/facts-resolver.ts      resolveFactsItem（钩子；Task 9）
src/lib/data/sources/tushare.ts                  + tushareCallRaw（Task 12）；src/lib/data/sources/tushare-raw.test.ts
src/app/api/admin/dq/quarantine/[id]/route.ts    接入钩子（facts.* 走 resolve_facts_quarantine；Task 9）
src/app/api/facts/[ticker]/route.ts              GET 事实（Task 16）
src/app/api/facts/[ticker]/metrics/route.ts      GET 派生指标（Task 16）
src/app/api/filings/[ticker]/route.ts            GET 文件（Task 16）
src/app/api/financials/[ticker]/route.ts         + Deprecation / Link 头（Task 16）
src/app/api/cron/facts-sync/route.ts             cron 触发（Task 17）
scripts/facts/sync.ts  scripts/facts/materialize.ts  scripts/facts/record-fixture.ts   （Task 17、17、10/12/13）
scripts/ci/research-checks.ts                    criticalSuites += 三个集成测试（Task 1、11、13）
vercel.json                                      + facts-sync?market=US（Task 17）
docs/runbooks/data-foundation.md                 + 第 8 章 披露事实库（Task 18；8.7 核对表由 Task 12/13 的记录填写）
docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md   实施记录（Task 12 创建；Task 13、18 追加）
docs/superpowers/specs/…-2-disclosure-facts-design.md             §16 偏差记录（Task 18）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/facts/types.ts` 原样落地）

```ts
// src/lib/facts/types.ts
// Shared contract of the facts layer (plan 2 §共享契约, spec §4.8). Every task uses these names
// verbatim. FactsDb has three implementations: supabaseFactsDb (db.ts, rpc), memoryFactsDb
// (memory-facts-db.ts, unit tests), pgFactsDb (pg-facts-db.ts, integration tests).
export type Market='US'|'CN';
export type Statement='IS'|'BS'|'CF'|'DEI';
export type Duration='3M'|'6M'|'9M'|'12M'|'INSTANT';
export type MetricDuration=Duration|'TTM';
export type FactStatus='staged'|'ok'|'quarantined';
export type RunStatus='staged'|'published'|'abandoned';
export type FormType='10-K'|'10-Q'|'20-F'|'40-F'|'10-K/A'|'10-Q/A'|'20-F/A'|'annual'|'semiannual'|'q1'|'q3'|'restatement'|'other';
export type Origin='sec'|'sse'|'szse'|'bse';
export type Source='edgar'|'tushare';
export type UnitKind='money'|'shares'|'per_share';

export interface ConceptDef{
 id:string;statement:Statement;nature:'duration'|'instant';unitKind:UnitKind;
 usGaap:string[];ifrs:string[];
 tushare:{api:'income'|'balancesheet'|'cashflow';field:string}|{api:'income'|'balancesheet'|'cashflow';sum:string[]}|null;
 notes?:string;
}

/** 一个解析出的候选事实（value 为规范十进制字符串，§6.2） */
export interface FactCandidate{
 concept:string;sourceConcept:string;statement:Statement;
 periodStart:string|null;periodEnd:string;duration:Duration;
 value:string;unit:string;consolidation:'consolidated';
 filingRef:string;                 // = FilingCandidate.sourceRef
 rawHash:string;
}
export interface FilingCandidate{
 sourceRef:string;market:Market;source:Source;origin:Origin;formType:FormType;
 fiscalYear:number|null;fiscalPeriod:'FY'|'Q1'|'Q2'|'Q3'|'H1'|'9M'|null;
 periodEnd:string|null;availableDate:string;url:string|null;
}
export interface ParseResult{candidates:FactCandidate[];filings:FilingCandidate[];skipped:{reason:string;n:number}[];ambiguous:{key:string;candidates:FactCandidate[]}[];oddDuration:FactCandidate[];missingAvailableDate:Record<string,unknown>[]}

export interface RawSnapshot{bytes:Uint8Array;sha256:string;meta:{source:Source;api?:string;url?:string;params?:Record<string,unknown>;fields?:string;fetched_at:string;http_status:number;has_more?:boolean;page?:number}}
export interface Budget{remainingMs():number;signal:AbortSignal}

export interface FactRow{
 fact_id:string;issuer_id:string;market:Market;filing_id:string;run_id:string;concept:string;source_concept:string;statement:Statement;
 period_start:string|null;period_end:string;duration:Duration;value:string;value_text:string;unit:string;consolidation:string;
 available_date:string;mapping_gen:number;mapping_version:string;status:FactStatus;raw_hash:string;created_at:string;
 disclosure_seq?:number;is_current?:boolean;is_revision?:boolean;   // 只有 readFacts 返回时带
}
export interface FilingRow{
 filing_id:string;issuer_id:string;market:Market;source:Source;origin:Origin;form_type:FormType;fiscal_year:number|null;fiscal_period:string|null;
 period_end:string|null;available_date:string;source_ref:string;url:string|null;document_ref:string|null;document_url:string|null;
 link_attempts:number;mapping_gen:number;run_id:string;created_at:string;
}
export interface ScopeRow{issuer_id:string;market:Market;reasons:string[];priority:number;fetch_key:string;next_due_at:string;lease_until:string|null;lease_batch_id:string|null;state_rev:number;last_attempt_at:string|null;last_success_at:string|null;last_batch_id:string|null;last_status:'success'|'failed'|null}
export interface MetricRow{issuer_id:string;market:Market;metric:string;period_start:string;period_end:string;duration:MetricDuration;value:string;unit:string;input_unit:string;basis:string;formula_version:string;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string}[];based_on_rev:number;as_of:string}
export interface ConflictItem{id:string;natural_key:string;fact_ids:string[];available_date:string;key:Record<string,string|null>}

export interface ReadFactsOptions{concepts:string[];asOf:string;from?:string;to?:string;history?:boolean;limit?:number;includeNonOk?:boolean}
export interface ReadFactsResult{stateRev:number;rows:FactRow[];truncated:boolean}

export type FactsDbErrorCode='lease_lost'|'run_pending'|'run_published'|'mapping_gen_regression'|'stale_computation'|'read_truncated'|'duplicate_key'|'unknown';
export class FactsDbError extends Error{constructor(public code:FactsDbErrorCode,message?:string){super(message??code);this.name='FactsDbError';}}

export interface FactsDb{
 claimLease(issuer:string,market:Market,batch:string,ttlSeconds:number):Promise<boolean>;
 beginRun(issuer:string,market:Market,batch:string,mappingGen:number):Promise<string>;
 /** source_ref → filing_id，含已存在者 */
 stageFilings(run:string,rows:FilingInsert[]):Promise<Map<string,string>>;
 stageFacts(run:string,rows:FactInsert[]):Promise<number>;
 quarantineFacts(run:string,factIds:string[],itemId:string):Promise<number>;
 publishRun(run:string,manifest:string[]):Promise<number>;
 abandonRun(run:string):Promise<void>;
 releaseLease(issuer:string,market:Market,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
 resolveFactsQuarantine(itemId:string,chosen:string[],resolvedBy:string):Promise<{promoted:number;skipped:number}>;
 replaceMetrics(issuer:string,market:Market,basedOnRev:number,rows:MetricRow[]):Promise<number>;
 readFacts(issuer:string,market:Market,opts:ReadFactsOptions):Promise<ReadFactsResult>;
 factsByIds(ids:string[]):Promise<FactRow[]>;
 openConflicts(issuer:string,market:Market):Promise<ConflictItem[]>;
 filingsOfIssuer(issuer:string,market:Market,opts:{from?:string;to?:string;limit?:number;unlinkedOnly?:boolean}):Promise<FilingRow[]>;
 updateFilingLink(filingId:string,patch:{document_ref?:string|null;document_url?:string|null;link_attempts:number}):Promise<void>;
 reconcileScope(market:Market,rows:{issuer_id:string;reasons:string[];priority:number;fetch_key:string}[]):Promise<number>;
 scopeDue(market:Market,now:string,limit:number):Promise<ScopeRow[]>;
 /** 指定发行人的 scope 行（不看 priority / next_due_at；缺行者不返回），供脚本 `--issuer` 与回放测试直指发行人（审计 round-1 #13） */
 scopeRows(market:Market,issuerIds:string[]):Promise<ScopeRow[]>;
 metricsOfIssuer(issuer:string,market:Market,formulaVersion:string):Promise<MetricRow[]>;
}
/** stageFilings 的输入行（写入端生成 filing_id） */
export interface FilingInsert extends FilingCandidate{filing_id:string;issuer_id:string}
/** stageFacts 的输入行（写入端生成 fact_id；status 由函数置 staged） */
export interface FactInsert{fact_id:string;issuer_id:string;market:Market;filing_id:string;concept:string;source_concept:string;statement:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit:string;consolidation:'consolidated';available_date:string;mapping_gen:number;mapping_version:string;raw_hash:string}
```

常量与命名：
- `MAPPING_GEN=1`，`MAPPING_VERSION='facts-map/1'`（`concepts.ts`）；`RULES_VERSION` 复用 `src/lib/dq/rules.ts`；`FORMULA_VERSION='facts-derive/1.0'`（`derive.ts`）。
- 批次：`producer='facts-sync'`，`dataset='facts.us' | 'facts.cn'`；`triggered_by` 按来源。
- 新信息码（加入 `INFO_CODES`）：`rule_warning_summary`、`coverage_summary`、`deadline_hit`。非信息码：`quota_exhausted`、`sec_unavailable`、`no_companyfacts`、`snapshot_too_large`、`snapshot_upload_failed`、`parse_error`、`lease_lost`、`mapping_gen_regression`、`stale_computation`、`read_truncated`、`duplicate_key`。
- 隔离 `dataset` = 批次 dataset；`table_name='financial_facts'`；`reason_code ∈ ambiguous_value | odd_duration | missing_available_date | same_day_conflict | identity_bs | identity_gp`；`natural_key` 格式见规格 §7.1；`payload` 对象：`{key:{…}, fact_ids:[…], run_id, candidates?, values?, rule?, detail?}`。
- SQL 函数名（`public.`）：`reconcile_fact_sync_scope(p_market text, p_rows jsonb) returns int`、`claim_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_ttl_seconds int) returns boolean`、`begin_sync_run(p_issuer uuid, p_market text, p_batch uuid, p_mapping_gen int) returns uuid`、`stage_filings(p_run uuid, p_rows jsonb) returns jsonb`、`stage_facts(p_run uuid, p_rows jsonb) returns int`、`quarantine_facts(p_run uuid, p_fact_ids uuid[], p_item uuid) returns int`、`publish_sync_run(p_run uuid, p_manifest uuid[]) returns int`、`abandon_sync_run(p_run uuid) returns void`、`release_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_outcome text, p_next_due timestamptz) returns void`、`resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid) returns jsonb`、`replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb) returns int`、`fact_state_rev(p_issuer uuid, p_market text) returns bigint`、`read_facts(p_issuer uuid, p_market text, p_concepts text[], p_as_of date, p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false) returns jsonb`。错误用 `raise exception '<code>' using errcode='<sqlstate>'`：`lease_lost`→`55P03`，`run_pending`/`run_published`/`mapping_gen_regression`/`stale_computation`→`P0001`（消息即 code）。`supabaseFactsDb` 把 PostgREST 错误消息里的 code 映射为 `FactsDbError.code`。
- 触发器：`financial_facts_lifecycle`、`filings_limited_update`（SQLSTATE `23514`，消息前缀 `append_only:`）。
- 路由：`GET /api/facts/[ticker]`、`GET /api/facts/[ticker]/metrics`、`GET /api/filings/[ticker]`、`GET|POST /api/cron/facts-sync`。错误体 `{error:{code,message}}`，`Cache-Control: no-store`。
- 脚本：`scripts/facts/sync.ts`、`scripts/facts/materialize.ts`、`scripts/facts/record-fixture.ts`。
- 夹具：`src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json`（AAPL）、`CIK0000789019.trimmed.json`（MSFT）、`fixtures/tushare/600519.SH.income.rt1.p1.json` 等、`fixtures/cninfo/600519.SH-2024-annual.json`、`fixtures/gold/plan2.json`。
- 黄金断言条目格式：`{issuer:{ticker,market}, concept, period_end, unit, value, source:{document,page_or_row,url}, recorded_by, recorded_at}`；文件顶层另有 `version`、`note`、`required:{US:boolean;CN:boolean}`，条目可选 `as_of`（断言所用 `asOf`，缺省今天）。

### 契约补充（各 Part 引入、定义在各自文件内；不进 `types.ts`，但跨 Part 调用必须按此签名）

以下签名是整合后的**定稿**（见文末"接口对齐记录"）；任一 Part 的代码若与此不同，以此为准改代码。

| 文件 | 导出 | 签名 / 形状 |
|---|---|---|
| `db.ts`（Task 2） | `toFactsDbError(e:PgErrorLike):FactsDbError`、`resultFromEnvelope`、`rowFromEnvelope`、`factRowFromTable`、`scopeFromTable`、`metricFromTable`、`metricArgs`、`filingArgs`、`readArgs`、`linkPatch`、`conflictFromItem`、`conflictPrefix`、`chunk`、`STAGE_CHUNK=500`、`READ_FACTS_CAP=10000`、`ReadFactsEnvelope`、`PgErrorLike` | 三实现共用的归一助手；`FactsDbError`、`FactsDb` 从 `db.ts` re-export |
| `memory-facts-db.ts`（Task 2） | `memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id']})):MemoryFactsDb` | `MemoryFactsDb extends FactsDb{tables;setNow(iso|null);expireLease(issuer,market);runs():MemoryRun[];filings():FilingRow[];facts():FactRow[];metrics():MetricRow[];scope():ScopeRow[]}`——`runs()` 等是**方法**，不是 Map |
| `db-contract.ts`（Task 2） | `factsDbContract(label,setup:()=>Promise<ContractHarness>)`、`ContractHarness`、`filingInsert(issuer,o?)`、`factInsert(issuer,filing,o?)` | 内存与 pg 契约共用 |
| `pg-facts-db.ts`（Task 3） | `pgFactsDb(pool:Pool):FactsDb` | 仅测试 |
| `concepts.ts`（Task 4） | `FACT_CONCEPTS:readonly ConceptDef[]`、`CONCEPT_IDS`、`MAX_READ_CONCEPTS`、`MAPPING_GEN=1`、`MAPPING_VERSION='facts-map/1'`、`conceptById`、`isConceptId`、`conceptsForTushare(api):readonly ConceptDef[]`、`tushareFieldsFor(api)` | 目录是 `readonly`；所有接受概念列表的参数（`ParseOptions.concepts`、`ParseTushareOptions.concepts`、`FetchTushareOptions.concepts`、`fieldsFor(api,concepts)`）一律 `readonly ConceptDef[]`（审计 round-1 #4） |
| `units.ts`（Task 4） | `normalizeUnit(raw:string):string|null`、`rawUnitOf(kind,currency='CNY')`、`allowedUnits(kind)`、`unitKindOf(unit):UnitKind|null`、`CURRENCIES`、`MAX_UNIT_LENGTH` | **单参数**；按概念单位种类过滤由调用方用 `unitKindOf(normalized)===concept.unitKind` 完成（Task 10） |
| `classify.ts`（Task 4） | `classifyDuration(start:string|null,end:string):Duration|'odd'`、`daysBetween`、`dateMs`、`isDate`、`DURATION_BANDS` | odd 用字面量 `'odd'`，**不是** `null` |
| `json-numbers.ts`（Task 4） | `scanJsonNumbers(input:Uint8Array|string):unknown`、`decodeWithSchema(value,schema:NumberSchema,field?)`、`decodeColumns(fields,items,schema)`、`canonicalDecimal(raw):string`、`decimalEquals(a,b)`、`NumberSchema`、`EDGAR_NUMBER_SCHEMA`、`TUSHARE_CONTROL_FIELDS`、`NumToken`、`isNumToken`、`decodeNumber` | |
| `keys.ts`（Task 5） | `FactKey`、`factKey(k)`、`candidateKey(k,filingId,gen)`、`sameDayConflictKey(issuer,market,k,date)`、`ambiguousKey(issuer,market,k,sourceRef,gen)`、`identityKey(issuer,market,'IS'|'BS',ps,pe,unit,sourceRef,gen)`、`keyComponents(issuer,market,k)` | §7.1 自然键的唯一渲染点；`period_start=null` 渲染为空段 |
| `plan.ts`（Task 5） | `planFactWrites(input:PlanInput):PlanResult` | `PlanInput={existing:FactRow[];openConflicts:ConflictItem[];candidates:FactCandidate[];filingCandidates:FilingCandidate[];filings:Map<sourceRef,filing_id>;issuerId;market;mappingGen;mappingVersion;newId?}`；`PlanResult={inserts:FactInsert[];counts;duplicates;ambiguous:PlanAmbiguous[];conflicts:PlanConflict[];contestedJoins;outcomes:Map<fact_id,'inserted'|'versioned'|'quarantined'>;quarantinedFactIds}` |
| `rules.ts`（Task 6） | `evaluateFactRules(input:FactRulesInput):FactRulesResult`、`mergeWarnings`、`summarizeWarnings`、`IDENTITY_TOLERANCE`、`GROSS_MARGIN_RANGE`、`REVENUE_MAX_JUMP`、`WARNING_RULES` | `FactRulesInput={newRows:FactInsert[];okRows:FactRow[];sourceRefOf:Map<filing_id,source_ref>;issuerId;market;mappingGen}` |
| `read.ts`（Task 7） | `sequencesOf(rows,opts:SequenceOptions):FactRow[]`、`currentFacts(rows,opts)` | 骨架名 `readCurrentFacts / sequences` 作废 |
| `errors.ts`（Task 8） | `SyncError{code:SyncErrorCode}`、`SyncErrorCode='quota_exhausted'|'sec_unavailable'|'no_companyfacts'|'snapshot_too_large'|'snapshot_upload_failed'|'parse_error'|'code_version_unavailable'|'tushare_unavailable'` | 抓取器/解析器抛的就是它（Part C 的 `ProviderError` 是它的别名） |
| `snapshot-store.ts`（Task 8） | `SnapshotStore{put(snapshot,path,budget):Promise<'stored'|'exists'>}`、`supabaseSnapshotStore(admin)`、`memorySnapshotStore()`、`snapshotPath(source,issuerId,sha256)`、`metaPath`、`SNAPSHOT_BUCKET` | |
| `sync.ts`（Task 8） | `runFactsSync(deps:SyncDeps,opts:SyncOptions):Promise<SyncReceipt>`、`syncIssuerFacts`、`makeBudget`、`resolveCodeVersion(env?,exec?)`、`LEASE_TTL_S` 等常量 | `SyncDeps={db;tables;storage;fetchUs(cik10,b);fetchCn(tsCode,sinceYear,b);parseUs(snapshot,{sinceYear});parseCn(snapshots,{sinceYear});linkCn?(filing:FilingRow,b);coverageCn?(parsed:ParseResult):CoverageEntry[];now;deadline;codeVersion:string|null}`；`SyncOptions={market;limit;issuerIds?;dryRun;triggeredBy;sinceYear?;mappingGen?}`；`SyncReceipt={batchId:string|null;status:BatchStatus|'dry_run';counts;errors;issuers:IssuerOutcome[];idle;detail:{attempted,published,failed,skipped,idle}}`；`IssuerOutcome={issuerId;fetchKey;runId:string|null;outcome:'published'|'planned'|'failed'|'skipped';code?;counts;errors;warnings:Map;snapshotSha256:string[]}`；`issuerIds` 给定时**不**先对账范围、不受 `next_due_at` 限制：scope 行用 `db.scopeRows` 直取，缺行者 apply 模式由 `scopeRowFor` 算出后 `reconcileScope` 补建（`reasons:['explicit']`），dry-run 构造只读行，算不出 `fetch_key` 的发行人以 `outcome:'failed', code:'scope_unresolved'` 计入回执（审计 round-1 #13） |
| `facts-resolver.ts`（Task 9） | `resolveFactsItem(db,tables,item,input):Promise<FactsResolveResult>`、`HookState`、`FactsResolveOutcome`、`ResolveFactsInput`、`FACT_ROW_REASONS` | |
| `providers/shared.ts`（Task 10） | `ProviderError`（= `SyncError`）、`ProviderErrorCode`（= `SyncErrorCode`）、`sha256Hex`、`rawHashOf(snapshotSha256,locator)`、`snapshotOf(bytes,meta)`、`padCik`、`sleep`、`ymd`、`nearestDuration`、`budgetFor`、`stringifyPreservingNumbers` | `raw_hash = sha256Hex(`${snapshot.sha256}\n${locator}`)`；EDGAR locator `facts.<tax>.<tag>.units.<rawUnit>[accn=…,start=…,end=…]`，Tushare locator `<api>:rt<n>:p<k>[end_date=…,ann=…,update_flag=…,row=…]` |
| `providers/edgar-companyfacts.ts`（Task 10） | `fetchCompanyFacts(cik10,budget,opts?)`、`parseCompanyFacts(snapshot,{concepts?,sinceYear?,today?})`、`companyFactsUrl`、`tagsOf`、`decodeCompanyFacts`、`mapForm`、`mapFp` | |
| `providers/tushare-statements.ts`（Task 12） | `fetchTushareStatements(tsCode,sinceYear,budget,opts?)`、`parseTushareStatements(snapshots,{concepts?,sinceYear?,today?})`、`coverageSummary(result)`、`fieldsFor(api)`、`addDecimals`、`isTushareQuotaMessage` | |
| `providers/cninfo-link.ts`（Task 13） | `linkCninfoFiling(filing:LinkFiling,issuer:LinkIssuer,opts:LinkOptions):Promise<CninfoLinkResult>`、`matchesAnnouncement`、`cninfoQueryBody`、`CNINFO_PAGE_SIZE` | `LinkFiling={form_type;fiscal_year;period_end;available_date;corrected?}`、`LinkIssuer={ts_code;cninfo_org_id}`、`LinkOptions={fetch?;userAgent?;budget;minIntervalMs?}`；`SyncDeps.linkCn(filing:FilingRow,b)` 由 `deps.ts` 包装（Task 17） |
| `src/lib/data/sources/tushare.ts`（Task 12） | `tushareCallRaw(api,params,fields,opts?):Promise<TushareRaw>`、`TushareRaw`、`TushareRawOptions` | |
| `scope.ts`（Task 14） | `reconcileScope(deps:{tables;db:Pick<FactsDb,'reconcileScope'>},market,opts?:{today?}):Promise<ScopeReconcileResult>`、`fetchKey(market,{cik?|ticker?})`、`scopeRowFor(tables,market,issuerId,opts?:{today?}):Promise<ScopeInputRow|null>`、`currentSecurities(tables,today)` | `ScopeReconcileResult={desired;retired;changed;skipped}`；`ScopeInputRow={issuer_id;reasons;priority;fetch_key}`；有效期谓词复用 `src/lib/entities/resolve.ts` 导出的 `isCurrentSecurity(row,today)`（`valid_from <= today && (valid_to is null || valid_to > today)`） |
| `derive.ts`（Task 15） | `deriveMetrics(rows,{market,asOf,basedOnRev?}):MetricRow[]`、`materialize(db:Pick<FactsDb,'readFacts'|'replaceMetrics'>,issuer,market,opts?:{today?}):Promise<MaterializeResult>`、`FORMULA_VERSION='facts-derive/1.0'`、`DERIVE_CONCEPTS`、`Q_SINGLE_CONCEPTS`、`metricNames(market)` | `MaterializeResult={rows;stateRev;retried}` |
| `public-route.ts`（Task 16） | `readParams`、`dateParam`、`intParam`、`listParam`、`asOfParam`、`flagParam`、`errorResponse`、`paramErrorResponse`、`resolvePublicIssuer`、`publicClients`、`successHeaders`、`citationOf`、`publicFiling`、`publicFact`、`TICKER_RE`、`UUID_RE`、`QueryError` | |
| `deps.ts`（Task 17） | `productionSyncDeps({deadline,codeVersion,now?}):SyncDeps`、`resolveCodeVersion({allowGit}):string|null` | 后者委托 `sync.ts` 的 `resolveCodeVersion` |

### 规格覆盖表

| 规格条目 | 任务 |
|---|---|
| §3 概念目录、单位、`MAPPING_GEN/VERSION` | Task 4 |
| §4.1–§4.5 五表、`fact_sync_scope`、全部 SQL 函数（含 `promote_quarantined`、`fact_state_rev`） | Task 1 |
| §4.6 `read_facts` 信封与 10,000 上限 | Task 1（SQL）、Task 2（归一）、Task 7（纯参考实现） |
| §4.7 权限/策略/桶、快照路径、`raw_hash` | Task 1（权限与桶）、Task 8（`snapshot-store.ts`）、Task 10/12（`raw_hash` 定位规则） |
| §4.8 `FactsDb` 三实现 | Task 2（契约、Supabase、内存）、Task 3（pg） |
| §5.1 可得日期 | Task 10（EDGAR `filed`）、Task 12（Tushare `f_ann_date ?? ann_date`）、Task 5/8（缺失 → `missing_available_date`） |
| §5.2 读取时的版本（序列、`is_revision`、代过滤） | Task 1（SQL 窗口）、Task 7（`sequencesOf`）、Task 2（内存实现） |
| §5.3 写入时的重复与冲突 | Task 5（`planFactWrites`）、Task 8（并入与处置的调用顺序） |
| §5.4 并发、原子性 | Task 1（函数内锁）、Task 3（并发用例） |
| §6.1 同步核心、批次、新鲜度、截止、`code_version` | Task 8；`code_version` 解析与装配 Task 17 |
| §6.2 EDGAR 适配器与数值解码 | Task 4（`json-numbers.ts`）、Task 10 |
| §6.3 Tushare 三表、分页、`coverage_summary`、巨潮挂接 | Task 12、Task 13 |
| §6.4 范围 | Task 14 |
| §6.5 触发（cron、脚本、`vercel.json`） | Task 17 |
| §7.1 隔离五类与自然键 | Task 5（`keys.ts`、`ambiguous_value`、`same_day_conflict`）、Task 6（`identity_*`）、Task 8（`odd_duration`、`missing_available_date` 落库） |
| §7.2 警告与 `INFO_CODES` | Task 6 |
| §7.3 处理钩子与路由 | Task 9 |
| §8 派生层与 `materialize` | Task 15 |
| §9 读取接口与弃用头 | Task 16 |
| §10 错误处理 | Task 8（核心错误流）、Task 10/12（抓取码）、Task 15（`stale_computation` 重算） |
| §11.1 单元测试 | Task 2、4、5、6、7、8、9、10、12、13、14、15、16、17 |
| §11.2 数据库测试 | Task 1、3 |
| §11.3 离线集成 | Task 11（美股，含物化两次一致用例）、Task 13（A 股，条件创建） |
| §11.4 黄金断言 | Task 11（模板与条件断言）、Task 13（CN） |
| §11.5 清单规则 | Task 1、11、13（`criticalSuites`） |
| §12 分期与退出条件 | F2-0 = Task 1–3；F2-1 = 4–7；F2-2 = 8–9；F2-3 = 10–11；F2-4 = 12–13；F2-5 = 14、17；F2-6 = 15–16；F2-7 = 18 |
| §13 独立验证（SEC dry-run 3 家） | Task 18 Step 4 |
| §14 owner 事项 | Task 18（runbook 8.11） |
| §15 开放问题第 1 条（Tushare 核对） | Task 12 Step 10（核对）、Task 18 Step 2（8.7 表） |
| §16 实施记录与偏差 | Task 18 Step 3 |

任务编号：Part A = Task 1–3（F2-0）；Part B = Task 4–9（F2-1、F2-2）；Part C = Task 10–13（F2-3、F2-4）；Part D = Task 14–18（F2-5、F2-6、F2-7）。各任务独立可提交；后一任务只依赖前一任务已合入的导出名。

**执行顺序（必须按此顺序整任务执行；审计 round-1 #20 消除了原顺序的循环）**：

| 序 | 任务 | 依赖（必须已合入） |
|---|---|---|
| 1 | Task 1 → 2 → 3 | — |
| 2 | Task 4 → 5 → 6 → 7 | Task 2 的 `types.ts` |
| 3 | Task 14（`scope.ts`）→ Task 15（`derive.ts`，只含纯实现与单测，**不碰**任何集成测试文件） | Task 2、4、7 |
| 4 | Task 8 → 9 | Task 14、15（`sync.ts` 直接 import `./scope` 与 `./derive`） |
| 5 | Task 10 → 11 → 12 → 13 | Task 8；Task 11 的 `sync-us.integration.test.ts` 自带"物化两次一致"用例（`derive.ts` 此时已存在） |
| 6 | Task 16 → 17 → 18 | Task 15、8、13 |

任何任务都不得修改比它晚执行的任务创建的文件；Task 15 不再追加 `sync-us.integration.test.ts`。

---


## Part A：Task 1–3（工作包 F2-0：迁移、函数、`FactsDb` 三实现）

规格条目：§4.1–§4.8、§5.4、§11.2。共享契约名字全部按骨架原样使用。

**本部分新增导出**（骨架未列、本部分定义，后续 Part 可直接 import）：
- `src/lib/facts/db.ts`：`toFactsDbError(e)`、`resultFromEnvelope(env)`、`rowFromEnvelope(r)`、`factRowFromTable(r)`、`scopeFromTable(r)`、`metricFromTable(r)`、`metricArgs(row)`、`filingArgs(rows)`、`readArgs(issuer,market,opts)`、`linkPatch(patch)`、`conflictFromItem(item)`、`conflictPrefix(issuer,market)`、`chunk(rows,size)`、常量 `STAGE_CHUNK=500`、`READ_FACTS_CAP=10000`、类型 `ReadFactsEnvelope`、`PgErrorLike`。
- `src/lib/facts/memory-facts-db.ts`：`memoryFactsDb(tables?)` 返回 `MemoryFactsDb`（`FactsDb` + `tables`、`setNow`、`expireLease`、`runs()/filings()/facts()/metrics()/scope()` 快照）；`numericEquals(a,b)`（规范十进制字符串相等，Part B 的 `decimalEquals` 落地后可替换）。
- `src/lib/facts/db-contract.ts`（新文件，非测试文件）：`factsDbContract(label, setup)` 与 `ContractHarness` 类型——内存与 pg 两实现共用的契约用例；`filingInsert()`、`factInsert()` 夹具工厂。
- `src/lib/db/pg-table-client.ts`：`typeParsers` 改为导出（一行改动，Task 3）。
- SQL 侧骨架未列但本部分定义的函数：`promote_quarantined(p_issuer uuid, p_market text, p_fact_ids uuid[]) returns int`（规格 §4.5 表内有）；内部助手 `fact_scope_lock`、`fact_run_lock`、`fact_abandon_run`、`fact_promote_rows`、`fact_item_members(jsonb) returns uuid[]`（不授予任何客户端角色；回滚时先于表删除，见 runbook 8.10）。骨架之外的异常消息：`run_abandoned`、`item_not_open`（P0001，程序错误路径，映射为 `unknown`）、`run_not_found`（P0002）、`invalid_market`/`invalid_rows`/`invalid_chosen`/`invalid_ttl`/`invalid_mapping_gen`/`invalid_outcome`/`invalid_resolver`（22023）。

---

### Task 1: 事实库迁移 + 锁文件 + Row 类型 + 集成测试

**Files:**
- Create: `supabase/migrations/20261106090000_financial_facts.sql`
- Modify: `supabase/migrations.lock.json`
- Modify: `src/lib/supabase/database.types.ts`
- Create: `src/lib/facts/facts.integration.test.ts`
- Modify: `scripts/ci/research-checks.ts:15`

- [ ] **Step 1: 写集成测试（真实 PostgreSQL，先失败）**

```ts
// src/lib/facts/facts.integration.test.ts
// F2-0 (spec §4, §5.4, §11.2): the financial_facts migration on real PostgreSQL — five tables, the
// disclosure-raw bucket, constraints, both triggers, every SQL function (lease, run lifecycle,
// publish with conflict disposition and mapping_gen activation, resolve/promote, metrics,
// read_facts envelope, scope reconcile), real role privileges, and (Task 3) the pgFactsDb contract.
// Rows are never cleaned up: filings and published facts are append-only by design and test:db
// creates a fresh database for every run; every test uses its own issuer.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261106090000_financial_facts.sql';
const TABLES=['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'];

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=3):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,500));
  }finally{c.release();}
 }
}

type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string};
type Envelope={state_rev:number;rows:Record<string,unknown>[];truncated:boolean;row_count:number};

describe.skipIf(!enabled)('F2-0 financial facts migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Test')`,[id]);return id;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[id]);return id;};
 const scope=(iss:string)=>one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
 const claim=(iss:string,b:string,ttl=600)=>one(`select public.claim_fact_sync_lease($1,'US',$2,$3) v`,[iss,b,ttl]);
 const begin=(iss:string,b:string,gen=1)=>one(`select public.begin_sync_run($1,'US',$2,$3) v`,[iss,b,gen]);
 const filing=async(run:string,available='2024-02-01',sourceRef=randomUUID())=>{
  const id=randomUUID();
  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:available,source_ref:sourceRef,url:null}])]);
  return m[sourceRef] as string;
 };
 const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:'facts-map/1',raw_hash:'h'});
 const stage=async(run:string,rows:FactSpec[])=>{const full=rows.map(factRow);const n=await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(full)]);return {n:n as number,ids:full.map(r=>r.fact_id)};};
 const quarantine=(run:string,ids:string[],item:string)=>one(`select public.quarantine_facts($1,$2::uuid[],$3) v`,[run,ids,item]);
 const publish=(run:string,manifest:string[])=>one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,manifest]);
 const abandon=(run:string)=>q(`select public.abandon_sync_run($1)`,[run]);
 const resolve=(item:string,chosen:string[],by=randomUUID())=>one(`select public.resolve_facts_quarantine($1,$2::uuid[],$3) v`,[item,chosen,by]);
 const promote=(iss:string,ids:string[])=>one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[iss,ids]);
 const status=async(id:string)=>(await q(`select status from public.financial_facts where fact_id=$1`,[id]))[0]?.status??null;
 const runStatus=async(run:string)=>(await q(`select status from public.fact_sync_runs where run_id=$1`,[run]))[0].status;
 const rev=(iss:string)=>one(`select public.fact_state_rev($1,'US') v`,[iss]).then(Number);
 const read=async(iss:string,o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[iss,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as Envelope;
 const conflictItem=async(iss:string,b:string,run:string,factIds:string[],date='2024-02-01')=>{
  const id=randomUUID();
  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'same_day_conflict',$3,$4::jsonb)`,
   [id,`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,b,JSON.stringify({key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:factIds,values:[],run_id:run})]);
  return id;
 };
 const item=async(id:string)=>(await q(`select status,payload->'fact_ids' fact_ids,detail->'chosen_fact_ids' chosen from public.dq_quarantine where id=$1`,[id]))[0];
 /** A leased issuer with one published run: filing f0 (2024-01-01) carries r0 = revenue 90, filing f (2024-02-01) carries r = revenue 100 for the same key. state_rev = 1. */
 const published=async()=>{
  const iss=await issuer();const b=await batch();expect(await scope(iss)).toBe(1);expect(await claim(iss,b)).toBe(true);
  const run=await begin(iss,b);const f0=await filing(run,'2024-01-01');const f=await filing(run);
  const {ids:[r0]}=await stage(run,[{filing_id:f0,value:'90',available_date:'2024-01-01'}]);
  const {ids:[r]}=await stage(run,[{filing_id:f,value:'100'}]);
  expect(await publish(run,[f0,f])).toBe(2);
  return {iss,b,run,f0,f,r0,r};
 };

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates five RLS tables, the disclosure-raw bucket, select-only grants, function grants, and replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect(await q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='disclosure-raw'`)).toEqual([{id:'disclosure-raw',public:false,file_size_limit:'52428800',allowed_mime_types:['application/json']}]);
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)for(const p of ['INSERT','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const role of ['anon','authenticated'])for(const t of TABLES)expect({role,t,ok:await priv(role,t,'UPDATE')}).toEqual({role,t,ok:false});
  for(const t of TABLES)expect({t,ok:await priv('service_role',t,'UPDATE')}).toEqual({t,ok:false});   // table-level UPDATE: none (filings has a column grant only)
  for(const t of ['filings','financial_facts','financial_metrics'])for(const role of ['anon','authenticated','service_role'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
  for(const t of ['fact_sync_runs','fact_sync_scope']){for(const role of ['anon','authenticated'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:false});expect(await priv('service_role',t,'SELECT')).toBe(true);}
  expect(await one(`select has_column_privilege('service_role','public.filings','document_ref','UPDATE') v`)).toBe(true);
  expect(await one(`select has_column_privilege('service_role','public.filings','link_attempts','UPDATE') v`)).toBe(true);
  expect(await one(`select has_column_privilege('service_role','public.filings','mapping_gen','UPDATE') v`)).toBe(false);
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const role of ['anon','authenticated','service_role']){
   expect(await fn(role,'public.read_facts(uuid,text,text[],date,date,date,boolean,int,boolean)')).toBe(true);
   expect(await fn(role,'public.fact_state_rev(uuid,text)')).toBe(true);
  }
  for(const sig of ['public.begin_sync_run(uuid,text,uuid,int)','public.reconcile_fact_sync_scope(text,jsonb)','public.resolve_facts_quarantine(uuid,uuid[],uuid)','public.replace_financial_metrics(uuid,text,bigint,jsonb)']){
   for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
   expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
  }
  for(const role of ['anon','authenticated','service_role'])expect(await fn(role,'public.fact_promote_rows(uuid,text,uuid[])')).toBe(false);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },30000);

 it('enforces the candidate key (nulls not distinct), both composite foreign keys, the period checks, and keeps 20-digit values exact',async()=>{
  const iss=await issuer();const b=await batch();const run=randomUUID();
  await q(`insert into public.fact_sync_runs(run_id,issuer_id,market,batch_id,mapping_gen) values($1,$2,'US',$3,1)`,[run,iss,b]);
  const f=randomUUID();
  await q(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id) values($1,$2,'US','edgar','sec','10-K','2024-02-01',$3,$4)`,[f,iss,randomUUID(),run]);
  const ins=(cols:Record<string,unknown>)=>{
   const r:Record<string,unknown>={fact_id:randomUUID(),issuer_id:iss,market:'US',filing_id:f,run_id:run,concept:'total_assets',source_concept:'Assets',statement:'BS',period_start:null,period_end:'2023-12-31',duration:'INSTANT',value:'1',unit:'USD',available_date:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...cols};
   const k=Object.keys(r);return q(`insert into public.financial_facts(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));
  };
  await ins({});
  await expect(ins({})).rejects.toThrow(/financial_facts_candidate_key/);
  await ins({mapping_gen:2});                                                                   // another generation is another candidate
  await expect(ins({available_date:'2024-02-02',period_end:'2023-11-30'})).rejects.toThrow(/financial_facts_filing_date_fkey/);
  await expect(ins({issuer_id:randomUUID(),period_end:'2023-11-30'})).rejects.toThrow(/financial_facts_filing_fkey/);
  await expect(ins({period_start:'2023-12-31',duration:'3M'})).rejects.toThrow(/financial_facts_period/);
  await expect(ins({period_start:'2023-10-01',duration:'INSTANT',period_end:'2023-11-30'})).rejects.toThrow(/financial_facts_instant/);
  await ins({period_end:'2023-06-30',value:'12345678901234567890'});
  expect(await one(`select value_text v from public.financial_facts where run_id=$1 and period_end='2023-06-30'`,[run])).toBe('12345678901234567890');
 });

 it('triggers: facts are append-only with a status-only lifecycle; filings allow link columns and a rising mapping_gen; deletes are gated',async()=>{
  const iss=await issuer();const b=await batch();const run=randomUUID();
  await q(`insert into public.fact_sync_runs(run_id,issuer_id,market,batch_id,mapping_gen) values($1,$2,'US',$3,1)`,[run,iss,b]);
  const f=randomUUID();const g=randomUUID();
  await q(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id) values($1,$2,'US','edgar','sec','10-K','2024-02-01',$3,$4),($5,$2,'US','edgar','sec','10-Q','2024-02-01',$6,$4)`,[f,iss,randomUUID(),run,g,randomUUID()]);
  const id=randomUUID();
  const base=`insert into public.financial_facts(fact_id,issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash,status) values($1,$2,'US',$3,$4,'revenue','Revenues','IS','2023-10-01','2023-12-31','3M',100,'USD','2024-02-01',1,'facts-map/1','h',$5)`;
  await expect(q(base,[id,iss,f,run,'ok'])).rejects.toThrow(/append_only:/);
  await q(base,[id,iss,f,run,'staged']);
  await expect(q(`update public.financial_facts set value=101 where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await expect(q(`update public.financial_facts set raw_hash='h2' where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await expect(q(`update public.financial_facts set status='staged' where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  // Every permitted transition, as a plain UPDATE in a BEFORE trigger (round-1 #1: the generated
  // value_text is not computed for NEW yet, so the immutable-field check must not compare it).
  await q(`update public.financial_facts set status='ok' where fact_id=$1`,[id]);                 // staged → ok
  await expect(q(`update public.financial_facts set status='staged' where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[id]);        // ok → quarantined
  await q(`update public.financial_facts set status='ok' where fact_id=$1`,[id]);                 // quarantined → ok
  const id2=randomUUID();
  await q(base.replace("'2023-10-01','2023-12-31'","'2023-07-01','2023-09-30'"),[id2,iss,f,run,'staged']);
  await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[id2]);       // staged → quarantined
  await expect(q(`update public.financial_facts set status='staged' where fact_id=$1`,[id2])).rejects.toThrow(/append_only:/);
  expect((await q(`select value_text from public.financial_facts where fact_id=any($1::uuid[]) order by period_end`,[[id,id2]])).map(x=>x.value_text)).toEqual(['100','100']);
  await expect(q(`delete from public.financial_facts where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await expect(q(`update public.filings set url='x' where filing_id=$1`,[f])).rejects.toThrow(/append_only:/);
  await q(`update public.filings set document_ref='a',document_url='u',link_attempts=1,mapping_gen=2 where filing_id=$1`,[f]);
  await expect(q(`update public.filings set mapping_gen=1 where filing_id=$1`,[f])).rejects.toThrow(/append_only:/);
  await expect(q(`delete from public.filings where filing_id=$1`,[g])).rejects.toThrow(/append_only:/);
  await q(`begin; select set_config('facts.allow_filing_delete','on',true); delete from public.filings where filing_id='${g}'; commit;`);
  expect(await q(`select 1 from public.filings where filing_id=$1`,[g])).toHaveLength(0);
  await q(`update public.fact_sync_runs set status='abandoned' where run_id=$1`,[run]);
  await q(`delete from public.financial_facts where fact_id=$1`,[id]);
  expect(await status(id)).toBeNull();
 });

 it('lease: exclusive per issuer and market, renewable by its holder, lost after expiry, released only by the holder',async()=>{
  const iss=await issuer();const b1=await batch();const b2=await batch();
  expect(await claim(iss,b1)).toBe(false);                                   // no scope row yet
  expect(await scope(iss)).toBe(1);
  expect(await claim(iss,b1)).toBe(true);
  expect(await claim(iss,b2)).toBe(false);
  expect(await claim(iss,b1)).toBe(true);                                    // renew
  expect((await Promise.all(Array.from({length:8},()=>claim(iss,b2)))).every(x=>x===false)).toBe(true);
  await q(`update public.fact_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1`,[iss]);
  const racers=await Promise.all(Array.from({length:8},()=>batch()));
  const winners=await Promise.all(racers.map(r=>claim(iss,r)));
  expect(winners.filter(Boolean)).toHaveLength(1);
  const holder=racers[winners.indexOf(true)];
  expect(await fails(begin(iss,b1))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect(await fails(q(`select public.release_fact_sync_lease($1,'US',$2,'failed',now())`,[iss,b1]))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect((await fails(q(`select public.release_fact_sync_lease($1,'US',$2,'maybe',now())`,[iss,holder]))).message).toBe('invalid_outcome');
  await q(`select public.release_fact_sync_lease($1,'US',$2,'success',now()+interval '7 days')`,[iss,holder]);
  const s=(await q(`select lease_until,lease_batch_id,last_status,last_batch_id,last_success_at is not null ok,next_due_at > now()+interval '6 days' due from public.fact_sync_scope where issuer_id=$1`,[iss]))[0];
  expect(s).toEqual({lease_until:null,lease_batch_id:null,last_status:'success',last_batch_id:holder,ok:true,due:true});
  expect(await claim(iss,b1)).toBe(true);                                    // released → claimable again
 });

 it('run lifecycle: begin abandons staged runs (mark, delete facts, prune gen-0 filings); abandon refuses published runs and is idempotent; published quarantined rows survive',async()=>{
  const {iss,b,run:run1,f,r}=await published();
  const run2=await begin(iss,b);
  const {ids:[c]}=await stage(run2,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',value:'5'}]);
  const itemId=await conflictItem(iss,b,run2,[c]);
  expect(await quarantine(run2,[c],itemId)).toBe(1);
  expect(await publish(run2,[f])).toBe(0);
  expect(await status(c)).toBe('quarantined');
  const run3=await begin(iss,b);
  const f3=await filing(run3);
  const {ids:[s3]}=await stage(run3,[{filing_id:f3,value:'7'}]);
  const run4=await begin(iss,b);                                             // abandons run3
  expect(await runStatus(run3)).toBe('abandoned');
  expect(await status(s3)).toBeNull();
  expect(await q(`select 1 from public.filings where filing_id=$1`,[f3])).toHaveLength(0);   // gen 0, no facts → pruned
  expect(await q(`select 1 from public.filings where filing_id=$1`,[f])).toHaveLength(1);    // activated → kept
  expect(await status(r)).toBe('ok');expect(await status(c)).toBe('quarantined');
  expect(await fails(abandon(run1))).toMatchObject({message:'run_published',code:'P0001'});
  await abandon(run4);await abandon(run4);
  expect(await runStatus(run4)).toBe('abandoned');
  expect((await fails(stage(run4,[{filing_id:f}]))).message).toBe('run_abandoned');
  expect((await fails(stage(run1,[{filing_id:f}]))).message).toBe('run_published');
 });

 it('publish: rows become visible atomically, mapping_gen activates per manifest, regression is refused without side effects, state_rev advances',async()=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const run=await begin(iss,b);const f=await filing(run);
  const {n,ids:[a]}=await stage(run,[{filing_id:f}]);expect(n).toBe(1);
  expect((await stage(run,[{filing_id:f}])).n).toBe(0);                      // same candidate key → duplicates, not written
  expect((await read(iss)).rows).toHaveLength(0);expect(await rev(iss)).toBe(0);
  expect((await read(iss,{nonOk:true})).rows).toHaveLength(0);              // filing still gen 0: not the active generation
  expect(await publish(run,[f])).toBe(1);
  const env=await read(iss);
  expect(env).toMatchObject({state_rev:1,truncated:false,row_count:1});
  expect(env.rows[0]).toMatchObject({fact_id:a,status:'ok',value:'100',value_text:'100',mapping_gen:1,disclosure_seq:1,is_current:true,is_revision:false});
  expect((await q(`select mapping_gen from public.filings where filing_id=$1`,[f]))[0].mapping_gen).toBe(1);
  expect((await q(`select status,manifest,published_at is not null p from public.fact_sync_runs where run_id=$1`,[run]))[0]).toEqual({status:'published',manifest:[f],p:true});
  const run2=await begin(iss,b,2);const {ids:[a2]}=await stage(run2,[{filing_id:f,value:'101'}]);
  expect(await publish(run2,[f])).toBe(1);
  expect((await read(iss)).rows.map(x=>x.fact_id)).toEqual([a2]);           // generation 1 rows are no longer current
  expect((await q(`select status from public.financial_facts where fact_id=$1`,[a]))[0].status).toBe('ok');   // but remain as evidence
  const run3=await begin(iss,b,1);const {ids:[a3]}=await stage(run3,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT'}]);
  expect(await fails(publish(run3,[f]))).toMatchObject({message:'mapping_gen_regression',code:'P0001'});
  expect(await status(a3)).toBe('staged');expect(await runStatus(run3)).toBe('staged');
  expect((await q(`select mapping_gen from public.filings where filing_id=$1`,[f]))[0].mapping_gen).toBe(2);
  expect(await rev(iss)).toBe(2);
 });

 it('same-day conflict: register, abandon, retry, publish disposes the published ok row; dangling ids of deleted candidates are ignored',async()=>{
  const {iss,b,r0,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);
  const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);
  expect(await quarantine(runB,[c],itemId)).toBe(1);
  await abandon(runB);
  expect(await status(r)).toBe('ok');expect(await status(c)).toBeNull();expect((await item(itemId)).status).toBe('open');
  const runC=await begin(iss,b);const fc=await filing(runC);
  const {ids:[c2]}=await stage(runC,[{filing_id:fc,value:'200'}]);
  expect(await quarantine(runC,[c2,c2],itemId)).toBe(1);
  expect((await item(itemId)).fact_ids).toEqual([c,r,c2]);                 // merged, deduplicated, order kept
  expect(await publish(runC,[fc])).toBe(0);
  expect(await status(r)).toBe('quarantined');expect(await status(c2)).toBe('quarantined');
  const env=await read(iss,{concepts:['revenue']});
  expect(env.rows.map(x=>x.fact_id)).toEqual([r0]);expect(env.rows[0]).toMatchObject({value:'90',is_current:true});
  expect(await rev(iss)).toBe(2);
 });

 it('resolve_facts_quarantine: run_pending while any member run is staged; verdict persisted atomically; chosen promoted; unchosen bound for good',async()=>{
  const {iss,b,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);await quarantine(runB,[c],itemId);
  expect(await fails(resolve(itemId,[r]))).toMatchObject({message:'run_pending',code:'P0001'});
  expect((await item(itemId)).status).toBe('open');
  await publish(runB,[fb]);
  expect(await status(r)).toBe('quarantined');
  expect((await fails(resolve(itemId,[randomUUID()]))).message).toBe('invalid_chosen');
  expect(await resolve(itemId,[r])).toEqual({promoted:1,skipped:0});
  expect(await item(itemId)).toEqual({status:'resolved_accept',fact_ids:[c,r],chosen:[r]});
  expect(await status(r)).toBe('ok');expect(await status(c)).toBe('quarantined');expect(await rev(iss)).toBe(3);
  expect((await read(iss,{concepts:['revenue']})).rows.map(x=>x.fact_id)).toContain(r);   // chosen row really visible (R7-1)
  const other=randomUUID();
  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'identity_gp',$3,$4::jsonb)`,[other,`${iss}:US:IS:${other}`,b,JSON.stringify({key:{},fact_ids:[c],run_id:runB})]);
  expect(await resolve(other,[])).toEqual({promoted:0,skipped:1});          // c is bound by the verdict
  expect(await status(c)).toBe('quarantined');
  expect((await fails(resolve(other,[]))).message).toBe('item_not_open');
  expect((await fails(resolve(randomUUID(),[]))).message).toBe('item_not_open');
 });

 it('promote_quarantined eligibility: staged runs, open items and unchosen verdicts block; ok rows are skipped',async()=>{
  const {iss,b,f,r}=await published();
  const run=await begin(iss,b);
  const {ids:[x]}=await stage(run,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT'}]);
  const itemId=await conflictItem(iss,b,run,[x]);await quarantine(run,[x],itemId);
  expect(await promote(iss,[x])).toBe(0);                                    // run still staged
  await publish(run,[f]);
  expect(await promote(iss,[x])).toBe(0);                                    // referenced by an open item
  await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[itemId,randomUUID()]);
  expect(await promote(iss,[x])).toBe(0);                                    // resolved conflict that never chose x
  await q(`update public.dq_quarantine set detail=jsonb_build_object('chosen_fact_ids',jsonb_build_array($2::text)) where id=$1`,[itemId,x]);
  expect(await promote(iss,[x,r])).toBe(1);                                  // r is ok already → not counted
  expect(await status(x)).toBe('ok');expect(await rev(iss)).toBe(3);
  expect(await promote(iss,[x])).toBe(0);expect(await rev(iss)).toBe(3);    // nothing promoted → state_rev unchanged
 });

 it('resolution serialises behind an uncommitted publish while readers never block',async()=>{
  const {iss,b,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);await quarantine(runB,[c],itemId);
  const c1=await admin.connect();
  try{
   await c1.query('begin');await c1.query(`select public.publish_sync_run($1,$2::uuid[])`,[runB,[fb]]);
   const before=await read(iss,{concepts:['revenue']});
   expect(before.state_rev).toBe(1);expect(before.rows.map(x=>x.fact_id)).toContain(r);      // uncommitted publish invisible, read not blocked
   let settled=false;
   const pending=resolve(itemId,[r]).then(v=>{settled=true;return v;});
   await new Promise(res=>setTimeout(res,300));expect(settled).toBe(false);                     // waits for the scope row lock
   await c1.query('commit');
   expect(await pending).toEqual({promoted:1,skipped:0});                                       // saw the published run, not run_pending
  }finally{await c1.query('rollback').catch(()=>{});c1.release();}
  expect(await status(r)).toBe('ok');expect(await status(c)).toBe('quarantined');expect(await rev(iss)).toBe(3);
 });

 it('a merge that commits while a resolution waits for the scope lock is seen by that resolution: the member set is rebuilt under the lock (round-1 #2)',async()=>{
  const {iss,b,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);await quarantine(runB,[c],itemId);await publish(runB,[fb]);
  // Members [c, r] are both published: resolvable. Run C now stages c2 and merges it into the item
  // inside an open transaction (quarantine_facts holds the scope row lock through fact_run_lock).
  const runC=await begin(iss,b);const fc=await filing(runC);const {ids:[c2]}=await stage(runC,[{filing_id:fc,value:'300'}]);
  const c1=await admin.connect();
  try{
   await c1.query('begin');await c1.query(`select public.quarantine_facts($1,$2::uuid[],$3)`,[runC,[c2],itemId]);
   let settled=false;
   const pending=fails(resolve(itemId,[r])).then(v=>{settled=true;return v;});       // provisional read saw [c, r]; now blocked on the scope lock
   await new Promise(res=>setTimeout(res,300));expect(settled).toBe(false);
   await c1.query('commit');
   expect(await pending).toMatchObject({message:'run_pending',code:'P0001'});          // rebuilt members include c2, whose run C is staged
  }finally{await c1.query('rollback').catch(()=>{});c1.release();}
  expect(await item(itemId)).toMatchObject({status:'open',fact_ids:[c,r,c2]});
  expect(await status(r)).toBe('quarantined');                                        // nothing was promoted on the stale member set
  await publish(runC,[fc]);
  expect(await resolve(itemId,[r])).toEqual({promoted:1,skipped:0});
  expect(await status(r)).toBe('ok');expect(await status(c2)).toBe('quarantined');
 });

 it('replace_financial_metrics refuses a stale based_on_rev across publish and promote, and replaces the issuer atomically',async()=>{
  const {iss,b,r}=await published();
  const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],as_of:'2024-03-01'});
  const replace=(based:number,rows:unknown[])=>one(`select public.replace_financial_metrics($1,'US',$2,$3::jsonb) v`,[iss,based,JSON.stringify(rows)]);
  expect(await fails(replace(0,[metric('0.5')]))).toMatchObject({message:'stale_computation',code:'P0001'});
  expect(await replace(1,[metric('0.5')])).toBe(1);
  const run=await begin(iss,b);expect(await publish(run,[])).toBe(0);     // an empty run still advances state_rev
  expect((await fails(replace(1,[metric('0.6')]))).message).toBe('stale_computation');
  expect(await replace(2,[metric('0.6'),metric('0.7','net_margin')])).toBe(2);
  expect(await q(`select metric,value_text,based_on_rev from public.financial_metrics where issuer_id=$1 order by metric`,[iss])).toEqual([{metric:'gross_margin',value_text:'0.6',based_on_rev:'2'},{metric:'net_margin',value_text:'0.7',based_on_rev:'2'}]);
  expect(await replace(2,[])).toBe(0);
  expect(await q(`select 1 from public.financial_metrics where issuer_id=$1`,[iss])).toHaveLength(0);
  expect(await fails(replace(2,[metric('x')]))).toBeTruthy();                // numeric cast error → whole call rejected, nothing deleted
  expect(await fails(replace(9,[]))).toMatchObject({message:'stale_computation'});
 });

 it('read_facts: sequences, revisions, history, K limit, non-ok rows for the owner only, anon sees ok only',async()=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const disclose=async(available:string,value:string)=>{const run=await begin(iss,b);const f=await filing(run,available);const {ids:[id]}=await stage(run,[{filing_id:f,value,available_date:available}]);await publish(run,[f]);return id;};
  const d1=await disclose('2024-02-01','100');const d2=await disclose('2024-05-01','100');const d3=await disclose('2024-08-01','120');
  const at=async(asOf:string,history:boolean)=>(await read(iss,{concepts:['revenue'],asOf,history})).rows.map(x=>[x.fact_id,x.disclosure_seq,x.is_current,x.is_revision]);
  expect(await at('2024-05-01',false)).toEqual([[d2,2,true,false]]);
  expect(await at('2024-04-30',false)).toEqual([[d1,1,true,false]]);
  expect(await at('2024-12-31',true)).toEqual([[d1,1,false,false],[d2,2,false,false],[d3,3,true,true]]);
  expect(await at('2024-12-31',false)).toEqual([[d3,3,true,true]]);
  const run=await begin(iss,b);const f=await filing(run,'2024-09-01');const {ids:[qd]}=await stage(run,[{filing_id:f,value:'121',available_date:'2024-09-01'}]);
  const itemId=await conflictItem(iss,b,run,[qd],'2024-09-01');await quarantine(run,[qd],itemId);await publish(run,[f]);
  const all=await read(iss,{concepts:['revenue'],nonOk:true});
  expect(all.rows.find(x=>x.fact_id===qd)).toMatchObject({status:'quarantined',disclosure_seq:null,is_current:false,is_revision:false});
  expect(all.rows.filter(x=>x.status==='ok').map(x=>x.disclosure_seq)).toEqual([1,2,3]);   // non-ok rows do not take part in sequences
  const c=await admin.connect();
  try{
   await c.query('set role anon');
   const anon=await read(iss,{concepts:['revenue'],nonOk:true},c);
   expect(anon.rows.map(x=>x.status)).toEqual(['ok','ok','ok']);expect(anon.state_rev).toBe(4);
   await expect(c.query(`select * from public.fact_sync_scope`)).rejects.toThrow(/permission denied/);
  }finally{await c.query('reset role').catch(()=>{});c.release();}
  const run2=await begin(iss,b);const f2=await filing(run2,'2024-10-01');
  await stage(run2,[{filing_id:f2,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:'2024-06-30',value:'1',available_date:'2024-10-01'},{filing_id:f2,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:'2024-03-31',value:'2',available_date:'2024-10-01'}]);
  await publish(run2,[f2]);
  expect((await read(iss,{limit:1})).rows.map(x=>x.period_end)).toEqual(['2024-06-30']);              // keys ranked by period_end desc
  expect((await read(iss,{limit:2})).rows.map(x=>x.period_end)).toEqual(['2024-06-30','2024-03-31']);
  expect((await read(iss,{history:false})).rows).toHaveLength(3);
  expect((await read(iss,{concepts:['nope']})).rows).toHaveLength(0);
 });

 it('read_facts caps the envelope at 10,000 rows: 1,001 rows pass through, 10,001 are refused as truncated',async()=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const day=(i:number)=>new Date(Date.UTC(1990,0,1)+i*86400000).toISOString().slice(0,10);
  const bulk=async(from:number,to:number)=>{
   const run=await begin(iss,b);const f=await filing(run);let n=0;
   for(let s=from;s<to;s+=500){const rows:FactSpec[]=[];for(let i=s;i<Math.min(to,s+500);i++)rows.push({filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:day(i),value:String(i)});n+=(await stage(run,rows)).n;}
   await publish(run,[f]);return n;
  };
  expect(await bulk(0,1001)).toBe(1001);
  const small=await read(iss,{concepts:['total_assets']});
  expect(small).toMatchObject({truncated:false,row_count:1001});expect(small.rows).toHaveLength(1001);
  expect(await bulk(1001,10001)).toBe(9000);
  expect(await read(iss,{concepts:['total_assets']})).toMatchObject({state_rev:2,truncated:true,row_count:0,rows:[]});
  expect((await read(iss,{concepts:['total_assets'],limit:1000})).rows).toHaveLength(1000);
 },120000);

 it('reconcile_fact_sync_scope upserts scheduling inputs only and counts real changes',async()=>{
  const iss=await issuer();const b=await batch();
  expect(await scope(iss)).toBe(1);await claim(iss,b);
  await q(`update public.fact_sync_scope set next_due_at='2030-01-01',state_rev=5 where issuer_id=$1`,[iss]);
  const rows=(p:number)=>JSON.stringify([{issuer_id:iss,reasons:['sp500'],priority:p,fetch_key:'0000000002'}]);
  expect(await one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[rows(0)])).toBe(1);
  expect(await one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[rows(0)])).toBe(0);
  const s=(await q(`select reasons,priority,fetch_key,lease_batch_id,state_rev,next_due_at::date::text due from public.fact_sync_scope where issuer_id=$1`,[iss]))[0];
  expect(s).toEqual({reasons:['sp500'],priority:0,fetch_key:'0000000002',lease_batch_id:b,state_rev:'5',due:'2030-01-01'});
  expect((await fails(q(`select public.reconcile_fact_sync_scope('HK','[]'::jsonb)`))).message).toBe('invalid_market');
  expect((await fails(q(`select public.reconcile_fact_sync_scope('US','{}'::jsonb)`))).message).toBe('invalid_rows');
 });

 it('roles: no role writes the fact tables directly; service_role updates link columns only; anon and authenticated cannot call write functions',async()=>{
  const {iss,f,r,r0}=await published();
  const c=await admin.connect();
  try{
   await c.query('set role service_role');
   await expect(c.query(`insert into public.financial_facts(fact_id,issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash) select gen_random_uuid(),issuer_id,market,filing_id,run_id,'x',source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash from public.financial_facts where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.financial_facts set status='quarantined' where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`delete from public.financial_facts where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.filings set mapping_gen=9 where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.filings set url='x' where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
   await expect(c.query(`insert into public.fact_sync_scope(issuer_id,market,fetch_key) values($1,'CN','x')`,[iss])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.fact_sync_scope set state_rev=99 where issuer_id=$1`,[iss])).rejects.toThrow(/permission denied/);
   await expect(c.query(`delete from public.financial_metrics where issuer_id=$1`,[iss])).rejects.toThrow(/permission denied/);
   expect((await c.query(`update public.filings set document_ref='doc',document_url='https://example.test/doc',link_attempts=1 where filing_id=$1`,[f])).rowCount).toBe(1);
   expect((await c.query(`select count(*)::int n from public.fact_sync_runs where issuer_id=$1`,[iss])).rows[0].n).toBe(1);
   expect((await read(iss,{concepts:['revenue'],nonOk:true},c)).rows).toHaveLength(2);
   for(const role of ['anon','authenticated']){
    await c.query('reset role');await c.query(`set role ${role}`);
    await expect(c.query(`select * from public.fact_sync_runs`)).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.begin_sync_run($1,'US',$2,1)`,[iss,randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.resolve_facts_quarantine($1,'{}'::uuid[],$1)`,[randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.replace_financial_metrics($1,'US',1,'[]'::jsonb)`,[iss])).rejects.toThrow(/permission denied/);
    await expect(c.query(`update public.filings set document_ref='x' where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
    expect(Number((await c.query(`select public.fact_state_rev($1,'US') v`,[iss])).rows[0].v)).toBe(1);
    expect((await read(iss,{concepts:['revenue']},c)).rows.map(x=>x.fact_id)).toEqual([r0,r]);
    expect((await c.query(`select document_ref from public.filings where filing_id=$1`,[f])).rows[0].document_ref).toBe('doc');
   }
  }finally{await c.query('reset role').catch(()=>{});c.release();}
 });
});
```

- [ ] **Step 2: 把测试加入 criticalSuites**

`scripts/ci/research-checks.ts` 第 15 行的 `.concat(` 列表末尾追加 `'src/lib/facts/facts.integration.test.ts'`：

```ts
].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts');
```

- [ ] **Step 3: 运行，确认失败**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: `facts.integration.test.ts` 第一个用例失败：`expected [] to deeply equal [ 'fact_sync_runs', … ]`（表不存在），其余用例因 `function public.reconcile_fact_sync_scope(unknown, jsonb) does not exist` 失败。`npm test -- src/lib/facts/facts.integration.test.ts` 在无 `S4_TEST_STATE` 时整套 skipped。

- [ ] **Step 4: 写迁移**

```sql
-- supabase/migrations/20261106090000_financial_facts.sql
-- F2-0 (data foundation plan 2 spec §4): the disclosure log. A sync run per issuer+market is the
-- unit of publication (fact_sync_runs); filings are the documents; financial_facts is an
-- append-only log of "which filing, available on which date, disclosed which value for which
-- concept/period/unit"; financial_metrics is a derived cache replaced atomically per issuer;
-- fact_sync_scope holds the schedule, the lease and the fact-state version (state_rev).
-- Write path (§4.5, §4.7): NO role may insert/update/delete these tables — service_role included;
-- every change goes through the security definer functions below. Every function that changes
-- fact visibility starts by locking the issuer's fact_sync_scope row (`select … for update`), so
-- publish, quarantine membership, resolution/promotion and materialisation serialise (§5.4);
-- collector functions additionally verify the lease (lease_batch_id = batch and
-- lease_until > now(), else `lease_lost`). Two explicit exceptions: service_role may update
-- filings.document_ref/document_url/link_attempts (cninfo linking; column-level grant) and may
-- call reconcile_fact_sync_scope (schedule inputs, no lease).
-- Errors carry the code as the message: lease_lost (55P03); run_pending, run_published,
-- mapping_gen_regression, stale_computation (P0001); run_abandoned, item_not_open (P0001, bug
-- paths); run_not_found (P0002); invalid_* (22023). Triggers refuse with 23514, prefix `append_only:`.
-- The hosted `postgres` role is not a superuser: functions keep the migration role as owner (no
-- `alter function … owner`), `set search_path = public`, and qualify every relation.
-- Replayable: guarded creates, create or replace, drop-then-create policies and triggers,
-- insert … on conflict for the bucket. Only storage.buckets is referenced (local harness).

-- ---------------------------------------------------------------- 4.1 fact_sync_runs
create table if not exists public.fact_sync_runs (
  run_id        uuid primary key,
  issuer_id     uuid not null references public.issuers(issuer_id) on delete restrict,
  market        text not null check (market in ('US','CN')),
  batch_id      uuid not null references public.ingest_batches(batch_id) on delete restrict,
  mapping_gen   int not null check (mapping_gen >= 1),
  status        text not null default 'staged' check (status in ('staged','published','abandoned')),
  manifest      jsonb not null default '[]' check (jsonb_typeof(manifest) = 'array'),
  started_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint fact_sync_runs_published_iff check ((status = 'published') = (published_at is not null))
);
create index if not exists fact_sync_runs_issuer_status_idx on public.fact_sync_runs(issuer_id, market, status);
create index if not exists fact_sync_runs_batch_idx on public.fact_sync_runs(batch_id);

-- ---------------------------------------------------------------- 4.2 filings
create table if not exists public.filings (
  filing_id        uuid primary key,
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  source           text not null check (source in ('edgar','tushare')),
  origin           text not null check (origin in ('sec','sse','szse','bse')),
  form_type        text not null check (form_type in ('10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','annual','semiannual','q1','q3','restatement','other')),
  fiscal_year      int,
  fiscal_period    text check (fiscal_period is null or fiscal_period in ('FY','Q1','Q2','Q3','H1','9M')),
  period_end       date,
  available_date   date not null,
  source_ref       text not null check (length(source_ref) between 1 and 256),
  url              text,
  document_ref     text,
  document_url     text,
  link_attempts    int not null default 0 check (link_attempts >= 0),
  mapping_gen      int not null default 0 check (mapping_gen >= 0),      -- active generation; 0 = no published run covers it yet
  run_id           uuid not null references public.fact_sync_runs(run_id) on delete restrict,   -- the run that created it
  created_at       timestamptz not null default now(),
  constraint filings_source_ref_uniq unique (source, source_ref),
  constraint filings_id_issuer_market_uniq unique (filing_id, issuer_id, market),
  constraint filings_id_available_uniq unique (filing_id, available_date)
);
create index if not exists filings_issuer_available_idx on public.filings(issuer_id, market, available_date desc);
create index if not exists filings_run_idx on public.filings(run_id);

-- ---------------------------------------------------------------- 4.3 financial_facts
create table if not exists public.financial_facts (
  fact_id          uuid primary key,
  issuer_id        uuid not null,
  market           text not null check (market in ('US','CN')),
  filing_id        uuid not null,
  run_id           uuid not null references public.fact_sync_runs(run_id) on delete restrict,
  concept          text not null check (length(concept) between 1 and 64),
  source_concept   text not null check (length(source_concept) between 1 and 256),
  statement        text not null check (statement in ('IS','BS','CF','DEI')),
  period_start     date,
  period_end       date not null,
  duration         text not null check (duration in ('3M','6M','9M','12M','INSTANT')),
  value            numeric not null,
  value_text       text generated always as (value::text) stored,
  unit             text not null check (length(unit) between 1 and 16),
  consolidation    text not null default 'consolidated' check (consolidation in ('consolidated','parent')),
  available_date   date not null,
  mapping_gen      int not null check (mapping_gen >= 1),
  mapping_version  text not null check (length(mapping_version) between 1 and 64),
  status           text not null default 'staged' check (status in ('staged','ok','quarantined')),
  raw_hash         text not null check (length(raw_hash) between 1 and 128),
  created_at       timestamptz not null default now(),
  constraint financial_facts_filing_fkey foreign key (filing_id, issuer_id, market) references public.filings(filing_id, issuer_id, market) on delete restrict,
  constraint financial_facts_filing_date_fkey foreign key (filing_id, available_date) references public.filings(filing_id, available_date) on delete restrict,
  constraint financial_facts_period check (period_start is null or period_start < period_end),
  constraint financial_facts_instant check ((period_start is null) = (duration = 'INSTANT')),
  constraint financial_facts_candidate_key unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, unit, filing_id, mapping_gen)
);
create index if not exists financial_facts_read_idx on public.financial_facts(issuer_id, market, concept, period_end, available_date);
create index if not exists financial_facts_run_idx on public.financial_facts(run_id);
create index if not exists financial_facts_filing_idx on public.financial_facts(filing_id);
-- publish/promote look items up by member fact id (payload.fact_ids ? id)
create index if not exists dq_quarantine_fact_ids_idx on public.dq_quarantine using gin ((payload -> 'fact_ids')) where table_name = 'financial_facts';

-- ---------------------------------------------------------------- 4.4 financial_metrics
create table if not exists public.financial_metrics (
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  metric           text not null check (length(metric) between 1 and 64),
  period_start     date not null,
  period_end       date not null,
  duration         text not null check (duration in ('3M','6M','9M','12M','TTM','INSTANT')),
  value            numeric not null,
  value_text       text generated always as (value::text) stored,
  unit             text not null check (length(unit) between 1 and 16),
  input_unit       text not null check (length(input_unit) between 1 and 16),
  basis            text not null check (basis in ('us_standard','cn_standard','cn_incl_intangibles','cn_incl_bonds')),
  formula_version  text not null check (length(formula_version) between 1 and 64),
  inputs           jsonb not null check (jsonb_typeof(inputs) = 'array'),
  based_on_rev     bigint not null check (based_on_rev >= 0),
  as_of            date not null,
  computed_at      timestamptz not null default now(),
  primary key (issuer_id, market, metric, period_start, period_end, input_unit, basis, formula_version)
);
create index if not exists financial_metrics_read_idx on public.financial_metrics(issuer_id, market, metric, period_end desc);

-- ---------------------------------------------------------------- 4.5 fact_sync_scope
create table if not exists public.fact_sync_scope (
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  reasons          jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array'),
  priority         int not null default 0 check (priority >= 0),
  fetch_key        text not null check (length(fetch_key) between 1 and 32),
  next_due_at      timestamptz not null default now(),
  lease_until      timestamptz,
  lease_batch_id   uuid,
  state_rev        bigint not null default 0 check (state_rev >= 0),   -- +1 on every publish or promotion (audit R4-6)
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  last_batch_id    uuid,
  last_status      text check (last_status is null or last_status in ('success','failed')),
  updated_at       timestamptz not null default now(),
  primary key (issuer_id, market),
  constraint fact_sync_scope_lease_pair check ((lease_until is null) = (lease_batch_id is null))
);
create index if not exists fact_sync_scope_due_idx on public.fact_sync_scope(market, next_due_at, priority desc, issuer_id) where priority > 0;

-- ---------------------------------------------------------------- 4.7 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disclosure-raw', 'disclosure-raw', false, 52428800, array['application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers (§4.2, §4.3)
-- Backstops for the function write path. financial_facts: inserted as staged; only the status may
-- change, along staged→ok, staged→quarantined, quarantined→ok, ok→quarantined; rows are deleted
-- only together with their abandoned run (the run is marked first, §4.5).
-- The immutable-field check lists the base columns explicitly: in a BEFORE UPDATE trigger the
-- generated column value_text is not yet computed for NEW (PostgreSQL 17 trigger docs), so a
-- to_jsonb(NEW) comparison would refuse every legitimate status change (audit round-1 #1).
create or replace function public.financial_facts_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare v_run_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'staged' then
      raise exception 'append_only: financial_facts rows are inserted as staged' using errcode = '23514';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if (new.fact_id, new.issuer_id, new.market, new.filing_id, new.run_id, new.concept, new.source_concept, new.statement,
        new.period_start, new.period_end, new.duration, new.value, new.unit, new.consolidation, new.available_date,
        new.mapping_gen, new.mapping_version, new.raw_hash, new.created_at)
       is distinct from
       (old.fact_id, old.issuer_id, old.market, old.filing_id, old.run_id, old.concept, old.source_concept, old.statement,
        old.period_start, old.period_end, old.duration, old.value, old.unit, old.consolidation, old.available_date,
        old.mapping_gen, old.mapping_version, old.raw_hash, old.created_at) then
      raise exception 'append_only: financial_facts allows status changes only' using errcode = '23514';
    end if;
    if not ((old.status, new.status) in (('staged','ok'), ('staged','quarantined'), ('quarantined','ok'), ('ok','quarantined'))) then
      raise exception 'append_only: financial_facts status % -> % is not allowed', old.status, new.status using errcode = '23514';
    end if;
    return new;
  end if;
  select status into v_run_status from public.fact_sync_runs where run_id = old.run_id;
  if v_run_status is distinct from 'abandoned' then
    raise exception 'append_only: financial_facts rows are deleted only with their abandoned run' using errcode = '23514';
  end if;
  return old;
end $$;
drop trigger if exists financial_facts_lifecycle on public.financial_facts;
create trigger financial_facts_lifecycle before insert or update or delete on public.financial_facts
  for each row execute function public.financial_facts_lifecycle();

-- filings: update may touch document_ref/document_url/link_attempts/mapping_gen only, and
-- mapping_gen never decreases; delete is admitted only under the transaction-local setting that
-- begin_sync_run switches on while pruning empty gen-0 filings of abandoned runs.
create or replace function public.filings_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['document_ref','document_url','link_attempts','mapping_gen'];
begin
  if tg_op = 'DELETE' then
    if current_setting('facts.allow_filing_delete', true) is distinct from 'on' then
      raise exception 'append_only: filings are never deleted (begin_sync_run prunes empty gen-0 filings of abandoned runs)' using errcode = '23514';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: filings allow document_ref, document_url, link_attempts and mapping_gen changes only' using errcode = '23514';
  end if;
  if new.mapping_gen < old.mapping_gen then
    raise exception 'append_only: filings.mapping_gen may only increase (% -> %)', old.mapping_gen, new.mapping_gen using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists filings_limited_update on public.filings;
create trigger filings_limited_update before update or delete on public.filings
  for each row execute function public.filings_limited_update();

-- ---------------------------------------------------------------- internal helpers (no client role may execute)
-- Lock discipline: lock the scope row, then check the lease the caller claims to hold.
create or replace function public.fact_scope_lock(p_issuer uuid, p_market text, p_batch uuid)
returns public.fact_sync_scope language plpgsql security definer set search_path = public as $$
declare s public.fact_sync_scope;
begin
  select * into s from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found then raise exception 'lease_lost' using errcode = '55P03'; end if;
  if s.lease_batch_id is distinct from p_batch or s.lease_until is null or s.lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return s;
end $$;
revoke execute on function public.fact_scope_lock(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Locks the run's scope row, verifies the run's batch still holds the lease, returns the run,
-- which must be staged (published → run_published; abandoned → run_abandoned).
create or replace function public.fact_run_lock(p_run uuid)
returns public.fact_sync_runs language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs;
begin
  select * into r from public.fact_sync_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  perform public.fact_scope_lock(r.issuer_id, r.market, r.batch_id);
  select * into r from public.fact_sync_runs where run_id = p_run for update;
  if r.status = 'published' then raise exception 'run_published' using errcode = 'P0001'; end if;
  if r.status = 'abandoned' then raise exception 'run_abandoned' using errcode = 'P0001'; end if;
  return r;
end $$;
revoke execute on function public.fact_run_lock(uuid) from public, anon, authenticated, service_role;

-- Abandon order (§4.5): mark first (the facts trigger admits the delete), delete the run's facts,
-- then — begin_sync_run only — prune filings this run created that carry no facts and were never
-- activated (mapping_gen = 0), under the transaction-local setting the filings trigger honours.
create or replace function public.fact_abandon_run(p_run uuid, p_prune_filings boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.fact_sync_runs set status = 'abandoned' where run_id = p_run and status = 'staged';
  delete from public.financial_facts where run_id = p_run;
  if p_prune_filings then
    perform set_config('facts.allow_filing_delete', 'on', true);
    delete from public.filings g
    where g.run_id = p_run and g.mapping_gen = 0
      and not exists (select 1 from public.financial_facts f where f.filing_id = g.filing_id);
    perform set_config('facts.allow_filing_delete', 'off', true);
  end if;
end $$;
revoke execute on function public.fact_abandon_run(uuid, boolean) from public, anon, authenticated, service_role;

-- payload.fact_ids of a quarantine item as uuid[] (empty when absent or not an array).
create or replace function public.fact_item_members(p_payload jsonb)
returns uuid[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(e::uuid), '{}'::uuid[])
  from jsonb_array_elements_text(case when jsonb_typeof(p_payload -> 'fact_ids') = 'array' then p_payload -> 'fact_ids' else '[]'::jsonb end) e
$$;
revoke execute on function public.fact_item_members(jsonb) from public, anon, authenticated, service_role;

-- Promotion eligibility (§4.5 promote_quarantined / §7.3). Caller holds the scope lock. A row is
-- promoted only if it is quarantined, its run is published, its filing's active generation is the
-- row's generation, no OPEN quarantine item references it, no OPEN same_day_conflict item disputes
-- its (K, available_date) — matched on the components stored in payload.key, whether or not the
-- row is in that item's member list (spec §4.5; audit round-1 #3) — and every RESOLVED
-- same_day_conflict item that references it chose it (detail.chosen_fact_ids). Returns the number promoted.
create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.financial_facts f set status = 'ok'
  from public.fact_sync_runs r, public.filings g
  where f.fact_id = any(p_fact_ids) and f.issuer_id = p_issuer and f.market = p_market and f.status = 'quarantined'
    and r.run_id = f.run_id and r.status = 'published'
    and g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.status = 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status = 'open'
        and q.payload -> 'key' ->> 'issuer_id' = f.issuer_id::text and q.payload -> 'key' ->> 'market' = f.market
        and q.payload -> 'key' ->> 'concept' = f.concept
        and coalesce(q.payload -> 'key' ->> 'period_start', '') = coalesce(f.period_start::text, '')
        and q.payload -> 'key' ->> 'period_end' = f.period_end::text
        and q.payload -> 'key' ->> 'consolidation' = f.consolidation and q.payload -> 'key' ->> 'unit' = f.unit
        and q.payload -> 'key' ->> 'available_date' = f.available_date::text)
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status <> 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.5 functions
-- Schedule inputs only: reasons/priority/fetch_key. Never touches next_due_at, lease_*, state_rev,
-- last_*. Returns the number of rows inserted or actually changed.
create or replace function public.reconcile_fact_sync_scope(p_market text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_market is null or p_market not in ('US','CN') then raise exception 'invalid_market' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  select distinct on ((x ->> 'issuer_id')) (x ->> 'issuer_id')::uuid, p_market, coalesce(x -> 'reasons', '[]'::jsonb), (x ->> 'priority')::int, x ->> 'fetch_key'
  from jsonb_array_elements(p_rows) x
  on conflict (issuer_id, market) do update
    set reasons = excluded.reasons, priority = excluded.priority, fetch_key = excluded.fetch_key, updated_at = now()
    where (fact_sync_scope.reasons, fact_sync_scope.priority, fact_sync_scope.fetch_key)
          is distinct from (excluded.reasons, excluded.priority, excluded.fetch_key);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.reconcile_fact_sync_scope(text, jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_fact_sync_scope(text, jsonb) to service_role;

-- Unleased, expired, or held by the same batch → (re)lease and true; otherwise false.
-- No scope row → false (nothing to lease; reconcile first).
create or replace function public.claim_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_ttl_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.fact_sync_scope;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 1 then raise exception 'invalid_ttl' using errcode = '22023'; end if;
  select * into s from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found then return false; end if;
  if s.lease_batch_id is null or s.lease_until <= now() or s.lease_batch_id = p_batch then
    update public.fact_sync_scope
    set lease_batch_id = p_batch, lease_until = now() + make_interval(secs => p_ttl_seconds), updated_at = now()
    where issuer_id = p_issuer and market = p_market;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.claim_fact_sync_lease(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_fact_sync_lease(uuid, text, uuid, int) to service_role;

-- Lease check; abandons every staged run of this issuer+market (mark → delete facts → prune
-- empty gen-0 filings); inserts the new staged run and returns its id.
create or replace function public.begin_sync_run(p_issuer uuid, p_market text, p_batch uuid, p_mapping_gen int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_run uuid := gen_random_uuid(); v_old uuid;
begin
  if p_mapping_gen is null or p_mapping_gen < 1 then raise exception 'invalid_mapping_gen' using errcode = '22023'; end if;
  perform public.fact_scope_lock(p_issuer, p_market, p_batch);
  for v_old in select run_id from public.fact_sync_runs where issuer_id = p_issuer and market = p_market and status = 'staged' loop
    perform public.fact_abandon_run(v_old, true);
  end loop;
  insert into public.fact_sync_runs (run_id, issuer_id, market, batch_id, mapping_gen)
  values (v_run, p_issuer, p_market, p_batch, p_mapping_gen);
  return v_run;
end $$;
revoke execute on function public.begin_sync_run(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.begin_sync_run(uuid, text, uuid, int) to service_role;

-- Rows: [{filing_id, source, origin, form_type, fiscal_year, fiscal_period, period_end,
-- available_date, source_ref, url}]; issuer/market/run come from the run. Existing
-- (source, source_ref) rows are kept; returns {source_ref → filing_id} for every row of this
-- issuer+market, existing ones included.
create or replace function public.stage_filings(p_run uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; v_out jsonb;
begin
  r := public.fact_run_lock(p_run);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.filings (filing_id, issuer_id, market, source, origin, form_type, fiscal_year, fiscal_period, period_end, available_date, source_ref, url, run_id)
  select distinct on (x ->> 'source', x ->> 'source_ref')
         (x ->> 'filing_id')::uuid, r.issuer_id, r.market, x ->> 'source', x ->> 'origin', x ->> 'form_type',
         (x ->> 'fiscal_year')::int, x ->> 'fiscal_period', (x ->> 'period_end')::date, (x ->> 'available_date')::date,
         x ->> 'source_ref', x ->> 'url', p_run
  from jsonb_array_elements(p_rows) x
  on conflict (source, source_ref) do nothing;
  select coalesce(jsonb_object_agg(g.source_ref, g.filing_id), '{}'::jsonb) into v_out
  from public.filings g
  where g.issuer_id = r.issuer_id and g.market = r.market
    and (g.source, g.source_ref) in (select x ->> 'source', x ->> 'source_ref' from jsonb_array_elements(p_rows) x);
  return v_out;
end $$;
revoke execute on function public.stage_filings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_filings(uuid, jsonb) to service_role;

-- Rows: FactInsert objects (§共享契约); issuer/market/run/mapping_gen come from the run; status is
-- staged; an existing candidate key (any status, any run) is skipped. Returns the inserted count.
create or replace function public.stage_facts(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int;
begin
  r := public.fact_run_lock(p_run);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.financial_facts (fact_id, issuer_id, market, filing_id, run_id, concept, source_concept, statement, period_start, period_end, duration, value, unit, consolidation, available_date, mapping_gen, mapping_version, raw_hash)
  select (x ->> 'fact_id')::uuid, r.issuer_id, r.market, (x ->> 'filing_id')::uuid, p_run, x ->> 'concept', x ->> 'source_concept', x ->> 'statement',
         (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric, x ->> 'unit',
         coalesce(x ->> 'consolidation', 'consolidated'), (x ->> 'available_date')::date, r.mapping_gen, x ->> 'mapping_version', x ->> 'raw_hash'
  from jsonb_array_elements(p_rows) x
  on conflict on constraint financial_facts_candidate_key do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.stage_facts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_facts(uuid, jsonb) to service_role;

-- This run's staged rows among p_fact_ids → quarantined (count returned), and the ids are merged
-- into dq_quarantine(p_item).payload.fact_ids under the same lock (append-only, deduplicated,
-- order kept; audit R6-1). Public rows are never touched here. The item must be open.
create or replace function public.quarantine_facts(p_run uuid, p_fact_ids uuid[], p_item uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int; v_ids uuid[] := coalesce(p_fact_ids, '{}'::uuid[]);
begin
  r := public.fact_run_lock(p_run);
  update public.financial_facts set status = 'quarantined'
  where run_id = p_run and status = 'staged' and fact_id = any(v_ids);
  get diagnostics n = row_count;
  update public.dq_quarantine q
  set payload = jsonb_set(q.payload, '{fact_ids}',
        (case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end)
        || (select coalesce(jsonb_agg(to_jsonb(u.id::text) order by u.ord), '[]'::jsonb)
            from (select distinct on (id) id, ord from unnest(v_ids) with ordinality as t(id, ord) order by id, ord) u
            where not ((case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end) ? u.id::text)),
        true)
  where q.id = p_item and q.status = 'open';
  if not found then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  return n;
end $$;
revoke execute on function public.quarantine_facts(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.quarantine_facts(uuid, uuid[], uuid) to service_role;

-- One transaction (§5.4): this run staged→ok; contested groups — every OPEN same_day_conflict
-- item that references a row of this run takes all of its still-ok members down, whichever run
-- produced them (audit R5-1: derived from the items, not from run bookkeeping; ids of deleted rows
-- are simply absent); manifest filings activate run.mapping_gen (a filing already on a higher
-- generation → mapping_gen_regression, nothing changes); run → published with manifest;
-- state_rev + 1. Returns the number of rows that became ok.
create or replace function public.publish_sync_run(p_run uuid, p_manifest uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int; v_manifest uuid[] := coalesce(p_manifest, '{}'::uuid[]);
begin
  r := public.fact_run_lock(p_run);
  update public.financial_facts set status = 'ok' where run_id = p_run and status = 'staged';
  get diagnostics n = row_count;
  update public.financial_facts f set status = 'quarantined'
  where f.status = 'ok' and f.issuer_id = r.issuer_id and f.market = r.market
    and exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status = 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
        and exists (select 1 from public.financial_facts x where x.run_id = p_run and q.payload -> 'fact_ids' ? x.fact_id::text));
  if exists (select 1 from public.filings g where g.filing_id = any(v_manifest) and g.issuer_id = r.issuer_id and g.market = r.market and g.mapping_gen > r.mapping_gen) then
    raise exception 'mapping_gen_regression' using errcode = 'P0001';
  end if;
  update public.filings set mapping_gen = r.mapping_gen
  where filing_id = any(v_manifest) and issuer_id = r.issuer_id and market = r.market and mapping_gen < r.mapping_gen;
  update public.fact_sync_runs set status = 'published', published_at = now(), manifest = to_jsonb(v_manifest) where run_id = p_run;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = r.issuer_id and market = r.market;
  return n;
end $$;
revoke execute on function public.publish_sync_run(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.publish_sync_run(uuid, uuid[]) to service_role;

-- Lease check; published → run_published; already abandoned → no-op; staged → mark, delete facts
-- (filings this run created stay until the next begin_sync_run prunes them). Published rows and
-- open conflict items are untouched.
create or replace function public.abandon_sync_run(p_run uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs;
begin
  select * into r from public.fact_sync_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  perform public.fact_scope_lock(r.issuer_id, r.market, r.batch_id);
  select * into r from public.fact_sync_runs where run_id = p_run for update;
  if r.status = 'published' then raise exception 'run_published' using errcode = 'P0001'; end if;
  if r.status = 'abandoned' then return; end if;
  perform public.fact_abandon_run(p_run, false);
end $$;
revoke execute on function public.abandon_sync_run(uuid) from public, anon, authenticated;
grant execute on function public.abandon_sync_run(uuid) to service_role;

-- Holder check (batch only; an expired but unclaimed lease may still be released); clears the
-- lease and records the outcome and the next due time.
create or replace function public.release_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_outcome text, p_next_due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s public.fact_sync_scope;
begin
  if p_outcome is null or p_outcome not in ('success','failed') then raise exception 'invalid_outcome' using errcode = '22023'; end if;
  select * into s from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found or s.lease_batch_id is distinct from p_batch then raise exception 'lease_lost' using errcode = '55P03'; end if;
  update public.fact_sync_scope
  set lease_until = null, lease_batch_id = null, last_attempt_at = now(),
      last_success_at = case when p_outcome = 'success' then now() else last_success_at end,
      last_batch_id = p_batch, last_status = p_outcome, next_due_at = coalesce(p_next_due, now()), updated_at = now()
  where issuer_id = p_issuer and market = p_market;
end $$;
revoke execute on function public.release_fact_sync_lease(uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.release_fact_sync_lease(uuid, text, uuid, text, timestamptz) to service_role;

-- Admin hook (§7.3): holds the scope lock, promotes eligible rows (fact_promote_rows), state_rev + 1
-- when anything was promoted. Returns the number promoted.
create or replace function public.promote_quarantined(p_issuer uuid, p_market text, p_fact_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform 1 from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  n := public.fact_promote_rows(p_issuer, p_market, coalesce(p_fact_ids, '{}'::uuid[]));
  if n > 0 then
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = p_issuer and market = p_market;
  end if;
  return n;
end $$;
revoke execute on function public.promote_quarantined(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.promote_quarantined(uuid, text, uuid[]) to service_role;

-- Admin hook (§4.5, §7.3; audits R6-1, R7-1; round-1 #2, #10). Lock order: scope row (derived
-- from a provisional read of the member rows, else from payload.run_id) then the item row — the
-- same order quarantine_facts uses. Under the lock the item is re-read and the member set is
-- REBUILT, so a quarantine_facts merge that committed while this call waited is validated too.
-- Any member row whose run is still staged, or an anchor run (payload.run_id) that is still
-- staged — the only run bookkeeping an item without fact rows has — → run_pending (item stays
-- open). Otherwise, in one transaction: item → resolved_accept with detail.chosen_fact_ids (the
-- verdict for same_day_conflict — must be a subset of payload.fact_ids — or all member ids
-- otherwise), promotion by the eligibility rules (the item itself is closed by then, so it no
-- longer blocks its members), state_rev + 1. Returns {promoted, skipped}.
create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_ids uuid[]; v_issuer uuid; v_market text; v_chosen uuid[]; v_promoted int := 0; v_run uuid;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  -- 1. provisional member read, only to locate the scope row to lock
  v_ids := public.fact_item_members(q.payload);
  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) limit 1;
  if v_issuer is null then
    select r.issuer_id, r.market into v_issuer, v_market from public.fact_sync_runs r where r.run_id = (q.payload ->> 'run_id')::uuid;
  end if;
  if v_issuer is not null then
    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
  end if;
  -- 2. re-read and rebuild the member set under the lock (a concurrent merge is now visible)
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  -- 3. every member run, and the anchor run, must have left the staged state
  if exists (select 1 from public.financial_facts f join public.fact_sync_runs r on r.run_id = f.run_id where f.fact_id = any(v_ids) and r.status = 'staged') then
    raise exception 'run_pending' using errcode = 'P0001';
  end if;
  v_run := (q.payload ->> 'run_id')::uuid;
  if v_run is not null and exists (select 1 from public.fact_sync_runs r where r.run_id = v_run and r.status = 'staged') then
    raise exception 'run_pending' using errcode = 'P0001';
  end if;
  if q.reason_code = 'same_day_conflict' then
    v_chosen := coalesce(p_chosen, '{}'::uuid[]);
    if not (v_chosen <@ v_ids) then raise exception 'invalid_chosen' using errcode = '22023'; end if;
  else
    v_chosen := v_ids;
  end if;
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('chosen_fact_ids', to_jsonb(v_chosen))
  where id = p_item;
  if v_issuer is not null then
    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_chosen);
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
  end if;
  return jsonb_build_object('promoted', v_promoted, 'skipped', cardinality(v_chosen) - v_promoted);
end $$;
revoke execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) to service_role;

-- Holds the scope lock; state_rev must equal p_based_on_rev (no scope row ⇒ 0) else
-- stale_computation; replaces every metric row of the issuer+market. Rows: MetricRow objects
-- without issuer/market (§共享契约). Returns the number inserted.
create or replace function public.replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_rev bigint; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found then v_rev := 0; end if;
  if p_based_on_rev is null or v_rev <> p_based_on_rev then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, as_of)
  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
         x ->> 'unit', x ->> 'input_unit', x ->> 'basis', x ->> 'formula_version', coalesce(x -> 'inputs', '[]'::jsonb), p_based_on_rev, (x ->> 'as_of')::date
  from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) to service_role;

-- Only the version number leaves fact_sync_scope (audit R5-2); callable by every client role so
-- read_facts can stamp its envelope within the same statement (snapshot).
create or replace function public.fact_state_rev(p_issuer uuid, p_market text)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select state_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market), 0)
$$;
revoke execute on function public.fact_state_rev(uuid, text) from public;
grant execute on function public.fact_state_rev(uuid, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.6 read_facts
-- One statement, one snapshot, one jsonb envelope {state_rev, rows, truncated, row_count}
-- (PostgREST max_rows truncates set-returning functions, not a scalar; audit R4-5).
-- Per filing only rows of the active generation; available_date <= p_as_of; period_end within
-- [p_from, p_to] when given; status ok (p_include_non_ok adds staged/quarantined rows — RLS keeps
-- anonymous callers on ok only). Sequences (§5.2) are computed over ok rows per natural key
-- (concept, period_start, period_end, consolidation, unit) ordered by available_date, created_at,
-- fact_id: disclosure_seq, is_current (last), is_revision (value differs from the previous
-- disclosure, numeric compare); non-ok rows carry null/false. p_history=false keeps current rows
-- only; p_limit caps the number of natural keys (ranked period_end desc, then concept,
-- period_start desc, consolidation, unit, C collation). More than 10,000 rows ⇒ truncated=true and
-- no rows at all (callers must refuse to plan or derive on a truncated envelope). value is
-- emitted as value_text so JSON clients never round it.
create or replace function public.read_facts(
  p_issuer uuid, p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
with base as (
  select f.fact_id, f.issuer_id, f.market, f.filing_id, f.run_id, f.concept, f.source_concept, f.statement,
         f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
         f.mapping_gen, f.mapping_version, f.status, f.raw_hash, f.created_at
  from public.financial_facts f
  join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  where f.issuer_id = p_issuer and f.market = p_market
    and (p_concepts is null or f.concept = any(p_concepts))
    and f.available_date <= p_as_of
    and (p_from is null or f.period_end >= p_from)
    and (p_to is null or f.period_end <= p_to)
    and (f.status = 'ok' or coalesce(p_include_non_ok, false))
), seq as (
  select b.*,
         row_number() over w as disclosure_seq,
         (row_number() over w = count(*) over (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit)) as is_current,
         (lag(b.value) over w is not null and b.value <> lag(b.value) over w) as is_revision
  from base b
  where b.status = 'ok'
  window w as (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
  union all
  select b.*, null::bigint, false, false from base b where b.status <> 'ok'
), keyed as (
  select s.*,
         dense_rank() over (order by s.period_end desc, s.concept collate "C", s.period_start desc nulls last, s.consolidation collate "C", s.unit collate "C") as key_rank
  from seq s
), picked as (
  select * from keyed k
  where (coalesce(p_history, false) or k.is_current) and (p_limit is null or k.key_rank <= p_limit)
), capped as (
  select * from picked order by key_rank, available_date, created_at, fact_id limit 10001
), counted as (
  select count(*)::int as n from capped
)
select jsonb_build_object(
  'state_rev', public.fact_state_rev(p_issuer, p_market),
  'truncated', (select n from counted) > 10000,
  'row_count', case when (select n from counted) > 10000 then 0 else (select n from counted) end,
  'rows', case when (select n from counted) > 10000 then '[]'::jsonb
               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
$$;
revoke execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.7 table privileges and policies
do $$ declare t text; begin
  foreach t in array array['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['filings','financial_metrics'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
  end loop;
  foreach t in array array['fact_sync_runs','fact_sync_scope'] loop
    execute format('grant select on public.%I to service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
end $$;
grant select on public.financial_facts to anon, authenticated, service_role;
drop policy if exists "financial_facts public read" on public.financial_facts;
create policy "financial_facts public read" on public.financial_facts for select to anon, authenticated using (status = 'ok');
drop policy if exists "financial_facts service read" on public.financial_facts;
create policy "financial_facts service read" on public.financial_facts for select to service_role using (true);
-- The one direct write: cninfo linking (§4.5 exception). Column-level; the trigger still forbids
-- anything else, and mapping_gen stays function-only.
grant update (document_ref, document_url, link_attempts) on public.filings to service_role;
drop policy if exists "filings service link update" on public.filings;
create policy "filings service link update" on public.filings for update to service_role using (true) with check (true);
```

- [ ] **Step 5: 追加锁文件**

Run:
```bash
node -e "const fs=require('fs'),c=require('crypto');const p='supabase/migrations.lock.json';const l=JSON.parse(fs.readFileSync(p,'utf8'));const have=new Set(l.migrations.map(m=>m.file));for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){if(!have.has(f))l.migrations.push({file:f,sha256:c.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+f)).digest('hex')});}fs.writeFileSync(p,JSON.stringify(l,null,2)+'\n');console.log(l.migrations.length)"
```
Expected: 打印 `50`（原 49 条 + 本迁移）；`git diff supabase/migrations.lock.json` 只新增一个条目。锁定后迁移文件不可再改——Step 6 全绿后再执行本步。

- [ ] **Step 6: 运行集成测试与迁移检查**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: `facts.integration.test.ts` 16 个用例全部通过；`reports/research-db-summary.json` 的 `criticalSuites` 计数 +1。
Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations`
Expected: PASS（fresh 与 seeded-upgrade 两次 `pg_dump --schema-only` 一致）。

- [ ] **Step 7: `database.types.ts` 补五个 Row 类型**

文件头注释追加一行 `// + 20261106090000_financial_facts.sql (fact_sync_runs, filings, financial_facts, financial_metrics, fact_sync_scope)`；在 `DqFreshness` 接口之后加入：

```ts
// 20261106090000_financial_facts.sql. numeric columns (value) arrive as JSON numbers and round in
// JavaScript — readers use value_text. bigint (state_rev, based_on_rev) arrives as a JSON number.
export type FactMarket = 'US' | 'CN';
export interface FactSyncRun {
  run_id: string;
  issuer_id: string;
  market: FactMarket;
  batch_id: string;
  mapping_gen: number;
  status: 'staged' | 'published' | 'abandoned';
  manifest: string[];
  started_at: string;
  published_at: string | null;
}
export interface Filing {
  filing_id: string;
  issuer_id: string;
  market: FactMarket;
  source: 'edgar' | 'tushare';
  origin: 'sec' | 'sse' | 'szse' | 'bse';
  form_type: string;
  fiscal_year: number | null;
  fiscal_period: 'FY' | 'Q1' | 'Q2' | 'Q3' | 'H1' | '9M' | null;
  period_end: string | null;
  available_date: string;
  source_ref: string;
  url: string | null;
  document_ref: string | null;
  document_url: string | null;
  link_attempts: number;
  mapping_gen: number;
  run_id: string;
  created_at: string;
}
export interface FinancialFact {
  fact_id: string;
  issuer_id: string;
  market: FactMarket;
  filing_id: string;
  run_id: string;
  concept: string;
  source_concept: string;
  statement: 'IS' | 'BS' | 'CF' | 'DEI';
  period_start: string | null;
  period_end: string;
  duration: '3M' | '6M' | '9M' | '12M' | 'INSTANT';
  value: number;
  value_text: string;
  unit: string;
  consolidation: 'consolidated' | 'parent';
  available_date: string;
  mapping_gen: number;
  mapping_version: string;
  status: 'staged' | 'ok' | 'quarantined';
  raw_hash: string;
  created_at: string;
}
export interface FinancialMetric {
  issuer_id: string;
  market: FactMarket;
  metric: string;
  period_start: string;
  period_end: string;
  duration: '3M' | '6M' | '9M' | '12M' | 'TTM' | 'INSTANT';
  value: number;
  value_text: string;
  unit: string;
  input_unit: string;
  basis: 'us_standard' | 'cn_standard' | 'cn_incl_intangibles' | 'cn_incl_bonds';
  formula_version: string;
  inputs: Array<{ fact_id: string; concept: string; filing_id: string; available_date: string }>;
  based_on_rev: number;
  as_of: string;
  computed_at: string;
}
export interface FactSyncScope {
  issuer_id: string;
  market: FactMarket;
  reasons: string[];
  priority: number;
  fetch_key: string;
  next_due_at: string;
  lease_until: string | null;
  lease_batch_id: string | null;
  state_rev: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_batch_id: string | null;
  last_status: 'success' | 'failed' | null;
  updated_at: string;
}
```

在 `Database['public']['Tables']` 的 `issuer_industry_memberships` 条目之后登记：

```ts
      fact_sync_runs: { Row: FactSyncRun; Insert: Partial<FactSyncRun>; Update: Partial<FactSyncRun> };
      filings: { Row: Filing; Insert: Partial<Filing>; Update: Partial<Filing> };
      financial_facts: { Row: FinancialFact; Insert: Partial<FinancialFact>; Update: Partial<FinancialFact> };
      financial_metrics: { Row: FinancialMetric; Insert: Partial<FinancialMetric>; Update: Partial<FinancialMetric> };
      fact_sync_scope: { Row: FactSyncScope; Insert: Partial<FactSyncScope>; Update: Partial<FactSyncScope> };
```

`Functions` 不登记新 RPC（骨架约定；`supabaseFactsDb` 用窄类型调用）。

Run: `npm run typecheck && npm run lint`
Expected: 两者无输出退出码 0。

- [ ] **Step 8: 提交**

```bash
git add supabase/migrations/20261106090000_financial_facts.sql supabase/migrations.lock.json src/lib/supabase/database.types.ts src/lib/facts/facts.integration.test.ts scripts/ci/research-checks.ts
git commit -m "feat(facts): disclosure log tables, sync-run functions with lease and lock discipline, read_facts envelope" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 共享类型、`FactsDb` 契约、Supabase 与内存实现

**Files:**
- Create: `src/lib/facts/types.ts`
- Create: `src/lib/facts/db.ts`
- Create: `src/lib/facts/memory-facts-db.ts`
- Create: `src/lib/facts/db-contract.ts`
- Create: `src/lib/facts/db.test.ts`

- [ ] **Step 1: 落地共享类型（骨架原样，`stageFilings` 用清理后的签名）**

```ts
// src/lib/facts/types.ts
// Shared contract of the facts layer (plan 2 §共享契约, spec §4.8). Every task uses these names
// verbatim. FactsDb has three implementations: supabaseFactsDb (db.ts, rpc), memoryFactsDb
// (memory-facts-db.ts, unit tests), pgFactsDb (pg-facts-db.ts, integration tests).
export type Market='US'|'CN';
export type Statement='IS'|'BS'|'CF'|'DEI';
export type Duration='3M'|'6M'|'9M'|'12M'|'INSTANT';
export type MetricDuration=Duration|'TTM';
export type FactStatus='staged'|'ok'|'quarantined';
export type RunStatus='staged'|'published'|'abandoned';
export type FormType='10-K'|'10-Q'|'20-F'|'40-F'|'10-K/A'|'10-Q/A'|'20-F/A'|'annual'|'semiannual'|'q1'|'q3'|'restatement'|'other';
export type Origin='sec'|'sse'|'szse'|'bse';
export type Source='edgar'|'tushare';
export type UnitKind='money'|'shares'|'per_share';

export interface ConceptDef{
 id:string;statement:Statement;nature:'duration'|'instant';unitKind:UnitKind;
 usGaap:string[];ifrs:string[];
 tushare:{api:'income'|'balancesheet'|'cashflow';field:string}|{api:'income'|'balancesheet'|'cashflow';sum:string[]}|null;
 notes?:string;
}

/** 一个解析出的候选事实（value 为规范十进制字符串，§6.2） */
export interface FactCandidate{
 concept:string;sourceConcept:string;statement:Statement;
 periodStart:string|null;periodEnd:string;duration:Duration;
 value:string;unit:string;consolidation:'consolidated';
 filingRef:string;                 // = FilingCandidate.sourceRef
 rawHash:string;
}
export interface FilingCandidate{
 sourceRef:string;market:Market;source:Source;origin:Origin;formType:FormType;
 fiscalYear:number|null;fiscalPeriod:'FY'|'Q1'|'Q2'|'Q3'|'H1'|'9M'|null;
 periodEnd:string|null;availableDate:string;url:string|null;
}
export interface ParseResult{candidates:FactCandidate[];filings:FilingCandidate[];skipped:{reason:string;n:number}[];ambiguous:{key:string;candidates:FactCandidate[]}[];oddDuration:FactCandidate[];missingAvailableDate:Record<string,unknown>[]}

export interface RawSnapshot{bytes:Uint8Array;sha256:string;meta:{source:Source;api?:string;url?:string;params?:Record<string,unknown>;fields?:string;fetched_at:string;http_status:number;has_more?:boolean;page?:number}}
export interface Budget{remainingMs():number;signal:AbortSignal}

export interface FactRow{
 fact_id:string;issuer_id:string;market:Market;filing_id:string;run_id:string;concept:string;source_concept:string;statement:Statement;
 period_start:string|null;period_end:string;duration:Duration;value:string;value_text:string;unit:string;consolidation:string;
 available_date:string;mapping_gen:number;mapping_version:string;status:FactStatus;raw_hash:string;created_at:string;
 disclosure_seq?:number;is_current?:boolean;is_revision?:boolean;   // 只有 readFacts 返回时带
}
export interface FilingRow{
 filing_id:string;issuer_id:string;market:Market;source:Source;origin:Origin;form_type:FormType;fiscal_year:number|null;fiscal_period:string|null;
 period_end:string|null;available_date:string;source_ref:string;url:string|null;document_ref:string|null;document_url:string|null;
 link_attempts:number;mapping_gen:number;run_id:string;created_at:string;
}
export interface ScopeRow{issuer_id:string;market:Market;reasons:string[];priority:number;fetch_key:string;next_due_at:string;lease_until:string|null;lease_batch_id:string|null;state_rev:number;last_attempt_at:string|null;last_success_at:string|null;last_batch_id:string|null;last_status:'success'|'failed'|null}
export interface MetricRow{issuer_id:string;market:Market;metric:string;period_start:string;period_end:string;duration:MetricDuration;value:string;unit:string;input_unit:string;basis:string;formula_version:string;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string}[];based_on_rev:number;as_of:string}
export interface ConflictItem{id:string;natural_key:string;fact_ids:string[];available_date:string;key:Record<string,string|null>}

export interface ReadFactsOptions{concepts:string[];asOf:string;from?:string;to?:string;history?:boolean;limit?:number;includeNonOk?:boolean}
export interface ReadFactsResult{stateRev:number;rows:FactRow[];truncated:boolean}

export type FactsDbErrorCode='lease_lost'|'run_pending'|'run_published'|'mapping_gen_regression'|'stale_computation'|'read_truncated'|'duplicate_key'|'unknown';
export class FactsDbError extends Error{constructor(public code:FactsDbErrorCode,message?:string){super(message??code);this.name='FactsDbError';}}

export interface FactsDb{
 claimLease(issuer:string,market:Market,batch:string,ttlSeconds:number):Promise<boolean>;
 beginRun(issuer:string,market:Market,batch:string,mappingGen:number):Promise<string>;
 /** source_ref → filing_id，含已存在者 */
 stageFilings(run:string,rows:FilingInsert[]):Promise<Map<string,string>>;
 stageFacts(run:string,rows:FactInsert[]):Promise<number>;
 quarantineFacts(run:string,factIds:string[],itemId:string):Promise<number>;
 publishRun(run:string,manifest:string[]):Promise<number>;
 abandonRun(run:string):Promise<void>;
 releaseLease(issuer:string,market:Market,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
 resolveFactsQuarantine(itemId:string,chosen:string[],resolvedBy:string):Promise<{promoted:number;skipped:number}>;
 replaceMetrics(issuer:string,market:Market,basedOnRev:number,rows:MetricRow[]):Promise<number>;
 readFacts(issuer:string,market:Market,opts:ReadFactsOptions):Promise<ReadFactsResult>;
 factsByIds(ids:string[]):Promise<FactRow[]>;
 openConflicts(issuer:string,market:Market):Promise<ConflictItem[]>;
 filingsOfIssuer(issuer:string,market:Market,opts:{from?:string;to?:string;limit?:number;unlinkedOnly?:boolean}):Promise<FilingRow[]>;
 updateFilingLink(filingId:string,patch:{document_ref?:string|null;document_url?:string|null;link_attempts:number}):Promise<void>;
 reconcileScope(market:Market,rows:{issuer_id:string;reasons:string[];priority:number;fetch_key:string}[]):Promise<number>;
 scopeDue(market:Market,now:string,limit:number):Promise<ScopeRow[]>;
 /** 指定发行人的 scope 行（不看 priority / next_due_at；缺行者不返回），供脚本 `--issuer` 与回放测试直指发行人（审计 round-1 #13） */
 scopeRows(market:Market,issuerIds:string[]):Promise<ScopeRow[]>;
 metricsOfIssuer(issuer:string,market:Market,formulaVersion:string):Promise<MetricRow[]>;
}
/** stageFilings 的输入行（写入端生成 filing_id） */
export interface FilingInsert extends FilingCandidate{filing_id:string;issuer_id:string}
/** stageFacts 的输入行（写入端生成 fact_id；status 由函数置 staged） */
export interface FactInsert{fact_id:string;issuer_id:string;market:Market;filing_id:string;concept:string;source_concept:string;statement:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit:string;consolidation:'consolidated';available_date:string;mapping_gen:number;mapping_version:string;raw_hash:string}
```

- [ ] **Step 2: 写共享契约用例与失败测试**

```ts
// src/lib/facts/db-contract.ts
// Shared FactsDb contract (spec §4.5–§4.8, §5.3, §5.4): the same scenarios run against
// memoryFactsDb (db.test.ts) and pgFactsDb (facts.integration.test.ts), so the in-memory rules the
// unit tests rely on are exactly the SQL functions' rules. Not a test file: it registers
// describe/it only when called. dq_quarantine items are created with plan-1 quarantine() on the
// harness TableClient, the way sync.ts will.
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import {quarantine} from '../dq/quarantine';
import {FactsDbError} from './types';
import type {FactInsert,FactsDb,FilingInsert,Market,MetricRow} from './types';

export interface ContractHarness{
 db:FactsDb;tables:TableClient;
 issuer():Promise<string>;batch():Promise<string>;
 expireLease(issuer:string,market:Market):Promise<void>;
 close?():Promise<void>;
}
export function filingInsert(issuer:string,o:Partial<FilingInsert>={}):FilingInsert{
 return {filing_id:randomUUID(),issuer_id:issuer,sourceRef:randomUUID(),market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2024-02-01',url:null,...o};
}
export function factInsert(issuer:string,filing:FilingInsert,o:Partial<FactInsert>={}):FactInsert{
 return {fact_id:randomUUID(),issuer_id:issuer,market:'US',filing_id:filing.filing_id,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'100',unit:'USD',consolidation:'consolidated',available_date:filing.availableDate,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...o};
}
/** 'code:message' of a FactsDbError rejection, 'resolved' when it did not reject. */
const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof FactsDbError?`${e.code}:${e.message}`:`not_facts_db_error:${String(e)}`);

export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>):void{
 describe(label,()=>{
  let h:ContractHarness;let db:FactsDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const ready=async()=>{
   const iss=await h.issuer();const b=await h.batch();
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(1);
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);
   return {iss,b};
  };
  const conflict=(iss:string,b:string,run:string,ids:string[],date='2024-02-01')=>quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,reasonCode:'same_day_conflict',batchId:b,
   payload:{key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:ids,values:[],run_id:run}});
  const item=async(id:string)=>{const [r]=await h.tables.select('dq_quarantine',{id});return {status:r.status,fact_ids:(r.payload as {fact_ids:string[]}).fact_ids,chosen:(r.detail as {chosen_fact_ids?:string[]}).chosen_fact_ids??null};};
  const statusOf=async(id:string)=>(await db.factsByIds([id]))[0]?.status??null;
  const current=(iss:string,concepts=['revenue'],history=true)=>db.readFacts(iss,'US',{concepts,asOf:'2030-01-01',history});
  /** A published run: f0 (2024-01-01) carries r0 = 90, f (2024-02-01) carries r = 100, same key. state_rev 1. */
  const published=async()=>{
   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);
   const f0=filingInsert(iss,{availableDate:'2024-01-01'});const f=filingInsert(iss);
   const m=await db.stageFilings(run,[f0,f]);
   expect(m.get(f0.sourceRef)).toBe(f0.filing_id);expect(m.get(f.sourceRef)).toBe(f.filing_id);expect(m.size).toBe(2);
   const r0=factInsert(iss,f0,{value:'90'});const r=factInsert(iss,f);
   expect(await db.stageFacts(run,[r0,r])).toBe(2);
   expect(await db.publishRun(run,[f0.filing_id,f.filing_id])).toBe(2);
   return {iss,b,run,f0,f,r0:r0.fact_id,r:r.fact_id};
  };

  it('lease: exclusive, renewable by the holder, lost after expiry; release needs the holder and sets the schedule',async()=>{
   const {iss,b}=await ready();const b2=await h.batch();
   expect(await db.claimLease(randomUUID(),'US',b,600)).toBe(false);          // no scope row
   expect(await db.claimLease(iss,'US',b2,600)).toBe(false);
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);                     // renew
   await h.expireLease(iss,'US');
   expect(await db.claimLease(iss,'US',b2,600)).toBe(true);
   expect(await code(db.beginRun(iss,'US',b,1))).toBe('lease_lost:lease_lost');
   expect(await code(db.releaseLease(iss,'US',b,'failed','2030-01-01T00:00:00.000Z'))).toBe('lease_lost:lease_lost');
   await db.releaseLease(iss,'US',b2,'success','2030-01-01T00:00:00.000Z');
   const due=(at:string)=>db.scopeDue('US',at,1000).then(rows=>rows.find(x=>x.issuer_id===iss));
   expect(await due('2029-12-31T23:59:59.000Z')).toBeUndefined();
   expect(await due('2030-01-01T00:00:00.000Z')).toMatchObject({issuer_id:iss,market:'US',lease_until:null,lease_batch_id:null,last_status:'success',last_batch_id:b2,state_rev:0,priority:10});
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);                     // released → claimable again
  });

  it('runs: begin abandons staged runs and prunes empty gen-0 filings; stage dedupes; abandon refuses published runs; closed runs refuse writes',async()=>{
   const {iss,b,run,f0,f,r0,r}=await published();
   const run2=await db.beginRun(iss,'US',b,1);
   const f2=filingInsert(iss);const m=await db.stageFilings(run2,[f,f2]);
   expect(m.get(f.sourceRef)).toBe(f.filing_id);expect(m.get(f2.sourceRef)).toBe(f2.filing_id);
   expect(await db.stageFacts(run2,[factInsert(iss,f)])).toBe(0);              // same candidate key → not written
   const x=factInsert(iss,f2,{value:'7'});expect(await db.stageFacts(run2,[x])).toBe(1);
   expect(await statusOf(x.fact_id)).toBe('staged');
   expect((await current(iss)).rows.map(y=>y.fact_id)).toEqual([r0,r]);
   const run3=await db.beginRun(iss,'US',b,1);                                  // abandons run2
   expect(await statusOf(x.fact_id)).toBeNull();
   expect((await db.filingsOfIssuer(iss,'US',{})).map(g=>g.filing_id).sort()).toEqual([f0.filing_id,f.filing_id].sort());
   expect(await code(db.abandonRun(run))).toBe('run_published:run_published');
   await db.abandonRun(run3);await db.abandonRun(run3);
   expect(await code(db.stageFacts(run3,[]))).toBe('unknown:run_abandoned');
   expect(await code(db.stageFacts(run,[]))).toBe('run_published:run_published');
   expect(await code(db.publishRun(randomUUID(),[]))).toBe('unknown:run_not_found');
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2024-01-15'})).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current])).toEqual([[r0,1,true]]);
   expect((await current(iss)).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current,y.is_revision])).toEqual([[r0,1,false,false],[r,2,true,true]]);
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await current(iss)).stateRev).toBe(1);
  });

  it('generations: publish activates manifest filings, refuses a regression, keeps old-generation rows as evidence',async()=>{
   const {iss,b,f,r0,r}=await published();
   const run2=await db.beginRun(iss,'US',b,2);const a2=factInsert(iss,f,{value:'101'});
   expect(await db.stageFacts(run2,[a2])).toBe(1);expect(await db.publishRun(run2,[f.filing_id])).toBe(1);
   expect((await current(iss)).rows.map(y=>[y.fact_id,y.is_revision])).toEqual([[r0,false],[a2.fact_id,true]]);
   expect((await db.factsByIds([r,a2.fact_id])).map(y=>y.status)).toEqual(['ok','ok']);
   const run3=await db.beginRun(iss,'US',b,1);const a3=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run3,[a3])).toBe(1);
   expect(await code(db.publishRun(run3,[f.filing_id]))).toBe('mapping_gen_regression:mapping_gen_regression');
   expect(await statusOf(a3.fact_id)).toBe('staged');
   expect((await current(iss)).stateRev).toBe(2);
  });

  it('same-day conflict: register, abandon, retry, publish; resolve is run_pending until publish; the verdict promotes chosen rows and binds the rest',async()=>{
   const {iss,b,r0,r}=await published();
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const itemId=await conflict(iss,b,runB,[c.fact_id,r]);
   expect(await db.quarantineFacts(runB,[c.fact_id],itemId)).toBe(1);
   expect((await db.openConflicts(iss,'US')).map(i=>({id:i.id,fact_ids:i.fact_ids,available_date:i.available_date,concept:i.key.concept}))).toEqual([{id:itemId,fact_ids:[c.fact_id,r],available_date:'2024-02-01',concept:'revenue'}]);
   await db.abandonRun(runB);
   expect(await statusOf(r)).toBe('ok');expect(await statusOf(c.fact_id)).toBeNull();expect((await item(itemId)).status).toBe('open');
   const runC=await db.beginRun(iss,'US',b,1);const fc=filingInsert(iss);await db.stageFilings(runC,[fc]);
   const c2=factInsert(iss,fc,{value:'200'});await db.stageFacts(runC,[c2]);
   expect(await code(db.quarantineFacts(runC,[c2.fact_id],randomUUID()))).toBe('unknown:item_not_open');
   expect(await db.quarantineFacts(runC,[c2.fact_id,c2.fact_id],itemId)).toBe(1);
   expect((await item(itemId)).fact_ids).toEqual([c.fact_id,r,c2.fact_id]);
   expect(await code(db.resolveFactsQuarantine(itemId,[r],randomUUID()))).toBe('run_pending:run_pending');
   expect((await item(itemId)).status).toBe('open');
   expect(await db.publishRun(runC,[fc.filing_id])).toBe(0);
   expect(await statusOf(r)).toBe('quarantined');expect(await statusOf(c2.fact_id)).toBe('quarantined');
   expect((await current(iss,['revenue'],false)).rows.map(y=>[y.fact_id,y.value])).toEqual([[r0,'90']]);
   expect(await code(db.resolveFactsQuarantine(itemId,[randomUUID()],randomUUID()))).toBe('unknown:invalid_chosen');
   expect(await db.resolveFactsQuarantine(itemId,[r],randomUUID())).toEqual({promoted:1,skipped:0});
   expect(await item(itemId)).toEqual({status:'resolved_accept',fact_ids:[c.fact_id,r,c2.fact_id],chosen:[r]});
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await current(iss)).stateRev).toBe(3);
   expect(await db.openConflicts(iss,'US')).toEqual([]);
   const other=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{},fact_ids:[c2.fact_id],run_id:runC}});
   expect(await db.resolveFactsQuarantine(other,[],randomUUID())).toEqual({promoted:0,skipped:1});
   expect(await statusOf(c2.fact_id)).toBe('quarantined');
   expect(await code(db.resolveFactsQuarantine(other,[],randomUUID()))).toBe('unknown:item_not_open');
  });

  it('metrics: stale based_on_rev is refused after publish; replacement is per issuer and atomic; metricsOfIssuer filters by formula version',async()=>{
   const {iss,b,r}=await published();
   const row=(v:string,metric='gross_margin'):MetricRow=>({issuer_id:iss,market:'US',metric,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,as_of:'2024-03-01'});
   expect(await code(db.replaceMetrics(iss,'US',0,[row('0.5')]))).toBe('stale_computation:stale_computation');
   expect(await db.replaceMetrics(iss,'US',1,[row('0.5')])).toBe(1);
   const run=await db.beginRun(iss,'US',b,1);expect(await db.publishRun(run,[])).toBe(0);   // empty run still advances state_rev
   expect(await code(db.replaceMetrics(iss,'US',1,[row('0.6')]))).toBe('stale_computation:stale_computation');
   expect(await db.replaceMetrics(iss,'US',2,[row('0.6'),row('0.7','net_margin')])).toBe(2);
   expect((await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).map(m=>[m.metric,m.value,m.based_on_rev,m.inputs[0].fact_id,m.as_of])).toEqual([['gross_margin','0.6',2,r,'2024-03-01'],['net_margin','0.7',2,r,'2024-03-01']]);
   expect(await db.metricsOfIssuer(iss,'US','facts-derive/0.9')).toEqual([]);
   expect(await db.replaceMetrics(iss,'US',2,[])).toBe(0);
   expect(await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).toEqual([]);
   expect(await code(db.replaceMetrics(randomUUID(),'US',1,[]))).toBe('stale_computation:stale_computation');   // no scope row ⇒ rev 0
  });

  it('reads: key ranking and limit, from/to, asOf, non-ok rows without sequence, factsByIds, filings and links, scope reconcile and due',async()=>{
   const {iss,b,run,f0,f,r0,r}=await published();
   const run1=await db.beginRun(iss,'US',b,1);
   const t1=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2023-12-31',value:'1'});
   const t2=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2023-09-30',value:'2'});
   expect(await db.stageFacts(run1,[t1,t2])).toBe(2);await db.publishRun(run1,[f.filing_id]);
   const all=await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true});
   expect(all.rows.map(y=>y.fact_id)).toEqual([r0,r,t1.fact_id,t2.fact_id]);                       // period_end desc, concept asc, then disclosure order
   expect((await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true,limit:2})).rows.map(y=>y.fact_id)).toEqual([r0,r,t1.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['total_assets'],asOf:'2030-01-01',from:'2023-10-01'})).rows.map(y=>y.fact_id)).toEqual([t1.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['total_assets'],asOf:'2030-01-01',to:'2023-09-30'})).rows.map(y=>y.fact_id)).toEqual([t2.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2023-12-31'})).rows).toEqual([]);
   expect((await db.readFacts(iss,'US',{concepts:['nope'],asOf:'2030-01-01'})).rows).toEqual([]);
   const [row]=(await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:false})).rows;
   expect(row).toMatchObject({fact_id:r,issuer_id:iss,market:'US',run_id:run,filing_id:f.filing_id,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'100',value_text:'100',unit:'USD',consolidation:'consolidated',available_date:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',disclosure_seq:2,is_current:true,is_revision:true});
   expect(typeof row.created_at).toBe('string');
   const run2=await db.beginRun(iss,'US',b,1);const fq=filingInsert(iss,{availableDate:'2024-03-01'});await db.stageFilings(run2,[fq]);
   const qd=factInsert(iss,fq,{value:'105'});await db.stageFacts(run2,[qd]);
   const itemId=await conflict(iss,b,run2,[qd.fact_id],'2024-03-01');await db.quarantineFacts(run2,[qd.fact_id],itemId);await db.publishRun(run2,[fq.filing_id]);
   const withNonOk=await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true});
   expect(withNonOk.rows.map(y=>[y.fact_id,y.status,y.disclosure_seq??null,y.is_current])).toEqual([[r0,'ok',1,false],[r,'ok',2,true],[qd.fact_id,'quarantined',null,false]]);
   expect(withNonOk.stateRev).toBe(3);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:false,includeNonOk:true})).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await db.factsByIds([qd.fact_id,randomUUID()])).map(y=>[y.fact_id,y.status,y.value])).toEqual([[qd.fact_id,'quarantined','105']]);
   expect(await db.factsByIds([])).toEqual([]);
   const list=await db.filingsOfIssuer(iss,'US',{});
   expect(list.map(g=>g.filing_id)).toEqual([fq.filing_id,f.filing_id,f0.filing_id]);                 // available_date desc
   expect(list[1]).toMatchObject({issuer_id:iss,market:'US',source:'edgar',origin:'sec',source_ref:f.sourceRef,form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-02-01',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:run});
   expect((await db.filingsOfIssuer(iss,'US',{from:'2024-02-01',to:'2024-02-28'})).map(g=>g.filing_id)).toEqual([f.filing_id]);
   expect((await db.filingsOfIssuer(iss,'US',{limit:1})).map(g=>g.filing_id)).toEqual([fq.filing_id]);
   await db.updateFilingLink(f.filing_id,{document_ref:'doc-1',document_url:'https://example.test/doc-1',link_attempts:1});
   await db.updateFilingLink(f0.filing_id,{link_attempts:3});
   expect((await db.filingsOfIssuer(iss,'US',{unlinkedOnly:true})).map(g=>[g.filing_id,g.link_attempts])).toEqual([[fq.filing_id,0],[f0.filing_id,3]]);
   expect((await db.filingsOfIssuer(iss,'US',{})).find(g=>g.filing_id===f.filing_id)).toMatchObject({document_ref:'doc-1',document_url:'https://example.test/doc-1',link_attempts:1,mapping_gen:1});
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(0);
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:0,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeDue('US','2100-01-01T00:00:00.000Z',1000)).find(x=>x.issuer_id===iss)).toBeUndefined();   // priority 0 is out of scope
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:5,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeDue('US','2100-01-01T00:00:00.000Z',1000)).find(x=>x.issuer_id===iss)).toMatchObject({market:'US',reasons:['sp500'],priority:5,fetch_key:'0000000001',lease_batch_id:b,state_rev:3,last_status:null,last_batch_id:null});
   expect(await db.scopeDue('US','2100-01-01T00:00:00.000Z',0)).toEqual([]);
   expect((await db.scopeRows('US',[iss,randomUUID()])).map(x=>[x.issuer_id,x.priority,x.fetch_key])).toEqual([[iss,5,'0000000001']]);   // by id, whatever priority / next_due_at
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:0,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeRows('US',[iss])).map(x=>x.priority)).toEqual([0]);
   expect(await db.scopeRows('CN',[iss])).toEqual([]);
   expect(await db.scopeRows('US',[])).toEqual([]);
  });

  it("promotion blocks on an OPEN same_day_conflict for the row's (K, date) even when the row is not in that item's member list (round-1 #3)",async()=>{
   const {iss,b,r}=await published();                                                     // r: revenue 100 on 2024-02-01, ok
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const dispute=await conflict(iss,b,runB,[c.fact_id,r]);                                // open dispute on (K, 2024-02-01): members c, r
   await db.quarantineFacts(runB,[c.fact_id],dispute);
   expect(await db.publishRun(runB,[fb.filing_id])).toBe(0);                              // r disposed
   // Run C discloses the same K on the same day (value 100) from a third filing, parked by an
   // identity item only: it is NOT a member of the dispute.
   const runC=await db.beginRun(iss,'US',b,1);const fc=filingInsert(iss);await db.stageFilings(runC,[fc]);
   const c3=factInsert(iss,fc,{value:'100'});await db.stageFacts(runC,[c3]);
   const identity=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[c3.fact_id],run_id:runC}});
   await db.quarantineFacts(runC,[c3.fact_id],identity);
   expect(await db.publishRun(runC,[fc.filing_id])).toBe(0);
   expect(await db.resolveFactsQuarantine(identity,[],randomUUID())).toEqual({promoted:0,skipped:1});   // (K, 2024-02-01) is still disputed
   expect(await statusOf(c3.fact_id)).toBe('quarantined');
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.value)).toEqual(['90']);                  // the day still has no ok value
   expect(await db.resolveFactsQuarantine(dispute,[r],randomUUID())).toEqual({promoted:1,skipped:0});
   expect(await statusOf(r)).toBe('ok');expect(await statusOf(c3.fact_id)).toBe('quarantined');       // c3 waits for promote_quarantined (§7.3), the dispute no longer blocks it
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
  });

  it('an item without fact rows is run_pending while its anchor run is staged; acknowledged once that run is published or abandoned (round-1 #10)',async()=>{
   const {iss,b}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const parked=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-09-30:consolidated:USD:acc-9:1`,reasonCode:'ambiguous_value',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run}});
   expect(await code(db.resolveFactsQuarantine(parked,[],randomUUID()))).toBe('run_pending:run_pending');
   expect((await item(parked)).status).toBe('open');
   expect(await db.publishRun(run,[])).toBe(0);
   expect(await db.resolveFactsQuarantine(parked,[],randomUUID())).toEqual({promoted:0,skipped:0});
   expect((await item(parked)).status).toBe('resolved_accept');
   expect((await current(iss)).stateRev).toBe(3);                                         // publish + resolution
   const run2=await db.beginRun(iss,'US',b,1);
   const parked2=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-06-30:consolidated:USD:acc-9:1`,reasonCode:'odd_duration',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run2}});
   expect(await code(db.resolveFactsQuarantine(parked2,[],randomUUID()))).toBe('run_pending:run_pending');
   await db.abandonRun(run2);
   expect(await db.resolveFactsQuarantine(parked2,[],randomUUID())).toEqual({promoted:0,skipped:0});
  });

  it('complete-set reads return every row past 1,000: filingsOfIssuer without limit, metricsOfIssuer, scopeRows (round-1 #7)',async()=>{
   const {iss,b,r}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const many=Array.from({length:1001},(_,i)=>filingInsert(iss,{availableDate:'2020-01-01',sourceRef:`bulk-${iss}-${String(i).padStart(4,'0')}`}));   // (source, source_ref) is globally unique
   expect((await db.stageFilings(run,many)).size).toBe(1001);
   expect(await db.publishRun(run,many.map(f=>f.filing_id))).toBe(0);
   expect((await db.filingsOfIssuer(iss,'US',{})).length).toBe(1003);
   expect((await db.filingsOfIssuer(iss,'US',{limit:5})).length).toBe(5);
   expect((await db.filingsOfIssuer(iss,'US',{from:'2020-01-01',to:'2020-01-01'})).length).toBe(1001);
   const rev=(await current(iss)).stateRev;
   const rows=Array.from({length:1001},(_,i):MetricRow=>({issuer_id:iss,market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:String(i),unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:rev,as_of:'2024-03-01'}));
   expect(await db.replaceMetrics(iss,'US',rev,rows)).toBe(1001);
   const got=await db.metricsOfIssuer(iss,'US','facts-derive/1.0');
   expect(got.length).toBe(1001);expect(got.at(-1)).toMatchObject({metric:'m1000',value:'1000'});
  },60000);
 });
}
```

```ts
// src/lib/facts/db.test.ts
// memoryFactsDb against the shared contract, memory-only rules (clock, atomic validation), and the
// supabaseFactsDb wiring (rpc names/args, chunking, envelope normalisation, error mapping) over a
// stub client.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {FactsDbError,supabaseFactsDb,toFactsDbError} from './db';
import {factInsert,factsDbContract,filingInsert} from './db-contract';
import {memoryFactsDb,numericEquals} from './memory-facts-db';

factsDbContract('memoryFactsDb contract',async()=>{
 const db=memoryFactsDb();
 return {db,tables:db.tables,issuer:async()=>randomUUID(),batch:async()=>randomUUID(),expireLease:async(i,m)=>db.expireLease(i,m)};
});

describe('memoryFactsDb specifics',()=>{
 it('expires leases against the injected clock',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b1=randomUUID();const b2=randomUUID();
  db.setNow('2026-01-01T00:00:00.000Z');
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);
  expect(await db.claimLease(iss,'US',b1,60)).toBe(true);
  db.setNow('2026-01-01T00:00:59.000Z');expect(await db.claimLease(iss,'US',b2,60)).toBe(false);
  db.setNow('2026-01-01T00:01:00.000Z');expect(await db.claimLease(iss,'US',b2,60)).toBe(true);
  await expect(db.beginRun(iss,'US',b1,1)).rejects.toMatchObject({code:'lease_lost'});
  expect(db.scope()[0]).toMatchObject({lease_batch_id:b2,lease_until:'2026-01-01T00:02:00.000Z'});
 });
 it('validates a stageFacts batch before writing any row, like one SQL statement',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  const good=factInsert(iss,f);
  await expect(db.stageFacts(run,[good,factInsert(iss,f,{period_start:'2023-12-31'})])).rejects.toMatchObject({code:'unknown',message:'financial_facts_period'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{duration:'INSTANT'})])).rejects.toMatchObject({message:'financial_facts_instant'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{available_date:'2024-02-02'})])).rejects.toMatchObject({message:'financial_facts_filing_date_fkey'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{filing_id:randomUUID()})])).rejects.toMatchObject({message:'financial_facts_filing_fkey'});
  expect(db.facts()).toEqual([]);
  expect(await db.stageFacts(run,[good])).toBe(1);
  await expect(db.stageFacts(run,[{...factInsert(iss,f,{concept:'net_income'}),fact_id:good.fact_id}])).rejects.toMatchObject({code:'duplicate_key'});
 });
 it('shares dq_quarantine with the TableClient it was given',async()=>{
  const db=memoryFactsDb();
  await db.tables.insert('dq_quarantine',{id:'i1',dataset:'facts.us',table_name:'financial_facts',natural_key:'a:US:x',reason_code:'same_day_conflict',status:'open',payload:{key:{available_date:'2024-01-01'},fact_ids:['f1']},detail:{},batch_id:'b',created_at:'2026-01-01T00:00:00.000Z'});
  expect(await db.openConflicts('a','US')).toEqual([{id:'i1',natural_key:'a:US:x',fact_ids:['f1'],available_date:'2024-01-01',key:{available_date:'2024-01-01'}}]);
  expect(await db.openConflicts('b','US')).toEqual([]);
 });
});

describe('numericEquals',()=>{
 it('compares canonical decimal strings as numeric would',()=>{
  expect(numericEquals('100','100.000')).toBe(true);
  expect(numericEquals('-0','0')).toBe(true);
  expect(numericEquals('0100','100')).toBe(true);
  expect(numericEquals('1.50','1.5')).toBe(true);
  expect(numericEquals('12345678901234567890','12345678901234567891')).toBe(false);
  expect(numericEquals('1','2')).toBe(false);
  expect(numericEquals('-1','1')).toBe(false);
 });
});

describe('toFactsDbError',()=>{
 it('maps SQLSTATE and the code-as-message convention',()=>{
  expect(toFactsDbError({message:'lease_lost',code:'55P03'})).toMatchObject({name:'FactsDbError',code:'lease_lost'});
  expect(toFactsDbError({message:'canceling statement due to lock timeout',code:'55P03'}).code).toBe('lease_lost');
  for(const c of ['run_pending','run_published','mapping_gen_regression','stale_computation'])expect(toFactsDbError({message:c,code:'P0001'}).code).toBe(c);
  expect(toFactsDbError({message:'duplicate key value violates unique constraint "filings_pkey"',code:'23505'}).code).toBe('duplicate_key');
  expect(toFactsDbError({message:'item_not_open',code:'P0001'})).toMatchObject({code:'unknown',message:'item_not_open'});
  expect(toFactsDbError({message:undefined,code:undefined}).code).toBe('unknown');
  expect(toFactsDbError({message:'x'})).toBeInstanceOf(FactsDbError);
 });
});

describe('supabaseFactsDb',()=>{
 type Call={fn:string;args:Record<string,unknown>};
 type Op=[string,unknown[]];
 type FromResponder=(table:string,ops:Op[])=>unknown[];
 /** A thenable PostgREST-like builder: every chained call is recorded, `respond` answers when awaited. */
 const builder=(table:string,respond:FromResponder)=>{
  const ops:Op[]=[];
  const proxy:Record<string|symbol,unknown>=new Proxy({},{get:(_t,m)=>m==='then'
   ?(res:(v:unknown)=>unknown,rej:(e:unknown)=>unknown)=>Promise.resolve({data:respond(table,ops),error:null}).then(res,rej)
   :(...a:unknown[])=>{ops.push([String(m),a]);return proxy;}});
  return proxy;
 };
 const stub=(respond:(fn:string,args:Record<string,unknown>)=>{data?:unknown;error?:{message:string;code?:string}|null},from:FromResponder=()=>{throw new Error('from() not expected');})=>{
  const calls:Call[]=[];
  const client={rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});const r=respond(fn,args);return {data:r.data??null,error:r.error??null};},from:(table:string)=>builder(table,from)};
  return {calls,db:supabaseFactsDb(client as unknown as SupabaseClient)};
 };
 it('pages complete-set table reads past PostgREST max_rows in a fixed order and pushes filters into the query (round-1 #7)',async()=>{
  const metric=(i:number)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:'2',as_of:'2024-01-01'});
  const scope=(i:number)=>({issuer_id:`i${i}`,market:'US',reasons:[],priority:10,fetch_key:'k',next_due_at:'2026-01-01T00:00:00+00:00',lease_until:null,lease_batch_id:null,state_rev:'0',last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  const pages:Op[][]=[];
  const totals:Record<string,number>={financial_metrics:1005,filings:1002,fact_sync_scope:3,financial_facts:2};
  const {db}=stub(()=>({data:null}),(table,ops)=>{
   pages.push(ops);
   const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];
   return Array.from({length:Math.max(0,Math.min(totals[table],to+1)-from)},(_,i)=>table==='financial_metrics'?metric(from+i):table==='filings'?{filing_id:`f${from+i}`,value_text:'1'}:table==='fact_sync_scope'?scope(from+i):{fact_id:`a${from+i}`,value_text:'1'});
  });
  const ranges=(from:number)=>pages.slice(from).map(ops=>ops.find(o=>o[0]==='range')![1]);
  const metrics=await db.metricsOfIssuer('iss','US','v');
  expect(metrics).toHaveLength(1005);expect(metrics[1004]).toMatchObject({metric:'m1004',based_on_rev:2});
  expect(pages[0]).toContainEqual(['eq',['formula_version','v']]);                       // filtered in the query, not after the read
  expect(ranges(0)).toEqual([[0,999],[1000,1999]]);                                      // full page → next page; short page → stop
  let n=pages.length;
  expect(await db.filingsOfIssuer('iss','US',{})).toHaveLength(1002);
  expect(ranges(n)).toEqual([[0,999],[1000,1999]]);
  expect(pages[n]).toContainEqual(['order',['available_date',{ascending:false}]]);
  n=pages.length;
  expect(await db.filingsOfIssuer('iss','US',{limit:3})).toHaveLength(3);
  expect(ranges(n)).toEqual([[0,2]]);                                                    // an explicit limit is a cap, not a page size
  n=pages.length;
  expect((await db.scopeRows('US',['i0','i1','i2'])).map(s=>s.issuer_id)).toEqual(['i0','i1','i2']);
  expect(pages[n]).toContainEqual(['in',['issuer_id',['i0','i1','i2']]]);
  expect(pages[n]).toContainEqual(['eq',['market','US']]);
  n=pages.length;
  expect(await db.factsByIds(['a0','a1'])).toHaveLength(2);
  expect(pages[n]).toContainEqual(['in',['fact_id',['a0','a1']]]);
  expect(await db.scopeRows('US',[])).toEqual([]);expect(await db.factsByIds([])).toEqual([]);
 });
 it('calls the SQL functions with p_ arguments and chunks staging at 500 rows (an empty batch still calls once)',async()=>{
  const {calls,db}=stub((fn,args)=>fn==='stage_facts'?{data:(args.p_rows as unknown[]).length}:fn==='stage_filings'?{data:Object.fromEntries((args.p_rows as {source_ref:string;filing_id:string}[]).map(r=>[r.source_ref,r.filing_id]))}:{data:true});
  const iss=randomUUID();const f=filingInsert(iss);
  expect(await db.claimLease(iss,'US','b',600)).toBe(true);
  expect(calls[0]).toEqual({fn:'claim_fact_sync_lease',args:{p_issuer:iss,p_market:'US',p_batch:'b',p_ttl_seconds:600}});
  const rows=Array.from({length:1200},()=>factInsert(iss,f));
  expect(await db.stageFacts('run',rows)).toBe(1200);
  expect(calls.slice(1).map(c=>[c.fn,(c.args.p_rows as unknown[]).length])).toEqual([['stage_facts',500],['stage_facts',500],['stage_facts',200]]);
  expect(await db.stageFacts('run',[])).toBe(0);
  expect(calls.at(-1)).toEqual({fn:'stage_facts',args:{p_run:'run',p_rows:[]}});
  const m=await db.stageFilings('run',[f]);
  expect(m.get(f.sourceRef)).toBe(f.filing_id);
  expect(calls.at(-1)!.args.p_rows).toEqual([{filing_id:f.filing_id,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-02-01',source_ref:f.sourceRef,url:null}]);
  await db.releaseLease(iss,'US','b','success','2030-01-01T00:00:00.000Z');
  expect(calls.at(-1)).toEqual({fn:'release_fact_sync_lease',args:{p_issuer:iss,p_market:'US',p_batch:'b',p_outcome:'success',p_next_due:'2030-01-01T00:00:00.000Z'}});
  await db.resolveFactsQuarantine('item',['a'],'admin');
  expect(calls.at(-1)).toEqual({fn:'resolve_facts_quarantine',args:{p_item:'item',p_chosen:['a'],p_resolved_by:'admin'}});
  await db.replaceMetrics(iss,'US',3,[{issuer_id:iss,market:'US',metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,as_of:'2024-01-01'}]);
  expect(calls.at(-1)!.args).toEqual({p_issuer:iss,p_market:'US',p_based_on_rev:3,p_rows:[{metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],as_of:'2024-01-01'}]});
 });
 it('normalises the read_facts envelope: numeric state_rev, value from value_text, null sequence fields dropped',async()=>{
  const {calls,db}=stub(()=>({data:{state_rev:'7',truncated:false,row_count:2,rows:[{fact_id:'a',value:123,value_text:'123',disclosure_seq:1,is_current:true,is_revision:false},{fact_id:'b',value:1,value_text:'1.0',disclosure_seq:null,is_current:false,is_revision:false}]}}));
  const out=await db.readFacts('iss','US',{concepts:['revenue'],asOf:'2024-06-30',history:true});
  expect(calls[0]).toEqual({fn:'read_facts',args:{p_issuer:'iss',p_market:'US',p_concepts:['revenue'],p_as_of:'2024-06-30',p_from:null,p_to:null,p_history:true,p_limit:null,p_include_non_ok:false}});
  expect(out).toEqual({stateRev:7,truncated:false,rows:[{fact_id:'a',value:'123',value_text:'123',disclosure_seq:1,is_current:true,is_revision:false},{fact_id:'b',value:'1.0',value_text:'1.0',disclosure_seq:undefined,is_current:false,is_revision:false}]});
  const {db:t}=stub(()=>({data:{state_rev:9,truncated:true,row_count:0,rows:[]}}));
  expect(await t.readFacts('iss','US',{concepts:['revenue'],asOf:'2024-06-30'})).toEqual({stateRev:9,truncated:true,rows:[]});
 });
 it('maps PostgREST errors to FactsDbError codes',async()=>{
  const {db}=stub(fn=>({error:fn==='begin_sync_run'?{message:'lease_lost',code:'55P03'}:fn==='publish_sync_run'?{message:'mapping_gen_regression',code:'P0001'}:{message:'boom',code:'XX000'}}));
  await expect(db.beginRun('i','US','b',1)).rejects.toMatchObject({name:'FactsDbError',code:'lease_lost'});
  await expect(db.publishRun('r',[])).rejects.toMatchObject({code:'mapping_gen_regression'});
  await expect(db.abandonRun('r')).rejects.toMatchObject({code:'unknown',message:'boom'});
 });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test -- src/lib/facts/db.test.ts`
Expected: FAIL，`Cannot find module './db'`（以及 `./db-contract`、`./memory-facts-db` 不存在）。

- [ ] **Step 4: 实现 `db.ts`（契约 re-export、错误映射、信封归一、Supabase 实现）**

```ts
// src/lib/facts/db.ts
// FactsDb (spec §4.8): the only data access the facts layer uses. Writes are SQL functions
// (rpc) because no role may touch the fact tables directly (§4.7); reads that need no snapshot
// use .from() under RLS (factsByIds, openConflicts, filingsOfIssuer, scopeDue, metricsOfIssuer,
// and the one column-level write updateFilingLink). The functions raise with the code as the
// message (lease_lost 55P03; run_pending, run_published, mapping_gen_regression,
// stale_computation P0001); toFactsDbError maps that, 23505 → duplicate_key, the rest → unknown.
// The read_facts envelope is normalised here so all three implementations return identical rows
// (value = value_text, null sequence fields → undefined). New RPCs are not registered in
// database.types.ts (repo convention): the client is narrowed locally. Table reads that feed
// planning, evidence or scheduling are COMPLETE-SET reads: PostgREST silently truncates at
// max_rows (1,000 locally and hosted), so they page by `.range()` in a fixed order until a short
// page (audit round-1 #7); an explicit `limit` caps the total instead.
import type {SupabaseClient} from '@supabase/supabase-js';
import {FactsDbError} from './types';
import type {ConflictItem,FactRow,FactsDb,FactsDbErrorCode,FilingInsert,FilingRow,Market,MetricRow,ReadFactsOptions,ReadFactsResult,ScopeRow} from './types';
export {FactsDbError} from './types';
export type {FactsDb} from './types';

/** Rows per stage_filings / stage_facts call (§4.8). */
export const STAGE_CHUNK=500;
/** read_facts hard cap (§4.6); above it the envelope is truncated and carries no rows. */
export const READ_FACTS_CAP=10000;
/** Page size of complete-set table reads (= PostgREST max_rows). */
export const READ_PAGE=1000;
/** ids per `.in()` filter (URL length). */
export const IN_CHUNK=200;
const MESSAGE_CODES:readonly FactsDbErrorCode[]=['run_pending','run_published','mapping_gen_regression','stale_computation'];

export interface PgErrorLike{message?:string;code?:string|null;details?:string|null;hint?:string|null}
/** PostgreSQL / PostgREST error → FactsDbError (shared by the Supabase and pg adapters). */
export function toFactsDbError(e:PgErrorLike):FactsDbError{
 const message=e.message??'';
 const head=message.split(/[\s:]/,1)[0];
 if(e.code==='55P03'||head==='lease_lost')return new FactsDbError('lease_lost',message||'lease_lost');
 if((MESSAGE_CODES as readonly string[]).includes(head))return new FactsDbError(head as FactsDbErrorCode,message);
 if(e.code==='23505')return new FactsDbError('duplicate_key',message);
 return new FactsDbError('unknown',message||'unknown');
}

export interface ReadFactsEnvelope{state_rev:number|string;rows:Record<string,unknown>[];truncated:boolean;row_count:number}
export function rowFromEnvelope(r:Record<string,unknown>):FactRow{
 const seq=r.disclosure_seq;
 return {...(r as unknown as FactRow),value:String(r.value_text),disclosure_seq:seq===null||seq===undefined?undefined:Number(seq),is_current:r.is_current===true,is_revision:r.is_revision===true};
}
export function resultFromEnvelope(env:ReadFactsEnvelope):ReadFactsResult{
 return {stateRev:Number(env.state_rev),rows:(env.rows??[]).map(rowFromEnvelope),truncated:env.truncated===true};
}
/** A financial_facts table row (PostgREST or pg) → FactRow; value comes from value_text, never from the numeric. */
export function factRowFromTable(r:Record<string,unknown>):FactRow{return {...(r as unknown as FactRow),value:String(r.value_text)};}
export function scopeFromTable(r:Record<string,unknown>):ScopeRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,reasons:Array.isArray(r.reasons)?r.reasons as string[]:[],priority:Number(r.priority),fetch_key:String(r.fetch_key),
  next_due_at:String(r.next_due_at),lease_until:r.lease_until===null?null:String(r.lease_until),lease_batch_id:r.lease_batch_id===null?null:String(r.lease_batch_id),state_rev:Number(r.state_rev),
  last_attempt_at:r.last_attempt_at===null?null:String(r.last_attempt_at),last_success_at:r.last_success_at===null?null:String(r.last_success_at),last_batch_id:r.last_batch_id===null?null:String(r.last_batch_id),last_status:(r.last_status??null) as ScopeRow['last_status']};
}
export function metricFromTable(r:Record<string,unknown>):MetricRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,metric:String(r.metric),period_start:String(r.period_start),period_end:String(r.period_end),duration:r.duration as MetricRow['duration'],
  value:String(r.value_text),unit:String(r.unit),input_unit:String(r.input_unit),basis:String(r.basis),formula_version:String(r.formula_version),inputs:(Array.isArray(r.inputs)?r.inputs:[]) as MetricRow['inputs'],based_on_rev:Number(r.based_on_rev),as_of:String(r.as_of)};
}
/** MetricRow → replace_financial_metrics row (issuer/market come from the call). */
export function metricArgs(m:MetricRow){return {metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,value:m.value,unit:m.unit,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version,inputs:m.inputs,as_of:m.as_of};}
/** FilingInsert → stage_filings row (issuer/market come from the run). */
export function filingArgs(rows:FilingInsert[]){return rows.map(r=>({filing_id:r.filing_id,source:r.source,origin:r.origin,form_type:r.formType,fiscal_year:r.fiscalYear,fiscal_period:r.fiscalPeriod,period_end:r.periodEnd,available_date:r.availableDate,source_ref:r.sourceRef,url:r.url}));}
export function readArgs(issuer:string,market:Market,o:ReadFactsOptions){return {p_issuer:issuer,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
/** Only the three link columns service_role may update (§4.7); undefined keys are dropped. */
export function linkPatch(p:{document_ref?:string|null;document_url?:string|null;link_attempts:number}):Record<string,unknown>{
 if(!Number.isInteger(p.link_attempts)||p.link_attempts<0)throw new FactsDbError('unknown','invalid_link_attempts');
 const out:Record<string,unknown>={link_attempts:p.link_attempts};
 if(p.document_ref!==undefined)out.document_ref=p.document_ref;
 if(p.document_url!==undefined)out.document_url=p.document_url;
 return out;
}
/** dq_quarantine row → ConflictItem: fact_ids from payload, available_date from payload.key or the natural key's last segment. */
export function conflictFromItem(r:{id:string;natural_key:string;payload:Record<string,unknown>}):ConflictItem{
 const p=r.payload??{};
 const key=(p.key&&typeof p.key==='object'&&!Array.isArray(p.key)?p.key:{}) as Record<string,string|null>;
 const ids=Array.isArray(p.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];
 return {id:r.id,natural_key:r.natural_key,fact_ids:ids,available_date:key.available_date??r.natural_key.slice(r.natural_key.lastIndexOf(':')+1),key};
}
/** natural_key prefix of every facts quarantine item of an issuer+market (§7.1). */
export const conflictPrefix=(issuer:string,market:Market)=>`${issuer}:${market}:`;
/** Splits rows into STAGE_CHUNK-sized calls; an empty input still yields one empty call so the run/lease check runs. */
export function chunk<T>(rows:T[],size=STAGE_CHUNK):T[][]{
 if(rows.length===0)return [[]];
 const out:T[][]=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out;
}
/** Plain id chunking for `.in()` filters (an empty input yields no chunk). */
export function chunkIds(ids:string[],size=IN_CHUNK):string[][]{
 const out:string[][]=[];for(let i=0;i<ids.length;i+=size)out.push(ids.slice(i,i+size));return out;
}

interface RpcResult{data:unknown;error:PgErrorLike|null}
// The query builder is left untyped on purpose (same as table-client.ts): the hand-maintained
// Database type lacks the Relationships/Views that supabase-js inference now needs.
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}
type Query=PromiseLike<RpcResult>&{range:(from:number,to:number)=>Query};

export function supabaseFactsDb(client:SupabaseClient):FactsDb{
 const c=client as unknown as NarrowClient;
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toFactsDbError(error);return data as T;};
 const rows=async<T>(q:PromiseLike<RpcResult>):Promise<T[]>=>{const {data,error}=await q;if(error)throw toFactsDbError(error);return (data??[]) as T[];};
 /** `make` builds the filtered AND ordered query afresh per page (builders are single-use); pages until a short page or `limit` rows. */
 const pageAll=async<T>(make:()=>Query,limit?:number):Promise<T[]>=>{
  const out:T[]=[];
  for(let from=0;;from+=READ_PAGE){
   const size=limit===undefined?READ_PAGE:Math.min(READ_PAGE,limit-out.length);
   if(size<=0)return out;
   const part=await rows<T>(make().range(from,from+size-1));
   out.push(...part);
   if(part.length<size)return out;
  }
 };
 return {
  claimLease:(issuer,market,batch,ttl)=>call<boolean>('claim_fact_sync_lease',{p_issuer:issuer,p_market:market,p_batch:batch,p_ttl_seconds:ttl}),
  beginRun:(issuer,market,batch,gen)=>call<string>('begin_sync_run',{p_issuer:issuer,p_market:market,p_batch:batch,p_mapping_gen:gen}),
  async stageFilings(run,input){
   const out=new Map<string,string>();
   for(const part of chunk(input)){const m=await call<Record<string,string>|null>('stage_filings',{p_run:run,p_rows:filingArgs(part)});for(const [k,v] of Object.entries(m??{}))out.set(k,v);}
   return out;
  },
  async stageFacts(run,input){let n=0;for(const part of chunk(input))n+=Number(await call<number>('stage_facts',{p_run:run,p_rows:part}));return n;},
  quarantineFacts:(run,ids,item)=>call<number>('quarantine_facts',{p_run:run,p_fact_ids:ids,p_item:item}),
  publishRun:(run,manifest)=>call<number>('publish_sync_run',{p_run:run,p_manifest:manifest}),
  async abandonRun(run){await call('abandon_sync_run',{p_run:run});},
  async releaseLease(issuer,market,batch,outcome,nextDue){await call('release_fact_sync_lease',{p_issuer:issuer,p_market:market,p_batch:batch,p_outcome:outcome,p_next_due:nextDue});},
  resolveFactsQuarantine:(item,chosen,by)=>call<{promoted:number;skipped:number}>('resolve_facts_quarantine',{p_item:item,p_chosen:chosen,p_resolved_by:by}),
  replaceMetrics:(issuer,market,rev,input)=>call<number>('replace_financial_metrics',{p_issuer:issuer,p_market:market,p_based_on_rev:rev,p_rows:input.map(metricArgs)}),
  async readFacts(issuer,market,opts){return resultFromEnvelope(await call<ReadFactsEnvelope>('read_facts',readArgs(issuer,market,opts)));},
  async factsByIds(ids){
   const out:FactRow[]=[];
   for(const part of chunkIds(ids))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('financial_facts').select('*').in('fact_id',part).order('fact_id'))).map(factRowFromTable));
   return out;
  },
  async openConflicts(issuer,market){
   return (await pageAll<{id:string;natural_key:string;payload:Record<string,unknown>}>(()=>c.from('dq_quarantine').select('id,natural_key,payload').eq('table_name','financial_facts').eq('reason_code','same_day_conflict').eq('status','open').like('natural_key',`${conflictPrefix(issuer,market)}%`).order('created_at').order('id'))).map(conflictFromItem);
  },
  async filingsOfIssuer(issuer,market,opts){
   return pageAll<FilingRow>(()=>{
    let q=c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market);
    if(opts.from!==undefined)q=q.gte('available_date',opts.from);
    if(opts.to!==undefined)q=q.lte('available_date',opts.to);
    if(opts.unlinkedOnly)q=q.is('document_ref',null);
    return q.order('available_date',{ascending:false}).order('filing_id');
   },opts.limit);
  },
  async updateFilingLink(filingId,patch){const {error}=await c.from('filings').update(linkPatch(patch)).eq('filing_id',filingId);if(error)throw toFactsDbError(error);},
  reconcileScope:(market,input)=>call<number>('reconcile_fact_sync_scope',{p_market:market,p_rows:input}),
  async scopeDue(market,now,limit){
   if(limit<1)return [];
   return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).gt('priority',0).lte('next_due_at',now).order('next_due_at').order('priority',{ascending:false}).order('issuer_id'),limit)).map(scopeFromTable);
  },
  async scopeRows(market,issuerIds){
   const out:ScopeRow[]=[];
   for(const part of chunkIds(issuerIds))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).in('issuer_id',part).order('issuer_id'))).map(scopeFromTable));
   return out;
  },
  async metricsOfIssuer(issuer,market,formulaVersion){
   return (await pageAll<Record<string,unknown>>(()=>c.from('financial_metrics').select('*').eq('issuer_id',issuer).eq('market',market).eq('formula_version',formulaVersion).order('metric').order('period_end').order('period_start').order('input_unit').order('basis'))).map(metricFromTable);
  },
 };
}
```

- [ ] **Step 5: 实现内存 `FactsDb`**

```ts
// src/lib/facts/memory-facts-db.ts
// In-memory FactsDb for unit tests (spec §4.8, §11.1). It reproduces the SQL functions' rules so
// sync/plan/derive unit tests see the same behaviour as the database: scope rows and leases
// (claim / renew / expiry against an injectable clock), run lifecycle (begin abandons staged runs:
// mark → delete facts → prune empty gen-0 filings), the append-only status transitions, publish
// (staged→ok, conflict disposition derived from OPEN same_day_conflict items, mapping_gen
// activation with regression check, state_rev + 1), quarantine membership merge, resolve/promote
// eligibility, stale metric rejection, and the read_facts envelope (generation filter per filing,
// disclosure_seq / is_current / is_revision over ok rows, key ranking and limit, 10,000-row cap).
// dq_quarantine items live in the TableClient passed in (default: a fresh memoryTableClient) so
// plan-1 quarantine() and this db see the same rows in one test. Validation of a stageFacts batch
// happens before any row is written (one SQL statement). value_text = value as given (PostgreSQL
// would normalise e.g. 1e5; callers pass canonical decimals, §6.2).
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {Row,TableClient} from '../db/table-client';
import {READ_FACTS_CAP,conflictFromItem,conflictPrefix,linkPatch} from './db';
import {FactsDbError} from './types';
import type {FactRow,FactsDb,FilingRow,Market,MetricRow,RunStatus,ScopeRow} from './types';

export interface MemoryRun{run_id:string;issuer_id:string;market:Market;batch_id:string;mapping_gen:number;status:RunStatus;manifest:string[];started_at:string;published_at:string|null}
export interface MemoryFactsDb extends FactsDb{
 tables:TableClient;
 /** Fixes "now" for leases and timestamps; null returns to the wall clock. */
 setNow(iso:string|null):void;
 expireLease(issuer:string,market:Market):void;
 runs():MemoryRun[];filings():FilingRow[];facts():FactRow[];metrics():MetricRow[];scope():ScopeRow[];
}

const canon=(s:string)=>{
 let t=s.trim();let neg=false;
 if(t.startsWith('-')){neg=true;t=t.slice(1);}else if(t.startsWith('+'))t=t.slice(1);
 const [i0,f0='']=t.split('.');
 const i=i0.replace(/^0+(?=\d)/,'')||'0';const f=f0.replace(/0+$/,'');
 const out=f?`${i}.${f}`:i;
 return out==='0'?'0':(neg?'-':'')+out;
};
/** numeric equality on decimal strings without exponent: sign of zero, leading and trailing zeros ignored. */
export function numericEquals(a:string,b:string):boolean{return canon(a)===canon(b);}

const sk=(issuer:string,market:Market)=>`${issuer}|${market}`;
type KeyPart=Pick<FactRow,'concept'|'period_start'|'period_end'|'consolidation'|'unit'>;
const keyOf=(f:KeyPart)=>[f.concept,f.period_start??'',f.period_end,f.consolidation,f.unit].join('|');
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clone=<T>(v:T):T=>structuredClone(v);
const unknown=(message:string)=>new FactsDbError('unknown',message);

export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id']})):MemoryFactsDb{
 const scope=new Map<string,ScopeRow>();
 const runs=new Map<string,MemoryRun>();
 const filings=new Map<string,FilingRow>();
 const facts=new Map<string,FactRow>();
 const ord=new Map<string,number>();let seq=0;
 let metrics:MetricRow[]=[];
 let fixedNow:string|null=null;
 const now=()=>fixedNow??new Date().toISOString();
 const scopeOf=(issuer:string,market:Market)=>scope.get(sk(issuer,market));
 const bump=(issuer:string,market:Market)=>{const s=scopeOf(issuer,market);if(s)s.state_rev+=1;};
 const leaseCheck=(issuer:string,market:Market,batch:string)=>{
  const s=scopeOf(issuer,market);
  if(!s||s.lease_batch_id!==batch||s.lease_until===null||s.lease_until<=now())throw new FactsDbError('lease_lost');
  return s;
 };
 const runLock=(runId:string)=>{
  const r=runs.get(runId);if(!r)throw unknown('run_not_found');
  leaseCheck(r.issuer_id,r.market,r.batch_id);
  if(r.status==='published')throw new FactsDbError('run_published');
  if(r.status==='abandoned')throw unknown('run_abandoned');
  return r;
 };
 const abandon=(r:MemoryRun,prune:boolean)=>{
  r.status='abandoned';
  for(const [id,f] of facts)if(f.run_id===r.run_id)facts.delete(id);
  if(prune)for(const [id,g] of filings)if(g.run_id===r.run_id&&g.mapping_gen===0&&![...facts.values()].some(f=>f.filing_id===id))filings.delete(id);
 };
 const items=(match:Row)=>tables.select('dq_quarantine',{table_name:'financial_facts',...match});
 const idsOf=(row:Row)=>{const p=row.payload as {fact_ids?:unknown}|undefined;return Array.isArray(p?.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const chosenOf=(row:Row)=>{const d=row.detail as {chosen_fact_ids?:unknown}|undefined;return Array.isArray(d?.chosen_fact_ids)?d.chosen_fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const runIdOf=(row:Row)=>{const p=row.payload as {run_id?:unknown}|undefined;return typeof p?.run_id==='string'?p.run_id:null;};
 /** Does this same_day_conflict item dispute the row's (K, available_date)? Matched on payload.key like the SQL (round-1 #3). */
 const disputes=(item:Row,f:FactRow)=>{
  const k=(item.payload as {key?:Record<string,string|null>}|undefined)?.key;
  return !!k&&k.issuer_id===f.issuer_id&&k.market===f.market&&k.concept===f.concept&&(k.period_start??'')===(f.period_start??'')&&k.period_end===f.period_end&&k.consolidation===f.consolidation&&k.unit===f.unit&&k.available_date===f.available_date;
 };
 // promote_quarantined eligibility (§4.5): quarantined, run published, filing on the row's
 // generation, not referenced by any OPEN item, its (K, date) not disputed by any OPEN
 // same_day_conflict item, and chosen by every RESOLVED conflict that lists it.
 const promote=async(issuer:string,market:Market,ids:string[])=>{
  const open=await items({status:'open'});
  const resolvedConflicts=(await items({reason_code:'same_day_conflict'})).filter(i=>i.status!=='open');
  let n=0;
  for(const id of new Set(ids)){
   const f=facts.get(id);
   if(!f||f.issuer_id!==issuer||f.market!==market||f.status!=='quarantined')continue;
   if(runs.get(f.run_id)?.status!=='published')continue;
   if(filings.get(f.filing_id)?.mapping_gen!==f.mapping_gen)continue;
   if(open.some(i=>idsOf(i).includes(id)))continue;
   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
   if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
   f.status='ok';n++;
  }
  return n;
 };
 const byDisclosure=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||((ord.get(a.fact_id)??0)-(ord.get(b.fact_id)??0))||cmp(a.fact_id,b.fact_id);
 // key ranking of read_facts: period_end desc, concept, period_start desc nulls last, consolidation, unit
 const keyOrder=(a:KeyPart,b:KeyPart)=>cmp(b.period_end,a.period_end)||cmp(a.concept,b.concept)
  ||(a.period_start===b.period_start?0:a.period_start===null?1:b.period_start===null?-1:cmp(b.period_start,a.period_start))
  ||cmp(a.consolidation,b.consolidation)||cmp(a.unit,b.unit);

 const db:MemoryFactsDb={
  tables,
  setNow:iso=>{fixedNow=iso;},
  expireLease:(issuer,market)=>{const s=scopeOf(issuer,market);if(s&&s.lease_until!==null)s.lease_until='1970-01-01T00:00:00.000Z';},
  runs:()=>clone([...runs.values()]),filings:()=>clone([...filings.values()]),facts:()=>clone([...facts.values()]),metrics:()=>clone(metrics),scope:()=>clone([...scope.values()]),

  async claimLease(issuer,market,batch,ttl){
   if(!Number.isInteger(ttl)||ttl<1)throw unknown('invalid_ttl');
   const s=scopeOf(issuer,market);if(!s)return false;
   if(s.lease_batch_id===null||(s.lease_until!==null&&s.lease_until<=now())||s.lease_batch_id===batch){
    s.lease_batch_id=batch;s.lease_until=new Date(Date.parse(now())+ttl*1000).toISOString();return true;
   }
   return false;
  },
  async beginRun(issuer,market,batch,mappingGen){
   if(!Number.isInteger(mappingGen)||mappingGen<1)throw unknown('invalid_mapping_gen');
   leaseCheck(issuer,market,batch);
   for(const r of runs.values())if(r.issuer_id===issuer&&r.market===market&&r.status==='staged')abandon(r,true);
   const run_id=randomUUID();
   runs.set(run_id,{run_id,issuer_id:issuer,market,batch_id:batch,mapping_gen:mappingGen,status:'staged',manifest:[],started_at:now(),published_at:null});
   return run_id;
  },
  async stageFilings(run,input){
   const r=runLock(run);const out=new Map<string,string>();
   for(const row of input){
    const existing=[...filings.values()].find(g=>g.source===row.source&&g.source_ref===row.sourceRef);
    if(existing){if(existing.issuer_id===r.issuer_id&&existing.market===r.market)out.set(row.sourceRef,existing.filing_id);continue;}
    filings.set(row.filing_id,{filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now()});
    out.set(row.sourceRef,row.filing_id);
   }
   return out;
  },
  async stageFacts(run,input){
   const r=runLock(run);
   const existingKeys=new Set([...facts.values()].filter(f=>f.issuer_id===r.issuer_id).map(f=>`${keyOf(f)}|${f.filing_id}|${f.mapping_gen}`));
   const fresh:FactRow[]=[];
   for(const row of input){
    const g=filings.get(row.filing_id);
    if(!g||g.issuer_id!==r.issuer_id||g.market!==r.market)throw unknown('financial_facts_filing_fkey');
    if(g.available_date!==row.available_date)throw unknown('financial_facts_filing_date_fkey');
    if((row.period_start===null)!==(row.duration==='INSTANT'))throw unknown('financial_facts_instant');
    if(row.period_start!==null&&!(row.period_start<row.period_end))throw unknown('financial_facts_period');
    const candidate=`${keyOf(row)}|${row.filing_id}|${r.mapping_gen}`;
    if(existingKeys.has(candidate))continue;
    if(facts.has(row.fact_id)||fresh.some(f=>f.fact_id===row.fact_id))throw new FactsDbError('duplicate_key','financial_facts_pkey');
    existingKeys.add(candidate);
    fresh.push({fact_id:row.fact_id,issuer_id:r.issuer_id,market:r.market,filing_id:row.filing_id,run_id:run,concept:row.concept,source_concept:row.source_concept,statement:row.statement,period_start:row.period_start,period_end:row.period_end,duration:row.duration,value:row.value,value_text:row.value,unit:row.unit,consolidation:row.consolidation,available_date:row.available_date,mapping_gen:r.mapping_gen,mapping_version:row.mapping_version,status:'staged',raw_hash:row.raw_hash,created_at:now()});
   }
   for(const f of fresh){facts.set(f.fact_id,f);ord.set(f.fact_id,++seq);}
   return fresh.length;
  },
  async quarantineFacts(run,factIds,itemId){
   runLock(run);
   const [it]=await tables.select('dq_quarantine',{id:itemId,status:'open'},{limit:1});
   if(!it)throw unknown('item_not_open');
   let n=0;
   for(const id of new Set(factIds)){const f=facts.get(id);if(f&&f.run_id===run&&f.status==='staged'){f.status='quarantined';n++;}}
   const merged=[...idsOf(it)];for(const id of factIds)if(!merged.includes(id))merged.push(id);
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{payload:{...(it.payload as Record<string,unknown>),fact_ids:merged}});
   return n;
  },
  async publishRun(run,manifest){
   const r=runLock(run);
   const mine=manifest.filter(id=>{const g=filings.get(id);return !!g&&g.issuer_id===r.issuer_id&&g.market===r.market;});
   if(mine.some(id=>filings.get(id)!.mapping_gen>r.mapping_gen))throw new FactsDbError('mapping_gen_regression');
   let n=0;
   for(const f of facts.values())if(f.run_id===run&&f.status==='staged'){f.status='ok';n++;}
   const runIds=new Set([...facts.values()].filter(f=>f.run_id===run).map(f=>f.fact_id));
   for(const it of await items({status:'open',reason_code:'same_day_conflict'})){
    const ids=idsOf(it);if(!ids.some(id=>runIds.has(id)))continue;
    for(const id of ids){const f=facts.get(id);if(f&&f.status==='ok'&&f.issuer_id===r.issuer_id&&f.market===r.market)f.status='quarantined';}
   }
   for(const id of mine){const g=filings.get(id)!;if(g.mapping_gen<r.mapping_gen)g.mapping_gen=r.mapping_gen;}
   r.status='published';r.published_at=now();r.manifest=[...manifest];
   bump(r.issuer_id,r.market);
   return n;
  },
  async abandonRun(run){
   const r=runs.get(run);if(!r)throw unknown('run_not_found');
   leaseCheck(r.issuer_id,r.market,r.batch_id);
   if(r.status==='published')throw new FactsDbError('run_published');
   if(r.status==='abandoned')return;
   abandon(r,false);
  },
  async releaseLease(issuer,market,batch,outcome,nextDue){
   if(outcome!=='success'&&outcome!=='failed')throw unknown('invalid_outcome');
   const s=scopeOf(issuer,market);
   if(!s||s.lease_batch_id!==batch)throw new FactsDbError('lease_lost');
   const t=now();
   Object.assign(s,{lease_until:null,lease_batch_id:null,last_attempt_at:t,last_success_at:outcome==='success'?t:s.last_success_at,last_batch_id:batch,last_status:outcome,next_due_at:nextDue});
  },
  async resolveFactsQuarantine(itemId,chosen,resolvedBy){
   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
   if(!it||it.status!=='open')throw unknown('item_not_open');
   const ids=idsOf(it);
   const existing=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
   const runId=runIdOf(it);
   const anchor=existing[0]??(runId!==null?runs.get(runId):undefined);
   // run_pending: any member row's run still staged, or the anchor run itself (the only run an
   // item without fact rows has; spec §7.3, round-1 #10). Single-threaded, so no re-read is needed.
   if(existing.some(f=>runs.get(f.run_id)?.status==='staged'))throw new FactsDbError('run_pending');
   if(runId!==null&&runs.get(runId)?.status==='staged')throw new FactsDbError('run_pending');
   let picked:string[];
   if(it.reason_code==='same_day_conflict'){picked=[...chosen];if(picked.some(id=>!ids.includes(id)))throw unknown('invalid_chosen');}
   else picked=ids;
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:now(),detail:{...((it.detail as Record<string,unknown>|undefined)??{}),chosen_fact_ids:picked}});
   let promoted=0;
   if(anchor){promoted=await promote(anchor.issuer_id,anchor.market,picked);bump(anchor.issuer_id,anchor.market);}
   return {promoted,skipped:picked.length-promoted};
  },
  async replaceMetrics(issuer,market,basedOnRev,input){
   const rev=scopeOf(issuer,market)?.state_rev??0;
   if(rev!==basedOnRev)throw new FactsDbError('stale_computation');
   metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:basedOnRev})));
   return input.length;
  },
  async readFacts(issuer,market,o){
   const stateRev=scopeOf(issuer,market)?.state_rev??0;
   const base=[...facts.values()].filter(f=>f.issuer_id===issuer&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
    &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&filings.get(f.filing_id)?.mapping_gen===f.mapping_gen);
   const groups=new Map<string,FactRow[]>();
   for(const f of base)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
   const out:FactRow[]=[];
   for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
   for(const f of base)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
   const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
   const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
   const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
   picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
   if(picked.length>READ_FACTS_CAP)return {stateRev,rows:[],truncated:true};
   return {stateRev,rows:picked,truncated:false};
  },
  async factsByIds(ids){return ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).map(f=>clone(f));},
  async openConflicts(issuer,market){
   const prefix=conflictPrefix(issuer,market);
   const rows=(await items({status:'open',reason_code:'same_day_conflict'})).filter(i=>String(i.natural_key).startsWith(prefix));
   rows.sort((a,b)=>cmp(String(a.created_at),String(b.created_at))||cmp(String(a.id),String(b.id)));
   return rows.map(i=>conflictFromItem({id:String(i.id),natural_key:String(i.natural_key),payload:(i.payload as Record<string,unknown>|undefined)??{}}));
  },
  async filingsOfIssuer(issuer,market,opts){
   const rows=[...filings.values()].filter(g=>g.issuer_id===issuer&&g.market===market&&(opts.from===undefined||g.available_date>=opts.from)&&(opts.to===undefined||g.available_date<=opts.to)&&(!opts.unlinkedOnly||g.document_ref===null));
   rows.sort((a,b)=>cmp(b.available_date,a.available_date)||cmp(a.filing_id,b.filing_id));
   return clone(opts.limit===undefined?rows:rows.slice(0,opts.limit));   // no implicit cap: complete-set read (round-1 #7)
  },
  async updateFilingLink(filingId,patch){
   const p=linkPatch(patch);const g=filings.get(filingId);if(!g)return;
   Object.assign(g,p);
  },
  async reconcileScope(market,input){
   let n=0;
   for(const row of input){
    const k=sk(row.issuer_id,market);const s=scope.get(k);
    if(!s){scope.set(k,{issuer_id:row.issuer_id,market,reasons:[...row.reasons],priority:row.priority,fetch_key:row.fetch_key,next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});n++;continue;}
    if(JSON.stringify(s.reasons)!==JSON.stringify(row.reasons)||s.priority!==row.priority||s.fetch_key!==row.fetch_key){s.reasons=[...row.reasons];s.priority=row.priority;s.fetch_key=row.fetch_key;n++;}
   }
   return n;
  },
  async scopeDue(market,at,limit){
   if(limit<1)return [];
   const rows=[...scope.values()].filter(s=>s.market===market&&s.priority>0&&s.next_due_at<=at);
   rows.sort((a,b)=>cmp(a.next_due_at,b.next_due_at)||(b.priority-a.priority)||cmp(a.issuer_id,b.issuer_id));
   return clone(rows.slice(0,limit));
  },
  async scopeRows(market,issuerIds){
   const want=new Set(issuerIds);
   return clone([...scope.values()].filter(s=>s.market===market&&want.has(s.issuer_id)).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
  },
  async metricsOfIssuer(issuer,market,formulaVersion){
   const rows=metrics.filter(m=>m.issuer_id===issuer&&m.market===market&&m.formula_version===formulaVersion);
   rows.sort((a,b)=>cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)||cmp(a.input_unit,b.input_unit)||cmp(a.basis,b.basis));
   return clone(rows);
  },
 };
 return db;
}
```

- [ ] **Step 6: 运行通过**

Run: `npm test -- src/lib/facts/db.test.ts`
Expected: `memoryFactsDb contract` 9 个用例、`memoryFactsDb specifics` 3 个、`numericEquals` 1 个、`toFactsDbError` 1 个、`supabaseFactsDb` 4 个全部通过（18 passed）。
Run: `npm run lint`
Expected: 无警告——`db.ts` 里不得有 `eslint-disable` 指令（仓库 ESLint 没有启用 `no-explicit-any`，未用到的 disable 指令本身就是警告，`--max-warnings=0` 会失败；审计 round-1 #6）。
Run: `npm run typecheck && npm run lint`
Expected: 退出码 0。

- [ ] **Step 7: 提交**

```bash
git add src/lib/facts/types.ts src/lib/facts/db.ts src/lib/facts/memory-facts-db.ts src/lib/facts/db-contract.ts src/lib/facts/db.test.ts
git commit -m "feat(facts): FactsDb contract with Supabase rpc and in-memory implementations" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: pg 实现 + 真实库契约与并发测试

**Files:**
- Create: `src/lib/facts/pg-facts-db.ts`
- Modify: `src/lib/db/pg-table-client.ts:66`（导出 `typeParsers`）
- Modify: `src/lib/facts/facts.integration.test.ts`（追加 pg 契约与并发 describe）

- [ ] **Step 1: 在集成测试末尾追加 pg 契约与并发用例（先失败）**

文件头 import 区追加：

```ts
import {pgTableClient} from '../db/pg-table-client';
import {quarantine} from '../dq/quarantine';
import {factInsert,factsDbContract,filingInsert} from './db-contract';
import type {ContractHarness} from './db-contract';
import {pgFactsDb} from './pg-facts-db';
```

文件末尾（第一个 `describe` 之后）追加：

```ts
interface PgHarness extends ContractHarness{pool:Pool;close():Promise<void>}
async function pgHarness():Promise<PgHarness>{
 const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
 const pool=new Pool({connectionString:state.adminUrl});
 return {
  pool,db:pgFactsDb(pool),tables:pgTableClient(pool),
  issuer:async()=>{const id=randomUUID();await pool.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Contract')`,[id]);return id;},
  batch:async()=>{const id=randomUUID();await pool.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[id]);return id;},
  expireLease:async(issuer,market)=>{await pool.query(`update public.fact_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1 and market=$2`,[issuer,market]);},
  close:async()=>{await pool.end();},
 };
}

describe.skipIf(!enabled)('pgFactsDb on real PostgreSQL',()=>{
 // The same scenarios memoryFactsDb passes in db.test.ts, now against the SQL functions.
 factsDbContract('pgFactsDb contract',pgHarness);

 describe('concurrency',()=>{
  let h:PgHarness;
  beforeAll(async()=>{h=await pgHarness();});
  afterAll(async()=>{await h?.close();});
  const ready=async()=>{const iss=await h.issuer();const b=await h.batch();await h.db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);expect(await h.db.claimLease(iss,'US',b,600)).toBe(true);return {iss,b};};

  it('claimLease: eight batches race for one issuer and exactly one wins; the winner renews, the rest stay refused',async()=>{
   const iss=await h.issuer();await h.db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);
   const batches=await Promise.all(Array.from({length:8},()=>h.batch()));
   const won=await Promise.all(batches.map(b=>h.db.claimLease(iss,'US',b,600)));
   expect(won.filter(Boolean)).toHaveLength(1);
   const winner=batches[won.indexOf(true)];
   const again=await Promise.all(batches.map(b=>h.db.claimLease(iss,'US',b,600)));
   expect(again).toEqual(batches.map(b=>b===winner));
  });

  it('a stale worker: the new holder abandons its staged run, every later write is lease_lost, published and quarantined rows survive',async()=>{
   const {db}=h;const {iss,b:b1}=await ready();const b2=await h.batch();
   const run1=await db.beginRun(iss,'US',b1,1);const f1=filingInsert(iss);await db.stageFilings(run1,[f1]);
   const ok=factInsert(iss,f1);const qd=factInsert(iss,f1,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run1,[ok,qd])).toBe(2);
   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:BS:${randomUUID()}`,reasonCode:'identity_bs',batchId:b1,payload:{key:{},fact_ids:[qd.fact_id],run_id:run1}});
   expect(await db.quarantineFacts(run1,[qd.fact_id],item)).toBe(1);
   expect(await db.publishRun(run1,[f1.filing_id])).toBe(1);
   const run2=await db.beginRun(iss,'US',b1,1);const f2=filingInsert(iss);await db.stageFilings(run2,[f2]);
   const x=factInsert(iss,f2,{value:'7'});expect(await db.stageFacts(run2,[x])).toBe(1);
   await h.expireLease(iss,'US');
   expect(await db.claimLease(iss,'US',b2,600)).toBe(true);
   const run3=await db.beginRun(iss,'US',b2,1);                               // abandons run2 under b1
   expect(await db.factsByIds([x.fact_id])).toEqual([]);
   expect((await db.filingsOfIssuer(iss,'US',{})).map(g=>g.filing_id)).toEqual([f1.filing_id]);
   const stale:Array<()=>Promise<unknown>>=[
    ()=>db.stageFacts(run2,[]),()=>db.publishRun(run2,[]),()=>db.abandonRun(run2),
    ()=>db.beginRun(iss,'US',b1,1),()=>db.releaseLease(iss,'US',b1,'failed','2030-01-01T00:00:00.000Z'),
   ];
   for(const call of stale)await expect(call()).rejects.toMatchObject({name:'FactsDbError',code:'lease_lost'});
   expect((await db.factsByIds([ok.fact_id,qd.fact_id])).map(y=>y.status).sort()).toEqual(['ok','quarantined']);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01'})).rows.map(y=>y.fact_id)).toEqual([ok.fact_id]);
   expect(await db.publishRun(run3,[])).toBe(0);
   await db.releaseLease(iss,'US',b2,'success','2030-01-01T00:00:00.000Z');
  });

  it('a reader sees nothing of an in-flight publish and the whole run after commit; beginRun waits behind it',async()=>{
   const {db}=h;const {iss,b}=await ready();
   const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
   const a=factInsert(iss,f);const t=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run,[a,t])).toBe(2);
   const c1=await h.pool.connect();
   try{
    await c1.query('begin');
    await c1.query(`select public.publish_sync_run($1,$2::uuid[])`,[run,[f.filing_id]]);
    const during=await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true,includeNonOk:true});
    expect(during).toEqual({stateRev:0,rows:[],truncated:false});                        // not blocked, nothing visible
    let settled=false;
    const next=db.beginRun(iss,'US',b,1).then(id=>{settled=true;return id;});
    await new Promise(res=>setTimeout(res,300));expect(settled).toBe(false);              // waits for the scope lock
    await c1.query('commit');
    const run2=await next;expect(run2).not.toBe(run);
   }finally{await c1.query('rollback').catch(()=>{});c1.release();}
   const after=await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true});
   expect(after.stateRev).toBe(1);expect(after.rows.map(y=>y.fact_id).sort()).toEqual([a.fact_id,t.fact_id].sort());
   expect((await db.factsByIds([a.fact_id])).map(y=>y.status)).toEqual(['ok']);         // run stayed published; beginRun abandoned nothing of it
  });
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: `facts.integration.test.ts` 整个文件无法加载：`Cannot find module './pg-facts-db'`（Task 1 的 16 个用例随之不跑；本步只确认缺口）。

- [ ] **Step 3: 导出 `typeParsers`**

`src/lib/db/pg-table-client.ts` 第 66 行：

```ts
export const typeParsers={getTypeParser:(oid:number,format?:string)=>RAW_TEXT.has(oid)?(v:string)=>v:getTypeParser(oid,format)} as unknown as QueryConfig['types'];
```

（仅加 `export`；其余不动。）

- [ ] **Step 4: 实现 pg `FactsDb`**

```ts
// src/lib/facts/pg-facts-db.ts
// TEST-ONLY FactsDb over node-postgres that calls the same SQL functions supabaseFactsDb calls
// through rpc, so the contract tests and the offline sync integration tests exercise the real
// schema (locks, leases, triggers, generations). Nothing in src/app imports this. Shares ident and
// typeParsers with pg-table-client.ts: date/timestamptz come back as text, jsonb is parsed, numeric
// and bigint arrive as strings (value comes from value_text; state_rev/based_on_rev are Number()ed
// by the db.ts normalisers). Errors are mapped with toFactsDbError exactly like PostgREST errors.
import type {Pool} from 'pg';
import {ident,typeParsers} from '../db/pg-table-client';
import {chunk,conflictFromItem,conflictPrefix,factRowFromTable,filingArgs,linkPatch,metricArgs,metricFromTable,readArgs,resultFromEnvelope,scopeFromTable,toFactsDbError} from './db';
import type {PgErrorLike,ReadFactsEnvelope} from './db';
import type {FactsDb,FilingRow} from './types';

export function pgFactsDb(pool:Pool):FactsDb{
 const run=async(text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){throw toFactsDbError(e as PgErrorLike);}
 };
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await run(`select ${call} as v`,values)).rows[0].v as T;
 const rel=(table:string)=>`${ident('public')}.${ident(table)}`;
 return {
  claimLease:(issuer,market,batch,ttl)=>fn<boolean>('public.claim_fact_sync_lease($1,$2,$3,$4)',[issuer,market,batch,ttl]),
  beginRun:(issuer,market,batch,gen)=>fn<string>('public.begin_sync_run($1,$2,$3,$4)',[issuer,market,batch,gen]),
  async stageFilings(runId,input){
   const out=new Map<string,string>();
   for(const part of chunk(input)){const m=await fn<Record<string,string>|null>('public.stage_filings($1,$2::jsonb)',[runId,JSON.stringify(filingArgs(part))]);for(const [k,v] of Object.entries(m??{}))out.set(k,v);}
   return out;
  },
  async stageFacts(runId,input){let n=0;for(const part of chunk(input))n+=Number(await fn<number>('public.stage_facts($1,$2::jsonb)',[runId,JSON.stringify(part)]));return n;},
  quarantineFacts:(runId,ids,item)=>fn<number>('public.quarantine_facts($1,$2::uuid[],$3)',[runId,ids,item]),
  publishRun:(runId,manifest)=>fn<number>('public.publish_sync_run($1,$2::uuid[])',[runId,manifest]),
  async abandonRun(runId){await fn('public.abandon_sync_run($1)',[runId]);},
  async releaseLease(issuer,market,batch,outcome,nextDue){await fn('public.release_fact_sync_lease($1,$2,$3,$4,$5::timestamptz)',[issuer,market,batch,outcome,nextDue]);},
  resolveFactsQuarantine:(item,chosen,by)=>fn<{promoted:number;skipped:number}>('public.resolve_facts_quarantine($1,$2::uuid[],$3)',[item,chosen,by]),
  replaceMetrics:(issuer,market,rev,input)=>fn<number>('public.replace_financial_metrics($1,$2,$3,$4::jsonb)',[issuer,market,rev,JSON.stringify(input.map(metricArgs))]),
  async readFacts(issuer,market,opts){
   const a=readArgs(issuer,market,opts);
   return resultFromEnvelope(await fn<ReadFactsEnvelope>('public.read_facts($1,$2,$3::text[],$4::date,$5::date,$6::date,$7,$8,$9)',[a.p_issuer,a.p_market,a.p_concepts,a.p_as_of,a.p_from,a.p_to,a.p_history,a.p_limit,a.p_include_non_ok]));
  },
  async factsByIds(ids){
   if(ids.length===0)return [];
   return (await run(`select * from ${rel('financial_facts')} where fact_id = any($1::uuid[])`,[ids])).rows.map(factRowFromTable);
  },
  async openConflicts(issuer,market){
   return (await run(`select id, natural_key, payload from ${rel('dq_quarantine')} where table_name = 'financial_facts' and reason_code = 'same_day_conflict' and status = 'open' and natural_key like $1 order by created_at, id`,[`${conflictPrefix(issuer,market)}%`])).rows.map(conflictFromItem);
  },
  async filingsOfIssuer(issuer,market,opts){
   const values:unknown[]=[issuer,market];let where=`issuer_id = $1 and market = $2`;
   if(opts.from!==undefined){values.push(opts.from);where+=` and available_date >= $${values.length}::date`;}
   if(opts.to!==undefined){values.push(opts.to);where+=` and available_date <= $${values.length}::date`;}
   if(opts.unlinkedOnly)where+=` and document_ref is null`;
   let limit='';
   if(opts.limit!==undefined){values.push(opts.limit);limit=` limit $${values.length}`;}   // no implicit cap (round-1 #7)
   return (await run(`select * from ${rel('filings')} where ${where} order by available_date desc, filing_id${limit}`,values)).rows as FilingRow[];
  },
  async updateFilingLink(filingId,patch){
   const p=linkPatch(patch);const cols=Object.keys(p);
   await run(`update ${rel('filings')} set ${cols.map((c,i)=>`${ident(c)} = $${i+2}`).join(', ')} where filing_id = $1`,[filingId,...cols.map(c=>p[c])]);
  },
  reconcileScope:(market,input)=>fn<number>('public.reconcile_fact_sync_scope($1,$2::jsonb)',[market,JSON.stringify(input)]),
  async scopeDue(market,now,limit){
   if(limit<1)return [];
   return (await run(`select * from ${rel('fact_sync_scope')} where market = $1 and priority > 0 and next_due_at <= $2::timestamptz order by next_due_at, priority desc, issuer_id limit $3`,[market,now,limit])).rows.map(scopeFromTable);
  },
  async scopeRows(market,issuerIds){
   if(issuerIds.length===0)return [];
   return (await run(`select * from ${rel('fact_sync_scope')} where market = $1 and issuer_id = any($2::uuid[]) order by issuer_id`,[market,issuerIds])).rows.map(scopeFromTable);
  },
  async metricsOfIssuer(issuer,market,formulaVersion){
   return (await run(`select * from ${rel('financial_metrics')} where issuer_id = $1 and market = $2 and formula_version = $3 order by metric, period_end, period_start, input_unit, basis`,[issuer,market,formulaVersion])).rows.map(metricFromTable);
  },
 };
}
```

- [ ] **Step 5: 运行通过**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: `facts.integration.test.ts` 全部通过：迁移 describe 16 个 + `pgFactsDb contract` 9 个 + `concurrency` 3 个 = 28 passed；`reports/research-db-summary.json` criticalSuites 计数与 Task 1 相同（同一文件）。
Run: `npm test -- src/lib/facts`
Expected: `db.test.ts` 18 passed；`facts.integration.test.ts` skipped（无 `S4_TEST_STATE`）。
Run: `npm run typecheck && npm run lint`
Expected: 退出码 0。

- [ ] **Step 6: 提交**

```bash
git add src/lib/facts/pg-facts-db.ts src/lib/db/pg-table-client.ts src/lib/facts/facts.integration.test.ts
git commit -m "test(facts): pg FactsDb for integration tests, shared contract on real PostgreSQL, lease and publish concurrency" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Part A 自检

- 规格覆盖：§4.1–§4.5 五表与全部函数（含 `promote_quarantined` 与 `fact_state_rev`）、§4.6 信封与 10,000 上限、§4.7 权限/策略/桶/列级 update、§4.8 三实现、§5.4 锁与原子性（并发用例）、§11.2 清单逐项（租约互斥/过期/续租、并发 `lease_lost`、先标后删、废弃拒绝已发布、发布原子 + 争议组处置 + 登记—废弃—重试—发布、`mapping_gen_regression`、`state_rev`、`fact_state_rev` 对 anon 可用而 `fact_sync_scope` 不可读、`resolve` 的 `run_pending`、提升资格全部规则、R7-1 回归、并入与发布串行、`stale_computation` 交错、1,001/10,001 行、`reconcile` 不动租约与调度列、真实角色权限、`value_text` 20 位）。
- 引入的名字：见顶部"本部分新增导出"；`FactsDbErrorCode` 未扩展，骨架外的 SQL 异常消息映射为 `unknown`（Part B 的 `sync.ts` 对 `unknown` 按"该发行人 failed"处理即可）。
- 设计决定（与规格一致但规格未明说）：`claim_fact_sync_lease` 无 scope 行返回 false；`scopeDue` 只取 `priority > 0`；`filingsOfIssuer.unlinkedOnly` = `document_ref is null`（`link_attempts < 5` 由 Part C 过滤）；`filingsOfIssuer` 不给 `limit` 时返回全部行（Supabase 实现按 1,000 行分页）；`read_facts` 的 `p_history=false` 不返回非 ok 行；`replace_financial_metrics` 空 manifest 的发布也 `state_rev + 1`；`abandon_sync_run` 幂等；`resolve_facts_quarantine` 对无事实行的项按 `payload.run_id` 定位发行人，该锚定运行仍 staged 时同样 `run_pending`，否则仅翻转状态；成员集在取得 scope 锁后重建；提升资格另含"该行 (K, available_date) 无 open 的 `same_day_conflict` 项"（按 `payload.key` 匹配）。
- 开放问题：(1) 内存实现的 `numericEquals` 不处理指数形式，Part B 的 `canonicalDecimal` 落地后应在 `stageFacts` 入口规范化（或改为调用 `decimalEquals`）；(2) `dq_quarantine_fact_ids_idx`（GIN）建在计划一已锁的表上，`test:migrations` 的 schema 对比应通过，若托管库 `dq_quarantine` 已有大量非 facts 行，建索引耗时可忽略；(3) 本机 `test:db` 全量套件已知偶发（见记忆 `alpha-local-db-harness-env.md`），`facts.integration.test.ts` 的 10,001 行用例设置了 120 s 超时。


## Part B：Task 4–9（F2-1 概念/单位/数值/规划/规则/读取，F2-2 快照与同步核心、处理钩子）

规格依据：§3、§5.1–5.3、§6.1、§6.2（数值解码部分）、§7、§10、§11.1。共享契约按计划骨架 `src/lib/facts/types.ts` 原样使用（`FactCandidate`、`FilingCandidate`、`ParseResult`、`RawSnapshot`、`Budget`、`FactRow`、`FilingRow`、`ScopeRow`、`ConflictItem`、`FactInsert`、`FilingInsert`、`FactsDb`、`FactsDbError`）。本部分全部模块与测试已在隔离环境（复制计划一的 `db/*`、`dq/*` 与骨架 `types.ts`）跑通：88 个测试通过、`tsc --strict` 无错。

### 本部分新增导出（骨架之外，均定义在本部分文件内）

| 文件 | 新增名 | 说明 |
|---|---|---|
| `src/lib/facts/keys.ts`（新文件，Task 5） | `FactKey`、`factKey`、`candidateKey`、`sameDayConflictKey`、`ambiguousKey`、`identityKey`、`keyComponents` | §5.2 K 与 §7.1 各 `natural_key` 的唯一渲染点；`period_start=null` 渲染为空段 |
| `src/lib/facts/errors.ts`（新文件，Task 8） | `SyncError{code:SyncErrorCode}`、`SyncErrorCode`（含 `tushare_unavailable`） | §10 的非数据库错误码；Part C 的抓取器/解析器抛的 `ProviderError` 就是本类的别名（`providers/shared.ts` 里 `export const ProviderError=SyncError`），所以 `sync.ts` 的 `e instanceof SyncError` 能直接取 `code` 作批次错误码 |
| `concepts.ts` | `CONCEPT_IDS`、`MAX_READ_CONCEPTS`、`isConceptId`、`tushareFieldsFor(api)` | 读路由白名单与 Tushare 字段列表 |
| `units.ts` | `CURRENCIES`、`unitKindOf`、`MAX_UNIT_LENGTH` | |
| `classify.ts` | `DURATION_BANDS`、`dateMs`、`isDate`、`daysBetween` | |
| `json-numbers.ts` | `NumToken`、`isNumToken`、`NumberSchema`、`EDGAR_NUMBER_SCHEMA`、`TUSHARE_CONTROL_FIELDS`、`decodeNumber`、`decodeColumns` | `decodeColumns` 供 Tushare 适配器按列名解码 `items` |
| `plan.ts` | `PlanInput`（含 `filingCandidates: FilingCandidate[]`——候选的 `available_date` 来自 filing，骨架签名里没有这一项）、`PlanResult.outcomes: Map<fact_id,'inserted'|'versioned'|'quarantined'>`、`PlanResult.quarantinedFactIds`、`PlanConflict`、`PlanAmbiguous` | `outcomes` 让规则隔离后计数能从 inserted/versioned 移到 quarantined |
| `rules.ts` | `FactRulesInput`（含 `sourceRefOf: Map<filing_id,source_ref>`、`issuerId`、`market`、`mappingGen`）、`RuleQuarantine`、`mergeWarnings`、`IDENTITY_TOLERANCE`、`GROSS_MARGIN_RANGE=[-1,1]`、`REVENUE_MAX_JUMP=10`、`WARNING_RULES` | 规格未给 `gross_margin_range` 的上下界，取 [-1, 1] |
| `read.ts` | `SequenceOptions`、`sequencesOf`、`currentFacts` | 骨架写的是 `readCurrentFacts / sequences`，本部分定名 `sequencesOf`/`currentFacts` |
| `snapshot-store.ts` | `SNAPSHOT_BUCKET`、`snapshotPath`、`metaPath` | |
| `sync.ts` | `SyncDeps.parseUs/parseCn`（规格 §6.1 的 `SyncDeps` 只有抓取函数；解析器由 Part C 提供、由 `deps.ts`/脚本注入，避免 `sync.ts` 直接 import 适配器）、`SyncDeps.codeVersion: string|null`、`SyncOptions.sinceYear/mappingGen`、`IssuerOutcome`（含 `fetchKey`、`snapshotSha256`，`outcome` 多一个 `'planned'` 给 dry-run）、`SyncReceipt`（含 `detail:{attempted,published,failed,skipped,idle}`，与新鲜度 `detail` 同一对象）、`makeBudget`、`resolveCodeVersion`、`LEASE_TTL_S`、`MIN_ISSUER_MS`、`NEXT_DUE_OK_MS`、`NEXT_DUE_FAIL_MS`、`MAX_LINK_ATTEMPTS`、`LINKABLE_FORMS` | `issuerIds` 给定（脚本 `--issuer`、回放测试）时不先 `reconcileScope`，也不受 `next_due_at` 限制；未给定（cron）时先对账再 `scopeDue` |
| `src/lib/dq/facts-resolver.ts` | `HookState`、`FactsResolveOutcome`（含 `hook_retried`、`invalid_choice`）、`FactsResolveResult`、`ResolveFactsInput`、`FACT_ROW_REASONS` | |

跨部分依赖（必须先于本部分对应任务合入）：
- Task 4–9 依赖 Part A 的 `src/lib/facts/types.ts`；Task 8 的 `sync.test.ts` 依赖 Part A 的 `memoryFactsDb(tables: TableClient)`（签名一致；`MemoryFactsDb` 的 `runs()/filings()/facts()/metrics()/scope()` 是返回数组快照的**方法**，`sync.test.ts` 按此调用）；Task 9 依赖 Part A 的 `supabaseFactsDb(admin)`（`src/lib/facts/db.ts`）。
- Task 8 的 `sync.ts` 直接 `import {reconcileScope,scopeRowFor} from './scope'`（Task 14：`reconcileScope({db,tables},market):Promise<ScopeReconcileResult>`，返回值在 `sync.ts` 里不使用；`scopeRowFor(tables,market,issuerId,{today}):Promise<ScopeInputRow|null>` 供显式发行人补建 scope 行）与 `import {materialize,FORMULA_VERSION} from './derive'`（Task 15：`materialize(db,issuer,market):Promise<MaterializeResult>`，返回值不使用）；Task 9 的 `facts-resolver.ts` 同样 import `materialize`。**执行顺序见顶部"执行顺序"表：Part A → Task 4–7 → Task 14、Task 15 → Task 8、Task 9 → Part C → Part D 其余。** 单测用 `vi.mock('./scope')`（提供 `reconcileScope` 与 `scopeRowFor` 两个 mock）/`vi.mock('./derive')`，不依赖两者的真实实现。
- 规格 §3 正文写"33 个概念"，但 §3 表有 **34** 行（IS 14 + BS 11 + CF 9）。本部分按表逐行落地 34 个；`MAX_READ_CONCEPTS = FACT_CONCEPTS.length`。见末尾开放问题 1。

---

### Task 4: 概念目录、单位、期间分类、无损数值解码

**Files:**
- Create: `src/lib/facts/concepts.ts`
- Create: `src/lib/facts/units.ts`
- Create: `src/lib/facts/classify.ts`
- Create: `src/lib/facts/json-numbers.ts`
- Test: `src/lib/facts/concepts.test.ts`、`src/lib/facts/units.test.ts`、`src/lib/facts/classify.test.ts`、`src/lib/facts/json-numbers.test.ts`

- [ ] **Step 1: 写失败测试（概念目录快照）**

```ts
// src/lib/facts/concepts.test.ts
import {describe,it,expect} from 'vitest';
import {FACT_CONCEPTS,CONCEPT_IDS,MAPPING_GEN,MAPPING_VERSION,MAX_READ_CONCEPTS,conceptById,conceptsForTushare,tushareFieldsFor,isConceptId} from './concepts';

const EXPECTED_IDS=['revenue','revenue_operating','cost_of_revenue','gross_profit','operating_income','net_income','net_income_parent','eps_basic','eps_diluted','rd_expense','sga_expense','interest_expense','interest_expense_bank','income_tax','total_assets','total_liabilities','liabilities_and_equity','equity_parent','equity_total','cash','cash_and_restricted_cash','short_term_borrowings','long_term_borrowings','bonds_payable','shares_outstanding','operating_cash_flow','investing_cash_flow','financing_cash_flow','capex','capex_incl_intangibles','dividends_paid','dividends_and_interest_paid','net_change_in_cash','net_change_in_cash_and_restricted'];

describe('concepts',()=>{
 it('exports the catalogue in spec §3 order with the frozen mapping generation',()=>{
  expect(CONCEPT_IDS).toEqual(EXPECTED_IDS);
  expect(FACT_CONCEPTS).toHaveLength(EXPECTED_IDS.length);
  expect(MAX_READ_CONCEPTS).toBe(FACT_CONCEPTS.length);
  expect(MAPPING_GEN).toBe(1);expect(MAPPING_VERSION).toBe('facts-map/1');
 });
 it('matches the spec table row by row (snapshot)',()=>{
  expect(FACT_CONCEPTS.map(c=>[c.id,c.statement,c.nature,c.unitKind,c.usGaap.join('>'),c.ifrs.join('>'),c.tushare===null?'-':'sum' in c.tushare?`${c.tushare.api}.sum(${c.tushare.sum.join(',')})`:`${c.tushare.api}.${c.tushare.field}`])).toMatchInlineSnapshot(`
    [
      [
        "revenue",
        "IS",
        "duration",
        "money",
        "Revenues>RevenueFromContractWithCustomerExcludingAssessedTax>SalesRevenueNet",
        "Revenue",
        "income.total_revenue",
      ],
      [
        "revenue_operating",
        "IS",
        "duration",
        "money",
        "",
        "",
        "income.revenue",
      ],
      [
        "cost_of_revenue",
        "IS",
        "duration",
        "money",
        "CostOfRevenue>CostOfGoodsAndServicesSold>CostOfGoodsSold",
        "CostOfSales",
        "income.oper_cost",
      ],
      [
        "gross_profit",
        "IS",
        "duration",
        "money",
        "GrossProfit",
        "GrossProfit",
        "-",
      ],
      [
        "operating_income",
        "IS",
        "duration",
        "money",
        "OperatingIncomeLoss",
        "ProfitLossFromOperatingActivities",
        "income.operate_profit",
      ],
      [
        "net_income",
        "IS",
        "duration",
        "money",
        "ProfitLoss",
        "ProfitLoss",
        "income.n_income",
      ],
      [
        "net_income_parent",
        "IS",
        "duration",
        "money",
        "NetIncomeLoss",
        "ProfitLossAttributableToOwnersOfParent",
        "income.n_income_attr_p",
      ],
      [
        "eps_basic",
        "IS",
        "duration",
        "per_share",
        "EarningsPerShareBasic",
        "BasicEarningsLossPerShare",
        "income.basic_eps",
      ],
      [
        "eps_diluted",
        "IS",
        "duration",
        "per_share",
        "EarningsPerShareDiluted",
        "DilutedEarningsLossPerShare",
        "income.diluted_eps",
      ],
      [
        "rd_expense",
        "IS",
        "duration",
        "money",
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpense",
        "income.rd_exp",
      ],
      [
        "sga_expense",
        "IS",
        "duration",
        "money",
        "SellingGeneralAndAdministrativeExpense",
        "SellingGeneralAndAdministrativeExpense",
        "income.sum(sell_exp,admin_exp)",
      ],
      [
        "interest_expense",
        "IS",
        "duration",
        "money",
        "InterestExpense",
        "InterestExpense",
        "income.fin_exp_int_exp",
      ],
      [
        "interest_expense_bank",
        "IS",
        "duration",
        "money",
        "",
        "",
        "income.int_exp",
      ],
      [
        "income_tax",
        "IS",
        "duration",
        "money",
        "IncomeTaxExpenseBenefit",
        "IncomeTaxExpenseContinuingOperations",
        "income.income_tax",
      ],
      [
        "total_assets",
        "BS",
        "instant",
        "money",
        "Assets",
        "Assets",
        "balancesheet.total_assets",
      ],
      [
        "total_liabilities",
        "BS",
        "instant",
        "money",
        "Liabilities",
        "Liabilities",
        "balancesheet.total_liab",
      ],
      [
        "liabilities_and_equity",
        "BS",
        "instant",
        "money",
        "LiabilitiesAndStockholdersEquity",
        "EquityAndLiabilities",
        "-",
      ],
      [
        "equity_parent",
        "BS",
        "instant",
        "money",
        "StockholdersEquity",
        "EquityAttributableToOwnersOfParent",
        "balancesheet.total_hldr_eqy_exc_min_int",
      ],
      [
        "equity_total",
        "BS",
        "instant",
        "money",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        "Equity",
        "balancesheet.total_hldr_eqy_inc_min_int",
      ],
      [
        "cash",
        "BS",
        "instant",
        "money",
        "CashAndCashEquivalentsAtCarryingValue",
        "CashAndCashEquivalents",
        "balancesheet.money_cap",
      ],
      [
        "cash_and_restricted_cash",
        "BS",
        "instant",
        "money",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        "",
        "-",
      ],
      [
        "short_term_borrowings",
        "BS",
        "instant",
        "money",
        "ShortTermBorrowings",
        "ShorttermBorrowings",
        "balancesheet.st_borr",
      ],
      [
        "long_term_borrowings",
        "BS",
        "instant",
        "money",
        "LongTermDebtNoncurrent",
        "LongtermBorrowings",
        "balancesheet.lt_borr",
      ],
      [
        "bonds_payable",
        "BS",
        "instant",
        "money",
        "",
        "",
        "balancesheet.bond_payable",
      ],
      [
        "shares_outstanding",
        "BS",
        "instant",
        "shares",
        "CommonStockSharesOutstanding>dei:EntityCommonStockSharesOutstanding",
        "NumberOfSharesOutstanding",
        "balancesheet.total_share",
      ],
      [
        "operating_cash_flow",
        "CF",
        "duration",
        "money",
        "NetCashProvidedByUsedInOperatingActivities",
        "CashFlowsFromUsedInOperatingActivities",
        "cashflow.n_cashflow_act",
      ],
      [
        "investing_cash_flow",
        "CF",
        "duration",
        "money",
        "NetCashProvidedByUsedInInvestingActivities",
        "CashFlowsFromUsedInInvestingActivities",
        "cashflow.n_cashflow_inv_act",
      ],
      [
        "financing_cash_flow",
        "CF",
        "duration",
        "money",
        "NetCashProvidedByUsedInFinancingActivities",
        "CashFlowsFromUsedInFinancingActivities",
        "cashflow.n_cash_flows_fnc_act",
      ],
      [
        "capex",
        "CF",
        "duration",
        "money",
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
        "-",
      ],
      [
        "capex_incl_intangibles",
        "CF",
        "duration",
        "money",
        "",
        "",
        "cashflow.c_pay_acq_const_fiolta",
      ],
      [
        "dividends_paid",
        "CF",
        "duration",
        "money",
        "PaymentsOfDividends",
        "DividendsPaidClassifiedAsFinancingActivities",
        "-",
      ],
      [
        "dividends_and_interest_paid",
        "CF",
        "duration",
        "money",
        "",
        "",
        "cashflow.c_pay_dist_dpcp_int_exp",
      ],
      [
        "net_change_in_cash",
        "CF",
        "duration",
        "money",
        "CashAndCashEquivalentsPeriodIncreaseDecrease",
        "IncreaseDecreaseInCashAndCashEquivalents",
        "cashflow.n_incr_cash_cash_equ",
      ],
      [
        "net_change_in_cash_and_restricted",
        "CF",
        "duration",
        "money",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
        "",
        "-",
      ],
    ]
  `);
 });
 it('keeps ids unique and never maps one taxonomy tag to two concepts',()=>{
  expect(new Set(CONCEPT_IDS).size).toBe(CONCEPT_IDS.length);
  for(const tax of ['usGaap','ifrs'] as const){const tags=FACT_CONCEPTS.flatMap(c=>c[tax]);expect(new Set(tags).size).toBe(tags.length);}
  const tsCols=FACT_CONCEPTS.flatMap(c=>c.tushare===null?[]:'sum' in c.tushare?c.tushare.sum.map(f=>`${c.tushare!.api}.${f}`):[`${c.tushare.api}.${c.tushare.field}`]);
  expect(new Set(tsCols).size).toBe(tsCols.length);
  for(const c of FACT_CONCEPTS)expect(c.nature).toBe(c.statement==='BS'?'instant':'duration');
 });
 it('looks up by id and by Tushare table',()=>{
  expect(conceptById('revenue')?.usGaap[0]).toBe('Revenues');
  expect(conceptById('nope')).toBeUndefined();
  expect(isConceptId('capex')).toBe(true);expect(isConceptId(42)).toBe(false);
  expect(conceptsForTushare('cashflow').map(c=>c.id)).toEqual(['operating_cash_flow','investing_cash_flow','financing_cash_flow','capex_incl_intangibles','dividends_and_interest_paid','net_change_in_cash']);
  expect(tushareFieldsFor('income')).toEqual(['total_revenue','revenue','oper_cost','operate_profit','n_income','n_income_attr_p','basic_eps','diluted_eps','rd_exp','sell_exp','admin_exp','fin_exp_int_exp','int_exp','income_tax']);
  expect(conceptById('shares_outstanding')).toMatchObject({notes:'cover_date',usGaap:['CommonStockSharesOutstanding','dei:EntityCommonStockSharesOutstanding']});
 });
});
```

- [ ] **Step 2: 写失败测试（单位、期间、数值）**

```ts
// src/lib/facts/units.test.ts
import {describe,it,expect} from 'vitest';
import {unitRule} from '../dq/rules';
import {normalizeUnit,rawUnitOf,allowedUnits,unitKindOf,CURRENCIES} from './units';

describe('units',()=>{
 it('normalises companyfacts units and rejects shapes we do not store',()=>{
  expect(normalizeUnit('USD')).toBe('USD');
  expect(normalizeUnit('shares')).toBe('shares');
  expect(normalizeUnit('USD/shares')).toBe('USD/share');
  expect(normalizeUnit('CNY/shares')).toBe('CNY/share');
  expect(normalizeUnit('pure')).toBe('pure');
  expect(normalizeUnit('EUR')).toBe('EUR');
  for(const bad of ['USD/EUR','Year','sqft','usd','XXX','USD/share'])expect(normalizeUnit(bad)).toBeNull();
 });
 it('gives Tushare columns CNY-based units by kind',()=>{
  expect(rawUnitOf('money')).toBe('CNY');
  expect(rawUnitOf('per_share')).toBe('CNY/share');
  expect(rawUnitOf('shares')).toBe('shares');
  expect(rawUnitOf('money','USD')).toBe('USD');
  expect(()=>rawUnitOf('money','XXX')).toThrow('unknown_currency');
 });
 it('feeds unitRule with the allowed list per kind',()=>{
  expect(allowedUnits('shares')).toEqual(['shares']);
  expect(allowedUnits('money')).toEqual(CURRENCIES);
  expect(allowedUnits('per_share')).toContain('USD/share');
  expect(unitRule('unit_money','USD',allowedUnits('money')).passed).toBe(true);
  expect(unitRule('unit_money','pure',allowedUnits('money')).passed).toBe(false);
  expect(unitRule('unit_per_share','USD/shares',allowedUnits('per_share')).passed).toBe(false);
 });
 it('classifies stored units back into kinds',()=>{
  expect(unitKindOf('USD')).toBe('money');expect(unitKindOf('shares')).toBe('shares');
  expect(unitKindOf('CNY/share')).toBe('per_share');expect(unitKindOf('pure')).toBeNull();
 });
});
```

```ts
// src/lib/facts/classify.test.ts
import {describe,it,expect} from 'vitest';
import {classifyDuration,daysBetween,dateMs,isDate} from './classify';

describe('classifyDuration',()=>{
 it('maps day counts to the four bands and instants to INSTANT',()=>{
  expect(classifyDuration('2023-07-02','2023-09-30')).toBe('3M');   // 90 days
  expect(classifyDuration('2023-07-01','2023-09-30')).toBe('3M');   // 91
  expect(classifyDuration('2023-04-02','2023-09-30')).toBe('6M');   // 181
  expect(classifyDuration('2023-01-01','2023-09-30')).toBe('9M');   // 272
  expect(classifyDuration('2022-10-01','2023-09-30')).toBe('12M');  // 364
  expect(classifyDuration('2023-01-01','2023-12-31')).toBe('12M');  // 364
  expect(classifyDuration('2024-01-01','2024-12-31')).toBe('12M');  // 365 (leap year)
  expect(classifyDuration(null,'2023-09-30')).toBe('INSTANT');
 });
 it('returns odd outside the bands, for reversed or invalid dates',()=>{
  expect(classifyDuration('2023-09-01','2023-09-30')).toBe('odd');  // 29
  expect(classifyDuration('2023-05-01','2023-09-30')).toBe('odd');  // 152: between 3M and 6M
  expect(classifyDuration('2021-01-01','2023-09-30')).toBe('odd');  // 2 years
  expect(classifyDuration('2023-09-30','2023-09-30')).toBe('odd');
  expect(classifyDuration('2023-10-01','2023-09-30')).toBe('odd');
  expect(classifyDuration('2023-02-30','2023-09-30')).toBe('odd');
  expect(classifyDuration(null,'20230930')).toBe('odd');
  expect(classifyDuration('x','2023-09-30')).toBe('odd');
 });
 it('exposes band edges exactly',()=>{
  expect(daysBetween('2023-01-01','2023-03-17')).toBe(75);expect(classifyDuration('2023-01-01','2023-03-17')).toBe('3M');
  expect(daysBetween('2023-01-01','2023-04-16')).toBe(105);expect(classifyDuration('2023-01-01','2023-04-16')).toBe('3M');
  expect(classifyDuration('2023-01-01','2023-04-17')).toBe('odd');
  expect(dateMs('2023-02-30')).toBeNull();expect(isDate('2024-02-29')).toBe(true);expect(isDate('2023-02-29')).toBe(false);
 });
});
```

```ts
// src/lib/facts/json-numbers.test.ts
import {describe,it,expect} from 'vitest';
import {scanJsonNumbers,canonicalDecimal,decimalEquals,decodeWithSchema,decodeColumns,isNumToken,EDGAR_NUMBER_SCHEMA,TUSHARE_CONTROL_FIELDS} from './json-numbers';

describe('scanJsonNumbers',()=>{
 it('wraps numeric literals outside strings and keeps strings, booleans and null intact',()=>{
  const out=scanJsonNumbers('{"a":12345678901234567890,"b":-1.50e+3,"s":"x 1e5 \\" 7","t":true,"n":null,"arr":[0,1.25,"2"]}') as Record<string,unknown>;
  expect(out.a).toEqual({__num:'12345678901234567890'});
  expect(out.b).toEqual({__num:'-1.50e+3'});
  expect(out.s).toBe('x 1e5 " 7');
  expect(out.t).toBe(true);expect(out.n).toBeNull();
  expect(out.arr).toEqual([{__num:'0'},{__num:'1.25'},'2']);
  expect(isNumToken(out.a)).toBe(true);expect(isNumToken({__num:'1',x:1})).toBe(false);
 });
 it('accepts bytes (utf-8) and rejects invalid JSON or invalid utf-8',()=>{
  expect(scanJsonNumbers(new TextEncoder().encode('{"val":1e5,"name":"贵州茅台"}'))).toEqual({val:{__num:'1e5'},name:'贵州茅台'});
  expect(()=>scanJsonNumbers('{"a":}')).toThrow();
  expect(()=>scanJsonNumbers(new Uint8Array([0x7b,0xff,0x7d]))).toThrow();
 });
});

describe('canonicalDecimal',()=>{
 it('keeps 20-digit integers exactly and treats 1e5 and 100000 as equal',()=>{
  expect(canonicalDecimal('12345678901234567890')).toBe('12345678901234567890');
  expect(canonicalDecimal('1e5')).toBe('100000');
  expect(decimalEquals('1e5','100000')).toBe(true);
  expect(decimalEquals('1E5','100000.000')).toBe(true);
  expect(decimalEquals('383285000000','383285000001')).toBe(false);
 });
 it('removes exponents, trailing zeros, leading zeros and negative zero',()=>{
  expect(canonicalDecimal('-1.50e+3')).toBe('-1500');
  expect(canonicalDecimal('1.500')).toBe('1.5');
  expect(canonicalDecimal('000.25')).toBe('0.25');
  expect(canonicalDecimal('0.000123e3')).toBe('0.123');
  expect(canonicalDecimal('123.456e-2')).toBe('1.23456');
  expect(canonicalDecimal('5e-3')).toBe('0.005');
  expect(canonicalDecimal('-0')).toBe('0');expect(canonicalDecimal('-0.000')).toBe('0');expect(canonicalDecimal('0e9')).toBe('0');
  expect(canonicalDecimal('2.5')).toBe('2.5');expect(canonicalDecimal('-7')).toBe('-7');
 });
 it('rejects non-decimal text and absurd exponents',()=>{
  for(const bad of ['','abc','1.','.5','1e','0x10','NaN','Infinity',' 1','1e1001'])expect(()=>canonicalDecimal(bad)).toThrow('invalid_decimal');
 });
});

describe('decodeWithSchema',()=>{
 it('decodes control fields as integers, decimal fields as canonical strings, others as numbers',()=>{
  const scanned=scanJsonNumbers('{"cik":320193,"fy":2023,"facts":{"us-gaap":{"Revenues":{"units":{"USD":[{"val":383285000000,"fy":2023,"frame":"CY2023","start":"2022-10-01","end":"2023-09-30"},{"val":1e5,"fp":"FY"}]}}}},"other":1.5}');
  const out=decodeWithSchema(scanned,EDGAR_NUMBER_SCHEMA) as {cik:number;fy:number;facts:{'us-gaap':{Revenues:{units:{USD:{val:string;fy?:number}[]}}}};other:number};
  expect(out.cik).toBe(320193);expect(typeof out.cik).toBe('number');
  expect(out.fy).toBe(2023);
  const entries=out.facts['us-gaap'].Revenues.units.USD;
  expect(entries[0].val).toBe('383285000000');expect(typeof entries[0].val).toBe('string');
  expect(entries[0].fy).toBe(2023);
  expect(entries[1].val).toBe('100000');
  expect(out.other).toBe(1.5);
 });
 it('fails loudly when a control field is not an integer',()=>{
  expect(()=>decodeWithSchema(scanJsonNumbers('{"cik":"320193"}'),EDGAR_NUMBER_SCHEMA)).not.toThrow();
  expect(()=>decodeWithSchema(scanJsonNumbers('{"fy":2023.5}'),EDGAR_NUMBER_SCHEMA)).toThrow('invalid_control_field:fy');
 });
 it('decodes positional Tushare rows by column name',()=>{
  const schema={control:TUSHARE_CONTROL_FIELDS,decimal:['total_revenue','basic_eps']};
  const scanned=scanJsonNumbers('{"code":0,"data":{"fields":["ts_code","end_date","report_type","total_revenue","basic_eps"],"items":[["600519.SH","20231231",1,150560000000.00,38.1000]],"has_more":false}}') as {code:unknown;data:{fields:string[];items:unknown[][];has_more:boolean}};
  expect(decodeWithSchema(scanned.code,schema,'code')).toBe(0);
  expect(decodeColumns(scanned.data.fields,scanned.data.items,schema)).toEqual([{ts_code:'600519.SH',end_date:'20231231',report_type:1,total_revenue:'150560000000',basic_eps:'38.1'}]);
  expect(()=>decodeColumns(['a'],[[1,2]],schema)).toThrow('invalid_row_width');
 });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test -- src/lib/facts/concepts.test.ts src/lib/facts/units.test.ts src/lib/facts/classify.test.ts src/lib/facts/json-numbers.test.ts`
Expected: 4 个文件 FAIL，`Error: Failed to resolve import "./concepts" from "src/lib/facts/concepts.test.ts". Does the file exist?`（其余三个同样报各自模块不存在）。

- [ ] **Step 4: 实现概念目录**

```ts
// src/lib/facts/concepts.ts
// Concept catalogue (spec §3). FACT_CONCEPTS lists every concept the facts layer stores, in the
// order of the spec table: us-gaap tags in fallback order (first tag with an entry for the
// period wins; a lower tag only fills periods the higher one lacks), the ifrs-full alias, and
// the Tushare column (or a sum of columns). Only equivalent-basis aliases share a concept; a
// different basis is a different concept (revenue vs revenue_operating, capex vs
// capex_incl_intangibles). MAPPING_GEN and MAPPING_VERSION move together on any change here.
// 'dei:' prefixes a tag from the dei taxonomy (companyfacts facts.dei.*), everything else is
// facts['us-gaap'].* ; the EDGAR adapter splits on that prefix.
import type {ConceptDef,Statement,UnitKind} from './types';

export const MAPPING_GEN=1;
export const MAPPING_VERSION='facts-map/1';

type Api='income'|'balancesheet'|'cashflow';
const ts=(api:Api,field:string):ConceptDef['tushare']=>({api,field});
const tsSum=(api:Api,sum:string[]):ConceptDef['tushare']=>({api,sum});
const def=(id:string,statement:Statement,nature:'duration'|'instant',unitKind:UnitKind,usGaap:string[],ifrs:string[],tushare:ConceptDef['tushare'],notes?:string):ConceptDef=>
 notes===undefined?{id,statement,nature,unitKind,usGaap,ifrs,tushare}:{id,statement,nature,unitKind,usGaap,ifrs,tushare,notes};

export const FACT_CONCEPTS:readonly ConceptDef[]=[
 def('revenue','IS','duration','money',['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet'],['Revenue'],ts('income','total_revenue')),
 def('revenue_operating','IS','duration','money',[],[],ts('income','revenue')),
 def('cost_of_revenue','IS','duration','money',['CostOfRevenue','CostOfGoodsAndServicesSold','CostOfGoodsSold'],['CostOfSales'],ts('income','oper_cost')),
 def('gross_profit','IS','duration','money',['GrossProfit'],['GrossProfit'],null),
 def('operating_income','IS','duration','money',['OperatingIncomeLoss'],['ProfitLossFromOperatingActivities'],ts('income','operate_profit')),
 def('net_income','IS','duration','money',['ProfitLoss'],['ProfitLoss'],ts('income','n_income')),
 def('net_income_parent','IS','duration','money',['NetIncomeLoss'],['ProfitLossAttributableToOwnersOfParent'],ts('income','n_income_attr_p')),
 def('eps_basic','IS','duration','per_share',['EarningsPerShareBasic'],['BasicEarningsLossPerShare'],ts('income','basic_eps')),
 def('eps_diluted','IS','duration','per_share',['EarningsPerShareDiluted'],['DilutedEarningsLossPerShare'],ts('income','diluted_eps')),
 def('rd_expense','IS','duration','money',['ResearchAndDevelopmentExpense'],['ResearchAndDevelopmentExpense'],ts('income','rd_exp')),
 def('sga_expense','IS','duration','money',['SellingGeneralAndAdministrativeExpense'],['SellingGeneralAndAdministrativeExpense'],tsSum('income',['sell_exp','admin_exp'])),
 def('interest_expense','IS','duration','money',['InterestExpense'],['InterestExpense'],ts('income','fin_exp_int_exp')),
 def('interest_expense_bank','IS','duration','money',[],[],ts('income','int_exp'),'bank basis'),
 def('income_tax','IS','duration','money',['IncomeTaxExpenseBenefit'],['IncomeTaxExpenseContinuingOperations'],ts('income','income_tax')),
 def('total_assets','BS','instant','money',['Assets'],['Assets'],ts('balancesheet','total_assets')),
 def('total_liabilities','BS','instant','money',['Liabilities'],['Liabilities'],ts('balancesheet','total_liab')),
 def('liabilities_and_equity','BS','instant','money',['LiabilitiesAndStockholdersEquity'],['EquityAndLiabilities'],null),
 def('equity_parent','BS','instant','money',['StockholdersEquity'],['EquityAttributableToOwnersOfParent'],ts('balancesheet','total_hldr_eqy_exc_min_int')),
 def('equity_total','BS','instant','money',['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],['Equity'],ts('balancesheet','total_hldr_eqy_inc_min_int')),
 def('cash','BS','instant','money',['CashAndCashEquivalentsAtCarryingValue'],['CashAndCashEquivalents'],ts('balancesheet','money_cap')),
 def('cash_and_restricted_cash','BS','instant','money',['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],[],null),
 def('short_term_borrowings','BS','instant','money',['ShortTermBorrowings'],['ShorttermBorrowings'],ts('balancesheet','st_borr')),
 def('long_term_borrowings','BS','instant','money',['LongTermDebtNoncurrent'],['LongtermBorrowings'],ts('balancesheet','lt_borr')),
 def('bonds_payable','BS','instant','money',[],[],ts('balancesheet','bond_payable')),
 def('shares_outstanding','BS','instant','shares',['CommonStockSharesOutstanding','dei:EntityCommonStockSharesOutstanding'],['NumberOfSharesOutstanding'],ts('balancesheet','total_share'),'cover_date'),
 def('operating_cash_flow','CF','duration','money',['NetCashProvidedByUsedInOperatingActivities'],['CashFlowsFromUsedInOperatingActivities'],ts('cashflow','n_cashflow_act')),
 def('investing_cash_flow','CF','duration','money',['NetCashProvidedByUsedInInvestingActivities'],['CashFlowsFromUsedInInvestingActivities'],ts('cashflow','n_cashflow_inv_act')),
 def('financing_cash_flow','CF','duration','money',['NetCashProvidedByUsedInFinancingActivities'],['CashFlowsFromUsedInFinancingActivities'],ts('cashflow','n_cash_flows_fnc_act')),
 def('capex','CF','duration','money',['PaymentsToAcquirePropertyPlantAndEquipment'],['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'],null),
 def('capex_incl_intangibles','CF','duration','money',[],[],ts('cashflow','c_pay_acq_const_fiolta')),
 def('dividends_paid','CF','duration','money',['PaymentsOfDividends'],['DividendsPaidClassifiedAsFinancingActivities'],null),
 def('dividends_and_interest_paid','CF','duration','money',[],[],ts('cashflow','c_pay_dist_dpcp_int_exp')),
 def('net_change_in_cash','CF','duration','money',['CashAndCashEquivalentsPeriodIncreaseDecrease'],['IncreaseDecreaseInCashAndCashEquivalents'],ts('cashflow','n_incr_cash_cash_equ')),
 def('net_change_in_cash_and_restricted','CF','duration','money',['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect'],[],null),
];

export const CONCEPT_IDS:readonly string[]=FACT_CONCEPTS.map(c=>c.id);
/** Upper bound of `concepts` on the public read route (spec §3). */
export const MAX_READ_CONCEPTS=FACT_CONCEPTS.length;
const BY_ID=new Map(FACT_CONCEPTS.map(c=>[c.id,c]));
export const conceptById=(id:string):ConceptDef|undefined=>BY_ID.get(id);
export const isConceptId=(id:unknown):id is string=>typeof id==='string'&&BY_ID.has(id);
/** Concepts fed by one Tushare table, in catalogue order (readonly like the catalogue). */
export const conceptsForTushare=(api:Api):readonly ConceptDef[]=>FACT_CONCEPTS.filter(c=>c.tushare!==null&&c.tushare.api===api);
/** Tushare columns a table request must ask for (value fields only; the adapter adds control fields). */
export const tushareFieldsFor=(api:Api):string[]=>[...new Set(conceptsForTushare(api).flatMap(c=>c.tushare!==null&&'sum' in c.tushare?c.tushare.sum:[(c.tushare as {field:string}).field]))];
```

- [ ] **Step 5: 实现单位归一**

```ts
// src/lib/facts/units.ts
// Unit normalisation (spec §3). companyfacts units become 'USD' (or another ISO currency as-is),
// 'shares', '<CCY>/share' and 'pure'; Tushare money is 'CNY', eps 'CNY/share', total_share
// 'shares'. The unit is part of the fact key, so this is the only place where two spellings may
// be merged; anything else is kept distinct or rejected (null) and never silently converted.
import type {UnitKind} from './types';

/** Currencies accepted as money units (companyfacts foreign filers report in their own currency). */
export const CURRENCIES=['USD','CNY','HKD','EUR','GBP','JPY','CHF','CAD','AUD','SGD','KRW','TWD','INR','BRL','MXN','ILS','SEK','DKK','NOK','ZAR','RUB','ARS','CLP','IDR','MYR','PHP','THB','VND','TRY','PLN','NZD','CZK','HUF','COP','PEN','SAR','AED','EGP','NGN','KZT'] as const;
const CURRENCY=new Set<string>(CURRENCIES);
export const MAX_UNIT_LENGTH=16;

/** companyfacts unit → stored unit, or null when the shape is not one we store (e.g. 'USD/EUR', 'Year', 'sqft'). */
export function normalizeUnit(raw:string):string|null{
 if(raw==='shares'||raw==='pure')return raw;
 if(CURRENCY.has(raw))return raw;
 const m=/^([A-Z]{3})\/shares$/.exec(raw);
 if(m&&CURRENCY.has(m[1]))return `${m[1]}/share`;
 return null;
}

/** Stored unit of a Tushare column by unit kind; money and per-share values are in CNY. */
export function rawUnitOf(kind:UnitKind,currency:string='CNY'):string{
 if(!CURRENCY.has(currency))throw new Error(`unknown_currency:${currency}`);
 return kind==='money'?currency:kind==='shares'?'shares':`${currency}/share`;
}

/** Units a concept of this kind may carry; feed to unitRule('unit_'+kind, unit, allowedUnits(kind)). */
export function allowedUnits(kind:UnitKind):readonly string[]{
 return kind==='money'?CURRENCIES:kind==='shares'?['shares']:CURRENCIES.map(c=>`${c}/share`);
}

/** Kind of a stored unit, or null for units no concept carries ('pure'). */
export function unitKindOf(unit:string):UnitKind|null{
 if(unit==='shares')return 'shares';
 if(CURRENCY.has(unit))return 'money';
 const m=/^([A-Z]{3})\/share$/.exec(unit);
 return m&&CURRENCY.has(m[1])?'per_share':null;
}
```

- [ ] **Step 6: 实现期间分类**

```ts
// src/lib/facts/classify.ts
// Period → duration (spec §4.3): the day count end − start falls in one of four bands, instants
// (no start) are INSTANT, everything else is 'odd' and the caller quarantines odd_duration. No
// fiscal-quarter number is assigned here; that is a judgment, not a disclosure.
import type {Duration} from './types';

export const DURATION_BANDS:readonly {duration:Exclude<Duration,'INSTANT'>;min:number;max:number}[]=[
 {duration:'3M',min:75,max:105},{duration:'6M',min:165,max:200},{duration:'9M',min:255,max:290},{duration:'12M',min:350,max:380},
];
const DAY=86_400_000;

/** Calendar date YYYY-MM-DD that round-trips (rejects 2023-02-30), as a UTC timestamp; null otherwise. */
export function dateMs(s:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const t=Date.parse(`${s}T00:00:00Z`);
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null;
}
export const isDate=(s:unknown):s is string=>typeof s==='string'&&dateMs(s)!==null;

/** Whole days from start to end (end − start); null when either date is invalid. */
export function daysBetween(start:string,end:string):number|null{
 const a=dateMs(start),b=dateMs(end);
 return a===null||b===null?null:Math.round((b-a)/DAY);
}

export function classifyDuration(start:string|null,end:string):Duration|'odd'{
 if(dateMs(end)===null)return 'odd';
 if(start===null)return 'INSTANT';
 const days=daysBetween(start,end);
 if(days===null||days<=0)return 'odd';
 return DURATION_BANDS.find(b=>days>=b.min&&days<=b.max)?.duration??'odd';
}
```

- [ ] **Step 7: 实现无损数值解码**

```ts
// src/lib/facts/json-numbers.ts
// Lossless numeric decoding (spec §6.2, audit N8/R3-7). JSON.parse would turn a 20-digit integer
// or 1e5 into a double, so scanJsonNumbers first rewrites every numeric literal outside strings
// into {"__num":"<literal>"} and parses that. decodeWithSchema then decodes by field name:
// control fields (cik, fy, code, has_more, report_type, …) → integer JS number; decimal fields
// (val, statement value columns) → canonicalDecimal string, inserted into numeric as text;
// any other numeric field → JS number. Equality of values is always on the canonical form.
export interface NumToken{__num:string}
export const isNumToken=(v:unknown):v is NumToken=>typeof v==='object'&&v!==null&&typeof (v as NumToken).__num==='string'&&Object.keys(v as object).length===1;

const TOKEN=/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
/** JSON.parse with every numeric literal wrapped as {__num:'<original text>'}. Strings are left intact. */
export function scanJsonNumbers(input:Uint8Array|string):unknown{
 const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input);
 const rewritten=text.replace(TOKEN,m=>m.charCodeAt(0)===34?m:`{"__num":"${m}"}`);
 return JSON.parse(rewritten);
}

const DECIMAL=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
const MAX_EXPONENT=1000;
/** Canonical decimal text: no exponent, no leading/trailing zeros, '-0' → '0'. Throws invalid_decimal. */
export function canonicalDecimal(raw:string):string{
 const m=DECIMAL.exec(raw);
 if(!m)throw new Error(`invalid_decimal:${raw.slice(0,40)}`);
 const exp=m[4]===undefined?0:Number(m[4]);
 if(!Number.isSafeInteger(exp)||Math.abs(exp)>MAX_EXPONENT)throw new Error('invalid_decimal:exponent');
 const digits=m[2]+(m[3]??'');
 const point=m[2].length+exp;
 let intPart:string,fracPart:string;
 if(point<=0){intPart='0';fracPart='0'.repeat(-point)+digits;}
 else if(point>=digits.length){intPart=digits+'0'.repeat(point-digits.length);fracPart='';}
 else{intPart=digits.slice(0,point);fracPart=digits.slice(point);}
 intPart=intPart.replace(/^0+(?=\d)/,'');
 fracPart=fracPart.replace(/0+$/,'');
 const zero=intPart==='0'&&fracPart==='';
 return `${m[1]==='-'&&!zero?'-':''}${intPart}${fracPart?`.${fracPart}`:''}`;
}
export const decimalEquals=(a:string,b:string):boolean=>canonicalDecimal(a)===canonicalDecimal(b);

export interface NumberSchema{control:readonly string[];decimal:readonly string[]}
export const EDGAR_NUMBER_SCHEMA:NumberSchema={control:['cik','fy'],decimal:['val']};
/** Tushare control columns; the adapter adds the statement's value columns as `decimal`. */
export const TUSHARE_CONTROL_FIELDS:readonly string[]=['code','has_more','report_type','comp_type','is_calc','update_flag','end_type'];

export function decodeNumber(raw:string,mode:'control'|'decimal'|'number',field:string|null):string|number{
 if(mode==='decimal')return canonicalDecimal(raw);
 const n=Number(raw);
 if(mode==='control'&&!Number.isSafeInteger(n))throw new Error(`invalid_control_field:${field??''}`);
 return n;
}
const modeOf=(schema:NumberSchema,field:string|null)=>field!==null&&schema.decimal.includes(field)?'decimal':field!==null&&schema.control.includes(field)?'control':'number';

/** Walks a scanJsonNumbers result and decodes every NumToken by the name of its nearest enclosing field. */
export function decodeWithSchema(value:unknown,schema:NumberSchema,field:string|null=null):unknown{
 if(isNumToken(value))return decodeNumber(value.__num,modeOf(schema,field),field);
 if(Array.isArray(value))return value.map(v=>decodeWithSchema(v,schema,field));
 if(value!==null&&typeof value==='object'){
  const out:Record<string,unknown>={};
  for(const [k,v] of Object.entries(value as Record<string,unknown>))out[k]=decodeWithSchema(v,schema,k);
  return out;
 }
 return value;
}

/** Positional rows (Tushare items) → objects keyed by `fields`, each cell decoded by its column name. */
export function decodeColumns(fields:string[],items:unknown[][],schema:NumberSchema):Record<string,unknown>[]{
 return items.map(row=>{
  if(row.length!==fields.length)throw new Error(`invalid_row_width:${row.length}`);
  const out:Record<string,unknown>={};
  fields.forEach((f,i)=>{out[f]=decodeWithSchema(row[i],schema,f);});
  return out;
 });
}
```

- [ ] **Step 8: 运行通过**

Run: `npm test -- src/lib/facts/concepts.test.ts src/lib/facts/units.test.ts src/lib/facts/classify.test.ts src/lib/facts/json-numbers.test.ts`
Expected: `Test Files 4 passed, Tests 19 passed`（concepts 4、units 4、classify 3、json-numbers 8）。

- [ ] **Step 9: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 无输出错误。

- [ ] **Step 10: 提交**

```bash
git add src/lib/facts/concepts.ts src/lib/facts/concepts.test.ts src/lib/facts/units.ts src/lib/facts/units.test.ts src/lib/facts/classify.ts src/lib/facts/classify.test.ts src/lib/facts/json-numbers.ts src/lib/facts/json-numbers.test.ts
git commit -m "feat(facts): concept catalogue, unit normalisation, duration bands, lossless JSON numbers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 写入规划 `planFactWrites`（§5.3）

**Files:**
- Create: `src/lib/facts/keys.ts`
- Create: `src/lib/facts/plan.ts`
- Test: `src/lib/facts/plan.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/facts/plan.test.ts
import {describe,it,expect} from 'vitest';
import {planFactWrites} from './plan';
import {sameDayConflictKey} from './keys';
import type {ConflictItem,FactCandidate,FactRow,FilingCandidate} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const F1='10000000-0000-4000-8000-000000000001',F2='10000000-0000-4000-8000-000000000002',F3='10000000-0000-4000-8000-000000000003';
const filings=new Map([['acc-1',F1],['acc-2',F2],['acc-3',F3]]);
const fc=(ref:string,availableDate:string):FilingCandidate=>({sourceRef:ref,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate,url:null});
const filingCandidates=[fc('acc-1','2023-11-03'),fc('acc-2','2023-11-03'),fc('acc-3','2024-11-01')];
const cand=(ref:string,value:string,over:Partial<FactCandidate>={}):FactCandidate=>({concept:'revenue',sourceConcept:'Revenues',statement:'IS',periodStart:'2022-10-01',periodEnd:'2023-09-30',duration:'12M',value,unit:'USD',consolidation:'consolidated',filingRef:ref,rawHash:'h',...over});
let n=0;
const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
const ids=(()=>{let i=0;return ()=>`30000000-0000-4000-8000-${String(++i).padStart(12,'0')}`;})();
const plan=(over:Partial<Parameters<typeof planFactWrites>[0]>)=>planFactWrites({existing:[],openConflicts:[],candidates:[],filingCandidates,filings,issuerId:ISSUER,market:'US',mappingGen:1,mappingVersion:'facts-map/1',newId:ids,...over});
const K={concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'};

describe('planFactWrites',()=>{
 it('inserts a first disclosure as inserted and builds the FactInsert from the filing date',()=>{
  const out=plan({candidates:[cand('acc-1','383285000000')]});
  expect(out.counts).toEqual({inserted:1,versioned:0,duplicates:0,quarantined:0});
  expect(out.inserts).toHaveLength(1);
  expect(out.inserts[0]).toMatchObject({issuer_id:ISSUER,market:'US',filing_id:F1,concept:'revenue',value:'383285000000',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',period_start:'2022-10-01',period_end:'2023-09-30'});
  expect(out.outcomes.get(out.inserts[0].fact_id)).toBe('inserted');
 });
 it('skips candidates whose candidate key exists in any status, but not rows of another generation',()=>{
  const dup=row(F1,'1','2023-11-03',{status:'quarantined'});
  const oldGen=row(F2,'1','2023-11-03',{mapping_gen:0});
  const out=plan({existing:[dup,oldGen],candidates:[cand('acc-1','1'),cand('acc-2','1')]});
  expect(out.duplicates).toHaveLength(1);expect(out.duplicates[0].filingRef).toBe('acc-1');
  expect(out.inserts.map(r=>r.filing_id)).toEqual([F2]);
  expect(out.counts).toEqual({inserted:1,versioned:0,duplicates:1,quarantined:0});
 });
 it('treats a repeated identical candidate as a duplicate and different values for one key as ambiguous_value with no rows',()=>{
  const same=plan({candidates:[cand('acc-1','100'),cand('acc-1','1e2')]});
  expect(same.inserts).toHaveLength(1);expect(same.counts).toEqual({inserted:1,versioned:0,duplicates:1,quarantined:0});
  const amb=plan({candidates:[cand('acc-1','100'),cand('acc-1','101')]});
  expect(amb.inserts).toHaveLength(0);
  expect(amb.ambiguous).toHaveLength(1);
  expect(amb.ambiguous[0]).toMatchObject({naturalKey:`${ISSUER}:US:revenue:2022-10-01:2023-09-30:consolidated:USD:acc-1:1`,key:{issuer_id:ISSUER,market:'US',concept:'revenue',unit:'USD'}});
  expect(amb.ambiguous[0].candidates).toHaveLength(2);
  expect(amb.counts).toEqual({inserted:0,versioned:0,duplicates:0,quarantined:2});
 });
 it('counts versioned when the value differs from the current visible value and inserted when it equals it',()=>{
  const first=row(F1,'100','2023-11-03');
  const same=plan({existing:[first],candidates:[cand('acc-3','100.0')]});
  expect(same.counts).toEqual({inserted:1,versioned:0,duplicates:0,quarantined:0});
  const changed=plan({existing:[first],candidates:[cand('acc-3','101')]});
  expect(changed.counts).toEqual({inserted:0,versioned:1,duplicates:0,quarantined:0});
  // the current value is the last ok row by (available_date, created_at, fact_id); quarantined rows do not count
  const parked=row(F2,'999','2023-11-03',{status:'quarantined'});
  expect(plan({existing:[first,parked],candidates:[cand('acc-3','100')]}).counts.inserted).toBe(1);
 });
 it('parks all same-day candidates with different values and references the ok row that disagrees',()=>{
  const out=plan({candidates:[cand('acc-1','100'),cand('acc-2','200')]});
  expect(out.inserts).toHaveLength(2);
  expect(out.conflicts).toHaveLength(1);
  const c=out.conflicts[0];
  expect(c.naturalKey).toBe(sameDayConflictKey(ISSUER,'US',K,'2023-11-03'));
  expect(c.newFactIds).toEqual(out.inserts.map(r=>r.fact_id));
  expect(c.existingOkFactIds).toEqual([]);
  expect(c.values.map(v=>v.value).sort()).toEqual(['100','200']);
  expect(out.counts).toEqual({inserted:0,versioned:0,duplicates:0,quarantined:2});
  expect(out.quarantinedFactIds).toEqual(c.newFactIds);
  const withOk=plan({existing:[row(F1,'100','2023-11-03')],candidates:[cand('acc-2','200')]});
  expect(withOk.conflicts[0].existingOkFactIds).toHaveLength(1);
  expect(withOk.conflicts[0].newFactIds).toHaveLength(1);
  // same value on the same day from another filing is a normal insert
  expect(plan({existing:[row(F1,'100','2023-11-03')],candidates:[cand('acc-2','100')]}).conflicts).toHaveLength(0);
 });
 it('is independent of arrival order: one run with both, or either filing first, yields the same conflict',()=>{
  const both=plan({candidates:[cand('acc-1','100'),cand('acc-2','200')]});
  const bothReversed=plan({candidates:[cand('acc-2','200'),cand('acc-1','100')]});
  const aFirst=plan({existing:[row(F1,'100','2023-11-03')],candidates:[cand('acc-2','200')]});
  const bFirst=plan({existing:[row(F2,'200','2023-11-03')],candidates:[cand('acc-1','100')]});
  const shape=(p:ReturnType<typeof plan>)=>p.conflicts.map(c=>({key:c.naturalKey,values:c.values.map(v=>`${v.filing}=${v.value}`).sort(),n:c.newFactIds.length+c.existingOkFactIds.length}));
  expect(shape(bothReversed)).toEqual(shape(both));
  expect(shape(aFirst)).toEqual(shape(both));
  expect(shape(bFirst)).toEqual(shape(both));
  for(const p of [both,bothReversed,aFirst,bFirst])expect(p.counts.inserted+p.counts.versioned).toBe(0);
 });
 it('joins an open conflict item for (K, date) whatever the value, instead of creating a new one',()=>{
  const item:ConflictItem={id:'44444444-0000-4000-8000-000000000001',natural_key:sameDayConflictKey(ISSUER,'US',K,'2023-11-03'),fact_ids:['x'],available_date:'2023-11-03',key:{}};
  const out=plan({existing:[row(F1,'100','2023-11-03',{status:'quarantined'})],openConflicts:[item],candidates:[cand('acc-2','100')]});
  expect(out.conflicts).toHaveLength(0);
  expect(out.contestedJoins).toEqual([{itemId:item.id,factIds:[out.inserts[0].fact_id]}]);
  expect(out.counts).toEqual({inserted:0,versioned:0,duplicates:0,quarantined:1});
  // a different date for the same K is not contested
  expect(plan({openConflicts:[item],candidates:[cand('acc-3','100')]}).contestedJoins).toHaveLength(0);
 });
 it('keeps instants, units and consolidation apart in K',()=>{
  const out=plan({candidates:[cand('acc-1','1',{concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT'}),cand('acc-2','2',{concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT',unit:'EUR'})]});
  expect(out.conflicts).toHaveLength(0);expect(out.inserts).toHaveLength(2);
  expect(out.inserts[0].period_start).toBeNull();
 });
 it('throws on a candidate whose filing was not staged',()=>{
  expect(()=>plan({candidates:[cand('acc-9','1')]})).toThrow('unknown_filing:acc-9');
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/facts/plan.test.ts`
Expected: FAIL，`Error: Failed to resolve import "./plan" from "src/lib/facts/plan.test.ts". Does the file exist?`

- [ ] **Step 3: 实现自然键渲染**

```ts
// src/lib/facts/keys.ts
// Natural-key strings (spec §5.2 K, §7.1 quarantine natural_key formats). One place renders
// them so plan, rules, read and the SQL-side items agree byte for byte. A null period_start
// (instants) renders as the empty segment.
import type {Market,Statement} from './types';

export interface FactKey{concept:string;period_start:string|null;period_end:string;consolidation:string;unit:string}
const seg=(s:string|null)=>s??'';

/** K within one issuer and market: concept:period_start:period_end:consolidation:unit. */
export const factKey=(k:FactKey):string=>[k.concept,seg(k.period_start),k.period_end,k.consolidation,k.unit].join(':');
/** Candidate key = K + filing + mapping generation (§5.3 duplicate rule). */
export const candidateKey=(k:FactKey,filingId:string,mappingGen:number):string=>`${factKey(k)}:${filingId}:${mappingGen}`;
/** same_day_conflict natural_key (§7.1). */
export const sameDayConflictKey=(issuer:string,market:Market,k:FactKey,availableDate:string):string=>[issuer,market,factKey(k),availableDate].join(':');
/** ambiguous_value / odd_duration natural_key (§7.1). */
export const ambiguousKey=(issuer:string,market:Market,k:FactKey,sourceRef:string,mappingGen:number):string=>[issuer,market,factKey(k),sourceRef,String(mappingGen)].join(':');
/** identity_bs (BS, period_end only) and identity_gp (IS, period_start:period_end) natural_key (§7.1). */
export const identityKey=(issuer:string,market:Market,statement:Extract<Statement,'IS'|'BS'>,periodStart:string|null,periodEnd:string,unit:string,sourceRef:string,mappingGen:number):string=>
 statement==='BS'?[issuer,market,'BS',periodEnd,unit,sourceRef,String(mappingGen)].join(':'):[issuer,market,'IS',seg(periodStart),periodEnd,unit,sourceRef,String(mappingGen)].join(':');
/** The K components as stored in quarantine payload.key. */
export const keyComponents=(issuer:string,market:Market,k:FactKey):Record<string,string|null>=>({issuer_id:issuer,market,concept:k.concept,period_start:k.period_start,period_end:k.period_end,consolidation:k.consolidation,unit:k.unit});
```

- [ ] **Step 4: 实现规划**

```ts
// src/lib/facts/plan.ts
// Write planning (spec §5.3), pure. Given what the issuer already has (every row of the current
// generation, any status), the open same_day_conflict items and the parsed candidates, decide
// per candidate: duplicate (candidate key = K + filing + mapping_gen already exists, any status),
// ambiguous_value (same candidate key, different values — no row), contested (an open item for
// (K, available_date) exists — row is staged then parked into that item, whatever its value),
// same-day conflict (another value for (K, available_date) among published ok rows or this
// run's candidates — all new rows parked, a new item references them and the ok rows), or a
// plain insert counted as inserted (value equals the current value, or no prior disclosure) /
// versioned (value differs). Conflict detection works on sets, so arrival order cannot change
// the outcome. Values compare in canonical decimal form.
import {randomUUID} from 'node:crypto';
import type {BatchCounts} from '../dq/batches';
import type {ConflictItem,FactCandidate,FactInsert,FactRow,FilingCandidate,Market} from './types';
import {ambiguousKey,candidateKey,factKey,keyComponents,sameDayConflictKey} from './keys';
import type {FactKey} from './keys';
import {canonicalDecimal} from './json-numbers';

export interface PlanInput{
 existing:FactRow[];openConflicts:ConflictItem[];candidates:FactCandidate[];filingCandidates:FilingCandidate[];
 filings:Map<string,string>;issuerId:string;market:Market;mappingGen:number;mappingVersion:string;newId?:()=>string;
}
export interface PlanConflict{naturalKey:string;key:Record<string,string|null>;availableDate:string;newFactIds:string[];existingOkFactIds:string[];values:{filing:string;value:string}[]}
export interface PlanAmbiguous{naturalKey:string;key:Record<string,string|null>;candidates:FactCandidate[]}
export type PlanOutcome='inserted'|'versioned'|'quarantined';
export interface PlanResult{
 inserts:FactInsert[];counts:Pick<BatchCounts,'inserted'|'versioned'|'duplicates'|'quarantined'>;
 duplicates:FactCandidate[];ambiguous:PlanAmbiguous[];conflicts:PlanConflict[];contestedJoins:{itemId:string;factIds:string[]}[];
 /** Outcome per staged fact_id; rows parked later by rules move from inserted/versioned to quarantined. */
 outcomes:Map<string,PlanOutcome>;quarantinedFactIds:string[];
}

const keyOf=(c:FactCandidate):FactKey=>({concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit});
const rowKey=(r:FactRow):FactKey=>({concept:r.concept,period_start:r.period_start,period_end:r.period_end,consolidation:r.consolidation,unit:r.unit});
const seqOrder=(a:FactRow,b:FactRow)=>a.available_date.localeCompare(b.available_date)||a.created_at.localeCompare(b.created_at)||a.fact_id.localeCompare(b.fact_id);

export function planFactWrites(input:PlanInput):PlanResult{
 const {issuerId,market,mappingGen,mappingVersion}=input;const newId=input.newId??randomUUID;
 const dateOf=new Map(input.filingCandidates.map(f=>[f.sourceRef,f.availableDate]));
 const existingKeys=new Set(input.existing.map(r=>candidateKey(rowKey(r),r.filing_id,r.mapping_gen)));
 const okRows=input.existing.filter(r=>r.status==='ok');
 const openByKey=new Map(input.openConflicts.map(i=>[i.natural_key,i]));
 const result:PlanResult={inserts:[],counts:{inserted:0,versioned:0,duplicates:0,quarantined:0},duplicates:[],ambiguous:[],conflicts:[],contestedJoins:[],outcomes:new Map(),quarantinedFactIds:[]};
 // 1. duplicates against the store, then group by candidate key
 const groups=new Map<string,{filingId:string;cands:FactCandidate[]}>();
 for(const c of input.candidates){
  const filingId=input.filings.get(c.filingRef);
  if(!filingId)throw new Error(`unknown_filing:${c.filingRef}`);
  const ck=candidateKey(keyOf(c),filingId,mappingGen);
  if(existingKeys.has(ck)){result.duplicates.push(c);continue;}
  const g=groups.get(ck)??{filingId,cands:[]};g.cands.push(c);groups.set(ck,g);
 }
 // 2. ambiguous values within one candidate key; identical repeats are duplicates
 const accepted:{c:FactCandidate;filingId:string;availableDate:string;value:string}[]=[];
 for(const {filingId,cands} of groups.values()){
  const values=new Set(cands.map(c=>canonicalDecimal(c.value)));
  const k=keyOf(cands[0]);
  if(values.size>1){result.ambiguous.push({naturalKey:ambiguousKey(issuerId,market,k,cands[0].filingRef,mappingGen),key:keyComponents(issuerId,market,k),candidates:cands});result.counts.quarantined+=cands.length;continue;}
  result.duplicates.push(...cands.slice(1));
  const availableDate=dateOf.get(cands[0].filingRef);
  if(!availableDate)throw new Error(`unknown_filing_date:${cands[0].filingRef}`);
  accepted.push({c:cands[0],filingId,availableDate,value:[...values][0]});
 }
 result.counts.duplicates=result.duplicates.length;
 // 3. (K, available_date) groups: contested → join; >1 value among candidates ∪ ok rows → conflict
 const byDay=new Map<string,typeof accepted>();
 for(const a of accepted){const dk=sameDayConflictKey(issuerId,market,keyOf(a.c),a.availableDate);const g=byDay.get(dk)??[];g.push(a);byDay.set(dk,g);}
 const currentByK=new Map<string,FactRow>();
 for(const r of [...okRows].sort(seqOrder))currentByK.set(factKey(rowKey(r)),r);
 for(const [dk,group] of byDay){
  const k=keyOf(group[0].c);const date=group[0].availableDate;
  const inserts=group.map(a=>{
   const row:FactInsert={fact_id:newId(),issuer_id:issuerId,market,filing_id:a.filingId,concept:a.c.concept,source_concept:a.c.sourceConcept,statement:a.c.statement,
    period_start:a.c.periodStart,period_end:a.c.periodEnd,duration:a.c.duration,value:a.value,unit:a.c.unit,consolidation:a.c.consolidation,available_date:date,
    mapping_gen:mappingGen,mapping_version:mappingVersion,raw_hash:a.c.rawHash};
   result.inserts.push(row);return row;
  });
  const park=()=>{for(const r of inserts){result.outcomes.set(r.fact_id,'quarantined');result.quarantinedFactIds.push(r.fact_id);}result.counts.quarantined+=inserts.length;};
  const open=openByKey.get(dk);
  if(open){result.contestedJoins.push({itemId:open.id,factIds:inserts.map(r=>r.fact_id)});park();continue;}
  const sameDayOk=okRows.filter(r=>r.available_date===date&&sameDayConflictKey(issuerId,market,rowKey(r),r.available_date)===dk);
  const values=new Set([...inserts.map(r=>r.value),...sameDayOk.map(r=>canonicalDecimal(r.value))]);
  if(values.size>1){
   result.conflicts.push({naturalKey:dk,key:keyComponents(issuerId,market,k),availableDate:date,newFactIds:inserts.map(r=>r.fact_id),existingOkFactIds:sameDayOk.map(r=>r.fact_id),
    values:[...inserts.map(r=>({filing:r.filing_id,value:r.value})),...sameDayOk.map(r=>({filing:r.filing_id,value:canonicalDecimal(r.value)}))]});
   park();continue;
  }
  const current=currentByK.get(factKey(k));
  for(const r of inserts){
   const outcome:PlanOutcome=current===undefined||canonicalDecimal(current.value)===r.value?'inserted':'versioned';
   result.outcomes.set(r.fact_id,outcome);result.counts[outcome]++;
  }
 }
 return result;
}
```

- [ ] **Step 5: 运行通过**

Run: `npm test -- src/lib/facts/plan.test.ts`
Expected: `Tests 9 passed`。

- [ ] **Step 6: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add src/lib/facts/keys.ts src/lib/facts/plan.ts src/lib/facts/plan.test.ts
git commit -m "feat(facts): natural keys and order-independent write planning (duplicates, ambiguous, same-day conflicts, counts)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 规则与警告汇总、`INFO_CODES` 三码

**Files:**
- Create: `src/lib/facts/rules.ts`
- Modify: `src/lib/dq/batches.ts`（`INFO_CODES`）
- Modify: `src/lib/dq/batches.test.ts`（`INFO_CODES` 断言）
- Test: `src/lib/facts/rules.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/facts/rules.test.ts
import {describe,it,expect} from 'vitest';
import {INFO_CODES,batchStatusFromCounts,emptyCounts} from '../dq/batches';
import {evaluateFactRules,summarizeWarnings,mergeWarnings} from './rules';
import type {FactInsert,FactRow} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const F1='10000000-0000-4000-8000-000000000001',F2='10000000-0000-4000-8000-000000000002';
const sourceRefOf=new Map([[F1,'acc-1'],[F2,'acc-2']]);
let n=0;
const ins=(concept:string,value:string,over:Partial<FactInsert>={}):FactInsert=>({fact_id:`30000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',filing_id:F1,concept,source_concept:concept,statement:'BS',period_start:null,period_end:'2023-09-30',duration:'INSTANT',value,unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...over});
const ok=(concept:string,value:string,over:Partial<FactRow>={}):FactRow=>({...ins(concept,value),run_id:'r',value_text:value,status:'ok',created_at:'2024-01-01T00:00:00Z',...over});
const IS={statement:'IS' as const,period_start:'2022-10-01',duration:'12M' as const};
const run=(newRows:FactInsert[],okRows:FactRow[]=[])=>evaluateFactRules({newRows,okRows,sourceRefOf,issuerId:ISSUER,market:'US',mappingGen:1});

describe('evaluateFactRules',()=>{
 it('passes a balanced sheet and quarantines only the new rows of an unbalanced one',()=>{
  expect(run([ins('total_assets','1000'),ins('liabilities_and_equity','1004')]).quarantine).toEqual([]);
  const assets=ins('total_assets','1000');
  const out=run([assets],[ok('liabilities_and_equity','1100')]);
  expect(out.quarantine).toHaveLength(1);
  expect(out.quarantine[0]).toMatchObject({reason:'identity_bs',rule:'identity_bs',factIds:[assets.fact_id],naturalKey:`${ISSUER}:US:BS:2023-09-30:USD:acc-1:1`,key:{statement:'BS',period_end:'2023-09-30',unit:'USD',source_ref:'acc-1'}});
  expect(out.quarantine[0].detail).toMatchObject({left:1000,right:1100,concepts:['total_assets','liabilities_and_equity']});
 });
 it('falls back to liabilities + equity_total and skips the check when inputs are missing or in another unit',()=>{
  const bad=run([ins('total_assets','1000'),ins('total_liabilities','600'),ins('equity_total','300')]);
  expect(bad.quarantine.map(q=>q.reason)).toEqual(['identity_bs']);
  expect(bad.quarantine[0].factIds).toHaveLength(3);
  expect(run([ins('total_assets','1000'),ins('total_liabilities','600')]).quarantine).toEqual([]);
  expect(run([ins('total_assets','1000')],[ok('liabilities_and_equity','1100',{unit:'EUR'})]).quarantine).toEqual([]);
  // the identity is checked inside one filing: an ok row from another filing is not an input
  expect(run([ins('total_assets','1000')],[ok('liabilities_and_equity','1100',{filing_id:F2})]).quarantine).toEqual([]);
 });
 it('checks gross profit only when disclosed and names identity_gp with the IS key',()=>{
  const gp=ins('gross_profit','40',IS);
  const out=run([gp,ins('revenue','100',IS),ins('cost_of_revenue','70',IS)]);
  expect(out.quarantine).toHaveLength(1);
  expect(out.quarantine[0]).toMatchObject({reason:'identity_gp',naturalKey:`${ISSUER}:US:IS:2022-10-01:2023-09-30:USD:acc-1:1`,factIds:[gp.fact_id,expect.any(String),expect.any(String)]});
  expect(run([ins('gross_profit','30',IS),ins('revenue','100',IS),ins('cost_of_revenue','70',IS)]).quarantine).toEqual([]);
  expect(run([ins('revenue','100',IS),ins('cost_of_revenue','70',IS)]).quarantine).toEqual([]);
 });
 it('does not quarantine when every input of a failing identity is an old ok row',()=>{
  expect(run([ins('cash','5')],[ok('total_assets','1000'),ok('liabilities_and_equity','1100')]).quarantine).toEqual([]);
 });
 it('collects warnings per rule without quarantining',()=>{
  const out=run([ins('revenue','100',IS),ins('cost_of_revenue','250',IS)]);
  expect(out.quarantine).toEqual([]);
  expect(out.warnings.get('gross_margin_range')).toEqual([`${ISSUER}:US:IS:2022-10-01:2023-09-30:USD:acc-1:1`]);
  expect(out.warnings.get('revenue_jump')).toEqual([]);
  const prior=ok('revenue','10',{...IS,filing_id:F2,period_start:'2021-10-01',period_end:'2022-09-30',is_current:true});
  const jump=run([ins('revenue','1000',IS)],[prior]);
  expect(jump.warnings.get('revenue_jump')).toHaveLength(1);
  expect(run([ins('revenue','100',IS)],[prior]).warnings.get('revenue_jump')).toEqual([]);
  expect(run([ins('revenue','1000',IS)],[prior,ok('revenue','20',{...IS,filing_id:F1,period_start:'2021-10-01',period_end:'2022-09-30'})]).warnings.get('revenue_jump')).toEqual([]); // ambiguous prior → no warning
 });
 it('summarises warnings as one informational batch error per rule and merges across issuers',()=>{
  const a=new Map([['gross_margin_range',['k1']],['revenue_jump',[]]]);
  const merged=mergeWarnings(a,new Map([['gross_margin_range',['k2']],['revenue_jump',['k3']]]));
  const errors=summarizeWarnings(merged);
  expect(errors).toEqual([
   {code:'rule_warning_summary',key:'gross_margin_range',message:JSON.stringify({count:2,keys:['k1','k2']})},
   {code:'rule_warning_summary',key:'revenue_jump',message:JSON.stringify({count:1,keys:['k3']})},
  ]);
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit']);
  expect(batchStatusFromCounts({...emptyCounts(),inserted:1},errors)).toBe('success');
  expect(summarizeWarnings(new Map([['x',[]]]))).toEqual([]);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/facts/rules.test.ts src/lib/dq/batches.test.ts`
Expected: `rules.test.ts` FAIL（`Failed to resolve import "./rules"`）；`batches.test.ts` 仍 PASS（尚未改断言）。

- [ ] **Step 3: 改 `INFO_CODES` 及其测试**

`src/lib/dq/batches.ts` 第 48 行：

```ts
export const INFO_CODES=['skipped_summary','relink'] as const;
```
改为
```ts
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit'] as const;
```
并把该行上方注释补一句：`rule_warning_summary`（整批每条规则一条，§7.2）、`coverage_summary`（Tushare 覆盖摘要，§6.3）、`deadline_hit`（截止后未开始的发行人数，§6.1）同为信息码。

`src/lib/dq/batches.test.ts` 第 16 行：

```ts
  expect(INFO_CODES).toEqual(['skipped_summary','relink']);
```
改为
```ts
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit']);
```

- [ ] **Step 4: 实现规则**

```ts
// src/lib/facts/rules.ts
// Statement rules on a sync run (spec §7.1 identity_bs / identity_gp, §7.2 warnings). Groups are
// the (filing, period_start, period_end, unit) cells that contain at least one new row; inputs are
// the new rows plus the current-generation ok rows of that same cell, so an identity is always
// checked inside one report version. Only new rows are quarantined. Rule ids and tolerances are
// the spec's; the math reuses src/lib/dq/rules.ts (doubles, 15 significant digits).
import {identityRule,jumpRule,rangeRule} from '../dq/rules';
import type {RuleResult} from '../dq/rules';
import type {BatchError} from '../dq/batches';
import type {FactInsert,FactRow,Market} from './types';
import {identityKey} from './keys';
import {daysBetween} from './classify';

export type AnyFactRow=FactInsert|FactRow;
export interface FactRulesInput{newRows:FactInsert[];okRows:FactRow[];sourceRefOf:Map<string,string>;issuerId:string;market:Market;mappingGen:number}
export interface RuleQuarantine{reason:'identity_bs'|'identity_gp';naturalKey:string;key:Record<string,string|null>;factIds:string[];rule:string;detail:Record<string,unknown>}
export interface FactRulesResult{quarantine:RuleQuarantine[];warnings:Map<string,string[]>}
export const IDENTITY_TOLERANCE=0.005;
export const GROSS_MARGIN_RANGE:[number,number]=[-1,1];
export const REVENUE_MAX_JUMP=10;
export const WARNING_RULES=['gross_margin_range','revenue_jump'] as const;
export const MAX_WARNING_KEYS=20;

const cell=(r:AnyFactRow)=>`${r.filing_id}|${r.period_start??''}|${r.period_end}|${r.unit}`;
const num=(r:AnyFactRow|undefined)=>r===undefined?undefined:Number(r.value);

export function evaluateFactRules(input:FactRulesInput):FactRulesResult{
 const {issuerId,market,mappingGen,sourceRefOf}=input;
 const out:FactRulesResult={quarantine:[],warnings:new Map(WARNING_RULES.map(r=>[r,[]]))};
 const groups=new Map<string,{rows:Map<string,AnyFactRow>;fresh:Set<string>;sample:AnyFactRow}>();
 for(const r of input.newRows){const g=groups.get(cell(r))??{rows:new Map(),fresh:new Set(),sample:r};g.rows.set(r.concept,r);g.fresh.add(r.concept);groups.set(cell(r),g);}
 for(const r of input.okRows){const g=groups.get(cell(r));if(g&&!g.rows.has(r.concept))g.rows.set(r.concept,r);}
 for(const g of groups.values()){
  const s=g.sample;const sourceRef=sourceRefOf.get(s.filing_id)??s.filing_id;
  const get=(c:string)=>g.rows.get(c);
  const park=(reason:RuleQuarantine['reason'],statement:'IS'|'BS',res:RuleResult,inputs:string[])=>{
   const factIds=inputs.filter(c=>g.fresh.has(c)).map(c=>g.rows.get(c)!.fact_id);
   if(factIds.length===0)return;
   out.quarantine.push({reason,naturalKey:identityKey(issuerId,market,statement,s.period_start,s.period_end,s.unit,sourceRef,mappingGen),
    key:{issuer_id:issuerId,market,statement,period_start:s.period_start,period_end:s.period_end,unit:s.unit,filing_id:s.filing_id,source_ref:sourceRef},
    factIds,rule:res.ruleId,detail:{...(res.detail??{}),concepts:inputs}});
  };
  // identity_bs: assets = liabilities_and_equity, else assets = liabilities + equity_total
  const assets=num(get('total_assets'));
  if(assets!==undefined){
   const le=num(get('liabilities_and_equity'));const liab=num(get('total_liabilities'));const eq=num(get('equity_total'));
   if(le!==undefined){const res=identityRule('identity_bs',assets,le,IDENTITY_TOLERANCE);if(!res.passed)park('identity_bs','BS',res,['total_assets','liabilities_and_equity']);}
   else if(liab!==undefined&&eq!==undefined){const res=identityRule('identity_bs',assets,liab+eq,IDENTITY_TOLERANCE);if(!res.passed)park('identity_bs','BS',res,['total_assets','total_liabilities','equity_total']);}
  }
  // identity_gp: gross_profit = revenue − cost_of_revenue, only when gross_profit is disclosed
  const gp=num(get('gross_profit'));const rev=num(get('revenue'));const cost=num(get('cost_of_revenue'));
  if(gp!==undefined&&rev!==undefined&&cost!==undefined){
   const res=identityRule('identity_gp',gp,rev-cost,IDENTITY_TOLERANCE);
   if(!res.passed)park('identity_gp','IS',res,['gross_profit','revenue','cost_of_revenue']);
  }
  // warnings (never quarantine)
  const warnKey=identityKey(issuerId,market,'IS',s.period_start,s.period_end,s.unit,sourceRef,mappingGen);
  if(rev!==undefined&&rev!==0&&(gp!==undefined||cost!==undefined)){
   const margin=(gp??rev-(cost as number))/rev;
   if(!rangeRule('gross_margin_range',margin,GROSS_MARGIN_RANGE[0],GROSS_MARGIN_RANGE[1]).passed)out.warnings.get('gross_margin_range')!.push(warnKey);
  }
  const revRow=get('revenue');
  if(revRow!==undefined&&g.fresh.has('revenue')&&revRow.duration!=='INSTANT'){
   const prior=input.okRows.filter(r=>r.concept==='revenue'&&r.unit===revRow.unit&&r.duration===revRow.duration&&r.is_current!==false&&(()=>{const d=daysBetween(r.period_end,revRow.period_end);return d!==null&&d>=350&&d<=380;})());
   const prev=new Set(prior.map(r=>r.value));
   if(prev.size===1&&!jumpRule('revenue_jump',Number(revRow.value),Number([...prev][0]),REVENUE_MAX_JUMP).passed)out.warnings.get('revenue_jump')!.push(warnKey);
  }
 }
 return out;
}

/** Appends `from` into `into` rule by rule (batch-level accumulation across issuers). */
export function mergeWarnings(into:Map<string,string[]>,from:Map<string,string[]>):Map<string,string[]>{
 for(const [rule,keys] of from){const list=into.get(rule)??[];list.push(...keys);into.set(rule,list);}
 return into;
}

/** One rule_warning_summary entry per rule that fired (INFO code: never degrades the batch). */
export function summarizeWarnings(warnings:Map<string,string[]>):BatchError[]{
 return [...warnings].filter(([,keys])=>keys.length>0).map(([rule,keys])=>({code:'rule_warning_summary',key:rule,message:JSON.stringify({count:keys.length,keys:keys.slice(0,MAX_WARNING_KEYS)})}));
}
```

- [ ] **Step 5: 运行通过**

Run: `npm test -- src/lib/facts/rules.test.ts src/lib/dq/batches.test.ts`
Expected: `rules.test.ts` 6 passed；`batches.test.ts` 12 passed。

- [ ] **Step 6: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add src/lib/facts/rules.ts src/lib/facts/rules.test.ts src/lib/dq/batches.ts src/lib/dq/batches.test.ts
git commit -m "feat(facts): identity rules and warning summaries; INFO_CODES += rule_warning_summary, coverage_summary, deadline_hit" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 读取语义参考实现 `sequencesOf`（§5.2）

**Files:**
- Create: `src/lib/facts/read.ts`
- Test: `src/lib/facts/read.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/facts/read.test.ts
import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {factInsert,filingInsert} from './db-contract';
import {memoryFactsDb} from './memory-facts-db';
import {sequencesOf,currentFacts} from './read';
import type {FactRow} from './types';

const F1='10000000-0000-4000-8000-000000000001',F2='10000000-0000-4000-8000-000000000002',F3='10000000-0000-4000-8000-000000000003';
let n=0;
const row=(filingId:string,value:string,availableDate:string,over:Partial<FactRow>={}):FactRow=>({fact_id:`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:'i',market:'US',filing_id:filingId,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:availableDate,mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:`2024-01-01T00:00:00.${String(n).padStart(3,'0')}Z`,...over});
const filings=new Map([[F1,1],[F2,1],[F3,1]]);
// AAPL FY2023 revenue: 10-K filed 2023-11-03, repeated unchanged in the FY2024 10-K filed 2024-11-01.
const fy23=row(F1,'383285000000','2023-11-03');
const fy24=row(F2,'383285000000','2024-11-01');

describe('sequencesOf',()=>{
 it('replays the disclosure visible at asOf: the 2023 10-K row at 2024-06-30, seq 2 unrevised at 2025-06-30',()=>{
  const at2024=sequencesOf([fy23,fy24],{asOf:'2024-06-30',filings,history:true});
  expect(at2024).toHaveLength(1);
  expect(at2024[0]).toMatchObject({fact_id:fy23.fact_id,filing_id:F1,disclosure_seq:1,is_current:true,is_revision:false});
  const at2025=sequencesOf([fy23,fy24],{asOf:'2025-06-30',filings,history:true});
  expect(at2025.map(r=>[r.filing_id,r.disclosure_seq,r.is_current,r.is_revision])).toEqual([[F1,1,false,false],[F2,2,true,false]]);
  expect(currentFacts([fy23,fy24],{asOf:'2025-06-30',filings}).map(r=>r.fact_id)).toEqual([fy24.fact_id]);
 });
 it('marks a changed value as a revision using canonical decimal comparison',()=>{
  const revised=row(F3,'3.83286e11','2025-02-01');
  const same=row(F3,'383285000000.00','2025-02-01');
  expect(sequencesOf([fy23,revised],{asOf:'2025-12-31',filings,history:true}).map(r=>r.is_revision)).toEqual([false,true]);
  expect(sequencesOf([fy23,same],{asOf:'2025-12-31',filings,history:true}).map(r=>r.is_revision)).toEqual([false,false]);
 });
 it('drops rows whose mapping_gen is not the filing\'s activated generation, and rows of unknown filings',()=>{
  const old=row(F1,'1','2023-11-03',{mapping_gen:0});
  const orphan=row('10000000-0000-4000-8000-00000000dead','1','2023-11-03');
  expect(sequencesOf([old,orphan,fy23],{asOf:'2030-01-01',filings,history:true}).map(r=>r.fact_id)).toEqual([fy23.fact_id]);
  expect(sequencesOf([fy23],{asOf:'2030-01-01',filings:new Map([[F1,2]]),history:true})).toEqual([]);
 });
 it('hides staged and quarantined rows unless includeNonOk, which lists them OUTSIDE the sequence (no seq, never current) like the SQL window (round-1 #14)',()=>{
  const parked=row(F2,'1','2024-11-01',{status:'quarantined'});
  const staged=row(F3,'2','2025-01-01',{status:'staged'});
  expect(sequencesOf([fy23,parked,staged],{asOf:'2030-01-01',filings,history:true}).map(r=>r.fact_id)).toEqual([fy23.fact_id]);
  const all=sequencesOf([fy23,parked,staged],{asOf:'2030-01-01',filings,history:true,includeNonOk:true});
  expect(all.map(r=>[r.status,r.disclosure_seq??null,r.is_current,r.is_revision])).toEqual([['ok',1,true,false],['quarantined',null,false,false],['staged',null,false,false]]);
  expect(sequencesOf([fy23,parked,staged],{asOf:'2030-01-01',filings,history:false,includeNonOk:true}).map(r=>r.fact_id)).toEqual([fy23.fact_id]);
 });
 it('agrees with memoryFactsDb.readFacts on one fixture: ok rows sequence, quarantined rows listed without sequence fields (round-1 #14)',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
  const disclose=async(available:string,value:string)=>{const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss,{availableDate:available});await db.stageFilings(run,[f]);const x=factInsert(iss,f,{value});await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);return x.fact_id;};
  await disclose('2024-02-01','100');await disclose('2024-05-01','100');await disclose('2024-08-01','120');
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss,{availableDate:'2024-09-01'});await db.stageFilings(run,[f]);
  const qd=factInsert(iss,f,{value:'121'});await db.stageFacts(run,[qd]);
  const itemId=randomUUID();
  await db.tables.insert('dq_quarantine',{id:itemId,dataset:'facts.us',table_name:'financial_facts',natural_key:`${iss}:US:IS:x`,reason_code:'identity_gp',status:'open',payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run},detail:{},batch_id:b,resolved_by:null,resolved_at:null,created_at:'2026-01-01T00:00:00.000Z'});
  await db.quarantineFacts(run,[qd.fact_id],itemId);await db.publishRun(run,[f.filing_id]);
  const gens=new Map(db.filings().map(g=>[g.filing_id,g.mapping_gen]));
  const shape=(rs:FactRow[])=>rs.map(r=>[r.fact_id,r.status,r.disclosure_seq??null,r.is_current,r.is_revision]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  for(const history of [true,false]){
   const fromDb=(await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history,includeNonOk:true})).rows;
   const pure=sequencesOf(db.facts(),{asOf:'2030-01-01',filings:gens,history,includeNonOk:true,concepts:['revenue']});
   expect(shape(pure)).toEqual(shape(fromDb));
   expect(pure.filter(r=>r.status==='ok').map(r=>r.disclosure_seq)).toEqual(history?[1,2,3]:[3]);
   expect(pure.filter(r=>r.status!=='ok').map(r=>[r.disclosure_seq??null,r.is_current])).toEqual(history?[[null,false]]:[]);
  }
 });
 it('orders ties by created_at then fact_id and keys by concept, period_end, period_start, unit',()=>{
  const b=row(F2,'2','2023-11-03',{created_at:'2024-01-01T00:00:00.000Z',fact_id:'20000000-0000-4000-8000-00000000000b'});
  const a=row(F1,'1','2023-11-03',{created_at:'2024-01-01T00:00:00.000Z',fact_id:'20000000-0000-4000-8000-00000000000a'});
  const cash=row(F1,'9','2023-11-03',{concept:'cash',statement:'BS',period_start:null,duration:'INSTANT'});
  const out=sequencesOf([b,cash,a],{asOf:'2030-01-01',filings,history:true});
  expect(out.map(r=>[r.concept,r.fact_id,r.disclosure_seq])).toEqual([['cash',cash.fact_id,1],['revenue',a.fact_id,1],['revenue',b.fact_id,2]]);
 });
 it('filters by concepts and period_end window',()=>{
  const cash=row(F1,'9','2023-11-03',{concept:'cash',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2022-09-30'});
  expect(sequencesOf([fy23,cash],{asOf:'2030-01-01',filings,history:true,concepts:['cash']}).map(r=>r.concept)).toEqual(['cash']);
  expect(sequencesOf([fy23,cash],{asOf:'2030-01-01',filings,history:true,from:'2023-01-01'}).map(r=>r.concept)).toEqual(['revenue']);
  expect(sequencesOf([fy23,cash],{asOf:'2030-01-01',filings,history:true,to:'2022-12-31'}).map(r=>r.concept)).toEqual(['cash']);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/facts/read.test.ts`
Expected: FAIL，`Failed to resolve import "./read"`。

- [ ] **Step 3: 实现**

```ts
// src/lib/facts/read.ts
// Reference read semantics of read_facts (spec §4.6, §5.2), pure, for derive and tests. Per
// filing only rows whose mapping_gen equals the filing's activated mapping_gen count; rows
// visible at asOf (available_date <= asOf) with status ok form one sequence per K ordered by
// (available_date, created_at, fact_id); disclosure_seq is the position, is_current marks the
// last row, is_revision a value change against the previous row in canonical decimal form.
// includeNonOk adds staged/quarantined rows OUTSIDE the sequences (disclosure_seq undefined,
// is_current false, is_revision false) exactly like the SQL window and memoryFactsDb (audit
// round-1 #14); history=false keeps current rows only, so non-ok rows never appear there.
import type {FactRow} from './types';
import {factKey} from './keys';
import {canonicalDecimal} from './json-numbers';

export interface SequenceOptions{
 asOf:string;
 /** filing_id → activated mapping_gen (filings.mapping_gen); rows of unknown filings are dropped. */
 filings:Map<string,number>;
 includeNonOk?:boolean;history?:boolean;concepts?:readonly string[];from?:string;to?:string;
}

const order=(a:FactRow,b:FactRow)=>a.available_date.localeCompare(b.available_date)||a.created_at.localeCompare(b.created_at)||a.fact_id.localeCompare(b.fact_id);
const keyOrder=(a:FactRow,b:FactRow)=>a.concept.localeCompare(b.concept)||a.period_end.localeCompare(b.period_end)||(a.period_start??'').localeCompare(b.period_start??'')||a.unit.localeCompare(b.unit)||a.consolidation.localeCompare(b.consolidation);

export function sequencesOf(rows:FactRow[],opts:SequenceOptions):FactRow[]{
 const concepts=opts.concepts?new Set(opts.concepts):null;
 const visible=rows.filter(r=>opts.filings.get(r.filing_id)===r.mapping_gen&&r.available_date<=opts.asOf&&(opts.includeNonOk||r.status==='ok')
  &&(concepts===null||concepts.has(r.concept))&&(opts.from===undefined||r.period_end>=opts.from)&&(opts.to===undefined||r.period_end<=opts.to));
 const byKey=new Map<string,FactRow[]>();
 for(const r of visible)if(r.status==='ok'){const k=factKey(r);const g=byKey.get(k)??[];g.push(r);byKey.set(k,g);}
 const out:FactRow[]=[];
 for(const g of byKey.values()){
  g.sort(order);
  g.forEach((r,i)=>{
   const prev=i>0?g[i-1]:null;
   out.push({...r,disclosure_seq:i+1,is_current:i===g.length-1,is_revision:prev!==null&&canonicalDecimal(prev.value)!==canonicalDecimal(r.value)});
  });
 }
 for(const r of visible)if(r.status!=='ok')out.push({...r,disclosure_seq:undefined,is_current:false,is_revision:false});
 const kept=opts.history?out:out.filter(r=>r.is_current);
 return kept.sort((a,b)=>keyOrder(a,b)||order(a,b));
}

/** Current ok row per K at asOf (history=false, ok only). */
export const currentFacts=(rows:FactRow[],opts:Omit<SequenceOptions,'history'|'includeNonOk'>):FactRow[]=>sequencesOf(rows,{...opts,history:false,includeNonOk:false});
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/facts/read.test.ts`
Expected: `Tests 7 passed`。

- [ ] **Step 5: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 无错误。Part A 的 `memory-facts-db.ts::readFacts` 保留自己的实现，**不**改为调用本文件：它还要复刻 SQL 的键排序（`period_end desc, concept, period_start desc nulls last, consolidation, unit`）、`limit`（自然键数）与 10,000 行上限，而 `sequencesOf` 只负责序列语义、输出按 `(concept, period_end, period_start, unit, consolidation)` 升序，供 `derive.test.ts`、`read.test.ts` 与离线断言使用。三者（SQL 窗口、内存 `readFacts`、`sequencesOf`）对同一输入给出相同的 `disclosure_seq / is_current / is_revision`，且非 ok 行一律不进序列（`disclosure_seq` 空、`is_current=false`）；`read.test.ts` 的最后一个用例把同一组行同时喂给内存库与 `sequencesOf` 做逐行比对（审计 round-1 #14）。

- [ ] **Step 6: 提交**

```bash
git add src/lib/facts/read.ts src/lib/facts/read.test.ts
git commit -m "feat(facts): reference read semantics (generation filter, disclosure sequences, revisions)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 快照存储与同步核心（§4.7、§6.1、§10）

**Files:**
- Create: `src/lib/facts/errors.ts`
- Create: `src/lib/facts/snapshot-store.ts`
- Create: `src/lib/facts/sync.ts`
- Test: `src/lib/facts/snapshot-store.test.ts`、`src/lib/facts/sync.test.ts`
- 依赖（本任务不创建）：`src/lib/facts/scope.ts`（Task 14，导出 `reconcileScope(deps:{tables:TableClient;db:Pick<FactsDb,'reconcileScope'>},market:Market,opts?:{today?:string}):Promise<ScopeReconcileResult>`）、`src/lib/facts/derive.ts`（Task 15，导出 `materialize(db:Pick<FactsDb,'readFacts'|'replaceMetrics'>,issuer:string,market:Market,opts?:{today?:string}):Promise<MaterializeResult>` 与 `FORMULA_VERSION='facts-derive/1.0'`）、`src/lib/facts/memory-facts-db.ts`（Task 2，`memoryFactsDb(tables?:TableClient):MemoryFactsDb`）。

- [ ] **Step 1: 写失败测试（快照存储）**

```ts
// src/lib/facts/snapshot-store.test.ts
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {memorySnapshotStore,supabaseSnapshotStore,snapshotPath,metaPath,SNAPSHOT_BUCKET} from './snapshot-store';
import type {RawSnapshot} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const snap=(text:string):RawSnapshot=>({bytes:new TextEncoder().encode(text),sha256:createHash('sha256').update(text).digest('hex'),meta:{source:'edgar',url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',fetched_at:'2026-11-04T00:00:00.000Z',http_status:200}});
const budget=()=>({remainingMs:()=>60_000,signal:new AbortController().signal});
const aborted=()=>{const c=new AbortController();c.abort();return {remainingMs:()=>0,signal:c.signal};};

describe('snapshot paths',()=>{
 it('places the body under {source}/{issuer}/{sha256}.json with a .meta.json sidecar',()=>{
  const s=snap('{}');
  expect(snapshotPath('edgar',ISSUER,s.sha256)).toBe(`edgar/${ISSUER}/${s.sha256}.json`);
  expect(metaPath(snapshotPath('tushare',ISSUER,s.sha256))).toBe(`tushare/${ISSUER}/${s.sha256}.meta.json`);
 });
});

describe('memorySnapshotStore',()=>{
 it('stores once, answers exists on a repeat, keeps the sidecar and refuses bad paths or an exhausted budget',async()=>{
  const store=memorySnapshotStore();const s=snap('{"a":1}');const path=snapshotPath('edgar',ISSUER,s.sha256);
  expect(await store.put(s,path,budget())).toBe('stored');
  expect(await store.put(s,path,budget())).toBe('exists');
  expect(store.objects.get(path)).toEqual(s.bytes);
  expect(JSON.parse(store.objects.get(metaPath(path)) as string)).toMatchObject({source:'edgar',sha256:s.sha256,bytes:7,http_status:200});
  await expect(store.put(s,'edgar/x.json',budget())).rejects.toThrow('snapshot_upload_failed');
  await expect(store.put(snap('{"b":2}'),snapshotPath('edgar',ISSUER,'f'.repeat(64)),aborted())).rejects.toThrow('budget_exhausted');
 });
});

describe('supabaseSnapshotStore',()=>{
 const fake=(upload:(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>)=>{const from=vi.fn(()=>({upload}));return {admin:{storage:{from}} as never,from};};
 it('uploads body then sidecar with upsert:false into disclosure-raw',async()=>{
  const upload=vi.fn<(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>>(async()=>({error:null}));const {admin,from}=fake(upload);
  const s=snap('{"a":1}');const path=snapshotPath('edgar',ISSUER,s.sha256);
  expect(await supabaseSnapshotStore(admin).put(s,path,budget())).toBe('stored');
  expect(from).toHaveBeenCalledWith(SNAPSHOT_BUCKET);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0]).toEqual([path,s.bytes,{contentType:'application/json',upsert:false}]);
  expect(upload.mock.calls[1][0]).toBe(metaPath(path));
  expect(JSON.parse(upload.mock.calls[1][1] as string)).not.toHaveProperty('token');
 });
 it('maps 409 / already exists to exists and any other error to snapshot_upload_failed',async()=>{
  const s=snap('{}');const path=snapshotPath('tushare',ISSUER,s.sha256);
  const dup=fake(async()=>({error:{statusCode:'409',message:'The resource already exists'}}));
  expect(await supabaseSnapshotStore(dup.admin).put(s,path,budget())).toBe('exists');
  const dupMsg=fake(async()=>({error:{message:'Duplicate'}}));
  expect(await supabaseSnapshotStore(dupMsg.admin).put(s,path,budget())).toBe('exists');
  const down=fake(async()=>({error:{statusCode:500,message:'storage down'}}));
  await expect(supabaseSnapshotStore(down.admin).put(s,path,budget())).rejects.toThrow('snapshot_upload_failed: storage down');
 });
 it('rejects without waiting for a hung upload once the budget aborts',async()=>{
  const hung=fake(()=>new Promise(()=>{}));const c=new AbortController();
  const p=supabaseSnapshotStore(hung.admin).put(snap('{}'),snapshotPath('edgar',ISSUER,'a'.repeat(64)),{remainingMs:()=>1,signal:c.signal});
  c.abort();
  await expect(p).rejects.toThrow('budget_exhausted');
 });
});
```

- [ ] **Step 2: 写失败测试（同步核心；`memoryFactsDb` 上的假抓取器）**

```ts
// src/lib/facts/sync.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';

const mocks=vi.hoisted(()=>({reconcileScope:vi.fn(),scopeRowFor:vi.fn(),materialize:vi.fn()}));
vi.mock('./scope',()=>({reconcileScope:mocks.reconcileScope,scopeRowFor:mocks.scopeRowFor}));
vi.mock('./derive',()=>({materialize:mocks.materialize,FORMULA_VERSION:'facts-derive/1.0'}));

import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from './memory-facts-db';
import {memorySnapshotStore} from './snapshot-store';
import {runFactsSync,makeBudget,resolveCodeVersion,LEASE_TTL_S,MAX_LINK_ATTEMPTS} from './sync';
import type {SyncDeps} from './sync';
import {SyncError} from './errors';
import {FactsDbError} from './types';
import type {Duration,FactCandidate,FactsDb,FilingCandidate,Market,ParseResult,RawSnapshot} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001',ISSUER2='00000000-0000-4000-8000-000000000002';
const NOW=new Date('2027-03-01T08:00:00.000Z');   // later than any real clock during the test so new scope rows (next_due_at = now()) are due
const snap=(text:string):RawSnapshot=>({bytes:new TextEncoder().encode(text),sha256:createHash('sha256').update(text).digest('hex'),meta:{source:'edgar',fetched_at:NOW.toISOString(),http_status:200}});
const filing=(ref:string,availableDate:string,over:Partial<FilingCandidate>={}):FilingCandidate=>({sourceRef:ref,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate,url:null,...over});
const cand=(ref:string,concept:string,value:string,over:Partial<FactCandidate>={}):FactCandidate=>({concept,sourceConcept:concept,statement:'IS',periodStart:'2022-10-01',periodEnd:'2023-09-30',duration:'12M' as Duration,value,unit:'USD',consolidation:'consolidated',filingRef:ref,rawHash:'h',...over});
const bs=(ref:string,concept:string,value:string):FactCandidate=>cand(ref,concept,value,{statement:'BS',periodStart:null,duration:'INSTANT'});
const parsed=(filings:FilingCandidate[],candidates:FactCandidate[],extra:Partial<ParseResult>={}):ParseResult=>({candidates,filings,skipped:[],ambiguous:[],oddDuration:[],missingAvailableDate:[],...extra});
const FY23=parsed([filing('acc-1','2023-11-03')],[cand('acc-1','revenue','383285000000'),cand('acc-1','net_income_parent','96995000000')]);

function harness(parse:ParseResult|(()=>ParseResult)=FY23,over:Partial<SyncDeps>={},scopes:{issuer_id:string;fetch_key:string;market?:Market}[]=[{issuer_id:ISSUER,fetch_key:'0000320193'}]){
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id']});
 const db=memoryFactsDb(tables);const storage=memorySnapshotStore();
 for(const s of scopes)void tables.insert('issuers',{issuer_id:s.issuer_id,status:'active'});
 const deps:SyncDeps={db,tables,storage,fetchUs:async()=>snap('{"facts":{}}'),fetchCn:async()=>[snap('{"code":0}')],parseUs:()=>typeof parse==='function'?parse():parse,parseCn:()=>typeof parse==='function'?parse():parse,now:()=>NOW,deadline:null,codeVersion:'a'.repeat(40),...over};
 mocks.reconcileScope.mockImplementation(async(d:{db:FactsDb},market:Market)=>d.db.reconcileScope(market,scopes.filter(s=>(s.market??'US')===market).map(s=>({issuer_id:s.issuer_id,reasons:['sp500'],priority:10,fetch_key:s.fetch_key}))));
 // scopeRowFor (Task 14) answers for the issuers this harness knows; anyone else is unresolvable.
 mocks.scopeRowFor.mockImplementation(async(_tables:unknown,market:Market,issuerId:string)=>{const s=scopes.find(x=>x.issuer_id===issuerId&&(x.market??'US')===market);return s?{issuer_id:issuerId,reasons:['explicit'],priority:10,fetch_key:s.fetch_key}:null;});
 return {tables,db,storage,deps};
}
const CN_REF='600519.SH:20231231:1:20240403';
const cnFiling=()=>filing(CN_REF,'2024-04-03',{market:'CN',source:'tushare',origin:'sse',formType:'annual',periodEnd:'2023-12-31'});
const cnRevenue=()=>cand(CN_REF,'revenue','100',{periodStart:'2023-01-01',periodEnd:'2023-12-31',unit:'CNY'});
const CN_SCOPE=[{issuer_id:ISSUER,fetch_key:'600519.SH',market:'CN' as Market}];
const run=(deps:SyncDeps,over:Partial<Parameters<typeof runFactsSync>[1]>={})=>runFactsSync(deps,{market:'US',limit:25,dryRun:false,triggeredBy:'script',...over});
const current=(db:FactsDb,asOf=NOW.toISOString().slice(0,10))=>db.readFacts(ISSUER,'US',{concepts:['revenue','net_income_parent','total_assets','liabilities_and_equity'],asOf,history:false});

beforeEach(()=>{vi.clearAllMocks();mocks.materialize.mockResolvedValue(0);});

describe('runFactsSync — lifecycle',()=>{
 it('publishes a run: facts visible, filing generation activated, snapshot stored, batch and freshness ok, lease released',async()=>{
  const {tables,db,storage,deps}=harness();
  const r=await run(deps);
  expect(r.status).toBe('success');
  expect(r.counts).toMatchObject({fetched:2,inserted:2,versioned:0,duplicates:0,quarantined:0,failed:0});
  expect(r.detail).toEqual({attempted:1,published:1,failed:0,skipped:0,idle:false});
  expect(r.issuers[0]).toMatchObject({issuerId:ISSUER,fetchKey:'0000320193',outcome:'published',snapshotSha256:[snap('{"facts":{}}').sha256]});
  const facts=await current(db);
  expect(facts.rows.map(f=>[f.concept,f.value,f.status,f.mapping_gen,f.disclosure_seq])).toEqual([['net_income_parent','96995000000','ok',1,1],['revenue','383285000000','ok',1,1]]);
  expect((await db.filingsOfIssuer(ISSUER,'US',{}))[0]).toMatchObject({source_ref:'acc-1',mapping_gen:1,available_date:'2023-11-03'});
  expect([...storage.objects.keys()]).toEqual([`edgar/${ISSUER}/${snap('{"facts":{}}').sha256}.json`,`edgar/${ISSUER}/${snap('{"facts":{}}').sha256}.meta.json`]);
  const batch=tables.rows('ingest_batches')[0];
  expect(batch).toMatchObject({producer:'facts-sync',dataset:'facts.us',status:'success',code_version:'a'.repeat(40),triggered_by:'script',tool_versions:{mapping_gen:'1',rules:'dq-rules/1.0',formula:'facts-derive/1.0',source:'edgar'}});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'facts.us',status:'fresh',consecutive_errors:0,detail:{attempted:1,published:1,failed:0,skipped:0,idle:false}});
  const scope=(await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0];
  expect(scope).toMatchObject({last_status:'success',lease_batch_id:null,next_due_at:'2027-03-08T08:00:00.000Z'});
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(mocks.reconcileScope).toHaveBeenCalledWith({db,tables},'US');
 });
 it('counts a second identical pass as duplicates and a later filing with a new value as versioned, replayable by asOf',async()=>{
  const {db,deps}=harness();
  await run(deps);
  const again=await run(deps,{issuerIds:[ISSUER]});   // explicit issuer ignores next_due_at
  expect(again.counts).toMatchObject({inserted:0,duplicates:2,versioned:0});
  deps.parseUs=()=>parsed([filing('acc-2','2024-11-01')],[cand('acc-2','revenue','383285000001'),cand('acc-2','net_income_parent','96995000000')]);
  const third=await run(deps,{issuerIds:[ISSUER]});
  expect(third.counts).toMatchObject({inserted:1,versioned:1,duplicates:0});
  expect((await current(db,'2024-06-30')).rows.find(f=>f.concept==='revenue')).toMatchObject({value:'383285000000',disclosure_seq:1});
  expect((await current(db,'2025-06-30')).rows.find(f=>f.concept==='revenue')).toMatchObject({value:'383285000001',disclosure_seq:2,is_revision:true});
 });
 it('runs idle when nothing is due: success batch, freshness ok with idle=true',async()=>{
  const {tables,deps}=harness(FY23,{},[]);
  const r=await run(deps);
  expect(r).toMatchObject({idle:true,status:'success',issuers:[]});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({status:'fresh',detail:{idle:true,attempted:0}});
 });
 it('publishes an empty run and reports no_rows when the source has nothing',async()=>{
  const {db,deps}=harness(parsed([],[]));
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'published',code:'no_rows'});
  expect(r.errors).toEqual([{code:'skipped_summary',key:ISSUER,message:'{"no_rows":1}'}]);
  expect(r.status).toBe('success');
  expect(db.runs()[0]).toMatchObject({status:'published',manifest:[]});
 });
});

describe('runFactsSync — conflicts and rules',()=>{
 it('parks two same-day disclosures with different values into one same_day_conflict item and leaves no ok value for that day',async()=>{
  const {tables,db,deps}=harness(parsed([filing('acc-1','2023-11-03'),filing('acc-2','2023-11-03')],[cand('acc-1','revenue','100'),cand('acc-2','revenue','200')]));
  const r=await run(deps);
  expect(r.counts).toMatchObject({inserted:0,versioned:0,quarantined:2});
  expect(r.status).toBe('success');
  const items=tables.rows('dq_quarantine');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({dataset:'facts.us',table_name:'financial_facts',reason_code:'same_day_conflict',status:'open',natural_key:`${ISSUER}:US:revenue:2022-10-01:2023-09-30:consolidated:USD:2023-11-03`});
  expect((items[0].payload as {fact_ids:string[]}).fact_ids).toHaveLength(2);
  expect((items[0].payload as {run_id:string}).run_id).toBe(r.issuers[0].runId);
  expect((await current(db)).rows).toEqual([]);
  // a third filing for the same day joins the open item whatever its value
  deps.parseUs=()=>parsed([filing('acc-3','2023-11-03')],[cand('acc-3','revenue','100')]);
  const r2=await run(deps,{issuerIds:[ISSUER]});
  expect(r2.counts).toMatchObject({quarantined:1,inserted:0});
  expect((tables.rows('dq_quarantine')[0].payload as {fact_ids:string[]}).fact_ids).toHaveLength(3);
  expect(tables.rows('dq_quarantine')).toHaveLength(1);
 });
 it('quarantines identity_bs failures (only the new rows) and keeps the rest of the run published',async()=>{
  const {tables,db,deps}=harness(parsed([filing('acc-1','2023-11-03')],[bs('acc-1','total_assets','1000'),bs('acc-1','liabilities_and_equity','1100'),cand('acc-1','revenue','5')]));
  const r=await run(deps);
  expect(r.counts).toMatchObject({inserted:1,quarantined:2});
  const item=tables.rows('dq_quarantine')[0];
  expect(item).toMatchObject({reason_code:'identity_bs',natural_key:`${ISSUER}:US:BS:2023-09-30:USD:acc-1:1`});
  expect((item.payload as {fact_ids:string[];rule:string}).rule).toBe('identity_bs');
  expect((await current(db)).rows.map(f=>f.concept)).toEqual(['revenue']);
  const all=await db.readFacts(ISSUER,'US',{concepts:['total_assets','liabilities_and_equity'],asOf:'2030-01-01',history:true,includeNonOk:true});
  expect(all.rows.map(f=>f.status)).toEqual(['quarantined','quarantined']);
 });
 it('records parser leftovers as quarantine items without fact rows and warnings as one rule_warning_summary per rule',async()=>{
  const odd=cand('acc-1','revenue','1',{periodStart:'2023-08-01',duration:'3M'});
  const {tables,deps}=harness(parsed([filing('acc-1','2023-11-03')],[cand('acc-1','revenue','100'),cand('acc-1','cost_of_revenue','250')],{oddDuration:[odd],ambiguous:[{key:`${ISSUER}:US:cash::2023-09-30:consolidated:USD:acc-1:1`,candidates:[bs('acc-1','cash','1'),bs('acc-1','cash','2')]}]}));
  const r=await run(deps);
  expect(r.counts).toMatchObject({inserted:2,quarantined:3});
  expect(tables.rows('dq_quarantine').map(i=>i.reason_code).sort()).toEqual(['ambiguous_value','odd_duration']);
  expect(r.errors).toEqual([{code:'rule_warning_summary',key:'gross_margin_range',message:JSON.stringify({count:1,keys:[`${ISSUER}:US:IS:2022-10-01:2023-09-30:USD:acc-1:1`]})}]);
  expect(r.status).toBe('success');
 });
});

describe('runFactsSync — failures',()=>{
 it('skips a leased issuer with skipped_summary(leased) and a merged issuer with issuer_merged',async()=>{
  const {tables,db,deps}=harness();
  await mocks.reconcileScope(deps,'US');
  expect(await db.claimLease(ISSUER,'US','99999999-0000-4000-8000-000000000000',LEASE_TTL_S)).toBe(true);
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'skipped',code:'leased',runId:null});
  expect(r.errors).toEqual([{code:'skipped_summary',key:ISSUER,message:'{"leased":1}'}]);
  expect(r.status).toBe('success');
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1,detail:{attempted:1,published:0,skipped:1}});
  await db.releaseLease(ISSUER,'US','99999999-0000-4000-8000-000000000000','failed',NOW.toISOString());
  await tables.update('issuers',{issuer_id:ISSUER},{status:'merged'});
  expect((await run(deps)).issuers[0]).toMatchObject({outcome:'skipped',code:'issuer_merged'});
 });
 it('abandons the run and fails the issuer when the fetch fails; old data stays, lease released as failed',async()=>{
  const {db,deps}=harness();
  await run(deps);
  deps.fetchUs=async()=>{throw new SyncError('sec_unavailable');};
  const r=await run(deps,{issuerIds:[ISSUER]});
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'sec_unavailable'});
  expect(r.errors).toEqual([{code:'sec_unavailable',key:ISSUER}]);
  expect(r.counts.failed).toBe(1);
  expect(r.status).toBe('failed');
  expect(db.runs().map(x=>x.status)).toEqual(['published','abandoned']);
  expect((await current(db)).rows).toHaveLength(2);
  expect((await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0]).toMatchObject({last_status:'failed',lease_batch_id:null,next_due_at:'2027-03-02T08:00:00.000Z'});
  deps.fetchUs=async()=>{throw new SyncError('no_companyfacts');};
  expect((await run(deps,{issuerIds:[ISSUER]})).errors[0].code).toBe('no_companyfacts');
 });
 it('fails with parse_error (message, no values), snapshot_upload_failed and read_truncated, each abandoning the run',async()=>{
  const {db,deps}=harness();
  deps.parseUs=()=>{throw new Error('bad field: val');};
  expect((await run(deps)).issuers[0]).toMatchObject({outcome:'failed',code:'parse_error'});
  deps.parseUs=()=>FY23;
  deps.storage={put:async()=>{throw new SyncError('snapshot_upload_failed','storage down');}};
  expect((await run(deps,{issuerIds:[ISSUER]})).errors[0]).toEqual({code:'snapshot_upload_failed',key:ISSUER});
  deps.storage=memorySnapshotStore();
  const real=db.readFacts.bind(db);
  db.readFacts=async(...a)=>({...(await real(...a)),truncated:true});
  expect((await run(deps,{issuerIds:[ISSUER]})).issuers[0]).toMatchObject({outcome:'failed',code:'read_truncated'});
  expect(db.runs().every(x=>x.status==='abandoned')).toBe(true);
  // abandon_sync_run keeps the filings the run staged (gen 0, no facts); only begin_sync_run prunes,
  // and only for runs still staged at that moment. The next run reuses the row by source_ref
  // (stage_filings on-conflict) and activates it on publish (round-1 #17a).
  expect(await db.filingsOfIssuer(ISSUER,'US',{})).toEqual([expect.objectContaining({source_ref:'acc-1',mapping_gen:0})]);
  db.readFacts=real;
  expect((await run(deps,{issuerIds:[ISSUER]})).issuers[0].outcome).toBe('published');
  expect(await db.filingsOfIssuer(ISSUER,'US',{})).toEqual([expect.objectContaining({source_ref:'acc-1',mapping_gen:1})]);
 });
 it('stops the issuer on lease_lost without calling abandon or release',async()=>{
  const {db,deps}=harness();
  db.stageFacts=async()=>{throw new FactsDbError('lease_lost');};
  const abandonSpy=vi.spyOn(db,'abandonRun');const releaseSpy=vi.spyOn(db,'releaseLease');
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'lease_lost'});
  expect(r.errors).toEqual([{code:'lease_lost',key:ISSUER}]);
  expect(abandonSpy).not.toHaveBeenCalled();expect(releaseSpy).not.toHaveBeenCalled();
  expect(r.status).toBe('failed');
 });
 it('fails with mapping_gen_regression when a filing already carries a newer generation',async()=>{
  const {db,deps}=harness();
  await run(deps,{mappingGen:2});
  const r=await run(deps,{issuerIds:[ISSUER],mappingGen:1});
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'mapping_gen_regression'});
  expect(db.runs().map(x=>x.status)).toEqual(['published','abandoned']);
  expect((await db.filingsOfIssuer(ISSUER,'US',{}))[0].mapping_gen).toBe(2);
 });
 it('records stale_computation from materialize without un-publishing the run',async()=>{
  const {db,deps}=harness();
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('stale_computation'));
  const r=await run(deps);
  expect(r.issuers[0].outcome).toBe('published');
  expect(r.errors).toEqual([{code:'stale_computation',key:ISSUER,message:'stale_computation'}]);
  expect(r.status).toBe('partial');
  expect((await current(db)).rows).toHaveLength(2);
 });
 it('skips the remaining issuers after quota_exhausted (CN)',async()=>{
  const {deps}=harness(parsed([],[]),{fetchCn:async()=>{throw new SyncError('quota_exhausted');}},[{issuer_id:ISSUER,fetch_key:'600519.SH',market:'CN'},{issuer_id:ISSUER2,fetch_key:'000333.SZ',market:'CN'}]);
  const r=await run(deps,{market:'CN'});
  expect(r.issuers.map(i=>[i.outcome,i.code])).toEqual([['failed','quota_exhausted']]);
  expect(r.errors).toEqual([{code:'quota_exhausted',key:ISSUER},{code:'skipped_summary',key:ISSUER2,message:'{"quota_exhausted":1}'}]);
  expect(r.status).toBe('failed');
 });
 it('does not start an issuer with less than 90 s left and reports deadline_hit as information',async()=>{
  const {tables,deps}=harness(FY23,{deadline:new Date(NOW.getTime()+60_000)});
  const r=await run(deps);
  expect(r.issuers).toEqual([]);
  expect(r.errors).toEqual([{code:'deadline_hit',message:'{"not_started":1}'}]);
  expect(r.status).toBe('success');
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1});   // nothing published, not idle
 });
 it('abandons an in-flight run when the budget aborts mid-fetch',async()=>{
  const {db,deps}=harness(FY23,{deadline:new Date(NOW.getTime()+120_000)});
  deps.fetchUs=async(_cik,b)=>{const c=new AbortController();c.abort();Object.defineProperty(b,'signal',{value:c.signal});const e=new Error('aborted');e.name='AbortError';throw e;};
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'deadline_hit'});
  expect(db.runs()[0].status).toBe('abandoned');
  expect(r.counts.failed).toBe(0);
 });
 it('closes the batch as failed when infrastructure fails outside an issuer',async()=>{
  const {tables,deps}=harness();
  mocks.reconcileScope.mockRejectedValueOnce(new Error('db down'));
  await expect(run(deps)).rejects.toThrow('db down');
  expect(tables.rows('ingest_batches')[0]).toMatchObject({status:'failed',errors:[{code:'unknown',message:'db down'}]});
 });
});

describe('runFactsSync — round-1 audit cases',()=>{
 it('an input whose rows all lack an available date publishes an empty run AND parks every row as missing_available_date (#9)',async()=>{
  const {tables,db,deps}=harness(parsed([],[],{missingAvailableDate:[{accn:'0000320193-23-000106',tag:'us-gaap:Revenues',end:'2023-09-30'},{accn:'0000320193-23-000106',tag:'us-gaap:Assets',end:'2023-09-30'}]}));
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'published',code:'no_rows'});
  expect(r.counts).toMatchObject({fetched:0,inserted:0,quarantined:2,failed:0});
  expect(tables.rows('dq_quarantine').map(i=>[i.reason_code,i.natural_key]).sort()).toEqual([
   ['missing_available_date',`${ISSUER}:0000320193:0000320193-23-000106:us-gaap:Assets`],
   ['missing_available_date',`${ISSUER}:0000320193:0000320193-23-000106:us-gaap:Revenues`],
  ]);
  expect(db.runs()[0]).toMatchObject({status:'published',manifest:[]});
  expect(r.status).toBe('success');
 });
 it('a failure after publication keeps the run published, records the original error, releases the lease as failed and never calls abandonRun (#11)',async()=>{
  const {db,deps}=harness();
  mocks.materialize.mockRejectedValueOnce(new Error('metrics table missing'));
  const abandonSpy=vi.spyOn(db,'abandonRun');
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'published'});
  expect(r.errors).toEqual([{code:'unknown',key:ISSUER,message:'metrics table missing'}]);
  expect(r.status).toBe('partial');expect(r.counts.failed).toBe(0);
  expect(abandonSpy).not.toHaveBeenCalled();
  expect(db.runs()[0].status).toBe('published');
  expect((await current(db)).rows).toHaveLength(2);
  expect((await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0]).toMatchObject({last_status:'failed',lease_batch_id:null,next_due_at:'2027-03-02T08:00:00.000Z'});
 });
 it('parser skip counters become one skipped_summary(parser) and CN coverage one compact coverage_summary per issuer (#12)',async()=>{
  const cn=parsed([cnFiling()],[cnRevenue()],{skipped:[{reason:'is_calc',n:1},{reason:'null:bonds_payable',n:3}]});
  const {deps}=harness(cn,{coverageCn:()=>[{api:'income',report_type:1,years:{'2023':1}},{api:'cashflow',report_type:1,years:{'2022':4,'2023':4}}]},CN_SCOPE);
  const r=await run(deps,{market:'CN'});
  expect(r.status).toBe('success');
  expect(r.errors).toEqual([
   {code:'skipped_summary',key:`${ISSUER}:parser`,message:JSON.stringify({'null:bonds_payable':3,is_calc:1})},
   {code:'coverage_summary',key:ISSUER,message:JSON.stringify({'income:rt1':'2023-2023:1','cashflow:rt1':'2022-2023:8'})},
  ]);
  expect(r.counts).toMatchObject({inserted:1,quarantined:0});
 });
 it('explicit issuers without a scope row: apply seeds the row (reasons explicit) and publishes; dry-run plans on a constructed row and writes nothing; an unresolvable issuer fails with scope_unresolved (#13)',async()=>{
  const {tables,db,deps}=harness(FY23,{},[{issuer_id:ISSUER,fetch_key:'0000320193'}]);   // known to scopeRowFor, never reconciled
  const dry=await run(deps,{dryRun:true,issuerIds:[ISSUER,ISSUER2]});
  expect(dry.issuers.map(i=>[i.issuerId,i.outcome,i.code??null])).toEqual([[ISSUER,'planned',null],[ISSUER2,'failed','scope_unresolved']]);
  expect(dry.detail).toEqual({attempted:2,published:0,failed:1,skipped:0,idle:false});
  expect(db.scope()).toEqual([]);                                                        // the dry run constructed the row, never wrote it
  const r=await run(deps,{issuerIds:[ISSUER,ISSUER2]});
  expect(r.issuers.map(i=>[i.issuerId,i.outcome,i.code??null])).toEqual([[ISSUER,'published',null],[ISSUER2,'failed','scope_unresolved']]);
  expect(r.errors).toEqual([{code:'scope_unresolved',key:ISSUER2}]);
  expect(r.status).toBe('partial');expect(r.detail).toEqual({attempted:2,published:1,failed:1,skipped:0,idle:false});
  expect(db.scope()).toEqual([expect.objectContaining({issuer_id:ISSUER,reasons:['explicit'],priority:10,fetch_key:'0000320193',last_status:'success',lease_batch_id:null})]);
  expect(mocks.reconcileScope).not.toHaveBeenCalled();                                   // explicit issuers never reconcile the whole market
  expect(mocks.scopeRowFor).toHaveBeenCalledWith(tables,'US',ISSUER2,{today:'2027-03-01'});
  expect((await current(db)).rows).toHaveLength(2);
 });
 it('a thrown cninfo request still counts as a persisted link attempt, capped at MAX_LINK_ATTEMPTS; a budget cancelled before the request counts nothing (#21)',async()=>{
  const linkCn=vi.fn(async()=>{throw new Error('cninfo 500');});
  const {db,deps}=harness(parsed([cnFiling()],[cnRevenue()]),{linkCn},CN_SCOPE);
  const r=await run(deps,{market:'CN'});
  expect(r.issuers[0].errors).toContainEqual({code:'skipped_summary',key:`${ISSUER}:cninfo_link`,message:'{"link_failed":1}'});
  expect((await db.filingsOfIssuer(ISSUER,'CN',{}))[0]).toMatchObject({document_ref:null,link_attempts:1});
  for(let i=0;i<6;i++)await run(deps,{market:'CN',issuerIds:[ISSUER]});
  expect((await db.filingsOfIssuer(ISSUER,'CN',{}))[0].link_attempts).toBe(MAX_LINK_ATTEMPTS);
  expect(linkCn).toHaveBeenCalledTimes(MAX_LINK_ATTEMPTS);
  const cancelled=vi.fn(async(_f:unknown,b:{signal:AbortSignal})=>{const c=new AbortController();c.abort();Object.defineProperty(b,'signal',{value:c.signal});throw new Error('aborted');});
  const second=harness(parsed([cnFiling()],[cnRevenue()]),{linkCn:cancelled as unknown as SyncDeps['linkCn']},CN_SCOPE);
  const r2=await run(second.deps,{market:'CN'});
  expect(r2.issuers[0].outcome).toBe('published');
  expect(r2.issuers[0].errors.some(e=>e.key===`${ISSUER}:cninfo_link`)).toBe(false);
  expect((await second.db.filingsOfIssuer(ISSUER,'CN',{}))[0].link_attempts).toBe(0);
 });
});

describe('runFactsSync — dry run and code version',()=>{
 it('plans without writing anything in dryRun',async()=>{
  const {tables,db,deps}=harness();
  await mocks.reconcileScope(deps,'US');
  const r=await run(deps,{dryRun:true});
  expect(r).toMatchObject({batchId:null,status:'dry_run',counts:{fetched:2,inserted:2},detail:{attempted:1,published:0,failed:0,skipped:0,idle:false}});
  expect(r.issuers[0]).toMatchObject({issuerId:ISSUER,fetchKey:'0000320193',outcome:'planned',runId:null});
  expect(r.issuers[0].snapshotSha256).toEqual([snap('{"facts":{}}').sha256]);
  expect(tables.rows('ingest_batches')).toEqual([]);
  expect(db.runs()).toEqual([]);
  expect((await current(db)).rows).toEqual([]);
 });
 it('refuses to apply without a code version, but allows a dry run',async()=>{
  const {deps}=harness(FY23,{codeVersion:null});
  await expect(run(deps)).rejects.toThrow('code_version_unavailable');
  await expect(run(deps,{dryRun:true})).resolves.toBeDefined();
 });
 it('resolves the code version from VERCEL_GIT_COMMIT_SHA, else git HEAD with -dirty',()=>{
  const sha='b'.repeat(40);
  expect(resolveCodeVersion({VERCEL_GIT_COMMIT_SHA:sha},()=>{throw new Error('no git');})).toBe(sha);
  const clean=(cmd:string,args:string[])=>args[0]==='rev-parse'?`${sha}\n`:'';
  expect(resolveCodeVersion({},clean)).toBe(sha);
  const dirty=(cmd:string,args:string[])=>args[0]==='rev-parse'?`${sha}\n`:' M src/x.ts\n';
  expect(resolveCodeVersion({},dirty)).toBe(`${sha}-dirty`);
  expect(resolveCodeVersion({VERCEL_GIT_COMMIT_SHA:'short'},()=>{throw new Error('no git');})).toBeNull();
  expect(resolveCodeVersion(process.env)).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
 });
 it('makeBudget: no deadline is unlimited, a past deadline has no time and aborts',async()=>{
  const open=makeBudget(null);
  expect(open.remainingMs()).toBe(Number.POSITIVE_INFINITY);expect(open.signal.aborted).toBe(false);
  const past=makeBudget(new Date(NOW.getTime()-1),()=>NOW);
  expect(past.remainingMs()).toBe(0);
  await new Promise(r=>setTimeout(r,5));
  expect(past.signal.aborted).toBe(true);
  expect(makeBudget(new Date(NOW.getTime()+5000),()=>NOW).remainingMs()).toBe(5000);
 });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test -- src/lib/facts/snapshot-store.test.ts src/lib/facts/sync.test.ts`
Expected: 两个文件 FAIL，`Failed to resolve import "./snapshot-store"` / `"./sync"`。

- [ ] **Step 4: 实现错误类型**

```ts
// src/lib/facts/errors.ts
// Sync-level failure codes (spec §10) raised by fetchers, the snapshot store and the sync core.
// FactsDbError (types.ts) covers database outcomes; SyncError covers everything before/around
// the database. The code is the batch error code written to ingest_batches.errors.
// tushare_unavailable (Part C): Tushare HTTP/API failure that is not a quota message; spec §10 has
// no such row, so it is a non-info code like sec_unavailable.
export type SyncErrorCode='quota_exhausted'|'sec_unavailable'|'no_companyfacts'|'snapshot_too_large'|'snapshot_upload_failed'|'parse_error'|'code_version_unavailable'|'tushare_unavailable';
export class SyncError extends Error{
 constructor(public code:SyncErrorCode,message?:string){super(message===undefined?code:`${code}: ${message}`);this.name='SyncError';}
}
```

- [ ] **Step 5: 实现快照存储**

```ts
// src/lib/facts/snapshot-store.ts
// Raw snapshot evidence (spec §4.7, bucket disclosure-raw). put() stores the exact response bytes
// at {source}/{issuer_id}/{sha256}.json and a {sha256}.meta.json sidecar (never a token) with
// upsert:false, so identical bytes re-fetched later answer 'exists' and evidence is never
// rewritten. A failed upload is snapshot_upload_failed and the caller abandons the run. The
// budget's abort signal cuts the wait (the HTTP request itself is not cancellable in storage-js).
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Budget,RawSnapshot,Source} from './types';
import {SyncError} from './errors';

export const SNAPSHOT_BUCKET='disclosure-raw';
export interface SnapshotStore{put(snapshot:RawSnapshot,path:string,budget:Budget):Promise<'stored'|'exists'>}
export const snapshotPath=(source:Source,issuerId:string,sha256:string):string=>`${source}/${issuerId}/${sha256}.json`;
export const metaPath=(path:string):string=>path.replace(/\.json$/,'.meta.json');
const PATH=/^(edgar|tushare)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{64}\.json$/;
const metaOf=(s:RawSnapshot)=>JSON.stringify({...s.meta,sha256:s.sha256,bytes:s.bytes.byteLength});

interface UploadError{message:string;statusCode?:string|number;status?:number}
const isExists=(e:UploadError)=>String(e.statusCode??e.status??'')==='409'||/already exists|duplicate/i.test(e.message);

function withinBudget<T>(p:Promise<T>,budget:Budget):Promise<T>{
 if(budget.signal.aborted)return Promise.reject(new SyncError('snapshot_upload_failed','budget_exhausted'));
 return new Promise<T>((resolve,reject)=>{
  const onAbort=()=>reject(new SyncError('snapshot_upload_failed','budget_exhausted'));
  budget.signal.addEventListener('abort',onAbort,{once:true});
  p.then(v=>{budget.signal.removeEventListener('abort',onAbort);resolve(v);},e=>{budget.signal.removeEventListener('abort',onAbort);reject(e);});
 });
}

export function supabaseSnapshotStore(admin:SupabaseClient):SnapshotStore{
 const bucket=()=>admin.storage.from(SNAPSHOT_BUCKET);
 const upload=async(path:string,body:Uint8Array|string,budget:Budget):Promise<'stored'|'exists'>=>{
  const {error}=await withinBudget(bucket().upload(path,body,{contentType:'application/json',upsert:false}),budget);
  if(!error)return 'stored';
  if(isExists(error as UploadError))return 'exists';
  throw new SyncError('snapshot_upload_failed',(error as UploadError).message);
 };
 return {
  async put(snapshot,path,budget){
   if(!PATH.test(path))throw new SyncError('snapshot_upload_failed',`invalid_path:${path.slice(0,80)}`);
   const result=await upload(path,snapshot.bytes,budget);
   await upload(metaPath(path),metaOf(snapshot),budget);
   return result;
  },
 };
}

export function memorySnapshotStore():SnapshotStore&{objects:Map<string,string|Uint8Array>}{
 const objects=new Map<string,string|Uint8Array>();
 return {
  objects,
  async put(snapshot,path,budget){
   if(!PATH.test(path))throw new SyncError('snapshot_upload_failed',`invalid_path:${path.slice(0,80)}`);
   if(budget.signal.aborted)throw new SyncError('snapshot_upload_failed','budget_exhausted');
   if(objects.has(path))return 'exists';
   objects.set(path,snapshot.bytes);objects.set(metaPath(path),metaOf(snapshot));
   return 'stored';
  },
 };
}
```

- [ ] **Step 6: 实现同步核心**

```ts
// src/lib/facts/sync.ts
// Sync core (spec §6.1, §10). One ingest_batches row per call; per due issuer: lease → run →
// fetch → snapshot → parse → read + plan → stage → quarantine → publish → link (CN) →
// materialize → release. Every write goes through the injected FactsDb (lease-checked SQL
// functions); a lease_lost stops the issuer without any further database call; budget
// exhaustion abandons the in-flight run. Pure helpers (plan, rules) decide, this file sequences.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {RULES_VERSION} from '../dq/rules';
import {FactsDbError} from './types';
import type {Budget,FactCandidate,FactsDb,FilingInsert,FilingRow,Market,ParseResult,RawSnapshot,ScopeRow,Source} from './types';
import {FACT_CONCEPTS,MAPPING_GEN,MAPPING_VERSION} from './concepts';
import {SyncError} from './errors';
import {ambiguousKey,keyComponents} from './keys';
import {planFactWrites} from './plan';
import {evaluateFactRules,mergeWarnings,summarizeWarnings} from './rules';
import {snapshotPath} from './snapshot-store';
import type {SnapshotStore} from './snapshot-store';
import {reconcileScope,scopeRowFor} from './scope';
import type {ScopeInputRow} from './scope';
import {FORMULA_VERSION,materialize} from './derive';

/** Shape of providers/tushare-statements.ts::coverageSummary entries (the adapter is injected, never imported here). */
export interface CoverageEntry{api:string;report_type:number;years:Record<string,number>}
export interface SyncDeps{
 db:FactsDb;tables:TableClient;storage:SnapshotStore;
 fetchUs:(cik10:string,b:Budget)=>Promise<RawSnapshot>;
 fetchCn:(tsCode:string,sinceYear:number,b:Budget)=>Promise<RawSnapshot[]>;
 /** Adapters (Part C): parseCompanyFacts / parseTushareStatements wired by the route and scripts. */
 parseUs:(snapshot:RawSnapshot,opts:{sinceYear:number})=>ParseResult;
 parseCn:(snapshots:RawSnapshot[],opts:{sinceYear:number})=>ParseResult;
 linkCn?:(filing:FilingRow,b:Budget)=>Promise<{document_ref:string;document_url:string}|'none'|'ambiguous'>;
 /** CN coverage summary (§6.3 coverage_summary), wired by deps.ts to coverageSummary (round-1 #12). */
 coverageCn?:(parsed:ParseResult)=>CoverageEntry[];
 now:()=>Date;deadline:Date|null;codeVersion:string|null;
}
/**
 * issuerIds given (scripts, replay tests): those issuers run directly — no reconcileScope first,
 * next_due_at ignored. Their scope rows are read by id; a missing row is computed from the issuer
 * tables (scopeRowFor): seeded through reconcileScope with reasons ['explicit'] when applying,
 * constructed read-only for a dry run. An issuer whose fetch_key cannot be derived is reported as
 * outcome 'failed' / code 'scope_unresolved' — never silently skipped (round-1 #13).
 */
export interface SyncOptions{market:Market;limit:number;issuerIds?:string[];dryRun:boolean;triggeredBy:TriggeredBy;sinceYear?:number;mappingGen?:number}
/** 'planned' is the dry-run outcome of an issuer that fetched, parsed and planned without writing. */
export type IssuerOutcomeKind='published'|'planned'|'failed'|'skipped';
export interface IssuerOutcome{issuerId:string;fetchKey:string;runId:string|null;outcome:IssuerOutcomeKind;code?:string;counts:BatchCounts;errors:BatchError[];warnings:Map<string,string[]>;snapshotSha256:string[]}
export interface SyncDetail{attempted:number;published:number;failed:number;skipped:number;idle:boolean}
/** detail is the same object recorded on dq_freshness (spec §6.1) so cron receipts and the runbook read one shape. */
export interface SyncReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];issuers:IssuerOutcome[];idle:boolean;detail:SyncDetail}

const DAY=86_400_000;
export const LEASE_TTL_S=600;
export const MIN_ISSUER_MS=90_000;
export const NEXT_DUE_OK_MS=7*DAY;
export const NEXT_DUE_FAIL_MS=1*DAY;
export const MAX_LINK_ATTEMPTS=5;
export const LINKABLE_FORMS=new Set(['annual','semiannual','q1','q3','restatement']);
const COUNTERS=['fetched','inserted','duplicates','versioned','quarantined','failed'] as const;
const ALL_CONCEPTS=FACT_CONCEPTS.map(c=>c.id);
const isoDate=(d:Date)=>d.toISOString().slice(0,10);
const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
const dbCode=(e:unknown)=>e instanceof FactsDbError?e.code:null;
const datasetOf=(m:Market)=>m==='US'?'facts.us':'facts.cn';
const sourceOf=(m:Market):Source=>m==='US'?'edgar':'tushare';
const summary=(key:string,reason:string):BatchError=>({code:'skipped_summary',key,message:JSON.stringify({[reason]:1})});
const MAX_SKIP_REASONS=20;
/** One skipped_summary(parser) per issuer: the adapter's skip counters, top MAX_SKIP_REASONS by count, the rest folded into `_more` (round-1 #12). */
const skippedSummary=(issuer:string,skipped:{reason:string;n:number}[]):BatchError=>{
 const sorted=[...skipped].sort((a,b)=>b.n-a.n||a.reason.localeCompare(b.reason));
 const body:Record<string,number>=Object.fromEntries(sorted.slice(0,MAX_SKIP_REASONS).map(s=>[s.reason,s.n]));
 if(sorted.length>MAX_SKIP_REASONS)body._more=sorted.slice(MAX_SKIP_REASONS).reduce((n,s)=>n+s.n,0);
 return {code:'skipped_summary',key:`${issuer}:parser`,message:JSON.stringify(body)};
};
/** `<api>:rt<n>` → `<first year>-<last year>:<distinct end dates>`; compact enough for the 500-char batch error message cap. */
const compactCoverage=(entries:CoverageEntry[]):string=>JSON.stringify(Object.fromEntries(entries.map(e=>{const ys=Object.keys(e.years).sort();return [`${e.api}:rt${e.report_type}`,`${ys[0]??''}-${ys.at(-1)??''}:${Object.values(e.years).reduce((n,v)=>n+v,0)}`];})));

/** Remaining time and an abort signal that fires at the deadline; no deadline means unlimited. */
export function makeBudget(deadline:Date|null,now:()=>Date=()=>new Date()):Budget{
 if(deadline===null)return {remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal};
 const remainingMs=()=>Math.max(0,deadline.getTime()-now().getTime());
 return {remainingMs,signal:AbortSignal.timeout(remainingMs())};
}

/** VERCEL_GIT_COMMIT_SHA, else `git rev-parse HEAD` with -dirty when the tree has changes; null when neither is available. */
export function resolveCodeVersion(env:NodeJS.ProcessEnv=process.env,exec:(cmd:string,args:string[])=>string=(c,a)=>execFileSync(c,a,{encoding:'utf8',stdio:['ignore','pipe','ignore']})):string|null{
 const sha=env.VERCEL_GIT_COMMIT_SHA;
 if(sha!==undefined&&/^[0-9a-f]{40}$/.test(sha))return sha;
 try{
  const head=exec('git',['rev-parse','HEAD']).trim();
  if(!/^[0-9a-f]{40}$/.test(head))return null;
  return exec('git',['status','--porcelain']).trim().length>0?`${head}-dirty`:head;
 }catch{return null;}
}

interface Staged{parsed:ParseResult;filingIds:Map<string,string>;filingRows:Map<string,FilingRow>}
interface Fetched{parsed:ParseResult;sha256s:string[]}
const keyOfCandidate=(c:FactCandidate)=>({concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit});
/** missing_available_date natural key (spec §7.1 `<issuer>:<ts_code>:<end_date>:<report_type>`; EDGAR rows carry accn/tag in those slots). */
const missingDateKey=(issuer:string,fetchKey:string,r:Record<string,unknown>)=>[issuer,fetchKey,String(r.end_date??r.accn??''),String(r.report_type??r.tag??'')].join(':');

async function fetchAndParse(deps:SyncDeps,market:Market,issuer:string,fetchKey:string,sinceYear:number,budget:Budget,store:boolean):Promise<Fetched>{
 const snapshots:RawSnapshot[]=market==='US'?[await deps.fetchUs(fetchKey,budget)]:await deps.fetchCn(fetchKey,sinceYear,budget);
 if(store)for(const s of snapshots)await deps.storage.put(s,snapshotPath(sourceOf(market),issuer,s.sha256),budget);
 const sha256s=snapshots.map(s=>s.sha256);
 try{return {parsed:market==='US'?deps.parseUs(snapshots[0],{sinceYear}):deps.parseCn(snapshots,{sinceYear}),sha256s};}
 catch(e){throw new SyncError('parse_error',e instanceof Error?e.message.slice(0,200):'unknown');}
}

export async function syncIssuerFacts(deps:SyncDeps,batchId:string,input:{scope:ScopeRow;market:Market;sinceYear:number;mappingGen?:number;budget:Budget}):Promise<IssuerOutcome>{
 const {db,tables}=deps;const {scope,market,sinceYear,budget}=input;const issuer=scope.issuer_id;const gen=input.mappingGen??MAPPING_GEN;const dataset=datasetOf(market);
 const out:IssuerOutcome={issuerId:issuer,fetchKey:scope.fetch_key,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],warnings:new Map(),snapshotSha256:[]};
 const skip=(reason:string)=>{out.code=reason;out.errors.push(summary(issuer,reason));return out;};
 const [issuerRow]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 if(issuerRow?.status==='merged')return skip('issuer_merged');
 if(!await db.claimLease(issuer,market,batchId,LEASE_TTL_S))return skip('leased');
 let leaseHeld=true;let runId:string|null=null;let fetched=0;let publishedRun=false;
 const fail=(code:string,message?:string)=>{out.outcome='failed';out.code=code;out.errors.push(message===undefined?{code,key:issuer}:{code,key:issuer,message});out.counts.failed+=Math.max(1,fetched);return out;};
 // Only a run that is still staged can be abandoned: once publishRun committed the run is immutable
 // (abandon would raise run_published and mask the real failure) and its facts stay (round-1 #11).
 const abandon=async()=>{if(runId===null||!leaseHeld||publishedRun)return;try{await db.abandonRun(runId);}catch(e){if(dbCode(e)!=='lease_lost')throw e;leaseHeld=false;}};
 const release=async(outcome:'success'|'failed')=>{
  if(!leaseHeld)return;
  const next=new Date(deps.now().getTime()+(outcome==='success'?NEXT_DUE_OK_MS:NEXT_DUE_FAIL_MS)).toISOString();
  try{await db.releaseLease(issuer,market,batchId,outcome,next);}catch(e){if(dbCode(e)!=='lease_lost')throw e;leaseHeld=false;}
 };
 // Failure AFTER publication (link, materialize, release): the run stays published and the issuer
 // outcome stays 'published'; the original failure is recorded under its own code and the lease is
 // released as failed so the issuer returns in a day for the post-publish work (round-1 #11).
 const afterPublish=async(code:string,e:unknown)=>{out.errors.push({code,key:issuer,message:errMsg(e)});await release('failed');return out;};
 try{
  runId=await db.beginRun(issuer,market,batchId,gen);out.runId=runId;
  const {parsed,sha256s}=await fetchAndParse(deps,market,issuer,scope.fetch_key,sinceYear,budget,true);
  out.snapshotSha256=sha256s;
  fetched=parsed.candidates.length;out.counts.fetched=fetched;
  const park=(reasonCode:string,naturalKey:string,payload:Record<string,unknown>)=>quarantine(tables,{dataset,table:'financial_facts',naturalKey,reasonCode,batchId,payload:{...payload,run_id:runId}});
  // Parser leftovers come FIRST (round-1 #9): they need no filing row, and an input whose rows all
  // lack an available date must still leave its missing_available_date evidence behind even though
  // the empty-result branch below publishes an empty run. Parser-level ambiguity: the adapter's
  // `key` is its own grouping string (it knows no issuer); the §7.1 natural key is rendered here
  // from the first candidate and the parser key kept in the payload.
  let parserParked=0;
  for(const a of parsed.ambiguous){const c0=a.candidates[0];await park('ambiguous_value',ambiguousKey(issuer,market,keyOfCandidate(c0),c0.filingRef,gen),{key:keyComponents(issuer,market,keyOfCandidate(c0)),parser_key:a.key,candidates:a.candidates});parserParked+=a.candidates.length;}
  for(const c of parsed.oddDuration){await park('odd_duration',ambiguousKey(issuer,market,keyOfCandidate(c),c.filingRef,gen),{key:keyComponents(issuer,market,keyOfCandidate(c)),candidate:c});parserParked++;}
  for(const r of parsed.missingAvailableDate){await park('missing_available_date',missingDateKey(issuer,scope.fetch_key,r),{row:r});parserParked++;}
  out.counts.quarantined+=parserParked;
  // Adapter summaries → the batch info channel (round-1 #12): skip counters always, CN coverage when wired.
  if(parsed.skipped.length>0)out.errors.push(skippedSummary(issuer,parsed.skipped));
  if(market==='CN'&&deps.coverageCn)out.errors.push({code:'coverage_summary',key:issuer,message:compactCoverage(deps.coverageCn(parsed))});
  if(parsed.filings.length===0&&parsed.candidates.length===0){
   await db.publishRun(runId,[]);publishedRun=true;await release('success');out.outcome='published';return skip('no_rows');
  }
  const staged=await stageFilings(db,runId,issuer,market,parsed);
  const filingCandidates=parsed.filings.map(f=>({...f,availableDate:staged.filingRows.get(staged.filingIds.get(f.sourceRef)??'')!.available_date}));
  const read=await db.readFacts(issuer,market,{concepts:ALL_CONCEPTS,asOf:isoDate(deps.now()),history:true,includeNonOk:true});
  if(read.truncated){await abandon();await release('failed');return fail('read_truncated');}
  const open=await db.openConflicts(issuer,market);
  const plan=planFactWrites({existing:read.rows,openConflicts:open,candidates:parsed.candidates,filingCandidates,filings:staged.filingIds,issuerId:issuer,market,mappingGen:gen,mappingVersion:MAPPING_VERSION});
  if(plan.inserts.length>0)await db.stageFacts(runId,plan.inserts);
  for(const a of plan.ambiguous)await park('ambiguous_value',a.naturalKey,{key:a.key,candidates:a.candidates});
  for(const c of plan.conflicts){
   const itemId=await park('same_day_conflict',c.naturalKey,{key:c.key,fact_ids:[...c.newFactIds,...c.existingOkFactIds],values:c.values});
   await db.quarantineFacts(runId,c.newFactIds,itemId);
  }
  for(const j of plan.contestedJoins)await db.quarantineFacts(runId,j.factIds,j.itemId);
  const parked=new Set(plan.quarantinedFactIds);
  const sourceRefOf=new Map([...staged.filingRows.values()].map(f=>[f.filing_id,f.source_ref]));
  const rules=evaluateFactRules({newRows:plan.inserts.filter(r=>!parked.has(r.fact_id)),okRows:read.rows.filter(r=>r.status==='ok'),sourceRefOf,issuerId:issuer,market,mappingGen:gen});
  for(const rq of rules.quarantine){
   const itemId=await park(rq.reason,rq.naturalKey,{key:rq.key,fact_ids:rq.factIds,rule:rq.rule,detail:rq.detail});
   await db.quarantineFacts(runId,rq.factIds,itemId);
   for(const id of rq.factIds)plan.outcomes.set(id,'quarantined');
  }
  out.warnings=rules.warnings;
  for(const o of plan.outcomes.values())out.counts[o]++;
  out.counts.duplicates=plan.counts.duplicates;
  out.counts.quarantined+=plan.ambiguous.reduce((n,a)=>n+a.candidates.length,0);
  const manifest=parsed.filings.map(f=>staged.filingIds.get(f.sourceRef)!);
  try{await db.publishRun(runId,manifest);}
  catch(e){if(dbCode(e)!=='mapping_gen_regression')throw e;await abandon();await release('failed');return fail('mapping_gen_regression');}
  publishedRun=true;
  out.outcome='published';
  if(market==='CN'&&deps.linkCn)await linkFilings(deps,issuer,market,budget,out);
  try{await materialize(db,issuer,market);}
  catch(e){const code=dbCode(e);if(code!=='stale_computation'&&code!=='read_truncated')throw e;out.errors.push({code,key:issuer,message:errMsg(e)});}
  await release('success');
  return out;
 }catch(e){
  if(dbCode(e)==='lease_lost'){leaseHeld=false;if(publishedRun){out.errors.push({code:'lease_lost',key:issuer});return out;}return fail('lease_lost');}
  if(budget.signal.aborted||(e instanceof Error&&e.name==='AbortError')){
   if(publishedRun)return afterPublish('deadline_hit',e);
   await abandon();await release('failed');
   out.outcome='failed';out.code='deadline_hit';out.errors.push({code:'deadline_hit',key:issuer});return out;
  }
  if(publishedRun)return afterPublish(e instanceof SyncError?e.code:dbCode(e)??'unknown',e);
  await abandon();await release('failed');
  return fail(e instanceof SyncError?e.code:'unknown',e instanceof SyncError?undefined:errMsg(e));
 }
}

/** Stages this run's filings (existing source_refs keep their id) and returns the issuer's filing rows by id. */
async function stageFilings(db:FactsDb,runId:string,issuer:string,market:Market,parsed:ParseResult):Promise<Staged>{
 const known=new Map((await db.filingsOfIssuer(issuer,market,{})).map(f=>[f.source_ref,f.filing_id]));
 const rows:FilingInsert[]=parsed.filings.map(f=>({...f,filing_id:known.get(f.sourceRef)??randomUUID(),issuer_id:issuer}));
 const filingIds=await db.stageFilings(runId,rows);
 const filingRows=new Map((await db.filingsOfIssuer(issuer,market,{})).map(f=>[f.filing_id,f]));
 for(const f of parsed.filings){
  const id=filingIds.get(f.sourceRef);
  if(id===undefined||!filingRows.has(id))throw new SyncError('parse_error',`filing_not_staged:${f.sourceRef}`);
 }
 return {parsed,filingIds,filingRows};
}

async function linkFilings(deps:SyncDeps,issuer:string,market:Market,budget:Budget,out:IssuerOutcome):Promise<void>{
 const pending=(await deps.db.filingsOfIssuer(issuer,market,{unlinkedOnly:true})).filter(f=>f.link_attempts<MAX_LINK_ATTEMPTS&&f.origin!=='bse'&&LINKABLE_FORMS.has(f.form_type));
 let failed=0;
 for(const f of pending){
  // Cancellation before a request starts is not an attempt: link_attempts stays untouched (round-1 #21).
  if(budget.signal.aborted||budget.remainingMs()<MIN_ISSUER_MS/3)break;
  let patch:{document_ref?:string;document_url?:string;link_attempts:number}={link_attempts:f.link_attempts+1};
  try{
   const r=await deps.linkCn!(f,budget);
   if(typeof r!=='string')patch={...r,link_attempts:f.link_attempts+1};
  }catch(e){
   if(dbCode(e)==='lease_lost')throw e;
   if(budget.signal.aborted)break;                       // cut by the budget mid-request: not a refusal
   failed++;                                             // transport/HTTP failure: the attempt counts towards the five-attempt cap (§6.3)
  }
  await deps.db.updateFilingLink(f.filing_id,patch);     // none / ambiguous / success / thrown — every started request is persisted
 }
 if(failed>0)out.errors.push({code:'skipped_summary',key:`${issuer}:cninfo_link`,message:JSON.stringify({link_failed:failed})});
}

type Selected={scope:ScopeRow}|{unresolved:string};
const unresolvedOutcome=(issuerId:string):IssuerOutcome=>({issuerId,fetchKey:'',runId:null,outcome:'failed',code:'scope_unresolved',counts:{...emptyCounts(),failed:1},errors:[{code:'scope_unresolved',key:issuerId}],warnings:new Map(),snapshotSha256:[]});
/**
 * Scheduled path: the due rows. Explicit issuers (round-1 #13): their scope rows by id, in the
 * order given; a missing row is computed from the issuer tables (scopeRowFor) — seeded through
 * reconcileScope when applying (reasons ['explicit'], priority SCOPE_PRIORITY; the next cron
 * reconcile retires it to priority 0 unless a source lists the issuer), constructed read-only for
 * a dry run — and an issuer whose fetch_key cannot be derived is reported, never silently dropped.
 */
async function selectScopes(deps:SyncDeps,opts:SyncOptions):Promise<Selected[]>{
 if(opts.issuerIds===undefined)return (await deps.db.scopeDue(opts.market,deps.now().toISOString(),opts.limit)).map(scope=>({scope}));
 const ids=[...new Set(opts.issuerIds)].slice(0,opts.limit);
 const have=new Map((await deps.db.scopeRows(opts.market,ids)).map(s=>[s.issuer_id,s]));
 const today=isoDate(deps.now());const seed:ScopeInputRow[]=[];
 for(const id of ids){
  if(have.has(id))continue;
  const row=await scopeRowFor(deps.tables,opts.market,id,{today});
  if(row===null)continue;
  if(opts.dryRun)have.set(id,{...row,market:opts.market,next_due_at:deps.now().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  else seed.push(row);
 }
 if(seed.length>0){
  await deps.db.reconcileScope(opts.market,seed);
  for(const s of await deps.db.scopeRows(opts.market,seed.map(r=>r.issuer_id)))have.set(s.issuer_id,s);
 }
 return ids.map(id=>{const scope=have.get(id);return scope?{scope}:{unresolved:id};});
}

/** Dry run: fetch, parse and plan against the current rows, write nothing (no batch, lease, snapshot or run). Planned issuers report outcome 'planned'. */
async function dryRun(deps:SyncDeps,opts:SyncOptions,sinceYear:number,gen:number,budget:Budget):Promise<SyncReceipt> {
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];
 const selected=await selectScopes(deps,opts);
 let failed=0;
 for(const sel of selected){
  if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
  const scope=sel.scope;
  const out:IssuerOutcome={issuerId:scope.issuer_id,fetchKey:scope.fetch_key,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],warnings:new Map(),snapshotSha256:[]};
  try{
   const {parsed,sha256s}=await fetchAndParse(deps,opts.market,scope.issuer_id,scope.fetch_key,sinceYear,budget,false);
   out.snapshotSha256=sha256s;
   const known=new Map((await deps.db.filingsOfIssuer(scope.issuer_id,opts.market,{})).map(f=>[f.source_ref,f.filing_id]));
   const filings=new Map(parsed.filings.map(f=>[f.sourceRef,known.get(f.sourceRef)??randomUUID()]));
   const read=await deps.db.readFacts(scope.issuer_id,opts.market,{concepts:ALL_CONCEPTS,asOf:isoDate(deps.now()),history:true,includeNonOk:true});
   const plan=planFactWrites({existing:read.rows,openConflicts:await deps.db.openConflicts(scope.issuer_id,opts.market),candidates:parsed.candidates,filingCandidates:parsed.filings,filings,issuerId:scope.issuer_id,market:opts.market,mappingGen:gen,mappingVersion:MAPPING_VERSION});
   Object.assign(out.counts,{fetched:parsed.candidates.length,...plan.counts});out.outcome='planned';
  }catch(e){failed++;out.outcome='failed';out.code=e instanceof SyncError?e.code:'unknown';out.errors.push({code:out.code,key:scope.issuer_id,message:errMsg(e)});}
  issuers.push(out);for(const k of COUNTERS)counts[k]+=out.counts[k];errors.push(...out.errors);
 }
 const idle=selected.length===0;
 return {batchId:null,status:'dry_run',counts,errors,issuers,idle,detail:{attempted:selected.length,published:0,failed,skipped:0,idle}};
}

export async function runFactsSync(deps:SyncDeps,opts:SyncOptions):Promise<SyncReceipt>{
 const {market}=opts;const dataset=datasetOf(market);
 const sinceYear=opts.sinceYear??deps.now().getUTCFullYear()-10;const gen=opts.mappingGen??MAPPING_GEN;
 const budget=makeBudget(deps.deadline,deps.now);
 if(opts.dryRun)return dryRun(deps,opts,sinceYear,gen,budget);
 if(deps.codeVersion===null||deps.codeVersion==='')throw new SyncError('code_version_unavailable');
 const {batchId}=await startBatch(deps.tables,{producer:'facts-sync',dataset,toolVersions:{mapping_gen:String(gen),rules:RULES_VERSION,formula:FORMULA_VERSION,source:sourceOf(market)},codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];const warnings=new Map<string,string[]>();
 let attempted=0,published=0,failed=0,skipped=0,quota=false,idle=false;
 try{
  // Scheduled path (cron): reconcile the scope first (spec §6.1). Explicit issuers (scripts, replay
  // tests) skip it: their scope rows were put there by the caller and must not be retired by sources
  // the caller does not control.
  if(opts.issuerIds===undefined)await reconcileScope({db:deps.db,tables:deps.tables},market);
  const selected=await selectScopes(deps,opts);
  idle=selected.length===0;
  for(let i=0;i<selected.length;i++){
   const sel=selected[i];
   if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);attempted++;failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
   const scope=sel.scope;
   if(quota){skipped++;errors.push(summary(scope.issuer_id,'quota_exhausted'));continue;}
   if(budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:selected.length-i})});break;}
   attempted++;
   const r=await syncIssuerFacts(deps,batchId,{scope,market,sinceYear,mappingGen:gen,budget});
   issuers.push(r);for(const k of COUNTERS)counts[k]+=r.counts[k];errors.push(...r.errors);mergeWarnings(warnings,r.warnings);
   if(r.outcome==='published')published++;else if(r.outcome==='failed')failed++;else skipped++;
   if(r.code==='quota_exhausted')quota=true;
  }
  errors.push(...summarizeWarnings(warnings));
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  const ok=idle||published>=Math.max(1,Math.ceil(attempted/2));
  const detail:SyncDetail={attempted,published,failed,skipped,idle};
  await recordAttempt(deps.tables,dataset,{ok,cadence:'daily',now:deps.now(),detail:{...detail}});
  return {batchId,status,counts,errors,issuers,idle,detail};
 }catch(e){
  // Infrastructure failure outside an issuer: close the receipt so no running batch dangles, then rethrow.
  errors.push({code:'unknown',message:errMsg(e)});
  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; runbook SQL marks it failed */}
  try{await recordAttempt(deps.tables,dataset,{ok:false,cadence:'daily',now:deps.now(),detail:{attempted,published,failed,skipped,idle,error:errMsg(e)}});}catch{/* same */}
  throw e;
 }
}
```

实现要点对照 §6.1 步骤：0 未指定 `issuerIds` 时先 `reconcileScope({db,tables},market)` 再 `scopeDue`；指定时 `selectScopes` 用 `db.scopeRows` 按 id 直取（不对账、不看 `next_due_at`），缺行者 `scopeRowFor` 算出 → apply 时 `reconcileScope` 补建（`reasons:['explicit']`）、dry-run 时构造只读行，算不出的以 `scope_unresolved` 失败计入回执（round-1 #13）；1 `claimLease(…,600)`（失败 → `skipped_summary(leased)`）；2 `beginRun`；3 抓取 + `storage.put`（快照 sha256 记入 `IssuerOutcome.snapshotSha256`）；4 解析（异常 → `parse_error`，只带消息前 200 字；适配器抛的 `ProviderError` 是 `SyncError` 的别名，其 `code` 直接成为批次错误码）；**解析器遗留三类先落隔离**（`ambiguous_value` / `odd_duration` / `missing_available_date`，不依赖 filing 行；round-1 #9），`parsed.skipped` → `skipped_summary(<issuer>:parser)`，CN 且注入 `coverageCn` → `coverage_summary`（紧凑串，round-1 #12），然后才判"无文件无候选 → 发布空运行 + `no_rows`"；解析器的 `ambiguous[].key` 只是适配器内部分组串，落库时用 `ambiguousKey(issuer,market,K,filingRef,gen)` 渲染 §7.1 自然键并把原串存为 `payload.parser_key`；5 先 `stageFilings`（on-conflict 返回既有 id，使 FactInsert 在规划前就有 `filing_id` 与权威 `available_date`），再 `readFacts(all, 今天, history, includeNonOk)`（`truncated` → `read_truncated` 废弃）+ `openConflicts` → `planFactWrites`；6 `stageFacts`；7 `ambiguous_value`；`same_day_conflict` → `quarantine()` 后 `quarantineFacts(run, newIds, item)`；争议并入 → `quarantineFacts(run, ids, item)`；规则 → `quarantine()` + `quarantineFacts`；8 `publishRun(run, manifest=全部 filing)`（`mapping_gen_regression` → 废弃、failed）；**发布成功后置 `publishedRun=true`：之后任何失败都不再 `abandonRun`**（它只会抛 `run_published` 盖掉原错误），发行人 outcome 保持 `published`，原错误按自身码记入 `errors`，租约以 `failed` 释放（round-1 #11）；9 CN `linkCn` 对 `document_ref is null and link_attempts < 5` 且非 BJ、`form_type ∈ LINKABLE_FORMS` 的 filing，`updateFilingLink`——none / ambiguous / 成功 / **请求抛错**都持久化 `link_attempts+1`，只有预算在请求开始前已取消（`budget.signal.aborted`）才不计（round-1 #21）；10 `materialize`（`stale_computation`/`read_truncated` 记错不撤发布；重算一次在 Task 15 的 `materialize` 内完成）；11 `releaseLease(outcome, now+7d | now+1d)`。`lease_lost` 在任何位置 → 不再调用 `abandonRun/releaseLease`；发布前 → 该发行人 failed，发布后 → 保持 published 并记 `lease_lost`。预算中止（`AbortError` 或 `budget.signal.aborted`）→ 发布前：废弃运行、失败释放、`deadline_hit`（信息码，不计 `failed`）；发布后：不废弃、失败释放、记 `deadline_hit`。`fetched` = 候选数；发行人级失败 `failed += max(1, fetched)`，使"fetched>0 无结果"不会被误判为 `unaccounted`。

- [ ] **Step 7: 运行通过**

Run: `npm test -- src/lib/facts/snapshot-store.test.ts src/lib/facts/sync.test.ts`
Expected: `snapshot-store.test.ts` 5 passed；`sync.test.ts` 26 passed（含 `round-1 audit cases` 5 个）。

- [ ] **Step 8: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 无错误（要求 `scope.ts`、`derive.ts`、`memory-facts-db.ts` 已存在，见上方依赖）。

- [ ] **Step 9: 提交**

```bash
git add src/lib/facts/errors.ts src/lib/facts/snapshot-store.ts src/lib/facts/snapshot-store.test.ts src/lib/facts/sync.ts src/lib/facts/sync.test.ts
git commit -m "feat(facts): raw snapshot store and sync core (lease, run lifecycle, plan, quarantine, publish, budget, receipts)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 处理钩子 `resolveFactsItem` 与路由接入（§7.3）

**Files:**
- Create: `src/lib/dq/facts-resolver.ts`
- Modify: `src/app/api/admin/dq/quarantine/[id]/route.ts`
- Modify: `src/app/api/admin/dq/quarantine/[id]/route.test.ts`
- Test: `src/lib/dq/facts-resolver.test.ts`
- 依赖（本任务不创建）：`src/lib/facts/db.ts`（Task 1/2，`supabaseFactsDb(admin)`）、`src/lib/facts/derive.ts`（Task 15，`materialize`）。

- [ ] **Step 1: 写失败测试（钩子）**

```ts
// src/lib/dq/facts-resolver.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({materialize:vi.fn()}));
vi.mock('../facts/derive',()=>({materialize:mocks.materialize,FORMULA_VERSION:'facts-derive/1.0'}));

import {memoryTableClient} from '../db/memory-table-client';
import {quarantine} from './quarantine';
import {resolveFactsItem} from './facts-resolver';
import {FactsDbError} from '../facts/types';
import type {FactRow,FactsDb} from '../facts/types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const BATCH='55555555-0000-4000-8000-000000000001';
const A='20000000-0000-4000-8000-00000000000a',B='20000000-0000-4000-8000-00000000000b',C='20000000-0000-4000-8000-00000000000c';
const NOW=()=>new Date('2026-11-04T09:00:00.000Z');
const fact=(id:string,value:string):FactRow=>({fact_id:id,issuer_id:ISSUER,market:'US',filing_id:'f',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',status:'quarantined',raw_hash:'h',created_at:'2024-01-01T00:00:00Z'});

function harness(){
 const tables=memoryTableClient({dq_quarantine:['id']});
 const values=new Map([[A,'100'],[B,'1e2'],[C,'200']]);
 const resolve=vi.fn<(id:string,chosen:string[],by:string)=>Promise<{promoted:number;skipped:number}>>(async()=>({promoted:1,skipped:0}));
 const db={resolveFactsQuarantine:resolve,factsByIds:async(ids:string[])=>ids.filter(i=>values.has(i)).map(i=>fact(i,values.get(i)!))} as unknown as FactsDb;
 const item=async(reasonCode:string,factIds:string[],key:Record<string,string|null>={issuer_id:ISSUER,market:'US'})=>{
  const id=await quarantine(tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`k:${reasonCode}`,reasonCode,batchId:BATCH,payload:{key,fact_ids:factIds,run_id:'r'}});
  return (await tables.select('dq_quarantine',{id},{limit:1}))[0];
 };
 const row=async(id:string)=>(await tables.select('dq_quarantine',{id},{limit:1}))[0];
 return {tables,db,resolve,item,row};
}
beforeEach(()=>{vi.clearAllMocks();mocks.materialize.mockResolvedValue(3);});

describe('resolveFactsItem',()=>{
 it('accepts a same_day_conflict with chosen rows of one value, persists the verdict through the function and materializes',async()=>{
  const {db,resolve,item,row}=harness();
  const it_=await item('same_day_conflict',[A,B,C]);
  const r=await resolveFactsItem(db,harness().tables,it_,{status:'resolved_accept',chosenFactIds:[A,B],resolvedBy:ADMIN,now:NOW});
  expect(resolve).toHaveBeenCalledWith(it_.id,[A,B],ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(r).toEqual({outcome:'resolved',promoted:1,skipped:0,chosenFactIds:[A,B],hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'}});
  void row;
 });
 it('writes detail.hook on the item and keeps what the function wrote in detail',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('identity_bs',[A]);
  resolve.mockImplementationOnce(async(id:string,chosen:string[])=>{await tables.update('dq_quarantine',{id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x',detail:{chosen_fact_ids:chosen}});return {promoted:1,skipped:0};});
  await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(resolve).toHaveBeenCalledWith(it_.id,[A],ADMIN);
  expect((await row(String(it_.id))).detail).toEqual({chosen_fact_ids:[A],hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'}});
 });
 it('rejects a verdict outside the item or with mixed values',async()=>{
  const {tables,db,resolve,item}=harness();
  const it_=await item('same_day_conflict',[A,B,C]);
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenFactIds:[A,'20000000-0000-4000-8000-00000000dead'],resolvedBy:ADMIN})).toEqual({outcome:'invalid_choice'});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenFactIds:[A,C],resolvedBy:ADMIN})).toEqual({outcome:'invalid_choice'});
  expect(resolve).not.toHaveBeenCalled();
  // acknowledgement only: no chosen rows, the group stays parked for good
  await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN});
  expect(resolve).toHaveBeenCalledWith(it_.id,[],ADMIN);
 });
 it('acknowledges items without fact rows through the function and skips materialize',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('ambiguous_value',[]);
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(resolve).toHaveBeenCalledWith(it_.id,[],ADMIN);
  expect(mocks.materialize).not.toHaveBeenCalled();
  expect(r.hook).toEqual({stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'});
  expect((await row(String(it_.id))).detail).toMatchObject({hook:{state:'done'}});
 });
 it('propagates run_pending from the function and leaves the item open',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('identity_gp',[A]);
  resolve.mockRejectedValueOnce(new FactsDbError('run_pending'));
  await expect(resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN})).rejects.toMatchObject({code:'run_pending'});
  expect((await row(String(it_.id))).status).toBe('open');
  expect(mocks.materialize).not.toHaveBeenCalled();
 });
 it('records a failed materialize as hook failed, and a later POST re-runs only the hook',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('identity_bs',[A]);
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('stale_computation'));
  const first=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(first.hook).toEqual({stage:'materialize',state:'failed',at:'2026-11-04T09:00:00.000Z',message:'stale_computation'});
  await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x'});
  const later=()=>new Date('2026-11-04T10:00:00.000Z');
  const second=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN,now:later});
  expect(second).toEqual({outcome:'hook_retried',hook:{stage:'done',state:'done',at:'2026-11-04T10:00:00.000Z'}});
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(mocks.materialize).toHaveBeenCalledTimes(2);
  const third=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN});
  expect(third).toEqual({outcome:'already_resolved',hook:{stage:'done',state:'done',at:'2026-11-04T10:00:00.000Z'}});
  expect(mocks.materialize).toHaveBeenCalledTimes(2);
 });
 it('rejects through the generic transition and never touches fact rows',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('same_day_conflict',[A,B]);
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_reject',resolvedBy:ADMIN})).toEqual({outcome:'resolved'});
  expect((await row(String(it_.id)))).toMatchObject({status:'resolved_reject',resolved_by:ADMIN});
  expect(resolve).not.toHaveBeenCalled();expect(mocks.materialize).not.toHaveBeenCalled();
  expect(await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_reject',resolvedBy:ADMIN})).toEqual({outcome:'already_resolved'});
 });
});
```

- [ ] **Step 2: 改路由测试（整文件替换；原 10 个用例保留并改为经内存 `TableClient` 读项，新增 5 个 facts 用例）**

```ts
// src/app/api/admin/dq/quarantine/[id]/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryTableClient } from '@/lib/db/memory-table-client';
import { FactsDbError } from '@/lib/facts/types';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn(), resolve: vi.fn(), resolveFacts: vi.fn(), insert: vi.fn(), from: vi.fn(), client: null as unknown }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));
vi.mock('@/lib/db/table-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/db/table-client')>(), supabaseTableClient: () => mocks.client }));
vi.mock('@/lib/dq/quarantine', () => ({ resolveQuarantine: mocks.resolve }));
vi.mock('@/lib/dq/facts-resolver', () => ({ resolveFactsItem: mocks.resolveFacts }));
vi.mock('@/lib/facts/db', () => ({ supabaseFactsDb: () => ({ facts: 'db' }) }));

import { POST } from './route';

const ID = '3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b';
const ADMIN = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const FACT_A = '20000000-0000-4000-8000-00000000000a', FACT_B = '20000000-0000-4000-8000-00000000000b';
const URL_ = `https://alpha.example/api/admin/dq/quarantine/${ID}`;
const ctx = { params: Promise.resolve({ id: ID }) };
const post = (headers: Record<string, string>, body = JSON.stringify({ status: 'resolved_accept' })) =>
  POST(new Request(URL_, { method: 'POST', headers, body }), ctx);
const json = (body: Record<string, unknown>) => post({ 'content-type': 'application/json' }, JSON.stringify(body));
const HOOK = { stage: 'done', state: 'done', at: '2026-11-04T09:00:00.000Z' };

describe('POST /api/admin/dq/quarantine/[id]', () => {
  let client: ReturnType<typeof memoryTableClient>;
  beforeEach(async () => {
    vi.clearAllMocks();
    client = memoryTableClient({ dq_quarantine: ['id'] });
    mocks.client = client;
    await client.insert('dq_quarantine', { id: ID, dataset: 'macro', table_name: 't', natural_key: 'k', reason_code: 'range', status: 'open', payload: {}, detail: {} });
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.getAdmin.mockReturnValue({ from: mocks.from });
    mocks.resolve.mockResolvedValue('resolved');
    mocks.resolveFacts.mockResolvedValue({ outcome: 'resolved', hook: HOOK, promoted: 1, skipped: 0, chosenFactIds: [FACT_A] });
  });
  const facts = () => client.update('dq_quarantine', { id: ID }, { dataset: 'facts.us', table_name: 'financial_facts', reason_code: 'same_day_conflict', payload: { key: { issuer_id: 'i', market: 'US' }, fact_ids: [FACT_A, FACT_B] } });

  it('resolves a same-origin JSON request', async () => {
    const res = await post({ 'content-type': 'application/json; charset=utf-8', origin: 'https://alpha.example' });
    expect(res.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), ID, { status: 'resolved_accept', resolvedBy: 'admin-1' });
    expect(mocks.resolveFacts).not.toHaveBeenCalled();
  });

  it('writes a research_audit_log row for a resolved item', async () => {
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    await post({ 'content-type': 'application/json' }, JSON.stringify({ status: 'resolved_reject' }));
    expect(mocks.from).toHaveBeenCalledWith('research_audit_log');
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: ADMIN, actor: 'user', action: 'dq.quarantine_resolve', object_type: 'dq', object_id: ID,
      detail: { id: ID, status: 'resolved_reject', outcome: 'resolved' },
    });
  });

  it('does not audit when nothing was resolved', async () => {
    mocks.resolve.mockResolvedValue('already_resolved');
    await post({ 'content-type': 'application/json' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('still answers 200 when the audit insert fails, and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: { message: 'audit down' } });
    const res = await post({ 'content-type': 'application/json' });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('[admin/dq] audit failed', 'audit down');
    spy.mockRestore();
  });

  it('accepts a JSON request without an Origin header', async () => {
    expect((await post({ 'content-type': 'application/json' })).status).toBe(200);
  });

  it('returns 415 for a non-JSON content type', async () => {
    const res = await post({ 'content-type': 'text/plain', origin: 'https://alpha.example' });
    expect(res.status).toBe(415);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('returns 415 when content-type is missing', async () => {
    const res = await POST(new Request(URL_, { method: 'POST', body: new Uint8Array([123, 125]) }), ctx);
    expect(res.status).toBe(415);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('returns 403 for a cross-origin request', async () => {
    const res = await post({ 'content-type': 'application/json', origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('maps already_resolved to 409 and an unknown id to 404 without calling a resolver', async () => {
    mocks.resolve.mockResolvedValue('already_resolved');
    expect((await post({ 'content-type': 'application/json' })).status).toBe(409);
    await client.update('dq_quarantine', { id: ID }, { id: '00000000-0000-4000-8000-00000000dead' });
    const res = await post({ 'content-type': 'application/json' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ id: ID, outcome: 'not_found' });
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });

  it('logs the server error and returns a generic 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.resolve.mockRejectedValue(new Error('db down'));
    const res = await post({ 'content-type': 'application/json' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'quarantine resolve unavailable' });
    expect(spy).toHaveBeenCalledWith('[admin/dq]', 'db down');
    spy.mockRestore();
  });

  it('routes facts.* items through resolveFactsItem with chosen_fact_ids and returns the hook state', async () => {
    await facts();
    mocks.requireAdmin.mockResolvedValue({ id: ADMIN });
    const res = await json({ status: 'resolved_accept', chosen_fact_ids: [FACT_A] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, outcome: 'resolved', hook: HOOK, promoted: 1, skipped: 0, chosen_fact_ids: [FACT_A] });
    expect(mocks.resolveFacts).toHaveBeenCalledWith({ facts: 'db' }, client, expect.objectContaining({ id: ID, dataset: 'facts.us' }), { status: 'resolved_accept', chosenFactIds: [FACT_A], resolvedBy: ADMIN });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ detail: { id: ID, status: 'resolved_accept', outcome: 'resolved', chosen_fact_ids: [FACT_A], hook: HOOK } });
  });

  it('answers 409 run_pending when a member row\'s run is still staged, without auditing', async () => {
    await facts();
    mocks.resolveFacts.mockRejectedValue(new FactsDbError('run_pending'));
    const res = await json({ status: 'resolved_accept' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ id: ID, outcome: 'run_pending' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('answers 200 hook_retried when a failed materialize is re-run, 409 when there is nothing to do', async () => {
    await facts();
    mocks.resolveFacts.mockResolvedValue({ outcome: 'hook_retried', hook: HOOK });
    const first = await json({ status: 'resolved_accept' });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ outcome: 'hook_retried', hook: HOOK });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    mocks.resolveFacts.mockResolvedValue({ outcome: 'already_resolved', hook: HOOK });
    const second = await json({ status: 'resolved_accept' });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ outcome: 'already_resolved', hook: HOOK });
  });

  it('rejects malformed chosen_fact_ids with 400 and an invalid verdict with invalid_choice', async () => {
    await facts();
    for (const bad of ['x', ['nope'], Array.from({ length: 101 }, () => FACT_A), [1]]) {
      const res = await json({ status: 'resolved_accept', chosen_fact_ids: bad });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_chosen_fact_ids' });
    }
    expect(mocks.resolveFacts).not.toHaveBeenCalled();
    mocks.resolveFacts.mockResolvedValue({ outcome: 'invalid_choice' });
    const res = await json({ status: 'resolved_accept', chosen_fact_ids: [FACT_A, FACT_B] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ outcome: 'invalid_choice' });
  });

  it('re-throws other FactsDb errors as a 500', async () => {
    await facts();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.resolveFacts.mockRejectedValue(new FactsDbError('lease_lost'));
    expect((await json({ status: 'resolved_accept' })).status).toBe(500);
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test -- src/lib/dq/facts-resolver.test.ts "src/app/api/admin/dq/quarantine/[id]/route.test.ts"`
Expected: `facts-resolver.test.ts` FAIL（`Failed to resolve import "./facts-resolver"`）；`route.test.ts` FAIL（`vi.mock('@/lib/dq/facts-resolver')` 指向不存在的模块；原路由对 facts.* 项仍调用 `resolveQuarantine`，"routes facts.* items…" 等 5 个用例断言失败）。

- [ ] **Step 4: 实现钩子**

```ts
// src/lib/dq/facts-resolver.ts
// Admin hook for facts.* quarantine items (spec §7.3). Accepting is done entirely by the SQL
// function resolve_facts_quarantine (run_pending check on every member row AND on the item's
// anchor run payload.run_id — so an item without fact rows is also refused while its run is
// staged and stays open until that run is published or abandoned (round-1 #10); status flip,
// verdict in detail.chosen_fact_ids, promotion — one transaction). This module validates the
// verdict (same_day_conflict: chosen ⊆ payload.fact_ids with one value), calls the function,
// then runs materialize and records detail.hook = {stage, state, at, message?}; a later POST on
// a resolved_accept item with hook.state='failed' re-runs materialize only (idempotent).
// resolved_reject is the generic flip from quarantine.ts; fact rows stay quarantined.
import type {Row,TableClient} from '../db/table-client';
import type {FactsDb,Market} from '../facts/types';
import {decimalEquals} from '../facts/json-numbers';
import {materialize} from '../facts/derive';
import {resolveQuarantine} from './quarantine';
import type {QuarantineStatus} from './quarantine';

export interface HookState{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice';
export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;promoted?:number;skipped?:number;chosenFactIds?:string[]}
export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];resolvedBy:string;now?:()=>Date}
/** Reason codes whose items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
export const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
const TABLE='dq_quarantine';
const MARKETS:readonly string[]=['US','CN'];

interface Payload{key?:Record<string,string|null>;fact_ids?:string[]}
const payloadOf=(item:Row):Payload=>(item.payload??{}) as Payload;
const detailOf=(item:Row):Record<string,unknown>=>(item.detail??{}) as Record<string,unknown>;
const hookOf=(item:Row):HookState|undefined=>detailOf(item).hook as HookState|undefined;
const target=(item:Row):{issuer:string;market:Market}|null=>{
 const key=payloadOf(item).key;const issuer=key?.issuer_id;const market=key?.market;
 return typeof issuer==='string'&&typeof market==='string'&&MARKETS.includes(market)?{issuer,market:market as Market}:null;
};

/** Re-reads the item (the SQL function may have written detail.chosen_fact_ids) and merges `hook` into detail. */
async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
 const [fresh]=await tables.select(TABLE,{id},{limit:1});
 await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),hook}});
 return hook;
}

async function runHook(db:FactsDb,tables:TableClient,id:string,issuer:string,market:Market,now:()=>Date):Promise<HookState>{
 let hook:HookState;
 try{await materialize(db,issuer,market);hook={stage:'done',state:'done',at:now().toISOString()};}
 catch(e){hook={stage:'materialize',state:'failed',at:now().toISOString(),message:(e instanceof Error?e.message:String(e)).slice(0,200)};}
 return writeHook(tables,id,hook);
}

/**
 * Resolves one facts.* item. Throws FactsDbError('run_pending') straight from the FactsDb when any
 * member row's run is still staged (the route answers 409 and the item stays open).
 */
export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
 const now=input.now??(()=>new Date());const id=String(item.id);const where=target(item);
 if(item.status!=='open'){
  const hook=hookOf(item);
  if(item.status==='resolved_accept'&&hook?.state==='failed'&&where!==null)return {outcome:'hook_retried',hook:await runHook(db,tables,id,where.issuer,where.market,now)};
  return hook===undefined?{outcome:'already_resolved'}:{outcome:'already_resolved',hook};
 }
 if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
 const reason=String(item.reason_code);const members=payloadOf(item).fact_ids??[];
 let chosen:string[]=[];
 if(reason==='same_day_conflict'){
  chosen=[...new Set(input.chosenFactIds??[])];
  if(chosen.some(f=>!members.includes(f)))return {outcome:'invalid_choice'};
  if(chosen.length>1){
   const rows=await db.factsByIds(chosen);
   if(rows.length!==chosen.length||rows.some(r=>!decimalEquals(r.value,rows[0].value)))return {outcome:'invalid_choice'};
  }
 }else if(FACT_ROW_REASONS.includes(reason))chosen=[...members];
 const {promoted,skipped}=await db.resolveFactsQuarantine(id,chosen,input.resolvedBy);
 const hook=where!==null&&FACT_ROW_REASONS.includes(reason)?await runHook(db,tables,id,where.issuer,where.market,now):await writeHook(tables,id,{stage:'done',state:'done',at:now().toISOString()});
 return {outcome:'resolved',hook,promoted,skipped,chosenFactIds:chosen};
}
```

- [ ] **Step 5: 改路由（整文件替换）**

```ts
// src/app/api/admin/dq/quarantine/[id]/route.ts
import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { resolveFactsItem, type FactsResolveOutcome } from '@/lib/dq/facts-resolver';
import { resolveQuarantine, type QuarantineStatus, type ResolveOutcome } from '@/lib/dq/quarantine';
import { supabaseFactsDb } from '@/lib/facts/db';
import { FactsDbError } from '@/lib/facts/types';
import { audit, type ResearchSupabase } from '@/lib/research/store';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resolution = Exclude<QuarantineStatus, 'open'>;
const RESOLUTIONS: readonly Resolution[] = ['resolved_accept', 'resolved_reject'];
const MAX_CHOSEN = 100;
type Outcome = ResolveOutcome | FactsResolveOutcome | 'run_pending';
// facts.* items (spec §7.3): run_pending and already_resolved are 409 (retry later / nothing to do),
// hook_retried is a successful re-run of materialize on an already accepted item.
const HTTP_STATUS: Record<Outcome, number> = { resolved: 200, hook_retried: 200, not_found: 404, already_resolved: 409, run_pending: 409, invalid_choice: 400 };
const AUDITED: readonly Outcome[] = ['resolved', 'hook_retried'];

export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireAdminUser();
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    }
    // Defence in depth against cross-site form posts: a browser-sent Origin must be ours.
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

    const body: unknown = await request.json().catch(() => null);
    const status = (body as { status?: unknown } | null)?.status;
    if (typeof status !== 'string' || !RESOLUTIONS.includes(status as Resolution)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const chosen = (body as { chosen_fact_ids?: unknown } | null)?.chosen_fact_ids;
    if (chosen !== undefined && (!Array.isArray(chosen) || chosen.length > MAX_CHOSEN || chosen.some((v) => typeof v !== 'string' || !UUID_RE.test(v)))) {
      return NextResponse.json({ error: 'invalid_chosen_fact_ids' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    const [item] = await client.select('dq_quarantine', { id }, { limit: 1 });
    if (!item) return NextResponse.json({ id, outcome: 'not_found' }, { status: 404 });

    let outcome: Outcome;
    let extra: Record<string, unknown> = {};
    if (String(item.dataset).startsWith('facts.')) {
      try {
        const r = await resolveFactsItem(supabaseFactsDb(admin), client, item, {
          status: status as Resolution, chosenFactIds: chosen as string[] | undefined, resolvedBy: user.id,
        });
        outcome = r.outcome;
        extra = { hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null };
      } catch (e) {
        if (!(e instanceof FactsDbError) || e.code !== 'run_pending') throw e;
        outcome = 'run_pending';
      }
    } else {
      outcome = await resolveQuarantine(client, id, { status: status as Resolution, resolvedBy: user.id });
    }
    if (AUDITED.includes(outcome)) {
      // Audit trail through the shared research_audit_log helper (service role, scoped to the
      // resolving admin). The resolution is already committed, so an audit failure is logged
      // rather than turned into a 500 that would invite a retry answered with 409.
      try {
        await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.quarantine_resolve', id, { id, status, outcome, ...extra });
      } catch (auditError) {
        console.error('[admin/dq] audit failed', auditError instanceof Error ? auditError.message : auditError);
      }
    }
    return NextResponse.json({ id, outcome, ...extra }, { status: HTTP_STATUS[outcome] });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('[admin/dq]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'quarantine resolve unavailable' }, { status: 500 });
  }
}
```

路由行为：先按 id 读项（无 → 404 `not_found`，不调用任何解析器）；`dataset` 以 `facts.` 开头 → `resolveFactsItem(supabaseFactsDb(admin), client, item, {status, chosenFactIds, resolvedBy})`，`FactsDbError('run_pending')` → 409 `{id, outcome:'run_pending'}`（项保持 open，不写审计）；其他 `FactsDbError` → 500。`resolved`/`hook_retried` 写 `research_audit_log`（`detail` 含 `outcome`、`hook`、`promoted`、`skipped`、`chosen_fact_ids`）。非 facts 数据集仍走 `resolveQuarantine`。`chosen_fact_ids` 必须是 ≤ 100 个 uuid 的数组，否则 400 `invalid_chosen_fact_ids`；钩子判定子集或值不一致 → 400 `{outcome:'invalid_choice'}`。

- [ ] **Step 6: 运行通过**

Run: `npm test -- src/lib/dq/facts-resolver.test.ts "src/app/api/admin/dq/quarantine/[id]/route.test.ts"`
Expected: `facts-resolver.test.ts` 7 passed；`route.test.ts` 15 passed。

- [ ] **Step 7: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 无错误。

- [ ] **Step 8: 提交**

```bash
git add src/lib/dq/facts-resolver.ts src/lib/dq/facts-resolver.test.ts "src/app/api/admin/dq/quarantine/[id]/route.ts" "src/app/api/admin/dq/quarantine/[id]/route.test.ts"
git commit -m "feat(dq): facts quarantine hook — resolve_facts_quarantine, chosen_fact_ids, materialize stage retry" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Part B 自检

- 规格覆盖：§3（34 行目录、单位归一、`MAPPING_GEN/VERSION`）、§4.3 duration 带、§4.7 桶路径与 `upsert:false`、§5.1 可得日期、§5.2 序列/修订/代过滤、§5.3 重复/歧义/争议/同日冲突/计数、§6.1 步骤 1–11 + 批次/新鲜度/空转/截止/`code_version`、§6.2 数值解码、§7.1 五类隔离键与 payload、§7.2 警告汇总、§7.3 钩子与路由、§10 全部错误码、§11.1 本部分单测项（concepts/units/json-numbers/plan/rules/read/sync/路由钩子阶段重试与 `chosen_fact_ids`）。
- 引入的名字见顶部表；文件比骨架多两个：`keys.ts`、`errors.ts`。
- 开放问题（≤5）：1) §3 文本"33 个"与表 34 行不一致——按表实现，请 owner/Codex 确认是否要删一行；2) `gross_margin_range` 上下界规格未定，取 [-1, 1]；3) `SyncDeps` 增加 `parseUs/parseCn` 注入（否则 `sync.ts` 需直接 import Part C 适配器）——Part D 的 `deps.ts` 与 `scripts/facts/sync.ts` 已按此注入；4) Task 8/9 对 `./scope`、`./derive` 的直接 import 要求 Task 14/15 先合入（推荐顺序见顶部）；5) `dryRun` 定义为"抓取 + 解析 + 规划、零写入（不建批次，`status:'dry_run'`，发行人 `outcome:'planned'`）"，与 §6.1"一个 `ingest_batches` 行"在 dry-run 下有偏差，Task 18 Step 3 记入 §16。


## Part C：Task 10–13（F2-3 EDGAR 适配器与美股回放；F2-4 Tushare 三表 + 巨潮挂接）

规格条目：§6.2、§6.3、§4.7（`raw_hash` 定位规则）、§5.1、§11.1、§11.3、§11.4、§12（F2-3/F2-4 退出条件与 `TUSHARE_TOKEN` 降级路径）、§15 第 1 条。

### 本部分依赖的 Part A/B 导出（整合后按 Part A/B 的实际签名；本部分代码已据此改写）

| 模块 | 实际签名与本部分的用法 |
|---|---|
| `src/lib/facts/types.ts` | 共享契约原样 |
| `src/lib/facts/concepts.ts` | `FACT_CONCEPTS:readonly ConceptDef[]`、`MAPPING_GEN` |
| `src/lib/facts/json-numbers.ts` | `scanJsonNumbers(input:Uint8Array|string):unknown`（字符串外的数字字面量 → `{__num:'<原文>'}`）；`decodeWithSchema(value:unknown,schema:NumberSchema,field?:string|null):unknown`（按最近的外层键名：control → number，decimal → `canonicalDecimal` 字符串，其余数字 → number）；`canonicalDecimal(raw:string):string`；`EDGAR_NUMBER_SCHEMA={control:['cik','fy'],decimal:['val']}`（`edgar-companyfacts.ts` 的 `COMPANYFACTS_SCHEMA` 就是它） |
| `src/lib/facts/units.ts` | `normalizeUnit(raw:string):string|null`（单参数；`null` = 不存储的形状）+ `unitKindOf(unit):UnitKind|null`；EDGAR 适配器用 `unitKindOf(normalized)===concept.unitKind` 过滤概念不允许的单位 |
| `src/lib/facts/classify.ts` | `classifyDuration(start:string|null,end:string):Duration|'odd'`（odd 用字面量 `'odd'`） |
| `src/lib/facts/snapshot-store.ts` | `memorySnapshotStore():SnapshotStore&{objects:Map}` |
| `src/lib/facts/pg-facts-db.ts` | `pgFactsDb(pool:Pool):FactsDb` |
| `src/lib/facts/errors.ts` | `SyncError`、`SyncErrorCode`（含 `tushare_unavailable`）；本部分的 `ProviderError` 是它的别名 |
| `src/lib/facts/sync.ts` | `runFactsSync(deps:SyncDeps,opts:SyncOptions):Promise<SyncReceipt>`；`SyncOptions={market;limit;issuerIds?;dryRun;triggeredBy;sinceYear?;mappingGen?}`（`mappingGen` 在 **opts** 上，缺省 `MAPPING_GEN`，供映射升级回放）；`SyncDeps` 比规格 §6.1 多 `parseUs/parseCn`（回放测试注入 `parseCompanyFacts`/`parseTushareStatements`）；`SyncReceipt={batchId;status;counts;errors;issuers;idle;detail:{attempted,published,failed,skipped,idle}}`；`issuerIds` 给定时直接对这些发行人跑、不先 reconcile（scope 行按 id 直取，缺行时 apply 补建、dry-run 构造只读行，不受 `next_due_at` 限制；round-1 #13）；`SyncDeps.coverageCn` 注入 `coverageSummary` 才会出 `coverage_summary`（round-1 #12）；抓取/解析抛出的 `ProviderError`（= `SyncError`）以其 `code` 作为批次错误码 |

### 本部分新增导出

- `src/lib/facts/providers/shared.ts`：`ProviderError`（= Part B 的 `SyncError`，值与类型别名）、`ProviderErrorCode`（= `SyncErrorCode`，`tushare_unavailable` 已加入 Part B 的联合类型：规格 §10 没有 Tushare 不可用一行，补此码，非信息码）、`sha256Hex`、`rawHashOf`、`snapshotOf`、`padCik`、`sleep`、`ymd`、`nearestDuration`、`budgetFor`、`stringifyPreservingNumbers`。
- `src/lib/facts/providers/edgar-companyfacts.ts`：`fetchCompanyFacts`、`parseCompanyFacts`、`decodeCompanyFacts`、`companyFactsUrl`、`MAX_SNAPSHOT_BYTES`、`SEC_MIN_INTERVAL_MS`、`COMPANYFACTS_SCHEMA`、`mapForm`、`mapFp`、`CompanyFactsEntry`、`FetchOptions`、`ParseOptions`。
- `src/lib/data/sources/tushare.ts`：`tushareCallRaw`、`TushareRaw`、`TushareRawOptions`。
- `src/lib/facts/providers/tushare-statements.ts`：`fetchTushareStatements`、`parseTushareStatements`、`coverageSummary`、`CoverageSummary`、`fieldsFor`、`isTushareQuotaMessage`、`addDecimals`、`TUSHARE_APIS`、`TUSHARE_REPORT_TYPES`、`COMMON_FIELDS`、`PAGE_SIZE`。
- `src/lib/facts/providers/tushare-fixtures.ts`（测试与脚本共用）：`loadTushareFixtures`、`tushareFixtureDir`、`TUSHARE_FIXTURE_DIR`、`SYNTHETIC_DIR`。
- `src/lib/facts/providers/cninfo-link.ts`：`linkCninfoFiling`、`matchesAnnouncement`、`cninfoQueryBody`、`KIND_WORDS`、`EXCLUDE`、`CninfoLinkResult`、`LinkFiling`、`LinkIssuer`、`LinkOptions`。
- `ParseResult.oddDuration` 的候选：`duration` 取天数最近的桶（`nearestDuration`），并附加 `periodDays` 属性（契约类型不变，运行时多一个字段，只进隔离 payload）。`ParseResult.ambiguous[].candidates` 每项附加 `frame`（EDGAR）。
- `raw_hash` 规则（两适配器统一）：`sha256Hex(`${snapshot.sha256}\n${locator}`)`；EDGAR locator `facts.<tax>.<tag>.units.<rawUnit>[accn=…,start=…,end=…]`，Tushare locator `<api>:rt<n>:p<k>[end_date=…,ann=…,update_flag=…,row=…]`。
- 黄金文件 `fixtures/gold/plan2.json` 条目在骨架格式上加可选 `as_of`（断言所用 `asOf`，缺省今天）；文件顶层 `required:{US:boolean;CN:boolean}` 控制"必须已录入 AAPL/MSFT（或 600519.SH）"的强制断言。

---

### Task 10: EDGAR companyfacts 适配器 + 录制脚本 + 美股夹具

**Files:**
- Create: `src/lib/facts/providers/shared.ts`
- Create: `src/lib/facts/providers/edgar-companyfacts.ts`
- Create: `src/lib/facts/providers/edgar-companyfacts.test.ts`
- Create: `scripts/facts/record-fixture.ts`
- Create: `src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json`、`CIK0000789019.trimmed.json`、`CIK0000320193.revised.json`（脚本产物）

- [ ] **Step 1: 写失败测试（内联合成文档部分；夹具部分在 Step 6 补）**

```ts
// src/lib/facts/providers/edgar-companyfacts.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import type {Budget,ConceptDef} from '../types';
import {FACT_CONCEPTS} from '../concepts';
import {ProviderError,snapshotOf,stringifyPreservingNumbers} from './shared';
import {companyFactsUrl,fetchCompanyFacts,parseCompanyFacts} from './edgar-companyfacts';
import {scanJsonNumbers} from '../json-numbers';

const budget=(ms:number):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});
const bytes=(s:string)=>new TextEncoder().encode(s);
const doc=(facts:Record<string,unknown>)=>snapshotOf(bytes(JSON.stringify({cik:320193,entityName:'T',facts})),{source:'edgar'});
const entry=(o:Record<string,unknown>)=>({accn:'0000320193-23-000106',fy:2023,fp:'FY',form:'10-K',filed:'2023-11-03',...o});
const revenue=FACT_CONCEPTS.find(c=>c.id==='revenue')!;
const assets=FACT_CONCEPTS.find(c=>c.id==='total_assets')!;
// Mocks are typed against the real callable (round-1 #5): a zero-argument vi.fn() has no call
// arguments to index, and `typeof fetch` takes RequestInfo | URL, not a bare string.
type FetchFn=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;

describe('fetchCompanyFacts',()=>{
 const ok=()=>new Response('{"cik":320193,"facts":{}}',{status:200,headers:{'content-length':'25'}});
 it('backs off 1/2/4/8 s on 429/503 and keeps the 120 ms pace, then returns a sha256-stamped snapshot',async()=>{
  const waits:number[]=[];const sleep=vi.fn(async(ms:number)=>{waits.push(ms);});
  let t=1_000_000;const now=()=>t;
  const fetch=vi.fn<FetchFn>(async()=>{t+=10;return fetch.mock.calls.length<3?new Response('',{status:fetch.mock.calls.length===1?429:503}):ok();});
  const s=await fetchCompanyFacts('0000320193',budget(300_000),{fetch,sleep,now,userAgent:'ua'});
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[0][0]).toBe(companyFactsUrl('0000320193'));
  expect(fetch.mock.calls[0][1]?.headers).toMatchObject({'User-Agent':'ua','Accept-Encoding':'gzip, deflate'});
  expect(waits.filter(w=>w>=1000)).toEqual([1000,2000]);
  expect(waits.filter(w=>w<1000).every(w=>w<=120)).toBe(true);
  expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);expect(s.meta).toMatchObject({source:'edgar',http_status:200,url:companyFactsUrl('0000320193')});
 });
 it('maps 404 → no_companyfacts, exhausted retries → sec_unavailable, >50 MB → snapshot_too_large, no budget → sec_unavailable without a request',async()=>{
  const sleep=async()=>{};
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:async()=>new Response('',{status:404}),sleep})).rejects.toMatchObject({code:'no_companyfacts'});
  const always429=vi.fn<FetchFn>(async()=>new Response('',{status:429}));
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:always429,sleep})).rejects.toMatchObject({code:'sec_unavailable'});
  expect(always429).toHaveBeenCalledTimes(5);
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:async()=>new Response('{}',{status:200,headers:{'content-length':String(51*1024*1024)}}),sleep})).rejects.toMatchObject({code:'snapshot_too_large'});
  const noCall=vi.fn();
  await expect(fetchCompanyFacts('0000000001',budget(15_000),{fetch:noCall,sleep})).rejects.toMatchObject({code:'sec_unavailable'});
  expect(noCall).not.toHaveBeenCalled();
  await expect(fetchCompanyFacts('320193',budget(300_000),{fetch:noCall,sleep})).rejects.toBeInstanceOf(ProviderError);
 });
});

describe('parseCompanyFacts (synthetic documents)',()=>{
 it('decodes val as canonical decimal and control fields as numbers; 20-digit integers survive',()=>{
  // Literals are spliced into the JSON text: a JS number would already have lost the 20 digits.
  const text=JSON.stringify({cik:320193,facts:{'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:'@1'}),entry({start:'2021-09-26',end:'2022-09-24',val:'@2'})]}}}}}).replace('"@1"','1e5').replace('"@2"','12345678901234567890');
  const s=snapshotOf(bytes(text),{source:'edgar'});
  const r=parseCompanyFacts(s,{concepts:[revenue],sinceYear:2019});
  expect(r.candidates.map(c=>c.value).sort()).toEqual(['100000','12345678901234567890']);
  expect(r.filings[0]).toMatchObject({sourceRef:'0000320193-23-000106',fiscalYear:2023,fiscalPeriod:'FY',formType:'10-K',availableDate:'2023-11-03',periodEnd:'2023-09-30',origin:'sec',source:'edgar',market:'US'});
  expect(r.filings[0].url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/');
  for(const c of r.candidates){expect('fy' in c).toBe(false);expect('frame' in c).toBe(false);expect(c.rawHash).toMatch(/^[0-9a-f]{64}$/);}
 });
 it('takes the first tag with an entry per (accn,start,end,unit); lower tags only fill missing periods',()=>{
  const s=doc({'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:1})]}},RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:2}),entry({start:'2021-09-26',end:'2022-09-24',val:3})]}}}});
  const r=parseCompanyFacts(s,{concepts:[revenue],sinceYear:2019});
  expect(r.candidates.map(c=>[c.periodEnd,c.value,c.sourceConcept])).toEqual([['2023-09-30','1','us-gaap:Revenues'],['2022-09-24','3','us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax']]);
 });
 it('same tag, same key, different val → ambiguous with frame in the payload and nothing in candidates',()=>{
  const s=doc({'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:1,frame:'CY2023'}),entry({start:'2022-09-25',end:'2023-09-30',val:2})]}},RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:9})]}}}});
  const r=parseCompanyFacts(s,{concepts:[revenue],sinceYear:2019});
  expect(r.candidates).toEqual([]);
  expect(r.ambiguous).toHaveLength(1);
  expect(r.ambiguous[0].candidates.map(c=>(c as {frame?:string|null}).frame)).toEqual(['CY2023',null]);
 });
 it('instant concepts ignore duration entries, odd durations go to oddDuration with periodDays, missing filed → missingAvailableDate, unit normalised',()=>{
  const s=doc({'us-gaap':{Assets:{units:{USD:[entry({end:'2023-09-30',val:5}),entry({start:'2022-09-25',end:'2023-09-30',val:6})]}},Revenues:{units:{USD:[entry({start:'2023-01-01',end:'2023-05-15',val:7}),{...entry({start:'2022-09-25',end:'2023-09-30',val:8}),filed:undefined}]}}}});
  const r=parseCompanyFacts(s,{concepts:[revenue,assets],sinceYear:2019});
  expect(r.candidates).toEqual([expect.objectContaining({concept:'total_assets',duration:'INSTANT',periodStart:null,value:'5',unit:'USD'})]);
  expect(r.oddDuration).toEqual([expect.objectContaining({concept:'revenue',periodDays:134,duration:'3M'})]);
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({accn:'0000320193-23-000106',tag:'us-gaap:Revenues'})]);
  expect(r.skipped).toContainEqual({reason:'nature_mismatch:us-gaap:Assets',n:1});
 });
 it('dei: tags resolve in facts.dei; sinceYear drops older entries; ifrs-full tags are read after us-gaap',()=>{
  const shares=FACT_CONCEPTS.find(c=>c.id==='shares_outstanding')!;
  const ifrsRevenue:ConceptDef={...revenue,usGaap:[],ifrs:['Revenue']};
  const s=doc({dei:{EntityCommonStockSharesOutstanding:{units:{shares:[entry({end:'2023-10-20',val:15550061000}),entry({end:'2018-10-20',val:1})]}}},'ifrs-full':{Revenue:{units:{CNY:[entry({start:'2023-01-01',end:'2023-12-31',val:3})]}}}});
  const r=parseCompanyFacts(s,{concepts:[shares,ifrsRevenue],sinceYear:2019});
  expect(r.candidates).toEqual([expect.objectContaining({concept:'shares_outstanding',sourceConcept:'dei:EntityCommonStockSharesOutstanding',unit:'shares',value:'15550061000'}),expect.objectContaining({concept:'revenue',sourceConcept:'ifrs-full:Revenue',unit:'CNY'})]);
  expect(r.skipped).toContainEqual({reason:'before_since_year',n:1});
 });
 it('rejects documents without cik/facts as parse_error',()=>{
  const codeOf=(fn:()=>unknown)=>{try{fn();return null;}catch(e){return e instanceof ProviderError?e.code:'not_provider_error';}};
  expect(codeOf(()=>parseCompanyFacts(snapshotOf(bytes('{"facts":{}}'),{source:'edgar'})))).toBe('parse_error');
  expect(codeOf(()=>parseCompanyFacts(snapshotOf(bytes('{nope'),{source:'edgar'})))).toBe('parse_error');
 });
});

describe('stringifyPreservingNumbers',()=>{
 it('re-serialises a scanJsonNumbers tree with the original literals',()=>{
  const src='{"a":1e5,"b":12345678901234567890,"c":[-0.0,"1e5"],"d":{"val":383285000000}}';
  expect(stringifyPreservingNumbers(scanJsonNumbers(bytes(src)))).toBe(src);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/facts/providers/edgar-companyfacts.test.ts`
Expected: FAIL，`Cannot find module './shared'`。

- [ ] **Step 3: 实现 `shared.ts`**

```ts
// src/lib/facts/providers/shared.ts
// Provider plumbing shared by the EDGAR and Tushare adapters (spec §6.2/§6.3; §4.7 raw_hash rule):
// typed provider failures (ProviderError IS SyncError from ../errors, so sync.ts reads `code` as the
// batch error code without re-wrapping), snapshot construction with sha256, the raw_hash locator rule
// sha256(snapshot.sha256 + "\n" + locator), and a number-preserving JSON serialiser used by the
// fixture recorder (never JSON.parse → stringify a financial value).
import {createHash} from 'node:crypto';
import {SyncError} from '../errors';
import type {SyncErrorCode} from '../errors';
import type {Budget,Duration,RawSnapshot} from '../types';

export type ProviderErrorCode=SyncErrorCode;
export const ProviderError=SyncError;
export type ProviderError=SyncError;

export const sha256Hex=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
export const rawHashOf=(snapshotSha256:string,locator:string)=>sha256Hex(`${snapshotSha256}\n${locator}`);
export function snapshotOf(bytes:Uint8Array,meta:Partial<RawSnapshot['meta']>&{source:RawSnapshot['meta']['source']}):RawSnapshot{
 return {bytes,sha256:sha256Hex(bytes),meta:{fetched_at:new Date().toISOString(),http_status:200,...meta}};
}
export const padCik=(cik:string|number)=>String(cik).replace(/^0+/,'').padStart(10,'0');
export const ymd=(d:string)=>/^\d{8}$/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:d;
const BUCKETS:[number,Duration][]=[[90,'3M'],[182,'6M'],[273,'9M'],[365,'12M']];
/** Closest duration bucket for an odd period length; only used to type oddDuration candidates (never written as facts). */
export const nearestDuration=(days:number):Duration=>BUCKETS.reduce((best,cur)=>Math.abs(cur[0]-days)<Math.abs(best[0]-days)?cur:best)[1];
export function sleep(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const onAbort=()=>{clearTimeout(t);reject(signal.reason);};
  const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  signal.addEventListener('abort',onAbort,{once:true});
 });
}
export function budgetFor(ms:number,parent?:AbortSignal):Budget{
 const until=Date.now()+ms;const ctl=new AbortController();
 parent?.addEventListener('abort',()=>ctl.abort(parent.reason),{once:true});
 return {remainingMs:()=>until-Date.now(),signal:ctl.signal};
}
/** JSON text of a scanJsonNumbers() tree with every {__num:'<literal>'} written back as the literal. */
export function stringifyPreservingNumbers(value:unknown,indent?:number):string{
 const text=JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&typeof (v as {__num?:unknown}).__num==='string'?`\u0000${(v as {__num:string}).__num}\u0000`:v,indent);
 return text.replace(/"\\u0000(-?[0-9.eE+]+)\\u0000"/g,'$1');
}
```

- [ ] **Step 4: 实现 `edgar-companyfacts.ts`**

```ts
// src/lib/facts/providers/edgar-companyfacts.ts
// EDGAR companyfacts adapter (spec §6.2; §3 selection rule; §4.7 raw_hash). fetchCompanyFacts: one paced
// GET (≥120 ms between SEC requests per process), timeout min(60 s, remaining − 20 s), 429/503 backoff
// 1→2→4→8 s stopped by the budget, 404 → no_companyfacts, >50 MB → snapshot_too_large. parseCompanyFacts:
// numbers decoded by field schema (cik/fy control, val decimal), per (accn,start,end,unit) the first tag
// in catalogue order with an entry wins and lower tags only fill missing periods, same-tag disagreement
// → ambiguous_value (frame only there), filings.period_end = max end of the accn's duration entries,
// fy/fp only on filings.
import type {Budget,ConceptDef,Duration,FactCandidate,FilingCandidate,FormType,ParseResult,RawSnapshot} from '../types';
import {FACT_CONCEPTS} from '../concepts';
import {EDGAR_NUMBER_SCHEMA,canonicalDecimal,decodeWithSchema,scanJsonNumbers} from '../json-numbers';
import type {NumberSchema} from '../json-numbers';
import {normalizeUnit,unitKindOf} from '../units';
import {classifyDuration} from '../classify';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {nearestDuration,ProviderError,rawHashOf,sleep,snapshotOf} from './shared';

export const companyFactsUrl=(cik10:string)=>`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
export const MAX_SNAPSHOT_BYTES=50*1024*1024;
export const SEC_MIN_INTERVAL_MS=120;
/** Same schema as json-numbers.ts: cik/fy control integers, val decimal text. */
export const COMPANYFACTS_SCHEMA:NumberSchema=EDGAR_NUMBER_SCHEMA;
const BACKOFF_MS=[1000,2000,4000,8000];
const RESERVE_MS=20_000;
let lastSecRequestAt=0;   // module-level: one pace across every issuer handled by this process

export interface FetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}

export async function fetchCompanyFacts(cik10:string,budget:Budget,opts:FetchOptions={}):Promise<RawSnapshot>{
 if(!/^\d{10}$/.test(cik10))throw new ProviderError('parse_error',`bad cik ${cik10}`);
 const doFetch=opts.fetch??fetch,wait=opts.sleep??sleep,now=opts.now??Date.now;
 const ua=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const url=companyFactsUrl(cik10);
 for(let attempt=0;;attempt++){
  const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
  if(timeoutMs<=0)throw new ProviderError('sec_unavailable','budget_exhausted');
  const gap=lastSecRequestAt+SEC_MIN_INTERVAL_MS-now();
  if(gap>0)await wait(gap,budget.signal);
  lastSecRequestAt=now();
  let res:Response;
  try{
   res=await doFetch(url,{headers:{'User-Agent':ua,'Accept-Encoding':'gzip, deflate',Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});
  }catch(e){
   if(budget.signal.aborted)throw new ProviderError('sec_unavailable','budget_aborted');
   if(attempt>=BACKOFF_MS.length)throw new ProviderError('sec_unavailable',`network: ${(e as Error).message}`);
   await backoff(attempt,budget,wait);continue;
  }
  if(res.status===404)throw new ProviderError('no_companyfacts',`404 ${url}`);
  if(res.status===429||res.status===503){
   if(attempt>=BACKOFF_MS.length)throw new ProviderError('sec_unavailable',`http_${res.status}_retries_exhausted`);
   await backoff(attempt,budget,wait);continue;
  }
  if(!res.ok)throw new ProviderError('sec_unavailable',`http_${res.status}`);
  const declared=Number(res.headers.get('content-length')??'0');
  if(declared>MAX_SNAPSHOT_BYTES)throw new ProviderError('snapshot_too_large',`content-length ${declared}`);
  return snapshotOf(await readBounded(res,MAX_SNAPSHOT_BYTES),{source:'edgar',url,http_status:res.status});
 }
}
async function backoff(attempt:number,budget:Budget,wait:typeof sleep){
 const ms=BACKOFF_MS[attempt];
 if(budget.remainingMs()-ms<=RESERVE_MS)throw new ProviderError('sec_unavailable','budget_exhausted_during_backoff');
 await wait(ms,budget.signal);
}
async function readBounded(res:Response,max:number):Promise<Uint8Array>{
 if(!res.body){const b=new Uint8Array(await res.arrayBuffer());if(b.byteLength>max)throw new ProviderError('snapshot_too_large',String(b.byteLength));return b;}
 const reader=res.body.getReader();const chunks:Uint8Array[]=[];let total=0;
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new ProviderError('snapshot_too_large',`>${max}`);}chunks.push(value);}
 const out=new Uint8Array(total);let o=0;for(const c of chunks){out.set(c,o);o+=c.byteLength;}
 return out;
}

export interface CompanyFactsEntry{start?:string;end:string;val:string;accn:string;fy:number|null;fp:string|null;form:string;filed:string;frame?:string}
export interface CompanyFactsDoc{cik:number;entityName?:string;facts:Record<string,Record<string,{units:Record<string,CompanyFactsEntry[]>}>>}
export function decodeCompanyFacts(bytes:Uint8Array):CompanyFactsDoc{
 let d:Partial<CompanyFactsDoc>;
 try{d=decodeWithSchema(scanJsonNumbers(bytes),COMPANYFACTS_SCHEMA) as Partial<CompanyFactsDoc>;}catch(e){throw new ProviderError('parse_error',`json: ${(e as Error).message}`);}
 if(!d||typeof d!=='object'||typeof d.cik!=='number'||!d.facts||typeof d.facts!=='object')throw new ProviderError('parse_error','companyfacts shape: cik/facts');
 return d as CompanyFactsDoc;
}
const FORM_TYPES:readonly string[]=['10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A'];
export const mapForm=(form:unknown):FormType=>typeof form==='string'&&FORM_TYPES.includes(form)?form as FormType:'other';
export const mapFp=(fp:unknown):FilingCandidate['fiscalPeriod']=>fp==='FY'||fp==='Q1'||fp==='Q2'||fp==='Q3'?fp:null;
const qualify=(tag:string,tax:string)=>tag.includes(':')?tag:`${tax}:${tag}`;
export const tagsOf=(c:ConceptDef)=>[...c.usGaap.map(t=>qualify(t,'us-gaap')),...c.ifrs.map(t=>qualify(t,'ifrs-full'))];
const daysBetween=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/86_400_000);
const isDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);

export interface ParseOptions{concepts?:readonly ConceptDef[];sinceYear?:number;today?:Date}   // readonly: FACT_CONCEPTS is readonly (round-1 #4)
export function parseCompanyFacts(snapshot:RawSnapshot,opts:ParseOptions={}):ParseResult{
 const doc=decodeCompanyFacts(snapshot.bytes);
 const concepts=opts.concepts??FACT_CONCEPTS;
 const sinceDate=`${opts.sinceYear??(opts.today??new Date()).getUTCFullYear()-10}-01-01`;
 const cikPlain=String(doc.cik);
 const out:ParseResult={candidates:[],filings:[],skipped:[],ambiguous:[],oddDuration:[],missingAvailableDate:[]};
 const skip=new Map<string,number>();const bump=(r:string)=>skip.set(r,(skip.get(r)??0)+1);
 const filings=new Map<string,FilingCandidate&{maxDurationEnd:string|null}>();
 const touchFiling=(e:CompanyFactsEntry,isDuration:boolean)=>{
  let f=filings.get(e.accn);
  if(!f){f={sourceRef:e.accn,market:'US',source:'edgar',origin:'sec',formType:mapForm(e.form),fiscalYear:typeof e.fy==='number'?e.fy:null,fiscalPeriod:mapFp(e.fp),periodEnd:null,availableDate:e.filed,url:`https://www.sec.gov/Archives/edgar/data/${cikPlain}/${e.accn.replace(/-/g,'')}/`,maxDurationEnd:null};filings.set(e.accn,f);}
  if(isDuration&&(f.maxDurationEnd===null||e.end>f.maxDurationEnd))f.maxDurationEnd=e.end;
 };
 for(const concept of concepts){
  const taken=new Set<string>();
  for(const qualified of tagsOf(concept)){
   const [tax,tag]=qualified.split(':');
   const units=doc.facts[tax]?.[tag]?.units;
   if(!units||typeof units!=='object')continue;
   const groups=new Map<string,{entries:CompanyFactsEntry[];unit:string;rawUnit:string}>();
   for(const [rawUnit,entries] of Object.entries(units)){
    if(!Array.isArray(entries))continue;
    // normalizeUnit (units.ts) is shape-only; the concept's unit kind is enforced here (§3: a money
    // concept never takes 'shares', 'pure' matches no concept).
    const normalized=normalizeUnit(rawUnit);
    const unit=normalized!==null&&unitKindOf(normalized)===concept.unitKind?normalized:null;
    if(unit===null){bump(`unit_not_allowed:${qualified}:${rawUnit}`);continue;}
    for(const e of entries){
     if(!isDate(e?.end)||typeof e.val!=='string'||typeof e.accn!=='string'){bump('entry_shape');continue;}
     if(e.end<sinceDate){bump('before_since_year');continue;}
     const isDuration=isDate(e.start);
     if(isDuration!==(concept.nature==='duration')){bump(`nature_mismatch:${qualified}`);continue;}
     if(!isDate(e.filed)){out.missingAvailableDate.push({accn:e.accn,tag:qualified,start:e.start??null,end:e.end,unit:rawUnit,form:e.form??null});continue;}
     touchFiling(e,isDuration);
     const key=`${e.accn}|${e.start??''}|${e.end}|${unit}`;
     if(taken.has(key))continue;                       // a higher-priority tag already covers this period
     const g=groups.get(key)??{entries:[],unit,rawUnit};g.entries.push(e);groups.set(key,g);
    }
   }
   for(const [key,g] of groups){
    taken.add(key);
    const first=g.entries[0];
    const locator=(e:CompanyFactsEntry)=>`facts.${tax}.${tag}.units.${g.rawUnit}[accn=${e.accn},start=${e.start??''},end=${e.end}]`;
    const build=(e:CompanyFactsEntry,duration:Duration):FactCandidate=>({concept:concept.id,sourceConcept:qualified,statement:concept.statement,periodStart:e.start??null,periodEnd:e.end,duration,value:canonicalDecimal(e.val),unit:g.unit,consolidation:'consolidated',filingRef:e.accn,rawHash:rawHashOf(snapshot.sha256,locator(e))});
    const duration=first.start?classifyDuration(first.start,first.end):'INSTANT';
    if(duration==='odd'){const days=daysBetween(first.start!,first.end);out.oddDuration.push(Object.assign(build(first,nearestDuration(days)),{periodDays:days}));continue;}
    if(new Set(g.entries.map(e=>canonicalDecimal(e.val))).size>1){
     out.ambiguous.push({key:`${concept.id}:${first.start??''}:${first.end}:${g.unit}:${first.accn}`,candidates:g.entries.map(e=>Object.assign(build(e,duration),{frame:e.frame??null}))});
     continue;
    }
    out.candidates.push(build(first,duration));
   }
  }
 }
 for(const {maxDurationEnd,...row} of filings.values())out.filings.push({...row,periodEnd:maxDurationEnd});
 out.filings.sort((a,b)=>a.availableDate.localeCompare(b.availableDate)||a.sourceRef.localeCompare(b.sourceRef));
 out.skipped=[...skip].map(([reason,n])=>({reason,n}));
 return out;
}
```

- [ ] **Step 5: 运行合成部分通过**

Run: `npm test -- src/lib/facts/providers/edgar-companyfacts.test.ts`
Expected: 9 passed。

- [ ] **Step 6: 写录制脚本**

```ts
/**
 * Record provider fixtures for the facts tests (plan 2 §11.1). Modes:
 *   npx tsx scripts/facts/record-fixture.ts --edgar <cik>                 → src/lib/facts/fixtures/edgar/CIK<10>.trimmed.json
 *   npx tsx scripts/facts/record-fixture.ts --edgar-revise <cik>          → CIK<10>.revised.json (trimmed + one later 10-K entry)
 *   node --env-file=<仓库外 env 文件> --import tsx scripts/facts/record-fixture.ts --tushare <ts_code> [--since-year y]
 *                                                                         → fixtures/tushare/<ts_code>.<api>.rt<n>.p<k>.json + .meta.json
 *   npx tsx scripts/facts/record-fixture.ts --cninfo <ts_code> <YYYY-MM-DD> <fiscal_year> <annual|semiannual|q1|q3>
 *                                                                         → fixtures/cninfo/<ts_code>-<fiscal_year>-<form_type>.json
 * EDGAR trimming keeps only catalogue tags and entries with end >= 2019-01-01 and re-serialises with the
 * original number literals (scanJsonNumbers + stringifyPreservingNumbers; no value round-trips through a JS
 * number). Tushare pages are stored byte-exact; tokens never reach disk. Exit 2 on bad arguments.
 */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FACT_CONCEPTS} from '../../src/lib/facts/concepts';
import {scanJsonNumbers} from '../../src/lib/facts/json-numbers';
import {budgetFor,padCik,sha256Hex,stringifyPreservingNumbers} from '../../src/lib/facts/providers/shared';
import {companyFactsUrl,fetchCompanyFacts,tagsOf} from '../../src/lib/facts/providers/edgar-companyfacts';
import {fetchTushareStatements} from '../../src/lib/facts/providers/tushare-statements';
import {cninfoQueryBody,CNINFO_PAGE_SIZE} from '../../src/lib/facts/providers/cninfo-link';
import {CNINFO_HISTORY,resolveOrgId} from '../../src/lib/research/ingest/collectors/cninfo';
import {createClient} from '../../src/lib/research/ingest/collectors/shared';

const ROOT=fileURLToPath(new URL('../../src/lib/facts/fixtures/',import.meta.url));
const SINCE_END='2019-01-01';
const USAGE='usage: record-fixture.ts --edgar <cik> | --edgar-revise <cik> | --tushare <ts_code> [--since-year y] | --cninfo <ts_code> <YYYY-MM-DD> <fiscal_year> <annual|semiannual|q1|q3>';
const TAGS=new Set(FACT_CONCEPTS.flatMap(tagsOf));
// The revision used by sync-us.integration.test.ts: FY2023 revenue re-disclosed by a later 10-K with a
// different value. The base entry is selected by accn AND the exact period (a 10-K carries comparative
// years under the same accn, round-1 #18) and its literal must equal baseVal before anything is written;
// the same start/end/val/filed literals are asserted downstream (Task 10 Step 9, Task 11).
const REVISION={baseAccn:'0000320193-23-000106',tag:'RevenueFromContractWithCustomerExcludingAssessedTax',start:'2022-09-25',end:'2023-09-30',baseVal:'383285000000',accn:'0000320193-25-900001',fy:'2025',filed:'2025-11-01',val:'383285000001'};
type Tree=Record<string,unknown>;
const num=(v:unknown)=>v&&typeof v==='object'&&typeof (v as {__num?:unknown}).__num==='string'?(v as {__num:string}).__num:null;
const write=(rel:string,text:string)=>{const p=join(ROOT,rel);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,text);console.log(`wrote ${p} (${text.length} chars)`);};
const fail=(msg:string):never=>{console.error(msg);process.exit(2);};

function trimCompanyFacts(tree:Tree):{facts:Tree;kept:string[]}{
 const facts:Tree={};const kept:string[]=[];
 for(const [tax,tags] of Object.entries((tree.facts??{}) as Record<string,Record<string,{units?:Record<string,Tree[]>}>>)){
  for(const [tag,body] of Object.entries(tags)){
   if(!TAGS.has(`${tax}:${tag}`))continue;
   const units:Tree={};
   for(const [unit,entries] of Object.entries(body.units??{})){const keep=entries.filter(e=>typeof e.end==='string'&&e.end>=SINCE_END);if(keep.length)units[unit]=keep;}
   if(!Object.keys(units).length)continue;
   ((facts[tax]??={}) as Tree)[tag]={units};kept.push(`${tax}:${tag}`);
  }
 }
 return {facts,kept:kept.sort()};
}

async function recordEdgar(cik:string){
 const cik10=padCik(cik);const url=companyFactsUrl(cik10);
 const snap=await fetchCompanyFacts(cik10,budgetFor(300_000));
 const tree=scanJsonNumbers(snap.bytes) as Tree;
 const {facts,kept}=trimCompanyFacts(tree);
 const out={__recorded:{at:new Date().toISOString(),source_sha256:snap.sha256,url,bytes:snap.bytes.byteLength,trimmed:{since_end:SINCE_END,tags:kept}},cik:tree.cik,entityName:tree.entityName,facts};
 write(`edgar/CIK${cik10}.trimmed.json`,stringifyPreservingNumbers(out,1));
}
function reviseEdgar(cik:string){
 const cik10=padCik(cik);
 const tree=scanJsonNumbers(new Uint8Array(readFileSync(join(ROOT,`edgar/CIK${cik10}.trimmed.json`)))) as Tree;
 const units=(((tree.facts as Tree)['us-gaap'] as Tree)[REVISION.tag] as {units:Record<string,Tree[]>}).units;
 const usd=units.USD??fail(`no USD entries for ${REVISION.tag}`);
 const base=usd.find(e=>e.accn===REVISION.baseAccn&&e.fp==='FY'&&e.start===REVISION.start&&e.end===REVISION.end)??fail(`base entry ${REVISION.baseAccn} for ${REVISION.start}..${REVISION.end} not found`);
 if(num(base.val)!==REVISION.baseVal)fail(`base value ${num(base.val)} differs from the expected ${REVISION.baseVal}: verify the fixture (Task 10 Step 8) before revising`);
 if(usd.some(e=>e.accn===REVISION.accn))fail('already revised');
 usd.push({start:REVISION.start,end:REVISION.end,val:{__num:REVISION.val},accn:REVISION.accn,fy:{__num:REVISION.fy},fp:'FY',form:'10-K',filed:REVISION.filed,frame:'CY2023'});
 (tree.__recorded as Tree).revision={...REVISION};
 write(`edgar/CIK${cik10}.revised.json`,stringifyPreservingNumbers(tree,1));
}
async function recordTushare(tsCode:string,sinceYear:number){
 if(!process.env.TUSHARE_TOKEN)fail('TUSHARE_TOKEN missing: run with node --env-file=<仓库外文件> --import tsx …');
 const snaps=await fetchTushareStatements(tsCode,sinceYear,budgetFor(600_000));
 for(const s of snaps){
  const base=`tushare/${tsCode}.${s.meta.api}.rt${(s.meta.params as {report_type:string}).report_type}.p${s.meta.page}`;
  write(`${base}.json`,Buffer.from(s.bytes).toString('utf8'));
  write(`${base}.meta.json`,JSON.stringify({recorded_at:s.meta.fetched_at,sha256:s.sha256,api:s.meta.api,params:s.meta.params,fields:s.meta.fields,page:s.meta.page,has_more:s.meta.has_more,http_status:s.meta.http_status},null,1));
 }
 console.log(JSON.stringify({ts_code:tsCode,pages:snaps.length,by_api:snaps.map(s=>`${s.meta.api}:rt${(s.meta.params as {report_type:string}).report_type}:p${s.meta.page}:has_more=${s.meta.has_more}`)}));
}
async function recordCninfo(tsCode:string,availableDate:string,fiscalYear:string,formType:string){
 const m=/^(\d{6})\.(SH|SZ)$/.exec(tsCode)??fail('ts_code must be SH/SZ');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(availableDate)||!/^\d{4}$/.test(fiscalYear)||!['annual','semiannual','q1','q3'].includes(formType))fail(USAGE);
 const client=createClient({ctx:null as never,companies:[],since:''},500);
 const org=await resolveOrgId(m[1],{})??fail(`no orgId for ${tsCode}`);
 const pages:unknown[]=[];
 for(let pageNum=1;;pageNum++){
  const res=await client.post(CNINFO_HISTORY,cninfoQueryBody({code:m[1],orgId:org.orgId,column:m[2]==='SH'?'sse':'szse',availableDate,pageNum}));
  if(!res.ok)fail(`cninfo ${res.status}`);
  const page=await res.json() as {announcements?:unknown[]|null;hasMore?:boolean};
  pages.push(page);
  if(!page.hasMore||(page.announcements??[]).length<CNINFO_PAGE_SIZE)break;
 }
 write(`cninfo/${tsCode}-${fiscalYear}-${formType}.json`,JSON.stringify({__recorded:{at:new Date().toISOString(),url:CNINFO_HISTORY,ts_code:tsCode,org_id:org.orgId,available_date:availableDate,fiscal_year:Number(fiscalYear),form_type:formType},pages},null,1));
}

async function main(){
 const [mode,...rest]=process.argv.slice(2);
 if(mode==='--edgar'&&rest[0])return recordEdgar(rest[0]);
 if(mode==='--edgar-revise'&&rest[0])return reviseEdgar(rest[0]);
 if(mode==='--tushare'&&rest[0]){const i=rest.indexOf('--since-year');return recordTushare(rest[0],i>=0?Number(rest[i+1]):new Date().getUTCFullYear()-10);}
 if(mode==='--cninfo'&&rest.length===4)return recordCninfo(rest[0],rest[1],rest[2],rest[3]);
 fail(USAGE);
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
```

（`cninfoQueryBody`、`CNINFO_PAGE_SIZE` 在 Task 13 创建；本任务提交前先在 `src/lib/facts/providers/cninfo-link.ts` 放入 Task 13 Step 3 的完整文件即可，或把 `--cninfo` 分支与两个 import 留到 Task 13 再加入——**选后者**：Task 10 提交的脚本不含 `--cninfo` 分支与这两个 import，Task 13 Step 5 补上。`fetchTushareStatements` 同理在 Task 12 创建：Task 10 提交时不含 `--tushare` 分支与该 import，Task 12 Step 7 补上。）

- [ ] **Step 7: 录制美股夹具**

Run:
```bash
npx tsx scripts/facts/record-fixture.ts --edgar 320193
npx tsx scripts/facts/record-fixture.ts --edgar 789019
npx tsx scripts/facts/record-fixture.ts --edgar-revise 320193
ls -la src/lib/facts/fixtures/edgar/
```
Expected: 三个文件；trimmed 各约 0.2–0.6 MB（原始 companyfacts 十几 MB）。若 SEC 返回 403，设置 `EDGAR_USER_AGENT='<姓名> <邮箱>'` 重试。

- [ ] **Step 8: 核对夹具字面量（文档化步骤，不凭记忆写数字；含修订夹具的期间核对，round-1 #18）**

Run:
```bash
node -e "
const {readFileSync}=require('fs');
const d=JSON.parse(readFileSync('src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json','utf8'));
const u=d.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD;
console.log('AAPL FY2023 rows', u.filter(e=>e.end==='2023-09-30'&&e.fp==='FY').map(e=>[e.accn,e.filed,e.start,e.val]));
const m=JSON.parse(readFileSync('src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json','utf8'));
console.log('MSFT FY2023 rows', m.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.filter(e=>e.end==='2023-06-30'&&e.fp==='FY').map(e=>[e.accn,e.filed,e.start,e.val]));
const r=JSON.parse(readFileSync('src/lib/facts/fixtures/edgar/CIK0000320193.revised.json','utf8'));
const rev=r.__recorded.revision; const added=r.facts['us-gaap'][rev.tag].units.USD.filter(e=>e.accn===rev.accn);
const base=u.find(e=>e.accn===rev.baseAccn&&e.fp==='FY'&&e.start===rev.start&&e.end===rev.end);
console.log('revision', rev, 'added', added);
const ok=added.length===1&&added[0].start===rev.start&&added[0].end===rev.end&&String(added[0].val)===rev.val&&added[0].filed===rev.filed&&!!base&&String(base.val)===rev.baseVal&&rev.start==='2022-09-25'&&rev.end==='2023-09-30'&&rev.val==='383285000001'&&rev.filed==='2025-11-01';
console.log(ok?'REVISION OK':'REVISION MISMATCH'); process.exitCode=ok?0:1;
"
```
Expected（待核对的预期值；以打印结果为准）：AAPL 第一行 `['0000320193-23-000106','2023-11-03','2022-09-25',383285000000]`，并有更晚 10-K 的同期行（同一 accn 下还有 FY2022/FY2021 的比较期行——修订脚本按 accn **加** start/end 选基准行，不会取到它们）；MSFT 一行 `filed 2023-07-27`、`val 211915000000`；最后一行 `REVISION OK`（脚本退出码 0）。**若打印值与 Step 9 / Task 11 测试里的字面量（`383285000000`、`383285000001`、`2022-09-25`、`2023-09-30`、`2025-11-01`、`0000320193-25-900001`）不同，以夹具为准修改 `REVISION` 常量与测试字面量，重跑 Step 7 的 `--edgar-revise`，并在提交信息里写明"literals verified against fixture sha256 <…>"。**

- [ ] **Step 9: 追加夹具测试**

在 `edgar-companyfacts.test.ts` 末尾追加：

```ts
const fx=(n:string)=>snapshotOf(new Uint8Array(readFileSync(new URL(`../fixtures/edgar/${n}`,import.meta.url))),{source:'edgar'});
const canonical=/^-?(0|[1-9]\d*)(\.\d*[1-9])?$/;
describe('parseCompanyFacts (recorded AAPL / MSFT fixtures)',()=>{
 const aapl=parseCompanyFacts(fx('CIK0000320193.trimmed.json'),{sinceYear:2019});
 const msft=parseCompanyFacts(fx('CIK0000789019.trimmed.json'),{sinceYear:2019});
 it('AAPL FY2023 revenue comes from the 2023-11-03 10-K via the second us-gaap tag, re-disclosed by later 10-Ks',()=>{
  const fy23=aapl.candidates.filter(c=>c.concept==='revenue'&&c.periodEnd==='2023-09-30'&&c.duration==='12M');
  expect(fy23.length).toBeGreaterThanOrEqual(2);
  expect(fy23.find(c=>c.filingRef==='0000320193-23-000106')).toMatchObject({value:'383285000000',unit:'USD',periodStart:'2022-09-25',sourceConcept:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',statement:'IS'});
  expect(aapl.filings.find(f=>f.sourceRef==='0000320193-23-000106')).toMatchObject({formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',availableDate:'2023-11-03',periodEnd:'2023-09-30'});
  expect(new Set(fy23.map(c=>c.value)).size).toBe(1);
 });
 it('MSFT FY2023 (2023-06-30) revenue is a 10-K FY row in USD',()=>{
  const row=msft.candidates.find(c=>c.concept==='revenue'&&c.periodEnd==='2023-06-30'&&c.duration==='12M');
  expect(row).toBeDefined();
  expect(msft.filings.find(f=>f.sourceRef===row!.filingRef)).toMatchObject({formType:'10-K',fiscalPeriod:'FY',fiscalYear:2023});
  expect(row!.value).toBe('211915000000');
 });
 it('every candidate is canonical, keyed to a filing, instant iff no start; filings are sorted by availableDate',()=>{
  for(const r of [aapl,msft]){
   const refs=new Set(r.filings.map(f=>f.sourceRef));
   for(const c of r.candidates){expect(c.value).toMatch(canonical);expect(refs.has(c.filingRef)).toBe(true);expect(c.periodStart===null).toBe(c.duration==='INSTANT');expect(c.consolidation).toBe('consolidated');}
   for(const f of r.filings){expect(f.availableDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);expect(['10-K','10-Q','10-K/A','10-Q/A','other']).toContain(f.formType);}
   expect(r.filings.map(f=>f.availableDate)).toEqual([...r.filings.map(f=>f.availableDate)].sort());
   expect(r.missingAvailableDate).toEqual([]);
   expect(r.candidates.some(c=>c.concept==='total_assets'&&c.duration==='INSTANT')).toBe(true);
   expect(r.candidates.some(c=>c.concept==='revenue'&&c.duration==='3M')).toBe(true);
  }
 });
 it('the revised fixture adds exactly one later FY2023 revenue disclosure with a different value',()=>{
  const rev=parseCompanyFacts(fx('CIK0000320193.revised.json'),{sinceYear:2019});
  const added=rev.candidates.filter(c=>c.concept==='revenue'&&c.periodEnd==='2023-09-30'&&c.duration==='12M'&&c.filingRef==='0000320193-25-900001');
  expect(added).toEqual([expect.objectContaining({value:'383285000001',periodStart:'2022-09-25'})]);
  expect(rev.filings.find(f=>f.sourceRef==='0000320193-25-900001')).toMatchObject({availableDate:'2025-11-01',formType:'10-K',fiscalYear:2025});
  expect(rev.candidates.length).toBe(aapl.candidates.length+1);
 });
});
```

- [ ] **Step 10: 运行通过 + 门禁**

Run: `npm test -- src/lib/facts/providers/edgar-companyfacts.test.ts && npm run typecheck && npm run lint`
Expected: 13 passed；typecheck、lint 无输出。

- [ ] **Step 11: 提交**

```bash
git add src/lib/facts/providers/shared.ts src/lib/facts/providers/edgar-companyfacts.ts src/lib/facts/providers/edgar-companyfacts.test.ts scripts/facts/record-fixture.ts src/lib/facts/fixtures/edgar/
git commit -m "feat(facts): EDGAR companyfacts adapter, fixture recorder and AAPL/MSFT trimmed fixtures" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 美股离线集成回放 `sync-us.integration.test.ts`（critical）+ 黄金文件

**Files:**
- Create: `src/lib/facts/fixtures/gold/plan2.json`
- Create: `src/lib/facts/sync-us.integration.test.ts`
- Modify: `scripts/ci/research-checks.ts`

- [ ] **Step 1: 黄金文件（模板，owner 录入前 `recorded_by: '<pending>'`；`required.US` 默认 true，是真正的门禁）**

```json
{
 "version": 1,
 "note": "Plan 2 §11.4 gold assertions (round-1 #19). A human transcribes value/page from the primary document. required.US is TRUE BY DEFAULT: sync-us.integration.test.ts fails until every fixture-backed US issuer (AAPL, MSFT) has at least one entry whose recorded_by is not '<pending>' — that failure is the designed incomplete status, never flip it to false. required.CN flips to true when the A-share fixtures are recorded. ready: the owner sets it to true when the whole file is transcribed; from then on any '<pending>' entry is a failure and the suite enforces the §11.4 matrix (>= 6 issuers, each >= 2 period_ends and >= 6 concepts) and that every asserted issuer has a recorded fixture. as_of is the asOf used to read the fact (defaults to today).",
 "ready": false,
 "required": {"US": true, "CN": false},
 "entries": [
  {"issuer": {"ticker": "AAPL", "market": "US"}, "concept": "revenue", "period_end": "2023-09-30", "unit": "USD", "value": "383285000000", "as_of": "2023-11-03",
   "source": {"document": "Apple Inc. Form 10-K for the fiscal year ended September 30, 2023 (accession 0000320193-23-000106)", "page_or_row": "<pending>", "url": "https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/"},
   "recorded_by": "<pending>", "recorded_at": null},
  {"issuer": {"ticker": "MSFT", "market": "US"}, "concept": "revenue", "period_end": "2023-06-30", "unit": "USD", "value": "211915000000", "as_of": "2023-07-27",
   "source": {"document": "Microsoft Corp. Form 10-K for the fiscal year ended June 30, 2023", "page_or_row": "<pending>", "url": "<pending>"},
   "recorded_by": "<pending>", "recorded_at": null},
  {"issuer": {"ticker": "600519.SH", "market": "CN"}, "concept": "revenue", "period_end": "2023-12-31", "unit": "CNY", "value": "<pending>", "as_of": null,
   "source": {"document": "贵州茅台 2023 年年度报告（巨潮公告）", "page_or_row": "<pending>", "url": "<pending>"},
   "recorded_by": "<pending>", "recorded_at": null}
 ]
}
```

文件模式（供 owner 录入）：`entries[]` 每项 `{issuer:{ticker,market}, concept, period_end, unit, value(规范十进制字符串), as_of?(YYYY-MM-DD|null), source:{document,page_or_row,url}, recorded_by(姓名|'<pending>'), recorded_at(ISO|null)}`；顶层 `ready:boolean`、`required:{US,CN}`。规格要求 6 家 × 2 期 × 6 科目；模板只给 3 条示例，owner 按同格式扩充。**门禁语义（round-1 #19）**：`required.US=true`（默认）→ AAPL 与 MSFT 各至少一条已录入条目，否则套件失败并打印 `gold entry for <ticker> is still <pending>`；`ready=true` → 文件内不得再有 `<pending>`、每个被断言的美股发行人必须有 `fixtures/edgar/CIK<10>.trimmed.json`（`record-fixture.ts --edgar`，并把它加进测试的 `CIK`/`FIX` 表）、且满足 ≥ 6 家 × 每家 ≥ 2 期 × ≥ 6 科目；已录入条目逐条从 `read_facts` 回放核对 `value_text`。owner 步骤见 runbook 8.11-6。

- [ ] **Step 2: 写集成测试（先失败）**

```ts
// src/lib/facts/sync-us.integration.test.ts
// Plan 2 §11.3 offline replay on real PostgreSQL: AAPL + MSFT trimmed companyfacts fixtures injected as
// fetchUs, pgFactsDb + pgTableClient, memory snapshot store. Two runs (second = all duplicates), a later
// 10-K revision fixture (versioned=1, asOf replay on both sides; the revised fixture then STAYS active so
// later generations cover it, round-1 #15), mapping-gen bump (old generation invisible but fetchable by id;
// the active generation is carried forward to every later run), two concurrent runs on one issuer (lease),
// stale replaceMetrics rejected, materialize twice identical (§11.3; derive.ts lands before this task,
// round-1 #20), and the US gold gate (fixtures/gold/plan2.json, round-1 #19).
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgFactsDb} from './pg-facts-db';
import {memorySnapshotStore} from './snapshot-store';
import {runFactsSync,type SyncDeps,type SyncOptions} from './sync';
import {MAPPING_GEN} from './concepts';
import {FORMULA_VERSION,materialize} from './derive';
import {ProviderError,snapshotOf} from './providers/shared';
import {companyFactsUrl,parseCompanyFacts} from './providers/edgar-companyfacts';
import type {FactRow,FactsDb,RawSnapshot} from './types';

const enabled=!!process.env.S4_TEST_STATE;
// Deterministic issuer ids so any other suite loading the same fixture shares the issuer (filings.source_ref is global).
// Every gold-asserted US issuer must appear here with a recorded fixture (gold `ready` gate).
const CIK:Record<string,string>={AAPL:'320193',MSFT:'789019'};
const FIX:Record<string,string>={'0000320193':'CIK0000320193.trimmed.json','0000789019':'CIK0000789019.trimmed.json'};
const REVISED='CIK0000320193.revised.json';
const fx=(n:string)=>new Uint8Array(readFileSync(new URL(`./fixtures/edgar/${n}`,import.meta.url)));
const today=()=>new Date().toISOString().slice(0,10);
interface GoldEntry{issuer:{ticker:string;market:'US'|'CN'};concept:string;period_end:string;unit:string;value:string;as_of?:string|null;recorded_by:string}
interface GoldFile{ready:boolean;required:{US:boolean;CN:boolean};entries:GoldEntry[]}
const isPending=(e:GoldEntry)=>e.recorded_by==='<pending>'||e.value==='<pending>';

describe.skipIf(!enabled)('F2-3 US offline replay on real PostgreSQL',()=>{
 let admin:Pool;let db:FactsDb;let deps:SyncDeps;
 const issuers:Record<string,string>={};
 const fixtures={...FIX};
 let activeGen=MAPPING_GEN;   // bumped by the mapping-gen test; every later run must use it (a lower gen is mapping_gen_regression)
 // mappingGen is a SyncOptions field (Part B), not a SyncDeps field.
 const run=(ids:string[],extra:Partial<SyncOptions>={})=>runFactsSync(deps,{market:'US',limit:10,issuerIds:ids,dryRun:false,triggeredBy:'script',mappingGen:activeGen,...extra});
 const revenueFy23=(asOf:string,history=true)=>db.readFacts(issuers.AAPL,'US',{concepts:['revenue'],asOf,from:'2023-09-30',to:'2023-09-30',history}).then(r=>r.rows.filter(x=>x.duration==='12M'));
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  await admin.query(`insert into public.stocks_universe(ticker,name,market) values('AAPL','Apple Inc.','US'),('MSFT','Microsoft Corp.','US') on conflict (ticker) do nothing`);
  for(const [ticker,cik] of Object.entries(CIK)){
   await admin.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),ticker,cik]);
   issuers[ticker]=(await admin.query(`select issuer_id from public.issuers where cik=$1`,[cik])).rows[0].issuer_id;
   await admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[issuers[ticker],ticker]);
  }
  db=pgFactsDb(admin);
  await db.reconcileScope('US',Object.entries(CIK).map(([t,cik])=>({issuer_id:issuers[t],reasons:['test'],priority:10,fetch_key:cik.padStart(10,'0')})));
  deps={db,tables:pgTableClient(admin),storage:memorySnapshotStore(),
   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const n=fixtures[cik10];if(!n)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(fx(n),{source:'edgar',url:companyFactsUrl(cik10)});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:'test'};
 });
 afterAll(async()=>{await admin?.end();});

 it('first run publishes both issuers; AAPL revenue asOf 2024-06-30 is the 2023-11-03 10-K row, not a later comparative',async()=>{
  const r1=await run([issuers.AAPL,issuers.MSFT]);
  expect(r1.status).toBe('success');expect(r1.detail).toMatchObject({published:2,failed:0});
  expect(r1.counts.inserted+r1.counts.duplicates).toBeGreaterThan(100);
  const rows=await revenueFy23('2024-06-30',false);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({available_date:'2023-11-03',value_text:'383285000000',unit:'USD',disclosure_seq:1,is_current:true,is_revision:false,mapping_gen:MAPPING_GEN,status:'ok'});
  expect((await db.readFacts(issuers.MSFT,'US',{concepts:['revenue'],asOf:today(),from:'2023-06-30',to:'2023-06-30'})).rows.some(x=>x.value_text==='211915000000')).toBe(true);
 },120_000);

 it('second run is all duplicates: nothing inserted or versioned, no new facts visible',async()=>{
  const before=(await db.readFacts(issuers.AAPL,'US',{concepts:['revenue','total_assets'],asOf:today(),history:true})).rows.length;
  const r2=await run([issuers.AAPL,issuers.MSFT]);
  expect(r2.status).toBe('success');
  expect(r2.counts).toMatchObject({inserted:0,versioned:0,quarantined:0,failed:0});
  expect(r2.counts.duplicates).toBeGreaterThan(100);
  expect((await db.readFacts(issuers.AAPL,'US',{concepts:['revenue','total_assets'],asOf:today(),history:true})).rows.length).toBe(before);
 },120_000);

 it('a later 10-K with a different FY2023 revenue is versioned=1 and replays on both sides of its filed date',async()=>{
  const before=await revenueFy23('2025-10-31');
  // The revised fixture stays active for the rest of the suite: the synthetic filing must be part of
  // every later manifest, or the generation bump below would leave it on the old generation (round-1 #15).
  fixtures['0000320193']=REVISED;
  const r3=await run([issuers.AAPL]);
  expect(r3.status).toBe('success');expect(r3.counts).toMatchObject({versioned:1,inserted:0,quarantined:0});
  const after=await revenueFy23('2025-12-31');
  expect(after).toHaveLength(before.length+1);
  expect(after.at(-1)).toMatchObject({available_date:'2025-11-01',value_text:'383285000001',is_current:true,is_revision:true,disclosure_seq:before.length+1});
  expect(after.slice(0,-1).map(x=>x.fact_id)).toEqual(before.map(x=>x.fact_id));
  const earlier=await revenueFy23('2025-10-31');
  expect(earlier.map(x=>[x.fact_id,x.is_current])).toEqual(before.map(x=>[x.fact_id,x.is_current]));
  expect((await revenueFy23('2024-06-30',false))[0].value_text).toBe('383285000000');
 },120_000);

 it('a mapping-gen bump re-publishes under the new generation per filing; old-generation rows leave read_facts but stay fetchable by id',async()=>{
  const old=await revenueFy23(today());
  expect(old.some(x=>x.available_date==='2025-11-01')).toBe(true);                   // the synthetic revision is part of the set being bumped
  activeGen=MAPPING_GEN+1;
  const r4=await run([issuers.AAPL]);
  expect(r4.status).toBe('success');expect(r4.counts.inserted).toBeGreaterThan(100);
  const now=await revenueFy23(today());
  expect(now.length).toBe(old.length);
  for(const x of now)expect(x.mapping_gen).toBe(activeGen);
  expect(new Set(now.map(x=>x.fact_id)).size).toBe(now.length);
  expect(now.some(x=>old.some(o=>o.fact_id===x.fact_id))).toBe(false);
  // per-filing generation: every AAPL filing was in the manifest and is now on the active generation
  const filings=await db.filingsOfIssuer(issuers.AAPL,'US',{});
  expect(filings.length).toBeGreaterThan(10);
  expect(filings.filter(g=>g.mapping_gen!==activeGen).map(g=>g.source_ref)).toEqual([]);
  const all=await db.readFacts(issuers.AAPL,'US',{concepts:['revenue','total_assets'],asOf:today(),history:true});
  expect(all.rows.every(x=>x.mapping_gen===activeGen)).toBe(true);
  const byId=await db.factsByIds(old.map(o=>o.fact_id));
  expect(byId.map((x:FactRow)=>x.fact_id).sort()).toEqual(old.map(o=>o.fact_id).sort());
  for(const x of byId)expect(x).toMatchObject({mapping_gen:MAPPING_GEN,status:'ok'});
  expect((await revenueFy23('2024-06-30',false))[0]).toMatchObject({value_text:'383285000000',mapping_gen:activeGen});   // asOf replay is generation-independent
 },120_000);

 it('two concurrent runs on one issuer: the lease serialises them, no staged run is left behind',async()=>{
  const published=async()=>(await admin.query(`select status,count(*)::int n from public.fact_sync_runs where issuer_id=$1 and market='US' group by status`,[issuers.AAPL])).rows as {status:string;n:number}[];
  const before=Object.fromEntries((await published()).map(r=>[r.status,r.n]));
  const [a,b]=await Promise.all([run([issuers.AAPL]),run([issuers.AAPL])]);     // both on activeGen: a lower gen would be mapping_gen_regression
  const total=a.detail.published+b.detail.published;
  expect(total).toBeGreaterThanOrEqual(1);
  for(const r of [a,b])if(r.detail.published===0){expect(r.detail.skipped).toBe(1);expect(r.errors.map(e=>e.code)).toContain('skipped_summary');}
  const after=Object.fromEntries((await published()).map(r=>[r.status,r.n]));
  expect(after.published??0).toBe((before.published??0)+total);
  expect(after.staged??0).toBe(0);
 },120_000);

 it('replaceMetrics accepts the current state_rev and rejects a stale one',async()=>{
  const {stateRev}=await db.readFacts(issuers.AAPL,'US',{concepts:['revenue'],asOf:today()});
  expect(stateRev).toBeGreaterThan(0);
  await expect(db.replaceMetrics(issuers.AAPL,'US',stateRev,[])).resolves.toBe(0);
  await expect(db.replaceMetrics(issuers.AAPL,'US',stateRev-1,[])).rejects.toMatchObject({code:'stale_computation'});
 });

 it('materialize twice yields identical metric rows (computed_at is not part of MetricRow) and a non-empty set for AAPL',async()=>{
  const first=await materialize(db,issuers.AAPL,'US');
  expect(first.rows).toBeGreaterThan(0);
  const a=await db.metricsOfIssuer(issuers.AAPL,'US',FORMULA_VERSION);
  const second=await materialize(db,issuers.AAPL,'US');
  expect(second.stateRev).toBe(first.stateRev);expect(second.rows).toBe(first.rows);
  const b=await db.metricsOfIssuer(issuers.AAPL,'US',FORMULA_VERSION);
  expect(b).toEqual(a);
  expect(a.some(m=>m.metric==='gross_margin'&&m.duration==='12M')).toBe(true);
  for(const m of a)expect(m).toMatchObject({issuer_id:issuers.AAPL,market:'US',formula_version:FORMULA_VERSION,based_on_rev:first.stateRev});
 },120_000);

 it('US gold gate: fixture-backed issuers must be recorded by a human and every recorded entry replays from the published facts (round-1 #19)',async()=>{
  const gold=JSON.parse(readFileSync(new URL('./fixtures/gold/plan2.json',import.meta.url),'utf8')) as GoldFile;
  expect(gold.entries.length).toBeGreaterThan(0);
  const us=gold.entries.filter(e=>e.issuer.market==='US');
  // 1. required.US (true by default): an explicit, named failure until the owner records AAPL and MSFT.
  if(gold.required.US)for(const t of Object.keys(CIK))expect(us.some(e=>e.issuer.ticker===t&&!isPending(e)),`gold entry for ${t} is still <pending> — owner step (runbook 8.11-6) blocks F2-7`).toBe(true);
  // 2. ready: the file is complete — no template left, every asserted US issuer fixture-backed, §11.4 matrix (6 × 2 × 6) satisfied.
  if(gold.ready){
   expect(gold.entries.filter(isPending).map(e=>`${e.issuer.ticker}/${e.concept}/${e.period_end}`),'pending entries in a ready gold file').toEqual([]);
   for(const e of us)expect(e.issuer.ticker in CIK,`${e.issuer.ticker}: no recorded fixture (record-fixture.ts --edgar, then add it to CIK/FIX here)`).toBe(true);
   const byIssuer=new Map<string,GoldEntry[]>();
   for(const e of gold.entries)(byIssuer.get(e.issuer.ticker)??byIssuer.set(e.issuer.ticker,[]).get(e.issuer.ticker)!).push(e);
   expect(byIssuer.size,'§11.4: at least 6 issuers').toBeGreaterThanOrEqual(6);
   for(const [t,es] of byIssuer){
    expect(new Set(es.map(e=>e.period_end)).size,`${t}: at least 2 periods`).toBeGreaterThanOrEqual(2);
    expect(new Set(es.map(e=>e.concept)).size,`${t}: at least 6 concepts`).toBeGreaterThanOrEqual(6);
   }
  }
  // 3. every recorded US entry replays (asOf = as_of or today; the current row of that period and unit).
  for(const e of us.filter(e=>!isPending(e))){
   const issuer=issuers[e.issuer.ticker];
   expect(issuer,`no fixture-backed issuer for ${e.issuer.ticker}`).toBeDefined();
   const res=await db.readFacts(issuer,'US',{concepts:[e.concept],asOf:e.as_of??today(),from:e.period_end,to:e.period_end});
   const row=res.rows.find(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.is_current);
   expect(row,`${e.issuer.ticker} ${e.concept} ${e.period_end} ${e.unit}`).toBeDefined();
   expect(row!.value_text).toBe(e.value);
  }
 });
});
```

- [ ] **Step 3: 加入 criticalSuites**

`scripts/ci/research-checks.ts` 的 `.concat(...)` 末尾追加 `'src/lib/facts/sync-us.integration.test.ts'`（Part A 的 `facts.integration.test.ts` 若已在列表，接在其后）。

- [ ] **Step 4: 运行，确认失败**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: `sync-us.integration.test.ts` 失败：第一个用例 `expected 0 to be greater than 100`（`counts.inserted+duplicates`）之前，`runFactsSync` 在 `stage_facts` 阶段或黄金断言阶段因夹具/发行人不存在而失败；本测试已按 Part B 合入的签名编写（`mappingGen` 在 `SyncOptions`、`issuerIds` 直跑不对账且不受 `next_due_at` 限制、回执带 `detail`），不需要再适配。

- [ ] **Step 5: 运行通过**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db && npm run typecheck && npm run lint`
Expected: `sync-us.integration.test.ts` 8 个用例中 7 passed，**1 failed = 黄金门禁**：`gold entry for AAPL is still <pending> — owner step (runbook 8.11-6) blocks F2-7`。这是设计的"未完成"状态（round-1 #19）：`required.US` 必须保持 true，不得为了变绿改模板；owner 录入 AAPL/MSFT 条目后该用例转绿。`reports/research-db-summary.json` 的 `criticalSuites` 比之前多 1。typecheck、lint 无错误。

- [ ] **Step 6: 提交**

```bash
git add src/lib/facts/fixtures/gold/plan2.json src/lib/facts/sync-us.integration.test.ts scripts/ci/research-checks.ts
git commit -m "test(facts): US offline replay on PostgreSQL (duplicates, revision, mapping bump, lease, stale metrics, materialize twice) and the gold gate" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

提交信息里注明黄金门禁在 owner 录入前为红（设计如此）。本文件此后不再被任何任务修改（round-1 #20）。

---

### Task 12: `tushareCallRaw` + Tushare 三表适配器 + 夹具（真实或合成）

**Files:**
- Modify: `src/lib/data/sources/tushare.ts`
- Create: `src/lib/data/sources/tushare-raw.test.ts`
- Create: `src/lib/facts/providers/tushare-statements.ts`
- Create: `src/lib/facts/providers/tushare-fixtures.ts`
- Create: `src/lib/facts/providers/tushare-statements.test.ts`
- Create: `src/lib/facts/fixtures/tushare/_synthetic/*.json`（6 个）；有 token 时另 `fixtures/tushare/600519.SH.*.json`
- Modify: `scripts/facts/record-fixture.ts`（补 `--tushare` 分支）
- Create: `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`（核对记录；Task 18 据此填写 runbook 8.7 表）

- [ ] **Step 1: 写 `tushareCallRaw` 失败测试**

```ts
// src/lib/data/sources/tushare-raw.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {TUSHARE_ENDPOINT,TushareError,tushareCallRaw} from './tushare';

const body='{"request_id":"r-1","code":0,"msg":null,"data":{"fields":["ts_code","end_date","report_type","total_revenue"],"items":[["600519.SH","20231231",1,1.5056e11],["600519.SH","20221231",1,12345678901234567890]],"has_more":true}}';
// Mocks typed against the real `typeof fetch` input (RequestInfo | URL, init optional), round-1 #5.
type FetchFn=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
describe('tushareCallRaw',()=>{
 it('posts api/params/fields with limit+offset, keeps bytes, sha256, request_id, has_more and raw number literals, never the token in the result',async()=>{
  const fetch=vi.fn<FetchFn>(async()=>new Response(body,{status:200}));
  const r=await tushareCallRaw('income',{ts_code:'600519.SH',start_date:'20140101',report_type:'1'},'ts_code,end_date,report_type,total_revenue',{limit:2000,offset:4000,fetch,token:'tok'});
  expect(fetch.mock.calls[0][0]).toBe(TUSHARE_ENDPOINT);
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({api_name:'income',token:'tok',params:{ts_code:'600519.SH',start_date:'20140101',report_type:'1',limit:2000,offset:4000},fields:'ts_code,end_date,report_type,total_revenue'});
  expect(Buffer.from(r.bytes).toString('utf8')).toBe(body);
  expect(r.sha256).toBe(createHash('sha256').update(body).digest('hex'));
  expect(r).toMatchObject({httpStatus:200,requestId:'r-1',code:0,msg:'',hasMore:true,fields:['ts_code','end_date','report_type','total_revenue']});
  expect(r.items[0]).toEqual(['600519.SH','20231231',{__num:'1'},{__num:'1.5056e11'}]);
  expect(r.items[1][3]).toEqual({__num:'12345678901234567890'});
  expect(JSON.stringify(r)).not.toContain('tok');
 });
 it('returns code/msg for API errors, treats data:null as empty, throws TushareError on HTTP failure or missing token',async()=>{
  const err=await tushareCallRaw('income',{},'',{fetch:async()=>new Response('{"request_id":"r","code":40203,"msg":"抱歉，您每分钟最多访问该接口50次","data":null}'),token:'t'});
  expect(err).toMatchObject({code:40203,msg:'抱歉，您每分钟最多访问该接口50次',items:[],fields:[],hasMore:false});
  await expect(tushareCallRaw('income',{},'',{fetch:async()=>new Response('x',{status:429}),token:'t'})).rejects.toMatchObject({code:429});
  await expect(tushareCallRaw('income',{},'',{fetch:async()=>new Response('{}'),token:''})).rejects.toBeInstanceOf(TushareError);
 });
 it('aborts on the budget and on the per-call timeout',async()=>{
  const ctl=new AbortController();ctl.abort(new Error('budget'));
  const fetch=vi.fn<FetchFn>(async(_u,init)=>{init?.signal?.throwIfAborted();return new Response(body);});
  await expect(tushareCallRaw('income',{},'',{fetch,token:'t',budget:{remainingMs:()=>60_000,signal:ctl.signal}})).rejects.toBeDefined();
  await expect(tushareCallRaw('income',{},'',{fetch,token:'t',budget:{remainingMs:()=>10_000,signal:new AbortController().signal}})).rejects.toMatchObject({code:-2});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/data/sources/tushare-raw.test.ts`
Expected: FAIL，`tushareCallRaw` 不是导出。

- [ ] **Step 3: 在 `tushare.ts` 末尾追加 `tushareCallRaw`（并在文件顶部加三行 import）**

```ts
import { createHash } from 'node:crypto';
import { scanJsonNumbers } from '@/lib/facts/json-numbers';
import type { Budget } from '@/lib/facts/types';
```

```ts
// ─── Raw call for the disclosure facts adapters (plan 2 §6.3) ───
// Keeps the response bytes (snapshot + raw_hash), request_id and has_more; numbers stay as
// {__num:'<literal>'} (scanJsonNumbers) so the statements parser decodes value columns losslessly by
// field name. limit/offset are passed through as params; their upstream semantics are unverified (§15).
// API-level errors (code !== 0) are returned, not thrown: the caller classifies quota vs other.
export interface TushareRaw { bytes: Uint8Array; sha256: string; httpStatus: number; requestId: string | null; code: number; msg: string; fields: string[]; items: unknown[][]; hasMore: boolean }
export interface TushareRawOptions { limit?: number; offset?: number; budget?: Budget; fetch?: typeof fetch; token?: string; timeoutMs?: number }
const rawNumber = (v: unknown): number | null => typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { __num?: unknown }).__num === 'string' ? Number((v as { __num: string }).__num) : null;

export async function tushareCallRaw(api_name: string, params: Record<string, unknown>, fields: string, opts: TushareRawOptions = {}): Promise<TushareRaw> {
  const token = opts.token ?? process.env.TUSHARE_TOKEN;
  if (!token) throw new TushareError(-1, 'TUSHARE_TOKEN not configured');
  const remaining = opts.budget ? opts.budget.remainingMs() - 20_000 : Infinity;
  const timeoutMs = Math.min(opts.timeoutMs ?? 30_000, remaining);
  if (timeoutMs <= 0) throw new TushareError(-2, 'budget exhausted');
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (opts.budget) signals.push(opts.budget.signal);
  const body = JSON.stringify({ api_name, token, params: { ...params, ...(opts.limit !== undefined ? { limit: opts.limit } : {}), ...(opts.offset !== undefined ? { offset: opts.offset } : {}) }, fields });
  const resp = await (opts.fetch ?? fetch)(TUSHARE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.any(signals) });
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (!resp.ok) throw new TushareError(resp.status, `HTTP ${resp.status}`);
  let json: { request_id?: unknown; code?: unknown; msg?: unknown; data?: { fields?: unknown; items?: unknown; has_more?: unknown } | null };
  try { json = scanJsonNumbers(bytes) as typeof json; } catch { throw new TushareError(-3, 'malformed Tushare response'); }
  const code = rawNumber(json.code);
  if (code === null) throw new TushareError(-3, 'malformed Tushare response: code');
  const data = json.data ?? null;
  return {
    bytes, sha256: createHash('sha256').update(bytes).digest('hex'), httpStatus: resp.status,
    requestId: typeof json.request_id === 'string' ? json.request_id : null, code, msg: typeof json.msg === 'string' ? json.msg : '',
    fields: Array.isArray(data?.fields) ? (data!.fields as string[]) : [], items: Array.isArray(data?.items) ? (data!.items as unknown[][]) : [], hasMore: data?.has_more === true,
  };
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/data/sources/tushare-raw.test.ts src/lib/data/sources/tushare-timeout.test.ts`
Expected: 全部通过（原 timeout 测试不受影响）。

- [ ] **Step 5: 写合成夹具（降级路径；真实夹具到位后被 Step 9 替换为主路径，但合成文件保留给单测）**

目录 `src/lib/facts/fixtures/tushare/_synthetic/`，六个文件，**形状与 Tushare 文档响应完全一致**，`request_id: "synthetic"` 标明合成，**永不用于黄金断言**。

`600519.SH.income.rt1.p1.json`：
```json
{"request_id":"synthetic","code":0,"msg":null,"data":{"fields":["ts_code","ann_date","f_ann_date","end_date","report_type","comp_type","end_type","update_flag","total_revenue","revenue","oper_cost","operate_profit","n_income","n_income_attr_p","basic_eps","diluted_eps","rd_exp","sell_exp","admin_exp","fin_exp_int_exp","int_exp","income_tax"],"items":[
["600519.SH","20240403","20240403","20231231",1,1,4,1,150560000000.12,147693000000.5,11867000000,101000000000,80000000000,74734000000,59.49,59.49,null,4649000000,9729000000,null,null,25000000000],
["600519.SH","20240803","20240803","20240630",1,1,2,0,83000000000,81900000000,6300000000,55000000000,43000000000,41700000000,33.19,33.19,null,2600000000,4800000000,null,null,14000000000],
["600519.SH","20240803","20240803","20240630",1,1,2,1,83400000000,81900000000,6300000000,55000000000,43000000000,41700000000,33.19,33.19,null,2600000000,4800000000,null,null,14000000000],
["600519.SH","20230331","20240403","20221231",1,1,4,1,127554000001,124100000000,9100000000,87000000000,66000000000,62716000000,49.93,49.93,null,3300000000,9000000000,null,null,21000000000]
],"has_more":false}}
```
`600519.SH.income.rt4.p1.json`：
```json
{"request_id":"synthetic","code":0,"msg":null,"data":{"fields":["ts_code","ann_date","f_ann_date","end_date","report_type","comp_type","end_type","update_flag","total_revenue","revenue","oper_cost","operate_profit","n_income","n_income_attr_p","basic_eps","diluted_eps","rd_exp","sell_exp","admin_exp","fin_exp_int_exp","int_exp","income_tax"],"items":[
["600519.SH","20240803","20240803","20230630",4,1,2,0,70900000000,69500000000,5400000000,47000000000,37000000000,35980000000,28.64,28.64,null,2100000000,4300000000,null,null,12000000000],
["600519.SH",null,null,"20230331",4,1,1,0,39400000000,38700000000,3000000000,27000000000,21000000000,20795000000,16.55,16.55,null,1100000000,2200000000,null,null,7000000000]
],"has_more":false}}
```
`600519.SH.income.rt5.p1.json`：
```json
{"request_id":"synthetic","code":0,"msg":null,"data":{"fields":["ts_code","ann_date","f_ann_date","end_date","report_type","comp_type","end_type","update_flag","total_revenue","revenue","oper_cost","operate_profit","n_income","n_income_attr_p","basic_eps","diluted_eps","rd_exp","sell_exp","admin_exp","fin_exp_int_exp","int_exp","income_tax"],"items":[
["600519.SH","20230331","20230331","20221231",5,1,4,0,127554000000,124100000000,9100000000,87000000000,66000000000,62716000000,49.93,49.93,null,3300000000,9000000000,null,null,21000000000]
],"has_more":false}}
```
`600519.SH.balancesheet.rt1.p1.json`：
```json
{"request_id":"synthetic","code":0,"msg":null,"data":{"fields":["ts_code","ann_date","f_ann_date","end_date","report_type","comp_type","end_type","update_flag","total_assets","total_liab","total_hldr_eqy_exc_min_int","total_hldr_eqy_inc_min_int","money_cap","st_borr","lt_borr","bond_payable","total_share"],"items":[
["600519.SH","20240403","20240403","20231231",1,1,4,1,272000000000,51000000000,215000000000,221000000000,69000000000,null,null,null,1256197800]
],"has_more":false}}
```
`600519.SH.balancesheet.rt5.p1.json`：
```json
{"request_id":"synthetic","code":0,"msg":null,"data":null}
```
`600519.SH.cashflow.rt1.p1.json`：
```json
{"request_id":"synthetic","code":0,"msg":null,"data":{"fields":["ts_code","ann_date","f_ann_date","end_date","report_type","comp_type","end_type","update_flag","is_calc","n_cashflow_act","n_cashflow_inv_act","n_cash_flows_fnc_act","c_pay_acq_const_fiolta","c_pay_dist_dpcp_int_exp","n_incr_cash_cash_equ"],"items":[
["600519.SH","20240403","20240403","20231231",1,1,4,1,0,66593000000,-4700000000,-57000000000,4800000000,56000000000,4800000000],
["600519.SH","20240403","20240403","20231231",1,1,4,1,1,66593000000,-4700000000,-57000000000,4800000000,56000000000,4800000000]
],"has_more":false}}
```

- [ ] **Step 6: 写适配器失败测试**

```ts
// src/lib/facts/providers/tushare-statements.test.ts
import {describe,expect,it,vi} from 'vitest';
import type {Budget} from '../types';
import {TushareError,type TushareRaw} from '../../data/sources/tushare';
import {addDecimals,coverageSummary,fetchTushareStatements,fieldsFor,isTushareQuotaMessage,parseTushareStatements} from './tushare-statements';
import {loadTushareFixtures,tushareFixtureDir} from './tushare-fixtures';

const budget=(ms=300_000):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});
const raw=(items:unknown[][],hasMore:boolean,fields='ts_code,end_date'):TushareRaw=>{const text=JSON.stringify({request_id:'r',code:0,msg:null,data:{fields:fields.split(','),items,has_more:hasMore}});return {bytes:new TextEncoder().encode(text),sha256:'x'.repeat(64),httpStatus:200,requestId:'r',code:0,msg:'',fields:fields.split(','),items,hasMore};};

describe('fieldsFor / addDecimals / quota detection',()=>{
 it('derives the field list from the catalogue (common fields first; cashflow adds is_calc)',()=>{
  expect(fieldsFor('income').split(',').slice(0,8)).toEqual(['ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type','update_flag']);
  expect(fieldsFor('income')).toContain('sell_exp');expect(fieldsFor('income')).toContain('admin_exp');expect(fieldsFor('income')).toContain('fin_exp_int_exp');
  expect(fieldsFor('cashflow').split(',')).toContain('is_calc');expect(fieldsFor('balancesheet')).toContain('total_share');
  expect(fieldsFor('balancesheet')).not.toContain('is_calc');
 });
 it('adds decimals exactly',()=>{
  expect(addDecimals('4649000000','9729000000')).toBe('14378000000');
  expect(addDecimals('0.1','0.2')).toBe('0.3');expect(addDecimals('-0.5','0.5')).toBe('0');expect(addDecimals('12345678901234567890','1')).toBe('12345678901234567891');
 });
 it('recognises quota / rate-limit messages',()=>{
  expect(isTushareQuotaMessage('抱歉，您每分钟最多访问该接口50次')).toBe(true);
  expect(isTushareQuotaMessage('抱歉，您没有访问该接口的权限，权限的具体详情访问...积分')).toBe(true);
  expect(isTushareQuotaMessage('参数错误')).toBe(false);
 });
});

describe('fetchTushareStatements',()=>{
 it('calls 3 apis × report types 1/4/5 with start_date, pages by limit/offset until has_more is false or a short page, one snapshot per page',async()=>{
  // typed like tushareCallRaw: the options argument is optional there, so the mock takes it with a default (round-1 #5)
  const call=vi.fn(async(api:string,params:Record<string,unknown>,_f:string,o:{limit?:number;offset?:number}={})=>{
   if(api==='income'&&params.report_type==='1')return o.offset===0?raw([['600519.SH','20231231'],['600519.SH','20230930']],true):raw([['600519.SH','20230630']],false);
   return raw([],false);
  });
  const snaps=await fetchTushareStatements('600519.SH',2014,budget(),{call,pageSize:2,sleep:async()=>{}});
  expect(call).toHaveBeenCalledTimes(10);
  expect(call.mock.calls.map(c=>`${c[0]}:${(c[1] as {report_type:string}).report_type}`).slice(0,3)).toEqual(['income:1','income:1','income:4']);
  for(const c of call.mock.calls)expect(c[1]).toMatchObject({ts_code:'600519.SH',start_date:'20140101'});
  const income1=snaps.filter(s=>s.meta.api==='income'&&(s.meta.params as {report_type:string}).report_type==='1');
  expect(income1.map(s=>[s.meta.page,s.meta.has_more,(s.meta.params as {offset:number}).offset])).toEqual([[1,true,0],[2,false,2]]);
  expect(snaps).toHaveLength(10);
  for(const s of snaps){expect(s.meta.source).toBe('tushare');expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(s.meta)).not.toContain('token');}
 });
 it('maps quota messages and HTTP 429 to quota_exhausted, other API errors to tushare_unavailable, and stops on budget',async()=>{
  const quota=async()=>({...raw([],false),code:40203,msg:'抱歉，您每天最多访问该接口10次'});
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:quota,sleep:async()=>{}})).rejects.toMatchObject({code:'quota_exhausted'});
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>{throw new TushareError(429,'HTTP 429');},sleep:async()=>{}})).rejects.toMatchObject({code:'quota_exhausted'});
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>({...raw([],false),code:2002,msg:'参数错误'}),sleep:async()=>{}})).rejects.toMatchObject({code:'tushare_unavailable'});
  const noCall=vi.fn();
  await expect(fetchTushareStatements('600519.SH',2014,budget(10_000),{call:noCall})).rejects.toMatchObject({code:'tushare_unavailable'});
  expect(noCall).not.toHaveBeenCalled();
  await expect(fetchTushareStatements('AAPL',2014,budget(),{call:noCall})).rejects.toMatchObject({code:'parse_error'});
 });
});

describe('parseTushareStatements (600519.SH fixtures)',()=>{
 const {synthetic}=tushareFixtureDir('600519.SH');
 const r=parseTushareStatements(loadTushareFixtures('600519.SH'),{sinceYear:2014});
 const find=(concept:string,ref:string)=>r.candidates.find(c=>c.concept===concept&&c.filingRef===ref);
 it('builds YTD duration candidates with CNY units, Jan-1 period_start and the source_ref filing key',()=>{
  const fy23=r.candidates.filter(c=>c.concept==='revenue'&&c.periodEnd==='2023-12-31'&&c.filingRef.split(':')[2]==='1');
  expect(fy23).toHaveLength(1);
  expect(fy23[0]).toMatchObject({periodStart:'2023-01-01',duration:'12M',unit:'CNY',statement:'IS',sourceConcept:'income.total_revenue',consolidation:'consolidated'});
  expect(fy23[0].filingRef).toMatch(/^600519\.SH:20231231:1:\d{8}$/);
  if(synthetic)expect(fy23[0]).toMatchObject({value:'150560000000.12',filingRef:'600519.SH:20231231:1:20240403'});
  const f=r.filings.find(x=>x.sourceRef===fy23[0].filingRef)!;
  expect(f).toMatchObject({market:'CN',source:'tushare',origin:'sse',formType:'annual',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',url:null});
  expect(f.availableDate).toBe(`${f.sourceRef.slice(-8,-4)}-${f.sourceRef.slice(-4,-2)}-${f.sourceRef.slice(-2)}`);
 });
 it('sums sga_expense exactly, types eps as CNY/share and total_share as INSTANT shares, skips null fields and is_calc=1 rows',()=>{
  // FY2023 explicitly: filings sort by availableDate then sourceRef, so the first annual type-1 filing is
  // FY2022 (same announcement date), whose BS/CF rows the fixture does not carry (round-1 #17b).
  const annual=r.filings.find(x=>x.formType==='annual'&&x.fiscalYear===2023&&x.sourceRef.split(':')[2]==='1')!.sourceRef;
  const sga=find('sga_expense',annual)!;
  expect(sga.sourceConcept).toBe('income.sell_exp+admin_exp');
  if(synthetic)expect(sga.value).toBe('14378000000');
  expect(find('eps_basic',annual)).toMatchObject({unit:'CNY/share',duration:'12M'});
  expect(find('shares_outstanding',annual)).toMatchObject({unit:'shares',duration:'INSTANT',periodStart:null,statement:'BS'});
  expect(find('operating_cash_flow',annual)).toMatchObject({statement:'CF',duration:'12M'});
  if(synthetic){expect(r.skipped).toContainEqual({reason:'is_calc',n:1});expect(r.skipped).toContainEqual(expect.objectContaining({reason:'null:short_term_borrowings'}));}
 });
 it('report types map to form types (4 → restatement), a type-5 row and its type-1 counterpart form a revision pair with different available dates',()=>{
  expect(r.filings.filter(x=>x.sourceRef.split(':')[2]==='4').every(x=>x.formType==='restatement')).toBe(true);
  const pairs=r.candidates.filter(a=>a.filingRef.split(':')[2]==='5').map(a=>[a,r.candidates.find(b=>b.filingRef.split(':')[2]==='1'&&b.concept===a.concept&&b.periodStart===a.periodStart&&b.periodEnd===a.periodEnd&&b.unit===a.unit)] as const).filter(([,b])=>b&&b.value!==undefined);
  expect(pairs.length).toBeGreaterThan(0);
  const [a,b]=pairs.find(([x,y])=>x.value!==y!.value)!;
  const avail=(ref:string)=>r.filings.find(f=>f.sourceRef===ref)!.availableDate;
  expect(avail(a.filingRef)<avail(b!.filingRef)).toBe(true);
  if(synthetic){expect(a).toMatchObject({concept:'revenue',value:'127554000000'});expect(b).toMatchObject({value:'127554000001'});expect(avail(a.filingRef)).toBe('2023-03-31');expect(avail(b!.filingRef)).toBe('2024-04-03');}
 });
 it('same filing + same key with different values (update_flag 0/1) → ambiguous; equal values stay single; missing ann dates → missingAvailableDate',()=>{
  if(!synthetic)return;   // 真实夹具是否含此形态未知；Step 10 记录核对结果
  expect(r.ambiguous).toHaveLength(1);
  expect(r.ambiguous[0].key).toBe('600519.SH:20240630:1:20240803|revenue|2024-01-01|2024-06-30|CNY');
  expect(r.ambiguous[0].candidates.map(c=>c.value)).toEqual(['83000000000','83400000000']);
  expect(r.candidates.filter(c=>c.filingRef==='600519.SH:20240630:1:20240803'&&c.concept==='revenue')).toEqual([]);
  expect(find('revenue_operating','600519.SH:20240630:1:20240803')).toMatchObject({value:'81900000000'});
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({ts_code:'600519.SH',end_date:'20230331',report_type:4,api:'income'})]);
 });
 it('every value is canonical, raw hashes are per row, oddDuration is empty, and the coverage summary counts distinct end dates per (api, report_type, year)',()=>{
  for(const c of r.candidates){expect(c.value).toMatch(/^-?(0|[1-9]\d*)(\.\d*[1-9])?$/);expect(c.rawHash).toMatch(/^[0-9a-f]{64}$/);}
  expect(r.oddDuration).toEqual([]);
  const cov=coverageSummary(r);
  expect(cov.find(x=>x.api==='income'&&x.report_type===1)).toBeDefined();
  if(synthetic)expect(cov).toEqual([{api:'balancesheet',report_type:1,years:{'2023':1}},{api:'cashflow',report_type:1,years:{'2023':1}},{api:'income',report_type:1,years:{'2022':1,'2023':1,'2024':1}},{api:'income',report_type:4,years:{'2023':1}},{api:'income',report_type:5,years:{'2022':1}}]);
 });
 it('a page with data:null parses to nothing without throwing',()=>{
  const nullPages=loadTushareFixtures('600519.SH').filter(s=>Buffer.from(s.bytes).toString('utf8').includes('"data":null'));
  if(synthetic)expect(nullPages.map(s=>`${s.meta.api}:${(s.meta.params as {report_type:string}).report_type}`)).toEqual(['balancesheet:5']);
  for(const s of nullPages){const one=parseTushareStatements([s],{sinceYear:2014});expect(one.candidates).toEqual([]);expect(one.filings).toEqual([]);expect(one.skipped).toEqual([]);}
 });
});
```

- [ ] **Step 7: 运行，确认失败**

Run: `npm test -- src/lib/facts/providers/tushare-statements.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 8: 实现适配器与夹具装载器**

```ts
// src/lib/facts/providers/tushare-fixtures.ts
// Loader for recorded (or synthetic) Tushare page fixtures shared by tests and scripts:
// <dir>/<ts_code>.<api>.rt<n>.p<k>.json is the byte-exact response; an optional sibling .meta.json carries
// the recording header. Real fixtures live in fixtures/tushare, hand-written ones in fixtures/tushare/_synthetic
// (request_id "synthetic"; never used for gold assertions).
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {RawSnapshot} from '../types';
import {snapshotOf} from './shared';

export const TUSHARE_FIXTURE_DIR=fileURLToPath(new URL('../fixtures/tushare/',import.meta.url));
export const SYNTHETIC_DIR=join(TUSHARE_FIXTURE_DIR,'_synthetic');
const NAME=/^(.+?)\.(income|balancesheet|cashflow)\.rt([145])\.p(\d+)\.json$/;
export function tushareFixtureDir(tsCode:string):{dir:string;synthetic:boolean}{
 return existsSync(join(TUSHARE_FIXTURE_DIR,`${tsCode}.income.rt1.p1.json`))?{dir:TUSHARE_FIXTURE_DIR,synthetic:false}:{dir:SYNTHETIC_DIR,synthetic:true};
}
export function loadTushareFixtures(tsCode:string,dir=tushareFixtureDir(tsCode).dir):RawSnapshot[]{
 return readdirSync(dir).map(n=>NAME.exec(n)).filter((m):m is RegExpExecArray=>!!m&&m[1]===tsCode).sort((a,b)=>a[0].localeCompare(b[0])).map(m=>{
  const bytes=new Uint8Array(readFileSync(join(dir,m[0])));
  const metaPath=join(dir,m[0].replace(/\.json$/,'.meta.json'));
  const meta=existsSync(metaPath)?JSON.parse(readFileSync(metaPath,'utf8')) as Partial<RawSnapshot['meta']>&{recorded_at?:string}:{};
  const json=JSON.parse(Buffer.from(bytes).toString('utf8')) as {data?:{has_more?:boolean}|null};
  return snapshotOf(bytes,{source:'tushare',api:m[2],params:meta.params??{ts_code:tsCode,start_date:'20140101',report_type:m[3]},fields:meta.fields,page:Number(m[4]),has_more:meta.has_more??json.data?.has_more===true,fetched_at:meta.recorded_at??'1970-01-01T00:00:00.000Z',http_status:meta.http_status??200});
 });
}
```

```ts
// src/lib/facts/providers/tushare-statements.ts
// Tushare three-statement adapter (spec §6.3, §5.1, §4.7 raw_hash). fetchTushareStatements: income /
// balancesheet / cashflow × report_type 1/4/5 since <sinceYear>0101, paged by limit/offset (upstream
// semantics unverified, §15 — never claim completeness before the runbook check), one RawSnapshot per page,
// quota messages / HTTP 429 → ProviderError quota_exhausted. parseTushareStatements: columns by name from
// data.fields, control columns → number, value columns → canonical decimal, YTD period_start = Jan 1 of
// end_date's year, source_ref '<ts_code>:<end_date>:<report_type>:<f_ann_date ?? ann_date>', form_type
// 1/5 by month and 4 → restatement, same filing + same key + different values → ambiguous_value,
// is_calc = 1 skipped. coverageSummary feeds the coverage_summary info code.
import type {Budget,ConceptDef,Duration,FactCandidate,FilingCandidate,FormType,Origin,ParseResult,RawSnapshot} from '../types';
import {FACT_CONCEPTS} from '../concepts';
import {canonicalDecimal,scanJsonNumbers} from '../json-numbers';
import {classifyDuration} from '../classify';
import {tushareCallRaw,type TushareRaw} from '../../data/sources/tushare';
import {nearestDuration,ProviderError,rawHashOf,sleep,snapshotOf,ymd} from './shared';

export type TushareApi='income'|'balancesheet'|'cashflow';
export const TUSHARE_APIS:TushareApi[]=['income','balancesheet','cashflow'];
export const TUSHARE_REPORT_TYPES=[1,4,5] as const;
export const COMMON_FIELDS=['ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type','update_flag'];
export const PAGE_SIZE=2000;
export const TUSHARE_MIN_INTERVAL_MS=300;
const RESERVE_MS=20_000;
const API_OF_STATEMENT:Record<string,TushareApi|undefined>={IS:'income',BS:'balancesheet',CF:'cashflow'};
let lastTushareRequestAt=0;

// `readonly ConceptDef[]` throughout: FACT_CONCEPTS is a readonly catalogue and must not be assigned to a mutable parameter (TS4104, round-1 #4).
export function fieldsFor(api:TushareApi,concepts:readonly ConceptDef[]=FACT_CONCEPTS):string{
 const set=new Set(COMMON_FIELDS);
 if(api==='cashflow')set.add('is_calc');
 for(const c of concepts){const t=c.tushare;if(!t||t.api!==api)continue;if('field' in t)set.add(t.field);else t.sum.forEach(f=>set.add(f));}
 return [...set].join(',');
}
export const isTushareQuotaMessage=(msg:string)=>/积分|权限|每分钟|每天最多|最多访问|访问频率|超过.*次/.test(msg);

export interface FetchTushareOptions{call?:typeof tushareCallRaw;pageSize?:number;sleep?:typeof sleep;now?:()=>number;concepts?:readonly ConceptDef[]}
export async function fetchTushareStatements(tsCode:string,sinceYear:number,budget:Budget,opts:FetchTushareOptions={}):Promise<RawSnapshot[]>{
 if(!/^\d{6}\.(SH|SZ|BJ)$/.test(tsCode))throw new ProviderError('parse_error',`bad ts_code ${tsCode}`);
 const call=opts.call??tushareCallRaw,pageSize=opts.pageSize??PAGE_SIZE,wait=opts.sleep??sleep,now=opts.now??Date.now;
 const out:RawSnapshot[]=[];
 for(const api of TUSHARE_APIS)for(const rt of TUSHARE_REPORT_TYPES){
  const fields=fieldsFor(api,opts.concepts);
  const params={ts_code:tsCode,start_date:`${sinceYear}0101`,report_type:String(rt)};
  for(let page=1,offset=0;;page++){
   if(budget.remainingMs()<=RESERVE_MS)throw new ProviderError('tushare_unavailable','budget_exhausted');
   const gap=lastTushareRequestAt+TUSHARE_MIN_INTERVAL_MS-now();
   if(gap>0)await wait(gap,budget.signal);
   lastTushareRequestAt=now();
   let raw:TushareRaw;
   try{raw=await call(api,params,fields,{limit:pageSize,offset,budget});}
   catch(e){if((e as {code?:number}).code===429)throw new ProviderError('quota_exhausted','http_429');throw new ProviderError('tushare_unavailable',(e as Error).message);}
   if(raw.code!==0)throw new ProviderError(isTushareQuotaMessage(raw.msg)?'quota_exhausted':'tushare_unavailable',`${raw.code}: ${raw.msg}`);
   out.push(snapshotOf(raw.bytes,{source:'tushare',api,params:{...params,limit:pageSize,offset},fields,http_status:raw.httpStatus,has_more:raw.hasMore,page}));
   if(!raw.hasMore||raw.items.length<pageSize)break;
   offset+=raw.items.length;
  }
 }
 return out;
}

interface Decoded{api:TushareApi;reportType:number;page:number;sha256:string;fields:string[];items:unknown[][]}
function decodeSnapshot(s:RawSnapshot):Decoded{
 const api=s.meta.api as TushareApi;
 if(!TUSHARE_APIS.includes(api))throw new ProviderError('parse_error',`snapshot api ${String(s.meta.api)}`);
 const rt=Number((s.meta.params as {report_type?:string}|undefined)?.report_type);
 if(!(TUSHARE_REPORT_TYPES as readonly number[]).includes(rt))throw new ProviderError('parse_error','snapshot report_type');
 let json:{data?:{fields?:unknown;items?:unknown}|null};
 try{json=scanJsonNumbers(s.bytes) as typeof json;}catch(e){throw new ProviderError('parse_error',`json: ${(e as Error).message}`);}
 const data=json.data??null;
 return {api,reportType:rt,page:s.meta.page??1,sha256:s.sha256,fields:Array.isArray(data?.fields)?data!.fields as string[]:[],items:Array.isArray(data?.items)?data!.items as unknown[][]:[]};
}
const literal=(v:unknown):string|null=>v&&typeof v==='object'&&typeof (v as {__num?:unknown}).__num==='string'?(v as {__num:string}).__num:typeof v==='number'?String(v):null;
const numOf=(v:unknown):number|null=>{const l=literal(v)??(typeof v==='string'&&v!==''?v:null);return l===null?null:Number(l);};
const decOf=(v:unknown):string|null=>{const l=literal(v);return l===null?null:canonicalDecimal(l);};
const strOf=(v:unknown):string|null=>typeof v==='string'&&v!==''?v:null;
/** Exact decimal addition on canonical strings (BigInt on the common scale). */
export function addDecimals(a:string,b:string):string{
 const [ai,af='']=a.split('.'),[bi,bf='']=b.split('.');const scale=Math.max(af.length,bf.length);
 const toInt=(i:string,f:string)=>BigInt(i+f.padEnd(scale,'0'));
 const sum=toInt(ai,af)+toInt(bi,bf);const neg=sum<0n;const digits=(neg?-sum:sum).toString().padStart(scale+1,'0');
 return canonicalDecimal((neg?'-':'')+(scale?`${digits.slice(0,-scale)}.${digits.slice(-scale)}`:digits));
}
const FORM_BY_MONTH:Record<string,FormType|undefined>={'03':'q1','06':'semiannual','09':'q3','12':'annual'};
const FP_BY_MONTH:Record<string,FilingCandidate['fiscalPeriod']>={'03':'Q1','06':'H1','09':'9M','12':'FY'};
const formTypeOf=(rt:number,endDate:string):FormType=>rt===4?'restatement':FORM_BY_MONTH[endDate.slice(4,6)]??'other';
const originOf=(tsCode:string):Origin=>tsCode.endsWith('.SH')?'sse':tsCode.endsWith('.SZ')?'szse':'bse';
const unitOf=(c:ConceptDef)=>c.unitKind==='money'?'CNY':c.unitKind==='per_share'?'CNY/share':'shares';

export interface ParseTushareOptions{concepts?:readonly ConceptDef[];sinceYear?:number;today?:Date}
export function parseTushareStatements(snapshots:RawSnapshot[],opts:ParseTushareOptions={}):ParseResult{
 const concepts=opts.concepts??FACT_CONCEPTS;
 const sinceYear=opts.sinceYear??(opts.today??new Date()).getUTCFullYear()-10;
 const out:ParseResult={candidates:[],filings:[],skipped:[],ambiguous:[],oddDuration:[],missingAvailableDate:[]};
 const skip=new Map<string,number>();const bump=(r:string)=>skip.set(r,(skip.get(r)??0)+1);
 const filings=new Map<string,FilingCandidate>();
 const groups=new Map<string,{first:FactCandidate;values:Set<string>;all:FactCandidate[]}>();
 for(const s of snapshots){
  const d=decodeSnapshot(s);
  const idx=new Map(d.fields.map((f,i)=>[f,i] as const));
  const col=(row:unknown[],f:string)=>{const i=idx.get(f);return i===undefined?undefined:row[i];};
  d.items.forEach((row,rowNo)=>{
   const tsCode=strOf(col(row,'ts_code')),endDate=strOf(col(row,'end_date')),rt=numOf(col(row,'report_type'));
   if(!tsCode||!endDate||!/^\d{8}$/.test(endDate)||rt===null){bump('row_shape');return;}
   if(rt!==d.reportType){bump('report_type_mismatch');return;}
   if(Number(endDate.slice(0,4))<sinceYear){bump('before_since_year');return;}
   if(d.api==='cashflow'&&numOf(col(row,'is_calc'))===1){bump('is_calc');return;}
   const ann=strOf(col(row,'f_ann_date'))??strOf(col(row,'ann_date'));
   if(!ann||!/^\d{8}$/.test(ann)){out.missingAvailableDate.push({ts_code:tsCode,end_date:endDate,report_type:rt,api:d.api,page:d.page,row:rowNo});return;}
   const sourceRef=`${tsCode}:${endDate}:${rt}:${ann}`;
   if(!filings.has(sourceRef))filings.set(sourceRef,{sourceRef,market:'CN',source:'tushare',origin:originOf(tsCode),formType:formTypeOf(rt,endDate),fiscalYear:Number(endDate.slice(0,4)),fiscalPeriod:FP_BY_MONTH[endDate.slice(4,6)]??null,periodEnd:ymd(endDate),availableDate:ymd(ann),url:null});
   const locator=`${d.api}:rt${rt}:p${d.page}[end_date=${endDate},ann=${ann},update_flag=${numOf(col(row,'update_flag'))??''},row=${rowNo}]`;
   for(const c of concepts){
    const t=c.tushare;if(!t||t.api!==d.api)continue;
    let value:string|null;
    if('field' in t)value=decOf(col(row,t.field));
    else{const parts=t.sum.map(f=>decOf(col(row,f)));value=parts.every((p):p is string=>p!==null)?parts.reduce(addDecimals):null;}
    if(value===null){bump(`null:${c.id}`);continue;}
    const periodEnd=ymd(endDate);
    const periodStart=c.nature==='instant'?null:`${endDate.slice(0,4)}-01-01`;
    const duration:Duration|'odd'=periodStart?classifyDuration(periodStart,periodEnd):'INSTANT';
    const days=periodStart?Math.round((Date.parse(periodEnd)-Date.parse(periodStart))/86_400_000):0;
    const cand:FactCandidate={concept:c.id,sourceConcept:`${d.api}.${'field' in t?t.field:t.sum.join('+')}`,statement:c.statement,periodStart,periodEnd,duration:duration==='odd'?nearestDuration(days):duration,value,unit:unitOf(c),consolidation:'consolidated',filingRef:sourceRef,rawHash:rawHashOf(d.sha256,locator)};
    if(duration==='odd'){out.oddDuration.push(Object.assign(cand,{periodDays:days}));continue;}
    const key=`${sourceRef}|${c.id}|${periodStart??''}|${periodEnd}|${cand.unit}`;
    const g=groups.get(key);
    if(!g)groups.set(key,{first:cand,values:new Set([value]),all:[cand]});else{g.values.add(value);g.all.push(cand);}
   }
  });
 }
 for(const [key,g] of groups){if(g.values.size>1)out.ambiguous.push({key,candidates:g.all});else out.candidates.push(g.first);}
 out.filings=[...filings.values()].sort((a,b)=>a.availableDate.localeCompare(b.availableDate)||a.sourceRef.localeCompare(b.sourceRef));
 out.skipped=[...skip].map(([reason,n])=>({reason,n}));
 return out;
}

export interface CoverageSummary{api:TushareApi;report_type:number;years:Record<string,number>}
/** Distinct end dates per (api, report_type, year) over the parsed candidates — the coverage_summary info payload. */
export function coverageSummary(result:ParseResult):CoverageSummary[]{
 const acc=new Map<string,Map<string,Set<string>>>();
 for(const c of result.candidates){
  const api=API_OF_STATEMENT[c.statement];if(!api)continue;
  const k=`${api}:${c.filingRef.split(':')[2]}`;
  const years=acc.get(k)??new Map<string,Set<string>>();acc.set(k,years);
  const y=c.periodEnd.slice(0,4);const ends=years.get(y)??new Set<string>();years.set(y,ends);ends.add(c.periodEnd);
 }
 return [...acc].map(([k,years])=>{const [api,rt]=k.split(':');return {api:api as TushareApi,report_type:Number(rt),years:Object.fromEntries([...years].map(([y,s])=>[y,s.size] as const).sort())};}).sort((a,b)=>a.api.localeCompare(b.api)||a.report_type-b.report_type);
}
```

- [ ] **Step 9: 运行通过（合成夹具）**

Run: `npm test -- src/lib/facts/providers/tushare-statements.test.ts`
Expected: 11 passed（第 10 个测试在合成模式下执行断言）。

- [ ] **Step 10: 录制真实夹具（需 owner 的 `TUSHARE_TOKEN`；没有则走降级并记录）**

先补 `scripts/facts/record-fixture.ts`：加入 `import {fetchTushareStatements} from '../../src/lib/facts/providers/tushare-statements';` 与 Task 10 Step 6 中的 `recordTushare` 函数及 `--tushare` 分支。

**有 token**：
```bash
node --env-file=/Volumes/AIMATE_WORK/secrets/tushare.env --import tsx scripts/facts/record-fixture.ts --tushare 600519.SH --since-year 2016
node --env-file=/Volumes/AIMATE_WORK/secrets/tushare.env --import tsx scripts/facts/record-fixture.ts --tushare 000333.SZ --since-year 2016
node --env-file=/Volumes/AIMATE_WORK/secrets/tushare.env --import tsx scripts/facts/record-fixture.ts --tushare 600036.SH --since-year 2016
grep -l '"report_type":"5"' src/lib/facts/fixtures/tushare/*.meta.json | head
```
Expected: 每家 ≥ 9 页文件 + meta；至少一家的 `income.rt5.p1.json` 有行（修订对）。若三家都没有 type 5 行，再录一家已知有会计差错更正的公司（owner 指定），该公司作为"修订对"夹具。然后：
1. 核对 §15 第 1 条并写入实施记录（Step 11）：对比 `income.rt1` 与 `income.rt5` 同 `end_date` 行的 `ann_date/f_ann_date`、`update_flag`；观察 `has_more` 与 `offset` 行为（`--since-year 2000` 再录一次 600519.SH 的 income rt1 看是否翻页）。
2. `npm test -- src/lib/facts/providers/tushare-statements.test.ts`（装载器自动切到真实夹具；测试 3 若真实夹具无修订对则失败——改用录到修订对的那家 ts_code 跑同一组断言：把 `describe` 顶部的 `'600519.SH'` 改为常量 `TS_CODES=['600519.SH','<修订对公司>']` 并对每家循环）。

**无 token（本机现状）**：不改代码；合成夹具即单测输入；实施记录写"未核对"。`sync-cn.integration.test.ts` 不创建（Task 13 Step 7）。

- [ ] **Step 11: 实施记录（核对结果；runbook 第 8 章由 Task 18 一次写入，本任务不改 runbook，避免两处 "## 8."）**

创建 `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`（已存在则在末尾追加本节）：

```markdown
# 计划二实施记录

只记事实：日期、命令、sha256、计数、观察。规格 §16 的偏差表与 runbook 8.7 核对表从这里抄。

## Tushare `report_type` 1/4/5 核对（规格 §6.3 / §15 第 1 条；Task 12 Step 10）

日期：2026-11-04。环境：本机无 `TUSHARE_TOKEN`。

| 项 | 观察（公司 / 期末 / 原文行） | 结论 |
|---|---|---|
| `limit=2000` / `offset` / `has_more` 的真实分页行为 | 未核对 | `fetchTushareStatements` 按 `has_more` 续页、短页即停；核对前不得宣称覆盖完整 |
| type 1 被更正后 `ann_date` / `f_ann_date` 是否变化 | 未核对 | 合成夹具假设更正后 `f_ann_date` = 更正公告日 |
| type 5 的公告日取哪一列 | 未核对 | 合成夹具假设 = 原始公告日（`f_ann_date ?? ann_date`） |
| 同一 `end_date` 下 1 与 5 同日并存是否出现 | 未核对 | 出现时解析按 §5.3 判 `same_day_conflict`（不同 filing）或 `ambiguous_value`（同 filing） |
| `is_calc=1` 行的处理 | 规格：跳过 | `parseTushareStatements` 跳过并计入 `skipped.is_calc` |
| 真实夹具 | 未录制 | `fixtures/tushare/_synthetic/` 仅供单测；黄金断言与 `sync-cn.integration.test.ts` 等待真实夹具 |

录制与核对命令见 `scripts/facts/record-fixture.ts` 头注释；核对后把"未核对/未录制"改为"已核对（日期，夹具 sha256 前 8 位）+ 观察"。
```

（有 token 时把"未核对/未录制"改为观察结果与夹具 sha256。）

- [ ] **Step 12: 门禁 + 提交**

Run: `npm test -- src/lib/facts/providers src/lib/data/sources && npm run typecheck && npm run lint`
Expected: 全部通过。

```bash
git add src/lib/data/sources/tushare.ts src/lib/data/sources/tushare-raw.test.ts src/lib/facts/providers/tushare-statements.ts src/lib/facts/providers/tushare-fixtures.ts src/lib/facts/providers/tushare-statements.test.ts src/lib/facts/fixtures/tushare scripts/facts/record-fixture.ts docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md
git commit -m "feat(facts): tushareCallRaw and the three-statement adapter with paging, quota detection, coverage summary and fixtures" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: 巨潮挂接 `cninfo-link.ts` + A 股离线回放（条件创建）

**Files:**
- Create: `src/lib/facts/providers/cninfo-link.ts`
- Create: `src/lib/facts/providers/cninfo-link.test.ts`
- Create: `src/lib/facts/fixtures/cninfo/600519.SH-2024-annual.json`（脚本录制，无需 token）
- Modify: `scripts/facts/record-fixture.ts`（补 `--cninfo` 分支）
- Create（仅当真实 Tushare 夹具存在）: `src/lib/facts/sync-cn.integration.test.ts`；Modify: `scripts/ci/research-checks.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/facts/providers/cninfo-link.test.ts
import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import type {Budget} from '../types';
import {CNINFO_HISTORY,CNINFO_TOPSEARCH} from '../../research/ingest/collectors/cninfo';
import {cninfoQueryBody,CNINFO_STATIC,linkCninfoFiling,matchesAnnouncement,type LinkFiling} from './cninfo-link';

const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
const ann=(id:string,title:string)=>({announcementId:id,announcementTitle:title,announcementTime:1743552000000,adjunctUrl:`finalpage/2025-04-03/${id}.PDF`,adjunctType:'PDF'});
const page=(list:unknown[],hasMore=false)=>JSON.stringify({announcements:list,hasMore,totalAnnouncement:list.length});
const annual:LinkFiling={form_type:'annual',fiscal_year:2024,period_end:'2024-12-31',available_date:'2025-04-03'};
const server=(pages:string[],onBody?:(b:string)=>void)=>vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);const body=String(init?.body);onBody?.(body);
 if(url===CNINFO_HISTORY){const n=Number(/pageNum=(\d+)/.exec(body)![1]);return new Response(pages[n-1]??page([]),{status:200});}
 if(url===CNINFO_TOPSEARCH)return new Response(JSON.stringify([{code:'000333',orgId:'9900001929',zwjc:'美的集团'}]));
 return new Response('nope',{status:404});
});

describe('matchesAnnouncement',()=>{
 it('needs the fiscal year and a kind word, rejects 摘要/英文/已取消/补充, and 更正 unless the filing is a restatement or was corrected',()=>{
  expect(matchesAnnouncement('贵州茅台：2024年年度报告',annual)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：<em>2024</em>年 年度报告',annual)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告摘要',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告（英文版）',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告（已取消）',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告的补充公告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2023年年度报告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年第三季度报告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2024年年度报告的更正公告',annual)).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2024年年度报告的更正公告',{...annual,corrected:true})).toBe(true);
  expect(matchesAnnouncement('贵州茅台：关于2023年半年度报告的更正公告',{form_type:'restatement',fiscal_year:2023,period_end:'2023-06-30',available_date:'2024-08-03'})).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2023年半年度报告',{form_type:'restatement',fiscal_year:2023,period_end:'2023-06-30',available_date:'2024-08-03'})).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年第一季度报告',{...annual,form_type:'q1',period_end:'2024-03-31'})).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年半年度报告',{...annual,form_type:'semiannual'})).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告',{...annual,form_type:'other'})).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年年度报告',{...annual,fiscal_year:null})).toBe(false);
 });
 it('report kinds are mutually exclusive: a semiannual title never matches an annual filing and vice versa (round-1 #8)',()=>{
  const semi:LinkFiling={...annual,form_type:'semiannual',period_end:'2024-06-30',available_date:'2024-08-03'};
  for(const t of ['贵州茅台：2024年半年度报告','贵州茅台：2024年半年报','贵州茅台：2024年中期报告','贵州茅台：关于2024年半年度报告的更正公告'])expect(matchesAnnouncement(t,annual),t).toBe(false);
  expect(matchesAnnouncement('贵州茅台：关于2024年半年度报告的更正公告',{...annual,corrected:true})).toBe(false);
  for(const t of ['贵州茅台：2024年年度报告','贵州茅台：2024年年报','贵州茅台：2024年第三季度报告'])expect(matchesAnnouncement(t,semi),t).toBe(false);
  expect(matchesAnnouncement('贵州茅台：2024年半年度报告',semi)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年半年报',semi)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年年报',annual)).toBe(true);
  expect(matchesAnnouncement('贵州茅台：2024年第一季度报告',{...annual,form_type:'q3',period_end:'2024-09-30'})).toBe(false);
 });
});

describe('linkCninfoFiling',()=>{
 it('queries available_date ± 3 days with the collector body shape and links the single matching announcement',async()=>{
  let body='';
  const fetch=server([page([ann('1','贵州茅台：2024年年度报告摘要'),ann('2','贵州茅台：2024年年度报告'),ann('3','贵州茅台：关于召开2024年度股东大会的通知')])],b=>{body=b;});
  const r=await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'9900000227'},{fetch,budget:budget(),minIntervalMs:0});
  expect(r).toEqual({document_ref:'2',document_url:`${CNINFO_STATIC}finalpage/2025-04-03/2.PDF`});
  expect(body).toBe(cninfoQueryBody({code:'600519',orgId:'9900000227',column:'sse',availableDate:'2025-04-03',pageNum:1}));
  expect(body).toContain('seDate=2025-03-31%7E2025-04-06');expect(body).toContain('stock=600519%2C9900000227');expect(body).toContain('column=sse');
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("returns 'none' for zero matches and 'ambiguous' for several",async()=>{
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:server([page([ann('1','2024年年度报告摘要')])]),budget:budget(),minIntervalMs:0})).toBe('none');
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:server([page([ann('1','2024年年度报告'),ann('2','2024年年度报告（修订版）')])]),budget:budget(),minIntervalMs:0})).toBe('ambiguous');
 });
 it('walks every page while hasMore and the page is full; a short page ends the walk',async()=>{
  const full=Array.from({length:30},(_,i)=>ann(`f${i}`,`其他公告${i}`));
  const fetch=server([page(full,true),page([ann('x','2024年年度报告')],true)]);
  expect(await linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch,budget:budget(),minIntervalMs:0})).toEqual({document_ref:'x',document_url:`${CNINFO_STATIC}finalpage/2025-04-03/x.PDF`});
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('uses column=szse for Shenzhen and resolves a missing orgId via topSearch; BJ and non-report filings never hit the network',async()=>{
  const bodies:string[]=[];
  const fetch=server([page([ann('9','美的集团：2024年年度报告')])],b=>bodies.push(b));
  expect(await linkCninfoFiling(annual,{ts_code:'000333.SZ',cninfo_org_id:null},{fetch,budget:budget(),minIntervalMs:0})).toEqual({document_ref:'9',document_url:`${CNINFO_STATIC}finalpage/2025-04-03/9.PDF`});
  expect(fetch.mock.calls.map(c=>String(c[0]))).toEqual([CNINFO_TOPSEARCH,CNINFO_HISTORY]);
  expect(bodies[1]).toContain('column=szse');expect(bodies[1]).toContain('stock=000333%2C9900001929');
  const noCall=vi.fn();
  expect(await linkCninfoFiling(annual,{ts_code:'830799.BJ',cninfo_org_id:'o'},{fetch:noCall,budget:budget()})).toBe('none');
  expect(await linkCninfoFiling({...annual,form_type:'other'},{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:noCall,budget:budget()})).toBe('none');
  expect(noCall).not.toHaveBeenCalled();
 });
 it('throws on HTTP failure and on an exhausted budget (the caller counts the attempt)',async()=>{
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:async()=>new Response('',{status:500}),budget:budget(),minIntervalMs:0})).rejects.toThrow(/cninfo 500/);
  await expect(linkCninfoFiling(annual,{ts_code:'600519.SH',cninfo_org_id:'o'},{fetch:vi.fn(),budget:{remainingMs:()=>1000,signal:new AbortController().signal}})).rejects.toThrow(/budget_exhausted/);
 });
 const FIXTURE=new URL('../fixtures/cninfo/600519.SH-2024-annual.json',import.meta.url);
 it.skipIf(!existsSync(FIXTURE))('links the recorded 600519.SH 2024 annual report to exactly one PDF',async()=>{
  const fx=JSON.parse(readFileSync(FIXTURE,'utf8')) as {__recorded:{org_id:string;available_date:string;fiscal_year:number;form_type:LinkFiling['form_type']};pages:unknown[]};
  const fetch=server(fx.pages.map(p=>JSON.stringify(p)));
  const r=await linkCninfoFiling({form_type:fx.__recorded.form_type,fiscal_year:fx.__recorded.fiscal_year,period_end:`${fx.__recorded.fiscal_year}-12-31`,available_date:fx.__recorded.available_date},{ts_code:'600519.SH',cninfo_org_id:fx.__recorded.org_id},{fetch,budget:budget(),minIntervalMs:0});
  expect(r).toMatchObject({document_ref:expect.stringMatching(/^\d+$/),document_url:expect.stringMatching(/^http:\/\/static\.cninfo\.com\.cn\/.+\.PDF$/i)});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/facts/providers/cninfo-link.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// src/lib/facts/providers/cninfo-link.ts
// 巨潮 filing linkage (spec §6.3 linkCn). For an A-share periodic filing, list hisAnnouncement/query over
// available_date ± 3 days (every page) and keep titles that name the report year and kind and are not
// 摘要/英文/已取消/补充; 更正 titles are excluded, except for restatement filings and filings that were
// corrected (a type-5 row exists for the same key), which must match 更正 + year + kind. Exactly one hit →
// {document_ref, document_url}; zero → 'none'; several → 'ambiguous'. SH/SZ only (BJ → 'none' without a
// request). Same endpoint, 500 ms pacing and body as research/ingest/collectors/cninfo.ts; orgId from
// issuers.cninfo_org_id, else resolveOrgId (not persisted here). Network errors throw; the caller still
// counts the attempt (link_attempts + 1, stop at 5).
import {createClient,DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {CNINFO_HISTORY,resolveOrgId} from '../../research/ingest/collectors/cninfo';
import type {Budget,FilingRow} from '../types';

export const CNINFO_STATIC='http://static.cninfo.com.cn/';
export const CNINFO_PAGE_SIZE=30;
export const CNINFO_WINDOW_DAYS=3;
export const KIND_WORDS={annual:['年度报告','年报'],semiannual:['半年度报告','半年报','中期报告'],q1:['第一季度报告','一季度报告','第一季度季报'],q3:['第三季度报告','三季度报告','第三季度季报']} as const;
/** Kinds are mutually exclusive: 半年度报告 / 半年报 contain the annual words, so an annual filing refuses any 半年 title (round-1 #8). */
export const KIND_VETO:Partial<Record<keyof typeof KIND_WORDS,RegExp>>={annual:/半年/};
export const EXCLUDE=/摘要|英文|已取消|补充/;
export type CninfoLinkResult={document_ref:string;document_url:string}|'none'|'ambiguous';
export interface LinkFiling{form_type:FilingRow['form_type'];fiscal_year:number|null;period_end:string|null;available_date:string;corrected?:boolean}
export interface LinkIssuer{ts_code:string;cninfo_org_id:string|null}
export interface LinkOptions{fetch?:typeof fetch;userAgent?:string;budget:Budget;minIntervalMs?:number}
interface Announcement{announcementId?:string;announcementTitle?:string;adjunctUrl?:string}
const KIND_BY_MONTH:Record<string,keyof typeof KIND_WORDS|undefined>={'03':'q1','06':'semiannual','09':'q3','12':'annual'};

function kindOf(f:LinkFiling):keyof typeof KIND_WORDS|null{
 if(f.form_type==='annual'||f.form_type==='semiannual'||f.form_type==='q1'||f.form_type==='q3')return f.form_type;
 if(f.form_type==='restatement'&&f.period_end)return KIND_BY_MONTH[f.period_end.slice(5,7)]??null;
 return null;
}
export function matchesAnnouncement(title:string,f:LinkFiling):boolean{
 const kind=kindOf(f);
 if(!kind||f.fiscal_year===null)return false;
 const t=title.replace(/<[^>]+>/g,'').replace(/\s+/g,'');
 if(EXCLUDE.test(t))return false;
 const veto=KIND_VETO[kind];
 if(veto&&veto.test(t))return false;
 const correction=f.form_type==='restatement'||f.corrected===true;
 if(correction!==t.includes('更正'))return false;
 if(!t.includes(`${f.fiscal_year}年`))return false;
 return KIND_WORDS[kind].some(w=>t.includes(w));
}
const shiftDate=(ymd:string,days:number)=>new Date(Date.parse(`${ymd}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
export function cninfoQueryBody(q:{code:string;orgId:string;column:'sse'|'szse';availableDate:string;pageNum:number}):string{
 const seDate=`${shiftDate(q.availableDate,-CNINFO_WINDOW_DAYS)}~${shiftDate(q.availableDate,CNINFO_WINDOW_DAYS)}`;
 return new URLSearchParams({pageNum:String(q.pageNum),pageSize:String(CNINFO_PAGE_SIZE),column:q.column,tabName:'fulltext',plate:'',stock:`${q.code},${q.orgId}`,searchkey:'',secid:'',category:'',trade:'',seDate,sortName:'',sortType:'',isHLtitle:'true'}).toString();
}

export async function linkCninfoFiling(filing:LinkFiling,issuer:LinkIssuer,opts:LinkOptions):Promise<CninfoLinkResult>{
 const m=/^(\d{6})\.(SH|SZ)$/.exec(issuer.ts_code);
 if(!m||kindOf(filing)===null||filing.fiscal_year===null)return 'none';
 const code=m[1],column=m[2]==='SH'?'sse':'szse';
 const ua=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const orgId=issuer.cninfo_org_id??(await resolveOrgId(code,{fetch:opts.fetch,userAgent:ua}))?.orgId;
 if(!orgId)return 'none';
 const client=createClient({ctx:null as never,companies:[],since:'',fetch:opts.fetch,userAgent:ua,minIntervalMs:opts.minIntervalMs},500);
 const hits:{id:string;url:string}[]=[];
 for(let pageNum=1;;pageNum++){
  if(opts.budget.signal.aborted||opts.budget.remainingMs()<=20_000)throw new Error('budget_exhausted');
  const res=await client.post(CNINFO_HISTORY,cninfoQueryBody({code,orgId,column,availableDate:filing.available_date,pageNum}));
  if(!res.ok)throw new Error(`cninfo ${res.status}`);
  const page=await res.json() as {announcements?:Announcement[]|null;hasMore?:boolean};
  const list=page.announcements??[];
  for(const a of list)if(typeof a.announcementId==='string'&&typeof a.adjunctUrl==='string'&&matchesAnnouncement(a.announcementTitle??'',filing))hits.push({id:a.announcementId,url:CNINFO_STATIC+a.adjunctUrl});
  if(!page.hasMore||list.length<CNINFO_PAGE_SIZE)break;
 }
 if(hits.length===0)return 'none';
 if(hits.length>1)return 'ambiguous';
 return {document_ref:hits[0].id,document_url:hits[0].url};
}
```

- [ ] **Step 4: 运行（录制前最后一个测试 skip）**

Run: `npm test -- src/lib/facts/providers/cninfo-link.test.ts`
Expected: 7 passed, 1 skipped。

- [ ] **Step 5: 补录制脚本的 `--cninfo` 分支并录制**

在 `scripts/facts/record-fixture.ts` 加入 Task 10 Step 6 中的三条 import（`cninfoQueryBody,CNINFO_PAGE_SIZE`、`CNINFO_HISTORY,resolveOrgId`、`createClient`）、`recordCninfo` 函数与 `--cninfo` 分支。然后确定贵州茅台 2024 年年度报告的公告日期（在 cninfo 网站检索标题"2024年年度报告"，取其日期 `YYYY-MM-DD`），运行：

```bash
npx tsx scripts/facts/record-fixture.ts --cninfo 600519.SH <YYYY-MM-DD> 2024 annual
npm test -- src/lib/facts/providers/cninfo-link.test.ts
```
Expected: 写出 `src/lib/facts/fixtures/cninfo/600519.SH-2024-annual.json`；8 passed, 0 skipped。若 cninfo 从本机不可达（超时/非 200），保留 skip，并在 `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md` 的核对表增加一行 `| 巨潮夹具 | 未录制（<原因>） | cninfo-link.test.ts 最后一个用例 skip |`（Task 18 把它抄进 runbook 8.7）。

- [ ] **Step 6: 门禁 + 提交**

Run: `npm run typecheck && npm run lint`

```bash
git add src/lib/facts/providers/cninfo-link.ts src/lib/facts/providers/cninfo-link.test.ts scripts/facts/record-fixture.ts src/lib/facts/fixtures/cninfo docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md
git commit -m "feat(facts): cninfo announcement linkage for A-share filings (year+kind match, exclusions, correction titles, paging)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: A 股离线回放（条件创建）**

**创建时机**：当且仅当 `src/lib/facts/fixtures/tushare/600519.SH.income.rt1.p1.json`（真实录制，非 `_synthetic`）存在。创建本文件与 `criticalSuites` 登记在**同一提交**（否则 `verifyCriticalSuiteInventory` 报 drift）。无 token 时跳过本步，Part D 的 CN cron 不加入 `vercel.json`。

```ts
// src/lib/facts/sync-cn.integration.test.ts
// Plan 2 §11.3 A-share offline replay on real PostgreSQL with the recorded Tushare pages (fetchCn) and the
// recorded cninfo page set (linkCn): publish (with coverage_summary), revision pair (type 5 vs type 1, asOf
// on both sides of the correction date), same-day conflict from a SECOND filing (a type-4 page row with the
// same K and announcement date, round-1 #16), same-filing re-publication as plain duplicates, annual filing
// linked to a cninfo PDF, and the CN gold gate. Created only once real fixtures exist.
import {existsSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgFactsDb} from './pg-facts-db';
import {memorySnapshotStore} from './snapshot-store';
import {runFactsSync,type SyncDeps} from './sync';
import {scanJsonNumbers} from './json-numbers';
import {ProviderError,snapshotOf,stringifyPreservingNumbers} from './providers/shared';
import {coverageSummary,parseTushareStatements} from './providers/tushare-statements';
import {loadTushareFixtures,TUSHARE_FIXTURE_DIR} from './providers/tushare-fixtures';
import {linkCninfoFiling} from './providers/cninfo-link';
import {CNINFO_HISTORY} from '../research/ingest/collectors/cninfo';
import type {FactsDb,RawSnapshot} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const TS_CODE='600519.SH';
const REVISION_TS_CODE='600519.SH';   // the recorded company whose income.rt5 has rows (Task 12 Step 10); change if another company carries the pair
const CNINFO_FIXTURE=new URL('./fixtures/cninfo/600519.SH-2024-annual.json',import.meta.url);
const today=()=>new Date().toISOString().slice(0,10);
const rt=(ref:string)=>ref.split(':')[2];
interface GoldEntry{issuer:{ticker:string;market:'US'|'CN'};concept:string;period_end:string;unit:string;value:string;as_of?:string|null;recorded_by:string}
const isPending=(e:GoldEntry)=>e.recorded_by==='<pending>'||e.value==='<pending>';
type Page={data:{fields:string[];items:unknown[][]}|null};
const pageOf=(s:RawSnapshot)=>scanJsonNumbers(s.bytes) as Page;
const incomePage=(pages:RawSnapshot[],reportType:string)=>pages.find(s=>s.meta.api==='income'&&(s.meta.params as {report_type:string}).report_type===reportType)!;
const replacePage=(pages:RawSnapshot[],page:RawSnapshot,tree:Page)=>pages.map(s=>s===page?snapshotOf(new TextEncoder().encode(stringifyPreservingNumbers(tree)),{...page.meta}):s);

describe.skipIf(!enabled)('F2-4 A-share offline replay on real PostgreSQL',()=>{
 let admin:Pool;let db:FactsDb;let deps:SyncDeps;
 const issuers:Record<string,string>={};
 let snapshots:Record<string,RawSnapshot[]>={};
 const cninfo=existsSync(CNINFO_FIXTURE)?JSON.parse(readFileSync(CNINFO_FIXTURE,'utf8')) as {__recorded:{org_id:string;available_date:string;fiscal_year:number};pages:unknown[]}:null;
 const run=(ids:string[])=>runFactsSync(deps,{market:'CN',limit:10,issuerIds:ids,dryRun:false,triggeredBy:'script'});
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  for(const code of new Set([TS_CODE,REVISION_TS_CODE])){
   snapshots[code]=loadTushareFixtures(code,TUSHARE_FIXTURE_DIR);
   await admin.query(`insert into public.stocks_universe(ticker,name,market) values($1,$1,'A') on conflict (ticker) do nothing`,[code]);
   await admin.query(`insert into public.issuers(issuer_id,canonical_name_zh,country_code,cninfo_org_id) values($1,$2,'CN',$3) on conflict do nothing`,[randomUUID(),code,code===TS_CODE?cninfo?.__recorded.org_id??null:null]);
   issuers[code]=(await admin.query(`select i.issuer_id from public.issuers i where i.canonical_name_zh=$1 order by created_at limit 1`,[code])).rows[0].issuer_id;
   await admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'A',true,'2000-01-01','test') on conflict do nothing`,[issuers[code],code]);
  }
  db=pgFactsDb(admin);
  await db.reconcileScope('CN',Object.entries(issuers).map(([code,id])=>({issuer_id:id,reasons:['test'],priority:10,fetch_key:code})));
  const cninfoFetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(String(input)!==CNINFO_HISTORY||!cninfo)return new Response('{"announcements":[],"hasMore":false}',{status:200});
   const body=String(init?.body);const n=Number(/pageNum=(\d+)/.exec(body)![1]);
   const inWindow=body.includes(`seDate=${encodeURIComponent(shift(cninfo.__recorded.available_date,-3))}`);
   return new Response(JSON.stringify(inWindow?cninfo.pages[n-1]??{announcements:[],hasMore:false}:{announcements:[],hasMore:false}),{status:200});
  };
  deps={db,tables:pgTableClient(admin),storage:memorySnapshotStore(),
   fetchUs:async()=>{throw new ProviderError('sec_unavailable','not in this suite');},
   fetchCn:async(tsCode:string)=>{const s=snapshots[tsCode];if(!s)throw new ProviderError('tushare_unavailable',tsCode);return s;},
   parseUs:()=>{throw new ProviderError('parse_error','not in this suite');},
   parseCn:(pages,o)=>parseTushareStatements(pages,{sinceYear:o.sinceYear}),
   coverageCn:coverageSummary,   // wired exactly like deps.ts (round-1 #12)
   linkCn:(filing,b)=>linkCninfoFiling({form_type:filing.form_type,fiscal_year:filing.fiscal_year,period_end:filing.period_end,available_date:filing.available_date},{ts_code:TS_CODE,cninfo_org_id:cninfo?.__recorded.org_id??null},{fetch:cninfoFetch,budget:b,minIntervalMs:0}),
   now:()=>new Date(),deadline:null,codeVersion:'test'};
 });
 afterAll(async()=>{await admin?.end();});
 const shift=(ymd:string,d:number)=>new Date(Date.parse(`${ymd}T00:00:00Z`)+d*86_400_000).toISOString().slice(0,10);

 it('publishes ten years of three statements; revenue FY rows are 12M CNY facts keyed to annual filings',async()=>{
  const r=await run(Object.values(issuers));
  expect(r.status).toBe('success');expect(r.detail.published).toBe(Object.keys(issuers).length);
  expect(r.errors.some(e=>e.code==='coverage_summary')).toBe(true);
  const rows=(await db.readFacts(issuers[TS_CODE],'CN',{concepts:['revenue'],asOf:today()})).rows.filter(x=>x.duration==='12M');
  expect(rows.length).toBeGreaterThanOrEqual(5);
  for(const x of rows)expect(x).toMatchObject({unit:'CNY',period_start:`${x.period_end.slice(0,4)}-01-01`,status:'ok'});
 },180_000);

 it('a type-5 (pre-correction) row and its type-1 counterpart coexist; asOf before the correction date reads the old value',async()=>{
  const parsed=parseTushareStatements(snapshots[REVISION_TS_CODE],{sinceYear:2000});
  const avail=(ref:string)=>parsed.filings.find(f=>f.sourceRef===ref)!.availableDate;
  const pair=parsed.candidates.filter(a=>rt(a.filingRef)==='5').map(a=>[a,parsed.candidates.find(b=>rt(b.filingRef)==='1'&&b.concept===a.concept&&b.periodStart===a.periodStart&&b.periodEnd===a.periodEnd&&b.unit===a.unit)] as const).find(([a,b])=>b&&b.value!==a.value&&avail(a.filingRef)<avail(b.filingRef));
  expect(pair,'fixture needs a type-5/type-1 pair with different values and dates (§11.1)').toBeDefined();
  const [old,cur]=pair!;
  const read=(asOf:string)=>db.readFacts(issuers[REVISION_TS_CODE],'CN',{concepts:[old.concept],asOf,from:old.periodEnd,to:old.periodEnd,history:true}).then(r=>r.rows.filter(x=>x.unit===old.unit&&x.period_start===old.periodStart));
  const before=await read(shift(avail(cur!.filingRef),-1));
  expect(before.at(-1)).toMatchObject({value_text:old.value,is_current:true});
  const after=await read(today());
  expect(after.at(-1)).toMatchObject({value_text:cur!.value,is_current:true,is_revision:true});
  expect(after.length).toBe(before.length+1);
 });

 it('a SECOND filing (type-4 page row) with the same K on the same announcement date and another value → same_day_conflict: both rows quarantined, the day has no ok value (round-1 #16)',async()=>{
  const parsed=parseTushareStatements(snapshots[TS_CODE],{sinceYear:2000});
  const target=parsed.candidates.filter(c=>c.concept==='revenue'&&c.duration==='12M'&&rt(c.filingRef)==='1').sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd))[0];
  const page1=incomePage(snapshots[TS_CODE],'1'),page4=incomePage(snapshots[TS_CODE],'4');
  const t1=pageOf(page1),t4=pageOf(page4);
  const fields=t1.data!.fields;const ei=fields.indexOf('end_date'),ri=fields.indexOf('report_type'),fi=fields.indexOf('total_revenue');
  const src=t1.data!.items.find(r=>r[ei]===target.periodEnd.replace(/-/g,''))!;
  // Clone the type-1 row into the type-4 page: same end_date and f_ann_date/ann_date (→ same K and
  // available_date) under report_type 4 (→ a distinct source_ref / filing), value + 1. A changed value
  // inside the SAME filing would be a duplicate candidate key, not a second conflicting fact (next test).
  const row=[...src];row[ri]={__num:'4'};row[fi]={__num:`${target.value}1`};
  const data4=t4.data??{fields,items:[]};
  expect(data4.fields,'the type-4 page must carry the type-1 columns').toEqual(fields);
  const mutated=replacePage(snapshots[TS_CODE],page4,{data:{fields,items:[...data4.items,row]}});
  const original=snapshots[TS_CODE];snapshots[TS_CODE]=mutated;
  const r=await run([issuers[TS_CODE]]);
  snapshots[TS_CODE]=original;
  expect(r.status).toBe('success');expect(r.counts.quarantined).toBeGreaterThanOrEqual(1);
  const avail=parsed.filings.find(f=>f.sourceRef===target.filingRef)!.availableDate;
  const rows=(await db.readFacts(issuers[TS_CODE],'CN',{concepts:['revenue'],asOf:today(),from:target.periodEnd,to:target.periodEnd,history:true,includeNonOk:true})).rows.filter(x=>x.duration==='12M'&&x.available_date===avail);
  expect(rows.length).toBe(2);expect(rows.every(x=>x.status==='quarantined')).toBe(true);
  expect(new Set(rows.map(x=>x.filing_id)).size).toBe(2);                                             // two filings: the type-1 row and the type-4 restatement
  expect(new Set(rows.map(x=>x.value_text))).toEqual(new Set([target.value,`${target.value}1`]));
  expect((await db.readFacts(issuers[TS_CODE],'CN',{concepts:['revenue'],asOf:today(),from:target.periodEnd,to:target.periodEnd})).rows.filter(x=>x.duration==='12M'&&x.available_date===avail)).toEqual([]);   // the day has no ok value
  const items=(await admin.query(`select payload from public.dq_quarantine where reason_code='same_day_conflict' and status='open' and table_name='financial_facts' and natural_key like $1`,[`${issuers[TS_CODE]}:CN:revenue:%:${avail}`])).rows;
  expect(items).toHaveLength(1);expect((items[0].payload as {fact_ids:string[]}).fact_ids.sort()).toEqual(rows.map(x=>x.fact_id).sort());
 },180_000);

 it('the same page re-published with a changed value inside the SAME filing is a duplicate candidate key: no new row, no conflict',async()=>{
  const parsed=parseTushareStatements(snapshots[TS_CODE],{sinceYear:2000});
  const target=parsed.candidates.filter(c=>c.concept==='revenue'&&c.duration==='12M'&&rt(c.filingRef)==='1').sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd))[1];   // a day the previous test did not dispute
  const page1=incomePage(snapshots[TS_CODE],'1');const t1=pageOf(page1);
  const fields=t1.data!.fields;const ei=fields.indexOf('end_date'),fi=fields.indexOf('total_revenue');
  const row=t1.data!.items.find(r=>r[ei]===target.periodEnd.replace(/-/g,''))!;row[fi]={__num:`${target.value}1`};
  const original=snapshots[TS_CODE];snapshots[TS_CODE]=replacePage(snapshots[TS_CODE],page1,t1);
  const r=await run([issuers[TS_CODE]]);
  snapshots[TS_CODE]=original;
  expect(r.status).toBe('success');expect(r.counts).toMatchObject({inserted:0,versioned:0,quarantined:0});expect(r.counts.duplicates).toBeGreaterThan(0);
  const filingId=(await db.filingsOfIssuer(issuers[TS_CODE],'CN',{})).find(f=>f.source_ref===target.filingRef)!.filing_id;
  const rows=(await db.readFacts(issuers[TS_CODE],'CN',{concepts:['revenue'],asOf:today(),from:target.periodEnd,to:target.periodEnd,history:true,includeNonOk:true})).rows.filter(x=>x.duration==='12M'&&x.filing_id===filingId);
  expect(rows.map(x=>[x.status,x.value_text])).toEqual([['ok',target.value]]);   // one row for that filing, the stored value untouched
 },180_000);

 it.skipIf(!cninfo)('the recorded annual filing is linked to one cninfo PDF; other filings carry a counted attempt',async()=>{
  const filings=await db.filingsOfIssuer(issuers[TS_CODE],'CN',{});
  const annual=filings.find(f=>f.form_type==='annual'&&f.fiscal_year===cninfo!.__recorded.fiscal_year&&f.available_date===cninfo!.__recorded.available_date);
  expect(annual,'annual filing on the recorded date').toBeDefined();
  expect(annual).toMatchObject({document_ref:expect.stringMatching(/^\d+$/),document_url:expect.stringMatching(/^http:\/\/static\.cninfo\.com\.cn\//),link_attempts:1});
  const other=filings.filter(f=>f.form_type==='q1'&&f.document_ref===null);
  expect(other.length).toBeGreaterThan(0);for(const f of other)expect(f.link_attempts).toBeGreaterThanOrEqual(1);
 });

 it('CN gold gate: required.CN demands recorded entries for the fixture-backed issuers; ready forbids <pending>; recorded entries replay (round-1 #19)',async()=>{
  const gold=JSON.parse(readFileSync(new URL('./fixtures/gold/plan2.json',import.meta.url),'utf8')) as {ready:boolean;required:{CN:boolean};entries:GoldEntry[]};
  const cn=gold.entries.filter(e=>e.issuer.market==='CN');
  if(gold.required.CN)for(const code of Object.keys(issuers))expect(cn.some(e=>e.issuer.ticker===code&&!isPending(e)),`gold entry for ${code} is still <pending> — owner step (runbook 8.11-5/6)`).toBe(true);
  if(gold.ready){
   expect(cn.filter(isPending).map(e=>`${e.issuer.ticker}/${e.concept}/${e.period_end}`),'pending CN entries in a ready gold file').toEqual([]);
   for(const e of cn)expect(e.issuer.ticker in issuers,`${e.issuer.ticker}: no recorded Tushare fixture`).toBe(true);
  }
  const recorded=cn.filter(e=>!isPending(e));
  for(const e of recorded){
   const issuer=issuers[e.issuer.ticker];expect(issuer,`no fixture-backed issuer for ${e.issuer.ticker}`).toBeDefined();
   const res=await db.readFacts(issuer,'CN',{concepts:[e.concept],asOf:e.as_of??today(),from:e.period_end,to:e.period_end});
   const row=res.rows.find(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.is_current);
   expect(row,`${e.issuer.ticker} ${e.concept} ${e.period_end}`).toBeDefined();expect(row!.value_text).toBe(e.value);
  }
 });
});
```

`it.skipIf(!cninfo)` 违反 criticalSuites 的"不得 skip"规则：**创建本文件前巨潮夹具必须已录制**（Step 5），因此创建时把 `it.skipIf(!cninfo)` 写成 `it`，并在 `beforeAll` 里 `if(!cninfo)throw new Error('cninfo fixture required')`。

然后：`scripts/ci/research-checks.ts` 的 `.concat(...)` 末尾追加 `'src/lib/facts/sync-cn.integration.test.ts'`。

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db && npm run typecheck && npm run lint`
Expected: `sync-cn.integration.test.ts` 6 passed（`required.CN` 仍为 false 时黄金用例只回放已录入条目；owner 把 `required.CN` 置 true 后它与美股门禁同样在录入前为红）；`criticalSuites` 再 +1。`sync-us.integration.test.ts` 的黄金门禁状态见 Task 11 Step 5。

```bash
git add src/lib/facts/sync-cn.integration.test.ts scripts/ci/research-checks.ts src/lib/facts/fixtures/tushare
git commit -m "test(facts): A-share offline replay on PostgreSQL (revision pair, same-day conflict, cninfo linkage, gold)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Part C 自检

- 规格覆盖：§6.2 全部（pace/超时/退避/404/50 MB、数值模式解码、按期首标签选取、`ambiguous_value`、`frame` 只进 payload、`filings.period_end`、`fy/fp` 只进 filing、`sinceYear` 缺省）；§6.3 全部（`tushareCallRaw` 保留原文/`has_more`/`request_id`、`limit/offset` 分页并标注未核对、1/4/5、`is_calc`、YTD `period_start`、`source_ref` 格式、`form_type` 映射、巨潮年份+类型词/排除/更正/零一多/分页/SH-SZ、`coverage_summary`、配额码）；§4.7 `raw_hash` 定位；§5.1 可得日期；§11.1 两适配器与 cninfo 单测；§11.3 美股与 A 股回放；§11.4 黄金文件与条件断言；§12 F2-3/F2-4 退出条件与降级路径；§15.1 记入 runbook。
- 引入的名字：见"本部分新增导出"；`ProviderError` 是 Part B `SyncError` 的别名，`tushare_unavailable` 已加入 `SyncErrorCode`；黄金文件多 `required` 与 `as_of`；`oddDuration` 候选带 `periodDays`。
- 对 Part A/B 的依赖已按实际签名核对并改写（见文末"接口对齐记录"）：`decodeWithSchema` 按最近外层键名解码；`normalizeUnit(raw)` 单参数 + `unitKindOf` 过滤；`classifyDuration` 返回 `'odd'`；`mappingGen` 在 `SyncOptions`；`issuerIds` 直跑且核心不先 reconcile；回执 `{batchId,status,counts,errors,issuers,idle,detail}`；`sync.ts` 以 `SyncError.code`（= `ProviderError.code`）作批次错误码；`same_day_conflict` 的 `natural_key` 以 `<issuer>:CN:<concept>:` 开头并以 `<available_date>` 结尾（`keys.ts::sameDayConflictKey`）。
- 开放问题：(1) 贵州茅台 2024 年报公告日由实施者在 cninfo 核实后作为录制参数；(2) 真实 Tushare 夹具是否含 `update_flag` 0/1 并存行未知，测试在真实模式下对该形态只做结构断言。


## Part D：Task 14–18（F2-5 范围、脚本、cron；F2-6 派生与读接口；F2-7 文档收尾）

本部分实现规格 §6.4、§6.5、§8、§9、§12 F2-5/F2-6/F2-7、§13、§16 与 runbook 新章节。全部类型、`FactsDb` 方法名、SQL 函数名与错误码取自计划骨架"共享契约"，原样使用。

**本部分新增导出**（骨架未定义，在各自文件内定义）：

| 导出 | 文件 | 说明 |
|---|---|---|
| `fetchKey(market, issuer)`、`reconcileScope(deps, market, opts)`、`ScopeReconcileResult` | `src/lib/facts/scope.ts` | §6.4 |
| `FORMULA_VERSION`、`RATIO_SCALE`、`Q_SINGLE_CONCEPTS`、`DERIVE_CONCEPTS`、`metricNames(market)`、`DeriveOptions`、`deriveMetrics`、`addDays`、`MaterializeDb`、`MaterializeResult`、`materialize` | `src/lib/facts/derive.ts` | §8 |
| `TICKER_RE`、`QueryError`、`readParams`、`dateParam`、`intParam`、`listParam`、`asOfParam`、`marketOfTicker`、`utcDate`、`errorResponse`、`paramErrorResponse`、`resolvePublicIssuer`、`publicClients`、`successHeaders`、`citationOf`、`publicFiling`、`publicFact` | `src/lib/facts/public-route.ts` | §9 三路由共用约定 |
| `resolveCodeVersion(opts)`、`productionSyncDeps(opts)` | `src/lib/facts/deps.ts` | cron 与脚本共用的生产依赖装配 |

**对 Part B/C 的依赖**（整合后按实际导出；Task 17 的代码已据此编写）：
- `runFactsSync(deps:SyncDeps, opts:SyncOptions):Promise<SyncReceipt>`，`SyncOptions={market;limit;issuerIds?;dryRun;triggeredBy;sinceYear?;mappingGen?}`；`dryRun=true` 时不建批次、不取租约、不上传快照、不写任何表，但仍抓取、解析并 `planFactWrites`，每个发行人 `outcome='planned'`；`issuerIds` 给定时核心**不**先 `reconcileScope`（`--no-db` 与 `--issuer` 都依赖这一点）。
- `SyncReceipt={batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];issuers:IssuerOutcome[];idle:boolean;detail:{attempted,published,failed,skipped,idle}}`；`IssuerOutcome={issuerId;fetchKey;runId:string|null;outcome:'published'|'planned'|'failed'|'skipped';code?;counts;errors;warnings:Map<string,string[]>;snapshotSha256:string[]}`（`warnings` 在 `JSON.stringify` 下是 `{}`）。
- `SyncDeps={db,tables,storage,fetchUs,fetchCn,parseUs,parseCn,linkCn?,now,deadline,codeVersion:string|null}`——比规格 §6.1 多 `parseUs/parseCn`，由 `deps.ts` 注入 `parseCompanyFacts` / `parseTushareStatements`。
- Part A/B/C 的导出名：`supabaseFactsDb(client)`、`memoryFactsDb(tables?)`、`supabaseSnapshotStore(admin)`、`memorySnapshotStore()`、`fetchCompanyFacts(cik10, budget)`、`parseCompanyFacts(snapshot,{sinceYear})`、`fetchTushareStatements(tsCode, sinceYear, budget)`、`parseTushareStatements(snapshots,{sinceYear})`、`linkCninfoFiling(filing:LinkFiling, issuer:{ts_code,cninfo_org_id}, {budget})`（三参数；`deps.ts` 负责从 `issuers`/`issuer_securities` 取 `ts_code` 与 `cninfo_org_id`，并按同键是否存在 type-5 行判 `corrected`）、`canonicalDecimal(text)`（纯文本进出，不要 `__num` 包装）、`FACT_CONCEPTS`、`MAPPING_GEN`、`sync.ts::resolveCodeVersion(env?,exec?)`（`deps.ts` 的 `resolveCodeVersion({allowGit})` 委托它）。

---

### Task 14: 范围 `src/lib/facts/scope.ts`

**Files:**
- Create: `src/lib/facts/scope.ts`
- Modify: `src/lib/entities/resolve.ts`（一行：导出已落地的有效期谓词 `isCurrentSecurity`；round-1 #22）
- Test: `src/lib/facts/scope.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/facts/scope.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from './memory-facts-db';
import {fetchKey,reconcileScope,scopeRowFor} from './scope';
import type {FactsDb,Market} from './types';

const A='11111111-1111-4111-8111-111111111111',M='22222222-2222-4222-8222-222222222222',K='33333333-3333-4333-8333-333333333333';
// One frozen clock for the whole file: reconciliation reads `today`, the memory db stamps next_due_at
// with its own clock, and the due queries ask for TODAY — all three must agree (round-1 #23).
const TODAY='2026-11-04';
const NOW_ISO=`${TODAY}T00:00:00.000Z`;
async function seed(){
 const c=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']});
 await c.insert('issuers',{issuer_id:A,cik:'320193',status:'active'});
 await c.insert('issuers',{issuer_id:M,cik:null,status:'active'});          // no CIK → not in US scope
 await c.insert('issuers',{issuer_id:K,cik:null,status:'active'});          // Moutai
 await c.insert('issuer_securities',{issuer_id:A,ticker:'AAPL',is_primary:true,valid_from:'2000-01-01',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:M,ticker:'MSFT',is_primary:true,valid_from:'2000-01-01',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:K,ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:K,ticker:'600519.OLD',is_primary:true,valid_from:'1990-01-01',valid_to:'2001-08-26'});
 for(const [u,t] of [['sp500','AAPL'],['nasdaq_top500','AAPL'],['sp500','MSFT'],['us_china','BABA']] as const)
  await c.insert('security_universe_memberships',{ticker:t,universe:u,is_active:true,as_of_date:TODAY});
 await c.insert('security_universe_memberships',{ticker:'AAPL',universe:'watchlist',is_active:true,as_of_date:TODAY});  // owner decision B: ignored
 await c.insert('security_universe_memberships',{ticker:'MSFT',universe:'nasdaq_top500',is_active:false,as_of_date:TODAY});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e1',in_scope:true,issuer_id:K,home_market:'A'});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e2',in_scope:true,issuer_id:null,home_market:'A'});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e3',in_scope:false,issuer_id:A,home_market:'US'});
 return c;
}
/** memoryFactsDb on the frozen clock plus a recorder of what reconcileScope received. */
function recordingDb(){
 const db=memoryFactsDb();db.setNow(NOW_ISO);const calls:{market:Market;rows:Parameters<FactsDb['reconcileScope']>[1]}[]=[];
 const wrapped:FactsDb={...db,reconcileScope:(market,rows)=>{calls.push({market,rows});return db.reconcileScope(market,rows);}};
 return {db:wrapped,calls};
}

describe('fetchKey',()=>{
 it('pads US CIKs to 10 digits and keeps CN tickers as-is',()=>{
  expect(fetchKey('US',{cik:'320193'})).toBe('0000320193');
  expect(fetchKey('CN',{ticker:'600519.SH'})).toBe('600519.SH');
  expect(()=>fetchKey('US',{cik:null})).toThrow('missing_cik');
  expect(()=>fetchKey('CN',{ticker:'AAPL'})).toThrow('not_cn_ticker');
 });
});

describe('reconcileScope',()=>{
 it('US: active tickers of the three public universes → issuers with a CIK, priority 10, reasons per universe',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const r=await reconcileScope({tables,db},'US',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:0,skipped:{no_cik:1,unknown_ticker:1}});
  expect(calls[0].rows).toEqual([{issuer_id:A,reasons:['universe:nasdaq_top500','universe:sp500'],priority:10,fetch_key:'0000320193'}]);
  expect((await db.scopeDue('US',`${TODAY}T23:59:59Z`,10)).map(s=>s.issuer_id)).toEqual([A]);
 });
 it('CN: in_scope entity keys with an issuer → current primary .SH/.SZ/.BJ ticker, reasons cohort; watchlists never enter',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:0});
  expect(calls[0].rows).toEqual([{issuer_id:K,reasons:['cohort'],priority:10,fetch_key:'600519.SH'}]);
 });
 it('is idempotent and retires rows that vanished from the sources with priority 0',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  await reconcileScope({tables,db},'US',{today:TODAY});
  await reconcileScope({tables,db},'US',{today:TODAY});
  expect(calls[1].rows).toEqual(calls[0].rows);
  await tables.update('security_universe_memberships',{ticker:'AAPL',universe:'sp500'},{is_active:false});
  await tables.update('security_universe_memberships',{ticker:'AAPL',universe:'nasdaq_top500'},{is_active:false});
  // the scope table is what reconcileScope reads for "vanished" rows: mirror the memory db's rows into the table client
  await tables.insert('fact_sync_scope',{issuer_id:A,market:'US',reasons:['universe:sp500'],priority:10,fetch_key:'0000320193'});
  const r=await reconcileScope({tables,db},'US',{today:TODAY});
  expect(r).toMatchObject({desired:0,retired:1});
  expect(calls[2].rows).toEqual([{issuer_id:A,reasons:[],priority:0,fetch_key:'0000320193'}]);
  expect(await db.scopeDue('US',`${TODAY}T23:59:59Z`,10)).toEqual([]);
 });
 it('ownership with a scheduled future end is still current; an end at or before today is not (the landed validity predicate, round-1 #22)',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  await tables.update('issuer_securities',{issuer_id:A,ticker:'AAPL'},{valid_to:'2030-12-31'});   // ends in the future: AAPL is still owned today
  expect(await reconcileScope({tables,db},'US',{today:TODAY})).toMatchObject({desired:1,retired:0});
  expect(calls[0].rows.map(x=>x.issuer_id)).toEqual([A]);
  expect((await db.scopeDue('US',`${TODAY}T23:59:59Z`,10)).map(s=>[s.issuer_id,s.next_due_at])).toEqual([[A,NOW_ISO]]);
  await tables.update('issuer_securities',{issuer_id:A,ticker:'AAPL'},{valid_to:TODAY});          // valid_to > today fails: no owner today
  expect((await reconcileScope({tables,db},'US',{today:TODAY})).skipped).toMatchObject({unknown_ticker:2});
  expect(await scopeRowFor(tables,'CN',K,{today:'2001-08-26'})).toBeNull();                      // 600519.OLD ends 2001-08-26, 600519.SH starts 2001-08-27
  expect(await scopeRowFor(tables,'CN',K,{today:'2001-08-27'})).toMatchObject({fetch_key:'600519.SH'});
 });
});

describe('scopeRowFor',()=>{
 it('derives one explicit scope row per market from the issuer tables; null when the issuer is unknown, merged or has no fetch key (round-1 #13)',async()=>{
  const tables=await seed();
  expect(await scopeRowFor(tables,'US',A,{today:TODAY})).toEqual({issuer_id:A,reasons:['explicit'],priority:10,fetch_key:'0000320193'});
  expect(await scopeRowFor(tables,'US',M,{today:TODAY})).toBeNull();                              // no CIK
  expect(await scopeRowFor(tables,'CN',K,{today:TODAY})).toEqual({issuer_id:K,reasons:['explicit'],priority:10,fetch_key:'600519.SH'});
  expect(await scopeRowFor(tables,'CN',A,{today:TODAY})).toBeNull();                              // no A-share listing
  expect(await scopeRowFor(tables,'US','44444444-4444-4444-8444-444444444444',{today:TODAY})).toBeNull();
  await tables.update('issuers',{issuer_id:A},{status:'merged'});
  expect(await scopeRowFor(tables,'US',A,{today:TODAY})).toBeNull();
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/facts/scope.test.ts`
Expected: FAIL，`Cannot find module './scope'`。

- [ ] **Step 3: 实现（先在 `src/lib/entities/resolve.ts` 导出谓词，再写 `scope.ts`）**

`src/lib/entities/resolve.ts` 的 `const isCurrent=(r:Row,today:string)=>{…};` 之后加一行（谓词本身不动）：

```ts
/** The one validity predicate (valid_from <= today && (valid_to is null || valid_to > today)); reused by the facts scope (plan 2 Task 14). */
export const isCurrentSecurity=isCurrent;
```

```ts
// src/lib/facts/scope.ts
// Sync scope (spec §6.4). reconcileScope is idempotent: it computes the desired set for one market
// from the sources, marks rows that vanished with priority 0, and hands everything to
// FactsDb.reconcileScope (SQL reconcile_fact_sync_scope), which only touches reasons/priority/
// fetch_key and never the scheduling or lease columns.
//  US: active tickers of universes sp500/nasdaq_top500/us_china → the issuer currently owning the
//      ticker (issuer_securities row current at `today` by the landed predicate of
//      entities/resolve.ts — a scheduled future end keeps the owner current, round-1 #22) that has
//      a CIK; fetch_key = 10-digit CIK; priority 10.
//  CN: research_entity_keys.in_scope and issuer_id is not null → the issuer's current primary
//      .SH/.SZ/.BJ ticker; reasons ['cohort']; priority 10 (owner decision A).
//  Watchlists are never a source (owner decision B).
// scopeRowFor derives ONE issuer's row the same way for explicit --issuer / replay runs (round-1
// #13; reasons ['explicit']). Reads go through TableClient (selectAll pages in a fixed order);
// the CN key read and the "ending" securities read are single pages (no unique column to page
// on / few rows) and fail loudly if they fill.
import {MAX_PAGE,selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import type {FactsDb,Market} from './types';

export const US_UNIVERSES=['sp500','nasdaq_top500','us_china'] as const;
export const SCOPE_PRIORITY=10;
const CN_TICKER=/\.(SH|SZ|BJ)$/;

export function fetchKey(market:Market,issuer:{cik?:string|null;ticker?:string|null}):string{
 if(market==='US'){
  const cik=issuer.cik?.trim();
  if(!cik||!/^\d{1,10}$/.test(cik))throw new Error('missing_cik');
  return cik.padStart(10,'0');
 }
 const t=issuer.ticker?.trim().toUpperCase();
 if(!t||!CN_TICKER.test(t))throw new Error('not_cn_ticker');
 return t;
}

export interface ScopeDeps{tables:TableClient;db:Pick<FactsDb,'reconcileScope'>}
export interface ScopeReconcileResult{desired:number;retired:number;changed:number;skipped:Record<string,number>}
/** One reconcile_fact_sync_scope input row. */
export type ScopeInputRow={issuer_id:string;reasons:string[];priority:number;fetch_key:string};
type DesiredRow=ScopeInputRow;

const str=(v:unknown)=>typeof v==='string'?v:null;
const normTicker=(t:string)=>t.trim().toUpperCase().replace(/\//g,'.');
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const isoToday=()=>new Date().toISOString().slice(0,10);

/**
 * Security rows current at `today` by the landed predicate (isCurrentSecurity). Open rows page by
 * ticker (unique among them: issuer_securities_open_owner_idx); rows with a scheduled end are few
 * and read in one page (gte valid_to today, then the predicate keeps valid_to > today only).
 */
export async function currentSecurities(tables:TableClient,today:string):Promise<Row[]>{
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 const ending=await tables.select('issuer_securities',{},{gte:{valid_to:today},orderBy:'ticker',limit:MAX_PAGE});
 if(ending.length>=MAX_PAGE)throw new Error('scope_securities_page_full');
 return [...open,...ending].filter(r=>isCurrentSecurity(r,today));
}

async function desiredUs(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DesiredRow[]>{
 const reasonsByTicker=new Map<string,Set<string>>();
 for(const u of US_UNIVERSES){
  for(const m of await selectAll(tables,'security_universe_memberships',{universe:u,is_active:true},'ticker')){
   const t=normTicker(String(m.ticker));
   (reasonsByTicker.get(t)??reasonsByTicker.set(t,new Set()).get(t)!).add(`universe:${u}`);
  }
 }
 const ownerByTicker=new Map<string,string>();
 for(const s of await currentSecurities(tables,today)){const id=str(s.issuer_id);if(id)ownerByTicker.set(normTicker(String(s.ticker)),id);}
 const issuers=new Map<string,Row>();
 for(const i of await selectAll(tables,'issuers',{status:'active'},'issuer_id'))issuers.set(String(i.issuer_id),i);
 const out=new Map<string,DesiredRow>();
 for(const [ticker,reasons] of reasonsByTicker){
  const id=ownerByTicker.get(ticker);
  if(!id){bump(skipped,'unknown_ticker');continue;}
  const issuer=issuers.get(id);
  if(!issuer){bump(skipped,'issuer_not_active');continue;}
  let key:string;
  try{key=fetchKey('US',{cik:str(issuer.cik)});}catch{bump(skipped,'no_cik');continue;}
  const row=out.get(id)??out.set(id,{issuer_id:id,reasons:[],priority:SCOPE_PRIORITY,fetch_key:key}).get(id)!;
  row.reasons=[...new Set([...row.reasons,...reasons])].sort();
 }
 return [...out.values()];
}

async function desiredCn(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DesiredRow[]>{
 const keys=await tables.select('research_entity_keys',{in_scope:true},{limit:MAX_PAGE});
 if(keys.length>=MAX_PAGE)throw new Error('scope_cn_page_full');
 const issuerIds=new Set<string>();
 for(const k of keys){const id=str(k.issuer_id);if(id)issuerIds.add(id);else bump(skipped,'no_issuer');}
 const primaryByIssuer=new Map<string,string[]>();
 for(const s of await currentSecurities(tables,today)){
  const id=str(s.issuer_id),t=normTicker(String(s.ticker));
  if(!id||s.is_primary!==true||!CN_TICKER.test(t))continue;
  (primaryByIssuer.get(id)??primaryByIssuer.set(id,[]).get(id)!).push(t);
 }
 const out:DesiredRow[]=[];
 for(const id of [...issuerIds].sort()){
  const tickers=(primaryByIssuer.get(id)??[]).sort();
  if(tickers.length===0){bump(skipped,'no_cn_ticker');continue;}
  if(tickers.length>1)bump(skipped,'multiple_primary');   // schema should prevent it; the smallest ticker wins deterministically
  out.push({issuer_id:id,reasons:['cohort'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:tickers[0]})});
 }
 return out;
}

/**
 * One issuer's scope input row for explicit runs (scripts --issuer, replay tests): US from
 * issuers.cik, CN from the current primary .SH/.SZ/.BJ listing. Null when the issuer is unknown,
 * merged, or has no fetch key — the sync core reports that issuer as scope_unresolved.
 */
export async function scopeRowFor(tables:TableClient,market:Market,issuerId:string,opts:{today?:string}={}):Promise<ScopeInputRow|null>{
 const today=opts.today??isoToday();
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 if(!issuer||issuer.status==='merged')return null;
 try{
  if(market==='US')return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('US',{cik:str(issuer.cik)})};
  const tickers=(await tables.select('issuer_securities',{issuer_id:issuerId,is_primary:true},{limit:MAX_PAGE})).filter(r=>isCurrentSecurity(r,today)).map(r=>normTicker(String(r.ticker))).filter(t=>CN_TICKER.test(t)).sort();
  if(tickers.length===0)return null;
  return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:tickers[0]})};
 }catch{return null;}
}

export async function reconcileScope(deps:ScopeDeps,market:Market,opts:{today?:string}={}):Promise<ScopeReconcileResult>{
 const today=opts.today??isoToday();
 const skipped:Record<string,number>={};
 const desired=market==='US'?await desiredUs(deps.tables,today,skipped):await desiredCn(deps.tables,today,skipped);
 const wanted=new Set(desired.map(d=>d.issuer_id));
 // Rows that left the sources keep their fetch_key and drop to priority 0 (never deleted: scheduling history stays).
 const retired:DesiredRow[]=(await selectAll(deps.tables,'fact_sync_scope',{market},'issuer_id'))
  .filter(r=>Number(r.priority)>0&&!wanted.has(String(r.issuer_id)))
  .map(r=>({issuer_id:String(r.issuer_id),reasons:[],priority:0,fetch_key:String(r.fetch_key)}));
 const rows=[...desired,...retired].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
 const changed=rows.length===0?0:await deps.db.reconcileScope(market,rows);
 return {desired:desired.length,retired:retired.length,changed,skipped};
}
```

`fact_sync_scope` 只对 service_role 可读，`reconcileScope` 的 `tables` 必须是 `supabaseTableClient(getAdminSupabase())`；读 `research_entity_keys` 同样需要 service_role（该表 RLS 按 user_id）。

- [ ] **Step 4: 运行通过 + 类型与 lint**

Run: `npm test -- src/lib/facts/scope.test.ts src/lib/entities/resolve.test.ts && npm run typecheck && npm run lint`
Expected: `scope.test.ts` 6 passed（`fetchKey` 1、`reconcileScope` 4、`scopeRowFor` 1）；`resolve.test.ts` 不变；typecheck、lint 无错误。若 `memoryFactsDb().scopeDue` 对 `priority=0` 的行仍返回，说明 Part A 的内存实现未按 §4.5 的部分索引语义过滤，改 Part A 的 `scopeDue`（`priority>0 and next_due_at<=now`），不要改本测试。测试对内存库调用 `setNow(NOW_ISO)`：不冻结时钟，`next_due_at` 会取真实墙钟，`TODAY` 之后的任何一天这些断言都会失效（round-1 #23）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/facts/scope.ts src/lib/facts/scope.test.ts src/lib/entities/resolve.ts
git commit -m "feat(facts): reconcile sync scope from public universes and in-scope entity keys; explicit issuer scope rows" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: 派生 `src/lib/facts/derive.ts` + `materialize`

**Files:**
- Create: `src/lib/facts/derive.ts`
- Test: `src/lib/facts/derive.test.ts`

本任务只含纯实现与单测，不碰任何集成测试文件：规格 §11.3 的"物化两次一致"用例在 Task 11 的 `sync-us.integration.test.ts` 里（Task 11 在本任务之后执行；round-1 #20）。

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/facts/derive.test.ts
import {describe,it,expect} from 'vitest';
import {FactsDbError} from './types';
import type {Duration,FactRow,FactsDb,Market,MetricRow,ReadFactsResult} from './types';
import {FORMULA_VERSION,deriveMetrics,materialize,metricNames} from './derive';

let n=0;
type P=Partial<FactRow>&{concept:string;period_end:string;value:string;duration:Duration};
const f=(p:P):FactRow=>({fact_id:`f${++n}`,issuer_id:'I',market:'US',filing_id:'F1',run_id:'R',source_concept:p.concept,statement:'IS',period_start:null,unit:'USD',consolidation:'consolidated',available_date:'2024-01-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-01-01T00:00:00Z',value_text:p.value,disclosure_seq:1,is_current:true,is_revision:false,...p});
const dur=(concept:string,start:string,end:string,value:string,extra:Partial<FactRow>={})=>f({concept,period_start:start,period_end:end,value,duration:({3:'3M',6:'6M',9:'9M',12:'12M'} as const)[monthsBetween(start,end)]!,...extra});
const inst=(concept:string,end:string,value:string,extra:Partial<FactRow>={})=>f({concept,statement:'BS',period_end:end,value,duration:'INSTANT',...extra});
function monthsBetween(s:string,e:string):3|6|9|12{const m=(Number(e.slice(0,4))-Number(s.slice(0,4)))*12+Number(e.slice(5,7))-Number(s.slice(5,7))+1;return m as 3|6|9|12;}
const pick=(rows:MetricRow[],metric:string)=>rows.filter(r=>r.metric===metric).map(r=>[r.period_start,r.period_end,r.value]);
const opts={market:'US' as Market,asOf:'2025-01-01'};

describe('deriveMetrics: ratios and sums',()=>{
 it('gross_margin prefers gross_profit, falls back to revenue - cost_of_revenue; net_margin; exact decimals; pure unit',()=>{
  const rows=[dur('revenue','2024-01-01','2024-03-31','1000'),dur('gross_profit','2024-01-01','2024-03-31','400'),dur('net_income_parent','2024-01-01','2024-03-31','123.456'),
   dur('revenue','2024-04-01','2024-06-30','300'),dur('cost_of_revenue','2024-04-01','2024-06-30','100')];
  const out=deriveMetrics(rows,opts);
  expect(pick(out,'gross_margin')).toEqual([['2024-01-01','2024-03-31','0.4'],['2024-04-01','2024-06-30','0.6666666667']]);
  expect(pick(out,'net_margin')).toEqual([['2024-01-01','2024-03-31','0.123456']]);
  const gm=out.find(r=>r.metric==='gross_margin')!;
  expect(gm).toMatchObject({unit:'pure',input_unit:'USD',basis:'us_standard',duration:'3M',formula_version:FORMULA_VERSION,as_of:'2025-01-01',based_on_rev:0});
  expect(gm.inputs.map(i=>i.concept)).toEqual(['gross_profit','revenue']);
 });
 it('missing stays missing: no denominator, zero denominator, unit mismatch, non-unique match → no row',()=>{
  const rows=[dur('gross_profit','2024-01-01','2024-03-31','400'),                                   // no revenue
   dur('revenue','2024-04-01','2024-06-30','0'),dur('gross_profit','2024-04-01','2024-06-30','1'),   // zero denominator
   dur('revenue','2024-07-01','2024-09-30','10'),dur('gross_profit','2024-07-01','2024-09-30','4',{unit:'EUR'}),   // unit mismatch
   dur('revenue','2024-10-01','2024-12-31','10'),dur('gross_profit','2024-10-01','2024-12-31','4',{unit:'USD'}),dur('gross_profit','2024-10-01','2024-12-31','5',{unit:'CAD'})];   // ambiguous without unit: same unit picks the USD one
  const out=deriveMetrics(rows,opts);
  expect(pick(out,'gross_margin')).toEqual([['2024-10-01','2024-12-31','0.4']]);
 });
 it('fcf and borrowings_total use the market basis; CN requires all three borrowing inputs',()=>{
  const us=deriveMetrics([dur('operating_cash_flow','2024-01-01','2024-12-31','500'),dur('capex','2024-01-01','2024-12-31','120.5'),
   inst('short_term_borrowings','2024-12-31','10'),inst('long_term_borrowings','2024-12-31','20')],opts);
  expect(us.find(r=>r.metric==='fcf')).toMatchObject({value:'379.5',unit:'USD',input_unit:'USD',basis:'us_standard',duration:'12M'});
  expect(us.find(r=>r.metric==='borrowings_total')).toMatchObject({period_start:'2024-12-31',period_end:'2024-12-31',duration:'INSTANT',value:'30',basis:'us_standard'});
  const cnRows=[dur('operating_cash_flow','2024-01-01','2024-12-31','500',{market:'CN',unit:'CNY'}),dur('capex_incl_intangibles','2024-01-01','2024-12-31','100',{market:'CN',unit:'CNY'}),
   inst('short_term_borrowings','2024-12-31','1',{market:'CN',unit:'CNY'}),inst('long_term_borrowings','2024-12-31','2',{market:'CN',unit:'CNY'})];
  const cn=deriveMetrics(cnRows,{market:'CN',asOf:'2025-01-01'});
  expect(cn.find(r=>r.metric==='fcf')).toMatchObject({value:'400',basis:'cn_incl_intangibles'});
  expect(cn.find(r=>r.metric==='borrowings_total')).toBeUndefined();
  const cn2=deriveMetrics([...cnRows,inst('bonds_payable','2024-12-31','4',{market:'CN',unit:'CNY'})],{market:'CN',asOf:'2025-01-01'});
  expect(cn2.find(r=>r.metric==='borrowings_total')).toMatchObject({value:'7',basis:'cn_incl_bonds',unit:'CNY'});
 });
 it('CN margins use revenue_operating with cn_standard basis',()=>{
  const out=deriveMetrics([dur('revenue_operating','2024-01-01','2024-12-31','200',{market:'CN',unit:'CNY'}),dur('cost_of_revenue','2024-01-01','2024-12-31','150',{market:'CN',unit:'CNY'}),dur('revenue','2024-01-01','2024-12-31','210',{market:'CN',unit:'CNY'})],{market:'CN',asOf:'2025-01-01'});
  expect(out.find(r=>r.metric==='gross_margin')).toMatchObject({value:'0.25',basis:'cn_standard',input_unit:'CNY'});
 });
});

describe('deriveMetrics: single quarters, TTM, YoY, ROE',()=>{
 const ytd=(c:string,y:number,q:[string,string,string,string],extra:Partial<FactRow>={})=>[
  dur(c,`${y}-01-01`,`${y}-03-31`,q[0],extra),dur(c,`${y}-01-01`,`${y}-06-30`,q[1],extra),dur(c,`${y}-01-01`,`${y}-09-30`,q[2],extra),dur(c,`${y}-01-01`,`${y}-12-31`,q[3],extra)];
 it('differences YTD facts with the same period_start into quarters, prefers a direct 3M fact, and sums four adjacent quarters',()=>{
  const rows=[...ytd('revenue',2024,['10','25','45','70']),dur('revenue','2024-04-01','2024-06-30','15.5')];   // direct Q2 differs from 25-10 and wins
  const out=deriveMetrics(rows,opts);
  expect(pick(out,'q_single_revenue')).toEqual([['2024-01-01','2024-03-31','10'],['2024-04-01','2024-06-30','15.5'],['2024-07-01','2024-09-30','20'],['2024-10-01','2024-12-31','25']]);
  expect(pick(out,'ttm_revenue')).toEqual([['2024-01-01','2024-12-31','70.5']]);
  const q4=out.find(r=>r.metric==='q_single_revenue'&&r.period_end==='2024-12-31')!;
  expect(q4.inputs.map(i=>i.concept)).toEqual(['revenue','revenue']);   // 12M and 9M facts, flattened
  const ttm=out.find(r=>r.metric==='ttm_revenue')!;
  expect(new Set(ttm.inputs.map(i=>i.fact_id)).size).toBe(ttm.inputs.length);   // deduplicated lineage
 });
 it('compatibility rule: revised 9M with an unrevised 6M from another filing → no Q3; same filing → Q3 (rule a)',()=>{
  const nine=[dur('revenue','2024-01-01','2024-09-30','40',{filing_id:'F9',available_date:'2024-10-30',disclosure_seq:1,is_current:false}),
   dur('revenue','2024-01-01','2024-09-30','45',{filing_id:'F10K',available_date:'2025-02-01',disclosure_seq:2,is_current:true,is_revision:true})];
  const six=dur('revenue','2024-01-01','2024-06-30','25',{filing_id:'F6'});
  expect(pick(deriveMetrics([...nine,six],opts),'q_single_revenue')).toEqual([]);
  const sixSameFiling=dur('revenue','2024-01-01','2024-06-30','26',{filing_id:'F10K',available_date:'2025-02-01'});
  expect(pick(deriveMetrics([...nine,sixSameFiling],opts),'q_single_revenue')).toEqual([['2024-07-01','2024-09-30','19']]);
 });
 it('rule b: both sequences unrevised across different filings → difference',()=>{
  const out=deriveMetrics([dur('revenue','2024-01-01','2024-06-30','25',{filing_id:'F6'}),dur('revenue','2024-01-01','2024-09-30','45',{filing_id:'F9'})],opts);
  expect(pick(out,'q_single_revenue')).toEqual([['2024-07-01','2024-09-30','20']]);
 });
 it('TTM needs exactly adjacent quarters; a gap breaks the window',()=>{
  const out=deriveMetrics([...ytd('revenue',2024,['10','25','45','70']).filter(r=>r.period_end!=='2024-06-30')],opts);
  expect(pick(out,'q_single_revenue')).toEqual([['2024-01-01','2024-03-31','10'],['2024-10-01','2024-12-31','25']]);   // Q2 and Q3 both need the 6M fact
  expect(pick(out,'ttm_revenue')).toEqual([]);
 });
 it('YoY: unique prior same-duration fact ending 350–380 days earlier; ambiguity or zero prior → omit',()=>{
  const out=deriveMetrics([dur('revenue','2023-01-01','2023-12-31','100'),dur('revenue','2024-01-01','2024-12-31','125'),
   dur('net_income_parent','2023-01-01','2023-12-31','0'),dur('net_income_parent','2024-01-01','2024-12-31','5')],opts);
  expect(pick(out,'revenue_yoy')).toEqual([['2024-01-01','2024-12-31','0.25']]);
  expect(pick(out,'net_income_yoy')).toEqual([]);
  const amb=deriveMetrics([dur('revenue','2023-01-01','2023-12-31','100'),dur('revenue','2023-01-01','2023-12-30','101'),dur('revenue','2024-01-01','2024-12-31','125')],opts);   // two 12M facts 366 and 367 days back
  expect(pick(amb,'revenue_yoy')).toEqual([]);
 });
 it('ROE = TTM net income / average of opening (window start − 1 day, exact) and closing equity',()=>{
  const rows=[...ytd('net_income_parent',2024,['10','20','30','40']),inst('equity_parent','2023-12-31','180'),inst('equity_parent','2024-12-31','220')];
  expect(pick(deriveMetrics(rows,opts),'roe')).toEqual([['2024-01-01','2024-12-31','0.2']]);
  const off=[...ytd('net_income_parent',2024,['10','20','30','40']),inst('equity_parent','2023-12-30','180'),inst('equity_parent','2024-12-31','220')];
  expect(pick(deriveMetrics(off,opts),'roe')).toEqual([]);
  const roe=deriveMetrics(rows,opts).find(r=>r.metric==='roe')!;
  expect(roe.inputs.map(i=>i.concept)).toEqual(['net_income_parent','net_income_parent','net_income_parent','net_income_parent','equity_parent','equity_parent']);   // 3M, 6M, 9M, 12M facts once each, then opening and closing equity
 });
 it('metricNames lists the market vocabulary and output is sorted deterministically',()=>{
  expect(metricNames('US')).toContain('q_single_capex');
  expect(metricNames('CN')).toContain('ttm_capex_incl_intangibles');
  const out=deriveMetrics([...ytd('revenue',2024,['10','25','45','70']),dur('gross_profit','2024-01-01','2024-03-31','4')],opts);
  expect(out.map(r=>r.metric)).toEqual([...out.map(r=>r.metric)].sort());
 });
});

describe('deriveMetrics: property (seeded LCG, 200 series)',()=>{
 function lcg(seed:number){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
 it('YTD facts differenced then summed reproduce the generated quarters and their TTM',()=>{
  for(let seed=1;seed<=200;seed++){
   const rnd=lcg(seed);
   const q=Array.from({length:4},()=>{const v=Math.floor(rnd()*20001)-10000;return rnd()<0.3?`${v}.${Math.floor(rnd()*100)}`:String(v);});
   const ytdVals=q.reduce<string[]>((acc,v,i)=>{const prev=i?Number(acc[i-1]):0;const s=(Math.round((prev+Number(v))*100)/100).toString();return [...acc,s];},[]);
   const rows=[dur('revenue','2024-01-01','2024-03-31',ytdVals[0]),dur('revenue','2024-01-01','2024-06-30',ytdVals[1]),dur('revenue','2024-01-01','2024-09-30',ytdVals[2]),dur('revenue','2024-01-01','2024-12-31',ytdVals[3])];
   if(rnd()<0.5)rows.push(dur('revenue','2024-04-01','2024-06-30',q[1]));   // 10-Q style direct quarter, same value
   const out=deriveMetrics(rows,opts);
   const got=pick(out,'q_single_revenue').map(r=>Number(r[2]));
   expect(got).toEqual(q.map(Number));
   expect(Number(pick(out,'ttm_revenue')[0][2])).toBeCloseTo(q.reduce((a,v)=>a+Number(v),0),6);
  }
 });
});

describe('materialize',()=>{
 const env=(stateRev:number,rows:FactRow[],truncated=false):ReadFactsResult=>({stateRev,rows,truncated});
 function fakeDb(envs:ReadFactsResult[],behaviour:{staleFirst?:boolean}={}){
  let reads=0,replaces=0;const calls:{basedOnRev:number;rows:MetricRow[]}[]=[];
  const db:Pick<FactsDb,'readFacts'|'replaceMetrics'>={
   async readFacts(){return envs[Math.min(reads++,envs.length-1)];},
   async replaceMetrics(_i,_m,basedOnRev,rows){replaces++;if(behaviour.staleFirst&&replaces===1)throw new FactsDbError('stale_computation');calls.push({basedOnRev,rows});return rows.length;},
  };
  return {db,calls,reads:()=>reads};
 }
 it('reads the envelope, derives, replaces under the envelope state_rev, and retries once on stale_computation',async()=>{
  const rows=[dur('revenue','2024-01-01','2024-03-31','10'),dur('gross_profit','2024-01-01','2024-03-31','4')];
  const {db,calls,reads}=fakeDb([env(7,rows),env(8,rows)],{staleFirst:true});
  const r=await materialize(db,'I','US',{today:'2025-01-01'});
  expect(r).toEqual({rows:2,stateRev:8,retried:true});   // gross_margin + q_single_revenue (the direct 3M revenue fact is itself a single quarter), round-1 #17c
  expect(reads()).toBe(2);
  expect(calls[0].basedOnRev).toBe(8);
  expect(calls[0].rows.map(x=>x.metric)).toEqual(['gross_margin','q_single_revenue']);
  expect(calls[0].rows[0]).toMatchObject({metric:'gross_margin',value:'0.4',based_on_rev:8,as_of:'2025-01-01'});
  expect(calls[0].rows[1]).toMatchObject({metric:'q_single_revenue',value:'10',period_start:'2024-01-01',period_end:'2024-03-31'});
 });
 it('gives up after the second stale_computation',async()=>{
  const {db}=fakeDb([env(1,[])]);
  const stale:Pick<FactsDb,'readFacts'|'replaceMetrics'>={...db,async replaceMetrics(){throw new FactsDbError('stale_computation');}};
  await expect(materialize(stale,'I','US')).rejects.toMatchObject({code:'stale_computation'});
 });
 it('refuses a truncated envelope with read_truncated and writes nothing',async()=>{
  const {db,calls}=fakeDb([env(3,[],true)]);
  await expect(materialize(db,'I','US')).rejects.toMatchObject({code:'read_truncated'});
  expect(calls).toEqual([]);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/facts/derive.test.ts`
Expected: FAIL，`Cannot find module './derive'`。

- [ ] **Step 3: 实现**

```ts
// src/lib/facts/derive.ts
// Derived metrics (spec §8). deriveMetrics is pure: it takes the readFacts history rows of one
// issuer/market (status ok, available_date <= asOf, with disclosure_seq/is_current/is_revision)
// and emits MetricRow[] for FORMULA_VERSION. Rules: exact period matching; missing input, unit
// mismatch, zero denominator or non-unique match → no row ("missing stays missing"); YTD
// differencing only across compatible disclosure versions — (a) both current disclosures from the
// same filing, or (b) both sequences never revised — the rule is recoverable from `inputs`
// (equal filing_id ⇒ a); TTM = four adjacent single quarters; YoY prior = the unique same-duration
// fact ending 350–380 days earlier; ROE opening equity = the instant fact dated exactly one day
// before the TTM window. Arithmetic is exact decimal on BigInt; ratios are rounded half away from
// zero to RATIO_SCALE places; INSTANT metrics carry period_start = period_end (column is not null).
// materialize() reads the envelope, refuses truncated reads (read_truncated), and replaces the
// issuer's metrics under the envelope's state_rev with one retry on stale_computation.
import type {Duration,FactRow,FactsDb,Market,MetricDuration,MetricRow} from './types';
import {FactsDbError} from './types';
import {canonicalDecimal} from './json-numbers';

export const FORMULA_VERSION='facts-derive/1.0';
export const RATIO_SCALE=10;
export const Q_SINGLE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','net_income_parent','operating_income','operating_cash_flow','capex'],
 CN:['revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles'],
};
/** Concepts to read per market: the readFacts `concepts` list for materialize and the live metrics route. */
export const DERIVE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','gross_profit','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex','short_term_borrowings','long_term_borrowings','equity_parent'],
 CN:['revenue','revenue_operating','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles','short_term_borrowings','long_term_borrowings','bonds_payable','equity_parent'],
};
const FIXED_METRICS=['gross_margin','net_margin','fcf','borrowings_total','revenue_yoy','net_income_yoy','roe'] as const;
export function metricNames(market:Market):string[]{
 return [...FIXED_METRICS,...Q_SINGLE_CONCEPTS[market].flatMap(c=>[`q_single_${c}`,`ttm_${c}`])];
}
export interface DeriveOptions{market:Market;asOf:string;basedOnRev?:number}

// ---- exact decimal arithmetic (value = n / 10^s) ----
interface Dec{n:bigint;s:number}
const DEC_RE=/^-?\d+(\.\d+)?$/;
const pow10=(k:number)=>10n**BigInt(k);
function parseDec(v:string):Dec|null{
 if(!DEC_RE.test(v))return null;
 const neg=v.startsWith('-'),body=neg?v.slice(1):v,[i,f='']=body.split('.');
 const n=BigInt(i+f);return {n:neg?-n:n,s:f.length};
}
function align(a:Dec,b:Dec):[bigint,bigint,number]{const s=Math.max(a.s,b.s);return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];}
const add=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x+y,s};};
const sub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x-y,s};};
const isZero=(d:Dec)=>d.n===0n;
const abs=(d:Dec):Dec=>({n:d.n<0n?-d.n:d.n,s:d.s});
const times=(d:Dec,k:bigint):Dec=>({n:d.n*k,s:d.s});
/** a / b rounded half away from zero to RATIO_SCALE places; null when b is zero. */
function div(a:Dec,b:Dec):Dec|null{
 if(isZero(b))return null;
 const [x,y]=align(a,b);
 const q=(x*pow10(RATIO_SCALE+1))/y;      // one guard digit; BigInt division truncates toward zero
 const r=q<0n?-((-q+5n)/10n):(q+5n)/10n;
 return {n:r,s:RATIO_SCALE};
}
function decToString(d:Dec):string{
 const neg=d.n<0n;let digits=(neg?-d.n:d.n).toString();
 if(d.s>0){digits=digits.padStart(d.s+1,'0');digits=`${digits.slice(0,-d.s)}.${digits.slice(-d.s)}`;}
 return canonicalDecimal((neg?'-':'')+digits);
}

// ---- calendar days (UTC) ----
const DAY_MS=86_400_000;
const dayMs=(d:string)=>Date.parse(`${d}T00:00:00Z`);
export const addDays=(d:string,n:number)=>new Date(dayMs(d)+n*DAY_MS).toISOString().slice(0,10);
const daysBetween=(from:string,to:string)=>Math.round((dayMs(to)-dayMs(from))/DAY_MS);

// ---- current disclosure per natural key ----
interface Cur{row:FactRow;dec:Dec;revised:boolean}
type Input=MetricRow['inputs'][number];
const inputOf=(c:Cur):Input=>({fact_id:c.row.fact_id,concept:c.row.concept,filing_id:c.row.filing_id,available_date:c.row.available_date});
const cmpStr=(a:string,b:string)=>a<b?-1:a>b?1:0;
function currentFacts(rows:FactRow[]):Map<string,Cur[]>{
 const groups=new Map<string,FactRow[]>();
 for(const r of rows){const k=`${r.concept}|${r.period_start??''}|${r.period_end}|${r.consolidation}|${r.unit}`;(groups.get(k)??groups.set(k,[]).get(k)!).push(r);}
 const out=new Map<string,Cur[]>();
 for(const g of groups.values()){
  g.sort((a,b)=>(a.disclosure_seq??0)-(b.disclosure_seq??0)||cmpStr(a.available_date,b.available_date)||cmpStr(a.created_at,b.created_at)||cmpStr(a.fact_id,b.fact_id));
  const row=g.find(r=>r.is_current===true)??g[g.length-1];
  const dec=parseDec(row.value);if(!dec)continue;
  const revised=g.some((r,i)=>r.is_revision===true||(r.is_revision===undefined&&i>0&&r.value!==g[i-1].value));
  (out.get(row.concept)??out.set(row.concept,[]).get(row.concept)!).push({row,dec,revised});
 }
 return out;
}

export function deriveMetrics(rows:FactRow[],opts:DeriveOptions):MetricRow[]{
 if(rows.length===0)return [];
 const {market,asOf}=opts;const issuerId=rows[0].issuer_id;const basedOnRev=opts.basedOnRev??0;
 const facts=currentFacts(rows);
 const of=(concept:string)=>facts.get(concept)??[];
 const unique=<T>(xs:T[])=>xs.length===1?xs[0]:null;
 const same=(concept:string,ref:Cur)=>unique(of(concept).filter(c=>c.row.period_start===ref.row.period_start&&c.row.period_end===ref.row.period_end&&c.row.unit===ref.row.unit));
 const instant=(concept:string,end:string,unit:string)=>unique(of(concept).filter(c=>c.row.duration==='INSTANT'&&c.row.period_end===end&&c.row.unit===unit));
 const isDuration=(c:Cur):c is Cur&{row:FactRow&{period_start:string}}=>c.row.period_start!==null&&c.row.duration!=='INSTANT';
 const std=market==='US'?'us_standard':'cn_standard';
 const basisQ=(c:string)=>market==='CN'&&c==='capex_incl_intangibles'?'cn_incl_intangibles':std;
 const out:MetricRow[]=[];
 const emit=(metric:string,start:string,end:string,duration:MetricDuration,value:Dec,unit:string,inputUnit:string,basis:string,inputs:Input[])=>{
  const seen=new Set<string>();
  out.push({issuer_id:issuerId,market,metric,period_start:start,period_end:end,duration,value:decToString(value),unit,input_unit:inputUnit,basis,formula_version:FORMULA_VERSION,
   inputs:inputs.filter(i=>!seen.has(i.fact_id)&&!!seen.add(i.fact_id)),based_on_rev:basedOnRev,as_of:asOf});
 };
 const ratio=(metric:string,ref:Cur&{row:{period_start:string}},num:Dec,den:Dec,basis:string,inputs:Cur[])=>{
  const v=div(num,den);if(v)emit(metric,ref.row.period_start,ref.row.period_end,ref.row.duration,v,'pure',ref.row.unit,basis,inputs.map(inputOf));
 };
 // margins
 const revC=market==='US'?'revenue':'revenue_operating';
 for(const rev of of(revC)){
  if(!isDuration(rev)||isZero(rev.dec))continue;
  const gp=market==='US'?same('gross_profit',rev):null;
  if(gp)ratio('gross_margin',rev,gp.dec,rev.dec,std,[gp,rev]);
  else{const cor=same('cost_of_revenue',rev);if(cor)ratio('gross_margin',rev,sub(rev.dec,cor.dec),rev.dec,std,[rev,cor]);}
  const ni=same('net_income_parent',rev);
  if(ni)ratio('net_margin',rev,ni.dec,rev.dec,std,[ni,rev]);
 }
 // free cash flow
 const capexC=market==='US'?'capex':'capex_incl_intangibles';
 for(const ocf of of('operating_cash_flow')){
  if(!isDuration(ocf))continue;
  const cx=same(capexC,ocf);if(!cx)continue;
  emit('fcf',ocf.row.period_start,ocf.row.period_end,ocf.row.duration,sub(ocf.dec,cx.dec),ocf.row.unit,ocf.row.unit,market==='US'?'us_standard':'cn_incl_intangibles',[inputOf(ocf),inputOf(cx)]);
 }
 // borrowings_total (INSTANT; period_start = period_end)
 for(const st of of('short_term_borrowings')){
  if(st.row.duration!=='INSTANT')continue;
  const lt=instant('long_term_borrowings',st.row.period_end,st.row.unit);if(!lt)continue;
  const bonds=market==='CN'?instant('bonds_payable',st.row.period_end,st.row.unit):null;
  if(market==='CN'&&!bonds)continue;
  const total=bonds?add(add(st.dec,lt.dec),bonds.dec):add(st.dec,lt.dec);
  emit('borrowings_total',st.row.period_end,st.row.period_end,'INSTANT',total,st.row.unit,st.row.unit,market==='US'?'us_standard':'cn_incl_bonds',[st,lt,...(bonds?[bonds]:[])].map(inputOf));
 }
 // year over year
 for(const [metric,concept] of [['revenue_yoy','revenue'],['net_income_yoy','net_income_parent']] as const){
  for(const cur of of(concept)){
   if(!isDuration(cur))continue;
   const prior=unique(of(concept).filter(p=>{if(p.row.duration!==cur.row.duration||p.row.unit!==cur.row.unit)return false;const d=daysBetween(p.row.period_end,cur.row.period_end);return d>=350&&d<=380;}));
   if(!prior||isZero(prior.dec))continue;
   ratio(metric,cur,sub(cur.dec,prior.dec),abs(prior.dec),std,[cur,prior]);
  }
 }
 // single quarters and TTM
 const STEP:Partial<Record<Duration,Duration>>={'6M':'3M','9M':'6M','12M':'9M'};
 const compatible=(a:Cur,b:Cur)=>a.row.filing_id===b.row.filing_id||(!a.revised&&!b.revised);
 interface Q{start:string;end:string;unit:string;dec:Dec;inputs:Input[]}
 const ttmNetIncome:Q[]=[];
 for(const c of Q_SINGLE_CONCEPTS[market]){
  const quarters=new Map<string,Q>();
  const put=(q:Q)=>{const k=`${q.start}|${q.end}|${q.unit}`;if(!quarters.has(k))quarters.set(k,q);};   // a direct 3M fact wins over a difference
  const all=of(c).filter(isDuration);
  for(const f of all)if(f.row.duration==='3M')put({start:f.row.period_start,end:f.row.period_end,unit:f.row.unit,dec:f.dec,inputs:[inputOf(f)]});
  for(const a of all){
   const bDur=STEP[a.row.duration];if(!bDur)continue;
   const b=unique(all.filter(x=>x.row.duration===bDur&&x.row.period_start===a.row.period_start&&x.row.unit===a.row.unit));
   if(!b||!compatible(a,b))continue;
   put({start:addDays(b.row.period_end,1),end:a.row.period_end,unit:a.row.unit,dec:sub(a.dec,b.dec),inputs:[inputOf(a),inputOf(b)]});
  }
  const qs=[...quarters.values()].sort((x,y)=>cmpStr(x.unit,y.unit)||cmpStr(x.end,y.end)||cmpStr(x.start,y.start));
  for(const q of qs)emit(`q_single_${c}`,q.start,q.end,'3M',q.dec,q.unit,q.unit,basisQ(c),q.inputs);
  for(let i=0;i+3<qs.length;i++){
   const w=qs.slice(i,i+4);
   if(w.some((q,j)=>j>0&&(q.unit!==w[0].unit||q.start!==addDays(w[j-1].end,1))))continue;
   const t:Q={start:w[0].start,end:w[3].end,unit:w[0].unit,dec:w.slice(1).reduce((acc,q)=>add(acc,q.dec),w[0].dec),inputs:w.flatMap(q=>q.inputs)};
   emit(`ttm_${c}`,t.start,t.end,'TTM',t.dec,t.unit,t.unit,basisQ(c),t.inputs);
   if(c==='net_income_parent')ttmNetIncome.push(t);
  }
 }
 // ROE = TTM net income / avg(opening equity, closing equity) = 2·TTM / (e0 + e1)
 for(const t of ttmNetIncome){
  const e0=instant('equity_parent',addDays(t.start,-1),t.unit),e1=instant('equity_parent',t.end,t.unit);
  if(!e0||!e1)continue;
  const v=div(times(t.dec,2n),add(e0.dec,e1.dec));if(!v)continue;
  emit('roe',t.start,t.end,'TTM',v,'pure',t.unit,std,[...t.inputs,inputOf(e0),inputOf(e1)]);
 }
 const key=(m:MetricRow)=>`${m.metric}|${m.period_end}|${m.period_start}|${m.input_unit}|${m.basis}`;
 return out.sort((a,b)=>cmpStr(key(a),key(b)));
}

export type MaterializeDb=Pick<FactsDb,'readFacts'|'replaceMetrics'>;
export interface MaterializeResult{rows:number;stateRev:number;retried:boolean}
/** as_of = today; the envelope's state_rev guards replace_financial_metrics; stale_computation → re-read and recompute once. */
export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
 const asOf=opts.today??new Date().toISOString().slice(0,10);
 for(let attempt=0;;attempt++){
  const env=await db.readFacts(issuer,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
  if(env.truncated)throw new FactsDbError('read_truncated',`read_facts truncated for ${issuer}/${market}`);
  const rows=deriveMetrics(env.rows,{market,asOf,basedOnRev:env.stateRev});
  try{const n=await db.replaceMetrics(issuer,market,env.stateRev,rows);return {rows:n,stateRev:env.stateRev,retried:attempt>0};}
  catch(e){if(attempt===0&&e instanceof FactsDbError&&e.code==='stale_computation')continue;throw e;}
 }
}
```

- [ ] **Step 4: 运行通过 + 类型与 lint**

Run: `npm test -- src/lib/facts/derive.test.ts && npm run typecheck && npm run lint`
Expected: 15 passed（含 200 次属性迭代的 1 个用例）；typecheck、lint 无错误。`canonicalDecimal`（Task 4）接受纯十进制文本并对无指数、无尾零的输入恒等，这里直接用它收尾，不需要 `__num` 包装。

- [ ] **Step 5: 提交**

```bash
git add src/lib/facts/derive.ts src/lib/facts/derive.test.ts
git commit -m "feat(facts): derive metrics (facts-derive/1.0) and materialize with stale-computation retry" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

（`metricsOfIssuer` 返回的 `MetricRow` 不含 `computed_at`——`metricFromTable` 不取该列——所以 Task 11 的"物化两次一致"用例里"除 `computed_at` 外全部列相等"就是 `toEqual`。）

---

### Task 16: 公共读接口三路由 + `/api/financials` 弃用头

**Files:**
- Create: `src/lib/facts/public-route.ts`
- Create: `src/app/api/facts/[ticker]/route.ts`
- Create: `src/app/api/facts/[ticker]/metrics/route.ts`
- Create: `src/app/api/filings/[ticker]/route.ts`
- Modify: `src/app/api/financials/[ticker]/route.ts`
- Test: `src/app/api/facts/[ticker]/route.test.ts`、`src/app/api/facts/[ticker]/metrics/route.test.ts`、`src/app/api/filings/[ticker]/route.test.ts`、`src/app/api/financials/[ticker]/route.test.ts`

- [ ] **Step 1: 写失败测试（facts 路由）**

```ts
// src/app/api/facts/[ticker]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FactRow,FilingRow} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFacts:vi.fn(),factsByIds:vi.fn(),filingsOfIssuer:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({readFacts:mocks.readFacts,factsByIds:mocks.factsByIds,filingsOfIssuer:mocks.filingsOfIssuer})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',FID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',F1='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER='99999999-9999-4999-8999-999999999999';   // a VALID uuid: the route validates factIds before filtering, so '9'.repeat(36) would be a 400 (round-1 #17d)
const fact=(p:Partial<FactRow>={}):FactRow=>({fact_id:F1,issuer_id:ISSUER,market:'US',filing_id:FID,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M',value:'383285000000',value_text:'383285000000',unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-01-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:FID,issuer_id:ISSUER,market:'US',source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-09-30',available_date:'2023-11-03',source_ref:'0000320193-23-000106',url:'https://www.sec.gov/x',document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2024-01-01T00:00:00Z',...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/facts/${ticker}?${qs}`),{params:Promise.resolve({ticker})});
const TODAY=new Date().toISOString().slice(0,10);

describe('GET /api/facts/[ticker]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({issuer_id:ISSUER,status:'active',names:{zh:null,en:'Apple'},identifiers:{cik:'320193',lei:null,usci:null},securities:[]});
  mocks.readFacts.mockResolvedValue({stateRev:5,rows:[fact()],truncated:false});
  mocks.filingsOfIssuer.mockResolvedValue([filing()]);
  mocks.factsByIds.mockResolvedValue([fact()]);
 });
 it('returns facts with value_text, filings with citation edgar, mappingGen, and a long shared cache for a past asOf',async()=>{
  const res=await get('AAPL','concepts=revenue&asOf=2024-06-30');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:'2024-06-30',mappingGen:1,truncated:false});
  expect(body.facts[0]).toMatchObject({factId:F1,concept:'revenue',sourceConcept:'Revenues',value:'383285000000',availableDate:'2023-11-03',disclosureSeq:1,isCurrent:true,isRevision:false,mappingGen:1,filingId:FID});
  expect(body.filings).toEqual([{filingId:FID,formType:'10-K',periodEnd:'2023-09-30',availableDate:'2023-11-03',sourceRef:'0000320193-23-000106',url:'https://www.sec.gov/x',documentRef:null,documentUrl:null,citation:'edgar'}]);
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  expect(mocks.readFacts).toHaveBeenCalledWith(ISSUER,'US',{concepts:['revenue'],asOf:'2024-06-30',from:undefined,to:undefined,history:false,limit:200});
  expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(),{ticker:'AAPL'},{today:TODAY});
 });
 it('CN tickers: market CN, citation linked/pending from document_ref',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[fact({market:'CN',unit:'CNY'}),fact({fact_id:'d'.repeat(36),filing_id:'e'.repeat(36),market:'CN',unit:'CNY'})],truncated:false});
  mocks.filingsOfIssuer.mockResolvedValue([filing({market:'CN',source:'tushare',origin:'sse',form_type:'annual',document_ref:'1217982000'}),filing({filing_id:'e'.repeat(36),market:'CN',source:'tushare',origin:'sse',form_type:'q1'}),filing({filing_id:'f'.repeat(36),market:'CN'})]);
  const body=await (await get('600519.SH','concepts=revenue')).json();
  expect(body.market).toBe('CN');
  expect(body.filings.map((f:{citation:string})=>f.citation)).toEqual(['linked','pending']);   // only filings referenced by returned facts
 });
 it('passes truncated through and does not cache it',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[],truncated:true});
  const res=await get('AAPL','concepts=revenue');
  expect(await res.json()).toMatchObject({truncated:true,facts:[]});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('factIds evidence mode: ≤100 uuids, no concepts, other issuers filtered out, no limit/durations',async()=>{
  mocks.factsByIds.mockResolvedValue([fact(),fact({fact_id:OTHER,issuer_id:'other'})]);
  const res=await get('AAPL',`factIds=${F1},${OTHER}`);
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.facts.map((f:{factId:string})=>f.factId)).toEqual([F1]);
  expect(mocks.factsByIds).toHaveBeenCalledWith([F1,OTHER]);
  expect(mocks.readFacts).not.toHaveBeenCalled();
  expect((await get('AAPL',`factIds=${F1}&concepts=revenue`)).status).toBe(400);
  expect((await get('AAPL',`factIds=${Array.from({length:101},()=>F1).join(',')}`)).status).toBe(400);
  expect((await get('AAPL','factIds=not-a-uuid')).status).toBe(400);
 });
 it('validates parameters: missing concepts, unknown concept, bad asOf, future asOf, duplicate, bad limit, bad durations, history',async()=>{
  const bad=async(qs:string,code:string)=>{const res=await get('AAPL',qs);expect(res.status).toBe(400);expect((await res.json()).error.code).toBe(code);expect(res.headers.get('cache-control')).toBe('no-store');};
  await bad('','invalid_parameter:concepts');
  await bad('concepts=foo','invalid_parameter:concepts');
  await bad('concepts=revenue&asOf=2024-13-01','invalid_parameter:asOf');
  await bad('concepts=revenue&asOf=2999-01-01','invalid_parameter:asOf');
  await bad('concepts=revenue&asOf=2024-01-01&asOf=2024-01-02','invalid_parameter:asOf');
  await bad('concepts=revenue&limit=0','invalid_parameter:limit');
  await bad('concepts=revenue&limit=1001','invalid_parameter:limit');
  await bad('concepts=revenue&durations=5M','invalid_parameter:durations');
  await bad('concepts=revenue&history=yes','invalid_parameter:history');
  await bad('concepts=revenue&from=2024-02-30','invalid_parameter:from');
  expect((await get('AA PL','concepts=revenue')).status).toBe(400);
 });
 it('history=1 and durations filter; limit caps at 1000; today asOf uses the midnight-bounded cache',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[fact(),fact({fact_id:'2'.repeat(36),duration:'3M'})],truncated:false});
  const res=await get('AAPL','concepts=revenue,net_income_parent&history=1&durations=3M&limit=1000');
  const body=await res.json();
  expect(body.facts.map((f:{duration:string})=>f.duration)).toEqual(['3M']);
  expect(mocks.readFacts.mock.calls[0][2]).toMatchObject({concepts:['revenue','net_income_parent'],history:true,limit:1000,asOf:TODAY});
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=600$/);
 });
 it('404 unknown_ticker, 500 internal on db failure, both no-store',async()=>{
  mocks.resolve.mockResolvedValue(null);
  const nf=await get('ZZZZ','concepts=revenue');
  expect(nf.status).toBe(404);expect((await nf.json()).error.code).toBe('unknown_ticker');
  mocks.resolve.mockResolvedValue({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[]});
  mocks.readFacts.mockRejectedValue(new Error('boom'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const err=await get('AAPL','concepts=revenue');
  expect(err.status).toBe(500);expect(err.headers.get('cache-control')).toBe('no-store');
  spy.mockRestore();
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- 'src/app/api/facts/[ticker]/route.test.ts'`
Expected: FAIL，`Cannot find module './route'`。

- [ ] **Step 3: 实现共用约定 `public-route.ts`**

```ts
// src/lib/facts/public-route.ts
// Conventions shared by the public read routes (spec §9): anon clients (read_facts is security
// invoker, RLS shows anon only status='ok'), the ticker syntax of /api/entities/resolve, issuer
// resolution by TODAY's ownership (asOf applies to facts only), market from the ticker suffix,
// strict parameter parsing (repeated parameter → 400 invalid_parameter:<name>), error bodies
// {error:{code,message}} with no-store, cache headers (past asOf → long shared cache; otherwise
// bounded by the next UTC midnight like the resolve route), and the public row shapes.
import {NextResponse} from 'next/server';
import {getAnonSupabase} from '../supabase/anon';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {resolveIssuer,successCacheControl} from '../entities/resolve';
import {supabaseFactsDb} from './db';
import type {FactRow,FactsDb,FilingRow,Market} from './types';

export const TICKER_RE=/^[A-Za-z0-9.\/\-]{1,24}$/;
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const utcDate=(d:Date)=>d.toISOString().slice(0,10);
const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(()=>{const ms=Date.parse(`${s}T00:00:00Z`);return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s;})();
export const marketOfTicker=(t:string):Market=>/\.(SH|SZ|BJ)$/i.test(t)?'CN':'US';

export class QueryError extends Error{constructor(public readonly param:string){super(`invalid_parameter:${param}`);this.name='QueryError';}}
/** Collects the allowed parameters; any of them given twice is an error. Unknown parameters are ignored. */
export function readParams(url:URL,allowed:readonly string[]):Map<string,string>{
 const out=new Map<string,string>();
 for(const k of allowed){const all=url.searchParams.getAll(k);if(all.length>1)throw new QueryError(k);if(all.length===1)out.set(k,all[0]);}
 return out;
}
export function dateParam(p:Map<string,string>,name:string):string|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 if(!isCalendarDate(v))throw new QueryError(name);return v;
}
export function intParam(p:Map<string,string>,name:string,def:number,max:number):number{
 const v=p.get(name);if(v===undefined)return def;
 if(!/^\d{1,5}$/.test(v)||Number(v)<1||Number(v)>max)throw new QueryError(name);return Number(v);
}
/** Comma list: trimmed, non-empty, unique, each in `allowed` (when given), at most `max` items. */
export function listParam(p:Map<string,string>,name:string,allowed:ReadonlySet<string>|null,max:number):string[]|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 const items=v.split(',').map(s=>s.trim());
 if(items.length===0||items.length>max||items.some(s=>s===''||(allowed&&!allowed.has(s)))||new Set(items).size!==items.length)throw new QueryError(name);
 return items;
}
/** asOf defaults to today and may not be in the future. */
export function asOfParam(p:Map<string,string>,today:string):string{
 const v=dateParam(p,'asOf');if(v===undefined)return today;
 if(v>today)throw new QueryError('asOf');return v;
}
export function flagParam(p:Map<string,string>,name:string):boolean{
 const v=p.get(name);if(v===undefined)return false;
 if(v!=='1')throw new QueryError(name);return true;
}

export const errorResponse=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
export const paramErrorResponse=(e:unknown)=>e instanceof QueryError?errorResponse(e.message,`invalid ${e.param}`,400):null;

export interface PublicIssuer{issuerId:string;ticker:string;market:Market}
/** Ticker → issuer by today's ownership (one merge hop is followed by resolveIssuer). */
export async function resolvePublicIssuer(tables:TableClient,rawTicker:string,today:string):Promise<PublicIssuer|null>{
 const ticker=rawTicker.trim().toUpperCase().replace(/\//g,'.');
 const r=await resolveIssuer(tables,{ticker},{today});
 return r?{issuerId:r.issuer_id,ticker,market:marketOfTicker(ticker)}:null;
}
export function publicClients():{tables:TableClient;db:FactsDb}{const sb=getAnonSupabase();return {tables:supabaseTableClient(sb),db:supabaseFactsDb(sb)};}

export function successHeaders(now:Date,asOf:string|undefined,empty:boolean):Record<string,string>{
 if(empty)return {'Cache-Control':'no-store'};
 if(asOf!==undefined&&asOf<utcDate(now))return {'Cache-Control':'public, max-age=600, s-maxage=3600'};
 return {'Cache-Control':successCacheControl(now)};
}

export type Citation='edgar'|'linked'|'pending';
export const citationOf=(f:FilingRow):Citation=>f.market==='US'?'edgar':f.document_ref?'linked':'pending';
export const publicFiling=(f:FilingRow)=>({filingId:f.filing_id,formType:f.form_type,periodEnd:f.period_end,availableDate:f.available_date,sourceRef:f.source_ref,url:f.url,documentRef:f.document_ref,documentUrl:f.document_url,citation:citationOf(f)});
export const publicFact=(r:FactRow)=>({factId:r.fact_id,concept:r.concept,sourceConcept:r.source_concept,statement:r.statement,periodStart:r.period_start,periodEnd:r.period_end,duration:r.duration,value:r.value_text,unit:r.unit,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq??null,isCurrent:r.is_current??true,isRevision:r.is_revision??false,mappingGen:r.mapping_gen,rawHash:r.raw_hash});
```

- [ ] **Step 4: 实现 `GET /api/facts/[ticker]`**

```ts
// src/app/api/facts/[ticker]/route.ts
// Public disclosure-log read (spec §9): concepts mode (read_facts envelope, asOf replay, history,
// durations, limit = natural keys) or factIds evidence mode (≤ 100 ids, any mapping generation,
// RLS limits to status ok). Filings returned are exactly those referenced by the returned facts.
import {NextResponse} from 'next/server';
import {FACT_CONCEPTS,MAPPING_GEN} from '@/lib/facts/concepts';
import {QueryError,TICKER_RE,UUID_RE,asOfParam,dateParam,errorResponse,flagParam,intParam,listParam,paramErrorResponse,publicClients,publicFact,publicFiling,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';
import type {Duration} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['concepts','factIds','from','to','asOf','durations','history','limit'] as const;
const CONCEPT_IDS=new Set(FACT_CONCEPTS.map(c=>c.id));
const DURATIONS=new Set<string>(['3M','6M','9M','12M','INSTANT']);
const MAX_FACT_IDS=100,DEFAULT_LIMIT=200,MAX_LIMIT=1000;

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeURIComponent(raw);
 if(!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let q:{concepts?:string[];factIds?:string[];from?:string;to?:string;asOf:string;durations?:Set<string>;history:boolean;limit:number};
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const concepts=listParam(p,'concepts',CONCEPT_IDS,FACT_CONCEPTS.length);
  const factIds=listParam(p,'factIds',null,MAX_FACT_IDS);
  if(factIds&&factIds.some(id=>!UUID_RE.test(id)))throw new QueryError('factIds');
  if((concepts===undefined)===(factIds===undefined))throw new QueryError(concepts?'factIds':'concepts');   // exactly one mode
  const durations=listParam(p,'durations',DURATIONS,DURATIONS.size);
  q={concepts,factIds,from:dateParam(p,'from'),to:dateParam(p,'to'),asOf:asOfParam(p,today),durations:durations?new Set(durations):undefined,history:flagParam(p,'history'),limit:intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT)};
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  let rows,truncated=false;
  if(q.factIds){
   rows=(await db.factsByIds(q.factIds)).filter(r=>r.issuer_id===issuer.issuerId&&r.market===issuer.market);
  }else{
   const env=await db.readFacts(issuer.issuerId,issuer.market,{concepts:q.concepts!,asOf:q.asOf,from:q.from,to:q.to,history:q.history,limit:q.limit});
   truncated=env.truncated;
   rows=q.durations?env.rows.filter(r=>q.durations!.has(r.duration as Duration)):env.rows;
  }
  const wanted=new Set(rows.map(r=>r.filing_id));
  const filings=wanted.size===0?[]:(await db.filingsOfIssuer(issuer.issuerId,issuer.market,{})).filter(f=>wanted.has(f.filing_id));
  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:q.asOf,mappingGen:MAPPING_GEN,truncated,facts:rows.map(publicFact),filings:filings.map(publicFiling)};
  return NextResponse.json(body,{headers:successHeaders(now,q.factIds?undefined:q.asOf,rows.length===0||truncated)});
 }catch(e){
  console.error('[facts]',e instanceof Error?e.message:e);
  return errorResponse('internal','facts read failed',500);
 }
}
```

`limit` 是自然键数（`read_facts p_limit`），`durations` 在信封返回后过滤，所以 `durations` 过滤不会把 `limit` 内的键挤掉。

- [ ] **Step 5: 运行 facts 路由测试通过**

Run: `npm test -- 'src/app/api/facts/[ticker]/route.test.ts'`
Expected: 7 passed。

- [ ] **Step 6: 写失败测试（metrics 与 filings 路由）**

```ts
// src/app/api/facts/[ticker]/metrics/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FactRow,MetricRow} from '@/lib/facts/types';
import {FORMULA_VERSION} from '@/lib/facts/derive';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFacts:vi.fn(),metricsOfIssuer:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({readFacts:mocks.readFacts,metricsOfIssuer:mocks.metricsOfIssuer})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const metric=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:ISSUER,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],based_on_rev:3,as_of:'2024-06-01',...p});
const fact=(p:Partial<FactRow>):FactRow=>({fact_id:'f',issuer_id:ISSUER,market:'US',filing_id:'g',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'10',value_text:'10',unit:'USD',consolidation:'consolidated',available_date:'2024-05-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-05-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/facts/${ticker}/metrics?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/facts/[ticker]/metrics',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[]});
  mocks.metricsOfIssuer.mockResolvedValue([metric(),metric({metric:'net_margin',value:'0.1',period_end:'2024-06-30',period_start:'2024-04-01'})]);
  mocks.readFacts.mockResolvedValue({stateRev:9,rows:[fact({fact_id:'f1'}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})],truncated:false});
 });
 it('without asOf reads the materialized table for the current formula version, filtered and shaped',async()=>{
  const res=await get('AAPL','metrics=gross_margin&from=2024-01-01&to=2024-03-31');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:null,mappingGen:1,formulaVersion:FORMULA_VERSION,truncated:false});
  expect(body.metrics).toEqual([{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',inputUnit:'USD',basis:'us_standard',inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],basedOnRev:3}]);
  expect(mocks.metricsOfIssuer).toHaveBeenCalledWith(ISSUER,'US',FORMULA_VERSION);
  expect(mocks.readFacts).not.toHaveBeenCalled();
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=/);
 });
 it('with asOf derives live from the read_facts envelope and stamps basedOnRev with its state_rev',async()=>{
  const res=await get('AAPL','asOf=2024-06-30&metrics=gross_margin');
  const body=await res.json();
  expect(body.asOf).toBe('2024-06-30');
  expect(body.metrics).toEqual([expect.objectContaining({metric:'gross_margin',value:'0.4',basedOnRev:9})]);
  expect(mocks.readFacts.mock.calls[0][2]).toMatchObject({asOf:'2024-06-30',history:true});
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
 });
 it('passes truncated through with no rows and no-store',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[],truncated:true});
  const res=await get('AAPL','asOf=2024-06-30');
  expect(await res.json()).toMatchObject({truncated:true,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('validates metrics against the market vocabulary, limit and dates; 404 unknown ticker',async()=>{
  expect((await get('AAPL','metrics=ttm_capex_incl_intangibles')).status).toBe(400);   // CN-only name on a US ticker
  expect((await get('600519.SH','metrics=ttm_capex_incl_intangibles')).status).toBe(200);
  expect((await get('AAPL','limit=1001')).status).toBe(400);
  expect((await get('AAPL','asOf=2024-02-30')).status).toBe(400);
  mocks.resolve.mockResolvedValue(null);
  expect((await get('AAPL','')).status).toBe(404);
 });
});
```

```ts
// src/app/api/filings/[ticker]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FilingRow} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),filingsOfIssuer:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({filingsOfIssuer:mocks.filingsOfIssuer})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:'g',issuer_id:ISSUER,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-04-01',source_ref:'600519.SH:20241231:1:20250401',url:null,document_ref:'1222',document_url:'https://static.cninfo.com.cn/x.pdf',link_attempts:1,mapping_gen:1,run_id:'r',created_at:'2025-04-01T00:00:00Z',...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/filings/${ticker}?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/filings/[ticker]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[]});
  mocks.filingsOfIssuer.mockResolvedValue([filing(),filing({filing_id:'h',form_type:'q1',document_ref:null,document_url:null,link_attempts:5,available_date:'2025-04-29'})]);
 });
 it('lists filings in the available_date window with citation and caches until midnight',async()=>{
  const res=await get('600519.SH','from=2025-01-01&to=2025-12-31&limit=50');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'600519.SH',market:'CN'});
  expect(body.filings.map((f:{filingId:string;citation:string})=>[f.filingId,f.citation])).toEqual([['g','linked'],['h','pending']]);
  expect(mocks.filingsOfIssuer).toHaveBeenCalledWith(ISSUER,'CN',{from:'2025-01-01',to:'2025-12-31',limit:50});
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=/);
 });
 it('empty result is no-store; bad limit and duplicate from are 400; unknown ticker 404',async()=>{
  mocks.filingsOfIssuer.mockResolvedValue([]);
  const res=await get('600519.SH','');
  expect((await res.json()).filings).toEqual([]);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect((await get('600519.SH','limit=0')).status).toBe(400);
  expect((await get('600519.SH','from=2025-01-01&from=2025-01-02')).status).toBe(400);
  mocks.resolve.mockResolvedValue(null);
  expect((await get('600519.SH','')).status).toBe(404);
 });
});
```

- [ ] **Step 7: 运行，确认失败**

Run: `npm test -- 'src/app/api/facts/[ticker]/metrics/route.test.ts' 'src/app/api/filings/[ticker]/route.test.ts'`
Expected: 两个文件 FAIL，`Cannot find module './route'`。

- [ ] **Step 8: 实现 metrics 与 filings 路由**

```ts
// src/app/api/facts/[ticker]/metrics/route.ts
// Public derived metrics (spec §9): without asOf the materialized financial_metrics rows of the
// current FORMULA_VERSION; with asOf a live deriveMetrics over the read_facts envelope (asOf
// replay), basedOnRev = the envelope's state_rev. Metric names are validated per market.
import {NextResponse} from 'next/server';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics,metricNames} from '@/lib/facts/derive';
import {QueryError,TICKER_RE,dateParam,errorResponse,intParam,listParam,paramErrorResponse,publicClients,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';
import type {MetricRow} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['metrics','from','to','asOf','limit'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev});

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeURIComponent(raw);
 if(!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let p:Map<string,string>,from:string|undefined,to:string|undefined,asOf:string|undefined,limit:number;
 try{
  p=readParams(new URL(req.url),PARAMS);
  from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);
  if(asOf!==undefined&&asOf>today)throw new QueryError('asOf');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  let metrics:string[]|undefined;
  try{metrics=listParam(p,'metrics',new Set(metricNames(issuer.market)),metricNames(issuer.market).length);}
  catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  let rows:MetricRow[],truncated=false;
  if(asOf===undefined){
   rows=await db.metricsOfIssuer(issuer.issuerId,issuer.market,FORMULA_VERSION);
  }else{
   const env=await db.readFacts(issuer.issuerId,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
   truncated=env.truncated;
   rows=truncated?[]:deriveMetrics(env.rows,{market:issuer.market,asOf,basedOnRev:env.stateRev});
  }
  const wanted=metrics?new Set(metrics):null;
  rows=rows.filter(m=>(!wanted||wanted.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to)).slice(0,limit);
  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,metrics:rows.map(publicMetric)};
  return NextResponse.json(body,{headers:successHeaders(now,asOf,rows.length===0||truncated)});
 }catch(e){
  console.error('[facts/metrics]',e instanceof Error?e.message:e);
  return errorResponse('internal','metrics read failed',500);
 }
}
```

```ts
// src/app/api/filings/[ticker]/route.ts
// Public filings list (spec §9): the issuer's filings by available_date window, with the
// citation state (edgar | linked | pending).
import {NextResponse} from 'next/server';
import {TICKER_RE,dateParam,errorResponse,intParam,paramErrorResponse,publicClients,publicFiling,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';
const PARAMS=['from','to','limit'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeURIComponent(raw);
 if(!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let from:string|undefined,to:string|undefined,limit:number;
 try{const p=readParams(new URL(req.url),PARAMS);from=dateParam(p,'from');to=dateParam(p,'to');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);}
 catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const filings=await db.filingsOfIssuer(issuer.issuerId,issuer.market,{from,to,limit});
  return NextResponse.json({issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,filings:filings.map(publicFiling)},{headers:successHeaders(now,undefined,filings.length===0)});
 }catch(e){
  console.error('[filings]',e instanceof Error?e.message:e);
  return errorResponse('internal','filings read failed',500);
 }
}
```

- [ ] **Step 9: 运行通过**

Run: `npm test -- 'src/app/api/facts/[ticker]/metrics/route.test.ts' 'src/app/api/filings/[ticker]/route.test.ts'`
Expected: 4 passed + 2 passed。

- [ ] **Step 10: `/api/financials/[ticker]` 弃用头——失败测试**

```ts
// src/app/api/financials/[ticker]/route.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/data/sources/tushare-cached',()=>({isTushareConfigured:()=>false,fetchTushareIncome:vi.fn(),fetchTushareBalance:vi.fn(),fetchTushareCashflow:vi.fn(),fetchTushareFinaIndicator:vi.fn()}));
import {GET} from './route';

describe('GET /api/financials/[ticker] deprecation',()=>{
 it.each(['AAPL','600519.SH'])('answers %s with Deprecation and a successor-version Link to /api/facts',async(ticker)=>{
  const res=await GET(new Request(`https://alpha.example/api/financials/${ticker}`),{params:Promise.resolve({ticker})});
  expect(res.status).toBe(200);
  expect(res.headers.get('deprecation')).toBe('true');
  expect(res.headers.get('link')).toBe(`</api/facts/${encodeURIComponent(ticker)}>; rel="successor-version"`);
 });
});
```

Run: `npm test -- 'src/app/api/financials/[ticker]/route.test.ts'`
Expected: FAIL，`expected null to be 'true'`。

- [ ] **Step 11: 加弃用头**

在 `src/app/api/financials/[ticker]/route.ts` 里把 `export async function GET(_req: Request, { params }: Ctx) {` 改名为 `async function handle(_req: Request, { params }: Ctx) {`（函数体不变），文件末尾追加：

```ts
// Spec (data foundation 2) §9: this Tushare summary is superseded by the disclosure log.
export async function GET(req: Request, ctx: Ctx) {
  const { ticker } = await ctx.params;
  const res = await handle(req, ctx);
  res.headers.set('Deprecation', 'true');
  res.headers.set('Link', `</api/facts/${encodeURIComponent(decodeURIComponent(ticker))}>; rel="successor-version"`);
  return res;
}
```

Run: `npm test -- 'src/app/api/financials/[ticker]/route.test.ts' && npm run typecheck && npm run lint`
Expected: 2 passed；typecheck、lint 无错误。

- [ ] **Step 12: 提交**

```bash
git add src/lib/facts/public-route.ts 'src/app/api/facts/[ticker]/route.ts' 'src/app/api/facts/[ticker]/route.test.ts' 'src/app/api/facts/[ticker]/metrics/route.ts' 'src/app/api/facts/[ticker]/metrics/route.test.ts' 'src/app/api/filings/[ticker]/route.ts' 'src/app/api/filings/[ticker]/route.test.ts' 'src/app/api/financials/[ticker]/route.ts' 'src/app/api/financials/[ticker]/route.test.ts'
git commit -m "feat(api): public facts, metrics and filings routes; deprecate /api/financials" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: cron 路由、生产依赖装配、脚本、`vercel.json`

**Files:**
- Create: `src/lib/facts/deps.ts`
- Create: `src/app/api/cron/facts-sync/route.ts`
- Create: `scripts/facts/sync.ts`
- Create: `scripts/facts/materialize.ts`
- Modify: `vercel.json`
- Test: `src/app/api/cron/facts-sync/route.test.ts`、`src/lib/facts/deps.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/app/api/cron/facts-sync/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/facts/sync',()=>({runFactsSync:mocks.run}));
vi.mock('@/lib/facts/deps',()=>({productionSyncDeps:mocks.deps,resolveCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/facts-sync?${qs}`,{headers});
const original=process.env.CRON_SECRET;

describe('facts sync cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CRON_SECRET='cron-secret';
  mocks.codeVersion.mockReturnValue('abc123');
  mocks.deps.mockReturnValue({tag:'deps'});
  mocks.run.mockResolvedValue({batchId:'b',status:'success',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0},errors:[],detail:{attempted:1,published:1,failed:0,skipped:0,idle:false},issuers:[]});
 });
 afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});
 it('fails closed without CRON_SECRET and rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('market=US',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('market=US',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('market=US'))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('validates market and limit',async()=>{
  for(const qs of ['','market=HK','market=us','market=US&limit=0','market=US&limit=201','market=US&limit=x','market=US&market=CN'])expect((await GET(req(qs,AUTH))).status,qs).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('refuses to apply without a code version',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req('market=US',AUTH));
  expect(res.status).toBe(503);
  expect((await res.json()).error.code).toBe('code_version_unavailable');
 });
 it('runs the market with default limit 25, a 240 s deadline, cron trigger, and returns the receipt',async()=>{
  const before=Date.now();
  const res=await GET(req('market=US',AUTH));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({ok:true,market:'US',limit:25,receipt:{batchId:'b',status:'success'}});
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{market:'US',limit:25,dryRun:false,triggeredBy:'cron'});
  const depsArg=mocks.deps.mock.calls[0][0];
  expect(depsArg.codeVersion).toBe('abc123');
  expect(depsArg.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);
  expect(depsArg.deadline.getTime()-before).toBeLessThan(241_000);
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('POST with limit and CN; ok=false when the batch is not success',async()=>{
  mocks.run.mockResolvedValue({batchId:'b',status:'partial',counts:{fetched:2,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:1},errors:[{code:'sec_unavailable'}],detail:{attempted:2,published:1,failed:1,skipped:0,idle:false},issuers:[]});
  const res=await POST(req('market=CN&limit=5',AUTH));
  expect(await res.json()).toMatchObject({ok:false,market:'CN',limit:5});
  expect(mocks.run.mock.calls[0][1]).toMatchObject({market:'CN',limit:5});
 });
});
```

```ts
// src/lib/facts/deps.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {cninfoLinker,productionSyncDeps,resolveCodeVersion} from './deps';
import {coverageSummary,parseTushareStatements} from './providers/tushare-statements';
import {loadTushareFixtures} from './providers/tushare-fixtures';
import type {Budget,FactsDb,FilingRow} from './types';

const SHA='c'.repeat(40);
const original=process.env.VERCEL_GIT_COMMIT_SHA;
afterEach(()=>{if(original===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=original;});

describe('resolveCodeVersion',()=>{
 it('prefers a 40-hex VERCEL_GIT_COMMIT_SHA',()=>{process.env.VERCEL_GIT_COMMIT_SHA=SHA;expect(resolveCodeVersion({allowGit:true})).toBe(SHA);expect(resolveCodeVersion({allowGit:false})).toBe(SHA);});
 it('returns null without a valid env value when git is not allowed',()=>{
  delete process.env.VERCEL_GIT_COMMIT_SHA;expect(resolveCodeVersion({allowGit:false})).toBeNull();
  process.env.VERCEL_GIT_COMMIT_SHA='deadbeef';expect(resolveCodeVersion({allowGit:false})).toBeNull();   // not a full sha → not trusted
 });
 it('falls back to git rev-parse HEAD (with -dirty when the tree is dirty) when allowed',()=>{
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  expect(resolveCodeVersion({allowGit:true})).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
 });
});

describe('cninfoLinker',()=>{
 const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
 const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:'g',issuer_id:'I',market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-04-03',source_ref:'600519.SH:20241231:1:20250403',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2025-04-03T00:00:00Z',...p});
 const fakeDb=(filings:FilingRow[])=>({filingsOfIssuer:async()=>filings}) as unknown as Pick<FactsDb,'filingsOfIssuer'>;
 async function tablesWithMoutai(){
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:null});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.OLD',is_primary:true,valid_from:'1990-01-01',valid_to:'2001-08-26'});
  return tables;
 }
 it('resolves ts_code and org id once per issuer, queries cninfo with the collector body, and flags a type-1 filing with a type-5 sibling as corrected',async()=>{
  const bodies:string[]=[];
  const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[{announcementId:'2',announcementTitle:'贵州茅台：关于2024年年度报告的更正公告',adjunctUrl:'finalpage/2025-04-03/2.PDF'}],hasMore:false}),{status:200});});
  const db=fakeDb([filing(),filing({filing_id:'h',source_ref:'600519.SH:20241231:5:20250301',available_date:'2025-03-01'})]);
  const link=cninfoLinker(await tablesWithMoutai(),db,{fetch,minIntervalMs:0});
  expect(await link(filing(),budget())).toEqual({document_ref:'2',document_url:'http://static.cninfo.com.cn/finalpage/2025-04-03/2.PDF'});   // corrected → a 更正 title is the match
  expect(bodies[0]).toContain('stock=600519%2C9900000227');expect(bodies[0]).toContain('column=sse');expect(bodies[0]).toContain('seDate=2025-03-31%7E2025-04-06');
  expect(await link(filing({filing_id:'q',form_type:'q1',period_end:'2024-03-31',source_ref:'600519.SH:20240331:1:20240426',available_date:'2024-04-26'}),budget())).toBe('none');   // not corrected → 更正 title excluded
  expect(fetch).toHaveBeenCalledTimes(2);   // issuer context is cached: only the two hisAnnouncement queries
 });
 it("answers 'none' without touching the network when the issuer has no current A-share listing",async()=>{
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'U',cninfo_org_id:null,status:'active'});
  const fetch=vi.fn();
  const link=cninfoLinker(tables,fakeDb([]),{fetch});
  expect(await link(filing({issuer_id:'U'}),budget())).toBe('none');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('reads the current A-share listing by the landed validity predicate: a scheduled future end still counts, a past end does not',async()=>{
  const tables=memoryTableClient({issuers:['issuer_id']});
  await tables.insert('issuers',{issuer_id:'I',cninfo_org_id:'9900000227',status:'active'});
  await tables.insert('issuer_securities',{issuer_id:'I',ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:'2030-12-31'});
  const bodies:string[]=[];
  const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(String(init?.body));return new Response(JSON.stringify({announcements:[],hasMore:false}),{status:200});});
  expect(await cninfoLinker(tables,fakeDb([]),{fetch,minIntervalMs:0,today:'2026-11-04'})(filing(),budget())).toBe('none');
  expect(bodies[0]).toContain('stock=600519%2C9900000227');                                            // the listing was resolved → a query went out
  const noCall=vi.fn();
  expect(await cninfoLinker(tables,fakeDb([]),{fetch:noCall,today:'2031-01-01'})(filing(),budget())).toBe('none');   // listing ended → no ts_code → no request
  expect(noCall).not.toHaveBeenCalled();
 });
});

describe('productionSyncDeps',()=>{
 it('assembles both adapters, the cninfo linker and the CN coverage summary over the admin client (round-1 #12)',()=>{
  const saved={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-role-test-key';   // createClient never connects at construction
  try{
   const deps=productionSyncDeps({deadline:null,codeVersion:'c'.repeat(40)});
   for(const k of ['fetchUs','fetchCn','parseUs','parseCn','linkCn','coverageCn','now'] as const)expect(typeof deps[k],k).toBe('function');
   expect(deps.coverageCn).toBe(coverageSummary);
   const parsed=parseTushareStatements(loadTushareFixtures('600519.SH'),{sinceYear:2014});
   expect(deps.coverageCn!(parsed)).toEqual(coverageSummary(parsed));
   expect(deps.coverageCn!(parsed).find(x=>x.api==='income'&&x.report_type===1)).toBeDefined();
   expect(deps).toMatchObject({deadline:null,codeVersion:'c'.repeat(40)});
  }finally{
   if(saved.url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=saved.url;
   if(saved.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=saved.key;
  }
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/app/api/cron/facts-sync/route.test.ts src/lib/facts/deps.test.ts`
Expected: 两个文件 FAIL，模块不存在。

- [ ] **Step 3: 实现 `deps.ts`**

```ts
// src/lib/facts/deps.ts
// Production wiring of SyncDeps (spec §6.1) shared by /api/cron/facts-sync and scripts/facts/*:
// Supabase FactsDb / TableClient / snapshot store, the two adapters (fetch + parse), and the cninfo
// linker, which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass
// (it hands over the FilingRow only). code_version = VERCEL_GIT_COMMIT_SHA (40 hex), else — scripts
// only — `git rev-parse HEAD` with "-dirty" when the tree has changes (sync.ts::resolveCodeVersion);
// null means "refuse to apply".
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {supabaseFactsDb} from './db';
import {supabaseSnapshotStore} from './snapshot-store';
import {fetchCompanyFacts,parseCompanyFacts} from './providers/edgar-companyfacts';
import {coverageSummary,fetchTushareStatements,parseTushareStatements} from './providers/tushare-statements';
import {linkCninfoFiling} from './providers/cninfo-link';
import type {LinkIssuer} from './providers/cninfo-link';
import {resolveCodeVersion as resolveFromEnvOrGit} from './sync';
import type {SyncDeps} from './sync';
import type {Budget,FactsDb,FilingRow} from './types';

/** allowGit=false (Vercel): only a full VERCEL_GIT_COMMIT_SHA counts; allowGit=true (scripts): env, then git HEAD (+ -dirty). */
export function resolveCodeVersion(opts:{allowGit:boolean}):string|null{
 return opts.allowGit?resolveFromEnvOrGit(process.env):resolveFromEnvOrGit(process.env,()=>{throw new Error('git_not_allowed');});
}

const CN_TICKER=/\.(SH|SZ|BJ)$/;
/** ts_code (primary A-share listing current at `today` by the landed validity predicate, round-1 #22) and cninfo_org_id of an issuer; '' ts_code → the linker answers 'none'. */
async function cnIssuer(tables:TableClient,issuerId:string,today:string):Promise<LinkIssuer>{
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 const securities=(await tables.select('issuer_securities',{issuer_id:issuerId,is_primary:true},{limit:50})).filter(r=>isCurrentSecurity(r,today));
 const ts=securities.map(s=>String(s.ticker).toUpperCase()).filter(t=>CN_TICKER.test(t)).sort()[0]??'';
 return {ts_code:ts,cninfo_org_id:typeof issuer?.cninfo_org_id==='string'?issuer.cninfo_org_id:null};
}
/** A type-1 filing is "corrected" when a type-5 filing exists for the same ts_code:end_date (spec §6.3: match 更正 titles). */
const correctedKeys=(filings:FilingRow[])=>new Set(filings.filter(f=>f.source_ref.split(':')[2]==='5').map(f=>f.source_ref.split(':').slice(0,2).join(':')));

export interface LinkerOptions{fetch?:typeof fetch;userAgent?:string;minIntervalMs?:number;today?:string}
export function cninfoLinker(tables:TableClient,db:Pick<FactsDb,'filingsOfIssuer'>,opts:LinkerOptions={}):NonNullable<SyncDeps['linkCn']>{
 const cache=new Map<string,Promise<{issuer:LinkIssuer;corrected:Set<string>}>>();
 const context=(issuerId:string)=>{
  let p=cache.get(issuerId);
  if(!p){p=Promise.all([cnIssuer(tables,issuerId,opts.today??new Date().toISOString().slice(0,10)),db.filingsOfIssuer(issuerId,'CN',{})]).then(([issuer,filings])=>({issuer,corrected:correctedKeys(filings)}));cache.set(issuerId,p);}
  return p;
 };
 return async(filing:FilingRow,b:Budget)=>{
  const {issuer,corrected}=await context(filing.issuer_id);
  const key=filing.source_ref.split(':').slice(0,2).join(':');
  return linkCninfoFiling({form_type:filing.form_type,fiscal_year:filing.fiscal_year,period_end:filing.period_end,available_date:filing.available_date,corrected:filing.source_ref.split(':')[2]==='1'&&corrected.has(key)},issuer,{budget:b,fetch:opts.fetch,userAgent:opts.userAgent,minIntervalMs:opts.minIntervalMs});
 };
}

export interface ProductionDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date}
export function productionSyncDeps(opts:ProductionDepsOptions):SyncDeps{
 const sb=getAdminSupabase();
 const db=supabaseFactsDb(sb);const tables=supabaseTableClient(sb);
 return {
  db,tables,storage:supabaseSnapshotStore(sb),
  fetchUs:(cik10,b)=>fetchCompanyFacts(cik10,b),
  fetchCn:(tsCode,sinceYear,b)=>fetchTushareStatements(tsCode,sinceYear,b),
  parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
  parseCn:(snapshots,o)=>parseTushareStatements(snapshots,{sinceYear:o.sinceYear}),
  coverageCn:coverageSummary,   // → coverage_summary in the batch receipt (round-1 #12)
  linkCn:cninfoLinker(tables,db),
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion,
 };
}
```

`cninfoLinker` 对每个发行人只查一次 `issuers`/`issuer_securities`/`filingsOfIssuer`（按进程缓存）；`sync.ts::linkFilings` 已经只对 `document_ref is null and link_attempts < 5`、非 BJ、`form_type ∈ LINKABLE_FORMS` 的 filing 调用它。`corrected` 的判定（同 `ts_code:end_date` 存在 type-5 filing）是 §6.3"被更正的 filing（同 K 存在 type 5 行者）"在 filing 粒度上的实现。

- [ ] **Step 4: 实现 cron 路由**

```ts
// src/app/api/cron/facts-sync/route.ts
// Facts sync trigger (spec §6.5): CRON_SECRET bearer (same check as securities-sync), market US|CN,
// limit 1..200 (default 25), maxDuration 300 with a 240 s deadline handed to the sync core, which
// stops starting issuers when the remaining budget is under 90 s (deadline_hit). A missing
// code_version refuses the run (spec §6.1). Returns the batch receipt.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {runFactsSync} from '@/lib/facts/sync';
import {productionSyncDeps,resolveCodeVersion} from '@/lib/facts/deps';
import type {Market} from '@/lib/facts/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,DEFAULT_LIMIT=25,MAX_LIMIT=200;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const url=new URL(request.url);
 if(url.searchParams.getAll('market').length!==1||url.searchParams.getAll('limit').length>1)return err('invalid_parameter:market','market required once',400);
 const market=url.searchParams.get('market');
 if(market!=='US'&&market!=='CN')return err('invalid_parameter:market','market must be US or CN',400);
 const limitRaw=url.searchParams.get('limit');
 let limit=DEFAULT_LIMIT;
 if(limitRaw!==null){if(!/^\d{1,3}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limitRaw);}
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 const deps=productionSyncDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion});
 const receipt=await runFactsSync(deps,{market:market as Market,limit,dryRun:false,triggeredBy:'cron'});
 return NextResponse.json({ok:receipt.status==='success',market,limit,started_at:started.toISOString(),receipt},{status:200,headers:{'Cache-Control':'no-store'}});
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
```

- [ ] **Step 5: 运行通过**

Run: `npm test -- src/app/api/cron/facts-sync/route.test.ts src/lib/facts/deps.test.ts`
Expected: 5 passed + 7 passed（`deps.test.ts`：`resolveCodeVersion` 3 个、`cninfoLinker` 3 个、`productionSyncDeps` 1 个）。

- [ ] **Step 6: 脚本 `scripts/facts/sync.ts`**

```ts
/**
 * Facts sync from the command line (spec §6.5). No deadline; dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/facts/sync.ts --market US|CN
 *        [--issuer <ticker>]... [--limit n] [--since-year y] [--apply]
 *   node --import tsx scripts/facts/sync.ts --market US --no-db --cik 320193 [--cik ...]
 *
 * Dry run: fetches, parses and plans against the database (read-only; no batch, no lease, no
 * writes). --apply records an ingest_batches receipt (dataset facts.us|facts.cn, triggered_by
 * script) and needs a code version (VERCEL_GIT_COMMIT_SHA or a git checkout). --issuer tickers
 * are resolved by today's ownership; unknown → exit 2. An issuer without a fact_sync_scope row is
 * handled by the core (round-1 #13): --apply seeds the row (reasons ['explicit']; the next cron
 * reconcile retires it unless a source lists the issuer), a dry run plans on a constructed row,
 * and an issuer without a derivable fetch key is reported as scope_unresolved (exit 1).
 * --no-db (US only, with --cik) runs the dry run against empty in-memory stores: a network-only
 * smoke that needs no environment at all.
 * Exit 0 on success, 1 when the batch (or any issuer in a dry run) failed, 2 on bad arguments.
 * tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {memoryTableClient} from '../../src/lib/db/memory-table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {productionSyncDeps,resolveCodeVersion} from '../../src/lib/facts/deps';
import {memoryFactsDb} from '../../src/lib/facts/memory-facts-db';
import {memorySnapshotStore} from '../../src/lib/facts/snapshot-store';
import {fetchCompanyFacts,parseCompanyFacts} from '../../src/lib/facts/providers/edgar-companyfacts';
import {fetchKey} from '../../src/lib/facts/scope';
import {runFactsSync} from '../../src/lib/facts/sync';
import type {SyncDeps} from '../../src/lib/facts/sync';
import type {Market} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: sync.ts --market US|CN [--issuer <ticker>]... [--cik <cik>]... [--limit n] [--since-year y] [--apply] [--no-db]';
interface Args{market:Market;issuers:string[];ciks:string[];limit:number;sinceYear?:number;apply:boolean;noDb:boolean}

function parseArgs(argv:string[]):Args{
 const a:Args={market:'US',issuers:[],ciks:[],limit:25,apply:false,noDb:false};let market:string|undefined;
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--market')market=next(i++);
  else if(x==='--issuer')a.issuers.push(next(i++));
  else if(x==='--cik')a.ciks.push(next(i++));
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--since-year')a.sinceYear=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else if(x==='--no-db')a.noDb=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(market!=='US'&&market!=='CN'){console.error(USAGE);process.exit(2);}
 a.market=market;
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000){console.error('--limit must be 1..1000');process.exit(2);}
 if(a.sinceYear!==undefined&&(!Number.isInteger(a.sinceYear)||a.sinceYear<1990||a.sinceYear>new Date().getUTCFullYear())){console.error('--since-year out of range');process.exit(2);}
 if(a.noDb&&(a.apply||a.market!=='US'||a.ciks.length===0||a.issuers.length>0)){console.error('--no-db needs --market US and --cik, and excludes --apply/--issuer');process.exit(2);}
 if(!a.noDb&&a.ciks.length>0){console.error('--cik is only for --no-db');process.exit(2);}
 return a;
}

/** Empty in-memory stores: every candidate plans as inserted; nothing persists. */
function memoryDeps(codeVersion:string):SyncDeps{
 return {db:memoryFactsDb(),tables:memoryTableClient(),storage:memorySnapshotStore(),
  fetchUs:(cik10,b)=>fetchCompanyFacts(cik10,b),
  fetchCn:async()=>{throw new Error('CN not supported with --no-db');},
  parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
  parseCn:()=>{throw new Error('CN not supported with --no-db');},
  now:()=>new Date(),deadline:null,codeVersion};
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
 if(!codeVersion){console.error('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');process.exit(2);}
 let deps:SyncDeps,issuerIds:string[]|undefined;
 if(args.noDb){
  deps=memoryDeps(codeVersion);
  // Seed the memory scope so the core finds the issuers: issuer ids are synthetic for the smoke.
  const rows=args.ciks.map((cik,i)=>({issuer_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,reasons:['cli'],priority:10,fetch_key:fetchKey('US',{cik})}));
  await deps.db.reconcileScope('US',rows);
  issuerIds=rows.map(r=>r.issuer_id);
 }else{
  deps=productionSyncDeps({deadline:null,codeVersion});
  if(args.issuers.length>0){
   const today=new Date().toISOString().slice(0,10);
   issuerIds=[];
   for(const t of args.issuers){
    const r=await resolveIssuer(supabaseTableClient(getAdminSupabase()),{ticker:t},{today});
    if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}
    issuerIds.push(r.issuer_id);
   }
  }
 }
 const receipt=await runFactsSync(deps,{market:args.market,limit:args.limit,issuerIds,dryRun:!args.apply,triggeredBy:'script',sinceYear:args.sinceYear});
 console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (no batch written; pass --apply to write)',market:args.market,codeVersion,...receipt},null,1));
 const failed=args.apply?receipt.status!=='success':receipt.issuers.some(i=>i.outcome==='failed');
 process.exit(failed?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
```

`--no-db` 与 `--issuer` 都依赖 `runFactsSync` 在 `issuerIds` 给定时**不**先调 `reconcileScope`（否则内存 `security_universe_memberships` 为空会把范围清零）——Part B 的 `sync.ts` 正是这样实现的（`if(opts.issuerIds===undefined)await reconcileScope(…)`），`sync.test.ts` 的 dry-run 用例也按此写。

- [ ] **Step 7: 脚本 `scripts/facts/materialize.ts`**

```ts
/**
 * Rebuild financial_metrics per issuer (spec §8 materialize).
 *
 *   node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US|CN (--issuer <ticker>... | --all)
 *
 * --all = every fact_sync_scope row of the market with priority > 0. Each issuer: read_facts
 * envelope → deriveMetrics → replace_financial_metrics under the envelope's state_rev (one retry on
 * stale_computation; truncated reads are refused). Prints one JSON line per issuer. Exit 1 if any
 * issuer failed, 2 on bad arguments.
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {materialize} from '../../src/lib/facts/derive';
import type {Market} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: materialize.ts --market US|CN (--issuer <ticker>... | --all)';

async function main(){
 const argv=process.argv.slice(2);let market:string|undefined,all=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--market'&&v){market=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--all')all=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if((market!=='US'&&market!=='CN')||(all===(tickers.length>0))){console.error(USAGE);process.exit(2);}
 const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const db=supabaseFactsDb(sb);
 const today=new Date().toISOString().slice(0,10);
 let issuers:{issuerId:string;label:string}[];
 if(all){
  issuers=(await selectAll(tables,'fact_sync_scope',{market},'issuer_id')).filter(r=>Number(r.priority)>0).map(r=>({issuerId:String(r.issuer_id),label:String(r.fetch_key)}));
 }else{
  issuers=[];
  for(const t of tickers){
   const r=await resolveIssuer(tables,{ticker:t},{today});
   if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}
   issuers.push({issuerId:r.issuer_id,label:t});
  }
 }
 let failed=0;
 for(const {issuerId,label} of issuers){
  try{
   const r=await materialize(db,issuerId,market as Market,{today});
   console.log(JSON.stringify({issuer:issuerId,label,market,...r}));
  }catch(e){
   failed++;
   console.log(JSON.stringify({issuer:issuerId,label,market,error:e instanceof Error?e.message:String(e)}));
  }
 }
 console.log(JSON.stringify({issuers:issuers.length,failed}));
 process.exit(failed>0?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
```

- [ ] **Step 8: `vercel.json` 加美股 cron（CN 不加，见仓库约定）**

在 `crons` 数组末尾（`securities-sync?region=us` 之后）追加：

```json
    {
      "path": "/api/cron/facts-sync?market=US",
      "schedule": "5 */4 * * *"
    }
```

- [ ] **Step 9: 类型、lint、脚本可启动**

Run: `npm run typecheck && npm run lint && node --import tsx scripts/facts/sync.ts --market XX; echo "exit=$?"`
Expected: typecheck、lint 无错误；脚本打印 usage 并 `exit=2`。
Run: `node --import tsx scripts/facts/materialize.ts; echo "exit=$?"`
Expected: usage，`exit=2`。

- [ ] **Step 10: 提交**

```bash
git add src/lib/facts/deps.ts src/lib/facts/deps.test.ts src/app/api/cron/facts-sync/route.ts src/app/api/cron/facts-sync/route.test.ts scripts/facts/sync.ts scripts/facts/materialize.ts vercel.json
git commit -m "feat(facts): facts-sync cron (US every 4h), production deps, sync and materialize scripts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: 运行手册章节、规格 §16 存根、全量门禁、真实 SEC dry-run

**Files:**
- Modify: `docs/runbooks/data-foundation.md`（追加第 8 章，整份计划里 runbook 只在这里追加一次；8.7 表从实施记录抄）
- Modify: `docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（§16）
- Modify: `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`（Task 12 创建；追加 SEC dry-run 记录）
- Verify only: `docs/superpowers/specs/2026-11-04-data-foundation-design.md` §4 指向

- [ ] **Step 1: 核对规格一的指向已存在（不要重复添加）**

Run: `grep -c 'docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md' docs/superpowers/specs/2026-11-04-data-foundation-design.md`
Expected: `1`（第 114 行的"已被取代"说明）。若为 0，在规格一 §4 标题下加一行 `> **已被取代（2026-11-04）**：本节由 \`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md\` 取代。`；若 ≥ 1 不动。

- [ ] **Step 2: 运行手册追加第 8 章（全文）**

把标题改为 `# 数据底座运行手册（DQ 基础 + 发行人主数据 + 披露事实库）`，第 3 行"适用迁移"末尾追加 `、\`supabase/migrations/20261106090000_financial_facts.sql\``，并在文件末尾追加：

```markdown
## 8. 披露事实库（计划二）

规格：`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（第 8 稿）。迁移 `supabase/migrations/20261106090000_financial_facts.sql`。代码 `src/lib/facts/`。

### 8.1 表与权限

| 表 | 读 | 写 | 说明 |
|---|---|---|---|
| `fact_sync_runs` | 仅 service_role | 仅函数 | 一次发行人×市场的同步运行；`status` staged→published / abandoned；`manifest` = 本次发布的 filing 集合 |
| `filings` | anon / authenticated / service_role 只读 | 仅函数；例外：service_role 可**列级** `update` `document_ref, document_url, link_attempts`（巨潮挂接） | `(source, source_ref)` 唯一；`mapping_gen` 只由 `publish_sync_run` 推进 |
| `financial_facts` | anon / authenticated 只见 `status='ok'`；service_role 全见 | 仅函数 | 披露日志：同一自然键每份文件一行；`value_text` 为 `value::text`；候选键 K + filing + mapping_gen 唯一 |
| `financial_metrics` | 三角色只读 | 仅 `replace_financial_metrics` | 按发行人×市场整体原子替换；`inputs` 扁平列出全部底层事实；`based_on_rev` = 计算所依据的 `state_rev` |
| `fact_sync_scope` | 仅 service_role | `reconcile_fact_sync_scope`（三列）+ 租约/发布函数 | 调度输入 + 租约 + `state_rev`；`priority=0` = 已退出范围但保留历史 |

- 五表均 RLS 且对 `public, anon, authenticated, service_role` `revoke all` 后只 `grant select`；**没有角色有 insert/update/delete**（上表两处例外）。直接 `insert financial_facts`、`update financial_facts.status`、`update filings.mapping_gen` 都会被拒（集成测试 `src/lib/facts/facts.integration.test.ts` 覆盖）。
- 桶 `disclosure-raw`（私有，50 MB，`application/json`）。
- `database.types.ts` 新增 `Filing / FinancialFact / FinancialMetric / FactSyncRun / FactSyncScope`；RPC 不登记到 `Functions`。

### 8.2 函数清单

| 函数 | 调用者 | 租约 | 作用 |
|---|---|---|---|
| `reconcile_fact_sync_scope(p_market, p_rows)` → int | `reconcileScope` | 否 | 只改 `reasons/priority/fetch_key`；新行 `next_due_at=now()` |
| `claim_fact_sync_lease(p_issuer, p_market, p_batch, p_ttl_seconds)` → bool | sync 核心 | 建立 | 未租/过期/同批次续租 → true |
| `begin_sync_run(p_issuer, p_market, p_batch, p_mapping_gen)` → uuid | sync 核心 | 校验 | 废弃本发行人旧 staged 运行（先标后删），插入新 staged 运行 |
| `stage_filings(p_run, p_rows)` → jsonb | sync 核心 | 校验 | `on conflict (source, source_ref) do nothing`，返回 `source_ref→filing_id` |
| `stage_facts(p_run, p_rows)` → int | sync 核心 | 校验 | 插入 staged 行 |
| `quarantine_facts(p_run, p_fact_ids, p_item)` → int | sync 核心 | 校验 | staged→quarantined，并把 id 并入隔离项 `payload.fact_ids` |
| `publish_sync_run(p_run, p_manifest)` → int | sync 核心 | 校验 | 一个事务：staged→ok、争议组处置、`filings.mapping_gen` 激活（回退 → `mapping_gen_regression`）、`state_rev+1` |
| `abandon_sync_run(p_run)` | sync 核心 | 校验 | 只对 staged 运行；先标 abandoned 再删其事实 |
| `release_fact_sync_lease(p_issuer, p_market, p_batch, p_outcome, p_next_due)` | sync 核心 | 校验 | 清租约，写 `last_*`、`next_due_at` |
| `resolve_facts_quarantine(p_item, p_chosen, p_resolved_by)` → jsonb | 管理员钩子 | 否（持行锁） | 任一成员行运行仍 staged → `run_pending`；否则翻转项状态、持久化 `chosen_fact_ids`、提升、`state_rev+1` |
| `replace_financial_metrics(p_issuer, p_market, p_based_on_rev, p_rows)` → int | `materialize` | 否（持行锁） | `state_rev<>p_based_on_rev` → `stale_computation`；整体替换 |
| `fact_state_rev(p_issuer, p_market)` → bigint | `read_facts` | — | anon 可执行；只暴露 `state_rev` |
| `read_facts(p_issuer, p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok)` → jsonb | 读路由、派生、规划 | — | security invoker；单语句单快照信封 `{state_rev, rows, truncated, row_count}`；> 10,000 行 → `truncated=true` 且无行 |

错误码：`lease_lost`（SQLSTATE 55P03）；`run_pending`、`run_published`、`mapping_gen_regression`、`stale_computation`（P0001，消息即码）；触发器 `financial_facts_lifecycle`、`filings_limited_update`（23514，消息前缀 `append_only:`）。`supabaseFactsDb` 把这些映射为 `FactsDbError.code`。

### 8.3 锁纪律

- 所有改变事实可见性的函数都以 `select … from fact_sync_scope where issuer_id=… and market=… for update` 开始；采集函数再校验 `lease_batch_id = p_batch and lease_until > now()`。管理函数（`resolve_facts_quarantine`、`replace_financial_metrics`）不校验租约但持同一把锁，因此与发布串行。
- 租约 600 s；`sync.ts --apply` 与 cron **不要同时运行**同一市场：后者只会得到 `skipped_summary(leased)`，但会浪费一轮。
- 不要在 SQL 控制台里手工 `update fact_sync_scope set lease_until=null`：若工作者仍活着，它的后续写会抛 `lease_lost` 并把发行人记 failed，这是预期行为；真正悬空的租约会在 `lease_until` 过期后自然可取。

### 8.4 快照路径约定

桶 `disclosure-raw`：`{source}/{issuer_id}/{sha256}.json` 存响应原文字节，旁边 `{sha256}.meta.json`（`{source, api?, url?, params?, fields?, fetched_at, http_status, has_more?, page?, sha256, bytes}`，**不含 token**）。`upsert:false`，409 视为已存在。`financial_facts.raw_hash = sha256(<快照 sha256> + "\n" + <定位串>)`（`providers/shared.ts::rawHashOf`）：EDGAR 定位串 `facts.<tax>.<tag>.units.<原始单位>[accn=…,start=…,end=…]`；Tushare 定位串 `<api>:rt<report_type>:p<页号>[end_date=…,ann=…,update_flag=…,row=<行号>]`。要核对一行：按 `raw_hash` 无法反查定位串，但同一 `(filing, concept, period, unit)` 的候选可由适配器对同一快照重新解析得到相同 `raw_hash`，相等即证明该行来自该快照的该条目。

### 8.5 `available_date` 规则

日期级（不是时间戳）。EDGAR = `filed`；Tushare = `f_ann_date ?? ann_date`；两者都缺 → 隔离 `missing_available_date`，不写事实行。`asOf` 可见 ⇔ `available_date <= asOf`。同一自然键同一 `available_date` 出现不同值 → 同日冲突（`same_day_conflict`），发布后该日对该键没有 `ok` 值，当前值回落到更早日期，直到管理员在 `/admin/dq` 用 `chosen_fact_ids` 裁决。

### 8.6 录制夹具

```bash
npx tsx scripts/facts/record-fixture.ts --edgar 320193            # → fixtures/edgar/CIK0000320193.trimmed.json
npx tsx scripts/facts/record-fixture.ts --edgar-revise 320193     # → CIK0000320193.revised.json（追加一条更晚 10-K 的 FY2023 revenue）
node --env-file=<仓库外文件> --import tsx scripts/facts/record-fixture.ts --tushare 600519.SH --since-year 2016   # → fixtures/tushare/<ts_code>.<api>.rt<n>.p<k>.json + .meta.json
npx tsx scripts/facts/record-fixture.ts --cninfo 600519.SH <YYYY-MM-DD> 2024 annual                        # → fixtures/cninfo/600519.SH-2024-annual.json
```

EDGAR 夹具裁剪到 §3 概念标签与 `end >= 2019-01-01` 的条目，顶层 `__recorded:{at, source_sha256, url, bytes, trimmed:{since_end, tags}}` 记录原始响应的 sha256 与裁剪规则；数字字面量原样写回（`stringifyPreservingNumbers`），没有任何值经过 JS number。Tushare 页按字节原样保存，`.meta.json` 记 `recorded_at/sha256/api/params/fields/page/has_more/http_status`，token 不落盘；没有真实夹具时 `fixtures/tushare/_synthetic/`（`request_id: "synthetic"`）只供单测，永不用于黄金断言。黄金断言 `fixtures/gold/plan2.json` 由实施者之外的人从一手文件抄录，格式 `{issuer:{ticker,market}, concept, period_end, unit, value, as_of?, source:{document,page_or_row,url}, recorded_by, recorded_at}`；`recorded_by:'<pending>'` 的条目是模板，不断言；顶层 `required.US/CN` 为 true 时套件要求相应发行人已有录入条目。

### 8.7 Tushare `report_type` 1/4/5 核对记录（规格 §6.3 / §15 第 1 条）

F2-4 第一步（Task 12 Step 10）在 token 环境核对后填写，来源是 `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md` 的核对表（本表是它的抄本；两处同步更新）。未核对前本节保持"未核对"，CN cron 不开。

| 项 | 观察（公司 / 期末 / 原文行） | 结论 |
|---|---|---|
| `limit=2000` / `offset` / `has_more` 的真实分页行为 | 未核对（本机无 `TUSHARE_TOKEN`） | `fetchTushareStatements` 按 `has_more` 续页、短页即停；核对前不得宣称覆盖完整 |
| type 1 被更正后 `ann_date` / `f_ann_date` 是否变化 | 未核对 | 合成夹具假设更正后 `f_ann_date` = 更正公告日 |
| type 5 的公告日取哪一列 | 未核对 | 合成夹具假设 = 原始公告日（`f_ann_date ?? ann_date`） |
| 同一 `end_date` 下 1 与 5 同日并存是否出现 | 未核对 | 出现时按 §5.3：不同 filing → `same_day_conflict`，同 filing → `ambiguous_value` |
| `is_calc=1` 行的处理 | 规格：跳过 | `parseTushareStatements` 跳过并计入 `skipped.is_calc` |
| 真实 Tushare 夹具 | 未录制 | `fixtures/tushare/_synthetic/` 仅供单测；黄金断言与 `sync-cn.integration.test.ts` 等待真实夹具 |
| 巨潮夹具 `fixtures/cninfo/600519.SH-2024-annual.json` | 按 Task 13 Step 5 的结果填（已录制 / 未录制 + 原因） | 未录制时 `cninfo-link.test.ts` 最后一个用例 skip |

核对后把"未核对/未录制"改为"已核对（日期，夹具 sha256 前 8 位）+ 观察"。

### 8.8 运行同步与物化

环境：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`EDGAR_USER_AGENT`（缺省 `DEFAULT_USER_AGENT`）、`TUSHARE_TOKEN`（仅 CN）、`CRON_SECRET`（cron）、`VERCEL_GIT_COMMIT_SHA`（Vercel 自动注入；脚本回退到 `git rev-parse HEAD`，脏树加 `-dirty`；取不到则拒绝 `--apply`）。

```bash
# 美股 dry-run（读库、抓 SEC、不写）
node --env-file=.env.local --import tsx scripts/facts/sync.ts --market US --issuer AAPL --issuer MSFT --issuer NVDA
# 无任何环境的网络冒烟（内存库）
node --import tsx scripts/facts/sync.ts --market US --no-db --cik 320193 --cik 789019 --cik 1045810
# 首轮应用（owner，合并后）；cron 与脚本不要同时跑
node --env-file=.env.local --import tsx scripts/facts/sync.ts --market US --limit 20 --apply
# 按发行人重算派生
node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US --issuer AAPL
node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US --all
```

cron：`GET|POST /api/cron/facts-sync?market=US|CN[&limit=n]`，Bearer `CRON_SECRET`，`maxDuration=300`，截止 240 s，默认 `limit=25`；`vercel.json` 只登记 `market=US`（`5 */4 * * *`）。CN 只在 A 股夹具与黄金断言进入 CI 后加入。回执：`{ok, market, limit, started_at, receipt:{batchId, status, counts, errors, idle, detail:{attempted, published, failed, skipped, idle}, issuers:[{issuerId, fetchKey, runId, outcome:'published'|'planned'|'failed'|'skipped', code?, counts, errors, warnings, snapshotSha256:[…]}]}}`（`SyncReceipt`，`src/lib/facts/sync.ts`）。cron 先 `reconcileScope` 再取到期发行人；脚本 `--issuer` / `--no-db` 直指发行人时不对账：scope 行按 id 直取，缺行时 `--apply` 由发行人表算出并补建（`reasons:['explicit']`，下一次 cron 对账若来源表不含该发行人会把它退到 `priority 0`），dry-run 构造只读行；算不出 `fetch_key`（无 CIK / 无 A 股上市）的发行人以 `outcome:'failed', code:'scope_unresolved'` 出现在回执里，脚本退出码 1。`errors` 的信息码：`skipped_summary`（含 `<issuer>:parser` 的解析器跳过计数与 `<issuer>:cninfo_link`）、`coverage_summary`（CN，`{"<api>:rt<n>":"<首年>-<末年>:<期末数>"}`）、`rule_warning_summary`、`deadline_hit`。发布之后的失败（挂接、物化、释放）不撤发布：发行人 outcome 仍 `published`，原错误按自身码记入 `errors`，租约以 `failed` 释放（1 天后重试）。新鲜度 dataset `facts.us` / `facts.cn`，`ok` = 空转或 `published ≥ max(1, ceil(attempted/2))`。

### 8.9 悬空 `running` 批次

工作者在 `finishBatch` 前被杀（Vercel 超时、OOM）会留下 `status='running'` 的批次。确认启动时间早于 `maxDuration` 之外（> 10 分钟）后标 failed：

```sql
update public.ingest_batches
   set status='failed', finished_at=now(),
       errors=errors || '[{"code":"orphaned_running","message":"marked failed by runbook 8.9"}]'::jsonb
 where producer='facts-sync' and status='running' and started_at < now() - interval '10 minutes';
```

其 staged 运行会在该发行人下一次 `begin_sync_run` 时被废弃；租约到期后自动可取，不要手工清。

### 8.10 回滚顺序

先导出 `dq_quarantine`（`dataset like 'facts.%'`）与 `fact_sync_runs`（审计证据）。依赖顺序（round-1 #24）：客户端函数 → 内部助手（`fact_scope_lock` / `fact_run_lock` 的返回类型是表的复合类型，必须先于表删除）→ 表（行触发器随表删除）→ 触发器函数（表删除后才无依赖）→ 计划一表上的索引 → 桶。然后（迁移角色执行）：

```sql
-- 1. client-facing functions
drop function if exists public.read_facts(uuid,text,text[],date,date,date,boolean,int,boolean);
drop function if exists public.fact_state_rev(uuid,text);
drop function if exists public.replace_financial_metrics(uuid,text,bigint,jsonb);
drop function if exists public.resolve_facts_quarantine(uuid,uuid[],uuid);
drop function if exists public.promote_quarantined(uuid,text,uuid[]);
drop function if exists public.release_fact_sync_lease(uuid,text,uuid,text,timestamptz);
drop function if exists public.abandon_sync_run(uuid);
drop function if exists public.publish_sync_run(uuid,uuid[]);
drop function if exists public.quarantine_facts(uuid,uuid[],uuid);
drop function if exists public.stage_facts(uuid,jsonb);
drop function if exists public.stage_filings(uuid,jsonb);
drop function if exists public.begin_sync_run(uuid,text,uuid,int);
drop function if exists public.claim_fact_sync_lease(uuid,text,uuid,int);
drop function if exists public.reconcile_fact_sync_scope(text,jsonb);
-- 2. internal helpers (return types depend on the tables' composite types)
drop function if exists public.fact_promote_rows(uuid,text,uuid[]);
drop function if exists public.fact_item_members(jsonb);
drop function if exists public.fact_abandon_run(uuid,boolean);
drop function if exists public.fact_run_lock(uuid);
drop function if exists public.fact_scope_lock(uuid,text,uuid);
-- 3. tables (row triggers go with them; FK order: facts → filings → runs; metrics and scope independent)
drop table if exists public.financial_metrics;
drop table if exists public.financial_facts;
drop table if exists public.filings;
drop table if exists public.fact_sync_runs;
drop table if exists public.fact_sync_scope;
-- 4. trigger functions (only now free of dependants)
drop function if exists public.financial_facts_lifecycle();
drop function if exists public.filings_limited_update();
-- 5. the one object this migration added to a plan-1 table
drop index if exists public.dq_quarantine_fact_ids_idx;
-- 6. bucket: empty it through the Storage API first, then
delete from storage.buckets where id='disclosure-raw';
-- 7. inventory: nothing of the facts layer may remain
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (proname like 'fact\_%' or proname in ('read_facts','begin_sync_run','stage_filings','stage_facts','quarantine_facts','publish_sync_run','abandon_sync_run','release_fact_sync_lease','claim_fact_sync_lease','reconcile_fact_sync_scope','promote_quarantined','resolve_facts_quarantine','replace_financial_metrics','financial_facts_lifecycle','filings_limited_update'));
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope','dq_quarantine_fact_ids_idx');
```

两个清单查询都必须返回 0 行。**演练**（合并前一次，在 `test:db` 的临时库上）：应用全部迁移 → 执行本节脚本 → 两个清单为空 → 重新应用 `20261106090000_financial_facts.sql` → `facts.integration.test.ts` 通过。`ingest_batches` 中 `producer='facts-sync'` 的回执与 `dq_freshness` 的 `facts.*` 行保留。同时从 `vercel.json` 移除 `facts-sync` 条目并重新部署，否则 cron 会打到已无表的函数上（503/500 进入 Vercel 日志）。

### 8.11 owner 步骤

1. Vercel 环境：`EDGAR_USER_AGENT`（真实联系方式）、`CRON_SECRET`、确认 `TUSHARE_TOKEN`（CN 前）。
2. 生产迁移 `20261106090000_financial_facts.sql`（按 `alpha-production-deploy-and-hosted-db` 记忆的 Management API 方式；非超级用户，不 `alter function … owner`）。
3. `scripts/facts/sync.ts --market US --limit 20 --apply` 首轮；查看 `/admin/dq` 的 `facts.us` 新鲜度与隔离项。
4. `GET /api/facts/AAPL?concepts=revenue&asOf=2024-06-30` 核对验收样例 1（期末 2023-09-30 的 2023-11-03 披露行，`disclosureSeq=1`）。
5. CN：提供 `TUSHARE_TOKEN` 给录制环境 → 完成 8.7 核对 → 夹具与黄金断言进 CI → 把 `fixtures/gold/plan2.json` 的 `required.CN` 置 true → 把 `facts-sync?market=CN` 加入 `vercel.json`。
6. 黄金集抄录（**F2-7 完成的阻塞项**，由实施者之外的人完成）：`src/lib/facts/fixtures/gold/plan2.json` 的 `required.US` 默认 true，`sync-us.integration.test.ts` 的黄金用例在 AAPL 与 MSFT 各有至少一条 `recorded_by` 非 `<pending>` 的条目之前**一直失败**（打印 `gold entry for <ticker> is still <pending>`）——这是设计的未完成状态，不要为了变绿改 `required`。步骤：(a) 对每条目从一手文件（10-K / 年报 PDF）抄 `value`（规范十进制字符串）、`source.page_or_row`、`source.url`，填 `recorded_by`（姓名）与 `recorded_at`（ISO）；(b) 跑 `npm run test:db`，黄金用例逐条回放 `read_facts(asOf = as_of)`；(c) 全部 6 家 × 2 期 × 6 科目抄录完毕后把顶层 `ready` 置 true：此后任何 `<pending>` 都是失败，套件还会检查 ≥ 6 家、每家 ≥ 2 期 × ≥ 6 科目，且每个被断言的发行人都有录制夹具（美股：`record-fixture.ts --edgar <cik>` 并把 ticker/CIK 加进 `sync-us.integration.test.ts` 的 `CIK`/`FIX` 表；A 股：`--tushare`）。
```

- [ ] **Step 3: 规格 §16 存根**

把规格 `## 16. 实施记录与偏差` 下的 `（计划二落地后补记。）` 替换为：

```markdown
实施计划：`docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md`。每个工作包合入时在此逐条补记；没有偏差的工作包也写一行"无偏差"。

| 日期 | 工作包 | 规格条款 | 偏差 | 原因 | 处置 |
|---|---|---|---|---|---|
| 2026-11-04 | F2-6 | §8 | `inputs` 元素不含差分规则 a/b 字段 | `MetricRow.inputs` 元素类型固定为 `{fact_id, concept, filing_id, available_date}`；规则可由两输入的 `filing_id` 是否相同推出 | 接受；`derive.ts` 头注释说明 |
| 2026-11-04 | F2-6 | §4.4 | INSTANT 指标 `period_start = period_end` | 列 `period_start date not null` | 接受 |
| 2026-11-04 | F2-5 | §6.5 | `sync.ts` 增加 `--no-db --cik` 内存库冒烟模式 | 无环境也能做真实 SEC 网络冒烟 | 接受；不写任何表 |
| 2026-11-04 | F2-2 | §6.1 | dry-run 不建 `ingest_batches` 行（`status:'dry_run'`，`batchId:null`，发行人 `outcome:'planned'`） | 零写入的 dry-run 才能在只读环境与 `--no-db` 下运行 | 接受；`--apply` 才落回执 |
| 2026-11-04 | F2-2 | §6.1 | `issuerIds` 给定时不先 `reconcileScope` | 脚本 `--issuer`/`--no-db` 与回放测试的 scope 行由调用方放置，不能被来源表清零 | 接受；cron 路径不变 |
| 2026-11-04 | F2-2/F2-5 | §6.1、§6.5 | 显式发行人缺 scope 行时由 `scopeRowFor` 算出：`--apply` 经 `reconcile_fact_sync_scope` 补建（`reasons:['explicit']`），dry-run 构造只读行；算不出的记 `scope_unresolved` | 规格只说"取这些发行人"，没说缺行怎么办；审计 round-1 #13 | 接受；补建行会被下一次 cron 对账退到 priority 0（除非来源表含该发行人） |
| 2026-11-04 | F2-2 | §6.1、§10 | 发布之后的失败不撤发布：outcome 保持 `published`，原错误按自身码记入 `errors`，租约以 `failed` 释放 | `abandon_sync_run` 对已发布运行只会抛 `run_published`；审计 round-1 #11 | 接受 |
| 2026-11-04 | F2-4 | §6.3 | `coverage_summary` 的 message 是紧凑串 `{"<api>:rt<n>":"<首年>-<末年>:<期末数>"}`，不是 `coverageSummary()` 的逐年对象 | `ingest_batches.errors` 单条 message 上限 500 字；审计 round-1 #12 | 接受；逐年对象可由 `coverageSummary(parseTushareStatements(快照))` 重算 |
| 2026-11-04 | F2-3/F2-7 | §11.4 | 黄金文件 `required.US` 默认 true、新增 `ready`：owner 录入前 `sync-us.integration.test.ts` 黄金用例为红 | 审计 round-1 #19：门禁不能零人工断言通过 | 接受；runbook 8.11-6 为 F2-7 完成的阻塞项 |
| 2026-11-04 | F2-2 | §6.1 | `SyncDeps` 多 `parseUs/parseCn` | 避免 `sync.ts` 直接 import 适配器 | 接受；`deps.ts` 注入 |
| 2026-11-04 | F2-1 | §3 | 概念目录按表落地 34 行（正文写 33） | 表为准 | 待 owner 确认是否删一行 |
| 2026-11-04 | F2-1 | §7.2 | `gross_margin_range` 取 [-1, 1] | 规格未给上下界 | 待 owner 确认 |
| 2026-11-04 | F2-4 | §10 | 新增非信息码 `tushare_unavailable` | §10 没有 Tushare 非配额失败一行 | 接受 |
| 2026-11-04 | F2-4/F2-5 | §6.5、§14 | CN cron 未加入 `vercel.json` | 本机无 `TUSHARE_TOKEN`，A 股夹具与黄金断言未进 CI | 按 §12 降级；owner 步骤 8.11-5 |
```

- [ ] **Step 4: 真实网络冒烟（SEC，不需要 token）**

Run（有 `.env.local` 时）:
```bash
node --env-file=.env.local --import tsx scripts/facts/sync.ts --market US --issuer AAPL --issuer MSFT --issuer NVDA
```
Run（无环境时的等价冒烟）:
```bash
node --import tsx scripts/facts/sync.ts --market US --no-db --cik 320193 --cik 789019 --cik 1045810
```
Expected: 退出码 0；stdout 一个 JSON，形状为
```json
{
 "mode": "dry-run (no batch written; pass --apply to write)",
 "market": "US",
 "codeVersion": "<40 位 sha 或 sha-dirty>",
 "batchId": null,
 "status": "dry_run",
 "counts": {"fetched": <≥ 600>, "inserted": <≥ 600>, "duplicates": 0, "versioned": 0, "quarantined": <≥0>, "failed": 0},
 "errors": [],
 "issuers": [
  {"issuerId": "…", "fetchKey": "0000320193", "runId": null, "outcome": "planned", "counts": {"fetched": <≥ 200>, "inserted": <≥ 200>, "duplicates": 0, "versioned": 0, "quarantined": <≥0>, "failed": 0}, "errors": [], "warnings": {}, "snapshotSha256": ["<64 hex>"]},
  {"issuerId": "…", "fetchKey": "0000789019", "runId": null, "outcome": "planned", "counts": {…}, "errors": [], "warnings": {}, "snapshotSha256": ["<64 hex>"]},
  {"issuerId": "…", "fetchKey": "0001045810", "runId": null, "outcome": "planned", "counts": {…}, "errors": [], "warnings": {}, "snapshotSha256": ["<64 hex>"]}
 ],
 "idle": false,
 "detail": {"attempted": 3, "published": 0, "failed": 0, "skipped": 0, "idle": false}
}
```
核对点：`status='dry_run'`（dry-run 不建批次，`batchId=null`）；三家 `outcome='planned'`（有 `.env.local` 的路径下 AAPL/MSFT/NVDA 若尚无 `fact_sync_scope` 行，核心按 round-1 #13 用 `scopeRowFor` 构造只读行——dry-run 不写库；某家若 `outcome:'failed', code:'scope_unresolved'`，说明 `issuers` 里没有它的 CIK，先补主数据再重跑）；每家 `snapshotSha256` 恰一个 64 位 hex（companyfacts 单个响应）；`counts.fetched` = 候选数，`inserted` 对 AAPL ≥ 200（10 年 × 34 概念 × 多期的量级；companyfacts 里没有的概念保持缺失，不计失败；`--no-db` 下库是空的，所以 `inserted = fetched − quarantined`）；`errors` 为空（SEC 429/503 时为 `sec_unavailable`，等 60 s 重跑一次再判）；`warnings` 在 JSON 里是 `{}`（`Map` 序列化）。把三家的 `snapshotSha256`、`counts` 与运行日期追加到 `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`（Task 12 Step 11 创建；只写日期、命令、sha256、计数）。断网时每家 `outcome='failed'`、`errors=[{code:'sec_unavailable',…}]`、退出码 1——这是规格 §10 的预期行为，不是缺陷。

- [ ] **Step 5: 全量门禁**

Run:
```bash
npm test && npm run typecheck && npm run lint
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
```
Expected: 全部绿，**唯一允许的红是 `sync-us.integration.test.ts` 的黄金门禁**（`gold entry for <ticker> is still <pending>`，round-1 #19）——它在 owner 完成 runbook 8.11-6 之前一直是红，F2-7 在那之前**不算完成**；把这一状态写进 `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`（"F2-7：代码与文档齐备；黄金门禁待 owner 录入，日期"）。owner 录入后（`required.US` 仍为 true，`ready` 按 8.11-6 置 true）重跑本步，必须全绿。`test:db` 的 critical 清单包含 `src/lib/facts/facts.integration.test.ts` 与 `src/lib/facts/sync-us.integration.test.ts`（`sync-cn` 只在夹具存在时存在），`verifyCriticalSuiteInventory` 无 `Database suite inventory drift`。已知本地全套偶发失败见记忆 `alpha-local-db-harness-env`，重跑一次仍失败才算失败。

- [ ] **Step 6: 提交**

```bash
git add docs/runbooks/data-foundation.md docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md
git commit -m "docs(facts): runbook chapter for the disclosure log, spec §16 deviation record, SEC dry-run log" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Part D 自检

- 规格覆盖：§6.4（Task 14）、§6.5（Task 17）、§8（Task 15）、§9（Task 16）、§12 F2-5/F2-6/F2-7、§13 的 SEC dry-run 3 家（Task 18 Step 4）、§16（Task 18 Step 3）、runbook（Task 18 Step 2）、规格一 §4 指向只核对不重复（Task 18 Step 1）。
- 引入的名字见开头"本部分新增导出"表；`FORMULA_VERSION='facts-derive/1.0'`、路由错误码 `unknown_ticker` / `invalid_parameter:<name>`、cron 回执字段与骨架一致。
- 与 Part B 的对齐已完成（`SyncReceipt.detail`、`issuers[].fetchKey/snapshotSha256`、`outcome:'planned'`、`issuerIds` 不先对账：见文末"接口对齐记录"）；`canonicalDecimal` 纯文本进出，Task 15 直接使用。
- 开放问题：(1) `revenue_yoy` 与 `q_single_revenue` 在 CN 按规格字面用 `revenue`（总营收），而利润率用 `revenue_operating`——若 owner 希望 CN 统一口径，改 `Q_SINGLE_CONCEPTS.CN` 与 yoy 概念表并升 `FORMULA_VERSION`；(2) `factIds` 证据模式不施加 `asOf` 过滤（只限 ok、本发行人本市场）；(3) `metricsOfIssuer` 无 `asOf` 时响应 `asOf:null`。

---

## 接口对齐记录

四个 Part 独立编写后由整合者逐一核对的跨部分签名；每行 = 发现的不一致 → 处置（改哪一侧、为什么）。

1. `MemoryFactsDb.runs`：Part A 定义为方法 `runs():MemoryRun[]`，Part B 的 `sync.test.ts` 按 `Map` 用（`db.runs.values()`、`db.runs.size`）→ 改消费者（6 处改为 `db.runs()`）。
2. `normalizeUnit`：Part B 单参数 `normalizeUnit(raw)`，Part C 按 `normalizeUnit(raw, kind)` 调用 → 改消费者：EDGAR 适配器改为 `normalizeUnit(raw)` + `unitKindOf(normalized)===concept.unitKind`（Part B 已导出 `unitKindOf`）。
3. `classifyDuration`：Part B 返回 `Duration|'odd'`，Part C 按 `null` 判 odd → 改消费者（EDGAR 与 Tushare 两处 `duration===null` → `'odd'`，类型注解同步）。
4. `COMPANYFACTS_SCHEMA`：Part C 自定义了与 Part B `EDGAR_NUMBER_SCHEMA` 相同的对象 → 改消费者为 `COMPANYFACTS_SCHEMA:NumberSchema=EDGAR_NUMBER_SCHEMA`（两个名字都保留）。
5. 错误类型：Part C 的抓取器抛自定义 `ProviderError`，Part B 的 `sync.ts` 只识别 `SyncError`（否则一律记 `unknown`）→ 改消费者：`providers/shared.ts` 把 `ProviderError` 定义为 `SyncError` 的值/类型别名；同时把 Part C 新增的 `tushare_unavailable` 加入 Part B 的 `SyncErrorCode`（生产者侧的联合类型扩展，不改语义）。
6. `mappingGen` 位置：Part C 假设在 `SyncDeps`，Part B 放在 `SyncOptions` → 改消费者：`sync-us.integration.test.ts` 的 `run()` 改为透传 `Partial<SyncOptions>`。
7. `runFactsSync` 与 `reconcileScope` 的关系：Part B 总是先对账，Part C（回放测试）与 Part D（`--issuer`、`--no-db`）都依赖"`issuerIds` 给定时不对账"，否则真实 `reconcileScope` 会把测试发行人退到 `priority 0` → 改生产者（`if(opts.issuerIds===undefined)await reconcileScope(…)`），Part B 现有用例不受影响（每个 `issuerIds` 运行前都有一次无 `issuerIds` 的运行），记入 §16。
8. 回执形状：Part C/D 假设 `receipt.detail:{attempted,published,failed,skipped,idle}`，Part B 只有顶层 `idle` → 改生产者：`SyncReceipt` 增加 `detail`（与写入 `dq_freshness` 的同一对象），顶层 `idle` 保留。
9. `IssuerOutcome`：Part D 的脚本/runbook 假设 `fetchKey`、`snapshotSha256`、dry-run `outcome:'planned'`，Part B 没有 → 改生产者（`fetchAndParse` 返回 `{parsed,sha256s}`；`IssuerOutcomeKind` 加 `'planned'`，dry-run 用它）；Part D 的预期 JSON 改为 Part B 的真实形状（`runId:null`、`warnings:{}`）。
10. `SyncDeps.parseUs/parseCn`：Part B 要求注入，Part C 的两个回放测试与 Part D 的 `productionSyncDeps`、`memoryDeps` 都没给 → 改消费者（四处注入 `parseCompanyFacts` / `parseTushareStatements`）。
11. `linkCn` 元数：Part B 的 `SyncDeps.linkCn(filing:FilingRow,b)`，Part C 的 `linkCninfoFiling(filing:LinkFiling,issuer:LinkIssuer,opts)` 三参数，Part D 的 `deps.ts` 按两参数调用 → 改消费者：`deps.ts` 新增 `cninfoLinker(tables,db,opts?)`，从 `issuers`/`issuer_securities` 取 `ts_code`/`cninfo_org_id`、按同键 type-5 filing 判 `corrected`，并补两个单测。
12. `resolveCodeVersion` 重名：Part B（`sync.ts`，env 40-hex 校验 + git）与 Part D（`deps.ts`，env 任意串 + git）各一份且规则不同 → 改消费者：`deps.ts` 的 `resolveCodeVersion({allowGit})` 委托 `sync.ts` 的实现；`deps.test.ts` 改用 40 位 sha。
13. 解析器 `ambiguous[].key`：Part C 的两个适配器各自生成内部分组串（不含 issuer/market），Part B 的 `sync.ts` 直接把它当 §7.1 自然键落库 → 改生产者（`sync.ts` 用 `ambiguousKey(issuer,market,K,filingRef,gen)` 渲染，原串存 `payload.parser_key`，`payload.key` 补齐分量）。
14. `missing_available_date` 自然键：Part B 只按 Tushare 字段 `end_date/report_type` 拼，EDGAR 行（`accn/tag`）会全部碰撞 → 改生产者（`missingDateKey` 回退到 `accn/tag`）。
15. `reconcileScope` / `materialize` 返回值：Part B Task 8 头注写 `Promise<number>`，Part D 实际返回 `ScopeReconcileResult` / `MaterializeResult`；`sync.ts` 与 `facts-resolver.ts` 不使用返回值，代码无需改 → 只改 Part B 的依赖说明。
16. `read.ts` 与内存 `readFacts`：Part B Task 7 要求用 `sequencesOf` 替换 Part A 的内存实现，但 `sequencesOf` 没有 SQL 的键排序/`limit`/上限，替换会打破 Part A 的契约用例 → 不替换，改 Task 7 的说明；两者的序列语义各有测试。
17. 契约块与 `types.ts`：共享契约块缺 Task 2 的文件头注释、`stageFilings` 注释形式不同 → 改契约块，与 Task 2 逐字一致（已用 diff 核对）。
18. runbook "## 8." 两份：Part C Task 12 Step 11 与 Part D Task 18 Step 2 各追加一个 `## 8.` → Task 12/13 改为写实施记录 `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`，Task 18 的 8.7 表合并两份模板的行并从记录抄；runbook 只在 Task 18 追加一次。
19. 规格 §11.3"`materialize` 两次一致"：Part C 留给 Part D，Part D 没接 → 用例放在 Task 11 的 `sync-us.integration.test.ts` 里（Task 11 按执行顺序在 Task 15 之后，`derive.ts` 已存在）；Task 15 只含纯实现，不碰集成测试文件（原"Task 15 追加"会让 Task 15 修改 Task 11 才创建的文件，与执行顺序循环——Codex round-1 #20）。
20. runbook 8.4/8.6/8.8 与代码不符（`raw_hash` 描述、`record-fixture.ts --source edgar --cik` 的 CLI、回执字段）→ 改为 Part C/B 的实际规则与 CLI。
21. 文件结构清单缺 `keys.ts`、`errors.ts`、`db-contract.ts`、`public-route.ts`、`deps.ts`、`providers/shared.ts`、`providers/tushare-fixtures.ts`、实施记录等，且 `read.ts` 仍写骨架名 → 补齐并标注任务号。

未改动、确认一致的跨部分调用：`memoryFactsDb(tables)`（B→A）、`supabaseFactsDb(admin)`（B/D→A）、`pgFactsDb(pool)`（C→A）、`memorySnapshotStore()`（C/D→B）、`decodeWithSchema(tree,schema)`（C→B）、`canonicalDecimal(text)`（C/D→B）、`FACT_CONCEPTS/MAPPING_GEN`（C/D→B）、`materialize(db,issuer,market)`（B→D，`MaterializeDb` 是 `FactsDb` 的子集）、`reconcileScope({db,tables},market)`（B→D）、`quarantine(tables,{dataset,table,naturalKey,reasonCode,batchId,payload})`（A/B→计划一）、`recordAttempt(tables,dataset,{ok,cadence,now,detail})`（B→计划一）、`startBatch/finishBatch`（B→计划一）、`resolveIssuer(tables,{ticker},{today})` 与 `successCacheControl(now)`（D→计划一）、`createClient(opts,500)` / `resolveOrgId(code,{fetch,userAgent})` / `CNINFO_HISTORY` / `DEFAULT_USER_AGENT`（C→已落地采集器）、`issuers.cninfo_org_id`、`issuer_securities(is_primary,valid_from,valid_to)`、`research_entity_keys(in_scope,issuer_id)`、`security_universe_memberships(universe,is_active)`（D→已落地迁移）、`TableClient` 对 `null` 匹配（内存 `===`，Supabase `.is(k,null)`）。

## 自检记录（写计划时完成）

**核对过的仓库事实**：`memoryTableClient(keys)` 返回 `TableClient&{rows(table)}`，匹配值可为 `null`；`supabaseTableClient` 对 `null` 用 `.is()`；`QuarantineInput={dataset,table,naturalKey,reasonCode,detail?,payload?,batchId}`，`quarantine()` 对同键 open 项返回旧 id；`recordAttempt(client,dataset,{ok,cadence,now?,detail?})`；`INFO_CODES=['skipped_summary','relink']` 在 `batches.ts:48`；`BatchCounts` 六个计数、`BatchError{code,key?,message?}`、`TriggeredBy='cron'|'manual'|'script'`；`dq/rules.ts` 导出 `rangeRule/identityRule/jumpRule/unitRule/RULES_VERSION/RuleResult`；`research-checks.ts:15` 的 `.concat(...)` 列表；`pg-table-client.ts` 的 `typeParsers` 在 `pgTableClient` 内部使用（Task 3 加 `export`）；`tushare.ts` 已有 `TUSHARE_ENDPOINT`、`TushareError`，没有 `tushareCallRaw`；`collectors/shared.ts` 的 `createClient(opts:CollectOptions,defaultIntervalMs)` 与 `DEFAULT_USER_AGENT`，`collectors/cninfo.ts` 的 `CNINFO_HISTORY/CNINFO_TOPSEARCH/resolveOrgId`；`entities/resolve.ts` 的 `resolveIssuer(client,q,{today})` 与 `successCacheControl(now)`；`supabase/anon.ts` 的 `getAnonSupabase`；`research/store.ts` 的 `audit` 与 `ResearchSupabase`；迁移里 `issuers.cninfo_org_id`、`issuer_securities(share_class,is_primary,valid_from,valid_to,source)`、`stocks_universe(ticker,name,market)`、`research_entity_keys(in_scope,home_market)`、`security_universe_memberships`；runbook 现有 1–7 章，第 8 章空缺；`docs/audits/2026-11-04-data-foundation-2/` 已有 01–15 与 README，没有 16；`vercel.json` 最后一条是 `securities-sync?region=us`；`/api/financials/[ticker]/route.ts` 的 `GET(_req,{params}:Ctx)` 与 `Ctx` 类型。

**规格覆盖**：见"共享契约"之后的"规格覆盖表"（§3–§16 逐条指到任务）。

**占位扫描**：全文无 TBD/待定/"类似 Task N"/"适当处理"；黄金文件的 `'<pending>'` 是 owner 录入前的模板值，测试按它跳过，不是占位；Task 13 Step 5 的 `<YYYY-MM-DD>` 是实施者在 cninfo 核实后填入的命令参数；Task 12 Step 10 的 `<修订对公司>` 由录制结果决定。

**类型一致性**：`FactsDb` 19 个方法（round-1 加 `scopeRows`）在 `supabaseFactsDb`、`memoryFactsDb`、`pgFactsDb` 三处签名一致并由同一份 `factsDbContract` 验证；`FactRow.value` 在三实现里都来自 `value_text`；`FilingInsert` 用 camelCase 候选字段（`sourceRef/formType/availableDate`），`FactInsert`/`FactRow`/`FilingRow` 用 snake_case 表列，转换只在 `db.ts::filingArgs` 与 `plan.ts` 内；`SyncDeps/SyncOptions/SyncReceipt/IssuerOutcome` 在 `sync.ts`（定义）、`sync.test.ts`、`sync-us/cn.integration.test.ts`、`deps.ts`、cron 路由、两个脚本、runbook 8.8 与 Task 18 的预期 JSON 九处一致；`ProviderError`=`SyncError`，`SyncErrorCode` 八个码与 §10 加 `code_version_unavailable`、`tushare_unavailable`；自然键只由 `keys.ts` 渲染（`plan.ts`、`rules.ts`、`sync.ts`、集成测试的 `like` 模式与 `db-contract.ts` 的手写键格式一致）；`MetricRow.inputs[]` 元素固定四字段，`derive.ts`、`metrics` 路由、`db.ts::metricFromTable`、SQL `replace_financial_metrics` 一致；`classifyDuration` 的 `'odd'`、`normalizeUnit` 单参数、`decodeWithSchema(value,schema,field?)` 在 Part C 两个适配器里按 Part B 定义调用。

**提交纪律**：19 个提交步骤都是单独一行 `git commit -m … -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`，命令块里没有 `-n` token（`grep` 一律用 `-c` 或无行号）；三个含 `S4_TEST_STATE` 的测试文件（`facts.integration`、`sync-us.integration`、`sync-cn.integration`）各有一步把自己加进 `criticalSuites`，`sync-cn` 与其登记在同一提交。

**Codex round-1 审计（2026-11-04，`docs/audits/2026-11-04-data-foundation-2-plan/01-codex-plan-audit-round1.md`，24 条：9 P1 + 15 P2）**：全部 ACCEPT 并落实（处置表 `docs/audits/2026-11-04-data-foundation-2-plan/02-round1-disposition.md`）。要点：BEFORE UPDATE 触发器改为显式列比较（#1）；`resolve_facts_quarantine` 锁后重建成员集并检查锚定运行（#2、#10）；提升资格加 (K, date) 的 open 争议检查（#3）；`readonly ConceptDef[]`、mock 类型、未用的 eslint-disable（#4–#6）；Supabase 完整集读取分页 + `scopeRows`（#7、#13）；报告类型互斥（#8）；解析器遗留先于 `no_rows`（#9）；发布后失败不撤发布（#11）；`coverage_summary`/`skipped_summary(parser)` 接入回执（#12）；`sequencesOf` 非 ok 行不进序列（#14）；修订夹具保持生效 + 代号前推（#15）；A 股同日冲突改用第二份 filing（#16）；四处断言修正（#17）；`reviseEdgar` 按期间选基准（#18）；黄金门禁默认强制（#19）；执行顺序去循环（#20）；抛错的巨潮请求也计次（#21）；复用落地的有效期谓词（#22）；冻结内存库时钟（#23）；回滚顺序补全（#24）。审计"未验证"项（真实 PostgreSQL 17 执行、完整装配后的 typecheck/vitest、录制夹具字面量、黄金值）仍由各任务的 Run/Expected 步骤在实施时验证。
