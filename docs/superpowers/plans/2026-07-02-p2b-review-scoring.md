# P2b 复盘评分 + 决策/持仓明细页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** hiphon-pm-track 产品化——决策事后评分（forward 5/20/60d、hit、信心校准），加 `/portfolio/review`、`/portfolio/decisions`、`/portfolio/positions` 三个子页。

**Architecture:** 纯评分函数（TDD）+ 按需刷新路由。**Spec deviation (documented):** spec §2 说 daily cron 回填，但代码库无 service-role 模式且 cron 不带用户会话（RLS 会拒写）；改为 `/portfolio/review` 页加载时 POST `/api/reviews/refresh`（用户会话内、RLS 安全、零新秘钥）。未来多用户时给同一核心函数套 cron+service key 即可。

**Key facts (verified):** `fetchEastmoneyKline(ticker, ...)` → `KlineBar {time,open,high,low,close,volume}[]`（src/lib/data/sources/eastmoney.ts:201）；`decision_reviews` 表已有 UNIQUE(decision_id)（可 upsert onConflict）；store 模式照 src/lib/portfolio/store.ts（requireUser + coerce mappers）。

---

## File Structure

- Create: `src/lib/portfolio/review.ts` + `review.test.ts` — 纯评分逻辑
- Create: `src/lib/portfolio/review-store.ts` — refreshReviews / listReviews（Supabase I/O）
- Create: `src/app/api/reviews/route.ts` — GET list + POST refresh
- Create: `src/app/(app)/portfolio/review/page.tsx` — 复盘页（汇总卡+校准表+评分表）
- Create: `src/app/(app)/portfolio/decisions/page.tsx` — 决策日志（状态过滤+取消）
- Create: `src/app/(app)/portfolio/positions/page.tsx` — 持仓+成交明细

---

### Task 1: 纯评分函数 (TDD)

`scoreDecision(d: Decision, bars: KlineBar[]): DecisionReviewDraft | null`

语义（测试锁定）：
- base = 第一根 `time >= decided_at 日期` 的 bar 的 close（决策日或次交易日收盘）；找不到 → null（太新/无数据）
- forward_Nd = bars[baseIdx+N].close 相对 base 的 pct；不足 N 根 → 该项 null；**5d 都不足 → 整体返回 null**（不出评分）
- direction: buy/add=+1，sell/trim/pass=−1，hold=0
- hit = direction≠0 且 forward_5d≠null ? (forward_5d × direction > 0) : null
- score = direction≠0 ? (forward_20d ?? forward_5d) × direction : null（保留 1 位小数）
- calibration_bucket = confidence==null ? null : `${min(floor(c/20),4)*20}-${min(floor(c/20),4)*20+20}`（100 归入 "80-100"）

测试用例（≥8）：base 定位（决策日恰有 bar / 决策日停牌取次日 / 全部早于决策 → null）；5d 不足 → null；20d/60d 不足 → 部分 null；buy 上涨 hit true；sell 下跌 hit true；hold → hit/score null 但 forwards 有值；100 信心 → "80-100"；null 信心 → null bucket。

Commit: `feat(review): pure decision scoring (forward returns, hit, calibration)`

### Task 2: review-store + API

`review-store.ts`：`refreshReviews()` — requireUser → 取该用户全部非 cancelled decisions + 现有 reviews → 需评分的（无 review 或 forward_60d 仍 null 且 decided_at 距今 <90 天）按 ticker 去重批量 `fetchEastmoneyKline(ticker,'D',120)` → scoreDecision → upsert（onConflict decision_id，带 user_id）。返回 `{ scored: number }`。`listReviews()` — 该用户全部 reviews（coerce numeric mappers，参照 store.ts 教训！forward_*_pct/score 是 numeric → 字符串）。

`/api/reviews/route.ts`：GET → `{reviews}`；POST → refreshReviews → `{scored}`。错误映射照 decisions 路由（401/500）。

Commit: `feat(review): on-demand review scoring store + API`

### Task 3: 三个子页（lean，全部 'use client'，复用 Panel/Metric/Tag/Button + data-density）

- **review/page.tsx**: 加载时 GET /api/decisions + GET /api/reviews，随后 POST refresh 再重取。汇总卡（已评分数/胜率/均5d/均20d）；校准表（按 bucket 分组：bucket、决策数、hit 率——信心 vs 实际的差距一目了然）；明细表（date/ticker/action/confidence/5d/20d/60d/hit ✓✗/score，行内 Tag 上色）。
- **decisions/page.tsx**: GET /api/decisions 全量；状态 Tab（open/executed/expired/cancelled/全部）；每行：date/ticker/action/thesis/confidence/target/stop/status；open 行给「取消」按钮（PATCH /api/decisions/[id] {status:'cancelled'}）。
- **positions/page.tsx**: usePortfolio + GET /api/trades；上半 positions 表（含已平仓行，closed 灰显），下半 trades 流水表（date/ticker/方向/价/量/费/关联决策）。
- 三页顶部同一条子导航：`驾驶舱 · 决策日志 · 持仓明细 · 复盘`（Link 行内组件即可，不新建组件文件）。

Gates: tsc + build（三条 ƒ 路由）+ npm test。Commit: `feat(portfolio): review/decisions/positions sub-pages`

### Task 4: 验证 + 合并

复盘页在本地被 auth 墙挡——依赖 build+tests；合并 push 后用户在生产验收（先录几条决策，5 个交易日后复盘页才有评分——首日看到"暂无可评分决策"是正确行为，页面需把这个空态写清楚）。
