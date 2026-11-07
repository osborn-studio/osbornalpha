# 数据底座三 · F1b 标识符补全 + F5 对账与新鲜度 设计规格

日期：2026-11-05（第 6 稿。审计轨迹：`docs/audits/2026-11-04-data-foundation-3/` —— 01 Codex 第一轮（35 项）、02 第二轮（28 项新发现 + 35 项复核）、03 处置表（含第三、四轮分节）、04 第三轮（R1–R3 + 28 项复核）、05 第四轮（只审第 4 稿新增缺陷，S1–S7，判定 not ready）。第 4 稿落实 R1–R3 与第三轮 PARTIAL 项；第 5 稿按 Codex 第四轮的规定修法逐字落实 S1–S7；06 第五轮（增量：S1–S7 复核 + 新缺陷 + 计划二落地代码对本规格假设的影响，T1–T15，判定 not ready）；第 6 稿按第五轮规定修法逐字落实 T1–T15，处置见 03 第五轮分节）
状态：草案，待 owner 评审（§13 有九项 owner 事项；计划三按 §13 记录的默认值执行）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（下称"规格一"）§3.2 F1b 行、§5.2、§10 WP-F1b 与 WP-F5、§12 开放问题 1；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（下称"规格二"，**第 8 稿 + §16 已落地偏差**；计划二已合并入 main，PR #102）§4.1、§4.5 函数表与行锁/`state_rev` 约定、§4.6 `read_facts` 信封、§4.8 `FactsDb`、§5.3、§7.1、§7.3、§15 开放问题 4/5/7。规格一 §14 与**落地的计划二（规格二第 8 稿 + §16 全部偏差 + `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`）**在此视为既定事实；本规格只定义它们推迟的部分（T12 规定修法）。必须保留的落地契约：`publish_sync_run(uuid,uuid[],bigint default null)`、`FactsDb.publishRun(…,expectedRev)`、`stale_plan` 处理及其 10 分钟重排；`reconcile_fact_sync_scope(text,jsonb,timestamptz default null)`、`scope_confirmed_at`、完整集合的 scope 读取（`scopeAll`）与 5 分钟快照余量；`FACT_CONCEPTS` 为落地的 **35** 项（`MAX_READ_CONCEPTS` 由其长度导出，任何地方不得硬编码 33/34），`monetary_funds`（CN `money_cap`）与现金等价物不同、CN `cash` 留缺；公共 `/metrics` 的前后两次 rev 读取与 stale 抑制；CN 以 `FACTS_CN_ENABLED=1` 门控。拓扑函数建 scope 占位行时不得覆盖已有 scope 行、不得绕过上述退役保护（T12）。
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
| E5 | `cn.tushare_vs_cninfo_pdf_gold`：黄金文件 = `tickers × 4 年 × 6 科目` 的完整乘积；左侧来自**真实录制并留存**的 Tushare 三表、巨潮与 `disclosure_date` 响应（合成夹具回退一律拒绝；计划二套件绿不算）；CI 与生产 `passed / expected ≥ 95%`；非 passed 全部登记在 `exceptions.json`。未满足前 E5 记"未达成（CN 降级）"，不报数字（T15） | 集成测试 + 周期回执 |
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
- 发行人合并前的证券关闭/转移工具：仍按 runbook §1.1 手工；本规格只提供拓扑写入函数（`set_merge` 含引用方改指、`set_dissolved`）并用触发器封死其他路径（§3.1/§3.2）。
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
| 事实层（落地计划二 = 规格二第 8 稿 + §16） | `fact_sync_scope.state_rev`；可见性函数持 scope 行锁；`read_facts(9 参数)` jsonb 信封、`p_include_non_ok`；`fact_state_rev()`；`resolve_facts_quarantine`、`promote_quarantined` 资格规则；`replace_financial_metrics(issuer, market, based_on_rev, rows)`；`filings_limited_update` 允许 `document_ref/document_url/link_attempts`（service_role 有这三列的列级 update，`updateFilingLink` 依赖）与 `mapping_gen`（只经函数、只增）；插入必须 `staged`；`abandoned` 运行才可删行；资格判定在内部助手 `fact_promote_rows(uuid,text,uuid[])`（`promote_quarantined` 与 `resolve_facts_quarantine` 都调用它）；`facts.*` 隔离项的 `dataset` 持久化为小写 `facts.us`/`facts.cn`（`sync.ts`）；`ambiguous_value` 的 `payload.candidates` 是 `FactCandidate`（camelCase：`filingRef/sourceConcept/periodStart/periodEnd/rawHash`，无 `mapping_gen/mapping_version`），`payload.run_id` 为锚定运行，代编码在 `natural_key` 末段；处理钩子在 `src/lib/dq/facts-resolver.ts::resolveFactsItem`（`FACT_ROW_REASONS` 三项）与 `/api/admin/dq/quarantine/[id]` | 本规格新增函数、`fact_promote_rows` 的**附加**资格谓词（§3.2）、`resolveFactsItem` 的分派分支（§4.6、§5.6） |
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
outcome  text not null default 'compared' check (outcome in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold','legacy'))
detail   jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
cycle_id text, issuer_id uuid, market text, attempt int          -- 周期结果行（T2）：四列同为空（旧行/非周期写入）或同为非空
index (pair, created_at desc)
unique index dq_reconciliations_cycle_key on (pair, cycle_id, natural_key) where cycle_id is not null   -- 已接受结果标记：每周期每键至多一行
constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null))
constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null))
constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null))
```

该表目前无写入者、生产为空；首次加列时仍把既有行（若有）标 `outcome='legacy'`。`kind='text'|'date'` 的两侧值在 `detail.left_text/right_text`，`passed` 为字符串/日期相等。`detail` 还存：`{left:{fact_id, raw_hash, locator, precision}, right:{document, sha256, locator, precision}, unit, scale, tolerance_rule, inputs_hash, reason?}`。每次运行追加，不更新。

**`dq_reconcile_cycles` 与 `dq_reconcile_cursor`**（§5.5）

```
dq_reconcile_cycles
  pair text not null, cycle_id text not null, started_at timestamptz not null, finished_at timestamptz,
  members jsonb not null check (jsonb_typeof(members)='array'),     -- 冻结的 [{issuer_id, market, expected_keys}]
  status text not null check (status in ('running','complete','complete_with_gaps')),
  expected_total int not null, compared_passed int not null default 0, compared_failed int not null default 0,
  not_compared int not null default 0, exec_failed_members int not null default 0,
  detail jsonb not null default '{}' check (jsonb_typeof(detail)='object'),   -- pending_members（§3.2 set_merge 写入）等
  primary key (pair, cycle_id)
  unique index (pair) where status = 'running'                       -- 同一 pair 同时只有一个运行中周期
dq_reconcile_cursor
  pair text not null, cycle_id text not null, issuer_id uuid not null references issuers on delete restrict, market text not null,
  expected int not null,                                               -- 该成员的预期键数（冻结）
  state text not null default 'pending' check (state in ('pending','claimed','done','failed')),
  claimed_by uuid references ingest_batches(batch_id) on delete set null, claim_until timestamptz,
  attempts int not null default 0, last_error text, done_at timestamptz,
  compared_passed int, compared_failed int, not_compared int,          -- 完成时写入；done 行三者之和必须 = expected
  primary key (pair, cycle_id, issuer_id, market),
  foreign key (pair, cycle_id) references dq_reconcile_cycles(pair, cycle_id) on delete restrict,
  index (pair, cycle_id, state),
  constraint drc_expected_nonneg check (expected >= 0),
  constraint drc_counters_nonneg check ((compared_passed is null or compared_passed >= 0) and (compared_failed is null or compared_failed >= 0) and (not_compared is null or not_compared >= 0)),
  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
```

（S5 规定修法）`done` 行三个计数都必须非空且和等于 `expected`；结算前再断言每个 `done` 成员满足该不变式，**不得**把无效计数 coalesce 为 0。

游标的认领与完成都要求所有权（§5.5）。**围栏令牌**：`fence = {pair, cycle_id, issuer_id, market, batch_id, attempt}`。**逐键原子提交（T2 规定修法，取代第 5 稿的"分步写入 + 作废"）**：对账派生的全部写入只经 `apply_reconcile_result(p_fence, p_result)`（§3.2），每次调用处理**一个预期键**，在**同一事务**内：锁游标行并校验 `claimed_by = fence.batch_id and attempts = fence.attempt and claim_until > clock_timestamp()`（否则 `raise 'fence_failed'`，无任何写入）→ 若该 `(pair, cycle_id, natural_key)` 已有结果行（已接受结果标记）→ 原样返回该行（幂等复用，不重复写入）→ 否则写 `dq_reconciliations` 结果行（带 `cycle_id/issuer_id/market/attempt`）+ 需要的工作项（`reconcile_mismatch`/`reconcile_review`/`lineage_conflict`）+ 可见性变化（左侧 `ok` → `quarantined`，持 scope 锁、`state_rev+1`，并在项上写 `detail.hook={stage:'materialize', state:'pending'}`）+ 已隔离左侧的 `latest_result` 更新。**租约丢失后，此前已提交的键仍然有效**（它们是被接受时的有效结果），接手的工作者对这些键直接复用；只有尚未提交的工作被丢弃。成员完成 `complete_reconcile_member(p_fence)` 的三个计数**从该成员本周期已接受的结果行推导**（`compared` 且 `passed` / `compared` 且非 `passed` / 其他 outcome），三者之和必须 = `expected`，否则 `raise 'member_incomplete'`；不存在"标记 superseded"的步骤。

**`dq_calendar_passes` 与 `dq_calendar_pass_members`**（§6.2；T3 规定修法：每个冻结成员有持久化状态，全部遍写入经锁与租约校验）

```
dq_calendar_passes
  market text not null, pass_id uuid not null, started_at timestamptz not null, finished_at timestamptz,
  claimed_by uuid references ingest_batches(batch_id) on delete set null, claim_until timestamptz,   -- 每市场/每遍同一时刻一个持租工作者
  status text not null default 'running' check (status in ('running','complete','complete_with_failures')),
  primary key (market, pass_id)
  unique index (market) where finished_at is null
  constraint dcp_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
dq_calendar_pass_members                                         -- 创建遍时冻结（范围内发行人）；遍进行中范围的增减进入下一遍
  market text not null, pass_id uuid not null, issuer_id uuid not null references issuers on delete restrict,
  state text not null default 'pending' check (state in ('pending','done','failed')),
  attempts int not null default 0 check (attempts >= 0), last_error text, done_at timestamptz,
  primary key (market, pass_id, issuer_id),
  foreign key (market, pass_id) references dq_calendar_passes(market, pass_id) on delete restrict
```

遍函数（`security definer`，仅 service_role）。**认领有自己的原子协议（U1）**：`claim_calendar_pass(p_market, p_batch) returns jsonb` 先 `pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||p_market))` 串行化创建；锁住该市场未完成的遍（`for update`）；没有 → 建遍、冻结成员、租给 `p_batch`；有且租约空闲或已过期（`claim_until is null or claim_until < clock_timestamp()`）→ 接管（`claimed_by=p_batch`、`claim_until=clock_timestamp()+10 min`）；否则返回 null；成功返回令牌 `{market, pass_id, batch_id}`。**其余三个函数**先 `select … from dq_calendar_passes where (market, pass_id) = token for update` 并校验 `claimed_by = token.batch_id and claim_until > clock_timestamp() and finished_at is null`，否则 `raise 'fence_failed'`，无写入：`replace_filing_expectations(p_issuer, p_market, p_rows jsonb, p_pass_token jsonb)`（**唯一签名**，无三参数重载）：要求该成员属于本遍且 `state='pending'` 或 (`state='failed' and attempts < 3`)，原子替换该发行人该市场的期望行并把成员置 `done`（重试成功即移出失败，不存在第二次推进）；`fail_calendar_member(p_pass_token, p_issuer, p_error)`：`attempts+1`、`state='failed'`、`last_error`；`finish_calendar_pass(p_pass_token)`：只从持久化状态结算——无 `pending` 且无 `failed and attempts < 3` 时，全部 `done` → `complete`，否则 `complete_with_failures`，两种终态都写 `finished_at`；否则 `raise 'pass_incomplete'`。

**`issuer_filer_categories`**（§6.1：按财年的申报人类别，来自该财年 10-K 封面）

```
issuer_id uuid not null references issuers on delete restrict, fiscal_year int not null,
acceleration text not null check (acceleration in ('large_accelerated','accelerated','non_accelerated')),
smaller_reporting boolean, category_raw text not null,
source text not null check (source in ('ixbrl_dei')), accession text not null, evidence_sha256 text not null,
as_of date not null, primary key (issuer_id, fiscal_year)
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
category_raw_current text,               -- submissions.category 原文，仅供参考与 sec.filer_category 对账，不决定期限
regime text not null check (regime in ('10-K','20-F','40-F','cn')),
fiscal_year_end text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
week52_pattern boolean not null default false, source text not null, source_sha256 text, as_of date not null, updated_at timestamptz not null default now(),
primary key (issuer_id, market)
```

**`dq_freshness`**：`expected_cadence` 枚举加 `'weekly'`（`alter table … drop constraint … add constraint … check (expected_cadence in ('daily','weekly','monthly','quarterly','event'))`）；`freshness.ts` 的 `WINDOW_MS.weekly = 7d`、`GRACE_MS.weekly = 2d`。

**函数 `resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null) returns jsonb`**（`security definer set search_path = public`，仅 service_role）：`select … for update` 声明行；非 `pending` → `raise 'already_resolved'`；`op='legacy'` → `raise 'legacy_claim'`；`op='evidence_only'` 且 `p_status='accepted'` → 要求 `p_amend` 把它改写为可执行 op（§4.2.1 修订规则），否则 `raise 'amend_required'`；校验 `detail` 符合 `claim/1` 模式、`detail.target.issuer_id = issuer_id`、`(op, id_type)` 配对合法（表 §4.2.1）；`rejected` → 只改状态；`accepted` → 在同一事务按 op 执行业务写入（每个分支为静态 SQL，目标发行人必须 `status='active'`；每个写入要求 `get diagnostics row_count = 1`，否则抛对应码回滚）并把 `detail.provenance_written`（白名单键）同时写入目标行的 `provenance`；成功写 `status/resolved_by/resolved_at`，返回 `{op, applied}`。

**拓扑写入的唯一入口**：`issuers.status/merged_into` 的任何改变只能经迁移二的 `set_merge`/`set_dissolved`（§3.2）。迁移一先加触发器 `issuers_topology_guard`（`before update of status, merged_into`）：**`current_setting('entities.allow_topology_write', true) IS DISTINCT FROM 'on'` 时抛 `23514 topology_write_forbidden`**（S1 规定修法：设置缺失返回 NULL 也必须拒绝）；两个拓扑函数在进入时保存原值 `prev := current_setting('entities.allow_topology_write', true)`，`set_config('entities.allow_topology_write','on',true)`，并在**所有返回路径**（正常返回与 `exception … when others` 块内）恢复 `set_config('entities.allow_topology_write', coalesce(prev,''), true)` 后再返回或重新抛出。测试（§9.2）：在全新连接上直接 `update issuers set merged_into=…` 被拒；在同一事务内先成功调用 `set_merge` 再直接 update 也被拒。计划一的 `issuers_merge_target_active` 与 `issuers_retire_requires_closed_securities` 触发器保持不变，仍在函数内生效。runbook §1.1 的手工 SQL 合并改为：手工关闭/转移证券 → `set_merge`。在迁移二落地前（无 `fact_sync_scope` 表），迁移一只装触发器，合并暂不可执行（计划二落地前本来也没有事实需要谱系）。

本迁移的全部新表（`dq_reconcile_cycles`、`dq_reconcile_cursor`、`dq_calendar_passes`、`dq_filing_expectations`、`issuer_filing_profiles`、`issuer_filer_categories`）与 `issuer_identifier_claims` 为 service-role only。

**桶 `reconcile-raw`**：MIME 加 `application/pdf`；`upsert:false`，`409` 视为已存在（内容寻址，不可变）；上传失败 → 该发行人/该文件的处理 `failed`，不写依赖它的行。存：主文档、submissions JSON 与分页、HKEX 名单、GLEIF 子集（记原文件 sha256/大小）、OpenFIGI 请求与响应、Tushare `disclosure_date` 响应、黄金集引用的年报 PDF（抄录人用 `scripts/dq/gold-pdf.ts --upload` 上传，脚本校验 sha256 与 json 一致）。集成测试：anon/authenticated 不能读写该桶。

### 3.2 `20261107091000_facts_extensions.sql`（依赖规格二 `20261106090000`）

**`filings` 新列**：`accepted_at timestamptz`、`acceptance_source text check (… in ('sec_submissions'))`，`(accepted_at is null) = (acceptance_source is null)`；`filings_limited_update` 允许集加这两列且只允许 `null → 非 null`；**任何应用角色都不得直接 update `accepted_at`/`acceptance_source`**（只经 `set_filing_acceptance`）；保留 service_role 对 `document_ref/document_url/link_attempts` 的列级 update（计划二 `updateFilingLink`）与 `mapping_gen` 只经函数、只增（T11）。

**`financial_metrics`**：`based_on_lineage jsonb not null default '[]'`；首次加列时 `update financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev))`；约束 `jsonb_array_length(based_on_lineage) >= 1`（加约束前回填）。规格二的 `replace_financial_metrics(uuid,text,bigint,jsonb)` 保留为兼容包装：`select replace_financial_metrics_lineage(issuer, market, jsonb_build_array({issuer, based_on_rev}), rows)`，签名不变，`based_on_lineage` 因此总是一致。`MetricRow`、`metricFromTable`、三种 `FactsDb` 实现与分页指标读取的一致性检查都保留并比较**完整** `based_on_lineage` 向量（不只 `based_on_rev`）（T8）。

**资格谓词加在共享助手 `fact_promote_rows(uuid,text,uuid[])`**（T6 规定修法；`create or replace`，保留落地的全部谓词与其 `revoke execute … from public, anon, authenticated, service_role`）：若该行曾属于某个已处理的 `lineage_conflict` 项，则必须在该项 `detail.chosen_fact_ids` 内；若该行有 open 的、或已处理但 `(detail->'latest_result'->>'passed')::boolean IS DISTINCT FROM true` 的 `reconcile_mismatch` 项引用，则不提升（恢复只能经 `restore_reconciled`；缺 `latest_result` 视为未通过）。`promote_quarantined` 保持为加锁/递增 rev 的包装；`resolve_facts_quarantine`、`restore_reconciled` 都经该助手提升。集成测试覆盖每个提升入口（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）。

**新函数**（`security definer set search_path = public`；仅 service_role，标注者除外）：

| 函数 | 行为 |
|---|---|
| `set_filing_acceptance(p_filing, p_accepted, p_source) returns boolean` | `accepted_at is null` 时写入 true；相同 false；不同 `raise 'acceptance_conflict'` |
| `apply_reconcile_result(p_fence jsonb, p_result jsonb) returns jsonb` | **对账派生写入的唯一入口（T2 规定修法；取代第 5 稿的 `reconcile_quarantine` 与多动作版 `apply_reconcile_result`）**。`p_result = {natural_key, kind, outcome, passed, left_value, right_value, abs_diff, rel_diff, tolerance, left_source, right_source, detail, action, left_fact_id?, item?}`，`action ∈ {'record','quarantine_left','review_item','lineage_item'}`。一个事务内：锁 `p_fence` 指向的游标行并校验所有权/尝试号/未过期（失败 `fence_failed`，无写入）→ `(pair, cycle_id, natural_key)` 已有结果行 → 返回 `{reused:true, reconciliation_id}`（幂等）→ 写结果行（`cycle_id/issuer_id/market/attempt` 取自围栏）→ 按 `action`：`quarantine_left` 且左侧 `ok`、属于 `fence.issuer_id/market`、所属运行 `published`：持该 scope 行锁，建（或复用同自然键 open 的）`reconcile_mismatch` 项（`dataset = DATASETS.facts(market)`，`payload={key, fact_ids:[left], left_value, right_value, right_locator}`，`detail={pair, reconciliation_id, inputs_hash, latest_result, issuer_id, market, hook:{stage:'materialize', state:'pending', at}}`——物化目标与钩子同事务持久化，U2），左侧行置 `quarantined`，`state_rev+1`；左侧已 `quarantined` 且有引用它的 open `reconcile_mismatch` 项 → 只更新该项 `detail.latest_result={passed, reconciliation_id, at, inputs_hash}`；`review_item` → 建非隔离 `reconcile_review` 项；`lineage_item` → 建 `lineage_conflict` 项（§4.4）；`record` → 只写结果行。返回 `{reused:false, reconciliation_id, item_id?, quarantined:0|1, materialize:{issuer_id, market}?}`。物化由运行器在调用之后做（`T(issuer)`）；崩溃于提交与物化之间 → 项上 `hook.state='pending'`，由下一次运行或 `scripts/facts/materialize.ts --pending-hooks` 完成（§4.6） |
| `restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid) returns jsonb` | 持锁；项必须 `open`、`reason_code='reconcile_mismatch'`；要求 `detail.latest_result.passed = true` 且 `detail.latest_result.inputs_hash = p_inputs_hash_now`（**由路由在请求时**从当前输入计算：左侧 `raw_hash` ‖ 右侧文档 sha256 ‖ 当前黄金文件/样本清单 sha256 ‖ 解析器版本；运行器写 `latest_result.inputs_hash` 时用同一函数；因此任何输入在最近一次通过之后的变化都会使二者不等）；不满足 → `raise 'not_passing'`。满足则**先**把本项置 `resolved_accept`（`resolved_by/at`，`detail.restored_by_batch`），**再**按 `promote_quarantined` 的资格规则（含本规格附加条款——此时本项已关闭，不再阻塞自己；其他 open 的 `reconcile_mismatch`/争议项仍阻塞）提升 `payload.fact_ids`；`state_rev + 1`；返回 `{promoted, skipped:[{fact_id, reason}]}`。顺序与规格二 `resolve_facts_quarantine` 一致（先关项后提升） |
| `read_filing_facts(p_filing uuid, p_include_non_ok boolean) returns jsonb` | **证据读取器**：返回该 filing 下**全部映射代、全部状态**（`p_include_non_ok=false` 时只 `ok`）的事实行（`financial_facts` 列 + `status`、`mapping_gen`、`run_id`、所属运行 `status`），不做窗口计算；`security definer`，仅 service_role。**绑定规则（S2 规定修法）**：常规对账把自然键绑定到该 filing **激活映射代**（`mapping_gen = filings.mapping_gen`）且所属运行 `published` 的行，状态 `ok` 或 `quarantined` 皆可；**先过滤**到激活代与已发布运行、**再**判断基数：过滤后多于一行 → 结果 `left_ambiguous`，不比较；仅旧代存在同键既不构成歧义也不参与绑定；显式复查（已隔离项的重跑）绑定到项的 `payload.fact_ids`，不论代，绝不换成别的行；`adopt_candidate` 的重复检查用规格二完整候选键（K + `filing_id` + `mapping_gen`），跨全部状态，仅旧代存在同键不构成重复（T1） |
| `adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid) returns jsonb` | **候选适配（T5 规定修法）**：项 `open` 且 `reason_code='ambiguous_value'`，`dataset ∈ {'facts.us','facts.cn'}`（T4，落地小写）；`p_index` 越界 → `invalid_choice`。持久化候选是计划二 `FactCandidate`（`concept, sourceConcept, statement, periodStart, periodEnd, duration, value, unit, consolidation, filingRef, rawHash`），函数显式映射到插入字段：`source_concept←sourceConcept`、`period_start←periodStart`、`period_end←periodEnd`、`raw_hash←rawHash`；任一字段缺失或类型不对 → `invalid_candidate`。**filing**：`source` 由项的市场决定（`facts.us → edgar`、`facts.cn → tushare`），`filings(source, source_ref=filingRef)` 唯一定位，不存在 → `filing_not_found`；发行人与市场**取自该 filing 行**（不信任 payload）。**代**：取自项的锚定运行 `payload.run_id` 的 `fact_sync_runs.mapping_gen`，并须等于 `natural_key` 末段的代与 `filings.mapping_gen`（且 `> 0`），否则 `generation_moved`。**映射版本**：取该锚定运行（无则同 filing 同代）的事实行留存的 `mapping_version`，恰一个不同值才用；零个或多个 → `replay_required`（409，需重放原始快照，绝不取当前默认值）。`p_batch` 必须存在、`status='running'`、`dataset = 项.dataset`（否则 `batch_mismatch`）；持该 (filing.issuer_id, filing.market) 的 scope 行锁；`state_rev <> p_expected_rev` → `stale_evaluation`。**重复（T1）**：规格二完整候选键（K + `filing_id` + `mapping_gen`）在任何状态下已存在 → `duplicate`；仅旧代存在同键**不**构成重复。在 scope 锁下检查，**任一**成立即 `conflict_exists`（U3）：同 K 同日存在值不同的 `ok` 行；**或**存在适用的 open 争议项（同 K 同日的 `same_day_conflict`/`lineage_conflict`）。测试：有 open 争议、无剩余 `ok` 竞争者时采用被拒。同一事务：生成 `run_id` 与 `fact_id`；插入 `fact_sync_runs(run_id, issuer_id=filing.issuer_id, market=filing.market, batch_id=p_batch, mapping_gen=该代, status='published', manifest='[]', started_at=now(), published_at=now())`（管理运行：不激活映射代，不改 `filings.mapping_gen`）；插入事实（`issuer_id`、`market`、`filing_id`、`available_date = filing.available_date`、`mapping_gen`、核实的 `mapping_version`）`staged` 再 `→ok`；项 `resolved_accept`、`resolved_by/at`、`detail.chosen_candidate_index/adopted_fact_id/run_id/issuer_id/market`、`detail.hook={stage:'materialize', state:'pending', at}`；`state_rev + 1`；返回 `{fact_id, run_id, issuer_id, market}` |
| `resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid) returns jsonb` | 项 `open`、`reason_code='lineage_conflict'`；从 `natural_key` 取目标 T；在事务内先计算 **T 的当前完整谱系**（T ∪ 所有 `merged_into = T`）并按 `(issuer_id, market)` 排序锁定谱系每个成员的 scope 行（缺失 → `scope_missing`）；payload 中行的发行人必须 ⊆ 谱系（否则 `lineage_changed`）；`p_keep ∈ payload.fact_ids`；把谱系内该 (K, 日期) 除 `p_keep` 外仍 `ok` 的行（不限于 payload，锁下重新查询）置 `quarantined`；结束后该 (K, 日期) 在谱系内恰有一个 `ok` 值（否则回滚 `unresolved`）；项 `resolved_accept`、`detail.chosen_fact_ids=[p_keep]`、`detail.quarantined_fact_ids`；谱系每个 scope `state_rev + 1`；返回 `{quarantined}` |
| `read_facts_lineage(p_issuers uuid[], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok default false) returns jsonb` | 规格二 `read_facts` 的同一语句模板，`f.issuer_id = any(p_issuers)`，分区键去掉 `issuer_id`。**跨发行人冲突抑制只在 `array_length(p_issuers,1) > 1` 时生效，且只看 `ok` 行**：同 K 同 `available_date` 来自不同发行人且值不同的 `ok` 行不参与当前值，列入 `conflicts`；**保留落地的九参数签名与信封语义（T7 规定修法）**：只有合格的 `ok` 行参与序列窗口；非 `ok` 行带 `disclosure_seq=NULL`、`is_current=false`、`is_revision=false`，且只在 `p_history=true` 时返回；保留激活代过滤、概念键限额、10,000 行截断时空结果、十进制字符串与 RLS；非 `ok` 行不参与抑制。信封 `{state_revs:[{issuer_id, state_rev}], lineage:[…], rows:[…含 issuer_id…], conflicts:[{key, available_date, fact_ids}], truncated, row_count}`。规格二 `read_facts(p_issuer, …)` 改为对单元素数组调用后映射：`state_rev = state_revs[0].state_rev`，去掉 `lineage/conflicts`；单发行人时抑制不生效，因此输出与第 8 稿语义**完全一致**（集成测试对 `ok`/`includeNonOk`/`history` 三种模式逐字段比较）。`security invoker`，`grant execute to anon, authenticated, service_role` |
| `replace_financial_metrics_lineage(p_issuer, p_market, p_based_on jsonb, p_rows jsonb) returns int` | `p_based_on` 为 `[{issuer_id, state_rev}]`，要求 issuer_id 唯一且含 `p_issuer`；对每个成员的 scope 行按 `(issuer_id, market)` 排序 `for update`（缺失 → `raise 'scope_missing'`）；锁内重算谱系 `{p_issuer} ∪ {merged_into = p_issuer}` 与 `p_based_on` 集合比较，不等 → `stale_computation`；逐个 `state_rev` 比较，不等 → `stale_computation`；删 `(p_issuer, p_market)` 物化行并插入，`based_on_rev = p_issuer 的 state_rev`，`based_on_lineage = p_based_on`。拓扑函数也持这些锁并递增 `state_rev`，因此合并/改指不能插入到比较与写入之间 |
| `set_merge(p_source uuid, p_target uuid, p_resolved_by uuid) returns jsonb` | **拓扑写入（含改指）**。事务内 `set_config('entities.allow_topology_write','on',true)`；受影响集合 = `{p_source, p_target} ∪ 当前 merged_into = p_source 的全部引用方 ∪ 当前 merged_into = p_target 的全部引用方`；为集合中每个发行人在两市场确保 scope 行存在（缺失则插入 `priority=0, reasons='[]', fetch_key=''`），按 `(issuer_id, market)` 排序 `for update`；锁下重新读取引用方集合（`for update` 读 `issuers` 行），期望行数 n；`update issuers set merged_into = p_target where merged_into = p_source` 要求 `row_count = n`；`update issuers set status='merged', merged_into=p_target where issuer_id=p_source and status='active'` 要求 `row_count = 1`（否则 `source_not_active`）；计划一触发器此时校验目标活跃且源无开放证券（失败即回滚，错误原样抛出）；集合中每个 scope `state_rev + 1`；为 pair `facts.lineage_same_day` 把 `p_target` 加入下个周期成员（写 `dq_reconcile_cycles.members` 的待加入列表 `detail.pending_members`，由运行器开新周期时合并）；`research_audit_log(action='entities.merge', detail={source, target, repointed:n})`；返回 `{repointed:n}`。A→B 后 B→C：`set_merge(B, C)` 先把 A 改指 C 再退役 B，一跳不变式保持。无谱系（无事实）时同样经此函数 |
| `claim_reconcile_member(p_pair, p_cycle_id, p_issuer, p_market, p_batch) returns jsonb` / `complete_reconcile_member(p_fence) returns jsonb` / `fail_reconcile_member(p_fence, p_error text) returns void` | 游标三操作（`security definer`，仅 service_role）。认领按 §5.5 谓词原子执行，成功返回 `fence`（`attempt` = 认领后的 `attempts`），否则 null；完成从本周期该成员的已接受结果行推导三计数（`member_incomplete` 见 §3.1），带同一围栏条件 `state='done'`；失败带围栏条件 `state='failed'`、`last_error`。围栏不满足 → `fence_failed` |
| `set_dissolved(p_issuer uuid, p_resolved_by uuid) returns void` | 同样的锁集合（发行人 + 引用方）；要求无引用方（`has_referrers` → 调用方先 `set_merge` 改指）；`update issuers set status='dissolved' where issuer_id=p_issuer and status='active'` `row_count = 1`；`state_rev + 1`；审计日志 |

**`FactsDb` 扩展**（三种实现都要）：`readFactsLineage(issuers, market, opts)`、`readFilingFacts(filingId, includeNonOk)`、`replaceMetricsLineage(issuer, market, basedOn, rows)`、`adoptCandidate(item, index, batch, expectedRev, resolvedBy)`、`applyReconcileResult(fence, result)`、`claimReconcileMember(pair, cycleId, issuer, market, batch)`、`completeReconcileMember(fence)`、`failReconcileMember(fence, error)`、`findFilingBySourceRef(source, sourceRef)`、`filingsForCalendar(issuer, market, {fromPeriodEnd})`（返回覆盖所需报告期的**全部** filing 行与其所属运行状态、`mapping_gen`；不按行数截断，T9）、`restoreReconciled(item, batch, inputsHashNow, resolvedBy)`、`resolveLineageConflict(item, keep, batch, resolvedBy)`、`setFilingAcceptance(filing, acceptedAt, source)`、`setMerge(source, target, resolvedBy)`、`setDissolved(issuer, resolvedBy)`、`stateRevs(issuers, market)`。错误码并入 `FactsDbError`。

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

`[valid_from, valid_to)` 半开。方法枚举见 §3.1，分两类：**观测界**（`first_observed`、`sec_file_absent`、`unrecorded`）表示"本库在此日期观测到/不再观测到"，不是生效日；**证据日**（`listing_date`、`delisting`、`ticker_change`、`merge_close`、`curated`）表示有文件支持的生效日。`ticker_change` 只能由人工声明（`close_security`/`backdate_window`，证据如 8-K Item 8.01 代码变更公告）写入，脚本不自动判定（§4.3.4）。读接口把方法原样返回，使用方据此判断区间端点的性质。**上市日只属于该 ticker 在本库最早的持有行**；更晚的持有行保持原方法。

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
  - 关闭条件（全部满足）：仍消失；`fetched_at − first_missing_fetched_at ≥ 7 天`；本次 sha256 ≠ 首次；**第二来源确认**：该 CIK 的 submissions `tickers[]`（本次运行抓取）不含 OLD。则 `valid_to = first_missing_as_of`，`valid_to_method = 'sec_file_absent'`（**观测界**：最后一次观测到持有是 `first_missing_as_of` 之前的那次运行；不断言换码生效日），`provenance.valid_to` 记两次文件哈希、submissions 哈希与 `last_seen_as_of`；`replacement_tickers` 只保留在 `provenance.pending_change`，并为该发行人写一条 `evidence_only` claim（`params.suggested_op='backdate_window'`，`note='观测到 OLD 消失、NEW 出现；换码生效日需 8-K/公告证据'`），由人工把 NEW 行改为 `ticker_change` 并给出生效日。
  - 该 ticker 在文件中归另一 CIK → `ownership_conflict` 隔离，不关闭。
  - 关闭后再次出现 → 新行 `first_observed`（从再出现的 `as_of` 起）；旧关闭行不改。
- 换码夹具：T0（CIK X 持 OLD）、T1（X 持 NEW，OLD 消失，`as_of=T0+1d`）、T2（仍无 OLD，`as_of=T0+8d`，不同 sha256，submissions 夹具 `tickers=['NEW']`）。断言：`resolveIssuer({ticker:'OLD'},{asOf:T0})` = X；T1 后 T2 前 `{asOf:T1}` = X；T2 后 `{asOf:T1}` = null、`{asOf:T0}` = X；OLD 行 `valid_to_method='sec_file_absent'`、NEW 行仍 `first_observed`、存在一条 `evidence_only` claim；缺少 submissions 确认时不关闭。

#### 4.3.5 `resolveIssuer` 的 `asOf`

`ResolveOptions{includeExpired?, asOf?, today?}` 同义；都给且不等 → `invalid_as_of`；`today` 标 `@deprecated`。`ResolvedSecurity` 加 `valid_from_method/valid_to_method`。`GET /api/entities/resolve?ticker=…&asOf=`：`asOf` ≤ 今天否则 400；历史 `asOf` 缓存 `public, max-age=600, s-maxage=3600`。规格二读接口加 `tickerAsOf`（有则按其解析，无则今天）；响应 `resolution:{tickerAsOf, issuerId, validFromMethod}`。

### 4.4 合并后发行人的事实归属（读时谱系）

- 谱系 = `{T} ∪ {i | i.merged_into = T}`（一跳）。事实行保留原 `issuer_id`。读取用 `read_facts_lineage`；跨发行人同 K 同日不同值的 `ok` 行不参与当前值、进 `conflicts`。
- 拓扑写入只经 `set_merge`/`set_dissolved`（§3.2；触发器 `issuers_topology_guard` 挡住其他路径）：持源、目标与两者全部引用方的 scope 锁、改指引用方、递增 `state_rev`、登记谱系对账成员。
- 冲突处置：对账对 `facts.lineage_same_day`（游标：合并时登记 + 每周）对每个 `conflicts` 条目写对账行（`kind='numeric'`，`outcome='compared'`，`passed=false`）并建隔离项 `lineage_conflict`（`natural_key=<T>:<K>:<available_date>`，`payload={fact_ids, values:[{issuer_id, filing, value}]}`）。管理员 POST 体 `keep_fact_id` → `resolve_lineage_conflict`（原子、排序锁、结束后恰一个 `ok` 值、裁决持久化并被 `promote_quarantined` 附加条款遵守）。不自动择一。
- `fact_sync_scope`：`merged` 发行人 `priority=0`、`reasons=[]`。
- 物化目标：对发行人 i 的任何可见性操作（发布、提升、对账隔离、采用候选、谱系裁决、恢复）后，物化 `T(i) = i.merged_into ?? i`。**扩展落地的 `materialize(db, issuer, market, opts)` 契约（T9）**：读 T 的当前谱系 → `readFactsLineage(lineage, market, …)`（`truncated` → 拒绝，不写）→ 校验每行 `issuer_id ∈ 谱系`（替代落地的"行必须属于本发行人"检查）→ 为 T 派生 → `replaceMetricsLineage(T, market, state_revs, rows)`；`stale_computation` → 重读重算一次（保留落地的一次重试）。
- 读接口：`issuerId`=T，`lineage`，`conflicts`，每行 `recordedIssuerId`。**`/metrics` 无 `asOf`（T8 规定修法，保留落地的前后两次读取守卫）**：读指标前后各读一次谱系成员与 `stateRevs(lineage)`；两次的成员与 rev 向量必须相同，且每个返回行的 `based_on_lineage` 等于该向量；任何不一致或读取不稳定 → `metrics:[]`、`stale:true`，沿用落地的 stale 缓存策略（`STALE_CACHE_CONTROL`）；不内联重算（由上述操作路径重算）。

### 4.5 SEC 受理时刻 `src/lib/facts/providers/sec-acceptance.ts`

规格二美股路第 9 步后加 9b `enrichAcceptance(issuer)`；脚本 `scripts/facts/enrich-acceptance.ts [--issuer …] [--apply] [--report]`。用 §4.3.3 同一份 submissions；按 `accessionNumber` 索引（含分页）；`accepted_at is null` 的 edgar filing 逐个 `set_filing_acceptance`；未命中 → `skipped_summary(acceptance_not_found)`。`filingDate ≠ available_date` → 对账对 `sec.filing_date_vs_submissions`（`kind='date'`，failed），不写。计数：写入 `inserted`，相同 `duplicates`，`acceptance_conflict` → `failed`。

### 4.6 被隔离候选的人工选定（`ambiguous_value`）

规格二 §7.3 规定 `facts.*` 项的接受全部经 `resolve_facts_quarantine`。**落地的分派点是 `src/lib/dq/facts-resolver.ts::resolveFactsItem`（由 `/api/admin/dq/quarantine/[id]` 调用），本规格扩展它（T10 规定修法）**，接受分支：`ambiguous_value` 带 `chosen_candidate_index` → `adopt_candidate`；`reconcile_mismatch` → `restore_reconciled`；`lineage_conflict` 带 `keep_fact_id` → `resolve_lineage_conflict`；`reconcile_review` → 计划一通用的守卫状态翻转（接受与拒绝都只改状态，不提升、不物化）；其余 `facts.*` 原因 → 落地路径（`resolve_facts_quarantine`）。拒绝分支保持落地的通用翻转（行保持 `quarantined`）。保留落地语义：持久化的 `chosen_fact_ids`、持久化的裁决人归属（`recovered`）、失败重试的 HTTP 502。**每个新的可见性变化裁决**（`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`）都在其 SQL 函数的同一事务内写 `detail.hook={stage:'materialize', state:'pending', at}` 与物化目标（`detail.issuer_id/market`）；恢复按持久化的目标与裁决处理缺失/pending/failed 钩子（`FACT_ROW_REASONS` 扩展为包含这三个原因的恢复判定）。新增 `scripts/facts/materialize.ts --pending-hooks`（落地脚本目前没有该参数）：扫描 (a) 全部 `facts.*` **已处理**项中 `hook.state ∈ {pending, failed}` 或缺失钩子的可见性裁决（采用、恢复、谱系），以及 (b) **open** 的 `reconcile_mismatch` 项中 `hook.state ∈ {pending, failed}` 者（对账隔离，项在人工处理前一直 open）；按项上持久化的 `detail.issuer_id/market` 取发行人，恢复时按当前拓扑重新求物化目标 `T(i)`（U2）。测试：`apply_reconcile_result` 提交后立即崩溃、项仍 open → 扫描完成物化。分派表与其测试必须穷举以上分支。

- 路由：读项与候选 → 由候选 `filingRef` 经新增的 `FactsDb.findFilingBySourceRef(source, sourceRef)`（`source` 由项市场决定）定位 filing，取其 `issuer_id/market`（不信任 payload）→ `readFacts(issuer, market, {concepts: 该组, asOf: 今天, includeNonOk:false})` 得 `stateRev` 与该组当前代 `ok` 行 → TS 评估规格二 §7 规则（候选 ∪ ok 行）；失败 → 400 `rule_failed`，不写库 → 新建批次（`producer='dq-resolver'`，`dataset = 项.dataset`）→ `adoptCandidate(item, n, batch, stateRev, resolvedBy)`：`stale_evaluation` → 重读重评一次再调用，仍过期 → 409；`batch_mismatch` 为编程错误 → 500；`replay_required`/`filing_not_found` → 409；其余码按 §8。
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
| `us.companyfacts_vs_gold` | numeric | 规格二 `plan2.json` 美股部分（只取非 `<pending>` 条目；`ready:false` 时每个 `<pending>` 条目一行 `incomplete_gold`，绝不比较占位值，也不宣称黄金完成，T15） | 同上 | 0 | 隔离左侧 |
| `sec.filing_date_vs_submissions` | date | `filings.available_date` / `filingDate` | `<cik>:<accn>` | 相等 | 记录 |
| `sec.filer_category` | text | submissions `category` / 主文档 `dei:EntityFilerCategory` | `<cik>:<accn>` | 相等 | 记录 |
| `entities.isin_hkex_vs_gleif` | text | HKEX ISIN / GLEIF+OpenFIGI ISIN | `<ticker>` | 相等 | claim |
| `facts.lineage_same_day` | numeric | 谱系 `conflicts` | `<T>:<K>:<available_date>` | 0 | `lineage_item` |

数值比较全部精确十进制（`decimal.ts`：十进制字符串 → 缩放 `BigInt`，比较用交叉相乘，不做除法）。`rel_diff = |l−r| / max(|l|,|r|,1)`。**每个预期键恰一行**：`compared | left_missing | left_unlinked | left_ambiguous | right_missing | unsupported | right_ambiguous | incomplete_gold`（T1、T15）。

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
- 失败动作只对左侧 `ok` 行；左侧已 `quarantined` → 只写对账行并更新引用它的 open 项的 `detail.latest_result={passed, reconciliation_id, at, inputs_hash}`，**两者都在 `apply_reconcile_result` 的同一事务内**（T2；`inputs_hash` 由 §5.6 的 `computeInputsHash` 得到）。

### 5.3 美股样本与预期键清单

`scripts/dq/select-us-sample.ts` 生成 `fixtures/gold/us-ixbrl-sample-v1.json`：`{schema, generated_at, issuers:[{cik, ticker, regime, filings:[{accn, form, period_end, raw_sha256, doc_sha256, expected_keys:[{concept, period_start, period_end, unit, source_concept, origin:'left'|'right'|'both'}]}]}]}`。**预期键来自两个独立来源的并集**：(a) 规格二 companyfacts 适配器直接解析该 accn 原始快照得到的 (concept, period, unit)；(b) §5.2 解析器对该 accn 主文档得到的、标签在 `FACT_CONCEPTS` 内且上下文非维度的 (concept, period, unit)。每一侧 ≥ 4 个键否则清单无效；只在一侧出现的键也是预期键——运行时它必然得到 `left_missing` 或 `right_missing`，从而暴露适配器或解析器的遗漏，而不是缩小分母。运行时左侧经 `read_filing_facts(filing_id, true)` 取行，**先过滤**到该 filing 激活代（`mapping_gen = filings.mapping_gen`）且所属运行 `published` 的 `ok`/`quarantined` 行，再按自然键绑定；过滤后零行 → `left_missing`，多于一行 → `left_ambiguous`；仅旧代有同键不影响结果（T1）。样本规则：规格二黄金美股必入；其余按 sp500 ticker 字典序等距至 30 家，含 ≥ 3 NYSE、≥ 3 Nasdaq、≥ 2 财年末非 12-31、≥ 2 `acceleration ≠ large_accelerated`；`10-K` 申报人取最近 10-K + 10-Q，`20-F` 取最近 20-F。清单变更走 PR；映射代升级后重生成。

### 5.4 A 股黄金集对账

**黄金集文件** `fixtures/gold/cn-annual-v1.json`：

```json
{ "schema": "gold/cn-annual/1", "tickers": ["600519.SH", "…"], "fiscal_years": [2022,2023,2024,2025],
  "concepts": ["revenue_operating","net_income_parent","total_assets","equity_parent","operating_cash_flow","eps_basic"],
  "recorded_by": "R1", "reviewed_by": "R2",
  "rows": [{ "ticker": "600519.SH", "fiscal_year": 2024, "concept": "revenue_operating",
    "printed_value": "…", "printed_unit_multiplier": 1, "printed_decimals": 2, "column": "本期",
    "source": {"document": "…2024 年年度报告", "cninfo_announcement_id": "…", "announcement_date": "2025-04-03",
               "pdf_url": "…", "pdf_sha256": "…", "page": 12, "table": "主要会计数据和财务指标"},
    "tushare_source_ref": "600519.SH:20241231:1:20250403", "recorded_at": "…" }] }
```

- 六科目固定（都在年报"主要会计数据和财务指标"表；BS 科目 `INSTANT`，IS/CF `12M`；eps `CNY/share` 且 multiplier=1）。只抄"本期"列；`recorded_by/reviewed_by` 用代号。
- **校验器**拒绝：`rows` 不是 `tickers × fiscal_years × concepts` 的**精确乘积**（每个组合恰一行、无多余行）；非法 ticker；`printed_value` 不匹配正则或小数位 ≠ `printed_decimals`；eps multiplier ≠ 1；缺页码/sha256/announcement_id/announcement_date/`tushare_source_ref`（或其 `report_type` 段与 natural_key 不一致）；`recorded_by == reviewed_by`；`tickers` 为空。
- **样本**：`tickers` = `scripts/dq/select-cn-sample.ts` 生成时 `fact_sync_scope(market='CN', priority>0)` 的发行人主 ticker，按 ticker 升序取前 `min(30, N)`；N=0 → 不能进入 F3-6（退出条件不满足，如实记录）。清单文件只含 ticker 与一手文件定位；范围由规格二决策 A 决定且该决策已承认公共事实可反推队列（本规格 owner 决策 H 再次确认授权用户 = `RESEARCH_OWNER_USER_ID`）。
- **左侧绑定（T14 规定修法）**：`filings.document_ref` 只表示计划二挂接器实际关联的文档，**不**证明它就是原始年报（落地挂接器在存在 type-5 兄弟时把 type-1 标为更正并指向更正公告，type-4 指向次年年报）。因此每个黄金行除 PDF 定位外还记 **`tushare_source_ref`**——抄录人与复核人**独立核实**的、与该 PDF（`pdf_sha256`）同版本的 Tushare 披露引用（`<ts_code>:<end_date>:<report_type>:<ann_date>` 形式，取自计划二 `filings.source_ref`；核实依据：PDF 封面/公告日期与该引用的 `f_ann_date`/`ann_date` 一致、PDF 为原始年报而非更正或次年比较列）。左侧 = `filings.source_ref = tushare_source_ref` 的 filing；不存在 → `left_unlinked`；`document_ref` 与 `cninfo_announcement_id` 不一致只记 `detail.document_ref_mismatch=true`，不改变绑定、不替代。type-5（变更前原数）比较需要它自己的黄金行与它自己核实的源文档，绝不拿更正件或次年比较列替代原始当年列；门禁只数 `report_type=1` 行。事实经 `read_filing_facts(filing_id, true)` 取得并按 §5.3 同样的激活代过滤后绑定；`ok`/`quarantined` 都比较，隔离只对 `ok`；过滤后多行 → `left_ambiguous`。
- **印刷精度区间与自动隔离的边界**：右侧值 = 印刷值 × multiplier，区间半径 = `0.5 × 10^(−printed_decimals) × multiplier`；左侧点值（Tushare 原文十进制）；`passed` ⇔ 左侧 ∈ 区间，交叉相乘比较；`tolerance` 列 = `半径 / max(|l|,|r|,1)`，`detail.tolerance_rule='printed_precision/1'`。**只有右侧为精确印刷**（`multiplier=1` 且 `printed_decimals=2`，即年报以元、两位小数列示，区间半径 0.005 元，与 Tushare 的元两位小数同精度）时，不一致才自动隔离左侧；右侧以千元/万元/百万元等舍入单位印刷时，不一致**不自动隔离**，而是建非隔离的人工复核项 `reason_code='reconcile_review'`（`dataset=DATASETS.facts(market)`，经 `apply_reconcile_result` 的 `review_item` 动作，`payload` 同 §5.6，事实保持 `ok`），由人判断是舍入差还是数据差——因为"四舍五入到印刷位"是假定而非文件声明。E5 门禁的 `passed` 两种情形都计入（在区间内即通过）。owner 替代方案见决策 D。
- **CI 门禁** `gold-cn.integration.test.ts`（critical，F3-6 退出条件要求登记且存在）：**只在真实录制并留存的 Tushare 三表、巨潮挂接与 `disclosure_date` 响应都存在且通过核对时创建**（加载器的合成回退在此测试中禁止）；N 家夹具 → CN 同步进本地库 → 本对账对 → 断言每黄金行恰一结果、`passed/expected ≥ 95%`、非 passed 全部在 `exceptions.json`。CN 对账的部署（cron）同时以 `FACTS_CN_ENABLED=1` 与黄金核实完成为门（T15）。
- 生产：游标周期（§5.5）；失败 → §5.6。

### 5.5 运行器 `src/lib/dq/reconcile/run.ts`

- **周期**：pair 无 `running` 周期时（部分唯一索引保证同一 pair 最多一个；并发建周期的第二个插入 23505 → 读回已有），新建 `dq_reconcile_cycles(cycle_id = <pair>-<started_at ISO 日期>-<uuid 前 8 位>, members = expectedKeys 的发行人集合 ∪ `pending_members`，每成员记 `expected` 键数, expected_total = Σexpected, status='running')` 并为每个成员建游标 `pending`。周期内成员不变（范围变化下个周期生效）。
- **认领（S4 规定修法）**：游标可认领当且仅当 `state='pending'`，或 `state='claimed' and claim_until < clock_timestamp()`，或 `state='failed' and attempts < 3`；认领原子完成：`update … set state='claimed', claimed_by=p_batch, claim_until=clock_timestamp()+interval '10 min', attempts=attempts+1, last_error=null where (pair,cycle_id,issuer_id,market)=… and (state='pending' or (state='claimed' and claim_until < clock_timestamp()) or (state='failed' and attempts < 3))`，按 `issuer_id` 顺序逐条，`row_count=1` 才处理；认领后的 `attempts` 即本次尝试的围栏令牌 `fence.attempt`。`failed` 且 `attempts = 3` 为终态。
- **围栏与完成（T2 规定修法）**：每个预期键经一次 `apply_reconcile_result(fence, result)` 原子提交（结果行 + 工作项 + 可见性变化 + 已接受结果标记）；`fence_failed` → 本次尝试立即终止（其后的键不处理）；已提交的键在租约丢失后仍有效，接手的工作者以 `reused:true` 复用。成员处理完调用 `complete_reconcile_member(fence)`：计数从已接受结果行推导（`member_incomplete` → 本次尝试按异常处理）；`fence_failed`（租约丢失）→ 本工作者停止，该成员留给下一认领者，不需要撤销任何东西（已提交键有效、未提交工作不存在）。异常 → `fail_reconcile_member(fence, error)`（同样的围栏）。
- **周期结算**（每次运行结束时，若全部游标 `done` 或 `failed(attempts ≥ 3)`）：汇总 `compared_passed/compared_failed/not_compared = Σ游标`，`exec_failed_members = count(failed)`；`status = (not_compared = 0 and exec_failed_members = 0) ? 'complete' : 'complete_with_gaps'`；`finished_at`。**不一致（`compared_failed`）不是执行失败**：它们已通过隔离/复核项进入人工流程，周期仍可 `complete`；但任何预期键没有得到 `compared` 结果（缺失、未挂接、不支持、右侧矛盾）或任何成员执行失败，都使周期 `complete_with_gaps`。新鲜度 `recordAttempt(DATASETS.reconcile(pair), {ok: status='complete', cadence:'weekly', detail:{cycle_id, 四个计数}})` **只在周期结算时记**；`complete_with_gaps` 记 `ok:false`（连续两个周期有缺口 → `error`）。周期跨越日历周不影响 id。
- **批次**：`producer='reconcile'`，`dataset=DATASETS.reconcile(pair)`，`tool_versions={pair, cycle_id, parser, gold_schema, sample_sha256, code_version}`；计数：`fetched` = 本次处理的预期键数；`inserted` = passed；`quarantined` = mismatch 且已隔离或已建复核项；`failed` = 隔离失败 + 全部非 `compared` 结果 + 解析异常；`errors` 带 `outcome_summary` 明细。批次状态（`partial`）反映本次运行；周期状态反映覆盖；两者在看板分列。
- 预算：cron `deadline=start+240 s`，发行人开始前剩余 ≥ 60 s。
- 触发：`/api/cron/reconcile?pair=<id>`：US 每日 02:00 UTC；CN 每日 03:00 UTC（黄金集进 CI 后加入）；lineage 每日 04:00 UTC（无成员时空转）。脚本 `scripts/dq/reconcile.ts --pair <id> [--issuer …] [--apply]`。

### 5.6 失败即隔离与恢复

- 隔离：由 `apply_reconcile_result(fence, {action:'quarantine_left', …})` 在**一个事务**内建项（`dataset = DATASETS.facts(market)`，即 `facts.us`/`facts.cn`，T4；`naturalKey='<pair>:<natural_key>:<fact_id>'`、`reasonCode='reconcile_mismatch'`、`detail={pair, reconciliation_id, inputs_hash, latest_result, hook:{stage:'materialize', state:'pending'}}`、`payload={key, fact_ids:[left], left_value, right_value, right_locator}`）、隔离左侧、`state_rev+1`；运行器随后 `materialize(T, market)` 并把 `hook` 置 `done`/`failed`。不存在"项已建、隔离未做"的中间态，因此没有单独的恢复扫描；物化未完成的项由下次运行开始时（扫描本 pair 的 open 项）与 `materialize.ts --pending-hooks` 完成（T2、U2）。
- 恢复：每轮对已隔离事实写 `detail.latest_result={passed, reconciliation_id, at, inputs_hash}`（`inputs_hash = computeInputsHash({left_raw_hash, right_sha256, gold_or_sample_sha256, parser_version})`，纯函数 `src/lib/dq/reconcile/inputs-hash.ts`）。管理员 `resolved_accept` → 路由用同一函数从**当前**输入算 `inputs_hash_now`（左侧 `raw_hash` 来自 `factsByIds`，右侧 sha256 来自桶 `meta.json`，黄金/样本文件 sha256 来自仓库当前文件，解析器版本来自代码）→ `restore_reconciled(item, batch, inputs_hash_now, resolvedBy)`（要求最近一次通过且哈希相等；否则 409 `not_passing`，响应说明"需先重跑对账"）。函数先关项后提升（§3.2），返回 `promoted/skipped`；`promoted=0` 时路由返回 200 但 `detail.restore_note='no_rows_promoted'` 并列出 skipped 原因（例如仍被争议项引用）。`resolved_reject` = 左侧确有问题，行保持 `quarantined`。规格二的 `resolve_facts_quarantine` 对 `reconcile_mismatch` 项不适用（分派表）。`reconcile_review` 项（§5.4）：接受/拒绝只改状态（无事实动作），由计划一通用路径处理。
- 已公开事实被隔离会改变公共接口答案：owner 决策 F。

---

## 6. 财报日历新鲜度

### 6.1 规则 `src/lib/dq/calendar.ts`（纯函数，`CALENDAR_RULES_VERSION='filing-calendar/1'`）

**申报人类别（美股）——按财年、来自该财年 10-K 封面**：`issuer_filer_categories(issuer_id, fiscal_year)` 由 §5.2 解析器对每份 10-K 主文档的 `dei:EntityFilerCategory` 文本得到（`scripts/dq/filer-categories.ts` 与对账运行器共用解析器；范围内每个发行人最近 3 份 10-K；文档入桶，`evidence_sha256`）。解析：含 "Large accelerated" → `large_accelerated`；否则含 "Accelerated filer" → `accelerated`；否则含 "Non-accelerated" → `non_accelerated`；只有 "Smaller reporting company" 或无法解析 → 不写行（没有可用类别）。**类别的适用期**（Rule 12b-2：申报人状态在财年末确定，自下一财年第一份 10-Q 起生效）：财年 N 内各报告期（N 的三份 10-Q 与 N 的 10-K）使用 **财年 N−1 的 10-K 封面类别**；没有 N−1 行 → 该期间 `deadline_state='no_rule'`，`due_rule='none.no_category_for_fy/1'`。submissions 的 `category` 只存入 `issuer_filing_profiles.category_raw_current` 作参考，并经对账对 `sec.filer_category` 与最新 10-K 封面比对；不决定期限。`regime` 按最近年报 `form_type`；`fiscal_year_end` = submissions `fiscalYearEnd`（与最近 10-K `DocumentPeriodEndDate` 不一致 → `detail.fye_mismatch=true`，仍按 10-K 实际 `period_end` 推算）。

**法定期限**：

| regime / acceleration | 年报 | 季报 | due_rule |
|---|---|---|---|
| 10-K / large_accelerated | 财年末后 60 天 | 季末后 40 天 | `us.laf/1` |
| 10-K / accelerated | 75 | 40 | `us.acc/1` |
| 10-K / non_accelerated | 90 | 45 | `us.non/1` |
| 10-K / 该财年无 N−1 封面类别 | `no_rule`（`none.no_category_for_fy/1`） | 同 | — |
| 20-F | 财年末后 4 个月 | 无季报期望 | `us.20f/1` |
| 40-F | `no_rule`（`none.40f/1`） | 无 | — |
| cn | 年报 ≤ 次年 4-30 | Q1 ≤ 4-30、H1 ≤ 8-31、Q3 ≤ 10-31 | `cn.*/1` |

美股期限落在周末或 SEC 假日顺延（Rule 0-3；`SEC_HOLIDAYS` 常量按年维护）；A 股不顺延。

**期望期间**：最近 6 个已结束报告期（含当前财年已结束季度）。
- 月末模式：期末 = 以 `fiscal_year_end` 为锚的季度月末；`deadline_state='statutory'`（规则已知时）。
- 52/53 周模式（`week52_pattern`）：期末 = 最近观测到的同类实际 `period_end` + 364 天，再 +7 天若此值不在锚月；`period_end_estimated=true`，`deadline_state='estimated'`，`due_rule` 加 `/est`；**估计行不计逾期**（约束）。收到的 filing 按 `|period_end − 估计| ≤ 7 天` 匹配，匹配后以实际 `period_end` 替换该行：`replace_filing_expectations(issuer, market, rows jsonb, p_pass_token jsonb)`（`security definer`，迁移一，**唯一签名**，T3）在一个事务内删除该发行人该市场的旧行并插入新行（估计行与实际行的主键不同，必须原子替换）。

**状态**：
- `received`：`filings` 中有 `form_type` 匹配、`period_end` 匹配、**所属运行已发布且 `filings.mapping_gen > 0`** 的行（staged/未激活的不算），`available_date <= due_date`（无 due_date 时即 `received`）；`received_late`：`available_date > due_date`。修订件不算。
- `upstream_lookup`：US = submissions 抓取成功（`recent` 最早条目早于 `period_end` 否则补抓分页；仍失败 → `unavailable`）；CN = `disclosure_date` 调用成功（积分不足/错误 → `unavailable`）；**原始响应字节经 `tushareCallRaw` 留存入桶 `reconcile-raw` 并记 sha256**（落地的 `fetchTushareDisclosureDate` 只返回解析后的行，不可回放，T15）；在真实响应核实 `disclosure_date` 语义（`modify_date`、`actual_date`）之前 CN 行保持 `upstream_lookup='unavailable'` → `unknown_upstream`，不产生 `overdue`。
- `filed_not_ingested`：未收到但上游有：US `form` 匹配且 `reportDate` 匹配期末（±7 天）的条目（`upstream_filed_date=filingDate`）；CN 同 `end_date` 行的 `actual_date` 非空。
- `unknown_upstream`：未收到且 `upstream_lookup='unavailable'`（不算逾期）。
- `pending` / `overdue`：未收到、上游无、`today <= / > due_date`；`overdue` 仅 `deadline_state='statutory'`。
- CN `expected_date`：`disclosure_date` 中 `end_date` 等于本报告期的行，取 `ann_date` 最大者的 `pre_date`（`modify_date` 非空 → `detail.schedule_modified=true`）。

### 6.2 写入 `src/lib/dq/calendar-sync.ts`

`runCalendarSync(deps, {market, limit})`：批次 `producer='filing-calendar'`、`dataset=DATASETS.calendar(market)`。**按"遍"（pass）推进（T3 规定修法，取代第 5 稿的 `next_index/failed_members`）**：每次运行先 `claim_calendar_pass(market, batch)`（§3.1；无未完成遍 → 新建并冻结成员到 `dq_calendar_pass_members`；遍进行中范围的增减进入下一遍；租约被他人持有 → 返回 null，本次运行不处理该市场，`skipped_summary(pass_claimed)`），同一市场同一遍同时只有一个持租工作者。预算内按 `issuer_id` 升序先处理 `state='pending'` 成员，再重试 `state='failed' and attempts < 3` 的成员：成功 → `replace_filing_expectations(issuer, market, rows, pass_token)`（锁遍行、校验租约、校验该成员可处理、原子替换并置 `done`）；失败 → `fail_calendar_member(pass_token, issuer, error)`。所有遍写入都经围栏（`fence_failed` → 本工作者停止）。无可处理成员时 `finish_calendar_pass(pass_token)` 只按持久化状态结算：全部 `done` → `complete`，新鲜度 `recordAttempt(DATASETS.calendar(market), {ok:true, cadence:'daily', detail:{pass_id, started_at, finished_at}})`；有终态失败成员 → `complete_with_failures`，记 `ok:false`；两种终态都写 `finished_at`；一遍从开始到结束超过 2 天也记 `ok:false`。输入 = 档案 + `issuer_filer_categories` + `FactsDb.filingsForCalendar(issuer, market, {fromPeriodEnd: 最早期望期末 − 7 天})`（覆盖全部所需报告期的 filing 行与运行状态，**不**以行数代替期数——修订件不得挤掉原件，T9）+ 上游列表；输出经 `replace_filing_expectations`。回执 `detail={pass_id, issuers_done, rows, by_deadline_state, by_disclosure_state, upstream_unavailable, no_fiscal_year_end, no_category}`。触发：`/api/cron/filing-calendar?market=US` 与 `?market=CN` 各每日 01:00/01:10 UTC。

### 6.3 数据集登记 `src/lib/dq/datasets.ts`

```ts
export const DATASETS = { entities:{sec, researchLink, identifiers, cninfo, ahLink, windows}, facts:(m:Market)=>m==='US'?'facts.us':'facts.cn' /* 落地 sync.ts 持久化的小写标识，T4 */, reconcile:(pair:ReconcilePairId)=>…, calendar:(m)=>… } as const;
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
| `apply_reconcile_result` 提交后物化失败 | 项 `hook.state='failed'`（隔离已生效）；下次运行或 `materialize.ts --pending-hooks` 重做物化 | `materialize_error` | partial |
| 游标认领失败（被他人认领） | 跳过 | `skipped_summary(claimed)` | — |
| `adopt_candidate`：`stale_evaluation` | 重评一次后 409 | 同名 | — |
| `adopt_candidate`：`batch_mismatch` / 候选 `source_ref` 定位不到 filing | 500（编程错误）/ 409 `filing_not_found` | 同名 | — |
| `restore_reconciled`：`promoted=0` | 200，`restore_note='no_rows_promoted'` + skipped 原因 | — | — |
| `resolve_lineage_conflict`：`lineage_changed` / `scope_missing` | 409 | 同名 | — |
| 键提交或成员完成时围栏失败（租约丢失） | 本工作者停止；已提交键仍有效并由接手者复用；未提交工作不存在 | `fence_failed` | partial |
| 周期结算 `complete_with_gaps` | 新鲜度 `ok:false` | `cycle_gaps`（信息） | — |
| 拓扑：直接 SQL 改 `status/merged_into` | 触发器拒绝 | `topology_write_forbidden` | — |
| `set_merge`：`source_not_active` / 计划一触发器错误；`set_dissolved`：`has_referrers` | 回滚，原样抛出 | 同名 | — |
| 日历：财年无 N−1 封面类别 | `no_rule` 行 | `detail.no_category` 计数 | — |
| `adopt_candidate`：`invalid_choice`/`invalid_candidate` → 400；`generation_moved`/`conflict_exists`/`duplicate`/`replay_required`/`filing_not_found` → 409 | 项保持 open | 同名 | — |
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
- `pairs.test.ts`/`run.test.ts`：自然键；印刷精度区间表驱动（含精确印刷→隔离、舍入印刷→`reconcile_review`）；每键恰一行；计数映射；周期创建/认领/重试/结算；**全部 `not_compared` 的周期 → `complete_with_gaps`、新鲜度 `ok:false`（R2 回归）**；全部 mismatch 但已隔离的周期 → `complete`；并发建周期只留一个；`inputs-hash.test.ts`（输入任一项变化哈希即变）。
- `filer-categories.test.ts`：封面文本解析、N−1 财年适用规则、无 N−1 → `no_rule`。
- `gold-cn.schema.test.ts`：精确乘积、重复、小数位、空 tickers。
- `calendar.test.ts`：类别解析；期限表；顺延；A 股节点；月末与 52/53 周（估计、匹配、替换）；N−1 财年类别适用；6 个期间；状态矩阵（含 `unknown_upstream`、staged filing 不算收到、`no_rule` 可 `received`）；`disclosure_date` 精确匹配与修改。
- `datasets.test.ts`；`facts-resolver.test.ts`（`resolveFactsItem` 分派穷举：采用、恢复、谱系、`reconcile_review` 只改状态、落地路径；拒绝通用翻转；`rule_failed`、`stale_evaluation` 重试、恢复禁用、`keep_fact_id`；三类新裁决的缺失/pending/failed 钩子恢复与 502 语义，T10）；`materialize.test.ts`（`--pending-hooks` 覆盖采用、恢复、谱系、对账隔离四类）；`metrics` 路由测试（谱系向量前后不一致 → `metrics:[]`、`stale:true`，T8）；路由测试（`asOf/tickerAsOf`、admin dq 新字段与 `market`、claims 顺序与 `amend`、quarantine 新字段）；`messages/parity.test.ts`。

### 9.2 数据库（`test:db`，critical）

`identifiers.integration.test.ts`、`dq-extensions.integration.test.ts`（含 `S4_TEST_STATE`，登记 `criticalSuites`）：两迁移在有数据库上升级 + 写入新证据后重放不改写；`valid_from` 更新受互斥约束；`resolve_identifier_claim` 每个 op 的成功/冲突回滚/目标不一致拒绝/非活跃发行人拒绝/`legacy`/`amend_required`/并发 409；`dq_reconciliations` 两条 kind 约束；`dq_filing_expectations` 全部约束组合；`replace_filing_expectations` 原子替换；`issuer_filing_profiles` 复合主键；`issuer_filer_categories`；`dq_reconcile_cycles` 单运行周期唯一索引与 `drc_done_accounted`；`dq_calendar_passes` 单未完成遍；`dq_freshness` weekly；`filings.accepted_at` 只允许 null→值且无角色可直写；`set_filing_acceptance`；`apply_reconcile_result` 持锁、只动围栏发行人的 `ok` 行、结果行+项+隔离+`hook:pending` 同一事务、同键第二次调用 `reused:true`、`state_rev+1`、与并发 `publish_sync_run` 串行；`complete_reconcile_member` 从已接受结果行推导计数、缺键 → `member_incomplete`；**每个提升入口**（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）都遵守 `fact_promote_rows` 新谓词（T6）；`filings` 的 `document_ref/document_url/link_attempts` 列级 update 仍可用、`accepted_at` 不可直写（T11）；**`restore_reconciled`：通过 + 哈希相等 → 项关闭且行真正提升（R1 回归）**、哈希不等 → `not_passing`、被其他 open 项引用 → `skipped`；`read_filing_facts` 返回全部代含 `quarantined`（读取器本身不过滤，绑定在调用方过滤）；`adopt_candidate` 全部码（含 `batch_mismatch`、发行人/市场取自 filing）、`stale_evaluation`、事务内 `hook` 写入、管理运行字段；`resolve_lineage_conflict` 锁定完整谱系、锁下重查、`lineage_changed`、`unresolved` 回滚、`promote_quarantined` 附加条款生效；`read_facts_lineage` 单发行人三种模式与 `read_facts` 逐字段一致、双发行人抑制与 `conflicts`、anon 只见 `ok`；`replace_financial_metrics_lineage` 成员 rev / 集合变化 / `scope_missing`、包装函数一致、`based_on_lineage` 回填；**拓扑：`issuers_topology_guard` 在全新连接上拒绝直接 update、在同一事务内 `set_merge` 成功返回后仍拒绝直接 update（S1 两项测试）、函数异常路径后设置已恢复；`set_merge` A→B 后 B→C 成功且 A 改指 C（R3 回归）、`row_count` 断言、与物化交错 → `stale_computation`；`set_dissolved` 的 `has_referrers`**；游标：`failed` 且 `attempts<3` 可认领、`attempts=3` 终态（S4）；`drc_done_accounted` 对 NULL 计数拒绝（S5）；围栏：过期/易主的尝试调用 `apply_reconcile_result`/`complete_reconcile_member`/`fail_reconcile_member` 得 `fence_failed` 且无写入；租约丢失前已提交的键被接手者复用、计数不重复（T2）；绑定：激活代内多行同键 → `left_ambiguous`，仅旧代同键 → 不歧义、按激活代绑定，`adopt_candidate` 遇仅旧代同键不报 `duplicate`（T1）；`adopt_candidate` 从持久化 camelCase 候选映射、代取自锚定运行、`mapping_version` 无留存 → `replay_required`（T5）；日历遍：第二个工作者租不到遍、全部遍函数围栏、冻结成员不受范围变化影响、失败成员重试成功只置 `done` 一次、`finish_calendar_pass` 两种终态都写 `finished_at`、过期工作者不能改动新租约者的进度（T3）；`read_facts_lineage` 非 `ok` 行 `disclosure_seq` 为空且只在 `history` 时返回（T7）；RLS 与桶策略（anon/authenticated 不可读写新表与桶）。

### 9.3 离线集成（critical）

- `ixbrl-pair.integration.test.ts`：AAPL/MSFT 夹具同步 → 全 passed；**注入改值的 companyfacts 夹具**作第二发行人 → mismatch → 隔离 → 不可见 → 物化重算 → 修正夹具重跑 → `latest_result.passed` 且 `inputs_hash` 相等 → `restore_reconciled` 恢复；未通过时恢复被拒。
- `gold-cn.integration.test.ts`（真实 Tushare/巨潮/`disclosure_date` 响应录制留存并核实后创建，合成回退禁止；F3-6 退出条件，T15）。
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
| F3-4 迁移二 + 事实扩展 | `20261107091000`（函数含 `read_filing_facts`/`set_merge`/`set_dissolved`/`apply_reconcile_result`/游标三函数、`fact_promote_rows` 附加谓词、`based_on_lineage`）、`FactsDb` 三实现扩展、`tickerAsOf`/谱系读取与物化目标、受理时刻、候选选定、分派表、拓扑触发器与 runbook 合并流程 | 计划二已落地（main，PR #102） | §9.2 第二套绿（含 R1/R3 回归）；E7；E8 | 5 |
| F3-5 美股对账 | `ixbrl.ts`、`decimal.ts`、`pairs.ts`、`run.ts`（周期/游标/认领）、样本脚本（独立枚举键）、cron、看板对账面板 | F3-4 | E4 报告与失败解释 | 4 |
| F3-6 A 股黄金集 | 清单脚本、校验器、`gold-pdf.ts`、抄录指引、夹具录制、CI 门禁、cron | F3-5；抄录人；token | E5；套件登记且绿 | 2（不含抄录） |
| F3-7 日历 | `calendar.ts`、`calendar-sync.ts`（遍）、档案写入、`filer-categories.ts`（10-K 封面类别，复用 F3-5 解析器）、两条 cron、看板日历面板与逾期卡 | F3-2、F3-4、F3-5 | E6、E9 | 4 |
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
| 落地计划二（规格二第 8 稿 + §16） | `fact_sync_runs` 列；`fact_sync_scope.state_rev`、`scope_confirmed_at` 与行锁约定；`publish_sync_run(…, p_expected_rev)`/`stale_plan`；`reconcile_fact_sync_scope(text,jsonb,timestamptz)`；`read_facts` 9 参数信封（非 `ok` 行无序列字段）；`fact_state_rev()`；`fact_promote_rows`（本规格**附加**两条谓词）、`promote_quarantined`、`resolve_facts_quarantine`；`replace_financial_metrics`（改为包装，签名不变）；`filings_limited_update` 与三列列级 update；`FactsDb`（本规格扩展方法）；`resolveFactsItem`（本规格扩展分派）；`FactCandidate` 持久化形状；`facts.us/facts.cn` 数据集标识；`FACT_CONCEPTS`（35）、`units.ts`、规范十进制形式；巨潮挂接写入 `filings.document_ref`（只作关联，不作原始年报证明）；`FACTS_CN_ENABLED` 门控；`plan2.json` `ready:false` | 2026-11-05 第五轮按落地代码核对（`06-codex-round5.md`）；第 6 稿已对齐 |
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
8. ~~规格二巨潮挂接的 `document_ref` 与黄金集 `cninfo_announcement_id` 的格式是否一致~~：第 6 稿起左侧绑定改用核实的 `tushare_source_ref`（§5.4，T14），`document_ref` 只作交叉核对。
9. SEC submissions `filings.files[]` 分页的实际结构。
10. 规格二 `fact_sync_scope` 行在 `set_merge` 时对未进入范围的发行人是否允许 `priority=0` 占位行（本规格假定允许）。

---

## 15. 实施记录与偏差

实施计划：`docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md`；实施日志：`docs/audits/2026-11-05-data-foundation-3/implementation-log.md`；核对记录：`docs/audits/2026-11-05-data-foundation-3/verification.md`；运行手册：`docs/runbooks/data-foundation.md` 第 9 章。

预先登记的接受限制：52/53 周申报人的期末为估计值直至收到申报，且估计行不计逾期；对账右侧不确定性只按印刷/标注精度建区间，且舍入印刷的不一致不自动隔离；换码生效日只来自人工声明，脚本只记观测界。

本节列出实施中与正文不一致之处；未列出者无偏差。来源：实施日志各任务行、计划"接口对齐记录"#69–74（执行期指挥者裁决）、实施期遗留清单。

### 15.1 数据模型与 SQL

迁移一/二在合并前原地修改（锁文件 sha 随之更新）；下列函数/列为规格 §3.1 清单之外的新增或改签名。

| 条款 | 偏差 | 原因 | 位置 |
|---|---|---|---|
| §3.1 函数清单 | 新增 `set_security_window`（持有区间与 delisting 回填）、`patch_security_provenance`、`close_security_absent`（换码关闭，标记校验）、`set_issuer_identifier`、`set_security_identifier`（守卫写 ISIN/FIGI，同一 UPDATE 按键合并 provenance）、`append_claim_evidence`、`patch_quarantine_detail`（行锁 jsonb 补丁，带 `p_expect_hook_at` CAS） | Codex 审计：读后整体替换丢并发证据/覆盖较新结果、provenance 覆盖丢失、钩子完成覆盖新 pending | 迁移一，`src/lib/db/table-client.ts::callRpc` |
| §3.2 `resolve_facts_quarantine` | 对 `reconcile_mismatch`/`lineage_conflict` 拒绝（22023 `use_dedicated_resolver`），路由映射 409；`restore_reconciled`/`resolve_lineage_conflict` 另映射 `target_not_active`（P0001）等错误码 | 通用入口会绕过恢复哈希与谱系裁决 | 迁移二、`facts-resolver.ts`、quarantine 路由 |
| §3.2 周期 | 迁移二新增 `settle_reconcile_cycle`、`record_cycle_freshness`、`open_reconcile_cycle(p_pair,p_cycle_id,p_started_at,p_members,p_pending)`；`pending_members` 元素为 `{issuer_id,market,source}`；`dq_reconcile_cycle:<pair>` advisory 锁必须先于任何行锁（`set_merge` 最先取，`set_dissolved` 不取） | 计划审计 Q2/R1：建周期丢并发登记、与合并死锁 | 迁移二 §12–14、接口对齐记录 #64、#66 |
| 接口对齐 #73 | `replace_filing_expectations` 改 5 参 `(p_issuer,p_market,p_rows,p_pass_token,p_profile jsonb default null)`，旧 4 参删除；档案在令牌/租约/成员校验后同事务 upsert，TS 不再单独写档案 | 档案写入绕过日历遍栅栏（Codex 18a P2） | 迁移一 |
| 接口对齐 #74 | 新增 `dq_reconcile_failed_counts() returns table(pair,failed)`（`distinct on (pair,natural_key)` 取最新行）与索引 `dq_reconciliations_pair_key_latest_idx`；`restorable` 实时核对每次加载至多 25 次、并发 4、按请求记忆，超限行 `restorable:false, restorable_checked:false` | 每次看板加载下载全部对账历史（Codex 19a P2） | 迁移一、`/api/admin/dq` |
| §3.2 `fact_promote_rows` / 守卫测试 | 迁移二重放全套件用串行化咨询锁；重放事务 `deadlock_timeout=50ms`；拓扑守卫测试改用无引用方新发行人 | 并发测试死锁、测试隔离 | `*.integration.test.ts` |
| §4.1.2 raw 桶 | `reconcile-raw` 桶与 `RawContentType` 增 `application/vnd.ms-excel`→`xls` | HKEX 两份名单是 OLE `.xls`，不是 xlsx（实测） | 迁移一、`raw-store.ts` |

### 15.2 日历（F3-7）

| 日期 | 条款 | 偏差 | 原因 | 位置 |
|---|---|---|---|---|
| 2026-11-05 | §6.1 封面类别解析顺序 | 先判 "non-accelerated"，再 "large accelerated"，再 "accelerated filer"；不识别无连字符 "nonaccelerated"（SEC 封面均为 "Non-accelerated Filer"） | "Non-accelerated Filer" 也含 "accelerated filer"，按正文顺序会误判 | `src/lib/dq/filer-categories.ts` |
| 2026-11-05 | §6.1 "最近 6 个已结束报告期" | 先按适用报告种类过滤再取槽：10-K/CN 以年报月为锚的季度槽；20-F/40-F 只有年报，槽距 12 个月（接口对齐 #62） | 计划审计 P6：年报-only 发行人也得 6 个已结束期 | `calendar.ts::computeExpectations`、`filingsWindowStart` |
| 2026-11-06 | §6.1 52/53 周估计 | 下一期估计 = 上期实际 + 364 天 = c，在 {c, c+7} 中取离年度锚月月末更近者（平局取 c）；锚月经 `nearestMonthEnd` 归一；回退锚（无已收年报）同样归一；先把上游证据配到槽再选 6 个已结束槽（接口对齐 #69–71）。计划原文"出锚月再 +7"对次月月初结账者错 7 天 | 17a 质量审查与 Codex P2 | `calendar.ts` |
| 2026-11-05 | §6.1 "最近观测到的同类实际 period_end" | 观测集合 = 已收到的 filing ∪ SEC submissions 同 form 的 `reportDate`；无观测 → 该槽月末作估计；锚月以最近一份已收年报的实际期末优先于 `fiscalYearEnd`，不一致标 `detail.fye_mismatch` | submissions 是一手来源 | `estimatePeriodEnd` |
| 2026-11-06 | §6.1 Rule 0-3 | `SEC_HOLIDAYS` 覆盖 2021–2027（OPM 观察日）+ `SEC_CLOSURES`；表外年份 `no_rule`（`none.holiday_table_missing/1`）；`rollForward` 超出 15 天上限抛错（#72）。**2021–2025 未经 OPM 复核**（OPM 页面只列当前及后续年份），`SEC_CLOSURES` 的 2025-01-09 未证实 | 不猜日期；20-F 早期财年不应落 `no_rule` | `calendar.ts`、`verification.md` |
| 2026-11-05 | §6.1 20-F "财年末后 4 个月" | 月末期末 → 4 个月后的月末；非月末 → 同日（超出月长取月末） | 正文未定义 | `addMonthsAnchored` |
| 2026-11-05 | §6.1 US `upstream_lookup` | 按期间判覆盖（#65）：`最早 filingDate < period_end` 为已覆盖；未覆盖但有正证据的行保持原行，未覆盖且无证据的 `pending`/`overdue` 行改 `unknown_upstream` + `upstream_incomplete` | 一个老期间不应拖垮全部行 | `applyUpstreamCoverage` |
| 2026-11-06 | §6.1 CN `disclosure_date` | 先以 `CN_DISCLOSURE_VERIFIED=false` 门控；2026-11-06 用真实 Tushare 响应（600519.SH、000333.SZ，TUSHARE_TOKEN 已可用）核对 `actual_date`=实际披露日、`modify_date`=预约修订时间戳、`ann_date`=预约记录日后翻 `true`。响应缺列/`data:null` → `bad_shape`，`has_more` → `unavailable`；**无排期行的 CN 槽保持 `unknown_upstream`，不按法定期限判 overdue**（取代 18b 初版的相反行为）。北交所未抽查 | 正文要求真实响应核实语义；offset 分页在并列行上不稳定 | `calendar-sync.ts`、`verification.md` |
| 2026-11-05 | §6.2 档案 | submissions 不可用时用已存档案计算（行均 `unknown_upstream`）；无档案 → 不出行（回执 `no_profile`） | 期限规则只依赖档案与类别 | `calendar-sync.ts` |
| 2026-11-05 | §6.2 cron | CN 日历 cron 不受 `FACTS_CN_ENABLED` 门控 | 日历只计算法定节点并如实显示不可查 | `filing-calendar/route.ts` |
| 2026-11-05 | §7 看板行 | 日历行 `detail.display={ticker,name}` 由写入端提供 | `TableClient` 无联表 | `calendar-sync.ts`、`dashboard-blocks.ts` |
| 2026-11-06 | 预览 | `--no-db`/预览模式的原始响应经注入的内存 raw store，不碰生产桶 | Codex 18b P2 | `calendar-sync.ts` |

已知限制：（1）52/53 周申报人（Costco 12/12/12/16 周）10-Q 期末不按月末网格，日历规则对其季报期望偏差可达约 3 周，10-Q 行可能停在 `pending`，年报不受影响（2026-11-07 冒烟实测 COST 第三季度差 21 天，见 `verification.md`）；（2）`issuer_filer_categories` 无可排序列（仅 `as_of`=运行日），并发两个 filer-categories 运行时较旧快照可能覆盖同财年较新 10-K 的类别，后续项为加 `accepted_at`/`filing_date` 列与条件写。

### 15.3 标识符、事实扩展、对账（F3-1…F3-6）

| 条款 | 偏差 | 原因 | 位置 |
|---|---|---|---|
| §4.1.1 HKEX 名单 | 工作表声明的 `<dimension>` 是 `A1:R8`（实际 `A1:R17083`），以 `nodim:true` 读取；ISINs-assigned 两份 `.xls` 列名为 `HK Stock Code`/`Stocks`；占位值（`Not Available` 等）= 无 ISIN 不计拒绝；合并后 16 个 `-OLD` 并行柜台剔除（`superseded_counter`） | 实测表头 | `parseHkexList`、`mergeHkexIsins` |
| §4.1.2 OpenFIGI | 无 API key 实测，`EXCH_MAP_VERIFIED=true`；腾讯 ISIN 另映射 `80700.HK`/`TCTZF`，适配器不选场所，调用方按待挂接 ticker 取候选；`OPENFIGI_API_KEY` 不可用，生产按 25 请求/分钟 | 决策 A 前的无 key 路径 | `openfigi.ts`、`verification.md` |
| §4.1.5 / 规格一 §3.2 | A 股 ISIN 不由代码推导（规格一 ISIN 行已标"已撤回"） | NSIN 与证券代码无函数关系 | 规格一 §3.2 |
| §4.2 A+H 配对 | 自动挂接只凭 HKEX ISIN；其余（LEI/名称规则）一律 claim/隔离；HKEX 名单用简称，规则 2 命中率低（5 家抽查 2 家相等） | 精度优先；`-OLD` 柜台不得自动挂接 | `link-ah.ts`、`verification.md` Task 7a |
| §4.3.3 submissions | `fetchSubmissions` 合并分页，全进程单一 SEC pacer（`secPacer`，120 ms）也覆盖 companyfacts 与 iXBRL 对；`recent` 条数不固定（AAPL 1,004） | SEC 限速 | `shared.ts` |
| §4.4/§4.5 受理时刻 | 不可解析项（日期不符/歧义/未找到）为信息码不计 `failed`；默认 3 年回看（`--full-history` 解除）；以 `coverFrom` = 最早待补日 − 7 天抓分页；`sec.filing_date_vs_submissions` 的记录器经 `deps.ts` 与脚本接上；**E7 实测需生产库，未跑，owner 动作** | 命令官裁决（Task 12） | `enrich-acceptance.ts` |
| §4.5 / Task 12–14 | 对账记录（`recordReconciliation`）去重是尽力而为：并发写者可能重复记录 record-only 行，无业务影响；失败计数按对的 distinct `natural_key` 计 | 接受的并发重复 | `record.ts`、#74 |
| §5 `fact_promote_rows` 之外的分派 | 见规格二 §15 分派例外。`restore_reconciled` 只提升一个发行人的行：reconcile_mismatch 项不跨谱系（经 `use_dedicated_resolver`/`target_not_active` 守卫；未做跨谱系场景的额外证明） | Task 8c 遗留项 | 迁移二 |
| §5.2 US 黄金对 | 绑定 ticker 在 entry `as_of`（缺省今日）的持有人；无 `as_of` 的条目只记录不隔离；冻结条目变更 → `entry_changed`；谱系冲突延缓只针对参与事实；同键同日出现在同一目标的 US+CN 时 `lineage_key_collision`（文档化限制） | 历史条目不应按今日解析持有人 | `pair-us-gold.ts`、`pair-lineage.ts` |
| §5.3 iXBRL 对 | 标签回退不一致 → `review_item`（不隔离）；左侧 `precision` 不保留（null）；429 → `sec_rate_limited` 运行失败；失败体入桶；`doc_url` 无查询串；字节上限在下载时强制 | Codex 15a 审计 | `pair-us-ixbrl.ts` |
| §5.4 CN 黄金对 | 交付模式、校验器、对账对、`select-cn-sample.ts`、`gold-pdf.ts`、抄录指引；**不建黄金文件与 `gold-cn.integration.test.ts`、无 CN 对账 cron**。降级条件现仅为 owner 决策 C（`TUSHARE_TOKEN` 已可用，PR #104 的真实 Tushare 夹具已并入）；E5 未达成，不报数字 | T15 | `verification.md` F3-6 |
| §3.2 接受/采用 | `ambiguous_value` 采用：全谱系锁与冲突检查；`readFacts` 带 `history:true`，`truncated` → `read_truncated`（#60）；`batch_mismatch` 恢复为 500 | Codex 8b/11 | `facts-resolver.ts` |
| §7 看板失败计数 | 离开样本的键保留其最后一次失败计数（Task 19a），样本变更后需 owner 注意 | `distinct on` 最新行语义 | `dq_reconcile_failed_counts()` |
| 性能 | `loadReconciliationsByPair`（若仍被使用）读每对的全部 `dq_reconciliations` 行；失败计数已由 SQL 聚合替代，其余消费者随表增长无界，后续改 SQL 视图/RPC | 当前量级可行 | `dashboard-blocks.ts` |

### 15.4 看板（F3-8）

| 日期 | 条款 | 偏差 | 原因 | 位置 |
|---|---|---|---|---|
| 2026-11-05 | §10 F3-3 "claims 面板" | 声明面板与其 i18n 在 Task 19b 实现（不在 Task 7） | 与其他 `/admin/dq` 面板同一画布、同一任务 | `src/app/(app)/admin/dq/panels.tsx` |
| 2026-11-06 | §7.2 "通过且输入未变时恢复可用" | 页面按 `latest_result.passed` 启用；"输入未变"由服务器在请求时校验（409 `not_passing`） | 客户端无法计算当前输入哈希 | `dashboard-view.ts::quarantineControl` |
| 2026-11-05 | §9.1 i18n parity 路径 | 实际为 `src/i18n/messages-parity.test.ts` | 仓库既有位置 | — |
| 2026-11-07 | E9 | 页面按画布 7 个 artboard 落地；**未在浏览器运行**（本 worktree 无 `.env.local`/管理员会话），人工视觉验收是 owner 动作 | 环境 | Task 19b 日志 |

### 15.5 未达成的退出条件

见实施日志"Task 20 收尾"退出条件表：E1/E2/E4/E6/E7 需 owner 首轮运行（生产库）后取数；E5 未达成（决策 C，不报数字）；E9 人工视觉验收待 owner。
