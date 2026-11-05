# 行业研究模块设计规格 · 分类成分 + 行业聚合事实 + 行业估值 + 页面

日期：2026-11-04（第 1 稿；审计轨迹：`docs/audits/2026-11-04-industry-research/`）
状态：草案，待 owner 评审（§16 有四项 owner 决策，其中分类授权与首发方案决定本规格能否进入计划）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一：`issuers`、`industry_classifications`、`issuer_industry_memberships` 已建表未加载，§1.2 把加载与授权交给本规格；§14 为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二第 3 稿：`financial_facts` 披露日志、`financial_metrics`、`getFactsAsOf`、读接口 `/api/facts/[ticker]`、`/api/facts/[ticker]/metrics`；本规格的行业聚合只从这些事实计算）；`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（共用的 UI 约定：来源抽屉、zh/en、表格等价视图、`DESIGN.md` tokens、快照模式）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。本规格逐条对照其硬约束：

| 总纲约束 | 本规格的落点 |
|---|---|
| 1 只用一手来源；Tushare 仅作适配器并记录上游；对方数据一律不导入 | §4 分类来源表：美股 SIC 来自 SEC `submissions`（一手）；申万 2021 经 Tushare `index_classify`/`index_member_all` 适配，上游记为"申万宏源研究所"，授权为 owner 决策；证监会 2017Q2–2021Q3 季度分类结果 PDF 只作人工对照金集。对方页面的 31×10 热力图只作回归对照样本（§15） |
| 2 每个展示数字可回放（源文件、行、可得日期、变换、代码版本） | 行业聚合行带 `inputs_digest`、`facts_as_of`、`method_version`、`code_version`；`/replay` 接口现场重算输入清单并校验摘要（§5.5、§9）；成分行带 `provenance.raw_hash` 与行定位（§4.4） |
| 3 事实与判断分层 | 行业财务聚合、估值序列、分位数是事实或确定性派生统计；生命周期阶段、景气评分、高估/低估结论是判断，全部交给 F4 判断框架（§7），本规格只定义输入接口与展示约束 |
| 4 缺失就是缺失；行业指标用当时成分股（point-in-time）；聚合方法显式 | 不做占位、不做代理维度（§3 对方的"估值 50 占位""利润增速代理现金流"不复制）；每个聚合行记录 `n_members`/`n_with_data`，成分按 `period_end` 当日有效的归属窗口取（§5.2）；方法名与版本进每一行 |
| 6 UI 遵守 `DESIGN.md`/`globals.css`；中英双语；图表有表格等价视图 | §8 |

已定决策（owner 2026-11-04，见总纲与规格一/二）：港股事实延后到 F3，因此港股行业成分与聚合也延后；美股事实来源 EDGAR companyfacts；A 股事实来源 Tushare 三表；本规格**不**引入任何判断模型。

---

## 1. 目标与非目标

### 1.1 目标

1. **行业分类与时点成分落地。** 把规格一只建表未加载的 `industry_classifications` / `issuer_industry_memberships` 装入两套方案：申万 2021 版（A 股，三级，含纳入/剔除日期）与 SEC SIC（美股，四位码，当前值）；每条归属带来源、原始快照哈希、行定位、可得日期假设。
2. **行业级财务聚合成为可回放的派生事实。** 从规格二的 `financial_facts` 按"当期有效成分 + 当时可见披露"计算整体法指标（营收、归母净利、毛利率、ROE、同比），每行带方法版本、成分数、有数据数、输入摘要；任意一格都能现场重算并与保存值对账。
3. **行业估值序列与历史分位。** 对申万一级行业，用交易所收盘价 × 总股本（经 Tushare `daily_basic` 适配）与披露事实计算整体法 PE(TTM)/PB/PS(TTM)，并与申万指数公司发布值（经 Tushare `sw_daily` 适配）逐日对账；对账不达标则不发布估值。
4. **页面：行业列表 → 行业详情 → 成分 → 公司页。** 每个数字有来源抽屉；缺失、覆盖不足、未对账、未授权四种状态显式；zh/en；每个图有表格视图。判断（生命周期、景气）只通过 F4 接口展示，且未校准的判断不以分数或百分比呈现。

成功标准（本规格退出条件；"熟悉仓库的高级工程师"口径，详见 §14）：
- `index_member_all` 一次全量拉取的记录数 = 写入成分行数 + 隔离数 + 跳过汇总数（`skipped_summary` 各原因计数之和）；申万 2021 一级 31、二级 134、三级 346 个节点全部存在于 `industry_classifications(scheme='sw2021', version='2021')`（节点数来自 Tushare `index_classify` 文档对 2021 版的描述，实施时以实际响应为准并记录差异）。
- sp500 / nasdaq_top500 / us_china 三个宇宙内每个有 CIK 的活跃发行人，要么有一条 `scheme='sic'` 的归属行，要么出现在回执 `skipped_summary` 里（`no_sic` / `sec_unavailable`）。
- 申万一级 31 个行业的活跃聚合运行中，每个行业最近 40 个 `period_end` 的 `gross_margin`、`roe`、`revenue_yoy`、`net_income_yoy` 行存在或在该行业的 `coverage_summary` 里说明缺因；`GET …/replay` 对活跃运行的 100% 单元格摘要一致（CI 用离线夹具对 2 个行业 × 4 期断言，生产由 §15 的抽样脚本核对）。
- 估值：最近 52 个周五中，自算 `pe_ttm`/`pb` 与 `sw_daily` 的 `pe`/`pb` 相对差 ≤ 1% 的 (行业, 日期) 对占比 ≥ 95%，否则 `industry_valuation_runs.publishable=false`，页面显示"估值未对账"。
- `/intel/industries`、`/intel/industries/[scheme]/[code]`、成分页三条路由 E2E 通过；`messages/{zh,en}/industries.json` 对等测试通过；DESIGN.md 审查通过。
- 断网运行任一同步：批次 `failed`，旧数据不变，连续两次后新鲜度 `error`，页面显示旧数据 + `stale`/`error` 徽标，无 0 值。

### 1.2 本规格之外

- 港股分类与成分（恒生行业分类 / HKEX 行业）：等 F3 港股事实。
- GICS：MSCI/S&P 授权数据，不在本规格；表的 `scheme` 枚举保留 `'gics'` 不加载。
- 中证行业分类与中证指数估值：官网使用条款未核对（§17），作为第二估值对账源的候选，不在 v1。
- 申万二级/三级行业的聚合与估值：v1 只对一级 31 个行业聚合与估值；二级/三级只做导航与成分浏览（表已含三级归属）。
- 美股行业估值：没有可比的"交易所收盘价 × 总股本"适配链路（现有 `datagateway-quote.ts` 只有实时 `market_cap`，无历史），v1 美股 SIC 行业只有财务聚合，估值显示"缺失（无历史市值来源）"。
- 任何判断模型：生命周期阶段、景气评分、高估/低估、6 阶段选股表、Gartner 曲线、细分行业矩阵——F4 判断框架规格负责方法、登记、结算、校准；本规格 §7 只定义本模块向 F4 提供的输入与从 F4 读取的展示契约。
- 细分行业标签图（`industry_tags` 多对多，总纲 §1.2）：第二阶段，需要 F3 文档管道提供招股书/年报业务描述抽取；本规格预留表名不建表。
- 产业链上下游图谱、替代数据交叉验证（海关、协会月报）：总纲 §1.3 的"未要求但该做"项，另立规格。
- 对方站点任何数据、评分、结论的导入。

---

## 2. 现状（2026-11-04，计划一落地、计划二第 3 稿后勘察）

| 领域 | 现状（文件） | 本规格如何使用 |
|---|---|---|
| 分类表 | `supabase/migrations/20261105091000_issuers.sql`：`industry_classifications(scheme check in ('sw2021','sw2014','gics','csrc','custom'), version, code, level 1–4, name_zh/name_en 至少一个, parent_code 自引用)`；`issuer_industry_memberships(issuer_id, scheme, version, code, valid_from, valid_to, source, provenance jsonb)`，排他约束 `issuer_industry_memberships_no_overlap` 只对同一 `(issuer, scheme, version, code)` 的窗口不重叠；两表 anon/authenticated 只读、service_role 写；`database.types.ts` 已有 `IndustryClassification`/`IssuerIndustryMembership` | 加载到这两张表；需要一条迁移扩展 `scheme` 枚举加 `'sic'`，并给归属加 `level` 列与"同一发行人同一方案同一层级同一时刻只属一个行业"的排他约束（§4.3） |
| 分类数据 | 两表为空。`stocks_universe.industry`（`20260515000000_initial_schema.sql`）由 `src/lib/securities/sources/tushare-a.ts` 写入 Tushare `stock_basic.industry`（无版本、无层级、无日期），美股由 `nasdaq-screener.ts` 写 Nasdaq 筛选器的 `industry` | 不作为分类方案；页面不显示；保留给搜索 |
| Tushare 客户端 | `src/lib/data/sources/tushare.ts::tushareCall`（解析后行对象）；规格二新增 `tushareCallRaw`（原文字节、`has_more`、`request_id`、无 token 的 meta）；本机无 `TUSHARE_TOKEN`，生产有 | 全部 Tushare 适配器用 `tushareCallRaw`；夹具录制需 owner token（§16） |
| Tushare 行业接口 | 仓库未用过 `index_classify`、`index_member_all`、`sw_daily`。本次核对官方文档（2026-11-04）：`index_classify`（参数 `level` L1/L2/L3、`parent_code`、`src` SW2014/SW2021，默认 2014；字段 `index_code, industry_name, parent_code, level, industry_code, is_pub, src`；2000 积分）；`index_member_all`（参数 `l1_code/l2_code/l3_code/ts_code/is_new`，字段 `l1_code,l1_name,l2_code,l2_name,l3_code,l3_name,ts_code,name,in_date,out_date,is_new`，单次 2000 行，2000 积分；**文档未写明版本**）；`sw_daily`（默认申万 2021 版；字段 `ts_code,trade_date,name,open,low,high,close,change,pct_change,vol,amount,pe,pb,float_mv,total_mv`；单次 4000 行；5000 积分；18:30 更新）；`daily_basic`（字段含 `close, pe, pe_ttm, pb, ps, ps_ttm, total_share(万股), float_share, total_mv(万元), circ_mv`；`ts_code` 与 `trade_date` 二选一；单次 6000 行；2000 积分，5000 积分无总量限制） | §4.4、§6.2；积分要求与 token 积分等级由 owner 核对（§16） |
| SEC | `src/lib/research/ingest/collectors/edgar.ts` 已调用 `https://data.sec.gov/submissions/CIK{10 位}.json`；本次核对该响应含 `sic`、`sicDescription`、`fiscalYearEnd`、`exchanges`、`tickers`（AAPL：`sic=3571`、`sicDescription=Electronic Computers`、`fiscalYearEnd=0926`）。UA 与间隔由 `collectors/shared.ts::createClient` 提供 | §4.4 美股 SIC 适配器；`fiscalYearEnd` 顺手写入 `issuers.provenance`（规格二开放问题 15 的输入，不在本规格消费） |
| 证监会 | `https://www.csrc.gov.cn/csrc/c100103/common_list.shtml` 列出"2017 年 2 季度 … 2021 年 3 季度上市公司行业分类结果"，每季一份 PDF，最新一期 2021-11-10，之后无更新；2024-11 发布新标准《上市公司行业统计分类与代码》 | 不作为可加载来源（历史截止 2021Q3，PDF）；§15 作为 2021Q3 人工对照金集的素材 |
| 发行人与证券 | `issuers`（`cik` 不带前导零）、`issuer_securities(ticker, valid_from=首次观察日, valid_to, is_primary)`；`resolveIssuer(client,{ticker},{today})`（`src/lib/entities/resolve.ts`）；历史 ticker 归属不可靠（规格二 §1.2 已接受） | 成分 ts_code → issuer 按今天解析；解析不到 → `skipped_summary(no_issuer)`；退市公司的历史成分因此会缺（§17 开放问题 1） |
| 事实与派生 | 规格二：`financial_facts`（`available_date` 日期精度；`getFactsAsOf`）、`financial_metrics`（`ttm_*`、`roe`、`gross_margin` 等，`as_of=今天`）、`FactsDb` 三实现、读接口 | 聚合只读 `status='ok'` 事实，经 `getFactsAsOf(issuer,{asOf})` + `derive.ts` 纯函数，不读 `financial_metrics` 缓存（它没有 `asOf`） |
| 质量设施 | `startBatch/finishBatch`（六计数器、`INFO_CODES`、`capErrors`）、`quarantine()`（同键 open 唯一）、`recordAttempt`、`rules.ts` 四类规则、`/admin/dq` | 复用；新 dataset `industry.sw2021.members`、`industry.sic.members`、`industry.marks.cn`、`industry.agg.sw2021`、`industry.val.sw2021` |
| 存储 | 私有桶 `security-snapshots`；规格二新增 `disclosure-raw`（JSON，50 MB） | 本规格原始快照放 `disclosure-raw` 的 `industry/` 前缀（同为 JSON，§4.5） |
| 行情 | `src/lib/data/sources/*`：DataGateway/eastmoney/sina/tencent/Tushare 均为实时或近期 K 线拉取，**没有任何落库的收盘价或市值历史表**（`grep` 迁移无 quote/price 表；`financial_history` 表为空） | 新建 `security_marks`（§6.1） |
| 页面与 UI | `src/app/(app)/intel/page.tsx`（客户端组件，`useTranslations('intel')`，tab 条样式 `rounded-md border border-border`，`Disclaimer`）；`src/app/(app)/stock/[ticker]/page.tsx`；`TabBar` 以 `pathname.startsWith('/intel')` 高亮；`middleware.ts` 对 `(app)` 路由做 session 门禁；`DESIGN.md` + `src/app/globals.css`（`--accent` 黄铜、`--bullish/--bearish` 随 `data-color-scheme`、`[data-density='data']`） | §8 |
| i18n | `src/i18n/request.ts::MESSAGE_DOMAINS` 注册域；`src/i18n/messages-parity.test.ts` 的 `Domain` 类型**硬编码** `'common'|'components'|'portfolio'|'analyst'` 四个域，不会自动覆盖新域 | 新域 `industries` 必须同时加进 `MESSAGE_DOMAINS` 与该测试的域列表（§12） |
| cron | `vercel.json` 六条 cron；`securities-sync` 的 `authorized()`（`timingSafeEqual`）；`maxDuration=300`；hnd1 | §10 |
| 测试门禁 | `scripts/ci/research-checks.ts::criticalSuites` 与含 `S4_TEST_STATE` 的文件逐一对应；`test:db` 起本地 PostgreSQL 17 | §13 |
| 迁移 | 已锁到 `20261105091000_issuers.sql`；规格二占用 `20261106090000_financial_facts.sql` | 本规格 `20261107090000_industry_research.sql` |

---

## 3. 对方页面元素清单与分类

来源：`docs/research/chaosai-integration-2026-11-04/EVIDENCE.json`（`/industries` 公开 HTML 标题列表、Q10）与 `REPORT.md` §5.4。只记录"做了什么"，不导入任何值。

| # | 对方元素 | 分类 | 本规格处理 |
|---|---|---|---|
| 1 | 行业生命周期 6 阶段模型（导言、三段 3 年 CAGR a/b/c 判定 + 宏观定性修正） | 判断（方法） | F4；本模块提供 §7.1 输入 |
| 2 | 申万一级 31 行业 × 10 年年度 + 14 季财务热力图（营收/归母同比、毛利率、ROE） | 事实（行业聚合） | v1 §5：整体法 + 时点成分；页面 §8.3 热力图 + 表格视图 |
| 3 | 申万行业 6 阶段分布 | 判断 | F4；v1 该区块显示"未设判断"状态 |
| 4 | 10 个代表行业 5 维景气雷达（页脚自述：估值维度 50 占位，现金流用利润增速代理） | 判断 + 代理指标 | 不复制。v1 只展示可计算的事实维度（营收同比、归母同比、毛利率、ROE、估值分位），每维独立标注来源；无综合分 |
| 5 | PE/PB/PS 11 年分位（申万指数周频） | 事实（序列）+ 派生统计（分位） | v1 §6：自算整体法 + 与申万发布值对账；分位是确定性统计，带窗口与方法版本 |
| 6 | 基于 PB+PS 均值阈值 30/70 的高估/低估结论 | 判断 | F4 |
| 7 | 已覆盖细分行业生命周期矩阵（9 组 × 6 阶段、88 个细分） | 判断 + 导航 | 判断归 F4；导航由分类树（一/二/三级）替代；标签图第二阶段 |
| 8 | AI / 人形机器人 Gartner 曲线 | 判断（编辑性） | 不做 |
| 9 | 6 阶段选股模型表 | 判断（方法） | F4 |
| 10 | 细分行业索引（9 大行业卡片、106 篇子行业报告） | 导航 | 分类树导航 + 成分列表 + 公司页链接；报告索引归研究库 |
| 11 | 页脚来源"恒生聚源 / 申万指数周频 xlsx" | 来源声明 | 每个数字的来源抽屉（§8.5），不是页脚一句话 |

---

## 4. 分类与成分数据契约

### 4.1 方案一览

| scheme | version | 层级 | 范围 | 一手来源 | 适配器 | 历史 | 许可 |
|---|---|---|---|---|---|---|---|
| `sw2021` | `2021` | L1 31 / L2 134 / L3 346（文档值） | A 股 | 申万宏源研究所《申万行业分类标准（2021 版）》 | Tushare `index_classify(src='SW2021')` + `index_member_all` | 有：`in_date`/`out_date` | **owner 决策 A**：Tushare 数据的展示/商用条款与申万数据授权；未确认前 `publishable=false`，页面不对非 admin 展示 |
| `sic` | `1987` | 单层四位码（SEC 使用的 SIC 码表，无官方上级分组名称，不造父级） | 美股（三宇宙 + 有 CIK 的发行人） | SEC `submissions` JSON `sic`/`sicDescription` | 直接 HTTP（已有 `collectors/shared.ts` 的 UA/间隔） | 无：只有当前值；`valid_from=首次观察日`（与 `issuer_securities` 同语义），变化时关旧开新 | 公开数据，无许可问题 |
| `csrc` | `2012` | 门类/大类 | A 股 | 证监会季度《上市公司行业分类结果》PDF（2017Q2–2021Q3） | 无（人工抄录金集） | 截止 2021Q3 | 仅作 §15 对照 |
| `sw2014` / `gics` / `custom` | — | — | — | — | 不加载 | — | — |

**为什么首发是申万 2021 而不是只用一手免费来源**：A 股可获得的分类里，只有申万成分带纳入/剔除日期，能满足总纲约束 4 的时点成分；证监会结果已停更；交易所网站的"所属行业"只有当前快照（本次未核对接口，§17）。因此 A 股时点成分在 v1 依赖 Tushare 对申万数据的转载，授权是 owner 决策而不是工程问题。SIC 是美股的一手来源但无历史，美股行业聚合在成分变更前后的可比性弱于 A 股，页面用 `membership_history='current_only'` 徽标说明。

### 4.2 `industry_classifications` 的加载

- `sw2021`：`index_classify(src='SW2021', level=L1|L2|L3)` 三次调用；`code=index_code`（如 `801010.SI`），`level` 1/2/3，`name_zh=industry_name`，`name_en` 为空（申万不发布英文名；页面英文态显示中文名 + 代码，不机器翻译），`parent_code` 来自响应 `parent_code`（L1 的 `0` → null）。额外列：`attributes jsonb`（§4.3 新增）存 `{industry_code, is_pub, src}`。
- `sic`：码表来源 SEC 公布的 SIC 码列表（`https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list`，HTML 表格；实施时录一份夹具并记录抓取日期与 sha256）；`code` 四位数字，`level=1`，`name_en=Industry Title`，`name_zh` 为空（页面中文态显示英文名 + 代码）。`submissions` 返回的 `sic` 若不在码表里 → 隔离 `unknown_sic_code`，不写归属。
- 节点只增不删；名称变更写新 `version`（如申万再改版）；同 `(scheme, version, code)` 名称与原值不同 → 隔离 `classification_name_conflict`，不覆盖。

### 4.3 迁移 `supabase/migrations/20261107090000_industry_research.sql`

可重放；补 `migrations.lock.json`；`database.types.ts` 手工补齐（本规格新增五张表 + 两列）。

```
-- 1. 枚举与属性
alter table industry_classifications drop constraint if exists industry_classifications_scheme_check;
alter table industry_classifications add constraint industry_classifications_scheme_check
  check (scheme in ('sw2021','sw2014','gics','csrc','custom','sic'));
alter table industry_classifications add column if not exists attributes jsonb not null default '{}'
  check (jsonb_typeof(attributes) = 'object');

-- 2. 归属加层级与层级内互斥（表当前为空，可直接 not null）
alter table issuer_industry_memberships add column if not exists level int not null check (level between 1 and 4);
alter table issuer_industry_memberships add column if not exists available_date date not null;   -- §4.4 可得日期假设
alter table issuer_industry_memberships add column if not exists batch_id uuid references ingest_batches(batch_id) on delete restrict;
alter table issuer_industry_memberships add constraint issuer_industry_memberships_level_matches
  foreign key (scheme, version, code) references industry_classifications(scheme, version, code);  -- 已有；level 一致由触发器校验
alter table issuer_industry_memberships add constraint issuer_industry_memberships_one_per_level exclude using gist
  (issuer_id with =, scheme with =, version with =, level with =, daterange(valid_from, valid_to, '[)') with &&);
create index if not exists issuer_industry_memberships_window_idx
  on issuer_industry_memberships using gist (scheme, version, code, daterange(valid_from, valid_to, '[)'));
```

触发器 `issuer_industry_memberships_level_check`：insert/update 时 `level` 必须等于 `industry_classifications` 对应节点的 `level`，否则 `23514`（`level_mismatch`）。`update` 只允许改 `valid_to`（关闭窗口）与 `provenance`；`delete` 禁止（`append_only:issuer_industry_memberships`）。

新表（全部 `revoke all from public, anon, authenticated` 后按下文授权）：

```
security_marks                                   -- 证券级日度标记（§6.1）
  ticker        text not null references stocks_universe(ticker) on delete restrict
  trade_date    date not null
  close         numeric not null check (close > 0)            -- 交易所收盘价（经 Tushare daily_basic）
  total_share   numeric not null check (total_share > 0)      -- 股（万股 × 10000，变换记在 method）
  market_cap    numeric generated always as (close * total_share) stored
  source        text not null                                  -- 'tushare:daily_basic'
  upstream      text not null                                  -- 'sse'|'szse'|'bse'
  raw_hash      text not null
  batch_id      uuid not null references ingest_batches(batch_id) on delete restrict
  status        text not null default 'ok' check (status in ('ok','quarantined'))
  created_at    timestamptz not null default now()
  primary key (ticker, trade_date)
  index (trade_date)
  -- RLS：anon/authenticated 读 status='ok'；service_role 全部

industry_metric_runs                             -- 一次聚合运行（§5.4）
  run_id          uuid primary key
  scheme          text not null, version text not null
  level           int not null
  facts_as_of     date not null                               -- 事实可见性截止
  method_version  text not null                               -- 'industry-agg/1.0'
  code_version    text not null
  batch_id        uuid not null references ingest_batches(batch_id) on delete restrict
  status          text not null check (status in ('active','superseded','failed'))
  coverage_summary jsonb not null default '[]' check (jsonb_typeof(coverage_summary) = 'array')
  created_at      timestamptz not null default now()
  unique (scheme, version, level, status) where status = 'active'   -- partial unique index 实现
  -- RLS：公共只读

industry_metrics                                 -- 聚合行（§5.3）
  run_id          uuid not null references industry_metric_runs(run_id) on delete cascade
  code            text not null
  metric          text not null
  period_start    date not null
  period_end      date not null
  duration        text not null check (duration in ('3M','12M','TTM','INSTANT'))
  value           numeric not null
  value_text      text generated always as (value::text) stored
  unit            text not null                               -- 'CNY'|'USD'|'ratio'
  n_members       int not null check (n_members >= 0)
  n_with_data     int not null check (n_with_data >= 0 and n_with_data <= n_members)
  inputs_digest   text not null                               -- sha256(canonical JSON of [{issuer_id, fact_ids[], values}])
  primary key (run_id, code, metric, period_start, period_end)
  index (code, metric, period_end desc)
  -- RLS：公共只读；写仅 service_role

industry_valuation_runs                          -- 估值发布门（§6.4）
  run_id          uuid primary key
  scheme, version, level, method_version, code_version, batch_id
  reconciliation  jsonb not null                              -- {pairs, within_tolerance, ratio, tolerance, window_from, window_to}
  publishable     boolean not null
  status          text not null check (status in ('active','superseded','failed'))
  created_at
  unique active per (scheme, version, level)（partial unique index）

industry_valuations                              -- 估值序列（§6.3）
  scheme, version, code, trade_date date, metric text ('pe_ttm'|'pb'|'ps_ttm'|'market_cap')
  value numeric not null, value_text generated
  facts_as_of     date not null                               -- = trade_date（§6.3）
  method_version  text not null
  n_members int, n_with_data int, mcap_coverage numeric check (mcap_coverage between 0 and 1)
  inputs_digest   text not null
  run_id          uuid not null references industry_valuation_runs(run_id) on delete cascade
  computed_at     timestamptz not null default now()
  primary key (scheme, version, code, trade_date, metric, method_version)
  index (scheme, version, code, metric, trade_date desc)
  -- RLS：公共只读 **且** 关联 run `publishable=true`（视图 `industry_valuations_public` 实现，anon 只授视图）

industry_official_valuations                     -- 指数公司发布值（对账基准，§6.2）
  scheme, version, code, trade_date, metric ('pe'|'pb'|'total_mv'|'float_mv'|'close'), value numeric
  source text ('tushare:sw_daily'), upstream text ('申万宏源研究所'), raw_hash, batch_id, created_at
  primary key (scheme, version, code, trade_date, metric)
  -- RLS：仅 service_role（owner 决策 A 之前不对外；决策后改为公共只读）
```

SQL 函数（`security definer`，仅 service_role）：`activate_industry_metric_run(p_run uuid)`（事务内把同 (scheme, version, level) 的 active 置 superseded、本 run 置 active）、`activate_industry_valuation_run(p_run uuid)` 同理、`prune_superseded_industry_runs(p_keep_days int)`（runbook 用）。

### 4.4 成分加载

**申万（`src/lib/industry/providers/tushare-sw.ts`）**
- `index_member_all` 不带 `is_new`（文档默认 `Y` 只给当前成分；历史需 `is_new='N'` 再取一遍，两遍合并；**两遍是否覆盖全部历史在实施第一步用一家有过分类变更的公司核对并记入 runbook**）；按 `l1_code` 循环 31 次以控制单次 2000 行上限（`has_more` 继续翻页）。
- 每条记录展开为三行归属（L1/L2/L3，`level` 1/2/3，`code` 各级代码），`valid_from=in_date`，`valid_to=out_date`（空 → null）。**可得日期假设**：申万发布分类调整的公告日未在接口暴露，`available_date=in_date` 并在 `provenance.availability='effective_date_assumed'` 标明；页面来源抽屉显示"可得日期 = 生效日（假设）"。
- `ts_code → issuer`：`resolveIssuer({ticker: ts_code},{today})`；无 → `skipped_summary(no_issuer)`，记 ts_code 列表到回执 `errors`。
- `provenance = {source:'tushare:index_member_all', upstream:'申万宏源研究所', raw_hash, locator:{page, row_index}, fetched_at, params:{l1_code,is_new}}`；禁止写 token。
- 幂等：同键同值跳过（`duplicates`）；同 `(issuer, scheme, version, code, valid_from)` 不同 `valid_to`：若旧行 `valid_to is null` 且新值非空 → 关闭窗口（`versioned`）；其他差异 → 隔离 `membership_conflict`，不写。
- 层级互斥冲突（同一发行人同层级窗口重叠，来自上游数据错误）→ 排他约束 `23P01` → 隔离 `membership_overlap`，该发行人本批次三行都不写。

**SIC（`src/lib/industry/providers/sec-sic.ts`）**
- 范围 = 规格二 `fact_sync_scope(market='US')` 的发行人（已经是"三宇宙 + 有 CIK"）；每发行人 `GET submissions`，间隔 ≥ 120 ms，预算与退避同规格二 §6.2。
- `sic` 为空 → `skipped_summary(no_sic)`；码不在码表 → 隔离 `unknown_sic_code`。
- 首次：`valid_from = 今天`（观察日），`available_date = 今天`，`provenance.availability='observed'`；之后每次运行若 `sic` 变化：关闭旧行 `valid_to=今天`，开新行；不变 → `duplicates`。
- `fiscalYearEnd` 写入 `issuers.provenance.sec_submissions = {fiscalYearEnd, observed_at}`（只追加，不改其他键）。

### 4.5 原始快照

桶 `disclosure-raw`，路径 `industry/{source}/{sha256}.json` + `{sha256}.meta.json`（同规格二 §4.6 形状，`params` 无 token）；上传失败 → 本批次不写任何行，`failed`。

### 4.6 读取

`src/lib/industry/memberships.ts`：
- `membersAt(client, {scheme, version, code, on: date})` → 当日有效成分（窗口 `[valid_from, valid_to)` 含 `on`），分页 1000。
- `membershipsOfIssuer(client, issuerId, {scheme?, on?})` → 公司页用。
- `classificationTree(client, scheme, version)` → 节点树（`unstable_cache` 24h；节点数 ≤ 600）。

---

## 5. 行业聚合事实 `src/lib/industry/aggregate.ts`

### 5.1 原则

- **整体法**：Σ分子 / Σ分母，不是公司比率的平均。
- **时点成分**：某 `period_end` 的成分 = `membersAt(code, on=period_end)`。
- **当时可见披露**：每个成分的事实经 `getFactsAsOf(issuer, {asOf: facts_as_of})` 取当前值；`facts_as_of` 由运行指定（cron 为今天；回放脚本可指定历史日期）。
- **同集合同比**：同比只在"两期都是成分且两期都有值"的发行人集合上计算（`comparable_set`），分子分母同集合。
- **单位一致**：只汇总与方案市场一致的单位（`sw2021`→`CNY`，`sic`→`USD`）；其他单位的事实计入 `n_members` 但不计入 `n_with_data`，并在 `coverage_summary` 记 `unit_excluded`。
- **金融业口径**：`sw2021` 下名称为"银行""非银金融"的一级行业（代码在加载后写入 `METHOD_CONFIG.financial_l1_codes`，不硬编码名称到计算）不计算 `gross_margin`（无 `cost_of_revenue` 口径）；`roe` 照常。其他行业里的个别金融类公司缺 `cost_of_revenue` 自然进入 `n_with_data` 缺口。
- **方法版本** `METHOD_VERSION='industry-agg/1.0'`；任何公式、阈值、集合规则改动 +0.1；`METHOD_CONFIG` 导出供来源抽屉展示。

### 5.2 指标表（v1，`duration` 来自输入事实）

| metric | 公式（整体法） | 输入概念（CN / US） | duration | unit |
|---|---|---|---|---|
| `revenue_sum` | Σ revenue | `revenue_operating` / `revenue` | 12M、3M（单季由规格二 `q_single_*` 派生，同一 `asOf`） | 货币 |
| `net_income_parent_sum` | Σ net_income_parent | 同名 | 12M、3M | 货币 |
| `gross_margin` | (Σ rev − Σ cost) / Σ rev，集合 = 两者都有 | `revenue_operating`+`cost_of_revenue` / `revenue`+`cost_of_revenue`（US 有 `gross_profit` 时用 Σ gross_profit / Σ revenue，集合规则同） | 12M、3M | ratio |
| `roe` | Σ ttm_net_income_parent / Σ avg(equity_parent 窗口起点−1 天, 窗口期末)，集合 = 三者都有 | 规格二 `derive.ts` 的 `ttm_net_income_parent` 与期初/期末 `equity_parent`（精确匹配，不插值） | TTM | ratio |
| `revenue_yoy` | (Σ rev_t − Σ rev_{t−1y}) / \|Σ rev_{t−1y}\|，`comparable_set` | 同 `revenue_sum` | 12M、3M | ratio |
| `net_income_yoy` | 同上 | 同 `net_income_parent_sum` | 12M、3M | ratio |
| `member_count` | n_members | 成分表 | INSTANT（`period_end`） | count |

每行 `n_members`（当日成分数）、`n_with_data`（进入分子分母的发行人数）。页面显示阈值 `DISPLAY_MIN_COVERAGE = 0.8`（`n_with_data / n_members`）在 `METHOD_CONFIG`；低于阈值的格子显示"覆盖不足 x/y"而不是值（值仍在接口里返回，供抽屉）。不做分母为 0、`Σ rev_{t−1y} = 0` 的行（不产出，记 `coverage_summary`）。

期间网格：从 `facts_as_of` 回溯 10 年的每个 3/6/9/12 月末；A 股单季由规格二的差分规则得到；美股非自然财年公司的 `period_end` 不落在网格上时，按"`period_end` 落在网格日 ±45 天内归入该网格"**不做**——v1 美股只聚合 `12M` 年度行且以各公司自己的 `period_end` 年份归组（`grid='fiscal_year'`，行的 `period_end` 取网格年 12-31 并在 `coverage_summary` 记 `fiscal_year_grouping`）；A 股全部 `grid='calendar_quarter'`。

### 5.3 输入摘要与回放

`inputs_digest = sha256(canonicalJson(rows))`，`rows = [{issuer_id, concept, fact_id, value_text, available_date}]` 按 `(issuer_id, concept)` 排序；派生输入（`ttm_*`、`q_single_*`）展开到底层事实（规格二 §8 的扁平 `inputs`）。摘要本身不含成分表行，但现场重算时成分集合由 `membersAt(code, period_end)` 重新取得；若成分表后来变了（新加载把某公司的 `in_date` 改早），重算集合不同 → 摘要不一致 → 接口返回 `replay.status='changed'` 并列出集合差异（§9）。

### 5.4 运行与发布

`runIndustryAggregation(deps, {scheme, version, level, factsAsOf, codes?})`：
1. `startBatch(producer='industry-agg', dataset='industry.agg.<scheme>')`；`code_version` 规则同规格二 §6.1（取不到拒绝 apply）。
2. 逐行业：取期间网格 → `membersAt` → 批量读事实（每发行人一次 `factsOfIssuer`，并发 4）→ 纯函数 `aggregateIndustry(members, factsByIssuer, config)` → 行。
3. 全部行业完成后一次性插入 `industry_metrics`（run 行 `status='failed'` 先建，插完 `activate_industry_metric_run`）；任一行业抛错 → run `failed`，旧 active 不动，批次 `failed`。
4. `recordAttempt('industry.agg.<scheme>', {ok, cadence:'daily'})`；`finishBatch`。

预算：31 个行业 × 平均成分数（未知，实施第一步测）× 每发行人 1 次读；在 cron 300 s 内可能放不下 → 本规格把聚合放在**脚本/Mac Studio launchd**（与宏观规格 Python 采集同模式）优先，cron 只在 `limit` 个行业内做增量（`deadline` 同规格二）；实施第一步用真实数据测一次全量耗时并记入 runbook，决定 cron 是否开启（§10）。

---

## 6. 行业估值

### 6.1 证券级标记 `security_marks`

- 适配器 `providers/tushare-marks.ts`：`daily_basic(trade_date=D)` 一次取全市场（≤ 6000 行；`has_more` 翻页），字段 `ts_code,trade_date,close,total_share,total_mv`；`close` 记为交易所收盘价（`upstream` 按后缀 sse/szse/bse），`total_share` 万股 × 10000 → 股（`provenance.transform='wan_to_unit'`）。
- 日期集合 `MARK_DATES`：最近 2 年每周五（非交易日取前一交易日：Tushare 对非交易日返回空 → 向前找最多 4 天）+ 更早 9 年每月最后交易日。首次回填约 104 + 108 次调用；每周增量 1 次。
- 规则：`identityRule('mcap_vs_tushare', close×total_share, total_mv×10000, 0.001)` 失败 → 隔离 `mcap_mismatch`，该行 `quarantined`；`rangeRule('close_range', close, 0.01, 100000)`。
- 不存 `pe/pb/ps`（Tushare 自算值，不是一手）；它们只进 §6.2 对账的**第二**基准（可选，`METHOD_CONFIG.reconcile_security_level=false` 默认关）。

### 6.2 指数公司发布值 `industry_official_valuations`

`providers/tushare-sw-daily.ts`：`sw_daily(ts_code=<L1 code>, start_date, end_date)` 31 次 × 年份分段（单次 4000 行足够 15 年日频）；只取 `MARK_DATES` 上的行写入（其余丢弃，`skipped_summary(not_mark_date)`）；`metric ∈ {pe, pb, total_mv, float_mv, close}`。owner 决策 A 未确认前，表仅 service_role 可读，只用于对账。

### 6.3 自算估值

对每个 `D ∈ MARK_DATES`、每个一级行业：
- 成分 = `membersAt(code, on=D)`；市值 = Σ `security_marks.market_cap`（`status='ok'`，`trade_date=D`；缺标记的成分计入 `n_members` 不计入 `n_with_data`）。
- `pe_ttm = Σ market_cap(有数据集合) / Σ ttm_net_income_parent(同集合, facts_as_of=D)`；分母 ≤ 0 → 不产出该行，`coverage_summary` 记 `nonpositive_denominator`（页面显示"不适用（亏损）"，与 REPORT.md §5.4 的要求一致）。
- `pb = Σ market_cap / Σ equity_parent(最近一个 period_end ≤ D 且在 D 可见的 INSTANT 值)`。
- `ps_ttm = Σ market_cap / Σ ttm_revenue(CN: revenue_operating)`。
- `market_cap = Σ market_cap`；`mcap_coverage = Σ market_cap(有事实的集合) / Σ market_cap(全部有标记的成分)`。
- `facts_as_of = D`：这是真正的时点估值（用 D 当天已披露的 TTM 利润）。后到的披露（迟到文件、隔离接受）会改变重算结果：行不改写，`/replay` 显示 `changed`；每周运行只补新日期，不回溯重算（回溯由脚本 `--recompute-from` 手动触发并发新 run）。

### 6.4 对账与发布门

每次估值运行后：对最近 52 个周五 × 31 行业，比较自算 `pe_ttm`/`pb` 与 `industry_official_valuations` 的 `pe`/`pb`（申万口径：**是否为 TTM、是否整体法、是否剔除负值公司，文档未写明**；实施第一步以 3 个行业 × 4 个日期人工核对申万官网发布说明后在 `METHOD_CONFIG.official_basis` 记录，并据此选择比较 `pe_ttm` 还是另算 `pe_static`）。`|自算/官方 − 1| ≤ 0.01` 计为一致；一致占比 ≥ 0.95 → `publishable=true`；否则 `false`，页面估值区显示"估值未对账（一致率 x%）"并只对 admin 显示明细。结果写 `dq_reconciliations`（`dataset='industry.val.sw2021'`，每对一行）与 run 的 `reconciliation`。

### 6.5 分位数（派生统计，不是判断）

`percentile(code, metric, D, window=11y)` = 在 `[D − 11 年, D]` 内该行业该指标所有 `MARK_DATES` 值中 ≤ 当前值的占比；样本数 `n` 与窗口写进响应；`n < 100` 不显示分位（显示"样本不足 n"）。11 年窗口来自对方页面的做法，只是默认值，接口接受 `window=5y|10y|11y|all`。分位不配任何"高估/低估"标签。

---

## 7. 依赖接口（待对齐）

### 7.1 向 F4 判断框架提供的输入（本模块实现）

```ts
// src/lib/industry/judgment-inputs.ts
export interface IndustryJudgmentInput {
  subject: { kind: 'industry'; scheme: string; version: string; code: string; level: number };
  asOf: string;                                  // YYYY-MM-DD
  metricRunId: string; valuationRunId: string | null;
  series: Array<{ metric: string; duration: string; points: Array<{ periodEnd: string; value: string; nMembers: number; nWithData: number }> }>;
  valuation: Array<{ metric: string; tradeDate: string; value: string; percentile?: { value: number; n: number; window: string } }> | null;
  digest: string;                                // sha256(canonicalJson(本对象去 digest))
  methodVersion: string;                         // industry-agg/1.0
}
export function buildIndustryJudgmentInput(client, subject, asOf): Promise<IndustryJudgmentInput | null>;
```

F4 需要把 `digest` 作为 `input_snapshot` 记入判断登记；本模块保证同 `(subject, asOf, metricRunId, valuationRunId)` 的 `digest` 稳定。

### 7.2 从 F4 读取的展示契约（F4 实现，本模块消费）

```ts
export interface IndustryJudgmentView {
  methodologyId: 'industry_lifecycle' | 'industry_prosperity' | string;
  methodologyVersion: string;
  subject: IndustryJudgmentInput['subject'];
  registeredAt: string; settlesAt: string | null;
  output: { label: { zh: string; en: string }; confidence?: 'low'|'medium'|'high' };   // 不是数字分数
  falsifiableCondition: { zh: string; en: string };
  calibration: { status: 'uncalibrated' | 'calibrated'; brier?: number; n?: number; reportUrl?: string };
  inputDigest: string;                           // 必须等于 §7.1 的 digest，否则页面不显示该判断
}
GET /api/judgments?subject=industry:<scheme>:<version>:<code>&asOf=   -- F4 的路由，本模块只调用
```

展示约束（owner 决策 D 的默认）：`calibration.status='uncalibrated'` 的判断只显示标签文字 + "未校准"徽标 + 可证伪条件，不显示分数、百分比、雷达、颜色等级；`calibrated` 才允许显示 Brier 与可靠性链接。F4 未上线时整个"判断"区显示"未设判断（F4 规格待实施）"。

### 7.3 与规格三（标识符/对账）的接口

- 历史 ticker 归属：成分加载在规格三提供 `resolveIssuer(…,{on: date})` 前，按今天解析；规格三落地后，`index_member_all` 的 `in_date` 作为解析日期重跑一次，差异进 `membership_conflict` 隔离。
- 退市公司：规格三补齐 `stocks_universe` 退市证券与 `issuers.status='dissolved'` 后，成分加载对退市 ts_code 不再 `no_issuer`。

### 7.4 与公司研究规格的接口

公司页需要 `GET /api/entities/[issuerId]/industries`（§9）与"同业对比"所需的 `membersAt`；本规格只提供读接口，不做同业表。

---

## 8. 页面与 UI 流程

### 8.1 路由与权限

| 路由 | 内容 | 权限 |
|---|---|---|
| `/intel` | 现有页"研究"tab 增加入口卡"行业研究 →"（不改两 tab 结构） | session |
| `/intel/industries` | 行业列表：方案切换（申万 2021 / SIC）、层级树、热力图/表格 | session；`sw2021` 在 owner 决策 A 之前对非 admin 显示"数据授权待确认"空态 |
| `/intel/industries/[scheme]/[code]` | 行业详情：聚合序列、估值与分位、判断区、来源与方法 | 同上 |
| `/intel/industries/[scheme]/[code]/constituents` | 成分列表（按日期）→ 公司页 `/stock/[ticker]` | 同上 |
| `/stock/[ticker]` | 现有页"概览"增加一行"所属行业：申万 2021 ·  … / SIC …"，点击进详情 | 现有 |

`TabBar` 的 `intel` 高亮靠 `startsWith('/intel')`，无需改。

### 8.2 行业列表（桌面）

```
┌ 行业研究            方案 [申万 2021 ▾]  层级 [一级]   事实截至 2026-11-03 · 聚合运行 11-04 03:10 · ● fresh ┐
│ 指标 [毛利率 ▾]  口径 [年度 ▾]  显示 [热力图 | 表格]                                   方法 industry-agg/1.0 │
│ ┌ 热力图：行 = 31 行业，列 = 最近 10 个年度 period_end；格 = 值（≥ 0.8 覆盖）/ "x/y" 覆盖不足 / "—" 缺失 ┐ │
│ │ 点击格 → 来源抽屉（§8.5）；点击行名 → 详情                                                              │ │
│ └ 色阶：单色黄铜透明度 0.12–0.6，不用红绿（行业毛利率高低不是涨跌）；色盲安全由数值叠印保证              ┘ │
│ ┌ 表格视图：行业 | 代码 | 成分数 | 最近 period_end | 值 | 覆盖 x/y | 同比 | 来源 ▸                         ┐ │
│ 估值快照（仅 publishable）：行业 | PE(TTM) | 11 年分位 | PB | 分位 | 市值覆盖 | 对账 ✓ | 日期                 │
│ 判断区：未设判断（F4）                                                                                    │
└ 来源条：SEC submissions · Tushare→申万宏源研究所 · Tushare→交易所收盘价 · EDGAR companyfacts · Tushare 三表 ┘
```

- 状态：`loading`（骨架）、`ok`、`stale`（新鲜度徽标 + 显示旧 run）、`error`（同上）、`unlicensed`（决策 A 前的 sw2021 空态，文案说明原因，不显示任何数）、`empty`（方案已授权但无 active run：显示"尚未聚合"）。
- 数字：`Geist Mono` + `tabular-nums`；比率两位小数百分比；货币按 `unit` 显示单位（亿元 / $bn），换算倍率在抽屉里。
- 不用红/绿表示行业指标高低；同比正负用中性箭头 + 符号；估值分位用黄铜条。

### 8.3 行业详情

顺序固定：**标题（名称 zh/en + 代码 + 方案版本 + 层级路径）→ 成分摘要（n_members、最近变动日期、"查看成分"）→ 聚合序列（指标切换；折线 = 内联 SVG；表格视图开关；每点可点开抽屉）→ 估值与分位（publishable 才显示；否则对账状态说明）→ 判断区（§7.2）→ 方法与来源（`METHOD_CONFIG` 原文、方案来源、可得日期假设、代码版本）**。

- 期间切换：年度 / 单季 / TTM（只对 roe）；窗口 5Y / 10Y。
- 移动端：序列图改为表格优先，图在 < 640px 隐藏；抽屉改为全屏 sheet。

### 8.4 成分页

表：代码 | 名称 | 纳入日 | 剔除日 | 二级 / 三级 | 最近年度营收（事实，带抽屉）| 最近年度归母净利 | → 公司页。日期选择器"截至 YYYY-MM-DD"驱动 `membersAt`；默认今天。分页 100。美股 SIC 成分无纳入日（显示"观察日 …"并加 `current_only` 徽标）。

### 8.5 来源抽屉（每个数字）

打开后显示：
1. 值、单位、`period`、`duration`、方法（`metric` 公式原文 + `method_version`）、`code_version`、`facts_as_of`、run 创建时间。
2. 覆盖：`n_with_data / n_members`，未进入计算的成分及原因（`unit_excluded` / `missing_concept` / `no_marks`），最多列 50 条，其余计数。
3. 输入清单（`/replay` 现场重算）：每个成分一行：发行人、ticker、概念、值、`available_date`、filing（`citation` 链接：EDGAR 归档页 / 巨潮 PDF / `pending`）；摘要校验结果 `match | changed`（`changed` 时列差异）。
4. 成分来源：方案、上游、`raw_hash`、`locator`、可得日期假设。
5. 估值数字的抽屉另加：标记日期、Σ 市值、市值覆盖、对账对（官方值、相对差）。

抽屉文案 zh/en 全部来自 `messages/*/industries.json`；数值、代码、哈希不翻译。

### 8.6 Claude Design canvas 待设计清单

owner 规则：所有页面 UI 流程先在 Claude Design canvas 设计；本规格只定义内容与状态。待设计屏：
1. 行业列表（热力图态 / 表格态 / unlicensed 空态 / stale 态）— 桌面 + 移动。
2. 行业详情（含估值已发布 / 未对账两态；判断区"未设判断" / 未校准标签态）— 桌面 + 移动。
3. 成分页（含日期选择器与 `current_only` 徽标）。
4. 来源抽屉（聚合数字 / 估值数字 / 成分行三种内容；`match` / `changed` 两态）— 桌面侧滑 + 移动全屏。
5. `/intel` 入口卡与 `/stock/[ticker]` 的"所属行业"行。
6. 组件：覆盖徽标 `x/y`、新鲜度徽标、方案/层级切换器、分位条。
约束：只用 `DESIGN.md`/`globals.css` tokens；无紫色、无渐变、圆角 ≤ 6px；热力图单色黄铜透明度阶；数字 Geist Mono。

---

## 9. 读取接口

共同约定：公共只读（`getAnonSupabase()`；RLS 决定可见性）；`force-dynamic`；参数重复 → 400 `invalid_parameter:<name>`；`scheme`/`version`/`code` 白名单校验（`code` 正则 `^[0-9A-Za-z.]{1,32}$`）；错误与空结果 `no-store`；成功 `successCacheControl(now)`（规格一既有，按 UTC 日界封顶）；响应顶层带 `methodVersion`、`runId`、`factsAsOf`、`freshness`。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/industries` | `scheme`（必填）、`version`、`level`（默认 1）、`metric`（默认 `gross_margin`）、`duration`（默认 12M）、`periods`（默认 10，最大 44） | `{scheme, version, level, run:{runId, factsAsOf, methodVersion, codeVersion, createdAt}, freshness, industries:[{code, nameZh, nameEn, nMembers, cells:[{periodEnd, value, nWithData, nMembers}]}], valuation: {publishable, asOf, rows:[{code, peTtm, peTtmPercentile:{value,n,window}, pb, pbPercentile, mcapCoverage}]} \| null, licensing:{status:'ok'\|'pending'}}` |
| `GET /api/industries/[scheme]/[code]` | `version`、`from`/`to`、`metrics`（白名单）、`durations`、`window`（分位） | `{node:{code, level, names, parent, children[]}, run, series:[{metric, duration, points:[…]}], valuation:{publishable, reconciliation, series:[…]} \| null, method: METHOD_CONFIG, sources:[…]}` |
| `GET /api/industries/[scheme]/[code]/constituents` | `version`、`on`（默认今天）、`page`、`pageSize`（≤ 200） | `{on, total, rows:[{issuerId, ticker, names, validFrom, validTo, l2, l3, provenanceSummary:{source, upstream, availability}}]}` |
| `GET /api/industries/[scheme]/[code]/replay` | `runId`、`metric`、`periodStart`、`periodEnd`（或 `tradeDate` + `metric` 对估值） | `{stored:{value, inputsDigest}, recomputed:{value, inputsDigest, rows:[{issuerId, ticker, concept, factId, value, availableDate, filing:{filingId, citation, url}}], excluded:[{issuerId, reason}]}, status:'match'\|'changed', diff?:{addedIssuers, removedIssuers, changedFacts}}`；限流：每 IP 每分钟 10 次（复用现有 quota 基础设施若有，否则内存计数 + `429`），`max-age=3600` |
| `GET /api/entities/[issuerId]/industries` | `on` | `{memberships:[{scheme, version, code, level, names, validFrom, validTo}]}` |
| `GET|POST /api/cron/industry-sync` | `job=memberships-sw\|memberships-sic\|marks\|official\|aggregate\|valuation`、`limit` | 批次回执 |

`industry_valuations` 对 anon 经视图 `industry_valuations_public`（只含 `publishable=true` 的 active run 行）；admin 路由 `GET /api/admin/industries/valuation?runId=` 返回未发布 run 的明细与对账表（`requireAdminUser()`）。

---

## 10. 采集、调度与脚本

| job | 频率 | 触发 | 预算 |
|---|---|---|---|
| `memberships-sic` | 每周日 02:00 UTC（`0 2 * * 0`），`limit` 200/次，租约与到期同规格二 `fact_sync_scope` 模式（新表 `industry_sync_scope(issuer_id, job, next_due_at, lease_until, lease_batch_id, …)` 与规格二同形） | cron | 300 s |
| `memberships-sw` | 每周一 02:00 UTC；全量 31 × ≤ 2 页 ≈ 62 次调用 | cron（若 Tushare 积分允许）或脚本 | 300 s |
| `marks` | 每周六 02:00 UTC：补上周五一个 `MARK_DATE`（1–2 次调用）；回填用脚本 | cron | 300 s |
| `official` | 同 `marks` 之后（02:20） | cron | 300 s |
| `aggregate` | 每周六 03:00 UTC；**首版在 Mac Studio launchd 跑脚本**（宏观规格 §4.4 同模式），cron 版只在实测全量 < 240 s 时启用 | 脚本 / cron | 无 / 300 s |
| `valuation` | 聚合后；每次只算新 `MARK_DATES` | 脚本 / cron | 同上 |

`vercel.json` 新增条目在对应 job 的退出条件满足后才加入（§14）。脚本：`scripts/industry/sync.ts --job … [--apply] [--since] [--recompute-from]`、`scripts/industry/replay-check.ts --run <id> --sample 50`（§15）、`scripts/industry/record-fixture.ts --sw-classify | --sw-members <l1_code> | --sw-daily <code> | --daily-basic <date> | --sec-submissions <cik>`。cron 与脚本不同时跑（runbook）。

---

## 11. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| Tushare 积分不足 / 限频 / 429 | 本 job 停止，已写行保留（成分写入按发行人原子：三行一起） | `quota_exhausted`（非信息码） | partial / failed |
| `index_member_all` 行无法解析 issuer | 跳过该记录 | `skipped_summary(no_issuer)` | — |
| 同发行人同层级窗口重叠（上游错误） | 该发行人三行不写 | 隔离 `membership_overlap` | partial |
| 同键不同 `valid_to`（非关闭窗口） | 不写 | 隔离 `membership_conflict` | partial |
| 节点名称与已存不同 | 不写 | 隔离 `classification_name_conflict` | partial |
| SEC 429/503/404 | 该发行人跳过 | `sec_unavailable` / `no_submissions` | partial |
| `sic` 不在码表 | 不写 | 隔离 `unknown_sic_code` | partial |
| `daily_basic` 市值恒等式失败 | 该行 `quarantined` | 隔离 `mcap_mismatch` | partial |
| 非交易日向前 4 天仍空 | 该日期跳过 | `skipped_summary(no_trading_day)` | — |
| 聚合中任一行业读事实失败 | run `failed`，旧 active 不动 | `aggregate_failed` | failed |
| 聚合分母为 0 / 可比集合为空 | 不产出该行 | `coverage_summary`（信息） | — |
| 对账一致率 < 0.95 | run `publishable=false`，估值不对外 | `reconciliation_failed`（信息，run 级） | success |
| 快照上传失败 | 不写行 | `snapshot_upload_failed` | failed |
| `code_version` 取不到 | 拒绝 apply | `code_version_missing` | — |
| 读接口 | 400 `invalid_parameter:<name>`；404 `unknown_industry` / `unknown_issuer`；403 `unlicensed`（决策 A 前非 admin 请求 sw2021 数据） | | |
| 页面 | 任一接口失败显示上次成功响应（`SWR` 已有模式）+ `error` 徽标；永不显示 0 替代缺失 | | |

---

## 12. i18n

新域 `industries`：`messages/{zh,en}/industries.json`，注册到 `src/i18n/request.ts::MESSAGE_DOMAINS`，并把 `'industries'` 加入 `src/i18n/messages-parity.test.ts` 的 `Domain` 联合类型与遍历列表（该测试目前只覆盖四个域，不自动发现）。内容：页面标题/副标题、方案与层级标签、指标名（`gross_margin` → 毛利率 / Gross margin 等 7 个）、状态文案（fresh/stale/error/unlicensed/empty/覆盖不足/不适用（亏损）/样本不足/未对账/未设判断/未校准）、抽屉字段名、方法说明段落（从 `METHOD_CONFIG` 的 `description` 键取 zh/en）。分类节点名称来自数据库（申万只有中文、SIC 只有英文），页面用 `nameZh ?? nameEn` / `nameEn ?? nameZh` 并显示代码，不机器翻译。

---

## 13. 测试策略

### 13.1 单元（vitest，内存 `TableClient` + `memoryFactsDb`）

- `providers/tushare-sw.test.ts`：夹具 `fixtures/tushare/index_classify.SW2021.L{1,2,3}.json`、`index_member_all.<l1_code>.is_new{Y,N}.p<page>.json`（真实响应，`record-fixture.ts`，文件头记录录制时间与 sha256）；三行展开、`in_date/out_date` 窗口、`is_new` 两遍合并、翻页、`no_issuer`、关闭窗口 vs 冲突。
- `providers/sec-sic.test.ts`：夹具 `fixtures/sec/submissions.CIK0000320193.trimmed.json`（裁剪 `filings`）；首次/变化/不变三态；未知码。
- `providers/tushare-marks.test.ts`：`daily_basic.<date>.p<page>.json`；万股→股；恒等式隔离；非交易日回退。
- `aggregate.test.ts`：手工构造 3 家公司 × 3 期的事实（含一家中途剔除、一家单位为 USD、一家缺 `cost_of_revenue`、一家上年同期缺）→ 断言整体法值、`n_members/n_with_data`、`comparable_set`、金融业不算毛利率、分母 0 不产出、`inputs_digest` 稳定且对输入顺序不敏感。
- 属性测试（种子随机 200 次）：整体法毛利率落在成分毛利率的 [min, max] 内；同比在可比集合上与逐公司加总一致；分位数单调。
- `valuation.test.ts`：成分无标记的覆盖、分母 ≤ 0 不产出、`facts_as_of=D` 的时点性（D 前后披露不同值）、对账一致率与 `publishable`。
- 路由测试：参数校验、缓存头、`unlicensed` 403、`replay` 的 `match/changed`、限流。
- `judgment-inputs.test.ts`：digest 稳定性。

### 13.2 数据库（`test:db`）

`src/lib/industry/industry.integration.test.ts`（critical，含 `S4_TEST_STATE`，加入 `criticalSuites`）：迁移可重放；`scheme` 枚举含 `sic`；`level_mismatch` 触发器；层级排他约束（同发行人同层级重叠被拒，不同层级允许）；`append_only` 触发器；active run 唯一；`activate_*` 函数原子切换；RLS 真实角色（anon 读不到 `industry_official_valuations`、读不到未发布估值、读得到 active 聚合行与 `ok` 标记）。

### 13.3 离线集成（录制回放）

`src/lib/industry/sync.integration.test.ts`（critical）：申万夹具两遍（第一遍 `inserted>0`，第二遍全 `duplicates`）；SIC 夹具变化 → 关旧开新；标记 + 规格二美股/A 股夹具 → 聚合 run → `replay` 100% `match`；篡改一条事实 `available_date` 后 `changed`；对账夹具低于阈值 → `publishable=false`。

### 13.4 黄金断言

`fixtures/gold/industry.json`：
- 成分：从证监会 2021 年 3 季度分类结果 PDF 人工抄录 30 家公司的证监会门类/大类，与申万 2021 的一级归属做**概念对照**（不是相等断言：记录两套方案对这 30 家的归属与人工判断"是否一致/可解释"，一致率写入 §15 报告；CI 只断言这 30 家在 `membersAt(on='2021-09-30')` 里各有且只有一个申万一级）。
- 估值：3 个行业 × 4 个日期的申万官方 PE/PB 由人从申万官网或 `sw_daily` 响应抄录（记录来源 URL/响应哈希），断言自算值在 1% 内（夹具内可复现）。

### 13.5 E2E

三条路由 + 抽屉打开 + 表格视图切换 + `unlicensed` 态（以 env 开关模拟）+ 移动视口。

---

## 14. 分期（供计划拆任务）

| 工作包 | 交付 | 退出条件 | 估算 |
|---|---|---|---|
| I-0 迁移与契约 | 迁移（枚举、`level`、排他、五表、视图、三函数、权限）、锁文件、types、`industry.integration.test.ts` | `test:db`、`test:migrations` 绿 | 2 人日 |
| I-1 分类与成分 | `tushare-sw.ts`、`sec-sic.ts`、`memberships.ts`、`record-fixture.ts`、夹具、`is_new` 两遍核对记录、`industry_sync_scope` | 单测绿；真实 SEC dry-run 3 家；Tushare dry-run 1 个一级行业（需 token） | 3 人日 |
| I-2 聚合 | `aggregate.ts`、`METHOD_CONFIG`、run/activate、`replay`、脚本、全量耗时实测记录 | 离线集成绿；2 个行业 × 4 期 replay match | 3 人日 |
| I-3 标记与估值 | `tushare-marks.ts`、`tushare-sw-daily.ts`、`valuation.ts`、分位、对账门、admin 明细路由 | 对账夹具测试绿；真实 52 周对账跑一次并记录一致率（需 token） | 3 人日 |
| I-4 读接口 | 五个公共路由 + cron 路由 + `unlicensed` 门 | 路由测试绿 | 2 人日 |
| I-5 页面 | Claude Design canvas 定稿后：三页 + 抽屉 + `/intel` 入口 + 公司页一行 + i18n 域 + parity 测试扩展 | E2E 绿；DESIGN.md 审查 | 4 人日（不含设计稿时间） |
| I-6 调度与文档 | `vercel.json` 条目、launchd 脚本、runbook `docs/runbooks/industry-research.md`、§18 偏差记录 | 全量门禁绿；一次完整周期在生产跑通 | 1.5 人日 |

合计约 18.5 人日（熟悉仓库的高级工程师口径，不含 owner 决策等待、Tushare 积分购买、设计稿）。顺序：I-0 → I-1 → I-2 → I-4（可与 I-3 并行）→ I-5 → I-6。owner 决策 A 为否时：I-1 只做 SIC，I-3 整包取消，I-2/I-4/I-5 只对 `sic` 方案交付（美股财务聚合，无估值）。

验收样例：
1. `GET /api/industries?scheme=sw2021&metric=gross_margin` 返回 31 行，每行 10 个年度格，每格带 `nWithData/nMembers`；任选一格 `replay` 返回 `match` 且输入清单每行有 filing 引用。
2. 一家 2023 年从行业 X 调入 Y 的公司：2022-12-31 的 X 聚合包含它，2023-12-31 的 Y 聚合包含它、X 不含；成分页按日期切换可见。
3. 2024-06-30 的 `pe_ttm` 用的是 2024-06-30 当天可见的 TTM 利润（2024 年报未披露）；同一行业 `sw_daily` 官方值在 1% 内。
4. 关闭 `publishable`（对账失败夹具）后 anon 的 `/api/industries` 返回 `valuation=null`，admin 路由仍可见明细。
5. owner 决策 A 未设置时，非 admin 访问 `/intel/industries?scheme=sw2021` 得到 `unlicensed` 空态，无任何数字；`scheme=sic` 正常。
6. 断网跑 `industry-sync?job=aggregate`：run `failed`，active 不变，页面显示旧 run + `error` 徽标。

---

## 15. 独立验证（除实现者之外）

- **官方对账**：§6.4 的 52 周 × 31 行业 PE/PB 对账，结果表入 `docs/audits/2026-11-04-industry-research/verification/valuation-reconciliation.json`。
- **双来源一致性**：申万一级归属 vs 证监会 2021Q3 门类（30 家人工金集，§13.4）；SIC vs 公司 10-K 封面自述行业（抽 10 家，人工）。
- **回放抽样**：`scripts/industry/replay-check.ts --run <active> --sample 50` 每周在生产跑，输出 `match/changed` 计数到 `ingest_batches`（`producer='industry-replay-check'`），`changed > 0` 写 `dq_quarantine(reason='replay_drift')` 供人工看原因（迟到文件属正常，需记录）。
- **对方页面作为回归样本**：对方 31 × 10 热力图逐格对比（人工录入对方格值到私有夹具 `fixtures/regression/chaosai-industries-2026-11-04.json`，**不进公共接口、不展示**），差异逐项归因（成分/口径/重述/可得日期），不要求一致；归因表入审计目录。
- **第三方模型审计**：Codex（gpt-6-astra，medium）两轮 + 处置表（本规格 `01/02/03`）；每个工作包提交再审。
- **领域专家抽样**：一位卖方行业分析师抽 3 个行业 × 5 个季度的毛利率与 ROE 与其终端（Wind/Choice）整体法值对照，差异与原因记 `verification.json`（不要求一致，要求可解释）。

---

## 16. 环境与 owner 事项

| 事项 | 谁 | 何时 | 默认 |
|---|---|---|---|
| **决策 A**：申万 2021 分类/成分与 `sw_daily` 的使用授权——Tushare 服务条款是否允许在 OsbornAlpha（登录用户可见）展示申万分类与行业估值；是否需要向申万宏源研究所取得授权；若否，是否只内部使用（admin 可见）或完全不用 | owner | I-1 前 | 未确认 = `unlicensed`，页面只给 admin 看；SIC 分支不受影响 |
| **决策 B**：首发方案——`sw2021`（需决策 A）还是只发 `sic`（美股）；两者都发时列表默认方案 | owner | I-1 前 | 两者都做，默认显示 `sw2021`（授权后）；否则 `sic` |
| **决策 C**：证券级标记的回填深度（11 年月末 + 2 年周频，约 212 个交易日全市场）与 Tushare 积分等级（`daily_basic` 2000 分、`index_*` 2000 分、`sw_daily` 5000 分） | owner | I-3 前 | 按 §6.1；积分不足则 `sw_daily` 对账改为人工金集 12 对（§13.4） |
| **决策 D**：未校准判断的展示——F4 上线后，`uncalibrated` 判断是"标签 + 未校准徽标"（§7.2 默认）还是完全不展示直到校准 | owner | I-5 前 | 默认显示标签，不显示任何分数/百分比/颜色等级 |
| 提供 `TUSHARE_TOKEN`（仓库外 env）用于夹具录制与 dry-run；确认积分等级 | owner | I-1 前 | 缺失 → 申万分支只交付单测与"未核对"记录，`sw2021` cron 不开 |
| Mac Studio launchd 跑 `aggregate`/`valuation` 脚本（若 cron 预算不够） | owner | I-6 | — |
| 生产迁移、首轮 `sync.ts --job memberships-sic --apply`、`--job memberships-sw --apply` | owner | 合并后 | — |
| 黄金集抄录（证监会 2021Q3 30 家；申万官方 PE/PB 12 对） | owner / 审核人 | I-3 前 | — |
| 卖方分析师抽样 | owner 邀请 | I-6 后 | — |
| Claude Design canvas 设计 §8.6 六组屏 | owner | I-5 前 | — |

---

## 17. 开放问题（实施前核对）

1. 退市公司：`stocks_universe` 对退市 A 股的覆盖与 `resolveIssuer` 行为未核对；退市公司历史成分缺失会使 2016–2020 的行业聚合偏向幸存者（总纲 §1.2 警告的偏差）。实施第一步统计 `no_issuer` 数量；> 5% 则本规格的历史聚合标 `survivorship_bias_known` 徽标直到规格三补齐。
2. `index_member_all` 的 `is_new='N'` 是否返回完整历史（含多次进出）；版本是否为 2021；`in_date` 对 2021 版发布前的成分是原始纳入日还是 2021 版生效日。
3. 申万 `sw_daily` 的 `pe/pb` 口径（TTM/静态、整体法、负值处理）——决定 §6.4 比较对象。
4. 交易所官网（上交所/深交所）"所属行业"（证监会口径）当前快照的接口与条款——若可用，作为 A 股的一手当前分类（无历史）补充。
5. 中证指数公司估值数据与行业分类的使用条款（第二对账源）。
6. 全量聚合耗时（31 行业 × 全部 A 股成分 × 10 年事实读取）与 cron 预算；是否需要在 `FactsDb` 增加按发行人列表批量读取。
7. 美股非自然财年的年度归组（§5.2 `fiscal_year_grouping`）是否满足页面需求；季度行是否要在 SIC 方案提供。
8. `industry_tags`（细分行业标签图）与 F3 的抽取接口。

---

## 18. 实施记录与偏差

（计划落地后补记，格式同规格一 §14。）
