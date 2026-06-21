<!-- 12_AI_AND_LLM_ARCHITECTURE.md · osbornalpha LLM/AI 架构（DeepSeek + 投资委员会 + John Cameron PM Agent） · 最后更新 2026-06-20 -->

# 12 · AI 与 LLM 架构

> 本文档以仓库真实代码为准。所有文件路径相对仓库根 `stock-monitor/`。

## 12.1 总览

osbornalpha 的 AI 能力分三层：

1. **统一 LLM 门面（facade）** — `src/lib/data/sources/llm.ts`，对上层只暴露一个 `chat()` 函数，向下封装 DeepSeek 与 Anthropic 两个 provider，并统一做 token / cost 估算。
2. **AI 产出管线** — `src/lib/brief/*`（每日简报 composer、雷达 digest-takes）与 `src/lib/data/personas.ts`（投资委员会 9 人 persona），通过 `chat()` 调 LLM 产出结构化结果。
3. **PM Agent（Claude Code 侧）** — `.claude/agents/john-cameron.md`，基金经理 John Cameron 虚拟分身，编排 skills、遵守 doctrine 做决策。它运行在 Claude Code / Hermes 环境，与 Web App 共享同一套 `/api/*` 数据接口（详见文档 19、22）。

数据事实校验：LLM = **DeepSeek（主）+ Anthropic（备/可选）**；行情与财务数据 = **Tushare + Eastmoney/Sina/Tencent**（见文档 23）；Anthropic 作为分析 provider 备选，三项均与代码一致。

## 12.2 统一 LLM 门面 `llm.ts`

`getActiveProvider()` 决定调用哪个 provider：

- 若设置 `LLM_PROVIDER=deepseek|anthropic`，则强制 pin。
- 否则按解析顺序：`DEEPSEEK_API_KEY` → `ANTHROPIC_API_KEY` → `'none'`。即 **DeepSeek 优先**（成本最低），无 DeepSeek key 时回落 Anthropic。
- `isLLMConfigured()` = `getActiveProvider() !== 'none'`；无任何 key 时上层会走 `skipLLM` 降级路径（只出行情+信号，不出 AI 观点）。

统一返回 `UnifiedChatResp`，携带 `model`、`usage.{input_tokens,output_tokens}`、`est_cost_usd`、`provider`。Anthropic 分支默认模型 `claude-sonnet-4-6`。

### 成本模型（`PRICING`，单位 USD / Mtok）

| model | input | output |
|---|---|---|
| `deepseek-chat` | 0.27 | 1.10 |
| `deepseek-reasoner` | 0.55 | 2.19 |
| `claude-haiku-4-5` | 0.80 | 4 |
| `claude-sonnet-4-6` | 3 | 15 |
| `claude-opus-4-7` | 15 | 75 |

`estimateCost(model, usage)` = `input/1e6 * in + output/1e6 * out`，未知 model 回落 `deepseek-chat` 价目。每次响应都把估算结果四舍五入到 5 位写入 `est_cost_usd`，逐层累加（见 12.6）。

## 12.3 DeepSeek 客户端 `deepseek.ts`

- Endpoint：`https://api.deepseek.com/chat/completions`（OpenAI 兼容）
- Auth：`Bearer ${DEEPSEEK_API_KEY}`
- 模型：`getDeepSeekModel()` = `process.env.DEEPSEEK_MODEL || 'deepseek-chat'`；可选 `deepseek-reasoner`（R1，支持 CoT，更慢更贵）。
- `DeepSeekChatOpts`：`system`、`messages`、`max_tokens`、`temperature`、`timeoutMs`、`responseJson`（置 true 时请求 `response_format: json_object`，用于强制结构化输出）。
- 代码注释给出经济性参照：9-persona 一轮 ≈ $0.004（chat）/ $0.009（reasoner），约为 Sonnet 的 1/8–1/10。

## 12.4 Anthropic 客户端 `anthropic.ts`（分析 provider 备选）

- Endpoint：`https://api.anthropic.com/v1/messages`，header `x-api-key` + `anthropic-version: 2023-06-01`。
- 角色：作为 `chat()` 的备选 provider；可被 `LLM_PROVIDER=anthropic` pin 为主。委员会默认用 `claude-sonnet-4-6`；价目表另列 Haiku（轻量/情感）与 Opus（长文综合）以备分级使用。
- 关键工具 `extractJson(text)`：JSON 解析容错，依次尝试 ① 直接 `JSON.parse` ② 正则抓第一个 `{...}` 块 ③ 去掉 ```` ```json ```` 代码围栏后再 parse，全失败返回 `null`。这是所有 persona/take 输出的解析护栏。

## 12.5 投资委员会 Persona 系统 `personas.ts`

`PERSONAS[]` 定义 9 位投资人虚拟分身，`id` 为枚举：`buffett · munger · druckenmiller · marks · lynch · burry · zhang_kun · li_lu · duan_yongping`（与 DB 枚举 `persona_t` 完全一致）。

每个 `PersonaSpec` 含 `id / name / style / prompt`（中文 system prompt，写明核心信念、反模式、输出 schema）。例如 buffett：`style: '价值投资 / 护城河 / 长期持有'`，prompt 强调「买的是企业不是股票」「护城河是核心」。

- `buildUserMessage(ctx: StockContext)`：把日期、ticker、价格、change%、PE、PB、ROE、毛利率、净利率、股息率、财务摘要、事件拼成 user message，并要求严格 JSON 输出：
  `{"stance":"bullish"|"neutral"|"bearish","confidence":0-10,"summary":"≤120字","cites":["数据点1","数据点2"]}`
- 单 persona 调用参数：`max_tokens ≈ 400`、`temperature ≈ 0.7`、`responseJson=true`、超时 ~25s。
- 9 个 persona 在 `composer.ts` / `/api/perspectives` 中 **并行** 执行（`Promise.allSettled`），单个失败不影响整体（见 12.7）。
- 共识打分：`stance=bullish → +confidence`，`bearish → −confidence`，`neutral → 0`，求均值后平移到 0–10。

落库：`perspectives` 表（`persona/stance/confidence/summary/cites`，外键到 `briefs`）。

## 12.6 Brief / Radar 产出管线

### `composer.ts` — `generateDailyBrief(watchlist, opts)`

流程：① 富化 ticker（Eastmoney 行情 + Tushare 补充 A 股财务）→ ② `computeTriggers()` 算信号分 → ③ 按分取 topN → ④ **并行跑 9-persona 委员会** → ⑤ 模板组装 markdown + HTML → ⑥ 合规替换。

**Morning-Note 编辑准则（`MORNING_NOTE_DOCTRINE`，作为 system prompt）** 要点：

- 数据来源 hierarchy：优先 MCP / 已验证数据（Tushare、东方财富、FRED、EDGAR）；严禁把网络搜索当主数据源。
- 合规：严禁「建议买入/卖出/必涨/明天会涨」等措辞，替换为「信号偏多/偏空/中性」「注意力优先级」。

**合规替换 `COMPLIANCE_REPLACEMENTS`**（正则数组，后置兜底）：`建议买入→信号偏多`、`建议卖出→信号偏空`、`推荐买入→注意力优先级偏多`、`必涨→上行概率较高` 等 9 条。这是即便 LLM 越界也能把成文校正回合规话术的双保险。

**Top Call**：对 #1 优先级个股用 `MORNING_NOTE_DOCTRINE` 生成 1–2 句观点头条，输出 `{headline, rationale}` JSON（~$0.0004–0.001/次）。
**Trade Ideas**：从 perspectives 中筛 `confidence ≥ 7` 的高信念项，含 ticker/thesis/risk/conviction，仅在确有高信念时输出。

### `digest-takes.ts` — 雷达委员会一句话

- 由 `LLM_DIGEST_TAKE=on` **显式开启**（默认关闭，避免意外成本），仅对 🔴/🟡 级个股生成。
- system prompt 角色「osbornalpha 雷达系统的『投资委员会主席』」：输出 **一句** ≤40 字中文 take；严禁建议买卖话术、改用「信号偏多/偏空/中性/留意」；「增加判断，不增加事实」。
- 每条 take 带 `est_cost_usd`（~$0.00015：350 in + 50 out，DeepSeek chat），在 radar cron 中累加为 `total_llm_cost_usd`。

## 12.7 PM Agent 与 5 阶段决策管线

`.claude/agents/john-cameron.md`：`model: opus`，资深基金经理 John Cameron 虚拟分身，**Druckenmiller DNA**（全球宏观/流动性/顺势重仓/快速止损，12–18 月视野）+ 价值护城河（Buffett/张坤）+ 产业链卡脖子。能独立答题，也能编排 `hiphon-pm-pick / -deepdive / -track`、`stock-daily-radar`、`stock-bottleneck-picker`（详见文档 19、22）。

**5 阶段决策管线 Input→Filter→Model→Decision→Action** 落在 `skills/hiphon-pm/references/doctrine.md` §1–§5 与 `docs/designs/hedge-fund-ai*`：

1. **Input** — 宏观信号 + 风险状态输入（§1 择时）。
2. **Filter** — 宏观/流动性总闸三态（🟢/🟡/🔴）决定仓位上限（80–100% / 40–60% / 0–30%）。
3. **Model** — §2 四层漏斗 + §11 卡脖子方法（6–9 层产业链、四角色 executor/bottleneck/beneficiary/optionality、证据 ●/◐/○）+ 多因子打分。
4. **Decision** — §3 六级评级 strong_buy/buy/add/hold/trim/sell × 信念度。
5. **Action** — §4 策略（进场区间/止损/加仓节奏）+ §10 落 `~/.hiphon-pm/calls.jsonl` 调用日志。

> 注：仓库无独立 `decision-pipeline-design` 规格文件；管线定义内嵌于 doctrine §1–§5 与 hedge-fund-ai 设计文档（见 12.9 差异）。

## 12.8 成本/时延追踪与失败处理

**成本/时延**：每次 `chat()` 返回 `usage` + `est_cost_usd`；brief meta 汇总 `tokens.{input,output}` 与 `est_cost_usd`；perspectives API meta 含 `duration_ms / provider / model / personas_attempted / personas_succeeded / est_cost_usd / failures[]`；radar digest 汇总 `total_llm_cost_usd`。`briefs` 表落 `total_cost_usd` 与 `duration_s`。

**超时**：DeepSeek / Anthropic 默认 30s（AbortController）；persona 调用 ~25s；行情源 Tushare 8s、Eastmoney 5s。

**失败/降级**：
- 富化与 persona 均用 `Promise.allSettled`，单点失败不阻塞整轮。
- digest-takes 失败非致命，digest 照常发出。
- JSON 解析走 `extractJson` 三级容错。
- 无 LLM key → `skipLLM` 路径，仅出行情/信号。
- cron 失败跨渠道告警（Telegram + Email）。

## 12.9 与既有事实的差异

- **无 `decision-pipeline-design` 规格文件**：5 阶段管线内嵌于 `doctrine.md` §1–§5 与 `docs/designs/hedge-fund-ai*`、`docs/designs/hiphon-pm-accountability.md`；规格目录仅有 `2026-06-02-hiphon-pm-design.md`。
- **Anthropic 默认非激活**：代码以 DeepSeek 为首选 provider，Anthropic 仅在无 DeepSeek key 或显式 pin 时启用；Haiku/Opus 价目已列但默认管线只用到 DeepSeek（与「Anthropic 作为分析源」一致，属备选定位）。
