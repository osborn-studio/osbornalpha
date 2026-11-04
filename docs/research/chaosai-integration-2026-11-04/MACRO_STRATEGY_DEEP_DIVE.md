# ChaosAI《宏观策略》页 · 浏览器实证拆解与 OsbornAlpha 克隆蓝图

研究日期：2026-11-04（北京时间）
目标站点：https://www.chaosaiagent.com/macro-strategy
方法：Claude 内置浏览器逐板块阅读 + 公开 HTML / React Server Components 载荷解析 + 公开 JS chunk 扫描。未访问管理后台，未尝试获取私有源码。
与同目录 `REPORT.md` 的关系：`REPORT.md` 是同日早些时候的全站研究与集成设计，明确写明"本地浏览器访问被禁用，未完成交互验证"。本文用真实浏览器补齐了这一缺口，聚焦宏观策略页，逐个组件还原其数据对象、算法和来源，并核实了 `REPORT.md` 第 6 节的问题清单（见本文第 9 节）。两份文档互为补充，不重复展开行业 / AI 生态 / 研报内容。

---

## 0. 一页结论

1. 宏观策略页是一个**单页、服务端一次性渲染**的研究看板：29 个指标序列（含 11 个资产价格）和全部解读文本被序列化进页面载荷（原始 HTML 2.27 MB），页面上没有任何宏观数据接口调用；图表是服务端生成的内联 SVG，不是 Recharts。
2. 产品价值在于**"一个判定 → 为什么 → 看哪些指标 → 指标的历史周期与事件 → 指标与资产的统计关系 → 传导机制 → 历史类比"**这条阅读路径，以及每个卡片底部的来源行。这条路径值得整体搬到 OsbornAlpha。
3. 判定算法是**规则打分加权归一化**（每指标一条阈值规则 → 0.1–0.8 的得分 × 指标权重 → 四象限求和 → 归一化），不是统计校准的概率模型。它可解释、可复现，但当前实现存在**规则类型错配**（汇率、美元指数、GDP 命中了利率 / PMI 的阈值规则），我们克隆时应修正。
4. 数据新鲜度名不副实：页面写"数据每 30 分钟更新"，但全部指标 `fetched_at` 为 2026-09-11T03:35Z，距本次访问已近两个月；资产"最新值"疑似人工覆盖的整数（如黄金 history 前值 2679.9 → 最新值 4400）。
5. 数据来源分三层：美国指标 FRED（8 个 series）、中国指标 AKShare（9 个）加新闻合成（MLF / LPR）、资产价格 Yahoo Finance（12 个代码）；历史周期表 iframe 另外声明了 MiniMax Finance、Statista/ICE、CurrencyNews/外汇局、FRED H.15、World Bank Pink Sheet、EIA、Metalcharts/Macrotrends、FOMC。OsbornAlpha 的接入建议见第 10 节。

---

## 1. 站点与技术形态（实证）

| 项目 | 观察 | 证据 |
|---|---|---|
| 框架 | Next.js App Router，Turbopack 构建（`/_next/static/chunks/turbopack-*.js`），RSC 载荷 `self.__next_f.push` | 页面 HTML |
| 托管 | `Server: nginx/1.18.0 (Ubuntu)`，`X-Powered-By: Next.js`，`Cache-Control: private, no-cache, no-store`。自托管 VPS，不是 Vercel | 响应头 |
| 一级导航 | 宏观策略(新) / 行业研究 / 公司研究 / 竞争分析 / 专题研究 / 外资研报 / 模拟组合(新) / 行业数据(更新) / 他山之石；页脚署名 "Powered by Claude Code · Hermes…" | 顶栏截图 |
| 路由 | `/`, `/macro-strategy`, `/industries`, `/industry-data`, `/company`, `/competition`, `/research`, `/foreign-research`, `/monitor`, `/benchmark`, `/admin`(401) | 首页 RSC 预取 |
| 接口 | 仅观察到 `GET /api/research-reports?status=published&days=7`（顶部"近一周新增"跑马灯）和 `today=1`；客户端 bundle 里还引用了 `/api/chat`（右下角"AI 助手"浮钮） | 网络面板、JS 扫描 |
| 图表库 | 宏观页：服务端内联 SVG（载荷含 1540 个 `fill`、52 个 `points`、46 个 `viewBox`）；行业研究 / 监控等页：Recharts（bundle 出现 79 次） | RSC 载荷、JS 扫描 |
| 第三方嵌入 | `/macro-strategy/cycle-asset-table/index.html` 作为 iframe 嵌入（21 KB 静态 HTML + 一段按涨跌幅着色的内联脚本）；`/industries/token-interactive/index.html` 同样是独立 HTML | 抓取文件 |
| 统计 | Google Analytics `G-LNG9KC5Q8S` | HTML |
| 工程线索 | 页脚自曝 `scripts/sync_macro_indicators.py`（同步脚本）与 `src/data/macro-classify.ts`（判定逻辑，导出 `classifyUS` / `classifyCN`）；方法论页 `/macro-strategy/methodology` 返回 404 | 页面文本 |
| 中国 PMI 等中国数据口径 | 中国 PMI 历史值为 41.5–50.9，明显不是国家统计局口径（官方制造业 PMI 极值约 35.7–52），更像某财新 / 自算指数或错误序列 | 指标卡片图 |

推断（非实证）：数据链是"Python 脚本定时拉取 FRED / AKShare / Yahoo → 落成 JSON/数据库快照 → Next 构建或请求时读取快照 → 服务端渲染整页"。解读文本（周期解读、核心结论）由人或 Agent 离线撰写后随快照一起发布，所以会出现文案数字与最新数值脱节（见第 9 节）。

---

## 2. 页面解剖：布局与区块清单

布局：左侧 240px 固定"页面导航"（两级锚点，滚动高亮），右侧内容区；顶部标题条"🌀 宏观策略 · 基于美林时钟与流动性传导链 · 实时追踪美中宏观 · 输出象限判定与资产配置建议 · 数据更新：2026/9/11 11:35:00"；右下角紫色 AI 助手浮钮。

页面 `section id` 与区块（按 DOM 顺序）：

| # | section id | 区块 | 内容对象 | 底部来源标注 |
|---|---|---|---|---|
| 1 | `dashboard` → `dashboard-us` / `dashboard-cn` | 美林时钟大盘 | 每国：判定头（当前象限 + 置信度 + GDP↑/CPI↑ 徽标）→ 4 张象限卡 → 循环条 → 判定小结（置信度提示、流动性阶段、资产配置建议、超/低配行业）→ 偏差案例库（仅美国）→ 判定方法论（仅中国之后） | 无单独来源行，依赖页脚总声明 |
| 2 | `us` → `us-summary` / `us-grid` / `us-correlation` | 美国指标 | 8 行汇总表 → 8 张可折叠指标卡（默认展开 DFF）→ 关联分析（6 张 Pearson 卡 + 4 组拟合） | 每卡底部：`📅 value_date · 📊 source · 由 code 提供` |
| 3 | `cn` → `cn-summary` / `cn-grid` / `cn-correlation` | 中国指标 | 12 行汇总表（标题写 13）→ 10 张指标卡（利率三合一、CGB、USDCNY、CPI、PPI、GDP、M2、社融、PMI、出口）→ 关联分析（6 张 Pearson 卡 + 3 组拟合 + 一条"共同日期不足（0 个）"错误行） | 同上；利率卡写 `news_mlf / news_lpr · 由三者合成` |
| 4 | `transmission` → `transmission-flow` / `transmission-scripts` / `transmission-current` | 宏观→资产价格传导链 | 6 段实时数据流（US/CN tab）→ 4 象限剧本（每象限：触发条件 4 条、6 段传导链、受益/受损资产、历史案例、监测变量）→ 当前剧本（当前象限的 6 段链逐段挂实时数据） | 文案内嵌"数据每 30 分钟更新" |
| 5 | `pacific` → `pacific-mechanism` | 美联储 → 中国资产 | 6 段核心机制（Fed 动作→美元周期→人民币→中美利差→跨境资金→中国资产，挂实时值）→ 4 剧本 × 6 维度热力图（可点击切换剧本）→ 价格工具 / 数量工具 tab → 5 段链详情（受益/受损板块、H 股 vs A 股注释、历史案例、一句话总结） | 文案"实时数据 · 每月更新" |
| 6 | `history` → `history-cycle-table` | 历史快照 | iframe：2000 年以来 4 轮加息 + 4 轮降息 × 13 类资产的涨跌表、周期背景说明、6 条关键观察、数据来源区 | iframe 底部 8 条来源声明 |
| 7 | 页脚 | 免责声明 | "所有指标来源于公开数据源（FRED/akshare/CMS），不构成投资建议。数据源：scripts/sync_macro_indicators.py · 判定逻辑：src/data/macro-classify.ts" | — |

视觉语言（供对照，不照搬）：浅色底 + slate 文字；象限卡用四色（复苏绿 / 过热橙琥珀 / 衰退蓝 / 滞胀紫）；当前象限卡加橙色"当前象限"角标并加粗边框；指标卡顶部 1.5px 色条 + 渐变标题区 + 右侧大号数值；周期事件用🔺红（加息/上行）🔻绿（降息/下行）两色卡片；涨跌用中国习惯红涨绿跌（iframe 表格按 |涨跌幅| 对数映射透明度）。

---

## 3. 页面数据模型（从 RSC 载荷还原）

### 3.1 指标对象

每个指标是一个 `{ meta, value, prev, value_date, prev_date, source, fetched_at, history[], history_span, history_count, yoy }` 对象，经 `rawIndicators` prop 传给客户端组件。`history` 为 120 个月度点 `{date, value}`（GDP 为 40 点）。

`meta` 字段：`code, name, name_cn, country(US|CN), category, unit, weight, liquidity_signal, format(level|yoy), yoy_relevant`。

### 3.2 指标目录（29 条，实证值为 2026-09-11 快照）

美国宏观（source = fred）：

| code | 名称 | category | 单位 | weight | 最新值 / 前值 | 数据期 |
|---|---|---|---|---|---|---|
| DFF | 有效联邦基金利率 | rates | % | 25 | 3.75 / 3.75 | 2026-09-10 |
| DGS10 | 10 年期美债收益率 | bond_us | % | 15 | 4.80 / 4.78 | 2026-09-08 |
| DTWEXBGS | 美元指数（广义贸易加权） | fx | index | 10 | 102.45 / 102.18 | 2026-09-09 |
| CPIAUCSL | CPI（城市消费者）同比 | inflation | % YoY | 15 | 2.90 / 2.60 | 2026-08 |
| UNRATE | 失业率 | labor | % | 10 | 4.20 / 4.10 | 2026-08 |
| NAPM | ISM 制造业 PMI | growth | index | 15 | 48.70 / 49.10 | 2026-09 |
| PPIFIS | PPI（页面称"制成品"，FRED 定义为最终需求） | inflation | % YoY | 0 | 2.50 / 2.30 | 2026-08 |
| VIXCLS | VIX | risk | index | 5 | 17.80 / 16.20 | 2026-09-09 |

中国宏观（source = akshare，利率三项 source = news_mlf / news_lpr）：

| code | 名称 | category | weight | 最新值 / 前值 | 数据期 |
|---|---|---|---|---|---|
| CN_MLF_1Y | MLF 1Y | rates | （仅出现在判定规则，权重未在 meta 暴露） | 2.30 / 2.30 | 2025-09-25 |
| CN_LPR_1Y / CN_LPR_5Y | LPR 1Y / 5Y+ | rates | 同上 | 3.00 / 3.50 | 2025-09-25 |
| CN_CGB_10Y | 10Y 国债收益率 | rates | 15 | 2.05 / 2.02 | 2026-09-10 |
| CN_USDCNY | USD/CNY 在岸 | fx | 5 | 7.12 / 7.10 | 2026-09-10 |
| CN_CPI_YOY | CPI 同比 | inflation | 10 | 0.80 / 0.50 | 2026-08 |
| CN_PPI_YOY | PPI 同比 | inflation | 15 | -2.10 / -2.50 | 2026-08 |
| CN_GDP_YOY | GDP 同比 | growth | 0 | 5.20 / 5.00 | 2026-06-30 |
| CN_M2_YOY | M2 同比 | liquidity | 10 | 8.80 / 8.70 | 2026-08 |
| CN_SHRZ_YOY | 社融存量同比 | liquidity | 20 | 8.50 / 8.40 | 2026-08 |
| CN_PMI | 制造业 PMI | growth | 15 | 50.40 / 50.10 | 2026-08 |
| CN_EXPORT_YOY | 出口同比（美元） | external | 10 | 7.20 / 6.80 | 2026-08 |

资产价格（source = yahoo，weight = 0，`liquidity_signal = 资产价格`）：IXIC 与 ^IXIC（重复）、SPX、DJI、000300.SS、^HSI、GC=F、HG=F、CL=F、TLT、DXY 与 DX-Y.NYB（重复）。资产的 `fetched_at` 为空。

### 3.3 其他数据对象

- 周期分段（指标卡）：`{type: 加息|降息|上行|下行|宽松|收紧…, start: YYYY-MM, end: YYYY-MM, events: [{ym: 'YY-MM', label}], assets: [{code, name_cn, emoji, pct}]}`，渲染为横向周期卡 + 图中背景色带。
- 解读文本：每卡一段"📖 周期解读"（3–4 段叙事 + "资料："来源句），每个关联分析一段"核心结论 / 拟合意义"。
- 象限剧本：`{quadrant, emoji, title, triggers[4], chain[6], benefit[], harm[], history, watch}`。
- 偏差案例：`{period, shock, expected, actual, reason}`（4 条：2020 H1 疫情、2022 Q2 俄乌、2023 H1 Fed 末次加息、2024 Q3 软着陆）。
- 资产配置模板：象限 × {股, 债, 商品, 现金, 黄金} 五元组，固定值：复苏 55/10/15/10/10，过热 35/10/30/10/15，衰退 25/40/10/15/10，滞胀 20/10/30/20/20。
- 历史周期表（iframe）：8 周期 × 13 资产，单元格 `{pct, from, to}` 或 `—`。

---

## 4. 象限判定算法（逆向还原）

### 4.1 流程

```
for 每个国家:
  for 每个指标 i（有 weight 且有值）:
    rule = match(i.code, i.value, delta = value - prev)   // 单条阈值规则
    for q in {复苏, 过热, 滞胀, 衰退}:
      score[q] += rule.support[q] × weight(i)             // support ∈ {0.1 … 0.8}
  prob[q] = score[q] / Σ score                             // 归一化
  主判定 = argmax prob；置信度 = max prob；备选 = 次高
  置信度 < ~35%: "判定置信度低，4 象限概率接近"
  置信度 35–50%: "判定置信度中等…可能在相邻象限之间漂移"
```

页面"查看定量分解"展开后逐行显示：指标 / 当前值 / 命中规则 / 得分×权重 / 贡献，并注明"顶部象限卡片的大数字与此处完全一致（同一份 classifyUS/classifyCN 结果）"。

### 4.2 实证抓到的规则（命中规则列原文）

| 指标 | 规则文本 | 命中象限 → 得分 |
|---|---|---|
| DFF / LPR / MLF | `v ∈ [2.5, 4.5)（中性利率）` | 复苏 0.30 |
| DFF 类 | `v < 2.5（极宽松，衰退期刺激）` | 衰退 0.70 |
| DGS10 | `v ≥ 4.5 且 delta ≥ 0（限制性利率+加息）` | 过热 0.60 |
| DGS10 | `v ≥ 4.5（高利率压制）` | 滞胀 0.30 |
| CPIAUCSL / PPIFIS | `v ∈ [2, 3]（温和通胀）` | 复苏 0.30，过热 0.30，衰退 0.20 |
| CN_CPI / CN_PPI | `v < 1（通缩）` | 衰退 0.70 |
| NAPM | `v ∈ [47, 49)（收缩）` | 衰退 0.60，滞胀 0.30 |
| CN_PMI | `v ∈ [50, 55)（温和扩张）` | 复苏 0.50，过热 0.20 |
| UNRATE | `delta > 0（失业上升）` | 滞胀 0.30 |
| VIXCLS | `v ∈ [12, 20)（中性）` | 复苏 0.30？/ 过热 0.20 |
| CN_SHRZ / CN_M2 | `v ∈ [8, 10] 且 delta ≥ 0（社融企稳）` | 复苏 0.40，过热 0.20 |
| CN_EXPORT | `v > 5（外需稳）` | 复苏 0.40，过热 0.20 |

当前结果：美国 过热 34% / 衰退 24% / 复苏 23% / 滞胀 19%；中国 复苏 36% / 衰退 24% / 过热 21% / 滞胀 19%。

### 4.3 算法缺陷（克隆时必须修）

- **规则按数值而非按指标类型派发**：`DTWEXBGS=102.45` 命中 "≥4.5 且 delta≥0（限制性利率+加息）"；`CN_USDCNY=7.12` 命中 "≥4.5（高利率压制）"；`CN_GDP_YOY=5.20` 命中 "<47（深度收缩）"（PMI 规则）。这些贡献直接把美国"过热"和中国"衰退"的概率抬高。
- **权重 0 的指标仍出现在分解表**（PPIFIS、CN_GDP_YOY 贡献 0.0），占视觉但无作用。
- **归一化值被叫作"概率 / 置信度"**，但没有标签、没有校准；页面自述回测"2022/2023/2024 三个周期准确率 2/3"。
- **缺失值处理不明**：MLF 1Y 在"驱动指标"卡里显示为无名称的 `#2 2.30 →`。

---

## 5. 指标卡片：信息顺序与周期/事件模型

卡片（以 DFF 为例，默认展开）自上而下：
1. 标题区：emoji + 中文名 + code · 英文名 · category 徽标 · `120 点 · 2016-10-01 → 2026-09-10`；右侧大号最新值 + 单位 + 环比箭头与变化量。
2. "📅 关键事件（按周期）· 4 个周期 · 横向对应图中时间位置"：按周期分列的事件卡（🔺加息周期 / 🔻降息周期），每条 `YY-MM 事件标题`。
3. 折线图（SVG）：周期背景色带 + 关键刻度（max / mid / min）+ 年份轴；利率三合一卡为双轴（左 MLF，右 LPR）。
4. "🔗 关联资产按周期涨跌"：每周期列 2–3 个资产的区间涨跌（如 2021-07~2023-10 加息期：纳指 ↓24.1%，TLT ↓42.0%，美元指数 ↑15.2%）。
5. "💡 流动性含义"：`meta.liquidity_signal` 一句话。
6. "📖 周期解读"：3–4 段叙事 + "资料：…"。
7. 来源行：`📅 2026-09-10 · 📊 fred · 由 DFF 提供`。

事件库是手工维护的 YY-MM 短标签（DFF 卡 31 条、中国利率卡 29 条），同一事件会在多张卡里复用（如"24-09 Fed 降息 50bp"出现在 DFF、USDCNY、CPI 卡）。这说明背后是一个 `events[]` 表按 `related_codes` 关联到指标，而不是每卡独立文案。克隆时应建 `macro_events(event_id, date, title, type, related_series[], source_url)` 一张表。

---

## 6. 关联分析板块

- **Pearson Top-6 卡**：标题 `指标 ↔ 资产`，徽标 `r = ±0.xx`，两行当前值，脚注 `正/负相关 · n=119 个共同日期`，背景为两条归一化折线。基于"公共月度日期对齐"计算；美国侧 6 组（DGS10↔TLT -0.94、DFF↔TLT -0.89、NAPM↔^IXIC -0.83、UNRATE↔^IXIC 0.81、UNRATE↔TLT -0.80、UNRATE↔GC=F 0.79），中国侧 6 组。
- **拟合分析**：左图双轴折线（指标 vs 资产，10 年月度），右图散点 + 回归线（`y = a + b·x`，R²），下方两列"当前值 / 12 月前 → Δ"，再两段"核心结论 / 拟合意义"文字。美国 4 组：DFF→^IXIC（r=0.55, R²=0.306）、DGS10→^IXIC（0.59 / 0.346）、DTWEXBGS→GC=F（0.78 / 0.604）、GC=F→CL=F（0.18 / 0.031）；中国 3 组：USDCNY→DTWEXBGS（-0.23 / 0.054）、SHRZ→000300.SS（-0.56 / 0.312）、SHRZ→^HSI（-0.11 / 0.011）。
- 文字与数值脱节（实证）：DFF↔纳指 r=+0.55 而文案写"显著负相关"；USDCNY↔广义美元 r=-0.23 而文案写"强正相关 r≈0.75"；SHRZ↔沪深300 r=-0.56 而文案"社融↑→估值修复"。文案是离线写死的叙事，没有和计算结果绑定。
- 这些是**水平值相关**（含趋势的伪相关风险），不是变化率相关；克隆时应提供水平 / 变化 / 滚动 / 事件窗口四种模式，且结论由规则从数字生成。

---

## 7. 传导链与"美联储→中国资产"

- **6 段实时数据流**：① 经济数据（PMI/CPI/失业）→ ② 政策预期（DFF、Fed 路径）→ ③ 流动性（M2/社融、RRP/TGA，显示"实时跟踪"占位，实际无数据）→ ④ 无风险利率（10Y、DXY）→ ⑤ 风险偏好（VIX、信用利差占位）→ ⑥ 资产配置。横向六色卡片 + 箭头，US/CN tab。
- **4 象限剧本**：每象限一张大卡：触发条件（4 徽标）/ ⛓️ 6 段链 / ✅ 受益 / ❌ 受损 / 📜 历史案例 / 🔍 监测变量；当前象限标"◀ 当前"。
- **当前剧本**：把当前象限的 6 段链逐段挂上实时数值（`📊 PMI 48.70 ↓0.40 · CPI 2.90% ↑0.30 …`），再列"当前应超配 / 低配"和"监测清单"。
- **美联储→中国资产**：6 段机制卡（挂 DFF、DTWEXBGS、USDCNY、"中美利差 1.05pp"、"北向 ↑"、"H 19680 · A 3920"）；4 剧本 × 6 维度热力图（降息 / 加息 / QE / QT × DXY / CNY / 利差 / 北向 / H 股 / A 股，格子值 ↑↑ ↑ → ↓ ↓↓，点击行切换剧本）；"价格工具 / 数量工具"tab 下的 5 段链详情（每段：code、值、变化、一句机制、📐 量化参照、⤵ 传导）；受益 / 受损板块、🇭🇰 H 股 / 🇨🇳 A 股注解、历史案例、一句话总结。
- 缺陷：第 ④ 段"中美利差"挂的是 DGS10 单边值；第 ⑤ 段"跨境资金流"挂的是 VIXCLS；"中美利差 1.05pp" 与 4.80 − 2.05 = 2.75 不符。

---

## 8. 历史快照（iframe `cycle-asset-table/index.html`）

- 两张表：加息周期 4 轮（1999.6–2000.5、2004.6–2006.6、2015.12–2018.12、2022.3–2023.7）与降息周期 4 轮（2001.1–2003.6、2007.9–2008.12、2019.7–2020.3、2024.9–2025.12），列头含利率起止与 bp 变化。
- 13 行资产：S&P 500、纳指、恒指、恒生科技、沪深 300、DXY、USDCNY、10Y 美债（bp）、黄金、WTI、LME 铜、LME 铝；单元格为 `涨跌% + 起点 → 终点`，内联脚本按 |pct| 对数映射红绿透明度。
- 两段"各周期背景说明" + 六条"关键观察"（预防式 vs 衰退式降息、加息周期商品常受益等）。
- 来源区（原文）：指数类 — MiniMax Finance 指数日行情 API；DXY — Statista（ICE）；USDCNY — CurrencyNews + 外汇局中间价；10Y — FRED H.15 月末；黄金 — World Bank Pink Sheet + Goldprice.today；原油 — WorldOilMonitor / EIA；LME 铜铝 — Metalcharts.org / Macrotrends；加降息日期 — FOMC + Investopedia / 百度百科。并注明"周期起止日取议息会议当天；资产价格为该月月末值；恒生科技 2020-07 前为回溯模拟"。

---

## 9. 实证发现的质量问题（编号 B，含对 REPORT.md Q 项的核实）

| 编号 | 发现 | 对应 REPORT.md | 本次状态 |
|---|---|---|---|
| B01 | 全部指标 `fetched_at = 2026-09-11T03:35Z`，页头"数据更新 2026/9/11"，但传导链文案写"数据每 30 分钟更新"、机制图写"每月更新" | Q05 | 浏览器核实 |
| B02 | 资产最新值为整数且与 history 前值断裂：GC=F 2679.9→4400，SPX 5713.6→5680，DJI 41645.7→41850，000300.SS 4001.7→3920，^HSI 19676.1→19680，HG=F 4.49→4.55 | 新 | 载荷核实；疑似人工覆盖 |
| B03 | 判定规则类型错配：DTWEXBGS、CN_USDCNY 命中利率规则；CN_GDP_YOY 命中 PMI 规则 | Q02（扩大） | 浏览器核实，三处 |
| B04 | DFF↔纳指 r=+0.55 文案"负相关"；USDCNY↔广义美元 r=-0.23 文案"r≈0.75 强正相关"；SHRZ↔沪深300 r=-0.56 文案正向叙事 | Q01（扩大） | 浏览器核实，三处 |
| B05 | DFF 卡解读段写"当前 DFF 4.75%"，卡片值 3.75 | Q04 | 浏览器核实 |
| B06 | `/macro-strategy/methodology` 404（浏览器与 curl 一致） | Q11 | 核实 |
| B07 | 中国汇总表标题"13 个"，实际 12 行 | 4.2 节 | 核实 |
| B08 | 中国关联分析出现 "MLF 1Y ↔ 10Y 国债：共同日期数据不足（0 个）" 错误行直接渲染给用户 | 新 | 核实 |
| B09 | 中国"衰退象限"驱动指标 #2 无名称，只显示 `2.30 →`（MLF meta 缺失） | 新 | 核实 |
| B10 | 汇总表用 DX-Y.NYB 98.81↓，判定与传导链用 DTWEXBGS 102.45↑，标签都叫"DXY/美元指数"，方向相反 | 5.1 节 | 核实 |
| B11 | "中美利差 1.05pp" 与页面自身 4.80−2.05=2.75 不符；利差节点挂 DGS10、资金流节点挂 VIX | 4.4 节 | 核实 |
| B12 | 中国 PMI 历史 41.5–50.9，与国家统计局口径不符，但卡片标"akshare · 国家统计局制造业 PMI 月报" | 新 | 核实（口径存疑） |
| B13 | 三段流动性节点（M2/社融、RRP/TGA、信用利差）显示"实时跟踪"占位，无数据 | 新 | 核实 |
| B14 | 指标 `IXIC/^IXIC`、`DXY/DX-Y.NYB` 各重复一份 | 新 | 载荷核实 |
| B15 | NAPM 标 FRED，但 FRED 已于 2016 年移除 ISM 序列 | Q03 | 官方文档（REPORT.md）+ 本次未再验证 |
| B16 | 宏观页 HTML 2.27 MB，一次性下发 29×120 点历史 + 全部文案 + 内联 SVG；无分块、无缓存（no-store） | 7.1 节 | 核实 |

---

## 10. 数据来源总表 → OsbornAlpha 接入建议

| 板块 | 对方声明来源 | 对方实际形态 | OsbornAlpha 建议 |
|---|---|---|---|
| 美国 8 指标 | FRED（DFF, DGS10, DTWEXBGS, CPIAUCSL, UNRATE, NAPM, PPIFIS, VIXCLS） | 月度降采样到 120 点 | FRED API `series/observations`（免费 key），原频率入库，派生同比显式存变换；NAPM 改用 ISM 授权源或缺失；补核心 PCE、2Y、实际 GDP、工业生产 |
| 中国 9 指标 | AKShare | 月度 120 点；GDP 40 点 | 原发布：国家统计局（CPI/PPI/PMI/GDP）、人民银行（M2/社融存量）、海关总署（出口）、外汇交易中心（USDCNY）、中债（CGB 10Y）；AKShare 仅作适配器并记录上游；优先复用仓库已有 DataGateway/Wind 契约（待盘点） |
| 中国利率 | news_mlf / news_lpr（新闻合成） | 三合一卡 | 人民银行公告 + 全国银行间同业拆借中心 LPR 公告；建事件表而非序列拼接 |
| 资产价格 12 代码 | Yahoo Finance | 月度 120 点 + 疑似手填最新值 | 指数/ETF/期货分别建 catalog；期货注明连续合约；优先 DataGateway，其次授权行情源 |
| 历史周期表 | MiniMax Finance、Statista/ICE、CurrencyNews/外汇局、FRED H.15、World Bank/Goldprice、EIA、Metalcharts/Macrotrends、FOMC | 静态 HTML | 事件表（FOMC 官方日程）+ 资产 catalog + "事件日 / 月末 / 首个交易日"三种边界的计算器，避免拼装多来源月末值 |
| 事件库 | 手工 YY-MM 标签 | 嵌在指标对象里 | `macro_events` 表 + 来源链接 + related_series，多卡复用 |
| 解读文案 | 人/Agent 离线撰写 | 与数值脱节 | 由规则从 snapshot 生成统计事实，LLM 只补机制与反例，并绑定 snapshot_id |

---

## 11. 克隆蓝图（OsbornAlpha 风格）

### 11.1 产品定位与路由

- 落在 `Intel` 下新建 `/intel/macro`（概览）与 `/intel/macro/[series]`（指标详情），`Today` 页的 `MacroGlance` 改读同一 snapshot。不复制对方的左侧长导航，用 OsbornAlpha 既有的页内 tab：**概览 | 指标 | 关联 | 传导 | 历史 | 方法与来源**。
- 保留对方最有价值的阅读路径，但把每一层都做成可点击联动：象限卡 → 贡献明细 → 指标详情 → 事件/周期 → 关联资产 → 已有 Stock/Watchlist。

### 11.2 组件映射（对方 → 我们）

| 对方组件 | OsbornAlpha 组件（建议名） | 复用的现有基础 |
|---|---|---|
| 判定头 + 4 象限卡 + 循环条 | `RegimeSummary` + `QuadrantGrid`（当前态黄铜描边，其余中性边框，不用四高饱和色） | `Panel`、`Metric`、设计 tokens（背景 `#0a0a0b`，面板 `#141417/#1c1c20`，强调 `#ca8a04`） |
| 查看定量分解 | `ContributionTable`（指标 / 值 / 规则 / 得分×权重 / 贡献，附 coverage 与 margin） | 表格密度样式 |
| 指标汇总表 | `IndicatorTable`（值、变化口径、数据期、发布日、新鲜度状态、迷你走势；选中行驱动详情） | — |
| 指标卡（周期 + 事件 + 关联资产 + 解读 + 来源行） | `IndicatorDetail`（折线 + 周期色带 + 事件标记 + 资产区间收益表） + `SourceFooter`/`SourceDrawer` | 现有图表方案（见下）、`research/sources` 血缘模型 |
| Pearson 卡 + 拟合分析 | `CorrelationWorkbench`（指标 × 资产 × 变换 × 窗口 × 滞后，保存 analysis run） | — |
| 6 段传导链 / 剧本 / 热力图 | `TransmissionScenario`（节点标注：观测 / 推导 / 假设；条件化边） + `ScenarioHeatmap` | — |
| 历史周期表 iframe | 原生 `CycleReturnsTable`（事件日/月末边界可切换；bp 与 % 分列） | 涨跌色沿用 CN/US 偏好设置 |
| AI 助手浮钮 | 复用现有 Copilot（"Ask John"）并注入 snapshot 上下文 | `src/lib/llm` |

### 11.3 数据与算法契约（修正对方缺陷）

- 规则按 `series_type`（rate / yield / fx / inflation_yoy / pmi / labor / growth_yoy / liquidity_yoy / risk）类型化派发，汇率永远不会命中利率规则（对应 B03）。
- 输出 `score[q]`、`coverage`（有效权重占比）、`margin`（第一与第二差距）三者分开展示；归一化得分不称为概率（对应 4.3）。
- 每次规则变更 bump `methodology_version`；历史快照只能用当时版本重放。
- 文案由确定性规则从数字生成（"本窗口相关为正，解释力有限"），LLM 解释绑定 `snapshot_id` 并经后置校验（对应 B04、B05）。
- 时间三分：数据期 / 可得时间 / 入库时间；FRED 用 ALFRED vintage 做历史可得性。
- 新鲜度由发布日历驱动，页面显示"数据期 + 最近成功同步时间 + fresh/stale/missing"状态（对应 B01、B13）。
- 资产最新值必须来自同一序列的最后一个观测，禁止独立手填（对应 B02）。
- 同一概念一个 ID：`DXY`（ICE）与 `DTWEXBGS`（广义）分别命名、不互称（对应 B10、B14）。

持久化沿用 `REPORT.md` 9.3 的最小模型（`data_providers / macro_series / macro_observations / macro_snapshots / macro_regime_results / macro_events / analysis_runs`），落在现有 Supabase/Postgres。

### 11.4 图表实现建议

对方宏观页用服务端内联 SVG，优点是首屏无 JS 依赖、SEO 友好，缺点是 2.27 MB 页面且无交互。OsbornAlpha 仓库目前唯一图表库是 `lightweight-charts` 4.2（`src/components/KlineChart.tsx`，运行时读 CSS 变量取色），没有 Recharts / d3，也没有 sparkline 组件。建议：

- 概览页服务端只下发快照摘要（< 50 KB），指标详情按需加载 120–600 点序列。
- 指标时序图用 `lightweight-charts` 的 LineSeries + `createPriceLine`/背景区间（周期色带）+ marker（事件标记）；它已能跟随 `--up/--down/--accent` 变量，天然适配深浅主题。
- 迷你走势（表格行内 sparkline）、象限概率条、热力图、散点回归这几类小图用轻量内联 SVG（纯 React，无依赖），放在 `src/components/macro/charts/`，逻辑拆到可测的 `.ts` 模块（仓库 vitest 只跑 `src/**/*.test.ts`）。
- 所有图表提供表格等价视图（`DESIGN.md` 的密度要求与无障碍）。

### 11.5 OsbornAlpha 现状差距（代码勘察，2026-11-04）

| 维度 | 现状 | 对克隆的含义 |
|---|---|---|
| 宏观功能 | 仅 `src/components/today/MacroGlance.tsx`，读 `MOCK_DATA.macro`（`src/lib/data/mock.ts:60-68`），标注 `TODO(P5)` | P1 的最小闭环就是用真实 snapshot 替换它 |
| 数据适配器 | `src/lib/data/sources/` 有 datagateway / eastmoney / sina / tencent / tushare / eodhd / twse，**没有** FRED、AKShare、Yahoo；`docs/ARCHITECTURE.md:115` 只有一行"宏观 \| Akshare \| — \| FRED"规划 | 需新建 `src/lib/macro/providers/{fred,cn-stats,datagateway-series}.ts`；DataGateway 当前只有证券日线契约（`POST /v1/market-data/security-prices/history/query`），宏观序列能力待向 Wind 适配层确认 |
| 时序存储 | 无 kline / quote / macro 表；K 线实时拉取（`src/app/api/kline/[ticker]/route.ts`） | 需新增迁移 `supabase/migrations/YYYYMMDDHHMMSS_macro_series.sql`（RLS：公共只读参考数据，参考 `financial_history` 的 public-read 策略） |
| 定时任务 | `vercel.json` crons + `authorizedCronRequest(CRON_SECRET)` + `?preview=1` 模式（`src/app/api/cron/daily-radar/route.ts`） | 新增 `api/cron/macro-sync`，按发布日历而非固定频率重试 |
| 校验 | 无 zod；研究链路用 `ajv` | 指标 catalog 与 provider 响应用 ajv schema 或手写校验，与仓库一致 |
| UI 基础 | 自建 `src/components/ui/{Button,Card,Panel,Metric,Tag,variants.ts}`，无 shadcn；tokens 在 `src/app/globals.css`；`[data-density="data"]` 密度层；`data-color-scheme="cn|us"` 涨跌色 | 象限卡、指标表、来源行全部用这些原语；`DESIGN.md` 禁止紫色、渐变文字、发光和 ≥8px 圆角，对方的紫色 AI 浮钮与四色象限卡不照搬 |
| 导航 | `src/components/TabBar.tsx` 的 `TABS` 数组（navKey ∈ today/watchlist/intel/portfolio/analyst/tools/settings） | 宏观放在 `intel` 下作二级入口，不新增底栏 tab |
| i18n | `messages/{zh,en}/*.json`，域需在 `src/i18n/request.ts` 的 `MESSAGE_DOMAINS` 注册，有 zh/en 对等测试 | 新建 `messages/{zh,en}/macro.json`；对方站点仅中文，我们必须双语 |
| 权限 | `middleware.ts` 公共路径白名单 + Supabase session；研究 API 走 `requireResearchUser()`（admin） | 宏观概览面向全部登录用户；研究解释/分析任务按 plan 配额（`src/lib/billing/quota.ts`） |
| LLM | `resolveUserLlm` → `runMeteredLlmCall`（`src/lib/billing/metered-llm.ts`）；输出落 `ai_runs` / `artifacts` | 解读文案走同一计量链；绑定 `snapshot_id` 存入 `ai_runs` |
| 文档约定 | `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md` → `docs/superpowers/plans/` | 下一步产出 `2026-11-xx-macro-workbench-design.md` |

### 11.6 分期

1. **P0 数据契约**：series catalog（US 8 + CN 10 + 资产 12），FRED 与 DataGateway 覆盖盘点，原始快照与 hash。
2. **P1 宏观纵向闭环**：观测入库 → 规则判定（类型化）→ `/intel/macro` 概览 + 指标详情 + 来源抽屉 → `MacroGlance` 替换 Mock。
3. **P2 关联与事件**：`macro_events` 表、周期分段算法（由事件表而非手工区间生成）、关联工作台四种模式。
4. **P3 传导与历史**：情景图、热力图、FOMC 周期资产表（三种边界）。
5. **P4 解释层**：LLM 解读绑定 snapshot，偏差案例库，月度复盘流程。

工作量参考 `REPORT.md` 12.1（A+B 约 13–20 人日）。

---

## 12. 附录：抓取证据（会话临时目录，不入库）

`/private/tmp/claude-501/-Volumes-AIMATE-WORK-Developer-CodeX-OsbornAlpha/de27b227-105c-47da-849b-0da1b2d1aa46/scratchpad/chaos/`

- `macro-strategy.html`（2,268,078 B）与解析出的 `macro_rsc.txt`（1,171,218 字符）
- `cycle-asset-table.html`（21,387 B）
- `home.html`、`benchmark.html`、`industry-data.html`、`monitor.html`、`industries.html`、`competition.html` 等
- `js/`、`js2/`：公开 chunk（库扫描：macro 页无 recharts；其他页 recharts 83 处；`/api/chat`、`/api/research-reports`）
- 浏览器截图 4 张（大盘、DFF 指标卡、拟合分析、传导链）保存在会话 tool-results 目录

页面随时可能更新；复核时先对比 `fetched_at` 与页头"数据更新"时间。
