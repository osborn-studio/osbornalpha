# 数据底座三 · F1b 标识符补全 + F5 对账与新鲜度 设计规格

日期：2026-11-04（第 1 稿。审计轨迹：`docs/audits/2026-11-04-data-foundation-3/`）
状态：草案，待 owner 评审（§13 有八项 owner 事项）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§3.2 F1b 行、§5.2 `reconcile.ts`/`freshness.ts` 段、§10 WP-F1b 与 WP-F5、§12 开放问题 1；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（下称"规格二"，第 4 稿）§1.2 推迟到计划三的四项、§7.3 处理钩子、§15 开放问题 4/5/7。规格一 §14 与规格二全文在此视为既定事实；本规格只定义它们推迟的部分，不重开已定的模型。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格逐条对照：只用一手来源（GLEIF、SEC、HKEX、交易所上市日期；OpenFIGI 与 Tushare 仅作适配器并记录上游）、每个数字可回放（对账行记录左右两侧的文件哈希与定位）、事实与判断分离（本规格不产生任何判断）、缺失保持缺失（**不推导 A 股 ISIN**，§4.1.5；不用"今天"冒充上市日）。
已定决策（规格一/二）：发行人与证券模型、`dq_*` 四表、事实层写路径只经 `security definer` 函数、ticker 读取按今天归属解析。

---

## 1. 目标与非目标

### 1.1 目标

1. **标识符补全（F1b）。** 用 GLEIF ISIN↔LEI 映射、HKEX 证券名单、OpenFIGI v3 为现有 `issuer_securities` 行填 ISIN 与 FIGI；A+H 双重上市在硬标识符一致时自动归并，其余进 `issuer_identifier_claims(pending)` 由人审核，并给审核一个页面。
2. **有证据的持有区间。** `issuer_securities.valid_from/valid_to` 从"首次观测日"升级为"有证据的上市/退市/换码日"，每一行记录证据方法；`resolveIssuer` 接受 `asOf`，能回答"2019-06-30 这个 ticker 属于谁"。
3. **合并后发行人的事实归属、SEC 受理时刻、被隔离候选的人工选定。** 规格二推迟的三个读写细节在此定稿。
4. **跨来源对账运行器（F5）。** `dq_reconciliations` 有了第一个写入者：美股 companyfacts 对 10-K/10-Q 正文的内联 XBRL；A 股 Tushare 对巨潮年报 PDF 人工抄录的黄金集；超差的事实被隔离，公共接口不再返回。
5. **财报日历新鲜度。** 按发行人、按报告期计算"应披露日"（美股按申报人类别 60/75/90 与 40/45 天，A 股按 4-30/8-31/10-31），逾期在 `/admin/dq` 可见；数据集清单由代码登记，看板下拉不再只来自已加载的行。

成功标准（计划三退出条件，全部可度量）：

- sp500 / nasdaq_top500 / us_china 三个宇宙内、持有未关闭 `issuer_securities` 行的发行人，FIGI 覆盖 ≥ 95%（分母 = 这些发行人的未关闭行数）；其中有 LEI 的发行人 ISIN 覆盖 ≥ 90%。
- 研究队列（`research_entity_keys.in_scope`）中 A 股与港股证券行，凡 `stocks_universe.list_date` 非空者，`valid_from = list_date` 且 `valid_from_method='listing_date'`，100%。
- 一组换码夹具（§4.3.4）：`resolveIssuer({ticker:'OLD'},{asOf:'换码前一日'})` 返回旧持有人，`{asOf:'换码日'}` 返回 null 或新持有人，与夹具一致。
- 美股对账对 `us.companyfacts_vs_ixbrl`：30 家样本 × 最近 1 份 10-K + 1 份 10-Q，可比较的 (概念, 期间, 单位) 通过率 ≥ 98%，每条失败在审计目录有解释。
- A 股黄金集 `cn.tushare_vs_cninfo_pdf_gold`：30 家 × 4 期 × 6 科目 = 720 条，CI（用录制夹具）通过率 ≥ 95%；生产运行通过率 ≥ 95%，失败事实已隔离。
- 范围内每个发行人在 `dq_filing_expectations` 都有最近一个报告期的行；`/admin/dq` 显示逾期数并可按市场筛选；下拉含 `DQ_DATASETS` 登记的全部数据集。
- 范围内美股 `filings`（规格二写入的）`accepted_at` 填充率 ≥ 99%。
- 一个 `ambiguous_value` 隔离项经管理员选定候选后，`GET /api/facts/[ticker]` 返回该值且 `financial_metrics` 已重算。

### 1.2 本规格之外

- A 股 ISIN 的推导（§4.1.5 说明为何撤回）。
- 全市场（`a_stock`、`hk_main` 宇宙）的发行人装载：本规格只补全**已存在**的发行人与证券行（SEC 装载的美股 + 研究队列的 A/H）。A 股全宇宙的发行人装载需要 USCI/LEI 的一手来源，归行业研究规格。
- 港股财务事实与港股对账（F3）。
- 巨潮 PDF 的机器抽取与页码定位（F3）；本规格的 A 股对账用人工抄录黄金集。
- 任何面向用户的页面；只改 `/admin/dq`。
- 规格二 `same_day_conflict` 的候选选定（规格二第 4 稿 §7.3 已含 `chosen_fact_ids`），本规格只补无事实行的 `ambiguous_value`。
- `odd_duration` 与 `missing_available_date` 的人工选定：前者无法写入（`duration` 约束），后者无可得日期，两者继续只能"确认知晓"。
- 美股 ticker 的上市日：SEC 数据不含上市日，本规格用 Form 8-A12B 的申报日作为"注册上市"证据（§4.3.3），不冒充首个交易日。

---

## 2. 现状（2026-11-04 仓库勘察事实）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 证券行 | `issuer_securities(issuer_id, ticker, isin, figi, share_class, is_primary, valid_from, valid_to, source, provenance)`，`valid_from` 由 `load-sec.ts`/`link-research.ts` 写为运行日（`--as-of`）；ISIN 只在研究链接时从 `research_entity_securities.isin` 带入；FIGI 从未写入；互斥约束 `issuer_securities_no_overlap`、`issuer_securities_isin_no_overlap`；`attachSecurity` 把 ISIN 冲突写成 claim（`src/lib/entities/securities.ts`） | 新增两列证据方法；回填 `valid_from`；填 isin/figi 只改空值 |
| 发行人 | `issuers.lei/cik/usci/cninfo_org_id` 带唯一索引；`upsertIssuerByIdentifiers` 以硬标识符（lei/cik/usci）自动归并，软冲突写 claim（`src/lib/entities/issuers.ts`、`merge.ts`） | A+H 同 LEI 的归并已由它完成；本规格只负责把 H 股证券行挂到同一发行人 |
| 声明表 | `issuer_identifier_claims(id_type in lei/cik/usci/isin/figi/cninfo_org_id, value, source, confidence, status)`，无 detail 列，无 UI（runbook §4 用 SQL 审核） | 加 `detail`、加 `ticker` 类型、加审核接口与面板 |
| 解析 | `resolveIssuer(client, q, {includeExpired, today})`，`today` 已是区间判定日（`src/lib/entities/resolve.ts`） | `asOf` 作为正式参数名，`today` 保留为别名 |
| 上市日期 | `stocks_universe.list_date/delist_date`（`20260715130000`）由证券同步写入：A 股来自 Tushare `stock_basic`（`src/lib/securities/sources/tushare-a.ts`）、港股 Tushare `hk_basic`（`tushare-hk.ts`），上游分别为交易所；美股来源 Nasdaq 目录，`list_date: null`（`us-universes.ts`） | A/H 持有区间证据来源；美股另找 |
| SEC submissions | `collectors/edgar.ts` 已读 `https://data.sec.gov/submissions/CIK##########.json` 的 `filings.recent.{accessionNumber, filingDate, acceptanceDateTime, form, primaryDocument}`；夹具 `src/lib/research/ingest/__fixtures__/collectors/edgar-submissions-1321655.json` 显示顶层还有 `category: "Large accelerated filer"`、`fiscalYearEnd: "1231"`、`formerNames[{name,from,to}]`、`tickers[]`、`exchanges[]`、`filings.files[]` | 受理时刻、申报人类别、财年末、换名与注册申报都来自这一个文件 |
| 10-K 正文 | `collectors/edgar.ts::primaryDocumentUrl`、`htmlToText` 可复用；正文自 2019 年起为内联 XBRL（`isInlineXBRL` 标志在 submissions 中） | 对账右侧直接解析 `ix:nonFraction`，不做文本/LLM 抽取 |
| GLEIF | `scripts/entity-keys/parse-gleif-isin-lei.ts` 流式读 `LEI,ISIN` CSV（`parsers.ts::selectIsinsForLeis`），只打印，不写库 | 改写为写 `issuer_securities`/claims |
| 巨潮 | `fill-cninfo-org-id.ts` 只改 `first-cohort.json`；`resolveOrgId` 在 `collectors/cninfo.ts` | 改写为写 `issuers.cninfo_org_id`（经 `upsertIssuerByIdentifiers`） |
| Tushare | `src/lib/data/sources/tushare.ts::fetchTushareDisclosureDate`（`disclosure_date`：`end_date, pre_date, actual_date, modify_date`，注释标注需 2000 积分）；规格二新增 `tushareCallRaw` | A 股预约披露日作为 `expected_date` |
| DQ | `dq_reconciliations(dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id)`，无 detail 列，无写入者；`dq_freshness` 按 dataset 一行；`loadDqDashboard` 读最近 50 条失败对账；看板 dataset 下拉来自已加载行（runbook §7 已记为缺口） | 加 `detail`/`pair` 列；新表承载按发行人的日历；代码登记数据集 |
| 事实层 | 规格二：`fact_sync_runs`、`filings`（更新仅限 `document_ref/document_url/link_attempts/mapping_gen`，列级 grant）、`financial_facts`（状态迁移 `ok→quarantined`、`quarantined→ok` 允许）、`read_facts(p_issuer, …)` 单发行人、`FactsDb.promoteQuarantined/conflictQuarantine/beginRun/stageFacts/publishRun`、`facts-resolver.ts` 钩子分阶段重试 | 本规格的对账隔离、候选选定、受理时刻、合并读取全部经新增或扩展的 `security definer` 函数，不直接写表 |
| 环境 | 本机无 `TUSHARE_TOKEN`、`EDGAR_USER_AGENT`、`OPENFIGI_API_KEY` | 夹具录制与 OpenFIGI 配额见 §13 |
| 迁移 | 已锁至 `20261105091000`；规格二占 `20261106090000` | 本规格两个迁移 `20261107090000`、`20261107091000`（§3） |

---

## 3. 数据模型

两个迁移，都可重放，都补 `migrations.lock.json` 与 `database.types.ts`（手工）。第一个不依赖规格二；第二个 `alter` 规格二的表与函数，必须在规格二迁移之后执行（CI `test:migrations` 按文件名顺序保证）。

### 3.1 `20261107090000_identifiers_and_dq.sql`（不依赖规格二）

**`issuer_securities` 新列**

```
valid_from_method  text not null default 'first_observed'
                   check (valid_from_method in ('first_observed','listing_date','registration_8a','ticker_change','curated'))
valid_to_method    text check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close'))
constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null))
```

默认 `first_observed` 对已有行为真（计划一只写过观测日）。研究链接写入的 `valid_from` 来自 `first-cohort.json` 的人工填写（文件注释自述"Listing dates … marked manual are unverified"），迁移后由 §4.3.2 的回填按 `stocks_universe.list_date` 覆盖为 `listing_date`，覆盖不到的行改标 `curated`（迁移内一条 `update … where source='curated'`）。

`provenance` 新约定键（公共可见，只放来源名、日期、文件哈希）：`isin:{source, as_of, ref}`、`figi:{source, as_of, job:{idType, exchCode}}`、`valid_from:{source, as_of, ref}`、`valid_to:{…}`。

**`issuer_identifier_claims`**

```
alter … drop constraint issuer_identifier_claims_id_type_check;
alter … add constraint issuer_identifier_claims_id_type_check check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker'));
alter … add column if not exists detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object');
alter … add column if not exists resolved_by uuid, add column if not exists resolved_at timestamptz;
constraint issuer_identifier_claims_pending_iff_unresolved check ((status = 'pending') = (resolved_at is null))
```

`detail` 为 service-only（表本身 service-only），可放证据：候选 ticker、两侧名称、ISIN 列表、来源文件哈希。`ticker` 类型的 claim 表示"该 ticker 应归属此发行人"，`value` 为 `stocks_universe.ticker`。

**`dq_reconciliations` 新列与索引**

```
pair    text not null default 'legacy' check (length(pair) between 1 and 64)
detail  jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
index (pair, created_at desc)
comment on column rel_diff: '|left-right| / max(|left|,|right|,1); null when a side is null'
```

`detail` 存两侧定位：`{left:{fact_id, raw_hash, locator}, right:{document, sha256, locator}, unit, scale, printed_decimals, reason?}`。同一 (pair, natural_key) 每次运行追加一行，不更新（对账结果是历史）。

**`dq_filing_expectations`（按发行人、按报告期的日历）**

```
issuer_id         uuid not null references issuers(issuer_id) on delete restrict
market            text not null check (market in ('US','CN'))
report_kind       text not null check (report_kind in ('10-K','10-Q','annual','semiannual','q1','q3'))
period_end        date not null
due_date          date not null
due_rule          text not null                 -- 'us.laf/1' | 'us.acc/1' | 'us.non/1' | 'us.unknown_bound/1' | 'cn.annual/1' …
expected_date     date                          -- CN：Tushare disclosure_date.pre_date；US：null
received_filing_id uuid                         -- 不建外键：第一迁移不依赖规格二；写入端校验
received_date     date
status            text not null check (status in ('pending','received','overdue','received_late'))
computed_at       timestamptz not null
batch_id          uuid not null references ingest_batches(batch_id) on delete restrict
primary key (issuer_id, market, report_kind, period_end)
index (market, status, due_date) where status in ('pending','overdue')
constraint dq_filing_expectations_received_iff check ((status in ('received','received_late')) = (received_filing_id is not null and received_date is not null))
```

**`issuer_filing_profiles`（日历输入）**

```
issuer_id          uuid primary key references issuers(issuer_id) on delete restrict
market             text not null check (market in ('US','CN'))
filer_category     text check (filer_category in ('large_accelerated','accelerated','non_accelerated','smaller_reporting','unknown'))
fiscal_year_end    text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')   -- MMDD，SEC submissions.fiscalYearEnd；CN 固定 '1231'
source             text not null                 -- 'sec_submissions' | 'exchange_rule'
source_ref         text                          -- submissions 文件 sha256
as_of              date not null
updated_at         timestamptz not null default now()
```

两张新表与 `issuer_identifier_claims` 同为 service-role only（`revoke all … from public, anon, authenticated`，RLS 开、无策略）。

**桶 `reconcile-raw`**：`insert into storage.buckets … ('reconcile-raw', false, 52428800, array['text/html','application/xhtml+xml','application/json','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict (id) do update …`。路径 `{source}/{sha256}.{ext}`，旁边 `{sha256}.meta.json`（url、fetched_at、http_status、无 token）。存：10-K/10-Q 主文档、SEC submissions JSON、HKEX 证券名单、GLEIF 映射的**筛选后**子集（只含本库发行人的 LEI 行；完整 300 MB 文件不入桶）。

### 3.2 `20261107091000_facts_extensions.sql`（依赖规格二 `20261106090000`）

**`filings` 新列**：`accepted_at timestamptz`、`acceptance_source text check (acceptance_source is null or acceptance_source in ('sec_submissions'))`，约束 `(accepted_at is null) = (acceptance_source is null)`。触发器 `filings_limited_update` 的允许集加入这两列，且只允许 `null → 非 null`（受理时刻是一手记录，不改写）。`available_date` **不变**：SEC 在 17:30 ET 后受理的文件以次工作日为申报日，`accepted_at` 的日期可早于 `available_date`，两者并存，读接口都返回。

**新 `security definer` 函数**（与规格二同法：owner 为迁移角色，`revoke execute from public, anon, authenticated; grant execute to service_role`）：

| 函数 | 行为 |
|---|---|
| `set_filing_acceptance(p_filing uuid, p_accepted timestamptz, p_source text) returns boolean` | `accepted_at is null` 时写入并返回 true；已有且相同返回 false；已有且不同抛 `23514 acceptance_conflict` |
| `reconcile_quarantine(p_fact_ids uuid[], p_batch uuid) returns int` | 把 `status='ok'` 的指定行置 `quarantined`（触发器允许 `ok→quarantined`）；返回行数；调用方先写 `dq_quarantine` 项（§5.6） |
| `read_facts_lineage(p_issuers uuid[], p_market text, p_concepts text[], p_as_of date, p_from date, p_to date, p_history boolean, p_limit int)` | 与规格二 `read_facts` 同一语句，`f.issuer_id = any(p_issuers)`，窗口分区键去掉 `issuer_id`（§4.4）；`security invoker`，`grant execute to anon, authenticated, service_role`；规格二的 `read_facts(p_issuer, …)` 改为调用它（`array[p_issuer]`），签名不变 |

被隔离候选的选定（§4.6）不需要新函数：复用规格二的 `begin_sync_run` / `stage_facts` / `publish_run`。

### 3.3 黄金集文件格式 `src/lib/facts/fixtures/gold/cn-annual-v1.json`

```json
{
  "schema": "gold/cn-annual/1",
  "recorded_by": "<姓名或代号，不是实现者>",
  "reviewed_by": "<第二人>",
  "rows": [
    {
      "ticker": "600519.SH",
      "fiscal_year": 2024,
      "concept": "revenue_operating",
      "period_start": "2024-01-01", "period_end": "2024-12-31",
      "printed_value": "174,144,061,826.37",
      "printed_unit": "CNY", "unit_multiplier": 1, "printed_decimals": 2,
      "column": "本期",
      "source": {
        "document": "贵州茅台 2024 年年度报告",
        "cninfo_announcement_id": "<announcementId>",
        "pdf_url": "<巨潮 PDF 链接>",
        "pdf_sha256": "<下载后计算>",
        "page": 12,
        "table": "主要会计数据和财务指标"
      },
      "recorded_at": "2026-11-20"
    }
  ]
}
```

规则：六个科目固定为 `revenue_operating`（营业收入）、`net_income_parent`（归属于上市公司股东的净利润）、`total_assets`（总资产）、`equity_parent`（归属于上市公司股东的净资产）、`operating_cash_flow`（经营活动产生的现金流量净额）、`eps_basic`（基本每股收益），全部出现在年报"主要会计数据和财务指标"同一张表，抄录人每份年报只需一页。`printed_value` 原样抄（含千分位），`unit_multiplier` ∈ {1, 1000, 10000, 1000000, 100000000}（元/千元/万元/百万元/亿元，银行年报多用百万元），`printed_decimals` 为该表打印的小数位。只抄"本期"列，不抄"调整后"。`period_end` 为 12-31 年报；四期 = 最近四个已披露财年（2026-11 起算：FY2022–FY2025）。校验器（§9.1）拒绝：非法 ticker、不在六科目、`printed_value` 不匹配 `^-?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$|^-?[0-9]+(\.[0-9]+)?$`、缺页码、缺 sha256、`recorded_by == reviewed_by`。

美股样本清单 `src/lib/facts/fixtures/gold/us-ixbrl-sample-v1.json`：`{schema:'gold/us-ixbrl-sample/1', issuers:[{cik, ticker, accessions:[accn10K, accn10Q]}]}`，30 家按 §5.3 规则选定，由脚本生成并提交（不是人工抄录）。

---

## 4. F1b 标识符与归属

### 4.1 ISIN 与 FIGI 填充 `scripts/entity-keys/fill-identifiers.ts`

库代码 `src/lib/entities/identifiers/{gleif.ts, openfigi.ts, hkex-list.ts, plan.ts, apply.ts}`。一个批次 `producer='fill-identifiers'`，`dataset='entities.identifiers'`，`tool_versions={gleif_file_sha256, hkex_file_sha256, openfigi:'v3', exch_map: EXCH_MAP_VERSION}`；dry-run 不建批次、不调 OpenFIGI 写路径（但会调 OpenFIGI 读，受限速）。

#### 4.1.1 阶段 A · GLEIF（LEI → ISIN 集合）

- 输入：本机下载的 GLEIF ISIN↔LEI 映射 CSV（`https://mapping.gleif.org/api/v2/isin-lei/latest/download`，zip，解压后 `LEI,ISIN`；计划一脚本已用同一文件）。公共领域数据，无许可限制。
- 复用 `parsers.ts::selectIsinsForLeis`，`leis` = `issuers.lei is not null and status='active'` 的全部 LEI。筛选后的行写入 `reconcile-raw/gleif/{sha256}.csv`（含表头），`tool_versions.gleif_file_sha256` 为原文件哈希。
- 输出：`Map<lei, isin[]>`。一个 LEI 下通常同时有股票与债券 ISIN，此阶段不判断类型。

#### 4.1.2 阶段 B · OpenFIGI（ISIN → ticker/exchCode/FIGI）

- 接口：`POST https://api.openfigi.com/v3/mapping`，头 `X-OPENFIGI-APIKEY`（可选，env `OPENFIGI_API_KEY`）。文档（2026-11-04 核对 `openfigi.com/api/documentation`）：无 key 25 请求/分钟、每请求 10 个 job；有 key 250 请求/分钟、每请求 100 个 job；限速按 key 或 IP。客户端 `openfigi.ts` 按 (有/无 key) 取对应上限的 80%，`429` 退避 60 s 一次后放弃本批剩余 job（`quota_exhausted`，非信息码）。
- job：`{idType:'ID_ISIN', idValue}`，**不带 `exchCode`**（一个 ISIN 在多个交易所的上市都要）；响应每项 `{figi, compositeFIGI, shareClassFIGI, securityType, securityType2, marketSector, exchCode, ticker, name}` 或 `{error}`/`{warning}`。
- 过滤：`marketSector='Equity'` 且 `securityType ∈ {'Common Stock','ADR','GDR','Preference','REIT','Unit'}`（前三类进入匹配；后三类只进 `skipped_summary(security_type:<type>)`）。
- 交易所映射 `EXCH_MAP`（代码常量，`EXCH_MAP_VERSION='exch-map/1'`）：`US` 系列（`US`,`UN`,`UW`,`UA`,`UR`,`UP`）→ 市场 US，ticker = `name` 原样大写后按 `normalizeSecurityTicker(…, 'US')`；`CG`（上海）→ `<ticker>.SH`；`CS`（深圳）→ `<ticker>.SZ`；`HK` → `normalizeSecurityTicker(ticker,'HK')`。**实施前用 AAPL（US0378331005）、贵州茅台（CNE0000018R8）、腾讯（KYG875721634）三个 ISIN 核对这些 exchCode 字面值并记入 runbook；核对前不得 apply**（§13 开放项）。不在映射内的 exchCode → `skipped_summary(exch:<code>)`。
- 匹配：(issuer_id 来自 LEI, 规范化 ticker) 对 `issuer_securities` 的未关闭行。命中 → 候选 `{issuer_id, ticker, isin, figi}`；ticker 在 `stocks_universe` 但不在该发行人名下 → claim `id_type='ticker'`（§4.2）；ticker 不在 `stocks_universe` → `skipped_summary(ticker_not_in_universe)`。
- 写入（`apply.ts`，只改空值，守卫更新同 `upsertIssuerByIdentifiers` 的风格）：`update issuer_securities set isin=$isin, provenance = provenance || {isin:{source:'gleif_isin_lei', as_of, ref:gleif_file_sha256}} where issuer_id=… and ticker=… and valid_to is null and isin is null`；FIGI 同法，`provenance.figi={source:'openfigi_v3', as_of, job:{idType:'ID_ISIN', exchCode}}`（**不存 API key、不存请求 URL**）。已有值且相同 → `duplicates`；已有值且不同 → claim（isin/figi），不覆盖。ISIN 唯一索引/互斥约束冲突（另一 ticker 已持有该 ISIN）→ `attachSecurity` 同样的 `isUnique` 判定 → claim `isin`，`ownership_conflict` 进隔离。

#### 4.1.3 阶段 C · 无 LEI 的 ticker（TICKER → FIGI）

对仍无 FIGI 的未关闭行：job `{idType:'TICKER', idValue:<交易所内代码>, exchCode:<EXCH_MAP 反查>}`（美股 `exchCode:'US'`，A 股按后缀 `CG/CS`，港股 `HK` 且代码去前导零，核对项同上）。恰一条 `marketSector='Equity'` 结果 → 写 FIGI；多条 → claim `figi`（detail 列出全部）；零条 → `skipped_summary(figi_not_found)`。此阶段不产生 ISIN（映射响应不含 ISIN）。

#### 4.1.4 阶段 D · HKEX 证券名单（港股代码 → ISIN）

输入：`https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx`（HKEX 通函 CT/118/25 列出此路径，2025-09-01 起删去四列）。解析为 (Stock Code, Name of Securities, Category, ISIN)。**ISIN 列是否存在以首次下载的表头为准**：存在 → 港股行的 ISIN 以它为一手来源（`provenance.isin.source='hkex_list_of_securities'`），与阶段 B 结果不一致时写对账对 `entities.isin_hkex_vs_gleif`（§5.1）并 claim；不存在 → 港股 ISIN 只来自阶段 B，记入 runbook。文件入桶。

#### 4.1.5 A 股 ISIN 不推导

规格一 §3.2 写"A 股 ISIN 规则可由代码推导作兜底"。核对事实：A 股 ISIN 的 9 位 NSIN 由中国结算分配（例 600519 → CNE0000018R8、000001 → CNE000000040），与证券代码无函数关系；美股 ISIN 虽可由 CUSIP 推导，但 CUSIP 是 CGS 授权数据，本库没有。因此**没有可推导的 ISIN**，`provenance.method='derived'` 一路撤回；无 LEI、不在 HKEX 名单、OpenFIGI 也映射不到的证券，ISIN 保持空，覆盖率按 §1.1 分母如实报告。规格一 §3.2 该行在本规格落地后标注"已撤回"。

#### 4.1.6 脚本改写

- `parse-gleif-isin-lei.ts`：保留原打印用法；`fill-identifiers.ts --gleif <csv> --hkex <xlsx> [--stage A|B|C|D|all] [--issuer <uuid>]... [--apply]` 是新的写入路径。
- `fill-cninfo-org-id.ts`：改为读 `issuers`（`usci is not null and cninfo_org_id is null` 且持有 `.SH/.SZ` 未关闭行），`resolveOrgId(code)` 命中后经 `upsertIssuerByIdentifiers({usci, cninfo_org_id, provenance:{cninfo_org_id:{source:'cninfo_topsearch', as_of}}})` 写入（函数已对 `cninfo_org_id` 冲突写 claim）；`first-cohort.json` 不再是写入目标。批次 `dataset='entities.cninfo'`。间隔 600 ms 不变。

### 4.2 A+H 配对 `scripts/entity-keys/link-ah.ts`

三条证据，强度递减，只有第一条自动：

1. **同 LEI**：`issuers` 已按 LEI 唯一，研究链接把 A 与 H 证券都挂在同一发行人上（`link-research.ts::shareClass` 的 H 判定）。阶段 B 对该 LEI 的 ISIN 映射返回 `HK` 交易所的 ticker 时，若该 ticker 在 `stocks_universe` 且无持有人 → `attachSecurity({issuer_id, ticker, isin, share_class:'H', valid_from: stocks_universe.list_date ?? as_of, valid_from_method: list_date ? 'listing_date' : 'first_observed', source:'gleif_openfigi'})`；若已被别的发行人持有 → `ownership_conflict` 隔离（计划一既有语义）。`share_class='H'` 只在该发行人同时持有 `.SH/.SZ` 行或有 USCI 时判定，否则 `unknown`（规格一 §14 规则）。
2. **HKEX 名单名称归一**（只产 claim）：`normalizeCompanyName`（`src/lib/entities/identifiers/names.ts`，纯函数）：全角转半角、去空白与标点、去后缀词表（中文：股份有限公司/有限公司/集团/控股；英文：Limited/Ltd/Co/Company/Corp/Corporation/Holdings/Group/Inc/PLC；港股名单特有：`-H`、`- H SHS`、`(H)`）、英文小写。对每个持有 A 股行、无 H 股行、有 `canonical_name_zh` 或 `canonical_name_en` 的发行人，在 HKEX 名单 `Category='Equity'` 中找归一后**完全相等**的名称；恰一条 → claim `{id_type:'ticker', value:<HK ticker>, source:'hkex_list_name_match', confidence:0.6, detail:{issuer_name, hkex_name, hkex_isin?, file_sha256}}`；多条或零条 → 不产生。不做模糊匹配。
3. **官方 A+H 名单**：HKEX / 上交所 / 深交所是否发布可下载的 A+H 公司名单，本次未能从公开检索确认 URL（§14 开放问题 1）。确认后作为第二条证据的替代（同样只产 claim 但 `confidence:0.8`，`source:'<exchange>_ah_list'`）。

批次 `dataset='entities.ah-link'`；`counts.inserted` = 自动挂接的 H 股行，`quarantined` = 隔离，claim 数进 `errors` 的信息码 `claims_summary`（加入 `INFO_CODES`）。

### 4.3 有证据的持有区间

#### 4.3.1 语义

`[valid_from, valid_to)` 仍是半开区间。`valid_from_method`：

| 值 | 证据 | 来源 |
|---|---|---|
| `first_observed` | 本库首次观测到该 ticker 归属（运行日） | `load-sec`/`link-research`（既有） |
| `listing_date` | 交易所上市日 | `stocks_universe.list_date`（A：Tushare `stock_basic`，上游 SSE/SZSE/BSE；HK：Tushare `hk_basic`，上游 HKEX） |
| `registration_8a` | SEC Form 8-A12B/8-A12G 申报日（12(b)/12(g) 注册，上市前置） | SEC submissions `filings.recent`/`files` |
| `ticker_change` | 同一发行人换码日（新码开始） | SEC 代码表日差（§4.3.4） |
| `curated` | 人工填写、未核实 | `first-cohort.json` |

`valid_to_method`：`delisting`（`stocks_universe.delist_date`）、`ticker_change`（旧码结束）、`sec_file_absent`（§4.3.4）、`curated`、`merge_close`（发行人合并时关闭旧行，runbook §1.1 流程）。

#### 4.3.2 回填 `scripts/entity-keys/backfill-windows.ts`（dataset `entities.windows`）

对每个 `issuer_securities` 行 join `stocks_universe`：
- `list_date` 非空且 `list_date < valid_from` 且 `valid_from_method in ('first_observed','curated')` → `update … set valid_from = list_date, valid_from_method='listing_date', provenance = provenance || {valid_from:{source:'stocks_universe.list_date', upstream:<tushare api>, as_of}}`，匹配条件含旧 `valid_from`（乐观）。`list_date > valid_from`（我们比上市日更早观测到，不可能）→ 隔离 `window_evidence_conflict`，不改。`valid_from` 是主键列的一部分：更新由 PostgreSQL 正常处理，互斥约束重新校验；若与同 ticker 的另一行重叠（23P01）→ 隔离 `ownership_conflict`。
- `delist_date` 非空且行未关闭 → `valid_to = delist_date, valid_to_method='delisting'`；`delist_date <= valid_from` → 隔离。
- 美股：`list_date` 为空；证据来自 §4.3.3。

#### 4.3.3 美股证据 `src/lib/entities/identifiers/sec-submissions.ts`

对范围内有 CIK 的发行人抓 submissions JSON（UA、120 ms 间隔，复用 `collectors/shared.ts::createClient`；入桶 `reconcile-raw/sec-submissions/{sha256}.json`）。一次抓取同时服务四个消费者：受理时刻（§4.5）、申报人类别与财年末（§6.1）、本节的区间证据、换名。

- `formerNames[{name, from, to}]` → `security_aliases(alias, ticker, 'name', source='sec_submissions')` 追加（表已存在，`20260715130000`），不进发行人名称。
- 最早的 `form in ('8-A12B','8-A12G')` 的 `filingDate` → 若早于该发行人**主**证券行（`is_primary`）的 `valid_from` 且方法为 `first_observed` → 回填为 `registration_8a`。只回填主行：8-A 不指明 ticker。EDGAR 电子申报自 1990 年代起，更早上市的公司没有 8-A → 保持 `first_observed`。
- `form in ('25','25-NSE')` → 不自动关闭（Form 25 可能针对债券或某一类别）；写 claim `{id_type:'ticker', value:<ticker>, source:'sec_form_25', confidence:0.5, detail:{accession, filingDate}}` 供人审。
- `tickers[]`/`exchanges[]` 与本库未关闭行比较：本库有、SEC 无 → 候选关闭（§4.3.4 的第二来源）；SEC 有、本库无且在 `stocks_universe` → 挂接为 `first_observed`（与 `load-sec` 相同语义）。

#### 4.3.4 换码检测（`load-sec.ts` 扩展）

`load-sec` 每次 `--apply` 记录 `as_of`。对一个 CIK：
- 文件中出现本库没有的 ticker → 新行 `valid_from = as_of, valid_from_method='first_observed'`（既有）。
- 本库未关闭、`source='sec_company_tickers_exchange'` 的 ticker 在文件中对该 CIK 消失：第一次消失写 `provenance.first_missing = {as_of}`（不关闭）；**再次**运行仍消失且距 `first_missing.as_of ≥ 7 天` → 关闭：`valid_to = 第一次消失的 as_of, valid_to_method = 同一 CIK 当次新增了 ticker ? 'ticker_change' : 'sec_file_absent'`；若该 ticker 在文件中已归另一 CIK → `ownership_conflict` 隔离，不关闭。
- 换码夹具：两份裁剪的 `company_tickers_exchange.json`（T0：CIK X 持 OLD；T1：CIK X 持 NEW，OLD 消失）+ 第三份 T2（≥7 天后仍无 OLD），测试 `resolveIssuer({ticker:'OLD'},{asOf:T0})` = X、`{asOf:T1}` = X（尚未关闭）、`{asOf:T2}` 查询时 OLD 行已 `valid_to=T1` → null。

#### 4.3.5 `resolveIssuer` 的 `asOf`

`ResolveOptions{includeExpired?, asOf?, today?}`：`asOf` 与 `today` 同义，二者都给且不等 → `invalid_as_of`；`today` 标记 `@deprecated`。响应 `ResolvedSecurity` 增加 `valid_from_method`、`valid_to_method`。`GET /api/entities/resolve?ticker=…&asOf=YYYY-MM-DD`：`asOf` ≤ 今天，否则 400；有 `asOf` 且早于今天时 `Cache-Control: public, max-age=600, s-maxage=3600`（历史归属也会因回填而变，容忍度与规格二一致），否则 `successCacheControl(now)`。

规格二的事实读接口新增可选参数 `tickerAsOf`：有则 `resolveIssuer({ticker},{asOf: tickerAsOf})`，无则按今天（规格二语义不变）。响应 `resolution:{tickerAsOf, issuerId, validFromMethod}`。

### 4.4 合并后发行人的事实归属（读时谱系）

- 规则：合并链最多一跳（计划一触发器保证）。目标发行人 T 的**谱系** = `{T} ∪ {i | i.merged_into = T}`。事实行保留原 `issuer_id`（`financial_facts` 触发器不允许改列），读取时 `read_facts_lineage(lineage, …)`（§3.2）按去掉 `issuer_id` 的自然键分区，合并计算 `disclosure_seq/is_current/is_revision`。同 K 同日不同值跨发行人并存时（合并前两边各自发布过）→ 读取按 `(available_date, created_at, fact_id)` 取后者，并在响应该行标 `lineageConflict:true`；同时 §5 的运行器把这种对作为对账对 `facts.lineage_same_day`（§5.1）写入供人工处理（经 `reconcile_quarantine` 隔离较早的 `created_at` 行，人工可 `promoteQuarantined` 换回）。
- `fact_sync_scope`：`merged` 发行人行 `priority=0`（规格二 `reconcileScope` 已跳过 `issuer_merged`；本规格在 `reconcileScope` 内把它的 `reasons=[]`）。
- 读接口响应：`issuerId` = T，`lineage:[<issuer_id>…]`，每行 `recordedIssuerId`。`financial_metrics`：`materialize(T)` 的输入改为谱系读取，`inputs` 自然带各自 `fact_id`。

### 4.5 SEC 受理时刻 `src/lib/facts/providers/sec-acceptance.ts`

- 触发：规格二 `runFactsSync` 美股路第 9 步之后加第 9b 步 `enrichAcceptance(issuer)`（预算允许时）；另有脚本 `scripts/facts/enrich-acceptance.ts [--issuer …] [--apply]` 补历史。
- 过程：取 §4.3.3 同一份 submissions JSON（同一运行内只抓一次）；`filings.recent` 按 `accessionNumber` 建索引；本发行人 `source='edgar' and accepted_at is null` 的 filing 逐个查：命中 → `set_filing_acceptance(filing_id, acceptanceDateTime, 'sec_submissions')`；未命中且 `filings.files[]` 非空 → 按 `filingFrom/filingTo` 覆盖该 `available_date` 的分页文件再抓一次（每页同样入桶）；仍未命中 → `skipped_summary(acceptance_not_found)`。
- 一致性：`filingDate` 必须等于 `filings.available_date`，否则写对账对 `sec.filing_date_vs_submissions`（精确，§5.1）且不写 `accepted_at`。
- 计数：写入 `inserted`，已相同 `duplicates`，`acceptance_conflict` → `failed`。

### 4.6 被隔离候选的人工选定（`ambiguous_value`）

规格二 §7.1：`ambiguous_value` 项 `payload={candidates:[…]}`，无事实行；§7.3 接受只确认知晓。本规格扩展钩子（`facts-resolver.ts`）：

- `POST /api/admin/dq/quarantine/[id]` 体可带 `chosen_candidate_index: n`（仅 `reason_code='ambiguous_value'`；越界 → 400 `invalid_choice`）。
- 钩子阶段：`claimLease(issuer, market, batch=新建 ingest_batches(producer='dq-resolver', dataset='facts.<market>')`, 60 s)` → `beginRun(issuer, market, batch, filings.mapping_gen)`（用该 filing **当前激活代**而非 `MAPPING_GEN`，使行可被读取；filing 不存在或 `mapping_gen=0` → 钩子 `failed:filing_not_active`）→ `stageFacts(run, [候选行，raw_hash 取自 payload])` → 规则（规格二 §7，同组）→ `publishRun(run, manifest=[])`（manifest 为空：不改 `filings.mapping_gen`）→ `materialize` → `releaseLease`。阶段写入 `detail.hook.stage ∈ {lease, stage, publish, materialize, done}`，失败可重试（规格二 §7.3 的幂等约定）。
- 审计日志 `detail` 加 `chosen_candidate_index` 与候选值。
- 未带 `chosen_candidate_index` 的接受仍是"确认知晓"。

---

## 5. F5 跨来源对账

### 5.1 对账对登记 `src/lib/dq/reconcile/pairs.ts`

```ts
export interface ReconcilePair { id: string; dataset: string; left: string; right: string;
  tolerance: (ctx) => number; naturalKey: (ctx) => string; onFail: 'quarantine_left' | 'claim' | 'record' }
```

| pair | left / right | natural_key | 容差 | 失败动作 |
|---|---|---|---|---|
| `us.companyfacts_vs_ixbrl` | `financial_facts`（source edgar）/ 同一 accn 主文档 `ix:nonFraction` | `<issuer>:<accn>:<concept>:<period_start>:<period_end>:<unit>` | 0（精确，§5.2） | 隔离左侧事实 |
| `cn.tushare_vs_cninfo_pdf_gold` | `financial_facts`（source tushare，当前可见值）/ 黄金集行 | `<issuer>:<fiscal_year>:<concept>` | 印刷精度容差（§5.4） | 隔离左侧事实 |
| `us.companyfacts_vs_gold` | 规格二 `fixtures/gold/plan2.json` 美股部分 | 同上 | 0 | 隔离左侧事实 |
| `sec.filing_date_vs_submissions` | `filings.available_date` / submissions `filingDate` | `<issuer>:<accn>` | 0（日期差天数） | 记录（不写 `accepted_at`） |
| `entities.isin_hkex_vs_gleif` | HKEX 名单 ISIN / GLEIF+OpenFIGI ISIN | `<ticker>` | 0（字符串相等；`left_value/right_value` 为 null，值在 `detail`） | claim |
| `facts.lineage_same_day` | 谱系内同 K 同日两行 | `<T>:<K>:<available_date>` | 0 | 隔离较早 `created_at` 行 |

`rel_diff = |l−r| / max(|l|,|r|,1)`，`abs_diff = |l−r|`，`passed = rel_diff <= tolerance`（数值对）；左或右缺失不写对账行，计 `skipped_summary(<side>_missing)`——缺失不是不一致。

### 5.2 美股右侧：内联 XBRL 解析 `src/lib/dq/reconcile/ixbrl.ts`

- 输入：10-K/10-Q 主文档（`primaryDocumentUrl(cik, accn, primaryDocument)`，`primaryDocument` 来自 submissions；`isInlineXBRL=0` 的文件 → `skipped_summary(not_inline_xbrl)`）。入桶 `reconcile-raw/edgar-primary/{sha256}.htm`；单文件 > 50 MB → `skipped_summary(document_too_large)`。
- 解析（纯函数，`parseInlineXbrl(html) → {contexts, units, facts}`，用现有依赖的 HTML 解析或正则逐标签扫描，实施时按仓库已有依赖定）：
  - `xbrli:context`：`id`、`xbrli:period`（`startDate/endDate` 或 `instant`）、是否含 `xbrli:segment`/`xbrldi:explicitMember`（含则为维度事实，跳过——companyfacts 只含非维度事实）。
  - `xbrli:unit`：`xbrli:measure`（`iso4217:USD` → `USD`，`xbrli:shares` → `shares`，`xbrli:pure` → `pure`）；`xbrli:divide` → `<分子>/<分母>` 并按规格二 `units.ts` 归一（`USD/shares` → `USD/share`）。
  - `ix:nonFraction`：`name`（`us-gaap:Revenues` 形式，映射到概念用规格二 `FACT_CONCEPTS` 的 `usGaap/ifrs` 列表，按同一回退顺序取**第一个在本文档出现**的标签）、`contextRef`、`unitRef`、`scale`（默认 0）、`sign`（`-`）、`decimals`、`format`。支持 `ixt:num-dot-decimal`、`ixt:numdotdecimal`、`ixt:num-comma-decimal`、`ixt:fixed-zero`、`ixt:zerodash`、无 format；其他 format → `skipped_summary(unsupported_format:<format>)`。值 = 去千分位后的十进制字符串 × 10^scale，sign 为负取反；嵌套 `ix:nonFraction` 取最内层文本。
  - 同一 (name, contextRef, unitRef) 在文档中出现多次（正文与附注重复标注）：值相等 → 一个事实；不等 → 右侧 `ambiguous`，写对账行 `passed=false`、`detail.reason='right_ambiguous'`，**不隔离**左侧（右侧自身矛盾不是左侧的错）。
- 匹配左侧：`filings.source_ref = accn` 的 `status='ok'` 事实（`factsByIds` 不适用；用 service-role 的 `read_facts` 变体 `p_include_non_ok=false` 按 filing 过滤，或直接 `filingsOfIssuer` + `read_facts(… history:true)` 后按 `filing_id` 筛）。键 (concept, period_start, period_end, unit)。`source_concept` 与右侧标签不同但概念相同（回退顺序不同步）→ 仍比较，`detail.tag_mismatch=true`。
- 比较：十进制字符串规范化后相等（规格二 §6.2 的规范形式）；`tolerance=0`。companyfacts 的 `val` 就是申报的 XBRL 值，与正文标注的 `value × 10^scale` 应逐位相等；任何不等都值得隔离与解释（映射错、scale 解析错、SEC 后处理）。
- 顺带抽取 `ix:nonNumeric name="dei:EntityFilerCategory"`、`dei:DocumentFiscalYearFocus`、`dei:DocumentPeriodEndDate` 进 `detail`，供 §6.1 交叉核对 submissions 的 `category`。

### 5.3 样本选择（美股 30 家）

`scripts/dq/select-us-sample.ts` 生成 `us-ixbrl-sample-v1.json`，规则确定、可重跑：规格二黄金集的美股发行人（AAPL、MSFT、IFRS 20-F 若有）必入；其余按 `security_universe_memberships` 中 sp500 的 ticker 字典序，每隔 ⌊N/27⌋ 取一个直到 30 家，要求含 ≥ 3 家 `exchanges` 含 NYSE 且 ≥ 3 家含 Nasdaq、≥ 2 家财年末非 12-31、≥ 2 家 `category` 非 large accelerated（从 submissions 读；不满足则顺延下一家）。每家取最近 1 份 10-K 与最近 1 份 10-Q 的 accession（从 `filings` 表取）。文件提交进仓库，变更走 PR。

### 5.4 A 股黄金集对账

- 左侧：`read_facts(issuer,'CN', concepts, asOf=今天)` 的当前值（`duration='12M'`，`period_end=<fy>-12-31`，`unit='CNY'`，eps `CNY/share`）。
- 右侧：黄金集行 `printed_value` 去千分位 × `unit_multiplier`。
- **印刷精度容差**：年报打印值是四舍五入到 `printed_decimals` 位、以 `unit_multiplier` 为单位的数，与原始申报值的差最多为半个最小单位。`tolerance = 0.5 × 10^(−printed_decimals) × unit_multiplier / max(|l|,|r|,1)`（相对形式，便于与列定义一致；以元两位小数打印时为 0.005/值，百万元整数打印时为 500,000/值）。超出即不一致。这是从抄录事实派生的容差，不是经验阈值；owner 若要改用固定 0.5%（规格一 §5.2 原文），见 §13 决策 D。
- 30 家选择规则（`scripts/dq/select-cn-sample.ts`，输出清单供抄录人用）：研究队列 A 股发行人全部（当前 10 家）；再从 `security_universe_memberships(universe='a_stock')` 按 ticker 字典序等距补足到 30，要求含 ≥ 3 家银行或保险（校验 `interest_expense_bank`/`revenue_operating` 口径）、≥ 2 家在 Tushare 有 `report_type=5` 行（规格二 F2-4 核对记录提供）、沪深各 ≥ 10；不满足顺延。
- 四期：FY2022–FY2025。抄录人按清单下载巨潮年报 PDF（`filings.document_url` 已挂接的优先，否则 `hisAnnouncement` 查），抄录"主要会计数据和财务指标"表，填 §3.3 格式；第二人复核后提交。
- CI 门禁：`src/lib/dq/reconcile/gold-cn.integration.test.ts`（critical，含 `S4_TEST_STATE`，登记进 `criticalSuites`）用规格二 `record-fixture.ts --tushare` 录制的 30 家夹具跑规格二 CN 同步进本地库，再跑本对账对，断言通过率 ≥ 95% 且每条失败在 `fixtures/gold/cn-annual-v1.exceptions.json` 有登记（`{natural_key, reason, recorded_by}`）；未登记的失败让测试红。夹具录制需 token（§13）。夹具未录入前测试文件不创建（规格二 §11.3 同一约定）。
- 生产：cron 每周跑一次全部 720 条，写 `dq_reconciliations`；失败 → 隔离左侧事实（§5.6）。

### 5.5 运行器 `src/lib/dq/reconcile/run.ts`

`runReconcile(deps, {pair, issuerIds?, limit, dryRun, triggeredBy})`：一个批次 `producer='reconcile'`、`dataset='reconcile.<pair>'`、`tool_versions={pair, parser: IXBRL_PARSER_VERSION, gold_schema, code_version}`；每条比较写一行 `dq_reconciliations`（`batch_id`、`pair`、`detail`）；`counts.inserted` = passed 行，`versioned` = 0，`quarantined` = 失败且已隔离，`failed` = 无法比较（解析异常）；`fetched` = 尝试比较的键数。失败动作在写对账行**之后**执行，隔离项 `payload` 带 `reconciliation_id`。预算：cron `deadline = start + 240 s`，每个发行人开始前要求剩余 ≥ 60 s；`deadline_hit` 信息码。新鲜度 `recordAttempt('reconcile.<pair>', {ok: failed===0 && fetched>0 || idle, cadence:'monthly'})`（周跑、月窗口，宽限 3 天）。

触发：`GET|POST /api/cron/reconcile?pair=<id>[&limit=n]`（`CRON_SECRET`，`maxDuration=300`）；`vercel.json`：`us.companyfacts_vs_ixbrl` 每周日 02:00 UTC（`0 2 * * 0`），`cn.tushare_vs_cninfo_pdf_gold` 每周日 03:00 UTC（**只在黄金集与夹具进入 CI 后加入**）；`sec.filing_date_vs_submissions` 与 `facts.lineage_same_day` 不单独调度（前者在 §4.5 内、后者在 lineage 读取路径发现时由脚本处理）。脚本 `scripts/dq/reconcile.ts --pair <id> [--issuer …] [--apply]`。

### 5.6 失败即隔离

- 左侧事实隔离：先 `quarantine({dataset:'facts.<market>', table:'financial_facts', naturalKey:<pair natural_key>, reasonCode:'reconcile_mismatch', detail:{pair, reconciliation_id}, payload:{key, fact_ids:[left], left_value, right_value, right_locator}})`，再 `reconcile_quarantine([left], batch)`。隔离后 `read_facts` 不再返回该行（RLS `status='ok'`），当前值回落到更早披露；`materialize(issuer)` 重算。
- 人工处理：`resolved_accept`（规格二钩子的 `identity_*` 分支同样适用：`promoteQuarantined(fact_ids)` + `materialize`）= "左侧是对的"；`resolved_reject` = "左侧确有问题"，行保持 `quarantined`，并在 `detail` 记 `needs_source_fix`。黄金集抄录错误的修正走 PR 改 json，下次运行通过后，管理员接受隔离项恢复。
- 已公开的事实被隔离会改变公共接口答案：这是预期（总纲 §5 第 2 条），owner 决策 G 确认（§13）。

---

## 6. 财报日历新鲜度

### 6.1 规则 `src/lib/dq/calendar.ts`（纯函数，`CALENDAR_RULES_VERSION='filing-calendar/1'`）

**美股**（Exchange Act 规则 13a-13/15d-13 与 Form 10-K 一般说明 A：按申报人类别）：

| 类别（submissions `category`） | 10-K | 10-Q |
|---|---|---|
| `Large accelerated filer` → `large_accelerated` | 财年末后 60 天 | 季末后 40 天 |
| `Accelerated filer` → `accelerated` | 75 天 | 40 天 |
| `Non-accelerated filer` / `Smaller reporting company`（及其组合字符串） → `non_accelerated` / `smaller_reporting` | 90 天 | 45 天 |
| 缺失或无法映射 → `unknown` | 90 天 | 45 天 |

`unknown` 用最宽的法定期限作**上界**，`due_rule='us.unknown_bound/1'`，看板显示为"类别未知·按 90/45 天上界"，不是占位值。期限落在周末或 SEC 假日顺延到下一工作日（规则 0-3；假日表为代码常量 `SEC_HOLIDAYS`，按年维护）。§5.2 从 10-K 正文抽到的 `dei:EntityFilerCategory` 与 submissions `category` 不一致 → 对账对 `sec.filer_category`（记录，不改）。

期望期间：`fiscal_year_end`（MMDD）→ 财年末 = 最近一个 ≤ 今天的该日；四个期末 = 财年末及其前推 3/6/9 个月的**月末**；52/53 周申报人（AAPL 等）的实际 `period_end` 与月末差 ±6 天，匹配时 `filings.period_end` 与期望 `period_end` 相差 ≤ 10 天视为同期。每个期望行：财年末 → `report_kind='10-K'`；其余 → `10-Q`。20-F/40-F 申报人（`filings.form_type` 最近为 20-F/40-F）：年报期限为财年末后 4 个月（Form 20-F 一般说明 A），无季报期望，`due_rule='us.20f/1'`。

**A 股**（《上市公司信息披露管理办法》第十三条、交易所上市规则）：年报 ≤ 次年 4-30、一季报 ≤ 4-30、半年报 ≤ 8-31、三季报 ≤ 10-31；`fiscal_year_end` 固定 `1231`；`expected_date` = Tushare `disclosure_date` 最新一行的 `pre_date`（`modify_date` 后以新值为准；接口需 2000 积分，不可用则 `expected_date=null`，`detail.schedule='unavailable'`）。

**状态**（读时按 `now` 重算，写时也存）：`received`（存在 `filings` 行，`form_type` 匹配 `report_kind`、`period_end` 匹配、`available_date <= due_date`）；`received_late`（匹配但 `available_date > due_date`）；`pending`（未收到且 `today <= due_date`）；`overdue`（未收到且 `today > due_date`）。`detail`（看板计算，不入表）：`days_overdue`、`expected_vs_today`（CN 预约日已过但未收到 → `late_vs_schedule`，仍是 `pending`）。10-K/A 等修订件不满足"收到"。

### 6.2 写入 `src/lib/dq/calendar-sync.ts`

- `runCalendarSync(deps, {market, limit})`：批次 `producer='filing-calendar'`、`dataset='dq.calendar.<market>'`；范围 = `fact_sync_scope(priority>0)` 的发行人；输入 = `issuer_filing_profiles`（美股从 §4.3.3 的 submissions 写入：`filer_category`、`fiscal_year_end`、`source='sec_submissions'`、`source_ref=sha256`；A 股 `filer_category=null`、`fiscal_year_end='1231'`、`source='exchange_rule'`）+ `filingsOfIssuer` 最近 8 期 + CN `disclosure_date`；输出 = 最近 6 个报告期的期望行 upsert（主键冲突则更新 `due_date/expected_date/status/received_*/computed_at/batch_id`）。
- 触发：`GET|POST /api/cron/filing-calendar?market=US|CN` 每日 01:00 UTC（`0 1 * * *`）；`scripts/dq/filing-calendar.ts`。新鲜度 `recordAttempt('dq.calendar.<market>', {ok, cadence:'daily'})`。
- 日历状态与规格二 `facts.us/facts.cn` 的数据集新鲜度是两件事：前者说"发行人该披露却没披露"，后者说"我们的采集在跑"。看板分开显示。

### 6.3 数据集清单 `src/lib/dq/datasets.ts`

```ts
export const DQ_DATASETS = [
  {dataset:'entities.sec', producer:'sec-company-tickers', cadence:'event', market:'US'},
  {dataset:'entities.research-link', producer:'research-entity-link', cadence:'event'},
  {dataset:'entities.identifiers', producer:'fill-identifiers', cadence:'event'},
  {dataset:'entities.cninfo', …}, {dataset:'entities.ah-link', …}, {dataset:'entities.windows', …},
  {dataset:'facts.us', producer:'facts-sync', cadence:'daily'}, {dataset:'facts.cn', …},
  {dataset:'reconcile.us.companyfacts_vs_ixbrl', producer:'reconcile', cadence:'monthly'}, …,
  {dataset:'dq.calendar.US', producer:'filing-calendar', cadence:'daily'}, {dataset:'dq.calendar.CN', …},
] as const;
```

测试 `datasets.test.ts`：源码中每个 `dataset:'…'` / `DATASET=` 字面量（正则扫描 `src/lib/{entities,facts,dq}`、`scripts/{entity-keys,facts,dq}`）都在登记表里；登记表无重复。`loadDqDashboard` 返回 `datasets: DQ_DATASETS ∪ 已加载行中的 dataset`（并集，去重排序），下拉用它。

---

## 7. 读取与管理接口

| 路径 | 变化 |
|---|---|
| `GET /api/entities/resolve` | 加 `asOf`（§4.3.5）；响应 `securities[]` 加 `valid_from_method/valid_to_method` |
| `GET /api/facts/[ticker]`、`/metrics`、`/api/filings/[ticker]` | 加 `tickerAsOf`；响应加 `lineage`、`resolution`、每事实 `recordedIssuerId`、每 filing `acceptedAt`（可为 null） |
| `GET /api/admin/dq` | 响应加 `datasets`、`calendar:{overdueByMarket:{US,CN}, rows:[…逾期与 7 日内到期，按 due_date 升序，≤ 100]}`、`claims:{rows, total}`（`status='pending'`，按 `created_at` 倒序，≤ 50）、`reconciliationsByPair:{<pair>:{failed, lastRunAt}}`；查询参数加 `market=US\|CN`（只筛日历） |
| `POST /api/admin/dq/quarantine/[id]` | 体加可选 `chosen_candidate_index`（§4.6） |
| `POST /api/admin/dq/claims/[id]` | 新；体 `{status:'accepted'\|'rejected'}`；`accepted` 时按 `id_type` 执行：`ticker` → `attachSecurity`（`share_class` 由 §4.2 规则、`valid_from` 取 `stocks_universe.list_date ?? 今天`）；`isin`/`figi` → 对该发行人的未关闭主行写值（空值才写；非空且不同 → 409 `value_conflict`）；`lei/cik/usci/cninfo_org_id` → `upsertIssuerByIdentifiers`（结果 conflict → 409）。所有写入在 `research_audit_log` 记 `dq.claim_resolve`；Origin/Content-Type 校验同隔离接口；`resolved_by/resolved_at` 写入；重复处理 409 |
| `GET\|POST /api/cron/reconcile`、`/api/cron/filing-calendar` | 新，`CRON_SECRET` |

公共接口不暴露 claims、日历、对账明细；对账失败对公共读者的唯一表现是事实被隔离后消失。

### 7.1 `/admin/dq` 页面流（UI 流程，视觉另在 Claude Design 画布设计）

入口：现有 `/admin/dq`（`requireAdminUser()`，未登录跳 `/login?next=%2Fadmin%2Fdq`，非管理员显示拒绝）。页面结构在现有四块（指标卡、新鲜度、批次、隔离、对账失败）上增加三块，顺序：指标卡 → 新鲜度 → **披露日历** → 批次 → 隔离 → **标识符声明** → 对账失败。

- **指标卡**：新增"逾期披露"卡（`overdueByMarket.US + CN`，> 0 为 `text-danger`，note 为 `US n · CN m`），位置在"对账失败"卡之后；小屏两列、大屏五列。
- **披露日历面板**：筛选 `market`（全部/US/CN）；表列：ticker（主证券，链接到 `/api/entities/resolve` 结果的发行人名）、市场、报告种类、期末、应披露日、规则（`due_rule`，`unknown_bound` 用 `text-warn` 并有 title 解释）、预约日（CN）、状态 Pill（`overdue` 红、`pending` 灰、`received_late` 黄、`received` 默认）、逾期天数。空状态文案："范围内没有逾期或 7 日内到期的披露"。表即表格，无图。
- **标识符声明面板**：表列：时间、发行人名、类型、值、来源、置信度、详情（`Detail` 折叠 JSON）、操作（接受/拒绝，`aria-label` 含值）；处理中行半透明；409/404 的提示复用隔离面板文案；空状态"没有待审核的声明"。小屏用卡片布局（同隔离面板）。
- **隔离面板**：`reason_code='ambiguous_value'` 的行，详情区列出 `payload.candidates`（值、单位、标签），每个候选一个单选；选定后"接受"按钮文案变为"接受并采用候选 n"；未选则维持"接受（仅确认）"。
- **对账失败面板**：加 `pair` 列与按 pair 的计数条（`reconciliationsByPair`），行的"详情"展开 `detail`（左右定位与原因）。
- **新鲜度面板**：`dq.calendar.*` 与 `reconcile.*` 行出现在同一表，不另建面板。
- 下拉：数据集选项来自 `datasets`。
- i18n：`messages/{zh,en}/admin.json` 的 `dq` 下新增 `tiles.overdue`、`sections.calendar/claims`、`columns.{market,reportKind,periodEnd,dueDate,dueRule,expectedDate,daysOverdue,idType,value,source,confidence,pair,issuer}`、`calendar.{empty,unknownBound,status.*}`、`claims.{empty,accept,reject,conflict}`、`quarantine.{chooseCandidate,acceptWithChoice,acceptAck}`；zh/en 键集一致（现有 i18n 对等测试 `src/lib/i18n/locale.test.ts` 之外若无键对等测试，本规格增加 `messages/parity.test.ts` 比较两语言 `admin.json` 的键集）。
- 所有新表格使用现有 `Table`/`Pill`/`Tile`/`Detail` 组件与 tokens（`text-warn/text-danger/bg-bg-card`），无新颜色。

**Claude Design 画布待设计清单**：
1. `/admin/dq` 指标卡行（五卡含"逾期披露"）的大小屏布局。
2. 披露日历面板：市场筛选、状态 Pill 四态、`unknown_bound` 规则提示、空状态。
3. 标识符声明面板：桌面表格与小屏卡片、接受/拒绝与冲突提示。
4. 隔离面板中 `ambiguous_value` 行的候选单选与按钮文案切换。
5. 对账失败面板的 pair 计数条与详情展开。

---

## 8. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| OpenFIGI 429 / 5xx | 退避 60 s 一次；再失败剩余 job 跳过 | `quota_exhausted`（非信息） | partial / failed |
| OpenFIGI 单 job `error`（如 "No identifier found"） | 跳过 | `skipped_summary(figi_not_found)` | — |
| exchCode 不在映射 | 跳过 | `skipped_summary(exch:<code>)` | — |
| 映射到的 ticker 属于另一发行人 | claim `ticker` + 隔离 | `ownership_conflict` | partial |
| ISIN 已被另一行持有（唯一/互斥冲突） | claim `isin` + 隔离 | `ownership_conflict` | partial |
| 已有 isin/figi 且不同 | claim，不覆盖 | `identifier_mismatch`（错误项） | partial |
| GLEIF 文件表头不是 `LEI,ISIN` | 批次 failed，不写 | `invalid_schema` | failed |
| HKEX xlsx 缺 ISIN 列 | 阶段 D 整体跳过，runbook 记录 | `skipped_summary(hkex_no_isin_column)` | — |
| 上市日晚于观测日 / 退市日早于上市日 | 隔离，不改 | `window_evidence_conflict` | partial |
| 回填 `valid_from` 触发区间重叠（23P01） | 隔离 | `ownership_conflict` | partial |
| SEC submissions 404 / 超时 | 该发行人跳过 | `sec_unavailable` | partial |
| `filingDate ≠ available_date` | 写对账行，不写受理时刻 | — | — |
| `acceptance_conflict` | 该 filing failed | `acceptance_conflict` | partial |
| 主文档非内联 XBRL / 超 50 MB / format 不支持 | 跳过该键 | `skipped_summary(…)` | — |
| 右侧自相矛盾 | 对账行 `passed=false`，不隔离 | `right_ambiguous`（detail） | — |
| 黄金集文件校验失败 | 运行器拒绝启动 | `invalid_gold_file` | failed |
| 黄金行对应事实不存在 | 跳过（缺失不是不一致） | `skipped_summary(left_missing)` | — |
| 隔离写入成功但 `reconcile_quarantine` 失败 | 对账行保留；隔离项 `detail.quarantine_error` | `quarantine_error` | partial |
| 候选选定：filing 未激活 / 租约被占 | 钩子 `failed`，可重试 | `filing_not_active` / `leased` | — |
| 日历：`fiscal_year_end` 缺失（US） | 该发行人无期望行 | `skipped_summary(no_fiscal_year_end)` | — |
| 日历：Tushare `disclosure_date` 积分不足 | `expected_date=null` | `skipped_summary(schedule_unavailable)` | — |
| 读接口 `asOf`/`tickerAsOf` 非法或晚于今天 | 400 | `invalid_parameter:<name>` | — |
| claims 接口值冲突 / 重复处理 | 409 | `value_conflict` / `already_resolved` | — |

---

## 9. 测试策略

### 9.1 单元（vitest）

- `gleif.test.ts`：复用 `selectIsinsForLeis` 的现有测试；筛选子集写桶的路径与哈希。
- `openfigi.test.ts`：夹具 `fixtures/openfigi/mapping.{isin,ticker}.json`（真实响应录制：AAPL、600519、00700、一个债券 ISIN、一个 `error` 项）；限速器（无 key 25/分、有 key 250/分，时间可注入）；`EXCH_MAP`；过滤与 `skipped_summary`。
- `hkex-list.test.ts`：xlsx 解析（裁剪真实文件 20 行；若无 ISIN 列的分支）。
- `names.test.ts`：名称归一表驱动（20 对真实 A/H 名称，含 `-H`、`(H)`、全角）。
- `plan.test.ts`/`apply.test.ts`（内存 `TableClient`）：只改空值；不同值 → claim；ISIN 互斥冲突 → claim + 隔离；dry-run 不写。
- `backfill-windows.test.ts`：三种 `list_date` 关系；主键列更新；`curated` 标注。
- `sec-submissions.test.ts`：现有夹具 `edgar-submissions-1321655.json`（PLTR：`category`、`fiscalYearEnd`、`formerNames`、无 8-A 时保持 `first_observed`）+ 一份含 `8-A12B` 与 `25-NSE` 的裁剪夹具；`files[]` 分页。
- `load-sec.test.ts` 扩展：换码三步夹具（§4.3.4）；7 天门槛；归另一 CIK → 冲突。
- `resolve.test.ts` 扩展：`asOf`/`today` 同义与冲突；新字段。
- `ixbrl.test.ts`：夹具 `fixtures/ixbrl/aapl-10k-2023.trimmed.htm`（真实主文档裁剪：`ix:header` 全部 + 含 revenue/net income/assets/shares 的 ≤ 40 个 `ix:nonFraction`，文件头注释记录原文 sha256 与 accession）；scale/sign/format/千分位/嵌套/维度上下文跳过/重复标注相等与不等/`dei:EntityFilerCategory`。
- `pairs.test.ts`/`run.test.ts`：每个 pair 的 natural_key、容差（印刷精度容差公式表驱动：元两位小数、百万元整数、eps）、`rel_diff` 定义、失败动作调用顺序（先对账行后隔离）、缺失不写行。
- `gold-cn.schema.test.ts`：§3.3 校验器全部拒绝分支；`recorded_by == reviewed_by` 拒绝。
- `calendar.test.ts`：四类期限、周末/假日顺延、52/53 周 ±10 天匹配、20-F、A 股四个节点、四种状态、修订件不算收到、`unknown_bound`。
- `datasets.test.ts`：字面量扫描。
- `facts-resolver.test.ts` 扩展：`chosen_candidate_index` 越界、阶段失败重试、用 filing 激活代。
- 路由测试：`asOf`/`tickerAsOf` 校验与缓存头；`/api/admin/dq` 新字段与 `market` 筛选；claims 接口四种 `id_type` 的动作、409、Origin；quarantine 接口新字段。
- `messages/parity.test.ts`：zh/en `admin.json` 键集相等。

### 9.2 数据库（`test:db`，critical）

`src/lib/entities/identifiers.integration.test.ts`、`src/lib/dq/dq-extensions.integration.test.ts`（都含 `S4_TEST_STATE`，登记 `criticalSuites`）：两个迁移可重放；`valid_from_method` 默认与约束；主键列 `valid_from` 更新受互斥约束保护（重叠被拒）；claims 新约束与 `ticker` 类型；`dq_reconciliations` 新列；`dq_filing_expectations` 主键与 received 约束；`issuer_filing_profiles` 正则；`filings.accepted_at` 只允许 null→值（在规格二迁移之后）；`set_filing_acceptance` 三种返回；`reconcile_quarantine` 只动 `ok` 行；`read_facts_lineage` 与 `read_facts` 对单发行人结果一致、对两发行人谱系合并分区正确；RLS：anon 读不到三张 service-only 新表、不能执行新函数；桶存在。

### 9.3 离线集成（critical）

- `src/lib/dq/reconcile/ixbrl-pair.integration.test.ts`：用规格二美股夹具同步 AAPL/MSFT 进本地库，再用主文档夹具跑 `us.companyfacts_vs_ixbrl`，断言全部 passed；人为改一条事实值后断言 `passed=false` 且该行 `quarantined`、`read_facts` 不再返回、`materialize` 重算。
- `src/lib/dq/reconcile/gold-cn.integration.test.ts`：§5.4（夹具录入后创建）。
- `src/lib/entities/ah-link.integration.test.ts`：两个研究实体（A 与 H 同 LEI）经 `link-research` 后，`fill-identifiers` 阶段 B 夹具把 H 股行挂到同一发行人；名称匹配产生一条 `ticker` claim；接受 claim 后 `resolveIssuer({ticker:H})` 命中。

### 9.4 清单规则

含 `S4_TEST_STATE` 的新测试文件全部登记 `scripts/ci/research-checks.ts::criticalSuites`；`verifyCriticalSuiteInventory` 绿。

---

## 10. 分期与工作量

| 工作包 | 交付 | 依赖 | 退出条件 | 人日 |
|---|---|---|---|---|
| F3-0 迁移一 + 类型 + 清单 | `20261107090000`、types、`datasets.ts`、`DQ_DATASETS` 并入看板下拉 | 计划一 | `test:db`/`test:migrations` 绿；下拉含全部登记数据集 | 1.5 |
| F3-1 ISIN/FIGI | `identifiers/*`、`fill-identifiers.ts`、`fill-cninfo-org-id.ts` 改写、exchCode 核对记录、OpenFIGI 夹具 | F3-0 | 美股宇宙 FIGI ≥ 95%、有 LEI 者 ISIN ≥ 90%（生产一次 `--apply` 的回执为证） | 3 |
| F3-2 持有区间与 `asOf` | 两列回填脚本、`sec-submissions.ts`、`load-sec` 换码、`resolveIssuer(asOf)`、resolve 路由 | F3-0 | 队列 A/H 行 100% `listing_date`；换码夹具测试绿 | 3 |
| F3-3 A+H 与声明面板 | `names.ts`、`link-ah.ts`、claims 接口与面板、i18n | F3-1 | 集成测试绿；队列内有 H 股的发行人全部挂接或有 pending claim | 2.5 |
| F3-4 迁移二 + 事实扩展 | `20261107091000`、三个函数、`tickerAsOf`/谱系读取、受理时刻、候选选定 | **规格二 F2-6 落地** | §9.2 第二套绿；AAPL 受理时刻填充；候选选定验收样例 | 3 |
| F3-5 美股对账 | `ixbrl.ts`、`pairs.ts`、`run.ts`、样本脚本、cron、`/admin/dq` 对账面板 pair 列 | F3-4 | 30 家 ≥ 98%，失败有解释（审计目录） | 3 |
| F3-6 A 股黄金集 | 清单脚本、校验器、抄录指引（runbook）、夹具录制、CI 门禁、cron | F3-5；抄录人；token | CI ≥ 95%；生产 ≥ 95% | 2（不含抄录 2–3 人日） |
| F3-7 日历 | `calendar.ts`、`calendar-sync.ts`、profiles 写入、cron、看板日历面板与逾期卡 | F3-2、F3-4 | 范围内发行人都有最近期行；看板可筛选 | 3 |
| F3-8 收尾 | runbook 更新、规格一 §3.2 撤回标注、规格二 §15 指向、§15 偏差记录 | 全部 | 门禁全绿 | 1 |

合计约 22 人日（不含抄录与 Tushare/OpenFIGI 等待）。F3-0 至 F3-3 不依赖规格二，可先行。

验收样例：
1. `GET /api/entities/resolve?ticker=600519.SH` → 主行 `isin='CNE0000018R8'`、`figi` 非空、`valid_from='2001-08-27'`（Tushare `stock_basic.list_date`，实施时以实际值为准）、`valid_from_method='listing_date'`。
2. 换码夹具：三个 `asOf` 的答案与 §4.3.4 一致。
3. AAPL 最近 10-K：`us.companyfacts_vs_ixbrl` 对 revenue/net_income_parent/total_assets/shares_outstanding 四条 passed；人为改值后隔离并从 `/api/facts/AAPL` 消失。
4. 黄金集一行抄错（故意）：对账 failed → 事实隔离 → 修正 json → 重跑 passed → 管理员接受 → 事实恢复。
5. 一家 A 股 2025 年报在 2026-05-01 仍未入库：日历行 `overdue`，看板逾期卡计数 ≥ 1。
6. `ambiguous_value` 项选候选 0 后接口返回该值，`financial_metrics` 的 `based_on_run` 变化。
7. 合并两个发行人后，`GET /api/facts/<T 的 ticker>` 的 `lineage` 含两者，历史期数不减少。

---

## 11. 独立验证

- Codex（gpt-6-astra，medium）两轮规格审计与处置（`docs/audits/2026-11-04-data-foundation-3/`）；每个工作包提交再审（仓库惯例）。
- 黄金集由实现者之外的两人抄录与复核；抄录错误率在 `exceptions.json` 可见。
- 美股对账的每条失败写成一段解释（映射错/解析错/SEC 后处理）落 `docs/audits/2026-11-04-data-foundation-3/ixbrl-failures-<date>.md`，Codex 复审解释是否成立。
- 标识符抽样：从阶段 B 结果随机抽 20 条，人工在 GLEIF 网站与交易所页面核对 ISIN↔ticker。
- 日历规则由一位熟悉 SEC 申报的人核对 §6.1 表（尤其 SRC 与非加速申报人的 90/45、20-F 四个月）。
- 换码与退市：从 SEC 代码表历史抽 5 个真实换码案例（如 FB→META）核对区间。

---

## 12. 依赖接口（待对齐）

| 依赖 | 本规格需要 | 状态 |
|---|---|---|
| 规格二（F2） | `fact_sync_runs`/`filings`/`financial_facts` 模型；`FactsDb.{claimLease, beginRun, stageFacts, publishRun, promoteQuarantined, readFacts, filingsOfIssuer, latestPublishedRun}`；`read_facts` 函数签名；`facts-resolver.ts` 分阶段钩子；`record-fixture.ts --tushare`；`FACT_CONCEPTS` 与 `units.ts` | 第 4 稿已定；F3-4 起依赖其落地。本规格的 `read_facts_lineage` 以 `create or replace` 扩展，不改其签名 |
| F3 文档管道 | 巨潮 PDF 的页面文本与表格抽取，用于把人工黄金集升级为机器对账 | 本规格不依赖；黄金集格式的 `source.page/table` 字段与 F3 的页码引用对齐 |
| F6 评测 | 黄金集作为评测集复用；`exceptions.json` 格式 | 本规格先定格式，F6 引用 |
| 行业研究规格 | A 股全宇宙发行人装载（USCI/LEI 来源）后，§4.1 的覆盖率分母扩大 | 不阻塞 |

---

## 13. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 A · OpenFIGI 许可与展示**：OpenFIGI 服务条款（2018-11-27 版，2026-11-04 核对）把 FIGI 标识符置于公共领域（可使用、展示、复制、分发、商业用途、无署名要求；仅限制商标暗示背书、不保证准确）。默认：FIGI 入库并在公共 `issuer_securities` 行展示。owner 确认 | owner | F3-1 前 |
| **决策 B · A 股 ISIN 不推导**：接受"无 LEI 且 OpenFIGI 映射不到的 A 股 ISIN 保持空"，不在页面上显示任何推导值 | owner | F3-1 前 |
| **决策 C · 黄金集抄录人与复核人**：两位非实现者；预计 30 份年报 × 4 期 × 1 页，约 2–3 人日；给出姓名或代号与交付日期 | owner | F3-6 前 |
| **决策 D · 对账容差**：美股精确（0）；A 股用印刷精度容差（§5.4）。替代方案：固定 0.5%（规格一原文） | owner | F3-5 前；默认按本规格 |
| **决策 E · 30 家美股/A 股样本规则**（§5.3/§5.4）与四期范围 FY2022–FY2025 | owner | F3-5 前；默认按本规格 |
| **决策 F · 对账失败隔离已公开事实**：默认是（公共接口答案会变，当前值回落到更早披露） | owner | F3-5 前 |
| **决策 G · 换码关闭门槛**：SEC 文件两次缺失且 ≥ 7 天才关闭旧 ticker | owner | F3-2 前；默认按本规格 |
| `OPENFIGI_API_KEY`（免费注册；无 key 也能跑但 10 倍慢）、`TUSHARE_TOKEN`（30 家夹具录制与 `disclosure_date`，后者需 2000 积分——不足则 `expected_date` 保持空）、`EDGAR_USER_AGENT`、`CRON_SECRET` | owner | F3-1 / F3-6 / F3-7 前 |
| 核对 OpenFIGI exchCode 字面值（§4.1.2）与 HKEX 名单 ISIN 列（§4.1.4），结果写 runbook | 实施者，owner 知悉 | F3-1 第一步 |
| 生产迁移两次；首轮 `fill-identifiers.ts --apply`、`backfill-windows.ts --apply`；cron 开启顺序：filing-calendar → reconcile US → reconcile CN（黄金集进 CI 后） | owner | 合并后 |

---

## 14. 开放问题（实施前核对）

1. HKEX / 上交所 / 深交所是否提供可下载的官方 A+H 公司名单（URL、格式、更新频率）。本次公开检索只找到 2015 年 HKEX 深港两地上市 PDF 与第三方页面；确认后进 §4.2 第三条。
2. OpenFIGI `exchCode` 字面值（`CG/CS/HK/US`）与 `securityType` 枚举的实际取值；`ID_ISIN` 不带 exchCode 时是否返回综合（composite）条目及其 exchCode。
3. HKEX `ListOfSecurities.xlsx` 当前表头是否含 ISIN。
4. SEC submissions `category` 字符串的全部变体（含 "Non-accelerated filer Smaller reporting company" 组合形式）。
5. 52/53 周申报人的期望期末 ±10 天匹配是否足够（AAPL、COST、WMT 等核对）。
6. 内联 XBRL 中 `ixt-sec` 命名空间的 format（如 `ixt-sec:numwordsen`）在财务报表主表中出现的频率；若常见则扩展解析器。
7. Tushare `disclosure_date` 的积分门槛（代码注释说 2000+）在 owner 账号是否满足。
8. 规格二 `read_facts` 的 `p_include_non_ok` 变体是否以独立函数实现；§5.2 左侧按 filing 过滤依赖它或 `history:true` 读取。

---

## 15. 实施记录与偏差

（计划三落地后补记，格式同规格一 §14。）
