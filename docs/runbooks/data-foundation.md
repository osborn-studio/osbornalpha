# 数据底座运行手册（DQ 基础 + 发行人主数据）

适用迁移：`supabase/migrations/20261105090000_dq_foundation.sql`、`supabase/migrations/20261105091000_issuers.sql`。
类型定义：`src/lib/supabase/database.types.ts`（手工维护，与上述迁移逐列对应）。

## 1. 表与访问权限

| 表 | 读 | 写 | 说明 |
|---|---|---|---|
| `ingest_batches` | 仅 service_role | 仅 service_role | 每次导入的回执：`status` ∈ running/success/partial/failed/rejected，`counts`、`errors`、`tool_versions` |
| `dq_quarantine` | 仅 service_role | 仅 service_role | 隔离记录；同一 (dataset, table_name, natural_key, reason_code) 至多一条 `open`；`batch_id` 为 `on delete restrict`，证据不随回执删除 |
| `dq_reconciliations` | 仅 service_role | 仅 service_role | 双源对账结果；`tolerance` 为相对容差 |
| `dq_freshness` | 仅 service_role | 仅 service_role | 每个 dataset 一行：cadence、`last_ok_at`、`consecutive_errors`、写入时的 `status` |
| `issuers` | anon / authenticated 只读 | 仅 service_role | 全局发行人；退役用 `status='merged'/'dissolved'`，不删除 |
| `issuer_securities` | anon / authenticated 只读 | 仅 service_role | 证券归属区间 `[valid_from, valid_to)`，同一 ticker 区间不得重叠，仅 active 发行人可持有未关闭行 |
| `industry_classifications` | anon / authenticated 只读 | 仅 service_role | 行业分类树（sw2021/sw2014/gics/csrc/custom） |
| `issuer_industry_memberships` | anon / authenticated 只读 | 仅 service_role | 发行人行业归属区间，不得重叠 |
| `issuer_identifier_claims` | 仅 service_role | 仅 service_role | 待审核的标识符声明（合并/冲突） |

- 所有表均启用 RLS，并显式 `revoke all ... from public, anon, authenticated`（RLS 挡不住 TRUNCATE）。
- 公共表的 `provenance` 对 anon 可见：只允许写来源名、ID、日期，禁止写带 token 的 URL、内部备注、用户 ID。
- 研究实体链接列：`research_entity_keys.issuer_id`、`research_entity_securities.ticker`（均可空，FK restrict）。

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

**处理隔离项**：`POST /api/admin/dq/quarantine/{id}`，`Content-Type: application/json`，body `{"status":"resolved_accept"|"resolved_reject"}`；浏览器 Origin 必须同源。处理**只修改状态**（status、resolved_by、resolved_at），不会回写或删除业务数据——接受后的修数需另行执行。返回 outcome：

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

### 3.2 研究实体链接（dataset `entities.research-link`）

```bash
node --env-file=.env.local --import tsx scripts/entity-keys/link-research-entities.ts [--user <uuid>]          # dry-run
node --env-file=.env.local --import tsx scripts/entity-keys/link-research-entities.ts [--user <uuid>] --apply
```

`--user` 默认取 `RESEARCH_OWNER_USER_ID`，无有效 UUID 则拒绝运行。只提升拥有有效硬标识（lei/usci/cik）且有名称的实体；`--apply` 会 upsert 发行人、挂接证券、回填 `research_entity_keys.issuer_id` 与 `research_entity_securities.ticker`。用户 ID 只写入 service-only 的批次回执（`tool_versions.user_id`），不会进入公共行。

### 3.3 退出码与状态策略（两脚本相同）

- 批次状态（`batchStatusFromCounts`）：有 fetched 但无任何计数落账 → `failed`；有失败/错误但有落账（inserted+duplicates+versioned+quarantined）→ `partial`，无落账 → `failed`；否则 `success`。空计划也视为 failed。
- 退出码：`2` 参数错误；`1` 批次 failed 或 `counts.failed > 0`；否则 `0`。
- 新鲜度（cadence `event`）：`success`，或 `partial` 且 failed=0 且 inserted+duplicates>0 时记一次成功；否则记失败（`consecutive_errors+1`，≥2 即 error）。
- 回执 JSON 输出 `batchId`、`status`、`counts`、`skipped`（`skippedSummary`：按跳过原因计数，如不在 universe、被拒行等）与前 20 条 `errors`。同一 `batchId` 可在 `/admin/dq` 批次面板查到。

## 4. 标识符声明审核

`issuer_identifier_claims` 中 `status='pending'` 的行是加载/链接过程中遇到的冲突或待合并标识（id_type ∈ lei/cik/usci/isin/figi/cninfo_org_id，含 source 与 confidence）。同一 (issuer_id, id_type, value) 至多一条 pending。**目前没有 UI**：用 service-role 在 SQL 中查看，人工核实后把 status 改为 `accepted` 或 `rejected`，必要时手工更新 `issuers`（合并用 `status='merged'` + `merged_into`，目标须为 active）。

```sql
select * from public.issuer_identifier_claims where status = 'pending' order by created_at desc;
```

## 5. 测试环境注意事项

- 本地运行数据库测试：`PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C npm run test:db`，迁移演练同理 `npm run test:migrations`。
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
