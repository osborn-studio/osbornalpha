# Financial-Query-Search 深度分析报告

> **被分析项目**：https://github.com/Feature-promising/Financial-Query-Search
> **分析时间**：2026-05-16
> **对照项目**：Stock Monitor（本仓库）
> **分析人**：Claude Opus 4.7

---

## 0. 一句话结论（TL;DR）

**不能直接克隆（无 License、个人课程项目级）；但其 4 个架构模式值得借鉴**——LangGraph 编排、Evidence-Confidence 模型、LLM Planner 白名单校验、Verification Loops。建议「**学其架构思想，不取其代码**」，在我们 v2.0 用 TypeScript 重写关键模式。

---

## 1. 仓库元信息

| 项 | 值 | 说明 |
|---|----|------|
| **作者** | Shiwen Zuo `<zuoshiwen@mail.ecust.edu.cn>` | 华东理工大学（ECUST）邮箱 |
| **创建时间** | 2026-05-16 09:23 UTC | **今天** |
| **最后 push** | 2026-05-16 09:43 UTC | 刚发布，未维护 |
| **Stars / Forks / Issues** | 0 / 0 / 0 | 无社区关注 |
| **Commit 数** | 1（"Add files via upload"）| **bulk web 上传，非正规 git workflow** |
| **代码语言** | Python 100% | LangGraph + Streamlit 技术栈 |
| **代码量** | 30 个真实源文件，~120KB 净代码 | 主文件 1344 行 |
| **License** | **`null`（无 LICENSE 文件）** | ⚠️ 见 §6 法律分析 |
| **是否 fork** | 否 | 原创 |
| **私有性** | Public | 可访问、可 fork |
| **README 完整度** | 中等（架构 + 目录结构 + .env 提示） | 缺安装、运行、测试说明 |

**判断**：极可能是个人/课程项目，今天刚上传"晒一下"。

---

## 2. 技术架构剖析

### 2.1 整体形态

> **一个 LangGraph 状态机驱动的金融 Q&A 系统**，用户问中文金融问题，系统多源检索 → 证据校验 → LLM 生成回答。

```
                    ┌─────────────────────────────┐
                    │  Streamlit Chat UI          │
                    │  (chat_ui.py · session 侧栏) │
                    └─────────────┬───────────────┘
                                  │ asyncio
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                    LangGraph StateGraph                     │
   │                                                             │
   │  START                                                      │
   │    │                                                        │
   │    ▼                                                        │
   │  understand (理解：意图/日期/市场/实体/搜索词)               │
   │    │                                                        │
   │    ▼                                                        │
   │  plan_tools (LLM 决定调哪些 MCP 工具)                       │
   │    │                                                        │
   │    ├─→ execute_mcp_calls → search → merge_evidence         │
   │    └────────────────────→ search → merge_evidence          │
   │                                       │                     │
   │                                       ▼                     │
   │                                  verify_retrieval           │
   │                                  ┌────┴────┐                │
   │                                  ▼         ▼                │
   │                               充分        不够               │
   │                                  │         │                │
   │                                  ▼         ▼                │
   │                              answer  → rewrite_query        │
   │                                  │      (回到 plan_tools)    │
   │                                  ▼                          │
   │                              verify_answer                   │
   │                                  │                          │
   │                                  ▼                          │
   │                                END                          │
   └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                         SQLite chat_history.db
```

**核心抽象（4 层）**：

| 层 | 文件 | 职责 |
|---|------|------|
| **编排层** | `Tools_using.py` (1344 行) | StateGraph 节点定义 + 路由 |
| **能力层** | `search/`、`mcp/`、`rag/` | 各类数据获取能力封装 |
| **证据层** | `evidence/` | 统一不同来源的证据格式 + confidence 评分 |
| **规划层** | `llm_planner/` | LLM 决定工具调用 + 白名单校验 |

### 2.2 子系统深度评估

#### 🟢 search/ — 搜索服务（**质量高**）
- Tavily 主、Playwright/Bing 兜底
- 超时 + 指数退避 + jitter 重试（`service.py`）
- 多 provider fallback
- 完整 trace_id 日志
- **质量评分：8/10**——这是整个仓库最扎实的部分

#### 🟡 evidence/ — 证据合并（**抽象设计好**）
- 统一 `EvidenceItem` 模型：source_type, provider, content, url, confidence, metadata
- **confidence 按源分级**：
  - web_search → 0.60
  - web_page (提取过) → 0.80
  - filing → 0.90
  - financial_data → 0.95
- **质量评分：7/10**——抽象优雅但缺少冲突解决逻辑

#### 🟢 llm_planner/ — 工具规划护栏（**最有借鉴价值**）
- `guardrails.py` 的两件事很聪明：
  1. **工具白名单**：只允许 3 个 MCP 工具被 LLM 调用
  2. **关键词信号校验**：LLM 想调 `financial_data_mcp` → 用户 query 必须含「营收/利润/PE/revenue」等关键词；想调 `filing_reader_mcp` → 必须含「财报/年报/10-K」等
  3. 限制每轮最多 3 个工具调用
- `parser.py` 三层 fallback JSON 解析：直接 → fenced ``` ``` → 第一个 `{...}` 块
- **质量评分：9/10**——这是整个仓库最值得学习的地方

#### 🔴 mcp/ — MCP 工具系统（**全是占位**）
看每个 provider 实际代码：
```python
return {
    "success": True,
    "content": [],   # ← 永远是空
    "metadata": {
        "tool_name": tool_name,
        "status": "placeholder",
        "message": "filing_reader_mcp is wired but has no backend yet",  # ← 自己承认
    },
}
```
**4/4 MCP provider 全部都是 placeholder**。架子搭好了，没有任何真实数据接入。
- **质量评分：3/10**——只有抽象，没有实现

#### 🔴 rag/ — 向量 RAG（**整个被注释掉**）
- 在 `Tools_using.py` 里，import 和初始化都被 `#` 注释
- Qdrant + DashScope embedding 接口写了但没接通
- **质量评分：2/10**——存在但未启用

#### 🟡 chat_ui.py — Streamlit UI（**功能完整但产品形态弱**）
- 会话列表侧栏（创建/删除/切换）
- SQLite 持久化（chat_history.db）
- "查看来源"可展开
- Streaming 模拟（逐字符显示，`time.sleep(0.01)`）
- **质量评分：6/10**——能跑能用，但 Streamlit 不是面向终端用户的形态

---

## 3. 代码质量评估

| 维度 | 评分 | 说明 |
|-----|------|------|
| 架构清晰度 | 8/10 | 分层好，命名规范 |
| 错误处理 | 7/10 | search 层好，其他层弱 |
| 类型注解 | 7/10 | 用 TypedDict + dataclass，大部分有注解 |
| 文档/注释 | 5/10 | README 不错，code 注释少 |
| **测试覆盖** | **0/10** | **0 个测试文件** |
| **git 卫生** | **2/10** | __pycache__ commit 进去；单次 bulk upload；SQLite db 进库 |
| 依赖管理 | 5/10 | requirements.txt 无版本号，无 pyproject.toml |
| 可维护性 | 5/10 | 主文件 1344 行单文件略大；多处死代码（注释掉的 RAG） |

**典型 git 卫生问题示例**：
```
__pycache__/Tools_using.cpython-313.pyc.1835792923296
__pycache__/Tools_using.cpython-313.pyc.2004849240528
__pycache__/Tools_using.cpython-313.pyc.2026066897072
...（同一文件 6 个不同 pyc 都 commit 了）
```

---

## 4. 安全与隐私问题（⚠️ 重要）

### 4.1 暴露的隐私数据

**`chat_history.db` 被 commit 进库**，包含 4 条真实对话历史：

| Session | 用户问题 |
|--------|--------|
| 1 | 特斯拉最近财报信息 |
| 2 | 分享一下今天中国的财经信息 |
| ... | ... |

虽然不是高度敏感，但**作者本人或测试人员的问答记录已永久写入公开 git history**。

### 4.2 .env 状态

README 明确写：
> `.env  # API 密钥（已提交，注意安全）`

但当前 commit 中没找到 `.env`（可能作者最后一刻删了）。**git history 没有 .env 删除痕迹**（只有 1 个 commit），所以可能就是没传上去。但 README 文字暴露了「曾经打算 commit」的意图——**作者安全意识较弱**。

### 4.3 单次 bulk upload

唯一一个 commit 标题是 "Add files via upload"——这是 GitHub web UI 上传按钮的默认 commit 标题。说明作者**没有用本地 git**，也**没有 `git status` 检查过 staged 内容**。

---

## 5. 与 Stock Monitor（本仓库）对比

| 维度 | Financial-Query-Search | **Stock Monitor (本项目)** |
|-----|----------------------|-----------------------|
| **产品形态** | Q&A 对话（Streamlit）| IBKR 风格监控终端（Next.js + PWA） |
| **目标用户** | 想查金融问题的人 | 个人投资者每日 dashboard |
| **部署** | 本地 Python | Vercel 全球 CDN + Cron |
| **行情数据** | ❌ 无 | ✅ 东财（A/H/US）+ Tushare（A 股深度）|
| **K 线/财报/股东** | ❌ 无 | ✅ 全部接通 |
| **AI 形态** | 单 LLM 综合答 | **9 视角投资大师并发辩论** |
| **LLM 编排** | ✅ **LangGraph StateGraph**（强）| 简单 API routes |
| **Provider 抽象** | 单 Qwen3-Max | ✅ DeepSeek + Anthropic 多 provider |
| **证据 confidence** | ✅ 0.60-0.95 分级 | ⚠️ 无 |
| **工具 guardrails** | ✅ 白名单 + 关键词信号 | ⚠️ 无（待加） |
| **Verification loop** | ✅ retrieval → rewrite 重试 | ⚠️ 无（待加） |
| **每日定时推送** | ❌ 无 | ✅ Vercel Cron + Telegram |
| **多渠道交付** | 仅 Web | Web + Telegram（邮件待加）|
| **合规护栏** | ❌ 无 | ✅ 后处理替换敏感语 |
| **持久化** | SQLite 本地 | Supabase（PG + RLS）|
| **MCP 工具** | 架子在，4/4 占位 | 无（直接 HTTP 调数据源）|
| **RAG** | 注释掉 | 无（暂不需要）|
| **测试覆盖** | 0 | 0（共同问题）|
| **License** | ❌ 无 | ✅ MIT |
| **Git 卫生** | __pycache__/db 入库 | ✅ 干净 |
| **是否生产可用** | 否（多数 MCP 占位）| **✅ 是** |
| **代码行数** | ~2,000 行 Python | ~6,000 行 TypeScript |

**结论**：两个项目**形态不同、人群不同、成熟度差距大**。我们的 Stock Monitor 已经是「生产可用产品」，对方还是「架构 demo + 课程作业」。

---

## 6. 法律与合规：可不可以"克隆"？

### 6.1 License 状态

**仓库没有 LICENSE 文件 → 默认 "All Rights Reserved"**（依据 GitHub Docs §[Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)）：

> 没有 license 的公开仓库，作者保留所有版权。其他人**不能复制、分发、修改、衍生**，否则构成侵权。

GitHub Terms of Service §D.5 允许你：
- ✅ **查看**仓库内容
- ✅ **fork**到自己账号（这是 GitHub 平台特性的隐含许可）

但**不允许**：
- ❌ 把代码复制到自己的产品里
- ❌ 修改后分发
- ❌ 商业使用
- ❌ 申请专利

### 6.2 三种可能的 path

| 路径 | 合法性 | 建议 |
|-----|------|-----|
| 把代码搬到 Stock Monitor 里 | ❌ 侵权 | **不要做** |
| Fork + 自己用（不分发）| ⚠️ 灰色 | 仅作学习参考 |
| **学习架构思想，自己用 TS 重写** | ✅ 完全合法 | **推荐** |
| 联系作者请求 MIT 重新发布 | ✅ 如果作者同意 | 可以试 — 看 §8 |

### 6.3 思想 vs 表达

版权法（中美都一样）保护**表达**不保护**思想**：
- ✅ "LangGraph 用 StateGraph 编排 retrieval → verify → rewrite" 是**思想**，不受保护
- ✅ "evidence 按 source_type 分级 confidence 0.6-0.95" 是**思想**，不受保护
- ❌ 直接 copy 他的 `guardrails.py` 文件 — 是**表达**，受保护

---

## 7. 4 个值得借鉴的架构模式

这些都是「思想」层面的，可以放心地用 TypeScript 在 Stock Monitor 里重写。

### 模式 1：LangGraph 风格的 StateGraph 编排（适合 v2 Sentinel Alert）

**他做了什么**：把"理解 → 规划 → 执行 → 合并 → 验证 → 重试 → 答 → 验证"做成有状态图。

**我们怎么用**：
- 当前 brief composer 是命令式（hard-coded 步骤），不灵活
- 引入类似 LangGraph 的 TS 库（如 [langgraph-js](https://github.com/langchain-ai/langgraphjs)）做 Sentinel 智能 alert：
  ```
  detect_anomaly → fetch_context → ai_analysis → 
    if needs_more_data → fetch_more → loop
    else → compose_alert → send
  ```

**优先级**：中（v2.0 时做）

### 模式 2：Evidence-Confidence 模型 ⭐ 最值得抄

**他做了什么**：每个数据源有自己的 confidence prior：
```
web_search    → 0.60  (噪声大)
web_page      → 0.80  (经过 extract)
local_doc     → 0.70-动态
filing        → 0.90  (10-K 等权威)
financial_data → 0.95 (结构化数字)
```

**我们怎么用**：
- 给我们的 perspective cite 加 confidence
- 当 AI 委员会引用「东财 quote」(高 confidence) vs「微博热搜」(低 confidence) 时，简报里加视觉权重
- 实现路径：在 `src/lib/data/sources/*.ts` 的返回里加 `confidence: number` 字段

**优先级**：高（v0.7 加）

### 模式 3：LLM Planner 白名单 + 关键词信号 ⭐⭐ 最值得抄

**他做了什么**（`guardrails.py`）：
- LLM 想调 `financial_data_mcp` → 检查 user query 里有没有「PE/营收/利润」等关键词，没有就拒绝
- 限制每轮最多 3 个工具调用
- 工具名白名单

**我们怎么用**：
- 当前 `perspectives/[ticker]` 直接信任 LLM 返回的 JSON。如果未来加更多 LLM 工具调用（如「让 LLM 决定查 EDGAR 还是 Tushare」），**必须有这种 guardrails**
- 关键词信号校验 = 防止 LLM 滥调 API 浪费 token
- 直接复刻这个模式到 `src/lib/llm/guardrails.ts`

**优先级**：高（在引入更多 LLM 工具调用之前必加）

### 模式 4：Verification Loop（retrieval → 不够则改写）

**他做了什么**：
1. 取回搜索结果
2. 规则检查 + LLM 检查：「这些证据够回答问题吗」
3. 不够 → 改写 query → 回到 plan_tools 重试（最多 2 次）

**我们怎么用**：
- 当前 brief composer 直接拿 Tushare 数据。但有时 Tushare 缺 ROE（新上市公司），可以加 verification loop：
  ```
  fetch → 检查关键字段缺失 → 改 fallback 源 → 重试
  ```
- 也适用于 AI 视角：「9 视角全部 neutral」可能意味着 prompt 不够具体 → 让 LLM 重生成

**优先级**：中（v1.2 加）

---

## 8. 可选行动：联系作者获取 MIT 重新发布？

如果你**真的**想用对方代码：

发邮件给 zuoshiwen@mail.ecust.edu.cn：
```
Subject: Financial-Query-Search 项目 License 询问

Zuo 同学你好，

我在 GitHub 看到了你的 Financial-Query-Search 项目，对其中 LangGraph 编排
和 evidence merging 设计非常欣赏。

注意到仓库目前没有 LICENSE 文件。请问你介意添加一个 MIT 或 Apache-2.0 
license 吗？这样会方便我们和其他人在尊重你工作的前提下学习和使用。

如果不方便公开 license，我也愿意为局部代码的复用付费或合作。

期待你的回复。

OSBORN
```

**真实预期**：研究生学生项目，大概率会同意 MIT。但如果 1 周没回，就走「学思想不取代码」路线。

---

## 9. 我的最终建议

### ✅ 现在做
1. **不要克隆 / 不要 copy 代码** — License 问题硬伤
2. **学习这 4 个架构模式**（§7）— 全部用 TS 在 Stock Monitor 里独立实现
3. **保留这份分析报告** — 未来 v2.0 设计「Sentinel agentic mode」时回看

### 📋 写进 ROADMAP
| 版本 | 借鉴点 |
|------|--------|
| v0.7 | Evidence confidence 模型（模式 2）|
| v1.2 | Verification loop（模式 4）|
| v2.0 | LangGraph StateGraph + LLM Planner guardrails（模式 1+3）|

### ⚠️ 不要做的事
- 不要直接搬代码进 Stock Monitor 仓库
- 不要私下分发对方代码
- 不要用 Streamlit 替换我们的 Next.js（产品形态退化）
- 不要把 MCP 当主要扩展点（4/4 占位说明这个模式落地难）

### 🎯 战略判断
> **Stock Monitor 已经在产品维度大幅领先这个项目**：真数据、真部署、真推送、真用户能用。
> Financial-Query-Search 在**编排模式**上有 2-3 个聪明设计可以学。
> 用对方好的「**架构智慧**」补我们的短板，但**产品方向不动摇**——我们做监控终端，不做 Q&A 机器人。

---

## 附录 A：仓库快照

```
Financial_query_search/
├── requirements.txt              # 14 个 Python 包，无版本号
├── .vscode/                      # IDE 配置
└── LangGraph/
    ├── Tools_using.py            # 1344 行主编排
    ├── chat_ui.py                # Streamlit UI
    ├── chat_store.py             # SQLite 持久化
    ├── chat_history.db           # ⚠️ 4 条真实对话被 commit
    ├── search/                   # ✅ Tavily + Playwright 真实可用
    ├── evidence/                 # ✅ confidence 分级抽象好
    ├── mcp/                      # ⚠️ 4/4 provider 全占位
    ├── llm_planner/              # ✅ guardrails 值得借鉴
    └── rag/                      # ⚠️ 整个注释掉
```

## 附录 B：评分总表

| 维度 | 评分 |
|-----|-----|
| 产品成熟度 | 3/10（多数 MCP 占位）|
| 架构智慧 | 7/10（LangGraph + evidence + planner 都有亮点）|
| 代码质量 | 5/10（无测试 + git 卫生差）|
| License 友好度 | 1/10（无 LICENSE）|
| 安全意识 | 3/10（DB 入库 + README 自承 .env 提交过）|
| 文档 | 5/10 |
| 社区健康度 | 1/10（0 star/fork/issue/PR）|
| **综合可借鉴价值** | **6/10（思想可借鉴，代码不能搬）** |

---

**报告完。**
