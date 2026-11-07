# 行业研究模块设计规格 · 分类成分 + 行业聚合事实 + 行业估值 + 页面

日期：2026-11-06（第 7 稿 = 第 6 稿 + 核对项 1–3 实测结论（`docs/audits/2026-11-06-industry-research/03-tushare-verification.md`，以「（K*n*）」标注）；第 6 稿 = 第 5 稿 + Codex 第五轮增量审计 V1–V12 按处方修正，见 `docs/audits/2026-11-06-industry-research/01-codex-spec-round5.md` 与 `02-disposition.md`；修正点以"（V*n*）"标注）。第 5 稿日期 2026-11-04（审计轨迹 `docs/audits/2026-11-04-industry-research/`：01 Codex 一轮（13 项）、02 Codex 二轮（R1–R13 复核 + N1–N6）、03 处置表（含三、四轮）、05 Codex 三轮（T1–T6 + 复核）、06 Codex 四轮（第 4 稿新引入缺陷 U1–U6 + 终审"not ready"）。第 5 稿按 Codex 四轮处方逐字实施 U1–U6，**未再审**（协调者指示：不再开 Codex 轮次））
状态：草案，待 owner 评审（§16 七项决策；A（Tushare/申万授权）、E（A 股事实公开宇宙）决定本规格能否进入计划；G 只决定历史重建期的显示方式）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一；§1.2 把分类加载与授权交给本规格；§14 为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二**第 8 稿**：`fact_sync_runs`、`read_facts` 信封 `{state_rev, rows, truncated}`、`fact_state_rev()`、`derive.ts` 版本一致性规则、`reconcile_fact_sync_scope`）；`docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md`（规格三：`resolveIssuer(asOf)`、`valid_from_method/valid_to_method`、`tickerAsOf`；其 §1.2 把 **A 股全宇宙发行人装载**归到本规格）；`docs/superpowers/specs/2026-11-04-judgment-framework-design.md`（F4 §3.5：`InputRef{kind, ref, snapshot, hash=digest(snapshot), available_at, origin}`，`table_rows` 快照 `{table, natural_key, rows}`，公共表白名单）；`docs/superpowers/specs/2026-11-04-company-research-design.md` §10.5；`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（UI 约定）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。逐条对照：

| 总纲约束 | 本规格的落点 |
|---|---|
| 1 只用一手来源；Tushare 仅作适配器并记录上游；对方数据一律不导入 | §4.1：SIC 来自 SEC `submissions`（一手）；申万 2021、收盘价/总股本、申万指数估值三组数据经 Tushare 适配，上游分别记"申万宏源研究所""交易所""申万宏源研究所"，每组数据有独立的授权状态行，授权在数据库层执行（§4.8）；证监会 2017Q2–2021Q3 PDF 只作人工对照；对方 31×10 热力图只作私有回归样本 |
| 2 每个展示数字可回放 | 每个单元格有**内容寻址、不可变的输入清单**（成分证据含定位与可得日期、事实含 filing/原始哈希/映射代/状态版本、标记含观测 id 与观测时刻、每个发行人在每个指标里的角色、方法配置与代码版本）；`replayFromManifest()` 纯函数只用清单就能重算出该格（§5.3）；每个单元格的可得时刻是它的激活时刻：`updated_at = run.activated_at`，在全部读取、计算与对账之后写入；building 期间的行没有发布时刻（V12），**从不回溯到它描述的期间**（§5.3、§5.4、§7.1）；接口分"原样回放"与"按当前证据重算"，回放授权与发布状态一致（§9） |
| 3 事实与判断分层 | 行业聚合、估值序列、分位数是事实/派生统计；生命周期、景气、高估低估是判断，走 F4（§7） |
| 4 缺失就是缺失；时点成分；聚合方法显式 | 不做占位/代理；每格 `n_members / n_with_data / n_unresolved` 与 `status ok|missing(+reason)`；成分按"`period_end` 当日有效且 `knowledge_date` 已知"取（§4.6 的时间估计对象）；SIC 无历史因此不聚合；`point_in_time` 只在成分可得日期**有证据**且解析按当日归属时成立，否则 run 标 `reconstruction`（§4.6；v1 申万没有公告日来源，因此全部为 `reconstruction`，owner 决策 G 只决定显示或抑制）；方法名与版本进每一行 |
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
- 授权门：`industry_dataset_licenses` 未置 `public` 的数据集，anon/authenticated 直查表得 0 行；置 `public` 后可见；撤回后 0 行（真实角色测试）；`/replay` 对未发布格返回 404；`scheme` 公开而 `official` 为 `internal` 时，anon 直查任何公共表都取不到官方对照值（官方值只存 service_role 表 `industry_valuation_pairs`）。
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
| 页面/i18n/cron/迁移 | （V9：本规格迁移为 `20261111090000_industry_research.sql` 与 `20261111091000_industry_research_functions.sql`）同第 2 稿：`intel/page.tsx`、`TabBar startsWith('/intel')`、`middleware.ts` session 门禁、`MESSAGE_DOMAINS`、`messages-parity.test.ts` 硬编码四域、`vercel.json`、锁到 `20261105091000`、规格二占 `20261106090000` | 本规格两个 `20261111…` 迁移（§4.3） |

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

### 4.3 迁移 `supabase/migrations/20261111090000_industry_research.sql`（表、约束、策略）+ `20261111091000_industry_research_functions.sql`（函数、触发器、函数权限） —— 完整对象清单

（V9）时间戳按并行会话分配取 `20261111HHMMSS_`；两个文件各自追加锁条目，不改任何已落地迁移。

**所有权与权限模型（V1 处方的落实；取代第 5 稿的 `industry_publisher` 角色）。** 托管实例的迁移角色 `postgres` 不是超级用户，计划二已落地的做法（`20261106090000_financial_facts.sql:718–742`）是：表与 `security definer` 函数都由迁移角色拥有，函数以表所有者身份执行（表未 `force row level security`，所有者不受 RLS 约束，且拥有全部权限），`service_role` 被**撤销**受保护表的全部写权限、只保留 `select` 与函数 `execute`。本规格沿用这一模型，不创建 `industry_publisher`，不 `alter function … owner to`：
- 受保护表（`industry_metric_runs`、`industry_metrics`、`industry_valuation_runs`、`industry_valuations`、`industry_valuation_pairs`、`industry_run_dependencies`、`industry_manifests`、`security_marks`、`industry_official_valuations`、`industry_fetch_events`、`industry_observation_receipts`、`issuer_industry_memberships`、`industry_source_memberships`）：`revoke all on … from public, anon, authenticated, service_role`，再按需 `grant select`（`service_role` 全部；`anon, authenticated` 只给 §4.3 策略列出的公共表）。**`service_role` 对这些表没有任何 insert/update/delete/truncate**，所有写入经下列函数（V2）。
- 半受保护表：`industry_classifications`（适配器写入，`service_role` 保留 `insert, update`（只增节点、改名称经隔离），不给 `delete/truncate`）；`industry_dataset_licenses`（只经 `set_industry_dataset_license` 函数写，`service_role` 仅 `select`）；`industry_sync_scope`（`service_role` 读写，非事实层）。
- 测试断言：每个函数 `prosecdef=true`、`proowner` = 表所有者、`proconfig` 含 `search_path`；`service_role` 对每张受保护表的直接 `insert/update/delete/truncate` 均 `42501`；每个 RPC 以 `service_role` 调用成功（它确实以所有者身份读写了 `fact_sync_scope`、`issuers`、`ingest_batches` 等跨模块表）。

可重放：约束/策略/索引 `drop … if exists` 后建或 `if not exists`；函数 `create or replace`。锁文件、`database.types.ts` 补齐。

**改动既有对象**

| 对象 | 改动 |
|---|---|
| `industry_classifications` | `scheme` CHECK 加 `'sic'`；`attributes jsonb not null default '{}' check (jsonb_typeof(attributes)='object')`；`create unique index if not exists industry_classifications_code_level_uidx on (scheme, version, code, level)` |
| `issuer_industry_memberships` | **先显式 `alter table … drop constraint if exists issuer_industry_memberships_no_overlap`**（已落地的排他约束覆盖所有 status，会让被取代的历史版本与其替代行冲突；只加新的部分排他不能替代它）。新列：`membership_id uuid not null default gen_random_uuid() unique`、`level int not null check (level between 1 and 4)`、`available_date date not null`、`valid_to_available_date date`（`check ((valid_to is null) = (valid_to_available_date is null))`）、`source_membership_id uuid references industry_source_memberships(id)`（SIC 行为 null）、`batch_id uuid not null references ingest_batches on delete restrict`、`status text not null default 'ok' check (status in ('ok','quarantined','superseded'))`、`superseded_by uuid`，自引用 FK `references issuer_industry_memberships(membership_id) deferrable initially deferred`（`check ((status='superseded') = (superseded_by is not null))`，CHECK 不可延迟，因此写入顺序按 §4.5）；**主键改为** `(membership_id)`（原五列主键改为部分唯一索引 `where status='ok'`，让被取代的历史版本可与新版本同键并存）；复合 FK `(scheme, version, code, level) → industry_classifications(scheme, version, code, level)`（已落地的分类 FK 方向是归属→分类，不依赖被移除的主键，保留）；新排他 `issuer_industry_memberships_one_per_level exclude using gist (issuer_id with =, scheme with =, version with =, level with =, daterange(valid_from, valid_to, '[)') with &&) where (status='ok')`；gist 索引 `(scheme, version, code, daterange(valid_from, valid_to, '[)')) where status='ok'`；触发器 `issuer_industry_memberships_lifecycle`（`update` 只允许 (a) `valid_to` null→日期（`> valid_from`，同时写 `valid_to_available_date >= valid_from`），(b) `status` `ok→quarantined`、`quarantined→ok`、`ok→superseded`（必须在同一 `update` 语句里同时写 `superseded_by`），(c) `provenance` 只增键；`delete` 禁止；`23514`，前缀 `append_only:`）；替换策略 `"issuer_industry_memberships public read"` → `"licensed read"`（§4.8） |
| `industry_classifications` 策略 | 同上替换为 `licensed read` |
| `issuers` | 不改：§4.7 的硬键复用已落地的部分唯一索引 `issuers_cninfo_idx`（`20261105091000_issuers.sql:43`），测试断言它存在（V11） |
| `dq_freshness` | `alter table … drop constraint if exists dq_freshness_expected_cadence_check; add constraint … check (expected_cadence in ('daily','weekly','monthly','quarterly','event'))`（约束名以实际为准，迁移里用 `pg_constraint` 查名）；`freshness.ts` 的 `Cadence` 联合、`WINDOW_MS`、`GRACE_MS` 与 `CADENCES` 校验列表加 `weekly`（窗口 7 天、宽限 2 天；计划三做同一改动，迁移语句与之逐字相同，合并顺序无关） |

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
  issuer_id uuid references issuers(issuer_id),      -- 解析结果；只由 apply_industry_memberships 在同一事务内写入；null = 未解析
  resolution jsonb not null default '{}',           -- {method:'today'|'as_of', resolved_at, as_of, membership_ids[]}
  resolution_error jsonb                            -- 最近一次解析/应用失败 {code, at, detail}；issuer_id 为 null 时可非空，重试不跳过
  unique (scheme, version, source, ts_code, l3_code, in_date, status) where status='current'   -- 以 partial unique index 实现
  index (scheme, version, l1_code, status), index (issuer_id)
  -- 读：仅 service_role（公共只经 n_unresolved 计数与 admin 路由）

industry_fetch_events                             -- 一次持久化的抓取（U3 处方：观测身份键）
  fetch_event_id uuid primary key, job text not null, params jsonb not null, started_at timestamptz not null,
  batch_id uuid not null references ingest_batches on delete restrict, attempt int not null default 1
  -- 同一抓取的重试复用同一 fetch_event_id（attempt + 1）；新抓取 = 新 id。仅 service_role

industry_observation_receipts                     -- V7：每个 (抓取事件, 自然键) 的处理回执，与观测处理同事务写入；无内容变化也写
  fetch_event_id uuid not null references industry_fetch_events(fetch_event_id), kind text not null check (kind in ('marks','official')),
  natural_key text not null,                        -- marks: '<ticker>:<trade_date>'；official: '<scheme>:<version>:<code>:<trade_date>:<metric>'
  payload_hash text not null,                       -- 本事件对该键取到的规范化内容哈希（不可变证据）
  outcome text not null check (outcome in ('inserted','duplicate','superseded_previous')), observation_id uuid,   -- duplicate 时为当时的当前观测
  created_at timestamptz not null default now(), primary key (fetch_event_id, kind, natural_key)
  -- 仅 service_role 可读；只经 apply_observations 写

security_marks                                    -- §6.1（观测版本化）
  observation_id uuid primary key default gen_random_uuid(),
  ticker text not null references stocks_universe(ticker) on delete restrict, trade_date date not null,
  fetch_event_id uuid not null references industry_fetch_events(fetch_event_id),
  observed_at timestamptz not null,                 -- 本次观测（抓取）时刻 = 数据库 now()
  close numeric not null check (close > 0), total_share numeric not null check (total_share > 0),
  market_cap numeric generated always as (close * total_share) stored,
  source text not null, upstream text not null check (upstream in ('sse','szse','bse')),
  raw_hash text not null, locator jsonb not null,  -- raw_hash 只是证据，不是观测身份
  batch_id uuid not null references ingest_batches on delete restrict,
  status text not null default 'ok' check (status in ('ok','quarantined','superseded')),
  supersedes uuid references security_marks(observation_id), created_at timestamptz not null default now()
  unique (ticker, trade_date, fetch_event_id)       -- 幂等键：同一抓取事件的重试 = duplicate
  create unique index … security_marks_current_uidx on (ticker, trade_date) where status='ok'   -- 同一 (ticker, 日期) 只有一个当前观测
  index (trade_date, status)
  -- 读：anon/authenticated 经 licensed read（dataset 'marks:tushare-daily_basic'）且 status='ok'
  -- 写：只经 apply_observations（§6.1），service_role 无直接 DML

industry_official_valuations                      -- §6.2
  observation_id uuid primary key default gen_random_uuid(),
  scheme, version, code, trade_date, metric text check (metric in ('pe','pb','total_mv','float_mv','close')),
  fetch_event_id uuid not null references industry_fetch_events(fetch_event_id),
  value numeric not null, observed_at timestamptz not null, source text, upstream text, raw_hash text not null, locator jsonb,
  batch_id uuid not null references ingest_batches on delete restrict, status ('ok'|'superseded'), supersedes uuid references industry_official_valuations(observation_id)
  unique (scheme, version, code, trade_date, metric, fetch_event_id)
  create unique index … industry_official_current_uidx on (scheme, version, code, trade_date, metric) where status='ok'
  -- 读：仅 service_role；写：只经 apply_observations

industry_valuation_pairs                          -- 对照结果（含官方值），§6.4
  run_id uuid not null references industry_valuation_runs on delete cascade,
  scheme, version, code, trade_date, metric,
  official_observation_id uuid references industry_official_valuations(observation_id), official_value numeric, rel_diff numeric,
  pair_status text not null check (pair_status in ('within','outside','no_official','no_computed','invalid_denominator','not_applicable'))
  primary key (run_id, scheme, version, code, trade_date, metric)
  -- 读：仅 service_role；写：只经 stage_industry_valuation_pairs（U5）；抽屉里的"官方对照值"由路由在 published 格上、且 official 数据集 public 时，经 service_role 读本表并只返回该格一个值

industry_run_dependencies                         -- 每个 run 每个逻辑格每个候选成员使用的事实状态版本（U4 处方；激活时逐格逐发行人非回退校验，§5.4）
  run_kind text not null check (run_kind in ('aggregate','valuation')), run_id uuid not null,
  cell_key text not null,                           -- aggregate: '<code>:<period_end>'；valuation: '<code>:<trade_date>'
  issuer_id uuid not null, state_rev bigint not null -- 来自该格实际使用的 read_facts 信封；复用/承接格从冻结清单的 member_state_revs 复制
  primary key (run_kind, run_id, cell_key, issuer_id)
  -- 读：仅 service_role

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
  fingerprint_at timestamptz not null,              -- 读取 fact_sync_scope 状态指纹的数据库时刻；**只是编排元数据**，不参与过期/新鲜度判定（U4）
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
  updated_at timestamptz,                           -- 发布时刻：building 期间为 null；由 activate_industry_metric_run 在激活阶段用同一数据库时刻写入（= run.activated_at），此后禁止变更（U6）
  check ((status='ok') = (value is not null)), check ((status='ok') = (manifest_hash is not null)), check ((status='missing') = (missing_reason is not null))
  primary key (run_id, code, metric, period_start, period_end)
  index (code, metric, period_end desc)
  -- 读：industry_metric_run_visible(run_id)（经 run 取 scheme/version → 数据集公开 且 run active；active 行的 updated_at 必非 null）
  -- 写：只经 stage_industry_metrics / activate_industry_metric_run；service_role 无直接 DML（U5 的做法同样适用于聚合行）

industry_valuation_runs                           -- §6.4
  run_id uuid primary key, scheme, version, level, generation bigint not null,
  method_version, config_hash, formula_version, code_version,
  expected_dates jsonb not null,                    -- 由交易日历生成的 MARK_DATES
  comparator_basis text not null check (comparator_basis in ('ttm','static','unknown')),   -- 核对项 1 的结论
  recompute_from date not null,                     -- 覆盖元数据：本 run 实际重算的最早日期；更早日期承接（§6.4 兼容条件）；不参与过期判定
  carried_from_run uuid references industry_valuation_runs(run_id),
  fingerprint_at timestamptz not null,              -- 编排元数据（U4）
  batch_id, status ('building'|'published'|'active'|'superseded'|'failed'), reconciliation jsonb not null default '{}', created_at, published_at timestamptz, activated_at timestamptz
  unique (scheme, version, level, generation); 活跃唯一 partial unique index
  -- 读：licensed read 且 active

industry_valuations                               -- 公共快照；不含任何官方值
  run_id uuid not null references industry_valuation_runs on delete cascade,
  scheme, version, code, trade_date date, metric text check (metric in ('pe_ttm','pe_static','pb','market_cap')),
  status text not null check (status in ('ok','missing')), missing_reason text,
  value numeric, value_text generated, facts_as_of date not null,
  n_members int, n_with_data int, n_unresolved int, mcap_coverage numeric check (mcap_coverage between 0 and 1),
  manifest_hash text references industry_manifests,
  updated_at timestamptz,                           -- 发布时刻：由 activate_industry_valuation_run 在激活阶段用同一数据库时刻写入（= run.activated_at）；承接行同样取新 run 的激活时刻（它在新 run 内被重新发布）；此后禁止变更（U6）
  series_qualified boolean not null default false, published boolean not null default false
  primary key (run_id, scheme, version, code, trade_date, metric)
  index (scheme, version, code, metric, trade_date desc) where published
  -- 读：industry_valuation_run_visible(run_id) 且 published
  -- 写：**service_role 对本表与 industry_valuation_pairs 无 INSERT/UPDATE/DELETE**（显式 revoke）；只能执行 stage_industry_valuations / stage_industry_valuation_pairs / publish_industry_valuations / activate_industry_valuation_run（U5）

industry_sync_scope                               -- SIC 调度（同规格二 fact_sync_scope 形状的子集）
  issuer_id, job text check (job in ('sic')), next_due_at, lease_until, lease_batch_id, last_attempt_at, last_success_at, last_status, updated_at
  primary key (issuer_id, job)      -- 仅 service_role

桶 industry-manifests（私有；application/gzip；单文件 ≤ 20 MB）；路径 sha256/<manifest_hash>.json.gz
```

**函数**（全部 `create or replace function public.<name>(…) … language plpgsql|sql security definer set search_path = pg_catalog, public`；函数体内对象全部 `public.` 限定；每个函数 `revoke execute on function public.<name>(<签名>) from public;` 后只授列出的角色。**所有者**：迁移角色（= 表所有者，见本节开头的所有权与权限模型；V1 取代第 5 稿的 `industry_publisher`）。`service_role` 对受保护表无任何写权限，只能执行函数（U5、V2））

| 函数 | 授权 | 作用 |
|---|---|---|
| `industry_dataset_is_public(p_key text) returns boolean stable` | anon, authenticated, service_role | 只返回 `exists(select 1 from public.industry_dataset_licenses where dataset_key=p_key and status='public')` |
| `industry_metric_run_visible(p_run uuid) returns boolean stable` / `industry_valuation_run_visible(p_run uuid) returns boolean stable` | 同上 | 由 run 取 `scheme, version`，返回 `industry_dataset_is_public('scheme:'||scheme||':'||version) and status='active'`；行表策略只调用这两个函数 |
| `stage_industry_metrics(p_run uuid, p_rows jsonb) returns int` / `stage_industry_run_dependencies(p_run uuid, p_kind text, p_rows jsonb) returns int` | service_role | 只接受 `status='building'` 的 run；聚合行 `updated_at` 强制 null；依赖行按 (cell_key, issuer_id)，并校验每格依赖集合 = 候选成员集合（`dependencies_incomplete`） |
| `stage_industry_valuations(p_run uuid, p_rows jsonb) returns int` / `stage_industry_valuation_pairs(p_run uuid, p_rows jsonb) returns int` | service_role | 只接受 `building` run；估值行强制 `published=false, series_qualified=false, updated_at=null`（U5） |
| `publish_industry_valuations(p_run uuid) returns jsonb` | service_role | 锁 run 行（`for update`）；校验 `status='building'`；校验每个 `ok` 估值格都有对照行、每个对照行都有估值格（不匹配 → `raise 'pairs_mismatch'`）；计算序列资格（§6.4）；一次性写 `series_qualified`/`published`；run → `published`，写 `published_at`。此后 run 的估值行与对照行**冻结**：触发器 `industry_valuations_frozen` / `industry_valuation_pairs_frozen` 拒绝所属 run 不在 `building` 的任何 `update/delete`，唯一例外是 `activate_industry_valuation_run` 写 `updated_at`（触发器只检查：run 状态为 `published`、被改的列仅 `updated_at`、新值等于 run 的 `activated_at`）。没有会话设置机制（U5） |
| `apply_observations(p_kind text, p_fetch_event uuid, p_rows jsonb) returns jsonb` | service_role | §6.1 / §6.2：标记与官方值的唯一写入路径（U2/U3） |
| `industry_freshness() returns jsonb stable` | 同上 | 只返回 `dq_freshness` 中 `dataset like 'industry.%'` 的 `{dataset, status, last_ok_at}` |
| `apply_industry_memberships(p_batch uuid, p_issuer uuid, p_scheme text, p_version text, p_rows jsonb, p_source_ids uuid[], p_resolution jsonb) returns jsonb` | service_role | §4.5：预分配 id、取代更新、插入、解析落账同一事务（U1） |
| `activate_industry_metric_run(p_run uuid)` / `activate_industry_valuation_run(p_run uuid)` | service_role | §5.4 / §6.4：`pg_advisory_xact_lock(hashtext(scheme||version||level))`；聚合校验 `status='building'`，估值校验 `status='published'` 并**复核发布不变量**（每个 `published` 行对应对照行 `pair_status='within'` 且 `series_qualified`）；完整性；`generation > active.generation`；`industry_run_dependencies` **逐格逐发行人**与活跃 run 比较，任何 `state_rev` 下降 → `raise 'dependency_regression'`；然后取**一个**数据库时刻 `t = clock_timestamp()`，写 run `activated_at = t`、本 run 全部行 `updated_at = t`，切换 active → superseded；`fingerprint_at` 不参与（U4、U6） |
| `industry_state_fingerprint(p_market text) returns jsonb` | service_role | `fact_sync_scope` 的 `[{issuer_id, state_rev}]` |
| `gc_industry_manifest_candidates(p_limit int) returns jsonb` / `delete_industry_manifests(p_hashes text[]) returns int` | service_role | 前者列出不被任何 `industry_metrics`/`industry_valuations` 行引用、且不被 `judgments`（F4，表存在时）引用的哈希；TS（`gcManifests`）先经 Storage API 删桶对象，再调后者删索引行（后者复核仍未被引用）；桶对象删除失败的哈希保留（迁移不能引用 `storage.objects`） |
| `prune_industry_runs(p_keep int) returns int` | service_role | 删除同 (scheme, version, level) 中 `superseded` 且 `generation` 排名在最近 `p_keep` 之外、且不被 F4 判断引用的 run（行级联删除；清单由 `gc_industry_manifests` 处理）。**V8**：这是删除 run 及其行/对照行/依赖行的唯一路径（`service_role` 无 delete 权限）；冻结触发器对 `delete` 只放行所属 run 状态为 `superseded` 或 `failed` 的行，对 `update` 规则不变；函数先 `for update` 锁每个待删 run 并复核保留/引用条件。测试：剪除一个同时有估值行与对照行的 `superseded` 估值 run 成功；对 `active`/`published` run 的行删除被拒 |
| `create_industry_metric_run(p jsonb) returns jsonb` / `create_industry_valuation_run(p jsonb) returns jsonb` | service_role | **V2**：建 run 的唯一路径；`pg_advisory_xact_lock(hashtext(kind||scheme||version||level))` 内取 `generation = max + 1`，插入 `status='building'`，返回 `{run_id, generation}`；`batch_id` 必须存在 |
| `fail_industry_run(p_kind text, p_run uuid, p_reason text) returns void` | service_role | **V2**：`for update` 锁 run；只允许 `building`/`published` → `failed`，写 `coverage_summary`/`reconciliation` 中的 `failure_reason`；其他状态 `raise 'illegal_transition'` |
| `set_industry_metric_run_coverage(p_run uuid, p_summary jsonb) returns void` | service_role | **V2**：`for update` 锁 run；只在 `building` 时写 `coverage_summary`（含 `facts_scope_ready`） |
| `put_industry_manifest(p_hash text, p_kind text, p_bytes int) returns boolean` | service_role | 索引行 `insert … on conflict do nothing`，返回是否新建（桶对象由 TS 先上传，见 §5.3） |
| `apply_sic_memberships(p_batch uuid, p_issuer uuid, p_version text, p_observed date, p_code text, p_provenance jsonb) returns jsonb` | service_role | §4.4 SIC：持发行人行锁；当前 `ok` 行同码 → `duplicate`；异码 → 关旧（`valid_to = valid_to_available_date = p_observed`；旧行 `valid_from = p_observed` → `raise 'same_day_change'`）开新；无行 → 插入 |
| `set_industry_dataset_license(p_key text, p_status text, p_by text, p_note text) returns void` | service_role | admin 授权开关的唯一写路径（§9 `POST /api/admin/industries/licenses`） |
| `record_industry_source_resolution_error(p_ids uuid[], p_error jsonb) returns int` / `upsert_industry_source_memberships(p_batch uuid, p_rows jsonb) returns jsonb` | service_role | 来源记录写入（§4.4 同键去重/取代）与解析失败记录；来源记录表对 `service_role` 无直接写 |
| `begin_industry_fetch_event(p_job text, p_params jsonb, p_batch uuid) returns uuid` / `retry_industry_fetch_event(p_id uuid) returns int` | service_role | 抓取事件（U3）；重试 `attempt + 1` |

**通用规则（V2）**：所有 `stage_*`、`publish_*`、`activate_*`、`fail_*`、`set_*_coverage` 在检查状态之前先对**同一个**父 run 行 `select … for update`，并持锁到写完；run 表对 `service_role` 撤销全部写权限（先 `revoke all`，再只 `grant select`，因此不残留 `truncate`）；已发布/激活 run 的元数据列（`generation`、`facts_as_of`、`knowledge_date`、`history_class`、`method_version`、`config_hash`、`formula_version`、`code_version`、`expected_grid`/`expected_dates`、`batch_id`、`created_at`）由触发器 `industry_runs_immutable` 冻结；合法状态转换只有 `building→active|failed`（聚合）、`building→published|failed`、`published→active|failed`（估值）、`active→superseded`（由 `activate_*` 写）。§6.4 中"写 `industry_valuation_pairs`（service_role）"等直接写表措辞一律读作"经对应函数写入"。

**策略**（每张公共表一条，均 `for select to anon, authenticated using (...)`，只调用上述函数）：
- `industry_classifications`、`issuer_industry_memberships`：`public.industry_dataset_is_public('scheme:' || scheme || ':' || version)`；归属另加 `status='ok'`。
- `industry_metric_runs` / `industry_valuation_runs`：`public.industry_dataset_is_public('scheme:'||scheme||':'||version) and status='active'`。
- `industry_metrics`：`public.industry_metric_run_visible(run_id)`（表本身没有 `scheme/version`，由函数经 run 取得）。
- `industry_valuations`：`public.industry_valuation_run_visible(run_id) and published`。
- `security_marks`：`public.industry_dataset_is_public('marks:tushare-daily_basic')` 且 `status='ok'`。
- service_role 另有 `using (true)` 策略。

### 4.4 成分加载

**来源记录与解析分离。** 适配器只产出 `industry_source_memberships`（不可变、带 `raw_hash`/`locator`）；解析器把当前来源记录映射为 `issuer_industry_memberships`。

**申万（`providers/tushare-sw.ts`）**
- 两遍（默认 `is_new='Y'` 与 `is_new='N'`）按 31 个 L1 循环、`has_more` + `limit/offset` 翻页、每页一个快照；进出覆盖只在 31×2 遍的全集上成立，衔接检查跨 L1 做（K3）。成员接口只给 `index_code` 形式的 `l1/l2/l3_code`；分类表上下级用 `industry_code` 连接（`parent_code` 属 `industry_code` 命名空间，经同批映射为 `index_code` 后写入 `parent_code`，原值存 `attributes.parent_industry_code`）；代码别名表 `SW2021_CODE_ALIASES = {'850412.SI':'850401.SI'}`（特钢Ⅲ：成员接口与分类接口不一致；别名进 `METHOD_CONFIG` 并随方法版本），未在分类表中的 l3 代码隔离 `classification_code_unknown`。`stock_basic` 必须显式取 `list_status` = `L`、`D`、`P` 三遍（默认只返回 L；K-§17.1）。**核对项 3**（I-1b 第一步）：两遍并集是否覆盖全部进出、`out_date` 是否为剔除日（窗口 `[in_date, out_date)`）、2021 版生效前的 `in_date` 含义、`parent_code` 命名空间；结论写 runbook 并决定 §4.6 的历史起点。
- 来源记录键 `(scheme, version, source, ts_code, l3_code, in_date)`；同键再次出现：全同 → `duplicates`；任何差异（含 `out_date` null→日期、日期更正）→ 新记录 `current`、旧记录 `superseded`（`superseded_by`），非"null→日期"的差异另隔离 `source_membership_changed`（供人工看原因）。新 `current` 记录的 `issuer_id` 为 null（待解析），旧记录的归属行在解析应用时被取代（§4.5）。
- **解析与应用是一个事务**（`resolveSourceMemberships` 只做计算，写入全部在 `apply_industry_memberships` 内）：对每条 `current` 且 `issuer_id is null` 的记录：规格三落地前 `resolveIssuer(tables, {ticker: ts_code}, {today})`（`src/lib/entities/resolve.ts:81`；`resolution.method='today'`），规格三的 `asOf` 选项落地后 `resolveIssuer(tables, {ticker: ts_code}, {asOf: in_date})`（`method='as_of'`）（V10）；解析到发行人 → 调 `apply_industry_memberships(…, p_rows=三行, p_source_ids=[该记录 id], p_resolution)`，函数在同一事务内写归属行并把来源记录的 `issuer_id/resolution` 置好；函数抛错 → 事务回滚，来源记录 `issuer_id` 仍为 null，`resolution_error` 记录原因（下次运行重试，不跳过；`n_unresolved` 仍计入）。解析不到 → `resolution_error={code:'no_issuer'}`。三行归属（K3：`out_date` 是**最后一个成员日（含）**，退市不关窗）：`valid_from=in_date`，`valid_to = min(out_date + 1 日, stock_basic.delist_date)`（两者皆空 → null），`available_date=in_date`，`valid_to_available_date = valid_to`；`in_date > delist_date` → 不写归属，隔离 `membership_after_delist`；`provenance={availability:'effective_date_assumed', source_membership_id, raw_hash, locator}`。
- **纠正路径**：(a) 来源记录被取代（§4.4 第二条）：新记录解析应用时，函数把旧记录对应的 `ok` 归属行置 `superseded`（`superseded_by` 指向新行）后插入新行（§4.5 的取代转换）；(b) 规格三落地后以 `as_of` 重跑解析，发行人不同 → 现有三行 `status='quarantined'`（隔离 `membership_reassigned`），新归属以新 `batch_id` 写入；清单与 run 不回改。

**SIC（`providers/sec-sic.ts`）**：同第 2 稿（范围由 `fact_sync_scope(market='US')` 同步到 `industry_sync_scope`；`valid_from=available_date=观察日`；变化关旧开新；同日二次变化隔离 `same_day_change`；`fiscalYearEnd` 追加到 `issuers.provenance.sec_submissions`）。SIC 不产生来源记录（`source_membership_id` null），`provenance` 直接记 `raw_hash`/`locator`。写入经 `apply_sic_memberships`（§4.3 函数表；V2：归属表对 `service_role` 无直接写）。

### 4.5 `apply_industry_memberships` 语义

持 `public.issuers` 行锁；一个事务内，语句顺序固定（U1 处方）：
1. **预分配**：为每个将要插入的替代行生成 `membership_id`（`gen_random_uuid()`，在函数内先算好）。
2. **取代**：对 `p_source_ids` 中每条来源记录，找它取代的旧记录（`superseded_by` 链）所对应的 `ok` 归属行，用**一条 `update`** 同时写 `status='superseded', superseded_by=<预分配的替代行 id>`（CHECK 与触发器在该语句上即满足；自引用 FK 为 `deferrable initially deferred`，在提交时校验替代行已存在）。不允许任何时刻出现 `superseded` 且 `superseded_by is null` 的行。
3. **关闭**：目标行与现存 `ok` 行同键（`issuer, scheme, version, code, valid_from`）且现存 `valid_to is null`、目标 `valid_to` 非空 → 关闭（`closed`）。
4. **插入**：用预分配 id 插入替代行与其余目标行；同键同值 → `duplicate`；同键不同值且无取代关系 → `raise 'membership_conflict'`；排他冲突 `23P01` → `raise 'membership_overlap'`。
5. **解析落账**：来源记录 `issuer_id = p_issuer`、`resolution = p_resolution ∪ {membership_ids}`、`resolution_error = null`。
6. 提交（延迟 FK 校验在此）。
任一 `raise` 整体回滚（来源记录保持未解析，旧行仍 `ok`）；返回 `{inserted, closed, superseded, duplicates}`。调用方把异常写 `dq_quarantine` 并写 `resolution_error`。集成测试含"第三行失败前两行与来源解析都不存在、旧行仍 `ok`"、"两事务并发一个成功一个 `membership_overlap`"、"`out_date` 更正后旧行 `superseded` 且 `superseded_by` 指向新行、新行 `ok`、历史版本可查"、"替代行插入失败时取代更新被回滚"。

### 4.6 读取与时间估计对象 `src/lib/industry/memberships.ts`

**估计对象**：行业 X 在 `on` 日的成分 = 按 `knownBy` 时已知的证据判断在 `on` 日有效的发行人。

```
effective_valid_to(knownBy) = case when valid_to is not null and valid_to_available_date <= knownBy then valid_to else null end
member(on, knownBy) ⇔ status='ok' and available_date <= knownBy and valid_from <= on
                      and (effective_valid_to(knownBy) is null or effective_valid_to(knownBy) > on)
```

聚合与估值用 `knownBy = facts_as_of`（v1 `knowledge_date = facts_as_of`）；页面默认 `knownBy = 今天`。

**历史重建期**：`history_class` 由证据决定，不由 owner 接受假设决定：
- `point_in_time` 当且仅当本 run 全部成分行的 `provenance.availability='evidenced'`（`available_date` 来自有记录的公告/发布日来源，§17.9 目前没有这样的来源）**且** 全部 `resolution.method='as_of'`；
- 否则 `reconstruction`。v1 申万成分的 `available_date=in_date` 是假设（`effective_date_assumed`），因此 **v1 所有 `sw2021` run 都是 `reconstruction`**，页面打"历史重建"徽标并在抽屉解释两条假设。**owner 决策 G** 只决定重建期是"显示 + 徽标"还是"抑制到 `point_in_time` 可达"；v1 默认显示 + 徽标。

`membersAt(db, {scheme, version, code, on, knownBy})`、`membershipsOfIssuer`、`classificationTree`（缓存键含授权状态；admin 授权变更 `revalidateTag('industries')`）。

### 4.7 A 股全宇宙发行人装载 `src/lib/entities/load-a-share.ts`

规格三 §1.2 指派；**不**复用 `upsertIssuerByIdentifiers`（它要求 LEI/CIK/USCI，`merge.ts:12`）。专用路径（`TableClient`，按 ticker 逐个，幂等）：
1. 输入：`stock_basic`（`ts_code, fullname, name, list_date, delist_date, list_status`）+ `resolveOrgId(symbol)` → `orgId`（无 → `skipped_summary(no_org_id)`）。
2. 匹配顺序：(a) `issuers.cninfo_org_id = orgId` → 命中；(b) 否则 `issuer_securities` 当前行 `ticker = ts_code`（`valid_to is null`）→ 其发行人：若 `cninfo_org_id` 为空 → 回填（`provenance.cninfo_org_id={source:'cninfo:topSearch', observed_at}`）；若非空且不同 → 不写，`fileClaim(tables, {issuer_id: <该证券的发行人>, id_type:'cninfo_org_id', value: orgId, source:'cninfo:topSearch'})`（V10），`skipped_summary(org_id_mismatch)`；(c) 都无 → 新建 `issuers{canonical_name_zh: fullname, cninfo_org_id: orgId, status:'active', provenance:{…}}`（`issuers_cninfo_idx` 保证并发下只建一个；`23505` → 重读按 (a) 处理）。
3. 证券：`attachSecurity(tables, {issuer_id, ticker: ts_code, share_class:'A', is_primary: true, valid_from: list_date ?? 观察日, source:'tushare:stock_basic', provenance:{list_date, exchange}})`；已有同发行人重叠窗口 → `duplicate`（不回填 `valid_from`；回填由规格三 F3-2 的 `listing_date` 证据脚本完成，本规格只把 `list_date` 留在 provenance）；不同发行人持有 → `conflict`（`attachSecurity` 只为 ISIN 建 claim，本路径另 `fileClaim(tables, {issuer_id, id_type:'cninfo_org_id', value: orgId, source:'tushare:stock_basic'})` 记录待审）。一个 orgId 已有多个 A 股 ticker（换码）→ 第二个 ticker 不自动挂，同样 `fileClaim`。
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
  setSourceResolutionError(id, error): Promise<void>;
  applyMemberships(batch, issuer, scheme, version, rows, sourceIds, resolution): Promise<{inserted, closed, superseded, duplicates}>;   // rpc；抛 MembershipConflict | MembershipOverlap
  membersAt(q): Promise<MembershipRow[]>; membershipsOfIssuer(issuer, q): Promise<MembershipRow[]>; classificationTree(scheme, version): Promise<ClassificationRow[]>;
  // 标记与官方值
  beginFetchEvent(job, params, batch): Promise<string>; retryFetchEvent(id): Promise<void>;
  applyObservations(kind, fetchEventId, rows): Promise<{inserted, duplicates, superseded}>;   // rpc apply_observations（U2/U3）
  currentMarksOn(tradeDate, tickers): Promise<MarkRow[]>; currentOfficialOn(scheme, version, code, tradeDate, metric): Promise<OfficialRow|null>;   // status='ok' 观测
  // 运行（全部经 rpc；无直接表写）
  createMetricRun(row): Promise<{runId, generation}>; stageMetricRows(run, rows): Promise<number>; stageRunDependencies(run, kind, rows): Promise<number>; activateMetricRun(run): Promise<void>;   // 抛 IncompleteRun | ObsoleteRun | DependencyRegression
  activeMetricRun(scheme, version, level): Promise<RunRow|null>; metricRowsOfRun(run, filter): Promise<MetricRow[]>;
  createValuationRun(row): Promise<{runId, generation}>; stageValuationRows(run, rows): Promise<number>; stageValuationPairs(run, rows): Promise<number>; publishValuations(run): Promise<{qualifiedSeries, publishedRows}>; activateValuationRun(run): Promise<void>;
  // 清单
  putManifest(kind, bytes): Promise<{hash, existed}>; getManifest(hash): Promise<Manifest>;
  // 其他
  stateFingerprint(market): Promise<{takenAt: string; revs: Map<string, number>}>; freshness(): Promise<FreshnessRow[]>;
  isDatasetPublic(key): Promise<boolean>; metricRunVisible(run): Promise<boolean>; valuationRunVisible(run): Promise<boolean>;
}
```

三实现：`supabaseIndustryDb`（`from()` + `rpc()` + 桶；anon 子集只含读方法）、`memoryIndustryDb`（单测；实现排他、触发器、授权门规则）、`pgIndustryDb`（集成测试）。事实读取经规格二 `FactsDb.readFacts`。

### 4.10 A 股事实范围（与规格二的衔接）

- **行业事实宇宙** = `industry_source_memberships` 当前记录解析出的全部发行人（含历史成分，因此含已退市者）∪ `a_stock` 活跃发行人。
- **写入方式（V3）**：不另起 upsert 作业（计划二的 CN 同步在每次调度前调用 `reconcileScope(…,'CN')`，`desiredCn` 只含研究队列，会把单独写入的行业行在下一次运行退休；SQL `reconcile_fact_sync_scope` 用新 `reasons` 整体替换旧值）。改为扩展权威的 CN 期望集合构造：`src/lib/facts/scope.ts::desiredCn` 在 `// INDUSTRY` 块内并入 `src/lib/industry/facts-scope.ts::industryCnUniverse(tables, today, skipped)` 的结果，**按发行人合并 `reasons`**（`cohort` ∪ `universe:sw2021`，取并集后排序），只退休两集合并集之外的发行人；每行有合法 `fetch_key`（`fetchKey('CN',{ticker})`）；无当前 A 股证券的历史成分发行人取其**最近关闭**的 A 股窗口的 ticker（`chooseCnTicker` 作用于 `valid_to` 最大的那组行），仍无 → `skipped.no_cn_ticker` 计数；未解析的来源记录（`issuer_id is null`）不进入（它们在 `n_unresolved` 里）；全部输入用 `keysetAll` 分页取尽；`snapshotAt` 照旧由 `reconcileScope` 在读任何来源之前取得并传入 `FactsDb.reconcileScope`。并入受开关 `FACTS_CN_INDUSTRY_UNIVERSE=1` 控制（owner 决策 E；缺省关 → `desiredCn` 行为与计划二逐字相同，测试断言）。`scripts/industry/sync.ts --job facts-scope` 只是对 `reconcileScope('CN')` 的 dry-run/apply 包装与报告。
- 退市发行人的 Tushare 三表是否仍可取：未核对（§17.1）；取不到者在规格二回执里体现，行业格子按 `n_with_data` 反映。
- **CN 启用依赖（V4）**：`facts-scope` 只写调度范围，不是采集。CN 事实真正进入数据库还需要：完成计划二记录的 CN 真实数据核对（规格二 §16、计划二 Task 12/13 的未核对项）、提供 `TUSHARE_TOKEN`、设置 `FACTS_CN_ENABLED=1`（`src/app/api/cron/facts-sync/route.ts:48`）并配置 CN 事实 worker（`vercel.json` 目前只有 US）。在此之前允许离线实施与夹具测试，但生产聚合保持关闭（`aggregate` 不进 cron），不得声称 95% 就绪门可通过。
- **就绪门**：聚合 run 激活额外要求"行业事实宇宙内 `last_success_at is not null` 的发行人占比 ≥ 95%"（`industry_metric_runs.coverage_summary.facts_scope_ready`），否则 run `failed`（`facts_scope_not_ready`）。
- 规格二决策 C 若选"严格"（CN 行留 `quarantined` 直到对账），`read_facts` 对 anon/服务端都只给 `ok` 行 → 行业聚合无输入 → I-2/I-3 不启用；本规格不绕过。

---

## 5. 行业聚合事实 `src/lib/industry/aggregate.ts`

### 5.1 原则

整体法；时点成分 + 知识截止（§4.6）；当时可见披露：**每个 run 每个发行人恰好一次** `db.readFacts(issuer, 'CN', {concepts: AGG_CONCEPTS, asOf: facts_as_of, history: true})`（`AGG_CONCEPTS` = 全部指标所需概念的并集，即计划二 `DERIVE_CONCEPTS.CN`），同一 run 内该发行人的所有格、所有指标共用这一个信封（V6；不同调用的 `state_rev` 不得混用，也不取 MIN/MAX）；`truncated=true` → **该发行人在本 run 的全部格排除**（角色 `excluded:read_truncated`），格子照常产出；派生用 `deriveMetrics(result.rows, {market:'CN', asOf: facts_as_of, basedOnRev: result.stateRev})`（V5；适配器返回 `stateRev`，清单里显式写成 `state_rev`），保持十进制字符串与计划二的舍入规则（`RATIO_SCALE=10`）；同集合同比；只汇总 `CNY`；金融业不算毛利率（`METHOD_CONFIG.financial_l1_codes`）；`METHOD_VERSION='industry-agg/1.0'`，`config_hash = sha256(canonicalJson(METHOD_CONFIG))`。

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

`n_unresolved(code, on, knownBy)` = `industry_source_memberships` 中 `status='current'`、`issuer_id is null`（含 `resolution_error` 非空者）、`l1_code=code`（或 L2/L3）、`in_date <= on`、`(out_date is null or out_date >= on)`（K3：`out_date` 含当日）、`in_date <= knownBy` 的**去重 ts_code** 数。另排除 `industry_security_delistings` 中 `delist_date <= on` 的 ts_code（K4：退市股不建发行人，其来源记录永不解析；不排除会让它们在退市后永久计入 `n_unresolved`，与已解析成员按 `delist_date` 截断的口径不一致）。`industry_security_delistings(ts_code pk, delist_date, list_status, observed_at, batch_id, raw_hash)` 由 `load-a-share` 的 `stock_basic list_status='D'` 遍写入，日期变化隔离 `delist_date_changed`；仅 service_role 可读写。

### 5.3 输入清单（manifest）与离线重算

每个 (code, period_end) 一份清单，gzip JSON，**内容寻址**（`manifest_hash = sha256(未压缩字节)`，桶路径 `sha256/<hash>.json.gz`，`industry_manifests` 索引）；同一内容在不同 run 共享同一对象；`industry_metrics.manifest_hash` 引用。

```
{ schema: 'industry-manifest/2', kind: 'aggregate', scheme, version, code, level, period_end,
  facts_as_of, knowledge_date, history_class, method_version, config_hash, formula_version, code_version,
  members:    [{issuer_id, ticker, valid_from, valid_to, available_date, valid_to_available_date, source_membership_id, raw_hash, locator, resolution_method}],
  unresolved: [{ts_code, in_date, out_date, source_membership_id}],
  member_state_revs: [{issuer_id, state_rev}],                                                   -- 全部成员，含无事实者；= 该发行人本 run 唯一信封的 stateRev（V6）
  facts:      [{issuer_id, concept, period_start, period_end, duration, fact_id, value_text, unit, consolidation, available_date, mapping_gen, filing_id, source_ref, raw_hash, citation}],   -- source_ref/citation 经 FactsDb.filingsOfIssuer 显式查得（FactRow 不含），查不到 → 该字段 null 并在清单 warnings 记录
  derived:    [{issuer_id, metric, period_start, period_end, duration, value, unit, basis, formula_version, inputs: MetricRow['inputs']}],   -- V5：原样保留计划二 MetricRow.inputs（每个输入的 fact_id/concept/filing_id/available_date、可选 ytd_rule same_filing|never_revised 与 quarter），不压成单一 rule
  roles:      [{issuer_id, metric, role: 'included'|'excluded', reason?: 'missing_concept'|'unit_excluded'|'read_truncated'|'version_inconsistent'|'not_in_comparable_set'|'financial_excluded'}],
  cells:      [{metric, duration, period_start, status, value_text?, missing_reason?, n_members, n_with_data, n_unresolved}] }
```

全序：`members` 按 `issuer_id`；`facts` 按 `(issuer_id, concept, period_start, period_end, unit, fact_id)`；`roles` 按 `(metric, issuer_id)`。`replayFromManifest(manifest) → cells`（`src/lib/industry/replay.ts`，纯函数，只用 `facts/derived/roles`，不查库）；写入前断言 `replayFromManifest(m).cells` 与计算结果相等，否则该格 `missing(reason='manifest_mismatch')` 并进隔离。CI：删库后仅凭清单重算断言相等。

估值清单（`kind:'valuation'`，每 (code, trade_date) 一份）：`members`、`unresolved`、`member_state_revs`、`marks:[{issuer_id, ticker, trade_date, observation_id, observed_at, close, total_share, raw_hash, locator}]`、`facts`（只含被选的 TTM/权益输入事实）、`derived`、`roles`、`cells:[{metric, status, value_text?, …}]`、`computed_at`。清单**不含**官方对照值（对照结果在 service_role 表 `industry_valuation_pairs`）。

**可得时刻规则（适用于两类清单与两类行）**：一个单元格描述的是期间/日期 `period_end`/`trade_date`，但它作为"输入"或"展示数字"的可得时刻是**发布时刻**——`activate_*` 在全部读取、计算、对账之后于激活阶段捕获的同一数据库时刻（行 `updated_at` = run `activated_at`；building 期间为 null 且行对外不可见）；清单里的 `observed_at`、`facts.available_date` 只说明输入各自何时可得，**不会把后来观测到的修正回溯为更早可得**，也不会把结果回溯到 run 创建时刻（U6）。因此：同一 `trade_date` 的估值在使用了更晚观测（标记修正、迟到披露）后重算，得到的是一条 `updated_at` 更晚的新行，旧行留在被取代的 run 里；承接行在新 run 内重新发布，取新 run 的 `activated_at`；F4 判断引用的是某个 run 的行，其 `available_at` 由 F4 §3.7 的 `table_rows` 规则（`updated_at` 日终，UTC）得出，登记在那之前 `as_of` 的判断对该行会被 F4 判为 `lookahead`。跨 UTC 午夜测试：run 在午夜前创建、午夜后读入一条修正观测并激活 → 行 `updated_at` 在午夜后，前一日 `as_of` 的判断不能引用它。

**体量估算**（成员数未实测，按 L1 平均 150 家估；实施第一步实测后更新）：聚合清单 ≈ 150 成员 × 约 8 个事实行 × 约 250 B ≈ 300 KB 原文、gzip 约 40 KB；每 run 31 × 约 44 期 ≈ 1,364 份 ≈ 55 MB；周频且复用率低（§5.4）→ 每年约 2.9 GB 若不清理；GC 保留活跃 + 最近 12 个 superseded run → 稳态约 0.7 GB。估值清单 ≈ 150 × 2 行 × 250 B ≈ 75 KB 原文、gzip 约 10 KB；每 (code, date) 一份，全量 31 × 约 240 个日期 ≈ 7,440 份 ≈ 75 MB；周增量只重算 `recompute_from` 之后的日期（§6.4），其余承接共享对象 → 周增量 31 × 约 60 × 10 KB ≈ 19 MB，季度全量 75 MB；稳态（保留 12 run）约 0.5 GB。Supabase 存储配额由 owner 确认（§16）。

### 5.4 运行、复用、激活

`runIndustryAggregation(deps, {scheme, version, level, factsAsOf})`：
1. `startBatch(producer='industry-agg', dataset='industry.agg.<scheme>')`；`code_version` 同规格二规则；`createMetricRun({generation = max+1, expected_grid, history_class, config_hash, formula_version, …, status:'building'})`。
2. 就绪门（§4.10）不满足 → run `failed(facts_scope_not_ready)`。
3. `stateFingerprint('CN')`；上一活跃 run 的 `industry_metrics` 行与清单。
4. 对每个 (code, period_end)：**复用条件**（全部成立）：上一 run 同格 `ok` 且 `facts_as_of`、`knowledge_date`、`history_class`、`method_version`、`config_hash`、`formula_version` 相同；成分集合（含未解析集合、每条归属的 `status/valid_to/valid_to_available_date`）与清单 `members/unresolved` 逐条相同；清单 `member_state_revs` 中每个成员的 `state_rev` 等于当前（含无事实成员）；→ 复用清单哈希与行。否则重算、写清单、`replayFromManifest` 自检。`code_version` 不在复用键内（方法与公式版本相同即可复用；新行记录本 run 的 `code_version`，清单保留原 `code_version`）。规格二每次发布都 `state_rev + 1`（含只有重复行的运行），因此复用率预计很低，首版按"每周全量重算"规划预算，复用只是优化。
5. 全部格完成 → `stageMetricRows`（`updated_at` 为 null）+ `stageRunDependencies`（**每格每候选成员**一行：`state_rev` 取该发行人本 run 唯一 `read_facts` 信封的 `stateRev`（V6：一格内各指标共用同一信封，故 (cell_key, issuer_id) 粒度足够且无歧义）；复用格从冻结清单的 `member_state_revs` 复制；函数校验每格的依赖行集合 = 该格候选成员集合，缺失 → `raise 'dependencies_incomplete'`）→ `activateMetricRun`：advisory lock 内校验 `status='building'`；完整性 = `expected_grid` 的每格都有行（`ok` 或 `missing`）；**非过期** = `generation > active.generation` 且 `facts_as_of >= active.facts_as_of`，否则 `raise 'obsolete_run'`；**依赖非回退** = 对 active run 的 `industry_run_dependencies` 中每个 (cell_key, issuer_id)，本 run 若也有同键行则 `state_rev` 不小于 active 的，任何下降 → `raise 'dependency_regression'`（run `failed`；说明某格漏读了更新的发布，重跑即可）；不用 `fingerprint_at`、不用 MIN/MAX 聚合（U4）；然后取一个数据库时刻 `t`，写 run `activated_at=t` 与全部行 `updated_at=t`，切换 active → superseded（U6）。
6. 任一格重算抛错 → run `failed`（行保留，RLS 不可见）。
7. `recordAttempt(tables, 'industry.agg.<scheme>', {ok, cadence:'weekly'})`；`finishBatch(tables, batchId, {counts, errors})`（V10；`Cadence` 联合、窗口 7 天、宽限 2 天与校验列表同步加 `weekly`）。

首版 `aggregate`/`valuation` 在 Mac Studio launchd 脚本运行；cron 版只在实测 < 240 s 时启用。全量耗时实施第一步实测。

### 5.5 回放

- `mode=original`：读清单，返回清单与 `replayFromManifest` 结果及与存储值的相等性（`reproduced: true|false`）。
- `mode=recompute`：按清单的 `facts_as_of/knowledge_date` 用当前证据重算，返回 `match|changed` 与差异（成分、未解析、事实、`state_rev`、标记观测版本）。`changed` 是正常现象（迟到披露、隔离处置、映射升级、成分纠正、标记修正），页面文案如此说明。
- 授权与过滤见 §9。

---

## 6. 行业估值

### 6.1 证券级标记 `security_marks`（观测版本化）

- 适配器 `providers/tushare-marks.ts`：每次运行先 `beginFetchEvent('marks', {trade_date: D}, batch)` 得到 `fetch_event_id`（同一次抓取的重试复用该 id）；`daily_basic(trade_date=D)` 全市场，`has_more` 翻页；`total_share` 万股 × 10000（`transform='wan_to_unit'`）；行经 `apply_observations('marks', fetch_event_id, rows)` 写入。函数对每行（U2/U3 处方）：
  1. 对自然键 `(ticker, trade_date)` 取事务级锁 `pg_advisory_xact_lock(hashtext('marks:'||ticker||':'||trade_date))`（没有当前行时也锁）；
  2. 幂等（V7）：先查回执 `industry_observation_receipts(fetch_event_id, 'marks', natural_key)`：存在 → 该行 `duplicates`，不再与当前内容比较（即使当前观测已被更晚的事件改变）；回执的 `payload_hash` 与本次重试内容不同 → `raise 'fetch_event_payload_changed'`（重试必须是同一份已取得的载荷；新的网络抓取取新事件 id）；
  3. 与**当前** `ok` 观测比较内容（`close`、`total_share` 的规范十进制）：相同 → `duplicates`（不插行）；不同（包括等于某个被取代观测的内容，即 A→B→A 的回归）→ 先把当前 `ok` 观测 `update … set status='superseded'`，再 `insert` 新观测 `ok`（`supersedes=旧 observation_id`，`observed_at=now()`），同一事务，插入失败则整体回滚；隔离 `mark_revised`（供人工看原因）；
  4. 无当前观测 → 直接插入 `ok`。
  5. 每个分支都在同一事务内写回执（`inserted` / `duplicate` / `superseded_previous`）。测试（V7）：A/E1 → 无变化 A/E2 → B/E3 → 重试 E2：B 仍为当前，E2 结果 `duplicates`。
  `raw_hash` 只作证据，不参与身份。估值取 `status='ok'` 的当前观测，并把 `observation_id/observed_at` 冻结进清单；修正后的重算产生新 run 行（可得时刻规则见 §5.3）。测试：A→B→A 三个不同 `fetch_event_id` → 三条观测，当前为第三条；同一 `fetch_event_id` 重试 → `duplicates`；V7 用例见上。
- **估计对象**：发行人 D 日市值 = 其**唯一**主 A 股 ticker（`issuer_securities.is_primary and share_class='A'`，D 日有效；0 或 >1 个 → 角色 `excluded:ambiguous_primary`）的 `close × total_share`；`total_share` 的口径（是否含 H/B 股股本）是 **核对项 2**（已完成，K2：`daily_basic.total_share` = 全部股份类别 A+H+B 发行总数，`float_share` = 流通 A 股；招行、平安、工行、张裕与月报逐股一致），`METHOD_CONFIG.total_share_basis='all_classes_incl_h_b'` 并随方法版本。`security_marks` 增列 `free_share numeric`（可空，Tushare `free_share` 万股 × 10000）供 §6.4 将来的申万口径对照（K1）。
- 期望日期 `expected_dates` 由交易日历生成（Tushare `trade_cal`，字段实施时核对）：全历史每月最后一个交易日 + 最近 2 年每周最后一个交易日；`marks` 任务每次补齐**所有**尚未入库的期望日期（不只是上周五）；空响应 → `skipped_summary(no_rows)` 并在回执标出（不以空响应判定非交易日）。
- 规则：`identityRule('mcap_vs_tushare', close×total_share, total_mv×10000, 0.001)`（同一来源内算术一致性，不是独立核对）失败 → `quarantined`；`rangeRule('close_range', 0.01, 100000)`。独立核对：§13.4 的交易所公布总股本/收盘价金集。
- 不存 Tushare `pe/pb/ps`。

### 6.2 指数公司发布值 `industry_official_valuations`

`providers/tushare-sw-daily.ts`：`sw_daily` 31 × 年份分段，只取 `expected_dates` 的行；每次运行一个 `fetch_event_id`；经 `apply_observations('official', fetch_event_id, rows)` 写入，自然键 `(scheme, version, code, trade_date, metric)`，锁 → 幂等 → 与当前观测比内容 → 先取代后插入，顺序与 §6.1 完全相同；变化隔离 `official_revised`。仅 service_role 可读；官方值永不写入任何公共表或清单。

### 6.3 自算估值（派生统计）

对每个 `D ∈ expected_dates`（`D >= recompute_from`，其余承接）、每个一级行业，`members = membersAt(code, {on: D, knownBy: D})`：
- 每个成员：主 A 股 ticker 的 D 日标记（当前 `ok` 观测；清单冻结 `observation_id/observed_at`）；缺 → `excluded:no_mark`。
- `market_cap = Σ mcap(有标记成员)`；`mcap_coverage = Σ mcap(进入该指标分母集合) / Σ mcap(有标记成员)`。
- `pe_ttm = Σ mcap / Σ ttm_net_income_parent`：每个发行人取 D 日可见（`asOf=D`）、`period_end ≤ D` 的最近一个 TTM（规格二派生，版本一致性规则）；Σ ≤ 0 → `missing(invalid_denominator)`。
- `pe_static = Σ mcap / Σ net_income_parent(12M, 最近一个 period_end ≤ D 且 D 日可见)`：只在 `comparator_basis='static'` 时计算与发布；两者是**不同指标**，各自对账，互不授权。
- `pb = Σ mcap / Σ equity_parent`（最近 INSTANT，负权益照常求和）；Σ ≤ 0 → `missing(invalid_denominator)`。
- `facts_as_of = D`。清单见 §5.3。

### 6.4 运行、两级门控、发布

- `comparator_basis` 来自 **核对项 1**（K1 实测：`sw_daily.pe` 是 **TTM**，但按申万算法——A 股自由流通市值加权调和平均、申万季度日历选 TTM、亏损股市值留在分子；按该算法重建 10 格全部在 0.5% 内；§6.3 现行「Σ总市值/ΣTTM」与官方值差约 +17%（银行）、−3.9%～+3.2%（食饮）；`pb` 口径未确认）。因此 **§6.3/§6.4 需修订后 I-3 才能进计划**：owner/规格作者在 (a) 新增按申万算法的对照指标 `pe_ttm_sw`（需 `security_marks.free_share`，本稿已加列）、现有 `pe_ttm` 对照标 `not_applicable`，与 (b) 保留现公式、`pe_*` 对照全部 `not_applicable`（无官方锚点 → 不发布）之间选择（**新 owner 决策 H**）；`pb` 在 PB 核对完成前 `series_qualified=false`。**本稿 I-3 仍不进计划**（表、函数与标记采集照常落地）。
- 每 run 完整快照（全部 `expected_dates` × 行业 × 指标，每格一行 `ok|missing`，经 `stage_industry_valuations` 暂存，`updated_at` 为 null 直到激活）；`recompute_from = 今天 − 400 天`（周运行）或历史起点（季度全量 / `--recompute-from` 手动）；更早日期从上一活跃 run **承接**（行复制为本 run 的行、清单共享），**承接条件**：上一活跃 run 的 `method_version`、`config_hash`、`formula_version`、`comparator_basis` 与本 run 全部相同，否则本 run 必须从历史起点全量重算（`recompute_from = 历史起点`，承接不允许；运行时自动降级并在回执记 `full_recompute_forced`）。`recompute_from` 只是覆盖元数据，不参与过期判定。
- **逐日对照**（写 `industry_valuation_pairs`，service_role）`pair_status`：`within`（官方当前观测存在且 `|自算/官方 − 1| ≤ 0.01`）、`outside`（存在但超差 → 隔离 `valuation_mismatch`）、`no_official`、`no_computed`（本格 `missing`）、`invalid_denominator`、`not_applicable`（`market_cap`，以及与 `comparator_basis` 不匹配的 `pe_*`）。承接的日期也在本 run 内**重新对照**（官方观测可能已修正）。
- **序列资格** `series_qualified(code, metric)`：对本 run 的完整快照（含承接日期）在 `expected_dates` 上计算：`n_pairs = within + outside` ≥ 0.9 × `n_expected`，且 `within / n_pairs ≥ 0.95`，且 `n_pairs ≥ 24`。每个 run 重新计算，不承接。
- **发布** 由 `publish_industry_valuations(run)`（唯一路径，U5）一次性写：锁 run、校验估值格与对照行一一对应、计算序列资格、`published = series_qualified and pair_status='within' and status='ok'`、run → `published`；此后行与对照行冻结；`no_official`/`outside`/`missing` 的日期不对外；`outside` 与 `no_official` 占比进 run 的 `reconciliation` 汇总与抽屉（抽屉只给占比，官方值本身只在 `official` 数据集 `public` 时经 §9 规则附带）。
- 依赖：`stageRunDependencies('valuation')` 每格（`<code>:<trade_date>`）每候选成员一行，`state_rev` 取该格实际 `read_facts` 信封；承接格从冻结清单复制（U4）。
- 对账结果逐对写 `dq_reconciliations(dataset='industry.val.sw2021')`。
- `official` 数据集不可得（决策 C）→ 全部 `no_official` → 无发布；不以人工金集替代。
- 激活同 §5.4：要求 run 为 `published` 且复核发布不变量；完整性 = `expected_dates` × 行业 × 指标每格有行；非过期 = `generation > active.generation`；依赖非回退 = `industry_run_dependencies` 逐格逐发行人校验；承接兼容性已在运行时保证；激活时刻 `t` 写入 run `activated_at` 与全部行（含承接行）的 `updated_at`（U6）。

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
// hash = digest(snapshot)（F4 规则）；
// available_at：按 F4 §3.7 对 table_rows 的原文规则 = 行的 `updated_at` 日终（两张表的 updated_at = 所属 run 的 activated_at，在全部读取、计算、对账之后于激活阶段写入；U6）；本规格不扩展该规则，不用 facts_as_of、period_end、trade_date 或 run.created_at 作可得时刻；
// origin = { publisher: 'OsbornAlpha', adapter: 'industry-agg/<method_version>' | 'industry-val/<method_version>', locator: 'manifest:<manifest_hash>', transform: config_hash, license: dataset_key }
```

- F4 公共表白名单需加入 `industry_metrics`、`industry_valuations`（依赖接口请求，F4 规格 §3.5 的 `PublicTable`）；两张表都有 `updated_at`（active run 的行必非 null），满足 F4 §3.7 的 `table_rows` 规则无需任何例外。
- `gather(subject={type:'industry', key:'sw2021:2021:<code>'}, asOf, db)`：只能引用 `updated_at ≤ asOf 日终` 的行，即在 `asOf` 之前已经计算并发布的 run（通常是 `asOf` 当日的活跃 run）；一个 run 计算出的历史期间格子对更早 `as_of` 的判断不可用（F4 `lookahead`），这是有意的：判断只能用它登记时已存在的聚合结果。run 为 `reconstruction` 时 `origin.transform` 附 `history_class`。
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

同第 2 稿，增补：详情页估值区按指标分别显示 `published` 序列与"未发布日期占比（outside a% / no_official b%）"；成分页"未解析成分"只给计数（admin 见清单）；抽屉第 3 项"原样回放"显示 `reproduced` 结果与 `replayFromManifest` 的逐角色明细；第 5 项估值另加本格的可得时刻（`updated_at`）、标记观测时刻（`observed_at`）、对照状态（仅 `within`，因为只有它能发布），官方对照值只在 `official` 数据集 `public` 时由路由经 service_role 从 `industry_valuation_pairs` 取一个值附带；所有行业格另显示 run 的 `history_class` 徽标。

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
| `GET …/replay` | `runId`、`metric`、`periodEnd` 或 `tradeDate`、`mode=original\|recompute` | **授权顺序**：`industry_metric_run_visible`/`industry_valuation_run_visible(runId)` → 该格存在且（估值）`published` → 否则 404 `unknown_cell`；返回的清单**按格过滤**：`members/unresolved/member_state_revs` 全量，`facts/derived/roles/marks` 只含该 `metric` 的角色与输入，`cells` 只含该格；清单本身不含官方值；估值格的 `officialValue` 字段只在 `industry_dataset_is_public('official:tushare-sw_daily')` 时由路由从 `industry_valuation_pairs` 读取并附带，否则字段缺省（测试：`scheme` public + `official` internal 时响应无该字段）。`failed` run 与未发布格只经 admin 路由。限流每 IP 每分钟 10 次（内存计数，多实例尽力而为）；`max-age=3600` |
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
| `memberships-sic` | `0 2 * * *`（每日，`limit=200`；第 69 条） | cron |
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
| 完整性/过期/依赖缺失或回退/发布不变量 | run `failed`（依赖回退：重跑即可） | `incomplete_run` / `obsolete_run` / `dependencies_incomplete` / `dependency_regression` / `pairs_mismatch` | failed |
| 估值承接不兼容（方法/配置/公式/对照口径变化） | 自动改为全量重算 | `full_recompute_forced`（信息） | — |
| 归属应用失败（解析事务回滚） | 来源记录保持未解析并记 `resolution_error` | `skipped_summary(apply_failed)` + 隔离 | partial |
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
`industry.integration.test.ts`：迁移可重放两次（含 `dq_freshness` CHECK 改动与 `weekly` 写入、归属表主键改动、**旧排他 `issuer_industry_memberships_no_overlap` 已不存在**、`superseded_by` FK 为 deferrable）；复合 FK；层级排他（仅 `ok` 行参与；`superseded` 历史版本与新版本同键并存）；生命周期触发器（`ok→superseded` 必须同语句带 `superseded_by`）；`apply_industry_memberships` 原子（预分配 id、取代更新、插入、解析落账同事务；替代行插入失败时取代更新回滚；失败后来源仍未解析且 `resolution_error` 非空）、并发、取代转换；`apply_observations`：同自然键并发两事务串行、先取代后插入、A→B→A 三个 `fetch_event_id` 产生三条观测、同 `fetch_event_id` 重试 `duplicate`、同内容不插行；`issuers_cninfo_idx` 存在（不新增等价索引）；两类 run 的 `generation` 唯一与活跃唯一；`stage_*` 只接受 `building`、强制 `published=false`/`updated_at=null`；`activate_*` 的完整性、`obsolete_run`、`dependencies_incomplete`、`dependency_regression`（构造 active run 某格某发行人 `state_rev` 高于新 run 同格同发行人；同 run 内不同格不同 `state_rev` 可激活）；连续两次周运行（不同 `recompute_from`）都能激活；**U5**：`service_role` 直接 `insert … published=true`、直接 `update published`、直接 `delete` 对照行均被权限拒绝（`42501`），全部函数 `prosecdef` 且所有者 = 表所有者、`service_role` 对受保护表直接 `truncate` 也 `42501`（V1/V2），run 表直接 `update status` 被拒、`active` run 无法被改回 `building`（V2），发布后 `update` 被冻结触发器拒绝；**U6**：激活后全部行 `updated_at = run.activated_at`，building 行 `updated_at is null` 且 anon 不可见，跨 UTC 午夜用例（run 午夜前创建、午夜后激活 → `updated_at` 在午夜后）；函数 `search_path`/`EXECUTE` 权限（anon 只能执行四个只读函数；`pg_proc.proconfig` 断言）；RLS 真实角色三态 + `failed` run 不可见 + 未 `published` 估值不可见 + `official`/`pairs`/`source_memberships`/`licenses`/`run_dependencies`/`fetch_events` 不可见 + **`scheme` public 且 `official` internal 时 anon 在任何公共表/视图都取不到官方值**；`industry_freshness()` 只返回三列。

### 13.3 离线集成（critical）
`sync.integration.test.ts`：申万来源记录两遍；解析（含 `out_date` 更正 → 旧归属 `superseded`）；`load-a-share`；标记 + 规格二 A 股夹具 → 聚合 run → 删库后仅凭清单 `replayFromManifest` 相等；注入更晚 filing 夹具（规格二写路径）→ `recompute` 为 `changed`，重算得到的新行 `updated_at` 为新 run 时刻；第二次运行复用（构造 `state_rev` 不变的夹具）；估值 run 两级门控（三种不达标各自不发布；`outside` 日期不发布而同序列其他日期发布）；承接：第二次周运行承接旧日期、第三次改 `config_hash` 后强制全量；标记修正后估值重算行的 `updated_at` 晚于修正观测；`/replay` 对未发布格 404，对 `official` internal 不含 `officialValue`。

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
6. 延迟工作者：旧 run 在新 run 激活后尝试激活 → `obsolete_run`，active 不变；新 run 漏读了某发行人的更新发布 → `dependency_regression`，重跑后激活。
8. 估值：连续两个周运行各自以 `今天 − 400 天` 承接并激活；改 `config_hash` 后的运行自动全量重算；`official` 为 `internal` 时 anon 取不到任何官方值。
7. 断网：run `failed`，active 不变，页面旧 run + `error` 徽标。

---

## 15. 独立验证（除实现者之外）

同第 2 稿（官方对账全窗口结果、市值口径金集、证监会/SIC 对照、每周回放抽样、对方热力图私有回归样本、卖方分析师抽样），增：
- Codex 三轮（`05-codex-round3.md`，第 3 稿）与四轮（`06-codex-round4.md`，只审第 4 稿新引入缺陷并给终审）；处置表 `03-disposition.md`。
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
| **决策 G**：历史重建期（`history_class='reconstruction'`，v1 申万全部如此）是"显示 + 徽标"还是"抑制到有公告日证据与 `as_of` 解析为止" | owner | I-2 前 | 显示 + 徽标 |
| **核对项 1**（I-3 前置）：`sw_daily` `pe/pb` 口径 → `comparator_basis` | 实施者 | 2026-11-06 完成（K1）：`ttm`（申万算法）；`pb` 未定 | §6.4 需修订 → 决策 H |
| **决策 H**：估值对照口径 (a) 申万算法对照指标 `pe_ttm_sw` / (b) 无对照不发布 | owner | I-3 计划前 | 未选 → I-3 不进计划 |
| **核对项 2**：`daily_basic.total_share` 是否含 H/B 股 → `total_share_basis` | 实施者 | 2026-11-06 完成（K2）：`all_classes_incl_h_b` | — |
| **核对项 3**：`index_member_all` 两遍覆盖、`out_date`、2021 前 `in_date`、`parent_code` 命名空间 → 历史起点与 `history_class` | 实施者 | 2026-11-06 完成（K3）：31/134/346；`parent_code`=`industry_code`；`out_date` 含当日；退市不关窗；2021-07-30 前为回溯映射；别名 850412→850401 | — |
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

第 7 稿补充 K4（2026-11-06，实施复审发现）：`n_unresolved` 排除已退市 ts_code（新表 `industry_security_delistings`）。

第 7 稿（2026-11-06）：核对项 1–3 与 §17.1 实测（`03-tushare-verification.md`，真实录制夹具 36 份）——K3 窗口 `valid_to=min(out_date+1, delist_date)`、`membership_after_delist`、`stock_basic` 显式 L/D/P、别名表、`parent_code` 命名空间、`n_unresolved` 的 `out_date >= on`；K2 `total_share_basis`；K1 `comparator_basis=ttm`（申万算法）使 §6.3 公式无法通过对照 → 新 owner 决策 H，I-3 仍不进计划，`security_marks.free_share` 先行加列。§17.1 已答：退市公司 `stock_basic`（需 `list_status='D'`）与 `income` 都可取。

第 6 稿（2026-11-06）相对第 5 稿的变化，均来自 Codex 第五轮增量审计（`docs/audits/2026-11-06-industry-research/01-codex-spec-round5.md`，处置表 `02-disposition.md`）：V1 取消 `industry_publisher`，沿用计划二"迁移角色拥有表与函数 + 撤销 `service_role` 写权限"的模型；V2 run 表写权限撤销、建/失败/覆盖/授权/来源记录/SIC 全部经函数，状态转换与元数据冻结；V3 行业宇宙并入 `desiredCn`（开关 `FACTS_CN_INDUSTRY_UNIVERSE`）；V4 CN 启用依赖；V5 清单保留 `MetricRow.inputs`；V6 每 run 每发行人一个事实信封；V7 观测回执表；V8 剪除路径与冻结触发器兼容；V9 迁移 `20261111090000`/`20261111091000`；V10 调用签名；V11 复用 `issuers_cninfo_idx`；V12 开篇可得时刻规则。另（指挥会话自查）：清单 GC 拆为"列候选 + TS 删桶对象 + 删索引"，因为迁移不能引用 `storage.objects`。

### 18.1 计划 `2026-11-06-industry-research` 的实施记录与偏差（Task 1–20 与修复批次 1–8）

来源：计划骨架《已知规格偏差》节（逐条、同编号）。"决定"不改变规格语义；"偏差"与规格文字不同。

| # | 范围 | 类别 | 内容 |
|---|---|---|---|
| 1 | 迁移与契约（Task 1–4） | 决定 | `coverage_summary` 默认 `'{}'` 并约束为 object（规格写 `'[]'`；契约类型是 `Record<string,unknown>`，`set_*_coverage`/`fail_*` 写对象键）。 |
| 2 | 迁移与契约（Task 1–4） | 决定 | `membership_id` 只做主键（主键已含唯一性，未另加 unique）。 |
| 3 | 迁移与契约（Task 1–4） | 决定 | 估值行激活盖章顺序为先置 run `active` 并写 `activated_at = t`，再写行 `updated_at = t`；冻结触发器放行条件为"run 为 active、只改 `updated_at`、旧值 null、新值 = run.activated_at"（规格写"run 状态为 published"，不变量相同）；同一触发器用于 `industry_metrics`；delete 放行 run 为 `superseded/failed` 或 run 已不存在（级联）。 |
| 4 | 迁移与契约（Task 1–4） | 偏差 | `dependencies_incomplete` 在**激活时**校验（暂存分块，stage 函数里无法校验整格）。 |
| 5 | 迁移与契约（Task 1–4） | 决定 | GC 两函数增加 `p_min_age_seconds default 86400`；`put_industry_manifest` 冲突时刷新 `created_at`；`prune_industry_runs` 增加可选 `p_scheme/p_version`（契约方法只传 `p_keep`）。 |
| 6 | 迁移与契约（Task 1–4） | 决定 | advisory lock 键带命名空间与分隔符：`'industry-run:<kind>:<scheme>:<version>:<level>'`、`'industry-obs:<kind>:<natural_key>'`、`'industry-src:<source>:<ts_code>:<l3_code>:<in_date>'`。 |
| 7 | 迁移与契约（Task 1–4） | 偏差 | `industry_state_fingerprint` 返回 `{taken_at, revs:[{issuer_id,state_rev}]}`（规格只写了数组；契约要 `takenAt`）。 |
| 8 | 迁移与契约（Task 1–4） | 决定 | 额外保护——`industry_source_memberships_immutable` 触发器（证据列不可改、不可删）；`security_marks`、`industry_official_valuations`、`industry_valuations` 加 `*_text` 生成列（PostgREST 把 numeric 发成 JSON 数，十进制字符串端到端靠它们）。 |
| 9 | 迁移与契约（Task 1–4） | 决定 | 迁移一开头按函数访问顺序 `lock table … in access exclusive mode` 锁已存在的行业表，随后是"归属表必须为空"的升级守卫 `industry_upgrade_requires_empty_memberships`（生产该表此前无写入者）。 |
| 10 | 迁移与契约（Task 1–4） | 决定 | 估值激活时 run 不是 `published` → `illegal_transition`；聚合激活时 run 不是 `building` → `run_not_building`。 |
| 11 | 迁移与契约（Task 1–4） | 偏差（集成） | 激活完整性按 `(code, metric, duration, period_end)` 校验（规格 §5.4 只说 `expected_grid` 的 codes × period_ends × metrics），`(metric, duration)` 表 = `method.ts::cellSpecs`（与 22 一致）。 |
| 12 | 迁移与契约（Task 1–4） | 决定（第 7 稿 K3） | 未解析计数 `unresolvedOf/Count` 用 `in_date <= least(on, knownBy)` 与 `out_date is null or out_date >= on`（`out_date` 含当日）；SQL/pg/内存与 `memberships.ts::countUnresolved` 逐条一致。 |
| 13 | 迁移与契约（Task 1–4） | 决定（集成） | `upsertClassifications` 对 `attributes` 也做（键序无关的）比较，不同即 `conflicts` 不覆盖；Task 7/9 把冲突一律隔离为 `classification_name_conflict`——上游只改 `is_pub` 等属性时也会以该码隔离。 |
| 14 | 迁移与契约（Task 1–4） | 决定 | `src/lib/entities/issuers.integration.test.ts` 的 INDUSTRY 块按迁移一后的状态改断言、重放计划一迁移后接着重放迁移一（先锁 `issuers` 防死锁）；`dq_freshness` weekly 改动与计划三逐字相同、不加标记。 |
| 15 | 采集与成分（Task 5–9） | 偏差 | 规格的 `src/lib/entities/load-a-share.ts` 落在 `src/lib/industry/load-a-share.ts`；`providers/tushare-sw.ts` 落在 `providers/tushare-industry.ts`（计划文件表）。 |
| 16 | 采集与成分（Task 5–9） | 偏差 | 规格说分页用 `keysetAll`；计划二的 `scope.ts::keysetAll` 保持原样（只服务计划二调用方）。工业侧使用 `src/lib/industry/keyset.ts::industryKeysetAll`（不依赖 `scope.ts`）：每页从上一页末值（含）重启，读到某页没有新行才结束，不以短页结束（服务端页大小可能小于 `MAX_PAGE`）；整页 `MAX_PAGE` 行都已见过（同值组无法推进）则抛 `scope_tie_group_overflow`，绝不静默截断。`facts-scope.ts` 与 `run-aggregation.ts` 使用它，另加 `scope.ts::currentSecurities`。 |
| 17 | 采集与成分（Task 5–9） | 决定 | `industryCnUniverse` 经 service-role `TableClient` 直接读 `industry_source_memberships`（生产 `desiredCn` 只有 `tables` + `FactsDb`；见《跨任务接口约定》B1）。 |
| 18 | 采集与成分（Task 5–9） | 决定 | SIC 节点平铺为 level 1（`parent_code null`，`attributes {office}`），`apply_sic_memberships` 行 level = 1。 |
| 19 | 采集与成分（Task 5–9） | 决定（第 7 稿 K1–K3） | 夹具为 2026-11-06 的真实录制（36 份，逐字节拷贝，保留 `request`/`response_sha256`）；真实数据造不出的情形在测试内以标注的"synthetic edit of a real response"构造，不建合成夹具文件；`parent_code` 属 `industry_code` 命名空间（`index_code` 形式仍防御性接受），原值存 `attributes.parent_industry_code`。 |
| 20 | 采集与成分（Task 5–9） | 已知限制 | `load-a-share` 跳过已退市 `stock_basic` 行（§4.7 第 4 步），历史成员在规格三落地前保持未解析（K4 之后：已退市 ts_code 的来源记录不再计入 `n_unresolved`，见第 70 条）；上游消失的来源记录保持 `current`（规格未定义来源记录的退役）。 |
| 21 | 聚合、清单、标记（Task 10–14） | 偏差（契约变更） | `ManifestRole` 加 `duration`；清单 `roles` 全序为 `(metric, duration, issuer_id)`（规格 §5.3 写 `(metric, issuer_id)`）。同一指标在 12-31 有 12M 与 3M 两格，一个发行人可能一格纳入、一格排除。 |
| 22 | 聚合、清单、标记（Task 10–14） | 偏差 | `12M` 格只在 `period_end` 为 12-31 时存在（A 股 12M 事实是会计年度；其他季末 12M 格恒为空集）；其他季末用 `3M` 与 `TTM`。 |
| 23 | 聚合、清单、标记（Task 10–14） | 决定 | 同比的上年同期 = 期间起止各移一年的精确匹配（不用计划二 derive 的 350–380 天窗口）；同集合 = 当期与上年同期都有值的成员。 |
| 24 | 聚合、清单、标记（Task 10–14） | 决定 | `roe` 分母 Σ(期初+期末)/2 ≤ 0 → `missing(zero_denominator)`（与计划二个股 ROE 非正平均权益不出值一致）。 |
| 25 | 聚合、清单、标记（Task 10–14） | 决定 | `unresolved_over_limit` 只在 `n_members=0` 且 `n_unresolved>0` 时使用；显示阈值从不改变 `status`（§5.2）。 |
| 26 | 聚合、清单、标记（Task 10–14） | 已废止 | 修复批 5：就绪门分母现为全宇宙（`factsUniverse`），不再是本 run 网格的成员并集；见 75、76。 |
| 27 | 聚合、清单、标记（Task 10–14） | 决定 | 状态指纹用 `FactsDb.scopeAll('CN')`（一次读取同时给 `state_rev` 与 `last_success_at`）；`fingerprint_at` 是该读取的客户端时刻（仅编排元数据，U4）；`IndustryDb.stateFingerprint` 未被编排使用。 |
| 28 | 聚合、清单、标记（Task 10–14） | 决定 | 清单只在该组至少一个格 `ok` 时上传（全 `missing` 的组没有行引用它）。 |
| 29 | 聚合、清单、标记（Task 10–14） | 决定（集成） | `mark_revised` 隔离由 `apply_observations` 在同一事务内写（Task 2 SQL / Task 3 内存）；`marks.ts` 不预读当前观测、不重复写。 |
| 30 | 聚合、清单、标记（Task 10–14） | 决定 | Task 14 用 `IndustryDb` 契约（`upsertSourceMemberships` → `applyMemberships`）播种成分，与 Task 7/8 编排调用同一组 RPC，但不依赖其编排函数签名。 |
| 31 | 聚合、清单、标记（Task 10–14） | 决定 | `AggregationOptions.level` 是 `number`（生产传 1），另有 `codes?` 过滤（脚本与 Task 14 用）。 |
| 32 | 聚合、清单、标记（Task 10–14） | 决定（集成） | `buildCellManifest`（`/replay?mode=recompute`）与 run 共用 `loadGroup/readIssuerFacts/computeGroup`；recompute 清单头的 `code_version` = 当前部署的 `VERCEL_GIT_COMMIT_SHA`（缺省 `'unknown'`）。 |
| 33 | 聚合、清单、标记（Task 10–14） | 决定（第 7 稿 K1/K2） | `security_marks` 增可空列 `free_share`（Tushare `free_share` 万股 × 10000，非正视为缺失）；它属于观测内容（修订 → 新观测，`payload_hash` 含它）；`METHOD_CONFIG.total_share_basis='all_classes_incl_h_b'`、`code_aliases` 入 `METHOD_CONFIG`（`CONFIG_HASH` 钉值随之更新；方法版本仍为首发的 `industry-agg/1.0`）。 |
| 34 | 读接口、页面、调度（Task 15–20） | 偏差 | `/replay` 另收可选 `duration`；同一 `period_end` 有多格（12M 与 3M）而未给 → 400 `invalid_parameter:duration`（格主键含 `period_start`/`duration`）。 |
| 35 | 读接口、页面、调度（Task 15–20） | 偏差 | `/replay` 估值格只做授权顺序与 `officialValue`，不读估值清单，返回 `replay:'deferred_i3'`（I-3 未实施）。 |
| 36 | 读接口、页面、调度（Task 15–20） | 决定 | `/replay?mode=recompute` 依赖 `buildCellManifest`；差异按成分/未解析/事实/state_rev/格列出（§5.5）；`filterManifest` 的 `roles` 按 metric **和**格的 duration 裁剪（见 21）。 |
| 37 | 读接口、页面、调度（Task 15–20） | 偏差 | `GET /api/entities/[issuerId]/industries` 另返回 `schemes:[{scheme,version,datasetKey,public}]`（公司页区分"授权待确认"与"无分类"）。 |
| 38 | 读接口、页面、调度（Task 15–20） | 偏差 | admin replay 另返回 `focus`（与公共 original 回放同形），供内部预览的来源抽屉使用。 |
| 39 | 读接口、页面、调度（Task 15–20） | 决定 | cron/脚本作业门——Tushare 作业无 token → 503 `tushare_unavailable`；`facts-scope`/`aggregate` 的 apply 未开 `FACTS_CN_INDUSTRY_UNIVERSE`/`FACTS_CN_ENABLED` → 403 `job_disabled`；`official`/`valuation` → 200 `skipped:'deferred_i3'`（owner 默认 E、V4）。 |
| 40 | 读接口、页面、调度（Task 15–20） | 决定（集成） | `memberships-sic`、`marks`、`aggregate` 无 dry-run（运行函数总是写库），dry-run 返回 `dry_run_unsupported`；`marks` 的交易日必须显式给出（`trade_cal` 随 I-3 延后）；`facts-scope` 作业在 `jobs.ts` 内实现（dry-run = `industryCnUniverse`，apply = `reconcileScope`）；`load-a-share` 的 `--limit` 映射为 cninfo 查询上限 `maxLookups`。 |
| 41 | 读接口、页面、调度（Task 15–20） | 决定 | `vercel.json` 只加 `memberships-sic`（频率与上限见第 69 条）；其余作业为脚本（owner 默认 E；无 Tushare token）。 |
| 42 | 读接口、页面、调度（Task 15–20） | 决定 | 表格"同比"只显示存储的同比指标（营收、归母净利），其余显示 "—"（页面不做派生运算）。 |
| 43 | 读接口、页面、调度（Task 15–20） | 决定 | 列表页判断区只放"未设判断"说明；F4 卡在详情页（F4 主体是单个行业）。 |
| 44 | 读接口、页面、调度（Task 15–20） | 偏差 | 成分页 L2 过滤未做（画布有）；路径列显示二级/三级。 |
| 45 | 读接口、页面、调度（Task 15–20） | 决定 | 页面"上次成功响应"为进程内内存（单实例、≤ 200 个查询、读到 `unlicensed` 即清除）。 |
| 46 | 读接口、页面、调度（Task 15–20） | 偏差 | E2E 为夹具模式（`INDUSTRY_E2E_FIXTURES=1`，非生产），不连数据库（§13.5）。 |
| 47 | 读接口、页面、调度（Task 15–20） | 决定 | §7.1 输入适配——`industry_valuations` 自然键可解析、构造返回 `unsupported_deferred_i3`；`origin.adapter` = run 的 `method_version`。 |
| 48 | 读接口、页面、调度（Task 15–20） | 偏差 | 三级文字用 `text-text-dim`（#a1a1aa），不用画布的 Distant Fog（对比度不足，待 owner 确认）。 |
| 49 | 读接口、页面、调度（Task 15–20） | 决定 | 新鲜度数据集名以运行函数实际写入为准（见《跨任务接口约定》B3）；读模型 `AGG_FRESHNESS = {sw2021:'industry.agg.sw2021'}`、`MEMBERSHIP_FRESHNESS = {sw2021:'industry.sw2021.memberships', sic:'industry.sic.memberships'}`。 |
| 50 | 第 7 稿 K1–K3 带来的窗口与代码规则（Task 5–8） | 偏差（第 7 稿 K3） | 成分窗口 `valid_to = valid_to_available_date = min(out_date + 1 日, delist_date)`；`in_date >= delist_date`（规格写 `>`；相等时窗口为空）→ 不写归属，隔离 `membership_after_delist`。 |
| 51 | 第 7 稿 K1–K3 带来的窗口与代码规则（Task 5–8） | 决定（第 7 稿 K3） | `out_date = in_date` 是合法的单日记录，只拒绝 `out_date < in_date`；成员代码经 `SW2021_CODE_ALIASES`（`850412.SI→850401.SI`）映射，原值存 `locator.code_aliases`；L1/L2/L3 任一不在分类树 → 隔离 `classification_code_unknown`、不写。 |
| 52 | 第 7 稿 K1–K3 带来的窗口与代码规则（Task 5–8） | 决定（第 7 稿 §17.1） | `load-a-share` 取 `stock_basic` 的 `L`、`D`、`P` 三遍（D 行只记 `skipped_summary(delisted)`，规格 §4.7 第 4 步）；`runResolveMemberships` 另取一次 `list_status='D'` 得 `delist_date`。 |
| 53 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#1） | 客户端组件只经 `display.ts` → `method-constants.ts`（无 import）取方法常量；`method.ts` 再导出它们；守卫测试扫描客户端 import 图；Task 20 门禁加 `npm run build`。 |
| 54 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#2） | 页面"上次成功响应"只在本次授权重验通过后显示（重验失败或为 false → 关闭并忘掉该数据集），2 小时过期，授权开关路由切换后立即失效（规格 §11 的"上次成功响应"收紧，§4.8 授权门优先）。 |
| 55 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#3） | 已解析成分在股票后来退市时由 `reconcileDelistings` 经 `apply_industry_memberships` 的关窗步骤就地关到 `min(out_date+1, delist_date)`；已关闭且终点不同的不改写，隔离 `membership_delist_conflict`。 |
| 56 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#4） | 清单 GC 改为认领/tombstone 协议（`industry_manifests.gc_claimed_at`；认领期间登记与暂存引用都被拒 `manifest_gc_in_progress`；认领超过 1 h 可重认领）；`ManifestStore.put` 改为先登记后上传。新错误码 `manifest_gc_in_progress` 进共享契约。 |
| 57 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#5） | 成分取代按"来源谱系 + 层级"配对后继（不再只按层级取第一个）。 |
| 58 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#6） | SIC 调度行以 `(updated_at, lease_batch_id)` 做 compare-and-swap 认领，完成以 `lease_batch_id` 为栅栏；新行只 insert、从不覆盖已有行与租约。 |
| 59 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#7） | 离开 US 事实范围的 SIC 调度行被退役（`next_due_at='9999-12-31T00:00:00Z'`），回到范围再激活；取到期行时分页过滤到凑满 `limit` 个合格行。 |
| 60 | Codex 计划审计第 1 轮（`06-codex-plan-round1.md`）带来的决定 | 决定（#8） | E2E 夹具的每个格由真实计算生成的独立清单支撑，原样回放必须 `reproduced="true"`；另有一个故意篡改的格断言 `reproduced="false"`；`fixture-rows.ts::manifestOf` 标明只作版面（使用处都 mock 回放）。 |
| 61 | Codex 计划审计第 2 轮（`08-codex-plan-round2.md`）带来的决定 | 决定（R2-1） | 清单对象键按登记代次区分 `sha256/<hash>/<upload_id>.json.gz`，索引行存 `object_path`，读写都走索引路径；GC 认领发 `gc_claim` 令牌，只删认领到的路径，`delete_industry_manifests(jsonb)` 只删令牌仍匹配的行（规格 §8 的 `sha256/<hash>.json.gz` 路径改为带代次）。 |
| 62 | Codex 计划审计第 2 轮（`08-codex-plan-round2.md`）带来的决定 | 决定（R2-2） | 已关闭窗口在后来得知更早的退市时，由新函数 `correct_industry_membership_windows` 在同一事务内把旧 `ok` 行置 `superseded` 并插入 K3 截短的新行（同来源记录、谱系保留）；只有数据库拒绝时才隔离 `membership_delist_conflict`（取代第 55 条的"不改写"）。 |
| 63 | Codex 计划审计第 2 轮（`08-codex-plan-round2.md`）带来的决定 | 决定（R2-3） | `apply_sic_memberships` 加 `p_lease_batch`，事务内锁住调度行验证租约归属与未过期，否则 `lease_lost`；`sec_submissions` 出处并入同一事务（新参数 `p_sec_submissions`，`p_code` 为空时只写出处、返回 `none`）。新错误码 `lease_lost` 进共享契约。 |
| 64 | Codex 计划审计第 3 轮（`10-codex-plan-round3.md`）带来的决定 | 决定（R3-1） | 已解析成分在得知退市日 `<=` 窗口起点时（无有效区间），`correct_industry_membership_windows` 在同一事务内把这些 `ok` 行改为 `quarantined`（不插后继），聚合排除；同时记 `dq_quarantine(membership_after_delist)`。 |
| 65 | Codex 计划审计第 3 轮（`10-codex-plan-round3.md`）带来的决定 | 决定（R3-2） | `apply_sic_memberships` 先 `FOR UPDATE` 锁调度行，再以 `clock_timestamp()` 校验租约归属与未过期，然后才做任何写入。 |
| 66 | 读接口、页面、调度（Task 15–20，修复批次） | 偏差（画布抽屉内容未实现） | A 类抽屉缺 Σ 值与文件链接；B 类缺逐角色差异表、隔离链接、复制哈希；C 类缺 Σ mcap、相对差、历史类别、标记输入；D 类缺成分历史与解析过程。当前抽屉按规格 §8.5 的最小内容集实现（值/覆盖/回放/输入前 5/成分来源）。 |
| 67 | 读接口、页面、调度（Task 15–20，修复批次） | 偏差（对比度） | 浅色主题下 `--accent`/`--warn` 与背景对比度约 2.9:1，低于 WCAG AA 4.5:1。属 DESIGN.md 令牌问题，留给 DESIGN.md 所有者；本计划未改令牌。 |
| 68 | 读接口、页面、调度（Task 15–20，修复批次） | 偏差（Task 18） | 列表页 CSV 导出未实现；移动端"表格优先"未实现（移动端仍以热力图最近 5 期为主、表格视图一键可达）。 |
| 69 | 读接口、页面、调度（Task 15–20，修复批次） | 决定（Codex task16 P1） | SIC 调度改为每天 `0 2 * * *` 且带 `limit=200`（`vercel.json`）。cron 路由已透传 `limit`（1..500），`runMembershipsSic` 默认 200，到期间隔 `NEXT_RUN_MS=7 天`，所以每天最多处理 200 个到期发行人，US 范围在数日内排空，之后每个发行人每周刷新一次；`dq_freshness` 仍为 weekly。 |
| 70 | 采集与成分（修复批次 3/8） | 决定（第 7 稿 K4） | 新表 `industry_security_delistings`（`stock_basic list_status='D'` 遍写入，保留页面证据，日期变化隔离 `delist_date_changed`，仅 service_role）；`n_unresolved` 排除 `delist_date <= on` 的 ts_code；`load-a-share` 的 D 行仍只记 `skipped_summary(delisted)`，不建发行人。 |
| 71 | 读接口、页面、调度（Task 15–20，修复批次） | 偏差（Task 19，Codex task19 / 批 9） | 成分页（constituents）未提供 L2 过滤（规格 §8.4 的层级筛选）；当前只按日期与分页浏览该节点成分，L2 路径列仅作展示。 |
| 72 | 采集与成分（修复批次 3/8） | 偏差（修复批 8） | `reconcileDelistings` 遇到已解析记录且无可用退市日的 D 行，记为错误/隔离，但其 `ok` 行保持开放（谱系隔离 `quarantineMembershipLineage` 只处理未解析的取代记录）。 |
| 73 | 采集与成分（修复批次 3/8） | 决定（修复批 8） | 许可操作者（`actor`）必须是 `auth.users` 的 id；审计日志在同一事务内写入（`set_industry_dataset_license`）。 |
| 74 | 聚合、清单、标记（Task 10–14） | 决定（Task 14） | `sync.integration.test.ts` 的 `REUSE_OPTS`（不带 `codes`）用于复用类用例，因为 `codes` 现在只选择重算的组，发布网格恒为该层级全部代码（见 76）；首个 run 与更正用例仍用带 `codes` 的 `OPTS`。 |
| 75 | 聚合、清单、标记（Task 10–14） | 决定（修复批 9） | `AggregationDeps.factsUniverse?` 可注入就绪门分母（生产缺省为数据库全局计算 `factsUniverse()`）；与其他套件共库的测试注入自己的发行人集合。 |
| 76 | 聚合、清单、标记（Task 10–14） | 偏差（修复批 5） | 发布网格恒为该层级全部代码（全网格发布）；`codes` 只选择重算哪些组，且就绪门分母是全宇宙；因此废止原第 26 条。 |

本轮不实施（规格自己的门）：I-3 估值计算/对账/发布（核对项 1、2 已完成，但 §6.3 公式无法通过申万对照，等 **owner 决策 H**）；§13.4 黄金断言（需 owner 抄录）；`history_class` 恒为 `reconstruction`（K3：2021-07-30 前为回溯映射，之后也只有生效日）。

---

## Claude Design 画布

画布：[行业研究 Industry Research](https://claude.ai/artifact/S7UgKWjfFxLHh1tkNg89e3)（2026-11-04；10 个画板：桌面 7、移动 3）。画布为私有，owner 从页面 Share 菜单共享后其他人才能打开。

| §8.6 待设计项 | 画板 |
|---|---|
| 1 行业列表（热力图 / 表格 / unlicensed / stale） | 列表 · 热力图；列表 · 表格视图；状态；移动 · 列表 |
| 2 行业详情（估值已发布 / 未对账；判断区未设 / 未校准） | 行业详情；状态；移动 · 详情 |
| 3 成分页（日期选择器、`current_only`） | 成分页 |
| 4 来源抽屉（聚合 / 估值 / 成分行；`match` / `changed`） | 来源抽屉；移动 · 来源抽屉 |
| 5 `/intel` 入口卡与 `/stock/[ticker]` 所属行业行 | 入口与组件 |
| 6 组件（覆盖徽标、新鲜度、方案/层级切换、分位条） | 入口与组件 |
| 第 5 稿增补：`reconstruction` 徽标与说明态、估值“部分日期未发布”态、抽屉 `reproduced=false` | 状态；行业详情；来源抽屉 B |

约定：只用 `DESIGN.md` / `globals.css` tokens（黄铜唯一强调色，无紫色、无渐变）；热力图单色黄铜透明度 0.12–0.6 并叠印数值；每张图有同一序列的表格视图；每个数字是打开来源抽屉的按钮；画布上的数值均为版式示意。偏差待 owner 确认：三级文字用 `#8b8b94` 代替 Distant Fog `#52525b`（后者在深底上对比度约 2.6:1，低于 4.5:1）。
