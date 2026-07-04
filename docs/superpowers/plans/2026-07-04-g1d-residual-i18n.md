# G1d 残留页面 i18n 清扫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（三路 worktree 并行，G1b 同模式）。Governing spec: `docs/superpowers/specs/2026-07-03-g1-i18n-design.md`（G1b 车道规则原样适用）。

**Goal:** 清扫 G1b 漏网的全部用户可见中文硬编码（settings/briefs/backtest/radar/watchlist/error 壳层等 ~900 CJK 字符），G1 真正全站双语。

**Architecture:** 沿用 G1b 车道规则——`useTranslations`（client）/`getTranslations`（server）；GLOSSARY.md 术语强制；`{var}` 插值不拼接；**代码注释与 mock 数据值不动**；zh 文案原文照搬为 zh 键值（zh 渲染输出零变化）。新域 briefs/radar/watchlist 由协调者预注册（request.ts + 空 json），三代理零文件交集。

**Branch 布局:** 协调者先在 main 提交域预注册；三代理各自 worktree 内建分支 `feat/g1d-a|b|c`，完成后协调者顺序 merge。

**统一禁触:** `src/components/KlineChart.tsx`、`src/lib/brief/composer.ts`（他 session）；`src/app/design/page.tsx`（开发展示页，豁免）；`src/app/(app)/skills/page.tsx`（残留=内部类别码+注释，已有显示映射）；`src/app/api/copilot/loop.ts`（LLM 输入 prompt，G1c 策略=保持 zh）；`src/app/page.tsx` 行 72-74（mock 数据值）。

---

## T0（协调者）: 域预注册

- `src/i18n/request.ts` MESSAGE_DOMAINS 追加 `'briefs', 'radar', 'watchlist'`
- 创建 `messages/{zh,en}/{briefs,radar,watchlist}.json` = `{}`
- Commit 到 main: `chore(i18n): pre-register G1d message domains`

## Agent A — 设置页（域: settings）

**Files:** `src/app/(app)/settings/page.tsx`、`src/components/UsageToday.tsx`、`messages/{zh,en}/settings.json`

- 整页抽离（~248 CJK）：页题、卡片标题（账号/今日用量/升级 Pro/AI 模型/语言/时区/简报投递/Telegram 等）、表单 label、按钮、toast 文案（"✓ 设置已保存到本地"等）。既有 `settings.title/language/timezone/brief` 键沿用不重复造。
- UsageToday.tsx（4 CJK）用户可见部分抽入 settings.json（`usage.*`）。
- 注意该页 G2 刚改过：时区卡/简报卡已 i18n 化，别动它们的键，只补其余。
- AccountSettings/LlmSettings/UpgradeCard 组件**本 lane 不抽**（LlmSettings 属 W2 已部分处理；越界会撞 B/C？不会——但控制批量，列入报告残留清单即可）。
- Gates: tsc + npm test + zh/en json shape 一致。Commit: `feat(i18n): extract settings page + usage widget`

## Agent B — 简报与回测（域: briefs + tools）

**Files:** `src/app/(app)/briefs/page.tsx`、`src/app/(app)/briefs/[date]/page.tsx`、`src/app/(app)/backtest/page.tsx`、`messages/{zh,en}/briefs.json`、`messages/{zh,en}/tools.json`

- briefs 两页（~331 CJK）→ `briefs.*`；backtest 页（176）→ `tools.backtest.*`。
- 简报正文/雷达 markdown 是**数据**（生成器已 G1c 本地化）——页面壳层文案才抽，`<pre>{markdown}</pre>` 内容不动。
- 服务端组件用 getTranslations，client 用 useTranslations（先看各页 'use client' 与否）。
- Gates 同上。Commit: `feat(i18n): extract briefs + backtest pages`

## Agent C — 雷达/股票池/壳层 + flows 信号（域: radar + watchlist + errors + common + components + today）

**Files:** `src/app/(app)/radar/page.tsx`、`src/app/(app)/watchlist/page.tsx`、`src/components/WatchlistTable.tsx`、`src/components/WatchlistSidebar.tsx`、`src/components/SearchInput.tsx`、`src/components/today/RadarStream.tsx`、`src/app/(app)/error.tsx`、`src/app/global-error.tsx`、`src/app/not-found.tsx`、`src/app/(app)/loading.tsx`、`src/app/about/page.tsx`、`src/app/layout.tsx`、`src/app/(app)/portfolio/review/page.tsx`、`src/app/api/flows/[ticker]/route.ts`、对应 messages json

- radar 页（90，含 G2 留下的"生成"前缀）→ `radar.*`；watchlist 页+两组件（46）→ `watchlist.*`；SearchInput placeholder/空态（22）→ `components.search.*`；RadarStream（6）→ `today.*`；error/global-error/not-found/loading → `errors.*`；about+root layout metadata（60）→ `common.*`（layout 是 server metadata，用 getTranslations；global-error 渲染在 html 外层拿不到 next-intl context 时保持双语内联或 zh 原样并报告）。review 页（6）核查：数据值/注释不动，真 UI 文案入 `portfolio.*`。
- **flows 路由**（80 CJK）：仅两个 `error` 字符串 + 5 处 `desc` 信号描述是用户可见——按 G1c radar.ts 的内联 `Record<AppLocale,...>` 字典模式 + `getRequestLocale()` 处理（注释不动）。响应 shape 不变。
- Gates 同上 + `npm run build`。Commit: `feat(i18n): extract radar/watchlist/shell pages + flows signal descs`

## T5（协调者）: 合并 + 终审

- 顺序 merge A→B→C（域零交集应零冲突）；冲突时以 request.ts 预注册版本为准。
- 全量 gates: tsc / npm test / build / e2e（zh 输出零变化断言=e2e zh 用例不回归）。
- CJK 复扫：`grep -o "[一-鿿]"` 全站计数应只剩豁免清单（KlineChart/composer/design/skills 内部码/loop.ts/mock 值/注释）。
- 抽检 EN：/settings、/briefs、/radar、/watchlist、404 页 curl 或 e2e 快照无 CJK。
- merge main + push + 记忆更新（G1 彻底闭环）。
