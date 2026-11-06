# 数据底座运行手册（DQ 基础 + 发行人主数据 + 披露事实库）

适用迁移：`supabase/migrations/20261105090000_dq_foundation.sql`、`supabase/migrations/20261105091000_issuers.sql`、`supabase/migrations/20261106090000_financial_facts.sql`。
类型定义：`src/lib/supabase/database.types.ts`（手工维护，与上述迁移逐列对应）。`npm run supabase:types` 只是占位：它打印提示并以退出码 1 结束，**不会**生成类型；改迁移时请同步手改该文件。

## 1. 表与访问权限

| 表 | 读 | 写 | 说明 |
|---|---|---|---|
| `ingest_batches` | 仅 service_role | 仅 service_role | 每次导入的回执：`status` ∈ running/success/partial/failed/rejected，`counts`、`errors`、`tool_versions` |
| `dq_quarantine` | 仅 service_role | 仅 service_role | 隔离记录；同一 (dataset, table_name, natural_key, reason_code) 至多一条 `open`；`batch_id` 为 `on delete restrict`，证据不随回执删除 |
| `dq_reconciliations` | 仅 service_role | 仅 service_role | 双源对账结果；`tolerance` 为相对容差 |
| `dq_freshness` | 仅 service_role | 仅 service_role | 每个 dataset 一行：cadence、`last_ok_at`、`consecutive_errors`、写入时的 `status` |
| `issuers` | anon / authenticated 只读 | 仅 service_role | 全局发行人；退役用 `status='merged'/'dissolved'`，不删除 |
| `issuer_securities` | anon / authenticated 只读 | 仅 service_role | 证券归属区间 `[valid_from, valid_to)`；同一 ticker 区间不得重叠（`issuer_securities_no_overlap`），同一 ISIN 在任何发行人、任何 ticker 之间区间也不得重叠（`issuer_securities_isin_no_overlap`），因此一个 ISIN 在任一日期只解析到一行；仅 active 发行人可持有未关闭行 |
| `industry_classifications` | anon / authenticated 只读 | 仅 service_role | 行业分类树（sw2021/sw2014/gics/csrc/custom） |
| `issuer_industry_memberships` | anon / authenticated 只读 | 仅 service_role | 发行人行业归属区间，不得重叠 |
| `issuer_identifier_claims` | 仅 service_role | 仅 service_role | 待审核的标识符声明（合并/冲突） |

- 所有表均启用 RLS，并显式 `revoke all ... from public, anon, authenticated`（RLS 挡不住 TRUNCATE）。
- 公共表的 `provenance` 对 anon 可见：只允许写来源名、ID、日期，禁止写带 token 的 URL、内部备注、用户 ID。
- 研究实体链接列：`research_entity_keys.issuer_id`、`research_entity_securities.ticker`（均可空，FK restrict）。

### 1.1 生命周期触发器（均抛 SQLSTATE 23514，消息以代码开头）

| 代码 | 触发器 | 含义 |
|---|---|---|
| `merge_target_not_active` | `issuers_merge_target_active` | `merged_into` 只能指向 active 发行人（阻止 A→B 后 B→A） |
| `merge_target_has_referrers` | `issuers_merge_target_active` | 已有其他发行人合并进来的发行人不能再变为 merged/dissolved（阻止 A→B→C 链）；先把引用方改指新目标 |
| `issuer_not_active` | `issuer_securities_owner_active` | 非 active 发行人不能持有未关闭（`valid_to is null`）的证券行；已关闭的历史行不受限 |
| `open_securities_exist` | `issuers_retire_requires_closed_securities` | 发行人仍持有未关闭证券行时不能变为 merged/dissolved；先关闭（填 `valid_to`）或转移这些行 |

退役一个发行人的顺序：关闭/转移其未关闭证券 → 把合并到它的发行人改指别处 → 再改 `status`。

## 2. `/admin/dq` 看板

页面 `src/app/(app)/admin/dq`，数据接口 `GET /api/admin/dq`（`?dataset=&page=&pageSize=`，pageSize ≤ 200），需管理员身份（401/403）。所有读取经 `getAdminSupabase()`。

- **指标卡**
  - 不新鲜数据集：`notFresh / freshness 总数`，按 stale/missing/error 细分。
  - 未处理隔离：全局 `count(status='open')`，**不受 dataset 筛选影响**。
  - 对账失败：`dq_reconciliations` 中 `passed=false` 的总数。
  - 近 24h 批次：取最近 50 条批次中落在 24h 内的；若 50 条全在窗口内，显示为 `≥N`（下界）。
- **新鲜度面板**：状态在**读取时用当前时间重算**（`freshnessOf`），因为停跑的生产者不会再调用 `recordAttempt`。`stored_status` 为写入时状态，两者不同即标记 drifted。规则：连续错误 ≥2 → error；无 `last_ok_at` → missing；event 节奏只要有过成功即 fresh；daily 窗口 1d+宽限 2d，monthly 31d+3d，quarterly 92d+3d；未知 cadence 视为 error。
- **批次面板**：最近 50 条 `ingest_batches`（started_at 倒序）。
- **隔离面板**：`open` 隔离项分页（created_at 倒序），可按 dataset 筛选（下拉选项来自已加载的行）；分页总数随筛选变化。
- **对账面板**：最近 50 条失败对账。

**处理隔离项**：`POST /api/admin/dq/quarantine/{id}`，`Content-Type: application/json`，body `{"status":"resolved_accept"|"resolved_reject"}`；浏览器 Origin 必须同源。处理**只修改状态**（status、resolved_by、resolved_at），不会回写或删除业务数据——接受后的修数需另行执行。outcome 为 `resolved` 时，另写一条 `research_audit_log`（`user_id`=处理人，`action='dq.quarantine_resolve'`，`object_type='dq'`，`object_id`=隔离项 id，`detail={id,status}`）；审计写入失败只记服务端日志（`[admin/dq] audit failed`），不改变响应。返回 outcome：

| outcome | HTTP | 含义 |
|---|---|---|
| `resolved` | 200 | 本次处理成功 |
| `already_resolved` | 409 | 已被处理，或并发处理中他人先完成 |
| `not_found` | 404 | 无此 id |

## 3. 运行加载脚本

`tsx` **不会**加载 `.env.local`。需要 `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（dry-run 读 universe 也需要）：先 `export`，或使用
`node --env-file=.env.local --import tsx <script> …`。

### 3.1 SEC 发行人（dataset `entities.sec`）

```bash
# 1) 下载（SEC 要求带 User-Agent，写真实联系方式）
curl -sS -A "OsbornAlpha ops <you@example.com>" \
  -o /tmp/company_tickers_exchange.json \
  https://www.sec.gov/files/company_tickers_exchange.json

# 2) dry-run：只打印计划（parsed/rejected/universe/issuers/securities/skipped），不写库、不建批次
node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts /tmp/company_tickers_exchange.json

# 3) 应用；--as-of 默认当天 UTC 日期，必须是真实日历日
node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts /tmp/company_tickers_exchange.json --apply [--as-of YYYY-MM-DD]
```

仅处理 `stocks_universe` 中 `market='US'` 的 ticker；文件超过大小上限直接失败。`--apply` 在读文件**之前**就创建批次，所以文件损坏也会留下 failed 回执。

SEC 文件没有上市日期：新挂接证券行的 `valid_from` 是**首次观测到它的那次运行的 `--as-of` 日期**，不是上市日；后续运行若该 ticker 已有同一发行人的未关闭行，则计为 duplicate，不改 `valid_from`。

### 3.2 研究实体链接（dataset `entities.research-link`）

```bash
node --env-file=.env.local --import tsx scripts/entity-keys/link-research-entities.ts [--user <uuid>]          # dry-run
node --env-file=.env.local --import tsx scripts/entity-keys/link-research-entities.ts [--user <uuid>] --apply
```

`--user` 默认取 `RESEARCH_OWNER_USER_ID`，无有效 UUID 则拒绝运行。只提升拥有有效硬标识（lei/usci/cik）且有名称的实体；`--apply` 会 upsert 发行人、挂接证券、回填 `research_entity_keys.issuer_id` 与 `research_entity_securities.ticker`。公共行（`issuers.provenance`、`issuer_securities.source/provenance`）只写中性来源 `{"source":"curated","as_of":"YYYY-MM-DD"}`；研究来源与用户 ID 只写入 service-only 的批次回执（`tool_versions.user_id`、`tool_versions.origin='research_entity_keys'`）、错误项的 key 与隔离行的 `detail.entity_key`，不会进入公共行。

### 3.3 退出码与状态策略（两脚本相同）

- 批次状态（`batchStatusFromCounts`）：有 fetched 但无任何计数落账 → `failed`；有失败/错误但有落账（inserted+duplicates+versioned+quarantined）→ `partial`，无落账 → `failed`；否则 `success`。空计划也视为 failed。
- 信息性错误码（`INFO_CODES`：`skipped_summary`、`relink`）保留在 `errors` 中，但**不参与**状态判定：跳过（**预期过滤**：不在 universe、无硬标识、实体未提升）或重新链接的运行仍是 `success`，跳过不会让批次变成 partial。
- 拒绝（**无效输入**）单独汇总为 `rejected_summary`，**不是**信息性错误码：SEC 生产者拒绝的行（`rejected_*`，如 `rejected_invalid_cik`）与研究实体中的无效数据（`invalid_identifier`、`name_required`、`invalid_ticker`、`market_mismatch`）会让批次变为 `partial`（无落账则 `failed`），脚本以 `1` 退出。
- 冲突即隔离：发行人冲突（`issuer_conflict`；命中已退役发行人时 reason_code 为 `inactive_issuer`）与 ticker 归属冲突（`ownership_conflict`）各写一条 `dq_quarantine`，`dataset` 为脚本的 dataset，`table_name` 为 `issuers` / `issuer_securities`，`natural_key` 为 cik（研究链接取第一个硬标识 cik→lei→usci）或 `ticker:valid_from`（同一 ticker 不同有效期各成一条），`batch_id` 为本次批次，`detail={reason, entity_key?}`（SEC 归属冲突带 `cik`），`payload` 为被拒的输入（发行人：名称与硬标识；证券：ticker、isin、share_class、is_primary、valid_from、valid_to，外加 SEC 的 `cik` 或研究链接的 `entity_key`）。同一 open 键重跑不会重复建行（复用已有 open 行）。只有隔离行写入成功才计入 `counts.quarantined`；写入失败则计 `failed` 并追加 `quarantine_error`。这些隔离项在 `/admin/dq` 隔离面板处理。
- 退出码：`2` 参数错误；`1` 批次 failed、`counts.failed > 0` 或存在 `rejected_summary`；否则 `0`。
- 新鲜度（cadence `event`）：`success`，或 `partial` 且 failed=0 且 inserted+duplicates>0 时记一次成功；否则记失败（`consecutive_errors+1`，≥2 即 error）。
- 回执 JSON 输出 `batchId`、`status`、`counts`、`skipped`（`skippedSummary`：按预期过滤原因计数）、`rejected`（`rejectedSummary`：按无效输入原因计数）与前 20 条 `errors`。同一 `batchId` 可在 `/admin/dq` 批次面板查到。

## 4. 标识符声明审核

`issuer_identifier_claims` 中 `status='pending'` 的行是加载/链接过程中遇到的冲突或待合并标识（id_type ∈ lei/cik/usci/isin/figi/cninfo_org_id，含 source 与 confidence）。同一 (issuer_id, id_type, value) 至多一条 pending。**目前没有 UI**：用 service-role 在 SQL 中查看，人工核实后把 status 改为 `accepted` 或 `rejected`，必要时手工更新 `issuers`（合并用 `status='merged'` + `merged_into`，目标须为 active）。

```sql
select * from public.issuer_identifier_claims where status = 'pending' order by created_at desc;
```

## 5. 测试环境注意事项

- 本地运行数据库测试：`PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C npm run test:db`，迁移演练同理 `npm run test:migrations`。
- 两个底座集成测试的迁移重放在单个事务中执行，`set local lock_timeout='3s'`，遇 55P03（锁超时）/40P01（死锁）最多重试 3 次、间隔 500ms：issuers 迁移会 ALTER 其他并发测试正在使用的 `research_entity_*` 表。
- 检出目录中不得存在任何 `.env*` 文件（`scripts/s4/local-db.ts` 发现 PG*/SUPABASE_* 等变量会拒绝运行）。
- 每个引用 `S4_TEST_STATE` 的测试文件都必须登记在 `scripts/ci/research-checks.ts` 的 `criticalSuites`，否则报 `Database suite inventory drift`。
- `supabase/migrations.lock.json` 只允许追加。两个底座迁移在**部署前**做过原地修改；一旦部署到托管库，后续变更必须新建迁移。

## 6. 回滚

按外键顺序删除（service-role / 迁移角色执行）：

```sql
drop table if exists public.issuer_industry_memberships;
drop table if exists public.issuer_identifier_claims;
drop table if exists public.issuer_securities;
drop function if exists public.issuer_securities_owner_active();
drop function if exists public.issuers_retire_requires_closed_securities();
alter table public.research_entity_keys drop column if exists issuer_id;
alter table public.research_entity_securities drop column if exists ticker;
drop table if exists public.issuers;
drop function if exists public.issuers_merge_target_active();
drop table if exists public.industry_classifications;
-- DQ（quarantine/reconciliations 引用 ingest_batches，须先删）
drop table if exists public.dq_quarantine;
drop table if exists public.dq_reconciliations;
drop table if exists public.dq_freshness;
drop table if exists public.ingest_batches;
```

`btree_gist` 扩展可保留。回滚前先导出 `dq_quarantine` 与 `issuer_identifier_claims`（审计证据）。

## 7. 已知后续事项

- `src/lib/db/pg-table-client.ts` 目前仅用于测试（集成测试），生产路径走 Supabase TableClient。
- `/api/entities/resolve` 尚无限流。
- 看板 dataset 下拉选项只来自当前已加载的 freshness/批次/隔离行，未出现在这些行中的隔离数据集选不到；需要一个独立的数据集清单（inventory）查询。
- FIGI/ISIN 补全与 A/H 股配对放在 plan 3。

## 8. 披露事实库（计划二）

规格：`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（第 8 稿；落地偏差见其 §16）。迁移 `supabase/migrations/20261106090000_financial_facts.sql`。代码 `src/lib/facts/`、`scripts/facts/`、`src/app/api/cron/facts-sync/route.ts`、公共读路由 `src/app/api/facts/[ticker]`（含 `/metrics`）与 `src/app/api/filings/[ticker]`。实施记录：`docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`。

**当前状态（2026-11-06）**：美股与 A 股链路均启用。A 股已用真实 Tushare 核对（8.7）、真实夹具与 `sync-cn.integration.test.ts` 进 CI，CN 缺省开启（`FACTS_CN_ENABLED=0` 为关闭开关：路由对 `market=CN` 返回 403 `cn_disabled`，`sync.ts --market CN --apply` 退出码 2），`vercel.json` 登记 `market=US`（`5 */4 * * *`）与 `market=CN`（`35 */4 * * *`），Vercel 需配置 `TUSHARE_TOKEN`。黄金断言未录入，黄金门禁目前只告警；`required.CN` 在 owner 抄录 CN 黄金模板（值 + 巨潮 PDF 页码）后置 true（见 8.11-6）。

### 8.1 表与权限

| 表 | 读 | 写 | 说明 |
|---|---|---|---|
| `fact_sync_runs` | 仅 service_role | 仅函数 | 一次发行人×市场的同步运行；`status` staged→published / abandoned；`manifest` = 本次发布的 filing 集合 |
| `filings` | anon / authenticated / service_role 只读 | 仅函数；例外：service_role 可**列级** `update` `document_ref, document_url, link_attempts`（巨潮挂接） | `(source, source_ref)` 唯一；`mapping_gen` 只由 `publish_sync_run` 推进；公共路由只返回已发布（`mapping_gen>0`）的 filing |
| `financial_facts` | anon / authenticated 只见 `status='ok'`；service_role 全见 | 仅函数 | 披露日志：同一自然键每份文件一行；`value_text` 为 `value::text`；候选键 K + filing + mapping_gen 唯一 |
| `financial_metrics` | 三角色只读 | 仅 `replace_financial_metrics` | 按发行人×市场整体原子替换；`inputs` 扁平列出全部底层事实；`based_on_rev` = 计算所依据的 `state_rev` |
| `fact_sync_scope` | 仅 service_role | `reconcile_fact_sync_scope`（`reasons/priority/fetch_key/scope_confirmed_at`）+ 租约/发布函数 | 调度输入 + 租约 + `state_rev`；`priority=0` = 已退出范围但保留历史；`scope_confirmed_at` = 对账最近一次确认该行仍在范围内（或改动它）的时刻，退役守卫用 |

- 五表均 RLS 且对 `public, anon, authenticated, service_role` `revoke all` 后只 `grant select`；**没有角色有 insert/update/delete**（上表一处例外）。直接 `insert financial_facts`、`update financial_facts.status`、`update filings.mapping_gen` 都会被拒（集成测试 `src/lib/facts/facts.integration.test.ts` 覆盖）。
- 桶 `disclosure-raw`（私有，50 MB = 52428800 字节，仅 `application/json`；迁移里 `insert … on conflict (id) do update` 可重放）。
- `database.types.ts` 新增 `Filing / FinancialFact / FinancialMetric / FactSyncRun / FactSyncScope`；RPC 不登记到 `Functions`。
- 概念目录 35 个（`src/lib/facts/concepts.ts`；规格正文写 33，见规格 §16）。其中 `monetary_funds` 是 CN `money_cap`（货币资金，含受限资金）；CN 的 `cash` **不映射**（留缺），US 的 `cash` 照常。

### 8.2 函数清单

| 函数 | 调用者 | 租约 | 作用 |
|---|---|---|---|
| `reconcile_fact_sync_scope(p_market, p_rows, p_snapshot_at default null)` → int | `reconcileScope` | 否 | 只改 `reasons/priority/fetch_key/scope_confirmed_at`；新行 `next_due_at=now()`。**退役守卫**：`priority 0` 的写入只在该行 `scope_confirmed_at <= p_snapshot_at` 时生效，较新的对账（激活或"未变更的确认"）不会被较旧快照的退役覆盖；活跃行未变更时也刷新 `scope_confirmed_at`。`reconcileScope` 默认把快照时刻回拨 5 分钟（时钟偏差只会推迟退役，不会错退） |
| `claim_fact_sync_lease(p_issuer, p_market, p_batch, p_ttl_seconds)` → bool | sync 核心 | 建立 | 未租/过期/同批次续租 → true |
| `begin_sync_run(p_issuer, p_market, p_batch, p_mapping_gen)` → uuid | sync 核心 | 校验 | 废弃本发行人旧 staged 运行（先标后删），插入新 staged 运行 |
| `stage_filings(p_run, p_rows)` → jsonb | sync 核心 | 校验 | `on conflict (source, source_ref) do nothing`，返回 `source_ref→filing_id`；他人持有的 `source_ref` 不出现在返回表里（调用方把缺键当错误）；复用的 filing 保留原 `available_date`，调用方取返回行的日期 |
| `stage_facts(p_run, p_rows)` → int | sync 核心 | 校验 | 插入 staged 行 |
| `quarantine_facts(p_run, p_fact_ids, p_item)` → int | sync 核心 | 校验 | staged→quarantined，并把 id 并入隔离项 `payload.fact_ids` |
| `publish_sync_run(p_run, p_manifest, p_expected_rev default null)` → int | sync 核心 | 校验 | 一个事务：staged→ok、争议组处置、`filings.mapping_gen` 激活（回退 → `mapping_gen_regression`）、`state_rev+1`。`p_expected_rev` 非空且 ≠ 当前 `state_rev` → `stale_plan`（规划之后管理员提升/裁决过同一发行人，需重新规划）；sync 核心总是传入规划时读到的 `state_rev` |
| `abandon_sync_run(p_run)` | sync 核心 | 校验 | 只对 staged 运行；先标 abandoned 再删其事实 |
| `release_fact_sync_lease(p_issuer, p_market, p_batch, p_outcome, p_next_due)` | sync 核心 | 校验 | 清租约，写 `last_*`、`next_due_at` |
| `resolve_facts_quarantine(p_item, p_chosen, p_resolved_by)` → jsonb | 管理员钩子 | 否（持行锁） | 任一成员行运行仍 staged → `run_pending`；否则翻转项状态、**持久化 `chosen_fact_ids`**、同事务写 `hook:pending`、提升、`state_rev+1`；返回落库的 `chosen_fact_ids` |
| `promote_quarantined(p_issuer, p_market, p_fact_ids)` → int | service_role 直调（TS 代码不使用） | 否（持行锁） | 提升指定事实，返回提升行数；管理路径用 `resolve_facts_quarantine` |
| `replace_financial_metrics(p_issuer, p_market, p_based_on_rev, p_rows)` → int | `materialize` | 否（持行锁） | `state_rev<>p_based_on_rev` → `stale_computation`；整体替换 |
| `fact_state_rev(p_issuer, p_market)` → bigint | `read_facts`、指标路由 | — | anon 可执行；只暴露 `state_rev` |
| `read_facts(p_issuer, p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok)` → jsonb | 读路由、派生、规划 | — | security invoker；单语句单快照信封 `{state_rev, rows, truncated, row_count}`；> 10,000 行 → `truncated=true` 且无行 |

内部助手（不对客户端开放）：`fact_scope_lock`、`fact_run_lock`、`fact_abandon_run`、`fact_item_members`、`fact_promote_rows`；触发器函数 `financial_facts_lifecycle`、`filings_limited_update`。

错误码（`db.ts::toFactsDbError`）：`lease_lost`（SQLSTATE 55P03 或消息头 `lease_lost`）；消息头即码的 `run_pending`、`run_published`、`mapping_gen_regression`、`stale_computation`、`stale_plan`、`run_abandoned`、`invalid_chosen`、`item_not_open`（`MESSAGE_CODES`，P0001）；23505 → `duplicate_key`；其余一律 `unknown`——包括触发器 `financial_facts_lifecycle`、`filings_limited_update` 的 23514（消息前缀 `append_only:`）。`stale_plan`（发布前废弃运行、发行人记 failed，`next_due_at` 推后 10 分钟 = `NEXT_DUE_STALE_MS`）与 `mapping_gen_regression` 同属"发布被拒"；`lease_lost` 停止该发行人且不再有任何数据库调用。

### 8.3 锁纪律

- 所有改变事实可见性的函数都以 `select … from fact_sync_scope where issuer_id=… and market=… for update` 开始；采集函数再校验 `lease_batch_id = p_batch and lease_until > now()`。管理函数（`resolve_facts_quarantine`、`replace_financial_metrics`）不校验租约但持同一把锁，因此与发布串行。
- 租约 600 s；`sync.ts --apply` 与 cron **不要同时运行**同一市场：后者只会得到 `skipped_summary(leased)`，但会浪费一轮。
- 对账（`reconcile_fact_sync_scope`）按市场读取来源表全量后一次提交；并发的两次对账由 `scope_confirmed_at` 守卫兜底（见 8.2），不需要额外串行。退役（`priority 0`）总是可逆的：下一次对账在来源表仍含该发行人时会把它恢复。
- 不要在 SQL 控制台里手工 `update fact_sync_scope set lease_until=null`：若工作者仍活着，它的后续写会抛 `lease_lost` 并把发行人记 failed，这是预期行为；真正悬空的租约会在 `lease_until` 过期后自然可取。

### 8.4 快照路径约定

桶 `disclosure-raw`：`{source}/{issuer_id}/{sha256}.json` 存响应原文字节，旁边 `{sha256}.meta.json`（`{source, api?, url?, params?, fields?, fetched_at, http_status, has_more?, page?, sha256, bytes}`，**不含 token**）。`upsert:false`，409 视为已存在。`financial_facts.raw_hash = sha256(<快照 sha256> + "\n" + <定位串>)`（`providers/shared.ts::rawHashOf`）。定位串为**行级**：EDGAR `facts.<tax>.<tag>.units.<原始单位>[<数组下标>]`（含 `accn/start/end` 以便人读）；Tushare `<api>:rt<report_type>:p<页号>[end_date=…,ann=…,update_flag=…,row=<行号>]`。要核对一行：按 `raw_hash` 无法反查定位串，但同一 `(filing, concept, period, unit)` 的候选可由适配器对同一快照重新解析得到相同 `raw_hash`，相等即证明该行来自该快照的该条目。同一自然键在一份快照里有多行时，隔离项 `payload.rows[]` 聚合列出每一行的证据（值、`raw_hash`、定位）。

### 8.5 `available_date` 规则

日期级（不是时间戳）。EDGAR = `filed`；Tushare = `f_ann_date ?? ann_date`，但 `f_ann_date` **存在但非法**时不回退（该行隔离，保留两个原始日期串）；两者都缺 → 隔离 `missing_available_date`，不写事实行。`missing_available_date` 的自然键含期间、单位与 `api/accn/tag/page/row` 等定位分量，不同期间/行不会碰撞。`asOf` 可见 ⇔ `available_date <= asOf`。同一自然键同一 `available_date` 出现不同值 → 同日冲突（`same_day_conflict`），发布后该日对该键没有 `ok` 值，当前值回落到更早日期，直到管理员在 `/admin/dq` 用 `chosen_fact_ids` 裁决（裁决不改 `ok` 以外的成员；空数组只表示"已知悉"）。

### 8.6 录制夹具

```bash
npx tsx scripts/facts/record-fixture.ts --edgar 320193            # → fixtures/edgar/CIK0000320193.trimmed.json
npx tsx scripts/facts/record-fixture.ts --edgar-revise 320193     # → CIK0000320193.revised.json（追加一条更晚 10-K 的 FY2023 revenue）
node --env-file=<仓库外文件> --import tsx scripts/facts/record-fixture.ts --tushare 600519.SH --since-year 2016   # → fixtures/tushare/<ts_code>.manifest.json + <ts_code>.g<代号>.<api>.rt<n>.p<k>.json + .meta.json
npx tsx scripts/facts/record-fixture.ts --cninfo 600519.SH <YYYY-MM-DD> 2024 annual                        # → fixtures/cninfo/600519.SH-2024-annual.json
```

EDGAR 夹具裁剪到 §3 概念标签与 `end >= 2019-01-01` 的条目，顶层 `__recorded:{at, source_sha256, url, bytes, trimmed:{since_end, tags}}` 记录原始响应的 sha256 与裁剪规则；数字字面量原样写回（`stringifyPreservingNumbers`），没有任何值经过 JS number。Tushare 页按字节原样保存，`.meta.json` 记 `recorded_at/sha256/api/params/fields/page/has_more/http_status`，token 不落盘；重录先写临时目录并校验，再整体替换该发行人的文件集（清单最后原子替换，并删除清单外的旧页）。没有真实夹具时 `fixtures/tushare/_synthetic/`（`request_id: "synthetic"`）只供单测，永不用于黄金断言。巨潮夹具 `fixtures/cninfo/600519.SH-2024-annual.json` 保留原始响应字节与 sha256（已录制）。

黄金断言 `src/lib/facts/fixtures/gold/plan2.json`：格式 `{issuer:{ticker,market}, concept, period_end, unit, value, as_of?, source:{document,page_or_row,url}, recorded_by, recorded_at}`；`recorded_by:'<pending>'` 的条目是模板，不断言；顶层 `required.US/CN`、`ready`：见 8.11-6。

### 8.7 Tushare `report_type` 1/4/5 核对记录（规格 §6.3 / §15 第 1 条）

完整记录：`docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md`（本表是它的摘要；两处同步更新）。**2026-11-06 用真实 token 核对 Tushare 接口响应的行为**（不等于一手文件核实；与巨潮原文的对照由黄金集抄录完成，8.11-6；分页实验为未归档探针观察，复现方法见完整记录）；真实夹具 600519.SH、000333.SZ、600036.SH、000858.SZ（修订对）已录制（`--since-year 2016`，每家 9 页，全部单页）。

| 项 | 观察（公司 / 期末 / 原文行） | 结论 |
|---|---|---|
| `limit` / `offset` / `has_more` 分页 | 600519.SH income rt1：`has_more` 末页前 true、末页 false；`offset` 生效、越界返回空页；但页间排序在同 `end_date` 的 `update_flag` 0/1 并列行上不稳定（limit=10 逐页取完缺 2 行、重 2 行） | 已观察，**多页不保证完整** → 适配器单页强制：`has_more=true` 即 `tushare_unavailable: multi_page_unverified`；四个已录夹具的所有流均为单页（单页最大 77 行 ≪ 2000）；生产流未全量证明，超过 2000 行即失败而不拼接，错误形如 `tushare_unavailable` + `multi_page_unverified:<api>:rt<n>` |
| `start_date` 过滤列 | 返回了 `end_date=19981231`、`ann_date=20010726` 的行 | 按公告日过滤；解析按期末年份另计 `before_since_year` |
| type 1 被更正后 `ann_date` / `f_ann_date` | 000858.SZ 2025-06-30：原行（`20250828`/`20250828`，52770984383.52）保留；新增 `ann_date=20250828`、`f_ann_date=20260430`、23509972048.65 | 已核对（Tushare 响应）：`ann_date` 不变、`f_ann_date` = 更正日、旧行不删；`available_date = f_ann_date ?? ann_date` 正确。巨潮挂接只把日期不同于 rt5 原始日期的 rt1 filing 当作更正版 |
| type 5 的公告日 | 000858.SZ rt5 2025-06-30：`20250828`/`20250828`，52770984383.52 | 已核对（Tushare 响应）：原始公告日 + 原始值 |
| 1 与 5 同日并存 | 000858.SZ 2025-06-30：rt1 原行与 rt5 同日同值 | 出现；不同 filing、同值 → 不构成同日冲突；同日不同值未观察到 |
| `update_flag` | 更正前后两行 rt1 都是 `update_flag=1`；000333.SZ 6 处、600036.SH 12 处同 filing 0/1 两行不同值（多为 `total_share`） | 不能用来挑最新；同 filing 同键不同值继续 `ambiguous_value` 隔离 |
| `is_calc=1` | 规格：跳过 | 计入 `skipped.is_calc` |
| `total_share` 单位 | 600519.SH 2026-09-30 = `1250081601.0` | 数量级与"股"相符；原文核对待黄金集抄录 |
| 控制列 / 数值形态 | 控制列是字符串（`"1"`）；值列普通十进制（含 `.0`），无科学计数法 | 两种形态都接受；无损解码 |
| `money_cap` 口径 | 目录 `monetary_funds`，CN 不映射 `cash` | 金额待黄金集抄录时对照年报 |
| 巨潮夹具 `600519.SH-2024-annual.json` | `available_date=2025-04-03` = Tushare FY2024 年报 `f_ann_date` | 已录制，`sync-cn.integration.test.ts` 回放挂接 |

结论：核对通过（分页完整性限单页）。`sync-cn.integration.test.ts` 进入 `criticalSuites`；`FACTS_CN_ENABLED` 缺省开启（设为 `0` 关闭 CN）；`facts-sync?market=CN` 进入 `vercel.json`。

### 8.8 运行同步与物化

环境：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`；`EDGAR_USER_AGENT`（SEC 要求带联系方式；缺省 `DEFAULT_USER_AGENT`，生产务必设置真实值）；`TUSHARE_TOKEN`（CN 必需；Vercel 必须配置，否则 CN cron 每次失败）；`CRON_SECRET`（cron；缺失 → 503 `cron_unavailable`）；`FACTS_CN_ENABLED`（缺省开启 CN；设为 `0` 关闭 CN `--apply` 与 CN cron 的开关）；`VERCEL_GIT_COMMIT_SHA`（Vercel 自动注入；cron 路由只认它，缺失 → 503 `code_version_unavailable`；脚本回退到 `git rev-parse HEAD`，脏树加 `-dirty`；取不到则拒绝 `--apply`）。

`sync.ts` 参数：`--market US|CN`（必填）、`--issuer <ticker>`（可重复）、`--cik <cik>`（仅 `--no-db`，可重复）、`--limit n`（1..1000，默认 25；cron 路由另限 1..200）、`--since-year y`（1990..当年；缺省 = 当前 UTC 年 − 10）、`--apply`、`--no-db`。退出码 2（用法/前置错误，未做任何事）：未知参数或缺值、`--market` 非 US/CN、`--limit` 越界、`--since-year` 越界、`--no-db` 的组合不合法（需 `--market US` + `--cik`，排斥 `--apply/--issuer`）、非 `--no-db` 却给了 `--cik`、`--market CN --apply` 而 `FACTS_CN_ENABLED=0`、`--apply` 取不到代码版本、`--issuer` 给了未知票据。退出码 1：运行出错或有发行人 `outcome:'failed'`（含 `scope_unresolved`）。

```bash
# 美股 dry-run（读库、抓 SEC、不写）
node --env-file=.env.local --import tsx scripts/facts/sync.ts --market US --issuer AAPL --issuer MSFT --issuer NVDA
# 无任何环境的网络冒烟（内存库；只允许 US + --cik，不允许 --apply/--issuer）
node --import tsx scripts/facts/sync.ts --market US --no-db --cik 320193 --cik 789019 --cik 1045810
# 首轮应用（owner，合并后）；cron 与脚本不要同时跑
node --env-file=.env.local --import tsx scripts/facts/sync.ts --market US --limit 20 --apply
# 按发行人重算派生
node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US --issuer AAPL
node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US --all
```

cron：`GET|POST /api/cron/facts-sync?market=US|CN[&limit=n]`，Bearer `CRON_SECRET`（常量时间比较），`maxDuration=300`，截止 240 s，默认 `limit=25`，范围 1..200，参数重复 → 400；`vercel.json` 登记 `market=US`（`5 */4 * * *`）与 `market=CN`（`35 */4 * * *`，错开 30 分钟）。**每 4 小时的 cron 需要 Vercel Pro**（Hobby 只允许每天一次），见 8.11-1。`FACTS_CN_ENABLED=0` 时 CN 路由返回 403 `cn_disabled`（关闭开关）。HTTP 回执只含码与计数（`market=CN` 且无 `TUSHARE_TOKEN` → 503 `tushare_unconfigured`，在取依赖与建批次之前；批次失败时仍是 HTTP 200 + `ok:false` 的失败回执，看 `receipt.errors`；失败发行人 1 天后重试，成功后 7 天；**空转（无到期发行人）仅当该市场没有 `priority > 0` 且 `last_status='failed'` 的 scope 行时才记 ok 心跳**（健康的安静一周保持 fresh）；有失败中的活跃发行人时空转不写 `dq_freshness`，失败不会被空转掩盖；Tushare 请求间隔 400 ms，即 150 次/分钟；非 parse 类 SyncError 只存错误码，唯一例外是白名单原因 `multi_page_unverified:<api>:rt<n>`，存为该条错误的 message）（不含错误消息、warnings、快照哈希）：`{ok, market, limit, started_at, receipt:{batchId, status, counts, errors:[{code,key?}], idle, detail:{attempted, published, failed, skipped, idle}, issuers:[{issuerId, fetchKey, outcome:'published'|'planned'|'failed'|'skipped', code?, counts, errors}]}}`；脚本输出完整的 `SyncReceipt`（含 `runId`、`warnings`、`snapshotSha256`）。cron 先 `reconcileScope` 再取到期发行人；脚本 `--issuer` / `--no-db` 直指发行人时不对账且不受 `limit` 约束（每个显式发行人都有 outcome）：scope 行按 id 直取，缺行时 `--apply` 由发行人表算出并补建（`reasons:['explicit']`，下一次 cron 对账若来源表不含该发行人会把它退到 `priority 0`），dry-run 构造只读行；算不出 `fetch_key`（无 CIK / 无 A 股上市）的发行人以 `outcome:'failed', code:'scope_unresolved'` 出现，脚本退出码 1。`errors` 的信息码：`skipped_summary`（含 `<issuer>:parser` 的解析器跳过计数与 `<issuer>:cninfo_link`）、`coverage_summary`（CN，`{"<api>:rt<n>":"<首年>-<末年>:<期末数>"}`）、`rule_warning_summary`、`deadline_hit`。抓取器抛出的、不在解析白名单内的错误，其消息只存前 200 字符，且抓取器不得把响应体放进消息。发布之后的失败（挂接、物化、释放）不撤发布：发行人 outcome 仍 `published`，原错误按自身码记入 `errors`，租约以 `failed` 释放（1 天后重试）。新鲜度 dataset `facts.us` / `facts.cn`，`ok` = 空转或 `published ≥ max(1, ceil(attempted/2))`。

### 8.9 悬空 `running` 批次

工作者在 `finishBatch` 前被杀（Vercel 超时、OOM）会留下 `status='running'` 的批次。确认启动时间早于 `maxDuration` 之外（> 10 分钟）后标 failed：

```sql
update public.ingest_batches
   set status='failed', finished_at=now(),
       errors=errors || '[{"code":"orphaned_running","message":"marked failed by runbook 8.9"}]'::jsonb
 where producer='facts-sync' and triggered_by='cron' and status='running' and started_at < now() - interval '10 minutes';
```

上面的 SQL 只处理 `triggered_by='cron'` 的批次：`sync.ts --apply`（`triggered_by='script'`）没有截止时间，可以合法运行很久。执行前**确认没有人正在跑脚本**；脚本批次若确认已死（进程不在），再按同样方式单独处理（去掉 `triggered_by` 条件并人工核对 `started_at` 与进程）。

其 staged 运行会在该发行人下一次 `begin_sync_run` 时被废弃；租约到期后自动可取，不要手工清。

### 8.10 回滚顺序

先导出 `dq_quarantine`（`dataset like 'facts.%'`）与 `fact_sync_runs`（审计证据）。依赖顺序：客户端函数 → 内部助手（`fact_scope_lock` / `fact_run_lock` 的返回类型是表的复合类型，必须先于表删除）→ 表（行触发器随表删除）→ 触发器函数（表删除后才无依赖）→ 计划一表上的索引 → 桶。然后（迁移角色执行；注意本迁移的**现行签名**含 `p_expected_rev` / `p_snapshot_at`）：

```sql
-- 1. client-facing functions
drop function if exists public.read_facts(uuid,text,text[],date,date,date,boolean,int,boolean);
drop function if exists public.fact_state_rev(uuid,text);
drop function if exists public.replace_financial_metrics(uuid,text,bigint,jsonb);
drop function if exists public.resolve_facts_quarantine(uuid,uuid[],uuid);
drop function if exists public.promote_quarantined(uuid,text,uuid[]);
drop function if exists public.release_fact_sync_lease(uuid,text,uuid,text,timestamptz);
drop function if exists public.abandon_sync_run(uuid);
drop function if exists public.publish_sync_run(uuid,uuid[],bigint);
drop function if exists public.quarantine_facts(uuid,uuid[],uuid);
drop function if exists public.stage_facts(uuid,jsonb);
drop function if exists public.stage_filings(uuid,jsonb);
drop function if exists public.begin_sync_run(uuid,text,uuid,int);
drop function if exists public.claim_fact_sync_lease(uuid,text,uuid,int);
drop function if exists public.reconcile_fact_sync_scope(text,jsonb,timestamptz);
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
-- 6. bucket: see the paragraph below (Storage API first; SQL only as a fallback)
-- 7. inventory: nothing of the facts layer may remain
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (proname like 'fact\_%' or proname in ('read_facts','begin_sync_run','stage_filings','stage_facts','quarantine_facts','publish_sync_run','abandon_sync_run','release_fact_sync_lease','claim_fact_sync_lease','reconcile_fact_sync_scope','promote_quarantined','resolve_facts_quarantine','replace_financial_metrics','financial_facts_lifecycle','filings_limited_update'));
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope','dq_quarantine_fact_ids_idx');
```

**桶**：首选路径是经 Storage API 清空并删除（`supabase.storage.emptyBucket('disclosure-raw')` 然后 `deleteBucket('disclosure-raw')`，或 Supabase 控制台 Storage 页）。SQL `delete from storage.buckets where id='disclosure-raw';` 仅作后备（桶非空会被外键拒绝，托管环境也可能直接拒绝对 `storage` 模式的写入）。

两个清单查询都必须返回 0 行（任何遗留的旧签名重载会出现在第一个清单里：按它列出的签名补 `drop function`）。**演练**（合并前一次，在 `test:db` 的临时库上）：应用全部迁移 → 执行本节脚本 → 两个清单为空 → 重新应用 `20261106090000_financial_facts.sql` → `facts.integration.test.ts` 通过。`ingest_batches` 中 `producer='facts-sync'` 的回执与 `dq_freshness` 的 `facts.*` 行保留。同时从 `vercel.json` 移除 `facts-sync` 条目并重新部署，否则 cron 会打到已无表的函数上（503/500 进入 Vercel 日志）。

### 8.11 owner 步骤

1. Vercel 环境：`EDGAR_USER_AGENT`（真实联系方式）、`CRON_SECRET`；另加 `TUSHARE_TOKEN`（CN cron 必需；缺失则 CN 每次运行失败）。CN 缺省开启，如需暂停设 `FACTS_CN_ENABLED=0`。两条 cron（US `5 */4 * * *`、CN `35 */4 * * *`）都是每日多次。**部署前的阻塞项——确认 Vercel 套餐**：`vercel.json` 的 `5 */4 * * *` 是每日多次的 cron，Hobby 套餐会拒绝含它的部署，需要 Pro（规格 §14）。套餐未确认或为 Hobby 时**不要部署**这份 `vercel.json`：先改成每日一次，或由外部调度器调用该路由。
2. 生产迁移 `20261106090000_financial_facts.sql`（按 `alpha-production-deploy-and-hosted-db` 记忆的 Management API 方式；非超级用户，不 `alter function … owner`）。
3. `scripts/facts/sync.ts --market US --limit 20 --apply` 首轮；查看 `/admin/dq` 的 `facts.us` 新鲜度与隔离项；必要时 `materialize.ts --market US --all`。
4. `GET /api/facts/AAPL?concepts=revenue&asOf=2024-06-30` 核对验收样例 1（期末 2023-09-30 的 2023-11-03 披露行，`disclosureSeq=1`）。
5. CN：（已完成于 2026-11-06）真实 `TUSHARE_TOKEN` 核对（8.7）、真实夹具与 `sync-cn.integration.test.ts` 进 CI、`FACTS_CN_ENABLED` 缺省开启、`facts-sync?market=CN` 进 `vercel.json`。**剩余 owner 动作**：在 Vercel 配置 `TUSHARE_TOKEN`；按 8.11-6 抄录 CN 黄金模板（值 + 巨潮 PDF 页码）后把 `fixtures/gold/plan2.json` 的 `required.CN` 置 true。
6. **黄金集抄录**（由实施者之外的人完成；当前"`test:db` 绿" ≠ "黄金已核实"）：`gold/plan2.json` 目前 `ready:false`，`sync-us.integration.test.ts` 的黄金用例在此状态下**只打印告警、不失败**（计划原设计为红灯，指挥决定改为告警；已录入的非 `<pending>` 条目仍会被回放断言）。步骤：(a) 6 家发行人 × 2 个期间 × 6 个科目，逐条从一手文件（10-K / 年报 PDF）抄 `value`（规范十进制字符串）、`source.page_or_row`、`source.url`，填 `recorded_by`（姓名）与 `recorded_at`（ISO）；(b) 每个被断言的发行人必须有录制夹具并被回放套件采集（美股：`record-fixture.ts --edgar <cik>` 并把 `{ticker,cik,name}` 加进 `sync-us.integration.test.ts` 的 `FIXTURE_ISSUERS`——预置与采集都从它派生，只改这一处；A 股：`--tushare` 并把 ts_code 加进 `sync-cn.integration.test.ts` 的发行人表）；(c) 跑 `npm run test:db` 逐条回放 `read_facts(asOf = as_of)`；(d) 全部抄录完毕后把顶层 `ready` 置 true——此后套件强制：`required.US`（AAPL 与 MSFT 各至少一条已录入）、不得有任何 `<pending>`、≥ 6 家且每家 ≥ 2 期、**每期** ≥ 6 科目。**在 `ready:true` 且全绿之前，不得宣称事实库数值已对照一手文件核实。**

### 8.12 隔离项处置（`/admin/dq`）

事实库的隔离数据集为 `facts.us` / `facts.cn`；常见原因码：`same_day_conflict`、`ambiguous_value`（含解析器的 `payload.parser_key`）、`odd_duration`、`missing_available_date`、规则警告。裁决入口是 `/admin/dq` 的处理钩子（`resolveFactsItem`，规格 §7.3）：

- 对争议组选择要保留的 `chosen_fact_ids`；`[]` 只表示"已知悉"，发布时所有成员都已被处置，未选中的成员保持非 `ok`。
- 钩子调用 `resolve_facts_quarantine`：该函数在同一事务里持久化 `chosen_fact_ids`、写 `hook:pending`、提升被选行、`state_rev+1`。任一成员行所属运行仍是 staged → 返回 `run_pending`（稍后重试，不要强行处理）。
- 只有 `same_day_conflict`、`identity_bs`、`identity_gp` 三类项在裁决时写 `hook:pending`（其余原因码没有后续物化钩子）。`hook:pending` 或 `hook:failed` 的项表示事实侧已提升但后续步骤（审计/项状态收尾）未完成。**重试同一个项**：钩子以持久化的 `chosen_fact_ids`、裁决人与状态恢复收尾，不要换选项；若重试仍失败，路由返回 **502**（错误文本不出客户端，错误码映射在响应里，细节看服务端日志与审计行）。反复 502 时先检查数据库连接与 `dq_quarantine` 项的 `payload`，不要手工改 `financial_facts`（没有任何角色有写权限）。
- 裁决之后该发行人的指标 `based_on_rev` 落后于 `state_rev`：公共指标路由此时返回 `stale:true`、无行，直到 `materialize`（下一轮 cron 发布，或 `scripts/facts/materialize.ts --issuer <ticker>`）重算。

### 8.13 公共读路由要点

- `GET /api/facts/{ticker}`：`concepts`（≤ 上限，按自然键 `limit` 截断，`durations` 过滤发生在键限额**之前**）或 `factIds`（≤ 100，证据模式：只返回本发行人本市场、已发布 filing 的 `ok` 行，`disclosureSeq/isCurrent/isRevision` 为 `null`，不施加 `asOf`）二选一。重复参数 → 400 `invalid_parameter:<name>`；未知票据 → 404 `unknown_ticker`。
- `GET /api/facts/{ticker}/metrics`：无 `asOf` 时读物化行，且仅当所有行 `based_on_rev` = 当前 `fact_state_rev` 才返回，否则 `stale:true` + 无行；新鲜指标 `s-maxage=60`，stale `s-maxage=30`。带 `asOf` 时即时用 `read_facts` 信封派生，`truncated` 时无行。
- `GET /api/filings/{ticker}`：只返回已发布（`mapping_gen>0`）的 filing，已发布过滤在 `limit` 之前。
- 票据解析：精确匹配优先（`BRK.A` 不会被规范化成 `BRK`），市场取自实际匹配到的证券行（不是后缀猜测），HK 证券拒绝；合并后的发行人经源证券行重定向。
