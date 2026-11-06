# 数据底座四 · F4 判断层框架 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-judgment-framework-design.md`（第 6 稿；Codex 第五轮处方已实施，见 `docs/audits/2026-11-04-judgment-framework/03-disposition.md` 第五轮节）：公共判断表家族（八表 + RPC + 按 `publishable` 的 RLS）、方法注册表与 `formula_hash`、冻结输入的登记与回放、结算队列与三个 resolver、校准与显示门控、读接口与 UI、首批生产者 `macro_regime@v1`（夹具对接宏观接口）与 `recommendation_call@v1`（私有只读适配器）。

**Architecture:** 一个迁移 `20261109150000_judgments.sql` 建八表、触发器、RLS、全部 §5.6 函数；`src/lib/judgments/db.ts` 的 `JudgmentsDb` 契约有 Supabase（rpc）/ 内存 / pg 三实现；`JudgmentInputsDb` 只走 anon 公共读路径与 K 线适配器；登记、回放、结算、校准、显示全是依赖注入的纯核心 + 薄路由；宏观工作台尚不存在，F4 定义 `MacroReadApi` 接口并用夹具实现。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`tsx` 脚本、`ajv` 8（条件参数 schema）。计划一的 `TableClient`、`startBatch/finishBatch`、`quarantine()`、`recordAttempt` 用于批次 / 隔离 / 新鲜度；计划二的 `FactsDb.readFacts`、`deriveMetrics` 用于事实输入与结算。

实施按 owner 规则：Opus 5.5 指挥，**Sonnet 5.5 子代理逐任务写代码**，每个任务经 Opus 规格复审、质量复审与 Codex（gpt-6-astra，medium）审计；记录写 `docs/audits/2026-11-06-judgment-framework/implementation-log.md`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/judgment-framework-50f9e1`。不要 `cd` 出去；不要用裸 `git stash`（栈与其他工作树共享）。
- **并行工作树协调**（计划三、F3 文档、F6 评测、行业研究在别的工作树里同时开发）：
  - 只拥有 `src/lib/judgments/**`、`src/app/api/judgments/**`、`src/app/api/methodologies/**`、`src/app/api/admin/judgments/**`、`src/app/api/cron/judgments-*/**`、`src/components/judgments/**`、`src/app/(app)/intel/methods/**`、`src/app/(app)/admin/judgments/**`、`scripts/judgments/**`、`docs/methodologies/**`、`fixtures/judgments/**`、`messages/{zh,en}/judgments.json`、`src/lib/dq/judgments-resolver.ts`。
  - **不得修改** `src/lib/facts/*`、`src/lib/entities/*`、其他模块目录。
  - 共享文件的改动放进 `// F4` … `// /F4` 注释围栏（SQL 用 `-- F4`；JSON 无注释的 `vercel.json` 只追加条目，不改已有条目）：`src/lib/dq/batches.ts`、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`（`criticalSuites`）、`vercel.json`、`src/i18n/request.ts`（`MESSAGE_DOMAINS`）、`src/app/api/admin/dq/quarantine/[id]/route.ts`、`src/lib/data/sources/eastmoney.ts`、`src/lib/data/sources/datagateway.ts`、`src/lib/research/s4/ledger.ts`（只把 uuid 格式化换成 `uuidV8()` 调用）、`src/app/api/analyst/book/route.ts`、`src/app/api/analyst/recommendations/route.ts`、`src/app/(app)/analyst/**` 中改动的文件。
  - 迁移时间戳只能是 `20261109HHMMSS_*`；本计划只建一个：`supabase/migrations/20261109150000_judgments.sql`。
- **迁移**：可重放（`create table if not exists`、`create or replace function`、`drop policy if exists` 后 `create policy`、`drop trigger if exists` 后 `create trigger`）。`supabase/migrations.lock.json` 只在 **Task 22** 追加 `{file, sha256}`（已锁文件不可再改；`scripts/ci/research-checks.ts::migrationInventory` 只要求未锁迁移的时间戳晚于已锁最新 `20261106090000`，所以开发期间不锁）。本地 harness 只建了 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)`：迁移里桶只能 `insert into storage.buckets … on conflict (id) do update`，不得引用 `storage.objects`。
- **托管 PostgreSQL 17，`postgres` 非超级用户**：`security definer` 函数 owner 即迁移角色；函数 `set search_path = ''`，函数体内一律写全限定名（`public.judgments`、`pg_catalog.now()`）；不要 `alter function … owner to`。Supabase 默认给 `anon/authenticated` 新函数 EXECUTE：每个函数后显式 `revoke execute on function … from public, anon, authenticated` 再按组 `grant`。
- **`test:db`**（`scripts/ci/research-db.ts`）启动本地 PostgreSQL 17、按序执行全部迁移再跑 vitest；集成测试用 `process.env.S4_TEST_STATE` 读 `adminUrl`，`describe.skipIf(!enabled)`。**任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 都必须加进 `criticalSuites`**，否则 `test:db` 报 "Database suite inventory drift"。重放迁移用 `src/lib/facts/facts.integration.test.ts` 里的 `replayMigration` 写法（复制，不 import）。角色测试：本地 harness 建有 `anon`、`authenticated`、`service_role` 角色，用 `set local role anon` 在事务内切换（照 `src/lib/facts/facts.integration.test.ts` 的 RLS 用例写法）。
- **单文件数据库测试**：`.claude/scratch/db-one.ts`（未提交；内容见交接文档 §5），`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts <file>`。`LC_ALL=C` 只给 `test:db`/`test:migrations`/`db-one`，不要导出给 `npm test`。
- **命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`npm run test:db`、`npm run test:migrations`、`npm run build`（Task 21/22）。
- **提交**：`git commit` 单独一条命令（仓库钩子拦截同一命令里任何 `-n` 记号，含 `grep -n`、`head -n`）；不 `--no-verify`；信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施者用自己的模型名）。
- **客户端**：管理员门禁 `requireAdminUser()`（`src/lib/admin/auth.ts`）；服务端写 `getAdminSupabase()`（`src/lib/supabase/admin.ts`）；公共读 `getAnonSupabase()`（`src/lib/supabase/anon.ts`，RLS 生效）。新 RPC **不登记**到 `database.types.ts` 的 `Functions`：调用处 `(client.rpc as unknown as RpcFn)('name', args)`，`RpcFn` 在 `src/lib/judgments/db.ts` 定义（Task 4）。
- **内容寻址**：`canonicalize` / `digest` / `sha256` 来自 `src/lib/research/ingest/pa-v1/json.js`（RFC 8785，`digest = sha256(canonicalize(v))`，hex）；F4 只经 `src/lib/judgments/canonical.ts` 包装调用（Task 1）。
- **代码风格**：沿用 `src/lib/dq`、`src/lib/facts` 的紧凑风格（单空格缩进、少空行、分号）；每个新文件顶部一段注释说明职责与规格条目（`spec §x.y`）。React 组件沿用 `src/components` 现有风格（两空格缩进、`'use client'` 仅在需要时）。
- **环境变量**：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`、`VERCEL_GIT_COMMIT_SHA`（缺省用 `git rev-parse HEAD` 的脚本版本；见 Task 14 `resolveCodeVersion`）、DataGateway 配置沿用 `datagatewayConfig()`。
- **owner 默认值（规格 §17，本计划取默认，PR 里列为假设）**：O1 首批 = `macro_regime@v1` + `recommendation_call@v1`，不接 `decisions`；O2 `threshold_n=100`、`ece_max=0.10`、`window_years=3`；O3 宏观标签 = 同函数截止 vintage 重算，`macro_regime_asset_pair` 不实现；O4 `trading_sessions` 用 K 线序号；O5 `/analyst` 信心列改带状 + 自评，不建私有结算证据表；O6 未验证复权的市场 `void(adjustment_unsupported)`；O7 补登记不恢复前瞻资格；所有方法 `publishable=false`（许可未确认）。
- **宏观工作台不存在**：`macro_observations / macro_snapshots / regime.ts` 都不在仓库里。F4 在 `src/lib/judgments/macro-api.ts` 定义 `MacroReadApi`（规格 §12.1）与 `fixtureMacroReadApi(fixture)`；生产装配（Task 14 `deps.ts`）在宏观模块落地前用 `unavailableMacroReadApi()`（每个方法抛 `MacroUnavailable`，结算 → `Unavailable(macro_unavailable)`；补偿扫描 → 跳过并写信息码 `macro_unavailable`）。`macro_regime@v1` 的 `regime.ts` 依赖由夹具里的 `classify` 函数替身表达，方法 `status='draft'`（Task 19 说明）。

## 文件结构

```
supabase/migrations/20261109150000_judgments.sql   八表 + 触发器 + RLS + 桶 + §5.6 全部函数（Task 2 建表/触发器/RLS；Task 3 函数）
supabase/migrations.lock.json                      + 1 条（Task 22）
src/lib/supabase/database.types.ts                 // F4 块：八个 Row/Insert/Update（Task 2）
scripts/ci/research-checks.ts                      // F4 块：criticalSuites += judgments.integration、judgments-db.integration、settle.integration（Task 2、4、14）
src/lib/research/ingest/pa-v1/uuid-v8.ts           uuidV8(hex64)（Task 1；ledger.ts 改调它）
src/lib/judgments/types.ts                         共享契约（本文件 §共享契约 原样落地；Task 1）
src/lib/judgments/canonical.ts                     canonicalize/digest/sha256 包装 + inputsHash（Task 1）
src/lib/judgments/errors.ts                        JudgmentError + JudgmentErrorCode（Task 1）
src/lib/judgments/contract.ts                      validateSubject / validateClaim / validateHorizon / isAbstained / judgmentIdOf（Task 1）
src/lib/judgments/job-keys.ts                      jobKey()（Task 1）
src/lib/judgments/markets.ts                       factsMarketOf / priceMarketOf / isPriceMarket（Task 1）
src/lib/judgments/time.ts                          EXCHANGE_CLOSE / closeInstantUtc / endOfUtcDay / addDaysIso / addMonthsPeriod / monthEndIso（Task 1）
src/lib/judgments/settlement-digest.ts             operationDigest()（Task 1）
src/lib/judgments/db.ts                            JudgmentsDb 接口 re-export + supabaseJudgmentsDb + 行归一（Task 4）
src/lib/judgments/memory-judgments-db.ts           memoryJudgmentsDb()（复刻触发器与 RPC 语义；Task 4）
src/lib/judgments/db-contract.ts                   内存与 pg 共用契约用例 judgmentsDbContract（非测试文件；Task 4）
src/lib/judgments/pg-judgments-db.ts               pgJudgmentsDb(pool)（集成测试用；Task 4）
src/lib/judgments/judgments.integration.test.ts    迁移/触发器/RLS/函数（critical；Task 2、3）
src/lib/judgments/judgments-db.integration.test.ts pg 契约 + 并发（critical；Task 4）
src/lib/dq/batches.ts                              // F4 块：deferred 计数器 + INFO_CODES（Task 5）
src/lib/judgments/origins.ts                       ORIGINS 冻结表 + originFor()（Task 6）
src/lib/judgments/facts-derive.ts                  deriveMetricsAsOf()（Task 6）
src/lib/judgments/macro-api.ts                     MacroReadApi 接口 + fixtureMacroReadApi + unavailableMacroReadApi（Task 6）
src/lib/judgments/inputs-db.ts                     anonJudgmentInputsDb(deps) + memoryJudgmentInputsDb(fixture)（Task 6；kline 在 Task 7 补全）
src/lib/data/sources/eastmoney.ts, datagateway.ts  // F4 块：endDate 选项（Task 7）
src/lib/judgments/kline.ts                         readKlineRange()（[from,to] 含两端，分页，序列校验；Task 7）
src/lib/judgments/resolvers/price-capabilities.ts  冻结能力表（Task 7）
scripts/judgments/verify-adjustment.ts             复权能力验证程序（录制 + 判定；Task 7）
fixtures/judgments/kline/*.json                    录制夹具（Task 7）
src/lib/judgments/inputs.ts                        buildInput / rebuildAndCompare / inputsHashOf（Task 8）
src/lib/judgments/methodologies/types.ts           Methodology 接口（= 共享契约，再导出；Task 9）
src/lib/judgments/target.ts                        defaultResolveTarget / settleWindow / retrospectiveOf（Task 9）
src/lib/judgments/registry.ts                      REGISTRY（方法模块列表）+ methodologyRowOf()（Task 9）
src/lib/judgments/formula-hash.ts                  importClosure / implementationSha256 / depsSha256 / formulaHashOf（Task 9）
scripts/judgments/sync-methodologies.ts            同步脚本（Task 9）
docs/methodologies/README.md                       方法文档模板（§4.2 固定章节；Task 9）
src/lib/judgments/register.ts                      registerJudgment()（Task 10）
src/lib/judgments/produce.ts                       produce()（Task 10）
src/lib/judgments/resolvers/index.ts               RESOLVERS 表 + resolverFor()（Task 11）
src/lib/judgments/resolvers/price.ts               priceReturnResolver（Task 11）
src/lib/judgments/resolvers/facts.ts               factMetricResolver（Task 11）
src/lib/judgments/resolvers/macro.ts               macroRegimeReplayResolver（Task 11）
src/lib/judgments/resolvers/schemas.ts             ajv 参数 schema（Task 11）
src/lib/judgments/settle.ts                        runSettle() / settleOne() / decide()（Task 12）
src/lib/judgments/compensate.ts                    compensateMacro()（§7.1 步骤 0；Task 12）
src/lib/judgments/replay.ts                        replayJudgment()（Task 13）
scripts/judgments/replay.ts                        CLI（Task 13）
fixtures/judgments/replay/*.json                   回放黄金夹具（Task 13 合成 fact_metric；Task 19 宏观；Task 20 私有）
src/lib/judgments/testing/synthetic-method.ts      测试专用方法 synthetic_fact_metric@v1（不进 REGISTRY；Task 13）
src/lib/judgments/deps.ts                          productionJudgmentDeps / resolveCodeVersion（Task 14）
src/lib/dq/judgments-resolver.ts                   resolveJudgmentsItem（隔离钩子；Task 14）
src/app/api/admin/dq/quarantine/[id]/route.ts      // F4 块：judgments.* 分支（Task 14）
src/app/api/cron/judgments-settle/route.ts         cron（Task 14）
scripts/judgments/settle.ts                        脚本（Task 14）
src/lib/judgments/settle.integration.test.ts       离线集成（critical；Task 14）
vercel.json                                        + judgments-settle（Task 14）、judgments-calibrate（Task 16）
src/lib/judgments/calibration.ts                   纯数学（Task 15）
src/lib/judgments/calibrate.ts                     runCalibrate()（工作单元续跑；Task 16）
src/lib/judgments/cohort-store.ts                  CohortStore 接口 + supabase/memory 实现（桶 judgments-calibration；Task 16）
src/app/api/cron/judgments-calibrate/route.ts      cron（Task 16）
scripts/judgments/calibrate.ts                     脚本（Task 16）
src/lib/judgments/display.ts                       toCard / lifecycleOf / calibrationStateOf / derivedOdds（Task 17）
messages/zh/judgments.json, messages/en/judgments.json   文案（Task 17）
src/i18n/request.ts                                // F4 块：MESSAGE_DOMAINS += 'judgments'（Task 17）
src/lib/judgments/route-utils.ts                   参数 / 缓存头 / 错误响应（Task 18）
src/app/api/judgments/route.ts, [id]/route.ts, [id]/history/route.ts       （Task 18）
src/app/api/methodologies/route.ts, [id]/[version]/route.ts, [id]/[version]/calibration/route.ts   （Task 18）
src/app/api/admin/judgments/[id]/{withdraw,reopen,settle}/route.ts         （Task 18）
src/app/api/admin/judgments/queue/route.ts         队列读（/admin/judgments 用；Task 18）
src/lib/judgments/methodologies/macro-regime.v1.ts macro_regime@v1（Task 19）
docs/methodologies/macro_regime/v1.md              公式文档（Task 19）
fixtures/judgments/macro/*.json                    宏观夹具（Task 19）
src/lib/judgments/adapters/recommendation.ts       toJudgmentCard / selfAssessment（Task 20）
src/app/api/analyst/book/route.ts, recommendations/route.ts   // F4 块（Task 20）
src/app/(app)/analyst/…                            信心列带状 + 自评区块（Task 20）
src/components/judgments/{JudgmentCard,InputsDrawer,SettlementTimeline,CalibrationBadge,ReliabilityTable}.tsx   （Task 21）
src/app/(app)/intel/methods/page.tsx, [id]/[version]/page.tsx              （Task 21）
src/app/(app)/admin/judgments/page.tsx                                     （Task 21）
docs/runbooks/judgments.md                         运行手册（Task 22）
docs/audits/2026-11-06-judgment-framework/implementation-log.md            实施记录（Task 1 创建，每任务追加）
docs/superpowers/specs/2026-11-04-judgment-framework-design.md             §19 实施记录与偏差（Task 22）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/judgments/types.ts` 原样落地，Task 1）

```ts
// src/lib/judgments/types.ts
// Shared contract of the judgment layer (plan F4 §共享契约; spec §3–§5.7, §7.2, §9). Every task uses
// these names verbatim. JudgmentsDb has three implementations: supabaseJudgmentsDb (db.ts, rpc),
// memoryJudgmentsDb (memory-judgments-db.ts, unit tests), pgJudgmentsDb (pg-judgments-db.ts, integration tests).
import type {KlineSourceName,SourceKlineSeries} from '@/lib/data/kline/types';
import type {FactRow,MetricRow,ReadFactsResult,FilingRow} from '@/lib/facts/types';

// ── markets (spec §3.3 S06) ──
export type FactsMarket='US'|'CN';
export type PriceMarket='A'|'HK'|'US';
export type Adjustment='qfq'|'hfq';

// ── subject (spec §3.1) ──
export type SubjectType='issuer'|'industry'|'macro_region'|'macro_series'|'security'|'document';
export const PUBLIC_SUBJECT_TYPES=['issuer','industry','macro_region','macro_series'] as const;
export type PublicSubjectType=typeof PUBLIC_SUBJECT_TYPES[number];
export interface Subject{type:SubjectType;key:string}

// ── kinds, producers, types (spec §3.2, §3.6, §4.3) ──
export type Kind='probability'|'categorical'|'score'|'interval';
export type ProducerKind='rule'|'model'|'human'|'third_party';
export const PUBLIC_PRODUCER_KINDS=['rule','model'] as const;
export type JudgmentType='macro_regime'|'macro_regime_asset_pair'|'recommendation_call'|'industry_lifecycle_stage'|'industry_prosperity'|'valuation_verdict'|'thesis_win_rate'|'return_range'|'sellside_rating'|'sellside_target_price'|'synthetic_fact_metric';
export interface Bilingual{zh:string;en:string}

// ── claims (spec §3.2) ──
export interface ProbabilityClaim{p:number;event:Bilingual}
export interface CategoricalClaim{selected:string;classes:string[];distribution?:Record<string,number>;scores_are_not_probabilities:boolean;margin_pp?:number;catalog_version?:string}
export interface ScoreDim{id:string;value:number|null;weight:number;coverage:boolean}
export interface ScoreClaim{value:number;scale:{min:number;max:number};dims:ScoreDim[];coverage:number;realized_metric:string}
export interface Scenario{label:string;p:number;value:number}
export interface IntervalClaim{metric:string;low:number;high:number;unit:string;nominal_coverage:number;scenarios?:Scenario[];scenario_event_hash?:string}
export type Claim=ProbabilityClaim|CategoricalClaim|ScoreClaim|IntervalClaim;
export interface Abstained{abstained:true;reason:string;missing?:string[]}

// ── conditions (spec §3.3) ──
export type NumOp='>'|'>='|'<'|'<='|'between';
export interface NumPredicate{op:NumOp;rhs:number|[number,number]}
export type Regime='recovery'|'overheat'|'stagflation'|'recession';
export interface PriceReturnParams{ticker:string;market:PriceMarket;adjustment:Adjustment;source:KlineSourceName;base_date:string;benchmark?:{ticker:string;market:PriceMarket}}
export interface FactMetricParams{issuer_id:string;market:FactsMarket;metric:string;period_start:string;period_end:string;duration:string;unit:string;input_unit:string;basis:string;formula_version:string;compare:'value'|'yoy'}
export interface MacroRegimeReplayParams{region:'US'|'CN';reference_period:string;macro_methodology_version:string;catalog_version:string}
export type Condition=
 |{resolver:'price_return';params:PriceReturnParams;predicate:NumPredicate;text:Bilingual}
 |{resolver:'fact_metric';params:FactMetricParams;predicate:NumPredicate;text:Bilingual}
 |{resolver:'macro_regime_replay';params:MacroRegimeReplayParams;predicate:{op:'eq';rhs:Regime};text:Bilingual}
 |{resolver:'industry_aggregate';params:Record<string,string|number>;predicate:NumPredicate|{op:'eq';rhs:string};text:Bilingual}
 |{resolver:'recommendation_hit';params:{recommendation_id:string};predicate:{op:'eq';rhs:true};text:Bilingual};
export type ResolverName=Condition['resolver'];
export const PUBLIC_RESOLVERS=['price_return','fact_metric','macro_regime_replay','industry_aggregate'] as const;

// ── horizon / target / label policy (spec §3.4) ──
export interface Horizon{unit:'trading_sessions'|'calendar_days'|'calendar_months'|'fiscal_quarters';n:number}
export type Target=
 |{kind:'session_index';base_date:string;n:number}
 |{kind:'date';date:string}
 |{kind:'period';period:string}
 |{kind:'fiscal_period';period_end:string;calendar:{anchor_period_end:string;months:3};extrapolated:boolean};
export type LabelPolicy='first_observed'|'cutoff_vintage';

// ── inputs (spec §3.5) ──
export interface Origin{publisher:string;adapter:string;locator:string;transform?:string;license_status:'unverified'|'confirmed'}
export interface InputRef<K extends string,R,S>{kind:K;ref:R;snapshot:S;hash:string;available_at:string;origin:Origin}
export interface FactProjection{fact_id:string;issuer_id:string;market:FactsMarket;concept:string;period_start:string|null;period_end:string;duration:string;value_text:string;unit:string;consolidation:string;available_date:string;filing_id:string;mapping_gen:number}
/** Every FactRow field the derive kernel reads (spec §3.5 S04); value is restored from value_text. */
export interface DerivationRow extends FactProjection{status:string;created_at:string;disclosure_seq:number|null;is_current:boolean|null;is_revision:boolean|null}
export interface MetricKey{issuer_id:string;market:FactsMarket;metric:string;period_start:string;period_end:string;input_unit:string;basis:string;formula_version:string}
export interface MetricSnapshot extends MetricKey{value_text:string;unit:string;duration:string;as_of:string;based_on_rev:number;lineage:MetricRow['inputs'];derivation:{formula_version:string;as_of:string;state_rev:number;rows:DerivationRow[]}}
export interface MacroObservationSnapshot{series_id:string;period_end:string;value:number;unit:string;vintage_id:string;available_at:string}
export interface MacroSnapshotSnapshot{snapshot_id:string;region:'US'|'CN';as_of:string;methodology_version:string;catalog_version:string;observation_ids:string[];primary_state:Regime|null;secondary_state:Regime|null;scores:Record<Regime,number>;norm:Record<Regime,number>;coverage:number;margin_pp:number|null;growth_axis:number|null;inflation_axis:number|null}
export interface PriceBarSnapshot{ticker:string;market:PriceMarket;date:string;source:KlineSourceName;adjustment:Adjustment;open:number|null;high:number|null;low:number|null;close:number;volume:number|null;amount:number|null;fields_present:string[]}
export const PUBLIC_TABLES=['issuer_industry_memberships','industry_classifications','macro_series'] as const;
export type PublicTable=typeof PUBLIC_TABLES[number];
export type Input=
 |InputRef<'financial_fact',{fact_id:string},FactProjection>
 |InputRef<'financial_metric',MetricKey,MetricSnapshot>
 |InputRef<'macro_observation',{series_id:string;period_end:string;vintage_id:string},MacroObservationSnapshot>
 |InputRef<'macro_snapshot',{snapshot_id:string},MacroSnapshotSnapshot>
 |InputRef<'price_bar',{ticker:string;market:PriceMarket;date:string;source:KlineSourceName;adjustment:Adjustment},PriceBarSnapshot>
 |InputRef<'table_rows',{table:PublicTable;natural_key:string},{table:PublicTable;natural_key:string;rows:Record<string,unknown>[]}>
 |InputRef<'judgment',{judgment_id:string},{judgment_id:string;claim:Claim;as_of:string}>
 |InputRef<'legacy_fill',{recommendation_id:string},{recommendation_id:string;fill_price:number;fill_date:string;market:PriceMarket;ticker:string}>
 |InputRef<'document_span',Record<string,string>,Record<string,unknown>>;
export type InputKind=Input['kind'];
export const PUBLIC_INPUT_KINDS=['financial_fact','financial_metric','macro_observation','macro_snapshot','price_bar','table_rows','judgment'] as const;

// ── producer (spec §3.6) ──
export type ProducerRef=Record<string,never>|{model:string;prompt_sha256:string;run_id:string}|{analyst_id:string;source_record:{table:string;id:string}}|{institution:string;document_id:string;version_hash:string};

// ── rows (spec §5.1–§5.5b) ──
export type MethodologyStatus='draft'|'active'|'retired';
export interface MethodologyRow{methodology_id:string;version:string;judgment_type:JudgmentType;kind:Kind;producer_kind:ProducerKind;subject_types:SubjectType[];input_kinds:InputKind[];markets:PriceMarket[]|null;title_zh:string;title_en:string;doc_path:string;doc_sha256:string;implementation_sha256:string;params:Record<string,number|string>;params_json:Record<string,unknown>;horizon:Horizon;upstream:Record<string,string>;deps_sha256:string;formula_hash:string;status:MethodologyStatus;publishable:boolean;code_version:string;created_at:string;synced_at:string}
export type MethodologyEventKind='registered'|'status_changed'|'publishable_changed'|'resynced';
export interface MethodologyEvent{event_id:string;methodology_id:string;version:string;seq:number;event:MethodologyEventKind;status:MethodologyStatus;publishable:boolean;formula_hash:string;code_version:string;actor:string;reason:string|null;occurred_at:string}
export interface JudgmentRow{judgment_id:string;subject_type:PublicSubjectType;subject_key:string;judgment_type:JudgmentType;methodology_id:string;methodology_version:string;kind:Kind;producer_kind:'rule'|'model';producer_ref:ProducerRef;producer_nonce:string;as_of:string;registered_at:string;retrospective:boolean;inputs:Input[];inputs_hash:string;abstained:boolean;abstain_reason:string|null;claim:Claim|null;condition:Condition|null;horizon:Horizon|null;target:Target|null;label_policy:LabelPolicy|null;settle_after:string|null;settle_by:string|null;code_version:string;batch_id:string;created_at:string}
/** register_judgment input: registered_at/retrospective/created_at are set by the RPC (spec §5.6). */
export type JudgmentInsert=Omit<JudgmentRow,'registered_at'|'retrospective'|'created_at'>&{retrospective_hint:{label_available_at:string|null}};
export type SettlementKind='settled'|'void'|'withdrawn'|'reopened';
export interface Realized{value:number|string|boolean;label?:string;unit:string|null;from:string|null;to:string|null;label_policy:LabelPolicy}
export interface SettlementRow{settlement_id:string;judgment_id:string;seq:number;kind:SettlementKind;outcome:'hit'|'miss'|null;realized:Realized|null;evidence:Record<string,unknown>;resolver:string;resolver_version:string;reason:string|null;actor:string;settled_at:string;request_key:string;request_digest:string;code_version:string;batch_id:string}
/** append_settlement payload; the RPC assigns settlement_id/seq/settled_at (spec §5.6). */
export type SettlementInsert=Pick<SettlementRow,'kind'|'outcome'|'realized'|'evidence'|'resolver'|'resolver_version'|'reason'|'actor'|'code_version'|'batch_id'>;
export type QueueStatus='pending'|'unavailable'|'inconsistent'|'error';
export interface QuarantineOverride{reason_code:string;resolution:{kind:'accept_refetched';evidence_hash:string;evidence:Record<string,unknown>}|{kind:'choose_fact';chosen:Record<string,unknown>};evidence_hash:string;resolved_by:string;at:string}
export interface QueueRow{judgment_id:string;settle_after:string;settle_by:string;label_policy:LabelPolicy;next_attempt_at:string;attempts:number;last_status:QueueStatus|null;last_detail:Record<string,unknown>;leased_until:string|null;lease_token:string|null;override:QuarantineOverride|null;closed_at:string|null;updated_at:string}
export interface QueuePatch{last_status:QueueStatus;last_detail:Record<string,unknown>;next_attempt_at:string;attempts_increment:0|1}
export type CalibrationState='insufficient'|'failed'|'calibrated'|'evaluated'|'self_assessed';
export type ScopeType='all'|'market'|'subject_type';
export interface CalibrationScope{scope_type:ScopeType;scope_key:string}
export interface QueryBounds{window_from:string;window_to:string;registered_at_lte:string;settled_at_lte:string}
export interface CalibrationRow{calibration_id:string;methodology_id:string;methodology_version:string;scope_type:ScopeType;scope_key:string;window_from:string;window_to:string;n_registered:number;n_settled:number;n_independent:number;n_void:number;n_retrospective_excluded:number;threshold_n:number;ece_max:number;kind:Kind;state:Exclude<CalibrationState,'self_assessed'>;valid_until:string;validity_revision:number;metrics:Record<string,unknown>;reliability:ReliabilityBin[];isotonic_segments:{x_min:number;x_max:number;p:number}[]|null;cohort_path:string;cohort_sha256:string;query_bounds:QueryBounds;fingerprint:string;algorithm_version:string;code_version:string;computed_at:string;batch_id:string}
export interface ReliabilityBin{bin_low:number;bin_high:number;n:number;mean_p:number|null;hit_rate:number|null;wilson_low:number|null;wilson_high:number|null}
/** latest_judgment_cards / judgment_history / calibration_cohort* row (spec §5.6 judgment_envelope). */
export interface Envelope{judgment:JudgmentRow;settlement:SettlementRow|null;calibration:CalibrationRow|null;calibration_valid:boolean;methodology_state:MethodologyEvent|null}
export type CardView='latest'|'as_known';
export type AppendStatus='applied'|'already_applied'|'already_final'|'request_key_conflict';

// ── data access (spec §5.7) ──
export interface JudgmentsDb{
 serverTime():Promise<string>;
 methodology(id:string,version:string):Promise<MethodologyRow|null>;
 subjectExists(subject:Subject):Promise<'active'|'inactive'|'missing'>;
 getJudgment(id:string):Promise<JudgmentRow|null>;
 /** Inputs containment lookup (GIN): judgments whose inputs contain {kind:'macro_snapshot',ref:{snapshot_id}} (spec §7.1). */
 judgmentsBySnapshot(snapshotId:string):Promise<string[]>;
 registerJudgment(row:JudgmentInsert,queue:{settle_after:string;settle_by:string;label_policy:LabelPolicy}|null):Promise<{registered_at:string;retrospective:boolean}>;
 latestCards(subject:Subject,opts:{types?:JudgmentType[];view:CardView;cutoff?:string}):Promise<Envelope[]>;
 historyOf(subject:Subject,type:JudgmentType,methodology:{id:string;version:string},opts:{view:CardView;cutoff?:string;before?:string;limit:number}):Promise<Envelope[]>;
 claimDue(limit:number,leaseSeconds:number):Promise<QueueRow[]>;
 releaseLease(judgmentId:string,leaseToken:string,patch:QueuePatch):Promise<void>;
 queueRow(judgmentId:string):Promise<QueueRow|null>;
 queueList(opts:{filter:'due'|'backoff'|'leased'|'all';limit:number;after?:string}):Promise<QueueRow[]>;
 settlementsOf(judgmentIds:string[]):Promise<SettlementRow[]>;
 appendSettlement(judgmentId:string,leaseToken:string|null,requestKey:string,row:SettlementInsert):Promise<{seq:number;status:AppendStatus}>;
 applyQuarantineOverride(judgmentId:string,override:QuarantineOverride,quarantineId:string,audit:Record<string,unknown>):Promise<void>;
 calibrationCohort(methodology:string,version:string,window:{from:string;to:string},cutoff:string,after:string|null,limit:number):Promise<Envelope[]>;
 calibrationCohortInternal(methodology:string,version:string,window:{from:string;to:string},cutoff:string,after:string|null,limit:number):Promise<Envelope[]>;
 latestCalibration(methodology:string,version:string,scope:CalibrationScope):Promise<{row:CalibrationRow;valid:boolean}|null>;
 calibrationValidity(methodology:string,version:string):Promise<{revision:number}>;
 insertCalibration(row:CalibrationRow,expectedRevision:number):Promise<'inserted'|'duplicate'|'stale_revision'>;
 syncMethodology(row:Omit<MethodologyRow,'created_at'|'synced_at'>,actor:string,reason:string|null):Promise<{changed:boolean;seq:number}>;
 listMethodologies(status?:MethodologyStatus):Promise<MethodologyRow[]>;
 methodologyStateAt(id:string,version:string,cutoff:string):Promise<MethodologyEvent|null>;
 jobState(job:string):Promise<{state:Record<string,unknown>;updated_at:string}|null>;
 setJobState(job:string,expectedUpdatedAt:string|null,state:Record<string,unknown>):Promise<boolean>;
 repairStaleBatches(dataset:string,olderThanSeconds:number):Promise<number>;
}

// ── macro read interface (spec §12.1; implemented by the macro workbench later, by fixtures now) ──
export interface RegimeResult{primary_state:Regime;secondary_state:Regime|null;scores:Record<Regime,number>;norm:Record<Regime,number>;coverage:number;margin_pp:number;growth_axis:number|null;inflation_axis:number|null}
export interface MacroSnapshotRow{snapshot_id:string;region:'US'|'CN';as_of:string;methodology_version:string;catalog_version:string;observation_ids:string[];regime:RegimeResult|null;created_at:string;status:'active'|'superseded'|'failed'}
export interface MacroObservationRef{series_id:string;period_end:string;vintage_id:string;value:number;unit:string;available_at:string}
export interface MacroReadApi{
 observation(observationId:string):Promise<MacroObservationRef|null>;
 snapshot(snapshotId:string):Promise<MacroSnapshotRow|null>;
 snapshotsSince(marker:{created_at:string;snapshot_id:string}|null,limit:number):Promise<MacroSnapshotRow[]>;
 seriesCatalog(region:'US'|'CN'):Promise<Record<string,unknown>[]>;
 classifyAsOf(region:'US'|'CN',referencePeriod:string,cutoff:string,macroMethodologyVersion:string):Promise<{regime:RegimeResult|null;observation_refs:MacroObservationRef[];catalog:{version:string;weights:Record<string,number>;rules_version:string}}>;
}

// ── inputs db (spec §5.7) ──
export type KlineFailure={failure:'unsupported'|'empty'|'not_found'|'rate_limited'|'transient'|'protocol'|'invalid_data'|'timeout'};
export interface KlineRangeRequest{ticker:string;market:PriceMarket;adjustment:Adjustment;source:KlineSourceName;from:string;to:string;signal:AbortSignal}
export interface DeriveAsOfResult{metrics:MetricRow[];envelope:ReadFactsResult}
export interface JudgmentInputsDb{
 facts:{readFacts(issuer:string,market:FactsMarket,opts:{concepts:string[];asOf:string;history?:boolean}):Promise<ReadFactsResult>;factsByIds(ids:string[]):Promise<FactRow[]>;filingsOfIssuer(issuer:string,market:FactsMarket,opts:{to?:string;limit?:number}):Promise<FilingRow[]>};
 deriveMetricsAsOf(issuer:string,market:FactsMarket,asOf:string,formulaVersion:string):Promise<DeriveAsOfResult>;
 macro:MacroReadApi;
 tableRows(table:PublicTable,naturalKey:string):Promise<Record<string,unknown>[]>;
 /** Public judgment lookup (anon; publishable only). */
 publicJudgment(id:string):Promise<JudgmentRow|null>;
 kline(req:KlineRangeRequest):Promise<SourceKlineSeries|KlineFailure>;
 issuerPrimarySecurity(issuerId:string,on:string):Promise<{ticker:string;market:PriceMarket}|null>;
}

// ── methodology module (spec §4.1) ──
export type Active<C extends Claim>={abstained:false;claim:C};
export interface WorkItem{subject:Subject;asOf:string;binding?:Record<string,string>}
export interface Methodology<C extends Claim=Claim>{
 id:string;version:string;judgment_type:JudgmentType;kind:Kind;producer_kind:ProducerKind;
 subject_types:SubjectType[];markets?:PriceMarket[];input_kinds:InputKind[];
 upstream?:{macro_methodology_version?:string;facts_formula_version?:string};
 title:Bilingual;doc:string;params:Record<string,number|string>;params_json?:Record<string,unknown>;horizon:Horizon;
 /** Non-import dependencies hashed into formula_hash (data files, rule tables). Paths relative to repo root. */
 deps:string[];
 /** Absolute repo-relative path of this module file (import-closure root for implementation_sha256). */
 module:string;
 status:MethodologyStatus;
 gather(item:WorkItem,db:JudgmentInputsDb):Promise<Input[]|Abstained>;
 resolveTarget(item:WorkItem,inputs:Input[],db:JudgmentInputsDb):Promise<Target|Abstained>;
 compute(subject:Subject,inputs:Input[]):Active<C>|Abstained;
 condition(subject:Subject,inputs:Input[],claim:C):Condition;
}

// ── resolvers (spec §7.2–§7.3) ──
export type ResolverResult=
 |{status:'resolved';value:number|string|boolean;label?:string;unit:string|null;from:string|null;to:string|null;label_available_at:string;evidence:Record<string,unknown>}
 |{status:'pending';reason:string;estimated_at?:string}
 |{status:'unavailable';failure:string}
 |{status:'inconsistent';reason_code:'settlement_basis_mismatch'|'settlement_ambiguous_fact'|'settlement_base_bar_missing'|'settlement_benchmark_gap';detail:Record<string,unknown>;evidence_hash:string;evidence:Record<string,unknown>};
export interface ResolveContext{judgment:JudgmentRow;cutoff:string;now:string;inputsDb:JudgmentInputsDb;signal:AbortSignal}
export interface Resolver{
 name:ResolverName;version:string;
 validateParams(params:unknown):boolean;
 /** Estimated earliest instant the label can be known (spec §3.4 retrospective rule 3); null = unknown. */
 labelAvailableAt(params:unknown,target:Target):string|null;
 /** Worst-case fetch time per judgment, for the cron budget (spec §7.1). */
 maxFetchMs:number;
 resolve(ctx:ResolveContext):Promise<ResolverResult>;
 /** Build the Resolved result from a quarantine override's frozen evidence (spec §7.6); no reads. */
 fromOverride(judgment:JudgmentRow,override:QuarantineOverride):ResolverResult;
}

// ── display (spec §9) ──
export type Lifecycle='abstained'|'open'|'settled'|'void'|'withdrawn'|'pending_fill';
export interface JudgmentCard{
 judgment_id:string;subject:Subject;judgment_type:JudgmentType;kind:Kind;
 lifecycle:Lifecycle;outcome:'hit'|'miss'|null;calibration:CalibrationState;retrospective:boolean;
 as_of:string;registered_at:string;
 methodology:{id:string;version:string;title:Bilingual;href:string};
 display:{headline:Bilingual;percent:number|null;value:number|string|[number,number]|null;scale?:{min:number;max:number};dims?:{id:string;label:Bilingual;value:number|null;coverage:boolean}[];band?:'low'|'mid'|'high';nominal_coverage?:number};
 condition:{text:Bilingual;horizon:Horizon;target:Target;label_policy:LabelPolicy;settle_after:string;settle_by:string}|null;
 settlement:{kind:SettlementKind;outcome:'hit'|'miss'|null;realized:Realized|null;settled_at:string;evidence_summary:Bilingual}|null;
 calibration_summary:{n_independent:number;n_total:number;threshold_n:number;brier:number|null;brier_skill:number|null;ece_raw_holdout:number|null;valid_until:string;hit_rate:{rate:number;low:number|null;high:number|null}|null;accuracy?:number|null;coverage?:number|null;spearman?:number|null;href:string}|null;
 inputs:{kind:InputKind;ref:unknown;available_at:string;origin:Origin;href:string|null}[];
 abstain_reason?:string;missing?:string[];
 merged_from?:string;
}
export interface PrivateJudgmentCard extends JudgmentCard{source:'recommendation'}
```

契约补充（实施者必须遵守）：
- 所有时间戳是 ISO 8601 UTC 字符串（`toISOString()` 形状，毫秒精度）；`as_of`、`*_date`、`period_*` 是 `YYYY-MM-DD`；`period` 是 `YYYY-MM`。
- `JudgmentRow.inputs` 在数据库是 `jsonb`；`inputs_hash = digest(inputs 按 (kind, canonicalize(ref)) 升序后的 [kind, ref, hash] 数组)`（`canonical.ts::inputsHash`）。
- `judgment_id = uuidV8(digest({subject_type, subject_key, judgment_type, methodology_id, methodology_version, as_of, inputs_hash, producer_nonce}))`（`contract.ts::judgmentIdOf`）。
- `JudgmentInsert.retrospective_hint.label_available_at` 是 resolver `labelAvailableAt()` 的结果；`register_judgment` RPC 用它与 `now()` 判定 `retrospective`（规格 §3.4 三条规则在 SQL 里算，因为 `registered_at` 只有数据库知道）。
- `QueuePatch.next_attempt_at` 必须 ≥ 调用时的 `serverTime()`；RPC 把更早的值抬到 `now()`。
- `MacroSnapshotSnapshot.margin_pp` 是百分点（规格 §8.1 G28）。

## 规格覆盖表

| 规格条目 | 任务 |
|---|---|
| §3.1–§3.4 契约、目标、标签政策、retrospective | 1、9 |
| §3.5 输入构造器、origin、lookahead、S04/S05 | 6、7、8 |
| §3.6 nonce、§6.1 id | 1、10 |
| §3.7 时刻语义、S08 | 1 |
| §4 方法注册表、formula_hash、sync | 9 |
| §5.1–§5.5b 表、触发器、RLS | 2 |
| §5.6 函数 | 3 |
| §5.7 JudgmentsDb / JudgmentInputsDb | 4、6、7 |
| §6.2 登记、§6.4 produce | 10 |
| §6.3 回放 + 脚本 + §14.4 夹具 | 13、19、20 |
| §7.1 cron、预算、补偿 | 12、14 |
| §7.2 状态机、§5.4 队列退避 | 12 |
| §7.3 resolvers | 11 |
| §7.4 复权能力表、endDate、close-only | 7、11 |
| §7.5 deferred、INFO_CODES | 5 |
| §7.6 隔离与钩子 | 12、14 |
| §8.1–§8.2、§8.4 数学与门控 | 15 |
| §8.3 校准任务、桶、失效 | 16 |
| §8.5 isotonic 只进报告 | 15 |
| §8.6 私有自评 | 20 |
| §9.1–§9.4 显示、派生赔率 | 17 |
| §9.5–§9.6 UI | 21 |
| §10 读接口 | 18 |
| §11.1 macro_regime@v1 | 19 |
| §11.2 recommendation_call@v1、/analyst | 20 |
| §12.4 合并发行人 | 3、18 |
| §13 错误码 | 1（码表）+ 各任务 |
| §14 测试 | 各任务 |
| §15 验收样例 1–10 | 10、12、14、15、16、2/3、17（Task 22 汇总核对） |
| §19 实施记录 | 22 |

## 执行顺序

| 序 | 任务 | 依赖 | 部分 |
|---|---|---|---|
| 1 | 核心纯模块（types、canonical、errors、contract、job-keys、markets、time、settlement-digest、uuid-v8） | — | A |
| 2 | 迁移 I：八表、触发器、RLS、桶、Row 类型、集成测试 | 1 | A |
| 3 | 迁移 II：§5.6 全部函数 + 集成测试 | 2 | A |
| 4 | `JudgmentsDb` 三实现 + 契约 + pg 并发测试 | 3 | A |
| 5 | `batches.ts` `deferred` 计数器与 `INFO_CODES` | — | A |
| 6 | origins、facts-derive、macro-api、inputs-db（非 K 线） | 1 | B |
| 7 | K 线 `endDate`、`readKlineRange`、能力表、验证程序与夹具 | 6 | B |
| 8 | `inputs.ts` 构造器 | 6、7 | B |
| 9 | 方法接口、target、registry、formula-hash、sync 脚本、文档模板 | 4、8 | B |
| 10 | `register.ts`、`produce.ts` | 9 | B |
| 11 | resolvers | 7、8 | C |
| 12 | `settle.ts`、`compensate.ts` | 5、10、11 | C |
| 13 | `replay.ts` + CLI + 合成方法与夹具 | 10 | B |
| 14 | deps、隔离钩子、cron、脚本、`vercel.json`、离线集成 | 12、13 | C |
| 15 | `calibration.ts` 数学 | 1 | D |
| 16 | `calibrate.ts`、cohort-store、cron、脚本 | 4、15 | D |
| 17 | `display.ts`、i18n | 15 | D |
| 18 | 读接口与 admin 路由 | 4、17 | D |
| 19 | `macro_regime@v1` + 文档 + 夹具 + 回放夹具 | 10、11、13 | E |
| 20 | 私有适配器 + `/analyst` | 13、15、17 | E |
| 21 | UI 组件与页面（按画布） | 17、18 | E |
| 22 | 运行手册、规格 §19、锁迁移、全量门禁 | 全部 | E |

任何任务都不得修改比它晚执行的任务创建的文件；需要时在本任务里写好接口，由后面的任务实现。

---

<!-- TASKS BELOW: Part A (1–5), Part B (6–10, 13), Part C (11–12, 14), Part D (15–18), Part E (19–22) -->
