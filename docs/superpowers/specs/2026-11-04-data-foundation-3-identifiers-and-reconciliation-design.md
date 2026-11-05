# 数据底座三 · F1b 标识符补全 + F5 对账与新鲜度 设计规格

日期：2026-11-04（第 3 稿。审计轨迹：`docs/audits/2026-11-04-data-foundation-3/` —— 01 Codex 第一轮（35 项）、02 Codex 第二轮（28 项新发现 + 35 项复核）、03 处置表。两轮上限已用完；第 3 稿落实处置表中全部 ACCEPT 项，Codex 终审判定见处置表末尾）
状态：草案，待 owner 评审（§13 有九项 owner 事项）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§3.2 F1b 行、§5.2、§10 WP-F1b 与 WP-F5、§12 开放问题 1；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（下称"规格二"，**第 8 稿**，Codex 第八轮判定可进入实施）§4.1、§4.5 函数表与行锁/`state_rev` 约定、§4.6 `read_facts` 信封、§4.8 `FactsDb`、§5.3、§7.1、§7.3、§15 开放问题 4/5/7。规格一 §14 与规格二第 8 稿全文在此视为既定事实；本规格只定义它们推迟的部分。规格二若再改版，§12 接口表须重新核对后才能进入计划。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格逐条对照：只用一手来源（GLEIF、SEC、HKEX、交易所上市日期；OpenFIGI 与 Tushare 仅作适配器，原始响应入桶并记哈希）、每个数字可回放（对账行记录两侧文件哈希与定位；窗口证据复制所用的源行值）、事实与判断分离（声明只记证据类别；不写置信度小数）、缺失保持缺失（**不推导 A 股 ISIN**；**8-A/25 只作证据、不生成所有权日期**；**申报人类别未知或仅 SRC 时不算法定应披露日**；**估计期末不计入法定逾期**）。

---

## 1. 目标与非目标

### 1.1 目标

1. **标识符补全（F1b）。** 用 GLEIF ISIN↔LEI 映射、HKEX 证券名单、OpenFIGI v3 为现有 `issuer_securities` 行填 ISIN 与 FIGI；A+H 双重上市在硬标识符一致时自动归并，其余进 `issuer_identifier_claims(pending)` 由人审核，审核有统一的载荷模式、原子函数与页面。
2. **有证据的持有区间。** `issuer_securities.valid_from/valid_to` 可从"首次观测日"升级为"有证据的上市/退市/换码日"，每一行记录证据方法与所用源行值；没有证据的保持 `first_observed`。`resolveIssuer` 接受 `asOf`。
3. **合并后发行人的事实归属、SEC 受理时刻、被隔离候选的人工选定。** 全部经 `security definer` 函数，持规格二同一把 `fact_sync_scope` 行锁，递增 `state_rev`；合并本身也进入该锁协议。
4. **跨来源对账运行器（F5）。** `dq_reconciliations` 有了写入者：美股 companyfacts 对 10-K/10-Q 正文内联 XBRL；A 股 Tushare 对巨潮年报 PDF 人工抄录的黄金集。预期键清单独立枚举、冻结；每个预期键恰有一个结果；超差的事实被隔离；恢复必须绑定一次当前通过的对账。
5. **财报日历新鲜度。** 按发行人、按报告期区分"期限是否已知"与"披露/入库状态"；逾期只数法定期限已知且期末为实际值的行；数据集清单由类型化登记表提供。

成功标准（计划三退出条件；每条给出度量查询，结果作为工作包交付物落审计目录；未达标按实际数字报告并由 owner 决定是否接受，不补代理值）：

| # | 标准 | 度量 |
|---|---|---|
| E1 | 美股范围发行人未关闭证券行 FIGI 覆盖 ≥ 95%；其中发行人有 LEI 的行 ISIN 覆盖 ≥ 90% | `scripts/entity-keys/coverage.ts`：`den_figi = count(s) from issuer_securities s join fact_sync_scope f using(issuer_id) where f.market='US' and f.priority>0 and s.valid_to is null`；`num_figi = … and s.figi is not null`；`den_isin = den_figi 条件 and exists(issuers i where i.issuer_id=s.issuer_id and i.lei is not null)`；`num_isin = … and s.isin is not null` |
| E2 | 研究队列 A/H 证券行中**可回填行**（该 ticker 在本库最早的持有行，且 `stocks_universe.list_date` 非空，且无 open 的 `window_evidence_conflict`/`ownership_conflict` 隔离项）`valid_from_method='listing_date'` 100%；不可回填行数与隔离项数单列 | 同脚本 `windows` 段，三个计数 |
| E3 | 换码夹具（§4.3.4）三个 `asOf` 的解析结果与夹具一致 | `load-sec.test.ts` |
| E4 | `us.companyfacts_vs_ixbrl`：样本清单独立枚举的预期键全部有结果；`passed / expected ≥ 98%`；非 passed 每条在审计目录有解释 | 周期回执 + `ixbrl-run-<date>.md` |
| E5 | `cn.tushare_vs_cninfo_pdf_gold`：黄金文件 = `tickers × 4 年 × 6 科目` 的完整乘积；CI 与生产 `passed / expected ≥ 95%`；非 passed 全部登记在 `exceptions.json` | 集成测试 + 周期回执 |
| E6 | 范围内发行人每人有最近一个已结束报告期的 `dq_filing_expectations` 行；`deadline_state` 各值计数与 `upstream_lookup='unavailable'` 计数单列 | `calendar-sync` 回执 |
| E7 | 范围内美股 `filings`（source edgar）`accepted_at` 填充率 ≥ 99% | `enrich-acceptance.ts --report` |
| E8 | 一个 `ambiguous_value` 项经选定后，`GET /api/facts/[ticker]` 返回该值，`financial_metrics.based_on_lineage` 变化 | 集成测试 |
| E9 | 看板下拉含登记表全部项；逾期卡与日历面板可按市场筛选并显示 `no_rule`/估计期末行 | 路由测试 + 人工验收 |

### 1.2 本规格之外

- A 股 ISIN 的推导（§4.1.5）。
- 全市场（`a_stock`、`hk_main`）发行人装载：本规格只补全已存在的发行人与证券行。A 股黄金集规模 N 由范围内 A 股发行人数决定（§5.4）。
- 港股财务事实与港股对账（F3）；巨潮 PDF 机器抽取（F3）。
- 任何面向用户的页面；只改 `/admin/dq`。
- 规格二 `same_day_conflict` 的选定；`odd_duration`、`missing_available_date` 的人工选定（继续只能确认知晓）。
- 美股 ticker 的上市日：SEC 数据不含；8-A/25 只作证据项（§4.3.3）。
- 40-F 法定期限（随加拿大期限，无输入）；仅 SRC 字样、无加速类别的申报人期限（Rule 12b-2 下 SRC 可同时为加速申报人，无法从 SRC 字样推出期限）。
- 发行人合并的证券转移工具：合并前的证券关闭/转移仍按 runbook §1.1 手工；本规格只提供把 `merged_into` 写入纳入锁协议的函数（§3.2 `set_merge`）。
- 对账右侧的来源不确定性建模：右侧（年报印刷值、iXBRL 标注值）按其印刷/标注精度建区间，左侧按十进制原文精确；不再进一步建模。

---

## 2. 现状（2026-11-04 仓库勘察事实）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 证券行 | `issuer_securities(issuer_id, ticker, isin, figi, share_class, is_primary, valid_from, valid_to, source, provenance)`；`valid_from` 由 `load-sec.ts` 写为运行日、由 `link-research.ts` 从 `first-cohort.json` 带入（自述"unverified"），`valid_to` 同样可由该文件带入；FIGI 从未写入；`IssuerSecurityInput` 无方法字段，`attachSecurity` 显式构造 insert 行；互斥约束 `issuer_securities_no_overlap`、`issuer_securities_isin_no_overlap` | 新列、类型与 `attachSecurity` 一起改（F3-0） |
| 发行人 | `upsertIssuerByIdentifiers` 以硬标识符归并；守卫更新只写 `status='active'` 且列为空的行 | 声明接受复用同样的守卫条件（§3.1 函数） |
| 声明表 | `issuer_identifier_claims(id_type, value, source, confidence not null, status)`，部分唯一索引 `(issuer_id,id_type,value) where pending`；`fileClaim` 固定 `confidence:0.5`；runbook §4 允许过用 SQL 处理（无 `resolved_at`） | 加列、重建索引、新约束对旧行成立 |
| 解析 | `resolveIssuer(client, q, {includeExpired, today})` | `asOf` 作为正式参数名 |
| 上市日期 | `stocks_universe.list_date/delist_date/source/source_updated_at`：A 股 Tushare `stock_basic`、港股 `hk_basic`（上游交易所）；美股 Nasdaq 目录无上市日 | A/H 证据；值复制进 provenance |
| SEC submissions | `edgar-submissions-1321655.json` 顶层 `category`、`fiscalYearEnd`、`formerNames`、`tickers`、`exchanges`，`filings.recent.{accessionNumber, filingDate, reportDate, acceptanceDateTime, form, primaryDocument, isInlineXBRL}`，`filings.files=[]`（分页未由夹具覆盖） | 受理时刻、档案、上游申报、换码第二来源 |
| 10-K 正文 | `primaryDocumentUrl`、`htmlToText`；正文自 2019 年起为内联 XBRL | 右侧解析 `ix:nonFraction` |
| 依赖 | `package.json` 有 `xlsx`；无 HTML/XML 解析库 | iXBRL 用自带有界 XML 分词器 |
| GLEIF / 巨潮 / Tushare | `parse-gleif-isin-lei.ts` 只打印；`fill-cninfo-org-id.ts` 只改 json；`fetchTushareDisclosureDate` 按 `end_date` 倒序，需 2000 积分 | 改写；按报告期精确匹配 |
| DQ | `dq_reconciliations` 无 `detail`、**无写入者、生产为空表**；`dq_freshness.expected_cadence` 枚举 daily/monthly/quarterly/event（`freshness.ts` 同）；`quarantine()` 同键 open 复用旧项；service_role 对 `dq_*` 有 update 权限；`batchStatusFromCounts` 六计数器 | 加列、加 `weekly` 节奏、每结果一个计数 |
| 事实层（规格二第 8 稿） | `fact_sync_scope.state_rev`；可见性函数持 scope 行锁；`read_facts(9 参数)` jsonb 信封、`p_include_non_ok`；`fact_state_rev()`；`resolve_facts_quarantine`、`promote_quarantined` 资格规则；`replace_financial_metrics(issuer, market, based_on_rev, rows)`；`filings_limited_update` 四列、`mapping_gen` 只增；插入必须 `staged`；`abandoned` 运行才可删行；所有 `facts.*` 项的接受经 `resolve_facts_quarantine` | 本规格新增函数、一处 `promote_quarantined` 的**附加**资格条款、一处钩子分派例外（§4.6、§5.6） |
| 环境 | 本机无 `TUSHARE_TOKEN`、`EDGAR_USER_AGENT`、`OPENFIGI_API_KEY` | §13 |
| 迁移 | 已锁至 `20261105091000`；规格二占 `20261106090000` | `20261107090000`、`20261107091000` |

---

## 3. 数据模型

两个迁移，可重放（**所有旧行回填只在新增列的那次执行**：用 `do $$ if not exists (select 1 from information_schema.columns …) then alter table … add column …; update …; end if $$` 包裹，重放不再触碰已写入的证据），补 `migrations.lock.json` 与 `database.types.ts`。第一个不依赖规格二；第二个在规格二迁移之后。`test:migrations` 在有数据的库上演练两次：第一次升级（含已关闭证券行、无 `resolved_at` 的已处理声明），写入新证据后第二次重放，断言证据未被改写。

### 3.1 `20261107090000_identifiers_and_dq.sql`（不依赖规格二）

**`issuer_securities`**

```
valid_from_method  text not null default 'first_observed'
                   check (valid_from_method in ('first_observed','listing_date','ticker_change','curated'))
valid_to_method    text check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'))
constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null))
```

首次加列时回填：`source='curated'` → `valid_from_method='curated'`；`valid_to is not null` → `valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end`。`provenance` 允许键（写入端 `sanitizeProvenance` 白名单，集成测试断言含私密键/URL token/用户 ID 的对象被拒）：`isin:{source, as_of, evidence_sha256, locator}`、`figi:{source, as_of, evidence_sha256, job:{idType, idValue, exchCode?}, level}`、`valid_from:{source, provider, as_of, row:{list_date, source, source_updated_at}}`（复制所用源行值，不引用可变表）、`valid_to:{…, row:{delist_date,…}}`、`pending_change:{first_missing_as_of, first_missing_sha256, first_missing_fetched_at, replacement_tickers, sources}`。

**`issuer_identifier_claims`**

```
drop index issuer_identifier_claims_pending_unique;
alter … drop constraint issuer_identifier_claims_id_type_check;
alter … add constraint … check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker'));
alter … alter column confidence drop not null;
add column op text not null default 'legacy'
       check (op in ('legacy','evidence_only','set_identifier','correct_identifier','attach_security','close_security','backdate_window'));
add column target_key text not null default '';          -- 写入端由 detail.target 规范化生成（§4.2.1）
add column detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object');
add column resolved_by uuid, add column resolved_at timestamptz;
constraint issuer_identifier_claims_pending_has_no_resolution check (status <> 'pending' or resolved_at is null);
create unique index issuer_identifier_claims_pending_unique on … (issuer_id, id_type, value, op, target_key) where status = 'pending';
```

首次加列时旧行 `op='legacy'`（`detail={}`，不可经路由执行，只能按 runbook §4 用 SQL 处理或拒绝）。`detail` 的统一模式见 §4.2.1。

**`dq_reconciliations`**

```
pair     text not null default 'legacy'
kind     text not null default 'numeric' check (kind in ('numeric','text','date'))
outcome  text not null default 'compared' check (outcome in ('compared','left_missing','left_unlinked','right_missing','unsupported','right_ambiguous','legacy'))
detail   jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
index (pair, created_at desc)
constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null))
constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null))
```

该表目前无写入者、生产为空；首次加列时仍把既有行（若有）标 `outcome='legacy'`。`kind='text'|'date'` 的两侧值在 `detail.left_text/right_text`，`passed` 为字符串/日期相等。`detail` 还存：`{left:{fact_id, raw_hash, locator, precision}, right:{document, sha256, locator, precision}, unit, scale, tolerance_rule, inputs_hash, reason?}`。每次运行追加，不更新。

**`dq_reconcile_cycles` 与 `dq_reconcile_cursor`**（§5.5）

```
dq_reconcile_cycles
  pair text not null, cycle_id text not null, started_at timestamptz not null, finished_at timestamptz,
  members jsonb not null check (jsonb_typeof(members)='array'),     -- 冻结的 [{issuer_id, market}]
  status text not null check (status in ('running','complete','complete_with_failures')),
  primary key (pair, cycle_id)
dq_reconcile_cursor
  pair text not null, cycle_id text not null, issuer_id uuid not null references issuers on delete restrict, market text not null,
  state text not null default 'pending' check (state in ('pending','claimed','done','failed')),
  claimed_by uuid references ingest_batches(batch_id) on delete set null, claim_until timestamptz,
  attempts int not null default 0, last_error text, done_at timestamptz,
  primary key (pair, cycle_id, issuer_id, market),
  index (pair, cycle_id, state)
```

**`dq_filing_expectations`**

```
issuer_id            uuid not null references issuers on delete restrict
market               text not null check (market in ('US','CN'))
report_kind          text not null check (report_kind in ('10-K','10-Q','20-F','40-F','annual','semiannual','q1','q3'))
period_end           date not null
period_end_estimated boolean not null default false
deadline_state       text not null check (deadline_state in ('statutory','estimated','no_rule'))
due_date             date
due_rule             text not null
expected_date        date                                  -- CN 预约日（同报告期）
upstream_lookup      text not null check (upstream_lookup in ('ok','unavailable','not_applicable'))
upstream_filed_date  date
disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream'))
received_filing_id   uuid
received_date        date
profile_as_of        date
detail               jsonb not null default '{}' check (jsonb_typeof(detail)='object')
computed_at          timestamptz not null
batch_id             uuid not null references ingest_batches on delete restrict
primary key (issuer_id, market, report_kind, period_end)
index (market, disclosure_state, due_date)
constraint dfe_due_iff_known check ((due_date is null) = (deadline_state = 'no_rule'))
constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null))
constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null)
constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory')
constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
```

`deadline_state` 与 `disclosure_state` 正交：`no_rule` 行照样可以 `received`。`estimated` 行永不 `overdue`（约束），到期未收到显示为 `pending` 加 `detail.estimated_due_passed=true`。

**`issuer_filing_profiles`**

```
issuer_id uuid not null references issuers on delete restrict, market text not null check (market in ('US','CN')),
category_raw text, acceleration text not null default 'unknown' check (acceleration in ('large_accelerated','accelerated','non_accelerated','unknown')),
smaller_reporting boolean, regime text not null check (regime in ('10-K','20-F','40-F','cn')),
fiscal_year_end text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
week52_pattern boolean not null default false, source text not null, source_sha256 text, as_of date not null, updated_at timestamptz not null default now(),
primary key (issuer_id, market)
```

**`dq_freshness`**：`expected_cadence` 枚举加 `'weekly'`（`alter table … drop constraint … add constraint … check (expected_cadence in ('daily','weekly','monthly','quarterly','event'))`）；`freshness.ts` 的 `WINDOW_MS.weekly = 7d`、`GRACE_MS.weekly = 2d`。

**函数 `resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb`**（`security definer set search_path = public`，仅 service_role）：`select … for update` 声明行；非 `pending` → `raise 'already_resolved'`；`op='legacy'` → `raise 'legacy_claim'`；`op='evidence_only'` 且 `p_status='accepted'` → 要求 `p_amend` 把它改写为可执行 op（§4.2.1 修订规则），否则 `raise 'amend_required'`；校验 `detail` 符合 `claim/1` 模式、`detail.target.issuer_id = issuer_id`、`(op, id_type)` 配对合法（表 §4.2.1）；`rejected` → 只改状态；`accepted` → 在同一事务按 op 执行业务写入（每个分支为静态 SQL，目标发行人必须 `status='active'`；每个写入要求 `get diagnostics row_count = 1`，否则抛对应码回滚）并把 `detail.provenance_written`（白名单键）同时写入目标行的 `provenance`；成功写 `status/resolved_by/resolved_at`，返回 `{op, applied}`。

**函数 `set_merge(p_source uuid, p_target uuid, p_resolved_by uuid) returns void`**：合并写入纳入锁协议（§4.4）。`security definer set search_path = public`；对 `fact_sync_scope` 中 `(p_source|p_target, market)` 的全部行（两市场；缺失的以 `priority=0, reasons='[]', fetch_key=''` 插入后）按 `(issuer_id, market)` 排序 `for update`；执行 `update issuers set status='merged', merged_into=p_target where issuer_id=p_source and status='active'`（计划一触发器校验目标活跃、源无开放证券）；两发行人各市场 `state_rev + 1`；为 pair `facts.lineage_same_day` 插入目标的游标行（`next cycle`）；写 `research_audit_log(action='entities.merge')`。runbook §1.1 的手工合并改为：手工关闭/转移证券 → 调用 `set_merge`。注意：`fact_sync_scope` 表来自规格二；本函数放在迁移二（§3.2）。

四张新表与 `issuer_identifier_claims` 为 service-role only。

**桶 `reconcile-raw`**：MIME 加 `application/pdf`；`upsert:false`，`409` 视为已存在（内容寻址，不可变）；上传失败 → 该发行人/该文件的处理 `failed`，不写依赖它的行。存：主文档、submissions JSON 与分页、HKEX 名单、GLEIF 子集（记原文件 sha256/大小）、OpenFIGI 请求与响应、Tushare `disclosure_date` 响应、黄金集引用的年报 PDF（抄录人用 `scripts/dq/gold-pdf.ts --upload` 上传，脚本校验 sha256 与 json 一致）。集成测试：anon/authenticated 不能读写该桶。

### 3.2 `20261107091000_facts_extensions.sql`（依赖规格二 `20261106090000`）

**`filings` 新列**：`accepted_at timestamptz`、`acceptance_source text check (… in ('sec_submissions'))`，`(accepted_at is null) = (acceptance_source is null)`；`filings_limited_update` 允许集加这两列且只允许 `null → 非 null`；无角色有直接 update 权限。

**`financial_metrics`**：`based_on_lineage jsonb not null default '[]'`；首次加列时 `update financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev))`；约束 `jsonb_array_length(based_on_lineage) >= 1`（加约束前回填）。规格二的 `replace_financial_metrics(issuer, market, based_on_rev, rows)` 改为包装：`select replace_financial_metrics_lineage(issuer, market, jsonb_build_array({issuer, based_on_rev}), rows)`，签名不变，`based_on_lineage` 因此总是一致。

**`promote_quarantined` 附加资格条款**（`create or replace`，只增不改）：若该行曾属于某个已处理的 `lineage_conflict` 项，则必须在该项 `detail.chosen_fact_ids` 内；若该行有 open 或已处理但 `latest_result.passed <> true` 的 `reconcile_mismatch` 项引用，则不提升（恢复只能经 `restore_reconciled`）。

**新函数**（`security definer set search_path = public`；仅 service_role，标注者除外）：

| 函数 | 行为 |
|---|---|
| `set_filing_acceptance(p_filing, p_accepted, p_source) returns boolean` | `accepted_at is null` 时写入 true；相同 false；不同 `raise 'acceptance_conflict'` |
| `reconcile_quarantine(p_issuer, p_market, p_fact_ids uuid[], p_batch uuid, p_item uuid) returns int` | 持 `(p_issuer, p_market)` scope 行锁；只把属于该发行人该市场、`ok`、所属运行 `published` 的指定行置 `quarantined`；`state_rev + 1`；把项 `detail.quarantine_state='done'`（项由调用方先建，`quarantine_state='pending'`）；返回行数 |
| `restore_reconciled(p_item uuid, p_batch uuid, p_resolved_by uuid) returns int` | 持锁；项必须 `open`、`reason_code='reconcile_mismatch'`；要求 `detail.latest_result.passed = true` 且 `detail.latest_result.inputs_hash = detail.inputs_hash_current`（运行器每轮同时更新两者：`inputs_hash` = sha256(左侧 raw_hash ‖ 右侧 sha256 ‖ parser/gold 版本)，两者相等即"最近一次通过的输入就是当前输入"）；满足则按 `promote_quarantined` 资格提升 `payload.fact_ids`，项 `resolved_accept`、`state_rev + 1`；否则 `raise 'not_passing'` |
| `adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid) returns jsonb` | 持锁；`state_rev <> p_expected_rev` → `raise 'stale_evaluation'`（调用方在同一 `state_rev` 下做过规则评估，§4.6）；项 `open` 且 `ambiguous_value`；候选越界 → `invalid_choice`；候选字段完整（concept/period/unit/value/raw_hash/mapping_gen）否则 `invalid_candidate`；filing 存在且 `filings.mapping_gen = 候选.mapping_gen` 且 `> 0`（否则 `generation_moved`）；候选键不存在（`duplicate`）；同 K 同日无值不同的 `ok` 行且无 open 争议项（`conflict_exists`）；同一事务：插入 `fact_sync_runs(issuer, market, batch_id=p_batch, mapping_gen=候选.mapping_gen, status='published', manifest='[]', published_at=now())`（管理运行：不激活映射代，不改 `filings.mapping_gen`）；插入事实 `staged` 再 `→ok`；项 `status='resolved_accept'`、`resolved_by/at`、`detail.chosen_candidate_index`、`detail.adopted_fact_id`、`detail.run_id`、`detail.hook={stage:'materialize', state:'pending', at}`（**在同一事务内**写，崩溃后可从项恢复）；`state_rev + 1`；返回 `{fact_id, run_id}` |
| `resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid) returns jsonb` | 项 `open`、`reason_code='lineage_conflict'`；`p_keep ∈ payload.fact_ids`；按 `(issuer_id, market)` 排序锁定 payload 中全部行的 scope 行；把 payload 中除 `p_keep` 外仍 `ok` 的行置 `quarantined`；要求结束后该 (K, 日期) 在谱系内恰有一个 `ok` 值（否则回滚 `unresolved`）；项 `resolved_accept`、`detail.chosen_fact_ids=[p_keep]`；涉及的每个 scope `state_rev + 1`；返回 `{quarantined}` |
| `read_facts_lineage(p_issuers uuid[], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok default false) returns jsonb` | 规格二 `read_facts` 的同一语句模板，`f.issuer_id = any(p_issuers)`，分区键去掉 `issuer_id`。**跨发行人冲突抑制只在 `array_length(p_issuers,1) > 1` 时生效，且只看 `ok` 行**：同 K 同 `available_date` 来自不同发行人且值不同的 `ok` 行不参与当前值，列入 `conflicts`；`p_include_non_ok=true` 带回的 `staged/quarantined` 行照规格二原样参与窗口计算、不参与抑制。信封 `{state_revs:[{issuer_id, state_rev}], lineage:[…], rows:[…含 issuer_id…], conflicts:[{key, available_date, fact_ids}], truncated, row_count}`。规格二 `read_facts(p_issuer, …)` 改为对单元素数组调用后映射：`state_rev = state_revs[0].state_rev`，去掉 `lineage/conflicts`；单发行人时抑制不生效，因此输出与第 8 稿语义**完全一致**（集成测试对 `ok`/`includeNonOk`/`history` 三种模式逐字段比较）。`security invoker`，`grant execute to anon, authenticated, service_role` |
| `replace_financial_metrics_lineage(p_issuer, p_market, p_based_on jsonb, p_rows jsonb) returns int` | `p_based_on` 为 `[{issuer_id, state_rev}]`，要求 issuer_id 唯一且含 `p_issuer`；对每个成员的 scope 行按 `(issuer_id, market)` 排序 `for update`（缺失 → `raise 'scope_missing'`）；锁内重算谱系 `{p_issuer} ∪ {merged_into = p_issuer}` 与 `p_based_on` 集合比较，不等 → `stale_computation`；逐个 `state_rev` 比较，不等 → `stale_computation`；删 `(p_issuer, p_market)` 物化行并插入，`based_on_rev = p_issuer 的 state_rev`，`based_on_lineage = p_based_on`。`set_merge` 也持这些锁并递增 `state_rev`，因此合并不能插入到比较与写入之间 |
| `set_merge(…)` | 见 §3.1（放在本迁移） |

**`FactsDb` 扩展**（三种实现都要）：`readFactsLineage(issuers, market, opts)`、`replaceMetricsLineage(issuer, market, basedOn, rows)`、`adoptCandidate(item, index, batch, expectedRev, resolvedBy)`、`reconcileQuarantine(issuer, market, factIds, batch, item)`、`restoreReconciled(item, batch, resolvedBy)`、`resolveLineageConflict(item, keep, batch, resolvedBy)`、`setFilingAcceptance(filing, acceptedAt, source)`、`setMerge(source, target, resolvedBy)`、`stateRevs(issuers, market)`。错误码并入 `FactsDbError`。

---

## 4. F1b 标识符与归属

### 4.1 ISIN 与 FIGI 填充 `scripts/entity-keys/fill-identifiers.ts`

库代码 `src/lib/entities/identifiers/{gleif.ts, openfigi.ts, hkex-list.ts, plan.ts, apply.ts, provenance.ts}`。批次 `producer='fill-identifiers'`，`dataset=DATASETS.entities.identifiers`，`tool_versions={gleif_file_sha256, gleif_subset_sha256, hkex_file_sha256s, openfigi:'v3', exch_map: EXCH_MAP_VERSION}`。dry-run：不建批次、不写库，调 OpenFIGI 读并输出 E1 预估。

#### 4.1.1 阶段 A · GLEIF

- 输入：GLEIF ISIN↔LEI 映射 CSV（`https://mapping.gleif.org/api/v2/isin-lei/latest/download`，zip，`LEI,ISIN`；GLEIF 说明覆盖限于参与的编码机构）。公共领域。
- 复用 `parsers.ts::selectIsinsForLeis`，`leis` = 活跃发行人的 LEI；筛选后子集入桶（`meta.json` 记原文件 sha256、字节数、下载日期）。输出 `Map<lei, isin[]>`（含债券 ISIN，此阶段不判断类型）。

#### 4.1.2 阶段 B · OpenFIGI（ISIN → ticker/exchCode/FIGI）

- `POST https://api.openfigi.com/v3/mapping`，头 `X-OPENFIGI-APIKEY`（env `OPENFIGI_API_KEY`，可选）。文档（2026-11-04 核对）：无 key 25 请求/分钟、10 job/请求；有 key 250 请求/分钟、100 job/请求。节流 80%；`429` 退避 60 s 一次后放弃本批剩余（`quota_exhausted`，非信息码）。每次请求的 job 数组与原始响应入桶（无 key）。
- job `{idType:'ID_ISIN', idValue}`，不带 `exchCode`。过滤 `marketSector='Equity'` 且 `securityType ∈ {'Common Stock','ADR','GDR'}`；其他 `skipped_summary(security_type:<type>)`。
- `EXCH_MAP`（`EXCH_MAP_VERSION='exch-map/1'`，来源 `openfigi.com/about/exchange-codes`）：`US` 与美国场所码（`UN`,`UW`,`UA`,`UR`,`UP`,`UQ`）→ US；`CG` → `.SH`；`CS` → `.SZ`；`CH` → 按 ticker 前缀（6/9 → `.SH`，0/3 → `.SZ`）；`HK` → 港股。ticker 取响应 **`ticker`** 字段，再 `normalizeSecurityTicker(…, market)`。**实施前实测 AAPL（US0378331005）、贵州茅台（CNE0000018R8）、腾讯（KYG875721634），把 exchCode/securityType/compositeFIGI 的实际值记入 runbook；核对前不得 apply。**
- **存储层级与去重**：有 `compositeFIGI` 的结果按 `compositeFIGI` 分组（一组 = 一个候选，存 `compositeFIGI`，`level='composite'`）；没有 `compositeFIGI` 的结果按 `figi`（场所级）分组，`level='venue'`。对一个规范化 ticker：恰一组 → 候选；多组（无论层级）→ 不写，claim `figi`（`op='set_identifier'`，`detail.candidates` 全部列出，`evidence_kind='provider_mapping'`）。处理前按 `(compositeFIGI ?? figi)` 排序，结果顺序不影响结论（置换顺序夹具）。不发明场所偏好。
- 匹配：(issuer_id 来自 LEI, 规范化 ticker) 对未关闭行。命中 → 候选；ticker 在 `stocks_universe` 但不在该发行人名下 → claim `attach_security`；不在 → `skipped_summary(ticker_not_in_universe)`。
- 写入（`apply.ts`，目标行 `(issuer_id, ticker, valid_from)`）：列为空 → 守卫更新写值 + provenance；已有且相同 → 若 provenance 缺该键则只补 provenance（`duplicates`）；已有且不同 → claim `correct_identifier`（`params.expected_current=<旧值>`，`params.new_value`），不覆盖。ISIN 唯一/互斥冲突 → claim + 隔离 `ownership_conflict`。

#### 4.1.3 阶段 C · TICKER → FIGI

对仍无 FIGI 的未关闭行：job `{idType:'TICKER', idValue:<交易所内代码>, exchCode:<反查：US→'US'，.SH→'CG'，.SZ→'CS'，.HK→'HK'（去前导零）>}`；分组规则同 B；恰一组 → 写；多组 → claim；零 → `skipped_summary(figi_not_found)`。不产生 ISIN。

#### 4.1.4 阶段 D · HKEX（港股代码 → ISIN）

下载三份：`ListOfSecurities.xlsx`（`https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx`，通函 CT/118/25）、HKEX "Securities Lists" 页的 "ISINs assigned by HKEX" 与 "Other Numbering Agencies" 文件。以表头为准确定 ISIN 来源（优先第一份）；三者都无 → 港股 ISIN 只来自阶段 B，记 runbook。`xlsx` 解析为 (Stock Code, Name, Category, ISIN)。港股行 ISIN 以此为一手来源（`provenance.isin.source='hkex_<file>'`）；与阶段 B 不一致 → 对账对 `entities.isin_hkex_vs_gleif`（`kind='text'`）+ claim。

#### 4.1.5 A 股 ISIN 不推导

A 股 ISIN 的 NSIN 由中国境内的 ANNA 成员编码机构分配，与证券代码无函数关系（600519 → CNE0000018R8、000001 → CNE000000040）；美股 ISIN 可由 CUSIP 推导但本库无 CUSIP。无可推导的 ISIN；覆盖率按 E1 如实报告。规格一 §3.2 该行落地后标注"已撤回"。

#### 4.1.6 脚本改写

- `fill-identifiers.ts --gleif <csv> --hkex <dir> [--stage A|B|C|D|all] [--issuer <uuid>]... [--apply]`。
- `fill-cninfo-org-id.ts`：读 `issuers`（`usci is not null and cninfo_org_id is null` 且持 `.SH/.SZ` 未关闭行），`resolveOrgId` 命中 → 守卫更新（`status='active' and cninfo_org_id is null`）；唯一索引冲突 → claim `set_identifier`（目标 `{issuer_id}`）。`first-cohort.json` 不再是写入目标。批次 `DATASETS.entities.cninfo`。

### 4.2 声明（claims）与 A+H 配对

#### 4.2.1 统一载荷 `claim/1`

`detail = {schema:'claim/1', evidence_kind, target, params, evidence:{source, as_of, evidence_sha256, locator?, note?}, sources:[…追加…], provenance_written?}`。`target_key` 列 = `op:` + 规范化 target（`issuer_id` 或 `issuer_id|ticker|valid_from`）。`claims.ts::validateClaimDetail(op, id_type, detail)` 在写入端校验，SQL 函数再校验一次（字段存在与类型）。

| `op` | `id_type` | `target` | `params` | 接受时（函数内静态 SQL；目标发行人必须 `active`；`row_count` 必须 = 1） |
|---|---|---|---|---|
| `set_identifier` | lei/cik/usci/cninfo_org_id | `{issuer_id}` | `{}` | `update issuers set <col>=value, provenance=provenance||{<col>:prov} where issuer_id and status='active' and <col> is null`；唯一冲突/0 行 → `value_conflict` |
| `set_identifier` | isin/figi | `{issuer_id, ticker, valid_from}` | `{}` | 对该证券行同样的空值守卫更新 + provenance |
| `correct_identifier` | 同上两组 | 同上 | `{expected_current, new_value}` | `where <col> = expected_current` 的守卫更新；0 行 → `value_conflict`；`value` 列 = `new_value` |
| `attach_security` | ticker | `{issuer_id}` | `{share_class, valid_from, valid_from_method, source, isin?}` | 插入 `issuer_securities`（`source` 必填；冲突分类同 `attachSecurity` → `ownership_conflict`） |
| `close_security` | ticker | `{issuer_id, ticker, valid_from}` | `{valid_to, valid_to_method}` | `update … set valid_to, valid_to_method, provenance where … and valid_to is null`；0 行 → `already_closed` |
| `backdate_window` | ticker | `{issuer_id, ticker, valid_from}` | `{new_valid_from, valid_from_method}` | `update … set valid_from=new where … and valid_from=target.valid_from`；0 行 → `value_conflict`；23505/23P01 → `ownership_conflict` |
| `evidence_only` | ticker | `{issuer_id}` | `{suggested_op?, …}` | **不可直接接受**：接受必须带 `p_amend={op, target, params}`（审核人读原文后填写证据所指的证券与生效日），函数把项改写为该 op 后按其分支执行；`detail.amended_by/at`、`detail.original_params` 保留 |
| `legacy` | 任意 | — | — | 路由 409 `legacy_claim`；runbook §4 SQL 处理 |

`evidence_kind ∈ {hard_identifier, official_list, name_match, filing_form, provider_mapping}`；`confidence` 为 null。`fileClaim(client, {issuer_id, id_type, value, source, op, detail})`：同 `(issuer_id, id_type, value, op, target_key)` pending 已存在 → 守卫更新追加 `detail.sources[]`（不改 target/params），返回 false。

#### 4.2.2 A+H 配对 `scripts/entity-keys/link-ah.ts`

1. **同 LEI**（自动，`hard_identifier`）：阶段 B 对该 LEI 返回 `HK` ticker，且该 ticker 在 `stocks_universe` 且无持有人 → `attachSecurity({issuer_id, ticker, isin, share_class, valid_from: stocks_universe.list_date ?? as_of, valid_from_method: list_date ? 'listing_date' : 'first_observed', source:'gleif_openfigi', provenance})`；已被别的发行人持有 → `ownership_conflict` 隔离。`share_class='H'` 只在该发行人同时持有 `.SH/.SZ` 行或有 USCI 时判定，否则 `unknown`。
2. **HKEX 名单名称归一**（只产 claim `attach_security`，`name_match`）：`normalizeCompanyName`（纯函数：全角转半角、去空白与标点、去后缀词表——中文 股份有限公司/有限公司/集团/控股；英文 Limited/Ltd/Co/Company/Corp/Corporation/Holdings/Group/Inc/PLC；港股 `-H`、`- H SHS`、`(H)`；英文小写）。持有 A 股行、无 H 股行、有名称的发行人，在名单 `Category='Equity'` 中找归一后完全相等者；恰一条 → claim（`params.share_class` 按规则 1，`valid_from` 同规则 1，`source='hkex_list_name_match'`）；多条或零条 → 不产生。
3. **官方 A+H 名单**（`official_list`）：URL 未确认（§14-1）；确认后替代第二条。

批次 `DATASETS.entities.ahLink`；claim 数进信息码 `claims_summary`。

### 4.3 有证据的持有区间

#### 4.3.1 语义

`[valid_from, valid_to)` 半开。方法枚举见 §3.1。**上市日只属于该 ticker 在本库最早的持有行**；更晚的持有行（ticker 被另一发行人再用）保持原方法。

#### 4.3.2 回填 `scripts/entity-keys/backfill-windows.ts`（`DATASETS.entities.windows`）

对每个证券行 join `stocks_universe`（同 ticker）：
- 可回填条件：`list_date` 非空；本行是该 ticker `valid_from` 最小的行；方法 ∈ {`first_observed`,`curated`}。
  - `list_date <= valid_from` → `update … set valid_from=list_date, valid_from_method='listing_date', provenance=provenance||{valid_from:{source:'stocks_universe.list_date', provider:<source>, as_of, row:{list_date, source, source_updated_at}}} where issuer_id and ticker and valid_from=<旧>`（相等时只改方法与 provenance）。23P01/23505 → 隔离 `ownership_conflict`。
  - `list_date > valid_from` → 隔离 `window_evidence_conflict`，不改。
- `delist_date` 非空且行未关闭且本行是该 ticker 最晚的持有行 → `valid_to=delist_date, valid_to_method='delisting'`（provenance 同法）；`delist_date <= valid_from` → 隔离。
- 美股无 `list_date`：不回填。

#### 4.3.3 美股：SEC submissions `src/lib/entities/identifiers/sec-submissions.ts`

对范围内有 CIK 的发行人抓 submissions JSON（UA、120 ms 间隔；入桶；`filings.files[]` 的分页在需要时抓取并入桶——F3-4 第一步用一家申报超过 `recent` 容量的老公司实测结构并录夹具）。一次抓取服务五个消费者（受理时刻、档案、上游申报存在性、本节证据、换名）。

- `formerNames` → `security_aliases(alias, ticker=主行, 'name', source='sec_submissions')`。
- `8-A12B`/`8-A12G`、`25`/`25-NSE`：写 **`evidence_only`** claim（`evidence_kind='filing_form'`，`target={issuer_id}`，`params={suggested_op:'backdate_window'|'close_security', accession, form, filing_date, note}`；8-A12G 注明"12(g) 注册，非交易所上市"；Form 25 注明"Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别"）。**不预填证券与日期**；审核人读原文后用 `p_amend` 指定证券行与生效日。
- `tickers[]`：SEC 有、本库无且在 `stocks_universe` → 挂接 `first_observed`；本库有、SEC 无 → §4.3.4 的第二来源。

#### 4.3.4 换码检测（`load-sec.ts` 扩展）

`load-sec --apply` 必须带 `--fetched-at <ISO>`（下载时刻，写入 `tool_versions`）与文件 sha256；`as_of` 与 `fetched_at` 都必须 ≥ 上一次成功批次的值（`stale_snapshot`）；文件数据行数 < 上一次的 90% → 拒绝（`incomplete_snapshot`）。对一个 CIK：
- 新 ticker → 新行 `first_observed`（既有）。
- 本库未关闭、`source='sec_company_tickers_exchange'` 的 ticker 在文件中对该 CIK 消失：
  - 首次：`provenance.pending_change={first_missing_as_of, first_missing_sha256, first_missing_fetched_at, replacement_tickers:[本次该 CIK 新增且 securityType 不明的 ticker], sources:['sec_company_tickers_exchange']}`，不关闭。
  - 再次出现 → 删除 `pending_change`。
  - 关闭条件（全部满足）：仍消失；`fetched_at − first_missing_fetched_at ≥ 7 天`；本次 sha256 ≠ 首次；**第二来源确认**：该 CIK 的 submissions `tickers[]`（本次运行抓取）不含 OLD。则 `valid_to = first_missing_as_of`；`valid_to_method` = `replacement_tickers` 非空且 submissions `tickers[]` 含其中之一 ? `'ticker_change'` : `'sec_file_absent'`；对应新行 `valid_from_method` 改为 `ticker_change`（守卫：仍为 `first_observed`）；`provenance.valid_to` 记两次文件哈希与 submissions 哈希。
  - 该 ticker 在文件中归另一 CIK → `ownership_conflict` 隔离，不关闭。
  - 关闭后再次出现 → 新行 `first_observed`（从再出现的 `as_of` 起）；旧关闭行不改（观测史如实保留）。
- 换码夹具：T0（CIK X 持 OLD）、T1（X 持 NEW，OLD 消失，`as_of=T0+1d`）、T2（仍无 OLD，`as_of=T0+8d`，不同 sha256，submissions 夹具 `tickers=['NEW']`）。断言：`resolveIssuer({ticker:'OLD'},{asOf:T0})` = X；T1 后 T2 前 `{asOf:T1}` = X；T2 后 `{asOf:T1}` = null、`{asOf:T0}` = X；NEW 行 `valid_from_method='ticker_change'`；缺少 submissions 确认时不关闭。

#### 4.3.5 `resolveIssuer` 的 `asOf`

`ResolveOptions{includeExpired?, asOf?, today?}` 同义；都给且不等 → `invalid_as_of`；`today` 标 `@deprecated`。`ResolvedSecurity` 加 `valid_from_method/valid_to_method`。`GET /api/entities/resolve?ticker=…&asOf=`：`asOf` ≤ 今天否则 400；历史 `asOf` 缓存 `public, max-age=600, s-maxage=3600`。规格二读接口加 `tickerAsOf`（有则按其解析，无则今天）；响应 `resolution:{tickerAsOf, issuerId, validFromMethod}`。

### 4.4 合并后发行人的事实归属（读时谱系）

- 谱系 = `{T} ∪ {i | i.merged_into = T}`（一跳）。事实行保留原 `issuer_id`。读取用 `read_facts_lineage`；跨发行人同 K 同日不同值的 `ok` 行不参与当前值、进 `conflicts`。
- 合并写入经 `set_merge`（§3.1/3.2）：持两发行人各市场 scope 锁、递增 `state_rev`、登记谱系对账游标。
- 冲突处置：对账对 `facts.lineage_same_day`（游标：合并时登记 + 每周）对每个 `conflicts` 条目写对账行（`kind='numeric'`，`outcome='compared'`，`passed=false`）并建隔离项 `lineage_conflict`（`natural_key=<T>:<K>:<available_date>`，`payload={fact_ids, values:[{issuer_id, filing, value}]}`）。管理员 POST 体 `keep_fact_id` → `resolve_lineage_conflict`（原子、排序锁、结束后恰一个 `ok` 值、裁决持久化并被 `promote_quarantined` 附加条款遵守）。不自动择一。
- `fact_sync_scope`：`merged` 发行人 `priority=0`、`reasons=[]`。
- 物化目标：对发行人 i 的任何可见性操作（发布、提升、对账隔离、采用候选、谱系裁决）后，物化 `T(i) = i.merged_into ?? i`：`materialize(T, market)` = `readFactsLineage` → `replaceMetricsLineage(T, market, state_revs, rows)`；`stale_computation` → 重读重算一次。
- 读接口：`issuerId`=T，`lineage`，`conflicts`，每行 `recordedIssuerId`；`/metrics` 无 `asOf` 时读表并用 `stateRevs(lineage)` 与 `based_on_lineage` 比较，不等 → 响应 `stale:true`（不内联重算；由上述操作路径重算）。

### 4.5 SEC 受理时刻 `src/lib/facts/providers/sec-acceptance.ts`

规格二美股路第 9 步后加 9b `enrichAcceptance(issuer)`；脚本 `scripts/facts/enrich-acceptance.ts [--issuer …] [--apply] [--report]`。用 §4.3.3 同一份 submissions；按 `accessionNumber` 索引（含分页）；`accepted_at is null` 的 edgar filing 逐个 `set_filing_acceptance`；未命中 → `skipped_summary(acceptance_not_found)`。`filingDate ≠ available_date` → 对账对 `sec.filing_date_vs_submissions`（`kind='date'`，failed），不写。计数：写入 `inserted`，相同 `duplicates`，`acceptance_conflict` → `failed`。

### 4.6 被隔离候选的人工选定（`ambiguous_value`）

规格二 §7.3 规定 `facts.*` 项的接受全部经 `resolve_facts_quarantine`；本规格登记**两个分派例外**（`facts-resolver.ts` 的分派表穷举：`ambiguous_value` 带 `chosen_candidate_index` → `adopt_candidate`；`reconcile_mismatch` → `restore_reconciled`；`lineage_conflict` → `resolve_lineage_conflict`；其余 → 规格二路径）。

- 路由：读项与候选 → `readFacts(issuer, market, {concepts: 该组, asOf: 今天, includeNonOk:false})` 得 `stateRev` 与该组当前代 `ok` 行 → TS 评估规格二 §7 规则（候选 ∪ ok 行）；失败 → 400 `rule_failed`，不写库 → 新建批次（`producer='dq-resolver'`）→ `adoptCandidate(item, n, batch, stateRev, resolvedBy)`：`stale_evaluation` → 重读重评一次再调用，仍过期 → 409；其余码按 §8。
- 函数在同一事务写入 `detail.hook={stage:'materialize', state:'pending'}`；路由随后 `materialize(T(issuer), market)`，成功改 `{stage:'done', state:'done'}`，失败 `{stage:'materialize', state:'failed', message}`。重试：项已 `resolved_accept` 且 `detail.adopted_fact_id` 存在 → 只做物化。崩溃于函数提交与物化之间 → 项上 `hook.state='pending'` 可被重试与 `scripts/facts/materialize.ts --pending-hooks` 扫到。
- 审计日志 `detail` 加索引与 `adopted_fact_id`。未带索引的接受仍是确认知晓（规格二路径）。

---

## 5. F5 跨来源对账

### 5.1 对账对登记 `src/lib/dq/reconcile/pairs.ts`

```ts
export interface ReconcilePair { id: ReconcilePairId; kind: 'numeric'|'text'|'date'; left: string; right: string;
  expectedKeys: (ctx) => Promise<ExpectedKey[]>; tolerance: (row) => Decimal; onFail: 'quarantine_left'|'claim'|'record'|'lineage_item' }
```

| pair | kind | left / right | natural_key | 容差 | 失败动作 |
|---|---|---|---|---|---|
| `us.companyfacts_vs_ixbrl` | numeric | 清单自然键解析到的本地事实（`ok` 或 `quarantined`）/ 同 accn 主文档 `ix:nonFraction` | `<cik>:<accn>:<concept>:<period_start>:<period_end>:<unit>` | 0 | 隔离左侧（仅 `ok`） |
| `cn.tushare_vs_cninfo_pdf_gold` | numeric | 黄金行绑定的披露（§5.4）/ 黄金行 | `<ticker>:<fy>:<concept>:<report_type>` | 印刷精度区间 | 隔离左侧 |
| `us.companyfacts_vs_gold` | numeric | 规格二 `plan2.json` 美股部分 | 同上 | 0 | 隔离左侧 |
| `sec.filing_date_vs_submissions` | date | `filings.available_date` / `filingDate` | `<cik>:<accn>` | 相等 | 记录 |
| `sec.filer_category` | text | submissions `category` / 主文档 `dei:EntityFilerCategory` | `<cik>:<accn>` | 相等 | 记录 |
| `entities.isin_hkex_vs_gleif` | text | HKEX ISIN / GLEIF+OpenFIGI ISIN | `<ticker>` | 相等 | claim |
| `facts.lineage_same_day` | numeric | 谱系 `conflicts` | `<T>:<K>:<available_date>` | 0 | `lineage_item` |

数值比较全部精确十进制（`decimal.ts`：十进制字符串 → 缩放 `BigInt`，比较用交叉相乘，不做除法）。`rel_diff = |l−r| / max(|l|,|r|,1)`。**每个预期键恰一行**：`compared | left_missing | left_unlinked | right_missing | unsupported | right_ambiguous`。

### 5.2 美股右侧：内联 XBRL 解析 `src/lib/dq/reconcile/ixbrl.ts`

- 输入：主文档；`isInlineXBRL=0` → 该 accn 全部键 `unsupported(not_inline_xbrl)`；> 50 MB → `unsupported(document_too_large)`；入桶。
- 解析器：自带有界 XML 分词器（元素、属性、字符/数字实体；DTD/CDATA 外的扩展不支持），`IXBRL_PARSER_VERSION='ixbrl/1'`；**命名空间按 `xmlns:*` 声明解析到 URI**（inlineXBRL 2013、xbrli 2003、xbrldi 2006、xsi；转换注册表 2015-02-26、2020-02-12、2022-02-16）。
- 支持子集（每项有测试；**其余一律 `unsupported`，不作合并口径处理**）：
  - `xbrli:context`：`period`（`startDate/endDate` | `instant`）、`entity/identifier`；`segment`/`scenario` 内**任何**子元素 → 维度/情景上下文，跳过（不限于 explicitMember）。上下文按 (entity, period) 规范化去重。
  - `xbrli:unit`：单一 `measure` 或 `divide`，按规格二 `units.ts` 归一；其他 → `unsupported(unit)`。
  - `ix:nonFraction`：`name`、`contextRef`、`unitRef`、`scale`、`sign`、`decimals`、`format`、`xsi:nil`（nil → `unsupported(nil)`）；文本语法按 format 的正则（文档化在 `ixbrl.ts` 顶部）：无 format `^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$`；`num-dot-decimal`/`numdotdecimal` 同上；`num-comma-decimal`/`numcommadecimal` `^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$`；`fixed-zero`/`zerodash`/`numwordsen`（仅 `no`/`none`）→ 0；不匹配 → `unsupported(format)`。值 = 规范十进制 × 10^scale，`sign='-'` 取反；嵌套取最内层文本。
  - `ix:nonNumeric`：只取 `dei:EntityFilerCategory/DocumentFiscalYearFocus/DocumentPeriodEndDate`。
- 右侧键 = (标签, 规范化上下文, 单位)；同键多值 → `right_ambiguous`，不隔离左侧。
- 左侧匹配：先左侧 `source_concept` + 同期同单位；没有 → 规格二回退顺序在同期同单位内取第一个存在标签（`detail.tag_mismatch=true`）；仍没有 → `right_missing`。
- 精度：右侧 `precision = {decimals, scale}`；左侧 `precision = raw_hash 中原文的小数位`；比较区间：左侧点值，右侧 ± 0（iXBRL 标注值即申报值，不是印刷四舍五入）。`tolerance=0`。
- 失败动作只对左侧 `ok` 行；左侧已 `quarantined` → 只写对账行并把项 `detail.latest_result={passed, reconciliation_id, at, inputs_hash}`、`detail.inputs_hash_current=inputs_hash` 更新（`TableClient.update`）。

### 5.3 美股样本与预期键清单

`scripts/dq/select-us-sample.ts` 生成 `fixtures/gold/us-ixbrl-sample-v1.json`：`{schema, generated_at, issuers:[{cik, ticker, regime, filings:[{accn, form, period_end, raw_sha256, expected_keys:[{concept, period_start, period_end, unit, source_concept}]}]}]}`。**预期键独立于数据库状态**：由规格二 companyfacts 适配器直接解析该 accn 的原始快照（`raw_sha256` 入桶）得到的全部 (concept, period, unit)；每份文件 ≥ 4 个键否则清单无效。运行时按自然键解析为本地 fact_id（含 `quarantined`；经 `read_facts(includeNonOk:true, history:true)` 按 `filing_id` 筛）；解析不到 → `left_missing`。样本规则：规格二黄金美股必入；其余按 sp500 ticker 字典序等距至 30 家，含 ≥ 3 NYSE、≥ 3 Nasdaq、≥ 2 财年末非 12-31、≥ 2 `acceleration ≠ large_accelerated`；`10-K` 申报人取最近 10-K + 10-Q，`20-F` 取最近 20-F。清单变更走 PR；映射代升级后重生成。

### 5.4 A 股黄金集对账

**黄金集文件** `fixtures/gold/cn-annual-v1.json`：

```json
{ "schema": "gold/cn-annual/1", "tickers": ["600519.SH", "…"], "fiscal_years": [2022,2023,2024,2025],
  "concepts": ["revenue_operating","net_income_parent","total_assets","equity_parent","operating_cash_flow","eps_basic"],
  "recorded_by": "R1", "reviewed_by": "R2",
  "rows": [{ "ticker": "600519.SH", "fiscal_year": 2024, "concept": "revenue_operating",
    "printed_value": "…", "printed_unit_multiplier": 1, "printed_decimals": 2, "column": "本期",
    "source": {"document": "…2024 年年度报告", "cninfo_announcement_id": "…", "announcement_date": "2025-04-03",
               "pdf_url": "…", "pdf_sha256": "…", "page": 12, "table": "主要会计数据和财务指标"}, "recorded_at": "…" }] }
```

- 六科目固定（都在年报"主要会计数据和财务指标"表；BS 科目 `INSTANT`，IS/CF `12M`；eps `CNY/share` 且 multiplier=1）。只抄"本期"列；`recorded_by/reviewed_by` 用代号。
- **校验器**拒绝：`rows` 不是 `tickers × fiscal_years × concepts` 的**精确乘积**（每个组合恰一行、无多余行）；非法 ticker；`printed_value` 不匹配正则或小数位 ≠ `printed_decimals`；eps multiplier ≠ 1；缺页码/sha256/announcement_id/announcement_date；`recorded_by == reviewed_by`；`tickers` 为空。
- **样本**：`tickers` = `scripts/dq/select-cn-sample.ts` 生成时 `fact_sync_scope(market='CN', priority>0)` 的发行人主 ticker，按 ticker 升序取前 `min(30, N)`；N=0 → 不能进入 F3-6（退出条件不满足，如实记录）。清单文件只含 ticker 与一手文件定位；范围由规格二决策 A 决定且该决策已承认公共事实可反推队列（本规格 owner 决策 H 再次确认授权用户 = `RESEARCH_OWNER_USER_ID`）。
- **左侧绑定**：黄金行引用的年报由 `cninfo_announcement_id` 定位：左侧 = 该发行人 `filings.document_ref = announcement_id`（规格二巨潮挂接写入）且 `source_ref` 含 `:1:`（report_type=1）的 filing 下的匹配事实；该 filing 未挂接或不存在 → `left_unlinked`（detail 记 Tushare 公告日与巨潮日期）；同一 announcement 下另有 `:5:` filing → 另写一行（natural_key 带 report_type），门禁只数 `:1:` 行。事实经 `read_facts(includeNonOk:true, history:true)` 按 `filing_id` 筛；`ok`/`quarantined` 都比较，隔离只对 `ok`。
- **印刷精度区间**：右侧值 = 印刷值 × multiplier，区间半径 = `0.5 × 10^(−printed_decimals) × multiplier`（四舍五入到印刷位的最大误差）；左侧点值（Tushare 原文十进制）；`passed` ⇔ 左侧 ∈ 区间，交叉相乘比较。写入 `tolerance` 列为 `半径 / max(|l|,|r|,1)`，`detail.tolerance_rule='printed_precision/1'`。owner 替代方案见决策 D。
- **CI 门禁** `gold-cn.integration.test.ts`（critical，F3-6 退出条件要求登记且存在）：N 家 Tushare 夹具 + 巨潮挂接夹具 → CN 同步进本地库 → 本对账对 → 断言每黄金行恰一结果、`passed/expected ≥ 95%`、非 passed 全部在 `exceptions.json`。
- 生产：游标周期（§5.5）；失败 → §5.6。

### 5.5 运行器 `src/lib/dq/reconcile/run.ts`

- **周期**：pair 无 `running` 周期时，新建 `dq_reconcile_cycles(cycle_id = <pair>-<started_at ISO 日期>-<uuid 前 8 位>, members = expectedKeys 的发行人集合冻结, status='running')` 并为每个成员建游标 `pending`。周期内成员不变（范围变化下个周期生效）。
- **认领**：每次运行（cron 或脚本）用本批次 id 认领 `pending` 或 `claim_until < now` 的游标（`update … set state='claimed', claimed_by, claim_until=now+10min where state in (…)` 按 `(issuer_id)` 顺序逐条，`row_count=1` 才处理），处理完 `done`，异常 `failed`（`attempts+1`、`last_error`）；`failed` 且 `attempts < 3` 在下次运行重试；≥ 3 → 留 `failed`。
- **完成**：全部游标 `done` 或 `failed(attempts≥3)` → 周期 `complete`（无 failed）或 `complete_with_failures`，`finished_at`；新鲜度 `recordAttempt(DATASETS.reconcile(pair), {ok: status='complete', cadence:'weekly'})` **只在周期完成时记**。周期跨越日历周不影响 id。
- **批次**：`producer='reconcile'`，`dataset=DATASETS.reconcile(pair)`，`tool_versions={pair, cycle_id, parser, gold_schema, sample_sha256, code_version}`；计数：`fetched` = 本次处理的预期键数；`inserted` = passed；`quarantined` = mismatch 且已隔离；`failed` = mismatch 但隔离失败 + 全部非 `compared` 结果（`left_missing/left_unlinked/right_missing/unsupported/right_ambiguous`）+ 解析异常——它们都是"未能完成比较"，如实降级批次状态；`errors` 带 `outcome_summary` 明细。
- 预算：cron `deadline=start+240 s`，发行人开始前剩余 ≥ 60 s。
- 触发：`/api/cron/reconcile?pair=<id>`：US 每日 02:00 UTC；CN 每日 03:00 UTC（黄金集进 CI 后加入）；lineage 每日 04:00 UTC（无成员时空转）。脚本 `scripts/dq/reconcile.ts --pair <id> [--issuer …] [--apply]`。

### 5.6 失败即隔离与恢复

- 隔离：先 `quarantine({dataset:'facts.<market>', table:'financial_facts', naturalKey:'<pair>:<natural_key>:<fact_id>', reasonCode:'reconcile_mismatch', detail:{pair, reconciliation_id, inputs_hash, inputs_hash_current: inputs_hash, quarantine_state:'pending'}, payload:{key, fact_ids:[left], left_value, right_value, right_locator}})`，再 `reconcileQuarantine(issuer, market, [left], batch, item)`（函数把 `quarantine_state='done'`），再 `materialize(T, market)`。运行器每次开始先扫 `reconcile_mismatch` 且 `quarantine_state='pending'` 的 open 项重做第二步（可重试的工作项）。
- 恢复：每轮对已隔离事实写 `latest_result` 与 `inputs_hash_current`；管理员 `resolved_accept` → `restore_reconciled`（要求最近一次通过且输入未变；否则 409 `not_passing`）。`resolved_reject` = 左侧确有问题，行保持 `quarantined`。规格二的 `resolve_facts_quarantine` 对 `reconcile_mismatch` 项不适用（分派表）。
- 已公开事实被隔离会改变公共接口答案：owner 决策 F。

---

## 6. 财报日历新鲜度

### 6.1 规则 `src/lib/dq/calendar.ts`（纯函数，`CALENDAR_RULES_VERSION='filing-calendar/1'`）

**档案（美股）**：`category_raw` 解析：含 "Large accelerated" → `large_accelerated`；否则含 "Accelerated filer" → `accelerated`；否则含 "Non-accelerated" → `non_accelerated`；否则（含仅 "Smaller reporting company"、空）→ `unknown`。`smaller_reporting` 单独记录，不参与期限。`regime` 按最近年报 `form_type`。`fiscal_year_end` = submissions `fiscalYearEnd`。档案只有当前值：期望行记 `profile_as_of`；**只对期末 ≥ `profile_as_of − 15 个月` 的期间按该档案给法定期限**（更早的期间 `deadline_state='no_rule'`，`due_rule='none.profile_not_effective/1'`）。

**法定期限**：

| regime / acceleration | 年报 | 季报 | due_rule |
|---|---|---|---|
| 10-K / large_accelerated | 财年末后 60 天 | 季末后 40 天 | `us.laf/1` |
| 10-K / accelerated | 75 | 40 | `us.acc/1` |
| 10-K / non_accelerated | 90 | 45 | `us.non/1` |
| 10-K / unknown | `no_rule`（`none.unknown_category/1`） | 同 | — |
| 20-F | 财年末后 4 个月 | 无季报期望 | `us.20f/1` |
| 40-F | `no_rule`（`none.40f/1`） | 无 | — |
| cn | 年报 ≤ 次年 4-30 | Q1 ≤ 4-30、H1 ≤ 8-31、Q3 ≤ 10-31 | `cn.*/1` |

美股期限落在周末或 SEC 假日顺延（Rule 0-3；`SEC_HOLIDAYS` 常量按年维护）；A 股不顺延。

**期望期间**：最近 6 个已结束报告期（含当前财年已结束季度）。
- 月末模式：期末 = 以 `fiscal_year_end` 为锚的季度月末；`deadline_state='statutory'`（规则已知时）。
- 52/53 周模式（`week52_pattern`）：期末 = 最近观测到的同类实际 `period_end` + 364 天，再 +7 天若此值不在锚月；`period_end_estimated=true`，`deadline_state='estimated'`，`due_rule` 加 `/est`；**估计行不计逾期**（约束）。收到的 filing 按 `|period_end − 估计| ≤ 7 天` 匹配，匹配后以实际 `period_end` 替换该行：`replace_filing_expectations(issuer, market, rows jsonb)`（`security definer`，迁移一）在一个事务内删除该发行人该市场的旧行并插入新行（估计行与实际行的主键不同，必须原子替换）。

**状态**：
- `received`：`filings` 中有 `form_type` 匹配、`period_end` 匹配、**所属运行已发布且 `filings.mapping_gen > 0`** 的行（staged/未激活的不算），`available_date <= due_date`（无 due_date 时即 `received`）；`received_late`：`available_date > due_date`。修订件不算。
- `upstream_lookup`：US = submissions 抓取成功（`recent` 最早条目早于 `period_end` 否则补抓分页；仍失败 → `unavailable`）；CN = `disclosure_date` 调用成功（积分不足/错误 → `unavailable`）。
- `filed_not_ingested`：未收到但上游有：US `form` 匹配且 `reportDate` 匹配期末（±7 天）的条目（`upstream_filed_date=filingDate`）；CN 同 `end_date` 行的 `actual_date` 非空。
- `unknown_upstream`：未收到且 `upstream_lookup='unavailable'`（不算逾期）。
- `pending` / `overdue`：未收到、上游无、`today <= / > due_date`；`overdue` 仅 `deadline_state='statutory'`。
- CN `expected_date`：`disclosure_date` 中 `end_date` 等于本报告期的行，取 `ann_date` 最大者的 `pre_date`（`modify_date` 非空 → `detail.schedule_modified=true`）。

### 6.2 写入 `src/lib/dq/calendar-sync.ts`

`runCalendarSync(deps, {market, limit})`：批次 `producer='filing-calendar'`、`dataset=DATASETS.calendar(market)`；范围 = `fact_sync_scope(priority>0)` 按 `(coalesce(min computed_at), issuer_id)` 排序（最久未算的先算），预算内逐个；输入 = 档案 + `filingsOfIssuer` 最近 8 期（含运行状态）+ 上游列表；输出经 `replace_filing_expectations`。回执 `detail={issuers, rows, by_deadline_state, by_disclosure_state, upstream_unavailable, no_fiscal_year_end}`。触发：`/api/cron/filing-calendar?market=US` 与 `?market=CN` 各每日 01:00/01:10 UTC；新鲜度 `recordAttempt(DATASETS.calendar(market), {ok: 本次处理到范围末尾, cadence:'daily'})`（范围大于单次预算时按排序续跑，直到一次运行覆盖完整范围才记 ok）。

### 6.3 数据集登记 `src/lib/dq/datasets.ts`

```ts
export const DATASETS = { entities:{sec, researchLink, identifiers, cninfo, ahLink, windows}, facts:(m)=>…, reconcile:(pair:ReconcilePairId)=>…, calendar:(m)=>… } as const;
export const DQ_DATASET_INVENTORY: readonly {dataset; producer; cadence:Cadence}[] = […全部展开…];
```

生产者只从 `DATASETS` 取字符串（`load-sec.ts`、`link-research.ts` 改为引用）。`datasets.test.ts`：清单无重复；pair/市场展开后都在清单；`ReconcilePairId` 与 `pairs.ts` 一致。`loadDqDashboard.datasets = INVENTORY ∪ 已加载行`。

---

## 7. 读取与管理接口

| 路径 | 变化 |
|---|---|
| `GET /api/entities/resolve` | `asOf`；`securities[]` 加两方法字段 |
| `GET /api/facts/[ticker]`、`/metrics`、`/api/filings/[ticker]` | `tickerAsOf`；响应 `lineage`、`resolution`、`conflicts`、`recordedIssuerId`、`acceptedAt`；`/metrics` 加 `stale` |
| `GET /api/admin/dq` | 加 `datasets`、`calendar:{overdueByMarket, filedNotIngestedByMarket, unknownUpstreamByMarket, noRuleByMarket, estimatedByMarket, rows:[逾期 + 7 日内到期 + filed_not_ingested + unknown_upstream，≤ 100]、noRuleRows:[≤ 50]}`、`claims:{rows, total}`、`reconciliationsByPair:{<pair>:{failed, lastCycle:{cycle_id, status, finished_at}}}`；参数 `market` |
| `POST /api/admin/dq/quarantine/[id]` | 体可带 `chosen_candidate_index`（§4.6）或 `keep_fact_id`（§4.4）；分派表穷举 |
| `POST /api/admin/dq/claims/[id]` | §7.1 |
| `GET\|POST /api/cron/reconcile`、`/api/cron/filing-calendar` | 新 |

### 7.1 `POST /api/admin/dq/claims/[id]`

顺序：`requireAdminUser()`（401/403）→ `Content-Type`（415）→ Origin（403）→ UUID（400）→ body `{status:'accepted'|'rejected', amend?:{op, target, params}}`（400；`amend` 经 `validateClaimDetail`）→ `rpc('resolve_identifier_claim', {p_id, p_status, p_resolved_by, p_amend})`。错误映射：`already_resolved`→409；`legacy_claim`/`amend_required`→409；`value_conflict`/`ownership_conflict`/`already_closed`→409（项保持 pending）；其他→500。成功写 `research_audit_log(action='dq.claim_resolve', detail={id, status, op, applied, amended})`。

### 7.2 `/admin/dq` 页面流（视觉另在 Claude Design 画布设计）

结构：指标卡 → 新鲜度 → **披露日历** → 批次 → 隔离 → **标识符声明** → 对账失败。

- **指标卡**：新增"逾期披露"（法定逾期之和，> 0 红；note `US n · CN m · 已申报未入库 k · 上游不可查 u`）。
- **披露日历面板**：筛选 `market`；主表列：ticker/发行人、市场、报告种类、期末（估计加标记）、期限状态（法定/估计/无规则）、应披露日、规则、预约日、上游申报日、披露状态 Pill（`overdue` 红、`filed_not_ingested` 黄、`unknown_upstream` 灰斜、`pending` 灰、`received_late` 黄、`received` 默认）、逾期天数；下方折叠"无规则行"列表。空状态文案两处。
- **标识符声明面板**：列：时间、发行人、op、类型、值、证据类别、来源、详情（折叠 JSON 含 target/params）、操作；`evidence_only` 行的"接受"打开修订表单（证券行选择 + 生效日 + 方法），提交为 `amend`；`legacy` 行只显示"需 SQL 处理"；409 文案；小屏卡片。
- **隔离面板**：`ambiguous_value` 候选单选 → "接受并采用候选 n"；`lineage_conflict` 显示各发行人的值并单选"保留此行"；`reconcile_mismatch` 显示 `latest_result`（通过且输入未变时"恢复"可用，否则禁用并说明）。
- **对账失败面板**：`pair`、`kind`、`outcome` 列；按 pair 的计数条含最近周期状态；详情展开。
- **新鲜度面板**：`dq.calendar.*`、`reconcile.*`（weekly）并入。
- i18n：`messages/{zh,en}/admin.json` 的 `dq` 下新增键（tiles/sections/columns/calendar/claims/quarantine 各组，与上面文案一一对应）；`messages/parity.test.ts` 比较 zh/en 键集。
- 组件与 tokens 复用现有，无新颜色。

**Claude Design 画布待设计清单**：1. 五张指标卡布局；2. 披露日历面板（市场筛选、三种期限状态、六态 Pill、估计/无规则提示、折叠区、空状态）；3. 标识符声明面板（表格/卡片、`evidence_only` 修订表单、冲突提示）；4. 隔离面板三种行内交互（候选单选、谱系保留单选、恢复按钮状态）；5. 对账失败面板的 pair 计数条与周期状态。

---

## 8. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| OpenFIGI 429/5xx | 退避 60 s 一次；再失败跳过剩余 | `quota_exhausted` | partial/failed |
| OpenFIGI 单 job error / exchCode 未知 / securityType 过滤 | 跳过 | `skipped_summary(…)` | — |
| 同 ticker 多组 FIGI | claim | `claims_summary` | — |
| 映射 ticker 属他人 / ISIN 已被持有 | claim + 隔离 | `ownership_conflict` | partial |
| 已有值不同 | claim `correct_identifier` | `identifier_mismatch` | partial |
| GLEIF 表头错 | failed | `invalid_schema` | failed |
| HKEX 三文件无 ISIN | 阶段 D 跳过 | `skipped_summary(hkex_no_isin)` | — |
| 回填：上市日晚于观测 / 退市早于上市 | 隔离 | `window_evidence_conflict` | partial |
| 回填：23P01/23505 | 隔离 | `ownership_conflict` | partial |
| `load-sec`：旧快照 / 行数不足 90% / 缺 `--fetched-at` | 拒绝 | `stale_snapshot` / `incomplete_snapshot` / 用法错误 | — |
| 换码：submissions 未确认 | 不关闭，保留 `pending_change` | `skipped_summary(close_unconfirmed)` | — |
| SEC submissions 404/超时 | 该发行人跳过；日历 `upstream_lookup='unavailable'` | `sec_unavailable` | partial |
| `filingDate ≠ available_date` | 对账行 failed，不写受理 | — | — |
| `acceptance_conflict` | failed | 同名 | partial |
| 主文档非 iXBRL / 超大 / 不支持 / nil / 右侧矛盾 / 左侧缺失或未挂接 | 结果行（非 compared），计 `failed` | `outcome_summary` | partial |
| 黄金文件校验失败 | 拒绝启动 | `invalid_gold_file` | failed |
| 隔离项建成但 `reconcile_quarantine` 失败 | 项 `quarantine_state='pending'`，下次重试 | `quarantine_error` | partial |
| 游标认领失败（被他人认领） | 跳过 | `skipped_summary(claimed)` | — |
| `adopt_candidate`：`stale_evaluation` | 重评一次后 409 | 同名 | — |
| `adopt_candidate`：`invalid_choice`/`invalid_candidate` → 400；`generation_moved`/`conflict_exists`/`duplicate` → 409 | 项保持 open | 同名 | — |
| `restore_reconciled`：`not_passing` | 409 | 同名 | — |
| `resolve_lineage_conflict`：`unresolved` | 409，回滚 | 同名 | — |
| 物化 `stale_computation` 两次 / `scope_missing` | 该发行人 failed | 同名 | partial |
| 日历：无 `fiscal_year_end` | 无期望行，计数 | `detail.no_fiscal_year_end` | — |
| 日历：`disclosure_date` 不可用 | `upstream_lookup='unavailable'` | `skipped_summary(schedule_unavailable)` | — |
| 读接口参数非法 | 400 | `invalid_parameter:<name>` | — |
| claims：各冲突 / 重复 / legacy / 需修订 | 409 | 对应码 | — |

---

## 9. 测试策略

### 9.1 单元（vitest）

- `openfigi.test.ts`：录制夹具（AAPL、600519、00700、债券 ISIN、error 项、多场所结果两种顺序、无 compositeFIGI 的场所结果）；节流；`EXCH_MAP`；分组与 claim；响应入桶哈希。
- `hkex-list.test.ts`、`names.test.ts`（20 对真实 A/H 名称）。
- `plan.test.ts`/`apply.test.ts`：空值写、相同补 provenance、不同 → `correct_identifier` claim、互斥冲突、dry-run；`provenance.test.ts` 白名单拒绝私密键。
- `claims.test.ts`：`validateClaimDetail` 每个 op 的必填项；`target_key`；同键追加 sources；`evidence_only` 修订校验。
- `backfill-windows.test.ts`：三种关系；最早行限制；23505/23P01；`curated`。
- `sec-submissions.test.ts`：PLTR 夹具（类别解析含仅 SRC → unknown、财年末、换名）+ 含 `8-A12B`/`25-NSE`/分页的裁剪夹具 → `evidence_only` claim 内容；分页抓取。
- `load-sec.test.ts`：换码三步夹具（重置、7 天、sha256、submissions 确认、`stale_snapshot`、`incomplete_snapshot`、归另一 CIK、关闭后再出现）。
- `resolve.test.ts`：`asOf/today`；新字段。
- `ixbrl.test.ts`：AAPL 10-K 裁剪夹具 + 非默认前缀改写夹具；每种 format 正则；nil；segment/scenario 任何子元素跳过；上下文规范化去重；重复标注；`dei:*`；unit divide。
- `decimal.test.ts`：交叉相乘比较、区间判定、20 位整数。
- `pairs.test.ts`/`run.test.ts`：自然键；印刷精度区间表驱动；每键恰一行；计数映射；周期创建/认领/重试/完成；新鲜度只在完成时记。
- `gold-cn.schema.test.ts`：精确乘积、重复、小数位、空 tickers。
- `calendar.test.ts`：类别解析；期限表；顺延；A 股节点；月末与 52/53 周（估计、匹配、替换）；档案时效 15 个月；6 个期间；状态矩阵（含 `unknown_upstream`、staged filing 不算收到、`no_rule` 可 `received`）；`disclosure_date` 精确匹配与修改。
- `datasets.test.ts`；`facts-resolver.test.ts`（分派表穷举、`rule_failed`、`stale_evaluation` 重试、恢复禁用、`keep_fact_id`）；路由测试（`asOf/tickerAsOf`、admin dq 新字段与 `market`、claims 顺序与 `amend`、quarantine 新字段）；`messages/parity.test.ts`。

### 9.2 数据库（`test:db`，critical）

`identifiers.integration.test.ts`、`dq-extensions.integration.test.ts`（含 `S4_TEST_STATE`，登记 `criticalSuites`）：两迁移在有数据库上升级 + 写入新证据后重放不改写；`valid_from` 更新受互斥约束；`resolve_identifier_claim` 每个 op 的成功/冲突回滚/目标不一致拒绝/非活跃发行人拒绝/`legacy`/`amend_required`/并发 409；`dq_reconciliations` 两条 kind 约束；`dq_filing_expectations` 全部约束组合；`replace_filing_expectations` 原子替换；`issuer_filing_profiles` 复合主键；`dq_freshness` weekly；`filings.accepted_at` 只允许 null→值且无角色可直写；`set_filing_acceptance`；`reconcile_quarantine` 持锁、只动本发行人 `ok` 行、`state_rev+1`、与并发 `publish_sync_run` 串行；`restore_reconciled` 的 `not_passing` 与通过路径；`adopt_candidate` 全部码、`stale_evaluation`、事务内 `hook` 写入、管理运行字段；`resolve_lineage_conflict` 原子性与 `unresolved` 回滚、`promote_quarantined` 附加条款生效；`read_facts_lineage` 单发行人三种模式与 `read_facts` 逐字段一致、双发行人抑制与 `conflicts`、anon 只见 `ok`；`replace_financial_metrics_lineage` 成员 rev / 集合变化 / `scope_missing`、包装函数一致、`based_on_lineage` 回填；`set_merge` 与物化交错（合并提交在比较之后 → `stale_computation`）；RLS 与桶策略（anon/authenticated 不可读写新表与桶）。

### 9.3 离线集成（critical）

- `ixbrl-pair.integration.test.ts`：AAPL/MSFT 夹具同步 → 全 passed；**注入改值的 companyfacts 夹具**作第二发行人 → mismatch → 隔离 → 不可见 → 物化重算 → 修正夹具重跑 → `latest_result.passed` 且 `inputs_hash` 相等 → `restore_reconciled` 恢复；未通过时恢复被拒。
- `gold-cn.integration.test.ts`（夹具录入后创建；F3-6 退出条件）。
- `ah-link.integration.test.ts`：同 LEI 自动挂接；名称匹配 claim；接受/拒绝；`evidence_only` 修订接受。
- `calendar.integration.test.ts`：规格二夹具 + submissions 夹具；`filed_not_ingested`、`unknown_upstream`、估计行替换。
- `lineage.integration.test.ts`：`set_merge` → 读取谱系 → 制造同日冲突 → 对账对建项 → `resolve_lineage_conflict` → 当前值恢复 → 物化 `based_on_lineage` 二元。

### 9.4 清单规则

含 `S4_TEST_STATE` 的新文件全部登记 `criticalSuites`；`verifyCriticalSuiteInventory` 绿；F3-6 退出要求 `gold-cn.integration.test.ts` 登记且存在。

---

## 10. 分期与工作量

| 工作包 | 交付 | 依赖 | 退出条件 | 人日 |
|---|---|---|---|---|
| F3-0 迁移一、类型、声明函数、清单 | `20261107090000`（含 `resolve_identifier_claim`、`replace_filing_expectations`、weekly 节奏）、types、`IssuerSecurityInput`/`attachSecurity`/`fileClaim`/`validateClaimDetail`/`sanitizeProvenance` 与现有调用方、`datasets.ts`、看板下拉 | 计划一 | 有数据演练两次绿；E9 下拉 | 2.5 |
| F3-1 ISIN/FIGI | `identifiers/*`、`fill-identifiers.ts`、`fill-cninfo-org-id.ts` 改写、exchCode/HKEX 核对记录、夹具、`coverage.ts` | F3-0 | dry-run 预估报告；apply 回执；E1 数字入审计目录（未达标 → owner 决定） | 3 |
| F3-2 持有区间与 `asOf` | `backfill-windows.ts`、`sec-submissions.ts`、`load-sec` 换码、`resolveIssuer(asOf)`、路由 | F3-0 | E2、E3；回填回执 | 3 |
| F3-3 A+H 与声明接口/面板 | `names.ts`、`link-ah.ts`、claims 路由（含 amend）与面板、i18n | F3-1 | 集成测试绿 | 3 |
| F3-4 迁移二 + 事实扩展 | `20261107091000`（函数、`promote_quarantined` 附加条款、`set_merge`、`based_on_lineage`）、`FactsDb` 三实现扩展、`tickerAsOf`/谱系读取与物化目标、受理时刻、候选选定、分派表 | **规格二 F2-6 落地** | §9.2 第二套绿；E7；E8；runbook 合并流程改为 `set_merge` | 4.5 |
| F3-5 美股对账 | `ixbrl.ts`、`decimal.ts`、`pairs.ts`、`run.ts`（周期/游标/认领）、样本脚本（独立枚举键）、cron、看板对账面板 | F3-4 | E4 报告与失败解释 | 4 |
| F3-6 A 股黄金集 | 清单脚本、校验器、`gold-pdf.ts`、抄录指引、夹具录制、CI 门禁、cron | F3-5；抄录人；token | E5；套件登记且绿 | 2（不含抄录） |
| F3-7 日历 | `calendar.ts`、`calendar-sync.ts`、档案写入、两条 cron、看板日历面板与逾期卡 | F3-2、F3-4 | E6、E9 | 3.5 |
| F3-8 收尾 | runbook、规格一 §3.2 撤回标注、规格二 §15 指向与分派例外登记、§15 偏差记录 | 全部 | 门禁全绿 | 1 |

合计约 26.5 人日（不含抄录与外部等待）。F3-0 至 F3-3 不依赖规格二。

验收样例：
1. `GET /api/entities/resolve?ticker=600519.SH` → 主行 `valid_from = stocks_universe.list_date`、`valid_from_method='listing_date'`；`isin/figi` 为 GLEIF/OpenFIGI 实测取得的值，取不到则为 null 并在 E1 报告中计入。
2. 换码夹具（§4.3.4）。
3. AAPL 最近 10-K 四概念 passed；注入改值夹具 → 隔离 → 消失 → 修正 → 恢复；未通过时恢复 409。
4. 黄金集一行故意抄错 → failed → 隔离 → 改 json → 重跑 passed（`inputs_hash` 更新）→ 恢复。
5. A 股 2025 年报 2026-05-01 未入库：`actual_date` 有 → `filed_not_ingested`；无且 `disclosure_date` 可用 → `overdue`；不可用 → `unknown_upstream`。
6. `ambiguous_value` 选候选 0 → 接口返回该值，`based_on_lineage` 变化；重复 POST 幂等；模拟函数提交后崩溃 → `--pending-hooks` 完成物化。
7. `set_merge` 后 `lineage` 含两者；同日冲突 → `conflicts`、当前值回落 → `keep_fact_id` 裁决 → 恢复。

---

## 11. 独立验证

- Codex 两轮规格审计与处置（`docs/audits/2026-11-04-data-foundation-3/`）；每个工作包提交再审。
- 黄金集两人（代号）抄录与复核；`exceptions.json` 可见错误率。
- E4 每条 mismatch 解释落 `ixbrl-run-<date>.md`，Codex 复审。
- 标识符抽样 20 条人工核对（GLEIF、交易所页面）。
- 日历规则由熟悉 SEC 申报的人核对 §6.1（SRC 仅字样 → 无规则、20-F 四个月、40-F 无规则、档案时效）。
- 换码：5 个真实换码案例（如 FB→META）核对区间与方法。

---

## 12. 依赖接口（待对齐）

| 依赖 | 本规格需要 | 状态 |
|---|---|---|
| 规格二（第 8 稿） | `fact_sync_runs` 列；`fact_sync_scope.state_rev` 与行锁约定；`read_facts` 9 参数信封；`fact_state_rev()`；`resolve_facts_quarantine`、`promote_quarantined`（本规格以 `create or replace` **附加**两条资格条款）、`replace_financial_metrics`（改为包装，签名不变）；`filings_limited_update`；`FactsDb`（本规格扩展方法）；`facts-resolver.ts`（本规格登记三项分派例外）；`record-fixture.ts --tushare`；`FACT_CONCEPTS`、`units.ts`、规范十进制形式；巨潮挂接写入 `filings.document_ref` | 已核对第 8 稿；规格二 §16 落地后须在本规格 §15 复核这些点 |
| F3 文档管道 | 巨潮 PDF 页面抽取 | 不依赖 |
| F6 评测 | 黄金集与 `exceptions.json` 格式 | 本规格先定 |
| 行业研究规格 | A 股全宇宙装载后 E1/E5 分母扩大 | 不阻塞 |

---

## 13. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 A · OpenFIGI 许可与展示**：服务条款（2018-11-27 版，2026-11-04 核对）把 FIGI 标识符置于公共领域；响应中的证券描述只作匹配、不展示、不作为准确性保证。默认：FIGI 入库并公开展示 | owner | F3-1 前 |
| **决策 B · A 股 ISIN 不推导**；接受 E1 实际覆盖率 | owner | F3-1 前 |
| **决策 C · 黄金集抄录人与复核人**（代号）与交付日期；N 家 × 4 期 × 1 页 | owner | F3-6 前 |
| **决策 D · 对账容差**：美股精确；A 股印刷精度区间。替代：固定 0.5% | owner | F3-5 前 |
| **决策 E · 样本规则**：美股 30 家；A 股 N = min(30, 范围内发行人数)，ticker 升序；四期 FY2022–FY2025 | owner | F3-5 前 |
| **决策 F · 对账失败隔离已公开事实** | owner | F3-5 前 |
| **决策 G · 换码关闭门槛**：两次缺失、≥ 7 天、不同哈希、submissions 确认 | owner | F3-2 前 |
| **决策 H · 样本清单授权**：A 股样本来自 `RESEARCH_OWNER_USER_ID` 的范围（规格二决策 A 已承认公共事实可反推队列）；仓库私有；文件不含入选原因与真名 | owner | F3-6 前 |
| **决策 I · E1 未达标时的处理**：按实际数字接受，或扩大来源（需新的一手来源，另立规格） | owner | F3-1 后 |
| `OPENFIGI_API_KEY`、`TUSHARE_TOKEN`（夹具与 `disclosure_date` 2000 积分）、`EDGAR_USER_AGENT`、`CRON_SECRET` | owner | 各 WP 前 |
| 核对 OpenFIGI exchCode/securityType/compositeFIGI 实际值、HKEX 三文件表头、submissions 分页结构 | 实施者 | F3-1 / F3-4 第一步 |
| 生产迁移两次；首轮 `fill-identifiers --apply`、`backfill-windows --apply`；cron 顺序：filing-calendar（两市场）→ reconcile US → reconcile CN（黄金集进 CI 后）→ lineage | owner | 合并后 |

---

## 14. 开放问题（实施前核对）

1. 官方 A+H 公司名单的下载位置（HKEX / SSE / SZSE）。
2. OpenFIGI `exchCode`/`securityType`/`compositeFIGI` 的实际取值；`ID_ISIN` 不带 exchCode 时的结果形态。
3. HKEX 三份证券名单的当前表头与 ISIN 覆盖。
4. SEC submissions `category` 字符串的全部变体。
5. 52/53 周申报人 +364/+7 估计与 ±7 天匹配是否足够（AAPL、COST、WMT）。
6. 转换注册表中其他 format 在财务主表出现的频率。
7. Tushare `disclosure_date` 的积分门槛在 owner 账号是否满足；`modify_date` 的实际语义。
8. 规格二巨潮挂接的 `document_ref` 与黄金集 `cninfo_announcement_id` 的格式是否一致（§5.4 左侧绑定依赖）。
9. SEC submissions `filings.files[]` 分页的实际结构。
10. 规格二 `fact_sync_scope` 行在 `set_merge` 时对未进入范围的发行人是否允许 `priority=0` 占位行（本规格假定允许）。

---

## 15. 实施记录与偏差

（计划三落地后补记，格式同规格一 §14。预先登记的接受限制：申报人档案只有当前值，按 15 个月时效追溯；52/53 周申报人的期末为估计值直至收到申报，且估计行不计逾期；对账的右侧不确定性只按印刷/标注精度建区间。）
