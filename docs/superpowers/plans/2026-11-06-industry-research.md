# 行业研究模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-industry-research-design.md`（第 6 稿 = 第 5 稿 + Codex 第五轮增量审计修正，见 `docs/audits/2026-11-06-industry-research/`）中**本轮可实施**的部分：I-0 迁移与契约（全部 §4.3 对象，含估值表与函数）、I-1a A 股发行人装载与事实范围、I-1b 申万来源记录/解析/SIC、I-2 时点聚合 + 内容寻址清单 + 离线回放、I-3 中的**证券级标记采集**（`security_marks` 经 `apply_observations`）、I-4 读接口、I-5 页面（按 Claude Design 画布）、I-6 中不依赖 owner 决策的调度与文档。

**本轮不实施（规格自己的门）：** I-3 的估值计算/对账/发布流水线（`valuation.ts`、`tushare-sw-daily.ts`、`trade_cal`、分位）——规格 §6.4 "核对项 1、2 未完成，I-3 不进计划"；本机无 `TUSHARE_TOKEN`，核对无法进行。估值相关的**表、函数、权限、触发器**在 I-0 迁移里落地并有数据库测试；页面估值区渲染"估值未启用"状态（读 `industry_valuations` 的 `published` 行，当前恒为空）。

**Owner 默认（规格 §16，未确认前按默认实施，PR 中列出）：** A 三个 Tushare 数据集 `internal`（迁移写入；`scheme:sic:sec-current` 为 `public`）；B 两方案都做，授权后默认 `sw2021`；C 估值不发布；D 未校准判断只显示标签 + 徽标；E 未选 → 聚合代码与脚本交付，但 `facts-scope` 与 `aggregate` 不进 `vercel.json`、不在生产自动运行；F anon 与 authenticated 同等；G 重建期显示 + 徽标。

**Architecture:** 两个迁移（表/约束/策略；函数/触发器/权限）；`src/lib/industry/db.ts` 的 `IndustryDb` 契约有 Supabase（`from()`+`rpc()`+桶）/ 内存 / pg 三实现；适配器只产出不可变来源记录；解析器、成分时点查询、聚合、清单、回放全是纯函数，编排函数只依赖注入的 `IndustryDb`、`FactsDb.readFacts`、`ManifestStore` 与抓取函数；页面是服务端组件取数 + 客户端交互组件，所有展示数字是打开来源抽屉的按钮。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`tsx` 脚本、next-intl。计划一的 `TableClient`、`startBatch/finishBatch`、`quarantine()`、`recordAttempt`、`attachSecurity`、`fileClaim`；计划二的 `FactsDb.readFacts`、`deriveMetrics`、`FORMULA_VERSION`、`canonicalDecimal`、`reconcileScope`、`resolveCodeVersion`、`public-route.ts` 助手、`tushareCallRaw`。

执行分工（owner 规则）：Opus 5.5 指挥与复审；实施子代理 Sonnet 5.5；每个任务经 Opus 规格复审、质量复审与 Codex（gpt-6-astra，medium）审计；记录写 `docs/audits/2026-11-06-industry-research/10-implementation-log.md`。

---

## 仓库约定（动手前必读）

<!-- SKELETON: conventions are filled in below; part-writers do not edit this section -->

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/industry-research-fa303d`（分支 `claude/industry-research-fa303d`）。不要 `cd` 出去，不要裸 `git stash`（栈与其他工作树共享）。
- **并行兄弟会话**（计划三、F3 文档、F4 判断、F6 评测）同时在别的工作树改 `main` 的后继：
  - 迁移时间戳只用 `20261111HHMMSS_*`。本计划占 `20261111090000_industry_research.sql`（Task 1）与 `20261111091000_industry_research_functions.sql`（Task 2）。
  - 只拥有：`src/lib/industry/**`、`src/app/(app)/intel/industries/**`、`src/app/api/industries/**`、`src/app/api/admin/industries/**`、`src/app/api/cron/industry-sync/**`、`src/app/api/entities/[issuerId]/industries/**`、`src/components/industries/**`、`messages/{zh,en}/industries.json`、`scripts/industry/**`、`docs/audits/2026-11-06-industry-research/**`。
  - 对共享文件（`src/lib/dq/freshness.ts`、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`、`src/i18n/request.ts`、`src/i18n/messages-parity.test.ts`、`src/app/(app)/intel/page.tsx`、`src/app/(app)/stock/[ticker]/**` 的概览、`vercel.json`、`messages/*/intel.json`）的改动最小化，并在 TS/TSX 中包在 `// INDUSTRY:BEGIN` … `// INDUSTRY:END` 注释之间（JSON 不能注释：只追加键）。
  - 计划三同样给 `dq_freshness` 加 `weekly`（同名约束 `dq_freshness_expected_cadence_check`、同一取值列表）并改 `freshness.ts`。本计划的迁移用**完全相同**的 `drop constraint if exists … add constraint …` 语句，`freshness.ts` 做同一处改动；合并顺序无关。
- **迁移**：可重放（`create table if not exists`、`create or replace function`、`drop policy if exists` 后 `create policy`、`drop trigger if exists` 后 `create trigger`、`insert … on conflict`）；写入 `supabase/migrations.lock.json`（追加 `{file, sha256}`，sha256 为文件字节的 hex；已锁文件不可再改）。`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移时间戳晚于已锁最新（当前 `20261106090000`）。
- **数据库测试**：`test:db`（`scripts/ci/research-db.ts`）启动本地 PostgreSQL 17、按序执行全部迁移、再跑 vitest。集成测试用 `process.env.S4_TEST_STATE` 读 `adminUrl`，`describe.skipIf(!enabled)`。任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 必须加进 `scripts/ci/research-checks.ts` 的 `criticalSuites`（否则 "Database suite inventory drift"）。重放迁移用计划一的 `replayMigration` 助手（复制到新测试文件；它未导出）。只跑一个文件对空库：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts <file>`（`db-one.ts` 不提交；内容见交接文档 §5，丢了按原文重建）。`LC_ALL=C` 只给 `test:db`/`test:migrations`/`db-one.ts`，**不要导出给 `npm test`**。
- **本地 harness 限制**：只建了 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)`，迁移里对桶只能 `insert into storage.buckets … on conflict (id) do update`，不要引用 `storage.objects`；本地 PostgREST `max_rows=1000`，返回表的函数会截断，需要整集的函数返回 `jsonb` 信封。
- **托管实例**（`stock-monitor`，PostgreSQL 17）：`postgres` 角色**不是**超级用户。所有权模型按规格第 6 稿 §4.3（V1）：表与 `security definer` 函数都由迁移角色拥有；**不要** `create role`、不要 `alter function … owner to`；函数里 `set search_path = pg_catalog, public` 且对象全部 `public.` 限定。
- **权限模式**：新表对 `public, anon, authenticated` 先 `revoke all`；Supabase 默认给新函数 `EXECUTE` 给 `anon/authenticated`：每个函数后面显式 `revoke execute on function public.<name>(<签名>) from public, anon, authenticated` 再 `grant` 给需要的角色。
- **客户端**：管理员门禁 `requireAdminUser()`（`src/lib/admin/auth.ts`）；服务端写库 `getAdminSupabase()`（`src/lib/supabase/admin.ts`）；公共读 `getAnonSupabase()`（`src/lib/supabase/anon.ts`）；`TableClient`（`src/lib/db/table-client.ts`）无事务、无 rpc。
- **`database.types.ts`** 手工维护：新表加 `Row/Insert/Update` 并登记到 `Database['public']['Tables']`（在 `// INDUSTRY:BEGIN/END` 块内）；新 RPC 不登记到 `Functions`（按计划二 `supabaseFactsDb` 的做法 `rpc(... as never)`）。
- **提交**：`git commit` 单独一条命令（仓库钩子拦截同一命令里出现的任何 `-n` 记号，包括 `grep -n`）；不要 `--no-verify`；信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理）或 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（指挥会话）。
- **命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`、同前缀 `npm run test:migrations`。
- **代码风格**：沿用 `src/lib/facts`、`src/lib/dq` 的紧凑风格（单空格缩进、少空行、`import type`）；每个新文件顶部一段注释说明职责与规格条目（`spec §x.y`）。React 组件沿用 `src/components/**` 的常规格式（两空格缩进、Tailwind 类、`useTranslations`）。
- **环境变量**：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`CRON_SECRET`、`EDGAR_USER_AGENT`（缺省 `DEFAULT_USER_AGENT`，`src/lib/research/ingest/collectors/shared.ts`）、`TUSHARE_TOKEN`（本机没有）、`VERCEL_GIT_COMMIT_SHA`、`INDUSTRY_JUDGMENTS_ENABLED`（新；缺省关）。
- **无 `TUSHARE_TOKEN` 的降级路径**（规格 §14 I-1b/I-3 退出条件的"需 token"项）：申万、`stock_basic`、`daily_basic` 适配器用**合成夹具**（`src/lib/industry/fixtures/tushare/_synthetic/*.json`，形状按 2026-11-04 核对的官方字段表），runbook 与实施记录标"未核对（无 token）"；`record-fixture.ts` 的 Tushare 子命令实现但不执行；核对项 3 记为未完成，`history_class` 恒为 `reconstruction`（规格 §4.6 本就如此）。SEC SIC 不需要 token：录制真实 `submissions` 夹具（3 家）与 SIC 码表页。
- **判断层（F4）并行开发中**：页面判断区按 F4 规格 §9.2 `JudgmentCard` 与 `GET /api/judgments?subject_type=industry&subject_key=…` 契约渲染，受 `INDUSTRY_JUDGMENTS_ENABLED` 控制（缺省关 → 恒显示"未设判断"，不发请求）。卡片类型在本模块内声明（`src/lib/industry/judgment-contract.ts`，F4 落地后替换为其导出）；F4 输入适配器以 `src/lib/industry/judgment-input.ts` 交付，由 F4 的 `inputs.ts` 注册（本计划不写 `src/lib/judgments/**`）。

## 文件结构

```
supabase/migrations/20261111090000_industry_research.sql            表、约束、索引、RLS 策略、表权限、桶、授权行、dq_freshness weekly（Task 1）
supabase/migrations/20261111091000_industry_research_functions.sql  全部函数、触发器、函数 EXECUTE 权限（Task 2）
supabase/migrations.lock.json                                       追加 2 条（Task 1、2）
src/lib/supabase/database.types.ts                                  // INDUSTRY 块：新表 Row/Insert/Update（Task 1）
src/lib/dq/freshness.ts                                             Cadence += 'weekly'（Task 1）
src/lib/dq/dq-foundation.integration.test.ts                        'weekly' 不再被拒的断言改为 'hourly'（Task 1；与计划三同一改动）
scripts/ci/research-checks.ts                                       criticalSuites += 3 个（Task 1、2、14）
src/lib/industry/types.ts            共享契约（本文件 §共享契约 原样落地；Task 3）
src/lib/industry/db.ts               IndustryDb 再导出 + IndustryDbError 映射 + supabaseIndustryDb（Task 3）
src/lib/industry/memory-industry-db.ts   memoryIndustryDb（单测；实现排他、触发器、授权门、函数语义；Task 3）
src/lib/industry/db-contract.ts      industryDbContract（内存与 pg 共用契约用例；非测试文件；Task 3）
src/lib/industry/pg-industry-db.ts   pgIndustryDb(pool)（集成测试；Task 4）
src/lib/industry/licenses.ts         DATASET_KEYS、schemeDatasetKey、isLicensedStatus（Task 3）
src/lib/industry/fixtures/tushare/_synthetic/{stock_basic,index_classify,index_member_all_Y,index_member_all_N,daily_basic}.json   合成夹具（Task 5、7、13）
src/lib/industry/fixtures/sec/{submissions-*.json,sic-codes.html}   真实录制（Task 9）
src/lib/industry/fixtures/facts/cn-aggregate.json                   聚合离线夹具：2 行业 × 4 期的 CN 事实（Task 14）
src/lib/industry/providers/tushare-industry.ts   fetchStockBasic / fetchIndexClassify / fetchIndexMembers / fetchDailyBasic（tushareCallRaw 包装 + 夹具加载；Task 5、7、13）
src/lib/industry/providers/sec-sic.ts            fetchSubmissionsSic / parseSicCodeTable（Task 9）
src/lib/industry/load-a-share.ts     planAShareLoad / applyAShareLoad / runLoadAShare（Task 5）
src/lib/industry/facts-scope.ts      industryCnUniverse（Task 6）
src/lib/facts/scope.ts               // INDUSTRY 块：desiredCn 并入 industryCnUniverse（Task 6）
src/lib/industry/classifications.ts  planClassificationNodes / applyClassificationNodes（Task 7）
src/lib/industry/source-memberships.ts   planSourceMemberships（纯，同键去重/取代）/ runMembershipsSw（Task 7）
src/lib/industry/resolve-memberships.ts  resolveSourceMemberships（纯计算）/ applyResolutions（逐发行人调 applyMemberships；Task 8）
src/lib/industry/memberships.ts      effectiveValidTo / isMemberAt / membersAtPure / countUnresolved（纯）+ membersAt 包装（Task 8）
src/lib/industry/sic.ts              runMembershipsSic / syncSicScope（Task 9）
src/lib/industry/method.ts           METHOD_VERSION、METHOD_CONFIG、CONFIG_HASH、AGG_CONCEPTS、expectedGrid（Task 10）
src/lib/industry/aggregate.ts        computeAggregateCell（纯：成员+信封→cells/roles/derived/facts）（Task 10）
src/lib/industry/canonical-json.ts   canonicalJson / sha256Hex（Task 11）
src/lib/industry/manifest.ts         buildAggregateManifest / encodeManifest / decodeManifest / ManifestStore（supabase+memory）/ gcManifests（Task 11）
src/lib/industry/replay.ts           replayFromManifest（纯；Task 11）
src/lib/industry/run-aggregation.ts  runIndustryAggregation（编排：就绪门、复用、依赖、激活；Task 12）
src/lib/industry/marks.ts            planMarkRows / runMarks（Task 13）
src/lib/industry/sync.integration.test.ts   离线集成（critical；Task 14）
src/lib/industry/industry.integration.test.ts   迁移/表/约束/RLS（critical；Task 1）
src/lib/industry/functions.integration.test.ts  函数/触发器/权限/并发 + pg 契约（critical；Task 2、4）
src/lib/industry/read.ts             industryListView / industryDetailView / constituentsView / replayView / issuerIndustriesView（读模型；Task 15）
src/lib/industry/route-params.ts     参数解析（复用 src/lib/facts/public-route.ts 助手）（Task 15）
src/app/api/industries/route.ts
src/app/api/industries/[scheme]/[code]/route.ts
src/app/api/industries/[scheme]/[code]/constituents/route.ts
src/app/api/industries/[scheme]/[code]/replay/route.ts
src/app/api/entities/[issuerId]/industries/route.ts                  （Task 15）
src/app/api/admin/industries/runs/route.ts
src/app/api/admin/industries/replay/route.ts
src/app/api/admin/industries/licenses/route.ts
src/app/api/cron/industry-sync/route.ts                             （Task 16）
src/lib/industry/jobs.ts             runIndustryJob(job, deps, opts)：cron 与脚本共用的作业分派 + productionIndustryDeps（Task 16）
scripts/industry/sync.ts  scripts/industry/replay-check.ts  scripts/industry/record-fixture.ts   （Task 16）
vercel.json                                                         + industry-sync?job=memberships-sic（Task 16）
messages/{zh,en}/industries.json；src/i18n/request.ts（INDUSTRY 块）；src/i18n/messages-parity.test.ts（INDUSTRY 块）（Task 17）
src/components/industries/{SourceDrawer,CoverageCell,FreshnessChip,SchemeLevelSwitch,PercentileBar,HistoryClassBadge,StateNotice,Heatmap,SeriesChart,JudgmentArea}.tsx   （Task 17、19）
src/lib/industry/judgment-contract.ts   F4 §9.2 JudgmentCard 的本地类型副本 + fetchIndustryJudgments（flag）（Task 19）
src/lib/industry/judgment-input.ts      F4 输入适配器 industryTableRowsInput（交付给 F4 注册；Task 19）
src/app/(app)/intel/industries/page.tsx                    列表（热力图/表格；Task 18）
src/app/(app)/intel/industries/[scheme]/[code]/page.tsx    详情（Task 19）
src/app/(app)/intel/industries/[scheme]/[code]/constituents/page.tsx   成分（Task 19）
src/app/(app)/intel/page.tsx                               // INDUSTRY 块：研究页签入口卡（Task 18）
src/app/(app)/stock/[ticker]/…                            // INDUSTRY 块：所属行业行（Task 19）
e2e/industries.spec.ts（若仓库 e2e 目录存在，否则按现有 E2E 约定）（Task 20）
docs/runbooks/industry-research.md；规格 §18；docs/audits/2026-11-06-industry-research/10-implementation-log.md（Task 20）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/industry/types.ts` 原样落地）

```ts
// src/lib/industry/types.ts
// Shared contract of the industry module (plan 2026-11-06 §共享契约; spec 6th draft §4.3–§6.1, §9).
// Every task uses these names verbatim. IndustryDb has three implementations: supabaseIndustryDb
// (db.ts: from() + rpc()), memoryIndustryDb (memory-industry-db.ts, unit tests), pgIndustryDb
// (pg-industry-db.ts, integration tests). No implementation writes a protected table directly:
// every write is one of the SQL functions of migration 20261111091000 (spec §4.3, V1/V2).
import type {MetricRow,FactRow} from '../facts/types';

export type Scheme='sw2021'|'sic';
export type SchemeVersion='2021'|'sec-current';
export type DatasetKey='scheme:sw2021:2021'|'scheme:sic:sec-current'|'marks:tushare-daily_basic'|'official:tushare-sw_daily';
export type LicenseStatus='internal'|'public';
export type MembershipStatus='ok'|'quarantined'|'superseded';
export type Availability='effective_date_assumed'|'evidenced'|'observed';
export type ResolutionMethod='today'|'as_of';
export type HistoryClass='point_in_time'|'reconstruction';
export type MetricRunStatus='building'|'active'|'superseded'|'failed';
export type ValuationRunStatus='building'|'published'|'active'|'superseded'|'failed';
export type RunKind='aggregate'|'valuation';
export type AggMetric='revenue_sum'|'net_income_parent_sum'|'gross_margin'|'roe'|'revenue_yoy'|'net_income_yoy'|'member_count';
export type AggDuration='3M'|'12M'|'TTM'|'INSTANT';
export type CellStatus='ok'|'missing';
export type MissingReason='empty_set'|'zero_denominator'|'no_members'|'financial_excluded'|'unresolved_over_limit'|'manifest_mismatch';
export type RoleReason='missing_concept'|'unit_excluded'|'read_truncated'|'version_inconsistent'|'not_in_comparable_set'|'financial_excluded';
export type ObservationKind='marks'|'official';
export type ObservationOutcome='inserted'|'duplicate'|'superseded_previous';

/** industry_classifications row (spec §4.2) */
export interface ClassificationRow{scheme:Scheme;version:SchemeVersion;code:string;level:number;name_zh:string|null;name_en:string|null;parent_code:string|null;attributes:Record<string,unknown>}

/** industry_source_memberships row (spec §4.3–§4.4): immutable import evidence */
export interface SourceMembershipRow{
 id:string;scheme:'sw2021';version:'2021';source:string;ts_code:string;name:string|null;
 l1_code:string;l2_code:string;l3_code:string;in_date:string;out_date:string|null;
 observed_at:string;batch_id:string;raw_hash:string;locator:Record<string,unknown>;
 status:'current'|'superseded';superseded_by:string|null;
 issuer_id:string|null;resolution:{method?:ResolutionMethod;resolved_at?:string;as_of?:string;membership_ids?:string[]};
 resolution_error:{code:string;at:string;detail?:string}|null;
}
/** Input to upsertSourceMemberships (id, status, issuer fields are assigned by the function) */
export interface SourceMembershipInput{source:string;ts_code:string;name:string|null;l1_code:string;l2_code:string;l3_code:string;in_date:string;out_date:string|null;observed_at:string;raw_hash:string;locator:Record<string,unknown>}

/** issuer_industry_memberships row (spec §4.3) */
export interface MembershipRow{
 membership_id:string;issuer_id:string;scheme:Scheme;version:SchemeVersion;code:string;level:number;
 valid_from:string;valid_to:string|null;available_date:string;valid_to_available_date:string|null;
 source:string;source_membership_id:string|null;batch_id:string;status:MembershipStatus;superseded_by:string|null;
 provenance:{availability:Availability;source_membership_id?:string;raw_hash?:string;locator?:Record<string,unknown>}&Record<string,unknown>;
}
/** One target row for apply_industry_memberships (membership_id is preallocated inside the function) */
export interface MembershipTarget{code:string;level:number;valid_from:string;valid_to:string|null;available_date:string;valid_to_available_date:string|null;source:string;provenance:MembershipRow['provenance']}
export interface ApplyMembershipsResult{inserted:number;closed:number;superseded:number;duplicates:number;membership_ids:string[]}

/** Point-in-time query (spec §4.6) */
export interface MembersAtQuery{scheme:Scheme;version:SchemeVersion;code:string;level:number;on:string;knownBy:string}

/** security_marks row (spec §6.1) */
export interface MarkRow{observation_id:string;ticker:string;trade_date:string;fetch_event_id:string;observed_at:string;close:string;total_share:string;market_cap:string;source:string;upstream:'sse'|'szse'|'bse';raw_hash:string;locator:Record<string,unknown>;batch_id:string;status:'ok'|'quarantined'|'superseded';supersedes:string|null}
/** apply_observations input row; numbers are canonical decimal strings */
export interface MarkInput{ticker:string;trade_date:string;close:string;total_share:string;source:string;upstream:'sse'|'szse'|'bse';raw_hash:string;locator:Record<string,unknown>;status?:'ok'|'quarantined'}
export interface OfficialInput{scheme:'sw2021';version:'2021';code:string;trade_date:string;metric:'pe'|'pb'|'total_mv'|'float_mv'|'close';value:string;source:string;upstream:string;raw_hash:string;locator:Record<string,unknown>}
export interface ObservationResult{inserted:number;duplicates:number;superseded:number}

/** Aggregate run header (spec §4.3 industry_metric_runs) */
export interface MetricRunRow{
 run_id:string;scheme:Scheme;version:SchemeVersion;level:number;generation:number;facts_as_of:string;knowledge_date:string;
 history_class:HistoryClass;method_version:string;config_hash:string;formula_version:string;code_version:string;
 expected_grid:{codes:string[];period_ends:string[];metrics:AggMetric[]};fingerprint_at:string;reused_from_run:string|null;batch_id:string;
 status:MetricRunStatus;coverage_summary:Record<string,unknown>;created_at:string;activated_at:string|null;
}
export type NewMetricRun=Omit<MetricRunRow,'run_id'|'generation'|'status'|'coverage_summary'|'created_at'|'activated_at'>;
/** industry_metrics row: one cell, ok or missing (spec §4.3) */
export interface MetricCellRow{
 run_id:string;code:string;metric:AggMetric;period_start:string;period_end:string;duration:AggDuration;
 status:CellStatus;missing_reason:MissingReason|null;value:string|null;unit:string;
 n_members:number;n_with_data:number;n_unresolved:number;manifest_hash:string|null;updated_at:string|null;
}
export type StagedMetricCell=Omit<MetricCellRow,'run_id'|'updated_at'>;
/** industry_run_dependencies row: one per (cell, candidate member) (spec §4.3, U4/V6) */
export interface RunDependency{cell_key:string;issuer_id:string;state_rev:number}

/** Valuation shapes (tables/functions land in Task 1–2; the valuation pipeline is deferred) */
export interface ValuationRunRow{run_id:string;scheme:Scheme;version:SchemeVersion;level:number;generation:number;method_version:string;config_hash:string;formula_version:string;code_version:string;expected_dates:string[];comparator_basis:'ttm'|'static'|'unknown';recompute_from:string;carried_from_run:string|null;fingerprint_at:string;batch_id:string;status:ValuationRunStatus;reconciliation:Record<string,unknown>;created_at:string;published_at:string|null;activated_at:string|null}
export interface ValuationCellRow{run_id:string;scheme:Scheme;version:SchemeVersion;code:string;trade_date:string;metric:'pe_ttm'|'pe_static'|'pb'|'market_cap';status:CellStatus;missing_reason:string|null;value:string|null;facts_as_of:string;n_members:number|null;n_with_data:number|null;n_unresolved:number|null;mcap_coverage:string|null;manifest_hash:string|null;updated_at:string|null;series_qualified:boolean;published:boolean}

/** Content-addressed manifest (spec §5.3; schema 'industry-manifest/2') */
export interface ManifestMember{issuer_id:string;ticker:string|null;valid_from:string;valid_to:string|null;available_date:string;valid_to_available_date:string|null;source_membership_id:string|null;raw_hash:string|null;locator:Record<string,unknown>|null;resolution_method:ResolutionMethod|null}
export interface ManifestUnresolved{ts_code:string;in_date:string;out_date:string|null;source_membership_id:string}
export interface ManifestFact{issuer_id:string;concept:string;period_start:string|null;period_end:string;duration:string;fact_id:string;value_text:string;unit:string;consolidation:string;available_date:string;mapping_gen:number;filing_id:string;source_ref:string|null;raw_hash:string;citation:'edgar'|'linked'|'pending'|null}
export interface ManifestDerived{issuer_id:string;metric:string;period_start:string;period_end:string;duration:string;value:string;unit:string;basis:string;formula_version:string;inputs:MetricRow['inputs']}
export interface ManifestRole{issuer_id:string;metric:AggMetric;role:'included'|'excluded';reason?:RoleReason}
export interface ManifestCell{metric:AggMetric;duration:AggDuration;period_start:string;status:CellStatus;value_text?:string;missing_reason?:MissingReason;n_members:number;n_with_data:number;n_unresolved:number;unit:string}
export interface AggregateManifest{
 schema:'industry-manifest/2';kind:'aggregate';scheme:Scheme;version:SchemeVersion;code:string;level:number;period_end:string;
 facts_as_of:string;knowledge_date:string;history_class:HistoryClass;method_version:string;config_hash:string;formula_version:string;code_version:string;
 members:ManifestMember[];unresolved:ManifestUnresolved[];member_state_revs:{issuer_id:string;state_rev:number}[];
 facts:ManifestFact[];derived:ManifestDerived[];roles:ManifestRole[];cells:ManifestCell[];warnings:string[];
}
export interface ManifestStore{
 /** Uploads bytes (gzip of canonical JSON) at sha256/<hash>.json.gz, then registers the index row. Idempotent. */
 put(kind:RunKind,canonical:string):Promise<{hash:string;existed:boolean}>;
 get(hash:string):Promise<AggregateManifest>;
 remove(hashes:string[]):Promise<{removed:string[];failed:string[]}>;
}

export interface FreshnessRow{dataset:string;status:'fresh'|'stale'|'error'|'missing';last_ok_at:string|null}

export type IndustryDbErrorCode='membership_conflict'|'membership_overlap'|'same_day_change'|'incomplete_run'|'obsolete_run'|'dependencies_incomplete'|'dependency_regression'|'pairs_mismatch'|'illegal_transition'|'run_not_building'|'fetch_event_payload_changed'|'unknown';
export class IndustryDbError extends Error{constructor(public code:IndustryDbErrorCode,message?:string){super(message??code);this.name='IndustryDbError';}}

export interface IndustryDb{
 // classifications & licences
 upsertClassifications(batch:string,rows:ClassificationRow[]):Promise<{inserted:number;unchanged:number;conflicts:ClassificationRow[]}>;
 classificationTree(scheme:Scheme,version:SchemeVersion):Promise<ClassificationRow[]>;
 setDatasetLicense(key:DatasetKey,status:LicenseStatus,by:string,note:string|null):Promise<void>;
 isDatasetPublic(key:DatasetKey):Promise<boolean>;
 // source records (rpc upsert_industry_source_memberships / record_industry_source_resolution_error)
 upsertSourceMemberships(batch:string,rows:SourceMembershipInput[]):Promise<{inserted:number;superseded:number;duplicates:number;changed:{old_id:string;new_id:string;nullToDate:boolean}[]}>;
 currentSourceMemberships(opts:{l1Code?:string;unresolvedOnly?:boolean}):Promise<SourceMembershipRow[]>;
 recordResolutionError(ids:string[],error:{code:string;at:string;detail?:string}):Promise<number>;
 // memberships (rpc apply_industry_memberships / apply_sic_memberships)
 applyMemberships(batch:string,issuer:string,scheme:Scheme,version:SchemeVersion,rows:MembershipTarget[],sourceIds:string[],resolution:Record<string,unknown>):Promise<ApplyMembershipsResult>;
 applySicMembership(batch:string,issuer:string,observed:string,code:string,provenance:Record<string,unknown>):Promise<'inserted'|'duplicate'|'changed'>;
 /** All rows of the code (any status) whose windows can intersect `on`; callers filter with memberships.ts */
 membershipCandidates(q:{scheme:Scheme;version:SchemeVersion;code:string;level:number;on:string}):Promise<MembershipRow[]>;
 membershipsOfIssuer(issuer:string,q:{scheme?:Scheme;on?:string}):Promise<MembershipRow[]>;
 // observations (rpc begin_industry_fetch_event / retry_industry_fetch_event / apply_observations)
 beginFetchEvent(job:string,params:Record<string,unknown>,batch:string):Promise<string>;
 retryFetchEvent(id:string):Promise<void>;
 applyObservations(kind:'marks',fetchEventId:string,rows:MarkInput[]):Promise<ObservationResult>;
 applyObservations(kind:'official',fetchEventId:string,rows:OfficialInput[]):Promise<ObservationResult>;
 currentMarksOn(tradeDate:string,tickers:string[]):Promise<MarkRow[]>;
 // aggregate runs (rpc create_/stage_/set_*_coverage/activate_/fail_)
 createMetricRun(row:NewMetricRun):Promise<{runId:string;generation:number}>;
 setMetricRunCoverage(run:string,summary:Record<string,unknown>):Promise<void>;
 stageMetricRows(run:string,rows:StagedMetricCell[]):Promise<number>;
 stageRunDependencies(run:string,kind:RunKind,rows:RunDependency[]):Promise<number>;
 activateMetricRun(run:string):Promise<{activatedAt:string}>;
 failRun(kind:RunKind,run:string,reason:string):Promise<void>;
 activeMetricRun(scheme:Scheme,version:SchemeVersion,level:number):Promise<MetricRunRow|null>;
 metricRun(run:string):Promise<MetricRunRow|null>;
 metricRowsOfRun(run:string,filter?:{codes?:string[];metrics?:AggMetric[];periodEnds?:string[];durations?:AggDuration[]}):Promise<MetricCellRow[]>;
 runDependencies(kind:RunKind,run:string):Promise<RunDependency[]>;
 // valuation (read side only in this plan; write RPCs are exercised by integration tests directly)
 activeValuationRun(scheme:Scheme,version:SchemeVersion,level:number):Promise<ValuationRunRow|null>;
 publishedValuations(run:string,filter:{codes?:string[];from?:string;to?:string}):Promise<ValuationCellRow[]>;
 // manifests index (rpc put_industry_manifest / gc_industry_manifest_candidates / delete_industry_manifests)
 registerManifest(hash:string,kind:RunKind,byteLength:number):Promise<boolean>;
 manifestGcCandidates(limit:number):Promise<string[]>;
 deleteManifestIndex(hashes:string[]):Promise<number>;
 pruneRuns(keep:number):Promise<number>;
 // misc
 stateFingerprint(market:'CN'):Promise<{takenAt:string;revs:Map<string,number>}>;
 freshness():Promise<FreshnessRow[]>;
 metricRunVisible(run:string):Promise<boolean>;
 /** Count of current, unresolved source records for the code on `on` known by `knownBy` (spec §5.2 n_unresolved; distinct ts_code) */
 unresolvedCount(q:{code:string;level:number;on:string;knownBy:string}):Promise<number>;
 unresolvedOf(q:{code:string;level:number;on:string;knownBy:string}):Promise<ManifestUnresolved[]>;
}

/** Dependencies of the orchestrators: injected so unit tests run on memory implementations. */
export interface IndustryDeps{
 tables:import('../db/table-client').TableClient;   // ingest_batches, dq_*, issuers, issuer_securities, stocks_universe
 db:IndustryDb;
 facts:Pick<import('../facts/types').FactsDb,'readFacts'|'filingsOfIssuer'|'scopeAll'>;
 manifests:ManifestStore;
 now:()=>Date;
 codeVersion:string|null;
 tushare?:(api:string,params:Record<string,unknown>,fields:string)=>Promise<{fields:string[];items:unknown[][];has_more:boolean;raw:Uint8Array}>;
 fetch?:typeof fetch;
}
export type {FactRow};
```

契约补充（所有任务遵守）：
- 日期一律 `'YYYY-MM-DD'` 字符串；时刻一律 ISO 字符串（数据库 `timestamptz` 读出后 `new Date(x).toISOString()`）。数值一律规范十进制字符串（计划二 `canonicalDecimal`），不经 JS `number`；`market_cap`、比率按计划二 `derive.ts` 的十进制算术（Task 10 导出 `decAdd/decSub/decDiv`——从 `derive.ts` 抽不出的就在 `src/lib/industry/decimal.ts` 复制同样的 `Dec` 算术与 `RATIO_SCALE=10` 舍入，不改 `derive.ts`）。
- `cell_key`：聚合 `'<code>:<period_end>'`；估值 `'<code>:<trade_date>'`。
- 数据集键：`schemeDatasetKey(scheme,version)='scheme:'+scheme+':'+version`。
- 错误映射：SQL `raise exception '<code>'`（如 `membership_overlap`）→ `IndustryDbError(code)`；`23P01` → `membership_overlap`；`42501` → `IndustryDbError('unknown','permission_denied')`（测试按 SQLSTATE 断言）。
- `IndustryDeps.tushare` 返回已用计划二 `decodeColumns` 无损解码前的原始列与行，适配器自己按字段 schema 解码；缺省 `tushareCallRaw` 包装（Task 5）。


---

## 规格覆盖表

| 规格条目 | 任务 |
|---|---|
| §4.1 数据集与默认授权；§4.8 授权门；§16 A/F | Task 1（授权行、策略）、2（`industry_dataset_is_public` 等）、3（`licenses.ts`）、15/16（路由、admin 开关） |
| §4.2 分类加载 | Task 7（申万，合成夹具）、9（SIC 码表） |
| §4.3 迁移全部对象（含估值表/函数、V1/V2/V7/V8） | Task 1、2 |
| §4.4 来源记录、解析、纠正路径；§4.5 `apply_industry_memberships` | Task 2（SQL）、7、8 |
| §4.4 SIC | Task 9 |
| §4.6 时点成分估计对象、`history_class` | Task 8（纯函数）、12（run 的 `history_class`） |
| §4.7 A 股全宇宙发行人装载 | Task 5 |
| §4.9 `IndustryDb` 三实现 | Task 3、4 |
| §4.10 行业事实宇宙（V3/V4）、就绪门 | Task 6、12 |
| §5.1–5.2 整体法指标、期望网格、阈值、`n_unresolved` | Task 10 |
| §5.3 清单、内容寻址、`replayFromManifest`、GC | Task 11 |
| §5.4 运行、复用、依赖、激活 | Task 12 |
| §5.5 回放 original/recompute | Task 15（路由）、11（纯函数） |
| §6.1 标记采集（观测版本化、回执 V7、规则） | Task 2（SQL）、13 |
| §6.2–6.5 官方值、自算估值、门控、分位 | **不实施**（核对项 1/2；表与函数由 Task 1/2 落地并测试；页面"估值未启用"态由 Task 18/19 渲染） |
| §7.1 F4 输入适配；§7.2 判断展示 | Task 19（`judgment-input.ts`、`JudgmentArea` + flag） |
| §8 页面（画布）；§12 i18n | Task 17、18、19 |
| §9 读接口（公共、admin、cron） | Task 15、16 |
| §10 调度与脚本 | Task 16（只把 `memberships-sic` 放进 `vercel.json`；其余脚本/手动，见 owner 默认） |
| §11 错误处理 | 各任务；Task 20 runbook 汇总 |
| §13.1 单元 | 各任务 |
| §13.2 数据库测试 | Task 1、2、4 |
| §13.3 离线集成 | Task 14（估值部分除外） |
| §13.4 黄金断言 | 不实施（需 owner 抄录）；Task 20 runbook 记待办 |
| §13.5 E2E | Task 20 |
| §18 实施记录 | Task 20 |

## 执行顺序

| 序 | 任务 | 计划部分 | 依赖 |
|---|---|---|---|
| 1 | Task 1 迁移一（表、约束、策略、表权限、桶、授权行、weekly）+ 锁 + types + `freshness.ts` + `industry.integration.test.ts` | A | — |
| 2 | Task 2 迁移二（全部函数、触发器、函数权限）+ 锁 + `functions.integration.test.ts`（函数/触发器/权限/并发） | A | 1 |
| 3 | Task 3 `types.ts`、`IndustryDb`、`licenses.ts`、`memoryIndustryDb`、`db-contract.ts`、`supabaseIndustryDb` | A | 2 |
| 4 | Task 4 `pgIndustryDb` + 真实库契约（并入 `functions.integration.test.ts`） | A | 3 |
| 5 | Task 5 Tushare 行业适配器（含 `stock_basic`）+ `load-a-share.ts` + 合成夹具 | B | 3 |
| 6 | Task 6 `facts-scope.ts` + `scope.ts` INDUSTRY 块 | B | 3 |
| 7 | Task 7 申万分类 + 来源记录（`classifications.ts`、`source-memberships.ts`）+ 合成夹具 | B | 5 |
| 8 | Task 8 `memberships.ts`（纯时点查询）+ `resolve-memberships.ts` | B | 7 |
| 9 | Task 9 SIC（`providers/sec-sic.ts`、`sic.ts`、录制夹具） | B | 3 |
| 10 | Task 10 `method.ts` + `decimal.ts` + `aggregate.ts`（纯） | C | 3、8 |
| 11 | Task 11 `canonical-json.ts`、`manifest.ts`、`replay.ts` | C | 10 |
| 12 | Task 12 `run-aggregation.ts`（编排） | C | 11、6 |
| 13 | Task 13 `marks.ts` + `daily_basic` 合成夹具 | C | 5 |
| 14 | Task 14 `sync.integration.test.ts`（离线集成，critical） | C | 12、13、8、4 |
| 15 | Task 15 读模型 `read.ts` + 公共路由（含 replay、entities） | D | 12 |
| 16 | Task 16 `jobs.ts`、admin 路由、cron 路由、三个脚本、`vercel.json` | D | 15、13、9 |
| 17 | Task 17 i18n 域 + 共享组件（抽屉、覆盖格、新鲜度、徽标、热力图、序列图） | D | 15 |
| 18 | Task 18 列表页 + `/intel` 入口卡 | D | 17 |
| 19 | Task 19 详情页、成分页、判断区（flag）、`judgment-input.ts`、股票页所属行业行 | D | 18 |
| 20 | Task 20 E2E、runbook、规格 §18、全量门禁 | D | 全部 |

任何任务都不得修改比它晚执行的任务创建的文件；共享契约（`types.ts`）只能由 Task 3 落地，之后若需增改，必须同时改本计划的共享契约节并在实施记录写明。

---

<!-- TASKS: Part A (Task 1–4), Part B (Task 5–9), Part C (Task 10–14), Part D (Task 15–20) are inserted below by the integrator -->

