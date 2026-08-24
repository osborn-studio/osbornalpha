# P3 今日板块 /today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** `/today` 晨间工作流一屏（雷达优先级流 + 持仓速览 + 宏观速览 + AI 简报 + 盘前时钟），并把"首页"指向它。

**Architecture:** client page，四块数据各自独立加载（互不阻塞）：radar 走现有 `/api/radar/batch`（RadarPayload：radar_level red|yellow|white、headline、triggers、markdown），持仓速览复用 P2 的 `usePortfolio`+`portfolioSummary`+`useBatchQuotes`，宏观暂用 `MOCK_DATA.macro`（P5 数据分级时换真源——已知债务，标注），简报 `GET /api/brief/preview?skipLLM=true`（无状态即时生成）。盘前时钟是纯函数（TDD）。

**Scope (YAGNI):** `/dashboard` `/radar` `/briefs` 页面与 Tab **保留不动**（P6 统一 301+清理）；本期只把 🏠 首页 Tab、TopBar logo、middleware 登录跳转、landing CTA、error fallback 指向 `/today`。

**Verified facts:** RadarApiResponse `{radars: Record<ticker, RadarPayload|{error}>, order, generated_at}`；radar/batch 上限 25 tickers；DailyBrief `{markdown, top_call?, overall_confidence, overall_label, trade_ideas?}`；MacroLine 目前是 NewsSidebar 内部私有函数（不可复用，today 自建）；无现成 market-hours 工具。

---

## File Structure

- Create: `src/lib/today/clock.ts` + `clock.test.ts` — A 股交易时段判定（纯函数）
- Create: `src/components/today/RadarStream.tsx`（优先级流）、`PortfolioGlance.tsx`、`MacroGlance.tsx`、`BriefGlance.tsx`
- Create: `src/app/(app)/today/page.tsx`
- Modify: `src/components/TabBar.tsx`（home tab → /today，label 今日，emoji 🌅→首页图标不变或改日出）、`src/components/TopBar.tsx`（logo href）、`src/middleware.ts`（登录后跳转 /today）、`src/app/page.tsx`（CTA）、`src/app/(app)/error.tsx`（fallback）

---

### Task 1: 盘前时钟 (TDD)

`src/lib/today/clock.ts`：

```ts
export interface MarketPhase {
  phase: 'pre' | 'open' | 'lunch' | 'closed' | 'weekend';
  label: string;        // e.g. '盘前 · A股开盘还有 48 分钟'
}
export function aShareMarketPhase(now: Date): MarketPhase
```

规则（全部以 Asia/Shanghai 时间判定，用 `toLocaleString('en-US', {timeZone:'Asia/Shanghai', ...})` 或 Intl 提取 weekday/hour/minute）：
- 周六日 → weekend `'周末休市'`
- 工作日 <09:30 → pre `'盘前 · A股开盘还有 N 分钟'`（N=到 09:30）
- 09:30–11:30 → open `'盘中 · 午休还有 N 分钟'`
- 11:30–13:00 → lunch `'午休 · 下午开盘还有 N 分钟'`
- 13:00–15:00 → open `'盘中 · 收盘还有 N 分钟'`
- ≥15:00 → closed `'已收盘'`
（节假日不判——已知简化，注释说明）

测试 ≥6：pre/两段 open/lunch/closed/weekend，各断言 phase 与分钟数（构造固定 UTC Date，如周一 01:00 UTC = 北京 09:00 → pre 30 分钟）。

Commit: `feat(today): a-share market phase clock`

### Task 2: /today 页面 + 四组件

- **RadarStream**（'use client'）：props `{ tickers: string[] }`；内部 fetch `/api/radar/batch?tickers=…`（上限 25，slice）；按 red→yellow→white 排序；red/yellow 每项渲染紧凑行：`🔴/🟡 name headline`（下方 triggers.desc 小字 join ' · '，行右 change_pct 上色），white 折叠为一行 `⚪ 平静 N 只（展开）` 点击展开；每行点击 → `<Link href={'/stock/'+ticker}>`；空/加载态。**注意**：radar_level 到色的映射 red=🔴 yellow=🟡 white=⚪（红=关注，与红涨绿跌无关）。
- **PortfolioGlance**：复用 `usePortfolio` + `useDecisions({status:'open'})` + `useBatchQuotes`(持仓 tickers) + `portfolioSummary`；Panel(data-density) 内：总浮盈/今日(所有持仓 change_pct 加权可省——直接显示总浮盈与市值)/持仓数/未平决策数，链接 → /portfolio。
- **MacroGlance**：`MOCK_DATA.macro` 渲染 上证/恒生/纳指/美10Y/DXY 五行（照 NewsSidebar.MacroLine 的展示逻辑重写为独立小组件；文件顶部注释 `// TODO(P5): replace MOCK_DATA with live macro source`）。
- **BriefGlance**：mount 时 `fetch('/api/brief/preview?skipLLM=true')` → DailyBrief；渲染 `overall_label`+`overall_confidence` Tag、`top_call.headline`（有则）、前 2 条 trade_ideas 的 ticker+thesis 一行；「查看完整简报 →」链 /briefs；加载骨架 + 失败态（简报生成较慢，骨架必须有）。
- **page.tsx**：'use client'；顶部 `<h1>今日</h1>` + `aShareMarketPhase(new Date()).label`（useState+useEffect 每分钟 tick 刷新）；布局：`grid lg:grid-cols-[1fr_320px]`——左列 RadarStream（tickers 来自 `useWatchlist` uniqueWatchlistTickers + 持仓 tickers 合并去重），右列 PortfolioGlance / MacroGlance / BriefGlance 纵排。

Gates: tsc + build（ƒ /today）+ npm test 不回退。Commit: `feat(today): morning-flow board (radar stream + glances)`

### Task 3: 入口切换（小步）

TabBar home 条目 `{ id:'home', emoji:'🌅', label:'今日', href:'/today' }`（Icon 换日出线稿：圆+横线+光线）；TopBar logo href → /today；middleware.ts line~45 已登录访问 /login|/register 跳 `/today`；`src/app/page.tsx` 的「进入工作台」CTA → /today；`(app)/error.tsx` fallback → /today。`/dashboard` 本身不动。
Gates 同上。Commit: `feat(today): switch home entry to /today`

### Task 4: 验证 + 合并

build 路由表 + 156 测试 + Task 1 新增；auth 墙内页面生产验收（用户）。合并 push。
