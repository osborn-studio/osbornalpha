# 行业研究模块设计规格 · 分类成分 + 行业聚合事实 + 行业估值 + 页面

日期：2026-11-04（第 3 稿。审计轨迹 `docs/audits/2026-11-04-industry-research/`：01 Codex 一轮（13 项）、02 Codex 二轮（R1–R13 复核 + N1–N6 新项）、03 处置表。两轮上限已用完；Codex 二轮判定"尚不可进入计划"，第 3 稿逐项处置后待 owner 评审与一次独立 Claude 复审（§15））
状态：草案，待 owner 评审（§16 七项决策；A（Tushare/申万授权）、E（A 股事实公开宇宙）、G（历史重建期的展示）决定本规格能否进入计划）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一；§1.2 把分类加载与授权交给本规格；§14 为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二**第 8 稿**：`fact_sync_runs`、`read_facts` 信封 `{state_rev, rows, truncated}`、`fact_state_rev()`、`derive.ts` 版本一致性规则、`reconcile_fact_sync_scope`）；`docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md`（规格三：`resolveIssuer(asOf)`、`valid_from_method/valid_to_method`、`tickerAsOf`；其 §1.2 把 **A 股全宇宙发行人装载**归到本规格）；`docs/superpowers/specs/2026-11-04-judgment-framework-design.md`（F4 §3.5：`InputRef{kind, ref, snapshot, hash=digest(snapshot), available_at, origin}`，`table_rows` 快照 `{table, natural_key, rows}`，公共表白名单）；`docs/superpowers/specs/2026-11-04-company-research-design.md` §10.5；`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（UI 约定）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。逐条对照：

| 总纲约束 | 本规格的落点 |
|---|---|
| 1 只用一手来源；Tushare 仅作适配器并记录上游；对方数据一律不导入 | §4.1：SIC 来自 SEC `submissions`（一手）；申万 2021、收盘价/总股本、申万指数估值三组数据经 Tushare 适配，上游分别记"申万宏源研究所""交易所""申万宏源研究所"，每组数据有独立的授权状态行，授权在数据库层执行（§4.8）；证监会 2017Q2–2021Q3 PDF 只作人工对照；对方 31×10 热力图只作私有回归样本 |
| 2 每个展示数字可回放 | 每个单元格有**内容寻址、不可变的输入清单**（成分证据含定位与可得日期、事实含 filing/原始哈希/映射代/状态版本、标记含观测版本、每个发行人在每个指标里的角色、方法配置与代码版本）；`replayFromManifest()` 纯函数只用清单就能重算出该格（§5.3）；接口分"原样回放"与"按当前证据重算"，且回放授权与发布状态一致（§9） |
| 3 事实与判断分层 | 行业聚合、估值序列、分位数是事实/派生统计；生命周期、景气、高估低估是判断，走 F4（§7） |
| 4 缺失就是缺失；时点成分；聚合方法显式 | 不做占位/代理；每格 `n_members / n_with_data / n_unresolved` 与 `status ok|missing(+reason)`；成分按"`period_end` 当日有效且 `knowledge_date` 已知"取（§4.6 的时间估计对象）；SIC 无历史因此不聚合；历史重建期（§4.6）必须打 `reconstruction` 标记（owner 决策 G 决定显示或抑制）；方法名与版本进每一行 |
| 6 UI tokens；双语；表格等价视图 | §8 |

已定决策（owner 2026-11-04）：港股延后到 F3；美股事实 EDGAR；A 股事实 Tushare 三表；本规格不引入判断模型。

---

## 1. 目标与非目标

### 1.1 目标

1. **A 股全宇宙发行人与两套分类落地。** `a_stock` 宇宙每个活跃证券有发行人（硬键：巨潮 orgId，§4.7，规格三 §1.2 指派）；申万 2021 版（三级、纳入/剔除日期）与 SEC SIC（四位码、仅当前值）装入规格一的两张表；来源记录（`industry_source_memberships`）与解析后的归属分离，每条归属带来源记录 id、原始快照哈希、行定位、可得日期与可得日期假设。
2. **行业级财务聚合成为可回放的派生事实。** 以"`period_end` 当日有效、`facts_as_of` 已知"的成分与 `facts_as_of` 可见的披露计算整体法指标；每格一份内容寻址清单，仅凭清单可离线重算；期望网格内每格要么有值要么有缺因。
3. **行业估值序列与分位。** 申万一级行业，交易所收盘价 × 公司总股本（经 Tushare `daily_basic`，观测版本化）与披露事实计算整体法 PE/PB；按 (行业, 指标) 序列资格 + 逐日对照两级门控发布。
4. **页面。** 列表 → 详情 → 成分 → 公司页；每个数字有来源抽屉；缺失、覆盖不足、未解析、未对账、未授权、历史重建六种状态显式；zh/en；图有表格视图；判断只经 F4。

成功标准（退出条件；"熟悉仓库的高级工程师"口径）：
- `stock_basic` 活跃 A 股每个 ts_code 要么有发行人当前证券行，要么在回执/隔离中有原因；`index_member_all` 全量记录数 = `industry_source_memberships` 当前记录数（去重后）+ 隔离数；每条当前来源记录要么解析为三行归属，要么在 `n_unresolved` 口径内可数。
- 申万节点数与 `index_classify` 响应逐条一致（文档值 31/134/346 仅作预期）。
- 三宇宙每个有 CIK 的活跃美股发行人有 `sic` 归属行或 `skipped_summary(no_sic|sec_unavailable)`。
- 活跃聚合运行：期望网格（L1 代码 × 期间 × 指标）每格有 `status='ok'` 行或 `status='missing'` 行（带原因）；`replay?mode=original` 对活跃运行 100% `ok` 格返回清单，`replayFromManifest(清单)` 结果与存储值相等（CI 离线夹具 2 行业 × 4 期，且测试删除数据库后仅凭清单重算；生产每周抽样 50 格）。
- 估值：对每个 (行业, 指标) 先过序列资格（§6.4），再逐日 `pair_status='within'` 才 `published=true`；其他日期不对外。
- 授权门：`industry_dataset_licenses` 未置 `public` 的数据集，anon/authenticated 直查表得 0 行；置 `public` 后可见；撤回后 0 行（真实角色测试）；`/replay` 对未发布格返回 404。
- 三条路由 E2E 通过；`industries` 域对等测试通过；DESIGN.md 审查通过；断网运行任一同步：批次 `failed`，旧数据不变，连续两次后新鲜度 `error`，页面显示旧 run + 徽标。

### 1.2 本规格之外

- 港股分类与成分；GICS；中证分类与估值；申万二级/三级的聚合与估值（v1 只做一级）。
- **美股行业聚合与估值**：SIC 只有当前值，无一手历史来源，不做"用今天成分算历史"；v1 SIC 只提供分类导航、成分列表、公司页芯片。
- **PS**：无官方对照、未定义输入契约，v1 不计算、不存储（二稿的"算而不发布"撤回）。
- 判断模型：F4；§7 只定义输入适配与方法入口。
- `industry_tags`、产业链图谱、替代数据：另立规格。
- 对方站点任何数据的导入；日内精度；A 股发行人 USCI/LEI 填充（规格三 `fill-identifiers` 扩展，§17.5）。

---

## 2. 现状（2026-11-04，计划一落地、规格二第 8 稿、规格三/F4 草案后勘察）

| 领域 | 现状（文件） | 本规格如何使用 |
|---|---|---|
| 分类表 | `20261105091000_issuers.sql:153–184`：两表定义；排他 `no_overlap` 只对同 code；`btree_gist` 已建（第 18 行）；两表 `grant select to anon, authenticated` + `using (true)`（第 191–200 行） | 迁移扩展并**替换**公共读策略为授权门策略（§4.3、§4.8） |
| 发行人 API | `merge.ts:4` `HARD_IDS=['lei','cik','usci']`，`matchIssuer` 无硬标识符抛 `no_hard_identifier`；`issuers.ts:41–54` `candidatesFor` 只按硬标识符查；`securities.ts:40–44` `attachSecurity` 对同发行人重叠窗口返回 `duplicate`，不回填更早 `valid_from`；`fileClaim`（`claims.ts`） | A 股 orgId 装载**不走** `upsertIssuerByIdentifiers`，用本规格 §4.7 的专用路径；证券窗口回填交规格三 |
| Tushare | `tushareCall`；规格二 `tushareCallRaw`；`stock_basic` 字段（`tushare-a.ts:5–8`）含 `fullname, list_status, list_date, delist_date`；本机无 token | 适配器用 `tushareCallRaw` |
| Tushare 行业/行情接口（2026-11-04 核对官方文档） | `index_classify`（`level`、`parent_code`、`src` SW2014/SW2021 默认 2014；字段 `index_code, industry_name, parent_code, level, industry_code, is_pub, src`；2000 积分）；`index_member_all`（`l1_code/l2_code/l3_code/ts_code/is_new`；字段 `l1_code,l1_name,l2_code,l2_name,l3_code,l3_name,ts_code,name,in_date,out_date,is_new`；单次 2000 行；2000 积分；版本未写明）；`sw_daily`（默认 2021 版；字段 `…pe,pb,float_mv,total_mv`；单次 4000 行；5000 积分；pe/pb 口径未写明）；`daily_basic`（`close, total_share(万股), total_mv(万元)…`；单次 6000 行；2000 积分；`total_share` 是否含 H/B 股未写明）；`trade_cal` 字段本规格未核对 | §4.4、§6；未写明项为 §16 核对项，I-3 前置 |
| SEC | `collectors/edgar.ts:35` 已用 `submissions`；本次核对 AAPL 响应含 `sic=3571`、`sicDescription`、`fiscalYearEnd=0926`；SIC 码表页显示三位码需左补零 | §4.4 |
| 巨潮 | `collectors/cninfo.ts::resolveOrgId(code)` → `{orgId, name, category}` | §4.7 |
| 证监会 | 2017Q2–2021Q3 季度 PDF，最新 2021-11-10 | 仅 §15 |
| 规格二第 8 稿 | `read_facts` 信封、10,000 行上限、`fact_state_rev()`；`derive.ts` `q_single_*`/`ttm_*` 只对 revenue、net_income_parent、operating_income、operating_cash_flow、capex(_incl_intangibles)；`roe`、`gross_margin`；`publish_sync_run` 每次发布 `state_rev + 1`（含只有重复行的运行）；范围默认研究队列（决策 A）；决策 C（CN 事实公开可见性） | §5 只用已有派生；`state_rev` 作复用键之一（§5.4，接受复用率低）；决策 E 与 C 的衔接见 §4.10 |
| 质量设施 | `startBatch/finishBatch`、`quarantine()`、`recordAttempt`；`dq_freshness.expected_cadence` CHECK 只允许 `daily/monthly/quarterly/event`（`20261105090000_dq_foundation.sql:76`），`freshness.ts:9–14` 同 | 本规格迁移改 CHECK 加 `weekly` 并改 `freshness.ts` |
| `TableClient` | 无事务、无 rpc | `IndustryDb`（§4.9） |
| 行情 | 无落库收盘价/市值历史 | `security_marks`（§6.1） |
| 页面/i18n/cron/迁移 | 同第 2 稿：`intel/page.tsx`、`TabBar startsWith('/intel')`、`middleware.ts` session 门禁、`MESSAGE_DOMAINS`、`messages-parity.test.ts` 硬编码四域、`vercel.json`、锁到 `20261105091000`、规格二占 `20261106090000` | 本规格 `20261107090000_industry_research.sql`（实施时按合并顺序重排时间戳） |

---

## 3. 对方页面元素清单与分类

（与第 2 稿相同，摘要）：#2 财务热力图 → 事实（v1 §5）；#5 PE/PB/PS 分位 → 事实序列 + 派生统计（v1 PE/PB，§6；PS 不做）；#1/#3/#6/#7/#9 生命周期、阶段分布、高估低估、细分矩阵、选股表 → 判断（F4）；#4 景气雷达（估值 50 占位、现金流代理）→ 不复制，只展示事实维度；#8 Gartner → 不做；#10 索引 → 分类树导航 + 成分 + 公司页；#11 页脚来源 → 每个数字的来源抽屉。

---

## 4. 发行人、分类、成分与授权

### 4.1 方案与数据集一览

| 数据集键（`industry_dataset_licenses.dataset_key`） | 内容 | 一手来源 | 适配器 | 历史 | 用途 | 默认授权 |
|---|---|---|---|---|---|---|
| `scheme:sw2021:2021` | 申万 2021 三级分类与成分 | 申万宏源研究所 | Tushare `index_classify`/`index_member_all` | `in_date`/`out_date`；2021 版前日期语义待核对（核对项 3） | 导航、成分、聚合、估值 | `internal`（决策 A） |
| `scheme:sic:sec-current` | SIC 四位码（SEC 当前展示的码表快照） | SEC `submissions` + SIC 码表页 | 直接 HTTP | 无；`valid_from=观察日` | 导航、成分、芯片；**不聚合** | `public`（迁移写入） |
| `marks:tushare-daily_basic` | 证券级收盘价/总股本 | 交易所 | Tushare `daily_basic` | 观测版本化（§6.1） | 估值输入；不单独对外 | `internal`（决策 A 同时裁定） |
| `official:tushare-sw_daily` | 申万一级指数 pe/pb/市值 | 申万宏源研究所 | Tushare `sw_daily` | 日频 | 对账基准；抽屉"官方对照值" | `internal`（决策 A） |
| `csrc:2012`（不入库） | 证监会季度分类 PDF 2017Q2–2021Q3 | 证监会 | 人工抄录 | 截止 2021Q3 | §15 对照 | — |

### 4.2 `industry_classifications` 加载

同第 2 稿：`sw2021` 三次 `index_classify`，`code=index_code`，`parent_code` 命名空间在夹具核对（不符 → 经同批映射转换并写 `attributes`，映射失败隔离 `classification_parent_unmapped`）；`sic` 码表夹具，左补零；节点只增不删，名称冲突隔离。

### 4.3 迁移 `supabase/migrations/20261107090000_industry_research.sql` —— 完整对象清单

可重放：约束/策略/索引 `drop … if exists` 后建或 `if not exists`；函数 `create or replace`。锁文件、`database.types.ts` 补齐。

**改动既有对象**

| 对象 | 改动 |
|---|---|
| `industry_classifications` | `scheme` CHECK 加 `'sic'`；`attributes jsonb not null default '{}' check (jsonb_typeof(attributes)='object')`；`create unique index if not exists industry_classifications_code_level_uidx on (scheme, version, code, level)` |
| `issuer_industry_memberships` | 新列：`level int not null check (level between 1 and 4)`、`available_date date not null`、`valid_to_available_date date`（`check ((valid_to is null) = (valid_to_available_date is null))`）、`source_membership_id uuid references industry_source_memberships(id)`（SIC 行为 null）、`batch_id uuid not null references ingest_batches on delete restrict`、`status text not null default 'ok' check (status in ('ok','quarantined'))`；复合 FK `(scheme, version, code, level) → industry_classifications(scheme, version, code, level)`；排他 `issuer_industry_memberships_one_per_level exclude using gist (issuer_id with =, scheme with =, version with =, level with =, daterange(valid_from, valid_to, '[)') with &&) where (status='ok')`；gist 索引 `(scheme, version, code, daterange(valid_from, valid_to, '[)'))`；触发器 `issuer_industry_memberships_lifecycle`（`update` 只允许 (a) `valid_to` null→日期（`> valid_from`，同时写 `valid_to_available_date >= valid_from`），(b) `status` 翻转，(c) `provenance` 只增键；`delete` 禁止；`23514`，前缀 `append_only:`）；替换策略 `"issuer_industry_memberships public read"` → `"licensed read"`（§4.8） |
| `industry_classifications` 策略 | 同上替换为 `licensed read` |
| `issuers` | `create unique index if not exists issuers_cninfo_org_id_uidx on issuers(cninfo_org_id) where cninfo_org_id is not null`（§4.7 的硬键） |
| `dq_freshness` | `alter table … drop constraint if exists dq_freshness_expected_cadence_check; add constraint … check (expected_cadence in ('daily','weekly','monthly','quarterly','event'))`（约束名以实际为准，迁移里用 `pg_constraint` 查名）；`freshness.ts` 加 `weekly`（窗口 7 天、宽限 2 天） |

**新表**（全部先 `revoke all from public, anon, authenticated`，再按"读"列授权；service_role 读写除注明外）

```
industry_dataset_licenses
  dataset_key text primary key, status text not null check (status in ('internal','public')),
  decided_by text not null, decided_at timestamptz not null default now(), note text
  -- 读：仅 service_role（策略经 security definer 函数读取）
  -- 迁移插入 §4.1 四行

industry_source_memberships                       -- 来源记录（不可变导入证据），§4.4
  id uuid primary key, scheme text not null, version text not null, source text not null,
  ts_code text not null, name text, l1_code text not null, l2_code text not null, l3_code text not null,
  in_date date not null, out_date date,
  observed_at timestamptz not null, batch_id uuid not null references ingest_batches on delete restrict,
  raw_hash text not null, locator jsonb not null,
  status text not null check (status in ('current','superseded')), superseded_by uuid references industry_source_memberships(id),
  issuer_id uuid references issuers(issuer_id),      -- 解析结果；null = 未解析
  resolution jsonb not null default '{}'            -- {method:'today'|'as_of', resolved_at, as_of}
  unique (scheme, version, source, ts_code, l3_code, in_date, status) where status='current'   -- 以 partial unique index 实现
  index (scheme, version, l1_code, status), index (issuer_id)
  -- 读：仅 service_role（公共只经 n_unresolved 计数与 admin 路由）

security_marks                                    -- §6.1（观测版本化）
  ticker text not null references stocks_universe(ticker) on delete restrict, trade_date date not null,
  observed_date date not null,                      -- 本次观测（抓取）日期
  close numeric not null check (close > 0), total_share numeric not null check (total_share > 0),
  market_cap numeric generated always as (close * total_share) stored,
  source text not null, upstream text not null check (upstream in ('sse','szse','bse')),
  raw_hash text not null, locator jsonb not null,
  batch_id uuid not null references ingest_batches on delete restrict,
  status text not null default 'ok' check (status in ('ok','quarantined','superseded')),
  supersedes_observed_date date, created_at timestamptz not null default now()
  primary key (ticker, trade_date, observed_date); index (trade_date, status)
  -- 读：anon/authenticated 经 licensed read（dataset 'marks:tushare-daily_basic'）且 status='ok'

industry_official_valuations                      -- §6.2
  scheme, version, code, trade_date, metric text check (metric in ('pe','pb','total_mv','float_mv','close')),
  value numeric not null, observed_date date not null, source text, upstream text, raw_hash text, locator jsonb,
  batch_id uuid not null references ingest_batches on delete restrict, status ('ok'|'superseded')
  primary key (scheme, version, code, trade_date, metric, observed_date)
  -- 读：仅 service_role（抽屉中的"官方对照值"由路由在 published 格上附带，经 service_role 读取并只返回该格对应的一个值）

industry_manifests                                -- 清单索引（内容寻址，§5.3）
  manifest_hash text primary key, kind text check (kind in ('aggregate','valuation')),
  byte_length int not null, created_at timestamptz not null default now()
  -- 读：仅 service_role

industry_metric_runs                              -- §5.4
  run_id uuid primary key, scheme text not null, version text not null, level int not null,
  generation bigint not null,                       -- 同 (scheme, version, level) 单调递增，创建时 = max + 1
  facts_as_of date not null, knowledge_date date not null,          -- v1 二者相等
  history_class text not null check (history_class in ('point_in_time','reconstruction')),
  method_version text not null, config_hash text not null, formula_version text not null, code_version text not null,
  expected_grid jsonb not null,                     -- {codes[], period_ends[], metrics[]}
  inputs_watermark bigint not null,                 -- 本 run 看到的 max(state_rev)
  reused_from_run uuid references industry_metric_runs(run_id),
  batch_id uuid not null references ingest_batches on delete restrict,
  status text not null check (status in ('building','active','superseded','failed')),
  coverage_summary jsonb not null default '[]', created_at timestamptz not null default now(), activated_at timestamptz
  unique (scheme, version, level, generation)
  create unique index … industry_metric_runs_active_uidx on (scheme, version, level) where status='active'
  -- 读：licensed read（scheme 数据集）且 status='active'

industry_metrics                                  -- 一格一行，含缺失格
  run_id uuid not null references industry_metric_runs on delete cascade,
  code text not null, metric text not null, period_start date not null, period_end date not null,
  duration text not null check (duration in ('3M','12M','TTM','INSTANT')),
  status text not null check (status in ('ok','missing')), missing_reason text,
  value numeric, value_text text generated always as (value::text) stored, unit text not null,
  n_members int not null, n_with_data int not null, n_unresolved int not null,
  manifest_hash text references industry_manifests(manifest_hash),   -- ok 行必填
  check ((status='ok') = (value is not null)), check ((status='ok') = (manifest_hash is not null)), check ((status='missing') = (missing_reason is not null))
  primary key (run_id, code, metric, period_start, period_end)
  index (code, metric, period_end desc)
  -- 读：licensed read 且 industry_run_is_active(run_id)

industry_valuation_runs                           -- §6.4
  run_id uuid primary key, scheme, version, level, generation bigint not null,
  method_version, config_hash, formula_version, code_version,
  expected_dates jsonb not null,                    -- 由交易日历生成的 MARK_DATES
  comparator_basis text not null check (comparator_basis in ('ttm','static','unknown')),   -- 核对项 1 的结论
  recompute_from date not null,                     -- 本 run 重算的最早日期；更早日期从上一 run 承接
  carried_from_run uuid references industry_valuation_runs(run_id),
  batch_id, status ('building'|'active'|'superseded'|'failed'), reconciliation jsonb not null default '{}', created_at, activated_at
  unique (scheme, version, level, generation); 活跃唯一 partial unique index
  -- 读：licensed read 且 active

industry_valuations
  run_id uuid not null references industry_valuation_runs on delete cascade,
  scheme, version, code, trade_date date, metric text check (metric in ('pe_ttm','pe_static','pb','market_cap')),
  status text not null check (status in ('ok','missing')), missing_reason text,
  value numeric, value_text generated, facts_as_of date not null,
  n_members int, n_with_data int, n_unresolved int, mcap_coverage numeric check (mcap_coverage between 0 and 1),
  manifest_hash text references industry_manifests,
  pair_status text not null check (pair_status in ('within','outside','no_official','no_computed','invalid_denominator','not_applicable')),
  official_value numeric, rel_diff numeric,
  series_qualified boolean not null default false, published boolean not null default false,
  check (published = false or (series_qualified and pair_status='within' and status='ok'))
  primary key (run_id, scheme, version, code, trade_date, metric)
  index (scheme, version, code, metric, trade_date desc) where published
  -- 读：licensed read 且 active 且 published

industry_sync_scope                               -- SIC 调度（同规格二 fact_sync_scope 形状的子集）
  issuer_id, job text check (job in ('sic')), next_due_at, lease_until, lease_batch_id, last_attempt_at, last_success_at, last_status, updated_at
  primary key (issuer_id, job)      -- 仅 service_role

桶 industry-manifests（私有；application/gzip；单文件 ≤ 20 MB）；路径 sha256/<manifest_hash>.json.gz
```

**函数**（全部 `create or replace function public.<name>(…) … language plpgsql|sql security definer set search_path = pg_catalog, public`；函数体内对象全部 `public.` 限定；每个函数 `revoke execute on function public.<name>(<签名>) from public;` 后只授列出的角色）

| 函数 | 授权 | 作用 |
|---|---|---|
| `industry_dataset_is_public(p_key text) returns boolean stable` | anon, authenticated, service_role | 只返回 `exists(select 1 from public.industry_dataset_licenses where dataset_key=p_key and status='public')` |
| `industry_run_is_active(p_run uuid) returns boolean stable` | 同上 | 查两张 run 表 `status='active'` |
| `industry_freshness() returns jsonb stable` | 同上 | 只返回 `dq_freshness` 中 `dataset like 'industry.%'` 的 `{dataset, status, last_ok_at}` |
| `apply_industry_memberships(p_batch uuid, p_issuer uuid, p_scheme text, p_version text, p_rows jsonb) returns jsonb` | service_role | §4.5 |
| `activate_industry_metric_run(p_run uuid)` / `activate_industry_valuation_run(p_run uuid)` | service_role | §5.4 / §6.4：`pg_advisory_xact_lock(hashtext(scheme||version||level))`；校验 `status='building'`、完整性、非过期；切换 |
| `industry_state_fingerprint(p_market text) returns jsonb` | service_role | `fact_sync_scope` 的 `[{issuer_id, state_rev}]` |
| `gc_industry_manifests() returns int` | service_role | 删除 `industry_manifests` 中不被任何 `industry_metrics`/`industry_valuations` 行引用、且不被 `judgments`（F4，表存在时）引用的哈希（先删桶对象再删索引行；桶对象删除失败的哈希保留） |
| `prune_industry_runs(p_keep int) returns int` | service_role | 删除同 (scheme, version, level) 中 `superseded` 且 `generation` 排名在最近 `p_keep` 之外、且不被 F4 判断引用的 run（行级联删除；清单由 `gc_industry_manifests` 处理） |

**策略**（每张公共表一条，均 `for select to anon, authenticated using (...)`，只调用上述函数）：
- `industry_classifications`、`issuer_industry_memberships`：`public.industry_dataset_is_public('scheme:' || scheme || ':' || version)`；归属另加 `status='ok'`。
- `industry_metric_runs` / `industry_valuation_runs`：数据集公开 且 `status='active'`。
- `industry_metrics`：数据集公开 且 `public.industry_run_is_active(run_id)`。
- `industry_valuations`：数据集公开 且 `industry_run_is_active(run_id)` 且 `published`。
- `security_marks`：`public.industry_dataset_is_public('marks:tushare-daily_basic')` 且 `status='ok'`。
- service_role 另有 `using (true)` 策略。

### 4.4 成分加载

**来源记录与解析分离。** 适配器只产出 `industry_source_memberships`（不可变、带 `raw_hash`/`locator`）；解析器把当前来源记录映射为 `issuer_industry_memberships`。

**申万（`providers/tushare-sw.ts`）**
- 两遍（默认 `is_new='Y'` 与 `is_new='N'`）按 31 个 L1 循环、`has_more` 翻页、每页一个快照。**核对项 3**（I-1b 第一步）：两遍并集是否覆盖全部进出、`out_date` 是否为剔除日（窗口 `[in_date, out_date)`）、2021 版生效前的 `in_date` 含义、`parent_code` 命名空间；结论写 runbook 并决定 §4.6 的历史起点。
- 来源记录键 `(scheme, version, source, ts_code, l3_code, in_date)`；同键再次出现：全同 → `duplicates`；`out_date` 从 null 变为日期 → 新记录 `current`、旧记录 `superseded`（`superseded_by`）；其他差异 → 新记录 `current`、旧记录 `superseded` 并隔离 `source_membership_changed`（供人工看原因）。
- **解析**（`resolveSourceMemberships`）：对每条 `current` 且 `issuer_id is null` 的记录：规格三落地前 `resolveIssuer({ticker: ts_code},{today})`（`resolution.method='today'`），落地后 `{asOf: in_date}`（`method='as_of'`）；成功 → 写 `issuer_id` 并经 `apply_industry_memberships` 产出三行归属（`valid_from=in_date`，`valid_to=out_date`，`available_date=in_date`，`valid_to_available_date=out_date`，`provenance={availability:'effective_date_assumed', source_membership_id, raw_hash, locator}`）；失败 → 保持 null（可数为未解析）。
- **纠正路径**：规格三落地后以 `as_of` 重跑解析；解析结果与现有归属的发行人不同 → 现有三行 `status='quarantined'`（隔离 `membership_reassigned`，payload 含新旧 issuer 与证据），新归属以新 `batch_id` 写入；清单与 run 不回改（历史 run 保留当时证据）。

**SIC（`providers/sec-sic.ts`）**：同第 2 稿（范围由 `fact_sync_scope(market='US')` 同步到 `industry_sync_scope`；`valid_from=available_date=观察日`；变化关旧开新；同日二次变化隔离 `same_day_change`；`fiscalYearEnd` 追加到 `issuers.provenance.sec_submissions`）。SIC 不产生来源记录（`source_membership_id` null），`provenance` 直接记 `raw_hash`/`locator`。

### 4.5 `apply_industry_memberships` 语义

持 `public.issuers` 行锁；一个事务内对目标行集合：先执行所有"关闭"（`valid_to` null→日期），再执行所有插入；同键同值 → `duplicate`；同键不同 `valid_to`（非关闭）→ `raise 'membership_conflict'`；排他冲突 `23P01` → `raise 'membership_overlap'`；任一 `raise` 整体回滚；返回 `{inserted, closed, duplicates}`。调用方把异常写 `dq_quarantine`。集成测试含"第三行失败前两行不存在"与"两事务并发一个成功一个 `membership_overlap`"。

### 4.6 读取与时间估计对象 `src/lib/industry/memberships.ts`

**估计对象**：行业 X 在 `on` 日的成分 = 按 `knownBy` 时已知的证据判断在 `on` 日有效的发行人。

```
effective_valid_to(knownBy) = case when valid_to is not null and valid_to_available_date <= knownBy then valid_to else null end
member(on, knownBy) ⇔ status='ok' and available_date <= knownBy and valid_from <= on
                      and (effective_valid_to(knownBy) is null or effective_valid_to(knownBy) > on)
```

聚合与估值用 `knownBy = facts_as_of`（v1 `knowledge_date = facts_as_of`）；页面默认 `knownBy = 今天`。

**历史重建期**：`available_date = in_date` 是假设（申万公告日未暴露），且规格三落地前解析按今天；因此 run 的 `history_class`：
- `point_in_time`：核对项 3 通过（`in_date` 为当时纳入日）**且** 本 run 全部成分的 `resolution.method='as_of'` **且** 本 run 不含 `availability='effective_date_assumed'` 以外更弱的假设——v1 只有 `effective_date_assumed`，所以 `point_in_time` 还要求 owner 接受该假设（决策 G 的一部分）；
- 否则 `reconstruction`。
页面对 `reconstruction` run 的所有格打"历史重建"徽标并在抽屉解释两条假设；**owner 决策 G**：重建期是"显示 + 徽标"还是"抑制到 `point_in_time` 可达"。v1 默认显示 + 徽标。

`membersAt(db, {scheme, version, code, on, knownBy})`、`membershipsOfIssuer`、`classificationTree`（缓存键含授权状态；admin 授权变更 `revalidateTag('industries')`）。

### 4.7 A 股全宇宙发行人装载 `src/lib/entities/load-a-share.ts`

规格三 §1.2 指派；**不**复用 `upsertIssuerByIdentifiers`（它要求 LEI/CIK/USCI，`merge.ts:12`）。专用路径（`TableClient`，按 ticker 逐个，幂等）：
1. 输入：`stock_basic`（`ts_code, fullname, name, list_date, delist_date, list_status`）+ `resolveOrgId(symbol)` → `orgId`（无 → `skipped_summary(no_org_id)`）。
2. 匹配顺序：(a) `issuers.cninfo_org_id = orgId` → 命中；(b) 否则 `issuer_securities` 当前行 `ticker = ts_code`（`valid_to is null`）→ 其发行人：若 `cninfo_org_id` 为空 → 回填（`provenance.cninfo_org_id={source:'cninfo:topSearch', observed_at}`）；若非空且不同 → 不写，`fileClaim({id_type:'cninfo_org_id', value: orgId, source})`，`skipped_summary(org_id_mismatch)`；(c) 都无 → 新建 `issuers{canonical_name_zh: fullname, cninfo_org_id: orgId, status:'active', provenance:{…}}`（`issuers_cninfo_org_id_uidx` 保证并发下只建一个；`23505` → 重读按 (a) 处理）。
3. 证券：`attachSecurity({ticker: ts_code, share_class:'A', is_primary: true, valid_from: list_date ?? 观察日, source:'tushare:stock_basic', provenance:{list_date, exchange}})`；已有同发行人重叠窗口 → `duplicate`（不回填 `valid_from`；回填由规格三 F3-2 的 `listing_date` 证据脚本完成，本规格只把 `list_date` 留在 provenance）；不同发行人持有 → `conflict` → `fileClaim(pending)`。一个 orgId 已有多个 A 股 ticker（换码）→ 第二个 ticker 不自动挂，`fileClaim`。
4. `delist_date` 非空且 `list_status='D'`：不处理窗口关闭（规格三 `valid_to_method='delisting'`），只记 `skipped_summary(delisted)`。
5. 回执 `producer='load-a-share'`，`dataset='issuers.a_stock'`，cadence `daily`；cron `30 22 * * *`。

### 4.8 授权门

- 唯一开关 `industry_dataset_licenses`；策略只经 `industry_dataset_is_public()`（§4.3），因此 PostgREST 直读、`/replay`、`/api/entities/[issuerId]/industries`、分类树缓存同受控制。
- `security_marks` 与 `industry_official_valuations` 是 Tushare 转载数据：公开底层事实（交易所价格）不等于转载权，二者的授权行与申万数据一起由决策 A 裁定；`official` 永不直接对外，只在 published 格的抽屉里作为对照值出现（也受其数据集授权行约束：`internal` 时抽屉不显示官方值，只显示 `pair_status`）。
- admin 路由（`requireAdminUser()` + service_role）不受门限制。
- 缓存：未授权响应 `no-store`；撤回后 CDN 残留 ≤ 一个 UTC 日界（接受；runbook：先改 `internal` 再 `revalidateTag`）。
- 真实角色测试三态（§13.2）。

### 4.9 数据访问契约 `src/lib/industry/db.ts`

```ts
export interface IndustryDb {
  // 来源记录与归属
  upsertSourceMemberships(batch, rows): Promise<{inserted, superseded, duplicates}>;
  currentSourceMemberships(scheme, version, {l1Code?, unresolvedOnly?}): Promise<SourceRow[]>;
  setSourceResolution(id, issuerId, resolution): Promise<void>;
  applyMemberships(batch, issuer, scheme, version, rows): Promise<{inserted, closed, duplicates}>;   // rpc；抛 MembershipConflict | MembershipOverlap
  membersAt(q): Promise<MembershipRow[]>; membershipsOfIssuer(issuer, q): Promise<MembershipRow[]>; classificationTree(scheme, version): Promise<ClassificationRow[]>;
  // 标记与官方值
  insertMarks(rows): Promise<{inserted, duplicates, superseded}>; marksOn(tradeDate, tickers, {asObservedBy?}): Promise<MarkRow[]>;
  insertOfficial(rows): Promise<number>; officialOn(scheme, version, code, tradeDate, metric): Promise<OfficialRow|null>;
  // 运行
  createMetricRun(row): Promise<{runId, generation}>; insertMetricRows(run, rows): Promise<number>; activateMetricRun(run): Promise<void>;   // 抛 IncompleteRun | ObsoleteRun
  activeMetricRun(scheme, version, level): Promise<RunRow|null>; metricRowsOfRun(run, filter): Promise<MetricRow[]>;
  createValuationRun(row): Promise<{runId, generation}>; insertValuationRows(run, rows): Promise<number>; activateValuationRun(run): Promise<void>;
  // 清单
  putManifest(kind, bytes): Promise<{hash, existed}>; getManifest(hash): Promise<Manifest>;
  // 其他
  stateFingerprint(market): Promise<Map<string, number>>; freshness(): Promise<FreshnessRow[]>;
  isDatasetPublic(key): Promise<boolean>; isRunActive(run): Promise<boolean>;
}
```

三实现：`supabaseIndustryDb`（`from()` + `rpc()` + 桶；anon 子集只含读方法）、`memoryIndustryDb`（单测；实现排他、触发器、授权门规则）、`pgIndustryDb`（集成测试）。事实读取经规格二 `FactsDb.readFacts`。

### 4.10 A 股事实范围（与规格二的衔接）

- **行业事实宇宙** = `industry_source_memberships` 当前记录解析出的全部发行人（含历史成分，因此含已退市者）∪ `a_stock` 活跃发行人。`scripts/industry/sync.ts --job facts-scope` 把该集合以 `reasons=['universe:sw2021']`、`priority 10` 经规格二 `reconcile_fact_sync_scope('CN', rows)` 写入（规格二决策 A 选"公开宇宙"的具体定义即本集合；**owner 决策 E**）。
- 退市发行人的 Tushare 三表是否仍可取：未核对（§17.1）；取不到者在规格二回执里体现，行业格子按 `n_with_data` 反映。
- **就绪门**：聚合 run 激活额外要求"行业事实宇宙内 `last_success_at is not null` 的发行人占比 ≥ 95%"（`industry_metric_runs.coverage_summary.facts_scope_ready`），否则 run `failed`（`facts_scope_not_ready`）。
- 规格二决策 C 若选"严格"（CN 行留 `quarantined` 直到对账），`read_facts` 对 anon/服务端都只给 `ok` 行 → 行业聚合无输入 → I-2/I-3 不启用；本规格不绕过。

---

## 5. 行业聚合事实 `src/lib/industry/aggregate.ts`

### 5.1 原则

整体法；时点成分 + 知识截止（§4.6）；当时可见披露（`readFacts(issuer,'CN',{concepts, asOf: facts_as_of, history: true})`，`truncated=true` → **该发行人排除**（角色 `excluded:read_truncated`），格子照常产出）；派生用规格二 `derive.ts` 纯函数（版本一致性规则）；同集合同比；只汇总 `CNY`；金融业不算毛利率（`METHOD_CONFIG.financial_l1_codes`）；`METHOD_VERSION='industry-agg/1.0'`，`config_hash = sha256(canonicalJson(METHOD_CONFIG))`。

### 5.2 指标表（只用规格二第 8 稿已有的概念与派生）

| metric | 公式 | 输入 | duration | unit |
|---|---|---|---|---|
| `revenue_sum` | Σ revenue（营业总收入） | `revenue`；3M 用 `q_single_revenue` | 12M、3M | CNY |
| `net_income_parent_sum` | Σ net_income_parent | 同上 | 12M、3M | CNY |
| `gross_margin` | (Σ revenue_operating − Σ cost_of_revenue) / Σ revenue_operating | 12M 直接事实；**不做单季** | 12M | ratio |
| `roe` | Σ ttm_net_income_parent / Σ avg(equity_parent@窗口起点−1 天, @期末) | 规格二 `ttm_net_income_parent`、`equity_parent` 精确匹配 | TTM | ratio |
| `revenue_yoy` / `net_income_yoy` | (Σ_t − Σ_{t−1y}) / \|Σ_{t−1y}\| 于 `comparable_set` | 同前两行 | 12M、3M | ratio |
| `member_count` | n_members（并给 n_unresolved） | 成分 | INSTANT | count |

期望网格 `expected_grid`：L1 代码（分类表）× 期间（历史起点至 `facts_as_of` 的每个 3/6/9/12 月末；`gross_margin` 只 12-31）× 指标。每格一行：可算 → `ok`；不可算 → `missing` + `missing_reason ∈ {empty_set, zero_denominator, no_members, financial_excluded, unresolved_over_limit}`。显示阈值 `DISPLAY_MIN_COVERAGE=0.8`（`n_with_data/(n_members+n_unresolved)`）与 `DISPLAY_MAX_UNRESOLVED=0.05`；不满足的 `ok` 格页面显示"覆盖不足 x/y"/"未解析 z"，值在接口里仍返回。

`n_unresolved(code, on, knownBy)` = `industry_source_memberships` 中 `status='current'`、`issuer_id is null`、`l1_code=code`（或 L2/L3）、`in_date <= on`、`(out_date is null or out_date > on)`、`in_date <= knownBy` 的**去重 ts_code** 数。

### 5.3 输入清单（manifest）与离线重算

每个 (code, period_end) 一份清单，gzip JSON，**内容寻址**（`manifest_hash = sha256(未压缩字节)`，桶路径 `sha256/<hash>.json.gz`，`industry_manifests` 索引）；同一内容在不同 run 共享同一对象；`industry_metrics.manifest_hash` 引用。

```
{ schema: 'industry-manifest/2', kind: 'aggregate', scheme, version, code, level, period_end,
  facts_as_of, knowledge_date, history_class, method_version, config_hash, formula_version, code_version,
  members:    [{issuer_id, ticker, valid_from, valid_to, available_date, valid_to_available_date, source_membership_id, raw_hash, locator, resolution_method}],
  unresolved: [{ts_code, in_date, out_date, source_membership_id}],
  member_state_revs: [{issuer_id, state_rev}],                                                   -- 全部成员，含无事实者
  facts:      [{issuer_id, concept, period_start, period_end, duration, fact_id, value_text, unit, consolidation, available_date, mapping_gen, filing_id, source_ref, raw_hash, citation}],
  derived:    [{issuer_id, metric, period_start, period_end, rule: 'direct'|'a'|'b', input_fact_ids: []}],
  roles:      [{issuer_id, metric, role: 'included'|'excluded', reason?: 'missing_concept'|'unit_excluded'|'read_truncated'|'version_inconsistent'|'not_in_comparable_set'|'financial_excluded'}],
  cells:      [{metric, duration, period_start, status, value_text?, missing_reason?, n_members, n_with_data, n_unresolved}] }
```

全序：`members` 按 `issuer_id`；`facts` 按 `(issuer_id, concept, period_start, period_end, unit, fact_id)`；`roles` 按 `(metric, issuer_id)`。`replayFromManifest(manifest) → cells`（`src/lib/industry/replay.ts`，纯函数，只用 `facts/derived/roles`，不查库）；写入前断言 `replayFromManifest(m).cells` 与计算结果相等，否则该格 `missing(reason='manifest_mismatch')` 并进隔离。CI：删库后仅凭清单重算断言相等。

估值清单（`kind:'valuation'`，每 (code, trade_date) 一份）：`members`、`unresolved`、`member_state_revs`、`marks:[{issuer_id, ticker, trade_date, observed_date, close, total_share, raw_hash, locator}]`、`facts`（只含被选的 TTM/权益输入事实）、`derived`、`roles`、`cells:[{metric, status, value_text?, …, pair_status, official_value?, official_observed_date?}]`。

**体量估算**（成员数未实测，按 L1 平均 150 家估；实施第一步实测后更新）：聚合清单 ≈ 150 成员 × 约 8 个事实行 × 约 250 B ≈ 300 KB 原文、gzip 约 40 KB；每 run 31 × 约 44 期 ≈ 1,364 份 ≈ 55 MB；周频且复用率低（§5.4）→ 每年约 2.9 GB 若不清理；GC 保留活跃 + 最近 12 个 superseded run → 稳态约 0.7 GB。估值清单 ≈ 150 × 2 行 × 250 B ≈ 75 KB 原文、gzip 约 10 KB；每 (code, date) 一份，全量 31 × 约 240 个日期 ≈ 7,440 份 ≈ 75 MB；周增量只重算 `recompute_from` 之后的日期（§6.4），其余承接共享对象 → 周增量 31 × 约 60 × 10 KB ≈ 19 MB，季度全量 75 MB；稳态（保留 12 run）约 0.5 GB。Supabase 存储配额由 owner 确认（§16）。

### 5.4 运行、复用、激活

`runIndustryAggregation(deps, {scheme, version, level, factsAsOf})`：
1. `startBatch(producer='industry-agg', dataset='industry.agg.<scheme>')`；`code_version` 同规格二规则；`createMetricRun({generation = max+1, expected_grid, history_class, config_hash, formula_version, …, status:'building'})`。
2. 就绪门（§4.10）不满足 → run `failed(facts_scope_not_ready)`。
3. `stateFingerprint('CN')`；上一活跃 run 的 `industry_metrics` 行与清单。
4. 对每个 (code, period_end)：**复用条件**（全部成立）：上一 run 同格 `ok` 且 `facts_as_of`、`knowledge_date`、`history_class`、`method_version`、`config_hash`、`formula_version` 相同；成分集合（含未解析集合、每条归属的 `status/valid_to/valid_to_available_date`）与清单 `members/unresolved` 逐条相同；清单 `member_state_revs` 中每个成员的 `state_rev` 等于当前（含无事实成员）；→ 复用清单哈希与行。否则重算、写清单、`replayFromManifest` 自检。`code_version` 不在复用键内（方法与公式版本相同即可复用；新行记录本 run 的 `code_version`，清单保留原 `code_version`）。规格二每次发布都 `state_rev + 1`（含只有重复行的运行），因此复用率预计很低，首版按"每周全量重算"规划预算，复用只是优化。
5. 全部格完成 → `insertMetricRows` → `activateMetricRun`：advisory lock 内校验 `status='building'`；完整性 = `expected_grid` 的每格都有行（`ok` 或 `missing`）；**非过期** = `generation > active.generation` 且 `facts_as_of >= active.facts_as_of` 且 `inputs_watermark >= active.inputs_watermark`，否则 `raise 'obsolete_run'`（run `failed`）；切换 active → superseded。
6. 任一格重算抛错 → run `failed`（行保留，RLS 不可见）。
7. `recordAttempt('industry.agg.<scheme>', {ok, cadence:'weekly'})`；`finishBatch`。

首版 `aggregate`/`valuation` 在 Mac Studio launchd 脚本运行；cron 版只在实测 < 240 s 时启用。全量耗时实施第一步实测。

### 5.5 回放

- `mode=original`：读清单，返回清单与 `replayFromManifest` 结果及与存储值的相等性（`reproduced: true|false`）。
- `mode=recompute`：按清单的 `facts_as_of/knowledge_date` 用当前证据重算，返回 `match|changed` 与差异（成分、未解析、事实、`state_rev`、标记观测版本）。`changed` 是正常现象（迟到披露、隔离处置、映射升级、成分纠正、标记修正），页面文案如此说明。
- 授权与过滤见 §9。

---

## 6. 行业估值

### 6.1 证券级标记 `security_marks`（观测版本化）

- 适配器 `providers/tushare-marks.ts`：`daily_basic(trade_date=D)` 全市场，`has_more` 翻页；`total_share` 万股 × 10000（`transform='wan_to_unit'`）；`observed_date = 抓取日`。同 (ticker, trade_date) 已有 `ok` 行：值相同 → `duplicates`；不同 → 新行 `ok`（`supersedes_observed_date`），旧行 `superseded`，隔离 `mark_revised`（供人工看原因）。
- **估计对象**：发行人 D 日市值 = 其**唯一**主 A 股 ticker（`issuer_securities.is_primary and share_class='A'`，D 日有效；0 或 >1 个 → 角色 `excluded:ambiguous_primary`）的 `close × total_share`；`total_share` 的口径（是否含 H/B 股股本）是 **核对项 2**（I-3 前置，用一家 A+H 公司对照交易所公布总股本），结论写入 `METHOD_CONFIG.total_share_basis` 并随方法版本。
- 期望日期 `expected_dates` 由交易日历生成（Tushare `trade_cal`，字段实施时核对）：全历史每月最后一个交易日 + 最近 2 年每周最后一个交易日；`marks` 任务每次补齐**所有**尚未入库的期望日期（不只是上周五）；空响应 → `skipped_summary(no_rows)` 并在回执标出（不以空响应判定非交易日）。
- 规则：`identityRule('mcap_vs_tushare', close×total_share, total_mv×10000, 0.001)`（同一来源内算术一致性，不是独立核对）失败 → `quarantined`；`rangeRule('close_range', 0.01, 100000)`。独立核对：§13.4 的交易所公布总股本/收盘价金集。
- 不存 Tushare `pe/pb/ps`。

### 6.2 指数公司发布值 `industry_official_valuations`

`providers/tushare-sw-daily.ts`：`sw_daily` 31 × 年份分段，只取 `expected_dates` 的行，`observed_date=抓取日`，值变化走同样的 `superseded` + 隔离 `official_revised`。仅 service_role。

### 6.3 自算估值（派生统计）

对每个 `D ∈ expected_dates`（`D >= recompute_from`，其余承接）、每个一级行业，`members = membersAt(code, {on: D, knownBy: D})`：
- 每个成员：主 A 股 ticker 的 D 日标记（最新 `ok` 观测版本；清单冻结 `observed_date`）；缺 → `excluded:no_mark`。
- `market_cap = Σ mcap(有标记成员)`；`mcap_coverage = Σ mcap(进入该指标分母集合) / Σ mcap(有标记成员)`。
- `pe_ttm = Σ mcap / Σ ttm_net_income_parent`：每个发行人取 D 日可见（`asOf=D`）、`period_end ≤ D` 的最近一个 TTM（规格二派生，版本一致性规则）；Σ ≤ 0 → `missing(invalid_denominator)`。
- `pe_static = Σ mcap / Σ net_income_parent(12M, 最近一个 period_end ≤ D 且 D 日可见)`：只在 `comparator_basis='static'` 时计算与发布；两者是**不同指标**，各自对账，互不授权。
- `pb = Σ mcap / Σ equity_parent`（最近 INSTANT，负权益照常求和）；Σ ≤ 0 → `missing(invalid_denominator)`。
- `facts_as_of = D`。清单见 §5.3。

### 6.4 运行、两级门控、发布

- `comparator_basis` 来自 **核对项 1**（`sw_daily` 的 `pe/pb` 是 TTM 还是静态、整体法、负值处理；以申万官网发布说明为准）；`unknown` 时 run 可建但 `pe_*` 全部 `series_qualified=false`（只 `pb` 可能发布，若核对也确认 pb 口径）。**核对未完成，I-3 不进计划。**
- 每 run 完整快照（全部 `expected_dates` × 行业 × 指标，每格一行 `ok|missing`）；`recompute_from = 今天 − 400 天`（周运行）或历史起点（季度全量 / `--recompute-from` 手动）；更早日期从上一活跃 run 承接（行复制、清单共享）。
- **逐日对照** `pair_status`：`within`（官方同日值存在且 `|自算/官方 − 1| ≤ 0.01`）、`outside`（存在但超差 → 隔离 `valuation_mismatch`）、`no_official`、`no_computed`（本格 `missing`）、`invalid_denominator`、`not_applicable`（`market_cap` 指标与 `comparator_basis` 不匹配的 `pe_*`）。
- **序列资格** `series_qualified(code, metric)`：在 `expected_dates` 上，`n_pairs = within + outside` ≥ 0.9 × `n_expected`，且 `within / n_pairs ≥ 0.95`，且 `n_pairs ≥ 24`。
- **发布** `published = series_qualified and pair_status='within' and status='ok'`（列级 CHECK 保证）；`no_official`/`outside`/`missing` 的日期不对外；`outside` 与 `no_official` 占比进 `reconciliation` 汇总与抽屉。
- 对账结果逐对写 `dq_reconciliations(dataset='industry.val.sw2021')`。
- `official` 数据集不可得（决策 C）→ 全部 `no_official` → 无发布；不以人工金集替代。
- 激活同 §5.4（完整性 = `expected_dates` × 行业 × 指标每格有行；非过期 = `generation`、`recompute_from` 不晚于 active 的、`inputs_watermark`）。

### 6.5 分位数

样本 = 该行业该指标在 `[D − window, D]` 内**月末期望日**的 `published` 值；`percentile = (≤ 当前值的样本数)/n`；资格：样本覆盖 ≥ 80% 的窗口内月末期望日、最长缺口 ≤ 3 个月、`n ≥ 36`；不满足 → "样本不足（n/期望）"；`window ∈ {5y, 10y, 11y, all}`，默认 `11y`；采样策略 `percentile_sampling='month_end_published'` 入 `METHOD_CONFIG`。不配标签。

---

## 7. 判断层接口（F4）

### 7.1 输入适配（按 F4 §3.5 当前契约）

```ts
// src/lib/judgments/inputs/industry.ts（由本模块交付，F4 的 inputs.ts 注册）
type IndustryTableRows = InputRef<'table_rows',
  { table: 'industry_metrics' | 'industry_valuations'; natural_key: string },   // 'industry_metrics:<run_id>:<code>:<period_end>' | 'industry_valuations:<run_id>:<code>:<trade_date>'
  { table; natural_key; rows: Row[] }>;                                          // rows = 该 (run, code, period_end|trade_date) 的全部 ok 行（估值只含 published 行），列 = 表列去 run 无关的 computed_at；按 (metric, period_start) 排序
// hash = digest(snapshot)（F4 规则）；available_at = facts_as_of 当日日终（F4 §3.7）；
// origin = { publisher: 'OsbornAlpha', adapter: 'industry-agg/<method_version>' | 'industry-val/<method_version>', locator: 'manifest:<manifest_hash>', transform: config_hash, license: dataset_key }
```

- F4 公共表白名单需加入 `industry_metrics`、`industry_valuations`（依赖接口请求，F4 规格 §3.5 的 `PublicTable`）。
- `gather(subject={type:'industry', key:'sw2021:2021:<code>'}, asOf, db)`：取 `asOf` 当日的活跃 run（`facts_as_of ≤ asOf`）的相关格；run 为 `reconstruction` 时 `origin.transform` 附 `history_class`。
- v1 不注册任何 `compute`；三个方法（`industry_lifecycle_stage`、`industry_prosperity`、`valuation_verdict`）的公式由"行业判断方法规格"另立。
- resolver `industry_aggregate(params={code, metric, duration, horizon_period_end})`：实现值 = 活跃 run 该格 `ok` 值且满足显示阈值；否则 `unresolvable`。
- 清单与被引用 run 的保留：`prune_industry_runs`/`gc_industry_manifests` 跳过被 `judgments.inputs` 引用的 `natural_key` 对应 run 与清单哈希（F4 表存在时）。

### 7.2 展示

页面判断区调用 F4 `GET /api/judgments?subject_type=industry&subject_key=…`，按 F4 §9 渲染；owner 决策 D 默认：`uncalibrated` 只显示类别标签 + 徽标 + 可证伪条件，不显示分数/百分比/颜色等级；无判断 → "未设判断"。

### 7.3 与规格三 / 7.4 与公司研究规格

同第 2 稿：`resolveIssuer(asOf)` 落地后重解析（§4.4 纠正路径）；`listing_date` 回填证券窗口；本规格 §4.7 扩大规格三覆盖率分母；提供 `GET /api/entities/[issuerId]/industries` 与 `membersAt` 给公司研究规格 §10.5。

---

## 8. 页面与 UI 流程

### 8.1 路由与权限

同第 2 稿：`/intel`（入口卡）、`/intel/industries`、`/intel/industries/[scheme]/[code]`、`…/constituents`、`/stock/[ticker]` 芯片行；session 门禁；数据集未 `public` → `unlicensed` 空态（admin 见"内部预览"条）。

### 8.2 行业列表（桌面）

```
┌ 行业研究  方案 [申万 2021 ▾] 层级 [一级]   事实截至 2026-11-03 · 聚合运行 11-01 · ● fresh · 方法 industry-agg/1.0 · [历史重建] ┐
│ 指标 [毛利率 ▾]  口径 [年度 ▾]  显示 [热力图 | 表格]                                                                           │
│ 热力图：行 = 31 行业，列 = 最近 10 个年度 period_end；格 = 值 / "x/y 覆盖不足" / "z 未解析" / "—（原因）"；点击格 → 抽屉          │
│ 色阶：单色黄铜透明度 0.12–0.6；数值叠印；不用红绿                                                                                │
│ 表格视图：行业 | 代码 | 成分数(未解析) | 最近 period_end | 值 | 覆盖 | 同比 | 来源 ▸                                              │
│ 估值快照（仅 published 格）：行业 | PE | 分位(n/期望) | PB | 分位 | 市值覆盖 | 对照 ✓ | 日期                                        │
│ 判断区：未设判断（F4）                                                                                                          │
└ 来源条：SEC submissions · Tushare→申万宏源研究所 · Tushare→交易所 · EDGAR · Tushare 三表 → 方法与来源                               ┘
```

状态：`loading`、`ok`、`stale`、`error`、`unlicensed`、`empty`、`reconstruction`（run 级徽标）。`sic` 列表无热力图与估值。数字 `Geist Mono` + `tabular-nums`。

### 8.3 详情 / 8.4 成分 / 8.5 来源抽屉

同第 2 稿，增补：详情页估值区按指标分别显示 `published` 序列与"未发布日期占比（outside a% / no_official b%）"；成分页"未解析成分"只给计数（admin 见清单）；抽屉第 3 项"原样回放"显示 `reproduced` 结果与 `replayFromManifest` 的逐角色明细，第 5 项估值另加 `pair_status`、官方对照值（仅当 `official` 数据集 `public`）与 `observed_date`。

### 8.6 Claude Design canvas 待设计清单

同第 2 稿六组屏，增：列表/详情的 `reconstruction` 徽标与说明态；估值区"部分日期未发布"态；抽屉 `reproduced=false` 的异常态。

---

## 9. 读取接口

共同约定同第 2 稿（anon 客户端、RLS 授权门、参数校验、`no-store`/`successCacheControl`、顶层 `methodVersion/runId/factsAsOf/historyClass/freshness`）。

| 路径 | 参数 | 返回 / 授权 |
|---|---|---|
| `GET /api/industries` | `scheme`、`version`、`level`、`metric`、`duration`、`periods ≤ 44` | 活跃 run 的格（含 `missing` 格的原因）、估值 published 行、`historyClass` |
| `GET /api/industries/[scheme]/[code]` | `version`、`from/to`、`metrics`、`durations`、`window` | 节点、序列、估值（published）、`reconciliationSummary`、`method`、`sources` |
| `GET …/constituents` | `version`、`on`、`page`、`pageSize ≤ 200` | 成分行 + `unresolvedCount` |
| `GET …/replay` | `runId`、`metric`、`periodEnd` 或 `tradeDate`、`mode=original\|recompute` | **授权顺序**：数据集 `public` → run `active` → 该格存在且（估值）`published` → 否则 404 `unknown_cell`；返回的清单**按格过滤**：`members/unresolved/member_state_revs` 全量，`facts/derived/roles` 只含该 `metric` 的角色与输入，`cells` 只含该格；估值格的 `official_value` 只在 `official` 数据集 `public` 时附带。`failed` run 与未发布格只经 admin 路由。限流每 IP 每分钟 10 次（内存计数，多实例尽力而为）；`max-age=3600` |
| `GET /api/entities/[issuerId]/industries` | `on` | 只含 `public` 方案 |
| `GET /api/admin/industries/runs?scheme=` / `GET /api/admin/industries/replay?runId=&code=&periodEnd=` | admin | 全部 run、对账明细、未发布格、未解析清单、完整清单 |
| `POST /api/admin/industries/licenses` | `{dataset_key, status, note}` | admin；写 `industry_dataset_licenses` + `research_audit_log` + `revalidateTag('industries')` |
| `GET\|POST /api/cron/industry-sync` | `job=load-a-share\|facts-scope\|memberships-sw\|memberships-sic\|marks\|official\|aggregate\|valuation`、`limit` | 批次回执 |

---

## 10. 采集、调度与脚本

| job | 频率（UTC） | 触发 |
|---|---|---|
| `load-a-share` | `30 22 * * *` | cron |
| `facts-scope` | `45 22 * * *`（`load-a-share` 后） | cron |
| `memberships-sic` | `0 2 * * 0` | cron |
| `memberships-sw` | `0 2 * * 1` | cron（积分允许）或脚本 |
| `marks` | `0 2 * * 6`（补齐全部缺失期望日期） | cron |
| `official` | `20 2 * * 6` | cron |
| `aggregate` / `valuation` | `0 3 * * 6` / 其后 | 首版 launchd 脚本；季度全量 `--recompute-from <历史起点>` 手动 |

脚本：`scripts/industry/sync.ts --job … [--apply] [--facts-as-of] [--recompute-from]`、`replay-check.ts --run <id> --sample 50`、`record-fixture.ts --sw-classify | --sw-members <l1> | --sw-daily <code> | --daily-basic <date> | --trade-cal | --sec-submissions <cik> | --sic-codes`。cron 与脚本不同时跑；延迟工作者由激活函数的 `obsolete_run` 规则兜底。

---

## 11. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| Tushare 积分/限频/429 | job 停止 | `quota_exhausted` | partial / failed |
| 来源记录无发行人 | `issuer_id` 留空（可数） | `skipped_summary(no_issuer)` | — |
| 来源记录内容变化 | 新 current + 旧 superseded | 隔离 `source_membership_changed` | partial |
| `membership_overlap` / `membership_conflict` / `membership_reassigned` | 发行人整体回滚 / 旧行隔离 | 隔离同名 | partial |
| 节点名称冲突 / `parent_code` 无法映射 | 不写 | 隔离 | partial |
| SEC 429/503/404；`sic` 未知；同日二次变更 | 跳过 / 隔离 | `sec_unavailable` / `no_submissions` / `unknown_sic_code` / `same_day_change` | partial |
| 巨潮无结果 / orgId 不一致 / 换码多 ticker | 跳过 + claim | `no_org_id` / `org_id_mismatch` / `claim_pending` | — |
| 标记/官方值修正 | 新观测版本 + 旧行 superseded | 隔离 `mark_revised` / `official_revised` | partial |
| 算术不一致 | 行 `quarantined` | `mcap_mismatch` | partial |
| 期望日期无行 | 回执列出 | `skipped_summary(no_rows)` | partial |
| `readFacts.truncated` | 该发行人 `excluded:read_truncated` | `coverage_summary`（信息） | — |
| 清单自检失败 | 该格 `missing(manifest_mismatch)` | 隔离 `manifest_mismatch` | partial |
| 就绪门不满足 | run `failed` | `facts_scope_not_ready` | failed |
| 完整性/过期 | run `failed` | `incomplete_run` / `obsolete_run` | failed |
| 对照超差 | 该日 `published=false` | 隔离 `valuation_mismatch` | success |
| 清单上传失败 | run `failed` | `manifest_upload_failed` | failed |
| `code_version` 缺失 | 拒绝 apply | `code_version_missing` | — |
| 读接口 | 400 `invalid_parameter:<name>`；403 `unlicensed`；404 `unknown_industry` / `unknown_issuer` / `unknown_run` / `unknown_cell`；429 `rate_limited` | | |
| 页面 | 显示上次成功响应 + `error` 徽标；永不以 0 替代缺失 | | |

---

## 12. i18n

同第 2 稿（新域 `industries`，两处注册），状态文案增加：历史重建、部分日期未发布、回放不一致、官方对照值不可用。

---

## 13. 测试策略

### 13.1 单元
同第 2 稿，增补：`source-memberships.test.ts`（同键去重、`out_date` 补齐 → superseded、内容变化隔离、`n_unresolved` 去重计数、解析纠正路径）；`load-a-share.test.ts`（匹配顺序 a/b/c、orgId 不一致 claim、并发 `23505` 重读）；`memberships.test.ts`（`effective_valid_to` 四种组合：未关闭 / 已关闭且已知 / 已关闭但 `knownBy` 早于关闭可知日 / `available_date > knownBy`）；`replay.test.ts`（`replayFromManifest` 与 `aggregate` 结果相等；打乱顺序哈希不变；篡改一个值 → `reproduced=false`）；`reuse.test.ts`（复用键每一项变化都导致重算，含"无事实成员获得首个事实"）；`valuation.test.ts`（主 A 股唯一性、观测版本冻结、`pe_ttm` 与 `pe_static` 各自门控、序列资格三个阈值、逐日 `pair_status` 六态、`published` CHECK、月末分位资格）；`freshness.test.ts`（`weekly`）；`licenses.test.ts`（数据集键四种）。

### 13.2 数据库（`test:db`，critical）
`industry.integration.test.ts`：迁移可重放两次（含 `dq_freshness` CHECK 改动与 `weekly` 写入）；复合 FK；层级排他（仅 `ok` 行参与）；生命周期触发器；`apply_industry_memberships` 原子与并发；`issuers_cninfo_org_id_uidx`；两类 run 的 `generation` 唯一与活跃唯一；`activate_*` 的完整性与 `obsolete_run`；函数 `search_path`/`EXECUTE` 权限（anon 只能执行三个只读函数；`pg_proc.proconfig` 断言）；RLS 真实角色三态 + `failed` run 不可见 + 未 `published` 估值不可见 + `official`/`source_memberships`/`licenses` 不可见；`industry_freshness()` 只返回三列。

### 13.3 离线集成（critical）
`sync.integration.test.ts`：申万来源记录两遍；解析；`load-a-share`；标记 + 规格二 A 股夹具 → 聚合 run → 删库后仅凭清单 `replayFromManifest` 相等；注入更晚 filing 夹具（规格二写路径）→ `recompute` 为 `changed`；第二次运行复用（构造 `state_rev` 不变的夹具）；估值 run 两级门控（三种不达标各自不发布；`outside` 日期不发布而同序列其他日期发布）；`/replay` 对未发布格 404。

### 13.4 黄金断言
同第 2 稿（证监会 2021Q3 30 家概念对照；5 家（含 A+H）× 2 日交易所公布总股本/收盘价 vs `security_marks`；3 行业 × 4 日申万官方 PE/PB 人工抄录——仅夹具内断言，不替代发布门）。

### 13.5 E2E
三条路由 + 抽屉 + 表格视图 + `unlicensed` + `reconstruction` 徽标 + 移动视口。

---

## 14. 分期

| 工作包 | 交付 | 退出条件 | 估算 |
|---|---|---|---|
| I-0 迁移与契约 | §4.3 全部对象、`weekly` 新鲜度、锁文件、types、`IndustryDb` 三实现、§13.2 | `test:db`、`test:migrations` 绿 | 3.5 人日 |
| I-1a A 股发行人与事实范围 | `load-a-share.ts`、`facts-scope`、cron | 单测绿；真实 dry-run 50 家；就绪门可计算 | 2 人日 |
| I-1b 来源记录、解析、SIC | `tushare-sw.ts`、`sec-sic.ts`、`resolveSourceMemberships`、`memberships.ts`、夹具、核对项 3 记录 | 单测绿；SEC dry-run 3 家；Tushare dry-run 1 个 L1（需 token） | 3.5 人日 |
| I-2 聚合、清单、回放 | `aggregate.ts`、`replay.ts`、`METHOD_CONFIG`、清单桶与 GC、复用、激活、脚本、耗时实测 | 离线集成绿；删库回放相等 | 4.5 人日 |
| I-3 标记与估值 | `tushare-marks.ts`、`tushare-sw-daily.ts`、`trade_cal`、`valuation.ts`、两级门控、分位、admin 明细；**前置：核对项 1、2** | 对账夹具绿；真实全窗口对账一次并记录 | 4 人日 |
| I-4 读接口 | 公共路由（含按格过滤的 replay）、admin 路由、cron 路由 | 路由测试绿 | 2.5 人日 |
| I-5 页面 | canvas 定稿后实现 | E2E 绿；DESIGN.md 审查 | 4 人日 |
| I-6 调度与文档 | `vercel.json`、launchd、runbook、§18 | 全量门禁绿；生产一个完整周期 | 1.5 人日 |

合计约 25.5 人日（不含 owner 决策、积分、设计稿、核对项）。顺序：I-0 → I-1a → I-1b → I-2 → I-4 ∥ I-3 → I-5 → I-6。决策 A 为否：只交付 SIC 导航与成分（I-1b 的 SIC 部分、I-4/I-5 的子集），I-2/I-3 取消。决策 E 为否或规格二决策 C 为"严格"：I-2/I-3 不启用。

验收样例：
1. `GET /api/industries?scheme=sw2021&metric=gross_margin`：31 行 × 10 年度格，每格 `ok` 带计数或 `missing` 带原因；任选 `ok` 格 `replay?mode=original` 返回按格过滤的清单且 `reproduced=true`。
2. 调入/调出公司：`on=2022-12-31, knownBy=2022-12-31` 时 X 含它；`on=2023-12-31` 时 Y 含它、X 不含；`on=2023-12-31, knownBy=2023-06-30`（调出可知日之前）时 X 仍含它。
3. (行业, `pb`) 序列资格达标、某一日 `outside`：该日 `published=false` 且被隔离，其他日期 `published=true`；`/replay` 对该日 404。
4. `scheme:sw2021:2021` 为 `internal`：anon 直查两表 0 行；admin 置 `public` 后可见；置回后 0 行；`marks` 数据集单独受控。
5. 第二次聚合：构造 `state_rev` 不变 → 复用清单哈希；任一复用键变化 → 重算。
6. 延迟工作者：旧 run 在新 run 激活后尝试激活 → `obsolete_run`，active 不变。
7. 断网：run `failed`，active 不变，页面旧 run + `error` 徽标。

---

## 15. 独立验证（除实现者之外）

同第 2 稿（官方对账全窗口结果、市值口径金集、证监会/SIC 对照、每周回放抽样、对方热力图私有回归样本、卖方分析师抽样），增：
- **独立 Claude 复审一轮**（两轮 Codex 上限已用完；复审报告 `04-claude-review.md`），重点核对 §4.6 时间估计对象、§5.3 清单可离线重算、§6.4 两级门控、§4.8 授权门。
- 每个工作包提交前 Codex 再审（代码级）。

---

## 16. 环境与 owner 事项

| 事项 | 谁 | 何时 | 默认 |
|---|---|---|---|
| **决策 A**：Tushare 转载数据（申万分类成分、`daily_basic` 收盘价/总股本、`sw_daily` 估值）对登录用户展示的授权范围；是否需向申万宏源研究所取得授权；否则仅内部 | owner | I-1b 前 | 三个数据集 `internal` |
| **决策 B**：首发方案与默认展示 | owner | I-1b 前 | 两者都做；授权后默认 `sw2021` |
| **决策 C**：Tushare 积分等级（2000/5000）与标记回填深度；Supabase 存储配额（§5.3 体量） | owner | I-3 前 | `sw_daily` 不可得 → 估值不发布 |
| **决策 D**：未校准判断的展示 | owner | I-5 前 | 标签 + 徽标，无分数 |
| **决策 E**：A 股事实范围 = 行业事实宇宙（§4.10，= 规格二决策 A 的"公开宇宙"定义；配额与回填时间另算） | owner | I-1a 前 | 未选 → I-2/I-3 不启用 |
| **决策 F**：`anon` 与 `authenticated` 是否同等可读 | owner | I-0 前 | 同等 |
| **决策 G**：历史重建期（`history_class='reconstruction'`）是"显示 + 徽标"还是"抑制"；是否接受 `available_date=in_date` 假设作为 `point_in_time` 的一部分 | owner | I-2 前 | 显示 + 徽标；假设不接受 → 永为 `reconstruction` 直到找到申万公告日来源 |
| **核对项 1**（I-3 前置）：`sw_daily` `pe/pb` 口径 → `comparator_basis` | owner / 实施者 | I-3 计划前 | 未完成 → I-3 不进计划 |
| **核对项 2**（I-3 前置）：`daily_basic.total_share` 是否含 H/B 股 → `total_share_basis` | 实施者 | I-3 计划前 | 同上 |
| **核对项 3**（I-1b 第一步）：`index_member_all` 两遍覆盖、`out_date`、2021 前 `in_date`、`parent_code` 命名空间 → 历史起点与 `history_class` | 实施者 | I-1b | — |
| `TUSHARE_TOKEN`；Mac Studio launchd；生产迁移与首轮脚本；黄金集抄录；卖方分析师抽样；Claude Design canvas | owner | 各工作包前 | — |

---

## 17. 开放问题（实施前核对）

1. 退市 A 股：`stocks_universe` 覆盖、Tushare 三表对退市公司的可得性、`resolveIssuer` 行为 → 历史格的 `n_unresolved` 与 `n_with_data`。
2. `index_member_all` 2021 版前 `in_date` 语义（核对项 3）。
3. `sw_daily`、`daily_basic.total_share`、`trade_cal` 字段（核对项 1、2）。
4. 交易所官网"所属行业"当前快照接口与条款。
5. A 股发行人 USCI/LEI 一手来源（规格三 `fill-identifiers` 扩展）。
6. 中证分类与估值条款。
7. 美股历史行业分类的有证据来源（EDGAR 全文索引头部 `SIC` 字段——未核对）。
8. 全量聚合耗时与 `readFacts` 批量化。
9. 申万分类调整公告日的来源（决定 `available_date` 假设能否去掉）。
10. `industry_tags` 与 F3 抽取接口。

---

## 18. 实施记录与偏差

（计划落地后补记，格式同规格一 §14。）
