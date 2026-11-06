# 宏观工作台（P1 + P2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（第 3 稿：Codex 增量审计 M1–M26 与确认轮 §0.2 已处置；§0.2 的规则覆盖正文中与之冲突的旧表述）：宏观目录、原始字节存证与定位、无损十进制观测（FRED 公开 CSV + AKShare 官方主机适配器）、共用 DQ 批次/隔离/新鲜度、事务发布的事实快照、F4 契约的判定结果与 `MacroReadApi`、工作台 UI（判断层默认关闭）、派生事件与周期、冻结输入的关联分析。

**Architecture:** 一个迁移 `20261114090000_macro_workbench.sql` 建十表、私有桶 `macro-raw`、写入/发布/分析三类 `security definer` RPC 与 RLS；`src/lib/macro/db.ts` 的 `MacroDb` 契约有 Supabase（rpc + anon 读）与内存两个实现；采集编排 `ingest.ts` 只依赖注入的 `MacroDb`、`EvidenceStore`、`TableClient`（DQ）；数值只由 TS 解析器从存证字节中取出（Python/AKShare 只抓取、录制原始响应并给出交叉核对值）；判定、事件、周期、相关全是纯函数。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`tsx` 脚本、Python 3.12 + AKShare（只在本机 uv 虚拟环境，非 Vercel 依赖）、`lightweight-charts`（已有）、next-intl。

实施分工（owner 规则）：Opus 5.5 指挥与复审，Sonnet 5.5 子代理逐任务写代码（TDD），每个任务经 Opus 规格复审、质量复审与 Codex（gpt-6-astra，medium）审计；记录在 `docs/audits/2026-11-06-macro-workbench/10-implementation-log.md`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/macro-workbench-bbde80`，分支 `claude/macro-workbench-bbde80`。不要 `cd` 出去，不要用裸 `git stash`（栈与其他工作树共享）。只改本任务 **Files** 列出的文件。
- **并行兄弟会话**（计划三、F3、F4、F6、行业、公司、外资、A 股启用）同时改仓库：
  - 迁移时间戳只用 `20261114HHMMSS_*`；本计划只建 `20261114090000_macro_workbench.sql`。
  - 共享文件的改动包在 `// MACRO` … `// /MACRO`（SQL/JSON 不能注释的文件除外：`vercel.json`、`migrations.lock.json` 只追加条目）：`src/i18n/request.ts`、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`、`src/components/today/MacroGlance.tsx`、`src/app/(app)/intel/page.tsx`、`.gitignore`。
  - 本计划拥有：`src/lib/macro/**`、`src/app/(app)/intel/macro/**`、`src/app/api/macro/**`、`src/app/api/cron/macro-sync/**`、`src/components/macro/**`、`scripts/macro/**`、`messages/*/macro.json`、`docs/runbooks/macro-sync.md`。
  - **不 import `src/lib/judgments/*`**（F4 未合并）：F4 契约在 `src/lib/macro/judgment-contract.ts` 镜像（§共享契约），F4 合并后另行替换。
- **迁移**：可重放（`create table if not exists`、`create or replace function`、`drop policy if exists` 后 `create policy`、`insert … on conflict`）；`supabase/migrations.lock.json` 追加 `{file, sha256}`（文件字节 hex；`shasum -a 256`）；已锁文件不可再改，所以迁移在 Task 1 一次写全，之后的任务**不得修改迁移**（发现问题回到 Task 1 的修复轮，在锁之前改）。`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移晚于已锁最新（`20261106090000`）。
- **本地 harness** 只建了 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)`：迁移只能 `insert into storage.buckets … on conflict (id) do update`，不能引用 `storage.objects`。PostgREST `max_rows=1000`：返回多行的读取要分页或用 jsonb 信封。
- **托管实例** `postgres` 不是超级用户：`security definer` 函数 `set search_path = public`；不 `alter … owner`。Supabase 默认给 anon/authenticated 新函数 EXECUTE：每个函数后 `revoke execute on function … from public, anon, authenticated;` 再按需 `grant`。
- **权限模式**：十表先 `revoke all … from public, anon, authenticated, service_role`；`macro_series`、`macro_catalog_versions`、`macro_evidence_objects`、`macro_retrievals`、`macro_snapshots`、`macro_regime_results` grant select 给 anon、authenticated、service_role；`macro_observations` grant select 给 anon、authenticated、service_role，RLS policy `status = 'ok'`（service_role 绕过 RLS）；`macro_analysis_runs` grant select 给 authenticated（RLS `user_id = auth.uid()`）与 service_role；`macro_publish_state`、`macro_ingest_chunks` 只 service_role select。**没有角色有直接 insert/update/delete**：写只经 RPC。
- **数据库测试**：`process.env.S4_TEST_STATE` → `adminUrl`，`describe.skipIf(!enabled)`。任何含字符串 `S4_TEST_STATE` 的 `.test.ts` 必须加进 `scripts/ci/research-checks.ts::criticalSuites`（`// MACRO` 块）。单文件对空库：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts <file>`（`db-one.ts` 内容见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5，未提交，丢了按原文重建）；重放迁移助手 `replayMigration` 从 `src/lib/facts/facts.integration.test.ts` 复制（未导出）。`LC_ALL=C` 只给 `test:db`/`test:migrations`/`db-one`，不要导出给 `npm test`。
- **客户端**：服务端写 `getAdminSupabase()`（`src/lib/supabase/admin.ts`）；公开读 `getAnonSupabase()`（`src/lib/supabase/anon.ts`）；登录用户 `getServerSupabase()`（`src/lib/supabase/server.ts`，`auth.getUser()` 无用户 → 401）；DQ 用 `TableClient`（`src/lib/db/table-client.ts`，计划一的 `supabaseTableClient`）。新 RPC 不登记进 `Database['public']['Functions']`，按 `src/lib/supabase/admin.ts` 注释的窄类型办法调用。
- **cron 鉴权**：`authorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)`（`src/lib/observability/cron-auth.ts`）。**ingest 鉴权**：`MACRO_INGEST_SECRET`，Bearer，`crypto.timingSafeEqual`，未配置即 503 拒绝。
- **代码版本**：`resolveCodeVersion()`（`src/lib/facts/deps.ts`）。**十进制**：`canonicalDecimal` / `decimalEquals`（`src/lib/facts/json-numbers.ts`）。**DQ**：`startBatch/finishBatch/emptyCounts`（`src/lib/dq/batches.ts`）、`quarantine()`（`src/lib/dq/quarantine.ts`）、`recordAttempt/freshnessOf`（`src/lib/dq/freshness.ts`）、`rangeRule/jumpRule/unitRule`（`src/lib/dq/rules.ts`）——只调用，不修改这些文件。
- **i18n**：新域 `macro` 注册到 `src/i18n/request.ts` 的 `MESSAGE_DOMAINS`（`// MACRO` 块）；`messages/zh/macro.json` 与 `messages/en/macro.json` 键集合一致（现有 parity 测试会校验）。
- **UI**：遵守 `DESIGN.md` 与 `src/app/globals.css` tokens（无紫色、无渐变文字、无发光、圆角 ≤ 6px、数字 `font-mono tabular-nums`、数据密度 `[data-density="data"]`）；视觉依据为宏观 Claude Design 画布 `https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH`（判断层关闭的概览、证据抽屉、Today 卡画板在第 2 稿补充；UI 任务开工前读画布）。每张图表有表格视图。
- **提交**：`git commit` 单独一条命令，同一命令里不能出现 `-n` 记号（含 `grep -n`、`head -n`），用 `git commit -F - <<'EOF' … EOF`；信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理用自己的模型名）。不用 `--no-verify`。
- **测试命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`npm run test:db`、`npm run test:migrations`；Python：`scripts/macro/.venv/bin/python -m pytest scripts/macro -q`。
- **代码风格**：沿用 `src/lib/dq`、`src/lib/facts` 的紧凑风格（单空格缩进、少空行、文件顶部一段注释说明职责与规格条目）；React 组件沿用 `src/components/*` 现有风格（两空格缩进）。
- **环境变量**：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`、`MACRO_INGEST_SECRET`（新）、`MACRO_INGEST_URL`（Mac 侧，新）、`MACRO_JUDGMENTS_ENABLED`（新，默认未设 = 关）、`VERCEL_GIT_COMMIT_SHA`。**不需要 `FRED_API_KEY`**（本机也没有）。
- **Python**：`uv venv -p 3.12 scripts/macro/.venv && VIRTUAL_ENV=scripts/macro/.venv uv pip install -r scripts/macro/requirements.txt`；`.venv` 进 `.gitignore`（`// MACRO` 不适用于 gitignore：用 `# MACRO` 注释行）。AKShare 版本锁 `1.20.35`（编写计划时已验证可用）。Python 只在本机 / Mac Studio 运行，不进 `package.json`、不进 Vercel。网络夹具录制命令在任务里写明；单测离线。

## 文件结构

```
supabase/migrations/20261114090000_macro_workbench.sql   十表 + 桶 + RPC + RLS + 权限（Task 1）
supabase/migrations.lock.json                            追加 1 条（Task 1）
src/lib/supabase/database.types.ts                       + 七表 Row/Insert/Update（// MACRO；Task 1）
src/lib/macro/macro.integration.test.ts                  迁移/RPC/RLS/并发发布/配额（critical；Task 1）
src/lib/macro/types.ts             共享类型（§共享契约 原样落地；Task 2）
src/lib/macro/judgment-contract.ts F4 契约镜像（§共享契约 原样落地；Task 2）
src/lib/macro/catalog.ts           MACRO_CATALOG、CATALOG_VERSION、catalogById、indicatorsOf（Task 2）
src/lib/macro/decimal.ts           canonical / equals / subtract / ratio（十进制字符串运算；Task 2）
src/lib/macro/db.ts                MacroDb 接口 + MacroDbError + supabaseMacroDb（Task 3）
src/lib/macro/memory-db.ts         memoryMacroDb（与 SQL RPC 语义一致；Task 3）
src/lib/macro/db-contract.ts       内存与 supabase 共用契约用例（非测试文件；Task 3）
src/lib/macro/evidence.ts          EvidenceStore 接口 + supabaseEvidenceStore + memoryEvidenceStore + sha256Hex（Task 3）
src/lib/macro/parsers/fred-csv.ts  parseFredCsv（Task 4）
src/lib/macro/fixtures/fred/*.csv  真实录制（Task 4）
scripts/macro/record-fred-fixtures.ts                    （Task 4）
src/lib/macro/derive.ts            deriveSeries（month_end / yoy_from_index / index_minus_100；Task 5）
src/lib/macro/quality.ts           MACRO_RULES_VERSION、validatePoint（Task 5）
src/lib/macro/ingest.ts            ingestEvidence / IngestDeps / IngestReceipt（cron 与 ingest 路由共用；Task 6）
src/lib/macro/providers/fred.ts    fetchFredCsv（Task 7）
src/lib/macro/deps.ts              productionMacroDeps（Task 7）
src/app/api/cron/macro-sync/route.ts                     （Task 7，Task 11 接入发布）
vercel.json                                              + /api/cron/macro-sync 30 5 * * *（Task 7）
scripts/macro/requirements.txt  recorder.py  collect.py  test_collect.py  launchd.plist.template   （Task 8）
src/lib/macro/fixtures/cn/*        真实录制的 NBS / 中债 / 外汇局响应 + manifest.json（Task 8）
src/lib/macro/parsers/nbs.ts  parsers/chinabond.ts  parsers/safe.ts  parsers/index.ts（parserFor）（Task 9）
src/app/api/macro/ingest/route.ts  src/lib/macro/ingest-schema.ts                         （Task 9）
src/lib/macro/regime.ts            RULES、RULES_VERSION、METHODOLOGY_VERSION、classifyRegime（Task 10）
src/lib/macro/freshness.ts         releaseTimeliness（Task 11）
src/lib/macro/snapshots.ts         buildRegimeInput / publishRegion（Task 11）
src/lib/macro/read-api.ts          macroReadApi(db)（Task 12）
src/lib/macro/replay.test.ts       证据 → 观测离线重放（Task 12）
src/lib/macro/views.ts             overviewEnvelope / indicatorRows / changesOf（Task 13）
src/app/api/macro/{overview,series/[id],snapshots/[id],evidence/[sha256]}/route.ts  src/lib/macro/route-helpers.ts  （Task 13）
src/lib/macro/events.ts  cycles.ts  src/lib/macro/data/fomc-meetings.json  scripts/macro/record-fomc.ts   （Task 14）
src/lib/macro/correlation.ts  explain.ts  analysis-spec.ts                               （Task 15）
src/app/api/macro/analyses/route.ts  analyses/[runId]/route.ts                            （Task 15）
messages/zh/macro.json  messages/en/macro.json  src/i18n/request.ts(// MACRO)            （Task 16）
src/components/macro/macro-format.ts  IndicatorTable.tsx  ChangesCard.tsx  CatalogCoverage.tsx  SourceFooter.tsx  SourceDrawer.tsx
src/components/macro/charts/{MacroLineChart,Sparkline,ScatterFit,DataTableToggle}.tsx    （Task 16）
src/app/(app)/intel/macro/page.tsx  [seriesId]/page.tsx  analyses/[runId]/page.tsx
src/components/macro/{IndicatorDetail,CorrelationWorkbench,MacroJudgmentSlot,MacroWorkbench}.tsx   （Task 17）
src/components/today/MacroGlance.tsx(// MACRO)  src/app/(app)/intel/page.tsx(// MACRO)  src/components/macro/MacroSummaryCard.tsx   （Task 17）
scripts/macro/resolve-quarantine.ts  docs/runbooks/macro-sync.md                          （Task 18）
scripts/ci/research-checks.ts      criticalSuites += src/lib/macro/macro.integration.test.ts（// MACRO；Task 1）
```

## 共享契约

### `src/lib/macro/types.ts`（Task 2 原样落地；后续任务只 import，不改）

```ts
// src/lib/macro/types.ts
// Shared macro types (spec §4). Every later module imports from here; changing a shape here is a
// plan change, not an implementation detail.
export type Region='US'|'CN';
export type SeriesType='policy_rate'|'bond_yield'|'fx'|'inflation_yoy'|'pmi'|'labor_rate'|'growth_yoy'|'liquidity_yoy'|'risk_index'|'asset_price';
export type SeriesStatus='active'|'missing'|'restricted';
export type Adapter='fred_csv'|'akshare';
export type Rights='public_domain'|'official_open'|'third_party';
export type ChangeKind='bp'|'pp'|'pct'|'points';
export type NativeFrequency='daily'|'monthly'|'quarterly'|'event';
export type PeriodKind='day'|'month'|'quarter';
export interface Bilingual{zh:string;en:string}
export interface SeriesSource{adapter:Adapter;fetchHost:string;publisher:Bilingual;via?:Bilingual;seriesKey:string;rights:Rights;attribution:Bilingual}
export type DeriveRule={kind:'month_end';from:string}|{kind:'yoy_from_index';from:string}|{kind:'index_minus_100';from:string};
export interface MacroSeriesDef{
 id:string;region:Region;role:'indicator'|'asset'|'event_source';type:SeriesType|null;name:Bilingual;unit:string;
 nativeFrequency:NativeFrequency;period:PeriodKind;adjustment:'sa'|'nsa'|'na';status:SeriesStatus;reason?:Bilingual;
 source:SeriesSource|null;            // null only for status missing; derived series carry the source of their input
 derive?:DeriveRule;                  // present ⇒ series is derived (no own evidence)
 aliasOf?:string;                     // asset view of another series (same observations); no own rows
 revisionPolicy:'revisable'|'immutable';weight:number;changeKind:ChangeKind;releaseLagDays?:number;definitionVersion:number;
}
export type Locator={kind:'csv_row';line:number;column:number}|{kind:'json_pointer';pointer:string};
/** Exact fetched bytes plus the receipt of this one retrieval (spec §0.2 N2). sha256 = hex of bytes. */
export interface EvidenceInput{sha256:string;bytes:Uint8Array;adapter:Adapter;fetchUrl:string;fetchHost:string;httpStatus:number;contentType:string;fetchedAt:string;toolVersions:Record<string,string>}
/** macro_evidence_objects: byte object, deduplicated by sha256. */
export interface EvidenceObject{sha256:string;object_path:string;adapter:Adapter;content_type:string;byte_length:number;created_at:string}
/** macro_retrievals: one row per retrieval, even when the bytes repeat. */
export interface Retrieval{retrieval_id:string;sha256:string;fetch_url:string;fetch_host:string;http_status:number;fetched_at:string;batch_id:string;tool_versions:Record<string,string>}
/** One value located inside one evidence object by a parser. periodEnd is ISO date (period end per series definition). */
export interface ParsedPoint{seriesId:string;periodEnd:string;valueText:string;locator:Locator}
export type ObservationStatus='ok'|'quarantined';
export interface ObservationRow{
 observation_id:string;series_id:string;period_end:string;value_text:string;version:number;
 available_at:string;availability_basis:'first_seen';ingested_at:string;status:ObservationStatus;
 retrieval_id:string|null;locator:Locator|null;derived_from:string[]|null;transform:string|null;code_version:string;batch_id:string;
}
/** A row submitted to macro_write_observations. Exactly one of (retrieval_id+locator) | (derived_from+transform).
 *  available_at: native = the retrieval's fetched_at; derived = max available_at of ALL inputs (spec §0.2 M6). */
export type ObservationWrite=
 |{series_id:string;period_end:string;value_text:string;available_at:string;revisable:boolean;retrieval_id:string;locator:Locator}
 |{series_id:string;period_end:string;value_text:string;available_at:string;revisable:boolean;derived_from:string[];transform:string};
export type WriteConflictReason='unexpected_revision'|'conflicting_rows'|'stale_delivery'|'missing_evidence'|'missing_input';
export interface WriteResult{
 inserted:number;duplicates:number;versioned:number;quarantined:number;
 conflicts:{series_id:string;period_end:string;reason:WriteConflictReason;value_text:string;current_value_text:string|null}[];
}
export interface CatalogCounts{verified:number;missing:number;restricted:number}
export interface RegimeContribution{series_id:string;observation_id:string;rule_id:string;weight:number;support:Partial<Record<'recovery'|'overheat'|'stagflation'|'recession',number>>;contribution:Record<'recovery'|'overheat'|'stagflation'|'recession',number>}
export interface PublishInput{
 region:Region;expectedRevision:number;expectedInputRevision:number;asOf:string;methodologyVersion:string;catalogVersion:string;
 observationIds:string[];catalogCounts:CatalogCounts;
 regime:import('./judgment-contract').RegimeResult|null;contributions:RegimeContribution[];rulesVersion:string;uncoveredWeight:number;
}
export interface SnapshotRecord{
 snapshot_id:string;region:Region;as_of:string;revision:number;methodology_version:string;catalog_version:string;
 observation_ids:string[];catalog_counts:CatalogCounts;status:'active'|'superseded'|'failed';failure_reason:string|null;created_at:string;
}
export interface RegimeRecord{snapshot_id:string;region:Region;regime:import('./judgment-contract').RegimeResult|null;contributions:RegimeContribution[];rules_version:string;uncovered_weight:number}
export type AnalysisKind='change'|'level'|'rolling'|'event_window';
export interface ChunkCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export type Timeliness='current'|'late'|'missing'|'n/a';
```

### `src/lib/macro/judgment-contract.ts`（Task 2 原样落地；逐字镜像 F4 计划 `2026-11-06-judgment-framework.md` 共享契约中的宏观部分与卡片类型的最小子集）

```ts
// src/lib/macro/judgment-contract.ts
// Mirror of the F4 judgment contract pieces the macro module implements or renders (F4 plan
// 2026-11-06-judgment-framework.md shared contract; F4 spec §11.1, §12.1). F4 is not on main yet:
// when it lands, these declarations are replaced by imports from src/lib/judgments and a type
// test asserts assignability both ways. Do not add fields here that F4 does not define.
export type Regime='recovery'|'overheat'|'stagflation'|'recession';
export const REGIMES:readonly Regime[]=['recovery','overheat','stagflation','recession'];   // also the tie-break order
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
export interface Bilingual{zh:string;en:string}
/** Minimal subset of F4 JudgmentCard that MacroJudgmentSlot renders; unknown fields are ignored. */
export interface JudgmentCardView{
 judgment_id:string;lifecycle:'abstained'|'open'|'settled'|'void'|'withdrawn'|'pending_fill';calibration:string;as_of:string;
 methodology:{id:string;version:string;title:Bilingual;href:string};
 display:{headline:Bilingual;percent:number|null;value:number|string|[number,number]|null};
 abstain_reason?:string;
}
```

### `MacroDb`（Task 3；`src/lib/macro/db.ts`）

```ts
export class MacroDbError extends Error{constructor(readonly code:'stale_publisher'|'invalid_manifest'|'quota_exceeded'|'not_found'|'truncated'|'already_resolved'|'rpc_failed',message?:string){super(message??code);this.name='MacroDbError';}}
export interface MacroDb{
 /** Upserts macro_series mirror and appends macro_catalog_versions (no-op if the version exists). service */
 upsertCatalog(defs:readonly import('./types').MacroSeriesDef[],catalogVersion:string,rulesVersion:string):Promise<void>;
 /** RPC macro_put_retrieval: inserts the evidence object if new (by sha256) and ALWAYS a new retrieval row; returns retrieval_id. service */
 putRetrieval(obj:Omit<import('./types').EvidenceObject,'created_at'>,r:Omit<import('./types').Retrieval,'retrieval_id'|'sha256'>):Promise<string>;
 evidenceObject(sha256:string):Promise<import('./types').EvidenceObject|null>;                                   // anon
 retrieval(retrievalId:string):Promise<import('./types').Retrieval|null>;                                        // anon
 /** RPC macro_record_chunk: idempotent by (batch_id, seq). service */
 recordChunk(batchId:string,seq:number,total:number,counts:import('./types').ChunkCounts):Promise<'new'|'duplicate'>;
 chunksOf(batchId:string):Promise<{seq:number;total:number;counts:import('./types').ChunkCounts}[]>;            // service
 writeObservations(batchId:string,codeVersion:string,rows:import('./types').ObservationWrite[]):Promise<import('./types').WriteResult>;   // service, RPC macro_write_observations
 /** Latest period per series, highest ok version within it; asOf ⇒ only rows with available_at ≤ asOf. anon. */
 latestObservations(seriesIds:string[],opts?:{asOf?:string;periodEndLte?:string}):Promise<import('./types').ObservationRow[]>;
 /** Highest ok version per period, ascending period_end, paged to completion (throws truncated beyond maxRows). anon. */
 seriesHistory(seriesId:string,opts:{from?:string;to?:string;asOf?:string;maxRows:number}):Promise<import('./types').ObservationRow[]>;
 /** All ok versions of one series (revision history for the drawer). anon. */
 versionsOf(seriesId:string,periodEnd:string):Promise<import('./types').ObservationRow[]>;
 observationsByIds(ids:string[]):Promise<import('./types').ObservationRow[]>;                                    // anon; ok only
 publishState(region:import('./types').Region):Promise<{revision:number;inputRevision:number}>;                   // service
 /** RPC macro_resolve_conflict (spec §0.2 M10); throws already_resolved / not_found. service */
 resolveConflict(quarantineId:string,decision:'accept'|'reject',resolvedBy:string):Promise<void>;
 publishSnapshot(input:import('./types').PublishInput):Promise<{snapshot_id:string;revision:number}>;            // service, RPC publish_macro_snapshot; throws stale_publisher / invalid_manifest
 recordFailedSnapshot(input:{region:import('./types').Region;asOf:string;methodologyVersion:string;catalogVersion:string;reason:string}):Promise<string>;
 activeSnapshot(region:import('./types').Region):Promise<import('./types').SnapshotRecord|null>;                  // anon
 snapshot(snapshotId:string):Promise<import('./types').SnapshotRecord|null>;                                      // anon
 snapshotsSince(marker:{created_at:string;snapshot_id:string}|null,limit:number):Promise<import('./types').SnapshotRecord[]>;   // anon; active+superseded only
 regimeOf(snapshotId:string):Promise<import('./types').RegimeRecord|null>;                                       // anon
}
```

`supabaseMacroDb({admin, anon})` 写走 admin（rpc），读走 anon（RLS 生效）；`memoryMacroDb()` 在内存里实现同样语义（含 `stale_publisher`、隔离行不可读、版本规则）。分析运行不在 `MacroDb` 里：`create_macro_analysis_run` 由登录用户客户端在 Task 15 路由里直接 rpc。

### 写入规则（SQL `macro_write_observations` 与 `memoryMacroDb.writeObservations` 必须一致；Task 1 / Task 3）

调用开始时对涉及的每个区域 `select … from macro_publish_state where region = … for update`（按区域名排序加锁，避免死锁）；本次调用实际插入了任何行（ok 或 quarantined）的区域，在结束时 `input_revision = input_revision + 1`。

对 `p_rows` 按输入顺序逐行（同一调用内先按 `(series_id, period_end)` 分组）：
1. 组内出现两个不同 `value_text`（十进制不等）→ 整组不写，每个不同值一条 conflict `conflicting_rows`，计 `quarantined`（每组 1）。
2. 原生行 `retrieval_id` 不在 `macro_retrievals` → conflict `missing_evidence`，不写，不计数（调用方计 `failed`）。派生行任一 `derived_from` 不存在或非 `ok` → conflict `missing_input`，同上。
3. 取该 `(series_id, period_end)` 的最高版本 `ok` 行 `cur`：值不同且 `new.available_at < cur.available_at`（迟到交付）→ 不分配新的最新版本：插入 `quarantined` 新版本（同值 quarantined 已存在则不插），conflict `stale_delivery`，`quarantined+1`；否则：无 `cur` → 插入 `version = coalesce(max(version) over all statuses,0)+1`、`status ok`，`inserted+1`；`cur.value = new.value`（numeric 相等）→ `duplicates+1`；不等且 `revisable` → 插入新版本 ok，`versioned+1`；不等且不可修订 → 插入新版本 `quarantined`（若已有同值的 quarantined 行则不重复插入），conflict `unexpected_revision`（带 `current_value_text`），`quarantined+1`。
4. `value` 列 = `value_text::numeric`；`value_text` 由调用方给 canonical 形式（RPC 校验 `value_text ~ '^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$'`，不符 → 抛错）。
5. 返回 `WriteResult`（jsonb）。

### 发布规则（SQL `publish_macro_snapshot`；Task 1 / Task 3）

`macro_publish_state` 两行（US、CN）由迁移 `insert … on conflict do nothing` 预置（revision 0、input_revision 0）。`select revision, input_revision from macro_publish_state where region = p_region for update`；`revision <> p_expected_revision or input_revision <> p_expected_input_revision` → `raise exception 'stale_publisher'`；`p_catalog_version` 必须存在于 `macro_catalog_versions` → 否则 `invalid_manifest`；`p_observation_ids` 每个必须存在、`status='ok'`、其 `series_id` 属于 `macro_series` 中 `region = p_region` → 否则 `raise exception 'invalid_manifest'`；`update macro_snapshots set status='superseded' where region=p_region and status='active'`；插入新快照（active，`revision = p_expected_revision+1`）与 `macro_regime_results`；`update macro_publish_state set revision = revision+1, updated_at = now()`；返回 `{snapshot_id, revision}`。

### 隔离裁决（SQL `macro_resolve_conflict`；Task 1 / Task 18）

参数 `(p_quarantine_id uuid, p_decision text, p_resolved_by uuid)`，只授 service_role。锁 `dq_quarantine` 行（`for update`），不存在 → `not_found`，非 `open` → `already_resolved`；`dataset` 必须以 `macro.` 开头、`table_name='macro_observations'`；由 `natural_key` 拆出 `series_id|period_end`，找该期 `status='quarantined'` 的最高版本行；`accept` → 该行 `status='ok'`，对应区域 `input_revision+1`；`dq_quarantine` 置 `resolved_accept`/`resolved_reject`、`resolved_by`、`resolved_at=now()`；插入 `research_audit_log`（列以 `src/app/api/admin/dq/quarantine/[id]/route.ts` 现有写法为准）。一个事务。

### ingest 分块（SQL `macro_record_chunk`；Task 1 / Task 9）

`insert into macro_ingest_chunks(batch_id, seq, total, counts, received_at) … on conflict (batch_id, seq) do nothing`，返回是否新插入；`total` 与该批次已有块的 `total` 不一致 → 抛错 `chunk_total_mismatch`。只授 service_role。

### 分析运行配额（SQL `create_macro_analysis_run`；Task 1 / Task 15）

只授 service_role；路由传已验证 session 的 `p_user_id`。同 `(p_user_id, p_request_id)` 已有行 → 直接返回其 `run_id`（不计额）；`pg_advisory_xact_lock(hashtextextended('macro_analysis:'||p_user_id::text,0))`；从 `profiles` 取 `plan`、`role`（列名以 `src/lib/billing/quota.ts::checkQuota` 的读取为准）；`role='admin'` 不限，`plan='pro'` 100，其余 10；数过去 24 小时本人 `status='ok'` 的行，达到限额 → `raise exception 'quota_exceeded'`；插入（`user_id = p_user_id`）返回 `run_id`。

### 跨任务约定

- 观测 id、快照 id、运行 id 都是 uuid（字符串）。日期一律 ISO `YYYY-MM-DD`；时间 ISO UTC。
- `ingest_batches`：FRED `producer 'ts-fred'`、`dataset 'macro.fred'`；AKShare `producer 'py-akshare'`、`dataset 'macro.akshare'`；派生写入记在触发它的批次里。`dq_quarantine.dataset` 同批次 dataset，`table_name 'macro_observations'`，`natural_key '<series_id>|<period_end>'`，`reason_code` ∈ `unexpected_revision`、`conflicting_rows`、`adapter_mismatch`、`rule_failed:<ruleId>`。
- ingest 协议（§0.2 M24）：`POST /api/macro/ingest` body `{action:'start', tool_versions}` → `{batch_id}`（已有未结束且 < 2h 的 `macro.akshare` 批次 → 409）；`{action:'chunk', batch_id, seq, total, evidence[], claims[]}` → 块回执（重复块返回 `duplicate`，不重复计数）；`{action:'finish', batch_id, total}` → 校验全部块到齐、汇总计数、`finishBatch`、`recordAttempt('macro.akshare',{ok: status!=='failed'})`、CN 派生、`publishRegion('CN')`。cron 只发布 US。
- 判定权重属于方法：`regime.ts` 导出 `WEIGHTS_V1: Record<string, number>`；`catalog.ts` 中每个 `role='indicator'` 的 `weight` 必须等于 `WEIGHTS_V1[id] ?? 0`（Task 10 测试）；覆盖率分母 = 该区域 `WEIGHTS_V1` 之和（含 missing/restricted 项）。
- 同比：`(cur/prev − 1) × 100`，十进制，half-even 四舍五入到 4 位小数后 canonical（`decimal.ts::yoyPct`）；`index_minus_100`、`month_end` 精确。派生行 `transform` = `'<kind>@1'`。
- 发布及时性（§0.2 M11）：下一期 = 最新期 + 1 个周期，截止 = 下一期期末 + `releaseLagDays` + 3 天，今天 > 截止 → `late`；无观测 → `missing`；`event` 或无 `releaseLagDays` → `n/a`。
- 快照清单（§0.2 M7）：每个判定指标的最新期、上一可比期、3 个月前期（季度用上一季度）的观测 id 都进 `observation_ids`。
- 证据对象路径 `<adapter>/<sha256>.<ext>`（`ext` ∈ `csv|json|html|txt` 按 Content-Type）；元数据旁注 `<adapter>/<sha256>.meta.json`；上传 `upsert:false`，409 = exists。
- `available_at`：原生 = 证据 `fetchedAt`；派生 = 输入 `available_at` 的最大值。`availability_basis` 恒为 `'first_seen'`。
- 判定只读 `role='indicator'`、`status='active'` 的派生月度 / 原生月度 / 季度序列（日频原生 ID 不进判定；`catalog.ts` 导出 `regimeInputsOf(region)`）。
- 页面 / API 不在判断层关闭时返回任何判定字段：`MACRO_JUDGMENTS_ENABLED !== '1'` ⇒ `snapshots/[id]` 不含 `regime`/`contributions`。

## 规格覆盖

| 规格 | 任务 |
|---|---|
| §2 权限、配额 | 1、13、15 |
| §3.2 概览（判断层关闭）、证据抽屉、判定槽位 | 16、17 |
| §3.3 详情 | 17（依赖 13、14） |
| §3.4 关联 | 15、17 |
| §3.5 Today | 17 |
| §4.1 时间与版本 | 1、3、6 |
| §4.2 目录 | 2（A 项核实：4、8；核实失败改 M 的规则见 8） |
| §4.3 存储、RPC、桶 | 1、3 |
| §4.4 采集、写入规则、preview | 4–9 |
| §4.5 新鲜度两概念 | 6、7、9、11、13 |
| §5 判定、RegimeResult、MacroReadApi | 10、11、12 |
| §6 事件、周期 | 14 |
| §7 相关分析 | 15 |
| §8 API | 7、9、13、15 |
| §10 i18n | 16 |
| §11 错误处理 | 6、9、11 |
| §12 测试 | 每任务；replay 12；db 1 |
| §13 运维、runbook | 18 |
| §14 验收 | 18 |

## 执行顺序

| 序 | 任务 | 部分 | 依赖 |
|---|---|---|---|
| 1 | Task 1 迁移 + 锁 + 类型 + 集成测试 | A | — |
| 2 | Task 2 types / judgment-contract / catalog / decimal | A | — |
| 3 | Task 3 MacroDb（supabase + memory + 契约）+ EvidenceStore | A | 1、2 |
| 4 | Task 4 FRED CSV 解析 + 真实夹具录制 | B | 2 |
| 5 | Task 5 derive + quality | B | 2 |
| 6 | Task 6 ingest 编排 | B | 3、4、5 |
| 7 | Task 7 FRED 抓取 + deps + cron（preview）+ vercel.json | B | 6 |
| 8 | Task 8 Python 采集器 + 录制钩子 + CN 真实夹具 | B | 2 |
| 9 | Task 9 CN 解析器 + ingest 路由 | B | 6、8 |
| 10 | Task 10 regime | C | 2 |
| 11 | Task 11 freshness + snapshots/publish（接入 cron 与 ingest 完成块） | C | 3、7、9、10 |
| 12 | Task 12 MacroReadApi + replay 测试 | C | 11 |
| 13 | Task 13 views + 读 API | C | 11 |
| 14 | Task 14 events + cycles + FOMC 存证 | D | 3 |
| 15 | Task 15 correlation + analyses API | D | 13、14 |
| 16 | Task 16 i18n + 格式化 + 基础组件 | D | 13 |
| 17 | Task 17 页面、详情、关联 UI、判定槽位、Today、/intel 卡 | D | 14、15、16 |
| 18 | Task 18 隔离裁决脚本、runbook、全量门禁、验收 | D | 全部 |

任何任务不得修改执行顺序上晚于它的任务创建的文件；不得修改迁移（Task 1 之后）与 `types.ts` / `judgment-contract.ts`（Task 2 之后）——需要改就停下报告 NEEDS_CONTEXT。

---

<!-- PART A: Tasks 1–3 -->
<!-- PART B: Tasks 4–9 -->
<!-- PART C: Tasks 10–13 -->
<!-- PART D: Tasks 14–18 -->
