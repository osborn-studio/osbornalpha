# company-diligence → Research OS 闭环 轻量 Spec

> 目标：个股页跑「🏢 公司调研」生成尽调简报后，一键存进研究脑(Research OS)，让简报成为可检索、可追溯、可复盘、可再生的研究记忆；并可按需升级为结构化 memo。
> 前置：company-diligence 方法已上线(无评级尽调简报，7 段 markdown + 收尾 JSON `{ticker,name,canonical_name,one_line,unverified[],disclaimer}`)；Research OS 在 stock-monitor 仓库内、admin 门控、Supabase `research_*` 表。

## 0. 核心判断(先定性，再定 schema)

**尽调简报 = 来源(source)，不是备忘录(memo)。**
- `research_memos` 的结构是决策论点：`thesis / supporting_evidence / counter_arguments / invalidation_conditions / confidence`——**有判断**。
- 尽调简报刻意**无判断**(brief ≠ recommendation)。硬塞进 memo 会留一堆空字段、且污染"memo=决策论点"的语义。
- 所以：**简报 → `research_source_documents`(一等公民来源)**；memo 是**后续可选**、由现有 memo 引擎从该来源生成的东西。这也正是用户说的"source/memo"两层——source 自动、memo 按需。

## 1. 来源归档(source archiving)

尽调简报存为**一条** `research_source_documents`，复用现有 `ingestSource(ctx, IngestSourceInput)`(自带 content_hash 去重、user_id RLS、不可变触发器)：

| 字段 | 值 |
|---|---|
| `source_type` | `'NOTE'`(复用，免迁移) + `metadata.kind='diligence'` 供过滤。*(备选：加 `'DILIGENCE'` 枚举，需改 DB check 约束迁移——本期不做，留注记)* |
| `title` | `尽调简报：<canonical_name>（<ticker>）` |
| `raw_text` | 完整 7 段 markdown 简报正文(原样，不可变) |
| `trust_level` | `'MEDIUM'`(工具+LLM 产出，非一手 HIGH) |
| `entity_ids` | 解析 ticker → `research_entities` 的 COMPANY 实体 id；**不存在则先创建**该实体(name=canonical_name, ticker, type=COMPANY)。复用 entities 服务 |
| `metadata` | `{ kind:'diligence', method:'company-diligence', ticker, canonical_name, one_line, unverified:[…], version:N, supersedes:<prev source id|null>, provenance:{model, generated_at}, tool_refs:[已调用的工具名] }` |

**待核实项归档**：收尾 JSON 的 `unverified[]` 原样进 `metadata.unverified` —— 研究脑因此明确知道这份简报"还差什么外部核实"，可驱动后续 signals/ic-memo。
**底层数据来源**：本期**不**把每个工具调用拆成独立 source 行(保持轻量)；工具引用名记在 `metadata.tool_refs`。将来若要细粒度溯源再拆。
**审计**：`audit('source.ingest_diligence', {ticker, version})`。

## 2. memo schema(升级路径，复用不新建)

**不发明新 memo schema。** 一条 diligence source 可**按需**升级为 `research_memo`：
- 走**现有** `/api/research/memos/generate`，把该 diligence source 作为输入材料(它已在 `research_source_documents` 里，memo 引擎本就消费 sources)。
- memo 引擎产出既有 `MemoDraft`(thesis/evidence/counter-args/invalidation/confidence + axiom 门 + provenance)——尽调简报成为 memo 的**支撑证据来源**，memo 在其上叠加"判断层"。
- 语义清爽：source=事实素材(无判断) → memo=在素材上作出的、过 axiom 门的决策论点。
- 本期**不建**自动 source→memo；只保证 diligence source 出现在 memo 生成的可选材料里(现有 UI 已支持选 source 生成 memo)。"一键升级为 memo"按钮列为 P2。

## 3. 版本追踪(version tracking)

- 重跑尽调 → **新增一条** source(不覆盖；sources 不可变触发器保证)。`metadata.version = 该 ticker+user 已有 diligence source 数 + 1`，`metadata.supersedes = 上一版 source id`。
- 研究脑默认展示**最新版**(按 `ingested_at desc` 取 `metadata.kind='diligence' AND metadata.ticker=X` 的首条)；历史版保留可查(版本链 via `supersedes`)。
- content_hash 去重：极端情况下两次简报正文逐字节相同(数据没变)→ 返回 `duplicate`，不新增版本。
- 不引入独立 version 表——版本信息全在 source 的 metadata + 天然的 ingested_at 排序。

## 4. 重新生成策略(regeneration)

- **用户触发(主)**：研究脑里该 ticker 的尽调卡片有「🔄 重新生成」→ 重跑 company-diligence → 存为新版。
- **过期提示(轻量)**：最新版 `ingested_at` 距今 > 30 天 → 卡片标「简报可能已过时，建议重新生成」。
- **信号驱动过期(P2，本期不做)**：该 ticker 自上次简报后有新 signals/新 thesis alert → 更强的重生成提示。列为未来增强，不进本期。

## 5. 接线与流程(实现面，供后续 plan)

1. **新 API** `POST /api/research/sources/from-diligence`(admin 门)：入参 `{ ticker, canonical_name, one_line, unverified[], markdown, provenance, tool_refs }`；解析/创建实体 → 计算 version/supersedes → `ingestSource` → 返回 `{ source_id, version, duplicate }`。
2. **CopilotClient**：company-diligence run 完成且拿到收尾 JSON summary 时，显示「📥 存入研究脑」按钮(仅此方法、仅 admin——非 admin 隐藏/403)。点击调上面的 API，成功后显示「已存入 · 第 N 版」+ 链到 `/research` 该来源。
3. **研究脑 Sources 页**：`metadata.kind='diligence'` 的来源加尽调徽章 + 版本号 + 过期提示 + 🔄 重新生成 + (P2)「升级为 memo」。

## 6. 访问与合规

- 该保存动作走 Research OS 现有 **admin 门控**(登录 + `profiles.role='admin'`)。非 admin 看得到尽调简报但没有「存入研究脑」入口。
- 简报免责声明随 markdown 一并归档；`metadata.unverified` 让"未核实"永久可见，符合数据可靠性优先原则。

## 7. 明确不做(YAGNI)

- 不建独立 diligence 表(复用 sources)；不加 `'DILIGENCE'` source_type 枚举(用 NOTE+metadata)；不建独立 version 表；不做自动 source→memo(只保证可选)；不做信号驱动的自动重生成；不拆工具级细粒度溯源。这些都可在真实使用反馈后再加。

---
**审阅点**：① 简报定性为 source 而非 memo，认可吗？② `NOTE`+metadata 复用 vs 新增 `DILIGENCE` 枚举，选哪个？③ 版本全放 metadata、不建 version 表，够用吗？④ 重生成先只做用户触发+30 天过期提示，信号驱动留 P2，可以吗？
