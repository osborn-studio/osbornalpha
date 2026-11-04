# 数据底座二 · F2 披露事实库 设计规格

日期：2026-11-04
状态：草案，待 owner 评审
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§4、§8–§10 的 F2 部分。本规格**取代**规格一 §4 的全部文字；规格一 §14 记录的计划一偏差在此视为既定事实。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格逐条对照其硬约束：只用一手来源（EDGAR、交易所定期报告；Tushare 仅作适配器并记录上游）、每个数字可回放（源文件哈希、行定位、`available_at`、变换、代码版本）、事实与判断分离（本规格只有事实与可重建的派生，不含任何评分）、缺失保持缺失（不做代理指标、不填占位）。
已定决策（owner 2026-11-04）：美股事实来源 EDGAR companyfacts；A 股事实来源 Tushare 三表 + 公告日期字段；港股延后到 F3；本规格不含任何页面（页面由公司研究规格用 Claude Design 设计）。

---

## 1. 目标与非目标

### 1.1 目标

1. **时点事实。** `financial_facts` 存"当时披露的值"，每个值带 `available_at`、来源文件哈希、原始标签、版本序号；重述不覆盖，只追加。任意 `asOf` 都能回放当时可见的报表。
2. **两个市场、一个写入路径。** EDGAR companyfacts（美股及在美上市中概股）与 Tushare 三表（A 股）经同一套"快照入桶 → 规则 → 计划 → 幂等写 → 回执 → 新鲜度"流程写入，复用计划一的 `ingest_batches`、`dq_quarantine`、`dq_freshness`、`TableClient`。
3. **派生可重建。** 毛利率、ROE、FCF、同比、单季差分、TTM 由 `derive.ts` 按 `formula_version` 从事实计算；物化到 `financial_metrics` 的行记录输入 fact id，删表重算结果逐行一致。
4. **公共只读接口。** 三个读接口（事实、派生、披露文件）按 ticker 查询，内部先解析为发行人；一个 cron 接口与一个本机脚本共用同一核心。

成功标准（计划二退出条件）：
- `security_universe_memberships` 的 sp500 / nasdaq_top500 / us_china 三个宇宙内每个有 CIK 的发行人，最近 8 个财期（含年报与季报）的 24 个概念已入库；`asOf=2024-06-30` 回放 AAPL FY2023 revenue 得到 2023-11-03 10-K 披露值，而不是 FY2024 10-K 中的同期值。
- `research_entity_keys.in_scope=true` 且已挂 `issuer_id` 的 A 股发行人，10 年三表已入库；一家有 `update_flag='1'` 或 `report_type=4` 重述记录的公司，两个版本并存，`vintage_seq` 1/2，`supersedes` 正确；`asOf` 早于重述公告日取版本 1。
- 黄金断言（§11.4）全部通过：6 家公司 × 2 期 × 6 个科目与一手文件逐值相等。
- 删除 `financial_metrics` 后重算，与删除前逐行一致。
- 断网运行同步：批次 `failed`，旧数据不变，新鲜度 `error`。

### 1.2 本规格之外

- 港股事实（F3）。
- 跨来源对账运行器（`dq_reconciliations` 写入者）、财报日历新鲜度、30 家黄金集：计划三（规格一 §5.2、WP-F5）。本规格只交付 6 家黄金断言作为单测。
- ISIN / FIGI / A+H 配对：计划三。
- 母公司报表（Tushare `report_type=6`）、单季披露表（`report_type=2`）：不加载；`consolidation` 列保留 `'parent'` 枚举值但本期只写 `'consolidated'`。
- 任何页面与 `/admin/dq` 的改动，除 §7.3 一处处理钩子外。
- 删除现有 `/api/financials/[ticker]`：它有五个读者（`consensus`、`dcf` 两个路由、`agent/tools.ts`、`hooks/useQuote.ts`、`dcf/assemble.ts`），本规格只加 `Deprecation` 头，迁移读者属于公司研究规格。

---

## 2. 现状（2026-11-04，计划一落地后）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 发行人 | `issuers(issuer_id, cik, lei, usci, …, status)`；`issuer_securities(ticker, valid_from, valid_to, is_primary)` 带区间互斥约束；`resolveIssuer(client, {ticker\|cik\|…}, {today})` 支持生效日期与一跳合并重定向（`src/lib/entities/resolve.ts`） | 事实只挂 `issuer_id`；读接口按 `asOf` 解析 ticker → issuer；美股抓取用 `issuers.cik` |
| 研究实体 | `research_entity_keys.issuer_id`（计划一挂接脚本写入）、`in_scope`、`cohort` | A 股范围来源 |
| 证券 | `stocks_universe.ticker`（A 股形如 `600519.SH`，与 Tushare `ts_code` 同形；`normalizeTushareTicker` 在 `src/lib/data/sources/tushare.ts`）；`security_universe_memberships(ticker, universe, is_active)` | 美股范围来源；A 股 ts_code 来源 |
| 质量设施 | `startBatch/finishBatch/batchStatusFromCounts`（六个计数器；`INFO_CODES=['skipped_summary','relink']` 不降级；`rejected_summary` 降级）、`quarantine()`（同键 open 项唯一，23505 收敛）、`recordAttempt/freshnessOf`、`rules.ts`（`rangeRule/identityRule/jumpRule/unitRule` 不抛异常） | 全部复用；新增一个信息码 `rule_warning`（§7.2） |
| 隔离处理 | `POST /api/admin/dq/quarantine/[id]` 只翻转状态并写 `research_audit_log`，不回写业务表 | 增加按数据集的处理钩子（§7.3） |
| 数据库访问 | `TableClient`（Supabase / memory / pg 三实现；`selectAll` 分页；无事务） | 写入靠唯一约束收敛，不依赖事务（§5.4） |
| 财务数据 | `financial_history` 表存在、为空、无写入者；`/api/stocks/[ticker]` 只有 TODO；`/api/financials/[ticker]` 实时拉 Tushare 年报行（`report_type:1`，不取公告日期），`tushare-cached.ts` 用 `unstable_cache` 7 天 | 表改视图（§4.5）；路由加弃用头 |
| EDGAR 访问 | `src/lib/research/ingest/collectors/shared.ts::createClient` 已实现 User-Agent（`EDGAR_USER_AGENT`，默认含联系邮箱）与最小间隔 | companyfacts 适配器复用其 pace 逻辑（抽成可复用函数或直接 import） |
| 存储 | 私有桶 `security-snapshots`（迁移里 `insert into storage.buckets … on conflict`；本地 harness 只有 `storage.buckets` 五列，不能引用 `storage.objects`） | 同法新建 `disclosure-raw` |
| cron | `vercel.json` crons + `CRON_SECRET` Bearer + `timingSafeEqual`（`src/app/api/cron/securities-sync/route.ts`）；`maxDuration=300` | 同法新增 `facts-sync` |
| 环境 | 本机 `.env.local` **没有** `TUSHARE_TOKEN` 与 `EDGAR_USER_AGENT`；生产 Vercel 有 `TUSHARE_TOKEN` | Tushare 夹具录制需 owner 提供 token（§14） |
| 迁移 | 最新已锁 `20261105091000_issuers.sql`；新迁移时间戳必须更晚；`database.types.ts` 手工维护 | 新迁移 `20261106090000_financial_facts.sql` |

---

## 3. 概念目录 `src/lib/facts/concepts.ts`

`FACT_CONCEPTS` 导出 25 个概念，`MAPPING_VERSION='facts-map/1.0'`。每个概念：`id`、`statement`（IS/BS/CF/DEI）、`nature`（duration/instant）、`unitKind`（money/shares/per_share）、`usGaap: string[]`（回退顺序）、`ifrs: string[]`（回退顺序，可空）、`tushare: {api, field} | {api, sum: string[]} | null`、`notes`。回退规则：**按顺序取第一个在该 filing 中出现的标签**，被选标签写入 `source_concept`；两个标签在同一 filing 同一期都出现且值不同 → 不写，隔离 `ambiguous_tag`（§7.1）。

| concept | 表 | 性质 | us-gaap 回退顺序 | ifrs-full | Tushare |
|---|---|---|---|---|---|
| revenue | IS | duration | Revenues → RevenueFromContractWithCustomerExcludingAssessedTax → SalesRevenueNet → RevenueFromContractWithCustomerIncludingAssessedTax | Revenue | income.total_revenue（营业总收入） |
| revenue_operating | IS | duration | —（美股不写） | — | income.revenue（营业收入） |
| cost_of_revenue | IS | duration | CostOfRevenue → CostOfGoodsAndServicesSold → CostOfGoodsSold | CostOfSales | income.oper_cost |
| gross_profit | IS | duration | GrossProfit | GrossProfit | —（A 股不写，派生） |
| operating_income | IS | duration | OperatingIncomeLoss | ProfitLossFromOperatingActivities | income.operate_profit |
| net_income | IS | duration | NetIncomeLoss → ProfitLoss | ProfitLoss | income.n_income |
| net_income_parent | IS | duration | NetIncomeLoss（us-gaap 的 NetIncomeLoss 定义即归属母公司股东的净利润，`notes` 说明；因此美股 `net_income` 与 `net_income_parent` 可能是同一标签的两条事实，`source_concept` 相同） | ProfitLossAttributableToOwnersOfParent | income.n_income_attr_p |
| eps_basic | IS | duration | EarningsPerShareBasic | BasicEarningsLossPerShare | income.basic_eps |
| eps_diluted | IS | duration | EarningsPerShareDiluted | DilutedEarningsLossPerShare | income.diluted_eps |
| rd_expense | IS | duration | ResearchAndDevelopmentExpense → ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost | ResearchAndDevelopmentExpense | income.rd_exp |
| sga_expense | IS | duration | SellingGeneralAndAdministrativeExpense | SellingGeneralAndAdministrativeExpense | sum(income.sell_exp, income.admin_exp) |
| interest_expense | IS | duration | InterestExpense → InterestExpenseDebt | InterestExpense | income.fin_exp_int_exp → income.int_exp（银行；两个字段名在录制夹具时核对） |
| income_tax | IS | duration | IncomeTaxExpenseBenefit | IncomeTaxExpenseContinuingOperations | income.income_tax |
| total_assets | BS | instant | Assets | Assets | balancesheet.total_assets |
| total_liabilities | BS | instant | Liabilities | Liabilities | balancesheet.total_liab |
| liabilities_and_equity | BS | instant | LiabilitiesAndStockholdersEquity | EquityAndLiabilities | —（A 股用 total_assets 代入恒等式） |
| equity_parent | BS | instant | StockholdersEquity | EquityAttributableToOwnersOfParent | balancesheet.total_hldr_eqy_exc_min_int |
| equity_total | BS | instant | StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest → StockholdersEquity | Equity | balancesheet.total_hldr_eqy_inc_min_int |
| cash | BS | instant | CashAndCashEquivalentsAtCarryingValue → CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents | CashAndCashEquivalents | balancesheet.money_cap |
| short_term_debt | BS | instant | ShortTermBorrowings → DebtCurrent | ShorttermBorrowings | sum(balancesheet.st_borr) |
| long_term_debt | BS | instant | LongTermDebtNoncurrent → LongTermDebt | LongtermBorrowings | sum(balancesheet.lt_borr, balancesheet.bond_payable) |
| shares_outstanding | BS/DEI | instant | CommonStockSharesOutstanding → dei:EntityCommonStockSharesOutstanding（后者 `period_end` 是封面日期，`notes` 标 `cover_date`） | NumberOfSharesOutstanding | balancesheet.total_share |
| operating_cash_flow | CF | duration | NetCashProvidedByUsedInOperatingActivities → NetCashProvidedByUsedInOperatingActivitiesContinuingOperations | CashFlowsFromUsedInOperatingActivities | cashflow.n_cashflow_act |
| investing_cash_flow | CF | duration | NetCashProvidedByUsedInInvestingActivities | CashFlowsFromUsedInInvestingActivities | cashflow.n_cashflow_inv_act |
| financing_cash_flow | CF | duration | NetCashProvidedByUsedInFinancingActivities | CashFlowsFromUsedInFinancingActivities | cashflow.n_cash_flows_fnc_act |
| capex | CF | duration | PaymentsToAcquirePropertyPlantAndEquipment → PaymentsToAcquireProductiveAssets | PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities | cashflow.c_pay_acq_const_fiolta |
| dividends_paid | CF | duration | PaymentsOfDividends → PaymentsOfDividendsCommonStock | DividendsPaidClassifiedAsFinancingActivities | cashflow.c_pay_dist_dpcp_int_exp（A 股口径含利息，`notes` 标 `includes_interest`） |

与规格一 §4.1 的差异：`total_debt` 拆成 `short_term_debt` 与 `long_term_debt` 两个事实（组合值由派生层算，事实表不存组合）；新增 `liabilities_and_equity`（美股资产负债恒等式的对手项，因为很多申报人不标 `Liabilities`）；`revenue_operating` 单列为概念；`shares_outstanding` 先取资产负债表期末股数再取封面股数。

单位归一（`src/lib/facts/units.ts`）：companyfacts 的 `USD`→`USD`、`shares`→`shares`、`USD/shares`→`USD/share`、`pure`→`pure`，其他货币代码原样保留（20-F 申报人可能是 `CNY`、`HKD`、`EUR`）；Tushare 金额字段单位元 → `CNY`，`basic_eps/diluted_eps` → `CNY/share`，`total_share` → `shares`（**实施时必须用一家已知公司核对 `balancesheet.total_share` 是"股"还是"万股"**，核对值记入 §11.4 黄金断言；核对前不得上线 A 股 `shares_outstanding`）。`unitRule` 允许集合按 `unitKind`：money 允许 ISO 4217 三字母码，shares 只允许 `shares`，per_share 只允许 `<货币>/share`。

---

## 4. 数据模型

迁移 `supabase/migrations/20261106090000_financial_facts.sql`，可重放（`create table if not exists`、`drop policy if exists`、`create or replace function`、`insert … on conflict`）。写入时补 `migrations.lock.json`；`database.types.ts` 手工补 `Filing`、`FinancialFact`、`FinancialMetric`、`FactSyncScope` 四个 Row 类型，`FinancialHistory` 类型不变。

### 4.1 `filings` —— 一份披露文件

```
filing_id      uuid primary key
issuer_id      uuid not null references issuers(issuer_id) on delete restrict
market         text not null check (market in ('US','CN'))
source         text not null check (source in ('edgar','tushare'))
origin         text not null check (origin in ('sec','sse','szse','bse'))
form_type      text not null check (form_type in ('10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','annual','semiannual','q1','q3','restatement','other'))
fiscal_year    int not null
fiscal_period  text not null check (fiscal_period in ('FY','Q1','Q2','Q3','H1','9M'))
period_end     date not null
available_at   timestamptz not null
source_ref     text not null                 -- EDGAR: accession no.（带连字符）；Tushare: '<ts_code>:<f_ann_date>'
url            text                           -- EDGAR 归档 index 页；Tushare 为 null（巨潮 URL 由计划三对账补）
raw_hash       text not null                  -- 生成本行的快照 sha256（§4.6 路径可由此推出）
batch_id       uuid not null references ingest_batches(batch_id) on delete restrict
created_at     timestamptz not null default now()
unique (source, source_ref)
index (issuer_id, period_end desc)
index (issuer_id, available_at desc)
```

`available_at` 规则（规则本身属于 `MAPPING_VERSION`，改规则必须升版本；不另存 provenance 列）：
- EDGAR：`filed` 日期 17:30 America/New_York（SEC 当日公开发布截止时刻）。
- Tushare：`f_ann_date ?? ann_date` 当日 09:00 Asia/Shanghai。两个都缺 → 该行隔离 `missing_available_at`。

### 4.2 `financial_facts` —— 一个披露值（追加写）

```
fact_id        bigint generated always as identity primary key
issuer_id      uuid not null references issuers(issuer_id) on delete restrict
concept        text not null                              -- FACT_CONCEPTS.id（check：长度 1..64）
source_concept text not null                              -- 'us-gaap:Revenues' / 'ifrs-full:Revenue' / 'dei:…' / 'tushare:income.total_revenue' / 'tushare:sum(income.sell_exp,income.admin_exp)'
statement      text not null check (statement in ('IS','BS','CF','DEI'))
period_start   date                                        -- instant 事实为 null
period_end     date not null
fiscal_year    int not null                                -- = extract(year from period_end)，派生标签
fiscal_period  text not null check (fiscal_period in ('FY','Q1','Q2','Q3','Q4','H1','9M','INSTANT'))
value          numeric not null
unit           text not null check (length(unit) between 1 and 16)
consolidation  text not null default 'consolidated' check (consolidation in ('consolidated','parent'))
filing_id      uuid not null references filings(filing_id) on delete restrict
available_at   timestamptz not null                        -- 冗余自 filings，便于索引与回放查询
vintage_seq    int not null check (vintage_seq >= 1)
supersedes     bigint references financial_facts(fact_id)  -- vintage_seq>1 时必填（check）
is_restatement boolean not null                            -- = vintage_seq > 1（check）
mapping_version text not null
status         text not null default 'ok' check (status in ('ok','quarantined'))
batch_id       uuid not null references ingest_batches(batch_id) on delete restrict
raw_hash       text not null
created_at     timestamptz not null default now()
constraint financial_facts_period check (period_start is null or period_start < period_end)
constraint financial_facts_instant check ((period_start is null) = (fiscal_period = 'INSTANT'))
unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, filing_id)
unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, vintage_seq)
index (issuer_id, concept, period_end, available_at desc)
index (filing_id)
index (batch_id)
```

- `unique nulls not distinct` 需要 PostgreSQL ≥ 15：本地 harness 与 Supabase 托管实例 `stock-monitor` 都是 17（2026-10 记录），可用。
- 追加写：触发器 `financial_facts_append_only` 禁止 `delete`，`update` 只允许改 `status`（其余列任一变化抛 `23514`，消息以 `append_only` 开头，与计划一触发器约定一致）。
- 自然键 = `(issuer_id, concept, period_start, period_end, consolidation)`，一个键有多个版本；"同一 filing 对同一键只能给一个值"由第一条唯一约束保证；`vintage_seq` 由第二条唯一约束保证不重号。
- `fiscal_period` 取值规则：instant 事实恒为 `INSTANT`；duration 事实按 `period_end − period_start` 天数分类：75–105 天 → 单季（`Q1/Q2/Q3/Q4` 按 `period_end` 相对发行人财年末的季序；美股 10-K 不含 Q4 单季，Q4 由派生层差分得到，**事实表只在源数据本身给出单季时写 Q4**），165–200 → `H1`，255–290 → `9M`，350–380 → `FY`，其余 → 隔离 `odd_duration`。
- `fiscal_year = year(period_end)`：只是标签，键永远是 `period_end`。companyfacts 条目自带的 `fy/fp` 描述的是**所在 filing** 的财年财期而不是该值的，**不得**用作本行的 `fiscal_year/fiscal_period`；它们进 `filings.fiscal_year/fiscal_period`。

### 4.3 `financial_metrics` —— 派生物化（可重建）

```
issuer_id       uuid not null references issuers(issuer_id) on delete restrict
metric          text not null
period_start    date
period_end      date not null
fiscal_period   text not null
value           numeric not null
unit            text not null                 -- 'ratio' | 'CNY' | 'USD' | …
formula_version text not null
inputs          jsonb not null                -- [{fact_id, concept, vintage_seq}]（check：array）
as_of           timestamptz not null          -- 计算时假定的可见时点；日常物化为 now()
computed_at     timestamptz not null default now()
primary key (issuer_id, metric, period_end, fiscal_period, formula_version) -- nulls: period_start 不在主键，metric+fiscal_period 已决定它
index (issuer_id, metric, period_end desc)
```

物化只是缓存：`as_of=now()` 的最新可见值。带 `asOf` 的读请求**不读**此表，走 `derive.ts` 实时计算（§8）。

### 4.4 `fact_sync_scope` —— 范围与轮转

```
issuer_id     uuid primary key references issuers(issuer_id) on delete cascade
market        text not null check (market in ('US','CN'))
reasons       jsonb not null default '[]'   -- ['universe:sp500','universe:us_china','watchlist','cohort']（check：array）
priority      int not null default 0        -- universe 10 / cohort 10 / watchlist 5；取最大
fetch_key     text not null                 -- US: 10 位 CIK；CN: ts_code
last_sync_at  timestamptz
last_batch_id uuid references ingest_batches(batch_id) on delete set null
last_status   text check (last_status in ('success','partial','failed'))
updated_at    timestamptz not null default now()
index (market, last_sync_at nulls first, priority desc)
```

仅 service role。`reasons` 里的 `watchlist` 不带用户 id。

### 4.5 `financial_history` 表 → 视图

```sql
drop table if exists public.financial_history;
create or replace view public.financial_history with (security_invoker = true) as
select s.ticker, f.fiscal_year, 'annual'::text as period,
       max(f.value) filter (where f.concept = 'revenue')        as revenue,
       max(f.value) filter (where f.concept = 'net_income_parent') as net_income,
       max(m.value) filter (where m.metric = 'roe')             as roe,
       max(m.value) filter (where m.metric = 'gross_margin')    as gross_margin,
       max(m.value) filter (where m.metric = 'fcf')             as free_cash_flow,
       max(f.created_at)                                        as updated_at
from public.financial_facts f
join public.issuer_securities s on s.issuer_id = f.issuer_id and s.is_primary and s.valid_to is null
left join public.financial_metrics m on m.issuer_id = f.issuer_id and m.period_end = f.period_end
     and m.fiscal_period in ('FY','TTM') and m.formula_version = '<当前 FORMULA_VERSION>'
where f.fiscal_period = 'FY' and f.status = 'ok'
  and not exists (select 1 from public.financial_facts l
                  where l.issuer_id = f.issuer_id and l.concept = f.concept and l.consolidation = f.consolidation
                    and l.period_start = f.period_start and l.period_end = f.period_end
                    and l.status = 'ok' and l.vintage_seq > f.vintage_seq)
group by s.ticker, f.fiscal_year;
```

视图里的 `formula_version` 字面量随公式升版本一起改（迁移 `create or replace view`）。`roe` 以 `fiscal_period='TTM'`、`period_end` = 财年末的行进入视图（§8）。

列名与 `FinancialHistory` 类型逐一对应；`security_invoker` 使视图受 `financial_facts` 的 RLS 约束。该表当前为空且无写入者，`drop table` 不丢数据（迁移注释写明）。

### 4.6 原始快照桶 `disclosure-raw`

`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('disclosure-raw','disclosure-raw', false, 52428800, array['application/json']) on conflict (id) do update …`（与 `security-snapshots` 同法；companyfacts 大型申报人可超 20 MB，故 50 MB）。

路径**内容寻址**：`{source}/{issuer_id}/{sha256}.json`。`sha256` 为响应体原文（未解析的 UTF-8 字节）的哈希；同一哈希已存在 → 不重传、计 `duplicates`。`filings.raw_hash` 与 `financial_facts.raw_hash` 都指向这里。定位一条事实的原始行：
- EDGAR：快照 `facts[<taxonomy>][<tag>].units[<unit>][]` 中 `accn = filings.source_ref` 且 `end = period_end`（duration 再比 `start`）的条目；`<taxonomy>:<tag>` 即 `source_concept`。
- Tushare：快照是一次 API 调用的响应（`{api, params, fields, data}`），行 = `end_date = period_end` 且 `f_ann_date` 对应 `filings.source_ref` 的那一行；`source_concept` 指出字段名。

上传失败 → 本发行人本批次不写任何 filings/facts，计 `failed`（快照是写入的前置条件）。

### 4.7 权限

- `filings`、`financial_metrics`：`revoke all from public, anon, authenticated`，`grant select to anon, authenticated`，RLS `for select using (true)`。
- `financial_facts`：同上，但策略 `using (status = 'ok')`；`quarantined` 行只有 service role 可见。
- `fact_sync_scope`：仅 service role（RLS 开、无策略，显式 revoke）。
- 视图 `financial_history`：`grant select to anon, authenticated`。
- 写一律 service role（`getAdminSupabase()`）。

---

## 5. 时点与版本语义

### 5.1 可见性

一个值在 `available_at` 之后可见。`getFactsAsOf(issuerId, {concepts, from, to, asOf})`：

```sql
select distinct on (concept, period_start, period_end, consolidation) *
from financial_facts
where issuer_id = $1 and status = 'ok' and concept = any($2)
  and period_end between $3 and $4 and available_at <= $asOf
order by concept, period_start, period_end, consolidation, vintage_seq desc;
```

无 `asOf` 时 `$asOf = now()`。在 `TableClient` 上实现：按 `(issuer_id, concept)` 取 `available_at <= asOf` 的行（`RangeOptions.lt`），内存里按自然键取最大 `vintage_seq`——`vintage_seq` 与 `available_at` 单调一致（§5.2），所以取最大 `vintage_seq` 等价于取最晚可见版本。

### 5.2 版本（`vintage_seq`）

对自然键 K 的全部已存行 `existing(K)`（含 `quarantined`）和本次解析出的候选 `(value, unit, filing, available_at)`：
1. `existing(K)` 中已有**同 filing** 的行 → 本候选无论值是否相同都跳过（同一 filing 不可能给两个值；若值不同那是解析歧义，走 `ambiguous_tag`）。计 `duplicates`。
2. `existing(K)` 中有同值（`numeric` 相等且 `unit` 相等）的行 → 这是后续 filing 重申的同一数字，不写新行；计 `duplicates`。被重申的事实不记录"重申者"（YAGNI；需要时可从 filings 推）。
3. 值不同 → 新版本：`vintage_seq = max(existing.vintage_seq) + 1`，`supersedes = existing 中 vintage_seq 最大的行`，`is_restatement = true`；计 `versioned`。
4. `existing(K)` 为空 → `vintage_seq = 1`，`supersedes = null`，`is_restatement = false`；计 `inserted`。

候选在写入前按 `available_at` 升序处理（一次批内同键多候选时依次应用 1–4），因此 `vintage_seq` 随 `available_at` 单调不减。**例外**：若候选的 `available_at` 早于 `existing(K)` 中最大 `vintage_seq` 行的 `available_at`（迟到的旧版本，例如回填历史时先拿到了新的 10-K），则不写，隔离 `late_vintage`（payload 为候选与冲突行），人工决定是否接受；接受后由 §7.3 钩子不做自动插入，只翻状态，runbook 写明需用脚本 `--issuer … --force-reorder` 重建该键（计划三实现；本期只隔离）。

### 5.3 歧义

同一 filing、同一自然键，解析出多个不同 `(value, unit)`（多标签都命中且值不同，或 companyfacts 中同 `accn+end+start` 出现多条不同 `val`，常见于多类别股本）→ 不写，隔离 `ambiguous_tag`，payload 列出全部候选。单测覆盖。

### 5.4 并发

`TableClient` 无事务。约定：
- 同一发行人同一时间只有一个写者（cron 与脚本都按发行人串行；`fact_sync_scope.last_batch_id` 为 `running` 批次时跳过该发行人并计 `skipped_summary`）。
- 兜底：第二条唯一约束使重号插入失败（23505）；写入器对该发行人**重新读取 existing 并重算一次**，仍失败则该发行人 `failed`。单测用内存客户端模拟一次 23505。

---

## 6. 采集

### 6.1 共用核心 `src/lib/facts/sync.ts`

```ts
export interface SyncIssuerInput { issuerId: string; market: 'US'|'CN'; fetchKey: string; sinceYear?: number }
export interface SyncIssuerResult { counts: BatchCounts; errors: BatchError[]; filings: number; snapshotHashes: string[] }
export async function syncIssuerFacts(deps: SyncDeps, input: SyncIssuerInput): Promise<SyncIssuerResult>
export async function runFactsSync(deps: SyncDeps, opts: { market: 'US'|'CN'; limit: number; issuerIds?: string[]; dryRun: boolean; triggeredBy: TriggeredBy }): Promise<{ batchId: string|null; status: BatchStatus; perIssuer: Record<string, SyncIssuerResult|'skipped'> }>
```

`SyncDeps = { client: TableClient; storage: SnapshotStore; fetchUs: (cik) => Promise<RawSnapshot>; fetchCn: (tsCode) => Promise<RawSnapshot[]>; now: () => Date }`——网络与存储都是注入的，单测与离线集成测试不碰网络。

一次 `runFactsSync` = 一个 `ingest_batches` 行（`producer='facts-sync'`，`dataset='facts.us' | 'facts.cn'`，`tool_versions={mapping: MAPPING_VERSION, rules: RULES_VERSION, tushare_api: 'pro' | sec_api: 'companyfacts'}`，`code_version` = 构建时的 git sha 环境变量 `VERCEL_GIT_COMMIT_SHA ?? 'local'`）。每个发行人：

1. 抓取（注入）→ `RawSnapshot {body: Buffer, sha256, fetchedAt, url, params}`；
2. 上传快照（内容寻址；已存在则跳过）；
3. 解析为候选事实 + 候选 filings（§6.2 / §6.3 的纯函数，单测覆盖）；
4. 规则（§7）：隔离项直接写 `dq_quarantine`（`dataset` 同批次，`table_name='financial_facts'`，`natural_key = '<issuer_id>:<concept>:<period_start>:<period_end>:<consolidation>:<filing source_ref>'`），被隔离的候选**仍写入** `financial_facts` 但 `status='quarantined'`（这样接受时只需翻状态，且 `vintage_seq` 已占位）；
5. 版本计划（§5.2，纯函数 `planFactWrites(existing, candidates)`，单测覆盖）；
6. 写 filings（`unique (source, source_ref)` 冲突 → 读回已有 `filing_id`），再分块（≤ 500 行）插入 facts；
7. 更新 `fact_sync_scope.last_*`。

批次结束：`finishBatch` 汇总六计数器与 errors；`recordAttempt(dataset, {ok: status==='success'|'partial'?…})`——新鲜度：`facts.us`、`facts.cn` 各一行，`cadence='daily'`（本期按日常轮转衡量，财报日历新鲜度在计划三），`ok = status in ('success','partial')`（partial 仍代表当天跑过），`detail` 记录 `{issuers: n, failed: m}`。

退出码与状态策略同计划一脚本（§3.3 of runbook）：`partial`/`failed`/`rejected_summary` → 非零。

### 6.2 EDGAR companyfacts 适配器 `src/lib/facts/providers/edgar-companyfacts.ts`

- 请求：`GET https://data.sec.gov/api/xbrl/companyfacts/CIK{cik 左补零到 10 位}.json`，头 `User-Agent: $EDGAR_USER_AGENT`（缺省用 `collectors/shared.ts` 的 `DEFAULT_USER_AGENT`）、`Accept-Encoding: gzip, deflate`；一批内串行，间隔 ≥ 120 ms（SEC 上限 10 req/s，留余量）；`429/503` 退避 1 s→2 s→4 s→8 s 共 4 次，仍失败该发行人 `failed`；`404` → 该发行人 `failed`，错误码 `no_companyfacts`（SEC 没有该 CIK 的 XBRL 数据，常见于 ADR 用 6-K 的公司）。响应 > 50 MB → `failed`，`snapshot_too_large`。
- 解析 `parseCompanyFacts(json, {concepts, sinceYear})` → `{candidates: FactCandidate[], filings: FilingCandidate[], skipped: {reason, n}[]}`：
  - 遍历每个概念的 `usGaap` 回退列表（命中 `facts['us-gaap'][tag]`）和 `ifrs` 列表（`facts['ifrs-full'][tag]`）以及 `dei`；对每个 `units[unit][]` 条目，`unit` 归一后不在该概念允许集合 → `skipped(unit_not_allowed)`。
  - 条目 `{start?, end, val, accn, fy, fp, form, filed, frame?}` → 候选 `{concept, source_concept: '<taxonomy>:<tag>', period_start: start ?? null, period_end: end, value: val, unit, filing: {source_ref: accn, form_type: form, filed, fy, fp}, available_at: rule(filed)}`。`form` 不在 `filings.form_type` 枚举 → 归 `'other'`（如 `8-K`、`S-1`），**仍写入**（它们是真实披露）。
  - `end < sinceYear-01-01` → 跳过（`skipped_summary`）。
  - 同一 filing 同一自然键多条目 → 值全相同取一条；不同 → `ambiguous_tag` 隔离。`frame` 不参与去重，只原样记入隔离 payload 便于人工判断。
  - 回退顺序在**同一 filing** 内生效：一个 filing 若同时有 `Revenues` 与 `RevenueFromContractWithCustomerExcludingAssessedTax`，取 `Revenues`；不同 filing 可以命中不同标签（`source_concept` 如实记录，`mapping_version` 相同）。
- 期分类与 `fiscal_period` 见 §4.2；分类失败 → `odd_duration` 隔离。
- 范围默认 `sinceYear = 当前年 − 10`。

### 6.3 Tushare 三表适配器 `src/lib/facts/providers/tushare-statements.ts`

- 调用 `tushareCall(api, {ts_code, report_type}, fields)`（现有 `src/lib/data/sources/tushare.ts`），`api ∈ {income, balancesheet, cashflow}`，`report_type ∈ {1, 4}`——每个发行人 6 次调用、6 个快照。`fields` = `ts_code,ann_date,f_ann_date,end_date,report_type,comp_type,end_type,update_flag` + 该表在 §3 中用到的值字段（`fields` 字符串本身写入 `tool_versions.tushare_fields_<api>`）。不传 `period`/`start_date`，取全量历史再按 `sinceYear` 过滤（避免分页差异；Tushare 单次最多约 100 行，10 年 × 4 期 = 40 行，够）。
- `report_type=1`：合并报表（本期数）。`report_type=4`：**调整后的上年同期数**（出现在次年报告中），这是 A 股重述的主要来源：它的 `end_date` 是上年期末、`ann_date/f_ann_date` 是本年报告公告日，值若与 type 1 不同即形成新版本。实施第一步必须用一家公司核对 Tushare 对 `report_type=4` 的实际语义（抓 1 与 4 各一次，比较同 `end_date` 行），核对记录写入 runbook；核对不符则本期只加载 type 1，`update_flag` 单独作为版本依据。
- `update_flag`：原样记入候选 `provenance`（最终进隔离 payload 或 filings 不需要；事实表不存）。版本顺序**只**由 `available_at` 决定，不由 `update_flag` 决定。
- 每行 → 若干候选（每个映射字段一个；`sum(...)` 映射在任一加数缺失时**不写**，缺失保持缺失；全部加数存在才求和并 `source_concept='tushare:sum(a,b)'`）。`period_start`：duration 概念 = `end_date` 同年 01-01（A 股三表为年初至今累计）；instant 概念 = null。`fiscal_period`：`0331→Q1`、`0630→H1`、`0930→9M`、`1231→FY`，其他 `end_date` → `odd_duration` 隔离。
- filing：`source_ref = '<ts_code>:<f_ann_date ?? ann_date>'`，`origin` 按后缀（`.SH→sse`、`.SZ→szse`、`.BJ→bse`），`form_type` 由该公告日 type-1 行中最大 `end_date` 的月份定（`12→annual`、`06→semiannual`、`03→q1`、`09→q3`），该公告日只有 type-4 行 → `restatement`；`fiscal_year/fiscal_period/period_end` 取同一行。`url` 为 null。
- `comp_type`（1 一般、2 银行、3 保险、4 证券）记入 filings 候选的 `provenance`？——filings 表无 provenance 列；本期**不存** `comp_type`，但派生层对缺 `cost_of_revenue` 的发行人自然得不到毛利率（缺失保持缺失），不需要类型标记。
- 配额：`tushareCall` 失败消息含 `积分` 或 HTTP 429 → 本批次剩余发行人全部 `skipped_summary(code='quota')`，批次 `partial`，`detail.resume_after=issuer_id`；次日从 `last_sync_at nulls first` 自然续跑。

### 6.4 范围构建 `scripts/facts/build-scope.ts`

从三处生成 `fact_sync_scope`（service role，dry-run 默认）：
- 美股：`security_universe_memberships` 中 `universe in ('sp500','nasdaq_top500','us_china') and is_active` 的 ticker → `resolveIssuer({ticker}, {today})` → 发行人有 `cik` 才入；无 `cik` 计 `skipped_summary(no_cik)`；`fetch_key = cik`。
- A 股：`research_entity_keys where in_scope and issuer_id is not null`（跨用户，去重）→ 发行人当前 `is_primary` 且 `valid_to is null` 的 A 股 ticker（`issuer_securities` 过滤 `ticker ~ '\.(SH|SZ|BJ)$'`）→ `fetch_key = ticker`；无 A 股 ticker → `skipped_summary(no_a_share_ticker)`。
- 自选：`watchlist_items.ticker` 去重 → 同上解析；`reason='watchlist'`，`priority 5`。
- 已在表中但不再出现在任何来源的发行人：保留，`reasons` 置 `[]`、`priority 0`（不删，避免抖动；cron 只处理 `priority > 0`）。

### 6.5 触发

- `GET|POST /api/cron/facts-sync?market=US|CN[&limit=n]`：`CRON_SECRET` Bearer（与 `securities-sync` 同实现，抽到 `src/lib/cron/auth.ts` 供两者共用）；`maxDuration=300`；默认 `limit` 美股 40、A 股 60（一个发行人美股约 2–4 s、A 股 6 次调用约 3 s，留一半余量）；选择顺序 `priority desc, last_sync_at nulls first`，跳过 `priority = 0`。返回批次回执与 `perIssuer` 摘要（不含错误原文以外的敏感信息）。`vercel.json` 新增：`facts-sync?market=US` 每日 `10 2,8,14,20 * * *`（UTC；东京区域）、`facts-sync?market=CN` 每日 `40 2,8,14,20 * * *`。sp500+nasdaq_top500+us_china 去重后约 1,000 个发行人 ÷ 160/天 ≈ 一周滚一遍，满足"全量每周滚动"。
- `scripts/facts/sync.ts --market US|CN [--issuer <issuer_id|ticker>]... [--limit n] [--since-year y] [--apply]`：本机回填；dry-run 打印候选数与隔离数，不上传快照、不建批次。环境变量同计划一脚本（`node --env-file`），另需 `TUSHARE_TOKEN`（CN）与 `EDGAR_USER_AGENT`（US，缺省用默认 UA 但 runbook 要求设置真实联系方式）。
- `scripts/facts/materialize.ts [--issuer …] [--apply]`：重算 `financial_metrics`（§8.3）。

---

## 7. 规则与隔离

### 7.1 隔离（不进 `ok`）

写入 `dq_quarantine`，对应候选以 `status='quarantined'` 入 `financial_facts`（§6.1 第 4 步；`ambiguous_tag`、`odd_duration`、`missing_available_at`、`late_vintage` 四种**没有**可写的单一候选，只写隔离项不写事实）：

| reason_code | 触发 | payload |
|---|---|---|
| `ambiguous_tag` | §5.3 | 候选列表 |
| `odd_duration` | §4.2 期分类失败 | 候选 |
| `missing_available_at` | Tushare 行无 `f_ann_date` 与 `ann_date` | 行 |
| `late_vintage` | §5.2 例外 | 候选 + 冲突行 |
| `identity_bs` | `identityRule(total_assets, liabilities_and_equity, 0.005)`（美股）或 `identityRule(total_assets, total_liabilities + equity_total, 0.005)`（A 股；美股无 `liabilities_and_equity` 时也用此式，两者都缺则不检） | 该 filing 该期 BS 全部候选 |
| `identity_gp` | `gross_profit` 存在且 `identityRule(gross_profit, revenue − cost_of_revenue, 0.005)` 失败 | 该 filing 该期 IS 全部候选 |
| `unit_not_allowed` | `unitRule` 失败（§3） | 候选 |

恒等式失败隔离的是**该 filing 该期该报表**的全部候选（规格一 §8 的口径），自然键在 `natural_key` 用 `statement` 代替 `concept`：`'<issuer_id>:<statement>:<period_start>:<period_end>:<consolidation>:<source_ref>'`。

### 7.2 警告（写入，进回执）

`rangeRule('gross_margin_range', (rev−cost)/rev, −1, 1)` 与 `jumpRule('revenue_jump', 本期 revenue, 上年同期可见 revenue, 10)` 失败**不隔离**：候选照常 `ok` 写入，回执 `errors` 加 `{code:'rule_warning', key: natural_key, message: ruleId}`。`rule_warning` 加入 `INFO_CODES`（不降级批次）。理由：小公司与扭亏公司的同比跳变合法；按总纲"缺失保持缺失"，不应因启发式规则让真实披露消失。计划三的对账与黄金集才是硬证据。

### 7.3 处理钩子

`src/lib/dq/resolvers.ts`：`export const RESOLVERS: Record<string, (client, item, status) => Promise<void>>`，键为 `dataset` 前缀。`facts.*` 的钩子：`resolved_accept` → 把 `payload.fact_ids` 中的 `financial_facts.status` 置 `ok`；`resolved_reject` → 不动（保持 `quarantined`，追加写不删）。`POST /api/admin/dq/quarantine/[id]` 在状态翻转成功后调用匹配钩子；钩子失败记入响应 `{resolved: true, hook: 'failed', message}` 并写审计明细（不回滚状态，runbook 写明可重试：钩子幂等）。对无 `fact_ids` 的隔离项（§7.1 四种）钩子为空操作。

---

## 8. 派生层 `src/lib/facts/derive.ts`

`FORMULA_VERSION='facts-derive/1.0'`。输入是 `getFactsAsOf` 的结果；全部纯函数，输出 `{metric, period_start, period_end, fiscal_period, value, unit, inputs: [{fact_id, concept, vintage_seq}]}`；任一输入缺失 → 不产出该行（不写 null、不用代理）。

| metric | 公式 | 期 | 备注 |
|---|---|---|---|
| gross_margin | (revenue − cost_of_revenue) / revenue | 同事实期 | A 股分母用 `revenue_operating`（营业收入）；`inputs` 如实记录用的是哪个概念 |
| net_margin | net_income_parent / revenue | 同事实期 | A 股分母同上 |
| fcf | operating_cash_flow − capex | 同事实期 | |
| total_debt | short_term_debt + long_term_debt | INSTANT | 任一缺 → 缺 |
| q_single_<concept> | 美股：Q4 = FY − 9M（同 filing 的 FY 与上一 10-Q 的 9M 可见值）；Q1–Q3 源数据已是单季时直接等于事实（不重复产出）。A 股：Q1 = Q1；Q2 = H1 − Q1；Q3 = 9M − H1；Q4 = FY − 9M。被减数与减数必须是**同一 `asOf` 下**各自最新可见版本 | Q1–Q4 | 适用 duration 概念 revenue / net_income_parent / operating_cash_flow / operating_income；差分可逆性属性测试 |
| ttm_<concept> | 最近四个 q_single 求和（四个都在才算） | `fiscal_period='TTM'`，`period_start` = 四季窗口起点，`period_end` = 最后一季期末 | 同上四个概念 |
| revenue_yoy / net_income_yoy | (本期 − 上年同期) / abs(上年同期) | 同事实期 | 上年同期 = 相同 `fiscal_period` 且 `period_end` 相差 350–380 天的可见值；分母 0 → 缺 |
| roe | ttm_net_income_parent / avg(equity_parent 期初, 期末) | `fiscal_period='TTM'`，`period_end` = 窗口期末 | 期初 = 期末前 350–380 天的 instant 可见值 |

`financial_metrics.fiscal_period` 取值：事实期标签（`FY/Q1…/H1/9M/INSTANT`）或 `TTM`。

`materialize.ts` 与 cron 末尾对本批次涉及的发行人重算并 `upsert`（主键含 `formula_version`；旧版本公式的行保留直到手动清理）。

---

## 9. 读取接口

共同约定：公共只读，`getAnonSupabase()` + `supabaseTableClient`；`dynamic='force-dynamic'`；参数重复 → 400 `duplicate_parameter`；ticker 校验与 `resolve` 路由同正则；先 `resolveIssuer({ticker}, {today: asOf 的 UTC 日期 ?? 今天})`，无结果 → 404 `unknown_ticker`；错误响应 `no-store`；成功响应 `Cache-Control`：有 `asOf` 且早于今天 → `public, max-age=86400, s-maxage=604800`（历史不变）；否则用 `successCacheControl(now)`（到 UTC 日界）。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/facts/[ticker]` | `concepts`（逗号分隔，必填，白名单 `FACT_CONCEPTS`，≤ 25）、`from`/`to`（`period_end` 范围，默认近 10 年）、`asOf`（ISO 日期或时间）、`periods`（`FY,Q1,Q2,Q3,H1,9M,INSTANT` 子集，默认全部）、`limit`（期数上限，默认 40、最大 80） | `{issuerId, ticker, asOf, mappingVersion, facts: [{factId, concept, sourceConcept, statement, periodStart, periodEnd, fiscalYear, fiscalPeriod, value: string, unit, vintageSeq, isRestatement, availableAt, filingId}], filings: [{filingId, formType, periodEnd, availableAt, sourceRef, url}]}` |
| `GET /api/facts/[ticker]/metrics` | `metrics`（白名单 §8，≤ 20）、`from`/`to`、`asOf`、`limit` | `{issuerId, ticker, asOf, formulaVersion, metrics: [{metric, periodStart, periodEnd, fiscalPeriod, value: string, unit, inputs: [{factId, concept, vintageSeq}]}]}`；无 `asOf` 读 `financial_metrics`，有则实时 `derive` |
| `GET /api/filings/[ticker]` | `from`/`to`（`available_at` 范围）、`limit`（默认 40、最大 200） | `{issuerId, ticker, filings: [...]}` |
| `GET|POST /api/cron/facts-sync` | §6.5 | 批次回执 |

`value` 以字符串返回（`numeric` 不经 `number` 精度损失）。`/api/financials/[ticker]` 响应加 `Deprecation: true` 与 `Link: </api/facts/{ticker}>; rel="successor-version"`，行为不变。

---

## 10. 错误处理

| 情形 | 行为 | 计数 / 错误码 |
|---|---|---|
| SEC 429/503 四次退避后仍失败 | 该发行人跳过，继续下一个 | `failed` +1，`{code:'sec_unavailable', key: issuer_id}` |
| SEC 404 | 同上 | `failed`，`no_companyfacts` |
| 快照上传失败 | 该发行人不写任何行 | `failed`，`snapshot_upload_failed` |
| Tushare 配额/限频 | 本批次剩余发行人跳过 | `skipped_summary(quota)`，批次 `partial`（已处理者正常） |
| Tushare 返回空（新股、退市） | 不写；记录 | `skipped_summary(no_rows)` |
| 发行人 `status != 'active'`（合并/注销） | 跳过（事实应挂到合并目标，由计划三的合并流程迁移） | `skipped_summary(issuer_inactive)` |
| 候选解析异常（字段类型错） | 该发行人 `failed`，错误含字段名不含值 | `parse_error` |
| 23505 重号（§5.4） | 重算一次，再失败 `failed` | `vintage_conflict` |
| 整批 `fetched>0` 但无结果 | `finishBatch` 自动 `failed`（`unaccounted`） | — |
| 读接口解析不到 ticker | 404 | `unknown_ticker` |
| 读接口参数非法 | 400 | `invalid_parameter:<name>` |

---

## 11. 测试策略

### 11.1 单元（vitest，内存 `TableClient`）

- `concepts.test.ts`：25 个概念都有 `usGaap` 或 `tushare` 之一；`sum` 映射字段存在于 fields 列表；`MAPPING_VERSION` 变更时夹具快照失败（防止无声改口径）。
- `units.test.ts`：归一表；`unitRule` 允许集合。
- `edgar-companyfacts.test.ts`：夹具 `fixtures/edgar/CIK0000320193.trimmed.json`（AAPL companyfacts **真实响应**只保留 §3 用到的标签、2019 年起的条目，录制脚本 `scripts/facts/record-fixture.ts --edgar 320193` 生成，夹具文件头记录录制时间与原始 sha256）：回退顺序、`fy/fp` 不进事实行、封面股数标记、期分类（AAPL 财年 9 月底：FY 为 ~364 天）、同 filing 重复条目去重、`ambiguous_tag`、`sinceYear` 过滤、20-F/ifrs 路径（第二个夹具：一家 us_china 宇宙内用 ifrs-full 的申报人，录制时选 `facts['ifrs-full']` 存在者）。
- `tushare-statements.test.ts`：夹具 `fixtures/tushare/600519.SH.{income,balancesheet,cashflow}.rt{1,4}.json`（真实响应，录制脚本 `--tushare 600519.SH`，需要 token，见 §14）：YTD `period_start`、`fiscal_period`、`sum` 缺一不写、`f_ann_date ?? ann_date`、type-4 行形成新版本、`missing_available_at`、filing 分组与 `form_type`。
- `plan.test.ts`（`planFactWrites`）：§5.2 四条规则 + 迟到版本 + 同批多候选单调；23505 重算路径。
- `rules.test.ts`（facts 层）：BS 恒等两种式子、GP 恒等、警告不隔离、隔离项 natural_key 形状。
- `derive.test.ts`：每个指标的缺失即缺失；A 股分母；YoY 窗口；ROE 期初查找。
- 属性测试（仓库没有 `fast-check`，不新增依赖；用种子随机数手写 200 次迭代）：随机 YTD 序列 → 差分 → 累加恒等；随机重述序列 → `vintage_seq` 与 `available_at` 单调。
- `read.test.ts`：`getFactsAsOf` 时点语义（asOf 早于重述取旧值；`quarantined` 不可见；`from/to`）。
- 路由测试：参数校验、缓存头、404、`value` 字符串化、`Deprecation` 头。

### 11.2 数据库（`test:db`，真实 PostgreSQL）

`src/lib/facts/facts.integration.test.ts`（**加入 `criticalSuites`**）：迁移可重放（重放用计划一的 `replayMigration` 助手）；两条 `nulls not distinct` 唯一约束；追加写触发器（update 值列 → 23514 `append_only…`，delete → 23514）；`supersedes/is_restatement` check；RLS：`anon` 读不到 `quarantined`、读不到 `fact_sync_scope`；视图 `financial_history` 列名与类型、`security_invoker` 下匿名读；`on delete restrict` 链（删 filing 被 facts 挡住）。

### 11.3 离线集成（录制回放）

`sync.integration.test.ts`（也在 `criticalSuites`）：用 §11.1 夹具作为注入的 `fetchUs/fetchCn`，内存 `SnapshotStore`，真实 PostgreSQL：对 AAPL + 1 家 ifrs 申报人 + 600519.SH 跑 `runFactsSync` 两遍——第一遍 `inserted>0`，第二遍全部 `duplicates`、批次 `success`、无新 filings；再注入一份改了一个值的夹具 → `versioned=1`、`supersedes` 指向旧行、`asOf` 回放旧值。

### 11.4 黄金断言（一手文件）

`src/lib/facts/fixtures/gold/plan2.json`：6 家（AAPL、MSFT、一家 ifrs 20-F 申报人、600519.SH、000333.SZ、一家银行如 600036.SH）× 2 期（最近年报与前一年报）× 6 科目（revenue、net_income_parent、total_assets、equity_total、operating_cash_flow、shares_outstanding）。每条记 `{issuer, concept, period_end, value, unit, source: {document, page_or_row, url}, recorded_by, recorded_at}`，**值由人从 10-K / 年报 PDF 原文抄录**（EDGAR 的 Financial Report 页面或 cninfo PDF 的页码），不从 API 抄。测试：`sync.integration.test.ts` 跑完后，黄金条目全部在 `ok` 事实中且数值相等（美股单位 USD；A 股 CNY；`shares_outstanding` 的单位核对即在此完成）。缺少 Tushare 夹具时这组 A 股断言 `skip` 并在 CI 输出中标明（不是通过）。

### 11.5 清单规则

每个含 `S4_TEST_STATE` 的新 `.test.ts` 加入 `scripts/ci/research-checks.ts::criticalSuites`；`npm test`、`typecheck`、`lint`、`test:db`、`test:migrations` 全绿才算完成任务（本机 `test:db` 的负载级联失败按记忆中的隔离法复核）。

---

## 12. 分期（供计划二拆任务）

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| F2-0 迁移与类型 | `20261106090000_financial_facts.sql`、锁文件、`database.types.ts`、集成测试（§11.2） | `test:db`、`test:migrations` 绿 |
| F2-1 概念、单位、规划、规则、读取 | `concepts.ts`、`units.ts`、`plan.ts`、`rules.ts`（facts 层）、`read.ts`、`INFO_CODES += rule_warning` | 单测绿 |
| F2-2 快照存储与同步核心 | `snapshot-store.ts`（Supabase storage + 内存实现）、`sync.ts`、`resolvers.ts` 钩子与 `/api/admin/dq/quarantine/[id]` 接入 | 用假适配器的 `runFactsSync` 单测绿 |
| F2-3 EDGAR 适配器 | `edgar-companyfacts.ts` + AAPL/ifrs 夹具 + 录制脚本 | 单测绿；离线集成（美股部分）绿 |
| F2-4 Tushare 适配器 | `tushare-statements.ts` + 600519 夹具（§14 前置） + type-4 语义核对记录 | 单测绿；离线集成（A 股部分）绿；`total_share` 单位已核对 |
| F2-5 范围、脚本、cron | `build-scope.ts`、`sync.ts` 脚本、`materialize.ts`、`/api/cron/facts-sync`、`src/lib/cron/auth.ts`、`vercel.json` | dry-run 对真实 SEC 跑 3 家（无需 token）；回执落库 |
| F2-6 派生与读接口 | `derive.ts`、`financial_metrics` 物化、三个路由、`/api/financials` 弃用头、`financial_history` 视图验证 | 黄金断言绿；删表重算一致 |
| F2-7 文档与收尾 | runbook 新章节（表、路径约定、`available_at` 规则、录制夹具、回滚、cron）、规格一 §4 顶部指向本规格、计划一规格 §14 式的偏差记录 | 全量门禁绿 |

工作量（熟悉仓库的高级工程师）：F2-0 1 人日；F2-1 2；F2-2 2；F2-3 2；F2-4 2–3（含核对）；F2-5 2；F2-6 2；F2-7 1。合计 14–15 人日，不含 Tushare 配额等待与黄金集抄录。

验收样例：规格一 §10 的 1、2、5、6 四条原样适用；新增：
7. `GET /api/facts/AAPL?concepts=revenue&periods=FY&asOf=2024-06-30` 返回 FY2023 一行 `vintageSeq=1`、`availableAt` 为 2023-11-03 美东 17:30；`asOf=2025-06-30` 若 FY2024 10-K 重申同值则仍是同一 `factId`。
8. 600519.SH 2023 年报 `revenue`（营业总收入）与 cninfo 年报 PDF 第 N 页数字相等（黄金断言）。
9. 隔离一条 `identity_bs` 项后 `GET /api/facts/...` 不返回该期 BS；`/admin/dq` 接受后返回。

---

## 13. 独立验证

- Codex（gpt-6-astra，medium）审计本规格与每个任务提交；报告入 `docs/audits/2026-11-04-data-foundation-2/`。
- 黄金断言由实施者之外的人抄录（owner 或指定审核人），抄录记录含文件与页码。
- 实时 SEC dry-run 3 家（无 token 即可）作为联网冒烟；Tushare 联网冒烟在 owner 提供 token 的环境做一次 dry-run。
- 专家抽样（规格一 §11）中"营业总收入 vs 营业收入"与"股利含利息"两处口径在本规格 §3 已显式标注，仍需会计背景的人复核一次。

---

## 14. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| 提供 `TUSHARE_TOKEN` 给录制夹具与 A 股冒烟的环境（放在仓库外的 env 文件，`node --env-file` 引用；不进 git、不进聊天） | owner | F2-4 开始前；缺失时 F2-4 的夹具相关测试 `skip` 并在 PR 中标明 |
| Vercel 环境变量 `EDGAR_USER_AGENT`（真实联系方式）、确认 `TUSHARE_TOKEN`、`CRON_SECRET` 已存在 | owner | 部署前 |
| 生产执行迁移（含建桶）与 `build-scope.ts --apply`、首轮 `sync.ts --market US --limit 20 --apply` 观察回执 | owner（CLI 部署流程） | 合并后 |
| 黄金集抄录 | owner / 审核人 | F2-6 前 |

---

## 15. 开放问题

1. Tushare `report_type=4` 的精确语义（"调整合并报表"是否等于次年报告中的上年同期重述数）——F2-4 第一步核对，核对结果决定是否加载 type 4。
2. `balancesheet.total_share` 单位（股 / 万股）——F2-4 核对，黄金断言固化。
3. 多类别股本公司（GOOGL、BRK）的 `shares_outstanding` 在 companyfacts 中按类别拆分时会被 `ambiguous_tag` 隔离；是否需要 `share_class` 维度——留给公司研究规格。
4. 美股 ADR 用 6-K 披露的公司无 companyfacts（404）——按 `no_companyfacts` 失败；是否转 F3 PDF 管道，留给 F3。
5. `late_vintage` 的自动重排（本期只隔离）——计划三。
6. `financial_metrics` 旧 `formula_version` 行的清理策略——首次升级公式时决定。
