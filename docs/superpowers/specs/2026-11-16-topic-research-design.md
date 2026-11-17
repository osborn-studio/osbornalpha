# 专题研究（`/intel/topics`）设计规格

日期：2026-11-16（第 1 稿；自审一轮（无外部审计，owner 2026-11-16 决定）。自审修订 S1–S6 已并入正文，清单见 `docs/audits/2026-11-16-topic-research/README.md`）
状态：草案，待 owner 评审（§15 共 13 项决策，均带默认值；默认值即可开工）
代码基线：`main` @ `68701c48`（起草工作树，§2 每一条"已存在"均在该基线上以 `git grep` / `ls` 核对）
范围决定（owner 2026-11-16）：专题研究是本轮唯一新规格；竞争分析、模拟组合、行业数据（AI 生态）、他山之石四个板块不推进，本规格的任何功能不得假设它们存在（§1.2）。
上游：
- 宏观 P1+P2 `2026-11-04-macro-workbench-design.md`、P3+P4 `2026-11-07-macro-workbench-p3-p4-design.md`（§6.1 事实、§6.3 LLM 解读、§7 判断边界——本规格的摘要机制从这里泛化，§8.2）；
- 规格二（披露事实）`2026-11-04-data-foundation-2-disclosure-facts-design.md`、公司研究 `2026-11-04-company-research-design.md`（证据闸门 §0 #62/#63：不合格的值不出服务器）；
- 行业研究 `2026-11-04-industry-research-design.md`（数据集许可闸门、`deferred_i3`）；
- F3 文档管道 `2026-11-04-document-pipeline-design.md`（§8：公共/私有，引用可见性）；
- F4 判断层 `2026-11-04-judgment-framework-design.md`（显示契约、`InputRef`）；
- 外资研报 `2026-11-04-foreign-research-design.md`（规格已在 main；代码在未合并分支 `origin/claude/foreign-research-f63683`，本规格把它的一切视为**未合并依赖**）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §0、§4、§5。逐条对照约束 1–6：
- **约束 1（只用一手来源）**：专题不采集任何数据。专题版本只持有指向已有模块的 `EvidenceRef`（宏观观测、行业聚合、披露事实、F3 文档引用、外资研报元数据〔未合并〕、F4 判断），这些模块各自从一手来源建立。对方 `/research`、`/research/dario-interview` 只作功能参考，其目录、摘要、访谈内容一律不导入，也不抓取。访谈/专家笔记只接受 owner 本人撰写的笔记或 owner 提供的、许可已登记的来源（§4.6），播客/访谈索引是非目标。
- **约束 2（每个数字可回放）**：专题页上的每个数字都来自某个 `EvidenceRef` 在其 `as_of` 的解析结果；发布时把解析结果（含来源抽屉载荷与摘要哈希）冻结进不可变版本（§4.4）；任何人读旧版本得到同样的数字；后台回放任务按 `as_of` 重新解析并比对哈希（§13 验收 A7）。模型写的文字不含任何数字（§8.2 校验器）；owner 写的文字同样不得含裸数字，数字只能以证据插槽出现（§4.5）。
- **约束 3（事实与判断分层）**：专题本身不产生判断（§8：无 F4 方法）。引用 F4 判断时按 F4 显示契约渲染卡片，模型摘要的输入不含任何判断（与宏观 P3+P4 §7.7 同规则），未校准的概率不显示为百分比。
- **约束 4（缺失就是缺失）**：解析不到的 ref 渲染为 `missing`（永不静默丢弃）；owner 可声明"预期证据槽"，没有可挂接的数据时以 `missing` 显示原因（例如行业表在生产为空）；CN 数值 `withheld`、港股 `not_served`、过期 `stale`、发布后修订 `revised` 都是一等状态（§6.3）。
- **约束 5（原文私有）**：私有 `/research` 工具的表（`research_*`）永不进入公开专题；从私有论点到公开专题只经显式 owner 动作 + 披露检查 + 预览 + 不可变发布（§4.7、§7.4），且本模块对 `research_*` 零写入。外资研报原文、非公开 F3 文档的引用一律不能挂到公开版本。第三方引文受片段上限（§15 D2）。
- **约束 6（UI）**：只用 `DESIGN.md` / `src/app/globals.css` tokens；zh/en 双语；每个图表有表格等价视图（§7）；视觉稿在 Claude Design 画布先行（§17）。

---

## 1. 目标与非目标

### 1.1 目标

1. **公开专题目录**：`/intel/topics` 列出已发布专题（所有已登录、有资格的用户共享同一目录；不是匿名互联网访问，§2 核对）。每个专题有稳定标识 `topic_slug`（§4.3），供其他模块与 Copilot 链接。
2. **专题 = 版本化证据档案（dossier）**：每个版本持有一个**有序**的 `EvidenceRef` 列表（分节），每个 ref 带 `as_of`；版本发布后不可变；读旧版本重现同样数字；更晚的事实修订不静默改变已发布版本，只显示"发布后证据已修订"（§5.4）。
3. **共享证据引用契约**：本规格给出 `EvidenceRef` 的规范定义与解析器契约（§4.1 EvidenceRef 契约），首批实现宏观、行业、公司事实、F3 文档、F4 判断五类解析器；外资研报在合并后按同一契约接入。
4. **模型摘要**：每个版本可附一段 LLM 摘要，复用宏观 P4 验证解读机制：数字只来自系统模板对冻结事实的渲染，模型只写无数字的假设句，确定性校验器拒绝数字、禁用词与荐股用语，每一句都带证据引用，用量计量（§8.2）。
5. **私有论点 → 公开专题的晋升通道**：永不自动；owner 显式发起 → 披露检查剥离私有来源与笔记 → 预览 → 不可变发布 → 可取消发布 / 被新版取代 → 全程审计。不写回 `research_*`（§4.7）。
6. **状态一等化**：过期、缺失、受限市场、未服务市场、发布后修订、来源撤回都有明确状态与文案。

成功标准（退出条件，夹具在 `src/lib/topics/fixtures/` 固定）：
- 用夹具宏观观测 + 美股事实 + 公共 F3 引用组装一个专题并发布为 v1；之后向夹具注入同一 `(series_id, period_end)` 的 version 2 观测：`GET /api/topics/<slug>/versions/1` 的数值与发布时逐字节相同，该 ref 的 `drift` 为 `revised`；`?asOf=` 早于 v1 发布日 → 404 `no_version_at_asof`。
- 一个引用 CN 事实的 ref 在公开响应里为 `withheld`，响应体任何位置都不含该值（序列化后字符串搜索）。
- 从夹具私有论点晋升：草稿中不含论点的 `supporting_evidence_ids`、`last_assessment`、任何 `research_source_documents` id 或 `/research/` 链接；`research_*` 全表行数与 `updated_at` 在整个流程前后不变（§13 A12）。
- 校验器夹具：含"3""三个月""买入""recommend""十倍"的模型输出全部 `rejected`；一个 point 含两句 → `rejected:multi_sentence`。
- 全部门禁绿：`npm test`、`npm run test:db`（新集成套件进 `criticalSuites`）、`npm run test:migrations`、i18n 对等测试覆盖 `topics` 域。

### 1.2 非目标

- **竞争分析、模拟组合、行业数据（AI 生态榜单）、他山之石（播客/访谈）**：owner 2026-11-16 决定不推进。专题不引用它们、不为它们预留证据种类、不假设它们会存在。
- **播客/访谈索引、转写、翻译**：非目标。对方 `/research/dario-interview` 这类"访谈入口"只在两种情况下有对应物：owner 本人撰写的笔记，或 owner 提供且已登记许可的来源的短引文（§4.6）；两者都没有时该条目类型不提供服务（`not_served`），页面不出现"访谈"入口。
- **专题自身的派生计算**：v1 专题不计算新数字（不做跨 ref 的比率、加总、排名）。唯一的例外是同一宏观序列两条观测之间的类型化变化，直接复用宏观 `typedChange`（§8.2）。
- **判断**：专题不登记 F4 判断，不显示胜率、目标价、评级；"值博率"一类对方元素不做。
- **写回私有工具**：本模块对 `research_theses`、`research_thesis_events`、`research_memos`、`research_source_documents`（及 `research_*` 全部表）、`positions`、`trades`、`decisions` 零写入。
- **匿名互联网发布、SEO、分享链接**：不做；目录与 `(app)` 其他页面同样要求登录。
- **全文检索、向量检索**：v1 目录只按分类/更新时间筛选与标题前缀搜索。
- **对外导出（PDF/图片）**：不做。

---

## 2. 现状（`main` @ `68701c48`，本工作树核对）

| 领域 | 已核对的事实（命令 / 文件） | 本规格如何处理 |
|---|---|---|
| 专题相关代码 | `git grep -n "TOPICS_ENABLED\|topic_slug\|/intel/topics"` 无结果；`src/app/(app)/intel/` 只有 `companies`、`industries`、`methods`、`page.tsx` | 全部新建 |
| 访问姿态 | `src/middleware.ts` 注释"The product is NOT publicly browsable"，只有落地页与认证页公开；`src/app/(app)/layout.tsx` 无用户 → `redirect('/login')`；`/intel/companies` 页登录即可看，`requireAdminUser()` 只决定空状态链接 | "公开" = 所有登录用户共享的目录；不开放匿名 |
| 管理员 | `src/lib/admin/auth.ts::requireAdminUser`；`src/app/(app)/admin/` 有 `dq`、`judgments`、`securities`、`usage` | 管理页放 `/admin/topics`，同一守卫 |
| 私有研究工具 | `src/app/(app)/research/` 下 `cards companies evals library memos observations playbooks setup signals sources theses weekly`；`layout.tsx` 注释"Phase 1 本地专用，直达 URL，不进 TabBar"；`src/lib/research/store.ts::requireResearchUser`（`profiles.role='admin'`，否则 `ResearchForbidden`） | 不改其数据与权限；只在论点详情页加一个跳转链接（§7.4） |
| `research_theses` | `20260705000000_research_os_tables.sql`：`user_id`、`title`、`body`、`company_ids`、`theme_ids`、`supporting_evidence_ids`、`invalidation_conditions`、`watch_metrics`、`status`、`last_assessment`…；`20260926110000_research_thesis_extension.sql` 加 `opportunity_type`、`pillars`、`catalysts`、`horizon_weeks`、`supersedes`、`kill_condition_revisions` | 晋升时只读 `title`、`body`（§4.7） |
| `research_thesis_events` / `research_memos` | 同一迁移；事件 `kind in (SUPPORT, WEAKEN, INVALIDATE, USER_ACTION, STATUS_CHANGE)`；备忘录含 `supporting_evidence`、`counter_arguments`、`llm_provenance` 等 | 不读（晋升源只有论点；备忘录晋升见 §16 Q3） |
| `research_source_documents` | `raw_text` 不可变触发器；`20260925230000_research_source_extension.sql` 加 `permission in ('public','licensed','private')`、`available_at`、`origin_type` | 永不成为证据；`EvidenceRef` 无对应种类 |
| `research_*` RLS | 迁移第 209–213 行：每表 `auth.uid() = user_id` 的 select/insert/update/delete 策略 | 本模块服务端用 owner 会话只读论点一行 |
| 宏观观测 | `macro_observations`（`20261114090000_macro_workbench.sql`）：`observation_id uuid PK`、`(series_id, period_end, version)` 唯一、`value_text`、`available_at`、`status in ('ok','quarantined','rejected')`、`locator`/`derived_from` 二选一 | `macro_observation` 解析器（§4.1） |
| 宏观证据原件 | `macro_evidence_objects(sha256 PK, object_path, adapter in ('fred_csv','akshare'))`；路由 `src/app/api/macro/evidence/[sha256]/route.ts` | 来源抽屉链接 |
| 宏观 P4 机制 | `src/lib/macro/strategy/`：`facts.ts`（`Fact`、`typedChange`）、`explain-render.ts`（`TEMPLATES`、`formatSlot`、`roundDecimal`、`renderExplanation`）、`explain-validate.ts`（`FORBIDDEN_TERMS`、`REGIME_TERMS`、`NUMERAL_PATTERNS`、`lexicalFailures`、`validateExplanation`）、`explain-request.ts`（`handleExplainRequest`、`recoverExplanation`）、`hash.ts`（`canonicalJson`、`sha256Hex`）、`numeric.ts`、`llm-deps.ts`（`EXPLAIN_MAX_OUTPUT_TOKENS=1200`、`EXPLAIN_TEMPERATURE=0.2`）、`contract.ts::VERSIONS`、`prompts/macro-explain-v1.{zh,en}.md` | §8.2 逐项说明复用/泛化/新建 |
| `src/lib/macro/explain.ts` | **不是** LLM 机制：它是相关分析结果的规则化单句（`explainResult`，带数字，确定性） | 不复用；只作为"规则句"先例引用 |
| 宏观解读存储 | `20261115090000_macro_strategy.sql`：`macro_explanation_runs`（service-only，`subject_kind in ('snapshot','review')`，`unique(user_id, request_id)`）、`macro_explanations`（RLS `user_id = auth.uid()`）；RPC `macro_claim_explanation`、`macro_record_completion`、`macro_finish_explanation`、`macro_mark_finalized`、`macro_expire_explanations`、`macro_put_manifest` | 按用户私有，不能直接承载共享摘要 → 新表（§4.8） |
| 用量计量 | `src/lib/billing/quota.ts::checkQuota/beginUsageRun/finalizeUsageRun`、`src/lib/billing/metered-llm.ts::runMeteredLlmCall`（`budgetExempt`）、`src/lib/llm/resolve.ts::resolveUserLlm`；`UsageFeature = 'copilot'|'perspectives'|'brief_preview'`（`database.types.ts:411`），同一枚举是 `usage_events` 与三处预算函数的 check（`20260703090000`、`20260728090000/110000/120000`） | 新增特性值是迁移工作（§15 D3） |
| 行业聚合 | `industry_metrics` PK `(run_id, code, metric, period_start, period_end)`，`status in ('ok','missing')` + `missing_reason`；`industry_metric_runs(scheme in ('sw2021','sic'), status in ('building','active','superseded','failed'), history_class)`；`industry_dataset_licenses(dataset_key, status in ('internal','public'))`；`src/lib/industry/read.ts`（`industryDetailView`、`replayView`、`unlicensed` 状态）；`jobs.test.ts` 中 official/valuation 返回 `skipped:'deferred_i3'` | `industry_metric` 解析器；生产表为空是 commander 已核实事实（本工作树无法查生产库，未复核） |
| 披露事实 | `financial_facts(fact_id uuid PK, issuer_id, market in ('US','CN'), status in ('staged','ok','quarantined'), available_date, mapping_gen …)`；`src/lib/company/evidence-gate.ts`："an ineligible value never leaves the server (withheld…)" | `financial_fact` 解析器复用同一闸门 |
| F3 文档 | `document_citations(citation_id PK, visibility in ('internal','public'), page_no, char_start/end, snippet, text_hash)`；RLS"document_citations public read"：`visibility='public'` 且文档 `permission='public'`；`src/lib/documents/db.ts::citationById` | `document_citation` 解析器只走公共可见性 |
| F4 判断 | `judgments(judgment_id PK, subject_type in ('issuer','industry','macro_region','macro_series'), methodology_id/version …)`；`src/lib/judgments/types.ts::Input` 已有带 `snapshot`+`hash` 的 `InputRef` 联合（`financial_fact`、`macro_observation`、`macro_snapshot`、`judgment` …）；`display.ts::toCard/cardsOf/calibrationStateOf` | `judgment` 解析器复用显示契约；`EvidenceRef` 的 id 选择与 F4 `InputRef.ref` 对齐 |
| 外资研报 | main 上**无** `broker_research_settings`、`broker_report_*` 表或 `src/lib/broker-research/`（`git grep` 无结果）；规格 §4.8 定义 `broker_report_publications`（不可变发布快照） | `broker_report_meta` 种类预留，解析器返回 `unsupported` 直至合并 |
| 新鲜度 | `dq_freshness`（`20261105090000_dq_foundation.sql`，service-only） | 漂移任务读 |
| cron 鉴权 | `src/lib/observability/cron-auth.ts::authorizedCronRequest`；`vercel.json` | 新 cron 复用 |
| 迁移门禁 | `supabase/migrations.lock.json`；最新迁移 `20261124110000_company_digest_retry_selection.sql` | 新迁移须晚于锁定最新（§4.10） |
| Copilot | `src/lib/agent/tools.ts` 工具名：`review_earnings_quality search quote radar signals financials flows perspectives holders calendar kline dcf record_decision get_portfolio save_artifact`；不读任何新模块 | §11 |
| i18n | `src/i18n/request.ts::MESSAGE_DOMAINS`（含 `industries`、`macro`、`macroStrategy`） | 注册 `topics` 域 |
| 设计 | `globals.css` tokens：`--bg --bg-card --bg-elevated --bg-hover --border --border-active --text --text-dim --text-muted --accent --accent-dim --accent-wash --up --down --warn --danger --neutral --num-font --font-mono --panel-pad --row-gap --label-size --value-size --shadow --bullish --bearish`；`DESIGN.md` §2 单一黄铜强调色、禁紫色 | §7 只用这些 |

未能在本工作树核对：生产库各表行数（行业表为空、`company.events` 报错等来自 commander 与 2026-11-16 差距审计，按其陈述引用）。

---

## 3. 对方页面逐元素分类

证据：`PAGE_INVENTORY.csv` 行 `https://www.chaosaiagent.com/research`（200，"公开HTML正文/元数据；未运行交互"，577 字符，2026-11-04）与 `/research/dario-interview`（200，"页面框架/来源/入口；动态或嵌入内容仅部分核查"，标题"Dario Amodei 70 分钟访谈"）；`REPORT.md` §3 表"专题研究：分类目录、AI 摘要、创始人访谈入口"。交互未运行，元素清单因此较粗。

| 对方元素 | 类别 | 本规格 |
|---|---|---|
| 专题分类目录 | 导航 | 目录页 + `category` 筛选（§7.1，分类表 §15 D5） |
| 专题卡片（标题、简介、更新时间） | 导航 + 元数据 | 版本元数据：`title_*`、`dek_*`（owner 撰写、无数字）、`published_at`、证据状态计数 |
| AI 摘要 | 派生（模型文字） | §8.2：模板事实句 + 无数字假设句，每句带引用；页眉声明"机制假设未经核实" |
| 摘要中的数字 | 事实 | 只来自 `EvidenceRef` 解析 + 系统模板 |
| 专题正文的观点 | 判断（非结构化） | 不做观点评级；owner 文字作为"编者说明"，无数字、无荐股词（§4.5） |
| 创始人/嘉宾访谈入口 | 第三方内容 | 仅 owner 笔记或许可来源短引文（§4.6）；否则 `not_served` |
| 访谈时长、章节、全文 | 第三方内容 | 不做（非目标） |
| 来源/出处标注 | 元数据 | 每个 ref 的来源抽屉（§6.4） |
| 推荐/结论性措辞 | 判断 | 不做；"买入/卖出/推荐"在 UI 文案与模型输出中被禁 |

回归对照：不做数值对照（对方没有可比数字）；画布阶段把对方目录的信息密度作为布局参考，记入 `docs/audits/2026-11-16-topic-research/`。

---

## 4. 数据模型

所有新表：`revoke all from public, anon, authenticated, service_role`，再按 §4.9 授权；写只经 `security definer` 函数（与规格二、公司研究同原则）。时间一律 `timestamptz`（UTC）；`as_of` 存为 `timestamptz`（知识截止时刻），日期参数解释为该日 `23:59:59.999Z`。

### 4.1 EvidenceRef 契约（规范性；`src/lib/evidence/ref.ts`，契约版本 `evidence-ref/1`）

**形状**

```ts
export type EvidenceKind =
  | 'macro_observation'   // 宏观观测（存在）
  | 'industry_metric'     // 行业聚合单元格（存在；生产暂无数据）
  | 'financial_fact'      // 披露事实（存在；US 服务，CN 受限）
  | 'document_citation'   // F3 文档引用（存在；仅公共可见）
  | 'broker_report_meta'  // 外资研报发布元数据（未合并依赖）
  | 'judgment';           // F4 判断（存在）

export interface EvidenceRef {
  v: 1;                 // 契约版本；新增种类 = 新契约版本（evidence-ref/2），旧版本读法不变
  kind: EvidenceKind;
  id: string;           // 种类内规范 id（下表），不可变对象的主键
  as_of: string;        // ISO-8601 UTC 时刻：解析"在此刻已知的状态"
  locator?: Record<string, string>;  // 种类内可选细定位（下表）；不参与身份
}
```

| kind | `id` | 对象不可变性 | `locator` | 与 F4 `InputRef` 的关系 |
|---|---|---|---|---|
| `macro_observation` | `observation_id`（uuid） | 行不可变；`(series_id, period_end, version)` 唯一，修订产生新 version 新行 | `{series_id, period_end}`（显示与漂移检查用，解析时与行比对，不一致 → `missing:locator_mismatch`） | F4 用 `{series_id, period_end, vintage_id}`；我们取行主键，二者可互转 |
| `industry_metric` | `<run_id>:<code>:<metric>:<period_start>:<period_end>`（`industry_metrics` 复合主键） | 运行不可变；新运行替代旧运行 | `{scheme, version, level, duration}` | F4 v1 无行业输入种类 |
| `financial_fact` | `fact_id`（uuid） | 行不可变；修订是新 filing 的新行 | `{issuer_id, market, concept, period_end}` | 同 F4 `{fact_id}` |
| `document_citation` | `citation_id`（uuid） | 行不可变（`text_hash`） | `{document_id, page_no}` | F4 `document_span` 非公共种类，不对齐 |
| `broker_report_meta` | `publication_id`（外资研报 §4.8 不可变发布快照） | 只插入；`unpublished_at` 一次性写 | `{report_id, target_key?}` | 合并后由外资研报规格确认 |
| `judgment` | `judgment_id`（uuid） | 登记行不可变；结算另表 | 无 | 同 F4 `{judgment_id}` |

规范化：`canonicalRef(ref)` = 只保留 `v, kind, id, as_of`（`as_of` 规范为毫秒精度 `Z` 结尾），`ref_hash = sha256Hex(canonicalJson(canonicalRef))`，复用 `src/lib/macro/strategy/hash.ts`（移到 `src/lib/evidence/hash.ts` 并从原处再导出，宏观代码不改语义）。同一版本内 `ref_hash` 唯一。

**扩展规则**：新种类只能以新契约版本加入，并且必须同时提交：种类表新行、解析器、夹具、本节修订；契约不为没有规格的模块预留种类名。

**解析器契约**（`src/lib/evidence/resolve.ts`）

```ts
export type ResolveState =
  | 'ok' | 'missing' | 'withheld' | 'not_served' | 'unsupported' | 'retracted';
export interface ResolveCtx { audience: 'public' | 'admin'; now: Date; locale: 'zh' | 'en' }
export interface Resolved {
  state: ResolveState;
  reason: string | null;                    // 机器码，见下
  ref: EvidenceRef;
  basis: 'point_in_time' | 'reconstruction' | null;   // 仅 industry_metric：运行的 history_class；其他种类为 null
  display: {
    label: { zh: string; en: string };       // 对象名称（序列名 / 公司+概念 / 行业+指标 / 文档标题+页）
    fact: { template: string; slots: Record<string, { value_text: string; unit: string } | string> } | null; // state='ok' 才有
    period: string | null; available_at: string | null;
  };
  drawer: SourceDrawerPayload | null;        // 来源抽屉；公共受众下不含受限值
  digest: string | null;                     // sha256(canonicalJson({display.fact, drawer.identity}))，state='ok' 才有
  freshness: { dataset: string; status: 'fresh' | 'stale' | 'unknown'; checked_at: string } | null;
}
export interface EvidenceResolver<K extends EvidenceKind> {
  kind: K;
  resolve(refs: EvidenceRef[], ctx: ResolveCtx): Promise<Resolved[]>;   // 批量，按输入顺序返回，长度相等
  latestIdentity(ref: EvidenceRef): Promise<LatestIdentity | null>;     // 漂移检查用（§5.4）
}
export function resolve(refs: EvidenceRef[], ctx: ResolveCtx): Promise<Resolved[]>; // 按 kind 分派
```

规则（每个解析器都必须满足，契约测试 `src/lib/evidence/contract.test.ts` 对每个注册解析器逐条运行）：
1. **从不丢弃**：返回数组与输入等长、同序；任何异常 → 该位置 `state='missing', reason='resolver_error'`，并在批次回执里记录。
2. **as_of 语义**：对象在 `as_of` 时已可得（`available_at ≤ as_of`，或该种类的等价时刻）才可能 `ok`；否则 `missing:not_yet_available`。对象之后的修订、隔离不影响 `as_of` 时的解析——**除非**对象被撤回为不可展示（隔离 / 拒绝 / 撤回 / 取消公开），此时 `retracted`（撤回优先于历史可得性：我们不再展示自己已判为错误的值，但版本快照保留其曾被展示的事实，§5.4）。
3. **受众闸门**：`public` 受众下，模块自己的发布闸门不放行的对象 → `withheld`，`display.fact=null`，`drawer` 只含身份与原因，值不出服务器。`admin` 受众可见值，但带 `admin_only=true` 标记，永远不进入公开版本快照。
4. **未服务 vs 未实现**：市场/种类在产品中明确不服务（港股）→ `not_served`；种类在本部署没有解析器（`broker_report_meta` 合并前）→ `unsupported`。
5. **不派生**：解析器只返回对象自身的值与模板，不做跨对象计算。
6. **无副作用**：解析器只读，不写任何表（含审计）；调用方负责记录。
7. **digest 稳定**：同一对象同一 `as_of` 同一受众两次解析 `digest` 相同（夹具测试）。

各种类的状态映射：

| kind | `ok` | `missing` 原因码 | `withheld` 原因码 | 其他 |
|---|---|---|---|---|
| `macro_observation` | 行 `status='ok'`，`available_at ≤ as_of`，序列目录状态非 `restricted` | `not_found`、`not_yet_available`、`locator_mismatch`、`catalog_missing` | `catalog_restricted`、`licence_unconfirmed`（序列不在 `docs/methodologies/licenses.json` 的 owner 确认集，§10 D7） | `retracted`：行 `quarantined/rejected` |
| `industry_metric` | 行 `status='ok'`，运行 `active/superseded` 且 `activated_at ≤ as_of` | `not_found`、行 `status='missing'`（透传 `missing_reason`）、`run_not_active` | `unlicensed`（`industry_dataset_licenses.status<>'public'`） | `history_class='reconstruction'` 的单元格状态仍为 `ok`，但 `basis='reconstruction'`，UI 标"重建口径，非时点"并与时点口径分组显示，不同表比较 |
| `financial_fact` | 行 `status='ok'`，`available_date ≤ as_of`，`evidence-gate.ts` 判可公开 | `not_found`、`not_yet_available` | `evidence_incomplete`、`citation_pending`（透传公司闸门原因；当前 CN 全部落在这里） | `retracted`：`quarantined`；`not_served`：发行人仅有 HK 证券而无 US/CN 事实流 |
| `document_citation` | 引用 `visibility='public'` 且文档 `permission='public'`，`created_at ≤ as_of` | `not_found` | `private_document`（licensed / private / internal） | `retracted`：文档撤回 |
| `broker_report_meta` | — | — | — | 合并前恒为 `unsupported`；合并后按外资研报 §4.11 公开视图：`public_enabled=false` → `withheld:publication_switch_off`，`unpublished_at ≤ now` → `retracted` |
| `judgment` | 判断行存在，`registered_at ≤ as_of`，方法 `publishable=true`；显示走 F4 `toCard` | `not_found`、`not_yet_registered` | `method_not_publishable` | `retracted`：F4 撤回状态；卡片中概率是否显示百分比完全由 F4 `calibrationStateOf` 决定 |

`incomparable` 不是解析状态：单个 ref 没有"不可比"；它只是 `pair` 事实的生成结果（§8.2：两条观测期别或单位不同 → 不生成变化事实，摘要事实清单里记 `pair_incomparable`，页面不显示任何变化数字）。`stale` 也不是解析状态：它是对"数据集新鲜度"的读时标注（`freshness.status`，见 §5.3），与 `ok` 并存。

`SourceDrawerPayload`（统一抽屉，§6.4）：`{kind, identity:{id, label}, source:{publisher, adapter, url|null, locator|null, evidence_sha256|null}, times:{period, available_at, ingested_at|null}, transform:{code_version|null, mapping_version|null, method_version|null}, licence:{status, note_key}, attribution_key, links:{module_href}}`。`attribution_key` 指向 i18n 文案（例如 FRED"经 FRED 获取"、SEC"来源：SEC EDGAR"，§10）。

### 4.2 `topic_settings`（单行发布开关）

`topic_settings(id int primary key check (id = 1), public_enabled boolean not null default false, summary_public_enabled boolean not null default false, summary_provider_note text null, updated_by uuid not null, updated_at timestamptz not null)`。`summary_public_enabled` 是摘要的数据库级许可开关（§15 D11）：为 false 时 `topic_publish` 拒绝任何带 `summary_id` 的发布（`publish_blocked:summary_provider_unconfirmed`），摘要只能在管理员预览中看到；owner 确认所用 LLM 提供方的输出条款后经 `topic_set_public_enabled` 的同一写函数打开，并在 `summary_provider_note` 记下提供方、条款 URL 与确认日期。公开视图（§4.9）全部 `join topic_settings s on s.id = 1 where s.public_enabled`；关闭时登录用户读到 0 行、页面 404，管理员走预览（§7.3）。只经 `topic_set_public_enabled(p_public_enabled, p_summary_public_enabled, p_summary_provider_note, p_licence_confirmations jsonb, p_actor)` 写，写审计（§4.8）；打开 `public_enabled` 的许可确认要求见 §10。

### 4.3 `topics`（专题身份；`topic_slug` 是全站稳定标识）

| 列 | 约束 |
|---|---|
| `topic_id uuid PK` | |
| `topic_slug text not null unique` | `check (topic_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(topic_slug) between 3 and 64)`；**创建后不可更新**（触发器）；**永不复用**：退役后行保留，唯一约束继续占位 |
| `category text not null` | `check (category in ('macro','industry','company','cross_market','method'))`（§15 D5） |
| `status text not null` | `check (status in ('draft','published','unpublished','retired'))` |
| `current_version_id uuid null` | FK → `topic_versions`；只由发布/取消发布函数改 |
| `retired_at timestamptz null`、`retired_reason text null` | 一次性写 |
| `created_by uuid not null`、`created_at` | |

`topic_slug` 是其他模块链接专题的唯一键：公司页、行业页、Copilot 只存 slug，不存 `topic_id` 或版本号（版本号作为可选参数）。退役专题的 slug 解析为 `410 topic_retired`（附退役原因类别）；`superseded_by` 不设——取代发生在同一专题的版本之间（§4.4）。

### 4.4 `topic_versions` 与 `topic_version_evidence`（不可变发布快照）

`topic_versions`：

| 列 | 说明 |
|---|---|
| `version_id uuid PK`、`topic_id FK`、`version_no int` | `unique(topic_id, version_no)`；`version_no` 从 1 连续 |
| `contract_version text not null` | `'evidence-ref/1'` |
| `cutoff timestamptz not null` | 组装时刻；版本内所有 `as_of ≤ cutoff` |
| `snapshot jsonb not null`、`snapshot_hash text not null` | 见下；`snapshot_hash = sha256Hex(canonicalJson(snapshot))`，触发器复核 |
| `summary_id uuid null` | FK → `topic_summaries`（§4.8），须 `approved` 且 `draft_hash` 等于本版本草稿哈希 |
| `disclosure_receipt_id uuid not null` | FK → `topic_disclosure_receipts`，须 `passed` 且 `draft_hash` 相等 |
| `promotion_id uuid null` | 若首个草稿来自私有论点 |
| `published_at`、`published_by` | |
| `supersedes_version_id uuid null` | 上一个当前版本 |
| `unpublished_at timestamptz null`、`unpublish_reason text null` | 一次性写；`reason check in ('error','licence','owner_request','privacy')` |

`snapshot` 结构（全部为公开受众投影）：`{topic:{slug, category, title:{zh,en}, dek:{zh,en}}, sections:[{key, title:{zh,en}, note:{zh,en}|null, items:[{ordinal}|{expected_slot}]}], evidence:[{ordinal, ref, ref_hash, resolved:Resolved(public), section_key}], expected_slots:[{key, kind, label:{zh,en}, reason_code}], entries:[…§4.6 投影…], summary:{…§8.2 渲染结果…}|null, freshness_at_publication:{dataset:status}, contract_version, resolver_versions:{kind:code_version}}`。

`topic_version_evidence(version_id, ordinal int, kind, ref jsonb, ref_hash, as_of, state, digest null, section_key)`，`primary key (version_id, ordinal)`，`unique (version_id, ref_hash)`：快照中证据的关系化副本，供漂移任务与按种类查询（"哪些专题引用了这个 fact"）使用；与快照一致性由发布函数在同一事务写入并以触发器拒绝任何 update/delete。

**不可变性**：`topic_versions` 除 `unpublished_at/unpublish_reason`（null → 值，一次）外不可更新；不可删除（`topic_purge` 只在 §16 Q5 决策后定义）。读取旧版本 = 读快照，不依赖活表，因此源表后来的修订、隔离、运行删除（`industry_metrics` 对运行 `on delete cascade`）都不改变已发布数字。

### 4.5 `topic_drafts`（可编辑草稿，仅管理员）

`topic_drafts(draft_id PK, topic_id FK unique, revision int not null, body jsonb not null, draft_hash text not null, updated_by, updated_at)`；乐观并发：保存须带 `expected_revision`，不等 → 409。`body` = `{title, dek, sections[{key,title,note,items}], evidence[{ref, section_key}], expected_slots[], entries[], blocks_provenance:{block_key:'owner'|'from_thesis'}}`；`draft_hash = sha256Hex(canonicalJson(body))`。

**owner 文字的数字规则**（§15 D4，默认严格）：`title`、`dek`、`section.note`、`owner_note` 正文都过与模型输出相同的词法检查（`numeral`、`forbidden_term`、荐股词；§8.2 第 4–6 步），不过象限词检查。数字只能用证据插槽 `{{ev:<ordinal>}}`（渲染该 ref 的模板事实句）或 `{{ev:<ordinal>.period}}`（渲染期别）出现；日期同理。插槽指向的 ref 不是 `ok` 时渲染为该状态的文案，不是数字。

### 4.6 条目（访谈 / 专家笔记的对应物）与 `topic_source_licences`

条目类型只有两种：

| `entry_type` | 来源 | 服务条件 | 显示 |
|---|---|---|---|
| `owner_note` | owner 本人撰写 | 恒可（过 §4.5 词法检查） | "编者笔记"，署名 owner 显示名，无数字 |
| `licensed_excerpt` | owner 提供的外部来源（采访稿、文章等） | 该来源在 `topic_source_licences` 中 `status='approved'` 且 `permits.display_excerpt=true` | ≤ 3 段短引文（每段 ≤ 120 汉字或 ≤ 60 英文词，§15 D2），每段带署名、日期、原链接；引文内数字原样保留并标注"引文中的数字为原文表述，未经本站核实"，不进入模型摘要输入 |

`topic_source_licences(licence_id PK, source_title, publisher, source_url, terms_url, terms_read_at date, terms_clause text check (length ≤ 200), permits jsonb {display_excerpt bool, max_chars_zh int, max_words_en int, max_fragments int, link_required bool, full_text bool}, status check in ('pending','approved','revoked'), decided_by, decided_at, note)`。这是本模块的**数据库级许可开关**（同 `industry_dataset_licenses` 模式）：`revoked` 立即使所有引用它的 `licensed_excerpt` 在**当前读取**中渲染为 `withheld:licence_revoked`（快照中的引文文本在读时被遮蔽，且不等待漂移任务：读取路径直接 join `topic_source_licences.status`。读时遮蔽的完整规则见 §5.4——许可撤回与来源撤回优先于回放）。`permits.full_text=true` 也不放开全文：v1 不存全文（§1.2）。今天没有任何已登记来源 → `licensed_excerpt` 类型 `not_served`，编辑器不显示该选项（§9 矩阵）。

### 4.7 晋升：`topic_promotions`（私有论点 → 公开专题草稿）

`topic_promotions(promotion_id PK, topic_id FK, source_kind check in ('research_thesis'), source_id uuid not null, source_content_hash text not null, copied jsonb not null, stripped jsonb not null, actor uuid not null, created_at)`。**无 FK 指向 `research_*`**（私有表随用户级联删除，不能反向约束；也避免公开 schema 依赖私有表）。

流程（全部由 owner 显式触发，没有任何 cron、钩子、状态变化会自动晋升）：
1. owner 在 `/research/theses/[id]` 点"以此为起点新建专题"（纯链接）→ `/admin/topics/new?fromThesis=<id>`。
2. 服务端以 owner 会话读该论点一行（RLS `auth.uid() = user_id`；读不到 → 404），**只读** `title`、`body`。
3. 生成新专题与草稿：`title` → 草稿标题建议；`body` → 一个 `owner_note` 条目的初稿，`blocks_provenance='from_thesis'`。
4. `stripped` 记录未复制的字段名与计数（不记录其内容）：`supporting_evidence_ids`（n 个，指向私有来源）、`invalidation_conditions`、`watch_metrics`、`last_assessment`、`pillars`、`catalysts`、`kill_condition_revisions`、`company_ids`、`theme_ids`、`status`、`next_review_at`；编辑器在侧栏列出"未带入的私有内容"，供 owner 参考后**自行**挂接公开证据。
5. `source_content_hash = sha256(canonicalJson({title, body}))`；`copied = {fields:['title','body'], at}`。
6. 发布前强制：每个 `from_thesis` 块必须被 owner 编辑或逐块确认（"已检查，无私有内容"），否则披露检查失败 `unreviewed_private_block`。

本模块对 `research_*` 只有两种只读访问，均以操作者本人会话、受 RLS 约束：(a) 第 2 步对 `research_theses` 的单行 `.select('title,body')`；(b) 披露检查第 3 项对 `research_theses`、`research_memos`、`research_source_documents`、`research_thesis_events` 的 `.select('id')`（只取 id 集合，在内存中比对后丢弃，不落库、不进审计）。代码层守卫测试：`src/lib/topics/**` 中出现 `.from('research_` 的位置只能是这两处，且 select 列表只能是 `'title,body'` 或 `'id'`；不存在 insert/update/delete/rpc（静态扫描测试）。

### 4.8 摘要、披露检查与审计表

- `topic_summary_runs`（service-only，镜像 `macro_explanation_runs` 的列与状态机）：`run_id PK, topic_id, draft_hash, locale, request_id, payload_hash, state check in ('running','accepted','rejected','failed','abandoned'), manifest jsonb（冻结事实列表）, raw_output jsonb, validation jsonb, finalize_payload jsonb, finalized bool, usage_audit_key unique, prompt_version, validator_version, provider, model, actor, claimed_at, finished_at`；`unique(actor, request_id)`。
- `topic_summaries(summary_id PK, run_id FK unique, topic_id, draft_hash, locale, rendered jsonb, status check in ('generated','approved','discarded'), approved_by, approved_at)`；唯一 `(topic_id, draft_hash, locale) where status='approved'`；`approved` 触发器复核：对应运行 `accepted`、`draft_hash` 等于当前草稿哈希。
- `topic_disclosure_receipts(receipt_id PK, topic_id, draft_hash, checks jsonb, passed bool, code_version, actor, created_at)`：只插入。
- `topic_audit_log(id bigserial PK, topic_id null, actor uuid, action check in ('create','draft_save','promote','disclosure_check','summary_run','summary_approve','preview','publish','unpublish','retire','licence_change','settings_change','replay_verify'), detail jsonb, created_at)`：只插入；不记 IP；`detail` 不存私有内容（只存 id、哈希、计数、原因码）。
- `topic_evidence_drift(version_id, ordinal, checked_at, drift check in ('unchanged','revised','newer_period','retracted','now_withheld','unverifiable'), current_identity jsonb, primary key (version_id, ordinal))`：漂移任务 upsert（§5.4），只 service_role 写。

### 4.9 权限与公开视图

- 公开视图（owner `postgres`，`security_barrier=true`，`grant select to authenticated`，不给 anon）：`topics_public_v`（`status in ('published','unpublished','retired')` 的身份与当前版本元数据）、`topic_versions_public_v`（全部已发布过的版本；`unpublished` 版本只暴露元数据列与 `unpublish_reason`，`snapshot` 列为 null）、`topic_evidence_drift_public_v`。三者都 join `topic_settings` 开关。
- 草稿、摘要运行、披露回执、晋升、审计、许可：只 service_role；管理员路由用 admin 客户端读写，先过 `requireAdminUser()`。
- 写函数（`security definer`，`search_path=''`，只 grant service_role）：`topic_create`、`topic_save_draft`、`topic_record_promotion`、`topic_record_disclosure`、`topic_claim_summary` / `topic_record_summary_completion` / `topic_finish_summary` / `topic_mark_summary_finalized` / `topic_expire_summaries`（镜像宏观五个 RPC 的语义）、`topic_approve_summary`、`topic_publish`、`topic_unpublish`、`topic_retire`、`topic_set_licence`、`topic_set_public_enabled`、`topic_upsert_drift`。每个写函数在同一事务写 `topic_audit_log`。
- `topic_publish(p_topic_id, p_expected_draft_hash, p_snapshot, p_evidence rows, p_summary_id, p_receipt_id, p_actor)`：校验草稿哈希未变、回执 `passed` 且同哈希、摘要（若有）`approved` 且同哈希、`snapshot_hash` 正确、证据行与快照一致、快照中无任何 `admin_only` 标记或受限值（`withheld` 项的 `display.fact` 必须为 null，函数逐条复核）、§6.6 阻断项全部通过 → 插入版本、置旧当前版本的 `supersedes` 链、更新 `topics.current_version_id/status`。

### 4.10 迁移

- `supabase/migrations/20261201090000_topics.sql`：§4.2–§4.8 全部表、触发器、公开视图；`topic_settings` 插入 `public_enabled=false` 一行。
- `supabase/migrations/20261201091000_topics_functions.sql`：§4.9 函数与授权。
- 若 owner 选择 §15 D3 默认（新用量特性 `topic_summary`）：`supabase/migrations/20261201092000_usage_feature_topic_summary.sql` 以 `create or replace` 更新 `usage_events` 与三处预算函数的特性枚举（对照 `20260728120000_llm_reservation_usage_audit.sql` 当前函数体逐字修改枚举，迁移测试比对函数其余部分不变）。
- 时间戳须晚于 `migrations.lock.json` 锁定的最新迁移；实施时若有更晚迁移落地，整体顺延。新表均为空表，无锁风险；用量函数替换在单事务内完成，期间正在进行的预留调用会等待函数锁（毫秒级），在低峰执行。
- `database.types.ts` 手工补 Row 类型；锁文件按仓库流程更新。

---

## 5. 管道与新鲜度

专题没有采集器。有三个作业：组装（管理员动作）、漂移检查（cron）、回放核验（管理员动作 + 每周 cron 抽样）。

### 5.1 组装（`src/lib/topics/assemble.ts`）

输入草稿 + `cutoff = now()`（发布）或草稿内显式 `as_of`。步骤：草稿证据 → 每个 ref 的 `as_of` 若缺省取 `cutoff`，若晚于 `cutoff` 拒绝 → 批量 `resolve(refs, {audience:'public'})` 与 `resolve(refs, {audience:'admin'})` 各一次 → 公开结果入快照，管理员结果只用于预览对照 → 读新鲜度 → 组装快照（§4.4）。纯函数部分（快照构造、哈希）与 I/O 分离，夹具可离线运行。幂等：同草稿哈希 + 同 `cutoff` 产生同快照哈希（测试）。

### 5.2 失败语义

- 单个 ref 解析失败 → 该 ref `missing:resolver_error`，组装继续；整批中 `resolver_error` 占比 > 20% → 预览显示阻断提示，发布被拒 `resolver_degraded`（不把基础设施故障冻结成一个"缺失很多"的版本）。
- 发布事务失败 → 无部分写入（单函数事务）；草稿不变；审计记失败原因。
- 漂移任务失败 → 保留上一次 `topic_evidence_drift`，页面显示"漂移检查截至 <checked_at>"；超过 72 小时未成功 → 页面在漂移标记旁显示 `stale` 徽章，绝不把未检查当作"未变化"。

### 5.3 新鲜度

- 每个 ref 的 `freshness` 由解析器从 `dq_freshness`（宏观、行业、事实三个数据集键）读时计算，与 `src/lib/macro/freshness.ts`、`industry/read.ts::effectiveFreshness` 同规则（读时按 `now` 重算）。
- 发布时冻结 `freshness_at_publication`；读当前版本时同时显示"发布时新鲜度"与"现在距发布 N 天"。版本年龄超过 `TOPIC_STALE_DAYS`（默认 90 天，§15 D9）→ 目录卡片与页眉显示 `stale`："该版本发布于 <日期>，之后未更新"。
- `stale` 永远不改变数字，只加标注。

### 5.4 漂移检查（`/api/cron/topic-drift`，`vercel.json` 每日 `30 6 * * *`）

对每个已发布且未取消发布的版本的每条证据，调用解析器 `latestIdentity(ref)`：

| 漂移 | 判据 | 页面文案（zh） |
|---|---|---|
| `unchanged` | 当前最新对象 = 冻结对象 | 无 |
| `revised` | 同一身份（宏观 `(series_id, period_end)`；事实 `(issuer, concept, period, duration, consolidation, unit)` 的当前披露；行业 `(scheme, version, code, metric, period)` 的当前活动运行）出现不同值 | "发布后证据已修订" + 抽屉内新旧两值（新值仍过公开闸门） |
| `newer_period` | 同一序列/概念出现更晚期别 | "已有更新期数据" |
| `retracted` | 冻结对象被隔离/拒绝/撤回 | "该证据已被来源模块撤回"；**读时遮蔽**：值不再显示（我们不继续展示已判为错误的值），保留标签、期别与"曾于 v<n> 展示"说明 |
| `now_withheld` | 冻结对象当前不再过公开闸门（许可收回、数据集改回 `internal`、序列移出已确认集、文档改为非公开、证据闸门不再通过） | "该证据现受限"；**读时遮蔽**：值与片段不再显示（许可先于展示；不以"历史上曾合法展示"为由继续展示） |
| `unverifiable` | 解析器不可用 / 种类 `unsupported` | "无法核对" |

**读时遮蔽规则（规范性）**：`retracted`、`now_withheld` 两种漂移在所有公开读取路径（当前版本、指定版本、`asOf` 回放、证据抽屉、Copilot 工具）中把该证据的 `display.fact`、抽屉中的值与片段、以及引用它的摘要事实句替换为状态文案；引用被遮蔽事实的模型假设句整句隐藏并显示"所依据的证据已撤回/受限"。快照字节与 `snapshot_hash` 不变（审计与管理员核验仍可读原值）。遮蔽依据是最近一次成功的漂移检查；因此许可撤回或发现错误值时，owner 的即时手段是 `unpublish`（立即生效），漂移遮蔽是每日兜底，不是唯一防线。漂移检查超过 72 小时未成功时，页面除 `stale` 徽章外在页眉显示"证据状态未能核对"。

漂移只写 `topic_evidence_drift`，**从不修改** `topic_versions` 或快照。owner 在管理页看到"有 N 条修订"的专题列表，决定是否发布新版本（取代）。批大小 500 ref，`maxDuration=300`，按 `(version_id, ordinal)` 游标续跑；幂等 upsert。

### 5.5 回放核验

`POST /api/admin/topics/[id]/versions/[n]/verify`：对版本每条证据以其 `as_of` 重新解析（公开受众），比较 `digest` 与快照；结果 `{matched, mismatched:[{ordinal, reason}]}` 写审计。期望：除 `retracted`/`now_withheld` 外全部匹配；不匹配是解析器缺陷（回放性被破坏），进入 `dq_quarantine`（`dataset='topics.replay'`）并在管理页红色提示。每周日 cron 随机抽 20 个版本运行（同一路由的 cron 入口）。

---

## 6. 读取接口

共同约定：路由先 `getServerSupabase().auth.getUser()`（无 → 401）→ `TOPICS_ENABLED==='1'`（否 → 404 `topics_disabled`）→ 公开读走 `authenticated` 客户端读 §4.9 视图（开关关 → 0 行 → 404）；`force-dynamic`；响应 `Cache-Control: private, no-store`（目录内容按用户会话读取，且漂移每日变化）；参数重复 → 400 `invalid_parameter:<name>`。

### 6.1 公开（登录用户）

| 路由 | 参数 | 返回 |
|---|---|---|
| `GET /api/topics` | `category?`、`q?`（标题前缀，≤ 32 字）、`cursor?`、`limit?`（默认 50，最大 200） | `{items:[{slug, category, title, dek, version_no, published_at, evidence_counts:{ok,missing,withheld,not_served,retracted,unsupported}, drift_counts, stale:boolean}], nextCursor}`；排序 `published_at desc` |
| `GET /api/topics/[slug]` | `asOf?`（`YYYY-MM-DD`） | 当前版本（或 `asOf` 时的版本）的完整档案：快照 + 漂移 + 版本链元数据 |
| `GET /api/topics/[slug]/versions` | — | 版本列表（含已取消发布版本的元数据与原因类别） |
| `GET /api/topics/[slug]/versions/[n]` | — | 指定版本快照；已取消发布 → `410 version_unpublished`，体内只有元数据 |
| `GET /api/topics/[slug]/evidence/[ordinal]` | `version?` | 冻结的抽屉载荷 + 漂移详情（`revised` 时附当前值，仍过公开闸门） |

### 6.2 `asOf` 回放语义

`asOf=D` → 取满足 `published_at ≤ D 23:59:59.999Z` 的最大 `version_no`（记为当时的当前版本）；无 → 404 `no_version_at_asof`。若该版本后来被取消发布（`unpublished_at` 非空，无论早于还是晚于 D）→ `410 version_unpublished`，体内只有元数据与原因类别（§15 D12：被撤内容在任何视图都不再提供，回放不是绕过取消发布的通道）。回放只读快照，不重新解析；`revised`、`newer_period` 漂移标记在回放视图中不显示（回放展示"当时读者看到的样子"，页眉写明"回放视图：<D> 时的版本 v<n>"），但 §5.4 的读时遮蔽（`retracted`、`now_withheld`、许可撤回）在回放视图中照常生效。`asOf` 晚于今天 → 400。

### 6.3 响应中的证据状态（与 §4.1 一一对应）

`ok`、`missing`、`withheld`、`not_served`、`unsupported`、`retracted`，外加 `basis`（重建口径）、读时标注 `stale`（数据集或版本年龄）与漂移 `revised/newer_period/now_withheld/unverifiable`。预期证据槽恒为 `missing` 并带槽的 `reason_code`（如 `industry_not_published`、`hk_not_served`、`foreign_research_unmerged`）。响应中每条证据都在，数量与快照一致（测试 A3）。

### 6.4 来源抽屉

抽屉载荷即 `SourceDrawerPayload`（§4.1），来自快照，不调用源模块；"在源模块中查看"链接跳到 `/macro/...`、`/intel/industries/...`、`/stock/[ticker]`、`/api/documents/doc/[id]`（公共文档）、`/intel/methods/[id]`（F4 方法页）。`withheld` 的抽屉只显示身份与原因码文案。

### 6.5 管理接口（`requireAdminUser()`；POST 校验 `Content-Type` 与 `Origin`；全部写审计）

| 路由 | 作用 |
|---|---|
| `POST /api/admin/topics` | 创建（`slug`、`category`、`title`）；slug 冲突 → 409 `slug_taken`（含已退役） |
| `POST /api/admin/topics/from-thesis` | `{thesis_id}` → §4.7 晋升；返回新专题与草稿 |
| `GET/PUT /api/admin/topics/[id]/draft` | 读/存草稿（`expected_revision`） |
| `GET /api/admin/topics/[id]/evidence-search` | 证据选择器：`kind` + 种类内查询（宏观序列 id；ticker + concept + 期间；行业 scheme/code/metric；文档 id；judgment id）→ 候选 ref 与公开/管理双解析预览 |
| `POST /api/admin/topics/[id]/disclosure-check` | 运行 §6.6 检查，写回执 |
| `POST /api/admin/topics/[id]/summary` | §8.2 生成（`{request_id, locale}`） |
| `POST /api/admin/topics/[id]/summary/[summaryId]/approve` \| `discard` | |
| `GET /api/admin/topics/[id]/preview` | 组装但不写版本；返回公开投影 + 管理员投影差异（哪些值在公开视图被遮蔽） |
| `POST /api/admin/topics/[id]/publish` | `{expected_draft_hash}`；阻断 → 409 `publish_blocked:<codes>` |
| `POST /api/admin/topics/[id]/unpublish` | `{reason}`：当前版本 `unpublished_at`；`current_version_id` 回退到上一未取消版本（若有），否则专题 `status='unpublished'` |
| `POST /api/admin/topics/[id]/retire` | `{reason}`；slug 永久保留 |
| `POST /api/admin/topics/[id]/versions/[n]/verify` | §5.5 |
| `GET/POST /api/admin/topics/licences` | §4.6 许可登记 |
| `POST /api/admin/topics/settings` | `{public_enabled}` |

### 6.6 披露检查与发布阻断（`src/lib/topics/disclosure.ts`，`DISCLOSURE_VERSION='topic-disclosure/1'`）

确定性检查，结果逐项写回执：
1. **证据种类**：只允许 §4.1 六种；`broker_report_meta` 在 `unsupported` 时阻断 `kind_unsupported`。
2. **证据受众**：公开解析中 `withheld` 的 ref 允许（以受限状态展示），但计数入回执；`withheld` 占比 > 50% → 警告 `mostly_withheld`（不阻断，§15 D10）。
3. **私有来源指纹**：草稿所有文字（含 note、条目、标题、dek）中不得出现：owner 的任何 `research_*` 行 id（服务端以 owner 会话读取其 `research_theses/research_memos/research_source_documents/research_thesis_events` 的 id 集合，只在内存比对）、`/research/` 路径、`content_hash` 形态的 64 位十六进制串、非公开 F3 文档 id；命中 → `private_reference`。由于 RLS 只让操作者读到自己的行，id 集合比对覆盖不到其他管理员的私有行；因此另加一条与身份无关的规则：owner 文字中出现任何 UUID 形态或 64 位十六进制串一律阻断 `identifier_in_text`（公开文字没有理由包含内部标识）。
4. **未审阅晋升块**：`blocks_provenance='from_thesis'` 且未编辑/未确认 → `unreviewed_private_block`。
5. **词法**：owner 文字过 §4.5 规则 → `numeral_in_owner_text`、`advice_term`、`forbidden_term`。
6. **引文**：`licensed_excerpt` 许可 `approved`、段数与长度不超限、署名与链接齐全 → 否则 `excerpt_violation`。
7. **证据槽插槽**：`{{ev:n}}` 指向存在的 ordinal → 否则 `dangling_slot`。
8. **摘要一致**：若附摘要，`draft_hash` 一致且 `approved`，且 `topic_settings.summary_public_enabled=true`（否则 `summary_provider_unconfirmed`）；已批准摘要的 `provider/model` 须与 `summary_provider_note` 记录的提供方一致，不一致 → `summary_provider_mismatch`。
9. **解析健康**：§5.2 的 `resolver_degraded`。
10. **空档案**：证据 0 条且无预期槽 → `empty_dossier`。

---

## 7. 页面与 UI 流程

所有页面在 `(app)` 组内（登录）；`TOPICS_ENABLED` 关 → `notFound()`；新增 i18n 域 `topics`；tokens 只用 §2 列出的变量；数字使用 `--num-font`；状态色：`withheld/not_served` 用 `--text-muted` + 文字标签（不用红绿，红绿在本站是涨跌语义），`retracted` 用 `--danger` 细边框，`stale/revised` 用 `--warn`，强调只用 `--accent`。

### 7.1 目录 `/intel/topics`

- 页头：标题、副标题"由本站证据组装的版本化专题档案"；分类分段控件（全部 / 宏观 / 行业 / 公司 / 跨市场 / 方法）；标题搜索。
- 卡片：标题、dek、分类、`v<n> · <发布日期>`、证据状态条（`ok/missing/withheld/…` 计数，文字 + 数字，非仅色块）、漂移徽章（"N 条证据发布后已修订"）、`stale` 徽章。
- 状态：加载骨架；空目录（"尚无已发布专题"；管理员额外看到"去创建"）；开关关闭时管理员看到"目录未对外 · 预览"横幅；错误态（本页 `no-store`，无缓存结果可退回）只显示错误码文案与重试。
- `/intel` 首页加入口卡片（与 `IndustryEntryCard` 同模式，`// TOPICS` 围栏）。

### 7.2 档案页 `/intel/topics/[slug]`（及 `?asOf=`、`/v/[n]`）

自上而下：
1. 版本条：`v<n>`、发布日期、截止时刻、"共 N 版"下拉、`asOf` 日期选择（回放）、被取代/已取消发布横幅。
2. 标题、dek、分类。
3. **摘要面板**（若有）：页眉"事实句由系统从冻结证据生成；机制假设由模型生成，未经核实。"；左栏事实句（每句末尾引用角标 → 抽屉），右栏假设与反方（每句末尾引用角标，指向其 `fact_ids` 对应证据）。
4. **分节证据**：每节标题 + 编者说明（插槽渲染）；证据行 = 标签、模板事实句、期别、可得时间、状态徽章、漂移徽章、"来源"按钮；预期证据槽为虚线行 + 缺失原因。每节若含同一宏观序列的多条观测，提供折线图 + **表格等价视图**切换（图只画 `ok` 值；缺失期为断点，不插值）。
5. 条目区：编者笔记；许可引文（若服务）。
6. 页脚：数据状态汇总（受限市场说明：CN 数值暂不公开、港股未服务、行业数据尚未发布）、来源署名清单（§10 的 `attribution_key`）、`Disclaimer` 组件。
- 移动端：版本条折叠为单行；摘要两栏变上下；证据行变卡片；抽屉全屏。

### 7.3 管理：`/admin/topics`、`/admin/topics/[id]`

- 列表：草稿 / 已发布 / 已取消 / 已退役；"有修订"筛选；开关状态。
- 编辑器三栏：左 = 分节与证据列表（拖动排序、插入预期槽）；中 = 文字（插槽插入器 `{{ev:n}}`，实时词法提示）；右 = 证据选择器（§6.5）与"未带入的私有内容"（晋升时）。
- 底部流程条：保存 → 披露检查（逐项结果）→ 生成摘要（可选；显示被拒原因码与命中片段）→ 批准摘要 → 预览（公开投影，标"预览 · 未发布"，并列显示"公开视图被遮蔽的值"计数）→ 发布（确认对话框列出将冻结的证据数与状态分布）。
- 版本页：取消发布、核验回放、漂移详情。

### 7.4 私有工具中的入口

`src/app/(app)/research/theses/[id]/page.tsx` 加一个链接按钮"以此为起点新建公开专题"（仅 `TOPICS_ENABLED==='1'` 时渲染）。不加任何写操作、不显示"已晋升"状态（避免把公开状态写进私有视图；owner 在 `/admin/topics` 查看晋升记录）。

---

## 8. 判断层与摘要

### 8.1 本模块不产生判断

专题 v1 **没有 F4 方法**，不登记判断，不结算，不校准。引用的 F4 判断（`judgment` 种类）按 F4 显示契约渲染（`toCard`；概率是否以百分比出现由 `calibrationStateOf` 决定，未校准不显示百分比）。若将来要给专题本身加"结论"，须先给出方法 id、输入快照、可证伪条件与结算规则，另立修订。

### 8.2 摘要机制：复用 / 泛化 / 新建

| 部件 | 处理 | 说明 |
|---|---|---|
| `hash.ts::canonicalJson/sha256Hex` | **原样复用** | 移到 `src/lib/evidence/hash.ts`，宏观处再导出 |
| `numeric.ts`（`typedChange` 依赖的十进制运算）、`explain-render.ts::roundDecimal/formatSlot` | **原样复用** | 单位表 `UNIT_SUFFIX` 需扩充（见泛化） |
| `explain-validate.ts::NUMERAL_PATTERNS`、`lexicalFailures` 的数字检查与 NFKC 归一化、`parseModelContent` | **原样复用** | 正反例夹具原样继承 |
| `explain-validate.ts::validateExplanation` | **泛化** | 抽成 `validateHypotheses(raw, factIds, policy)`；`policy = {forbidden, regime, advice, singleSentence}`；宏观以现有常量构造 policy，行为不变（宏观现有测试全部保持） |
| `FORBIDDEN_TERMS`、`REGIME_TERMS` | **泛化为可组合清单** | 专题 policy = 宏观禁用词 ∪ 象限词（专题 v1 同样不让模型谈判断）∪ 新的荐股词表 `ADVICE_TERMS`：买入、卖出、推荐、增持、减持、目标价、建仓、抄底、buy、sell、recommend、overweight、underweight、target price、accumulate（中文子串、英文词边界；单测逐条）；清单只在校验器文件与其测试中拼写 |
| `contract.ts::Fact` | **泛化** | `Fact` 增加 `evidence:EvidenceRef[]`（替代宏观的 `source_inputs` 角色字符串，宏观保留原字段）；专题事实 id = `ev:<ordinal>` 或 `pair:<a>:<b>` |
| `explain-render.ts::TEMPLATES` | **泛化** | 模板注册表按命名空间合并：宏观模板保持；新增 `topic.*` 模板（下）。名称查找 `NameLookup` 由"冻结序列目录"泛化为"冻结标签表"（每个 ref 的 `display.label`） |
| `facts.ts::typedChange` | **原样复用** | 只用于同一宏观序列两条 `ok` 观测的 `pair` 事实；期别或单位不同 → 不生成，清单记 `pair_incomparable`（§4.1） |
| 请求流程（认证 → 开关 → ajv → payload 哈希 → 幂等重放 → 完成恢复 → 认领 → `beginUsageRun` → `runMeteredLlmCall` → 立即登记完成载荷 → 校验 → finish → finally `finalizeUsageRun` → mark finalized → 读时过期） | **泛化** | 抽出与主体无关的骨架 `runValidatedExplanation(deps, subject)`；宏观与专题各自提供：主体加载、清单构造、存储 RPC 适配。宏观的 `explain-request.ts` 迁移到骨架后，`strategy.integration.test.ts` 与 `explain-request.test.ts` 不改断言 |
| 存储（`macro_explanation_runs` 按用户、`subject_kind` 仅 snapshot/review） | **新建** | `topic_summary_runs`/`topic_summaries`（§4.8）：主体是"草稿哈希"，生成者是管理员，结果经批准后冻结进版本、对所有读者可见——宏观表是按用户私有投影，不能承载共享发布物 |
| 提示词 | **新建** | `src/lib/topics/prompts/topic-summary-v1.{zh,en}.md`（`topic-summary-prompt/1`）：输入是冻结事实句列表（`fact_id: 文本`）；要求每条 point/counterpoint 恰好一句、引用 1–4 个 fact_id、不写数字、不写荐股与判断措辞 |
| 每句引用 | **新建** | 校验新增 `multi_sentence`：每条文本在 NFKC 后按 `。！？.!?；;` 切分，非空句 > 1 → 拒绝。于是每个模型句都带自己的 `fact_ids`；事实句本身就是单个 ref 的模板渲染（带该 ref 引用）。渲染后的每一句都有引用（测试 A9） |
| 判断输入 | **新建规则** | `judgment` 种类与非 `ok` 状态的 ref 不进入事实清单（与宏观 §7.7 一致）；`licensed_excerpt` 与 owner 文字不进入模型输入 |
| 用量 | **复用 + 新特性值** | `checkQuota/beginUsageRun/runMeteredLlmCall/finalizeUsageRun` 原样；特性值 `topic_summary`（§15 D3）；管理员 `budgetExempt` 沿用现有规则；`EXPLAIN_MAX_OUTPUT_TOKENS`、温度、超时复用宏观常量 |
| 校验器版本 | **新建** | `topic-summary-validator/1`；校验器版本变化时未批准的运行 `failed:validator_version_changed`（同宏观） |

`topic.*` 模板（zh/en 各一）：`topic.macro_level`（序列、期别、值）、`topic.macro_change`（pair，复用 `change` 语义）、`topic.fact_value`（公司、概念、期间、值、单位）、`topic.industry_value`（行业、指标、期间、值、成员数 `n_with_data/n_members`）、`topic.citation`（文档标题、页码；不渲染片段文字中的数字——片段只在抽屉中以引文样式出现）、`topic.judgment_ref`（无数字："见 F4 判断卡 <方法名>"）。模板测试：注册表中的每个模板 id 都有 zh/en 渲染且被至少一个夹具覆盖。

摘要输出形状（与宏观相同）：`{points:[{fact_ids:string[1..4], hypothesis}], counterpoints:[{fact_ids:string[1..4], text}]}`，points 1–6 条，每条 ≤ 240 字符。渲染结果 `rendered = {facts:[{fact_id, text, refs:[ordinal]}], points:[{text, fact_ids, refs}], counterpoints:[…], prompt_version, validator_version, model, provider}` 冻结进版本快照。

---

## 9. 开关与能力矩阵

- 服务端开关 `TOPICS_ENABLED`（`src/lib/topics/flags.ts`，`==='1'`，默认关）：关 → 全部页面 `notFound()`、全部 API 404、cron 直接返回 `{skipped:'disabled'}`、论点页入口不渲染、Copilot 工具不注册。
- 数据库开关 `topic_settings.public_enabled`（默认 false）：关 → 非管理员读到 0 行。
- 数据库许可开关 `topic_source_licences.status`（逐来源）。
- 继承的源模块闸门：`industry_dataset_licenses`、公司证据闸门（含 `FACTS_CN_ENABLED` 背后的 CN 路径）、F3 可见性、F4 `publishable`、外资研报 `broker_research_settings.public_enabled`（合并后）。专题从不绕过它们。

能力矩阵（served = 公开版本中可显示值；withheld = 以受限状态显示；not built = 该阶段不存在）：

| 能力 × 范围 | T0（底座） | T1（摘要） | T2（晋升 + 条目） | T3（外部依赖就绪后） |
|---|---|---|---|---|
| 目录 / 档案 / 版本 / 回放 | served（开关开后） | served | served | served |
| `macro_observation` US | served | served | served | served |
| `macro_observation` CN | served（限 licenses.json 已确认序列，其余 withheld） | 同 | 同 | 同 |
| `financial_fact` US | served（过证据闸门） | 同 | 同 | 同 |
| `financial_fact` CN | withheld | withheld | withheld | served 当公司模块放开 |
| 港股任何事实 | not_served | not_served | not_served | 随 F3 港股事实 |
| `industry_metric` | 解析器已建；生产无数据 → 只能用预期槽（missing） | 同 | 同 | served 当行业运行发布且数据集 `public` |
| `document_citation` 公共 | served | served | served | served |
| `document_citation` 私有/授权 | withheld（且披露检查阻断私有 id 出现在文字中） | 同 | 同 | 同 |
| `broker_report_meta` | not built（unsupported，阻断发布） | 同 | 同 | served 当外资研报合并且其 D1 许可与开关打开 |
| `judgment` | served（`macro_regime@v2` 等 publishable 方法） | 同 | 同 | 同 |
| LLM 摘要 | not built | 仅管理员预览，直到 `summary_public_enabled` 打开（D11）；之后 served | 同 | 同 |
| 私有论点晋升 | not built | not built | served（管理员） | served |
| `owner_note` 条目 | served | served | served | served |
| `licensed_excerpt` 条目 | not built | not built | not_served（无已批准来源） | served 当 owner 登记来源 |
| 漂移检查 / 回放核验 | served | served | served | served |
| Copilot `topic_dossier` | not built | not built | not built | T4 |

---

## 10. 许可表

**发布门槛（总纲"许可先于功能"）**：`topic_settings.public_enabled` 打开前，owner 须逐行确认下表"待 owner 确认"列（D7、D11 及沿用的外部事项）；`topic_set_public_enabled(true)` 要求调用方提交一份确认记录（每个 `attribution_key` 对应的条款 URL 与确认日期，写入 `topic_audit_log.detail`），缺任何一项被本次已发布版本实际引用的来源 → 拒绝 `licence_confirmation_missing`。未读到条款的来源（下表"未能读取"）不因本规格而获得任何新的展示许可：它们在专题中的可见性完全取决于源模块闸门与 `licenses.json` 的既有 owner 确认。

读取日期均为 2026-11-16（本稿作者自行读取；"未能读取"项如实标注）。原则：专题**不新增**任何外部数据源，只重新展示源模块已发布的值；因此专题的许可姿态 = 源模块的姿态，且不得更宽。

| 来源 | 所有者 / 条款 URL（实际读取） | 依据条款（< 15 词引文或转述） | 允许（存 / 显示 / 再分发 / 派生） | 我们的决定 | 待 owner 确认 |
|---|---|---|---|---|---|
| FRED 中转的美国宏观序列 | 圣路易斯联储；https://fred.stlouisfed.org/legal/ | "free to use FRED for your own non-commercial, educational, and personal uses"；带版权标记的序列"owned by third parties and have special restrictions"；要求注明来源并说明经 FRED 获取 | 非商业使用；第三方版权序列另需所有者许可 | 只展示宏观模块已展示、且在 `docs/methodologies/licenses.json` 有 owner 确认记录（2026-11-07）的序列；其余 `withheld:licence_unconfirmed`；抽屉显示"来源：<原发布机构>，经 FRED 获取" | D7：本站收费产品形态与 FRED"非商业"条款的关系（该问题宏观模块已存在，专题不扩大，但应由 owner 正式确认） |
| 美联储理事会 / BLS 原发布序列、NBS / 中债 / 外管局 CN 序列 | licenses.json 中列出的各站点 | 未能读取（2026-11-16，本稿未逐一抓取；依赖 licenses.json 记录的 owner 2026-11-07 确认） | 依 licenses.json | 同上：只展示已确认集 | 同 D7 |
| SEC EDGAR（美股事实与文件） | SEC；https://www.sec.gov/about/privacy-information（Website Dissemination 节） | 信息为公开信息，"may be copied or further distributed by users"；请注明 SEC 为来源；勿用 SEC 徽标 | 存 / 显示 / 再分发 / 派生 均可，需署名 | 服务；抽屉署名"来源：SEC EDGAR"；不使用 SEC 徽标 | 无 |
| 巨潮资讯（CN 事实与 PDF） | 深圳证券信息有限公司；http://www.cninfo.com.cn/new/index（首页页脚，未找到使用条款页） | 页脚仅有"版权所有"与准确性免责声明；未见转载/再分发条款 | 未明 | CN 值维持 `withheld`（与公司模块一致）；文档引用仅当 F3 判为 `permission='public'` | 是否可公开展示 CN 披露数值与片段（沿用公司/F3 的既有 owner 事项，专题不另开） |
| 行业数据集（`sw2021`、`sic` 等） | 由行业模块 `industry_dataset_licenses` 管理 | 未能读取（2026-11-16，本稿未抓取行业分类/估值提供方条款；依赖行业模块许可表） | 依 `status='public'` | 只在数据集 `public` 时 served，否则 `withheld:unlicensed` | 无新增 |
| 外资研报 PDF（`broker_report_meta`） | 各投行；逐文件许可（外资研报规格 §4.1） | 无统一条款；"broker's proprietary"默认排除 | 仅元数据，且仅在其开关打开后 | 合并前 `unsupported`；合并后只引用其公开视图 | 外资研报 D1 |
| owner 提供的许可来源（`licensed_excerpt`） | 逐来源，登记时须填 `terms_url` 与条款 | 今天无已登记来源 | 依登记 | 无登记 → 类型 `not_served` | D2 引文上限；每个来源的逐项批准 |
| LLM 提供方（摘要生成） | owner 配置的提供方（`resolveUserLlm`） | 未能读取（2026-11-16，提供方取决于 owner 配置，本稿未逐一读取输出使用条款） | — | 模型输出不含数字与第三方文本，只含我们的证据事实句之外的假设句 | D11：确认所用提供方条款允许将输出展示给全站用户 |
| ChaosAI（对方站点） | — | 不是来源，未抓取 | 无 | 功能参考 | 无 |

---

## 11. Copilot 引用

- 工具名：`topic_dossier`（将来加到 `src/lib/agent/tools.ts`；本规格不实现）。
- 输入：`{slug: string, version?: number, asOf?: 'YYYY-MM-DD', locale: 'zh'|'en', sections?: string[]}`。
- 输出：只含公开受众、已发布版本的服务态数据：每条证据的 `EvidenceRef`、`as_of`、`state`、模板事实句（`ok` 时）、漂移状态、版本号与发布时间；摘要的已渲染文本及其引用。`withheld/missing/not_served/unsupported/retracted` 只给状态与原因码，不给值。
- 规则：Copilot 必须逐字使用工具返回的数字并附引用（ordinal + 版本）；工具说缺失/受限时，Copilot 必须说"缺失/受限"，不得用常识或其他工具补数；工具输出永不包含 owner 草稿、私有论点内容、许可引文以外的第三方文本、PDF 文本、管理员投影。
- 开关：`TOPICS_ENABLED` 与 `topic_settings.public_enabled` 同时为真才注册该工具。

---

## 12. 依赖接口

| 依赖 | 需要什么 | 状态 |
|---|---|---|
| 宏观 P1/P2 | 观测按 `observation_id` 读取、按 `(series_id, period_end)` 列版本、目录状态、新鲜度 | 存在（`src/lib/macro/db.ts`、`read-api.ts`；具体方法名在计划中核对） |
| 宏观 P3/P4 | §8.2 所列函数的重构（抽骨架、泛化校验器与模板注册表），宏观行为不变 | 存在；重构是本规格的任务，需宏观模块 owner 会话知情（commander 协调） |
| `docs/methodologies/licenses.json` | 已确认序列集合 | 存在 |
| 行业研究 | 单元格按复合键读取、运行状态、数据集许可、`replayView` 身份 | 存在；生产无数据 |
| 公司 / 规格二 | `evidence-gate.ts` 的公开判定可按 fact_id 批量调用；当前披露身份查询（漂移） | 存在；批量入口是否已暴露待计划核对（`company_fact_evidence` 按 fact 查找迁移 `20261123110000` 已在） |
| F3 | `citationById`、文档 `permission` | 存在 |
| F4 | `judgments` 读取、`toCard`、方法 `publishable` | 存在 |
| 外资研报 | `broker_report_publications` 公开视图、`public_enabled` | 未合并 |
| DQ | `dq_freshness`、`dq_quarantine`（`topics.replay` 数据集键） | 存在；新增数据集键 |
| 计量 | 新特性值 `topic_summary` | 待建（§4.10） |
| i18n / 设计 | `MESSAGE_DOMAINS` 增 `topics`；tokens | 存在 |
| Claude Design 画布 | §17 | 待建 |

---

## 13. 错误处理、测试策略与验收测试

### 13.1 错误码

`topics_disabled`(404)、`not_found`(404)、`no_version_at_asof`(404)、`topic_retired`(410)、`version_unpublished`(410)、`invalid_parameter:<n>`(400)、`slug_taken`(409)、`revision_conflict`(409)、`publish_blocked:<codes>`(409)、`resolver_degraded`(409)、`licence_confirmation_missing`(409，打开公开开关时)、`quota_exceeded`(429)、`code_version_unavailable`(503)；摘要的成本错误沿用宏观 `costErrorCode/costErrorStatus`。所有错误 `no-store`。

### 13.2 测试

- 单元（vitest）：契约规范化与哈希；每个解析器的状态映射表（§4.1）逐行；校验器（继承宏观正反例 + 荐股词 + `multi_sentence`）；模板注册表完整性；披露检查 10 项各一正一反；组装幂等；`asOf` 版本选择（边界：发布当日、取消发布当日）。
- 数据库（`test:db`，进 `criticalSuites`）：不可变触发器；发布函数阻断；`authenticated` 读不到草稿/审计/运行表；anon 读不到任何专题视图；开关关闭 0 行；`research_*` 无写入（触发器计数夹具）；`topic_settings.summary_public_enabled=false` 时带摘要的发布被拒。
- 静态扫描：`src/lib/topics/**` 对 `research_` 表的访问只有晋升处一处 select；荐股词只在校验器文件出现；UI 文案无"买入/卖出/推荐"。
- e2e（Playwright `e2e/topics.spec.ts`）：目录 → 档案 → 抽屉 → 回放；管理员创建 → 检查 → 预览 → 发布 → 取消发布；zh/en 切换（`NEXT_LOCALE` cookie）；移动端视口。

### 13.3 验收（逐条可检查）

- A1 `TOPICS_ENABLED` 未设：`/intel/topics`、`/api/topics` 均 404；`tools.ts` 不含 `topic_dossier`。
- A2 开关开、`public_enabled=false`：普通用户 `GET /api/topics` → 404；管理员预览可见并带"未对外"横幅。
- A3 已发布版本的 `evidence.length` 等于草稿证据数；每个输入 ref 都出现在响应中，状态非空。
- A4 v1 发布后注入同序列同期 version 2：v1 数值不变，漂移 `revised`，抽屉显示新旧两值。
- A5 `?asOf=<v1 发布前一天>` → 404 `no_version_at_asof`；`?asOf=<v2 发布日>` → v2；v2 取消发布后，不带 `asOf` 的读取回到 v1，`?asOf=<v2 发布日或之后>` → 410 `version_unpublished`（不返回 v2 内容，也不静默改答 v1），`?asOf=<v1 发布日>` → v1。
- A5b 某证据漂移为 `now_withheld` 或 `retracted` 后：当前读取、`/versions/[n]`、`?asOf=`、证据抽屉四条路径的响应 JSON 均不含该证据的 `value_text` 与片段文本；`snapshot_hash` 不变；引用它的摘要句被替换/隐藏。
- A6 CN `financial_fact` ref：公开响应 JSON 字符串中不含该事实 `value_text`；状态 `withheld`，原因 `citation_pending` 或 `evidence_incomplete`。
- A7 回放核验：夹具版本全部 `matched`；人为改动解析器格式化后核验报告 `mismatched` 并写 `dq_quarantine`。
- A8 HK 证券发行人 → `not_served`；`broker_report_meta` ref → `unsupported` 且发布 409 `publish_blocked:kind_unsupported`。
- A9 已批准摘要中每个渲染句都有非空 `refs`；模型文本含"3""三个月""两倍""buy""推荐""衰退" → `rejected`，码分别为 `numeral/numeral/numeral/forbidden_term(advice)/forbidden_term(advice)/regime_term`。
- A10 宏观既有测试（`explain-validate.test.ts`、`explain-render.test.ts`、`explain-request.test.ts`、`strategy.integration.test.ts`）在重构后不改断言全部通过。
- A11 晋升：草稿只含论点 `title/body`；`stripped` 列出字段名与计数；未编辑的晋升块使发布 409 `unreviewed_private_block`。
- A12 晋升全流程前后，`research_theses`、`research_thesis_events`、`research_memos`、`research_source_documents` 行数与最大 `updated_at` 不变。
- A13 草稿文字含 owner 的某个 `research_source_documents.id` → 披露检查 `private_reference`。
- A14 `topic_versions` 任意列 update（除一次性取消发布列）被拒；`topic_version_evidence` update/delete 被拒。
- A15 漂移 cron 失败一次：页面仍显示上次 `checked_at`；72 小时无成功 → `stale` 徽章。
- A16 许可来源 `revoked`：引用它的引文在当前读取中遮蔽为 `withheld:licence_revoked`，快照哈希不变。
- A17 每个图表有表格视图切换；i18n 对等测试覆盖 `topics`。
- A18 slug 退役后 `POST /api/admin/topics` 用同 slug → 409 `slug_taken`。

---

## 14. 分期与任务粗估

任务粒度同 `docs/superpowers/plans/` 现有计划（一个任务 = 一个可独立测试与提交的单元）。

| 阶段 | 内容 | 任务数 |
|---|---|---|
| T0 底座 | 迁移两份 + 类型；`evidence-ref/1` 契约、哈希迁移、分派；五个解析器（宏观、行业、事实、F3、F4）+ 契约测试；`broker_report_meta` 占位；组装与快照；发布/取消/退役函数与路由；公开读接口与 `asOf`；漂移 cron；回放核验；目录页、档案页、抽屉；管理编辑器与证据选择器；披露检查（不含晋升项）；i18n；e2e | 20 |
| T1 摘要 | 校验器泛化（宏观回归）；模板注册表泛化 + `topic.*` 模板；请求骨架抽取（宏观回归）；专题摘要存储 RPC；提示词；生成/批准路由与 UI；用量特性迁移 | 7 |
| T2 晋升与条目 | 晋升路由与记录；私有指纹检查；未审阅块规则；论点页入口；许可登记表与 UI；`licensed_excerpt` 渲染与遮蔽 | 5 |
| T3 依赖就绪 | `broker_report_meta` 解析器（外资研报合并后）；行业数据发布后的端到端验收 | 2 |
| T4 Copilot | `topic_dossier` 工具 | 1 |

合计约 35 个任务。T0 开工条件：§15 默认值接受；画布 §17 的 T0 屏完成。

---

## 15. Owner 决策

| # | 决策 | 默认 | 默认的后果 |
|---|---|---|---|
| D1 | 目录对谁开放 | 所有登录用户（同 `/intel/*`）；先 `public_enabled=false` 只管理员预览，owner 手动打开 | 上线初期只有 owner 能看到 |
| D2 | 第三方引文上限 | 每段 ≤ 120 汉字或 ≤ 60 英文词，每条目 ≤ 3 段，必须署名并链接 | 引文较短；超出者披露检查阻断 |
| D3 | 摘要计量特性 | 新增 `topic_summary` 特性值（迁移改四处枚举） | 计量清晰；多一个触及计费函数的迁移任务。备选：复用 `perspectives` 并在运行行标注主体，省迁移但计量混杂 |
| D4 | owner 文字是否允许裸数字 | 不允许；数字/日期只经证据插槽 | 写作略受约束；保证"每个数字可回放" |
| D5 | 分类表 | `macro / industry / company / cross_market / method`，迁移内枚举 | 新分类需迁移 |
| D6 | slug 规则 | 创建后不可改、永不复用、无别名 | 改名只能改标题；链接永不失效或指错 |
| D7 | FRED"非商业"条款与本站收费形态 | 专题只展示 licenses.json 已确认序列，其余 withheld；不扩大宏观模块现有姿态 | 部分宏观序列在专题中受限；FRED 问题仍需 owner 正式结论 |
| D8 | 来源署名文案 | 每个抽屉与页脚显示 `attribution_key` 文案（FRED/SEC 等） | 页脚较长 |
| D9 | 版本陈旧阈值 `TOPIC_STALE_DAYS` | 90 天 | 90 天未更新的专题显示 `stale` 徽章 |
| D10 | 已发布版本可否含 `withheld` 证据 | 可以，以受限状态显示；> 50% 时警告不阻断 | CN 公司专题可发布但大部分数值不显示 |
| D11 | 摘要所用 LLM 提供方 | owner 当前配置（`resolveUserLlm`），需 owner 确认其条款允许展示给全站 | 未确认前摘要不对外：`summary_public_enabled=false`，带摘要的发布被数据库函数拒绝（§4.2） |
| D12 | 取消发布的版本对读者的可见程度 | 元数据 + 原因类别可见（410），内容不可见 | 读者知道版本被撤，看不到被撤内容 |
| D13 | 访谈/专家笔记 | 只 `owner_note`；`licensed_excerpt` 在 owner 登记具体来源前不提供 | 无访谈入口 |

---

## 16. 开放问题

- Q1 `industry_metrics` 对运行 `on delete cascade`：行业模块是否会删除运行？快照保证已发布数字不变，但漂移检查会把被删运行的单元格判为 `unverifiable`；需行业模块确认保留策略。
- Q2 公司证据闸门的批量入口（按 fact_id 列表判可公开）是否已作为库函数暴露，或需从路由层抽出——计划第一步核对。
- Q3 是否也允许从 `research_memos` 晋升（v1 只有论点）。
- Q4 宏观 P4 重构（§8.2）与宏观模块其他在研分支的冲突窗口：由 commander 排期。
- Q5 是否需要"彻底清除"已发布版本（法律要求时）；v1 只有取消发布，快照保留。
- Q6 外资研报合并后 `broker_report_meta` 的 id 是 `publication_id` 还是 `(report_id, revision)`；本稿假设前者（其 §4.8 发布快照不可变）。
- Q7 生产状态（行业表为空、`company.events` 报错）来自 commander 与 2026-11-16 差距审计，本稿未能在本工作树复核。
- Q8 起草依据：`docs/audits/2026-11-16-topic-research/00-drafting-brief.md`（含 owner 2026-11-16 范围变更说明）。brief §3 把 `src/lib/macro/explain.ts` 列为验证解读机制的一部分；核对后它是相关分析的规则化单句，不属于 LLM 机制（§2），本规格按核对结果处理。

---

## 17. Claude Design 画布待设计清单

1. 目录页：桌面 / 移动；分类筛选；卡片的证据状态条与漂移、`stale` 徽章；空目录（普通 / 管理员）；"未对外 · 预览"横幅；错误态。
2. 档案页：版本条（当前 / 被取代 / 已取消发布 / 回放视图）；摘要面板（事实句栏 + 假设栏 + 引用角标）；分节证据行的六种状态 + 重建口径标记 + 五种漂移标记 + 读时遮蔽态；预期证据槽（缺失原因）；同序列折线图与表格视图切换；条目区（编者笔记 / 许可引文 / 引文遮蔽态）；页脚受限市场说明与署名。
3. 来源抽屉：六种 kind 各一；`withheld`、`retracted`、`revised`（新旧两值）变体；移动端全屏。
4. 管理列表与编辑器三栏；证据选择器（六种 kind 的查询表单与双投影预览）；插槽插入器与实时词法提示；"未带入的私有内容"侧栏。
5. 流程条：披露检查结果（10 项）；摘要生成结果（接受 / 被拒原因码与命中片段）；预览（公开投影 vs 管理员投影差异）；发布确认对话框；取消发布与退役对话框。
6. 版本管理页：版本链、漂移详情、回放核验结果（含 mismatched 红色态）。
7. 许可登记页（来源、条款 URL、条款摘录、权限勾选、状态）。
8. 私有论点页上的入口按钮（仅视觉位置）。
9. `/intel` 首页的专题入口卡片。
