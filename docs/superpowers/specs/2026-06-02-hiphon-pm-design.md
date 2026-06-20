# Hiphon PM — 设计文档 (Design Spec)

> **状态**: Draft v1 · 待用户审阅
> **日期**: 2026-06-02
> **作者**: Claude (brainstorming with osborn)
> **产品**: Stock Monitor 升级 —— "Hiphon PM" 全能投资顾问 Agent

---

## 1. 概述与目标 (Overview & Goals)

把现有 **Stock Monitor**（个股每日 AI 监控工具，A/港/美股，Next.js + Supabase + 完整数据 API）升级为一个名为 **Hiphon PM** 的投资顾问 Agent。Agent 以虚构的传奇基金经理 **John Cameron** 为人格原型，能力对标资深对冲基金/私募经理。

### 四大需求 → 落地映射

| # | 需求 | 落地组件 |
|---|---|---|
| 1 | **功能集成**：现有功能既可作独立 Skill 调用，也可作整体 Agent 运行 | 标准 `SKILL.md` 契约 + `john-cameron` 主代理编排 |
| 2 | **交易决策支持**：独立选股/择时/交易策略，直接推荐当前应买入标的 | `HOUSE_DOCTRINE` 投资宪法 + `hiphon-pm-pick` Skill |
| 3 | **个股深度分析**：系统性基本面分析 → 投资报告 + 操作建议 | `hiphon-pm-deepdive` Skill（v2） |
| 4 | **全方位问答**：一二级市场专业答疑，扮演资深 PM | `john-cameron` 主代理人格层 |

### 非目标 (Out of Scope / YAGNI)

- ❌ 不接券商下单 API、不执行真实交易（仅决策辅助）
- ❌ 不做新的 Web UI 页面（CLI 优先；Web 集成留待后续）
- ❌ 不重写现有数据管线（复用现有 API，只在上层增加 Agent/Skill）
- ❌ v1 不含 deepdive（旗舰优先，见 §8 排期）

---

## 2. 核心决策 (Locked Decisions)

| 维度 | 决定 |
|---|---|
| **交付形态** | Claude Code 技能 + Agent（CLI 优先）。`SKILL.md` + `.claude/agents/john-cameron.md` |
| **人格原型** | 虚构复合型首席 PM，**Druckenmiller 为核心 DNA**（全球宏观/流动性/顺势重仓/快速止损），辅以价值护城河 + 产业链卡脖子 |
| **合规口径** | **个人版**：可直言"买入/加仓/减仓/卖出"评级，但每条必须附 ① 理由 ② 仓位% ③ 止损位/风险，保留"仅供个人决策参考"尾注 |
| **市场范围** | A 股为主（数据最深）+ 港/美做宏观与主题机会补充 |
| **取数方式** | 连已部署生产 API：`https://stock-monitor-nu.vercel.app/api/*` |
| **建设顺序** | 旗舰优先：主代理 + doctrine + `hiphon-pm-pick`（v1）→ `hiphon-pm-deepdive`（v2） |
| **执行模型** | **OSStack 当 PM** 监督整个 design→code→test→ship 生命周期 |
| **代码位置** | 全部落在 `stock-monitor/` 仓库内（产品归属一致） |

---

## 3. 执行模型 —— OSStack as PM (三层架构)

```
本会话 Claude (架构师/技术负责人)   OSStack 守护进程 (PM)        claude-code 子代理 (执行)
────────────────────────────    ──────────────────         ─────────────────────────
· 写 spec / 拆任务 / 验收          · kanban: design→code        · 在 stock-monitor 仓库
· 把任务投递给 OSStack              →test→ship                   真正写 SKILL.md / agent /
· review 子代理产出                · state.db 跨任务记忆          references / 测试
· 卡死时手动接管                   · 路由到 claude-code adapter
```

### 3.1 OSStack 前置修复（阻塞项）

OSStack monorepo 在 `/Users/osborn/Developer/osbstack`（注意拼写 `osbstack`），是 pnpm workspace，**当前缺 `node_modules`**，CLI 报 `Cannot find package '@osstack/hermes-adapter'`。

修复步骤：
```bash
cd /Users/osborn/Developer/osbstack
pnpm install          # 链接 workspace + 装依赖
pnpm -r build         # 重建各 package dist
node packages/cli/dist/bin.js version    # 确认可跑
node packages/cli/dist/bin.js serve &    # 起守护进程 (Unix socket /tmp/osstack.sock)
node packages/cli/dist/bin.js health     # 确认 3 adapter 在线
```
> 注意：`/tmp/osstack.sock` 当前是 6/1 的**陈旧 socket**（无活进程），起服务前需清理。

### 3.2 建项目与派活

```bash
BIN=/Users/osborn/Developer/osbstack/packages/cli/dist/bin.js
REPO=/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/stock-monitor

# 建看板项目 + 生命周期卡（沿用 RE-Fund-AI 先例）
node "$BIN" kanban create ...

# 派单个建设任务（无人值守跳权限）
OSSTACK_AUTOAPPROVE=1 node "$BIN" task submit "<任务描述>" \
  --repo "$REPO" --kind code.write --agent claude-code
```

### 3.3 风险与兜底

- OSStack 处 **S1.5 / v0.0.0** 早期，曾记录 infra 失败 (`iflt=1`)、claude-code adapter 权限/repo 上下文历史 bug（已修，见 memory #2260）。
- **兜底原则**：OSStack 是编排与追踪层，不是单点阻塞。若某 kanban 卡的 claude-code 任务卡死/失败，**本会话 Claude 直接接管该卡手动完成**，并把卡片移到 done。保证项目不被早期编排器拖死。

---

## 4. 产品架构 —— Hiphon PM 组件

所有组件落在 `stock-monitor/` 内，复用现有数据 API。

```
stock-monitor/
├── .claude/agents/
│   └── john-cameron.md              # 主代理人格（需求 4 + 总调度）
├── skills/
│   ├── hiphon-pm/                    # 共享投资宪法（被各 skill 引用）
│   │   └── references/
│   │       └── doctrine.md          # 选股/择时/交易策略/仓位/止损/评级标准
│   ├── hiphon-pm-pick/              # 需求 2：今天买什么
│   │   ├── SKILL.md
│   │   └── references/
│   ├── hiphon-pm-deepdive/         # 需求 3：个股深研（v2）
│   │   └── SKILL.md
│   ├── stock-daily-radar/          # [已存在] 复用为子技能
│   ├── stock-bottleneck-picker/    # [已存在] 复用为子技能
│   └── ai-supply-chain-bottleneck-hunter/  # [已存在] 研究框架
```

### 4.1 满足"需求 1（双形态）"的机制

每个 Skill 遵循标准 `SKILL.md` 契约（YAML frontmatter `name` + `description` + 触发词）：
- **独立调用**：用户直接 `/hiphon-pm-pick` 或自然语言触发
- **被编排**：`john-cameron` 主代理在对话中按意图自动调用对应 Skill

---

## 5. John Cameron 人格 + 投资宪法

### 5.1 主代理 `john-cameron.md`（需求 4）

- **身份**：Hiphon 资本首席 PM，35 年全球宏观 + 中国市场实战，前对手私募掌门。
- **DNA（Druckenmiller 主导）**：
  - 自上而下：先宏观/流动性定方向（仓位总闸），再选股
  - 顺势重仓 + 快速止损："对了集中、错了认错"
  - 12–18 个月前瞻视角；波段到中线持仓，非日内
  - 辅助层：价值护城河（巴菲特/张坤）做安全边际；产业链卡脖子做选股放大镜
- **职责**：
  1. 一二级市场专业问答（宏观、行业、估值、IPO/一级、组合构建、风险）
  2. 意图路由：识别"选股/择时" → 调 `hiphon-pm-pick`；"看某只股" → 调 `hiphon-pm-deepdive`/`stock-daily-radar`；"拆产业链" → 调 `stock-bottleneck-picker`
  3. 综合 9 人 AI 委员会观点做最终裁决（他是主持人）
- **声音**：宏大叙事开场（"我看到了什么"），落到可执行结论；引用流动性/央行/周期；直接、有 conviction、敢给观点。

### 5.2 `doctrine.md` 投资宪法（需求 2 的大脑）

机器可读的决策框架，被 `hiphon-pm-pick` 严格遵循：

- **选股逻辑 (Stock-Picking)**：宏观顺风行业 → 产业链卡脖子环节 → 护城河/财务质量过滤 → 信号面确认
- **择时逻辑 (Timing)**：宏观/流动性状态（顺风/逆风/中性）决定总仓位上限；个股信号（`/api/signals` 触发器权重 + 资金流）决定进场时机
- **交易策略 (Strategy)**：建仓节奏、加仓/减仓规则、止损纪律（默认 -8%~-15% 按波动调整）、止盈/移动止损
- **仓位规则 (Sizing)**：单一标的上限、行业集中度、宏观逆风时的现金比例
- **评级标准 (Rating Rubric)**：`强烈买入 / 买入 / 增持 / 观望 / 减持 / 卖出` 六档，每档对应明确的多因子触发条件
- **合规口径**：个人版——允许买卖措辞，但强制附 理由 + 仓位% + 止损 + 风险 + 尾注

---

## 6. Skill 规格

### 6.1 `hiphon-pm-pick`（v1 旗舰 · 需求 2）

**触发**："今天买什么"、"选股"、"current picks"、"给我买入建议"、"hiphon pick"

**输入**：可选行业/主题/市场/风险偏好；无输入则走默认全市场扫描。

**工作流**：
1. **宏观/择时定调** — 评估当前流动性/宏观状态 → 确定总仓位上限与风格偏好
2. **候选生成** — 复用 `stock-bottleneck-picker` 产业链逻辑 + watchlist + 信号扫描产出候选池
3. **多因子打分** — 对候选并行拉 `/api/quote` `/api/signals` `/api/financials`（A股）`/api/flows`（A股）`/api/perspectives`，按 doctrine 评分
4. **裁决与排序** — John Cameron 综合打分 + 9 人委员会，输出排序买入清单
5. **输出** — 每只标的：评级 / 一句话逻辑 / 建议仓位% / 进场区间 / 止损位 / 主要风险；末尾总仓位建议 + "仅供个人决策参考"

**输出格式**：Markdown（CLI）；可选 JSON（供后续 Web 消费）。

### 6.2 `hiphon-pm-deepdive`（v2 · 需求 3）

**触发**："深度分析 <ticker>"、"investment report"、"基本面报告"、"该不该买 <股票>"

**工作流**：解析 ticker → 并行拉 quote/financials/signals/flows/holders/calendar/perspectives → 按 doctrine 做系统性基本面分析（商业模式/护城河/财务质量/估值/催化剂/风险）→ 生成完整投资报告 + 明确操作建议（评级+仓位+止损）。

> v2 落地，v1 阶段先由 `stock-daily-radar` 覆盖轻量版个股分析。

---

## 7. 数据层 (复用现有 API)

| 数据 | Endpoint | 覆盖 |
|---|---|---|
| 行情 | `GET /api/quote/{ticker}` · `/api/quote/batch` | A/港/美 |
| 信号+回测 | `GET /api/signals/{ticker}` | A/港/美 |
| AI 9 人观点 | `GET /api/perspectives/{ticker}` | A/港/美 |
| 5年财报 | `GET /api/financials/{ticker}` | A 股 |
| 资金流(北向/涨跌停) | `GET /api/flows/{ticker}` | A 股 |
| 股东/日历 | `GET /api/holders/{ticker}` · `/api/calendar/{ticker}` | A 股 |
| 搜索/雷达 | `GET /api/search?q=` · `/api/radar/{ticker}` | A/港/美 |

**Base URL**: `https://stock-monitor-nu.vercel.app`
**认证**：需先确认 API 是否受 site-password 护栏（`src/lib/auth/site-password.ts` / `/api/auth/unlock`）。若是，文档化 cookie 获取步骤；若公开则直连。**(实现首步需验证)**

---

## 8. 建设排期 (OSStack Kanban 卡片)

### v1（旗舰，本次交付）
1. `design` — 本 spec（完成）
2. `code` — OSStack 修复 + 起服务 + 建看板项目
3. `code` — `doctrine.md` 投资宪法
4. `code` — `.claude/agents/john-cameron.md` 主代理
5. `code` — `hiphon-pm-pick` SKILL.md + references
6. `test` — 验证：API 连通性 / pick 端到端跑出带评级+仓位+止损的清单 / 主代理问答 + 路由
7. `ship` — README 更新 + commit + PR

### v2（后续）
8. `hiphon-pm-deepdive` Skill + 个股投资报告
9.（可选）Web 集成：`/hiphon` 聊天页

---

## 9. 验收标准 (Acceptance / Verification)

- ✅ `john-cameron` 主代理能回答一二级市场问题，并能正确路由到子 Skill
- ✅ `hiphon-pm-pick` 单独调用能产出 ≥3 只带 评级/仓位%/止损/风险 的买入候选
- ✅ 所有买卖建议均含理由 + 仓位 + 止损 + "仅供参考"尾注（doctrine 合规）
- ✅ 数据全部来自真实 API，无编造数字；数据缺失时明说"暂无数据"
- ✅ 全流程在 OSStack 看板上可追踪（design→ship 卡片状态正确）

---

## 10. 开放问题 (Open Questions)

- [x] **生产 API 受 site-password 护栏** —— 已确认。流程：`STOCK_MONITOR_SITE_PASSWORD` env → POST `/api/auth/unlock` 取 `sm_auth` cookie（30 天）→ 复用。已写入 `data-access.md` 并**实测通过**（unlock/search/quote/signals/radar/financials/flows/HK 全部 200）。
- [x] **OSStack `pnpm install` 一次成功** —— 已修复（缺 node_modules），`pnpm install && pnpm -r build` 通过，daemon 起在 `/tmp/osstack.sock`，5 adapter 在线。
- [x] **John Cameron 主代理放项目级** `.claude/agents/john-cameron.md`（随产品走）。
- [ ] OSStack claude-code adapter 历史上有 cancelled/failed（tokens=0/0）记录；本次 v1 由架构师直接编写、OSStack 作追踪/监督 PM。后续大批量任务再压测 adapter 稳定性。
