<!-- 16_CONTENT_OPERATIONS.md · osbornalpha 内容/简报运营（每日简报生成与调度、编辑标准、本地化、推送渠道） · 最后更新 2026-06-20 -->

# 16 · 内容与简报运营

> 以 `vercel.json`、`src/app/api/cron/*`、`src/lib/brief/*` 真实代码为准。

## 16.1 调度（Vercel Cron）

`vercel.json` 定义两个 cron（UTC）：

```json
{ "path": "/api/cron/daily-radar", "schedule": "0 0 * * *" }   // 00:00 UTC = 08:00 CST
{ "path": "/api/cron/daily-brief", "schedule": "30 0 * * *" }  // 00:30 UTC = 08:30 CST
```

雷达先发（08:00 CST），简报随后（08:30 CST），均受 Vercel 60s 函数时限约束。鉴权：请求头 `Authorization: Bearer ${CRON_SECRET}`（若设置）。

## 16.2 每日雷达 `/api/cron/daily-radar`

文件 `src/app/api/cron/daily-radar/route.ts`。逐股 morning radar digest：

1. `buildRadarDigest(DEFAULT_WATCHLIST)` 生成每股雷达载荷（score、triggers、flows、calendar、fundamentals）。
2. 同时渲染 **Markdown**（Telegram）+ **HTML**（Email）。
3. 若 `LLM_DIGEST_TAKE=on`，对 🔴/🟡 个股跑 `buildDigestTakes()` 委员会一句话，累加 `total_llm_cost_usd`。
4. 推送：Telegram（`sendTelegram()`，`autoSplit:true` 应对 4096 字上限）+ Email（Resend）。

调试参数：`?preview=1`（返回 JSON 不发送、跳过鉴权）、`?force=1`（绕过鉴权立即发送）。

## 16.3 每日简报 `/api/cron/daily-brief`

文件 `src/app/api/cron/daily-brief/route.ts`。全市场 morning note + AI 委员会共识：

1. `generateDailyBrief(DEFAULT_WATCHLIST, { topN: 5 })`。
2. 对 topN 个股：Eastmoney 行情 + Tushare 补充（A 股）→ `computeTriggers()` → 9-persona 委员会并行（DeepSeek/Claude）→ 由 perspectives 算共识分。
3. 生成 **Top Call** 头条（LLM 1–2 句）与 **Trade Ideas**（`confidence≥7` 高信念项）。
4. 推送 Telegram + Email；邮件标题 `Sentinel Morning Note · ${date}`。

返回体含 `date / subject / overall_confidence / overall_label / top[] / duration_ms / channels`。

## 16.4 编辑标准（`composer.ts` morning-note 规则）

`MORNING_NOTE_DOCTRINE`（作为 LLM system prompt）核心：

- **数据来源 hierarchy**：优先 MCP / 已验证数据（Tushare、东方财富、FRED、EDGAR）；严禁把网络搜索当主数据源。
- **合规话术**：严禁「建议买入/卖出/必涨/明天会涨」，改用「信号偏多/偏空/中性」「注意力优先级」。

**双保险合规替换** `COMPLIANCE_REPLACEMENTS`（成文后正则兜底）：`建议买入→信号偏多`、`建议卖出→信号偏空`、`推荐买入→注意力优先级偏多`、`必涨→上行概率较高` 等 9 条。即便 LLM 越界，成文也会被校正回合规话术。

雷达 morning note 段落结构（`stock-daily-radar` / `radar-digest.ts`）：Top Call / Price / Capital Flows（A 股）/ Events / AI Committee / Our Take / Action（`信号偏[多/空/中性] · 关注级别[高/中/低]`），目标 2 分钟可读。

## 16.5 默认观察池

`composer.ts` 的 `DEFAULT_WATCHLIST`（A + HK + US 混合）：`600519.SH 贵州茅台`、`002624.SZ`、`002594.SZ 比亚迪`、`300750.SZ 宁德时代`、`00700.HK 腾讯`、`09988.HK 阿里巴巴`、`AAPL`、`NVDA`、`MSFT`、`GOOGL`。所有内容运营默认基于此池，API 端可经 query param 覆盖。

## 16.6 语言与本地化

- 默认语言 `zh`（`briefs.language` 默认 `'zh'`；`user_preferences.language` 默认 `'zh'`）。
- 颜色方案 `user_preferences.color_scheme`：`'cn'`（红涨绿跌，默认）/ `'us'`（绿涨红跌）。前端经 `<html data-color-scheme>` + `localStorage['color-scheme']` 持久化（详见文档 17）。
- 简报落库唯一约束 `(user_id, brief_date, language)`，支持同日多语种。

## 16.7 Per-user vs 共享内容

- **共享/系统级**：当前两个 cron 均针对 `DEFAULT_WATCHLIST` 生成（系统级简报），经 Telegram/Email 推送。
- **Per-user 基础设施已就绪但 cron 未接线**：`briefs`/`stock_signals`/`perspectives` 均带 `user_id` + RLS；新用户注册触发 `handle_new_user()` 自动建默认 watchlist + user_preferences + profile；`user_preferences` 含 `daily_brief_time`（默认 08:30）、`timezone`（默认 Asia/Shanghai）、`telegram_chat_id`、`email_notifications`。逐用户简报生成尚未接入 cron。

## 16.8 成本与可观测

每条 digest take 带 `est_cost_usd`，cron 汇总 `total_llm_cost_usd`；简报落 `briefs.total_cost_usd` 与 `duration_s`，`status` 默认 `'success'`。LLM 失败走 `skipLLM` 降级（仅行情/信号）；cron 失败跨 Telegram + Email 告警。

## 16.9 与既有事实的差异

- cron 路径为 `daily-radar` 与 `daily-brief` 两条（非单一 daily-radar）；雷达 08:00 CST、简报 08:30 CST。
- per-user 简报调度尚未接入 cron（仅系统级 DEFAULT_WATCHLIST）。
- radar-digest HTML 邮件中涨跌色目前为固定 `#d33/#3a3`，尚未完全跟随用户 `color_scheme`（见文档 17）。
