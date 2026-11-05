# 数据底座三：标识符补全 + 对账 + 日历新鲜度 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md`（第 6 稿；Codex 第五轮 T1–T15 规定修法已落实，第六轮复核见 `docs/audits/2026-11-04-data-foundation-3/07-codex-round6.md`；owner 决策 A–I 取 §13 记录的默认值）：F1b 标识符补全（GLEIF / OpenFIGI / HKEX、声明审核、A+H 配对、有证据的持有区间与换码、`resolveIssuer(asOf)`）、合并后读时谱系与拓扑函数、SEC 受理时刻、被隔离候选的人工选定、F5 跨来源对账运行器（美股 iXBRL、A 股黄金集、谱系同日）、财报日历新鲜度、`/admin/dq` 扩展。

**Architecture:** 两个迁移（`20261107090000` 标识符与 DQ 表/函数，`20261107091000` 事实层扩展），全部业务写入经 `security definer` 函数（声明接受、拓扑、采用候选、恢复、谱系裁决、对账逐键原子提交、日历遍）；计划二的 `FactsDb` 三实现扩展新方法；对账运行器 `run.ts` 只依赖注入的 `FactsDb`、`TableClient`、`RawStore` 与对账对登记；解析器（OpenFIGI、HKEX、GLEIF、SEC submissions、iXBRL）、规划、日历规则、十进制比较全是纯函数，单测用录制/裁剪夹具，集成测试在真实 PostgreSQL 上跑。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`tsx` 脚本、`xlsx`（已在依赖里）。计划一的 `TableClient`、`startBatch/finishBatch`、`quarantine()`、`recordAttempt`，计划二的 `FactsDb`、`materialize`、`json-numbers.ts`、`units.ts`、`concepts.ts` 继续使用。

本计划是数据底座三份中的第三份。实施按 owner 规则：Opus 5.5 指挥与复审，Sonnet 5.5 子代理逐任务写代码，每个任务经 Claude 规格复审、质量复审与 Codex（gpt-6-astra，medium）审计与挑战；实施日志 `docs/audits/2026-11-05-data-foundation-3/implementation-log.md`。

---

## 仓库约定（动手前必读）

- 工作树：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61`（分支 `claude/data-foundation-3-18bc61`，从含计划一、二的 `main` 切出）。不要 `cd` 出去；不要裸 `git stash`；只动本任务 Files 列表里的文件。
- 迁移：`supabase/migrations/20261107090000_identifiers_and_dq.sql`（Task 1）与 `20261107091000_facts_extensions.sql`（Task 8）。可重放：`create table if not exists`、`create or replace function`、`drop policy if exists`→`create policy`、`drop trigger if exists`→`create trigger`、`insert … on conflict`；**改既有表的列与回填**一律包在 `do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=… and column_name=…) then alter table … add column …; update …; end if; end $$`（规格 §3：回填只在加列那次执行）；约束用 `drop constraint if exists` 后 `add constraint`（只对新加的、旧行必然满足的约束）。每个迁移落地后追加 `supabase/migrations.lock.json` `{file, sha256}`（文件字节 hex）；**已锁文件不可再改**（`20261106090000` 及更早都已锁）。`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移晚于已锁最新。
- `test:db`（`scripts/ci/research-db.ts`）启动本地 PostgreSQL 17、按序执行全部迁移、跑 vitest。集成测试读 `process.env.S4_TEST_STATE` 的 `adminUrl`，`describe.skipIf(!enabled)`。**任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 都必须加进 `scripts/ci/research-checks.ts::criticalSuites`**（否则 "Database suite inventory drift"）。重放迁移用计划一/二测试里的 `replayMigration` 助手（`lock_timeout='3s'`，55P03/40P01 重试；它未导出——复制到新测试文件）。
- 单文件跑数据库测试：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts <file>`（脚本未提交，内容见交接文档 §5；丢了就重建）。全量：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`（10 分钟以上）。**`LC_ALL=C` 只给 `test:db`/`test:migrations`，不要导出给 `npm test`。**
- 本地 harness 只建 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)`；迁移对桶只能 `insert into storage.buckets … on conflict (id) do update`，不引用 `storage.objects`。本地 PostgREST `max_rows=1000`：返回多行的函数一律返回单个 `jsonb` 信封。
- 托管 `postgres` 角色非超级用户：`security definer` 函数内 `set search_path = public`，不 `alter function … owner to`。Supabase 默认给 `anon/authenticated` 新函数 EXECUTE：**每个函数后面 `revoke execute on function … from public, anon, authenticated` 再按需 `grant`**。新表 `enable row level security`，`revoke all … from public, anon, authenticated`，`grant … to service_role`。
- 计划二锁协议（规格二 §4.5，落地于 `20261106090000`）：事实层每个可见性写入都在函数里先 `perform 1 from fact_sync_scope where issuer_id=… and market=… for update`（多个 scope 行按 `(issuer_id, market)` 排序加锁），完成后 `state_rev = state_rev + 1`。内部助手 `fact_promote_rows(p_issuer,p_market,p_fact_ids)`、`fact_item_members(jsonb)` 可在新函数里复用（不授予客户端）。
- 管理员门禁 `requireAdminUser()`（`src/lib/admin/auth.ts`）；服务端写库 `getAdminSupabase()`；公共读 `getAnonSupabase()`；表访问统一经 `TableClient`（`src/lib/db/table-client.ts`），批次 `startBatch/finishBatch`、隔离 `quarantine()`、新鲜度 `recordAttempt`（`src/lib/dq/*`）。
- `src/lib/supabase/database.types.ts` 手工维护：新表加 `Row/Insert/Update` 并登记 `Database['public']['Tables']`；新列补进既有接口；RPC 不登记 `Functions`（按 `src/lib/supabase/admin.ts` 注释的窄类型或 `as never` 调用）。
- 计划二的 `FactsDb`（`src/lib/facts/types.ts`）有三实现：`supabaseFactsDb`（`db.ts`，rpc）、`memoryFactsDb`（`memory-facts-db.ts`）、`pgFactsDb`（`pg-facts-db.ts`，测试）；契约用例 `db-contract.ts::factsDbContract` 两实现共用。本计划新增方法**三实现都要**，契约用例同步扩展。
- 数值：一律十进制字符串，不转 `Number`（计划二 `json-numbers.ts::canonicalDecimal/decimalEquals`；本计划 `src/lib/dq/reconcile/decimal.ts` 做缩放 BigInt 的比较与区间）。
- 外部 HTTP：抓取函数接受注入的 `fetch`，单测用录制或裁剪夹具，**单测与集成测试不触网**。原始响应入桶 `reconcile-raw`（内容寻址 `<kind>/<sha256>`，`upsert:false`，409 视为已存在）并记 sha256。
- 环境变量：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`CRON_SECRET`、`EDGAR_USER_AGENT`（缺省 `DEFAULT_USER_AGENT`，`src/lib/research/ingest/collectors/shared.ts`）、`OPENFIGI_API_KEY`（可选，**本机没有**）、`TUSHARE_TOKEN`（**本机没有**）、`VERCEL_GIT_COMMIT_SHA`。
- **本机降级路径**（owner 秘密缺失）：无 `OPENFIGI_API_KEY` → 按无 key 限额（25 请求/分钟、10 job/请求）实现与测试，实测核对（规格 §4.1.2"AAPL/茅台/腾讯"）用无 key 请求完成；若网络不可达则记"未核对"，`fill-identifiers --apply` 在 runbook 标"核对前不得 apply"。无 `TUSHARE_TOKEN` → `disclosure_date` 只有合成夹具与单测、CN 日历行 `upstream_lookup='unavailable'` 路径必测；`gold-cn.integration.test.ts` **不创建**（与计划二 `sync-cn` 同理），黄金集只交付模式、校验器、脚本与抄录指引；CN 对账 cron 不加入 `vercel.json`。
- 提交：`git commit` 单独一条命令，同一命令不得出现任何 `-n` 记号（含 `grep -n`、`head -n`；仓库钩子会拦）；不得 `--no-verify`；信息末尾 `Co-Authored-By: <实施模型> <noreply@anthropic.com>`。
- 测试命令：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）。
- 代码风格：沿用 `src/lib/dq`、`src/lib/entities`、`src/lib/facts` 的紧凑风格（单空格缩进、少空行）；每个新文件顶部一段注释写职责与规格条目号。
- i18n：`messages/{zh,en}/admin.json` 的 `dq` 下新增键，`messages/parity.test.ts` 比较键集。
- UI：`/admin/dq` 的新面板按 owner 规则先有 Claude Design 画布（链接写在 Task 的 brief 里），组件与 tokens 复用现有，无新颜色。

## 文件结构

```
supabase/migrations/20261107090000_identifiers_and_dq.sql   issuer_securities 方法列、claims 扩展、dq_reconciliations 扩展、对账周期/游标、日历遍、日历/档案/类别表、weekly、resolve_identifier_claim、replace_filing_expectations 与遍函数、拓扑守卫触发器、reconcile-raw 桶（Task 1）
supabase/migrations/20261107091000_facts_extensions.sql     filings 受理列、financial_metrics.based_on_lineage、fact_promote_rows 谓词、read_filing_facts、read_facts_lineage（read_facts 改为包装）、replace_financial_metrics_lineage（旧函数改包装）、set_filing_acceptance、adopt_candidate、restore_reconciled、resolve_lineage_conflict、apply_reconcile_result、游标三函数、set_merge、set_dissolved（Task 8）
supabase/migrations.lock.json                               追加 2 条（Task 1、8）
src/lib/supabase/database.types.ts                          新表 Row/Insert/Update + 既有表新列（Task 1、8）
src/lib/entities/identifiers.integration.test.ts            迁移一：升级两次、约束、声明函数、拓扑守卫、日历遍函数、RLS/桶（critical；Task 1）
src/lib/dq/dq-extensions.integration.test.ts                迁移二：全部函数与回归（critical；Task 8）
scripts/ci/research-checks.ts                               criticalSuites += 各集成测试（Task 1、7、8、15、18）

src/lib/dq/datasets.ts               DATASETS / DQ_DATASET_INVENTORY（Task 2）
src/lib/dq/freshness.ts              Cadence += 'weekly'（Task 2）
src/lib/dq/dashboard.ts              datasets 下拉 = INVENTORY ∪ 已加载（Task 2）；calendar/claims/reconciliationsByPair/market（Task 19）
src/lib/dq/raw-store.ts              RawStore / supabaseRawStore / memoryRawStore / RECONCILE_RAW_BUCKET（Task 2）
src/lib/entities/types.ts            ValidFromMethod / ValidToMethod / ClaimIdType += ticker / ClaimOp / EvidenceKind / ClaimTarget / ClaimDetail（Task 2）
src/lib/entities/provenance.ts       sanitizeProvenance / PROVENANCE_KEYS / ProvenanceError（Task 2）
src/lib/entities/securities.ts       attachSecurity 写方法列 + 经 sanitizeProvenance（Task 2）
src/lib/entities/claims.ts           fileClaim(claim/1) / validateClaimDetail / claimTargetKey（Task 2；调用方同步）
src/lib/entities/identifiers/gleif.ts        parseGleifCsv / subsetForLeis（Task 3）
src/lib/entities/identifiers/openfigi.ts     mapIsins / mapTickers / groupFigiResults / EXCH_MAP / EXCH_MAP_VERSION / exchCodeFor（Task 3）
src/lib/entities/identifiers/hkex-list.ts    parseHkexList / HKEX_LIST_FILES（Task 3）
src/lib/entities/identifiers/plan.ts         planIdentifierWrites（纯；Task 4）
src/lib/entities/identifiers/apply.ts        applyIdentifierPlan（Task 4）
scripts/entity-keys/fill-identifiers.ts      阶段 A–D 驱动（Task 4）
scripts/entity-keys/coverage.ts              E1/E2 度量（Task 4 建 E1 段；Task 5 加 windows 段）
scripts/entity-keys/fill-cninfo-org-id.ts    改写为读 issuers、守卫更新、claim（Task 4）
src/lib/entities/windows.ts                  planWindowBackfill / applyWindowBackfill（Task 5）
scripts/entity-keys/backfill-windows.ts      （Task 5）
src/lib/entities/resolve.ts                  ResolveOptions.asOf / 方法字段（Task 5）
src/app/api/entities/resolve/route.ts        asOf 参数与缓存（Task 5；若路由不存在则新建）
src/lib/entities/identifiers/sec-submissions.ts  fetchSubmissions / parseSubmissions / submissionsEvidenceClaims（Task 6）
src/lib/entities/load-sec.ts                 换码检测、--fetched-at、stale/incomplete（Task 6）
scripts/entity-keys/load-sec-issuers.ts      （Task 6）
src/lib/entities/identifiers/names.ts        normalizeCompanyName（Task 7）
src/lib/entities/link-ah.ts + scripts/entity-keys/link-ah.ts   A+H 配对（Task 7）
src/lib/entities/ah-link.integration.test.ts                   （critical；Task 7）
src/app/api/admin/dq/claims/[id]/route.ts                      声明审核（Task 7）

src/lib/facts/types.ts               LineageRev / ReadFactsLineageResult / FilingFactRow / CalendarFiling / MetricRow.based_on_lineage / FactsDb 新方法 / 错误码（Task 9；共享契约原样）
src/lib/facts/db.ts、memory-facts-db.ts、pg-facts-db.ts、db-contract.ts   三实现与契约（Task 9）
src/lib/facts/derive.ts              materialize 谱系契约（Task 10）
src/lib/facts/public-route.ts、src/app/api/facts/[ticker]/route.ts、metrics/route.ts、src/app/api/filings/[ticker]/route.ts   tickerAsOf、lineage、conflicts、recordedIssuerId、acceptedAt、metrics 向量守卫（Task 10）
src/lib/dq/facts-resolver.ts、src/app/api/admin/dq/quarantine/[id]/route.ts   分派扩展（Task 11）
scripts/facts/materialize.ts         --pending-hooks（Task 11）
src/lib/facts/providers/sec-acceptance.ts + scripts/facts/enrich-acceptance.ts   受理时刻（Task 12）
src/lib/facts/sync.ts                第 9b 步 enrichAcceptance 钩子（Task 12）

src/lib/dq/reconcile/types.ts        对账共享类型（共享契约原样；Task 13）
src/lib/dq/reconcile/decimal.ts      精确十进制（Task 13）
src/lib/dq/reconcile/inputs-hash.ts  computeInputsHash（Task 13）
src/lib/dq/reconcile/ixbrl.ts        parseInlineXbrl / IXBRL_PARSER_VERSION（Task 13）
src/lib/dq/reconcile/record.ts       recordReconciliation（周期外 record 动作；Task 13）
src/lib/dq/reconcile/pairs.ts        RECONCILE_PAIRS 登记（Task 14 建骨架与 lineage/gold-US 对；Task 15 美股 iXBRL；Task 16 A 股）
src/lib/dq/reconcile/run.ts          runReconcile（周期/游标/围栏；Task 14）
src/app/api/cron/reconcile/route.ts + scripts/dq/reconcile.ts   （Task 14）
scripts/dq/select-us-sample.ts + src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json + 夹具   （Task 15）
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts、src/lib/dq/reconcile/lineage.integration.test.ts   （critical；Task 15）
src/lib/dq/reconcile/gold-cn.ts + scripts/dq/{select-cn-sample,gold-pdf}.ts + docs/runbooks 抄录指引   （Task 16）

src/lib/dq/calendar.ts               规则纯函数（Task 17）
src/lib/dq/filer-categories.ts + scripts/dq/filer-categories.ts   （Task 17）
src/lib/dq/calendar-sync.ts + src/app/api/cron/filing-calendar/route.ts + scripts/dq/calendar-sync.ts   （Task 18）
src/lib/dq/calendar.integration.test.ts   （critical；Task 18）
vercel.json                          + reconcile?pair=us.companyfacts_vs_ixbrl、reconcile?pair=facts.lineage_same_day、filing-calendar?market=US/CN（Task 14、18；CN 对账不加）
src/app/api/admin/dq/route.ts、src/app/(app)/admin/dq/AdminDqClient.tsx、messages/{zh,en}/admin.json   看板扩展（Task 19）
docs/runbooks/data-foundation.md     第 9 章（Task 20）
docs/superpowers/specs/…-3-…-design.md §15、…-data-foundation-design.md §3.2 撤回标注、…-2-…-design.md §15 指向（Task 20）
docs/audits/2026-11-05-data-foundation-3/implementation-log.md   实施日志（每任务追加）
```

（路径以任务 Files 列表为准；上表是索引。fixtures 统一放 `src/lib/dq/fixtures/` 与 `src/lib/entities/fixtures/`。）

---

## 共享契约（所有任务必须用这些名字；新增类型原样落地）

### C1 · `src/lib/dq/datasets.ts`（Task 2）

```ts
// src/lib/dq/datasets.ts
// Typed dataset registry (spec §6.3). Producers take dataset strings ONLY from DATASETS.
import type {Market} from '../facts/types';
import type {Cadence} from './freshness';
import {RECONCILE_PAIR_IDS,type ReconcilePairId} from './reconcile/types';
export const DATASETS={
 entities:{sec:'entities.sec',researchLink:'entities.research-link',identifiers:'entities.identifiers',cninfo:'entities.cninfo',ahLink:'entities.ah-link',windows:'entities.windows',submissions:'entities.sec-submissions'},
 facts:(m:Market)=>(m==='US'?'facts.us':'facts.cn') as 'facts.us'|'facts.cn',   // landed sync.ts identifiers (spec T4)
 acceptance:'facts.acceptance',
 filerCategories:'dq.filer-categories',
 reconcile:(p:ReconcilePairId)=>`reconcile.${p}` as const,
 calendar:(m:Market)=>(m==='US'?'dq.calendar.us':'dq.calendar.cn') as 'dq.calendar.us'|'dq.calendar.cn',
} as const;
export interface DatasetEntry{dataset:string;producer:string;cadence:Cadence}
export const DQ_DATASET_INVENTORY:readonly DatasetEntry[]=[/* Task 2 展开：entities.* 六项 + submissions、facts.us/cn、acceptance、filerCategories、每个 RECONCILE_PAIR_IDS、两个 calendar */];
```

`src/lib/dq/reconcile/types.ts` 的 `RECONCILE_PAIR_IDS` 在 Task 2 以**仅含该常量与类型**的最小文件创建（C3 其余部分由 Task 13 补全，Task 13 不得改动这两个导出）。

### C2 · 实体（Task 2 落地于 `src/lib/entities/types.ts`）

```ts
export type ValidFromMethod='first_observed'|'listing_date'|'ticker_change'|'curated';
export type ValidToMethod='delisting'|'ticker_change'|'sec_file_absent'|'curated'|'merge_close'|'unrecorded';
export type ClaimIdType=HardIdType|'isin'|'figi'|'cninfo_org_id'|'ticker';
export type ClaimOp='legacy'|'evidence_only'|'set_identifier'|'correct_identifier'|'attach_security'|'close_security'|'backdate_window';
export type EvidenceKind='hard_identifier'|'official_list'|'name_match'|'filing_form'|'provider_mapping';
export interface ClaimTarget{issuer_id:string;ticker?:string;valid_from?:string}
export interface ClaimEvidence{source:string;as_of:string;evidence_sha256:string;locator?:string;note?:string}
export interface ClaimDetail{schema:'claim/1';evidence_kind:EvidenceKind;target:ClaimTarget;params:Record<string,unknown>;evidence:ClaimEvidence;sources:ClaimEvidence[];provenance_written?:Record<string,unknown>}
// IssuerSecurityInput 增加：valid_from_method?:ValidFromMethod（缺省：source==='curated' ? 'curated' : 'first_observed'）；valid_to_method?:ValidToMethod|null（valid_to 非空时必填）
```

`src/lib/entities/claims.ts`：`ClaimInput{issuer_id;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}`；`fileClaim(client,c):Promise<boolean>`（同 `(issuer_id,id_type,value,op,target_key)` pending 已存在 → 守卫更新追加 `detail.sources[]`，返回 false）；`validateClaimDetail(op,idType,detail):{ok:true}|{ok:false;error:string}`；`claimTargetKey(op,target):string`（= `op + ':' + (issuer_id | issuer_id|ticker|valid_from)`）。`src/lib/entities/provenance.ts`：`PROVENANCE_KEYS=['isin','figi','valid_from','valid_to','pending_change'] as const`、`sanitizeProvenance(p):Record<string,unknown>`（未知键、含 URL token/私密键/用户 UUID 的值 → `throw new ProvenanceError(code)`）。

### C3 · 对账（Task 13 落地于 `src/lib/dq/reconcile/types.ts`；Task 2 先建前两行）

```ts
export const RECONCILE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','sec.filing_date_vs_submissions','sec.filer_category','entities.isin_hkex_vs_gleif','facts.lineage_same_day'] as const;
export type ReconcilePairId=typeof RECONCILE_PAIR_IDS[number];
/** Pairs run by the cycle runner; the other three are recorded inline by their producers (record.ts, cycle_id null). */
export const CYCLE_PAIR_IDS=['us.companyfacts_vs_ixbrl','cn.tushare_vs_cninfo_pdf_gold','us.companyfacts_vs_gold','facts.lineage_same_day'] as const satisfies readonly ReconcilePairId[];
export type CyclePairId=typeof CYCLE_PAIR_IDS[number];
export type ReconcileKind='numeric'|'text'|'date';
export type ReconcileOutcome='compared'|'left_missing'|'left_unlinked'|'left_ambiguous'|'right_missing'|'unsupported'|'right_ambiguous'|'incomplete_gold';
export type ReconcileAction='record'|'quarantine_left'|'review_item'|'lineage_item';
export interface Fence{pair:CyclePairId;cycle_id:string;issuer_id:string;market:Market;batch_id:string;attempt:number}
export interface ExpectedKey{naturalKey:string;locator:Record<string,unknown>}
export interface MemberPlan{issuerId:string;market:Market;expectedKeys:ExpectedKey[]}
/** One per expected key; values are canonical decimal strings (never Number). */
export interface ReconcileResultInput{
 natural_key:string;kind:ReconcileKind;outcome:ReconcileOutcome;passed:boolean;
 left_value:string|null;right_value:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 left_source:string;right_source:string;detail:Record<string,unknown>;
 action:ReconcileAction;left_fact_id?:string;inputs_hash?:string;
 item?:{natural_key:string;payload:Record<string,unknown>;detail?:Record<string,unknown>};   // for review_item / lineage_item / quarantine_left
}
export interface ApplyReconcileOutcome{reused:boolean;reconciliationId:string;itemId:string|null;quarantined:0|1;materialize:{issuerId:string;market:Market}|null}
export interface MemberCounts{compared_passed:number;compared_failed:number;not_compared:number}
export interface PairContext{db:FactsDb;tables:TableClient;raw:RawStore;now:()=>Date;budget:Budget;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>}
export interface ReconcilePair{
 id:CyclePairId;kind:ReconcileKind;left:string;right:string;
 /** frozen at cycle creation (pending_members merged by the runner) */
 members(ctx:PairContext):Promise<MemberPlan[]>;
 /** exactly one result per member.expectedKeys entry, same order; never throws for data problems (outcome encodes them) */
 evaluate(ctx:PairContext,member:MemberPlan):Promise<ReconcileResultInput[]>;
}
```

`decimal.ts`：`parseDecimal(s:string):{units:bigint;scale:number}`、`compareDecimal(a,b):-1|0|1`、`subDecimal(a,b):string`、`absDecimal(a)`、`relDiff(l,r,scale=10):string`（`|l−r| / max(|l|,|r|,1)`，四舍五入远离零）、`withinRadius(value,center,radius):boolean`（交叉相乘，不除）。`inputs-hash.ts`：`computeInputsHash({left_raw_hash,right_sha256,gold_or_sample_sha256,parser_version}):string`（sha256 hex，字段按此顺序以 `\n` 拼接）。`ixbrl.ts`：`IXBRL_PARSER_VERSION='ixbrl/1'`、`parseInlineXbrl(doc:string):IxbrlDocument`、`IxbrlDocument={facts:IxFact[];nonNumeric:Record<string,string>;unsupported:{reason:string;name?:string}[]}`、`IxFact={name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number}`。`record.ts`：`recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null}):Promise<string>`（只允许 `action:'record'`，`cycle_id` 为空）。

### C4 · 事实层扩展（Task 9 落地于 `src/lib/facts/types.ts`）

```ts
export interface LineageRev{issuer_id:string;state_rev:number}
// MetricRow 增加：based_on_lineage:LineageRev[]
export interface LineageConflict{key:Record<string,string|null>;available_date:string;fact_ids:string[]}
export interface ReadFactsLineageResult{stateRevs:LineageRev[];lineage:string[];rows:FactRow[];conflicts:LineageConflict[];truncated:boolean}
export type FilingFactRow=FactRow&{run_status:RunStatus};
export type CalendarFiling=FilingRow&{run_status:RunStatus;accepted_at:string|null};
// FilingRow 增加：accepted_at:string|null;acceptance_source:'sec_submissions'|null
// FactsDbErrorCode 增加：
//  'fence_failed'|'member_incomplete'|'stale_evaluation'|'batch_mismatch'|'invalid_choice'|'invalid_candidate'|'generation_moved'
//  |'duplicate'|'conflict_exists'|'replay_required'|'filing_not_found'|'not_passing'|'lineage_changed'|'scope_missing'|'unresolved'
//  |'acceptance_conflict'|'source_not_active'|'has_referrers'|'topology_write_forbidden'
// FactsDb 增加（三实现都要；memoryFactsDb 增加 setTopology(map) 测试助手）：
 lineageOf(target:string):Promise<string[]>;                                  // [target, ...merged_into=target 升序]
 stateRevs(issuers:string[],market:Market):Promise<LineageRev[]>;
 readFactsLineage(issuers:string[],market:Market,opts:ReadFactsOptions):Promise<ReadFactsLineageResult>;
 readFilingFacts(filingId:string,includeNonOk:boolean):Promise<FilingFactRow[]>;
 replaceMetricsLineage(issuer:string,market:Market,basedOn:LineageRev[],rows:MetricRow[]):Promise<number>;
 findFilingBySourceRef(source:Source,sourceRef:string):Promise<FilingRow|null>;
 filingsForCalendar(issuer:string,market:Market,opts:{fromPeriodEnd:string}):Promise<CalendarFiling[]>;
 setFilingAcceptance(filingId:string,acceptedAt:string,source:'sec_submissions'):Promise<boolean>;
 adoptCandidate(itemId:string,index:number,batchId:string,expectedRev:number,resolvedBy:string):Promise<{factId:string;runId:string;issuerId:string;market:Market}>;
 restoreReconciled(itemId:string,batchId:string,inputsHashNow:string,resolvedBy:string):Promise<{promoted:number;skipped:{fact_id:string;reason:string}[]}>;
 resolveLineageConflict(itemId:string,keepFactId:string,batchId:string,resolvedBy:string):Promise<{quarantined:number}>;
 claimReconcileMember(pair:CyclePairId,cycleId:string,issuer:string,market:Market,batchId:string):Promise<Fence|null>;
 applyReconcileResult(fence:Fence,result:ReconcileResultInput):Promise<ApplyReconcileOutcome>;
 completeReconcileMember(fence:Fence):Promise<MemberCounts>;
 failReconcileMember(fence:Fence,error:string):Promise<void>;
 setMerge(source:string,target:string,resolvedBy:string):Promise<{repointed:number}>;
 setDissolved(issuer:string,resolvedBy:string):Promise<void>;
```

（`types.ts` 从 `../dq/reconcile/types` 只 `import type`，避免运行时循环。）

### C5 · SQL 函数签名与错误码（迁移与 TS 适配器之间的契约）

所有函数 `security definer set search_path = public`，除注明外仅 `service_role` 可执行；错误以消息 = 码抛出（`raise exception '<code>' using errcode = …`），适配器按消息映射到 `FactsDbError`/HTTP。

| 函数（迁移） | 签名 | 码 |
|---|---|---|
| `resolve_identifier_claim`（1） | `(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb` → `{op, applied, amended}` | `already_resolved` `legacy_claim` `amend_required` `invalid_claim` `value_conflict` `ownership_conflict` `already_closed` `issuer_not_active` |
| `replace_filing_expectations`（1） | `(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb) returns int`（唯一签名） | `fence_failed` `member_not_claimable` `invalid_rows` |
| `claim_calendar_pass`（1） | `(p_market text, p_batch uuid) returns jsonb` → `{market, pass_id, batch_id}` 或 null | — |
| `fail_calendar_member`（1） | `(p_pass_token jsonb, p_issuer uuid, p_error text) returns void` | `fence_failed` |
| `finish_calendar_pass`（1） | `(p_pass_token jsonb) returns text`（终态） | `fence_failed` `pass_incomplete` |
| 触发器 `issuers_topology_guard`（1） | `before update of status, merged_into on issuers` | `topology_write_forbidden`（23514） |
| `set_filing_acceptance`（2） | `(p_filing uuid, p_accepted timestamptz, p_source text) returns boolean` | `acceptance_conflict` |
| `read_filing_facts`（2） | `(p_filing uuid, p_include_non_ok boolean) returns jsonb` → `{rows:[…+run_status]}` | — |
| `read_facts_lineage`（2，invoker，anon/authenticated/service_role） | `(p_issuers uuid[], p_market text, p_concepts text[], p_as_of date, p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false) returns jsonb` | — |
| `read_facts`（2 改为包装，签名与信封不变） | 落地九参数 | — |
| `replace_financial_metrics_lineage`（2） | `(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb) returns int` | `stale_computation` `scope_missing` |
| `replace_financial_metrics`（2 改为包装） | `(uuid, text, bigint, jsonb)` 不变 | 同上 |
| `adopt_candidate`（2） | `(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid) returns jsonb` → `{fact_id, run_id, issuer_id, market}` | `invalid_choice` `invalid_candidate` `filing_not_found` `generation_moved` `replay_required` `batch_mismatch` `stale_evaluation` `duplicate` `conflict_exists` `item_not_open` |
| `restore_reconciled`（2） | `(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid) returns jsonb` → `{promoted, skipped}` | `not_passing` `item_not_open` |
| `resolve_lineage_conflict`（2） | `(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid) returns jsonb` → `{quarantined}` | `lineage_changed` `scope_missing` `unresolved` `invalid_choice` `item_not_open` |
| `claim_reconcile_member`（2） | `(p_pair text, p_cycle_id text, p_issuer uuid, p_market text, p_batch uuid) returns jsonb` → fence 或 null | — |
| `apply_reconcile_result`（2） | `(p_fence jsonb, p_result jsonb) returns jsonb` → `{reused, reconciliation_id, item_id, quarantined, materialize}` | `fence_failed` `invalid_result` |
| `complete_reconcile_member`（2） | `(p_fence jsonb) returns jsonb` → 三计数 | `fence_failed` `member_incomplete` |
| `fail_reconcile_member`（2） | `(p_fence jsonb, p_error text) returns void` | `fence_failed` |
| `set_merge`（2） | `(p_source uuid, p_target uuid, p_resolved_by uuid) returns jsonb` → `{repointed}` | `source_not_active` + 计划一触发器原样错误 |
| `set_dissolved`（2） | `(p_issuer uuid, p_resolved_by uuid) returns void` | `has_referrers` `source_not_active` |
| `fact_promote_rows`（2 `create or replace`，保留全部落地谓词与 revoke） | `(uuid, text, uuid[])` 不变 | — |

周期表的建立与结算（`dq_reconcile_cycles` 插入、`pending_members` 合并、结算汇总）由 `run.ts` 经 `TableClient` 完成（只读 + 周期行写入，无业务效果）；结算前断言每个 `done` 游标满足 `drc_done_accounted`（不 coalesce）。

### C6 · 原始证据桶（Task 2 落地于 `src/lib/dq/raw-store.ts`）

```ts
export const RECONCILE_RAW_BUCKET='reconcile-raw';
export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf';
export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:'application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/zip';meta?:Record<string,string|number>}
export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
export interface RawStore{put(item:RawPut,budget?:Budget):Promise<RawStored>;sha256Of(path:string):string}
export const rawPath=(kind:RawKind,sha256:string,ext:string)=>`${kind}/${sha256}.${ext}`;
export function supabaseRawStore(admin:SupabaseClient):RawStore;   // upsert:false，409 → 'exists'，失败 → throw RawStoreError('raw_upload_failed')
export function memoryRawStore():RawStore&{objects:Map<string,Uint8Array>};
```

### C7 · 日历（Task 17 落地于 `src/lib/dq/calendar.ts`）

```ts
export const CALENDAR_RULES_VERSION='filing-calendar/1';
export type ReportKind='10-K'|'10-Q'|'20-F'|'40-F'|'annual'|'semiannual'|'q1'|'q3';
export type DeadlineState='statutory'|'estimated'|'no_rule';
export type DisclosureState='pending'|'overdue'|'filed_not_ingested'|'received'|'received_late'|'unknown_upstream';
export type Acceleration='large_accelerated'|'accelerated'|'non_accelerated';
export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
export interface FilerCategoryRow{issuer_id:string;fiscal_year:number;acceleration:Acceleration;smaller_reporting:boolean|null;category_raw:string;source:'ixbrl_dei';accession:string;evidence_sha256:string;as_of:string}
export interface UsUpstreamEntry{form:string;reportDate:string|null;filingDate:string;accessionNumber:string}
export interface CnScheduleRow{end_date:string;ann_date:string|null;pre_date:string|null;actual_date:string|null;modify_date:string|null}
export interface CalendarUpstream{lookup:'ok'|'unavailable'|'not_applicable';us?:UsUpstreamEntry[];cn?:CnScheduleRow[];sha256?:string}
export interface ExpectationRow{issuer_id:string;market:Market;report_kind:ReportKind;period_end:string;period_end_estimated:boolean;deadline_state:DeadlineState;due_date:string|null;due_rule:string;expected_date:string|null;upstream_lookup:'ok'|'unavailable'|'not_applicable';upstream_filed_date:string|null;disclosure_state:DisclosureState;received_filing_id:string|null;received_date:string|null;profile_as_of:string|null;detail:Record<string,unknown>}
export function computeExpectations(input:{profile:FilingProfile;categories:FilerCategoryRow[];filings:CalendarFiling[];upstream:CalendarUpstream;today:string}):ExpectationRow[];
export function addSecBusinessDays…/rollForward(date:string):string;   // Rule 0-3 顺延；SEC_HOLIDAYS 常量
```

### 各部分新增导出（骨架未列者由各 Part 在其开头"本部分新增导出"中列明；后续 Part 只能 import 已列名字）

---

## 规格覆盖表

| 规格条目 | 任务 |
|---|---|
| §1.1 成功标准 E1–E9 | E1 Task 4；E2 Task 5；E3 Task 6；E4 Task 15；E5 Task 16（降级记录）；E6 Task 18；E7 Task 12；E8 Task 11；E9 Task 2/19 |
| §3.1 迁移一全部表、约束、函数、触发器、桶 | Task 1 |
| §3.2 迁移二全部函数与扩展 | Task 8 |
| §3.2 `FactsDb` 扩展 | Task 9 |
| §4.1 ISIN/FIGI 四阶段、`fill-cninfo-org-id` | Task 3、4 |
| §4.2 claim/1、A+H | Task 2（claims）、Task 7 |
| §4.3 持有区间、submissions、换码、`asOf` | Task 5、6 |
| §4.4 谱系读取、物化目标、读接口 | Task 10（`lineage_conflict` 产生在 Task 14/15） |
| §4.5 受理时刻 | Task 12 |
| §4.6 候选选定与分派 | Task 11 |
| §5.1–§5.6 对账 | Task 13（解析与十进制）、14（运行器、lineage 与 US gold 对）、15（美股 iXBRL、样本、集成）、16（A 股） |
| §6.1–§6.3 日历与数据集 | Task 2（datasets）、17、18 |
| §7 读取与管理接口 | Task 5（resolve）、7（claims 路由）、10（facts 路由）、11（quarantine 路由）、14/18（cron）、19（admin dq） |
| §7.2 页面与 i18n | Task 19（Claude Design 画布先行） |
| §8 错误处理 | 各任务按其涉及行 |
| §9.1 单元 / §9.2 数据库 / §9.3 离线集成 / §9.4 清单 | 各任务；§9.2 = Task 1、8；§9.3 = Task 7、15、18（`gold-cn` 按降级不创建） |
| §10 工作包 | F3-0 = Task 1–2；F3-1 = 3–4；F3-2 = 5–6；F3-3 = 7；F3-4 = 8–12；F3-5 = 13–15；F3-6 = 16；F3-7 = 17–18；F3-8 = 19–20 |
| §11 独立验证 | Task 20（记录哪些已做、哪些待 owner） |
| §13 owner 事项、§14 开放问题 | Task 3（OpenFIGI/HKEX 核对记录）、6（submissions 分页）、16（Tushare）、20（runbook 9.x 汇总） |
| §15 实施记录与偏差 | Task 20 |

## 执行顺序

| 序 | 任务 | 依赖（必须已合入） |
|---|---|---|
| 1 | Task 1 → 2 | — |
| 2 | Task 3 → 4 → 5 → 6 → 7 | Task 2 |
| 3 | Task 8 → 9 → 10 → 11 → 12 | Task 1、2、6（Task 12 用 `sec-submissions.ts`） |
| 4 | Task 13 → 14 → 15 → 16 | Task 9、10 |
| 5 | Task 17 → 18 → 19 → 20 | Task 13（filer-categories 用 iXBRL 解析器）、Task 6、Task 9 |

任何任务都不得修改比它晚执行的任务创建的文件。Part 划分：Part A = Task 1–2；Part B = Task 3–7；Part C = Task 8–12；Part D = Task 13–16；Part E = Task 17–20。

---
