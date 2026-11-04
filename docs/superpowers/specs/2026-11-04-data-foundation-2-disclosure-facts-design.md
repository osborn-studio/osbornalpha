# 数据底座二 · F2 披露事实库 设计规格

日期：2026-11-04（第 3 稿。审计轨迹：`docs/audits/2026-11-04-data-foundation-2/` —— 01 Codex 第一轮、02 独立 Claude 复审、03 Codex 第二轮、04 第二轮处置表）
状态：草案，待 owner 评审（§14 有三项 owner 决策）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§4、§8–§10 的 F2 部分。本规格**取代**规格一 §4；规格一 §14 记录的计划一偏差在此视为既定事实。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格逐条对照其硬约束：只用一手来源（EDGAR、交易所定期报告；Tushare 仅作适配器并记录上游与巨潮公告定位）、每个数字可回放（源文件哈希、行定位、可得日期、变换、代码版本）、事实与判断分离、缺失保持缺失（不做代理指标、不填占位、不做静默换算、不混口径）。
已定决策（owner 2026-11-04）：美股事实来源 EDGAR companyfacts；A 股事实来源 Tushare 三表 + 公告日期字段；港股延后到 F3；本规格不含任何页面。

---

## 1. 目标与非目标

### 1.1 目标

1. **披露日志。** `financial_facts` 记录"哪份文件、在哪个可得日期、对哪个概念的哪个期间、用哪个单位、披露了什么值"。同一期间被多份文件重复披露就有多行；值变了就是修订。任意 `asOf`（日期）都能回放当时可见的最新披露。
2. **两个市场、一个写入路径。** EDGAR companyfacts 与 Tushare 三表经同一套"租约 → 快照入桶 → 解析 → 暂存写入 → 规则与隔离 → 发布 → 回执"流程写入，复用计划一的 `ingest_batches`、`dq_quarantine`、`dq_freshness`。
3. **派生可重建。** 派生指标由 `derive.ts` 按 `formula_version` 从事实计算，物化行记录全部输入事实；按发行人整体原子替换；重算后与重算前语义字段逐行一致。
4. **公共只读接口。** 事实、派生、披露文件三个读接口按 ticker 查询（ticker 按**今天**的归属解析为发行人，`asOf` 只作用于事实）；一个 cron 接口与一个本机脚本共用同一核心。

成功标准（计划二退出条件）：
- sp500 / nasdaq_top500 / us_china 三个宇宙内每个有 CIK 且 companyfacts 可得的发行人，最近 8 个财期的 §3 概念已入库（companyfacts 里没有的概念保持缺失，不计失败）；`GET /api/facts/AAPL?concepts=revenue&asOf=2024-06-30` 返回 period_end 2023-09-30 revenue 的 2023-11-03 10-K 披露行，而不是 FY2024 10-K 中的同期行。
- A 股（范围见 §6.4）10 年三表已入库；一家 `report_type=5`（调整前）与 `report_type=1`（最新）同期不同值且公告日不同的公司，两行并存，`asOf` 早于更正公告日取调整前值；其年报 filing 带巨潮公告 id 与 PDF 链接。
- 黄金断言（§11.4）美股部分在 CI 强制通过；A 股部分在夹具录入后进入强制，且 A 股 cron 只在那之后开启。
- 按发行人重算 `financial_metrics`，语义字段与重算前逐行一致。
- 断网运行同步：批次 `failed`，旧数据不变；连续两次后新鲜度 `error`。
- 一次 cron 运行在截止后结束：已处理发行人全部发布、未处理发行人无残留。

### 1.2 本规格之外

- 港股事实（F3）。
- 跨来源对账运行器（`dq_reconciliations` 写入者）、财报日历新鲜度、30 家黄金集、对巨潮 PDF 的逐值核对：计划三。本规格只交付 6 家黄金断言作为测试。
- ISIN / FIGI / A+H 配对、历史 ticker 归属证据、合并后发行人的事实归属：计划三。本规格的 ticker 解析按今天的归属。
- 母公司报表（Tushare `report_type` 6–12）、单季表（2、3）：不加载。
- `financial_history` 表→视图改造：该表为空、无写入者，本期**不动**（规格一 §4.2 的承诺推迟到公司研究规格确定读者后）。
- 任何页面与 `/admin/dq` 的改动，除 §7.3 一处处理钩子外。
- 删除 `/api/financials/[ticker]`（五个读者）：只加 `Deprecation` 头。
- 日内（时刻级）可得性：只到日期精度（§5.1）。
- 精确十进制算术：数值**持久化**无损（§6.2），规则与派生用双精度（15 位有效数字），容差型恒等式与比率不需要更高精度。
- 单季差分要求被减数与减数来自同一份文件：不要求（§8 说明）。

---

## 2. 现状（2026-11-04，计划一落地后）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 发行人 | `issuers(issuer_id, cik（不带前导零）, lei, usci, cninfo_org_id, …, status)`；`issuer_securities(ticker, valid_from = 首次观察日而非上市日, valid_to, is_primary)`；`resolveIssuer(client, {ticker\|cik\|…}, {today})` | 事实只挂 `issuer_id`；读接口按今天解析 ticker；`fetchKey()` 一处生成 10 位 CIK / ts_code；巨潮定位用 `issuers.cninfo_org_id` |
| 研究实体 | `research_entity_keys.issuer_id`、`in_scope`、`cohort` | A 股范围来源之一（§6.4 owner 决策） |
| 证券 | `stocks_universe.ticker`（A 股 `600519.SH`，与 Tushare `ts_code` 同形）；`security_universe_memberships(ticker, universe, is_active)` | 美股范围来源 |
| 质量设施 | `startBatch/finishBatch/batchStatusFromCounts`（六计数器；`INFO_CODES` 不降级；`capErrors` 前 100 条）、`quarantine()`（同键 open 唯一；已存在时返回旧项且**不更新 payload**）、`recordAttempt`（连续两次失败才 `error`）、`rules.ts`（`rangeRule(ruleId,…)/identityRule(ruleId,…)/jumpRule(ruleId,…)/unitRule(ruleId,…)` 不抛异常） | 复用；新增信息码 `rule_warning_summary`、`coverage_summary`、`deadline_hit`，非信息码 `quota_exhausted`（§10） |
| 隔离处理 | `POST /api/admin/dq/quarantine/[id]` 翻转状态并写 `research_audit_log`；重复处理返回 `already_resolved` | 增加 facts 处理钩子与钩子状态（§7.3） |
| 数据库访问 | `TableClient`（Supabase / memory / pg；`insert` 单行；`gte/lt`；单列排序；`selectAll` 分页 1000；无 delete / rpc / 事务） | 本规格定义自己的 `FactsDb` 接口（§4.8），三种实现 |
| 财务数据 | `financial_history` 为空；`/api/financials/[ticker]` 实时拉 Tushare | 表不动；路由加弃用头 |
| Tushare 客户端 | `tushareCall` 解析后返回行对象，不暴露原文、`has_more`、`request_id` | 新增 `tushareCallRaw`（§6.3） |
| EDGAR 访问 | `collectors/shared.ts::createClient`（UA、最小间隔、30 s 超时） | 复用 pace 逻辑，超时改为按剩余预算 |
| 巨潮访问 | `collectors/cninfo.ts`：`topSearch`、`hisAnnouncement/query`（announcementId、adjunctUrl、announcementTime；只处理 sse/szse） | A 股 filing 公告挂接（§6.3）；BJ 不挂接 |
| 存储 | 私有桶 `security-snapshots`（迁移 `insert into storage.buckets … on conflict`） | 同法新建 `disclosure-raw` |
| cron | `vercel.json` + `CRON_SECRET` Bearer + `timingSafeEqual`；`maxDuration=300` | 同法；预算在 `SyncDeps.deadline` 传递 |
| 环境 | 本机无 `TUSHARE_TOKEN`/`EDGAR_USER_AGENT`；生产有 `TUSHARE_TOKEN` | 夹具录制需 owner 提供 token（§14） |
| 迁移 | 最新已锁 `20261105091000_issuers.sql`；本地与托管都是 PostgreSQL 17 | 新迁移 `20261106090000_financial_facts.sql`；`unique nulls not distinct` 可用 |

---

## 3. 概念目录 `src/lib/facts/concepts.ts`

`FACT_CONCEPTS` 导出 **33** 个概念。`MAPPING_GEN = 1`（整数，单调递增；任何映射改动 +1）、`MAPPING_VERSION = 'facts-map/1'`（给人看）。每个概念：`id`、`statement`、`nature`（duration/instant）、`unitKind`（money/shares/per_share）、`usGaap: string[]`、`ifrs: string[]`、`tushare`、`notes`。

**回退列表只放等价口径的别名**（审计 N9）：口径不同的度量是不同概念。**选取规则**：对同一 filing、同一期间（`start,end`）、同一单位，按顺序取**第一个有条目的标签**；更低优先级的标签只在更高优先级标签没有该期间条目时补位。**同一标签**对同一 `accn+start+end+unit` 给出不同 `val` → 隔离 `ambiguous_value`（§5.3）。被选标签写入 `source_concept`。

| concept | 表 | 性质 | us-gaap 回退顺序 | ifrs-full | Tushare |
|---|---|---|---|---|---|
| revenue | IS | duration | Revenues → RevenueFromContractWithCustomerExcludingAssessedTax → SalesRevenueNet | Revenue | income.total_revenue（营业总收入） |
| revenue_operating | IS | duration | — | — | income.revenue（营业收入） |
| cost_of_revenue | IS | duration | CostOfRevenue → CostOfGoodsAndServicesSold → CostOfGoodsSold | CostOfSales | income.oper_cost |
| gross_profit | IS | duration | GrossProfit | GrossProfit | — |
| operating_income | IS | duration | OperatingIncomeLoss | ProfitLossFromOperatingActivities | income.operate_profit |
| net_income | IS | duration | ProfitLoss | ProfitLoss | income.n_income |
| net_income_parent | IS | duration | NetIncomeLoss | ProfitLossAttributableToOwnersOfParent | income.n_income_attr_p |
| eps_basic | IS | duration | EarningsPerShareBasic | BasicEarningsLossPerShare | income.basic_eps |
| eps_diluted | IS | duration | EarningsPerShareDiluted | DilutedEarningsLossPerShare | income.diluted_eps |
| rd_expense | IS | duration | ResearchAndDevelopmentExpense | ResearchAndDevelopmentExpense | income.rd_exp |
| sga_expense | IS | duration | SellingGeneralAndAdministrativeExpense | SellingGeneralAndAdministrativeExpense | sum(income.sell_exp, income.admin_exp) |
| interest_expense | IS | duration | InterestExpense | InterestExpense | income.fin_exp_int_exp（财务费用:利息费用） |
| interest_expense_bank | IS | duration | — | — | income.int_exp（减:利息支出；银行口径） |
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
| shares_outstanding | BS/DEI | instant | CommonStockSharesOutstanding → dei:EntityCommonStockSharesOutstanding（`period_end` 为封面日期，`notes: cover_date`） | NumberOfSharesOutstanding | balancesheet.total_share（"期末总股本（股）"） |
| operating_cash_flow | CF | duration | NetCashProvidedByUsedInOperatingActivities | CashFlowsFromUsedInOperatingActivities | cashflow.n_cashflow_act |
| investing_cash_flow | CF | duration | NetCashProvidedByUsedInInvestingActivities | CashFlowsFromUsedInInvestingActivities | cashflow.n_cashflow_inv_act |
| financing_cash_flow | CF | duration | NetCashProvidedByUsedInFinancingActivities | CashFlowsFromUsedInFinancingActivities | cashflow.n_cash_flows_fnc_act |
| capex | CF | duration | PaymentsToAcquirePropertyPlantAndEquipment | PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities | — |
| capex_incl_intangibles | CF | duration | — | — | cashflow.c_pay_acq_const_fiolta（购建固定资产、无形资产和其他长期资产） |
| dividends_paid | CF | duration | PaymentsOfDividends | DividendsPaidClassifiedAsFinancingActivities | — |
| dividends_and_interest_paid | CF | duration | — | — | cashflow.c_pay_dist_dpcp_int_exp |
| net_change_in_cash | CF | duration | CashAndCashEquivalentsPeriodIncreaseDecrease | IncreaseDecreaseInCashAndCashEquivalents | cashflow.n_incr_cash_cash_equ |
| net_change_in_cash_and_restricted | CF | duration | CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect | — | — |

单位归一（`src/lib/facts/units.ts`）：companyfacts `USD`→`USD`、`shares`→`shares`、`<货币>/shares`→`<货币>/share`、`pure`→`pure`，其他货币代码原样；Tushare 金额 → `CNY`，eps → `CNY/share`，`total_share` → `shares`。`unitRule` 允许集合按 `unitKind`。同一概念同一期间可有多个单位的事实并存；单位是事实键的一部分；派生只在输入单位一致时计算，不换算。读接口 `concepts` 上限 = `FACT_CONCEPTS.length`。

---

## 4. 数据模型

迁移 `supabase/migrations/20261106090000_financial_facts.sql`，可重放。补 `migrations.lock.json`；`database.types.ts` 手工补四个 Row 类型。所有表显式 `revoke all from public, anon, authenticated` 后按 §4.7 授权。

### 4.1 `filings`

```
filing_id        uuid primary key                          -- 写入端生成
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
market           text not null check (market in ('US','CN'))
source           text not null check (source in ('edgar','tushare'))
origin           text not null check (origin in ('sec','sse','szse','bse'))
form_type        text not null check (form_type in ('10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','annual','semiannual','q1','q3','restatement','other'))
fiscal_year      int                                       -- US: 条目 fy；CN: end_date 年
fiscal_period    text check (fiscal_period in ('FY','Q1','Q2','Q3','H1','9M'))
period_end       date                                      -- US: 该 accn 下 duration 条目的最大 end（instant/dei 不参与；无则 null）；CN: end_date
available_date   date not null                             -- §5.1
source_ref       text not null                             -- EDGAR: accession no.；Tushare: '<ts_code>:<end_date>:<report_type>:<f_ann_date ?? ann_date>'
url              text                                      -- EDGAR 归档 index 页
document_ref     text                                      -- CN: 巨潮 announcementId
document_url     text                                      -- CN: 巨潮 PDF
link_attempts    int not null default 0                    -- CN 挂接尝试次数（§6.3）
mapping_gen      int not null                              -- 完整处理过本 filing 的最高映射代（§5.2）
batch_id         uuid not null references ingest_batches(batch_id) on delete restrict
created_at       timestamptz not null default now()
unique (source, source_ref)
unique (filing_id, issuer_id)
unique (filing_id, available_date)                         -- 供事实表复合外键校验日期一致
index (issuer_id, available_date desc)
index (issuer_id, period_end desc)
```

触发器 `filings_limited_update`：`update` 只允许改 `document_ref/document_url/link_attempts/mapping_gen`，其余列变化抛 `23514`（`append_only:filings`）；`delete` 禁止（事实以 `restrict` 外键挂着）。

### 4.2 `financial_facts`（披露日志）

```
fact_id          uuid primary key                          -- 写入端生成
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
filing_id        uuid not null
concept          text not null check (length(concept) between 1 and 64)
source_concept   text not null
statement        text not null check (statement in ('IS','BS','CF','DEI'))
period_start     date
period_end       date not null
duration         text not null check (duration in ('3M','6M','9M','12M','INSTANT'))
value            numeric not null                          -- 以十进制字符串插入（§6.2）
value_text       text generated always as (value::text) stored
unit             text not null check (length(unit) between 1 and 16)
consolidation    text not null default 'consolidated' check (consolidation in ('consolidated','parent'))
available_date   date not null
mapping_gen      int not null
mapping_version  text not null
status           text not null default 'staged' check (status in ('staged','ok','quarantined'))
batch_id         uuid not null references ingest_batches(batch_id) on delete restrict
raw_hash         text not null
created_at       timestamptz not null default now()
foreign key (filing_id, issuer_id) references filings(filing_id, issuer_id) on delete restrict
foreign key (filing_id, available_date) references filings(filing_id, available_date) on delete restrict   -- 日期与文件一致（审计 N4）
constraint financial_facts_period check (period_start is null or period_start < period_end)
constraint financial_facts_instant check ((period_start is null) = (duration = 'INSTANT'))
unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, unit, filing_id, mapping_gen)
index (issuer_id, concept, period_end, available_date)
index (issuer_id, batch_id) where status <> 'ok'
index (filing_id)
```

- 没有版本列：披露顺序、"前一次披露"、"是否修订"在读取时按 `available_date` 计算（§5.2）。
- `duration` 由天数分类：75–105 → `3M`，165–200 → `6M`，255–290 → `9M`，350–380 → `12M`，instant → `INSTANT`；其余隔离 `odd_duration`。不标财季号。
- 触发器 `financial_facts_lifecycle`（`23514`，消息前缀 `append_only:`）：`insert` 必须 `status='staged'`；`update` 只允许改 `status`，允许的迁移 `staged→ok`、`staged→quarantined`、`quarantined→ok`、`ok→quarantined`；`delete` 只允许 `status <> 'ok'` 的行（未发布批次的崩溃清理，§5.4）。
- `ok` 行只能通过 `publish_staged_facts`（§4.4）或处理钩子（§7.3）产生。

### 4.3 `financial_metrics`（缓存，原子替换）

```
issuer_id        uuid not null references issuers(issuer_id) on delete restrict
metric           text not null
period_start     date not null                             -- instant 指标 = period_end
period_end       date not null
duration         text not null check (duration in ('3M','6M','9M','12M','TTM','INSTANT'))
value            numeric not null
value_text       text generated always as (value::text) stored
unit             text not null                             -- 'ratio' | 货币 | 'shares'
input_unit       text not null                             -- 输入事实的货币/单位（审计 N13）
basis            text not null default 'standard'          -- 'standard' | 'cn_incl_intangibles' 等，§8
formula_version  text not null
inputs           jsonb not null check (jsonb_typeof(inputs) = 'array')   -- 扁平：全部底层事实 [{fact_id, concept, filing_id, available_date}]
as_of            date not null
computed_at      timestamptz not null default now()
primary key (issuer_id, metric, period_start, period_end, input_unit, basis, formula_version)
index (issuer_id, metric, period_end desc)
```

### 4.4 `fact_sync_scope`（范围、调度、租约）

```
issuer_id        uuid not null references issuers(issuer_id) on delete cascade
market           text not null check (market in ('US','CN'))
reasons          jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array')
priority         int not null default 0                    -- 0 = 不调度
fetch_key        text not null
next_due_at      timestamptz not null default now()
lease_until      timestamptz
lease_batch_id   uuid references ingest_batches(batch_id) on delete set null
last_attempt_at  timestamptz
last_success_at  timestamptz
last_status      text check (last_status in ('success','failed'))
updated_at       timestamptz not null default now()
primary key (issuer_id, market)                            -- 同一发行人可有两路（审计 N19）
index (market, next_due_at, priority desc, issuer_id) where priority > 0
```

四个 SQL 函数，全部 `language plpgsql security definer set search_path = public`，`revoke execute from public, anon, authenticated; grant execute to service_role`：

```sql
-- 租约：未租/已过期/同一批次续租 → true；否则 false
create or replace function public.claim_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_ttl_seconds int) returns boolean …
  update fact_sync_scope set lease_until = now() + make_interval(secs => p_ttl_seconds), lease_batch_id = p_batch,
         last_attempt_at = coalesce(last_attempt_at, now()), updated_at = now()
   where issuer_id = p_issuer and market = p_market
     and (lease_until is null or lease_until < now() or lease_batch_id = p_batch);
  return found;

-- 清理：持有有效租约者删除本发行人其他批次的未发布行；返回删除数
create or replace function public.cleanup_unpublished_facts(p_issuer uuid, p_market text, p_batch uuid) returns int …
  if not exists (select 1 from fact_sync_scope where issuer_id=p_issuer and market=p_market and lease_batch_id=p_batch and lease_until > now()) then raise exception 'lease_lost' using errcode='55P03'; end if;
  delete from financial_facts where issuer_id = p_issuer and status <> 'ok' and batch_id <> p_batch;  -- 触发器允许
  get diagnostics n = row_count; return n;

-- 发布：持有有效租约者把本批次 staged 行一次性变 ok；返回行数；无租约抛 lease_lost
create or replace function public.publish_staged_facts(p_issuer uuid, p_market text, p_batch uuid) returns int …
  （同样先校验租约）update financial_facts set status='ok' where issuer_id=p_issuer and batch_id=p_batch and status='staged';

-- 释放：只有持有者能释放
create or replace function public.release_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_outcome text, p_next_due timestamptz) returns void …
  update fact_sync_scope set lease_until=null, lease_batch_id=null, last_status=p_outcome,
         last_success_at = case when p_outcome='success' then now() else last_success_at end,
         next_due_at = p_next_due, updated_at=now()
   where issuer_id=p_issuer and market=p_market and lease_batch_id=p_batch;

-- 派生物化：事务内 advisory lock + 删 + 插（审计 N12）
create or replace function public.replace_financial_metrics(p_issuer uuid, p_rows jsonb) returns int …
  perform pg_advisory_xact_lock(hashtext(p_issuer::text));
  delete from financial_metrics where issuer_id = p_issuer;
  insert into financial_metrics select … from jsonb_to_recordset(p_rows) as r(…);
  get diagnostics n = row_count; return n;
```

超过租约（600 s）仍在跑的工作者：它的 `cleanup/publish/release` 都因租约校验失败而抛 `lease_lost`，该发行人记 `failed`，暂存行由新持有者清理（审计 N5）。

### 4.5 `financial_history`

本期不改（§1.2）。

### 4.6 原始快照桶 `disclosure-raw`

`insert into storage.buckets … ('disclosure-raw', false, 52428800, array['application/json']) on conflict (id) do update …`。路径内容寻址 `{source}/{issuer_id}/{sha256}.json` 存响应**原文字节**；旁边 `{sha256}.meta.json` 存 `{source, api|url, params（无 token）, fields, fetched_at, http_status, has_more, page}`。上传 `upsert:false`，`409` 视为已存在。`financial_facts.raw_hash` 指向快照。定位规则：
- EDGAR：`facts[<taxonomy>][<tag>].units[<原始 unit>][]` 中 `accn = filings.source_ref` 且 `end = period_end`（duration 再比 `start`）的条目。
- Tushare：该页响应里 `end_date = period_end` 且 `report_type`、公告日与 `filings.source_ref` 对应的行；`source_concept` 指出字段。

上传失败 → 本发行人不写任何行，`failed`。

### 4.7 权限

- `filings`、`financial_metrics`：`grant select to anon, authenticated`，RLS `using (true)`；`grant select, insert, update, delete to service_role`。
- `financial_facts`：`grant select to anon, authenticated`，策略 `using (status = 'ok')`；service_role 全部。
- `fact_sync_scope`：仅 service_role。
- 五个函数：仅 service_role 可执行。集成测试以真实角色验证（含 `anon` 调函数被拒）。

### 4.8 数据访问契约 `src/lib/facts/db.ts`（审计 N22）

```ts
export interface FactsDb {
  claimLease(issuer, market, batch, ttlSeconds): Promise<boolean>;
  cleanupUnpublished(issuer, market, batch): Promise<number>;        // 抛 LeaseLost
  publishStaged(issuer, market, batch): Promise<number>;             // 抛 LeaseLost
  releaseLease(issuer, market, batch, outcome, nextDue): Promise<void>;
  replaceMetrics(issuer, rows): Promise<number>;
  insertFilings(rows): Promise<void>; findFilingBySourceRef(source, ref): Promise<Filing|null>;
  updateFiling(filingId, patch: {document_ref?, document_url?, link_attempts?, mapping_gen?}): Promise<void>;
  insertFacts(rows): Promise<void>;                                  // 分块 ≤ 500，一次请求多行
  setFactStatus(factIds, status): Promise<void>;
  factsOfIssuer(issuer, opts: {concepts?, status?, availableLte?, periodEndGte?, periodEndLte?}): Promise<FactRow[]>;   // 每个概念一次请求（§5.4）
  filingsOfIssuer(issuer, opts): Promise<Filing[]>;
  scopeDue(market, now, limit): Promise<ScopeRow[]>; upsertScope(rows): Promise<void>;
  metricsOfIssuer(issuer, formulaVersion): Promise<MetricRow[]>;
}
```

三种实现：`supabaseFactsDb`（PostgREST + `rpc()`），`memoryFactsDb`（单测；实现租约与状态规则），`pgFactsDb`（集成测试，直连 SQL）。读接口用 `anon` 客户端的 `supabaseFactsDb` 只读子集。计划一的 `TableClient` 继续用于批次/隔离/新鲜度。

---

## 5. 时点与版本语义

### 5.1 可得日期

`available_date` 是**日期**：EDGAR 用 `filed`；Tushare 用 `f_ann_date ?? ann_date`；两者都缺 → 隔离 `missing_available_date`。`asOf` 是 `YYYY-MM-DD`，可见 ⇔ `available_date <= asOf`。不承诺日内精度。

### 5.2 读取时的版本

对自然键 K = `(issuer_id, concept, period_start, period_end, consolidation, unit)`：
1. 每个 filing 只取 `mapping_gen = filings.mapping_gen` 的行（映射升级重跑一个 filing 时，先写新代全部行，发布后把 `filings.mapping_gen` 升到新代；旧代行留作历史，读取不再看它们；新代不再产出的概念自然消失，审计 N2）。
2. 取 `status='ok' and available_date <= asOf` 的行，按 `(available_date, created_at, fact_id)` 升序排成序列。同一 `available_date` 下来自不同 filing 的不同值不允许存在（§5.3 写入时隔离），所以序列内同日最多一个值；同日同值的多行（例如同一天的两份文件）保留，顺序由 `created_at` 决定但不影响当前值。
3. **当前值** = 序列最后一行；`disclosure_seq` = 位置（1 起）；`is_revision` = 值与序列前一行不同。

SQL 口径（集成测试核对内存实现）：

```sql
with eligible as (
  select f.* from financial_facts f join filings g on g.filing_id = f.filing_id
  where f.issuer_id = $1 and f.status = 'ok' and f.concept = any($2)
    and f.mapping_gen = g.mapping_gen and f.available_date <= $asOf
    and f.period_end between $3 and $4)
select distinct on (concept, period_start, period_end, consolidation, unit) *
from eligible
order by concept, period_start, period_end, consolidation, unit, available_date desc, created_at desc, fact_id desc;
```

### 5.3 写入时的重复与冲突

- 候选键 = K + `filing_id` + `mapping_gen`。已存在（任何 `status`）→ 不写，`duplicates`。
- 同一 filing、同一 K，同一标签多个不同 `value` → 不写，隔离 `ambiguous_value`（`payload={candidates}`）。
- **同日冲突**（审计 N3）：本批次候选与（已发布或本批次）另一 filing 在同一 `available_date` 对同一 K 给出不同值 → 两边的新行都写入并 `quarantined`（已 `ok` 的旧行不动），隔离 `same_day_conflict`；不按报表类型字符串排先后。
- 计数：新行值与"写入前该 K 的当前可见值"相同或此前无披露 → `inserted`；不同 → `versioned`；被隔离 → `quarantined`。

### 5.4 并发、原子性与读取一致性

- 一个发行人一路（market）同一时刻一个持有有效租约的工作者；所有写与发布经 §4.4 函数校验租约。
- 暂存后发布：所有新行 `staged`；规则把该隔离的行 `quarantined`；`publish_staged_facts` 一条语句发布其余。
- 崩溃清理：持有租约后 `cleanup_unpublished_facts` 删除本发行人其他批次的 `staged/quarantined` 行（未发布批次的行是无效证据；对应的 `dq_quarantine` 项保留，钩子遇到已不存在的行为空操作，runbook 提供清理 SQL）。
- **读取一致性的边界（接受的限制，审计 N7）**：读接口对每个概念一次请求（≤ 1000 行；10 年 × 4 期 × 约 3 次披露 ≈ 120 行），单概念内一致；跨概念读取若恰逢发布，可能漏掉刚发布的披露，但不会看到被删除或部分可见的旧状态（`ok` 行永不删除）。

---

## 6. 采集

### 6.1 共用核心 `src/lib/facts/sync.ts`

```ts
export interface SyncDeps { db: FactsDb; tables: TableClient; storage: SnapshotStore;
  fetchUs: (cik10, budget: Budget) => Promise<RawSnapshot>; fetchCn: (tsCode, sinceYear, budget: Budget) => Promise<RawSnapshot[]>;
  linkCn?: (filing, budget: Budget) => Promise<{document_ref, document_url}|'none'|'ambiguous'>;
  now: () => Date; deadline: Date|null; codeVersion: string }
export interface Budget { remainingMs(): number; signal: AbortSignal }
```

`runFactsSync(deps, {market, limit, issuerIds?, dryRun, triggeredBy})`：一个 `ingest_batches` 行（`producer='facts-sync'`，`dataset='facts.us'|'facts.cn'`，`tool_versions={mapping_gen, rules: RULES_VERSION, formula: FORMULA_VERSION, source}`，`code_version = VERCEL_GIT_COMMIT_SHA ?? git rev-parse HEAD`，取不到则拒绝 apply；本机工作树有未提交改动时 `code_version` 加后缀 `-dirty`）。先 `reconcileScope(market)`（§6.4），再 `scopeDue(market, now, limit)`（`next_due_at <= now`，按 `next_due_at, priority desc, issuer_id`），逐个发行人（剩余预算 < 90 s 则不再开始新发行人，回执 `deadline_hit`）：

1. `claimLease(…, 600)`；失败 → `skipped_summary(leased)`。
2. `cleanupUnpublished`。
3. 抓取（预算内）→ 快照上传。
4. 解析（§6.2/§6.3 纯函数）→ 候选事实与 filings；`sinceYear` 之前跳过。
5. 读现有行（`factsOfIssuer`，键列 + value + status + available_date + filing/mapping_gen）→ `planFactWrites`（§5.3）。
6. 写 filings（冲突读回；`mapping_gen` 先写**旧代或 0**，发布后升到当前代），`insertFacts`（`staged`）。
7. 规则（§7）对本批次新行所在的 (filing, period, unit) 组评估，输入 = 新行 ∪ 该组当前代已 `ok` 行；同日冲突检查（§5.3）。先写 `dq_quarantine` 项（payload 含自然键与 fact_ids），再 `setFactStatus(quarantined)`。
8. `publishStaged`；成功后 `updateFiling(mapping_gen = MAPPING_GEN)`（本批次处理过的每个 filing）。
9. CN：`linkCn` 对本发行人所有 `document_ref is null and link_attempts < 5` 的 annual/semiannual/q1/q3 filing（含历史的）尝试挂接；每次尝试 `link_attempts + 1`。
10. `materialize(issuer)`（§8）。
11. `releaseLease(outcome, nextDue)`：成功 `now + 7d`，失败 `now + 1d`。

任何一步抛 `LeaseLost` → 该发行人 `failed`（`lease_lost`），不再调用后续函数。批次结束 `finishBatch`；新鲜度：`recordAttempt(dataset, {ok})`，`ok` = 没有到期发行人（空转心跳）或至少一个发行人发布成功；`detail={attempted, published, failed, skipped, idle}`。

### 6.2 EDGAR companyfacts 适配器

- 请求：`GET https://data.sec.gov/api/xbrl/companyfacts/CIK{10 位}.json`，`User-Agent: $EDGAR_USER_AGENT`（缺省 `DEFAULT_USER_AGENT`）、`Accept-Encoding: gzip, deflate`；间隔 ≥ 120 ms；超时 `min(60 s, remaining − 20 s)`；`429/503` 退避 1→2→4→8 s，剩余预算不足则停止重试；`404` → `no_companyfacts`；> 50 MB → `snapshot_too_large`。cron 与脚本不同时跑（runbook）。
- **数值无损解析**（审计 N8）：`parseJsonNumbersAsStrings(bytes)`——一个小扫描器，遍历 JSON 文本，把字符串外的数字字面量替换为带引号的字符串后 `JSON.parse`；单测含 20 位整数与 `1e5` 形式；`val` 以十进制字符串进入候选并原样插入 `numeric`。
- `parseCompanyFacts(json, {concepts, sinceYear})`：按 §3 选取规则在同一 accn、同一 (start,end)、同一单位内取第一个有条目的标签；条目 → 候选 `{concept, source_concept, period_start, period_end, duration, value: string, unit, filing:{source_ref: accn, form_type（不在枚举→'other'）, fiscal_year: fy, fiscal_period: fp, available_date: filed}}`；`frame` 只进隔离 payload；`filings.period_end` = 该 accn 下 duration 条目的最大 `end`，无则 null；同 accn 同标签同期多条不同 `val` → `ambiguous_value`。`fy/fp` 不进事实行。默认 `sinceYear = 当前年 − 10`。

### 6.3 Tushare 三表适配器与巨潮挂接

- `tushareCallRaw(api, params, fields, {limit, offset, budget}) → {bytes, json}`：保留原文、`has_more`、`request_id`；token 不进 meta；数值同样用 `parseJsonNumbersAsStrings`。分页 `limit=2000`，`has_more` 则 `offset += limit`，每页一个快照。**`limit/offset/has_more` 在三个接口上的实际行为未经核对**（§15），F2-4 第一步用真实响应确认，核对前不得宣称完整。
- `api ∈ {income, balancesheet, cashflow}` × `report_type ∈ {1, 4, 5}`，`fields` = 公共字段 + §3 值字段（cashflow 加 `is_calc`，`is_calc=1` 跳过 `skipped_summary(calculated_row)`），`start_date = sinceYear0101`。三类型语义（文档原文）：1 最新合并报表；4 本年度公布的上年同期数；5 变更前保留的原数据。各自的 `f_ann_date ?? ann_date` 给 `available_date`；同日不同值 → §5.3 同日冲突隔离，不猜先后。F2-4 第一步用一家有重述记录的公司核对三类行的公告日行为并记入 runbook；某类不可信则不加载并记 §15。
- 候选：`sum(...)` 缺一不写；duration 概念 `period_start = end_date 同年 01-01`；`duration` 由 `classify()`（月份 03/06/09/12 外 → `odd_duration`）；`comp_type` 不存。
- filing：`source_ref = '<ts_code>:<end_date>:<report_type>:<f_ann_date ?? ann_date>'`；`origin` 按后缀；`form_type`：type 1/5 按月份 annual/semiannual/q1/q3，type 4 → `restatement`；`fiscal_*`、`period_end` 按 `end_date`。
- **巨潮挂接 `linkCn`**（`providers/cninfo-link.ts`，复用 `collectors/cninfo.ts`；只做 sse/szse，`.BJ` 不挂接）：对 form_type ∈ {annual, semiannual, q1, q3} 的 filing，用 `issuers.cninfo_org_id`（为空则 `topSearch` 并回写）查 `hisAnnouncement`（`seDate = available_date ± 3 天`，`category` 按类型，遍历全部分页）；候选标题必须同时含 **报告年份**（`fiscal_year`）与 **类型词**（年度报告 / 半年度报告 / 第一季度报告 / 第三季度报告），且不含 摘要、英文、更正、已取消、补充；恰好一条 → 写 `document_ref/document_url`；零条 → `'none'`；多条 → `'ambiguous'`，都不写；`link_attempts + 1`，≥ 5 次停止。读接口 `citation`：`'linked'`（有 `document_url`）/`'pending'`（CN 无）/`'edgar'`（US）。
- 覆盖摘要：按 (api, report_type) 统计 `sinceYear` 后每年的 `distinct end_date`；不足 4 的年份进回执 `coverage_summary`（信息码，不降级，不推断上市日）。
- 配额/限频：`TushareError` 码或消息含"积分/限制/频率"或 HTTP 429 → 剩余发行人跳过，`quota_exhausted`（非信息码 → partial；若此前无发行人发布则按 `batchStatusFromCounts` 为 failed）。

### 6.4 范围 `src/lib/facts/scope.ts::reconcileScope(market)`

幂等；每次运行开始时执行；只改 `reasons/priority/fetch_key`，不动调度与租约列；新行 `next_due_at = now()`：
- 美股：三个宇宙的活跃 ticker → `resolveIssuer({ticker},{today})` → 有 `cik` 才入（`reasons += 'universe:<u>'`，`priority 10`）；无 cik → `skipped_summary(no_cik)`。
- A 股（**owner 决策项 A**，§14）：默认 = `research_entity_keys.in_scope and issuer_id is not null`（跨用户去重，不记用户；`reasons += 'cohort'`）的发行人当前 `is_primary and valid_to is null` 的 `.SH/.SZ/.BJ` ticker。owner 可改为公开宇宙（`a_stock` 全体，Tushare 配额与时间成本另算）。
- 自选股（**owner 决策项 B**）：默认不进入。
- 不再出现在来源里的行 `reasons=[]`、`priority=0`。

### 6.5 触发

- `GET|POST /api/cron/facts-sync?market=US|CN[&limit=n]`：`CRON_SECRET` Bearer（复制 `securities-sync` 的 `authorized()`）；`maxDuration=300`；`deadline = start + 240 s`，新发行人要求剩余 ≥ 90 s，抓取超时按剩余预算；默认 `limit` 25。`vercel.json`：`facts-sync?market=US` 每 4 小时（`5 */4 * * *`）；`facts-sync?market=CN` **只在 A 股夹具与黄金断言进入 CI 后加入**（§12）。到期逻辑使每发行人约每周一次；美股约 1,000 个发行人以 25 × 6/天 = 150/天滚动。悬空 `running` 批次由 runbook SQL 标 `failed`。
- `scripts/facts/sync.ts --market US|CN [--issuer …]... [--limit n] [--since-year y] [--apply]`：无截止（`deadline=null`）；dry-run 不上传、不建批次。
- `scripts/facts/materialize.ts`、`scripts/facts/record-fixture.ts --edgar <cik> | --tushare <ts_code>`。

---

## 7. 规则与隔离

### 7.1 隔离

| reason_code | 触发 | natural_key | payload |
|---|---|---|---|
| `ambiguous_value` | §5.3 | `<issuer>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<source_ref>:<mapping_gen>` | `{candidates:[…]}`，无事实行 |
| `odd_duration` | §4.2 | 同上 | `{candidate}`，无事实行 |
| `missing_available_date` | §5.1 | `<issuer>:<ts_code>:<end_date>:<report_type>` | `{row}`，无事实行 |
| `same_day_conflict` | §5.3 | `<issuer>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>` | `{key, fact_ids, values:[{filing, value}]}` |
| `identity_bs` | `identityRule('identity_bs', total_assets, liabilities_and_equity, 0.005)`；无 `liabilities_and_equity` 时 `identityRule('identity_bs', total_assets, total_liabilities + equity_total, 0.005)`；单位不一致或缺 → 不检 | `<issuer>:BS:<period_end>:<unit>:<source_ref>:<mapping_gen>` | `{key, fact_ids, rule, detail}` |
| `identity_gp` | `gross_profit` 存在且 `identityRule('identity_gp', gross_profit, revenue − cost_of_revenue, 0.005)` 失败 | `<issuer>:IS:<period_start>:<period_end>:<unit>:<source_ref>:<mapping_gen>` | 同上 |

恒等式失败隔离的是该组的**本批次新行**；旧 `ok` 行不动。`payload.key` 存自然键分量，钩子按它查行（审计 N16）。

### 7.2 警告

`rangeRule('gross_margin_range', …, −1, 1)`（分母按 §8 市场规则）与 `jumpRule('revenue_jump', 本期, 上年同期当前可见值, 10)` 失败不隔离；**整个批次**每条规则一个汇总条目 `{code:'rule_warning_summary', key: ruleId, message:'n=<count>; sample=<≤10 个 key>'}`；加入 `INFO_CODES`。

### 7.3 处理钩子

`src/lib/dq/facts-resolver.ts`：`dataset` 以 `facts.` 开头的项，`resolved_accept` → 按 `payload.key` 查当前仍为 `quarantined` 的行 → `setFactStatus(ok)` → `materialize(issuer)`；行已不存在或已 `ok` → 空操作（幂等）。前三种（无事实行）的接受只是**确认知晓**，不产生事实（候选的人工选定本期不提供）。`resolved_reject` 不动行。

`POST /api/admin/dq/quarantine/[id]`：翻转后调钩子，结果写 `dq_quarantine.detail.hook={state:'done'|'failed', at, message?}`；项已是 `resolved_accept` 且 `hook.state != 'done'` 时再次 POST 重跑钩子并返回 `{resolved:'already_resolved', hook}`；审计日志记录。

---

## 8. 派生层 `src/lib/facts/derive.ts`

`FORMULA_VERSION='facts-derive/1.0'`。输入 = `getFactsAsOf` 对该发行人**所需概念全部期间**的当前值（不设回看上限；读接口的 `from/to` 只裁剪输出）；纯函数；输出行含 `basis`、`input_unit`、扁平 `inputs`（全部底层事实，含派生中间值所依赖的事实）。缺输入、单位不一致、分母为 0、期间匹配不唯一 → 不产出。

精确匹配：同期 = `period_start,period_end` 相等；上年同期 = 同 `duration` 且 `period_end` 在 350–380 天前的**唯一**事实（多个 → 不产出）；相邻 = `next.period_start = prev.period_end + 1 天`；期初 = `period_start − 1 天` 的 instant 事实（精确）。

| metric | 公式 | duration | basis / 备注 |
|---|---|---|---|
| gross_margin | US：`gross_profit / revenue`，无 `gross_profit` 则 `(revenue − cost_of_revenue)/revenue`；CN：`(revenue_operating − cost_of_revenue)/revenue_operating` | 同事实 | `standard`；金融类无 `cost_of_revenue` → 缺 |
| net_margin | `net_income_parent / revenue`（CN 分母 `revenue_operating`） | 同事实 | `standard` |
| fcf | US：`operating_cash_flow − capex`（`standard`）；CN：`operating_cash_flow − capex_incl_intangibles`（`cn_incl_intangibles`） | 同事实 | basis 如实 |
| borrowings_total | `short_term_borrowings + long_term_borrowings (+ bonds_payable)` | INSTANT | `standard` / `cn_incl_bonds` |
| q_single_<c> | 有 `3M` 事实直接用；否则 `6M − 3M`、`9M − 6M`、`12M − 9M`（同 `period_start`；得到的季度 `period_start = 减数.period_end + 1 天`） | 3M | 概念 revenue、net_income_parent、operating_income、operating_cash_flow、capex（US）/capex_incl_intangibles（CN）；两个操作数是各自 K 在 `asOf` 下的当前值，**可能来自不同 filing**（审计 N14 的已接受属性），`inputs` 列出两者 |
| ttm_<c> | 四个相邻单季之和 | TTM | |
| revenue_yoy / net_income_yoy | `(本期 − 上年同期)/abs(上年同期)` | 同事实 | |
| roe | `ttm_net_income_parent / avg(equity_parent@窗口起点−1 天, equity_parent@窗口期末)` | TTM | |

`materialize(issuer)`：`as_of=今天`，算全部行，`replaceMetrics(issuer, rows)` 原子替换（§4.4）。重建测试比较除 `computed_at` 外的全部列。

---

## 9. 读取接口

共同约定：公共只读（`anon` 的 `FactsDb`）；`force-dynamic`；参数重复 → 400；ticker 同正则；`resolveIssuer({ticker},{today})`，无 → 404 `unknown_ticker`；`asOf` 为 `YYYY-MM-DD` 且 ≤ 今天；错误与空结果 `no-store`；成功：有 `asOf` 且早于今天 → `public, max-age=600, s-maxage=3600`（历史答案可因迟到文件、隔离接受、ticker 归属变化而变；这是容忍度），否则 `successCacheControl(now)`。响应顶层 `mappingGen` = 当前代；每行带自己的 `mappingGen`。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/facts/[ticker]` | `concepts`（必填，白名单）、`from`/`to`、`asOf`、`durations`、`history=1`、`limit`（K 数，默认 200、最大 1000） | `{issuerId, ticker, asOf, mappingGen, facts:[{factId, concept, sourceConcept, statement, periodStart, periodEnd, duration, value: value_text, unit, availableDate, filingId, disclosureSeq, isRevision, mappingGen, rawHash, history?}], filings:[{filingId, formType, periodEnd, availableDate, sourceRef, url, documentRef, documentUrl, citation}]}` |
| `GET /api/facts/[ticker]/metrics` | `metrics`、`from`/`to`、`asOf`、`limit` | `{…, formulaVersion, metrics:[{metric, periodStart, periodEnd, duration, value, unit, inputUnit, basis, inputs}]}`；无 `asOf` 读表（过滤当前 `formula_version`），有则实时 derive |
| `GET /api/filings/[ticker]` | `from`/`to`（`available_date`）、`limit` | `{issuerId, ticker, filings:[…]}` |
| `GET|POST /api/cron/facts-sync` | §6.5 | 批次回执 |

`/api/financials/[ticker]` 加 `Deprecation: true` 与 `Link: </api/facts/{ticker}>; rel="successor-version"`。

---

## 10. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| SEC 429/503 重试耗尽或预算不足 | 该发行人跳过 | `failed` / `sec_unavailable` | partial |
| SEC 404 | 同上 | `no_companyfacts` | partial |
| 快照上传失败 | 不写行 | `snapshot_upload_failed` | partial |
| Tushare 配额/限频 | 剩余发行人跳过 | `quota_exhausted`（非信息） | partial / failed |
| Tushare 空响应 | 不写 | `skipped_summary(no_rows)` | — |
| 覆盖不足 | 照常写 | `coverage_summary`（信息） | — |
| 租约被占 / 租约丢失 | 跳过 / 该发行人 failed | `skipped_summary(leased)` / `lease_lost` | — / partial |
| 发行人 `merged` | 跳过 | `skipped_summary(issuer_merged)` | — |
| 解析异常 | 该发行人 failed（含字段名不含值） | `parse_error` | partial |
| 23505 | 该发行人 failed | `duplicate_key` | partial |
| 截止 | 不再开始新发行人 | `deadline_hit`（信息） | — |
| 无到期发行人 | 空转，新鲜度心跳 ok | `detail.idle=true` | success |
| `fetched>0` 无结果 | `unaccounted` | — | failed |
| 读接口 | 404 `unknown_ticker` / 400 `invalid_parameter:<name>` | | |

---

## 11. 测试策略

### 11.1 单元（vitest，`memoryFactsDb`）

- `concepts.test.ts`、`units.test.ts`、`json-numbers.test.ts`（20 位整数、小数、指数、字符串内的数字不被替换）。
- `edgar-companyfacts.test.ts`：夹具 `fixtures/edgar/CIK0000320193.trimmed.json`（AAPL 真实响应裁剪，`record-fixture.ts --edgar 320193`，文件头记录录制时间与原始 sha256）+ MSFT + 其余黄金美股；按期回退、`fy/fp` 不进事实行、封面股数、`duration`、同 accn 重复、`ambiguous_value`、`sinceYear`、`period_end` 不受 dei 影响；IFRS 夹具仅当宇宙内存在 `facts['ifrs-full']` 申报人（否则记录并跳过，不伪造）。
- `tushare-statements.test.ts`：夹具 `fixtures/tushare/<ts_code>.{income,balancesheet,cashflow}.rt{1,4,5}.p<page>.json`（600519.SH、000333.SZ、600036.SH，以及一家有 type 5 记录的公司作修订对）：YTD、`duration`、`sum`、公告日、三类 filing、`is_calc`、同日冲突、覆盖摘要、分页。
- `cninfo-link.test.ts`：年份与类型词筛选、排除词、零/一/多条、分页、`link_attempts`。
- `plan.test.ts`、`rules.test.ts`（签名、单位不一致不检、批次级汇总）、`read.test.ts`（`mapping_gen` 按 filing、`asOf`、同值重复、`staged/quarantined` 不可见）、`derive.test.ts`（精确匹配、唯一性、YTD 差分含 10-Q 现金流、相邻 TTM、basis、扁平 lineage、`from/to` 不影响值）。
- 属性测试（种子随机 200 次，无新依赖）：YTD 差分再累加恒等；迟到插入不改变读取顺序。
- `sync.test.ts`：租约失败/丢失、截止与预算、暂存→隔离→发布顺序、崩溃清理、配额、`code_version` 缺失拒绝、空转心跳。
- 路由测试：参数、缓存头、`value_text`、`citation`、`mappingGen`、`Deprecation`、钩子重跑。

### 11.2 数据库（`test:db`）

`src/lib/facts/facts.integration.test.ts`（critical）：迁移可重放；唯一约束；两条复合外键（跨发行人、日期不一致被拒）；触发器（insert 非 staged 被拒；status 迁移集合；delete 规则；filings 限定列）；五个函数（租约互斥/过期/续租、`lease_lost`、清理只删他批、发布只发本批、替换原子）；RLS 真实角色（anon 读不到 staged/quarantined/scope、不能执行函数）；`value_text` 与 20 位整数一致；SQL 口径 vs `pgFactsDb` 内存计算一致。

### 11.3 离线集成（录制回放）

- `src/lib/facts/sync-us.integration.test.ts`（critical）：美股夹具两遍（第一遍 inserted>0，第二遍全 duplicates、success）；注入更晚 filing 的修订夹具 → `versioned=1`，`asOf` 两侧回放；`materialize` 两次一致；黄金断言美股部分。
- `src/lib/facts/sync-cn.integration.test.ts`（critical，**只在 A 股夹具已录入时创建**；harness 要求每个 DB 套件都是 critical，不允许跳过块）：A 股夹具同上 + 修订对 + 巨潮挂接夹具 + 黄金断言 A 股部分。

### 11.4 黄金断言

`fixtures/gold/plan2.json`：6 家（AAPL、MSFT、一家 IFRS 20-F（若存在）、600519.SH、000333.SZ、600036.SH）× 2 期 × 6 科目（revenue、net_income_parent、total_assets、equity_total、operating_cash_flow、shares_outstanding）；每条 `{issuer, concept, period_end（dei 封面日期如实）, unit, value, source:{document, page_or_row, url}, recorded_by, recorded_at}`，**人从一手文件抄录**。每个被断言的发行人都必须有对应的采集夹具。

### 11.5 清单规则

含 `S4_TEST_STATE` 的文件都进 `criticalSuites`；全部门禁绿才算完成。

---

## 12. 分期（供计划二拆任务）

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| F2-0 迁移、函数、契约 | 迁移（四表、桶、五函数、触发器、权限）、锁文件、types、`FactsDb` 三实现、集成测试 §11.2 | `test:db`、`test:migrations` 绿 |
| F2-1 概念、单位、数值、规划、规则、读取 | `concepts/units/json-numbers/plan/rules/read.ts`、`INFO_CODES` 三个新码 | 单测绿 |
| F2-2 快照与同步核心 | `snapshot-store.ts`、`sync.ts`（租约、预算、暂存/隔离/发布、清理、空转）、`facts-resolver.ts` 与路由接入 | `sync.test.ts` 绿 |
| F2-3 EDGAR | 适配器、`record-fixture.ts --edgar`、美股夹具（AAPL/MSFT/其余黄金美股/IFRS 若有）、`sync-us.integration` | 单测与离线集成绿 |
| F2-4 Tushare + 巨潮 | `tushareCallRaw`、适配器、`cninfo-link.ts`、夹具（需 token）、1/4/5 公告日与分页核对记录、`sync-cn.integration` | token 可得：全绿；不可得：只交付单测与"未核对"记录，CN cron 不开 |
| F2-5 范围、脚本、cron | `scope.ts`、`sync.ts` 脚本、`materialize.ts`、`/api/cron/facts-sync`（US）、`vercel.json` | 真实 SEC dry-run 3 家；回执落库 |
| F2-6 派生与读接口 | `derive.ts`、三个路由、弃用头 | 美股黄金断言绿；重算一致 |
| F2-7 文档收尾 | runbook、规格一指向、§16 偏差记录 | 全量门禁绿 |

工作量：F2-0 2 人日；F2-1 2；F2-2 2.5；F2-3 2；F2-4 3；F2-5 2；F2-6 2；F2-7 1。合计约 16.5 人日。

验收样例：
1. `GET /api/facts/AAPL?concepts=revenue&durations=12M&asOf=2024-06-30` → period_end 2023-09-30 行 `availableDate=2023-11-03`、`disclosureSeq=1`；`asOf=2025-06-30` → 同期 `disclosureSeq=2`、`isRevision=false`。
2. 一家 A 股修订对：`asOf` 早于更正公告日取调整前值，之后取最新值；年报 filing `citation='linked'`。
3. 隔离 `identity_bs` 后该期 BS 新行不可见；接受后可见且指标已重算；对接受的重复 POST 幂等。
4. 两个工作者争同一发行人：后者 `leased`；前者超时后其发布抛 `lease_lost`，新持有者清理其暂存行。
5. cron 在截止后结束：`deadline_hit`，无 `staged` 残留。
6. 断网：批次 failed，旧数据不变。

---

## 13. 独立验证

- Codex（gpt-6-astra，medium）：规格两轮（01、03）与处置（04）；每个任务提交再审。
- 独立 Claude 复审（02）。
- 黄金断言由实施者之外的人抄录。
- 实时 SEC dry-run 3 家；Tushare dry-run 与 1/4/5、分页核对在 owner 提供 token 的环境做一次。
- 会计口径复核：§3 已显式分列的七处（营业总收入/营业收入、股利含利息、利息费用/利息支出、capex 含无形、现金含受限、净利润含/不含少数股东、借款不等于债务）。

---

## 14. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 A**：A 股范围 = 你的 in_scope 队列（公开事实可反推队列成员）还是公开宇宙（Tushare 配额与时间另算） | owner | 计划编写前；默认 in_scope 队列 |
| **决策 B**：自选股是否进入范围 | owner | 默认不进入 |
| **决策 C**：A 股事实在巨潮 PDF 逐值核对（计划三）之前是否对公共可见。默认可见并带 `citation` 状态；更严格的选择是 CN 事实 `status` 留在非公开直到计划三核对 | owner | 计划编写前 |
| 提供 `TUSHARE_TOKEN`（仓库外 env 文件） | owner | F2-4 前；缺失则 F2-4 按 §12 降级 |
| Vercel 环境变量 `EDGAR_USER_AGENT`、确认 `TUSHARE_TOKEN`、`CRON_SECRET` | owner | 部署前 |
| 生产执行迁移；首轮 `sync.ts --market US --limit 20 --apply`；cron 与脚本不同时运行 | owner | 合并后 |
| 黄金集抄录 | owner / 审核人 | F2-6 前 |

---

## 15. 开放问题（实施前核对）

1. Tushare：type 1 被更正后公告日是否变化；type 5 公告日是否为原始日；同日能否并存；`limit/offset/has_more` 在三接口的行为。
2. companyfacts 多类别股本公司的 `dei` 条目形态（省略还是多条）。
3. 6-K 申报人的 companyfacts 覆盖。
4. SEC `acceptanceDateTime` 补录（计划三）。
5. 合并后发行人的事实读取归属（计划三）。
6. `financial_history` 表→视图（公司研究规格）。
7. 被隔离候选的人工选定路径（本期只确认知晓）。

---

## 16. 实施记录与偏差

（计划二落地后补记，格式同规格一 §14。）
