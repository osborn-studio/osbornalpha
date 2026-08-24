<!-- 24_LIVE_WORKBENCH_UI_SPEC — osbornalpha 落地页 + 登录后各页 UI 规格（布局/面板/组件/状态/导航） — 最后更新 2026-06-20 -->

# 24 · 工作台 UI 规格（Live Workbench UI Spec）

> 术语以 [`00_TERMINOLOGY_CONSISTENCY.md`](./00_TERMINOLOGY_CONSISTENCY.md) 为准；旅程见 [`03_USER_JOURNEY_AND_USE_CASES.md`](./03_USER_JOURNEY_AND_USE_CASES.md)。
> 本规格直接对照 `src/app/` 与 `src/components/` 现有实现，不含未实现的设想。

## 0. 全局壳与主题

### 0.1 受保护壳（`src/app/(app)/layout.tsx`）

登录后所有页共用同一外壳，服务端组件，进入即鉴权（无 user → `redirect('/login')`）：

```
<TopBar />
<main className="mx-auto w-full max-w-[1600px] p-3 lg:p-4">{children}</main>
<TabBar />
```

- 顶部 `TopBar`（sticky）+ 底部 `TabBar`（fixed）夹住内容主区，最大宽 1600px。
- 几乎每个页面底部都渲染 `<Disclaimer />`。

### 0.2 主题 token（贯穿全站）

颜色全部走 CSS 变量：`--bg / --bg-elevated / --bg-card`、`--text / --text-dim / --text-muted`、`--accent / --accent-dim / --accent-wash`、`--border`、涨跌色 `--up`（红）/`--down`（绿）、`--warn`、立场色 `--bullish / --neutral / --bearish`。支持深浅主题（`ThemeToggle`）。等宽数字用 `--font-geist-mono`。

### 0.3 导航组件

**TopBar（`src/components/TopBar.tsx`，sticky 顶栏）**
- 布局：`sticky top-0 z-50 flex items-center gap-3 border-b bg-bg-elevated px-4 py-3`。
- 元素顺序：品牌 `osbornalpha`（链 `/dashboard`）· `<SearchInput />` · `<ThemeToggle />` · `ⓘ` 关于（链 `/about`）。

**TabBar（`src/components/TabBar.tsx`，fixed 底栏）**
- 布局：`fixed bottom-0 inset-x-0 z-40 flex border-t bg-bg-elevated`，含 `paddingBottom: env(safe-area-inset-bottom)`。
- 六个 tab（id / emoji / 文案 / href）：

  | id | emoji | 文案 | href |
  |---|---|---|---|
  | home | 🏠 | 首页 | `/dashboard` |
  | watch | 📋 | 股票池 | `/watchlist` |
  | radar | 🌅 | 雷达 | `/radar` |
  | briefs | 📰 | 简报 | `/briefs` |
  | backtest | 🧪 | 回测 | `/backtest` |
  | settings | ⚙️ | 设置 | `/settings` |

- 激活逻辑：`/dashboard` 仅精确匹配；其余按 `pathname.startsWith(href)`。激活 → `text-accent`，否则 `text-text-dim`。
- 设计 v2（`useDesignV2`）：激活态在 tab 顶边显示一条 accent 短杠，并用线稿 SVG 图标替代 emoji。

**SearchInput（`src/components/SearchInput.tsx`，TopBar 内）**
- typeahead：输入 debounce 250ms → `/api/search?q=`，`AbortController` 取消旧请求。
- 占位：`搜索代码或名称（⌘+K · 全 A/H/US · 如 完美世界 / AAPL / 600519）`；`⌘K`/`Ctrl+K` 聚焦。
- 左图标 loading 时 `⏳` 否则 `🔍`。
- 下拉状态：loading→`搜索中...`；无结果→`没有匹配结果`；有结果→每行 `[市场徽章 | 名称 + 代码·拼音 | →]`，键盘上下选择、回车跳 `/stock/{ticker}`；底部 `source: {source}`。

---

## 1. 落地页 `/`（`src/app/page.tsx`，公开）

唯一对陌生人开放的产品表面。`force-dynamic` 服务端组件，进入即判 `authed`（`auth.getUser()`）切换 CTA。

**布局（自上而下）**
1. **氛围层**：顶部 accent 径向辉光（`oa-glow` 7s 呼吸动画）+ 淡网格（mask 渐隐）。
2. **导航 header**（`max-w-6xl`）：品牌 `osbornalpha`；右侧 —— 未登录：`登录`（文字）+ `免费注册`（accent 实心）；已登录：`进入工作台`。
3. **Hero**（`lg:grid-cols-[1.1fr_0.9fr]`，元素带 `oa-reveal` 入场动画，`prefers-reduced-motion` 时关闭）：
   - 左：徽标条「A股 · 港股 · 美股 · 每日 AI 监控」；大标题「你的 AI 投资 **PM**」；副文案「选股、监控、决策，一个工作台搞定。每日 AI 简报、多位投资大师视角、信号雷达与历史回测。」；CTA（未登录 `免费注册 →` + `登录`；已登录 `进入工作台 →`）；脚注「登录后进入产品 · 数据按账户独立存储与隔离」。
   - 右：示例「今日 AI 简报」卡 —— 标题「今日 AI 简报」+ 徽章「置信度 7.8」；三行样例（00700.HK 腾讯 +2.4% / NVDA 英伟达 +1.1% / 600519 贵州茅台 −0.8%，涨红跌绿）；底栏「委员会观点：多数大师对核心持仓维持 中性偏多」。
4. **功能区**（4 卡，`lg:grid-cols-4`，hover 边框转 accent）：① 个人股票池 + 每日 AI 简报 ② AI 投资委员会 ③ 信号雷达 + 回测 ④ John Cameron · PM 决策。每卡线稿 SVG 图标 + 标题 + 说明。
5. **定价**（2 卡）：**Free ¥0**（个人股票池 / 每日 AI 简报 / 基础信号雷达，未登录有「免费开始」）；**Pro**（角标「即将上线」，价 `¥— / 月`，无限委员会 / 完整回测+数据导出 / John Cameron PM 决策，按钮「敬请期待」）。
6. **Footer**：完整免责声明 + `© 2026 osbornalpha` + `关于`（链 `/about`）。

**状态**：无 loading/empty/error（纯静态 + 服务端 authed 判断）。

---

## 2. 工作台 `/dashboard`（`src/app/(app)/dashboard/page.tsx`）

三栏工作台，`'use client'`，因用 `useSearchParams` 故整体包 `<Suspense fallback="加载中...">`。

**布局**：`grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr_300px]`
- 左 `aside`（280px，`order-2 lg:order-1`）→ `<WatchlistSidebar selectedTicker onSelect />`
- 中 `section`（`1fr`，`order-1 lg:order-2`，移动端排第一）→ `<StockCenterPanel ticker />`
- 右 `aside`（300px，`order-3`）→ `<NewsSidebar />`
- 底 `col-span-full` → `<Disclaimer />`

**选中态**：读 `?s=` 参数，缺省 `00700.HK`；`onSelect` 用 `router.replace`（`scroll:false`）回写 `s`。
**状态**：dashboard 自身仅 Suspense fallback「加载中...」；loading/empty/error 都在三个子面板内部。

### 2.1 WatchlistSidebar（左栏，`src/components/WatchlistSidebar.tsx`）
- props：`selectedTicker`、`onSelect`、`variant?='sidebar'|'page'`。
- 头：`Watchlist · {总数}`（loading 时尾随 `⏳`）+ `管理 →`（链 `/watchlist`）。
- 分组筛选 chips：`全部` + 每个看板名（激活 `bg-accent-dim`）。
- 列头网格 `[1fr_auto_60px_55px]`：`Symbol / Last / Trend / Chg%`。
- 行：`<button onClick=onSelect(t)>`，选中行 `bg-accent-dim/20 ring-1`；展示 名称+代码 / 价格（或 `—`）+ 市场标签 / `<Sparkline>` / 涨跌幅。
- 数据：`useBatchQuotes(allTickers, {refreshIntervalMs:30000})`，live 合并 `getStockOrStub` 兜底；初始 groups 读 `localStorage` 键 `stock-monitor:watchlist:v2`。
- 状态：无显式空/错态，无数据行直接跳过；loading 仅靠 `⏳`。

### 2.2 StockCenterPanel（中栏，`src/components/StockCenterPanel.tsx`）
- prop：`ticker`。`useQuote(ticker, {refreshIntervalMs:30000})` + `mergeStockData`（live 覆盖 mock）。
- 头卡：名称 + `代码 · 市场`；右侧状态指示 —— loading `⏳`；有 live `● 实时`（`live.delayed` 加「(15min 延迟)」）；error `⚠ {error}`；否则 `· {sourceLabel}`。
- 价格块：`price>0` 显示大价 + 涨跌 + 6 格 meta（开/高/低/昨/额/振）；否则 loading `⏳ 拉取实时报价...` 或 `⚠ 暂无报价数据`。
- 空守卫：merge 为 null → `⏳ 加载中...` 或 `未找到标的 {ticker}`。
- 六标签（横滚，激活 `bg-accent-dim`）：行情 / AI 观点 / 财报 / 新闻 / Sentinel / 股东。各标签状态见下表。

  | 标签 | hook | loading | empty | error | success 要点 |
  |---|---|---|---|---|---|
  | overview 行情 | useQuote | — | 无触发→「今日无显著触发信号」 | — | K 线 + 8 格指标 + Sentinel 信号块 |
  | ai AI 观点 | usePerspectives | `⏳ AI 委员会开会中…9 位…约 10-25 秒` | `⚠ 未生成视角` | 无 LLM key→配置引导块（DeepSeek/ANTHROPIC env） | 共识分 + 看多/中性/看空 分组 + 元信息 |
  | fundamentals 财报 | useFinancials | `⏳ 加载财报数据...` | `暂无财报数据`；`no-token`→提示加 TUSHARE_TOKEN | 同 empty | Tushare 多年表 + 最新指标卡（非 A 股提示仅覆盖 A 股）|
  | news 新闻 | （mock/stock）| — | `暂无近期研报` / `暂无新闻` | — | 研报行 + 新闻行（含 sentiment 徽章）|
  | signals Sentinel | useSignals(60) | `⏳ 跑 60 天 backtest...` | 「过去 60 天…没有触发任何信号」 | `⚠ {error}` | 5 StatCard + 最佳/最差 + 信号时间轴表 |
  | holdings 股东 | useHolders | `⏳ 加载股东数据...` | `暂无股东数据`；US/HK 各有「待接入」提示 | 同 empty | 十大股东 + 十大流通股东表 |

### 2.3 NewsSidebar（右栏，`src/components/NewsSidebar.tsx`）
- 纯 `MOCK_DATA` 渲染（无 live/loading/error）。四卡：**AI Committee**（信心 X/10 + 三色渐变进度条 + 标签）、**Top Priorities**（top5，名称+触发+星级）、**Macro**（上证/恒生/纳指/美 10Y/DXY）、**News Stream**（top5 各取 1 条新闻，含 sentiment 徽章）。

---

## 3. 股票池 `/watchlist`（`src/app/(app)/watchlist/page.tsx`）

看板（Kanban）页，`'use client'`。

**头部**：标题「📋 股票池」+ 副文「拖拽卡片在看板间移动 · 拖拽列头重排看板 · 每 60s 自动刷新」；内联状态 `⏳ 加载报价…` 或 `⚠ {n} 只行情拉取失败`；右侧按钮 `🔄 刷新` / `📥 批量导入` / `📤 导出`。
**访客横幅**（`!user && Supabase 已配`）：「👤 访客模式（数据存浏览器本地）」+ `登录` 链。
**看板区**：横滚 `flex gap-3 overflow-x-auto`，`scrollSnapType:'x mandatory'`；列宽 `min(85vw,300px)`，列内卡片。末尾「＋ 新增看板」磁贴（内联输入名 / 取消）。
**空态**（hydrated 且无 ticker）：「股票池是空的。点任意看板上的「＋ 加入股票」开始添加。」

- **KanbanColumn**：列头 `draggable`（拖拽重排），含拖柄 `⠿` + 名称 + 计数 + `✎` 重命名 + `×` 删除；视觉态 `isBeingDragged`(opacity-40) / `isColumnDropTarget`(ring) / `isDropTarget`(bg)；空列占位「拖拽卡片到此处 / 或点下方 + 加入」。
- **StockCard**：`draggable`；价格三态 —— 有价（价+涨跌）/ `⚠ 拉取失败` + `重试` / `— 加载中…`；`⋯` 看板菜单（移到看板 / `🗑 从股票池移除`）；名称链 `/stock/{ticker}`。
- **AddStockInline**：debounce 搜索 `/api/search`，键盘选择；占位「代码 / 名称（如 完美世界 / AAPL / 600519）」；无匹配可强制加入。
- **ImportDialog**：modal；看板名 / 粘贴 textarea / 文件上传（CSV/Excel ≤2MB）；解析预览（新增/重复计数 + token 列表）；按钮「导入 {n} 个到新看板」。
- **持久化**：登录→Supabase `watchlists/watchlist_items`；否则 `localStorage`。操作均有 toast。

---

## 4. 雷达 `/radar`（`src/app/(app)/radar/page.tsx`）

每股 morning note，`'use client'`，`GET /api/radar/batch?tickers=...`。

**头部**：「🌅 每股雷达」+ 副文「每只股一份 morning note · 由 stock-daily-radar skill 驱动（· 生成 {time}）」+ `🔄 刷新`（loading 时 `生成中…`）。
**状态**：
- error 横幅：`⚠️ {error}`（红）。
- 空态（无 ticker）：「股票池是空的。先去 📋 股票池 添加几只股票。」（链 `/watchlist`）。
- 过滤 pills（有 data）：`全部` / `🔴 关注` / `🟡 留意` / `⚪️ 平静`（各带计数）+ `⚠ {n} 只加载失败`。
- 列表：每 ticker —— 无条目 `⏳ 加载中…`；`'error' in r` → 红左边框卡 `⚠ {error}`；否则 `<RadarCard>`。
**RadarCard**：左边框按级别着色；头（市场徽章+名称+代码，链个股）+ 价格/涨跌 + `{emoji} {级别} · 评分 {±score}`；`Top Call: {headline}`；触发 chips（涨绿跌红）；北上/连板/公告一行摘要；底部「来源」+ `📝 完整 morning note`（弹 MarkdownModal，可复制）+ `详情 →`。

---

## 5. 简报 `/briefs`（`src/app/(app)/briefs/page.tsx`，服务端）

**列表页**：「📰 简报历史」；卡「📅 最近 30 天 ({n} 份)」每行链 `/briefs/{date}`，网格 `[日期 | 标题+摘要 | 信心 X | →]`；统计卡「📈 信号命中率（30 天）」三格（命中率 / 总信号 / 中·错）+ 脚注（v1.0 将真实回测）。当前用 `generateMockBriefList(30)`，无 loading/empty/error。
**详情页 `/briefs/[date]`**：返回链 + 「📰 {date} 简报」+ `prose` 卡（注意力优先级 Top3、券商研报摘要、宏观速递）+ 免责。当前为静态 mock。

> 真实简报结构（composer.ts 生成的 Markdown/HTML）见 [`21_REPORT_TEMPLATES_AND_OUTPUTS.md`](./21_REPORT_TEMPLATES_AND_OUTPUTS.md)；列表/详情页落库渲染为待办。

---

## 6. 回测 `/backtest`（`src/app/(app)/backtest/page.tsx`）

`'use client'`，`useBatchBacktest(tickers, days)`。

**头部**：「🧪 Backtest 排行榜」+ `天数` 选择（30/60/90/120）+ `🔄 重跑`（loading `⏳ 跑中`）+ 质量分说明段。
**状态**：
- loading（无 data）：「⏳ 并发跑 {n} 只股票的 {days} 天回测...通常 10-30 秒」。
- error：红卡 `⚠ {error}`。
- success：聚合 Stat 网格（覆盖/总信号/平均命中率/平均 5d）→ Headline 卡（🏆 命中率最高 / 💥 最低 / 📊 信号最活跃，链 `/?s={ticker}`）→ 市场 + 排序 pills → 排行表（#/标的/价格/质量分/置信下限/命中率/信号/5d/20d/最近，sticky 表头；筛空「此筛选条件下无数据」）→ 算法脚注。

---

## 7. 设置 `/settings`（`src/app/(app)/settings/page.tsx`）

`'use client'`，分区 `card-base`：
1. 「⚙️ 设置」标题。
2. **「👤 账号」→ `<AccountSettings>`**：未登录→「访客模式 — 数据存浏览器本地」（未配 Supabase 加警告，已配给「登录 / 注册」链）；已登录→邮箱 + 「套餐：Free/Pro · ID 前 8 位」+ 「登出」；改邮箱 / 改密码（≥8 位）；第三方绑定（google/github/apple，已绑显示「已绑定」+「解绑」，未绑「绑定」，至少留 1 种）。
3. 「🌐 语言」：🇨🇳 中文 / 🇺🇸 English (stub)。
4. 「📬 推送渠道」仅对服务端确认的 admin 显示；加载中与非 admin 完全不渲染。卡片说明 Email/Telegram 目的地由服务端管理且隐藏具体收件信息，只提供「发测试」与「立即生成并推送」，不提供 Chat ID、Email 或收件开关输入。
5. 「⏰ 简报投递」：显示固定计划及用户时区换算。

管理员异步动作只发送受限 `text/subject` 或默认 watchlist + `topN=5`，解析 API JSON 并 toast 成功/失败（如「✅ 测试消息已发送」「✅ 邮件已发送」）。

---

## 8. 个股 `/stock/[ticker]`（`src/app/(app)/stock/[ticker]/page.tsx`）

`'use client'`，`getStockOrStub(ticker)`；六标签：行情 / AI 观点 / 财报 / 新闻 / 研报(Sentinel 信号) / 股东持仓。

> 注：该独立路由页是 mock 驱动版（与 `/dashboard` 中栏的 live 版 `StockCenterPanel` 平行，标签集略有差异）。

**未找到**（`!stock`）：卡「未找到标的 {ticker}」+「本 demo 仅含有限的 mock 数据。回 首页 或 股票池」。
**头部**：名称 + `代码 · 市场` 徽章 + 收藏切换（`⭐ 已加入` / `+ 加入股票池`，写 `localStorage` 的 `机会跟踪` 组）；价格块（大价 + 涨跌 + 「15min 延迟」）+ 6 格 meta；横滚标签。
**标签内容**：
- overview：`📊 K 线（日）` + `📐 关键指标`（PE/PB/ROE/股息/市值/52 周高低/下次财报）+ `🎯 Sentinel 信号 · {score}/10`（无→「今日无显著触发信号」）。
- ai：「🤖 AI 委员会观点」空→「该标的视角辩论待生成。」+ 禁用「🔄 刷新观点（v0.3 实装）」；有→共识行 + 🟢看多/🟡中性/🔴看空 分组 + `<PerspectiveCard>`。
- fundamentals：「📅 财报日历」+（有年报时）「📊 5 年财务趋势」三 MiniChart + 「📄 财务摘要」表。
- news：「📑 券商研报 ({n})」（空「暂无近期研报」）+「📰 新闻动态 ({n})」（空「暂无最新新闻」）。
- signals：占位「该标的近 90 天信号回看待开发（v1.0）」。
- holdings：「🏛 13F 持仓变动（仅美股可用）」+ 数据源 `EDGAR 13F-HR`，US/非 US 占位文案不同。
- 底部 `<Disclaimer />`。

**PerspectiveCard（`src/components/PerspectiveCard.tsx`）**：左边框按 stance 着色（bullish/neutral/bearish）；头 = 大师名 + `信心 X/10` +（有 cites 时）证据强度徽章 `📊 {label}`（high/medium/low/unknown 配色 + tooltip 高/中/弱/未分类分布）；正文 summary；有 cites 时 `▸ cite:` 行逐条带分类 emoji。

---

## 9. 认证页族（公开，`src/app/{login,register,forgot-password,reset-password}`）

共用 `card-base` + `<Disclaimer />`，核心交互在 `AuthForm`。

| 页 | 标题 | 主要交互 | 关键状态 |
|---|---|---|---|
| `/login` | 👋 登录 osbornalpha | `<AuthForm mode=login>`（Google/邮箱密码）+ 内联魔法链接 | 「✓ 登录成功」→ 硬跳 `/dashboard`；「✅ 链接已发到…」 |
| `/register` | ✨ 注册 osbornalpha | `<AuthForm mode=register>` | 「✅ 确认邮件已发送到 {email}」 |
| `/forgot-password` | 🔑 找回密码 | 邮箱 → `resetPasswordForEmail` | 「✅ 重置链接已发到 {email}」 |
| `/reset-password` | 🔒 设置新密码 | 两次新密码 → `updateUser` | 「✅ 密码已更新」→「→ 用新密码登录」；过期提示 |

**AuthForm（`src/components/AuthForm.tsx`）**：OAuth 行（Google `G` / GitHub `⌨` / Apple）；分隔「或用邮箱」；邮箱 + 密码（≥8 位）；按钮「处理中… / 登录 / 注册」（缺字段或未配置时禁用）；未配置 Supabase 显示「⚠️ Supabase 环境变量未配置」；底部互链（注册/忘记密码 ↔ 已有账号？登录）。

---

## 10. 状态规范总表（跨页）

| 状态 | 通用表现 |
|---|---|
| loading | 文本 `⏳ …中…` 或按钮态（「生成中…/跑中/处理中…」），右上角小 `⏳` |
| empty | 居中卡片 + 引导文案 + 跳转链（如空池 → `/watchlist`）|
| error | 红色（`text-down`/红边框）卡或横幅 `⚠ {error}`；LLM 缺 key 给出 env 配置引导块 |
| 反馈 | `useToast()` 顶部短提示（`✓` 成功 / `✗` 失败）|
| 鉴权 | 受保护页未登录 → `redirect('/login')`（中间件 + 布局双层）|
