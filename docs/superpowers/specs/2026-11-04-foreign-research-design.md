# 外资研报模块 · 设计规格

日期：2026-11-04（第 1 稿；审计轨迹：`docs/audits/2026-11-04-foreign-research/`）
状态：草案，待 owner 评审（§15 有六项 owner 决策；其中 D1 许可确认是本模块任何对外功能的前置条件）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一：发行人、DQ 层，已落地，§14 为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二：披露事实库、`/api/facts/[ticker]`）；`docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`（前向评分内核）。并行规格：文档管道 F3、判断框架 F4、评测 F6、计划三（标识符与对账）——依赖接口见 §11。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §3 与 §5。本规格逐条对照其硬约束：
- 约束 1（只用一手来源）：研报原件只来自 owner 合法持有的 PDF，由管理员上传；不抓取任何付费墙或对方网站；Tushare `report_rc` 只作对账适配器（§6.6），不生成任何研报行。
- 约束 2（每个数字可回放）：每个字段带 `document_id`（sha256）、`page`、`char_start/char_end`、`extractor_version`、`available_at`（我方入库时间）与 `code_version`；引用跨度必须在页文本中逐字命中（§7.1 R1），否则不发布。
- 约束 3（事实与判断分层）：机构、分析师、评级标签、目标价、币种、报告时价格、发布日期是**文件事实**；标准化评级、涨跌空间、行业归属、翻译标题、独立摘要是**派生物**（带版本与输入哈希）；机构 / 分析师命中率是**判断**，只经 F4 登记—结算—校准后显示（§10）。
- 约束 4（缺失就是缺失）：报告没写目标价就没有目标价；没有 WACC 就不显示方法论行；不用 `report_rc` 的区间去补文件里没有的数。
- 约束 5（原文私有）：PDF、全文、表格、页面图像只在私有桶与 service_role 可达的表里；对外只有元数据、独立摘要、≤ N 字引用片段；签名 URL 只发给管理员并逐次记录；**许可确认（D1）先于任何对外发布**。
- 约束 6（UI）：遵守 `DESIGN.md` / `globals.css` tokens，zh/en 双语，图表有表格等价视图；视觉稿后续在 Claude Design 画布完成（§9.6 清单）。

---

## 1. 目标与非目标

### 1.1 目标

1. **私有馆藏。** 管理员上传合法持有的研报 PDF，每份文件绑定一条许可记录；文件以 sha256 内容寻址存入私有桶，永不对外分发。
2. **可回放的结构化元数据。** 机构、分析师、发行人（经规格一 `resolveIssuer`）、发布日期、评级（原始标签 + 版本化映射）、目标价 / 币种 / 期限、报告时价格、估值方法参数（WACC、永续增长率、终值占比，若报告写明）。每个字段带页码与逐字引用跨度，经管理员逐字段复核后才可发布。
3. **独立摘要是派生物。** 由 LLM 基于抽取文本生成，记录模型、注册表快照、提示词版本、输入哈希；页面上恒定标注"OsbornAlpha 独立摘要（AI 生成，非机构原文）"，与机构原话（引用片段）在视觉与数据结构上分离。
4. **公开页面只读、可核。** `/intel/foreign-research` 列表与详情：元数据 + 独立摘要 + ≤ N 字引用片段（带页码）+ 来源抽屉；机构 / 发行人维度的评级与目标价历史（跨机构分歧）；与 `/stock/[ticker]` 联动。
5. **命中率是判断。** 机构 / 分析师的目标价轨迹与后验表现经 F4 登记与结算；F4 未落地前页面只显示"评级 / 目标价历史（事实）"，不显示任何命中率或百分比。

成功标准（本模块退出条件）：
- 一份管理员上传的 PDF：`sha256` 唯一；重复上传返回 `409 duplicate_document` 且桶内只有一份；匿名客户端对 `broker_report_documents`、`broker_report_fields`、`broker_report_licences`、`broker_report_access_log` 的 `select` 全部被拒（真实角色集成测试）。
- 对该 PDF 运行抽取后，每个 `confirmed` 字段的 `(page, char_start, char_end)` 切出的文本与 `value_source_text` 逐字相等；任一不等的字段状态为 `unverified`，含有 `unverified` 必填字段的报告不能进入 `published`（数据库触发器拒绝）。
- 许可记录 `allows_public_metadata=false` 或未确认时，对应报告的 `publish` 被触发器拒绝；`allows_public_target_price=false` 时公开视图中 `target_price`、`upside_pct` 为 `null`，而 service_role 读基表仍有值。
- 公开视图中每条片段 `length(text) <= licence.snippet_max_chars`；独立摘要与原文的最长公共子串长度 ≤ 同一上限（§7.1 R9），否则摘要不能 `approved`。
- `GET /api/broker-research/reports/[id]` 返回的每个数值字段都带 `{page, snippetId?}`，前端来源抽屉能按页码定位；响应不含任何全文、表格或存储路径。
- 黄金集（30 篇真实报告，私有，§12.4）字段级 precision / recall ≥ 0.95 才允许开启"抽取后自动进入复核队列"；低于阈值时抽取结果只写 `extracted`，不进复核队列（总纲 §3.5）。
- 含 `S4_TEST_STATE` 的集成测试文件已列入 `scripts/ci/research-checks.ts::criticalSuites`，全部门禁绿。

### 1.2 本规格之外

- 任何自动抓取（券商门户、终端、对方网站、邮件附件自动导入）。本模块的唯一入口是管理员手工上传。
- 对外提供 PDF 下载、全文检索、页面图像、表格数据（包括登录用户）。
- 盈利预测数字（EPS / 营收 / 净利预测）的结构化抽取：报告里的预测表通常跨多页多列，本期只抽封面级字段与方法论参数；预测表进入后续阶段（§16 开放问题 3）。
- 把研报里引用的财务数字与规格二 `financial_facts` 自动对账（总纲 §3.3"报告与事实对账"）：需要先有预测表抽取；记为后续阶段。
- 替换 `/stock/[ticker]` 的 `broker_reports` mock 数据与 `/api/consensus/[ticker]` 的 mock 回退（§2 现状 4）：本规格只新增"馆藏研报"读路径；mock 的去留是 owner 事项 O7。
- 非 PDF 格式（HTML 研报、Excel 模型）。
- 多租户：馆藏只有一个（owner 的），管理员是 `profiles.role='admin'` 的用户；不做按用户隔离的多馆藏。
- 自建 PDF 版面解析：由 F3 文档管道提供（§11.1）；本规格只消费其输出。
- 基准相对收益（相对指数的超额）：需要指数序列，F4 落地后与宏观 / 行业规格对齐；本期结算只用绝对前向收益与"目标价是否触及"。

---

## 2. 现状（2026-11-04，已核对仓库）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 1. 旧表 `broker_reports` | `supabase/migrations/20260515000000_initial_schema.sql`：`user_id` 租户表，列 `ticker, broker, rating, target_price text, target_change_pct, pdf_url, ai_summary, published_at, fetched_at`；`20260904090000` 加 `source_key, title, source, trust_score`；RLS 自读自写；被 `watchlist_alert_research_candidates` / `watchlist_research_summaries` 两个函数读取 | **不复用、不改名、不迁移**。新表前缀 `broker_report_*` / `broker_research_*`，与旧表无外键。旧表在 §16 开放问题 6 记录处置 |
| 2. 页面读者 | `src/app/(app)/stock/[ticker]/page.tsx` 第 52–53、321–345 行渲染 `stock.broker_reports`，数据来自 `src/lib/data/mock.ts`（内嵌 mock 行）与 `src/lib/stocks/detail.ts`（返回空数组） | 新增"馆藏研报"块读公开视图（§9.4）；mock 去留见 O7 |
| 3. 共识接口 | `src/app/api/consensus/[ticker]/route.ts`：A 股 + `TUSHARE_TOKEN` → `fetchTushareReportRc`（`src/lib/data/sources/tushare.ts` 553–602 行，字段 `org_name, author_name, rating, max_price, min_price, report_date, imp_dg…`，需 5000 积分）→ `deriveConsensus`（`src/lib/stocks/consensus.ts`，中点取中位数）；否则 mock 回退 | `report_rc` 的定位见 §6.6：对账适配器，非来源 |
| 4. 文档摄入 | `src/lib/research/ingest/collectors/{edgar,cninfo,hkexnews}.ts`：公开披露采集；`write.ts::ingestVersioned` 按 URL 版本化；`sources.ts::ingestSource` 写 `research_source_documents`（`user_id` 租户、`raw_text` 不可变、`content_hash` 唯一、`permission ∈ {public, licensed, private}`、`origin_type` 含 `analyst_or_media`） | 不把研报写进 `research_source_documents`（租户表、全文入库、`source_type` 枚举无研报）。可选：发布后为 owner 的 Research OS 建一条 `permission='licensed'`、`raw_text` 为独立摘要的 `MANUAL` 来源（§6.5，默认关闭） |
| 5. 发行人解析 | `src/lib/entities/resolve.ts::resolveIssuer(client, {ticker\|cik\|lei\|isin}, {today})`，每次一个标识符；`issuers`、`issuer_securities(ticker, valid_from, valid_to, is_primary)`；`industry_classifications` | 报告里的标的代码经 `tickerCandidates` 解析为 `issuer_id`；多代码（如 `BABA US / 9988 HK`）逐个解析，必须落到同一 `issuer_id`，否则进复核（§7.1 R10） |
| 6. 质量设施 | `startBatch/finishBatch`（六计数器、`INFO_CODES=['skipped_summary','relink']`）、`quarantine()`（同键 open 唯一）、`recordAttempt`（cadence 含 `event`）、`rules.ts`（`rangeRule/identityRule/jumpRule/unitRule` 不抛异常）、`dq_reconciliations`（有表、无写入者） | 复用；dataset `broker_research`；新增信息码见 §7.4 |
| 7. 隔离处理 | `POST /api/admin/dq/quarantine/[id]`：`requireAdminUser`、Content-Type 与 Origin 校验、`resolveQuarantine`、`research_audit_log` | 同模式；本模块隔离项的处理钩子见 §7.3 |
| 8. 管理员 | `requireAdminUser()`（`profiles.role='admin'`）；`/admin/{dq,securities,usage}` 页面模式（`AdminForbidden` 渲染拒绝、`AdminUnauthenticated` 跳 `/login?next=`） | 新页 `/admin/broker-research` 同模式 |
| 9. 存储 | 私有桶 `security-snapshots`（`insert into storage.buckets … on conflict do update`，`public=false`，`file_size_limit=52428800`，`allowed_mime_types`）；仓库内**没有** `createSignedUrl` 调用 | 新桶 `broker-research` 同法；签名 URL 首次引入，只在管理员路由（§8.2） |
| 10. 前向评分 | `src/lib/scoring/forward.ts::scoreForward(call, bars)`：以调用日所在交易所日期后的第一根 K 线收盘为基准，5/20/60 交易日前向收益；K 线来自 `fetchEastmoneyKline`（东方财富适配器）；`recommendation_scores` 记 `base_close/base_date` | 命中率结算的价格链路（§10.2）；东方财富是适配器，结算行记录 `price_source='eastmoney:kline'` 与复权方式 |
| 11. LLM | `src/lib/llm/resolve.ts::resolvePlatformLlm()`；注册表快照 `src/lib/llm/registry/{models,providers}.json`；`ajv@8.20.0` 在依赖中；**没有** PDF 解析依赖 | 抽取与摘要记录 `model_id` + 注册表快照哈希；JSON Schema 用 ajv 校验；PDF 解析由 F3 引入 |
| 12. cron | `vercel.json` 六个 cron；路由用 `CRON_SECRET` Bearer + `timingSafeEqual`；`maxDuration=300`；区域 hnd1 | 本模块没有定时采集（上传驱动）；只有一个可选 cron 做结算刷新（§10.3），F4 落地后再登记 |
| 13. 测试门禁 | `scripts/ci/research-checks.ts::criticalSuites` 列出全部含 `S4_TEST_STATE` 的套件，`verifyCriticalSuiteInventory` 比对 | 新集成测试必须加入 |
| 14. 迁移 | 最新已锁 `20261105091000_issuers.sql`；规格二预定 `20261106090000_financial_facts.sql`；`database.types.ts` 手工维护 | 本规格迁移 `20261107090000_broker_research.sql`（晚于 20261106090000；若与并行规格撞号，实施时顺延并记入 §17） |
| 15. i18n | `messages/{zh,en}/{intel,admin,…}.json` + `src/i18n/messages-parity.test.ts` | 新增 `intel.foreignResearch.*`、`admin.brokerResearch.*` |
| 16. 对方页面 | `REPORT.md` 第 58 行：外资研报页"客户端资源有机构报告目录、评级、目标价、PDF 元信息与可视化入口"；总纲 §3.1：301 篇一页纸（机构、行业、评级 OW/MIXED/N/A、中英标题、当前价 / 目标价 / 空间、报告定位、核心结论、方法论 WACC/g/终值占比、风险与边界、标的代码与日期、分类计数）；`PAGE_INVENTORY.csv`：HTML 壳层，交互未验证 | 只作功能参考；§3 逐项分类；不导入任何数据 |

---

## 3. 对方页面字段分类（事实 / 派生 / 判断）

| 对方展示项 | 分类 | 本规格落点 | 说明 |
|---|---|---|---|
| 机构 | 文件事实 | `broker_report_fields.institution` → `research_institutions` | 封面抬头；机构实体由管理员在复核时绑定 |
| 分析师 | 文件事实 | `broker_report_analysts` | 封面署名；对外显示与否是 D4 |
| 评级（OW / MIXED / N/A） | 原始标签是事实；标准化是派生 | `rating_raw`（逐字）+ `rating_normalized`（按 `research_rating_scales` 版本映射） | "MIXED"不是机构评级而是对方的汇总标签：不做 |
| 中英标题 | 原文标题是事实；译名是派生 | `title_original` + `title_zh/title_en`（LLM 译，带模型版本，标注"译"） | |
| 当前价 | 派生（我方行情链路） | 详情页由 `/api/quote` 链路实时取，标注来源与日期 | 不是文件事实；与"报告时价格"分列 |
| 目标价 | 文件事实 | `target_price, target_currency, target_horizon_months` | 对外显示与否是 D3 |
| 空间 | 派生（算术） | `upside_pct = target_price / price_at_report − 1`，`formula_version='upside/1'`；报告自身写了空间则做恒等校验（R2） | |
| 报告定位 / 核心结论 | 派生（LLM） | `broker_report_summaries`（`independent_summary`） | 恒定标注 AI 生成 |
| 方法论（WACC、g、终值占比） | 文件事实（若写明） | `fields.wacc / terminal_growth / terminal_value_share` 带页码 | 没写就缺失；不从其他报告推 |
| 风险与边界 | 文件事实（引用片段）+ 派生（摘要段） | `broker_report_snippets(purpose='risk')` + 摘要 | 片段 ≤ N 字 |
| 标的代码与日期 | 文件事实 | `ticker_as_stated[]`、`published_date`、`price_as_of_date` | 代码经规格一解析为 `issuer_id`（派生，带 `mapping_gen`） |
| 行业 | 派生 | 单标的：`industry_classifications`（规格一）；行业 / 宏观报告：`sector_as_stated`（事实） | 不手工归"科技 / 消费 / 医药"四类 |
| 分类计数 | 派生（聚合） | 列表页按筛选条件 `count` | |
| 命中率 / 准确率 | 判断 | F4（§10） | 未结算不显示 |

---

## 4. 数据模型

迁移 `supabase/migrations/20261107090000_broker_research.sql`，可重放（`create table if not exists`、`do $$ … $$` 建约束与策略）。所有基表 **只授 service_role**；公开读一律经 §4.9 视图。`database.types.ts` 手工补齐。

### 4.1 `broker_report_licences`（许可记录）

| 列 | 类型 / 约束 | 说明 |
|---|---|---|
| `licence_id` | uuid PK | |
| `source_label` | text not null, 1–120 字 | 如"某终端订阅 · 账户持有人 X" |
| `licence_kind` | text check in (`terminal_subscription`,`direct_from_broker`,`owner_authored`,`other`) | |
| `holder` | text not null | 持有人（owner 或其机构） |
| `terms_summary` | text not null | 条款摘要（人写），含分发限制条款原文位置 |
| `evidence_path` | text | 私有桶内许可证据（合同 / 邮件 PDF）路径，`broker-research/licences/{sha256}.pdf` |
| `allows_public_metadata` | boolean not null default false | 元数据可公开 |
| `allows_public_snippets` | boolean not null default false | 引用片段可公开 |
| `allows_public_target_price` | boolean not null default false | 目标价可公开（D3） |
| `snippet_max_chars` | integer not null check (>0 and ≤ 500) | 片段上限 N（D2）；数据库硬上限 500 为提案值 |
| `valid_from` / `valid_to` | date / date null | |
| `confirmed_by` / `confirmed_at` | uuid / timestamptz | **owner 确认**；null 表示未确认 |
| `created_at`, `updated_at` | timestamptz | |

约束：`confirmed_at is null or confirmed_by is not null`；`valid_to is null or valid_to > valid_from`。`allows_public_snippets` 为真时 `snippet_max_chars` 必须有值（not null 已保证）。

### 4.2 `broker_report_documents`（私有文件）

| 列 | 类型 / 约束 |
|---|---|
| `document_id` | uuid PK |
| `sha256` | text not null unique, `~ '^[0-9a-f]{64}$'` |
| `storage_path` | text not null unique；固定 `reports/{sha256}.pdf` |
| `byte_size` | bigint not null check (> 0) |
| `mime_type` | text not null check (= 'application/pdf') |
| `page_count` | integer null check (> 0)；F3 回填 |
| `licence_id` | uuid not null references `broker_report_licences` on delete restrict |
| `uploaded_by` | uuid not null（管理员 `auth.users.id`） |
| `uploaded_at` | timestamptz not null default now()；即 `available_at` |
| `original_filename` | text null（只存文件名，不含路径） |
| `extraction_version` | text null；F3 `extractor_version`，如 `f3-docling/1.0` |
| `extraction_path` | text null；`reports/{sha256}.extract.{extraction_version}.json` |
| `status` | text not null check in (`uploaded`,`extracted`,`extraction_failed`,`withdrawn`) |
| `withdrawn_at`, `withdrawn_reason` | timestamptz / text |

触发器：`status='withdrawn'` 时所有引用该文档的报告自动 `withdrawn`（§4.3）。文档行**永不删除**（许可审计需要），撤回只改状态；桶内对象是否物理删除由 owner 在撤回时选择（§8.2 `purge=true`，写访问日志）。

### 4.3 `broker_research_reports`（报告元数据）

| 列 | 类型 / 约束 | 分类 |
|---|---|---|
| `report_id` | uuid PK | |
| `document_id` | uuid not null references `broker_report_documents` on delete restrict | |
| `scope` | text check in (`single_issuer`,`multi_issuer`,`sector`,`macro_strategy`) | 事实 |
| `institution_id` | uuid references `research_institutions` | 事实（绑定） |
| `issuer_id` | uuid references `issuers`；`scope='single_issuer'` 时 not null（check） | 派生（解析） |
| `issuer_mapping_gen` | integer null | 解析时 `mapping_gen`（规格二约定） |
| `ticker_as_stated` | text[] not null default '{}' | 事实 |
| `title_original` | text not null | 事实 |
| `title_lang` | text check in (`en`,`zh`,`ja`,`other`) | 事实 |
| `title_zh`, `title_en` | text null | 派生（译） |
| `title_translation_model` | text null | 派生元数据 |
| `published_date` | date not null | 事实 |
| `price_as_of_date` | date null | 事实 |
| `report_type` | text check in (`initiation`,`update`,`earnings_review`,`rating_change`,`target_change`,`sector`,`macro_strategy`,`other`) | 事实（封面用语）/ 管理员判定 |
| `sector_as_stated` | text null | 事实 |
| `rating_raw` | text null | 事实 |
| `rating_scale_version` | text null | 派生输入 |
| `rating_normalized` | text null check in (`buy`,`overweight`,`neutral`,`underweight`,`sell`,`not_rated`) | 派生 |
| `target_price` | numeric null check (> 0) | 事实 |
| `target_currency` | text null `~ '^[A-Z]{3}$'` | 事实 |
| `target_horizon_months` | integer null check (> 0) | 事实（报告写明；常见 12） |
| `price_at_report` | numeric null check (> 0) | 事实 |
| `price_currency` | text null | 事实 |
| `upside_pct` | numeric null | 派生 |
| `upside_formula_version` | text null | 派生 |
| `extraction_batch_id` | uuid references `ingest_batches` | |
| `review_status` | text not null check in (`pending`,`in_review`,`approved`,`rejected`) | |
| `reviewed_by`, `reviewed_at` | uuid / timestamptz | |
| `status` | text not null check in (`draft`,`published`,`withdrawn`) default 'draft' | |
| `published_at`, `published_by` | timestamptz / uuid | |
| `supersedes_report_id` | uuid null references self | 同报告更新版 / 译版归并（R7） |
| `code_version` | text not null | 抽取代码版本（git sha） |
| `created_at`, `updated_at` | | |

约束与触发器：
- `unique (document_id)`：一份文件一条报告（多标的报告仍是一条，标的放 `broker_report_targets`，§4.4）。
- `check ((target_price is null) = (target_currency is null))`；`check (upside_pct is null or (target_price is not null and price_at_report is not null))`。
- `check (status <> 'published' or published_at is not null)`。
- **发布门禁触发器** `broker_reports_publish_guard`（before update，`status` 变为 `published` 时）：拒绝条件依次为 (a) `review_status <> 'approved'`；(b) 许可 `confirmed_at is null` 或 `allows_public_metadata=false` 或今天不在 `valid_from..valid_to`；(c) 存在必填字段（§5.1）状态不为 `confirmed`/`corrected`；(d) 文档 `status <> 'extracted'`。拒绝时 `raise exception 'publish_blocked:<reason>'`。
- 文档 `withdrawn` 级联：`after update on broker_report_documents` 把其报告置 `withdrawn`。

### 4.4 `broker_report_targets`（多标的报告的标的行）

`(report_id, issuer_id, ticker_as_stated, rating_raw, rating_normalized, target_price, target_currency, price_at_report, upside_pct, page)`；`scope='single_issuer'` 的报告这里恰有一行且与 §4.3 主列一致（触发器同步）；`multi_issuer` 多行；`sector`/`macro_strategy` 零行。评级历史视图（§4.9）从本表读，所以单 / 多标的统一。

### 4.5 `broker_report_fields`（字段级出处，私有）

| 列 | 类型 / 约束 |
|---|---|
| `field_id` | uuid PK |
| `report_id` | uuid not null references `broker_research_reports` on delete cascade |
| `target_issuer_id` | uuid null（多标的报告时指明属于哪个标的） |
| `field` | text not null check in (`institution`,`analyst`,`published_date`,`price_as_of_date`,`ticker`,`rating`,`target_price`,`target_horizon`,`price_at_report`,`upside_stated`,`wacc`,`terminal_growth`,`terminal_value_share`,`valuation_method`,`sector`,`title`) |
| `value_text` | text not null（标准化后的值，如 `"OVERWEIGHT"`、`"125.00 USD"`） |
| `value_num` | numeric null |
| `unit` | text null |
| `page` | integer not null check (> 0) |
| `char_start`, `char_end` | integer not null check (0 ≤ start < end) |
| `value_source_text` | text not null（页文本 `[char_start, char_end)` 的逐字副本） |
| `extractor` | text not null（`llm:<model_id>@<registry_hash>` 或 `human:<user_id>`） |
| `extractor_confidence` | numeric null check (0..1) |
| `status` | text not null check in (`extracted`,`unverified`,`confirmed`,`corrected`,`rejected`) |
| `corrected_value_text` | text null；`status='corrected'` 时 not null |
| `reviewed_by`, `reviewed_at` | |
| `created_at` | |

唯一索引 `(report_id, coalesce(target_issuer_id, '00000000-…'), field)` where `status in ('confirmed','corrected')`：一个字段只有一条生效记录。本表**不对外**；对外只经 §4.9 `broker_report_citations_v` 暴露 `(field, page)`。

### 4.6 `broker_report_snippets`（引用片段，可公开子集）

`snippet_id PK, report_id FK cascade, purpose check in ('rating','target','thesis','risk','method','other'), page int > 0, char_start, char_end, text not null, field_id null FK, status check in ('draft','approved','rejected'), approved_by, approved_at, created_by, created_at`。

约束：`check (length(text) <= 500)`（硬上限，与 §4.1 同值）；**触发器** `snippet_length_guard`：`approved` 时校验 `length(text) <= licence.snippet_max_chars`（经 report→document→licence）且 `text` 等于页文本对应区间（由应用在写入前校验，触发器只校长度）。片段由管理员在复核界面从页文本中框选生成，不由 LLM 生成。

### 4.7 `broker_report_summaries`（独立摘要，派生物）

`summary_id PK, report_id FK cascade, lang check in ('zh','en'), kind text not null default 'independent_summary' check (= 'independent_summary'), model_id text not null, registry_snapshot_hash text not null, prompt_version text not null, input_hash text not null（抽取文本 sha256）, summary_md text not null, max_verbatim_overlap int not null（与原文最长公共子串长度）, generated_at, status check in ('draft','approved','rejected'), approved_by, approved_at`。

唯一索引 `(report_id, lang) where status='approved'`。触发器 `summary_overlap_guard`：`approved` 时 `max_verbatim_overlap <= licence.snippet_max_chars`，否则拒绝。

### 4.8 实体表

- `research_institutions(institution_id PK, name_en not null, name_zh, aliases text[] not null default '{}', kind check in ('investment_bank','broker','independent_research','other'), rating_disclosure_url text, created_at)`；唯一索引 `lower(name_en)`。
- `research_rating_scales(scale_id PK, institution_id FK, scale_version text not null, raw_label text not null, normalized check in (同 §4.3), source_url text not null（机构评级定义页）, valid_from date not null, valid_to date, unique (institution_id, scale_version, lower(raw_label)))`。映射表由管理员维护，`source_url` 必填：映射是派生，依据必须可查。
- `research_analysts(analyst_id PK, institution_id FK, display_name not null, name_variants text[] default '{}', public_display boolean not null default false, created_at)`；`broker_report_analysts(report_id, analyst_id, role check in ('lead','co'), page int, primary key (report_id, analyst_id))`。`public_display` 由 D4 决定默认值。

### 4.9 公开视图（`security_invoker = false`，`grant select to anon, authenticated`）

| 视图 | 来源与过滤 | 列（节选） |
|---|---|---|
| `broker_reports_public_v` | `broker_research_reports r join documents d join licences l`，`r.status='published' and l.confirmed_at is not null and l.allows_public_metadata and current_date between l.valid_from and coalesce(l.valid_to, 'infinity')` | `report_id, scope, institution_id, issuer_id, ticker_as_stated, title_original, title_zh, title_en, published_date, price_as_of_date, report_type, sector_as_stated, rating_raw, rating_normalized, rating_scale_version, target_price = case when l.allows_public_target_price then r.target_price end, target_currency(同), target_horizon_months, price_at_report, price_currency, upside_pct(同 case), upside_formula_version, available_at = d.uploaded_at, code_version, published_at, supersedes_report_id, page_count = d.page_count, snippet_max_chars = l.snippet_max_chars` |
| `broker_report_targets_public_v` | `broker_report_targets` join 上一视图 | 同样对 `target_price/upside_pct` 做许可 case |
| `broker_report_citations_v` | `broker_report_fields` where `status in ('confirmed','corrected')` join 上一视图 | `report_id, target_issuer_id, field, page, value_text = coalesce(corrected_value_text, value_text), value_num, unit, extractor_kind = split_part(extractor, ':', 1)`；**不含** `char_start/char_end/value_source_text` |
| `broker_report_snippets_public_v` | `status='approved'` join 报告视图 where `l.allows_public_snippets` | `snippet_id, report_id, purpose, page, text, field_id` |
| `broker_report_summaries_public_v` | `status='approved'` join 报告视图 | `summary_id, report_id, lang, kind, model_id, registry_snapshot_hash, prompt_version, input_hash, summary_md, generated_at` |
| `broker_analysts_public_v` | `research_analysts where public_display` join `broker_report_analysts` join 报告视图 | `report_id, analyst_id, display_name, institution_id, role` |
| `broker_rating_history_v` | `broker_report_targets_public_v` 按 `(institution_id, issuer_id)` 排序，`lag()` 给出 `prev_rating_normalized, prev_target_price` | 评级 / 目标价轨迹（事实序列，不是判断） |
| `research_institutions_public_v`, `research_rating_scales_public_v` | 全表 | |

集成测试以真实 `anon` 角色验证：基表 `select` 被拒；视图行数与过滤一致；许可翻转后视图即时变化。

### 4.10 `broker_report_access_log`（合规日志，私有）

`id PK, document_id FK, user_id not null, action check in ('upload','signed_url_issued','pdf_viewed','extract_run','purge'), detail jsonb not null default '{}'（签名 URL 的过期时刻、请求来源 origin；不存 IP 原文，存 sha256(ip + 日)）, created_at`。只 service_role。每次签名 URL 签发必写一行；写失败则签发失败（与隔离处理的"先提交再审计"不同：这里审计是发放的前置条件）。

### 4.11 原文桶 `broker-research`

`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('broker-research','broker-research', false, 52428800, array['application/pdf','application/json']) on conflict (id) do update set public=false, …`。路径：`reports/{sha256}.pdf`、`reports/{sha256}.extract.{version}.json`、`reports/{sha256}.pages/{page}.png`（F3 若产页面图像，仅供管理员复核）、`licences/{sha256}.pdf`。**不建任何 `storage.objects` 策略**：anon / authenticated 对该桶无任何访问；只有 service_role。集成测试验证 anon 用桶路径请求对象得 4xx。

### 4.12 权限小结

| 对象 | anon / authenticated | service_role |
|---|---|---|
| 全部 `broker_report_*`、`broker_research_reports`、`research_analysts`、`research_rating_scales`、`research_institutions` 基表 | `revoke all` | 全部 |
| §4.9 视图 | `select` | `select` |
| 桶 `broker-research` | 无 | 全部 |
| `ingest_batches`、`dq_quarantine`、`dq_freshness`、`dq_reconciliations` | 已有：无 | 已有 |

### 4.13 数据访问契约 `src/lib/broker-research/db.ts`

```ts
export interface BrokerResearchDb {
  // documents & licences (service_role only)
  findDocumentBySha(sha256): Promise<DocumentRow|null>;
  insertDocument(row): Promise<void>;
  updateDocument(documentId, patch: {status?, page_count?, extraction_version?, extraction_path?, withdrawn_at?, withdrawn_reason?}): Promise<void>;
  listLicences(): Promise<LicenceRow[]>; upsertLicence(row): Promise<void>; confirmLicence(licenceId, by, at): Promise<void>;
  logAccess(row): Promise<void>;                       // 抛错即中止调用方
  // reports & fields
  insertReport(row): Promise<void>; updateReport(reportId, patch): Promise<void>;   // publish 经 rpc('broker_report_publish')
  replaceTargets(reportId, rows): Promise<void>;
  insertFields(rows): Promise<void>; setFieldStatus(fieldId, patch: {status, corrected_value_text?, reviewed_by, reviewed_at}): Promise<void>;
  fieldsOfReport(reportId): Promise<FieldRow[]>;
  insertSnippet(row): Promise<void>; setSnippetStatus(snippetId, patch): Promise<void>;
  insertSummary(row): Promise<void>; setSummaryStatus(summaryId, patch): Promise<void>;
  reviewQueue(opts: {status?, limit, cursor?}): Promise<ReportRow[]>;
  // public (anon client, views only)
  publicReports(filter: {institutionId?, issuerId?, ratingNormalized?, from?, to?, scope?, limit, cursor?}): Promise<PublicReport[]>;
  publicReport(reportId): Promise<PublicReportDetail|null>;   // 视图四次查询：报告、targets、citations、snippets、summaries
  ratingHistory(opts: {institutionId?, issuerId, limit}): Promise<RatingHistoryRow[]>;
}
```

三种实现：`supabaseBrokerResearchDb`（PostgREST + `rpc('broker_report_publish')`）、`memoryBrokerResearchDb`（单测；实现触发器等价规则：发布门禁、片段长度、摘要重叠）、`pgBrokerResearchDb`（集成测试直连）。批次 / 隔离 / 新鲜度仍用规格一 `TableClient`。

---

## 5. 字段契约与抽取 Schema

### 5.1 必填与可选

| 字段 | `single_issuer` | `multi_issuer` | `sector` / `macro_strategy` |
|---|---|---|---|
| `institution`、`published_date`、`title` | 必填 | 必填 | 必填 |
| `ticker`（≥1） | 必填 | 必填（每标的） | — |
| `rating` | 若报告有评级则必填，无则 `not_rated` 需管理员确认"报告无评级" | 同左（每标的） | — |
| `target_price` + `target_horizon` + `price_at_report` + `price_as_of_date` | 报告写明则必填并校验 R2–R4；否则缺失 | 同左 | — |
| `analyst` | 可选 | 可选 | 可选 |
| `wacc`、`terminal_growth`、`terminal_value_share`、`valuation_method` | 可选，仅报告写明 | 同左 | — |
| `sector` | 可选 | 可选 | 必填（`sector_as_stated`） |

"必填字段未 `confirmed/corrected` 则不能发布"由 §4.3 触发器执行；"报告无评级"是管理员在复核页的显式动作，写一条 `field='rating', value_text='NOT_RATED', extractor='human:<id>', status='confirmed'`，`page` 指向封面。

### 5.2 抽取 JSON Schema `src/lib/broker-research/extract/schema.json`（ajv 校验）

每个字段的形状：`{ "value": string, "page": integer ≥ 1, "quote": string（页内逐字原文，≤ 400 字）, "confidence": number 0..1 }`；顶层 `{ scope, institution, analysts[], published_date, price_as_of_date?, tickers[], rating?, target_price?{value, currency}, target_horizon_months?, price_at_report?{value, currency}, upside_stated?, wacc?, terminal_growth?, terminal_value_share?, valuation_method?, sector?, title }`。`additionalProperties: false`。LLM 输出不合 schema → 重试一次 → 仍失败则文档 `extraction_failed`，批次 `failed`，错误码 `llm_schema_invalid`。

`quote` 定位：在 `extraction.pages[page-1].text` 中查找 `quote` 的首次逐字命中，得 `char_start/char_end`；未命中（含空白差异）→ 该字段 `unverified`（不是隔离：由管理员在复核页改为人工框选）。命中多处取首处并记 `detail.multiple_hits=n` 供复核页提示。

### 5.3 代码版本与可回放

每条字段记录 `extractor`（模型 + 注册表哈希）、报告记录 `code_version`（部署 git sha）与 `extraction_batch_id`；给定 `document_id` + `extraction_version` + `extractor` + `prompt_version` 可从桶内 `extract.json` 重新生成字段候选并与库内行比对（`scripts/broker-research/replay.ts`，输出差异表，不写库）。

---

## 6. 处理流程

### 6.1 上传（管理员）

1. 管理员在 `/admin/broker-research/upload` 选许可（必选；未确认的许可可选但页面提示"未确认许可的文件不能发布"）与 PDF。
2. 浏览器先算 sha256（Web Crypto），`POST /api/admin/broker-research/documents/intent {sha256, byte_size, licence_id, original_filename}` → 服务端查重：已存在 → `409 duplicate_document {document_id}`；否则写 `documents(status='uploaded' 待确认)`？**不**：先签发桶的签名上传 URL（`createSignedUploadUrl('reports/{sha256}.pdf')`），返回 `{uploadUrl, token, document_intent_id}`，此时不写表。
3. 浏览器直传桶（绕开函数请求体上限；Vercel 函数体上限数值本规格未核实，见 §16 问题 1）。
4. `POST /api/admin/broker-research/documents/commit {sha256, licence_id, original_filename}`：服务端用 service_role 下载对象、复算 sha256 与大小、校验 `%PDF-` 头与 `application/pdf`；不一致 → 删除对象、`422 sha_mismatch`；一致 → 插入 `documents(status='uploaded')`、写 `access_log(action='upload')`、`research_audit_log('broker_research.upload')`。
5. 并发同 sha：`documents.sha256` unique → 后到者 `409`，对象已是同一路径（`upsert:false` 的第二次上传已被桶拒绝）。

### 6.2 抽取（管理员触发，`POST …/documents/[id]/extract`）

一个文档一个批次：`startBatch({producer:'broker-research-extract', dataset:'broker_research', codeVersion, toolVersions:{f3: extractor_version, llm: model_id, registry: hash, schema: 'extract-schema/1'}, triggeredBy:'manual'})`。

1. F3 `extractDocument(storagePath)` → 写 `reports/{sha}.extract.{v}.json`，回填 `page_count/extraction_version/extraction_path`；失败 → 文档 `extraction_failed`，批次 `failed`，码 `f3_failed`。
2. 构造 LLM 输入：`pages[].text`（整文；超过模型上下文时按页分块并对每块跑同一 schema，合并时同字段取 `confidence` 最高者，记录 `detail.chunks=n`）。平台 LLM 经 `resolvePlatformLlm()`；无配置 → `llm_unavailable`，批次 `failed`。
3. ajv 校验 → §5.2 定位 → 写 `broker_research_reports(status='draft', review_status='pending')`、`fields(status='extracted'|'unverified')`、`targets`（每个 ticker 经 `resolveIssuer({ticker},{today})`；无 → `targets.issuer_id=null` 并记隔离 `unresolved_ticker`）。
4. 运行 §7 规则；隔离项按 §7.1。
5. `finishBatch`：`counts.fetched=1`（文档）、`inserted=` 字段数、`quarantined=` 隔离数、`failed=` 0/1；`recordAttempt(client,'broker_research',{ok, cadence:'event'})`。
6. 黄金集阈值未达（§12.4 记录在 `evals/broker-research/latest.json` 的 `precision/recall`）时报告 `review_status` 保持 `pending` 且不进复核队列默认视图；达标后自动 `in_review`。

幂等：同文档重跑抽取 → 旧 `fields(status in extracted/unverified)` 删除重建；`confirmed/corrected/rejected` 的字段保留并标 `detail.stale_extractor=true` 供复核页提示。重跑不改报告 `status`。

### 6.3 复核（管理员，`/admin/broker-research/review/[reportId]`）

左栏字段列表（值、页码、置信度、状态），右栏页文本（F3 文本，按页切换；若 F3 产页面图像则并排显示图像，仅管理员）。动作：`confirm`、`correct`（输入新值 + 框选新的跨度 → 写 `corrected_value_text` 并替换 `page/char_*`、`value_source_text`）、`reject`、`add`（人工新增字段，`extractor='human:<id>'`）、`mark_not_rated`。片段：在页文本框选 → 生成 `snippets(status='draft')`，显示剩余字数（上限 = 许可 N）。绑定：机构（搜索 `research_institutions`，可新建）、分析师、`scope`、`report_type`、`supersedes_report_id`（R7 提示）。全部必填字段 `confirmed/corrected` 后按钮"标记已复核" → `review_status='approved'`。

### 6.4 独立摘要（管理员触发，`POST …/reports/[id]/summary`）

输入：抽取文本 + 已确认字段；提示词 `prompts/independent-summary.v1.md`（版本化，入库 `prompt_version`）；要求用自己的话写"报告定位、核心结论、方法论要点、风险"四段，每段不超过固定行数由提示词控制，**禁止逐字引用**；输出后计算与原文全文的最长公共子串长度（`src/lib/broker-research/overlap.ts`，后缀自动机或 O(n·m) 动态规划按页分段），写 `max_verbatim_overlap`；超过 N → `status='rejected'` 并提示重生成。管理员阅读后 `approve`。zh 与 en 各一条，分别生成（不互译）。

### 6.5 发布与撤回

`POST …/reports/[id]/publish` → `rpc('broker_report_publish', report_id, by)`：函数内 `update … set status='published', published_at=now(), published_by=by`，由 §4.3 触发器把关；拒绝原因原样返回 `409 publish_blocked:<reason>`。可选副作用（默认关闭，环境变量 `BROKER_RESEARCH_MIRROR_TO_RESEARCH_OS=1`）：为 owner 的 Research OS 写一条 `ingestSource({source_type:'MANUAL', permission:'licensed', origin_type:'analyst_or_media', raw_text: 独立摘要, metadata:{broker_report_id}})`，只含摘要不含原文。`withdraw` → `status='withdrawn'`，视图即时消失；写审计。

### 6.6 Tushare `report_rc` 的定位（对账适配器，非来源）

`fetchTushareReportRc` 返回 Tushare 汇总的卖方盈利预测行（机构、作者、评级、目标价区间、日期），上游未注明、无文件、无页码、A 股限定、以国内券商为主、目标价为区间非单值、需 5000 积分。它**不能**建立：报告原件存在性、许可、引用位置、币种、报告时价格、分析师身份核实、单一目标价。因此：
- 不生成 `broker_research_reports` 行。
- 作为可选对账：阶段 FR-6 提供 `scripts/broker-research/reconcile-report-rc.ts`，对 `scope='single_issuer'`、A 股、已发布的报告，按 `(org_name≈institution.aliases, report_date=published_date)` 匹配 `report_rc` 行，把 `target_price` 与 `(max_price+min_price)/2`、`rating_raw` 与 `rating` 写入 `dq_reconciliations(dataset='broker_research', left_source='document', right_source='tushare:report_rc', tolerance=0.005)`。不通过只在复核页提示，不阻断发布、不改字段。
- 外资机构的报告大多不在 `report_rc` 覆盖内；匹配不到就是没有对账，不是错误。

---

## 7. 规则与隔离

### 7.1 规则（`src/lib/broker-research/rules.ts`，复用 `rangeRule/identityRule/unitRule`，不抛异常）

| 规则 | 内容 | 不通过时 |
|---|---|---|
| R1 `span_verbatim` | `value_source_text === pages[page-1].text.slice(char_start, char_end)` | 字段 `unverified` |
| R2 `upside_identity` | 报告自述空间 `upside_stated` 与 `target_price/price_at_report − 1` 的差 ≤ 0.005（总纲 §3.6 容差） | 隔离 `upside_mismatch`，payload 含三值与页码 |
| R3 `currency_market` | `target_currency` ∈ 标的所在交易所允许币种（A: CNY；HK: HKD；US: USD；按 `issuer_securities.ticker` 后缀判定）；`price_currency` 同 | 隔离 `currency_mismatch` |
| R4 `date_order` | `price_as_of_date ≤ published_date ≤ uploaded_at::date` | 隔离 `date_order` |
| R5 `rating_label_known` | `rating_raw`（大小写无关）在该机构当前 `research_rating_scales` 中 | 隔离 `unknown_rating_label`；处理钩子见 §7.3 |
| R6 `positive_prices` | `target_price > 0`、`price_at_report > 0` | 隔离 `nonpositive_price` |
| R7 `possible_version` | 同机构 + 同发行人 + `published_date` 相差 ≤ 7 天 + 标题 Jaccard（分词后）≥ 0.8 的已有报告 | 隔离 `possible_version`，payload 含候选 `report_id`；管理员处理为 `supersedes_report_id` 或忽略。7 天与 0.8 为提案值，写在 `RULES_PARAMS` 并随 `RULES_VERSION` 版本化 |
| R8 `price_at_report_vs_feed` | `price_at_report` 与我方 K 线在 `price_as_of_date` 的收盘差 ≤ 0.005（信息，不阻断：报告常用盘中价） | 写 `dq_reconciliations(left='document', right='eastmoney:kline')`，不隔离 |
| R9 `summary_overlap` | 摘要与原文最长公共子串 ≤ N | 摘要 `rejected` |
| R10 `tickers_same_issuer` | `single_issuer` 报告的多个 ticker 必须解析到同一 `issuer_id` | 隔离 `ticker_issuer_conflict`（A/H 配对在计划三前常见：处理为选定主代码） |
| R11 `horizon_present_with_target` | 有 `target_price` 而无 `target_horizon_months` | 警告（信息码 `rule_warning_summary`），复核页提示；不阻断 |

### 7.2 隔离键

`quarantine({dataset:'broker_research', table:'broker_research_reports', naturalKey:`${sha256}:${field|rule}:${target_issuer_id??'-'}`, reasonCode, payload, batchId})`。同键 open 唯一（规格一语义）。

### 7.3 处理钩子（扩展 `POST /api/admin/dq/quarantine/[id]`）

`dataset='broker_research'` 的隔离项解决时调用 `src/lib/broker-research/quarantine-hooks.ts`：
- `unknown_rating_label` + `resolved_accept`：要求 body 带 `{normalized, scale_version, source_url}` → 写 `research_rating_scales` 一行并把报告 `rating_normalized` 回填；缺参数 → `400 hook_params_required`。
- `possible_version` + `resolved_accept`：body `{supersedes_report_id}` → 回填。
- `ticker_issuer_conflict` + `resolved_accept`：body `{issuer_id}` → 回填主发行人。
- 其余 `resolved_accept`：无副作用（字段保持，管理员已在复核页修正）；`resolved_reject`：报告 `review_status='rejected'`。
钩子失败时隔离项**不**翻转（与规格二 §7.3 一致：钩子在翻转之前执行）。

### 7.4 批次信息码

新增 `INFO_CODES`：`rule_warning_summary`（R11 之类的警告汇总，不降级）、`gold_gate_closed`（黄金集阈值未达，报告未入队；信息）。非信息码：`f3_failed`、`llm_unavailable`、`llm_schema_invalid`、`span_unverified_summary`（当 `unverified` 字段数 > 0 时一条汇总，使批次 `partial`）。

---

## 8. 接口

### 8.1 公开只读（anon 客户端，只读视图；`force-dynamic`；错误与空结果 `no-store`；成功 `public, max-age=600, s-maxage=3600`，与规格二历史读一致：发布 / 撤回 / 许可翻转最迟一小时在 CDN 生效，撤回若需即时生效由管理员路由调用 `revalidatePath`）

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/broker-research/reports` | `institution`、`ticker`（经 `resolveIssuer`，无 → 404 `unknown_ticker`）、`rating`（normalized）、`scope`、`from`/`to`（`published_date`）、`limit`（默认 50，最大 200）、`cursor`（`published_date,report_id` 键集分页） | `{reports:[{reportId, scope, institution:{id,nameEn,nameZh}, issuerId, tickers, title:{original, zh, en, translated:boolean}, publishedDate, reportType, rating:{raw, normalized, scaleVersion}, target:{price, currency, horizonMonths} \| null, priceAtReport:{value, currency, asOf} \| null, upsidePct, availableAt, codeVersion, hasSummary:{zh,en}, snippetCount}], nextCursor, count}` |
| `GET /api/broker-research/reports/[reportId]` | — | 上述 + `targets[]`、`citations:[{field, page, valueText, valueNum, unit, extractorKind}]`、`snippets:[{snippetId, purpose, page, text}]`、`summaries:{zh?:{summaryMd, modelId, registrySnapshotHash, promptVersion, inputHash, generatedAt, label:'independent_summary'}, en?}`、`analysts:[{displayName, role}]`（仅 `public_display`）、`licence:{snippetMaxChars, targetPricePublic:boolean}`、`settlement`（F4 落地前恒为 `null`，§10）。**绝不**含 `storage_path`、`sha256`、全文、`char_*` |
| `GET /api/broker-research/institutions` | — | `[{institutionId, nameEn, nameZh, kind, reportCount, ratingDisclosureUrl}]` |
| `GET /api/broker-research/history` | `ticker`（必填）、`institution`、`limit` | `broker_rating_history_v` 行：`[{reportId, institutionId, publishedDate, ratingNormalized, prevRatingNormalized, targetPrice, prevTargetPrice, currency}]`；用于评级轨迹与跨机构分歧图 |
| `GET /api/broker-research/by-ticker/[ticker]` | `limit`（默认 10） | `/stock/[ticker]` 块用：最近报告摘要行（同列表项） |

参数重复 → 400 `invalid_parameter:<name>`；`reportId` 非 uuid → 400；视图无行 → 404 `not_found`。

### 8.2 管理员（`requireAdminUser()`；POST 校验 `Content-Type` 与 `Origin`，同 `/api/admin/dq`）

| 路径 | 作用 |
|---|---|
| `GET/POST/PATCH /api/admin/broker-research/licences[/[id]]`、`POST …/licences/[id]/confirm` | 许可 CRUD；`confirm` 只能由管理员且写审计；已有已发布报告的许可改为 `allows_public_metadata=false` 时视图即时隐藏（不改报告状态） |
| `POST …/documents/intent`、`POST …/documents/commit` | §6.1 |
| `GET …/documents/[id]/url` | 签名 URL，`expiresIn=600`（与读接口缓存上限同值），先写 `access_log(signed_url_issued)` 再签发；响应 `no-store`；每次调用新 URL |
| `POST …/documents/[id]/extract` | §6.2；同文档已有 `running` 批次 → `409 extract_running` |
| `POST …/documents/[id]/withdraw {reason, purge?}` | §4.2 |
| `GET …/review-queue?status=` | 复核队列 |
| `GET …/reports/[id]`（管理员全量：含 `char_*`、`value_source_text`、页文本）、`POST …/reports/[id]/fields/[fieldId] {action: confirm\|correct\|reject, value?, page?, charStart?, charEnd?}`、`POST …/reports/[id]/fields {field, value, page, charStart, charEnd}`、`POST …/reports/[id]/bind {institutionId?, analystIds?, scope?, reportType?, supersedesReportId?}`、`POST …/reports/[id]/not-rated` | §6.3 |
| `POST …/reports/[id]/snippets {purpose, page, charStart, charEnd}`、`POST …/snippets/[id] {action: approve\|reject}` | §4.6；服务端从 extract.json 切文本，拒绝跨页 |
| `POST …/reports/[id]/summary {lang}`、`POST …/summaries/[id] {action}` | §6.4 |
| `POST …/reports/[id]/review {action: approve\|reject}`、`POST …/reports/[id]/publish`、`POST …/reports/[id]/withdraw` | §6.5 |
| `GET …/documents/[id]/pages/[n]` | 页文本（与页面图像若有）；写 `access_log(pdf_viewed)`；只管理员 |

所有管理员写操作写 `research_audit_log(actor='user', action='broker_research.<op>', object_type, object_id)`。

### 8.3 cron（可选，F4 落地后）

`GET|POST /api/cron/broker-research-settle`：`CRON_SECRET`；§10.3。F4 未落地不登记到 `vercel.json`。

---

## 9. 页面与 UI 流程

### 9.1 路由与导航

- 公开：`/intel/foreign-research`（列表）、`/intel/foreign-research/[reportId]`（详情）、`/intel/foreign-research/institutions/[institutionId]`（机构页）。入口：`/intel` 页签"外资研报 / Foreign research"；`/stock/[ticker]` 新增"馆藏研报"块；`/intel/industries`（落地后）行业页右栏"相关研报"。
- 管理员：`/admin/broker-research`（总览 + 队列）、`/admin/broker-research/upload`、`/admin/broker-research/licences`、`/admin/broker-research/review/[reportId]`、`/admin/broker-research/institutions`。

### 9.2 列表页状态

| 状态 | 表现 |
|---|---|
| 正常 | 筛选条（机构、标的、评级、范围、日期）+ 表格（机构 / 标的 / 标题 / 日期 / 评级原文+标准化 / 目标价（许可允许时）/ 空间 / 摘要有无）；每行链到详情；顶栏统计"馆藏 n 篇 · 机构 m 家 · 最近入库 日期" |
| 空馆藏 | "尚无已发布研报。研报由管理员上传并经许可确认后发布。"（不显示任何示例数据） |
| 筛选无结果 | "没有符合条件的报告" + 清除筛选 |
| 目标价不可公开 | 目标价 / 空间列显示 "—（许可不允许公开）"，表头角标说明 |
| 加载失败 | 错误条 + 重试；不回退 mock |

### 9.3 详情页

顶部：机构（链到机构页）、标题（原文；译名在下，标注"译"）、发布日期、报告类型、标的 chip（链到 `/stock/[ticker]`）。
事实区（表）：评级原文 / 标准化（标注映射版本）、目标价 + 币种 + 期限、报告时价格 + 日期、空间（标注"派生：目标价 / 报告时价格 − 1"）、方法论参数（仅有时显示）。每个值旁一个来源图标 → 打开**来源抽屉**：`文件：私有馆藏（不对外提供原文）· 第 p 页 · 字段由 LLM 抽取 / 人工确认 · 入库 available_at · 代码版本`，若该字段有片段则显示片段文本（≤ N 字，引号 + 页码）。
最新价区：我方行情链路最新收盘（标注来源 `eastmoney` 适配、日期）与相对目标价的当前距离（派生；目标价不可公开时整块隐藏）。
独立摘要区：zh/en 随界面语言切换；块顶固定标签"OsbornAlpha 独立摘要 · AI 生成（模型 id）· 非机构原文 · 生成日期"；不可与片段混排。
引用片段区：按 `purpose` 分组，每条引号 + 第 p 页；区块标题"机构原文片段（经许可，≤ N 字）"。
历史区：该机构对该标的的评级 / 目标价轨迹（时间线图 + 表格切换）；跨机构分歧图（同标的、近 12 个月各机构最新目标价点阵 + 表格）。F4 未落地：区块标题"评级与目标价历史（事实）"，无任何命中率；F4 落地后新增"结算（判断）"子区（§10.4）。
缺失态：无目标价 → 事实表该行"报告未给出目标价"；无摘要 → "独立摘要尚未生成"；无片段 → 区块隐藏；无历史（仅一篇）→ "仅此一篇"。
撤回：`404` 页"该报告已撤回或不存在"。

### 9.4 `/stock/[ticker]` 块

"馆藏研报（n）"：最近 5 条（机构、日期、评级、目标价若可公开、链到详情）；无 → 块隐藏（不显示 mock 提示）。与现有 `broker_reports` mock 块并列的过渡期表现由 O7 决定。

### 9.5 管理员页面流程

- 总览：四张计数卡（待抽取 / 待复核 / 待发布 / 已发布）、最近批次（`ingest_batches` dataset 过滤）、open 隔离项（链到 `/admin/dq`）、黄金集最新分数与闸门状态。
- 上传：拖拽 PDF → 本地算 sha → 查重提示 → 选许可 → 直传进度 → 提交 → 跳转文档页。重复文件：显示已有文档链接。
- 许可：列表 + 表单（字段同 §4.1）+ "确认"按钮（二次确认对话框，文字说明确认即声明已阅条款）+ 证据上传。
- 复核：§6.3 双栏；键盘 `j/k` 换字段、`c` 确认；进度条"必填 x/y 已确认"；右上"查看原文（签名链接，10 分钟）"按钮，点击写访问日志。
- 发布：对话框列出门禁检查结果（许可已确认 / 元数据可公开 / 字段全确认 / 摘要已批准（非必需）/ 片段 n 条），任一红项按钮禁用。
- 访问日志：按文档列出签发 / 查看记录。

### 9.6 Claude Design canvas 待设计清单

1. `/intel/foreign-research` 列表（桌面 / 移动；含空馆藏、筛选无结果、目标价不可公开三态）。
2. 详情页（含来源抽屉、独立摘要标签、片段区、历史图 + 表格切换、撤回 404）。
3. 机构页（机构简介、评级体系映射表与出处链接、报告列表、覆盖标的）。
4. `/stock/[ticker]` 馆藏研报块。
5. 跨机构分歧图与评级轨迹图（图表 + 表格等价）。
6. 管理员总览。
7. 上传流程（查重、许可选择、直传进度、提交结果）。
8. 许可列表与表单、确认对话框。
9. 复核双栏（字段列表 / 页文本 / 片段框选 / 不可核字段提示 / 旧抽取提示）。
10. 发布门禁对话框。
11. 访问日志。
12. zh/en 两套文案的同屏对照（parity）。
所有屏用 `DESIGN.md` tokens：单一黄铜强调色、等宽数字、无紫色无渐变；图表用内联 SVG。

### 9.7 i18n

`messages/{zh,en}/intel.json` 新增 `foreignResearch.{list,detail,institution,drawer,summaryLabel,snippetsHeading,missing,errors}`；`admin.json` 新增 `brokerResearch.{overview,upload,licences,review,publish,accessLog,errors}`；parity 测试覆盖。评级标准化枚举的显示名在 `common.json` `rating.*`。

---

## 10. 判断层：机构 / 分析师追踪（F4）

### 10.1 原则

- 研报的评级与目标价是**机构的判断**，不是我方的；我方登记的是"某机构在 `published_date` 对某发行人给出目标价 T、期限 H"这一事实，结算的是"之后价格如何"。
- 馆藏是 owner 选择性上传的样本：任何命中率都必须标注"基于馆藏样本 n 篇，非该机构全部报告"，并给出 n。
- F4 未落地：不显示命中率、不显示百分比；只显示 §4.9 历史视图。

### 10.2 登记（本规格提供适配器 `src/lib/broker-research/judgments.ts`）

发布时为每个 `targets` 行（有 `target_price` 且 `scope ∈ {single_issuer, multi_issuer}`）生成一条登记请求：

```ts
{
  claim_type: 'broker_target_price',
  subject: { issuer_id, ticker: primary ticker (issuer_securities.is_primary 或 ticker_as_stated[0]) , market },
  claimant: { kind: 'institution', id: institution_id, analyst_ids? },
  claim: { direction: ratingDirection(rating_normalized) /* buy/overweight → +1; sell/underweight → −1; neutral/not_rated → 0 */,
           target_price, currency, horizon_months: target_horizon_months ?? null,
           reference_price: price_at_report, reference_date: price_as_of_date ?? published_date },
  registered_at: published_date,           // 机构判断的时点
  available_at: documents.uploaded_at,      // 我方知道它的时点（防止把事后上传当成事前预测）
  source: { report_id, document_sha256, field_ids: [...] },
  methodology_version: 'broker-claim/1'
}
```

`horizon_months` 为 null 的登记只能做前向窗口结算，不能做"到期命中"。

### 10.3 结算（使用 F4 的结算器；本规格定义所需输出）

- 前向收益：复用 `scoreForward(call, bars)`（5/20/60 交易日，基准为 `registered_at` 所在交易所日期后的首根 K 线收盘），`price_source='eastmoney:kline'`、`adjustment` 记录在结算行。
- 到期命中（有 horizon 时）：`target_hit = direction>0 ? max(high within [base_date, horizon_end]) ≥ target : min(low …) ≤ target`；`horizon_end_close`、`return_to_horizon_end`。
- 结算行必须记 `methodology_version`、`bars_hash`（所用 K 线序列哈希）、`settled_at`、`code_version`；可回放。
- 只结算 `available_at ≤ settlement window start` 之外的区别：结算结果一律标注 `registered_before_available = (available_at::date > registered_at)`，页面上以"事后入库"角标提示，机构级汇总分别统计两类。

### 10.4 显示（F4 落地后）

详情页"结算（判断）"子区：该报告的 5/20/60 日前向收益、到期命中（若有期限）、方法版本、价格来源与复权；机构页"馆藏样本表现"：n、命中率（仅当 n ≥ F4 规定的最小样本数，否则显示"样本不足"）、按 `registered_before_available` 分列；校准曲线由 F4 页面承担，本模块只提供链接。

### 10.5 不做

Brier 分数（机构不给概率，没有 Brier）；相对基准超额（需指数序列）；分析师个人命中率对外（D4 + 样本极小，默认只在管理员页显示）。

---

## 11. 依赖接口（待对齐）

### 11.1 F3 文档管道

本规格需要（放在 `src/lib/documents/` 或 F3 指定位置）：

```ts
export interface DocumentExtraction {
  sha256: string; extractor_version: string; extracted_at: string;
  page_count: number; language: 'en'|'zh'|'ja'|'other'|'mixed'; ocr_used: boolean;
  pages: Array<{ page: number; width: number; height: number; text: string;   // text 为该页全部文本，顺序稳定；char 偏移以此为准
                 blocks: Array<{ kind: 'heading'|'paragraph'|'table_cell'|'caption'|'footer'; bbox: [number,number,number,number]; char_start: number; char_end: number }> }>;
  tables: Array<{ page: number; bbox: [number,number,number,number]; cells: string[][] }>;
  page_images?: Array<{ page: number; storage_path: string }>;   // 可选，仅管理员复核用
}
export function extractDocument(input: { bucket: string; path: string; sha256: string }, opts: { deadline?: Date }): Promise<DocumentExtraction>;
export function sliceText(extraction: DocumentExtraction, loc: { page: number; char_start: number; char_end: number }): string;   // 跨页抛错
```

要求：同一 `extractor_version` 对同一文件输出字节级一致（偏移稳定）；文本不做"智能清洗"（否则逐字引用失败）；表格以单元格网格给出；扫描件 OCR 时 `ocr_used=true`（本模块对 OCR 文件的字段默认 `unverified`，必须人工确认）；输出写回本模块指定的桶路径；超时按 `deadline`。F3 若选 Docling / MinerU（总纲 §3.5），页面文本提取需能在 Vercel 函数外运行（Python）——运行位置是 F3 的决定；本模块只要求 `extractDocument` 在 300 s 内返回或抛 `F3Timeout`。

### 11.2 F4 判断框架

需要：`registerClaim(req: ClaimRegistration): Promise<{claim_id}>`（幂等键 `(claim_type, source.report_id, subject.issuer_id)`）；`settleClaims(filter): Promise<SettlementReceipt>`；`settlementOf(claim_id): Promise<Settlement|null>`；`claimantStats(claimant, {minN}): Promise<{n, hit_rate|null, by_availability}>`；以及 F4 页面接受 `?claimant=institution:<id>` 的链接。F4 的最小样本数 `minN` 由 F4 定；本模块不显示低于它的汇总。

### 11.3 F6 评测

需要 `evals/broker-research/` 的运行器约定：输入黄金集清单（私有路径，不入库）、输出 `latest.json {precision, recall, per_field, run_at, extractor, model_id}`；CI 读该文件判定闸门（§6.2 第 6 步）。黄金集文件本身不进仓库、不进 CI 产物。

### 11.4 计划三（标识符与对账）

A/H 配对与 ISIN/FIGI 落地后：R10 的 `ticker_issuer_conflict` 自动消解；`subject.ticker` 改用主代码规则；`dq_reconciliations` 写入者若统一由计划三的运行器承担，§6.6 / R8 改为注册规则而非独立脚本。

---

## 12. 测试策略

### 12.1 单元（vitest，`memoryBrokerResearchDb`）

- `extract/schema.test.ts`：ajv 通过 / 拒绝样例；`additionalProperties`。
- `extract/locate.test.ts`：quote 逐字命中、多次命中、空白差异不命中 → `unverified`、跨页不命中。
- `rules.test.ts`：R1–R11 每条通过 / 不通过 / 缺值不检；`RULES_PARAMS` 版本串。
- `overlap.test.ts`：最长公共子串在中英混排、换行差异下的结果；性能上限（30 页文本 × 摘要 ≤ 1 s 本机）。
- `upside.test.ts`：`upside/1` 公式、币种不同不计算。
- `judgments.test.ts`：登记请求形状、`direction`、`available_at` 来自 `uploaded_at`、无期限不生成到期结算。
- `publish-guard.test.ts`（内存实现等价规则）：四个拒绝条件逐一触发。
- `views-shape.test.ts`：公开 DTO 不含禁止键（`storage_path`、`sha256`、`char_start`、`value_source_text`、`raw_text`）——以白名单序列化并对快照断言。
- 路由测试：参数校验、缓存头、`no-store`、404、管理员 401/403/415/403(origin)、`409 duplicate_document`、`409 publish_blocked:<reason>`、签名 URL 先写日志（日志失败则 500 且无 URL）。
- 夹具：**不提交任何真实研报**。`src/lib/broker-research/__fixtures__/` 放由 `scripts/broker-research/make-fixture-pdf.ts` 生成的合成 PDF（用 F3 的依赖或 `pdf-lib` 写入已知文本与页码）及其预期 `DocumentExtraction` JSON；合成内容包含：封面（机构、评级、目标价、币种、日期、代码）、方法论页（WACC/g）、风险页、一个 A/H 双代码案例、一个无评级案例、一个空间自述与算术不符的案例。

### 12.2 数据库（`test:db`）

`src/lib/broker-research/broker-research.integration.test.ts`（含 `S4_TEST_STATE`，列入 `criticalSuites`）：迁移可重放；`sha256` 唯一；许可 / 文档 / 报告外键 `restrict`；发布门禁触发器四条；文档撤回级联；片段长度触发器（基表硬上限与许可上限）；摘要重叠触发器；生效字段唯一索引；视图：anon 角色读基表被拒、读视图成功、`allows_public_target_price=false` 时 `target_price is null`、撤回后行消失、许可到期后行消失；桶策略：anon 取对象被拒（用 PostgREST storage API 以 anon key 请求）；`rpc('broker_report_publish')` 仅 service_role。

### 12.3 离线集成（合成夹具 + 录制的 LLM 响应）

`src/lib/broker-research/pipeline.integration.test.ts`（critical）：合成 PDF → 伪 F3（读预期 JSON）→ 录制的 LLM 输出（`__fixtures__/llm/*.json`，由 `record-llm-fixture.ts` 用平台 LLM 录一次，文件头记模型与时间）→ 字段、隔离、批次计数、复核动作、片段、摘要（录制）、发布、公开视图读取全链路；重跑抽取时已确认字段保留。

### 12.4 黄金集评测（私有，F6 运行器）

30 篇 owner 合法持有的真实报告（总纲 §3.5），由实施者之外的人按 §5.1 字段逐篇人工标注（值 + 页码），标注文件与 PDF 都只在 owner 私有桶 `broker-research/gold/`；`scripts/broker-research/eval-gold.ts` 在 owner 环境运行，输出 `evals/broker-research/latest.json`（只含分数与每字段 P/R，不含任何报告内容）。阈值 0.95（总纲）；未达标时 §6.2 闸门关闭。

### 12.5 清单规则

含 `S4_TEST_STATE` 的文件全部进 `criticalSuites`；`verifyCriticalSuiteInventory` 绿；`messages-parity` 绿；`test:migrations` 绿。

---

## 13. 错误处理

| 情形 | 行为 | 码 / HTTP | 批次 |
|---|---|---|---|
| 上传 sha 已存在 | 不写、不传 | `409 duplicate_document` | — |
| 提交时 sha / 大小 / PDF 头不符 | 删对象 | `422 sha_mismatch` / `422 not_pdf` | — |
| 对象超 50 MB | 桶拒绝 | `413 too_large` | — |
| 许可未确认即发布 | 触发器拒绝 | `409 publish_blocked:licence_unconfirmed` | — |
| 必填字段未确认 | 同上 | `409 publish_blocked:fields_unconfirmed` | — |
| F3 失败 / 超时 | 文档 `extraction_failed` | `f3_failed` / `f3_timeout` | failed |
| LLM 不可用 / 配额 | 不写字段 | `llm_unavailable` / `llm_quota` | failed |
| LLM 输出不合 schema（重试后） | 不写字段 | `llm_schema_invalid` | failed |
| 字段逐字未命中 | 写 `unverified` | `span_unverified_summary`（汇总） | partial |
| 规则不通过 | 隔离 | §7.1 各码 | partial |
| ticker 无法解析 | 隔离 | `unresolved_ticker` | partial |
| 抽取重复触发 | 拒绝 | `409 extract_running` | — |
| 签名 URL 日志写失败 | 不签发 | `500 access_log_failed` | — |
| 摘要重叠超限 | 摘要 `rejected` | `summary_overlap` | — |
| 片段跨页 / 超长 | 拒绝 | `400 snippet_cross_page` / `400 snippet_too_long` | — |
| 黄金集未达标 | 报告不入队 | `gold_gate_closed`（信息） | — |
| 公开读：ticker 未知 / 报告不存在 | | `404 unknown_ticker` / `404 not_found` | |
| 公开读：参数非法 | | `400 invalid_parameter:<name>` | |

---

## 14. 分期

| 工作包 | 交付 | 退出条件 | 估计 |
|---|---|---|---|
| FR-0 迁移、视图、契约 | 迁移（11 表、桶、视图、触发器、`broker_report_publish` 函数、权限）、锁文件、`database.types.ts`、`BrokerResearchDb` 三实现、§12.2 集成测试 | `test:db`、`test:migrations` 绿；anon 读基表被拒 | 3 人日 |
| FR-1 许可、上传、私有存储 | 许可 API + 页、`intent/commit` 上传、签名 URL + 访问日志、撤回、`/admin/broker-research` 总览与上传页、i18n | 真实 Supabase 本地栈：上传 → 查重 → 签名链接 → 日志行；anon 取对象被拒 | 3 人日 |
| FR-2 抽取与复核 | F3 适配、schema、定位、规则、隔离与钩子、复核页、合成夹具、录制 LLM 夹具、`pipeline.integration` | 合成夹具全链路绿；黄金集闸门代码路径有测试（闸门关时不入队） | 5 人日（不含 F3 自身） |
| FR-3 摘要与发布与公开页 | 摘要生成与重叠检查、发布门禁对话框、公开 API 四条、列表 / 详情 / 机构页、`/stock` 块、来源抽屉 | 一篇合成报告端到端发布并在匿名浏览器可见；DTO 白名单测试绿 | 4 人日 |
| FR-4 实体与历史 | 机构 / 评级映射 / 分析师维护页、历史视图、轨迹与分歧图（SVG + 表格） | 两家机构两篇报告 → 历史视图两行、`prev_*` 正确 | 2 人日 |
| FR-5 F4 适配 | `judgments.ts` 登记、结算显示子区、可选 cron | 依赖 F4 落地；F4 未落地只交付登记适配器与测试 | 2 人日 |
| FR-6 评测与对账与收尾 | `eval-gold.ts`、`replay.ts`、`reconcile-report-rc.ts`（可选）、runbook、§17 偏差 | owner 环境跑黄金集一次并记录分数；全门禁绿 | 2 人日 |

合计约 21 人日（估计值；F3、F4 工作量不含）。顺序：FR-0 → FR-1 → FR-2 → FR-3 → FR-4 → FR-5 / FR-6。**对外页面（FR-3）上线前必须有 D1 的至少一条已确认许可**；没有则 FR-3 只部署到预览环境。

验收样例：
1. 上传同一 PDF 两次：第二次 `409 duplicate_document`，桶内一个对象，`access_log` 一条 `upload`。
2. 抽取后目标价字段 quote 与页文本差一个空格：字段 `unverified`，发布被拒 `fields_unconfirmed`；管理员框选修正后发布成功。
3. 许可 `allows_public_target_price=false`：匿名 `GET /api/broker-research/reports/[id]` 的 `target` 为 `null`，管理员路由有值。
4. 摘要含一段 N+1 字的逐字原文：`approve` 被拒 `summary_overlap`。
5. 许可 `valid_to` 设为昨天：列表视图即时无该报告；`published_at` 不变。
6. 签名 URL 路由在 `access_log` 写失败时返回 500 且响应无 URL。

---

## 15. 独立验证与 owner 事项

### 15.1 独立验证

- Codex（gpt-6-astra，medium）两轮规格审计 + 处置表（`docs/audits/2026-11-04-foreign-research/`）；每个工作包提交再审。
- 逐字引用自动核验（R1）对全部已发布字段每晚复跑一次（`replay.ts --verify`，只读），差异写 `dq_quarantine(reason='span_drift')`——出现即说明 F3 输出不稳定。
- 算术与一致性（R2–R4、R6）为自动门禁。
- 黄金集 30 篇 P/R（§12.4），由实施者之外的人标注。
- 领域专家抽样：请一位卖方或买方分析师抽 10 篇已发布报告，对照原件核对详情页全部事实字段与片段，记录在 `docs/audits/2026-11-04-foreign-research/expert-sample.json`（只记字段名、是否一致、备注，不记报告内容）。
- 合规复核：owner（或其法务）对 §4.9 视图列清单与 §9.3 页面逐项确认"可对外"，签字记录进同一审计目录；这是 D1 的证据。
- 后验：F4 落地后，机构级结算与 owner 自己对该机构的印象做一次对照（记录，不作门禁）。

### 15.2 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **D1 许可确认**：逐来源填写 §4.1 许可记录并点击确认；确认"对外展示元数据 + 独立摘要 + ≤ N 字片段"在该来源条款下可行（多数研报首页有分发限制条款，需逐家核） | owner / 法务 | FR-3 对外上线前；无确认则对外页面不上线 |
| **D2 片段上限 N**：按许可逐条设置 `snippet_max_chars`；数据库硬上限 500 为提案值 | owner | FR-0 前（硬上限入迁移） |
| **D3 目标价是否对外**：逐许可设置 `allows_public_target_price`；默认 false | owner | FR-3 前 |
| **D4 分析师姓名是否对外**：`research_analysts.public_display` 默认 false；若默认 true 需说明依据 | owner | FR-4 前 |
| **D5 抽取 / 摘要使用的平台 LLM 与费用上限**：模型 id（注册表内）、每文档调用上限 | owner | FR-2 前 |
| **D6 馆藏初始来源**：首批上传哪些来源、各自许可种类 | owner | FR-1 后 |
| O7 `/stock/[ticker]` 的 `broker_reports` mock 与 `/api/consensus` mock 回退是否移除（总纲约束 4：占位数据） | owner | 任意；本规格不动 |
| O8 `TUSHARE_TOKEN`（5000 积分）是否提供给 `report_rc` 对账 | owner | FR-6 前；不提供则跳过对账脚本 |
| O9 F3 运行位置（Vercel 内 / 外部 worker）与 Python 依赖 | owner + F3 规格 | FR-2 前 |
| 生产：执行迁移、建桶、设置 `BROKER_RESEARCH_MIRROR_TO_RESEARCH_OS`（默认不设） | owner | 合并后 |

---

## 16. 开放问题（实施前核对）

1. Vercel 函数请求体上限的确切数值与是否影响 `commit` 路由（它不收文件体，只收 JSON）；直传签名上传 URL 在 Supabase Storage 的 TTL 与 `upsert:false` 行为需在本地栈验证。
2. F3 对扫描件 OCR 的偏移稳定性；若不稳定，OCR 文件全部字段人工框选。
3. 盈利预测表抽取（EPS / 营收预测）与规格二事实对账：后续阶段；需先定预测表 schema。
4. 同一机构不同地区实体（如某行的美国 / 香港研究部）是否作一个 `institution`：默认一个，`aliases` 收录。
5. 报告时价格为盘中价时 R8 的容差是否放宽：先按 0.005 记信息，看一批数据再定。
6. 旧表 `broker_reports` 的处置（删除 / 保留给两个 watchlist 函数）：公司研究规格确定读者后决定。
7. 详情页"最新价"链路对非 A 股的复权与币种：复用现有 `/api/quote` 行为，不新做。
8. 多标的报告（`multi_issuer`）的 `/stock` 块归属：按 `targets` 每个标的各出现一次。

---

## 17. 实施记录与偏差

（落地后补记，格式同规格一 §14。）
