# Stitch 2.0 Per-Screen Prompts

> Ready-to-paste prompts for generating each Stock Monitor v2 surface in Google Stitch.
> **Prerequisite:** Project has [`DESIGN.md`](./DESIGN.md) loaded as design context.
>
> **Workflow per screen:**
> 1. Open the project in [labs.google.com/stitch](https://labs.google.com/stitch)
> 2. New screen → paste the prompt below
> 3. Iterate with `"Adjust per DESIGN.md §<section>"` follow-ups
> 4. Export → React + Tailwind code → drop into `src/app/<route>/page.tsx`

---

## Screen 1 — Home (`/`)

```
Generate the Home / Landing screen per DESIGN.md.

Layout: asymmetric two-column hero (60/40 split), NOT centered.

LEFT (60%): Inline-glyph headline:
  "Track 茅台 [ticker-chip] across A · H · US,
   one [chart-glyph] morning note at a time."
- Small ticker chips ("600519.SH" in Geist Mono, brass border, 10px) embedded
  inline within the headline as if they were typography.
- A miniature 30-day sparkline glyph embedded inline at type-height.
- Subhead: "个人股票池每日 AI 监控 · 5000 积分 Tushare + 4 源行情级联 + 9 人格 AI 委员会"
- Single primary CTA: "进入股票池 →" (Distressed Brass fill).
- No "Learn more" secondary link.

RIGHT (40%): A "Market Pulse" card — Card Pewter fill, 8px radius.
  - Top: "今日市场" caption
  - 3 index rows: 上证指数 / 恒生指数 / 纳斯达克 — each with name (Bone White 13px),
    value (Geist Mono 15px), pct change (signed, Pulse Red/Green Geist Mono 12px)
  - 3 mini sparkline rows (canvas-rendered, 60px wide, 24px tall, 1px stroke Distressed Brass)

BELOW HERO (full width): Horizontal-scroll strip of "Today's radar" mini-cards.
  - 6 cards visible (overflow scrolls), 200px wide each, 8px gap
  - Each card: ticker badge + name + score + level emoji (🔴/🟡/⚪️) + headline
  - Hover lifts to Hover Lift surface

FOOTER: minimal — "© 2026 Stock Monitor · 本站仅作决策辅助，不构成投资建议"
in Distant Fog 11px, left-aligned.

Theme: dark (default). Viewport: 1440×900 desktop primary, also generate
a 375×812 iPhone variant where the two-column hero collapses to single column.

Strictly avoid:
- Centered hero
- "Scroll to explore" or bouncing chevrons
- Emojis in CTAs or section headers (signal emojis 🔴🟡⚪️ in card content OK)
- Purple/neon accents
```

---

## Screen 2 — Watchlist Kanban (`/watchlist`) [PRESERVED PARADIGM]

```
Generate the Watchlist Kanban screen per DESIGN.md §4 "Kanban Columns" + "Stock Card".

This is the SIGNATURE screen — preserve the Kanban paradigm exactly.

TOP BAR (sticky, 56px tall):
- Page title "📋 股票池" — actually no emoji in chrome; use line-art icon
  from §4 + "股票池" label, Bone White 18px weight 600
- Right side: 3 ghost-button icons — search · import · export

KANBAN ROW (below top bar, horizontal scroll, snap):
- 3 default columns:
   1. 长期持有 (Long-term Hold) — 5 cards
   2. 机会跟踪 (Opportunity Watch) — 6 cards
   3. 仅观察 (Watch Only) — 4 cards
- Column width: min(85vw, 320px); 12px gap between columns
- Column header: name (Bone White 14px 600) + ticker count chip (Pewter Steel
  Geist Mono in pill) + ⋮ icon (line-art ghost button)
- Column body: 8px vertical stack of stock cards
- At bottom of each column: "+ 加入股票" ghost button
- At end of row: "+ 新增看板" slot (dashed Whisper Border)

STOCK CARD CONTENT (use realistic A/H/US tickers):
- 长期持有 column cards:
   00700.HK 腾讯控股   HK$454.60   +1.20%
   AAPL 苹果           $297.84    +1.10%
   600519.SH 贵州茅台  ¥1325.91   +0.22%
   BRK.B 伯克希尔      $487.20    +0.50%
   GOOGL Alphabet     $185.30    -0.30%
- 机会跟踪 column cards:
   NVDA 英伟达         $225.32    -4.42%
   300750.SZ 宁德时代  ¥411.16    -0.11%  [yellow-left-bar — radar 🟡 留意]
   09988.HK 阿里巴巴   HK$104.50  +2.10%
   002594.SZ 比亚迪    ¥94.95     +1.49%
   META Meta          $625.10    +0.80%
   PDD 拼多多          $98.40     -1.20%
- 仅观察 column cards:
   TSLA 特斯拉         $409.99    -4.75%
   COIN Coinbase      $245.30    +3.20%
   PLTR Palantir      $76.50     +2.10%
   688981.SH 中芯国际  ¥115.48    +0.95%

Each stock card per DESIGN.md §4 "Stock Card":
- 4-row tight stack inside 10px padding, 8px radius, Card Pewter fill,
  1px Whisper Border, hover lifts to Hover Lift
- Row 1: market badge (A股/港股/美股) + company name (Bone White 14px 600) + ⋮ menu
- Row 2: ticker (Geist Mono 11px Distant Fog)
- Row 3: price (Geist Mono 15px 500) — right-aligned — + signed pct (Geist Mono 13px, Pulse Red/Green)
- Optional Row 4: signal chips for actionable cards (only on 300750.SZ here)

300750.SZ in 机会跟踪 should have a 2px Pulse Amber left-edge bar (radar 🟡 留意)
and a "近 30 天 30 次进入北上前十" signal chip below the price row.

Theme: dark. Viewport: 1440×900 + 375×812. On mobile, columns horizontally scroll-snap.

Strictly avoid:
- Replacing Kanban with vertical list (paradigm protected)
- More than 8 visible cards per column (scroll for more)
- Decorative emojis on the cards themselves (the ⋮ menu glyph stays)
```

---

## Screen 3 — Radar (`/radar`)

```
Generate the Radar screen per DESIGN.md §4 "Radar Card".

LAYOUT: single-column vertical stack of radar cards, sorted by score descending.
Full-width within 720px max-width centered container (denser than watchlist).

TOP BAR:
- Title "雷达 · 2026-05-25" — Bone White 18px 600
- Subtitle "10 stocks · last refresh 09:02:11" in Pewter Steel 12px
- Right side: refresh ghost button (line-art icon rotates on click)

FILTER PILL ROW (8px below title):
- All (10) · 🔴 关注 (0) · 🟡 留意 (1) · ⚪️ 平静 (9)
- Active pill: Brass Wash background + Distressed Brass border
- Inactive pill: Whisper Border, Pewter Steel text
- The 🔴/🟡/⚪️ glyphs are SIGNAL emojis (PERMITTED in card content per DESIGN.md)

RADAR CARD STACK (use realistic content from PR #15 production data):

Card 1 — 🟡 留意:
  [Market badge: A股] 宁德时代  300750.SZ
  Score: +6 chip (Distressed Brass border)
  Level: 🟡 留意 label
  Price: ¥411.16  -0.11% (Pulse Green, signed)
  Top Call: "北上前十 #1 · 财报临近 T-7"
  Trigger chips:
    "近 30 天 30 次进入北上前十" (brass-border, weight +3)
    "最新北上排名第 1" (brass-border, weight +3)
    "财报临近 T-7" (brass-border, weight +3)
  Flows row: "🌏 北上：近 30 天 30 次前十 · 最新 #1 · 累计 412 亿"
  AI take pill (small italic): _🤖 AI: 北上稳态 #1 叠财报 T-7, 信号偏多, 关注公告窗口的 vol_
  Footer: source: eastmoney+tushare · [📝 完整 morning note] · [详情 →]
  2px Pulse Amber left-edge bar.

Cards 2-10 — ⚪️ 平静 (collapsed to one-line summaries):
  贵州茅台 600519.SH · ¥1325.91 +0.22% · score +3
  比亚迪 002594.SZ · ¥94.95 +1.49% · score +1
  美的集团 000333.SZ · ¥81.25 +0.44% · score 0
  完美世界 002624.SZ
  腾讯控股 00700.HK
  阿里巴巴 09988.HK
  苹果 AAPL
  英伟达 NVDA
  微软 MSFT
  谷歌 GOOGL

  ⚪️ cards: no left-edge bar, slightly less padding (8px), Pewter Steel
  ticker color, score chip Distant Fog when zero/negative.

Theme: dark. Viewport: 1440×900 + 375×812 mobile.

Strictly avoid:
- 3-equal-column grid for the radar cards (single column dense stack only)
- Spinning radar icon (gimmicky)
- "Loading…" plain text (use skeletal shimmer if needed)
```

---

## Screen 4 — Briefs Index (`/briefs`)

```
Generate the Briefs Index screen per DESIGN.md.

LAYOUT: calendar grid — 7 columns (M T W T F S S), 4 rows (last 4 weeks).
Each cell is a brief preview, square-aspect, click → /briefs/[date].

TOP BAR: "📰 简报历史 · 最近 28 天" — line-art icon, Bone White 18px 600

CALENDAR CELLS (use realistic data):
- Each cell:
   - Date (Geist Mono 11px Distant Fog) top-left
   - Headline (Bone White 12px 600) — truncated to 2 lines max
   - Level chip (🔴/🟡/⚪️) top-right
   - Hover lifts to Hover Lift surface + Active Border
- Empty cells (weekends with no brief) get dashed Whisper Border, Distant Fog "—"

LATEST WEEK SAMPLE CONTENT:
  Mon 2026-05-19  🟡  茅台分红 + NVDA 上调评级
  Tue 2026-05-20  ⚪️  市场平静，维持持仓
  Wed 2026-05-21  🟡  宁德北上 #2 + 美股 CPI 周三
  Thu 2026-05-22  🔴  阿里财报夜 · 高关注
  Fri 2026-05-23  ⚪️  无重大事件
  Sat 2026-05-24  ⚪️  周六休市
  Sun 2026-05-25  🟡  本周回顾 + 下周关注

BOTTOM (full width below calendar):
- "30 天信号命中率" stat row — 3 cards:
   命中率 70%  ·  总信号 20  ·  中/错 14/6
- Each card: small heading + big monospace number + caption

Theme: dark. Viewport: 1440×900 + 375×812 (mobile collapses to single column,
each day = one full-width card).

Strictly avoid:
- Sparkline chart inside each calendar cell (visual noise)
- Bright accent fills on cells (use border + chip only)
```

---

## Screen 5 — Brief Detail (`/briefs/[date]`)

```
Generate the Brief Detail screen per DESIGN.md.

LAYOUT: Magazine style. Full-width hero, then 2-column body on desktop.

HERO (full width, 280px tall, Elevated Charcoal background):
- Left-aligned, 80px padding
- Date "2026-05-25" Geist Mono 14px Pewter Steel
- Headline "🟡 留意 · 本周回顾 + 下周关注" Bone White clamp(2rem, 4vw, 2.5rem)
  600 weight, tracking -0.02em
- Subtitle: "AI 委员会综合信心 6.2/10 · 中性偏多 · 北上资金本周持续流入新能源"
  Pewter Steel 14px 400, max 65ch line length
- Right-edge (right-aligned, vertically centered):
  "上次更新 09:02 CST · 由 9 人格 AI 委员会撰写" Distant Fog 11px

BODY (max-width 1400px, 24px padding):

LEFT column (cols 1-8, ~66%):
  ## 📊 市场基调
  Three paragraphs (use realistic copy):
  "本周整体股市维持震荡，沪指收盘 3150 点附近，恒生 18750..."

  ## 📅 下周关注
  Bullet list of events from /api/calendar:
    - 周二 (5/26) 茅台股东大会
    - 周三 (5/27) 美股 CPI 数据
    - 周四 (5/28) 比亚迪 Q2 财报
    - 周五 (5/29) 限售解禁 — 宁德 12 亿股

RIGHT column (cols 9-12, ~34%):
  ## 🏆 Top 5 Picks
  Vertical list of 5 stock cards (smaller than radar cards, 100px tall each):
  Each shows: market badge + ticker + name + score + 1-line take
  Click → /stock/[ticker]

  1. 300750.SZ 宁德时代 · +6 · 北上 #1 + 财报 T-7
  2. 00700.HK 腾讯控股 · +4 · 财报夜 · 高关注
  3. 600519.SH 贵州茅台 · +3 · 北上稳态
  4. NVDA · +2 · GB300 出货早于预期
  5. 002594.SZ 比亚迪 · +1 · Q2 财报临近

FOOTER:
- Disclaimer: "本简报仅作决策辅助，不构成投资建议" Distant Fog 11px italic, centered

Theme: dark. Viewport: 1440×900 + 375×812 (mobile collapses to single column,
right column moves below left).

Strictly avoid:
- Pull-quote callouts with giant quote-marks
- "Estimated reading time: 3 minutes" copy
- AI clichés like "Elevate your portfolio"
```

---

## Screen 6 — Backtest (`/backtest`)

```
Generate the Backtest screen per DESIGN.md.

LAYOUT: data table with sticky header, sortable columns, expandable rows.

TOP BAR:
- Title "回测 · 60 天信号检验" line-art icon + Bone White 18px 600
- Filter pills: 60d · 90d · 180d · 1y (active pill: Brass Wash background)
- Right: sort dropdown (quality / hit_rate / signals / fwd5 / fwd20 / ci_lower)

TABLE (max-width 1400px, monospace numbers):
- Header row: sticky, Elevated Charcoal background, micro-label uppercase Pewter Steel
- Columns: ticker · name · #signals · hit_rate · avg_fwd5 · avg_fwd20 · CI_lower · quality
- Body rows: 14 stocks from watchlist
- Each row: 48px tall, 1px Whisper Border bottom divider
- Numbers: Geist Mono tabular, right-aligned for numeric columns
- Hit rate: progress-bar inline (small horizontal bar inside cell, brass fill for high, distant fog for low)
- Quality score: chip-style — brass-border for high (≥7), Whisper Border for mid
- Row hover: Hover Lift background
- Click row to expand inline: shows last 10 signal events with date + trigger + outcome (✓/✗)

SAMPLE DATA (top 5 rows):
  300750.SZ  宁德时代  28  78%  +1.2%  +3.4%  72%  9.1
  00700.HK   腾讯控股  22  64%  +0.8%  +2.1%  58%  7.4
  600519.SH  贵州茅台  15  73%  +0.5%  +1.4%  65%  6.8
  NVDA       英伟达    19  52%  -0.4%  +1.8%  44%  5.9
  002594.SZ  比亚迪     8  62%  +0.3%  +2.0%  48%  5.2

FOOTER: "Wilson 95% CI · 数据从 Tushare daily 拉取，60 日滑窗" — Distant Fog 11px

Theme: dark. Viewport: 1440×900 + 375×812 (mobile: table becomes vertically
stacked rows with priority columns only — ticker, hit_rate, quality).

Strictly avoid:
- Bright row striping (zebra) — use only hover lift
- Pie charts or donut charts (table communicates better here)
- Sparkline columns at this density (too noisy)
```

---

## Screen 7 — Stock Detail (`/stock/[ticker]`)

```
Generate the Stock Detail screen per DESIGN.md. Example ticker: 300750.SZ 宁德时代.

STICKY PRICE HEADER (top, full-width, 64px tall, Elevated Charcoal):
- Left: market badge "A股" + name "宁德时代" Bone White 16px 600 + ticker "300750.SZ" Geist Mono 12px Pewter Steel
- Center: price "¥411.16" Geist Mono 20px 500 + pct "-0.11%" Geist Mono 14px Pulse Green
- Right: "🟡 留意 · score +6" pill (Brass Wash background) + "刷新" ghost button

12-COLUMN GRID BELOW (max-width 1400px, 24px padding):

LEFT (cols 1-8, ~66%):
  K-LINE CHART CARD (450px tall):
   - Top: period pills "日" "周" "月" + "复权"
   - Body: candlestick chart (red up, green down per CN convention)
   - Volume bar at bottom (16% of card height)
   - Use Lightweight Charts aesthetic — minimal, no gridlines, monochrome
   - Crosshair on hover shows OHLCV tooltip in Geist Mono

  AI COMMITTEE CARD (below chart, ~400px tall):
   - Header: "🤖 AI 委员会 · 9 人格" + "更新于 2 分钟前" Distant Fog
   - 9 persona rows (compact):
      巴菲特   neutral  6.0/10  "估值合理但不便宜..."
      芒格     bearish  6.5/10  "在我的能力圈外..."
      林奇     bullish  7.5/10  "Tenbagger 候选..."
      索罗斯   bullish  7.0/10  "Reflexivity 还在加强..."
      达里奥   neutral  5.5/10  "宏观风险尚未完全反映..."
      ...4 more
   - Each row: persona name (Bone White 13px 600), stance (chip with color),
     confidence (Geist Mono), one-line take (Pewter Steel 12px, truncated to 1 line)

RIGHT (cols 9-12, ~34%):
  SIGNALS CARD:
   - "今日触发器" header
   - 6 signal chips stacked (per DESIGN.md trigger pill style)
   - Below: "雷达评分: +6"

  RESEARCH REPORTS CARD:
   - "近期研报" header
   - 3 broker rows: 中金 / 高盛 / 摩根士丹利
   - Each: broker name + date + rating chip + target price (Geist Mono)

  CALENDAR CARD (the new one from PR #15):
   - "未来 14 天" header
   - Timeline-style list:
     T-7  📊 财报披露 (2026-06-01)
     T-3  💰 除权除息 ¥0.5/股
     T+7  🔓 限售解禁 12 亿股
   - Icons line-art (NOT emoji-rendered), each line item 24px tall

BELOW (full-width, two 50/50 cols):
  FINANCIALS TABLE: 5-year table (revenue, net income, ROE, gross margin)
  HOLDERS TABLE: top 10 holders with hold_ratio progress-bar inline

Theme: dark. Viewport: 1440×900 + 375×812 (mobile: full single column,
chart full-width, signals/perspectives below, financials at bottom).

Strictly avoid:
- Floating sticky "Buy" button (this app does NOT execute trades)
- Star ratings (use confidence numbers)
- "More research →" buttons that lead nowhere
- TradingView-style cluttered toolbars
```

---

## Screen 8 — Settings (`/settings`)

```
Generate the Settings screen per DESIGN.md.

LAYOUT: 2-column on desktop, single column on mobile.

LEFT (cols 1-3, ~25%): nav sidebar
- "设置" Bone White 18px 600 header
- Section list (vertical stack):
   账户 · 通知 · 数据源 · 外观 · 隐私 · 关于
- Active section: Brass Wash background + Distressed Brass left-edge 2px bar + brass text
- Inactive: Pewter Steel text, hover → Bone White

RIGHT (cols 4-12, ~75%): content for selected section.

Generate the DEFAULT view = "数据源" section selected:

  DATA SOURCES PANEL:
   - "行情数据源" section header (Bone White 16px 600)
   - 4 source cards stacked vertically, each:
      [✓] Eastmoney (push2delay)  ·  HK + US 行情主源  ·  latency ~120ms · 状态: ✅
      [✓] 新浪 (hq.sinajs)         ·  A 股 fallback  ·  latency ~180ms · 状态: ✅
      [✓] 腾讯 (qt.gtimg)         ·  A 股 fallback  ·  latency ~150ms · 状态: ✅
      [✓] Tushare Pro              ·  基本面 + 资金面  ·  5000 积分 · 状态: ✅
     Each card: checkbox (brass when on) + source name (Bone White) + role + latency badge

   - "AI 模型" section:
      DeepSeek V4 Flash  ·  默认 LLM 路由  ·  token 消耗 12.4k/月  ·  $0.04 估算
      [配置 API Key →] ghost button

   - "推送渠道" section:
      Telegram Bot  ·  ✅ 已连接 @osborn_stock_bot  ·  chat_id 已配置
      Resend 邮件   ·  ✅ 已连接 · 目的地 gilberthello@gmail.com
      [配置 →] ghost buttons for each

Theme: dark. Viewport: 1440×900 + 375×812 (mobile collapses left nav into
top dropdown; right content full-width below).

Strictly avoid:
- Toggle switches with sliding animations on hover (subtle press only)
- "Premium / Pro" upgrade banners (this is a personal app)
- Confirmation modals for every setting change (only destructive ones)
```

---

## Workflow Tips

1. **Generate in dependency order:** Home → Watchlist → Radar → Brief Detail → Stock Detail. Settings and Backtest are isolated; do those last.
2. **Always specify viewport:** Stitch generates differently for 1440×900 vs 375×812. Generate both for mobile-critical screens.
3. **Reference DESIGN.md sections explicitly** in follow-up prompts: "Adjust per §4 'Stock Card'" beats vague "make the cards better".
4. **Iterate on color first**, then typography, then spacing. Colors propagate via the design context once locked in.
5. **Export as React + Tailwind** if Stitch offers it; the existing codebase is Next.js + Tailwind so the integration is straightforward.
6. **Compare against current production:** [stock-monitor-nu.vercel.app](https://stock-monitor-nu.vercel.app) — many of the layouts already work; the goal is *visual elevation*, not rebuild.

## After Stitch Generation — Implementation Path

1. Pick 1 screen to integrate first (recommend: `/watchlist` since Kanban is the signature)
2. Compare Stitch output side-by-side with current `src/app/watchlist/page.tsx`
3. Adopt the new design tokens (colors, fonts) via `src/app/globals.css` first — this propagates everywhere
4. Then update component-level JSX/Tailwind classes per screen
5. Ship behind a feature flag (`?design=v2` query param or `NEW_DESIGN=1` env) to A/B test before defaulting
