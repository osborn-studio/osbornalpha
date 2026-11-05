# 数据底座二 · F2 披露事实库 设计规格

日期：2026-11-04（第 8 稿。审计轨迹 `docs/audits/2026-11-04-data-foundation-2/`：01 Codex 一轮、02 独立 Claude 复审、03 Codex 二轮、04 二轮处置、05 Codex 三轮、06 三轮处置、07 Codex 四轮、08 四轮处置、09 Codex 五轮、10 五轮处置、11 Codex 六轮、12 六轮处置、13 Codex 七轮、14 七轮处置）
状态：草案，待 owner 评审（§14 有三项 owner 决策）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§4、§8–§10 的 F2 部分。本规格**取代**规格一 §4；规格一 §14 记录的计划一偏差在此视为既定事实。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格逐条对照其硬约束：只用一手来源（EDGAR、交易所定期报告；Tushare 仅作适配器并记录上游与巨潮公告定位）、每个数字可回放（源文件哈希、行定位、可得日期、变换、代码版本）、事实与判断分离、缺失保持缺失（不做代理指标、不填占位、不做静默换算、不混口径、不混报表版本）。
已定决策（owner 2026-11-04）：美股事实来源 EDGAR companyfacts；A 股事实来源 Tushare 三表 + 公告日期字段；港股延后到 F3；本规格不含任何页面。

---

## 1. 目标与非目标

### 1.1 目标

1. **披露日志。** `financial_facts` 记录"哪份文件、在哪个可得日期、对哪个概念的哪个期间、用哪个单位、披露了什么值"。同一期间被多份文件重复披露就有多行；值变了就是修订。任意 `asOf`（日期）都能回放当时可见的最新披露。
2. **两个市场、一个写入路径，全部经数据库函数。** 每次对一个发行人一个市场的同步是一个**同步运行**（sync run）：租约 → 快照入桶 → 解析 → 暂存（staged）→ 规则与隔离 → **一个事务内发布并激活映射代** → 回执。写入路径上的每个变更都由带租约校验的 SQL 函数完成；读者要么看不到这次运行，要么看到完整的一次运行。
3. **派生可重建。** 派生指标由 `derive.ts` 按 `formula_version` 从事实计算，物化行记录全部输入事实与所基于的运行；按发行人整体原子替换，拒绝过期计算；重算后与重算前语义字段逐行一致。
4. **公共只读接口。** 事实、派生、披露文件三个读接口按 ticker 查询（ticker 按**今天**的归属解析为发行人，`asOf` 只作用于事实），读取通过一个 SQL 函数在单一快照内完成。

成功标准（计划二退出条件）：
- sp500 / nasdaq_top500 / us_china 三个宇宙内每个有 CIK 且 companyfacts 可得的发行人，最近 8 个财期的 §3 概念已入库（companyfacts 里没有的概念保持缺失，不计失败）；`GET /api/facts/AAPL?concepts=revenue&asOf=2024-06-30` 返回 period_end 2023-09-30 revenue 的 2023-11-03 10-K 披露行，而不是 FY2024 10-K 中的同期行。
- A 股（范围见 §6.4）10 年三表已入库；一家 `report_type=5`（调整前）与 `report_type=1`（最新）同期不同值且公告日不同的公司，两行并存，`asOf` 早于更正公告日取调整前值；其年报 filing 带巨潮公告 id 与 PDF 链接。
- 黄金断言（§11.4）美股部分在 CI 强制通过；A 股部分在夹具录入后进入强制，且 A 股 cron 只在那之后开启。
- 按发行人重算 `financial_metrics`，语义字段与重算前逐行一致；基于过期运行的重算被拒绝。
- 断网运行同步：批次 `failed`，旧数据不变；连续两次后新鲜度 `error`。
- 一次 cron 运行在截止后结束：已发布的运行完整可见，被截断的运行在下一次运行开始时被废弃清理。

### 1.2 本规格之外

- 港股事实（F3）。
- 跨来源对账运行器、财报日历新鲜度、30 家黄金集、对巨潮 PDF 的逐值核对：计划三。本规格只交付 6 家黄金断言作为测试。
- ISIN / FIGI / A+H 配对、历史 ticker 归属证据、合并后发行人的事实归属：计划三。ticker 解析按今天的归属。
- 母公司报表（Tushare `report_type` 6–12）、单季表（2、3）：不加载。
- `financial_history` 表→视图改造：该表为空、无写入者，本期**不动**。
- 任何页面与 `/admin/dq` 的改动，除 §7.3 一处处理钩子外。
- 删除 `/api/financials/[ticker]`（五个读者）：只加 `Deprecation` 头。
- 日内可得性：只到日期精度（§5.1）。
- 精确十进制算术：数值**持久化**与**相等比较**无损（§6.2），规则与派生用双精度（15 位有效数字）。
- 同一发行人同时有美股与 A 股两路事实时的跨路合并：两路各自独立（§4.4、§8），不做合并视图。

---

## 2. 现状（2026-11-04，计划一落地后）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 发行人 | `issuers(issuer_id, cik（不带前导零）, lei, usci, cninfo_org_id, …, status)`；`issuer_securities(ticker, valid_from = 首次观察日, valid_to, is_primary)`；`resolveIssuer(client, {ticker\|cik\|…}, {today})` | 事实只挂 `issuer_id`；读接口按今天解析 ticker；`fetchKey()` 一处生成 10 位 CIK / ts_code；巨潮定位用 `issuers.cninfo_org_id` |
| 研究实体 | `research_entity_keys.issuer_id`、`in_scope`、`cohort` | A 股范围来源之一（§6.4 owner 决策 A） |
| 证券 | `stocks_universe.ticker`（A 股 `600519.SH`）；`security_universe_memberships(ticker, universe, is_active)` | 美股范围来源 |
| 质量设施 | `startBatch/finishBatch/batchStatusFromCounts`（六计数器；`INFO_CODES` 不降级；`capErrors` 前 100 条）、`quarantine()`（同键 open 唯一；已存在时返回旧项且不更新 payload）、`recordAttempt`（连续两次失败才 `error`）、`rules.ts`（四条规则函数首参为 `ruleId`，不抛异常） | 复用；新增信息码 `rule_warning_summary`、`coverage_summary`、`deadline_hit`，非信息码 `quota_exhausted` |
| 隔离处理 | `POST /api/admin/dq/quarantine/[id]` 翻转状态并写 `research_audit_log`；重复处理返回 `already_resolved` | 增加 facts 钩子、`chosen_fact_ids`、钩子阶段状态（§7.3） |
| 数据库访问 | `TableClient`（Supabase / memory / pg；无 delete / rpc / 事务；`selectAll` 分页 1000） | 批次/隔离/新鲜度继续用它；事实层用 `FactsDb`（§4.8），其写操作全是 `rpc` |
| 财务数据 | `financial_history` 为空；`/api/financials/[ticker]` 实时拉 Tushare | 表不动；路由加弃用头 |
| Tushare 客户端 | `tushareCall` 不暴露原文、`has_more`、`request_id` | 新增 `tushareCallRaw`（§6.3） |
| EDGAR 访问 | `collectors/shared.ts::createClient` | 复用 pace 逻辑 |
| 巨潮访问 | `collectors/cninfo.ts`（`topSearch`、`hisAnnouncement/query`；只处理 sse/szse） | 公告挂接（§6.3）；BJ 不挂接 |
| 存储 | 私有桶 `security-snapshots` | 同法新建 `disclosure-raw` |
| cron | `vercel.json` + `CRON_SECRET` Bearer；`maxDuration=300` | 同法；预算经 `SyncDeps.deadline` |
| 环境 | 本机无 `TUSHARE_TOKEN`/`EDGAR_USER_AGENT`；生产有 `TUSHARE_TOKEN` | 夹具录制需 owner 提供 token（§14） |
| 迁移 | 最新已锁 `20261105091000_issuers.sql`；本地与托管都是 PostgreSQL 17 | 新迁移 `20261106090000_financial_facts.sql` |

---

## 3. 概念目录 `src/lib/facts/concepts.ts`

`FACT_CONCEPTS` 导出 **33** 个概念。`MAPPING_GEN = 1`（整数，单调递增；任何映射改动 +1）、`MAPPING_VERSION = 'facts-map/1'`。每个概念：`id`、`statement`、`nature`、`unitKind`（money/shares/per_share）、`usGaap: string[]`、`ifrs: string[]`、`tushare`、`notes`。

**回退列表只放等价口径的别名**；口径不同的度量是不同概念。**选取规则**：对同一 filing、同一期间 (`start,end`)、同一单位，按顺序取第一个有条目的标签；更低优先级标签只在更高优先级标签没有该期间条目时补位。**同一标签**对同一 `accn+start+end+unit` 给出不同 `val` → 隔离 `ambiguous_value`。被选标签写入 `source_concept`。

| concept | 表 | 性质 | us-gaap 回退顺序 | ifrs-full | Tushare |
|---|---|---|---|---|---|
| revenue | IS | duration | Revenues → RevenueFromContractWithCustomerExcludingAssessedTax → SalesRevenueNet | Revenue | income.total_revenue |
| revenue_operating | IS | duration | — | — | income.revenue |
| cost_of_revenue | IS | duration | CostOfRevenue → CostOfGoodsAndServicesSold → CostOfGoodsSold | CostOfSales | income.oper_cost |
| gross_profit | IS | duration | GrossProfit | GrossProfit | — |
| operating_income | IS | duration | OperatingIncomeLoss | ProfitLossFromOperatingActivities | income.operate_profit |
| net_income | IS | duration | ProfitLoss | ProfitLoss | income.n_income |
| net_income_parent | IS | duration | NetIncomeLoss | ProfitLossAttributableToOwnersOfParent | income.n_income_attr_p |
| eps_basic | IS | duration | EarningsPerShareBasic | BasicEarningsLossPerShare | income.basic_eps |
| eps_diluted | IS | duration | EarningsPerShareDiluted | DilutedEarningsLossPerShare | income.diluted_eps |
| rd_expense | IS | duration | ResearchAndDevelopmentExpense | ResearchAndDevelopmentExpense | income.rd_exp |
| sga_expense | IS | duration | SellingGeneralAndAdministrativeExpense | SellingGeneralAndAdministrativeExpense | sum(income.sell_exp, income.admin_exp) |
| interest_expense | IS | duration | InterestExpense | InterestExpense | income.fin_exp_int_exp |
| interest_expense_bank | IS | duration | — | — | income.int_exp（银行口径） |
| income_tax | IS | duration | IncomeTaxExpenseBenefit | IncomeTaxExpenseContinuingOperations | income.income_tax |
| total_assets | BS | instant | Assets | Assets | balancesheet.total_assets |
| total_liabilities | BS | instant | Liabilities | Liabilities | balancesheet.total_liab |
| liabilities_and_equity | BS | instant | LiabilitiesAndStockholdersEquity | EquityAndLiabilities | — |
| equity_parent | BS | instant | StockholdersEquity | EquityAttributableToOwnersOfParent | balancesheet.total_hldr_eqy_exc_min_int |
| equity_total | BS | instant | StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest | Equity | balancesheet.total_hldr_eqy_inc_min_int |
| cash | BS | instant | CashAndCashEquivalentsAtCarryingValue | CashAndCashEquivalents | balancesheet.money_cap |
| cash_and_restricted_cash | BS | instant | CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents | — | — |
| short_term_borrowings | BS | instant | ShortTermBorrowings | ShorttermBorrowings | balancesheet.st_borr |
| long_term_borrowings | BS | instant | LongTermDebtNoncurrent | LongtermBorrowings | balancesheet.lt_borr |
| bonds_payable | BS | instant | — | — | balancesheet.bond_payable |
| shares_outstanding | BS/DEI | instant | CommonStockSharesOutstanding → dei:EntityCommonStockSharesOutstanding（封面日期，`notes: cover_date`） | NumberOfSharesOutstanding | balancesheet.total_share（股） |
| operating_cash_flow | CF | duration | NetCashProvidedByUsedInOperatingActivities | CashFlowsFromUsedInOperatingActivities | cashflow.n_cashflow_act |
| investing_cash_flow | CF | duration | NetCashProvidedByUsedInInvestingActivities | CashFlowsFromUsedInInvestingActivities | cashflow.n_cashflow_inv_act |
| financing_cash_flow | CF | duration | NetCashProvidedByUsedInFinancingActivities | CashFlowsFromUsedInFinancingActivities | cashflow.n_cash_flows_fnc_act |
| capex | CF | duration | PaymentsToAcquirePropertyPlantAndEquipment | PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities | — |
| capex_incl_intangibles | CF | duration | — | — | cashflow.c_pay_acq_const_fiolta |
| dividends_paid | CF | duration | PaymentsOfDividends | DividendsPaidClassifiedAsFinancingActivities | — |
| dividends_and_interest_paid | CF | duration | — | — | cashflow.c_pay_dist_dpcp_int_exp |
| net_change_in_cash | CF | duration | CashAndCashEquivalentsPeriodIncreaseDecrease | IncreaseDecreaseInCashAndCashEquivalents | cashflow.n_incr_cash_cash_equ |
| net_change_in_cash_and_restricted | CF | duration | CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect | — | — |

单位归一（`units.ts`）：companyfacts `USD`、`shares`、`<货币>/shares`→`<货币>/share`、`pure`，其他货币原样；Tushare 金额 → `CNY`，eps → `CNY/share`，`total_share` → `shares`。`unitRule` 按 `unitKind`。单位是事实键的一部分；派生只在输入单位一致时计算。读接口 `concepts` 上限 = `FACT_CONCEPTS.length`。

---

## 4. 数据模型

迁移 `supabase/migrations/20261106090000_financial_facts.sql`，可重放；补 `migrations.lock.json`；`database.types.ts` 手工补五个 Row 类型。所有表显式 `revoke all from public, anon, authenticated, service_role` 后按 §4.7 授权——**事实层的表对 `service_role` 也不开放直接写**，写只经函数。

### 4.1 `fact_sync_runs` —— 一次同步运行（发布单位）

```
run_id        uuid primary key
issuer_id     uuid not null references issuers(issuer_id) on delete restrict
market        text not null check (market in ('US','CN'))
batch_id      uuid not null references ingest_batches(batch_id) on delete restrict
mapping_gen   int not null
status        text not null default 'staged' check (status in ('staged','published','abandoned'))
manifest      jsonb not null default '[]' check (jsonb_typeof(manifest) = 'array')   -- 本次完整处理过的 filing_id 列表（含零输出的）
started_at    timestamptz not null default now()
published_at  timestamptz
index (issuer_id, market, status)
```

### 4.2 `filings`

```
filing_id        uuid primary key
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
market           text not null check (market in ('US','CN'))
source           text not null check (source in ('edgar','tushare'))
origin           text not null check (origin in ('sec','sse','szse','bse'))
form_type        text not null check (form_type in ('10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','annual','semiannual','q1','q3','restatement','other'))
fiscal_year      int
fiscal_period    text check (fiscal_period in ('FY','Q1','Q2','Q3','H1','9M'))
period_end       date
available_date   date not null
source_ref       text not null
url              text
document_ref     text
document_url     text
link_attempts    int not null default 0
mapping_gen      int not null default 0                   -- 已激活的映射代；0 = 尚无已发布运行覆盖
run_id           uuid not null references fact_sync_runs(run_id)   -- 创建它的运行
created_at       timestamptz not null default now()
unique (source, source_ref)
unique (filing_id, issuer_id, market)
unique (filing_id, available_date)
index (issuer_id, market, available_date desc)
```

触发器 `filings_limited_update`：`update` 只允许改 `document_ref/document_url/link_attempts/mapping_gen`，且 `mapping_gen` 只能增大；`delete` 禁止。

### 4.3 `financial_facts`（披露日志）

```
fact_id          uuid primary key
issuer_id        uuid not null
market           text not null
filing_id        uuid not null
run_id           uuid not null references fact_sync_runs(run_id)
concept          text not null check (length(concept) between 1 and 64)
source_concept   text not null
statement        text not null check (statement in ('IS','BS','CF','DEI'))
period_start     date
period_end       date not null
duration         text not null check (duration in ('3M','6M','9M','12M','INSTANT'))
value            numeric not null
value_text       text generated always as (value::text) stored
unit             text not null check (length(unit) between 1 and 16)
consolidation    text not null default 'consolidated' check (consolidation in ('consolidated','parent'))
available_date   date not null
mapping_gen      int not null
mapping_version  text not null
status           text not null default 'staged' check (status in ('staged','ok','quarantined'))
raw_hash         text not null
created_at       timestamptz not null default now()
foreign key (filing_id, issuer_id, market) references filings(filing_id, issuer_id, market) on delete restrict
foreign key (filing_id, available_date) references filings(filing_id, available_date) on delete restrict
constraint financial_facts_period check (period_start is null or period_start < period_end)
constraint financial_facts_instant check ((period_start is null) = (duration = 'INSTANT'))
unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, unit, filing_id, mapping_gen)
index (issuer_id, market, concept, period_end, available_date)
index (run_id)
index (filing_id)
```

- 无版本列：顺序、前一次披露、是否修订在读取时按 `available_date` 计算（§5.2）。
- `duration`：75–105 天 → `3M`，165–200 → `6M`，255–290 → `9M`，350–380 → `12M`，instant → `INSTANT`；其余隔离 `odd_duration`。不标财季号。
- 触发器 `financial_facts_lifecycle`（`23514`，前缀 `append_only:`）：`insert` 必须 `status='staged'`；`update` 只允许改 `status`（`staged→ok`、`staged→quarantined`、`quarantined→ok`、`ok→quarantined`）；`delete` 只允许 `run_id` 所属运行 `status='abandoned'` 的行。
- 这些约束是兜底；真正的写路径是 §4.5 的函数。

### 4.4 `financial_metrics`（缓存，原子替换）

```
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
market           text not null
metric           text not null
period_start     date not null
period_end       date not null
duration         text not null check (duration in ('3M','6M','9M','12M','TTM','INSTANT'))
value            numeric not null
value_text       text generated always as (value::text) stored
unit             text not null
input_unit       text not null
basis            text not null                             -- 'us_standard' | 'cn_standard' | 'cn_incl_intangibles' | 'cn_incl_bonds'
formula_version  text not null
inputs           jsonb not null check (jsonb_typeof(inputs) = 'array')   -- 扁平：全部底层事实 [{fact_id, concept, filing_id, available_date}]
based_on_rev     bigint not null                                           -- 计算所依据的事实状态版本 fact_sync_scope.state_rev（§4.5）
as_of            date not null
computed_at      timestamptz not null default now()
primary key (issuer_id, market, metric, period_start, period_end, input_unit, basis, formula_version)
index (issuer_id, market, metric, period_end desc)
```

事实在当日披露即当日可见（`available_date` 永远 ≤ 今天），不存在"未来生效"的事实，物化不需要按日界刷新；物化只在发布与提升后发生。

### 4.5 `fact_sync_scope` 与 SQL 函数

```
fact_sync_scope
  issuer_id, market  (primary key)
  reasons jsonb, priority int, fetch_key text
  next_due_at timestamptz not null default now()
  lease_until timestamptz, lease_batch_id uuid
  state_rev bigint not null default 0            -- 事实状态版本：每次发布或提升 +1（审计 R4-6）
  last_attempt_at, last_success_at, last_batch_id, last_status ('success'|'failed'), updated_at
  index (market, next_due_at, priority desc, issuer_id) where priority > 0
```

全部函数 `language plpgsql security definer set search_path = public`；`revoke execute from public, anon, authenticated`；`grant execute to service_role`（`read_facts` 例外，见 §4.6）。**所有改变事实可见性的函数**（下表除 `reconcile_fact_sync_scope`、`claim_fact_sync_lease` 外）都以 `select … from fact_sync_scope where issuer_id=p_issuer and market=p_market for update` 取同一把行锁开始；采集函数随后校验 `lease_batch_id = p_batch and lease_until > now()`，否则 `raise exception 'lease_lost' using errcode='55P03'`；管理函数（`promote_quarantined`、`replace_financial_metrics`）不校验租约但持同一把锁，因此与发布串行（审计 R3-4、R4-6）。

**写函数前提的例外**（审计 R4-7）：`reconcile_fact_sync_scope` 不需要租约（它创建/更新调度输入）；`filings` 的 `document_ref/document_url/link_attempts` 三列对 `service_role` 开列级 `update` 权限（巨潮挂接，不触及事实可见性）。除此之外没有角色能直接写事实层表。

| 函数 | 作用 |
|---|---|
| `reconcile_fact_sync_scope(market, rows jsonb)` → int | 仅 service_role；`insert … on conflict (issuer_id, market) do update set reasons, priority, fetch_key, updated_at`；不动 `next_due_at/lease_*/state_rev/last_*`；返回变更行数 |
| `claim_fact_sync_lease(issuer, market, batch, ttl)` → bool | `for update` 后：未租 / 已过期 / 同批次续租 → 设租约、返回 true；否则 false |
| `begin_sync_run(issuer, market, batch, mapping_gen)` → run_id | 租约校验；对本发行人本市场所有 `status='staged'` 的旧运行执行废弃（同 `abandon_sync_run` 的顺序：**先标 `abandoned`，再删其事实**，再删它创建的、已无事实且 `mapping_gen=0` 的 filings——该删除由函数内设置 `set_config('facts.allow_filing_delete','on',true)` 放行）；插入新运行（`staged`） |
| `stage_filings(run, rows jsonb)` → jsonb | 租约与运行校验；逐行 `insert … on conflict (source, source_ref) do nothing`，返回 `{source_ref → filing_id}`（含已存在者） |
| `stage_facts(run, rows jsonb)` → int | 租约与运行校验；`insert` 为 `staged`（`on conflict do nothing`），返回插入数 |
| `quarantine_facts(run, fact_ids uuid[], item_id uuid)` → int | 租约与运行校验；本运行行 `staged→quarantined`；并在同一把锁内把 `fact_ids` **并入** `dq_quarantine(item_id).payload.fact_ids`（只允许扩展；成员变更与发布/裁决串行，审计 R6-1）；**不改公共行** |
| `publish_sync_run(run, manifest uuid[])` → int | 租约与运行校验；一个事务内：本运行 `staged→ok`；**争议组处置**：对每个 `open` 的 `same_day_conflict` 隔离项（`payload.fact_ids` 中含本运行的行），把该项引用的所有仍为 `ok` 的行（无论来自哪个运行，含曾被废弃运行登记过的）置 `quarantined`（审计 R5-1：处置从争议项推导，不依赖运行上的记录）；manifest 内每个 filing：`filings.mapping_gen > run.mapping_gen` → `raise 'mapping_gen_regression'`，否则置为 `run.mapping_gen`；运行标 `published`、写 `manifest`；`state_rev + 1`；返回发布行数 |
| `abandon_sync_run(run)` | 租约校验；运行必须是 `staged`（已发布 → `raise 'run_published'`）；**先标 `abandoned`，再删本运行事实**（触发器据运行状态放行）；已发布行不变；争议项保持 `open`（其中指向已删行的 id 在后续发布时忽略） |
| `release_fact_sync_lease(issuer, market, batch, outcome, next_due)` | `for update`；`lease_batch_id <> batch` → `raise 'lease_lost'`；清租约，写 `last_*`、`next_due_at` |
| `promote_quarantined(issuer, market, fact_ids uuid[])` → int | 管理员钩子专用；持行锁；只提升同时满足的行：当前 `quarantined`；所属运行 `published`；`filings.mapping_gen = 行.mapping_gen`；该行的 K/日期没有 `open` 的 `same_day_conflict` 项；若该行曾属于某个已处理的 `same_day_conflict` 项，则必须在该项 `detail.chosen_fact_ids` 内；不被其他 `open` 隔离项引用。满足者 `→ok`，`state_rev + 1`；返回提升数（§7.3） |
| `replace_financial_metrics(issuer, market, based_on_rev, rows jsonb)` → int | 持行锁；`state_rev <> based_on_rev` → `raise 'stale_computation'`；否则删该发行人该市场全部物化行并插入 |
| `resolve_facts_quarantine(item_id, chosen uuid[], resolved_by uuid)` → jsonb | 管理员钩子专用（审计 R6-1、R7-1）；持行锁；项必须 `open`；读取该项 `payload.fact_ids` 对应的**全部**现存行：任一行所属运行仍为 `staged` → `raise 'run_pending'`（项保持 open）；**在同一事务内**：项 `status='resolved_accept'`、`resolved_by`、`resolved_at`、`detail.chosen_fact_ids = chosen`（`same_day_conflict` 时为裁决，其他类型为 `payload.fact_ids`），然后按 `promote_quarantined` 的资格规则提升——资格检查中"无 open 争议项"以本项已关闭为前提（本项不再阻塞自己）；`state_rev + 1`；返回 `{promoted, skipped}`。状态翻转、裁决持久化、成员检查与提升原子完成 |
| `fact_state_rev(issuer, market)` → bigint | `security definer`、`stable`，**授予 anon/authenticated/service_role**；只返回 `state_rev`（不暴露 `fact_sync_scope` 的其他列）；供 `read_facts` 在同一语句（同一快照）内调用（审计 R5-2） |

### 4.6 读取函数 `read_facts`

```sql
create or replace function public.read_facts(
  p_issuer uuid, p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb   -- 单个信封 {state_rev, rows: [...], truncated: bool, row_count: int}
language sql stable security invoker …
```

**返回一个 `jsonb` 信封而不是行集**（审计 R4-5：PostgREST 的 `max_rows`——本地 `supabase/config.toml` 为 1000——对返回表的函数同样截断，而单个标量值不受影响）。单条语句（一个快照）内：`financial_facts f join filings g on g.filing_id = f.filing_id and f.mapping_gen = g.mapping_gen`，`f.market = p_market`，`f.available_date <= p_as_of`，`period_end between`，`f.status='ok'`（`p_include_non_ok=true` 时含 `staged/quarantined`，RLS 使匿名调用者仍只见 `ok`）；按自然键分区用窗口函数算 `disclosure_seq`（`order by available_date, created_at, fact_id`）、`is_current`、`is_revision`（`value <> lag(value)`）；`p_history=false` 只返回 `is_current` 行；硬上限 10,000 行，超出时 `truncated=true` 且不返回行以外的任何部分结果给内部调用者——**规划与派生在 `truncated=true` 时拒绝继续**（该发行人 `failed`，码 `read_truncated`）；公共路由把 `truncated` 透传。信封的 `state_rev` 通过 `fact_state_rev()`（`security definer`，§4.5）在同一语句内取得，匿名调用者因此不需要读 `fact_sync_scope`。`read_facts` 本身 `security invoker` + `grant execute to anon, authenticated, service_role`。

### 4.7 权限、桶

- `filings`、`financial_metrics`、`fact_sync_runs`：`grant select to anon, authenticated, service_role`，RLS `for select using (true)`（`fact_sync_runs` 仅 service_role 可读）。
- `financial_facts`：`grant select to anon, authenticated, service_role`，策略 `using (status='ok')`，service_role 另有策略 `using (true)`。
- `fact_sync_scope`：仅 service_role 可读。
- **没有角色拥有事实层表的 insert/update/delete**，两个明示例外：`service_role` 对 `filings` 的 `document_ref/document_url/link_attempts` 有列级 `update`（巨潮挂接）；`fact_sync_scope` 的调度输入经 `reconcile_fact_sync_scope`。其余写只经 §4.5 的 `security definer` 函数（owner 为迁移角色）。集成测试验证 `service_role` 直接 `insert` 事实、`update` 事实状态、`update filings.mapping_gen` 都被拒。
- 桶 `disclosure-raw`：`insert into storage.buckets … ('disclosure-raw', false, 52428800, array['application/json']) on conflict …`；路径 `{source}/{issuer_id}/{sha256}.json` 存响应原文字节，旁边 `{sha256}.meta.json`（无 token）；`upsert:false`，`409` = 已存在。`raw_hash` 定位规则同第 3 稿（EDGAR：`facts[tax][tag].units[unit][]` 中 `accn` 与 `end/start` 匹配的条目；Tushare：该页响应中 `end_date`、`report_type`、公告日匹配的行）。上传失败 → 本运行废弃，`failed`。

### 4.8 数据访问契约 `src/lib/facts/db.ts`

```ts
export interface FactsDb {
  claimLease(issuer, market, batch, ttlSeconds): Promise<boolean>;
  beginRun(issuer, market, batch, mappingGen): Promise<string>;            // rpc begin_sync_run
  stageFilings(run, rows): Promise<Map<sourceRef, filingId>>;
  stageFacts(run, rows): Promise<number>;                                 // 分块 ≤ 500
  publishRun(run, manifest): Promise<number>;
  abandonRun(run): Promise<void>;
  releaseLease(issuer, market, batch, outcome, nextDue): Promise<void>;
  resolveFactsQuarantine(itemId, chosen, resolvedBy): Promise<{promoted, skipped}>;   // rpc resolve_facts_quarantine（抛 RunPending）
  quarantineFacts(run, factIds, itemId): Promise<number>;
  replaceMetrics(issuer, market, basedOnRev, rows): Promise<number>;      // 抛 StaleComputation
  readFacts(issuer, market, opts: {concepts, asOf, from?, to?, history?, limit?, includeNonOk?}): Promise<{stateRev, rows, truncated}>;   // rpc read_facts（信封）
  factsByIds(ids): Promise<FactRow[]>;                                    // 证据查询，不限 generation（按 RLS）
  openConflicts(issuer, market): Promise<ConflictItem[]>;                 // dq_quarantine 中 open 的 same_day_conflict 项（§5.3）
  filingsOfIssuer(issuer, market, opts): Promise<Filing[]>;
  updateFilingLink(filingId, patch: {document_ref?, document_url?, link_attempts}): Promise<void>;   // 明示例外的列级 update
  reconcileScope(market, rows): Promise<number>;                          // rpc reconcile_fact_sync_scope
  scopeDue(market, now, limit): Promise<ScopeRow[]>;
  metricsOfIssuer(issuer, market, formulaVersion): Promise<MetricRow[]>;
}
```

三种实现：`supabaseFactsDb`（`rpc` + 只读 `from()`），`memoryFactsDb`（单测；实现租约、运行与状态规则），`pgFactsDb`（集成测试，直连）。所有抛错以 `FactsDbError{code: 'lease_lost'|'mapping_gen_regression'|'stale_computation'|…}` 归一。

---

## 5. 时点与版本语义

### 5.1 可得日期

`available_date` 是**日期**：EDGAR `filed`；Tushare `f_ann_date ?? ann_date`；都缺 → 隔离 `missing_available_date`。`asOf` 为 `YYYY-MM-DD`，可见 ⇔ `available_date <= asOf`。

### 5.2 读取时的版本

对自然键 K = `(issuer_id, concept, period_start, period_end, consolidation, unit)`（在一个 market 内）：
1. 每个 filing 只取 `mapping_gen = filings.mapping_gen` 的行（激活与发布同一事务，§4.5）。
2. `status='ok' and available_date <= asOf` 的行按 `(available_date, created_at, fact_id)` 升序成序列。同一 `available_date` 下不同值不会同时为 `ok`（§5.3 冲突规则保证，且与到达顺序无关）。
3. 当前值 = 最后一行；`disclosure_seq` = 位置；`is_revision` = 值与前一行不同（`numeric` 比较）。

### 5.3 写入时的重复与冲突

- 候选键 = K + `filing_id` + `mapping_gen`。已存在（任何 `status`，任何运行）→ 不写，`duplicates`。
- 同一 filing、同一 K、同一标签多个不同 `value` → 不写，隔离 `ambiguous_value`。
- **同日冲突**（到达顺序无关，审计 R4-2/R4-3）：一个 (K, `available_date`) 若存在 `open` 的 `same_day_conflict` 隔离项，就是**争议中**的。规划时对每个候选 c：
  1. 若 (K, 日期) 争议中 → c 以 `staged` 写入后 `quarantine_facts`，并并入该项的 `fact_ids`（§7.1 的并入规则）；无论 c 的值是否与某一方相同。
  2. 否则若存在 r（已发布 `ok` 行，或本运行另一候选）同 K、同日、值不同 → c（及本运行的另一候选）`quarantine_facts`，新建 `same_day_conflict` 项引用 c 与 r（r 仍 `ok`）。r 的 `ok→quarantined` **只在 `publish_sync_run` 内由争议项推导执行**（§4.5）；本运行若被废弃，r 不受影响，争议项保持 `open`，重试时 c' 走分支 1 并入，发布时仍会处置 r（审计 R5-1）。
  效果：发布后该日对该 K 没有 `ok` 值，当前值回落到更早日期；两份文件谁先到结果相同；后到的第三方也进入同一争议组。解决见 §7.3。
- 计数：新行值等于写入前当前值或此前无披露 → `inserted`；不同 → `versioned`；隔离 → `quarantined`。
- 值相等判断用**规范十进制形式**（§6.2）。

### 5.4 并发、原子性、一致性

- 租约 + 行锁：所有改变可见性的函数持同一把 `fact_sync_scope` 行锁；采集函数另校验租约（§4.5）。超时的旧工作者的任何写都抛 `lease_lost`。
- 发布原子：`publish_sync_run` 一个事务内完成事实可见、冲突处置、映射代激活、`state_rev` 递增；manifest 含零输出的 filing。发布前不改任何公共行。
- 废弃只针对 `staged` 运行，先标后删；已发布运行的 `quarantined` 行是证据，保留。
- 读取原子：`read_facts` 单语句单快照，信封带 `state_rev`。
- 派生过期拒绝：`replace_financial_metrics` 在同一把行锁下比较 `state_rev`。

---

## 6. 采集

### 6.1 共用核心 `src/lib/facts/sync.ts`

```ts
export interface Budget { remainingMs(): number; signal: AbortSignal }
export interface SyncDeps { db: FactsDb; tables: TableClient; storage: SnapshotStore;
  fetchUs: (cik10, b: Budget) => Promise<RawSnapshot>; fetchCn: (tsCode, sinceYear, b: Budget) => Promise<RawSnapshot[]>;
  linkCn?: (filing, b: Budget) => Promise<{document_ref, document_url}|'none'|'ambiguous'>;
  now: () => Date; deadline: Date|null; codeVersion: string }
```

`runFactsSync(deps, {market, limit, issuerIds?, dryRun, triggeredBy})`：一个 `ingest_batches` 行（`producer='facts-sync'`，`dataset='facts.us'|'facts.cn'`，`tool_versions={mapping_gen, rules, formula, source}`，`code_version = VERCEL_GIT_COMMIT_SHA ?? git rev-parse HEAD（工作树脏则加 -dirty）`，取不到拒绝 apply）。先 `reconcileScope(market)`，再 `scopeDue(market, now, limit)`（`next_due_at <= now`，`next_due_at, priority desc, issuer_id`）。每个发行人（剩余预算 < 90 s 不再开始；`deadline_hit` 信息码）：

1. `claimLease(…, 600)`；失败 → `skipped_summary(leased)`。
2. `run = beginRun(issuer, market, batch, MAPPING_GEN)`（函数内废弃旧的 staged 运行）。
3. 抓取（预算内）→ 快照上传（`storage.put(bytes, b)` 带 abort）。
4. 解析（§6.2/§6.3）→ 候选事实与 filings（含零候选的 filing）。
5. `readFacts(issuer, market, {concepts: all, asOf: 今天, history: true, includeNonOk: true})`（`truncated` → `read_truncated`，废弃运行）+ `openConflicts` → `planFactWrites`（§5.3，纯函数：输出新行、隔离集、冲突处置、并入项）。
6. `stageFilings` → `stageFacts`（staged）。
7. 规则（§7）：组 = 本运行新行所在的 (filing, period, unit)，输入 = 新行 ∪ 该组当前代 `ok` 行；先写/并入 `dq_quarantine` 项（payload 含自然键分量、`fact_ids`、`run_id`），再 `quarantineFacts(run, ids, itemId)`（成员并入在锁内）。
8. `publishRun(run, manifest)`；`mapping_gen_regression` → 废弃运行，`failed`。
9. CN：`linkCn` 对本发行人 `document_ref is null and link_attempts < 5` 的 filing（含历史）；`updateFilingLink`。
10. `materialize(issuer, market)`（§8）：读 `readFacts` 信封得 `stateRev`，`replaceMetrics(…, stateRev, rows)`；`stale_computation` → 重算一次。
11. `releaseLease(outcome, nextDue)`：成功 `now + 7d`，失败 `now + 1d`。

任何 `lease_lost` → 该发行人 `failed`，不再调用后续函数；预算耗尽 → `abandonRun`（若仍有租约与时间）。批次结束 `finishBatch`；新鲜度 `recordAttempt(dataset, {ok})`，`ok` = 无到期发行人（空转）或 `published ≥ max(1, ceil(attempted/2))`；`detail={attempted, published, failed, skipped, idle}`。

### 6.2 EDGAR companyfacts 适配器

- 请求：`GET https://data.sec.gov/api/xbrl/companyfacts/CIK{10 位}.json`，`User-Agent: $EDGAR_USER_AGENT`（缺省 `DEFAULT_USER_AGENT`）、`Accept-Encoding: gzip, deflate`；间隔 ≥ 120 ms；超时 `min(60 s, remaining − 20 s)`；`429/503` 退避 1→2→4→8 s，预算不足即停；`404` → `no_companyfacts`；> 50 MB → `snapshot_too_large`。
- **数值解码**（审计 N8、R3-7）：`scanJsonNumbers(bytes)` 把字符串外的数字字面量标记后 `JSON.parse` 为 `{__num: '<原文>'}`；随后按**来源字段模式**解码：控制字段（companyfacts：`cik`、`fy`；Tushare：`code`、`has_more`、`report_type`、`comp_type`、`is_calc`、`update_flag` 等）→ JS number；财务值字段（`val`、三表数值列）→ `canonicalDecimal(原文)`（去指数、去尾零、`-0`→`0`）字符串；模式外的数字字段 → number。相等比较用规范形式；入库以字符串插入 `numeric`。单测：20 位整数、`1e5` 与 `100000` 相等、控制字段为 number。
- `parseCompanyFacts(json, {concepts, sinceYear})`：按 §3 选取规则；条目 → 候选；`frame` 只进隔离 payload；`filings.period_end` = 该 accn 下 duration 条目的最大 `end`；`fy/fp` 只进 filing；同 accn 同标签同期多条不同 `val` → `ambiguous_value`；默认 `sinceYear = 当前年 − 10`。

### 6.3 Tushare 三表适配器与巨潮挂接

- `tushareCallRaw(api, params, fields, {limit, offset, budget}) → {bytes, decoded}`：保留原文、`has_more`、`request_id`；token 不进 meta；分页 `limit=2000`、`has_more` 续页，每页一个快照。`limit/offset/has_more` 的实际行为**未核对**（§15），核对前不得宣称完整。
- `api ∈ {income, balancesheet, cashflow}` × `report_type ∈ {1, 4, 5}`；`fields` = 公共字段 + §3 值字段（cashflow 加 `is_calc`，`=1` 跳过）；`start_date = sinceYear0101`。三类型语义（文档原文）：1 最新合并报表；4 本年度公布的上年同期数；5 变更前保留的原数据。各自公告日给 `available_date`；同日不同值 → §5.3 同日冲突。F2-4 第一步核对三类行公告日行为并记入 runbook。
- 候选、filing（`source_ref = '<ts_code>:<end_date>:<report_type>:<公告日>'`，`form_type` 1/5 按月份、4 → `restatement`）同第 3 稿。
- **巨潮挂接 `linkCn`**：`form_type ∈ {annual, semiannual, q1, q3}` 的 filing 查 `hisAnnouncement`（`seDate = available_date ± 3 天`，遍历分页）；候选标题须含报告年份与类型词，且不含 摘要/英文/已取消/补充；`restatement` 与被更正的 filing（同 K 存在 type 5 行者）改为匹配含 **更正** + 年份 + 类型词的标题；恰一条 → 写；零/多 → 不写；`link_attempts + 1`，≥ 5 停止；BJ 不挂接。`citation`：`linked` / `pending` / `edgar`。
- 覆盖摘要 `coverage_summary`（信息码，按 (api, report_type) 统计每年 `distinct end_date`）；配额 → `quota_exhausted`（非信息码）。

### 6.4 范围 `reconcileScope(market)`

幂等；只改 `reasons/priority/fetch_key`，不动调度与租约列；新行 `next_due_at = now()`。美股：三个宇宙活跃 ticker → 有 `cik` 的发行人（`priority 10`）。A 股（**owner 决策 A**）：默认 `research_entity_keys.in_scope and issuer_id is not null` 的发行人当前主 A 股 ticker（`cohort`，`priority 10`）；可改为公开宇宙。自选股（**owner 决策 B**）：默认不进入。消失的行 `priority=0`。

### 6.5 触发

- `GET|POST /api/cron/facts-sync?market=US|CN[&limit=n]`：`CRON_SECRET` Bearer；`maxDuration=300`；`deadline = start + 240 s`；默认 `limit` 25。`vercel.json`：US 每 4 小时（`5 */4 * * *`）；CN **只在 A 股夹具与黄金断言进入 CI 后加入**。悬空 `running` 批次由 runbook SQL 标 `failed`。
- `scripts/facts/sync.ts --market … [--issuer …]... [--limit n] [--since-year y] [--apply]`（无截止）；`scripts/facts/materialize.ts`；`scripts/facts/record-fixture.ts`。

---

## 7. 规则与隔离

### 7.1 隔离

| reason_code | 触发 | natural_key | payload |
|---|---|---|---|
| `ambiguous_value` | §5.3 | `<issuer>:<market>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<source_ref>:<mapping_gen>` | `{candidates}`，无事实行 |
| `odd_duration` | §4.3 | 同上 | `{candidate}`，无事实行 |
| `missing_available_date` | §5.1 | `<issuer>:<ts_code>:<end_date>:<report_type>` | `{row}`，无事实行 |
| `same_day_conflict` | §5.3 | `<issuer>:<market>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>` | `{key, fact_ids（含被置 quarantined 的已发布行）, values:[{filing, value}], run_id}` |
| `identity_bs` | `identityRule('identity_bs', total_assets, liabilities_and_equity, 0.005)`，无则 `identityRule('identity_bs', total_assets, total_liabilities + equity_total, 0.005)`；单位不一致或缺 → 不检 | `<issuer>:<market>:BS:<period_end>:<unit>:<source_ref>:<mapping_gen>` | `{key, fact_ids, rule, detail, run_id}` |
| `identity_gp` | `gross_profit` 存在且 `identityRule('identity_gp', gross_profit, revenue − cost_of_revenue, 0.005)` 失败 | `<issuer>:<market>:IS:<period_start>:<period_end>:<unit>:<source_ref>:<mapping_gen>` | 同上 |

恒等式失败只隔离本运行新行。同键 open 项唯一由 `dq_quarantine_open_key_uniq` 保证；再次命中同键（例如重跑后新的 fact_ids）→ `quarantine()` 返回旧项的 id，随后 `quarantine_facts(run, ids, item_id)` 在锁内把新 `fact_ids` **并入**旧项 `payload.fact_ids`（不经 `TableClient.update`）。

### 7.2 警告

`rangeRule('gross_margin_range', …)`、`jumpRule('revenue_jump', …, 10)` 不隔离；整批每条规则一个 `rule_warning_summary` 条目；加入 `INFO_CODES`。

### 7.3 处理钩子

`src/lib/dq/facts-resolver.ts`（只做 facts）：
- `resolved_accept`：
  - `same_day_conflict`：POST 体可带 `chosen_fact_ids`（必须是 payload 内的子集，且所选行的值全部相同）；`resolve_facts_quarantine(item, chosen ?? [])` 在一把锁内持久化裁决（`detail.chosen_fact_ids`，`promote_quarantined` 对该组所有成员永久遵守，审计 R4-4）并提升；无 `chosen_fact_ids` 则仅确认知晓（`[]`，组内任何行此后都不能被其他项提升）。
  - `identity_*`：`resolve_facts_quarantine(item, payload.fact_ids)`（资格规则：运行已发布、代已激活、无争议、不违反已裁决、不被其他 open 项引用、仍存在）。
  - 无事实行的三种：确认知晓（函数只做 `run_pending` 检查与记录）。
  - 随后 `materialize(issuer, market)`。
- `resolved_reject`：不动。
- `POST /api/admin/dq/quarantine/[id]` 对 `facts.*` 项的接受**完全由** `resolve_facts_quarantine(item, chosen, resolved_by)`（§4.5）完成：函数在行锁内检查项内**全部**现存行所属的运行（不只是创建项的运行），任一仍 `staged` → 抛 `run_pending`，路由返回 409，项保持 `open`（审计 R5-3、R6-1）；否则函数原子地翻转项状态、持久化裁决并提升（审计 R7-1）。路由不再自己翻转 `facts.*` 项的状态；`resolved_reject` 仍走计划一的通用翻转。运行被废弃后项内指向已删行的 id 忽略。
- 函数成功后路由执行 `materialize(issuer, market)` 并写 `dq_quarantine.detail.hook = {stage: 'materialize'|'done', state: 'done'|'failed', at, message?}`；对 `resolved_accept` 项再次 POST：`hook.state='failed'` 时重跑物化（幂等），返回 `{resolved:'already_resolved', hook}`；审计日志记录。

---

## 8. 派生层 `src/lib/facts/derive.ts`

`FORMULA_VERSION='facts-derive/1.0'`。输入 = `readFacts(issuer, market, {concepts: 所需全部, asOf, history: true})`；按 market 选公式与 `basis`；纯函数；输出含 `input_unit`、`basis`、扁平 `inputs`。缺输入、单位不一致、分母为 0、期间匹配不唯一 → 不产出。

精确匹配：同期 = `period_start,period_end` 相等；上年同期 = 同 `duration` 且 `period_end` 在 350–380 天前的唯一事实；相邻 = `next.period_start = prev.period_end + 1 天`；期初 = `period_start − 1 天` 的 instant 事实。

**版本一致性（审计 N14，第 5 稿收紧）**：差分 `A − B`（如 `9M − 6M`）只在两个操作数属于同一报表版本集时产出：(a) `A` 与 `B` 的当前披露来自**同一 filing**；或 (b) `A` 与 `B` 在 `asOf` 下的披露序列都**从未修订**（序列内没有值变化，`is_revision` 全为 false）。其余情形（例如 9M 已修订而 6M 未修订且无同 filing 的 6M 披露）不产出。`inputs` 列出两者与所依据的规则（`a` / `b`）。

| metric | 公式 | duration | basis |
|---|---|---|---|
| gross_margin | US：`gross_profit / revenue`，无 `gross_profit` 则 `(revenue − cost_of_revenue)/revenue`；CN：`(revenue_operating − cost_of_revenue)/revenue_operating` | 同事实 | `us_standard` / `cn_standard` |
| net_margin | `net_income_parent / revenue`（CN 分母 `revenue_operating`） | 同事实 | 同上 |
| fcf | US：`operating_cash_flow − capex`；CN：`operating_cash_flow − capex_incl_intangibles` | 同事实 | `us_standard` / `cn_incl_intangibles` |
| borrowings_total | US：`short + long`；CN：`st_borr + lt_borr + bonds_payable` | INSTANT | `us_standard` / `cn_incl_bonds` |
| q_single_<c> | 有 `3M` 事实直接用；否则 `6M − 3M`、`9M − 6M`、`12M − 9M`（同 `period_start`；季度 `period_start = 减数.period_end + 1 天`；版本一致性如上） | 3M | 概念 revenue、net_income_parent、operating_income、operating_cash_flow、capex / capex_incl_intangibles |
| ttm_<c> | 四个相邻单季之和 | TTM | |
| revenue_yoy / net_income_yoy | `(本期 − 上年同期)/abs(上年同期)` | 同事实 | |
| roe | `ttm_net_income_parent / avg(equity_parent@窗口起点−1 天, equity_parent@窗口期末)` | TTM | |

`materialize(issuer, market)`：`as_of=今天`，`readFacts` 信封（`truncated` → 拒绝物化，`read_truncated`）→ 算全部行 → `replaceMetrics(issuer, market, stateRev, rows)`；`stale_computation` → 重读重算一次。重建测试比较除 `computed_at` 外的全部列。

---

## 9. 读取接口

共同约定：公共只读（anon 客户端，`read_facts` 以 `security invoker` 受 RLS 约束）；`force-dynamic`；参数重复 → 400；ticker 同正则；`resolveIssuer({ticker},{today})` → 无 → 404 `unknown_ticker`；`market` 由 ticker 后缀决定（`.SH/.SZ/.BJ` → CN，否则 US）；`asOf` 为 `YYYY-MM-DD` 且 ≤ 今天；错误与空结果 `no-store`；成功：有 `asOf` 且早于今天 → `public, max-age=600, s-maxage=3600`（容忍度），否则 `successCacheControl(now)`。响应顶层 `mappingGen` = 当前代；每行带自己的 `mappingGen`；`truncated` 透传。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/facts/[ticker]` | `concepts`（必填，白名单）或 `factIds`（≤ 100，证据查询，不限代、只限 `ok`）、`from`/`to`、`asOf`、`durations`、`history=1`、`limit`（K 数，默认 200、最大 1000） | `{issuerId, ticker, market, asOf, mappingGen, truncated, facts:[{factId, concept, sourceConcept, statement, periodStart, periodEnd, duration, value: value_text, unit, availableDate, filingId, disclosureSeq, isCurrent, isRevision, mappingGen, rawHash}], filings:[{filingId, formType, periodEnd, availableDate, sourceRef, url, documentRef, documentUrl, citation}]}` |
| `GET /api/facts/[ticker]/metrics` | `metrics`、`from`/`to`、`asOf`、`limit` | `{…, formulaVersion, metrics:[{metric, periodStart, periodEnd, duration, value, unit, inputUnit, basis, inputs, basedOnRev}]}`；无 `asOf` 读表（过滤当前 `formula_version`），有则实时 derive |
| `GET /api/filings/[ticker]` | `from`/`to`（`available_date`）、`limit` | `{issuerId, ticker, market, filings:[…]}` |
| `GET|POST /api/cron/facts-sync` | §6.5 | 批次回执 |

`/api/financials/[ticker]` 加 `Deprecation: true` 与 `Link: </api/facts/{ticker}>; rel="successor-version"`。

---

## 10. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| SEC 429/503 重试耗尽或预算不足 | 废弃运行 | `sec_unavailable` | partial |
| SEC 404 | 同上 | `no_companyfacts` | partial |
| 快照上传失败 | 废弃运行 | `snapshot_upload_failed` | partial |
| Tushare 配额/限频 | 剩余发行人跳过 | `quota_exhausted` | partial / failed |
| Tushare 空响应 | 发布空运行（manifest 为空） | `skipped_summary(no_rows)` | — |
| 覆盖不足 | 照常 | `coverage_summary` | — |
| 租约被占 / 丢失 | 跳过 / failed | `skipped_summary(leased)` / `lease_lost` | — / partial |
| 映射代回退 | 废弃运行，failed | `mapping_gen_regression` | partial |
| 读取被截断（> 10,000 行） | 废弃运行 / 拒绝物化 | `read_truncated` | partial |
| 派生过期 | 重算一次，再失败记错 | `stale_computation` | partial |
| 发行人 `merged` | 跳过 | `skipped_summary(issuer_merged)` | — |
| 解析异常 | 废弃运行，failed（含字段名不含值） | `parse_error` | partial |
| 截止 | 不再开始新发行人；进行中的运行若有时间则废弃 | `deadline_hit`（信息） | — |
| 空转 | 心跳 ok | `detail.idle=true` | success |
| `fetched>0` 无结果 | `unaccounted` | — | failed |
| 读接口 | 404 `unknown_ticker` / 400 `invalid_parameter:<name>` | | |

---

## 11. 测试策略

### 11.1 单元（`memoryFactsDb`）

`concepts`、`units`、`json-numbers`（扫描 + 模式解码 + 规范形式相等）、`edgar-companyfacts`（AAPL/MSFT/其余黄金美股/IFRS 若有；真实响应裁剪，录制脚本记录 sha256）、`tushare-statements`（600519.SH、000333.SZ、600036.SH、一家有 type 5 的修订对；分页、同日冲突）、`cninfo-link`（年份+类型词、更正、排除、零/一/多）、`plan`（重复、冲突、计数）、`rules`、`read`（在内存实现上复刻 `read_facts` 语义：代过滤、序列、`is_revision`）、`derive`（精确匹配、版本一致性、10-Q 现金流差分、TTM、basis、lineage）、属性测试（种子随机 200 次：YTD 差分再累加；迟到插入不改顺序；同日冲突与到达顺序无关）、`sync`（租约、运行生命周期、截止、废弃、发布、`mapping_gen_regression`、`stale_computation`、空转、`code_version`）、路由（参数、缓存、`factIds`、`citation`、`truncated`、钩子阶段重试、`chosen_fact_ids`）。

### 11.2 数据库（`test:db`，critical）

`src/lib/facts/facts.integration.test.ts`：迁移可重放；唯一约束与两条复合外键；触发器；**每个函数**（租约互斥/过期/续租、`lease_lost` 在并发事务下、`begin_sync_run`/`abandon_sync_run` 先标后删且保留已发布运行的 quarantined 行、`abandon` 拒绝已发布运行、`publish_sync_run` 原子性 + 争议组处置（含"登记—废弃—重试—发布"序列后原 `ok` 行被处置）+ `mapping_gen_regression` + `state_rev` 递增、废弃运行不影响已发布行、`fact_state_rev` 对 anon 可用而 `fact_sync_scope` 不可读、`resolve_facts_quarantine` 在任一成员行的运行仍 staged 时抛 `run_pending`（含"登记—废弃—重试并入—发布前裁决"序列被拒）、`promote_quarantined` 的全部资格规则（未发布运行的行不提升；争议中不提升；已裁决只提升 chosen）、接受一个已发布的同日争议项后被选行真正可见且物化包含它（R7-1 回归）、`quarantine_facts` 并入成员与并发发布串行、`replace_financial_metrics` 的 `stale_computation` 在"发布—提升—物化"交错下、`read_facts` 信封在 1,001 行与 10,001 行下的 `truncated`、`reconcile_fact_sync_scope` 不动租约与调度列）；真实角色权限（anon/authenticated/service_role 都不能直接写事实表与 `filings.mapping_gen`；service_role 只能改三列链接；anon 能执行 `read_facts` 且只见 `ok`；anon 不能执行写函数）；`value_text` 与 20 位整数一致。

### 11.3 离线集成（critical）

`sync-us.integration.test.ts`：美股夹具两遍（第二遍全 duplicates）；更晚 filing 修订夹具 → `versioned=1`、`asOf` 两侧回放；映射升级（`MAPPING_GEN+1`）重跑后旧代行不可见、`factIds` 仍可查；并发两个 `runFactsSync` 争同一发行人（pg 实现）；`materialize` 两次一致、过期计算被拒；美股黄金断言。`sync-cn.integration.test.ts`：只在 A 股夹具录入后创建；同上 + 修订对 + 同日冲突 + 巨潮挂接 + A 股黄金断言。

### 11.4 黄金断言

`fixtures/gold/plan2.json`：6 家 × 2 期 × 6 科目，人从一手文件抄录（含页码）；每个被断言的发行人都有采集夹具。

### 11.5 清单规则

含 `S4_TEST_STATE` 的文件都进 `criticalSuites`；全部门禁绿才算完成。

---

## 12. 分期

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| F2-0 迁移、函数、契约 | 迁移（五表、桶、全部函数、触发器、权限）、锁文件、types、`FactsDb` 三实现、§11.2 | `test:db`、`test:migrations` 绿 |
| F2-1 概念、单位、数值、规划、规则、读取 | `concepts/units/json-numbers/plan/rules/read.ts`、`INFO_CODES` 三码、`mergeQuarantinePayload` | 单测绿 |
| F2-2 快照与同步核心 | `snapshot-store.ts`、`sync.ts`、`facts-resolver.ts` 与路由接入（`chosen_fact_ids`、阶段重试） | `sync.test.ts` 绿 |
| F2-3 EDGAR | 适配器、录制脚本、美股夹具、`sync-us.integration` | 绿 |
| F2-4 Tushare + 巨潮 | `tushareCallRaw`、适配器、`cninfo-link.ts`、夹具（需 token）、核对记录、`sync-cn.integration` | token 可得：绿；否则只交付单测与"未核对"记录，CN cron 不开 |
| F2-5 范围、脚本、cron | `scope.ts`、脚本、`/api/cron/facts-sync`（US）、`vercel.json` | 真实 SEC dry-run 3 家；回执落库 |
| F2-6 派生与读接口 | `derive.ts`、三个路由、弃用头 | 美股黄金断言绿；重算一致 |
| F2-7 文档收尾 | runbook、规格一指向、§16 | 全量门禁绿 |

工作量：F2-0 3 人日（函数与并发测试）；F2-1 2；F2-2 2.5；F2-3 2；F2-4 3；F2-5 2；F2-6 2；F2-7 1。合计约 17.5 人日。

验收样例：
1. `asOf=2024-06-30` 的 AAPL revenue → 2023-11-03 行 `disclosureSeq=1`；`asOf=2025-06-30` → `disclosureSeq=2`、`isRevision=false`。
2. A 股修订对：`asOf` 早于更正日取调整前值；年报 `citation='linked'`。
3. 同日冲突：两份文件以任意顺序到达，结果相同（该日无 `ok` 值）；第三份同日文件进入同一争议组；带冲突处置的运行被废弃时已发布值不变；管理员 `chosen_fact_ids` 选定一行后可见，未选行此后不能被其他隔离项提升。
4. 隔离 `identity_bs` → 接受 → 可见且指标重算；重复 POST 幂等；物化失败后重试从 `materialize` 阶段继续。
5. 两个工作者争同一发行人：后者 `leased`；前者超时后任何写抛 `lease_lost`，其 staged 运行被新持有者废弃，已发布运行的 quarantined 行保留。
6. 映射升级重跑：旧代行不再出现在当前值中，`factIds` 仍可取证。
7. 断网：批次 failed，旧数据不变。

---

## 13. 独立验证

Codex 七轮（01/03/05/07/09/11/13）与处置（04/06/08/10/12/14）；独立 Claude 复审（02）；黄金断言由实施者之外的人抄录；SEC dry-run 3 家；Tushare 核对（token 环境）；会计口径复核（§3 七处分列）。

---

## 14. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 A**：A 股范围 = in_scope 队列（公开事实可反推队列）还是公开宇宙 | owner | 计划前；默认队列 |
| **决策 B**：自选股是否进入范围 | owner | 默认不进入 |
| **决策 C**：A 股事实在计划三逐值核对前是否公共可见（默认可见并带 `citation`；严格选择：CN 行不发布为 `ok`，留 `quarantined` 直到核对） | owner | 计划前 |
| `TUSHARE_TOKEN`（仓库外 env） | owner | F2-4 前 |
| Vercel `EDGAR_USER_AGENT`、确认 `TUSHARE_TOKEN`、`CRON_SECRET` | owner | 部署前 |
| 生产迁移；首轮 `sync.ts --market US --limit 20 --apply`；cron 与脚本不同时运行 | owner | 合并后 |
| 黄金集抄录 | owner / 审核人 | F2-6 前 |

---

## 15. 开放问题（实施前核对）

1. Tushare type 1 被更正后公告日是否变化；type 5 公告日；同日并存；`limit/offset/has_more`。
2. companyfacts 多类别股本 `dei` 条目形态。
3. 6-K 申报人的 companyfacts 覆盖。
4. SEC `acceptanceDateTime`（计划三）。
5. 合并后发行人的事实归属（计划三）。
6. `financial_history`（公司研究规格）。
7. 被隔离候选（无事实行的三种）的人工选定路径。

---

## 16. 实施记录与偏差

（计划二落地后补记。）
