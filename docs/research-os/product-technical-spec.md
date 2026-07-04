# Osborn Alpha Research OS 产品技术文档

版本：v0.1  
日期：2026-07-04  
目标读者：Fable 5 开发团队、产品负责人、后续接手的 agent / engineer  
产品性质：金融/TMT 研究辅助系统，不是自动交易系统，不提供个性化投资建议  

## 1. 产品定义

Osborn Alpha Research OS 是一个面向 AI/TMT 研究的长期研究脑和决策治理系统。它整合以下 9 个 idea：

- Idea 1：投资研究 Agent Brain
- Idea 2：人机共审交易 Playbook Runner
- Idea 3：TMT Chokepoint Atlas
- Idea 4：OpenRouter / 模型用量金融信号仪表盘
- Idea 8：AI 投资 Memo 自动生成器
- Idea 10：投资 Thesis 失效条件监控器
- Idea 12：Agent Backtest Eval Harness
- Idea 14：AI 产品公司早期信号雷达
- Idea 40：Investment Decision Axioms

系统目标不是预测股票涨跌，而是把 TMT 研究流程产品化：持续收集信息、形成公司长期记忆、识别早期产品和模型市场信号、生成可引用的投资 memo、监控 thesis 是否失效、通过人工审批管理高风险动作，并用历史案例评估 agent 的研究质量。

## 2. MVP 范围

第一版只做“研究辅助 + 人工决策治理”，不做自动下单、不接券商交易 API、不输出收益承诺。

MVP 覆盖 20 家 AI/TMT 公司或主题资产，例如：

- 模型公司与生态：OpenAI、Anthropic、Mistral、xAI、Meta AI、Google DeepMind
- 云与平台：Microsoft、Google、Amazon、Oracle、Cloudflare
- 芯片与算力：NVIDIA、AMD、Broadcom、TSMC、ASML
- AI 应用与工具：Adobe、Salesforce、ServiceNow、Palantir、Datadog

MVP 的 5 个核心结果：

1. 每家公司有可持续更新的研究档案。
2. 每天产生 AI/TMT 早期信号报告。
3. 可以生成结构化投资 memo。
4. 每条 thesis 都有失效条件和监控状态。
5. 每次 playbook 决策都经过人工确认并留痕。

## 3. 核心用户流程

### 3.1 每日研究流程

1. 系统定时抓取数据源：GitHub Radar、OpenRouter/模型用量、公司新闻、财报资料、产品发布、招聘和开发者信号。
2. Ingestion 服务将原始内容标准化成 source document。
3. Entity Extractor 抽取公司、产品、人物、模型、供应链节点、事件和关系。
4. Research Brain 更新公司档案、主题档案和知识图谱。
5. Signal Radar 生成每日 AI/TMT 早期信号。
6. 用户在 Dashboard 查看重点变化，并选择是否生成 memo 或更新 thesis。

### 3.2 投资 memo 生成流程

1. 用户选择公司或主题，例如 `NVIDIA AI inference margin pressure`。
2. 系统检索相关 source、历史 memo、thesis、axioms、产业链关系和最新信号。
3. Memo Engine 生成结构化 memo 草稿。
4. 系统自动标注引用、置信度、缺失信息和反方观点。
5. 用户编辑、接受或驳回 memo。
6. 接受后的 memo 进入研究档案，并可用于后续视频化或 playbook。

### 3.3 Thesis 监控流程

1. 用户创建 thesis，例如“某公司推理需求增长会抵消训练芯片周期波动”。
2. 用户必须填写支持证据、失效条件、观察指标、复盘日期和仓位/关注级别。
3. Thesis Monitor 每天扫描新数据，判断是否触发支持、削弱或失效信号。
4. 触发后生成 alert，用户必须标记：忽略、观察、更新 thesis、关闭 thesis。
5. 所有变更写入审计日志。

### 3.4 Playbook Runner 流程

1. 用户选择一个 memo 或 thesis，创建 playbook。
2. 系统检查是否满足 Investment Axioms。
3. 系统生成行动建议：继续研究、加入 watchlist、提高关注级别、降低关注级别、纸面交易、人工复盘。
4. 如果动作属于高风险类别，进入人工审批。
5. 审批结果、理由和后续复盘日期写入 playbook run。

## 4. 功能模块

### 4.1 Data Ingestion

负责接入、清洗和归档所有外部数据。第一版建议支持：

- GitHub Product Radar 本地 JSON / Markdown 报告
- OpenRouter 或其他模型用量数据 CSV / API / scraper 输出
- 手动上传的财报 PDF、电话会 transcript、公司公告
- 手动粘贴或导入的新闻 URL / Markdown
- 用户手写 notes、memo、thesis

要求：

- 每个 source 必须保存原始文本、来源 URL、抓取时间、发布者、发布时间、hash。
- 第三方返回数据必须 schema validation。
- Source 不允许被 LLM 直接改写覆盖，只能产生派生 artifact。

### 4.2 Research Brain

这是系统核心。它维护：

- 公司档案：业务、产品、客户、竞争者、财务摘要、关键事件。
- 主题档案：AI inference、模型 API、数据中心、电力、开发者工具等。
- 知识图谱：公司、人物、产品、模型、供应链节点、事件之间的关系。
- 历史记忆：过去 memo、thesis、判断、复盘和错误。

第一版可以采用关系数据库 + 向量索引的混合方式，不必过早追求复杂图数据库。关系边可以先存为 `entity_relations` 表。

### 4.3 Signal Radar

负责从每日数据里提炼可研究信号，而不是简单新闻摘要。信号类型包括：

- GitHub / 开发者生态信号：repo stars、forks、release、README 变化、工具采用。
- 模型市场信号：模型用量份额、provider 排名、token share 变化。
- 产品信号：新产品、新 API、价格变化、集成伙伴。
- 公司信号：招聘、财报、客户、管理层表述。
- 产业链信号：芯片、云、数据中心、电力、政策。

每条 signal 必须包含：标题、摘要、来源、涉及实体、影响方向、置信度、潜在受益/受损公司、需要验证的问题。

### 4.4 Memo Engine

负责生成结构化投资 memo。MVP memo 模板：

1. 一句话结论
2. 核心 thesis
3. 三条支持证据
4. 两条反方观点
5. 关键变量
6. 失效条件
7. 需要继续验证的问题
8. 相关公司/产业链影响
9. 引用来源
10. Axiom 检查结果

Memo 生成不能只输出漂亮文字，必须显示引用、缺失信息和不确定性。没有证据的结论要标记为 `LOW_CONFIDENCE`。

### 4.5 Thesis Monitor

负责管理 thesis 生命周期。

状态：

- `DRAFT`：草稿，未进入监控。
- `ACTIVE`：正在监控。
- `WATCH`：有弱信号，等待更多证据。
- `AT_RISK`：关键假设被削弱。
- `INVALIDATED`：触发失效条件。
- `CLOSED`：用户关闭。

每条 thesis 必须有：

- 支持证据
- 失效条件
- 观察指标
- 复盘日期
- 相关公司/主题
- 当前状态
- 最近一次系统判断

### 4.6 Playbook Runner

负责把 memo/thesis 转成可审计行动。MVP 不接真实交易，只支持：

- 加入 watchlist
- 创建纸面交易
- 创建复盘任务
- 更新 thesis
- 请求人工审批
- 生成风险提示

高风险动作必须通过 Approval Policy：

- 任何“买入/卖出/加仓/减仓”字样只能进入纸面交易或人工记录，不允许自动执行。
- 所有输出必须包含免责声明：研究辅助，不构成投资建议。

### 4.7 Investment Axioms

负责把投资原则变成机器可检查规则。示例：

- 没有失效条件的 thesis 不能进入 playbook。
- 引用少于 3 个独立来源的 memo 不能标记为 high confidence。
- 没有反方观点的 memo 不能进入审批。
- 只依赖单一社媒/新闻来源的 signal 必须降权。
- 无法解释仓位上限的交易建议必须被阻断。

MVP 用 YAML 或数据库规则表即可。

### 4.8 Agent Eval Harness

负责评估 agent 研究质量。第一版用 20 个历史案例，不做大规模 benchmark。

Eval 任务结构：

- 历史时间点
- 当时可见材料
- 要求输出 memo / thesis / risk list
- 真实后续事件
- 评分标准

评分维度：

- 事实正确性
- 引用质量
- 反方观点
- 风险识别
- 失效条件质量
- 是否过度自信

## 5. 建议技术架构

### 5.1 推荐技术栈

如果 Fable 5 从零开发，建议：

- Frontend：Next.js + TypeScript
- Backend：Next.js API Routes 或 FastAPI
- Database：PostgreSQL
- ORM：Prisma 或 SQLAlchemy
- Vector Search：pgvector
- Job Queue：BullMQ / Celery / Inngest 任选其一
- File Storage：本地文件系统优先，后续接 S3/R2
- Auth：单用户本地模式优先；多用户再接 Clerk/Auth.js
- LLM Provider：先抽象 provider interface，避免锁死单一模型

### 5.2 系统组件

```text
Frontend Dashboard
  -> API Layer
    -> Research Service
    -> Ingestion Service
    -> Signal Service
    -> Memo Service
    -> Thesis Service
    -> Playbook Service
    -> Axiom Service
    -> Eval Service
  -> PostgreSQL + pgvector
  -> File Storage
  -> Background Worker
  -> LLM Provider Adapter
```

### 5.3 后台任务

- `daily_ingest_github_radar`
- `daily_ingest_model_usage`
- `daily_signal_extraction`
- `daily_thesis_monitor`
- `weekly_research_digest`
- `manual_generate_memo`
- `manual_run_eval_case`

## 6. 数据模型草案

### 6.1 Entity

```ts
type EntityType =
  | "COMPANY"
  | "PERSON"
  | "PRODUCT"
  | "MODEL"
  | "REPOSITORY"
  | "SUPPLY_CHAIN_NODE"
  | "EVENT"
  | "THEME";

interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  description?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### 6.2 SourceDocument

```ts
interface SourceDocument {
  id: string;
  sourceType: "GITHUB_RADAR" | "MODEL_USAGE" | "EARNINGS_CALL" | "NEWS" | "FILING" | "NOTE" | "MANUAL";
  title: string;
  url?: string;
  author?: string;
  publishedAt?: string;
  ingestedAt: string;
  rawTextPath: string;
  contentHash: string;
  trustLevel: "LOW" | "MEDIUM" | "HIGH";
}
```

### 6.3 Signal

```ts
interface Signal {
  id: string;
  title: string;
  summary: string;
  signalType: "DEVELOPER" | "MODEL_USAGE" | "PRODUCT" | "COMPANY" | "SUPPLY_CHAIN" | "POLICY";
  direction: "POSITIVE" | "NEGATIVE" | "MIXED" | "UNKNOWN";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  entityIds: string[];
  sourceDocumentIds: string[];
  affectedCompanyIds: string[];
  researchQuestions: string[];
  createdAt: string;
}
```

### 6.4 Memo

```ts
interface InvestmentMemo {
  id: string;
  title: string;
  companyIds: string[];
  themeIds: string[];
  oneLineConclusion: string;
  thesis: string;
  supportingEvidence: EvidenceItem[];
  counterArguments: EvidenceItem[];
  keyVariables: string[];
  invalidationConditions: string[];
  openQuestions: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  axiomCheckResults: AxiomCheckResult[];
  status: "DRAFT" | "REVIEWED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}
```

### 6.5 Thesis

```ts
interface Thesis {
  id: string;
  title: string;
  body: string;
  companyIds: string[];
  themeIds: string[];
  supportingEvidenceIds: string[];
  invalidationConditions: string[];
  watchMetrics: string[];
  status: "DRAFT" | "ACTIVE" | "WATCH" | "AT_RISK" | "INVALIDATED" | "CLOSED";
  nextReviewAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### 6.6 PlaybookRun

```ts
interface PlaybookRun {
  id: string;
  memoId?: string;
  thesisId?: string;
  proposedAction: "WATCHLIST" | "PAPER_TRADE" | "RESEARCH_MORE" | "UPDATE_THESIS" | "CLOSE_THESIS";
  rationale: string;
  risks: string[];
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  humanDecision?: string;
  reviewAt?: string;
  createdAt: string;
}
```

## 7. API 草案

所有错误响应统一：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

### 7.1 Sources

- `GET /api/sources`
- `POST /api/sources`
- `GET /api/sources/:id`
- `POST /api/sources/:id/extract-entities`

### 7.2 Entities

- `GET /api/entities?type=COMPANY&q=nvidia`
- `GET /api/entities/:id`
- `GET /api/entities/:id/relations`

### 7.3 Signals

- `GET /api/signals?date=2026-07-04&type=MODEL_USAGE`
- `POST /api/signals/extract`
- `GET /api/signals/:id`

### 7.4 Memos

- `GET /api/memos`
- `POST /api/memos/generate`
- `GET /api/memos/:id`
- `PATCH /api/memos/:id`
- `POST /api/memos/:id/review`

### 7.5 Theses

- `GET /api/theses`
- `POST /api/theses`
- `GET /api/theses/:id`
- `PATCH /api/theses/:id`
- `POST /api/theses/:id/monitor`
- `POST /api/theses/:id/close`

### 7.6 Playbooks

- `POST /api/playbooks/run`
- `GET /api/playbooks/:id`
- `POST /api/playbooks/:id/approve`
- `POST /api/playbooks/:id/reject`

### 7.7 Axioms

- `GET /api/axioms`
- `POST /api/axioms`
- `POST /api/axioms/check`

### 7.8 Evals

- `GET /api/evals/cases`
- `POST /api/evals/cases`
- `POST /api/evals/cases/:id/run`
- `GET /api/evals/runs/:id`

## 8. 前端页面

### 8.1 Dashboard

展示今日信号、thesis 风险、待审批 playbook、最新 memo、数据摄取状态。

### 8.2 Company Page

展示公司档案、相关 source、signals、memos、theses、关系图、未解决问题。

### 8.3 Signal Radar

按日期和类型展示信号。每条信号可一键生成 memo、创建 thesis 或加入 watchlist。

### 8.4 Memo Workspace

支持生成、编辑、查看引用、查看反方观点、运行 axiom check、导出 Markdown/PDF。

### 8.5 Thesis Monitor

展示所有 thesis 的状态、失效条件、最新触发信号、下次复盘时间。

### 8.6 Playbook Review

展示待审批动作、系统理由、风险、axiom 检查结果和人工审批按钮。

### 8.7 Eval Lab

展示历史案例、agent 输出、评分结果、失败模式和改进建议。

## 9. 权限与安全边界

MVP 可以先做单用户，但代码应保留多用户扩展空间。

关键限制：

- 不接真实交易 API。
- 不自动发布投资建议。
- 不允许 agent 绕过人工审批。
- 所有 memo 和 playbook 输出必须带免责声明。
- 外部数据和 LLM 输出都视为不可信，需要结构校验。
- 原始 source 永不被 LLM 覆盖。
- 高风险动作必须有 audit log。

## 10. MVP 迭代计划

### Phase 1：本地研究系统骨架，1-2 周

- 数据库 schema
- source ingest
- entity 基础表
- company page
- 手动上传资料
- memo markdown 生成

验收：

- 可以导入 20 家公司基础资料。
- 可以为单家公司生成带引用的 memo 草稿。

### Phase 2：Signal Radar + Thesis Monitor，2-3 周

- GitHub Radar JSON 导入
- 模型用量数据导入
- signal extraction
- thesis 创建和状态管理
- daily monitor job

验收：

- 每天生成 signals。
- 至少 10 条 thesis 可被监控。
- 触发信号能关联到 thesis。

### Phase 3：Playbook + Axioms，1-2 周

- axiom rule table
- axiom check
- playbook run
- approval/reject
- audit log

验收：

- 没有失效条件的 thesis 不能进入 playbook。
- 所有高风险动作需要人工审批。

### Phase 4：Eval Harness，2 周

- eval case 创建
- agent run 保存
- rubric scoring
- eval report

验收：

- 20 个历史案例可运行。
- 每次 run 有评分和失败模式。

## 11. 验收标准

MVP 成功标准：

- 20 家 AI/TMT 公司研究档案可用。
- 10 条 thesis 进入监控。
- 10 份 memo 可生成、编辑、导出。
- 每日 signal report 可稳定生成 7 天。
- Playbook approval 全部有审计记录。
- 20 个 eval case 跑通。
- 用户能明确判断系统比手动 ChatGPT 问答更有长期记忆和纪律性。

## 12. 非目标

第一版明确不做：

- 自动交易
- 投资组合收益优化
- 实时行情交易系统
- 多用户团队协作
- 移动端 App
- 对外公开荐股社区
- 复杂图数据库迁移
- 完整财务建模系统

## 13. 给 Fable 5 的开发备注

请优先实现可运行、可验证的研究闭环，不要先做复杂 UI。第一版最重要的是数据结构、source 可追溯、memo 引用、thesis 失效条件、approval 审计和 eval 记录。UI 可以朴素，但数据模型不能草率。所有 LLM 输出都必须保存 prompt、model、输入 source ids、输出版本和人工修改记录，方便之后复盘和评估。
