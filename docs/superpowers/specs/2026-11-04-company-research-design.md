# 公司研究与跟踪模块 设计规格

日期：2026-11-06（第 6 稿；第 5 稿 2026-11-04。审计轨迹：`docs/audits/2026-11-04-company-research/` —— 01 Codex 第一轮、02 Codex 第二轮、03 处置表（含第三、四轮各一节）、04 Codex 第三轮、05 Codex 第四轮、06 Codex 第五轮）
状态：第 6 稿按 Codex 第五轮 #61–#72 修订（§0 为规范性修订，与正文冲突处以 §0 为准）；§15 owner 决策按默认值实施；C0 退出条件改为 §0.1 适配器及契约测试通过（不再要求规格二书面接受）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一：`issuers`、`issuer_securities`、`resolveIssuer`、DQ 设施；§14 的实施偏差视为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二，**第 8 稿**：`fact_sync_runs`、`filings`、`financial_facts`、`financial_metrics`、`fact_sync_scope.state_rev`、`read_facts` 信封 `{state_rev, rows, truncated}`、`fact_state_rev()`、`FactsDb.readFacts/factsByIds/filingsOfIssuer/metricsOfIssuer`、`/api/facts/[ticker]`、`/api/facts/[ticker]/metrics`、`/api/filings/[ticker]`、`citation` 状态、`asOf` 回放、**两个市场两路事实各自独立**）。本规格是规格二读接口的首个消费者，并接手规格二 §1.2/§15.6 留给公司研究规格的两件事：`/api/financials/[ticker]` 读者的迁移、`financial_history` 表的去留。规格二若再改稿，本规格 §10.1 的对齐清单以其最新稿为准。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5（owner 2026-11-04 确认）。逐条对照：本模块的事实视图只展示规格二从一手来源建立的事实，每个数字可打开披露历史抽屉看到源文件、定位、可得日期、全部变换（映射、单位归一、派生、显示缩放）与代码版本；事实区与判断区分开，判断的登记、结算、校准由判断层框架（F4）承担，本页按 F4 显示契约渲染，**没有结算机制的概率不以百分比出现**；缺失保持缺失（港股事实未入库就显示"待文档管道"，不拿第三方指标顶替；行情源算出的 PE/PB/ROE 不进本页）；外资研报不在本模块；UI 遵守 `DESIGN.md` 与 `globals.css` tokens，zh/en 双语，所有图表有表格等价视图（含保留的 K 线图）。
对方站点（`chaosaiagent.com/company`、`/monitor`）只作功能参考与回归对照，其数据、评级、胜率一律不导入（§3）。

## 0. 第 6 稿修订（Codex 第五轮，2026-11-06；规范性，与正文冲突时以本节为准）

审计：`docs/audits/2026-11-04-company-research/06-codex-round5.md`（#61–#72）；处置见 `03-disposition.md` 第五轮一节。背景：规格二已在 `main` 落地（迁移 `20261106090000_financial_facts.sql`、`src/lib/facts/*`、`/api/facts/*`、`/api/filings/*`）。**本模块以已落地 facts 代码为只读契约**：不修改 `src/lib/facts/*`、`src/app/api/facts/*`、`src/app/api/filings/*` 及规格二的 SQL 函数；§10.1 中未落地的请求由本模块在 `src/lib/company/*`、`/api/companies/*` 与自有迁移中以适配器实现，并在 PR 中列为对规格二的接口请求。C0 的退出条件改为：下表 A 的适配器及其契约测试通过（#61），不要求规格二书面接受或修改其代码。

### 0.1 规格二落地状态与本模块适配器（A 表）

| §10.1 项 | 落地状态 | 本模块适配器（规范） |
|---|---|---|
| 1 `METRIC_CATALOG` 与规范派生 | 部分：`deriveMetrics(rows, {market, asOf, basedOnRev})`、`FORMULA_VERSION`、`Q_SINGLE_CONCEPTS`、`metricNames` 已导出；无公式文本 | `src/lib/company/metric-catalog.ts`：按 `FORMULA_VERSION` 键控的 zh/en 公式文本、`inputs`、`basisByMarket`；单测断言其 metric 集合 = `metricNames('US') ∪ metricNames('CN')`（版本不匹配时测试失败）。派生只在**完整、未截断、`history:true`** 的信封上调用 `deriveMetrics(env.rows, {market, asOf, basedOnRev: env.stateRev})` |
| 2 证据 DTO | 部分：`read_facts` 行含 `run_id`；`fact_sync_runs.batch_id → ingest_batches.code_version/tool_versions` 可联；无 `fact_evidence`；快照与 `.meta.json` 只在 Storage；`raw_hash = sha256(snapshotSha + "\n" + hashLocator)`，不是快照 SHA | **证据索引** `company_fact_evidence`（本模块迁移，仅 service_role 可读；写只经 `replace_company_fact_evidence` 函数）：`fact_id`（pk，引用 `financial_facts`）、`raw_hash`、`snapshot_sha256`、`snapshot_path`、`hash_locator`（解析器原样定位串）、`json_pointer`（EDGAR `/facts/<tax>/<tag>/units/<unit>/<idx>`；Tushare `/data/items/<row>` + `field`）、`source`、`api`/`url`、`params`（无 token）、`captured_at`（sidecar 首写时间，标注为"快照首次抓取时间"，不是本次运行时间）、`http_status`、`page`、`index_version`、`verified_at`。构建器 `src/lib/company/evidence-index.ts`（service 作业，digest 每流先跑）：列出 `{source}/{issuer_id}/*.json` 快照 → 下载并核对字节 SHA-256 → 用**已落地解析器**（只读 import `src/lib/facts/providers/*`）重新解析 → 对每个候选算 `rawHashOf(sha, locator)` → 与事实行按 `(raw_hash, concept, source_concept, filing source_ref, period_start, period_end, unit, canonical value)` **全部相等**匹配（Tushare 同一行多个概念共享 raw_hash，单靠哈希不足）。对象或 sidecar 缺失、哈希不符、解析器漂移、零个或多个匹配、值不等 → 不写索引行（该事实 `evidence_incomplete`），从不猜测关联。读：`company_fact_evidence(p_fact_ids uuid[]) → jsonb`（`security definer`、`stable`、`set search_path=''`，授予 anon/authenticated/service_role；≤100 id；只返回 `status='ok'`、所属运行 `published`、`mapping_gen` 为当前代的事实；输出字段白名单，联 `fact_sync_runs → ingest_batches` 取 `code_version/tool_versions`，不返回批次其他字段） |
| 2' CN 逐值 PDF 定位 | 未落地（规格三巨潮逐值核对） | `PdfLocatorSource` 接口（`src/lib/company/pdf-locator.ts`），缺省实现返回空；规格三落地后注入。无定位 → CN 公共端点 `withheld`（`citation_pending`） |
| 2'' 稳定下载 | 未落地 | `GET /api/companies/snapshot?fact=<factId>`（取代 `/api/companies/snapshot?fact=`，#62）：按 fact id 查证据索引得准确 Storage 路径；`source='edgar'` 才现铸 60 s 签名 URL 并 `302` + `no-store`；Tushare → 403 `not_redistributable`；无索引行 → 404。管理：`GET /api/admin/companies/snapshot?fact=` 任意来源，`requireAdminUser()`、`private, no-store`、审计日志 |
| 3 同快照 filings | 未落地：`read_facts` 无 `p_include_filings`；`computed_at` 存在于表但 `metricFromTable` 与 `/metrics` DTO 未暴露 | `company_read_snapshot(p_issuer, p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit) → jsonb`：`language sql stable security invoker`，**一条 SELECT** 返回 `{facts: public.read_facts(...), filings: [...]}`；filings 子查询显式过滤 `issuer_id/market`、`mapping_gen > 0`、`available_date <= p_as_of`，`factCount` 在同一语句内按 `status='ok' and f.mapping_gen = g.mapping_gen and f.available_date <= p_as_of` 计数（service_role 的 RLS 也能看到 staged 行，所以必须显式过滤）；只投影 DTO 所需列。指标 `computedAt`：物化读由本模块直接 select `financial_metrics.computed_at`（anon 已有 select）；实时派生的 `computedAt` 为本次计算时刻，二者在 DTO 中以 `computedAtKind: 'materialized' \| 'live'` 区分 |
| 4 anon `FactsDb` 子集 | 已落地（`publicClients()`） | 本模块用 `Pick<FactsDb, 'readFacts' \| 'factsByIds' \| 'filingsOfIssuer' \| 'metricsOfIssuer'>` 门面；快照一致性读一律走 `company_read_snapshot`，不以分表读取替代 |
| 5 `state_rev` 与行锁 | 已落地（发布、提升、裁决都 `for update` 并 +1） | 本模块写函数由迁移角色拥有，`security definer` 内 `for update` 同一 `fact_sync_scope` 行；迁移测试断言函数 owner 与 `execute` 授权 |
| 6 `INFO_CODES.deadline_hit` | 已落地（`src/lib/dq/batches.ts`） | 直接写入 `errors`，删除 `detail.deadlineHit` 降级 |
| 7 `financial_history` | 交本规格 | 本次保留（决策 C 默认），不动表与类型 |

### 0.2 逐条修订（#62–#72）

- **#62 证据 DTO 形状**：`EvidenceDto = {factId, rawHash, snapshot: {source, sha256, path, api|url, params, capturedAt, httpStatus, page, download: '/api/companies/snapshot?fact=<factId>' | null}, locator: {hashLocator, jsonPointer, field?, pdf?: {page, table, row, column, documentUrl}}, run: {runId, codeVersion, toolVersions}, mappingVersion, unitRule, sourceDocument: {kind: 'edgar_index' | 'cninfo_pdf', url} | null}`。读者回放顺序：下载字节 SHA-256 = `snapshot.sha256` → `sha256(snapshot.sha256 + '\n' + locator.hashLocator)` = `rawHash` → 按 `jsonPointer` 取值、重放映射与单位变换 = 事实 `value_text`。`rawHash` 永远不当作对象 SHA。
- **#63 `evidenceEligible(dto, fact, filing, market, {admin})`**：合格当且仅当证据索引行存在且已验证、`codeVersion` 非空、`toolVersions` 与 `mappingVersion` 存在；US 另须 `snapshot.sha256`、`hashLocator`、`jsonPointer`、`download` 非空、`sourceDocument.kind='edgar_index'`；CN 另须 `citationOf(filing) = 'linked'` **且** `filing.document_url` 为非空 https URL，**且** `locator.pdf` 存在并绑定该 fact 与该 `documentUrl`。admin 变体只豁免 CN 的 PDF 条件（`citation`/`documentUrl`/`locator.pdf`），不豁免基础证据完整性。原因码：基础证据缺失 → `evidence_incomplete`；仅 CN PDF 条件缺失 → `citation_pending`。
- **#64 事件存储不公开**：`issuer_events` 只授 `select` 给 service_role（anon/authenticated 无授权）；公共与按用户路由在服务端用 service_role 读取后经 `evidenceEligible` 组装。`issuer_coverage` 只含计数与日期、无财务数值，保持公共读。收件箱：会话客户端读 `company_watches`/`company_event_reads`（RLS），service_role 客户端读这些发行人的事件（`issuer_id = any(用户 watch 的发行人)`）。数据库测试用真实 anon/authenticated 断言不能直接读 `issuer_events`、`company_fact_evidence`、`company_digest_state`。
- **#65 CN 净债务**：US `netDebt = borrowings_total − cash`（`basis: us_standard`）；CN `netDebt = borrowings_total − monetary_funds`，`basis: 'cn_borrowings_less_monetary_funds_incl_restricted'`，UI 标注"借款合计减货币资金（含受限资金）；不是现金及现金等价物"。仍要求同日期、同单位、全部输入证据合格；否则 `missing` 并要求用户确认。公共（非 admin）请求下 CN 事实在 PDF 定位登记前一律不合格，因此 `/api/dcf/600519.SH` 在当前数据下为 `status='unavailable'`；验收用两份夹具：注入了 PDF 定位的 CN 夹具（种子为 `fact`）与无定位夹具（不产生 `fact` 种子）。
- **#66 单季口径**：单季/TTM 概念与 metric 名直接取 `Q_SINGLE_CONCEPTS` / `metricNames`；CN `q_single_revenue` 表示营业总收入（`revenue`），**不**改名为营业收入；CN `gross_margin` 用 `revenue_operating` 与 `cost_of_revenue`（规格二 §16.5）。概念目录用当前 35 项（含 `monetary_funds`；CN `cash` 不映射），代码一律用 `FACT_CONCEPTS.length`，不硬编码数量。
- **#67 指标代理守卫**：无 `asOf` 时：`fact_state_rev` → `metricsOfIssuer` → `fact_state_rev`，全部行 `based_on_rev` 必须等于两次读到的 rev；不一致或 `metrics_unstable` → `{metrics: [], stale: true}`（不得降级为"未产出"或返回旧值）；保留 `stale` / `truncated`；`stale` 响应 `s-maxage` ≤ 30，当前物化响应 ≤ 60（与 `/api/facts/[ticker]/metrics` 一致，复用其 `STALE_CACHE_CONTROL`/`FRESH_METRICS_CACHE_CONTROL` 常量）。有 `asOf` 时实时派生（`computedAtKind:'live'`）。
- **#68 抽屉序列**：抽屉一律读本模块 `GET /api/companies/[ticker]/facts?concept=&periodStart=&periodEnd=&unit=&asOf=`（`company_read_snapshot(history:true)` 按自然键取全序列，附 `evidence` 并过门槛）；`/api/facts?factIds=` 只用于精确事实引用，其 `disclosureSeq/isCurrent/isRevision` 可为 null，不转为 0/false，不据此推断序列或修订徽标。
- **#69 票据与市场**：一律复用 `resolvePublicIssuer`（exact-first、规范化回落、当前归属与合并重定向）；`market` 取自匹配到的证券行，不取原始输入后缀；HK 证券：页头用 `/api/entities/resolve` 身份，事实区显示 F3 空状态，不回落 US。路由测试覆盖 `600519`、`SH600519`、`600519.SS`、`BRK.A`、合并证券、`ambiguous_ticker`。
- **#70 失败幂等**：`mark_company_digest_failed` 只在 `p_attempt_id > greatest(coalesce(last_success_attempt_id,0), coalesce(last_failed_attempt_id,0))` 时推进失败状态；相同或更旧的失败返回 false，不重复增加 `consecutive_failures`、不重排退避。数据库测试加"同一失败投递两次"与"新失败 → 旧失败"。
- **#71 迁移时间戳**：本模块迁移为 `supabase/migrations/20261112090000_company_research.sql`（表、索引、触发器、授权）与 `20261112091000_company_research_functions.sql`（全部函数）；正文中的 `20261107090000` 均读作此二者。
- **#72 黄金集**：`plan2.json` 当前 `ready:false`，不作为已核实真值。本模块验收数字（AAPL revenue 回放样例、AAPL 最近 10 份 filing 的 `filing_published` 列表）记录在本模块自有夹具 `src/lib/company/fixtures/manifest.json`，期望值来源字段标明"人工抄录（EDGAR filing index / 10-K 原文页）"与抄录人；尚未抄录的条目标 `pending`，对应验收断言跳过并在 PR 列为 owner 事项，**不以实现输出补期望值**；"6 家 × 2 期 × 6 科目"矩阵只有完成后才能宣称通过。

### 0.3 本稿的其他实施约定（指挥决定，2026-11-06）

- 公共端点只读会话无关的数据：`/api/companies/*` 公共路由不读会话；管理变体统一在 `/api/admin/companies/[ticker]/{statements,overview,events,metrics,packet,facts}` 与 `/api/admin/companies/snapshot`。
- F3 源抽屉与 F4 判断卡按其规格契约渲染，分别以 `NEXT_PUBLIC_COMPANY_F3_DRAWER` 与 `NEXT_PUBLIC_COMPANY_JUDGMENTS` 开关（缺省关闭）；关闭时 F3 入口直接新窗口打开 `url`/`documentUrl`，判断视图为空状态。
- 共享文件改动（`database.types.ts`、`scripts/ci/research-checks.ts::criticalSuites`、`vercel.json`、`src/i18n/request.ts::MESSAGE_DOMAINS`、`src/i18n/messages-parity.test.ts`）放在 `// COMPANY` 注释块内，方便并行分支合并。

---

## 1. 目标与非目标

### 1.1 目标

1. **一个公司一页，一路披露一套视图。** 现有 `/stock/[ticker]` 升级为公司页：页头按规格一的发行人与证券（A/H/US 多代码、CIK/LEI/USCI）呈现身份；报表、派生指标、披露文件三个视图读规格二**按市场**的事实流（市场由 ticker 后缀决定，与规格二 §9 同规则；同一发行人有两路时显式切换，不合并）；每个数字可打开披露历史抽屉；页面级 `asOf` 回放控件按 §5.10 的矩阵作用于每个视图。
2. **跟踪是事实驱动的时间线。** 每次事实状态版本（`state_rev`）变化后，物化"公司事件"（新文件、新财期、数值修订）；用户按发行人登记跟踪；收件箱按事件首次可见时间计未读，已读以服务端快照边界确认；回放模式下事件按 `asOf` 现算，不读物化表。判断类事件来自 F4，按 §10.4 契约合并。
3. **旧读者迁到事实库，旧接口退役。** `/api/dcf/[ticker]`、`src/lib/agent/tools.ts` 的 `financials` 工具、`src/lib/dcf/assemble.ts` 改读事实与派生指标，逐字段记录假设来源（事实 / 模型 / 默认 / 用户）；`useFinancials` 无消费者，删除；`/api/consensus/[ticker]` 只有注释引用。`financial_history` 空表、零读者，带守卫删除（§15 决策 C）。
4. **覆盖目录与数据状态。** `/intel/companies` 列出事实库覆盖的全部（发行人, 市场）流及其数据状态——这是对方"231 家覆盖表"的事实版，没有评级列。

成功标准（退出条件；夹具与期望值在 `src/lib/company/fixtures/manifest.json` 固定，§12.0）：

- `GET /api/companies/AAPL/statements?statement=IS&basis=annual&asOf=2024-06-30`：period `2022-09-25:2023-09-30:12M` 的 revenue 单元格 `value` 等于规格二黄金断言 `fixtures/gold/plan2.json` 中 AAPL 该期值，`availableDate=2023-11-03`、`disclosureSeq=1`；去掉 `asOf` 后同一单元格 `disclosureSeq=2`、`isRevision=false`（规格二 §12 验收样例 1 的同一夹具）。
- `GET /api/filings/600519.SH` 每条年报 filing 在文件视图显示 `citation`（`linked` 带巨潮 PDF 链接；`pending` 显示"巨潮公告未挂接"），视图内不出现价格或评级；`pending` filing 披露的事实在非 admin 的报表响应中为 `withheld`（§5.6），admin 响应中有数值。
- `/stock/00700.HK`：页头正常；报表/指标/文件视图显示"港股披露事实待文档管道（F3）"，不显示任何代理数字。
- 对规格二美股夹具回放后的数据库运行物化两遍：第二遍 `issuer_events` 零新增、零 `retired_at`、`first_seen_at` 逐行不变；注入一份更晚修订 filing 并发布后恰好新增一条 `fact_revised`；再把该修订行隔离（`ok→quarantined`）并物化后该事件 `retired_at` 非空，重新提升后 `retired_at` 回到 null 且 `first_seen_at` 仍是首次值。
- 用户 A 登记跟踪，用户 B 的 `GET /api/tracking/watches` 不含 A 的行；anon 对 `company_watches`、`company_event_reads` 的 select 被拒；`issuer_events`、`issuer_coverage` 两张公共表没有用户列。
- （第 6 稿 §0 #65：下句只对注入了 PDF 定位的 CN 夹具成立，且 netDebt 来自 `monetary_funds`；无定位时为 `unavailable`）`/api/dcf/600519.SH`（A 股普通股，单一证券）：`provenance['revenueLines[0].baseRevenue']`、`provenance.sharesDiluted`、`provenance.netDebt` 为 `fact`，每项列出 fact ids 与换算除数，三处除数一致；`/api/dcf/<share_class='unknown' 或 'ADR' 的美股>`：股权桥字段无事实来源且用户未确认 → 响应 `status='unavailable'`，不返回估值。
- 全部门禁绿：`npm test`、`npm run test:db`（新集成套件在 `criticalSuites`）、`npm run test:migrations`、i18n 对等测试覆盖 `company`、`tracking` 两个消息域。

### 1.2 本规格之外

- 判断的登记、结算、校准、Brier、可靠性曲线、凯利仓位：F4。本规格只定义显示契约（§10.4）并在 F4 落地前显示空状态。
- 港股事实、业绩说明会纪要、公告原文页码引用、文档权限：F3。本规格定义源抽屉接口（§10.3）。
- 卖方评级与目标价：授权来源未定；不展示。`/api/consensus/[ticker]` 的 mock 回退（`getStockOrStub().broker_reports`）返回虚构目标价，本规格要求在该路由关闭 mock 分支（决策 D）。
- 行情链路的可回放性（`/api/quote` 的分层来源、`pe_ttm/pb/roe/dividend_yield` 由 Tushare `fina_indicator` 算得）：另立行情规格。总纲 §5 的"每个展示数字必须可回放"对页头价格/涨跌/成交量与 K 线同样适用，而现有行情链路只能给出来源名与更新时间；本规格不能自行豁免，因此这些市场数据在公司页的去留是 **owner 决策 J**（§15）：默认本次发布从公司页移除行情行与 K 线，待行情规格给出回放契约后恢复；owner 也可书面批准总纲例外（保留并标注来源与时间）。行情源算出的比率无论如何从公司页移除（§5.8）。
- 行业树筛选、同业对比：依赖 `issuer_industry_memberships` 加载（行业研究规格）。
- 邮件/推送提醒：`watchlist_alerts*` 三表无应用层读写者（§2）；本规格止于站内收件箱。
- LLM：本模块的事实视图、事件、目录、跟踪不调用 LLM。保留的 `DcfStudio` 仍可用用户 LLM 填充**非事实、非股权桥**的假设（§9.1：模型不覆盖事实种子；股权桥字段无事实时只能由用户确认，否则不出估值）；"AI 观点"页签不在范围，只要求改名去数字（决策 E）。
- 历史时点的 ticker 归属：页头始终显示今天的归属，回放条注明。
- 对方站点"覆盖时价格"的复现：不做（行情回放不在本规格）。
- "预计披露日"（Tushare `disclosure_date`）：交易所预约披露时间表经 Tushare 适配，现有 `/api/calendar` 不保留原始快照、无回放链，本次发布不显示（决策 G 默认"不显示"），待日历数据按规格二的快照与回执模式入库后再加。
- F4 判断事件进入收件箱：等 F4 定义带稳定 id、租户范围与观察时间的事件 DTO（§10.4）；本规格的收件箱首期只合并 `issuer_events`。

---

## 2. 现状（2026-11-04 仓库勘察）

| 领域 | 现状（文件） | 本规格如何处理 |
|---|---|---|
| 公司页 | `src/app/(app)/stock/[ticker]/page.tsx`：客户端组件；页签 overview/ai/fundamentals/news/signals/holdings；身份与财务来自 `getStockOrStub()`（`src/lib/data/mock.ts`：6 家含虚构 `broker_reports`/`news`/`financials` 的 mock，其余由 `MOCK_UNIVERSE` 造桩）与 `mergeStockDetail()`（`src/lib/stocks/detail.ts`）；行情 `useQuote`；fundamentals = `DcfStudio` + mock 三行表与柱图；news = mock `broker_reports` 或 `/api/consensus` | 页头改用 `/api/entities/resolve`；事实视图换成事实库；mock 的 `financials`、`broker_reports`、`news`、`perspectives` 不再渲染 |
| K 线 | `src/components/KlineChart.tsx`：`lightweight-charts`，hover 提示，无表格视图 | 增加表格视图（§5.8） |
| 旧财务接口 | `src/app/api/financials/[ticker]/route.ts`：仅 A 股，实时 Tushare 三表 + `fina_indicator`，输出 `{yearly[], latest_indicator}`，金额换算成亿；规格二加 `Deprecation` 头 | 读者迁移（§9），退役时点决策 B |
| 读者清单 | **活跃 HTTP 调用 2 处**：`src/app/api/dcf/[ticker]/route.ts`（经 `origin` 自调）、`src/lib/agent/tools.ts` 的 `financials` 工具（`aShareOnly`）。**载荷消费 1 处**：`src/lib/dcf/assemble.ts::seedFromFinancials` 读 `f.revenue / grossMargin / sharesDiluted / netDebt`——路由从不输出这些键，传入 `{yearly,…}` 对象时种子**静默为空**（只有传入 null 才告警）。**无消费者 1 处**：`src/lib/hooks/useQuote.ts::useFinancials`。**注释 1 处**：`src/app/api/consensus/[ticker]/route.ts` | §9 |
| DCF 引擎 | `src/lib/dcf/engine.ts`：`equity = ev − netDebt`，`perShare = equity / sharesDiluted`，无单位换算；`DEFAULT_ASSUMPTIONS.currencyUnit='亿'`；`assemble.ts` 合并顺序 defaults < seed < LLM < overrides，LLM 可覆盖种子；`DcfStudio.tsx` 挂载即 `run({})` | §9.1 重定义合并顺序与逐字段来源 |
| `financial_history` | `20260515000000_initial_schema.sql` 建表，公共只读 RLS；`database.types.ts:667` 有类型；代码唯一引用是 `src/app/api/stocks/[ticker]/route.ts` 的 TODO 注释；生产库行数**未核实** | 带守卫删除（§4.5） |
| 发行人与解析 | `issuers`、`issuer_securities`、`GET /api/entities/resolve?ticker=`（anon、UTC 日界缓存、响应 `{issuer_id, status, redirected_from?, names, identifiers, securities[]}`） | 页头数据源 |
| 事实库（规格二第 8 稿，未落地） | 两路市场独立；`read_facts(issuer, market, concepts, as_of, from, to, history, limit, include_non_ok)` 单快照 jsonb 信封 `{state_rev, rows, truncated, row_count}`，硬上限 10,000 行，`truncated=true` 时无部分结果；`fact_state_rev(issuer, market)` 对 anon 可执行；`FactsDb.readFacts/factsByIds/filingsOfIssuer(issuer, market)/metricsOfIssuer(issuer, market, formulaVersion)`；`fact_sync_scope.state_rev` 每次发布/提升/裁决 +1；`filings.mapping_gen = 0` 表示尚无已发布运行覆盖；`fact_sync_runs`、`fact_sync_scope`、`ingest_batches` 仅 service_role 可读；事实层表对 service_role 也不开放直接写 | 本规格的读取全部走 `readFacts` 信封；物化以 `state_rev` 为变更源；写只经自己的 `security definer` 函数 |
| 自选股 | `watchlists`/`watchlist_items(user_id, ticker, conviction, notes)` 按用户 RLS；客户端 localStorage 优先 + `PUT /api/watchlist/sync` 全量替换；访客模式只有本地 | 跟踪不复用自选表（§4.3），提供导入 |
| 提醒设施 | `watchlist_alerts`、`watchlist_alert_events`、`watchlist_alert_runs`（`20260904090000_watchlist_decision_sync.sql`）：应用代码无读写者（仅 `scripts/ci/migration-rehearsal.ts` 引用）；`src/app/api/cron/alerts/{quotes,ai}` 是服务检查 | 不接外送 |
| 研究跟踪（owner 私有） | `research_theses`、`research_thesis_events`、`monitor.ts`、S4 账本、S6 四臂报表；`requireResearchUser()`（admin）门控 | 交 F4 统一 |
| 分析师评分 | `recommendations(confidence 0–100, target_price, horizon)` 只追加；`recommendation_scores(forward_*, hit, score, calibration_bucket)`；`GET /api/analyst/recommendations?ticker=` 单 ticker、按用户、**无显式 Cache-Control**；表无 methodology_version、输入快照、可证伪条件 | 不作为判断层来源；决策 A |
| DQ 新鲜度 | `dq_freshness` 仅 service_role；`freshnessOf()` 读时按 `now` 重算（生产者停摆也能变 stale） | 页面只读"读时重算"的状态（§6.1 `freshness` 路由），不存冻结状态 |
| 日历 | `GET /api/calendar/[ticker]`（Tushare `disclosure_date/forecast/dividend/share_float`，仅 A 股；无原始快照、无回放链） | 本次不显示"预计披露日"（决策 G 默认），§1.2 |
| 设计与 i18n | `DESIGN.md`、`globals.css` tokens、`src/components/ui`；`src/i18n/request.ts::MESSAGE_DOMAINS` 枚举运行时消息域；`src/i18n/messages-parity.test.ts` 的循环硬编码四个域；受保护页面的 `/en/` 前缀被中间件重定向到无前缀路径，语言由 `NEXT_LOCALE` cookie 决定 | 新域注册到 `MESSAGE_DOMAINS` 与对等测试；e2e 切语言用 cookie |
| 管理与 cron | `requireAdminUser()`；`authorizedCronRequest`；`vercel.json`；`TableClient`（无 rpc / 事务 / delete / join；`selectAll` 分页不是快照） | 新 `CompanyDb` 契约（§4.7） |
| 测试门禁 | `vitest` include `src/**/*.test.ts`；`test:db` 要求含 `S4_TEST_STATE` 的文件都在 `criticalSuites`；`test:migrations` 要求新迁移晚于锁定最新（规格二占 `20261106090000`） | 新迁移 `20261112090000_company_research.sql` + `20261112091000_company_research_functions.sql`（§0 #71） |

---

## 3. 对方页面逐元素分类与本规格的对应

证据等级：`/company`、`/company/alphabet` 为 HTML 壳层 + 公开客户端资源，交互未运行；`/monitor` 公开 HTML 正文（`EVIDENCE.json`）。元素来自 `EXPERT_PLAYBOOK_AND_BRIEF.md` §2.1 与 `/monitor` 标题串。

| 对方元素 | 类别 | 本规格 |
|---|---|---|
| 覆盖公司列表（港 70 / A 129 / 美 32） | 导航 | `/intel/companies` 目录（§8） |
| 值博率星级、核心逻辑一句话、胜率、预期涨幅、下跌空间、赔率、凯利仓位 | 判断 | F4；"判断"视图按 §10.4 渲染；落地前空状态 |
| 覆盖时价格、研究日期 | 判断的输入快照 | F4 登记记录字段，本页只展示 |
| DCF 勾选 | 导航 | `DcfStudio` 保留在"估值模型"区（§5.4），逐字段来源 |
| 行业树二级筛选 | 导航 | 等行业规格；加载前目录页不显示该控件 |
| 季度上调/下调标记 | 判断变化事件 | F4 事件 |
| 财务表格与图 | 事实 | 报表/指标视图 |
| 核心跟踪指标：目标标准 / 置信度变化 / 权重 | 判断 | F4 |
| 核心跟踪指标：实际 | 事实 | 本页提供同口径值（§10.4 `settleInputs`） |
| 机构评级表 | 第三方判断（授权来源） | 不做 |
| 业绩说明会纪要 | 文档 | F3；文件视图预留分组 |
| 跟踪事件：业绩发布 / 风险事件 | 事实事件 / 判断事件 | `issuer_events` + F4 事件 |
| 基本面动态已过滤行情噪音 | 导航 | 时间线本就不含价格事件 |
| 下次跟踪节点 | 判断检查点 | F4；"预计披露日"本次不显示（决策 G 默认） |

回归对照（信息性，不是验收）：目录页上线后，对对方覆盖表中按名称可配对的公司，记录我方最近财期与对方"研究日期"所在财期，差异逐家说明（范围外 / 未同步 / 港股），记入 `docs/audits/2026-11-04-company-research/regression-sample.md`。

---

## 4. 数据模型

迁移 `supabase/migrations/20261107090000_company_research.sql`，可重放。补 `supabase/migrations.lock.json`；`database.types.ts` 手工补四个 Row 类型并删除 `FinancialHistory`。所有新表显式 `revoke all from public, anon, authenticated, service_role` 后按 §4.6 授权：**公共物化表对 service_role 也不开放直接写**，写只经 §4.6 函数（与规格二 §4 同原则）。所有 `market` 列 `check (market in ('US','CN'))`，与规格二一致；港股加入时由 F3 扩展两边枚举。

### 4.1 `issuer_events`（公共，事实事件时间线，按 (发行人, 市场) 原子重建）

```
event_id          text primary key                           -- sha256(canonical({issuer_id, market, kind, natural_key}))
issuer_id         uuid not null references issuers(issuer_id) on delete restrict
market            text not null
kind              text not null check (kind in ('filing_published','period_first_seen','fact_revised'))
natural_key       text not null
occurred_on       date not null                              -- 可得日期（§7.2）
period_end        date
concept           text
filing_id         uuid references filings(filing_id) on delete restrict
payload           jsonb not null check (jsonb_typeof(payload) = 'object')   -- 经济内容（事实 id、值、文件 id、期间），进哈希
meta              jsonb not null default '{}' check (jsonb_typeof(meta) = 'object')   -- 展示元数据（headlineAsOf 等），不进哈希
payload_hash      text not null                              -- 函数内计算：encode(sha256(canonical(payload)), 'hex')
based_on_rev      bigint not null                            -- 物化所依据的 fact_sync_scope.state_rev
first_seen_at     timestamptz not null default now()         -- 首次物化；重建与复活都保留
payload_changed_at timestamptz                               -- payload_hash 变化时更新；未变化时保留原值
retired_at        timestamptz                                -- 本轮重建不再推导得出 → 墓碑，不删行
rebuilt_at        timestamptz not null default now()
rebuild_id        uuid not null                              -- 每次 replace 调用一个 id（不是批次 id）
rebuild_batch_id  uuid not null references ingest_batches(batch_id) on delete restrict
unique (issuer_id, market, kind, natural_key)
index (issuer_id, market, occurred_on desc, event_id) where retired_at is null
index (first_seen_at desc, event_id) where retired_at is null
```

`event_id`、`payload_hash` 都由函数在服务端计算，调用方不提供。`payload` 只含公共事实与它们的 `fact_id/filing_id`，每种 kind 有固定的嵌套 schema（§4.6 函数逐键校验）。`natural_key` **不含 fact_id**（映射代升级后 fact_id 变而事件身份不变）：

| kind | natural_key | occurred_on | payload / meta |
|---|---|---|---|
| `filing_published` | `filing_id` | `filings.available_date` | payload `{formType, fiscalYear, fiscalPeriod, periodEnd, availableDate, sourceRef, factCount}`；`url/documentRef/documentUrl/citation` **不进 payload**，读时从 `filings` 联查（挂接更新不改 `state_rev`） |
| `period_first_seen` | `<period_start>:<period_end>:<duration>`（INSTANT 的 `period_start` 记为 `period_end`；`consolidation` 固定 `consolidated`） | 该期间键下当前可见事实各自然键序列第一条披露的最小 `available_date` | payload `{periodStart, periodEnd, duration, filingId（给出最小可得日期者，并列取 fact_id 最小）, conceptCount, headline: {revenue?, revenue_operating?, net_income_parent?, operating_cash_flow?: {factId, value, unit}}, ambiguousUnits: concept[]}`——headline 的某概念在该期间键下有多个单位的当前事实时不进 headline、列入 `ambiguousUnits`；meta `{headlineAsOf}`；headline 是**物化日的当前值**，不是首次披露值；回放模式不用物化表（§6.1 `events` 路由） |
| `fact_revised` | `<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<to.available_date>` | `to.available_date` | payload `{concept, statement, periodStart, periodEnd, duration, consolidation, unit, from: {factId, value, filingId, availableDate}, to: {factId, value, filingId, availableDate}, relChange?}`；迟到的中间披露改变既有边的 `from`（同 key，payload 变）并新增一条边 |

### 4.2 `issuer_coverage`（公共，每 (发行人, 市场) 一行）

```
issuer_id              uuid not null references issuers(issuer_id) on delete restrict
market                 text not null
filings_count          int not null                          -- mapping_gen > 0 的 filing
facts_count            int not null                          -- 当前可见（ok、当前代）行数
concepts_covered       int not null
earliest_period_end    date
latest_period_end      date
latest_available_date  date
citation_summary       jsonb not null check (jsonb_typeof(citation_summary) = 'object')   -- {linked, pending, edgar}（滞后见 §6.3 第 6 条）
scope_last_success_at  timestamptz                           -- 复制自 fact_sync_scope（公开的非敏感事实：最近一次成功同步时间）
scope_last_status      text check (scope_last_status in ('success','failed'))
based_on_rev           bigint not null
rebuilt_at             timestamptz not null default now()
rebuild_id             uuid not null
rebuild_batch_id       uuid not null references ingest_batches(batch_id) on delete restrict
primary key (issuer_id, market)
index (latest_available_date desc)
```

不存计算出的新鲜度状态；数据集级新鲜度由 §6.1 `freshness` 路由读时重算。

### 4.3 `company_watches` 与 `company_event_reads`（按用户，RLS own-rows）

```
company_watches
  user_id       uuid not null references auth.users(id) on delete cascade
  issuer_id     uuid not null references issuers(issuer_id) on delete restrict
  note          text check (note is null or char_length(note) <= 2000)
  muted         boolean not null default false
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()
  primary key (user_id, issuer_id)
  index (user_id, updated_at desc)

company_event_reads                                       -- 已读回执：按事件 id，不按时间戳
  user_id       uuid not null references auth.users(id) on delete cascade
  issuer_id     uuid not null
  event_id      text not null references issuer_events(event_id) on delete cascade
  read_at       timestamptz not null default now()
  primary key (user_id, event_id)
  foreign key (user_id, issuer_id) references company_watches(user_id, issuer_id) on delete cascade   -- 取消跟踪即清回执
  index (user_id, issuer_id)
```

未读 = 该用户未静音 watch 的 `issuer_events`（`retired_at is null`）中没有回执的行。已读只按客户端**实际收到并提交的 event_id** 写回执（§6.2），因此迟提交的旧事件、分页外的行、过滤掉的行都不会被误标。回执行数上界 = 用户 watch 数 × 该发行人事件数，`company_event_reads` 的插入触发器校验 `event_id` 属于 `issuer_id`（跨发行人回执被拒）。

为什么不复用 `watchlist_items`：它按 ticker 而非发行人；访客模式只在 localStorage，无法挂服务端已读状态；语义是行情看板分组。跟踪是发行人级（两路市场的事件都归同一发行人）、服务端状态。桥接：`POST /api/tracking/watches/import-watchlist`（§6.2）。

上限：`MAX_COMPANY_WATCHES = 200`（假设值，决策 F），由触发器 `company_watches_limit`（`before insert`：`pg_advisory_xact_lock(hashtext('company_watches:' || new.user_id))`；若 `(new.user_id, new.issuer_id)` 已存在则放行给主键冲突处理（`on conflict do nothing`，API 返回 200 原行）；否则计数，≥ 上限 `raise exception 'watch_limit' using errcode='23514'`）在数据库强制。上限与收件箱分页无关。

### 4.4 `company_digest_state`（仅 service_role，物化游标，每 (发行人, 市场) 一行）

```
issuer_id            uuid not null references issuers(issuer_id) on delete cascade
market               text not null
digested_rev         bigint not null default 0              -- 已成功物化到的 state_rev
attempt_seq          bigint not null default 0              -- 尝试计数器：每次 begin_company_digest_attempt +1
last_attempt_id      bigint                                 -- 最近一次尝试的 attempt_seq
last_success_attempt_id bigint                              -- 最近一次成功的 attempt_seq（成功与失败的归属按它判定，与 state_rev 无关）
last_failed_attempt_id  bigint                              -- 被接受的失败中最大的 attempt_seq（单调递增；成功只在 attempt_id 超过它时清除失败状态）
last_attempt_at      timestamptz
last_status          text check (last_status in ('success','failed'))
consecutive_failures int not null default 0
next_attempt_at      timestamptz not null default 'epoch'   -- 失败退避：1h × 2^n，封顶 24h
swept_at             timestamptz                            -- 上次 sweep 成功时间（由 replace 在 p_sweep=true 时写）
updated_at           timestamptz not null default now()
primary key (issuer_id, market)
index (next_attempt_at)
index (swept_at nulls first)
```

没有行的流在 `begin_company_digest_attempt` 时创建（`digested_rev = 0, swept_at = null`）；选择查询用 `fact_sync_scope left join company_digest_state`。**尝试身份与事实版本分离**：同一 `state_rev` 下的 sweep / 规则重建失败同样记录失败与退避；只有"存在更晚的成功尝试"才会让一次迟到的失败报告被忽略。

### 4.5 `financial_history`

决策 C 默认改为**本次保留**：仓库检索只能证明没有应用层读者，不能证明生产库为空或没有外部消费者（Codex 第一轮 #16、第二轮 #50）。保留时本规格不动该表与类型，仅把 `src/app/api/stocks/[ticker]/route.ts` 的 TODO 注释改指 `/api/companies/[ticker]/overview`。owner 提供部署证据（生产 `select count(*)`、无外部消费者声明）后，另一条迁移按下式删除：

```sql
do $$ begin
  if to_regclass('public.financial_history') is not null then
    lock table public.financial_history in access exclusive mode;
    if exists (select 1 from public.financial_history) then
      raise exception 'financial_history_not_empty' using errcode = '23514';
    end if;
    drop table public.financial_history;
  end if;
end $$;
```

### 4.6 函数与权限

函数：`language plpgsql security definer set search_path = ''`（与 `20261105091000_issuers.sql` 的触发器写法一致），对象全部 `public.` 限定，owner 为迁移角色；`revoke execute from public, anon, authenticated; grant execute to service_role`。

| 函数 | 作用 |
|---|---|
| `begin_company_digest_attempt(p_issuer uuid, p_market text, p_now timestamptz) → bigint` | `insert … on conflict (issuer_id, market) do update set attempt_seq = attempt_seq + 1, last_attempt_id = attempt_seq + 1, last_attempt_at = p_now`（新行从 1 起）；返回 `attempt_id`。调用方在读取事实之前调用，attempt_id 贯穿本次尝试 |
| `replace_company_digest(p_issuer uuid, p_market text, p_batch uuid, p_attempt_id bigint, p_rebuild_id uuid, p_based_on_rev bigint, p_sweep boolean, p_events jsonb, p_coverage jsonb) → jsonb {upserted, changed, retired, revived}` | 一个事务内，锁顺序固定：① `select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update`（**排他**：与规格二发布/提升/裁决函数互斥，也让两个 digest 写者串行——PostgreSQL 允许多个 `for share` 并存，所以不用 `for share`；替换是短事务，发布端等待可接受；没有行 → `raise 'unknown_stream'`）；② `v_rev <> p_based_on_rev` → `raise 'stale_computation' using errcode='55P03'`；`p_attempt_id < coalesce(last_success_attempt_id, 0)` → `raise 'stale_attempt'`（更晚的尝试已成功）；③ 校验 `p_batch` 存在、`producer='company-digest'`、`status='running'`；④ 逐项校验 `p_events`：顶层键 ⊆ `{kind, natural_key, occurred_on, period_end, concept, filing_id, payload, meta}`，`kind` 在枚举内，`payload` 与 `meta` 都按 kind 的固定 schema 逐键校验（类型、必填、无多余键；`meta` 允许键：`period_first_seen` 的 `headlineAsOf`，其余 kind 为空对象），`filing_id` 与 payload 内每个 `filingId` 必须存在于 `public.filings` 且 `issuer_id = p_issuer and market = p_market and mapping_gen > 0 and available_date <= current_date`，payload 内每个 `factId` 必须存在于 `public.financial_facts f join public.filings g on g.filing_id = f.filing_id` 且 `f.issuer_id = p_issuer and f.market = p_market and f.status = 'ok' and f.mapping_gen = g.mapping_gen and f.available_date <= current_date`（当前代、今日可见），值字段必须等于该行的 `value_text`，字符串字段长度 ≤ 256；任一失败 `raise 'invalid_event'`；⑤ 服务端计算 `event_id = encode(sha256(convert_to(canonical({issuer_id, market, kind, natural_key}), 'utf8')), 'hex')`、`payload_hash`（canonical 定义：键按码点排序、无空白、数字用 `value_text` 字符串）；⑥ upsert（冲突 `(issuer_id, market, kind, natural_key)`：更新 `occurred_on/period_end/concept/filing_id/payload/meta/payload_hash/based_on_rev/rebuilt_at/rebuild_id/rebuild_batch_id`，`payload_changed_at = case when excluded.payload_hash <> issuer_events.payload_hash then now() else issuer_events.payload_changed_at end`，`retired_at = null`；`first_seen_at` 不更新；因写者已串行，同版本的元数据刷新是后写者覆盖）；⑦ `update … set retired_at = now() where issuer_id = p_issuer and market = p_market and rebuild_id <> p_rebuild_id and retired_at is null`；⑧ `issuer_coverage` upsert（键集合校验）；⑨ `company_digest_state`：总是记录物化 `digested_rev = p_based_on_rev, last_success_attempt_id = greatest(coalesce(last_success_attempt_id,0), p_attempt_id)`；**只当 `p_attempt_id > coalesce(last_failed_attempt_id, 0)`** 时才清除失败状态与退避并推进 sweep：`last_status='success', consecutive_failures=0, next_attempt_at=now(), swept_at = case when p_sweep then now() else swept_at end`；否则这些字段保持不变（更新的尝试已失败，旧尝试的成功不能抹掉它）；返回计数 |
| `mark_company_digest_failed(p_issuer, p_market, p_attempt_id bigint, p_now timestamptz) → boolean` | **（第 6 稿 §0 #70：接受条件改为 `p_attempt_id > greatest(last_success_attempt_id, last_failed_attempt_id)`）** 持同一把 `fact_sync_scope` 行锁；只在 `p_attempt_id > coalesce(last_success_attempt_id, 0)`（没有更晚的成功尝试）时被接受：`last_failed_attempt_id = greatest(coalesce(last_failed_attempt_id,0), p_attempt_id), consecutive_failures + 1, next_attempt_at = p_now + least(interval '24 hours', interval '1 hour' * power(2, consecutive_failures)), last_status='failed'`；否则返回 false 不改。同一 `state_rev` 下的 sweep 失败因此照常记录；两种完成顺序（新失败→旧成功、新成功→旧失败）都有库测试（§12.2） |

权限：
- **（第 6 稿 §0 #64：`issuer_events` 只授 service_role select；下句仅对 `issuer_coverage` 成立）** `issuer_events`、`issuer_coverage`：`grant select to anon, authenticated, service_role`，RLS `for select using (true)`；无任何角色的 insert/update/delete（只经函数）。
- `company_watches`、`company_event_reads`：`grant select, insert, update, delete to authenticated`（reads 表无 update），策略 `auth.uid() = user_id`（insert/update 带 `with check`）；anon 无授权；service_role 全部（测试与运维）。
- `company_digest_state`：`grant select to service_role`（写只经三个函数）。
- 集成测试以真实角色验证：anon/authenticated/service_role 对两张公共表直接 `insert/update/delete` 都被拒；anon 读两张按用户表被拒；用户 B 读不到 A；anon/authenticated 执行三个函数被拒；`stale_computation`、`invalid_event`（跨流 filing、非 `ok` 事实、值不等于 `value_text`、多余键）被抛；发布与物化交错（会话 1 持 `for update` 发布中，会话 2 的 replace 阻塞，发布提交后会话 2 以旧 `p_based_on_rev` 被拒）。

### 4.7 数据访问契约 `src/lib/company/db.ts`

```ts
export interface CompanyDb {
  // 物化（service_role）
  digestDue(now: Date, limit: number): Promise<{issuerId, market, stateRev, digestedRev}[]>;   // fact_sync_scope left join company_digest_state：state_rev > coalesce(digested_rev,0) and coalesce(next_attempt_at,'epoch') <= now；按 (state_rev - digested_rev) desc, issuer_id, market
  sweepDue(olderThan: Date, now: Date, limit: number): Promise<{issuerId, market, stateRev}[]>;   // (swept_at is null or swept_at < olderThan) and next_attempt_at <= now；按 swept_at nulls first, swept_at asc, issuer_id, market
  beginAttempt(issuer, market, now): Promise<bigint>;                                           // rpc begin_company_digest_attempt
  replaceDigest(issuer, market, batch, attemptId, rebuildId, basedOnRev, sweep, events, coverage): Promise<{upserted, changed, retired, revived}>;   // rpc，抛 StaleComputation / StaleAttempt / InvalidEvent / UnknownStream
  markDigestFailed(issuer, market, attemptId, now): Promise<boolean>;
  backlog(): Promise<{failedStreams: number}>;                                                   // last_status='failed' 的流数（新鲜度 ok 判定用）
  // 公共读
  eventsOfIssuer(issuer, market, opts: {since?, until?, kinds?, cursor?, limit}): Promise<EventRow[]>;   // retired_at is null；keyset (occurred_on desc, event_id)
  coverageOf(issuers: string[]): Promise<CoverageRow[]>;
  listCoverage(filter, sort, page): Promise<{rows, total}>;
  // 按用户（会话客户端，RLS）
  watchesOf(userId): Promise<(WatchRow & {unread: number})[]>; upsertWatch(...); patchWatch(...); deleteWatch(...);
  markRead(userId, issuerId, eventIds: string[]): Promise<{inserted: number}>;   // insert … on conflict do nothing；触发器校验 event 属于 issuer
  inbox(userId, opts: {cursor?, limit, kinds?, unreadOnly?}): Promise<{rows: (EventRow & {read: boolean})[], nextCursor}>;   // keyset (first_seen_at desc, event_id desc)
}
```

三种实现：`supabaseCompanyDb`（`rpc` + `from()`）、`memoryCompanyDb`（单测，实现 stale 检查、墓碑、first_seen 保留、上限触发器语义）、`pgCompanyDb`（集成测试直连）。事实读取用规格二的 `FactsDb`：公共路由用 anon 实现，digest 用 service_role 实现（`readFacts` 为 `security invoker`，service_role 的 RLS 策略也只在 `includeNonOk=false` 时看 `ok` 行）。

---

## 5. 公司页 `/stock/[ticker]`

### 5.1 路由与入口

- 路由不变；视图由查询参数 `view ∈ overview | statements | metrics | filings | tracking | judgments | ai | signals | holdings` 选择（缺省 `overview`；`signals`/`holdings` 保留现状，列入枚举以免旧深链失效；`news` 退役，旧链接落到 `overview`）；`asOf=YYYY-MM-DD` 为页面级回放参数，作用矩阵见 §5.10；页签切换保留 `asOf`。
- 市场流：`market` 取自 `resolvePublicIssuer` 匹配到的证券行（§0 #69）。发行人同时有 `issuer_coverage` 两行时，页头显示"披露流：美股 10-K/10-Q ｜ A 股定期报告"切换，切换即切换到该市场的主证券 ticker（路由变化），两路不合并。
- 入口：自选表与目录页的名称链接；收件箱事件行深链（`view=statements&asOf=<occurred_on>` 或 `view=filings`）；Copilot 工具结果；搜索。
- 页面在 `(app)` 受保护组内；调用的公共 API 均只读。
- 实现：`page.tsx` 变服务端组件，服务端做 `resolveIssuer` 与 `coverageOf`（一次往返）后交给客户端 `CompanyPage`；各视图客户端按需取数。身份不再来自 `getStockOrStub()`；`mergeStockDetail()` 只保留给行情字段。

### 5.2 页头

```
┌ 贵州茅台 Kweichow Moutai   [600519.SH ◉] [A] · CIK — · LEI 300300…   数据状态 最近财期 2025-09-30 · 最近文件 2025-10-25 · 引用 linked 9 / pending 1 · 最近同步成功 11-02 · facts.cn ● fresh ┐
│ （行情行：按决策 J 默认不显示；批准例外时为 ¥1,432.00 −0.85% 成交 3.2 亿 · Eastmoney · 15:00 延时）   [加入自选] [跟踪 ✓] [分析 ▸]                          │
│ 回放：截至 2024-06-30 可见的披露（页头归属为今天）  [日期 ▾] [回到最新]   ← 仅当 asOf 存在，黄铜描边                                                            │
├ 概览 | 报表 | 指标 | 文件 | 跟踪 | 判断 | 模型观点（未校准） | 信号 | 持仓                                                                                      ┤
```

- 名称：`names.zh` / `names.en` 按语言，另一种作副标题；都空则 ticker。
- 证券芯片：`valid_to is null` 的证券，`is_primary` 在前；当前 ticker 高亮；点击切换路由。`redirected_from` 存在时提示"该代码已并入 …"。
- 标识符：`cik`（补足 10 位）、`lei`、`usci`，缺则"—"。
- 数据状态：来自 `issuer_coverage`（当前市场行）+ `freshness` 路由（数据集级，读时重算）。没有行 → "尚无披露事实"，事实视图进入 §5.7。
- 行情行：决策 J 默认不显示；owner 批准例外时只显示价格、涨跌、成交量 + `quote.source` + `updated_at` + 延时标记；任何情况下不显示 PE/PB/ROE/股息率（§1.2）。
- 回放条：日期 ≤ 今天；URL 更新；页头"最近文件"按 `available_date ≤ asOf` 从文件视图数据重算。

### 5.3 报表视图（statements）

控件：报表（IS / BS / CF）· 口径（`disclosed` 按披露：3M/6M/9M/12M 混排 ｜ `annual` 只 12M 与 BS 的 INSTANT ｜ `quarterly` 派生单季，只对规格二 §8 列出的五个概念）· 期数（8 / 20 / 40）· 显示缩放（原值 / 千 / 百万 / 亿；默认 CNY+中文 "亿"、USD+英文 "百万"，只作用于 `unitKind=money` 行；`per_share`、`shares`、`ratio` 行不缩放）· 合并口径固定 `consolidated`。

网格：行 = 该报表概念（概念目录顺序；DEI 的 `shares_outstanding` 放 BS 末行）；列 = **期间键** `<period_start>:<period_end>:<duration>` 降序（累计期与单季期同 `period_end` 时是两列）；每行自带 `unit`，主单位选择确定性：在该行全部期间的当前事实中按出现期间数最多的单位，并列时取单位代码的码点序最小者；主单位以外的事实在抽屉列出并在单元格加 `U` 徽标（同一期间同时有主单位与其他单位时单元格显示主单位值并带 `U`；同一期间只有其他单位时单元格为"—"并带 `U`）。单元格类型：

```ts
type Cell =
  | {kind: 'fact', factId, value: string /* value_text 原样 */, unit, availableDate, filingId, disclosureSeq, isRevision, mappingGen, rawHash, runId}
  | {kind: 'derived', metric, value: string, unit, inputUnit, basis, formulaVersion, inputs: {factId, concept, filingId, availableDate}[], rule?: 'a'|'b'}
  | {kind: 'withheld', reason: 'evidence_incomplete' | 'citation_pending', factId}   // 服务端发布前门槛置空（§5.6、§6.1）
  | null;
```

徽标：`R`（`isRevision`）、`n`（`disclosureSeq > 1` 非修订）、`!`（filing `citation=pending`，读时从 `filings` 取）、`U`（多单位）。显示格式化用字符串十进制除法 `formatDecimalText(valueText, divisor, fractionDigits)`（不经浮点；单测含 20 位整数）。单元格点击 → 披露历史抽屉（事实）或公式抽屉（派生）。行头点击 → 概念说明：`sourceConcepts`（本流命中的标签/字段集合）、概念目录 `notes`、`mappingGen`。

数据：`GET /api/companies/[ticker]/statements`（§6.1）：`disclosed`/`annual` 一次 `readFacts(issuer, market, {concepts: 该报表概念, asOf, history: false})`；`quarterly` 一次 `readFacts(…, {concepts: 规格二 §8 单季所需概念, asOf, history: true})` 后调用规格二的 `derive.ts` 规范派生函数（版本一致性规则 a/b 需要完整披露序列），只取 `q_single_*` 行，CN 单季收入为 `q_single_revenue`（营业总收入，第 6 稿 §0 #66 修正：不映射为 `revenue_operating`）；BS 没有单季口径（`quarterly` 对 BS 返回 400 `invalid_parameter:basis`）。`truncated=true` → 视图显示"读取被截断，未显示部分数据"错误卡，不显示部分网格。

表格等价：表格是主视图；每行"迷你柱"开关打开内联 SVG 柱图（token 色），< 640px 不渲染；柱图数据就是该行单元格。导出 CSV 含 `fact_id/filing_id/available_date/unit` 列与 `value_text` 原样。

### 5.4 指标视图（metrics）与估值模型区

- 行 = 规格二 §8 全部 `metric`；列 = 期间键；`ratio` 显示百分比两位小数，货币按缩放，`shares` 原值。数据经本页代理路由 `GET /api/companies/[ticker]/metrics`（§6.1，对每行 `inputs` 过证据门槛，不直接调规格二 `/metrics`）：无 `asOf` 读表（当前 `formula_version`，显示 `basedOnRev`）；有 `asOf` 为实时 derive。
- 行点击 → 公式抽屉：`METRIC_CATALOG` 公式文本（zh/en）、`basis`、`inputUnit`、`inputs[]`（每个 fact 可点进披露历史抽屉）、`rule`、`asOf`、`computedAt`。未产出的格显示"未产出"，title 固定为"缺输入、单位不一致、分母为 0、期间匹配不唯一或版本不一致（规格二 §8）"——**不推断具体原因**。
- 估值模型区（原 `DcfStudio`）放在本视图底部，标题"估值模型（假设含模型/默认/用户估计；不是事实）"，灰色分隔；回放模式下隐藏并显示"回放模式下不运行估值模型"；**不再挂载即运行**：进入时先展示"股权桥输入"面板（基期收入、在外股数、净债务，各带来源标签与 fact 链接），三项都有 `fact` 或 `user` 来源才出现"运行"按钮；缺项显示"无披露事实，需手工填写并确认"（用户填写即 `user` 来源）。种子与逐字段来源见 §9.1。

### 5.5 文件视图（filings）

列表（`available_date` 降序，`GET /api/filings/[ticker]?to=<asOf>&limit=1000`）：可得日期 · 类型（CN 显示"年报/半年报/一季报/三季报/更正"）· 财期 · `period_end` · 来源（`EDGAR` / `Tushare → 巨潮`）· 引用徽标（`edgar` 链接 EDGAR 索引页；`linked` 链接巨潮 PDF；`pending` 灰色"巨潮公告未挂接"，`linkAttempts ≥ 5` 时"挂接失败，待人工"）· 事实数（`factCount`）· 操作："在报表中高亮"、"原文/引用"（§10.3；F3 前直接新窗口打开 `url`/`documentUrl`）。`mapping_gen = 0` 的 filing 不列（规格二：尚无已发布运行覆盖）。分组预留"纪要与其他"（F3）。

### 5.6 披露历史抽屉

从单元格或指标输入打开，按 `GET /api/companies/[ticker]/facts?concept=<c>&periodStart=<ps>&periodEnd=<pe>&unit=<u>&asOf=<asOf>` 的序列升序（§0 #68）：

| 列 | 来源 |
|---|---|
| 可得日期 | `availableDate` |
| 文件 | `formType` + `sourceRef`，链接按 citation；`pending` 时标注 |
| 值 · 单位 | `value_text` 原样；显示缩放另列"显示 = 原值 ÷ 1e8"之类的变换 |
| 修订 | `isRevision` → 与前一行差值与相对变化 |
| 变换链 | ① 映射：`sourceConcept → concept`（`mappingVersion`、`mappingGen`）② 单位归一（规格二 `units.ts` 规则名）③ 派生（仅派生格：`formulaVersion`、`basis`、`rule`）④ 显示缩放 |
| 证据 DTO | 随每个含财务数值的响应一起返回（§6.1 发布前门槛，不是按需取）：`{rawHash, snapshot: {source, path, api|url, params（无 token）, fetchedAt, httpStatus, page, download: '/api/companies/snapshot?fact=<factId>' \| null}, locator: {jsonPointer（EDGAR：`/facts/<tax>/<tag>/units/<unit>/<index>`；Tushare：`/data/items/<rowIndex>` 与字段名）, pdf?: {page: number, table: string \| null, row: string, column: string}}, run: {runId, codeVersion, toolVersions}, mappingVersion, unitRule, sourceDocument: {kind: 'edgar_index' \| 'cninfo_pdf', url} \| null}`。`download` 是**稳定端点**，不是签名 URL（签名 URL 60 s 过期，不得嵌入可缓存的财务 JSON，#59）：`GET /api/facts/snapshot?hash=`（§6.4）在每次下载时校验该哈希是已登记的 EDGAR 对象、现铸 60 s 签名 URL 并以 `Cache-Control: no-store` 重定向；只对 `source='edgar'`（美国政府公开数据），Tushare 对象拒绝（条款限制，§15），其 `download = null`。**读者可回放性**：EDGAR 事实 → 下载原文字节、按 `jsonPointer` 定位、与 `rawHash` 核对；CN 事实 → 读者唯一可达的原件是巨潮 PDF，因此 CN 事实的证据必须含 **逐值 PDF 定位** `locator.pdf`（页码、表名、行名、列名——由规格三的巨潮逐值核对产生，§10.1 第 2 条），`citation='linked'` 且 `locator.pdf` 存在才算证据完整；缺任一 → 置 `withheld`（公共端点一律如此，不区分会话，#57）。这与规格二决策 C 的默认（`pending` 事实公共可见）不同：本页取更严格的一侧，理由是总纲 §5"做不到回放的数字不上线" |
| 代码版本 | 证据 DTO 的 `run.codeVersion`。统一的证据资格函数 `evidenceEligible(dto, market)`（`src/lib/company/evidence-gate.ts`）：证据 DTO 缺失、`codeVersion` 为空、EDGAR 事实无 `rawHash`/`jsonPointer`、CN 事实无 `sourceDocument.cninfo_pdf` 或无 `locator.pdf` → 不合格；**所有**展示财务数值的地方（报表格、指标格及其 `inputs`、速览、事件 headline 与修订差值、Copilot packet、抽屉序列、DCF 事实种子）都经同一函数，不合格的值在服务端置 `withheld`（`{kind:'withheld', reason}`，前端显示"来源记录不完整"/"引用待挂接"，汇总计数），不显示替代值 |

底部"复制可复现查询"给出上面的 URL。

### 5.7 缺失与特殊状态

| 状态 | 判定 | 页面 |
|---|---|---|
| 未知 ticker | resolve null 且 `/api/quote` 404 | 现有 `notFound` |
| 有行情无发行人 | resolve null，行情有 | 页头只有行情；事实视图"该证券尚未登记到发行人主数据（规格一），无披露事实" |
| 发行人无事实 | `issuer_coverage` 无该市场行 | 事实视图"尚无披露事实（不在同步范围或尚未同步）"；admin 看到 `/admin/dq` 链接 |
| 港股 | 发行人证券全为 `.HK` 且无 US/CN 行 | 事实视图"港股披露事实待文档管道（F3）" |
| A 股引用待挂接 / 无逐值 PDF 定位 | filing `citation = pending`，或 `linked` 但该值无 `locator.pdf` | 公共端点：单元格"—（引用待挂接 / 待逐值核对）"（服务端置空，§5.6，不看会话）；admin 只能经 `/api/admin/companies/…`（§6.4）看到数值 + `!` 徽标；文件视图灰徽标；页头计数 |
| 回放早于首个文件 | `asOf < earliest available_date` | 网格空，"截至该日尚无可见披露" |
| 概念缺失 | 某期无该概念可见事实 | "—"，title 固定"该期无此概念的可见披露"（不推断原因） |
| 读取被截断 | `truncated=true` | 错误卡，不显示部分数据 |
| 来源记录不完整 | 证据 DTO 缺失或 `codeVersion` 为空 | 单元格不显示数值，显示"来源记录不完整"；网格顶部计数 |
| 股权桥缺事实 | DCF 种子缺 `baseRevenue`/`sharesDiluted`/`netDebt` 任一 | 估值模型区不出估值，显示缺项与手工填写入口 |
| 规格二路由 5xx | 组合路由内部错误 | 视图级错误卡 + 重试；不回退到其他数据源 |

### 5.8 概览视图（overview）

- K 线与行情卡：决策 J 默认**从公司页移除**（行情链路无回放契约）。owner 批准例外时：保留 `KlineChart` 并新增"表格视图"开关（表格列出图上绘制的同一序列：日期、开高低收、成交量及已绘制指标列，数值与图输入逐行一致，e2e 校验）；行情卡只剩价格、涨跌、成交量/成交额、来源、更新时间。PE/PB/ROE/股息率/市值卡无论如何移除。
- "最新财期速览"卡：当前市场 `latest_period_end` 的 `revenue`（CN 为 `revenue_operating`）、`net_income_parent`、`operating_cash_flow`、`gross_margin`、`revenue_yoy`，各带抽屉入口与 `basedOnRev`。
- "最近事件"三条（`issuer_events`，`retired_at is null`）。
- 现有"今日无触发"信号卡不动。

### 5.9 移动端

证券芯片与页签横向滚动；网格横向滚动冻结首列；抽屉为全屏底部抽屉；不渲染迷你柱。

### 5.10 视图 × 回放矩阵

| 视图 | 无 `asOf` | 有 `asOf` |
|---|---|---|
| overview | 速览：一次 `readFacts(asOf=今天, history:true)`（规范派生函数要求完整披露序列，规格二 §8）取事实并在同一信封上算 `gross_margin/revenue_yoy`（不读物化指标表，避免 `basedOnRev` 不一致）；事件读物化表 | 速览同样从 `readFacts(asOf, history:true)` 一次信封算；事件按 `asOf` 现算（§6.1 `events`）；K 线（若按决策 J 保留）显示"不支持回放"横幅 |
| statements | `readFacts(asOf=今天)` | `readFacts(asOf)` |
| metrics | 读 `financial_metrics`（显示 `basedOnRev`） | 实时 derive |
| 估值模型区 | 按 §5.4 门控运行 | 隐藏 |
| filings | 全部已激活 filing | `available_date ≤ asOf` |
| tracking | 物化事件 + 已读回执 | 现算事件；已读操作禁用（"回放模式不记录已读"） |
| judgments | F4 当前卡 | F4 按 `asOf` 返回**当时版本**的卡（§10.4：结算、校准都不得晚于 `asOf`） |
| ai / signals / holdings | 现状 | 显示"不支持回放"横幅 |

---

## 6. 读取与写入接口

共同约定（第 6 稿：`market` 与票据解析见 §0 #69；事件读取见 §0 #64）：公共只读路由用 anon 客户端（规格二 anon `FactsDb` + `supabaseCompanyDb(anon)`）、`force-dynamic`、参数重复 → 400 `invalid_parameter:<name>`、ticker 正则同 `/api/entities/resolve` 的 `SAFE`、`resolveIssuer({ticker},{today})` 无 → 404 `unknown_ticker`、`market` 由后缀决定；`asOf` 为 `YYYY-MM-DD` 且 ≤ 今天；错误与空结果 `no-store`；成功且 `asOf` 早于今天 → `public, max-age=600, s-maxage=3600`，否则 `successCacheControl(now)`；`truncated` 透传。按用户路由用会话客户端（RLS），响应 `Cache-Control: private, no-store`（成功与错误都是），未登录 401。**公共端点永远按非 admin 规则置空**（`withheld`），不读取会话、不因调用者身份改变响应体——同一 URL 在共享缓存里只能有一种内容；未脱敏变体只存在于 `/api/admin/…`（§6.4），`requireAdminUser()` 门控，每个响应 `Cache-Control: private, no-store`，与公共端点不共享任何缓存的 DTO 对象（#57）。

### 6.1 公共

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/companies/[ticker]/overview` | `asOf` | `{issuer: ResolvedIssuer, market, coverage: CoverageRow \| null, coverageOtherMarket: CoverageRow \| null, latestFiling: FilingSummary \| null（`available_date ≤ asOf` 的最近一条，来自完整的 `filingsOfIssuer`）, latest: {periodKey, facts: {revenue|revenue_operating, net_income_parent, operating_cash_flow: Cell}, derived: {gross_margin, revenue_yoy: Cell}, stateRev, truncated} \| null（同一 `readFacts` 信封），recentEvents: Event[≤3]}` |
| `GET /api/companies/[ticker]/statements` | `statement=IS\|BS\|CF` 必填、`basis=disclosed\|annual\|quarterly`、`periods=8\|20\|40`、`asOf` | `{issuerId, ticker, market, asOf, mappingGen, stateRev, truncated, statement, basis, periods: [{key, periodStart, periodEnd, duration}], rows: [{concept, unit, unitKind, sourceConcepts, notes, cells: {[key]: Cell}}], filings: {[filingId]: FilingSummary（含 citation、linkAttempts、factCount）}, evidence: {[factId]: EvidenceDto}, withheld: {evidenceIncomplete: n, citationPending: n}}`。**发布前门槛**：服务端对响应里每个将显示的 `factId`（含派生格的全部 `inputs`）调用 `fact_evidence`（≤ 100 id 一批，分批）并经 `evidenceEligible`（§5.6）；不合格的事实，其单元格（派生格则整格）在服务端改为 `withheld`，数值不进响应。同一门槛函数覆盖本模块**每一个**含财务数值的响应：`overview.latest`、`packet`、`events`/`inbox` 的 payload（headline 值、`fact_revised` 的 `from/to` 值与 `relChange`）、规格二 `/api/facts/[ticker]/metrics` 被本页直接消费时由本页的 `metrics` 代理路由 `GET /api/companies/[ticker]/metrics` 过门槛（本页不再直接调用规格二的 `/metrics`）、`/api/facts/[ticker]?history=1` 的抽屉序列（响应附带 `evidence`，§10.1 第 2 条）、DCF 事实种子（§9.1）。公共端点不看会话；admin 的未脱敏版本见 §6.4 |
| `GET /api/companies/[ticker]/events` | `since`、`until`、`kinds`、`cursor`、`limit ≤ 200`（缺省 50）、`asOf` | 无 `asOf`：物化表（`retired_at is null`）keyset 分页；有 `asOf`：`readFacts(asOf, history: true, includeFilings: true)` → `deriveIssuerEvents` 现算，不含 `firstSeenAt`，响应 `computed: 'live'`；`truncated` → 400 `replay_truncated`。两种模式下 payload 内的数值（headline、`from/to`、`relChange`）都经证据门槛：引用的 `factId` 不合格 → 该值替换为 `{kind:'withheld', reason}`，响应附 `evidence` 字典 |
| `GET /api/companies/[ticker]/metrics` | 与规格二 `/api/facts/[ticker]/metrics` 同参数 | **（第 6 稿 §0 #67：保留 rev 前后守卫与 `stale`）** 代理：调用规格二读取后对每行 `inputs` 的全部 `factId` 过证据门槛，任一不合格 → 该指标行 `withheld`；附 `evidence`；页面只用此路由，不直接调规格二 `/metrics` |
| `GET /api/companies/[ticker]/packet` | `annualPeriods ≤ 10`（缺省 5）、`recentPeriods ≤ 8`（缺省 4） | Copilot 工具包：三张报表的年度行 + 最近若干披露期 + 六个指标，每值带 `factId/availableDate`，`provenance: {mappingGen, formulaVersion, stateRev}`，`clipped: {annual, recent}` 显式标出被裁的期数；JSON ≤ 32 KB 由裁期数保证 |
| `GET /api/companies` | `market`、`q`（名称/ticker 前缀 ≤ 24）、`sort=latest_available_date\|latest_period_end\|name`、`page`、`pageSize ≤ 200` | `{total, rows: [{issuerId, market, names, primaryTicker, tickers[], latestPeriodEnd, latestAvailableDate, conceptsCovered, citationSummary, scopeLastSuccessAt, scopeLastStatus}]}`；不含任何按用户字段 |
| `GET /api/companies/freshness` | — | `{datasets: [{dataset: 'facts.us'\|'facts.cn'\|'company.events', status, lastOkAt, lastAttemptAt}]}`；服务端用 `getAdminSupabase()` 读 `dq_freshness` 三行经 `freshnessOf(now)` 重算后只返回这四个字段；`public, max-age=60` |
| 规格二路由 | `/api/facts/[ticker]`（含 `history=1`、`factIds`）、`/metrics`、`/api/filings/[ticker]` | 抽屉、指标、文件视图直接用 |

### 6.2 按用户（跟踪）

| 路径 | 行为 |
|---|---|
| `GET /api/tracking/watches` | 当前用户全部 watch 联 `issuers`/`issuer_coverage`（两路）与未读数（无回执且 `retired_at is null` 的事件数，按发行人计数，> 99 显示 `99+`） |
| `POST /api/tracking/watches` | `{issuerId}` 或 `{ticker}`；解析后 `insert … on conflict do nothing`；触发器超限 → 409 `watch_limit`；已存在 → 200 原行（触发器对已存在键放行） |
| `PATCH /api/tracking/watches/[issuerId]` | `{note?, muted?}` |
| `POST /api/tracking/watches/[issuerId]/read` | `{eventIds: string[]}`（≤ 500，必须是本次或此前 `inbox`/`events` 响应里返回过的 id；服务端只校验 id 属于该发行人且用户持有该 watch）→ 写回执 `on conflict do nothing`；返回 `{inserted}`。没有"全部标记已读"的时间戳语义；客户端的"标记本页已读"提交当前页的 id |
| `DELETE /api/tracking/watches/[issuerId]` | 删除（回执级联删除） |
| `POST /api/tracking/watches/import-watchlist` | 读当前用户服务端 `watchlist_items.ticker` 去重 → `resolveIssuer` → 逐条 `insert … on conflict do nothing`（触发器守上限）；返回 `{added[], existing[], unresolved[], skippedByLimit[]}`；无服务端自选 → 409 `no_server_watchlist` |
| `GET /api/tracking/inbox` | `cursor`、`limit ≤ 200`、`kinds`、`unreadOnly=1`：未静音 watch × `issuer_events`（`retired_at is null`）左联回执，按 `(first_seen_at desc, event_id desc)` keyset；响应 `{rows: [{…event, read: boolean}], nextCursor, evidence}`；payload 数值同样经证据门槛置 `withheld`（与 `events` 路由共用同一函数）；同发行人同日多条由客户端折叠；F4 事件的合并等 F4 事件 DTO（§1.2） |

CSRF：POST/PATCH/DELETE 校验 `Origin` 与 `Content-Type: application/json`（同 `/api/admin/dq/quarantine/[id]`）。

### 6.3 物化 cron `GET|POST /api/cron/company-digest`

`CRON_SECRET` Bearer；`maxDuration = 300`；`deadline = start + 240 s`。核心 `src/lib/company/digest.ts::runCompanyDigest(deps, {mode: 'incremental' | 'full', issuerIds?, limit})`：

1. `startBatch({producer: 'company-digest', dataset: 'company.events', toolVersions: {events: EVENTS_VERSION, mappingGen, formulaVersion}, codeVersion})`；`code_version` 规则同规格二 §6.1（取不到则拒绝 apply，`code_version_missing`）。
2. 选流：预算 `limit`（缺省 200）按 80/20 分配：incremental = `digestDue(now, ceil(0.8·limit))`（`state_rev > digested_rev and next_attempt_at ≤ now`，按积压差降序）；sweep = `sweepDue(now − 7 d, now, floor(0.2·limit))`（`swept_at` 最旧优先，null 最先）；两份列表按 `(issuer_id, market)` 去重（两边都选中以 `p_sweep=true` 处理），然后**交错**成一个执行序列（每 4 个 incremental 后插 1 个 sweep），使截止到来时 sweep 已按比例消耗了预算，而不是排在末尾被饿死；full = 全部（脚本）。剩余预算 < 30 s 不再开始新流，`deadline_hit` 记入回执 `errors`（依赖规格二把它加入 `INFO_CODES`；规格二未落地前只写 `detail.deadlineHit=true`，不进 `errors`）。
3. 每个流：`attemptId = beginAttempt(issuer, market, now)`；`rebuildId = randomUUID()`；`readFacts(issuer, market, {concepts: 全部, asOf: 今天, history: true, includeFilings: true})`（§10.1 第 3 条：filings 与事实同一快照、同一 `stateRev`）→ `truncated` → `markDigestFailed(…, attemptId)`，码 `read_truncated`；否则 + 流的 `fact_sync_scope` 行（`last_success_at/last_status`）→ `deriveIssuerEvents` + `summarizeCoverage` → `replaceDigest(…, attemptId, rebuildId, basedOnRev = 信封 stateRev, sweep)`；`stale_computation` → 同一 attemptId 重读重算一次，再失败 `markDigestFailed`；`stale_attempt` → 该流 `skipped_summary(stale_attempt)`（更晚的尝试已成功，不是失败）；`invalid_event` → `markDigestFailed` 并记错（本模块的 bug 信号）；其他异常 → `markDigestFailed`。sweep 在当前 `state_rev` 上失败同样经 `markDigestFailed` 记录退避（尝试身份与事实版本分离，§4.4）。
4. 结束：`finishBatch`。批次六计数器按**流**计（事件级数字只进 `detail`，不参与状态判定）：`fetched` = 尝试的流数，`inserted` = 事件集有变化（`changed + retired + revived > 0`）的成功流数，`duplicates` = 成功但事件集无变化的流数（零事件、零变化的替换也算）**加上**被更晚尝试取代的 `stale_attempt` 流与尝试后发现的 `unknown_stream` 流（"这项工作已由更新的尝试完成或已无此流"归入 `duplicates`，同时分别计入 `detail.skippedStale`、`detail.skippedUnknown`），`failed` = 失败流数，`versioned`/`quarantined` = 0；完成的批次必须满足 `fetched === inserted + duplicates + versioned + quarantined + failed`（单测与集成测试用真实 `finishBatch` 断言全跳过批次与混合批次都没有 `unaccounted`）；`detail = {events: {upserted, changed, retired, revived}, attempted, succeeded, failed, skippedStale, skippedUnknown, swept, idle, backlogFailed}`。`recordAttempt('company.events', {ok, cadence: 'daily', detail})`，其中 `ok = failed === 0 && backlogFailed === 0`（`backlogFailed = CompanyDb.backlog().failedStreams`，即 `last_status='failed'` 的流数——含同版本 sweep 失败）：空转但仍有退避中的失败流 → `ok:false`。cron 与脚本不同时运行（runbook；`recordAttempt` 假设单一生产者）。
5. `vercel.json`：`/api/cron/company-digest` 每小时第 20 分（`20 * * * *`）。脚本 `scripts/company/digest.ts --full [--issuer …] [--market …] [--apply]`：`EVENTS_VERSION`、映射代或公式版本变更后由 owner 运行。
6. 时滞（目标值，吞吐实测后确认，§16）：事实可见性变化（发布、提升、裁决）→ 下一次 incremental（约 1 h + 失败退避）；巨潮挂接（`document_url` 更新，不改 `state_rev`）→ 读时从 `filings` 联查，徽标即时正确；`citation_summary` 滞后一个 sweep 周期（目标 7 天）。并发：`replaceDigest` 先对规格二的 `fact_sync_scope` 行取 `for update`（排他）再比对 `state_rev`，发布中的流让物化等待，发布后旧版本的物化被拒，两个 digest 写者串行；同 `state_rev` 的两次计算经济内容相同，`payload_changed_at` 不变。

### 6.4 管理

- 公共稳定下载端点 `GET /api/companies/snapshot?fact=<factId>`（§0 #62）（anon 可用）：校验该哈希对应的对象已登记且 `source='edgar'`（否则 404 / 403 `not_redistributable`），每次调用现铸 60 s 签名 URL，`302` 重定向并带 `Cache-Control: no-store`；不把签名 URL 写进任何可缓存响应（#59）；测试：对一份超过 60 s 的财务响应里的 `download` 仍能下载，过期后重复下载仍成功。
- `GET /api/admin/companies/snapshot?fact=<factId>`：`requireAdminUser()`；任意来源（含 Tushare）的对象的 60 s 签名 URL，`private, no-store`；审计日志 `research_audit_log('facts.snapshot.download')`。
- 未脱敏变体（#57）：`GET /api/admin/companies/[ticker]/statements|overview|events|metrics|packet` 与 `GET /api/admin/companies/[ticker]/facts`——与公共路由同参数同形状，但 `citation_pending` / 缺 `locator.pdf` 的 CN 值不置空（证据缺失与代码版本为空仍置空）；`requireAdminUser()`；每个响应 `Cache-Control: private, no-store`；实现上与公共路由不共享任何已构建的 DTO 缓存对象（各自从 `readFacts` 组装）。公共 `/api/companies/*`、`/api/facts/*` 路由不读会话。测试：共享缓存夹具中 admin 请求公共 URL 后匿名请求同一 URL，响应不含任何 pending-CN 值（公共 URL 对 admin 也是脱敏的）。

---

## 7. 事件推导与跟踪语义

### 7.1 `EVENTS_VERSION = 'company-events/1'`

规则改动 +1；全量重建后不再推导出的事件被墓碑化（`retired_at`），不删。

### 7.2 `deriveIssuerEvents(input, {cutoff})`（纯函数，`src/lib/company/events.ts`）

输入：一个 (发行人, 市场) 流在 `cutoff`（物化 = 今天；回放 = `asOf`）下 `readFacts(history: true)` 的全部行（`status='ok'`、当前代、`available_date ≤ cutoff`）与 `filingsOfIssuer` 中 `mapping_gen > 0 and available_date ≤ cutoff` 的 filing。输出按 `(occurred_on, kind, natural_key)` 排序的事件数组，确定性。

- `filing_published`：每个合格 filing 一条，`factCount` = 该 filing 当前可见事实数（可为 0，例如只有 DEI 条目或零输出的 filing）。
- `period_first_seen`：按期间键 `(period_start, period_end, duration)` 分组 `consolidation='consolidated'` 的事实（`INSTANT` 的 `period_start` 记为 `period_end`）；`occurred_on` = 组内各自然键序列第一条披露的最小 `available_date`；`headline` 取组内概念在 `cutoff` 下的当前值，某概念同期有多个单位则不进 headline 并列入 `ambiguousUnits`；`meta.headlineAsOf = cutoff`。
- `fact_revised`：每个自然键的披露序列中相邻值不同 → 一条，key 用修订方的 `available_date`；同日同值重复不产生事件。迟到的中间披露 B 插入 A、C 之间：原边 `A→C`（key = C.date）payload 变为 `B→C`（`payload_changed_at` 更新，`first_seen_at` 不变），新增 `A→B`（key = B.date，新 `first_seen_at`）。
- 隔离使某披露从序列消失时，对应边消失 → 墓碑；提升后复活并保留原 `first_seen_at`。
- `occurred_on` 永远是可得日期；未读只看 `first_seen_at`；payload 变化在 UI 以"已更新"标记，不重新计未读。

### 7.3 收件箱合并

`issuer_events` 按 `(first_seen_at desc, event_id desc)`，左联 `company_event_reads` 得 `read`；同发行人同日折叠；静音不进收件箱但公司页可见；回放模式不读物化表、不记已读。F4 事件的合并等 F4 给出带稳定 id、租户范围与观察时间的事件 DTO 后在 C5 接入（§1.2、§10.4）。

---

## 8. 覆盖目录 `/intel/companies`

- 入口：`/intel` "研究"页签增加"公司覆盖"卡与链接；`TabBar` 的 `intel` 以 `startsWith` 高亮。
- 列：名称（链接）· 代码（主证券 + 芯片）· 市场流 · 最近财期 · 最近文件日 · 概念覆盖（`n / FACT_CONCEPTS.length`）· 引用计数 · 最近同步成功时间与上次结果（事实，不是状态色）；页顶一条数据集新鲜度（`freshness` 路由）。
- 筛选：市场、名称/代码前缀；排序三种；分页 100；行业筛选在成分加载前不出现。
- 空状态："事实库尚无发布事实"；admin 看到 `/admin/dq`。
- 不显示评级、判断计数或任何按用户字段。

---

## 9. 旧读者迁移与 `/api/financials` 退役

### 9.1 `src/lib/dcf/assemble.ts` 与 `/api/dcf/[ticker]`

- 单位约定（显式写进 `DcfAssumptions.meta`）：货币金额用 `currencyUnit`（CNY → 亿，除数 1e8；USD → 百万，除数 1e6）；`sharesDiluted` 用**同一除数**换算（股数 ÷ 1e8 或 ÷ 1e6），使 `equity / sharesDiluted` 直接得到每股货币单位；`netDebt` 同货币同除数。种子记录每个字段的除数。
- **（第 6 稿 §0 #65：CN 净债务 = `borrowings_total − monetary_funds`，CN `cash` 不映射）** 新纯函数 `src/lib/company/dcf-seed.ts::seedFromFacts(envelope, security): {seed, provenance: {[leafPath]: {source: 'fact', factIds, metric?, divisor, basis}}, missing: {field, reason}[]}`。输入是**一个** `readFacts(issuer, market, {concepts: 所需, asOf: 今天, history: true})` 信封（派生用规格二 `derive.ts` 在同一信封上算，不读物化指标表，避免跨 `basedOnRev` 混用）与当前证券的 `issuer_securities` 行：最近 `12M` 的 revenue（CN：`revenue_operating`）与同期 `gross_margin`；同一 `period_end` 的 instant `shares_outstanding`、`cash`、`borrowings_total`（`borrowings_total` 由同信封 derive）。映射（叶子路径）：`revenueLines[0].baseRevenue` ← revenue（`revenueLines[0].name`、`cagr` 不是事实，来源为 default/llm/user）；`grossMarginPct` ← `gross_margin`；`sharesDiluted` ← `shares_outstanding`（`basis: 'shares_outstanding'`，UI 标注"在外股数（封面日期），非稀释股数"）；`netDebt` ← `borrowings_total − cash`（`basis` 继承 `us_standard`/`cn_incl_bonds`，UI 标注"借款合计 − 货币资金；不含租赁负债、应付票据等"）；`currency`、`currencyUnit`、`divisor` ← 事实单位。期末不对齐、缺项、单位不一致 → 不种子并进 `missing`。
- 股数适用性（肯定式检查，缺一不种子）：当前证券 `share_class ∈ {'common','A'}`；该发行人在当前市场只有一条未关闭证券；`shares_outstanding` 在封面日期只有一个当前事实（多类别股本 → `missing: 'multi_class_shares'`）。`unknown`（SEC 装载默认值）、`ADR`、`preferred`、`H`、`other` → `missing: 'share_basis_unverified'`。在规格三给出股份类别与 ADS 比例前，美股的股数种子多数不可用，这是如实的缺失。
- 收入行契约（引擎对 `revenueLines` 逐行求和，`src/lib/dcf/engine.ts::buildYearly`）：本次发布 `revenueLines` **固定为一行**——`[{name: '合计', baseRevenue: <事实或用户值>, cagr: <llm|default|user>}]`；LLM 提示只请求 `cagr` 与成本结构比率，不请求收入拆分；合并时 `revenueLines` 不按索引深合并：数组长度固定为 1，LLM/默认/用户只能写 `revenueLines[0].cagr`，任何对 `baseRevenue` 或数组长度的非事实/非用户写入被丢弃并记 `warnings`。收入分解（多行）留待另立契约（各行 `baseRevenue` 必须与事实合计对账）。门控检查覆盖**每一个** `revenueLines[i].baseRevenue` 叶子（当前即唯一一行）。
- 事实种子过证据门槛：`seedFromFacts` 的每个 `fact` 叶子所引用的 `factIds` 必须全部通过 `evidenceEligible`（§5.6），否则该叶子不种子、进 `missing: 'evidence_incomplete'`（股权桥叶子因此可能转为需用户确认）；`/api/dcf` 响应附 `evidence` 字典。
- 合并与门控：合并顺序 defaults < LLM < **facts** < user overrides，按叶子路径深合并（`revenueLines` 按上一条特殊处理）；每个叶子带 `provenance ∈ fact | llm | default | user`；`currency/currencyUnit/divisor` 进入 LLM 提示、默认值与 overrides 的解释（LLM 输出按同一单位解释）。**股权桥**（全部 `revenueLines[i].baseRevenue`、`sharesDiluted`、`netDebt`）必须全部为 `fact` 或 `user`，否则路由返回 `{status: 'unavailable', missing, provenance}` 不运行引擎——默认值与模型输出不得填充这些叶子。`warnings` 的"暂无财报数据"只在没有任何 `fact` 叶子时出现。
- `/api/dcf/[ticker]` 不再自调 `/api/financials`；`DcfStudio` 不再挂载即运行（§5.4）；回放模式下不渲染（§5.10）。

### 9.2 `src/lib/agent/tools.ts` 的 `financials` 工具

去掉 `aShareOnly`；描述改为"最近 5 个财年三张报表 + 最近 4 个披露期 + 六个派生指标，每值带 fact id 与可得日期；A/US；港股暂无；被裁期数见 `clipped`"；handler 调 `GET /api/companies/<ticker>/packet`。五个 method 文件中"A 股专属数据（financials/flows…）"措辞改为"financials 覆盖 A/US，港股暂无；flows/holders/calendar 仅 A 股"。

### 9.3 `useFinancials`

`src/lib/hooks/useQuote.ts` 的 `YearlyFinancial`、`FinancialState`、`useFinancials` 删除。

### 9.4 `/api/consensus/[ticker]`

删注释引用；按决策 D 关闭 mock 分支（`source: 'mock'` 不再返回，改返回 `{source: 'none', consensus: null}`）。

### 9.5 `/api/financials/[ticker]` 退役

C2 完成后该路由零内部调用（验证：`grep -rn "api/financials" src --include='*.ts' --include='*.tsx'` 只剩该路由自身与其测试）。决策 B 选"删除"则 C2 删除路由文件；`tushare-cached.ts` 的 `fetchTushareIncome/Balance/Cashflow` 仍被 `perspectives` 路由使用、`fetchTushareFinaIndicator` 被 quote/radar/composer 使用，保留。

---

## 10. 依赖接口（待对齐）

### 10.1 规格二（第 8 稿，实施中）——写入规格二 §16 或 F2-6 任务

**第 6 稿：本节保留为对规格二的接口请求清单（列入 PR）；落地状态与本模块的适配器见 §0.1，C0 不再以规格二书面接受为退出条件（§0 #61）。**

1. `derive.ts` 导出 `METRIC_CATALOG: {metric, formula: {zh, en}, inputs: concept[], basisByMarket}` 与可在任意信封上运行的规范派生函数（本规格的 `quarterly` 口径与 DCF 种子都调用它）。
2. 证据 DTO：`read_facts` 行含 `run_id`；新增 `security definer`、`stable`、授予 anon/authenticated 的 `fact_evidence(fact_ids uuid[]) → jsonb`，内部联 `financial_facts → fact_sync_runs → ingest_batches` 与快照 `meta.json` 登记（规格二需把 `{sha256}.meta.json` 的内容同时登记到一张可查的表或在 `financial_facts` 旁存 `snapshot_meta_ref`），只返回 `{fact_id: {raw_hash, snapshot: {source, path, api|url, params, fetched_at, http_status, page}, locator: {json_pointer}, run: {run_id, code_version, tool_versions}, mapping_version, unit_rule}}`（无 token、无内部备注），上限 100 个 id；`/api/facts/[ticker]` 在 `history=1` 时随响应附 `evidence` 字典；EDGAR 快照对象的公共稳定下载端点 `GET /api/facts/snapshot?hash=`（每次现铸签名 URL、`no-store` 重定向；只对 `source='edgar'`，Tushare 对象拒绝）。**CN 逐值 PDF 定位**：证据 DTO 对 CN 事实必须能给出 `locator.pdf = {page, table, row, column}`——来源是规格三的巨潮 PDF 逐值核对（`dq_reconciliations` 或其登记表须按 `fact_id` 存页/表/行/列），本规格把它列入对规格三的接口要求（§10.2）；在该登记存在之前，CN 事实在公共端点一律 `withheld`（本页如实显示为"待逐值核对"）。同时解决规格二 §4.7 对 `fact_sync_runs` "public grant / 仅 service_role 可读"的自相矛盾（本规格只需要经函数的窄读，不需要表级公共读）。
3. 同快照的 filings：`read_facts` 增加 `p_include_filings boolean`，为 true 时信封含 `filings`（该发行人该市场 `mapping_gen > 0` 的**完整**列表，每条含 `factCount`、`linkAttempts`、`mappingGen`、`citation`），与事实行来自同一条语句、同一 `state_rev`——这是 digest 与 `statements` 路由建立事实/文件一致性的唯一方式（分页读 filings 再比对 `stateRev` 不能证明同快照）；`/api/filings/[ticker]` 的 `limit` 上限改为"无上限或到尽"。`financial_metrics` 行与 `/metrics` 响应含 `computedAt`（公式抽屉显示）。
4. anon `FactsDb` 子集暴露 `readFacts`、`factsByIds`、`filingsOfIssuer`、`metricsOfIssuer`，供组合路由服务端直接调用（不经 HTTP 自调）。
5. 确认 `state_rev` 在发布、`promote_quarantined`、`resolve_facts_quarantine` 三处递增，且三者都持 `fact_sync_scope` 行的 `for update` 锁（本规格 `replace_company_digest`、`mark_company_digest_failed` 也以 `for update` 取同一把行锁，与之互斥并让 digest 写者串行）；digest 不需要处理钩子回调。
6. `INFO_CODES` 增 `deadline_hit`（规格二 §7.2 已列）；落地前本规格按 §6.3 第 2 条降级处理。
7. `financial_history` 由本规格处理（规格二 §15.6 关闭；本次保留，§4.5）。

### 10.2 规格三

- 历史 ticker 归属：对齐后回放条可显示"该日归属"。
- `dq_reconciliations` 通过的流/财期：对齐后单元格与文件视图加"已对账"徽标；需要公共读 `GET /api/facts/[ticker]/reconciliations`（只含 passed 布尔与对账日）。
- **CN 逐值 PDF 定位登记**（本页 CN 数值公共显示的前提，#40）：巨潮逐值核对须按 `fact_id` 登记 `{page, table, row, column}` 并经一个 `security definer` 窄读函数供 `fact_evidence` 联查；登记缺失的 CN 事实在本页公共端点保持 `withheld`。
- ADR/ADS 比例登记后 §9.1 的 ADR 限制解除。

### 10.3 F3 文档管道

- `GET /api/documents/by-filing/[filingId]` → `{documentId, status: 'available' | 'pending' | 'restricted', pages, permission}`；`restricted` 只显示元数据与外链。
- 源抽屉组件 `<SourceDrawer documentId page? bbox? />` 由 F3 提供。
- 港股：F3 扩展 `market` 枚举后，本规格 §4 的 `market` check 同步扩展（一次迁移），页面按 `issuer_coverage` 行判定。
- 纪要进入文件视图"纪要与其他"分组：需要 `source_type`、`available_at`、引用跨度。

### 10.4 F4 判断层框架（显示契约）

本页只消费。**对齐说明（2026-11-04）**：并行编写的 F4 规格 `docs/superpowers/specs/2026-11-04-judgment-framework-design.md` §9.2 已定义 `JudgmentCard`（`subject`、`kind`、`lifecycle`、`calibration ∈ {insufficient, failed, self_assessed, calibrated}`、`display.percent`（仅 `calibration='calibrated'` 时非空）、`condition`、`settlement`、`calibration_summary`、`inputs`）、组件 `src/components/judgments/JudgmentCard.tsx` 与 `GET /api/judgments?subject_type=issuer&subject_key=<issuer_id>`。本页按 F4 的契约渲染，下面的接口草案只保留为**本页对 F4 的要求清单**，字段名以 F4 为准：
- 本页不自行计算百分比，只渲染 `display.percent`，并在客户端再加一道失败关闭：`calibration !== 'calibrated'` 或 `lifecycle ∉ {open, settled}` 或 `display.percent` 非有限数 → 不显示百分比（防御 F4 响应缺陷）。
- `asOf` 回放按 F4 §10 的契约：`GET /api/judgments?subject_type=issuer&subject_key=<issuer_id>&view=as_known&asOf=<YYYY-MM-DD>`（F4 默认 `view=latest`，必须显式传 `as_known`；cutoff = `asOf` 日终：判断 `registered_at ≤ cutoff`、结算 `settled_at ≤ cutoff`、校准 `computed_at ≤ cutoff`）。本页断言响应顶层 `view === 'as_known'` 且 `asOf` 等于请求值，否则不渲染判断区（显示"回放读取失败"）；契约测试用含"截止后才结算 / 截止后才校准"记录的录制夹具，断言这些结算与百分比在回放中不出现。无 `asOf` 时用 `view=latest`。
- F4 §9.4 要本规格给出的两个参数：分数凯利系数 `k = 0.25`（总纲 §2.2 给出 ¼–½ 区间，取保守端）；**星级映射本次不定义、不显示**（对方的"值博率星级"没有可复现定义，决策 K）。
- 事件 DTO（收件箱合并用）：F4 当前稿未定义；本规格 C5 等它。

原草案（**非规范**，只作为对 F4 的要求清单保留；本仓库不实现 `canShowPercent`，显示门槛以 F4 §§8–9 的 `calibration`/`display.percent` 为准）：

```ts
interface JudgmentCard {
  judgmentId: string;
  kind: 'thesis_checkpoint' | 'forecast' | 'recommendation' | 'rating';
  issuerId: string;
  claim: {zh: string; en: string};
  falsifiableCondition: {zh: string; en: string} | null;
  methodologyVersion: string;
  inputSnapshotId: string;                       // 可回放
  registeredAt: string; settlesAt: string | null;
  settlement: {ruleVersion: string; outcomeDefinition: {zh: string; en: string}; horizon: string} | null;
  status: 'open' | 'settled' | 'void';
  outcome?: {hit: boolean | null; settledAt: string; settleInputs: {factIds: string[]}};
  probability?: {p: number; calibration: {cohortId: string; policyVersion: string; appliesTo: {kind: JudgmentCard['kind']; horizon: string}; methodologyVersion: string; n: number; brier: number; evidenceRef: string} | null};
  visibility: 'private' | 'shared';
  version: {asOf: string; revision: number};   // F4 按 asOf 返回当时版本：outcome/calibration 晚于 asOf 的不出现
}
```

（以下谓词描述本页希望 F4 的 `display.percent` 门槛满足的条件，供 F4 核对，不在本仓库实现：）
`falsifiableCondition` 两种语言非空 ∧ `settlesAt !== null` ∧ `settlement` 非空且 `ruleVersion`、`outcomeDefinition.zh/en`、`horizon` 非空 ∧ `probability` 存在且 `p` 有限且 `0 ≤ p ≤ 1` ∧ `calibration` 非空 ∧ `calibration.policyVersion === policy.version` ∧ `calibration.methodologyVersion === card.methodologyVersion` ∧ `calibration.appliesTo.kind === card.kind` ∧ `calibration.appliesTo.horizon === settlement.horizon` ∧ `Number.isInteger(n) && n >= policy.minN(card.kind)`（`policy.minN` ≥ 1）∧ `brier` 有限且 `0 ≤ brier ≤ 1` ∧ `evidenceRef` 匹配 F4 规定的 URL/ID 形式。不满足 → "研究员信心（未校准）"与定性档位，不显示百分比。满足 → 百分比并列 `n`、Brier、`evidenceRef` 链接。`visibility='private'` 只对作者可见（F4 负责 RLS，本页按会话读）。接口：`GET /api/judgments?issuerId=&asOf=`（会话、`private, no-store`；`asOf` 返回当时版本的卡，结算与校准不得晚于 `asOf`）。目录页不显示判断计数。F4 落地前"判断"视图只有空状态（决策 A 默认），不显示 `recommendations`。F4 事件 DTO（稳定 id、租户范围、观察时间、已读语义）由 F4 定义后，本规格 C5 接入收件箱。

### 10.5 行业研究规格

`issuer_industry_memberships` 加载后：目录页行业筛选出现；页头加行业芯片（`scheme/version`）；同业表另立。

---

## 11. 错误处理

| 情形 | 行为 | 码 / 状态 |
|---|---|---|
| ticker 不合法 | 400 | `invalid_parameter:ticker` |
| 发行人不存在 | 404 | `unknown_ticker` |
| `asOf` 非日期或晚于今天 | 400 | `invalid_parameter:asOf` |
| `statement`/`basis`/`periods`/`cursor` 非法 | 400 | `invalid_parameter:<name>` |
| 读取被截断（公共路由） | 200 + `truncated=true`，`rows` 为空；回放事件 400 | `replay_truncated` |
| 规格二 `FactsDb` 抛错 | 500，`no-store`，日志不含值 | `internal` |
| 跟踪上限（触发器） | 409 | `watch_limit` |
| 未登录访问跟踪路由 | 401 | `not_authenticated` |
| `eventIds` 缺失、> 500、含不属于该发行人的 id | 400 | `invalid_parameter:eventIds` |
| 导入无服务端自选 | 409 | `no_server_watchlist` |
| 导入解析失败 ticker | 200，列于 `unresolved` | — |
| 证据 DTO 取不到 / `codeVersion` 空 | 服务端置 `withheld`，数值不进响应 | `evidence_incomplete`（网格汇总） |
| CN 事实 `citation=pending` 或无 `locator.pdf`（公共端点，不看会话） | 服务端置 `withheld` | `citation_pending`（网格汇总） |
| 事件 / 收件箱 / 指标代理 / packet / DCF 种子引用不合格事实 | 该值 `withheld`（指标整行、DCF 叶子不种子） | `evidence_incomplete` / `citation_pending` |
| `/api/companies/snapshot?fact=` 的哈希非 EDGAR 对象 | 403 | `not_redistributable` |
| 管理路由被非 admin 调用 | 401 / 403，`private, no-store` | — |
| DCF 股权桥缺事实且无用户确认；或 LLM 试图改写收入行 | 200 `status='unavailable'`，不运行引擎；后者丢弃并 `warnings` | `dcf_bridge_missing` / `dcf_revenue_line_rejected` |
| digest `stale_computation` | 同一 attempt 重读重算一次；再失败 `markDigestFailed`、退避 | `stale_computation` |
| digest `stale_attempt` | 该流跳过（更晚的尝试已成功） | `skipped_summary(stale_attempt)` |
| digest `read_truncated` | 该流 failed、退避 | `read_truncated` |
| digest `invalid_event` | 该流 failed、记错不退避（模块 bug） | `invalid_event` |
| digest `unknown_stream` | 该流跳过 | `skipped_summary(unknown_stream)` |
| digest 其他异常 | 该流 failed、退避；批次 partial | `digest_issuer_failed` |
| digest 截止 | 不再开始新流 | `deadline_hit`（信息；规格二落地前写 `detail`） |
| `code_version` 取不到 | 拒绝 apply | `code_version_missing` |
| 函数被非 service_role 调用 | 数据库拒绝 | 42501 |
| 迁移遇 `financial_history` 非空（删除迁移，决策 C 选删除时） | 迁移中止 | `financial_history_not_empty` |
| cron secret 缺失/错误 | 503 / 401 | — |
| 页面 fetch 失败 | 视图级错误卡 + 重试；页头仍显示发行人 | — |

---

## 12. 测试策略

### 12.0 夹具清单

（第 6 稿 §0 #72：`plan2.json` 未就绪，期望值以本模块人工抄录为准，未抄录项 `pending` 并跳过）`src/lib/company/fixtures/manifest.json`：列出所用规格二夹具文件（AAPL、MSFT companyfacts 裁剪；若 A 股夹具已录入则加 600519.SH）、录制时间、sha256，以及本规格断言的期望值。期望值来源必须独立于实现：事实值与可得日期取自 `fixtures/gold/plan2.json`（人从一手文件抄录）；`filing_published` 事件的期望列表（accession、form、filed）由实施者之外的人从 EDGAR filing index 抄录（§14 事件黄金集）；修订事件数由抄录的披露序列推出。实现运行结果只用于核对，不用于生成期望值。

### 12.1 单元（vitest）

- `events.test.ts`：三种事件数量与 key 确定性；同日同值无事件；迟到修订；中间插入（前、中、后三种位置）改变两条边；隔离移除 → 墓碑；提升 → 复活保留 `first_seen_at`；零事实 filing；映射代升级后 key 不变；两次运行逐字节相同。属性测试（种子随机 200 次）：`fact_revised` 数 = 各序列相邻值变化数之和。
- `coverage.test.ts`：计数、`citation_summary`、`scope_last_*` 复制。
- `statements-grid.test.ts`：三种口径、期间键、每行单位与 `U`、`periods` 裁剪、徽标、`truncated` 处理、`formatDecimalText`（20 位整数、小数、负数、除数）。
- `dcf-seed.test.ts`：全量种子、三处除数一致、CN `revenue_operating`、期末不对齐、`share_class` 五种值与多类别股本、单信封派生、叶子路径合并（LLM 不覆盖事实；`revenueLines[0].cagr` 为 llm 时 `baseRevenue` 仍为 fact）、**LLM 返回两行收入 → 第二行被丢弃、`revenueLines.length === 1`、引擎输入的收入合计等于事实值并有 `warnings`**、股权桥缺项 → `unavailable`、用户确认 → 运行。
- `inbox.test.ts`：keyset 分页（并列 `first_seen_at`）、回执按 id、分页外与过滤外的行不被标读、折叠、静音。
- `judgments-contract.test.ts`：对 F4 录制夹具（含截止后结算、截止后校准的记录）：请求含 `view=as_known&asOf=`，响应 `view/asOf` 不匹配 → 不渲染；截止后结算与百分比不出现；`calibration !== 'calibrated'` 时客户端防御不显示百分比。
- `digest.test.ts`（`memoryCompanyDb` + `memoryFactsDb`）：`digestDue`/`sweepDue` 选择与 80/20 配额、去重与 4:1 交错、`stale_computation` 重试、`stale_attempt` 跳过、`read_truncated`、`invalid_event`、退避、同版本 sweep 失败被记录且 `ok=false`、迟到失败在更晚成功后被忽略、截止时 sweep 已部分完成、`code_version` 缺失拒绝、批次计数按流（零变化 → `duplicates`，无 `unaccounted`）、同批次两次 replace 同一流（第二次省略事件 → 墓碑）。
- `evidence-gate.test.ts`：`evidenceEligible` 每个不合格条件单独为假（缺 DTO、空 `codeVersion`、EDGAR 缺 `rawHash`/`jsonPointer`、CN 缺 `sourceDocument`、CN 缺 `locator.pdf`）；对报表格、派生格 `inputs`、事件 headline/`from/to`/`relChange`、指标行、packet、抽屉序列、DCF 叶子各一例"不合格 → `withheld`"。
- 路由测试（录制夹具）：`statements/events/metrics/packet/companies/overview/freshness` 参数校验、缓存头、`truncated`、`statement=CF`、`basis=quarterly` 对 BS 400、每个响应的 `evidence` 字典与 `withheld` 计数；**共享缓存夹具**：admin 会话请求公共 URL 后匿名请求同一 URL，两者都不含 pending-CN 值；`/api/admin/companies/*` 对非 admin 401/403、对 admin 含 pending-CN 值且 `private, no-store`；`/api/companies/snapshot?fact=` 对 EDGAR 哈希 302 + `no-store`、对 Tushare 哈希 403、对 60 s 之前的响应里的 `download` 仍可下载、过期后重复下载成功；`tracking/*` 的 401、`private, no-store`、`eventIds` 校验、导入；`cron/company-digest` 鉴权；`dcf` 的叶子 `provenance`、`unavailable`、`evidence_incomplete` 叶子；`packet` 的 `clipped` 与大小上限；批次计数经真实 `finishBatch`：全 `stale_attempt` 批次与混合批次无 `unaccounted` 且 `fetched` 等于五项之和。
- i18n：`MESSAGE_DOMAINS` 增 `company`、`tracking`；`messages-parity.test.ts` 的域循环与占位符检查加这两个域。

### 12.2 数据库（`test:db`，critical）

`src/lib/company/company-research.integration.test.ts`（含 `S4_TEST_STATE`，加入 `criticalSuites`）：迁移可重放两遍；唯一约束与外键；`replace_company_digest`：`stale_computation`、`stale_attempt`、`unknown_stream`、`invalid_event`（多余键、`meta` 多余键、跨流 filing、非 `ok` 事实、旧映射代事实、`available_date` 晚于今天、值不等于 `value_text`）、服务端算出的 `event_id/payload_hash` 与 TS 实现一致、墓碑/复活/`first_seen_at`、`payload_changed_at` 只在哈希变化时更新、同批次两次调用不同 `rebuild_id` 的退役、`p_sweep` 写 `swept_at`；**交错测试**（两个 pg 连接）：(a) 会话 1 模拟规格二发布（对 `fact_sync_scope` 行 `for update` 并递增 `state_rev`，未提交），会话 2 的 replace 阻塞，会话 1 提交后会话 2 以旧 `p_based_on_rev` 被拒；(b) 两个 digest 会话对同一流提交**不同**事件集（模拟 `EVENTS_VERSION` 变更）：后者阻塞到前者提交后才执行，最终 `issuer_events` 活动行恰等于后者集合、`issuer_coverage` 与之一致，没有并集；(c) 写间故障注入：在事件 upsert 之后、覆盖 upsert 之前抛错（用测试专用的 `set_config('company.fail_after_events','on')` 开关，仅集成测试构建启用）→ 事务回滚，事件与覆盖都保持旧值；(d) 回执迟提交：会话 1 插入事件未提交，会话 2 读收件箱并按返回 id 标读，会话 1 提交后该事件仍未读。`begin/mark/replace` 的尝试归属：同版本 sweep 失败被记录、更晚尝试成功后的迟到失败报告被忽略、退避封顶；**两种完成顺序**（#58）：(e) 尝试 1 开始、尝试 2 开始、尝试 2 失败、尝试 1 成功 → 物化被记录（`digested_rev`、`last_success_attempt_id`）但 `last_status` 仍为 `failed`、退避与 `consecutive_failures` 保留、`swept_at` 不推进、`backlogFailed > 0`；(f) 尝试 1 开始、尝试 2 开始、尝试 2 成功、尝试 1 失败报告 → 被忽略（返回 false），状态为 success；触发器 `watch_limit` 在并发插入下不超限且已存在键放行；`company_event_reads` 跨发行人 id 被拒、取消跟踪级联清回执；真实角色：三类角色对公共表直接写被拒、anon 读两张按用户表被拒、A/B 隔离、anon/authenticated 执行函数被拒；决策 C 选删除时另测 `financial_history` 守卫（有行中止、锁后检查）。

### 12.3 端到端（Playwright，`e2e/company.spec.ts`）

前提：登录夹具账号（`e2e/authed.spec.ts` 机制）与已回放美股夹具的数据库。C1 的退出要求**可复现的自动化浏览器证据**：CI 不可行时（决策 I），实施者在本机对回放数据库运行本套件并把 Playwright 报告（含截图与 trace）附在 PR 中，由复审者复跑一次；手动清单不算完成。
1. `/stock/AAPL` 页头：`names.en`、证券芯片、CIK、数据状态。
2. `?view=statements`：IS 网格有 revenue 行；点格开抽屉含可得日期、EDGAR 链接、变换链、代码版本。
3. `?view=statements&asOf=2024-06-30`：回放条；同格 `disclosureSeq=1`；估值模型区隐藏。
4. `?view=metrics`：gross_margin 行；公式抽屉含 `formulaVersion`。
5. `?view=filings`：有 `10-K`，徽标 `edgar`。
6. `?view=overview`：按决策 J 默认断言页面不含 K 线与行情行；若 owner 批准例外，则断言 K 线"表格视图"数值与图数据一致（读 `window.__klineSeries` 测试钩子）。
7. `/stock/00700.HK`：F3 缺失文案。
8. 跟踪：点"跟踪"→ `/watchlist/tracking` 列出；"标记已读"后未读归零；移除后消失。
9. `/intel/companies`：含 AAPL；`market=US` 仍含；`q=AAP` 命中。
10. `/stock/ZZZZ`：未知状态。
11. 语言：通过设置页切 `NEXT_LOCALE` 为 en 后公司页页签与抽屉标签为英文。

### 12.4 清单规则

含 `S4_TEST_STATE` 的新文件进 `criticalSuites`；`verifyCriticalSuiteInventory` 无漂移；全部门禁绿才算完成。

---

## 13. 分期

人日为**估算假设**，在 C0 的契约对齐（§10.1）完成后重估。

| 工作包 | 交付 | 退出条件 | 人日（假设） |
|---|---|---|---|
| C0 适配器、迁移与物化 | §0.1 适配器（证据索引、`company_read_snapshot`、`company_fact_evidence`、指标目录）；迁移（五表、两函数、两个触发器、权限）、锁文件、types、`CompanyDb` 三实现、`events/coverage/digest.ts`、cron、脚本、`vercel.json`、12.2（含交错测试） | §0.1 适配器契约测试通过；`test:db`、`test:migrations` 绿；美股夹具两遍物化一致 | 4.5 |
| C1 公司页 | 服务端 `page.tsx`、页头、流切换、回放条与矩阵、报表/指标/文件/概览视图、两个抽屉、K 线表格视图、`statements/overview/events/freshness` 路由、`company.json` zh/en、mock 不再渲染、行情比率移除 | §1.1 前三条；路由测试；e2e 1–7、10、11（可行时） | 5 |
| C2 读者迁移 | `dcf-seed.ts`、`/api/dcf` 改造与逐字段来源、`packet` 路由、`financials` 工具、method 措辞、删 `useFinancials`、consensus mock 关闭、决策 B 的退役提交 | `/api/dcf/AAPL` 有 `fact` 来源字段；`grep` 验证 | 2 |
| C3 跟踪 | `company_watches` 路由、`/watchlist/tracking` 页、公司页跟踪视图、导入、`tracking.json` | e2e 8；RLS 与上限集成测试 | 2.5 |
| C4 目录 | `/api/companies`、`/intel/companies` 页、`/intel` 入口卡 | e2e 9 | 1 |
| C5 判断区 | 按 §10.4 接 F4（F4 落地后）；之前只有空状态与 `canShowPercent` | 契约测试（录制 F4 响应夹具） | 1 |
| C6 收尾 | `docs/runbooks/company-research.md`、回归对照样本、§17、Codex 复审 | 全量门禁绿 | 1 |

顺序：C0 在规格二 F2-6 之后；C1–C4 在 C0 之后可并行；C5 等 F4。合计约 17 人日（假设）。

验收样例：
1. AAPL 报表回放（§1.1 第一条）。
2. 600519.SH 文件视图 `citation` 徽标；`pending` 年报的单元格显示 `!`。
3. 注入修订夹具并发布后跑 digest：收件箱出现一条"修订"事件，`first_seen_at` 为本次运行时间，`occurred_on` 为修订文件可得日期；再隔离该行 → 事件墓碑；提升 → 复活且 `first_seen_at` 不变。
4. 用户 B 看不到 A 的 watch 与回执；anon 调 `replace_company_digest` 被拒；并发插入第 201 个 watch 被触发器拒绝，而重复插入已有 watch 返回 200。
5. 断网跑 digest：批次 failed，`issuer_events` 不变，`digested_rev` 不推进，`next_attempt_at` 退避；之后空转运行的新鲜度 `ok=false`。同一 `state_rev` 下 sweep 失败（例如证据登记缺失）同样记录并使 `ok=false`，直到该流再次成功。
6. `/api/dcf/600519.SH`：`provenance['revenueLines[0].baseRevenue'] = fact`（`revenue_operating`），`netDebt` 的 `basis = cn_incl_bonds`，除数 1e8 三处一致；`/api/dcf/AAPL` 在 `share_class='unknown'` 下 `status='unavailable'`。
7. 发布与物化交错：规格二发布事务未提交时物化阻塞，提交后旧版本物化被拒；两个 digest 工作者对同流提交不同事件集时因 `for update` 串行，活动事件集恰等于后提交者的集合（无并集），`based_on_rev` 等于当前 `state_rev`。
8. 收件箱标记当前页已读后，分页外与迟提交的事件仍为未读。

---

## 14. 独立验证

- Codex（gpt-6-astra，medium）：两轮（01、02）与处置（03）；每个工作包提交再审。
- 回放一致性：规格二黄金断言 6 家 × 2 期 × 6 科目在报表网格逐格一致（路由测试）。
- 事件黄金集：AAPL 最近 10 份 filing 的 `filing_published` 与 EDGAR filing index 人工逐条核对（可得日期、form、accession），`docs/audits/2026-11-04-company-research/events-gold.md`。
- 专家抽样：一位有财务背景的人看 AAPL、600519.SH、000333.SZ 的报表视图与 DCF 种子标注，核对"营业总收入/营业收入"、"capex 含无形"、"股利含利息"、"在外股数非稀释"、"净债务口径"五处是否会误导，记录在 `expert-sampling.md`。
- 无障碍：网格与抽屉键盘可达（Tab/Enter/Esc），e2e 断言焦点顺序。
- 对方回归对照（信息性）：§3。

---

## 15. 环境与 owner 事项

| 事项 | 谁 | 何时 | 默认 |
|---|---|---|---|
| **决策 A**：F4 落地前"判断"视图是否把本人 `recommendations` 作为"历史记录（非判断层）"列出 | owner | C5 前 | 否（只有空状态） |
| **决策 B**：`/api/financials/[ticker]` 在 C2 后立即删除，还是保留一个发布周期 | owner | C2 前 | 保留一个发布周期后删除 |
| **决策 C**：`financial_history` 本次保留（默认）还是在 owner 提供部署证据（生产行数为 0、无外部消费者）后按 §4.5 带锁守卫删除 | owner | C0 前 | 保留 |
| **决策 D**：`/api/consensus/[ticker]` 关闭 mock 回退；公司页 `news` 页签退役 | owner | C2 前 | 关闭、退役 |
| **决策 E**："AI 观点"页签改名"模型观点（未校准）"并去掉"共识 x.x"数字 | owner | C1 前 | 改 |
| **决策 F**：`MAX_COMPANY_WATCHES = 200`（假设值） | owner | C3 前 | 200 |
| **决策 G**：跟踪视图是否显示 Tushare `disclosure_date` 的"预计披露日"（无快照与回放链） | owner | C3 前 | 不显示 |
| **决策 H**：目录页是否对非登录用户开放 | owner | C4 前 | 需登录 |
| **决策 I**：e2e 在 CI 中对回放数据库运行的可行性与夹具账号；不可行时 PR 附本机 Playwright 报告并由复审者复跑 | owner | C1 前 | 本机报告 + 复跑 |
| **决策 J**：公司页是否保留行情行与 K 线（行情链路无回放契约，总纲 §5 无例外）：默认移除直到行情规格给出回放契约；或 owner 书面批准总纲例外（保留并标注来源与更新时间，K 线加表格视图） | owner | C1 前 | 移除 |
| **决策 K**：F4 §9.4 派生判断的本规格参数——分数凯利 `k = 0.25`（总纲 §2.2 的 ¼–½ 区间取保守端）；星级映射本次不定义不显示 | owner | C5 前 | `k = 0.25`，无星级 |
| Tushare 响应原文的再分发条款：决定 admin 之外能否下载原始快照字节（§5.6 证据 DTO 只给元数据与定位） | owner | C1 前 | 仅 admin |
| 规格二决策 C（A 股事实核对前是否公共可见）影响 `pending` 徽标频率 | owner | 规格二 | 可见并带 `citation` |
| 生产执行迁移；首轮 `scripts/company/digest.ts --full --apply`；cron 与脚本不同时运行 | owner | 合并后 | — |

---

## 16. 开放问题（实施前核对）

1. 规格二 §10.1 七点的落地形状与书面接受。
2. 首轮范围内是否存在同一发行人两路事实的真实案例（否则双流页头只能用合成夹具测试）。
3. `statements` 路由单次 `readFacts`（IS 约 14 概念、`history:false`）与 `quarterly`（`history:true`）在 hnd1 对 Supabase 的实测延迟：C1 第一周测量后决定是否需要规格二提供按报表的预聚合。
4. digest 吞吐实测：每小时 200 流配额下，首轮全量与日常增量的实际完成时间，据此确认或修改 §6.3 的 1 小时 / 7 天目标。
5. 历史 `asOf` 响应的 CDN 缓存（`s-maxage=3600`）与隔离裁决导致历史答案变化：是否接入 `/api/cache/revalidate` 的路径级失效。
6. 港股 `market` 枚举扩展时两边迁移的顺序（F3 先于本规格扩展 check，或同一迁移）。
7. 行情规格何时给出价格与 PE/PB 的可回放定义（价格快照 × 事实 EPS/BVPS），届时行情行、K 线与速览比率可按决策 J 加回。
8. 规格二快照 `meta.json` 的可查登记形式（表或列）——证据 DTO 的前提。

---

## 17. 实施记录与偏差

（落地后补记，格式同规格一 §14。）

---

## Claude Design 画布

画布：[公司研究与跟踪 Company Research](https://claude.ai/artifact/RTWzyyWQikDPCdD8VaBLsv)（2026-11-04；12 个画板：桌面 9、移动 3）。画布为私有，owner 从页面 Share 菜单共享后其他人才能打开。

本规格没有单列“待设计清单”，画板按 §5、§7.3、§8 与分期 C3 推出：

| 来源章节 | 画板 |
|---|---|
| §5.2 页头、§5.3 报表视图（徽标 R / n / U、withheld 计数、迷你柱、CSV） | 公司页 · 报表视图 |
| §5.10 回放矩阵（回放条、各视图回放行为） | 回放态 |
| §5.4 指标视图与估值模型区（股权桥门控） | 指标视图 + 估值模型区 |
| §5.5 文件视图（引用徽标、挂接失败、F3 预留） | 文件视图 |
| §5.8 概览、§5.1 双披露流切换、决策 J | 概览 · 双披露流 |
| §5.6 披露历史抽屉、公式抽屉、概念说明 | 披露历史抽屉 / 公式抽屉 / 概念说明；移动 · 披露历史 |
| §5.7 缺失与特殊状态、§10.4 判断视图空态与回放失败 | 缺失与特殊状态 |
| §6.2 / §7.3 跟踪收件箱（未读、同日折叠、已更新、导入结果、静音） | 跟踪收件箱；移动 · 收件箱 |
| §8 覆盖目录 | 覆盖目录 |
| §5.9 移动端（芯片与页签横滑、首列冻结、底部抽屉） | 移动 · 公司页 |

约定：只用 `DESIGN.md` / `globals.css` tokens（黄铜唯一强调色，无紫色、无渐变）；公共端点上证据不完整的值只显示原因与计数；每个数字是打开抽屉的按钮；画布上的数值均为版式示意。偏差待 owner 确认：三级文字用 `#8b8b94` 代替 `#52525b`（对比度）。
