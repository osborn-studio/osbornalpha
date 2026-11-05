# 公司研究与跟踪模块 设计规格

日期：2026-11-04（第 1 稿）
状态：草案，待 owner 评审（§15 有八项 owner 事项）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一：`issuers`、`issuer_securities`、`resolveIssuer`、DQ 设施；§14 的实施偏差视为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二，第 3 稿：`filings`、`financial_facts`、`financial_metrics`、`read.ts::getFactsAsOf`、`derive.ts`、`/api/facts/[ticker]`、`/api/facts/[ticker]/metrics`、`/api/filings/[ticker]`、`citation` 状态、`asOf` 回放）。本规格是规格二读接口的**首个消费者**，并接手规格二 §1.2/§15.6 留给公司研究规格的两件事：五个 `/api/financials/[ticker]` 读者的迁移方案、`financial_history` 表的去留。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。逐条对照：本模块只展示规格二从一手来源（EDGAR companyfacts、交易所定期报告经 Tushare 适配并挂接巨潮公告）建立的事实；页面上每个财务数字都能打开"披露历史抽屉"看到源文件、定位、可得日期、变换与代码版本；事实区与判断区分开，判断的登记、结算、校准由判断层框架（F4）承担，本页只按 F4 的显示契约渲染，**没有结算机制的胜率不以百分比出现**；缺失保持缺失（港股事实未入库就显示"待文档管道"，不拿第三方指标顶替）；外资研报不在本模块；UI 遵守 `DESIGN.md` 与 `globals.css` tokens，zh/en 双语，所有图表有表格等价视图（本模块表格是主视图、图是可选视图）。
对方站点（`chaosaiagent.com/company`、`/monitor`）只作功能参考与回归对照，其数据、评级、胜率一律不导入（§3.1 逐元素分类）。

---

## 1. 目标与非目标

### 1.1 目标

1. **一个公司一页。** 现有 `/stock/[ticker]` 升级为公司页：页头按规格一的发行人与证券（A/H/US 多代码、CIK/LEI/USCI）呈现身份；报表、派生指标、披露文件三个视图直接读规格二的事实库；每个数字可打开披露历史抽屉回放；页面级 `asOf` 回放控件。
2. **跟踪是事实驱动的时间线，不是人工日历。** 事实库每次发布后物化"公司事件"（新文件、新财期、数值修订）；用户按发行人登记跟踪，跟踪收件箱按事件的首次可见时间计未读；判断类事件（论点检查点、预测登记与结算）来自 F4，按 F4 的显示契约合并进同一条时间线。
3. **五个旧读者迁到事实库，旧接口按规格二的弃用头退役。** `/api/dcf/[ticker]`、`src/lib/agent/tools.ts` 的 `financials` 工具、`src/lib/dcf/assemble.ts` 改读事实与派生指标（美股因此首次获得财务种子）；`useFinancials` 无消费者，删除；`/api/consensus/[ticker]` 只是注释引用。`financial_history` 空表、零读者，删除（§15 决策 C）。
4. **覆盖目录与数据状态。** `/intel/companies` 列出事实库覆盖的全部发行人及其数据状态（最近财期、最近文件、概念覆盖数、引用状态、新鲜度），这是对方"231 家覆盖表"的事实版——没有评级列，评级列等 F4。

成功标准（退出条件）：

- `GET /stock/AAPL?view=statements&asOf=2024-06-30` 的利润表网格中 period_end 2023-09-30 的 revenue 单元格显示规格二黄金断言的值，抽屉显示 `availableDate=2023-11-03`、`disclosureSeq=1`、form `10-K`、EDGAR 索引链接；去掉 `asOf` 后同一单元格 `disclosureSeq=2`、`isRevision=false`，抽屉列出两次披露。
- `GET /stock/600519.SH?view=filings` 每条年报 filing 显示 `citation`（`linked` 带巨潮 PDF 链接；`pending` 显示"巨潮公告未挂接"徽标），不显示任何价格或评级。
- `/stock/00700.HK` 页头正常（发行人、证券、行情），报表/指标/文件三个视图显示"港股披露事实待文档管道（F3）"的缺失状态，不显示任何代理数字。
- 对规格二美股夹具（AAPL、MSFT）运行事件物化两遍：第一遍产生事件，第二遍零变化且 `first_seen_at` 不变；注入一份更晚的修订 filing 后出现恰好一条 `fact_revised` 事件。
- 用户 A 登记跟踪、用户 B 看不到 A 的跟踪行（RLS 集成测试）；`issuer_events`、`issuer_coverage` 两张公共表不含任何用户字段。
- `/api/dcf/AAPL` 的 `assumptions` 中 `revenueLines[0].baseRevenue`、`sharesDiluted`、`netDebt` 来自事实库（响应 `seed.sources` 列出 fact ids），`warnings` 不再含"暂无财报数据"。
- 全部门禁绿：`npm test`、`npm run test:db`（新增集成套件进入 `criticalSuites`）、`npm run test:migrations`、i18n 对等测试覆盖新增消息文件。

### 1.2 本规格之外

- 判断的登记、结算、校准、Brier 分数、可靠性曲线、凯利仓位：F4 规格。本规格只定义本页需要的**显示契约**（§10.4）并在 F4 落地前显示明确的空状态。
- 港股事实、业绩说明会纪要、公告原文页码引用、文档权限：F3 规格。本规格定义本页需要的源抽屉接口（§10.3）。
- 卖方评级与目标价：授权来源未定（总纲 §2.2），本规格不展示；现有 `/api/consensus/[ticker]` 的 Tushare `report_rc` 中位数与 mock 回退在本页不再渲染（§15 决策 D）。
- 行业树筛选、同业横向对比：依赖 `issuer_industry_memberships` 的加载（行业研究规格）；本规格只预留目录页的行业筛选位（§6.4）。
- 外资研报、宏观联动入口之外的其他模块联动。
- 邮件/推送提醒：现有 `watchlist_alerts*` 三表无应用层读写者（§2），本规格的"提醒"止于站内收件箱未读；外送另立。
- LLM 生成的解读与摘要：本模块零 LLM 调用。现有"AI 观点"页签不在本规格范围，但本规格要求其文案改为"未校准的模型观点"并去掉"共识 x.x"数字（§15 决策 E）。
- 历史时点的 ticker 归属（规格二按今天解析；规格三交付历史证据）：本页 `asOf` 只作用于事实，页头始终显示今天的归属。

---

## 2. 现状（2026-11-04 仓库勘察）

| 领域 | 现状（文件） | 本规格如何处理 |
|---|---|---|
| 公司页 | `src/app/(app)/stock/[ticker]/page.tsx`：客户端组件；六个页签 overview/ai/fundamentals/news/signals/holdings；身份与财务来自 `getStockOrStub()`（`src/lib/data/mock.ts`，6 家含虚构 `broker_reports`/`news`/`financials` 的 mock，其余由 `MOCK_UNIVERSE` 造桩）与 `mergeStockDetail()`（`src/lib/stocks/detail.ts`）；行情来自 `useQuote`；fundamentals 页签 = `DcfStudio` + mock `financials` 的三行表和柱图；news 页签 = mock `broker_reports` 或 `/api/consensus` | 页头改用 `/api/entities/resolve`；报表/指标/文件视图全部换成事实库；mock 的 `financials`、`broker_reports`、`news` 不再渲染（§5） |
| 旧财务接口 | `src/app/api/financials/[ticker]/route.ts`：仅 A 股，实时拉 Tushare 三表 + `fina_indicator`，年度五年，金额换算成亿；规格二给它加 `Deprecation` 头 | 读者迁移（§9），退役时点为 owner 决策 B |
| 五个读者 | `src/app/api/dcf/[ticker]/route.ts` 经 `origin` 自调 `/api/financials`；`src/lib/dcf/assemble.ts::seedFromFinancials` 读 `f.revenue / grossMargin / sharesDiluted / netDebt` 四个键——**该路由从不输出这四个键**（它输出 `yearly[]` 与 `latest_indicator`），所以 DCF 种子一直为空、每次都走"暂无财报数据"警告；`src/lib/agent/tools.ts` 的 `financials` 工具（`aShareOnly`）；`src/lib/hooks/useQuote.ts::useFinancials`（无任何消费者，`grep` 仅见定义）；`src/app/api/consensus/[ticker]/route.ts` 仅注释提到 | §9 逐个迁移；`useFinancials` 删除 |
| `financial_history` | `supabase/migrations/20260515000000_initial_schema.sql` 建表（ticker, fiscal_year, period, revenue, net_income, roe, gross_margin, free_cash_flow），公共只读 RLS；`src/lib/supabase/database.types.ts:667` 有类型；代码中唯一引用是 `src/app/api/stocks/[ticker]/route.ts` 的 TODO 注释；规格一 §4.2 的"表→视图"承诺由规格二 §1.2 推迟到本规格 | 删除表与类型（§4.4，决策 C） |
| 发行人与解析 | `issuers`、`issuer_securities`（`valid_from` 为首次观察日）、`GET /api/entities/resolve?ticker=`（anon 客户端、按 UTC 日界的 `Cache-Control`、响应 `{issuer_id, status, redirected_from?, names{zh,en}, identifiers{cik,lei,usci}, securities[]}`） | 页头数据源 |
| 事实库 | 规格二第 3 稿：`filings(citation 由读接口计算: linked/pending/edgar)`、`financial_facts(value_text, available_date, mapping_gen)`、`financial_metrics(formula_version, inputs, basis, input_unit)`、`read.ts::getFactsAsOf`、`derive.ts`、`FactsDb` 三实现（anon 只读子集）；代码**尚未落地**（`src/lib/facts` 不存在） | 本规格的服务端组合直接调用 `read.ts`/`derive.ts`，不经 HTTP 自调；实施顺序在规格二 F2-6 之后 |
| 自选股 | `watchlists`/`watchlist_items(user_id, ticker, conviction, notes)` 按用户 RLS；客户端 `useWatchlist` 以 localStorage 优先 + `PUT /api/watchlist/sync` 全量替换；访客模式只有本地 | 跟踪不复用自选表（§4.3 说明），提供"从自选导入" |
| 提醒设施 | `watchlist_alerts`（`alert_type ∈ price/change_pct/volume_ratio/valuation/event/rating/perspective`）、`watchlist_alert_events`、`watchlist_alert_runs`（`20260904090000_watchlist_decision_sync.sql`）：应用代码中**没有读写者**（仅 `scripts/ci/migration-rehearsal.ts` 引用表名）；`src/app/api/cron/alerts/{quotes,ai}` 是服务可观测性检查（`quote_15m`、`ai_daily`），不是用户提醒 | 不接外送；收件箱未读以 `company_watches.last_seen_at` 计 |
| 研究跟踪（owner 私有） | `research_theses`（`invalidation_conditions`、`watch_metrics`、`pillars`、`kill_condition_revisions`）、`research_thesis_events`、`monitor.ts`（LLM 审 7 天信号/来源，写 PENDING 事件，不改状态）、S4 判断账本 `research_judgments/decisions/outcomes`（内容寻址、只追加、`replayJudgments` 按 `available_at ≤ as_of`）、S6 四臂报表；全部 `requireResearchUser()`（admin）门控、按 `user_id` RLS | 判断层候选来源，交 F4 统一；本页通过 F4 契约渲染 |
| 分析师评分 | `recommendations(confidence 0–100, target_price, horizon, source_type)` 只追加；`recommendation_scores(forward_5d/20d/60d, hit, score, calibration_bucket)`；`GET /api/analyst/recommendations?ticker=` 按用户 | 已有"登记 → 结算"闭环，是 owner 决策 A 的候选一 |
| 行情 | `useQuote` / `GET /api/quote/[ticker]`（Eastmoney→Sina→Tencent→Tushare 分层，`pe_ttm/pb/roe/dividend_yield` 部分来自 Tushare `fina_indicator`） | 页头继续用；行情指标标注来源名；不与事实混排 |
| 日历 | `GET /api/calendar/[ticker]`（`src/lib/brief/calendar.ts`：Tushare `disclosure_date/forecast/dividend/share_float`，仅 A 股） | 跟踪视图"预计披露日"仅 A 股，标注"交易所预约披露时间表（Tushare 适配）"；美股无来源则缺失 |
| 设计与 i18n | `DESIGN.md`、`src/app/globals.css` tokens（`--accent/--accent-dim/--accent-wash/--up/--down/--warn/--text-dim/--text-muted`、`[data-density="data"]`）；`src/components/ui`（Panel/Metric/Tag/Button/Card）；`messages/{zh,en}/*.json`；`src/i18n/messages-parity.test.ts` 只对 `common/components/portfolio/analyst` 四个文件做键对等 | 新增 `company.json`、`tracking.json` 并加入对等测试 |
| 管理与 cron | `requireAdminUser()`；`authorizedCronRequest(authHeader, CRON_SECRET)`；`vercel.json` crons，`maxDuration` 由路由声明；`TableClient`（Supabase/memory/pg） | 同法 |
| 测试门禁 | `vitest` include `src/**/*.test.ts`；`test:db` 要求含 `S4_TEST_STATE` 的文件都在 `scripts/ci/research-checks.ts::criticalSuites`；`test:migrations` 要求新迁移时间戳晚于锁定的最新（现为 `20261105091000`；规格二将占用 `20261106090000`）；Playwright 在 `e2e/` | 新迁移 `20261107090000_company_research.sql` |

---

## 3. 对方页面逐元素分类与本规格的对应

### 3.1 `/company`（覆盖表）与 `/monitor`（跟踪页）

证据等级：`/company`、`/company/alphabet` 为 HTML 壳层 + 公开客户端资源，交互未运行；`/monitor` 公开 HTML 正文（`EVIDENCE.json`）。元素来自 `EXPERT_PLAYBOOK_AND_BRIEF.md` §2.1 与 `/monitor` 标题串。

| 对方元素 | 类别 | 本规格 |
|---|---|---|
| 覆盖公司列表（港 70 / A 129 / 美 32） | 导航 | `/intel/companies` 目录（§6.4），成员 = 事实库有发布事实的发行人 |
| 值博率星级、核心逻辑一句话、胜率、预期涨幅、下跌空间、赔率、凯利仓位 | 判断 | F4；本页"判断"视图按 §10.4 契约渲染；F4 未落地前空状态 |
| 覆盖时价格、研究日期 | 事实（判断的输入快照） | 属于 F4 登记记录的字段，本页只展示 |
| DCF 勾选 | 导航 | 现有 `DcfStudio` 保留在"指标"视图底部，输入改为事实种子（§9.1） |
| 行业树二级筛选 | 导航 | 目录页预留筛选位，依赖行业规格加载成分 |
| 季度上调/下调标记 | 判断变化事件 | F4 事件，经时间线合并（§7.3） |
| 财务表格与图 | 事实 | 报表/指标视图（§5.3、§5.4） |
| 核心跟踪指标：目标标准 | 判断（可证伪条件） | F4 检查点 |
| 核心跟踪指标：实际 | 事实 | 本页从事实库取同口径值并给 F4 结算（§10.4 `settleInputs`） |
| 置信度变化、权重 | 判断 | F4 |
| 机构评级表（中报后卖方目标价与评级动作） | 第三方判断（授权来源） | 不做（§1.2） |
| 业绩说明会纪要（管理层公开表述） | 文档 | F3；本页"文件"视图预留"纪要"分组 |
| 跟踪事件：业绩发布、风险事件 | 事实事件 / 判断事件 | `issuer_events`（§4.1）+ F4 事件 |
| 基本面动态已过滤行情噪音 | 导航（过滤器） | 时间线不含任何价格事件，本来就无噪音可滤 |
| 下次跟踪节点 | 判断检查点 | F4；本页显示"预计披露日"（A 股，来源标注） |

### 3.2 对方作为回归对照的用法

目录页与跟踪页上线后，对对方覆盖表中同时存在于我方事实库的公司（按名称人工配对，记入 `docs/audits/2026-11-04-company-research/regression-sample.md`），逐家核对：我方最近财期是否 ≥ 对方"研究日期"所在财期；对方"覆盖时价格"能否用我方行情链路在该日复现（容差为行情源的前复权差异，逐条解释）。不要求一致，要求可解释。

---

## 4. 数据模型

迁移 `supabase/migrations/20261107090000_company_research.sql`，可重放（`create table if not exists`、`drop policy if exists` 后重建、`create or replace function`、`drop table if exists`）。补 `supabase/migrations.lock.json`；`database.types.ts` 手工补三个 Row 类型并删除 `FinancialHistory`。所有新表显式 `revoke all from public, anon, authenticated` 后按 §4.5 授权。

### 4.1 `issuer_events`（公共，事实事件时间线，按发行人原子重建）

```
event_id          text primary key                           -- sha256(canonical({issuer_id, kind, natural_key}))，十六进制
issuer_id         uuid not null references issuers(issuer_id) on delete restrict
kind              text not null check (kind in ('filing_published','period_first_seen','fact_revised'))
natural_key       text not null
occurred_on       date not null                              -- 事件的可得日期（§7.2）
period_end        date
concept           text
filing_id         uuid references filings(filing_id) on delete restrict
payload           jsonb not null check (jsonb_typeof(payload) = 'object')
first_seen_at     timestamptz not null default now()         -- 首次物化时间；重建时保留（未读依据）
rebuilt_at        timestamptz not null default now()
rebuild_batch_id  uuid not null references ingest_batches(batch_id) on delete restrict
unique (issuer_id, kind, natural_key)
index (issuer_id, occurred_on desc, event_id)
index (issuer_id, first_seen_at desc)
```

`payload` 只含公共事实与它们的 `fact_id/filing_id`，不含用户字段。三种 kind 的 `natural_key` 与 `payload`：

| kind | natural_key | occurred_on | payload |
|---|---|---|---|
| `filing_published` | `filing_id` | `filings.available_date` | `{formType, fiscalYear, fiscalPeriod, periodEnd, availableDate, sourceRef, url, documentRef, documentUrl, citation, factCount}` |
| `period_first_seen` | `<duration>:<period_end>` | 该 `(duration, period_end)` 下当前可见事实的最小 `available_date` | `{periodEnd, duration, filingId（给出最小可得日期的 filing）, conceptCount, headline: {revenue?, net_income_parent?, operating_cash_flow?: {factId, value, unit}}}`（headline 取同 `(duration, period_end)` 的当前值；缺哪个就没有哪个键） |
| `fact_revised` | `<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<to_fact_id>` | `to.available_date` | `{concept, statement, periodStart, periodEnd, duration, consolidation, unit, from: {factId, value, filingId, availableDate}, to: {factId, value, filingId, availableDate}, relChange（`from.value ≠ 0` 时 `(to−from)/abs(from)`，否则缺省）}` |

函数 `public.replace_issuer_events(p_issuer uuid, p_batch uuid, p_rows jsonb) returns int`（`security definer`，仅 service_role）：`pg_advisory_xact_lock(hashtext('issuer_events:' || p_issuer))`；`insert … on conflict (event_id) do update set occurred_on, period_end, concept, filing_id, payload, rebuilt_at = now(), rebuild_batch_id = p_batch`（`first_seen_at` 不在 update 列表，保留）；然后 `delete from issuer_events where issuer_id = p_issuer and rebuild_batch_id <> p_batch`；返回 upsert 行数。事件被删只发生在它不再可从当前 `ok` 行推导（映射代升级、隔离接受后旧值序列变化）。

### 4.2 `issuer_coverage`（公共，每发行人一行，目录页与页头数据状态）

```
issuer_id              uuid primary key references issuers(issuer_id) on delete restrict
markets                text[] not null                       -- 有事实的市场子集 {'US'} / {'CN'} / {'US','CN'}
filings_count          int not null
facts_count            int not null                          -- status='ok' 且 mapping_gen = filings.mapping_gen 的行数
concepts_covered       int not null                          -- 至少有一个当前可见事实的概念数（上限 FACT_CONCEPTS.length）
earliest_period_end    date
latest_period_end      date
latest_available_date  date
citation_summary       jsonb not null check (jsonb_typeof(citation_summary) = 'object')   -- {linked, pending, edgar}
freshness_dataset      text not null check (freshness_dataset in ('facts.us','facts.cn'))
freshness_status       text not null check (freshness_status in ('fresh','stale','error','missing'))
last_success_at        timestamptz                           -- 复制自 fact_sync_scope.last_success_at
rebuilt_at             timestamptz not null default now()
rebuild_batch_id       uuid not null references ingest_batches(batch_id) on delete restrict
index (latest_available_date desc)
```

同一发行人两路市场（规格二 §4.4 允许）时 `freshness_dataset/freshness_status` 取 `fact_sync_scope.last_success_at` 较新的那一路，`markets` 列全。`freshness_status` 由 `computeFreshness()` 在物化时算出后复制，公共路由不读 `dq_freshness`。写入经 `replace_issuer_coverage(p_issuer, p_batch, p_row jsonb)`（upsert，同锁）。

### 4.3 `company_watches`（按用户，RLS own-rows）

```
user_id       uuid not null references auth.users(id) on delete cascade
issuer_id     uuid not null references issuers(issuer_id) on delete restrict
note          text check (note is null or char_length(note) <= 2000)
muted         boolean not null default false
last_seen_at  timestamptz not null default now()
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
primary key (user_id, issuer_id)
index (user_id, updated_at desc)
```

为什么不复用 `watchlist_items`：它按 ticker 而非发行人（A+H+ADR 是三行）；访客模式下只存在于 localStorage，无法挂服务端的已读状态；它的语义是行情看板分组。跟踪是发行人级、服务端状态。桥接：`POST /api/tracking/watches/import-watchlist`（§6.3）把当前用户服务端自选的 ticker 解析为发行人批量登记，无法解析的 ticker 原样返回。每用户上限 `MAX_COMPANY_WATCHES = 200`（与 `DQ_MAX_PAGE_SIZE` 同值，收件箱一页列完，不分页），API 层检查，超出 409 `watch_limit`。

### 4.4 `company_digest_state`（仅 service_role，物化水位）

```
id                     text primary key check (id = 'default')
scope_watermark        timestamptz not null default 'epoch'   -- 上次处理到的 fact_sync_scope.last_success_at
full_sweep_at          timestamptz                             -- 上次全量重建完成时间
updated_at             timestamptz not null default now()
```

### 4.5 `financial_history`

`drop table if exists public.financial_history;`（表空、无写入者、无代码读者，§2）。`database.types.ts` 删 `FinancialHistory` 与 `financial_history` 条目；`src/app/api/stocks/[ticker]/route.ts` 的 TODO 注释改为指向 `/api/companies/[ticker]/overview`。决策 C 若选"保留"，则改为本规格不动该表，上述两处不改。

### 4.6 权限

- `issuer_events`、`issuer_coverage`：`grant select to anon, authenticated`，RLS `using (true)`；`grant select, insert, update, delete to service_role`。
- `company_watches`：`grant select, insert, update, delete to authenticated`，四条策略 `auth.uid() = user_id`（insert/update 带 `with check`）；anon 无授权；service_role 全部（仅测试与运维用，应用代码不以 service_role 写该表）。
- `company_digest_state`：仅 service_role。
- 两个函数：`revoke execute from public, anon, authenticated; grant execute to service_role`。集成测试以真实角色验证（anon 读不到 `company_watches`、不能执行函数；authenticated 用户 B 读不到 A 的行）。

---

## 5. 公司页 `/stock/[ticker]`

### 5.1 路由与入口

- 路由不变：`/stock/[ticker]`；视图由查询参数 `view ∈ overview | statements | metrics | filings | tracking | judgments | ai` 选择（缺省 `overview`），可深链；`asOf=YYYY-MM-DD` 为页面级回放参数，作用于 statements / metrics / filings / tracking 四个视图与页头"数据状态"的"最近文件"；页签切换保留 `asOf`。现有 `news`、`holdings`、`signals` 三个页签：`news` 退役（决策 D），`holdings`/`signals` 不动。
- 入口：自选表与目录页的名称链接；跟踪收件箱事件行（深链到 `view=statements&asOf=<occurred_on>` 或 `view=filings`）；Copilot 工具结果中的 ticker；现有搜索。
- 页面在 `(app)` 受保护组内（中间件登录门禁）；页面调用的 `/api/companies/*`、`/api/facts/*`、`/api/filings/*`、`/api/entities/resolve` 均为公共只读。
- 实现形状：`page.tsx` 变为服务端组件，服务端先 `resolveIssuer` 与读 `issuer_coverage`（一次往返），把 `{issuer, securities, coverage}` 交给客户端 `CompanyPage`；各视图是客户端组件按需取数。身份不再来自 `getStockOrStub()`；`mergeStockDetail()` 只保留给行情字段。

### 5.2 页头

```
┌ 贵州茅台 Kweichow Moutai      [600519.SH ◉] [A] · CIK — · LEI 300300…  数据状态 ● fresh · 最近财期 2025-09-30 · 最近文件 2025-10-25 · 引用 linked 9 / pending 1 ┐
│ ¥1,432.00  −0.85%  (Eastmoney · 15:00 延时)          [加入自选] [跟踪 ✓] [分析 ▸]                                                              │
│ 回放：截至 2024-06-30 可见的披露  [日期 ▾] [回到最新]   ← 仅当 asOf 存在时显示此条，黄铜描边                                                   │
├ 概览 | 报表 | 指标 | 文件 | 跟踪 | 判断 | AI 观点（未校准）                                                                                      ┤
```

- 名称：`names.zh` / `names.en` 按当前语言，另一种语言作副标题；两者都空则显示 ticker。
- 证券芯片：`securities` 中 `valid_to is null` 的全部证券，`is_primary` 在前；当前 ticker 高亮；点击其他芯片切换路由（同一发行人）。`redirected_from` 存在时提示"该代码已并入 …"。
- 标识符：`cik`（显示时补足 10 位）、`lei`、`usci`，缺则显示"—"并在 title 说明"未登记"。
- 数据状态芯片来自 `issuer_coverage`；没有行 → 芯片显示"尚无披露事实"，报表/指标/文件视图进入 §5.7 缺失状态。
- 行情行沿用现有 `useQuote`，显示来源名与延时标记；行情指标（PE/PB/股息率/市值）留在概览视图并标注来源，不进报表视图。
- 回放条：日期控件限制 `≤ 今天`；设置后 URL 更新；页头"最近文件"按 `available_date ≤ asOf` 重算（客户端从 filings 列表算，不另开接口）。

### 5.3 报表视图（statements）

控件：报表（IS / BS / CF）· 期间口径（`12M` 年度 / 累计（按披露：3M/6M/9M/12M 混排）/ 单季（派生 `q_single_*`，只对规格二 §8 列出的五个概念））· 期数（8 / 20 / 40）· 显示单位（原值 / 千 / 百万 / 亿，按货币与语言默认：CNY 中文默认"亿"，USD 英文默认"百万"）· 合并口径固定 `consolidated`。

网格：行 = 该报表的概念（§3 概念目录中 `statement` 匹配者，按目录顺序；`DEI` 的 `shares_outstanding` 放 BS 末行）；列 = 期末日降序；单元格 = `value_text` 按显示单位格式化（Geist Mono、tabular-nums），右上角徽标：`R`（`isRevision`）、`n`（`disclosureSeq > 1` 且非修订，title "第 n 次披露，值相同"）、`!`（该 filing `citation = pending`）。单元格点击 → 披露历史抽屉（§5.6）。行头点击 → 概念说明弹层：`source_concept`（本公司实际命中的标签/字段）、市场口径备注（概念目录 `notes`）、`mappingGen`。

数据来源：服务端路由 `GET /api/companies/[ticker]/statements`（§6.1）调用规格二 `read.ts::getFactsAsOf(issuerId, {concepts, from, to, asOf})` 与 `derive.ts`（单季口径），按概念组装网格；每个单元格携带 `{factId, filingId, availableDate, disclosureSeq, isRevision, unit, rawHash, citation}`。网格不做任何跨单位换算：同概念同期若存在多个单位（规格二 §3 允许），以 `filings` 多数单位为主列，其余单位的事实在抽屉里列出并在单元格加 `U` 徽标。

表格等价与图：表格是主视图。每行行头右侧"迷你柱"开关打开该行的内联 SVG 柱图（现有 `MiniChart` 模式改为 token 色），移动端（< 640px）不渲染柱图。导出：`CSV`（含 `fact_id`、`filing_id`、`available_date` 列）。

### 5.4 指标视图（metrics）

- 行 = `financial_metrics` 的 `metric`（规格二 §8 全部）；列 = 期末日；值按 `unit`（`ratio` 显示为百分比两位小数；货币按显示单位；`shares` 原值）。
- 无 `asOf` 读表（当前 `formula_version`）；有 `asOf` 走 `/api/facts/[ticker]/metrics?asOf=` 的实时 derive（规格二 §9）。页头显示 `formulaVersion`。
- 行点击 → 公式抽屉：公式文本（zh/en）、`basis`、`input_unit`、`inputs[]`（每个 fact 可点进披露历史抽屉）、`as_of`、`computed_at`、缺失原因（例如"金融类无 cost_of_revenue"、"上年同期不唯一"）。公式文本来自规格二需要补充导出的 `METRIC_CATALOG`（§10.1）。
- `DcfStudio` 移到本视图底部，种子来自 §9.1；其输出区继续显示现有"DCF 假设含 AI/默认估计"警告，并新增"种子来源：事实库 fact ids"或"无事实种子"。

### 5.5 文件视图（filings）

列表（`available_date` 降序）：可得日期 · 类型（`form_type`；CN 显示"年报/半年报/一季报/三季报/更正"）· 财期（`fiscal_year` + `fiscal_period`）· `period_end` · 来源（`EDGAR` / `Tushare → 巨潮`）· 引用状态徽标（`edgar`：链接到 EDGAR 索引页；`linked`：链接到巨潮 PDF；`pending`：灰色"巨潮公告未挂接（第 n 次尝试）"，`link_attempts ≥ 5` 时文案"挂接失败，待人工"）· 事实数 · 操作："在报表中高亮"（切到 statements 并高亮该 filing 披露的单元格）、"原文/引用"（§10.3 F3 抽屉；F3 未落地时直接新窗口打开 `url`/`document_url`）。

分组预留："定期报告"（本期全部）、"纪要与其他"（F3）。`asOf` 存在时只列 `available_date ≤ asOf`。

### 5.6 披露历史抽屉

从任一单元格或指标输入打开。内容按时间升序：

| 列 | 来源 |
|---|---|
| 可得日期 | `availableDate` |
| 文件 | `formType` + `sourceRef`，链接按 citation |
| 值 · 单位 | `value_text`，不换算 |
| 修订 | `isRevision` → 显示与前一次的差值与相对变化 |
| 命中标签 | `sourceConcept` |
| 映射代 | `mappingGen` |
| 原始快照 | `rawHash` + 定位规则（规格二 §4.6 文字：EDGAR 按 `accn/end/start/unit`，Tushare 按 `end_date/report_type/公告日`） |
| 代码版本 | 该 filing 所属 `ingest_batches.code_version`（需 §10.1 的读接口补充；缺省显示 batch id） |

抽屉顶部重复显示"当前 asOf 下的当前值"，底部"复制可复现查询"：`GET /api/facts/<ticker>?concepts=<c>&from=<pe>&to=<pe>&asOf=<asOf>&history=1`。

### 5.7 缺失与特殊状态

| 状态 | 判定 | 页面 |
|---|---|---|
| 未知 ticker | `resolveIssuer` 为 null 且 `/api/quote` 也 404 | 现有 `notFound` 状态 |
| 有行情无发行人 | resolve null，行情有 | 页头只有行情；数据状态"未登记发行人"；三个事实视图显示"该证券尚未登记到发行人主数据（规格一），无披露事实" |
| 发行人无事实 | resolve 有，`issuer_coverage` 无行 | 三个事实视图显示"尚无披露事实（不在同步范围或尚未同步）"；admin 看到 `/admin/dq` 链接 |
| 港股 | 发行人证券全部为 `.HK` 且无 US/CN 事实 | 三个事实视图显示"港股披露事实待文档管道（F3）"；不显示任何代理 |
| A 股引用待挂接 | filing `citation = pending` | 单元格 `!` 徽标；文件视图灰徽标；页头引用计数 |
| 回放早于首个文件 | `asOf < earliest available_date` | 网格空，提示"截至该日尚无可见披露" |
| 概念缺失 | 某期无该概念事实 | 单元格"—"，title 按市场："companyfacts 无此标签"/"三表无此字段" |
| 规格二路由 5xx | 组合路由内部错误 | 视图级错误卡 + 重试；不回退到任何其他数据源 |

### 5.8 概览视图（overview）

保留 K 线与行情指标卡（每张卡加来源名：`quote.source`，Tushare `fina_indicator` 来的 `roe/dividend_yield` 标"Tushare 指标（非披露事实）"）；新增"最新财期速览"卡：`latest_period_end` 的 `revenue`、`net_income_parent`、`operating_cash_flow`、`gross_margin`、`revenue_yoy`（来自 metrics/facts，各带抽屉入口）；新增"最近事件"三条（`issuer_events`）。现有"今日无触发"信号卡不动。

### 5.9 移动端

页头证券芯片横向滚动；视图页签横向滚动（现有样式）；报表网格横向滚动并冻结首列；抽屉变全屏底部抽屉；不渲染迷你柱。

---

## 6. 读取与写入接口

共同约定：公共只读路由用 `getAnonSupabase()`（事实库用规格二的 anon `FactsDb`）、`force-dynamic`、参数重复 → 400 `invalid_parameter:<name>`、ticker 正则与 `/api/entities/resolve` 的 `SAFE` 同源、`resolveIssuer({ticker},{today})` 无 → 404 `unknown_ticker`；`asOf` 为 `YYYY-MM-DD` 且 ≤ 今天；错误与空结果 `no-store`；成功且 `asOf` 早于今天 → `public, max-age=600, s-maxage=3600`（与规格二 §9 一致），否则 `successCacheControl(now)`。按用户路由用 `getServerSupabase()` 的会话客户端（RLS），全部 `no-store`，未登录 401。

### 6.1 公共

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/companies/[ticker]/overview` | — | `{issuer: ResolvedIssuer, coverage: IssuerCoverageRow \| null, recentEvents: Event[≤3], latest: {periodEnd, headline: {...}} \| null}`；页头与概览用 |
| `GET /api/companies/[ticker]/statements` | `statement=IS\|BS\|CF`（必填）、`basis=disclosed\|annual\|quarterly`（缺省 `disclosed`）、`periods=8\|20\|40`、`asOf` | `{issuerId, ticker, asOf, mappingGen, statement, basis, periods: [{periodStart, periodEnd, duration}], rows: [{concept, sourceConcepts: string[], notes, cells: {[periodKey]: Cell \| null}}], units: {primary, others[]}, filings: {[filingId]: FilingSummary}}`；`Cell = {factId, value, unit, availableDate, filingId, disclosureSeq, isRevision, citation, rawHash}`；`basis=quarterly` 时 `cells` 来自 derive 的 `q_single_*`，每格带 `inputs[]` |
| `GET /api/companies/[ticker]/events` | `since`（date）、`until`、`kinds`、`limit`（≤ 200，缺省 50）、`asOf` | `{issuerId, events: [{eventId, kind, occurredOn, firstSeenAt, periodEnd, concept, filingId, payload}]}`，`asOf` ⇒ `occurredOn ≤ asOf` |
| `GET /api/companies` | `market=US\|CN`、`freshness`、`q`（名称/ticker 前缀，≤ 24 字符）、`sort=latest_available_date\|latest_period_end\|name`、`page`、`pageSize ≤ 200` | `{total, rows: [{issuerId, names, primaryTicker, tickers[], markets, latestPeriodEnd, latestAvailableDate, conceptsCovered, citationSummary, freshnessStatus}]}`；目录 |
| 规格二路由 | `GET /api/facts/[ticker]`、`/metrics`、`GET /api/filings/[ticker]` | 抽屉、指标视图、文件视图直接使用，不再包一层 |

`statements` 路由的服务端组合：对该报表的概念集合调用 `getFactsAsOf`（每概念一次请求，规格二 §5.4 的一致性边界照单接受，响应头 `X-Facts-Consistency: per-concept`），`periods` = 概念集合内出现过的 `(period_start, period_end, duration)` 去重降序裁到 `periods` 个；`basis=annual` 只保留 `12M` 与 `INSTANT`（BS）；`basis=quarterly` 取 derive 输出的 `3M` 行。

### 6.2 按用户（跟踪）

| 路径 | 行为 |
|---|---|
| `GET /api/tracking/watches` | 当前用户全部 `company_watches` 联 `issuers`/`issuer_coverage` 与未读数（`issuer_events.first_seen_at > last_seen_at` 且 `occurred_on` 不晚于今天，按发行人计数，≤ 50 封顶显示 `50+`） |
| `POST /api/tracking/watches` | body `{issuerId}` 或 `{ticker}`；解析、上限检查、插入；幂等（已存在返回 200 原行） |
| `PATCH /api/tracking/watches/[issuerId]` | `{note?, muted?}` |
| `POST /api/tracking/watches/[issuerId]/seen` | `last_seen_at = now()`；返回新值 |
| `DELETE /api/tracking/watches/[issuerId]` | 删除 |
| `POST /api/tracking/watches/import-watchlist` | 读当前用户服务端 `watchlist_items.ticker` 去重 → `resolveIssuer` → 批量插入（跳过已存在；上限内）；返回 `{added[], existing[], unresolved[]: ticker[], skippedByLimit[]}`；访客（无服务端自选）→ 409 `no_server_watchlist` |
| `GET /api/tracking/inbox` | `since`、`kinds`、`limit ≤ 200`：当前用户未静音的跟踪 × `issuer_events`（`first_seen_at > last_seen_at` 或 `since`）→ 按 `first_seen_at` 降序合并；每条带发行人名称与主 ticker；F4 落地后合并 F4 事件（§10.4） |

CSRF：POST/PATCH/DELETE 校验 `Origin` 与 `Content-Type: application/json`（与 `/api/admin/dq/quarantine/[id]` 同法）。

### 6.3 物化 cron `GET|POST /api/cron/company-digest`

`CRON_SECRET` Bearer（`authorizedCronRequest`）；`maxDuration = 300`；`deadline = start + 240 s`。核心 `src/lib/company/digest.ts::runCompanyDigest(deps, {mode: 'incremental' | 'full', issuerIds?, limit})`：

1. `startBatch({producer: 'company-digest', dataset: 'company.events', toolVersions: {events: EVENTS_VERSION, mappingGen, formulaVersion}, codeVersion})`（`code_version` 规则同规格二 §6.1：取不到则拒绝 apply）。
2. 选发行人：incremental = `fact_sync_scope.last_success_at > scope_watermark` 的发行人（按 `last_success_at` 升序，`limit` 缺省 200）；full = `fact_sync_scope` 全部（脚本用）。剩余预算 < 30 s 不再开始新发行人，回执 `deadline_hit`（信息码）。
3. 对每个发行人：`getFactsAsOf(issuer, {全部概念, asOf: 今天, history: true})` + `filingsOfIssuer` → 纯函数 `deriveIssuerEvents(facts, filings, {today})`（§7.2）与 `summarizeCoverage(facts, filings, scope, freshness)` → `replace_issuer_events`、`replace_issuer_coverage`。任一失败 → 该发行人 `failed`，旧事件与覆盖行不变。
4. 结束：`finishBatch`；`recordAttempt('company.events', {ok: 发行人全部成功或空转, cadence: 'daily'})`；成功时 `scope_watermark` 推进到本批处理的最大 `last_success_at`（部分失败时不推进，失败发行人下次重试；连续失败由 `/admin/dq` 看到）。
5. `vercel.json`：`/api/cron/company-digest` 每小时第 20 分（`20 * * * *`），与 `facts-sync?market=US`（`5 */4 * * *`）错开。全量：`scripts/company/digest.ts --full [--issuer …] [--apply]`，每次映射代或 `EVENTS_VERSION` 变更后由 owner 运行一次。
6. 规格二 §7.3 处理钩子接受隔离项后调用的 `materialize(issuer)`：请求规格二在其后调用 `rebuildIssuerDigest(issuer)`（§10.1 待对齐）；对齐前由每周全量兜底（`full_sweep_at` 超过 7 天则 incremental 运行末尾顺带全量一轮，受预算约束分多次完成）。

---

## 7. 事件推导与跟踪语义

### 7.1 `EVENTS_VERSION = 'company-events/1'`

进入 `issuer_events.payload` 的推导规则改动 +1；不同版本的事件集合可能不同，全量重建后旧事件按 §4.1 删除。

### 7.2 `deriveIssuerEvents(facts, filings, {today})`（纯函数，`src/lib/company/events.ts`）

输入：该发行人全部当前代、`status='ok'`、`available_date ≤ today` 的事实（含 `history`：每个自然键 K 的披露序列）与全部 filings。输出事件数组（确定性顺序：`occurred_on`, `kind`, `natural_key`）。

- `filing_published`：每个 filing 一条；`factCount` = 该 filing 当前代事实数（0 也产生事件，例如 companyfacts 中只有 DEI 的 filing）。
- `period_first_seen`：对 `(duration, period_end)` 分组（`INSTANT` 以 `period_end` 分组），取组内各 K 序列第一条披露的最小 `available_date` 作为 `occurred_on`；`filingId` = 给出该日期的 filing（并列取 `fact_id` 最小者）；`headline` 取组内三个概念的当前值。
- `fact_revised`：对每个 K 的披露序列，相邻两条值不同即一条事件（`from` = 前一条，`to` = 后一条）。同日同值重复不产生事件（规格二 §5.2 说明）。
- 事件 `occurred_on` 永远是可得日期，不是入库时间；迟到文件产生的事件 `occurred_on` 可能早于已有事件，但 `first_seen_at` 是新的，收件箱据此算未读。

### 7.3 跟踪收件箱的合并顺序

`issuer_events` 按 `first_seen_at` 降序；F4 事件（§10.4）按其 `registered_at`/`settled_at` 合并；同一发行人同日多条事件折叠为一组（"2025-10-25 · 新文件 10-Q · 新财期 2025-09-30 · 修订 2 项"），展开后逐条。静音的跟踪不进收件箱但仍可在公司页看到。

---

## 8. 覆盖目录 `/intel/companies`

- 入口：`/intel` 现有"研究"页签增加"公司覆盖"卡与链接；`TabBar` 的 `intel` 以 `startsWith` 高亮，不加底栏项。
- 表格列：名称（链接公司页）· 代码（主证券 + 其余芯片）· 市场 · 最近财期 · 最近文件日 · 概念覆盖（`concepts_covered / FACT_CONCEPTS.length`）· 引用（`linked/pending/edgar` 计数）· 新鲜度徽标（`fresh` 中性、`stale` `--warn`、`error`/`missing` `--danger`）。
- 筛选：市场、新鲜度、名称/代码前缀；排序三种；分页 100。行业筛选位预留（禁用态，title"行业成分待行业研究规格加载"）。
- 空状态："事实库尚无发布事实"；admin 看到 `/admin/dq`。
- 不显示评级/胜率/目标价列；F4 落地后可加"已登记判断数"列（F4 契约 §10.4 的 `countByIssuer`）。

---

## 9. 旧读者迁移与 `/api/financials` 退役

### 9.1 `src/lib/dcf/assemble.ts` 与 `/api/dcf/[ticker]`

- 新纯函数 `src/lib/company/dcf-seed.ts::seedFromFacts(packet: FactsSeedPacket): {seed: Partial<DcfAssumptions>, sources: {field, factIds[], metric?}[], missing: string[]}`，输入是路由从事实库组装的包：`{currency, latestAnnual: {revenue, gross_margin, operating_cash_flow, capex|capex_incl_intangibles}, instant: {shares_outstanding, cash, borrowings_total}}`（各带 `factId/unit/periodEnd`）。映射：`revenueLines[0].baseRevenue` = 最近 `12M` revenue（按 `currencyUnit` 换算到亿或百万，换算系数写入 `sources`）；`grossMarginPct` = `gross_margin`（ratio）；`sharesDiluted` = `shares_outstanding`（事实库只有在外股数；字段名保留但 `sources` 标注 `basis: 'shares_outstanding'`）；`netDebt` = `borrowings_total − cash`（同货币；缺一则不填）；`currency` 按事实单位（`USD`/`CNY`）。缺输入 → 留给默认值并在 `missing` 列出。
- `/api/dcf/[ticker]` 不再自调 `/api/financials`：直接调 `getFactsAsOf` + `metricsOfIssuer`（无 `asOf`）组包；响应新增 `seed: {sources, missing}`；`warnings` 中"暂无财报数据，DCF 基于默认假设。"只在包为空时出现。美股、A 股都能种子；港股为空。
- `DcfStudio` 显示 `seed.sources` 摘要。

### 9.2 `src/lib/agent/tools.ts` 的 `financials` 工具

- 去掉 `aShareOnly`；描述改为"最近 5 个财年 + 最近 4 个财期的披露事实与派生指标，每个值带 fact id 与可得日期；A/US；港股暂无"；handler 调 `GET /api/companies/<ticker>/statements?statement=IS&basis=annual&periods=5` 与 `/api/facts/<ticker>/metrics?metrics=gross_margin,net_margin,roe,fcf,revenue_yoy,net_income_yoy`，返回紧凑包 `{issuer, asOf, annual: [...], metrics: [...], provenance: {mappingGen, formulaVersion}}`（JSON ≤ 32 KB，超出裁期数）。
- 五个 method 文件（`industry-chain.ts`、`hiphon-pm-deepdive.ts`、`company-diligence.ts`、`john-cameron-5step.ts`、`bottleneck-picker.ts`）中"A 股专属数据（financials/flows…）"的措辞改为"financials 覆盖 A/US，港股暂无；flows/holders/calendar 仅 A 股"。

### 9.3 `useFinancials`

`src/lib/hooks/useQuote.ts` 中的 `YearlyFinancial`、`FinancialState`、`useFinancials` 删除（零消费者）。

### 9.4 `/api/consensus/[ticker]`

只删注释中对 `/api/financials` 的引用；路由本身的去留在决策 D。

### 9.5 `/api/financials/[ticker]` 退役

规格二已加 `Deprecation` 与 `Link: successor-version`。本规格 C2 完成后该路由零内部调用；决策 B 选"删除"则 C2 同一提交删除路由文件与 `tushare-cached.ts` 中仅它使用的导出（`fetchTushareIncome/Balance/Cashflow` 还被 `perspectives` 路由使用，保留；`fetchTushareFinaIndicator` 被 quote/radar/composer 使用，保留）。

---

## 10. 依赖接口（待对齐）

### 10.1 规格二（实施中）

需要规格二补充或确认的四点，写入规格二 §16 偏差记录或 F2-6 任务：

1. `derive.ts` 导出 `METRIC_CATALOG: {metric, formula: {zh, en}, inputs: concept[], basisByMarket}`，供公式抽屉与指标行头；本规格不自行复述公式。
2. `GET /api/facts/[ticker]` 的 `filings[]` 增加 `batchId` 与 `codeVersion`（来自 `ingest_batches.code_version`），供披露历史抽屉"代码版本"列；或提供 `GET /api/filings/[ticker]` 的同样字段。
3. 隔离接受钩子 `materialize(issuer)` 之后调用 `rebuildIssuerDigest(issuer)`（本规格导出）；对齐前靠每周全量兜底。
4. 确认 anon `FactsDb` 子集暴露 `factsOfIssuer(…, {history})` 与 `filingsOfIssuer`，供 `statements` 组合路由在服务端直接调用而不经 HTTP。

### 10.2 规格三（标识符与对账）

- 历史 ticker 归属：对齐后页头在 `asOf` 存在时可显示"该日归属"；对齐前页头固定今天归属并在回放条注明。
- `dq_reconciliations` 通过的发行人/财期：对齐后文件视图与单元格加"已对账"徽标；接口需求 `GET /api/facts/[ticker]/reconciliations`（公共，只含 passed 布尔与对账日）。

### 10.3 F3 文档管道

- `GET /api/documents/by-filing/[filingId]` → `{documentId, status: 'available' | 'pending' | 'restricted', pages, permission}`；`restricted` 时本页只显示元数据与外链。
- 源抽屉组件契约：`<SourceDrawer documentId page? bbox? />`，由 F3 提供；本页传 `filingId` 换 `documentId`。
- 港股 filings 与事实：F3 交付后 `filings.market` 增 `HK`，本页港股缺失状态自动消失（页面按 `issuer_coverage.markets` 判定）。
- 业绩说明会纪要进入文件视图"纪要与其他"分组：需要 `source_type`、`available_at`、引用跨度。

### 10.4 F4 判断层框架（显示契约）

本页只消费，不登记。请求 F4 提供：

```ts
interface JudgmentCard {
  judgmentId: string;              // 内容寻址或 uuid
  kind: 'thesis_checkpoint' | 'forecast' | 'recommendation' | 'rating';
  issuerId: string;
  claim: { zh: string; en: string };
  falsifiableCondition: { zh: string; en: string } | null;   // 为 null 时本页标"不可证伪（不显示概率）"
  methodologyVersion: string;
  inputSnapshotId: string;         // 可回放的输入快照
  registeredAt: string;            // ISO
  settlesAt: string | null;
  status: 'open' | 'settled' | 'void';
  outcome?: { hit: boolean | null; settledAt: string; settleInputs: { factIds: string[] } };
  probability?: { p: number; calibration: { n: number; brier: number; methodologyVersion: string } | null };
  visibility: 'private' | 'shared';
}
```

显示规则（本页承诺）：`probability.calibration === null` → 显示"研究员信心（未校准）"文字与 `p` 的定性档位，不显示百分比；`calibration` 存在 → 显示百分比并并列 `n` 与 Brier。`visibility='private'` 的卡只对作者可见（F4 负责 RLS，本页按会话读）。接口：`GET /api/judgments?issuerId=&asOf=`（按用户会话）、`GET /api/judgments/count?issuerIds=`（目录页列）。F4 未落地前"判断"视图显示：空状态文案 + 若决策 A 选"分析师建议"，列出 `GET /api/analyst/recommendations?ticker=<发行人全部 ticker>` 的本人建议，`confidence` 显示为"信心 n/100（前向评分：hit/score/bucket）"，不称胜率。

### 10.5 行业研究规格

`issuer_industry_memberships` 加载后：目录页行业筛选启用；公司页页头增加行业芯片（`scheme/version` 标注）；同业表另立。

---

## 11. 错误处理

| 情形 | 行为 | 码 / 状态 |
|---|---|---|
| ticker 不合法 | 400 | `invalid_parameter:ticker` |
| 发行人不存在 | 404 | `unknown_ticker` |
| `asOf` 非日期或晚于今天 | 400 | `invalid_parameter:asOf` |
| `statement`/`basis`/`periods` 非枚举 | 400 | `invalid_parameter:<name>` |
| 规格二 `FactsDb` 抛错 | 500，`no-store`，日志不含值 | `internal` |
| 单概念 1000 行上限触及 | 响应头 `X-Facts-Truncated: <concept>`，网格该行末列加"…" | 200 |
| 跟踪上限 | 409 | `watch_limit` |
| 未登录访问跟踪路由 | 401 | `not_authenticated` |
| 导入时无服务端自选 | 409 | `no_server_watchlist` |
| 导入解析失败的 ticker | 200，列在 `unresolved` | — |
| digest 某发行人失败 | 该发行人 `failed`，旧行不变，批次 `partial`，水位不推进 | `digest_issuer_failed` |
| digest 截止 | 不再开始新发行人 | `deadline_hit`（信息） |
| digest `code_version` 取不到 | 拒绝 apply | `code_version_missing` |
| `replace_*` 函数被非 service_role 调用 | 数据库拒绝（集成测试断言） | 42501 |
| cron secret 缺失/错误 | 503 / 401 | — |
| 页面 fetch 失败 | 视图级错误卡 + 重试；页头仍显示发行人 | — |

---

## 12. 测试策略

### 12.1 单元（vitest）

- `src/lib/company/events.test.ts`：用规格二夹具（`fixtures/edgar/CIK0000320193.trimmed.json` 经 `parseCompanyFacts` + `memoryFactsDb` 读出的 facts/filings）：三种事件数量与 `natural_key` 确定性；同日同值无事件；迟到修订 → 一条 `fact_revised`；`headline` 缺概念不出键；排序确定；两次运行输出逐字节相同。属性测试（种子随机 200 次）：对任意披露序列，`fact_revised` 数 = 相邻值变化数。
- `src/lib/company/coverage.test.ts`：`summarizeCoverage` 的计数、双市场 `freshness_dataset` 选择、`citation_summary`。
- `src/lib/company/statements-grid.test.ts`：`basis` 三种口径、单位主列选择与 `U` 徽标、`periods` 裁剪、徽标 `R/n/!`、`asOf` 早于首文件为空。
- `src/lib/company/dcf-seed.test.ts`：全量种子、缺项、币种、换算系数记录；旧 `seedFromFinancials` 删除。
- `src/lib/company/inbox.test.ts`：未读计数、折叠、静音、F4 事件占位合并。
- `src/lib/company/digest.test.ts`（`memoryFactsDb` + memory `TableClient`）：水位推进/不推进、截止、`code_version` 缺失拒绝、单发行人失败不影响其他。
- 路由测试（录制夹具，不打网络）：`statements`、`events`、`companies`、`overview` 的参数校验、缓存头、404/400；`tracking/*` 的 401、上限 409、导入结果；`cron/company-digest` 鉴权；`dcf` 响应含 `seed.sources`；`agent/tools` 的 `financials` 包大小上限。
- i18n：`src/i18n/messages-parity.test.ts` 的 `Domain` 加 `company`、`tracking`。

### 12.2 数据库（`test:db`，critical）

`src/lib/company/company-research.integration.test.ts`（含 `S4_TEST_STATE`，加入 `criticalSuites`）：迁移可重放两遍（含 `financial_history` 已删时再跑）；`issuer_events` 唯一约束与外键；`replace_issuer_events` 保留 `first_seen_at`、删除不在本批的行、并发两批次串行；`replace_issuer_coverage` upsert；真实角色：anon 读 `issuer_events`/`issuer_coverage` 可、读 `company_watches` 拒、执行函数拒；用户 A/B 的 `company_watches` 互不可见；`company_digest_state` anon/authenticated 拒。

### 12.3 端到端（Playwright，`e2e/company.spec.ts`，需登录夹具账号与已回放的美股夹具数据）

1. `/stock/AAPL`：页头显示 `names.en`、证券芯片、CIK；"数据状态"芯片存在。
2. `?view=statements`：IS 网格出现 revenue 行与 ≥ 8 列；点击一格打开披露历史抽屉，含"可得日期"与 EDGAR 链接。
3. `?view=statements&asOf=2024-06-30`：回放条出现；同一格 `disclosureSeq=1`。
4. `?view=metrics`：gross_margin 行；点击打开公式抽屉含 `formulaVersion`。
5. `?view=filings`：至少一条 `10-K`，引用徽标 `edgar`。
6. `/stock/00700.HK`：三个事实视图显示 F3 缺失文案。
7. 跟踪：点击"跟踪"后 `/watchlist/tracking` 列出该公司；"标记已读"后未读归零；移除后消失。
8. `/intel/companies`：表格含 AAPL 行；筛选 `market=US` 仍含；`q=AAP` 命中。
9. `/stock/ZZZZ`：未知状态。
10. 中英切换：公司页页签与抽屉标签随语言变化（`/en/...` 前缀策略）。

### 12.4 清单规则

含 `S4_TEST_STATE` 的新文件进 `criticalSuites`；`verifyCriticalSuiteInventory` 无漂移；全部门禁绿才算完成。

---

## 13. 分期

| 工作包 | 交付 | 退出条件 | 人日 |
|---|---|---|---|
| C0 迁移与物化 | 迁移（四表、两函数、权限、`financial_history` 删除）、锁文件、types、`events.ts`/`coverage.ts`/`digest.ts`、cron 路由、脚本、`vercel.json`、集成测试 | `test:db`、`test:migrations` 绿；对美股夹具两遍物化一致 | 2.5 |
| C1 公司页 | 服务端 `page.tsx`、页头、回放条、报表/指标/文件/概览视图、两个抽屉、`statements`/`overview`/`events` 路由、`company.json` zh/en、mock 财务/研报/新闻不再渲染 | §1.1 前三条退出条件；e2e 1–6、9、10 | 4 |
| C2 读者迁移 | `dcf-seed.ts`、`/api/dcf` 改造、`financials` 工具、method 措辞、删 `useFinancials`、决策 B 的退役提交 | `/api/dcf/AAPL` 有事实种子；`grep '/api/financials'` 仅剩规格二的弃用路由（或已删） | 1.5 |
| C3 跟踪 | `company_watches` 路由、`/watchlist/tracking` 页、公司页跟踪视图、导入、`tracking.json` | e2e 7；RLS 集成测试 | 2.5 |
| C4 目录 | `/api/companies`、`/intel/companies` 页、`/intel` 入口卡 | e2e 8 | 1 |
| C5 判断区 | 按 §10.4 契约接 F4（F4 落地后）；之前只做空状态与决策 A 的建议列表 | 契约测试（录制 F4 响应夹具） | 1 |
| C6 收尾 | 运行手册 `docs/runbooks/company-research.md`、对方回归对照样本、§17 偏差记录、Codex 复审 | 全量门禁绿 | 1 |

顺序：C0 在规格二 F2-6 之后开始（需要 `read.ts`/`derive.ts`/anon `FactsDb`）；C1–C4 可并行于 C0 之后；C5 等 F4。合计约 13.5 人日，不含 F4/F3 等待。

验收样例：
1. AAPL 报表回放（§1.1 第一条）。
2. 600519.SH 文件视图 `citation` 徽标；`pending` 的年报在单元格显示 `!`。
3. 对 AAPL 注入修订夹具后跑 digest：收件箱出现一条"修订"事件，`first_seen_at` 为本次运行时间，`occurred_on` 为修订文件的可得日期。
4. 用户 B 调 `GET /api/tracking/watches` 不含 A 的行；anon 调 `replace_issuer_events` 被拒。
5. 断网跑 digest：批次 `failed`，`issuer_events` 不变，水位不推进。
6. `/api/dcf/600519.SH` 的 `seed.sources` 含 `revenue_operating` 不含 `revenue`（CN 毛利率口径按规格二 §8），`netDebt` 用 `cn_incl_bonds` basis 的 `borrowings_total`。

---

## 14. 独立验证

- Codex（gpt-6-astra，medium）：本规格两轮审计与处置（`docs/audits/2026-11-04-company-research/`）；每个工作包提交再审。
- 回放一致性：对规格二黄金断言的 6 家 × 2 期 × 6 科目，公司页网格值与断言逐格一致（e2e 断言或路由测试）。
- 事件黄金集：AAPL 最近 10 份 filing 的 `filing_published` 与 EDGAR 公司页 filing index 人工逐条核对（可得日期、form、accession）；记入 `docs/audits/2026-11-04-company-research/events-gold.md`。
- 对方回归对照：§3.2。
- 专家抽样：一位有财务背景的人看 3 家公司（AAPL、600519.SH、000333.SZ）的报表视图，核对概念名、口径备注、单位显示是否会误导（尤其"营业总收入/营业收入"、"capex 含无形"、"股利含利息"三处），记录在同目录 `expert-sampling.md`。
- 无障碍：网格与抽屉键盘可达（Tab 到单元格、Enter 开抽屉、Esc 关），由 e2e 断言焦点顺序。

---

## 15. 环境与 owner 事项

| 事项 | 谁 | 何时 | 默认 |
|---|---|---|---|
| **决策 A**：首批显示哪些判断。候选一：分析师层本人 `recommendations`（已有前向评分与校准桶）；候选二：Research OS `research_theses`（admin 私有，有失效条件）；候选三：等 F4 的预测登记 | owner | C5 前 | 候选一（F4 落地前作为过渡，且按 §10.4 不称胜率） |
| **决策 B**：`/api/financials/[ticker]` 在 C2 后立即删除，还是保留一个发布周期（只带弃用头） | owner | C2 前 | 保留一个发布周期后删除 |
| **决策 C**：`financial_history` 删除（本规格默认）还是保留空表 | owner | C0 前 | 删除 |
| **决策 D**：`/api/consensus/[ticker]` 的 mock 回退（`getStockOrStub().broker_reports`）与 Tushare `report_rc` 中位数是否继续存在；公司页 `news` 页签退役 | owner | C1 前 | 公司页不渲染；路由保留给 Copilot 直到授权来源确定 |
| **决策 E**："AI 观点"页签改名"模型观点（未校准）"并去掉"共识 x.x"数字 | owner | C1 前 | 改名并去数字 |
| **决策 F**：`MAX_COMPANY_WATCHES = 200` 是否按 plan 分层 | owner | C3 前 | 不分层 |
| **决策 G**：跟踪视图"预计披露日"是否使用 Tushare `disclosure_date`（交易所预约披露时间表的适配）并标注来源 | owner | C3 前 | 使用并标注 |
| **决策 H**：目录页是否对非登录用户开放（当前 `(app)` 组需登录；API 已是公共） | owner | C4 前 | 需登录（不改中间件） |
| 规格二决策 C（A 股事实在巨潮核对前是否公共可见）影响本页 `pending` 徽标的出现频率 | owner | 规格二 | 可见并带 `citation` |
| 生产执行迁移；首轮 `scripts/company/digest.ts --full --apply` | owner | 合并后 | — |
| e2e 夹具账号（登录态）与回放数据库 | owner | C1 前 | 现有 `e2e/authed.spec.ts` 机制 |

---

## 16. 开放问题（实施前核对）

1. 规格二 §10.1 四点的落地形状（`METRIC_CATALOG`、filings 的 `codeVersion`、处理钩子回调、anon `FactsDb` 子集）。
2. 同一发行人同时有 `facts.us` 与 `facts.cn` 的真实案例是否存在于首轮范围（影响 `issuer_coverage.markets` 的双值路径测试是否只能用合成夹具）。
3. `period_first_seen` 的 `headline` 对 companyfacts 中只有 `dei` 的 filing 为空，是否值得产生事件（当前产生，`conceptCount=0`）。
4. `statements` 路由每概念一次请求的延迟（IS 14 概念）在 hnd1 区域对 Supabase 的实测；超过 1.5 s 则改为规格二提供按报表的批量读取。
5. 回放条对历史 `asOf` 的缓存（`s-maxage=3600`）与隔离接受导致的历史答案变化：是否需要 `/api/cache/revalidate` 的路径级失效。
6. 现有 e2e 登录夹具是否能在 CI 里对回放数据库运行（否则 e2e 列表降为本机手动清单）。

---

## 17. 实施记录与偏差

（落地后补记，格式同规格一 §14。）
