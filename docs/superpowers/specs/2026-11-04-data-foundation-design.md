# 共用数据底座设计规格 · F1 实体主数据 + F2 披露事实库 + F5 数据质量约定

日期：2026-11-04
状态：草案，待 owner 评审
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格是"先共用底座"的第一份；F3 文档管道升级、F4 判断层框架、F6 评测黄金集另立规格。
已定决策：首份规格含 F1 + F2 + F5；美股事实来源 EDGAR companyfacts；A 股事实来源 Tushare 三表 + 公告日期字段（上游记为交易所定期报告），巨潮 PDF/XBRL 作抽样对账；港股事实延后到 F3（需要 PDF 抽取）。

---

## 1. 目标与非目标

### 1.1 目标

1. **一个发行人一个 ID。** 全局 `issuers` 表把 A/H/US 多个证券代码、CIK、LEI、统一社会信用代码、ISIN、FIGI 归到同一发行人；现有两套主数据（全局 `stocks_universe`、按用户的 `research_entity_keys`）都挂到它上面，不再各自为政。
2. **财务数字成为时点事实。** `financial_facts` 存"当时披露的值"，每个值带 `available_at`、来源文件、原始字段名、版本序号；重述不覆盖，只追加。任何历史时点 `asOf` 都能回放当时可见的报表。
3. **会计恒等式与双来源对账自动化。** 毛利 = 营收 − 营业成本、资产 = 负债 + 权益、现金流三项之和 ≈ 现金变动等约束进入写入路径；EDGAR 与 10-K 文本、Tushare 与巨潮原文按样本对账，差异进隔离队列。
4. **一套通用的质量设施**：批次回执、隔离队列、新鲜度登记、对账结果，供宏观、行业、公司、研报四个模块共用。

成功标准：对 S&P 500 + nasdaq_top500 + us_china 三个宇宙的美股和 `in_scope` A 股队列，能用 `asOf=2024-06-30` 回放出当时可见的最近四期合并报表；回放结果与保存的快照逐字段一致；与 10 家公司的原文抽样对账差异 ≤ 0.5%。

### 1.2 本规格之外

- 港股财务事实（依赖 F3 的 PDF 版面解析）。
- 申万/中证历史成分的**加载**（表结构在本规格，加载与授权在行业研究规格）。
- 判断层（预测登记、结算、校准）——F4。
- 文档原文下载与页码引用——F3。
- 任何页面。本规格只交付数据、接口、管理页中的质量看板。

---

## 2. 现状（2026-11-04 仓库勘察事实）

| 领域 | 现状 | 影响 |
|---|---|---|
| 证券主数据 | `stocks_universe`（ticker 主键，`symbol/exchange/asset_type/currency/list_status/…`）+ `security_aliases` + `security_universe_memberships`（7 个宇宙）+ 同步运行/暂存/发现候选表（`supabase/migrations/20260715130000_security_master_data.sql`）；代码归一在 `src/lib/securities/ticker.ts` | 证券层保留不动，作为发行人下的证券 |
| 研究实体 | 按用户的 `research_entity_keys`（LEI/USCI/CIK/cninfo_org_id）与 `research_entity_securities`（exchange_code/isin/valid_from）；ISIN 从未填充；无 FIGI；与 `stocks_universe` 无关联（`20260926010000_research_entity_keys.sql`） | 需要全局发行人表作桥 |
| 财务事实 | `financial_history` 无写入者；报表由 `src/lib/data/sources/tushare.ts` 实时拉取（`income/balancesheet/cashflow`，`report_type:1`，只取年报行，不请求 `ann_date/f_ann_date/update_flag`），不落库；无 EDGAR companyfacts | 事实库从零建 |
| 时点概念 | 仅文档库有 `available_at` + `source_version`（`20260925230000_research_source_extension.sql`）；财务数据无 | 复用其约定 |
| 快照/版本 | S4 账本用 canonical JSON sha256 作 `snapshot_id`，append-only 触发器（`src/lib/research/s4/ledger.ts`，`ingest/pa-v1/json.js`） | 沿用 digest 与 append-only |
| 质量 | 证券同步有暂存门禁（`src/lib/securities/sync/validate.ts`，阈值在 `thresholds.ts`，失败标 rejected）；无服务端隔离表；无财务新鲜度 | 把门禁模式泛化成 F5 |
| 存储 | 仅一个私有桶 `security-snapshots`（JSON，50 MB） | 新增 `disclosure-raw` 桶 |
| 迁移 | 最新 `20261018150000_anchor_runner_cache_read.sql`；`migrations.lock.json` 只锁到 `20261005175000`，新迁移时间戳必须晚于已锁最新；`database.types.ts` 手工维护且落后 | 迁移后补锁、补类型 |

---

## 3. F1 实体主数据统一

### 3.1 模型

```
issuers (全局，公共只读)
  issuer_id uuid PK
  canonical_name_zh, canonical_name_en
  country_code, lei, cik, usci, cninfo_org_id, hkex_stock_code_primary
  status ('active'|'merged'|'dissolved'), merged_into issuer_id
  provenance jsonb  -- 每个标识符的来源与时间
  created_at, updated_at

issuer_securities
  issuer_id FK, ticker FK stocks_universe(ticker)
  isin, figi, share_class ('A'|'H'|'ADR'|'common'|...), is_primary bool
  valid_from date, valid_to date null
  source, provenance jsonb
  PK (issuer_id, ticker, valid_from)
  UNIQUE (ticker, valid_from)        -- 一个证券同一时刻只属于一个发行人

issuer_identifier_claims               -- 冲突与待审
  id, issuer_id, id_type ('lei'|'cik'|'usci'|'isin'|'figi'|'cninfo_org_id'), value, source, confidence, status ('accepted'|'pending'|'rejected'), created_at

industry_classifications               -- 分类标准版本（只建表，行业规格加载）
  scheme ('sw2021'|'sw2014'|'gics'|'csrc'|'custom'), version, code, level, name_zh, name_en, parent_code
  PK (scheme, version, code)

issuer_industry_memberships            -- 时点成分（只建表，行业规格加载）
  issuer_id, scheme, version, code, valid_from, valid_to null, source, provenance
  PK (issuer_id, scheme, version, code, valid_from)
```

`research_entity_keys` 新增可空列 `issuer_id uuid references issuers`；`research_entity_securities` 新增 `ticker` 可空列指向 `stocks_universe`。两张按用户的表继续存在（用户私有的 cohort / in_scope / 备注），但标识符的"真值"迁到 `issuers`。

### 3.2 标识符来源与解析顺序

| 标识符 | 来源 | 工具/脚本 | 备注 |
|---|---|---|---|
| CIK ↔ 美股 ticker | SEC `company_tickers.json`、`company_tickers_exchange.json` | 已有 `scripts/entity-keys/parse-sec-tickers.ts`，改为写 `issuers`/`issuer_securities` | 免费，日更 |
| LEI ↔ ISIN | GLEIF ISIN-LEI 映射 CSV | 已有 `parse-gleif-isin-lei.ts` | 免费 |
| 统一社会信用代码、巨潮 orgId | 巨潮 | 已有 `fill-cninfo-org-id.ts` | A 股 |
| ISIN（A 股 CNE…、港股 HK…、美股 US…） | GLEIF 映射；交易所代码表；OpenFIGI 返回 | 新 `scripts/entity-keys/fill-isin.ts` | A 股 ISIN 规则可由代码推导作兜底，并标 `provenance.method='derived'` |
| FIGI | OpenFIGI v3 `/mapping`（按 ticker + exchCode，或 ISIN） | 新 `src/lib/entities/providers/openfigi.ts` | 免费 key，限速 25 req/min；使用条款见开放问题 |
| A/H 双重上市配对 | 港交所 A+H 名单、GLEIF 同 LEI、名称归一 | 新 `scripts/entity-keys/link-ah.ts` | 人工审核 `pending` 项 |

解析规则：同一 LEI 或 CIK → 同一发行人；无 LEI/CIK 时用 USCI；都没有则按名称归一 + 人工确认进 `issuer_identifier_claims(status='pending')`。自动合并只发生在"硬标识符"一致时。

### 3.3 代码位置

```
src/lib/entities/
  issuers.ts            读写 issuers / issuer_securities（service role）
  resolve.ts            ticker | isin | cik | lei → issuer_id（带缓存）
  providers/openfigi.ts
  merge.ts              合并与冲突规则，附测试
  *.test.ts
scripts/entity-keys/    现有脚本改写目标表 + 新增 fill-isin / link-ah
```

### 3.4 读取接口

`GET /api/entities/resolve?ticker=600519.SH | isin=… | cik=…` → `{issuerId, names, securities[], identifiers, provenance}`。公共只读，走 `unstable_cache` 24h。

---

## 4. F2 披露事实库

> **已被取代（2026-11-04）**：本节的全部设计由 `docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md` 取代（披露日志模型、日期精度可得性、Tushare 1/4/5 三类报表与巨潮挂接、租约与暂存发布、`financial_history` 改造推迟）。以下文字仅作历史记录。

### 4.1 概念目录（canonical concepts）

`src/lib/facts/concepts.ts` 导出 `FACT_CONCEPTS`，首批 24 个：

| concept | 报表 | 性质 | us-gaap / ifrs-full 标签（含回退顺序） | Tushare 字段 |
|---|---|---|---|---|
| revenue | IS | duration | Revenues → RevenueFromContractWithCustomerExcludingAssessedTax → SalesRevenueNet / ifrs: Revenue | income.total_revenue（A 股口径"营业总收入"）；`revenue` 另存为 `revenue_operating` |
| cost_of_revenue | IS | duration | CostOfRevenue → CostOfGoodsAndServicesSold | income.oper_cost |
| gross_profit | IS | duration | GrossProfit（缺则不派生，用派生层） | 派生 |
| operating_income | IS | duration | OperatingIncomeLoss | income.operate_profit |
| net_income | IS | duration | NetIncomeLoss / ifrs: ProfitLoss | income.n_income |
| net_income_parent | IS | duration | NetIncomeLossAttributableToParent（缺则 = net_income 并标注） | income.n_income_attr_p |
| eps_basic / eps_diluted | IS | duration | EarningsPerShareBasic / Diluted | income.basic_eps / diluted_eps |
| total_assets | BS | instant | Assets | balancesheet.total_assets |
| total_liabilities | BS | instant | Liabilities | balancesheet.total_liab |
| equity_parent | BS | instant | StockholdersEquity | balancesheet.total_hldr_eqy_exc_min_int |
| equity_total | BS | instant | StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest | balancesheet.total_hldr_eqy_inc_min_int |
| cash | BS | instant | CashAndCashEquivalentsAtCarryingValue | balancesheet.money_cap |
| total_debt | BS | instant | LongTermDebt + ShortTermBorrowings（组合，标 derived） | st_borr + lt_borr + bond_payable（组合） |
| shares_outstanding | BS | instant | dei:EntityCommonStockSharesOutstanding | balancesheet.total_share |
| operating_cash_flow | CF | duration | NetCashProvidedByUsedInOperatingActivities | cashflow.n_cashflow_act |
| investing_cash_flow | CF | duration | NetCashProvidedByUsedInInvestingActivities | cashflow.n_cashflow_inv_act |
| financing_cash_flow | CF | duration | NetCashProvidedByUsedInFinancingActivities | cashflow.n_cash_flows_fnc_act |
| capex | CF | duration | PaymentsToAcquirePropertyPlantAndEquipment | cashflow.c_pay_acq_const_fiolta |
| dividends_paid | CF | duration | PaymentsOfDividends | cashflow.c_pay_dist_dpcp_int_exp（A 股口径含利息，标注） |
| rd_expense | IS | duration | ResearchAndDevelopmentExpense | income.rd_exp |
| sga_expense | IS | duration | SellingGeneralAndAdministrativeExpense | sell_exp + admin_exp（组合） |
| interest_expense | IS | duration | InterestExpense | income.int_exp |
| income_tax | IS | duration | IncomeTaxExpenseBenefit | income.income_tax |

每个映射带 `mapping_version`；标签回退顺序与 A 股口径差异写在目录里，不藏在代码。派生指标（毛利率、ROE、FCF、单季差分）**不进 `financial_facts`**，由 `src/lib/facts/derive.ts` 按 `formula_version` 实时计算或物化到 `financial_metrics`（§4.5）。

### 4.2 表

```
filings                                   -- 一份披露文件
  filing_id uuid PK
  issuer_id FK, ticker, market ('US'|'CN'|'HK')
  source ('edgar'|'tushare'|'cninfo'|'hkexnews'), origin ('sec'|'sse'|'szse'|'bse'|'hkex')
  form_type ('10-K'|'10-Q'|'20-F'|'annual'|'semiannual'|'q1'|'q3'|'restatement')
  fiscal_year int, fiscal_period ('FY'|'Q1'|'Q2'|'Q3'|'H1'|'9M')
  period_end date
  available_at timestamptz           -- SEC filed / A 股 f_ann_date ?? ann_date
  source_ref text                    -- accession no. / 公告 id
  url text
  raw_storage_path text, raw_hash text
  batch_id FK ingest_batches
  UNIQUE (source, source_ref)

financial_facts                           -- 一个披露值（时点、追加写）
  fact_id bigint PK
  issuer_id FK, ticker
  concept text                        -- FACT_CONCEPTS.id
  source_concept text                 -- us-gaap:Revenues / income.total_revenue
  statement ('IS'|'BS'|'CF'|'DEI')
  period_start date null, period_end date
  fiscal_year int, fiscal_period text
  value numeric, unit text ('USD'|'CNY'|'shares'|'USD/share'…), decimals int null
  consolidation ('consolidated'|'parent')  -- A 股 report_type 1 / 6
  filing_id FK filings
  available_at timestamptz
  vintage_seq int                     -- 同 (issuer, concept, period) 的第 n 次披露，1 起
  supersedes fact_id null             -- 被本值重述的前值
  is_restatement bool
  mapping_version text
  status ('ok'|'quarantined')
  batch_id FK
  raw_hash text
  UNIQUE (issuer_id, concept, period_start, period_end, consolidation, filing_id)
  INDEX (issuer_id, concept, period_end, available_at)

financial_metrics                         -- 派生物化（可重建）
  issuer_id, metric, period_end, fiscal_period, value, formula_version, inputs jsonb (fact_ids), computed_at, as_of_available timestamptz
  PK (issuer_id, metric, period_end, fiscal_period, formula_version)
```

RLS：`filings`、`financial_facts`（status='ok'）、`financial_metrics` 公共只读；写仅 service role。`financial_history` 改为视图 `financial_history` 由 `financial_metrics` 映射（保留现有读者 `src/app/api/stocks/[ticker]/route.ts` 的字段），迁移中 `drop table` 后 `create view`。

### 4.3 时点回放查询

```sql
-- 在 asOf 时刻可见的、某概念某期的最新值
select distinct on (concept, period_end)
  *
from financial_facts
where issuer_id = $1 and status = 'ok' and available_at <= $asOf
order by concept, period_end, available_at desc, vintage_seq desc;
```

封装为 `src/lib/facts/read.ts::getFactsAsOf(issuerId, {concepts, from, to, asOf})`。没有 `asOf` 时取最新。

### 4.4 采集适配器

**EDGAR companyfacts**（`src/lib/facts/providers/edgar-companyfacts.ts`）
- `GET https://data.sec.gov/api/xbrl/companyfacts/CIK{10位}.json`，User-Agent 用现有 `EDGAR_USER_AGENT`；SEC 限速 10 req/s，批内串行 + 100ms 间隔。
- 每个 `facts[taxonomy][tag].units[unit][]` 条目 `{start,end,val,accn,fy,fp,form,filed,frame}` → 一条 fact；`available_at = filed`；同 (concept, period) 多条按 `filed` 排 `vintage_seq`，后者 `supersedes` 前者；`frame` 用于判定是否为"该期的规范值"（去重同一期在多份 10-Q 里的重复）。
- `filings` 由 `accn + form + filed` 生成，`url` 拼 EDGAR 归档路径。
- 范围：`security_universe_memberships` 中 sp500 / nasdaq_top500 / us_china 三个宇宙 + 所有用户自选的美股。

**Tushare 三表**（`src/lib/facts/providers/tushare-statements.ts`，扩展现有 `tushare.ts` 的 `callTushare`）
- `income` / `balancesheet` / `cashflow`，fields 加 `ann_date,f_ann_date,end_date,report_type,comp_type,update_flag,end_type` 与 §4.1 列出的值字段；`report_type in (1)` 合并报表；`update_flag='1'` 的行视为重述版本（新 `vintage_seq`，`is_restatement=true`）。
- `available_at = f_ann_date ?? ann_date`（东八区 09:00 作为当日可得时间，记入 provenance 方法）。
- `source='tushare'`，`origin` 按交易所前缀（SH→sse，SZ→szse，BJ→bse），`source_ref = ts_code + end_date + f_ann_date`，`url` 为空（巨潮公告 URL 由对账步骤补）。
- A 股报表为**年初至今累计值**；单季值由 `derive.ts` 差分（同一 `vintage_seq`、同一 `filing_id` 口径），不写入 `financial_facts`。
- 范围：`research_entity_keys.in_scope=true` 的 A 股队列 + 用户自选 A 股；历史回填 10 年（Tushare 配额按积分，分批）。
- 记录 `tool_versions = {tushare_api: 'pro', fields_version}`。

**范围管理**：`fact_sync_scope(issuer_id, reason ('universe'|'watchlist'|'cohort'), priority, last_full_sync_at)` 由 `scripts/facts-scope.ts` 从宇宙表、自选表、cohort 生成；cron 每日处理 `priority` 最高的 N 个（美股 200、A 股 150），全量每周滚动一遍。

### 4.5 派生层 `src/lib/facts/derive.ts`

| metric | 公式 | 说明 |
|---|---|---|
| gross_margin | (revenue − cost_of_revenue) / revenue | A 股用 revenue_operating 为分母并标注 |
| net_margin | net_income_parent / revenue | |
| roe | net_income_parent(TTM) / avg(equity_parent 期初, 期末) | 期初缺失则不算 |
| fcf | operating_cash_flow − capex | |
| revenue_yoy / net_income_yoy | 同期对比，用同一 `asOf` 可见值 | |
| q_single_* | YTD_t − YTD_{t−1}（A 股）；美股 10-Q 本身为单季 | 差分可逆性测试 |
| ttm_* | 最近四个单季求和 | |

全部带 `formula_version`，输入 fact_id 列表写入 `inputs`，可逐级回放。

### 4.6 原始存储

新私有桶 `disclosure-raw`：`{source}/{issuer_id}/{batch_id}/{sha256}.json`，JSON，单文件 ≤ 20 MB（companyfacts 大公司可达 10 MB+）。`filings.raw_storage_path` 指向。保留策略：永久。

### 4.7 读取接口

| 路径 | 返回 | 约束 |
|---|---|---|
| `GET /api/facts/[ticker]?concepts=revenue,net_income&from=2016-01-01&asOf=2024-06-30&freq=annual\|quarterly` | `{issuerId, facts[], provenance: {filings[]}, asOf, mappingVersion}` | 公共只读；concepts 白名单；最多 40 期 |
| `GET /api/facts/[ticker]/metrics?metrics=gross_margin,roe&asOf=` | `{metrics[], formulaVersion, inputs}` | 同上 |
| `GET /api/filings/[ticker]?from&to` | `{filings[]}` | 同上 |
| `GET /api/cron/facts-sync?preview=1&market=US\|CN` | 批次回执 | `CRON_SECRET` + `authorizedCronRequest` |

现有 `src/app/api/financials/[ticker]/route.ts`（实时 Tushare）保留一个发布周期，加 `Deprecation` 头，之后切到 facts。

---

## 5. F5 数据质量约定（跨模块共用）

### 5.1 表

```
ingest_batches
  batch_id uuid PK, producer text ('ts-fred'|'py-akshare'|'edgar-companyfacts'|'tushare-statements'|'securities-sync'|…)
  dataset text, started_at, finished_at, status ('running'|'success'|'partial'|'failed'|'rejected')
  counts jsonb {fetched, inserted, duplicates, versioned, quarantined, failed}
  errors jsonb[], tool_versions jsonb, code_version text, triggered_by ('cron'|'manual'|'script')

dq_quarantine
  id PK, dataset, table_name, natural_key text, reason_code text, detail jsonb, payload jsonb
  batch_id FK, status ('open'|'resolved_accept'|'resolved_reject'), resolved_by, resolved_at, created_at

dq_reconciliations
  id PK, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed bool, batch_id, created_at

dq_freshness
  dataset PK, expected_cadence text ('daily'|'monthly'|'quarterly'|'event'), last_ok_at, last_attempt_at, status ('fresh'|'stale'|'error'|'missing'), detail jsonb
```

宏观规格 §4.3 的 `macro_ingest_batches` 改用本表 `ingest_batches`（dataset='macro'），不再单建。

### 5.2 规则库 `src/lib/dq/`

- `rules.ts`：范围规则（毛利率 ∈ [−100%, 100%]、PMI ∈ [0,100]…）、恒等式规则（资产 = 负债 + 权益 容差 0.5%；毛利 = 营收 − 成本；CF 三项之和 ≈ 现金变动 容差 2%）、单调/跳变规则（同比 > 1000% 隔离）、单位规则（币种与市场一致）。规则有 `rule_id` 与版本，失败即写 `dq_quarantine`，该值 `status='quarantined'`，不参与读取。
- `reconcile.ts`：跨来源对账运行器。首批对账对：EDGAR companyfacts vs 现有 `collectors/edgar.ts` 抓到的 10-K 文本中的"Total revenue"行（LLM 抽取 + 人工复核 30 家）；Tushare vs 巨潮年报 PDF（人工录入 30 家 × 4 期的 6 个科目作为黄金集 `src/lib/facts/fixtures/gold/*.json`）。容差 0.5%；超差写 `dq_reconciliations.passed=false` 并隔离。
- `freshness.ts`：按数据集登记预期节奏；财报按财年日历（美股 10-K 年度结束后 60/75/90 天、10-Q 40/45 天；A 股年报 4-30、半年报 8-31、季报 4-30/10-31）判断 `stale`。
- `admin`：`/admin/dq` 页（复用现有 `admin/*` 鉴权）列出批次、隔离、对账失败、新鲜度；提供"接受/拒绝"隔离项的操作，写 `research_audit_log`。

### 5.3 写入路径约定（所有模块）

计划触发 → 有界抓取 → 原始快照入桶（hash）→ 规则校验 → 幂等写（同键同值跳过；同键不同值 = 新版本或隔离，按数据集策略）→ 回执 → 新鲜度更新。失败不覆盖旧数据。

---

## 6. 迁移、类型与权限

- 迁移文件三个，按下面顺序，时间戳在实施当天分配且必须晚于 `20261018150000`：
  1. `<ts>_dq_foundation.sql`（§5.1 四表 + RLS：admin 可读，service 写）
  2. `<ts>_issuers.sql`（§3.1 五表 + `research_entity_*` 新列 + RLS 公共只读）
  3. `<ts>_financial_facts.sql`（§4.2 三表 + `financial_history` 表→视图 + `fact_sync_scope` + 桶 `disclosure-raw`）
- 每个迁移可重放（`if not exists`、drop-then-create policies），写入 `supabase/migrations.lock.json`（同时补齐当前落后的四条）。
- `database.types.ts` 手工补齐新表类型；在 `package.json` 增加 `supabase:types` 脚本占位并在文档说明当前为手工维护。
- 所有新表公共只读的前提：发行人与披露事实是公开参考数据；`dq_*` 与 `ingest_batches` 仅 admin 可读。

---

## 7. 代码结构

```
src/lib/entities/        issuers.ts resolve.ts merge.ts providers/openfigi.ts *.test.ts
src/lib/facts/           concepts.ts providers/{edgar-companyfacts,tushare-statements}.ts
                         normalize.ts write.ts read.ts derive.ts scope.ts fixtures/gold/*.json *.test.ts
src/lib/dq/              rules.ts reconcile.ts freshness.ts batches.ts quarantine.ts *.test.ts
src/app/api/entities/resolve/route.ts
src/app/api/facts/[ticker]/{route.ts,metrics/route.ts}
src/app/api/filings/[ticker]/route.ts
src/app/api/cron/facts-sync/route.ts
src/app/(app)/admin/dq/page.tsx + src/components/admin/dq/*.tsx
scripts/entity-keys/{fill-isin,link-ah}.ts（新）+ 现有三脚本改目标表
scripts/facts-scope.ts  scripts/facts-backfill.ts（分批回填，支持 --market --since --limit）
supabase/migrations/…   docs/runbooks/data-foundation.md
```

---

## 8. 错误处理

| 情形 | 行为 |
|---|---|
| SEC 429 / 503 | 退避 1s→8s，三次失败标记该 issuer `failed`，批次 `partial` |
| Tushare 配额耗尽 | 批次 `partial`，记录剩余范围，次日续跑 |
| 同一 (concept, period) 新值与旧值不同且非重述标志 | 作为新 `vintage_seq` 写入并标 `is_restatement=true`，同时写 `dq_quarantine(reason='unflagged_revision')` 供人工确认 |
| 恒等式失败 | 该期全部相关 facts `quarantined`；回执列出 |
| 标识符冲突（两个发行人同一 CIK） | 不写入，`issuer_identifier_claims(pending)` |
| 桶上传失败 | 本批次不写 facts（原始快照是前置条件） |

---

## 9. 测试策略

- 单元（vitest，`.ts`）：概念映射与回退顺序；companyfacts 解析（固定一份真实 JSON 夹具，如 AAPL CIK0000320193 截取）；Tushare 行解析（含 `update_flag` 重述）；`vintage_seq` 与 `supersedes` 计算；`getFactsAsOf` 的时点语义（asOf 早于重述 → 旧值）；单季差分可逆；恒等式规则；FIGI 映射解析。
- 属性测试：随机生成 (YTD 序列) → 差分再累加恒等；资产负债恒等式容差。
- 数据库（`test:db`）：迁移可重放；RLS（匿名可读 ok facts，不可读 quarantined 与 dq 表）；`UNIQUE` 约束；视图 `financial_history` 字段兼容。
- 集成（录制回放，不打网络）：对 3 家美股 + 3 家 A 股跑完整 ingest → 回执计数与快照一致。
- 对账黄金集：`fixtures/gold/` 30 家 × 4 期 × 6 科目，CI 断言对账通过率 ≥ 95%。
- E2E：`/admin/dq` 可见批次与隔离项，并能接受一项。

---

## 10. 分期与验收

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| WP-F0 质量设施 | `dq_*`、`ingest_batches`、规则库、`/admin/dq` | 任意批次写回执；隔离可处理 |
| WP-F1a 发行人表 | `issuers` 五表、resolve、SEC/GLEIF/巨潮脚本改写、`research_entity_*` 挂接 | 现有 cohort 100% 有 issuer_id；sp500 100% 有 CIK |
| WP-F1b 标识符补全 | ISIN、FIGI、A/H 配对 | 美股宇宙 FIGI ≥ 95%；A/H 对 ≥ 90% 自动，余下 pending |
| WP-F2a 美股事实 | companyfacts 适配、facts/filings 表、桶、读接口、cron | sp500 最近 8 期四表回填；asOf 回放测试通过 |
| WP-F2b A 股事实 | Tushare 适配（含重述）、范围、回填脚本 | in_scope 队列 10 年回填；单季差分测试通过 |
| WP-F2c 派生与兼容 | derive、`financial_metrics`、`financial_history` 视图、`/api/financials` 弃用头 | 现有读者无断裂 |
| WP-F5 对账与新鲜度 | 黄金集 30 家、对账运行器、财报日历新鲜度 | 对账通过率 ≥ 95%；新鲜度看板可见 |

验收样例：
1. `asOf=2024-06-30` 查 AAPL revenue FY2023 → 返回 10-K 2023-11-03 披露值，而非后续 10-K 2024 的重述值。
2. 一家 A 股 2023 年报重述（update_flag=1）：两条 fact 并存，`vintage_seq` 1/2，`supersedes` 正确；`asOf` 早于重述日取 1。
3. 任何 ticker 的 `resolve` 返回同一 issuer 的 A/H/ADR 全部证券与 valid 区间。
4. 一个恒等式失败的期被隔离，接口不返回，`/admin/dq` 可见并可接受。
5. 断网跑 facts-sync：批次 `failed`，旧数据不变，新鲜度 `error`。
6. 删除 `financial_metrics` 后重算，与删除前逐行一致。

工作量（熟悉仓库的高级工程师）：WP-F0 2–3 人日；F1a 3–4；F1b 2–3；F2a 4–5；F2b 4–6；F2c 2；F5 3–4。合计约 20–27 人日，不含 Tushare 配额等待与黄金集人工录入。

---

## 11. 独立验证（除实现者之外）

- 官方对账：EDGAR companyfacts 值 vs SEC 官网 Financial Report 页面（人工抽样 10 家）；Tushare vs 巨潮年报 PDF 黄金集 30 家。
- 双来源一致性：美股 companyfacts vs 现有 10-K 文本抽取；A 股 Tushare vs AKShare `stock_financial_report_sina`（第二适配器，仅作对账）。
- 属性与回放测试在 CI 强制。
- 第三方模型审计：Codex 审计轮次，报告入 `docs/audits/2026-11-xx-data-foundation/`。
- 专家抽样：一位会计/财务背景的人核对 5 家公司的口径映射（尤其 A 股"营业总收入 vs 营业收入"、"股利含利息"两处）。

---

## 12. 开放问题

1. OpenFIGI 免费 key 的使用条款是否允许在商业产品中存储 FIGI（需查 Bloomberg Open Symbology 条款）；不允许则 FIGI 仅内部使用、不对外展示。
2. Tushare 三表历史回填的积分配额是否足够 in_scope 队列 × 10 年 × 3 表；不够则按优先级分周回填。
3. 申万/中证历史成分的授权来源（行业规格解决），本规格只建表。
4. 港股事实：等 F3 PDF 管道，还是先用 Tushare `hk_*` 财务接口作过渡（需确认字段与口径）。
5. `database.types.ts` 是否引入 `supabase gen types` 自动生成；当前手工维护与迁移已脱节。

---

## 13. 附件

- 总纲与三板块方案：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md`
- 宏观工作台规格（与 §5 共用 `ingest_batches`）：`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`
- 仓库勘察来源：本规格 §2

---

## 14. 实施记录与偏差（2026-11-05，计划一落地后补记）

计划一（`docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md`）已在分支 `claude/data-foundation-1` 实现，经 Claude 规格复审、质量复审与 Codex（gpt-6-astra）审计多轮修正。以下为与本规格文字的差异，均为有意决定：

| 规格条目 | 实施 | 原因 |
|---|---|---|
| §3.1 `issuer_securities` 仅 `UNIQUE (ticker, valid_from)` | 增加 `btree_gist` 互斥约束：同一 ticker、同一 ISIN 的持有窗口不得重叠；`valid_to is null` 的开放持有人每 ticker 唯一；子表外键改为 `on delete restrict`；触发器禁止合并到非活跃发行人、禁止非活跃发行人持有开放证券 | 审计发现仅凭唯一键无法阻止区间重叠与生命周期不一致 |
| §3.1 `share_class` 枚举 | 增加 `'unknown'`，SEC 名单与无证据的港股普通股均记 `unknown`；H 股仅在 `home_market='A'` 或有统一社会信用代码时判定 | 上市地不等于股份类别或注册地 |
| §3.2 现有脚本改写目标表 | SEC 装载与研究实体挂接已实现（`load-sec`、`link-research`，apply 逻辑入库可测）；GLEIF/巨潮脚本改写、ISIN/FIGI、A/H 配对移至计划三 | 范围控制 |
| §3.2 研究实体升格 | 仅限 `--user` 指定的单个用户；公共来源信息不含用户/实体 ID；`country_code` 仅在有 USCI 时记 `CN` | 租户边界与隐私 |
| §3.4 解析接口 | 响应字段为 `issuer_id`，不含 provenance；缓存改为 CDN `Cache-Control`（按 UTC 日界封顶，错误 `no-store`）而非 `unstable_cache`；每次只接受一个标识符；使用 anon 客户端 | 公共只读路由的安全与一致性 |
| §5.1 `ingest_batches.counts` | 固定六个计数器（fetched/inserted/duplicates/versioned/quarantined/failed），跳过项汇总进 `errors` 的 `skipped_summary` 条目 | 保持 jsonb 形状约束 |
| §5.1 `dq_freshness` | 增加 `consecutive_errors`；状态读时重算；daily 宽限 2 天 | 生产者停摆也要能变 stale；周末 |
| §5.2 `/admin/dq` | 处理隔离项返回 resolved / already_resolved / not_found；POST 校验 Origin 与 Content-Type；`research_audit_log` 写入与跨来源对账运行器（`reconcile.ts`）、财报日历新鲜度移至计划三 | 审计建议与范围控制 |
| §6 `database.types.ts` | 手工补齐九张表类型；`supabase:types` 脚本仍缺 | 待定自动生成方案（开放问题 5） |
| 测试 | 新增测试用 `pg-table-client`（仅测试使用）与 `issuers-write.integration.test.ts`，写路径在真实 PostgreSQL 上验证 | 内存桩无法表达数据库约束 |
