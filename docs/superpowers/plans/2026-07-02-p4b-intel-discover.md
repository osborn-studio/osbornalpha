# P4b 情报板块 /intel（发现向导 + 筛选器）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.
> **依赖：P4a 已合并**（AGENT_METHODS、archive 标志、artifacts API、CopilotClient ?method= 支持）。

**Goal:** `/intel` 板块上线：发现 tab（瓶颈选股向导 + 产业链尽调向导 + 股票池筛选器）+ 研究 tab（搜索直达个股页 + 最近研究档案），TabBar 换血（+情报，−雷达/简报）。

**Scope decisions (approved by Osborn):**
- 筛选器 v1 = 股票池内筛选（实时 quote 的 pe_ttm/pb/market_cap/change_pct + 雷达级过滤），全市场筛选待 P5 Tushare 数据升级——UI 上注明范围。
- `/stock/[ticker]` 不迁移（内链多，P6 统一 301）；研究 tab 链接现有个股页。
- 雷达/简报 Tab 移除（页面保留可直达；/today 已承载晨间入口，BriefGlance 有完整简报链接）。TabBar 结果：今日/股票池/我的投资/情报/技能/回测/设置 = 7。

---

## File Structure

- Create: `src/lib/agent/methods/bottleneck-picker.ts`、`industry-chain.ts` — 两个 AgentMethod（archive: true）
- Modify: `src/lib/agent/methods/registry.ts` — AGENT_METHODS + METHODS 各加两条（href `/intel`）
- Modify: `src/app/(app)/copilot/CopilotClient.tsx` — 支持 `?q=` 初始问题（与 ?method= 并用；q 存在且 autoStart 允许时以 q 为 question 启动）
- Create: `src/components/intel/WizardCard.tsx` — 向导启动卡（输入框+启动按钮 → router.push `/copilot?method=X&q=…`）
- Create: `src/components/intel/WatchlistScreener.tsx` — 筛选器（客户端过滤）
- Create: `src/app/(app)/intel/page.tsx` — 发现/研究 双 tab
- Modify: `src/components/TabBar.tsx` — 加 📡 情报（/intel，雷达线稿图标：同心弧+扫描点），移除 radar/briefs 两条目
- Modify: `src/app/(app)/stock/[ticker]/page.tsx` — 顶部动作区加「🔬 深度研究」按钮 → `/copilot?method=hiphon-pm-deepdive&ticker=…`

---

### Task 1: 两个向导 AgentMethod

- **bottleneck-picker**（id 'stock-bottleneck-picker'，icon '🔭'，archive true）：steps = [终端系统定义, 价值链分层, 瓶颈定位, 证据核验, 候选清单]；systemPrompt 依 `skills/stock-bottleneck-picker/SKILL.md`：用户输入是赛道/终端系统关键词（来自 question）；先推理链条 6-9 层，定位最窄约束（产能/技术/牌照），再用 search/quote/financials/perspectives 工具核验候选；输出 markdown：论点 + 链条图（文本）+ 3-7 只候选（角色 executor/pure-play/beneficiary/optionality + 证据强度 ●/◐/○）+ 最后 ```json verdict {candidates:[{ticker,role,evidence}], thesis}```。
- **industry-chain**（id 'industry-chain-diligence'，icon '🕸'，archive true）：steps = [链条全景, 上游, 中游, 下游, 格局与风险]；systemPrompt 依 osbornhub industry-chain skill 的 15 维框架精简为可在 12 hop 内完成的版本（市场规模/增速/技术路线/壁垒/价值分布/供需/竞争/风险/关键指标）；输出 markdown 报告 + ```json verdict {segments:[{tier,name,leaders:[ticker]}]}```。
- 注意 ticker 字段：这两个方法无单一标的——copilot route 的 body.ticker required 校验需放宽：`methodId` 对应方法存在且 question 非空时允许无 ticker（loop 的 task 模板用 question 本身）。检查 loop.ts task 构造并适配（ticker 为空时 task = question）。
Gates: tsc + test（tools.test 快照若含 METHODS 数量需更新）。Commit: `feat(intel): bottleneck-picker & industry-chain agent methods`

### Task 2: /intel 页 + 组件 + CopilotClient ?q=

- CopilotClient：`?q=` → decodeURIComponent 为初始 question；有 q 且 method 也有时，打开即以 {ticker?: ?ticker, question: q, methodId} 启动一次（复用现 autoStart 逻辑语义——从向导跳转来的目的就是立刻跑）。
- WizardCard props `{icon,title,desc,placeholder,methodId}`：输入 → 启动按钮 → `/copilot?method=…&q=…`。
- WatchlistScreener：useWatchlist + useBatchQuotes；过滤条件行：市场(A/HK/US 多选 Tag)、PE 上限(number)、PB 上限、市值下限(亿)、今日涨跌方向；结果表（data-density）name/ticker/price/change/pe/pb/市值，行点击 → /stock/[ticker]；顶部注明「范围：你的股票池（全市场筛选将随 P5 数据升级开放）」。
- intel/page.tsx：'use client'；顶部 tab 发现/研究（useState）；发现 = 两张 WizardCard 并排 + WatchlistScreener；研究 = 搜索框（fetch /api/search?q= 下拉结果 → /stock/[ticker]）+「最近研究档案」（GET /api/artifacts?limit=10 列表，标题行点击展开 content_md——组件逻辑可从 /skills 页抽公共小组件或就地重写，选轻的路径：就地重写）。
Gates: tsc + build（ƒ /intel）+ test。Commit: `feat(intel): discover board with wizards and watchlist screener`

### Task 3: TabBar 换血 + 个股页深度研究按钮

- TabBar：移除 radar/briefs 条目；watch 之后、portfolio 之前插入 `{ id:'intel', emoji:'📡', label:'情报', href:'/intel' }`（雷达扫描线稿 Icon）；顺序：今日/股票池/情报/我的投资/技能/回测/设置。
- stock/[ticker]/page.tsx：现有「🎩 用 John 分析」按钮旁加「🔬 深度研究」→ `/copilot?method=hiphon-pm-deepdive&ticker=${encodeURIComponent(ticker)}`（读该文件后最小插入）。
Gates: tsc + build + test（若 dynamic-rendering 或其他测试断言 TabBar 数量需同步）。Commit: `feat(intel): tab swap (radar/briefs → intel) + deepdive button on stock page`

### Task 4: 终审 + 合并

middleware 不动（/intel 在 (app) 内自动受保护）。终审重点：CopilotClient 的 q/method/autoStart 组合矩阵不误触发；TabBar 移除不破测试。生产验收：向导启动→报告→档案；筛选器过滤即时。
