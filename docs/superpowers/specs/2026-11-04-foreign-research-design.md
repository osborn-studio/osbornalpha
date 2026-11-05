# 外资研报模块 · 设计规格

日期：2026-11-04（第 4 稿，Codex 三轮审计后；审计轨迹：`docs/audits/2026-11-04-foreign-research/` —— 01 Codex 第一轮、02 Codex 第二轮、03 处置表（含第三轮处置）、04 Codex 第三轮、05 Codex 第四轮）
状态：草案，待 owner 评审（§15.2 有七项 owner 决策；其中 D1 许可确认是本模块任何对外功能的前置条件）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一：发行人、DQ 层，已落地，§14 为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二：披露事实库，设计稿，未落地）；`docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`（前向评分内核，已落地）。并行规格：文档管道 F3、判断框架 F4、评测 F6、计划三（标识符与对账）——依赖接口见 §11。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §3 与 §5。本规格逐条对照其硬约束：
- 约束 1（只用一手来源）：研报原件只来自 owner 合法持有的 PDF，由管理员上传；不抓取任何付费墙或对方网站；Tushare `report_rc` 不是来源（§6.6）。
- 约束 2（每个数字可回放）：每条证据行绑定一次不可变的解析运行（产物哈希）与——若为 LLM 抽取——一次不可变的抽取运行（原始请求 / 响应 / 提示词版本）；带 `page`、`char_start/char_end`、`available_at`（我方入库时间）与 `code_version`；每次发布留一份不可变的发布快照（§4.8）；引用跨度必须在页文本中逐字命中（§7.1 R1），否则不发布。
- 约束 3（事实与判断分层）：机构、分析师、评级标签、目标价、币种、报告时价格、发布日期是**文件事实**；标准化评级、涨跌空间、发行人归属、翻译标题、独立摘要是**派生物**（带版本与输入哈希）；机构命中率是**判断**，只经 F4 登记—结算后显示（§10）。
- 约束 4（缺失就是缺失）：报告没写目标价就没有目标价（`absent` 行记录"报告明确没有"）；没有 WACC 就不显示方法论行；不用 `report_rc` 的区间补数；详情页不显示任何没有可回放来源的"最新价"。
- 约束 5（原文私有）：PDF、全文、表格、页面图像、字段跨度、原始模型响应只在私有桶与 service_role 可达的表里；对外只有元数据、独立摘要、≤ N 字引用片段，三者受同一套许可闸门与**内容级**披露检查（§4.11、§6.4）；签名 URL 只发给管理员并逐次记录；**许可确认（D1）先于任何对外发布**，发布开关在数据库层（§4.11 `broker_research_settings`），对外前的预览只对管理员可见。
- 约束 6（UI）：遵守 `DESIGN.md` / `globals.css` tokens，zh/en 双语，图表有表格等价视图；视觉稿后续在 Claude Design 画布完成（§9.6 清单）。

---

## 1. 目标与非目标

### 1.1 目标

1. **私有馆藏。** 管理员上传合法持有的研报 PDF，每份文件绑定一条**版本化**的许可记录；文件以 sha256 内容寻址存入私有桶，永不对外分发。
2. **可回放的结构化元数据。** 机构、分析师、每个标的证券的评级 / 目标价 / 币种 / 期限 / 报告时价格、发布日期、估值方法参数（若报告写明）。每条证据行绑定解析产物与抽取运行，带页码与逐字跨度，经管理员逐字段复核后才可发布。
3. **独立摘要是派生物。** 由 LLM 基于解析文本与生效字段生成，记录模型、注册表快照、提示词版本、输入哈希；摘要中的每个数字必须落在一个生效字段上且句中含该字段的关键词（§6.4）；页面上恒定标注"OsbornAlpha 独立摘要（AI 生成，非机构原文）"。
4. **公开页面只读、可核。** `/intel/foreign-research` 列表与详情：元数据 + 独立摘要 + ≤ N 字引用片段（带页码）+ 来源抽屉；机构 / 证券维度的评级与目标价历史（跨机构分歧）；与 `/stock/[ticker]` 联动。
5. **一个发布不变量、一个发布函数。** 报告能否公开由 SQL 函数 `broker_report_publish_blockers(report_id)` 回答（复核、许可版本、必填字段、阻断性隔离项、规则回执与输入哈希、黄金集回执、内容级披露检查）；只有 `broker_report_publish()` 能把报告置为 `published`，它在行锁下对已提交状态求值并写不可变发布快照。
6. **命中率是判断。** 机构的目标价轨迹与后验表现经 F4 登记—结算；登记、修订、撤回经 outbox 事件；F4 未落地前页面只显示"评级 / 目标价历史（事实）"。

成功标准（本模块退出条件）：
- 一份管理员上传的 PDF：`sha256` 唯一；重复上传返回 `409 duplicate_document` 且桶内只有一份；`anon` 与 `authenticated` 角色对全部基表的任何操作、对全部视图的写、对桶 `broker-research` 的对象读取全部被拒；两角色对视图的 `select` 成功（真实角色集成测试 + 本地 Supabase 栈存储测试）。
- 对该 PDF 运行解析与抽取后，每条 `confirmed` / `corrected` 证据行的 `(parse_run_id, page, char_start, char_end)` 从该解析产物切出的文本与 `value_source_text` 逐字相等；任一不等 → `unverified`；`publish_blockers` 非空的报告不能进入 `published`（函数拒绝；直接 `update status='published'` 被触发器拒绝）。
- `broker_research_settings.public_enabled=false` 时，anon 直接查任何公开视图都得 0 行。
- 许可未确认、版本不匹配、`allows_public_metadata=false` 或不在有效期内时，报告在全部公开视图中消失；`allows_public_target_price=false` 时：目标价、空间、`target_*` 引用、含该数值的片段 / 摘要 / 标题都不出现（**以真实 anon 角色对视图做值级断言**）；`public_display=false` 的分析师名不出现在任何公开文本。
- 许可实质性修改后：确认清空，已批准片段与摘要回到 `draft`，列表视图整体消失，直到重新确认并重新批准。
- 黄金集评测回执（§12.4）为该**行为摘要**（`behavior_digest`，§4.3）的最新回执且 `passed=true`、`corpus_kind='gold'`、`corpus_hash = settings.approved_gold_corpus_hash`、`n_docs ≥ 30`，才允许含 LLM 字段的报告发布。
- 摘要的输入摘要（`summary_input_digest`）在生成、批准、失效、发布四处用同一列比较；物化不改变证据与解析产物时不会使已批准摘要失效。
- 分块抽取中同一 `(target_key, field, occurrence)` 的冲突候选全部保留并标记冲突组；冲突组内没有任何一行被自动选中，报告在冲突解决前被阻断 `field_pending`。
- 含 `S4_TEST_STATE` 的集成测试文件已列入 `scripts/ci/research-checks.ts::criticalSuites`，全部门禁绿；`test:storage` 在本地 Supabase 栈上绿（发布前人工门禁，§12.3）。

### 1.2 本规格之外（含明示的总纲偏差）

- 任何自动抓取（券商门户、终端、对方网站、邮件附件自动导入）。本模块的唯一入口是管理员手工上传。
- 对外提供 PDF 下载、全文检索、页面图像、表格数据（包括登录用户）。
- 盈利预测表（EPS / 营收 / 净利预测）的结构化抽取（§16 问题 3）。
- **总纲偏差（记录）**：总纲 §3.3"报告与事实对账"本期不做。原因：本期不抽取报告正文中的历史财务数字，没有可对账的左值；规格二 `financial_facts` 尚未落地。恢复条件：预测 / 历史数字表抽取入范围且规格二落地。owner 在 D1 评审时一并知悉。
- 详情页"最新价 / 与目标价的当前距离"：现有 `/api/quote` 是多提供商级联的实时头条价，无留存快照与代码谱系，不满足约束 2；本期不显示（§16 问题 7）。
- `/stock/[ticker]` 的 `broker_reports` mock 数据与 `/api/consensus/[ticker]` 的 mock 回退：**不**作为可选项——它们是占位数据（总纲约束 4）。FR-3 的同一变更中隐藏 mock 研报块、`/api/consensus` 的 mock 分支改为返回 `{source:'none'}`（§9.4）；旧表 `broker_reports` 与两个 watchlist 函数不动（§16 问题 5）。
- 把摘要镜像进 owner 的 Research OS：不做。
- Tushare `report_rc` 对账：不做（§6.6）。
- 非 PDF 格式；多租户；自建 PDF 版面解析（F3，§11.1）。
- 基准相对收益与 Brier 分数（机构不给概率）；分析师个人命中率对外（D4）。
- 拆股 / 送转的独立分类：本期把前复权与不复权序列的比值变化记为"复权不连续"（§10.3），不断言其原因。

---

## 2. 现状（2026-11-04，已核对仓库）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 1. 旧表 `broker_reports` | `supabase/migrations/20260515000000_initial_schema.sql`：`user_id` 租户表，列 `ticker, broker, rating, target_price text, target_change_pct, pdf_url, ai_summary, published_at, fetched_at`；RLS 自读（select）自写（insert），无 update/delete 策略；`20260904090000` 加 `source_key, title, source, trust_score`；被 `watchlist_alert_research_candidates` / `watchlist_research_summaries` 读取 | **不复用、不改名、不迁移** |
| 2. 页面读者 | `src/app/(app)/stock/[ticker]/page.tsx` 第 52–53、321–345 行渲染 `stock.broker_reports`，数据来自 `src/lib/data/mock.ts` 与 `src/lib/stocks/detail.ts`（空数组） | FR-3 隐藏 mock 块（§9.4） |
| 3. 共识接口 | `src/app/api/consensus/[ticker]/route.ts`：A 股 + `TUSHARE_TOKEN` → `fetchTushareReportRc`（`src/lib/data/sources/tushare.ts` 553–602 行；仓库注释称需 5000 积分，未独立核实）→ `deriveConsensus`；否则 mock 回退 | mock 回退改为 `{source:'none'}`（§9.4）；`report_rc` 定位见 §6.6 |
| 4. 文档摄入 | `src/lib/research/ingest/collectors/*`：公开披露采集；`sources.ts::ingestSource(ctx, input)` 写 `research_source_documents`（租户表、`raw_text` 不可变、`(user_id, content_hash)` 唯一） | 不把研报写进 `research_source_documents` |
| 5. 发行人解析 | `src/lib/entities/resolve.ts::resolveIssuer(client, {ticker\|cik\|lei\|isin}, {today})`，每次一个标识符，返回 `issuer_id`，无 provenance；`tickerCandidates` 模块私有；`issuers`、`issuer_securities(ticker, valid_from, valid_to, is_primary)` | 本模块自带 `parseBrokerTicker`（§5.4）；解析快照（所用 `issuer_securities` 行与 `today`）写 `targets.resolution` |
| 6. 质量设施 | `startBatch(client, input)/finishBatch(client, …)`；`batchStatusFromCounts`：`fetched>0` 且无结果 → `failed`；`failed>0` 或任一非信息错误 → 有落地则 `partial` 否则 `failed`；`quarantined` 计入"落地"；`INFO_CODES=['skipped_summary','relink']`；`quarantine(client, input)`（同键 open 唯一）；`recordAttempt(client, dataset, …)`（最后写入者胜，假定单生产者） | 复用；dataset `broker_research`；批次计数见 §6.2；新增信息码见 §7.4 |
| 7. 隔离处理 | `POST /api/admin/dq/quarantine/[id]`：`requireAdminUser`、Content-Type 与 Origin 校验、`resolveQuarantine`、`research_audit_log` | 同模式；钩子只写覆盖表（§7.3） |
| 8. 管理员 | `requireAdminUser()`（`profiles.role='admin'`）；`/admin/{dq,securities,usage}` 页面模式 | 新页 `/admin/broker-research` 同模式 |
| 9. 存储 | 私有桶 `security-snapshots`（`insert into storage.buckets … on conflict do update`，`public=false`，`file_size_limit=52428800`=50 MiB）；`src`、`scripts` 内**没有**签名 URL 调用 | 新桶同法；签名上传 / 读取 URL 与 `move` 首次引入，本地栈验证（§12.3） |
| 10. 前向评分 | `src/lib/scoring/forward.ts::scoreForward(call, bars)`：基准为调用时刻所在交易所日期**当日或之后**的首根 K 线收盘；5/20/60 交易日；`ForwardCall{market, action, at, confidence}`；`src/lib/analyst/score-store.ts` 有"基准 K 线超出取数窗口则不评分"的截断保护；K 线来自 `fetchEastmoneyKline`（东方财富适配器，支持 `qfq/hfq/none`） | §10.3 |
| 11. LLM | `resolvePlatformLlm()` 只解析配置；注册表快照 `src/lib/llm/registry/{models,providers}.json`；`ajv@8.20.0`；**没有** PDF 解析依赖 | 原始请求 / 响应由本模块留存（§4.3） |
| 12. cron | `vercel.json` 六个 cron；`CRON_SECRET` Bearer + `timingSafeEqual`；`maxDuration=300`；hnd1 | 新增每日核验 cron 与 outbox 投递 cron（§8.3） |
| 13. 测试门禁 | `criticalSuites` 精确清单；`scripts/ci/research-db.ts` 起隔离 PostgreSQL；`scripts/s4/local-db.ts` 只建 `storage.buckets` 桩表 | SQL 集成套件进 critical；存储 HTTP 套件另设 `test:storage` |
| 14. 迁移 | 最新已锁 `20261105091000_issuers.sql`；规格二预定 `20261106090000`；`database.types.ts` 手工维护 | 本规格迁移 `20261107090000_broker_research.sql`（撞号则顺延并记入 §17） |
| 15. i18n | `messages/{zh,en}/*.json` + parity 测试 | 新增 `intel.foreignResearch.*`、`admin.brokerResearch.*` |
| 16. 对方页面 | `REPORT.md` 第 58 行；总纲 §3.1：301 篇一页纸（机构、行业、评级、中英标题、当前价 / 目标价 / 空间、报告定位、核心结论、方法论、风险、代码与日期、分类计数）；交互未验证 | 只作功能参考；§3 逐项分类；不导入任何数据 |

---

## 3. 对方页面字段分类（事实 / 派生 / 判断）

| 对方展示项 | 分类 | 本规格落点 | 说明 |
|---|---|---|---|
| 机构 | 文件事实 | 证据行 `institution` → `research_institutions` | 复核时绑定 |
| 分析师 | 文件事实 | 证据行 `analyst`（多 occurrence）→ `broker_report_analysts` | 对外显示是 D4 |
| 评级 | 原始标签是事实；标准化是派生 | `targets.rating_raw` + `rating_normalized`（按报告日有效的映射行 `scale_id`） | "MIXED"是对方汇总标签，不做 |
| 中英标题 | 原文是事实；译名是派生 | `title_original` + `title_zh/title_en`（LLM 译，带运行 id）；含受限数值时另有 `title_public`（管理员改写，标注"改写"） | |
| 当前价 | 派生 | **本期不显示** | |
| 目标价 | 文件事实 | `targets.target_price, target_currency, target_horizon_months` | D3 |
| 空间 | 派生（算术） | `upside_pct = target_price / price_at_report − 1`，`upside/1`；自述空间做恒等校验（R2） | 币种不同不计算 |
| 报告定位 / 核心结论 | 派生（LLM） | `broker_report_summaries` | AI 生成标签；数字落地 |
| 方法论 | 文件事实（若写明） | 证据行 `wacc / terminal_growth / terminal_value_share` | |
| 风险与边界 | 事实（片段）+ 派生（摘要段） | `snippets(purpose='risk')` + 摘要 | |
| 标的代码与日期 | 文件事实 | `targets.ticker_as_stated`、`published_date`、`price_as_of_date` | 解析为证券 / 发行人是派生 |
| 行业 | 派生 | `industry_classifications`（规格一）或 `sector_as_stated`（事实） | |
| 分类计数 | 派生 | 列表 `count` | |
| 命中率 | 判断 | F4（§10） | |

---

## 4. 数据模型

迁移 `supabase/migrations/20261107090000_broker_research.sql`，可重放。**所有基表只授 service_role；公开读一律经 §4.11 视图**；对每个视图与函数先 `revoke all … from public, anon, authenticated` 再按需 `grant`。视图**不调用任何函数**（视图里引用的函数需调用者有 EXECUTE 权；许可谓词内联为 SQL 表达式）。`database.types.ts` 手工补齐。

表清单（21 张）：`broker_research_settings`、`broker_report_licences`、`broker_report_upload_intents`、`broker_report_documents`、`broker_report_runs`、`broker_research_reports`、`broker_report_targets`、`broker_report_target_overrides`、`broker_report_fields`、`broker_report_snippets`、`broker_report_summaries`、`broker_report_publications`、`broker_report_rule_receipts`、`broker_purge_steps`、`research_institutions`、`research_rating_scales`、`research_analysts`、`broker_report_analysts`、`broker_report_access_log`、`broker_eval_receipts`、`broker_outbox`。

### 4.1 `broker_research_settings` 与 `broker_report_licences`

`broker_research_settings(id integer primary key check (id = 1), public_enabled boolean not null default false, approved_gold_corpus_hash text null, approved_gold_corpus_by uuid null, approved_gold_corpus_at timestamptz null, updated_by, updated_at)`：单行；对外可见性谓词（§4.11）包含 `public_enabled`；`approved_gold_corpus_hash` 是 owner 批准的黄金集清单哈希（评测回执必须与之相等才能解除阻断，§4.4 第 13 条）；只 service_role 可写（管理员路由，写审计）。

`broker_report_licences`：

| 列 | 类型 / 约束 | 说明 |
|---|---|---|
| `licence_id` | uuid PK | |
| `version` | integer not null default 1 | 实质性修改 +1 |
| `source_label` | text not null check (length between 1 and 120) | 提案值（§15.3） |
| `licence_kind` | check in (`terminal_subscription`,`direct_from_broker`,`owner_authored`,`other`) | |
| `holder`, `terms_summary` | text not null | |
| `evidence_path` | text | `licences/{sha256}.pdf` |
| `allows_llm_processing` | boolean not null default false | 允许把全文送交 F3 / 平台 LLM |
| `allows_public_metadata`, `allows_public_snippets`, `allows_public_summary`, `allows_public_target_price` | boolean not null default false | D3 |
| `snippet_max_chars` | integer not null check (> 0 and ≤ 500) | N（D2） |
| `valid_from` / `valid_to` | date / date null | |
| `confirmed_by`, `confirmed_at`, `confirmed_version` | | owner 确认；`confirmed_version = version` 才算当前确认 |
| `created_at`, `updated_at` | | |

触发器 `licence_material_change`（before update）：`allows_*`、`snippet_max_chars`、`valid_from/to`、`terms_summary`、`licence_kind`、`holder` 任一变化 → `version+1`、确认三列清空；`after update` 同条件 → 该许可下所有 `approved` 片段与摘要置 `draft`（`detail.reason='licence_version'`），outbox 写 `licence.changed`（§10.5）。

**当前已确认谓词**（内联到视图与函数，不作函数调用）：`l.confirmed_at is not null and l.confirmed_version = l.version and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)`。**处理授权谓词**：当前已确认 **且** `allows_llm_processing`。

### 4.2 `broker_report_upload_intents` 与 `broker_report_documents`

`broker_report_upload_intents(intent_id PK, sha256 not null, byte_size bigint > 0, licence_id FK, original_filename, created_by not null, created_at, expires_at not null, status check in ('open','validating','validated','promoting','committed','expired','abandoned'), staging_path text not null = 'staging/{intent_id}.pdf', document_id null FK, error_code text null, checkpoint_at timestamptz)`。每个意向有自己的暂存路径；提交是一台带持久检查点的状态机（§6.1），任何一步崩溃后重试同一 `intent_id` 都从检查点续作；`committed` 时直接返回 `document_id`。

`broker_report_documents`：

| 列 | 类型 / 约束 |
|---|---|
| `document_id` PK | |
| `sha256` text not null unique `~ '^[0-9a-f]{64}$'` | |
| `storage_path` text not null unique = `reports/{sha256}.pdf` | |
| `byte_size` bigint > 0；`page_count` int null > 0 | |
| `licence_id` FK restrict | |
| `uploaded_by`, `uploaded_at`（= `available_at`）, `original_filename` | |
| `current_parse_run_id` uuid null FK runs | 最近成功解析运行 |
| `status` check in (`uploaded`,`parsing`,`parsed`,`parse_failed`,`withdrawn`) | |
| `lease_token` uuid null, `lease_until` timestamptz null | 解析 / 抽取 / 摘要互斥租约（CAS） |
| `promotion_pending` boolean not null default false | 上传提交的检查点：对象尚未从暂存路径移到正式路径（§6.1） |
| `last_verified_at` timestamptz null, `verify_status` text null check in (`ok`,`failed`,`error`) | 每日核验游标与结果；失败也推进游标 |
| `withdrawn_at`, `withdrawn_reason`, `purged_at` | |

状态迁移：`uploaded|parse_failed|parsed --parse--> parsing`；`parsing --ok--> parsed`（`current_parse_run_id` 更新）；`parsing --fail--> parse_failed`（若此前有成功解析则回到 `parsed` 且 `current_parse_run_id` 不变）；任何状态 `--withdraw--> withdrawn`。**租约围栏**：取租约 = `update … set lease_token=$t, lease_until=now()+300s where document_id=$id and (lease_until is null or lease_until < now())`；收尾写入（状态、`current_parse_run_id`、运行收尾）都带 `where lease_token=$t`，不匹配 → 运行 `failed:lease_lost` 且不改文档；过期租约在下一次取租约时被覆盖，被覆盖者的收尾因围栏失败——这就是崩溃恢复。

### 4.3 `broker_report_runs`（不可变运行）

| 列 | 说明 |
|---|---|
| `run_id` PK, `document_id` FK, `kind` check in (`parse`,`extract`,`summary`,`translate`,`verify`) | |
| `parse_run_id` uuid null FK self | `extract/summary/translate` 引用其解析运行 |
| `extractor_version` | `parse` 运行 |
| `artifact_path`, `artifact_hash` | `parse`：`reports/{sha}.extract.{run_id}.json`（**按运行**命名，永不覆盖）与其 sha256 |
| `model_id`, `registry_hash`, `prompt_version`, `schema_version`, `code_version` | LLM 运行必填 |
| `behavior_digest` text not null（`extract` 运行） | **抽取行为摘要** = sha256 of `[extractor_version, model_id, registry_hash, prompt_version, schema_version, TYPED_VERSION, MERGE_VERSION, LOCATE_VERSION, parseBrokerTicker 版本, CURRENCY_MARKS 版本]`（常量清单 `BEHAVIOR_DIGEST_INPUTS` 在 `src/lib/broker-research/behavior.ts`，单测断言清单内容）；与部署 `code_version` 无关，只有影响抽取结果的组件变化才改变它 |
| `licence_version` integer not null | 本次外部处理所依据的已确认许可版本 |
| `request_path`, `response_path` | `runs/{run_id}.request.json` / `.response.json` |
| `batch_id` FK, `status` check in (`running`,`succeeded`,`failed`), `started_at`, `finished_at`, `detail jsonb` | `detail`：`chunks`、`retries`、`error_code`、`lease_lost` |

只插入；收尾一次（`status/finished_at/detail/artifact_*`），带租约围栏。

### 4.4 `broker_research_reports`

| 列 | 类型 / 约束 | 说明 |
|---|---|---|
| `report_id` PK; `document_id` unique FK restrict | 一份文件一条报告，在首次 `extract` 或管理员"手工建报告"时创建 | |
| `revision` integer not null default 1 | 每次 `unpublish` +1 | |
| `scope` null check in (`single_issuer`,`multi_issuer`,`sector`,`macro_strategy`) | 草稿可空 | |
| `institution_id` FK null | | |
| `title_original`, `title_lang` | **可空**（草稿）；发布时必填（阻断 `report_incomplete:title`） | |
| `title_zh`, `title_en`, `title_run_id` | 派生 | |
| `title_public` text null, `title_public_by` | 原文标题含受限数值 / 受限姓名时的管理员改写（派生，标注"改写"） | |
| `published_date` date null；`price_as_of_date` date null | 发布时 `published_date` 必填 | |
| `report_type`, `sector_as_stated`, `primary_target_key` | | |
| `effective_hash` text null | 生效证据行的规范化哈希（物化输出，§6.3） | |
| `materialized_hash` text null | 最近一次物化时的 `effective_hash` | |
| `rules_input_hash` text null | **全部规则输入**的哈希（物化输出）：生效证据行 + 覆盖表行 + `institution_id` + 每个 target 选中的 `scale_id` 行 + `published_date` + 文档 `uploaded_at` + `resolution` 快照 + `RULES_VERSION`；规则回执绑定它 | |
| `summary_input_digest` text null | **摘要输入摘要**（物化输出）= sha256(`effective_hash` ‖ `current_parse_run` 的 `artifact_hash` ‖ `institution_id` ‖ `title_public`)；摘要的生成、批准、失效、发布四处只与此列比较 | |
| `title_restricted` boolean not null default false | 发布时计算：`title_original` 未通过披露检查（§4.11）；为真时引用视图排除 `title` 行，列表只显示 `title_public` | |
| `evidence_ok` boolean not null default true | 每日核验结果；`false` → 视图隐藏 | |
| `disclosure_ok` boolean not null default true | 披露输入（许可标志、分析师 `public_display`）变化后由触发器置 `false` → 视图隐藏；管理员重跑披露检查通过后置回 `true` | |
| `review_status` check in (`pending`,`in_review`,`approved`,`rejected`) | | |
| `status` check in (`draft`,`published`,`withdrawn`) default 'draft' | | |
| `current_publication_id` uuid null FK publications | 当前发布快照 | |
| `supersedes_report_id` self FK null | R7 | |
| `code_version` text not null | | |
| `created_at`, `updated_at` | | |

**发布阻断函数** `broker_report_publish_blockers(p_report_id uuid) returns text[]`（`security definer`，仅 service_role；对**已提交**状态求值）：
1. `review_not_approved`
2. `licence_unconfirmed`（当前已确认谓词为假）
3. `licence_no_public_metadata`
4. `document_not_parsed`（文档 `status <> 'parsed'`）
5. `report_incomplete:<col>`：`scope`、`title_original`、`published_date`、`institution_id` 为空
6. `required_field_missing:<field>[:<target_key>]`（§5.1）
7. `field_pending:<field>`：存在 `extracted/unverified` 状态的必填字段行
8. `target_unresolved:<target_key>`：`single_issuer`/`multi_issuer` 的任一 target `issuer_id is null` 或 `basis <> 'effective'`
9. `target_cardinality`：`single_issuer` 的 targets 发行人数 ≠ 1 或行数 < 1；`multi_issuer` 发行人数 < 2；`sector/macro_strategy` 行数 ≠ 0
10. `quarantine_open:<reason>`：`dq_quarantine` 中 `dataset='broker_research'`、`natural_key like '<sha256>:%'`、`status='open'` 且 `reason_code` ∈ 阻断集 `{upside_mismatch, currency_mismatch, date_order, nonpositive_price, unknown_rating_label, ambiguous_rating_label, ticker_issuer_conflict, unresolved_ticker}`
11. `materialize_stale`：`materialized_hash is null or materialized_hash <> effective_hash`
12. `rules_stale`：`broker_report_rule_receipts` 中不存在 `(report_id, input_hash = rules_input_hash)` 的回执，或该回执含 `passed=false` 的阻断规则
13. `eval_receipt_missing`：报告有任一生效证据行 `extractor like 'llm:%'`，而对其 `run_id` 的 `behavior_digest` 在 `broker_eval_receipts` 中按 `ran_at` 最新的回执不满足 `passed=true and corpus_kind='gold' and corpus_hash = settings.approved_gold_corpus_hash and n_docs >= 30`，或该回执 `per_field` 对报告中出现的任一字段 `tp+fn = 0`（未覆盖）；`approved_gold_corpus_hash is null` 时恒阻断
14. `summary_stale`：存在 `approved` 摘要其 `input_hash <> reports.summary_input_digest`
15. `restricted_value_in_text:<surface>`：§4.11 披露检查对以下任一面不通过：`title_public`、`title_zh`、`title_en`、任一 `approved` 片段、任一 `approved` 摘要；`title_original` 不通过且 `title_public is null` 也阻断（通过时发布函数写 `title_restricted := (title_original 不通过)`）
16. `evidence_drift`：`evidence_ok=false`；`disclosure_stale`：`disclosure_ok=false`
17. `conflict_unresolved:<field>[:<target_key>]`：存在未解决的候选冲突组（§6.2：同一 `(target_key, field, occurrence)` 有 ≥ 2 条 `extracted/unverified` 行且无生效行）

**复核就绪谓词**：`blockers − {review_not_approved}` 为空（复核页"标记已复核"的条件）。

**发布函数** `broker_report_publish(p_report_id, p_by)`：`select … for update` 报告行；`set_config('broker.publishing', p_report_id::text, true)`；求 blockers，非空 → `raise exception 'publish_blocked:' || …`；写 `broker_report_publications` 快照（§4.8）；`update status='published', current_publication_id, updated_at`；outbox `claim.register`（每个有目标价的 target）。`broker_report_unpublish(p_report_id, p_by)`：行锁；`status='draft'`、`revision+1`、快照 `unpublished_at`；outbox `claim.retract`。

触发器 `broker_reports_guard`（before insert or update）：
- 插入时 `status` 必须为 `draft`。
- 新值 `status='published'` 且旧值 ≠ → `current_setting('broker.publishing', true) = report_id::text` 必须成立，否则 `raise 'publish_direct_forbidden'`；且本次更新除 `status, current_publication_id, updated_at` 外不得改其他列。
- 旧值 `published` 且新值 `published` → 只允许 `updated_at`、`evidence_ok`、`disclosure_ok`、`supersedes_report_id` 变化；其他 → `published_immutable`。
- 发布迁移允许函数同时写 `title_restricted`（它是发布时计算的结果列）。
- 子表（`targets, target_overrides, fields, snippets, summaries, analysts`）的 before 触发器：所属报告 `published` 时拒绝，例外 `snippets/summaries` 的 `status → rejected|draft`（撤回片段 / 许可失效）。
- 文档 `withdrawn` → `after update` 把报告置 `withdrawn`（允许从 `published` 直接到 `withdrawn`，outbox `claim.retract`）。

### 4.5 `broker_report_targets` 与 `broker_report_target_overrides`

`broker_report_targets`：

| 列 | 说明 |
|---|---|
| `report_id` FK, `target_key` text；PK | `target_key` = `parseBrokerTicker` 规范化（`9988.HK`、`BABA`、`600519.SH`）；无法解析 → `stated:<逐字>`（稳定） |
| `basis` check in (`candidate`,`effective`) | `candidate`：由候选字段物化（草稿）；`effective`：全部由生效字段物化 |
| `ticker_as_stated` text not null | |
| `security_ticker` null FK `stocks_universe`; `issuer_id` null FK | |
| `resolution jsonb not null default '{}'` | `{method:'parseBrokerTicker/1', candidates, resolver:'resolveIssuer', today = uploaded_at::date（交易所无关，日期精度）, issuer_securities_row:{issuer_id, ticker, valid_from, valid_to}, override_id?}` |
| `rating_raw`, `rating_normalized`, `scale_id` FK null | |
| `target_price` numeric null, `target_currency` text null, `target_horizon_months` int null | |
| `price_at_report` numeric null, `price_currency` text null, `price_as_of_date` date null | |
| `upside_pct` numeric null, `upside_formula_version` text null | |
| `input_hash` text not null | 本行物化所依据的证据行哈希 |

`broker_report_target_overrides(override_id PK, report_id, target_key, security_ticker, issuer_id, set_by, set_at, note)`：管理员 / 隔离钩子写入的解析覆盖，物化时优先于自动解析（唯一 `(report_id, target_key)`，upsert 幂等）。

两表只由 `broker_report_materialize` 与覆盖 upsert 写入；`single_issuer` = 一个发行人、≥ 1 个标的证券（港 / 美双上市各一行，`primary_target_key` 由管理员选）。

### 4.6 `broker_report_fields`（证据行，私有）

| 列 | 类型 / 约束 |
|---|---|
| `field_id` PK, `report_id` FK cascade | |
| `parse_run_id` uuid FK runs | **所有带跨度的行必填**（人工行也绑定它当时看到的解析产物） |
| `run_id` uuid FK runs null | 抽取运行；LLM 行必填，人工行 null |
| `superseded_by_run_id` uuid null | 新抽取运行到来时，旧 `extracted/unverified` 行不删除，只标记 |
| `target_key` text null | 标的级字段必填 |
| `field` check in (`institution`,`analyst`,`published_date`,`price_as_of_date`,`ticker`,`rating`,`target_price`,`target_currency`,`target_horizon`,`price_at_report`,`price_currency`,`upside_stated`,`wacc`,`terminal_growth`,`terminal_value_share`,`valuation_method`,`sector`,`title`) | 币种是独立证据字段 |
| `occurrence` int not null default 1 | |
| `value_text` text not null; `value_num` numeric null; `value_currency` text null `~'^[A-Z]{3}$'`; `value_unit` check in (`pct`,`ratio`,`months`,`price`) null; `value_date` date null | 类型化值（§5.3 转换表） |
| `page` int null > 0; `char_start`, `char_end` int null | UTF-16 码元偏移 |
| `value_source_text` text null | |
| `extractor` text not null（`llm:<model_id>@<registry_hash>` / `human:<user_id>`）; `extractor_confidence` null | |
| `status` check in (`extracted`,`unverified`,`confirmed`,`corrected`,`rejected`,`absent`) | |
| `corrected jsonb null` | `corrected` 时非空；对象键 ⊆ `{value_text, value_num, value_currency, value_unit, value_date}`；**键存在且值为 null = 显式清空**，键不存在 = 继承原值；`value_text` 键必须存在且非 null |
| `conflict_group` text null | 分块合并时同一 `(target_key, field, occurrence)` 的多条候选共享一个组 id（§6.2） |
| `detail jsonb`, `reviewed_by`, `reviewed_at`, `created_at` | |

状态约束：`confirmed/corrected` → `page, char_start, char_end, value_source_text, parse_run_id` 非空；`absent` → `extractor like 'human:%'`、`field in ('rating','target_price','analyst','target_horizon')`、`page` 非空（封面）、跨度空、`value_text='ABSENT'`；`extracted/unverified` → `run_id` 非空。**生效值选择器**（SQL 表达式 `broker_field_effective(...)`（`immutable` 函数，仅 service_role；视图内联等价 `case` 表达式）与 TS `effectiveValue()` 同一规则）：对每个分量 k：`corrected ? k` 键存在 → 取该值（可为 null）；否则取 `value_k`；物化、引用视图、规则、摘要落地都用它。唯一表达式索引 `(report_id, coalesce(target_key,''), field, occurrence) where status in ('confirmed','corrected','absent')`。

### 4.7 `broker_report_snippets` 与 `broker_report_summaries`

片段：`snippet_id PK, report_id, target_key null, purpose check in ('rating','target','thesis','risk','method','other'), parse_run_id FK, page, char_start, char_end, text null, field_id null, status check in ('draft','approved','rejected'), disclosure_check jsonb, approved_by, approved_at, created_by, created_at`。`check (text is null or length(text) <= 500)`；`draft/approved` → `text` 非空；`approved` 触发器：`length(text) <= 当前 N` 且 `disclosure_check.passed`（§4.11）；读取时视图再按当前 N 过滤。

摘要：`summary_id PK, report_id, lang check in ('zh','en'), kind = 'independent_summary', run_id FK, input_hash（= 生成时的 reports.summary_input_digest）, summary_md, max_verbatim_overlap int, numeric_grounding jsonb, disclosure_check jsonb, status, approved_by, approved_at, generated_at`。唯一 `(report_id, lang) where status='approved'`。`approved` 触发器：`max_verbatim_overlap <= 当前 N`、`numeric_grounding.passed`、`disclosure_check.passed`、`input_hash = reports.summary_input_digest`（生成、批准、失效（§6.3 第 4 步）、发布（§4.4 第 14 条）四处都只与这一列比较）。

### 4.8 `broker_report_publications`（不可变发布快照）与 `broker_report_rule_receipts`

`broker_report_publications(publication_id PK, report_id, revision, snapshot jsonb not null, snapshot_hash text not null, licence_version int, rules_receipt_id FK, eval_receipt_id FK null, published_at, published_by, unpublished_at null, unpublish_reason null)`。`snapshot` = 报告列（含 `title_*`、`title_restricted`）+ targets + 全部生效证据行（含 `field_id, parse_run_id, run_id, artifact_hash, page, char_*, 生效值`）+ `approved` 片段**全文与出处**（`snippet_id, purpose, page, char_*, text, parse_run_id, disclosure_check`）+ `approved` 摘要**全文与出处**（`summary_id, lang, run_id, input_hash, summary_md, numeric_grounding, disclosure_check`）+ 选中的 `research_rating_scales` 行 + 覆盖表行 + 解析快照 + 披露输入（许可标志、涉及分析师的 `public_display`）。只插入；`unpublished_at` 一次性写。F4 claims 绑定 `publication_id`（§10.2）。回放 = 从快照与桶内产物重建，不依赖活表；`unpublish` 后对片段 / 摘要行的修改不影响已写快照。

`broker_report_rule_receipts(receipt_id PK, report_id, rules_version, input_hash, results jsonb, code_version, created_at)`：每次规则运行一行；`input_hash = reports.rules_input_hash`（§4.4）；阻断函数第 12 条读与当前 `rules_input_hash` 匹配的最新回执。

### 4.9 实体表

- `research_institutions(institution_id PK, name_en not null, name_zh, aliases text[], kind, rating_disclosure_url, created_at)`；唯一表达式索引 `(lower(name_en))`。
- `research_rating_scales(scale_id PK, institution_id FK, raw_label not null, normalized check in ('buy','overweight','neutral','underweight','sell','not_rated'), source_url not null, valid_from not null, valid_to null, created_by, created_at, closed_by null, closed_at null)`。触发器：只允许 `valid_to` 从 null 改为日期（同时写 `closed_by/closed_at`），其他列不可更新；唯一表达式索引 `(institution_id, lower(raw_label), valid_from)`。选择规则：`valid_from ≤ published_date < coalesce(valid_to,'infinity')` 的唯一行。已发布报告的 `scale_id` 是发布快照的一部分，新映射行**不**回溯改变已发布报告；管理员总览列出"有更新映射可用"的已发布报告，重新物化需 `unpublish`。
- `research_analysts(analyst_id PK, institution_id FK, display_name not null, name_variants text[], public_display boolean default false, created_at)`；`broker_report_analysts(report_id, analyst_id, role, field_id FK not null, primary key (report_id, analyst_id))`——每条绑定一条 `analyst` 证据行。触发器 `analyst_disclosure_change`（`after update of public_display, display_name, name_variants`）：对所有绑定该分析师的报告置 `disclosure_ok=false`，其 `approved` 片段 / 摘要置 `draft`（`detail.reason='analyst_disclosure'`）；许可的 `after update`（§4.1）对其文档下的报告同样置 `disclosure_ok=false`。

### 4.10 `broker_report_access_log`、`broker_eval_receipts`、`broker_outbox`

- 访问日志：`id, document_id, user_id, action check in ('upload','signed_url_issued','text_viewed','parse_run','extract_run','summary_run','unpublish','withdraw','purge','orphan_cleanup'), detail jsonb, created_at`。不记 IP。★ 路由先写后答。签名 URL 的后续对象 GET 由 Supabase Storage 服务，本模块不能观察（O10）。
- 评测回执：`receipt_id, corpus_kind check in ('gold','synthetic'), corpus_hash, behavior_digest not null, extractor_version, model_id, registry_hash, prompt_version, schema_version, code_version, n_docs, per_field jsonb {field:{tp,fp,fn,precision,recall}}, absence jsonb {tp,fp,fn}, precision_min, recall_min, passed, ran_at, ran_by`。匹配键是 `behavior_digest`（§4.3）；五元组列只作展示。`passed := precision_min >= 0.95 and recall_min >= 0.95`（按最差有覆盖字段；`tp+fp=0` 的 precision 与 `tp+fn=0` 的 recall 不参与 min，但阻断第 13 条要求报告出现的字段有覆盖）。`synthetic` 回执只在测试数据库出现，生产的阻断只认 `gold`。
- outbox：`event_id PK, kind check in ('claim.register','claim.revise','claim.retract','licence.changed','mapping.changed'), payload jsonb, status check in ('pending','delivered','failed'), attempts int, last_error, created_at, delivered_at`；由 `/api/cron/broker-research-outbox` 投递给 F4（§11.2），幂等键在 payload。

### 4.11 公开视图（owner `postgres`，`security_invoker=false, security_barrier=true`；每个视图 `revoke all from public, anon, authenticated; grant select to anon, authenticated`；视图不调用函数）

可见性 CTE `visible_reports`：
```sql
select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary
from broker_research_reports r
join broker_report_documents d on d.document_id = r.document_id
join broker_report_licences l on l.licence_id = d.licence_id
join broker_research_settings s on s.id = 1
where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
  and l.confirmed_at is not null and l.confirmed_version = l.version
  and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
  and l.allows_public_metadata
  and exists (select 1 from broker_report_publications p where p.publication_id = r.current_publication_id and p.licence_version = l.version)
```

| 视图 | 过滤 | 列（节选） |
|---|---|---|
| `broker_reports_public_v` | `visible_reports` | `report_id, revision, scope, institution_id, title = coalesce(title_public, title_original), title_is_rewritten = (title_public is not null), title_zh, title_en, title_is_translation, published_date, price_as_of_date, report_type, sector_as_stated, primary_target_key, available_at, code_version, published_at, supersedes_report_id, page_count, snippet_max_chars, target_price_public, summary_public` |
| `broker_report_targets_public_v` | join | `report_id, publication_id = r.current_publication_id, target_key, ticker_as_stated, security_ticker, issuer_id, rating_raw, rating_normalized, scale_id, target_price = case when allows_public_target_price then … end`（同 `target_currency, target_horizon_months, upside_pct`）, `target_price_public = allows_public_target_price, price_at_report, price_currency, price_as_of_date, upside_formula_version`；不含 `resolution, input_hash` |
| `broker_report_citations_v` | `fields where status in ('confirmed','corrected','absent')` join；排除 `field in ('target_price','target_currency','target_horizon','upside_stated') and not allows_public_target_price`；排除 `field='analyst'` 除非 `exists (broker_report_analysts a join research_analysts ra … where a.field_id = fields.field_id and ra.public_display)`；排除 `field='title' and r.title_restricted` | `report_id, target_key, field, occurrence, page, value_text/num/currency/unit/date（生效值，内联 `case` 表达式）, status, extractor_kind` |
| `broker_report_snippets_public_v` | `status='approved' and allows_public_snippets and length(text) <= snippet_max_chars` | `snippet_id, report_id, target_key, purpose, page, text, field_id` |
| `broker_report_summaries_public_v` | `status='approved' and allows_public_summary` | `summary_id, report_id, lang, kind, model_id, registry_hash, prompt_version, input_hash, summary_md, generated_at` |
| `broker_analysts_public_v` | `public_display` | `report_id, analyst_id, display_name, institution_id, role` |
| `broker_rating_history_v` | 来自 `targets_public_v`；排除被取代的前任（`report_id in (select supersedes_report_id from visible_reports where supersedes_report_id is not null)`）；`lag(...) over (partition by institution_id, security_ticker, target_currency order by published_date, report_id)` | `report_id, prev_report_id, institution_id, security_ticker, issuer_id, published_date, prev_published_date, rating_normalized, prev_rating_normalized, scale_id, prev_scale_id, target_price, prev_target_price, target_currency, upside_formula_version, prev_upside_formula_version, code_version, prev_code_version, available_at, prev_available_at` |
| `research_institutions_public_v`、`research_rating_scales_public_v` | `join broker_research_settings s on s.id=1 where s.public_enabled`，且机构（或映射行所属机构）在 `visible_reports` 中至少出现一次 | 开关关闭时同样 0 行 |

**内容级披露检查**（`src/lib/broker-research/disclosure.ts`，`DISCLOSURE_VERSION='disclosure/1'`；在片段 / 摘要批准、标题发布阻断第 15 条时执行，结果存 `disclosure_check`）：对文本 T 与报告的 targets 与分析师：
- 若 `allows_public_target_price=false`：T 中任一数字 token（去千分位、货币符号、百分号后的规范化值）等于任一 target 的 `target_price` 或 `|upside_pct|`（百分数与小数两种写法、四舍五入到 1 位小数后比较）→ 不通过 `restricted_value:target`。
- 对 `public_display=false` 的分析师：T 含 `display_name` 或任一 `name_variants`（大小写无关，CJK 直接子串）→ 不通过 `restricted_name`。
- 检查面：`title_original`、`title_public`、`title_zh`、`title_en`、每条片段、每条摘要；检查输入 = 当前 targets 的目标价 / 空间 + 当前许可标志 + 当前分析师披露状态；结果与输入哈希一起存 `disclosure_check {version, inputs_hash, passed, hits[]}`。
- 许可版本变化或分析师披露变化 → 片段 / 摘要回 `draft`、报告 `disclosure_ok=false`；管理员"重跑披露检查"重算后置回 `true`（已发布报告允许此列变化，§4.4 守卫）。**重跑规则**（按 Codex 第四轮 FR4-02 处方实施，未再审计）：重跑沿用发布时的标题策略——`title_original` 不通过在存在通过检查的 `title_public` 替代且 `title` 引用行被抑制（`title_restricted=true`）时视为允许；只检查 `approved` 的片段与摘要，不检查未发布的草稿；若恢复需要改变 `title_restricted`，则必须 `unpublish` 后重新发布。

集成测试：真实 `anon` 与 `authenticated` 角色——基表全拒、视图写拒、`rpc` 全拒（本模块函数无一对两角色开放）、视图读成功；可见性 CTE 每个条件翻转；`public_enabled=false` → 全部视图 0 行；目标价不可公开时在全部视图中**值不出现**；N 调小后超长片段消失；`lag` 分区与排序；被取代前任不出现在历史。

### 4.12 原文桶 `broker-research`

`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('broker-research','broker-research', false, 52428800, array['application/pdf','application/json','image/png']) on conflict (id) do update set public=false, …`。路径：`staging/{intent_id}.pdf`、`reports/{sha}.pdf`、`reports/{sha}.extract.{run_id}.json`、`reports/{sha}.pages.{run_id}/{n}.png`、`runs/{run_id}.{request|response}.json`、`licences/{sha}.pdf`、`settlements/{claim_id}/{settled_at}/*`（F4）。无任何 `storage.objects` 策略：anon / authenticated 无访问。F3 以 service_role 只写 `reports/{sha}.extract.{run_id}.json` 与 `reports/{sha}.pages.{run_id}/`。

### 4.13 权限小结

| 对象 | anon / authenticated | service_role |
|---|---|---|
| 21 张基表 | `revoke all` | 全部 |
| §4.11 视图 | 仅 `select` | `select` |
| 全部函数（`publish_blockers`、`publish`、`unpublish`、`materialize`、`field_review`、`field_add`、`field_effective`、`extract_commit`、`quarantine_resolve`） | `revoke execute from public, anon, authenticated` | `execute` |
| 桶 | 无 | 全部 |

### 4.14 数据访问契约 `src/lib/broker-research/db.ts`

```ts
export interface BrokerResearchDb {
  // 私有（service_role）
  findDocumentBySha(sha256): Promise<DocumentRow|null>; insertDocument(row): Promise<void>;
  claimLease(documentId, token, ttlSeconds): Promise<boolean>;             // CAS
  fencedUpdateDocument(documentId, token, patch): Promise<'ok'|'lease_lost'>;
  insertIntent(row): Promise<void>; transitionIntent(intentId, from, to, by, patch?): Promise<boolean>;   // CAS
  listLicences(); upsertLicence(row); confirmLicence(licenceId, by, version): Promise<'confirmed'|'version_mismatch'>;
  setPublicEnabled(flag, by): Promise<void>;
  insertRun(row); finishRun(runId, token, patch): Promise<'ok'|'lease_lost'>;
  ensureReport(documentId, codeVersion): Promise<ReportRow>;                // 不存在则建 draft
  updateReportDraft(reportId, patch): Promise<void>;
  insertCandidateFields(reportId, runId, rows): Promise<void>; markSuperseded(reportId, oldRunId, newRunId): Promise<void>;
  fieldReview(fieldId, action, payload, by): Promise<MaterializeReceipt>;   // rpc('broker_field_review')：状态变更 + 物化，同一事务
  insertHumanField(row, by): Promise<MaterializeReceipt>;                   // 同上
  upsertTargetOverride(row): Promise<MaterializeReceipt>;
  materialize(reportId): Promise<MaterializeReceipt>;                       // rpc('broker_report_materialize')
  insertRuleReceipt(row): Promise<void>;
  insertSnippet(row); setSnippetStatus(snippetId, patch); insertSummary(row); setSummaryStatus(summaryId, patch);
  publishBlockers(reportId): Promise<string[]>; publish(reportId, by): Promise<void>; unpublish(reportId, by, reason): Promise<void>;
  reviewQueue(opts); logAccess(row); insertEvalReceipt(row); latestEvalReceipt(tuple): Promise<EvalReceipt|null>;
  enqueueOutbox(event); takePendingOutbox(limit); markOutbox(eventId, outcome);
  insertPurgeStep(documentId, step, outcome); purgeSteps(documentId);
  // 公开（anon 客户端，只读视图）
  publicReports(filter); publicReport(reportId);   // 六次视图查询
  ratingHistory(opts: {securityTicker, institutionId?, currency?, limit});
}
```

`MaterializeReceipt = {effectiveHash, materializedHash, targets: number, basis: 'candidate'|'effective'|'mixed'}`。三种实现：`supabaseBrokerResearchDb`、`memoryBrokerResearchDb`（单测；实现触发器 / 函数的等价规则）、`pgBrokerResearchDb`（集成测试直连）。批次 / 隔离 / 新鲜度仍用规格一 `TableClient`。

---

## 5. 字段契约、Schema 与转换

### 5.1 必填与可选

| 字段 | `single_issuer` / `multi_issuer`（每 target） | `sector` / `macro_strategy` |
|---|---|---|
| `institution`、`published_date`、`title` | 必填（报告级） | 必填 |
| `ticker` | 每 target 一条 | — |
| `rating` | `confirmed/corrected` 或 `absent` | — |
| `target_price` | `confirmed/corrected` 或 `absent`；非 absent 时 `target_currency`、`price_at_report`、`price_currency`、`price_as_of_date` 必填，`target_horizon` 可 `absent` | — |
| `analyst` | 可选（多 occurrence 或 `absent`） | 可选 |
| `wacc` 等方法论 | 可选 | — |
| `sector` | 可选 | 必填 |

### 5.2 抽取 Schema `extract-schema/1`（ajv）

`Evidence = { value: string, page: int ≥ 1, quote: string ≤ 400 字（提案）, confidence: 0..1 }`。顶层：

```
{ scope, institution: Evidence, analysts: Evidence[], published_date: Evidence, title: Evidence,
  sector?, valuation_method?, wacc?, terminal_growth?, terminal_value_share?: Evidence,
  targets: Array<{ ticker: Evidence, exchange_hint?: string,
                   rating?: Evidence, target_price?: Evidence, target_currency?: Evidence,
                   target_horizon_months?: Evidence,
                   price_at_report?: Evidence, price_currency?: Evidence, price_as_of_date?: Evidence,
                   upside_stated?: Evidence }> }
```

币种是独立 Evidence：`quote` 必须是页面上出现的币种标记（`US$`、`HK$`、`USD`、`Rmb`…），`value` 是 ISO 代码（映射表 `CURRENCY_MARKS/1` 版本化）。`additionalProperties: false`；不合 schema → 重试一次（提案）→ 仍失败则运行 `failed:llm_schema_invalid`。`quote` 定位：首次逐字命中（UTF-16 码元）；未命中 → `unverified`；多处 → `detail.multiple_hits`。

### 5.3 类型化转换（`src/lib/broker-research/extract/typed.ts`，`TYPED_VERSION='typed/1'`）

| 字段 | `value_text` | `value_num` | `value_currency` | `value_unit` | `value_date` |
|---|---|---|---|---|---|
| `target_price`, `price_at_report` | 规范化数字串 | 数值 | 来自同 target 的 `*_currency` 字段**生效值**（物化时合并；证据行本身不填） | `price` | |
| `target_currency`, `price_currency` | ISO 代码 | | ISO 代码 | | |
| `upside_stated`, `wacc`, `terminal_growth`, `terminal_value_share` | 原串 | 小数（`12.5%` → 0.125） | | `pct` | |
| `target_horizon` | 原串 | 月数 | | `months` | |
| `published_date`, `price_as_of_date` | 原串 | | | | ISO 日期 |
| 其他 | 原串 | | | | |

转换失败（如 `"n/a"`）→ `value_num/date` 为 null，字段仍可确认，但物化不产生数值；必填数值字段无数值 → 阻断 `required_field_missing`。复核的 `correct` 载荷：`{valueText, valueNum?, valueCurrency?, valueUnit?, valueDate?, page, charStart, charEnd}`，服务端按同一转换表校验类型一致。

### 5.4 券商代码解析 `parseBrokerTicker(stated, exchangeHint?)`（`parseBrokerTicker/1`）

输入 `BABA US`、`BABA.N`、`9988 HK`、`9988.HK`、`600519 CH`、`600519 SS`、`NVDA UW` 等；输出 `target_key` 与宇宙代码候选；无法解析 → `target_key='stated:<逐字>'`、候选空。候选逐个 `resolveIssuer(client, {ticker}, {today: uploaded_at 的 UTC 日期})`；解析快照（所用 `issuer_securities` 行）写 `resolution`；全部无 → 隔离 `unresolved_ticker`；多候选不同发行人 → 隔离 `ticker_issuer_conflict`；覆盖表优先（§4.5）。

### 5.5 可回放

给定发布快照：`runs/{run_id}.*` + `reports/{sha}.extract.{parse_run_id}.json` + 快照内证据行 → `scripts/broker-research/replay.ts --publication <id>` 重建全部候选与生效值并与快照比对，不写库。候选行永不删除（`superseded_by_run_id`），所以历史抽取结果可逐行对照。

---

## 6. 处理流程

### 6.1 上传

1. 浏览器算 sha256；`POST …/documents/intent {sha256, byte_size, licence_id, original_filename}`：`documents.sha256` 已存在 → `409 duplicate_document {document_id}`；写意向（`open`，`expires_at = now() + 2 小时`，与 Supabase 签名上传 URL 文档有效期一致，本地栈验证）；签发 `createSignedUploadUrl('staging/{intent_id}.pdf')`；返回 `{intentId, uploadUrl, token}`。
2. 浏览器直传暂存路径。
3. `POST …/documents/commit {intentId}`（可重复调用；每步是持久检查点，重试从意向当前状态续作；同一意向并发调用由 CAS 串行化，失败者 `409 intent_busy`）：
   - `open → validating`（CAS；`created_by` 必须是当前管理员，过期 → `expired`，`409 intent_mismatch`）：下载暂存对象、复算 sha256 / 大小 / `%PDF-` 头；不符 → 删**暂存对象**、意向 `abandoned`、`422 …`；相符 → `validated`（`checkpoint_at`）。
   - `validated → promoting`：插入 `documents(status='uploaded', promotion_pending=true)`；`documents.sha256` 唯一冲突 → 删自己的暂存对象、意向 `abandoned`、`409 duplicate_document`（已存在文档 id 返回）；成功 → 意向写 `document_id`。
   - `promoting`：`move(staging → reports/{sha}.pdf)`；若正式路径已存在且暂存已不存在（上次在 move 之后崩溃）视为已完成；若两者都不存在 → 文档 `withdrawn(reason='promotion_lost')`、意向 `abandoned`、`500 promotion_lost`；完成 → `documents.promotion_pending=false`、意向 `committed`、日志 `upload`、审计。
   - **`promotion_lost` 的恢复**（按 Codex 第四轮 FR4-01 处方实施，未再审计）：对 `promotion_lost` 的文档，允许创建一个**绑定既有 `document_id`** 的替换上传意向（`intents.document_id` 预填，`intent` 路由对该 sha 不再返回 `duplicate_document`）；提交时续作提升进入该文档，而不是插入另一条 sha 行；在校验与提升成功之前文档保持 `withdrawn` 且不可访问；成功后 `withdrawn_at/withdrawn_reason` 清空、`status='uploaded'`、`promotion_pending=false`。
   - `committed`：直接 `200 {documentId}`。
   `promotion_pending=true` 的文档对解析 / 抽取 / 签名 URL 一律 `409 promotion_pending`。
4. 过期意向：管理员"清理孤儿对象"只删 `staging/` 下其意向 `expired/abandoned` 的对象，从不删 `reports/`。

### 6.2 解析与抽取（两个独立管理员动作，各自请求、各自 `maxDuration=300`）

**parse**：处理授权谓词为真（否则 `409 licence_forbids_processing`）；取租约（失败 `409 lease_held`）；文档 `parsing`；插入 `runs(kind='parse', licence_version)`；F3 `extractDocument`（deadline = 请求剩余 − 20 s，提案）；成功 → 围栏写 `artifact_path/hash`、文档 `parsed` + `current_parse_run_id`；失败 → 运行 `failed`，文档回 `parse_failed`（无先前成功）或 `parsed`（有）；释放租约。批次 `producer='broker-research-parse'`：成功 `counts={fetched:1, inserted:1}` → `success`；失败 `counts={fetched:1, failed:1}` + 非信息错误 → `failed`（`accounted=1`，`landed=0`）。

**extract**：文档 `parsed` 且 `promotion_pending=false`；处理授权；租约；`ensureReport`；插入 `runs(kind='extract', parse_run_id=current, behavior_digest, …)`；平台 LLM（无 → `llm_unavailable`）；按页分块：每块 ≤ `CHUNK_PAGES`（提案 8 页）且 ≤ 模型上下文的 60%（提案），每块同 schema；请求 / 响应原文入桶；ajv；定位。
**分块合并**（`merge.ts`，`MERGE_VERSION='merge/1'`）：候选身份 = `(target_key, field, occurrence)`；`target_key` 由各块的 `ticker` 证据经 `parseBrokerTicker` 规范化；`analyst`/`ticker` 的 `occurrence` 按规范化值（去空白、大小写无关）分配，不同值 = 不同 occurrence，同值跨块 = 同一 occurrence 只保留一条（页码最小者，`detail.merged_from=[chunk…]`）；其余字段同一身份出现 ≥ 2 个**不同**规范化值 → 全部保留、共享一个 `conflict_group`，**没有任何一条被自动选中**，复核页以冲突组展示，管理员 `confirm` 其一（其余自动 `rejected`）；`confidence` 只作展示，不参与选择。
写入经单个 RPC `broker_extract_commit(document_id, lease_token, run_id, candidate_rows)`：函数内校验 `lease_token` 相等**且** `lease_until > now()`（否则 `lease_lost`，不写任何行）、`markSuperseded` 旧候选、插入候选、调用物化（候选基准），同一事务。随后 TS 跑规则 → 回执（`input_hash=rules_input_hash`）；隔离；`finishBatch`：六计数器全部显式给出：`fetched = 候选行数`、`inserted = 已定位行数`、`duplicates = 0`、`versioned = 0`、`quarantined = 隔离项数`、`failed = 0`；`unverified > 0` → 非信息错误 `span_unverified_summary`；`quarantined > 0` → 非信息错误 `rules_failed_summary`（否则 `batchStatusFromCounts` 把只有隔离的批次判为 `success`）；两者使批次 `partial`；LLM / schema 失败 → `fetched=0` + 非信息错误 → `failed`。手动的 parse / extract / summary **不**调用 `recordAttempt`（它维护连续错误与最近成功状态，假定单生产者；并发管理员会互相覆盖）；数据集新鲜度只由每日核验 cron（单生产者）写（§8.3）。释放租约。请求级取消：无；`running` 超过租约 TTL 的运行在下一次取租约时标 `failed:lease_expired`。

### 6.3 复核与物化

**物化函数** `broker_report_materialize(p_report_id)`（SQL，行锁）：
1. `effective_hash` := 生效证据行（`confirmed/corrected/absent`）按 `(target_key, field, occurrence)` 排序的规范化 JSON 的 sha256。
2. 每个 `target_key`（来自 `ticker` 字段，候选或生效）生成 targets 行：`basis='effective'` 若该 target 全部必填字段都生效，否则 `candidate`；数值用生效值选择器；`rating_normalized/scale_id` 按 `published_date` 选映射行（无 / 多 → 空）；币种来自同 target 的 `*_currency` 字段；`upside_pct` 仅当两币种相等且两值都有；解析：覆盖表 > `resolution` 快照（由 TS 在插入候选时写入）；`input_hash` 为该 target 证据哈希。
3. 报告级列（`title_original` 等）从生效 / 候选字段同步（草稿允许空）；`materialized_hash := effective_hash`；`rules_input_hash := sha256(生效行 ‖ 覆盖行 ‖ institution_id ‖ 选中的 scale 行 ‖ published_date ‖ uploaded_at ‖ resolution ‖ RULES_VERSION)`；`summary_input_digest := sha256(effective_hash ‖ current_parse_run.artifact_hash ‖ institution_id ‖ coalesce(title_public,''))`。
4. `approved` 摘要 `input_hash ≠ summary_input_digest` → `draft`（证据与解析产物未变时该值不变，摘要不失效）。
5. 返回回执。**不**调用 TS、不调用 F4。

**复核 RPC** `broker_field_review(p_field_id, p_action, p_payload, p_by)`：**先** `select … for update` 父报告行（`published` → `published_immutable`），再在同一事务内改字段状态（`confirm/correct/reject/absent`；`confirm` 一条冲突组成员时同组其余候选置 `rejected`）并调用物化；人工新增 `broker_field_add(...)`、覆盖 upsert、机构 / 分析师绑定同样先锁父行。之后 TS 运行 §7 规则（输入 = 物化后的 targets 与生效行），写 `rule_receipts(input_hash=rules_input_hash)`，新的不通过项隔离。并发：物化与发布都对报告行加锁；发布在锁下重新读取 `effective_hash`、`materialized_hash`、`rules_input_hash` 与回执，不一致 → 阻断 11/12。

复核页动作：`confirm`、`correct`（类型化载荷）、`reject`、`add`、`absent`、绑定机构 / 分析师（分析师绑定指向 `analyst` 证据行）/ `scope` / `report_type` / `primary_target_key` / `supersedes_report_id` / `title_public`、解析覆盖。"标记已复核"条件 = 复核就绪谓词（§4.4）。

### 6.4 独立摘要

处理授权；租约；`runs(kind='summary')`；输入 = 解析文本 + 生效字段 JSON；`input_hash := reports.summary_input_digest`（§6.3）；提示词 `prompts/independent-summary.v1.md`：四段，禁止逐字引用，禁止生效字段之外的数字，**每个数字必须以"<标的代码> 的 <字段名> <数值 单位>"的形式出现**（提示词给出模板）；输出后三项检查：(a) `max_verbatim_overlap`（`overlap.ts`）；(b) **数值落地**（`grounding.ts`，`GROUNDING_VERSION='grounding/1'`）：把摘要按句切分；每个含数字的句子必须**恰好**匹配一条断言模式 `(<target_key 或 ticker_as_stated>)? <字段关键词> <数值><单位>`，并满足：(i) 字段关键词 ∈ `GROUNDING_KEYWORDS[field]`（版本化）；(ii) 报告有多个 target 时句中必须出现该 target 的代码，单 target 时可省略；(iii) 规范化数值 **且单位**（`pct/price/months`）与该 `(target_key, field)` 的生效值相等（百分数 / 小数两写法、四舍五入 1 位小数）；(iv) 同一句内出现的每个数字都各自满足 (i)–(iii)——一句含"目标价 100 与营收 100"时"营收"不在关键词表，整句不通过。**标识符处理**（按 Codex 第四轮 FR4-03 处方实施，未再审计）：扫描数值断言之前先把可识别的标的标识符（`target_key`、`ticker_as_stated`、`security_ticker`，如 `9988.HK`）切分为标识符 token；标识符中的数字只用于确定 target 身份，不参与数值检查；每个含数字的句子要求**恰好一条**字段断言，句中其余每个数字 token 都必须属于该断言的数值或单位，否则该句不通过。结果 `numeric_grounding = {version, passed, assertions:[{sentence_idx, target_key, field, value, unit, field_id}]}`；任一不通过 → `rejected:summary_ungrounded`；(c) 披露检查（§4.11）。zh / en 各自生成。管理员 `approve`（触发器复核 §4.7 四条件，`input_hash = reports.summary_input_digest`）。

### 6.5 发布、取消发布、撤回、清除

- `publish` → `rpc('broker_report_publish')`；拒绝 → `409 publish_blocked:<reasons>`。
- `unpublish {reason}` → `rpc('broker_report_unpublish')`；之后可编辑；重新发布产生新快照。
- `withdraw {reason, purge?}` → 文档 `withdrawn`、报告 `withdrawn`、outbox `claim.retract`；日志。
- `purge=true`：步骤表 `broker_purge_steps(document_id, step, status, attempts, last_error, at)`，步骤：`pdf`、`artifacts`（`extract.*`、`pages.*`）、`runs`（`runs/{run_id}.*`）、`fields_text`（`value_source_text := null`、状态 `rejected`）、`snippets_text`（`text := null`、`rejected`）、`summaries`（`rejected`；文本按 O11 删或留）、`quarantine_payload`（`payload := '{}'`）；`POST …/documents/[id]/purge` 可重复调用，只重试未成功步骤；全部成功后 `purged_at`。
- `withdrawn` 文档：`parse/extract/summary/url/pages/reports/[id]（★）` 一律 `410 document_withdrawn`。

### 6.6 Tushare `report_rc` 的定位

`fetchTushareReportRc` 返回 Tushare 汇总的卖方盈利预测行（上游未注明、无文件、无页码、A 股限定、目标价为区间）。它不能建立报告原件、许可、引用位置、币种、报告时价格、分析师身份、单一目标价。本模块不用它：不生成行、不对账。

---

## 7. 规则与隔离

### 7.1 规则（`rules.ts`，`RULES_VERSION='broker-rules/1'`；参数在 `RULES_PARAMS`）

| 规则 | 内容 | 不通过 | 阻断 |
|---|---|---|---|
| R1 `span_verbatim` | 带跨度的证据行：`value_source_text === sliceText(artifact(parse_run_id), loc)`；`absent` 行不适用（由约束保证形状） | 字段 `unverified` | 是（第 7 条） |
| R2 `upside_identity` | `upside_stated` vs `target/price − 1` 差 ≤ 0.005（总纲 §3.6） | 隔离 `upside_mismatch` | 是 |
| R3 `currency_market` | `target_currency`/`price_currency` ∈ `security_ticker` 市场允许币种（`.SH/.SZ/.BJ`: CNY；`.HK`: HKD；美股: USD）；无 `security_ticker` 不检 | 隔离 `currency_mismatch` | 是 |
| R4 `date_order` | `price_as_of_date ≤ published_date ≤ uploaded_at::date` | 隔离 `date_order` | 是 |
| R5 `rating_scale_unique` | 映射行恰一 | 隔离 `unknown_rating_label` / `ambiguous_rating_label` | 是 |
| R6 `positive_prices` | 生效 `value_num > 0` | 隔离 `nonpositive_price` | 是 |
| R7 `possible_version` | 同机构 + 同 `security_ticker` + 日期差 ≤ 7 天 + 标题 Jaccard ≥ 0.8（提案，D7） | 隔离 `possible_version` | 否 |
| R8 `summary_overlap` / `summary_grounding` / `disclosure` | §6.4、§4.11 | 摘要 / 片段 `rejected` | 批准条件 |
| R9 `ticker_resolution` | 每 target 唯一发行人 | 隔离 `unresolved_ticker` / `ticker_issuer_conflict` | 是 |
| R10 `horizon_present_with_target` | 有目标价、无期限、无 `absent(target_horizon)` | 信息码 `rule_warning_summary` | 否 |

### 7.2 隔离键

`quarantine(client, {dataset:'broker_research', table:'broker_research_reports', naturalKey:`${sha256}:${rule}:${target_key??'-'}`, reasonCode, payload（值与页码，无跨度文本）, batchId})`。

### 7.3 处理钩子

`POST /api/admin/dq/quarantine/[id]` 对 `dataset='broker_research'` 不走 TS 的 `resolveQuarantine`，而是调用 SQL 函数 `broker_quarantine_resolve(p_id, p_status, p_by, p_payload)`，**一个事务**内按序：(1) `select … for update` 隔离行，`status <> 'open'` → 返回 `already_resolved`，不做任何写；(2) `select … for update` 所属报告行（`published` → 抛 `published_immutable`）；(3) 按 `reason_code` 写覆盖 / 映射行（§4.5 覆盖表 upsert、§4.9 映射行插入；参数缺失 → 抛 `hook_params_required`，事务回滚）；(4) 调用物化；(5) 翻转隔离行并写 `resolved_by/at`。竞争的两个管理员：后者在 (1) 得 `already_resolved`，没有任何写发生；没有补偿删除。路由把函数结果映射为与 `resolveQuarantine` 相同的 `resolved/not_found/already_resolved` 并写 `research_audit_log`。
- `unknown_rating_label/ambiguous_rating_label` + accept：`{normalized, source_url, valid_from}` → 插映射行（唯一索引幂等）→ `materialize`。
- `unresolved_ticker/ticker_issuer_conflict` + accept：`{target_key, security_ticker}` → `upsertTargetOverride` → `materialize`。
- `possible_version` + accept：`{supersedes_report_id}`。
- `reject`：报告 `review_status='rejected'`。

### 7.4 批次信息码

新增 `INFO_CODES`：`rule_warning_summary`、`eval_receipt_absent`。非信息码：`f3_failed`、`f3_timeout`、`lease_lost`、`lease_expired`、`llm_unavailable`、`llm_quota`、`llm_schema_invalid`、`span_unverified_summary`。

---

## 8. 接口

### 8.1 公开只读（anon 客户端，只读视图；`force-dynamic`；**全部响应 `Cache-Control: no-store`**）

撤回保证：撤回 / 取消发布 / 许可变更 / 关闭开关提交后，之后的任何请求不再包含该内容；已送达客户端的响应无法召回。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/broker-research/reports` | `institution`、`ticker`（宇宙代码；经 `resolveIssuer` → 匹配 `targets.issuer_id`；无 → 404 `unknown_ticker`）、`rating`、`scope`、`from`/`to`、`limit`（默认 50、最大 200，提案）、`cursor` | `{reports:[{reportId, revision, scope, institution:{id,nameEn,nameZh}, targets:[{targetKey, tickerAsStated, securityTicker, issuerId, rating:{raw, normalized, scaleId}, target:{price, currency, horizonMonths}\|null, priceAtReport:{value, currency, asOf}\|null, upsidePct, upsideFormulaVersion}], title:{text, isRewritten, zh, en, isTranslation}, publishedDate, reportType, sectorAsStated, availableAt, codeVersion, hasSummary:{zh,en}, snippetCount, targetPricePublic}], nextCursor, count}` |
| `GET /api/broker-research/reports/[reportId]` | — | 上述 + `citations[]`（含 `targetKey, field, occurrence, page, valueText, valueNum, valueCurrency, valueUnit, valueDate, status, extractorKind`）、`snippets[]`、`summaries{}`（含 `label:'independent_summary'`）、`analysts[]`、`licence:{snippetMaxChars, targetPricePublic, summaryPublic}`、`settlement`（F4 前 `null`）。白名单序列化 |
| `GET /api/broker-research/institutions` | — | |
| `GET /api/broker-research/history` | `ticker`（必填）、`institution`、`currency`、`limit` | `broker_rating_history_v` 行 |
| `GET /api/broker-research/by-ticker/[ticker]` | `limit`（默认 5） | |

### 8.2 管理员（`requireAdminUser()`；POST 校验 `Content-Type` 与 `Origin`；★ = 返回全文 / 跨度 / 签名 URL：先写访问日志、`withdrawn` → 410）

| 路径 | 作用 |
|---|---|
| `GET/POST/PATCH …/licences[/[id]]`、`POST …/licences/[id]/confirm {version}` | `409 version_mismatch` |
| `POST …/settings/public {enabled}` | 开关（写审计）；开启条件由 §14 FR-6 的人工门禁保证，路由只记录谁开的 |
| `POST …/documents/intent`、`POST …/documents/commit`、`POST …/documents/orphan-cleanup` | §6.1 |
| ★ `GET …/documents/[id]/url` | 签名 URL `expiresIn=600`（提案）；`no-store` |
| `POST …/documents/[id]/parse`、`…/extract`、`…/reports/[id]/summary {lang}`、`…/reports/[id]/translate` | §6.2、§6.4；`409 lease_held` / `409 licence_forbids_processing` |
| `POST …/documents/[id]/withdraw {reason, purge?}`、`POST …/documents/[id]/purge` | §6.5 |
| `GET …/review-queue?status=&receipt=` | |
| ★ `GET …/reports/[id]`、★ `GET …/documents/[id]/pages/[n]` | 复核数据；`text_viewed` |
| `POST …/reports/[id]/fields/[fieldId] {action, payload}`、`POST …/reports/[id]/fields {…}`、`POST …/reports/[id]/fields/absent {field, targetKey?, page}`、`POST …/reports/[id]/bind {…}`、`POST …/reports/[id]/overrides {targetKey, securityTicker}` | §6.3 |
| `POST …/reports/[id]/snippets {…}`、`POST …/snippets/[id] {action}`、`POST …/summaries/[id] {action}` | |
| `POST …/reports/[id]/review {action}`、`GET …/reports/[id]/publish-blockers`、`POST …/reports/[id]/publish`、`POST …/reports/[id]/unpublish {reason}` | |
| `GET …/access-log?document=`、`GET …/publications/[id]`（快照） | |

### 8.3 cron（`CRON_SECRET`，`vercel.json` 在 FR-5 登记）

- `/api/cron/broker-research-verify`（每日）：按 `documents.last_verified_at` 升序（null 最先）取文档，预算 250 s（提案），对已发布报告的生效证据行重跑 R1；**无论结果如何都写 `last_verified_at=now()` 与 `verify_status`**（`ok` / `failed`=不一致 / `error`=产物不可读），失败文档不会饿死后面的文档；不一致 → `evidence_ok=false`（视图即时隐藏）+ `dq_quarantine(reason='span_drift')`；产物不可读 → `evidence_ok=false` + 隔离 `artifact_unreadable`。回执 `producer='broker-research-verify'`；这是本 dataset **唯一**的 `recordAttempt` 调用者（`cadence:'daily'`）。管理员处理后"重跑核验"（单文档路由）通过则 `evidence_ok=true`。
- `/api/cron/broker-research-outbox`（每 10 分钟，提案）：投递 `pending` 事件到 F4（§11.2），失败重试（`attempts` ≤ 10 后 `failed` 并进管理员总览）。F4 未落地时 cron 不登记，事件积压在表里。

---

## 9. 页面与 UI 流程

### 9.1 路由与导航

- 公开：`/intel/foreign-research`、`/intel/foreign-research/[reportId]`、`/intel/foreign-research/institutions/[institutionId]`；入口 `/intel` 页签、`/stock/[ticker]` 块。
- 管理员：`/admin/broker-research`、`…/upload`、`…/licences`、`…/documents/[documentId]`、`…/review/[reportId]`、`…/institutions`、`…/access-log`、`…/preview/[reportId]`。
- **对外前预览**：`broker_research_settings.public_enabled=false` 时公开视图返回 0 行、公开路由与页面 404；管理员预览页用 service_role 读基表渲染与公开页同一组件（标注"预览 · 未对外"）。

### 9.2 列表页状态

| 状态 | 表现 |
|---|---|
| 正常 | 筛选条 + 表格（机构 / 标的 / 标题 / 日期 / 评级原文+标准化 / 目标价（许可允许时）/ 空间 / 摘要有无）；顶栏"馆藏 n 篇 · 机构 m 家 · 最近入库 日期" |
| 空馆藏 | "尚无已发布研报。研报由管理员上传并经许可确认后发布。" |
| 筛选无结果 | "没有符合条件的报告" + 清除筛选 |
| 目标价不可公开 | 列显示"—（许可不允许公开）" |
| 加载失败 | 错误条 + 重试；不回退 mock |

### 9.3 详情页

顶部：机构、标题（`title_public` 时标注"改写"；译名标注"译 · 模型 id"）、发布日期、报告类型、标的 chip。
事实区（每 target 一表）：评级原文 / 标准化（映射行与出处）、目标价 + 币种 + 期限、报告时价格 + 币种 + 日期、空间（"派生 · upside/1"）、方法论参数。来源抽屉：`私有馆藏（不对外提供原文）· 第 p 页 · LLM 抽取 / 人工确认 / 人工新增 · 入库 available_at · 代码版本 · 规则版本 · 发布快照 id`；片段若有则显示。
独立摘要区：标签"OsbornAlpha 独立摘要 · AI 生成（模型 id）· 非机构原文 · 生成日期"。
引用片段区：按 `purpose` 分组。
历史区："评级与目标价历史（事实）"（同机构同证券同币种序列；时间线 SVG + 表格切换，表格含两端 `report_id`、`available_at`、公式 / 代码版本）；"跨机构分歧"（同证券同币种，各机构最近一篇；窗口 12 个月，提案）。F4 后加"结算（判断）"。
**不显示**最新价。缺失态同第 2 稿；撤回 / 取消发布 / 开关关闭 → 404。

### 9.4 `/stock/[ticker]` 块与 mock 处理

"馆藏研报（n）"：最近 5 条；无 → 隐藏。FR-3 同一变更：`page.tsx` 的 mock 研报块移除（`hasBrokerReports` 分支与 `stock.broker_reports` 传参删除）；`/api/consensus/[ticker]` mock 回退分支改为 `{source:'none', consensus:null}`；各带测试。

### 9.5 管理员页面流程

- 总览：计数卡（待解析 / 待抽取 / 待复核 / 待发布 / 已发布 / 已撤回）、最近批次、open 隔离项、黄金集最新回执（五元组、最差字段、`passed`）、"有更新映射可用"的已发布报告、outbox 失败事件、对外开关状态与三项门禁勾选（D1 / `test:storage` 回执 / 黄金集回执）。
- 上传：拖拽 → sha → 查重 → 选许可 → 直传 → 提交。
- 许可：列表 / 表单 / "确认 v{n}" / 实质性修改后的"待确认"与受影响片段 / 摘要计数。
- 文档页：状态、解析 / 抽取 / 摘要按钮、运行列表、查看原文（签名链接）、撤回 / 清除（步骤表）。
- 复核：双栏；字段类型化编辑；`absent`；片段框选与剩余字数；`stale_run` 提示；"阻断项"面板（复核就绪 / 发布就绪两列）；解析覆盖；`title_public` 编辑（阻断第 15 条命中时提示）。
- 发布对话框：阻断列表；发布后显示快照 id。
- 访问日志。

### 9.6 Claude Design canvas 待设计清单

1. 列表页（三态）。2. 详情页（来源抽屉、摘要标签、片段、历史图 + 表格、改写标题标注、404）。3. 机构页。4. `/stock` 块。5. 轨迹图与分歧图（SVG + 表格）。6. 管理员总览（含三项门禁）。7. 上传流程。8. 许可（版本、确认、受影响计数）。9. 文档页（运行列表、清除步骤）。10. 复核双栏（类型化编辑、`absent`、片段、覆盖、阻断面板）。11. 发布对话框。12. 访问日志。13. 预览页。14. zh/en 对照。所有屏用 `DESIGN.md` tokens；图表内联 SVG。

### 9.7 i18n

`intel.foreignResearch.*`、`admin.brokerResearch.*`、`common.rating.*`；parity 测试覆盖。

---

## 10. 判断层：机构追踪（F4）

### 10.1 原则

评级与目标价是机构的判断；我方登记"机构 I 在 `published_date` 对证券 S（币种 C）给出目标价 T、期限 H"的事实并结算之后的价格。馆藏是 owner 选择的样本：汇总标注"基于馆藏样本 n 篇"。F4 未落地不显示命中率。目标价不可公开的许可：其结算不公开；F4 的所有读取（详情、机构汇总、自己的页面）都只计入 `active` 且当前可见的 claim（§11.2）。

### 10.2 登记（outbox 事件 `claim.register`，适配器 `judgments.ts`）

事件身份与 claim 身份分离：每个 outbox 事件有唯一 `event_id`（uuid，消费者按它去重）；每个 claim 有稳定 `claim_key = broker_target_price:${publication_id}:${target_key}` 与单调递增 `claim_seq`（`register`=1，`retract`=2，`revise` 不用于本 claim_type——修订一律是新 `publication_id` 即新 `claim_key`）。消费者对同一 `claim_key` 只应用 `claim_seq` 更大的事件；**先到的 retract**（seq 2）写墓碑，之后到的 register（seq 1）被忽略；重复投递同 `event_id` 幂等。

```ts
{ event_id, claim_key: `broker_target_price:${publication_id}:${target_key}`, claim_seq: 1 | 2, kind: 'claim.register' | 'claim.retract',
  claim_type: 'broker_target_price', methodology_version: 'broker-claim/1',
  subject: { security_ticker, issuer_id, market, currency: target_currency },
  claimant: { kind: 'institution', id: institution_id },
  claim: { direction: +1|-1|0, target_price, currency, horizon_months|null, reference_price, reference_currency, reference_date },
  stated_at: published_date, available_at: documents.uploaded_at,
  source: { report_id, publication_id, snapshot_hash, field_ids },
  visibility_ref: { view: 'broker_report_targets_public_v', report_id, target_key } }
```

`unpublish` / `withdraw` / 许可隐藏 / `disclosure_ok=false` / `evidence_ok=false` → `claim.retract {event_id, claim_key, claim_seq: 2}`（同一 `claim_key` 只发一次 retract，outbox 唯一索引 `(claim_key, claim_seq)`）；重新发布 → 新 `publication_id` → 新 `claim_key` 的 register。`licence.changed` 事件让 F4 重查 `visibility_ref`。

### 10.3 结算契约（F4 执行）

- 证券与币种：只用 `subject.security_ticker` 的 K 线；市场币种 ≠ `claim.currency` → `unsettleable:currency`。
- `ForwardCall` 映射：`market` 由 `security_ticker` 后缀；`action = direction>0 ? 'buy' : direction<0 ? 'sell' : 'hold'`；`confidence=null`；`at = published_date + 'T00:00:00'` 在交易所时区 → `exchangeDate` 得 `published_date`；基准 = **当日或之后**首根 K 线（`base_rule='first_bar_on_or_after_published_date'`）。
- 复权：取 `none` 与 `qfq` 两个序列并都留存；两序列按 `time` 内连接对齐，任一序列缺少对方有的日期 → `unsettleable:series_misaligned`；任一序列缺失或为空 → `unsettleable:series_missing`；某日 `qfq.close ≤ 0` 或非有限数 → `unsettleable:bad_bar`；比值 `none.close / qfq.close` 四舍五入到 6 位小数后在窗口内不全相等 → `unsettleable:adjustment_discontinuity`（不断言原因）；否则用 `none` 序列与名义目标价比较。
- 窗口：5/20/60 交易日（`scoreForward` 原样）；到期命中仅 `horizon_months` 非空：`horizon_end` = `base_date` 加 `horizon_months` 日历月后 ≤ 该日的最后一根 K 线；`+1`：`max(high) ≥ target`；`−1`：`min(low) ≤ target`；`0`：null。
- 完整性：K 线未覆盖窗口末端 → 该窗口 `pending`；基准 K 线不在取数窗口 → `unsettleable:history_truncated`。
- 快照：两序列原样写 `settlements/{claim_id}/{settled_at}/{none|qfq}.json`，结算行记路径与哈希、`price_source='eastmoney:kline'`、`methodology_version='broker-settle/1'`、`code_version`；只追加。
- 可得性：`retrospective = available_at > base_close_at`，其中 `base_close_at` = `base_date` 当日交易所收盘时刻（`EXCHANGE_CLOSE`：A 股 15:00 Asia/Shanghai；港股 16:00 Asia/Hong_Kong；美股 16:00 America/New_York；常量表版本化，半日市不单独处理——记为已知近似，§15.3）；同一交易日但晚于收盘上传的报告是 `retrospective=true`。

### 10.4 显示（F4 落地后）

详情页"结算（判断）"：窗口收益、到期命中、`pending/unsettleable` 原因、方法版本、价格来源、`retrospective` 角标；机构页"馆藏样本表现"：n、命中率（n ≥ F4 `minN`，否则"样本不足"）、按 `retrospective` 分列。

### 10.5 不做

Brier；相对基准；分析师个人命中率对外。

---

## 11. 依赖接口（待对齐）

### 11.1 F3 文档管道

接口同第 2 稿（`DocumentExtraction`、`extractDocument(input, {deadline, authorization})`、`sliceText`、`F3Timeout`），补充：产物路径由调用方给定 `outputPrefix = reports/{sha}.extract.{run_id}` 与 `reports/{sha}.pages.{run_id}/`（按运行，永不覆盖）；同 `extractor_version` 同文件字节级一致；文本不清洗；表格网格；OCR 时 `ocr_used/ocr_version`；超时不留部分产物；运行位置 O9。

### 11.2 F4 判断框架

需要：outbox 消费端点 `POST <F4>/claims/events`（接受 `claim.register|claim.retract|licence.changed`；按 `event_id` 去重；对同一 `claim_key` 只应用 `claim_seq` 更大的事件，retract 先到写墓碑；返回 `{accepted, applied, claim_id?}`）；`settleClaims`（§10.3 契约）；`settlementOf(claim_id)`；`claimantStats(claimant, {minN, split:'retrospective'})`。**claim 资格**（F4 每次读取与汇总时核对，用 anon 读 `broker_report_targets_public_v`）：存在行 `report_id = source.report_id and target_key = … and publication_id = source.publication_id and target_price is not null`——即当前发布仍是登记时那次、且目标价当前允许公开；不满足的 claim 不计入任何展示与汇总（`active` 但 `ineligible`）。F4 页面同样核对。`minN` 由 F4 定（O12）。F4 规格 §11.2 目前把卖方登记列为"待可见性 / 所有权支持后"的延期项：本接口是**请求的集成契约**，不是已存在能力；F3 与 F4 接口须在 FR-2 / FR-7 开始前由双方规格作者签字（O13）。

### 11.3 F6 评测

运行器：对黄金集每篇跑 `parse+extract`；匹配 = 同 `(target_key, field, occurrence)` 且生效值相等（数值容差 0；文本大小写与空白归一）且页码相等且跨度重叠；`absence` 单独统计（标注 `absent` 且抽取无该字段 = `absence.tp`）；分母：`tp+fp` 为抽取出的、`tp+fn` 为标注的；写 §4.10 回执（`corpus_kind='gold'`）；摘要检查不在评测器内（它们是批准条件）。

### 11.4 计划三

ISIN/FIGI、A/H 配对落地后：候选可经 ISIN 补充；冲突自动消解规则由计划三定；此前人工处理。

---

## 12. 测试策略

### 12.1 单元（vitest，`memoryBrokerResearchDb`）

`schema`、`locate`（含代理对）、`typed`（转换表每行）、`tickers`、`rules`（R1–R10）、`overlap`、`grounding`（关键词 + 数值）、`disclosure`（受限值 / 受限名、格式变体）、`materialize`（候选 / 生效基准、单 / 多标的、双上市、`absent`、币种不等不算空间、摘要失效）、`publish-blockers`（16 条逐一）、`immutability`、`lease`（围栏、过期覆盖）、`intent`（CAS、重试返回已提交）、`judgments`（事件形状、幂等键含 `publication_id`、retract）、`licence`（实质性修改 → 版本 / 确认 / 片段摘要回草稿）、`dto`（禁止键 + 值级）、路由（参数、`no-store`、401/403/415/403(origin)、409 各码、410、★ 日志失败 500）。夹具：合成 PDF + 预期 `DocumentExtraction` + 录制 LLM 响应；不提交真实研报。

### 12.2 数据库 SQL（`test:db`，critical，含 `S4_TEST_STATE`）

`src/lib/broker-research/broker-research.integration.test.ts`：迁移可重放；索引与约束；许可触发器；文档状态机与租约 CAS；运行表只插入；`publish_direct_forbidden`；发布函数 16 条阻断；快照写入与不可变；`unpublish` 的 revision 与快照收尾；子表不可变；物化函数（基准、基数）；`field_review` 原子性；映射表只允许关闭；片段 / 摘要触发器；视图：两角色读成功、写拒、`rpc` 拒；可见性每条件翻转；开关关闭 0 行；值级断言；N 调小；`lag`；前任排除。

### 12.3 存储 HTTP（`test:storage`，本地 Supabase 栈；发布前人工门禁）

anon **与 authenticated** 读 `reports/*`、`staging/*` 被拒；签名上传 URL 二次上传被拒；`move` 行为；签名读 URL 过期；MIME 拒绝；清除后对象不存在。回执写入审计目录。

### 12.4 离线集成与黄金集

- `pipeline.integration.test.ts`（critical）：合成 PDF → 伪 F3 → 录制 LLM → 候选 → 复核 → 片段 / 摘要 → **测试库插入 `corpus_kind='synthetic'` 回执**（仅测试库；生产阻断只认 `gold`）→ 发布 → 视图；重跑抽取保留生效行、旧候选标 `superseded`。
- F3 契约套件（F3 环境）。
- 黄金集 30 篇（标注值 + 页码 + 跨度 + `target_key` + `occurrence` + 明示缺失），私有桶；`eval-gold.ts` 写 `gold` 回执。

### 12.5 清单规则

含 `S4_TEST_STATE` 的文件全部进 `criticalSuites`；parity、`test:migrations` 绿；对外开关开启前：`test:storage` 回执 + `gold` 回执 + D1。

---

## 13. 错误处理

| 情形 | 行为 | 码 / HTTP | 批次 |
|---|---|---|---|
| sha 已存在 | 不写 | `409 duplicate_document` | — |
| 意向不匹配 / 过期 / 他人 / 并发 | 不提交 | `409 intent_mismatch` / `409 intent_busy` | — |
| 提升丢失（暂存与正式对象都不存在） | 文档 `withdrawn`、意向 abandoned | `500 promotion_lost` | — |
| 文档提升未完成 | 拒绝处理 | `409 promotion_pending` | — |
| 候选冲突未解决 | 阻断 | `publish_blocked:conflict_unresolved:*` | — |
| 核验产物不可读 | `evidence_ok=false` + 隔离 | `artifact_unreadable` | partial |
| 提交校验不符 | 删暂存对象、意向 abandoned | `422 sha_mismatch\|size_mismatch\|not_pdf` | — |
| 对象超 50 MiB | 桶拒绝 | `413` | — |
| 处理授权为假 | 不处理 | `409 licence_forbids_processing` | — |
| 租约被占 / 丢失 / 过期 | | `409 lease_held`；运行 `failed:lease_lost\|lease_expired` | failed |
| F3 失败 / 超时 / 不确定 | 文档回退 | `f3_failed\|f3_timeout\|extractor_nondeterministic` | failed |
| LLM 不可用 / 配额 / schema | 运行 failed | `llm_unavailable\|llm_quota\|llm_schema_invalid` | failed |
| 字段未命中 | `unverified` | `span_unverified_summary` | partial |
| 规则不通过 | 隔离 | §7.1 | partial |
| 直接置 published | 拒绝 | `publish_direct_forbidden` | — |
| 发布阻断 | 拒绝 | `409 publish_blocked:<reasons>` | — |
| 已发布改动 | 拒绝 | `409 published_immutable` | — |
| 许可确认版本不符 | | `409 version_mismatch` | — |
| 摘要 / 片段检查 | `rejected` | `summary_overlap\|summary_ungrounded\|restricted_value\|restricted_name` | — |
| 片段跨页 / 超长 / 非逐字 | | `400 snippet_*` | — |
| ★ 日志失败 | 无正文 | `500 access_log_failed` | — |
| 文档撤回 | | `410 document_withdrawn` | — |
| 核验漂移 | `evidence_ok=false` + 隔离 | `span_drift` | partial |
| outbox 投递失败 ≥ 10 次 | `failed`，总览告警 | | — |
| 公开读 | | `404 unknown_ticker\|not_found`、`400 invalid_parameter:<name>` | |

---

## 14. 分期

| 工作包 | 交付 | 退出条件 | 估计 |
|---|---|---|---|
| FR-0 迁移、视图、函数、契约 | 21 表、桶、9 视图、函数（blockers、publish、unpublish、materialize、field_review、field_add、field_effective、extract_commit、quarantine_resolve）、触发器、权限、锁文件、types、`BrokerResearchDb` 三实现、§12.2 | `test:db`、`test:migrations` 绿；两角色视图读成功、其余全拒 | 5.5 人日 |
| FR-1 许可、上传、存储 | 版本化许可、开关、意向 / 暂存 / 提交、签名 URL + 日志、撤回 / 清除步骤表、孤儿清理、总览 / 上传 / 文档页、`storage-check.ts` | `test:storage` 全绿 | 4 人日 |
| FR-2 解析、抽取、复核、评测回执 | F3 适配、运行表、schema、定位、类型化、`parseBrokerTicker`、物化、复核 RPC、规则回执、隔离与钩子、复核页、合成与录制夹具、`eval-gold.ts` + 回执写库、`pipeline.integration` | 全链路绿；16 条阻断有测试；`synthetic` 回执只在测试库 | 7 人日（不含 F3） |
| FR-3 摘要、发布、公开页（预览） | 摘要三检查、披露检查、发布 / 取消发布与快照、公开 API（`no-store`）、列表 / 详情 / 机构页、`/stock` 块 + mock 删除 + consensus 修改、预览页 | 合成报告在管理员预览可见；DTO 值级绿；开关关闭时 anon 视图 0 行 | 5 人日 |
| FR-4 实体与历史 | 机构 / 映射（关闭操作）/ 分析师维护、历史视图、图表 | 两机构两报告 → 历史两行、前任排除 | 2 人日 |
| FR-5 核验与 outbox cron | `replay.ts`、核验 cron、outbox cron（F4 未落地不登记）、`vercel.json`、runbook | 核验一次成功回执；黄金集在 owner 环境跑一次写 `gold` 回执 | 2.5 人日 |
| FR-6 对外发布 | D1 ≥ 1 条确认；`test:storage` 回执；`gold` 回执 `passed`；开启开关；§17 | 匿名浏览器可见且仅含许可允许内容 | 0.5 人日 |
| FR-7 F4 适配 | outbox 消费对接、结算显示、`minN` | 依赖 F4 | 2 人日 |

合计约 28 人日（估计；F3、F4 不含）。顺序 FR-0 → … → FR-7。

验收样例：
1. 同 PDF 两次上传：第二次 `409`；桶内一个对象；日志一条。
2. 目标价 quote 差一个空格：`unverified` → 阻断 `field_pending:target_price` → 框选修正后消失。
3. `allows_public_target_price=false`：anon 查三张视图，目标价值不出现；含该数值的 `thesis` 片段批准被拒 `restricted_value:target`。
4. 摘要含"营收 100"而生效字段只有目标价 100：`summary_ungrounded`（关键词不符）。
5. 许可 N 300→100：确认清空、片段 / 摘要回草稿、列表消失；重新确认 + 重批准后恢复。
6. 已发布报告 `PATCH`：`409 published_immutable`；直接 SQL 置 published：`publish_direct_forbidden`；`unpublish` → `revision=2` → 快照 2。
7. 无 `gold` 回执：含 LLM 字段报告 `eval_receipt_missing`；全人工报告可发布；测试库 `synthetic` 回执不解除生产阻断（单测用生产模式断言）。
8. `public_enabled=false`：anon 视图 0 行、路由 404、预览页可见。

---

## 15. 独立验证、owner 事项、参数登记

### 15.1 独立验证

Codex 两轮 + 处置（本目录）；每日核验（漂移即隐藏）；规则与 16 条阻断为数据库门禁；黄金集 30 篇最差字段 ≥ 0.95；专家抽样 10 篇（提案）记 `expert-sample.json`；合规复核（owner / 法务对 §4.11 视图列与 §9.3 页面逐项签字，D1 证据）；`test:storage` 回执；F4 落地后结算与 owner 印象对照（记录）。

### 15.2 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **D1 许可确认**（逐来源；含外部 LLM 处理权；知悉 §1.2 对账偏差） | owner / 法务 | FR-6 前 |
| **D2 片段上限 N**（硬上限 500 提案） | owner | FR-0 前 |
| **D3 目标价是否对外**（默认 false） | owner | FR-6 前 |
| **D4 分析师姓名是否对外**（默认 false） | owner | FR-4 前 |
| **D5 平台 LLM、每文档调用上限、分块参数** | owner | FR-2 前 |
| **D6 馆藏初始来源** | owner | FR-1 后 |
| **D7 §15.3 提案参数逐项** | owner | FR-0 前 |
| O9 F3 运行位置 | owner + F3 | FR-2 前 |
| O10 Supabase 存储访问日志 | owner | FR-1 后 |
| O11 清除时是否删摘要文本 | owner | FR-1 前 |
| O12 F4 `minN` | F4 规格 | FR-7 前 |
| O13 F3（§11.1）与 F4（§11.2）接口签字：两份并行规格的作者各自确认本规格请求的契约可交付；未签字则 FR-2（F3）/ FR-7（F4）不开始 | F3 / F4 作者 + owner | FR-2 前 / FR-7 前 |
| O14 批准黄金集清单（写 `settings.approved_gold_corpus_hash`）；清单变更需重新批准，之前的回执随之失效 | owner | FR-5 前 |
| 生产：迁移、建桶、`CRON_SECRET`（已有）、开关 | owner | 合并后 |

### 15.3 参数登记

| 参数 | 值 | 来源 | 决策 |
|---|---|---|---|
| 黄金集篇数 / 阈值 | 30 / 0.95（最差有覆盖字段） | 总纲 §3.5 | 固定 |
| 空间恒等容差 | 0.005 | 总纲 §3.6 | 固定 |
| 桶大小 | 50 MiB | 现有桶 | 固定 |
| 前向窗口 | 5/20/60 | `scoreForward` | 固定 |
| `maxDuration` | 300 s | 现有路由 | 固定 |
| 意向有效期 | 2 小时 | Supabase 文档；本地栈验证 | 验证后固定 |
| 评测数值容差 | 0 | 本规格（值必须逐字相等） | 固定 |
| 复权不连续阈值 | 比值四舍五入到 6 位小数后不全相等 | 本规格（零容差，6 位为提案） | D7 |
| 交易所收盘时刻表 `EXCHANGE_CLOSE` | A 15:00 / HK 16:00 / US 16:00（本地时区；半日市不处理） | 本规格（已知近似） | D7 |
| 行为摘要输入清单 `BEHAVIOR_DIGEST_INPUTS` | 见 §4.3 | 本规格 | 固定（变更须改版本） |
| 片段硬上限 | 500 字 | 提案 | D2/D7 |
| `source_label` 长度 | 120 | 提案 | D7 |
| `quote` 上限 | 400 字 | 提案 | D7 |
| schema 重试 | 1 | 提案 | D7 |
| 签名读 URL | 600 s | 提案 | D7 |
| 文档租约 | 300 s（= `maxDuration`） | 本规格 | 固定 |
| F3 deadline 余量 | −20 s | 提案 | D7 |
| 分块 | 8 页 / 上下文 60% | 提案 | D5 |
| 列表 limit | 50 / 200 | 提案 | D7 |
| `/stock` 块 | 5 | 提案 | D7 |
| 分歧图窗口 | 12 月 | 提案 | D7 |
| R7 | 7 天 / 0.8 | 提案 | D7 |
| 核验 cron | 每日；预算 250 s | 提案 | D7 |
| outbox cron | 每 10 分钟；≤ 10 次 | 提案 | D7 |
| 专家抽样 | 10 篇 | 提案 | D7 |
| F4 `minN` | — | F4 | O12 |

---

## 16. 开放问题（实施前核对）

1. 本地 Supabase 栈：签名上传 URL 有效期、`move` 语义、`allowed_mime_types` 执行、清除后签名 URL 行为（FR-1 `storage-check.ts`）。
2. F3 对 OCR 偏移的稳定性。
3. 预测 / 历史数字表抽取与规格二对账（§1.2 偏差恢复条件）。
4. 同一机构不同地区实体是否作一个 `institution`（默认一个，`aliases`）。
5. 旧表 `broker_reports` 与两个 watchlist 函数的处置（公司研究规格）。
6. 多标的报告在 `/stock` 块的归属：按 target 各出现一次。
7. "最新价"重新纳入的条件：带留存快照与代码谱系的报价契约。
8. Vercel 函数内存上限：`commit` 下载 ≤ 50 MiB 对象复算哈希；不足则流式哈希。
9. `recordAttempt` 单生产者假定与多管理员并发触发：接受"最近一次尝试"语义；若需严格，改为按文档的新鲜度行（后续）。

---

## 17. 实施记录与偏差

（落地后补记，格式同规格一 §14。）

---

## Claude Design 画布

画布：[外资研报 Foreign Research](https://claude.ai/artifact/KG9LYefBtdGUE7ppir6cqg)（2026-11-04；17 个画板：公开 7、管理员 8、移动 2）。画布为私有，owner 从页面 Share 菜单共享后其他人才能打开。画板名前的数字即 §9.6 清单编号。

| §9.6 待设计项 | 画板 |
|---|---|
| 1 列表页（三态） | 1 列表页 · 正常；列表三态 · 404 · /stock 块；移动 · 列表 |
| 2 详情页（来源抽屉、摘要标签、片段、历史图 + 表格、改写标题、404） | 2 详情页；2 来源抽屉与标题标注；列表三态 · 404；移动 · 详情 |
| 3 机构页 | 3 机构页 |
| 4 `/stock` 块 | 列表三态 · 404 · /stock 块 |
| 5 轨迹图与分歧图（SVG + 表格） | 5 轨迹图与分歧图 |
| 6 管理员总览（三项门禁） | 6 管理员总览 |
| 7 上传流程 | 7 上传流程 |
| 8 许可（版本、确认、受影响计数） | 8 许可 |
| 9 文档页（运行列表、清除步骤） | 9 文档页 |
| 10 复核双栏 | 10 复核双栏 |
| 11 发布对话框 | 11 发布对话框 |
| 12 访问日志 | 12 访问日志 |
| 13 预览页 | 13 预览页 |
| 14 zh/en 对照 | 14 中英对照 |

约定：只用 `DESIGN.md` / `globals.css` tokens（黄铜唯一强调色，无紫色、无渐变）；图表为内联 SVG 并有表格视图；详情页不显示最新价；评级标准化用中性徽标，不用红绿；画布上的机构评级、目标价与数值均为版式示意，不代表任何机构观点。偏差待 owner 确认：三级文字用 `#8b8b94` 代替 `#52525b`（对比度）。
