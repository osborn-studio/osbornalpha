# 公司研究与跟踪模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-company-research-design.md`（**第 6 稿**；§0 为规范性修订，与正文冲突时以 §0 为准；owner 决策 §15 A–K 全部取默认值）：公司页 `/stock/[ticker]` 升级为按市场流的事实视图（报表 / 指标 / 文件 / 概览 + 披露历史抽屉 + `asOf` 回放），事实驱动的公司事件物化与按用户跟踪收件箱，覆盖目录 `/intel/companies`，`/api/financials` 读者迁移（DCF、agent 工具、`useFinancials`、consensus mock），全部数值经统一证据门槛。

**Architecture:** 两个迁移（表 + 函数）；`src/lib/company/db.ts` 的 `CompanyDb` 契约有 Supabase / 内存 / pg 三实现；规格二已落地的 `FactsDb` 只读复用，规格二未落地的读能力由本模块适配器提供（`company_read_snapshot` 同快照读、证据索引 `company_fact_evidence` + 读函数、`metric-catalog.ts`、`/api/companies/snapshot`）；事件推导、覆盖汇总、网格构建、证据门槛、DCF 种子全是纯函数；物化 cron 只依赖注入的 `CompanyDb`、`FactsDb`、快照读取器；页面是服务端 `page.tsx` + 客户端视图，UI 按 Claude Design 画布实现。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、next-intl、vitest、`pg`（集成测试）、Playwright（e2e）、`tsx` 脚本。

**画布：** [公司研究与跟踪 Company Research](https://claude.ai/artifact/RTWzyyWQikDPCdD8VaBLsv)；12 个画板源文件已复制到 `docs/superpowers/plans/assets/2026-11-06-company-canvas/project/*.dc.html`（`Main`=报表视图、`Replay`、`Metrics`、`Filings`、`Overview`、`Drawer`、`States`、`Tracking`、`Directory`、`M-Company`、`M-Drawer`、`M-Tracking`）。UI 任务**必须**先读对应画板；画板里的数值是版式示意，不是数据；画板用的类名（`card`、`chip`、`bdg`、`seg`、`t`、`tabs`…）是画布样式，实现时一律换成 `DESIGN.md` / `globals.css` tokens 与 `src/components/ui` 组件。

实施按 owner 规则：指挥 Opus 5.5；每任务 Sonnet 5.5 实施子代理（`model: sonnet`）→ Opus 规格复审 → Opus 质量复审 → Codex CLI（gpt-6-astra，medium）`codex review` + 对抗挑战 → 修复 P1/P2；记录在 `docs/audits/2026-11-06-company-research/01-implementation-log.md`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/company-research-ebd56f`（分支 `claude/company-research-ebd56f`）。不要 `cd` 出去；不要裸 `git stash`（栈与其他工作树共享）。
- **只读依赖（不得修改）**：`src/lib/facts/*`、`src/lib/facts/providers/*`、`src/app/api/facts/*`、`src/app/api/filings/*`、`supabase/migrations/20261106090000_financial_facts.sql`、`src/lib/entities/*`、`src/lib/dq/*`。需要的能力缺失时在 `src/lib/company/*` 写适配器，并在本计划末尾"接口请求清单"登记。
- **迁移**：`supabase/migrations/20261112090000_company_research.sql`（表、索引、触发器、RLS、授权）与 `supabase/migrations/20261112091000_company_research_functions.sql`（全部函数与其授权）。可重放：`create table if not exists`、`create index if not exists`、`create or replace function`、`drop policy if exists` 后 `create policy`、`drop trigger if exists` 后 `create trigger`。写入 `supabase/migrations.lock.json`（追加 `{file, sha256}`，文件字节的 hex；已锁文件不可再改——所以迁移只在其任务的最后一步锁定，后续任务需要改 SQL 时，只能改**尚未锁定**的文件；Task 2 锁定两个文件之前必须让全部 SQL 定稿）。`scripts/ci/research-checks.ts::migrationInventory` 要求新迁移晚于已锁最新（当前 `20261106090000`）。并行分支占用：计划三 `20261107*`、F3 `20261108*`、F4 `20261109*`、F6 `20261110*`、行业 `20261111*`；本模块只用 `20261112*`。
- **SQL 写法**：函数 `security definer set search_path = ''`，对象全部 `public.` 限定（`pg_catalog` 函数如 `sha256`、`convert_to`、`encode`、`jsonb_*` 不需要限定）；托管实例 `postgres` 角色非超级用户，函数 owner 就是迁移角色，不要 `alter function … owner to`。每个函数后 `revoke execute on function … from public, anon, authenticated;` 再 `grant execute … to <角色>`（Supabase 默认给 anon/authenticated 新函数 EXECUTE）。新表先 `revoke all on table … from public, anon, authenticated, service_role;` 再按规格 §4.6 + §0 #64 授权。
- **本地 harness**：`test:db`（`scripts/ci/research-db.ts`）启动本地 PostgreSQL 17、按序执行全部迁移、再跑 vitest；本地只建了 `storage.buckets` 五列，迁移不得引用 `storage.objects`。本地 PostgREST `max_rows=1000`：返回多行的函数一律返回单个 `jsonb`。
- **集成测试**：读 `process.env.S4_TEST_STATE`（JSON，含 `adminUrl` 等），`describe.skipIf(!enabled)`。**任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 都必须加进 `scripts/ci/research-checks.ts::criticalSuites`**（放在 `// COMPANY` 注释块里），否则 `test:db` 报 "Database suite inventory drift"。迁移重放助手 `replayMigration` 未导出：从 `src/lib/facts/facts.integration.test.ts:26` 复制到本模块测试文件。角色切换用 `set local role anon|authenticated|service_role` + `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'`（参照 `src/lib/facts/facts.integration.test.ts` 的写法）。
- **只跑一个 DB 测试文件**：工作树 `.claude/scratch/db-one.ts`（未提交；内容见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5，丢了按那里重建），用法 `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/company/company-research.integration.test.ts`。`LC_ALL=C` 只给 `test:db`/`test:migrations`/`db-one`，**不要**导出给 `npm test`。
- **共享文件改动隔离**（并行分支要合并）：`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`、`vercel.json`（JSON 无注释：只追加一个 cron 对象，不重排）、`src/i18n/request.ts::MESSAGE_DOMAINS`、`src/i18n/messages-parity.test.ts` 的改动都包在 `// COMPANY` 起止注释内。
- **Supabase 客户端**：公共读 `getAnonSupabase()`（`src/lib/supabase/anon.ts`）；服务端特权 `getAdminSupabase()`（`src/lib/supabase/admin.ts`）；会话 `await getServerSupabase()`（`src/lib/supabase/server.ts`）。管理员门禁 `requireAdminUser()`（`src/lib/admin/auth.ts`）；cron 鉴权 `authorizedCronRequest(header, process.env.CRON_SECRET)`（`src/lib/observability/cron-auth.ts`）。批次 `startBatch/finishBatch`（`src/lib/dq/batches.ts`，`INFO_CODES` 已含 `deadline_hit`），新鲜度 `recordAttempt/freshnessOf`（`src/lib/dq/freshness.ts`）。`TableClient` 见 `src/lib/db/table-client.ts`。
- **规格二读接口（只读复用）**：`FactsDb`（`src/lib/facts/types.ts`）、`supabaseFactsDb`（`src/lib/facts/db.ts`）、`publicClients()`、`resolvePublicIssuer`、`readParams/dateParam/intParam/listParam/asOfParam/flagParam`、`QueryError`、`errorResponse`、`paramErrorResponse`、`failureResponse`、`successHeaders`、`STALE_CACHE_CONTROL`、`FRESH_METRICS_CACHE_CONTROL`、`citationOf`、`publicFiling`、`publicFact`、`isPublished`、`TICKER_RE`（`src/lib/facts/public-route.ts`）；`deriveMetrics`、`FORMULA_VERSION`、`Q_SINGLE_CONCEPTS`、`DERIVE_CONCEPTS`、`metricNames`（`derive.ts`）；`FACT_CONCEPTS`、`conceptById`、`MAPPING_GEN`、`MAPPING_VERSION`（`concepts.ts`）；`parseCompanyFacts`（`providers/edgar-companyfacts.ts`）、`parseTushareStatements`（`providers/tushare-statements.ts`）、`rawHashOf`（`providers/shared.ts`）、`SNAPSHOT_BUCKET`、`snapshotPath`、`metaPath`（`snapshot-store.ts`）。解析器返回的候选在运行时带额外的 `locator` 字段（`FactCandidate & {locator:string}`）。
- **路由约定**（规格 §6 + §0）：`export const dynamic='force-dynamic'`；参数用 `readParams(url, allowed)`（重复 → 400 `invalid_parameter:<name>`）；票据一律 `resolvePublicIssuer`（§0 #69）；错误与空结果 `Cache-Control: no-store`；成功用 `successHeaders(now, asOf, empty)`；公共端点不读会话；按用户端点 `private, no-store`、未登录 401 `not_authenticated`；管理端点 `requireAdminUser()` + `private, no-store`。
- **i18n**：新消息域 `company`、`tracking`（`messages/{zh,en}/company.json`、`tracking.json`），注册到 `src/i18n/request.ts::MESSAGE_DOMAINS` 并加入 `src/i18n/messages-parity.test.ts` 的域循环。受保护页面语言由 `NEXT_LOCALE` cookie 决定。
- **UI**：遵守 `DESIGN.md` 与 `src/app/globals.css` tokens（黄铜唯一强调色，无紫色、无渐变）；组件优先用 `src/components/ui`（`Button`、`Card`、`Metric`、`Panel`、`Tag`）；每个数字是打开抽屉的 `<button>`；图表都有表格等价视图；移动端 < 640px 按 §5.9。
- **提交**：`git commit` 单独一条命令（仓库钩子拦截同一命令里出现的任何 `-n` 记号，包括 `grep -n`、`head -n`）；不要 `--no-verify`；提交信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理）或 `Claude Opus 5.5`（指挥）。
- **测试命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`npm run test:db`、`npm run test:migrations`、`npx playwright test e2e/company.spec.ts`。
- **代码风格**：`src/lib/facts`、`src/lib/dq` 的紧凑风格（单空格缩进、少空行）用于 `src/lib/company/*`；React 组件沿用 `src/app/(app)` 现有风格（两空格缩进）。每个新文件顶部一段注释说明职责与规格条目（如 `// spec §4.6, §0 #64`）。
- **环境变量**：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`、`VERCEL_GIT_COMMIT_SHA`（cron 的 `code_version`；缺失 → 503，与 facts-sync cron 一致）、`NEXT_PUBLIC_COMPANY_F3_DRAWER`、`NEXT_PUBLIC_COMPANY_JUDGMENTS`（缺省关闭）。本机无 `TUSHARE_TOKEN` 时 CN 用规格二的合成夹具 `src/lib/facts/fixtures/tushare/_synthetic/`；`TUSHARE_TOKEN` 在 `~/.config/osbornalpha/secrets.env`，绝不打印。

## 文件结构

```
supabase/migrations/20261112090000_company_research.sql            六表 + 索引 + 触发器 + RLS + 授权（Task 1）
supabase/migrations/20261112091000_company_research_functions.sql  全部函数 + 授权（Task 2）
supabase/migrations.lock.json                                       追加 2 条（Task 2 最后一步）
src/lib/supabase/database.types.ts        // COMPANY 块：六个 Row 类型（Task 1）
scripts/ci/research-checks.ts             // COMPANY 块：criticalSuites += company-research.integration.test.ts（Task 1）

src/lib/company/types.ts                  共享契约（本文件 §共享契约 原样落地；Task 3）
src/lib/company/canonical.ts              canonicalJson / eventIdOf / payloadHashOf（与 SQL 逐字节一致；Task 3）
src/lib/company/db.ts                     CompanyDb re-export + CompanyDbError + supabaseCompanyDb（Task 3）
src/lib/company/memory-company-db.ts      memoryCompanyDb（单测；Task 3）
src/lib/company/db-contract.ts            三实现共用的契约用例 companyDbContract（非测试文件；Task 3）
src/lib/company/db.test.ts                内存契约 + supabase 桩（Task 3）
src/lib/company/pg-company-db.ts          pgCompanyDb（集成测试；Task 4）
src/lib/company/company-research.integration.test.ts   迁移/函数/权限/并发 + pg 契约（critical；Task 1、2、4）
src/lib/company/snapshot-read.ts          readSnapshot(client, issuer, market, opts) → ReadSnapshotResult（company_read_snapshot 包装；Task 3）

src/lib/company/events.ts                 EVENTS_VERSION / deriveIssuerEvents（纯；Task 5）
src/lib/company/coverage.ts               summarizeCoverage（纯；Task 5）
src/lib/company/evidence-index.ts         buildEvidenceIndex（service 作业：快照 → 重新解析 → 全键匹配；Task 6）
src/lib/company/pdf-locator.ts            PdfLocatorSource + emptyPdfLocatorSource（Task 6）
src/lib/company/evidence-gate.ts          evidenceEligible / toEvidenceDto / gateFacts（Task 6）
src/lib/company/decimal.ts                formatDecimalText / divisorOf / scaleFor / decimalSub / decimalRelChange（纯，不经浮点；Task 7）
src/lib/company/metric-catalog.ts         METRIC_CATALOG（按 FORMULA_VERSION）（Task 7）
src/lib/company/statements-grid.ts        buildStatementsGrid / periodKeyOf / primaryUnitOf（纯；Task 7）
src/lib/company/digest.ts                 runCompanyDigest / DigestDeps（Task 8）
src/lib/company/deps.ts                   productionDigestDeps / productionReadDeps（Task 8）
src/app/api/cron/company-digest/route.ts  cron（Task 8）
scripts/company/digest.ts                 --full [--issuer] [--market] [--apply]（Task 8）
vercel.json                               + /api/cron/company-digest 20 * * * *（Task 8）

src/lib/company/route.ts                  组合路由共用：resolve、参数、缓存头、门槛应用、admin 变体工厂（Task 9）
src/app/api/companies/[ticker]/statements/route.ts      （Task 9）
src/app/api/companies/[ticker]/facts/route.ts           抽屉序列（Task 9）
src/app/api/admin/companies/[ticker]/statements/route.ts、…/facts/route.ts   未脱敏变体（Task 9）
src/app/api/companies/[ticker]/overview/route.ts        （Task 10）
src/app/api/companies/[ticker]/events/route.ts          （Task 10）
src/app/api/companies/[ticker]/metrics/route.ts         指标代理（Task 10）
src/app/api/companies/freshness/route.ts                （Task 10）
src/app/api/companies/snapshot/route.ts                 EDGAR 稳定下载（Task 10）
src/app/api/admin/companies/[ticker]/{overview,events,metrics}/route.ts、src/app/api/admin/companies/snapshot/route.ts（Task 10）

messages/{zh,en}/company.json、messages/{zh,en}/tracking.json   （Task 11 建骨架；后续 UI 任务追加键）
src/i18n/request.ts、src/i18n/messages-parity.test.ts           // COMPANY 块（Task 11）
src/app/(app)/stock/[ticker]/page.tsx     服务端组件（Task 11）
src/app/(app)/stock/[ticker]/CompanyPage.tsx          客户端外壳：页头、流切换、页签、回放条（Task 11）
src/app/(app)/stock/[ticker]/legacy/*.tsx             从旧 page.tsx 迁出的 ai / signals / holdings 视图（Task 11）
src/components/company/*.tsx              视图与抽屉组件（Task 11–13）
src/lib/company/client.ts                 客户端 fetch 助手与 DTO 类型守卫（Task 11）

src/lib/company/dcf-seed.ts               seedFromFacts（纯；Task 14）
src/lib/dcf/assemble.ts、src/app/api/dcf/[ticker]/route.ts、src/components/DcfStudio.tsx   读者迁移（Task 14）
src/app/api/companies/[ticker]/packet/route.ts、src/app/api/admin/companies/[ticker]/packet/route.ts   （Task 15）
src/lib/agent/tools.ts、src/lib/agent/methods/*（措辞）、src/lib/hooks/useQuote.ts（删 useFinancials）、src/app/api/consensus/[ticker]/route.ts、src/app/api/stocks/[ticker]/route.ts（TODO 注释）   （Task 15）

src/app/api/tracking/watches/route.ts、[issuerId]/route.ts、[issuerId]/read/route.ts、import-watchlist/route.ts、src/app/api/tracking/inbox/route.ts   （Task 16）
src/lib/company/inbox.ts                  收件箱折叠与 keyset 游标（纯；Task 16）
src/app/(app)/watchlist/tracking/page.tsx + src/components/company/tracking/*   （Task 17）
src/app/api/companies/route.ts、src/app/(app)/intel/companies/page.tsx、src/app/(app)/intel/page.tsx（入口卡）   （Task 18）

src/lib/company/fixtures/manifest.json    夹具清单与人工抄录期望值（Task 5 建，Task 19 补）
e2e/company.spec.ts                       （Task 19）
docs/runbooks/company-research.md         （Task 19）
docs/audits/2026-11-06-company-research/01-implementation-log.md   （每任务追加）
docs/superpowers/specs/2026-11-04-company-research-design.md §17     实施偏差（Task 19）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/company/types.ts` 原样落地）

```ts
// src/lib/company/types.ts
// Shared contract of the company research module (plan 2026-11-06 §共享契约; spec §4, §5.3,
// §5.6, §6, §0). Every task uses these names verbatim. CompanyDb has three implementations:
// supabaseCompanyDb (db.ts, rpc + from), memoryCompanyDb (unit tests), pgCompanyDb (integration).
import type {Market,FactRow,FilingRow,Duration,MetricDuration} from '@/lib/facts/types';
export type {Market};

export type EventKind='filing_published'|'period_first_seen'|'fact_revised';
export const EVENT_KINDS:readonly EventKind[]=['filing_published','period_first_seen','fact_revised'];

/** What deriveIssuerEvents produces and replace_company_digest accepts (event_id/payload_hash are server-computed). */
export interface EventInput{
 kind:EventKind;natural_key:string;occurred_on:string;period_end:string|null;concept:string|null;filing_id:string|null;
 payload:Record<string,unknown>;meta:Record<string,unknown>;
}
/** A stored issuer_events row (service_role only, §0 #64). */
export interface EventRow extends EventInput{
 event_id:string;issuer_id:string;market:Market;payload_hash:string;based_on_rev:number;
 first_seen_at:string;payload_changed_at:string|null;retired_at:string|null;rebuilt_at:string;rebuild_id:string;rebuild_batch_id:string;
}
export interface CitationSummary{linked:number;pending:number;edgar:number}
export interface CoverageInput{
 filings_count:number;facts_count:number;concepts_covered:number;
 earliest_period_end:string|null;latest_period_end:string|null;latest_available_date:string|null;
 citation_summary:CitationSummary;scope_last_success_at:string|null;scope_last_status:'success'|'failed'|null;
}
export interface CoverageRow extends CoverageInput{issuer_id:string;market:Market;based_on_rev:number;rebuilt_at:string;rebuild_id:string;rebuild_batch_id:string}
export interface WatchRow{user_id:string;issuer_id:string;note:string|null;muted:boolean;created_at:string;updated_at:string}
export interface DigestStateRow{
 issuer_id:string;market:Market;digested_rev:number;attempt_seq:number;last_attempt_id:number|null;
 last_success_attempt_id:number|null;last_failed_attempt_id:number|null;last_attempt_at:string|null;
 last_status:'success'|'failed'|null;consecutive_failures:number;next_attempt_at:string;swept_at:string|null;updated_at:string;
}
export interface DueStream{issuerId:string;market:Market;stateRev:number;digestedRev:number}
export interface ReplaceResult{upserted:number;changed:number;retired:number;revived:number}

/** One verified association fact → snapshot (company_fact_evidence, §0.1 item 2). */
export interface EvidenceIndexRow{
 fact_id:string;raw_hash:string;snapshot_sha256:string;snapshot_path:string;hash_locator:string;json_pointer:string;field:string|null;
 source:'edgar'|'tushare';api:string|null;url:string|null;params:Record<string,unknown>|null;
 captured_at:string|null;http_status:number|null;page:number|null;index_version:string;
}
export const EVIDENCE_INDEX_VERSION='company-evidence/1';
/** Output of company_fact_evidence(fact_ids) per fact (joined server-side with run → batch). */
export interface EvidenceRecord extends EvidenceIndexRow{run_id:string;code_version:string|null;tool_versions:Record<string,unknown>|null;mapping_version:string}
export interface PdfLocator{page:number;table:string|null;row:string;column:string;documentUrl:string}

/** §0 #62 — the DTO every financial-value response carries in its `evidence` dictionary. */
export interface EvidenceDto{
 factId:string;rawHash:string;
 snapshot:{source:'edgar'|'tushare';sha256:string;path:string;api:string|null;url:string|null;params:Record<string,unknown>|null;capturedAt:string|null;httpStatus:number|null;page:number|null;download:string|null};
 locator:{hashLocator:string;jsonPointer:string;field:string|null;pdf:PdfLocator|null};
 run:{runId:string;codeVersion:string|null;toolVersions:Record<string,unknown>|null};
 mappingVersion:string;unitRule:string|null;
 sourceDocument:{kind:'edgar_index'|'cninfo_pdf';url:string}|null;
}
export type WithheldReason='evidence_incomplete'|'citation_pending';
export interface WithheldCell{kind:'withheld';reason:WithheldReason;factId:string}
export interface FactCell{kind:'fact';factId:string;value:string;unit:string;availableDate:string;filingId:string;disclosureSeq:number;isRevision:boolean;mappingGen:number;rawHash:string;runId:string;otherUnits:boolean}
export interface DerivedCell{kind:'derived';metric:string;value:string;unit:string;inputUnit:string;basis:string;formulaVersion:string;inputs:{factId:string;concept:string;filingId:string;availableDate:string}[];rule?:'a'|'b'}
/** Grid cell (spec §5.3). null = no visible fact for this concept in this period. `otherUnits` drives the U badge. */
export type Cell=FactCell|DerivedCell|WithheldCell|null;
export interface WithheldCounts{evidenceIncomplete:number;citationPending:number}

export type StatementKind='IS'|'BS'|'CF';
export type Basis='disclosed'|'annual'|'quarterly';
export interface PeriodCol{key:string;periodStart:string;periodEnd:string;duration:Duration|MetricDuration}
export interface GridRow{concept:string;unit:string|null;unitKind:'money'|'shares'|'per_share'|'ratio';sourceConcepts:string[];notes:string|null;cells:Record<string,Cell>}
export interface FilingSummary{filingId:string;formType:string;fiscalYear:number|null;fiscalPeriod:string|null;periodEnd:string|null;availableDate:string;sourceRef:string;source:'edgar'|'tushare';url:string|null;documentUrl:string|null;citation:'edgar'|'linked'|'pending';linkAttempts:number;factCount:number;mappingGen:number}

/** company_read_snapshot result: read_facts envelope + same-statement filings (§0.1 item 3). */
export interface ReadSnapshotResult{stateRev:number;rows:FactRow[];truncated:boolean;filings:FilingSummary[]}
export interface ReadSnapshotOptions{concepts:string[]|null;asOf:string;from?:string|null;to?:string|null;history:boolean;limit?:number}

export class CompanyDbError extends Error{constructor(public code:'stale_computation'|'stale_attempt'|'invalid_event'|'unknown_stream'|'watch_limit'|'invalid_read'|'invalid_evidence'|'internal',message?:string){super(message??code);this.name='CompanyDbError';}}

export interface InboxRow extends EventRow{read:boolean}
export interface CompanyDb{
 // digest (service_role)
 digestDue(now:Date,limit:number):Promise<DueStream[]>;
 sweepDue(olderThan:Date,now:Date,limit:number):Promise<DueStream[]>;
 beginAttempt(issuer:string,market:Market,now:Date):Promise<number>;
 replaceDigest(issuer:string,market:Market,batch:string,attemptId:number,rebuildId:string,basedOnRev:number,sweep:boolean,events:EventInput[],coverage:CoverageInput):Promise<ReplaceResult>;
 markDigestFailed(issuer:string,market:Market,attemptId:number,now:Date):Promise<boolean>;
 backlog():Promise<{failedStreams:number}>;
 digestState(issuer:string,market:Market):Promise<DigestStateRow|null>;
 replaceEvidence(issuer:string,market:Market,rows:EvidenceIndexRow[]):Promise<{upserted:number;deleted:number}>;
 // reads behind the evidence gate (service_role; routes assemble + gate server-side, §0 #64)
 eventsOfIssuer(issuer:string,market:Market,opts:{since?:string;until?:string;kinds?:EventKind[];cursor?:string|null;limit:number}):Promise<{rows:EventRow[];nextCursor:string|null}>;
 eventsOfIssuers(issuers:string[],opts:{kinds?:EventKind[];cursor?:string|null;limit:number}):Promise<{rows:EventRow[];nextCursor:string|null}>;
 evidenceOf(factIds:string[]):Promise<Map<string,EvidenceRecord>>;   // rpc company_fact_evidence, ≤100 per call (batches internally)
 // public reads (anon)
 coverageOf(issuers:string[]):Promise<CoverageRow[]>;
 listCoverage(filter:{market?:Market;issuerIds?:string[]},sort:'latest_available_date'|'latest_period_end'|'name',page:{offset:number;limit:number}):Promise<{rows:CoverageRow[];total:number}>;
 // per user (session client, RLS)
 watchesOf(userId:string):Promise<WatchRow[]>;
 upsertWatch(userId:string,issuerId:string):Promise<{row:WatchRow;created:boolean}>;   // watch_limit → CompanyDbError('watch_limit')
 patchWatch(userId:string,issuerId:string,patch:{note?:string|null;muted?:boolean}):Promise<WatchRow|null>;
 deleteWatch(userId:string,issuerId:string):Promise<boolean>;
 markRead(userId:string,issuerId:string,eventIds:string[]):Promise<{inserted:number}>;
 readEventIds(userId:string,eventIds:string[]):Promise<Set<string>>;
}
```

### SQL 函数签名（Task 2 原样实现；全部返回 jsonb 或标量）

| 函数 | 语言/安全 | 授权 | 规格 |
|---|---|---|---|
| `begin_company_digest_attempt(p_issuer uuid, p_market text, p_now timestamptz) → bigint` | plpgsql definer | service_role | §4.6 |
| `replace_company_digest(p_issuer uuid, p_market text, p_batch uuid, p_attempt_id bigint, p_rebuild_id uuid, p_based_on_rev bigint, p_sweep boolean, p_events jsonb, p_coverage jsonb) → jsonb` | plpgsql definer | service_role | §4.6 ①–⑨ |
| `mark_company_digest_failed(p_issuer uuid, p_market text, p_attempt_id bigint, p_now timestamptz) → boolean` | plpgsql definer | service_role | §4.6 + §0 #70 |
| `replace_company_fact_evidence(p_issuer uuid, p_market text, p_rows jsonb) → jsonb {upserted, deleted}` | plpgsql definer | service_role | §0.1 item 2：每行 `fact_id` 必须属于该流；整流替换（不在 p_rows 中的旧行删除） |
| `company_fact_evidence(p_fact_ids uuid[]) → jsonb` | sql/plpgsql definer stable | anon, authenticated, service_role | §0.1 item 2：≤100；只 ok + published run + 当前代；白名单字段 |
| `company_read_snapshot(p_issuer uuid, p_market text, p_concepts text[], p_as_of date, p_from date, p_to date, p_history boolean, p_limit int) → jsonb {facts: <read_facts 信封>, filings: [...]}` | sql **invoker** stable | anon, authenticated, service_role | §0.1 item 3 |
| `company_digest_due(p_now timestamptz, p_limit int) → jsonb`、`company_sweep_due(p_older_than timestamptz, p_now timestamptz, p_limit int) → jsonb`、`company_digest_backlog() → int` | sql definer stable | service_role | §4.7（`fact_sync_scope` 对 service_role 只读，left join 需一条语句） |

`replace_company_digest` 的 canonical JSON（§4.6 ⑤）与 `src/lib/company/canonical.ts` 必须逐字节一致：对象键按 Unicode 码点升序、无空白、字符串按 JSON 转义（与 `JSON.stringify` 相同）、数值一律以字符串出现（payload 中的值字段本来就是 `value_text` 字符串；整数计数如 `factCount`、`conceptCount` 以 JSON 数字出现，SQL 侧用 `jsonb` 的文本输出前先自建 canonical 序列化函数 `public.company_canonical_json(jsonb) → text`，不要依赖 `jsonb::text`（它在 `:` 与 `,` 后加空格））。Task 2 的集成测试断言 SQL 与 TS 对同一组 payload 的 `event_id`/`payload_hash` 相等。

### 事件 payload 固定 schema（Task 2 SQL 校验与 Task 5 TS 产出共用）

```
filing_published   payload {formType:string, fiscalYear:int|null, fiscalPeriod:string|null, periodEnd:date|null, availableDate:date, sourceRef:string, factCount:int}   meta {}
period_first_seen  payload {periodStart:date, periodEnd:date, duration:string, filingId:uuid, conceptCount:int, headline:{[k in revenue|revenue_operating|net_income_parent|operating_cash_flow]?:{factId:uuid,value:string,unit:string}}, ambiguousUnits:string[]}   meta {headlineAsOf:date}
fact_revised       payload {concept, statement, periodStart:date, periodEnd:date, duration, consolidation:'consolidated', unit, from:{factId,value,filingId,availableDate}, to:{factId,value,filingId,availableDate}, relChange?:string}   meta {}
```
`relChange` 为精确十进制字符串（`decimalRelChange(from,to)`，10 位小数，四舍五入远离零；`from=0` 时省略）。payload 中 `value` 必须等于对应事实的 `value_text`（函数校验）。

---

## 任务总表

推荐顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 14 → 15 → 11 → 12 → 13 → 16 → 17 → 18 → 19。Part A/B 是后续全部任务的前提；Task 11 之后的 UI 任务依赖 Task 9/10 的路由 DTO。

| Task | 工作包 | 内容 | 规格 |
|---|---|---|---|
| 1 | C0 | 表迁移 + RLS/授权 + 触发器 + Row 类型 + 集成测试骨架（critical） | §4.1–4.4、§4.6 权限、§0 #64、§0.1 item 2 表 |
| 2 | C0 | 函数迁移（digest 三函数、证据写/读、同快照读、选择三函数、canonical JSON）+ 并发与角色集成测试 (a)–(f) + 锁定两份迁移 | §4.6、§12.2、§0 #64 #70 |
| 3 | C0 | `types.ts`、`canonical.ts`、`CompanyDb` 契约 + supabase/内存实现 + `snapshot-read.ts` | §4.7、§0.1 |
| 4 | C0 | `pgCompanyDb` + 真实库契约 | §4.7、§12.2 |
| 5 | C0 | `events.ts`、`coverage.ts` + 夹具清单骨架 | §7、§4.1–4.2、§12.0、§0 #72 |
| 6 | C0/C1 | 证据索引构建器、`pdf-locator.ts`、`evidence-gate.ts`（DTO + 门槛） | §5.6、§0.1 item 2、§0 #62 #63 |
| 7 | C1 | `decimal.ts`、`metric-catalog.ts`、`statements-grid.ts` | §5.3、§5.4、§0 #66 |
| 8 | C0 | `digest.ts` + cron + 脚本 + `vercel.json` + 依赖装配 | §6.3、§11 |
| 9 | C1 | 组合路由共用层 + statements + facts（抽屉）+ admin 变体 | §6、§6.1、§6.4、§0 #67 #68 #69 |
| 10 | C1 | overview、events、metrics 代理、freshness、snapshot + admin 变体 | §6.1、§6.4、§0 #62 #64 #67 |
| 11 | C1 | i18n 两域、服务端 `page.tsx`、`CompanyPage` 外壳（页头、流切换、页签、回放条、状态）、旧视图迁出、mock 不再渲染、决策 E/J | §5.1、§5.2、§5.7、§5.9、§5.10、决策 E/J |
| 12 | C1 | 报表视图 + 披露历史抽屉 + 公式抽屉 + 概念说明 + CSV + 迷你柱 | §5.3、§5.6 |
| 13 | C1/C5 | 指标视图、文件视图、概览视图、判断视图（F4 开关）、F3 开关、移动端 | §5.4、§5.5、§5.8、§10.3、§10.4 |
| 14 | C2 | `dcf-seed.ts`、`assemble.ts` 合并与来源、`/api/dcf`、`DcfStudio` 股权桥面板 | §9.1、§0 #65 |
| 15 | C2 | `packet` 路由、agent `financials` 工具、方法措辞、删 `useFinancials`、consensus mock 关闭 | §9.2–9.5、§6.1 packet |
| 16 | C3 | 跟踪 API（watches/read/import/inbox）+ `inbox.ts` | §6.2、§7.3、§0 #64 |
| 17 | C3 | `/watchlist/tracking` 页 + 公司页跟踪视图 | §6.2、§7.3、画板 Tracking/M-Tracking |
| 18 | C4 | `/api/companies` + `/intel/companies` + `/intel` 入口卡 | §8 |
| 19 | C6 | e2e、夹具清单补全、runbook、规格 §17、全量门禁 | §12.3、§13 C6、§14 |

---

<!-- PART A (Tasks 1–4) -->

<!-- PART B (Tasks 5–8) -->

<!-- PART C (Tasks 9–10, 14–15) -->

<!-- PART D (Tasks 11–13) -->

<!-- PART E (Tasks 16–19) -->

---

## 接口请求清单（列入 PR；对规格二 / 规格三 / F3 / F4 的请求）

1. 规格二：`read_facts` 增 `p_include_filings`（本模块以 `company_read_snapshot` 适配）。
2. 规格二：`fact_evidence(fact_ids)` 与快照 meta 的可查登记（本模块以证据索引适配）。
3. 规格二：`METRIC_CATALOG` 公式文本（本模块 `metric-catalog.ts`）。
4. 规格二：`financial_metrics.computed_at` 进入 `MetricRow` 与 `/metrics` DTO。
5. 规格二：EDGAR 快照稳定下载端点（本模块 `/api/companies/snapshot?fact=`）。
6. 规格三：CN 逐值 PDF 定位登记（本模块 `PdfLocatorSource`，缺省为空 → CN 公共 withheld）。
7. F3：`<SourceDrawer>` 与 `/api/documents/by-filing/[filingId]`（开关 `NEXT_PUBLIC_COMPANY_F3_DRAWER`）。
8. F4：`JudgmentCard` + `GET /api/judgments?view=as_known&asOf=`；事件 DTO（收件箱合并，C5 后续）。

## 自检记录（写计划时完成）

（整合代理填写）
