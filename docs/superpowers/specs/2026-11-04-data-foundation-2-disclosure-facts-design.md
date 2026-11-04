# 数据底座二 · F2 披露事实库 设计规格

日期：2026-11-04（第 2 稿，经 Codex gpt-6-astra 审计与独立 Claude 复审后重写；审计报告见 `docs/audits/2026-11-04-data-foundation-2/`）
状态：草案，待 owner 评审
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§4、§8–§10 的 F2 部分。本规格**取代**规格一 §4 的全部文字；规格一 §14 记录的计划一偏差在此视为既定事实。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格逐条对照其硬约束：只用一手来源（EDGAR、交易所定期报告；Tushare 仅作适配器并记录上游与巨潮公告定位）、每个数字可回放（源文件哈希、行定位、可得日期、变换、代码版本）、事实与判断分离（本规格只有事实与可重建的派生，不含任何评分）、缺失保持缺失（不做代理指标、不填占位、不做静默换算）。
已定决策（owner 2026-11-04）：美股事实来源 EDGAR companyfacts；A 股事实来源 Tushare 三表 + 公告日期字段；港股延后到 F3；本规格不含任何页面（页面由公司研究规格用 Claude Design 设计）。

第 2 稿相对第 1 稿的核心改动（对应审计 P1）：事实表改为**披露日志**（每份文件每个值一行，不按值去重，版本在读取时计算）；可得性降为**日期精度**；`unit` 进入事实键；Tushare 加载 `report_type` 1/4/5 三类并挂接巨潮公告 id 与 PDF 链接；10-Q 现金流按年初至今差分；按发行人**租约** + **暂存后一次发布**；删除 `financial_history` 表→视图的改造（无读者，推迟）。

---

## 1. 目标与非目标

### 1.1 目标

1. **披露日志。** `financial_facts` 记录"哪份文件、在哪个可得日期、对哪个概念的哪个期间、用哪个单位、披露了什么值"。同一期间被多份文件重复披露就有多行；值变了就是修订。任意 `asOf`（日期）都能回放当时可见的最新披露。
2. **两个市场、一个写入路径。** EDGAR companyfacts（美股及在美上市中概股）与 Tushare 三表（A 股）经同一套"租约 → 快照入桶 → 解析 → 暂存写入 → 规则 → 发布 → 回执"流程写入，复用计划一的 `ingest_batches`、`dq_quarantine`、`dq_freshness`、`TableClient`。
3. **派生可重建。** 毛利率、ROE、FCF、同比、单季差分、TTM 由 `derive.ts` 按 `formula_version` 从事实计算；物化到 `financial_metrics` 的行记录输入 fact id；按发行人整体重算后与重算前逐行一致。
4. **公共只读接口。** 事实、派生、披露文件三个读接口按 ticker 查询（ticker 按**今天**的归属解析为发行人，`asOf` 只作用于事实）；一个 cron 接口与一个本机脚本共用同一核心。

成功标准（计划二退出条件）：
- `security_universe_memberships` 的 sp500 / nasdaq_top500 / us_china 三个宇宙内每个有 CIK 且 companyfacts 可得的发行人，最近 8 个财期的 §3 概念已入库（companyfacts 里没有的概念保持缺失，不计失败）；`GET /api/facts/AAPL?concepts=revenue&asOf=2024-06-30` 返回 FY2023（period_end 2023-09-30）revenue 的 2023-11-03 10-K 披露行，而不是 FY2024 10-K 中的同期行。
- `research_entity_keys.in_scope=true` 且已挂 `issuer_id` 的 A 股发行人，10 年三表已入库；一家有 `report_type=5`（调整前）与 `report_type=1`（最新）同期不同值的公司，两行并存，`asOf` 早于更正公告日取调整前值；该公司年报 filing 带巨潮公告 id 与 PDF 链接。
- 黄金断言（§11.4）美股部分在 CI 强制通过；A 股部分在夹具录入后进入强制。
- 按发行人重算 `financial_metrics`，语义字段与重算前逐行一致。
- 断网运行同步：批次 `failed`，旧数据不变；连续两次后新鲜度 `error`（计划一 `recordAttempt` 的两次策略）。

### 1.2 本规格之外

- 港股事实（F3）。
- 跨来源对账运行器（`dq_reconciliations` 写入者）、财报日历新鲜度、30 家黄金集：计划三（规格一 §5.2、WP-F5）。本规格只交付 6 家黄金断言作为测试。
- ISIN / FIGI / A+H 配对、历史 ticker 归属证据：计划三。本规格的 ticker 解析按今天的归属。
- 母公司报表（Tushare `report_type` 6–12）、单季表（2、3）：不加载；`consolidation` 列保留 `'parent'` 枚举值但本期只写 `'consolidated'`。
- `financial_history` 表→视图改造：该表为空、无写入者、唯一读者是 `/api/stocks/[ticker]` 里的 TODO，本期**不动**（规格一 §4.2 的承诺推迟到公司研究规格确定读者后）。
- 任何页面与 `/admin/dq` 的改动，除 §7.3 一处处理钩子外。
- 删除现有 `/api/financials/[ticker]`：它有五个读者（`consensus`、`dcf` 两个路由、`agent/tools.ts`、`hooks/useQuote.ts`、`dcf/assemble.ts`），本规格只加 `Deprecation` 头，迁移读者属于公司研究规格。
- 日内（时刻级）可得性：本期只到日期精度（§5.1）；SEC `acceptanceDateTime` 的补录是计划三的开放项。
- 自选股（watchlist）进入同步范围：见 §6.4 的 owner 决策项。

---

## 2. 现状（2026-11-04，计划一落地后）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 发行人 | `issuers(issuer_id, cik（不带前导零）, lei, usci, cninfo_org_id, …, status)`；`issuer_securities(ticker, valid_from = 首次观察日而非上市日, valid_to, is_primary)`；`resolveIssuer(client, {ticker\|cik\|…}, {today})` 一跳合并重定向（`src/lib/entities/resolve.ts`） | 事实只挂 `issuer_id`；读接口按今天解析 ticker；美股抓取用 `issuers.cik`（左补零到 10 位的工作在 `fetchKey()` 一处）；A 股巨潮定位用 `issuers.cninfo_org_id` |
| 研究实体 | `research_entity_keys.issuer_id`（计划一挂接脚本写入）、`in_scope`、`cohort` | A 股范围来源 |
| 证券 | `stocks_universe.ticker`（A 股形如 `600519.SH`，与 Tushare `ts_code` 同形）；`security_universe_memberships(ticker, universe, is_active)` | 美股范围来源；A 股 ts_code 来源 |
| 质量设施 | `startBatch/finishBatch/batchStatusFromCounts`（六个计数器；`INFO_CODES=['skipped_summary','relink']` 不降级；`rejected_summary` 降级；`capErrors` 只保留前 100 条）、`quarantine()`（同键 open 项唯一，23505 收敛；`payload` 必须是对象）、`recordAttempt`（连续两次失败才 `error`）、`rules.ts`（`rangeRule/identityRule/jumpRule/unitRule` 不抛异常） | 全部复用；新增信息码 `rule_warning_summary`（§7.2）与非信息码 `quota_exhausted`（§10） |
| 隔离处理 | `POST /api/admin/dq/quarantine/[id]` 只翻转状态并写 `research_audit_log`；重复处理返回 `already_resolved` | 增加按数据集的处理钩子与钩子状态（§7.3） |
| 数据库访问 | `TableClient`（Supabase / memory / pg 三实现；`insert` 单行；`RangeOptions` 只有 `gte/lt`；单列 `orderBy`；`selectAll` 分页 1000） | 扩展 `insertMany` 与 `lte`（§4.8）；排序与过滤在内存完成；原子操作用两个 SQL 函数（§4.4、§6.1） |
| 财务数据 | `financial_history` 表为空、无写入者；`/api/financials/[ticker]` 实时拉 Tushare 年报行 | 表不动；路由加弃用头 |
| Tushare 客户端 | `tushareCall` 解析后返回行对象，不暴露响应原文、`has_more`、`request_id`；token 从 `TUSHARE_TOKEN` 读 | 新增原文变体 `tushareCallRaw`（§6.3） |
| EDGAR 访问 | `collectors/shared.ts::createClient`（User-Agent、最小间隔、30 s 超时） | companyfacts 适配器复用其 pace 逻辑 |
| 巨潮访问 | `collectors/cninfo.ts`：`topSearch` 解析 orgId，`hisAnnouncement/query` 列公告（announcementId、adjunctUrl、announcementTime） | A 股 filing 的公告 id 与 PDF 链接（§6.3） |
| 存储 | 私有桶 `security-snapshots`（迁移里 `insert into storage.buckets … on conflict`；本地 harness 只有 `storage.buckets` 五列） | 同法新建 `disclosure-raw` |
| cron | `vercel.json` crons + `CRON_SECRET` Bearer + `timingSafeEqual`；`maxDuration=300` | 同法新增 `facts-sync`，带 200 s 截止 |
| 环境 | 本机 `.env.local` **没有** `TUSHARE_TOKEN` 与 `EDGAR_USER_AGENT`；生产 Vercel 有 `TUSHARE_TOKEN` | Tushare 夹具录制需 owner 提供 token（§14） |
| 迁移 | 最新已锁 `20261105091000_issuers.sql`；本地 harness 与托管实例都是 PostgreSQL 17 | 新迁移 `20261106090000_financial_facts.sql`；`unique nulls not distinct` 可用 |

---

## 3. 概念目录 `src/lib/facts/concepts.ts`

`FACT_CONCEPTS` 导出 **31** 个概念，`MAPPING_VERSION='facts-map/1.0'`。每个概念：`id`、`statement`（IS/BS/CF/DEI）、`nature`（duration/instant）、`unitKind`（money/shares/per_share）、`usGaap: string[]`（回退顺序）、`ifrs: string[]`（回退顺序，可空）、`tushare: {api, field} | {api, sum: string[]} | null`、`notes`。

**选取规则（§6.2 与此处一致）**：对同一 filing、同一期间（`start,end`）、同一单位，按顺序取**第一个有条目的标签**；更低优先级的标签只在更高优先级标签**没有该期间条目**时补位（按期间回退，不是按 filing 回退）。回退列表里的标签是目录声明的"可接受的替代口径"，不同标签值不同**不是歧义**；只有**同一标签**对同一 `accn+start+end+unit` 给出不同 `val` 才隔离 `ambiguous_value`（§5.3）。被选标签写入 `source_concept`。

| concept | 表 | 性质 | us-gaap 回退顺序 | ifrs-full | Tushare |
|---|---|---|---|---|---|
| revenue | IS | duration | Revenues → RevenueFromContractWithCustomerExcludingAssessedTax → SalesRevenueNet | Revenue | income.total_revenue（营业总收入） |
| revenue_operating | IS | duration | — | — | income.revenue（营业收入） |
| cost_of_revenue | IS | duration | CostOfRevenue → CostOfGoodsAndServicesSold → CostOfGoodsSold | CostOfSales | income.oper_cost |
| gross_profit | IS | duration | GrossProfit | GrossProfit | — |
| operating_income | IS | duration | OperatingIncomeLoss | ProfitLossFromOperatingActivities | income.operate_profit |
| net_income | IS | duration | ProfitLoss（含少数股东；美股多数申报人不标，缺失保持缺失） | ProfitLoss | income.n_income |
| net_income_parent | IS | duration | NetIncomeLoss（us-gaap 定义即归属母公司） | ProfitLossAttributableToOwnersOfParent | income.n_income_attr_p |
| eps_basic | IS | duration | EarningsPerShareBasic | BasicEarningsLossPerShare | income.basic_eps |
| eps_diluted | IS | duration | EarningsPerShareDiluted | DilutedEarningsLossPerShare | income.diluted_eps |
| rd_expense | IS | duration | ResearchAndDevelopmentExpense | ResearchAndDevelopmentExpense | income.rd_exp |
| sga_expense | IS | duration | SellingGeneralAndAdministrativeExpense | SellingGeneralAndAdministrativeExpense | sum(income.sell_exp, income.admin_exp) |
| interest_expense | IS | duration | InterestExpense | InterestExpense | income.fin_exp_int_exp（"财务费用:利息费用"；银行用 income.int_exp"减:利息支出"，两者口径不同，银行行写入时 `source_concept` 如实区分） |
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
| shares_outstanding | BS/DEI | instant | CommonStockSharesOutstanding → dei:EntityCommonStockSharesOutstanding（后者 `period_end` 是封面日期，`notes` 标 `cover_date`） | NumberOfSharesOutstanding | balancesheet.total_share（文档标注"期末总股本（股）"） |
| operating_cash_flow | CF | duration | NetCashProvidedByUsedInOperatingActivities | CashFlowsFromUsedInOperatingActivities | cashflow.n_cashflow_act |
| investing_cash_flow | CF | duration | NetCashProvidedByUsedInInvestingActivities | CashFlowsFromUsedInInvestingActivities | cashflow.n_cashflow_inv_act |
| financing_cash_flow | CF | duration | NetCashProvidedByUsedInFinancingActivities | CashFlowsFromUsedInFinancingActivities | cashflow.n_cash_flows_fnc_act |
| capex | CF | duration | PaymentsToAcquirePropertyPlantAndEquipment | PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities | cashflow.c_pay_acq_const_fiolta |
| dividends_paid | CF | duration | PaymentsOfDividends | DividendsPaidClassifiedAsFinancingActivities | — |
| dividends_and_interest_paid | CF | duration | — | — | cashflow.c_pay_dist_dpcp_int_exp（"分配股利、利润或偿付利息支付的现金"，与 dividends_paid 不是同一口径，故单列） |
| net_change_in_cash | CF | duration | CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect → CashAndCashEquivalentsPeriodIncreaseDecrease | IncreaseDecreaseInCashAndCashEquivalents | cashflow.n_incr_cash_cash_equ |

与第 1 稿的差异（审计 #9）：不再把口径不同的标签放进同一概念——`net_income` 不再回退到 NetIncomeLoss；`cash` 不再回退到含受限现金的标签（单列 `cash_and_restricted_cash`）；`dividends_paid` 不再用 PaymentsOfDividendsCommonStock 兜底，也不再把 A 股"含利息"字段映射进来（单列 `dividends_and_interest_paid`）；`short_term_debt/long_term_debt` 改名为 `*_borrowings`（只覆盖借款，不声称覆盖全部债务），A 股应付债券单列 `bonds_payable`。

单位归一（`src/lib/facts/units.ts`）：companyfacts 的 `USD`→`USD`、`shares`→`shares`、`USD/shares`→`USD/share`、其他 `<货币>/shares`→`<货币>/share`、`pure`→`pure`，其他货币代码原样保留（20-F 申报人可能是 `CNY`、`HKD`、`EUR`）；Tushare 金额字段单位元 → `CNY`，`basic_eps/diluted_eps` → `CNY/share`，`total_share` → `shares`。`unitRule` 允许集合按 `unitKind`：money 允许 ISO 4217 三字母码，shares 只允许 `shares`，per_share 只允许 `<货币>/share`。**同一概念同一期间可以有多个单位的事实并存**（审计 #8），单位是事实键的一部分；派生只在输入单位一致时计算，不做换算。

读接口对 `concepts` 的上限 = `FACT_CONCEPTS.length`（不再手写数字）。

---

## 4. 数据模型

迁移 `supabase/migrations/20261106090000_financial_facts.sql`，可重放（`create table if not exists`、`drop policy if exists`、`create or replace function`、`insert … on conflict`）。写入时补 `migrations.lock.json`；`database.types.ts` 手工补 `Filing`、`FinancialFact`、`FinancialMetric`、`FactSyncScope` 四个 Row 类型。所有表显式 `revoke all from public, anon, authenticated` 后再按 §4.7 授权（与计划一迁移同法）。

### 4.1 `filings` —— 一份披露文件

```
filing_id        uuid primary key                         -- 写入端生成
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
market           text not null check (market in ('US','CN'))
source           text not null check (source in ('edgar','tushare'))
origin           text not null check (origin in ('sec','sse','szse','bse'))
form_type        text not null check (form_type in ('10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','annual','semiannual','q1','q3','restatement','other'))
fiscal_year      int                                      -- US: 条目 fy（filing 的财年）；CN: end_date 年份
fiscal_period    text check (fiscal_period in ('FY','Q1','Q2','Q3','H1','9M'))  -- US: fp；CN: 按 end_date 月份
period_end       date                                     -- US: 该 accn 下 duration 条目的最大 end（dei instant 不参与）；CN: end_date；可空
available_date   date not null                            -- §5.1
source_ref       text not null                            -- EDGAR: accession no.（带连字符）；Tushare: '<ts_code>:<end_date>:<report_type>:<f_ann_date ?? ann_date>'
url              text                                     -- EDGAR: 归档 index 页
document_ref     text                                     -- CN: 巨潮 announcementId；US: null
document_url     text                                     -- CN: 巨潮 PDF（static.cninfo.com.cn/…）；US: null
batch_id         uuid not null references ingest_batches(batch_id) on delete restrict
created_at       timestamptz not null default now()
unique (source, source_ref)
unique (filing_id, issuer_id)                             -- 供 financial_facts 复合外键
index (issuer_id, available_date desc)
index (issuer_id, period_end desc)
```

### 4.2 `financial_facts` —— 一份文件对一个值的一次披露（追加写）

```
fact_id          uuid primary key                         -- 写入端生成（内存客户端不合成自增 id）
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
filing_id        uuid not null
concept          text not null check (length(concept) between 1 and 64)
source_concept   text not null                            -- 'us-gaap:Revenues' / 'ifrs-full:Revenue' / 'dei:…' / 'tushare:income.total_revenue' / 'tushare:sum(income.sell_exp,income.admin_exp)'
statement        text not null check (statement in ('IS','BS','CF','DEI'))
period_start     date                                     -- instant 为 null
period_end       date not null
duration         text not null check (duration in ('3M','6M','9M','12M','INSTANT'))
value            numeric not null
value_text       text generated always as (value::text) stored   -- 读接口返回此列，避免 JSON number 精度损失
unit             text not null check (length(unit) between 1 and 16)
consolidation    text not null default 'consolidated' check (consolidation in ('consolidated','parent'))
available_date   date not null                            -- 冗余自 filings，便于回放索引
mapping_version  text not null
status           text not null default 'staged' check (status in ('staged','ok','quarantined'))
batch_id         uuid not null references ingest_batches(batch_id) on delete restrict
raw_hash         text not null                            -- 产生本行的快照 sha256（§4.6）
created_at       timestamptz not null default now()
foreign key (filing_id, issuer_id) references filings(filing_id, issuer_id) on delete restrict   -- 事实与文件必须同一发行人（审计 #23）
constraint financial_facts_period check (period_start is null or period_start < period_end)
constraint financial_facts_instant check ((period_start is null) = (duration = 'INSTANT'))
unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, unit, filing_id, mapping_version)
index (issuer_id, concept, period_end, available_date)    -- 回放
index (issuer_id, status) where status = 'staged'         -- 崩溃清理
index (filing_id)
index (batch_id)
```

- **没有** `vintage_seq`、`supersedes`、`is_restatement` 列（审计 #1、#12、#16）：披露顺序、"前一次披露"、"是否修订"都在读取时按 `available_date` 计算（§5.2），迟到的历史文件直接插入，不需要重排。
- `duration` 由 `period_end − period_start` 天数分类：75–105 → `3M`，165–200 → `6M`，255–290 → `9M`，350–380 → `12M`，instant → `INSTANT`；其余 → 隔离 `odd_duration`。**不再**给事实标财季号（Q1/Q2/…）：那需要发行人财年末，本期不存（审计 #15）；财季标签留给读者按 `period_end` 自行推断，派生层只用期间算术（§8）。
- 追加写触发器 `financial_facts_append_only`（`raise … using errcode='23514'`，消息以 `append_only` 开头）：`delete` 只允许 `status='staged'` 的行（崩溃清理）；`update` 只允许改 `status`（允许的迁移：`staged→ok`、`staged→quarantined`、`quarantined→ok`、`ok→quarantined`；`→staged` 禁止）。
- RLS 与权限见 §4.7；`staged` 与 `quarantined` 对公共不可见。

### 4.3 `financial_metrics` —— 派生物化（缓存，可重建）

```
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
metric           text not null
period_start     date not null                            -- instant 指标 = period_end
period_end       date not null
duration         text not null check (duration in ('3M','6M','9M','12M','TTM','INSTANT'))
value            numeric not null
value_text       text generated always as (value::text) stored
unit             text not null                            -- 'ratio' | 'CNY' | 'USD' | …
formula_version  text not null
inputs           jsonb not null check (jsonb_typeof(inputs) = 'array')   -- [{fact_id, concept, filing_id, available_date}]
as_of            date not null                            -- 计算时假定的可见日期；日常物化为当天
computed_at      timestamptz not null default now()
primary key (issuer_id, metric, period_start, period_end, unit, formula_version)
index (issuer_id, metric, period_end desc)
```

物化是缓存：`materialize(issuerId)` 读 `as_of=今天` 的可见事实，算出全部指标，**先删该发行人全部物化行再 `insertMany`**（两步，非原子但幂等；读者短暂看到空是可接受的，读接口对空结果不缓存）。无 `asOf` 的读请求读此表并过滤 `formula_version = FORMULA_VERSION`；带 `asOf` 的读请求不读此表，走 `derive.ts` 实时计算。

### 4.4 `fact_sync_scope` —— 范围、调度与租约

```
issuer_id        uuid primary key references issuers(issuer_id) on delete cascade
market           text not null check (market in ('US','CN'))
reasons          jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array')   -- ['universe:sp500','cohort']
priority         int not null default 0                   -- universe 10 / cohort 10；0 = 不再调度
fetch_key        text not null                            -- US: 10 位 CIK；CN: ts_code（由 fetchKey() 统一生成）
next_due_at      timestamptz not null default now()       -- 调度键：到期优先，再按 priority
lease_until      timestamptz
lease_batch_id   uuid references ingest_batches(batch_id) on delete set null
last_attempt_at  timestamptz
last_success_at  timestamptz                              -- 最近一次成功发布
last_batch_id    uuid references ingest_batches(batch_id) on delete set null
last_status      text check (last_status in ('success','failed','skipped'))
updated_at       timestamptz not null default now()
index (market, next_due_at, priority desc) where priority > 0
```

仅 service role。两个 SQL 函数（`security definer`，只授 `service_role` 执行，`revoke execute from public, anon, authenticated`）：

```sql
-- 原子租约：未租或已过期才成功
create or replace function public.claim_fact_sync_lease(p_issuer uuid, p_batch uuid, p_ttl_seconds int)
returns boolean language sql as $$
  update public.fact_sync_scope
     set lease_until = now() + make_interval(secs => p_ttl_seconds), lease_batch_id = p_batch, last_attempt_at = now(), updated_at = now()
   where issuer_id = p_issuer and (lease_until is null or lease_until < now())
  returning true;
$$;

-- 原子发布：本批次本发行人的 staged 行一次性变 ok；返回行数
create or replace function public.publish_staged_facts(p_issuer uuid, p_batch uuid)
returns int language sql as $$
  with u as (update public.financial_facts set status = 'ok'
              where issuer_id = p_issuer and batch_id = p_batch and status = 'staged' returning 1)
  select count(*)::int from u;
$$;
```

（`returning true` 在无匹配行时返回空 → 调用端把 `null` 视为 false。）

### 4.5 `financial_history`

本期不改（§1.2）。

### 4.6 原始快照桶 `disclosure-raw`

`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('disclosure-raw','disclosure-raw', false, 52428800, array['application/json']) on conflict (id) do update …`（与 `security-snapshots` 同法；50 MB）。

路径**内容寻址**：`{source}/{issuer_id}/{sha256}.json` 存**响应原文字节**（未解析），`sha256` 即其哈希；旁边 `{sha256}.meta.json` 存 `{source, api|url, params（去掉 token）, fields, fetched_at, http_status, has_more}`。已存在的哈希不重传：上传用 `upsert: false`，`409` 视为已存在（计 `duplicates` 的不是快照而是事实行；快照重复不进计数）。`financial_facts.raw_hash` 指向快照。定位一条事实的原始行：
- EDGAR：快照 `facts[<taxonomy>][<tag>].units[<原始 unit>][]` 中 `accn = filings.source_ref` 且 `end = period_end`（duration 再比 `start`）的条目；`<taxonomy>:<tag>` 即 `source_concept`，原始 unit 由 `units.ts` 的反向表给出。
- Tushare：快照是一次 API 调用（含分页时每页一个快照）的响应；行 = `end_date = period_end` 且 `report_type`、`f_ann_date ?? ann_date` 与 `filings.source_ref` 对应的那一行；`source_concept` 指出字段名。

上传失败 → 本发行人本批次不写任何行，计 `failed`（快照是写入的前置条件）。

### 4.7 权限

- `filings`、`financial_metrics`：`grant select to anon, authenticated`，RLS `for select using (true)`；`grant select, insert, update, delete to service_role`。
- `financial_facts`：`grant select to anon, authenticated`，策略 `using (status = 'ok')`；`grant select, insert, update, delete to service_role`。
- `fact_sync_scope`：仅 `service_role`（RLS 开、无策略）。
- 两个函数：仅 `service_role` 可执行。
- 写一律 service role（`getAdminSupabase()`）。集成测试以真实角色（`anon`、`authenticated`、`service_role`）验证。

### 4.8 `TableClient` 扩展

- `RangeOptions` 增加 `lte`（三实现同步；Supabase 用 `.lte`）。
- `insertMany(table, rows: Row[]): Promise<void>`（Supabase 一次请求插多行；内存与 pg 实现逐行或多值 insert）；调用方分块 ≤ 500 行。
- 其余不变：多列排序、正则过滤都在内存做；范围表读取用 `selectAll`。

---

## 5. 时点与版本语义

### 5.1 可得日期

`available_date` 是**日期**（审计 #2）：
- EDGAR：`filed`（SEC 当日公开的申报日期）。
- Tushare：`f_ann_date ?? ann_date`（YYYYMMDD → date）；两个都缺 → 该行隔离 `missing_available_date`。

`asOf` 在接口里是 `YYYY-MM-DD`；一个值在 `available_date <= asOf` 时可见（含当日）。本期**不承诺**日内精度：同一天内的先后不可区分。时区换算不存在（都是来源给的日期），所以规则变更只影响 `MAPPING_VERSION` 不涉及 DST。

### 5.2 读取时的版本

对自然键 K = `(issuer_id, concept, period_start, period_end, consolidation, unit)`，`asOf` 下的可见披露 = `status='ok' and available_date <= asOf` 的行，按 `(available_date, filings.source_ref, created_at, fact_id)` 升序排成序列；**当前值** = 序列最后一行；`disclosure_seq` = 位置（1 起）；`is_revision` = 值与序列前一行不同；`mapping_version` 不同的同 filing 行先按 `mapping_version` 取最大者再排序（映射升级后重跑会为同一 filing 写新 `mapping_version` 的行，读者只看最新映射）。

同值重复披露（10-K 重申上年数）各占一行、`is_revision=false`：这正是"哪份文件说过这个数"的证据，不去重（审计 #1）。

`getFactsAsOf(client, issuerId, {concepts, from, to, asOf, units?})`：按 `(issuer_id, concept)` 用 `selectAll` 取 `status='ok'`、`available_date lte asOf`、`period_end` 在 `[from, to]` 内的行，内存里按 K 分组排序，返回每个 K 的**全部**披露序列（读接口默认只返回当前值，`history=1` 时返回序列）。

SQL 口径（集成测试用它核对内存实现）：

```sql
select distinct on (concept, period_start, period_end, consolidation, unit) *
from financial_facts f join filings g using (filing_id)
where f.issuer_id = $1 and f.status = 'ok' and f.concept = any($2)
  and f.period_end between $3 and $4 and f.available_date <= $asOf
order by concept, period_start, period_end, consolidation, unit,
         f.mapping_version desc, f.available_date desc, g.source_ref desc, f.created_at desc, f.fact_id desc;
```

### 5.3 写入时的重复与歧义

- 候选的键 = K + `filing_id` + `mapping_version`。已存在（任何 `status`）→ 不写，计 `duplicates`（`status='quarantined'` 的已存在行也不重写：它的命运由隔离处理决定，§7.3）。
- 同一 filing、同一 K，解析出多个不同 `value`（同一标签在 companyfacts 中对同一 `accn+start+end+unit` 出现多条不同 `val`）→ 不写，隔离 `ambiguous_value`，`payload = {candidates: [...]}`。
- 计数：新写入且值与"写入前该 K 的当前可见值"相同或该 K 之前无披露 → `inserted`；值不同 → `versioned`；被规则隔离 → `quarantined`（不重复计入 inserted/versioned）。

### 5.4 并发与原子性

- **租约**（§4.4 函数）：处理一个发行人前 `claim_fact_sync_lease(issuer, batch, 600)`，失败则跳过并计 `skipped_summary(leased)`；处理完释放（`lease_until = null`）。崩溃的租约 10 分钟后自然过期。
- **暂存后发布**：所有新行以 `status='staged'` 插入；规则把该隔离的行 `update status='quarantined'`；最后 `publish_staged_facts(issuer, batch)` 一条语句把其余 `staged` 变 `ok`。读者要么看不到本批次，要么看到整批（审计 #6）。
- **崩溃清理**：获得租约后先 `delete financial_facts where issuer_id=$1 and status='staged' and batch_id <> $batch`（触发器允许删 staged），再开始。
- 23505（同键并发插入，理论上租约已排除）→ 该发行人 `failed`，`vintage_conflict` 改名 `duplicate_key`。

---

## 6. 采集

### 6.1 共用核心 `src/lib/facts/sync.ts`

```ts
export interface SyncIssuerInput { issuerId: string; market: 'US'|'CN'; fetchKey: string; sinceYear: number }
export interface SyncIssuerResult { outcome: 'published'|'failed'|'skipped'; counts: BatchCounts; errors: BatchError[]; filings: number; snapshotHashes: string[] }
export async function syncIssuerFacts(deps: SyncDeps, batchId: string, input: SyncIssuerInput): Promise<SyncIssuerResult>
export async function runFactsSync(deps: SyncDeps, opts: { market: 'US'|'CN'; limit: number; issuerIds?: string[]; dryRun: boolean; triggeredBy: TriggeredBy; deadlineMs?: number }): Promise<{ batchId: string|null; status: BatchStatus; perIssuer: Record<string, SyncIssuerResult> }>
```

`SyncDeps = { client: TableClient; storage: SnapshotStore; fetchUs: (cik10) => Promise<RawSnapshot>; fetchCn: (tsCode, sinceYear) => Promise<RawSnapshot[]>; linkCn?: (filing) => Promise<{document_ref, document_url} | null>; now: () => Date; codeVersion: string }`——网络与存储都是注入的，单测与离线集成测试不碰网络。

一次 `runFactsSync` = 一个 `ingest_batches` 行（`producer='facts-sync'`，`dataset='facts.us' | 'facts.cn'`，`tool_versions={mapping: MAPPING_VERSION, rules: RULES_VERSION, formula: FORMULA_VERSION, source: 'sec-companyfacts' | 'tushare-pro'}`，`code_version = VERCEL_GIT_COMMIT_SHA ?? git rev-parse HEAD`，脚本里同样；取不到则拒绝 `--apply`）。开始时先 `reconcileScope()`（§6.4，幂等），再按 `next_due_at asc, priority desc` 取 `priority > 0` 的发行人（`selectAll` 后内存排序），逐个：

1. 租约（§5.4）；超过 `deadlineMs`（cron 200 s）则不再取新发行人。
2. 崩溃清理。
3. 抓取（注入）→ `RawSnapshot[] {bytes, sha256, meta}`；上传快照（§4.6）。
4. 解析为候选事实 + 候选 filings（§6.2 / §6.3 的纯函数）；`sinceYear` 之前的期间跳过（`skipped_summary`）。
5. 读本发行人现有行（`selectAll` 按 `issuer_id`，只取键列 + value + status + available_date），计算 `planFactWrites(existing, candidates)`（§5.3；纯函数）。
6. 写 filings（`unique (source, source_ref)` 冲突 → 读回已有 `filing_id`），`insertMany` 新事实（`status='staged'`，分块 ≤ 500）。
7. 规则（§7）只对**本批次新行所在的 (filing, period, unit)** 评估，输入 = 新行 ∪ 该组已 `ok` 的行；失败 → `update status='quarantined'` + `quarantine()`。
8. `publish_staged_facts`。
9. A 股：`linkCn` 为 `document_ref is null` 的新 filing 补巨潮公告（§6.3）；失败不影响发布，计 `skipped_summary(cninfo_unlinked)`。
10. `materialize(issuerId)`（§8）。
11. 更新 `fact_sync_scope`：`last_success_at/next_due_at = now + 7d/last_status/lease_until = null`；失败时 `next_due_at = now + 1d`、`last_status='failed'`。

批次结束：`finishBatch`；`recordAttempt('facts.us'|'facts.cn', {ok: 至少一个发行人 published, cadence: 'daily'})`，`detail = {attempted, published, failed, skipped}`。每个发行人自己的新鲜度看 `last_success_at`（本期不进 `/admin/dq`）。

退出码与状态策略同计划一脚本：`partial`/`failed`/`rejected` → 非零。

### 6.2 EDGAR companyfacts 适配器 `src/lib/facts/providers/edgar-companyfacts.ts`

- 请求：`GET https://data.sec.gov/api/xbrl/companyfacts/CIK{10 位}.json`，头 `User-Agent: $EDGAR_USER_AGENT`（缺省用 `collectors/shared.ts` 的 `DEFAULT_USER_AGENT`）、`Accept-Encoding: gzip, deflate`；一批内串行，间隔 ≥ 120 ms；超时 60 s；`429/503` 退避 1→2→4→8 s 共 4 次，仍失败该发行人 `failed`（`sec_unavailable`）；`404` → `failed`（`no_companyfacts`，SEC 没有该 CIK 的 XBRL 数据）；响应 > 50 MB → `failed`（`snapshot_too_large`）。多个并行采集器共享 SEC 配额的问题本期靠"cron 与脚本不同时跑"约定，runbook 写明。
- 解析 `parseCompanyFacts(json, {concepts, sinceYear})` → `{candidates, filings, skipped: {reason, n}[]}`：
  - 对每个概念，收集 `facts['us-gaap'|'ifrs-full'|'dei'][tag].units[unit][]` 的条目；`unit` 归一后不在该概念允许集合 → `skipped(unit_not_allowed)`（不是错误）。
  - 按 §3 选取规则，在**同一 accn、同一 (start,end)、同一单位**内取第一个有条目的标签。
  - 条目 `{start?, end, val, accn, fy, fp, form, filed, frame?}` → 候选 `{concept, source_concept, period_start: start ?? null, period_end: end, duration: classify(start,end), value: val, unit, filing: {source_ref: accn, form_type: form（不在枚举 → 'other'，仍写入）, fiscal_year: fy, fiscal_period: fp, available_date: filed}}`。`frame` 只进隔离 payload。
  - `filings.period_end` = 该 accn 下 duration 条目的最大 `end`（instant/dei 不参与）；没有 duration 条目则 null。
  - 同一 accn 同一标签同一 (start,end,unit) 多条且 `val` 不同 → `ambiguous_value`。
- `fy/fp` 是 filing 的属性，**不**用于事实行（事实行只有期间与 `duration`）。
- 范围默认 `sinceYear = 当前年 − 10`。

### 6.3 Tushare 三表适配器 `src/lib/facts/providers/tushare-statements.ts`

- 新增 `tushareCallRaw(api, params, fields, {limit, offset}) → {bytes: Uint8Array, json: TushareResp}`：保留响应原文与 `has_more`、`request_id`；token 只出现在请求体，不进 `meta`。分页：`limit=2000`，`has_more=true` 则 `offset += limit` 继续，每页一个快照。
- 对 `api ∈ {income, balancesheet, cashflow}` × `report_type ∈ {1, 4, 5}` 调用（每个发行人 9 次起；每个接口需 ≥ 2000 积分，只能按单只股票取历史）。`fields` = `ts_code,ann_date,f_ann_date,end_date,report_type,comp_type,end_type,update_flag` + 该表在 §3 用到的值字段（cashflow 另加 `is_calc`，`is_calc=1` 的计算行跳过并计 `skipped_summary(calculated_row)`）；`fields` 字符串写入 `tool_versions.tushare_fields_<api>`。`start_date = sinceYear0101`（公告日下界）。
- 三种报表类型（Tushare 文档原文，2026-11-04 核对）：`1` 合并报表 = "上市公司最新报表（默认）"；`4` 调整合并报表 = "本年度公布上年同期的财务报表数据，报告期为上年度"；`5` 调整前合并报表 = "数据发生变更，将原数据进行保留，即调整前的原数据"。含义：type 1 是**最新**版本（更正后被覆盖），被覆盖前的原值保留在 type 5，次年报告中重述的上年同期数在 type 4。三者各自的 `f_ann_date ?? ann_date` 给出各自的 `available_date`，合起来是完整的披露序列。**F2-4 第一步**用一家有重述记录的公司核对：type 1 被更正后其公告日是否变为更正公告日、type 5 的公告日是否仍是原始公告日；核对记录写入 runbook；某类行的公告日不可信时该类整体不加载并记入 §15。
- `update_flag`（文档："更新标志(1最新)"）只进隔离 payload，不决定顺序。
- 每行 → 若干候选：`sum(...)` 映射在任一加数缺失时**不写**；`period_start`：duration 概念 = `end_date` 同年 01-01（A 股三表为年初至今累计）；instant = null；`duration` 由 `classify()` 得 `3M/6M/9M/12M`（`end_date` 月份 03/06/09/12 以外 → `odd_duration`）。
- filing：`source_ref = '<ts_code>:<end_date>:<report_type>:<f_ann_date ?? ann_date>'`（同一公告日的年报与一季报因 `end_date` 不同而不同，审计 #11）；`origin` 按后缀（`.SH→sse`、`.SZ→szse`、`.BJ→bse`）；`form_type`：type 1/5 按 `end_date` 月份（`12→annual`、`06→semiannual`、`03→q1`、`09→q3`），type 4 → `restatement`；`fiscal_year = end_date 年`，`fiscal_period` 按月份 `Q1/H1/9M/FY`；`period_end = end_date`。
- **巨潮挂接 `linkCn`**（`src/lib/facts/providers/cninfo-link.ts`，复用 `collectors/cninfo.ts`）：对 `form_type in (annual, semiannual, q1, q3)` 且 `document_ref is null` 的 filing，用 `issuers.cninfo_org_id`（为空则 `topSearch` 解析并回写 `issuers.cninfo_org_id`）查 `hisAnnouncement`（`seDate = available_date ± 3 天`，`category` 按 form_type 取年报/半年报/一季报/三季报类别，`column` 按 origin），从结果中选标题含"年度报告"/"半年度报告"/"第一季度报告"/"第三季度报告"且**不含**"摘要"、"英文"、"更正"（type 4/5 不挂接）的第一条；命中 → `document_ref = announcementId`，`document_url = static.cninfo.com.cn/<adjunctUrl>`；未命中或多条无法区分 → 不写，`skipped_summary(cninfo_unlinked)`。只写元数据，不下载 PDF。读接口把 `document_url` 为空的 CN filing 标 `citation: 'pending'`，有则 `'linked'`（§9）。
- 覆盖检查：解析后按年统计 `distinct end_date`，`sinceYear` 之后的完整年份少于 4 个期末 → 回执 `{code:'coverage_gap', key: issuer_id, message: 'years: …'}`（非信息码，使批次 `partial`，提示人工看配额/上市时间；新上市公司的早年缺口按 `issuer_securities.valid_from` 之前的年份不计）。
- 配额/限频：`TushareError` 的 `code` 或消息含"积分"/"限制"/"频率"，或 HTTP 429 → 本批次剩余发行人跳过，回执 `{code:'quota_exhausted'}`（非信息码 → `partial`）。

### 6.4 范围 `src/lib/facts/scope.ts::reconcileScope()`

每次 cron/脚本开始时执行（幂等；service role）：
- 美股：`security_universe_memberships` 中 `universe in ('sp500','nasdaq_top500','us_china') and is_active`（`selectAll`）的 ticker → `resolveIssuer({ticker}, {today})` → 发行人有 `cik` 才入，`reasons += 'universe:<u>'`、`priority 10`、`fetch_key = cik 左补零 10 位`；无 cik → `skipped_summary(no_cik)`。
- A 股：`research_entity_keys where in_scope and issuer_id is not null`（跨用户，去重，不记用户）→ 该发行人 `issuer_securities` 中 `is_primary and valid_to is null and ticker ~ /\.(SH|SZ|BJ)$/`（内存过滤）→ `fetch_key = ticker`，`reasons += 'cohort'`、`priority 10`；无 A 股 ticker → `skipped_summary(no_a_share_ticker)`。
- 新发行人 `next_due_at = now()`；已存在的只更新 `reasons/priority/fetch_key`；不再出现在任何来源的发行人 `reasons = []`、`priority = 0`（保留行与历史）。
- **owner 决策项**：自选股（`watchlist_items`）是否进入范围。进入意味着"某人自选了 X"会通过 X 的事实出现在公共表里被推断（审计 #29）。本规格默认**不进入**；owner 同意后加 `reason='watchlist'`、`priority 5`，一行代码。

### 6.5 触发

- `GET|POST /api/cron/facts-sync?market=US|CN[&limit=n]`：`CRON_SECRET` Bearer（复制 `securities-sync` 的 `authorized()`，不抽公共模块）；`maxDuration=300`；`deadlineMs=200_000`；默认 `limit` 美股 25、A 股 25（一个发行人美股约 3–6 s 含 5–50 MB 下载与上传，A 股 9+ 次调用约 5 s）。`vercel.json`：`facts-sync?market=US` 每 4 小时（`5 */4 * * *`），`facts-sync?market=CN` 每 4 小时错开（`35 */4 * * *`）。美股约 1,000 个发行人 ÷ 150/天 ≈ 7 天滚一遍；A 股队列（百余家）每天可滚一遍，`next_due_at` 7 天使其实际每周一次。超时/崩溃留下的 `running` 批次由下一次运行在同发行人租约过期后清理暂存行；`ingest_batches` 里悬空的 `running` 行由 runbook 的 SQL 标 `failed`。
- `scripts/facts/sync.ts --market US|CN [--issuer <issuer_id|ticker>]... [--limit n] [--since-year y] [--apply]`：本机回填，无截止时间；dry-run 打印候选数、隔离数、覆盖检查，不上传快照、不建批次。环境变量同计划一脚本（`node --env-file`），另需 `TUSHARE_TOKEN`（CN）与 `EDGAR_USER_AGENT`（US）。
- `scripts/facts/materialize.ts [--issuer …] [--apply]`：重算 `financial_metrics`。
- `scripts/facts/record-fixture.ts --edgar <cik> | --tushare <ts_code>`：录制夹具（§11.1）。

---

## 7. 规则与隔离

### 7.1 隔离

写入 `dq_quarantine`（`dataset` 同批次；`table_name='financial_facts'`；`payload` 为对象）：

| reason_code | 触发 | natural_key | payload |
|---|---|---|---|
| `ambiguous_value` | §5.3 | `<issuer>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<source_ref>` | `{candidates: [...]}`，无事实行 |
| `odd_duration` | §4.2 分类失败 | 同上 | `{candidate}`，无事实行 |
| `missing_available_date` | §5.1 | `<issuer>:<ts_code>:<end_date>:<report_type>` | `{row}`，无事实行 |
| `identity_bs` | `identityRule(total_assets, liabilities_and_equity, 0.005)`；无 `liabilities_and_equity` 时 `identityRule(total_assets, total_liabilities + equity_total, 0.005)`；输入单位不一致或任一缺 → 不检 | `<issuer>:BS:<period_end>:<unit>:<source_ref>` | `{fact_ids: [...], rule, detail}` |
| `identity_gp` | `gross_profit` 存在且 `identityRule(gross_profit, revenue − cost_of_revenue, 0.005)` 失败（同 filing、同期、同单位） | `<issuer>:IS:<period_start>:<period_end>:<unit>:<source_ref>` | 同上 |

恒等式失败隔离的是该 filing 该期该单位该报表的**本批次新行**（`fact_ids`）；该组已 `ok` 的旧行不动。`dq_quarantine_open_key_uniq` 保证同键 open 项唯一。

### 7.2 警告（写入，进回执）

`rangeRule('gross_margin_range', (revenue − cost_of_revenue)/revenue, −1, 1)` 与 `jumpRule('revenue_jump', 本期, 上年同期当前可见值, 10)` 失败**不隔离**：行照常发布；回执 `errors` 里**每条规则一个**汇总条目 `{code:'rule_warning_summary', key: ruleId, message: 'n=<count>; sample=<最多 10 个 natural_key>'}`（审计 B4：不逐行写，避免挤掉 `failed` 条目）。`rule_warning_summary` 加入 `INFO_CODES`。

### 7.3 处理钩子

`src/lib/dq/facts-resolver.ts`（只做 facts，不建通用注册表）：`dataset` 以 `facts.` 开头的隔离项，`resolved_accept` 时把 `payload.fact_ids` 对应行 `status` 置 `ok`（`quarantined→ok`），然后 `materialize(issuer_id)`；`resolved_reject` 不动（行保持 `quarantined`，追加写不删）。无 `fact_ids` 的项（§7.1 前三种）为空操作。

`POST /api/admin/dq/quarantine/[id]`：状态翻转成功后调用钩子；结果写入 `dq_quarantine.detail.hook = {state: 'done'|'failed', at, message?}`（`detail` 可更新）。若项已是 `resolved_accept` 且 `detail.hook.state != 'done'`，再次 POST 不返回 409 而是重跑钩子（幂等）并返回 `{resolved: 'already_resolved', hook: ...}`；审计日志记录钩子结果。

---

## 8. 派生层 `src/lib/facts/derive.ts`

`FORMULA_VERSION='facts-derive/1.0'`。输入是 `getFactsAsOf` 的**当前值**（每个 K 的最新可见披露）；全部纯函数；输出 `{metric, period_start, period_end, duration, value, unit, inputs: [{fact_id, concept, filing_id, available_date}]}`。约定：
- 任一输入缺失、输入单位不一致、分母为 0 → 不产出该行（不写 null、不换算、不用代理）。
- 期间匹配是**精确**的：同期 = `period_start` 与 `period_end` 都相等；上年同期 = 同 `duration` 且 `period_end` 相差 350–380 天；期初 = `period_end` 前 350–380 天的 instant 值；相邻 = 下一段 `period_start = 上一段 period_end + 1 天`。
- 依赖先于过滤：读接口的 `from/to` 只裁剪**输出**，计算时加载 `from − 2 年` 起的事实。
- 美股 `revenue` 与 A 股 `revenue_operating` 都存在时（不会：美股不写 `revenue_operating`），市场决定分母：US 用 `revenue`，CN 用 `revenue_operating`；`inputs` 如实记录。

| metric | 公式 | duration | 备注 |
|---|---|---|---|
| gross_margin | US：`gross_profit / revenue`，无 `gross_profit` 时 `(revenue − cost_of_revenue) / revenue`；CN：`(revenue_operating − cost_of_revenue) / revenue_operating` | 同事实 | 金融类公司无 `cost_of_revenue` → 缺 |
| net_margin | `net_income_parent / revenue`（CN 分母 `revenue_operating`） | 同事实 | |
| fcf | `operating_cash_flow − capex` | 同事实 | |
| borrowings_total | `short_term_borrowings + long_term_borrowings (+ bonds_payable，CN)` | INSTANT | 只是借款合计，不是全部债务；名称如实 |
| q_single_<c> | 单季值：若源数据有该季 `3M` 事实则直接用；否则由 YTD 链差分：`6M − 3M`、`9M − 6M`、`12M − 9M`（同 `period_start`，被减数 `period_end` 更晚；美股 10-Q 现金流为年初至今，与 A 股同法，审计 #10） | 3M | 概念：revenue、net_income_parent、operating_income、operating_cash_flow、capex；差分可逆性属性测试 |
| ttm_<c> | 四个**相邻**单季之和（§ 相邻定义；单位一致） | TTM，`period_start` = 第一季起点，`period_end` = 第四季期末 | 同上概念 |
| revenue_yoy / net_income_yoy | `(本期 − 上年同期) / abs(上年同期)` | 同事实 | |
| roe | `ttm_net_income_parent / avg(equity_parent 期初, equity_parent 期末)`，期末 = TTM 窗口 `period_end` | TTM | |

`materialize(issuerId)`：`as_of = 今天`，算出全部行，删该发行人全部物化行（含旧 `formula_version`），`insertMany`。重建测试比较语义字段（排除 `computed_at`）。

---

## 9. 读取接口

共同约定：公共只读，`getAnonSupabase()` + `supabaseTableClient`；`dynamic='force-dynamic'`；参数重复 → 400 `duplicate_parameter`；ticker 校验与 `resolve` 路由同正则；`resolveIssuer({ticker}, {today})`（**今天**的归属），无结果 → 404 `unknown_ticker`；`asOf` 必须是 `YYYY-MM-DD` 且 ≤ 今天，否则 400；错误与空结果 `no-store`；成功响应 `Cache-Control`：有 `asOf` 且早于今天 → `public, max-age=3600, s-maxage=86400`（迟到的历史文件、隔离接受会改变历史答案，这是容忍度不是不变性）；否则 `successCacheControl(now)`。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/facts/[ticker]` | `concepts`（必填，白名单，≤ `FACT_CONCEPTS.length`）、`from`/`to`（`period_end` 范围，默认近 10 年）、`asOf`、`durations`（`3M,6M,9M,12M,INSTANT` 子集）、`history`（`1` 返回披露序列）、`limit`（K 数上限，默认 200、最大 1000） | `{issuerId, ticker, asOf, mappingVersion, facts: [{factId, concept, sourceConcept, statement, periodStart, periodEnd, duration, value: value_text, unit, availableDate, filingId, disclosureSeq, isRevision, mappingVersion, history?: [...]}], filings: [{filingId, formType, periodEnd, availableDate, sourceRef, url, documentRef, documentUrl, citation: 'linked'\|'pending'\|'edgar'}]}` |
| `GET /api/facts/[ticker]/metrics` | `metrics`（白名单 §8）、`from`/`to`、`asOf`、`limit` | `{issuerId, ticker, asOf, formulaVersion, metrics: [{metric, periodStart, periodEnd, duration, value: value_text, unit, inputs}]}`；无 `asOf` 读 `financial_metrics`（过滤当前 `formula_version`），有则实时 `derive` |
| `GET /api/filings/[ticker]` | `from`/`to`（`available_date` 范围）、`limit`（默认 40、最大 200） | `{issuerId, ticker, filings: [...]}` |
| `GET|POST /api/cron/facts-sync` | §6.5 | 批次回执 |

`/api/financials/[ticker]` 响应加 `Deprecation: true` 与 `Link: </api/facts/{ticker}>; rel="successor-version"`，行为不变。

---

## 10. 错误处理

| 情形 | 行为 | 计数 / 错误码 | 批次影响 |
|---|---|---|---|
| SEC 429/503 四次退避后仍失败 | 该发行人跳过 | `failed`，`sec_unavailable` | partial |
| SEC 404 | 同上 | `failed`，`no_companyfacts` | partial |
| 快照上传失败 | 该发行人不写任何行 | `failed`，`snapshot_upload_failed` | partial |
| Tushare 配额/限频 | 本批次剩余发行人跳过 | `quota_exhausted`（非信息码） | partial |
| Tushare 返回空（新股、退市） | 不写 | `skipped_summary(no_rows)` | 无 |
| 覆盖缺口 | 照常写入 | `coverage_gap`（非信息码） | partial |
| 租约被占 | 跳过 | `skipped_summary(leased)` | 无 |
| 发行人 `status='merged'` | 跳过（事实归历史发行人，合并后的读取归属由计划三定） | `skipped_summary(issuer_merged)` | 无 |
| 候选解析异常（字段类型错） | 该发行人 `failed`，错误含字段名不含值 | `parse_error` | partial |
| 23505 | 该发行人 `failed` | `duplicate_key` | partial |
| 截止时间到 | 未处理的发行人不计入 | 回执 `detail.deadline_hit=true` | 无 |
| 整批 `fetched>0` 但无结果 | `finishBatch` 自动 `failed`（`unaccounted`） | — | failed |
| 读接口解析不到 ticker | 404 | `unknown_ticker` | — |
| 读接口参数非法 | 400 | `invalid_parameter:<name>` | — |

---

## 11. 测试策略

### 11.1 单元（vitest，内存 `TableClient`）

- `concepts.test.ts`：每个概念有 `usGaap`/`ifrs`/`tushare` 至少一个；`sum` 字段在 fields 列表内；目录快照测试（改映射必须改 `MAPPING_VERSION`）。
- `units.test.ts`：归一表与反向表；`unitRule` 允许集合。
- `edgar-companyfacts.test.ts`：夹具 `fixtures/edgar/CIK0000320193.trimmed.json`（AAPL companyfacts **真实响应**，只保留 §3 用到的标签与 2019 年起的条目；`record-fixture.ts --edgar 320193` 生成，文件头记录录制时间与原始 sha256）：按期间回退、`fy/fp` 不进事实行、封面股数标记、`duration` 分类（AAPL 财年 9 月底）、同 accn 重复条目、`ambiguous_value`、`sinceYear` 过滤、`filings.period_end` 不受 dei 影响；第二个夹具为 us_china 宇宙内一家 `facts['ifrs-full']` 存在的申报人（录制时在宇宙内搜索；找不到则记录"宇宙内无 IFRS 申报人"并跳过 IFRS 路径测试，不伪造）。
- `tushare-statements.test.ts`：夹具 `fixtures/tushare/600519.SH.{income,balancesheet,cashflow}.rt{1,4,5}.json`（真实响应，`record-fixture.ts --tushare 600519.SH`，需要 token，§14）：YTD `period_start`、`duration`、`sum` 缺一不写、`f_ann_date ?? ann_date`、type 1/4/5 各自的 filing 与可得日期、`is_calc` 跳过、`missing_available_date`、覆盖检查、`source_ref` 形状。
- `cninfo-link.test.ts`：用 `collectors/cninfo.test.ts` 的夹具风格（录制的 `hisAnnouncement` 响应）测标题筛选、摘要/英文/更正排除、多条不明确不写。
- `plan.test.ts`（`planFactWrites`）：重复键跳过（含 quarantined）、`inserted/versioned` 计数、`mapping_version` 新行。
- `rules.test.ts`（facts 层）：BS 恒等两种式子、GP 恒等、单位不一致不检、警告汇总条目形状。
- `read.test.ts`：`getFactsAsOf` 时点语义（asOf 早于修订取旧值；同值重复披露各占一行且 `is_revision=false`；`quarantined/staged` 不可见；`from/to`；`mapping_version` 优先）。
- `derive.test.ts`：每个指标的缺失即缺失；单位不一致不算；YTD 差分（含 10-Q 现金流）；TTM 相邻性；YoY 窗口；ROE 期初；`from/to` 不影响值。
- 属性测试（仓库没有 `fast-check`，不新增依赖；种子随机 200 次）：随机 YTD 序列 → 差分 → 累加恒等；随机披露序列（含迟到插入）→ 读取顺序只依赖 `available_date` 与 tie-break。
- `sync.test.ts`：用假适配器跑 `runFactsSync`：租约失败跳过；截止时间；暂存→发布计数；崩溃清理；配额错误使批次 `partial`；`code_version` 缺失时拒绝 apply。
- 路由测试：参数校验、缓存头、404、`value_text`、`citation`、`Deprecation` 头；钩子重跑路径。

### 11.2 数据库（`test:db`，真实 PostgreSQL）

`src/lib/facts/facts.integration.test.ts`（**加入 `criticalSuites`**）：迁移可重放（`replayMigration` 助手）；`unique nulls not distinct`；复合外键（不同发行人的 filing 被拒）；追加写触发器（允许/禁止的 `status` 迁移、删 staged 可、删 ok 不可、改值列不可）；两个 SQL 函数（租约互斥与过期；发布只影响本批次 staged）；RLS 以真实角色：`anon` 读不到 `staged/quarantined`、读不到 `fact_sync_scope`、不能执行两个函数；`value_text` 与 `numeric` 一致（含 15 位整数与两位小数）。

### 11.3 离线集成（录制回放）

`src/lib/facts/sync.integration.test.ts`（`criticalSuites`）：注入 §11.1 夹具作为 `fetchUs/fetchCn`，内存 `SnapshotStore`，真实 PostgreSQL：对 AAPL、MSFT（第三个美股夹具）与（夹具存在时）600519.SH 跑 `runFactsSync` 两遍——第一遍 `inserted>0`、全部 `ok`；第二遍全部 `duplicates`、批次 `success`、无新 filings；再注入一份**更晚 filing** 中同期不同值的夹具 → `versioned=1`，`asOf` 在两次 `available_date` 之间回放旧值，之后回放新值；`materialize` 两次语义一致。A 股部分在夹具缺失时整段 `describe.skip`，并且这段**不在** critical 断言里（A 股夹具录入后移入）。

### 11.4 黄金断言（一手文件）

`src/lib/facts/fixtures/gold/plan2.json`：6 家（AAPL、MSFT、一家 IFRS 20-F 申报人（若宇宙内存在）、600519.SH、000333.SZ、600036.SH）× 2 期（最近年报与前一年报）× 6 科目（revenue、net_income_parent、total_assets、equity_total、operating_cash_flow、shares_outstanding）。每条记 `{issuer, concept, period_end（shares_outstanding 用 dei 时记封面日期）, unit, value, source: {document, page_or_row, url}, recorded_by, recorded_at}`，**值由人从 10-K / 年报 PDF 原文抄录**（EDGAR Financial Report 页或巨潮 PDF 页码），不从 API 抄。测试在 §11.3 之后断言黄金条目全部在 `ok` 事实中且数值相等；美股条目在 critical 范围，A 股条目随夹具一起进入。

### 11.5 清单规则

每个含 `S4_TEST_STATE` 的新 `.test.ts` 加入 `scripts/ci/research-checks.ts::criticalSuites`；`npm test`、`typecheck`、`lint`、`test:db`、`test:migrations` 全绿才算完成任务（本机 `test:db` 的负载级联失败按记忆中的隔离法复核）。

---

## 12. 分期（供计划二拆任务）

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| F2-0 迁移、函数与类型 | `20261106090000_financial_facts.sql`（四表、桶、两个函数、触发器、权限）、锁文件、`database.types.ts`、`TableClient` 扩展（`lte`、`insertMany`）、集成测试（§11.2） | `test:db`、`test:migrations` 绿 |
| F2-1 概念、单位、规划、规则、读取 | `concepts.ts`、`units.ts`、`plan.ts`、`rules.ts`（facts 层）、`read.ts`、`INFO_CODES += rule_warning_summary` | 单测绿 |
| F2-2 快照存储与同步核心 | `snapshot-store.ts`（Supabase storage + 内存）、`sync.ts`（租约、截止、暂存/发布、清理）、`facts-resolver.ts` 与 `/api/admin/dq/quarantine/[id]` 接入 | `sync.test.ts` 绿 |
| F2-3 EDGAR 适配器 | `edgar-companyfacts.ts` + AAPL/MSFT/IFRS 夹具 + `record-fixture.ts --edgar` | 单测绿；离线集成（美股）绿 |
| F2-4 Tushare 适配器与巨潮挂接 | `tushareCallRaw`、`tushare-statements.ts`、`cninfo-link.ts`、600519 夹具（§14 前置）、type 1/4/5 公告日核对记录 | 单测绿；离线集成（A 股）绿或按 §11.3 明确跳过 |
| F2-5 范围、脚本、cron | `scope.ts`、`sync.ts` 脚本、`materialize.ts`、`/api/cron/facts-sync`、`vercel.json` | dry-run 对真实 SEC 跑 3 家（无需 token）；回执落库 |
| F2-6 派生与读接口 | `derive.ts`、`financial_metrics` 物化、三个路由、`/api/financials` 弃用头 | 黄金断言（美股）绿；重算一致 |
| F2-7 文档与收尾 | runbook 新章节（表、路径约定、可得日期规则、录制夹具、核对记录、悬空批次 SQL、回滚、cron）、规格一 §4 顶部指向本规格、本规格 §16 偏差记录 | 全量门禁绿 |

工作量（熟悉仓库的高级工程师）：F2-0 1.5 人日；F2-1 2；F2-2 2.5；F2-3 2；F2-4 3；F2-5 2；F2-6 2；F2-7 1。合计约 16 人日，不含 Tushare 配额等待与黄金集抄录。

验收样例：规格一 §10 的 5、6 两条适用（1、2 由本规格 §1.1 的新表述取代）；新增：
7. `GET /api/facts/AAPL?concepts=revenue&durations=12M&asOf=2024-06-30` 返回 period_end 2023-09-30 的行 `availableDate=2023-11-03`、`disclosureSeq=1`；`asOf=2025-06-30` 返回同期 `disclosureSeq=2`（FY2024 10-K 重申）且 `isRevision=false`。
8. 600519.SH 2023 年报 `revenue`（营业总收入）与巨潮年报 PDF 第 N 页数字相等，且该 filing 的 `documentUrl` 指向那份 PDF（黄金断言）。
9. 隔离一条 `identity_bs` 项后 `GET /api/facts/...` 不返回该期该批次的 BS 新行；`/admin/dq` 接受后返回，且 `financial_metrics` 已重算。
10. 一次 cron 运行在 200 s 截止后结束，回执 `deadline_hit=true`，已处理发行人全部发布、未处理发行人无 `staged` 残留。

---

## 13. 独立验证

- Codex（gpt-6-astra，medium）审计本规格（已做一轮，报告 `docs/audits/2026-11-04-data-foundation-2/01-*.md`；修订后再审一轮）与每个任务提交。
- 独立 Claude 复审（`02-*.md`），同上。
- 黄金断言由实施者之外的人抄录（owner 或指定审核人），抄录记录含文件与页码。
- 实时 SEC dry-run 3 家（无 token 即可）作为联网冒烟；Tushare 联网冒烟在 owner 提供 token 的环境做一次 dry-run，同时完成 type 1/4/5 公告日核对。
- 专家抽样（规格一 §11）中"营业总收入 vs 营业收入"、"股利含利息"、"利息费用 vs 利息支出"三处口径在 §3 已显式分列，仍需会计背景的人复核一次。

---

## 14. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| 提供 `TUSHARE_TOKEN` 给录制夹具与 A 股冒烟的环境（放在仓库外的 env 文件，`node --env-file` 引用；不进 git、不进聊天） | owner | F2-4 开始前；缺失时 A 股夹具测试按 §11.3 跳过并在 PR 中标明 |
| 决定自选股是否进入同步范围（§6.4） | owner | 计划编写前；默认不进入 |
| Vercel 环境变量 `EDGAR_USER_AGENT`（真实联系方式）、确认 `TUSHARE_TOKEN`、`CRON_SECRET` 已存在 | owner | 部署前 |
| 生产执行迁移（含建桶与函数）；首轮 `sync.ts --market US --limit 20 --apply` 观察回执；cron 与脚本不同时运行 | owner（CLI 部署流程） | 合并后 |
| 黄金集抄录 | owner / 审核人 | F2-6 前 |

---

## 15. 开放问题

1. Tushare type 1 行被更正后，其 `ann_date/f_ann_date` 是否变为更正公告日；type 5 的公告日是否仍是原始公告日；同一公告日能否出现 type 1 与 type 5 两行——F2-4 第一步核对，决定三类行的加载。
2. companyfacts 对多类别股本公司（GOOGL、BRK）的 `dei:EntityCommonStockSharesOutstanding`：是省略还是按类别给出多条同期条目（后者会被 `ambiguous_value` 隔离）——AAPL/MSFT 夹具之外另抓一家核对，结果记入 runbook。
3. 美股 ADR 用 6-K 披露的公司 companyfacts 覆盖程度（SEC 文档说 XBRL API 覆盖整个申报实体的非自定义标签；6-K 附带 XBRL 时应可得）——按 `no_companyfacts`/缺失如实记录，不假设。
4. SEC `acceptanceDateTime`（submissions API）补录以获得日内精度——计划三。
5. 合并后的发行人（`status='merged'`）历史事实的读取归属——计划三。
6. `financial_history` 表→视图——等公司研究规格确定读者。
7. 自选股进入范围——owner 决策（§6.4）。

---

## 16. 实施记录与偏差

（计划二落地后补记，格式同规格一 §14。）
