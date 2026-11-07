# 宏观工作台 P3 + P4 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md`（第 5 稿；§0 / §0.2 为 Codex 两轮规格处置，§0.2 末"第 4 稿（计划审计回写）"为计划审计第一轮 16 条与第二轮 R2-1…R2-4 的回写）：策略清单与冻结输入、政策事件合并、实时传导流、剧本库（静态假设框架）、政策反应矩阵、政策行动段 × 资产表、月度复盘（不可变结果 + 当前指针）、LLM 解读（系统模板事实句 + 模型无数字假设句 + 确定性校验 + 预先认领的幂等计量）、偏差案例（F4 读接口）、四个页面与能力矩阵。WP-S6（接线 P1+P2 / F4）不在本计划内：P1+P2 与 F4 合并到 main 后另行 rebase 接线。

**Architecture:** 一个迁移 `20261115090000_macro_strategy.sql` 建六表与八个 `security definer` RPC（不引用 P1 / F4 表）；`src/lib/macro/strategy/**` 只依赖窄端口 `StrategyReadPort`（P1+P2 契约的结构镜像，生产实现在 WP-S6 加入，此前 `strategyPort()` 返回 `null` → 503）与 `StrategyDb`（本模块六表，Supabase + 内存两实现）；所有计算是读"策略清单"的纯函数；LLM 与 F4 读取都经注入的依赖，测试用假实现。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST）、vitest、`pg`（集成测试）、ajv、next-intl、内联 SVG。

实施分工（owner 规则）：Opus 5.5 指挥与复审；Sonnet 5.5 子代理逐任务 TDD 写代码；每个任务经 Opus 规格复审、质量复审与 Codex（gpt-6-astra，medium）审计；记录在 `docs/audits/2026-11-07-macro-p3-p4/10-implementation-log.md`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9`，分支 `claude/macro-p3-p4-6b9829`。不要 `cd` 出去，不要用裸 `git stash`（栈与其他工作树共享）。只改本任务 **Files** 列出的文件。
- **并行兄弟会话**（P1+P2 宏观、F4、计划三、F3、行业、公司、外资）同时改仓库：
  - 迁移时间戳只用 `20261115HHMMSS_*`；本计划只建 `20261115090000_macro_strategy.sql`。
  - 本计划拥有：`src/lib/macro/strategy/**`、`src/components/macro/strategy/**`、`src/app/api/macro/strategy/**`、`src/app/api/cron/macro-review/**`、`src/app/(app)/intel/macro/{transmission,history,review}/**`、`messages/*/macroStrategy.json`、`docs/runbooks/macro-strategy.md`。
  - 共享文件改动包在 `// MACRO-P3` … `// /MACRO-P3`（JSON 文件只追加条目）：`src/i18n/request.ts`、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`、`vercel.json`、`supabase/migrations.lock.json`。
  - **不 import** `src/lib/macro/*`（除 `src/lib/macro/strategy/**`）与 `src/lib/judgments/*`：二者不在 main 上。P1+P2 契约在 `src/lib/macro/strategy/contract.ts` 结构镜像（§共享契约）；F4 只经 HTTP 读接口（`f4-client.ts`）。
- **迁移**：可重放（`create table if not exists`、`create or replace function`、`drop policy if exists` 后 `create policy`）；`supabase/migrations.lock.json` 追加 `{file, sha256}`（`shasum -a 256`）；已锁文件不可再改：迁移在 Task 1 一次写全，之后的任务不得修改迁移。`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移晚于已锁最新（当前 `20261110090000`）。
- **本地 harness**：只建了 `storage.buckets` 五列（本计划不用桶）；PostgREST `max_rows=1000`。
- **托管实例** `postgres` 非超级用户：`security definer` 函数 `set search_path = public`；不 `alter … owner`；每个函数后 `revoke execute on function … from public, anon, authenticated;` 再按需 `grant execute … to service_role`。
- **权限模式**：六表先 `revoke all … from public, anon, authenticated, service_role`；`macro_strategy_manifests`、`macro_review_results`、`macro_review_current` grant select 给 anon、authenticated、service_role；`macro_explanations` grant select 给 authenticated（RLS `user_id = auth.uid()`）与 service_role；`macro_review_attempts`、`macro_explanation_runs` 只 service_role select。没有角色有直接 insert/update/delete：写只经 RPC。
- **数据库测试**：`process.env.S4_TEST_STATE` → `adminUrl`，`describe.skipIf(!enabled)`；含字符串 `S4_TEST_STATE` 的 `.test.ts` 必须加进 `scripts/ci/research-checks.ts::criticalSuites`（`// MACRO-P3` 块）。单文件对空库：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts <file>`（`db-one.ts` 见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5，未提交，丢了按原文重建）；`replayMigration` 助手从 `src/lib/facts/facts.integration.test.ts` 复制（未导出）。`LC_ALL=C` 只给 `test:db` / `test:migrations` / `db-one`。
- **客户端**：服务端写 `getAdminSupabase()`（`src/lib/supabase/admin.ts`）；公开读 `getAnonSupabase()`（`src/lib/supabase/anon.ts`）；登录用户 `getServerSupabase()`（`src/lib/supabase/server.ts`，`auth.getUser()` 无用户 → 401）。新 RPC 不登记进 `Database['public']['Functions']`，按 `src/lib/supabase/admin.ts` 注释的窄类型办法调用。
- **cron 鉴权**：`authorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)`（`src/lib/observability/cron-auth.ts`）。
- **代码版本**：`resolveCodeVersion({allowGit:false})`（`src/lib/facts/deps.ts`）。**十进制**：`canonicalDecimal`（`src/lib/facts/json-numbers.ts`）；减法 / 比较 / 乘 100 由本模块 `numeric.ts` 用 BigInt 缩放实现（P1 `decimal.ts` 不在 main；规格 §5.6 的偏差，WP-S6 可换回）。
- **计量**：LLM 解读的配额 / 计费调用顺序逐字照 `src/app/api/perspectives/[ticker]/route.ts`（`checkQuota('perspectives')`、`resolveUserLlm`、`beginUsageRun`、`createLlmConcurrencyLimiter`/`runWithBudgetRetry` 若该路由使用、`runMeteredLlmCall`、`meteredUsageFromError`、`finalizeUsageRun`、`costErrorCode`/`costErrorStatus`）；实现者先读该文件。
- **i18n**：新域 `macroStrategy` 注册到 `src/i18n/request.ts` 的 `MESSAGE_DOMAINS`（`// MACRO-P3` 块）；`messages/zh/macroStrategy.json` 与 `messages/en/macroStrategy.json` 键集合与占位符一致；专用测试 `src/components/macro/strategy/strategy-messages.test.ts`（不改共享 parity 测试）。
- **UI**：遵守 `DESIGN.md` 与 `src/app/globals.css` tokens（无紫色、无渐变文字、无发光、圆角 ≤ 6px、数字 `font-mono tabular-nums`、`[data-density="data"]`）；视觉依据 Claude Design 画布 `https://claude.ai/artifact/2s8t4QpQGAGCXWZNfQ2TUW`（规格第 2 稿优先于画布）；每张图有表格视图。UI 原语：`src/components/ui/{Card,Panel,Metric,Tag,Button}`。
- **禁用词**：除 `src/lib/macro/strategy/explain-validate.ts` 的常量与测试文件外，代码、文案、注释中不得出现"概率 / 置信度 / 胜率 / probability / confidence"（Task 14 扫描测试强制）。
- **提交**：`git commit` 单独一条命令，同一命令里不能出现 `-n` 记号（含 `grep -n`、`head -n`），用 `git commit -F - <<'EOF' … EOF`；信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理用自己的模型名）。不用 `--no-verify`。
- **测试命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`npm run test:db`、`npm run test:migrations`。
- **代码风格**：库代码沿用 `src/lib/dq`、`src/lib/facts` 的紧凑风格（单空格缩进、少空行、文件顶部一段注释写职责与规格条目）；React 组件沿用 `src/components/*`（两空格缩进）。
- **环境变量**：`MACRO_STRATEGY_ENABLED`（新，默认未设 = 关）、`MACRO_JUDGMENTS_ENABLED`（P1 定义，默认关）、`CRON_SECRET`、`NEXT_PUBLIC_SITE_URL`（`f4-client` 构造本站 URL；未设 → F4 不可用）。

## 文件结构

```
supabase/migrations/20261115090000_macro_strategy.sql      六表 + 八 RPC + 内部投影函数 + RLS + 权限（Task 1）
supabase/migrations.lock.json                               追加 1 条（Task 1）
src/lib/supabase/database.types.ts                          + 六表 Row（三个 // MACRO-P3 块；Task 1）
src/lib/macro/strategy/strategy.integration.test.ts         grants/RLS/RPC 状态机（critical；Task 1），+ pg 上的 StrategyDb 契约（Task 3）
scripts/ci/research-checks.ts                               criticalSuites += 上一行（// MACRO-P3；Task 1）
.claude/scratch/db-one.ts                                   单文件 DB 运行器（未提交；Task 1 给出内容）
src/lib/macro/strategy/contract.ts                          P1+P2 结构镜像 + 本模块共享类型（Task 2，与本计划"共享契约"逐字相同）
src/lib/macro/strategy/flags.ts  flags.test.ts              开关与能力判定（Task 2）
src/lib/macro/strategy/port.ts  port.test.ts                StrategyReadPort、memoryStrategyPort、strategyPort()（Task 2）
src/lib/macro/strategy/testing/fixture.ts  fixture.test.ts  测试夹具（目录子集、P1 规则表投影、观测生成器；仅测试 import；Task 2）
src/lib/macro/strategy/hash.ts  hash.test.ts                canonicalJson + sha256Hex（manifest_hash 与载荷哈希的唯一实现；Task 3）
src/lib/macro/strategy/db.ts  db-contract.ts  db.test.ts    StrategyDb + supabaseStrategyDb + memoryStrategyDb + 两实现共用契约用例（Task 3）
src/lib/macro/strategy/numeric.ts  numeric.test.ts          十进制与统计（Task 4）
src/lib/macro/strategy/manifest.ts  manifest.test.ts        清单构建器、角色、cutoff 规则（monthCutoff = 次月 3 日）；再导出 hash.ts（Task 4）
src/lib/macro/strategy/policy-events.ts  policy-events.test.ts                              事件合并（Task 5）
src/lib/macro/strategy/f4-types.ts                                                          F4CardLite / F4JudgmentDetail（Task 6；f4-client 再导出）
src/lib/macro/strategy/{transmission,playbooks}.ts(+.test.ts)  data/{transmission-v1,playbooks-v1}.ts   （Task 6）
src/lib/macro/strategy/{policy-response,policy-response-explain}.ts  policy-response.test.ts  data/response-dims-v1.ts （Task 7）
src/lib/macro/strategy/cycle-table.ts(+.test.ts)  replay.test.ts  fixtures/replay/{transmission,policy_response,cycle_table}.{manifest,expected}.json （Task 8）
src/lib/macro/strategy/{facts,review}.ts(+.test.ts)  fixtures/replay/review-us-2026-10.json  replay.test.ts（追加复盘块）  （Task 9）
src/lib/macro/strategy/{explain-render,explain-validate}.ts(+.test.ts)  prompts/macro-explain-v1.{zh,en}.md （Task 10）
src/lib/macro/strategy/{f4-client,deviations,explain-request}.ts(+.test.ts)                 （Task 11）
src/lib/macro/strategy/{route-helpers,llm-deps}.ts  llm-deps.test.ts                        （Task 12）
src/app/api/macro/strategy/{transmission,policy-response,cycle-table,manifests/[id],reviews,reviews/[region]/[month],deviations,explanations}/route.ts
src/app/api/macro/strategy/routes.test.ts  src/app/api/cron/macro-review/route.ts  vercel.json（追加 cron）  （Task 12）
messages/{zh,en}/macroStrategy.json  src/i18n/request.ts(// MACRO-P3)                       （Task 13）
src/components/macro/strategy/{strategy-messages.test.ts,strategy-view-model.ts,strategy-view-model.test.ts,use-strategy-t.ts,use-strategy-fetch.ts}
src/components/macro/strategy/{DependencyState,EvidencePairDrawer,F4Summary,TransmissionFlow,PlaybookGrid,PolicyResponseMatrix,CycleReturnsTable,ReviewIndex,DeviationCases,ExplanationPanel,ReviewView,StrategyScreens}.tsx （Task 13）
src/app/(app)/intel/macro/{transmission,history,review,review/[region]/[month]}/page.tsx  src/app/(app)/intel/macro/transmission/strategy-pages.test.ts （Task 14）
src/lib/macro/strategy/forbidden-terms.test.ts  docs/runbooks/macro-strategy.md          （Task 14）
src/lib/macro/strategy/reconcile.ts  reconcile.test.ts  scripts/macro/strategy-reconcile.ts   结算核对（usage_events 按审计键分类；Task 14）
docs/audits/2026-11-07-macro-p3-p4/10-implementation-log.md （指挥方在每个任务复审后追加一行；实施代理不写，任何任务都不改它）
```

## 共享契约

（Task 2 原样落地 `contract.ts`；之后的任务只 import，不改形状。改形状 = 改计划。）

```ts
// src/lib/macro/strategy/contract.ts
// Structural mirror of the P1+P2 macro contract (plan 2026-11-06-macro-workbench.md §共享契约, Task 14) plus this module's
// shared types (spec 2026-11-07 §4–§6). P1+P2 is not on main: at WP-S6 the mirrored declarations are replaced by imports
// from src/lib/macro/{types,judgment-contract,events} and a type test asserts assignability both ways. Mirror only fields
// that P1+P2 define.
// ---- P1+P2 mirror ----
export type Region='US'|'CN';
export type SeriesType='policy_rate'|'bond_yield'|'fx'|'inflation_yoy'|'pmi'|'labor_rate'|'growth_yoy'|'liquidity_yoy'|'risk_index'|'asset_price';
export type ChangeKind='bp'|'pp'|'pct'|'points';
export interface Bilingual{zh:string;en:string}
export type DeriveRule={kind:'month_end';from:string}|{kind:'yoy_from_index';from:string}|{kind:'index_minus_100';from:string};
export interface MacroSeriesDef{
 id:string;region:Region;role:'indicator'|'asset'|'event_source';type:SeriesType|null;name:Bilingual;unit:string;
 nativeFrequency:'daily'|'monthly'|'quarterly'|'event';period:'day'|'month'|'quarter';adjustment:'sa'|'nsa'|'na';
 status:'active'|'missing'|'restricted';reason?:Bilingual;source:{publisher:Bilingual;via?:Bilingual;fetchHost:string;rights:'public_domain'|'official_open'|'third_party'}|null;
 derive?:DeriveRule;aliasOf?:string;revisionPolicy:'revisable'|'immutable';weight:number;changeKind:ChangeKind;releaseLagDays?:number;definitionVersion:number;
}
export interface ObservationRow{
 observation_id:string;series_id:string;period_end:string;value_text:string;version:number;
 available_at:string;availability_basis:'first_seen';ingested_at:string;status:'ok'|'quarantined'|'rejected';
 retrieval_id:string|null;derived_from:string[]|null;transform:string|null;
}
export interface SnapshotRecord{
 snapshot_id:string;region:Region;as_of:string;revision:number;methodology_version:string;catalog_version:string;
 observation_ids:string[];history_ids:string[];catalog_counts:{verified:number;missing:number;restricted:number};
 status:'active'|'superseded'|'failed';created_at:string;
}
export type Regime='recovery'|'overheat'|'stagflation'|'recession';
export const REGIMES:readonly Regime[]=['recovery','overheat','stagflation','recession'];
export type Timeliness='current'|'late'|'missing'|'n/a';
export type EventInput=Pick<ObservationRow,'observation_id'|'period_end'|'value_text'>;
export interface PolicyEvent{
 kind:'policy_target_change';region:'US';effective_date:string;upper_from:string;upper_to:string;lower_from:string;lower_to:string;change_bp:string;source:'derived';
 evidence:[string,string,string,string];version:string;
}
/** Read-only projection of P1 regime.ts RULES (spec §5.2). support values are rule parameters, never shown as percentages. */
export interface RuleRow{rule_id:string;type:SeriesType;condition:Bilingual;support:Partial<Record<Regime,number>>}
export interface RulesView{rulesVersion:string;rows:RuleRow[]}
// ---- this module ----
export type ManifestKind='transmission'|'policy_response'|'cycle_table'|'review'|'explain_facts';
export type InputSource={kind:'snapshot';snapshot_id:string}|{kind:'history';as_of:string};
export interface ManifestInput{series_id:string;role:string;observation_id:string;period_end:string;value_text:string;version:number;available_at:string;source:InputSource}
export type EventBasis='range'|'single_target'|'single_to_range';
export type StrategyPolicyEvent=PolicyEvent&{basis:EventBasis};
/** transition_unverified: the 2008 switch could not be verified (near = 2008-12-16). history_truncated: an event-source read
 *  was truncated, so there are no events at all (near = the cutoff date); views show it, never an empty history. */
export interface EventGap{kind:'transition_unverified'|'history_truncated';reason:string;near:string}
export interface FrozenSnapshot{snapshot_id:string;created_at:string;as_of:string;catalog_counts:{verified:number;missing:number;restricted:number};observation_ids:string[];history_ids:string[]}
/** Catalog projection frozen into a manifest (spec §4.5 N2): replay never reads the live catalog. */
export type FrozenSeriesDef=Pick<MacroSeriesDef,'id'|'region'|'role'|'type'|'name'|'unit'|'status'|'reason'|'aliasOf'|'derive'|'changeKind'|'releaseLagDays'|'nativeFrequency'|'period'>;
export interface ManifestRead{series_id:string;purpose:string;state:'ok'|'missing'|'truncated'}
/** The whole canonical manifest body; manifest_hash = sha256Hex(canonicalJson(body)) is its single identity (spec §4.4 N3).
 *  params = the calculation parameters (transmission {region}, policy_response {window}, cycle_table {boundary, columns}, review
 *  {region, month}, explain_facts {subject…}); views and replay read them from here. facts (explain_facts only) = the exact
 *  fact list given to the model, so an explanation's input is rebuilt from its manifest alone. */
export interface StrategyManifest{
 kind:ManifestKind;params:Record<string,string|number>;cutoff:string;
 snapshots:{US:FrozenSnapshot|null;CN:FrozenSnapshot|null};
 baseline?:{cutoff:string;US:FrozenSnapshot|null;CN:FrozenSnapshot|null};
 catalog:FrozenSeriesDef[];rules?:RulesView;reads:ManifestRead[];
 inputs:ManifestInput[];events?:StrategyPolicyEvent[];gaps?:EventGap[];timeliness?:{series_id:string;state:Timeliness}[];facts?:Fact[];
 catalog_version:string;method_version:string;code_version:string;
}
export interface StoredManifest{manifest_id:string;manifest_hash:string;body:StrategyManifest;created_at:string}
/** Role of an observation taken from a snapshot (spec §4.5): 'latest' = max period_end; 'prev' / 'prev3m' = comparison periods.
 *  ManifestInput.role is '<purpose>:<series_id>:<latest|prev|prev3m|base|end|from|to|month_end|history|evidence>' — writers use the helpers in
 *  manifest.ts ('history' = a whole daily window, cycle-table columns; 'evidence' = an event-source row an event or the 2008 switch check reads). */
export type SnapshotRole='latest'|'prev'|'prev3m';
export type NodeState='observed'|'derived'|'assumption'|'missing'|'restricted'|'not_in_catalog';
export interface ObsRef{observation_id:string;series_id:string;period_end:string;value_text:string;version:number;available_at:string;source:InputSource}
export interface NodeView{id:string;state:NodeState;label:Bilingual;value_text:string|null;unit:string|null;period_end:string|null;inputs:ObsRef[];reason:Bilingual|null}
export type Stage='economy'|'policy'|'liquidity'|'rates'|'risk'|'assets';
export interface TransmissionView{version:string;region:Region;manifest_id:string;cutoff:string;snapshots:{US:string|null;CN:string|null};catalog_version:string;stages:{stage:Stage;label:Bilingual;nodes:NodeView[];edge:{text:Bilingual;kind:'assumption'}|null}[]}
export interface PlaybookView{regime:Regime;title:Bilingual;triggers:{rule_id:string;type:SeriesType;condition:Bilingual;support:number}[];mechanism:Bilingual[];implications:{favored:Bilingual[];disfavored:Bilingual[]};watch:{series_id:string;name:Bilingual}[]}
export interface F4Mark{regime:Regime|null;judgment_id:string;snapshot_match:boolean;as_of:string}
/** Number-free F4 summary rendered by P3/P4 (spec §5.2 N12). Never carries distribution, margin, accuracy or percent. */
export interface F4Summary{judgment_id:string;selected:Regime|null;lifecycle:string;outcome:'hit'|'miss'|null;calibration:string;methodology:{id:string;version:string};as_of:string;href:string|null}
export type JudgmentStatus='disabled'|'unavailable'|'ok';
export interface TransmissionResponse{transmission:TransmissionView;playbooks:PlaybookView[];judgment_status:JudgmentStatus;f4?:{mark:F4Mark;summary:F4Summary}}
export type ExclusionReason='incomplete_window'|'overlap'|'non_positive_base'|'missing_endpoint';
export interface EndpointRef{period_end:string;value_text:string;inputs:ObsRef[]}   // spread endpoints carry two inputs
export interface EventRow{effective_date:string;change_bp:string;basis:EventBasis;base:EndpointRef|null;end:EndpointRef|null;change_raw:number|null;change_text:string|null;selected:boolean;exclusion:ExclusionReason|null}
export type Cell=
 |{status:'stats';n:number;median_raw:number;q1_raw:number;q3_raw:number;unit:'pct'|'bp';events:EventRow[]}
 |{status:'events_only';n:number;unit:'pct'|'bp';events:EventRow[]}
 |{status:'insufficient';unit:'pct'|'bp';events:EventRow[]}
 |{status:'restricted'|'not_in_catalog'|'missing';reason:Bilingual};
export interface ResponseDim{id:string;label:Bilingual;unit:'pct'|'bp';kind:'series'|'spread'|'restricted'|'not_in_catalog';series?:string;a?:string;b?:string;coverage:{from:string|null;to:string|null}}
export interface PolicyResponseView{version:string;window:1|3|6;manifest_id:string;cutoff:string;dims:ResponseDim[];rows:{direction:'hike'|'cut'|'qe_qt';cells:Record<string,Cell>}[];sentences:Bilingual[]}
export type Boundary='event_day'|'first_trading_day'|'month_end';
export interface Episode{index:number;direction:'hike'|'cut';start:string;end:string;events:number;upper_from:string;upper_to:string;cumulative_bp:string;left_censored:boolean;ongoing:boolean;gap_after:boolean}
export type CycleCell={status:'ok';from:ObsRef;to:ObsRef;change_raw:number|null;change_text:string;change_kind:'pct'|'bp'}|{status:'missing';reason:'out_of_coverage'|'degenerate'|'non_positive_base'|'history_truncated'|'month_not_closed'}|{status:'restricted'};
export interface CycleColumn{id:string;label:Bilingual;change_kind:'pct'|'bp';daily_series:string|null;monthly_series:string|null;restricted:boolean}
export interface CycleTableView{version:string;episodes_version:string;boundary:Boundary;manifest_id:string;cutoff:string;episodes:Episode[];columns:CycleColumn[];cells:Record<string,Record<string,CycleCell>>;gaps:EventGap[]}  // cells[episodeIndex][columnId]
export type FactKind='level'|'change'|'policy_event'|'derived'|'response_cell'|'revision'|'release'|'timeliness'|'episode'|'asset_move'|'coverage';
export interface Fact{fact_id:string;kind:FactKind;template:string;slots:Record<string,{value_text:string;unit:string}|string>;series_id?:string;period_end?:string;source_inputs:string[]}
export interface ReviewFacts{
 region:Region;month:string;cutoff:string;baseline_cutoff:string;snapshot_id:string|null;baseline_snapshot_id:string|null;baseline_missing:boolean;
 releases:Fact[];revisions:Fact[];timeliness:Fact[];policy_events:Fact[];episode_changes:Fact[];asset_moves:Fact[];coverage:Fact[];
}
export type ReviewStatus='ok'|'insufficient';
export interface ReviewResult{result_id:string;region:Region;month:string;status:ReviewStatus;manifest_id:string;manifest_hash:string;facts:ReviewFacts;method_version:string;code_version:string;created_at:string}
export type ExplanationState='running'|'accepted'|'rejected'|'failed'|'abandoned';
export interface RenderedExplanation{facts:{fact_id:string;text:string}[];hypotheses:{text:string;fact_ids:string[]}[];counterpoints:{text:string;fact_ids:string[]}[]}
export interface ExplanationProjection{explanation_id:string;subject_kind:'snapshot'|'review';subject_id:string;locale:'zh'|'en';manifest_id:string;state:ExplanationState;rendered:RenderedExplanation|null;failure_codes:string[];provider:string|null;model:string|null;prompt_version:string;validator_version:string;created_at:string;finished_at:string|null}
export type DiffKind='revised'|'dropped'|'unchanged'|'newly_available';
export type NewlySubkind='later_period'|'backfill'|'new_series';
export interface DeviationCase{judgment_id:string;settlement_id:string|null;region:Region;as_of:string;selected:Regime;realized:Regime|null;evidence_state:'complete'|'evidence_incomplete';diffs:{series_id:string;period_end:string;role:'latest'|'comparison';kind:DiffKind;subkind:NewlySubkind|null;registered:{vintage_id:string;value:number}|null;settled:{vintage_id:string;value:number}|null}[]}
export const VERSIONS={transmission:'macro-transmission/1',playbooks:'macro-playbooks/1',events:'macro-strategy-events/1',response:'macro-policy-response/1',
 cycleTable:'macro-cycle-table/1',episodes:'macro-policy-episodes/1',facts:'macro-facts/1',review:'macro-review/1',prompt:'macro-explain-prompt/1',
 validator:'macro-explain-validator/1',deviations:'macro-deviations/1'} as const;
```

### `StrategyReadPort`（Task 2，`port.ts`）

```ts
export interface StrategyReadPort{
 activeSnapshot(region:Region):Promise<SnapshotRecord|null>;
 snapshot(snapshotId:string):Promise<SnapshotRecord|null>;
 /** Newest non-failed snapshot with created_at ≤ cutoff; ties on created_at → greatest snapshot_id. Throws Error('truncated') if paging cannot finish. */
 snapshotUpTo(region:Region,cutoff:string):Promise<SnapshotRecord|null>;
 /** ok rows only, input order, unknown ids dropped. */
 observationsByIds(ids:string[]):Promise<ObservationRow[]>;
 /** Latest period per series with available_at ≤ asOf, highest such version. */
 latestObservations(seriesIds:string[],opts:{asOf:string}):Promise<ObservationRow[]>;
 /** Highest version per period with available_at ≤ asOf, ascending period_end; throws Error('truncated') beyond maxRows. */
 seriesHistory(seriesId:string,opts:{from?:string;to?:string;asOf:string;maxRows:number}):Promise<ObservationRow[]>;
 catalog():readonly MacroSeriesDef[];
 catalogVersion():string;
 rules():RulesView;
 derivePolicyEvents(upper:readonly EventInput[],lower:readonly EventInput[]):PolicyEvent[];
 timeliness(def:MacroSeriesDef,latestPeriodEnd:string|null,today:string):Timeliness;
}
export function memoryStrategyPort(f:StrategyFixture):StrategyReadPort;   // StrategyFixture 定义在 testing/fixture.ts
/** Production port. Returns null until WP-S6 wires P1+P2 (spec §9.1: strategy enabled + null port → 503). */
export function strategyPort():StrategyReadPort|null{return null;}
```

`memoryStrategyPort.derivePolicyEvents` 在夹具里实现 P2 Task 14 `derivePolicyEvents` 的同等语义（上限与下限同日配对，相邻有效日值变化 → 事件，`change_bp = toBp(upper_to − upper_from)`），只用于测试；生产端口在 WP-S6 直接调用 P2 函数。

### 测试夹具（Task 2，`testing/fixture.ts`；只被测试 import）

```ts
export interface StrategyFixture{
 catalog:MacroSeriesDef[];catalogVersion:string;rules:RulesView;
 snapshots:SnapshotRecord[];observations:ObservationRow[];   // all versions; memory port applies asOf / ok rules
 today?:string;
}
/** Catalog subset mirroring P1 §4.2 rows used by P3/P4 (ids, regions, roles, types, units, status, aliasOf, derive, changeKind,
 *  releaseLagDays exactly as in the P1 spec table) plus the P3 addition US_FED_TARGET_D. */
export const FIXTURE_CATALOG:MacroSeriesDef[];
/** Projection of P1 regime.ts RULES (P1 spec §5.2 table order) with P1's real rule ids ('policy.lt2_5', 'infl.gt4', …). */
export const FIXTURE_RULES:RulesView;
/** Observation builder: deterministic ids `obs:<series>:<period_end>:v<version>`; available_at default `${period_end}T12:00:00Z`. */
export function obs(seriesId:string,periodEnd:string,valueText:string,o?:{version?:number;availableAt?:string;status?:ObservationRow['status']}):ObservationRow;
/** Monthly series helper: one month-end observation per entry starting at firstMonth ('YYYY-MM'); null = gap. */
export function monthly(seriesId:string,firstMonth:string,values:(string|null)[],o?:{availableAt?:string}):ObservationRow[];
/** Daily helper: one observation per listed date. */
export function daily(seriesId:string,points:[string,string][]):ObservationRow[];
/** Snapshot builder: id `snap:<region>:<created_at>`, status active unless given. */
export function snap(region:Region,createdAt:string,observationIds:string[],o?:{historyIds?:string[];status?:SnapshotRecord['status'];counts?:SnapshotRecord['catalog_counts']}):SnapshotRecord;
/** Fed target fixture: DFEDTAR 2007-2008 single target incl. 2008-12-15 = 1.00, DFEDTARU/L from 2008-12-16 (0.25/0) and the
 *  2015-12-17, 2022-03-17 … 2023-07-27, 2024-09-19 changes (values from FRED; effective dates as published). */
export function fedTargetFixture():ObservationRow[];
export function fixture(over?:Partial<StrategyFixture>):StrategyFixture;   // defaults: FIXTURE_CATALOG, FIXTURE_RULES, no snapshots/observations
```

### `StrategyDb`（Task 3，`db.ts`）

```ts
export class StrategyDbError extends Error{constructor(readonly code:'stale_generation'|'payload_conflict'|'invalid_transition'|'not_found'|'cutoff_mismatch'|'invalid_argument'|'rpc_failed',message?:string){super(message??code);this.name='StrategyDbError';}}
export interface StrategyDb{
 putManifest(body:StrategyManifest):Promise<StoredManifest>;   // computes manifest_hash = sha256Hex(canonicalJson(body)); RPC macro_put_manifest; idempotent by hash
 manifest(id:string):Promise<StoredManifest|null>;                                                          // anon
 reviewCurrent(region:Region,month:string):Promise<{result:ReviewResult;generation:number;cutoff:string}|null>;   // anon
 reviewIndex(region:Region,months:number):Promise<{month:string;status:ReviewStatus;generation:number;result_id:string;updated_at:string}[]>;  // anon
 /** Immutable review result by id (anon): review explanations bind to result_id, never to the moving pointer. */
 reviewResult(resultId:string):Promise<ReviewResult|null>;
 publishReview(a:{region:Region;month:string;expectedGeneration:number;cutoff:string;status:ReviewStatus;manifestId:string;manifestHash:string;facts:ReviewFacts;methodVersion:string;codeVersion:string}):Promise<{result_id:string;generation:number;outcome:'advanced'|'replayed'|'stale'}>;   // RPC macro_publish_review; absent pointer = generation 0; stale is a return value, never thrown
 recordReviewAttempt(region:Region,month:string,status:'failed',error:Record<string,unknown>):Promise<void>;   // service
 /** Admin-side lookup used for idempotent replay before any other check (spec §6.3 step 2). */
 runOf(userId:string,requestId:string):Promise<{explanation_id:string;payload_hash:string;state:ExplanationState}|null>;
 /** RPC generates explanation_id and usage_audit_key; ONLY outcome 'claimed' may bill or call the model. payload_conflict throws. */
 claimExplanation(a:{userId:string;requestId:string;payloadHash:string;subjectKind:'snapshot'|'review';subjectId:string;locale:'zh'|'en';manifestId:string}):Promise<{outcome:'claimed'|'existing';explanation_id:string;usage_audit_key:string;projection:ExplanationProjection}>;
 /** RPC macro_record_completion: durable raw output + the exact finalizeUsageRun payload, right after the provider returns
  *  (or throws, or begin fails) and before validation / finish; running or abandoned rows; same values → no-op. */
 recordCompletion(a:{explanationId:string;rawOutput:unknown;finalizePayload:Record<string,unknown>}):Promise<void>;
 /** running → final; same final state + same raw output → idempotent; other final → invalid_transition; abandoned → late_output only.
  *  finalizePayload is stored atomically when the row has none yet (a failed recordCompletion), never overwritten (plan audit R2-2). */
 finishExplanation(a:{explanationId:string;state:'accepted'|'rejected'|'failed';provider:string|null;model:string|null;promptVersion:string;validatorVersion:string;rawOutput:unknown;validation:Record<string,unknown>;rendered:RenderedExplanation|null;failureCodes:string[];accounting:unknown;finalizePayload:Record<string,unknown>|null}):Promise<ExplanationProjection>;
 markFinalized(explanationId:string):Promise<void>;   // RPC macro_mark_finalized; needs a recorded finalize payload; any state; idempotent
 /** RPC macro_expire_explanations: the user's running rows claimed > 5 minutes ago WITHOUT a recorded completion → abandoned
  *  (projection failed); a row whose raw output is recorded is left for completion recovery (plan audit R2-1). */
 expireExplanations(userId:string):Promise<number>;
 /** Admin read of one run row for completion recovery and settlement (plan audit R2-1 / R2-2); non-uuid → null without a query. */
 runDetail(explanationId:string):Promise<RunDetail|null>;
 /** Admin: ids of the user's running rows with a recorded raw output, oldest claim first, at most `limit` (GET recovery). */
 recoverableRuns(userId:string,limit:number):Promise<string[]>;
 explanationsOf(client:'session',subjectKind:'snapshot'|'review',subjectId:string,limit:number):Promise<ExplanationProjection[]>;   // user session client (RLS)
}
export function supabaseStrategyDb(c:{admin:SupabaseClient;anon:SupabaseClient;session?:SupabaseClient}):StrategyDb;
/** A run row as completion recovery reads it (service role). */
export interface RunDetail{explanation_id:string;user_id:string;state:ExplanationState;locale:'zh'|'en';manifest_id:string;usage_audit_key:string;raw_output:unknown;finalize_payload:Record<string,unknown>|null;finalized:boolean}
export type MemRunView={state:ExplanationState;raw_output:unknown;finalize_payload:Record<string,unknown>|null;finalized:boolean;late_output:unknown};
export function memoryStrategyDb(opts?:{now?:()=>Date}):StrategyDb&{_userId:(id:string)=>void;_run:(explanationId:string)=>MemRunView|null};   // _userId sets the RLS identity for explanationsOf; _run inspects a run row (tests)
```

`db.ts` 另有骨架之外的导出（签名本身不变）：`StrategyTransport`、`SelectSpec`、`ReadRole`、`StrategyTable`、`strategyDbOver(transport)`、`supabaseTransport`、`toStrategyDbError`、`projectionFrom`、`MAX_SELECT`、`hasRecordedCompletion`、`RECOVERY_SCAN`——让同一份映射代码在集成测试里跑 node-postgres（`supabaseStrategyDb(c) = strategyDbOver(supabaseTransport(c))`）。哈希来自 `hash.ts`（Task 3）：`canonicalJson`、`sha256Hex`；`manifest.ts`（Task 4）再导出二者并加 `manifestHash(body)`。

RPC 语义见规格 §4.4（第 5 稿，逐字）。`claimExplanation` 先对运行行 `FOR UPDATE` 再读状态；遇 `running`、`claimed_at` 早于 5 分钟且**未登记完成**（`raw_output` 不是 JSON 对象）→ RPC 原子改 `abandoned`（投影 `failed`、`failure_codes=['abandoned']`）并返回 `existing`；已登记完成的 `running` 行不放弃，留给完成恢复（计划审计 R2-1）。`finishExplanation` 带结算载荷：行上尚无载荷时原子写入，已有则不覆盖（计划审计 R2-2）。`RunDetail`（`runDetail` 的返回类型）属于上面的接口清单。迁移一共八个 RPC：`macro_put_manifest`、`macro_publish_review`、`macro_record_review_attempt`、`macro_claim_explanation`、`macro_record_completion`、`macro_finish_explanation`、`macro_mark_finalized`、`macro_expire_explanations`。改运行行的 RPC（认领、完成登记、终态、结算标记、过期）都先 `FOR UPDATE` 锁该行。

### 依赖注入（Task 11 / 12）

```ts
export interface F4Client{   // f4-client.ts；fetch 本站 /api/judgments*，3 秒超时；任何失败 → throw F4Unavailable
 latestRegimeCard(region:Region,opts?:{asOf?:string}):Promise<F4CardLite|null>;
 judgmentDetail(id:string):Promise<F4JudgmentDetail|null>;
 history(id:string,before:string|null,limit:number):Promise<F4CardLite[]>;
}
export interface F4CardLite{judgment_id:string;lifecycle:string;calibration:string;as_of:string;methodology:{id:string;version:string};selected:Regime|null}
export interface F4JudgmentDetail{judgment_id:string;as_of:string;selected:Regime|null;
 inputs:{kind:string;ref:Record<string,unknown>;snapshot:Record<string,unknown>}[];
 settlements:{settlement_id?:string;outcome:string|null;realized:unknown;evidence:Record<string,unknown>|null;settled_at:string}[]}
export class F4Unavailable extends Error{}
// F4CardLite / F4JudgmentDetail are declared in f4-types.ts (Task 6, so playbooks.ts can use them before Task 11);
// f4-client.ts (Task 11) imports and re-exports them, never redeclares. settlement_id is optional: deviations.ts maps it to
// DeviationCase.settlement_id (null when F4 omits it).
export interface LlmDeps{   // explain-request.ts；生产实现包装计量链（Task 12），测试用假实现。顺序：resolve → (非 BYO) checkQuota → claim → begin → call → recordCompletion（原始输出 + finalizePayload，先于校验）→ 校验 → finish → finalize（finally 路径，finish 失败也执行）→ markFinalized（仅 finalize 成功后）；begin 失败 = 结果不明：同一审计键登记 failed 载荷并尝试 finalize
 resolve():Promise<{provider:string;model:string;byo:boolean}|null>;
 checkQuota():Promise<{allowed:boolean;used:number;limit:number}|null>;   // null = checkQuota threw (fail-open per perspectives route); limit -1 = unlimited
 begin(usageAuditKey:string,meta:Record<string,unknown>):Promise<void>;
 call(system:string,user:string):Promise<{content:string;accounting:unknown}>;
 /** The exact finalizeUsageRun payload (status, provider, model, tokens, cost, pricingVersion, usdCnyMicros, usageEstimated,
  *  byo), computed once at completion and stored on the run row; retries replay it verbatim. */
 finalizePayload(status:'completed'|'failed',accounting:unknown[]):Record<string,unknown>;
 /** finalizeUsageRun(userId, usageAuditKey, 'perspectives', payload) with the payload verbatim. */
 finalize(usageAuditKey:string,payload:Record<string,unknown>):Promise<void>;
}
/** Thrown by LlmDeps.call when the provider call failed; accounting = meteredUsageFromError(e) (null when none). */
export class LlmCallError extends Error{constructor(message:string,readonly accounting:unknown|null=null){super(message);this.name='LlmCallError';}}
/** handleExplainRequest(d:ExplainDeps,userId,body):Promise<{status,body}> (Task 11); Task 12 passes productionLlmDeps(userId). */
/** codeVersion null = not configured: 503 code_version_unavailable, checked only after the idempotent replay. */
export interface ExplainDeps{db:StrategyDb;port:StrategyReadPort|null;llm:LlmDeps;now:()=>Date;codeVersion:string|null}
/** Completion recovery (plan audit R2-1 / R2-2; never calls the provider, never throws): a running row with a recorded raw
 *  output is validated / rendered again from that output and the manifest's frozen facts and finished (validator version
 *  changed → failed {validator_version_changed}); then a recorded, unsettled finalize payload is finalized verbatim and
 *  marked. POST replay runs it for the replayed run; GET /explanations runs recoverUserExplanations (≤ 3 rows). */
export function recoverExplanation(d:Pick<ExplainDeps,'db'|'llm'>,explanationId:string):Promise<void>;
export function recoverUserExplanations(d:Pick<ExplainDeps,'db'|'llm'>,userId:string,limit?:number):Promise<number>;
```

### 复盘截止规则（规格 §4.5、§6.2，第 3 稿）

- 复盘 `cutoff = monthCutoff(month)` = **次月 3 日 `00:00:00Z`**（`manifest.ts`，Task 4）；基线截止 = `monthCutoff(prevMonth(month))` = **本月 3 日 `00:00:00Z`**。比较的数据期仍是"本月月末 vs 上月月末"，截止只决定"何时已知"。
- 及时性 `today` = 截止日期（`utcDate(cutoff)`，即次月 3 日；一律取 UTC 日历日）；复盘判断节 F4 `asOf` = 同一日期（`route-helpers.ts::reviewAsOfDate`）。
- cron（`0 6 3 * *`）与手动 `?month=`：一个月份在其截止已过（`Date.parse(monthCutoff(m)) ≤ now`）后才算"已结束"（`isClosedMonth`）；默认月份 = 截止已过的最新月份（`lastClosedMonth`，3 日 06:00 UTC 运行时即上一个月）。

## 规格覆盖

| 规格节 | 内容 | 任务 |
|---|---|---|
| §0 / §0.2 | 两轮 Codex 处置（落点即下列各节） | 1–14 |
| §1.1 | 目标；成功标准 1（清单取值、精确推导、无占位）/ 2（无百分比得分与禁用词；判断层关闭时无 F4 字段）/ 3（`replay` 离线重算）/ 4（数字全由模板产生）/ 5（复盘同输入同结果、失败不动指针）/ 6（能力矩阵） | 1：4、6；2：6、10、12、14；3：8、9；4：10、11；5：1、3、9；6：2、12、14 |
| §1.2 | 范围外（不实现资产配置检验、不送判断入 LLM） | 6（`PLAYBOOK_DISCLAIMER_V1`）、9（解读事实不含判断） |
| §2 | 登录、参数白名单、`private, max-age=300`、投影行 RLS、service-only 原始输出、判断节只读 F4 | 1、3、12 |
| §3.1–§3.7 | 四个路由、UI 流程、传导页、历史页、复盘页、解读面板五态、移动端 | 13、14 |
| §3.8 | 设计约束（tokens、mono 数字、表格视图、双语） | 13 |
| §4.1 | P1+P2 契约结构镜像 | 2 |
| §4.2 | 目录增补 `US_FED_TARGET_D`（夹具中；生产在 WP-S6） | 2 |
| §4.3 | `StrategyReadPort`、`memoryStrategyPort`、`strategyPort()=null` | 2 |
| §4.4 | 六表、八 RPC、权限与 RLS、N3 身份、N5 指针、N6 认领（行锁）、N7 完成幂等、完成登记与结算载荷、过期 | 1、3 |
| §4.5 | 策略清单：身份 = 整体哈希（params 含计算参数）、N1 角色（未解析快照 id → 区域不完整）、N2 冻结目录 / 快照 / 读取状态 / 事件证据行 / 解读事实、取值规则、cutoff 规则（含复盘次月 3 日）、重放只读清单 | 3（`hash.ts`）、4、5、6–9 |
| §5.1 | 传导流（六段、节点状态、同期利差、假设边） | 6 |
| §5.2 | 剧本库（触发 = 规则投影、F4 三条件标记、无数字 `F4Summary`） | 6、12（判断层接入） |
| §5.3 | 政策反应矩阵（N 月窗口、资格、跨方向贪心、排除原因、n 阈值、利差端点、句子） | 7 |
| §5.4 | 政策事件合并（2008-12-15/16 切换、`transition_unverified` 缺口） | 5 |
| §5.5 | 政策行动段 × 资产表（三种边界、7 日规则、别名解析、`month_not_closed`） | 8 |
| §5.6 | 十进制、单次浮点、type-7 四分位、展示层舍入 | 4、13 |
| §6.1 | 事实（模板 + 槽位、`fact_id` 规则、快照解读清单） | 9 |
| §6.2 | 月度复盘（次月 3 日截止 / 本月 3 日基线、七节、行动段新开 / 结束、`runReview`、cron、判断节读时） | 4（`monthCutoff`）、9、12、13 |
| §6.3 | LLM 解读（模板事实句、无数字假设、校验步骤 1–7、预先认领、只有 claimed 计费、BYO、`limit=-1`、拒绝计完成、finalize 可重试、已登记完成的恢复不再调提供方） | 1、3、10、11、12（`llm-deps.ts`、GET 恢复）、13 |
| §6.4 | 偏差案例（分页、5000 上限、`macro_regime@v1`、穷尽分类、证据缺字段、`settlement_id`） | 6（`f4-types.ts`）、11、12、13 |
| §7 | 判断边界不变量 1–7 | 6、9、10、12、14 |
| §8 | 十个路由、错误形状、`version` / `manifest_id` | 12 |
| §9.1 | 能力矩阵与判定顺序（解读重放先于底座）、F4 本站 HTTP 3 秒 | 2、11、12、14 |
| §9.2 | 文件与所有权 | 本计划"文件结构" |
| §10 | i18n 域、zh/en 键与占位符一致、禁用词 | 10（`FORBIDDEN_TERMS`）、13、14 |
| §11 | 错误处理（截断、无快照、F4 不可用、载荷冲突、复盘并发、解读超时） | 1、4、6、7、11、12 |
| §12 | 测试策略（数据库、单元、replay、API、词汇扫描） | 1、3–12、14 |
| §13 | 性能与运维（环境变量、运行手册、结算核对脚本；LRU 见 D1） | 12、14 |
| §14 | WP-S1…S5 与验收样例 1（利差）/ 2（判断层关闭无 F4 字段）/ 3（2022-03-16 → 2023-07-26 行动段）/ 4（"3""三成" → rejected） | WP-S1：1–3；S2：4–8；S3：9–11；S4：12；S5：13–14；样例 1：6；2：12、14；3：8；4：10、11 |
| §15 | owner 默认（判断层默认关、受限列、`perspectives` 配额） | 2、7、8、11、12 |
| §16 | Claude Design 画布 | 13（按画布布局；实页对照在 WP-S6 后） |

## 执行顺序

严格串行 Task 1 → 14（同一时刻只有一个实施代理写代码）。依赖链：Task 3 的 `hash.ts` 被 Task 4 的 `manifest.ts` 再导出；Task 6 的 `f4-types.ts` 被 Task 11 再导出；Task 8 的 `replay.test.ts` import Task 6、7 的构建器，Task 9 往里追加复盘块并依赖 Task 5 / 8 的 `readPolicyEvents`、`policyEpisodes`；Task 11 依赖 Task 9（事实）与 Task 10（渲染 / 校验 / 提示）；Task 12 依赖 1–11；Task 13 依赖 Task 10（`renderFact`、`FORBIDDEN_TERMS`）与 Task 12（`route-helpers.ts` 的响应类型）；Task 14 依赖 13。共享 `contract.ts` 在 Task 2 之后不改。每个任务提交后由指挥方复审并写实施日志。

## 已知偏差与开放项

整合时的决定（实施代理按此执行，不再请示）：

| # | 事项 | 决定 |
|---|---|---|
| D1 | 规格 §4.5 的进程内清单 LRU 未实现：每个事实请求重建清单并 `putManifest`（按哈希幂等，结果正确）。§13 的延迟目标（p95 < 500 ms，命中 < 100 ms）在 WP-S6 有真实端口前无法测量 | 推迟到 WP-S6：接线后测延迟，不达标再在 `route-helpers.ts` 加 LRU，键 `(kind, params, 两区域快照 id, cutoff, catalog_version, code_version)`（清单与缓存都按 `(kind, params)` 区分）；runbook 记一行 |
| D2 | `resolveCodeVersion({allowGit:false})` 为 null | 写清单的路由（传导、矩阵、历史、解读 POST）与 cron 返回 503 `code_version_unavailable`，不把 `'unknown'` 冻结进清单身份（Vercel 上 `VERCEL_GIT_COMMIT_SHA` 恒有；本地 `next dev` 需手动设） |
| D3 | 复盘解读的主体 id（计划审计 #5 改） | 不可变的 `result_id`（uuid）：`StrategyDb.reviewResult(id)`（anon 读 `macro_review_results`）取结果，解读主体 id = `result_id`，`GET /explanations` 按它过滤，`ReviewView` 传正在显示的 `result.result_id`。不再用 `<region>:<YYYY-MM>`（指针前移后会把旧解读挂到新结果旁） |
| D4 | 未配置模型 | 503 `llm_not_configured`（perspectives 路由返回 200 `source:'no-key'`，本模块统一错误形状）；另有 422 `no_facts` |
| D5 | 提示文件经 `readFileSync(new URL('./prompts/…md', import.meta.url))` 读取，vitest 下必然可用，生产打包未经验证 | Task 14 Step 7 的 `npm run build` + `.next/server` 内容检查是硬门槛；失败则改为 `.ts` 字符串常量（测试不变） |
| D6 | `vercel.json` 只追加；P1 计划也追加 `/api/cron/macro-sync` | rebase 时手工合并 `crons` 数组，两条都保留；`routes.test.ts` 只断言本条存在 |
| D7 | 链接在 WP-S6 前 404：tab "宏观工作台"（`/intel/macro`）、观测节点与 watch 链接（`/intel/macro/<seriesId>`）、F4 方法链接（`/intel/methods/<id>/<version>`） | 接受；runbook §2 列出，WP-S6 验收时逐一点开 |
| D8 | 规格 §4.3 原写 `snapshotsUpTo`，第 3 稿已改为 `snapshotUpTo` | 计划全程用 `snapshotUpTo` |
| D9 | 规则 id | 夹具与剧本触发用 P1 `regime.ts` 的真实 id（`policy.lt2_5`、`infl.gt4` …），与 WP-S6 生产端口投影一致 |
| D10 | `ManifestInput.role` 标签 | 增加 `history`（整段日频窗口，历史表列）；`contract.ts` 注释已同步（骨架与 Task 2 逐字相同） |
| D11 | `F4JudgmentDetail.settlements[].settlement_id` | 加为可选字段（`f4-types.ts`、骨架）；`f4-client` 只保留字符串值；`deviations.ts` 直接读，缺 → `null` |
| D12 | 运行中 / 超时放弃的投影 `prompt_version` / `validator_version` 为 `''`（认领 RPC 不带版本参数，§4.4 签名不变） | 接受；`finish` 后为真实版本 |
| D13 | 迁移另有一个不可调用的内部函数 `macro_explanation_projection(uuid)`（三个 RPC 共用的投影 JSON），不计入"八个 RPC" | 接受；Task 1 测试断言没有任何 API 角色能执行它 |
| D14 | `recordReviewAttempt` 的 `status` 只能是 `'failed'`；`ok` / `replayed` / `stale` 尝试行只由 `macro_publish_review` 写 | 接受 |
| D15 | CN 复盘也列出联储事件与行动段（联储政策是两区域传导的共同锚） | 接受；若 owner 只要 US，在 `reviewFromManifest` 按 `region==='US'` 过滤第 4、5 节 |
| D16 | 接口在规格 §8 之外的增补：传导无任何 active 快照 → 404 `no_published_snapshot`；复盘详情加 `names`、`judgment_status`、`f4?`；`GET /explanations` 返回 `{items}` | 接受（§9.1 把复盘详情列为组合路由） |
| D17 | 复盘判断节用 `selectF4Mark({card, detail, snapshotId:null}).summary`：非 `macro_regime@v1` 或非 open / settled 的卡显示"判断层暂不可用" | 接受 |
| D18 | 词汇扫描用完整 `FORBIDDEN_TERMS`（含"将会""必然""odds""chance of""will rise"），比仓库约定的五个词更严 | 接受；命中时改写所在任务的数据 / 提示文件 |
| D19 | F4 读接口细节未与 F4 实现核对：history 游标（`before` = 上一页末条 `as_of`，排他；只凭时间戳游标越过任何**满页** → 无法证明完整 → `incomplete:true`，继续翻页收集；游标不前进 → 停止并 `incomplete`；计划审计 R2-3）、响应接受 `{cards}` 或 `{items}`、`realized` 的形状、`f4.calibrationState.*` 的四个值 | WP-S6 接线时核对并改 `f4-client.ts` / 文案；**开放项**：请 F4 提供稳定游标 `(as_of, judgment_id)`，有了之后 `deviations.ts` 改用它，满页不再标记不完整 |
| D20 | 画布对照（§14 WP-S5 退出条件）在 WP-S6 前只能看到"底座未就绪"态 | 数据态的浏览器走查放到 WP-S6 |
| D21 | `numeric.ts` 用 BigInt 自实现十进制（P1 `decimal.ts` 不在 main） | WP-S6 可换回 P1 实现；`replay` 夹具哈希必须不变 |
| D22 | 计划审计 #6–#8：解读结算的持久化 | 迁移新增 `finalize_payload` 列与 `macro_record_completion`：提供方返回（或抛错、或 begin 失败）后、校验 / finish 之前，先存原始输出与 `finalizeUsageRun` 的完整参数（含状态、定价版本、汇率、聚合计量）；finish 之后在 finally 路径里用存下的载荷原样 `finalize`，成功才 `markFinalized`（`macro_mark_finalized` 要求已登记载荷，任何状态都可）。恢复：对 `finalize_payload` 非空且 `finalized=false` 的行（含 `abandoned`、含 finish 失败仍为 `running` 的行）原样重试（runbook §4，`scripts/macro/strategy-reconcile.ts`）。`recordCompletion` 自身失败时不阻断 finish / finalize；finish 在行上尚无载荷时原子写入同一载荷（计划审计 R2-2），所以之后的恢复仍按已存载荷结算、不重算定价 |
| D23 | 计划审计 #14：进程死亡后的 `running` 投影 | 迁移新增 `macro_expire_explanations(p_user_id)`：`GET /explanations` 读之前用 admin 客户端调用，把该用户超过 5 分钟、**未登记完成**的 `running` 行改 `abandoned`（投影 `failed`、`['abandoned']`；已登记原始输出的行留给完成恢复，计划审计 R2-1）；面板在 `running` 时提示"超过 5 分钟刷新即标记失败"，失败态用新的 `request_id` 重新生成 |
| D24 | 计划审计 #10：百分比变化的舍入 | 事实与视图都存精确比值 `'<末>/<基>'`（`numeric.ts::pctRatio`；事实单位 `pct_ratio`），展示时 `roundPctRatio` 只舍入一次（BigInt，远离零）；不再有 4 位小数的中间值 |
| D25 | 计划审计 #11：事件源读取被截断 | `readPolicyEvents` 返回 `gaps:[{kind:'history_truncated', reason:<序列>, near:<截止日>}]`（`EventGap.kind` 增加该值）；历史表显示"事件序列读取被截断"而不是"没有行动段"；复盘第 4、5 节各放一条 `events_truncated` 事实；矩阵沿用读取状态整列 `missing` |
| D26 | 计划审计 R2-1：已付费的完成无法投影 | 认领 RPC 与 `macro_expire_explanations` 跳过已登记 `raw_output` 的 `running` 行；`explain-request.ts::recoverExplanation` 只凭已存原始输出（完成信封 `{content, provider, model, prompt_version, validator_version, accounting}`）与清单冻结事实重新校验 / 渲染并 finish，绝不再调提供方；校验器版本与信封不同 → `failed {validator_version_changed}`；随后对未结算载荷原样 `finalize` 并标记。POST 幂等重放对该运行执行一次；`GET /explanations` 对本人至多 3 行执行（`recoverUserExplanations`），再过期、再读取 |
| D27 | 计划审计 R2-4：结算核对 | `finalizeUsageRun` 只抛 `usage_audit_unavailable`（含 `usage run not found` 与瞬时错误）或 `usage_audit_invariant`（`usage run finalize conflict`），不能据此分类；`scripts/macro/strategy-reconcile.ts`（逻辑在 `src/lib/macro/strategy/reconcile.ts`，假客户端单测）按 `usage_events.idempotency_key` 查行分 absent / pending / settled / conflict 处理，runbook §4 按它重写 |

已闭合（不再是开放项）：Part C 提出的"资产月末值在月末截止时不可得"——规格第 3 稿把复盘截止改为次月 3 日 `00:00:00Z`，Task 4 / 9 / 12 已按新规则实现与测试。

---

## Part A — 存储、契约与夹具（Task 1–3）

Part A 串行：Task 1 → 2 → 3。Task 1 只落迁移与数据库测试（不 import 任何 `src/lib/macro/strategy/*.ts`）；Task 2 落共享契约、开关、端口与测试夹具；Task 3 落 `StrategyDb`（Supabase + 内存）与两实现共用的契约用例，并把契约用例追加到 Task 1 的集成测试。迁移在 Task 1 一次写全并锁定，之后任何任务都不改它。

所有数据库命令用单文件运行器 `.claude/scratch/db-one.ts`（未提交；Task 1 Step 2 给出内容，已存在则不动）。

---

### Task 1: Migration, lock, database types, integration suite

**Files:**
- Create: `supabase/migrations/20261115090000_macro_strategy.sql`
- Create: `src/lib/macro/strategy/strategy.integration.test.ts`
- Modify: `supabase/migrations.lock.json`（只追加一条）
- Modify: `src/lib/supabase/database.types.ts`（三处 `// MACRO-P3` … `// /MACRO-P3` 块）
- Modify: `scripts/ci/research-checks.ts`（`criticalSuites` 的 `// MACRO-P3` 块）
- Create (untracked, never commit): `.claude/scratch/db-one.ts`（若不存在）

Notes for the implementer:
- 规格 §4.4（第 5 稿）是唯一依据：六表、八个 `security definer` RPC（`macro_put_manifest`、`macro_publish_review`、`macro_record_review_attempt`、`macro_claim_explanation`、`macro_record_completion`、`macro_finish_explanation`、`macro_mark_finalized`、`macro_expire_explanations`）。另有一个**内部**辅助函数 `macro_explanation_projection(uuid)`（三个 RPC 共用的投影 JSON），它对 `public, anon, authenticated, service_role` 全部 revoke，不是 RPC。
- 迁移不引用 P1 / F4 的表（无外键出模块）；模块内的外键（结果 → 清单、指针 → 结果、运行 / 投影 → 清单）保留。`user_id` 不加 `auth.users` 外键。
- RPC 用 `raise exception '<code>'` 抛错（SQLSTATE P0001，message 恰为代码）：`not_found`、`payload_conflict`、`invalid_transition`、`invalid_status`、`invalid_argument`（`macro_publish_review` 的期望代际为 null）、`cutoff_mismatch`（`p_cutoff` 与已存清单的 `cutoff` 列不等）。表约束违例是 23514。
- 改运行行的 RPC（认领、完成登记、终态、结算标记、过期）都先 `select … for update` 锁该行再读状态（计划审计 #1）：过期的认领不会覆盖并发提交的终态。集成测试用"一个连接开事务先执行 A、另一连接执行 B 必须等锁、提交后看 B 的结果"验证两种先后。
- 结算持久化（计划审计 #6–#8）：`finalize_payload jsonb`（`status ∈ completed/failed` 的对象）由 `macro_record_completion` 在提供方返回后、校验 / 终态之前写入（只限 `running` 或 `abandoned` 行——**先**检查状态，终态行即使存的值相同也 → `invalid_transition`（Codex #5）；同值重复 = 无操作；已有不同值 → `invalid_transition`）；CHECK 写成 `(…) is true`，缺失或 JSON null 的 `status` / `kind` 一律 23514（Codex #4）；`running` 行上已登记完成时，`macro_finish_explanation` 只接受与已登记 `raw_output` 相同（含 null）的输出，否则 `invalid_transition`，已登记的包络不被改写（Codex #1）；`macro_mark_finalized` 只要求已登记载荷（任何状态，含 finish 失败仍为 `running` 的行与 `abandoned` 行）；未结算索引按 `finalize_payload is not null and finalized = false`。
- `macro_finish_explanation` 多一个参数 `p_finalize_payload jsonb`（计划审计 R2-2）：行上 `finalize_payload` 为空时在同一事务内写入（running、abandoned 与幂等重放三个分支都如此），已有值绝不覆盖；`macro_record_completion` 失败而 finish 成功时，结算载荷因此仍落库，之后的恢复按它结算。
- 已登记完成不放弃（计划审计 R2-1）：认领 RPC 的 5 分钟放弃与 `macro_expire_explanations` 都跳过 `raw_output is not null` 的 `running` 行（提供方已返回、原始输出已持久化），这些行由服务端的完成恢复（Task 11 `recoverExplanation`）只凭已存输出 finish。
- `macro_expire_explanations(p_user_id)`（计划审计 #14）：把该用户 `claimed_at` 早于 5 分钟且未登记完成的 `running` 行改 `abandoned`、投影 `failed {abandoned}`，返回条数；`GET /explanations` 读之前调用。
- "超过 5 分钟放弃"用 `now()` 判定；测试通过把 `claimed_at` 往回挪（`update … set claimed_at = claimed_at - make_interval(mins => n)`，测试连接是超级用户）使它可测，RPC 签名不加时钟参数。
- `macro_publish_review` 里 `stale` 是返回值：函数正常返回、事务提交、尝试日志落一行 `stale`。指针不存在 = 代际 0。前置校验：期望代际为 null → `invalid_argument`；清单（id + hash + kind=review）不存在 → `not_found`；`p_cutoff` 不等于该清单的 `cutoff` → `cutoff_mismatch`（RPC 签名不变，参数仍传，但必须等于清单的冻结截止；指针的 `cutoff` 因而总是其证据的截止）。判定顺序固定：①指针已指向该结果 → `replayed`（无论期望代际）；②代际 `is distinct from` 期望 → `stale`；③`p_cutoff` 早于当前 `cutoff` → `stale`；④前移。
- 本地 harness 的 `auth.uid()` 读 `request.jwt.claim.sub`；测试以 `set local role authenticated` + `set_config('request.jwt.claim.sub', …, true)` 模拟登录用户。
- 测试数据不清理（`test:db` 每次新建库）；每个用例用自己的月份（随机年份起的连续月份）与随机 uuid，复跑同一个库也不冲突。

- [ ] **Step 1: Write the failing integration test**

Create `src/lib/macro/strategy/strategy.integration.test.ts`（Task 3 会在文件头追加 4 行 import、在文件尾追加契约段；此步只写下面的内容）：

```ts
// src/lib/macro/strategy/strategy.integration.test.ts
// Macro strategy storage on real PostgreSQL (spec §4.4 draft 3, §12; critical suite): the 20261115090000 migration
// replays; six RLS tables with select-only grants per role; the projection is readable only by its owner; the eight
// RPCs are service-role only; every RPC state-machine branch: macro_put_manifest idempotency, macro_publish_review
// (absent pointer = generation 0, replayed before stale, A→B→A, stale generation, older cutoff, concurrency, attempt
// log), macro_record_review_attempt, macro_claim_explanation (claimed / existing / payload_conflict / abandoned after
// five minutes — made testable by moving claimed_at back), the row lock shared by claim / expire and finish (an expiring
// claim never overwrites a concurrent finish), macro_record_completion (durable raw output + finalize payload),
// macro_finish_explanation (idempotent, invalid_transition, late_output, stores a missing finalize payload, never
// overwrites one), macro_mark_finalized (needs a recorded payload, any state) and macro_expire_explanations; a running row
// with a recorded completion is never abandoned (claim and expire skip it); publish rejects a cutoff that differs from the manifest's and a
// null expected generation; record_completion rejects terminal rows; finish cannot replace a recorded output; JSON-null/missing status and kind are
// rejected by the CHECKs. Rows are never cleaned up: test:db creates a fresh database per run, and
// every case uses its own month or random user / request ids.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261115090000_macro_strategy.sql';
const TABLES=['macro_strategy_manifests','macro_review_results','macro_review_current','macro_review_attempts','macro_explanation_runs','macro_explanations'];
const PUBLIC_READ=['macro_strategy_manifests','macro_review_results','macro_review_current'];
const SERVICE_ONLY=['macro_review_attempts','macro_explanation_runs'];
const RPCS=['public.macro_put_manifest(text,jsonb,text,timestamptz,text,text,text)','public.macro_publish_review(text,text,bigint,timestamptz,text,uuid,text,jsonb,text,text)',
 'public.macro_record_review_attempt(text,text,text,jsonb)','public.macro_claim_explanation(uuid,uuid,text,text,text,text,uuid)',
 'public.macro_record_completion(uuid,jsonb,jsonb)','public.macro_finish_explanation(uuid,text,text,text,text,text,jsonb,jsonb,jsonb,text[],jsonb,jsonb)',
 'public.macro_mark_finalized(uuid)','public.macro_expire_explanations(uuid)'];

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}
type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const HEX=(c:string)=>c.repeat(64);
// A month no other case uses: consecutive months from a random year in 3000–4999 (contract cases use 6000+), so a rerun
// against a reused database does not collide either.
let monthSeq=(3000+Math.floor(Math.random()*2000))*12;
const freshMonth=()=>{const n=monthSeq++;return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;};

describe.skipIf(!enabled)('macro strategy migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 /** Runs `sql` as `role` (optionally with auth.uid() = sub) in its own rolled-back transaction. */
 const asRole=async(role:string,sql:string,values:unknown[]=[],sub?:string)=>{
  const c=await admin.connect();
  try{
   await c.query('begin');
   if(sub)await c.query(`select set_config('request.jwt.claim.sub',$1,true)`,[sub]);
   await c.query(`set local role ${role}`);
   return (await c.query(sql,values)).rows as Record<string,any>[];
  }finally{await c.query('rollback').catch(()=>{});c.release();}
 };
 const manifestBody=(kind:string,salt:string=randomUUID())=>({kind,params:{salt},cutoff:'3000-01-31T23:59:59.000Z',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],catalog_version:'cv',method_version:'mv',code_version:'code'});
 /** macro_put_manifest with an explicit hash (the TS side computes sha256 of the canonical body; any hex64 works here). */
 const put=(kind:string,hash:string,body:Record<string,unknown>=manifestBody(kind),cutoff='3000-01-31T23:59:59Z')=>
  one(`select public.macro_put_manifest($1,$2::jsonb,$3,$4,'mv','code','cv') v`,[kind,JSON.stringify(body),hash,cutoff]) as Promise<string>;
 const newHash=()=>randomUUID().replace(/-/g,'').padEnd(64,'0');
 const reviewManifest=async(cutoff='3000-01-31T23:59:59Z')=>{const h=newHash();return {id:await put('review',h,manifestBody('review'),cutoff),hash:h,cutoff};};
 const publish=(region:string,month:string,expected:number|null,m:{id:string;hash:string;cutoff?:string},cutoff=m.cutoff??'3000-01-31T23:59:59Z')=>
  one(`select public.macro_publish_review($1,$2,$3,$4,'ok',$5,$6,$7::jsonb,'macro-review/1','code') v`,[region,month,expected,cutoff,m.id,m.hash,JSON.stringify({region,month})]) as Promise<{result_id:string;generation:number;outcome:string}>;
 const pointer=async(region:string,month:string)=>(await q(`select result_id,generation::int generation,cutoff from public.macro_review_current where region=$1 and month=$2`,[region,month]))[0]??null;
 const attempts=async(region:string,month:string)=>(await q(`select status,result_id from public.macro_review_attempts where region=$1 and month=$2 order by created_at,attempt_id`,[region,month]));
 const explainManifest=()=>put('explain_facts',newHash());
 type Claim={outcome:string;explanation_id:string;usage_audit_key:string;projection:Record<string,any>};
 const claim=(a:{user:string;request:string;payload?:string;manifest:string})=>
  one(`select public.macro_claim_explanation($1,$2,$3,'review','subject-1','zh',$4) v`,[a.user,a.request,a.payload??HEX('a'),a.manifest]) as Promise<Claim>;
 const newClaim=async()=>{const a={user:randomUUID(),request:randomUUID(),manifest:await explainManifest()};return {a,c:await claim(a)};};
 const FINISH_SQL=`select public.macro_finish_explanation($1,$2,'prov','model','macro-explain-prompt/1','macro-explain-validator/1',$3::jsonb,'{"ok":true}'::jsonb,$4::jsonb,$5::text[],$6::jsonb,$7::jsonb) v`;
 type FinishOpts={rendered?:unknown;codes?:string[];accounting?:unknown;payload?:unknown};
 const finishArgs=(id:string,state:string,raw:unknown,o:FinishOpts={})=>
  [id,state,JSON.stringify(raw),o.rendered===undefined?null:JSON.stringify(o.rendered),o.codes??[],JSON.stringify(o.accounting??{tokens:1}),o.payload===undefined?null:JSON.stringify(o.payload)];
 const finish=(id:string,state:string,raw:unknown,o:FinishOpts={})=>
  one(FINISH_SQL,finishArgs(id,state,raw,o)) as Promise<Record<string,any>>;
 const PAYLOAD={status:'completed',provider:'prov',model:'model',inputTokens:3,outputTokens:2,costMicrormb:5,pricingVersion:'p1',usdCnyMicros:7100000,usageEstimated:false,byo:false};
 const record=(id:string,raw:unknown,payload:unknown=PAYLOAD)=>
  one(`select public.macro_record_completion($1,$2::jsonb,$3::jsonb) v`,[id,JSON.stringify(raw),payload===null?null:JSON.stringify(payload)]);
 const expire=(user:string)=>one(`select public.macro_expire_explanations($1) v`,[user]) as Promise<number>;
 const run=async(id:string)=>(await q(`select state,finalized,raw_output,finalize_payload,accounting,late_output,finished_at from public.macro_explanation_runs where explanation_id=$1`,[id]))[0];
 /** Runs `first` in an open transaction, starts `second` (which must wait on the row lock), commits, then awaits `second`. */
 const serialized=async<T>(first:{sql:string;values:unknown[]},second:()=>Promise<T>):Promise<T>=>{
  const c=await admin.connect();
  try{
   await c.query('begin');await c.query(first.sql,first.values);
   const pending=second();await sleep(300);
   await c.query('commit');
   return await pending;
  }catch(e){await c.query('rollback').catch(()=>{});throw e;}
  finally{c.release();}
 };
 const age=(id:string,minutes:number)=>q(`update public.macro_explanation_runs set claimed_at=claimed_at-make_interval(mins=>$2) where explanation_id=$1`,[id,minutes]);
 const RENDERED={facts:[{fact_id:'f1',text:'t'}],hypotheses:[{text:'h',fact_ids:['f1']}],counterpoints:[]};

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl,statement_timeout:10000});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates six RLS tables with select-only grants, eight service-only RPCs, and replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const t of PUBLIC_READ)for(const role of ['anon','authenticated','service_role'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
  for(const t of SERVICE_ONLY){for(const role of ['anon','authenticated'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:false});expect(await priv('service_role',t,'SELECT')).toBe(true);}
  expect(await priv('anon','macro_explanations','SELECT')).toBe(false);
  expect(await priv('authenticated','macro_explanations','SELECT')).toBe(true);
  expect(await priv('service_role','macro_explanations','SELECT')).toBe(true);
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const sig of RPCS){
   for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
   expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
  }
  for(const role of ['anon','authenticated','service_role'])expect(await fn(role,'public.macro_explanation_projection(uuid)')).toBe(false);
  for(const sig of RPCS)expect(await one(`select p.prosecdef v from pg_proc p where p.oid=$1::regprocedure`,[sig])).toBe(true);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },60000);

 it('RLS: anon reads manifests and reviews, never runs, attempts or projections; a user reads only their own projection',async()=>{
  const m=await reviewManifest();const month=freshMonth();await publish('US',month,0,m);
  expect((await asRole('anon',`select manifest_id from public.macro_strategy_manifests where manifest_id=$1`,[m.id])).length).toBe(1);
  expect((await asRole('anon',`select result_id from public.macro_review_current where month=$1`,[month])).length).toBe(1);
  expect((await asRole('anon',`select result_id from public.macro_review_results where month=$1`,[month])).length).toBe(1);
  for(const t of [...SERVICE_ONLY,'macro_explanations'])await expect(asRole('anon',`select 1 from public.${t}`)).rejects.toMatchObject({code:'42501'});
  for(const t of SERVICE_ONLY)await expect(asRole('authenticated',`select 1 from public.${t}`,[],randomUUID())).rejects.toMatchObject({code:'42501'});
  const {a,c}=await newClaim();
  expect((await asRole('authenticated',`select explanation_id from public.macro_explanations where explanation_id=$1`,[c.explanation_id],a.user)).map(r=>r.explanation_id)).toEqual([c.explanation_id]);
  expect(await asRole('authenticated',`select explanation_id from public.macro_explanations where explanation_id=$1`,[c.explanation_id],randomUUID())).toEqual([]);
  expect(await asRole('authenticated',`select explanation_id from public.macro_explanations where explanation_id=$1`,[c.explanation_id])).toEqual([]);   // no auth.uid()
  for(const role of ['anon','authenticated'])await expect(asRole(role,`select public.macro_mark_finalized($1)`,[c.explanation_id],randomUUID())).rejects.toMatchObject({code:'42501'});
  for(const role of ['anon','authenticated'])await expect(asRole(role,`insert into public.macro_strategy_manifests(kind,body,manifest_hash,cutoff,method_version,code_version,catalog_version) values('review','{"kind":"review"}',$1,now(),'m','c','k')`,[newHash()],randomUUID())).rejects.toMatchObject({code:'42501'});
  expect((await asRole('service_role',`select public.macro_put_manifest('review',$1::jsonb,$2,now(),'m','c','k') v`,[JSON.stringify(manifestBody('review')),newHash()]))[0].v).toMatch(/^[0-9a-f-]{36}$/);
 });

 it('macro_put_manifest: same hash → same id; other hash → other id; same hash with another body → payload_conflict; checks hash, kind and body.kind',async()=>{
  const h=newHash();const body=manifestBody('transmission','x');
  const id=await put('transmission',h,body);
  expect(await put('transmission',h,body)).toBe(id);
  expect(await put('transmission',h,{...body})).toBe(id);   // jsonb equality ignores key order
  expect(await put('transmission',newHash(),manifestBody('transmission','y'))).not.toBe(id);
  expect(await fails(put('transmission',h,manifestBody('transmission','z')))).toMatchObject({message:'payload_conflict'});
  expect(await fails(put('transmission','ABC',body))).toMatchObject({code:'23514'});
  expect(await fails(put('weather',newHash(),{...body,kind:'weather'}))).toMatchObject({code:'23514'});
  expect(await fails(put('review',newHash(),body))).toMatchObject({code:'23514'});   // body.kind must equal kind
  expect(await q(`select kind,manifest_hash,cutoff=$2::timestamptz same_cutoff,method_version,code_version,catalog_version from public.macro_strategy_manifests where manifest_id=$1`,[id,'3000-01-31T23:59:59Z']))
   .toEqual([{kind:'transmission',manifest_hash:h,same_cutoff:true,method_version:'mv',code_version:'code',catalog_version:'cv'}]);
 });

 it('macro_publish_review: absent pointer = generation 0 → first publish 1; stale is a return value with an attempt row',async()=>{
  const month=freshMonth();const A=await reviewManifest();
  expect(await pointer('US',month)).toBeNull();
  const s=await publish('US',month,1,A);
  expect(s).toMatchObject({generation:0,outcome:'stale'});
  expect(await pointer('US',month)).toBeNull();
  const a=await publish('US',month,0,A);
  expect(a).toEqual({result_id:s.result_id,generation:1,outcome:'advanced'});   // the stale call already stored the immutable result
  expect(await pointer('US',month)).toMatchObject({result_id:a.result_id,generation:1});
  expect((await attempts('US',month)).map(r=>r.status)).toEqual(['stale','ok']);
  expect(await q(`select count(*)::int n from public.macro_review_results where region='US' and month=$1`,[month])).toEqual([{n:1}]);
 });

 it('macro_publish_review: replayed before stale; A→B→A moves the pointer back to the same A row; stale generation; older cutoff',async()=>{
  const month=freshMonth();const A=await reviewManifest(),B=await reviewManifest(),C=await reviewManifest('3000-01-30T00:00:00Z'),D=await reviewManifest('3000-02-01T00:00:00Z');
  const a1=await publish('US',month,0,A);expect(a1.outcome).toBe('advanced');
  expect(await publish('US',month,0,A)).toEqual({result_id:a1.result_id,generation:1,outcome:'replayed'});    // expected 0 is stale, but the pointer already is A
  expect(await publish('US',month,7,A)).toEqual({result_id:a1.result_id,generation:1,outcome:'replayed'});
  const b0=await publish('US',month,0,B);expect(b0).toMatchObject({generation:1,outcome:'stale'});
  const b1=await publish('US',month,1,B);expect(b1).toEqual({result_id:b0.result_id,generation:2,outcome:'advanced'});
  const a3=await publish('US',month,2,A);expect(a3).toEqual({result_id:a1.result_id,generation:3,outcome:'advanced'});
  expect(await publish('US',month,3,C)).toMatchObject({generation:3,outcome:'stale'});   // older cutoff never advances
  const c4=await publish('US',month,3,D);expect(c4).toMatchObject({generation:4,outcome:'advanced'});
  expect(await pointer('US',month)).toMatchObject({result_id:c4.result_id,generation:4});
  expect(new Date((await pointer('US',month)).cutoff).toISOString()).toBe('3000-02-01T00:00:00.000Z');
  expect((await attempts('US',month)).map(r=>r.status)).toEqual(['ok','replayed','replayed','stale','ok','ok','stale','ok']);
  expect(await pointer('CN',month)).toBeNull();   // (region, month) is the pointer key
 });

 it('macro_publish_review: not_found for an unknown manifest, a hash mismatch or a non-review manifest; status / month / region checked',async()=>{
  const month=freshMonth();const A=await reviewManifest();const th=newHash();const T={id:await put('transmission',th),hash:th};
  expect(await fails(publish('US',month,0,{id:randomUUID(),hash:A.hash}))).toMatchObject({message:'not_found'});
  expect(await fails(publish('US',month,0,{id:A.id,hash:HEX('e')}))).toMatchObject({message:'not_found'});
  expect(await fails(publish('US',month,0,T))).toMatchObject({message:'not_found'});
  expect(await fails(publish('JP',month,0,A))).toMatchObject({code:'23514'});
  expect(await fails(publish('US','3000-13',0,A))).toMatchObject({code:'23514'});
  expect(await fails(one(`select public.macro_publish_review('US',$1,0,$4,'great',$2,$3,'{}'::jsonb,'m','c') v`,[month,A.id,A.hash,A.cutoff]))).toMatchObject({code:'23514'});
  expect(await attempts('US',month)).toEqual([]);   // a failed call rolls back with its attempt row
 });

 it('macro_publish_review: concurrent publishes of two results at the same expected generation → exactly one advances',async()=>{
  const month=freshMonth();const A=await reviewManifest(),B=await reviewManifest();
  const out=await Promise.all([publish('CN',month,0,A),publish('CN',month,0,B)]);
  expect(out.map(o=>o.outcome).sort()).toEqual(['advanced','stale']);
  expect(await pointer('CN',month)).toMatchObject({generation:1,result_id:out.find(o=>o.outcome==='advanced')!.result_id});
 });

 it('macro_record_review_attempt: failed only',async()=>{
  const month=freshMonth();
  await one(`select public.macro_record_review_attempt('US',$1,'failed','{"stage":"manifest"}'::jsonb) v`,[month]);
  expect(await q(`select status,result_id,error from public.macro_review_attempts where month=$1`,[month])).toEqual([{status:'failed',result_id:null,error:{stage:'manifest'}}]);
  expect(await fails(one(`select public.macro_record_review_attempt('US',$1,'ok',null) v`,[month]))).toMatchObject({message:'invalid_status'});
 });

 it('macro_claim_explanation: claimed with an RPC-made id and audit key; repeat → existing; other payload → payload_conflict; manifest must be explain_facts',async()=>{
  const {a,c}=await newClaim();
  expect(c.outcome).toBe('claimed');
  expect(c.usage_audit_key).toBe(`${c.explanation_id}`);
  expect(c.projection).toMatchObject({explanation_id:c.explanation_id,subject_kind:'review',subject_id:'subject-1',locale:'zh',manifest_id:a.manifest,state:'running',rendered:null,failure_codes:[],finished_at:null});
  expect(await run(c.explanation_id)).toMatchObject({state:'running',finalized:false,raw_output:null,late_output:null});
  const again=await claim(a);
  expect(again).toMatchObject({outcome:'existing',explanation_id:c.explanation_id,usage_audit_key:c.usage_audit_key,projection:{state:'running'}});
  expect(await fails(claim({...a,payload:HEX('b')}))).toMatchObject({message:'payload_conflict'});
  const rm=await reviewManifest();
  expect(await fails(claim({...a,request:randomUUID(),manifest:rm.id}))).toMatchObject({message:'not_found'});
  expect(await fails(claim({...a,request:randomUUID(),manifest:randomUUID()}))).toMatchObject({message:'not_found'});
  expect(await q(`select count(*)::int n from public.macro_explanation_runs where user_id=$1`,[a.user])).toEqual([{n:1}]);
 });

 it('macro_claim_explanation: concurrent claims of one request → one claimed, one existing, same id',async()=>{
  const a={user:randomUUID(),request:randomUUID(),manifest:await explainManifest()};
  const out=await Promise.all([claim(a),claim(a)]);
  expect(out.map(o=>o.outcome).sort()).toEqual(['claimed','existing']);
  expect(out[0].explanation_id).toBe(out[1].explanation_id);
 });

 it('macro_claim_explanation: running for more than five minutes → abandoned, projection failed {abandoned}; under five minutes stays running',async()=>{
  const young=await newClaim();await age(young.c.explanation_id,4);
  expect((await claim(young.a)).projection.state).toBe('running');
  const old=await newClaim();await age(old.c.explanation_id,6);
  const again=await claim(old.a);
  expect(again).toMatchObject({outcome:'existing',explanation_id:old.c.explanation_id,projection:{state:'failed',failure_codes:['abandoned'],rendered:null}});
  expect(again.projection.finished_at).not.toBeNull();
  expect(await run(old.c.explanation_id)).toMatchObject({state:'abandoned'});
  expect((await claim(old.a)).projection).toMatchObject({state:'failed',failure_codes:['abandoned']});   // stays abandoned
 });

 it('macro_finish_explanation: running → accepted; idempotent on same state + raw; invalid_transition otherwise; rendered only when accepted',async()=>{
  const {c}=await newClaim();
  const p=await finish(c.explanation_id,'accepted',{points:[1]},{rendered:RENDERED,accounting:{tokens:9}});
  expect(p).toMatchObject({state:'accepted',rendered:RENDERED,failure_codes:[],provider:'prov',model:'model',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1'});
  expect(p.finished_at).not.toBeNull();
  expect(await run(c.explanation_id)).toMatchObject({state:'accepted',raw_output:{points:[1]},accounting:{tokens:9},finalized:false});
  expect(await finish(c.explanation_id,'accepted',{points:[1]},{rendered:RENDERED})).toEqual(p);   // idempotent: unchanged projection
  expect(await fails(finish(c.explanation_id,'accepted',{points:[2]},{rendered:RENDERED}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(finish(c.explanation_id,'rejected',{points:[1]},{codes:['numeral']}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(finish(c.explanation_id,'running',{}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(finish(randomUUID(),'failed',null))).toMatchObject({message:'not_found'});
  const r=await newClaim();
  expect(await finish(r.c.explanation_id,'rejected','3% text',{rendered:RENDERED,codes:['numeral']})).toMatchObject({state:'rejected',rendered:null,failure_codes:['numeral']});
  const n=await newClaim();
  expect(await fails(finish(n.c.explanation_id,'accepted',{x:1}))).toMatchObject({code:'23514'});   // accepted needs a rendered body
  expect(await run(n.c.explanation_id)).toMatchObject({state:'running'});
 });

 it('macro_finish_explanation after abandoned: writes late_output and accounting only; projection stays failed',async()=>{
  const {a,c}=await newClaim();await age(c.explanation_id,6);await claim(a);
  const p=await finish(c.explanation_id,'accepted',{points:['late']},{rendered:RENDERED,accounting:{tokens:42}});
  expect(p).toMatchObject({state:'failed',failure_codes:['abandoned'],rendered:null});
  const row=await run(c.explanation_id);
  expect(row).toMatchObject({state:'abandoned',raw_output:null,accounting:{tokens:42},late_output:{state:'accepted',raw_output:{points:['late']},rendered:RENDERED,provider:'prov'}});
 });

 it('claim / expire and finish share the run row lock: an expiring claim never overwrites a concurrent finish',async()=>{
  // finish commits first → the waiting expired claim reads accepted and leaves it alone
  const x=await newClaim();await age(x.c.explanation_id,6);
  const got=await serialized({sql:FINISH_SQL,values:finishArgs(x.c.explanation_id,'accepted',{points:[1]},{rendered:RENDERED})},()=>claim(x.a));
  expect(got).toMatchObject({outcome:'existing',projection:{state:'accepted',rendered:RENDERED}});
  expect(await run(x.c.explanation_id)).toMatchObject({state:'accepted',late_output:null});
  // the expiring claim commits first → the waiting finish sees abandoned and writes late_output only
  const y=await newClaim();await age(y.c.explanation_id,6);
  const late=await serialized({sql:`select public.macro_claim_explanation($1,$2,$3,'review','subject-1','zh',$4) v`,values:[y.a.user,y.a.request,HEX('a'),y.a.manifest]},
   ()=>finish(y.c.explanation_id,'accepted',{points:[2]},{rendered:RENDERED}));
  expect(late).toMatchObject({state:'failed',failure_codes:['abandoned']});
  expect(await run(y.c.explanation_id)).toMatchObject({state:'abandoned',late_output:{state:'accepted'}});
  // macro_expire_explanations waits on the same lock
  const z=await newClaim();await age(z.c.explanation_id,6);
  expect(await serialized({sql:FINISH_SQL,values:finishArgs(z.c.explanation_id,'rejected','3%',{codes:['numeral']})},()=>expire(z.a.user))).toBe(0);
  expect(await run(z.c.explanation_id)).toMatchObject({state:'rejected'});
 },30000);

 it('macro_record_completion: stores raw output + finalize payload on running and abandoned rows; same values → no-op; otherwise invalid_transition',async()=>{
  const {c}=await newClaim();
  await record(c.explanation_id,{content:'x'});
  expect(await run(c.explanation_id)).toMatchObject({state:'running',raw_output:{content:'x'},finalize_payload:PAYLOAD,finalized:false});
  await record(c.explanation_id,{content:'x'});   // same values: no-op
  expect(await fails(record(c.explanation_id,{content:'y'}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(record(c.explanation_id,{content:'x'},{...PAYLOAD,status:'failed'}))).toMatchObject({message:'invalid_transition'});
  expect(await finish(c.explanation_id,'accepted',{content:'x'},{rendered:RENDERED})).toMatchObject({state:'accepted'});   // finish keeps the recorded raw output
  const ab=await newClaim();await age(ab.c.explanation_id,6);await claim(ab.a);
  await record(ab.c.explanation_id,null,{...PAYLOAD,status:'failed'});
  expect(await run(ab.c.explanation_id)).toMatchObject({state:'abandoned',finalize_payload:{status:'failed'}});
  const done=await newClaim();await finish(done.c.explanation_id,'failed',null,{codes:['provider_error']});
  expect(await fails(record(done.c.explanation_id,null))).toMatchObject({message:'invalid_transition'});   // a final row without a recorded payload
  const n=await newClaim();
  expect(await fails(record(n.c.explanation_id,null,null))).toMatchObject({message:'invalid_transition'});
  expect(await fails(record(n.c.explanation_id,null,{status:'pending'}))).toMatchObject({code:'23514'});
  expect(await fails(record(randomUUID(),null))).toMatchObject({message:'not_found'});
 });

 it('macro_finish_explanation stores p_finalize_payload when none is recorded (a failed record_completion) and never overwrites one',async()=>{
  const {c}=await newClaim();
  await finish(c.explanation_id,'accepted',{content:'x'},{rendered:RENDERED,payload:PAYLOAD});
  expect(await run(c.explanation_id)).toMatchObject({state:'accepted',raw_output:{content:'x'},finalize_payload:PAYLOAD,finalized:false});
  await one(`select public.macro_mark_finalized($1) v`,[c.explanation_id]);   // settles from the payload finish stored
  expect(await run(c.explanation_id)).toMatchObject({finalized:true});
  const r=await newClaim();await record(r.c.explanation_id,{content:'y'});
  await finish(r.c.explanation_id,'accepted',{content:'y'},{rendered:RENDERED,payload:{...PAYLOAD,pricingVersion:'p2'}});
  expect(await run(r.c.explanation_id)).toMatchObject({finalize_payload:PAYLOAD});   // the recorded payload stays
  const i=await newClaim();await finish(i.c.explanation_id,'failed',null,{codes:['provider_error']});
  await finish(i.c.explanation_id,'failed',null,{codes:['provider_error'],payload:{...PAYLOAD,status:'failed'}});   // idempotent replay fills a missing payload
  expect(await run(i.c.explanation_id)).toMatchObject({state:'failed',finalize_payload:{status:'failed'}});
  const ab=await newClaim();await age(ab.c.explanation_id,6);await expire(ab.a.user);
  await finish(ab.c.explanation_id,'accepted',{content:'z'},{rendered:RENDERED,payload:PAYLOAD});
  expect(await run(ab.c.explanation_id)).toMatchObject({state:'abandoned',finalize_payload:PAYLOAD,late_output:{state:'accepted'}});
  const bad=await newClaim();
  expect(await fails(finish(bad.c.explanation_id,'failed',null,{payload:{status:'pending'}}))).toMatchObject({code:'23514'});
 });

 it('a recorded completion is never abandoned: the claim and macro_expire_explanations skip running rows whose raw output is recorded',async()=>{
  const rec=await newClaim();await record(rec.c.explanation_id,{content:'x'});await age(rec.c.explanation_id,6);
  expect((await claim(rec.a)).projection).toMatchObject({state:'running'});
  expect(await expire(rec.a.user)).toBe(0);
  expect(await run(rec.c.explanation_id)).toMatchObject({state:'running',raw_output:{content:'x'}});
  const threw=await newClaim();await record(threw.c.explanation_id,null,{...PAYLOAD,status:'failed'});await age(threw.c.explanation_id,6);   // provider threw: no output to recover
  expect(await expire(threw.a.user)).toBe(1);
  expect(await run(threw.c.explanation_id)).toMatchObject({state:'abandoned',finalize_payload:{status:'failed'}});
  expect(await finish(rec.c.explanation_id,'accepted',{content:'x'},{rendered:RENDERED})).toMatchObject({state:'accepted'});   // completion recovery finishes it
 });

 it('macro_mark_finalized: needs a recorded finalize payload, then finalizes in any state (running after a failed finish, final, abandoned); idempotent; unknown → not_found',async()=>{
  const {c}=await newClaim();
  expect(await fails(one(`select public.macro_mark_finalized($1) v`,[c.explanation_id]))).toMatchObject({message:'invalid_transition'});
  await finish(c.explanation_id,'failed',null,{codes:['provider_error']});
  expect(await fails(one(`select public.macro_mark_finalized($1) v`,[c.explanation_id]))).toMatchObject({message:'invalid_transition'});   // final, but nothing recorded
  const r=await newClaim();await record(r.c.explanation_id,{content:'x'});
  await one(`select public.macro_mark_finalized($1) v`,[r.c.explanation_id]);   // finish never ran: still running, payload settled
  await one(`select public.macro_mark_finalized($1) v`,[r.c.explanation_id]);
  expect(await run(r.c.explanation_id)).toMatchObject({state:'running',finalized:true});
  const ab=await newClaim();await age(ab.c.explanation_id,6);await expire(ab.a.user);await record(ab.c.explanation_id,null,{...PAYLOAD,status:'failed'});
  await one(`select public.macro_mark_finalized($1) v`,[ab.c.explanation_id]);
  expect(await run(ab.c.explanation_id)).toMatchObject({state:'abandoned',finalized:true});
  expect(await fails(one(`select public.macro_mark_finalized($1) v`,[randomUUID()]))).toMatchObject({message:'not_found'});
 });

 it('macro_expire_explanations: only the user\'s running rows claimed more than five minutes ago → abandoned + projection failed {abandoned}',async()=>{
  const user=randomUUID();
  const mk=async()=>claim({user,request:randomUUID(),manifest:await explainManifest()});
  const old=await mk(),young=await mk(),done=await mk();
  await age(old.explanation_id,6);await age(young.explanation_id,4);await age(done.explanation_id,6);
  await finish(done.explanation_id,'rejected','3%',{codes:['numeral']});
  const other=await newClaim();await age(other.c.explanation_id,6);
  expect(await expire(user)).toBe(1);
  expect(await run(old.explanation_id)).toMatchObject({state:'abandoned'});
  expect((await run(old.explanation_id)).finished_at).not.toBeNull();
  expect(await q(`select state,failure_codes from public.macro_explanations where explanation_id=$1`,[old.explanation_id])).toEqual([{state:'failed',failure_codes:['abandoned']}]);
  expect(await run(young.explanation_id)).toMatchObject({state:'running'});
  expect(await run(done.explanation_id)).toMatchObject({state:'rejected'});
  expect(await run(other.c.explanation_id)).toMatchObject({state:'running'});
  expect(await expire(user)).toBe(0);
 });

 it('macro_publish_review: p_cutoff must equal the stored manifest cutoff → cutoff_mismatch; an older manifest cannot advance with a newer argument',async()=>{
  const month=freshMonth();const NEW=await reviewManifest('3000-02-01T00:00:00Z'),OLD=await reviewManifest('3000-01-30T00:00:00Z');
  const n1=await publish('US',month,0,NEW);expect(n1).toMatchObject({generation:1,outcome:'advanced'});
  expect(await fails(publish('US',month,1,OLD,'3000-03-01T00:00:00Z'))).toMatchObject({message:'cutoff_mismatch'});   // newer argument for an older manifest
  expect(await fails(publish('US',month,1,NEW,'3000-01-01T00:00:00Z'))).toMatchObject({message:'cutoff_mismatch'});   // even a replay must carry the manifest cutoff
  expect(await publish('US',month,1,OLD)).toMatchObject({generation:1,outcome:'stale'});   // its own cutoff is older than the pointer's
  expect(await pointer('US',month)).toMatchObject({result_id:n1.result_id,generation:1});
  expect(new Date((await pointer('US',month)).cutoff).toISOString()).toBe('3000-02-01T00:00:00.000Z');
 });

 it('macro_publish_review: a null expected generation is invalid_argument (absent and existing pointer); nothing is stored or logged',async()=>{
  const month=freshMonth();const A=await reviewManifest(),B=await reviewManifest('3000-02-01T00:00:00Z');
  expect(await fails(publish('US',month,null,A))).toMatchObject({message:'invalid_argument'});
  expect(await pointer('US',month)).toBeNull();
  const a1=await publish('US',month,0,A);expect(a1.outcome).toBe('advanced');
  expect(await fails(publish('US',month,null,B))).toMatchObject({message:'invalid_argument'});
  expect(await pointer('US',month)).toMatchObject({result_id:a1.result_id,generation:1});
  expect(await one(`select count(*)::int v from public.macro_review_results where region='US' and month=$1`,[month])).toBe(1);
  expect((await attempts('US',month)).map(r=>r.status)).toEqual(['ok']);
 });

 it('macro_record_completion: a terminal row is invalid_transition even when the stored values match',async()=>{
  for(const state of ['accepted','rejected','failed'] as const){
   const {c}=await newClaim();
   await record(c.explanation_id,{content:state});
   await finish(c.explanation_id,state,{content:state},{rendered:state==='accepted'?RENDERED:undefined,codes:state==='accepted'?[]:['x']});
   expect(await fails(record(c.explanation_id,{content:state}))).toMatchObject({message:'invalid_transition'});   // same raw output + same payload
  }
  const ab=await newClaim();await age(ab.c.explanation_id,6);await expire(ab.a.user);await record(ab.c.explanation_id,null);
  await record(ab.c.explanation_id,null);   // abandoned rows still accept the idempotent repeat
 });

 it('macro_finish_explanation: a finish whose output differs from the recorded completion is invalid_transition and keeps the recorded envelope',async()=>{
  const {c}=await newClaim();await record(c.explanation_id,{content:'A'});
  expect(await fails(finish(c.explanation_id,'accepted',{content:'B'},{rendered:RENDERED}))).toMatchObject({message:'invalid_transition'});
  expect(await fails(one(FINISH_SQL,[c.explanation_id,'accepted',null,null,[],'{"tokens":1}',null]))).toMatchObject({message:'invalid_transition'});   // SQL NULL output
  expect(await run(c.explanation_id)).toMatchObject({state:'running',raw_output:{content:'A'},finalize_payload:PAYLOAD});
  expect(await finish(c.explanation_id,'accepted',{content:'A'},{rendered:RENDERED})).toMatchObject({state:'accepted'});
  const t=await newClaim();await record(t.c.explanation_id,null,{...PAYLOAD,status:'failed'});   // provider threw: recorded without output
  expect(await fails(finish(t.c.explanation_id,'failed',{content:'B'},{codes:['x']}))).toMatchObject({message:'invalid_transition'});
  expect(await run(t.c.explanation_id)).toMatchObject({state:'running',finalize_payload:{status:'failed'}});
 });

 it('constraints: a settlement payload needs status completed/failed present and non-null; a manifest body needs its kind',async()=>{
  const {c}=await newClaim();
  for(const bad of [{},{status:null},{status:'pending'},[]]){
   expect(await fails(record(c.explanation_id,null,bad))).toMatchObject({code:'23514'});
   expect(await fails(finish(c.explanation_id,'failed',null,{codes:['x'],payload:bad}))).toMatchObject({code:'23514'});
  }
  expect(await run(c.explanation_id)).toMatchObject({state:'running',finalize_payload:null});
  expect(await fails(one(`select public.macro_mark_finalized($1) v`,[c.explanation_id]))).toMatchObject({message:'invalid_transition'});
  const {kind:_k,...noKind}=manifestBody('transmission');
  expect(await fails(put('transmission',newHash(),noKind))).toMatchObject({code:'23514'});
  expect(await fails(put('transmission',newHash(),{...noKind,kind:null as unknown as string}))).toMatchObject({code:'23514'});
 });
});
```

- [ ] **Step 2: Run it against an empty database and confirm it fails**

若 `.claude/scratch/db-one.ts` 不存在，按原文创建（不提交）：

```ts
import { spawn } from 'node:child_process';
import { startLocalDatabase, stopLocalDatabase } from '../../scripts/s4/local-db';
async function main(){
  const files=process.argv.slice(2);
  const db=await startLocalDatabase();
  let err:unknown;
  try{
    await new Promise<void>((res,rej)=>{
      const c=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run',...files],{stdio:'inherit',env:{...process.env,S4_TEST_STATE:db.stateFile}});
      c.once('exit',code=>code===0?res():rej(new Error('vitest exit '+code)));
    });
  }catch(e){err=e;}finally{stopLocalDatabase(db,err);}
  if(err)process.exitCode=1;
}
main();
```

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/macro/strategy/strategy.integration.test.ts`
Expected: FAIL — 24 tests fail: the first with `expected [] to deeply equal [ 'macro_explanation_runs', … ]` (tables absent), the rest with `function public.macro_put_manifest(…) does not exist` / `relation "public.macro_explanation_runs" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261115090000_macro_strategy.sql`:

```sql
-- supabase/migrations/20261115090000_macro_strategy.sql
-- Macro workbench P3+P4 storage (spec 2026-11-07-macro-workbench-p3-p4-design.md §4.4, draft 3).
-- Six tables and eight security definer RPCs. No reference to P1 / F4 tables (no foreign keys out of
-- this module), so the branch replays on its own before P1+P2 merge. Every write goes through an RPC
-- granted to service_role only; no role has a direct insert/update/delete privilege.
--   macro_strategy_manifests  frozen strategy manifests; identity = manifest_hash (sha256 of the canonical body)
--   macro_review_results      immutable monthly review results, unique (region, month, manifest_hash)
--   macro_review_current      current pointer per (region, month) with a generation CAS
--   macro_review_attempts     service-only attempt log (ok / replayed / insufficient / failed / stale)
--   macro_explanation_runs    service-only LLM run rows (raw output, finalize payload, validation, accounting, finalized)
--   macro_explanations        user-readable projection (RLS user_id = auth.uid())
-- Errors are raised with the code as the message: not_found, payload_conflict, invalid_transition,
-- invalid_status, invalid_argument, cutoff_mismatch (src/lib/macro/strategy/db.ts maps them). A claim left running for more than five
-- minutes is turned into abandoned by the next claim of the same (user_id, request_id) or by
-- macro_expire_explanations(user_id) (GET /explanations runs it before reading) — unless its completion is recorded
-- (raw_output is a json object): such a row is finished later from the stored output by the server's completion
-- recovery, never abandoned. Accounting is durable before anything else can fail: macro_record_completion stores the
-- raw output and the exact finalizeUsageRun payload right after the provider returns; macro_finish_explanation stores
-- the same payload when none is recorded yet (never overwrites one); macro_mark_finalized needs a payload. Every RPC
-- that changes a run row first locks it (select … for update), so an expiring claim never overwrites a concurrent finish.

-- ---------------------------------------------------------------- tables
create table if not exists public.macro_strategy_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  kind text not null constraint macro_strategy_manifests_kind check (kind in ('transmission','policy_response','cycle_table','review','explain_facts')),
  body jsonb not null constraint macro_strategy_manifests_body check ((jsonb_typeof(body) = 'object' and body->>'kind' = kind) is true),
  manifest_hash text not null constraint macro_strategy_manifests_hash check (manifest_hash ~ '^[0-9a-f]{64}$'),
  cutoff timestamptz not null,
  method_version text not null constraint macro_strategy_manifests_method check (length(method_version) between 1 and 128),
  code_version text not null constraint macro_strategy_manifests_code check (length(code_version) between 1 and 128),
  catalog_version text not null constraint macro_strategy_manifests_catalog check (length(catalog_version) between 1 and 128),
  created_at timestamptz not null default now(),
  constraint macro_strategy_manifests_hash_key unique (manifest_hash)
);

create table if not exists public.macro_review_results (
  result_id uuid primary key default gen_random_uuid(),
  region text not null constraint macro_review_results_region check (region in ('US','CN')),
  month text not null constraint macro_review_results_month check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null constraint macro_review_results_status check (status in ('ok','insufficient')),
  manifest_id uuid not null references public.macro_strategy_manifests(manifest_id),
  manifest_hash text not null constraint macro_review_results_hash check (manifest_hash ~ '^[0-9a-f]{64}$'),
  facts jsonb not null constraint macro_review_results_facts check (jsonb_typeof(facts) = 'object'),
  method_version text not null,
  code_version text not null,
  created_at timestamptz not null default now(),
  constraint macro_review_results_identity unique (region, month, manifest_hash)
);

create table if not exists public.macro_review_current (
  region text not null constraint macro_review_current_region check (region in ('US','CN')),
  month text not null constraint macro_review_current_month check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  result_id uuid not null references public.macro_review_results(result_id),
  generation bigint not null constraint macro_review_current_generation check (generation >= 1),
  cutoff timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (region, month)
);

create table if not exists public.macro_review_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  region text not null constraint macro_review_attempts_region check (region in ('US','CN')),
  month text not null constraint macro_review_attempts_month check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null constraint macro_review_attempts_status check (status in ('ok','replayed','insufficient','failed','stale')),
  result_id uuid null,
  error jsonb null,
  created_at timestamptz not null default now()
);
create index if not exists macro_review_attempts_region_month on public.macro_review_attempts (region, month, created_at);

create table if not exists public.macro_explanation_runs (
  explanation_id uuid primary key,
  user_id uuid not null,
  request_id uuid not null,
  payload_hash text not null constraint macro_explanation_runs_payload check (payload_hash ~ '^[0-9a-f]{64}$'),
  subject_kind text not null constraint macro_explanation_runs_subject_kind check (subject_kind in ('snapshot','review')),
  subject_id text not null constraint macro_explanation_runs_subject_id check (length(subject_id) between 1 and 200),
  locale text not null constraint macro_explanation_runs_locale check (locale in ('zh','en')),
  manifest_id uuid not null references public.macro_strategy_manifests(manifest_id),
  state text not null constraint macro_explanation_runs_state check (state in ('running','accepted','rejected','failed','abandoned')),
  claimed_at timestamptz not null default now(),
  finished_at timestamptz null,
  provider text null,
  model text null,
  prompt_version text null,
  validator_version text null,
  raw_output jsonb null,
  validation jsonb null,
  usage_audit_key text not null,
  accounting jsonb null,
  finalize_payload jsonb null constraint macro_explanation_runs_finalize_payload check (finalize_payload is null or ((jsonb_typeof(finalize_payload) = 'object' and finalize_payload->>'status' in ('completed','failed')) is true)),
  finalized boolean not null default false,
  late_output jsonb null,
  constraint macro_explanation_runs_request unique (user_id, request_id),
  constraint macro_explanation_runs_audit_key unique (usage_audit_key),
  constraint macro_explanation_runs_audit_key_form check (usage_audit_key = explanation_id::text)
);
create index if not exists macro_explanation_runs_unfinalized on public.macro_explanation_runs (claimed_at) where finalized = false and finalize_payload is not null;
create index if not exists macro_explanation_runs_running on public.macro_explanation_runs (user_id, claimed_at) where state = 'running';

create table if not exists public.macro_explanations (
  explanation_id uuid primary key references public.macro_explanation_runs(explanation_id),
  user_id uuid not null,
  subject_kind text not null constraint macro_explanations_subject_kind check (subject_kind in ('snapshot','review')),
  subject_id text not null,
  locale text not null constraint macro_explanations_locale check (locale in ('zh','en')),
  manifest_id uuid not null references public.macro_strategy_manifests(manifest_id),
  state text not null constraint macro_explanations_state check (state in ('running','accepted','rejected','failed')),
  rendered jsonb null,
  failure_codes text[] not null default '{}',
  provider text null,
  model text null,
  prompt_version text null,
  validator_version text null,
  created_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint macro_explanations_rendered check ((state = 'accepted') = (rendered is not null))
);
create index if not exists macro_explanations_subject on public.macro_explanations (user_id, subject_kind, subject_id, created_at desc);

-- ---------------------------------------------------------------- privileges and RLS
do $$
declare t text;
begin
  foreach t in array array['macro_strategy_manifests','macro_review_results','macro_review_current','macro_review_attempts','macro_explanation_runs','macro_explanations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
  foreach t in array array['macro_strategy_manifests','macro_review_results','macro_review_current'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
  foreach t in array array['macro_review_attempts','macro_explanation_runs'] loop
    execute format('grant select on public.%I to service_role', t);
  end loop;
end $$;
grant select on public.macro_explanations to authenticated, service_role;
drop policy if exists "macro_explanations own read" on public.macro_explanations;
create policy "macro_explanations own read" on public.macro_explanations for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- RPC 1: macro_put_manifest
-- Idempotent by manifest_hash (the TS side computes sha256Hex(canonicalJson(body))). The same hash with a
-- different body is a caller bug → payload_conflict.
create or replace function public.macro_put_manifest(p_kind text, p_body jsonb, p_manifest_hash text, p_cutoff timestamptz,
  p_method_version text, p_code_version text, p_catalog_version text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body jsonb;
begin
  insert into public.macro_strategy_manifests (kind, body, manifest_hash, cutoff, method_version, code_version, catalog_version)
  values (p_kind, p_body, p_manifest_hash, p_cutoff, p_method_version, p_code_version, p_catalog_version)
  on conflict (manifest_hash) do nothing
  returning manifest_id into v_id;
  if v_id is not null then return v_id; end if;
  select manifest_id, body into v_id, v_body from public.macro_strategy_manifests where manifest_hash = p_manifest_hash;
  if v_body is distinct from p_body then raise exception 'payload_conflict'; end if;
  return v_id;
end $$;
revoke execute on function public.macro_put_manifest(text, jsonb, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.macro_put_manifest(text, jsonb, text, timestamptz, text, text, text) to service_role;

-- ---------------------------------------------------------------- RPC 2: macro_publish_review
-- Transaction-level advisory lock on (region, month); get-or-insert the immutable result by
-- (region, month, manifest_hash); then: pointer already on this result → replayed (whatever the expected
-- generation); generation is distinct from expected → stale; cutoff older than the current cutoff → stale; else advance
-- (an absent pointer is generation 0, so the first publish yields 1). Every call logs one attempt row.
-- stale is a return value, never an exception. A null expected generation → invalid_argument; p_cutoff must equal the
-- stored manifest's cutoff, otherwise cutoff_mismatch (the pointer's cutoff always is its frozen evidence's cutoff).
create or replace function public.macro_publish_review(p_region text, p_month text, p_expected_generation bigint, p_cutoff timestamptz,
  p_status text, p_manifest_id uuid, p_manifest_hash text, p_facts jsonb, p_method_version text, p_code_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result uuid; v_cur_result uuid; v_cur_cutoff timestamptz; v_gen bigint := 0; v_outcome text;
declare v_man_cutoff timestamptz;
begin
  if p_expected_generation is null then raise exception 'invalid_argument'; end if;
  perform pg_advisory_xact_lock(hashtextextended('macro_review:' || p_region || ':' || p_month, 0));
  select cutoff into v_man_cutoff from public.macro_strategy_manifests where manifest_id = p_manifest_id and manifest_hash = p_manifest_hash and kind = 'review';
  if not found then raise exception 'not_found'; end if;
  if v_man_cutoff is distinct from p_cutoff then raise exception 'cutoff_mismatch'; end if;
  insert into public.macro_review_results (region, month, status, manifest_id, manifest_hash, facts, method_version, code_version)
  values (p_region, p_month, p_status, p_manifest_id, p_manifest_hash, p_facts, p_method_version, p_code_version)
  on conflict (region, month, manifest_hash) do nothing
  returning result_id into v_result;
  if v_result is null then
    select result_id into v_result from public.macro_review_results where region = p_region and month = p_month and manifest_hash = p_manifest_hash;
  end if;
  select result_id, generation, cutoff into v_cur_result, v_gen, v_cur_cutoff from public.macro_review_current where region = p_region and month = p_month;
  v_gen := coalesce(v_gen, 0);
  if v_cur_result = v_result then
    v_outcome := 'replayed';
  elsif v_gen is distinct from p_expected_generation then
    v_outcome := 'stale';
  elsif v_cur_cutoff is not null and p_cutoff < v_cur_cutoff then
    v_outcome := 'stale';
  else
    v_gen := v_gen + 1;
    insert into public.macro_review_current (region, month, result_id, generation, cutoff, updated_at)
    values (p_region, p_month, v_result, v_gen, p_cutoff, now())
    on conflict (region, month) do update set result_id = excluded.result_id, generation = excluded.generation, cutoff = excluded.cutoff, updated_at = excluded.updated_at;
    v_outcome := 'advanced';
  end if;
  insert into public.macro_review_attempts (region, month, status, result_id)
  values (p_region, p_month, case v_outcome when 'advanced' then 'ok' else v_outcome end, v_result);
  return jsonb_build_object('result_id', v_result, 'generation', v_gen, 'outcome', v_outcome);
end $$;
revoke execute on function public.macro_publish_review(text, text, bigint, timestamptz, text, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.macro_publish_review(text, text, bigint, timestamptz, text, uuid, text, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------- RPC 3: macro_record_review_attempt
-- Failed attempts only (an exception in the compute or manifest stage).
create or replace function public.macro_record_review_attempt(p_region text, p_month text, p_status text, p_error jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status is distinct from 'failed' then raise exception 'invalid_status'; end if;
  insert into public.macro_review_attempts (region, month, status, error) values (p_region, p_month, p_status, p_error);
end $$;
revoke execute on function public.macro_record_review_attempt(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.macro_record_review_attempt(text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- projection helper (not callable by any API role)
create or replace function public.macro_explanation_projection(p_explanation_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('explanation_id', e.explanation_id, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'locale', e.locale,
    'manifest_id', e.manifest_id, 'state', e.state, 'rendered', e.rendered, 'failure_codes', to_jsonb(e.failure_codes), 'provider', e.provider,
    'model', e.model, 'prompt_version', e.prompt_version, 'validator_version', e.validator_version, 'created_at', e.created_at, 'finished_at', e.finished_at)
  from public.macro_explanations e where e.explanation_id = p_explanation_id
$$;
revoke execute on function public.macro_explanation_projection(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- RPC 4: macro_claim_explanation
-- Advisory lock on (user_id, request_id), then the existing run row is locked FOR UPDATE before its state is
-- read (finish, record_completion and expire lock the same row). Existing row: different payload_hash →
-- payload_conflict; running, claimed more than five minutes ago and without a recorded completion (raw_output not a
-- json object) → abandoned (projection failed, failure_codes {abandoned}); return outcome existing. New: generate explanation_id and usage_audit_key, insert the running run and projection,
-- return outcome claimed. Only a 'claimed' caller may bill or call the model.
create or replace function public.macro_claim_explanation(p_user_id uuid, p_request_id uuid, p_payload_hash text, p_subject_kind text,
  p_subject_id text, p_locale text, p_manifest_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_key text; v_hash text; v_state text; v_claimed timestamptz; v_raw jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('macro_explain:' || p_user_id::text || ':' || p_request_id::text, 0));
  select explanation_id, usage_audit_key, payload_hash, state, claimed_at, raw_output into v_id, v_key, v_hash, v_state, v_claimed, v_raw
  from public.macro_explanation_runs where user_id = p_user_id and request_id = p_request_id for update;
  if found then
    if v_hash <> p_payload_hash then raise exception 'payload_conflict'; end if;
    if v_state = 'running' and v_claimed < now() - interval '5 minutes' and jsonb_typeof(v_raw) is distinct from 'object' then
      update public.macro_explanation_runs set state = 'abandoned', finished_at = now() where explanation_id = v_id;
      update public.macro_explanations set state = 'failed', failure_codes = array['abandoned'], finished_at = now() where explanation_id = v_id and state = 'running';
    end if;
    return jsonb_build_object('outcome', 'existing', 'explanation_id', v_id, 'usage_audit_key', v_key, 'projection', public.macro_explanation_projection(v_id));
  end if;
  if not exists (select 1 from public.macro_strategy_manifests where manifest_id = p_manifest_id and kind = 'explain_facts') then
    raise exception 'not_found';
  end if;
  v_id := gen_random_uuid();
  v_key := v_id::text;   -- begin_usage_run / finalize_usage_run take p_idempotency_key uuid
  insert into public.macro_explanation_runs (explanation_id, user_id, request_id, payload_hash, subject_kind, subject_id, locale, manifest_id, state, usage_audit_key)
  values (v_id, p_user_id, p_request_id, p_payload_hash, p_subject_kind, p_subject_id, p_locale, p_manifest_id, 'running', v_key);
  insert into public.macro_explanations (explanation_id, user_id, subject_kind, subject_id, locale, manifest_id, state)
  values (v_id, p_user_id, p_subject_kind, p_subject_id, p_locale, p_manifest_id, 'running');
  return jsonb_build_object('outcome', 'claimed', 'explanation_id', v_id, 'usage_audit_key', v_key, 'projection', public.macro_explanation_projection(v_id));
end $$;
revoke execute on function public.macro_claim_explanation(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.macro_claim_explanation(uuid, uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------- RPC 5: macro_record_completion
-- Called right after the provider returned (or threw, or beginUsageRun failed), before validation and finish: stores
-- the raw output and the exact finalizeUsageRun payload ({status, provider, model, tokens, cost, pricingVersion,
-- usdCnyMicros, usageEstimated, byo}) so accounting survives any later failure. Allowed on running and abandoned
-- rows only (the state is checked first: a terminal row is invalid_transition even when the stored values match); a
-- repeat with the same values is a no-op; a different payload or output once one is stored → invalid_transition.
create or replace function public.macro_record_completion(p_explanation_id uuid, p_raw_output jsonb, p_finalize_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_state text; v_raw jsonb; v_payload jsonb;
begin
  if p_finalize_payload is null then raise exception 'invalid_transition'; end if;
  select state, raw_output, finalize_payload into v_state, v_raw, v_payload from public.macro_explanation_runs where explanation_id = p_explanation_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_state not in ('running','abandoned') then raise exception 'invalid_transition'; end if;
  if v_payload is not null then
    if v_payload is distinct from p_finalize_payload or v_raw is distinct from p_raw_output then raise exception 'invalid_transition'; end if;
    return;
  end if;
  update public.macro_explanation_runs set raw_output = p_raw_output, finalize_payload = p_finalize_payload where explanation_id = p_explanation_id;
end $$;
revoke execute on function public.macro_record_completion(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.macro_record_completion(uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- RPC 6: macro_finish_explanation
-- running → accepted / rejected / failed (run row + projection). Same final state and same raw_output →
-- idempotent (returns the projection unchanged). Another final state, or the same state with a different
-- raw_output → invalid_transition. abandoned → only late_output and accounting are written; the
-- projection stays failed. A completion recorded by macro_record_completion is evidence: a running row with a
-- recorded finalize payload accepts only a finish whose raw_output equals the recorded one (null included), otherwise
-- invalid_transition and the recorded envelope is untouched. p_finalize_payload is stored in every non-error branch when the row has
-- none yet (macro_record_completion failed), never overwriting a recorded one, so recovery can still settle it.
create or replace function public.macro_finish_explanation(p_explanation_id uuid, p_state text, p_provider text, p_model text,
  p_prompt_version text, p_validator_version text, p_raw_output jsonb, p_validation jsonb, p_rendered jsonb, p_failure_codes text[], p_accounting jsonb,
  p_finalize_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_state text; v_raw jsonb; v_payload jsonb;
begin
  if p_state is null or p_state not in ('accepted','rejected','failed') then raise exception 'invalid_transition'; end if;
  select state, raw_output, finalize_payload into v_state, v_raw, v_payload from public.macro_explanation_runs where explanation_id = p_explanation_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_state = 'running' then
    if v_payload is not null and v_raw is distinct from p_raw_output then raise exception 'invalid_transition'; end if;
    update public.macro_explanation_runs set state = p_state, finished_at = now(), provider = p_provider, model = p_model,
      prompt_version = p_prompt_version, validator_version = p_validator_version, raw_output = p_raw_output, validation = p_validation, accounting = p_accounting,
      finalize_payload = coalesce(finalize_payload, p_finalize_payload)
    where explanation_id = p_explanation_id;
    update public.macro_explanations set state = p_state,
      rendered = case when p_state = 'accepted' then p_rendered else null end,
      failure_codes = case when p_state = 'accepted' then '{}'::text[] else coalesce(p_failure_codes, '{}'::text[]) end,
      provider = p_provider, model = p_model, prompt_version = p_prompt_version, validator_version = p_validator_version, finished_at = now()
    where explanation_id = p_explanation_id;
  elsif v_state = 'abandoned' then
    update public.macro_explanation_runs set accounting = p_accounting, finalize_payload = coalesce(finalize_payload, p_finalize_payload),
      late_output = jsonb_build_object('state', p_state, 'provider', p_provider, 'model', p_model, 'prompt_version', p_prompt_version,
        'validator_version', p_validator_version, 'raw_output', p_raw_output, 'validation', p_validation, 'rendered', p_rendered,
        'failure_codes', to_jsonb(coalesce(p_failure_codes, '{}'::text[])), 'received_at', now())
    where explanation_id = p_explanation_id;
  elsif v_state = p_state and v_raw is not distinct from p_raw_output then
    update public.macro_explanation_runs set finalize_payload = p_finalize_payload
    where explanation_id = p_explanation_id and finalize_payload is null and p_finalize_payload is not null;
  else
    raise exception 'invalid_transition';
  end if;
  return public.macro_explanation_projection(p_explanation_id);
end $$;
revoke execute on function public.macro_finish_explanation(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.macro_finish_explanation(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, text[], jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- RPC 7: macro_mark_finalized
-- After finalizeUsageRun(finalize_payload) succeeded: finalized = true (idempotent), in any state. A row without a
-- recorded finalize payload cannot be finalized (nothing was settled from it).
create or replace function public.macro_mark_finalized(p_explanation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_payload jsonb;
begin
  select finalize_payload into v_payload from public.macro_explanation_runs where explanation_id = p_explanation_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_payload is null then raise exception 'invalid_transition'; end if;
  update public.macro_explanation_runs set finalized = true where explanation_id = p_explanation_id;
end $$;
revoke execute on function public.macro_mark_finalized(uuid) from public, anon, authenticated;
grant execute on function public.macro_mark_finalized(uuid) to service_role;

-- ---------------------------------------------------------------- RPC 8: macro_expire_explanations
-- GET /explanations runs this (service role) before reading, so a reload resolves a run whose worker died: every
-- running row of the user claimed more than five minutes ago without a recorded completion (raw_output not a json
-- object) → abandoned, projection failed {abandoned}. Rows are locked in a stable order; returns the number expired.
create or replace function public.macro_expire_explanations(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n integer := 0;
begin
  for v_id in select explanation_id from public.macro_explanation_runs
    where user_id = p_user_id and state = 'running' and claimed_at < now() - interval '5 minutes'
      and jsonb_typeof(raw_output) is distinct from 'object'
    order by explanation_id for update
  loop
    update public.macro_explanation_runs set state = 'abandoned', finished_at = now() where explanation_id = v_id and state = 'running';
    if found then
      update public.macro_explanations set state = 'failed', failure_codes = array['abandoned'], finished_at = now() where explanation_id = v_id and state = 'running';
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.macro_expire_explanations(uuid) from public, anon, authenticated;
grant execute on function public.macro_expire_explanations(uuid) to service_role;
```

- [ ] **Step 4: Run the integration test until it passes**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/macro/strategy/strategy.integration.test.ts`
Expected: PASS — `Tests  24 passed (24)`. If a case fails, fix the migration (it is not locked yet), never the expectation, unless the expectation contradicts spec §4.4 — then stop and report NEEDS_CONTEXT.

- [ ] **Step 5: Database types**

In `src/lib/supabase/database.types.ts` make three insertions (do not touch anything else):

(a) Header — insert immediately **before** the line `// Regenerate with: npm run supabase:types (after supabase link)`:

```ts
// MACRO-P3
// + 20261115090000_macro_strategy.sql (macro_strategy_manifests, macro_review_results, macro_review_current,
//   macro_review_attempts, macro_explanation_runs, macro_explanations; the eight RPCs are not registered)
// /MACRO-P3
```

(b) Row types — insert immediately **before** the line `export type Database = {`:

```ts
// MACRO-P3
// Macro strategy (supabase/migrations/20261115090000_macro_strategy.sql). Manifests and the two review tables are
// public read; attempts and runs are service-role only; macro_explanations is readable by its owner only (RLS).
// No role writes directly: the eight RPCs (service_role) do, and they are not registered under Functions (narrow
// clients, src/lib/macro/strategy/db.ts). jsonb columns are typed loosely; src/lib/macro/strategy/contract.ts owns
// their shapes. generation is bigint (a JSON number from PostgREST).
export type MacroManifestKind = 'transmission' | 'policy_response' | 'cycle_table' | 'review' | 'explain_facts';
export interface MacroStrategyManifestRow {
  manifest_id: string;
  kind: MacroManifestKind;
  body: Record<string, unknown>;
  manifest_hash: string;
  cutoff: string;
  method_version: string;
  code_version: string;
  catalog_version: string;
  created_at: string;
}
export interface MacroReviewResultRow {
  result_id: string;
  region: 'US' | 'CN';
  month: string;
  status: 'ok' | 'insufficient';
  manifest_id: string;
  manifest_hash: string;
  facts: Record<string, unknown>;
  method_version: string;
  code_version: string;
  created_at: string;
}
export interface MacroReviewCurrentRow {
  region: 'US' | 'CN';
  month: string;
  result_id: string;
  generation: number;
  cutoff: string;
  updated_at: string;
}
export interface MacroReviewAttemptRow {
  attempt_id: string;
  region: 'US' | 'CN';
  month: string;
  status: 'ok' | 'replayed' | 'insufficient' | 'failed' | 'stale';
  result_id: string | null;
  error: Record<string, unknown> | null;
  created_at: string;
}
export interface MacroExplanationRunRow {
  explanation_id: string;
  user_id: string;
  request_id: string;
  payload_hash: string;
  subject_kind: 'snapshot' | 'review';
  subject_id: string;
  locale: 'zh' | 'en';
  manifest_id: string;
  state: 'running' | 'accepted' | 'rejected' | 'failed' | 'abandoned';
  claimed_at: string;
  finished_at: string | null;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  validator_version: string | null;
  raw_output: unknown;
  validation: Record<string, unknown> | null;
  usage_audit_key: string;
  accounting: unknown;
  finalize_payload: Record<string, unknown> | null;
  finalized: boolean;
  late_output: Record<string, unknown> | null;
}
export interface MacroExplanationRow {
  explanation_id: string;
  user_id: string;
  subject_kind: 'snapshot' | 'review';
  subject_id: string;
  locale: 'zh' | 'en';
  manifest_id: string;
  state: 'running' | 'accepted' | 'rejected' | 'failed';
  rendered: Record<string, unknown> | null;
  failure_codes: string[];
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  validator_version: string | null;
  created_at: string;
  finished_at: string | null;
}
// /MACRO-P3
```

(c) Tables — insert immediately **before** the two lines `    };` / `    Functions: {` (that is, as the last entries of `Tables`):

```ts
      // MACRO-P3
      macro_strategy_manifests: { Row: MacroStrategyManifestRow; Insert: Partial<MacroStrategyManifestRow>; Update: Partial<MacroStrategyManifestRow> };
      macro_review_results: { Row: MacroReviewResultRow; Insert: Partial<MacroReviewResultRow>; Update: Partial<MacroReviewResultRow> };
      macro_review_current: { Row: MacroReviewCurrentRow; Insert: Partial<MacroReviewCurrentRow>; Update: Partial<MacroReviewCurrentRow> };
      macro_review_attempts: { Row: MacroReviewAttemptRow; Insert: Partial<MacroReviewAttemptRow>; Update: Partial<MacroReviewAttemptRow> };
      macro_explanation_runs: { Row: MacroExplanationRunRow; Insert: Partial<MacroExplanationRunRow>; Update: Partial<MacroExplanationRunRow> };
      macro_explanations: { Row: MacroExplanationRow; Insert: Partial<MacroExplanationRow>; Update: Partial<MacroExplanationRow> };
      // /MACRO-P3
```

- [ ] **Step 6: Register the critical suite**

In `scripts/ci/research-checks.ts`, the `criticalSuites` expression ends with a line containing only `;` right before `export function migrationInventory`. Insert immediately **before** that `;` line (after the `// F6 end` line, or after whatever sibling block is last):

```ts
 // MACRO-P3
 .concat('src/lib/macro/strategy/strategy.integration.test.ts')
 // /MACRO-P3
```

- [ ] **Step 7: Lock the migration, then the migration and DB gates**

Run: `shasum -a 256 supabase/migrations/20261115090000_macro_strategy.sql`
Append one entry as the **last** element of the `migrations` array in `supabase/migrations.lock.json` (keep the file's 4-space / 6-space indentation; add the comma after the previous last entry), with the hex digest that command printed:

```json
    {
      "file": "20261115090000_macro_strategy.sql",
      "sha256": "<the 64-hex digest printed by shasum>"
    }
```

From now on the migration file must never change (any later byte change fails `migrationInventory`).

Run: `LC_ALL=C npm run test:migrations`
Expected: PASS (fresh and seeded-upgrade schemas identical; report written to `reports/migration-rehearsal.json`).

Run: `LC_ALL=C npm run test:db`
Expected: PASS, and `strategy.integration.test.ts` is listed among the critical suites with 24 passed tests (no "Database suite inventory drift").

- [ ] **Step 8: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261115090000_macro_strategy.sql supabase/migrations.lock.json src/lib/macro/strategy/strategy.integration.test.ts src/lib/supabase/database.types.ts scripts/ci/research-checks.ts
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): migration with six tables and eight RPCs, lock, types, integration suite

Spec 2026-11-07 §4.4 (draft 4): manifests idempotent by hash, immutable review
results with a generation-CAS pointer (absent = 0, replayed before stale), attempt
log, service-only explanation runs with claim / record-completion / finish /
finalize state machine under a row lock, durable finalize payloads, abandonment
after five minutes (on claim and by user expiry), RLS-scoped projection. Critical
suite registered.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Shared contract, flags, StrategyReadPort, test fixture

**Files:**
- Create: `src/lib/macro/strategy/contract.ts`（计划"共享契约"代码块逐字）
- Create: `src/lib/macro/strategy/flags.ts`
- Create: `src/lib/macro/strategy/port.ts`
- Create: `src/lib/macro/strategy/testing/fixture.ts`
- Test: `src/lib/macro/strategy/flags.test.ts`, `src/lib/macro/strategy/port.test.ts`, `src/lib/macro/strategy/testing/fixture.test.ts`

Notes for the implementer:
- `contract.ts` 是计划文件 `docs/superpowers/plans/2026-11-07-macro-workbench-p3-p4.md` "## 共享契约"下第一个 TypeScript 代码块的逐字副本（下面 Step 1 原样给出）。不改任何形状、不加导出。
- `testing/fixture.ts` 只被测试 import；`port.ts` 对它只有 `import type`（运行时不依赖）。
- `FIXTURE_CATALOG` 是 P1 目录（P1 spec §4.2、P1 plan Task 2 `catalog.ts`）全部 40 行的镜像 + P3 增补 `US_FED_TARGET_D`（spec §4.2）。`source` 投影为镜像形状 `{publisher, via?, fetchHost, rights}`（P1 的 `adapter`、`seriesKey`、`attribution` 不在 P3 契约里）；其余字段逐字照 P1。
- `FIXTURE_RULES` 是 P1 `regime.ts` `RULES`（P1 spec §5.2 表、P1 plan Task 10）按表序的投影：P1 的规则 id（`policy.lt2_5` …）、P1 的双语 label 作 `condition`、P1 的 support。
- `fedTargetFixture()` 是稀疏的（设计如此）：每个变动日（FRED 公布值）加其前一日（旧值），足以派生每个事件且不多派生；`DFEDTAR` 最后一条 2008-12-15 = 1.00；`DFEDTARU/L` 首条 2008-12-16（0.25 / 0.00，无"前一日"）。值按 FRED CSV 文本写两位小数。
- `memoryStrategyPort` 的 `derivePolicyEvents` / `timeliness` 复刻 P2 `events.ts derivePolicyEvents`（`macro-events/1`）与 P1 `freshness.ts releaseTimeliness`（下一期末 + `releaseLagDays` + 3 天宽限）的语义，只供测试；十进制只用 `canonicalDecimal`（`src/lib/facts/json-numbers.ts`）与 BigInt，不用浮点。
- 开关值只认字符串 `'1'`（与 P1 `MACRO_JUDGMENTS_ENABLED === '1'` 一致）。

- [ ] **Step 1: Create the shared contract (verbatim)**

Create `src/lib/macro/strategy/contract.ts`:

```ts
// src/lib/macro/strategy/contract.ts
// Structural mirror of the P1+P2 macro contract (plan 2026-11-06-macro-workbench.md §共享契约, Task 14) plus this module's
// shared types (spec 2026-11-07 §4–§6). P1+P2 is not on main: at WP-S6 the mirrored declarations are replaced by imports
// from src/lib/macro/{types,judgment-contract,events} and a type test asserts assignability both ways. Mirror only fields
// that P1+P2 define.
// ---- P1+P2 mirror ----
export type Region='US'|'CN';
export type SeriesType='policy_rate'|'bond_yield'|'fx'|'inflation_yoy'|'pmi'|'labor_rate'|'growth_yoy'|'liquidity_yoy'|'risk_index'|'asset_price';
export type ChangeKind='bp'|'pp'|'pct'|'points';
export interface Bilingual{zh:string;en:string}
export type DeriveRule={kind:'month_end';from:string}|{kind:'yoy_from_index';from:string}|{kind:'index_minus_100';from:string};
export interface MacroSeriesDef{
 id:string;region:Region;role:'indicator'|'asset'|'event_source';type:SeriesType|null;name:Bilingual;unit:string;
 nativeFrequency:'daily'|'monthly'|'quarterly'|'event';period:'day'|'month'|'quarter';adjustment:'sa'|'nsa'|'na';
 status:'active'|'missing'|'restricted';reason?:Bilingual;source:{publisher:Bilingual;via?:Bilingual;fetchHost:string;rights:'public_domain'|'official_open'|'third_party'}|null;
 derive?:DeriveRule;aliasOf?:string;revisionPolicy:'revisable'|'immutable';weight:number;changeKind:ChangeKind;releaseLagDays?:number;definitionVersion:number;
}
export interface ObservationRow{
 observation_id:string;series_id:string;period_end:string;value_text:string;version:number;
 available_at:string;availability_basis:'first_seen';ingested_at:string;status:'ok'|'quarantined'|'rejected';
 retrieval_id:string|null;derived_from:string[]|null;transform:string|null;
}
export interface SnapshotRecord{
 snapshot_id:string;region:Region;as_of:string;revision:number;methodology_version:string;catalog_version:string;
 observation_ids:string[];history_ids:string[];catalog_counts:{verified:number;missing:number;restricted:number};
 status:'active'|'superseded'|'failed';created_at:string;
}
export type Regime='recovery'|'overheat'|'stagflation'|'recession';
export const REGIMES:readonly Regime[]=['recovery','overheat','stagflation','recession'];
export type Timeliness='current'|'late'|'missing'|'n/a';
export type EventInput=Pick<ObservationRow,'observation_id'|'period_end'|'value_text'>;
export interface PolicyEvent{
 kind:'policy_target_change';region:'US';effective_date:string;upper_from:string;upper_to:string;lower_from:string;lower_to:string;change_bp:string;source:'derived';
 evidence:[string,string,string,string];version:string;
}
/** Read-only projection of P1 regime.ts RULES (spec §5.2). support values are rule parameters, never shown as percentages. */
export interface RuleRow{rule_id:string;type:SeriesType;condition:Bilingual;support:Partial<Record<Regime,number>>}
export interface RulesView{rulesVersion:string;rows:RuleRow[]}
// ---- this module ----
export type ManifestKind='transmission'|'policy_response'|'cycle_table'|'review'|'explain_facts';
export type InputSource={kind:'snapshot';snapshot_id:string}|{kind:'history';as_of:string};
export interface ManifestInput{series_id:string;role:string;observation_id:string;period_end:string;value_text:string;version:number;available_at:string;source:InputSource}
export type EventBasis='range'|'single_target'|'single_to_range';
export type StrategyPolicyEvent=PolicyEvent&{basis:EventBasis};
/** transition_unverified: the 2008 switch could not be verified (near = 2008-12-16). history_truncated: an event-source read
 *  was truncated, so there are no events at all (near = the cutoff date); views show it, never an empty history. */
export interface EventGap{kind:'transition_unverified'|'history_truncated';reason:string;near:string}
export interface FrozenSnapshot{snapshot_id:string;created_at:string;as_of:string;catalog_counts:{verified:number;missing:number;restricted:number};observation_ids:string[];history_ids:string[]}
/** Catalog projection frozen into a manifest (spec §4.5 N2): replay never reads the live catalog. */
export type FrozenSeriesDef=Pick<MacroSeriesDef,'id'|'region'|'role'|'type'|'name'|'unit'|'status'|'reason'|'aliasOf'|'derive'|'changeKind'|'releaseLagDays'|'nativeFrequency'|'period'>;
export interface ManifestRead{series_id:string;purpose:string;state:'ok'|'missing'|'truncated'}
/** The whole canonical manifest body; manifest_hash = sha256Hex(canonicalJson(body)) is its single identity (spec §4.4 N3).
 *  params = the calculation parameters (transmission {region}, policy_response {window}, cycle_table {boundary, columns}, review
 *  {region, month}, explain_facts {subject…}); views and replay read them from here. facts (explain_facts only) = the exact
 *  fact list given to the model, so an explanation's input is rebuilt from its manifest alone. */
export interface StrategyManifest{
 kind:ManifestKind;params:Record<string,string|number>;cutoff:string;
 snapshots:{US:FrozenSnapshot|null;CN:FrozenSnapshot|null};
 baseline?:{cutoff:string;US:FrozenSnapshot|null;CN:FrozenSnapshot|null};
 catalog:FrozenSeriesDef[];rules?:RulesView;reads:ManifestRead[];
 inputs:ManifestInput[];events?:StrategyPolicyEvent[];gaps?:EventGap[];timeliness?:{series_id:string;state:Timeliness}[];facts?:Fact[];
 catalog_version:string;method_version:string;code_version:string;
}
export interface StoredManifest{manifest_id:string;manifest_hash:string;body:StrategyManifest;created_at:string}
/** Role of an observation taken from a snapshot (spec §4.5): 'latest' = max period_end; 'prev' / 'prev3m' = comparison periods.
 *  ManifestInput.role is '<purpose>:<series_id>:<latest|prev|prev3m|base|end|from|to|month_end|history|evidence>' — writers use the helpers in
 *  manifest.ts ('history' = a whole daily window, cycle-table columns; 'evidence' = an event-source row an event or the 2008 switch check reads). */
export type SnapshotRole='latest'|'prev'|'prev3m';
export type NodeState='observed'|'derived'|'assumption'|'missing'|'restricted'|'not_in_catalog';
export interface ObsRef{observation_id:string;series_id:string;period_end:string;value_text:string;version:number;available_at:string;source:InputSource}
export interface NodeView{id:string;state:NodeState;label:Bilingual;value_text:string|null;unit:string|null;period_end:string|null;inputs:ObsRef[];reason:Bilingual|null}
export type Stage='economy'|'policy'|'liquidity'|'rates'|'risk'|'assets';
export interface TransmissionView{version:string;region:Region;manifest_id:string;cutoff:string;snapshots:{US:string|null;CN:string|null};catalog_version:string;stages:{stage:Stage;label:Bilingual;nodes:NodeView[];edge:{text:Bilingual;kind:'assumption'}|null}[]}
export interface PlaybookView{regime:Regime;title:Bilingual;triggers:{rule_id:string;type:SeriesType;condition:Bilingual;support:number}[];mechanism:Bilingual[];implications:{favored:Bilingual[];disfavored:Bilingual[]};watch:{series_id:string;name:Bilingual}[]}
export interface F4Mark{regime:Regime|null;judgment_id:string;snapshot_match:boolean;as_of:string}
/** Number-free F4 summary rendered by P3/P4 (spec §5.2 N12). Never carries distribution, margin, accuracy or percent. */
export interface F4Summary{judgment_id:string;selected:Regime|null;lifecycle:string;outcome:'hit'|'miss'|null;calibration:string;methodology:{id:string;version:string};as_of:string;href:string|null}
export type JudgmentStatus='disabled'|'unavailable'|'ok';
export interface TransmissionResponse{transmission:TransmissionView;playbooks:PlaybookView[];judgment_status:JudgmentStatus;f4?:{mark:F4Mark;summary:F4Summary}}
export type ExclusionReason='incomplete_window'|'overlap'|'non_positive_base'|'missing_endpoint';
export interface EndpointRef{period_end:string;value_text:string;inputs:ObsRef[]}   // spread endpoints carry two inputs
export interface EventRow{effective_date:string;change_bp:string;basis:EventBasis;base:EndpointRef|null;end:EndpointRef|null;change_raw:number|null;change_text:string|null;selected:boolean;exclusion:ExclusionReason|null}
export type Cell=
 |{status:'stats';n:number;median_raw:number;q1_raw:number;q3_raw:number;unit:'pct'|'bp';events:EventRow[]}
 |{status:'events_only';n:number;unit:'pct'|'bp';events:EventRow[]}
 |{status:'insufficient';unit:'pct'|'bp';events:EventRow[]}
 |{status:'restricted'|'not_in_catalog'|'missing';reason:Bilingual};
export interface ResponseDim{id:string;label:Bilingual;unit:'pct'|'bp';kind:'series'|'spread'|'restricted'|'not_in_catalog';series?:string;a?:string;b?:string;coverage:{from:string|null;to:string|null}}
export interface PolicyResponseView{version:string;window:1|3|6;manifest_id:string;cutoff:string;dims:ResponseDim[];rows:{direction:'hike'|'cut'|'qe_qt';cells:Record<string,Cell>}[];sentences:Bilingual[]}
export type Boundary='event_day'|'first_trading_day'|'month_end';
export interface Episode{index:number;direction:'hike'|'cut';start:string;end:string;events:number;upper_from:string;upper_to:string;cumulative_bp:string;left_censored:boolean;ongoing:boolean;gap_after:boolean}
export type CycleCell={status:'ok';from:ObsRef;to:ObsRef;change_raw:number|null;change_text:string;change_kind:'pct'|'bp'}|{status:'missing';reason:'out_of_coverage'|'degenerate'|'non_positive_base'|'history_truncated'|'month_not_closed'}|{status:'restricted'};
export interface CycleColumn{id:string;label:Bilingual;change_kind:'pct'|'bp';daily_series:string|null;monthly_series:string|null;restricted:boolean}
export interface CycleTableView{version:string;episodes_version:string;boundary:Boundary;manifest_id:string;cutoff:string;episodes:Episode[];columns:CycleColumn[];cells:Record<string,Record<string,CycleCell>>;gaps:EventGap[]}  // cells[episodeIndex][columnId]
export type FactKind='level'|'change'|'policy_event'|'derived'|'response_cell'|'revision'|'release'|'timeliness'|'episode'|'asset_move'|'coverage';
export interface Fact{fact_id:string;kind:FactKind;template:string;slots:Record<string,{value_text:string;unit:string}|string>;series_id?:string;period_end?:string;source_inputs:string[]}
export interface ReviewFacts{
 region:Region;month:string;cutoff:string;baseline_cutoff:string;snapshot_id:string|null;baseline_snapshot_id:string|null;baseline_missing:boolean;
 releases:Fact[];revisions:Fact[];timeliness:Fact[];policy_events:Fact[];episode_changes:Fact[];asset_moves:Fact[];coverage:Fact[];
}
export type ReviewStatus='ok'|'insufficient';
export interface ReviewResult{result_id:string;region:Region;month:string;status:ReviewStatus;manifest_id:string;manifest_hash:string;facts:ReviewFacts;method_version:string;code_version:string;created_at:string}
export type ExplanationState='running'|'accepted'|'rejected'|'failed'|'abandoned';
export interface RenderedExplanation{facts:{fact_id:string;text:string}[];hypotheses:{text:string;fact_ids:string[]}[];counterpoints:{text:string;fact_ids:string[]}[]}
export interface ExplanationProjection{explanation_id:string;subject_kind:'snapshot'|'review';subject_id:string;locale:'zh'|'en';manifest_id:string;state:ExplanationState;rendered:RenderedExplanation|null;failure_codes:string[];provider:string|null;model:string|null;prompt_version:string;validator_version:string;created_at:string;finished_at:string|null}
export type DiffKind='revised'|'dropped'|'unchanged'|'newly_available';
export type NewlySubkind='later_period'|'backfill'|'new_series';
export interface DeviationCase{judgment_id:string;settlement_id:string|null;region:Region;as_of:string;selected:Regime;realized:Regime|null;evidence_state:'complete'|'evidence_incomplete';diffs:{series_id:string;period_end:string;role:'latest'|'comparison';kind:DiffKind;subkind:NewlySubkind|null;registered:{vintage_id:string;value:number}|null;settled:{vintage_id:string;value:number}|null}[]}
export const VERSIONS={transmission:'macro-transmission/1',playbooks:'macro-playbooks/1',events:'macro-strategy-events/1',response:'macro-policy-response/1',
 cycleTable:'macro-cycle-table/1',episodes:'macro-policy-episodes/1',facts:'macro-facts/1',review:'macro-review/1',prompt:'macro-explain-prompt/1',
 validator:'macro-explain-validator/1',deviations:'macro-deviations/1'} as const;
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/macro/strategy/testing/fixture.test.ts`:

```ts
// src/lib/macro/strategy/testing/fixture.test.ts
// The test fixture is itself checked (plan 2026-11-07 Task 2): catalog rows mirror P1 §4.2 (+ US_FED_TARGET_D), rules
// mirror P1 §5.2 in table order, builders are deterministic, the Fed target data reproduce FRED's change dates.
import {describe,expect,it} from 'vitest';
import {REGIMES} from '../contract';
import {FIXTURE_CATALOG,FIXTURE_CATALOG_VERSION,FIXTURE_RULES,daily,fedTargetFixture,fixture,monthly,obs,snap} from './fixture';

describe('FIXTURE_CATALOG',()=>{
 const byId=new Map(FIXTURE_CATALOG.map(d=>[d.id,d]));
 it('has the 40 P1 rows plus US_FED_TARGET_D, unique ids, P1 missing/restricted sets',()=>{
  expect(FIXTURE_CATALOG).toHaveLength(41);
  expect(byId.size).toBe(41);
  expect(FIXTURE_CATALOG.filter(d=>d.status==='missing').map(d=>d.id).sort()).toEqual(['CN_AFRE_STOCK_YOY','CN_LPR_1Y','CN_MLF_1Y','US_ISM_PMI']);
  expect(FIXTURE_CATALOG.filter(d=>d.status==='restricted').map(d=>d.id).sort()).toEqual(['CN_CSI300','US_DJIA','US_NASDAQCOM','US_SP500','US_VIX','US_VIX_D']);
  for(const d of FIXTURE_CATALOG){
   expect({id:d.id,reason:d.status==='active'?d.reason===undefined:!!d.reason}).toEqual({id:d.id,reason:true});
   expect({id:d.id,source:d.status==='missing'?d.source===null:d.source!==null}).toEqual({id:d.id,source:true});
  }
 });
 it('keeps P1 weights (US 100, CN 125 over role=indicator) and resolvable derive/alias references',()=>{
  const w=(r:'US'|'CN')=>FIXTURE_CATALOG.filter(d=>d.region===r&&d.role==='indicator').reduce((s,d)=>s+d.weight,0);
  expect([w('US'),w('CN')]).toEqual([100,125]);
  for(const d of FIXTURE_CATALOG){
   if(d.derive)expect({id:d.id,ok:byId.has(d.derive.from)}).toEqual({id:d.id,ok:true});
   if(d.aliasOf)expect({id:d.id,ok:byId.has(d.aliasOf)}).toEqual({id:d.id,ok:true});
  }
  expect(byId.get('US_UST10Y')).toMatchObject({aliasOf:'US_DGS10',changeKind:'bp',role:'asset'});
  expect(byId.get('CN_CGB10Y')).toMatchObject({aliasOf:'CN_CGB_10Y',changeKind:'bp',role:'asset'});
  expect(byId.get('US_WTI')).toMatchObject({derive:{kind:'month_end',from:'US_WTI_D'},changeKind:'pct'});
 });
 it('adds US_FED_TARGET_D as a weight-0 immutable daily event source (spec §4.2)',()=>{
  expect(byId.get('US_FED_TARGET_D')).toMatchObject({region:'US',role:'event_source',type:'policy_rate',unit:'pct',nativeFrequency:'daily',period:'day',status:'active',weight:0,revisionPolicy:'immutable',changeKind:'bp'});
  expect(byId.get('US_FED_TARGET_D')!.source).toMatchObject({fetchHost:'fred.stlouisfed.org',rights:'public_domain'});
 });
});

describe('FIXTURE_RULES',()=>{
 it('is the P1 v1.0 table: 28 rows in table order, unique ids, supports only on the four regimes',()=>{
  expect(FIXTURE_RULES.rulesVersion).toBe('macro-regime-rules/1.0');
  expect(FIXTURE_RULES.rows).toHaveLength(28);
  expect(new Set(FIXTURE_RULES.rows.map(r=>r.rule_id)).size).toBe(28);
  expect(FIXTURE_RULES.rows.map(r=>r.type).filter((t,i,a)=>a.indexOf(t)===i)).toEqual(['policy_rate','bond_yield','fx','inflation_yoy','pmi','labor_rate','growth_yoy','liquidity_yoy','risk_index']);
  for(const r of FIXTURE_RULES.rows)for(const k of Object.keys(r.support))expect(REGIMES).toContain(k);
  expect(FIXTURE_RULES.rows[0]).toEqual({rule_id:'policy.lt2_5',type:'policy_rate',condition:{zh:'政策利率 < 2.5%',en:'policy rate < 2.5%'},support:{recovery:0.2,recession:0.7}});
  expect(FIXTURE_RULES.rows.find(r=>r.rule_id==='infl.gt4')!.support).toEqual({overheat:0.4,stagflation:0.6});
 });
});

describe('builders',()=>{
 it('obs: deterministic id, default available_at and ok status',()=>{
  expect(obs('US_UNRATE','2026-09-30','4.1')).toEqual({observation_id:'obs:US_UNRATE:2026-09-30:v1',series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.1',version:1,
   available_at:'2026-09-30T12:00:00Z',availability_basis:'first_seen',ingested_at:'2026-09-30T12:00:00Z',status:'ok',retrieval_id:null,derived_from:null,transform:null});
  expect(obs('X','2026-01-31','1',{version:2,availableAt:'2026-03-01T00:00:00Z',status:'quarantined'})).toMatchObject({observation_id:'obs:X:2026-01-31:v2',available_at:'2026-03-01T00:00:00Z',status:'quarantined'});
 });
 it('monthly: month ends from firstMonth, null leaves a gap; daily: one row per point',()=>{
  expect(monthly('US_UNRATE','2025-11',['4.2',null,'4.0']).map(o=>[o.period_end,o.value_text])).toEqual([['2025-11-30','4.2'],['2026-01-31','4.0']]);
  expect(monthly('US_UNRATE','2024-02',['1'],{availableAt:'2024-03-05T00:00:00Z'})[0]).toMatchObject({period_end:'2024-02-29',available_at:'2024-03-05T00:00:00Z'});
  expect(daily('US_DGS10_D',[['2026-10-01','4.1'],['2026-10-02','4.2']]).map(o=>o.observation_id)).toEqual(['obs:US_DGS10_D:2026-10-01:v1','obs:US_DGS10_D:2026-10-02:v1']);
 });
 it('snap: id from region and created_at, active by default, counts from the catalog',()=>{
  const s=snap('US','2026-11-01T08:00:00.000Z',['a']);
  expect(s).toMatchObject({snapshot_id:'snap:US:2026-11-01T08:00:00.000Z',region:'US',as_of:'2026-11-01',status:'active',observation_ids:['a'],history_ids:[],catalog_version:FIXTURE_CATALOG_VERSION});
  expect(s.catalog_counts).toEqual({verified:17,missing:1,restricted:5});
  expect(snap('CN','2026-11-01T08:00:00.000Z',[],{status:'failed'}).status).toBe('failed');
 });
 it('fixture: defaults and overrides',()=>{
  const f=fixture();
  expect(f).toMatchObject({catalog:FIXTURE_CATALOG,catalogVersion:FIXTURE_CATALOG_VERSION,rules:FIXTURE_RULES,snapshots:[],observations:[]});
  expect(fixture({today:'2026-11-07'}).today).toBe('2026-11-07');
 });
});

describe('fedTargetFixture (sparse by design: change dates plus the day before)',()=>{
 const rows=fedTargetFixture();
 const of=(id:string)=>rows.filter(o=>o.series_id===id);
 it('single target 2007-09-17 … 2008-12-15 = 1.00, ascending, nine changes',()=>{
  const t=of('US_FED_TARGET_D');
  expect(t[0]).toMatchObject({period_end:'2007-09-17',value_text:'5.25'});
  expect(t[t.length-1]).toMatchObject({period_end:'2008-12-15',value_text:'1.00'});
  expect(t.map(o=>o.period_end)).toEqual([...t.map(o=>o.period_end)].sort());
  const changes=t.slice(1).filter((o,i)=>o.value_text!==t[i].value_text).map(o=>o.period_end);
  expect(changes).toEqual(['2007-09-18','2007-10-31','2007-12-11','2008-01-22','2008-01-30','2008-03-18','2008-04-30','2008-10-08','2008-10-29']);
 });
 it('range starts 2008-12-16 at 0.25 / 0.00 and both bounds share every date',()=>{
  const u=of('US_FED_TARGET_UPPER_D'),l=of('US_FED_TARGET_LOWER_D');
  expect([u[0].period_end,u[0].value_text,l[0].value_text]).toEqual(['2008-12-16','0.25','0.00']);
  expect(u.map(o=>o.period_end)).toEqual(l.map(o=>o.period_end));
  expect(u[u.length-1]).toMatchObject({period_end:'2024-12-19',value_text:'4.50'});
  expect(u.find(o=>o.period_end==='2015-12-16')!.value_text).toBe('0.25');   // day before the 2015 hike repeats the old range
 });
});
```

Create `src/lib/macro/strategy/port.test.ts`:

```ts
// src/lib/macro/strategy/port.test.ts
// StrategyReadPort semantics on memoryStrategyPort (spec §4.3) and the null production port (§9.1).
import {describe,expect,it} from 'vitest';
import {memoryStrategyPort,strategyPort} from './port';
import {FIXTURE_CATALOG,FIXTURE_CATALOG_VERSION,FIXTURE_RULES,fedTargetFixture,fixture,monthly,obs,snap} from './testing/fixture';

describe('strategyPort',()=>{
 it('is null until WP-S6 wires P1+P2',()=>{expect(strategyPort()).toBeNull();});
});

describe('memoryStrategyPort snapshots',()=>{
 const s1=snap('US','2026-10-01T08:00:00.000Z',[]),s2=snap('US','2026-11-01T08:00:00.000Z',[],{status:'superseded'}),s3=snap('US','2026-11-01T08:00:00.000Z',[]);
 const tieA={...snap('CN','2026-11-02T08:00:00.000Z',[]),snapshot_id:'snap:CN:a'},tieB={...snap('CN','2026-11-02T08:00:00.000Z',[]),snapshot_id:'snap:CN:b'};
 const failed=snap('CN','2026-11-03T08:00:00.000Z',[],{status:'failed'});
 const port=memoryStrategyPort(fixture({snapshots:[s1,{...s2,snapshot_id:'snap:US:old'},s3,tieA,tieB,failed]}));
 it('activeSnapshot: newest active of the region; null when none',async()=>{
  expect((await port.activeSnapshot('US'))?.snapshot_id).toBe(s3.snapshot_id);
  expect(await memoryStrategyPort(fixture()).activeSnapshot('US')).toBeNull();
 });
 it('snapshot: by id or null',async()=>{
  expect((await port.snapshot(s1.snapshot_id))?.created_at).toBe('2026-10-01T08:00:00.000Z');
  expect(await port.snapshot('snap:none')).toBeNull();
 });
 it('snapshotUpTo: created_at ≤ cutoff, non-failed, ties on created_at → greatest snapshot_id',async()=>{
  expect((await port.snapshotUpTo('US','2026-10-15T00:00:00Z'))?.snapshot_id).toBe(s1.snapshot_id);
  expect((await port.snapshotUpTo('US','2026-09-30T00:00:00Z'))).toBeNull();
  expect((await port.snapshotUpTo('CN','2026-12-01T00:00:00Z'))?.snapshot_id).toBe('snap:CN:b');   // the failed 11-03 one is skipped
  expect((await port.snapshotUpTo('CN','2026-11-02T08:00:00.000Z'))?.snapshot_id).toBe('snap:CN:b');
 });
});

describe('memoryStrategyPort observations',()=>{
 const v1=obs('US_UNRATE','2026-08-31','4.3'),v2=obs('US_UNRATE','2026-08-31','4.2',{version:2,availableAt:'2026-10-03T12:00:00Z'});
 const sep=obs('US_UNRATE','2026-09-30','4.1',{availableAt:'2026-10-03T12:00:00Z'});
 const bad=obs('US_UNRATE','2026-10-31','9.9',{status:'quarantined'});
 const port=memoryStrategyPort(fixture({observations:[v1,v2,sep,bad,...monthly('US_DGS10','2026-01',['4.0','4.1','4.2'])]}));
 it('observationsByIds: ok rows in input order, unknown and non-ok ids dropped',async()=>{
  expect((await port.observationsByIds([sep.observation_id,'nope',v1.observation_id,bad.observation_id])).map(o=>o.observation_id)).toEqual([sep.observation_id,v1.observation_id]);
 });
 it('latestObservations: latest visible period, highest visible version, per series in input order',async()=>{
  expect((await port.latestObservations(['US_UNRATE','US_DGS10','US_NONE'],{asOf:'2026-10-01T00:00:00Z'})).map(o=>o.observation_id))
   .toEqual([v1.observation_id,'obs:US_DGS10:2026-03-31:v1']);
  expect((await port.latestObservations(['US_UNRATE'],{asOf:'2026-11-01T00:00:00Z'}))[0].observation_id).toBe(sep.observation_id);
 });
 it('seriesHistory: highest visible version per period, ascending, from/to bounds, truncated beyond maxRows',async()=>{
  expect((await port.seriesHistory('US_UNRATE',{asOf:'2026-11-01T00:00:00Z',maxRows:10})).map(o=>o.observation_id)).toEqual([v2.observation_id,sep.observation_id]);
  expect((await port.seriesHistory('US_UNRATE',{asOf:'2026-10-01T00:00:00Z',maxRows:10})).map(o=>o.observation_id)).toEqual([v1.observation_id]);
  expect((await port.seriesHistory('US_DGS10',{from:'2026-02-01',to:'2026-02-28',asOf:'2026-12-31T00:00:00Z',maxRows:10})).map(o=>o.value_text)).toEqual(['4.1']);
  await expect(port.seriesHistory('US_DGS10',{asOf:'2026-12-31T00:00:00Z',maxRows:2})).rejects.toThrow('truncated');
 });
 it('catalog, catalogVersion and rules come from the fixture',()=>{
  expect(port.catalog()).toBe(FIXTURE_CATALOG);expect(port.catalogVersion()).toBe(FIXTURE_CATALOG_VERSION);expect(port.rules()).toBe(FIXTURE_RULES);
 });
});

describe('memoryStrategyPort.derivePolicyEvents (P2 semantics)',()=>{
 const port=memoryStrategyPort(fixture());
 const row=(id:string,d:string,v:string)=>({observation_id:id,period_end:d,value_text:v});
 it('reproduces the P2 example: effective date, exact bp, four evidence ids',()=>{
  const upper=[row('u1','2024-09-17','5.5'),row('u2','2024-09-18','5'),row('u3','2024-09-19','5'),row('u4','2024-11-08','4.75')];
  const lower=[row('l1','2024-09-17','5.25'),row('l2','2024-09-18','4.75'),row('l3','2024-09-19','4.75'),row('l4','2024-11-08','4.5')];
  expect(port.derivePolicyEvents(upper,lower)).toEqual([
   {kind:'policy_target_change',region:'US',effective_date:'2024-09-18',upper_from:'5.5',upper_to:'5',lower_from:'5.25',lower_to:'4.75',change_bp:'-50',source:'derived',evidence:['u1','u2','l1','l2'],version:'macro-events/1'},
   {kind:'policy_target_change',region:'US',effective_date:'2024-11-08',upper_from:'5',upper_to:'4.75',lower_from:'4.75',lower_to:'4.5',change_bp:'-25',source:'derived',evidence:['u3','u4','l3','l4'],version:'macro-events/1'},
  ]);
 });
 it('uses the lower-bound move when only the lower bound changed; trailing zeros are no change; unsorted input throws',()=>{
  expect(port.derivePolicyEvents([row('a','2026-01-01','4'),row('b','2026-01-02','4')],[row('c','2026-01-01','3.75'),row('d','2026-01-02','3.5')]).map(e=>e.change_bp)).toEqual(['-25']);
  expect(port.derivePolicyEvents([row('a','2026-01-01','4.50'),row('b','2026-01-02','4.5')],[row('c','2026-01-01','4.25'),row('d','2026-01-02','4.250')])).toEqual([]);
  expect(()=>port.derivePolicyEvents([row('b','2026-01-02','4'),row('a','2026-01-01','4')],[])).toThrow(/events_unsorted/);
 });
 it('derives the 28 range changes of the Fed target fixture (2015-12-17 … 2024-12-19)',()=>{
  const rows=fedTargetFixture();
  const ev=port.derivePolicyEvents(rows.filter(o=>o.series_id==='US_FED_TARGET_UPPER_D'),rows.filter(o=>o.series_id==='US_FED_TARGET_LOWER_D'));
  expect(ev).toHaveLength(28);
  expect(ev[0]).toMatchObject({effective_date:'2015-12-17',upper_from:'0.25',upper_to:'0.5',lower_from:'0',lower_to:'0.25',change_bp:'25'});
  expect(ev.find(e=>e.effective_date==='2020-03-16')!.change_bp).toBe('-100');
  expect(ev.find(e=>e.effective_date==='2022-06-16')!.change_bp).toBe('75');
  expect(ev[27]).toMatchObject({effective_date:'2024-12-19',upper_to:'4.5',change_bp:'-25',evidence:['obs:US_FED_TARGET_UPPER_D:2024-12-18:v1','obs:US_FED_TARGET_UPPER_D:2024-12-19:v1','obs:US_FED_TARGET_LOWER_D:2024-12-18:v1','obs:US_FED_TARGET_LOWER_D:2024-12-19:v1']});
 });
});

describe('memoryStrategyPort.timeliness (P1 releaseTimeliness)',()=>{
 const port=memoryStrategyPort(fixture());
 const def=(id:string)=>FIXTURE_CATALOG.find(d=>d.id===id)!;
 it('next period end + lag + 3 days; missing; n/a for no lag or event series',()=>{
  expect(port.timeliness(def('US_CPI_YOY'),'2026-09-30','2026-11-18')).toBe('current');
  expect(port.timeliness(def('US_CPI_YOY'),'2026-09-30','2026-11-19')).toBe('late');
  expect(port.timeliness(def('CN_GDP_YOY'),'2026-06-30','2026-10-23')).toBe('current');
  expect(port.timeliness(def('CN_GDP_YOY'),'2026-06-30','2026-10-24')).toBe('late');
  expect(port.timeliness(def('US_UNRATE'),null,'2026-11-06')).toBe('missing');
  expect(port.timeliness(def('US_DGS10'),'2026-09-30','2027-01-01')).toBe('n/a');
  expect(port.timeliness(def('CN_MLF_1Y'),'2026-09-17','2027-01-01')).toBe('n/a');
 });
 it('rejects impossible or malformed dates like releaseTimeliness (round-trip validation)',()=>{
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-02-31','2026-11-18')).toThrow(/invalid_date/);   // monthly branch
  expect(()=>port.timeliness(def('CN_GDP_YOY'),'2026-06-31','2026-10-23')).toThrow(/invalid_date/);   // quarterly branch
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-13-01','2026-11-18')).toThrow(/invalid_date/);
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-09-30','2026-02-30')).toThrow(/invalid_date/);   // today
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-9-30','2026-11-18')).toThrow(/invalid_date/);
  expect(port.timeliness(def('US_CPI_YOY'),'2024-02-29','2024-04-03')).toBe('current');               // real leap day still fine
  expect(port.timeliness(def('US_DGS10'),'2026-02-31','2027-01-01')).toBe('n/a');                      // n/a / missing answered before parsing
  expect(port.timeliness(def('US_UNRATE'),null,'2026-11-06')).toBe('missing');
 });
```

Create `src/lib/macro/strategy/flags.test.ts`:

```ts
// src/lib/macro/strategy/flags.test.ts
// Capability matrix (spec §9.1): switch → foundation → judgment layer.
import {describe,expect,it} from 'vitest';
import {judgmentGate,judgmentStatus,judgmentsEnabled,strategyEnabled,strategyGate} from './flags';
import {memoryStrategyPort} from './port';
import {fixture} from './testing/fixture';

describe('flags',()=>{
 const port=memoryStrategyPort(fixture());
 it('switches are on only for the exact value "1"',()=>{
  expect(strategyEnabled({})).toBe(false);expect(strategyEnabled({MACRO_STRATEGY_ENABLED:'true'})).toBe(false);expect(strategyEnabled({MACRO_STRATEGY_ENABLED:'1'})).toBe(true);
  expect(judgmentsEnabled({})).toBe(false);expect(judgmentsEnabled({MACRO_JUDGMENTS_ENABLED:'1'})).toBe(true);
 });
 it('strategyGate: disabled → 404 strategy_disabled (even with a port); null port → 503 macro_foundation_unavailable; else ok with the judgment switch',()=>{
  expect(strategyGate({},port)).toEqual({ok:false,status:404,code:'strategy_disabled'});
  expect(strategyGate({MACRO_STRATEGY_ENABLED:'1'},null)).toEqual({ok:false,status:503,code:'macro_foundation_unavailable'});
  expect(strategyGate({MACRO_STRATEGY_ENABLED:'1'},port)).toEqual({ok:true,port,judgments:false});
  expect(strategyGate({MACRO_STRATEGY_ENABLED:'1',MACRO_JUDGMENTS_ENABLED:'1'},port)).toEqual({ok:true,port,judgments:true});
 });
 it('judgmentGate and judgmentStatus',()=>{
  expect(judgmentGate({})).toEqual({ok:false,status:404,code:'judgments_disabled'});
  expect(judgmentGate({MACRO_JUDGMENTS_ENABLED:'1'})).toEqual({ok:true});
  expect(judgmentStatus({},'ok')).toBe('disabled');
  expect(judgmentStatus({MACRO_JUDGMENTS_ENABLED:'1'},'failed')).toBe('unavailable');
  expect(judgmentStatus({MACRO_JUDGMENTS_ENABLED:'1'},'not_attempted')).toBe('unavailable');
  expect(judgmentStatus({MACRO_JUDGMENTS_ENABLED:'1'},'ok')).toBe('ok');
 });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npm test -- src/lib/macro/strategy/testing/fixture.test.ts src/lib/macro/strategy/port.test.ts src/lib/macro/strategy/flags.test.ts`
Expected: FAIL — 3 files fail to load (`Failed to resolve import "./fixture"`, `"./port"`, `"./flags"`).

- [ ] **Step 4: Implement the fixture**

Create `src/lib/macro/strategy/testing/fixture.ts`:

```ts
// src/lib/macro/strategy/testing/fixture.ts
// TEST-ONLY fixtures for the P3/P4 strategy module (plan 2026-11-07 Task 2; spec §4.2, §4.3, §12). Nothing under
// src/app or a non-test src/lib file may import this file at runtime (port.ts imports its type only).
// FIXTURE_CATALOG mirrors every row of the P1 catalog (P1 spec §4.2, P1 plan Task 2 catalog.ts): ids, regions, roles,
// types, names, units, frequencies, adjustment, status + reason, derive, aliasOf, revisionPolicy, weight, changeKind,
// releaseLagDays and definitionVersion exactly as P1 writes them; `source` is projected to the mirror shape
// {publisher, via, fetchHost, rights} (P1's adapter / seriesKey / attribution are not part of the P3 contract). It adds
// the P3 row US_FED_TARGET_D (spec §4.2, FRED DFEDTAR). FIXTURE_RULES copies P1 regime.ts RULES (P1 spec §5.2 table,
// P1 plan Task 10): the P1 rule ids, bilingual labels and support values in table order.
import type {Bilingual,MacroSeriesDef,ObservationRow,Region,RulesView,SnapshotRecord} from '../contract';

export interface StrategyFixture{
 catalog:MacroSeriesDef[];catalogVersion:string;rules:RulesView;
 snapshots:SnapshotRecord[];observations:ObservationRow[];   // all versions; memory port applies asOf / ok rules
 today?:string;
}

// ---------------------------------------------------------------- catalog (P1 §4.2 + P3 §4.2)
type Src=NonNullable<MacroSeriesDef['source']>;
const FED:Bilingual={zh:'美国联邦储备委员会',en:'Board of Governors of the Federal Reserve System'};
const BLS:Bilingual={zh:'美国劳工统计局',en:'U.S. Bureau of Labor Statistics'};
const EIA:Bilingual={zh:'美国能源信息署',en:'U.S. Energy Information Administration'};
const CBOE:Bilingual={zh:'芝加哥期权交易所',en:'Cboe Global Markets'};
const SPDJI:Bilingual={zh:'标普道琼斯指数公司',en:'S&P Dow Jones Indices LLC'};
const NASDAQ:Bilingual={zh:'纳斯达克',en:'Nasdaq, Inc.'};
const NBS:Bilingual={zh:'国家统计局',en:'National Bureau of Statistics of China'};
const PBOC:Bilingual={zh:'中国人民银行',en:"People's Bank of China"};
const GACC:Bilingual={zh:'海关总署',en:'General Administration of Customs of China'};
const CCDC:Bilingual={zh:'中央国债登记结算有限责任公司',en:'China Central Depository & Clearing Co., Ltd.'};
const SAFE:Bilingual={zh:'国家外汇管理局',en:'State Administration of Foreign Exchange'};
const CSI:Bilingual={zh:'中证指数有限公司',en:'China Securities Index Co., Ltd.'};
const VIA_FRED:Bilingual={zh:'FRED（圣路易斯联储）',en:'FRED (Federal Reserve Bank of St. Louis)'};
const fred=(publisher:Bilingual,rights:Src['rights']='public_domain'):Src=>({publisher,via:VIA_FRED,fetchHost:'fred.stlouisfed.org',rights});
const nbs=(publisher:Bilingual=NBS):Src=>({publisher,...(publisher===NBS?{}:{via:NBS}),fetchHost:'data.stats.gov.cn',rights:'official_open'});
const S_FED=fred(FED),S_BLS=fred(BLS),S_VIX=fred(CBOE,'third_party'),S_WTI=fred(EIA);
const S_CGB:Src={publisher:CCDC,fetchHost:'yield.chinabond.com.cn',rights:'official_open'};
const S_USDCNY:Src={publisher:SAFE,fetchHost:'www.safe.gov.cn',rights:'official_open'};
const R_THIRD_PARTY:Bilingual={zh:'第三方版权数据，再分发权利未经 owner 确认，暂不采集',en:'Third-party copyrighted data; redistribution rights not confirmed by the owner, not collected'};

export const FIXTURE_CATALOG:MacroSeriesDef[]=[
 // ---------------------------------------------------------------- US
 {id:'US_FEDFUNDS_EFF_D',region:'US',role:'indicator',type:'policy_rate',name:{zh:'联邦基金有效利率（日）',en:'Effective federal funds rate (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DFF',region:'US',role:'indicator',type:'policy_rate',name:{zh:'联邦基金有效利率（月末）',en:'Effective federal funds rate (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,derive:{kind:'month_end',from:'US_FEDFUNDS_EFF_D'},revisionPolicy:'immutable',weight:25,changeKind:'bp',definitionVersion:1},
 // P3 addition (spec §4.2): fred_csv / DFEDTAR, single target rate, the series ends 2008-12-15.
 {id:'US_FED_TARGET_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标利率（单一目标，止于 2008-12-15）',en:'Federal funds target rate (single target, ends 2008-12-15)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_FED_TARGET_UPPER_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标区间上限',en:'Federal funds target range upper limit'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_FED_TARGET_LOWER_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标区间下限',en:'Federal funds target range lower limit'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DGS10_D',region:'US',role:'indicator',type:'bond_yield',name:{zh:'美国 10 年期国债收益率（日）',en:'U.S. 10-year Treasury yield (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DGS10',region:'US',role:'indicator',type:'bond_yield',name:{zh:'美国 10 年期国债收益率（月末）',en:'U.S. 10-year Treasury yield (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,derive:{kind:'month_end',from:'US_DGS10_D'},revisionPolicy:'immutable',weight:15,changeKind:'bp',definitionVersion:1},
 {id:'US_DTWEXBGS_D',region:'US',role:'indicator',type:'fx',name:{zh:'美元名义广义指数（日）',en:'Nominal broad U.S. dollar index (daily)'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_DTWEXBGS',region:'US',role:'indicator',type:'fx',name:{zh:'美元名义广义指数（月末）',en:'Nominal broad U.S. dollar index (month end)'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,derive:{kind:'month_end',from:'US_DTWEXBGS_D'},revisionPolicy:'immutable',weight:10,changeKind:'pct',definitionVersion:1},
 {id:'US_CPI_INDEX',region:'US',role:'indicator',type:null,name:{zh:'美国 CPI 指数（城市全体消费者，季调）',en:'U.S. CPI for all urban consumers (index, SA)'},unit:'index_1982_84_100',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:15,definitionVersion:1},
 {id:'US_CPI_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 CPI 同比',en:'U.S. CPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,derive:{kind:'yoy_from_index',from:'US_CPI_INDEX'},revisionPolicy:'revisable',weight:15,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'US_UNRATE',region:'US',role:'indicator',type:'labor_rate',name:{zh:'美国失业率',en:'U.S. unemployment rate'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:7,definitionVersion:1},
 {id:'US_PPI_FD_INDEX',region:'US',role:'indicator',type:null,name:{zh:'美国 PPI 最终需求指数（季调）',en:'U.S. PPI final demand (index, SA)'},unit:'index_2009_11_100',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:15,definitionVersion:1},
 {id:'US_PPI_FD_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 PPI 最终需求同比',en:'U.S. PPI final demand, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,derive:{kind:'yoy_from_index',from:'US_PPI_FD_INDEX'},revisionPolicy:'revisable',weight:5,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'US_ISM_PMI',region:'US',role:'indicator',type:'pmi',name:{zh:'ISM 制造业 PMI',en:'ISM manufacturing PMI'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'missing',reason:{zh:'FRED 已于 2016 年移除 ISM 数据；没有可采集的原始来源与再分发权利',en:'FRED removed ISM data in 2016; no collectable original source or redistribution rights'},source:null,revisionPolicy:'revisable',weight:15,changeKind:'points',definitionVersion:1},
 {id:'US_VIX_D',region:'US',role:'indicator',type:'risk_index',name:{zh:'VIX 波动率指数（日）',en:'Cboe Volatility Index (daily)'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:S_VIX,revisionPolicy:'immutable',weight:0,changeKind:'points',definitionVersion:1},
 {id:'US_VIX',region:'US',role:'indicator',type:'risk_index',name:{zh:'VIX 波动率指数（月末）',en:'Cboe Volatility Index (month end)'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:S_VIX,derive:{kind:'month_end',from:'US_VIX_D'},revisionPolicy:'immutable',weight:5,changeKind:'points',definitionVersion:1},
 {id:'US_WTI_D',region:'US',role:'asset',type:'asset_price',name:{zh:'WTI 原油现货价格（日）',en:'WTI crude oil spot price (daily)'},unit:'usd_per_bbl',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_WTI,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_WTI',region:'US',role:'asset',type:'asset_price',name:{zh:'WTI 原油现货价格（月末）',en:'WTI crude oil spot price (month end)'},unit:'usd_per_bbl',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_WTI,derive:{kind:'month_end',from:'US_WTI_D'},revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_UST10Y',region:'US',role:'asset',type:'asset_price',name:{zh:'美国 10 年期国债（资产视角）',en:'U.S. 10-year Treasury (asset view)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,aliasOf:'US_DGS10',revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_SP500',region:'US',role:'asset',type:'asset_price',name:{zh:'标普 500 指数',en:'S&P 500'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred(SPDJI,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_NASDAQCOM',region:'US',role:'asset',type:'asset_price',name:{zh:'纳斯达克综合指数',en:'Nasdaq Composite'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred(NASDAQ,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_DJIA',region:'US',role:'asset',type:'asset_price',name:{zh:'道琼斯工业平均指数',en:'Dow Jones Industrial Average'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred(SPDJI,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 // ---------------------------------------------------------------- CN
 {id:'CN_CPI_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'居民消费价格指数（上年同月=100）',en:'CPI (same month last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),revisionPolicy:'immutable',weight:0,changeKind:'points',releaseLagDays:12,definitionVersion:1},
 {id:'CN_CPI_YOY',region:'CN',role:'indicator',type:'inflation_yoy',name:{zh:'中国 CPI 同比',en:'China CPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),derive:{kind:'index_minus_100',from:'CN_CPI_INDEX'},revisionPolicy:'immutable',weight:10,changeKind:'pp',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PPI_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'工业生产者出厂价格指数（上年同月=100）',en:'PPI (same month last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),revisionPolicy:'immutable',weight:0,changeKind:'points',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PPI_YOY',region:'CN',role:'indicator',type:'inflation_yoy',name:{zh:'中国 PPI 同比',en:'China PPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),derive:{kind:'index_minus_100',from:'CN_PPI_INDEX'},revisionPolicy:'immutable',weight:15,changeKind:'pp',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PMI_MFG',region:'CN',role:'indicator',type:'pmi',name:{zh:'制造业采购经理指数',en:'Manufacturing PMI'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:nbs(),revisionPolicy:'immutable',weight:15,changeKind:'points',releaseLagDays:1,definitionVersion:1},
 {id:'CN_GDP_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'国内生产总值指数（当季，上年同期=100）',en:'GDP index (quarter, same quarter last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'quarterly',period:'quarter',adjustment:'nsa',status:'active',source:nbs(),revisionPolicy:'revisable',weight:0,changeKind:'points',releaseLagDays:20,definitionVersion:1},
 {id:'CN_GDP_YOY',region:'CN',role:'indicator',type:'growth_yoy',name:{zh:'中国 GDP 当季同比',en:'China GDP, quarter year over year'},unit:'pct',nativeFrequency:'quarterly',period:'quarter',adjustment:'nsa',status:'active',source:nbs(),derive:{kind:'index_minus_100',from:'CN_GDP_INDEX'},revisionPolicy:'revisable',weight:5,changeKind:'pp',releaseLagDays:20,definitionVersion:1},
 {id:'CN_M2_YOY',region:'CN',role:'indicator',type:'liquidity_yoy',name:{zh:'M2 同比增长',en:'M2, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(PBOC),revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'CN_EXPORT_YOY',region:'CN',role:'indicator',type:'growth_yoy',name:{zh:'出口额同比（美元计）',en:'Exports, year over year (USD)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(GACC),revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:10,definitionVersion:1},
 {id:'CN_CGB_10Y_D',region:'CN',role:'indicator',type:'bond_yield',name:{zh:'中债 10 年期国债收益率（日）',en:'ChinaBond 10-year government bond yield (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_CGB,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'CN_CGB_10Y',region:'CN',role:'indicator',type:'bond_yield',name:{zh:'中债 10 年期国债收益率（月末）',en:'ChinaBond 10-year government bond yield (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_CGB,derive:{kind:'month_end',from:'CN_CGB_10Y_D'},revisionPolicy:'immutable',weight:15,changeKind:'bp',definitionVersion:1},
 {id:'CN_USDCNY_CP_D',region:'CN',role:'indicator',type:'fx',name:{zh:'人民币汇率中间价 美元（日）',en:'RMB central parity, USD (daily)'},unit:'cny_per_100usd',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_USDCNY,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'CN_USDCNY_CP',region:'CN',role:'indicator',type:'fx',name:{zh:'人民币汇率中间价 美元（月末）',en:'RMB central parity, USD (month end)'},unit:'cny_per_100usd',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_USDCNY,derive:{kind:'month_end',from:'CN_USDCNY_CP_D'},revisionPolicy:'immutable',weight:5,changeKind:'pct',definitionVersion:1},
 {id:'CN_LPR_1Y',region:'CN',role:'indicator',type:'policy_rate',name:{zh:'1 年期贷款市场报价利率',en:'1-year loan prime rate'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'missing',reason:{zh:'AKShare 仅有东方财富转载，无已核实的官方接口（全国银行间同业拆借中心）',en:'AKShare only offers a third-party relay; no verified official interface (CFETS)'},source:null,revisionPolicy:'immutable',weight:10,changeKind:'bp',definitionVersion:1},
 {id:'CN_MLF_1Y',region:'CN',role:'indicator',type:'policy_rate',name:{zh:'1 年期中期借贷便利利率',en:'1-year MLF rate'},unit:'pct',nativeFrequency:'event',period:'day',adjustment:'na',status:'missing',reason:{zh:'无已核实的官方接口（中国人民银行）',en:"No verified official interface (People's Bank of China)"},source:null,revisionPolicy:'immutable',weight:10,changeKind:'bp',definitionVersion:1},
 {id:'CN_AFRE_STOCK_YOY',region:'CN',role:'indicator',type:'liquidity_yoy',name:{zh:'社会融资规模存量同比',en:'Aggregate financing stock, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'missing',reason:{zh:'AKShare 只有商务部转载的增量口径，口径不同，不得替代存量同比',en:'AKShare only has a relayed flow measure; a different definition cannot stand in for the stock growth rate'},source:null,revisionPolicy:'revisable',weight:20,changeKind:'pp',definitionVersion:1},
 {id:'CN_CGB10Y',region:'CN',role:'asset',type:'asset_price',name:{zh:'中国 10 年期国债（资产视角）',en:'China 10-year government bond (asset view)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_CGB,aliasOf:'CN_CGB_10Y',revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'CN_CSI300',region:'CN',role:'asset',type:'asset_price',name:{zh:'沪深 300 指数',en:'CSI 300 Index'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:{zh:'中证指数公司数据，再分发权利未确认，暂不采集',en:'China Securities Index data; redistribution rights not confirmed, not collected'},source:{publisher:CSI,fetchHost:'www.csindex.com.cn',rights:'third_party'},revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
];
export const FIXTURE_CATALOG_VERSION='macro-catalog/fixture-1';

// ---------------------------------------------------------------- rules (P1 §5.2, P1 plan Task 10 RULES, table order)
const r=(rule_id:string,type:RulesView['rows'][number]['type'],zh:string,en:string,support:RulesView['rows'][number]['support'])=>({rule_id,type,condition:{zh,en},support});
export const FIXTURE_RULES:RulesView={rulesVersion:'macro-regime-rules/1.0',rows:[
 r('policy.lt2_5','policy_rate','政策利率 < 2.5%','policy rate < 2.5%',{recovery:0.2,recession:0.7}),
 r('policy.2_5to4_5','policy_rate','2.5% ≤ 政策利率 < 4.5%','2.5% ≤ policy rate < 4.5%',{recovery:0.3,overheat:0.2,stagflation:0.1,recession:0.1}),
 r('policy.ge4_5.up','policy_rate','政策利率 ≥ 4.5% 且未下调','policy rate ≥ 4.5% and not cut',{overheat:0.6,stagflation:0.3}),
 r('policy.ge4_5.down','policy_rate','政策利率 ≥ 4.5% 且下调','policy rate ≥ 4.5% and cut',{overheat:0.2,stagflation:0.2,recession:0.4}),
 r('bond.d3m.ge25bp','bond_yield','收益率 3 个月上行 ≥ 25bp','yield up ≥ 25bp over 3 months',{overheat:0.5,stagflation:0.3}),
 r('bond.d3m.le-25bp','bond_yield','收益率 3 个月下行 ≥ 25bp','yield down ≥ 25bp over 3 months',{recovery:0.2,recession:0.5}),
 r('bond.d3m.other','bond_yield','收益率 3 个月变动在 ±25bp 内','yield 3-month change within ±25bp',{recovery:0.2,overheat:0.2,stagflation:0.2,recession:0.2}),
 r('fx.chg3m.ge2','fx','汇率 3 个月变动 ≥ +2%','FX 3-month change ≥ +2%',{overheat:0.4,stagflation:0.3}),
 r('fx.chg3m.le-2','fx','汇率 3 个月变动 ≤ −2%','FX 3-month change ≤ −2%',{recovery:0.5,recession:0.2}),
 r('infl.lt1','inflation_yoy','通胀同比 < 1%','inflation < 1% y/y',{recovery:0.1,recession:0.7}),
 r('infl.1to2','inflation_yoy','1% ≤ 通胀同比 < 2%','1% ≤ inflation < 2% y/y',{recovery:0.5,recession:0.3}),
 r('infl.2to3','inflation_yoy','2% ≤ 通胀同比 ≤ 3%','2% ≤ inflation ≤ 3% y/y',{recovery:0.4,overheat:0.3,stagflation:0.1,recession:0.1}),
 r('infl.3to4','inflation_yoy','3% < 通胀同比 ≤ 4%','3% < inflation ≤ 4% y/y',{overheat:0.6,stagflation:0.3}),
 r('infl.gt4','inflation_yoy','通胀同比 > 4%','inflation > 4% y/y',{overheat:0.4,stagflation:0.6}),
 r('pmi.ge55','pmi','PMI ≥ 55','PMI ≥ 55',{recovery:0.3,overheat:0.6}),
 r('pmi.50to55','pmi','50 ≤ PMI < 55','50 ≤ PMI < 55',{recovery:0.5,overheat:0.3}),
 r('pmi.47to50','pmi','47 ≤ PMI < 50','47 ≤ PMI < 50',{recovery:0.1,stagflation:0.4,recession:0.4}),
 r('pmi.lt47','pmi','PMI < 47','PMI < 47',{stagflation:0.3,recession:0.7}),
 r('labor.d3m.ge0_3','labor_rate','失业率 3 个月上升 ≥ 0.3pp','unemployment up ≥ 0.3pp over 3 months',{stagflation:0.4,recession:0.5}),
 r('labor.d3m.le-0_1','labor_rate','失业率 3 个月下降 ≥ 0.1pp','unemployment down ≥ 0.1pp over 3 months',{recovery:0.5,overheat:0.4}),
 r('growth.ge5.up','growth_yoy','增长同比 ≥ 5% 且不低于上期','growth ≥ 5% y/y and not below the previous period',{recovery:0.5,overheat:0.3}),
 r('growth.lt4_5','growth_yoy','增长同比 < 4.5%','growth < 4.5% y/y',{stagflation:0.3,recession:0.6}),
 r('liq.ge8.up','liquidity_yoy','流动性同比 ≥ 8% 且不低于上期','liquidity ≥ 8% y/y and not below the previous period',{recovery:0.5,overheat:0.3}),
 r('liq.ge8.down','liquidity_yoy','流动性同比 ≥ 8% 且低于上期','liquidity ≥ 8% y/y and below the previous period',{recovery:0.2,overheat:0.4,stagflation:0.2}),
 r('liq.lt8','liquidity_yoy','流动性同比 < 8%','liquidity < 8% y/y',{stagflation:0.3,recession:0.5}),
 r('risk.lt15','risk_index','风险指数 < 15','risk index < 15',{recovery:0.4,overheat:0.4}),
 r('risk.15to25','risk_index','15 ≤ 风险指数 < 25','15 ≤ risk index < 25',{recovery:0.3,overheat:0.3,stagflation:0.2,recession:0.2}),
 r('risk.ge25','risk_index','风险指数 ≥ 25','risk index ≥ 25',{stagflation:0.5,recession:0.5}),
]};

// ---------------------------------------------------------------- builders
const pad=(n:number)=>String(n).padStart(2,'0');
/** Last day of 'YYYY-MM' shifted by `k` months. */
function monthEndOf(firstMonth:string,k:number):string{
 const idx=Number(firstMonth.slice(0,4))*12+Number(firstMonth.slice(5,7))-1+k;
 const y=Math.floor(idx/12),m=idx%12+1;
 return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y,m,0)).getUTCDate())}`;
}
/** Observation builder: deterministic ids `obs:<series>:<period_end>:v<version>`; available_at default `${period_end}T12:00:00Z`. */
export function obs(seriesId:string,periodEnd:string,valueText:string,o:{version?:number;availableAt?:string;status?:ObservationRow['status']}={}):ObservationRow{
 const version=o.version??1;const availableAt=o.availableAt??`${periodEnd}T12:00:00Z`;
 return {observation_id:`obs:${seriesId}:${periodEnd}:v${version}`,series_id:seriesId,period_end:periodEnd,value_text:valueText,version,
  available_at:availableAt,availability_basis:'first_seen',ingested_at:availableAt,status:o.status??'ok',retrieval_id:null,derived_from:null,transform:null};
}
/** Monthly series helper: one month-end observation per entry starting at firstMonth ('YYYY-MM'); null = gap. */
export function monthly(seriesId:string,firstMonth:string,values:(string|null)[],o:{availableAt?:string}={}):ObservationRow[]{
 const out:ObservationRow[]=[];
 values.forEach((v,k)=>{if(v!==null)out.push(obs(seriesId,monthEndOf(firstMonth,k),v,{availableAt:o.availableAt}));});
 return out;
}
/** Daily helper: one observation per listed date. */
export function daily(seriesId:string,points:[string,string][]):ObservationRow[]{return points.map(([d,v])=>obs(seriesId,d,v));}
const countsOf=(region:Region):SnapshotRecord['catalog_counts']=>{
 const rows=FIXTURE_CATALOG.filter(d=>d.region===region);
 return {verified:rows.filter(d=>d.status==='active').length,missing:rows.filter(d=>d.status==='missing').length,restricted:rows.filter(d=>d.status==='restricted').length};
};
/** Snapshot builder: id `snap:<region>:<created_at>`, status active unless given. */
export function snap(region:Region,createdAt:string,observationIds:string[],o:{historyIds?:string[];status?:SnapshotRecord['status'];counts?:SnapshotRecord['catalog_counts']}={}):SnapshotRecord{
 return {snapshot_id:`snap:${region}:${createdAt}`,region,as_of:createdAt.slice(0,10),revision:1,methodology_version:'v1.0',catalog_version:FIXTURE_CATALOG_VERSION,
  observation_ids:[...observationIds],history_ids:[...(o.historyIds??[])],catalog_counts:o.counts??countsOf(region),status:o.status??'active',created_at:createdAt};
}

// ---------------------------------------------------------------- Fed target (FRED DFEDTAR / DFEDTARU / DFEDTARL)
// Sparse by design: each change date (value as published by FRED) plus the day before it (the previous value), which
// is enough for the event derivation to see every change and nothing else. DFEDTAR's last observation is 2008-12-15;
// DFEDTARU/L start 2008-12-16 (no "day before" for that first range observation).
const TARGET:[string,string][]=[['2007-09-17','5.25'],['2007-09-18','4.75'],['2007-10-30','4.75'],['2007-10-31','4.50'],['2007-12-10','4.50'],['2007-12-11','4.25'],
 ['2008-01-21','4.25'],['2008-01-22','3.50'],['2008-01-29','3.50'],['2008-01-30','3.00'],['2008-03-17','3.00'],['2008-03-18','2.25'],['2008-04-29','2.25'],['2008-04-30','2.00'],
 ['2008-10-07','2.00'],['2008-10-08','1.50'],['2008-10-28','1.50'],['2008-10-29','1.00'],['2008-12-15','1.00']];
/** [change date, upper, lower]; the day before each change (except the first) repeats the previous range. */
const RANGE_CHANGES:[string,string,string][]=[['2008-12-16','0.25','0.00'],['2015-12-17','0.50','0.25'],['2016-12-15','0.75','0.50'],['2017-03-16','1.00','0.75'],
 ['2017-06-15','1.25','1.00'],['2017-12-14','1.50','1.25'],['2018-03-22','1.75','1.50'],['2018-06-14','2.00','1.75'],['2018-09-27','2.25','2.00'],['2018-12-20','2.50','2.25'],
 ['2019-08-01','2.25','2.00'],['2019-09-19','2.00','1.75'],['2019-10-31','1.75','1.50'],['2020-03-04','1.25','1.00'],['2020-03-16','0.25','0.00'],['2022-03-17','0.50','0.25'],
 ['2022-05-05','1.00','0.75'],['2022-06-16','1.75','1.50'],['2022-07-28','2.50','2.25'],['2022-09-22','3.25','3.00'],['2022-11-03','4.00','3.75'],['2022-12-15','4.50','4.25'],
 ['2023-02-02','4.75','4.50'],['2023-03-23','5.00','4.75'],['2023-05-04','5.25','5.00'],['2023-07-27','5.50','5.25'],['2024-09-19','5.00','4.75'],['2024-11-08','4.75','4.50'],
 ['2024-12-19','4.50','4.25']];
const dayBefore=(d:string)=>new Date(Date.parse(`${d}T00:00:00Z`)-86400000).toISOString().slice(0,10);
/** Fed target fixture: DFEDTAR 2007-2008 single target incl. 2008-12-15 = 1.00, DFEDTARU/L from 2008-12-16 (0.25/0) and every
 *  later change through 2024-12-19 (values from FRED; effective dates as published). Ascending period_end per series. */
export function fedTargetFixture():ObservationRow[]{
 const upper:[string,string][]=[],lower:[string,string][]=[];
 RANGE_CHANGES.forEach(([d,u,l],i)=>{
  if(i>0){const [,pu,pl]=RANGE_CHANGES[i-1];upper.push([dayBefore(d),pu]);lower.push([dayBefore(d),pl]);}
  upper.push([d,u]);lower.push([d,l]);
 });
 return [...daily('US_FED_TARGET_D',TARGET),...daily('US_FED_TARGET_UPPER_D',upper),...daily('US_FED_TARGET_LOWER_D',lower)];
}
/** Defaults: FIXTURE_CATALOG, FIXTURE_CATALOG_VERSION, FIXTURE_RULES, no snapshots / observations. */
export function fixture(over:Partial<StrategyFixture>={}):StrategyFixture{
 return {catalog:FIXTURE_CATALOG,catalogVersion:FIXTURE_CATALOG_VERSION,rules:FIXTURE_RULES,snapshots:[],observations:[],...over};
}
```

- [ ] **Step 5: Implement the port**

Create `src/lib/macro/strategy/port.ts`:

```ts
// src/lib/macro/strategy/port.ts
// StrategyReadPort (spec §4.3): the only way the strategy module reads P1+P2 data. strategyPort() is the production
// port and returns null until WP-S6 wires P1+P2 (capability matrix §9.1: enabled + null port → 503). memoryStrategyPort
// serves the unit tests from a StrategyFixture; its derivePolicyEvents / timeliness reproduce P2 events.ts
// derivePolicyEvents and P1 freshness.ts releaseTimeliness (P1 plan Task 14 / Task 11) for tests only — production calls
// the P1/P2 functions directly at WP-S6.
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import type {EventInput,MacroSeriesDef,ObservationRow,PolicyEvent,Region,RulesView,SnapshotRecord,Timeliness} from './contract';
import type {StrategyFixture} from './testing/fixture';

export interface StrategyReadPort{
 activeSnapshot(region:Region):Promise<SnapshotRecord|null>;
 snapshot(snapshotId:string):Promise<SnapshotRecord|null>;
 /** Newest non-failed snapshot with created_at ≤ cutoff; ties on created_at → greatest snapshot_id. Throws Error('truncated') if paging cannot finish. */
 snapshotUpTo(region:Region,cutoff:string):Promise<SnapshotRecord|null>;
 /** ok rows only, input order, unknown ids dropped. */
 observationsByIds(ids:string[]):Promise<ObservationRow[]>;
 /** Latest period per series with available_at ≤ asOf, highest such version. */
 latestObservations(seriesIds:string[],opts:{asOf:string}):Promise<ObservationRow[]>;
 /** Highest version per period with available_at ≤ asOf, ascending period_end; throws Error('truncated') beyond maxRows. */
 seriesHistory(seriesId:string,opts:{from?:string;to?:string;asOf:string;maxRows:number}):Promise<ObservationRow[]>;
 catalog():readonly MacroSeriesDef[];
 catalogVersion():string;
 rules():RulesView;
 derivePolicyEvents(upper:readonly EventInput[],lower:readonly EventInput[]):PolicyEvent[];
 timeliness(def:MacroSeriesDef,latestPeriodEnd:string|null,today:string):Timeliness;
}

/** Production port. Returns null until WP-S6 wires P1+P2 (spec §9.1: strategy enabled + null port → 503). */
export function strategyPort():StrategyReadPort|null{return null;}

// ---------------------------------------------------------------- memory port (tests)
const ms=(t:string)=>{const v=Date.parse(t);if(!Number.isFinite(v))throw new Error(`invalid_timestamp:${t}`);return v;};
/** Exact a − b on decimal text (BigInt scaled, no float), canonical. */
function subtract(a:string,b:string):string{
 const parse=(x:string)=>{const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(canonicalDecimal(x));if(!m)throw new Error(`invalid_decimal:${x}`);return {neg:m[1]==='-',digits:m[2]+(m[3]??''),scale:(m[3]??'').length};};
 const pa=parse(a),pb=parse(b);const s=Math.max(pa.scale,pb.scale);
 const big=(p:{neg:boolean;digits:string;scale:number})=>{const n=BigInt(p.digits)*10n**BigInt(s-p.scale);return p.neg?-n:n;};
 const d=big(pa)-big(pb);const neg=d<0n;let digits=(neg?-d:d).toString();
 if(s>0){digits=digits.padStart(s+1,'0');digits=`${digits.slice(0,-s)}.${digits.slice(-s)}`;}
 return canonicalDecimal(`${neg?'-':''}${digits}`);
}
/** P2 toBp: exact decimal × 100 (percentage points → basis points). */
const toBp=(delta:string):string=>canonicalDecimal(`${canonicalDecimal(delta)}e2`);
function assertAscending(rows:readonly EventInput[],label:string){
 for(let i=1;i<rows.length;i++)if(rows[i].period_end<=rows[i-1].period_end)throw new Error(`events_unsorted:${label}:${rows[i].period_end}`);
}
/** P2 derivePolicyEvents semantics (macro-events/1): joint days where both bounds exist; a change of either bound → one
 *  event at the later day; change_bp from the upper bound unless only the lower bound moved. */
function memoryDerivePolicyEvents(upper:readonly EventInput[],lower:readonly EventInput[]):PolicyEvent[]{
 assertAscending(upper,'upper');assertAscending(lower,'lower');
 const lowerBy=new Map(lower.map(r=>[r.period_end,r]));
 const days=upper.filter(u=>lowerBy.has(u.period_end)).map(u=>({u,l:lowerBy.get(u.period_end)!}));
 const out:PolicyEvent[]=[];
 for(let i=1;i<days.length;i++){
  const p=days[i-1],c=days[i];
  const du=subtract(c.u.value_text,p.u.value_text),dl=subtract(c.l.value_text,p.l.value_text);
  if(du==='0'&&dl==='0')continue;
  out.push({kind:'policy_target_change',region:'US',effective_date:c.u.period_end,
   upper_from:canonicalDecimal(p.u.value_text),upper_to:canonicalDecimal(c.u.value_text),lower_from:canonicalDecimal(p.l.value_text),lower_to:canonicalDecimal(c.l.value_text),
   change_bp:toBp(du!=='0'?du:dl),source:'derived',
   evidence:[p.u.observation_id,c.u.observation_id,p.l.observation_id,c.l.observation_id],version:'macro-events/1'});
 }
 return out;
}
const DAY=86400000,GRACE_DAYS=3;
const ISO_DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Strict like P1 freshness.ts parseDate: shape, then a round trip so impossible dates (2026-02-31) throw invalid_date. */
const dateMs=(d:string)=>{
 if(!ISO_DATE.test(d))throw new Error(`invalid_date:${d}`);
 const t=Date.parse(`${d}T00:00:00Z`);
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==d)throw new Error(`invalid_date:${d}`);
 return t;
};
function nextPeriodEnd(period:MacroSeriesDef['period'],periodEnd:string):string{
 const t=dateMs(periodEnd);   // validates every period, not only 'day'
 if(period==='day')return new Date(t+DAY).toISOString().slice(0,10);
 const idx=Number(periodEnd.slice(0,4))*12+Number(periodEnd.slice(5,7))-1+(period==='month'?1:3);
 return new Date(Date.UTC(Math.floor(idx/12),idx%12+1,0)).toISOString().slice(0,10);
}
/** P1 releaseTimeliness: next period end + releaseLagDays + 3 days grace < today → late. */
function memoryTimeliness(def:MacroSeriesDef,latestPeriodEnd:string|null,today:string):Timeliness{
 if(def.nativeFrequency==='event'||def.releaseLagDays===undefined)return 'n/a';
 if(latestPeriodEnd===null)return 'missing';
 return dateMs(today)>dateMs(nextPeriodEnd(def.period,latestPeriodEnd))+(def.releaseLagDays+GRACE_DAYS)*DAY?'late':'current';
}
const newest=(a:SnapshotRecord,b:SnapshotRecord)=>{const d=ms(b.created_at)-ms(a.created_at);return d!==0?d:a.snapshot_id<b.snapshot_id?1:a.snapshot_id>b.snapshot_id?-1:0;};
/** Visible ok versions of one series at asOf, highest version per period_end, ascending period_end. */
function visible(f:StrategyFixture,seriesId:string,asOf:string):ObservationRow[]{
 const cut=ms(asOf);const best=new Map<string,ObservationRow>();
 for(const o of f.observations){
  if(o.series_id!==seriesId||o.status!=='ok'||ms(o.available_at)>cut)continue;
  const cur=best.get(o.period_end);if(!cur||o.version>cur.version)best.set(o.period_end,o);
 }
 return [...best.values()].sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0);
}
export function memoryStrategyPort(f:StrategyFixture):StrategyReadPort{
 const byId=new Map(f.observations.map(o=>[o.observation_id,o]));
 return {
  async activeSnapshot(region){return f.snapshots.filter(s=>s.region===region&&s.status==='active').sort(newest)[0]??null;},
  async snapshot(id){return f.snapshots.find(s=>s.snapshot_id===id)??null;},
  async snapshotUpTo(region,cutoff){const c=ms(cutoff);return f.snapshots.filter(s=>s.region===region&&s.status!=='failed'&&ms(s.created_at)<=c).sort(newest)[0]??null;},
  async observationsByIds(ids){return ids.map(id=>byId.get(id)).filter((o):o is ObservationRow=>!!o&&o.status==='ok');},
  async latestObservations(seriesIds,{asOf}){return seriesIds.flatMap(id=>{const v=visible(f,id,asOf);return v.length?[v[v.length-1]]:[];});},
  async seriesHistory(seriesId,{from,to,asOf,maxRows}){
   const rows=visible(f,seriesId,asOf).filter(o=>(from===undefined||o.period_end>=from)&&(to===undefined||o.period_end<=to));
   if(rows.length>maxRows)throw new Error('truncated');
   return rows;
  },
  catalog:()=>f.catalog,
  catalogVersion:()=>f.catalogVersion,
  rules:()=>f.rules,
  derivePolicyEvents:memoryDerivePolicyEvents,
  timeliness:memoryTimeliness,
 };
}
```

- [ ] **Step 6: Implement the flags**

Create `src/lib/macro/strategy/flags.ts`:

```ts
// src/lib/macro/strategy/flags.ts
// Feature switches and the capability matrix (spec §9.1). Order for every strategy route: session (401, the route's
// job) → MACRO_STRATEGY_ENABLED (404 strategy_disabled) → [explanation POST idempotent replay] → foundation (port
// null → 503 macro_foundation_unavailable) → subject / params → judgment layer. Composite routes (transmission,
// review detail) stay 200 and carry judgment_status; only the pure judgment route (deviations) answers 404
// judgments_disabled, or 503 judgments_unavailable when F4 cannot be read (decided by the caller at read time).
import type {JudgmentStatus} from './contract';
import type {StrategyReadPort} from './port';

export type FlagEnv=Readonly<Record<string,string|undefined>>;
/** MACRO_STRATEGY_ENABLED === '1' (unset = off). */
export const strategyEnabled=(env:FlagEnv=process.env):boolean=>env.MACRO_STRATEGY_ENABLED==='1';
/** MACRO_JUDGMENTS_ENABLED === '1' (P1 flag, unset = off). */
export const judgmentsEnabled=(env:FlagEnv=process.env):boolean=>env.MACRO_JUDGMENTS_ENABLED==='1';

export type GateFailure={ok:false;status:404;code:'strategy_disabled'}|{ok:false;status:503;code:'macro_foundation_unavailable'};
export type StrategyGate=GateFailure|{ok:true;port:StrategyReadPort;judgments:boolean};
/** Feature switch first, then foundation. Never inspects the session (routes do that before calling). */
export function strategyGate(env:FlagEnv,port:StrategyReadPort|null):StrategyGate{
 if(!strategyEnabled(env))return {ok:false,status:404,code:'strategy_disabled'};
 if(port===null)return {ok:false,status:503,code:'macro_foundation_unavailable'};
 return {ok:true,port,judgments:judgmentsEnabled(env)};
}
/** Pure judgment routes (deviations) after strategyGate passed: judgment layer off → 404 judgments_disabled. */
export function judgmentGate(env:FlagEnv):{ok:true}|{ok:false;status:404;code:'judgments_disabled'}{
 return judgmentsEnabled(env)?{ok:true}:{ok:false,status:404,code:'judgments_disabled'};
}
/** judgment_status of a composite response: off → disabled; on and F4 read failed → unavailable; else ok. */
export function judgmentStatus(env:FlagEnv,f4Read:'ok'|'failed'|'not_attempted'):JudgmentStatus{
 if(!judgmentsEnabled(env))return 'disabled';
 return f4Read==='ok'?'ok':'unavailable';
}
```

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `npm test -- src/lib/macro/strategy/testing/fixture.test.ts src/lib/macro/strategy/port.test.ts src/lib/macro/strategy/flags.test.ts`
Expected: PASS — `Tests  26 passed (26)` (fixture 10, port 13, flags 3).

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/macro/strategy/contract.ts src/lib/macro/strategy/flags.ts src/lib/macro/strategy/port.ts src/lib/macro/strategy/testing/fixture.ts src/lib/macro/strategy/flags.test.ts src/lib/macro/strategy/port.test.ts src/lib/macro/strategy/testing/fixture.test.ts
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): shared contract, flags, StrategyReadPort and test fixture

contract.ts mirrors the P1+P2 types verbatim from the plan; flags.ts encodes the
§9.1 capability matrix; strategyPort() stays null until WP-S6; memoryStrategyPort
reproduces P2 derivePolicyEvents and P1 releaseTimeliness for tests; the fixture
mirrors the P1 catalog (+ US_FED_TARGET_D), the P1 v1.0 rules table and FRED
Fed target data (sparse by design).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: StrategyDb (Supabase + memory) and the shared contract cases

**Files:**
- Create: `src/lib/macro/strategy/hash.ts`
- Create: `src/lib/macro/strategy/db.ts`
- Create: `src/lib/macro/strategy/db-contract.ts`
- Test: `src/lib/macro/strategy/hash.test.ts`, `src/lib/macro/strategy/db.test.ts`
- Modify: `src/lib/macro/strategy/strategy.integration.test.ts`（追加 import 与 pg 契约段；不改 Task 1 的用例）

Notes for the implementer:
- `StrategyDb`、`StrategyDbError`、`supabaseStrategyDb`、`memoryStrategyDb` 的签名逐字照计划"`StrategyDb`（Task 3，`db.ts`）"一节。为了让同一份映射代码既跑 Supabase 又跑 node-postgres，`db.ts` 另导出 `StrategyTransport`（`rpc` 以 service_role 执行；`select` 按 `'anon'|'admin'|'session'` 角色执行）与 `strategyDbOver(transport)`；`supabaseStrategyDb(c) = strategyDbOver(supabaseTransport(c))`。集成测试里的 `pgTransport` 只在测试文件中。
- 哈希：`manifest_hash = sha256Hex(canonicalJson(body))`，二者由本任务新建的 `src/lib/macro/strategy/hash.ts` 提供（键按 UTF-16 排序、丢弃 undefined、数字须有限，非有限数抛 `canonical_json_unsupported:*`）。Task 4 的 `manifest.ts` import 并再导出这两个函数；模块内其他文件（`db.ts`、`db-contract.ts`、`review.ts`、`explain-request.ts`）一律从 `./hash` 或 `./manifest` 取，不用 `src/lib/evals/canonical-json.ts`（同名但错误信息不同，F6 所有）。
- 新 RPC 不登记进 `Database['public']['Functions']`：按 `src/lib/facts/db.ts` 的 `NarrowClient` 办法把客户端收窄为 `{rpc, from}`。
- 时间戳一律规范为 `toISOString()`（PostgREST 给 `+00:00`，pg 给 `Date`）；`generation` 用 `Number()`（pg 的 bigint 是字符串）。投影的 `prompt_version` / `validator_version` 在认领后、完成前为 SQL null，映射为 `''`（契约类型是 `string`）。
- `memoryStrategyDb` 逐条复刻 SQL 规则（同一份契约用例约束）；`_userId(id)` 设定 `explanationsOf` 的 RLS 身份，未设 → 空列表（等同 `auth.uid()` 为 null）；`_run(id)` 只给测试看运行行（`state`、`raw_output`、`finalize_payload`、`finalized`、`late_output`）。
- 计划审计回写：`reviewResult(id)`（anon 读 `macro_review_results`，非 uuid → null 不查询）、`recordCompletion`（`macro_record_completion`）、`expireExplanations(userId)`（`macro_expire_explanations`，非 uuid → 0 不调用）；`markFinalized` 需要已登记的结算载荷（任何状态）。
- 第二轮回写（R2-1 / R2-2）：`finishExplanation` 多传 `finalizePayload`（`p_finalize_payload`；行上无载荷时写入，已有不覆盖）；`runDetail(id)`（admin 读 `macro_explanation_runs` 一行，非 uuid → null）与 `recoverableRuns(userId, limit)`（admin 读该用户 `running` 行，按 `claimed_at` 升序最多扫 50 行，只留 `raw_output` 为 JSON 对象的，即已登记完成）；"已登记完成"的判定 `hasRecordedCompletion(raw)` 与 SQL 的 `jsonb_typeof(raw_output) = 'object'` 一致，内存实现的认领放弃与过期同样跳过这些行。
- Task 1 审计回写：SQL 现会抛 `cutoff_mismatch`（`macro_publish_review` 的 `p_cutoff` 与清单存储的 cutoff 不同；`publishReview` 必须传清单自己的 cutoff）与 `invalid_argument`（期望代数为 null），`StrategyDbError.code` 联合类型与 `toStrategyDbError` 随之增加这两个码；`record_completion` 先查状态（终态行即使值相同也 `invalid_transition`）；`finish` 对已登记完成的 running 行只接受同一 `raw_output`；`finalize_payload` 缺 status / 非对象 → `rpc_failed`（CHECK）。内存实现逐条复刻，契约用例各有对应（3 个新用例）。
- 契约用例的月份：内存用 5000 年起、pg 用 6000–7999 年中随机一年起，互不冲突，也不与 Task 1 用例（3000–4999）冲突。

- [ ] **Step 1: Write the shared contract cases and the failing unit tests**

Create `src/lib/macro/strategy/hash.test.ts`:

```ts
// src/lib/macro/strategy/hash.test.ts
// hash.ts (spec §4.4 N3, §4.5): the canonical JSON and SHA-256 behind every manifest_hash and explanation payload hash.
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';

describe('canonicalJson',()=>{
 it('sorts object keys by UTF-16 code unit, drops undefined members, keeps array order',()=>{
  expect(canonicalJson({b:1,a:[2,{d:undefined,c:'x'}],B:null})).toBe('{"B":null,"a":[2,{"c":"x"}],"b":1}');
  expect(canonicalJson([3,1,2])).toBe('[3,1,2]');
  expect(canonicalJson('é"')).toBe('"é\\""');
 });
 it('rejects non-finite numbers and unsupported values',()=>{
  expect(()=>canonicalJson({a:Number.NaN})).toThrow(/canonical_json_unsupported/);
  expect(()=>canonicalJson({a:Number.POSITIVE_INFINITY})).toThrow(/canonical_json_unsupported/);
  expect(()=>canonicalJson({a:()=>1})).toThrow('canonical_json_unsupported:function');
 });
 it('rejects sparse arrays, so a stored body (holes become null) always reproduces its hash',()=>{
  expect(()=>canonicalJson(Array(1))).toThrow('canonical_json_unsupported:sparse_array');
  expect(()=>canonicalJson({a:[1,,3]})).toThrow('canonical_json_unsupported:sparse_array');
  expect(()=>canonicalJson([undefined])).toThrow('canonical_json_unsupported:undefined');   // an undefined element would store as null
  const body={a:[1,null,3]};
  expect(sha256Hex(canonicalJson(JSON.parse(JSON.stringify(body))))).toBe(sha256Hex(canonicalJson(body)));
 });
});
describe('sha256Hex',()=>{
 it('matches the FIPS 180-4 test vector',()=>{
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Hex(canonicalJson({b:2,a:1}))).toBe(sha256Hex('{"a":1,"b":2}'));
 });
});
```

Create `src/lib/macro/strategy/db-contract.ts`:

```ts
// src/lib/macro/strategy/db-contract.ts
// Shared StrategyDb contract (spec §4.4, plan 2026-11-07 Task 3): the same cases run against memoryStrategyDb
// (db.test.ts) and strategyDbOver(pg transport) on real PostgreSQL (strategy.integration.test.ts), so the memory rules
// the unit tests rely on are the SQL functions' rules. Not a test file: it registers describe/it only when called.
// Months are unique per call (`monthBase` + counter) so cases never share a review pointer on a shared database.
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';
import type {ManifestKind,RenderedExplanation,ReviewFacts,StrategyManifest} from './contract';
import {StrategyDbError} from './db';
import type {StrategyDb} from './db';

export interface StrategyDbHarness{
 db:StrategyDb;
 /** Sets the identity the 'session' reads run under (RLS user). */
 asUser(userId:string):void;
 /** Makes the claim of `explanationId` look `minutes` older (memory: advances the clock; pg: moves claimed_at back). */
 ageClaim(explanationId:string,minutes:number):Promise<void>;
 close?():Promise<void>;
}
/** Minimal valid manifest body of `kind`; `salt` makes the identity unique. */
export function testManifest(kind:ManifestKind,o:{salt?:string;cutoff?:string}={}):StrategyManifest{
 return {kind,params:{salt:o.salt??randomUUID()},cutoff:o.cutoff??'2026-11-03T00:00:00.000Z',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],
  catalog_version:'macro-catalog/fixture-1',method_version:kind==='review'?'macro-review/1':'macro-facts/1',code_version:'test-code'};
}
export function testFacts(month:string,cutoff='2026-11-03T00:00:00.000Z'):ReviewFacts{
 return {region:'US',month,cutoff,baseline_cutoff:'2026-10-03T00:00:00.000Z',snapshot_id:null,baseline_snapshot_id:null,baseline_missing:true,
  releases:[],revisions:[],timeliness:[],policy_events:[],episode_changes:[],asset_moves:[],coverage:[]};
}
const RENDERED:RenderedExplanation={facts:[{fact_id:'f1',text:'事实句'}],hypotheses:[{text:'假设句',fact_ids:['f1']}],counterpoints:[]};
/** A finalizeUsageRun body as llm-deps.ts builds it (stored verbatim on the run row). */
const PAYLOAD={status:'completed',provider:'test-provider',model:'test-model',inputTokens:3,cacheHitInputTokens:0,cacheMissInputTokens:3,outputTokens:2,costMicrormb:5,pricingVersion:'p1',usdCnyMicros:7_100_000,usageEstimated:false,byo:false};
/** StrategyDbError code of a rejection, 'resolved' when it did not reject. */
const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof StrategyDbError?e.code:`not_strategy_db_error:${String(e)}`);

export function strategyDbContract(label:string,setup:()=>Promise<StrategyDbHarness>,monthBase:number):void{
 describe(label,()=>{
  let h:StrategyDbHarness;let db:StrategyDb;let seq=0;
  const month=()=>{const n=monthBase*12+seq++;return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;};
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const review=async(m:string,o:{cutoff?:string;expected:number;salt?:string})=>{
   const stored=await db.putManifest(testManifest('review',{salt:o.salt,cutoff:o.cutoff}));
   return {stored,out:await db.publishReview({region:'US',month:m,expectedGeneration:o.expected,cutoff:o.cutoff??'2026-11-03T00:00:00.000Z',status:'ok',manifestId:stored.manifest_id,
    manifestHash:stored.manifest_hash,facts:testFacts(m,o.cutoff),methodVersion:'macro-review/1',codeVersion:'test-code'})};
  };
  const claim=async(o:{user?:string;request?:string;payload?:string;manifestId?:string}={})=>{
   const manifestId=o.manifestId??(await db.putManifest(testManifest('explain_facts'))).manifest_id;
   const args={userId:o.user??randomUUID(),requestId:o.request??randomUUID(),payloadHash:o.payload??'a'.repeat(64),subjectKind:'review' as const,subjectId:'subject-1',locale:'zh' as const,manifestId};
   return {args,out:await db.claimExplanation(args)};
  };
  const finish=(id:string,state:'accepted'|'rejected'|'failed',raw:unknown,o:{failureCodes?:string[];finalizePayload?:Record<string,unknown>}={})=>db.finishExplanation({explanationId:id,state,provider:'test-provider',model:'test-model',
   promptVersion:'macro-explain-prompt/1',validatorVersion:'macro-explain-validator/1',rawOutput:raw,validation:{ok:state==='accepted'},rendered:state==='accepted'?RENDERED:null,
   failureCodes:o.failureCodes??(state==='accepted'?[]:['numeral']),accounting:{tokens:10},finalizePayload:o.finalizePayload??null});

  it('putManifest: identity is sha256 of the canonical body; idempotent; any field change is a new manifest; anon read; unknown → null',async()=>{
   const body=testManifest('transmission');
   const a=await db.putManifest(body);
   expect(a.manifest_hash).toBe(sha256Hex(canonicalJson(body)));
   expect(a.body).toEqual(body);
   expect(sha256Hex(canonicalJson(a.body))).toBe(a.manifest_hash);                  // storage round-trip: the stored body reproduces its hash
   expect(await code(db.putManifest({...body,params:{salt:Array(1) as unknown as string}}))).not.toBe('resolved');   // a sparse array would store as [null] under another hash
   const reordered=Object.fromEntries(Object.entries(body).reverse()) as unknown as typeof body;   // same content, other key order
   expect((await db.putManifest(reordered)).manifest_id).toBe(a.manifest_id);
   const b=await db.putManifest({...body,cutoff:'2026-11-02T00:00:00.000Z'});
   expect(b.manifest_id).not.toBe(a.manifest_id);
   expect(await db.manifest(a.manifest_id)).toEqual(a);
   expect(await db.manifest(randomUUID())).toBeNull();
   expect(await db.manifest('not-a-uuid')).toBeNull();
  });

  it('publishReview: absent pointer = generation 0, replayed before stale, A→B→A advances to the original A result, older cutoff is stale',async()=>{
   const m=month();
   expect(await db.reviewCurrent('US',m)).toBeNull();
   const {stored:mA,out:a1}=await review(m,{expected:1,salt:'A'});
   expect(a1).toMatchObject({outcome:'stale',generation:0});                       // absent pointer is generation 0
   expect(await db.reviewCurrent('US',m)).toBeNull();
   const {out:a2}=await review(m,{expected:0,salt:'A'});
   expect(a2).toEqual({result_id:a1.result_id,generation:1,outcome:'advanced'});   // the stale call already stored the immutable result
   const cur=await db.reviewCurrent('US',m);
   expect(cur).toMatchObject({generation:1,cutoff:'2026-11-03T00:00:00.000Z',result:{result_id:a1.result_id,region:'US',month:m,status:'ok',manifest_id:mA.manifest_id,manifest_hash:mA.manifest_hash}});
   expect(cur!.result.facts).toEqual(testFacts(m));
   expect(await review(m,{expected:0,salt:'A'})).toMatchObject({out:{result_id:a1.result_id,generation:1,outcome:'replayed'}});   // replayed wins over a stale expectation
   const {out:b0}=await review(m,{expected:0,salt:'B'});
   expect(b0).toMatchObject({outcome:'stale',generation:1});
   const {out:b1}=await review(m,{expected:1,salt:'B'});
   expect(b1).toMatchObject({outcome:'advanced',generation:2});
   expect(b1.result_id).not.toBe(a1.result_id);
   const {out:a3}=await review(m,{expected:2,salt:'A'});
   expect(a3).toEqual({result_id:a1.result_id,generation:3,outcome:'advanced'});   // A→B→A: pointer moves back to the same immutable A row
   const {out:old}=await review(m,{expected:3,salt:'C',cutoff:'2026-11-02T00:00:00.000Z'});
   expect(old).toMatchObject({outcome:'stale',generation:3});
   expect((await db.reviewCurrent('US',m))!.result.result_id).toBe(a1.result_id);
  });

  it('publishReview: unknown manifest, wrong hash or a non-review manifest → not_found',async()=>{
   const m=month();const r=await db.putManifest(testManifest('review'));const t=await db.putManifest(testManifest('transmission'));
   const base={region:'US' as const,month:m,expectedGeneration:0,cutoff:'2026-11-03T00:00:00.000Z',status:'ok' as const,facts:testFacts(m),methodVersion:'macro-review/1',codeVersion:'test-code'};
   expect(await code(db.publishReview({...base,manifestId:randomUUID(),manifestHash:r.manifest_hash}))).toBe('not_found');
   expect(await code(db.publishReview({...base,manifestId:r.manifest_id,manifestHash:'f'.repeat(64)}))).toBe('not_found');
   expect(await code(db.publishReview({...base,manifestId:t.manifest_id,manifestHash:t.manifest_hash}))).toBe('not_found');
   expect(await db.reviewCurrent('US',m)).toBeNull();
  });

  it('publishReview: the cutoff must equal the manifest cutoff (cutoff_mismatch) and the expected generation must be a number (invalid_argument); nothing is stored',async()=>{
   const m=month();const r=await db.putManifest(testManifest('review',{cutoff:'2026-11-03T00:00:00.000Z'}));
   const base={region:'US' as const,month:m,expectedGeneration:0,cutoff:'2026-11-03T00:00:00.000Z',status:'ok' as const,manifestId:r.manifest_id,manifestHash:r.manifest_hash,facts:testFacts(m),methodVersion:'macro-review/1',codeVersion:'test-code'};
   expect(await code(db.publishReview({...base,cutoff:'2026-11-04T00:00:00.000Z'}))).toBe('cutoff_mismatch');   // later than the frozen evidence
   expect(await code(db.publishReview({...base,cutoff:'2026-11-02T00:00:00.000Z'}))).toBe('cutoff_mismatch');   // earlier too
   expect(await code(db.publishReview({...base,expectedGeneration:null as unknown as number}))).toBe('invalid_argument');
   expect(await code(db.publishReview({...base,expectedGeneration:undefined as unknown as number}))).toBe('invalid_argument');
   expect(await db.reviewCurrent('US',m)).toBeNull();
   expect(await db.reviewIndex('US',1000).then(x=>x.filter(i=>i.month===m))).toEqual([]);
   expect(await db.publishReview(base)).toMatchObject({outcome:'advanced',generation:1});   // the matching cutoff still publishes (same instant, other spelling)
   expect(await db.publishReview({...base,expectedGeneration:1,cutoff:'2026-11-03T08:00:00+08:00'})).toMatchObject({outcome:'replayed',generation:1});
  });

  it('reviewIndex: newest month first, limited, with status and generation; recordReviewAttempt accepts failed',async()=>{
   const m1=month(),m2=month();
   await review(m1,{expected:0});await review(m2,{expected:0});
   const idx=await db.reviewIndex('US',1000);
   const mine=idx.filter(x=>x.month===m1||x.month===m2);
   expect(mine.map(x=>[x.month,x.status,x.generation])).toEqual([[m2,'ok',1],[m1,'ok',1]]);
   expect(idx.map(x=>x.month)).toEqual([...idx.map(x=>x.month)].sort().reverse());
   expect(await db.reviewIndex('US',1)).toHaveLength(1);
   await expect(db.recordReviewAttempt('US',m1,'failed',{stage:'manifest',message:'boom'})).resolves.toBeUndefined();
  });

  it('claimExplanation: claimed once with an RPC-made id and audit key; repeat → existing; other payload → payload_conflict; bad manifest → not_found',async()=>{
   const {args,out}=await claim();
   expect(out.outcome).toBe('claimed');
   expect(out.usage_audit_key).toBe(`${out.explanation_id}`);
   expect(out.projection).toMatchObject({explanation_id:out.explanation_id,subject_kind:'review',subject_id:'subject-1',locale:'zh',manifest_id:args.manifestId,state:'running',rendered:null,failure_codes:[],finished_at:null});
   expect(await db.runOf(args.userId,args.requestId)).toEqual({explanation_id:out.explanation_id,payload_hash:args.payloadHash,state:'running'});
   expect(await db.runOf(args.userId,randomUUID())).toBeNull();
   const again=await db.claimExplanation(args);
   expect(again).toMatchObject({outcome:'existing',explanation_id:out.explanation_id,usage_audit_key:out.usage_audit_key});
   expect(await code(db.claimExplanation({...args,payloadHash:'b'.repeat(64)}))).toBe('payload_conflict');
   const review=await db.putManifest(testManifest('review'));
   expect(await code(db.claimExplanation({...args,requestId:randomUUID(),manifestId:review.manifest_id}))).toBe('not_found');
   expect(await code(db.claimExplanation({...args,requestId:randomUUID(),manifestId:randomUUID()}))).toBe('not_found');
  });

  it('claimExplanation: a running claim older than five minutes becomes abandoned (projection failed); four minutes is still running',async()=>{
   const young=await claim();
   await h.ageClaim(young.out.explanation_id,4);
   expect((await db.claimExplanation(young.args)).projection.state).toBe('running');
   const old=await claim();
   await h.ageClaim(old.out.explanation_id,6);
   const again=await db.claimExplanation(old.args);
   expect(again).toMatchObject({outcome:'existing',explanation_id:old.out.explanation_id,projection:{state:'failed',failure_codes:['abandoned']}});
   expect(again.projection.finished_at).not.toBeNull();
   expect((await db.runOf(old.args.userId,old.args.requestId))!.state).toBe('abandoned');
   await db.recordCompletion({explanationId:old.out.explanation_id,rawOutput:{points:[]},finalizePayload:PAYLOAD});   // late completion: run row only
   const late=await finish(old.out.explanation_id,'accepted',{points:[]});
   expect(late).toMatchObject({state:'failed',failure_codes:['abandoned'],rendered:null});
   expect((await db.runOf(old.args.userId,old.args.requestId))!.state).toBe('abandoned');
   await expect(db.markFinalized(old.out.explanation_id)).resolves.toBeUndefined();   // abandoned runs with late accounting are settled too
  });

  it('finishExplanation: running → accepted; same state and raw output is idempotent; other raw or state → invalid_transition; unknown → not_found',async()=>{
   const {out}=await claim();
   const p=await finish(out.explanation_id,'accepted',{points:[1]});
   expect(p).toMatchObject({state:'accepted',rendered:RENDERED,failure_codes:[],provider:'test-provider',model:'test-model',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1'});
   expect(p.finished_at).not.toBeNull();
   expect(await finish(out.explanation_id,'accepted',{points:[1]})).toEqual(p);
   expect(await code(finish(out.explanation_id,'accepted',{points:[2]}))).toBe('invalid_transition');
   expect(await code(finish(out.explanation_id,'rejected',{points:[1]}))).toBe('invalid_transition');
   expect(await code(finish(randomUUID(),'failed',null))).toBe('not_found');
  });

  it('finishExplanation: a running row with a recorded completion only accepts the recorded raw output (null included); the record stays untouched',async()=>{
   const a=await claim();
   await db.recordCompletion({explanationId:a.out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD});
   expect(await code(finish(a.out.explanation_id,'failed',{content:'other'}))).toBe('invalid_transition');
   expect(await code(finish(a.out.explanation_id,'failed',null))).toBe('invalid_transition');
   expect(await db.runDetail(a.out.explanation_id)).toMatchObject({state:'running',raw_output:{content:'x'},finalize_payload:PAYLOAD});
   expect(await finish(a.out.explanation_id,'accepted',{content:'x'})).toMatchObject({state:'accepted'});
   const b=await claim();   // provider threw: recorded raw output is null
   await db.recordCompletion({explanationId:b.out.explanation_id,rawOutput:null,finalizePayload:{...PAYLOAD,status:'failed'}});
   expect(await code(finish(b.out.explanation_id,'failed',{content:'late'}))).toBe('invalid_transition');
   expect(await finish(b.out.explanation_id,'failed',null,{failureCodes:['provider_error']})).toMatchObject({state:'failed',failure_codes:['provider_error']});
   const c=await claim();   // without a recorded completion the finish supplies the output
   expect(await finish(c.out.explanation_id,'rejected',{content:'z'})).toMatchObject({state:'rejected'});
  });

  it('finishExplanation: rejected and failed keep failure codes and no rendered body',async()=>{
   const r=await claim();
   expect(await finish(r.out.explanation_id,'rejected','raw text 3%',{failureCodes:['numeral','forbidden_term']})).toMatchObject({state:'rejected',rendered:null,failure_codes:['numeral','forbidden_term']});
   const f=await claim();
   expect(await finish(f.out.explanation_id,'failed',null,{failureCodes:['usage_audit_unavailable']})).toMatchObject({state:'failed',rendered:null,failure_codes:['usage_audit_unavailable']});
   expect((await db.runOf(f.args.userId,f.args.requestId))!.state).toBe('failed');
  });

   it('recordCompletion: running or abandoned; same values → no-op; another payload or output, or a final row without one → invalid_transition',async()=>{
   const {out}=await claim();
   await expect(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD})).resolves.toBeUndefined();
   await expect(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD})).resolves.toBeUndefined();
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'y'},finalizePayload:PAYLOAD}))).toBe('invalid_transition');
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:{...PAYLOAD,status:'failed'}}))).toBe('invalid_transition');
   expect(await finish(out.explanation_id,'accepted',{content:'x'})).toMatchObject({state:'accepted'});
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD}))).toBe('invalid_transition');   // a terminal row rejects even identical values
   const done=await claim();await finish(done.out.explanation_id,'failed',null);
   expect(await code(db.recordCompletion({explanationId:done.out.explanation_id,rawOutput:null,finalizePayload:PAYLOAD}))).toBe('invalid_transition');
   expect(await code(db.recordCompletion({explanationId:randomUUID(),rawOutput:null,finalizePayload:PAYLOAD}))).toBe('not_found');
  });

  it('recordCompletion: a missing, non-object or status-less finalize payload is refused and nothing is recorded',async()=>{
   const {out}=await claim();
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:null as unknown as Record<string,unknown>}))).toBe('invalid_transition');
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:{provider:'p'}}))).toBe('rpc_failed');          // no status
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:{status:'unknown'}}))).toBe('rpc_failed');
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:[{status:'completed'}] as unknown as Record<string,unknown>}))).toBe('rpc_failed');
   expect(await db.runDetail(out.explanation_id)).toMatchObject({state:'running',raw_output:null,finalize_payload:null});
  });

  it('markFinalized: needs a recorded finalize payload, then any state (running after a failed finish, final); idempotent; unknown → not_found',async()=>{
   const {out}=await claim();
   expect(await code(db.markFinalized(out.explanation_id))).toBe('invalid_transition');
   await finish(out.explanation_id,'failed',null);
   expect(await code(db.markFinalized(out.explanation_id))).toBe('invalid_transition');   // final, nothing recorded
   const r=await claim();
   await db.recordCompletion({explanationId:r.out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD});
   await expect(db.markFinalized(r.out.explanation_id)).resolves.toBeUndefined();          // still running: finish failed, payload settled
   await finish(r.out.explanation_id,'accepted',{content:'x'});
   await expect(db.markFinalized(r.out.explanation_id)).resolves.toBeUndefined();
   expect(await code(db.markFinalized(randomUUID()))).toBe('not_found');
  });

  it('finishExplanation stores the finalize payload when none was recorded; a recorded payload is never overwritten',async()=>{
   const a=await claim();
   await finish(a.out.explanation_id,'accepted',{content:'x'},{finalizePayload:PAYLOAD});   // recordCompletion failed during the request
   expect(await db.runDetail(a.out.explanation_id)).toMatchObject({state:'accepted',finalize_payload:PAYLOAD,finalized:false});
   await expect(db.markFinalized(a.out.explanation_id)).resolves.toBeUndefined();
   expect((await db.runDetail(a.out.explanation_id))!.finalized).toBe(true);
   const b=await claim();
   await db.recordCompletion({explanationId:b.out.explanation_id,rawOutput:{content:'y'},finalizePayload:PAYLOAD});
   await finish(b.out.explanation_id,'accepted',{content:'y'},{finalizePayload:{...PAYLOAD,pricingVersion:'p2'}});
   expect((await db.runDetail(b.out.explanation_id))!.finalize_payload).toEqual(PAYLOAD);
  });

  it('recoverableRuns scans only the oldest 50 running rows before it looks for recorded completions',async()=>{
   const user=randomUUID();
   const manifestId=(await db.putManifest(testManifest('explain_facts'))).manifest_id;
   for(let i=0;i<50;i++){const c=await claim({user,manifestId});await h.ageClaim(c.out.explanation_id,0);}   // 50 older rows without a completion
   const late=await claim({user,manifestId});
   await db.recordCompletion({explanationId:late.out.explanation_id,rawOutput:{content:'late'},finalizePayload:PAYLOAD});
   expect(await db.recoverableRuns(user,10)).toEqual([]);                           // the 51st running row is beyond the scan cap
  });

  it('a running row with a recorded raw output is never abandoned; runDetail and recoverableRuns expose it for recovery',async()=>{
   const user=randomUUID();
   const rec=await claim({user});const bare=await claim({user});const done=await claim({user});
   await db.recordCompletion({explanationId:rec.out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD});
   await db.recordCompletion({explanationId:done.out.explanation_id,rawOutput:{content:'z'},finalizePayload:PAYLOAD});
   await finish(done.out.explanation_id,'accepted',{content:'z'});
   await h.ageClaim(rec.out.explanation_id,6);await h.ageClaim(bare.out.explanation_id,6);
   expect((await db.claimExplanation(rec.args)).projection.state).toBe('running');
   expect(await db.expireExplanations(user)).toBe(1);                              // only the row without a completion
   expect((await db.runOf(user,bare.args.requestId))!.state).toBe('abandoned');
   expect(await db.recoverableRuns(user,3)).toEqual([rec.out.explanation_id]);
   expect(await db.recoverableRuns(randomUUID(),3)).toEqual([]);
   expect(await db.runDetail(rec.out.explanation_id)).toEqual({explanation_id:rec.out.explanation_id,user_id:user,state:'running',locale:'zh',manifest_id:rec.args.manifestId,
    usage_audit_key:rec.out.usage_audit_key,raw_output:{content:'x'},finalize_payload:PAYLOAD,finalized:false});
   expect(await db.runDetail(randomUUID())).toBeNull();
   expect(await db.runDetail('not-a-uuid')).toBeNull();
  });

  it('expireExplanations: only the user\'s running claims older than five minutes → abandoned, projection failed {abandoned}',async()=>{
   const user=randomUUID();
   const old=await claim({user});const other=await claim();
   await h.ageClaim(old.out.explanation_id,6);await h.ageClaim(other.out.explanation_id,6);
   const young=await claim({user});                                             // claimed after the clock moved: not stale
   expect(await db.expireExplanations(user)).toBe(1);
   expect((await db.runOf(user,old.args.requestId))!.state).toBe('abandoned');
   expect((await db.runOf(user,young.args.requestId))!.state).toBe('running');
   expect((await db.runOf(other.args.userId,other.args.requestId))!.state).toBe('running');
   h.asUser(user);
   const mine=await db.explanationsOf('session','review','subject-1',20);
   expect(mine.find(p=>p.explanation_id===old.out.explanation_id)).toMatchObject({state:'failed',failure_codes:['abandoned']});
   expect(await db.expireExplanations(user)).toBe(0);
   expect(await db.expireExplanations('not-a-uuid')).toBe(0);
  });

  it('explanationsOf: the session user sees only their own projections of the subject, limited',async()=>{
   const userA=randomUUID(),userB=randomUUID();
   const manifestId=(await db.putManifest(testManifest('explain_facts'))).manifest_id;
   const a1=await claim({user:userA,manifestId});const a2=await claim({user:userA,manifestId});await claim({user:userB,manifestId});
   h.asUser(userA);
   const mine=(await db.explanationsOf('session','review','subject-1',20)).map(p=>p.explanation_id).sort();
   expect(mine).toEqual([a1.out.explanation_id,a2.out.explanation_id].sort());
   expect(await db.explanationsOf('session','review','subject-1',1)).toHaveLength(1);
   expect(await db.explanationsOf('session','snapshot','subject-1',20)).toEqual([]);
   h.asUser(randomUUID());
   expect(await db.explanationsOf('session','review','subject-1',20)).toEqual([]);
  });
 });
}
```

Create `src/lib/macro/strategy/db.test.ts`:

```ts
// src/lib/macro/strategy/db.test.ts
// memoryStrategyDb against the shared contract, plus the supabaseStrategyDb wiring (RPC names and argument names,
// select chains per role, row normalisation, error mapping) over stub clients.
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';
import {StrategyDbError,memoryStrategyDb,supabaseStrategyDb,toStrategyDbError} from './db';
import {strategyDbContract,testManifest} from './db-contract';

strategyDbContract('memoryStrategyDb contract',async()=>{
 let t=Date.parse('2026-11-07T00:00:00.000Z');
 const db=memoryStrategyDb({now:()=>new Date(t)});
 return {db,asUser:id=>db._userId(id),ageClaim:async(_id,minutes)=>{t+=minutes*60000+1;}};
},5000);

type Call=[string,...unknown[]];
/** Stub Supabase client: records every call; rpc answers from `rpc`, table selects answer rows from `tables`. */
function stub(rpc:(fn:string,args:Record<string,unknown>)=>{data:unknown;error:unknown},tables:Record<string,Record<string,unknown>[]>={}){
 const calls:Call[]=[];
 const client={
  rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push(['rpc',fn,args]);return rpc(fn,args);},
  from:(table:string)=>{
   const b={
    select:(cols:string)=>{calls.push(['select',table,cols]);return b;},
    eq:(k:string,v:unknown)=>{calls.push(['eq',k,v]);return b;},
    in:(k:string,v:unknown)=>{calls.push(['in',k,v]);return b;},
    order:(k:string,o:unknown)=>{calls.push(['order',k,o]);return b;},
    limit:async(n:number)=>{calls.push(['limit',n]);return {data:tables[table]??[],error:null};},
   };
   return b;
  },
 };
 return {calls,client:client as unknown as SupabaseClient};
}

describe('supabaseStrategyDb wiring',()=>{
 it('putManifest sends the canonical hash and the body fields to macro_put_manifest, then reads the row back as admin',async()=>{
  const body=testManifest('cycle_table',{salt:'s'});const hash=sha256Hex(canonicalJson(body));
  const row={manifest_id:'11111111-1111-4111-8111-111111111111',manifest_hash:hash,body,created_at:'2026-11-07 01:02:03.456789+00'};
  const admin=stub(()=>({data:row.manifest_id,error:null}),{macro_strategy_manifests:[row]});const anon=stub(()=>({data:null,error:null}));
  const db=supabaseStrategyDb({admin:admin.client,anon:anon.client});
  expect(await db.putManifest(body)).toEqual({manifest_id:row.manifest_id,manifest_hash:hash,body,created_at:'2026-11-07T01:02:03.456Z'});
  expect(admin.calls[0]).toEqual(['rpc','macro_put_manifest',{p_kind:'cycle_table',p_body:body,p_manifest_hash:hash,p_cutoff:body.cutoff,p_method_version:body.method_version,p_code_version:body.code_version,p_catalog_version:body.catalog_version}]);
  expect(admin.calls.slice(1)).toEqual([['select','macro_strategy_manifests','*'],['eq','manifest_id',row.manifest_id],['limit',1]]);
  expect(anon.calls).toEqual([]);
 });
 it('reads reviews through the anon client and normalises generation and timestamps',async()=>{
  const rid='22222222-2222-4222-8222-222222222222';
  const anon=stub(()=>({data:null,error:null}),{
   macro_review_current:[{region:'US',month:'2026-10',result_id:rid,generation:'3',cutoff:'2026-11-03T00:00:00+00:00',updated_at:'2026-11-01T00:00:00+00:00'}],
   macro_review_results:[{result_id:rid,region:'US',month:'2026-10',status:'ok',manifest_id:'m',manifest_hash:'h',facts:{},method_version:'macro-review/1',code_version:'c',created_at:'2026-11-01T00:00:00+00:00'}],
  });
  const db=supabaseStrategyDb({admin:stub(()=>({data:null,error:null})).client,anon:anon.client});
  expect(await db.reviewCurrent('US','2026-10')).toMatchObject({generation:3,cutoff:'2026-11-03T00:00:00.000Z',result:{result_id:rid,created_at:'2026-11-01T00:00:00.000Z'}});
  expect(await db.reviewIndex('US',36)).toEqual([{month:'2026-10',status:'ok',generation:3,result_id:rid,updated_at:'2026-11-01T00:00:00.000Z'}]);
  expect(anon.calls).toContainEqual(['order','month',{ascending:false}]);
  expect(anon.calls).toContainEqual(['in','result_id',[rid]]);
 });
 it('maps raised codes to StrategyDbError and everything else to rpc_failed',async()=>{
  const admin=stub(()=>({data:null,error:{message:'payload_conflict',code:'P0001'}}));
  const db=supabaseStrategyDb({admin:admin.client,anon:stub(()=>({data:null,error:null})).client});
  await expect(db.claimExplanation({userId:'u',requestId:'r',payloadHash:'a'.repeat(64),subjectKind:'review',subjectId:'s',locale:'en',manifestId:'m'})).rejects.toMatchObject({name:'StrategyDbError',code:'payload_conflict'});
  expect(toStrategyDbError({message:'invalid_transition'}).code).toBe('invalid_transition');
  expect(toStrategyDbError({message:'not_found'}).code).toBe('not_found');
  expect(toStrategyDbError({message:'cutoff_mismatch'}).code).toBe('cutoff_mismatch');
  expect(toStrategyDbError({message:'invalid_argument'}).code).toBe('invalid_argument');
  expect(toStrategyDbError(new Error('connection reset'))).toMatchObject({code:'rpc_failed',message:'connection reset'});
  const e=new StrategyDbError('stale_generation');expect(toStrategyDbError(e)).toBe(e);
 });
 it('publishReview sends a missing expected generation as null so the RPC raises invalid_argument, and maps it',async()=>{
  const admin=stub(()=>({data:null,error:{message:'invalid_argument',code:'P0001'}}));
  const db=supabaseStrategyDb({admin:admin.client,anon:stub(()=>({data:null,error:null})).client});
  await expect(db.publishReview({region:'US',month:'2026-10',expectedGeneration:undefined as unknown as number,cutoff:'2026-11-03T00:00:00.000Z',status:'ok',manifestId:'m',manifestHash:'h',facts:{} as never,methodVersion:'v',codeVersion:'c'})).rejects.toMatchObject({code:'invalid_argument'});
  expect(admin.calls[0]).toMatchObject(['rpc','macro_publish_review',{p_expected_generation:null,p_cutoff:'2026-11-03T00:00:00.000Z'}]);
 });
 it('explanationsOf needs the session client; it filters by subject and orders newest first',async()=>{
  const db=supabaseStrategyDb({admin:stub(()=>({data:null,error:null})).client,anon:stub(()=>({data:null,error:null})).client});
  await expect(db.explanationsOf('session','review','x',20)).rejects.toMatchObject({code:'rpc_failed',message:'no_session_client'});
  const session=stub(()=>({data:null,error:null}),{macro_explanations:[]});
  const db2=supabaseStrategyDb({admin:stub(()=>({data:null,error:null})).client,anon:stub(()=>({data:null,error:null})).client,session:session.client});
  expect(await db2.explanationsOf('session','review','x',20)).toEqual([]);
  expect(session.calls).toEqual([['select','macro_explanations','*'],['eq','subject_kind','review'],['eq','subject_id','x'],['order','created_at',{ascending:false}],['order','explanation_id',{ascending:false}],['limit',20]]);
 });
 it('recordCompletion / expireExplanations call their RPCs with the argument names; reviewResult reads one result as anon',async()=>{
  const rid='22222222-2222-4222-8222-222222222222',uid='33333333-3333-4333-8333-333333333333';
  const admin=stub(fn=>({data:fn==='macro_expire_explanations'?2:null,error:null}));
  const anon=stub(()=>({data:null,error:null}),{macro_review_results:[{result_id:rid,region:'CN',month:'2026-09',status:'ok',manifest_id:'m',manifest_hash:'h',facts:{},method_version:'macro-review/1',code_version:'c',created_at:'2026-10-03T00:00:00+00:00'}]});
  const db=supabaseStrategyDb({admin:admin.client,anon:anon.client});
  await db.recordCompletion({explanationId:rid,rawOutput:undefined,finalizePayload:{status:'failed',byo:true}});
  expect(admin.calls[0]).toEqual(['rpc','macro_record_completion',{p_explanation_id:rid,p_raw_output:null,p_finalize_payload:{status:'failed',byo:true}}]);
  expect(await db.expireExplanations(uid)).toBe(2);
  expect(admin.calls[1]).toEqual(['rpc','macro_expire_explanations',{p_user_id:uid}]);
  expect(await db.reviewResult(rid)).toMatchObject({result_id:rid,region:'CN',created_at:'2026-10-03T00:00:00.000Z'});
  expect(anon.calls).toEqual([['select','macro_review_results','*'],['eq','result_id',rid],['limit',1]]);
  expect(await db.reviewResult('CN:2026-09')).toBeNull();expect(await db.expireExplanations('x')).toBe(0);
  expect(admin.calls).toHaveLength(2);expect(anon.calls).toHaveLength(3);
 });
 it('finishExplanation sends p_finalize_payload; runDetail and recoverableRuns read run rows as admin',async()=>{
  const rid='22222222-2222-4222-8222-222222222222',uid='33333333-3333-4333-8333-333333333333';
  const proj={explanation_id:rid,subject_kind:'review',subject_id:'s',locale:'zh',manifest_id:'m',state:'failed',rendered:null,failure_codes:['provider_error'],provider:null,model:null,
   prompt_version:'p',validator_version:'v',created_at:'2026-11-07T00:00:00+00:00',finished_at:'2026-11-07T00:00:01+00:00'};
  const row=(id:string,raw:unknown)=>({explanation_id:id,user_id:uid,state:'running',locale:'en',manifest_id:'m',usage_audit_key:id,raw_output:raw,finalize_payload:null,finalized:false});
  const admin=stub(()=>({data:proj,error:null}),{macro_explanation_runs:[row(rid,{content:'x'}),row('44444444-4444-4444-8444-444444444444',null)]});
  const db=supabaseStrategyDb({admin:admin.client,anon:stub(()=>({data:null,error:null})).client});
  await db.finishExplanation({explanationId:rid,state:'failed',provider:null,model:null,promptVersion:'p',validatorVersion:'v',rawOutput:null,validation:{},rendered:null,failureCodes:['provider_error'],accounting:null,finalizePayload:{status:'failed',byo:false}});
  expect(admin.calls[0]).toEqual(['rpc','macro_finish_explanation',{p_explanation_id:rid,p_state:'failed',p_provider:null,p_model:null,p_prompt_version:'p',p_validator_version:'v',p_raw_output:null,
   p_validation:{},p_rendered:null,p_failure_codes:['provider_error'],p_accounting:null,p_finalize_payload:{status:'failed',byo:false}}]);
  expect(await db.runDetail(rid)).toEqual(row(rid,{content:'x'}));   // the stub answers its first row
  expect(admin.calls.slice(1,4)).toEqual([['select','macro_explanation_runs','*'],['eq','explanation_id',rid],['limit',1]]);
  expect(await db.recoverableRuns(uid,3)).toEqual([rid]);            // the row without a recorded output is dropped
  expect(admin.calls.slice(4)).toEqual([['select','macro_explanation_runs','*'],['eq','user_id',uid],['eq','state','running'],['order','claimed_at',{ascending:true}],['order','explanation_id',{ascending:true}],['limit',50]]);
  expect(await db.runDetail('x')).toBeNull();expect(await db.recoverableRuns('x',3)).toEqual([]);
  expect(admin.calls).toHaveLength(10);
 });
 it('runOf and manifest short-circuit non-uuid ids without a query',async()=>{
  const admin=stub(()=>({data:null,error:null}));const anon=stub(()=>({data:null,error:null}));
  const db=supabaseStrategyDb({admin:admin.client,anon:anon.client});
  expect(await db.runOf('x','y')).toBeNull();expect(await db.manifest('nope')).toBeNull();
  expect([...admin.calls,...anon.calls]).toEqual([]);
 });
});

describe('memoryStrategyDb specifics',()=>{
 it('recordReviewAttempt rejects a non-failed status like the SQL function',async()=>{
  const db=memoryStrategyDb();
  await expect(db.recordReviewAttempt('US','2026-10','ok' as 'failed',{})).rejects.toMatchObject({code:'rpc_failed',message:'invalid_status'});
 });
 it('explanationsOf without a session identity returns nothing (auth.uid() is null)',async()=>{
  const db=memoryStrategyDb();const m=await db.putManifest(testManifest('explain_facts'));
  await db.claimExplanation({userId:'00000000-0000-4000-8000-000000000001',requestId:'00000000-0000-4000-8000-000000000002',payloadHash:'a'.repeat(64),subjectKind:'snapshot',subjectId:'snap:US:x',locale:'en',manifestId:m.manifest_id});
  expect(await db.explanationsOf('session','snapshot','snap:US:x',20)).toEqual([]);
 });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- src/lib/macro/strategy/hash.test.ts src/lib/macro/strategy/db.test.ts`
Expected: FAIL — `Failed to resolve import "./hash"` (both files; `db-contract.ts` imports `./hash` too).

- [ ] **Step 3: Implement hash.ts and db.ts**

Create `src/lib/macro/strategy/hash.ts` (Task 4's `manifest.ts` imports and re-exports both functions; nothing else in the module defines them):

```ts
// src/lib/macro/strategy/hash.ts
// Canonical JSON + SHA-256 (spec 2026-11-07 §4.4 N3, §4.5): manifest_hash = sha256Hex(canonicalJson(body)) is a manifest's
// single identity; explain-request.ts hashes request payloads the same way. Object keys sorted by UTF-16 code unit,
// undefined members dropped, arrays in order, finite numbers only (decimals travel as strings). Defined here (Task 3)
// because StrategyDb.putManifest needs it before manifest.ts exists; manifest.ts re-exports both.
import {createHash} from 'node:crypto';

/** JSON with object keys sorted (UTF-16 code unit order), undefined members dropped, arrays in order (sparse arrays rejected), finite numbers only. */
export function canonicalJson(v:unknown):string{
 if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
 if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('canonical_json_unsupported:number');return JSON.stringify(v);}
 if(Array.isArray(v)){   // holes would hash as absent but store as null: reject (Array.prototype.map skips them)
  for(let i=0;i<v.length;i++)if(!(i in v))throw new Error('canonical_json_unsupported:sparse_array');
  return `[${v.map(canonicalJson).join(',')}]`;
 }
 if(typeof v==='object'){const o=v as Record<string,unknown>;return `{${Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;}
 throw new Error(`canonical_json_unsupported:${typeof v}`);
}
export const sha256Hex=(text:string):string=>createHash('sha256').update(text,'utf8').digest('hex');
```

Create `src/lib/macro/strategy/db.ts`:

```ts
// src/lib/macro/strategy/db.ts
// StrategyDb (spec §4.4, plan 2026-11-07 Task 3): the only storage access of the strategy module. Writes are the eight
// service-role RPCs of 20261115090000_macro_strategy.sql; reads are table selects under the caller's role (anon for
// manifests and reviews, admin for run lookups, the user's session for the RLS projection). The SQL raises with the
// code as the message (not_found, payload_conflict, invalid_transition, cutoff_mismatch, invalid_argument); toStrategyDbError maps those, everything
// else is rpc_failed. strategyDbOver(transport) holds all mapping logic so the same code runs over Supabase
// (supabaseStrategyDb) and, in the integration test, over node-postgres. memoryStrategyDb reproduces the SQL rules for
// unit tests; db-contract.ts runs the same cases against both. New RPCs are not registered in database.types.ts
// (repo convention, src/lib/supabase/admin.ts): the client is narrowed locally. Timestamps are normalised to ISO-8601
// UTC with milliseconds; bigint generation arrives as a string from pg and as a number from PostgREST → Number().
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {canonicalJson,sha256Hex} from './hash';
import type {ExplanationProjection,ExplanationState,Region,RenderedExplanation,ReviewFacts,ReviewResult,ReviewStatus,StoredManifest,StrategyManifest} from './contract';

/** A run row as completion recovery reads it (service role). */
export interface RunDetail{explanation_id:string;user_id:string;state:ExplanationState;locale:'zh'|'en';manifest_id:string;usage_audit_key:string;raw_output:unknown;finalize_payload:Record<string,unknown>|null;finalized:boolean}
/** A completion is recorded when raw_output is a json object (the completion envelope); the SQL tests jsonb_typeof = 'object'. */
export const hasRecordedCompletion=(raw:unknown):boolean=>typeof raw==='object'&&raw!==null&&!Array.isArray(raw);
/** Running rows scanned per recoverableRuns call. */
export const RECOVERY_SCAN=50;

export class StrategyDbError extends Error{constructor(readonly code:'stale_generation'|'payload_conflict'|'invalid_transition'|'not_found'|'cutoff_mismatch'|'invalid_argument'|'rpc_failed',message?:string){super(message??code);this.name='StrategyDbError';}}
export interface StrategyDb{
 putManifest(body:StrategyManifest):Promise<StoredManifest>;   // computes manifest_hash = sha256Hex(canonicalJson(body)); RPC macro_put_manifest; idempotent by hash
 manifest(id:string):Promise<StoredManifest|null>;                                                          // anon
 reviewCurrent(region:Region,month:string):Promise<{result:ReviewResult;generation:number;cutoff:string}|null>;   // anon
 reviewIndex(region:Region,months:number):Promise<{month:string;status:ReviewStatus;generation:number;result_id:string;updated_at:string}[]>;  // anon
 /** Immutable review result by id (anon): review explanations bind to result_id, never to the moving pointer. */
 reviewResult(resultId:string):Promise<ReviewResult|null>;
 publishReview(a:{region:Region;month:string;expectedGeneration:number;cutoff:string;status:ReviewStatus;manifestId:string;manifestHash:string;facts:ReviewFacts;methodVersion:string;codeVersion:string}):Promise<{result_id:string;generation:number;outcome:'advanced'|'replayed'|'stale'}>;   // RPC macro_publish_review; absent pointer = generation 0; stale is a return value, never thrown
 recordReviewAttempt(region:Region,month:string,status:'failed',error:Record<string,unknown>):Promise<void>;   // service
 /** Admin-side lookup used for idempotent replay before any other check (spec §6.3 step 2). */
 runOf(userId:string,requestId:string):Promise<{explanation_id:string;payload_hash:string;state:ExplanationState}|null>;
 /** RPC generates explanation_id and usage_audit_key; ONLY outcome 'claimed' may bill or call the model. payload_conflict throws. */
 claimExplanation(a:{userId:string;requestId:string;payloadHash:string;subjectKind:'snapshot'|'review';subjectId:string;locale:'zh'|'en';manifestId:string}):Promise<{outcome:'claimed'|'existing';explanation_id:string;usage_audit_key:string;projection:ExplanationProjection}>;
 /** RPC macro_record_completion: durable raw output + the exact finalizeUsageRun payload, right after the provider returns
  *  (or throws, or begin fails) and before validation / finish; running or abandoned rows; same values → no-op. */
 recordCompletion(a:{explanationId:string;rawOutput:unknown;finalizePayload:Record<string,unknown>}):Promise<void>;
 /** running → final; same final state + same raw output → idempotent; other final → invalid_transition; abandoned → late_output only.
  *  finalizePayload is stored atomically when the row has none yet (a failed recordCompletion), never overwritten (plan audit R2-2). */
 finishExplanation(a:{explanationId:string;state:'accepted'|'rejected'|'failed';provider:string|null;model:string|null;promptVersion:string;validatorVersion:string;rawOutput:unknown;validation:Record<string,unknown>;rendered:RenderedExplanation|null;failureCodes:string[];accounting:unknown;finalizePayload:Record<string,unknown>|null}):Promise<ExplanationProjection>;
 markFinalized(explanationId:string):Promise<void>;   // RPC macro_mark_finalized; needs a recorded finalize payload; any state; idempotent
 /** RPC macro_expire_explanations: the user's running rows claimed > 5 minutes ago WITHOUT a recorded completion → abandoned
  *  (projection failed); a row whose raw output is recorded is left for completion recovery (plan audit R2-1). */
 expireExplanations(userId:string):Promise<number>;
 /** Admin read of one run row for completion recovery and settlement (plan audit R2-1 / R2-2); non-uuid → null without a query. */
 runDetail(explanationId:string):Promise<RunDetail|null>;
 /** Admin: ids of the user's running rows with a recorded raw output, oldest claim first, at most `limit` (GET recovery). */
 recoverableRuns(userId:string,limit:number):Promise<string[]>;
 explanationsOf(client:'session',subjectKind:'snapshot'|'review',subjectId:string,limit:number):Promise<ExplanationProjection[]>;   // user session client (RLS)
}

// ---------------------------------------------------------------- transport
export type StrategyTable='macro_strategy_manifests'|'macro_review_results'|'macro_review_current'|'macro_explanation_runs'|'macro_explanations';
export type ReadRole='anon'|'admin'|'session';
export interface SelectSpec{table:StrategyTable;eq:Record<string,string>;in?:{column:string;values:string[]};order:{column:string;ascending:boolean}[];limit:number}
/** rpc runs as service_role and rejects with the database error (message = code for raised errors); select runs under `role`. */
export interface StrategyTransport{
 rpc(fn:string,args:Record<string,unknown>):Promise<unknown>;
 select(role:ReadRole,spec:SelectSpec):Promise<Record<string,unknown>[]>;
}
/** Rows per select (PostgREST max_rows = 1000). */
export const MAX_SELECT=1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODES=['stale_generation','payload_conflict','invalid_transition','not_found','cutoff_mismatch','invalid_argument'] as const;
export function toStrategyDbError(e:unknown):StrategyDbError{
 if(e instanceof StrategyDbError)return e;
 const message=typeof e==='object'&&e!==null&&typeof (e as {message?:unknown}).message==='string'?(e as {message:string}).message:String(e);
 const code=CODES.find(c=>c===message);
 return new StrategyDbError(code??'rpc_failed',message);
}
const iso=(v:unknown):string=>{const t=v instanceof Date?v.getTime():Date.parse(String(v));if(!Number.isFinite(t))throw new StrategyDbError('rpc_failed',`invalid_timestamp:${String(v)}`);return new Date(t).toISOString();};
const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:iso(v);
const str=(v:unknown):string|null=>v===null||v===undefined?null:String(v);

// ---------------------------------------------------------------- row mapping
const manifestFrom=(r:Record<string,unknown>):StoredManifest=>({manifest_id:String(r.manifest_id),manifest_hash:String(r.manifest_hash),body:r.body as StrategyManifest,created_at:iso(r.created_at)});
const resultFrom=(r:Record<string,unknown>):ReviewResult=>({result_id:String(r.result_id),region:r.region as Region,month:String(r.month),status:r.status as ReviewStatus,
 manifest_id:String(r.manifest_id),manifest_hash:String(r.manifest_hash),facts:r.facts as ReviewFacts,method_version:String(r.method_version),code_version:String(r.code_version),created_at:iso(r.created_at)});
const runDetailFrom=(r:Record<string,unknown>):RunDetail=>({explanation_id:String(r.explanation_id),user_id:String(r.user_id),state:r.state as ExplanationState,locale:r.locale as 'zh'|'en',
 manifest_id:String(r.manifest_id),usage_audit_key:String(r.usage_audit_key),raw_output:r.raw_output??null,finalize_payload:(r.finalize_payload??null) as Record<string,unknown>|null,finalized:r.finalized===true});
/** Projection row or RPC projection json → ExplanationProjection. prompt_version / validator_version are null until finish → ''. */
export function projectionFrom(r:Record<string,unknown>):ExplanationProjection{
 return {explanation_id:String(r.explanation_id),subject_kind:r.subject_kind as 'snapshot'|'review',subject_id:String(r.subject_id),locale:r.locale as 'zh'|'en',
  manifest_id:String(r.manifest_id),state:r.state as ExplanationState,rendered:(r.rendered??null) as RenderedExplanation|null,
  failure_codes:Array.isArray(r.failure_codes)?r.failure_codes.map(String):[],provider:str(r.provider),model:str(r.model),
  prompt_version:str(r.prompt_version)??'',validator_version:str(r.validator_version)??'',created_at:iso(r.created_at),finished_at:isoOrNull(r.finished_at)};
}

export function strategyDbOver(t:StrategyTransport):StrategyDb{
 const rpc=async(fn:string,args:Record<string,unknown>)=>{try{return await t.rpc(fn,args);}catch(e){throw toStrategyDbError(e);}};
 const select=async(role:ReadRole,spec:SelectSpec)=>{try{return await t.select(role,{...spec,limit:Math.min(Math.max(1,Math.trunc(spec.limit)),MAX_SELECT)});}catch(e){throw toStrategyDbError(e);}};
 const manifestById=async(role:ReadRole,id:string)=>{
  if(!UUID.test(id))return null;
  const [r]=await select(role,{table:'macro_strategy_manifests',eq:{manifest_id:id},order:[],limit:1});
  return r?manifestFrom(r):null;
 };
 return {
  async putManifest(body){
   const hash=sha256Hex(canonicalJson(body));
   const id=String(await rpc('macro_put_manifest',{p_kind:body.kind,p_body:body,p_manifest_hash:hash,p_cutoff:body.cutoff,p_method_version:body.method_version,p_code_version:body.code_version,p_catalog_version:body.catalog_version}));
   const stored=await manifestById('admin',id);
   if(!stored)throw new StrategyDbError('rpc_failed',`manifest_not_readable:${id}`);
   return stored;
  },
  manifest:id=>manifestById('anon',id),
  async reviewCurrent(region,month){
   const [cur]=await select('anon',{table:'macro_review_current',eq:{region,month},order:[],limit:1});
   if(!cur)return null;
   const [res]=await select('anon',{table:'macro_review_results',eq:{result_id:String(cur.result_id)},order:[],limit:1});
   if(!res)throw new StrategyDbError('rpc_failed',`review_result_missing:${String(cur.result_id)}`);
   return {result:resultFrom(res),generation:Number(cur.generation),cutoff:iso(cur.cutoff)};
  },
  async reviewIndex(region,months){
   const cur=await select('anon',{table:'macro_review_current',eq:{region},order:[{column:'month',ascending:false}],limit:months});
   if(!cur.length)return [];
   const res=await select('anon',{table:'macro_review_results',eq:{},in:{column:'result_id',values:cur.map(r=>String(r.result_id))},order:[],limit:cur.length});
   const status=new Map(res.map(r=>[String(r.result_id),r.status as ReviewStatus]));
   return cur.map(r=>{
    const s=status.get(String(r.result_id));if(!s)throw new StrategyDbError('rpc_failed',`review_result_missing:${String(r.result_id)}`);
    return {month:String(r.month),status:s,generation:Number(r.generation),result_id:String(r.result_id),updated_at:iso(r.updated_at)};
   });
  },
  async publishReview(a){
   const x=await rpc('macro_publish_review',{p_region:a.region,p_month:a.month,p_expected_generation:a.expectedGeneration??null,p_cutoff:a.cutoff,p_status:a.status,p_manifest_id:a.manifestId,
    p_manifest_hash:a.manifestHash,p_facts:a.facts,p_method_version:a.methodVersion,p_code_version:a.codeVersion}) as {result_id:string;generation:number|string;outcome:'advanced'|'replayed'|'stale'};
   return {result_id:String(x.result_id),generation:Number(x.generation),outcome:x.outcome};
  },
  async reviewResult(resultId){
   if(!UUID.test(resultId))return null;
   const [r]=await select('anon',{table:'macro_review_results',eq:{result_id:resultId},order:[],limit:1});
   return r?resultFrom(r):null;
  },
  async recordReviewAttempt(region,month,status,error){await rpc('macro_record_review_attempt',{p_region:region,p_month:month,p_status:status,p_error:error});},
  async runOf(userId,requestId){
   if(!UUID.test(userId)||!UUID.test(requestId))return null;
   const [r]=await select('admin',{table:'macro_explanation_runs',eq:{user_id:userId,request_id:requestId},order:[],limit:1});
   return r?{explanation_id:String(r.explanation_id),payload_hash:String(r.payload_hash),state:r.state as ExplanationState}:null;
  },
  async claimExplanation(a){
   const x=await rpc('macro_claim_explanation',{p_user_id:a.userId,p_request_id:a.requestId,p_payload_hash:a.payloadHash,p_subject_kind:a.subjectKind,p_subject_id:a.subjectId,p_locale:a.locale,p_manifest_id:a.manifestId}) as {outcome:'claimed'|'existing';explanation_id:string;usage_audit_key:string;projection:Record<string,unknown>};
   return {outcome:x.outcome,explanation_id:String(x.explanation_id),usage_audit_key:String(x.usage_audit_key),projection:projectionFrom(x.projection)};
  },
  async recordCompletion(a){await rpc('macro_record_completion',{p_explanation_id:a.explanationId,p_raw_output:a.rawOutput??null,p_finalize_payload:a.finalizePayload});},
  async finishExplanation(a){
   return projectionFrom(await rpc('macro_finish_explanation',{p_explanation_id:a.explanationId,p_state:a.state,p_provider:a.provider,p_model:a.model,p_prompt_version:a.promptVersion,
    p_validator_version:a.validatorVersion,p_raw_output:a.rawOutput??null,p_validation:a.validation,p_rendered:a.rendered,p_failure_codes:a.failureCodes,p_accounting:a.accounting??null,
    p_finalize_payload:a.finalizePayload??null}) as Record<string,unknown>);
  },
  async markFinalized(id){await rpc('macro_mark_finalized',{p_explanation_id:id});},
  async expireExplanations(userId){if(!UUID.test(userId))return 0;return Number(await rpc('macro_expire_explanations',{p_user_id:userId}));},
  async runDetail(id){
   if(!UUID.test(id))return null;
   const [r]=await select('admin',{table:'macro_explanation_runs',eq:{explanation_id:id},order:[],limit:1});
   return r?runDetailFrom(r):null;
  },
  async recoverableRuns(userId,limit){
   if(!UUID.test(userId))return [];
   const rows=await select('admin',{table:'macro_explanation_runs',eq:{user_id:userId,state:'running'},order:[{column:'claimed_at',ascending:true},{column:'explanation_id',ascending:true}],limit:RECOVERY_SCAN});
   return rows.filter(r=>hasRecordedCompletion(r.raw_output)).slice(0,Math.max(0,Math.trunc(limit))).map(r=>String(r.explanation_id));
  },
  async explanationsOf(_client,subjectKind,subjectId,limit){
   const rows=await select('session',{table:'macro_explanations',eq:{subject_kind:subjectKind,subject_id:subjectId},order:[{column:'created_at',ascending:false},{column:'explanation_id',ascending:false}],limit});
   return rows.map(projectionFrom);
  },
 };
}

// ---------------------------------------------------------------- Supabase
interface PgErrorLike{message?:string;code?:string}
interface RpcResult{data:unknown;error:PgErrorLike|null}
// The query builder is left untyped on purpose (same as src/lib/facts/db.ts): the hand-maintained Database type lacks
// the Relationships/Views that supabase-js inference needs, and the eight RPCs are not registered there.
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}
export function supabaseTransport(c:{admin:SupabaseClient;anon:SupabaseClient;session?:SupabaseClient}):StrategyTransport{
 const pick=(role:ReadRole):NarrowClient=>{
  const client=role==='admin'?c.admin:role==='anon'?c.anon:c.session;
  if(!client)throw new StrategyDbError('rpc_failed','no_session_client');
  return client as unknown as NarrowClient;
 };
 return {
  async rpc(fn,args){const {data,error}=await pick('admin').rpc(fn,args);if(error)throw error;return data;},
  async select(role,spec){
   let q=pick(role).from(spec.table).select('*');
   for(const [k,v] of Object.entries(spec.eq))q=q.eq(k,v);
   if(spec.in)q=q.in(spec.in.column,spec.in.values);
   for(const o of spec.order)q=q.order(o.column,{ascending:o.ascending});
   const {data,error}=await q.limit(spec.limit) as RpcResult;
   if(error)throw error;
   return (data??[]) as Record<string,unknown>[];
  },
 };
}
export function supabaseStrategyDb(c:{admin:SupabaseClient;anon:SupabaseClient;session?:SupabaseClient}):StrategyDb{return strategyDbOver(supabaseTransport(c));}

// ---------------------------------------------------------------- memory (unit tests; same rules as the SQL)
interface MemRun{explanation_id:string;user_id:string;request_id:string;payload_hash:string;locale:'zh'|'en';manifest_id:string;state:ExplanationState;claimed_at:number;raw_output:unknown;finalize_payload:Record<string,unknown>|null;accounting:unknown;finalized:boolean;late_output:unknown;usage_audit_key:string}
const ABANDON_MS=5*60*1000;
export type MemRunView={state:ExplanationState;raw_output:unknown;finalize_payload:Record<string,unknown>|null;finalized:boolean;late_output:unknown};
export function memoryStrategyDb(opts:{now?:()=>Date}={}):StrategyDb&{_userId:(id:string)=>void;_run:(explanationId:string)=>MemRunView|null}{
 const now=opts.now??(()=>new Date());
 const clone=<T>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v)) as T;
 const manifests=new Map<string,StoredManifest>(),byHash=new Map<string,string>();
 const results=new Map<string,ReviewResult>(),resultByKey=new Map<string,string>();
 const current=new Map<string,{region:Region;month:string;result_id:string;generation:number;cutoff:string;updated_at:string}>();
 const attempts:{region:Region;month:string;status:string;result_id:string|null;error:unknown}[]=[];
 const runs=new Map<string,MemRun>(),runByRequest=new Map<string,string>();
 const projections=new Map<string,ExplanationProjection&{user_id:string}>();
 let sessionUser:string|null=null;
 const projection=(id:string):ExplanationProjection=>{const {user_id:_u,...p}=projections.get(id)!;return clone(p);};
 const abandon=(r:MemRun)=>{
  const t=now().toISOString();r.state='abandoned';
  const p=projections.get(r.explanation_id)!;if(p.state==='running'){p.state='failed';p.failure_codes=['abandoned'];p.finished_at=t;}
 };
 const expired=(r:MemRun)=>r.state==='running'&&r.claimed_at<now().getTime()-ABANDON_MS&&!hasRecordedCompletion(r.raw_output);
 /** finish's p_finalize_payload: validated like the column check, stored only when the row has none. */
 const payloadFill=(r:MemRun,p:Record<string,unknown>|null)=>{
  if(r.finalize_payload!==null||p===null)return null;
  if(p.status!=='completed'&&p.status!=='failed')throw new StrategyDbError('rpc_failed','macro_explanation_runs_finalize_payload');
  return clone(p);
 };
 return {
  _userId(id){sessionUser=id;},
  _run(id){const r=runs.get(id);return r?clone({state:r.state,raw_output:r.raw_output,finalize_payload:r.finalize_payload,finalized:r.finalized,late_output:r.late_output}):null;},
  async putManifest(body){
   const hash=sha256Hex(canonicalJson(body));
   const existing=byHash.get(hash);
   if(existing){const m=manifests.get(existing)!;if(canonicalJson(m.body)!==canonicalJson(body))throw new StrategyDbError('payload_conflict');return clone(m);}
   const m:StoredManifest={manifest_id:randomUUID(),manifest_hash:hash,body:clone(body),created_at:now().toISOString()};
   manifests.set(m.manifest_id,m);byHash.set(hash,m.manifest_id);return clone(m);
  },
  async manifest(id){const m=manifests.get(id);return m?clone(m):null;},
  async reviewCurrent(region,month){
   const c=current.get(`${region}|${month}`);if(!c)return null;
   return {result:clone(results.get(c.result_id)!),generation:c.generation,cutoff:c.cutoff};
  },
  async reviewIndex(region,months){
   return [...current.values()].filter(c=>c.region===region).sort((a,b)=>a.month<b.month?1:a.month>b.month?-1:0).slice(0,Math.max(1,Math.trunc(months)))
    .map(c=>({month:c.month,status:results.get(c.result_id)!.status,generation:c.generation,result_id:c.result_id,updated_at:c.updated_at}));
  },
  async publishReview(a){
   if(a.expectedGeneration===null||a.expectedGeneration===undefined)throw new StrategyDbError('invalid_argument');
   const m=manifests.get(a.manifestId);
   if(!m||m.manifest_hash!==a.manifestHash||m.body.kind!=='review')throw new StrategyDbError('not_found');
   // the pointer's cutoff always is its frozen evidence's cutoff: compare instants, not spellings
   if(Date.parse(m.body.cutoff)!==Date.parse(a.cutoff))throw new StrategyDbError('cutoff_mismatch');
   const key=`${a.region}|${a.month}|${a.manifestHash}`;let resultId=resultByKey.get(key);
   if(!resultId){
    resultId=randomUUID();resultByKey.set(key,resultId);
    results.set(resultId,{result_id:resultId,region:a.region,month:a.month,status:a.status,manifest_id:a.manifestId,manifest_hash:a.manifestHash,facts:clone(a.facts),method_version:a.methodVersion,code_version:a.codeVersion,created_at:now().toISOString()});
   }
   const ck=`${a.region}|${a.month}`;const cur=current.get(ck);let gen=cur?.generation??0;let outcome:'advanced'|'replayed'|'stale';
   if(cur?.result_id===resultId)outcome='replayed';
   else if(gen!==a.expectedGeneration)outcome='stale';
   else if(cur&&Date.parse(a.cutoff)<Date.parse(cur.cutoff))outcome='stale';
   else{gen+=1;current.set(ck,{region:a.region,month:a.month,result_id:resultId,generation:gen,cutoff:new Date(Date.parse(a.cutoff)).toISOString(),updated_at:now().toISOString()});outcome='advanced';}
   attempts.push({region:a.region,month:a.month,status:outcome==='advanced'?'ok':outcome,result_id:resultId,error:null});
   return {result_id:resultId,generation:gen,outcome};
  },
  async reviewResult(resultId){const r=results.get(resultId);return r?clone(r):null;},
  async recordReviewAttempt(region,month,status,error){
   if(status!=='failed')throw new StrategyDbError('rpc_failed','invalid_status');
   attempts.push({region,month,status,result_id:null,error:clone(error)});
  },
  async runOf(userId,requestId){
   const id=runByRequest.get(`${userId}|${requestId}`);if(!id)return null;
   const r=runs.get(id)!;return {explanation_id:r.explanation_id,payload_hash:r.payload_hash,state:r.state};
  },
  async claimExplanation(a){
   const id=runByRequest.get(`${a.userId}|${a.requestId}`);
   if(id){
    const r=runs.get(id)!;
    if(r.payload_hash!==a.payloadHash)throw new StrategyDbError('payload_conflict');
    if(expired(r))abandon(r);
    return {outcome:'existing',explanation_id:id,usage_audit_key:r.usage_audit_key,projection:projection(id)};
   }
   const m=manifests.get(a.manifestId);
   if(!m||m.body.kind!=='explain_facts')throw new StrategyDbError('not_found');
   const eid=randomUUID();const key=eid;const t=now();
   runs.set(eid,{explanation_id:eid,user_id:a.userId,request_id:a.requestId,payload_hash:a.payloadHash,locale:a.locale,manifest_id:a.manifestId,state:'running',claimed_at:t.getTime(),raw_output:null,finalize_payload:null,accounting:null,finalized:false,late_output:null,usage_audit_key:key});
   runByRequest.set(`${a.userId}|${a.requestId}`,eid);
   projections.set(eid,{user_id:a.userId,explanation_id:eid,subject_kind:a.subjectKind,subject_id:a.subjectId,locale:a.locale,manifest_id:a.manifestId,state:'running',rendered:null,failure_codes:[],
    provider:null,model:null,prompt_version:'',validator_version:'',created_at:t.toISOString(),finished_at:null});
   return {outcome:'claimed',explanation_id:eid,usage_audit_key:key,projection:projection(eid)};
  },
  async recordCompletion(a){
   if(a.finalizePayload===null||a.finalizePayload===undefined)throw new StrategyDbError('invalid_transition');   // checked before the row lookup, like the SQL
   const r=runs.get(a.explanationId);
   if(!r)throw new StrategyDbError('not_found');
   const raw=clone(a.rawOutput??null);
   if(r.state!=='running'&&r.state!=='abandoned')throw new StrategyDbError('invalid_transition');   // state first, like the SQL
   if(r.finalize_payload!==null){
    if(canonicalJson(r.finalize_payload)!==canonicalJson(a.finalizePayload)||canonicalJson(r.raw_output)!==canonicalJson(raw))throw new StrategyDbError('invalid_transition');
    return;
   }
   if(a.finalizePayload.status!=='completed'&&a.finalizePayload.status!=='failed')throw new StrategyDbError('rpc_failed','macro_explanation_runs_finalize_payload');
   r.raw_output=raw;r.finalize_payload=clone(a.finalizePayload);
  },
  async finishExplanation(a){
   const r=runs.get(a.explanationId);
   if(!r)throw new StrategyDbError('not_found');
   const raw=clone(a.rawOutput??null);
   if(r.state==='running'){
    if(r.finalize_payload!==null&&canonicalJson(r.raw_output)!==canonicalJson(raw))throw new StrategyDbError('invalid_transition');   // a recorded completion is evidence
    if(a.state==='accepted'&&a.rendered===null)throw new StrategyDbError('rpc_failed','macro_explanations_rendered');
    const fill=payloadFill(r,a.finalizePayload);
    const t=now().toISOString();r.state=a.state;r.raw_output=raw;r.accounting=clone(a.accounting??null);if(fill)r.finalize_payload=fill;
    const p=projections.get(a.explanationId)!;
    Object.assign(p,{state:a.state,rendered:a.state==='accepted'?clone(a.rendered):null,failure_codes:a.state==='accepted'?[]:[...a.failureCodes],provider:a.provider,model:a.model,
     prompt_version:a.promptVersion,validator_version:a.validatorVersion,finished_at:t});
   }else if(r.state==='abandoned'){
    const fill=payloadFill(r,a.finalizePayload);
    r.accounting=clone(a.accounting??null);r.late_output={state:a.state,raw_output:raw,validation:clone(a.validation),rendered:clone(a.rendered),failure_codes:[...a.failureCodes]};
    if(fill)r.finalize_payload=fill;
   }else if(r.state===a.state&&canonicalJson(r.raw_output)===canonicalJson(raw)){
    const fill=payloadFill(r,a.finalizePayload);if(fill)r.finalize_payload=fill;
   }else{
    throw new StrategyDbError('invalid_transition');
   }
   return projection(a.explanationId);
  },
  async markFinalized(id){
   const r=runs.get(id);
   if(!r)throw new StrategyDbError('not_found');
   if(r.finalize_payload===null)throw new StrategyDbError('invalid_transition');
   r.finalized=true;
  },
  async expireExplanations(userId){
   let n=0;
   for(const r of runs.values())if(r.user_id===userId&&expired(r)){abandon(r);n++;}
   return n;
  },
  async runDetail(id){
   const r=runs.get(id);if(!r)return null;
   return clone({explanation_id:r.explanation_id,user_id:r.user_id,state:r.state,locale:r.locale,manifest_id:r.manifest_id,usage_audit_key:r.usage_audit_key,raw_output:r.raw_output,
    finalize_payload:r.finalize_payload,finalized:r.finalized});
  },
  async recoverableRuns(userId,limit){
   return [...runs.values()].filter(r=>r.user_id===userId&&r.state==='running')   // same order and scan cap as production: oldest RECOVERY_SCAN running rows, then the recorded ones
    .sort((a,b)=>a.claimed_at-b.claimed_at||(a.explanation_id<b.explanation_id?-1:1)).slice(0,RECOVERY_SCAN)
    .filter(r=>hasRecordedCompletion(r.raw_output)).slice(0,Math.max(0,Math.trunc(limit))).map(r=>r.explanation_id);
  },
  async explanationsOf(_client,subjectKind,subjectId,limit){
   if(sessionUser===null)return [];
   return [...projections.values()].filter(p=>p.user_id===sessionUser&&p.subject_kind===subjectKind&&p.subject_id===subjectId)
    .sort((a,b)=>a.created_at!==b.created_at?(a.created_at<b.created_at?1:-1):(a.explanation_id<b.explanation_id?1:a.explanation_id>b.explanation_id?-1:0))
    .slice(0,Math.min(Math.max(1,Math.trunc(limit)),MAX_SELECT)).map(p=>projection(p.explanation_id));
  },
 };
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npm test -- src/lib/macro/strategy/hash.test.ts src/lib/macro/strategy/db.test.ts`
Expected: PASS — `Tests  32 passed (32)` (hash 4; db 28 = 18 memory contract cases + 8 wiring + 2 memory specifics).

- [ ] **Step 5: Run the same contract on real PostgreSQL**

Edit `src/lib/macro/strategy/strategy.integration.test.ts`:

(a) Replace

```ts
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
```

with

```ts
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {ident} from '../../db/pg-table-client';
import {strategyDbOver} from './db';
import type {ReadRole,SelectSpec,StrategyTransport} from './db';
import {strategyDbContract} from './db-contract';
```

(b) Append at the end of the file:

```ts
// ---------------------------------------------------------------- Task 3: the shared StrategyDb contract over node-postgres
// strategyDbOver(pgTransport) runs the same mapping code as supabaseStrategyDb; the transport executes each RPC as
// service_role and each select under the requested role (session = authenticated with request.jwt.claim.sub), so the
// contract also exercises the grants and the projection RLS.
const JSONB_ARGS=new Set(['p_body','p_facts','p_error','p_raw_output','p_validation','p_rendered','p_accounting','p_finalize_payload']);
function pgTransport(pool:Pool,sessionUser:()=>string|null):StrategyTransport{
 const inRole=async<T>(role:ReadRole,body:(c:PoolClient)=>Promise<T>):Promise<T>=>{
  const c=await pool.connect();
  try{
   await c.query('begin');
   const sub=role==='session'?sessionUser():null;
   if(sub)await c.query(`select set_config('request.jwt.claim.sub',$1,true)`,[sub]);
   await c.query(`set local role ${role==='admin'?'service_role':role==='anon'?'anon':'authenticated'}`);
   const out=await body(c);
   await c.query('commit');
   return out;
  }catch(e){await c.query('rollback').catch(()=>{});throw e;}
  finally{c.release();}
 };
 return {
  rpc:(fn,args)=>inRole('admin',async c=>{
   const keys=Object.keys(args);
   const values=keys.map(k=>JSONB_ARGS.has(k)&&args[k]!==null&&args[k]!==undefined?JSON.stringify(args[k]):args[k]??null);
   return (await c.query(`select public.${ident(fn)}(${keys.map((k,i)=>`${ident(k)} => $${i+1}`).join(', ')}) as v`,values)).rows[0].v as unknown;
  }),
  select:(role,spec:SelectSpec)=>inRole(role,async c=>{
   const values:unknown[]=[];const where:string[]=[];
   for(const [k,v] of Object.entries(spec.eq)){values.push(v);where.push(`${ident(k)} = $${values.length}`);}
   if(spec.in){values.push(spec.in.values);where.push(`${ident(spec.in.column)}::text = any($${values.length}::text[])`);}
   const order=spec.order.length?` order by ${spec.order.map(o=>`${ident(o.column)} ${o.ascending?'asc':'desc'}`).join(', ')}`:'';
   return (await c.query(`select * from public.${ident(spec.table)}${where.length?` where ${where.join(' and ')}`:''}${order} limit ${Number(spec.limit)}`,values)).rows as Record<string,unknown>[];
  }),
 };
}

describe.skipIf(!enabled)('StrategyDb on real PostgreSQL',()=>{
 strategyDbContract('pg StrategyDb contract',async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  const pool=new Pool({connectionString:state.adminUrl,statement_timeout:10000});
  let sub:string|null=null;
  return {
   db:strategyDbOver(pgTransport(pool,()=>sub)),
   asUser:id=>{sub=id;},
   ageClaim:async(id,minutes)=>{await pool.query(`update public.macro_explanation_runs set claimed_at=claimed_at-make_interval(mins=>$2) where explanation_id=$1`,[id,minutes]);},
   close:()=>pool.end(),
  };
 },6000+Math.floor(Math.random()*2000));
});
```

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/macro/strategy/strategy.integration.test.ts`
Expected: PASS — `Tests  42 passed (42)` (24 migration cases + 18 pg contract cases).

Run: `npm test -- src/lib/macro/strategy`
Expected: PASS for the unit files; `strategy.integration.test.ts` shows 42 skipped (no `S4_TEST_STATE`).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/macro/strategy/hash.ts src/lib/macro/strategy/hash.test.ts src/lib/macro/strategy/db.ts src/lib/macro/strategy/db-contract.ts src/lib/macro/strategy/db.test.ts src/lib/macro/strategy/strategy.integration.test.ts
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): StrategyDb over Supabase and memory with a shared contract

hash.ts holds the canonical JSON and SHA-256 behind every manifest_hash.
strategyDbOver(transport) maps the eight RPCs and the role-scoped reads; the
Supabase transport narrows the client locally; memoryStrategyDb reproduces the
SQL rules. db-contract.ts runs the same cases on memory (unit) and on real
PostgreSQL through a node-postgres transport (critical integration suite).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

## Part B — P3 计算：数值、清单、事件、传导、剧本、矩阵、行动段（Task 4–8）

> Part B of `docs/superpowers/plans/2026-11-07-macro-workbench-p3-p4.md`. Uses the skeleton's SHARED CONTRACT (`contract.ts`), `StrategyReadPort` / `memoryStrategyPort` (`port.ts`) and the fixture API (`testing/fixture.ts`: `fixture`, `FIXTURE_CATALOG`, `FIXTURE_RULES`, `obs`, `monthly`, `daily`, `snap`, `fedTargetFixture`) exactly as declared there; nothing in them is changed. Spec: `docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md` draft 5 (§4.5, §5.1–§5.6; §0.2 "第 4 稿" lists the plan-audit write-back).

Cross-task decisions fixed in Part B (later tasks rely on them):
- **Input roles.** Every `ManifestInput.role` is built with `inputRole(purpose, seriesId, tag)` from `manifest.ts` = `'<purpose>:<series_id>:<tag>'`. Purposes: `node` (transmission), `dim` (policy response), `col` (cycle table), `events` (event sources: reads plus the evidence rows), `snapshot_rows` (a read recording unresolved snapshot ids). Tags: `latest | prev | prev3m` (snapshot roles), `base | end | from | to` (reserved for Part C), `month_end` (a whole monthly window), `history` (a whole daily window), `evidence` (single event-source rows; all listed in the `ManifestInput.role` comment of `contract.ts`).
- **One manifest per (kind, params); the calculation parameters live in the manifest (plan audit #3).** `transmission` has `params:{region}`, `policy_response` `params:{window}` (1/3/6), `cycle_table` `params:{boundary, columns}` (`columns` = the ordered column ids as canonical JSON text, like `policy_response`'s `dims`); builders take the parameter and freeze it before hashing, so each value is its own identity, and the views (`buildTransmission(stored)`, `buildPolicyResponse(stored)`, `buildCycleTable(stored)`) read it back from `body.params` (`regionParam` / `windowParam` / `boundaryParam` / `columnsParam` throw `invalid_manifest_params:<name>` otherwise). Replay derives every argument from the manifest. Views take the `StoredManifest` (they need `manifest_id`).
- **Builders** live next to their views: `buildTransmissionManifest` (Task 6), `buildPolicyResponseManifest` (Task 7), `buildCycleTableManifest` (Task 8), all on the shared `manifestBuilder` (Task 4). They return the body; the route (Task 12) calls `StrategyDb.putManifest(body)` and passes the returned `StoredManifest` to the view.
- **Event-source histories are not copied whole into manifests** (the daily Fed target history is tens of thousands of rows): the manifest freezes the merged `events` and `gaps`, records the three reads with purpose `events`, and freezes exactly the rows needed to derive and verify every event — each event's evidence observations plus the 2008 transition tuple (last single-target row, first upper and lower rows) — as `events:<series>:evidence` inputs (plan audit #4). A truncated source read gives a `history_truncated` gap (plan audit #11).
- **Floats.** Only `pctChange` (one `Number()` per operand) and the type-7 quartiles over `change_raw`. Every `change_text` is exact: pct → the ratio text `'<end>/<base>'` (`pctRatio`, rounded once at presentation by `roundPctRatio`; plan audit #10), bp → `toBp`. For bp rows `change_raw = Number(change_text)`.
- **Snapshot reads (plan audit #15).** `useSnapshots` compares the requested ids with what `observationsByIds` returned; any unresolved id makes that region's snapshot incomplete: a `snapshot_rows` read `missing` is recorded and every `snapshotValue` of the region returns null with read state `truncated` (no promotion of a comparison row to `latest`, no `latestObservations` fallback).

---

### Task 4: Exact decimals, statistics, canonical hash and the manifest builder

**Files:**
- Create: `src/lib/macro/strategy/numeric.ts`, `src/lib/macro/strategy/numeric.test.ts`
- Create: `src/lib/macro/strategy/manifest.ts`, `src/lib/macro/strategy/manifest.test.ts`

Design decisions (spec §4.5, §5.6):
- `numeric.ts` re-implements the P1 `decimal.ts` BigInt scaling (P1 is not on main): `compare`, `subtract`, `add`, `sign`, `toBp` (same definition as P2 `events.ts::toBp`, a canonical `e2` shift), `pctChange` (float, once), `pctRatio` (exact ratio text `'<end>/<base>'`) and `roundPctRatio(ratio, dp)` (one exact half-away-from-zero rounding), `quantile7` / `quartiles` / `median`. Inputs go through `canonicalDecimal` from `src/lib/facts/json-numbers.ts` (throws `invalid_decimal:…`).
- `manifest.ts`: re-exports `canonicalJson` / `sha256Hex` from `hash.ts` (Task 3; keys sorted by UTF-16 code unit, `undefined` dropped, non-finite numbers rejected — the same function as P1 `catalog.ts`), adds `manifestHash(body)`; calendar helpers; cutoff rules `latestCutoff` / `monthCutoff` (review: the 3rd of the next month 00:00:00Z; baseline = the 3rd of the review month) / `pinSnapshots`; `freezeSnapshot`, `freezeDef`, `snapshotRoles`; readers `inputRole`, `inputsWithRole`, `frozenDef`, `readState`, `toObsRef`; and `manifestBuilder(port, cutoff)`.
- Snapshot roles (N1): per series in `observation_ids ∪ history_ids`, highest version per `period_end`; max `period_end` = `latest`, the next earlier = `prev`, the row whose `period_end` is the month end 3 months before `latest` = `prev3m` (quarterly: that is the previous quarter end; daily series: none).
- Value rule: `snapshotValue` takes the row from the series' region snapshot (`source:{kind:'snapshot'}`), else `latestObservations([id],{asOf:cutoff})` (`source:{kind:'history',as_of:cutoff}`), else records `missing`. `history` reads `seriesHistory(id,{asOf:cutoff,maxRows:HISTORY_MAX_ROWS})`; an `Error('truncated')` becomes read state `truncated` and returns `null` (never thrown); any other error propagates. `useSnapshots(s,{loadRows:false})` only freezes the snapshot records (matrix / history manifests). `build()` sorts `catalog` by id, `reads` by `purpose|series_id`, `inputs` by `role|period_end|observation_id`, so the hash does not depend on read order.

- [ ] **Step 1: Write the failing tests**

`src/lib/macro/strategy/numeric.test.ts`
```ts
// numeric.ts (spec §5.6): exact decimal ops on canonical text, one float step for pct, type-7 quartiles.
import {describe,expect,it} from 'vitest';
import {add,compare,median,pctChange,pctRatio,quantile7,quartiles,roundPctRatio,sign,subtract,toBp} from './numeric';
describe('exact decimals',()=>{
 it('subtracts and adds exactly with canonical output',()=>{
  expect(subtract('4.10','1.85')).toBe('2.25');
  expect(subtract('1','1.000')).toBe('0');
  expect(subtract('0.1','0.3')).toBe('-0.2');
  expect(add('25','-12.5')).toBe('12.5');
  expect(add('0.1','0.2')).toBe('0.3');
 });
 it('compares by value, not by text',()=>{
  expect(compare('4.50','4.5')).toBe(0);
  expect(compare('-0.25','0')).toBe(-1);
  expect(compare('10','9.99')).toBe(1);
 });
 it('sign and toBp',()=>{
  expect(sign('-0')).toBe(0);expect(sign('0.0001')).toBe(1);expect(sign('-75')).toBe(-1);
  expect(toBp('-0.25')).toBe('-25');expect(toBp('0.125')).toBe('12.5');expect(toBp('0')).toBe('0');expect(toBp('2.25')).toBe('225');
 });
 it('rejects non-decimal text',()=>{
  expect(()=>subtract('abc','1')).toThrow(/invalid_decimal/);
 });
});
describe('percentage change',()=>{
 it('pctChange is one float step; pctRatio keeps the exact ratio and roundPctRatio rounds it once',()=>{
  expect(pctChange('105','100')).toBeCloseTo(5,12);
  expect(pctRatio('105.0','100')).toBe('105/100');
  expect(roundPctRatio(pctRatio('105','100'),1)).toBe('5.0');
  expect(roundPctRatio(pctRatio('1','3'),4)).toBe('-66.6667');
  expect(roundPctRatio(pctRatio('62','60.5'),1)).toBe('2.5');   // 2.479… → 2.5
 });
 it('no double rounding at the display boundary (positive and negative)',()=>{
  expect(roundPctRatio(pctRatio('100.04996','100'),1)).toBe('0.0');    // true 0.04996 %: a 4-dp pre-round (0.05) would show 0.1
  expect(roundPctRatio(pctRatio('99.95004','100'),1)).toBe('0.0');     // true −0.04996 %: no sign on a zero result
  expect(roundPctRatio(pctRatio('100.05','100'),1)).toBe('0.1');       // exactly half → away from zero
  expect(roundPctRatio(pctRatio('99.95','100'),1)).toBe('-0.1');
  expect(roundPctRatio(pctRatio('100.14996','100'),1)).toBe('0.1');
 });
 it('refuses a non-positive base and malformed ratios',()=>{
  expect(()=>pctChange('1','0')).toThrow('non_positive_base');
  expect(()=>pctRatio('1','-2')).toThrow('non_positive_base');
  expect(()=>roundPctRatio('1/0',1)).toThrow('non_positive_base');
  expect(()=>roundPctRatio('0.05',1)).toThrow(/invalid_pct_ratio/);
 });
});
describe('numeric range guards',()=>{
 const tiny=`0.${'0'.repeat(323)}1`,huge=`1${'0'.repeat(309)}`;
 it('pctChange rejects operands that underflow or overflow Number, and non-finite results',()=>{
  expect(()=>pctChange(tiny,tiny)).toThrow('unsupported_numeric_range');
  expect(()=>pctChange('1',tiny)).toThrow('unsupported_numeric_range');
  expect(()=>pctChange(huge,'1')).toThrow('unsupported_numeric_range');
  expect(()=>pctChange('1',huge)).toThrow('unsupported_numeric_range');
  expect(()=>pctChange(`1${'0'.repeat(308)}`,'0.1')).toThrow('unsupported_numeric_range');   // finite operands, infinite quotient
  expect(pctChange('0','1')).toBe(-100);
  expect(pctRatio(tiny,tiny)).toBe(`${tiny}/${tiny}`);                         // the exact companion stays exact
  expect(roundPctRatio(pctRatio(tiny,tiny),1)).toBe('0.0');
 });
 it('quartiles / median / quantile7 reject non-finite values',()=>{
  expect(()=>quartiles([1,Number.NaN,3])).toThrow('unsupported_numeric_range');
  expect(()=>median([1,Number.POSITIVE_INFINITY])).toThrow('unsupported_numeric_range');
  expect(()=>quantile7([1,Number.NEGATIVE_INFINITY],0.5)).toThrow('unsupported_numeric_range');
  expect(()=>quantile7([1,2],Number.NaN)).toThrow('unsupported_numeric_range');
 });
});
describe('type-7 quartiles',()=>{
 it('matches the linear-interpolation definition',()=>{
  expect(quartiles([1,2,3,4,5])).toEqual({q1:2,median:3,q3:4});
  expect(quartiles([4,1,3,2])).toEqual({q1:1.75,median:2.5,q3:3.25});
  const q=quartiles([10,-5,0,2.5,7,3]);
  expect(q.q1).toBeCloseTo(0.625,12);expect(q.median).toBeCloseTo(2.75,12);expect(q.q3).toBeCloseTo(6,12);
  expect(median([7])).toBe(7);
 });
 it('rejects empty or unsorted input',()=>{
  expect(()=>quantile7([],0.5)).toThrow('quantile_empty');
  expect(()=>quantile7([2,1],0.5)).toThrow('quantile_unsorted');
 });
});
```

`src/lib/macro/strategy/manifest.test.ts`
```ts
// manifest.ts (spec §4.5 N1–N3): canonical hash, cutoff rules, snapshot roles, value rule, read states, frozen catalog.
import {describe,expect,it} from 'vitest';
import type {StrategyManifest} from './contract';
import {addMonthsDate,addMonthsYm,canonicalJson,dayDiff,inputRole,inputsWithRole,latestCutoff,manifestBuilder,manifestHash,monthCutoff,monthEnd,monthsBetween,pinSnapshots,prevMonth,readState,sha256Hex,SNAPSHOT_ROWS_PURPOSE,snapshotRoles} from './manifest';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {fixture,monthly,obs,snap} from './testing/fixture';

/** Port with some methods replaced (works for object or class ports). */
const override=(base:StrategyReadPort,over:Partial<StrategyReadPort>):StrategyReadPort=>new Proxy(base,{get:(t,k,r)=>k in over?(over as Record<PropertyKey,unknown>)[k]:Reflect.get(t,k,r)});
const NOW=new Date('2026-11-05T00:00:00Z');

describe('canonical JSON and hash',()=>{
 it('sorts keys, drops undefined, keeps array order, rejects non-finite numbers',()=>{
  expect(canonicalJson({b:1,a:[2,{d:undefined,c:'x'}]})).toBe('{"a":[2,{"c":"x"}],"b":1}');
  expect(()=>canonicalJson({a:Number.NaN})).toThrow(/canonical_json_unsupported/);
 });
 it('sha256Hex matches the FIPS 180-4 test vector and the manifest hash ignores key order',()=>{
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const a={kind:'transmission',params:{},cutoff:'c',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],catalog_version:'v',method_version:'m',code_version:'x'} as StrategyManifest;
  const b=JSON.parse(JSON.stringify({code_version:'x',method_version:'m',catalog_version:'v',inputs:[],reads:[],catalog:[],snapshots:{CN:null,US:null},cutoff:'c',params:{},kind:'transmission'})) as StrategyManifest;
  expect(manifestHash(a)).toBe(manifestHash(b));
  expect(manifestHash({...a,cutoff:'d'})).not.toBe(manifestHash(a));
  expect(manifestHash(a)).toMatch(/^[0-9a-f]{64}$/);
 });
});

describe('calendar helpers',()=>{
 it('month arithmetic and day differences',()=>{
  expect(addMonthsYm('2022-03',-1)).toBe('2022-02');expect(addMonthsYm('2022-11',3)).toBe('2023-02');
  expect(monthEnd('2024-02')).toBe('2024-02-29');expect(prevMonth('2026-01')).toBe('2025-12');
  expect(monthsBetween('2022-03','2023-07')).toBe(16);
  expect(dayDiff('2022-03-10','2022-03-17')).toBe(7);
  expect(addMonthsDate('2024-01-31',1)).toBe('2024-02-29');expect(addMonthsDate('2023-07-26',12)).toBe('2024-07-26');
 });
});

describe('cutoff rules',()=>{
 const us=snap('US','2026-11-03T06:02:00Z',[]),cn=snap('CN','2026-11-04T01:00:00Z',[]);
 it('latestCutoff = later created_at, else the one present, else request time',()=>{
  expect(latestCutoff({US:us,CN:cn},NOW)).toBe('2026-11-04T01:00:00Z');
  expect(latestCutoff({US:us,CN:null},NOW)).toBe('2026-11-03T06:02:00Z');
  expect(latestCutoff({US:null,CN:null},NOW)).toBe('2026-11-05T00:00:00.000Z');
 });
 it('monthCutoff is the 3rd of the next month 00:00:00Z; the baseline is the 3rd of the review month',()=>{
  expect(monthCutoff('2026-02')).toBe('2026-03-03T00:00:00Z');
  expect(monthCutoff('2026-12')).toBe('2027-01-03T00:00:00Z');
  expect(monthCutoff(prevMonth('2026-03'))).toBe('2026-03-03T00:00:00Z');
 });
 it('pinSnapshots fixes the requested snapshot and takes snapshotUpTo for the other region (ties → greatest snapshot_id)',async()=>{
  const cnA={...snap('CN','2026-11-02T00:00:00Z',[]),snapshot_id:'snap:CN:a'};
  const cnB={...snap('CN','2026-11-02T00:00:00Z',[]),snapshot_id:'snap:CN:b'};
  const cnLate=snap('CN','2026-11-04T00:00:00Z',[]);
  const failed=snap('US','2026-11-01T00:00:00Z',[],{status:'failed'});
  const port=memoryStrategyPort(fixture({snapshots:[us,cnA,cnB,cnLate,failed]}));
  const p=await pinSnapshots(port,us.snapshot_id);
  expect(p?.cutoff).toBe('2026-11-03T06:02:00Z');
  expect(p?.snapshots.US?.snapshot_id).toBe(us.snapshot_id);
  expect(p?.snapshots.CN?.snapshot_id).toBe('snap:CN:b');
  expect(await pinSnapshots(port,failed.snapshot_id)).toBeNull();
  expect(await pinSnapshots(port,'snap:none')).toBeNull();
 });
});

describe('snapshotRoles',()=>{
 it('latest = max period_end (highest version), prev = previous period, prev3m = 3 months earlier',()=>{
  const rows=[obs('US_CPI_YOY','2026-06-30','3.0'),obs('US_CPI_YOY','2026-08-31','2.8'),obs('US_CPI_YOY','2026-09-30','2.9'),obs('US_CPI_YOY','2026-09-30','3.1',{version:2})];
  const r=snapshotRoles(rows,()=>'month').get('US_CPI_YOY')!;
  expect(r.latest?.value_text).toBe('3.1');expect(r.prev?.period_end).toBe('2026-08-31');expect(r.prev3m?.period_end).toBe('2026-06-30');
 });
 it('quarterly prev3m is the previous quarter; daily has no prev3m; a missing 3-month row stays absent',()=>{
  const q=snapshotRoles([obs('CN_GDP_YOY','2026-06-30','5.2'),obs('CN_GDP_YOY','2026-09-30','4.8')],()=>'quarter').get('CN_GDP_YOY')!;
  expect(q.prev?.period_end).toBe('2026-06-30');expect(q.prev3m?.period_end).toBe('2026-06-30');
  const d=snapshotRoles([obs('X','2026-09-28','1'),obs('X','2026-06-28','1')],()=>'day').get('X')!;
  expect(d.prev3m).toBeUndefined();
  const m=snapshotRoles([obs('Y','2026-09-30','1'),obs('Y','2026-08-31','1')],()=>'month').get('Y')!;
  expect(m.prev3m).toBeUndefined();
 });
});

describe('manifestBuilder',()=>{
 const cpi=[obs('US_CPI_YOY','2026-08-31','2.8'),obs('US_CPI_YOY','2026-09-30','2.9')];
 const us=snap('US','2026-11-03T06:02:00Z',[cpi[1].observation_id],{historyIds:[cpi[0].observation_id]});
 const unrate=obs('US_UNRATE','2026-09-30','4.1',{availableAt:'2026-10-05T12:00:00Z'});
 const lateUnrate=obs('US_UNRATE','2026-10-31','4.2',{availableAt:'2026-11-06T12:00:00Z'});
 const f=fixture({snapshots:[us],observations:[...cpi,unrate,lateUnrate,...monthly('US_DGS10','2026-07',['4.2','4.3','4.1'])]});
 it('takes snapshot rows first (source snapshot) and falls back to latestObservations asOf cutoff (source history)',async()=>{
  const b=manifestBuilder(memoryStrategyPort(f),us.created_at);
  await b.useSnapshots({US:us,CN:null});
  expect((await b.snapshotValue('US_CPI_YOY','node',['prev']))?.value_text).toBe('2.9');
  expect((await b.snapshotValue('US_UNRATE','node'))?.value_text).toBe('4.1');   // 2026-10 row became available after the cutoff
  expect(await b.snapshotValue('US_PPI_FD_YOY','node')).toBeNull();
  const m=b.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(inputsWithRole(m,inputRole('node','US_CPI_YOY','latest'))[0].source).toEqual({kind:'snapshot',snapshot_id:us.snapshot_id});
  expect(inputsWithRole(m,inputRole('node','US_CPI_YOY','prev'))[0].period_end).toBe('2026-08-31');
  expect(inputsWithRole(m,inputRole('node','US_UNRATE','latest'))[0].source).toEqual({kind:'history',as_of:us.created_at});
  expect(readState(m,'US_PPI_FD_YOY','node')).toBe('missing');
  expect(readState(m,'US_CPI_YOY','node')).toBe('ok');
  expect(m.snapshots.US?.snapshot_id).toBe(us.snapshot_id);expect(m.snapshots.CN).toBeNull();
  expect(m.catalog.map(d=>d.id)).toEqual(['US_CPI_YOY','US_PPI_FD_YOY','US_UNRATE']);
  expect(m.catalog_version).toBe(f.catalogVersion);
 });
 it('history records ok / missing / truncated and keeps or drops inputs on request',async()=>{
  const b=manifestBuilder(memoryStrategyPort(f),'2026-11-03T06:02:00Z');
  expect((await b.history('US_DGS10','dim','month_end'))?.map(o=>o.value_text)).toEqual(['4.2','4.3','4.1']);
  expect(await b.history('US_WTI','dim','month_end')).toEqual([]);
  await b.history('US_DGS10','events','history',{keepInputs:false});
  const t=manifestBuilder(override(memoryStrategyPort(f),{seriesHistory:async()=>{throw new Error('truncated');}}),'2026-11-03T06:02:00Z');
  expect(await t.history('US_DGS10','dim','month_end')).toBeNull();
  const m=b.build({kind:'policy_response',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,'US_DGS10','dim')).toBe('ok');expect(readState(m,'US_WTI','dim')).toBe('missing');
  expect(inputsWithRole(m,inputRole('dim','US_DGS10','month_end'))).toHaveLength(3);
  expect(m.inputs.some(i=>i.role.startsWith('events:'))).toBe(false);
  expect(readState(t.build({kind:'policy_response',params:{},methodVersion:'m/1',codeVersion:'test'}),'US_DGS10','dim')).toBe('truncated');
 });
 it('latestObservations: a truncated read records truncated without inputs; an ordinary port error propagates',async()=>{
  const t=manifestBuilder(override(memoryStrategyPort(f),{latestObservations:async()=>{throw new Error('truncated');}}),'2026-11-03T06:02:00Z');
  expect(await t.snapshotValue('US_DGS10','node')).toBeNull();
  const m=t.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,'US_DGS10','node')).toBe('truncated');expect(m.inputs).toEqual([]);
  const down=manifestBuilder(override(memoryStrategyPort(f),{latestObservations:async()=>{throw new Error('connection reset');}}),'2026-11-03T06:02:00Z');
  await expect(down.snapshotValue('US_DGS10','node')).rejects.toThrow('connection reset');   // unavailable infrastructure is not incomplete evidence
 });
 it('history: an ordinary port error propagates and records no read state',async()=>{
  const down=manifestBuilder(override(memoryStrategyPort(f),{seriesHistory:async()=>{throw new Error('connection reset');}}),'2026-11-03T06:02:00Z');
  await expect(down.history('US_DGS10','dim','month_end')).rejects.toThrow('connection reset');
  expect(readState(down.build({kind:'policy_response',params:{},methodVersion:'m/1',codeVersion:'test'}),'US_DGS10','dim')).toBeNull();
 });
 it('useSnapshots({loadRows:false}) freezes the snapshot records without fetching observations',async()=>{
  let fetched=0;
  const port=override(memoryStrategyPort(f),{observationsByIds:async()=>{fetched++;return [];}});
  const b=manifestBuilder(port,us.created_at);
  await b.useSnapshots({US:us,CN:null},{loadRows:false});
  expect(fetched).toBe(0);
  const m=b.build({kind:'explain_facts',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(m.snapshots.US?.snapshot_id).toBe(us.snapshot_id);expect(m.snapshots.CN).toBeNull();
  expect(m.reads).toEqual([]);expect(m.inputs).toEqual([]);
 });
 it('an unresolved snapshot id makes the region incomplete: no promotion of the comparison row, no history fallback',async()=>{
  // the latest CPI row of the snapshot is gone (quarantined): only the 2026-08 comparison row resolves
  const gone=fixture({snapshots:[us],observations:[{...cpi[1],status:'quarantined'},cpi[0],unrate]});
  const b=manifestBuilder(memoryStrategyPort(gone),us.created_at);
  await b.useSnapshots({US:us,CN:null});
  expect(await b.snapshotValue('US_CPI_YOY','node',['prev'])).toBeNull();
  expect(await b.snapshotValue('US_UNRATE','node')).toBeNull();               // same region: incomplete too, no latestObservations fallback
  const m=b.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,'US_CPI_YOY','node')).toBe('truncated');
  expect(readState(m,us.snapshot_id,SNAPSHOT_ROWS_PURPOSE)).toBe('missing');
  expect(m.inputs).toEqual([]);                                               // 2026-08 is never reported as 'latest'
  const ok=manifestBuilder(memoryStrategyPort(f),us.created_at);await ok.useSnapshots({US:us,CN:null});
  expect(ok.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'}).reads).toEqual([]);   // fully resolved: no snapshot_rows read
 });
 it('keep freezes chosen history rows under <purpose>:<series>:<tag> with source history',async()=>{
  const b=manifestBuilder(memoryStrategyPort(f),'2026-11-03T06:02:00Z');
  const rows=(await b.history('US_DGS10','events','history',{keepInputs:false}))!;
  b.keep([rows[1]],'events','evidence');
  const m=b.build({kind:'cycle_table',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(m.inputs).toEqual([expect.objectContaining({role:inputRole('events','US_DGS10','evidence'),observation_id:rows[1].observation_id,source:{kind:'history',as_of:'2026-11-03T06:02:00Z'}})]);
 });
 it('is deterministic: same reads in another order give the same hash',async()=>{
  const p=memoryStrategyPort(f);
  const b1=manifestBuilder(p,us.created_at),b2=manifestBuilder(p,us.created_at);
  await b1.useSnapshots({US:us,CN:null});await b2.useSnapshots({US:us,CN:null});
  await b1.snapshotValue('US_CPI_YOY','node');await b1.snapshotValue('US_UNRATE','node');
  await b2.snapshotValue('US_UNRATE','node');await b2.snapshotValue('US_CPI_YOY','node');
  const a={kind:'transmission' as const,params:{},methodVersion:'m/1',codeVersion:'test'};
  expect(manifestHash(b1.build(a))).toBe(manifestHash(b2.build(a)));
 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/macro/strategy/numeric.test.ts src/lib/macro/strategy/manifest.test.ts`
Expected: FAIL — `Failed to resolve import "./numeric"` / `"./manifest"`.

- [ ] **Step 3: Implement**

`src/lib/macro/strategy/numeric.ts`
```ts
// src/lib/macro/strategy/numeric.ts
// Exact decimal arithmetic and descriptive statistics for P3/P4 (spec 2026-11-07 §5.6, §5.3, §5.5). P1 decimal.ts is not on
// main, so subtract / add / compare / sign / toBp work here on canonicalDecimal text as scaled BigInts (WP-S6 may swap in
// P1 decimal.ts). Floats appear only where §5.6 allows: pctChange (one Number() per operand, once) and the type-7
// quartiles over already computed raw changes. pctRatio is the exact companion of pctChange: facts and views keep the
// exact ratio text '<end>/<base>', and roundPctRatio rounds it once, at presentation (never a pre-rounded value).
import {canonicalDecimal} from '@/lib/facts/json-numbers';

interface Scaled{n:bigint;scale:number}
function scaled(raw:string):Scaled{
 const c=canonicalDecimal(raw);const neg=c.startsWith('-');const body=neg?c.slice(1):c;
 const dot=body.indexOf('.');const int=dot<0?body:body.slice(0,dot);const frac=dot<0?'':body.slice(dot+1);
 const n=BigInt(int+frac);
 return {n:neg?-n:n,scale:frac.length};
}
const pow10=(k:number)=>10n**BigInt(k);
function align(a:Scaled,b:Scaled):[bigint,bigint,number]{const s=Math.max(a.scale,b.scale);return [a.n*pow10(s-a.scale),b.n*pow10(s-b.scale),s];}
function fromScaled(n:bigint,scale:number):string{
 const neg=n<0n;let digits=(neg?-n:n).toString();
 if(scale>0){digits=digits.padStart(scale+1,'0');digits=`${digits.slice(0,-scale)}.${digits.slice(-scale)}`;}
 return canonicalDecimal(`${neg?'-':''}${digits}`);
}
export const canonical=canonicalDecimal;
export function compare(a:string,b:string):-1|0|1{const [x,y]=align(scaled(a),scaled(b));return x<y?-1:x>y?1:0;}
export function subtract(a:string,b:string):string{const [x,y,s]=align(scaled(a),scaled(b));return fromScaled(x-y,s);}
export function add(a:string,b:string):string{const [x,y,s]=align(scaled(a),scaled(b));return fromScaled(x+y,s);}
export const sign=(v:string):-1|0|1=>{const c=canonicalDecimal(v);return c==='0'?0:c.startsWith('-')?-1:1;};
/** Exact decimal × 100 (percentage points → basis points), same as P2 events.ts toBp. */
export const toBp=(delta:string):string=>canonicalDecimal(`${canonicalDecimal(delta)}e2`);
/** Simple % change (end/base − 1) × 100 as a full-precision double: the one float step §5.6 allows. base ≤ 0 → throws non_positive_base;
 *  operands or a result outside the double range → throws unsupported_numeric_range. */
export function pctChange(end:string,base:string):number{
 if(sign(base)<=0)throw new Error('non_positive_base');
 const e=Number(canonicalDecimal(end)),b=Number(canonicalDecimal(base));
 if(!Number.isFinite(e)||!Number.isFinite(b)||b<=0)throw new Error('unsupported_numeric_range');   // underflow to 0 / overflow to Infinity
 const r=(e/b-1)*100;
 if(!Number.isFinite(r))throw new Error('unsupported_numeric_range');
 return r;
}
/** Exact form of the same change: the ratio text '<end>/<base>' (canonical decimals). base ≤ 0 → throws non_positive_base. */
export function pctRatio(end:string,base:string):string{
 if(sign(base)<=0)throw new Error('non_positive_base');
 return `${canonicalDecimal(end)}/${canonicalDecimal(base)}`;
}
const RATIO=/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/;
/** (end/base − 1) × 100 of a pctRatio text, rounded once, half away from zero, to exactly dp places (BigInt, no float);
 *  a zero result carries no sign. 100 → 100.04996 at dp 1 is '0.0' (true change 0.04996 %). */
export function roundPctRatio(ratio:string,dp:number):string{
 const m=RATIO.exec(ratio);if(!m)throw new Error(`invalid_pct_ratio:${ratio}`);
 const [e,b]=align(scaled(m[1]),scaled(m[2]));if(b<=0n)throw new Error('non_positive_base');
 const num=(e-b)*100n*pow10(dp);const abs=num<0n?-num:num;
 let q=abs/b;if((abs%b)*2n>=b)q+=1n;
 let digits=q.toString();
 if(dp>0){digits=digits.padStart(dp+1,'0');digits=`${digits.slice(0,-dp)}.${digits.slice(-dp)}`;}
 return num<0n&&q!==0n?`-${digits}`:digits;
}
/** Type-7 quantile of an ascending, non-empty array: h=(n−1)p, q=x[⌊h⌋]+(h−⌊h⌋)(x[⌊h⌋+1]−x[⌊h⌋]). */
export function quantile7(sorted:readonly number[],p:number):number{
 if(sorted.length===0)throw new Error('quantile_empty');
 if(!Number.isFinite(p)||sorted.some(v=>!Number.isFinite(v)))throw new Error('unsupported_numeric_range');
 for(let i=1;i<sorted.length;i++)if(sorted[i]<sorted[i-1])throw new Error('quantile_unsorted');
 const h=(sorted.length-1)*p;const lo=Math.floor(h);
 if(lo+1>=sorted.length)return sorted[lo];
 return sorted[lo]+(h-lo)*(sorted[lo+1]-sorted[lo]);
}
export function quartiles(values:readonly number[]):{q1:number;median:number;q3:number}{
 if(values.some(v=>!Number.isFinite(v)))throw new Error('unsupported_numeric_range');
 const s=[...values].sort((a,b)=>a-b);
 return {q1:quantile7(s,0.25),median:quantile7(s,0.5),q3:quantile7(s,0.75)};
}
export const median=(values:readonly number[]):number=>quartiles(values).median;
```

`src/lib/macro/strategy/manifest.ts`
```ts
// src/lib/macro/strategy/manifest.ts
// Strategy manifests (spec 2026-11-07 §4.5, draft 3 N1–N3): the single frozen input of every P3/P4 computation.
// - identity: manifest_hash = sha256Hex(canonicalJson(body)) over the whole body (kind, params, cutoff, frozen snapshots,
//   catalog projection, rules, read states, inputs, events, versions).
// - cutoff rules: latestCutoff (transmission / matrix / history: later of the two active snapshots, else request time),
//   monthCutoff (review: the 3rd of the next month 00:00:00Z, spec §6.2), pinSnapshots (snapshot explanation: the requested
//   snapshot fixes the cutoff, the other region = snapshotUpTo(cutoff)).
// - snapshot roles: per series in observation_ids ∪ history_ids, max period_end = 'latest', the previous period = 'prev',
//   the period 3 months earlier = 'prev3m' (quarterly: previous quarter); other rows stay out of the manifest. A snapshot
//   id that observationsByIds does not return (unknown or no longer ok) makes that region's snapshot incomplete (spec §4.3:
//   a missing referenced id is missing): every snapshot value of the region is then recorded 'truncated' and returns null —
//   a comparison row is never promoted to 'latest', and the region never falls back to latestObservations.
// - value rule: a series in its region's snapshot → that row (source snapshot); else latestObservations asOf cutoff
//   (source history). History windows → seriesHistory asOf cutoff; 'truncated' is recorded as a read state, never thrown.
// Builders read only through StrategyReadPort; views read only the manifest (replay never touches the port or catalog).
import type {FrozenSeriesDef,FrozenSnapshot,InputSource,ManifestInput,ManifestKind,ManifestRead,MacroSeriesDef,ObsRef,ObservationRow,Region,SnapshotRecord,SnapshotRole,StrategyManifest} from './contract';
import {canonicalJson,sha256Hex} from './hash';
import type {StrategyReadPort} from './port';

// ---------------------------------------------------------------- canonical JSON + hash (defined in hash.ts, Task 3; re-exported)
export {canonicalJson,sha256Hex};
export const manifestHash=(body:StrategyManifest):string=>sha256Hex(canonicalJson(body));

// ---------------------------------------------------------------- calendar (UTC dates as YYYY-MM-DD, months as YYYY-MM)
const ymParts=(ym:string):[number,number]=>{const m=/^(\d{4})-(\d{2})$/.exec(ym);if(!m)throw new Error(`invalid_month:${ym}`);return [Number(m[1]),Number(m[2])];};
/** The UTC calendar date (YYYY-MM-DD) of an ISO timestamp, whatever offset it is written with; the only way a cutoff becomes a date. */
export function utcDate(iso:string):string{const t=Date.parse(iso);if(!Number.isFinite(t))throw new Error(`invalid_timestamp:${iso}`);return new Date(t).toISOString().slice(0,10);}
export const monthOf=(date:string):string=>date.slice(0,7);
export function addMonthsYm(ym:string,n:number):string{const [y,m]=ymParts(ym);const t=y*12+(m-1)+n;return `${String(Math.floor(t/12)).padStart(4,'0')}-${String(t%12+1).padStart(2,'0')}`;}
export function monthEnd(ym:string):string{const [y,m]=ymParts(ym);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
export const prevMonth=(ym:string):string=>addMonthsYm(ym,-1);
/** Calendar months between two 'YYYY-MM' (b − a). */
export function monthsBetween(a:string,b:string):number{const [ya,ma]=ymParts(a),[yb,mb]=ymParts(b);return (yb*12+mb)-(ya*12+ma);}
/** Whole days b − a between two YYYY-MM-DD dates. */
export const dayDiff=(a:string,b:string):number=>Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000);
/** Same day n months later, clamped to the month end (2024-01-31 + 1 → 2024-02-29). */
export function addMonthsDate(date:string,n:number):string{
 const ym=addMonthsYm(monthOf(date),n);const end=monthEnd(ym);const day=date.slice(8,10);
 return day>end.slice(8,10)?end:`${ym}-${day}`;
}

// ---------------------------------------------------------------- cutoff rules (§4.5)
const later=(a:string,b:string)=>Date.parse(b)>Date.parse(a)?b:a;
/** Transmission / policy response / cycle table: later created_at of the two snapshots; one missing → the other; none → request time. */
export function latestCutoff(s:{US:SnapshotRecord|null;CN:SnapshotRecord|null},now:Date):string{
 if(s.US&&s.CN)return later(s.US.created_at,s.CN.created_at);
 return s.US?.created_at??s.CN?.created_at??now.toISOString();
}
/** Review (spec §6.2): the 3rd of the next month, 00:00:00Z — month-end derived observations first appear in the next month and
 *  the cron runs on the 3rd. Baseline = monthCutoff(prevMonth(month)) = the 3rd of the review month. The compared data periods
 *  stay month end vs month end; the cutoff only decides what was known. */
export const monthCutoff=(month:string):string=>`${addMonthsYm(month,1)}-03T00:00:00Z`;
const OTHER:Record<Region,Region>={US:'CN',CN:'US'};
/** Snapshot explanation (N1): the requested snapshot is its region's snapshot and fixes the cutoff; the other region = snapshotUpTo(cutoff). null = unknown or failed snapshot. */
export async function pinSnapshots(port:StrategyReadPort,snapshotId:string):Promise<{cutoff:string;snapshots:{US:SnapshotRecord|null;CN:SnapshotRecord|null}}|null>{
 const rec=await port.snapshot(snapshotId);
 if(!rec||rec.status==='failed')return null;
 const other=await port.snapshotUpTo(OTHER[rec.region],rec.created_at);
 return {cutoff:rec.created_at,snapshots:rec.region==='US'?{US:rec,CN:other}:{US:other,CN:rec}};
}

// ---------------------------------------------------------------- frozen projections and roles
export const freezeSnapshot=(r:SnapshotRecord):FrozenSnapshot=>({snapshot_id:r.snapshot_id,created_at:r.created_at,as_of:r.as_of,catalog_counts:{...r.catalog_counts},observation_ids:[...r.observation_ids],history_ids:[...r.history_ids]});
export function freezeDef(d:MacroSeriesDef):FrozenSeriesDef{
 const out:FrozenSeriesDef={id:d.id,region:d.region,role:d.role,type:d.type,name:{...d.name},unit:d.unit,status:d.status,changeKind:d.changeKind,nativeFrequency:d.nativeFrequency,period:d.period};
 if(d.reason)out.reason={...d.reason};
 if(d.aliasOf)out.aliasOf=d.aliasOf;
 if(d.derive)out.derive={...d.derive};
 if(d.releaseLagDays!==undefined)out.releaseLagDays=d.releaseLagDays;
 return out;
}
/** Role of each snapshot observation per series (N1). period decides prev3m: month/quarter → month end 3 months before latest; day → none. */
export function snapshotRoles(rows:readonly ObservationRow[],periodOf:(seriesId:string)=>'day'|'month'|'quarter'):Map<string,Partial<Record<SnapshotRole,ObservationRow>>>{
 const bySeries=new Map<string,Map<string,ObservationRow>>();
 for(const r of rows){
  const m=bySeries.get(r.series_id)??new Map<string,ObservationRow>();bySeries.set(r.series_id,m);
  const cur=m.get(r.period_end);if(!cur||cur.version<r.version)m.set(r.period_end,r);
 }
 const out=new Map<string,Partial<Record<SnapshotRole,ObservationRow>>>();
 for(const [id,m] of bySeries){
  const desc=[...m.values()].sort((a,b)=>a.period_end<b.period_end?1:a.period_end>b.period_end?-1:0);
  const roles:Partial<Record<SnapshotRole,ObservationRow>>={latest:desc[0]};
  if(desc[1])roles.prev=desc[1];
  if(periodOf(id)!=='day'){const target=monthEnd(addMonthsYm(monthOf(desc[0].period_end),-3));const r3=m.get(target);if(r3)roles.prev3m=r3;}
  out.set(id,roles);
 }
 return out;
}

// ---------------------------------------------------------------- input roles and manifest readers
export type InputTag=SnapshotRole|'base'|'end'|'from'|'to'|'month_end'|'history'|'evidence';
/** '<purpose>:<series_id>:<tag>' — every writer uses this helper. 'month_end' / 'history' tag whole monthly / daily windows;
 *  'evidence' tags single event-source rows (policy-events.ts). */
export const inputRole=(purpose:string,seriesId:string,tag:InputTag):string=>`${purpose}:${seriesId}:${tag}`;
export const toObsRef=(i:ManifestInput):ObsRef=>({observation_id:i.observation_id,series_id:i.series_id,period_end:i.period_end,value_text:i.value_text,version:i.version,available_at:i.available_at,source:i.source});
/** Inputs with this exact role, ascending period_end. */
export const inputsWithRole=(m:StrategyManifest,role:string):ManifestInput[]=>m.inputs.filter(i=>i.role===role).sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0);
export const frozenDef=(m:StrategyManifest,id:string):FrozenSeriesDef|null=>m.catalog.find(d=>d.id===id)??null;
export const readState=(m:StrategyManifest,seriesId:string,purpose:string):ManifestRead['state']|null=>m.reads.find(r=>r.series_id===seriesId&&r.purpose===purpose)?.state??null;

// ---------------------------------------------------------------- builder
export const HISTORY_MAX_ROWS=10000;
export interface ManifestBuilder{
 readonly port:StrategyReadPort;readonly cutoff:string;
 /** Catalog row by id, frozen into manifest.catalog on first use; null when the live catalog has no such id. */
 def(id:string):FrozenSeriesDef|null;
 /** Freeze the two snapshots; unless loadRows=false, load their observations (one observationsByIds per snapshot) for snapshotValue.
  *  Unresolved ids → read {series_id: snapshot_id, purpose: 'snapshot_rows', state: 'missing'} and the region is incomplete. */
 useSnapshots(s:{US:SnapshotRecord|null;CN:SnapshotRecord|null},opts?:{loadRows?:boolean}):Promise<void>;
 /** Latest value of a series (§4.5 value rule) plus the requested comparison roles from the snapshot; records one read.
  *  Region snapshot incomplete → 'truncated', null. */
 snapshotValue(seriesId:string,purpose:string,comparison?:readonly Exclude<SnapshotRole,'latest'>[]):Promise<ObservationRow|null>;
 /** Whole history asOf cutoff (highest version per period). keepInputs=false records only the read state (event sources). null = truncated. */
 history(seriesId:string,purpose:string,tag:'month_end'|'history',opts?:{from?:string;to?:string;keepInputs?:boolean}):Promise<ObservationRow[]|null>;
 /** Freeze chosen rows of a history read (source history asOf cutoff) under '<purpose>:<series>:<tag>'. */
 keep(rows:readonly ObservationRow[],purpose:string,tag:InputTag):void;
 build(a:{kind:ManifestKind;params:Record<string,string|number>;methodVersion:string;codeVersion:string;extra?:Pick<StrategyManifest,'baseline'|'rules'|'events'|'gaps'|'timeliness'>}):StrategyManifest;
}
const isTruncated=(e:unknown)=>e instanceof Error&&e.message==='truncated';
export const SNAPSHOT_ROWS_PURPOSE='snapshot_rows';
export function manifestBuilder(port:StrategyReadPort,cutoff:string):ManifestBuilder{
 const live=new Map(port.catalog().map(d=>[d.id,d]));
 const catalog=new Map<string,FrozenSeriesDef>();
 const reads=new Map<string,ManifestRead>();
 const inputs=new Map<string,ManifestInput>();
 let snapshots:{US:FrozenSnapshot|null;CN:FrozenSnapshot|null}={US:null,CN:null};
 const roles:Record<Region,Map<string,Partial<Record<SnapshotRole,ObservationRow>>>>={US:new Map(),CN:new Map()};
 const incomplete:Record<Region,boolean>={US:false,CN:false};
 const def=(id:string)=>{const d=live.get(id);if(!d)return null;let f=catalog.get(id);if(!f){f=freezeDef(d);catalog.set(id,f);}return f;};
 const read=(series_id:string,purpose:string,state:ManifestRead['state'])=>{reads.set(`${purpose}|${series_id}`,{series_id,purpose,state});};
 const put=(o:ObservationRow,role:string,source:InputSource)=>{
  inputs.set(`${role}|${o.observation_id}`,{series_id:o.series_id,role,observation_id:o.observation_id,period_end:o.period_end,value_text:o.value_text,version:o.version,available_at:o.available_at,source});
 };
 const periodOf=(id:string)=>live.get(id)?.period??'month';
 return {
  port,cutoff,def,
  async useSnapshots(s,opts={}){
   snapshots={US:s.US?freezeSnapshot(s.US):null,CN:s.CN?freezeSnapshot(s.CN):null};
   if(opts.loadRows===false)return;
   for(const r of ['US','CN'] as const){
    const rec=s[r];incomplete[r]=false;
    if(!rec){roles[r]=new Map();continue;}
    const ids=[...new Set([...rec.observation_ids,...rec.history_ids])];
    const rows=await port.observationsByIds(ids);
    const found=new Set(rows.map(o=>o.observation_id));
    if(ids.some(id=>!found.has(id))){incomplete[r]=true;read(rec.snapshot_id,SNAPSHOT_ROWS_PURPOSE,'missing');}
    roles[r]=snapshotRoles(rows,periodOf);
   }
  },
  async snapshotValue(seriesId,purpose,comparison=[]){
   const d=def(seriesId);
   const snapRec=d?snapshots[d.region]:null;
   if(d&&snapRec&&incomplete[d.region]){read(seriesId,purpose,'truncated');return null;}
   const r=d?roles[d.region].get(seriesId):undefined;
   if(snapRec&&r?.latest){
    const source:InputSource={kind:'snapshot',snapshot_id:snapRec.snapshot_id};
    put(r.latest,inputRole(purpose,seriesId,'latest'),source);
    for(const c of comparison){const o=r[c];if(o)put(o,inputRole(purpose,seriesId,c),source);}
    read(seriesId,purpose,'ok');return r.latest;
   }
   let rows:ObservationRow[];
   try{rows=await port.latestObservations([seriesId],{asOf:cutoff});}
   catch(e){if(isTruncated(e)){read(seriesId,purpose,'truncated');return null;}throw e;}
   const o=rows.find(x=>x.series_id===seriesId)??null;
   if(!o){read(seriesId,purpose,'missing');return null;}
   put(o,inputRole(purpose,seriesId,'latest'),{kind:'history',as_of:cutoff});read(seriesId,purpose,'ok');
   return o;
  },
  async history(seriesId,purpose,tag,opts={}){
   def(seriesId);
   let rows:ObservationRow[];
   try{rows=await port.seriesHistory(seriesId,{from:opts.from,to:opts.to,asOf:cutoff,maxRows:HISTORY_MAX_ROWS});}
   catch(e){if(isTruncated(e)){read(seriesId,purpose,'truncated');return null;}throw e;}
   read(seriesId,purpose,rows.length?'ok':'missing');
   if(opts.keepInputs!==false)for(const o of rows)put(o,inputRole(purpose,seriesId,tag),{kind:'history',as_of:cutoff});
   return rows;
  },
  keep(rows,purpose,tag){for(const o of rows){def(o.series_id);put(o,inputRole(purpose,o.series_id,tag),{kind:'history',as_of:cutoff});}},
  build(a){
   const byKey=<T>(k:(x:T)=>string)=>(x:T,y:T)=>k(x)<k(y)?-1:k(x)>k(y)?1:0;
   return {
    kind:a.kind,params:{...a.params},cutoff,snapshots,...(a.extra??{}),
    catalog:[...catalog.values()].sort(byKey(d=>d.id)),
    reads:[...reads.values()].sort(byKey(r=>`${r.purpose}|${r.series_id}`)),
    inputs:[...inputs.values()].sort(byKey(i=>`${i.role}|${i.period_end}|${i.observation_id}`)),
    catalog_version:port.catalogVersion(),method_version:a.methodVersion,code_version:a.codeVersion,
   };
  },
 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/macro/strategy/numeric.test.ts src/lib/macro/strategy/manifest.test.ts`
Expected: PASS (11 + 16 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no warnings.

- [ ] **Step 6: Commit**
```bash
git add src/lib/macro/strategy/numeric.ts src/lib/macro/strategy/numeric.test.ts src/lib/macro/strategy/manifest.ts src/lib/macro/strategy/manifest.test.ts
```
```bash
git commit -F - <<'EOF'
feat(macro-strategy): exact decimals, type-7 quartiles, canonical manifest hash and builder

numeric.ts: BigInt-scaled subtract/add/compare/sign/toBp over canonicalDecimal text,
pctChange (single float step) with the exact pctRatio rounded once by
roundPctRatio, type-7 quartiles (spec §5.6). Unresolved snapshot ids make a
region incomplete; keep() freezes chosen history rows.
manifest.ts: canonicalJson + sha256Hex, cutoff rules (latest / month / pinned
snapshot), snapshot roles latest/prev/prev3m, value rule snapshot-then-history,
read states ok/missing/truncated, deterministic manifestBuilder (spec §4.5 N1-N3).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


### Task 5: Policy event merge across the 2008 single-target → range switch

**Files:**
- Create: `src/lib/macro/strategy/policy-events.ts`, `src/lib/macro/strategy/policy-events.test.ts`

Design decisions (spec §5.4, N9):
- From 2008-12-16 the P2 derivation (`port.derivePolicyEvents`) is used unchanged; each result gets `basis:'range'` and keeps its own `version`.
- Single-target era: neighbouring `US_FED_TARGET_D` rows with different values (decimal compare) → event on the later date, `upper = lower = single target`, `change_bp = toBp(cur − prev)`, `evidence=[prev,cur,prev,cur]`, `version = VERSIONS.events`, `basis:'single_target'`.
- The switch is attempted when the single-target input is non-empty or the range input starts on/before 2008-12-16. It needs exactly: last single-target row dated `2008-12-15`, first upper and first lower rows dated `2008-12-16`. Then one `single_to_range` event on 2008-12-16 with `upper_from = lower_from = s`, `upper_to = u`, `lower_to = l`, `change_bp = toBp(u − s)` (the lower move when the upper did not move, mirroring P2), `evidence=[s,u,s,l]`; the event is emitted unconditionally once the three dates verify, also when `s = u = l` (`change_bp:'0'`; no value-change condition, Codex Task 5 #1). Otherwise no event and one gap `{kind:'transition_unverified', reason:<all failing checks joined by ';'>, near:'2008-12-16'}`. A range history that starts after 2008-12-16 with no single-target rows needs no switch (the data simply starts later).
- `readPolicyEvents(builder)` reads the three histories with purpose `events` and `keepInputs:false`, then freezes (builder `keep`, tag `evidence`) every evidence row of every merged event plus the transition tuple, so each event re-derives and verifies from the manifest alone (plan audit #4); any truncated read → `{events:[],gaps:[{kind:'history_truncated',reason:<truncated series ids>,near:<cutoff date>}]}` (the Task 7 view turns that into missing cells, the Task 8 view and the Task 9 review show the truncation explicitly).
- The switch event's `change_bp` is always `toBp(u − s)` from the upper bound (spec §5.4; plan audit #13): an unchanged upper with a moved lower, or `s = u = l`, is a 0 bp event, which episodes and the matrix skip (Task 7/8 filter `sign(change_bp)!==0` before direction logic).

- [ ] **Step 1: Write the failing test**

`src/lib/macro/strategy/policy-events.test.ts`
```ts
// policy-events.ts (spec §5.4 N9): single-target events, the exact-date 2008-12-15/16 switch, gaps, P2 range events, reads.
import {describe,expect,it} from 'vitest';
import {VERSIONS} from './contract';
import type {EventInput,StrategyPolicyEvent} from './contract';
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {inputRole,manifestBuilder,readState} from './manifest';
import {subtract,toBp} from './numeric';
import {EVENTS_PURPOSE,mergePolicyEvents,readPolicyEvents,US_TARGET_LOWER_ID,US_TARGET_SINGLE_ID,US_TARGET_UPPER_ID} from './policy-events';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {daily,fedTargetFixture,fixture} from './testing/fixture';

const row=(id:string,d:string,v:string):EventInput=>({observation_id:id,period_end:d,value_text:v});
const PORT=memoryStrategyPort(fixture());
const derive=(u:readonly EventInput[],l:readonly EventInput[])=>PORT.derivePolicyEvents(u,l);
const override=(base:StrategyReadPort,over:Partial<StrategyReadPort>):StrategyReadPort=>new Proxy(base,{get:(t,k,r)=>k in over?(over as Record<PropertyKey,unknown>)[k]:Reflect.get(t,k,r)});
const SINGLE=[row('s1','2008-10-07','2'),row('s2','2008-10-08','1.5'),row('s3','2008-10-29','1'),row('s4','2008-12-15','1.00')];
const UPPER=[row('u1','2008-12-16','0.25'),row('u2','2015-12-17','0.5')];
const LOWER=[row('l1','2008-12-16','0'),row('l2','2015-12-17','0.25')];
const brief=(e:StrategyPolicyEvent)=>[e.effective_date,e.basis,e.change_bp];

describe('mergePolicyEvents',()=>{
 it('emits single-target events, one verified switch event and the P2 range events, ascending',()=>{
  const r=mergePolicyEvents(derive,SINGLE,UPPER,LOWER);
  expect(r.gaps).toEqual([]);
  expect(r.events.map(brief)).toEqual([['2008-10-08','single_target','-50'],['2008-10-29','single_target','-50'],['2008-12-16','single_to_range','-75'],['2015-12-17','range','25']]);
  expect(r.events[0]).toEqual({kind:'policy_target_change',region:'US',effective_date:'2008-10-08',upper_from:'2',upper_to:'1.5',lower_from:'2',lower_to:'1.5',change_bp:'-50',source:'derived',evidence:['s1','s2','s1','s2'],version:VERSIONS.events,basis:'single_target'});
  expect(r.events[2]).toEqual({kind:'policy_target_change',region:'US',effective_date:'2008-12-16',upper_from:'1',upper_to:'0.25',lower_from:'1',lower_to:'0',change_bp:'-75',source:'derived',evidence:['s4','u1','s4','l1'],version:VERSIONS.events,basis:'single_to_range'});
 });
 it('reads the switch values from the observations, not from constants',()=>{
  const r=mergePolicyEvents(derive,[row('s','2008-12-15','1.25')],[row('u','2008-12-16','0.5')],[row('l','2008-12-16','0.25')]);
  expect(r.events.map(e=>[e.upper_from,e.upper_to,e.lower_to,e.change_bp])).toEqual([['1.25','0.5','0.25','-75']]);
 });
 it('switch change_bp always comes from the upper bound: unchanged upper, moved lower → a 0 bp event (no invented direction)',()=>{
  const r=mergePolicyEvents(derive,[row('s','2008-12-15','1')],[row('u','2008-12-16','1')],[row('l','2008-12-16','0.75')]);
  expect(r.events.map(e=>[e.basis,e.upper_to,e.lower_to,e.change_bp])).toEqual([['single_to_range','1','0.75','0']]);
  expect(r.gaps).toEqual([]);
 });
 it('a verified switch with s = u = l is still a transition event, with change_bp 0 and no gap',()=>{
  const r=mergePolicyEvents(derive,[row('s','2008-12-15','1')],[row('u','2008-12-16','1.0')],[row('l','2008-12-16','1')]);
  expect(r.gaps).toEqual([]);
  expect(r.events).toEqual([{kind:'policy_target_change',region:'US',effective_date:'2008-12-16',upper_from:'1',upper_to:'1',lower_from:'1',lower_to:'1',change_bp:'0',source:'derived',evidence:['s','u','s','l'],version:VERSIONS.events,basis:'single_to_range'}]);
 });
 it.each([
  ['upper starts a day late',SINGLE,[row('u1','2008-12-17','0.25')],LOWER,'upper_first_not_2008-12-16'],
  ['lower missing',SINGLE,UPPER,[],'lower_missing'],
  ['single target ends early',SINGLE.slice(0,3),UPPER,LOWER,'single_target_last_not_2008-12-15'],
  ['single target absent while the range starts at the switch',[],UPPER,LOWER,'single_target_missing'],
 ])('%s → no switch event, explicit gap',(_n,s,u,l,reason)=>{
  const r=mergePolicyEvents(derive,s,u,l);
  expect(r.events.some(e=>e.basis==='single_to_range')).toBe(false);
  expect(r.gaps).toHaveLength(1);
  expect(r.gaps[0].kind).toBe('transition_unverified');expect(r.gaps[0].near).toBe('2008-12-16');expect(r.gaps[0].reason).toContain(reason);
 });
 it('a range history that starts after the switch with no single target needs no switch',()=>{
  const r=mergePolicyEvents(derive,[],[row('u1','2015-12-16','0.25'),row('u2','2015-12-17','0.5')],[row('l1','2015-12-16','0'),row('l2','2015-12-17','0.25')]);
  expect(r).toEqual({events:[expect.objectContaining({effective_date:'2015-12-17',basis:'range',change_bp:'25'})],gaps:[]});
 });
 it('rejects unsorted input and is deterministic',()=>{
  expect(()=>mergePolicyEvents(derive,[SINGLE[1],SINGLE[0]],UPPER,LOWER)).toThrow(/events_unsorted:single/);
  expect(JSON.stringify(mergePolicyEvents(derive,SINGLE,UPPER,LOWER))).toBe(JSON.stringify(mergePolicyEvents(derive,[...SINGLE],[...UPPER],[...LOWER])));
 });
});

describe('readPolicyEvents',()=>{
 it('reads the three sources asOf the cutoff and finds the verified switch in the Fed fixture',async()=>{
  const b=manifestBuilder(memoryStrategyPort(fixture({observations:fedTargetFixture()})),'2026-11-03T00:00:00Z');
  const r=await readPolicyEvents(b);
  expect(r.gaps).toEqual([]);
  const sw=r.events.filter(e=>e.basis==='single_to_range');
  expect(sw).toHaveLength(1);expect(sw[0].effective_date).toBe('2008-12-16');
  expect(r.events.every(e=>e.basis==='range'?e.effective_date>'2008-12-16':e.effective_date<='2008-12-16')).toBe(true);
  const m=b.build({kind:'cycle_table',params:{boundary:'event_day'},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,US_TARGET_SINGLE_ID,EVENTS_PURPOSE)).toBe('ok');
 });
 it('freezes exactly the rows that derive and verify every event, including the transition tuple',async()=>{
  const b=manifestBuilder(memoryStrategyPort(fixture({observations:fedTargetFixture()})),'2026-11-03T00:00:00Z');
  const r=await readPolicyEvents(b);
  const m=b.build({kind:'cycle_table',params:{boundary:'event_day'},methodVersion:'m/1',codeVersion:'test'});
  const byId=new Map(m.inputs.map(i=>[i.observation_id,i]));
  for(const e of r.events)for(const id of e.evidence)expect(byId.has(id),`${e.effective_date} evidence ${id}`).toBe(true);
  for(const e of r.events){   // each event re-derives from its frozen evidence rows alone
   const [uf,ut,lf,lt]=e.evidence.map(id=>byId.get(id)!.value_text);
   expect([uf,ut,lf,lt].map(canonicalDecimal)).toEqual([e.upper_from,e.upper_to,e.lower_from,e.lower_to]);   // exact canonical endpoints, no Number()
   const du=subtract(ut,uf),dl=subtract(lt,lf);
   expect(e.change_bp).toBe(toBp(e.basis==='range'&&du==='0'?dl:du));   // recomputed exactly from the frozen rows (P2: the lower move only when the upper did not move)
  }
  const tuple=m.inputs.filter(i=>i.period_end==='2008-12-15'||i.period_end==='2008-12-16').map(i=>i.role).sort();
  expect(tuple).toEqual([inputRole(EVENTS_PURPOSE,US_TARGET_SINGLE_ID,'evidence'),inputRole(EVENTS_PURPOSE,US_TARGET_LOWER_ID,'evidence'),inputRole(EVENTS_PURPOSE,US_TARGET_UPPER_ID,'evidence')].sort());
  expect(m.inputs.every(i=>i.role.endsWith(':evidence')&&i.source.kind==='history')).toBe(true);
  expect(m.inputs.length).toBe(new Set(r.events.flatMap(e=>[...e.evidence])).size);   // the tuple rows are evidence of the switch event here
 });
 it('an unverified transition still retains the transition tuple rows, and emits a gap instead of an event',async()=>{
  const obs=[...daily(US_TARGET_SINGLE_ID,[['2008-12-12','1.5'],['2008-12-15','1']]),...daily(US_TARGET_UPPER_ID,[['2008-12-17','0.25']]),...daily(US_TARGET_LOWER_ID,[['2008-12-17','0']])];
  const b=manifestBuilder(memoryStrategyPort(fixture({observations:obs})),'2026-11-03T00:00:00Z');
  const r=await readPolicyEvents(b);
  expect(r.events.some(e=>e.basis==='single_to_range')).toBe(false);
  expect(r.gaps).toEqual([expect.objectContaining({kind:'transition_unverified',near:'2008-12-16'})]);
  const m=b.build({kind:'cycle_table',params:{boundary:'event_day'},methodVersion:'m/1',codeVersion:'test'});
  const byRole=(id:string)=>m.inputs.filter(i=>i.role===inputRole(EVENTS_PURPOSE,id,'evidence')).map(i=>i.period_end);
  expect(byRole(US_TARGET_SINGLE_ID)).toEqual(['2008-12-12','2008-12-15']);   // the last single-target row is kept although no event uses it for the switch
  expect(byRole(US_TARGET_UPPER_ID)).toEqual(['2008-12-17']);
  expect(byRole(US_TARGET_LOWER_ID)).toEqual(['2008-12-17']);
 });
 it('a truncated source gives no events, a history_truncated gap and a truncated read state',async()=>{
  const obs=daily('US_FED_TARGET_D',[['2008-12-15','1']]);
  const port=override(memoryStrategyPort(fixture({observations:obs})),{seriesHistory:async(id)=>{if(id===US_TARGET_SINGLE_ID)throw new Error('truncated');return [];}});
  const b=manifestBuilder(port,'2026-11-03T00:00:00Z');
  expect(await readPolicyEvents(b)).toEqual({events:[],gaps:[{kind:'history_truncated',reason:US_TARGET_SINGLE_ID,near:'2026-11-03'}]});
  expect(readState(b.build({kind:'cycle_table',params:{boundary:'event_day'},methodVersion:'m/1',codeVersion:'test'}),US_TARGET_SINGLE_ID,EVENTS_PURPOSE)).toBe('truncated');
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/macro/strategy/policy-events.test.ts`
Expected: FAIL — `Failed to resolve import "./policy-events"`.

- [ ] **Step 3: Implement**

`src/lib/macro/strategy/policy-events.ts`
```ts
// src/lib/macro/strategy/policy-events.ts
// US policy events across the 2008 regime change (spec 2026-11-07 §5.4, version macro-strategy-events/1).
// - from 2008-12-16: the P2 derivation over the target range (port.derivePolicyEvents), unchanged, basis 'range';
// - single-target era: neighbouring US_FED_TARGET_D observations whose values differ → one event on the later date,
//   upper = lower = the single target, evidence [prev, cur, prev, cur], basis 'single_target';
// - the switch: exactly three dated observations — the single target's last row on 2008-12-15 and the first upper and
//   lower rows on 2008-12-16 — give one 'single_to_range' event, every value read from those rows (no constants),
//   change_bp = toBp(u − s) from the UPPER bound always (spec §5.4; an unchanged upper with a moved lower, or s = u = l, is a 0 bp event
//   that episodes and the matrix skip), evidence [s, u, s, l]. Anything else → no event and an explicit gap
//   {kind:'transition_unverified', near:'2008-12-16'}.
// Inputs must be strictly ascending (P2 assertAscending). Same inputs → same output. Event-source histories are recorded
// as reads (purpose 'events') and only the rows needed to derive and verify each event are frozen (role
// 'events:<series>:evidence'): every evidence id of every event plus the transition tuple (the single target's last row,
// the first upper and lower rows), so each event re-derives from the manifest alone; the whole daily target history is
// too large to copy into every manifest. A truncated source read → no events and one gap {kind:'history_truncated',
// near: cutoff date} that every view shows (never an ordinary empty history).
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {VERSIONS} from './contract';
import type {EventGap,EventInput,PolicyEvent,StrategyPolicyEvent} from './contract';
import {utcDate} from './manifest';
import type {ManifestBuilder} from './manifest';
import {sign,subtract,toBp} from './numeric';
export const US_TARGET_SINGLE_ID='US_FED_TARGET_D',US_TARGET_UPPER_ID='US_FED_TARGET_UPPER_D',US_TARGET_LOWER_ID='US_FED_TARGET_LOWER_D';
export const TRANSITION_SINGLE_DATE='2008-12-15',TRANSITION_RANGE_DATE='2008-12-16';
export const EVENTS_PURPOSE='events';
type Derive=(upper:readonly EventInput[],lower:readonly EventInput[])=>PolicyEvent[];
function assertAscending(rows:readonly EventInput[],label:string){
 for(let i=1;i<rows.length;i++)if(rows[i].period_end<=rows[i-1].period_end)throw new Error(`events_unsorted:${label}:${rows[i].period_end}`);
}
function singleTargetEvents(single:readonly EventInput[]):StrategyPolicyEvent[]{
 const out:StrategyPolicyEvent[]=[];
 for(let i=1;i<single.length;i++){
  const p=single[i-1],c=single[i];const d=subtract(c.value_text,p.value_text);
  if(sign(d)===0)continue;
  const from=canonicalDecimal(p.value_text),to=canonicalDecimal(c.value_text);
  out.push({kind:'policy_target_change',region:'US',effective_date:c.period_end,upper_from:from,upper_to:to,lower_from:from,lower_to:to,change_bp:toBp(d),source:'derived',
   evidence:[p.observation_id,c.observation_id,p.observation_id,c.observation_id],version:VERSIONS.events,basis:'single_target'});
 }
 return out;
}
/** Merge the three event sources. derive = port.derivePolicyEvents (P2). */
export function mergePolicyEvents(derive:Derive,single:readonly EventInput[],upper:readonly EventInput[],lower:readonly EventInput[]):{events:StrategyPolicyEvent[];gaps:EventGap[]}{
 assertAscending(single,'single');assertAscending(upper,'upper');assertAscending(lower,'lower');
 const events:StrategyPolicyEvent[]=[...singleTargetEvents(single)];
 const gaps:EventGap[]=[];
 const rangeStartsByTransition=[upper[0],lower[0]].some(r=>r!==undefined&&r.period_end<=TRANSITION_RANGE_DATE);
 if(single.length>0||rangeStartsByTransition){
  const s=single[single.length-1],u=upper[0],l=lower[0];
  const reasons:string[]=[];
  if(!s)reasons.push('single_target_missing');else if(s.period_end!==TRANSITION_SINGLE_DATE)reasons.push(`single_target_last_not_${TRANSITION_SINGLE_DATE}`);
  if(!u)reasons.push('upper_missing');else if(u.period_end!==TRANSITION_RANGE_DATE)reasons.push(`upper_first_not_${TRANSITION_RANGE_DATE}`);
  if(!l)reasons.push('lower_missing');else if(l.period_end!==TRANSITION_RANGE_DATE)reasons.push(`lower_first_not_${TRANSITION_RANGE_DATE}`);
  if(reasons.length)gaps.push({kind:'transition_unverified',reason:reasons.join(';'),near:TRANSITION_RANGE_DATE});
  else{
   const du=subtract(u.value_text,s.value_text);
   const from=canonicalDecimal(s.value_text);   // a correctly dated transition is always an event, also when s = u = l (change_bp '0')
   events.push({kind:'policy_target_change',region:'US',effective_date:TRANSITION_RANGE_DATE,upper_from:from,upper_to:canonicalDecimal(u.value_text),lower_from:from,lower_to:canonicalDecimal(l.value_text),
    change_bp:toBp(du),source:'derived',evidence:[s.observation_id,u.observation_id,s.observation_id,l.observation_id],version:VERSIONS.events,basis:'single_to_range'});
  }
 }
 for(const e of derive(upper,lower))events.push({...e,basis:'range'});
 events.sort((a,b)=>a.effective_date<b.effective_date?-1:a.effective_date>b.effective_date?1:0);
 return {events,gaps};
}
/** Read the three event-source histories asOf the builder cutoff, merge, and freeze the evidence rows plus the transition
 *  tuple. Any truncated read → no events and a history_truncated gap (the read state says which source). */
export async function readPolicyEvents(b:ManifestBuilder):Promise<{events:StrategyPolicyEvent[];gaps:EventGap[]}>{
 const opts={keepInputs:false};
 const single=await b.history(US_TARGET_SINGLE_ID,EVENTS_PURPOSE,'history',opts);
 const upper=await b.history(US_TARGET_UPPER_ID,EVENTS_PURPOSE,'history',opts);
 const lower=await b.history(US_TARGET_LOWER_ID,EVENTS_PURPOSE,'history',opts);
 if(!single||!upper||!lower){
  const truncated=[[US_TARGET_SINGLE_ID,single],[US_TARGET_UPPER_ID,upper],[US_TARGET_LOWER_ID,lower]].filter(([,r])=>r===null).map(([id])=>id);
  return {events:[],gaps:[{kind:'history_truncated',reason:truncated.join(';'),near:utcDate(b.cutoff)}]};
 }
 const merged=mergePolicyEvents((u,l)=>b.port.derivePolicyEvents(u,l),single,upper,lower);
 const needed=new Set(merged.events.flatMap(e=>[...e.evidence]));
 for(const r of [single[single.length-1],upper[0],lower[0]])if(r)needed.add(r.observation_id);
 b.keep([...single,...upper,...lower].filter(o=>needed.has(o.observation_id)),EVENTS_PURPOSE,'evidence');
 return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/macro/strategy/policy-events.test.ts`
Expected: PASS (14 tests). If `readPolicyEvents … Fed fixture` fails, check that `fedTargetFixture()` (Task 2) has its last `US_FED_TARGET_D` row on 2008-12-15 and its first upper / lower rows on 2008-12-16 as the skeleton states; fix the fixture, not this test.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add src/lib/macro/strategy/policy-events.ts src/lib/macro/strategy/policy-events.test.ts
```
```bash
git commit -F - <<'EOF'
feat(macro-strategy): merge Fed policy events across the 2008 target switch

Single-target events from US_FED_TARGET_D, P2 range events unchanged (basis
'range'), and one single_to_range event only from the exact 2008-12-15 / 2008-12-16
observations; anything else is an explicit transition_unverified gap
(macro-strategy-events/1, spec §5.4 N9).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


### Task 6: Transmission flow, playbook library and the F4 mark selection

**Files:**
- Create: `src/lib/macro/strategy/f4-types.ts`
- Create: `src/lib/macro/strategy/data/transmission-v1.ts`, `src/lib/macro/strategy/data/playbooks-v1.ts`
- Create: `src/lib/macro/strategy/transmission.ts`, `src/lib/macro/strategy/transmission.test.ts`
- Create: `src/lib/macro/strategy/playbooks.ts`, `src/lib/macro/strategy/playbooks.test.ts`

Design decisions (spec §5.1, §5.2, §7):
- `f4-types.ts` holds `F4CardLite` and `F4JudgmentDetail` verbatim from the skeleton's dependency-injection block, because Task 6 needs them before `f4-client.ts` (Task 11) exists. Task 11 must `import type {F4CardLite,F4JudgmentDetail} from './f4-types'` and re-export them from `f4-client.ts` instead of redeclaring.
- `NodeDef` / `StageDef` are declared in `transmission.ts` (spec §5.1 shape; the derived node also carries a `label`, because `NodeView.label` needs one). The v1 config follows the spec node list; the CN risk stage gets one `not_in_catalog` node (the spec says "无"), so no stage is empty; the last stage has `edgeToNext:null`.
- `buildTransmissionManifest`: active snapshot of each region, `latestCutoff`, all observed / derived node series (asset views read their `aliasOf` target, so `CN_CGB10Y` reads `CN_CGB_10Y`), catalog rows of every node and every playbook watch id, `rules: port.rules()`. Catalog rows that are not `active` are not read (their view state comes from the frozen catalog); an alias is read only when its resolved target exists and is `active`, and its view state follows the target (missing / restricted propagate with the target's reason; a target absent from the catalog is `missing`). Returns `null` when neither region has an active snapshot (page "尚无发布快照").
- Spread: `value_text = subtract(a, b)` only when both latest inputs share `period_end`; otherwise `missing` with reason `两条输入数据期不同：<a>=<pa>，<b>=<pb>` / `Inputs have different periods: …`; a restricted input makes the node `restricted`.
- Playbooks: triggers = `playbookTriggers(manifest.rules, regime)` (support > 0, support desc, rule_id asc). Cards carry only static text, rule rows and watch names (filtered to the region). `PLAYBOOK_DISCLAIMER_V1` is the "未检验 / macro_regime_asset_pair 未实现" note the UI renders under the implications (Task 13).
- `selectF4Mark({card,detail,snapshotId})` is pure: `null` unless `methodology = macro_regime@v1` and `lifecycle ∈ {open, settled}`; `snapshot_match` only when `detail` is the same judgment (a detail whose `judgment_id` differs from the card contributes neither highlight nor settlement outcome) and has a `macro_snapshot` input whose `ref.snapshot_id === snapshotId`; a mismatch returns `mark.regime = null` (no highlight; the UI shows "F4 判定对应较早快照 <as_of>"). The summary is number-free; `outcome` = the latest settlement's `hit` / `miss` for settled cards; `href = /intel/methods/<id>/<version>` (F4 method page). No function returns a bare `Regime` (spec §7.2).

- [ ] **Step 1: Write the failing tests**

`src/lib/macro/strategy/transmission.test.ts`
```ts
// transmission.ts (spec §5.1): node states, same-period / different-period spread, alias reads, assumption edges, manifest.
import {describe,expect,it} from 'vitest';
import type {NodeView,Region,StoredManifest,StrategyManifest} from './contract';
import {PLAYBOOKS_V1} from './data/playbooks-v1';
import {TRANSMISSION_V1} from './data/transmission-v1';
import {manifestHash} from './manifest';
import {memoryStrategyPort} from './port';
import {FIXTURE_CATALOG,fixture,obs,snap} from './testing/fixture';
import {buildTransmission,buildTransmissionManifest,nodeView,type StageDef} from './transmission';

const NOW=new Date('2026-11-05T00:00:00Z');
const stored=(body:StrategyManifest):StoredManifest=>({manifest_id:'00000000-0000-4000-8000-000000000001',manifest_hash:manifestHash(body),body,created_at:'2026-11-05T00:00:00Z'});
const node=(v:ReturnType<typeof buildTransmission>,id:string):NodeView=>{for(const s of v.stages)for(const n of s.nodes)if(n.id===id)return n;throw new Error(`no node ${id}`);};

function scenario(o:{cgbPeriod?:string}={}){
 const usRows=[obs('US_CPI_YOY','2026-09-30','2.9'),obs('US_DGS10','2026-10-31','4.10'),obs('US_DFF','2026-10-31','4.33')];
 const cnRows=[obs('CN_CGB_10Y',o.cgbPeriod??'2026-10-31','1.85'),obs('CN_PMI_MFG','2026-10-31','49.8')];
 const unrate=obs('US_UNRATE','2026-09-30','4.1',{availableAt:'2026-10-04T12:00:00Z'});
 const cgbHist=obs('CN_CGB_10Y','2026-08-31','1.70');
 const us=snap('US','2026-11-03T06:02:00Z',usRows.map(r=>r.observation_id));
 const cn=snap('CN','2026-11-02T01:00:00Z',cnRows.map(r=>r.observation_id),{historyIds:[cgbHist.observation_id]});
 return {us,cn,f:fixture({snapshots:[us,cn],observations:[...usRows,...cnRows,unrate,cgbHist]})};
}

describe('buildTransmissionManifest',()=>{
 it('freezes both active snapshots, the later cutoff, node inputs, rules and watch names',async()=>{
  const {us,cn,f}=scenario();
  const m=(await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'US'}))!;
  expect(m.kind).toBe('transmission');expect(m.params).toEqual({region:'US'});
  const cnBody=(await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'CN'}))!;
  expect(manifestHash(cnBody)).not.toBe(manifestHash(m));   // the region is part of the identity
  expect(buildTransmission(stored(cnBody)).region).toBe('CN');
  expect(m.cutoff).toBe(us.created_at);
  expect(m.snapshots.US?.snapshot_id).toBe(us.snapshot_id);expect(m.snapshots.CN?.snapshot_id).toBe(cn.snapshot_id);
  expect(m.rules).toEqual(f.rules);
  expect(m.inputs.find(i=>i.role==='node:US_UNRATE:latest')?.source).toEqual({kind:'history',as_of:us.created_at});
  expect(m.inputs.find(i=>i.role==='node:CN_CGB_10Y:latest')?.source).toEqual({kind:'snapshot',snapshot_id:cn.snapshot_id});
  expect(m.reads.find(r=>r.series_id==='US_PPI_FD_YOY')?.state).toBe('missing');
  expect(m.reads.some(r=>r.series_id==='US_ISM_PMI')).toBe(false);   // catalog missing: not read
  expect(m.catalog.some(d=>d.id==='CN_M2_YOY')).toBe(true);           // playbook watch name frozen
  expect(m.method_version).toBe('macro-transmission/1');
 });
 it('returns null when neither region has a published snapshot',async()=>{
  expect(await buildTransmissionManifest(memoryStrategyPort(fixture()),{now:NOW,codeVersion:'test',region:'US'})).toBeNull();
 });
});

describe('buildTransmission',()=>{
 it('renders observed, catalog-missing, restricted, not-in-catalog, no-observation and derived nodes',async()=>{
  const {f}=scenario();
  const s=stored((await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'US'}))!);
  const v=buildTransmission(s);
  expect(v.version).toBe('macro-transmission/1');expect(v.manifest_id).toBe(s.manifest_id);
  expect(v.stages.map(x=>x.stage)).toEqual(['economy','policy','liquidity','rates','risk','assets']);
  expect(node(v,'us_cpi_yoy')).toMatchObject({state:'observed',value_text:'2.9',period_end:'2026-09-30'});
  expect(node(v,'us_cpi_yoy').inputs[0].source.kind).toBe('snapshot');
  expect(node(v,'us_unrate')).toMatchObject({state:'observed',value_text:'4.1'});
  expect(node(v,'us_ism_pmi')).toMatchObject({state:'missing',value_text:null});
  expect(node(v,'us_ism_pmi').reason).not.toBeNull();
  expect(node(v,'us_vix').state).toBe('restricted');
  expect(node(v,'us_rrp_tga').state).toBe('not_in_catalog');
  expect(node(v,'us_ppi_fd_yoy')).toMatchObject({state:'missing',reason:{zh:'截止时无观测',en:'No observation at the cutoff'}});
  const spread=node(v,'us_cn_10y_spread');
  expect(spread).toMatchObject({state:'derived',value_text:'2.25',unit:'pp',period_end:'2026-10-31'});
  expect(spread.inputs.map(i=>i.series_id)).toEqual(['US_DGS10','CN_CGB_10Y']);
  expect(v.stages.slice(0,5).every(x=>x.edge?.kind==='assumption')).toBe(true);
  expect(v.stages[5].edge).toBeNull();
 });
 it('an asset view reads its aliasOf series; a spread over different periods is missing with both periods named',async()=>{
  const {f}=scenario({cgbPeriod:'2026-09-30'});
  const v=buildTransmission(stored((await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'CN'}))!));
  expect(node(v,'cn_cgb10y_asset')).toMatchObject({state:'observed',value_text:'1.85'});
  expect(node(v,'cn_cgb10y_asset').inputs[0].series_id).toBe('CN_CGB_10Y');
  const spread=node(v,'us_cn_10y_spread');
  expect(spread.state).toBe('missing');expect(spread.value_text).toBeNull();
  expect(spread.reason?.zh).toBe('两条输入数据期不同：US_DGS10=2026-10-31，CN_CGB_10Y=2026-09-30');
  expect(spread.inputs).toHaveLength(2);
  expect(node(v,'cn_lpr_1y').state).toBe('missing');expect(node(v,'cn_csi300').state).toBe('restricted');
 });
 it('an asset alias follows the resolved target: restricted / missing / absent targets propagate and freeze no value',async()=>{
  const {f}=scenario();
  const withTarget=(edit:(d:typeof FIXTURE_CATALOG[number])=>typeof FIXTURE_CATALOG[number]|null)=>({...f,catalog:f.catalog.flatMap(d=>{if(d.id!=='CN_CGB_10Y')return [d];const e=edit(d);return e?[e]:[];})});
  const view=async(fx:typeof f)=>{const m=(await buildTransmissionManifest(memoryStrategyPort(fx),{now:NOW,codeVersion:'test',region:'CN'}))!;return {m,v:buildTransmission(stored(m))};};
  const restricted=await view(withTarget(d=>({...d,status:'restricted',reason:{zh:'目标受限',en:'Target restricted'}})));
  expect(node(restricted.v,'cn_cgb10y_asset')).toMatchObject({state:'restricted',value_text:null,period_end:null,inputs:[],reason:{zh:'目标受限',en:'Target restricted'}});
  expect(node(restricted.v,'cn_cgb_10y').state).toBe('restricted');
  expect(restricted.m.inputs.some(i=>i.role==='node:CN_CGB_10Y:latest')).toBe(false);
  const missing=await view(withTarget(d=>({...d,status:'missing'})));
  expect(node(missing.v,'cn_cgb10y_asset')).toMatchObject({state:'missing',value_text:null,inputs:[]});
  expect(node(missing.v,'cn_cgb10y_asset').reason).not.toBeNull();
  const absent=await view(withTarget(()=>null));
  expect(node(absent.v,'cn_cgb10y_asset')).toMatchObject({state:'missing',value_text:null,inputs:[]});
  expect(node(absent.v,'cn_cgb10y_asset').reason?.en).toMatch(/CN_CGB_10Y/);
 });
 it('assumption nodes carry their text and no value; unknown series ids are not_in_catalog',async()=>{
  const {f}=scenario();
  const s=stored((await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'US'}))!);
  expect(nodeView(s.body,{kind:'assumption',id:'a',text:{zh:'假设',en:'assumption'}})).toMatchObject({state:'assumption',value_text:null,label:{zh:'假设',en:'assumption'}});
  expect(nodeView(s.body,{kind:'observed',id:'x',seriesId:'NOPE'}).state).toBe('not_in_catalog');
  const custom:Record<Region,StageDef[]>={US:[{stage:'economy',label:{zh:'经济',en:'Economy'},edgeToNext:null,nodes:[{kind:'assumption',id:'a',text:{zh:'假设',en:'assumption'}}]}],CN:[]};
  expect(buildTransmission(s,custom).stages[0].nodes[0].state).toBe('assumption');
  expect(()=>buildTransmission({...s,body:{...s.body,kind:'review'}})).toThrow(/manifest_kind_mismatch/);
  expect(()=>buildTransmission({...s,body:{...s.body,params:{}}})).toThrow('invalid_manifest_params:region');
 });
 it('every series id in the v1 configs exists in the fixture catalog',()=>{
  const ids=new Set(FIXTURE_CATALOG.map(d=>d.id));
  const used=[...TRANSMISSION_V1.US,...TRANSMISSION_V1.CN].flatMap(s=>s.nodes.flatMap(n=>n.kind==='observed'?[n.seriesId]:n.kind==='derived'?[n.a,n.b]:[]));
  for(const id of [...used,...PLAYBOOKS_V1.flatMap(p=>p.watch)])expect(ids.has(id),id).toBe(true);
 });
});
```

`src/lib/macro/strategy/playbooks.test.ts`
```ts
// playbooks.ts (spec §5.2): triggers = rules projection and order; static cards; the three-condition F4 mark matrix.
import {describe,expect,it} from 'vitest';
import type {RulesView,StrategyManifest} from './contract';
import type {F4CardLite,F4JudgmentDetail} from './f4-types';
import {buildPlaybooks,playbookTriggers,selectF4Mark} from './playbooks';
import {freezeDef} from './manifest';
import {FIXTURE_CATALOG} from './testing/fixture';

const RULES:RulesView={rulesVersion:'r/1',rows:[
 {rule_id:'pmi.2',type:'pmi',condition:{zh:'PMI 回落',en:'PMI falling'},support:{recession:0.5}},
 {rule_id:'pmi.1',type:'pmi',condition:{zh:'PMI 上升',en:'PMI rising'},support:{recovery:1,overheat:0.5}},
 {rule_id:'inflation_yoy.1',type:'inflation_yoy',condition:{zh:'通胀上升',en:'Inflation rising'},support:{overheat:1,stagflation:1,recovery:0}},
 {rule_id:'bond_yield.1',type:'bond_yield',condition:{zh:'收益率上行',en:'Yields rising'},support:{overheat:0.5}},
]};
const CARD:F4CardLite={judgment_id:'j1',lifecycle:'open',calibration:'insufficient',as_of:'2026-11-03',methodology:{id:'macro_regime',version:'v1'},selected:'overheat'};
const DETAIL:F4JudgmentDetail={judgment_id:'j1',as_of:'2026-11-03',selected:'overheat',inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'snap:US:1'},snapshot:{}}],settlements:[]};

describe('playbookTriggers',()=>{
 it('keeps rows with support > 0 for the regime, ordered by support desc then rule_id asc',()=>{
  expect(playbookTriggers(RULES,'overheat').map(t=>[t.rule_id,t.support])).toEqual([['inflation_yoy.1',1],['bond_yield.1',0.5],['pmi.1',0.5]]);
  expect(playbookTriggers(RULES,'recovery').map(t=>t.rule_id)).toEqual(['pmi.1']);
  expect(playbookTriggers(RULES,'recession')[0]).toEqual({rule_id:'pmi.2',type:'pmi',condition:{zh:'PMI 回落',en:'PMI falling'},support:0.5});
 });
});

describe('buildPlaybooks',()=>{
 it('renders four static cards from the frozen rules and catalog names, watch filtered to the region',()=>{
  const m={rules:RULES,catalog:FIXTURE_CATALOG.map(freezeDef)} as unknown as StrategyManifest;
  const cards=buildPlaybooks(m,'CN');
  expect(cards.map(c=>c.regime)).toEqual(['recovery','overheat','stagflation','recession']);
  expect(cards[1].triggers.map(t=>t.rule_id)).toEqual(['inflation_yoy.1','bond_yield.1','pmi.1']);
  expect(cards.every(c=>c.watch.every(w=>w.series_id.startsWith('CN_')))).toBe(true);
  expect(cards[0].watch.length).toBeGreaterThan(0);
  for(const c of cards)expect(Object.keys(c).sort()).toEqual(['implications','mechanism','regime','title','triggers','watch']);   // no F4 field, distribution, margin or hit rate
 });
});

describe('selectF4Mark',()=>{
 it('marks the selected playbook when method, lifecycle and snapshot all match',()=>{
  expect(selectF4Mark({card:CARD,detail:DETAIL,snapshotId:'snap:US:1'})).toEqual({
   mark:{regime:'overheat',judgment_id:'j1',snapshot_match:true,as_of:'2026-11-03'},
   summary:{judgment_id:'j1',selected:'overheat',lifecycle:'open',outcome:null,calibration:'insufficient',methodology:{id:'macro_regime',version:'v1'},as_of:'2026-11-03',href:'/intel/methods/macro_regime/v1'},
  });
 });
 it('a card on another snapshot is not highlighted (snapshot_match false, regime null)',()=>{
  const r=selectF4Mark({card:CARD,detail:DETAIL,snapshotId:'snap:US:2'});
  expect(r?.mark).toEqual({regime:null,judgment_id:'j1',snapshot_match:false,as_of:'2026-11-03'});
  expect(selectF4Mark({card:CARD,detail:null,snapshotId:'snap:US:1'})?.mark.snapshot_match).toBe(false);
  expect(selectF4Mark({card:CARD,detail:DETAIL,snapshotId:null})?.mark.snapshot_match).toBe(false);
 });
 it('other methods, versions or lifecycles show nothing',()=>{
  expect(selectF4Mark({card:{...CARD,methodology:{id:'macro_regime',version:'v2'}},detail:DETAIL,snapshotId:'snap:US:1'})).toBeNull();
  expect(selectF4Mark({card:{...CARD,methodology:{id:'other',version:'v1'}},detail:DETAIL,snapshotId:'snap:US:1'})).toBeNull();
  for(const lifecycle of ['abstained','void','withdrawn','pending_fill'])expect(selectF4Mark({card:{...CARD,lifecycle},detail:DETAIL,snapshotId:'snap:US:1'})).toBeNull();
  expect(selectF4Mark({card:null,detail:null,snapshotId:'snap:US:1'})).toBeNull();
 });
 it('a settled card reports the latest settlement outcome',()=>{
  const detail={...DETAIL,settlements:[{outcome:'hit',realized:'overheat',evidence:null,settled_at:'2026-12-01T00:00:00Z'},{outcome:'miss',realized:'recession',evidence:null,settled_at:'2027-01-01T00:00:00Z'}]};
  expect(selectF4Mark({card:{...CARD,lifecycle:'settled'},detail,snapshotId:'snap:US:1'})?.summary.outcome).toBe('miss');
 });
 it('a detail of another judgment contributes no settlement outcome',()=>{
  const detail={...DETAIL,judgment_id:'j2',settlements:[{outcome:'hit',realized:'overheat',evidence:null,settled_at:'2026-12-01T00:00:00Z'}]};
  const r=selectF4Mark({card:{...CARD,lifecycle:'settled'},detail,snapshotId:'snap:US:1'});
  expect(r?.summary.outcome).toBeNull();expect(r?.mark.snapshot_match).toBe(false);
 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/macro/strategy/transmission.test.ts src/lib/macro/strategy/playbooks.test.ts`
Expected: FAIL — `Failed to resolve import "./data/playbooks-v1"` (and `./transmission`, `./playbooks`).

- [ ] **Step 3: Implement**

`src/lib/macro/strategy/f4-types.ts`
```ts
// src/lib/macro/strategy/f4-types.ts
// F4 read-model types used by the pure "F4 判定" mark selection (spec 2026-11-07 §5.2) before f4-client.ts exists (Task 11).
// Copied verbatim from the plan's dependency-injection contract; f4-client.ts imports and re-exports these, never redeclares.
import type {Regime} from './contract';
export interface F4CardLite{judgment_id:string;lifecycle:string;calibration:string;as_of:string;methodology:{id:string;version:string};selected:Regime|null}
export interface F4JudgmentDetail{judgment_id:string;as_of:string;selected:Regime|null;
 inputs:{kind:string;ref:Record<string,unknown>;snapshot:Record<string,unknown>}[];
 settlements:{settlement_id?:string;outcome:string|null;realized:unknown;evidence:Record<string,unknown>|null;settled_at:string}[]}
```

`src/lib/macro/strategy/data/transmission-v1.ts`
```ts
// src/lib/macro/strategy/data/transmission-v1.ts
// Transmission flow configuration v1 (spec 2026-11-07 §5.1, macro-transmission/1): six stages per region,
// economy → policy → liquidity → rates → risk → assets. Every edge is a mechanism assumption, never a measured link.
// Observed nodes name catalog ids (asset views resolve through aliasOf when read); catalog missing / restricted rows show
// their catalog state; series outside the catalog are 'not_in_catalog' nodes with a reason.
import type {Region} from '../contract';
import type {StageDef} from '../transmission';
const SPREAD={kind:'derived',id:'us_cn_10y_spread',op:'spread',a:'US_DGS10',b:'CN_CGB_10Y',unit:'pp',label:{zh:'中美 10 年期国债利差',en:'US–China 10-year government bond spread'}} as const;
const EDGE={
 economy:{zh:'机制假设：通胀与就业变化影响央行的政策取向',en:'Mechanism assumption: inflation and employment shape the policy stance'},
 policy:{zh:'机制假设：政策利率与操作改变银行体系流动性',en:'Mechanism assumption: policy rates and operations change banking-system liquidity'},
 liquidity:{zh:'机制假设：流动性松紧传到无风险利率与汇率',en:'Mechanism assumption: liquidity conditions pass through to risk-free rates and the exchange rate'},
 rates:{zh:'机制假设：无风险利率变化影响风险偏好与估值',en:'Mechanism assumption: risk-free rate moves affect risk appetite and valuations'},
 risk:{zh:'机制假设：风险偏好变化反映到资产价格',en:'Mechanism assumption: shifts in risk appetite show up in asset prices'},
};
const LABEL={
 economy:{zh:'经济数据',en:'Economic data'},policy:{zh:'政策',en:'Policy'},liquidity:{zh:'流动性',en:'Liquidity'},
 rates:{zh:'无风险利率',en:'Risk-free rates'},risk:{zh:'风险偏好',en:'Risk appetite'},assets:{zh:'资产',en:'Assets'},
};
export const TRANSMISSION_V1:Record<Region,StageDef[]>={
 US:[
  {stage:'economy',label:LABEL.economy,edgeToNext:{text:EDGE.economy},nodes:[
   {kind:'observed',id:'us_cpi_yoy',seriesId:'US_CPI_YOY'},{kind:'observed',id:'us_unrate',seriesId:'US_UNRATE'},
   {kind:'observed',id:'us_ppi_fd_yoy',seriesId:'US_PPI_FD_YOY'},{kind:'observed',id:'us_ism_pmi',seriesId:'US_ISM_PMI'}]},
  {stage:'policy',label:LABEL.policy,edgeToNext:{text:EDGE.policy},nodes:[{kind:'observed',id:'us_dff',seriesId:'US_DFF'}]},
  {stage:'liquidity',label:LABEL.liquidity,edgeToNext:{text:EDGE.liquidity},nodes:[
   {kind:'not_in_catalog',id:'us_rrp_tga',label:{zh:'隔夜逆回购（RRP）与财政部一般账户（TGA）',en:'Overnight reverse repo (RRP) and Treasury General Account (TGA)'},
    reason:{zh:'目录尚未增补 RRPONTSYD / WTREGEN（owner 事项 A）',en:'RRPONTSYD / WTREGEN not yet added to the catalog (owner item A)'}}]},
  {stage:'rates',label:LABEL.rates,edgeToNext:{text:EDGE.rates},nodes:[
   {kind:'observed',id:'us_dgs10',seriesId:'US_DGS10'},{kind:'observed',id:'us_dtwexbgs',seriesId:'US_DTWEXBGS'},SPREAD]},
  {stage:'risk',label:LABEL.risk,edgeToNext:{text:EDGE.risk},nodes:[
   {kind:'observed',id:'us_vix',seriesId:'US_VIX'},
   {kind:'not_in_catalog',id:'us_credit_spread',label:{zh:'信用利差',en:'Credit spread'},reason:{zh:'目录没有已确认权利的信用利差序列',en:'No credit spread series with confirmed rights in the catalog'}}]},
  {stage:'assets',label:LABEL.assets,edgeToNext:null,nodes:[
   {kind:'observed',id:'us_wti',seriesId:'US_WTI'},{kind:'observed',id:'us_sp500',seriesId:'US_SP500'},{kind:'observed',id:'cn_csi300',seriesId:'CN_CSI300'}]},
 ],
 CN:[
  {stage:'economy',label:LABEL.economy,edgeToNext:{text:EDGE.economy},nodes:[
   {kind:'observed',id:'cn_pmi_mfg',seriesId:'CN_PMI_MFG'},{kind:'observed',id:'cn_cpi_yoy',seriesId:'CN_CPI_YOY'},{kind:'observed',id:'cn_ppi_yoy',seriesId:'CN_PPI_YOY'},
   {kind:'observed',id:'cn_gdp_yoy',seriesId:'CN_GDP_YOY'},{kind:'observed',id:'cn_export_yoy',seriesId:'CN_EXPORT_YOY'}]},
  {stage:'policy',label:LABEL.policy,edgeToNext:{text:EDGE.policy},nodes:[
   {kind:'observed',id:'cn_lpr_1y',seriesId:'CN_LPR_1Y'},{kind:'observed',id:'cn_mlf_1y',seriesId:'CN_MLF_1Y'}]},
  {stage:'liquidity',label:LABEL.liquidity,edgeToNext:{text:EDGE.liquidity},nodes:[
   {kind:'observed',id:'cn_m2_yoy',seriesId:'CN_M2_YOY'},{kind:'observed',id:'cn_afre_stock_yoy',seriesId:'CN_AFRE_STOCK_YOY'}]},
  {stage:'rates',label:LABEL.rates,edgeToNext:{text:EDGE.rates},nodes:[
   {kind:'observed',id:'cn_cgb_10y',seriesId:'CN_CGB_10Y'},{kind:'observed',id:'cn_usdcny_cp',seriesId:'CN_USDCNY_CP'},SPREAD]},
  {stage:'risk',label:LABEL.risk,edgeToNext:{text:EDGE.risk},nodes:[
   {kind:'not_in_catalog',id:'cn_risk_appetite',label:{zh:'中国风险偏好指标',en:'China risk-appetite gauge'},reason:{zh:'目录没有中国风险偏好序列',en:'No China risk-appetite series in the catalog'}}]},
  {stage:'assets',label:LABEL.assets,edgeToNext:null,nodes:[
   {kind:'observed',id:'cn_cgb10y_asset',seriesId:'CN_CGB10Y'},{kind:'observed',id:'cn_csi300',seriesId:'CN_CSI300'}]},
 ],
};
```

`src/lib/macro/strategy/data/playbooks-v1.ts`
```ts
// src/lib/macro/strategy/data/playbooks-v1.ts
// Playbook library v1 (spec 2026-11-07 §5.2, macro-playbooks/1): a static hypothesis framework, not a judgment.
// Triggers are NOT defined here — they are the P1 rules projection (playbooks.ts::playbookTriggers). Mechanism chains and
// allocation implications are untested assumptions (F4 macro_regime_asset_pair is not implemented). watch ⊂ catalog ids.
import type {PlaybookDef} from '../playbooks';
/** Rendered under every card's implications (spec §7.5): untested, and F4 macro_regime_asset_pair is not implemented. */
export const PLAYBOOK_DISCLAIMER_V1={zh:'配置含义是假设，未经检验；F4 的象限资产含义检验（macro_regime_asset_pair）尚未实现',en:'Allocation implications are assumptions and untested; F4 asset-implication testing (macro_regime_asset_pair) is not implemented'};
export const PLAYBOOKS_V1:readonly PlaybookDef[]=[
 {regime:'recovery',title:{zh:'复苏',en:'Recovery'},
  mechanism:[{zh:'增长回升而通胀仍低（假设）',en:'Growth picks up while inflation stays low (assumption)'},{zh:'政策保持宽松，信用逐步扩张（假设）',en:'Policy stays accommodative and credit expands gradually (assumption)'}],
  implications:{favored:[{zh:'权益类资产',en:'Equities'},{zh:'周期性行业',en:'Cyclical sectors'}],disfavored:[{zh:'长久期债券',en:'Long-duration bonds'}]},
  watch:['US_CPI_YOY','US_UNRATE','US_DGS10','CN_PMI_MFG','CN_CPI_YOY','CN_M2_YOY']},
 {regime:'overheat',title:{zh:'过热',en:'Overheat'},
  mechanism:[{zh:'增长强劲且通胀上行（假设）',en:'Strong growth with rising inflation (assumption)'},{zh:'政策转向收紧，利率上行（假设）',en:'Policy turns tighter and rates rise (assumption)'}],
  implications:{favored:[{zh:'大宗商品',en:'Commodities'}],disfavored:[{zh:'债券',en:'Bonds'}]},
  watch:['US_CPI_YOY','US_PPI_FD_YOY','US_DFF','US_WTI','CN_PPI_YOY','CN_CGB_10Y']},
 {regime:'stagflation',title:{zh:'滞胀',en:'Stagflation'},
  mechanism:[{zh:'增长放缓而通胀仍高（假设）',en:'Growth slows while inflation stays high (assumption)'},{zh:'政策两难，实际收入受压（假设）',en:'Policy faces a trade-off and real incomes are squeezed (assumption)'}],
  implications:{favored:[{zh:'现金与短久期资产',en:'Cash and short-duration assets'}],disfavored:[{zh:'权益类资产',en:'Equities'}]},
  watch:['US_CPI_YOY','US_UNRATE','US_WTI','CN_CPI_YOY','CN_PMI_MFG']},
 {regime:'recession',title:{zh:'衰退',en:'Recession'},
  mechanism:[{zh:'增长与通胀同时回落（假设）',en:'Growth and inflation both fall (assumption)'},{zh:'政策转向宽松，利率下行（假设）',en:'Policy eases and rates fall (assumption)'}],
  implications:{favored:[{zh:'长久期债券',en:'Long-duration bonds'}],disfavored:[{zh:'大宗商品',en:'Commodities'},{zh:'周期性行业',en:'Cyclical sectors'}]},
  watch:['US_UNRATE','US_DGS10','US_DTWEXBGS','CN_PMI_MFG','CN_CGB_10Y','CN_USDCNY_CP']},
];
```

`src/lib/macro/strategy/transmission.ts`
```ts
// src/lib/macro/strategy/transmission.ts
// Live transmission flow (spec 2026-11-07 §5.1, macro-transmission/1). buildTransmissionManifest freezes the two active
// snapshots, the latest value of every observed / derived node series (snapshot row first, else latestObservations asOf
// cutoff), the catalog projection, the P1 rules projection (playbook triggers), the playbook watch names and the requested
// region in params ({region}: each region is its own manifest identity). buildTransmission is a pure view over the stored
// manifest and reads the region from its params: observed → the 'node:<series>:latest' input; catalog
// missing / restricted → that state with the catalog reason; derived spread → exact a − b when both inputs share a
// period_end, else 'missing' with the reason; edges are always mechanism assumptions.
import {VERSIONS} from './contract';
import type {Bilingual,FrozenSeriesDef,NodeView,Region,Stage,StoredManifest,StrategyManifest,TransmissionView} from './contract';
import {PLAYBOOKS_V1} from './data/playbooks-v1';
import {TRANSMISSION_V1} from './data/transmission-v1';
import {frozenDef,inputRole,inputsWithRole,latestCutoff,manifestBuilder,readState,toObsRef} from './manifest';
import {subtract} from './numeric';
import type {PlaybookDef} from './playbooks';
import type {StrategyReadPort} from './port';

export type NodeDef=
 |{kind:'observed';id:string;seriesId:string}
 |{kind:'derived';id:string;op:'spread';a:string;b:string;unit:'pp';label:Bilingual}
 |{kind:'assumption';id:string;text:Bilingual}
 |{kind:'not_in_catalog';id:string;label:Bilingual;reason:Bilingual};
export interface StageDef{stage:Stage;label:Bilingual;nodes:NodeDef[];edgeToNext:{text:Bilingual}|null}
export const NODE_PURPOSE='node';
const NO_OBS:Bilingual={zh:'截止时无观测',en:'No observation at the cutoff'};
const TRUNCATED:Bilingual={zh:'读取被截断',en:'Read truncated'};
const NOT_IN_CATALOG:Bilingual={zh:'目录中没有该序列',en:'Series not in the catalog'};
const CATALOG_STATE:Record<'missing'|'restricted',Bilingual>={missing:{zh:'目录标记为缺失',en:'Marked missing in the catalog'},restricted:{zh:'目录标记为受限',en:'Marked restricted in the catalog'}};

/** Series actually read for a node series id: an asset view reads its aliasOf target. */
const readSeries=(d:FrozenSeriesDef)=>d.aliasOf??d.id;

/** The region frozen in a transmission manifest's params. */
export function regionParam(m:StrategyManifest):Region{
 const r=m.params.region;
 if(r!=='US'&&r!=='CN')throw new Error('invalid_manifest_params:region');
 return r;
}
export async function buildTransmissionManifest(port:StrategyReadPort,o:{now:Date;codeVersion:string;region:Region;stages?:Record<Region,StageDef[]>;playbooks?:readonly PlaybookDef[]}):Promise<StrategyManifest|null>{
 const stages=o.stages??TRANSMISSION_V1,playbooks=o.playbooks??PLAYBOOKS_V1;
 const snapshots={US:await port.activeSnapshot('US'),CN:await port.activeSnapshot('CN')};
 if(!snapshots.US&&!snapshots.CN)return null;   // page: "no published snapshot yet"
 const b=manifestBuilder(port,latestCutoff(snapshots,o.now));
 await b.useSnapshots(snapshots);
 const done=new Set<string>();
 const readNodeSeries=async(id:string)=>{
  const d=b.def(id);if(!d||d.status!=='active')return;
  const target=readSeries(d),td=b.def(target);
  if(!td||td.status!=='active')return;   // an alias reads only an existing, active target
  if(done.has(target))return;done.add(target);
  await b.snapshotValue(target,NODE_PURPOSE);
 };
 for(const region of ['US','CN'] as const)for(const st of stages[region])for(const n of st.nodes){
  if(n.kind==='observed')await readNodeSeries(n.seriesId);
  else if(n.kind==='derived'){await readNodeSeries(n.a);await readNodeSeries(n.b);}
 }
 for(const p of playbooks)for(const id of p.watch)b.def(id);
 return b.build({kind:'transmission',params:{region:o.region},methodVersion:VERSIONS.transmission,codeVersion:o.codeVersion,extra:{rules:port.rules()}});
}

function latestInput(m:StrategyManifest,seriesId:string){return inputsWithRole(m,inputRole(NODE_PURPOSE,seriesId,'latest'))[0]??null;}
function observedNode(m:StrategyManifest,n:Extract<NodeDef,{kind:'observed'}>):NodeView{
 const d=frozenDef(m,n.seriesId);
 if(!d)return {id:n.id,state:'not_in_catalog',label:{zh:n.seriesId,en:n.seriesId},value_text:null,unit:null,period_end:null,inputs:[],reason:NOT_IN_CATALOG};
 const base={id:n.id,label:d.name,unit:d.unit};
 if(d.status!=='active')return {...base,state:d.status,value_text:null,period_end:null,inputs:[],reason:d.reason??CATALOG_STATE[d.status]};
 const target=readSeries(d);
 if(target!==d.id){   // asset alias: the resolved target's catalog existence / status decides, not the alias row's
  const td=frozenDef(m,target);
  if(!td)return {...base,state:'missing',value_text:null,period_end:null,inputs:[],reason:{zh:`别名目标不在目录中：${target}`,en:`Alias target not in the catalog: ${target}`}};
  if(td.status!=='active')return {...base,state:td.status,value_text:null,period_end:null,inputs:[],reason:td.reason??CATALOG_STATE[td.status]};
 }
 const i=latestInput(m,target);
 if(!i)return {...base,state:'missing',value_text:null,period_end:null,inputs:[],reason:readState(m,target,NODE_PURPOSE)==='truncated'?TRUNCATED:NO_OBS};
 return {...base,state:'observed',value_text:i.value_text,period_end:i.period_end,inputs:[toObsRef(i)],reason:null};
}
function derivedNode(m:StrategyManifest,n:Extract<NodeDef,{kind:'derived'}>):NodeView{
 const base={id:n.id,label:n.label,unit:n.unit,value_text:null,period_end:null};
 for(const id of [n.a,n.b]){
  const d=frozenDef(m,id);
  if(!d)return {...base,state:'missing',inputs:[],reason:{zh:`缺少输入：${id}（目录中没有该序列）`,en:`Missing input: ${id} (not in the catalog)`}};
  if(d.status==='restricted')return {...base,state:'restricted',inputs:[],reason:d.reason??CATALOG_STATE.restricted};
  if(d.status==='missing')return {...base,state:'missing',inputs:[],reason:d.reason??CATALOG_STATE.missing};
 }
 const a=latestInput(m,n.a),b=latestInput(m,n.b);
 if(!a||!b){
  const ids=[!a?n.a:null,!b?n.b:null].filter((x):x is string=>x!==null).join(', ');
  return {...base,state:'missing',inputs:[a,b].flatMap(x=>x?[toObsRef(x)]:[]),reason:{zh:`缺少输入：${ids}`,en:`Missing input: ${ids}`}};
 }
 if(a.period_end!==b.period_end)return {...base,state:'missing',inputs:[toObsRef(a),toObsRef(b)],
  reason:{zh:`两条输入数据期不同：${n.a}=${a.period_end}，${n.b}=${b.period_end}`,en:`Inputs have different periods: ${n.a}=${a.period_end}, ${n.b}=${b.period_end}`}};
 return {...base,state:'derived',value_text:subtract(a.value_text,b.value_text),period_end:a.period_end,inputs:[toObsRef(a),toObsRef(b)],reason:null};
}
export function nodeView(m:StrategyManifest,n:NodeDef):NodeView{
 switch(n.kind){
  case 'observed':return observedNode(m,n);
  case 'derived':return derivedNode(m,n);
  case 'assumption':return {id:n.id,state:'assumption',label:n.text,value_text:null,unit:null,period_end:null,inputs:[],reason:null};
  case 'not_in_catalog':return {id:n.id,state:'not_in_catalog',label:n.label,value_text:null,unit:null,period_end:null,inputs:[],reason:n.reason};
 }
}
export function buildTransmission(stored:StoredManifest,stages:Record<Region,StageDef[]>=TRANSMISSION_V1):TransmissionView{
 const m=stored.body;
 if(m.kind!=='transmission')throw new Error(`manifest_kind_mismatch:${m.kind}`);
 const region=regionParam(m);
 return {version:VERSIONS.transmission,region,manifest_id:stored.manifest_id,cutoff:m.cutoff,
  snapshots:{US:m.snapshots.US?.snapshot_id??null,CN:m.snapshots.CN?.snapshot_id??null},catalog_version:m.catalog_version,
  stages:stages[region].map(st=>({stage:st.stage,label:st.label,nodes:st.nodes.map(n=>nodeView(m,n)),edge:st.edgeToNext?{text:st.edgeToNext.text,kind:'assumption' as const}:null}))};
}
```

`src/lib/macro/strategy/playbooks.ts`
```ts
// src/lib/macro/strategy/playbooks.ts
// Playbook library (spec 2026-11-07 §5.2, macro-playbooks/1) and the pure "F4 判定" mark selection (§5.2 N12).
// Triggers = rows of the frozen P1 rules projection with support[regime] > 0, ordered by support desc then rule_id asc;
// support is a rule parameter, rendered as "规则支持度 0.x", never as a percentage. Cards render only static text and rule
// parameters — no F4 field, distribution, margin or hit rate. selectF4Mark marks a playbook only when the F4 card is
// macro_regime@v1, open or settled, and its macro_snapshot input is the snapshot the transmission manifest shows; a card on
// another snapshot yields snapshot_match:false (no highlight, "F4 判定对应较早快照 <as_of>"). Nothing here classifies or
// scores: the regime on a mark is F4's own selected class.
import type {Bilingual,F4Mark,F4Summary,PlaybookView,Region,Regime,RulesView,StrategyManifest} from './contract';
import {PLAYBOOKS_V1} from './data/playbooks-v1';
import type {F4CardLite,F4JudgmentDetail} from './f4-types';
import {frozenDef} from './manifest';
export interface PlaybookDef{regime:Regime;title:Bilingual;mechanism:Bilingual[];implications:{favored:Bilingual[];disfavored:Bilingual[]};watch:string[]}

export function playbookTriggers(rules:RulesView,regime:Regime):PlaybookView['triggers']{
 return rules.rows.flatMap(r=>{const s=r.support[regime];return s!==undefined&&s>0?[{rule_id:r.rule_id,type:r.type,condition:r.condition,support:s}]:[];})
  .sort((a,b)=>b.support-a.support||(a.rule_id<b.rule_id?-1:a.rule_id>b.rule_id?1:0));
}
/** Playbook cards for one region from the transmission manifest (rules + frozen catalog names; watch filtered to the region). */
export function buildPlaybooks(m:StrategyManifest,region:Region,defs:readonly PlaybookDef[]=PLAYBOOKS_V1):PlaybookView[]{
 const rules=m.rules??{rulesVersion:'',rows:[]};
 return defs.map(p=>({regime:p.regime,title:p.title,triggers:playbookTriggers(rules,p.regime),mechanism:p.mechanism,implications:p.implications,
  watch:p.watch.flatMap(id=>{const d=frozenDef(m,id);return d&&d.region===region?[{series_id:id,name:d.name}]:[];})}));
}

const MARKABLE_LIFECYCLES=new Set(['open','settled']);
const methodHref=(id:string,version:string)=>`/intel/methods/${encodeURIComponent(id)}/${encodeURIComponent(version)}`;
/** Pure mark selection (§5.2). card / detail come from F4 read endpoints; snapshotId = the manifest's snapshot of that region. null = nothing to show. */
export function selectF4Mark(a:{card:F4CardLite|null;detail:F4JudgmentDetail|null;snapshotId:string|null}):{mark:F4Mark;summary:F4Summary}|null{
 const c=a.card;
 if(!c)return null;
 if(c.methodology.id!=='macro_regime'||c.methodology.version!=='v1')return null;
 if(!MARKABLE_LIFECYCLES.has(c.lifecycle))return null;
 const match=a.snapshotId!==null&&a.detail!==null&&a.detail.judgment_id===c.judgment_id
  &&a.detail.inputs.some(i=>i.kind==='macro_snapshot'&&i.ref.snapshot_id===a.snapshotId);
 const latest=c.lifecycle==='settled'&&a.detail&&a.detail.judgment_id===c.judgment_id?[...a.detail.settlements].sort((x,y)=>x.settled_at<y.settled_at?1:x.settled_at>y.settled_at?-1:0)[0]:undefined;
 const outcome=latest?.outcome==='hit'||latest?.outcome==='miss'?latest.outcome:null;
 return {
  mark:{regime:match?c.selected:null,judgment_id:c.judgment_id,snapshot_match:match,as_of:c.as_of},
  summary:{judgment_id:c.judgment_id,selected:c.selected,lifecycle:c.lifecycle,outcome,calibration:c.calibration,methodology:{...c.methodology},as_of:c.as_of,href:methodHref(c.methodology.id,c.methodology.version)},
 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/macro/strategy/transmission.test.ts src/lib/macro/strategy/playbooks.test.ts`
Expected: PASS (7 + 7 tests). The "every series id in the v1 configs exists in the fixture catalog" case names the missing id if `FIXTURE_CATALOG` (Task 2) lacks a P1 row; add the row to the fixture (copied from the P1 catalog), do not edit the v1 config.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (`data/*` import `transmission.ts` / `playbooks.ts` with `import type` only, so there is no runtime cycle.)

- [ ] **Step 6: Commit**
```bash
git add src/lib/macro/strategy/f4-types.ts src/lib/macro/strategy/data/transmission-v1.ts src/lib/macro/strategy/data/playbooks-v1.ts src/lib/macro/strategy/transmission.ts src/lib/macro/strategy/transmission.test.ts src/lib/macro/strategy/playbooks.ts src/lib/macro/strategy/playbooks.test.ts
```
```bash
git commit -F - <<'EOF'
feat(macro-strategy): transmission flow, playbook library, pure F4 mark selection

Six-stage transmission view over a frozen manifest (observed / derived spread /
assumption / missing / restricted / not_in_catalog; same-period exact spread),
static playbook cards with triggers projected from the P1 rules, and the
three-condition F4 mark (macro_regime@v1, open|settled, matching snapshot)
as a pure function over F4 read types (spec §5.1, §5.2, §7).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


### Task 7: Policy response matrix

**Files:**
- Create: `src/lib/macro/strategy/data/response-dims-v1.ts`
- Create: `src/lib/macro/strategy/policy-response-explain.ts`
- Create: `src/lib/macro/strategy/policy-response.ts`, `src/lib/macro/strategy/policy-response.test.ts`

Design decisions (spec §5.3, §5.6):
- Dimensions are monthly series (P1 month-end derivations) plus the derived `US_DGS10 − CN_CGB_10Y` spread. Column state comes from the frozen catalog: a restricted series → whole column `restricted` (dim `kind:'restricted'`); catalog `missing` → whole column `missing`; an id absent from the catalog, or the config's `not_in_catalog` dim → `not_in_catalog`; a truncated `dim` read → `missing` with reason text containing `history_truncated`; a truncated `events` read → `missing` (event source truncated).
- Window: event month `m`; base = month end of `m−1`, end = month end of `m+N−1`. Worked example (test): 2022-03-16, N = 3 → `2022-02-28` → `2022-05-31`.
- Exclusion order per event and dimension: `missing_endpoint` (base or end month end absent) → `incomplete_window` (any month end strictly between them absent) → `non_positive_base` (pct only). Then eligible events, explicitly sorted by effective date, across both directions: windows are closed month ranges `[m−1, m+N−1]` (spec §5.3), so an event is `overlap` when its base month is on or before the end month of the last selected event — a shared endpoint month is an overlap (plan audit #2). Ineligible events never block later ones. N is the manifest's `params.window`; the complete dimension definitions are frozen in `params.dims` (canonical JSON text) and the view reads them from there only (Codex fix: no caller override). Display rounding is half away from zero (`roundHalfAway`).
- Cell per direction: `n ≥ 5` → `stats` with `quartiles()` of the selected `change_raw`; `1..4` → `events_only`; `0` → `insufficient`. Every cell lists all events of its direction (selected and excluded with reason, endpoints with their input observations, exact `change_text`). QE/QT row: `missing` with `目录无联储资产负债表序列` for every data column (whole-column states stay as they are).
- `coverage` = first and last month end where the dimension has a value (spread: where both inputs exist).
- Sentences (`policy-response-explain.ts`): one per `stats` cell, numbers only, display rounding `0.1%` / `1 bp`.

- [ ] **Step 1: Write the failing test**

`src/lib/macro/strategy/policy-response.test.ts`
```ts
// policy-response.ts (spec §5.3): N-month windows (worked example 2022-03-16), eligibility, cross-direction greedy
// independence over closed month ranges (a shared endpoint month overlaps), exclusion reasons, n<5, type-7 stats, QE/QT,
// restricted / not-in-catalog columns, non-positive base, spread endpoints, truncated reads, coverage, sentences, the
// window N frozen in manifest.params.
import {describe,expect,it} from 'vitest';
import type {Cell,ManifestInput,ManifestRead,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {freezeDef,manifestHash,monthEnd} from './manifest';
import {canonicalJson} from './hash';
import {RESPONSE_DIMS_V1} from './data/response-dims-v1';
import {cellSentence} from './policy-response-explain';
import {add} from './numeric';
import {buildPolicyResponse,buildPolicyResponseManifest} from './policy-response';
import {memoryStrategyPort} from './port';
import {FIXTURE_CATALOG,fixture,monthly,snap} from './testing/fixture';

const CUTOFF='2026-11-03T06:02:00Z';
const ev=(d:string,bp:string):StrategyPolicyEvent=>({kind:'policy_target_change',region:'US',effective_date:d,upper_from:'0',upper_to:'0',lower_from:'0',lower_to:'0',change_bp:bp,source:'derived',evidence:['a','b','c','d'],version:'macro-events/1',basis:'range'});
/** Monthly inputs 'dim:<id>:month_end' from [YYYY-MM, value|null]. */
function series(id:string,pts:[string,string|null][]):ManifestInput[]{
 return pts.flatMap(([ym,v])=>v===null?[]:[{series_id:id,role:`dim:${id}:month_end`,observation_id:`obs:${id}:${monthEnd(ym)}:v1`,period_end:monthEnd(ym),value_text:v,version:1,available_at:`${monthEnd(ym)}T12:00:00Z`,source:{kind:'history' as const,as_of:CUTOFF}}]);
}
/** Consecutive months from first, one value each. */
const run=(first:string,vals:(string|null)[]):[string,string|null][]=>vals.map((v,i)=>{const [y,m]=first.split('-').map(Number);const t=y*12+m-1+i;return [`${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`,v];});
function manifest(events:StrategyPolicyEvent[],inputs:ManifestInput[],reads:ManifestRead[]=[]):StoredManifest{
 const body:StrategyManifest={kind:'policy_response',params:{},cutoff:CUTOFF,snapshots:{US:null,CN:null},catalog:FIXTURE_CATALOG.map(freezeDef),reads,inputs,events,gaps:[],catalog_version:'macro-catalog/test',method_version:'macro-policy-response/1',code_version:'test'};
 return {manifest_id:'00000000-0000-4000-8000-000000000002',manifest_hash:manifestHash(body),body,created_at:CUTOFF};
}
/** The view for window N: N is a manifest parameter, so each N is its own stored manifest (same frozen data, other identity). */
function view(m:StoredManifest,window:1|3|6){const body={...m.body,params:{window,dims:canonicalJson(RESPONSE_DIMS_V1)}};return buildPolicyResponse({...m,manifest_hash:manifestHash(body),body});}
const cell=(v:ReturnType<typeof buildPolicyResponse>,dir:'hike'|'cut'|'qe_qt',dim:string):Cell=>v.rows.find(r=>r.direction===dir)!.cells[dim];
const eventsOf=(c:Cell)=>'events' in c?c.events:[];

describe('window endpoints',()=>{
 const m=manifest([ev('2022-03-16','25')],series('US_DGS10',run('2022-01',['1.70','1.83','2.32','2.89','2.85','2.98','2.67','3.15'])));
 it('worked example: 2022-03-16, N=3 → base 2022-02 month end, end 2022-05 month end, exact bp',()=>{
  const r=eventsOf(cell(view(m,3),'hike','US_DGS10'))[0];
  expect(r.base?.period_end).toBe('2022-02-28');expect(r.end?.period_end).toBe('2022-05-31');
  expect(r.change_text).toBe('102');expect(r.change_raw).toBe(102);expect(r.selected).toBe(true);expect(r.exclusion).toBeNull();
  expect(r.base?.inputs.map(i=>i.observation_id)).toEqual(['obs:US_DGS10:2022-02-28:v1']);
 });
 it('N=1 → 2022-02 to 2022-03; N=6 → 2022-02 to 2022-08',()=>{
  const r1=eventsOf(cell(view(m,1),'hike','US_DGS10'))[0];
  expect([r1.base?.period_end,r1.end?.period_end,r1.change_text]).toEqual(['2022-02-28','2022-03-31','49']);
  const r6=eventsOf(cell(view(m,6),'hike','US_DGS10'))[0];
  expect([r6.base?.period_end,r6.end?.period_end,r6.change_text]).toEqual(['2022-02-28','2022-08-31','132']);
 });
 it('a missing month inside the window → incomplete_window; a missing endpoint → missing_endpoint',()=>{
  const gap=manifest([ev('2022-03-16','25')],series('US_DGS10',run('2022-01',['1.70','1.83','2.32',null,'2.85','2.98'])));
  expect(eventsOf(cell(view(gap,3),'hike','US_DGS10'))[0]).toMatchObject({exclusion:'incomplete_window',selected:false,change_text:null});
  expect(eventsOf(cell(view(gap,1),'hike','US_DGS10'))[0].exclusion).toBeNull();
  expect(eventsOf(cell(view(gap,6),'hike','US_DGS10'))[0]).toMatchObject({exclusion:'missing_endpoint',end:null});
 });
});

describe('independence across directions',()=>{
 const m=manifest([ev('2022-03-16','25'),ev('2022-04-20','-25'),ev('2022-09-21','75')],series('US_DGS10',run('2022-01',['1','1.1','1.2','1.3','1.4','1.5','1.6','1.7','1.8','1.9','2','2.1'])));
 it('N=3: the cut whose base month precedes the selected hike end month is excluded as overlap',()=>{
  const v=view(m,3);
  expect(eventsOf(cell(v,'cut','US_DGS10'))[0]).toMatchObject({effective_date:'2022-04-20',exclusion:'overlap',selected:false,change_text:'30'});
  expect(eventsOf(cell(v,'hike','US_DGS10')).map(r=>[r.effective_date,r.selected])).toEqual([['2022-03-16',true],['2022-09-21',true]]);
 });
 it('N=1: windows are closed month ranges, so sharing an endpoint month is an overlap',()=>{
  // hike [2022-02, 2022-03], cut [2022-03, 2022-04]: base 2022-03 = last selected end 2022-03 → overlap
  const v=view(m,1);
  expect(eventsOf(cell(v,'cut','US_DGS10'))[0]).toMatchObject({selected:false,exclusion:'overlap'});
  expect(eventsOf(cell(v,'hike','US_DGS10')).map(r=>[r.effective_date,r.selected])).toEqual([['2022-03-16',true],['2022-09-21',true]]);
 });
 it('events are scanned in effective-date order whatever the manifest order',()=>{
  const shuffled=manifest([ev('2022-09-21','75'),ev('2022-04-20','-25'),ev('2022-03-16','25')],m.body.inputs);
  expect(JSON.stringify(view(shuffled,3).rows)).toBe(JSON.stringify(view(m,3).rows));
 });
 it('an ineligible event does not block a later one',()=>{
  // the hike's window [2022-02, 2022-05] lacks March → incomplete_window; the cut is then the first eligible event and is selected
  const g=manifest([ev('2022-03-16','25'),ev('2022-05-18','-25')],series('US_DGS10',run('2022-01',['1','1.1',null,'1.3','1.4','1.5','1.6'])));
  const v=view(g,3);
  expect(eventsOf(cell(v,'hike','US_DGS10'))[0].exclusion).toBe('incomplete_window');
  expect(eventsOf(cell(v,'cut','US_DGS10'))[0]).toMatchObject({selected:true,exclusion:null,change_text:'30'});
 });
});

describe('cells',()=>{
 // hikes in 2020-02, -06, -10, 2021-02, -06 each move US_DGS10 by +10..+50 bp in their own month, flat otherwise
 const bumps:Record<string,string>={'2020-02':'0.1','2020-06':'0.2','2020-10':'0.3','2021-02':'0.4','2021-06':'0.5'};
 let level='1';const pts=run('2020-01',Array(20).fill('')).map(([ym])=>{level=add(level,bumps[ym]??'0');return [ym,level] as [string,string];});
 const hikes=Object.keys(bumps).map(ym=>ev(`${ym}-15`,'25'));
 it('n ≥ 5 → median and type-7 quartiles at full precision',()=>{
  const c=cell(view(manifest(hikes,series('US_DGS10',pts)),1),'hike','US_DGS10');
  expect(c).toMatchObject({status:'stats',n:5,median_raw:30,q1_raw:20,q3_raw:40,unit:'bp'});
 });
 it('1 ≤ n < 5 → events only; n = 0 → insufficient',()=>{
  const v=view(manifest(hikes.slice(0,4),series('US_DGS10',pts)),1);
  expect(cell(v,'hike','US_DGS10')).toMatchObject({status:'events_only',n:4});
  expect(cell(v,'cut','US_DGS10')).toMatchObject({status:'insufficient',events:[]});
 });
 it('pct uses (end/base − 1) × 100 once as a float and keeps the exact text; base ≤ 0 is excluded',()=>{
  const m=manifest([ev('2022-03-16','25'),ev('2022-09-21','75')],series('US_WTI',[['2022-02','80'],['2022-03','100'],['2022-08','0'],['2022-09','5']]));
  const rows=eventsOf(cell(view(m,1),'hike','US_WTI'));
  expect(rows[0].change_text).toBe('100/80');expect(rows[0].change_raw).toBeCloseTo(25,12);   // exact ratio; rounded once at display
  expect(rows[1]).toMatchObject({exclusion:'non_positive_base',change_raw:null});
 });
 it('QE/QT row is missing; restricted and not-in-catalog columns are whole-column states',()=>{
  const v=view(manifest([ev('2022-03-16','25')],series('US_DGS10',run('2022-01',['1','1.1','1.2']))),1);
  expect(cell(v,'qe_qt','US_DGS10')).toEqual({status:'missing',reason:{zh:'目录无联储资产负债表序列',en:'No Fed balance-sheet series in the catalog'}});
  expect(cell(v,'hike','US_SP500').status).toBe('restricted');expect(cell(v,'qe_qt','CN_CSI300').status).toBe('restricted');
  expect(cell(v,'cut','CN_NORTHBOUND').status).toBe('not_in_catalog');
  expect(v.dims.find(d=>d.id==='US_SP500')?.kind).toBe('restricted');
  expect(cell(v,'hike','US_DTWEXBGS')).toMatchObject({status:'insufficient'});   // active, no data → every event missing_endpoint
  expect(eventsOf(cell(v,'hike','US_DTWEXBGS'))[0].exclusion).toBe('missing_endpoint');
 });
 it('spread endpoints are exact same-month differences carrying both inputs; coverage is the joint range',()=>{
  const m=manifest([ev('2022-03-16','25')],[...series('US_DGS10',run('2022-01',['1.70','1.83','2.32'])),...series('CN_CGB_10Y',run('2022-02',['2.80','2.79','2.83']))]);
  const v=view(m,1);
  const r=eventsOf(cell(v,'hike','US_CN_10Y_SPREAD'))[0];
  expect(r.base).toMatchObject({period_end:'2022-02-28',value_text:'-0.97'});
  expect(r.base?.inputs.map(i=>i.series_id)).toEqual(['US_DGS10','CN_CGB_10Y']);
  expect(r.end?.value_text).toBe('-0.47');expect(r.change_text).toBe('50');
  expect(v.dims.find(d=>d.id==='US_CN_10Y_SPREAD')?.coverage).toEqual({from:'2022-02-28',to:'2022-03-31'});
 });
 it('a truncated history read makes the column missing (history_truncated)',()=>{
  const v=view(manifest([ev('2022-03-16','25')],[],[{series_id:'US_DGS10',purpose:'dim',state:'truncated'}]),1);
  expect(cell(v,'hike','US_DGS10')).toMatchObject({status:'missing'});
  expect(JSON.stringify(cell(v,'hike','US_DGS10'))).toContain('history_truncated');
 });
});

describe('sentences and manifest',()=>{
 it('one number-only sentence per stats cell',()=>{
  const bumps:Record<string,string>={'2020-02':'0.1','2020-04':'0.2','2020-06':'0.3','2020-08':'0.4','2020-10':'0.5'};
  let level='1';const pts=run('2020-01',Array(12).fill('')).map(([ym])=>{level=add(level,bumps[ym]??'0');return [ym,level] as [string,string];});
  // hikes every other month, N=1: windows [01,02], [03,04], … never share a month → all five selected (+10 … +50 bp)
  const v=view(manifest(Object.keys(bumps).map(ym=>ev(`${ym}-10`,'25')),series('US_DGS10',pts)),1);
  expect(v.sentences).toEqual([{zh:'5 次独立加息后 1 个月末，美国 10 年期国债收益率变化的中位数为 30 bp（四分位 20 bp 至 40 bp）',en:'After 5 independent hikes, the median change in U.S. 10-year Treasury yield over 1 month-end was 30 bp (interquartile 20 bp to 40 bp)'}]);
 });
 it('buildPolicyResponseManifest freezes events and monthly histories; the view is pure over it',async()=>{
  const us=snap('US',CUTOFF,[]);
  const f=fixture({snapshots:[us],observations:[...monthly('US_DGS10','2022-01',['1.70','1.83','2.32','2.89']),
   {...monthly('US_DGS10','2022-05',['9'])[0],available_at:'2026-12-01T00:00:00Z'}]});
  const body=await buildPolicyResponseManifest(memoryStrategyPort(f),{now:new Date('2026-11-05T00:00:00Z'),codeVersion:'test',window:3});
  expect(body.params).toEqual({window:3,dims:canonicalJson(RESPONSE_DIMS_V1)});
  const n1=await buildPolicyResponseManifest(memoryStrategyPort(f),{now:new Date('2026-11-05T00:00:00Z'),codeVersion:'test',window:1});
  expect(manifestHash(n1)).not.toBe(manifestHash(body));   // N is part of the identity
  expect(buildPolicyResponse({manifest_id:'00000000-0000-4000-8000-000000000002',manifest_hash:manifestHash(n1),body:n1,created_at:CUTOFF}).window).toBe(1);
  expect(body.kind).toBe('policy_response');expect(body.cutoff).toBe(CUTOFF);expect(body.snapshots.US?.snapshot_id).toBe(us.snapshot_id);
  expect(body.inputs.filter(i=>i.role==='dim:US_DGS10:month_end').map(i=>i.value_text)).toEqual(['1.70','1.83','2.32','2.89']);
  expect(body.reads.find(r=>r.series_id==='US_WTI')?.state).toBe('missing');
  expect(body.reads.some(r=>r.series_id==='US_SP500')).toBe(false);
  expect(body.catalog.find(d=>d.id==='US_SP500')?.status).toBe('restricted');
  expect(body.events).toEqual([]);expect(body.method_version).toBe('macro-policy-response/1');
 });
});

describe('rounding (half away from zero) and frozen dimensions',()=>{
 const dim={id:'D',label:{zh:'某',en:'X'},unit:'bp',kind:'series',coverage:{from:null,to:null}} as const;
 const stats=(median_raw:number,q1_raw:number,q3_raw:number):Cell=>({status:'stats',n:5,median_raw,q1_raw,q3_raw,unit:'bp',events:[]});
 it('half-bp values round away from zero; zero never prints as -0',()=>{
  const s=cellSentence('hike',dim,stats(-1.5,-0.5,2.5),1)!;
  expect(s.en).toContain('was -2 bp (interquartile -1 bp to 3 bp)');
  const z=cellSentence('cut',dim,stats(-0.4,0.4,-0.5),1)!;
  expect(z.en).toContain('was 0 bp (interquartile 0 bp to -1 bp)');
  expect(z.en).not.toContain('-0 bp');
 });
 it('dimension definitions are part of the manifest identity and replay reads only the manifest',async()=>{
  const f=fixture({snapshots:[snap('US',CUTOFF,[])],observations:[...monthly('US_DGS10','2022-01',['1.70','1.83','2.32','2.89'])]});
  const o={now:new Date('2026-11-05T00:00:00Z'),codeVersion:'test',window:1 as const};
  const as=(unit:'pct'|'bp')=>buildPolicyResponseManifest(memoryStrategyPort(f),{...o,dims:[{id:'US_DGS10',label:{zh:'x',en:'x'},unit,kind:'series',series:'US_DGS10'}]});
  const [bp,pct]=[await as('bp'),await as('pct')];
  expect(manifestHash(bp)).not.toBe(manifestHash(pct));
  const st=(b:StrategyManifest):StoredManifest=>({manifest_id:'00000000-0000-4000-8000-000000000002',manifest_hash:manifestHash(b),body:b,created_at:CUTOFF});
  expect(buildPolicyResponse(st(bp)).dims.map(d=>d.unit)).toEqual(['bp']);
  expect(buildPolicyResponse(st(pct)).dims.map(d=>d.unit)).toEqual(['pct']);
  expect(()=>buildPolicyResponse(st({...bp,params:{window:1}}))).toThrow('invalid_manifest_params:dims');
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/macro/strategy/policy-response.test.ts`
Expected: FAIL — `Failed to resolve import "./policy-response"`.

- [ ] **Step 3: Implement**

`src/lib/macro/strategy/data/response-dims-v1.ts`
```ts
// src/lib/macro/strategy/data/response-dims-v1.ts
// Policy response dimensions v1 (spec 2026-11-07 §5.3, macro-policy-response/1). All dimensions use MONTHLY series
// (P1 month-end derivations). Restricted / missing state comes from the frozen catalog, so the two stock-index columns show
// "restricted" while their catalog rows are restricted; northbound flows are outside the catalog.
import type {Bilingual} from '../contract';
export interface ResponseDimDef{id:string;label:Bilingual;unit:'pct'|'bp';kind:'series'|'spread'|'not_in_catalog';series?:string;a?:string;b?:string;reason?:Bilingual}
export const RESPONSE_DIMS_V1:readonly ResponseDimDef[]=[
 {id:'US_DTWEXBGS',label:{zh:'美元名义广义指数',en:'Nominal broad U.S. dollar index'},unit:'pct',kind:'series',series:'US_DTWEXBGS'},
 {id:'CN_USDCNY_CP',label:{zh:'人民币汇率中间价（美元）',en:'RMB central parity (USD)'},unit:'pct',kind:'series',series:'CN_USDCNY_CP'},
 {id:'US_CN_10Y_SPREAD',label:{zh:'中美 10 年期国债利差',en:'US–China 10-year spread'},unit:'bp',kind:'spread',a:'US_DGS10',b:'CN_CGB_10Y'},
 {id:'CN_CGB_10Y',label:{zh:'中债 10 年期国债收益率',en:'ChinaBond 10-year yield'},unit:'bp',kind:'series',series:'CN_CGB_10Y'},
 {id:'US_DGS10',label:{zh:'美国 10 年期国债收益率',en:'U.S. 10-year Treasury yield'},unit:'bp',kind:'series',series:'US_DGS10'},
 {id:'US_WTI',label:{zh:'WTI 原油',en:'WTI crude oil'},unit:'pct',kind:'series',series:'US_WTI'},
 {id:'US_SP500',label:{zh:'标普 500 指数',en:'S&P 500'},unit:'pct',kind:'series',series:'US_SP500'},
 {id:'CN_CSI300',label:{zh:'沪深 300 指数',en:'CSI 300 Index'},unit:'pct',kind:'series',series:'CN_CSI300'},
 {id:'CN_NORTHBOUND',label:{zh:'北向资金',en:'Northbound flows'},unit:'pct',kind:'not_in_catalog',reason:{zh:'目录没有北向资金序列',en:'No northbound-flow series in the catalog'}},
];
```

`src/lib/macro/strategy/policy-response-explain.ts`
```ts
// src/lib/macro/strategy/policy-response-explain.ts
// Number-only sentences for the policy response matrix (spec 2026-11-07 §5.3): one per hike / cut cell with statistics.
// They state the computed numbers and nothing else (no forecast wording). Display rounding only: 0.1% / 1 bp.
import type {Bilingual,Cell,PolicyResponseView,ResponseDim} from './contract';
/** Half away from zero (spec §5.3); never -0. */
export const roundHalfAway=(x:number):number=>{const r=Math.sign(x)*Math.round(Math.abs(x));return r===0?0:r;};
const fmt=(x:number,unit:'pct'|'bp')=>unit==='pct'?`${x.toFixed(1)}%`:`${roundHalfAway(x)} bp`;
const DIR={hike:{zh:'加息',en:'hikes'},cut:{zh:'降息',en:'cuts'}} as const;
export function cellSentence(dir:'hike'|'cut',dim:ResponseDim,cell:Cell,window:number):Bilingual|null{
 if(cell.status!=='stats')return null;
 const med=fmt(cell.median_raw,cell.unit),q1=fmt(cell.q1_raw,cell.unit),q3=fmt(cell.q3_raw,cell.unit);
 return {
  zh:`${cell.n} 次独立${DIR[dir].zh}后 ${window} 个月末，${dim.label.zh}变化的中位数为 ${med}（四分位 ${q1} 至 ${q3}）`,
  en:`After ${cell.n} independent ${DIR[dir].en}, the median change in ${dim.label.en} over ${window} month-end${window===1?'':'s'} was ${med} (interquartile ${q1} to ${q3})`,
 };
}
export function responseSentences(v:Pick<PolicyResponseView,'window'|'dims'|'rows'>):Bilingual[]{
 const out:Bilingual[]=[];
 for(const row of v.rows){
  if(row.direction==='qe_qt')continue;
  for(const d of v.dims){const s=cellSentence(row.direction,d,row.cells[d.id],v.window);if(s)out.push(s);}
 }
 return out;
}
```

`src/lib/macro/strategy/policy-response.ts`
```ts
// src/lib/macro/strategy/policy-response.ts
// Fed policy → US/China asset response matrix (spec 2026-11-07 §5.3, macro-policy-response/1). Descriptive statistics of
// event windows, never a forecast.
// - anchor: the merged US policy events frozen in the manifest (§5.4); direction = sign(change_bp).
// - window N ∈ {1,3,6}: event month m → base = month end of m−1, end = month end of m+N−1 (exactly N month-end intervals,
//   effective month included). 2022-03-16, N=3 → base 2022-02 month end, end 2022-05 month end.
// - change: pct = (end/base − 1) × 100 (base ≤ 0 → non_positive_base); bp = toBp(end − base), exact. A spread endpoint is
//   the exact difference of the two same-month inputs and carries both input observations.
// - eligibility per dimension and N: both endpoints present (else missing_endpoint) and every month end in between present
//   (else incomplete_window). Independence: eligible events sorted by effective date and scanned ACROSS directions; windows
//   are CLOSED month ranges [m−1, m+N−1], so an event whose base month is on or before the last selected end month
//   (base ≤ lastEnd, a shared endpoint month included) is excluded as overlap. P2 differs: one asset, one direction per set.
// - cell: n ≥ 5 → median and type-7 quartiles (full precision, *_raw); 1 ≤ n < 5 → events only; n = 0 → insufficient.
//   QE/QT row: missing (no Fed balance-sheet series in the catalog). Restricted / missing catalog rows → whole column state.
// buildPolicyResponseManifest freezes the events, every dimension's monthly history asOf cutoff, the catalog projection and
// the window N and the complete dimension definitions in params ({window, dims}); buildPolicyResponse reads both from the
// manifest and nothing else (no caller override), so each N and each dimension set is its own manifest identity.
// pct change_text is the exact ratio '<end>/<base>' (rounded once at display).
import {VERSIONS} from './contract';
import {canonicalJson} from './hash';
import type {Bilingual,Cell,EndpointRef,EventRow,ExclusionReason,ObsRef,PolicyResponseView,ResponseDim,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {RESPONSE_DIMS_V1,type ResponseDimDef} from './data/response-dims-v1';
import {addMonthsYm,frozenDef,inputRole,inputsWithRole,latestCutoff,manifestBuilder,monthOf,readState,toObsRef} from './manifest';
import {pctChange,pctRatio,quartiles,sign,subtract,toBp} from './numeric';
import {EVENTS_PURPOSE,readPolicyEvents} from './policy-events';
import {responseSentences} from './policy-response-explain';
import type {StrategyReadPort} from './port';

export const DIM_PURPOSE='dim';
export const RESPONSE_WINDOWS=[1,3,6] as const;
export const MIN_STATS_N=5;
const QE_QT_MISSING:Bilingual={zh:'目录无联储资产负债表序列',en:'No Fed balance-sheet series in the catalog'};
const HISTORY_TRUNCATED:Bilingual={zh:'历史读取被截断（history_truncated）',en:'History read truncated (history_truncated)'};
const EVENTS_TRUNCATED:Bilingual={zh:'政策事件序列读取被截断',en:'Policy event source read truncated'};
const NOT_IN_CATALOG:Bilingual={zh:'目录中没有该序列',en:'Series not in the catalog'};
const CATALOG_STATE:Record<'missing'|'restricted',Bilingual>={missing:{zh:'目录标记为缺失',en:'Marked missing in the catalog'},restricted:{zh:'目录标记为受限',en:'Marked restricted in the catalog'}};
const dimSeries=(d:ResponseDimDef):string[]=>d.kind==='series'?[d.series!]:d.kind==='spread'?[d.a!,d.b!]:[];

/** The window N frozen in a policy_response manifest's params. */
export function windowParam(m:StrategyManifest):1|3|6{
 const w=m.params.window;
 if(w!==1&&w!==3&&w!==6)throw new Error('invalid_manifest_params:window');
 return w;
}
/** The dimension definitions frozen in a policy_response manifest's params (canonical JSON text, hashed with the body). */
export function dimsParam(m:StrategyManifest):readonly ResponseDimDef[]{
 const t=m.params.dims;
 if(typeof t!=='string')throw new Error('invalid_manifest_params:dims');
 let v:unknown;
 try{v=JSON.parse(t);}catch{throw new Error('invalid_manifest_params:dims');}
 if(!Array.isArray(v)||v.some(d=>!d||typeof d!=='object'||typeof d.id!=='string'||(d.unit!=='pct'&&d.unit!=='bp')||!['series','spread','not_in_catalog'].includes(d.kind)))throw new Error('invalid_manifest_params:dims');
 return v as ResponseDimDef[];
}
export async function buildPolicyResponseManifest(port:StrategyReadPort,o:{now:Date;codeVersion:string;window:1|3|6;dims?:readonly ResponseDimDef[]}):Promise<StrategyManifest>{
 const dims=o.dims??RESPONSE_DIMS_V1;
 const snapshots={US:await port.activeSnapshot('US'),CN:await port.activeSnapshot('CN')};
 const b=manifestBuilder(port,latestCutoff(snapshots,o.now));
 await b.useSnapshots(snapshots,{loadRows:false});
 const {events,gaps}=await readPolicyEvents(b);
 const done=new Set<string>();
 for(const d of dims)for(const id of dimSeries(d)){
  const def=b.def(id);
  if(!def||def.status!=='active'||done.has(id))continue;
  done.add(id);await b.history(id,DIM_PURPOSE,'month_end');
 }
 return b.build({kind:'policy_response',params:{window:o.window,dims:canonicalJson(dims)},methodVersion:VERSIONS.response,codeVersion:o.codeVersion,extra:{events,gaps}});
}

type Point={period_end:string;value_text:string;inputs:ObsRef[]};
type DimData={blocked:Exclude<Cell,{status:'stats'|'events_only'|'insufficient'}>|null;kind:ResponseDim['kind'];points:Map<string,Point>};
function dimData(m:StrategyManifest,d:ResponseDimDef):DimData{
 const none=new Map<string,Point>();
 if(d.kind==='not_in_catalog')return {blocked:{status:'not_in_catalog',reason:d.reason??NOT_IN_CATALOG},kind:'not_in_catalog',points:none};
 for(const id of dimSeries(d)){
  const def=frozenDef(m,id);
  if(!def)return {blocked:{status:'not_in_catalog',reason:NOT_IN_CATALOG},kind:'not_in_catalog',points:none};
  if(def.status==='restricted')return {blocked:{status:'restricted',reason:def.reason??CATALOG_STATE.restricted},kind:'restricted',points:none};
  if(def.status==='missing')return {blocked:{status:'missing',reason:def.reason??CATALOG_STATE.missing},kind:d.kind,points:none};
  if(readState(m,id,DIM_PURPOSE)==='truncated')return {blocked:{status:'missing',reason:HISTORY_TRUNCATED},kind:d.kind,points:none};
 }
 if(m.reads.some(r=>r.purpose===EVENTS_PURPOSE&&r.state==='truncated'))return {blocked:{status:'missing',reason:EVENTS_TRUNCATED},kind:d.kind,points:none};
 const byMonth=(id:string)=>new Map(inputsWithRole(m,inputRole(DIM_PURPOSE,id,'month_end')).map(i=>[monthOf(i.period_end),i]));
 const points=new Map<string,Point>();
 if(d.kind==='series'){for(const [ym,i] of byMonth(d.series!))points.set(ym,{period_end:i.period_end,value_text:i.value_text,inputs:[toObsRef(i)]});}
 else{
  const a=byMonth(d.a!),b=byMonth(d.b!);
  for(const [ym,x] of a){const y=b.get(ym);if(y)points.set(ym,{period_end:x.period_end,value_text:subtract(x.value_text,y.value_text),inputs:[toObsRef(x),toObsRef(y)]});}
 }
 return {blocked:null,kind:d.kind,points};
}
const endpoint=(p:Point|undefined):EndpointRef|null=>p?{period_end:p.period_end,value_text:p.value_text,inputs:p.inputs}:null;
interface Scored{row:EventRow;dir:'hike'|'cut';baseM:string;endM:string}
function scoreEvent(e:StrategyPolicyEvent,unit:'pct'|'bp',points:Map<string,Point>,window:number):Scored{
 const m0=monthOf(e.effective_date),baseM=addMonthsYm(m0,-1),endM=addMonthsYm(m0,window-1);
 const base=points.get(baseM),end=points.get(endM);
 const dir=sign(e.change_bp)>0?'hike':'cut';
 const row=(exclusion:ExclusionReason|null,change_raw:number|null,change_text:string|null):EventRow=>
  ({effective_date:e.effective_date,change_bp:e.change_bp,basis:e.basis,base:endpoint(base),end:endpoint(end),change_raw,change_text,selected:false,exclusion});
 if(!base||!end)return {row:row('missing_endpoint',null,null),dir,baseM,endM};
 for(let k=1;k<window;k++)if(!points.has(addMonthsYm(baseM,k)))return {row:row('incomplete_window',null,null),dir,baseM,endM};
 if(unit==='pct'){
  if(sign(base.value_text)<=0)return {row:row('non_positive_base',null,null),dir,baseM,endM};
  return {row:row(null,pctChange(end.value_text,base.value_text),pctRatio(end.value_text,base.value_text)),dir,baseM,endM};
 }
 const text=toBp(subtract(end.value_text,base.value_text));
 return {row:row(null,Number(text),text),dir,baseM,endM};
}
function directionCell(unit:'pct'|'bp',rows:EventRow[]):Cell{
 const sel=rows.filter(r=>r.selected).map(r=>r.change_raw as number);
 if(sel.length>=MIN_STATS_N){const q=quartiles(sel);return {status:'stats',n:sel.length,median_raw:q.median,q1_raw:q.q1,q3_raw:q.q3,unit,events:rows};}
 if(sel.length>0)return {status:'events_only',n:sel.length,unit,events:rows};
 return {status:'insufficient',unit,events:rows};
}
export function buildPolicyResponse(stored:StoredManifest):PolicyResponseView{
 const m=stored.body;
 if(m.kind!=='policy_response')throw new Error(`manifest_kind_mismatch:${m.kind}`);
 const window=windowParam(m),dims=dimsParam(m);
 const events=(m.events??[]).filter(e=>sign(e.change_bp)!==0).sort((a,b)=>a.effective_date<b.effective_date?-1:a.effective_date>b.effective_date?1:0);
 const viewDims:ResponseDim[]=[];
 const cells:Record<'hike'|'cut'|'qe_qt',Record<string,Cell>>={hike:{},cut:{},qe_qt:{}};
 for(const d of dims){
  const data=dimData(m,d);
  const keys=[...data.points.keys()].sort();
  viewDims.push({id:d.id,label:d.label,unit:d.unit,kind:data.kind,...(d.series?{series:d.series}:{}),...(d.a?{a:d.a,b:d.b}:{}),
   coverage:{from:keys.length?data.points.get(keys[0])!.period_end:null,to:keys.length?data.points.get(keys[keys.length-1])!.period_end:null}});
  if(data.blocked){cells.hike[d.id]=data.blocked;cells.cut[d.id]=data.blocked;cells.qe_qt[d.id]=data.blocked;continue;}
  const scored=events.map(e=>scoreEvent(e,d.unit,data.points,window));
  let lastEnd:string|null=null;
  for(const s of scored){
   if(s.row.exclusion)continue;
   if(lastEnd!==null&&s.baseM<=lastEnd){s.row.exclusion='overlap';continue;}   // closed month ranges: a shared endpoint month overlaps
   s.row.selected=true;lastEnd=s.endM;
  }
  for(const dir of ['hike','cut'] as const)cells[dir][d.id]=directionCell(d.unit,scored.filter(s=>s.dir===dir).map(s=>s.row));
  cells.qe_qt[d.id]={status:'missing',reason:QE_QT_MISSING};
 }
 const rows:PolicyResponseView['rows']=[{direction:'hike',cells:cells.hike},{direction:'cut',cells:cells.cut},{direction:'qe_qt',cells:cells.qe_qt}];
 return {version:VERSIONS.response,window,manifest_id:stored.manifest_id,cutoff:m.cutoff,dims:viewDims,rows,sentences:responseSentences({window,dims:viewDims,rows})};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/macro/strategy/policy-response.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add src/lib/macro/strategy/data/response-dims-v1.ts src/lib/macro/strategy/policy-response-explain.ts src/lib/macro/strategy/policy-response.ts src/lib/macro/strategy/policy-response.test.ts
```
```bash
git commit -F - <<'EOF'
feat(macro-strategy): Fed policy -> US/China asset response matrix

Event windows of exactly N month-end intervals (base m-1, end m+N-1), eligibility
(missing_endpoint / incomplete_window / non_positive_base), cross-direction greedy
independence, type-7 stats for n >= 5, events-only below, QE/QT and restricted /
not-in-catalog columns, exact spread endpoints, number-only sentences
(macro-policy-response/1, spec §5.3).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


### Task 8: Policy action episodes × asset table, and offline replay fixtures

**Files:**
- Create: `src/lib/macro/strategy/cycle-table.ts`, `src/lib/macro/strategy/cycle-table.test.ts`
- Create: `src/lib/macro/strategy/replay.test.ts`
- Create (recorded in Step 7): `src/lib/macro/strategy/fixtures/replay/{transmission,policy_response,cycle_table}.{manifest,expected}.json`

Design decisions (spec §5.5, §1.1 criterion 3, §12):
- Episodes (`macro-policy-episodes/1`): same-direction runs of the manifest events; `start` = first event, `end` = last event (P2 `policyCycles` extends to the day before the flip and adds plateaus — a different definition with a different name). A gap date `g` with `prev.end < g ≤ next.start` splits a run even in the same direction and sets `gap_after` on the earlier episode (also when the gap lies after the last event). `left_censored` = index 0. `ongoing` = last episode and `cutoffDate < addMonthsDate(end, 12)`. `cumulative_bp` = exact sum of `change_bp`; `upper_from` = first event's, `upper_to` = last event's.
- Columns: fixed v1 list `CYCLE_COLUMNS_V1` (the five resolvable asset / view columns of spec §5.5 and the four restricted index columns). `resolveColumn` follows `aliasOf`, then `derive.from` (month → daily) or the `month_end` row derived from a daily series.
- Boundaries: `event_day` (last row `< start`, last row `≤ end`), `first_trading_day` (first row `≥ start`, first row `≥ end`), `month_end` (month end of `month(start) − 1`, month end of `month(end)`; `monthEnd(month(end)) > cutoff date` → `month_not_closed`). A boundary date before the first or after the last row, no qualifying row, or a chosen row more than 7 calendar days from its boundary → `out_of_coverage`; one row for both ends → `degenerate`; pct base ≤ 0 → `non_positive_base`; a truncated read → `history_truncated`; restricted → `{status:'restricted'}`. `cells` is keyed by `String(episode.index)`, then column id.
- Replay: `replay.test.ts` reads ONLY the committed manifests — one per parameter value, `<kind>.manifest.json = {<param>: StoredManifest}` — and compares each view, built from the stored manifest alone (region / window / boundary come from `body.params`), with the committed expected JSON; it checks that each manifest's `params` names its value and that the identities are distinct, and rebuilds each manifest from the in-file scenario through `memoryStrategyPort` requiring the same `manifest_hash` (the committed manifests are the real builder output). Scenario values are synthetic (Fed-shaped dates, formula values); three hand-computed checks (acceptance sample 3, the worked window example, the transmission spread) do not depend on the recorded files. Fixtures are recorded once with `MACRO_REPLAY_RECORD=1` and committed; Part C (Task 9) appends its own `review` block at the end of the file.

- [ ] **Step 1: Write the failing cycle-table test**

`src/lib/macro/strategy/cycle-table.test.ts`
```ts
// cycle-table.ts (spec §5.5): episodes vs P2 cycles, left-censored / ongoing / gap_after, column resolution, the three
// boundaries, the 7-day rule, coverage, degenerate, month_not_closed, non-positive base, restricted, truncated, manifest.
import {describe,expect,it} from 'vitest';
import type {Boundary,CycleCell,EventGap,ManifestInput,ManifestRead,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {CYCLE_COLUMNS_V1,buildCycleTable,buildCycleTableManifest,policyEpisodes,resolveColumn} from './cycle-table';
import {canonicalJson} from './hash';
import {freezeDef,manifestHash,monthEnd} from './manifest';
import {subtract,toBp} from './numeric';
import {mergePolicyEvents} from './policy-events';
import {memoryStrategyPort} from './port';
import {FIXTURE_CATALOG,daily,fixture,monthly,snap} from './testing/fixture';

const ev=(d:string,bp:string,from='0',to='0'):StrategyPolicyEvent=>({kind:'policy_target_change',region:'US',effective_date:d,upper_from:from,upper_to:to,lower_from:'0',lower_to:'0',change_bp:bp,source:'derived',evidence:['a','b','c','d'],version:'macro-events/1',basis:'range'});
const HIKES=[ev('2022-03-17','25','0.25','0.5'),ev('2022-05-05','50','0.5','1'),ev('2023-07-27','25','5.25','5.5')];
const CUTS=[ev('2024-09-19','-50','5.5','5'),ev('2024-11-08','-25','5','4.75'),ev('2024-12-19','-25','4.75','4.5')];
const CATALOG=FIXTURE_CATALOG.map(freezeDef);
const input=(role:string,id:string,d:string,v:string):ManifestInput=>({series_id:id,role,observation_id:`obs:${id}:${d}:v1`,period_end:d,value_text:v,version:1,available_at:`${d}T12:00:00Z`,source:{kind:'history',as_of:'2025-06-30T00:00:00Z'}});
const dailyIn=(id:string,pts:[string,string][])=>pts.map(([d,v])=>input(`col:${id}:history`,id,d,v));
const monthIn=(id:string,pts:[string,string][])=>pts.map(([ym,v])=>input(`col:${id}:month_end`,id,monthEnd(ym),v));
function manifest(o:{events:StrategyPolicyEvent[];inputs:ManifestInput[];boundary?:Boundary;cutoff?:string;gaps?:EventGap[];reads?:ManifestRead[];columns?:readonly string[]}):StoredManifest{
 const body:StrategyManifest={kind:'cycle_table',params:{boundary:o.boundary??'event_day',columns:canonicalJson(o.columns??CYCLE_COLUMNS_V1)},cutoff:o.cutoff??'2025-06-30T00:00:00Z',snapshots:{US:null,CN:null},catalog:CATALOG,reads:o.reads??[],inputs:o.inputs,events:o.events,gaps:o.gaps??[],catalog_version:'macro-catalog/test',method_version:'macro-cycle-table/1',code_version:'test'};
 return {manifest_id:'00000000-0000-4000-8000-000000000003',manifest_hash:manifestHash(body),body,created_at:body.cutoff};
}
const at=(v:ReturnType<typeof buildCycleTable>,ep:number,col:string):CycleCell=>v.cells[String(ep)][col];

describe('policyEpisodes',()=>{
 it('runs from the first to the LAST event of a direction (no plateau, no extension to the flip)',()=>{
  expect(policyEpisodes([...HIKES,...CUTS],[],'2025-06-30')).toEqual([
   {index:0,direction:'hike',start:'2022-03-17',end:'2023-07-27',events:3,upper_from:'0.25',upper_to:'5.5',cumulative_bp:'100',left_censored:true,ongoing:false,gap_after:false},
   {index:1,direction:'cut',start:'2024-09-19',end:'2024-12-19',events:3,upper_from:'5.5',upper_to:'4.5',cumulative_bp:'-100',left_censored:false,ongoing:true,gap_after:false},
  ]);
 });
 it('ongoing only while the cutoff is less than 12 months after the last event',()=>{
  expect(policyEpisodes(CUTS,[],'2025-12-18').at(-1)?.ongoing).toBe(true);
  expect(policyEpisodes(CUTS,[],'2025-12-19').at(-1)?.ongoing).toBe(false);
 });
 it('a §5.4 gap breaks a run and marks the episode before it',()=>{
  const gap:EventGap={kind:'transition_unverified',reason:'upper_first_not_2008-12-16',near:'2008-12-16'};
  const eps=policyEpisodes([ev('2008-10-08','-50'),ev('2008-10-29','-50'),ev('2015-12-17','25')],[gap],'2016-01-31');
  expect(eps.map(e=>[e.direction,e.start,e.end,e.gap_after])).toEqual([['cut','2008-10-08','2008-10-29',true],['hike','2015-12-17','2015-12-17',false]]);
  const same=policyEpisodes([ev('2008-10-29','-50'),ev('2009-01-10','-25')],[gap],'2009-02-01');
  expect(same.map(e=>[e.start,e.end,e.gap_after])).toEqual([['2008-10-29','2008-10-29',true],['2009-01-10','2009-01-10',false]]);
  expect(policyEpisodes([ev('2008-10-29','-50')],[gap],'2009-02-01')[0].gap_after).toBe(true);
 });
 it('a 0 bp switch event (unchanged upper, moved lower) opens no episode and invents no direction',()=>{
  const derive=memoryStrategyPort(fixture()).derivePolicyEvents;
  const r=mergePolicyEvents(derive,[{observation_id:'s',period_end:'2008-12-15',value_text:'1'}],[{observation_id:'u',period_end:'2008-12-16',value_text:'1'}],[{observation_id:'l',period_end:'2008-12-16',value_text:'0.75'}]);
  expect(r.events.map(e=>e.change_bp)).toEqual(['0']);
  expect(policyEpisodes([ev('2008-10-29','-50'),...r.events],r.gaps,'2009-02-01').map(e=>[e.direction,e.start,e.end,e.events])).toEqual([['cut','2008-10-29','2008-10-29',1]]);
 });
});

describe('resolveColumn',()=>{
 it('resolves asset views to month-end and native daily series',()=>{
  expect(resolveColumn('US_UST10Y',CATALOG)).toMatchObject({change_kind:'bp',monthly_series:'US_DGS10',daily_series:'US_DGS10_D',restricted:false});
  expect(resolveColumn('CN_CGB10Y',CATALOG)).toMatchObject({monthly_series:'CN_CGB_10Y',daily_series:'CN_CGB_10Y_D'});
  expect(resolveColumn('US_WTI',CATALOG)).toMatchObject({change_kind:'pct',monthly_series:'US_WTI',daily_series:'US_WTI_D'});
  expect(resolveColumn('US_DTWEXBGS',CATALOG)).toMatchObject({monthly_series:'US_DTWEXBGS',daily_series:'US_DTWEXBGS_D'});
  expect(resolveColumn('CN_USDCNY_CP',CATALOG)).toMatchObject({monthly_series:'CN_USDCNY_CP',daily_series:'CN_USDCNY_CP_D'});
  expect(resolveColumn('US_SP500',CATALOG)).toMatchObject({restricted:true,daily_series:null,monthly_series:null});
  expect(resolveColumn('NOPE',CATALOG)).toMatchObject({daily_series:null,monthly_series:null,restricted:false});
 });
});

describe('boundaries',()=>{
 // daily US 10Y around the 2022-03-17 → 2023-07-27 hike episode; monthly month ends for the month_end boundary
 const d10=dailyIn('US_DGS10_D',[['2022-03-14','2.13'],['2022-03-16','2.18'],['2022-03-17','2.20'],['2022-03-18','2.14'],['2023-07-26','3.87'],['2023-07-27','4.00'],['2023-07-28','3.96'],['2023-08-31','4.09']]);
 const m10=monthIn('US_DGS10',[['2022-02','1.83'],['2022-03','2.32'],['2023-07','3.97']]);
 const v=(b:Boundary,o:Partial<Parameters<typeof manifest>[0]>={})=>buildCycleTable(manifest({events:HIKES,inputs:[...d10,...m10],...o,boundary:b}));
 it('event_day: last row before start → last row on or before end',()=>{
  expect(at(v('event_day'),0,'US_UST10Y')).toMatchObject({status:'ok',from:{period_end:'2022-03-16',value_text:'2.18'},to:{period_end:'2023-07-27',value_text:'4.00'},change_text:'182',change_raw:182,change_kind:'bp'});
 });
 it('first_trading_day: first row on or after start → first row on or after end',()=>{
  expect(at(v('first_trading_day'),0,'US_UST10Y')).toMatchObject({status:'ok',from:{period_end:'2022-03-17'},to:{period_end:'2023-07-27'},change_text:'180'});
 });
 it('month_end (acceptance 3): 2023-07 month end minus 2022-02 month end, exact × 100',()=>{
  const c=at(v('month_end'),0,'US_UST10Y');
  expect(c).toMatchObject({status:'ok',from:{period_end:'2022-02-28'},to:{period_end:'2023-07-31'}});
  expect(c.status==='ok'&&c.change_text).toBe(toBp(subtract('3.97','1.83')));
 });
 it('a chosen row more than 7 days away, or a boundary outside the series, is out_of_coverage',()=>{
  const sparse=dailyIn('US_DGS10_D',[['2022-03-01','2.00'],['2023-07-27','4.00'],['2023-08-31','4.09']]);
  expect(at(v('event_day',{inputs:sparse}),0,'US_UST10Y')).toEqual({status:'missing',reason:'out_of_coverage'});   // 16 days before start
  const late=dailyIn('US_DGS10_D',[['2022-03-17','2.20'],['2023-07-27','4.00']]);
  expect(at(v('event_day',{inputs:late}),0,'US_UST10Y')).toEqual({status:'missing',reason:'out_of_coverage'});     // nothing before start
  const short=dailyIn('US_DGS10_D',[['2022-03-16','2.18'],['2023-07-20','3.80']]);
  expect(at(v('first_trading_day',{inputs:short}),0,'US_UST10Y')).toEqual({status:'missing',reason:'out_of_coverage'});   // end after the last row
 });
 it('both ends on one row → degenerate (single-event episode, first_trading_day)',()=>{
  const one=buildCycleTable(manifest({events:[ev('2022-03-17','25')],inputs:d10,boundary:'first_trading_day'}));
  expect(at(one,0,'US_UST10Y')).toEqual({status:'missing',reason:'degenerate'});
 });
 it('an end month not closed at the cutoff → month_not_closed',()=>{
  expect(at(v('month_end',{cutoff:'2023-07-30T00:00:00Z'}),0,'US_UST10Y')).toEqual({status:'missing',reason:'month_not_closed'});
 });
 it('pct columns refuse a non-positive base; restricted columns are restricted; no data is out_of_coverage; truncated reads say so',()=>{
  const wti=dailyIn('US_WTI_D',[['2022-03-16','-1'],['2023-07-27','80']]);
  expect(at(v('event_day',{inputs:wti}),0,'US_WTI')).toEqual({status:'missing',reason:'non_positive_base'});
  const pos=dailyIn('US_WTI_D',[['2022-03-16','80'],['2023-07-27','100']]);
  expect(at(v('event_day',{inputs:pos}),0,'US_WTI')).toMatchObject({status:'ok',change_text:'100/80',change_raw:25,change_kind:'pct'});   // exact ratio, rounded only at display
  expect(at(v('event_day'),0,'US_SP500')).toEqual({status:'restricted'});
  expect(at(v('event_day'),0,'CN_CGB10Y')).toEqual({status:'missing',reason:'out_of_coverage'});
  expect(at(v('event_day',{reads:[{series_id:'US_DGS10_D',purpose:'col',state:'truncated'}]}),0,'US_UST10Y')).toEqual({status:'missing',reason:'history_truncated'});
 });
 it('the view carries versions, columns in config order and the manifest gaps',()=>{
  const gap:EventGap={kind:'transition_unverified',reason:'x',near:'2008-12-16'};
  const t=v('event_day',{gaps:[gap]});
  expect(t).toMatchObject({version:'macro-cycle-table/1',episodes_version:'macro-policy-episodes/1',boundary:'event_day',gaps:[gap]});
  expect(t.columns.map(c=>c.id)).toEqual(['US_UST10Y','CN_CGB10Y','US_WTI','US_DTWEXBGS','CN_USDCNY_CP','US_SP500','US_NASDAQCOM','US_DJIA','CN_CSI300']);
 });
 it('the boundary comes from manifest.params; a manifest without a valid boundary is refused',()=>{
  expect(v('month_end').boundary).toBe('month_end');
  const bad=manifest({events:HIKES,inputs:d10});bad.body.params={};
  expect(()=>buildCycleTable(bad)).toThrow('invalid_manifest_params:boundary');
 });
 it('a truncated event history is shown as a history_truncated gap, never as an ordinary empty history',()=>{
  const gap:EventGap={kind:'history_truncated',reason:'US_FED_TARGET_UPPER_D',near:'2025-06-30'};
  const t=buildCycleTable(manifest({events:[],inputs:d10,gaps:[gap]}));
  expect(t.episodes).toEqual([]);
  expect(t.gaps).toEqual([gap]);
 });
});

describe('buildCycleTableManifest',()=>{
 it('freezes events, daily and month-end histories of resolvable columns, and skips restricted columns',async()=>{
  const us=snap('US','2025-06-30T06:00:00Z',[]);
  const f=fixture({snapshots:[us],observations:[
   ...daily('US_FED_TARGET_UPPER_D',[['2022-03-16','0.25'],['2022-03-17','0.5']]),...daily('US_FED_TARGET_LOWER_D',[['2022-03-16','0'],['2022-03-17','0.25']]),
   ...daily('US_DGS10_D',[['2022-03-16','2.18'],['2022-03-17','2.20']]),...monthly('US_DGS10','2022-02',['1.83','2.32'])]});
  const body=await buildCycleTableManifest(memoryStrategyPort(f),{now:new Date('2025-07-01T00:00:00Z'),codeVersion:'test',boundary:'month_end'});
  expect(body.kind).toBe('cycle_table');expect(body.cutoff).toBe(us.created_at);
  expect(body.params).toEqual({boundary:'month_end',columns:canonicalJson(CYCLE_COLUMNS_V1)});
  const other=await buildCycleTableManifest(memoryStrategyPort(f),{now:new Date('2025-07-01T00:00:00Z'),codeVersion:'test',boundary:'event_day'});
  expect(manifestHash(other)).not.toBe(manifestHash(body));   // each boundary is its own manifest identity
  expect(body.events?.map(e=>[e.effective_date,e.change_bp,e.basis])).toEqual([['2022-03-17','25','range']]);
  expect(body.inputs.filter(i=>i.role==='col:US_DGS10_D:history')).toHaveLength(2);
  expect(body.inputs.filter(i=>i.role==='col:US_DGS10:month_end')).toHaveLength(2);
  expect(body.reads.find(r=>r.series_id==='CN_CGB_10Y_D')?.state).toBe('missing');
  expect(body.reads.some(r=>r.series_id==='US_SP500')).toBe(false);
  expect(body.catalog.some(d=>d.id==='US_UST10Y')).toBe(true);
  expect(body.method_version).toBe('macro-cycle-table/1');
 });
});

describe('frozen columns and UTC cutoff date',()=>{
 const d10=dailyIn('US_DGS10_D',[['2022-03-16','2.18'],['2022-03-17','2.20'],['2024-09-18','3.7'],['2024-09-19','3.6']]);
 it('column ids are part of the manifest identity and replay reads only the manifest',async()=>{
  const us=snap('US','2025-06-30T06:00:00Z',[]);
  const f=fixture({snapshots:[us],observations:[...daily('US_DGS10_D',[['2022-03-16','2.18'],['2022-03-17','2.20']])]});
  const o={now:new Date('2025-07-01T00:00:00Z'),codeVersion:'test',boundary:'event_day' as const};
  const one=await buildCycleTableManifest(memoryStrategyPort(f),{...o,columns:['US_UST10Y']});
  const all=await buildCycleTableManifest(memoryStrategyPort(f),o);
  expect(manifestHash(one)).not.toBe(manifestHash(all));
  const st=(b:StrategyManifest):StoredManifest=>({manifest_id:'00000000-0000-4000-8000-000000000003',manifest_hash:manifestHash(b),body:b,created_at:b.cutoff});
  expect(buildCycleTable(st(one)).columns.map(c=>c.id)).toEqual(['US_UST10Y']);
  expect(buildCycleTable(st(all)).columns.map(c=>c.id)).toEqual([...CYCLE_COLUMNS_V1]);
  expect(()=>buildCycleTable(st({...one,params:{boundary:'event_day'}}))).toThrow('invalid_manifest_params:columns');
  expect(()=>buildCycleTable(st({...one,params:{boundary:'event_day',columns:'[1]'}}))).toThrow('invalid_manifest_params:columns');
 });
 it('equivalent instants give the same ongoing flag (12-month boundary compared on the UTC date)',()=>{
  // last cut 2024-12-19 → ongoing while the UTC date is before 2025-12-19
  const on=(cutoff:string)=>buildCycleTable(manifest({events:CUTS,inputs:d10,cutoff})).episodes.at(-1)!.ongoing;
  expect(on('2025-12-19T00:30:00+08:00')).toBe(true);    // = 2025-12-18T16:30Z
  expect(on('2025-12-18T16:30:00Z')).toBe(true);
  expect(on('2025-12-18T20:00:00-08:00')).toBe(false);   // = 2025-12-19T04:00Z
  expect(on('2025-12-19T04:00:00Z')).toBe(false);
 });
 it('equivalent instants give the same month-closure verdict (month-end boundary compared on the UTC date)',()=>{
  const cell=(cutoff:string)=>buildCycleTable(manifest({events:[ev('2025-07-30','-25')],inputs:[],boundary:'month_end',cutoff})).cells['0']['US_UST10Y'];
  const open={status:'missing',reason:'month_not_closed'};
  expect(cell('2025-07-31T00:30:00+08:00')).toEqual(open);   // = 2025-07-30T16:30Z, July not closed
  expect(cell('2025-07-30T16:30:00Z')).toEqual(open);
  expect(cell('2025-07-30T20:00:00-08:00')).not.toEqual(open);   // = 2025-07-31T04:00Z, closed
  expect(cell('2025-07-31T04:00:00Z')).not.toEqual(open);
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/macro/strategy/cycle-table.test.ts`
Expected: FAIL — `Failed to resolve import "./cycle-table"`.

- [ ] **Step 3: Implement**

`src/lib/macro/strategy/cycle-table.ts`
```ts
// src/lib/macro/strategy/cycle-table.ts
// Policy action episodes × asset interval changes (spec 2026-11-07 §5.5; table macro-cycle-table/1, episodes
// macro-policy-episodes/1). An episode is a run of same-direction §5.4 events: start = first event, end = LAST event
// (P2 policyCycles instead extends to the day before a flip and adds plateaus — a different definition). A §5.4 gap breaks
// a run and marks the episode before it gap_after; left_censored = the first episode; ongoing = the last episode when the
// manifest cutoff is less than 12 months after its last event (a label only; end stays the last event).
// Columns resolve through aliasOf and derive.from to the native daily series (day boundaries) and the month-end series
// (month_end boundary). Boundaries: event_day = last daily row before start / last on or before end; first_trading_day =
// first row on or after start / on or after end; month_end = month end before the start month / of the end month (end
// month not yet closed at the cutoff → month_not_closed). A chosen row more than 7 calendar days from its boundary, or a
// boundary outside the series' first..last row → out_of_coverage; both ends on one row → degenerate. pct = (to/from − 1) × 100
// (from ≤ 0 → non_positive_base; change_text = the exact ratio '<to>/<from>'), bp = toBp(to − from). Rounding is a display
// concern. The boundary and the ordered column ids are calculation parameters frozen in manifest.params ({boundary, columns as
// canonical JSON text}); buildCycleTable reads both only from there (no caller override), so each has its own manifest
// identity. The cutoff becomes a date through utcDate (UTC calendar date of the instant, any offset). A history_truncated gap (event source read truncated) yields no
// episodes and stays in view.gaps, so the page shows the truncation instead of an empty history.
import {VERSIONS} from './contract';
import type {Boundary,CycleCell,CycleColumn,CycleTableView,Episode,EventGap,FrozenSeriesDef,ManifestInput,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {canonicalJson} from './hash';
import {addMonthsDate,addMonthsYm,dayDiff,freezeDef,inputRole,inputsWithRole,latestCutoff,manifestBuilder,monthEnd,monthOf,readState,toObsRef,utcDate} from './manifest';
import {add,pctChange,pctRatio,sign,subtract,toBp} from './numeric';
import {readPolicyEvents} from './policy-events';
import type {StrategyReadPort} from './port';

export const COL_PURPOSE='col';
export const CYCLE_COLUMNS_V1:readonly string[]=['US_UST10Y','CN_CGB10Y','US_WTI','US_DTWEXBGS','CN_USDCNY_CP','US_SP500','US_NASDAQCOM','US_DJIA','CN_CSI300'];
export const MAX_BOUNDARY_GAP_DAYS=7;
export const ONGOING_MONTHS=12;
export const BOUNDARIES:readonly Boundary[]=['event_day','first_trading_day','month_end'];
/** The boundary frozen in a cycle_table manifest's params. */
export function boundaryParam(m:StrategyManifest):Boundary{
 const b=m.params.boundary;
 if(typeof b!=='string'||!(BOUNDARIES as readonly string[]).includes(b))throw new Error(`invalid_manifest_params:boundary`);
 return b as Boundary;
}

/** The ordered column ids frozen in a cycle_table manifest's params (canonical JSON text, hashed with the body). */
export function columnsParam(m:StrategyManifest):readonly string[]{
 const t=m.params.columns;
 if(typeof t!=='string')throw new Error('invalid_manifest_params:columns');
 let v:unknown;
 try{v=JSON.parse(t);}catch{throw new Error('invalid_manifest_params:columns');}
 if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))throw new Error('invalid_manifest_params:columns');
 return v as string[];
}

/** Column resolution over a catalog projection: alias → target; month series → its derive.from daily; daily series → the month_end row derived from it. */
export function resolveColumn(id:string,defs:readonly FrozenSeriesDef[]):CycleColumn{
 const by=(x:string)=>defs.find(d=>d.id===x)??null;
 const d=by(id);
 if(!d)return {id,label:{zh:id,en:id},change_kind:'pct',daily_series:null,monthly_series:null,restricted:false};
 const t=d.aliasOf?by(d.aliasOf):d;
 const restricted=d.status==='restricted'||t?.status==='restricted';
 const base={id,label:d.name,change_kind:d.changeKind==='bp'?'bp' as const:'pct' as const,restricted};
 if(!t||t.status!=='active'||d.status!=='active')return {...base,daily_series:null,monthly_series:null};
 if(t.period==='day')return {...base,daily_series:t.id,monthly_series:defs.find(x=>x.derive?.kind==='month_end'&&x.derive.from===t.id)?.id??null};
 return {...base,daily_series:t.derive?.kind==='month_end'?t.derive.from:null,monthly_series:t.id};
}

/** Episodes from ascending events (zero-bp events ignored). cutoffDate = YYYY-MM-DD of the manifest cutoff. */
export function policyEpisodes(events:readonly StrategyPolicyEvent[],gaps:readonly EventGap[],cutoffDate:string):Episode[]{
 const evs=events.filter(e=>sign(e.change_bp)!==0).sort((a,b)=>a.effective_date<b.effective_date?-1:a.effective_date>b.effective_date?1:0);
 const gapDates=gaps.filter(g=>g.kind==='transition_unverified').map(g=>g.near);
 const out:Episode[]=[];
 for(const e of evs){
  const dir=sign(e.change_bp)>0?'hike':'cut';
  const cur=out[out.length-1];
  const gapBetween=cur!==undefined&&gapDates.some(g=>cur.end<g&&g<=e.effective_date);
  if(cur&&cur.direction===dir&&!gapBetween){cur.end=e.effective_date;cur.events++;cur.upper_to=e.upper_to;cur.cumulative_bp=add(cur.cumulative_bp,e.change_bp);continue;}
  if(cur&&gapBetween)cur.gap_after=true;
  out.push({index:out.length,direction:dir,start:e.effective_date,end:e.effective_date,events:1,upper_from:e.upper_from,upper_to:e.upper_to,cumulative_bp:e.change_bp,left_censored:out.length===0,ongoing:false,gap_after:false});
 }
 const last=out[out.length-1];
 if(last){
  if(gapDates.some(g=>g>last.end))last.gap_after=true;
  last.ongoing=cutoffDate<addMonthsDate(last.end,ONGOING_MONTHS);
 }
 return out;
}

export async function buildCycleTableManifest(port:StrategyReadPort,o:{now:Date;codeVersion:string;boundary:Boundary;columns?:readonly string[]}):Promise<StrategyManifest>{
 const columns=o.columns??CYCLE_COLUMNS_V1;
 const snapshots={US:await port.activeSnapshot('US'),CN:await port.activeSnapshot('CN')};
 const b=manifestBuilder(port,latestCutoff(snapshots,o.now));
 await b.useSnapshots(snapshots,{loadRows:false});
 const {events,gaps}=await readPolicyEvents(b);
 const live=port.catalog().map(freezeDef);
 for(const id of columns){
  const c=resolveColumn(id,live);
  const d=b.def(id);if(d?.aliasOf)b.def(d.aliasOf);
  if(c.restricted)continue;
  if(c.daily_series)await b.history(c.daily_series,COL_PURPOSE,'history');
  if(c.monthly_series)await b.history(c.monthly_series,COL_PURPOSE,'month_end');
 }
 return b.build({kind:'cycle_table',params:{boundary:o.boundary,columns:canonicalJson(columns)},methodVersion:VERSIONS.cycleTable,codeVersion:o.codeVersion,extra:{events,gaps}});
}

type Missing=Extract<CycleCell,{status:'missing'}>['reason'];
type Pick1=ManifestInput|Missing;
const miss=(reason:Missing):CycleCell=>({status:'missing',reason});
function dayPick(rows:readonly ManifestInput[],date:string,mode:'before'|'on_or_before'|'on_or_after'):Pick1{
 if(rows.length===0||date<rows[0].period_end||date>rows[rows.length-1].period_end)return 'out_of_coverage';
 let hit:ManifestInput|undefined;
 if(mode==='on_or_after')hit=rows.find(r=>r.period_end>=date);
 else for(const r of rows){if(mode==='before'?r.period_end<date:r.period_end<=date)hit=r;else break;}
 if(!hit||Math.abs(dayDiff(hit.period_end,date))>MAX_BOUNDARY_GAP_DAYS)return 'out_of_coverage';
 return hit;
}
function change(from:ManifestInput,to:ManifestInput,kind:'pct'|'bp'):CycleCell{
 if(from.observation_id===to.observation_id)return miss('degenerate');
 if(kind==='pct'){
  if(sign(from.value_text)<=0)return miss('non_positive_base');
  return {status:'ok',from:toObsRef(from),to:toObsRef(to),change_raw:pctChange(to.value_text,from.value_text),change_text:pctRatio(to.value_text,from.value_text),change_kind:'pct'};
 }
 const text=toBp(subtract(to.value_text,from.value_text));
 return {status:'ok',from:toObsRef(from),to:toObsRef(to),change_raw:Number(text),change_text:text,change_kind:'bp'};
}
function cellOf(m:StrategyManifest,ep:Episode,c:CycleColumn,boundary:Boundary,cutoffDate:string):CycleCell{
 if(c.restricted)return {status:'restricted'};
 if(boundary==='month_end'){
  if(!c.monthly_series)return miss('out_of_coverage');
  if(readState(m,c.monthly_series,COL_PURPOSE)==='truncated')return miss('history_truncated');
  const toM=monthOf(ep.end);
  if(monthEnd(toM)>cutoffDate)return miss('month_not_closed');
  const byMonth=new Map(inputsWithRole(m,inputRole(COL_PURPOSE,c.monthly_series,'month_end')).map(i=>[monthOf(i.period_end),i]));
  const from=byMonth.get(addMonthsYm(monthOf(ep.start),-1)),to=byMonth.get(toM);
  if(!from||!to)return miss('out_of_coverage');
  return change(from,to,c.change_kind);
 }
 if(!c.daily_series)return miss('out_of_coverage');
 if(readState(m,c.daily_series,COL_PURPOSE)==='truncated')return miss('history_truncated');
 const rows=inputsWithRole(m,inputRole(COL_PURPOSE,c.daily_series,'history'));
 const from=boundary==='event_day'?dayPick(rows,ep.start,'before'):dayPick(rows,ep.start,'on_or_after');
 const to=boundary==='event_day'?dayPick(rows,ep.end,'on_or_before'):dayPick(rows,ep.end,'on_or_after');
 if(typeof from==='string')return miss(from);
 if(typeof to==='string')return miss(to);
 return change(from,to,c.change_kind);
}
export function buildCycleTable(stored:StoredManifest):CycleTableView{
 const m=stored.body;
 if(m.kind!=='cycle_table')throw new Error(`manifest_kind_mismatch:${m.kind}`);
 const boundary=boundaryParam(m);
 const columns=columnsParam(m);
 const cutoffDate=utcDate(m.cutoff);
 const episodes=policyEpisodes(m.events??[],m.gaps??[],cutoffDate);
 const cols=columns.map(id=>resolveColumn(id,m.catalog));
 const cells:CycleTableView['cells']={};
 for(const ep of episodes){const row:Record<string,CycleCell>={};for(const c of cols)row[c.id]=cellOf(m,ep,c,boundary,cutoffDate);cells[String(ep.index)]=row;}
 return {version:VERSIONS.cycleTable,episodes_version:VERSIONS.episodes,boundary,manifest_id:stored.manifest_id,cutoff:m.cutoff,episodes,columns:cols,cells,gaps:m.gaps??[]};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/macro/strategy/cycle-table.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Write the replay test**

`src/lib/macro/strategy/replay.test.ts`
```ts
// Offline replay (spec §1.1 criterion 3, §4.5, §12): committed manifests under fixtures/replay/ are the ONLY input; each
// view rebuilt from the stored manifest must deep-equal the committed expected JSON. The views never receive a port, the
// live catalog or an outside argument: region / window / boundary come from manifest.params, and every parameter value has
// its own manifest (its own identity). A second check rebuilds the manifests from the scenario below through
// memoryStrategyPort and requires the same manifest_hash, so the committed manifests are what the builders really produce.
// Recording (only when a builder or view intentionally changes): MACRO_REPLAY_RECORD=1 npm test -- src/lib/macro/strategy/replay.test.ts
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {beforeAll,describe,expect,it} from 'vitest';
import type {ObservationRow,StoredManifest,StrategyManifest} from './contract';
import {BOUNDARIES,buildCycleTable,buildCycleTableManifest} from './cycle-table';
import {manifestHash,monthEnd} from './manifest';
import {subtract,toBp} from './numeric';
import {buildPlaybooks} from './playbooks';
import {buildPolicyResponse,buildPolicyResponseManifest} from './policy-response';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {daily,fixture,monthly,obs,snap} from './testing/fixture';
import {buildTransmission,buildTransmissionManifest,regionParam} from './transmission';

const DIR=fileURLToPath(new URL('./fixtures/replay/',import.meta.url));
const NOW=new Date('2025-07-01T00:00:00Z');
const CODE='replay-fixture';
const CREATED='2025-06-30T06:05:00Z';

// ---------------------------------------------------------------- scenario (synthetic values; dates shaped like the Fed path)
const hundredths=(c:number)=>(c/100).toFixed(2);
const months=(first:string,n:number)=>Array.from({length:n},(_,i)=>{const [y,m]=first.split('-').map(Number);const t=y*12+m-1+i;return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`;});
const MONTHS=months('2021-12',42);   // 2021-12 … 2025-05
const series=(id:string,f:(i:number)=>number|null)=>monthly(id,MONTHS[0],MONTHS.map((_,i)=>{const c=f(i);return c===null?null:hundredths(c);}));
const WEEKS=Array.from({length:178},(_,j)=>new Date(Date.UTC(2022,0,3)+j*7*86400000).toISOString().slice(0,10));   // Mondays from 2022-01-03
const weekly=(id:string,f:(j:number)=>number)=>daily(id,WEEKS.map((d,j)=>[d,hundredths(f(j))]));
const UPPER:[string,string][]=[['2008-12-16','0.25'],['2015-12-17','0.5'],['2020-03-16','0.25'],['2022-03-17','0.5'],['2022-05-05','1'],['2022-06-16','1.75'],['2022-07-28','2.5'],['2022-09-22','3.25'],['2022-11-03','4'],['2022-12-15','4.5'],['2023-02-02','4.75'],['2023-03-23','5'],['2023-05-04','5.25'],['2023-07-27','5.5'],['2024-09-19','5'],['2024-11-08','4.75'],['2024-12-19','4.5']];
const LOWER:[string,string][]=UPPER.map(([d,v])=>[d,subtract(v,'0.25')]);
const dgs10=(i:number)=>150+7*i+(i%5)*3, cgb10=(i:number)=>280-2*i+(i%3)*4;
function scenario(){
 const cpi=obs('US_CPI_YOY','2025-05-31','2.4'),unrate=obs('US_UNRATE','2025-05-31','4.2'),dff=obs('US_DFF','2025-05-31','4.33');
 const pmi=obs('CN_PMI_MFG','2025-05-31','49.5'),cnCpi=obs('CN_CPI_YOY','2025-05-31','-0.1');
 const monthlyRows:ObservationRow[]=[
  ...series('US_DGS10',dgs10),...series('CN_CGB_10Y',cgb10),
  ...series('US_DTWEXBGS',i=>11500+40*i-(i%4)*25),
  ...series('CN_USDCNY_CP',i=>MONTHS[i]==='2022-04'?null:63500+30*i-(i%6)*40),
  ...series('US_WTI',i=>7500+(i%7)*400-(i%3)*350),
 ];
 const last=(id:string)=>monthlyRows.filter(r=>r.series_id===id).at(-1)!.observation_id;
 const us=snap('US','2025-06-30T06:00:00Z',[cpi,unrate,dff].map(r=>r.observation_id).concat(last('US_DGS10'),last('US_DTWEXBGS')));
 const cn=snap('CN','2025-06-29T01:00:00Z',[pmi,cnCpi].map(r=>r.observation_id).concat(last('CN_CGB_10Y'),last('CN_USDCNY_CP')));
 return fixture({snapshots:[us,cn],observations:[
  cpi,unrate,dff,pmi,cnCpi,...monthlyRows,
  ...daily('US_FED_TARGET_D',[['2008-10-07','2'],['2008-10-08','1.5'],['2008-10-29','1'],['2008-12-15','1']]),
  ...daily('US_FED_TARGET_UPPER_D',UPPER),...daily('US_FED_TARGET_LOWER_D',LOWER),
  ...weekly('US_DGS10_D',j=>150+2*j+(j%4)),...weekly('US_DTWEXBGS_D',j=>11500+10*j-(j%5)*20),...weekly('US_WTI_D',j=>7500+(j%9)*150-(j%4)*100),
 ]});
}

// ---------------------------------------------------------------- cases (Part C appends 'review')
// One manifest per (kind, params): <kind>.manifest.json holds {<param>: StoredManifest}, <kind>.expected.json {<param>: view}.
// view(s) takes nothing but the stored manifest.
type Param=string|number;
type Case={id:string;key:string;params:readonly Param[];build:(p:StrategyReadPort,param:Param)=>Promise<StrategyManifest>;view:(s:StoredManifest)=>unknown};
const CASES:Case[]=[
 {id:'transmission',key:'region',params:['US','CN'],build:async(p,region)=>(await buildTransmissionManifest(p,{now:NOW,codeVersion:CODE,region:region as 'US'|'CN'}))!,
  view:s=>({transmission:buildTransmission(s),playbooks:buildPlaybooks(s.body,regionParam(s.body))})},
 {id:'policy_response',key:'window',params:[1,3,6],build:(p,window)=>buildPolicyResponseManifest(p,{now:NOW,codeVersion:CODE,window:window as 1|3|6}),view:s=>buildPolicyResponse(s)},
 {id:'cycle_table',key:'boundary',params:BOUNDARIES,build:(p,boundary)=>buildCycleTableManifest(p,{now:NOW,codeVersion:CODE,boundary:boundary as 'event_day'|'first_trading_day'|'month_end'}),view:s=>buildCycleTable(s)},
];
const ID_BASE:Record<string,number>={transmission:0xa10,policy_response:0xa20,cycle_table:0xa30};
const file=(id:string,part:'manifest'|'expected')=>`${DIR}${id}.${part}.json`;
const load=<T>(id:string,part:'manifest'|'expected'):Record<string,T>=>JSON.parse(readFileSync(file(id,part),'utf8')) as Record<string,T>;
const stored=(c:Case,i:number,body:StrategyManifest):StoredManifest=>({manifest_id:`00000000-0000-4000-8000-000000000${(ID_BASE[c.id]+i).toString(16)}`,manifest_hash:manifestHash(body),body,created_at:CREATED});

beforeAll(async()=>{
 if(process.env.MACRO_REPLAY_RECORD!=='1')return;
 const port=memoryStrategyPort(scenario());
 for(const c of CASES){
  const all:Record<string,StoredManifest>={};
  for(const [i,p] of c.params.entries())all[String(p)]=stored(c,i,await c.build(port,p));
  writeFileSync(file(c.id,'manifest'),`${JSON.stringify(all)}\n`);
  writeFileSync(file(c.id,'expected'),`${JSON.stringify(Object.fromEntries(Object.entries(all).map(([p,s])=>[p,c.view(s)])))}\n`);
 }
});

describe.each(CASES)('replay $id',c=>{
 it('the committed fixture files exist',()=>{
  expect(existsSync(file(c.id,'manifest'))).toBe(true);expect(existsSync(file(c.id,'expected'))).toBe(true);
 });
 it('one manifest per parameter: kind and params frozen in the body, manifest_hash = hash of the body, identities distinct',()=>{
  const all=load<StoredManifest>(c.id,'manifest');
  expect(Object.keys(all)).toEqual(c.params.map(String));
  for(const p of c.params){
   const s=all[String(p)];
   expect(s.manifest_hash).toBe(manifestHash(s.body));
   expect(s.body.kind).toBe(c.id);expect(s.body.params).toMatchObject({[c.key]:p});   // policy_response also freezes params.dims
  }
  expect(new Set(Object.values(all).map(s=>s.manifest_hash)).size).toBe(c.params.length);
 });
 it('view(stored manifest alone) deep-equals the committed expected JSON for every parameter',()=>{
  const all=load<StoredManifest>(c.id,'manifest');const exp=load<unknown>(c.id,'expected');
  expect(Object.keys(exp)).toEqual(c.params.map(String));
  for(const p of c.params)expect(JSON.parse(JSON.stringify(c.view(all[String(p)])))).toEqual(exp[String(p)]);
 });
 it('the builder still produces the committed manifests (same hashes) from the scenario',async()=>{
  const all=load<StoredManifest>(c.id,'manifest');
  for(const p of c.params){
   const body=await c.build(memoryStrategyPort(scenario()),p);
   expect(manifestHash(body),`${c.id} ${String(p)}: builder output changed: re-record with MACRO_REPLAY_RECORD=1 only if the change is intended`).toBe(all[String(p)].manifest_hash);
  }
 });
});
const one=(id:string,p:Param):StoredManifest=>load<StoredManifest>(id,'manifest')[String(p)];

describe('replayed numbers match hand computation',()=>{
 it('month_end hike episode 2022-03-17 → 2023-07-27: US 10Y bp = 2023-07 month end − 2022-02 month end, × 100',()=>{
  const t=buildCycleTable(one('cycle_table','month_end'));
  const ep=t.episodes.find(e=>e.direction==='hike'&&e.start==='2022-03-17')!;
  expect(ep.end).toBe('2023-07-27');
  const c=t.cells[String(ep.index)]['US_UST10Y'];
  const v=(ym:string)=>hundredths(dgs10(MONTHS.indexOf(ym)));
  expect(c).toMatchObject({status:'ok',from:{period_end:monthEnd('2022-02')},to:{period_end:monthEnd('2023-07')}});
  expect(c.status==='ok'&&c.change_text).toBe(toBp(subtract(v('2023-07'),v('2022-02'))));
 });
 it('the switch event and the left-censored first episode are replayed; the last episode is ongoing at the cutoff',()=>{
  const t=buildCycleTable(one('cycle_table','event_day'));
  expect(t.gaps).toEqual([]);
  expect(t.episodes[0]).toMatchObject({direction:'cut',start:'2008-10-08',end:'2008-12-16',left_censored:true,cumulative_bp:'-175'});
  expect(t.episodes.at(-1)).toMatchObject({direction:'cut',start:'2024-09-19',end:'2024-12-19',ongoing:true});
 });
 it('policy response N=3: the 2022-03-17 hike spans 2022-02 → 2022-05 month ends; the 2022-04 CNY gap excludes it there',()=>{
  const v=buildPolicyResponse(one('policy_response',3));
  const hike=v.rows.find(r=>r.direction==='hike')!;
  const usRow=hike.cells['US_DGS10'];
  const first=('events' in usRow?usRow.events:[]).find(e=>e.effective_date==='2022-03-17')!;
  expect([first.base?.period_end,first.end?.period_end]).toEqual(['2022-02-28','2022-05-31']);
  expect(first.change_text).toBe(toBp(subtract(hundredths(dgs10(MONTHS.indexOf('2022-05'))),hundredths(dgs10(MONTHS.indexOf('2022-02'))))));
  const cny=hike.cells['CN_USDCNY_CP'];
  expect(('events' in cny?cny.events:[]).find(e=>e.effective_date==='2022-03-17')?.exclusion).toBe('incomplete_window');
 });
 it('the transmission spread is the exact same-month difference of the two snapshot rows',()=>{
  const t=buildTransmission(one('transmission','US'));
  const spread=t.stages.flatMap(s=>s.nodes).find(n=>n.id==='us_cn_10y_spread')!;
  const i=MONTHS.indexOf('2025-05');
  expect(spread).toMatchObject({state:'derived',period_end:'2025-05-31',value_text:subtract(hundredths(dgs10(i)),hundredths(cgb10(i)))});
 });
});
```

- [ ] **Step 6: Run it to verify it fails (no fixtures yet)**

Run: `npm test -- src/lib/macro/strategy/replay.test.ts`
Expected: FAIL — `the committed fixture files exist` fails for all three cases; the other cases fail with `ENOENT … fixtures/replay/<kind>.manifest.json`.

- [ ] **Step 7: Record the fixtures, then run without recording**

Run: `mkdir -p src/lib/macro/strategy/fixtures/replay && MACRO_REPLAY_RECORD=1 npm test -- src/lib/macro/strategy/replay.test.ts`
Expected: PASS (16 tests); six files written (compact JSON; each `<kind>.manifest.json` holds one stored manifest per parameter value — 2 regions, 3 windows, 3 boundaries — about 20–670 KB each, about 1.25 MB in total).

Run: `npm test -- src/lib/macro/strategy/replay.test.ts`
Expected: PASS (16 tests) without the variable. Then check by eye: in `cycle_table.expected.json`, `event_day.episodes[0]` is the left-censored 2008 cut episode `2008-10-08 → 2008-12-16` with `cumulative_bp:"-175"`, the last episode is the 2024 cut episode with `ongoing:true`, and `gaps` is `[]`.

- [ ] **Step 8: Full Part B suite, typecheck, lint, forbidden-word spot check**

Run: `npm test -- src/lib/macro/strategy && npm run typecheck && npm run lint`
Expected: PASS.

Run: `grep -rlE '概率|置信度|胜率|probability|confidence' src/lib/macro/strategy --include='*.ts' --include='*.json' || echo clean`
Expected: `clean`.

- [ ] **Step 9: Commit**
```bash
git add src/lib/macro/strategy/cycle-table.ts src/lib/macro/strategy/cycle-table.test.ts src/lib/macro/strategy/replay.test.ts src/lib/macro/strategy/fixtures/replay
```
```bash
git commit -F - <<'EOF'
feat(macro-strategy): policy action episodes x asset table and offline replay

Episodes run first-to-last same-direction event (macro-policy-episodes/1) with
left-censored / ongoing / gap_after labels; columns resolve aliasOf/derive.from to
native daily and month-end series; event_day / first_trading_day / month_end
boundaries with the 7-day, coverage, degenerate and month_not_closed rules
(macro-cycle-table/1). Committed manifests replay to the committed views for
transmission, policy_response and cycle_table (spec §5.5, §12).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```



## Part C — P4 解释层计算（Task 9–11）

> 本部分覆盖规格 §6.1（事实）、§6.2（月度复盘）、§6.3（LLM 解读：渲染、校验、请求编排）、§6.4（偏差案例）与 §9.1 的 F4 读取。
> 验证：把 Part A（Task 1–3）与 Part B（Task 4–8）计划中的源码原样抽出，与本部分代码放在同一个隔离工作区里运行：本部分 7 个测试文件 + 追加后的 `replay.test.ts` 共 230 个用例全绿（含 Part B 的 16 个重放用例），`tsc --strict` 与仓库 ESLint 配置（`--max-warnings=0`）无错。所依赖的前序导出已由整合代理逐条核对（见计划开头"已知偏差与开放项"）。
> 本部分只 import：`./contract`（共享契约，逐字）、`./port`、`./db`、`./manifest`、`./numeric`、`./policy-events`、`./cycle-table`、`./f4-types`、`./testing/fixture`（仅测试）、`./hash`（Task 3；与 `db.ts` 计算 `manifest_hash` 用的是同一实现）、`ajv`。不 import `src/lib/macro/*`（strategy 之外）与 `src/lib/judgments/*`。
> 禁用词：除 `explain-validate.ts` 与 `*.test.ts` 外，本部分代码、提示文件、夹具都不含 `FORBIDDEN_TERMS`（已扫描）。

---

### Task 9: 事实与月度复盘（`facts.ts`、`review.ts`、复盘重放用例）

**Files:**
- Create: `src/lib/macro/strategy/facts.ts`
- Create: `src/lib/macro/strategy/facts.test.ts`
- Create: `src/lib/macro/strategy/review.ts`
- Create: `src/lib/macro/strategy/review.test.ts`
- Modify: `src/lib/macro/strategy/replay.test.ts`（Task 8 创建；改 3 行 import，文件末尾追加复盘重放块）
- Create（Step 9 录制）: `src/lib/macro/strategy/fixtures/replay/review-us-2026-10.json`

规格要点（实施者不读规格时据此理解代码）：
- 事实 = 模板 id + 槽位；数字只在槽位 `{value_text, unit}` 里，由 Task 10 的 `explain-render.ts` 渲染。`fact_id` 规则：`obs:<series>`（当前值）、`chg:<series>`（与上一可比期变化）、`node:spread_us_cn_10y`（推导利差）、`evt:<生效日>`（政策事件）、`rel:`/`rev:`/`tml:`/`mv:`/`cov:` + 序列 id、`ep:<direction>:<start>:<opened|ended>`。
- 每份解读都绑定一份 `kind='explain_facts'` 的清单（Task 1 的 `macro_claim_explanation` 只接受这种清单）。快照解读的清单（§4.5）：`pinSnapshots` 固定所请求快照与其区域、`cutoff = 该快照 created_at`、对方区域 = `snapshotUpTo(对方, cutoff)`；经 `manifestBuilder` 冻结各"水平指标"的 `latest`/`prev`、利差两条输入（快照内取最新期，否则 `latestObservations(asOf: cutoff)`，`source.kind='history'`）与全部政策事件（`readPolicyEvents`）。复盘解读的清单 = 不可变复盘结果（主体 id = `result_id`）的已存清单内容改 `kind='explain_facts'`、`params` 加 `subject_kind/result_id/review_manifest_id`（`reviewFactsManifest`），事实就是该结果里存的 `facts`。两种清单都把交给模型的事实列表冻结在 `body.facts`。
- "水平指标" = 本区域 `role='indicator'`、`period≠'day'`、且不是目录里任何序列的 `derive.from`（排除原始指数与日频原生序列，如 `US_CPI_INDEX`、`US_DGS10_D`）。
- 复盘（§6.2）：月末对月末；`cutoff = monthCutoff(month)`（次月 3 日 00:00:00Z）、基线截止 = `monthCutoff(prevMonth(month))`（本月 3 日 00:00:00Z）；截止只决定"何时已知"，比较的数据期仍是本月月末 vs 上月月末；两张快照用 `snapshotUpTo`；两个截止各用一个 `manifestBuilder`，再合并（输入、读取、目录按 Part B 构建器同样的键排序）；资产与视角序列在两截止处以 `history(…,'month_end',{from: 月初, to: 月末})` 取该月月末行（没有 → 读取状态 `missing`）；截至 cutoff 的全部政策事件冻结进清单；及时性按截止日期（`cutoff` 的日期部分，即次月 3 日）计算并冻结（只用快照里的最新期；序列不在快照中 → 以 `null` 调用）；七节只从清单计算（重放不访问端口），快照相关的节只用 `source.kind='snapshot'` 的输入。行动段用 Task 8 的 `policyEpisodes(events, gaps, cutoffDate)` 分别在截止与基线日期上计算。行动段身份 = `(direction, start)`；"新开" = 截止时有、基线时无；"结束" = 基线时 `ongoing`、截止时不再 `ongoing`。修订只覆盖各序列在快照中的最新期。截止快照不存在 → `status='insufficient'`（第 1、2、3、7 节为空，事件 / 行动段 / 资产节照常）；基线快照不存在 → 第 1、2 节为空并 `baseline_missing=true`。
- 清单角色字符串（全部经 `manifest.ts::inputRole` 生成）：快照解读 `level:<sid>:latest|prev`、`spread:<sid>:latest`；复盘 `review:<sid>:latest`（截止快照）、`review_base:<sid>:latest`（基线快照）、`asset_end:<读取序列>:month_end`、`asset_base:<读取序列>:month_end`（读取序列 = 列的 `aliasOf ?? id`，如 `US_UST10Y` → `US_DGS10`）。
- 百分比变化一律用 Task 4 `pctRatio(end, base)`：槽位存精确比值 `{value_text:'<末>/<基>', unit:'pct_ratio'}`，渲染时 `roundPctRatio` 只舍入一次（计划审计 #10）；基值 ≤ 0 → 不产生变化 / `asset_missing(non_positive_base)`；不经浮点。
- 事件源读取被截断（`gaps` 含 `history_truncated`）→ 第 4 节 `policy_events` 与第 5 节 `episode_changes` 各只有一条 `events_truncated` 事实（`evt:truncated` / `ep:truncated`，槽位 `date`、`sources`），不是空节（计划审计 #11）。
- 解读清单冻结事实（计划审计 #16）：`buildSnapshotFactsManifest` 与 `reviewFactsManifest` 都把交给模型的事实列表写进 `body.facts`（快照：`snapshotFacts(清单)`；复盘：`flattenReviewFacts(结果.facts)`），`explanationFacts(m)` 只读它。

- [ ] **Step 1: 写 `facts.ts` 的失败测试**

```ts
// src/lib/macro/strategy/facts.test.ts
import {describe,expect,it} from 'vitest';
import type {Fact,StrategyManifest} from './contract';
import {buildSnapshotFactsManifest,explanationFacts,flattenReviewFacts,levelIndicators,reviewFactsManifest,snapshotFacts,typedChange} from './facts';
import {memoryStrategyPort} from './port';
import {daily,FIXTURE_CATALOG,fixture,monthly,snap} from './testing/fixture';

const US_ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_UNRATE','2026-09',['4.3']),
 ...monthly('US_DGS10','2026-08',['4.23','4.16']),...monthly('US_DTWEXBGS','2026-08',['121.2','120.5'])];
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',[['2025-12-11','3.75'],['2026-09-18','4']]),...daily('US_FED_TARGET_LOWER_D',[['2025-12-11','3.5'],['2026-09-18','3.75']])];
const US_SNAP=snap('US','2026-10-15T06:00:00Z',US_ROWS.map(o=>o.observation_id));
function setup(cnRows=monthly('CN_CGB_10Y','2026-09',['1.85']),withCnSnap=true){
 const cnSnap=snap('CN','2026-10-10T06:00:00Z',cnRows.map(o=>o.observation_id));
 return memoryStrategyPort(fixture({snapshots:[US_SNAP,...(withCnSnap?[cnSnap]:[])],observations:[...US_ROWS,...cnRows,...EVENTS]}));
}
const build=async(p=setup()):Promise<StrategyManifest>=>{const m=await buildSnapshotFactsManifest(p,US_SNAP.snapshot_id,'test-code');if(!m)throw new Error('no manifest');return m;};
const byId=(fs:Fact[])=>new Map(fs.map(f=>[f.fact_id,f]));

describe('typed changes and level indicators (spec §6.1, P1 change kinds)',()=>{
 it('bp / pp / points are exact decimals; pct is the exact ratio (rounded once at render); non-positive base → null',()=>{
  expect(typedChange('bp','4.23','4.16')).toEqual({value_text:'-7',unit:'bp'});
  expect(typedChange('pp','2.7','2.9')).toEqual({value_text:'0.2',unit:'pp'});
  expect(typedChange('points','49.8','50.1')).toEqual({value_text:'0.3',unit:'points'});
  expect(typedChange('pct','100','110')).toEqual({value_text:'110/100',unit:'pct_ratio'});
  expect(typedChange('pct','121.2','120.5')).toEqual({value_text:'120.5/121.2',unit:'pct_ratio'});
  expect(typedChange('pct','0','1')).toBeNull();
  expect(typedChange('pct','-1','1')).toBeNull();
 });
 it('level indicators exclude daily natives and derive sources (raw indices)',()=>{
  const ids=levelIndicators(FIXTURE_CATALOG,'US').map(d=>d.id);
  expect(ids).toEqual(expect.arrayContaining(['US_CPI_YOY','US_UNRATE','US_DGS10','US_DTWEXBGS','US_ISM_PMI']));
  for(const x of ['US_DGS10_D','US_CPI_INDEX','US_WTI','US_FED_TARGET_UPPER_D'])expect(ids).not.toContain(x);
 });
});

describe('buildSnapshotFactsManifest + snapshotFacts (spec §4.5 快照解读的清单, §6.1)',()=>{
 it('pins the requested snapshot: cutoff = its created_at, peer = snapshotUpTo(peer, cutoff)',async()=>{
  const m=await build();
  expect(m.kind).toBe('explain_facts');
  expect(m.cutoff).toBe('2026-10-15T06:00:00Z');
  expect(m.params).toEqual({subject_kind:'snapshot',snapshot_id:US_SNAP.snapshot_id,region:'US'});
  expect(m.snapshots.US?.snapshot_id).toBe(US_SNAP.snapshot_id);
  expect(m.snapshots.CN?.snapshot_id).toBe('snap:CN:2026-10-10T06:00:00Z');
  expect(m.method_version).toBe('macro-facts/1');expect(m.code_version).toBe('test-code');
  expect(m.inputs.find(i=>i.role==='level:US_CPI_YOY:latest')).toMatchObject({period_end:'2026-09-30',value_text:'2.9',source:{kind:'snapshot',snapshot_id:US_SNAP.snapshot_id}});
  expect(m.inputs.find(i=>i.role==='level:US_CPI_YOY:prev')).toMatchObject({period_end:'2026-08-31',value_text:'2.7'});
  expect(m.events?.map(e=>e.effective_date)).toEqual(['2026-09-18']);
  expect(m.facts).toEqual(snapshotFacts(m));                                   // the model's fact list is frozen in the manifest
  expect(explanationFacts(m)).toBe(m.facts);
 });
 it('every source_inputs entry of the snapshot facts (policy event included) resolves to a manifest input role',async()=>{
  const m=await build();const roles=new Set(m.inputs.map(i=>i.role));
  expect(m.facts?.some(x=>x.kind==='policy_event')).toBe(true);
  for(const fact of m.facts??[])for(const r of fact.source_inputs)expect(roles.has(r),`${fact.fact_id}:${r}`).toBe(true);
  expect(m.facts?.find(x=>x.kind==='policy_event')?.source_inputs.every(r=>r.endsWith(':evidence'))).toBe(true);
 });
 it('unknown or failed snapshot → null',async()=>{
  expect(await buildSnapshotFactsManifest(setup(),'snap:US:nope','c')).toBeNull();
  const failed=snap('US','2026-10-16T06:00:00Z',[],{status:'failed'});
  expect(await buildSnapshotFactsManifest(memoryStrategyPort(fixture({snapshots:[failed]})),failed.snapshot_id,'c')).toBeNull();
 });
 it('level, typed change, spread node and the latest policy event; no judgment field anywhere',async()=>{
  const f=byId(snapshotFacts(await build()));
  expect(f.get('obs:US_CPI_YOY')).toMatchObject({kind:'level',template:'level',slots:{series:'US_CPI_YOY',period:'2026-09-30',value:{value_text:'2.9',unit:'pct'}},source_inputs:['level:US_CPI_YOY:latest']});
  expect(f.get('chg:US_CPI_YOY')).toMatchObject({kind:'change',slots:{change:{value_text:'0.2',unit:'pp'},prev_period:'2026-08-31'},source_inputs:['level:US_CPI_YOY:prev','level:US_CPI_YOY:latest']});
  expect(f.get('chg:US_DGS10')?.slots.change).toEqual({value_text:'-7',unit:'bp'});
  expect(f.get('chg:US_DTWEXBGS')?.slots.change).toEqual({value_text:'120.5/121.2',unit:'pct_ratio'});
  expect(f.has('obs:US_UNRATE')).toBe(true);expect(f.has('chg:US_UNRATE')).toBe(false);
  expect(f.has('obs:US_ISM_PMI')).toBe(false);
  expect(f.get('node:spread_us_cn_10y')).toMatchObject({kind:'derived',template:'derived_spread',slots:{a:'US_DGS10',b:'CN_CGB_10Y',period:'2026-09-30',value:{value_text:'2.31',unit:'pp_level'}},source_inputs:['spread:US_DGS10:latest','spread:CN_CGB_10Y:latest']});
  expect(f.get('evt:2026-09-18')).toMatchObject({kind:'policy_event',slots:{upper_from:{value_text:'3.75',unit:'pct'},upper_to:{value_text:'4',unit:'pct'},change:{value_text:'25',unit:'bp'}}});
  expect(JSON.stringify([...f.values()])).not.toMatch(/judgment|regime|f4/i);
 });
 it('spread is omitted when the two inputs have different period_end',async()=>{
  expect(byId(snapshotFacts(await build(setup(monthly('CN_CGB_10Y','2026-08',['1.9']))))).has('node:spread_us_cn_10y')).toBe(false);
 });
 it('peer region without a snapshot reads latestObservations as of the cutoff (source history)',async()=>{
  const m=await build(setup(monthly('CN_CGB_10Y','2026-09',['1.85']),false));
  expect(m.snapshots.CN).toBeNull();
  expect(m.inputs.find(i=>i.role==='spread:CN_CGB_10Y:latest')?.source).toEqual({kind:'history',as_of:'2026-10-15T06:00:00Z'});
 });
 it('rejects a manifest that is not a snapshot facts manifest',async()=>{
  const m=await build();
  expect(()=>snapshotFacts({...m,kind:'review'})).toThrow('not_snapshot_facts_manifest:review');
  expect(()=>snapshotFacts({...m,params:{...m.params,subject_kind:'review'}})).toThrow('not_snapshot_facts_manifest');
 });
});

describe('review explanation manifest and facts',()=>{
 const f=(id:string):Fact=>({fact_id:id,kind:'coverage',template:'coverage',slots:{},source_inputs:[]});
 const facts={region:'US' as const,month:'2026-10',cutoff:'',baseline_cutoff:'',snapshot_id:null,baseline_snapshot_id:null,baseline_missing:true,
  releases:[f('a')],revisions:[f('b')],timeliness:[f('c')],policy_events:[f('d')],episode_changes:[f('e')],asset_moves:[f('f')],coverage:[f('g')]};
 it('flattenReviewFacts keeps the seven sections in spec §6.2 order',()=>{
  expect(flattenReviewFacts(facts).map(x=>x.fact_id)).toEqual(['a','b','c','d','e','f','g']);
 });
 it('reviewFactsManifest re-keys the stored review manifest as explain_facts for that result',async()=>{
  const body={...(await build()),kind:'review' as const,params:{region:'US',month:'2026-10'}};
  const stored={manifest_id:'m-1',manifest_hash:'h',body,created_at:'2026-11-03T06:00:00Z'};
  const result={result_id:'r-1',region:'US' as const,month:'2026-10',status:'ok' as const,manifest_id:'m-1',manifest_hash:'h',facts,method_version:'macro-review/1',code_version:'c',created_at:''};
  const m=reviewFactsManifest(stored,result,'code-2');
  expect(m).toMatchObject({kind:'explain_facts',params:{region:'US',month:'2026-10',subject_kind:'review',result_id:'r-1',review_manifest_id:'m-1'},method_version:'macro-facts/1',code_version:'code-2',cutoff:body.cutoff});
  expect(m.inputs).toEqual(body.inputs);
  expect(m.facts).toEqual(flattenReviewFacts(facts));                         // frozen: the explanation needs neither the result nor the pointer
  expect(explanationFacts(JSON.parse(JSON.stringify(m)))).toEqual(flattenReviewFacts(facts));
  expect(()=>reviewFactsManifest(stored,{...result,manifest_id:'other'},'c')).toThrow('review_manifest_mismatch');
 });
 it('explanationFacts reads only body.facts of an explain_facts manifest',async()=>{
  const m=await build();
  expect(()=>explanationFacts({...m,facts:undefined})).toThrow('not_explain_facts_manifest:explain_facts');
  expect(()=>explanationFacts({...m,kind:'review'})).toThrow('not_explain_facts_manifest:review');
  const altered={...m,inputs:[]};                                             // inputs no longer matter once facts are frozen
  expect(explanationFacts(altered)).toEqual(m.facts);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/macro/strategy/facts.test.ts`
Expected: FAIL，`Failed to resolve import "./facts"`（或 `Cannot find module './facts'`）。

- [ ] **Step 3: 实现 `facts.ts`**

```ts
// src/lib/macro/strategy/facts.ts
// Facts (spec 2026-11-07 §6.1, macro-facts/1). A fact is a template id plus slots; every number lives in a slot as
// {value_text,unit} and is rendered by explain-render.ts, never written by a model. Every explanation binds to one
// 'explain_facts' manifest (the claim RPC requires that kind):
// - snapshot subject: buildSnapshotFactsManifest pins the requested snapshot (§4.5 "快照解读的清单": its region fixed,
//   cutoff = its created_at, peer = snapshotUpTo(peer, cutoff)) and freezes level / prev values, the spread inputs and the
//   policy events through manifestBuilder; snapshotFacts derives the facts from those inputs alone.
// - review subject: reviewFactsManifest wraps the stored review manifest of an immutable result (same frozen inputs,
//   kind 'explain_facts', params naming result_id and the review manifest); the facts are that result's ReviewFacts.
// Either way the exact fact list given to the model is frozen into body.facts before hashing, and explanationFacts reads
// only that list: an explanation's model input is rebuilt from its manifest alone. Percent changes are kept as the exact
// ratio (unit 'pct_ratio', value '<to>/<from>') and rounded once when rendered. No judgment field is read or produced
// (spec §7.7).
import type {ChangeKind,Fact,MacroSeriesDef,Region,ReviewFacts,ReviewResult,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {VERSIONS} from './contract';
import {inputRole,manifestBuilder,pinSnapshots} from './manifest';
import {pctRatio,sign,subtract,toBp} from './numeric';
import {readPolicyEvents} from './policy-events';
import type {StrategyReadPort} from './port';

/** The one derived node of a snapshot explanation: US 10Y minus CN 10Y, same period_end required (spec §5.1). */
export const SPREAD={id:'spread_us_cn_10y',a:'US_DGS10',b:'CN_CGB_10Y'} as const;
export const LEVEL_PURPOSE='level';export const SPREAD_PURPOSE='spread';
/** Indicators of a region that carry level facts: monthly / quarterly, and not the derive.from source of another row
 *  (raw indices and daily natives are evidence for the derived series, not facts of their own). */
export function levelIndicators<T extends Pick<MacroSeriesDef,'id'|'region'|'role'|'period'|'derive'>>(catalog:readonly T[],region:Region):T[]{
 const sources=new Set(catalog.flatMap(d=>d.derive?[d.derive.from]:[]));
 return catalog.filter(d=>d.region===region&&d.role==='indicator'&&d.period!=='day'&&!sources.has(d.id));
}
/** P1 typed change of one series: bp → exact toBp(to − from); pp / points → exact difference; pct → the exact ratio
 *  '<to>/<from>' (unit 'pct_ratio', rounded once at render) — null when the base is not positive. */
export function typedChange(kind:ChangeKind,from:string,to:string):{value_text:string;unit:string}|null{
 if(kind==='pct')return sign(from)<=0?null:{value_text:pctRatio(to,from),unit:'pct_ratio'};
 const d=subtract(to,from);
 return kind==='bp'?{value_text:toBp(d),unit:'bp'}:{value_text:d,unit:kind};
}
/** Manifest input ROLES ('events:<series>:evidence') of the given evidence observation ids (spec §6.1: source_inputs are
 *  roles, never observation ids). An id with no frozen evidence row is a builder bug and fails loudly. */
export function evidenceRoles(m:Pick<StrategyManifest,'inputs'>,ids:readonly string[]):string[]{
 const roles=new Set<string>();
 for(const id of new Set(ids)){
  const hit=m.inputs.filter(i=>i.observation_id===id&&i.role.endsWith(':evidence'));
  if(!hit.length)throw new Error(`unresolved_evidence:${id}`);
  for(const i of hit)roles.add(i.role);
 }
 return [...roles].sort();
}
export function eventFact(e:StrategyPolicyEvent,m:Pick<StrategyManifest,'inputs'>):Fact{
 return {fact_id:`evt:${e.effective_date}`,kind:'policy_event',template:'policy_event',
  slots:{date:e.effective_date,upper_from:{value_text:e.upper_from,unit:'pct'},upper_to:{value_text:e.upper_to,unit:'pct'},
   lower_from:{value_text:e.lower_from,unit:'pct'},lower_to:{value_text:e.lower_to,unit:'pct'},change:{value_text:e.change_bp,unit:'bp'}},
  period_end:e.effective_date,source_inputs:evidenceRoles(m,e.evidence)};
}
/** null = unknown or failed snapshot (the caller answers 404). */
export async function buildSnapshotFactsManifest(port:StrategyReadPort,snapshotId:string,codeVersion:string):Promise<StrategyManifest|null>{
 const pin=await pinSnapshots(port,snapshotId);
 if(!pin)return null;
 const region:Region=pin.snapshots.US?.snapshot_id===snapshotId?'US':'CN';
 const b=manifestBuilder(port,pin.cutoff);
 await b.useSnapshots(pin.snapshots);
 for(const d of levelIndicators(port.catalog(),region)){b.def(d.id);if(d.status==='active')await b.snapshotValue(d.id,LEVEL_PURPOSE,['prev']);}
 for(const id of [SPREAD.a,SPREAD.b])if(b.def(id)?.status==='active')await b.snapshotValue(id,SPREAD_PURPOSE);
 const {events,gaps}=await readPolicyEvents(b);
 const m=b.build({kind:'explain_facts',params:{subject_kind:'snapshot',snapshot_id:snapshotId,region},methodVersion:VERSIONS.facts,codeVersion,extra:{events,gaps}});
 return {...m,facts:snapshotFacts(m)};
}
/** Facts of a snapshot explanation: current level and typed change per indicator, the spread node, the latest policy event. */
export function snapshotFacts(m:StrategyManifest):Fact[]{
 if(m.kind!=='explain_facts'||m.params.subject_kind!=='snapshot')throw new Error(`not_snapshot_facts_manifest:${m.kind}`);
 const by=new Map(m.inputs.map(i=>[i.role,i]));const out:Fact[]=[];
 for(const d of m.catalog){
  const l=by.get(inputRole(LEVEL_PURPOSE,d.id,'latest'));if(!l)continue;
  out.push({fact_id:`obs:${d.id}`,kind:'level',template:'level',slots:{series:d.id,period:l.period_end,value:{value_text:l.value_text,unit:d.unit}},series_id:d.id,period_end:l.period_end,source_inputs:[l.role]});
  const p=by.get(inputRole(LEVEL_PURPOSE,d.id,'prev'));const c=p?typedChange(d.changeKind,p.value_text,l.value_text):null;
  if(p&&c)out.push({fact_id:`chg:${d.id}`,kind:'change',template:'change',slots:{series:d.id,prev_period:p.period_end,period:l.period_end,change:c},series_id:d.id,period_end:l.period_end,source_inputs:[p.role,l.role]});
 }
 const a=by.get(inputRole(SPREAD_PURPOSE,SPREAD.a,'latest'));const b=by.get(inputRole(SPREAD_PURPOSE,SPREAD.b,'latest'));
 if(a&&b&&a.period_end===b.period_end)out.push({fact_id:`node:${SPREAD.id}`,kind:'derived',template:'derived_spread',
  slots:{a:SPREAD.a,b:SPREAD.b,period:a.period_end,a_value:{value_text:a.value_text,unit:'pct'},b_value:{value_text:b.value_text,unit:'pct'},value:{value_text:subtract(a.value_text,b.value_text),unit:'pp_level'}},
  period_end:a.period_end,source_inputs:[a.role,b.role]});
 const events=[...(m.events??[])].sort((x,y)=>x.effective_date<y.effective_date?-1:x.effective_date>y.effective_date?1:0);
 const last=events[events.length-1];if(last)out.push(eventFact(last,m));
 return out;
}
/** Review explanation manifest: the stored review manifest's frozen content re-keyed as 'explain_facts' for that immutable
 *  result, with the result's facts frozen in body.facts. */
export function reviewFactsManifest(review:StoredManifest,result:ReviewResult,codeVersion:string):StrategyManifest{
 if(review.body.kind!=='review'||review.manifest_id!==result.manifest_id)throw new Error('review_manifest_mismatch');
 return {...review.body,kind:'explain_facts',params:{...review.body.params,subject_kind:'review',result_id:result.result_id,review_manifest_id:review.manifest_id},
  facts:flattenReviewFacts(result.facts),method_version:VERSIONS.facts,code_version:codeVersion};
}
/** The exact fact list of an explanation: body.facts of its 'explain_facts' manifest, nothing else. */
export function explanationFacts(m:StrategyManifest):Fact[]{
 if(m.kind!=='explain_facts'||!Array.isArray(m.facts))throw new Error(`not_explain_facts_manifest:${m.kind}`);
 return m.facts;
}
/** Review explanation facts: the seven sections in spec §6.2 order. */
export function flattenReviewFacts(f:ReviewFacts):Fact[]{
 return [...f.releases,...f.revisions,...f.timeliness,...f.policy_events,...f.episode_changes,...f.asset_moves,...f.coverage];
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/macro/strategy/facts.test.ts`
Expected: PASS，`Tests  11 passed (11)`。

- [ ] **Step 5: 写 `review.ts` 的失败测试**

```ts
// src/lib/macro/strategy/review.test.ts
import {describe,expect,it} from 'vitest';
import type {Fact,ObservationRow,SnapshotRecord} from './contract';
import {memoryStrategyDb} from './db';
import {assertMonth,assetColumns,buildReviewManifest,reviewFromManifest,runReview} from './review';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {daily,fixture,monthly,obs,snap} from './testing/fixture';

// Baseline snapshot (2026-09-14) holds August data; the October snapshot (2026-10-15) holds September data, a revised
// August unemployment rate (still the latest period: September not yet released) and nothing else new.
const BASE_ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7']),obs('US_UNRATE','2026-08-31','4.2'),...monthly('US_DGS10','2026-08',['4.23']),...monthly('US_DTWEXBGS','2026-08',['121.2'])];
const CUR_ROWS=[...monthly('US_CPI_YOY','2026-09',['2.9']),obs('US_UNRATE','2026-08-31','4.3',{version:2,availableAt:'2026-10-02T12:00:00Z'}),...monthly('US_DGS10','2026-09',['4.16']),...monthly('US_DTWEXBGS','2026-09',['120.5'])];
const MONTH_ENDS=[...monthly('US_WTI','2026-09',['62','60.5']),obs('US_DGS10','2026-10-31','4.08'),obs('US_DTWEXBGS','2026-10-31','121')];
// cuts 2025-09-17, 2025-10-29, 2025-12-10 (an ongoing cut episode at the baseline), then a hike on 2026-10-28
const EVENT_DAYS:[string,string,string][]=[['2025-09-16','4.5','4.25'],['2025-09-17','4.25','4'],['2025-10-29','4','3.75'],['2025-12-10','3.75','3.5'],['2026-10-28','4','3.75']];
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',EVENT_DAYS.map(([d,u])=>[d,u])),...daily('US_FED_TARGET_LOWER_D',EVENT_DAYS.map(([d,,l])=>[d,l]))];
const BASE_SNAP=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.map(o=>o.observation_id));
const CUR_SNAP=snap('US','2026-10-15T06:00:00Z',CUR_ROWS.map(o=>o.observation_id),{counts:{verified:21,missing:4,restricted:5}});
function port(snapshots:SnapshotRecord[]=[BASE_SNAP,CUR_SNAP],extra:ObservationRow[]=[]){
 return memoryStrategyPort(fixture({snapshots,observations:[...BASE_ROWS,...CUR_ROWS,...MONTH_ENDS,...EVENTS,...extra]}));
}
const ids=(fs:Fact[])=>fs.map(f=>f.fact_id);
const byId=(fs:Fact[])=>new Map(fs.map(f=>[f.fact_id,f]));

describe('month parameter',()=>{
 it('accepts YYYY-MM with a real month only',async()=>{
  expect(()=>assertMonth('2026-10')).not.toThrow();
  for(const bad of ['2026-13','2026-00','2026-1','26-10'])expect(()=>assertMonth(bad)).toThrow(`invalid_month:${bad}`);
  await expect(buildReviewManifest(port(),'US','2026-13','c')).rejects.toThrow('invalid_month:2026-13');
 });
 it('January reviews use the previous December as the baseline',async()=>{
  const m=await buildReviewManifest(port(),'US','2027-01','c');
  expect(m.cutoff).toBe('2027-02-03T00:00:00Z');expect(m.baseline?.cutoff).toBe('2027-01-03T00:00:00Z');
 });
});

describe('buildReviewManifest (spec §6.2 清单)',()=>{
 it('freezes both snapshots, month-end assets at both cutoffs, all events to the cutoff, timeliness at the cutoff date',async()=>{
  const p=port();const m=await buildReviewManifest(p,'US','2026-10','test-code');
  expect(m.kind).toBe('review');expect(m.params).toEqual({region:'US',month:'2026-10'});
  expect(m.cutoff).toBe('2026-11-03T00:00:00Z');
  expect(m.baseline?.cutoff).toBe('2026-10-03T00:00:00Z');
  expect(m.snapshots.US?.snapshot_id).toBe(CUR_SNAP.snapshot_id);expect(m.snapshots.CN).toBeNull();
  expect(m.baseline?.US?.snapshot_id).toBe(BASE_SNAP.snapshot_id);
  expect(m.method_version).toBe('macro-review/1');
  expect(m.inputs.find(i=>i.role==='review:US_UNRATE:latest')).toMatchObject({version:2,value_text:'4.3'});
  expect(m.inputs.find(i=>i.role==='review_base:US_UNRATE:latest')).toMatchObject({version:1,value_text:'4.2'});
  expect(m.inputs.find(i=>i.role==='asset_end:US_DGS10:month_end')).toMatchObject({series_id:'US_DGS10',period_end:'2026-10-31',value_text:'4.08',source:{kind:'history',as_of:'2026-11-03T00:00:00Z'}});
  expect(m.inputs.find(i=>i.role==='asset_base:US_WTI:month_end')).toMatchObject({period_end:'2026-09-30',value_text:'62',source:{kind:'history',as_of:'2026-10-03T00:00:00Z'}});
  expect(m.reads).toContainEqual({series_id:'US_UNRATE',purpose:'review_base',state:'ok'});
  expect(m.events?.map(e=>e.effective_date)).toEqual(['2025-09-17','2025-10-29','2025-12-10','2026-10-28']);
  const unrate=p.catalog().find(d=>d.id==='US_UNRATE')!;
  expect(m.timeliness).toContainEqual({series_id:'US_UNRATE',state:p.timeliness(unrate,'2026-08-31','2026-11-03')});
  expect(m.catalog.some(d=>d.id==='US_ISM_PMI'&&d.status==='missing')).toBe(true);
 });
 it('an asset whose latest observation at the cutoff is not that month-end is not frozen (read state missing)',async()=>{
  const m=await buildReviewManifest(port([BASE_SNAP,CUR_SNAP]),'US','2026-11','c');
  expect(m.inputs.find(i=>i.role==='asset_end:US_WTI:month_end')).toBeUndefined();
  expect(m.reads).toContainEqual({series_id:'US_WTI',purpose:'asset_end',state:'missing'});
  expect(byId(reviewFromManifest(m).facts.asset_moves).get('mv:US_WTI')).toMatchObject({template:'asset_missing',slots:{reason:'out_of_coverage',base_month:'2026-10',month:'2026-11'}});
 });
});

describe('reviewFromManifest — seven sections (spec §6.2)',()=>{
 it('releases, revisions (latest period only), timeliness, events, episodes opened/ended, asset moves, coverage',async()=>{
  const p=port();const m=await buildReviewManifest(p,'US','2026-10','c');const {status,facts}=reviewFromManifest(m);
  expect(status).toBe('ok');
  expect(facts).toMatchObject({region:'US',month:'2026-10',cutoff:'2026-11-03T00:00:00Z',baseline_cutoff:'2026-10-03T00:00:00Z',snapshot_id:CUR_SNAP.snapshot_id,baseline_snapshot_id:BASE_SNAP.snapshot_id,baseline_missing:false});
  const rel=byId(facts.releases);
  expect(rel.get('rel:US_CPI_YOY')).toMatchObject({template:'release',slots:{prev_period:'2026-08-31',prev_value:{value_text:'2.7',unit:'pct'},period:'2026-09-30',value:{value_text:'2.9',unit:'pct'}}});
  expect(rel.has('rel:US_UNRATE')).toBe(false);
  expect(ids(facts.revisions)).toEqual(['rev:US_UNRATE']);
  expect(facts.revisions[0].slots).toMatchObject({period:'2026-08-31',from:{value_text:'4.2',unit:'pct'},to:{value_text:'4.3',unit:'pct'}});
  expect(facts.revisions[0].source_inputs).toEqual(['review_base:US_UNRATE:latest','review:US_UNRATE:latest']);
  const lateOrMissing=(m.timeliness??[]).filter(t=>t.state==='late'||t.state==='missing').map(t=>`tml:${t.series_id}`);
  expect(ids(facts.timeliness)).toEqual(lateOrMissing);
  expect(ids(facts.timeliness)).toContain('tml:US_UNRATE');
  expect(byId(facts.timeliness).get('tml:US_UNRATE')).toMatchObject({template:'timeliness_late',slots:{date:'2026-11-03',period:'2026-08-31'}});
  expect(ids(facts.policy_events)).toEqual(['evt:2026-10-28']);
  expect(ids(facts.episode_changes)).toEqual(['ep:cut:2025-09-17:ended','ep:hike:2026-10-28:opened']);
  expect(facts.episode_changes[0].slots).toMatchObject({direction:'cut',start:'2025-09-17',end:'2025-12-10',events:{value_text:'3',unit:'count'},cumulative:{value_text:'-75',unit:'bp'}});
  const mv=byId(facts.asset_moves);
  expect(mv.get('mv:US_UST10Y')).toMatchObject({template:'asset_move',slots:{base_period:'2026-09-30',period:'2026-10-31',change:{value_text:'-8',unit:'bp'}}});
  expect(mv.get('mv:US_WTI')?.slots.change).toEqual({value_text:'60.5/62',unit:'pct_ratio'});
  expect(mv.get('mv:US_DTWEXBGS')?.slots.change).toEqual({value_text:'121/120.5',unit:'pct_ratio'});
  expect(mv.has('mv:US_SP500')).toBe(false);
  expect(byId(facts.coverage).get('cov:counts')?.slots).toEqual({verified:{value_text:'21',unit:'count'},missing:{value_text:'4',unit:'count'},restricted:{value_text:'5',unit:'count'}});
  expect(ids(facts.coverage)).toEqual(expect.arrayContaining(['cov:US_ISM_PMI','cov:US_SP500']));
 });
 it('no snapshot at the cutoff → insufficient; snapshot sections empty; events and episodes still computed',async()=>{
  const {status,facts}=reviewFromManifest(await buildReviewManifest(port([]),'US','2026-10','c'));
  expect(status).toBe('insufficient');
  expect(facts.snapshot_id).toBeNull();expect(facts.baseline_missing).toBe(true);
  expect(facts.releases).toEqual([]);expect(facts.revisions).toEqual([]);expect(facts.timeliness).toEqual([]);expect(facts.coverage).toEqual([]);
  expect(ids(facts.policy_events)).toEqual(['evt:2026-10-28']);
 });
 it('a truncated event history is an explicit events_truncated fact in sections 4 and 5, never an empty section',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  const cut={...m,events:[],gaps:[{kind:'history_truncated' as const,reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]};
  const {facts}=reviewFromManifest(cut);
  expect(facts.policy_events).toEqual([{fact_id:'evt:truncated',kind:'coverage',template:'events_truncated',slots:{date:'2026-11-03',sources:'US_FED_TARGET_UPPER_D'},source_inputs:[]}]);
  expect(ids(facts.episode_changes)).toEqual(['ep:truncated']);
  expect(ids(facts.releases)).toEqual(ids(reviewFromManifest(m).facts.releases));   // other sections unaffected
 });
 it('missing baseline → sections 1 and 2 empty and flagged; the rest as usual',async()=>{
  const {status,facts}=reviewFromManifest(await buildReviewManifest(port([CUR_SNAP]),'US','2026-10','c'));
  expect(status).toBe('ok');expect(facts.baseline_missing).toBe(true);
  expect(facts.releases).toEqual([]);expect(facts.revisions).toEqual([]);
  expect(facts.coverage.length).toBeGreaterThan(0);
 });
 it('a series absent from the baseline snapshot is a first release',async()=>{
  const thin=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.filter(o=>o.series_id!=='US_CPI_YOY').map(o=>o.observation_id));
  const {facts}=reviewFromManifest(await buildReviewManifest(port([thin,CUR_SNAP]),'US','2026-10','c'));
  expect(byId(facts.releases).get('rel:US_CPI_YOY')?.template).toBe('release_first');
 });
 it('an incomplete baseline read (unresolved snapshot id) yields no release_first / revision, only explicit baseline_unavailable facts',async()=>{
  const broken=snap('US','2026-09-14T06:00:00Z',[...BASE_ROWS.map(o=>o.observation_id),'obs:not-in-store']);
  const m=await buildReviewManifest(port([broken,CUR_SNAP]),'US','2026-10','c');
  expect(m.reads).toContainEqual({series_id:'US_CPI_YOY',purpose:'review_base',state:'truncated'});
  const {facts}=reviewFromManifest(m);
  expect(facts.releases).toEqual([]);expect(facts.revisions).toEqual([]);
  const gap=byId(facts.coverage).get('cov:base:US_CPI_YOY');
  expect(gap).toMatchObject({kind:'coverage',template:'baseline_unavailable',slots:{series:'US_CPI_YOY',state:'truncated'},series_id:'US_CPI_YOY',source_inputs:['review:US_CPI_YOY:latest']});
  expect(ids(facts.coverage)).toEqual(expect.arrayContaining(['cov:base:US_UNRATE','cov:counts']));
  expect(facts.baseline_missing).toBe(false);
 });
 it('every emitted source_inputs entry is a manifest input role (event and episode facts included)',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  const roles=new Set(m.inputs.map(i=>i.role));
  const f=reviewFromManifest(m).facts;
  const all=[...f.releases,...f.revisions,...f.timeliness,...f.policy_events,...f.episode_changes,...f.asset_moves,...f.coverage];
  expect(f.policy_events.length+f.episode_changes.length).toBeGreaterThan(0);
  for(const fact of all)for(const r of fact.source_inputs)expect(roles.has(r),`${fact.fact_id}:${r}`).toBe(true);
  expect(byId(f.policy_events).get('evt:2026-10-28')?.source_inputs).toEqual(['events:US_FED_TARGET_LOWER_D:evidence','events:US_FED_TARGET_UPPER_D:evidence']);
 });
 it('non-positive base on a pct asset → asset_missing(non_positive_base)',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  const bad={...m,inputs:m.inputs.map(i=>i.role==='asset_base:US_WTI:month_end'?{...i,value_text:'-5'}:i)};
  expect(byId(reviewFromManifest(bad).facts.asset_moves).get('mv:US_WTI')).toMatchObject({template:'asset_missing',slots:{reason:'non_positive_base'}});
 });
 it('is a pure function of the manifest (JSON round trip gives the same facts) and rejects other kinds',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  expect(reviewFromManifest(JSON.parse(JSON.stringify(m)))).toEqual(reviewFromManifest(m));
  expect(()=>reviewFromManifest({...m,kind:'transmission'})).toThrow('not_review_manifest:transmission');
 });
 it('asset columns: active monthly assets plus the perspective series; restricted excluded; aliasOf resolved',()=>{
  const cols=assetColumns(port().catalog(),'US');
  const byCol=new Map(cols.map(c=>[c.def.id,c]));
  expect(byCol.get('US_UST10Y')).toMatchObject({readId:'US_DGS10',kind:'bp'});
  expect(byCol.get('US_DTWEXBGS')).toMatchObject({readId:'US_DTWEXBGS',kind:'pct'});
  expect(byCol.has('US_SP500')).toBe(false);
 });
});

describe('runReview (spec §6.2 生成)',()=>{
 it('first run advances to generation 1; the same inputs replay; preview writes nothing',async()=>{
  const db=memoryStrategyDb();const deps={port:port(),db,codeVersion:'c'};
  const pre=await runReview(deps,'US','2026-10',{preview:true});
  expect(pre).toMatchObject({outcome:'preview',status:'ok',result_id:null,generation:0});
  expect(pre.manifest_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(await db.reviewCurrent('US','2026-10')).toBeNull();
  const a=await runReview(deps,'US','2026-10',{preview:false});
  expect(a).toMatchObject({outcome:'advanced',generation:1,status:'ok',manifest_hash:pre.manifest_hash});
  const b=await runReview(deps,'US','2026-10',{preview:false});
  expect(b).toMatchObject({outcome:'replayed',generation:1,result_id:a.result_id});
  const cur=await db.reviewCurrent('US','2026-10');
  expect(cur?.result.facts.policy_events.map(f=>f.fact_id)).toEqual(['evt:2026-10-28']);
 });
 it('a failure records a failed attempt and leaves the pointer untouched',async()=>{
  const db=memoryStrategyDb();const attempts:unknown[]=[];
  db.recordReviewAttempt=async(region,month,status,error)=>{attempts.push({region,month,status,error});};
  const broken:StrategyReadPort=port();broken.snapshotUpTo=async()=>{throw new Error('truncated');};
  const r=await runReview({port:broken,db,codeVersion:'c'},'US','2026-10',{preview:false});
  expect(r).toMatchObject({outcome:'failed',error:'truncated',result_id:null});
  expect(attempts).toEqual([{region:'US',month:'2026-10',status:'failed',error:{message:'truncated'}}]);
  expect(await db.reviewCurrent('US','2026-10')).toBeNull();
 });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm test -- src/lib/macro/strategy/review.test.ts`
Expected: FAIL，`Failed to resolve import "./review"`。

- [ ] **Step 7: 实现 `review.ts`**

```ts
// src/lib/macro/strategy/review.ts
// Monthly review (spec 2026-11-07 §6.2, macro-review/1): a month-end vs month-end comparison, not a daily activity
// ledger. cutoff = the 3rd of the next month 00:00:00Z, baseline cutoff = the 3rd of the review month (manifest.ts
// monthCutoff); the cutoff decides what was known, the compared periods stay month end vs month end. buildReviewManifest uses two manifest builders — one per cutoff — and merges them: the region's snapshot at
// each cutoff (snapshotUpTo; ties by snapshot_id) with the latest value per level indicator (purposes 'review' and
// 'review_base'), the month's and the previous month's month-end asset rows (seriesHistory asOf each cutoff, purposes
// 'asset_end' / 'asset_base'), every policy event up to the cutoff, the catalog projection of the region and the timeliness
// states computed for the cutoff date. reviewFromManifest is pure and reads only the manifest (replay never touches the
// port or the live catalog); snapshot sections use only inputs whose source is the snapshot. Episode identity =
// (direction, start); "opened" = present at the cutoff, absent at the baseline; "ended" = ongoing at the baseline, present and
// no longer ongoing at the cutoff. A history_truncated event gap puts one explicit 'events_truncated' fact into both the
// policy_events and episode_changes sections (never an ordinary empty section). Percent asset moves keep the exact ratio
// (unit 'pct_ratio'). runReview drives one (region, month) unit for the cron.
import type {Episode,Fact,FrozenSeriesDef,ManifestInput,ManifestRead,Region,ReviewFacts,ReviewStatus,SnapshotRecord,StrategyManifest,StrategyPolicyEvent,Timeliness} from './contract';
import {VERSIONS} from './contract';
import {policyEpisodes} from './cycle-table';
import type {StrategyDb} from './db';
import {eventFact,evidenceRoles,levelIndicators} from './facts';
import {inputRole,inputsWithRole,manifestBuilder,manifestHash,monthCutoff,monthEnd,monthOf,prevMonth,readState,utcDate} from './manifest';
import {pctRatio,sign,subtract,toBp} from './numeric';
import {readPolicyEvents} from './policy-events';
import type {StrategyReadPort} from './port';

const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
export const REVIEW_PURPOSE='review';export const BASELINE_PURPOSE='review_base';
export const ASSET_END_PURPOSE='asset_end';export const ASSET_BASE_PURPOSE='asset_base';
/** Perspective columns that are indicators in P1 but appear as asset moves (spec §5.5 columns). */
export const PERSPECTIVE_SERIES:Record<Region,readonly string[]>={US:['US_DTWEXBGS'],CN:['CN_USDCNY_CP']};
export function assertMonth(month:string):void{if(!MONTH.test(month))throw new Error(`invalid_month:${month}`);}
/** Asset-move columns of a region: active monthly assets plus the perspective series; aliasOf resolves the series read. */
export function assetColumns(catalog:readonly FrozenSeriesDef[],region:Region):{def:FrozenSeriesDef;readId:string;kind:'pct'|'bp'}[]{
 return catalog.filter(d=>d.region===region&&d.status==='active'&&d.period==='month'&&(d.role==='asset'||PERSPECTIVE_SERIES[region].includes(d.id)))
  .map(d=>({def:d,readId:d.aliasOf??d.id,kind:d.changeKind==='bp'?'bp' as const:'pct' as const}));
}
const byKey=<T>(k:(x:T)=>string)=>(x:T,y:T)=>k(x)<k(y)?-1:k(x)>k(y)?1:0;

export async function buildReviewManifest(port:StrategyReadPort,region:Region,month:string,codeVersion:string):Promise<StrategyManifest>{
 assertMonth(month);
 const baseMonth=prevMonth(month);const cutoff=monthCutoff(month);const baselineCutoff=monthCutoff(baseMonth);const end=monthEnd(month);const today=utcDate(cutoff);
 const [cur,base]=await Promise.all([port.snapshotUpTo(region,cutoff),port.snapshotUpTo(region,baselineCutoff)]);
 const pair=(s:SnapshotRecord|null)=>region==='US'?{US:s,CN:null}:{US:null,CN:s};
 const b=manifestBuilder(port,cutoff);const bb=manifestBuilder(port,baselineCutoff);
 await b.useSnapshots(pair(cur));await bb.useSnapshots(pair(base));
 const live=port.catalog();
 for(const d of live)if(d.region===region&&d.role!=='event_source')b.def(d.id);
 const inSnapshot=(s:SnapshotRecord|null)=>{const ids=new Set(s?[...s.observation_ids,...s.history_ids]:[]);return (id:string|undefined)=>id!==undefined&&ids.has(id);};
 const inCur=inSnapshot(cur);
 const timeliness:{series_id:string;state:Timeliness}[]=[];
 for(const d of levelIndicators(live,region)){
  if(d.status!=='active')continue;
  if(cur){const l=await b.snapshotValue(d.id,REVIEW_PURPOSE);timeliness.push({series_id:d.id,state:port.timeliness(d,inCur(l?.observation_id)?l!.period_end:null,today)});}
  if(base)await bb.snapshotValue(d.id,BASELINE_PURPOSE);
 }
 for(const c of assetColumns(live,region)){
  await b.history(c.readId,ASSET_END_PURPOSE,'month_end',{from:`${month}-01`,to:end});
  await bb.history(c.readId,ASSET_BASE_PURPOSE,'month_end',{from:`${baseMonth}-01`,to:monthEnd(baseMonth)});
 }
 const {events,gaps}=await readPolicyEvents(b);
 const params={region,month};
 const mb=bb.build({kind:'review',params,methodVersion:VERSIONS.review,codeVersion});
 const m=b.build({kind:'review',params,methodVersion:VERSIONS.review,codeVersion,extra:{baseline:{cutoff:baselineCutoff,...mb.snapshots},events,gaps,timeliness}});
 const catalog=new Map(m.catalog.map(d=>[d.id,d]));for(const d of mb.catalog)if(!catalog.has(d.id))catalog.set(d.id,d);
 return {...m,catalog:[...catalog.values()].sort(byKey<FrozenSeriesDef>(d=>d.id)),
  reads:[...m.reads,...mb.reads].sort(byKey<ManifestRead>(r=>`${r.purpose}|${r.series_id}`)),
  inputs:[...m.inputs,...mb.inputs].sort(byKey<ManifestInput>(i=>`${i.role}|${i.period_end}|${i.observation_id}`))};
}

const episodeKey=(e:Pick<Episode,'direction'|'start'>)=>`${e.direction}:${e.start}`;
function episodeFact(e:Episode,change:'opened'|'ended',events:readonly StrategyPolicyEvent[],m:StrategyManifest):Fact{
 const evidence=events.filter(x=>x.effective_date>=e.start&&x.effective_date<=e.end).flatMap(x=>[...x.evidence]);
 return {fact_id:`ep:${episodeKey(e)}:${change}`,kind:'episode',template:change==='opened'?'episode_opened':'episode_ended',
  slots:{direction:e.direction,start:e.start,end:e.end,events:{value_text:String(e.events),unit:'count'},upper_from:{value_text:e.upper_from,unit:'pct'},upper_to:{value_text:e.upper_to,unit:'pct'},cumulative:{value_text:e.cumulative_bp,unit:'bp'}},
  period_end:e.end,source_inputs:evidenceRoles(m,evidence)};
}
/** Pure: the seven sections from the manifest alone. status = 'insufficient' when the month has no snapshot (reason no_snapshot). */
export function reviewFromManifest(m:StrategyManifest):{status:ReviewStatus;facts:ReviewFacts}{
 if(m.kind!=='review'||!m.baseline)throw new Error(`not_review_manifest:${m.kind}`);
 const region=String(m.params.region) as Region;const month=String(m.params.month);const baseMonth=prevMonth(month);const today=utcDate(m.cutoff);
 const cur=m.snapshots[region];const base=m.baseline[region];
 const snapIn=(purpose:string,id:string)=>m.inputs.find(i=>i.role===inputRole(purpose,id,'latest')&&i.source.kind==='snapshot')??null;
 const indicators=levelIndicators(m.catalog,region).filter(d=>d.status==='active');
 const releases:Fact[]=[];const revisions:Fact[]=[];const baselineGaps:Fact[]=[];
 if(cur&&base)for(const d of indicators){
  const l=snapIn(REVIEW_PURPOSE,d.id);const b=snapIn(BASELINE_PURPOSE,d.id);if(!l)continue;
  const value={value_text:l.value_text,unit:d.unit};
  if(!b){
   // A truncated (or never recorded) baseline read proves nothing about the baseline: no release_first / revision is produced
   // and the evidence gap is an explicit coverage fact. 'ok' (read outside the snapshot) and 'missing' stay confirmed absences.
   const state=readState(m,d.id,BASELINE_PURPOSE);
   if(state==='truncated'||state===null){baselineGaps.push({fact_id:`cov:base:${d.id}`,kind:'coverage',template:'baseline_unavailable',slots:{series:d.id,state:state??'not_read'},series_id:d.id,source_inputs:[l.role]});continue;}
   releases.push({fact_id:`rel:${d.id}`,kind:'release',template:'release_first',slots:{series:d.id,period:l.period_end,value},series_id:d.id,period_end:l.period_end,source_inputs:[l.role]});
  }
  else if(l.period_end>b.period_end)releases.push({fact_id:`rel:${d.id}`,kind:'release',template:'release',slots:{series:d.id,prev_period:b.period_end,prev_value:{value_text:b.value_text,unit:d.unit},period:l.period_end,value},series_id:d.id,period_end:l.period_end,source_inputs:[b.role,l.role]});
  else if(l.period_end===b.period_end&&l.version>b.version)revisions.push({fact_id:`rev:${d.id}`,kind:'revision',template:'revision',slots:{series:d.id,period:l.period_end,from:{value_text:b.value_text,unit:d.unit},to:value},series_id:d.id,period_end:l.period_end,source_inputs:[b.role,l.role]});
 }
 const timeliness:Fact[]=[];
 for(const t of m.timeliness??[]){
  if(t.state!=='late'&&t.state!=='missing')continue;
  const l=snapIn(REVIEW_PURPOSE,t.series_id);
  timeliness.push(t.state==='late'&&l
   ?{fact_id:`tml:${t.series_id}`,kind:'timeliness',template:'timeliness_late',slots:{series:t.series_id,date:today,period:l.period_end},series_id:t.series_id,period_end:l.period_end,source_inputs:[l.role]}
   :{fact_id:`tml:${t.series_id}`,kind:'timeliness',template:'timeliness_missing',slots:{series:t.series_id,date:today},series_id:t.series_id,source_inputs:[]});
 }
 const events=[...(m.events??[])].sort((x,y)=>x.effective_date<y.effective_date?-1:x.effective_date>y.effective_date?1:0);
 const gaps=m.gaps??[];
 const truncated=gaps.find(g=>g.kind==='history_truncated');
 const truncatedFact=(section:'evt'|'ep'):Fact=>({fact_id:`${section}:truncated`,kind:'coverage',template:'events_truncated',slots:{date:truncated!.near,sources:truncated!.reason},source_inputs:[]});
 const policy_events=truncated?[truncatedFact('evt')]:events.filter(e=>monthOf(e.effective_date)===month).map(e=>eventFact(e,m));
 const cutDate=utcDate(m.cutoff);const baseDate=utcDate(m.baseline.cutoff);
 const episode_changes:Fact[]=[];
 if(truncated)episode_changes.push(truncatedFact('ep'));
 else{
  const atCut=policyEpisodes(events,gaps,cutDate);const atBase=new Map(policyEpisodes(events.filter(e=>e.effective_date<=baseDate),gaps,baseDate).map(e=>[episodeKey(e),e]));
  for(const e of atCut){
   const prior=atBase.get(episodeKey(e));
   if(!prior)episode_changes.push(episodeFact(e,'opened',events,m));
   else if(prior.ongoing&&!e.ongoing)episode_changes.push(episodeFact(e,'ended',events,m));
  }
 }
 const asset_moves:Fact[]=[];
 for(const c of assetColumns(m.catalog,region)){
  const end=inputsWithRole(m,inputRole(ASSET_END_PURPOSE,c.readId,'month_end')).find(i=>monthOf(i.period_end)===month);
  const start=inputsWithRole(m,inputRole(ASSET_BASE_PURPOSE,c.readId,'month_end')).find(i=>monthOf(i.period_end)===baseMonth);
  const missing=(reason:string):Fact=>({fact_id:`mv:${c.def.id}`,kind:'asset_move',template:'asset_missing',slots:{series:c.def.id,base_month:baseMonth,month,reason},series_id:c.def.id,source_inputs:[start,end].filter((x):x is ManifestInput=>!!x).map(x=>x.role)});
  if(!end||!start){asset_moves.push(missing('out_of_coverage'));continue;}
  let change:{value_text:string;unit:string};
  if(c.kind==='bp')change={value_text:toBp(subtract(end.value_text,start.value_text)),unit:'bp'};
  else if(sign(start.value_text)<=0){asset_moves.push(missing('non_positive_base'));continue;}
  else change={value_text:pctRatio(end.value_text,start.value_text),unit:'pct_ratio'};
  asset_moves.push({fact_id:`mv:${c.def.id}`,kind:'asset_move',template:'asset_move',
   slots:{series:c.def.id,base_period:start.period_end,period:end.period_end,from:{value_text:start.value_text,unit:c.def.unit},to:{value_text:end.value_text,unit:c.def.unit},change},
   series_id:c.def.id,period_end:end.period_end,source_inputs:[start.role,end.role]});
 }
 const coverage:Fact[]=[];
 if(cur){
  const n=cur.catalog_counts;
  coverage.push({fact_id:'cov:counts',kind:'coverage',template:'coverage',slots:{verified:{value_text:String(n.verified),unit:'count'},missing:{value_text:String(n.missing),unit:'count'},restricted:{value_text:String(n.restricted),unit:'count'}},source_inputs:[]});
  for(const d of m.catalog)if(d.region===region&&d.role!=='event_source'&&(d.status==='missing'||d.status==='restricted'))
   coverage.push({fact_id:`cov:${d.id}`,kind:'coverage',template:'catalog_unavailable',slots:{series:d.id,status:d.status},series_id:d.id,source_inputs:[]});
 }
 coverage.push(...baselineGaps);
 return {status:cur?'ok':'insufficient',facts:{region,month,cutoff:m.cutoff,baseline_cutoff:m.baseline.cutoff,snapshot_id:cur?.snapshot_id??null,baseline_snapshot_id:base?.snapshot_id??null,baseline_missing:!base,
  releases,revisions,timeliness,policy_events,episode_changes,asset_moves,coverage}};
}

export interface ReviewReceipt{region:Region;month:string;outcome:'advanced'|'replayed'|'stale'|'preview'|'failed';status:ReviewStatus|null;manifest_hash:string|null;manifest_id:string|null;result_id:string|null;generation:number|null;error?:string}
/** One cron unit. preview → zero writes. Any exception → failed attempt logged, pointer untouched; stale is an outcome, not an error. */
export async function runReview(d:{port:StrategyReadPort;db:StrategyDb;codeVersion:string},region:Region,month:string,opts:{preview:boolean}):Promise<ReviewReceipt>{
 const empty={status:null,manifest_hash:null,manifest_id:null,result_id:null,generation:null};
 try{
  const current=await d.db.reviewCurrent(region,month);
  const body=await buildReviewManifest(d.port,region,month,d.codeVersion);
  const {status,facts}=reviewFromManifest(body);
  if(opts.preview)return {...empty,region,month,outcome:'preview',status,manifest_hash:manifestHash(body),generation:current?.generation??0};
  const stored=await d.db.putManifest(body);
  const r=await d.db.publishReview({region,month,expectedGeneration:current?.generation??0,cutoff:body.cutoff,status,manifestId:stored.manifest_id,manifestHash:stored.manifest_hash,facts,methodVersion:VERSIONS.review,codeVersion:d.codeVersion});
  return {region,month,outcome:r.outcome,status,manifest_hash:stored.manifest_hash,manifest_id:stored.manifest_id,result_id:r.result_id,generation:r.generation};
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  if(!opts.preview){try{await d.db.recordReviewAttempt(region,month,'failed',{message});}catch{/* the attempt log is best-effort; the pointer is already untouched */}}
  return {...empty,region,month,outcome:'failed',error:message};
 }
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm test -- src/lib/macro/strategy/review.test.ts src/lib/macro/strategy/facts.test.ts`
Expected: PASS，`Tests  25 passed (25)`。

- [ ] **Step 9: 复盘重放用例（§12 `replay.test.ts`）**

Part B 的共享重放场景只有一对快照、没有基线快照，且其用例框架要求用例 id 等于清单 `kind`，所以复盘用例自带场景（与 `review.test.ts` 相同的数据，目录取 `FIXTURE_CATALOG` 中复盘读到的 14 行子集以控制夹具大小），沿用 Part B 的录制开关 `MACRO_REPLAY_RECORD=1` 与同一个 `fixtures/replay/` 目录，夹具文件 `review-us-2026-10.json` 存 `{manifest_hash, manifest, expected}`。

在 `src/lib/macro/strategy/replay.test.ts`（Task 8 已创建）中改 3 行 import：

```ts
import type {ObservationRow,ReviewFacts,ReviewStatus,StoredManifest,StrategyManifest} from './contract';
```
（替换原 `import type {ObservationRow,StoredManifest,StrategyManifest} from './contract';`）

```ts
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {buildReviewManifest,reviewFromManifest} from './review';
```
（在原 `./port` 那一行之后加 `./review` 一行）

```ts
import {daily,FIXTURE_CATALOG,fixture,monthly,obs,snap} from './testing/fixture';
```
（替换原 `import {daily,fixture,monthly,obs,snap} from './testing/fixture';`）

在该文件**末尾**追加（复用该文件已有的 `DIR`、`CODE`、`beforeAll`、`readFileSync`、`writeFileSync`、`manifestHash`、`subtract`、`toBp`）：

```ts
// ---------------------------------------------------------------- review (Part C, Task 9): its own scenario
// Part B's shared scenario has one snapshot pair and no baseline snapshot, so the review case carries its own: US 2026-10,
// baseline snapshot with August data, October snapshot with September data and a revised August unemployment rate,
// month-end assets for September and October, three 2025 cuts and a 2026-10-28 hike. The catalog is the FIXTURE_CATALOG
// subset the review reads, so the committed manifest stays small. Recorded together with the cases above
// (MACRO_REPLAY_RECORD=1); the committed file holds {manifest_hash, manifest, expected}.
const REVIEW_FILE=`${DIR}review-us-2026-10.json`;
const REVIEW_IDS=['US_CPI_YOY','US_UNRATE','US_ISM_PMI','US_DGS10_D','US_DGS10','US_DTWEXBGS_D','US_DTWEXBGS','US_WTI_D','US_WTI','US_UST10Y','US_SP500','US_FED_TARGET_D','US_FED_TARGET_UPPER_D','US_FED_TARGET_LOWER_D'];
function reviewScenario(){
 const base=[...monthly('US_CPI_YOY','2026-08',['2.7']),obs('US_UNRATE','2026-08-31','4.2'),...monthly('US_DGS10','2026-08',['4.23']),...monthly('US_DTWEXBGS','2026-08',['121.2'])];
 const cur=[...monthly('US_CPI_YOY','2026-09',['2.9']),obs('US_UNRATE','2026-08-31','4.3',{version:2,availableAt:'2026-10-02T12:00:00Z'}),...monthly('US_DGS10','2026-09',['4.16']),...monthly('US_DTWEXBGS','2026-09',['120.5'])];
 const monthEnds=[...monthly('US_WTI','2026-09',['62','60.5']),obs('US_DGS10','2026-10-31','4.08'),obs('US_DTWEXBGS','2026-10-31','121')];
 const days:[string,string,string][]=[['2025-09-16','4.5','4.25'],['2025-09-17','4.25','4'],['2025-10-29','4','3.75'],['2025-12-10','3.75','3.5'],['2026-10-28','4','3.75']];
 return fixture({catalog:FIXTURE_CATALOG.filter(d=>REVIEW_IDS.includes(d.id)),
  snapshots:[snap('US','2026-09-14T06:00:00Z',base.map(o=>o.observation_id)),snap('US','2026-10-15T06:00:00Z',cur.map(o=>o.observation_id),{counts:{verified:21,missing:4,restricted:5}})],
  observations:[...base,...cur,...monthEnds,...daily('US_FED_TARGET_UPPER_D',days.map(([d,u])=>[d,u])),...daily('US_FED_TARGET_LOWER_D',days.map(([d,,l])=>[d,l]))]});
}
type ReviewFixture={manifest_hash:string;manifest:StrategyManifest;expected:{status:ReviewStatus;facts:ReviewFacts}};
const buildReview=()=>buildReviewManifest(memoryStrategyPort(reviewScenario()),'US','2026-10',CODE);
describe('replay review US 2026-10 (spec §6.2, §12: the view reads the committed manifest only)',()=>{
 beforeAll(async()=>{
  if(process.env.MACRO_REPLAY_RECORD!=='1')return;
  const manifest=await buildReview();
  writeFileSync(REVIEW_FILE,`${JSON.stringify({manifest_hash:manifestHash(manifest),manifest,expected:reviewFromManifest(manifest)})}\n`);
 });
 const fx=()=>JSON.parse(readFileSync(REVIEW_FILE,'utf8')) as ReviewFixture;
 it('manifest_hash is the hash of the committed body',()=>{
  expect(fx().manifest_hash).toBe(manifestHash(fx().manifest));
 });
 it('reviewFromManifest(committed manifest) deep-equals the committed expected facts',()=>{
  expect(JSON.parse(JSON.stringify(reviewFromManifest(fx().manifest)))).toEqual(fx().expected);
 });
 it('every committed fact source_inputs entry resolves to a role of the committed manifest',()=>{
  const roles=new Set(fx().manifest.inputs.map(i=>i.role));const f=fx().expected.facts;
  const all=[...f.releases,...f.revisions,...f.timeliness,...f.policy_events,...f.episode_changes,...f.asset_moves,...f.coverage];
  for(const fact of all)for(const r of fact.source_inputs)expect(roles.has(r),`${fact.fact_id}:${r}`).toBe(true);
 });
 it('the builder still produces the committed manifest (same hash) from the scenario',async()=>{
  expect(manifestHash(await buildReview()),'builder output changed: re-record with MACRO_REPLAY_RECORD=1 only if the change is intended').toBe(fx().manifest_hash);
 });
 it('hand-computed: releases, the revision, the October event, episode ended / opened, asset moves, coverage',()=>{
  const f=fx().expected.facts;
  expect(fx().expected.status).toBe('ok');
  expect(f.releases.map(x=>x.fact_id)).toEqual(['rel:US_CPI_YOY','rel:US_DGS10','rel:US_DTWEXBGS']);
  expect(f.revisions).toHaveLength(1);
  expect(f.revisions[0].slots).toMatchObject({series:'US_UNRATE',period:'2026-08-31',from:{value_text:'4.2'},to:{value_text:'4.3'}});
  expect(f.timeliness.map(x=>x.fact_id)).toEqual(['tml:US_UNRATE']);
  expect(f.policy_events.map(x=>x.fact_id)).toEqual(['evt:2026-10-28']);
  expect(f.policy_events[0].slots.change).toEqual({value_text:toBp(subtract('4','3.75')),unit:'bp'});
  expect(f.episode_changes.map(x=>x.fact_id)).toEqual(['ep:cut:2025-09-17:ended','ep:hike:2026-10-28:opened']);
  expect(f.episode_changes[0].slots.cumulative).toEqual({value_text:'-75',unit:'bp'});
  const mv=new Map(f.asset_moves.map(x=>[x.fact_id,x.slots.change]));
  expect(mv.get('mv:US_UST10Y')).toEqual({value_text:toBp(subtract('4.08','4.16')),unit:'bp'});
  expect(mv.get('mv:US_WTI')).toEqual({value_text:'60.5/62',unit:'pct_ratio'});        // exact ratio; (60.5 / 62 − 1) × 100 rounded once at display
  expect(mv.get('mv:US_DTWEXBGS')).toEqual({value_text:'121/120.5',unit:'pct_ratio'});  // (121 / 120.5 − 1) × 100
  expect(f.coverage.map(x=>x.fact_id)).toEqual(['cov:counts','cov:US_ISM_PMI','cov:US_SP500']);
 });
});
```

Run: `npm test -- src/lib/macro/strategy/replay.test.ts`
Expected: FAIL — 新块的 4 个用例因 `ENOENT … fixtures/replay/review-us-2026-10.json` 失败；Part B 的 16 个用例仍通过。

录制，再不带开关复跑：

Run: `MACRO_REPLAY_RECORD=1 npm test -- src/lib/macro/strategy/replay.test.ts`
Expected: PASS（`Tests  20 passed (20)`），写出 `review-us-2026-10.json`（约 21 KB），并按原样重写 Part B 的六个文件。

Run: `git status --short src/lib/macro/strategy/fixtures/replay`
Expected: 只有一行 `?? src/lib/macro/strategy/fixtures/replay/review-us-2026-10.json`（Part B 的六个文件内容不变；若它们出现在 `M` 行，说明 Part B 的构建器在本任务之前已改变，停下报告，不要提交它们）。

Run: `npm test -- src/lib/macro/strategy/replay.test.ts`
Expected: PASS（`Tests  20 passed (20)`）。块内"hand-computed"用例独立于录制结果核对：三条新发布、失业率 4.2 → 4.3 修订、只有 `US_UNRATE` 迟发、本月事件 2026-10-28（+25bp）、降息段结束 + 加息段新开（累计 −75bp）、美债 10Y −8bp、WTI −2.4194%、美元广义 +0.4149%、覆盖 `cov:counts` + `US_ISM_PMI` + `US_SP500`。

- [ ] **Step 10: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 均无错误、无警告。

- [ ] **Step 11: 提交**

```bash
git add src/lib/macro/strategy/facts.ts src/lib/macro/strategy/facts.test.ts src/lib/macro/strategy/review.ts src/lib/macro/strategy/review.test.ts src/lib/macro/strategy/fixtures/replay/review-us-2026-10.json src/lib/macro/strategy/replay.test.ts
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): facts and monthly review (spec 2026-11-07 §6.1, §6.2)

facts.ts builds the explain_facts manifests (snapshot: pinned snapshot, cutoff =
its created_at, peer = snapshotUpTo, through manifestBuilder; review: the stored
review manifest re-keyed for its result) and the template facts (level, exact
typed change, spread node, latest policy event). review.ts freezes a month-end vs
month-end manifest from two builders (cutoff = the 3rd of the next month) and computes the seven sections purely from
it: episode identity (direction, start), opened/ended via policyEpisodes, frozen
timeliness, exact-ratio asset moves, explicit truncation facts, frozen
explanation facts, runReview for the cron. Adds the review
replay case and its recorded fixture.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: 事实句渲染、词法校验器与提示（`explain-render.ts`、`explain-validate.ts`、`prompts/`）

**Files:**
- Create: `src/lib/macro/strategy/explain-render.ts`
- Create: `src/lib/macro/strategy/explain-render.test.ts`
- Create: `src/lib/macro/strategy/explain-validate.ts`
- Create: `src/lib/macro/strategy/explain-validate.test.ts`
- Create: `src/lib/macro/strategy/prompts/macro-explain-v1.zh.md`
- Create: `src/lib/macro/strategy/prompts/macro-explain-v1.en.md`

规格要点：
- 事实句 = 模板 id ↔ 中英渲染函数（§6.3 输出分工）。固定格式（全部在十进制文本上做，不经浮点）：水平值原样（规范十进制）加千分位与单位（`pct` → `%`，`usd_per_bbl`、`cny_per_100usd` 有中英后缀，其余无后缀）；`pp` / `points` 变化原样带符号；`bp` 变化半数远离零舍入到整数 bp；百分比变化 `pct_ratio`（精确比值 `'<末>/<基>'`）用 `numeric.ts::roundPctRatio` 从比值一次舍入（半数远离零）到一位小数并带符号（结果为零时不带符号；真实变化 +0.04996% → `0.0%`，不是先舍到 4 位再舍成 `+0.1%`）；计数取整加千分位；日期原样 ISO。`TEMPLATES` 必须恰好覆盖 Task 9 产生的 16 个模板 id（含 `events_truncated`；测试强制）。
- 校验器是**词法策略**（§6.3 第 3 稿 N10），顺序：解析（容许外层 ```json 围栏）→ ajv 结构（`points` 1–6 条，`counterpoints` 0–6 条，`fact_ids` 1–4 个，文本 1–240 字符，不允许多余键）→ `fact_id` 必须在本次事实清单 → 对每段文本 `normalize('NFKC')` 后检查：
  - `numeral`：任一 `\p{Nd}` / `\p{No}` 字符；`%`、`‰`、`‱`；`bp`/`bps`/`pp`（前后不是拉丁字母，故 `25bp` 也命中，`happen` 不命中）；`基点`、`百分点`、`百分之`；`第` + 中文数字；中文数字串后接量词或单位（`个百分点`、`基点`、`个次年月日周倍成点%`）；英文数词（词边界、不区分大小写）。
  - `forbidden_term`：`FORBIDDEN_TERMS`（中文子串；英文词边界、不区分大小写、空格匹配任意空白）。
  - `regime_term`：四个象限名中英（v1 解读不含判断）。
  - 每条失败记 `{code, section, index, match}`；结果的 `codes` 是排序去重的失败码集合（投影只存它）。
- 已知且接受的词法边界：罗马数字字符（Unicode `Nl`，如 `Ⅻ`）经 NFKC 变成拉丁字母后不再是数字字符，不被拒绝；"第三方""一个"等数量语境写法会被拒绝（提示里已要求模型避免）。

- [ ] **Step 1: 写 `explain-validate.ts` 的失败测试**（这是除 `explain-validate.ts` 外唯一允许出现禁用词的文件）

```ts
// src/lib/macro/strategy/explain-validate.test.ts
import {describe,expect,it} from 'vitest';
import {FORBIDDEN_TERMS,lexicalFailures,parseModelContent,REGIME_TERMS,validateExplanation,VALIDATOR_VERSION} from './explain-validate';

const FACTS=new Set(['obs:US_CPI_YOY','chg:US_DGS10','evt:2026-10-28']);
const one=(hypothesis:string,fact_ids=['obs:US_CPI_YOY'])=>({points:[{fact_ids,hypothesis}],counterpoints:[]});
const codesOf=(text:string)=>{const r=validateExplanation(one(text),FACTS);return r.ok?[]:r.codes;};

describe('validator version',()=>{it('is macro-explain-validator/1',()=>expect(VALIDATOR_VERSION).toBe('macro-explain-validator/1'));});

describe('lexical policy — numerals (spec §6.3 step 4, N10)',()=>{
 // spec positives (must pass) plus more
 it.each(['进一步','统一','一致','万一','someone','none','often','happen',
  '通胀回落可能通过实际利率渠道影响美元资产的相对吸引力','若政策利率上调，则短端融资成本上升可能压制风险偏好','十分','千万不要忽视','一方面融资成本上升','唯一的约束','两国利差',
  'Tighter policy may raise real yields and weigh on duration-sensitive assets.','An oneness of purpose','Tone and phone ring often','The approach is happening','Sweptone'])('passes: %s',(text)=>{
  expect(codesOf(text)).toEqual([]);
 });
 // spec negatives (must reject) plus more
 it.each(['3','３','③','三个月','第二','两倍','百分之五','five','twice','25bp',
  '²','½','٣','一次','三成','五个百分点','十年','两周','第三方','零点','一年内','涨了%','千分之‰','利差扩大五十基点','Seven','ONE','half of it','double','a dozen','zero','bp','pp','bps','the 2pp move'])('rejects as numeral: %s',(text)=>{
  expect(codesOf(text)).toContain('numeral');
 });
 it('NFKC folds full-width and circled digits before matching',()=>{
  expect(lexicalFailures('１'.normalize('NFKC'))).toEqual([{code:'numeral',match:'1'}]);
  expect(lexicalFailures('⑤'.normalize('NFKC'))[0]).toMatchObject({code:'numeral',match:'5'});
 });
 it('collects every distinct matched fragment of each family, not only the first',()=>{
  expect(lexicalFailures('probability confidence recession stagflation')).toEqual([
   {code:'forbidden_term',match:'probability'},{code:'forbidden_term',match:'confidence'},
   {code:'regime_term',match:'stagflation'},{code:'regime_term',match:'recession'}]);
  expect(lexicalFailures('三个月 and 25bp, 25bp again')).toEqual([
   {code:'numeral',match:'2'},{code:'numeral',match:'5'},{code:'numeral',match:'bp'},{code:'numeral',match:'三个'}]);
  const r=validateExplanation(one('probability confidence recession stagflation'),FACTS);
  expect(r.ok).toBe(false);
  if(!r.ok)expect(r.failures.map(f=>f.match)).toEqual(['probability','confidence','stagflation','recession']);
 });
});

describe('lexical policy — forbidden and regime terms (spec §6.3 steps 5–6)',()=>{
 it.each(FORBIDDEN_TERMS.map(t=>[t]))('rejects forbidden term %s',(t)=>{
  expect(codesOf(`如果 ${t} 出现`)).toContain('forbidden_term');
 });
 it.each(['PROBABILITY','Confidence','Odds','Win  Rate','Will\nRise','Is Going To'])('English terms are case-insensitive and whitespace-tolerant: %s',(t)=>{
  expect(codesOf(t)).toContain('forbidden_term');
 });
 it.each(['probably','oddsmaker','winrate','chances'])('English terms match on word boundaries only: %s passes',(t)=>{
  expect(codesOf(t)).toEqual([]);
 });
 it.each(REGIME_TERMS.map(t=>[t]))('rejects regime term %s',(t)=>{
  expect(codesOf(`处于${t}`)).toContain('regime_term');
 });
 it('Recession in any case is rejected; "recover" is not a regime term',()=>{
  expect(codesOf('Recession')).toContain('regime_term');
  expect(codesOf('demand may recover')).toEqual([]);
 });
});

describe('structure and references (spec §6.3 steps 1–2)',()=>{
 it('accepts a well-formed output and defaults counterpoints to []',()=>{
  const r=validateExplanation({points:[{fact_ids:['obs:US_CPI_YOY','chg:US_DGS10'],hypothesis:'通胀回落可能通过实际利率影响长端收益率'}]},FACTS);
  expect(r).toEqual({ok:true,output:{points:[{fact_ids:['obs:US_CPI_YOY','chg:US_DGS10'],hypothesis:'通胀回落可能通过实际利率影响长端收益率'}],counterpoints:[]},failures:[]});
 });
 it.each([
  ['no points',{points:[],counterpoints:[]}],
  ['seven points',{points:Array.from({length:7},()=>({fact_ids:['obs:US_CPI_YOY'],hypothesis:'h'})),counterpoints:[]}],
  ['five fact ids',{points:[{fact_ids:['a','b','c','d','e'],hypothesis:'h'}]}],
  ['empty fact ids',{points:[{fact_ids:[],hypothesis:'h'}]}],
  ['text over 240 characters',{points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'很'.repeat(241)}]}],
  ['extra key',{points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'h',score:1}]}],
  ['wrong text key',{points:[{fact_ids:['obs:US_CPI_YOY'],text:'h'}]}],
  ['top-level extra',{points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'h'}],summary:'x'}],
  ['not an object',['x']],
 ])('schema failure: %s',(_,raw)=>{
  const r=validateExplanation(raw,FACTS);
  expect(r.ok).toBe(false);if(!r.ok)expect(r.codes).toEqual(['schema']);
 });
 it('240 characters exactly is allowed',()=>{
  expect(validateExplanation(one('很'.repeat(240)),FACTS).ok).toBe(true);
 });
 it('unknown fact ids are rejected with the id as the match',()=>{
  const r=validateExplanation(one('h',['obs:NOPE']),FACTS);
  expect(r).toEqual({ok:false,codes:['unknown_fact'],failures:[{code:'unknown_fact',section:'points',index:0,match:'obs:NOPE'}]});
 });
 it('collects every failure with section, index and fragment; codes are a sorted set',()=>{
  const r=validateExplanation({points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'利率将会上升三个月'},{fact_ids:['obs:US_CPI_YOY'],hypothesis:'正常文本'}],counterpoints:[{fact_ids:['obs:X'],text:'Recession odds'}]},FACTS);
  expect(r.ok).toBe(false);
  if(r.ok)return;
  expect(r.codes).toEqual(['forbidden_term','numeral','regime_term','unknown_fact']);
  expect(r.failures).toEqual([
   {code:'numeral',match:'三个',section:'points',index:0},
   {code:'forbidden_term',match:'将会',section:'points',index:0},
   {code:'unknown_fact',section:'counterpoints',index:0,match:'obs:X'},
   {code:'forbidden_term',match:'odds',section:'counterpoints',index:0},
   {code:'regime_term',match:'Recession',section:'counterpoints',index:0},
  ]);
 });
 it('parseModelContent accepts plain JSON and a json fence, nothing else',()=>{
  expect(parseModelContent('{"points":[]}')).toEqual({points:[]});
  expect(parseModelContent('```json\n{"points":[]}\n```')).toEqual({points:[]});
  expect(parseModelContent('Here: {"points":[]}')).toBeUndefined();
  expect(validateExplanation(parseModelContent('nope'),FACTS)).toEqual({ok:false,codes:['parse'],failures:[{code:'parse',section:'output',index:null,match:null}]});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/macro/strategy/explain-validate.test.ts`
Expected: FAIL，`Failed to resolve import "./explain-validate"`。

- [ ] **Step 3: 实现 `explain-validate.ts`**

```ts
// src/lib/macro/strategy/explain-validate.ts
// Explanation validator macro-explain-validator/1 (spec 2026-11-07 §6.3 "校验", draft 3 N10). A LEXICAL policy, not a
// semantic proof: it guarantees the model text holds no recognisable numeral token, forbidden term or regime term; it
// does not guarantee a hypothesis is right (the panel header says so). Steps: parse → ajv structure (counts, lengths) →
// every fact_id known → NFKC → numeral / forbidden_term / regime_term checks per text. Every failure (code, section,
// index, matched fragment) goes to the run row; the projection keeps only the code set. This file and its test are the
// only places allowed to spell the forbidden terms (spec §12, forbidden-terms scan exclusion).
import Ajv from 'ajv';
import {VERSIONS} from './contract';

export const VALIDATOR_VERSION=VERSIONS.validator;
export type FailureCode='parse'|'schema'|'unknown_fact'|'numeral'|'forbidden_term'|'regime_term';
export interface ValidationFailure{code:FailureCode;section:'output'|'points'|'counterpoints';index:number|null;match:string|null}
export interface ModelOutput{points:{fact_ids:string[];hypothesis:string}[];counterpoints:{fact_ids:string[];text:string}[]}
export type ValidationResult={ok:true;output:ModelOutput;failures:[]}|{ok:false;codes:FailureCode[];failures:ValidationFailure[]};

/** Chinese terms match as substrings; English terms on word boundaries, case-insensitive (spaces match any whitespace). */
export const FORBIDDEN_TERMS:readonly string[]=['概率','置信','胜率','把握','可能性为','赔率','将会','必然','一定会',
 'probability','probable','confidence','likelihood','odds','win rate','chance of','will rise','will fall','will increase','will decrease','is going to'];
/** v1 explanations carry no judgment, so the four regime names are always rejected (spec §6.3 step 6, §7.7). */
export const REGIME_TERMS:readonly string[]=['复苏','过热','滞胀','衰退','recovery','overheat','overheating','stagflation','recession'];

const CN_NUMERAL='[〇零一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+';
const EN_NUMBER_WORDS=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen',
 'sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','million','billion',
 'half','double','twice','triple','dozen'];
/** Numeral rules, applied to NFKC-normalised text. */
export const NUMERAL_PATTERNS:readonly RegExp[]=[
 /[\p{Nd}\p{No}]/u,                                               // any Unicode decimal / other digit (full-width and circled forms fold or match here)
 /[%‰‱]/u,
 /(?<![A-Za-z])(?:bps?|pp)(?![A-Za-z])/i,                         // bp / bps / pp as standalone letters (also after a digit)
 /基点|百分点|百分之/u,
 new RegExp(`第${CN_NUMERAL}`,'u'),                               // ordinal: 第二
 new RegExp(`${CN_NUMERAL}(?:个百分点|基点|[个次年月日周倍成点%])`,'u'),   // quantity context: 三个月, 两倍, 三成
 new RegExp(`\\b(?:${EN_NUMBER_WORDS.join('|')})\\b`,'i'),
];
const escapeRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const termPattern=(t:string):RegExp=>/^[\x00-\x7f]+$/.test(t)?new RegExp(`\\b${t.split(' ').map(escapeRe).join('\\s+')}\\b`,'i'):new RegExp(escapeRe(t),'u');
const FORBIDDEN_PATTERNS=FORBIDDEN_TERMS.map(termPattern);
const REGIME_PATTERNS=REGIME_TERMS.map(termPattern);

const item=(textKey:'hypothesis'|'text')=>({type:'object',additionalProperties:false,required:['fact_ids',textKey],properties:{
 fact_ids:{type:'array',minItems:1,maxItems:4,items:{type:'string',minLength:1,maxLength:160}},[textKey]:{type:'string',minLength:1,maxLength:240}}});
const validateShape=new Ajv({strict:true,allErrors:false}).compile<{points:ModelOutput['points'];counterpoints?:ModelOutput['counterpoints']}>({type:'object',additionalProperties:false,required:['points'],properties:{
 points:{type:'array',minItems:1,maxItems:6,items:item('hypothesis')},counterpoints:{type:'array',minItems:0,maxItems:6,items:item('text')}}});

/** Model content → JSON value; a surrounding ```json fence is tolerated, nothing else. */
export function parseModelContent(content:string):unknown{
 const t=content.trim();const fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
 try{return JSON.parse(fenced?fenced[1]:t);}catch{return undefined;}
}
/** Every distinct matched fragment of each rule family in one text (already NFKC-normalised by the caller), families in
 *  the order numeral, forbidden_term, regime_term; within a family, pattern order then position (spec §6.3: all failure items). */
export function lexicalFailures(text:string):{code:'numeral'|'forbidden_term'|'regime_term';match:string}[]{
 const out:{code:'numeral'|'forbidden_term'|'regime_term';match:string}[]=[];
 const all=(code:'numeral'|'forbidden_term'|'regime_term',ps:readonly RegExp[])=>{
  const seen=new Set<string>();
  for(const p of ps)for(const m of text.matchAll(new RegExp(p.source,p.flags.includes('g')?p.flags:`${p.flags}g`)))if(!seen.has(m[0])){seen.add(m[0]);out.push({code,match:m[0]});}
 };
 all('numeral',NUMERAL_PATTERNS);all('forbidden_term',FORBIDDEN_PATTERNS);all('regime_term',REGIME_PATTERNS);
 return out;
}
export function validateExplanation(raw:unknown,factIds:ReadonlySet<string>):ValidationResult{
 const fail=(failures:ValidationFailure[]):ValidationResult=>({ok:false,codes:[...new Set(failures.map(x=>x.code))].sort(),failures});
 if(raw===undefined)return fail([{code:'parse',section:'output',index:null,match:null}]);
 if(!validateShape(raw))return fail([{code:'schema',section:'output',index:null,match:validateShape.errors?.[0]?.instancePath||null}]);
 const output:ModelOutput={points:raw.points,counterpoints:raw.counterpoints??[]};
 const failures:ValidationFailure[]=[];
 const sections:[ 'points'|'counterpoints',{fact_ids:string[];text:string}[]][]=[['points',output.points.map(p=>({fact_ids:p.fact_ids,text:p.hypothesis}))],['counterpoints',output.counterpoints]];
 for(const [section,items] of sections)items.forEach((x,index)=>{
  for(const id of x.fact_ids)if(!factIds.has(id))failures.push({code:'unknown_fact',section,index,match:id});
  for(const l of lexicalFailures(x.text.normalize('NFKC')))failures.push({...l,section,index});
 });
 return failures.length?fail(failures):{ok:true,output,failures:[]};
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/macro/strategy/explain-validate.test.ts`
Expected: PASS，`Tests  112 passed (112)`。

- [ ] **Step 5: 写 `explain-render.ts` 的失败测试**

```ts
// src/lib/macro/strategy/explain-render.test.ts
import {describe,expect,it} from 'vitest';
import type {Fact,StrategyManifest} from './contract';
import {buildSnapshotFactsManifest,explanationFacts,flattenReviewFacts} from './facts';
import {memoryStrategyPort} from './port';
import {buildReviewManifest,reviewFromManifest} from './review';
import {daily,FIXTURE_CATALOG,fixture,monthly,obs,snap} from './testing/fixture';
import {formatSlot,namesFrom,renderExplanation,renderFact,renderFacts,roundDecimal,roundDecimalToInteger,TEMPLATE_IDS} from './explain-render';
import {FORBIDDEN_TERMS,REGIME_TERMS} from './explain-validate';

const CATALOG=[{id:'US_CPI_YOY',name:{zh:'美国 CPI 同比',en:'US CPI YoY'}},{id:'US_DGS10',name:{zh:'美债 10 年',en:'UST 10Y'}},{id:'CN_CGB_10Y',name:{zh:'中债 10 年',en:'CGB 10Y'}},{id:'US_WTI',name:{zh:'WTI 原油',en:'WTI crude'}}];
const names=namesFrom(CATALOG);
const v=(value_text:string,unit:string)=>({value_text,unit});
const fact=(template:string,slots:Fact['slots'],fact_id=`x:${template}`):Fact=>({fact_id,kind:'level',template,slots,source_inputs:[]});
// One sample per template id with its exact zh / en sentence.
const SAMPLES:[Fact,string,string][]=[
 [fact('level',{series:'US_CPI_YOY',period:'2026-09-30',value:v('2.9','pct')}),'美国 CPI 同比（2026-09-30）为 2.9%。','US CPI YoY (2026-09-30) was 2.9%.'],
 [fact('change',{series:'US_DGS10',prev_period:'2026-08-31',period:'2026-09-30',change:v('-7','bp')}),'美债 10 年 2026-09-30 较 2026-08-31 变化 -7 个基点。','UST 10Y changed by -7 bp from 2026-08-31 to 2026-09-30.'],
 [fact('derived_spread',{a:'US_DGS10',b:'CN_CGB_10Y',period:'2026-09-30',a_value:v('4.16','pct'),b_value:v('1.85','pct'),value:v('2.31','pp_level')}),'2026-09-30 美债 10 年 4.16% 减 中债 10 年 1.85%，利差为 2.31 个百分点。','On 2026-09-30, UST 10Y 4.16% minus CGB 10Y 1.85% gives a spread of 2.31 pp.'],
 [fact('policy_event',{date:'2026-10-28',upper_from:v('3.75','pct'),upper_to:v('4','pct'),lower_from:v('3.5','pct'),lower_to:v('3.75','pct'),change:v('25','bp')}),'2026-10-28 联邦基金目标利率由 3.5%–3.75% 调整为 3.75%–4%（上限变化 +25 个基点）。','On 2026-10-28 the federal funds target moved from 3.5%–3.75% to 3.75%–4% (upper bound +25 bp).'],
 [fact('release',{series:'US_CPI_YOY',prev_period:'2026-08-31',prev_value:v('2.7','pct'),period:'2026-09-30',value:v('2.9','pct')}),'美国 CPI 同比 新发布 2026-09-30 数据 2.9%（基线最新期 2026-08-31：2.7%）。','US CPI YoY released 2026-09-30 at 2.9% (baseline latest 2026-08-31: 2.7%).'],
 [fact('release_first',{series:'US_CPI_YOY',period:'2026-09-30',value:v('2.9','pct')}),'美国 CPI 同比 新发布 2026-09-30 数据 2.9%（基线快照中无此序列）。','US CPI YoY released 2026-09-30 at 2.9% (absent from the baseline snapshot).'],
 [fact('revision',{series:'US_CPI_YOY',period:'2026-08-31',from:v('2.7','pct'),to:v('2.8','pct')}),'美国 CPI 同比 2026-08-31 数据由 2.7% 修订为 2.8%。','US CPI YoY for 2026-08-31 was revised from 2.7% to 2.8%.'],
 [fact('timeliness_late',{series:'US_CPI_YOY',date:'2026-11-03',period:'2026-08-31'}),'截至 2026-11-03，美国 CPI 同比 发布迟于预期（最新期 2026-08-31）。','As of 2026-11-03, US CPI YoY was late (latest period 2026-08-31).'],
 [fact('timeliness_missing',{series:'US_CPI_YOY',date:'2026-11-03'}),'截至 2026-11-03，美国 CPI 同比 在快照中无观测。','As of 2026-11-03, US CPI YoY had no observation in the snapshot.'],
 [fact('episode_opened',{direction:'hike',start:'2026-10-28',end:'2026-10-28',events:v('1','count'),upper_from:v('3.75','pct'),upper_to:v('4','pct'),cumulative:v('25','bp')}),'加息行动段自 2026-10-28 开始，至 2026-10-28 共 1 次变动，上限 3.75% → 4%，累计 +25 个基点。','A hike episode began on 2026-10-28: 1 moves through 2026-10-28, upper bound 3.75% → 4%, cumulative +25 bp.'],
 [fact('episode_ended',{direction:'cut',start:'2025-09-17',end:'2025-12-10',events:v('3','count'),upper_from:v('4.5','pct'),upper_to:v('3.75','pct'),cumulative:v('-75','bp')}),'2025-09-17 至 2025-12-10 的降息行动段已结束（3 次变动，上限 4.5% → 3.75%，累计 -75 个基点）。','The cut episode from 2025-09-17 to 2025-12-10 ended (3 moves, upper bound 4.5% → 3.75%, cumulative -75 bp).'],
 [fact('asset_move',{series:'US_WTI',base_period:'2026-09-30',period:'2026-10-31',from:v('62','usd_per_bbl'),to:v('60.5','usd_per_bbl'),change:v('60.5/62','pct_ratio')}),'WTI 原油 2026-09-30 → 2026-10-31：62 美元/桶 → 60.5 美元/桶（-2.4%）。','WTI crude 2026-09-30 → 2026-10-31: 62 USD/bbl → 60.5 USD/bbl (-2.4%).'],
 [fact('asset_missing',{series:'US_WTI',base_month:'2026-09',month:'2026-10',reason:'out_of_coverage'}),'WTI 原油 2026-09 至 2026-10 无法比较：月末观测不全。','WTI crude 2026-09 to 2026-10 not comparable: month-end observations incomplete.'],
 [fact('coverage',{verified:v('1234','count'),missing:v('4','count'),restricted:v('5','count')}),'快照目录计数：已核实 1,234，缺失 4，受限 5。','Snapshot catalog counts: verified 1,234, missing 4, restricted 5.'],
 [fact('events_truncated',{date:'2026-11-03',sources:'US_FED_TARGET_UPPER_D'}),'截至 2026-11-03，政策事件序列读取被截断（US_FED_TARGET_UPPER_D），本节无法列出。','As of 2026-11-03, the policy event history read was truncated (US_FED_TARGET_UPPER_D); this section cannot be listed.'],
 [fact('baseline_unavailable',{series:'US_CPI_YOY',state:'truncated'}),'美国 CPI 同比 的基线数据读取被截断，无法判断其为新发布或修订。','US CPI YoY baseline data unavailable (read truncated); release and revision could not be determined.'],
 [fact('catalog_unavailable',{series:'US_ISM_PMI',status:'missing'}),'US_ISM_PMI 目录状态：缺失。','US_ISM_PMI catalog status: missing.'],
];

describe('explain-render templates (spec §6.3 输出分工)',()=>{
 it('covers exactly the template ids produced by facts.ts and review.ts',()=>{
  expect([...TEMPLATE_IDS].sort()).toEqual(SAMPLES.map(([f])=>f.template).sort());
 });
 it.each(SAMPLES.map(([f,zh,en])=>[f.template,f,zh,en] as const))('%s renders the fixed zh and en sentences',(_,f,zh,en)=>{
  expect(renderFact(f,'zh',names)).toBe(zh);
  expect(renderFact(f,'en',names)).toBe(en);
 });
 it('no rendered sentence contains a forbidden or regime term',()=>{
  const text=SAMPLES.flatMap(([f])=>[renderFact(f,'zh',names),renderFact(f,'en',names)]).join('\n').toLowerCase();
  for(const t of [...FORBIDDEN_TERMS,...REGIME_TERMS])expect(text.includes(t.toLowerCase()),t).toBe(false);
 });
 it('single-target events render one value, not a range',()=>{
  const f=fact('policy_event',{date:'2008-10-29',upper_from:v('1.5','pct'),upper_to:v('1','pct'),lower_from:v('1.5','pct'),lower_to:v('1','pct'),change:v('-50','bp')});
  expect(renderFact(f,'en',names)).toBe('On 2008-10-29 the federal funds target moved from 1.5% to 1% (upper bound -50 bp).');
 });
 it('fails loudly on an unknown template, a missing slot or a slot of the wrong shape',()=>{
  expect(()=>renderFact(fact('nope',{}),'zh',names)).toThrow('unknown_template:nope');
  expect(()=>renderFact(fact('level',{series:'US_CPI_YOY',period:'2026-09-30'}),'zh',names)).toThrow('missing_slot:level:value');
  expect(()=>renderFact(fact('level',{series:'US_CPI_YOY',period:'2026-09-30',value:'2.9'}),'zh',names)).toThrow('slot_not_value:level:value');
 });
 it('unknown series ids fall back to the id',()=>{
  expect(renderFact(fact('timeliness_missing',{series:'ZZ',date:'2026-11-03'}),'en',names)).toBe('As of 2026-11-03, ZZ had no observation in the snapshot.');
 });
});

describe('number formatting rules',()=>{
 it('bp rounds half away from zero to whole bp without floats',()=>{
  expect(roundDecimalToInteger('12.5')).toBe('13');expect(roundDecimalToInteger('-12.5')).toBe('-13');
  expect(roundDecimalToInteger('12.49')).toBe('12');expect(roundDecimalToInteger('-0.4')).toBe('0');expect(roundDecimalToInteger('7')).toBe('7');
  expect(formatSlot(v('-0.4','bp'),'en')).toBe('0 bp');
 });
 it('percent changes are rounded once from the exact ratio, half away from zero, to one decimal; a zero result has no sign',()=>{
  expect(formatSlot(v('121/120.5','pct_ratio'),'zh')).toBe('+0.4%');expect(formatSlot(v('60.5/62','pct_ratio'),'en')).toBe('-2.4%');
  expect(formatSlot(v('110/100','pct_ratio'),'en')).toBe('+10.0%');
  expect(formatSlot(v('100.04996/100','pct_ratio'),'en')).toBe('0.0%');    // true +0.04996 %: no double rounding up to +0.1 %
  expect(formatSlot(v('99.95004/100','pct_ratio'),'zh')).toBe('0.0%');     // true −0.04996 %
  expect(formatSlot(v('100.05/100','pct_ratio'),'en')).toBe('+0.1%');expect(formatSlot(v('99.95/100','pct_ratio'),'en')).toBe('-0.1%');
  expect(roundDecimal('9.99',1)).toBe('10.0');expect(roundDecimal('0.0049',2)).toBe('0.00');
  expect(()=>formatSlot(v('2.4','pct_ratio'),'en')).toThrow('invalid_pct_ratio:2.4');expect(()=>roundDecimal('1e3',1)).toThrow('invalid_decimal:1e3');
 });
 it('pp and points keep the exact decimal with a sign; levels get thousands separators and unit suffixes',()=>{
  expect(formatSlot(v('0.2','pp'),'zh')).toBe('+0.2 个百分点');expect(formatSlot(v('-0.2','pp'),'en')).toBe('-0.2 pp');
  expect(formatSlot(v('0','pp'),'en')).toBe('0 pp');expect(formatSlot(v('0.3','points'),'en')).toBe('+0.3 pts');
  expect(formatSlot(v('12345.678','index'),'en')).toBe('12,345.678');
  expect(formatSlot(v('712.5','cny_per_100usd'),'zh')).toBe('712.5 元/100 美元');
 });
});

describe('renderFacts / renderExplanation',()=>{
 const facts=[fact('level',{series:'US_CPI_YOY',period:'2026-09-30',value:v('2.9','pct')},'obs:US_CPI_YOY'),fact('timeliness_missing',{series:'US_DGS10',date:'2026-11-03'},'tml:US_DGS10')];
 it('renders the list in order with ids',()=>{
  expect(renderFacts(facts,'en',CATALOG)).toEqual([{fact_id:'obs:US_CPI_YOY',text:'US CPI YoY (2026-09-30) was 2.9%.'},{fact_id:'tml:US_DGS10',text:'As of 2026-11-03, UST 10Y had no observation in the snapshot.'}]);
 });
 it('fact sentences of cited facts in first-cited order, then model hypotheses and counterpoints',()=>{
  const r=renderExplanation(facts,{points:[{fact_ids:['tml:US_DGS10','obs:US_CPI_YOY'],hypothesis:'h'}],counterpoints:[{fact_ids:['obs:US_CPI_YOY'],text:'c'}]},'en',CATALOG);
  expect(r.facts.map(f=>f.fact_id)).toEqual(['tml:US_DGS10','obs:US_CPI_YOY']);
  expect(r.hypotheses).toEqual([{text:'h',fact_ids:['tml:US_DGS10','obs:US_CPI_YOY']}]);
  expect(r.counterpoints).toEqual([{text:'c',fact_ids:['obs:US_CPI_YOY']}]);
  expect(()=>renderExplanation(facts,{points:[{fact_ids:['nope'],hypothesis:'h'}],counterpoints:[]},'en',CATALOG)).toThrow('unknown_fact:nope');
 });
});

describe('producer ↔ template compatibility (facts.ts / review.ts output renders in both locales)',()=>{
 const BASE_ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7']),obs('US_UNRATE','2026-08-31','4.2'),...monthly('US_DGS10','2026-08',['4.23']),...monthly('US_DTWEXBGS','2026-08',['121.2'])];
 const CUR_ROWS=[...monthly('US_CPI_YOY','2026-09',['2.9']),obs('US_UNRATE','2026-08-31','4.3',{version:2,availableAt:'2026-10-02T12:00:00Z'}),...monthly('US_DGS10','2026-09',['4.16']),...monthly('US_DTWEXBGS','2026-09',['120.5'])];
 const MONTH_ENDS=[...monthly('US_WTI','2026-09',['62','60.5']),obs('US_DGS10','2026-10-31','4.08'),obs('US_DTWEXBGS','2026-10-31','121')];
 const EVENT_DAYS:[string,string,string][]=[['2025-09-16','4.5','4.25'],['2025-09-17','4.25','4'],['2025-10-29','4','3.75'],['2025-12-10','3.75','3.5'],['2026-10-28','4','3.75']];
 const EVENTS=[...daily('US_FED_TARGET_UPPER_D',EVENT_DAYS.map(([d,u])=>[d,u])),...daily('US_FED_TARGET_LOWER_D',EVENT_DAYS.map(([d,,l])=>[d,l]))];
 const BASE_SNAP=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.map(o=>o.observation_id));
 const CUR_SNAP=snap('US','2026-10-15T06:00:00Z',CUR_ROWS.map(o=>o.observation_id),{counts:{verified:21,missing:4,restricted:5}});
 const port=(snapshots=[BASE_SNAP,CUR_SNAP])=>memoryStrategyPort(fixture({snapshots,observations:[...BASE_ROWS,...CUR_ROWS,...MONTH_ENDS,...EVENTS]}));
 const reviewFacts=async(edit:(m:StrategyManifest)=>StrategyManifest=m=>m,p=port()):Promise<Fact[]>=>flattenReviewFacts(reviewFromManifest(edit(await buildReviewManifest(p,'US','2026-10','c'))).facts);
 const snapshotFactList=async():Promise<Fact[]>=>{
  const rows=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_DGS10','2026-08',['4.23','4.16']),...monthly('US_DTWEXBGS','2026-08',['121.2','120.5'])];
  const cn=monthly('CN_CGB_10Y','2026-09',['1.85']);const s=snap('US','2026-10-15T06:00:00Z',rows.map(o=>o.observation_id));
  const p=memoryStrategyPort(fixture({snapshots:[s,snap('CN','2026-10-10T06:00:00Z',cn.map(o=>o.observation_id))],observations:[...rows,...cn,...EVENTS]}));
  const m=await buildSnapshotFactsManifest(p,s.snapshot_id,'c');if(!m)throw new Error('no manifest');return explanationFacts(m);
 };
 const catalog=FIXTURE_CATALOG.map(d=>({id:d.id,name:d.name}));
 const renderAll=(facts:Fact[])=>facts.flatMap(f=>(['zh','en'] as const).map(l=>({f,l,text:renderFact(f,l,namesFrom(catalog))})));
 const BAD=/undefined|\[object|NaN|\{|\}/;

 it('every fact the producers emit renders in zh and en, with the id fallback never used for a catalog series',async()=>{
  const all=[...await snapshotFactList(),...await reviewFacts()];
  expect(all.length).toBeGreaterThan(20);
  for(const {f,l,text} of renderAll(all)){
   expect(text.length,`${f.fact_id} ${l}`).toBeGreaterThan(0);expect(text,`${f.fact_id} ${l}`).not.toMatch(BAD);
   const series=f.slots.series;if(typeof series==='string')expect(text.includes(series),`${f.fact_id} ${l} shows the raw id ${series}`).toBe(false);
  }
 });
 it('restricted and missing catalog entries, truncated and not-read baselines, both asset_missing reasons and timeliness_missing render',async()=>{
  const edited=await reviewFacts(m=>({...m,
   inputs:m.inputs.map(i=>i.role==='asset_base:US_WTI:month_end'?{...i,value_text:'-5'}:i),
   timeliness:[...(m.timeliness??[]),{series_id:'US_CPI_YOY',state:'missing'}]}));
  const by=new Map(edited.map(f=>[f.fact_id,f]));
  const restricted=edited.find(f=>f.template==='catalog_unavailable'&&f.slots.status==='restricted');
  expect(restricted,'a restricted catalog_unavailable fact').toBeDefined();
  expect(renderFact(restricted!,'zh',namesFrom(catalog))).toMatch(/目录状态：受限。$/);expect(renderFact(restricted!,'en',namesFrom(catalog))).toMatch(/catalog status: restricted\.$/);
  const missing=edited.find(f=>f.template==='catalog_unavailable'&&f.slots.status==='missing');
  expect(renderFact(missing!,'zh',namesFrom(catalog))).toMatch(/目录状态：缺失。$/);
  expect(renderFact(by.get('mv:US_WTI')!,'zh',namesFrom(catalog))).toMatch(/无法比较：基期值非正。$/);
  expect(renderFact(by.get('mv:US_WTI')!,'en',namesFrom(catalog))).toMatch(/not comparable: non-positive base value\.$/);
  expect(renderFact(by.get('tml:US_CPI_YOY')!,'en',namesFrom(catalog))).toMatch(/had no observation in the snapshot\.$/);
  // out_of_coverage: a month with no month-end observations
  const oc=(await reviewFacts(m=>({...m,inputs:m.inputs.filter(i=>i.role!=='asset_end:US_WTI:month_end')}))).find(f=>f.fact_id==='mv:US_WTI')!;
  expect(oc.template).toBe('asset_missing');expect(renderFact(oc,'en',namesFrom(catalog))).toMatch(/month-end observations incomplete\.$/);
  // baseline_unavailable: truncated (unresolved baseline id) and not_read (no read recorded)
  const broken=snap('US','2026-09-14T06:00:00Z',[...BASE_ROWS.map(o=>o.observation_id),'obs:not-in-store']);
  const trunc=(await reviewFacts(undefined,port([broken,CUR_SNAP]))).find(f=>f.template==='baseline_unavailable')!;
  expect(renderFact(trunc,'en',namesFrom(catalog))).toMatch(/\(read truncated\)/);expect(renderFact(trunc,'zh',namesFrom(catalog))).toMatch(/读取被截断/);
  const notRead=(await reviewFacts(m=>({...m,reads:m.reads.filter(r=>!(r.purpose==='review_base'&&r.series_id==='US_CPI_YOY')),inputs:m.inputs.filter(i=>i.role!=='review_base:US_CPI_YOY:latest')}))).find(f=>f.template==='baseline_unavailable'&&f.slots.series==='US_CPI_YOY')!;
  expect(renderFact(notRead,'en',namesFrom(catalog))).toMatch(/\(not read\)/);expect(renderFact(notRead,'zh',namesFrom(catalog))).toMatch(/未读取/);
  // events_truncated
  const cut=await reviewFacts(m=>({...m,events:[],gaps:[{kind:'history_truncated' as const,reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]}));
  expect(renderFact(cut.find(f=>f.template==='events_truncated')!,'zh',namesFrom(catalog))).toContain('US_FED_TARGET_UPPER_D');
 });
 it('together the producer fixtures cover every template id in TEMPLATE_IDS',async()=>{
  const thin=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.filter(o=>o.series_id!=='US_CPI_YOY').map(o=>o.observation_id));
  const broken=snap('US','2026-09-14T06:00:00Z',[...BASE_ROWS.map(o=>o.observation_id),'obs:not-in-store']);
  const all=[...await snapshotFactList(),...await reviewFacts(),...await reviewFacts(undefined,port([thin,CUR_SNAP])),...await reviewFacts(undefined,port([broken,CUR_SNAP])),
   ...await reviewFacts(x=>({...x,inputs:x.inputs.map(i=>i.role==='asset_base:US_WTI:month_end'?{...i,value_text:'-5'}:i),timeliness:[...(x.timeliness??[]),{series_id:'US_CPI_YOY',state:'missing'}],events:[],gaps:[{kind:'history_truncated' as const,reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]})),
   ...await reviewFacts(x=>({...x,inputs:x.inputs.filter(i=>i.role!=='asset_end:US_WTI:month_end')}))];
  expect([...new Set(all.map(f=>f.template))].sort()).toEqual([...TEMPLATE_IDS].sort());
  for(const {f,l,text} of renderAll(all))expect(text,`${f.fact_id} ${l}`).not.toMatch(BAD);
 });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm test -- src/lib/macro/strategy/explain-render.test.ts`
Expected: FAIL，`Failed to resolve import "./explain-render"`。

- [ ] **Step 7: 实现 `explain-render.ts`**

```ts
// src/lib/macro/strategy/explain-render.ts
// Deterministic fact sentences (spec 2026-11-07 §6.3 "输出分工"). Every number a reader sees in an explanation comes from
// here: template id ↔ zh / en render function over the fact's slots. Fixed formatting rules: level values verbatim
// (canonical decimal) with thousands separators and the series unit; pp / points changes verbatim with an explicit sign;
// bp changes rounded half away from zero to whole bp; percent changes arrive as the exact ratio '<to>/<from>' (unit
// 'pct_ratio') and are rounded ONCE, half away from zero, to one decimal (numeric.ts roundPctRatio — never a pre-rounded
// value); counts as integers; dates verbatim ISO. No float anywhere: rounding is done on the decimal text. Series names come from the manifest's frozen
// catalog. The model never writes a fact sentence.
import type {Bilingual,Fact,FrozenSeriesDef,RenderedExplanation} from './contract';
import {roundPctRatio} from './numeric';

export type Locale='zh'|'en';
export type NameLookup=(seriesId:string)=>Bilingual|null;
type Slot={value_text:string;unit:string};
type Slots=Fact['slots'];

const UNIT_SUFFIX:Record<string,Bilingual>={usd_per_bbl:{zh:' 美元/桶',en:' USD/bbl'},cny_per_100usd:{zh:' 元/100 美元',en:' CNY per 100 USD'}};
const DIRECTION:Record<string,Bilingual>={hike:{zh:'加息',en:'hike'},cut:{zh:'降息',en:'cut'}};
const STATUS:Record<string,Bilingual>={missing:{zh:'缺失',en:'missing'},restricted:{zh:'受限',en:'restricted'}};
const READ_STATE:Record<string,Bilingual>={truncated:{zh:'读取被截断',en:'read truncated'},not_read:{zh:'未读取',en:'not read'}};
const REASON:Record<string,Bilingual>={out_of_coverage:{zh:'月末观测不全',en:'month-end observations incomplete'},non_positive_base:{zh:'基期值非正',en:'non-positive base value'}};

function groupThousands(text:string):string{
 const neg=text.startsWith('-');const body=neg?text.slice(1):text;const dot=body.indexOf('.');
 const int=dot<0?body:body.slice(0,dot);const frac=dot<0?'':body.slice(dot);
 return `${neg?'-':''}${int.replace(/\B(?=(\d{3})+(?!\d))/g,',')}${frac}`;
}
const signed=(text:string):string=>text.startsWith('-')||/^0(\.0*)?$/.test(text)?text:`+${text}`;
/** Round a canonical decimal string to dp places, half away from zero, without floats; a zero result carries no sign. */
export function roundDecimal(text:string,dp:number):string{
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(text);if(!m)throw new Error(`invalid_decimal:${text}`);
 const frac=m[3]??'';let n=BigInt(m[2]+frac.slice(0,dp).padEnd(dp,'0'));
 if(frac.length>dp&&frac.charCodeAt(dp)>=53)n+=1n;
 let digits=n.toString();
 if(dp>0){digits=digits.padStart(dp+1,'0');digits=`${digits.slice(0,-dp)}.${digits.slice(-dp)}`;}
 return `${m[1]==='-'&&n!==0n?'-':''}${digits}`;
}
export const roundDecimalToInteger=(text:string):string=>roundDecimal(text,0);
export function formatSlot(s:Slot,locale:Locale):string{
 switch(s.unit){
  case 'pct':return `${groupThousands(s.value_text)}%`;
  case 'pp':return locale==='zh'?`${signed(s.value_text)} 个百分点`:`${signed(s.value_text)} pp`;
  case 'pp_level':return locale==='zh'?`${s.value_text} 个百分点`:`${s.value_text} pp`;
  case 'bp':return locale==='zh'?`${signed(roundDecimalToInteger(s.value_text))} 个基点`:`${signed(roundDecimalToInteger(s.value_text))} bp`;
  case 'pct_ratio':return `${signed(roundPctRatio(s.value_text,1))}%`;
  case 'points':return locale==='zh'?`${signed(s.value_text)} 点`:`${signed(s.value_text)} pts`;
  case 'count':return groupThousands(roundDecimalToInteger(s.value_text));
  default:return `${groupThousands(s.value_text)}${UNIT_SUFFIX[s.unit]?.[locale]??''}`;
 }
}
function ctx(f:Fact,locale:Locale,names:NameLookup){
 const raw=(k:string):Slots[string]=>{const v=f.slots[k];if(v===undefined)throw new Error(`missing_slot:${f.template}:${k}`);return v;};
 const str=(k:string):string=>{const v=raw(k);if(typeof v!=='string')throw new Error(`slot_not_text:${f.template}:${k}`);return v;};
 const num=(k:string):string=>{const v=raw(k);if(typeof v==='string')throw new Error(`slot_not_value:${f.template}:${k}`);return formatSlot(v,locale);};
 const name=(k:string):string=>{const id=str(k);return names(id)?.[locale]??id;};
 const word=(table:Record<string,Bilingual>,k:string):string=>{const v=str(k);return table[v]?.[locale]??v;};
 const range=(lo:string,hi:string):string=>{const a=raw(lo),b=raw(hi);return typeof a!=='string'&&typeof b!=='string'&&a.value_text===b.value_text?num(hi):`${num(lo)}–${num(hi)}`;};
 return {str,num,name,word,range};
}
type Renderer=(c:ReturnType<typeof ctx>)=>string;
/** Template id → zh / en renderer. Every template produced by facts.ts and review.ts is listed here (test enforces). */
export const TEMPLATES:Record<string,Record<Locale,Renderer>>={
 level:{zh:c=>`${c.name('series')}（${c.str('period')}）为 ${c.num('value')}。`,en:c=>`${c.name('series')} (${c.str('period')}) was ${c.num('value')}.`},
 change:{zh:c=>`${c.name('series')} ${c.str('period')} 较 ${c.str('prev_period')} 变化 ${c.num('change')}。`,en:c=>`${c.name('series')} changed by ${c.num('change')} from ${c.str('prev_period')} to ${c.str('period')}.`},
 derived_spread:{zh:c=>`${c.str('period')} ${c.name('a')} ${c.num('a_value')} 减 ${c.name('b')} ${c.num('b_value')}，利差为 ${c.num('value')}。`,en:c=>`On ${c.str('period')}, ${c.name('a')} ${c.num('a_value')} minus ${c.name('b')} ${c.num('b_value')} gives a spread of ${c.num('value')}.`},
 policy_event:{zh:c=>`${c.str('date')} 联邦基金目标利率由 ${c.range('lower_from','upper_from')} 调整为 ${c.range('lower_to','upper_to')}（上限变化 ${c.num('change')}）。`,en:c=>`On ${c.str('date')} the federal funds target moved from ${c.range('lower_from','upper_from')} to ${c.range('lower_to','upper_to')} (upper bound ${c.num('change')}).`},
 release:{zh:c=>`${c.name('series')} 新发布 ${c.str('period')} 数据 ${c.num('value')}（基线最新期 ${c.str('prev_period')}：${c.num('prev_value')}）。`,en:c=>`${c.name('series')} released ${c.str('period')} at ${c.num('value')} (baseline latest ${c.str('prev_period')}: ${c.num('prev_value')}).`},
 release_first:{zh:c=>`${c.name('series')} 新发布 ${c.str('period')} 数据 ${c.num('value')}（基线快照中无此序列）。`,en:c=>`${c.name('series')} released ${c.str('period')} at ${c.num('value')} (absent from the baseline snapshot).`},
 revision:{zh:c=>`${c.name('series')} ${c.str('period')} 数据由 ${c.num('from')} 修订为 ${c.num('to')}。`,en:c=>`${c.name('series')} for ${c.str('period')} was revised from ${c.num('from')} to ${c.num('to')}.`},
 timeliness_late:{zh:c=>`截至 ${c.str('date')}，${c.name('series')} 发布迟于预期（最新期 ${c.str('period')}）。`,en:c=>`As of ${c.str('date')}, ${c.name('series')} was late (latest period ${c.str('period')}).`},
 timeliness_missing:{zh:c=>`截至 ${c.str('date')}，${c.name('series')} 在快照中无观测。`,en:c=>`As of ${c.str('date')}, ${c.name('series')} had no observation in the snapshot.`},
 episode_opened:{zh:c=>`${c.word(DIRECTION,'direction')}行动段自 ${c.str('start')} 开始，至 ${c.str('end')} 共 ${c.num('events')} 次变动，上限 ${c.num('upper_from')} → ${c.num('upper_to')}，累计 ${c.num('cumulative')}。`,en:c=>`A ${c.word(DIRECTION,'direction')} episode began on ${c.str('start')}: ${c.num('events')} moves through ${c.str('end')}, upper bound ${c.num('upper_from')} → ${c.num('upper_to')}, cumulative ${c.num('cumulative')}.`},
 episode_ended:{zh:c=>`${c.str('start')} 至 ${c.str('end')} 的${c.word(DIRECTION,'direction')}行动段已结束（${c.num('events')} 次变动，上限 ${c.num('upper_from')} → ${c.num('upper_to')}，累计 ${c.num('cumulative')}）。`,en:c=>`The ${c.word(DIRECTION,'direction')} episode from ${c.str('start')} to ${c.str('end')} ended (${c.num('events')} moves, upper bound ${c.num('upper_from')} → ${c.num('upper_to')}, cumulative ${c.num('cumulative')}).`},
 asset_move:{zh:c=>`${c.name('series')} ${c.str('base_period')} → ${c.str('period')}：${c.num('from')} → ${c.num('to')}（${c.num('change')}）。`,en:c=>`${c.name('series')} ${c.str('base_period')} → ${c.str('period')}: ${c.num('from')} → ${c.num('to')} (${c.num('change')}).`},
 asset_missing:{zh:c=>`${c.name('series')} ${c.str('base_month')} 至 ${c.str('month')} 无法比较：${c.word(REASON,'reason')}。`,en:c=>`${c.name('series')} ${c.str('base_month')} to ${c.str('month')} not comparable: ${c.word(REASON,'reason')}.`},
 coverage:{zh:c=>`快照目录计数：已核实 ${c.num('verified')}，缺失 ${c.num('missing')}，受限 ${c.num('restricted')}。`,en:c=>`Snapshot catalog counts: verified ${c.num('verified')}, missing ${c.num('missing')}, restricted ${c.num('restricted')}.`},
 events_truncated:{zh:c=>`截至 ${c.str('date')}，政策事件序列读取被截断（${c.str('sources')}），本节无法列出。`,en:c=>`As of ${c.str('date')}, the policy event history read was truncated (${c.str('sources')}); this section cannot be listed.`},
 baseline_unavailable:{zh:c=>`${c.name('series')} 的基线数据${c.word(READ_STATE,'state')}，无法判断其为新发布或修订。`,en:c=>`${c.name('series')} baseline data unavailable (${c.word(READ_STATE,'state')}); release and revision could not be determined.`},
 catalog_unavailable:{zh:c=>`${c.name('series')} 目录状态：${c.word(STATUS,'status')}。`,en:c=>`${c.name('series')} catalog status: ${c.word(STATUS,'status')}.`},
};
export const TEMPLATE_IDS=Object.keys(TEMPLATES);
export function renderFact(f:Fact,locale:Locale,names:NameLookup):string{
 const t=TEMPLATES[f.template];if(!t)throw new Error(`unknown_template:${f.template}`);
 return t[locale](ctx(f,locale,names));
}
export const namesFrom=(catalog:readonly Pick<FrozenSeriesDef,'id'|'name'>[]):NameLookup=>{const m=new Map(catalog.map(d=>[d.id,d.name]));return id=>m.get(id)??null;};
export function renderFacts(facts:readonly Fact[],locale:Locale,catalog:readonly Pick<FrozenSeriesDef,'id'|'name'>[]):{fact_id:string;text:string}[]{
 const names=namesFrom(catalog);return facts.map(f=>({fact_id:f.fact_id,text:renderFact(f,locale,names)}));
}
/** Accepted explanation: fact sentences of every cited fact (first-cited order), then the model's hypotheses and counterpoints. */
export function renderExplanation(facts:readonly Fact[],output:{points:{fact_ids:string[];hypothesis:string}[];counterpoints:{fact_ids:string[];text:string}[]},locale:Locale,catalog:readonly Pick<FrozenSeriesDef,'id'|'name'>[]):RenderedExplanation{
 const byId=new Map(facts.map(f=>[f.fact_id,f]));const cited:string[]=[];
 for(const x of [...output.points,...output.counterpoints])for(const id of x.fact_ids)if(!cited.includes(id))cited.push(id);
 const names=namesFrom(catalog);
 return {facts:cited.map(id=>{const f=byId.get(id);if(!f)throw new Error(`unknown_fact:${id}`);return {fact_id:id,text:renderFact(f,locale,names)};}),
  hypotheses:output.points.map(p=>({text:p.hypothesis,fact_ids:[...p.fact_ids]})),counterpoints:output.counterpoints.map(p=>({text:p.text,fact_ids:[...p.fact_ids]}))};
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm test -- src/lib/macro/strategy/explain-render.test.ts src/lib/macro/strategy/explain-validate.test.ts`
Expected: PASS，`Tests  142 passed (142)`。

- [ ] **Step 9: 写两份提示文件**（Task 11 的 `explain-request.ts` 读取它们；Task 14 的禁用词扫描覆盖 `prompts/**`，两份文件都不含 `FORBIDDEN_TERMS` 与象限名）

`src/lib/macro/strategy/prompts/macro-explain-v1.zh.md`：

````md
<!-- macro-explain-prompt/1 · zh · spec 2026-11-07 §6.3. The facts are system-rendered; the model only selects facts and writes number-free mechanism hypotheses. -->
你是宏观研究助理。用户消息给出一份事实清单（JSON 数组，每项含 `fact_id` 与系统生成的事实句）。事实句已经由系统写好，你不要复述、改写或补充任何事实。

你的任务：
1. 从清单中选出相关的事实，每组引用一到四个 `fact_id`。
2. 为每组写一句"机制假设"：说明这些事实之间可能存在的传导机制。这是待检验的假设，不是结论，也不是预测。
3. 可选：写反方观点（同样引用事实编号），说明哪些情况会使该机制不成立。

硬性规则（任何一条违反，整份输出会被系统拒绝）：
- 文本中不得出现任何数字或数量表达：阿拉伯数字、全角数字、圈码、中文数字后接量词或单位（例如"个""次""年""月""倍""成""点"）、"第"加中文数字、百分号、"基点""百分点""百分之"、英文数词。需要指代事实里的数值时，只写"上述变化""该读数"之类，并引用对应的 `fact_id`。
- 不得使用表示结果确定或给出可能性大小的措辞，不写对未来走势的断言；用"可能通过……影响……""若……则……"表述机制。
- 不得使用经济周期阶段的名称，不对当前所处阶段作任何判定。
- 每条文本不超过两百四十个字符；假设一到六条，反方观点零到六条。
- 只引用清单里存在的 `fact_id`。

只输出 JSON，不要输出其他文字或代码块标记：
{"points":[{"fact_ids":["<fact_id>"],"hypothesis":"<机制假设>"}],"counterpoints":[{"fact_ids":["<fact_id>"],"text":"<反方观点>"}]}
````

`src/lib/macro/strategy/prompts/macro-explain-v1.en.md`：

````md
<!-- macro-explain-prompt/1 · en · spec 2026-11-07 §6.3. The facts are system-rendered; the model only selects facts and writes number-free mechanism hypotheses. -->
You are a macro research assistant. The user message contains a fact list (a JSON array; each item has a `fact_id` and a system-rendered fact sentence). The system has already written the fact sentences: do not restate, rewrite or add facts.

Your task:
1. Select relevant facts; each group cites between one and four `fact_id`s.
2. For each group write one mechanism hypothesis: a transmission mechanism that may link these facts. It is a hypothesis to be tested, not a conclusion and not a forecast.
3. Optionally write counterpoints (also citing fact ids) describing conditions under which the mechanism would not hold.

Hard rules (breaking any one makes the system reject the whole output):
- No numbers or quantity words anywhere in your text: no digits of any script, no percent sign, no "bp" or "pp", no spelled-out number words (including words such as "half", "double" or "twice"). To refer to a value in a fact, write "the change above" or "that reading" and cite its `fact_id`.
- No wording that asserts an outcome is certain or rates how likely it is, and no statements about where prices or rates are headed; phrase mechanisms as "may affect … through …" or "if … then …".
- Do not name business-cycle phases and do not classify the current phase.
- Each text is at most two hundred forty characters; between one and six hypotheses, up to six counterpoints.
- Cite only `fact_id`s present in the list.

Output JSON only, with no other text and no code fences:
{"points":[{"fact_ids":["<fact_id>"],"hypothesis":"<mechanism hypothesis>"}],"counterpoints":[{"fact_ids":["<fact_id>"],"text":"<counterpoint>"}]}
````

- [ ] **Step 10: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 均无错误、无警告。

- [ ] **Step 11: 提交**

```bash
git add src/lib/macro/strategy/explain-render.ts src/lib/macro/strategy/explain-render.test.ts src/lib/macro/strategy/explain-validate.ts src/lib/macro/strategy/explain-validate.test.ts src/lib/macro/strategy/prompts/macro-explain-v1.zh.md src/lib/macro/strategy/prompts/macro-explain-v1.en.md
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): fact sentence templates, lexical validator, prompts (spec 2026-11-07 §6.3)

explain-render.ts renders every fact template in zh/en with fixed number
formatting on the decimal text (bp to whole bp and pct to one decimal, both
half away from zero; exact pp/points; thousands separators). explain-validate.ts implements the draft-3
lexical policy: ajv shape, known fact ids, NFKC, numeral rules (Unicode Nd/No,
%, bp/pp, Chinese numerals in quantity context, English number words),
forbidden terms and regime terms, with every failure recorded.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: F4 读客户端、偏差案例与解读请求编排（`f4-client.ts`、`deviations.ts`、`explain-request.ts`）

**Files:**
- Create: `src/lib/macro/strategy/f4-client.ts`
- Create: `src/lib/macro/strategy/f4-client.test.ts`
- Create: `src/lib/macro/strategy/deviations.ts`
- Create: `src/lib/macro/strategy/deviations.test.ts`
- Create: `src/lib/macro/strategy/explain-request.ts`
- Create: `src/lib/macro/strategy/explain-request.test.ts`

规格要点：
- `f4-client.ts`（§9.1）：`createF4Client({baseUrl?, fetch?, timeoutMs?})`；默认 `baseUrl = process.env.NEXT_PUBLIC_SITE_URL`（未设或空 → 每次调用抛 `F4Unavailable('f4_unconfigured')`）；每次请求 `AbortSignal.timeout(3000)`、`cache:'no-store'`。任何失败（网络、超时、非 2xx、非 JSON、形状不对）→ `F4Unavailable`；详情响应的必填集合（`judgment.inputs`、`settlements`）缺失或非数组、任一条目非法（结算缺 `outcome` / 可解析的 `settled_at`）都按形状不对抛 `F4Unavailable`，**绝不**归一为空集合或丢弃条目（Task 11 Codex #2）；详情路由返回 **JSON 的 404** → `null`（判断不存在），非 JSON 的 404（路由不存在）→ `F4Unavailable`。`F4CardLite` 只投影无数字字段（`display.value` 是象限名时作为 `selected`）。`F4Client` 与 `F4Unavailable` 逐字取自计划骨架"依赖注入"节；`F4CardLite` / `F4JudgmentDetail` 已由 Task 6 放在 `f4-types.ts`，这里 `import type` 后再导出，不重复声明。
- `deviations.ts`（§6.4 第 3 稿 N13）：最新卡片 → `/history?limit=500&before=<上一页最后一条的 as_of>` 分页直到空页；累计超过 5000 条 → `incomplete:true`；游标不前进 → 停止并 `incomplete:true`；**只凭时间戳游标越过任何满页** → `incomplete:true`（排他游标下，页尾 `as_of` 为 T 时，页外可能还有同为 T 的卡片——哪怕页尾前一条不是 T，如 `[…, T+1, T]`——无法证明完整），继续翻页收集其余卡片（计划审计 #12、R2-3；稳定游标 `(as_of, judgment_id)` 是给 F4 的开放项 D19，有了之后满页不再标记）。只保留 `macro_regime@v1`、`lifecycle='settled'`、最新结算 `outcome='miss'`。差异按 `(series_id, period_end)` 匹配，分类穷尽；角色 = 该观测是否为本侧该序列的最新期。证据没有 `observation_refs`、或其中任一侧（登记输入的 `macro_observation` 快照 / 结算证据）有不完整项 → `evidence_incomplete`、`diffs=[]`，不过滤丢弃（Codex #1）；枚举到的合格卡片详情返回 null → `incomplete:true`（Codex #3）。
- `explain-request.ts`（§6.3 步骤 1–8，§9.1 判定顺序）：路由做 session（401）与 `MACRO_STRATEGY_ENABLED`（404）后调用 `handleExplainRequest(deps, userId, body)`，返回 `{status, body}`。顺序：ajv（400 `invalid_body`）→ `payload_hash = sha256(canonicalJson({subject, locale}))` → **幂等重放**（`db.runOf` 有行：哈希不同 → 409 `payload_conflict`；相同 → 先 `recoverExplanation`（完成恢复，见下），再经 `claimExplanation` 取投影，含超时 `abandoned` 处理；此步先于代码版本、底座与主体检查）→ `codeVersion` 为 null → 503 `code_version_unavailable`（计划审计 #9：重放不需要代码版本）→ 端口为 null → 503 `macro_foundation_unavailable` → 主体（快照：`buildSnapshotFactsManifest` 返回 null 即未知或 failed；复盘：主体 id 是不可变的 `result_id`，`db.reviewResult(id)` 取结果、`db.manifest` 取其清单，再经 `reviewFactsManifest` 生成解读清单；计划审计 #5）不存在 → 404 `subject_not_found`；事实（`explanationFacts`，即清单 `body.facts`）为空 → 422 `no_facts`；解读清单 `putManifest`；模型输入只由已存清单重建（`modelInput(stored.body, locale)`，计划审计 #16；**在 `claimExplanation` 之前构建**，所以提示文件或事实渲染失败不会打开用量运行，Codex #4）→ `llm.resolve()`（null → 503 `llm_not_configured`）→ 非 BYO 时 `llm.checkQuota()`（null = 失败放行；`limit === -1` 不限；`!allowed` → 429 `quota_exceeded`）→ `claimExplanation`（`existing` → 200 投影，**不计费不调用**）→ `begin`（抛错 = 结果不明，用量运行可能已提交：`recordCompletion(null, finalizePayload('failed', []))` → `finish('failed', ['usage_audit_unavailable' 或成本错误码])` → finally：`finalize(同一审计键, 该载荷)`，成功才 `markFinalized` → `costErrorStatus` 状态码，body 带投影）→ `call`（抛错 → `recordCompletion(null, finalizePayload('failed', [LlmCallError.accounting]))` → `finish('failed', ['provider_error' 或成本错误码])` → finally：`finalize` → 成功才 `markFinalized` → 200 投影）→ 成功返回后**立即** `recordCompletion({content}, finalizePayload('completed', [accounting]))`（先于校验）→ 解析 + 校验 → `finish(accepted|rejected)`（拒绝也是已完成调用）→ finally：`finalize` → 成功才 `markFinalized` → 200 投影。`finish` 或校验抛错时 `finalize` 仍执行，然后错误上抛（500）；`finalize` 抛错不改响应，`markFinalized` 不调用（运行行留 `finalize_payload` 与 `finalized=false`，运维按载荷原样重试，计划审计 #6–#8）；`recordCompletion` 自身失败不阻断后续步骤，`finish` 带同一载荷，行上无载荷时原子写入（计划审计 R2-2）。
- 完成恢复（计划审计 R2-1 / R2-2）：登记的原始输出是**完成信封** `{content, provider, model, prompt_version, validator_version, accounting}`，足以在不调提供方的情况下重建 finish。`recoverExplanation(d, id)`：`runDetail` → 行为 `running` 且已登记完成 → 只凭信封与 `db.manifest(run.manifest_id)` 的冻结事实重新解析 / 校验 / 渲染并 `finish`（信封里的校验器版本 ≠ 当前 `VALIDATOR_VERSION` → `failed {validator_version_changed}`）→ 行上有载荷且未结算 → 原样 `finalize`，成功才 `markFinalized`。从不抛错（失败时行保持原状，下次重放或 GET 再试）。结算独立于 finish：以**首次读取**的不可变载荷在 `finally` 中结算，恢复 finish 失败或 finish 后重读失败都不跳过结算（Codex #5）。POST 幂等重放对该运行调用一次；`recoverUserExplanations(d, userId, limit=3)` 供 `GET /explanations` 调用（Task 12）。认领 RPC 与过期函数不放弃已登记完成的行，所以恢复总能在过期之前看到它们。
- `LlmCallError(message, accounting)`：Task 12 的生产 `LlmDeps.call` 在 `runMeteredLlmCall` 抛错时用 `meteredUsageFromError(e)` 构造它（成本错误时 `message` 用成本错误码，如 `daily_cost_exhausted`）。
- `REPLAY_MANIFEST_ID`（全零 uuid）只在重放路径传给 `claimExplanation`：该 `(user_id, request_id)` 行已存在，RPC 不会插入。

- [ ] **Step 1: 写 `f4-client.ts` 的失败测试**

```ts
// src/lib/macro/strategy/f4-client.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cardLite,createF4Client,F4Unavailable,judgmentDetailOf} from './f4-client';

const CARD={judgment_id:'j1',judgment_type:'macro_regime',lifecycle:'open',calibration:'insufficient',as_of:'2026-10-15',registered_at:'2026-10-15T07:00:00Z',
 methodology:{id:'macro_regime',version:'v1',title:{zh:'宏观象限',en:'Macro quadrant'},href:'/intel/methods/macro_regime/v1'},display:{headline:{zh:'',en:''},percent:null,value:'overheat'}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
function client(handler:(url:URL)=>Response|Promise<Response>,o:{baseUrl?:string|null;timeoutMs?:number}={}){
 const urls:URL[]=[];
 const f=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(String(input));urls.push(u);expect(init?.signal).toBeInstanceOf(AbortSignal);return handler(u);});
 return {c:createF4Client({baseUrl:o.baseUrl===undefined?'https://alpha.test/':o.baseUrl,fetch:f as unknown as typeof fetch,timeoutMs:o.timeoutMs}),urls,f};
}
afterEach(()=>{vi.unstubAllEnvs();});

describe('createF4Client (spec §9.1: same-site HTTP, 3 s timeout, any failure → F4Unavailable)',()=>{
 it('latestRegimeCard reads /api/judgments for the region and projects number-free fields',async()=>{
  const {c,urls}=client(()=>json({subject:{},cards:[{...CARD,judgment_type:'other'},CARD]}));
  expect(await c.latestRegimeCard('US')).toEqual({judgment_id:'j1',lifecycle:'open',calibration:'insufficient',as_of:'2026-10-15',methodology:{id:'macro_regime',version:'v1'},selected:'overheat'});
  expect(urls[0].origin+urls[0].pathname).toBe('https://alpha.test/api/judgments');
  expect(Object.fromEntries(urls[0].searchParams)).toEqual({subject_type:'macro_region',subject_key:'US',types:'macro_regime'});
 });
 it('asOf switches to view=as_known',async()=>{
  const {c,urls}=client(()=>json({cards:[]}));
  expect(await c.latestRegimeCard('CN',{asOf:'2026-10-31'})).toBeNull();
  expect(urls[0].searchParams.get('view')).toBe('as_known');expect(urls[0].searchParams.get('asOf')).toBe('2026-10-31');
 });
 it('judgmentDetail: JSON 404 → null; HTML 404 (route absent) → F4Unavailable',async()=>{
  expect(await client(()=>json({error:{code:'not_found'}},404)).c.judgmentDetail('j9')).toBeNull();
  await expect(client(()=>new Response('<html>',{status:404,headers:{'content-type':'text/html'}})).c.judgmentDetail('j9')).rejects.toBeInstanceOf(F4Unavailable);
 });
 it('judgmentDetail keeps inputs and settlements (settlement rows pass through unknown fields)',async()=>{
  const {c,urls}=client(()=>json({card:CARD,judgment:{judgment_id:'j1',as_of:'2026-10-15',claim:{selected:'recession'},inputs:[{kind:'macro_observation',ref:{series_id:'US_CPI_YOY'},snapshot:{series_id:'US_CPI_YOY',period_end:'2026-09-30',vintage_id:'v1',value:2.9}}]},
   settlements:[{settlement_id:'s1',outcome:'miss',realized:'recovery',evidence:{observation_refs:[]},settled_at:'2027-02-01T00:00:00Z'}],calibration:null}));
  const d=await c.judgmentDetail('j 1');
  expect(urls[0].pathname).toBe('/api/judgments/j%201');
  expect(d).toMatchObject({judgment_id:'j1',as_of:'2026-10-15',selected:'recession',inputs:[{kind:'macro_observation',snapshot:{period_end:'2026-09-30'}}],settlements:[{outcome:'miss',realized:'recovery',settled_at:'2027-02-01T00:00:00Z'}]});
  expect(d!.settlements[0].settlement_id).toBe('s1');
 });
 it('history passes limit and before, accepts {cards} or {items}',async()=>{
  const {c,urls}=client(u=>u.searchParams.get('before')?json({items:[]}):json({cards:[CARD]}));
  expect((await c.history('j1',null,500)).map(x=>x.judgment_id)).toEqual(['j1']);
  expect(await c.history('j1','2026-10-15',500)).toEqual([]);
  expect(urls[0].pathname).toBe('/api/judgments/j1/history');
  expect(Object.fromEntries(urls[0].searchParams)).toEqual({limit:'500'});
  expect(Object.fromEntries(urls[1].searchParams)).toEqual({limit:'500',before:'2026-10-15'});
 });
 it.each([
  ['no base URL',()=>client(()=>json({cards:[]}),{baseUrl:null}).c],
  ['5xx',()=>client(()=>json({error:{}},503)).c],
  ['network error',()=>client(()=>{throw new TypeError('fetch failed');}).c],
  ['non-JSON 200',()=>client(()=>new Response('ok',{status:200,headers:{'content-type':'text/plain'}})).c],
  ['malformed list',()=>client(()=>json({nope:true})).c],
  ['malformed card',()=>client(()=>json({cards:[{judgment_type:'macro_regime'}]})).c],
 ])('%s → F4Unavailable',async(_,make)=>{
  await expect(make().latestRegimeCard('US')).rejects.toBeInstanceOf(F4Unavailable);
 });
 it('times out after timeoutMs',async()=>{
  const slow=createF4Client({baseUrl:'https://alpha.test',timeoutMs:20,fetch:((_:unknown,init?:RequestInit)=>new Promise((_r,reject)=>{init?.signal?.addEventListener('abort',()=>reject(init.signal!.reason));})) as typeof fetch});
  await expect(slow.latestRegimeCard('US')).rejects.toThrow(F4Unavailable);
 });
 it('defaults to NEXT_PUBLIC_SITE_URL',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://site.test');
  const f=vi.fn(async()=>json({cards:[]}));
  await createF4Client({fetch:f as unknown as typeof fetch}).latestRegimeCard('US');
  expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/site\.test\/api\/judgments\?/);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL','');
  await expect(createF4Client({fetch:f as unknown as typeof fetch}).latestRegimeCard('US')).rejects.toThrow('f4_unconfigured');
 });
});

describe('projections',()=>{
 it('cardLite drops every numeric display field and maps an unknown class to null',()=>{
  const lite=cardLite({...CARD,display:{percent:61,value:'sideways'},calibration_summary:{brier:0.2}});
  expect(lite).toEqual({judgment_id:'j1',lifecycle:'open',calibration:'insufficient',as_of:'2026-10-15',methodology:{id:'macro_regime',version:'v1'},selected:null});
 });
 it('judgmentDetailOf falls back to the card for selected and requires an id',()=>{
  expect(judgmentDetailOf({card:CARD,judgment:{judgment_id:'j1',as_of:'2026-10-15',inputs:[]},settlements:[]}).selected).toBe('overheat');
  expect(()=>judgmentDetailOf({judgment:{}})).toThrow(F4Unavailable);
 });
 it('judgmentDetailOf rejects malformed collections instead of normalizing them to empty / dropping entries',()=>{
  const j={judgment_id:'j1',as_of:'2026-10-15',inputs:[]};
  const S={outcome:'miss',realized:'recovery',evidence:null,settled_at:'2027-02-01T00:00:00Z'};
  for(const bad of [
   {card:CARD,judgment:j},                                         // settlements missing
   {card:CARD,judgment:j,settlements:{}},                          // settlements not an array
   {card:CARD,judgment:j,settlements:[S,null]},                    // invalid entry
   {card:CARD,judgment:j,settlements:[S,{...S,settled_at:undefined}]},   // latest has no ordering field
   {card:CARD,judgment:j,settlements:[{...S,outcome:undefined}]},
   {card:CARD,judgment:j,settlements:[{...S,evidence:'x'}]},
   {card:CARD,judgment:{...j,inputs:undefined},settlements:[]},
   {card:CARD,judgment:{...j,inputs:[null]},settlements:[]},
  ])expect(()=>judgmentDetailOf(bad)).toThrow(F4Unavailable);
  expect(judgmentDetailOf({card:CARD,judgment:j,settlements:[S]}).settlements).toHaveLength(1);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/macro/strategy/f4-client.test.ts`
Expected: FAIL，`Failed to resolve import "./f4-client"`。

- [ ] **Step 3: 实现 `f4-client.ts`**

```ts
// src/lib/macro/strategy/f4-client.ts
// F4 read client (spec 2026-11-07 §9.1 last paragraph, §5.2, §6.2, §6.4). P3/P4 never import src/lib/judgments: they read
// F4's public HTTP routes on this site (NEXT_PUBLIC_SITE_URL) with a 3-second timeout. Any failure (no base URL, network,
// timeout, non-2xx, a 404 that is not JSON i.e. the route does not exist, malformed body) throws F4Unavailable; a JSON 404
// from the detail route means "no such judgment" → null. Only number-free fields are projected (spec §5.2 N12).
// F4CardLite / F4JudgmentDetail live in f4-types.ts (Task 6) and are re-exported here, never redeclared.
import type {Region,Regime} from './contract';
import {REGIMES} from './contract';
import type {F4CardLite,F4JudgmentDetail} from './f4-types';

export type {F4CardLite,F4JudgmentDetail};
export interface F4Client{
 latestRegimeCard(region:Region,opts?:{asOf?:string}):Promise<F4CardLite|null>;
 judgmentDetail(id:string):Promise<F4JudgmentDetail|null>;
 history(id:string,before:string|null,limit:number):Promise<F4CardLite[]>;
}
export class F4Unavailable extends Error{constructor(message='f4_unavailable'){super(message);this.name='F4Unavailable';}}
export const F4_TIMEOUT_MS=3000;

type Json=Record<string,unknown>;
const isObj=(v:unknown):v is Json=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown):string|null=>typeof v==='string'?v:null;
export const asRegime=(v:unknown):Regime|null=>typeof v==='string'&&(REGIMES as readonly string[]).includes(v)?v as Regime:null;
/** JudgmentCard (F4 spec §9.2) → number-free projection; the categorical value of macro_regime is display.value. */
export function cardLite(c:unknown):F4CardLite{
 if(!isObj(c))throw new F4Unavailable('f4_malformed:card');
 const m=isObj(c.methodology)?c.methodology:null;const id=str(c.judgment_id);const asOf=str(c.as_of);
 if(!id||!asOf||!m||!str(m.id)||!str(m.version))throw new F4Unavailable('f4_malformed:card');
 const display=isObj(c.display)?c.display:{};
 return {judgment_id:id,lifecycle:str(c.lifecycle)??'unknown',calibration:str(c.calibration)??'unknown',as_of:asOf,methodology:{id:m.id as string,version:m.version as string},selected:asRegime(display.value)};
}
export function judgmentDetailOf(body:unknown):F4JudgmentDetail{
 if(!isObj(body)||!isObj(body.judgment))throw new F4Unavailable('f4_malformed:detail');
 const j=body.judgment;const card=isObj(body.card)?body.card:{};const display=isObj(card.display)?card.display:{};
 const id=str(j.judgment_id)??str(card.judgment_id);const asOf=str(j.as_of)??str(card.as_of);
 if(!id||!asOf)throw new F4Unavailable('f4_malformed:detail');
 const claim=isObj(j.claim)?j.claim:{};
 const bad=()=>new F4Unavailable('f4_malformed:detail');
 // Required collections are validated, never normalized: a missing / non-array collection or an invalid entry is malformed.
 if(!Array.isArray(j.inputs)||!Array.isArray(body.settlements))throw bad();
 const inputs=j.inputs.map(x=>{
  if(!isObj(x)||str(x.kind)===null||(x.ref!==undefined&&!isObj(x.ref))||(x.snapshot!==undefined&&!isObj(x.snapshot)))throw bad();
  return {...x,kind:x.kind as string,ref:isObj(x.ref)?x.ref:{},snapshot:isObj(x.snapshot)?x.snapshot:{}};
 });
 const settlements=body.settlements.map(s=>{
  const settledAt=isObj(s)?str(s.settled_at):null;
  if(!isObj(s)||!settledAt||Number.isNaN(Date.parse(settledAt))||str(s.outcome)===null||(s.settlement_id!==undefined&&str(s.settlement_id)===null)||(s.evidence!==undefined&&s.evidence!==null&&!isObj(s.evidence)))throw bad();
  return {...s,settlement_id:str(s.settlement_id)??undefined,outcome:str(s.outcome),realized:s.realized??null,evidence:isObj(s.evidence)?s.evidence:null,settled_at:settledAt};
 });
 return {judgment_id:id,as_of:asOf,selected:asRegime(claim.selected)??asRegime(display.value),inputs,settlements};
}
export function createF4Client(o:{baseUrl?:string|null;fetch?:typeof fetch;timeoutMs?:number}={}):F4Client{
 const base=(o.baseUrl===undefined?process.env.NEXT_PUBLIC_SITE_URL??null:o.baseUrl)?.replace(/\/+$/,'')||null;
 const doFetch=o.fetch??fetch;const timeoutMs=o.timeoutMs??F4_TIMEOUT_MS;
 async function get(path:string,params:Record<string,string>,allowNotFound:boolean):Promise<unknown|null>{
  if(!base)throw new F4Unavailable('f4_unconfigured');
  const url=`${base}${path}${Object.keys(params).length?`?${new URLSearchParams(params)}`:''}`;
  let res:Response;
  try{res=await doFetch(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',headers:{accept:'application/json'}});}
  catch(e){throw new F4Unavailable(`f4_fetch_failed:${e instanceof Error?e.name:'error'}`);}
  const json=(res.headers.get('content-type')??'').includes('application/json');
  if(res.status===404&&allowNotFound&&json)return null;
  if(!res.ok)throw new F4Unavailable(`f4_status:${res.status}`);
  if(!json)throw new F4Unavailable('f4_not_json');
  try{return await res.json();}catch{throw new F4Unavailable('f4_malformed:json');}
 }
 return {
  async latestRegimeCard(region,opts){
   const p:Record<string,string>={subject_type:'macro_region',subject_key:region,types:'macro_regime'};
   if(opts?.asOf){p.view='as_known';p.asOf=opts.asOf;}
   const body=await get('/api/judgments',p,false);
   if(!isObj(body)||!Array.isArray(body.cards))throw new F4Unavailable('f4_malformed:list');
   const card=body.cards.find(c=>isObj(c)&&c.judgment_type==='macro_regime')??null;
   return card?cardLite(card):null;
  },
  async judgmentDetail(id){
   const body=await get(`/api/judgments/${encodeURIComponent(id)}`,{},true);
   return body===null?null:judgmentDetailOf(body);
  },
  async history(id,before,limit){
   const p:Record<string,string>={limit:String(limit)};if(before)p.before=before;
   const body=await get(`/api/judgments/${encodeURIComponent(id)}/history`,p,false);
   const list=isObj(body)?(Array.isArray(body.cards)?body.cards:Array.isArray(body.items)?body.items:null):null;
   if(!list)throw new F4Unavailable('f4_malformed:history');
   return list.map(cardLite);
  },
 };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/macro/strategy/f4-client.test.ts`
Expected: PASS，`Tests  16 passed (16)`。

- [ ] **Step 5: 写 `deviations.ts` 的失败测试**

```ts
// src/lib/macro/strategy/deviations.test.ts
import {describe,expect,it,vi} from 'vitest';
import {classifyDiffs,DEVIATION_CAP,deviationCase,HISTORY_PAGE,listDeviationCases,type FrozenObs} from './deviations';
import {F4Unavailable,type F4CardLite,type F4Client,type F4JudgmentDetail} from './f4-client';

const o=(series_id:string,period_end:string,vintage_id:string,value=1):FrozenObs=>({series_id,period_end,vintage_id,value});
const card=(id:string,as_of:string,over:Partial<F4CardLite>={}):F4CardLite=>({judgment_id:id,lifecycle:'settled',calibration:'insufficient',as_of,methodology:{id:'macro_regime',version:'v1'},selected:'overheat',...over});
const obsInput=(x:FrozenObs)=>({kind:'macro_observation',ref:{series_id:x.series_id,period_end:x.period_end,vintage_id:x.vintage_id},snapshot:{...x,unit:'pct',available_at:'2026-10-01T00:00:00Z'}});
function detail(id:string,reg:FrozenObs[],settled:FrozenObs[]|null,over:Partial<F4JudgmentDetail['settlements'][number]>={}):F4JudgmentDetail{
 return {judgment_id:id,as_of:'2026-10-15',selected:'overheat',inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'s'},snapshot:{snapshot_id:'s'}},...reg.map(obsInput)],
  settlements:[{outcome:'hit',realized:'overheat',evidence:null,settled_at:'2026-12-01T00:00:00Z'},
   {settlement_id:'set-2',outcome:'miss',realized:'recession',evidence:settled===null?{note:'x'}:{observation_refs:settled.map(x=>({...x,available_at:'2027-01-01T00:00:00Z'}))},settled_at:'2027-02-01T00:00:00Z',...over} as F4JudgmentDetail['settlements'][number]]};
}

describe('classifyDiffs (spec §6.4 N13, exhaustive)',()=>{
 it('revised / unchanged / dropped / newly_available(later_period | backfill | new_series) with roles',()=>{
  const reg=[o('A','2026-08-31','v1'),o('A','2026-09-30','v1'),o('B','2026-09-30','v1'),o('C','2026-09-30','v1',2)];
  const set=[o('A','2026-08-31','v2'),o('A','2026-09-30','v1'),o('A','2026-10-31','v1'),o('C','2026-06-30','v1'),o('D','2026-09-30','v1',5)];
  expect(classifyDiffs(reg,set)).toEqual([
   {series_id:'A',period_end:'2026-08-31',role:'comparison',kind:'revised',subkind:null,registered:{vintage_id:'v1',value:1},settled:{vintage_id:'v2',value:1}},
   {series_id:'A',period_end:'2026-09-30',role:'latest',kind:'unchanged',subkind:null,registered:{vintage_id:'v1',value:1},settled:{vintage_id:'v1',value:1}},
   {series_id:'A',period_end:'2026-10-31',role:'latest',kind:'newly_available',subkind:'later_period',registered:null,settled:{vintage_id:'v1',value:1}},
   {series_id:'B',period_end:'2026-09-30',role:'latest',kind:'dropped',subkind:null,registered:{vintage_id:'v1',value:1},settled:null},
   {series_id:'C',period_end:'2026-06-30',role:'latest',kind:'newly_available',subkind:'backfill',registered:null,settled:{vintage_id:'v1',value:1}},
   {series_id:'C',period_end:'2026-09-30',role:'latest',kind:'dropped',subkind:null,registered:{vintage_id:'v1',value:2},settled:null},
   {series_id:'D',period_end:'2026-09-30',role:'latest',kind:'newly_available',subkind:'new_series',registered:null,settled:{vintage_id:'v1',value:5}},
  ]);
 });
});

describe('deviationCase',()=>{
 it('builds a complete case from the latest settlement (a miss) with its settlement id and realized class',()=>{
  const c=deviationCase('US',card('j1','2026-10-15'),detail('j1',[o('A','2026-09-30','v1')],[o('A','2026-09-30','v2')]));
  expect(c).toEqual({judgment_id:'j1',settlement_id:'set-2',region:'US',as_of:'2026-10-15',selected:'overheat',realized:'recession',evidence_state:'complete',
   diffs:[{series_id:'A',period_end:'2026-09-30',role:'latest',kind:'revised',subkind:null,registered:{vintage_id:'v1',value:1},settled:{vintage_id:'v2',value:1}}]});
 });
 it('evidence without observation_refs → evidence_incomplete, no recomputation',()=>{
  expect(deviationCase('US',card('j1','2026-10-15'),detail('j1',[o('A','2026-09-30','v1')],null))).toMatchObject({evidence_state:'evidence_incomplete',diffs:[]});
 });
 it('a malformed registered observation → evidence_incomplete, never a silent drop that fakes newly_available',()=>{
  const d=detail('j1',[o('A','2026-09-30','v1')],[o('A','2026-09-30','v1')]);
  (d.inputs[1].snapshot as Record<string,unknown>).value=undefined;
  expect(deviationCase('US',card('j1','2026-10-15'),d)).toMatchObject({evidence_state:'evidence_incomplete',diffs:[]});
 });
 it('skips hits, other methods / versions, unsettled cards',()=>{
  const d=detail('j1',[],[]);
  expect(deviationCase('US',card('j1','x'),{...d,settlements:[{...d.settlements[1],outcome:'hit'}]})).toBeNull();
  expect(deviationCase('US',card('j1','x',{methodology:{id:'macro_regime',version:'v2'}}),d)).toBeNull();
  expect(deviationCase('US',card('j1','x',{methodology:{id:'other',version:'v1'}}),d)).toBeNull();
  expect(deviationCase('US',card('j1','x',{lifecycle:'open'}),d)).toBeNull();
 });
 it('realized may be an object with selected / primary_state; numeric strings in values are accepted',()=>{
  const d=detail('j1',[],[]);d.settlements[1].realized={primary_state:'recovery'};
  expect(deviationCase('US',card('j1','x'),d)?.realized).toBe('recovery');
  const e=detail('j1',[],[]);e.settlements[1].evidence={observation_refs:[{series_id:'A',period_end:'2026-09-30',vintage_id:'v1',value:'2.5'}]};
  expect(deviationCase('US',card('j1','x'),e)?.diffs[0].settled).toEqual({vintage_id:'v1',value:2.5});
 });
});

function fakeF4(pages:F4CardLite[][],details:Record<string,F4JudgmentDetail>,latest:F4CardLite|null=card('j0','2026-10-15')):F4Client&{before:(string|null)[]}{
 const before:(string|null)[]=[];let i=0;
 return {before,latestRegimeCard:async()=>latest,judgmentDetail:async(id)=>details[id]??null,history:async(_id,b)=>{before.push(b);return pages[i++]??[];}};
}
describe('listDeviationCases (spec §6.4 enumeration)',()=>{
 it('pages until an empty page, using the last as_of as the cursor, and keeps settled misses only',async()=>{
  const f4=fakeF4([[card('j0','2026-10-15'),card('j1','2026-09-15'),card('j2','2026-08-15',{lifecycle:'open'})],[card('j3','2026-07-15')],[]],
   {j0:detail('j0',[],[]),j1:{...detail('j1',[],[]),settlements:[{outcome:'hit',realized:'overheat',evidence:null,settled_at:'2027-01-01T00:00:00Z'}]},j3:detail('j3',[o('A','2026-06-30','v1')],[o('A','2026-06-30','v1')])});
  const r=await listDeviationCases(f4,'CN');
  expect(f4.before).toEqual([null,'2026-08-15','2026-07-15']);
  expect(r.incomplete).toBe(false);
  expect(r.cases.map(c=>c.judgment_id)).toEqual(['j0','j3']);
  expect(r.cases[1].region).toBe('CN');
 });
 it('no card → empty, complete',async()=>{
  expect(await listDeviationCases(fakeF4([],{},null),'US')).toEqual({cases:[],incomplete:false});
 });
 it('more than 5000 cards → incomplete',async()=>{
  const day=(n:number)=>new Date(Date.UTC(2026,0,1)-n*86_400_000).toISOString().slice(0,10);
  const pages=Array.from({length:11},(_,p)=>Array.from({length:500},(_,k)=>card(`j${p}-${k}`,day(p*500+k+1))));
  const f4=fakeF4(pages,{});const detailSpy=vi.spyOn(f4,'judgmentDetail');
  const r=await listDeviationCases(f4,'US');
  expect(r.incomplete).toBe(true);
  expect(detailSpy.mock.calls.length).toBeLessThanOrEqual(DEVIATION_CAP);
 });
 it('a cursor that does not move stops with incomplete instead of looping',async()=>{
  const f4=fakeF4([[card('a','2026-05-01')],[card('b','2026-05-01')],[card('c','2026-04-01')]],{});
  expect((await listDeviationCases(f4,'US')).incomplete).toBe(true);
  expect(f4.before).toEqual([null,'2026-05-01']);
 });
 it('a full page whose boundary ties on as_of → incomplete, and the walk still collects the later pages',async()=>{
  const full=Array.from({length:HISTORY_PAGE},(_,k)=>card(`t${k}`,k<HISTORY_PAGE-2?`2026-0${1+(k%5)}-01`:'2025-12-31'));
  full.sort((a,b)=>a.as_of<b.as_of?1:a.as_of>b.as_of?-1:0);
  const f4=fakeF4([full,[card('next','2025-12-30',{lifecycle:'open'})],[]],{});
  expect((await listDeviationCases(f4,'US')).incomplete).toBe(true);
  expect(f4.before).toEqual([null,'2025-12-31','2025-12-30']);
 });
 it('singleton at the boundary: a full page ending [… T+1, T] with an unseen card at T behind the cursor → incomplete',async()=>{
  const day=(n:number)=>new Date(Date.UTC(2026,0,1)-n*86_400_000).toISOString().slice(0,10);
  const full=Array.from({length:HISTORY_PAGE},(_,k)=>card(`u${k}`,day(k+1)));   // distinct as_of values; the last two differ
  const T=day(HISTORY_PAGE);
  const f4=fakeF4([full,[]],{});   // F4 holds another card at T, which the exclusive `before=T` page can never return
  const r=await listDeviationCases(f4,'US');
  expect(f4.before).toEqual([null,T]);
  expect(r.incomplete).toBe(true);
 });
 it('short pages (even with an as_of tie) keep the result complete',async()=>{
  const f4=fakeF4([[card('s1','2024-01-02'),card('s2','2024-01-02')],[card('s3','2024-01-01')],[]],{j0:detail('j0',[],[]),s1:detail('s1',[],[]),s2:detail('s2',[],[]),s3:detail('s3',[],[])});
  expect((await listDeviationCases(f4,'US')).incomplete).toBe(false);
  expect(f4.before).toEqual([null,'2024-01-02','2024-01-01']);
 });
 it('an enumerated settled card whose detail is missing → incomplete, not silently complete',async()=>{
  const f4=fakeF4([[card('j0','2026-10-15'),card('j1','2026-09-15')],[]],{j0:detail('j0',[],[])});
  const r=await listDeviationCases(f4,'US');
  expect(r.incomplete).toBe(true);
  expect(r.cases.map(c=>c.judgment_id)).toEqual(['j0']);
 });
 it('F4Unavailable propagates',async()=>{
  const f4=fakeF4([],{});f4.latestRegimeCard=async()=>{throw new F4Unavailable();};
  await expect(listDeviationCases(f4,'US')).rejects.toBeInstanceOf(F4Unavailable);
 });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm test -- src/lib/macro/strategy/deviations.test.ts`
Expected: FAIL，`Failed to resolve import "./deviations"`。

- [ ] **Step 7: 实现 `deviations.ts`**

```ts
// src/lib/macro/strategy/deviations.ts
// Deviation cases macro-deviations/1 (spec 2026-11-07 §6.4, draft 3 N13; judgment layer on only). Enumerate macro_regime
// cards of a region through F4: latest card, then /history pages until an empty page; more than 5000 cards → incomplete.
// The cursor is the last card's as_of (exclusive `before`). Advancing past a FULL page with that timestamp-only cursor
// can never prove that no unseen card shares the boundary as_of (the page may end [… T+1, T] while another card with T
// sits behind it), so every full page marks the result incomplete; the walk still continues to collect the rest. Only
// a stable (as_of, judgment_id) cursor from F4 (plan open item D19) can lift this. A cursor that does not move stops the
// walk, incomplete.
// Keep macro_regime@v1 cards with lifecycle 'settled' whose latest settlement outcome is 'miss'. For each, diff the
// registered inputs (macro_observation frozen projections) against the latest settlement's evidence.observation_refs,
// matched by (series_id, period_end); classification is exhaustive (revised / unchanged / dropped / newly_available with
// later_period / backfill / new_series). Evidence without observation_refs → evidence_incomplete; never recomputed here.
// A malformed registered or settled observation → evidence_incomplete; an enumerated eligible card whose detail is missing → incomplete.
// No narrative. F4Unavailable propagates to the route (→ 503 judgments_unavailable).
import type {DeviationCase,DiffKind,NewlySubkind,Region} from './contract';
import {asRegime,type F4CardLite,type F4Client,type F4JudgmentDetail} from './f4-client';

export const DEVIATION_CAP=5000;
export const HISTORY_PAGE=500;
export const METHOD={id:'macro_regime',version:'v1'} as const;
export interface FrozenObs{series_id:string;period_end:string;vintage_id:string;value:number}
type Diff=DeviationCase['diffs'][number];

const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function frozenObs(v:unknown):FrozenObs|null{
 if(!isObj(v))return null;
 const value=typeof v.value==='number'?v.value:typeof v.value==='string'&&v.value.trim()!==''?Number(v.value):NaN;
 if(typeof v.series_id!=='string'||typeof v.period_end!=='string'||typeof v.vintage_id!=='string'||!Number.isFinite(value))return null;
 return {series_id:v.series_id,period_end:v.period_end,vintage_id:v.vintage_id,value};
}
const latestPeriods=(rows:readonly FrozenObs[])=>{const m=new Map<string,string>();for(const r of rows){const p=m.get(r.series_id);if(!p||r.period_end>p)m.set(r.series_id,r.period_end);}return m;};
/** Exhaustive diff of registered vs settled observations (spec §6.4 N13). settled = null → evidence incomplete (no diffs). */
export function classifyDiffs(registered:readonly FrozenObs[],settled:readonly FrozenObs[]):Diff[]{
 const key=(r:FrozenObs)=>`${r.series_id}|${r.period_end}`;
 const reg=new Map(registered.map(r=>[key(r),r]));const set=new Map(settled.map(r=>[key(r),r]));
 const regLatest=latestPeriods(registered);const setLatest=latestPeriods(settled);
 const role=(latest:Map<string,string>,r:FrozenObs):'latest'|'comparison'=>latest.get(r.series_id)===r.period_end?'latest':'comparison';
 const cell=(r:FrozenObs|undefined)=>r?{vintage_id:r.vintage_id,value:r.value}:null;
 const out:Diff[]=[];
 for(const k of [...new Set([...reg.keys(),...set.keys()])].sort()){
  const a=reg.get(k);const b=set.get(k);const any=(a??b)!;
  let kind:DiffKind;let subkind:NewlySubkind|null=null;
  if(a&&b)kind=a.vintage_id===b.vintage_id?'unchanged':'revised';
  else if(a)kind='dropped';
  else{kind='newly_available';const l=regLatest.get(any.series_id);subkind=l===undefined?'new_series':any.period_end>l?'later_period':'backfill';}
  out.push({series_id:any.series_id,period_end:any.period_end,role:a?role(regLatest,a):role(setLatest,b!),kind,subkind,registered:cell(a),settled:cell(b)});
 }
 return out;
}
/** null unless the card is macro_regime@v1, settled, and its latest settlement is a miss. */
export function deviationCase(region:Region,card:F4CardLite,detail:F4JudgmentDetail):DeviationCase|null{
 if(card.methodology.id!==METHOD.id||card.methodology.version!==METHOD.version||card.lifecycle!=='settled')return null;
 const latest=[...detail.settlements].sort((x,y)=>x.settled_at<y.settled_at?1:x.settled_at>y.settled_at?-1:0)[0];
 if(!latest||latest.outcome!=='miss')return null;
 const selected=detail.selected??card.selected;if(!selected)return null;
 const refs=latest.evidence?.observation_refs;
 const realized=asRegime(latest.realized)??(isObj(latest.realized)?asRegime(latest.realized.selected)??asRegime(latest.realized.primary_state):null);
 const base={judgment_id:detail.judgment_id,settlement_id:latest.settlement_id??null,region,as_of:detail.as_of,selected,realized};
 // Both sides are validated without filtering: a malformed entry on either side makes the evidence incomplete (no diffs).
 if(!Array.isArray(refs))return {...base,evidence_state:'evidence_incomplete',diffs:[]};
 const registered=detail.inputs.filter(i=>i.kind==='macro_observation').map(i=>frozenObs(i.snapshot));
 const settled=refs.map(frozenObs);
 if(registered.some(x=>x===null)||settled.some(x=>x===null))return {...base,evidence_state:'evidence_incomplete',diffs:[]};
 return {...base,evidence_state:'complete',diffs:classifyDiffs(registered as FrozenObs[],settled as FrozenObs[])};
}
/** Enumerate the region's macro_regime cards to an empty history page (cap 5000), then build cases for settled misses. */
export async function listDeviationCases(f4:F4Client,region:Region):Promise<{cases:DeviationCase[];incomplete:boolean}>{
 const latest=await f4.latestRegimeCard(region);
 if(!latest)return {cases:[],incomplete:false};
 const seen=new Map<string,F4CardLite>([[latest.judgment_id,latest]]);let incomplete=false;let before:string|null=null;
 for(;;){
  const page=await f4.history(latest.judgment_id,before,HISTORY_PAGE);
  if(page.length===0)break;
  for(const c of page)if(!seen.has(c.judgment_id))seen.set(c.judgment_id,c);
  if(seen.size>DEVIATION_CAP){incomplete=true;break;}
  const next=page[page.length-1].as_of;
  if(before!==null&&next>=before){incomplete=true;break;}   // cursor did not move: stop rather than loop
  if(page.length>=HISTORY_PAGE)incomplete=true;             // full page + timestamp-only cursor: completeness unprovable (R2-3)
  before=next;
 }
 const cards=[...seen.values()].slice(0,DEVIATION_CAP).filter(c=>c.methodology.id===METHOD.id&&c.methodology.version===METHOD.version&&c.lifecycle==='settled');
 const cases:DeviationCase[]=[];
 for(const c of cards){
  const detail=await f4.judgmentDetail(c.judgment_id);
  if(!detail){incomplete=true;continue;}   // enumerated by history but unresolvable: outcome and evidence were never inspected
  const dc=deviationCase(region,c,detail);if(dc)cases.push(dc);
 }
 cases.sort((x,y)=>x.as_of<y.as_of?1:x.as_of>y.as_of?-1:x.judgment_id<y.judgment_id?-1:1);
 return {cases,incomplete};
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm test -- src/lib/macro/strategy/deviations.test.ts`
Expected: PASS，`Tests  15 passed (15)`。

- [ ] **Step 9: 写 `explain-request.ts` 的失败测试**（全部用假实现：`memoryStrategyDb()`、`memoryStrategyPort(fixture(...))`、假 `LlmDeps`）

```ts
// src/lib/macro/strategy/explain-request.test.ts
import {describe,expect,it,vi} from 'vitest';
import * as render from './explain-render';
import {canonicalJson,sha256Hex} from './hash';
import type {ExplanationProjection} from './contract';
import {memoryStrategyDb} from './db';
import {handleExplainRequest,LlmCallError,modelInput,promptText,recoverUserExplanations,type ExplainDeps,type LlmDeps} from './explain-request';
import {buildSnapshotFactsManifest} from './facts';
import {memoryStrategyPort} from './port';
import {runReview} from './review';
import {daily,fixture,monthly,snap} from './testing/fixture';

vi.mock('./explain-render',async orig=>{const m=await orig<typeof import('./explain-render')>();return {...m,renderFacts:vi.fn(m.renderFacts)};});

const USER='11111111-1111-4111-8111-111111111111';
const REQ='22222222-2222-4222-8222-222222222222';
const ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_UNRATE','2026-09',['4.3'])];
const SNAP=snap('US','2026-10-15T06:00:00Z',ROWS.map(o=>o.observation_id));
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',[['2025-12-11','3.75'],['2026-09-18','4']]),...daily('US_FED_TARGET_LOWER_D',[['2025-12-11','3.5'],['2026-09-18','3.75']])];
const port=()=>memoryStrategyPort(fixture({snapshots:[SNAP],observations:[...ROWS,...EVENTS]}));
const VALID=JSON.stringify({points:[{fact_ids:['obs:US_CPI_YOY','chg:US_CPI_YOY'],hypothesis:'通胀读数抬升可能通过实际利率渠道影响美元资产的相对吸引力'}],counterpoints:[{fact_ids:['evt:2026-09-18'],text:'若政策调整已被提前定价，该渠道的作用可能有限'}]});
const body=(o:Partial<{request_id:string;subject:{kind:'snapshot'|'review';id:string};locale:'zh'|'en'}>={})=>({request_id:REQ,subject:{kind:'snapshot' as const,id:SNAP.snapshot_id},locale:'zh' as const,...o});

/** Fake LlmDeps. finalizePayload returns {status, accounting, pricing}; `pricing` stands for the config read at completion
 *  (pricing version, FX), so tests can change it afterwards and check that retries use the stored payload verbatim. */
function fakeLlm(o:{byo?:boolean;resolveNull?:boolean;quota?:{allowed:boolean;used:number;limit:number}|null;content?:string;callError?:Error;beginError?:Error;finalizeError?:Error}={}){
 const calls:string[]=[];const finalized:Record<string,unknown>[]=[];const prompts:{system:string;user:string}[]=[];
 const state={pricing:'p1',finalizeError:o.finalizeError};
 const llm:LlmDeps={
  resolve:async()=>{calls.push('resolve');return o.resolveNull?null:{provider:'deepseek',model:'deepseek-chat',byo:o.byo??false};},
  checkQuota:async()=>{calls.push('checkQuota');return o.quota===undefined?{allowed:true,used:1,limit:10}:o.quota;},
  begin:async(key)=>{calls.push(`begin:${key}`);if(o.beginError)throw o.beginError;},
  call:async(system,user)=>{calls.push('call');prompts.push({system,user});if(o.callError)throw o.callError;return {content:o.content??VALID,accounting:{tokens:42}};},
  finalizePayload:(status,accounting)=>({status,accounting,pricing:state.pricing}),
  finalize:async(_key,payload)=>{calls.push(`finalize:${String(payload.status)}`);finalized.push(payload);if(state.finalizeError)throw state.finalizeError;},
 };
 return {llm,calls,finalized,prompts,state};
}
function deps(over:Partial<ExplainDeps>={}):ExplainDeps&{db:ReturnType<typeof memoryStrategyDb>}{
 return {db:memoryStrategyDb(),port:port(),llm:fakeLlm().llm,now:()=>new Date('2026-11-03T00:00:00Z'),codeVersion:'test-code',...over} as ExplainDeps&{db:ReturnType<typeof memoryStrategyDb>};
}
const projection=(r:{body:unknown})=>r.body as ExplanationProjection;
const PAY=(status:'completed'|'failed',accounting:unknown[])=>({status,accounting,pricing:'p1'});

describe('handleExplainRequest — happy path (spec §6.3 steps 1–8)',()=>{
 it('accepted: resolve → quota → claim → begin → call → finish → finalize(completed) → markFinalized',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  const p=projection(r);
  expect(p).toMatchObject({state:'accepted',subject_kind:'snapshot',subject_id:SNAP.snapshot_id,locale:'zh',failure_codes:[],provider:'deepseek',model:'deepseek-chat',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1'});
  expect(p.rendered?.facts.map(x=>x.fact_id)).toEqual(['obs:US_CPI_YOY','chg:US_CPI_YOY','evt:2026-09-18']);
  expect(p.rendered?.facts[0].text).toContain('2.9%');
  expect(p.rendered?.hypotheses[0].text).toContain('实际利率');
  expect(f.calls).toEqual(['resolve','checkQuota',`begin:${p.explanation_id}`,'call','finalize:completed']);
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(mark).toHaveBeenCalledWith(p.explanation_id);
  expect(d.db._run(p.explanation_id)).toMatchObject({state:'accepted',raw_output:{content:VALID},finalize_payload:PAY('completed',[{tokens:42}]),finalized:true});
  expect(f.prompts[0].system).toBe(promptText('zh'));
  expect(f.prompts[0].user).toContain('"fact_id":"obs:US_CPI_YOY"');
  expect(f.prompts[0].user).toContain('2.9%');
  expect(p.manifest_id).toMatch(/\S/);
  expect((await d.db.manifest(p.manifest_id))?.body.kind).toBe('explain_facts');
 });
 it('review subject: the immutable result id; facts come from that result and are frozen in the fact manifest',async()=>{
  const d=deps();
  const rr=await runReview({port:d.port!,db:d.db,codeVersion:'c'},'US','2026-10',{preview:false});
  const f=fakeLlm({content:JSON.stringify({points:[{fact_ids:['cov:counts'],hypothesis:'覆盖不全可能削弱该月读数的代表性'}]})});
  const r=await handleExplainRequest({...d,llm:f.llm},USER,body({subject:{kind:'review',id:rr.result_id!}}));
  expect(r.status).toBe(200);
  expect(projection(r)).toMatchObject({state:'accepted',subject_kind:'review',subject_id:rr.result_id});
  const result=(await d.db.reviewResult(rr.result_id!))!;
  const m=(await d.db.manifest(projection(r).manifest_id))!.body;
  expect(m).toMatchObject({kind:'explain_facts',params:{subject_kind:'review',result_id:result.result_id,review_manifest_id:result.manifest_id}});
  expect(m.facts?.map(x=>x.fact_id)).toContain('cov:counts');
 });
 it('a review explanation stays bound to its result after the pointer advances',async()=>{
  const d=deps();
  const first=await runReview({port:d.port!,db:d.db,codeVersion:'c'},'US','2026-10',{preview:false});
  const content=JSON.stringify({points:[{fact_ids:['cov:counts'],hypothesis:'覆盖不全可能削弱该月读数的代表性'}]});
  const r1=await handleExplainRequest({...d,llm:fakeLlm({content}).llm},USER,body({subject:{kind:'review',id:first.result_id!}}));
  const second=await runReview({port:d.port!,db:d.db,codeVersion:'c2'},'US','2026-10',{preview:false});   // new code version → new result, pointer moves
  expect(second).toMatchObject({outcome:'advanced',generation:2});expect(second.result_id).not.toBe(first.result_id);
  d.db._userId(USER);
  expect((await d.db.explanationsOf('session','review',second.result_id!,20))).toEqual([]);
  expect((await d.db.explanationsOf('session','review',first.result_id!,20)).map(p=>p.explanation_id)).toEqual([projection(r1).explanation_id]);
  const r2=await handleExplainRequest({...d,llm:fakeLlm({content}).llm},USER,body({request_id:'33333333-3333-4333-8333-333333333333',subject:{kind:'review',id:first.result_id!}}));
  expect(projection(r2)).toMatchObject({state:'accepted',subject_id:first.result_id});   // the older result can still be explained
 });
 it('the model input is rebuilt offline from the stored fact manifest alone',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  const p=projection(await handleExplainRequest(d,USER,body()));
  const stored=(await d.db.manifest(p.manifest_id))!;
  const offline=JSON.parse(JSON.stringify(stored.body));                       // no port, no db, no live catalog
  expect(modelInput(offline,'zh')).toEqual(f.prompts[0]);
 });
});

describe('ordering and idempotency (spec §6.3 step 2, §9.1)',()=>{
 it('replay runs before the foundation and subject checks: same request with port=null returns the stored projection',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  const first=projection(await handleExplainRequest(d,USER,body()));
  const again=await handleExplainRequest({...d,port:null},USER,body());
  expect(again.status).toBe(200);
  expect(projection(again)).toEqual(first);
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('replay needs no code version: a stored request answers even when the code version is unavailable',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  const first=projection(await handleExplainRequest(d,USER,body()));
  const again=await handleExplainRequest({...d,codeVersion:null},USER,body());
  expect(again).toEqual({status:200,body:first});
  expect(await handleExplainRequest({...d,codeVersion:null},USER,body({request_id:'44444444-4444-4444-8444-444444444444'}))).toEqual({status:503,body:{error:{code:'code_version_unavailable',message:'code_version_unavailable'}}});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('same request id with another payload → 409 payload_conflict, no model call',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  await handleExplainRequest(d,USER,body());
  const r=await handleExplainRequest(d,USER,body({locale:'en'}));
  expect(r).toEqual({status:409,body:{error:{code:'payload_conflict',message:'payload_conflict'}}});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('a concurrent claim loser stops at the claim: no begin, no call',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'runOf').mockResolvedValue(null);   // both requests passed step 2 before either claimed
  const payloadHash=sha256Hex(canonicalJson({subject:body().subject,locale:'zh'}));
  const facts=await d.db.putManifest((await buildSnapshotFactsManifest(d.port!,SNAP.snapshot_id,'test-code'))!);
  const winner=await d.db.claimExplanation({userId:USER,requestId:REQ,payloadHash,subjectKind:'snapshot',subjectId:SNAP.snapshot_id,locale:'zh',manifestId:facts.manifest_id});
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  expect(projection(r)).toMatchObject({explanation_id:winner.explanation_id,state:'running'});
  expect(f.calls).toEqual(['resolve','checkQuota']);
 });
});

describe('quota and model configuration (spec §6.3 step 4, N8)',()=>{
 it('non-BYO over quota → 429 quota_exceeded, nothing claimed',async()=>{
  const f=fakeLlm({quota:{allowed:false,used:10,limit:10}});const d=deps({llm:f.llm});
  const r=await handleExplainRequest(d,USER,body());
  expect(r).toEqual({status:429,body:{error:{code:'quota_exceeded',message:'10/10'}}});
  expect(await d.db.runOf(USER,REQ)).toBeNull();
  expect(f.calls).toEqual(['resolve','checkQuota']);
 });
 it('limit -1 is unlimited; a failed quota read (null) fails open',async()=>{
  expect((await handleExplainRequest(deps({llm:fakeLlm({quota:{allowed:false,used:99,limit:-1}}).llm}),USER,body())).status).toBe(200);
  expect((await handleExplainRequest(deps({llm:fakeLlm({quota:null}).llm}),USER,body())).status).toBe(200);
 });
 it('BYO skips the feature quota',async()=>{
  const f=fakeLlm({byo:true,quota:{allowed:false,used:10,limit:10}});
  const r=await handleExplainRequest(deps({llm:f.llm}),USER,body());
  expect(projection(r).state).toBe('accepted');
  expect(f.calls).not.toContain('checkQuota');
 });
 it('no model configured → 503 llm_not_configured',async()=>{
  expect((await handleExplainRequest(deps({llm:fakeLlm({resolveNull:true}).llm}),USER,body())).body).toEqual({error:{code:'llm_not_configured',message:'llm_not_configured'}});
 });
});

describe('outcomes after the claim (spec §6.3 steps 6–8)',()=>{
 it('model text with a numeral → rejected, still finalized as a completed call',async()=>{
  const f=fakeLlm({content:JSON.stringify({points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'三成的影响'}]})});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(projection(r)).toMatchObject({state:'rejected',failure_codes:['numeral'],rendered:null});
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(mark).toHaveBeenCalledTimes(1);
 });
 it('unparseable model output → rejected(parse), completed call',async()=>{
  const f=fakeLlm({content:'not json'});
  expect(projection(await handleExplainRequest(deps({llm:f.llm}),USER,body()))).toMatchObject({state:'rejected',failure_codes:['parse']});
  expect(f.finalized[0].status).toBe('completed');
 });
 it('provider error → failed(provider_error) and finalize(failed) with the error accounting, then markFinalized',async()=>{
  const f=fakeLlm({callError:new LlmCallError('timeout',{tokens:7})});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  expect(projection(r)).toMatchObject({state:'failed',failure_codes:['provider_error']});
  expect(f.finalized).toEqual([PAY('failed',[{tokens:7}])]);
  expect(mark).toHaveBeenCalledTimes(1);
  expect(d.db._run(projection(r).explanation_id)).toMatchObject({raw_output:null,finalize_payload:PAY('failed',[{tokens:7}]),finalized:true});
 });
 it('a cost error from the call keeps its code',async()=>{
  const f=fakeLlm({callError:new Error('daily_cost_exhausted')});
  expect(projection(await handleExplainRequest(deps({llm:f.llm}),USER,body())).failure_codes).toEqual(['daily_cost_exhausted']);
  expect(f.finalized).toEqual([PAY('failed',[])]);
 });
 it('begin failure is ambiguous: failed payload recorded under the same audit key, finalize(failed) attempted, then markFinalized',async()=>{
  const f=fakeLlm({beginError:new Error('boom')});const d=deps({llm:f.llm});
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(503);
  expect(r.body).toMatchObject({error:{code:'usage_audit_unavailable'},explanation:{state:'failed',failure_codes:['usage_audit_unavailable']}});
  const id=(r.body as {explanation:ExplanationProjection}).explanation.explanation_id;
  expect(f.calls).toEqual(['resolve','checkQuota',`begin:${id}`,'finalize:failed']);
  expect(d.db._run(id)).toMatchObject({state:'failed',finalize_payload:PAY('failed',[]),finalized:true});
 });
 it('begin failure + finalize failure (the usage run never committed): not finalized, payload kept for reconciliation',async()=>{
  const f=fakeLlm({beginError:new Error('boom'),finalizeError:new Error('usage run not found')});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  const id=(r.body as {explanation:ExplanationProjection}).explanation.explanation_id;
  expect(r.status).toBe(503);expect(mark).not.toHaveBeenCalled();
  expect(d.db._run(id)).toMatchObject({finalize_payload:PAY('failed',[]),finalized:false});
 });
 it('finalize failure leaves the response intact; the stored payload is retried verbatim later, even after a config change',async()=>{
  const f=fakeLlm({finalizeError:new Error('usage_audit_unavailable')});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  expect(projection(r).state).toBe('accepted');
  expect(mark).not.toHaveBeenCalled();
  const id=projection(r).explanation_id;
  expect(d.db._run(id)).toMatchObject({finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
  // ops retry (runbook §4): pricing config changed meanwhile; the stored payload is replayed as is
  f.state.pricing='p2';f.state.finalizeError=undefined;
  await f.llm.finalize(`${id}`,d.db._run(id)!.finalize_payload!);await d.db.markFinalized(id);
  expect(f.finalized.at(-1)).toEqual(PAY('completed',[{tokens:42}]));
  expect(d.db._run(id)?.finalized).toBe(true);
 });
});

describe('injected failures after the provider returned (spec §4.4 macro_record_completion)',()=>{
 it('finish fails: raw output + payload were recorded first, finalize still runs, markFinalized follows, the error surfaces',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});const order:string[]=[];
  const rec=d.db.recordCompletion.bind(d.db);vi.spyOn(d.db,'recordCompletion').mockImplementation(async a=>{order.push('record');return rec(a);});
  vi.spyOn(d.db,'finishExplanation').mockImplementation(async()=>{order.push('finish');throw new Error('connection reset');});
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  expect(order).toEqual(['record','finish']);
  expect(f.calls.at(-1)).toBe('finalize:completed');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',raw_output:{content:VALID},finalize_payload:PAY('completed',[{tokens:42}]),finalized:true});
 });
 it('finish and finalize both fail: the run keeps raw output and payload with finalized=false for the ops retry',async()=>{
  const f=fakeLlm({finalizeError:new Error('down')});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValue(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',raw_output:{content:VALID},finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
 });
 it('a throw inside validate / finish: finalize still runs with the recorded payload',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockImplementationOnce(()=>{throw new TypeError('render bug');});
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('render bug');
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
 });
 it('recordCompletion failure does not stop finish or finalize; finish stores the same payload, so the run is marked finalized',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'recordCompletion').mockRejectedValue(new Error('db down'));
  const r=await handleExplainRequest(d,USER,body());
  expect(projection(r).state).toBe('accepted');
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(d.db._run(projection(r).explanation_id)).toMatchObject({finalize_payload:PAY('completed',[{tokens:42}]),finalized:true});
 });
});

describe('completion recovery without the provider (plan audit R2-1 / R2-2)',()=>{
 it('finish failure → replay POST → accepted from the recorded output, exactly one provider call, no second finalize',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',raw_output:{content:VALID,validator_version:'macro-explain-validator/1',prompt_version:'macro-explain-prompt/1',provider:'deepseek',model:'deepseek-chat',accounting:{tokens:42}}});
  const again=await handleExplainRequest({...d,port:null,codeVersion:null},USER,body());   // a replay needs neither
  expect(again.status).toBe(200);
  expect(projection(again)).toMatchObject({explanation_id:run.explanation_id,state:'accepted',provider:'deepseek',model:'deepseek-chat',validator_version:'macro-explain-validator/1'});
  expect(projection(again).rendered?.facts.map(x=>x.fact_id)).toEqual(['obs:US_CPI_YOY','chg:US_CPI_YOY','evt:2026-09-18']);
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
  expect(f.calls.filter(c=>c.startsWith('finalize'))).toEqual(['finalize:completed']);   // settled during the first request already
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'accepted',finalized:true});
 });
 it('a recorded output that fails validation is recovered as rejected, still one provider call',async()=>{
  const f=fakeLlm({content:JSON.stringify({points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'三成的影响'}]})});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  expect(projection(await handleExplainRequest(d,USER,body()))).toMatchObject({state:'rejected',failure_codes:['numeral'],rendered:null});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('validator version changed since the call → failed {validator_version_changed}, the model text is not re-judged',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const detail=d.db.runDetail.bind(d.db);
  vi.spyOn(d.db,'runDetail').mockImplementation(async id=>{const r=await detail(id);return r&&{...r,raw_output:{...(r.raw_output as Record<string,unknown>),validator_version:'macro-explain-validator/0'}};});
  // the stored row keeps its original envelope (a recorded completion is evidence: the db rejects a different raw output), so the
  // recovery finish is captured instead of applied
  const finish=vi.spyOn(d.db,'finishExplanation').mockImplementation(async a=>({explanation_id:a.explanationId} as ExplanationProjection));
  finish.mockClear();
  await handleExplainRequest(d,USER,body());
  expect(finish).toHaveBeenCalledTimes(1);
  expect(finish.mock.calls[0][0]).toMatchObject({state:'failed',failureCodes:['validator_version_changed'],rendered:null,validatorVersion:'macro-explain-validator/0'});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('recordCompletion, then finalize fail: finish stored the payload; the replay settles it verbatim after a pricing change and marks finalized',async()=>{
  const f=fakeLlm({finalizeError:new Error('usage_audit_unavailable')});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'recordCompletion').mockRejectedValue(new Error('db down'));
  const first=projection(await handleExplainRequest(d,USER,body()));
  expect(first.state).toBe('accepted');
  expect(d.db._run(first.explanation_id)).toMatchObject({finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
  f.state.pricing='p2';f.state.finalizeError=undefined;   // config moved on; the stored payload must not be recomputed
  expect(projection(await handleExplainRequest(d,USER,body()))).toEqual(first);
  expect(f.finalized.at(-1)).toEqual(PAY('completed',[{tokens:42}]));
  expect(d.db._run(first.explanation_id)?.finalized).toBe(true);
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('recoverUserExplanations (GET) finishes the user\'s recorded completions, bounded by the limit, and is a no-op otherwise',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('reset')).mockRejectedValueOnce(new Error('reset'));
  const second='33333333-3333-4333-8333-333333333333';
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('reset');
  await expect(handleExplainRequest(d,USER,body({request_id:second}))).rejects.toThrow('reset');
  expect(await recoverUserExplanations(d,USER,1)).toBe(1);
  expect(await recoverUserExplanations(d,USER)).toBe(1);
  expect(await recoverUserExplanations(d,USER)).toBe(0);
  for(const req of [REQ,second])expect((await d.db.runOf(USER,req))!.state).toBe('accepted');
  expect(f.calls.filter(c=>c==='call')).toHaveLength(2);
 });
});

describe('preparation failure and settlement independence (Task 11 Codex #4 / #5)',()=>{
 it('a model-input preparation failure surfaces before any claim or usage run: no begin, no call, no run row',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.mocked(render.renderFacts).mockImplementationOnce(()=>{throw new TypeError('render bug');});
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('render bug');
  expect(f.calls.some(c=>c.startsWith('begin')||c==='call'||c.startsWith('finalize'))).toBe(false);
  expect(await d.db.runOf(USER,REQ)).toBeNull();
 });
 async function stuck(){   // finish and finalize both failed once: recorded completion + unsettled payload, state running
  const f=fakeLlm({finalizeError:new Error('down')});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
  f.state.finalizeError=undefined;f.finalized.length=0;
  return {f,d,id:run.explanation_id};
 }
 it('recovery finish keeps failing: the recorded payload is still settled verbatim and marked finalized',async()=>{
  const {f,d,id}=await stuck();
  vi.spyOn(d.db,'finishExplanation').mockRejectedValue(new Error('still down'));
  await recoverUserExplanations(d,USER);
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(d.db._run(id)).toMatchObject({state:'running',finalized:true});
 });
 it('the post-finish reread fails: the payload loaded first is still settled',async()=>{
  const {f,d,id}=await stuck();
  const detail=d.db.runDetail.bind(d.db);let n=0;
  vi.spyOn(d.db,'runDetail').mockImplementation(async x=>{if(++n===2)throw new Error('read down');return detail(x);});
  await recoverUserExplanations(d,USER);
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(d.db._run(id)).toMatchObject({state:'accepted',finalized:true});
 });
});

describe('input and subject checks',()=>{
 it.each([
  ['not an object','x'],['bad uuid',{...body(),request_id:'nope'}],['bad locale',{...body(),locale:'fr'}],
  ['bad kind',{...body(),subject:{kind:'judgment',id:'x'}}],['extra key',{...body(),model:'x'}],
 ])('400 invalid_body: %s',async(_,raw)=>{
  expect((await handleExplainRequest(deps(),USER,raw)).status).toBe(400);
 });
 it('fresh request with no foundation → 503 macro_foundation_unavailable',async()=>{
  expect((await handleExplainRequest(deps({port:null}),USER,body())).body).toEqual({error:{code:'macro_foundation_unavailable',message:'macro_foundation_unavailable'}});
 });
 it.each([
  ['unknown snapshot',{kind:'snapshot' as const,id:'snap:US:nope'}],
  ['malformed review id',{kind:'review' as const,id:'US-2026-10'}],
  ['a pointer key is not a result id',{kind:'review' as const,id:'US:2026-10'}],
  ['unknown review result',{kind:'review' as const,id:'55555555-5555-4555-8555-555555555555'}],
 ])('404 subject_not_found: %s',async(_,subject)=>{
  const f=fakeLlm();
  expect((await handleExplainRequest(deps({llm:f.llm}),USER,body({subject}))).status).toBe(404);
  expect(f.calls).toEqual([]);
 });
 it('a failed snapshot is not a valid subject',async()=>{
  const failed=snap('US','2026-10-16T06:00:00Z',[],{status:'failed'});
  const p=memoryStrategyPort(fixture({snapshots:[SNAP,failed],observations:ROWS}));
  expect((await handleExplainRequest(deps({port:p}),USER,body({subject:{kind:'snapshot',id:failed.snapshot_id}}))).status).toBe(404);
 });
});

describe('prompts',()=>{
 it('both locales load and carry the prompt version marker',()=>{
  for(const l of ['zh','en'] as const)expect(promptText(l)).toContain('macro-explain-prompt/1');
 });
});
```

- [ ] **Step 10: 运行，确认失败**

Run: `npm test -- src/lib/macro/strategy/explain-request.test.ts`
Expected: FAIL，`Failed to resolve import "./explain-request"`。

- [ ] **Step 11: 实现 `explain-request.ts`**

```ts
// src/lib/macro/strategy/explain-request.ts
// POST /api/macro/strategy/explanations orchestration (spec 2026-11-07 §6.3 steps 1–8, §9.1 order). The route does the
// session (401) and MACRO_STRATEGY_ENABLED (404) checks and passes the user id; everything after is here, with injected
// deps so tests run offline: body ajv → payload_hash → idempotent replay (BEFORE the code version, foundation and subject
// checks) → code version (null → 503) → foundation (port null → 503) → subject + fact manifest (the exact fact list is
// frozen in body.facts) → resolve → (non-BYO) quota → claim (only 'claimed' may bill or call) → begin → call →
// recordCompletion (raw output + the exact finalize payload, durable before validation) → validate → finish → finalize →
// markFinalized. finalize runs in a finally path even when validation or finish throws; markFinalized only after finalize
// succeeded. A begin failure is ambiguous (the usage run may exist): it records a failed payload under the same audit key
// and tries finalize(failed) too. Validation rejection is a completed call (billed as completed). A finalize failure
// never changes the user response; the run row keeps finalize_payload with finalized=false for the ops retry.
// Review subjects are immutable result ids (never the moving pointer). Completion recovery (plan audit R2-1 / R2-2): the
// recorded raw output is a completion envelope {content, provider, model, prompt_version, validator_version, accounting};
// recoverExplanation rebuilds validation / rendering from it and the manifest's frozen facts and finishes the run without
// ever calling the provider (validator version changed → failed {validator_version_changed}), then settles a recorded,
// unsettled finalize payload verbatim. finish also carries the payload so a failed recordCompletion still leaves it stored.
import {readFileSync} from 'node:fs';
import Ajv from 'ajv';
import {canonicalJson,sha256Hex} from './hash';
import type {ExplanationProjection,StrategyManifest} from './contract';
import {VERSIONS} from './contract';
import {StrategyDbError,hasRecordedCompletion,type RunDetail,type StrategyDb} from './db';
import {renderExplanation,renderFacts} from './explain-render';
import {parseModelContent,validateExplanation,VALIDATOR_VERSION} from './explain-validate';
import {buildSnapshotFactsManifest,explanationFacts,reviewFactsManifest} from './facts';
import type {StrategyReadPort} from './port';

export interface LlmDeps{
 resolve():Promise<{provider:string;model:string;byo:boolean}|null>;
 checkQuota():Promise<{allowed:boolean;used:number;limit:number}|null>;
 begin(usageAuditKey:string,meta:Record<string,unknown>):Promise<void>;
 call(system:string,user:string):Promise<{content:string;accounting:unknown}>;
 /** The exact finalizeUsageRun payload (status, provider, model, tokens, cost, pricingVersion, usdCnyMicros, usageEstimated,
  *  byo), computed once at completion and stored on the run row; retries replay it verbatim. */
 finalizePayload(status:'completed'|'failed',accounting:unknown[]):Record<string,unknown>;
 /** finalizeUsageRun(userId, usageAuditKey, 'perspectives', payload) with the payload verbatim. */
 finalize(usageAuditKey:string,payload:Record<string,unknown>):Promise<void>;
}
/** Thrown by LlmDeps.call when the provider call failed; accounting = meteredUsageFromError(e) (null when none). */
export class LlmCallError extends Error{constructor(message:string,readonly accounting:unknown|null=null){super(message);this.name='LlmCallError';}}
/** codeVersion null = not configured: 503 code_version_unavailable, checked only after the idempotent replay. */
export interface ExplainDeps{db:StrategyDb;port:StrategyReadPort|null;llm:LlmDeps;now:()=>Date;codeVersion:string|null}
export interface ExplainBody{request_id:string;subject:{kind:'snapshot'|'review';id:string};locale:'zh'|'en'}
export type ExplainResponse={status:number;body:ExplanationProjection|{error:{code:string;message:string};explanation?:ExplanationProjection}};

export const PROMPT_VERSION=VERSIONS.prompt;
/** Placeholder manifest id for replay claims: the run row already exists, so the claim RPC never inserts it. */
export const REPLAY_MANIFEST_ID='00000000-0000-0000-0000-000000000000';
const UUID='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const validateBody=new Ajv({strict:true}).compile({type:'object',additionalProperties:false,required:['request_id','subject','locale'],properties:{
 request_id:{type:'string',pattern:UUID},locale:{type:'string',enum:['zh','en']},
 subject:{type:'object',additionalProperties:false,required:['kind','id'],properties:{kind:{type:'string',enum:['snapshot','review']},id:{type:'string',minLength:1,maxLength:200}}}}});
const COST_ERROR_CODES=new Set(['daily_cost_exhausted','pricing_unavailable','budget_unavailable','budget_invariant_violation','usage_audit_unavailable','usage_audit_invariant']);
export function costErrorCode(e:unknown):string|null{const c=e instanceof Error?e.message:String(e);return COST_ERROR_CODES.has(c)?c:null;}
export function costErrorStatus(code:string):number{return code==='daily_cost_exhausted'?429:code==='budget_unavailable'||code==='usage_audit_unavailable'?503:500;}
const err=(status:number,code:string,explanation?:ExplanationProjection):ExplainResponse=>({status,body:{error:{code,message:code},...(explanation?{explanation}:{})}});
/** Recorded completions finished per GET /explanations (bounded work on a read). */
export const RECOVER_PER_READ=3;
type FinishArgs=Parameters<StrategyDb['finishExplanation']>[0];
type RecoveryDeps=Pick<ExplainDeps,'db'|'llm'>;
interface Completion{content:string;provider:string|null;model:string|null;prompt_version:string;validator_version:string;accounting:unknown}
function completionOf(raw:unknown):Completion|null{
 if(!hasRecordedCompletion(raw))return null;
 const c=raw as Record<string,unknown>;
 if(typeof c.content!=='string'||typeof c.prompt_version!=='string'||typeof c.validator_version!=='string')return null;
 return {content:c.content,provider:typeof c.provider==='string'?c.provider:null,model:typeof c.model==='string'?c.model:null,prompt_version:c.prompt_version,validator_version:c.validator_version,accounting:c.accounting??null};
}
/** finalize with a recorded payload verbatim; markFinalized only after it succeeded. Never throws. */
async function settleStored(d:RecoveryDeps,id:string,key:string,payload:Record<string,unknown>):Promise<void>{
 try{await d.llm.finalize(key,payload);}catch{return;}   // finalized stays false: a replay, a GET or the reconcile script retries
 try{await d.db.markFinalized(id);}catch{/* finalize succeeded; the flag is set by the next recovery (finalize is idempotent per audit key) */}
}
/** finish arguments rebuilt from the recorded completion and the frozen fact manifest alone (no provider call). */
async function recoveredFinish(db:StrategyDb,run:RunDetail):Promise<FinishArgs>{
 const c=completionOf(run.raw_output);
 const base={explanationId:run.explanation_id,provider:c?.provider??null,model:c?.model??null,promptVersion:c?.prompt_version??PROMPT_VERSION,rawOutput:run.raw_output,accounting:c?.accounting??null,finalizePayload:run.finalize_payload};
 if(!c||c.validator_version!==VALIDATOR_VERSION){   // an envelope without versions cannot be checked by this validator either
  return {...base,state:'failed',validatorVersion:c?.validator_version??'',validation:{stage:'recovery',code:'validator_version_changed'},rendered:null,failureCodes:['validator_version_changed']};
 }
 const m=await db.manifest(run.manifest_id);
 if(!m)throw new Error(`manifest_missing:${run.manifest_id}`);   // unreachable (foreign key); the row stays running
 const facts=explanationFacts(m.body);
 const result=validateExplanation(parseModelContent(c.content),new Set(facts.map(f=>f.fact_id)));
 const validation={validator_version:VALIDATOR_VERSION,ok:result.ok,failures:result.failures,recovered:true};
 return result.ok
  ?{...base,state:'accepted',validatorVersion:VALIDATOR_VERSION,validation,rendered:renderExplanation(facts,result.output,run.locale,m.body.catalog),failureCodes:[]}
  :{...base,state:'rejected',validatorVersion:VALIDATOR_VERSION,validation,rendered:null,failureCodes:result.codes};
}
/** Completion recovery (plan audit R2-1 / R2-2). Never calls the provider and never throws: a failure leaves the row as it
 *  was for the next replay or GET. Settlement is independent of finish: the payload of the first read is immutable, so a
 *  finish or reread failure still settles it (finally path; Task 11 Codex #5). */
export async function recoverExplanation(d:RecoveryDeps,explanationId:string):Promise<void>{
 let run:RunDetail|null;
 try{run=await d.db.runDetail(explanationId);}catch{return;}
 if(!run)return;
 const {explanation_id:id,usage_audit_key:key}=run;
 let payload=run.finalize_payload;let finalized=run.finalized;
 try{
  if(run.state==='running'&&hasRecordedCompletion(run.raw_output)){
   try{await d.db.finishExplanation(await recoveredFinish(d.db,run));}catch{return;}
   try{const again=await d.db.runDetail(explanationId);if(again){payload=again.finalize_payload??payload;finalized=again.finalized;}}catch{/* settle from the first read */}
  }
 }finally{
  if(payload!==null&&!finalized)await settleStored(d,id,key,payload);
 }
}
/** GET /explanations: recover the user's running rows with a recorded completion, oldest first, at most `limit`. */
export async function recoverUserExplanations(d:RecoveryDeps,userId:string,limit=RECOVER_PER_READ):Promise<number>{
 let ids:string[];
 try{ids=await d.db.recoverableRuns(userId,limit);}catch{return 0;}
 for(const id of ids)await recoverExplanation(d,id);
 return ids.length;
}

const PROMPT_URLS={zh:new URL('./prompts/macro-explain-v1.zh.md',import.meta.url),en:new URL('./prompts/macro-explain-v1.en.md',import.meta.url)};
const promptCache=new Map<'zh'|'en',string>();
export function promptText(locale:'zh'|'en'):string{
 let t=promptCache.get(locale);if(t===undefined){t=readFileSync(PROMPT_URLS[locale],'utf8');promptCache.set(locale,t);}
 return t;
}
export function userMessage(locale:'zh'|'en',facts:{fact_id:string;text:string}[]):string{
 return `${locale==='zh'?'事实清单（JSON）：':'Fact list (JSON):'}\n${JSON.stringify(facts)}`;
}
/** The model input of an explanation, rebuilt from its 'explain_facts' manifest alone (frozen facts + frozen catalog names). */
export function modelInput(m:StrategyManifest,locale:'zh'|'en'):{system:string;user:string}{
 return {system:promptText(locale),user:userMessage(locale,renderFacts(explanationFacts(m),locale,m.catalog))};
}
/** Fact manifest of the subject, stored before the claim. Review subjects are result ids (StrategyDb.reviewResult). */
async function subjectManifest(d:ExplainDeps,port:StrategyReadPort,codeVersion:string,body:ExplainBody):Promise<StrategyManifest|null>{
 if(body.subject.kind==='snapshot')return buildSnapshotFactsManifest(port,body.subject.id,codeVersion);
 const result=await d.db.reviewResult(body.subject.id);if(!result)return null;
 const review=await d.db.manifest(result.manifest_id);if(!review)return null;
 return reviewFactsManifest(review,result,codeVersion);
}
export async function handleExplainRequest(d:ExplainDeps,userId:string,raw:unknown):Promise<ExplainResponse>{
 // step 1 (after session + flag in the route): body + payload hash
 if(!validateBody(raw))return err(400,'invalid_body');
 const body=raw as ExplainBody;
 const payloadHash=sha256Hex(canonicalJson({subject:body.subject,locale:body.locale}));
 const claimArgs={userId,requestId:body.request_id,payloadHash,subjectKind:body.subject.kind,subjectId:body.subject.id,locale:body.locale};
 // step 2: idempotent replay before any foundation or subject check
 const prior=await d.db.runOf(userId,body.request_id);
 if(prior){
  if(prior.payload_hash!==payloadHash)return err(409,'payload_conflict');
  await recoverExplanation(d,prior.explanation_id);   // a recorded completion is finished / settled here, never sent to the provider again
  try{return {status:200,body:(await d.db.claimExplanation({...claimArgs,manifestId:REPLAY_MANIFEST_ID})).projection};}
  catch(e){if(e instanceof StrategyDbError&&e.code==='payload_conflict')return err(409,'payload_conflict');throw e;}
 }
 // step 3: code version, foundation and subject (a replay above needs none of them)
 if(!d.codeVersion)return err(503,'code_version_unavailable');
 if(!d.port)return err(503,'macro_foundation_unavailable');
 const built=await subjectManifest(d,d.port,d.codeVersion,body);
 if(!built)return err(404,'subject_not_found');
 if(explanationFacts(built).length===0)return err(422,'no_facts');
 const stored=await d.db.putManifest(built);
 const facts=explanationFacts(stored.body),catalog=stored.body.catalog;
 // step 4: model and quota (perspectives route order: resolve first, BYO skips the feature quota)
 const llm=await d.llm.resolve();
 if(!llm)return err(503,'llm_not_configured');
 if(!llm.byo){
  const quota=await d.llm.checkQuota();
  if(quota&&quota.limit!==-1&&!quota.allowed)return {status:429,body:{error:{code:'quota_exceeded',message:`${quota.used}/${quota.limit}`}}};
 }
 // model input is built BEFORE the claim, so a preparation failure (prompt file, fact rendering) never opens a usage run
 const input=modelInput(stored.body,body.locale);
 // step 5: claim — only 'claimed' continues to billing and the model
 let claim:Awaited<ReturnType<StrategyDb['claimExplanation']>>;
 try{claim=await d.db.claimExplanation({...claimArgs,manifestId:stored.manifest_id});}
 catch(e){if(e instanceof StrategyDbError&&e.code==='payload_conflict')return err(409,'payload_conflict');throw e;}
 if(claim.outcome==='existing')return {status:200,body:claim.projection};
 const base={explanationId:claim.explanation_id,provider:llm.provider,model:llm.model,promptVersion:PROMPT_VERSION,validatorVersion:VALIDATOR_VERSION};
 const started=d.now().getTime();
 const id=claim.explanation_id,key=claim.usage_audit_key;
 /** Durable completion (spec §4.4 macro_record_completion). A failure here does not stop finish / finalize; without a
  *  recorded payload finish stores the same one (p_finalize_payload), so markFinalized still works afterwards (R2-2). */
 const record=async(rawOutput:unknown,finalizePayload:Record<string,unknown>)=>{try{await d.db.recordCompletion({explanationId:id,rawOutput,finalizePayload});}catch{/* see above */}};
 const settle=(finalizePayload:Record<string,unknown>)=>settleStored(d,id,key,finalizePayload);
 // step 6: usage run. A begin error is ambiguous (the run may have committed): record and settle a failed payload under the same key.
 try{await d.llm.begin(key,{provider:llm.provider,model:llm.model,byo:llm.byo,subject_kind:body.subject.kind,subject_id:body.subject.id,locale:body.locale});}
 catch(e){
  const code=costErrorCode(e)??'usage_audit_unavailable';
  const payload=d.llm.finalizePayload('failed',[]);
  await record(null,payload);
  let projection:ExplanationProjection;
  try{projection=await d.db.finishExplanation({...base,state:'failed',rawOutput:null,validation:{stage:'begin',code},rendered:null,failureCodes:[code],accounting:null,finalizePayload:payload});}
  finally{await settle(payload);}
  return err(costErrorStatus(code),code,projection);
 }
 // step 7: metered model call, then the durable completion before anything else can fail
 let content:string;let accounting:unknown;
 try{({content,accounting}=await d.llm.call(input.system,input.user));}
 catch(e){
  const code=costErrorCode(e)??'provider_error';const acc=e instanceof LlmCallError?e.accounting:null;
  const payload=d.llm.finalizePayload('failed',acc===null?[]:[acc]);
  await record(null,payload);
  let projection:ExplanationProjection;
  try{projection=await d.db.finishExplanation({...base,state:'failed',rawOutput:null,validation:{stage:'call',code,message:e instanceof Error?e.message:String(e)},rendered:null,failureCodes:[code],accounting:acc,finalizePayload:payload});}
  finally{await settle(payload);}
  return {status:200,body:projection};
 }
 const payload=d.llm.finalizePayload('completed',[accounting]);
 /** Completion envelope: everything finish needs, so recovery never calls the provider again (R2-1). */
 const rawOutput={content,provider:llm.provider,model:llm.model,prompt_version:PROMPT_VERSION,validator_version:VALIDATOR_VERSION,accounting:accounting??null};
 await record(rawOutput,payload);
 // step 8: validate → accepted | rejected (both are completed calls); finalize runs even if this throws
 let projection:ExplanationProjection;
 try{
  const result=validateExplanation(parseModelContent(content),new Set(facts.map(f=>f.fact_id)));
  const validation={validator_version:VALIDATOR_VERSION,ok:result.ok,failures:result.failures,elapsed_ms:d.now().getTime()-started};
  projection=await d.db.finishExplanation(result.ok
   ?{...base,state:'accepted',rawOutput,validation,rendered:renderExplanation(facts,result.output,body.locale,catalog),failureCodes:[],accounting,finalizePayload:payload}
   :{...base,state:'rejected',rawOutput,validation,rendered:null,failureCodes:result.codes,accounting,finalizePayload:payload});
 }finally{await settle(payload);}
 return {status:200,body:projection};
}
```

- [ ] **Step 12: 运行，确认通过**

Run: `npm test -- src/lib/macro/strategy/explain-request.test.ts src/lib/macro/strategy/deviations.test.ts src/lib/macro/strategy/f4-client.test.ts`
Expected: PASS，`Tests  74 passed (74)`（explain-request 43、deviations 15、f4-client 16）。

再跑整个模块，确认 Task 9–11 与前序任务一起通过：

Run: `npm test -- src/lib/macro/strategy`
Expected: PASS，无失败用例。

- [ ] **Step 13: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 均无错误、无警告。

- [ ] **Step 14: 提交**

```bash
git add src/lib/macro/strategy/f4-client.ts src/lib/macro/strategy/f4-client.test.ts src/lib/macro/strategy/deviations.ts src/lib/macro/strategy/deviations.test.ts src/lib/macro/strategy/explain-request.ts src/lib/macro/strategy/explain-request.test.ts
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): F4 read client, deviation cases, explanation request flow (spec 2026-11-07 §6.3, §6.4, §9.1)

f4-client.ts reads F4's public routes on this site with a 3 s timeout and
maps every failure to F4Unavailable. deviations.ts pages card history to an
empty page (cap 5000 → incomplete) and classifies registered vs settled inputs
exhaustively. explain-request.ts orchestrates the POST with injected deps:
replay before code version, foundation and subject checks, 409 on payload
conflict, quota for non-BYO only, claim before billing, durable completion
(a completion envelope + exact finalize payload) before validation, finish
carrying the payload too, completion recovery from the recorded output on
replay (never a second provider call), finalize in a finally path even when
finish fails, ambiguous begin failures settled as failed under
the same audit key, rejected outputs billed as completed, review subjects as
immutable result ids, model input rebuilt from the frozen fact manifest.
History paging marks the list incomplete whenever a full page is advanced with
the timestamp-only cursor.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


## Part D — HTTP 层、UI 与页面（Task 12–14）

Exports from earlier tasks used here (verified by the integrator: Tasks 1–14 extracted from this plan into one scratch tree compile with `tsc --noEmit`, pass ESLint and their unit suites):

- Task 2: `flags.ts` `strategyEnabled(env?)`, `judgmentsEnabled(env?)` (`'1'` = on); `port.ts` `strategyPort():StrategyReadPort|null`, `StrategyReadPort`.
- Task 3: `db.ts` `StrategyDb` (incl. `reviewResult`, `recordCompletion`, `expireExplanations`, `runDetail`, `recoverableRuns`), `supabaseStrategyDb({admin,anon,session?})`, `memoryStrategyDb({now?})` with `_userId` and `_run` (claims need an `explain_facts` manifest; `publishReview` needs a `review` manifest and its hash).
- Task 6: `transmission.ts` `buildTransmissionManifest(port,{now,codeVersion,region}):Promise<StrategyManifest|null>` (null = no active snapshot in either region), `buildTransmission(stored)` (region from `params`); `playbooks.ts` `buildPlaybooks(manifest,region)`, `selectF4Mark({card,detail,snapshotId})`; `data/playbooks-v1.ts` `PLAYBOOK_DISCLAIMER_V1`; `f4-types.ts`.
- Task 7: `policy-response.ts` `buildPolicyResponseManifest(port,{now,codeVersion,window})`, `buildPolicyResponse(stored)` (window from `params`).
- Task 8: `cycle-table.ts` `buildCycleTableManifest(port,{now,codeVersion,boundary})`, `buildCycleTable(stored)` (boundary from `params`).
- Task 9: `review.ts` `runReview({port,db,codeVersion},region,month,{preview}):Promise<ReviewReceipt>` (never throws; a failure comes back as `outcome:'failed'` with `error`).
- Task 10: `explain-render.ts` `renderFact(fact,locale,names)`, `namesFrom(catalog)`; `explain-validate.ts` `FORBIDDEN_TERMS`.
- Task 11: `f4-client.ts` `createF4Client()`, `F4Client`, `F4CardLite`; `deviations.ts` `listDeviationCases(f4,region)`; `explain-request.ts` `handleExplainRequest({db,port,llm,now,codeVersion:string|null},userId,body):Promise<{status,body}>`, `recoverUserExplanations({db,llm},userId,limit=3):Promise<number>` (completion recovery for GET), `LlmDeps` (with `finalizePayload` and `finalize(key,payload)`), `LlmCallError(message,accounting)`, `modelInput(manifest,locale)`. Review explanation subjects are immutable review `result_id`s.

Test files can import only `.ts` modules (vitest runs `src/**/*.test.ts` in node, and a `.test.ts` cannot import a `.tsx`). Every decision a component makes lives in `strategy-view-model.ts` and is tested there; the `.tsx` files are thin renderers checked by `tsc`, ESLint and the page structure test.

The worktree has no installed `node_modules` of its own. If `npm test` cannot find `vitest`, run `npm ci` in the worktree first, or symlink `node_modules` to the main checkout's when that one matches `package-lock.json`.

### Task 12: Route helpers, production LlmDeps, strategy API routes and the review cron

**Files:**
- Create: `src/lib/macro/strategy/route-helpers.ts`
- Create: `src/lib/macro/strategy/llm-deps.ts`, `src/lib/macro/strategy/llm-deps.test.ts`
- Create: `src/app/api/macro/strategy/transmission/route.ts`
- Create: `src/app/api/macro/strategy/policy-response/route.ts`
- Create: `src/app/api/macro/strategy/cycle-table/route.ts`
- Create: `src/app/api/macro/strategy/manifests/[id]/route.ts`
- Create: `src/app/api/macro/strategy/reviews/route.ts`
- Create: `src/app/api/macro/strategy/reviews/[region]/[month]/route.ts`
- Create: `src/app/api/macro/strategy/deviations/route.ts`
- Create: `src/app/api/macro/strategy/explanations/route.ts`
- Create: `src/app/api/cron/macro-review/route.ts`
- Create: `src/app/api/macro/strategy/routes.test.ts`, `src/app/api/macro/strategy/explanations.integration.test.ts`
- Modify: `vercel.json` (append one cron entry; JSON, so no fence)

Design decisions (spec §8, §9.1, §6.2, §6.3):
- **Decision order** in every read route: session (`getServerSupabase().auth.getUser()`; no user or any throw → 401 `unauthorized`) → `strategyEnabled()` (404 `strategy_disabled`) → `strategyPort()` (null → 503 `macro_foundation_unavailable`) → parameters (whitelist; an unknown or repeated parameter → 400 `invalid_parameter:<name>`) → judgment layer. `POST /explanations` stops after the flag and hands the body to `handleExplainRequest`, whose replay runs before its own foundation check, so the route passes `strategyPort()` even when it is null. The cron route checks the bearer first, then the flag, then the port, then parameters.
- **Combined routes** (transmission, review detail) always answer 200 once the facts are available, with `judgment_status`. `judgmentSection()` builds an F4 client only when `judgmentsEnabled()`; any F4 throw, a missing card or a `null` from `selectF4Mark` → `'unavailable'`. With the layer off the body has no `f4` key and F4 is never called. Only `/deviations` answers 404 `judgments_disabled` / 503 `judgments_unavailable`.
- **Manifests** (Part B, "One manifest per kind"): each fact route builds the manifest body of its kind with `{now:new Date(), codeVersion, region | window | boundary}` (the parameter is frozen into `params`, plan audit #3), stores it with `putManifest` (idempotent by hash), then calls the pure view builder with the stored manifest only (it reads the parameter from `body.params`). The F4 mark uses `stored.body.snapshots[region]?.snapshot_id ?? null`. `buildTransmissionManifest` returning `null` → 404 `no_published_snapshot` (the page shows "尚无发布快照"). The process LRU of spec §4.5 is not built here (已知偏差与开放项 D1).
- **Code version**: `resolveCodeVersion({allowGit:false})`. When it is null the manifest-writing routes (transmission, policy-response, cycle-table) and the cron answer 503 `code_version_unavailable`, as `/api/cron/facts-sync` does; explanations POST passes `codeVersion: null` into the handler, which answers 503 only after its idempotent replay (plan audit #9), instead of freezing `'unknown'` into manifest identities (已知偏差与开放项 D2).
- **Review detail** returns `{result, manifest_id, generation, names, judgment_status, f4?}`. `names` is the review manifest's frozen catalog `{id, name}` list, so the UI can call `renderFact(fact, locale, namesFrom(names))`. The judgment section reads `latestRegimeCard(region, {asOf: reviewAsOfDate(month)})` (the review cutoff date, the 3rd of the next month; F4 `view=as_known`), then `judgmentDetail`, and keeps only `selectF4Mark({card, detail, snapshotId: null}).summary`: number-free and never stored.
- **Explanations**: `POST` → `handleExplainRequest({db, port, llm: productionLlmDeps(userId), now, codeVersion: codeVersionOrNull()}, userId, body)`. A non-JSON body is 400 `invalid_body` before the handler. A `'not authenticated'` throw (from `checkQuota`) is 401. `GET ?subject_kind&subject_id` → first `recoverUserExplanations({db, llm: productionLlmDeps(userId)}, userId)` (Task 11: at most three of the caller's running rows with a recorded completion are finished from the stored output and settled, never sent to the provider again; plan audit R2-1), then `db.expireExplanations(userId)` (admin RPC `macro_expire_explanations`: the caller's runs left `running` for more than five minutes without a recorded completion become abandoned → projection failed, plan audit #14), then `{items}`, the caller's own projections through the session client (RLS), newest 20, `private, no-store`. Review subject ids are immutable review result ids (uuid; 已知偏差与开放项 D3), canonicalized to lowercase in one place: the POST route runs `canonicalExplainBody(body)` (route-helpers) before `handleExplainRequest`, so the payload hash, the stored `subject_id` (a text column) and GET's `subjectIdOf` lowercase lookup agree whatever case the client sent (Codex round 1 #1; the migration is unreleased on this branch, so no mixed-case rows exist).
- **Production `LlmDeps`** (`llm-deps.ts`) makes the perspectives route's calls in the same order. It uses `resolveLlm()` (the perspectives route's call; `resolveUserLlm()` would only ever return BYO keys), `checkQuota('perspectives')`, the same limiter choice built right before `beginUsageRun(userId, key, 'perspectives', {provider, model, pricingVersion, usdCnyMicros, byo})`, then one `limiter.runWithBudgetRetry(() => runMeteredLlmCall({feature:'perspectives', provider, userId, budgetExempt, maxOutputTokens, call: () => chatResolved(...)}))`, `meteredUsageFromError` on failure, and `finalizeUsageRun` with the field mapping of the route's `finalizeAccounting` minus `ticker`. That body is built once by `finalizePayload(status, accounting)` (aggregate + the pricing version and FX in force at completion, JSON-safe) and stored on the run row; `finalize(key, payload)` sends a payload verbatim, so a retry after a pricing / FX change replays what the request computed (plan audit #8). `budgetExempt` is true when the quota answered `limit === -1`. A failed call throws `LlmCallError(e.message, meteredUsageFromError(e) ?? null)`, so a cost error code such as `daily_cost_exhausted` stays the message.
- **Cron**: `GET /api/cron/macro-review` with `authorizedCronRequest(header, CRON_SECRET)`. The default month is the newest closed month — a month is closed once its review cutoff (`monthCutoff`, the 3rd of the next month 00:00:00Z) has passed, so the run on the 3rd at 06:00 UTC targets the previous month — both regions in order US, CN. `?month=YYYY-MM` must be a closed month ≥ 2000-01; `?preview` accepts only `1`. The receipt keeps `runReview`'s fields but replaces a failed unit's `error` message with `code:'review_failed'` (codes only over HTTP, as facts-sync does); any failed unit makes the response 500.
- Errors are `{error:{code,message}}` with `Cache-Control: no-store`. Reads send `private, max-age=300`; explanations send `private, no-store`.

- [ ] **Step 1: Write the failing test for the production LlmDeps**

Create `src/lib/macro/strategy/llm-deps.test.ts`:

```ts
// Production LlmDeps (spec §6.3): the perspectives-route metering calls in order, BYO vs platform, fail-open quota,
// failure accounting carried on the thrown error, finalizePayload aggregates once (JSON-safe), finalize sends it verbatim.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {PRICING_VERSION} from '@/lib/billing/llm-pricing';
import type {MeteredUsage} from '@/lib/billing/metered-llm';

const m=vi.hoisted(()=>({resolve:vi.fn(),checkQuota:vi.fn(),begin:vi.fn(),finalize:vi.fn(),run:vi.fn(),fromErr:vi.fn(),chat:vi.fn(),persona:vi.fn(),plain:vi.fn()}));
vi.mock('@/lib/llm/resolve',()=>({resolveLlm:m.resolve}));
vi.mock('@/lib/billing/quota',()=>({checkQuota:m.checkQuota,beginUsageRun:m.begin,finalizeUsageRun:m.finalize}));
vi.mock('@/lib/billing/metered-llm',async(orig)=>({...await orig<typeof import('@/lib/billing/metered-llm')>(),runMeteredLlmCall:m.run,meteredUsageFromError:m.fromErr}));
vi.mock('@/lib/billing/llm-concurrency',()=>({PERSONA_CONCURRENCY_HARD_CAP:4,createPersonaConcurrencyLimiter:m.persona,createConcurrencyLimiter:m.plain}));
vi.mock('@/lib/billing/cost-budget',async(orig)=>({...await orig<typeof import('@/lib/billing/cost-budget')>(),getBudgetConfig:()=>({dailyLimitMicrormb:8_800_000,usdCnyMicros:7_200_000,reservationTtlSeconds:60})}));
vi.mock('@/lib/data/sources/llm',()=>({chatResolved:m.chat}));

import {LlmCallError} from './explain-request';
import {EXPLAIN_MAX_OUTPUT_TOKENS,productionLlmDeps} from './llm-deps';

const ENV_LLM={provider:'deepseek',model:'deepseek-chat',protocol:'openai',source:'env',baseUrl:'https://x',apiKey:'k'};
const USER_LLM={...ENV_LLM,provider:'openai',model:'gpt-x',source:'user'};
const usage=(o:Partial<MeteredUsage>={}):MeteredUsage=>({status:'completed',provider:'deepseek',model:'deepseek-chat',usage:{inputTokens:100,cacheHitInputTokens:10,cacheMissInputTokens:90,outputTokens:50,estimated:false},costMicrormb:300,usageEstimated:false,byo:false,...o});
const limiter={limit:1,run:<T,>(f:()=>Promise<T>)=>f(),runWithBudgetRetry:<T,>(f:()=>Promise<T>)=>f()};

describe('productionLlmDeps',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.resolve.mockResolvedValue(ENV_LLM);m.persona.mockReturnValue(limiter);m.plain.mockReturnValue(limiter);
  m.begin.mockResolvedValue(undefined);m.finalize.mockResolvedValue(undefined);
  m.chat.mockResolvedValue({content:'{"points":[]}',usage:usage().usage});
  m.run.mockImplementation(async(a:{call:()=>Promise<unknown>})=>({value:await a.call(),accounting:usage()}));
 });
 it('resolve maps the resolved provider; env = platform, user = BYO; none → null',async()=>{
  expect(await productionLlmDeps('u1').resolve()).toEqual({provider:'deepseek',model:'deepseek-chat',byo:false});
  m.resolve.mockResolvedValueOnce(USER_LLM);
  expect(await productionLlmDeps('u1').resolve()).toEqual({provider:'openai',model:'gpt-x',byo:true});
  m.resolve.mockResolvedValueOnce(null);
  expect(await productionLlmDeps('u1').resolve()).toBeNull();
 });
 it('checkQuota uses the perspectives feature, fails open on errors and rethrows not authenticated',async()=>{
  const d=productionLlmDeps('u1');
  m.checkQuota.mockResolvedValueOnce({allowed:false,used:5,limit:5,plan:'free'});
  expect(await d.checkQuota()).toEqual({allowed:false,used:5,limit:5});
  expect(m.checkQuota).toHaveBeenCalledWith('perspectives');
  m.checkQuota.mockRejectedValueOnce(new Error('db down'));
  expect(await d.checkQuota()).toBeNull();
  m.checkQuota.mockRejectedValueOnce(new Error('not authenticated'));
  await expect(d.checkQuota()).rejects.toThrow('not authenticated');
 });
 it('begin builds the persona limiter for platform keys, then beginUsageRun with pricing metadata',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();await d.begin('00000000-0000-4000-8000-0000000000e1',{});
  expect(m.persona).toHaveBeenCalledWith({provider:'deepseek',model:'deepseek-chat',maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS});
  expect(m.begin).toHaveBeenCalledWith('u1','00000000-0000-4000-8000-0000000000e1','perspectives',{provider:'deepseek',model:'deepseek-chat',pricingVersion:PRICING_VERSION,usdCnyMicros:7_200_000,byo:false});
  expect(m.persona.mock.invocationCallOrder[0]).toBeLessThan(m.begin.mock.invocationCallOrder[0]);
 });
 it('begin for BYO uses the plain limiter and no pricing metadata; begin errors propagate with their code',async()=>{
  m.resolve.mockResolvedValueOnce(USER_LLM);
  const d=productionLlmDeps('u1');await d.resolve();await d.begin('k',{});
  expect(m.plain).toHaveBeenCalledWith(4);
  expect(m.begin).toHaveBeenCalledWith('u1','k','perspectives',{provider:'openai',model:'gpt-x',pricingVersion:undefined,usdCnyMicros:undefined,byo:true});
  m.begin.mockRejectedValueOnce(new Error('usage_audit_unavailable'));
  await expect(d.begin('k2',{})).rejects.toThrow('usage_audit_unavailable');
 });
 it('call runs one metered perspectives call through the limiter; budget exemption follows an unlimited quota',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();
  m.checkQuota.mockResolvedValueOnce({allowed:true,used:0,limit:-1,plan:'pro'});await d.checkQuota();
  await d.begin('k',{});
  expect(await d.call('SYS','USER')).toEqual({content:'{"points":[]}',accounting:usage()});
  expect(m.run).toHaveBeenCalledTimes(1);
  expect(m.run.mock.calls[0][0]).toMatchObject({feature:'perspectives',userId:'u1',budgetExempt:true,maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS,provider:ENV_LLM});
  expect(m.chat).toHaveBeenCalledWith(ENV_LLM,{system:'SYS',messages:[{role:'user',content:'USER'}],max_tokens:EXPLAIN_MAX_OUTPUT_TOKENS,temperature:0.2,timeoutMs:30_000,responseJson:true});
 });
 it('call before begin is refused without any provider call',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();
  await expect(d.call('s','u')).rejects.toThrow('usage_run_not_started');
  expect(m.run).not.toHaveBeenCalled();
 });
 it('a failed call throws LlmCallError with the message (cost codes kept) and the failed accounting row',async()=>{
  const boom=new Error('daily_cost_exhausted');const failed=usage({status:'failed',costMicrormb:120});
  m.run.mockRejectedValueOnce(boom);m.fromErr.mockReturnValueOnce(failed);
  const d=productionLlmDeps('u1');await d.resolve();await d.begin('k',{});
  const err=await d.call('s','u').catch((e:unknown)=>e);
  expect(err).toBeInstanceOf(LlmCallError);
  expect(err).toMatchObject({message:'daily_cost_exhausted',accounting:failed});
  expect(m.fromErr).toHaveBeenCalledWith(boom);
  m.run.mockRejectedValueOnce('weird');m.fromErr.mockReturnValueOnce(undefined);
  await expect(d.call('s','u')).rejects.toMatchObject({message:'weird',accounting:null});
 });
 it('finalizePayload is the aggregate of the accounting rows, or the resolved provider with zero usage; finalize sends a payload verbatim',async()=>{
  const d=productionLlmDeps('u1');await d.resolve();
  const p=d.finalizePayload('completed',[usage(),usage({costMicrormb:200}),null]);
  expect(p).toEqual({provider:'deepseek',model:'deepseek-chat',inputTokens:200,cacheHitInputTokens:20,cacheMissInputTokens:180,outputTokens:100,costMicrormb:500,pricingVersion:PRICING_VERSION,usdCnyMicros:7_200_000,usageEstimated:false,byo:false,status:'completed'});
  expect(m.finalize).not.toHaveBeenCalled();                                   // computing the payload settles nothing
  await d.finalize('k',p);
  expect(m.finalize).toHaveBeenCalledWith('u1','k','perspectives',p);
  const failed=d.finalizePayload('failed',[]);
  expect(failed).toEqual({provider:'deepseek',model:'deepseek-chat',inputTokens:0,cacheHitInputTokens:0,cacheMissInputTokens:0,outputTokens:0,costMicrormb:0,pricingVersion:PRICING_VERSION,usdCnyMicros:7_200_000,usageEstimated:true,byo:false,status:'failed'});
  await d.finalize('k2',JSON.parse(JSON.stringify(failed)));                  // a payload read back from the run row
  expect(m.finalize).toHaveBeenLastCalledWith('u1','k2','perspectives',failed);
 });
 it('BYO payloads carry no pricing version or FX and survive a JSON round trip unchanged',async()=>{
  m.resolve.mockResolvedValueOnce(USER_LLM);
  const d=productionLlmDeps('u1');await d.resolve();
  const p=d.finalizePayload('failed',[]);
  expect(p).toEqual({provider:'openai',model:'gpt-x',inputTokens:0,cacheHitInputTokens:0,cacheMissInputTokens:0,outputTokens:0,costMicrormb:0,usageEstimated:true,byo:true,status:'failed'});
  expect(JSON.parse(JSON.stringify(p))).toEqual(p);
 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/macro/strategy/llm-deps.test.ts`
Expected: FAIL. The suite cannot import `./llm-deps` (the file does not exist yet).

- [ ] **Step 3: Implement `llm-deps.ts`**

Create `src/lib/macro/strategy/llm-deps.ts`:

```ts
// src/lib/macro/strategy/llm-deps.ts
// Production LlmDeps for macro explanations (spec §6.3 steps 4–8). Each method makes the same calls as
// src/app/api/perspectives/[ticker]/route.ts, in the same order: resolveLlm() (BYO = source 'user');
// checkQuota('perspectives') only for platform keys, a throw other than 'not authenticated' fails open (→ null), and
// limit -1 marks the caller budget-exempt; the limiter (createPersonaConcurrencyLimiter for env keys, else
// createConcurrencyLimiter(PERSONA_CONCURRENCY_HARD_CAP)) is built right before beginUsageRun(feature 'perspectives');
// one limiter.runWithBudgetRetry(runMeteredLlmCall(chatResolved)); meteredUsageFromError on failure. finalizePayload builds
// the exact finalizeUsageRun body once, at completion (the perspectives finalizeAccounting body, without ticker: aggregate
// of the accounting rows plus the pricing version and FX in force at that moment, status included; JSON-safe, undefined
// keys dropped); it is stored on the run row (macro_record_completion) and finalize sends a payload verbatim, so an ops
// retry after a pricing or FX change replays exactly what the request computed.
// One instance serves one request. A failed call throws Task 11's LlmCallError(message, meteredUsageFromError(e)): the
// message keeps a cost error code (daily_cost_exhausted …) when that is what failed.
import {chatResolved} from '@/lib/data/sources/llm';
import {resolveLlm,type ResolvedLlm} from '@/lib/llm/resolve';
import {beginUsageRun,checkQuota,finalizeUsageRun,type RecordUsageMeta} from '@/lib/billing/quota';
import {aggregateMeteredUsage,meteredUsageFromError,runMeteredLlmCall,type MeteredUsage} from '@/lib/billing/metered-llm';
import {getBudgetConfig} from '@/lib/billing/cost-budget';
import {createConcurrencyLimiter,createPersonaConcurrencyLimiter,PERSONA_CONCURRENCY_HARD_CAP,type ConcurrencyLimiter} from '@/lib/billing/llm-concurrency';
import {PRICING_VERSION} from '@/lib/billing/llm-pricing';
import {LlmCallError,type LlmDeps} from './explain-request';
export const EXPLAIN_MAX_OUTPUT_TOKENS=1200;
export const EXPLAIN_TIMEOUT_MS=30_000;
export const EXPLAIN_TEMPERATURE=0.2;
const isMeteredUsage=(v:unknown):v is MeteredUsage=>typeof v==='object'&&v!==null&&'status' in v&&'usage' in v&&'costMicrormb' in v;
export function productionLlmDeps(userId:string):LlmDeps{
 let llm:ResolvedLlm|null=null,limiter:ConcurrencyLimiter|null=null,budgetExempt=false;
 const resolved=():ResolvedLlm=>{if(!llm)throw new Error('llm_not_resolved');return llm;};
 return {
  async resolve(){
   llm=await resolveLlm();
   return llm?{provider:llm.provider,model:llm.model,byo:llm.source==='user'}:null;
  },
  async checkQuota(){
   try{const q=await checkQuota('perspectives');budgetExempt=q.limit===-1;return {allowed:q.allowed,used:q.used,limit:q.limit};}
   catch(e){if(e instanceof Error&&e.message==='not authenticated')throw e;return null;}
  },
  async begin(usageAuditKey){
   const r=resolved(),byo=r.source==='user';
   limiter=r.source==='env'
    ?createPersonaConcurrencyLimiter({provider:r.provider,model:r.model,maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS})
    :createConcurrencyLimiter(PERSONA_CONCURRENCY_HARD_CAP);
   const budget=getBudgetConfig();
   await beginUsageRun(userId,usageAuditKey,'perspectives',{provider:r.provider,model:r.model,
    pricingVersion:byo?undefined:PRICING_VERSION,usdCnyMicros:byo?undefined:budget.usdCnyMicros,byo});
  },
  async call(system,user){
   const r=resolved();
   if(!limiter)throw new Error('usage_run_not_started');
   try{
    const metered=await limiter.runWithBudgetRetry(()=>runMeteredLlmCall({feature:'perspectives',provider:r,userId,budgetExempt,maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS,
     call:()=>chatResolved(r,{system,messages:[{role:'user',content:user}],max_tokens:EXPLAIN_MAX_OUTPUT_TOKENS,temperature:EXPLAIN_TEMPERATURE,timeoutMs:EXPLAIN_TIMEOUT_MS,responseJson:true})}));
    return {content:metered.value.content,accounting:metered.accounting};
   }catch(e){
    throw new LlmCallError(e instanceof Error?e.message:String(e),meteredUsageFromError(e)??null);
   }
  },
  finalizePayload(status,accounting){
   const rows=accounting.filter(isMeteredUsage);
   const aggregate=rows.length>0?aggregateMeteredUsage(rows):null;
   const budget=getBudgetConfig(),byo=llm?.source==='user';
   const body:RecordUsageMeta={
    provider:aggregate?.provider??llm?.provider??'unknown',model:aggregate?.model??llm?.model??'unknown',
    inputTokens:aggregate?.usage.inputTokens??0,cacheHitInputTokens:aggregate?.usage.cacheHitInputTokens??0,
    cacheMissInputTokens:aggregate?.usage.cacheMissInputTokens??0,outputTokens:aggregate?.usage.outputTokens??0,
    costMicrormb:aggregate?.costMicrormb??0,
    pricingVersion:aggregate?.pricingVersion??(byo?undefined:PRICING_VERSION),
    usdCnyMicros:aggregate?.usdCnyMicros??(byo?undefined:budget.usdCnyMicros),
    usageEstimated:aggregate?.usageEstimated??true,byo:aggregate?.byo??byo,status,
   };
   return JSON.parse(JSON.stringify(body)) as Record<string,unknown>;
  },
  async finalize(usageAuditKey,payload){
   await finalizeUsageRun(userId,usageAuditKey,'perspectives',payload as unknown as RecordUsageMeta);
  },
 };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/macro/strategy/llm-deps.test.ts`
Expected: PASS, `Tests  9 passed (9)`.

- [ ] **Step 5: Write the failing route test (capability matrix, parameters, judgment fields, cron)**

Create `src/app/api/macro/strategy/routes.test.ts`:

```ts
// Capability matrix (spec §9.1) for every /api/macro/strategy route and the review cron, in decision order: 401 →
// 404 strategy_disabled → 503 macro_foundation_unavailable → 400 parameters → judgment layer. Combined routes stay 200
// with judgment_status and carry no judgment field while the layer is off; only /deviations answers 404/503 for it.
// Library computations are mocked (their own tasks test them); storage is Task 3's in-memory StrategyDb.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {F4Mark,F4Summary,ManifestKind,PlaybookView,PolicyResponseView,ReviewFacts,StrategyManifest,TransmissionView} from '@/lib/macro/strategy/contract';
import {memoryStrategyDb,type StrategyDb} from '@/lib/macro/strategy/db';
import type {F4CardLite} from '@/lib/macro/strategy/f4-client';

const m=vi.hoisted(()=>({user:vi.fn(),port:vi.fn(),db:null as unknown,code:vi.fn(),trManifest:vi.fn(),buildTransmission:vi.fn(),buildPlaybooks:vi.fn(),selectF4Mark:vi.fn(),
 prManifest:vi.fn(),buildPolicyResponse:vi.fn(),ctManifest:vi.fn(),buildCycleTable:vi.fn(),runReview:vi.fn(),handle:vi.fn(),recover:vi.fn(),listDeviationCases:vi.fn(),createF4Client:vi.fn(),card:vi.fn(),detail:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:m.user}})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:m.code}));
vi.mock('@/lib/macro/strategy/port',()=>({strategyPort:m.port}));
vi.mock('@/lib/macro/strategy/db',async(orig)=>({...await orig<typeof import('@/lib/macro/strategy/db')>(),supabaseStrategyDb:()=>m.db}));
vi.mock('@/lib/macro/strategy/transmission',()=>({buildTransmissionManifest:m.trManifest,buildTransmission:m.buildTransmission}));
vi.mock('@/lib/macro/strategy/playbooks',()=>({buildPlaybooks:m.buildPlaybooks,selectF4Mark:m.selectF4Mark}));
vi.mock('@/lib/macro/strategy/policy-response',()=>({buildPolicyResponseManifest:m.prManifest,buildPolicyResponse:m.buildPolicyResponse}));
vi.mock('@/lib/macro/strategy/cycle-table',()=>({buildCycleTableManifest:m.ctManifest,buildCycleTable:m.buildCycleTable}));
vi.mock('@/lib/macro/strategy/review',()=>({runReview:m.runReview}));
vi.mock('@/lib/macro/strategy/explain-request',()=>({handleExplainRequest:m.handle,recoverUserExplanations:m.recover}));
vi.mock('@/lib/macro/strategy/deviations',()=>({listDeviationCases:m.listDeviationCases}));
vi.mock('@/lib/macro/strategy/f4-client',()=>({createF4Client:m.createF4Client,F4Unavailable:class F4Unavailable extends Error{}}));
vi.mock('@/lib/macro/strategy/llm-deps',()=>({productionLlmDeps:(userId:string)=>({tag:'llm',userId})}));

import {GET as cron} from '@/app/api/cron/macro-review/route';
import {ParamError,canonicalExplainBody,isClosedMonth,lastClosedMonth,monthOf,readParams,reviewAsOfDate,subjectIdOf,windowOf} from '@/lib/macro/strategy/route-helpers';
import {GET as cycleTable} from './cycle-table/route';
import {GET as deviations} from './deviations/route';
import {GET as listExplanations,POST as postExplanation} from './explanations/route';
import {GET as manifestRoute} from './manifests/[id]/route';
import {GET as policyResponse} from './policy-response/route';
import {GET as reviewDetail} from './reviews/[region]/[month]/route';
import {GET as reviewsIndex} from './reviews/route';
import {GET as transmission} from './transmission/route';

const USER='11111111-1111-4111-8111-111111111111',REQ='22222222-2222-4222-8222-222222222222',MID='33333333-3333-4333-8333-333333333333',RID='44444444-4444-4444-8444-444444444444';
const PORT={tag:'port'};
const U='https://alpha.example/api/macro/strategy';
const get=(path:string)=>new Request(`${U}${path}`);
const post=(body:unknown)=>new Request(`${U}/explanations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const json=async(r:Response)=>r.json() as Promise<Record<string,unknown>>;
const codeOf=async(r:Response)=>((await json(r)).error as {code:string}).code;
const TV:TransmissionView={version:'macro-transmission/1',region:'US',manifest_id:MID,cutoff:'2026-11-03T06:02:00Z',snapshots:{US:'snap:US:1',CN:'snap:CN:1'},catalog_version:'cat/1',stages:[]};
const PV:PolicyResponseView={version:'macro-policy-response/1',window:3,manifest_id:MID,cutoff:'2026-11-03T06:02:00Z',dims:[],rows:[],sentences:[]};
const CARD:F4CardLite={judgment_id:'j1',lifecycle:'open',calibration:'insufficient_sample',as_of:'2026-11-03T03:20:00Z',methodology:{id:'macro_regime',version:'v1'},selected:'overheat'};
const SUMMARY:F4Summary={judgment_id:'j1',selected:'overheat',lifecycle:'open',outcome:null,calibration:'insufficient_sample',methodology:{id:'macro_regime',version:'v1'},as_of:'2026-11-03T03:20:00Z',href:'/intel/methods/macro_regime/v1'};
const MARK:{mark:F4Mark;summary:F4Summary}={mark:{regime:'overheat',judgment_id:'j1',snapshot_match:true,as_of:'2026-11-03T03:20:00Z'},summary:SUMMARY};
const PB:PlaybookView[]=[{regime:'recovery',title:{zh:'复苏',en:'Recovery'},triggers:[],mechanism:[],implications:{favored:[],disfavored:[]},watch:[]}];
const FROZEN_US={snapshot_id:'snap:US:1',created_at:'2026-11-03T06:02:00.000Z',as_of:'2026-11-03',catalog_counts:{verified:1,missing:0,restricted:0},observation_ids:[],history_ids:[]};
const body=(kind:ManifestKind,o:Partial<StrategyManifest>={}):StrategyManifest=>({kind,params:{},cutoff:'2026-11-03T06:02:00.000Z',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],catalog_version:'cat/1',method_version:'m/1',code_version:'abc123',...o});
const MANIFEST=body('review',{params:{region:'US',month:'2026-10'},cutoff:'2026-11-03T00:00:00.000Z',method_version:'macro-review/1',
 catalog:[{id:'US_CPI_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 CPI 同比',en:'US CPI YoY'},unit:'pct',status:'active',changeKind:'pp',nativeFrequency:'monthly',period:'month'}]});
const FACTS:ReviewFacts={region:'US',month:'2026-10',cutoff:'2026-11-03T00:00:00.000Z',baseline_cutoff:'2026-10-03T00:00:00.000Z',snapshot_id:null,baseline_snapshot_id:null,baseline_missing:true,
 releases:[],revisions:[],timeliness:[],policy_events:[],episode_changes:[],asset_moves:[],coverage:[]};
let db:ReturnType<typeof memoryStrategyDb>;
async function seedReview(d:StrategyDb){
 const man=await d.putManifest(MANIFEST);
 const pub=await d.publishReview({region:'US',month:'2026-10',expectedGeneration:0,cutoff:MANIFEST.cutoff,status:'insufficient',manifestId:man.manifest_id,manifestHash:man.manifest_hash,facts:FACTS,methodVersion:'macro-review/1',codeVersion:'abc123'});
 return {man,pub};
}
type Call=()=>Promise<Response>;
const FACT_ROUTES:[string,Call][]=[
 ['transmission',()=>transmission(get('/transmission?region=US'))],
 ['policy-response',()=>policyResponse(get('/policy-response?window=3'))],
 ['cycle-table',()=>cycleTable(get('/cycle-table?boundary=event_day'))],
 ['manifest',()=>manifestRoute(get(`/manifests/${MID}`),{params:Promise.resolve({id:MID})})],
 ['reviews',()=>reviewsIndex(get('/reviews?region=US'))],
 ['review',()=>reviewDetail(get('/reviews/US/2026-10'),{params:Promise.resolve({region:'US',month:'2026-10'})})],
 ['deviations',()=>deviations(get('/deviations?region=US'))],
 ['explanations GET',()=>listExplanations(get(`/explanations?subject_kind=review&subject_id=${RID}`))],
];
const EXPLAIN_BODY={request_id:REQ,subject:{kind:'review',id:RID},locale:'zh'};
const ALL_ROUTES:[string,Call][]=[...FACT_ROUTES,['explanations POST',()=>postExplanation(post(EXPLAIN_BODY))]];
const COMPUTE=()=>[m.trManifest,m.prManifest,m.ctManifest,m.listDeviationCases,m.handle,m.createF4Client];
const ENV_KEYS=['MACRO_STRATEGY_ENABLED','MACRO_JUDGMENTS_ENABLED','CRON_SECRET'] as const;
const saved=Object.fromEntries(ENV_KEYS.map(k=>[k,process.env[k]]));

beforeEach(()=>{
 vi.clearAllMocks();
 process.env.MACRO_STRATEGY_ENABLED='1';delete process.env.MACRO_JUDGMENTS_ENABLED;process.env.CRON_SECRET='cron-secret';
 m.user.mockResolvedValue({data:{user:{id:USER}},error:null});
 m.port.mockReturnValue(PORT);m.code.mockReturnValue('abc123');
 db=memoryStrategyDb();m.db=db;
 m.trManifest.mockResolvedValue(body('transmission',{snapshots:{US:FROZEN_US,CN:null}}));m.buildTransmission.mockReturnValue(TV);m.buildPlaybooks.mockReturnValue(PB);
 m.prManifest.mockResolvedValue(body('policy_response'));m.buildPolicyResponse.mockReturnValue(PV);
 m.ctManifest.mockResolvedValue(body('cycle_table'));m.buildCycleTable.mockReturnValue({version:'macro-cycle-table/1'});
 m.createF4Client.mockReturnValue({latestRegimeCard:m.card,judgmentDetail:m.detail,history:vi.fn()});
 m.card.mockResolvedValue(CARD);m.detail.mockResolvedValue({judgment_id:'j1'});m.selectF4Mark.mockReturnValue(MARK);
 m.listDeviationCases.mockResolvedValue({cases:[],incomplete:false});
 m.handle.mockResolvedValue({status:200,body:{explanation_id:'e1',state:'accepted'}});m.recover.mockResolvedValue(0);
 m.runReview.mockImplementation(async(_d:unknown,region:string,month:string,o:{preview:boolean})=>({region,month,outcome:o.preview?'preview':'advanced',status:'ok',manifest_hash:'h',manifest_id:MID,result_id:REQ,generation:1}));
});
afterEach(()=>{for(const k of ENV_KEYS){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}vi.useRealTimers();});

describe('capability matrix (spec §9.1)',()=>{
 it.each(ALL_ROUTES)('%s: no session → 401 before anything else',async(_n,call)=>{
  m.user.mockResolvedValue({data:{user:null},error:null});
  const r=await call();
  expect(r.status).toBe(401);expect(await codeOf(r)).toBe('unauthorized');
  expect(m.port).not.toHaveBeenCalled();for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it.each(ALL_ROUTES)('%s: strategy flag unset → 404 strategy_disabled, foundation never consulted',async(_n,call)=>{
  delete process.env.MACRO_STRATEGY_ENABLED;
  const r=await call();
  expect(r.status).toBe(404);expect(await codeOf(r)).toBe('strategy_disabled');
  expect(m.port).not.toHaveBeenCalled();for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it.each(FACT_ROUTES)('%s: enabled with a null port → 503 macro_foundation_unavailable',async(_n,call)=>{
  m.port.mockReturnValue(null);
  const r=await call();
  expect(r.status).toBe(503);expect(await codeOf(r)).toBe('macro_foundation_unavailable');
  for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it('foundation is checked before parameters',async()=>{
  m.port.mockReturnValue(null);
  expect((await transmission(get('/transmission?region=XX'))).status).toBe(503);
  expect((await deviations(get('/deviations?bogus=1'))).status).toBe(503);
 });
 it('explanations POST with a null port reaches the handler (its replay precedes the foundation check) and passes the status through',async()=>{
  m.port.mockReturnValue(null);
  m.handle.mockResolvedValueOnce({status:503,body:{error:{code:'macro_foundation_unavailable',message:'x'}}});
  const r=await postExplanation(post(EXPLAIN_BODY));
  expect(r.status).toBe(503);
  const [deps,userId,raw]=m.handle.mock.calls[0];
  expect(deps).toMatchObject({port:null,db,codeVersion:'abc123',llm:{tag:'llm',userId:USER}});
  expect([userId,raw]).toEqual([USER,EXPLAIN_BODY]);
  m.handle.mockResolvedValueOnce({status:200,body:{explanation_id:'e0',state:'accepted'}});
  const replay=await postExplanation(post(EXPLAIN_BODY));
  expect(replay.status).toBe(200);expect(await replay.json()).toEqual({explanation_id:'e0',state:'accepted'});
  expect(replay.headers.get('cache-control')).toBe('private, no-store');
 });
});

describe('parameters (whitelist, 400 invalid_parameter:<name>)',()=>{
 const BAD:[string,Call,string][]=[
  ['transmission region',()=>transmission(get('/transmission?region=HK')),'invalid_parameter:region'],
  ['transmission missing region',()=>transmission(get('/transmission')),'invalid_parameter:region'],
  ['transmission unknown',()=>transmission(get('/transmission?region=US&x=1')),'invalid_parameter:x'],
  ['transmission repeated',()=>transmission(get('/transmission?region=US&region=CN')),'invalid_parameter:region'],
  ['policy window',()=>policyResponse(get('/policy-response?window=2')),'invalid_parameter:window'],
  ['cycle boundary',()=>cycleTable(get('/cycle-table?boundary=week')),'invalid_parameter:boundary'],
  ['manifest id',()=>manifestRoute(get('/manifests/nope'),{params:Promise.resolve({id:'nope'})}),'invalid_parameter:id'],
  ['reviews region',()=>reviewsIndex(get('/reviews')),'invalid_parameter:region'],
  ['review month',()=>reviewDetail(get('/reviews/US/2026-13'),{params:Promise.resolve({region:'US',month:'2026-13'})}),'invalid_parameter:month'],
  ['review region',()=>reviewDetail(get('/reviews/EU/2026-10'),{params:Promise.resolve({region:'EU',month:'2026-10'})}),'invalid_parameter:region'],
  ['deviations region',()=>deviations(get('/deviations?region=us')),'invalid_parameter:region'],
  ['explanations kind',()=>listExplanations(get('/explanations?subject_kind=x&subject_id=a')),'invalid_parameter:subject_kind'],
  ['explanations review id (a pointer key is not a result id)',()=>listExplanations(get('/explanations?subject_kind=review&subject_id=US:2026-10')),'invalid_parameter:subject_id'],
 ];
 it.each(BAD)('%s',async(_n,call,code)=>{
  const r=await call();
  expect(r.status).toBe(400);expect(await codeOf(r)).toBe(code);
  for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it('defaults: window 3, boundary event_day (frozen into the manifest params)',async()=>{
  await policyResponse(get('/policy-response'));await cycleTable(get('/cycle-table'));
  expect(m.prManifest.mock.calls[0][1]).toMatchObject({window:3});expect(m.ctManifest.mock.calls[0][1]).toMatchObject({boundary:'event_day'});
 });
 it('explanations POST rejects a non-JSON body',async()=>{
  const r=await postExplanation(new Request(`${U}/explanations`,{method:'POST',body:'{'}));
  expect(r.status).toBe(400);expect(await codeOf(r)).toBe('invalid_body');expect(m.handle).not.toHaveBeenCalled();
 });
 it('manifest-writing routes refuse without a code version',async()=>{
  m.code.mockReturnValue(null);
  for(const call of [()=>transmission(get('/transmission?region=US')),()=>policyResponse(get('/policy-response')),()=>cycleTable(get('/cycle-table'))]){
   const r=await call();expect(r.status).toBe(503);expect(await codeOf(r)).toBe('code_version_unavailable');
  }
  expect(m.trManifest).not.toHaveBeenCalled();
 });
 it('explanations POST without a code version still reaches the handler (a replay needs none; the handler answers 503 after it)',async()=>{
  m.code.mockReturnValue(null);
  m.handle.mockResolvedValueOnce({status:200,body:{explanation_id:'e0',state:'accepted'}});
  const r=await postExplanation(post(EXPLAIN_BODY));
  expect(r.status).toBe(200);
  expect(m.handle.mock.calls[0][0]).toMatchObject({codeVersion:null});
 });
});

describe('fact routes',()=>{
 it('transmission, judgment layer off: one stored manifest feeds flow and playbooks; judgment_status disabled, no f4 field, F4 never built',async()=>{
  const r=await transmission(get('/transmission?region=US'));
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, max-age=300');
  const out=await json(r);
  expect(out).toEqual({transmission:TV,playbooks:PB,judgment_status:'disabled'});
  expect('f4' in out).toBe(false);
  expect(JSON.stringify(out)).not.toMatch(/judgment_id|f4Mark|contributions|distribution|margin_pp/);
  expect(m.createF4Client).not.toHaveBeenCalled();expect(m.selectF4Mark).not.toHaveBeenCalled();
  expect(m.trManifest).toHaveBeenCalledWith(PORT,{now:expect.any(Date),codeVersion:'abc123',region:'US'});
  const stored=m.buildTransmission.mock.calls[0][0];
  expect(stored).toEqual(await db.manifest(stored.manifest_id));
  expect(m.buildTransmission.mock.calls[0]).toHaveLength(1);   // the view reads the region from the manifest params
  expect(m.buildPlaybooks).toHaveBeenCalledWith(stored.body,'US');
 });
 it('transmission, judgment layer on: ok carries {mark, summary} for the manifest snapshot of the region',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  const out=await json(await transmission(get('/transmission?region=US')));
  expect(out).toEqual({transmission:TV,playbooks:PB,judgment_status:'ok',f4:MARK});
  expect(m.card).toHaveBeenCalledWith('US');expect(m.detail).toHaveBeenCalledWith('j1');
  expect(m.selectF4Mark).toHaveBeenCalledWith({card:CARD,detail:{judgment_id:'j1'},snapshotId:'snap:US:1'});
  await transmission(get('/transmission?region=CN'));   // CN has no snapshot in this manifest
  expect(m.selectF4Mark).toHaveBeenLastCalledWith({card:CARD,detail:{judgment_id:'j1'},snapshotId:null});
 });
 it('transmission, judgment layer on but F4 unavailable / no card / no mark: still 200, unavailable, no f4',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  m.card.mockRejectedValueOnce(new Error('F4 down'));
  let r=await transmission(get('/transmission?region=US'));
  expect(r.status).toBe(200);expect(await json(r)).toEqual({transmission:TV,playbooks:PB,judgment_status:'unavailable'});
  m.card.mockResolvedValueOnce(null);
  expect((await json(await transmission(get('/transmission?region=US')))).judgment_status).toBe('unavailable');
  m.selectF4Mark.mockReturnValueOnce(null);
  r=await transmission(get('/transmission?region=US'));
  expect(await json(r)).toEqual({transmission:TV,playbooks:PB,judgment_status:'unavailable'});
 });
 it('transmission without any active snapshot → 404 no_published_snapshot, nothing stored',async()=>{
  m.trManifest.mockResolvedValueOnce(null);
  const r=await transmission(get('/transmission?region=CN'));
  expect(r.status).toBe(404);expect(await codeOf(r)).toBe('no_published_snapshot');
  expect(m.buildTransmission).not.toHaveBeenCalled();
 });
 it('policy-response and cycle-table: stored manifest → view for the requested window / boundary',async()=>{
  let r=await policyResponse(get('/policy-response?window=6'));
  expect(r.status).toBe(200);expect(await r.json()).toEqual(PV);
  expect(m.prManifest).toHaveBeenCalledWith(PORT,{now:expect.any(Date),codeVersion:'abc123',window:6});
  expect(m.buildPolicyResponse.mock.calls[0]).toEqual([expect.objectContaining({body:body('policy_response')})]);
  r=await cycleTable(get('/cycle-table?boundary=month_end'));
  expect(r.headers.get('cache-control')).toBe('private, max-age=300');
  expect(m.ctManifest).toHaveBeenCalledWith(PORT,{now:expect.any(Date),codeVersion:'abc123',boundary:'month_end'});
  expect(m.buildCycleTable.mock.calls[0]).toEqual([expect.objectContaining({body:body('cycle_table')})]);
 });
 it('manifest: stored body by id; unknown id → 404 manifest_not_found',async()=>{
  const stored=await db.putManifest(MANIFEST);
  const r=await manifestRoute(get(`/manifests/${stored.manifest_id}`),{params:Promise.resolve({id:stored.manifest_id})});
  expect(r.status).toBe(200);expect(await r.json()).toEqual(stored);
  const miss=await manifestRoute(get(`/manifests/${MID}`),{params:Promise.resolve({id:MID})});
  expect(miss.status).toBe(404);expect(await codeOf(miss)).toBe('manifest_not_found');
 });
 it('reviews index lists current pointers with their region',async()=>{
  const {pub}=await seedReview(db);
  const out=await json(await reviewsIndex(get('/reviews?region=US')));
  expect(out.items).toEqual([{region:'US',month:'2026-10',status:'insufficient',generation:pub.generation,result_id:pub.result_id,updated_at:expect.any(String)}]);
  expect((await json(await reviewsIndex(get('/reviews?region=CN')))).items).toEqual([]);
 });
 it('review detail, judgment layer off: result, generation and catalog names; judgment_status disabled, no f4; no pointer → 404',async()=>{
  const {man,pub}=await seedReview(db);
  const out=await json(await reviewDetail(get('/reviews/US/2026-10'),{params:Promise.resolve({region:'US',month:'2026-10'})}));
  expect(out).toMatchObject({manifest_id:man.manifest_id,generation:pub.generation,judgment_status:'disabled',names:[{id:'US_CPI_YOY',name:{zh:'美国 CPI 同比',en:'US CPI YoY'}}]});
  expect((out.result as {result_id:string}).result_id).toBe(pub.result_id);
  expect('f4' in out).toBe(false);expect(m.createF4Client).not.toHaveBeenCalled();
  const miss=await reviewDetail(get('/reviews/US/2026-09'),{params:Promise.resolve({region:'US',month:'2026-09'})});
  expect(miss.status).toBe(404);expect(await codeOf(miss)).toBe('review_not_found');
 });
 it('review detail, judgment layer on: the card known at the review cutoff as a number-free summary; F4 down → unavailable',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  await seedReview(db);
  const call=()=>reviewDetail(get('/reviews/US/2026-10'),{params:Promise.resolve({region:'US',month:'2026-10'})});
  const out=await json(await call());
  expect(out.judgment_status).toBe('ok');expect(out.f4).toEqual({summary:SUMMARY});
  expect(m.card).toHaveBeenCalledWith('US',{asOf:'2026-11-03'});
  expect(m.selectF4Mark).toHaveBeenCalledWith({card:CARD,detail:{judgment_id:'j1'},snapshotId:null});
  m.card.mockRejectedValueOnce(new Error('down'));
  const down=await call();
  expect(down.status).toBe(200);const b=await json(down);expect(b.judgment_status).toBe('unavailable');expect('f4' in b).toBe(false);
 });
 it('explanations GET returns only the caller\'s projections of that result id, private no-store',async()=>{
  const facts=await db.putManifest(body('explain_facts'));
  await db.claimExplanation({userId:USER,requestId:REQ,payloadHash:'a'.repeat(64),subjectKind:'review',subjectId:RID,locale:'zh',manifestId:facts.manifest_id});
  await db.claimExplanation({userId:'99999999-9999-4999-8999-999999999999',requestId:REQ,payloadHash:'b'.repeat(64),subjectKind:'review',subjectId:RID,locale:'zh',manifestId:facts.manifest_id});
  await db.claimExplanation({userId:USER,requestId:MID,payloadHash:'c'.repeat(64),subjectKind:'review',subjectId:'55555555-5555-4555-8555-555555555555',locale:'zh',manifestId:facts.manifest_id});
  db._userId(USER);
  const r=await listExplanations(get(`/explanations?subject_kind=review&subject_id=${RID}`));
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  const items=(await json(r)).items as {state:string;subject_id:string}[];
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({state:'running',subject_id:RID});
 });
 it('explanations GET recovers recorded completions, then expires the caller\'s dead runs: a reload after five minutes shows failed {abandoned}, never running',async()=>{
  let t=Date.parse('2026-11-07T00:00:00Z');db=memoryStrategyDb({now:()=>new Date(t)});m.db=db;
  const facts=await db.putManifest(body('explain_facts'));
  await db.claimExplanation({userId:USER,requestId:REQ,payloadHash:'a'.repeat(64),subjectKind:'review',subjectId:RID,locale:'zh',manifestId:facts.manifest_id});
  db._userId(USER);
  const expire=vi.spyOn(db,'expireExplanations');
  const call=async()=>((await json(await listExplanations(get(`/explanations?subject_kind=review&subject_id=${RID}`)))).items as {state:string;failure_codes:string[]}[])[0];
  expect(await call()).toMatchObject({state:'running'});
  t+=6*60_000;
  expect(await call()).toMatchObject({state:'failed',failure_codes:['abandoned']});
  expect(expire).toHaveBeenCalledWith(USER);
  expect(m.recover).toHaveBeenCalledWith({db,llm:{tag:'llm',userId:USER}},USER);
  expect(m.recover.mock.invocationCallOrder.at(-1)!).toBeLessThan(expire.mock.invocationCallOrder.at(-1)!);   // recovery runs before expiry
 });
});

describe('deviations (pure judgment route)',()=>{
 it('judgment layer off → 404 judgments_disabled without calling F4',async()=>{
  const r=await deviations(get('/deviations?region=US'));
  expect(r.status).toBe(404);expect(await codeOf(r)).toBe('judgments_disabled');
  expect(m.createF4Client).not.toHaveBeenCalled();expect(m.listDeviationCases).not.toHaveBeenCalled();
 });
 it('judgment layer on: 200 {cases, incomplete}; any F4 failure → 503 judgments_unavailable',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  m.listDeviationCases.mockResolvedValueOnce({cases:[],incomplete:true});
  const r=await deviations(get('/deviations?region=CN'));
  expect(r.status).toBe(200);expect(await r.json()).toEqual({cases:[],incomplete:true});
  expect(m.listDeviationCases.mock.calls[0][1]).toBe('CN');
  m.listDeviationCases.mockRejectedValueOnce(new Error('F4 down'));
  const down=await deviations(get('/deviations?region=CN'));
  expect(down.status).toBe(503);expect(await codeOf(down)).toBe('judgments_unavailable');
 });
});

describe('review cron',()=>{
 const AUTH={authorization:'Bearer cron-secret'};
 const req=(qs:string,headers:Record<string,string>=AUTH)=>new Request(`https://alpha.example/api/cron/macro-review${qs}`,{headers});
 beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-03T06:00:00Z'));});
 it('bearer first: missing or wrong → 401; unset CRON_SECRET → 401',async()=>{
  expect((await cron(req('',{}))).status).toBe(401);
  expect((await cron(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  delete process.env.CRON_SECRET;expect((await cron(req(''))).status).toBe(401);
  expect(m.port).not.toHaveBeenCalled();expect(m.runReview).not.toHaveBeenCalled();
 });
 it('flag off → 404; null port → 503',async()=>{
  delete process.env.MACRO_STRATEGY_ENABLED;expect((await cron(req(''))).status).toBe(404);
  process.env.MACRO_STRATEGY_ENABLED='1';m.port.mockReturnValue(null);
  const r=await cron(req(''));expect(r.status).toBe(503);expect(await codeOf(r)).toBe('macro_foundation_unavailable');
  expect(m.runReview).not.toHaveBeenCalled();
 });
 it.each(['?month=2026-11','?month=2026-12','?month=1999-12','?month=2026-13','?region=HK','?preview=2','?x=1','?month=2026-09&month=2026-08'])('rejects %s',async(qs)=>{
  expect((await cron(req(qs))).status).toBe(400);expect(m.runReview).not.toHaveBeenCalled();
 });
 it('scheduled run: newest closed month, US then CN, writes enabled',async()=>{
  const r=await cron(req(''));
  expect(r.status).toBe(200);
  const out=await json(r);
  expect(out).toMatchObject({ok:true,month:'2026-10',preview:false});
  expect((out.receipts as {region:string;outcome:string}[]).map(x=>[x.region,x.outcome])).toEqual([['US','advanced'],['CN','advanced']]);
  expect(m.runReview.mock.calls.map(c=>c.slice(1))).toEqual([['US','2026-10',{preview:false}],['CN','2026-10',{preview:false}]]);
  expect(m.runReview.mock.calls[0][0]).toEqual({port:PORT,db,codeVersion:'abc123'});
 });
 it('manual unit with preview',async()=>{
  const out=await json(await cron(req('?month=2026-09&region=CN&preview=1')));
  expect(m.runReview.mock.calls.map(c=>c.slice(1))).toEqual([['CN','2026-09',{preview:true}]]);
  expect(out).toMatchObject({ok:true,month:'2026-09',preview:true,receipts:[{region:'CN',outcome:'preview'}]});
 });
 it('a failed unit is reported by code only and turns the response into 500; the other region still runs',async()=>{
  m.runReview.mockResolvedValueOnce({region:'US',month:'2026-10',outcome:'failed',status:null,manifest_hash:null,manifest_id:null,result_id:null,generation:null,error:'secret detail from the port'});
  const r=await cron(req(''));
  expect(r.status).toBe(500);
  const text=await r.text();
  expect(text).not.toContain('secret detail');
  const out=JSON.parse(text) as {ok:boolean;receipts:{region:string;outcome:string;code?:string}[]};
  expect(out.ok).toBe(false);
  expect(out.receipts.map(x=>[x.region,x.outcome,x.code])).toEqual([['US','failed','review_failed'],['CN','advanced',undefined]]);
 });
 it('refuses without a code version',async()=>{
  m.code.mockReturnValue(null);
  const r=await cron(req(''));expect(r.status).toBe(503);expect(await codeOf(r)).toBe('code_version_unavailable');
 });
 it('vercel.json schedules the review cron on the 3rd at 06:00 UTC',()=>{
  const v=JSON.parse(readFileSync(resolve(process.cwd(),'vercel.json'),'utf8')) as {crons:{path:string;schedule:string}[]};
  expect(v.crons).toContainEqual({path:'/api/cron/macro-review',schedule:'0 6 3 * *'});
 });
});

describe('route helpers',()=>{
 it('readParams: whitelist and no repeats',()=>{
  expect([...readParams(new URL('https://a/x?region=US'),['region'])]).toEqual([['region','US']]);
  expect(()=>readParams(new URL('https://a/x?a=1'),['region'])).toThrow(ParamError);
  expect(()=>readParams(new URL('https://a/x?region=US&region=CN'),['region'])).toThrow(ParamError);
 });
 it('months',()=>{
  expect(reviewAsOfDate('2026-10')).toBe('2026-11-03');expect(reviewAsOfDate('2026-12')).toBe('2027-01-03');
  expect(lastClosedMonth(new Date('2026-01-03T00:00:00Z'))).toBe('2025-12');expect(lastClosedMonth(new Date('2026-01-02T23:59:59Z'))).toBe('2025-11');
  expect(isClosedMonth('2026-10',new Date('2026-11-03T00:00:00Z'))).toBe(true);expect(isClosedMonth('2026-10',new Date('2026-11-02T23:59:59Z'))).toBe(false);
  expect(isClosedMonth('2026-11',new Date('2026-11-30T23:59:59Z'))).toBe(false);
  expect(monthOf('2026-01')).toBe('2026-01');expect(()=>monthOf('2026-1')).toThrow(ParamError);expect(()=>monthOf(undefined)).toThrow(ParamError);
 });
 it('window and subject ids',()=>{
  expect(windowOf(undefined)).toBe(3);expect(windowOf('1')).toBe(1);expect(()=>windowOf('12')).toThrow(ParamError);
  expect(subjectIdOf('snapshot','snap:US:2026-11-03T06:02:00Z')).toBe('snap:US:2026-11-03T06:02:00Z');
  expect(subjectIdOf('review',RID.toUpperCase())).toBe(RID);expect(()=>subjectIdOf('review','CN:2026-09')).toThrow(ParamError);
  expect(()=>subjectIdOf('snapshot','a b')).toThrow(ParamError);expect(()=>subjectIdOf('review','US:2026-13')).toThrow(ParamError);expect(()=>subjectIdOf('review',undefined)).toThrow(ParamError);
 });
 it('canonicalExplainBody lowercases only a review UUID subject and leaves every other shape untouched',()=>{
  const UP='ABCDEF01-2345-4ABC-8DEF-0123456789AB';
  expect(canonicalExplainBody({request_id:REQ,subject:{kind:'review',id:UP},locale:'zh'})).toEqual({request_id:REQ,subject:{kind:'review',id:UP.toLowerCase()},locale:'zh'});
  const snap={request_id:REQ,subject:{kind:'snapshot',id:'Snap:US:X'},locale:'zh'};expect(canonicalExplainBody(snap)).toBe(snap);
  const odd={request_id:REQ,subject:{kind:'review',id:'CN:2026-09'},locale:'zh'};expect(canonicalExplainBody(odd)).toBe(odd);
  for(const v of [null,'x',[1],{subject:null},{subject:[]},{subject:{kind:'review',id:5}}])expect(canonicalExplainBody(v)).toBe(v);
 });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- src/app/api/macro/strategy/routes.test.ts`
Expected: FAIL. The suite cannot import `@/app/api/cron/macro-review/route` (no route files and no `route-helpers.ts` yet).

- [ ] **Step 7: Implement `route-helpers.ts`**

Create `src/lib/macro/strategy/route-helpers.ts`:

```ts
// src/lib/macro/strategy/route-helpers.ts
// HTTP glue for /api/macro/strategy/** and /api/cron/macro-review (spec §8, §9.1). Decision order of every read route:
// session (401 unauthorized) → MACRO_STRATEGY_ENABLED (404 strategy_disabled) → foundation (503
// macro_foundation_unavailable while strategyPort() is null) → parameters (400 invalid_parameter:<name>) → judgment layer.
// POST /explanations stops after the flag: the idempotent replay runs inside handleExplainRequest before its own
// foundation check (spec §6.3 step 2). Combined routes (transmission, review detail) always answer 200 with
// judgment_status; only /deviations answers 404 judgments_disabled / 503 judgments_unavailable. With the judgment layer
// off no F4 client is built. Error bodies are {error:{code,message}} and never carry server messages.
import {NextResponse} from 'next/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';
import {getServerSupabase} from '@/lib/supabase/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import type {Bilingual,Boundary,DeviationCase,F4Summary,JudgmentStatus,Region,ReviewResult,ReviewStatus} from './contract';
import {supabaseStrategyDb,type StrategyDb} from './db';
import {createF4Client,type F4Client} from './f4-client';
import {judgmentsEnabled,strategyEnabled} from './flags';
import {monthCutoff,prevMonth} from './manifest';
import {strategyPort,type StrategyReadPort} from './port';
export const READ_HEADERS={'Cache-Control':'private, max-age=300'};
export const NO_STORE={'Cache-Control':'private, no-store'};
// ---- response shapes shared with the UI (spec §8)
export interface ReviewIndexItem{region:Region;month:string;status:ReviewStatus;generation:number;result_id:string;updated_at:string}
export interface ReviewIndexResponse{items:ReviewIndexItem[]}
/** names = the review manifest's frozen catalog names, for the fact sentence templates (spec §6.3 renderFact). */
export interface ReviewDetailResponse{result:ReviewResult;manifest_id:string;generation:number;names:{id:string;name:Bilingual}[];judgment_status:JudgmentStatus;f4?:{summary:F4Summary}}
export interface DeviationsResponse{cases:DeviationCase[];incomplete:boolean}
export function errorResponse(code:string,message:string,status:number):NextResponse{
 return NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
}
export class ParamError extends Error{constructor(readonly param:string){super(`invalid_parameter:${param}`);this.name='ParamError';}}
export function failureResponse(e:unknown):NextResponse{
 if(e instanceof ParamError)return errorResponse(`invalid_parameter:${e.param}`,'invalid parameter',400);
 return errorResponse('strategy_failed','macro strategy request failed',500);
}
// ---- parameters (whitelist; a repeated or unknown parameter is a 400)
export function readParams(url:URL,allowed:readonly string[]):Map<string,string>{
 const out=new Map<string,string>();
 for(const [k,v] of url.searchParams){if(!allowed.includes(k)||out.has(k))throw new ParamError(k);out.set(k,v);}
 return out;
}
export function regionOf(v:string|undefined,name='region'):Region{if(v==='US'||v==='CN')return v;throw new ParamError(name);}
const MONTH_RE=/^(\d{4})-(0[1-9]|1[0-2])$/;
export function monthOf(v:string|undefined,name='month'):string{if(v!==undefined&&MONTH_RE.test(v)&&v>='2000-01')return v;throw new ParamError(name);}
export function windowOf(v:string|undefined):1|3|6{if(v===undefined)return 3;if(v==='1'||v==='3'||v==='6')return Number(v) as 1|3|6;throw new ParamError('window');}
const BOUNDARIES:readonly Boundary[]=['event_day','first_trading_day','month_end'];
export function boundaryOf(v:string|undefined):Boundary{if(v===undefined)return 'event_day';if((BOUNDARIES as readonly string[]).includes(v))return v as Boundary;throw new ParamError('boundary');}
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidOf(v:string|undefined,name:string):string{if(v!==undefined&&UUID_RE.test(v))return v.toLowerCase();throw new ParamError(name);}
export function subjectKindOf(v:string|undefined):'snapshot'|'review'{if(v==='snapshot'||v==='review')return v;throw new ParamError('subject_kind');}
/** Review subjects are immutable review result ids (uuid; Task 11 handleExplainRequest); snapshot ids are P1 text ids. */
export function subjectIdOf(kind:'snapshot'|'review',v:string|undefined):string{
 if(v===undefined)throw new ParamError('subject_id');
 if(kind==='review')return uuidOf(v,'subject_id');
 if(/^[A-Za-z0-9:._-]{1,200}$/.test(v))return v;
 throw new ParamError('subject_id');
}
/** POST body → body with the review subject UUID in canonical (lowercase) form, so the payload hash, the stored subject_id
 *  and GET's lookup agree whatever case the client sent (PostgreSQL uuid compares case-insensitively, the text column does
 *  not). Any other shape is returned untouched for the handler's own validation. */
export function canonicalExplainBody(raw:unknown):unknown{
 if(typeof raw!=='object'||raw===null||Array.isArray(raw))return raw;
 const subject=(raw as {subject?:unknown}).subject;
 if(typeof subject!=='object'||subject===null||Array.isArray(subject))return raw;
 const {kind,id}=subject as {kind?:unknown;id?:unknown};
 if(kind!=='review'||typeof id!=='string'||!UUID_RE.test(id))return raw;
 return {...(raw as object),subject:{...(subject as object),id:id.toLowerCase()}};
}
// ---- months (UTC; the review cutoff rule is manifest.ts monthCutoff, spec §6.2)
/** The F4 as-known date of a review (spec §6.2): the date of its cutoff, the 3rd of the next month. */
export const reviewAsOfDate=(month:string):string=>monthCutoff(month).slice(0,10);
/** A month is closed for review once its cutoff (the 3rd of the next month, 00:00:00Z) has passed. */
export const isClosedMonth=(month:string,now:Date):boolean=>Date.parse(monthCutoff(month))<=now.getTime();
/** The newest closed month: the scheduled review target (on the 3rd at 06:00 UTC that is the previous month). */
export function lastClosedMonth(now:Date):string{
 const prev=prevMonth(now.toISOString().slice(0,7));
 return isClosedMonth(prev,now)?prev:prevMonth(prev);
}
// ---- gates (spec §9.1)
export async function sessionOf():Promise<{userId:string;session:SupabaseClient}|null>{
 try{
  const session=await getServerSupabase();
  const {data,error}=await session.auth.getUser();
  if(error||!data.user)return null;
  return {userId:data.user.id,session:session as unknown as SupabaseClient};
 }catch{return null;}
}
export type SessionGate={ok:true;userId:string;session:SupabaseClient}|{ok:false;res:NextResponse};
export type ReadGate={ok:true;userId:string;session:SupabaseClient;port:StrategyReadPort}|{ok:false;res:NextResponse};
export async function sessionGate():Promise<SessionGate>{
 const s=await sessionOf();
 if(!s)return {ok:false,res:errorResponse('unauthorized','sign in required',401)};
 if(!strategyEnabled())return {ok:false,res:errorResponse('strategy_disabled','macro strategy is not enabled',404)};
 return {ok:true,...s};
}
export async function readGate():Promise<ReadGate>{
 const g=await sessionGate();if(!g.ok)return g;
 const port=strategyPort();
 if(!port)return {ok:false,res:errorResponse('macro_foundation_unavailable','macro data foundation is not wired',503)};
 return {...g,port};
}
// ---- dependencies
export function strategyDb(session?:SupabaseClient):StrategyDb{
 return supabaseStrategyDb({admin:getAdminSupabase() as unknown as SupabaseClient,anon:getAnonSupabase() as unknown as SupabaseClient,session});
}
export const codeVersionOrNull=():string|null=>resolveCodeVersion({allowGit:false});
export type JudgmentSection<T>={judgment_status:'disabled'}|{judgment_status:'unavailable'}|{judgment_status:'ok';value:T};
/** Judgment layer of a combined route: off → no F4 client at all; any F4 failure or an empty result → unavailable. */
export async function judgmentSection<T>(run:(f4:F4Client)=>Promise<T|null>):Promise<JudgmentSection<T>>{
 if(!judgmentsEnabled())return {judgment_status:'disabled'};
 try{const v=await run(createF4Client());return v===null?{judgment_status:'unavailable'}:{judgment_status:'ok',value:v};}
 catch{return {judgment_status:'unavailable'};}
}
```

- [ ] **Step 8: Implement the eight strategy routes**

Create `src/app/api/macro/strategy/transmission/route.ts`:

```ts
// src/app/api/macro/strategy/transmission/route.ts
// GET /api/macro/strategy/transmission?region=US|CN (spec §8, §5.1, §5.2, §9.1): one frozen transmission manifest
// (buildTransmissionManifest → putManifest, idempotent by hash; the region is frozen in its params) feeds the flow and
// the playbooks. Always 200 once the
// facts are available, with judgment_status; f4 {mark, summary} (selectF4Mark) only when 'ok'. With the judgment layer
// off nothing reaches F4 and the body has no f4 key. Neither region has an active snapshot → 404 no_published_snapshot.
import {NextResponse} from 'next/server';
import type {TransmissionResponse} from '@/lib/macro/strategy/contract';
import {buildPlaybooks,selectF4Mark} from '@/lib/macro/strategy/playbooks';
import {READ_HEADERS,codeVersionOrNull,errorResponse,failureResponse,judgmentSection,readGate,readParams,regionOf,strategyDb} from '@/lib/macro/strategy/route-helpers';
import {buildTransmission,buildTransmissionManifest} from '@/lib/macro/strategy/transmission';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const region=regionOf(readParams(new URL(req.url),['region']).get('region'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const body=await buildTransmissionManifest(g.port,{now:new Date(),codeVersion,region});
  if(!body)return errorResponse('no_published_snapshot','no published snapshot yet',404);
  const stored=await strategyDb(g.session).putManifest(body);
  const transmission=buildTransmission(stored);
  const playbooks=buildPlaybooks(stored.body,region);
  const j=await judgmentSection(async f4=>{
   const card=await f4.latestRegimeCard(region);
   if(!card)return null;
   return selectF4Mark({card,detail:await f4.judgmentDetail(card.judgment_id),snapshotId:stored.body.snapshots[region]?.snapshot_id??null});
  });
  const out:TransmissionResponse=j.judgment_status==='ok'
   ?{transmission,playbooks,judgment_status:'ok',f4:j.value}
   :{transmission,playbooks,judgment_status:j.judgment_status};
  return NextResponse.json(out,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
```

Create `src/app/api/macro/strategy/policy-response/route.ts`:

```ts
// src/app/api/macro/strategy/policy-response/route.ts
// GET /api/macro/strategy/policy-response?window=1|3|6 (default 3; spec §8, §5.3): one frozen policy_response manifest per
// window (N is in its params) → the Fed policy → US/CN asset response matrix for that window.
import {NextResponse} from 'next/server';
import {buildPolicyResponse,buildPolicyResponseManifest} from '@/lib/macro/strategy/policy-response';
import {READ_HEADERS,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb,windowOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const window=windowOf(readParams(new URL(req.url),['window']).get('window'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const stored=await strategyDb(g.session).putManifest(await buildPolicyResponseManifest(g.port,{now:new Date(),codeVersion,window}));
  return NextResponse.json(buildPolicyResponse(stored),{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
```

Create `src/app/api/macro/strategy/cycle-table/route.ts`:

```ts
// src/app/api/macro/strategy/cycle-table/route.ts
// GET /api/macro/strategy/cycle-table?boundary=event_day|first_trading_day|month_end (default event_day; spec §8, §5.5):
// one frozen cycle_table manifest per boundary (in its params) → policy action episodes × asset interval changes.
import {NextResponse} from 'next/server';
import {buildCycleTable,buildCycleTableManifest} from '@/lib/macro/strategy/cycle-table';
import {READ_HEADERS,boundaryOf,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const boundary=boundaryOf(readParams(new URL(req.url),['boundary']).get('boundary'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const stored=await strategyDb(g.session).putManifest(await buildCycleTableManifest(g.port,{now:new Date(),codeVersion,boundary}));
  return NextResponse.json(buildCycleTable(stored),{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
```

Create `src/app/api/macro/strategy/manifests/[id]/route.ts`:

```ts
// src/app/api/macro/strategy/manifests/[id]/route.ts
// GET /api/macro/strategy/manifests/<uuid> (spec §8, §4.5): the full stored manifest (public reference data).
import {NextResponse} from 'next/server';
import {READ_HEADERS,errorResponse,failureResponse,readGate,readParams,strategyDb,uuidOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  readParams(new URL(req.url),[]);
  const id=uuidOf((await params).id,'id');
  const stored=await strategyDb(g.session).manifest(id);
  if(!stored)return errorResponse('manifest_not_found','no such manifest',404);
  return NextResponse.json(stored,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
```

Create `src/app/api/macro/strategy/reviews/route.ts`:

```ts
// src/app/api/macro/strategy/reviews/route.ts
// GET /api/macro/strategy/reviews?region=US|CN (spec §8, §6.2): current review pointers of the last 36 months.
import {NextResponse} from 'next/server';
import {READ_HEADERS,failureResponse,readGate,readParams,regionOf,strategyDb,type ReviewIndexResponse} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';
const MONTHS=36;

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const region=regionOf(readParams(new URL(req.url),['region']).get('region'));
  const rows=await strategyDb(g.session).reviewIndex(region,MONTHS);
  const body:ReviewIndexResponse={items:rows.map(r=>({region,...r}))};
  return NextResponse.json(body,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
```

Create `src/app/api/macro/strategy/reviews/[region]/[month]/route.ts`:

```ts
// src/app/api/macro/strategy/reviews/[region]/[month]/route.ts
// GET /api/macro/strategy/reviews/<US|CN>/<YYYY-MM> (spec §8, §6.2): the result the current pointer names, its
// generation and the frozen catalog names of its manifest (fact sentence templates). The judgment section is read at
// view time and never stored: the F4 card known at the review cutoff date (the 3rd of the next month; view=as_known) as a number-free summary
// (selectF4Mark's summary; no snapshot binding here). No pointer → 404 review_not_found.
import {NextResponse} from 'next/server';
import {selectF4Mark} from '@/lib/macro/strategy/playbooks';
import {READ_HEADERS,errorResponse,failureResponse,judgmentSection,monthOf,readGate,readParams,regionOf,reviewAsOfDate,strategyDb,type ReviewDetailResponse} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{region:string;month:string}>}){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  readParams(new URL(req.url),[]);
  const raw=await params;
  const region=regionOf(raw.region),month=monthOf(raw.month);
  const db=strategyDb(g.session);
  const current=await db.reviewCurrent(region,month);
  if(!current)return errorResponse('review_not_found','no review for this month',404);
  const manifest=await db.manifest(current.result.manifest_id);
  const j=await judgmentSection(async f4=>{
   const card=await f4.latestRegimeCard(region,{asOf:reviewAsOfDate(month)});
   if(!card)return null;
   const m=selectF4Mark({card,detail:await f4.judgmentDetail(card.judgment_id),snapshotId:null});
   return m?{summary:m.summary}:null;
  });
  const body:ReviewDetailResponse={result:current.result,manifest_id:current.result.manifest_id,generation:current.generation,
   names:(manifest?.body.catalog??[]).map(d=>({id:d.id,name:d.name})),judgment_status:j.judgment_status,...(j.judgment_status==='ok'?{f4:j.value}:{})};
  return NextResponse.json(body,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
```

Create `src/app/api/macro/strategy/deviations/route.ts`:

```ts
// src/app/api/macro/strategy/deviations/route.ts
// GET /api/macro/strategy/deviations?region=US|CN (spec §8, §6.4, §9.1): the only pure judgment route. Judgment layer
// off → 404 judgments_disabled (F4 is never called); any F4 failure → 503 judgments_unavailable.
import {NextResponse} from 'next/server';
import type {Region} from '@/lib/macro/strategy/contract';
import {listDeviationCases} from '@/lib/macro/strategy/deviations';
import {createF4Client} from '@/lib/macro/strategy/f4-client';
import {judgmentsEnabled} from '@/lib/macro/strategy/flags';
import {READ_HEADERS,errorResponse,failureResponse,readGate,readParams,regionOf,type DeviationsResponse} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 let region:Region;
 try{region=regionOf(readParams(new URL(req.url),['region']).get('region'));}catch(e){return failureResponse(e);}
 if(!judgmentsEnabled())return errorResponse('judgments_disabled','the judgment layer is off',404);
 try{
  const r=await listDeviationCases(createF4Client(),region);
  const body:DeviationsResponse={cases:r.cases,incomplete:r.incomplete};
  return NextResponse.json(body,{headers:READ_HEADERS});
 }catch{return errorResponse('judgments_unavailable','the judgment layer is unavailable',503);}
}
```

Create `src/app/api/macro/strategy/explanations/route.ts`:

```ts
// src/app/api/macro/strategy/explanations/route.ts
// POST /api/macro/strategy/explanations {request_id, subject:{kind, id}, locale} (spec §6.3, §8): session → flag →
// handleExplainRequest (Task 11), which validates the body, replays an existing (user, request_id) run before the code
// version, foundation and subject checks (a replay needs no code version), and runs the metered call through
// productionLlmDeps. Responses are projections (or {error, explanation?}), private, no-store. Review subjects are
// immutable review result ids, canonicalized to lowercase before the handler (hash, storage) exactly as GET's uuidOf does. GET ?subject_kind=snapshot|review&subject_id= → first recoverUserExplanations (at most
// three of the caller's running rows whose provider output is recorded are finished from that output and settled — the
// provider is never called again; plan audit R2-1), then macro_expire_explanations(user) (admin; a run left running for
// more than five minutes without a recorded completion becomes abandoned → failed, so a reload never shows a dead run as
// running), then the caller's own projections (RLS), newest 20.
import {NextResponse} from 'next/server';
import {handleExplainRequest,recoverUserExplanations} from '@/lib/macro/strategy/explain-request';
import {productionLlmDeps} from '@/lib/macro/strategy/llm-deps';
import {strategyPort} from '@/lib/macro/strategy/port';
import {NO_STORE,canonicalExplainBody,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,sessionGate,strategyDb,subjectIdOf,subjectKindOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';
export const maxDuration=60;
const LIST_LIMIT=20;

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const p=readParams(new URL(req.url),['subject_kind','subject_id']);
  const kind=subjectKindOf(p.get('subject_kind'));
  const id=subjectIdOf(kind,p.get('subject_id'));
  const db=strategyDb(g.session);
  await recoverUserExplanations({db,llm:productionLlmDeps(g.userId)},g.userId);
  await db.expireExplanations(g.userId);
  const items=await db.explanationsOf('session',kind,id,LIST_LIMIT);
  return NextResponse.json({items},{headers:NO_STORE});
 }catch(e){return failureResponse(e);}
}

export async function POST(req:Request){
 const g=await sessionGate();if(!g.ok)return g.res;
 let body:unknown;
 try{body=await req.json();}catch{return errorResponse('invalid_body','body must be JSON',400);}
 try{
  const r=await handleExplainRequest({db:strategyDb(g.session),port:strategyPort(),llm:productionLlmDeps(g.userId),now:()=>new Date(),codeVersion:codeVersionOrNull()},g.userId,canonicalExplainBody(body));
  return NextResponse.json(r.body,{status:r.status,headers:NO_STORE});
 }catch(e){
  if(e instanceof Error&&e.message==='not authenticated')return errorResponse('unauthorized','sign in required',401);
  return failureResponse(e);
 }
}
```

- [ ] **Step 9a: Integration test for the explanation routes (real handler + real production LlmDeps)**

Create `src/app/api/macro/strategy/explanations.integration.test.ts`. Only the lowest layers are faked: the provider (`chatResolved`), the billing transport (`getAdminSupabase().rpc` for `begin_usage_run` / `finalize_usage_run`, the profile / usage reads of `checkQuota`, the cost reservation) and storage (memory `StrategyDb` behind a failure-injecting proxy). It covers a validation rejection billed as completed, a finish failure followed by a POST replay with no second provider call, a 409 payload conflict, a 429 quota stop, and the uppercase review UUID POST→GET regression (Task 12 Codex round 1 #1 and #2).

```ts
// POST/GET /api/macro/strategy/explanations through the real route, real handleExplainRequest, real productionLlmDeps
// (limiter, metering, quota.ts). Only the lowest layers are faked: the provider (chatResolved), the billing transport
// (admin rpc begin_usage_run / finalize_usage_run, the profile / usage reads checkQuota makes, the cost reservation) and
// storage (memory StrategyDb with injected failures). Plan Task 12 Codex round 1 (#1 subject case, #2 integration paths).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {StrategyDbError,memoryStrategyDb,type StrategyDb} from '@/lib/macro/strategy/db';
import {memoryStrategyPort} from '@/lib/macro/strategy/port';
import {runReview} from '@/lib/macro/strategy/review';
import {daily,fixture,monthly,snap} from '@/lib/macro/strategy/testing/fixture';

const m=vi.hoisted(()=>({user:vi.fn(),chat:vi.fn(),rpc:vi.fn(),used:{n:0},db:null as unknown,port:null as unknown}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:m.user},from:(table:string)=>
 table==='profiles'
  ?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{plan:'free',role:null,plan_expires_at:null},error:null})})})}
  :{select:()=>{const q:Record<string,unknown>={};for(const f of ['eq','gte']){q[f]=()=>q;}q.lt=async()=>({count:m.used.n,error:null});return q;}}})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({rpc:m.rpc})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:()=>'abc123'}));
vi.mock('@/lib/macro/strategy/port',async(orig)=>({...await orig<typeof import('@/lib/macro/strategy/port')>(),strategyPort:()=>m.port}));
vi.mock('@/lib/macro/strategy/db',async(orig)=>({...await orig<typeof import('@/lib/macro/strategy/db')>(),supabaseStrategyDb:()=>m.db}));
vi.mock('@/lib/llm/resolve',()=>({resolveLlm:async()=>({provider:'deepseek',model:'deepseek-v4-flash',protocol:'openai',source:'env',baseUrl:'https://provider.invalid',apiKey:'k'})}));
vi.mock('@/lib/data/sources/llm',()=>({chatResolved:m.chat}));
vi.mock('@/lib/billing/cost-budget',async(orig)=>({...await orig<typeof import('@/lib/billing/cost-budget')>(),
 getBudgetConfig:()=>({dailyLimitMicrormb:8_800_000,usdCnyMicros:7_200_000,reservationTtlSeconds:60}),
 reserveCostBudget:async()=>({reservationId:'r1',reservedMicrormb:1000,markIncurred:async()=>{},finalizeIncurred:async()=>{},settle:async()=>({costMicrormb:300,usageEstimated:false}),release:async()=>{}})}));

import {GET as listExplanations,POST as postExplanation} from './explanations/route';

const USER='11111111-1111-4111-8111-111111111111',REQ='22222222-2222-4222-8222-222222222222';
const ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_UNRATE','2026-09',['4.3'])];
const SNAP=snap('US','2026-10-15T06:00:00Z',ROWS.map(o=>o.observation_id));
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',[['2025-12-11','3.75'],['2026-09-18','4']]),...daily('US_FED_TARGET_LOWER_D',[['2025-12-11','3.5'],['2026-09-18','3.75']])];
const VALID=JSON.stringify({points:[{fact_ids:['cov:counts'],hypothesis:'覆盖不全可能削弱该月读数的代表性'}]});
const INVALID=JSON.stringify({points:[{fact_ids:['no:such:fact'],hypothesis:'一个引用了不存在事实的假设'}]});
const USAGE={inputTokens:100,cacheHitInputTokens:10,cacheMissInputTokens:90,outputTokens:50,estimated:false};
const U='https://alpha.example/api/macro/strategy/explanations';
const post=(body:unknown)=>new Request(U,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const get=(id:string)=>new Request(`${U}?subject_kind=review&subject_id=${id}`);
const bodyOf=(rid:string,o:{locale?:'zh'|'en'}={})=>({request_id:REQ,subject:{kind:'review',id:rid},locale:o.locale??'zh'});

type MemDb=ReturnType<typeof memoryStrategyDb>;
/** Memory StrategyDb whose named methods throw once per queued failure (an rpc failure after the database state is unchanged). */
function failing(db:MemDb,queue:Partial<Record<keyof StrategyDb,number>>):MemDb{
 return new Proxy(db,{get(t,k){
  const v=Reflect.get(t,k) as unknown;
  if(typeof v!=='function')return v;
  return (...a:unknown[])=>{
   const left=queue[k as keyof StrategyDb]??0;
   if(left>0){queue[k as keyof StrategyDb]=left-1;return Promise.reject(new StrategyDbError('rpc_failed',`injected:${String(k)}`));}
   return (v as (...x:unknown[])=>unknown).apply(t,a);
  };
 }});
}
const rpcCalls=(fn:string)=>m.rpc.mock.calls.filter(c=>c[0]===fn).map(c=>c[1] as Record<string,unknown>);
let mem:MemDb,rid:string;

beforeEach(async()=>{
 vi.clearAllMocks();
 process.env.MACRO_STRATEGY_ENABLED='1';m.used.n=0;
 m.user.mockResolvedValue({data:{user:{id:USER}},error:null});
 m.rpc.mockResolvedValue({data:null,error:null});
 m.chat.mockResolvedValue({content:VALID,usage:USAGE});
 mem=memoryStrategyDb();mem._userId(USER);m.db=mem;
 m.port=memoryStrategyPort(fixture({snapshots:[SNAP],observations:[...ROWS,...EVENTS]}));
 rid=(await runReview({port:m.port as never,db:mem,codeVersion:'abc123'},'US','2026-10',{preview:false})).result_id!;
});
afterEach(()=>{delete process.env.MACRO_STRATEGY_ENABLED;});

describe('POST /explanations — real handler + production LlmDeps over a fake provider and billing transport',()=>{
 it('validation rejection is a completed call: 200 rejected, billed completed, evidence persisted, one provider call',async()=>{
  m.chat.mockResolvedValue({content:INVALID,usage:USAGE});
  const r=await postExplanation(post(bodyOf(rid)));
  expect(r.status).toBe(200);
  const p=await r.json() as {explanation_id:string;state:string;failure_codes:string[]};
  expect(p.state).toBe('rejected');expect(p.failure_codes.length).toBeGreaterThan(0);
  expect(m.chat).toHaveBeenCalledTimes(1);
  expect(rpcCalls('begin_usage_run')).toHaveLength(1);
  const fin=rpcCalls('finalize_usage_run');
  expect(fin).toHaveLength(1);
  expect(fin[0]).toMatchObject({p_idempotency_key:p.explanation_id,p_user_id:USER,p_feature:'perspectives',p_status:'completed',p_byo:false,
   p_input_tokens:100,p_output_tokens:50,p_cost_micrormb:300,p_usage_estimated:false});
  const run=mem._run(p.explanation_id);
  expect(run).toMatchObject({state:'rejected',finalized:true,raw_output:{content:INVALID,provider:'deepseek'},finalize_payload:{status:'completed',costMicrormb:300}});
 });

 it('finish failure: the call is still settled once; a POST replay finishes from the recorded output without a second provider call',async()=>{
  m.db=failing(mem,{finishExplanation:1});
  const first=await postExplanation(post(bodyOf(rid)));
  expect(first.status).toBe(500);
  expect(((await first.json()) as {error:{code:string}}).error.code).toBe('strategy_failed');
  const claimed=await mem.runOf(USER,REQ);
  expect(claimed).not.toBeNull();
  const id=claimed!.explanation_id;
  expect(mem._run(id)).toMatchObject({state:'running',finalized:true,raw_output:{content:VALID},finalize_payload:{status:'completed',costMicrormb:300}});
  expect(rpcCalls('finalize_usage_run')).toHaveLength(1);
  const replay=await postExplanation(post(bodyOf(rid)));
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({explanation_id:id,state:'accepted'});
  expect(mem._run(id)).toMatchObject({state:'accepted',finalized:true});
  expect(m.chat).toHaveBeenCalledTimes(1);                       // the provider was never called again
  expect(rpcCalls('begin_usage_run')).toHaveLength(1);
  expect(rpcCalls('finalize_usage_run')).toHaveLength(1);        // settled once, replay settles nothing new
  expect(rpcCalls('finalize_usage_run')[0].p_status).toBe('completed');
 });

 it('the same request id with a different payload is 409 payload_conflict and starts no second run',async()=>{
  expect((await postExplanation(post(bodyOf(rid)))).status).toBe(200);
  const r=await postExplanation(post(bodyOf(rid,{locale:'en'})));
  expect(r.status).toBe(409);
  expect(((await r.json()) as {error:{code:string}}).error.code).toBe('payload_conflict');
  expect(m.chat).toHaveBeenCalledTimes(1);
  expect(rpcCalls('begin_usage_run')).toHaveLength(1);
  expect(rpcCalls('finalize_usage_run')).toHaveLength(1);
 });

 it('platform quota exhausted is 429 quota_exceeded before any claim, usage run or provider call',async()=>{
  m.used.n=5;                                                    // free plan perspectives limit
  const r=await postExplanation(post(bodyOf(rid)));
  expect(r.status).toBe(429);
  expect(await r.json()).toEqual({error:{code:'quota_exceeded',message:'5/5'}});
  expect(m.chat).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(await mem.runOf(USER,REQ)).toBeNull();
 });
});

describe('review subject UUID case (Codex #1)',()=>{
 it('POST with an uppercase UUID stores the lowercase subject; GET finds it with either spelling',async()=>{
  const upper=rid.toUpperCase();
  expect(upper).not.toBe(rid);
  const r=await postExplanation(post(bodyOf(upper)));
  expect(r.status).toBe(200);
  const p=await r.json() as {explanation_id:string;subject_id:string};
  expect(p.subject_id).toBe(rid);
  for(const id of [upper,rid]){
   const list=await listExplanations(get(id));
   expect(list.status).toBe(200);
   expect(((await list.json()) as {items:{explanation_id:string}[]}).items.map(i=>i.explanation_id)).toEqual([p.explanation_id]);
  }
  expect(m.chat).toHaveBeenCalledTimes(1);
 });
 it('a replay with the other spelling of the UUID is the same payload (200, no conflict, no second call)',async()=>{
  expect((await postExplanation(post(bodyOf(rid.toUpperCase())))).status).toBe(200);
  const replay=await postExplanation(post(bodyOf(rid)));
  expect(replay.status).toBe(200);
  expect(m.chat).toHaveBeenCalledTimes(1);
 });
});
```

Run: `npm test -- src/app/api/macro/strategy/explanations.integration.test.ts`
Expected: PASS, `Tests  6 passed (6)`. Without `canonicalExplainBody` in the POST route the two "review subject UUID case" tests fail.

- [ ] **Step 9: Implement the review cron and register it in `vercel.json`**

Create `src/app/api/cron/macro-review/route.ts`:

```ts
// src/app/api/cron/macro-review/route.ts
// Monthly review generation (spec §6.2, §8): vercel.json `0 6 3 * *` builds the newest closed month (review cutoff = the 3rd
// of the next month 00:00:00Z has passed) for US then CN;
// ?month=YYYY-MM&region=US|CN reruns one unit by hand; ?preview=1 computes with zero writes. Order: CRON_SECRET bearer
// (401) → MACRO_STRATEGY_ENABLED (404) → foundation (503) → parameters (400) → code version (503). runReview (Task 9)
// logs its own failed attempts and never moves the pointer on failure; the HTTP receipt carries codes and counts only
// (a failed unit's message is replaced by review_failed) and any failed unit makes the response 500.
import {NextResponse} from 'next/server';
import {authorizedCronRequest} from '@/lib/observability/cron-auth';
import type {Region} from '@/lib/macro/strategy/contract';
import {strategyEnabled} from '@/lib/macro/strategy/flags';
import {strategyPort} from '@/lib/macro/strategy/port';
import {runReview,type ReviewReceipt} from '@/lib/macro/strategy/review';
import {ParamError,codeVersionOrNull,errorResponse,failureResponse,isClosedMonth,lastClosedMonth,monthOf,readParams,regionOf,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';
export const maxDuration=300;

const publicReceipt=(r:ReviewReceipt):Omit<ReviewReceipt,'error'>&{code?:string}=>{const {error,...rest}=r;return error===undefined?rest:{...rest,code:'review_failed'};};

export async function GET(req:Request){
 if(!authorizedCronRequest(req.headers.get('authorization'),process.env.CRON_SECRET))return errorResponse('unauthorized','Unauthorized',401);
 if(!strategyEnabled())return errorResponse('strategy_disabled','macro strategy is not enabled',404);
 const port=strategyPort();
 if(!port)return errorResponse('macro_foundation_unavailable','macro data foundation is not wired',503);
 const now=new Date();
 let month:string,regions:Region[],preview:boolean;
 try{
  const p=readParams(new URL(req.url),['month','region','preview']);
  month=p.has('month')?monthOf(p.get('month')):lastClosedMonth(now);
  if(!isClosedMonth(month,now))throw new ParamError('month');
  regions=p.has('region')?[regionOf(p.get('region'))]:['US','CN'];
  const pv=p.get('preview');
  if(pv!==undefined&&pv!=='1')throw new ParamError('preview');
  preview=pv==='1';
 }catch(e){return failureResponse(e);}
 const codeVersion=codeVersionOrNull();
 if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
 const db=strategyDb();
 const receipts:ReturnType<typeof publicReceipt>[]=[];
 for(const region of regions)receipts.push(publicReceipt(await runReview({port,db,codeVersion},region,month,{preview})));   // sequential: one unit per region
 const ok=receipts.every(r=>r.outcome!=='failed');
 return NextResponse.json({ok,month,preview,receipts},{status:ok?200:500,headers:{'Cache-Control':'no-store'}});
}
```

Modify `vercel.json` (append only). Replace the last entry and the closing bracket of `crons`:

```json
    {
      "path": "/api/cron/facts-sync?market=CN",
      "schedule": "35 */4 * * *"
    }
  ]
```

with:

```json
    {
      "path": "/api/cron/facts-sync?market=CN",
      "schedule": "35 */4 * * *"
    },
    {
      "path": "/api/cron/macro-review",
      "schedule": "0 6 3 * *"
    }
  ]
```

If a sibling session has appended entries after the facts-sync CN entry in the meantime, append the macro-review object after the current last entry instead (with a comma after the entry before it). Check that the file still parses: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` prints nothing and exits 0.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm test -- src/app/api/macro/strategy src/lib/macro/strategy/llm-deps.test.ts`
Expected: PASS, `Tests  92 passed (92)` (routes 77, explanations integration 6, llm-deps 9).

Run: `npm test -- src/lib/macro/strategy`
Expected: PASS; no earlier task's suite fails.

- [ ] **Step 11: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0 with no errors and no warnings.

- [ ] **Step 12: Commit**

```bash
git add src/lib/macro/strategy/route-helpers.ts src/lib/macro/strategy/llm-deps.ts src/lib/macro/strategy/llm-deps.test.ts src/app/api/macro/strategy src/app/api/cron/macro-review/route.ts vercel.json
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): strategy API routes, review cron and metered LLM deps (spec 2026-11-07 §8, §9.1, §6.3)

route-helpers.ts applies the capability matrix in one order for every route:
session, MACRO_STRATEGY_ENABLED, foundation, parameters, judgment layer.
Combined routes stay 200 with judgment_status and build no F4 client while
the judgment layer is off; only /deviations answers 404/503 for it. Fact
routes freeze one manifest per kind through putManifest and render the view
from the stored manifest. The review cron runs the newest closed month for
US then CN, supports month/region/preview, and reports failures by code.
llm-deps.ts wraps the perspectives metering sequence call for call and
throws LlmCallError with the failed call's accounting.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 13: i18n domain, strategy view model and the strategy components

**Files:**
- Create: `messages/zh/macroStrategy.json`, `messages/en/macroStrategy.json`
- Modify: `src/i18n/request.ts` (add `'macroStrategy'` to `MESSAGE_DOMAINS` inside a `// MACRO-P3` … `// /MACRO-P3` block)
- Create: `src/components/macro/strategy/strategy-messages.test.ts`
- Create: `src/components/macro/strategy/strategy-view-model.ts`, `src/components/macro/strategy/strategy-view-model.test.ts`
- Create: `src/components/macro/strategy/use-strategy-t.ts`, `src/components/macro/strategy/use-strategy-fetch.ts`
- Create: `src/components/macro/strategy/DependencyState.tsx`, `EvidencePairDrawer.tsx`, `F4Summary.tsx`, `TransmissionFlow.tsx`, `PlaybookGrid.tsx`, `PolicyResponseMatrix.tsx`, `CycleReturnsTable.tsx`, `ReviewIndex.tsx`, `DeviationCases.tsx`, `ExplanationPanel.tsx`, `ReviewView.tsx`, `StrategyScreens.tsx` (all under `src/components/macro/strategy/`)

Design decisions (spec §3, §10, §3.8, canvas `https://claude.ai/artifact/2s8t4QpQGAGCXWZNfQ2TUW`, read 2026-11-06):
- **Canvas layout followed**: header line (manifest · cutoff · catalog · method), link tabs (宏观工作台 · 传导 · 历史 · 复盘), US / CN switch; transmission flow as six columns of node cards (badge word, name, mono value, period, reason; dashed border for missing / restricted / not-in-catalog / assumption, a brass-free card for observed / derived), an assumption edge line per stage; four neutral playbook cards (triggers in mono, mechanism, implications, disclaimer, watch links); the response matrix (policy rows × dimension columns, median + "q1 至 q3 · n", "n=… < 5 逐事件", restricted / not-in-catalog words, the QE / QT row as one spanning cell) with a 1 / 3 / 6 month switch and the footer; the history table with a boundary switch, its definition, episode header lines and tags (左删失 / 进行中 / 数据缺口), cells with "起值 (日期) → 止值 (日期)", the per-column median chart with a table toggle and the first_seen footer; the review index grid (month × US / CN); the single-month review sections, the judgment section, deviation cases and the explanation panel; the derived-node and per-event drawers.
- **Superseded canvas details** (spec draft 3 wins): no "已通过事实校验" header (the header names subject, manifest, model, prompt and validator, and the disclaimer says the hypotheses are unverified); the explanation is split into system fact sentences and model hypotheses citing fact numbers; no "本快照命中" rule-hit table and no F4 numbers ("有效样本 3/100" is dropped); event-window changes are simple percentages, not `ln`; the history table is "政策行动段", not "周期".
- **Plan-audit write-back**: the review page's `ExplanationPanel` binds to the displayed immutable `result.result_id` (never `<region>:<YYYY-MM>`; audit #5); the panel's running state tells the user that a refresh after five minutes marks a dead run failed (GET runs `macro_expire_explanations`), and the failed state offers a new request id (audit #14); pct changes are shown from the exact ratio with one rounding (`formatPctRatio`; audit #10); an empty episode list caused by a truncated event history shows `history.eventsTruncated`, never `history.noEpisodes` (`episodesEmptyKey`; audit #11).
- **Tokens** (`DESIGN.md`, `globals.css`): `Panel` (`data-density="data"`), `Tag`, `Button`; colours only through `text-text-dim`, `border-border`, `bg-bg-card`, `bg-bg-elevated`, `text-accent`, `text-warn` and `var(--…)`; brass (`--border-active`, `--accent-wash`, `Tag tone="accent"`) only for the marked playbook card and the selected switch button; `rounded` / `rounded-md` (≤ 6px); every number `font-mono tabular-nums`; up / down washes (three levels, `color-mix` on `--up` / `--down`, which follow `data-color-scheme`) only on asset changes in the matrix and the history table; macro indicator values are never coloured.
- **Every chart has a table view**: the transmission flow has a table toggle; the median chart has a table toggle.
- **Mobile** (spec §3.7): the flow stacks below `lg`; playbook cards become `<details>` below `sm`; the matrix and the history table become one list per column below `sm` (640px); the explanation panel is full width.
- **Loading** follows the existing `(app)` pages: thin server pages (Task 14), client screens that fetch the strategy APIs (`useStrategyFetch` → `loadStateOf`, which maps the §9.1 error codes to page states).
- The explanation panel reuses a request id only to retry after a network failure (`nextRequestId`), shows the remaining runs of the shared `perspectives` quota from the existing `GET /api/usage/today` (`usage.perspectives.{used,limit}`, `-1` = unlimited), and shows a failed run's projection when an error body carries `explanation`.
- No component reads `process.env` or imports a server-only module (`port`, `db`, `flags`, `llm-deps`, `route-helpers` values, `f4-client`, `@/lib/supabase/*`); type-only imports of `route-helpers` response shapes are allowed. Task 14's page test enforces this.

- [ ] **Step 1: Write the failing message test**

Create `src/components/macro/strategy/strategy-messages.test.ts`:

```ts
// macroStrategy i18n domain (spec §10): zh/en key and placeholder parity, registration inside the MACRO-P3 block,
// every enum the UI renders has its message, and no copy uses FORBIDDEN_TERMS (Chinese as substrings, English on word
// boundaries, case-insensitive: the validator's own rule).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import type {Boundary,DiffKind,ExclusionReason,NodeState,NewlySubkind,Regime} from '@/lib/macro/strategy/contract';
import {FORBIDDEN_TERMS} from '@/lib/macro/strategy/explain-validate';
import {KNOWN_FAILURES,REVIEW_SECTIONS,type PanelState} from './strategy-view-model';
const load=(l:'zh'|'en'):unknown=>JSON.parse(readFileSync(resolve(process.cwd(),'messages',l,'macroStrategy.json'),'utf8'));
function flat(v:unknown,p=''):[string,string][]{
 if(typeof v==='string')return [[p,v]];
 if(typeof v!=='object'||v===null||Array.isArray(v))throw new Error(`non-string message at ${p}`);
 return Object.entries(v).flatMap(([k,c])=>flat(c,p?`${p}.${k}`:k));
}
const ph=(s:string)=>[...s.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]).sort();
const zh=new Map(flat(load('zh'))),en=new Map(flat(load('en')));
const hits=(text:string)=>FORBIDDEN_TERMS.filter(term=>/[^\x00-\x7f]/.test(term)?text.includes(term):new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text));
const FAMILIES:Record<string,readonly string[]>={
 state:['observed','derived','assumption','missing','restricted','not_in_catalog'] satisfies readonly NodeState[],
 'matrix.exclusion':['incomplete_window','overlap','non_positive_base','missing_endpoint'] satisfies readonly ExclusionReason[],
 'matrix.rows':['hike','cut','qe_qt'],
 'history.missing':['out_of_coverage','degenerate','non_positive_base','history_truncated','month_not_closed'],
 'history.boundary':['event_day','first_trading_day','month_end'] satisfies readonly Boundary[],
 'history.boundaryDef':['event_day','first_trading_day','month_end'] satisfies readonly Boundary[],
 'history.direction':['hike','cut'],
 'review.section':REVIEW_SECTIONS,
 'review.status':['ok','insufficient','none'],
 'explain.state':['none','running','accepted','rejected','failed'] satisfies readonly PanelState[],
 'explain.subject':['snapshot','review'],
 'explain.failure':KNOWN_FAILURES,
 'deviation.kind':['revised','dropped','unchanged','newly_available'] satisfies readonly DiffKind[],
 'deviation.subkind':['later_period','backfill','new_series'] satisfies readonly NewlySubkind[],
 'deviation.role':['latest','comparison'],
 'deviation.evidence':['complete','evidence_incomplete'],
 regime:['recovery','overheat','stagflation','recession'] satisfies readonly Regime[],
 'f4.lifecycle':['open','settled','settled_hit','settled_miss','other'],
 region:['US','CN'],
};
describe('macroStrategy messages',()=>{
 it('zh and en have the same keys',()=>{expect([...zh.keys()].sort()).toEqual([...en.keys()].sort());});
 it('placeholders match per key',()=>{for(const [k,v] of zh)expect([k,ph(v)]).toEqual([k,ph(en.get(k)!)]);});
 it('every rendered enum value has a message',()=>{
  for(const [family,values] of Object.entries(FAMILIES))for(const v of values)expect([`${family}.${v}`,zh.has(`${family}.${v}`)]).toEqual([`${family}.${v}`,true]);
 });
 it('no copy uses a forbidden term',()=>{
  for(const [k,v] of [...zh,...en])expect([k,hits(v)]).toEqual([k,[]]);
 });
 it('is registered in MESSAGE_DOMAINS inside a MACRO-P3 block',()=>{
  expect(readFileSync(resolve(process.cwd(),'src/i18n/request.ts'),'utf8')).toMatch(/\/\/ MACRO-P3\n\s*'macroStrategy',\n\s*\/\/ \/MACRO-P3/);
 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/macro/strategy/strategy-messages.test.ts`
Expected: FAIL. `./strategy-view-model` cannot be imported, and `messages/zh/macroStrategy.json` does not exist (ENOENT).

- [ ] **Step 3: Write the view model test**

Create `src/components/macro/strategy/strategy-view-model.test.ts`:

```ts
// Strategy UI view helpers (spec §3, §5.3, §5.6, §9.1): load states, exact decimal display, node states, playbook
// marks, matrix / cycle cells, mobile groups, review sections, explanation panel and deviation rows.
import {describe,expect,it} from 'vitest';
import type {Cell,CycleTableView,DeviationCase,Episode,EventRow,ExplanationProjection,F4Summary,Fact,NodeView,ObsRef,PlaybookView,PolicyResponseView,ReviewFacts,TransmissionView} from '@/lib/macro/strategy/contract';
import {MINUS,MISSING,barGeometry,closedMonths,columnMedians,coverageText,cycleCell,cycleGroups,deviationRows,episodeView,errorCode,eventRows,explainErrorText,f4SummaryDisplay,failureLabel,flowRows,
 episodesEmptyKey,formatBpText,formatInstant,formatPctRatio,formatRaw,formatValueText,hasSnapshot,headerLine,latestFor,loadStateOf,matrixCell,matrixGroups,matrixScale,nextRequestId,nodeDisplay,panelState,playbookCards,playbookNotice,
 projectionOfError,quantile7,remainingToday,renderedSections,reviewGrid,reviewSections,roundDecimalText,strategyApi,toneClass,toneLevel,toneOfText,uniformReason,type StrategyT} from './strategy-view-model';

const t:StrategyT=(k,v)=>v?`${k}${JSON.stringify(v)}`:k;
const ref=(series:string,pe:string,v:string):ObsRef=>({observation_id:`obs:${series}:${pe}:v1`,series_id:series,period_end:pe,value_text:v,version:1,available_at:`${pe}T12:00:00Z`,source:{kind:'snapshot',snapshot_id:'snap:US:1'}});
const node=(o:Partial<NodeView>):NodeView=>({id:'n',state:'observed',label:{zh:'美债 10Y',en:'UST 10Y'},value_text:'4.10',unit:'pct',period_end:'2026-10-31',inputs:[ref('US_DGS10','2026-10-31','4.10')],reason:null,...o});
const ev=(o:Partial<EventRow>):EventRow=>({effective_date:'2022-03-17',change_bp:'25',basis:'range',base:{period_end:'2022-02-28',value_text:'112.6',inputs:[]},end:{period_end:'2022-05-31',value_text:'115.48',inputs:[]},change_raw:2.5577,change_text:null,selected:true,exclusion:null,...o});

describe('load states (spec §9.1)',()=>{
 it('maps capability-matrix answers to page states',()=>{
  expect(loadStateOf(200,{a:1})).toEqual({kind:'ok',data:{a:1}});
  expect(loadStateOf(404,{error:{code:'strategy_disabled',message:''}})).toEqual({kind:'disabled'});
  expect(loadStateOf(503,{error:{code:'macro_foundation_unavailable',message:''}})).toEqual({kind:'foundation'});
  expect(loadStateOf(404,{error:{code:'no_published_snapshot',message:''}})).toEqual({kind:'no_snapshot'});
  expect(loadStateOf(404,{error:{code:'judgments_disabled',message:''}})).toEqual({kind:'judgments_disabled'});
  expect(loadStateOf(503,{error:{code:'judgments_unavailable',message:''}})).toEqual({kind:'judgments_unavailable'});
  expect(loadStateOf(404,{error:{code:'review_not_found',message:''}})).toEqual({kind:'not_found'});
  expect(loadStateOf(500,null)).toEqual({kind:'error',code:'http_500'});
  expect(errorCode({error:{code:'x'}})).toBe('x');expect(errorCode('nope')).toBeNull();
 });
 it('builds the API urls',()=>{
  expect(strategyApi.transmission('CN')).toBe('/api/macro/strategy/transmission?region=CN');
  expect(strategyApi.explanations('snapshot','snap:US:1')).toBe('/api/macro/strategy/explanations?subject_kind=snapshot&subject_id=snap%3AUS%3A1');
  expect(strategyApi.review('US','2026-10')).toBe('/api/macro/strategy/reviews/US/2026-10');
 });
});

describe('decimal display (spec §5.6: rounding only at display)',()=>{
 it('rounds decimal strings half away from zero without float drift',()=>{
  expect(roundDecimalText('2.9381',2)).toBe('2.94');expect(roundDecimalText('4.8',2)).toBe('4.80');
  expect(roundDecimalText('-0.005',2)).toBe('-0.01');expect(roundDecimalText('-0.004',2)).toBe('0.00');
  expect(roundDecimalText('1.5',0)).toBe('2');expect(roundDecimalText('999.995',2)).toBe('1000.00');
  expect(roundDecimalText('1e5',2)).toBe(MISSING);
 });
 it('keeps source precision up to two decimals',()=>{
  expect(formatValueText('2.9381')).toBe('2.94');expect(formatValueText('4.80')).toBe('4.80');expect(formatValueText('50')).toBe('50');
 });
 it('pct to 0.1 %, bp to 1 bp, with a real minus sign',()=>{
  expect(formatRaw(1.2345,'pct')).toBe('+1.2%');expect(formatRaw(-0.36,'pct')).toBe(`${MINUS}0.4%`);
  expect(formatRaw(0.04,'pct')).toBe('0.0%');expect(formatRaw(-0.04,'pct')).toBe('0.0%');
  expect(formatRaw(209,'bp')).toBe('+209 bp');expect(formatRaw(-47.5,'bp')).toBe(`${MINUS}48 bp`);
  expect(formatRaw(null,'bp')).toBe(MISSING);expect(formatRaw(Number.NaN,'pct')).toBe(MISSING);
  expect(formatBpText('525')).toBe('+525 bp');expect(formatBpText('-12.5')).toBe(`${MINUS}13 bp`);expect(formatBpText('0')).toBe('0 bp');
 });
 it('tones follow the displayed sign; three wash levels per column',()=>{
  expect(toneOfText('+1.2%')).toBe('up');expect(toneOfText(`${MINUS}3 bp`)).toBe('down');expect(toneOfText('0.0%')).toBe('flat');expect(toneOfText(MISSING)).toBe('missing');
  expect([toneLevel(1,9),toneLevel(-4,9),toneLevel(9,9),toneLevel(null,9),toneLevel(3,0)]).toEqual([1,2,3,1,1]);
  expect(toneClass('up',3)).toBe('bg-[color-mix(in_srgb,var(--up)_16%,transparent)]');expect(toneClass('down',1)).toBe('bg-[color-mix(in_srgb,var(--down)_6%,transparent)]');
  expect(toneClass('flat',2)).toBe('');expect(toneClass('missing',1)).toBe('text-text-dim');
 });
 it('instants print in UTC',()=>{expect(formatInstant('2026-11-03T06:02:09Z')).toBe('2026-11-03 06:02 UTC');expect(formatInstant('x')).toBe(MISSING);});
});

describe('transmission nodes (spec §5.1)',()=>{
 it('derived spread shows the exact formula and opens its two inputs',()=>{
  const d=nodeDisplay(node({id:'spread',state:'derived',label:{zh:'中美 10Y 利差',en:'US–CN 10Y spread'},value_text:'2.25',unit:'pp',inputs:[ref('US_DGS10','2026-10-31','4.10'),ref('CN_CGB_10Y','2026-10-31','1.85')]}),'zh');
  expect(d).toEqual({id:'spread',badgeKey:'state.derived',label:'中美 10Y 利差',value:'2.25',unit:' pp',period:'2026-10-31',reason:null,formula:`4.10 ${MINUS} 1.85 = 2.25`,dashed:false,drill:true,seriesId:null});
 });
 it('a spread with mismatched periods is missing with its reason, still drillable to both inputs, no formula',()=>{
  const d=nodeDisplay(node({state:'missing',value_text:null,unit:'pp',period_end:null,reason:{zh:'两条输入数据期不同',en:'periods differ'},inputs:[ref('US_DGS10','2026-10-31','4.10'),ref('CN_CGB_10Y','2026-09-30','1.92')]}),'en');
  expect(d).toMatchObject({value:null,reason:'periods differ',formula:null,dashed:true,drill:true,badgeKey:'state.missing'});
 });
 it('observed nodes link to the indicator; restricted / not-in-catalog nodes are dashed and carry no value',()=>{
  expect(nodeDisplay(node({}),'zh')).toMatchObject({value:'4.10',unit:'%',seriesId:'US_DGS10',dashed:false,drill:false});
  expect(nodeDisplay(node({state:'restricted',value_text:null,inputs:[],reason:{zh:'第三方版权',en:'third-party rights'}}),'zh')).toMatchObject({value:null,dashed:true,seriesId:null,reason:'第三方版权'});
 });
 it('table view rows and the no-snapshot check',()=>{
  const v:TransmissionView={version:'macro-transmission/1',region:'US',manifest_id:'m',cutoff:'c',snapshots:{US:null,CN:null},catalog_version:'cat',
   stages:[{stage:'rates',label:{zh:'无风险利率',en:'Risk-free rates'},nodes:[node({id:'a'}),node({id:'b',state:'not_in_catalog',value_text:null,period_end:null,inputs:[],reason:{zh:'未纳入',en:'not in catalog'}})],edge:null}]};
  expect(flowRows(v,'zh')).toEqual([
   {key:'rates:a',stage:'无风险利率',node:'美债 10Y',stateKey:'state.observed',value:'4.10%',period:'2026-10-31',reason:''},
   {key:'rates:b',stage:'无风险利率',node:'美债 10Y',stateKey:'state.not_in_catalog',value:MISSING,period:MISSING,reason:'未纳入'}]);
  expect(hasSnapshot(v)).toBe(false);expect(hasSnapshot({...v,snapshots:{US:'s',CN:null}})).toBe(true);expect(hasSnapshot({...v,snapshots:{US:null,CN:'s'}})).toBe(false);
 });
});

describe('playbooks (spec §5.2)',()=>{
 const pb=(regime:PlaybookView['regime']):PlaybookView=>({regime,title:{zh:regime,en:regime},triggers:[{rule_id:'pmi.1',type:'pmi',condition:{zh:'50 ≤ v < 55',en:'50 ≤ v < 55'},support:0.5},{rule_id:'x.1',type:'fx',condition:{zh:'c',en:'c'},support:1}],
  mechanism:[{zh:'需求回升',en:'demand recovers'}],implications:{favored:[{zh:'权益',en:'equities'}],disfavored:[{zh:'现金',en:'cash'}]},watch:[{series_id:'US_CPI_YOY',name:{zh:'CPI 同比',en:'CPI YoY'}}]});
 const mark=(regime:PlaybookView['regime'],match:boolean)=>({mark:{regime,judgment_id:'j1',snapshot_match:match,as_of:'2026-10-14T03:00:00Z'}});
 it('renders rule rows verbatim with the rule parameter, never a percentage',()=>{
  const [c]=playbookCards([pb('recovery')],'zh',null);
  expect(c.triggers).toEqual(['pmi · 50 ≤ v < 55 · 0.5','fx · c · 1.0']);
  expect(c).toMatchObject({mechanism:['需求回升'],favored:['权益'],disfavored:['现金'],watch:[{id:'US_CPI_YOY',name:'CPI 同比'}],marked:false});
 });
 it('marks only the F4 card category on the manifest snapshot',()=>{
  const cards=playbookCards([pb('recovery'),pb('overheat')],'zh',mark('overheat',true));
  expect(cards.map(c=>c.marked)).toEqual([false,true]);
  expect(playbookCards([pb('overheat')],'zh',mark('overheat',false))[0].marked).toBe(false);
 });
 it('notice per judgment state',()=>{
  expect(playbookNotice('disabled',null)).toEqual({key:'playbook.offNote'});
  expect(playbookNotice('unavailable',null)).toEqual({key:'dependency.judgmentsUnavailable'});
  expect(playbookNotice('ok',mark('overheat',false))).toEqual({key:'playbook.earlier',date:'2026-10-14'});
  expect(playbookNotice('ok',mark('overheat',true))).toBeNull();
 });
 it('F4 summary is words only',()=>{
  const s:F4Summary={judgment_id:'j1',selected:'overheat',lifecycle:'settled',outcome:'miss',calibration:'insufficient_sample',methodology:{id:'macro_regime',version:'v1'},as_of:'2026-10-14T03:00:00Z',href:'/intel/methods/macro_regime'};
  expect(f4SummaryDisplay(s,t)).toEqual({category:'regime.overheat',lifecycle:'f4.lifecycle.settled_miss',calibration:'f4.calibration{"value":"f4.calibrationState.insufficient_sample"}',
   method:'f4.method{"id":"macro_regime","version":"v1"}',asOf:'f4.asOf{"date":"2026-10-14"}',href:'/intel/methods/macro_regime'});
  expect(f4SummaryDisplay({...s,lifecycle:'open',outcome:null,calibration:'custom',selected:null},t)).toMatchObject({category:MISSING,lifecycle:'f4.lifecycle.open',calibration:'f4.calibration{"value":"custom"}'});
  expect(f4SummaryDisplay({...s,lifecycle:'voided'},t).lifecycle).toBe('f4.lifecycle.other{"value":"voided"}');
 });
});

describe('policy response matrix (spec §5.3)',()=>{
 const stats:Cell={status:'stats',n:6,median_raw:1.2345,q1_raw:-0.4,q3_raw:2.94,unit:'pct',events:[ev({})]};
 const view:PolicyResponseView={version:'macro-policy-response/1',window:3,manifest_id:'m',cutoff:'c',sentences:[],
  dims:[{id:'US_DTWEXBGS',label:{zh:'美元广义',en:'Broad USD'},unit:'pct',kind:'series',series:'US_DTWEXBGS',coverage:{from:'2006-01-31',to:'2026-10-31'}},
   {id:'US_SP500',label:{zh:'标普',en:'S&P'},unit:'pct',kind:'restricted',coverage:{from:null,to:null}}],
  rows:[{direction:'hike',cells:{US_DTWEXBGS:stats,US_SP500:{status:'restricted',reason:{zh:'受限',en:'restricted'}}}},
   {direction:'qe_qt',cells:{US_DTWEXBGS:{status:'missing',reason:{zh:'目录无联储资产负债表序列',en:'no balance sheet series'}},US_SP500:{status:'missing',reason:{zh:'目录无联储资产负债表序列',en:'no balance sheet series'}}}}]};
 it('cells: stats with quartiles, events-only, insufficient, restricted',()=>{
  expect(matrixCell(stats,'zh',t)).toEqual({main:'+1.2%',sub:`matrix.quartiles{"q1":"${MINUS}0.4%","q3":"+2.9%","n":6}`,tone:'up',drill:true,raw:1.2345});
  expect(matrixCell({status:'events_only',n:3,unit:'bp',events:[]},'zh',t)).toEqual({main:'matrix.n{"n":3}',sub:'matrix.fewEvents',tone:'flat',drill:true,raw:null});
  expect(matrixCell({status:'insufficient',unit:'bp',events:[]},'zh',t)).toMatchObject({main:MISSING,drill:false});
  expect(matrixCell({status:'restricted',reason:{zh:'受限',en:'restricted'}},'en',t)).toEqual({main:'state.restricted',sub:'restricted',tone:'missing',drill:false,raw:null});
 });
 it('per-event rows keep selected and excluded events with reasons',()=>{
  expect(eventRows([ev({}),ev({effective_date:'2022-05-05',change_bp:'50',selected:false,exclusion:'overlap',change_raw:null,end:null})],'pct')).toEqual([
   {key:'2022-03-17',date:'2022-03-17',changeBp:'+25 bp',base:'2022-02 · 112.6',end:'2022-05 · 115.48',change:'+2.6%',selected:true,exclusionKey:null},
   {key:'2022-05-05',date:'2022-05-05',changeBp:'+50 bp',base:'2022-02 · 112.6',end:MISSING,change:MISSING,selected:false,exclusionKey:'matrix.exclusion.overlap'}]);
  expect(eventRows([ev({change_text:'-7',change_raw:null})],'bp')[0].change).toBe(`${MINUS}7 bp`);
  expect(eventRows([ev({change_text:'115.48/112.6'})],'pct')[0].change).toBe('+2.6%');   // exact ratio, rounded once
 });
 it('pct changes are rounded once from the exact ratio (no double rounding at the boundary)',()=>{
  expect(formatPctRatio('100.04996/100')).toBe('0.0%');expect(formatPctRatio('99.95004/100')).toBe('0.0%');
  expect(formatPctRatio('100.05/100')).toBe('+0.1%');expect(formatPctRatio('99.95/100')).toBe(`${MINUS}0.1%`);
  expect(formatPctRatio('-14.5424')).toBe(MISSING);
 });
 it('column scale, uniform-missing rows, coverage header and mobile groups',()=>{
  expect(matrixScale(view)).toEqual({US_DTWEXBGS:1.2345,US_SP500:0});
  expect(uniformReason(view.rows[1],view.dims,'zh')).toBe('目录无联储资产负债表序列');
  expect(uniformReason(view.rows[0],view.dims,'zh')).toBeNull();
  expect(coverageText(view.dims[0],t)).toBe('matrix.coverage{"from":"2006-01","to":"2026-10"}');
  expect(coverageText(view.dims[1],t)).toBe('matrix.noCoverage');
  const g=matrixGroups(view,'zh',t);
  expect(g.map(x=>x.label)).toEqual(['美元广义 %','标普 %']);
  expect(g[0].rows.map(r=>[r.direction,r.cell.main])).toEqual([['hike','+1.2%'],['qe_qt','state.missing']]);
 });
});

describe('policy action episodes × assets (spec §5.5)',()=>{
 const ep=(o:Partial<Episode>):Episode=>({index:0,direction:'hike',start:'2022-03-17',end:'2023-07-27',events:11,upper_from:'0.25',upper_to:'5.50',cumulative_bp:'525',left_censored:false,ongoing:false,gap_after:false,...o});
 const view:CycleTableView={version:'macro-cycle-table/1',episodes_version:'macro-policy-episodes/1',boundary:'month_end',manifest_id:'m',cutoff:'c',gaps:[],
  episodes:[ep({}),ep({index:1,direction:'cut',start:'2024-09-19',end:'2025-12-11',cumulative_bp:'-175',events:6,ongoing:true,upper_from:'5.50',upper_to:'3.75'})],
  columns:[{id:'US_UST10Y',label:{zh:'美债10Y',en:'UST 10Y'},change_kind:'bp',daily_series:'US_DGS10_D',monthly_series:'US_DGS10',restricted:false},
   {id:'US_WTI',label:{zh:'WTI',en:'WTI'},change_kind:'pct',daily_series:'US_WTI_D',monthly_series:'US_WTI',restricted:false}],
  cells:{'0':{US_UST10Y:{status:'ok',from:ref('US_DGS10','2022-02-28','1.93'),to:ref('US_DGS10','2023-07-31','3.96'),change_raw:null,change_text:'203',change_kind:'bp'},
   US_WTI:{status:'ok',from:ref('US_WTI','2022-02-28','95.72'),to:ref('US_WTI','2023-07-31','81.8'),change_raw:-14.5424,change_text:'81.8/95.72',change_kind:'pct'}},
   '1':{US_UST10Y:{status:'ok',from:ref('US_DGS10','2024-08-30','3.91'),to:ref('US_DGS10','2025-12-31','4.15'),change_raw:null,change_text:'24',change_kind:'bp'},US_WTI:{status:'missing',reason:'month_not_closed'}}}};
 it('ok cells show the change and both endpoints; missing cells say why',()=>{
  expect(cycleCell(view.cells['0'].US_UST10Y,t)).toMatchObject({main:'+203 bp',sub:'1.93 (2022-02-28) → 3.96 (2023-07-31)',tone:'up',drill:true,raw:203});
  expect(cycleCell(view.cells['0'].US_WTI,t)).toMatchObject({main:`${MINUS}14.5%`,tone:'down',raw:-14.5424});
  expect(cycleCell(view.cells['0'].US_WTI,t).refs.map(r=>r.observation_id)).toEqual(['obs:US_WTI:2022-02-28:v1','obs:US_WTI:2023-07-31:v1']);
  expect(cycleCell({status:'missing',reason:'degenerate'},t)).toEqual({main:'state.missing',sub:'history.missing.degenerate',tone:'missing',drill:false,raw:null,refs:[]});
  expect(cycleCell({status:'restricted'},t).main).toBe('state.restricted');
 });
 it('an empty episode list says why: truncated event history vs no episodes',()=>{
  expect(episodesEmptyKey(view)).toBeNull();
  expect(episodesEmptyKey({...view,episodes:[]})).toBe('history.noEpisodes');
  expect(episodesEmptyKey({...view,episodes:[],gaps:[{kind:'history_truncated',reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]})).toBe('history.eventsTruncated');
 });
 it('episode header with flags',()=>{
  expect(episodeView(view.episodes[1],t)).toEqual({key:'cut:2024-09-19',direction:'history.direction.cut',dates:'2024-09-19 → 2025-12-11',
   line:`history.episodeLine{"from":"5.50","to":"3.75","bp":"${MINUS}175 bp","n":6}`,flags:['history.flag.ongoing']});
  expect(episodeView({...view.episodes[0],left_censored:true,gap_after:true},t).flags).toEqual(['history.flag.leftCensored','history.flag.gapAfter']);
 });
 it('type-7 median per column and centred bars',()=>{
  expect(quantile7([1,2,3,4],0.5)).toBe(2.5);expect(quantile7([1,2,3,4],0.25)).toBe(1.75);expect(quantile7([7],0.5)).toBe(7);
  expect(columnMedians(view).map(c=>[c.id,c.n,c.median,c.scaleMax])).toEqual([['US_UST10Y',2,113.5,203],['US_WTI',1,-14.5424,14.5424]]);
  expect(barGeometry(-50,100,100)).toEqual({x:50,width:50});expect(barGeometry(100,100,100)).toEqual({x:100,width:100});expect(barGeometry(null,100,100)).toEqual({x:100,width:0});
 });
 it('mobile groups: one per column, one line per episode',()=>{
  const g=cycleGroups(view,t,'en');
  expect(g.map(x=>x.label)).toEqual(['UST 10Y','WTI']);
  expect(g[1].rows.map(r=>r.cell.main)).toEqual([`${MINUS}14.5%`,'state.missing']);
  expect(g[0].rows[0].episode).toBe('history.direction.hike 2022-03-17 → 2023-07-27');
 });
});

describe('monthly review (spec §6.2)',()=>{
 const fact=(id:string,series?:string):Fact=>({fact_id:id,kind:'release',template:'release',slots:{},series_id:series,source_inputs:[]});
 const facts=(o:Partial<ReviewFacts>):ReviewFacts=>({region:'US',month:'2026-10',cutoff:'c',baseline_cutoff:'b',snapshot_id:'s',baseline_snapshot_id:'s0',baseline_missing:false,
  releases:[fact('obs:US_CPI_YOY','US_CPI_YOY')],revisions:[],timeliness:[],policy_events:[fact('evt:2026-10-29')],episode_changes:[],asset_moves:[],coverage:[],...o});
 it('seven sections in spec order with rendered fact text',()=>{
  const s=reviewSections(facts({}),f=>`T:${f.fact_id}`);
  expect(s.map(x=>x.key)).toEqual(['releases','revisions','timeliness','policy_events','episode_changes','asset_moves','coverage']);
  expect(s[0]).toEqual({key:'releases',titleKey:'review.section.releases',items:[{factId:'obs:US_CPI_YOY',text:'T:obs:US_CPI_YOY',seriesId:'US_CPI_YOY'}],emptyKey:null});
  expect(s[1].emptyKey).toBe('review.empty');expect(s[3].items[0].seriesId).toBeNull();
 });
 it('missing baseline empties sections 1–2 with their own note',()=>{
  const s=reviewSections(facts({baseline_missing:true}),f=>f.fact_id);
  expect([s[0].items,s[0].emptyKey,s[1].emptyKey,s[3].items.length]).toEqual([[],'review.baselineMissing','review.baselineMissing',1]);
 });
 it('index: closed months newest first; grid cells per region',()=>{
  expect(closedMonths(new Date('2026-01-15T00:00:00Z'),3)).toEqual(['2025-12','2025-11','2025-10']);
  const grid=reviewGrid(['2026-10','2026-09'],[{region:'US',month:'2026-10',status:'ok',generation:2,result_id:'r',updated_at:'2026-11-03T06:02:00Z'}],[{region:'CN',month:'2026-09',status:'insufficient',generation:1,result_id:'r2',updated_at:'u'}]);
  expect(grid).toEqual([{month:'2026-10',US:{status:'ok',updatedAt:'2026-11-03T06:02:00Z',generation:2},CN:{status:'none',updatedAt:null,generation:null}},
   {month:'2026-09',US:{status:'none',updatedAt:null,generation:null},CN:{status:'insufficient',updatedAt:'u',generation:1}}]);
 });
});

describe('explanation panel (spec §3.6, §6.3)',()=>{
 const proj=(o:Partial<ExplanationProjection>):ExplanationProjection=>({explanation_id:'e1',subject_kind:'review',subject_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',locale:'zh',manifest_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',state:'accepted',
  rendered:null,failure_codes:[],provider:'deepseek',model:'deepseek-chat',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1',created_at:'c',finished_at:null,...o});
 it('states: abandoned shows as failed',()=>{
  expect(panelState(null)).toBe('none');expect(panelState(proj({state:'running'}))).toBe('running');expect(panelState(proj({state:'abandoned'}))).toBe('failed');expect(panelState(proj({state:'rejected'}))).toBe('rejected');
 });
 it('latest projection in the page locale',()=>{
  expect(latestFor([proj({explanation_id:'en1',locale:'en'}),proj({explanation_id:'zh1'}),proj({explanation_id:'zh0'})],'zh')?.explanation_id).toBe('zh1');
  expect(latestFor([],'en')).toBeNull();
 });
 it('fact sentences are numbered; hypotheses cite them by number; unknown ids drop',()=>{
  expect(renderedSections({facts:[{fact_id:'obs:a',text:'A'},{fact_id:'chg:b',text:'B'}],hypotheses:[{text:'H',fact_ids:['chg:b','zz']}],counterpoints:[{text:'C',fact_ids:['obs:a']}]})).toEqual({
   facts:[{n:1,factId:'obs:a',text:'A'},{n:2,factId:'chg:b',text:'B'}],hypotheses:[{text:'H',refs:[2]}],counterpoints:[{text:'C',refs:[1]}]});
 });
 it('header names subject, manifest, model, prompt and validator versions',()=>{
  expect(headerLine(proj({}),t)).toBe('explain.header{"subject":"explain.subject.review{\\"id\\":\\"aaaaaaaa…\\"}","manifest":"bbbbbbbb…","model":"deepseek/deepseek-chat","prompt":"macro-explain-prompt/1","validator":"macro-explain-validator/1"}');
  expect(headerLine(proj({provider:null,model:null}),t)).toContain(`"model":"${MISSING}"`);
 });
 it('failure codes, quota counts, request ids and error text',()=>{
  expect(failureLabel('numeral',t)).toBe('explain.failure.numeral');expect(failureLabel('weird_code',t)).toBe('weird_code');
  expect(remainingToday({usage:{perspectives:{used:2,limit:5}}})).toEqual({kind:'count',n:3});
  expect(remainingToday({usage:{perspectives:{used:9,limit:5}}})).toEqual({kind:'count',n:0});
  expect(remainingToday({usage:{perspectives:{used:0,limit:-1}}})).toEqual({kind:'unlimited'});
  expect(remainingToday(null)).toBeNull();
  expect(nextRequestId('keep',()=>'new')).toBe('keep');expect(nextRequestId(null,()=>'new')).toBe('new');
  expect(explainErrorText('quota_exceeded',t)).toBe('explain.quota');expect(explainErrorText('llm_not_configured',t)).toBe('explain.noModel');
  expect(explainErrorText('payload_conflict',t)).toBe('explain.conflict{"code":"payload_conflict"}');expect(explainErrorText('network',t)).toBe('explain.error{"code":"network"}');
  expect(projectionOfError({error:{code:'usage_audit_unavailable'},explanation:proj({state:'failed'})})?.state).toBe('failed');expect(projectionOfError({error:{code:'x'}})).toBeNull();
 });
});

describe('deviation cases (spec §6.4)',()=>{
 const c:DeviationCase={judgment_id:'j',settlement_id:'s',region:'US',as_of:'2026-09-02',selected:'overheat',realized:'recovery',evidence_state:'complete',diffs:[
  {series_id:'US_DFF',period_end:'2026-08-31',role:'latest',kind:'unchanged',subkind:null,registered:{vintage_id:'v1',value:4.33},settled:{vintage_id:'v1',value:4.33}},
  {series_id:'US_UNRATE',period_end:'2026-08-31',role:'latest',kind:'newly_available',subkind:'later_period',registered:null,settled:{vintage_id:'v1',value:4.2}},
  {series_id:'US_CPI_YOY',period_end:'2026-08-31',role:'latest',kind:'revised',subkind:null,registered:{vintage_id:'v1',value:3},settled:{vintage_id:'v2',value:2.9}},
  {series_id:'US_PPI',period_end:'2026-07-31',role:'comparison',kind:'dropped',subkind:null,registered:{vintage_id:'v1',value:2.4},settled:null}]};
 it('orders revised, dropped, newly available; folds unchanged by default',()=>{
  const r=deviationRows(c,false);
  expect(r.hiddenUnchanged).toBe(1);
  expect(r.rows.map(x=>[x.series,x.kindKey,x.subkindKey,x.registered,x.settled])).toEqual([
   ['US_CPI_YOY','deviation.kind.revised',null,'v1 · 3','v2 · 2.9'],
   ['US_PPI','deviation.kind.dropped',null,'v1 · 2.4',MISSING],
   ['US_UNRATE','deviation.kind.newly_available','deviation.subkind.later_period',MISSING,'v1 · 4.2']]);
  expect(deviationRows(c,true).rows.map(x=>x.kindKey).at(-1)).toBe('deviation.kind.unchanged');
 });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/components/macro/strategy/strategy-view-model.test.ts`
Expected: FAIL. The suite cannot import `./strategy-view-model`.

- [ ] **Step 5: Implement the view model**

Create `src/components/macro/strategy/strategy-view-model.ts`:

```ts
// src/components/macro/strategy/strategy-view-model.ts
// Pure view helpers for the macro strategy UI (spec §3, §8, §9.1). vitest runs in node and cannot import .tsx, so every
// decision a component makes lives here and the .tsx files stay thin renderers. Display rounding happens only here
// (spec §5.3, §5.6): views carry exact value_text, the exact pct ratio '<end>/<base>' in change_text and full-precision *_raw
// numbers; a pct change is rounded once, from the exact ratio (formatPctRatio). No F4 number is ever formatted.
import type {Bilingual,Boundary,Cell,CycleCell,CycleTableView,DeviationCase,DiffKind,Episode,EventRow,ExplanationProjection,F4Mark,F4Summary,Fact,JudgmentStatus,
 NodeView,ObsRef,PlaybookView,PolicyResponseView,Regime,Region,RenderedExplanation,ResponseDim,ReviewFacts,TransmissionView} from '@/lib/macro/strategy/contract';
import {roundPctRatio} from '@/lib/macro/strategy/numeric';
import type {ReviewIndexItem} from '@/lib/macro/strategy/route-helpers';
export type Locale='zh'|'en';
export type StrategyT=(key:string,values?:Record<string,string|number>)=>string;
export const MISSING='—';
export const MINUS='−';
// ---- API urls and load states (spec §8, §9.1)
export const strategyApi={
 transmission:(r:Region)=>`/api/macro/strategy/transmission?region=${r}`,
 policyResponse:(w:1|3|6)=>`/api/macro/strategy/policy-response?window=${w}`,
 cycleTable:(b:Boundary)=>`/api/macro/strategy/cycle-table?boundary=${b}`,
 reviews:(r:Region)=>`/api/macro/strategy/reviews?region=${r}`,
 review:(r:Region,month:string)=>`/api/macro/strategy/reviews/${r}/${month}`,
 deviations:(r:Region)=>`/api/macro/strategy/deviations?region=${r}`,
 explanations:(kind:'snapshot'|'review',id:string)=>`/api/macro/strategy/explanations?subject_kind=${kind}&subject_id=${encodeURIComponent(id)}`,
 manifest:(id:string)=>`/api/macro/strategy/manifests/${id}`,
};
export type LoadState<T>={kind:'loading'}|{kind:'ok';data:T}|{kind:'disabled'}|{kind:'foundation'}|{kind:'no_snapshot'}|{kind:'not_found'}|{kind:'judgments_disabled'}|{kind:'judgments_unavailable'}|{kind:'error';code:string};
export function errorCode(body:unknown):string|null{
 if(typeof body!=='object'||body===null)return null;
 const e=(body as {error?:unknown}).error;
 return typeof e==='object'&&e!==null&&typeof (e as {code?:unknown}).code==='string'?(e as {code:string}).code:null;
}
export function loadStateOf<T>(status:number,body:unknown):LoadState<T>{
 if(status>=200&&status<300)return {kind:'ok',data:body as T};
 const code=errorCode(body);
 if(status===404&&code==='strategy_disabled')return {kind:'disabled'};
 if(status===503&&code==='macro_foundation_unavailable')return {kind:'foundation'};
 if(status===404&&code==='no_published_snapshot')return {kind:'no_snapshot'};
 if(status===404&&code==='judgments_disabled')return {kind:'judgments_disabled'};
 if(status===503&&code==='judgments_unavailable')return {kind:'judgments_unavailable'};
 if(status===404)return {kind:'not_found'};
 return {kind:'error',code:code??`http_${status}`};
}
// ---- decimal display (string arithmetic: no float drift on value_text)
/** Round a decimal string half away from zero to dp places; anything else → MISSING. */
export function roundDecimalText(text:string,dp:number):string{
 const m=/^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
 if(!m)return MISSING;
 const frac=m[3]??'';
 let n=BigInt(m[2]+frac.padEnd(dp,'0').slice(0,dp));
 if(frac.length>dp&&Number(frac[dp])>=5)n+=1n;
 const s=n.toString().padStart(dp+1,'0');
 const out=dp>0?`${s.slice(0,-dp)}.${s.slice(-dp)}`:s;
 return m[1]&&n!==0n?`-${out}`:out;
}
/** Source precision kept up to 2 decimals. */
export function formatValueText(text:string):string{
 const frac=/\.(\d+)$/.exec(text)?.[1]??'';
 return frac.length>2?roundDecimalText(text,2):text;
}
const signed=(t:string):string=>t===MISSING?t:t.startsWith('-')?`${MINUS}${t.slice(1)}`:/^0(\.0+)?$/.test(t)?t:`+${t}`;
/** Full-precision float → display: pct to 0.1 %, bp to 1 bp (spec §5.3). */
export function formatRaw(raw:number|null,unit:'pct'|'bp'):string{
 if(raw===null||!Number.isFinite(raw))return MISSING;
 return `${signed(roundDecimalText(raw.toFixed(10),unit==='pct'?1:0))}${unit==='pct'?'%':' bp'}`;
}
/** Exact pct ratio '<end>/<base>' → display to 0.1 %, rounded once (no pre-rounded value in between). */
export function formatPctRatio(ratio:string):string{
 let r:string;try{r=roundPctRatio(ratio,1);}catch{return MISSING;}
 return `${signed(r)}%`;
}
/** Exact bp decimal string → display to 1 bp. */
export function formatBpText(text:string):string{const r=roundDecimalText(text,0);return r===MISSING?r:`${signed(r)} bp`;}
export type Tone='up'|'down'|'flat'|'missing';
export const toneOfText=(display:string):Tone=>display===MISSING?'missing':display.startsWith('+')?'up':display.startsWith(MINUS)?'down':'flat';
/** Three wash levels by share of the column's largest magnitude (spec §3.3: three light tints + sign). */
export function toneLevel(raw:number|null,maxAbs:number):1|2|3{
 if(raw===null||!(maxAbs>0))return 1;
 const r=Math.abs(raw)/maxAbs;
 return r>2/3?3:r>1/3?2:1;
}
const TONE_CLASSES:Record<'up'|'down',readonly [string,string,string]>={
 up:['bg-[color-mix(in_srgb,var(--up)_6%,transparent)]','bg-[color-mix(in_srgb,var(--up)_10%,transparent)]','bg-[color-mix(in_srgb,var(--up)_16%,transparent)]'],
 down:['bg-[color-mix(in_srgb,var(--down)_6%,transparent)]','bg-[color-mix(in_srgb,var(--down)_10%,transparent)]','bg-[color-mix(in_srgb,var(--down)_16%,transparent)]'],
};
export function toneClass(tone:Tone,level:1|2|3):string{
 if(tone==='up'||tone==='down')return TONE_CLASSES[tone][level-1];
 return tone==='missing'?'text-text-dim':'';
}
export const unitSuffix=(unit:string):string=>unit==='pct'?'%':unit==='pp'?' pp':unit==='bp'?' bp':'';
export function formatInstant(iso:string):string{
 const d=new Date(iso);
 return Number.isNaN(d.getTime())?MISSING:`${d.toISOString().slice(0,10)} ${d.toISOString().slice(11,16)} UTC`;
}
export const shortId=(id:string):string=>id.length>12?`${id.slice(0,8)}…`:id;
// ---- transmission (spec §3.3, §5.1)
export interface NodeDisplay{id:string;badgeKey:string;label:string;value:string|null;unit:string;period:string|null;reason:string|null;formula:string|null;dashed:boolean;drill:boolean;seriesId:string|null}
export function nodeDisplay(n:NodeView,l:Locale):NodeDisplay{
 const pair=n.inputs.length===2;
 return {id:n.id,badgeKey:`state.${n.state}`,label:n.label[l],value:n.value_text===null?null:formatValueText(n.value_text),unit:unitSuffix(n.unit??''),
  period:n.period_end,reason:n.reason?n.reason[l]:null,
  formula:n.state==='derived'&&pair&&n.value_text!==null?`${n.inputs[0].value_text} ${MINUS} ${n.inputs[1].value_text} = ${n.value_text}`:null,
  dashed:n.state!=='observed'&&n.state!=='derived',drill:pair,seriesId:n.state==='observed'&&n.inputs.length>0?n.inputs[0].series_id:null};
}
/** The requested region has a snapshot in the manifest (the other region may have one when this one has none). */
export const hasSnapshot=(v:TransmissionView):boolean=>v.snapshots[v.region]!==null;
export function flowRows(v:TransmissionView,l:Locale):{key:string;stage:string;node:string;stateKey:string;value:string;period:string;reason:string}[]{
 return v.stages.flatMap(s=>s.nodes.map(n=>{const d=nodeDisplay(n,l);
  return {key:`${s.stage}:${n.id}`,stage:s.label[l],node:d.label,stateKey:d.badgeKey,value:d.value===null?MISSING:`${d.value}${d.unit}`,period:n.period_end??MISSING,reason:d.reason??''};}));
}
// ---- playbooks (spec §5.2): static framework; a card is marked only for an F4 card on the manifest's snapshot
export interface PlaybookCard{regime:Regime;title:string;triggers:string[];mechanism:string[];favored:string[];disfavored:string[];watch:{id:string;name:string}[];marked:boolean}
export const supportText=(n:number):string=>Number.isInteger(n)?n.toFixed(1):String(n);
export function playbookCards(p:PlaybookView[],l:Locale,f4:{mark:F4Mark}|null):PlaybookCard[]{
 return p.map(b=>({regime:b.regime,title:b.title[l],triggers:b.triggers.map(t=>`${t.type} · ${t.condition[l]} · ${supportText(t.support)}`),
  mechanism:b.mechanism.map(x=>x[l]),favored:b.implications.favored.map(x=>x[l]),disfavored:b.implications.disfavored.map(x=>x[l]),
  watch:b.watch.map(w=>({id:w.series_id,name:w.name[l]})),marked:f4!==null&&f4.mark.snapshot_match&&f4.mark.regime===b.regime}));
}
export type PlaybookNotice={key:'playbook.offNote'}|{key:'dependency.judgmentsUnavailable'}|{key:'playbook.earlier';date:string}|null;
export function playbookNotice(status:JudgmentStatus,f4:{mark:F4Mark}|null):PlaybookNotice{
 if(status==='disabled')return {key:'playbook.offNote'};
 if(status==='unavailable'||f4===null)return {key:'dependency.judgmentsUnavailable'};
 return f4.mark.snapshot_match?null:{key:'playbook.earlier',date:f4.mark.as_of.slice(0,10)};
}
const CALIBRATION_STATES:readonly string[]=['insufficient_sample','uncalibrated','calibrated','stale'];
export function f4SummaryDisplay(s:F4Summary,t:StrategyT):{category:string;lifecycle:string;calibration:string;method:string;asOf:string;href:string|null}{
 const lifecycle=s.lifecycle==='open'?t('f4.lifecycle.open')
  :s.lifecycle==='settled'?(s.outcome?t(`f4.lifecycle.settled_${s.outcome}`):t('f4.lifecycle.settled'))
  :t('f4.lifecycle.other',{value:s.lifecycle});
 const cal=CALIBRATION_STATES.includes(s.calibration)?t(`f4.calibrationState.${s.calibration}`):s.calibration;
 return {category:s.selected?t(`regime.${s.selected}`):MISSING,lifecycle,calibration:t('f4.calibration',{value:cal}),
  method:t('f4.method',{id:s.methodology.id,version:s.methodology.version}),asOf:t('f4.asOf',{date:s.as_of.slice(0,10)}),href:s.href};
}
// ---- policy response matrix (spec §3.3, §5.3)
export interface CellDisplay{main:string;sub:string|null;tone:Tone;drill:boolean;raw:number|null}
export const cellEvents=(c:Cell):EventRow[]=>c.status==='stats'||c.status==='events_only'||c.status==='insufficient'?c.events:[];
export function matrixCell(c:Cell,l:Locale,t:StrategyT):CellDisplay{
 switch(c.status){
  case 'stats':{const main=formatRaw(c.median_raw,c.unit);
   return {main,sub:t('matrix.quartiles',{q1:formatRaw(c.q1_raw,c.unit),q3:formatRaw(c.q3_raw,c.unit),n:c.n}),tone:toneOfText(main),drill:true,raw:c.median_raw};}
  case 'events_only':return {main:t('matrix.n',{n:c.n}),sub:t('matrix.fewEvents'),tone:'flat',drill:true,raw:null};
  case 'insufficient':return {main:MISSING,sub:t('matrix.insufficient'),tone:'missing',drill:c.events.length>0,raw:null};
  default:return {main:t(`state.${c.status}`),sub:c.reason[l],tone:'missing',drill:false,raw:null};
 }
}
const NO_CELL:Cell={status:'missing',reason:{zh:'无数据',en:'No data'}};
export const cellOf=(row:{cells:Record<string,Cell>},dimId:string):Cell=>row.cells[dimId]??NO_CELL;
/** Largest |median| per dimension: the wash scale of that column. */
export function matrixScale(v:PolicyResponseView):Record<string,number>{
 const out:Record<string,number>={};
 for(const d of v.dims)out[d.id]=v.rows.reduce((m,r)=>{const c=cellOf(r,d.id);return c.status==='stats'?Math.max(m,Math.abs(c.median_raw)):m;},0);
 return out;
}
/** A row whose every cell is missing for one reason renders as one spanning cell (the QE / QT row). */
export function uniformReason(row:{cells:Record<string,Cell>},dims:ResponseDim[],l:Locale):string|null{
 const cells=dims.map(d=>cellOf(row,d.id));
 if(cells.length===0||cells.some(c=>c.status!=='missing'))return null;
 const first=(cells[0] as {reason:Bilingual}).reason;
 return cells.every(c=>(c as {reason:Bilingual}).reason.zh===first.zh)?first[l]:null;
}
export interface EventDisplay{key:string;date:string;changeBp:string;base:string;end:string;change:string;selected:boolean;exclusionKey:string|null}
export function eventRows(events:EventRow[],unit:'pct'|'bp'):EventDisplay[]{
 const end=(e:EventRow['base'])=>e?`${e.period_end.slice(0,7)} · ${formatValueText(e.value_text)}`:MISSING;
 return events.map(e=>({key:e.effective_date,date:e.effective_date,changeBp:formatBpText(e.change_bp),base:end(e.base),end:end(e.end),
  change:e.change_text===null?formatRaw(e.change_raw,unit):unit==='bp'?formatBpText(e.change_text):formatPctRatio(e.change_text),selected:e.selected,exclusionKey:e.exclusion?`matrix.exclusion.${e.exclusion}`:null}));
}
export function coverageText(d:ResponseDim,t:StrategyT):string{
 return d.coverage.from&&d.coverage.to?t('matrix.coverage',{from:d.coverage.from.slice(0,7),to:d.coverage.to.slice(0,7)}):t('matrix.noCoverage');
}
export const dimLabel=(d:ResponseDim,l:Locale):string=>`${d.label[l]} ${d.unit==='pct'?'%':'bp'}`;
/** Mobile (< 640px) fallback: one group per column, one line per policy row (spec §3.7). */
export function matrixGroups(v:PolicyResponseView,l:Locale,t:StrategyT):{id:string;label:string;coverage:string;rows:{direction:'hike'|'cut'|'qe_qt';cell:CellDisplay}[]}[]{
 return v.dims.map(d=>({id:d.id,label:dimLabel(d,l),coverage:coverageText(d,t),rows:v.rows.map(r=>({direction:r.direction,cell:matrixCell(cellOf(r,d.id),l,t)}))}));
}
// ---- policy action episodes × assets (spec §3.4, §5.5)
export function cycleCell(c:CycleCell,t:StrategyT):CellDisplay&{refs:ObsRef[]}{
 if(c.status==='ok'){
  const main=c.change_kind==='bp'?formatBpText(c.change_text):formatPctRatio(c.change_text);
  return {main,sub:`${formatValueText(c.from.value_text)} (${c.from.period_end}) → ${formatValueText(c.to.value_text)} (${c.to.period_end})`,tone:toneOfText(main),drill:true,
   raw:c.change_kind==='bp'?Number(c.change_text):c.change_raw,refs:[c.from,c.to]};
 }
 if(c.status==='missing')return {main:t('state.missing'),sub:t(`history.missing.${c.reason}`),tone:'missing',drill:false,raw:null,refs:[]};
 return {main:t('state.restricted'),sub:null,tone:'missing',drill:false,raw:null,refs:[]};
}
const CYCLE_MISSING:CycleCell={status:'missing',reason:'out_of_coverage'};
export const cycleCellOf=(v:CycleTableView,e:Episode,columnId:string):CycleCell=>v.cells[String(e.index)]?.[columnId]??CYCLE_MISSING;
export function episodeView(e:Episode,t:StrategyT):{key:string;direction:string;dates:string;line:string;flags:string[]}{
 return {key:`${e.direction}:${e.start}`,direction:t(`history.direction.${e.direction}`),dates:`${e.start} → ${e.end}`,
  line:t('history.episodeLine',{from:e.upper_from,to:e.upper_to,bp:formatBpText(e.cumulative_bp),n:e.events}),
  flags:[e.left_censored?'history.flag.leftCensored':null,e.ongoing?'history.flag.ongoing':null,e.gap_after?'history.flag.gapAfter':null].filter((k):k is string=>k!==null)};
}
/** type-7 quantile of an ascending array (spec §5.6). */
export function quantile7(sorted:number[],p:number):number{
 const h=(sorted.length-1)*p,lo=Math.floor(h);
 return lo+1<sorted.length?sorted[lo]+(h-lo)*(sorted[lo+1]-sorted[lo]):sorted[lo];
}
export function cycleScale(v:CycleTableView,columnId:string):number{
 return v.episodes.reduce((m,e)=>{const c=cycleCellOf(v,e,columnId);if(c.status!=='ok')return m;const r=c.change_kind==='bp'?Number(c.change_text):c.change_raw;return r!==null&&Number.isFinite(r)?Math.max(m,Math.abs(r)):m;},0);
}
/** Column medians for the small chart (display only; each column on its own scale). */
export function columnMedians(v:CycleTableView):{id:string;label:Bilingual;kind:'pct'|'bp';n:number;median:number|null;scaleMax:number}[]{
 return v.columns.map(c=>{
  const vals=v.episodes.map(e=>cycleCellOf(v,e,c.id)).flatMap(x=>x.status!=='ok'?[]:[x.change_kind==='bp'?Number(x.change_text):x.change_raw])
   .filter((x):x is number=>x!==null&&Number.isFinite(x)).sort((a,b)=>a-b);
  return {id:c.id,label:c.label,kind:c.change_kind,n:vals.length,median:vals.length?quantile7(vals,0.5):null,scaleMax:vals.reduce((m,x)=>Math.max(m,Math.abs(x)),0)};
 });
}
/** Horizontal bar from a centre line at `half`: x is the bar's left edge in [0, 2·half]. */
export function barGeometry(median:number|null,scaleMax:number,half:number):{x:number;width:number}{
 if(median===null||!(scaleMax>0))return {x:half,width:0};
 const width=Math.min(1,Math.abs(median)/scaleMax)*half;
 return {x:median<0?half-width:half,width};
}
/** Empty episode list: an explicit truncation notice when the event history read was truncated, else "no episodes". */
export function episodesEmptyKey(v:CycleTableView):string|null{
 if(v.episodes.length>0)return null;
 return v.gaps.some(g=>g.kind==='history_truncated')?'history.eventsTruncated':'history.noEpisodes';
}
export function cycleGroups(v:CycleTableView,t:StrategyT,l:Locale):{id:string;label:string;rows:{key:string;episode:string;cell:CellDisplay}[]}[]{
 return v.columns.map(c=>({id:c.id,label:c.label[l],rows:v.episodes.map(e=>{const ev=episodeView(e,t);return {key:ev.key,episode:`${ev.direction} ${ev.dates}`,cell:cycleCell(cycleCellOf(v,e,c.id),t)};})}));
}
// ---- monthly review (spec §3.5, §6.2)
export const REVIEW_SECTIONS=['releases','revisions','timeliness','policy_events','episode_changes','asset_moves','coverage'] as const;
export type ReviewSectionKey=typeof REVIEW_SECTIONS[number];
export function reviewSections(f:ReviewFacts,render:(fact:Fact)=>string):{key:ReviewSectionKey;titleKey:string;items:{factId:string;text:string;seriesId:string|null}[];emptyKey:string|null}[]{
 return REVIEW_SECTIONS.map(key=>{
  const gap=f.baseline_missing&&(key==='releases'||key==='revisions');
  const items=gap?[]:f[key].map(fact=>({factId:fact.fact_id,text:render(fact),seriesId:fact.series_id??null}));
  return {key,titleKey:`review.section.${key}`,items,emptyKey:gap?'review.baselineMissing':items.length===0?'review.empty':null};
 });
}
/** Closed months, newest first (the current UTC month is never listed). */
export function closedMonths(now:Date,n:number):string[]{
 const out:string[]=[];
 for(let i=1;i<=n;i++){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`);}
 return out;
}
export interface IndexCell{status:'ok'|'insufficient'|'none';updatedAt:string|null;generation:number|null}
export function reviewGrid(months:string[],us:ReviewIndexItem[],cn:ReviewIndexItem[]):{month:string;US:IndexCell;CN:IndexCell}[]{
 const cell=(list:ReviewIndexItem[],m:string):IndexCell=>{const i=list.find(x=>x.month===m);return i?{status:i.status,updatedAt:i.updated_at,generation:i.generation}:{status:'none',updatedAt:null,generation:null};};
 return months.map(m=>({month:m,US:cell(us,m),CN:cell(cn,m)}));
}
// ---- explanation panel (spec §3.6, §6.3)
export type PanelState='none'|'running'|'accepted'|'rejected'|'failed';
export function panelState(p:ExplanationProjection|null):PanelState{
 if(!p)return 'none';
 return p.state==='abandoned'?'failed':p.state;
}
/** Newest projection in the page locale (the list arrives newest first). */
export const latestFor=(items:ExplanationProjection[],l:Locale):ExplanationProjection|null=>items.find(p=>p.locale===l)??null;
export function renderedSections(r:RenderedExplanation):{facts:{n:number;factId:string;text:string}[];hypotheses:{text:string;refs:number[]}[];counterpoints:{text:string;refs:number[]}[]}{
 const index=new Map(r.facts.map((f,i)=>[f.fact_id,i+1]));
 const refs=(ids:string[])=>ids.map(id=>index.get(id)).filter((n):n is number=>n!==undefined);
 return {facts:r.facts.map((f,i)=>({n:i+1,factId:f.fact_id,text:f.text})),hypotheses:r.hypotheses.map(h=>({text:h.text,refs:refs(h.fact_ids)})),counterpoints:r.counterpoints.map(c=>({text:c.text,refs:refs(c.fact_ids)}))};
}
export function headerLine(p:ExplanationProjection,t:StrategyT):string{
 return t('explain.header',{subject:t(`explain.subject.${p.subject_kind}`,{id:shortId(p.subject_id)}),manifest:shortId(p.manifest_id),
  model:p.provider&&p.model?`${p.provider}/${p.model}`:MISSING,prompt:p.prompt_version,validator:p.validator_version});
}
/** Failure codes of Task 10 (validator) and Task 11 (run lifecycle and the perspectives cost errors). */
export const KNOWN_FAILURES:readonly string[]=['parse','schema','unknown_fact','numeral','forbidden_term','regime_term','abandoned','provider_error','validator_version_changed',
 'usage_audit_unavailable','usage_audit_invariant','daily_cost_exhausted','pricing_unavailable','budget_unavailable','budget_invariant_violation'];
export const failureLabel=(code:string,t:StrategyT):string=>KNOWN_FAILURES.includes(code)?t(`explain.failure.${code}`):code;
/** Today's remaining runs of the shared 'perspectives' quota from GET /api/usage/today; limit -1 = unlimited. */
export function remainingToday(body:unknown):{kind:'unlimited'}|{kind:'count';n:number}|null{
 const p=(body as {usage?:{perspectives?:{used?:unknown;limit?:unknown}}}|null)?.usage?.perspectives;
 if(!p||typeof p.used!=='number'||typeof p.limit!=='number')return null;
 return p.limit===-1?{kind:'unlimited'}:{kind:'count',n:Math.max(0,p.limit-p.used)};
}
/** A request id is reused only to retry after a network failure (pending); otherwise every submit is a new request. */
export const nextRequestId=(pending:string|null,gen:()=>string):string=>pending??gen();
const EXPLAIN_ERRORS:Record<string,string>={quota_exceeded:'explain.quota',llm_not_configured:'explain.noModel',no_facts:'explain.noFacts',subject_not_found:'explain.noSubject'};
export function explainErrorText(code:string,t:StrategyT):string{
 if(code==='payload_conflict')return t('explain.conflict',{code});
 return EXPLAIN_ERRORS[code]?t(EXPLAIN_ERRORS[code]):t('explain.error',{code});
}
/** A failed POST may still carry the run's projection ({error, explanation}: usage-run failures, spec §6.3 step 6). */
export function projectionOfError(body:unknown):ExplanationProjection|null{
 const p=(body as {explanation?:unknown}|null)?.explanation;
 return typeof p==='object'&&p!==null&&typeof (p as {explanation_id?:unknown}).explanation_id==='string'?p as ExplanationProjection:null;
}
// ---- deviation cases (spec §6.4): input differences only, unchanged rows folded by default
const KIND_ORDER:Record<DiffKind,number>={revised:0,dropped:1,newly_available:2,unchanged:3};
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function deviationRows(c:DeviationCase,showUnchanged:boolean):{hiddenUnchanged:number;rows:{key:string;series:string;period:string;roleKey:string;kindKey:string;subkindKey:string|null;registered:string;settled:string}[]}{
 const all=[...c.diffs].sort((a,b)=>KIND_ORDER[a.kind]-KIND_ORDER[b.kind]||cmp(a.series_id,b.series_id)||cmp(a.period_end,b.period_end));
 const visible=showUnchanged?all:all.filter(d=>d.kind!=='unchanged');
 const side=(s:{vintage_id:string;value:number}|null)=>s?`${s.vintage_id} · ${s.value}`:MISSING;
 return {hiddenUnchanged:all.length-visible.length,rows:visible.map(d=>({key:`${d.series_id}:${d.period_end}:${d.role}`,series:d.series_id,period:d.period_end,roleKey:`deviation.role.${d.role}`,
  kindKey:`deviation.kind.${d.kind}`,subkindKey:d.subkind?`deviation.subkind.${d.subkind}`:null,registered:side(d.registered),settled:side(d.settled)}))};
}
```

- [ ] **Step 6: Add the message files and register the domain**

Create `messages/zh/macroStrategy.json`:

```json
{
  "tabs": {"workbench": "宏观工作台", "transmission": "传导", "history": "历史", "review": "复盘"},
  "region": {"label": "区域", "US": "美国", "CN": "中国"},
  "meta": {"manifest": "清单 {id}", "manifestLink": "清单全文", "cutoff": "截止 {time}", "catalog": "目录 {version}", "method": "方法 {version}"},
  "dependency": {
    "loading": "读取中…",
    "foundationTitle": "宏观数据底座未就绪",
    "foundationBody": "传导、历史与复盘读取宏观快照、观测与政策事件，这些依赖尚未接线；页面不会用空数据拼出图表。",
    "judgmentsUnavailable": "判断层暂不可用",
    "judgmentsUnavailableBody": "F4 判断服务当前不可达，或没有可用的判断卡。事实部分照常显示，剧本不标记。",
    "noSnapshot": "尚无发布快照",
    "notFound": "没有这条记录",
    "loadFailed": "读取失败（{code}）",
    "retry": "重新读取"
  },
  "state": {"observed": "观测", "derived": "推导", "assumption": "假设", "missing": "缺失", "restricted": "受限", "not_in_catalog": "未纳入目录"},
  "view": {"table": "表格视图", "chart": "图", "flow": "传导图", "close": "关闭"},
  "flow": {
    "title": "实时传导流",
    "legend": "徽章标明节点来源；箭头是机制假设，未经检验",
    "edge": "机制假设：{text}",
    "openDerived": "查看输入",
    "openSeries": "查看指标",
    "derivedTitle": "推导 · {label}",
    "formulaNote": "两条输入须为同一数据期的观测，按十进制精确相减；数据期不同则不相减。",
    "columns": {"stage": "环节", "node": "节点", "state": "状态", "value": "值", "period": "数据期", "reason": "说明"}
  },
  "evidence": {
    "columns": {"series": "序列", "period": "数据期", "value": "值", "version": "版本", "available": "可得时间（首次采集）", "source": "取值来源"},
    "fromSnapshot": "快照 {id}",
    "fromHistory": "历史读取（截至 {asOf}）",
    "observation": "观测 {id}"
  },
  "playbook": {
    "title": "剧本库",
    "subtitle": "静态假设框架，不是判定",
    "supportNote": "规则支持度是规则表参数，不以百分比显示",
    "triggers": "触发条件（规则表原文 · 规则支持度）",
    "mechanism": "机制链（假设）",
    "implications": "配置含义（假设，未检验）",
    "favored": "相对有利",
    "disfavored": "相对不利",
    "watch": "监测序列",
    "offNote": "判断层关闭：不标记剧本，不显示规则命中。",
    "mark": "F4 判定",
    "earlier": "F4 判定对应较早快照 {date}，本页不标记。"
  },
  "f4": {
    "title": "F4 判断摘要",
    "category": "类别",
    "lifecycleLabel": "生命周期",
    "lifecycle": {"open": "进行中", "settled": "已结算", "settled_hit": "已结算：命中", "settled_miss": "已结算：未命中", "other": "{value}"},
    "calibration": "校准状态：{value}",
    "calibrationState": {"insufficient_sample": "未校准（样本不足）", "uncalibrated": "未校准", "calibrated": "已校准", "stale": "校准已过期"},
    "method": "方法 {id}@{version}",
    "asOf": "截至 {date}",
    "link": "查看方法页",
    "noNumbers": "本页不显示 F4 的分布、差值与历史命中数字。"
  },
  "regime": {"recovery": "复苏", "overheat": "过热", "stagflation": "滞胀", "recession": "衰退"},
  "matrix": {
    "title": "美联储政策 → 中美资产反应",
    "subtitle": "事件窗口 · 描述统计",
    "windowLabel": "窗口",
    "window": "{n} 个月",
    "policy": "政策",
    "rows": {"hike": "加息", "cut": "降息", "qe_qt": "QE / QT"},
    "coverage": "样本 {from} 至 {to}",
    "noCoverage": "无样本区间",
    "quartiles": "{q1} 至 {q3} · n={n}",
    "n": "n={n}",
    "fewEvents": "n < 5，只给逐事件表",
    "insufficient": "无合格事件",
    "footer": "中位数与四分位（type-7）；n 为独立完整事件数；基期为生效月前一月月末，末期为生效月起第 N 个月末（含生效月）；重叠窗口只保留较早事件；过去的事件窗口不构成预测。",
    "drawerTitle": "{direction} · {dim} · {n} 个月窗口",
    "selected": "入选",
    "excluded": "未计入",
    "columns": {"date": "生效日", "changeBp": "政策变化", "base": "基期月末", "end": "末期月末", "change": "变化", "status": "状态"},
    "exclusion": {"incomplete_window": "窗口不完整", "overlap": "窗口与较早入选事件重叠", "non_positive_base": "基值非正", "missing_endpoint": "端点缺失"}
  },
  "history": {
    "title": "联储政策行动段 × 资产区间变化",
    "subtitle": "回溯事实表 · 描述统计",
    "boundaryLabel": "边界",
    "boundary": {"event_day": "事件日", "first_trading_day": "首个交易日", "month_end": "月末"},
    "boundaryDef": {
      "event_day": "起值为行动段首个生效日之前最后一条日观测，止值为末个生效日当天或之前最近一条日观测。",
      "first_trading_day": "起值为首个生效日当天或之后第一条日观测，止值为末个生效日当天或之后第一条日观测。",
      "month_end": "起值为首个生效日所在月前一月的月末观测，止值为末个生效日所在月的月末观测；当月未结束则缺失。"
    },
    "coverageNote": "所选观测与边界日期相差超过 7 个自然日，或不是所需月份，记为缺失。",
    "episode": "行动段",
    "direction": {"hike": "加息", "cut": "降息"},
    "episodeLine": "上限 {from} → {to} · 累计 {bp} · {n} 次",
    "flag": {"leftCensored": "左删失：起点可能早于数据", "ongoing": "进行中：止日为最后一个事件生效日", "gapAfter": "数据缺口：衔接事件无法核实"},
    "missing": {"out_of_coverage": "超出覆盖", "degenerate": "起止为同一观测", "non_positive_base": "基值非正", "history_truncated": "历史读取未完成", "month_not_closed": "月份未结束"},
    "medians": "每列中位数",
    "mediansNote": "各列独立刻度，仅作形状参考",
    "medianLine": "{value} · n={n}",
    "footer": "观测的可得时间为首次采集时间（first_seen），本表是回溯事实表，不代表当时可知",
    "gaps": "数据缺口",
    "cellTitle": "{episode} · {column}",
    "noEpisodes": "没有政策行动段",
    "eventsTruncated": "政策事件序列读取被截断：无法列出行动段（这不是“没有行动段”）"
  },
  "review": {
    "title": "月度复盘",
    "indexSubtitle": "区域 × 月份 · 每月 3 日 06:00 UTC 生成上一个月",
    "month": "月份",
    "status": {"ok": "已生成", "insufficient": "数据不足", "none": "无结果"},
    "generatedAt": "生成于 {time}",
    "scope": "月末对月末比较，不是逐日活动账本；截止为次月 3 日 00:00 UTC。",
    "insufficient": "本月截止时没有非 failed 快照，只记录原因。",
    "section": {"releases": "新发布", "revisions": "修订", "timeliness": "迟发与缺失", "policy_events": "政策事件", "episode_changes": "政策行动段变化", "asset_moves": "资产月度变化", "coverage": "目录覆盖（计数）"},
    "empty": "本月无变化",
    "baselineMissing": "基线截止（本月 3 日 00:00 UTC）时无快照，本节为空",
    "revisionScope": "只覆盖各序列在快照中的最新期；更早期的修订不在 v1 范围。",
    "judgment": "判断（F4，读取时取得）",
    "back": "复盘列表",
    "openSeries": "查看指标",
    "footer": "方法 {method} · 清单 {manifest} · 输入哈希 {hash} · 代码版本 {code} · 代际 {generation}"
  },
  "explain": {
    "title": "解读",
    "state": {"none": "未生成", "running": "生成中", "accepted": "已接受", "rejected": "未通过校验", "failed": "失败"},
    "header": "绑定 {subject} · 清单 {manifest} · 模型 {model} · 提示 {prompt} · 校验 {validator}",
    "subject": {"snapshot": "快照 {id}", "review": "复盘 {id}"},
    "disclaimer": "事实句由系统从冻结数据生成；机制假设由模型生成，未经核实。",
    "intro": "生成后先显示系统事实句，再显示模型写的机制假设；含数字或禁用词的模型文本不会显示。",
    "generate": "生成解读",
    "regenerate": "重新生成",
    "retry": "重试",
    "refresh": "刷新状态",
    "remaining": "今日剩余 {n} 次",
    "unlimited": "今日不限次数",
    "facts": "事实（系统生成）",
    "hypotheses": "机制假设（模型生成，未经核实）",
    "counterpoints": "反例与限制（模型生成，未经核实）",
    "refs": "依据事实 {refs}",
    "runningBody": "模型生成中，随后做确定性校验。",
    "runningStale": "超过 {minutes} 分钟仍在运行的请求，刷新状态时会标记为失败，之后可重新生成。",
    "rejectedBody": "不显示模型文本。校验失败项：",
    "failedBody": "模型调用失败，没有可校验的文字。可以用新请求重试。",
    "quota": "今日次数已用完",
    "conflict": "同一请求编号对应了不同内容（{code}）",
    "error": "请求失败（{code}）",
    "noModel": "未配置可用的模型",
    "noFacts": "该主体没有可解读的事实",
    "noSubject": "找不到要解读的快照或复盘",
    "failure": {"parse": "输出无法解析", "schema": "结构不符", "unknown_fact": "引用了不存在的事实", "numeral": "含数字记号", "forbidden_term": "含禁用词", "regime_term": "含象限词", "abandoned": "生成超时被放弃", "provider_error": "模型调用失败", "validator_version_changed": "校验器版本已更新，原输出未重新判定", "usage_audit_unavailable": "计量暂不可用", "usage_audit_invariant": "计量记录不一致", "daily_cost_exhausted": "今日平台成本额度已用完", "pricing_unavailable": "该模型缺少定价", "budget_unavailable": "成本预算暂不可用", "budget_invariant_violation": "成本预算记录不一致"}
  },
  "deviation": {
    "title": "偏差案例",
    "subtitle": "登记时输入与结算时重算输入的差异",
    "selected": "选定",
    "realized": "实现",
    "asOf": "截至 {date}",
    "evidence": {"complete": "证据完整", "evidence_incomplete": "证据不完整：结算证据缺少重算输入"},
    "incomplete": "案例列表不完整（超过枚举上限）",
    "none": "没有未命中的已结算判断",
    "showUnchanged": "显示未变化项",
    "hideUnchanged": "收起未变化项",
    "unchangedHidden": "另有 {n} 项未变化，已折叠",
    "noNarrative": "只列输入差异，不写叙事。",
    "columns": {"series": "序列", "period": "数据期", "role": "用途", "kind": "差异", "registered": "登记时", "settled": "结算时"},
    "role": {"latest": "最新期", "comparison": "比较期"},
    "kind": {"revised": "已修订", "dropped": "结算时缺失", "unchanged": "未变化", "newly_available": "新增可得"},
    "subkind": {"later_period": "更晚数据期", "backfill": "回补", "new_series": "新序列"}
  }
}
```

Create `messages/en/macroStrategy.json`:

```json
{
  "tabs": {"workbench": "Macro workbench", "transmission": "Transmission", "history": "History", "review": "Review"},
  "region": {"label": "Region", "US": "US", "CN": "China"},
  "meta": {"manifest": "Manifest {id}", "manifestLink": "Full manifest", "cutoff": "Cutoff {time}", "catalog": "Catalog {version}", "method": "Method {version}"},
  "dependency": {
    "loading": "Loading…",
    "foundationTitle": "Macro data foundation not ready",
    "foundationBody": "Transmission, history and review read macro snapshots, observations and policy events, and those are not wired yet. The page does not assemble charts from empty data.",
    "judgmentsUnavailable": "Judgment layer unavailable",
    "judgmentsUnavailableBody": "The F4 judgment service cannot be reached, or there is no usable judgment card. Facts are shown as usual and no playbook is marked.",
    "noSnapshot": "No published snapshot yet",
    "notFound": "No such record",
    "loadFailed": "Could not load ({code})",
    "retry": "Load again"
  },
  "state": {"observed": "Observed", "derived": "Derived", "assumption": "Assumption", "missing": "Missing", "restricted": "Restricted", "not_in_catalog": "Not in catalog"},
  "view": {"table": "Table view", "chart": "Chart", "flow": "Flow", "close": "Close"},
  "flow": {
    "title": "Live transmission flow",
    "legend": "Badges name each node's source; arrows are untested mechanism assumptions",
    "edge": "Mechanism assumption: {text}",
    "openDerived": "View inputs",
    "openSeries": "View indicator",
    "derivedTitle": "Derived · {label}",
    "formulaNote": "Both inputs must be observations of the same period and are subtracted as exact decimals; different periods are never subtracted.",
    "columns": {"stage": "Stage", "node": "Node", "state": "State", "value": "Value", "period": "Period", "reason": "Note"}
  },
  "evidence": {
    "columns": {"series": "Series", "period": "Period", "value": "Value", "version": "Version", "available": "Available (first seen)", "source": "Taken from"},
    "fromSnapshot": "Snapshot {id}",
    "fromHistory": "History read (as of {asOf})",
    "observation": "Observation {id}"
  },
  "playbook": {
    "title": "Playbooks",
    "subtitle": "Static hypothesis framework, not a call",
    "supportNote": "Rule support is a rule-table parameter and is never shown as a percentage",
    "triggers": "Triggers (rule table text · rule support)",
    "mechanism": "Mechanism chain (assumption)",
    "implications": "Allocation implications (assumption, untested)",
    "favored": "Relatively favoured",
    "disfavored": "Relatively disfavoured",
    "watch": "Series to watch",
    "offNote": "Judgment layer off: no playbook is marked and no rule hits are shown.",
    "mark": "F4 call",
    "earlier": "The F4 call refers to an earlier snapshot ({date}); nothing is marked here."
  },
  "f4": {
    "title": "F4 judgment summary",
    "category": "Category",
    "lifecycleLabel": "Lifecycle",
    "lifecycle": {"open": "Open", "settled": "Settled", "settled_hit": "Settled: hit", "settled_miss": "Settled: miss", "other": "{value}"},
    "calibration": "Calibration: {value}",
    "calibrationState": {"insufficient_sample": "Not calibrated (insufficient sample)", "uncalibrated": "Not calibrated", "calibrated": "Calibrated", "stale": "Calibration expired"},
    "method": "Method {id}@{version}",
    "asOf": "As of {date}",
    "link": "Open method page",
    "noNumbers": "This page shows no F4 distribution, margin or historical hit numbers."
  },
  "regime": {"recovery": "Recovery", "overheat": "Overheat", "stagflation": "Stagflation", "recession": "Recession"},
  "matrix": {
    "title": "Fed policy → US and China asset response",
    "subtitle": "Event windows · descriptive statistics",
    "windowLabel": "Window",
    "window": "{n} months",
    "policy": "Policy",
    "rows": {"hike": "Hike", "cut": "Cut", "qe_qt": "QE / QT"},
    "coverage": "Sample {from} to {to}",
    "noCoverage": "No sample range",
    "quartiles": "{q1} to {q3} · n={n}",
    "n": "n={n}",
    "fewEvents": "n < 5: per-event table only",
    "insufficient": "No eligible events",
    "footer": "Median and quartiles (type-7); n counts independent complete events; base = month end before the effective month, end = the Nth month end counting the effective month; overlapping windows keep the earlier event; past event windows are not a forecast.",
    "drawerTitle": "{direction} · {dim} · {n}-month window",
    "selected": "Selected",
    "excluded": "Excluded",
    "columns": {"date": "Effective date", "changeBp": "Policy change", "base": "Base month end", "end": "End month end", "change": "Change", "status": "Status"},
    "exclusion": {"incomplete_window": "Incomplete window", "overlap": "Window overlaps an earlier selected event", "non_positive_base": "Non-positive base", "missing_endpoint": "Missing endpoint"}
  },
  "history": {
    "title": "Fed policy action episodes × asset interval changes",
    "subtitle": "Retrospective fact table · descriptive statistics",
    "boundaryLabel": "Boundary",
    "boundary": {"event_day": "Event day", "first_trading_day": "First trading day", "month_end": "Month end"},
    "boundaryDef": {
      "event_day": "From = the last daily observation before the episode's first effective date; to = the last daily observation on or before its last effective date.",
      "first_trading_day": "From = the first daily observation on or after the first effective date; to = the first daily observation on or after the last effective date.",
      "month_end": "From = the month-end observation of the month before the first effective date; to = the month-end observation of the last effective date's month, missing while that month is open."
    },
    "coverageNote": "An observation more than 7 calendar days from its boundary date, or not in the required month, counts as missing.",
    "episode": "Episode",
    "direction": {"hike": "Hiking", "cut": "Cutting"},
    "episodeLine": "Upper bound {from} → {to} · cumulative {bp} · {n} moves",
    "flag": {"leftCensored": "Left-censored: the start may predate the data", "ongoing": "Ongoing: the end is the last event's effective date", "gapAfter": "Data gap: the transition event cannot be verified"},
    "missing": {"out_of_coverage": "Out of coverage", "degenerate": "Same observation at both ends", "non_positive_base": "Non-positive base", "history_truncated": "History read incomplete", "month_not_closed": "Month not closed"},
    "medians": "Column medians",
    "mediansNote": "Each column on its own scale, for shape only",
    "medianLine": "{value} · n={n}",
    "footer": "Availability is the first-seen collection time (first_seen); this is a retrospective fact table, not what was knowable at the time",
    "gaps": "Data gap",
    "cellTitle": "{episode} · {column}",
    "noEpisodes": "No policy action episodes",
    "eventsTruncated": "The policy event history read was truncated: episodes cannot be listed (this is not an empty history)"
  },
  "review": {
    "title": "Monthly review",
    "indexSubtitle": "Region × month · built on the 3rd at 06:00 UTC for the previous month",
    "month": "Month",
    "status": {"ok": "Generated", "insufficient": "Insufficient data", "none": "No result"},
    "generatedAt": "Generated {time}",
    "scope": "Month end versus month end, not a daily activity ledger; the cutoff is the 3rd of the next month, 00:00 UTC.",
    "insufficient": "No non-failed snapshot existed at this month's cutoff; only the reason is recorded.",
    "section": {"releases": "New releases", "revisions": "Revisions", "timeliness": "Late and missing", "policy_events": "Policy events", "episode_changes": "Policy episode changes", "asset_moves": "Monthly asset moves", "coverage": "Catalog coverage (counts)"},
    "empty": "No change this month",
    "baselineMissing": "No snapshot at the baseline cutoff (the 3rd of this month, 00:00 UTC); this section is empty",
    "revisionScope": "Covers only each series' latest period in the snapshot; earlier revisions are outside v1.",
    "judgment": "Judgment (F4, read at view time)",
    "back": "Review list",
    "openSeries": "View indicator",
    "footer": "Method {method} · manifest {manifest} · input hash {hash} · code version {code} · generation {generation}"
  },
  "explain": {
    "title": "Explanation",
    "state": {"none": "Not generated", "running": "Generating", "accepted": "Accepted", "rejected": "Failed validation", "failed": "Failed"},
    "header": "Bound to {subject} · manifest {manifest} · model {model} · prompt {prompt} · validator {validator}",
    "subject": {"snapshot": "snapshot {id}", "review": "review {id}"},
    "disclaimer": "Fact sentences are generated by the system from frozen data; mechanism hypotheses are written by the model and are unverified.",
    "intro": "The system's fact sentences come first, then the model's mechanism hypotheses; model text containing numbers or forbidden terms is never shown.",
    "generate": "Generate explanation",
    "regenerate": "Generate again",
    "retry": "Retry",
    "refresh": "Refresh status",
    "remaining": "{n} left today",
    "unlimited": "No daily limit",
    "facts": "Facts (system generated)",
    "hypotheses": "Mechanism hypotheses (model generated, unverified)",
    "counterpoints": "Counterpoints and limits (model generated, unverified)",
    "refs": "Based on facts {refs}",
    "runningBody": "The model is writing; deterministic validation follows.",
    "runningStale": "A request still running after {minutes} minutes is marked failed when you refresh; you can then generate again.",
    "rejectedBody": "Model text is not shown. Validation failures:",
    "failedBody": "The model call failed and produced no text to validate. A new request can retry.",
    "quota": "No runs left today",
    "conflict": "This request id was already used for different content ({code})",
    "error": "Request failed ({code})",
    "noModel": "No model is configured",
    "noFacts": "This subject has no facts to explain",
    "noSubject": "The snapshot or review to explain was not found",
    "failure": {"parse": "Output could not be parsed", "schema": "Wrong structure", "unknown_fact": "Cites a fact that does not exist", "numeral": "Contains a number token", "forbidden_term": "Contains a forbidden term", "regime_term": "Contains a regime term", "abandoned": "Abandoned after a timeout", "provider_error": "Model call failed", "validator_version_changed": "Validator updated; the stored output was not re-judged", "usage_audit_unavailable": "Metering unavailable", "usage_audit_invariant": "Metering record inconsistent", "daily_cost_exhausted": "Today's platform cost budget is used up", "pricing_unavailable": "No pricing for this model", "budget_unavailable": "Cost budget unavailable", "budget_invariant_violation": "Cost budget record inconsistent"}
  },
  "deviation": {
    "title": "Deviation cases",
    "subtitle": "Inputs at registration versus inputs recomputed at settlement",
    "selected": "Selected",
    "realized": "Realized",
    "asOf": "As of {date}",
    "evidence": {"complete": "Evidence complete", "evidence_incomplete": "Evidence incomplete: the settlement evidence lacks recomputed inputs"},
    "incomplete": "Case list incomplete (enumeration limit reached)",
    "none": "No settled judgment missed",
    "showUnchanged": "Show unchanged rows",
    "hideUnchanged": "Hide unchanged rows",
    "unchangedHidden": "{n} unchanged rows folded",
    "noNarrative": "Input differences only, no narrative.",
    "columns": {"series": "Series", "period": "Period", "role": "Role", "kind": "Difference", "registered": "At registration", "settled": "At settlement"},
    "role": {"latest": "Latest", "comparison": "Comparison"},
    "kind": {"revised": "Revised", "dropped": "Dropped at settlement", "unchanged": "Unchanged", "newly_available": "Newly available"},
    "subkind": {"later_period": "Later period", "backfill": "Backfill", "new_series": "New series"}
  }
}
```

Modify `src/i18n/request.ts`. Replace:

```ts
  // Analyst scoring layer (spec 2026-10-17):
  'analyst',
] as const;
```

with:

```ts
  // Analyst scoring layer (spec 2026-10-17):
  'analyst',
  // MACRO-P3
  'macroStrategy',
  // /MACRO-P3
] as const;
```

If the P1 `// MACRO` block (`'macro'`) is already present when this task runs, keep it and put the `// MACRO-P3` block directly after it; the test matches only the MACRO-P3 block.

- [ ] **Step 7: Run both tests to verify they pass**

Run: `npm test -- src/components/macro/strategy`
Expected: PASS, `Tests  38 passed (38)` (view model 33, messages 5).

- [ ] **Step 8: Add the hooks**

Create `src/components/macro/strategy/use-strategy-t.ts`:

```ts
// src/components/macro/strategy/use-strategy-t.ts
// Translation hook for the macroStrategy domain (spec §10). Components hand a plain `t` to the pure helpers in
// strategy-view-model.ts so those stay testable in node-env vitest.
import {useCallback} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import type {Locale,StrategyT} from './strategy-view-model';
export function useStrategyT():{t:StrategyT;locale:Locale}{
 const tr=useTranslations('macroStrategy');
 const locale:Locale=useLocale()==='en'?'en':'zh';
 const t=useCallback<StrategyT>((key,values)=>tr(key,values),[tr]);
 return {t,locale};
}
```

Create `src/components/macro/strategy/use-strategy-fetch.ts`:

```ts
// src/components/macro/strategy/use-strategy-fetch.ts
// Client fetch of one strategy API url into a LoadState (spec §9.1 states via loadStateOf). A null url fetches nothing.
import {useCallback,useEffect,useState} from 'react';
import {loadStateOf,type LoadState} from './strategy-view-model';
export function useStrategyFetch<T>(url:string|null):{state:LoadState<T>;reload:()=>void}{
 const [state,setState]=useState<LoadState<T>>({kind:'loading'});
 const [tick,setTick]=useState(0);
 useEffect(()=>{
  if(!url)return;
  let cancelled=false;
  setState({kind:'loading'});
  fetch(url,{credentials:'same-origin'})
   .then(async r=>{const body:unknown=await r.json().catch(()=>null);if(!cancelled)setState(loadStateOf<T>(r.status,body));})
   .catch(()=>{if(!cancelled)setState({kind:'error',code:'network'});});
  return ()=>{cancelled=true;};
 },[url,tick]);
 const reload=useCallback(()=>setTick(n=>n+1),[]);
 return {state,reload};
}
```

- [ ] **Step 9: Add the components**

Create `src/components/macro/strategy/DependencyState.tsx`:

```tsx
'use client';
// Dependency and empty states (spec §9.1, §11; canvas "依赖未就绪 / 复盘列表"): foundation not wired, judgment layer
// unavailable, no published snapshot, not found, load failure. Never renders placeholder data.
import { Button, Panel } from '@/components/ui';
import { useStrategyT } from './use-strategy-t';

export type DependencyKind = 'loading' | 'foundation' | 'judgments_unavailable' | 'no_snapshot' | 'not_found' | 'error';

export function DependencyState({ kind, code, onRetry }: { kind: DependencyKind; code?: string; onRetry?: () => void }) {
  const { t } = useStrategyT();
  if (kind === 'loading') return <div role="status" className="text-xs text-text-dim">{t('dependency.loading')}</div>;
  const title = kind === 'foundation' ? t('dependency.foundationTitle')
    : kind === 'judgments_unavailable' ? t('dependency.judgmentsUnavailable')
    : kind === 'no_snapshot' ? t('dependency.noSnapshot')
    : kind === 'not_found' ? t('dependency.notFound')
    : t('dependency.loadFailed', { code: code ?? 'unknown' });
  const body = kind === 'foundation' ? t('dependency.foundationBody')
    : kind === 'judgments_unavailable' ? t('dependency.judgmentsUnavailableBody')
    : null;
  return (
    <Panel role="status" className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {body ? <p className="text-xs text-text-dim">{body}</p> : null}
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>{t('dependency.retry')}</Button> : null}
    </Panel>
  );
}
```

Create `src/components/macro/strategy/EvidencePairDrawer.tsx`:

```tsx
'use client';
// Right-side evidence drawer (spec §3.2; canvas "推导 / 逐事件抽屉"): derived-node inputs, per-event rows of a matrix
// cell, the two endpoint observations of a history cell. ObsRefTable lists the frozen manifest inputs exactly.
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { ObsRef } from '@/lib/macro/strategy/contract';
import { formatInstant } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function EvidencePairDrawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useStrategyT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="h-full w-full max-w-[560px] space-y-3 overflow-y-auto border-l border-border bg-bg-elevated p-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} autoFocus>{t('view.close')}</Button>
        </div>
        {children}
      </div>
    </div>
  );
}

const COLUMNS = ['series', 'period', 'value', 'version', 'available', 'source'] as const;

export function ObsRefTable({ refs }: { refs: ObsRef[] }) {
  const { t } = useStrategyT();
  if (refs.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-dim">
              {COLUMNS.map((k) => <th key={k} className="px-1.5 py-1 font-medium">{t(`evidence.columns.${k}`)}</th>)}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {refs.map((r) => (
              <tr key={r.observation_id} className="border-t border-border">
                <td className="px-1.5 py-1">{r.series_id}</td>
                <td className="px-1.5 py-1">{r.period_end}</td>
                <td className="px-1.5 py-1">{r.value_text}</td>
                <td className="px-1.5 py-1">v{r.version}</td>
                <td className="px-1.5 py-1">{formatInstant(r.available_at)}</td>
                <td className="px-1.5 py-1">
                  {r.source.kind === 'snapshot'
                    ? t('evidence.fromSnapshot', { id: r.source.snapshot_id })
                    : t('evidence.fromHistory', { asOf: formatInstant(r.source.as_of) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="break-all font-mono text-[10px] text-text-dim">
        {refs.map((r) => t('evidence.observation', { id: r.observation_id })).join(' · ')}
      </p>
    </div>
  );
}
```

Create `src/components/macro/strategy/F4Summary.tsx`:

```tsx
'use client';
// Number-free F4 summary (spec §5.2 N12, §7): category, lifecycle words, calibration words, method id@version, as-of
// date and a link to the F4 method page. Never a distribution, margin, hit rate or percentage.
import Link from 'next/link';
import { Panel } from '@/components/ui';
import type { F4Summary } from '@/lib/macro/strategy/contract';
import { f4SummaryDisplay } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function F4SummaryPanel({ summary }: { summary: F4Summary }) {
  const { t } = useStrategyT();
  const d = f4SummaryDisplay(summary, t);
  return (
    <Panel title={t('f4.title')} className="space-y-1 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-dim">{t('f4.category')}</dt><dd>{d.category}</dd>
        <dt className="text-text-dim">{t('f4.lifecycleLabel')}</dt><dd>{d.lifecycle}</dd>
      </dl>
      <p>{d.calibration}</p>
      <p className="font-mono text-text-dim">{d.method} · {d.asOf}</p>
      {d.href ? <Link href={d.href} className="text-accent hover:underline">{t('f4.link')}</Link> : null}
      <p className="text-[10px] text-text-dim">{t('f4.noNumbers')}</p>
    </Panel>
  );
}
```

Create `src/components/macro/strategy/TransmissionFlow.tsx`:

```tsx
'use client';
// Live transmission flow (spec §3.3, §5.1): six stages, text badges for node states (never colour alone), edges are
// mechanism assumptions, derived nodes open their two inputs. Stages stack vertically below lg; a table view lists
// every node.
import Link from 'next/link';
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { NodeView, TransmissionView } from '@/lib/macro/strategy/contract';
import { EvidencePairDrawer, ObsRefTable } from './EvidencePairDrawer';
import { flowRows, nodeDisplay } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function TransmissionFlow({ view }: { view: TransmissionView }) {
  const { t, locale } = useStrategyT();
  const [table, setTable] = useState(false);
  const [open, setOpen] = useState<NodeView | null>(null);
  const openDisplay = open ? nodeDisplay(open, locale) : null;
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('flow.title')}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-dim">{t('flow.legend')}</span>
          <Button variant="ghost" size="sm" aria-pressed={table} onClick={() => setTable((v) => !v)}>
            {table ? t('view.flow') : t('view.table')}
          </Button>
        </div>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-dim">
                {(['stage', 'node', 'state', 'value', 'period', 'reason'] as const).map((k) => (
                  <th key={k} className="px-1.5 py-1 font-medium">{t(`flow.columns.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flowRows(view, locale).map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-1.5 py-1">{r.stage}</td>
                  <td className="px-1.5 py-1">{r.node}</td>
                  <td className="px-1.5 py-1">{t(r.stateKey)}</td>
                  <td className="px-1.5 py-1 font-mono tabular-nums">{r.value}</td>
                  <td className="px-1.5 py-1 font-mono tabular-nums">{r.period}</td>
                  <td className="px-1.5 py-1 text-text-dim">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          {view.stages.map((s, i) => (
            <li key={s.stage} className="space-y-2">
              <div className="text-[11px] text-text-dim">{i + 1}. {s.label[locale]}</div>
              {s.nodes.map((n) => <NodeCard key={n.id} node={n} onOpen={setOpen} />)}
              {s.edge ? <p className="text-[11px] text-text-dim">{t('flow.edge', { text: s.edge.text[locale] })}</p> : null}
            </li>
          ))}
        </ol>
      )}
      <EvidencePairDrawer open={open !== null} title={openDisplay ? t('flow.derivedTitle', { label: openDisplay.label }) : ''} onClose={() => setOpen(null)}>
        {open && openDisplay ? (
          <div className="space-y-2">
            {openDisplay.formula ? <p className="font-mono text-sm tabular-nums">{openDisplay.formula}{openDisplay.unit}</p> : null}
            {openDisplay.reason ? <p className="text-xs text-text-dim">{openDisplay.reason}</p> : null}
            <p className="text-[11px] text-text-dim">{t('flow.formulaNote')}</p>
            <ObsRefTable refs={open.inputs} />
          </div>
        ) : null}
      </EvidencePairDrawer>
    </Panel>
  );
}

function NodeCard({ node, onOpen }: { node: NodeView; onOpen: (n: NodeView) => void }) {
  const { t, locale } = useStrategyT();
  const d = nodeDisplay(node, locale);
  return (
    <div className={`rounded p-2 ${d.dashed ? 'border border-dashed border-border' : 'bg-bg-card'}`}>
      <Tag>{t(d.badgeKey)}</Tag>
      <div className="mt-1 text-xs">{d.label}</div>
      {d.value !== null ? <div className="font-mono text-[15px] tabular-nums">{d.value}{d.unit}</div> : null}
      {d.formula ? <div className="font-mono text-[10px] tabular-nums text-text-dim">{d.formula}</div> : null}
      {d.period ? <div className="font-mono text-[10px] text-text-dim">{d.period}</div> : null}
      {d.reason ? <div className="text-[10px] text-text-dim">{d.reason}</div> : null}
      {d.drill || d.seriesId ? (
        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
          {d.drill ? <button type="button" className="text-accent hover:underline" onClick={() => onOpen(node)}>{t('flow.openDerived')}</button> : null}
          {d.seriesId ? <Link className="text-accent hover:underline" href={`/intel/macro/${d.seriesId}`}>{t('flow.openSeries')}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
```

Create `src/components/macro/strategy/PlaybookGrid.tsx`:

```tsx
'use client';
// Playbook library (spec §3.3, §5.2): four neutral cards of a static hypothesis framework. Trigger rows are the rule
// table verbatim with the rule parameter; mechanism and implications are labelled assumptions. A brass outline and the
// "F4 判定" word appear only for the F4 card category on the manifest's snapshot; cards never show an F4 number.
// Below sm each card collapses into a <details>.
import Link from 'next/link';
import { Panel, Tag } from '@/components/ui';
import type { F4Mark, F4Summary, JudgmentStatus, PlaybookView } from '@/lib/macro/strategy/contract';
import { PLAYBOOK_DISCLAIMER_V1 } from '@/lib/macro/strategy/data/playbooks-v1';
import { F4SummaryPanel } from './F4Summary';
import { playbookCards, playbookNotice, type PlaybookCard } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function PlaybookGrid({ playbooks, judgment }: { playbooks: PlaybookView[]; judgment: { status: JudgmentStatus; f4?: { mark: F4Mark; summary: F4Summary } } }) {
  const { t, locale } = useStrategyT();
  const f4 = judgment.f4 ?? null;
  const cards = playbookCards(playbooks, locale, f4);
  const notice = playbookNotice(judgment.status, f4);
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('playbook.title')} <span className="text-xs font-normal text-text-dim">{t('playbook.subtitle')}</span></h2>
        <span className="text-[11px] text-text-dim">{t('playbook.supportNote')}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.regime} className={`rounded-md border p-3 ${c.marked ? 'border-[var(--border-active)] bg-[var(--accent-wash)]' : 'border-border'}`}>
            <div className="hidden sm:block"><CardBody card={c} /></div>
            <details className="sm:hidden">
              <summary className="cursor-pointer text-sm font-semibold">{c.title}{c.marked ? ` · ${t('playbook.mark')}` : ''}</summary>
              <CardBody card={c} />
            </details>
          </div>
        ))}
      </div>
      {notice ? <p className="text-[11px] text-text-dim">{notice.key === 'playbook.earlier' ? t(notice.key, { date: notice.date }) : t(notice.key)}</p> : null}
      {f4 ? <F4SummaryPanel summary={f4.summary} /> : null}
    </Panel>
  );
}

function CardBody({ card }: { card: PlaybookCard }) {
  const { t, locale } = useStrategyT();
  return (
    <div className="space-y-2 text-xs">
      <div className="hidden items-center justify-between gap-2 sm:flex">
        <span className="text-sm font-semibold">{card.title}</span>
        {card.marked ? <Tag tone="accent">{t('playbook.mark')}</Tag> : null}
      </div>
      <div className="text-[11px] text-text-dim">{t('playbook.triggers')}</div>
      <ul className="space-y-0.5 font-mono tabular-nums">{card.triggers.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="text-[11px] text-text-dim">{t('playbook.mechanism')}</div>
      <p className="text-text-dim">{card.mechanism.join(' → ')}</p>
      <div className="text-[11px] text-text-dim">{t('playbook.implications')}</div>
      <p className="text-text-dim">{t('playbook.favored')}：{card.favored.join('、')} · {t('playbook.disfavored')}：{card.disfavored.join('、')}</p>
      <p className="text-[10px] text-text-dim">{PLAYBOOK_DISCLAIMER_V1[locale]}</p>
      {card.watch.length > 0 ? (
        <p className="text-[11px] text-text-dim">
          {t('playbook.watch')}{' '}
          {card.watch.map((w, i) => (
            <span key={w.id}>{i > 0 ? ' · ' : ''}<Link href={`/intel/macro/${w.id}`} className="text-accent hover:underline">{w.name}</Link></span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
```

Create `src/components/macro/strategy/PolicyResponseMatrix.tsx`:

```tsx
'use client';
// Fed policy → US/CN asset response matrix (spec §3.3, §5.3): rows hike / cut / QE·QT, columns are dimensions with
// their real coverage in the header, cells give the median with type-7 quartiles and n (n < 5 → per-event only), asset
// moves washed by sign in three levels. A cell opens the per-event drawer (selected and excluded events with reasons).
// Below sm the table becomes one list per column.
import { useMemo, useState } from 'react';
import { Button, Panel } from '@/components/ui';
import type { Cell, PolicyResponseView, ResponseDim } from '@/lib/macro/strategy/contract';
import { EvidencePairDrawer } from './EvidencePairDrawer';
import { cellEvents, cellOf, coverageText, dimLabel, eventRows, matrixCell, matrixGroups, matrixScale, toneClass, toneLevel, uniformReason } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

const WINDOWS = [1, 3, 6] as const;

export function PolicyResponseMatrix({ view, window, onWindow }: { view: PolicyResponseView; window: 1 | 3 | 6; onWindow: (w: 1 | 3 | 6) => void }) {
  const { t, locale } = useStrategyT();
  const [drill, setDrill] = useState<{ direction: string; dim: ResponseDim; cell: Cell } | null>(null);
  const scale = useMemo(() => matrixScale(view), [view]);
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('matrix.title')} <span className="text-xs font-normal text-text-dim">{t('matrix.subtitle')}</span></h2>
        <div className="flex items-center gap-1" role="group" aria-label={t('matrix.windowLabel')}>
          {WINDOWS.map((w) => (
            <Button key={w} size="sm" variant={w === window ? 'primary' : 'secondary'} aria-pressed={w === window} onClick={() => onWindow(w)}>
              {t('matrix.window', { n: w })}
            </Button>
          ))}
        </div>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-right text-text-dim">
              <th className="px-1.5 py-1 text-left font-medium">{t('matrix.policy')}</th>
              {view.dims.map((d) => (
                <th key={d.id} className="px-1.5 py-1 font-medium" title={coverageText(d, t)}>
                  {dimLabel(d, locale)}<div className="text-[10px] font-normal">{coverageText(d, t)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const uniform = uniformReason(row, view.dims, locale);
              return (
                <tr key={row.direction} className="border-t border-border">
                  <th scope="row" className="px-1.5 py-2 text-left font-normal">{t(`matrix.rows.${row.direction}`)}</th>
                  {uniform !== null ? (
                    <td colSpan={view.dims.length} className="px-1.5 py-2 text-left text-text-dim">{t('state.missing')}：{uniform}</td>
                  ) : view.dims.map((d) => {
                    const cell = cellOf(row, d.id);
                    const c = matrixCell(cell, locale, t);
                    const body = (
                      <>
                        <div className="font-mono tabular-nums">{c.main}</div>
                        {c.sub ? <div className="text-[10px] text-text-dim">{c.sub}</div> : null}
                      </>
                    );
                    return (
                      <td key={d.id} className={`px-1.5 py-2 text-right ${toneClass(c.tone, toneLevel(c.raw, scale[d.id] ?? 0))}`}>
                        {c.drill ? (
                          <button type="button" className="w-full text-right hover:underline" onClick={() => setDrill({ direction: row.direction, dim: d, cell })}>{body}</button>
                        ) : body}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 sm:hidden">
        {matrixGroups(view, locale, t).map((g) => (
          <section key={g.id} className="rounded border border-border p-2">
            <h3 className="text-xs font-semibold">{g.label}</h3>
            <p className="text-[10px] text-text-dim">{g.coverage}</p>
            <ul className="mt-1 space-y-1 text-xs">
              {g.rows.map((r) => (
                <li key={r.direction} className="flex justify-between gap-2">
                  <span>{t(`matrix.rows.${r.direction}`)}</span>
                  <span className="text-right"><span className="font-mono tabular-nums">{r.cell.main}</span>{r.cell.sub ? <span className="block text-[10px] text-text-dim">{r.cell.sub}</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-[11px] text-text-dim">{t('matrix.footer')}</p>
      {view.sentences.map((s, i) => <p key={i} className="text-xs text-text-dim">{s[locale]}</p>)}
      <EvidencePairDrawer
        open={drill !== null}
        title={drill ? t('matrix.drawerTitle', { direction: t(`matrix.rows.${drill.direction}`), dim: drill.dim.label[locale], n: view.window }) : ''}
        onClose={() => setDrill(null)}
      >
        {drill ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-dim">
                  {(['date', 'changeBp', 'base', 'end', 'change', 'status'] as const).map((k) => <th key={k} className="px-1.5 py-1 font-medium">{t(`matrix.columns.${k}`)}</th>)}
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {eventRows(cellEvents(drill.cell), drill.dim.unit).map((e) => (
                  <tr key={e.key} className={`border-t border-border ${e.selected ? '' : 'text-text-dim'}`}>
                    <td className="px-1.5 py-1">{e.date}</td>
                    <td className="px-1.5 py-1">{e.changeBp}</td>
                    <td className="px-1.5 py-1">{e.base}</td>
                    <td className="px-1.5 py-1">{e.end}</td>
                    <td className="px-1.5 py-1">{e.change}</td>
                    <td className="px-1.5 py-1 font-sans">{e.selected ? t('matrix.selected') : `${t('matrix.excluded')}：${e.exclusionKey ? t(e.exclusionKey) : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </EvidencePairDrawer>
    </Panel>
  );
}
```

Create `src/components/macro/strategy/CycleReturnsTable.tsx`:

```tsx
'use client';
// Policy action episodes × asset interval changes (spec §3.4, §5.5): boundary switch with its definition, episode
// header (direction, effective dates, upper bound from → to, cumulative bp, event count, left-censored / ongoing / data
// gap), cells with change and "from (date) → to (date)", the endpoint evidence drawer, a per-column median chart with a
// table toggle, and the first_seen footer. Below sm the table becomes one list per column.
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { Boundary, CycleTableView, ObsRef } from '@/lib/macro/strategy/contract';
import { EvidencePairDrawer, ObsRefTable } from './EvidencePairDrawer';
import { MISSING, barGeometry, columnMedians, cycleCell, cycleCellOf, cycleGroups, cycleScale, episodeView, episodesEmptyKey, formatRaw, shortId, strategyApi, toneClass, toneLevel } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

const BOUNDARIES: readonly Boundary[] = ['event_day', 'first_trading_day', 'month_end'];

export function CycleReturnsTable({ view, boundary, onBoundary }: { view: CycleTableView; boundary: Boundary; onBoundary: (b: Boundary) => void }) {
  const { t, locale } = useStrategyT();
  const [drill, setDrill] = useState<{ title: string; refs: ObsRef[] } | null>(null);
  const [mediansAsTable, setMediansAsTable] = useState(false);
  const medians = columnMedians(view);
  return (
    <div className="space-y-3">
      <Panel className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('history.title')} <span className="text-xs font-normal text-text-dim">{t('history.subtitle')}</span></h2>
          <div className="flex items-center gap-1" role="group" aria-label={t('history.boundaryLabel')}>
            {BOUNDARIES.map((b) => (
              <Button key={b} size="sm" variant={b === boundary ? 'primary' : 'secondary'} aria-pressed={b === boundary} onClick={() => onBoundary(b)}>{t(`history.boundary.${b}`)}</Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-dim">{t(`history.boundaryDef.${view.boundary}`)}</p>
        <p className="text-[11px] text-text-dim">{t('history.coverageNote')}</p>
        {view.gaps.length > 0 ? (
          <ul className="text-[11px] text-text-dim">{view.gaps.map((g) => <li key={`${g.kind}:${g.near}`}>{t('history.gaps')}：{g.near} · {g.reason}</li>)}</ul>
        ) : null}
      </Panel>
      <Panel>
        {episodesEmptyKey(view) ? <p role="status" className="text-xs text-text-dim">{t(episodesEmptyKey(view)!)}</p> : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-text-dim">
                    <th className="px-1.5 py-1 text-left font-medium">{t('history.episode')}</th>
                    {view.columns.map((c) => <th key={c.id} className="px-1.5 py-1 font-medium">{c.label[locale]} {c.change_kind === 'pct' ? '%' : 'bp'}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {view.episodes.map((e) => {
                    const ev = episodeView(e, t);
                    return (
                      <tr key={ev.key} className="border-t border-border">
                        <th scope="row" className="px-1.5 py-2 text-left font-normal">
                          <div><b className="font-semibold">{ev.direction}</b> <span className="font-mono tabular-nums">{ev.dates}</span></div>
                          <div className="font-mono text-[10px] tabular-nums text-text-dim">{ev.line}</div>
                          {ev.flags.length > 0 ? <div className="mt-0.5 flex flex-wrap gap-1">{ev.flags.map((f) => <Tag key={f} tone="accent">{t(f)}</Tag>)}</div> : null}
                        </th>
                        {view.columns.map((col) => {
                          const c = cycleCell(cycleCellOf(view, e, col.id), t);
                          const body = (
                            <>
                              <div className="font-mono tabular-nums">{c.main}</div>
                              {c.sub ? <div className="font-mono text-[10px] tabular-nums text-text-dim">{c.sub}</div> : null}
                            </>
                          );
                          return (
                            <td key={col.id} className={`px-1.5 py-2 text-right ${toneClass(c.tone, toneLevel(c.raw, cycleScale(view, col.id)))}`}>
                              {c.drill ? (
                                <button type="button" className="w-full text-right hover:underline" onClick={() => setDrill({ title: t('history.cellTitle', { episode: `${ev.direction} ${ev.dates}`, column: col.label[locale] }), refs: c.refs })}>{body}</button>
                              ) : body}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 sm:hidden">
              {cycleGroups(view, t, locale).map((g) => (
                <section key={g.id} className="rounded border border-border p-2">
                  <h3 className="text-xs font-semibold">{g.label}</h3>
                  <ul className="mt-1 space-y-1 text-xs">
                    {g.rows.map((r) => (
                      <li key={r.key} className="flex justify-between gap-2">
                        <span className="font-mono text-[11px] tabular-nums">{r.episode}</span>
                        <span className="text-right"><span className="font-mono tabular-nums">{r.cell.main}</span>{r.cell.sub ? <span className="block text-[10px] text-text-dim">{r.cell.sub}</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </Panel>
      <Panel className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('history.medians')} <span className="text-xs font-normal text-text-dim">{t('history.mediansNote')}</span></h2>
          <Button variant="ghost" size="sm" aria-pressed={mediansAsTable} onClick={() => setMediansAsTable((v) => !v)}>{mediansAsTable ? t('view.chart') : t('view.table')}</Button>
        </div>
        {mediansAsTable ? (
          <table className="w-full max-w-[420px] text-xs">
            <tbody className="font-mono tabular-nums">
              {medians.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-1.5 py-1 font-sans">{c.label[locale]}</td>
                  <td className="px-1.5 py-1 text-right">{t('history.medianLine', { value: c.median === null ? MISSING : formatRaw(c.median, c.kind), n: c.n })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <svg viewBox={`0 0 440 ${Math.max(1, medians.length) * 24}`} className="w-full max-w-[440px]" role="img" aria-label={t('history.medians')}>
            {medians.map((c, i) => {
              const g = barGeometry(c.median, c.scaleMax, 50);
              const y = i * 24;
              return (
                <g key={c.id}>
                  <text x={0} y={y + 15} fontSize={11} fill="var(--text-dim)">{c.label[locale]}</text>
                  <line x1={170} x2={170} y1={y + 2} y2={y + 22} stroke="var(--border)" />
                  <rect x={120 + g.x} y={y + 6} width={g.width} height={12} fill={c.median !== null && c.median < 0 ? 'var(--down)' : 'var(--up)'} fillOpacity={0.55} />
                  <text x={240} y={y + 15} fontSize={11} fill="var(--text)" fontFamily="var(--font-mono)">
                    {t('history.medianLine', { value: c.median === null ? MISSING : formatRaw(c.median, c.kind), n: c.n })}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </Panel>
      <p className="text-[11px] text-text-dim">
        {t('history.footer')} · <a className="text-accent hover:underline" href={strategyApi.manifest(view.manifest_id)}>{t('meta.manifest', { id: shortId(view.manifest_id) })}</a> · {view.version} · {view.episodes_version}
      </p>
      <EvidencePairDrawer open={drill !== null} title={drill?.title ?? ''} onClose={() => setDrill(null)}>
        {drill ? <ObsRefTable refs={drill.refs} /> : null}
      </EvidencePairDrawer>
    </div>
  );
}
```

Create `src/components/macro/strategy/ReviewIndex.tsx`:

```tsx
'use client';
// Review list (spec §3.5; canvas "复盘列表"): month × region grid with generated / insufficient / no result and the
// generation time. Failed attempts are service-only logs and never appear here.
import Link from 'next/link';
import { Panel } from '@/components/ui';
import type { ReviewIndexItem } from '@/lib/macro/strategy/route-helpers';
import { formatInstant, reviewGrid, type IndexCell } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function ReviewIndex({ months, us, cn }: { months: string[]; us: ReviewIndexItem[]; cn: ReviewIndexItem[] }) {
  const { t } = useStrategyT();
  return (
    <Panel className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('review.title')}</h2>
        <span className="text-[11px] text-text-dim">{t('review.indexSubtitle')}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-dim">
              <th className="px-1.5 py-1 font-medium">{t('review.month')}</th>
              <th className="px-1.5 py-1 font-medium">{t('region.US')}</th>
              <th className="px-1.5 py-1 font-medium">{t('region.CN')}</th>
            </tr>
          </thead>
          <tbody>
            {reviewGrid(months, us, cn).map((row) => (
              <tr key={row.month} className="border-t border-border">
                <td className="px-1.5 py-1 font-mono tabular-nums">{row.month}</td>
                <IndexTd cell={row.US} href={`/intel/macro/review/US/${row.month}`} />
                <IndexTd cell={row.CN} href={`/intel/macro/review/CN/${row.month}`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function IndexTd({ cell, href }: { cell: IndexCell; href: string }) {
  const { t } = useStrategyT();
  const label = t(`review.status.${cell.status}`);
  return (
    <td className="px-1.5 py-1">
      {cell.status === 'none' ? <span className="text-text-dim">{label}</span> : <Link href={href} className="text-accent hover:underline">{label}</Link>}
      {cell.updatedAt ? <span className="ml-2 font-mono text-[10px] text-text-dim">{t('review.generatedAt', { time: formatInstant(cell.updatedAt) })}</span> : null}
    </td>
  );
}
```

Create `src/components/macro/strategy/DeviationCases.tsx`:

```tsx
'use client';
// Deviation cases (spec §3.2, §6.4; judgment layer on only): settled misses of macro_regime@v1 with the per-input
// differences between registration and settlement. No narrative; unchanged rows folded; an incomplete enumeration says
// so.
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { Region } from '@/lib/macro/strategy/contract';
import type { DeviationsResponse } from '@/lib/macro/strategy/route-helpers';
import { DependencyState } from './DependencyState';
import { deviationRows, strategyApi } from './strategy-view-model';
import { useStrategyFetch } from './use-strategy-fetch';
import { useStrategyT } from './use-strategy-t';

export function DeviationCases({ region }: { region: Region }) {
  const { t } = useStrategyT();
  const { state, reload } = useStrategyFetch<DeviationsResponse>(strategyApi.deviations(region));
  const [showUnchanged, setShowUnchanged] = useState(false);
  if (state.kind === 'judgments_disabled' || state.kind === 'disabled') return null;
  if (state.kind === 'loading') return <DependencyState kind="loading" />;
  if (state.kind === 'judgments_unavailable') return <DependencyState kind="judgments_unavailable" onRetry={reload} />;
  if (state.kind !== 'ok') return <DependencyState kind="error" code={state.kind === 'error' ? state.code : state.kind} onRetry={reload} />;
  const { cases, incomplete } = state.data;
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('deviation.title')} <span className="text-xs font-normal text-text-dim">{t('deviation.subtitle')}</span></h2>
        <Button variant="ghost" size="sm" aria-pressed={showUnchanged} onClick={() => setShowUnchanged((v) => !v)}>{showUnchanged ? t('deviation.hideUnchanged') : t('deviation.showUnchanged')}</Button>
      </div>
      {incomplete ? <p role="status" className="text-xs text-warn">{t('deviation.incomplete')}</p> : null}
      {cases.length === 0 ? <p className="text-xs text-text-dim">{t('deviation.none')}</p> : null}
      {cases.map((c) => {
        const d = deviationRows(c, showUnchanged);
        return (
          <section key={c.judgment_id} className="space-y-1 rounded border border-border p-2">
            <div className="flex flex-wrap gap-3 text-xs">
              <span><span className="text-text-dim">{t('deviation.selected')}</span> {t(`regime.${c.selected}`)}</span>
              <span><span className="text-text-dim">{t('deviation.realized')}</span> {c.realized ? t(`regime.${c.realized}`) : '—'}</span>
              <span className="font-mono">{t('deviation.asOf', { date: c.as_of.slice(0, 10) })}</span>
              <Tag>{t(`deviation.evidence.${c.evidence_state}`)}</Tag>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-text-dim">
                    {(['series', 'period', 'role', 'kind', 'registered', 'settled'] as const).map((k) => <th key={k} className="px-1.5 py-1 font-medium">{t(`deviation.columns.${k}`)}</th>)}
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {d.rows.map((r) => (
                    <tr key={r.key} className="border-t border-border">
                      <td className="px-1.5 py-1">{r.series}</td>
                      <td className="px-1.5 py-1">{r.period}</td>
                      <td className="px-1.5 py-1 font-sans">{t(r.roleKey)}</td>
                      <td className="px-1.5 py-1 font-sans"><Tag>{t(r.kindKey)}{r.subkindKey ? ` · ${t(r.subkindKey)}` : ''}</Tag></td>
                      <td className="px-1.5 py-1">{r.registered}</td>
                      <td className="px-1.5 py-1">{r.settled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.hiddenUnchanged > 0 ? <p className="text-[10px] text-text-dim">{t('deviation.unchangedHidden', { n: d.hiddenUnchanged })}</p> : null}
          </section>
        );
      })}
      <p className="text-[10px] text-text-dim">{t('deviation.noNarrative')}</p>
    </Panel>
  );
}
```

Create `src/components/macro/strategy/ExplanationPanel.tsx`:

```tsx
'use client';
// LLM explanation panel (spec §3.6, §6.3): not generated → running → accepted (system fact sentences, then the
// model's hypotheses citing fact numbers) / rejected (failure codes only, never model text) / failed. The fixed header
// names the bound subject, manifest, model, prompt and validator versions. A request id is reused only for a retry
// after a network failure. A run whose worker died stays 'running' only until a refresh: GET /explanations first finishes
// runs whose model output was already recorded (no second model call), then expires the rest older than five minutes
// (abandoned → failed), and the failed state offers a new request. Review panels bind to the
// displayed immutable result_id. Remaining runs come from the shared perspectives quota.
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { ExplanationProjection } from '@/lib/macro/strategy/contract';
import { errorCode, explainErrorText, failureLabel, headerLine, latestFor, nextRequestId, panelState, projectionOfError, remainingToday, renderedSections, strategyApi } from './strategy-view-model';
import { useStrategyFetch } from './use-strategy-fetch';
import { useStrategyT } from './use-strategy-t';

export function ExplanationPanel({ subject }: { subject: { kind: 'snapshot' | 'review'; id: string } }) {
  const { t, locale } = useStrategyT();
  const list = useStrategyFetch<{ items: ExplanationProjection[] }>(strategyApi.explanations(subject.kind, subject.id));
  const usage = useStrategyFetch<unknown>('/api/usage/today');
  const [current, setCurrent] = useState<ExplanationProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projection = current ?? (list.state.kind === 'ok' ? latestFor(list.state.data.items, locale) : null);
  const state = busy ? 'running' : panelState(projection);
  const remaining = usage.state.kind === 'ok' ? remainingToday(usage.state.data) : null;

  async function generate() {
    const requestId = nextRequestId(pending, () => crypto.randomUUID());
    setPending(requestId);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/macro/strategy/explanations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, subject, locale }),
      });
      const body: unknown = await r.json().catch(() => null);
      setPending(null);
      if (r.ok) {
        setCurrent(body as ExplanationProjection);
        usage.reload();
      } else {
        const failed = projectionOfError(body);
        if (failed) setCurrent(failed);
        setError(errorCode(body) ?? `http_${r.status}`);
      }
    } catch {
      setError('network');
    } finally {
      setBusy(false);
    }
  }

  function refresh() {
    setCurrent(null);
    list.reload();
  }

  const sections = state === 'accepted' && projection?.rendered ? renderedSections(projection.rendered) : null;
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('explain.title')}</h2>
        <Tag>{t(`explain.state.${state}`)}</Tag>
      </div>
      {projection ? <p className="rounded border border-border px-2 py-1 font-mono text-[11px] text-text-dim">{headerLine(projection, t)}</p> : null}
      <p className="text-[11px] text-text-dim">{t('explain.disclaimer')}</p>
      {state === 'none' ? <p className="text-xs text-text-dim">{t('explain.intro')}</p> : null}
      {state === 'running' ? (
        <div className="space-y-2">
          <p className="text-xs text-text-dim">{t('explain.runningBody')}</p>
          {!busy ? <p className="text-[11px] text-text-dim">{t('explain.runningStale', { minutes: 5 })}</p> : null}
          {!busy ? <Button variant="secondary" size="sm" onClick={refresh}>{t('explain.refresh')}</Button> : null}
        </div>
      ) : null}
      {sections ? (
        <div className="space-y-3 text-sm">
          <section>
            <h3 className="text-xs text-text-dim">{t('explain.facts')}</h3>
            <ol className="space-y-1">
              {sections.facts.map((f) => <li key={f.factId}><sup className="mr-1 font-mono text-[10px] text-accent">{f.n}</sup>{f.text}</li>)}
            </ol>
          </section>
          <section>
            <h3 className="text-xs text-text-dim">{t('explain.hypotheses')}</h3>
            <ul className="space-y-1">
              {sections.hypotheses.map((h, i) => <li key={i}>{h.text} <span className="font-mono text-[10px] text-text-dim">{t('explain.refs', { refs: h.refs.join(', ') })}</span></li>)}
            </ul>
          </section>
          {sections.counterpoints.length > 0 ? (
            <section>
              <h3 className="text-xs text-text-dim">{t('explain.counterpoints')}</h3>
              <ul className="space-y-1">
                {sections.counterpoints.map((c, i) => <li key={i}>{c.text} <span className="font-mono text-[10px] text-text-dim">{t('explain.refs', { refs: c.refs.join(', ') })}</span></li>)}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
      {(state === 'rejected' || state === 'failed') && projection ? (
        <div className="space-y-1 text-xs">
          <p>{state === 'rejected' ? t('explain.rejectedBody') : t('explain.failedBody')}</p>
          <ul className="flex flex-wrap gap-1">{projection.failure_codes.map((c) => <li key={c}><Tag>{failureLabel(c, t)}</Tag></li>)}</ul>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-warn">{explainErrorText(error, t)}</p> : null}
      {state !== 'running' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={generate} disabled={busy}>
            {state === 'none' && !error ? t('explain.generate') : error === 'network' ? t('explain.retry') : t('explain.regenerate')}
          </Button>
          {remaining ? <span className="text-[11px] text-text-dim">{remaining.kind === 'unlimited' ? t('explain.unlimited') : t('explain.remaining', { n: remaining.n })}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
```

Create `src/components/macro/strategy/ReviewView.tsx`:

```tsx
'use client';
// Single-month review (spec §3.2, §3.5, §6.2): the seven fact sections in spec order (fact text from the system
// templates), the read-time judgment section and deviation cases when the judgment layer is on, the explanation panel
// bound to this immutable result_id (never the moving month pointer), and the method footer (method · manifest · input hash · code version · generation).
import Link from 'next/link';
import { Panel, Tag } from '@/components/ui';
import { namesFrom, renderFact } from '@/lib/macro/strategy/explain-render';
import type { ReviewDetailResponse } from '@/lib/macro/strategy/route-helpers';
import { DependencyState } from './DependencyState';
import { DeviationCases } from './DeviationCases';
import { ExplanationPanel } from './ExplanationPanel';
import { F4SummaryPanel } from './F4Summary';
import { formatInstant, reviewSections, strategyApi } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function ReviewView({ data }: { data: ReviewDetailResponse }) {
  const { t, locale } = useStrategyT();
  const r = data.result;
  const names = namesFrom(data.names);
  const sections = reviewSections(r.facts, (f) => renderFact(f, locale, names));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link href="/intel/macro/review" className="text-xs text-accent hover:underline">{t('review.back')}</Link>
          <h2 className="text-lg font-semibold">{t(`region.${r.region}`)} · <span className="font-mono">{r.month}</span></h2>
          <Tag>{t(`review.status.${r.status}`)}</Tag>
          <span className="font-mono text-[11px] text-text-dim">{t('review.generatedAt', { time: formatInstant(r.created_at) })}</span>
        </div>
        <span className="text-[11px] text-text-dim">{t('review.scope')}</span>
      </div>
      {r.status === 'insufficient' ? <p role="status" className="text-xs text-text-dim">{t('review.insufficient')}</p> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Panel key={s.key} className="space-y-1">
            <h3 className="text-sm font-semibold">{t(s.titleKey)} <span className="font-mono text-xs font-normal text-text-dim">{s.items.length}</span></h3>
            {s.emptyKey ? <p className="text-xs text-text-dim">{t(s.emptyKey)}</p> : (
              <ul className="space-y-1 text-xs">
                {s.items.map((it) => (
                  <li key={it.factId}>
                    {it.text}
                    {it.seriesId ? <> · <Link className="text-accent hover:underline" href={`/intel/macro/${it.seriesId}`}>{t('review.openSeries')}</Link></> : null}
                  </li>
                ))}
              </ul>
            )}
            {s.key === 'revisions' ? <p className="text-[10px] text-text-dim">{t('review.revisionScope')}</p> : null}
          </Panel>
        ))}
      </div>
      {data.judgment_status !== 'disabled' ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('review.judgment')}</h3>
          {data.judgment_status === 'ok' && data.f4 ? <F4SummaryPanel summary={data.f4.summary} /> : <DependencyState kind="judgments_unavailable" />}
          <DeviationCases region={r.region} />
        </section>
      ) : null}
      <ExplanationPanel subject={{ kind: 'review', id: r.result_id }} />
      <p className="border-t border-border pt-2 font-mono text-[11px] text-text-dim">
        {t('review.footer', { method: r.method_version, manifest: r.manifest_id, hash: r.manifest_hash.slice(0, 12), code: r.code_version.slice(0, 12), generation: data.generation })}
        {' · '}<a className="text-accent hover:underline" href={strategyApi.manifest(r.manifest_id)}>{t('meta.manifestLink')}</a>
      </p>
    </div>
  );
}
```

Create `src/components/macro/strategy/StrategyScreens.tsx`:

```tsx
'use client';
// Client screens of the four strategy pages (spec §3.1–§3.5): link tabs, region / window / boundary switches, data
// loading through the strategy APIs and the capability-matrix states (spec §9.1). Pages stay thin server components.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { Boundary, CycleTableView, PolicyResponseView, Region, TransmissionResponse } from '@/lib/macro/strategy/contract';
import type { ReviewDetailResponse, ReviewIndexResponse } from '@/lib/macro/strategy/route-helpers';
import { CycleReturnsTable } from './CycleReturnsTable';
import { DependencyState } from './DependencyState';
import { ExplanationPanel } from './ExplanationPanel';
import { PlaybookGrid } from './PlaybookGrid';
import { PolicyResponseMatrix } from './PolicyResponseMatrix';
import { ReviewIndex } from './ReviewIndex';
import { ReviewView } from './ReviewView';
import { TransmissionFlow } from './TransmissionFlow';
import { closedMonths, formatInstant, hasSnapshot, shortId, strategyApi, type LoadState } from './strategy-view-model';
import { useStrategyFetch } from './use-strategy-fetch';
import { useStrategyT } from './use-strategy-t';

const TABS = [
  { id: 'transmission', href: '/intel/macro/transmission' },
  { id: 'history', href: '/intel/macro/history' },
  { id: 'review', href: '/intel/macro/review' },
] as const;

export function StrategyTabs({ active }: { active: 'transmission' | 'history' | 'review' }) {
  const { t } = useStrategyT();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border text-sm">
      <Link href="/intel/macro" className="px-3 py-2 text-text-dim hover:text-text">{t('tabs.workbench')}</Link>
      {TABS.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === active ? 'page' : undefined}
          className={`px-3 py-2 ${tab.id === active ? 'border-b-2 border-accent text-text' : 'text-text-dim hover:text-text'}`}>
          {t(`tabs.${tab.id}`)}
        </Link>
      ))}
    </nav>
  );
}

function Gate<T>({ state, reload, children }: { state: LoadState<T>; reload: () => void; children: (data: T) => ReactNode }) {
  switch (state.kind) {
    case 'ok': return <>{children(state.data)}</>;
    case 'loading': return <DependencyState kind="loading" />;
    case 'foundation': return <DependencyState kind="foundation" onRetry={reload} />;
    case 'no_snapshot': return <DependencyState kind="no_snapshot" />;
    case 'not_found': case 'disabled': return <DependencyState kind="not_found" />;
    case 'judgments_unavailable': return <DependencyState kind="judgments_unavailable" onRetry={reload} />;
    case 'judgments_disabled': return null;
    default: return <DependencyState kind="error" code={state.code} onRetry={reload} />;
  }
}

function RegionSwitch({ region, onRegion }: { region: Region; onRegion: (r: Region) => void }) {
  const { t } = useStrategyT();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('region.label')}>
      {(['US', 'CN'] as const).map((r) => (
        <Button key={r} size="sm" variant={r === region ? 'primary' : 'secondary'} aria-pressed={r === region} onClick={() => onRegion(r)}>{t(`region.${r}`)}</Button>
      ))}
    </div>
  );
}

export function TransmissionScreen({ initialRegion }: { initialRegion: Region }) {
  const { t } = useStrategyT();
  const router = useRouter();
  const [region, setRegion] = useState<Region>(initialRegion);
  const [window, setWindow] = useState<1 | 3 | 6>(3);
  const tr = useStrategyFetch<TransmissionResponse>(strategyApi.transmission(region));
  const pr = useStrategyFetch<PolicyResponseView>(strategyApi.policyResponse(window));
  function switchRegion(r: Region) {
    setRegion(r);
    router.replace(`/intel/macro/transmission?region=${r}`, { scroll: false });
  }
  return (
    <div className="space-y-4">
      <StrategyTabs active="transmission" />
      <RegionSwitch region={region} onRegion={switchRegion} />
      <Gate state={tr.state} reload={tr.reload}>
        {(d) => {
          const snapshotId = d.transmission.snapshots[region];
          return (
            <>
              <p className="font-mono text-[11px] text-text-dim">
                <a className="text-accent hover:underline" href={strategyApi.manifest(d.transmission.manifest_id)}>{t('meta.manifest', { id: shortId(d.transmission.manifest_id) })}</a>
                {' · '}{t('meta.cutoff', { time: formatInstant(d.transmission.cutoff) })}
                {' · '}{t('meta.catalog', { version: d.transmission.catalog_version })}
                {' · '}{t('meta.method', { version: d.transmission.version })}
              </p>
              {hasSnapshot(d.transmission) ? <TransmissionFlow view={d.transmission} /> : <DependencyState kind="no_snapshot" />}
              <PlaybookGrid playbooks={d.playbooks} judgment={{ status: d.judgment_status, f4: d.f4 }} />
              {snapshotId ? <ExplanationPanel subject={{ kind: 'snapshot', id: snapshotId }} /> : null}
            </>
          );
        }}
      </Gate>
      <Gate state={pr.state} reload={pr.reload}>
        {(v) => <PolicyResponseMatrix view={v} window={window} onWindow={setWindow} />}
      </Gate>
    </div>
  );
}

export function HistoryScreen({ initialBoundary }: { initialBoundary: Boundary }) {
  const router = useRouter();
  const [boundary, setBoundary] = useState<Boundary>(initialBoundary);
  const ct = useStrategyFetch<CycleTableView>(strategyApi.cycleTable(boundary));
  function switchBoundary(b: Boundary) {
    setBoundary(b);
    router.replace(`/intel/macro/history?boundary=${b}`, { scroll: false });
  }
  return (
    <div className="space-y-4">
      <StrategyTabs active="history" />
      <Gate state={ct.state} reload={ct.reload}>
        {(v) => <CycleReturnsTable view={v} boundary={boundary} onBoundary={switchBoundary} />}
      </Gate>
    </div>
  );
}

export function ReviewIndexScreen() {
  const us = useStrategyFetch<ReviewIndexResponse>(strategyApi.reviews('US'));
  const cn = useStrategyFetch<ReviewIndexResponse>(strategyApi.reviews('CN'));
  const months = useMemo(() => closedMonths(new Date(), 36), []);
  return (
    <div className="space-y-4">
      <StrategyTabs active="review" />
      <Gate state={us.state} reload={us.reload}>
        {(u) => (
          <Gate state={cn.state} reload={cn.reload}>
            {(c) => <ReviewIndex months={months} us={u.items} cn={c.items} />}
          </Gate>
        )}
      </Gate>
    </div>
  );
}

export function ReviewScreen({ region, month }: { region: Region; month: string }) {
  const rv = useStrategyFetch<ReviewDetailResponse>(strategyApi.review(region, month));
  return (
    <div className="space-y-4">
      <StrategyTabs active="review" />
      <Gate state={rv.state} reload={rv.reload}>{(d) => <ReviewView data={d} />}</Gate>
    </div>
  );
}
```

- [ ] **Step 10: Run the module tests again, typecheck and lint**

Run: `npm test -- src/components/macro/strategy`
Expected: PASS, `Tests  38 passed (38)`.

Run: `npm run typecheck && npm run lint`
Expected: both exit 0 with no errors and no warnings (the React hooks rule is a warning, and lint runs with `--max-warnings=0`).

- [ ] **Step 11: Commit**

```bash
git add messages/zh/macroStrategy.json messages/en/macroStrategy.json src/i18n/request.ts src/components/macro/strategy
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): macroStrategy i18n domain, view model and strategy components (spec 2026-11-07 §3, §10)

The macroStrategy domain is registered inside a MACRO-P3 block with zh/en key
and placeholder parity, enum coverage and a forbidden-term check. The view
model holds every UI decision as tested pure functions: capability-matrix
load states, exact decimal display with rounding only at display, node
badges and spread formulas, playbook marks on the manifest snapshot only,
matrix and episode cells with three-level asset washes, mobile column lists,
review sections, explanation panel states and deviation rows. Components
are thin renderers on DESIGN.md tokens with a table view for every chart.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 14: Strategy pages, forbidden-term scan, runbook and the full gate

**Files:**
- Create: `src/app/(app)/intel/macro/transmission/page.tsx`
- Create: `src/app/(app)/intel/macro/history/page.tsx`
- Create: `src/app/(app)/intel/macro/review/page.tsx`
- Create: `src/app/(app)/intel/macro/review/[region]/[month]/page.tsx`
- Create: `src/app/(app)/intel/macro/transmission/strategy-pages.test.ts` (P1 owns `src/app/(app)/intel/macro/pages.test.ts`; this file lives in a directory this plan owns)
- Create: `src/lib/macro/strategy/forbidden-terms.test.ts`
- Create: `src/lib/macro/strategy/reconcile.ts`, `src/lib/macro/strategy/reconcile.test.ts`
- Create: `scripts/macro/strategy-reconcile.ts`
- Create: `docs/runbooks/macro-strategy.md`

Design decisions (spec §3.1, §9.1, §12, §13):
- The repo's page-test pattern is structural (P1 plan Task 17 `pages.test.ts`, and `src/app/(app)/dynamic-rendering.test.ts`): read the page source and assert `force-dynamic`, no `'use client'`, and the gate calls. The four pages follow it. The shared `dynamic-rendering.test.ts` is not edited (shared file outside the MACRO-P3 list); `strategy-pages.test.ts` asserts the same two properties for these pages.
- Each page is a thin server component: `strategyEnabled()` off → `notFound()` (spec §9.1 "子路由 404"); `strategyPort()` null → `<DependencyState kind="foundation" />` ("宏观数据底座未就绪") before anything loads; otherwise the client screen from `StrategyScreens.tsx`. The month page also turns an invalid region or month into `notFound()`. The `(app)` layout already requires a signed-in user. Pages read flags only through `flags.ts`; the judgment layer state reaches the UI only through the APIs' `judgment_status` / 404 `judgments_disabled`.
- `forbidden-terms.test.ts` scans the production text surfaces of spec §12 (N11): the strategy library (non-test `.ts`, minus `explain-validate.ts` whose constants hold the list, minus the test-only `testing/` helpers), its `data/**` and `prompts/**`, the strategy components, the `macroStrategy` messages, plus the strategy routes, the cron route and the four pages. It uses the validator's `FORBIDDEN_TERMS` (Chinese terms as substrings, English terms on word boundaries, case-insensitive), a superset of 概率 / 置信 / 胜率 / probability / confidence, so the test file itself never spells those words. Each surface also has a minimum file count, so a moved directory cannot pass by scanning nothing.
- The runbook covers spec §13: the capability matrix, WP-S6 wiring steps, review recompute, explanation failure codes, completion recovery and settlement reconcile, catalog additions, and the verification gate with the known local flakes.
- Settlement reconcile (plan audit R2-4): `finalizeUsageRun` (`src/lib/billing/quota.ts`) throws only `usage_audit_invariant` (SQLSTATE 55000, `usage run finalize conflict`) or `usage_audit_unavailable` (everything else, including P0002 `usage run not found` after three attempts), so its error cannot classify a run. `reconcile.ts` reads `usage_events` by `idempotency_key` (= `usage_audit_key`) and classifies absent / pending / settled / conflict; `scripts/macro/strategy-reconcile.ts` is the thin CLI (dry run by default, `--apply`). The unit test drives the real wrapper over a stubbed admin rpc, so the runbook's statements about its errors are tested, not assumed.

- [ ] **Step 1: Write the failing page and vocabulary tests**

Create `src/app/(app)/intel/macro/transmission/strategy-pages.test.ts`:

```ts
// Structural guards for the four strategy pages (spec §3.1, §9.1): force-dynamic server components behind the
// (app) login gate; MACRO_STRATEGY_ENABLED off → notFound(); null port → the "foundation not ready" state before any
// data; environment flags read only through flags.ts (never in pages or components).
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');
const BASE='src/app/(app)/intel/macro';
const PAGES=['transmission/page.tsx','history/page.tsx','review/page.tsx','review/[region]/[month]/page.tsx'];
describe('macro strategy pages',()=>{
 for(const p of PAGES)it(`${p}: force-dynamic server page with the capability gates`,()=>{
  const src=read(`${BASE}/${p}`);
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  expect(src).toContain("import { strategyEnabled } from '@/lib/macro/strategy/flags';");
  expect(src).toMatch(/if \(!strategyEnabled\(\)\) notFound\(\);/);
  expect(src).toMatch(/if \(!strategyPort\(\)\) return <DependencyState kind="foundation" \/>;/);
  expect(src.indexOf('strategyEnabled()')).toBeLessThan(src.indexOf('strategyPort()'));
  expect(src).not.toContain('process.env');
 });
 it('the month page rejects an invalid region or month with notFound',()=>{
  const src=read(`${BASE}/review/[region]/[month]/page.tsx`);
  expect(src).toContain("(region !== 'US' && region !== 'CN')");
  expect(src).toContain('/^\\d{4}-(0[1-9]|1[0-2])$/');
 });
 it('strategy components never read the environment or server-only modules',()=>{
  const files=(readdirSync(join(process.cwd(),'src/components/macro/strategy'),{recursive:true}) as string[]).filter(f=>/\.tsx?$/.test(f)&&!f.endsWith('.test.ts'));
  expect(files.length).toBeGreaterThanOrEqual(15);
  for(const f of files){
   const src=read(`src/components/macro/strategy/${f}`);
   expect([f,src.includes('process.env')]).toEqual([f,false]);
   expect([f,/^import \{[^}]*\} from '@\/lib\/(supabase|macro\/strategy\/(port|db|flags|llm-deps|route-helpers|f4-client))/m.test(src)]).toEqual([f,false]);
  }
 });
});
```

Create `src/lib/macro/strategy/forbidden-terms.test.ts`:

```ts
// Production text surfaces of P3/P4 never use the forbidden vocabulary (spec §1.1 criterion 2, §10, §12 / N11).
// Scanned: the strategy library (non-test .ts, minus explain-validate.ts whose policy constants hold the list, minus the
// test-only testing/ helpers), its data/** and prompts/**, the strategy components, the macroStrategy messages, the
// strategy API routes and cron, and the four pages. Chinese terms match as substrings; English terms on word
// boundaries, case-insensitive (the validator's rule). Validator counter-examples live only in explain-validate.test.ts.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';
import {FORBIDDEN_TERMS} from './explain-validate';
const ROOT=process.cwd();
const walk=(dir:string):string[]=>{
 const abs=join(ROOT,dir);
 if(!existsSync(abs))return [];
 return (readdirSync(abs,{recursive:true}) as string[]).map(f=>join(abs,f)).filter(f=>/\.(ts|tsx|md|json)$/.test(f));
};
const isTest=(f:string)=>/\.test\.tsx?$/.test(f);
const SURFACES:{name:string;files:string[];min:number}[]=[
 {name:'library',files:walk('src/lib/macro/strategy').filter(f=>/\.(ts|md)$/.test(f)&&!isTest(f)&&!f.endsWith('/explain-validate.ts')&&!f.includes('/testing/')),min:20},
 {name:'components',files:walk('src/components/macro/strategy').filter(f=>/\.tsx?$/.test(f)&&!isTest(f)),min:15},
 {name:'messages',files:['messages/zh/macroStrategy.json','messages/en/macroStrategy.json'].map(f=>join(ROOT,f)),min:2},
 {name:'routes',files:[...walk('src/app/api/macro/strategy'),...walk('src/app/api/cron/macro-review')].filter(f=>f.endsWith('/route.ts')),min:9},
 {name:'pages',files:['transmission','history','review'].flatMap(d=>walk(`src/app/(app)/intel/macro/${d}`)).filter(f=>f.endsWith('/page.tsx')),min:4},
];
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const MATCHERS=FORBIDDEN_TERMS.map(term=>({term,re:/[^\x00-\x7f]/.test(term)?new RegExp(escape(term)):new RegExp(`\\b${escape(term)}\\b`,'i')}));
describe('forbidden vocabulary on production text surfaces',()=>{
 it('the term list is the validator policy constant and is not empty',()=>{expect(FORBIDDEN_TERMS.length).toBeGreaterThan(10);});
 for(const s of SURFACES)it(`${s.name}: no forbidden term`,()=>{
  expect(s.files.length).toBeGreaterThanOrEqual(s.min);
  const hits:string[]=[];
  for(const f of s.files){
   readFileSync(f,'utf8').split('\n').forEach((line,i)=>{for(const m of MATCHERS)if(m.re.test(line))hits.push(`${relative(ROOT,f)}:${i+1} ${m.term}`);});
  }
  expect(hits).toEqual([]);
 });
});
```

Create `src/lib/macro/strategy/reconcile.test.ts`:

```ts
// src/lib/macro/strategy/reconcile.test.ts
// reconcile.ts (plan audit R2-4) over a fake client whose finalize is the REAL finalizeUsageRun wrapper on a stubbed admin
// rpc, so the test pins the wrapper's error mapping the runbook relies on (P0002 or a transient error →
// usage_audit_unavailable, 55000 → usage_audit_invariant) and shows why the usage_events lookup, not that error, decides.
import {beforeEach,describe,expect,it,vi} from 'vitest';

const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({rpc:m.rpc})}));

import {finalizeUsageRun,type RecordUsageMeta} from '@/lib/billing/quota';
import {classifyUsageEvent,expectedUsageColumns,reconcileSettlements,type ReconcileClient,type UnsettledRun,type UsageEventRow} from './reconcile';

const PAYLOAD={status:'completed',provider:'deepseek',model:'deepseek-chat',inputTokens:120,cacheHitInputTokens:20,cacheMissInputTokens:100,outputTokens:80,costMicrormb:900,
 pricingVersion:'p1',usdCnyMicros:7_100_000,usageEstimated:false,byo:false};
const row=(o:Partial<UsageEventRow>={}):UsageEventRow=>({status:'completed',provider:'deepseek',model:'deepseek-chat',input_tokens:120,cache_hit_input_tokens:20,cache_miss_input_tokens:100,
 output_tokens:80,cost_micrormb:'900',pricing_version:'p1',usd_cny_micros:'7100000',usage_estimated:false,byo:false,...o});
const run=(id:string,payload:Record<string,unknown>=PAYLOAD):UnsettledRun=>({explanation_id:id,user_id:'u1',usage_audit_key:id,state:'accepted',finalize_payload:payload});
const meta=(p:Record<string,unknown>)=>p as unknown as RecordUsageMeta;

function fakeClient(runs:UnsettledRun[],events:Record<string,UsageEventRow>){
 const marked:string[]=[];const finalized:{key:string;payload:Record<string,unknown>}[]=[];
 const c:ReconcileClient={
  unsettledRuns:async limit=>runs.slice(0,limit),
  usageEvent:async key=>events[key]??null,
  finalize:async(userId,key,payload)=>{finalized.push({key,payload});await finalizeUsageRun(userId,key,'perspectives',meta(payload));},
  markFinalized:async id=>{marked.push(id);},
 };
 return {c,marked,finalized};
}
beforeEach(()=>{m.rpc.mockReset();});

describe('the billing wrapper cannot classify a failed retry',()=>{
 it('usage run not found (P0002) and a transient error both surface as usage_audit_unavailable; a finalize conflict (55000) as usage_audit_invariant',async()=>{
  m.rpc.mockResolvedValue({data:null,error:{code:'P0002',message:'usage run not found'}});
  await expect(finalizeUsageRun('u1','k','perspectives',meta(PAYLOAD))).rejects.toThrow('usage_audit_unavailable');
  expect(m.rpc).toHaveBeenCalledTimes(3);
  m.rpc.mockReset();m.rpc.mockResolvedValue({data:null,error:{code:'08006',message:'connection failure'}});
  await expect(finalizeUsageRun('u1','k','perspectives',meta(PAYLOAD))).rejects.toThrow('usage_audit_unavailable');
  m.rpc.mockReset();m.rpc.mockResolvedValue({data:null,error:{code:'55000',message:'usage run finalize conflict'}});
  await expect(finalizeUsageRun('u1','k','perspectives',meta(PAYLOAD))).rejects.toThrow('usage_audit_invariant');
  expect(m.rpc).toHaveBeenCalledTimes(1);
 });
});

describe('classifyUsageEvent',()=>{
 it('absent / pending / settled / conflict; bigint strings and the wrapper defaults compare as the wrapper writes them',()=>{
  expect(classifyUsageEvent(null,PAYLOAD)).toBe('absent');
  expect(classifyUsageEvent(row({status:'pending'}),PAYLOAD)).toBe('pending');
  expect(classifyUsageEvent(row(),PAYLOAD)).toBe('settled');
  expect(classifyUsageEvent(row({status:'failed',usage_estimated:true}),PAYLOAD)).toBe('conflict');   // failed by fail_stale_usage_runs
  expect(classifyUsageEvent(row({cost_micrormb:901}),PAYLOAD)).toBe('conflict');
  const byo={status:'failed',provider:'openai',model:'gpt-x',byo:true};   // a begin-stage BYO payload: zero usage, wrapper defaults
  expect(expectedUsageColumns(byo)).toMatchObject({input_tokens:0,cache_miss_input_tokens:0,cost_micrormb:0,pricing_version:null,usd_cny_micros:null,usage_estimated:false});
  expect(classifyUsageEvent(row({status:'failed',provider:'openai',model:'gpt-x',input_tokens:0,cache_hit_input_tokens:0,cache_miss_input_tokens:0,output_tokens:0,cost_micrormb:0,
   pricing_version:null,usd_cny_micros:null,byo:true}),byo)).toBe('settled');
 });
});

describe('reconcileSettlements',()=>{
 it('a dry run reads only',async()=>{
  const f=fakeClient([run('a'),run('b')],{b:row({status:'pending'})});
  expect((await reconcileSettlements(f.c,{apply:false,limit:10})).map(l=>[l.explanation_id,l.class,l.action])).toEqual([['a','absent','dry_run'],['b','pending','dry_run']]);
  expect(f.marked).toEqual([]);expect(f.finalized).toEqual([]);expect(m.rpc).not.toHaveBeenCalled();
 });
 it('apply: absent and settled are marked without a finalize; pending is finalized verbatim through the wrapper, then marked; conflict is left for review',async()=>{
  m.rpc.mockResolvedValue({data:[{id:'x',status:'completed'}],error:null});
  const f=fakeClient([run('absent'),run('settled'),run('pending'),run('conflict')],{settled:row(),pending:row({status:'pending'}),conflict:row({status:'failed',usage_estimated:true})});
  const out=await reconcileSettlements(f.c,{apply:true,limit:10});
  expect(out.map(l=>[l.explanation_id,l.class,l.action])).toEqual([['absent','absent','marked'],['settled','settled','marked'],['pending','pending','finalized_and_marked'],['conflict','conflict','left_for_review']]);
  expect(f.finalized).toEqual([{key:'pending',payload:PAYLOAD}]);
  expect(m.rpc).toHaveBeenCalledTimes(1);
  expect(m.rpc).toHaveBeenCalledWith('finalize_usage_run',expect.objectContaining({p_idempotency_key:'pending',p_user_id:'u1',p_feature:'perspectives',p_cost_micrormb:900,
   p_pricing_version:'p1',p_usd_cny_micros:7_100_000,p_status:'completed'}));
  expect(f.marked).toEqual(['absent','settled','pending']);
 });
 it('a pending row whose finalize still fails stays unmarked with the wrapper code; the limit bounds the batch',async()=>{
  m.rpc.mockResolvedValue({data:null,error:{code:'08006',message:'connection failure'}});
  const f=fakeClient([run('p1'),run('p2')],{p1:row({status:'pending'}),p2:row({status:'pending'})});
  expect(await reconcileSettlements(f.c,{apply:true,limit:1})).toEqual([{explanation_id:'p1',usage_audit_key:'p1',state:'accepted',class:'pending',action:'finalize_failed',error:'usage_audit_unavailable'}]);
  expect(f.marked).toEqual([]);
 });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- "src/app/(app)/intel/macro/transmission/strategy-pages.test.ts" src/lib/macro/strategy/forbidden-terms.test.ts src/lib/macro/strategy/reconcile.test.ts`
Expected: FAIL. The four page cases fail with ENOENT (no page files yet), and `pages: no forbidden term` fails on `expected 0 to be greater than or equal to 4`. `reconcile.test.ts` fails with `Failed to resolve import "./reconcile"`. The other surfaces already pass, because Tasks 2–13 exist; the component case of the page test passes too.

If a surface other than `pages` reports a hit (for example a data or prompt file of Tasks 6–10 using 将会 or "chance of"), do not weaken the test: stop and report the file and line to the orchestrator, because the wording fix belongs to that task's file.

- [ ] **Step 3: Implement the four pages**

Create `src/app/(app)/intel/macro/transmission/page.tsx`:

```tsx
// src/app/(app)/intel/macro/transmission/page.tsx
// Transmission page (spec §3.1, §3.3, §9.1): 404 while MACRO_STRATEGY_ENABLED is off, "foundation not ready" while the
// P1+P2 port is not wired; otherwise the client screen loads the transmission, playbooks and response matrix APIs.
import { notFound } from 'next/navigation';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { TransmissionScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default async function TransmissionPage({ searchParams }: { searchParams: Promise<{ region?: string | string[] }> }) {
  if (!strategyEnabled()) notFound();
  if (!strategyPort()) return <DependencyState kind="foundation" />;
  const { region } = await searchParams;
  return <TransmissionScreen initialRegion={region === 'CN' ? 'CN' : 'US'} />;
}
```

Create `src/app/(app)/intel/macro/history/page.tsx`:

```tsx
// src/app/(app)/intel/macro/history/page.tsx
// History page (spec §3.1, §3.4, §9.1): policy action episodes × asset interval changes with a boundary switch.
import { notFound } from 'next/navigation';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { HistoryScreen } from '@/components/macro/strategy/StrategyScreens';
import type { Boundary } from '@/lib/macro/strategy/contract';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';
const BOUNDARIES: readonly Boundary[] = ['event_day', 'first_trading_day', 'month_end'];

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ boundary?: string | string[] }> }) {
  if (!strategyEnabled()) notFound();
  if (!strategyPort()) return <DependencyState kind="foundation" />;
  const { boundary } = await searchParams;
  const initial = BOUNDARIES.find((b) => b === boundary) ?? 'event_day';
  return <HistoryScreen initialBoundary={initial} />;
}
```

Create `src/app/(app)/intel/macro/review/page.tsx`:

```tsx
// src/app/(app)/intel/macro/review/page.tsx
// Review list (spec §3.1, §3.5, §9.1): US / CN × the last 36 closed months.
import { notFound } from 'next/navigation';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { ReviewIndexScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default function ReviewIndexPage() {
  if (!strategyEnabled()) notFound();
  if (!strategyPort()) return <DependencyState kind="foundation" />;
  return <ReviewIndexScreen />;
}
```

Create `src/app/(app)/intel/macro/review/[region]/[month]/page.tsx`:

```tsx
// src/app/(app)/intel/macro/review/[region]/[month]/page.tsx
// Single-month review (spec §3.1, §3.5, §9.1): /intel/macro/review/US/2026-10. An invalid region or month is a 404.
import { notFound } from 'next/navigation';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { ReviewScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default async function ReviewMonthPage({ params }: { params: Promise<{ region: string; month: string }> }) {
  if (!strategyEnabled()) notFound();
  const { region, month } = await params;
  if ((region !== 'US' && region !== 'CN') || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  if (!strategyPort()) return <DependencyState kind="foundation" />;
  return <ReviewScreen region={region} month={month} />;
}
```

Create `src/lib/macro/strategy/reconcile.ts`:

```ts
// src/lib/macro/strategy/reconcile.ts
// Settlement reconciliation of macro explanation runs (spec §13, runbook §4; plan audit R2-4). The billing wrapper cannot
// classify a failed retry: finalizeUsageRun (src/lib/billing/quota.ts) maps SQLSTATE 55000 ('usage run finalize conflict')
// to usage_audit_invariant and every other error, including P0002 'usage run not found' after three attempts, to
// usage_audit_unavailable. This module therefore reads the usage_events row by idempotency_key (= the run's
// usage_audit_key) and acts on what it finds:
//   absent   no usage run: beginUsageRun never committed, so the model was never called → markFinalized (nothing to settle)
//   pending  finalizeUsageRun(the stored payload, verbatim) → markFinalized on success
//   settled  terminal row equal to the stored payload (an earlier finalize succeeded, the mark was lost) → markFinalized
//   conflict terminal row that differs (for example failed by fail_stale_usage_runs) → left unfinalized for a person
// The stored payload is never recomputed from current pricing or FX, and the model is never called. A dry run reads only.
// expectedUsageColumns mirrors finalizeUsageRun's argument mapping (defaults, integer bounding, derived cache misses).

export interface UnsettledRun{explanation_id:string;user_id:string;usage_audit_key:string;state:string;finalize_payload:Record<string,unknown>}
/** usage_events columns compared with the stored payload (bigint columns may arrive as strings). */
export interface UsageEventRow{status:string;provider:string|null;model:string|null;input_tokens:number|string|null;cache_hit_input_tokens:number|string|null;
 cache_miss_input_tokens:number|string|null;output_tokens:number|string|null;cost_micrormb:number|string|null;pricing_version:string|null;
 usd_cny_micros:number|string|null;usage_estimated:boolean|null;byo:boolean|null}
export const USAGE_EVENT_COLUMNS='status,provider,model,input_tokens,cache_hit_input_tokens,cache_miss_input_tokens,output_tokens,cost_micrormb,pricing_version,usd_cny_micros,usage_estimated,byo';
export interface ReconcileClient{
 /** macro_explanation_runs with finalize_payload set and finalized = false, oldest claim first. */
 unsettledRuns(limit:number):Promise<UnsettledRun[]>;
 /** usage_events row whose idempotency_key equals the key, or null. */
 usageEvent(idempotencyKey:string):Promise<UsageEventRow|null>;
 /** finalizeUsageRun(userId, key, 'perspectives', payload) with the payload verbatim. */
 finalize(userId:string,idempotencyKey:string,payload:Record<string,unknown>):Promise<void>;
 markFinalized(explanationId:string):Promise<void>;
}
export type UsageEventClass='absent'|'pending'|'settled'|'conflict';
export type ReconcileAction='dry_run'|'marked'|'finalized_and_marked'|'finalize_failed'|'mark_failed'|'left_for_review';
export interface ReconcileLine{explanation_id:string;usage_audit_key:string;state:string;class:UsageEventClass;action:ReconcileAction;error?:string}

const bounded=(v:unknown):number=>typeof v==='number'&&Number.isFinite(v)?Math.min(Math.max(0,Math.trunc(v)),Number.MAX_SAFE_INTEGER):0;
const num=(v:unknown):number|null=>v===null||v===undefined?null:Number(v);
/** The usage_events values finalizeUsageRun writes for this payload (same defaults and bounding as the wrapper). */
export function expectedUsageColumns(p:Record<string,unknown>):Record<string,unknown>{
 const input=bounded(p.inputTokens??p.tokensIn),hit=bounded(p.cacheHitInputTokens);
 return {status:p.status??'completed',provider:String(p.provider??'unknown').trim(),model:String(p.model??'unknown').trim(),
  input_tokens:input,cache_hit_input_tokens:hit,cache_miss_input_tokens:p.cacheMissInputTokens===undefined?Math.max(0,input-hit):bounded(p.cacheMissInputTokens),
  output_tokens:bounded(p.outputTokens??p.tokensOut),cost_micrormb:bounded(p.costMicrormb),pricing_version:p.pricingVersion??null,
  usd_cny_micros:p.usdCnyMicros===undefined?null:bounded(p.usdCnyMicros),usage_estimated:p.usageEstimated??false,byo:p.byo};
}
export function classifyUsageEvent(ev:UsageEventRow|null,payload:Record<string,unknown>):UsageEventClass{
 if(!ev)return 'absent';
 if(ev.status==='pending')return 'pending';
 const want=expectedUsageColumns(payload);
 const got:Record<string,unknown>={status:ev.status,provider:ev.provider,model:ev.model,input_tokens:num(ev.input_tokens),cache_hit_input_tokens:num(ev.cache_hit_input_tokens),
  cache_miss_input_tokens:num(ev.cache_miss_input_tokens),output_tokens:num(ev.output_tokens),cost_micrormb:num(ev.cost_micrormb),pricing_version:ev.pricing_version,
  usd_cny_micros:num(ev.usd_cny_micros),usage_estimated:ev.usage_estimated,byo:ev.byo};
 return Object.keys(want).every(k=>want[k]===got[k])?'settled':'conflict';
}
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
/** One line per unsettled run. apply=false reads only; apply=true finalizes pending rows and marks what is settled. */
export async function reconcileSettlements(c:ReconcileClient,o:{apply:boolean;limit:number}):Promise<ReconcileLine[]>{
 const out:ReconcileLine[]=[];
 for(const run of await c.unsettledRuns(o.limit)){
  const cls=classifyUsageEvent(await c.usageEvent(run.usage_audit_key),run.finalize_payload);
  const line={explanation_id:run.explanation_id,usage_audit_key:run.usage_audit_key,state:run.state,class:cls};
  if(!o.apply){out.push({...line,action:'dry_run'});continue;}
  if(cls==='conflict'){out.push({...line,action:'left_for_review'});continue;}
  if(cls==='pending'){
   try{await c.finalize(run.user_id,run.usage_audit_key,run.finalize_payload);}
   catch(e){out.push({...line,action:'finalize_failed',error:message(e)});continue;}
  }
  try{await c.markFinalized(run.explanation_id);out.push({...line,action:cls==='pending'?'finalized_and_marked':'marked'});}
  catch(e){out.push({...line,action:'mark_failed',error:message(e)});}
 }
 return out;
}
```

Create `scripts/macro/strategy-reconcile.ts`:

```ts
// scripts/macro/strategy-reconcile.ts
/**
 * Settlement reconcile for macro explanations (runbook §4; plan audit R2-4). Dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/macro/strategy-reconcile.ts [--limit n] [--apply]
 *
 * Lists macro_explanation_runs with finalize_payload set and finalized = false (oldest claim first, default 100), reads
 * the usage_events row whose idempotency_key is the run's usage_audit_key, and prints one JSON line per run:
 * {explanation_id, usage_audit_key, state, class: absent|pending|settled|conflict, action}. --apply finalizes pending rows
 * with the stored payload verbatim through finalizeUsageRun and marks absent / settled / newly finalized rows with
 * macro_mark_finalized; conflict rows are left for a person (runbook §4). Service role only; it never calls a model and
 * never recomputes pricing or FX. Exit 0 when every line is dry_run / marked / finalized_and_marked, 1 when any run still
 * needs attention, 2 on bad arguments. tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {finalizeUsageRun,type RecordUsageMeta} from '../../src/lib/billing/quota';
import {supabaseStrategyDb} from '../../src/lib/macro/strategy/db';
import {reconcileSettlements,USAGE_EVENT_COLUMNS,type ReconcileClient,type UnsettledRun,type UsageEventRow} from '../../src/lib/macro/strategy/reconcile';
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {getAnonSupabase} from '../../src/lib/supabase/anon';

type Result<T>={data:T|null;error:{message:string}|null};
interface Query<T>{
 eq(column:string,value:unknown):Query<T>;
 not(column:string,operator:string,value:unknown):Query<T>;
 order(column:string,options:{ascending:boolean}):Query<T>;
 limit(n:number):PromiseLike<Result<T[]>>;
 maybeSingle():PromiseLike<Result<T>>;
}
interface AdminTables{from<T>(table:string):{select(columns:string):Query<T>}}
const USAGE='usage: strategy-reconcile.ts [--limit n] [--apply]';
const DONE=new Set(['dry_run','marked','finalized_and_marked']);

function parseArgs(argv:string[]):{apply:boolean;limit:number}|null{
 const a={apply:false,limit:100};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')a.apply=true;
  else if(argv[i]==='--limit'){const n=Number(argv[++i]);if(!Number.isInteger(n)||n<1||n>1000)return null;a.limit=n;}
  else return null;
 }
 return a;
}
function client():ReconcileClient{
 const admin=getAdminSupabase();const tables=admin as unknown as AdminTables;
 const db=supabaseStrategyDb({admin,anon:getAnonSupabase()});
 return {
  async unsettledRuns(limit){
   const {data,error}=await tables.from<UnsettledRun>('macro_explanation_runs').select('explanation_id,user_id,usage_audit_key,state,finalize_payload')
    .eq('finalized',false).not('finalize_payload','is',null).order('claimed_at',{ascending:true}).limit(limit);
   if(error)throw new Error(error.message);
   return data??[];
  },
  async usageEvent(key){
   const {data,error}=await tables.from<UsageEventRow>('usage_events').select(USAGE_EVENT_COLUMNS).eq('idempotency_key',key).maybeSingle();
   if(error)throw new Error(error.message);
   return data;
  },
  finalize:(userId,key,payload)=>finalizeUsageRun(userId,key,'perspectives',payload as unknown as RecordUsageMeta),
  markFinalized:id=>db.markFinalized(id),
 };
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 if(!args){process.stderr.write(`${USAGE}\n`);process.exitCode=2;return;}
 const lines=await reconcileSettlements(client(),args);
 for(const l of lines)process.stdout.write(`${JSON.stringify(l)}\n`);
 process.exitCode=lines.every(l=>DONE.has(l.action))?0:1;
}
main().catch(e=>{process.stderr.write(`${e instanceof Error?e.message:String(e)}\n`);process.exitCode=1;});
```

- [ ] **Step 4: Write the runbook**

Create `docs/runbooks/macro-strategy.md`:

````markdown
# Macro strategy (P3 + P4) runbook

Spec: `docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md` (draft 5). Plan: `docs/superpowers/plans/2026-11-07-macro-workbench-p3-p4.md`.
Code: `src/lib/macro/strategy/**`, `src/app/api/macro/strategy/**`, `src/app/api/cron/macro-review/route.ts`, `src/components/macro/strategy/**`, `src/app/(app)/intel/macro/{transmission,history,review}/**`.
Storage: migration `supabase/migrations/20261115090000_macro_strategy.sql` (six tables, eight `security definer` RPCs, writes only through the RPCs).

## 1. Switches and the capability matrix (spec §9.1)

| Condition | Pages | Fact APIs (transmission, policy-response, cycle-table, reviews, manifests) | Explanations | Playbook mark / judgment section / deviations |
|---|---|---|---|---|
| `MACRO_STRATEGY_ENABLED` unset | 404 | 404 `strategy_disabled` | 404 | 404 |
| enabled, P1+P2 not wired (`strategyPort()` is `null`) | "宏观数据底座未就绪" | 503 `macro_foundation_unavailable` | 503 (a replay of an existing request still answers) | 503 |
| wired, `MACRO_JUDGMENTS_ENABLED` unset | normal | normal | normal, no judgments | absent; `/deviations` 404 `judgments_disabled` |
| wired, judgments on, F4 unreachable | normal, "判断层暂不可用" | normal (`judgment_status: 'unavailable'`) | normal | `/deviations` 503 `judgments_unavailable` |
| everything available | normal | normal | normal | normal |

Order inside every route: session (401) → `MACRO_STRATEGY_ENABLED` (404) → explanation replay (POST only) → foundation (503) → parameters (400) → judgment layer. Values: `'1'` turns a switch on; anything else is off.

Other variables: `CRON_SECRET` (review cron bearer), `NEXT_PUBLIC_SITE_URL` (F4 client base URL; unset → F4 unavailable), `VERCEL_GIT_COMMIT_SHA` (code version; unset → manifest-writing routes and the cron answer 503 `code_version_unavailable`). No new secrets.

Turn on order: WP-S6 wiring merged and verified → set `MACRO_STRATEGY_ENABLED=1` in Vercel production → redeploy (manual CLI deploy, see the production deploy notes) → open `/intel/macro/transmission`. The judgment layer stays off until the F4 owner turns `MACRO_JUDGMENTS_ENABLED` on.

## 2. Wiring P1 + P2 and F4 (WP-S6)

Until P1+P2 and F4 are on `main`, `strategyPort()` returns `null` and every fact route answers 503. After they merge, in one rebase:
1. Replace the mirrored declarations in `src/lib/macro/strategy/contract.ts` with imports from `src/lib/macro/{types,judgment-contract,events}`; add a type test asserting assignability both ways.
2. Add `src/lib/macro/strategy/wiring.ts` with `macroDbStrategyPort` over P1 `MacroDb` (`snapshotUpTo` pages `snapshotsSince` with a keyset and throws `truncated` when it cannot finish), `rules()` from P1 `RULES`, `derivePolicyEvents` from P2 `events.ts`, `timeliness` from P1 `releaseTimeliness`; make `strategyPort()` return it.
3. Add `US_FED_TARGET_D` to P1 `catalog.ts` inside a `// MACRO-P3` block (new `CATALOG_VERSION`).
4. Add the three link tabs (传导 / 历史 / 复盘) to P1 `MacroWorkbench.tsx` inside a `// MACRO-P3` block, rendered only while `MACRO_STRATEGY_ENABLED` is on.
5. Replace the HTTP F4 client by F4's in-process read functions if F4 ships them.
6. Re-record the replay fixtures only if the real catalog changes the frozen manifests, then run the full gate (section 7).
7. Measure the fact routes against spec §13 (p95 < 500 ms; < 100 ms on a cache hit). The process LRU of spec §4.5 is not built yet (every request rebuilds the manifest and `putManifest` is idempotent by hash); add it in `route-helpers.ts`, keyed by `(kind, both snapshot ids, cutoff, catalog_version, code_version)`, only if the targets are missed.
8. `vercel.json`: P1 also appends `/api/cron/macro-sync`. Merge the `crons` array by hand at rebase and keep both entries.
9. Links that 404 until this step lands: the 宏观工作台 tab (`/intel/macro`), observed-node and watch links (`/intel/macro/<seriesId>`) and the F4 method link (`/intel/methods/<id>/<version>`). Open each once after wiring.
10. Check the F4 read details against the merged F4 routes: the history cursor (`before`), `{cards}` vs `{items}`, the shape of `realized`, `settlement_id`, and the calibration values mapped by `f4.calibrationState.*`.

## 3. Monthly review

- Schedule: `vercel.json` runs `GET /api/cron/macro-review` at `0 6 3 * *` (UTC) for the newest closed month, US then CN.
- Cutoffs (spec §6.2): a review of month M is known as of the 3rd of M+1, 00:00:00Z; its baseline is known as of the 3rd of M, 00:00:00Z. A month is closed once its cutoff has passed, so the scheduled run on the 3rd at 06:00 UTC targets the previous month and a manual `?month=` before its cutoff is a 400. The compared periods stay month end vs month end; timeliness and the F4 judgment section (`asOf`) use the cutoff date.
- Manual run (one unit): `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/macro-review?month=2026-10&region=US"`.
- Dry run (zero writes): add `&preview=1`; the receipt shows the status and manifest hash the run would publish.
- Receipt: `{ok, month, preview, receipts:[{region, month, outcome, status, manifest_hash, manifest_id, result_id, generation, code?}]}`. `outcome` is `advanced` (pointer moved), `replayed` (same inputs, pointer unchanged), `stale` (another run won the generation, or an older cutoff), `preview`, or `failed` (`code: review_failed`, HTTP 500).
- Recompute: rerun the same month. The result row is immutable per manifest hash; the pointer only moves forward (`generation + 1`). A failure never moves the pointer.
- Failed attempts: service-only table `macro_review_attempts` (`status = 'failed'`, `error` jsonb). Read with the service role: `select region, month, created_at, error from public.macro_review_attempts where status = 'failed' order by created_at desc limit 20;`
- `insufficient`: no non-failed snapshot existed at that month's cutoff. Generate the snapshot in P1, then rerun the month.

## 4. Explanations (LLM)

- Quota and billing reuse the `perspectives` feature: `checkQuota('perspectives')` for platform keys (BYO skips it), `beginUsageRun` / `runMeteredLlmCall` / `finalizeUsageRun` exactly as the perspectives route. A rejected output is a completed call and counts.
- The usage audit key is the explanation_id itself (uuid text; `begin_usage_run` / `finalize_usage_run` declare `p_idempotency_key uuid`) (made by `macro_claim_explanation`). Only the request that got `claimed` bills and calls the model; concurrent duplicates get the existing projection.
- A running claim older than 5 minutes **without a recorded completion** is turned into `abandoned` (projection `failed`, code `abandoned`) by the next claim of the same request, and by `macro_expire_explanations(user_id)`, which `GET /explanations` runs before every read — so a page reload resolves a run whose worker died; the panel then offers a new request.
- Durable completion: right after the provider returns (or throws, or `beginUsageRun` fails) the request stores the raw output and the exact `finalizeUsageRun` body (`finalize_payload`: status, provider, model, tokens, cost, pricing version, FX, `usageEstimated`, `byo`) with `macro_record_completion`, before validation and finish. A successful provider call is stored as a completion envelope `{content, provider, model, prompt_version, validator_version, accounting}`. `macro_finish_explanation` carries the same payload and stores it when none is recorded (never overwriting one). `finalizeUsageRun` then runs in a finally path even when finish fails; `macro_mark_finalized` is called only after it succeeded.
- Completion recovery (no second model call): a run still `running` with a recorded envelope (finish failed after the provider answered) is never abandoned. The next POST with the same `request_id`, or the user's next `GET /explanations` (at most three such runs per read), validates and renders the stored output against the manifest's frozen facts and finishes it as `accepted` / `rejected`; if `VALIDATOR_VERSION` changed since the call it finishes `failed` with `validator_version_changed`. The same step finalizes a recorded, unsettled payload verbatim. List rows waiting for it: `select explanation_id, user_id, claimed_at from public.macro_explanation_runs where state = 'running' and jsonb_typeof(raw_output) = 'object' order by claimed_at;` — a row that stays there means its manifest read or finish keeps failing; check the function logs.
- Settlement reconcile: every run with a recorded payload and `finalized = false`, in any state (final, still `running` after a failed finish, or `abandoned` with a late completion). Do **not** classify a run from a `finalizeUsageRun` error: the wrapper (`src/lib/billing/quota.ts`) retries three times and then throws only `usage_audit_invariant` (SQLSTATE 55000, `usage run finalize conflict`) or `usage_audit_unavailable` (everything else — `usage run not found` (P0002) and a transient outage look the same). Look the usage run up by its key instead. Run the script with the service-role environment:
  - `node --env-file=.env.local --import tsx scripts/macro/strategy-reconcile.ts` (dry run: one JSON line per run with its class), then the same with `--apply` (`--limit n`, default 100, max 1000).
  - It reads `usage_events` where `idempotency_key = usage_audit_key` and acts per class:

| Class | `usage_events` row | `--apply` does | Why |
|---|---|---|---|
| `absent` | none | `macro_mark_finalized` | `beginUsageRun` never committed, so the model was never called; nothing to settle |
| `pending` | `status = 'pending'` | `finalizeUsageRun(user_id, usage_audit_key, 'perspectives', finalize_payload)` verbatim, then `macro_mark_finalized` | the earlier finalize never landed; a failure is printed as `finalize_failed` with the wrapper code and the run stays unfinalized for the next pass |
| `settled` | terminal and equal to the stored payload | `macro_mark_finalized` | an earlier finalize succeeded and only the mark was lost |
| `conflict` | terminal and different (for example `failed` with `usage_estimated = true` from `fail_stale_usage_runs`) | nothing (`left_for_review`) | decide by hand with billing; never edit the stored payload |

  - Exit 0 when every line is `dry_run` / `marked` / `finalized_and_marked`; 1 when any run still needs attention. Manual equivalent of the lookup: `select status, provider, model, input_tokens, output_tokens, cost_micrormb, pricing_version, usd_cny_micros, usage_estimated, byo, finalized_at from public.usage_events where idempotency_key = '<usage_audit_key>';`
  - Never recompute the payload from current pricing or FX and never rerun the model; `finalize_usage_run` is idempotent for identical arguments, so repeating a settled payload is safe.
- Runs with `finalize_payload` null: since `macro_finish_explanation` stores the payload too, this happens only when both `macro_record_completion` and finish failed. The run expires to `abandoned` (it has no recorded output) and its usage run stays `pending` until `fail_stale_usage_runs` marks it failed. List them with `select explanation_id, usage_audit_key, state from public.macro_explanation_runs where finalize_payload is null and finalized = false and state = 'abandoned';`, look each key up in `usage_events` as above and settle by hand with billing; `macro_mark_finalized` refuses them.
- Failure codes shown to users:

| Code | Meaning | Action |
|---|---|---|
| `parse` | model output is not JSON | none; user may regenerate |
| `schema` | JSON shape, counts or lengths wrong | none |
| `unknown_fact` | cites a fact id outside the frozen fact list | none |
| `numeral` | a number token in model text (digits, full-width, circled, Chinese numerals in a quantity context, English number words, %, bp, pp) | none; this is the lexical policy working |
| `forbidden_term` | a term from `FORBIDDEN_TERMS` | none |
| `regime_term` | a regime name (v1 explanations carry no judgment) | none |
| `provider_error` | the model call failed | check provider status; user retries with a new request |
| `validator_version_changed` | a recorded output was recovered after a validator release, so it was not judged again | none; user may regenerate |
| `abandoned` | the claim timed out | check function timeouts |
| `usage_audit_unavailable`, `usage_audit_invariant`, `daily_cost_exhausted`, `pricing_unavailable`, `budget_unavailable`, `budget_invariant_violation` | metering refused the run (same codes as perspectives) | see the billing runbook entries for the code |

- Error responses: 409 `payload_conflict` (same request id, different subject or locale), 429 `quota_exceeded`, 503 `llm_not_configured`, 404 `subject_not_found`, 422 `no_facts`.
- Raw model output lives only in the service-only `macro_explanation_runs.raw_output`; users read `macro_explanations` (their own rows, RLS).

## 5. Catalog additions

New series (owner item A: RRP `RRPONTSYD`, TGA `WTREGEN`, Fed total assets `WALCL` for the QE / QT row) go through P1's catalog process first (rights, adapter, fixtures, `CATALOG_VERSION`). Then:
1. transmission: change the node from `not_in_catalog` to `observed` in `data/transmission-v1.ts` → new `macro-transmission/2` version string in `contract.ts` `VERSIONS` (a plan change);
2. response matrix: QE / QT needs a balance-sheet event definition first; it stays `missing` until the spec defines it;
3. rerun the replay fixtures and record the new manifests.
Restricted series (VIX, SP500 / NASDAQ / DJIA, CSI 300) stay `restricted` until owner item C confirms redistribution rights.

## 6. Troubleshooting

- Every fact route 503 `macro_foundation_unavailable`: WP-S6 not deployed, or `strategyPort()` still returns `null`.
- Transmission 404 `no_published_snapshot`: neither region has an active P1 snapshot.
- A matrix or history column all `missing (history_truncated)`: the history read exceeded `HISTORY_MAX_ROWS`; check P1 observation counts.
- `judgment_status: 'unavailable'` while F4 is up: check `NEXT_PUBLIC_SITE_URL` and that `/api/judgments` answers JSON within 3 s.
- Manifests: `GET /api/macro/strategy/manifests/<id>` returns the full frozen input set of any view (ids in each view's `manifest_id`).

## 7. Verification gate

`npm test`, `npm run typecheck`, `npm run lint`, then with Homebrew PostgreSQL 17 and only for these two commands `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` and `… npm run test:migrations`. Known local flakes under load (pass in isolation; Linux CI is the gate): research suites `s6/store`, `s6/arm-lineage`, `fanout/run`, `s4/ledger`, `s4/checkpoint-registry`, `s4/anchor-two-phase` (5 s timeouts that cascade within the file). Rerun a single DB file with `.claude/scratch/db-one.ts` (handoff doc 2026-11-04 §5).
````

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- "src/app/(app)/intel/macro/transmission/strategy-pages.test.ts" src/lib/macro/strategy/forbidden-terms.test.ts src/lib/macro/strategy/reconcile.test.ts`
Expected: PASS, `Tests  17 passed (17)` (pages 6, vocabulary 6, reconcile 5).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0 with no errors and no warnings.

- [ ] **Step 7: Production build and the prompt assets (gate for `readFileSync(new URL(...))` in `explain-request.ts`)**

`promptText()` (Task 11) reads `prompts/macro-explain-v1.{zh,en}.md` with `readFileSync(new URL('./prompts/…', import.meta.url))`. Vitest resolves that against the source tree, so only a production build proves the two files ship with the server bundle.

Run: `npm run build`
Expected: the build succeeds and lists the routes `/intel/macro/transmission`, `/intel/macro/history`, `/intel/macro/review`, `/intel/macro/review/[region]/[month]`, the eight `/api/macro/strategy/*` routes and `/api/cron/macro-review` as dynamic (ƒ).

Then run: `grep -rl "macro-explain-prompt/1 · zh" .next/server; grep -rl "macro-explain-prompt/1 · en" .next/server`
Expected: each command prints at least one path (the emitted copy of each prompt file, or a chunk that inlines it). If either prints nothing, or the build fails inside `explain-request.ts`, stop and report to the orchestrator: the fallback is to move the two prompt texts into `src/lib/macro/strategy/prompts/macro-explain-v1.ts` string constants (Task 10 files) and make `promptText()` return them (Task 11); the tests only assert that the text contains `macro-explain-prompt/1`, so they do not change. If the build fails only because an environment variable unrelated to this module is missing locally, report the message to the orchestrator and continue; Vercel's build is the gate for that.

- [ ] **Step 8: Full gate**

Run each command from the worktree root; `LC_ALL=C` goes only on the two database commands (exporting it for `npm test` breaks three CLI unit files):

```bash
npm test
npm run typecheck
npm run lint
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
```

Expected: `npm test`, `typecheck`, `lint` and `test:migrations` pass with no failures. `test:db` passes, including `src/lib/macro/strategy/strategy.integration.test.ts` (Task 1/3, listed in `criticalSuites`).

Known local flakes (handoff doc `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5): under machine load a full `test:db` (10+ minutes) can fail 5–6 existing research suites with 5 s timeouts that cascade within each file: `s6/store`, `s6/arm-lineage`, `fanout/run`, `s4/ledger`, `s4/checkpoint-registry`, `s4/anchor-two-phase`. They are not part of this plan and pass in isolation; Linux CI is the formal gate. Do not chase a failure in those suites that does not repeat. Any failure in a `src/lib/macro/strategy/**` suite, or a repeating one elsewhere, is real. To rerun one database file against a fresh cluster:

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/macro/strategy/strategy.integration.test.ts
```

(`.claude/scratch/db-one.ts` is not committed; if it is missing, recreate it from the handoff doc §5, which prints its 15 lines verbatim.)

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/intel/macro/transmission" "src/app/(app)/intel/macro/history" "src/app/(app)/intel/macro/review" src/lib/macro/strategy/forbidden-terms.test.ts src/lib/macro/strategy/reconcile.ts src/lib/macro/strategy/reconcile.test.ts scripts/macro/strategy-reconcile.ts docs/runbooks/macro-strategy.md
```

```bash
git commit -F - <<'EOF'
feat(macro-strategy): transmission, history and review pages, vocabulary scan, runbook (spec 2026-11-07 §3.1, §9.1, §12, §13)

Four force-dynamic server pages under /intel/macro: 404 while
MACRO_STRATEGY_ENABLED is off, the foundation-not-ready state while the
P1+P2 port is not wired, otherwise the client screens. A structural test
pins the gates and keeps environment reads out of pages and components. A
scan of every production text surface (library, data, prompts, components,
messages, routes, pages) rejects the validator's forbidden terms. The
runbook covers the capability matrix, WP-S6 wiring, review recompute,
explanation failure codes, completion recovery and settlement reconcile, and
the verification gate. reconcile.ts and scripts/macro/strategy-reconcile.ts
classify unsettled runs by their usage_events row (absent / pending /
settled / conflict) instead of the billing wrapper's error, which cannot tell
a missing usage run from an outage.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

