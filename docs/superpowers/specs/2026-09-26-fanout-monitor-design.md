# fan-out 监控与三后端并行设计（WP-A6） / Fan-out monitor design

日期：2026-09-26。来源：《实施总纲 2026-09-22》§6.1–6.3、§7.1、§10.1、§8.2 WP-A6。分支叠在 WP-A3（台账）之上并合入 WP-A2（实体键）。用户已确认：新建 `src/lib/research/fanout/` 模块，不改旧 `monitor.ts`；Q5 定义保留但无 `cluster_id` 时不问；用户持有 TypeSafe key 并自行放入 Alpha `.env.local`（`TYPESAFE_API_KEY`），缺 key 时 jev 后端自动禁用。设计已批准。

## 目标 / Goal

每条新 Source × 全部 ACTIVE/WATCH/AT_RISK thesis，三个后端（`rule`、`llm_deepseek`、`jev`）并行回答问题集 v1.0 的 Q1–Q4（有簇时加 Q5），每个回答作为一条判断写入 `research_judgments`；实现弃权带、`jev_escalated`、每日预算硬停；**第一期不产生 thesis_event、不改任何 thesis 状态**；私有 Source 零外发；提供 §10.1 ①类冻结集报告。

## 非目标 / Non-goals

- 不做实体对齐 EA、Wiki lint WL、去重聚簇（A5）、变化卡（A8）、校准拟合（§6.3，需标签）。
- 不改旧 `monitor.ts`/`monitorThesis` 与其 pending thesis_event 路径（A9 再统一）。
- 不接触生产库。台账写入走 S4 `transaction()`，其连接池只接受本机数据库；生产启用需另行决定放开该守卫。

## 契约 / Contracts

### 问题集 v1.0（`questions.ts`）
`QUESTION_SET_VERSION = 'v1.0'`。选项键用英文稳定标识，中文题干仅进 prompt：

| id | 类型 | 选项键 | 弃权/阈值 |
|---|---|---|---|
| Q1 | noul | `true`/`false` | P(true) <0.4 无关；0.4–0.6 弃权；>0.6 相关 |
| Q2 | choice | `support` / `weaken` / `trigger_invalidation` / `related_insufficient` | confidence <0.6 弃权；`trigger_invalidation` 一律标 `needs_human`（仅审计，不改状态） |
| Q3 | choice（材料级） | `filing_or_regulator` / `executive_statement` / `third_party_data` / `analyst_or_media` / `retelling` / `unknown` | confidence <0.5 → selected `unknown` |
| Q4 | choice | `completed` / `planned` / `denied` / `conditional` / `not_applicable` | confidence <0.5 → `not_applicable` |
| Q5 | noul | `true`/`false` | 仅当 Source 有 `cluster_id` 且不是 `cluster_first`；P(true) <0.5 → 标转述 |

Q1 只对 Q1 结果 >0.6 的 thesis 继续问 Q2/Q4（rule 与 deepseek 后端）；jev 一次请求把所有 thesis 的 Q1/Q2/Q4 与一次 Q3 塞进同一 `questions` 映射（无 batch API，fan-out 即批处理），Q2/Q4 在 Q1 ≤0.6 时仍写台账但 `abstained=true`。

### 后端接口（`backends/types.ts`）
```ts
interface FanoutInput { source: SourceDocument; theses: Thesis[]; aliases: Map<string /*thesis_id*/, string[]>; askQ5: boolean }
interface BackendAnswer { thesis_id: string; question_id: 'Q1'|'Q2'|'Q3'|'Q4'|'Q5'; distribution: Record<string, number>; selected: string|null; confidence: number|null; abstained: boolean }
interface BackendResult { backend: JudgmentBackend; backend_model: string; prompt_sha256: string|null; input_token_count: number|null; latency_ms: number; cost_micros: number; answers: BackendAnswer[]; skipped?: 'disabled'|'private_source'|'error'; error?: string }
type FanoutBackend = (input: FanoutInput) => Promise<BackendResult>
```
Q3 为材料级：每个后端对一条 Source 只算一次，但按 thesis 逐条写台账（同一分布复制到每个 thesis 对），token/成本只记在该 Source 的第一条判断上，其余为 0；报告按 `(source_id, backend)` 去重统计 Q3。

### 三后端
- **rule**（`backends/rule.ts`，`backend_model = 'rules-v1'`，纯函数）：Q1 = thesis 公司别名（A2 `names_zh/names_en/aliases` + `research_entities.name/aliases`）或失效条件/观察指标的关键词（≥2 字 CJK 片段、≥4 字母英文词）命中数 → P(true)=min(0.95, 0.35+0.15·hits)，无命中 0.05；Q2 = 支持词表 / 削弱词表 / 失效条件原文（≥6 字）命中 → 分布，均无 → `related_insufficient`；Q3 = 来源域名与 `source_type`（FILING、sec.gov、cninfo、hkexnews、sse、szse → `filing_or_regulator`；GITHUB_RADAR/NEWS 媒体域名 → `analyst_or_media`；NOTE/MANUAL → `retelling`；其余 `unknown`）；Q4 = 完成/计划/否认/有条件词表。confidence = 最大概率与次大概率之差归一化。
- **llm_deepseek**（`backends/deepseek.ts`）：复用 `LlmFn`（脚本入口用 `trustedPlatformLlm`，浏览器入口用 `defaultLlm`），一条 Source 一次调用覆盖全部 thesis：prompt 给材料正文（≤12k 字符）与每条 thesis 的支柱/失效条件，要求输出 `{"Q3": {...}, "theses": {"<thesis_id>": {"Q1": {...}, "Q2": {...}, "Q4": {...}}}}` 的概率分布；校验：选项键完全匹配、概率 ∈[0,1]、和在 0.98–1.02 之间；坏输出 → 该问题 `abstained=true, distribution={}, selected=null`。`backend_model` 取解析器返回的模型名；`prompt_sha256` 记录。
- **jev**（`backends/jev.ts`）：`POST https://api.typesafe.ai/v1/systemone`，`Authorization: Bearer $TYPESAFE_API_KEY`，`model: 'jev-1.13.0'`（常量，不用 `jev-latest`），`state = {material, theses:[{id,title,pillars,invalidation_conditions}]}`，`questions` 键为 `t<i>_Q1|Q2|Q4` 与 `Q3`（Q5 仅 askQ5）。响应 `answers[k].noul`（Noul 无 confidence → confidence null，弃权带 0.4–0.6）、`answers[k].choice/probabilities/confidence`、`model`、`usage.input_tokens`。缺 key → `skipped:'disabled'`；`fetch` 可注入（测试用录制夹具）；HTTP 非 2xx 或 JSON 不合契约 → `skipped:'error'`（写审计，不写判断）。
- **外发规则**：`permission !== 'public'` 或 `origin_type === 'private_observation'` 的 Source **不进入 jev，也不进入 llm_deepseek**（第一期保守：两者都是外部模型），只跑 rule；测试断言两者的调用函数零调用。
- **jev_escalated**：jev 的 Q2 弃权且 Q1 >0.8 → 用同一 `LlmFn` 生成一句中文说明，写一条 `backend='jev_escalated'`、`question_id='Q2'`、`selected=null`、`abstained=true`、`distribution={"explanation": "<一句>"}`、`backend_model=<deepseek 模型>` 的判断；不改状态。

### 快照与写入（`run.ts`）
- 候选 Source：`ingested_at ≥ since`（默认 7 天）且 `legacySourceVisible`；thesis：`listThesesByStatus(['ACTIVE','WATCH','AT_RISK'])`。
- snapshot：`source_id`、`source_version`（Source 行）、`thesis_id`、`thesis_version = sha256(canonical{title, body, invalidation_conditions, watch_metrics, updated_at})`、`entity_table_version = entityTableVersion(ctx)`（每次运行取一次）。
- 每个后端每个回答 → `recordJudgment(actor, {...})`，`run_id` 为本次运行 uuid；同内容重复运行得 `duplicate:true`（幂等，计数报告）。
- 一次运行的 `RunSummary`：`{run_id, sources, theses, judgments:{written,duplicate}, per_backend:{rule,llm_deepseek,jev,jev_escalated}:{answers,skipped,errors,cost_micros}, private_sources_skipped_external, budget:{spent_micros,limit_micros,stopped:boolean}}`。
- **不写** `research_thesis_events`，**不调用** `transitionThesis`；测试断言两表/函数零变化。

### 预算（`budget.ts`）
`FANOUT_DAILY_BUDGET_MICROS`（默认 5,000,000 = $5）。运行前与每条 Source 前，查 `research_judgments` 当日（UTC）`sum(cost_micros)`（含本次已写）；≥ 上限 → 停止外部后端（rule 继续），写审计 `fanout.budget_stop`，`RunSummary.budget.stopped=true`。单价：`FANOUT_JEV_MICROS_PER_1K_TOKENS`（默认 45，来自 §6.2 成本示例）、`FANOUT_DEEPSEEK_MICROS_PER_1K_TOKENS`（默认 280）；deepseek 用量来自 `chatResolved` 的 usage（缺失时按 `字符数/2` 估算并在 `distribution` 外的审计里标 `estimated`）。

### 报告（`report.ts`，`scripts/fanout-report.ts`）
读 `research_judgments` 左联 `research_labels`（同 judgment_id，取最新标签）：每 `backend × question_id`：`n`、`labeled`、`accuracy`（selected == label，排除弃权）、`abstain_rate`、`ece`（10 等宽桶，Choice 用 confidence，Noul 用 P(true) 对 label==='true'）、`p50_latency_ms`、`p95_latency_ms`、`cost_micros_per_1k`。Q3 按 `(source_id, backend)` 去重。无标签时 `accuracy/ece = null`，其余照常。输出 JSON + Markdown 表。

## 测试 / Tests
- `questions.test.ts`：选项键、阈值、弃权判定函数（`decide(question, distribution, confidence)`）。
- `rule.test.ts`：别名命中、失效条件命中、域名分类、词表分类、无命中弃权；确定性。
- `deepseek.test.ts`：合法 JSON → 分布；坏键/和≠1/非 JSON → 弃权；prompt 含 thesis id 与截断标记；`prompt_sha256` 稳定。
- `jev.test.ts`：无 key → disabled 且 fetch 零调用；请求体（URL、Bearer、`model:'jev-1.13.0'`、questions 键）；夹具响应 → 答案映射（Noul 弃权带、Choice 阈值、Q3 一次）；500/坏 JSON → error 且不抛。
- `budget.test.ts`：纯函数 `budgetState(spent, limit)`；成本换算。
- `run.integration.test.ts`（`S4_TEST_STATE`）：注入三个假后端；公开 Source × 2 thesis → 每后端每问一条判断（Q3 复制到每 thesis）；私有 Source → 仅 rule 写入、外部后端零调用；重复运行 → 全部 `duplicate`；`research_thesis_events` 行数不变；预算：预置当日 `cost_micros` 达上限 → 外部后端跳过、审计 `fanout.budget_stop`；`jev_escalated` 触发条件。
- `report.test.ts`：纯函数 `summarize(rows)` 对构造数据的准确率/弃权率/ECE/分位数/去重。

## 验收 / Acceptance
`S4_TEST_STATE=<本地库> npm test`、`npm run typecheck`、`npm run lint`、`npm run build`；Codex CLI（中等）评审无 P1；私有 Source 零外发测试与预算硬停测试通过；若用户已放入 `TYPESAFE_API_KEY`，用一条公开 NEWS Source 与一条本地 thesis 跑一次 smoke（本地库），记录 `model` 与 usage 到 `docs/handoffs/alpha-a6/smoke-<date>.json`（不含密钥）。
