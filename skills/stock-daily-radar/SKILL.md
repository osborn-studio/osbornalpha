---
name: stock-daily-radar
description: Per-stock daily morning note for any ticker in the Stock Monitor watchlist. Pulls quote / 北上 / 涨跌停 / 公告 / AI 委员会 perspectives, then composes a tight 2-minute-readable brief in the Anthropic equity-research morning-note format. Triggers on "每股雷达", "stock radar", "每股早报", "morning note for <ticker>", "刷新雷达", "auto brief".
---

# Stock Daily Radar — Per-Stock Morning Note

A focused per-ticker variant of the Anthropic `equity-research/morning-note` skill, adapted for Stock Monitor's data pipeline (A-share + HK + US).

## When to use

Use this skill whenever the user wants a tight, opinionated daily briefing on a **specific stock** (or batch of stocks from their watchlist). Distinct from the market-wide `daily-brief` which covers the whole portfolio in one note.

Triggers:
- "给我看 600519.SH 的雷达"
- "morning note for AAPL"
- "刷新我的持仓简报"
- "每股早报"

## Data sources (in priority order)

| Source | Endpoint | Cost | Coverage |
|---|---|---|---|
| Live quote | `GET /api/quote/{ticker}` | free (4-layer cascade) | A / HK / US |
| 资金面 (北上前十 + 涨跌停) | `GET /api/flows/{ticker}` | Tushare 5k 积分 | A-share only (公告 anns_d 需更高 tier 已跳过) |
| 信号 + 历史回测 | `GET /api/signals/{ticker}` | free | A / HK / US |
| AI 9-persona 观点 | `GET /api/perspectives/{ticker}` | DeepSeek tokens | A / HK / US |
| 基本面（5 年财报） | `GET /api/financials/{ticker}` | Tushare | A-share only |

**Always** call `/api/quote` first to confirm the ticker is live and resolve canonical name. Then fan out the other calls in parallel.

## Workflow

### Step 1: Resolve ticker

User input may be in any dialect — Wind `AAPL.O`, Sina `sh600519`, 同花顺 bare `600519`. The Stock Monitor backend normalizes automatically via `normalizeWindTicker`. Just pass the raw input to `/api/search?q=<input>` first if uncertain.

### Step 2: Gather data in parallel

```
Promise.all([
  fetch('/api/quote/' + ticker),
  fetch('/api/flows/' + ticker),       // A-share only — skip for HK/US
  fetch('/api/signals/' + ticker),
])
```

`/api/perspectives` is optional — call only when the user explicitly wants AI takes (it's the slowest + most expensive layer).

### Step 3: Score the day

A stock's "radar level" comes from three inputs:
- **Price signal weight** — sum of `triggers[].weight` from `/api/signals`
- **资金面 weight** — sum of `flows.triggers[].weight` (北上加仓 / n 连板)
- **Event weight** — +2 if any announcement today, +3 if earnings-tagged

Label:
- `≥ 8` → 🔴 **关注** (priority radar)
- `4–7` → 🟡 **留意** (watch)
- `< 4` → ⚪️ **平静** (quiet)

### Step 4: Compose morning note

Use the Anthropic equity-research morning-note format:

```
**[date] · [ticker] [name] · [radar label]**

**Top Call**: [one-line headline — what changed and why it matters]

**Price**: [价格] [涨跌幅] · 量比 [n]x · [若有] PE/PB

**资金面** (A-share only):
- 北上 5 日 [+/-X.XX 个百分点]
- [若 n 连板] N 连板 · 封单 X 亿

**事件**:
- [今日 / 明日 公告 标题]
- [财报临近 T-N]

**AI 委员会** (if perspectives loaded):
- 偏多 N / 中性 N / 偏空 N · 平均信心 X.X
- [若一致] 共识：...
- [若分歧] 分歧焦点：...

**我们的看法**: [2-3 句 opinionated take]
**操作建议**: 信号偏[多/空/中性] · 关注级别[高/中/低]
```

### Step 5: Output

- **For web UI** (`/radar` page): JSON payload from `/api/radar/{ticker}` is consumed by the React component
- **For CLI usage**: emit Markdown to stdout
- **For Telegram push**: convert to MarkdownV2 with proper escapes

## Compliance guardrails

Inherited from `MORNING_NOTE_DOCTRINE` in `src/lib/brief/composer.ts`:

- **Never** use "建议买入/卖出/必涨/明天会涨" — replace with "信号偏多/偏空/中性"
- All numbers must have a source + timestamp
- If data is unavailable, say "暂无数据" — never fabricate
- "No news is a valid morning note" — if quiet, say so
- Always end with: *本简报仅作决策辅助，不构成投资建议*

## Programmatic alternative

If invoking from another agent or skill, prefer the JSON endpoint over the markdown:

```bash
curl -s -b cookie.txt 'https://stock-monitor-nu.vercel.app/api/radar/600519.SH' | jq
```

Response shape:

```json
{
  "ticker": "600519.SH",
  "name": "贵州茅台",
  "as_of": "2026-05-21T15:00:00+08:00",
  "radar_level": "yellow",
  "score": 6,
  "headline": "茅台单日 +0.22%，北上 5 日加仓 0.42 pct；无重大公告",
  "sections": {
    "price": { "value": 1325.91, "change_pct": 0.22, "currency": "¥" },
    "flows": { "north_5d": 0.42, "limit_streak": 0 },
    "events": [],
    "perspectives_summary": null
  },
  "triggers": [...],
  "markdown": "**2026-05-21 · 600519.SH 贵州茅台 · 🟡 留意**\n\n..."
}
```

## Heritage / credits

- Format adapted from [`anthropics/financial-services` morning-note](https://github.com/anthropics/financial-services/blob/main/plugins/vertical-plugins/equity-research/skills/morning-note/SKILL.md) (Apache-2.0)
- Compliance language inherited from Stock Monitor's `MORNING_NOTE_DOCTRINE`
- Data layer powered by Stock Monitor's 4-source cascade + Tushare 5k 积分 endpoints
