# Design System: Stock Monitor v2 (Stitch-Optimized)

> Single source of truth for Google Stitch 2.0 screen generation. Defines the
> redesigned visual language for the Stock Monitor app while preserving the
> Kanban paradigm in the watchlist surface.
>
> **Feed this file into Stitch via:** [labs.google.com/stitch](https://labs.google.com/stitch) → New project → paste contents of this DESIGN.md into the project's design context → reference it from every screen prompt.

## 1. Visual Theme & Atmosphere

A **quiet-luxury trader terminal** — the digital equivalent of a Bloomberg desk that decided to also be at home in a SoHo loft. The atmosphere is **confident, restrained, and dense without being cluttered**. Information density sits at **7/10** (between balanced daily-app and Bloomberg cockpit), variance at **6/10** (asymmetric where possible, but the Kanban paradigm forces some symmetric grid), motion at **5/10** (number updates and drag feedback animate; nothing infinite-loops or shimmer-spins).

It is a tool for someone who watches their portfolio with discipline — not a casual app, not a hedge-fund war room. The interface feels like **a well-edited research note**: dense, opinionated, and free of the visual stuttering common to AI-generated dashboards.

The signature techniques that make it ours:
- **Mono-set numbers everywhere** — every price, percent, volume, score uses tabular-num monospace so columns align without padding hacks
- **Single brass accent** — desaturated gold/amber as the only chromatic moment; signal red/green and neutral grey otherwise
- **Kanban as primary navigation in watchlist** — horizontal columns, drag-and-drop, snap on mobile (preserved per user direction)
- **Inline-glyph headlines** — small ticker chips embedded inline within text, treated as typography ("Track 茅台 across A/H/US"), not as separate UI cards

## 2. Color Palette & Roles

### Surfaces (Dark — default)
- **Ink Charcoal** (#0a0a0b) — Page background. Slightly warmer than pure black; reads as "midnight ink" not "void"
- **Elevated Charcoal** (#141417) — Top bar, bottom nav, modal surfaces. +5% lift over base
- **Card Pewter** (#1c1c20) — Card and Kanban-column fill. +10% lift over base
- **Hover Lift** (#23232a) — Card hover state. +15% lift over base

### Borders & Dividers
- **Whisper Border** (rgba(255, 255, 255, 0.06)) — Card outlines, column dividers, 1px structural lines
- **Active Border** (rgba(202, 138, 4, 0.4)) — Focused inputs, selected cards, draggable target highlight

### Text Hierarchy
- **Bone White** (#fafafa) — Primary text, headlines, prices, key data points
- **Pewter Steel** (#a1a1aa) — Secondary text, descriptions, timestamps
- **Distant Fog** (#52525b) — Tertiary text, placeholders, "empty state" copy

### Accent (Single, Restrained)
- **Distressed Brass** (#ca8a04) — The ONLY chromatic accent. Used for primary CTAs, focus rings, active-tab indicator, selected-state outlines. Saturation ≈ 75%. Pairs with charcoal like brass hardware on dark walnut.
- **Brass Wash** (rgba(202, 138, 4, 0.12)) — Subtle accent fill for hover/selected backgrounds

### Signal Colors (CN convention — RED = up, GREEN = down)
- **Pulse Red** (#e11d48) — Price up, bullish, high-priority alert
- **Pulse Green** (#16a34a) — Price down, bearish, success state
- **Pulse Amber** (#eab308) — Neutral, warning, mid-priority signal

### Light Theme (Secondary — supported but not primary)
- **Paper White** (#fafaf9) — Page background
- **Surface Cream** (#f5f5f4) — Card fill
- **Ink Charcoal** (#0a0a0b) — Text inverted

### Banned
- ⛔ Pure black `#000000` — always use Ink Charcoal `#0a0a0b`
- ⛔ Purple / violet / indigo accents (the "AI Purple" cliché)
- ⛔ Neon outer-glow shadows on any element
- ⛔ Gradient fills on text headers
- ⛔ More than one chromatic accent. Brass is it. Red/green are functional, not decorative.

## 3. Typography Rules

### Type Stack
- **Display + Body Sans:** `Geist` (700/600/500/400) — Designed by Vercel; track-tight at large sizes, exceptional legibility at small sizes. Falls back to `-apple-system, "PingFang SC", "Microsoft YaHei"` for CJK
- **Numeric & Code:** `Geist Mono` (500/400) — All prices, percentages, volumes, scores, timestamps, ticker codes use this. Tabular figures by default
- **CJK fallback chain:** `PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, sans-serif`

### Scale (rem-based; mobile-first; clamp() for fluid scaling)
- **Display Hero** — `clamp(2.5rem, 5vw, 4rem)` / weight 600 / tracking -0.025em / leading 1.05
- **Display Page** — `clamp(1.5rem, 3vw, 2rem)` / weight 600 / tracking -0.015em
- **Section H2** — `1.125rem` (18px) / weight 600 / tracking -0.01em
- **Card Title** — `0.875rem` (14px) / weight 600 / tracking normal
- **Body** — `0.875rem` (14px) / weight 400 / leading 1.55 / **max 65 characters per line**
- **Caption / Metadata** — `0.75rem` (12px) / weight 400 / Pewter Steel color
- **Micro Label** — `0.625rem` (10px) / weight 500 / uppercase / tracking 0.05em

### Numeric Treatment (high-density override per Stitch spec)
- **ALL numbers** use `Geist Mono` with `font-variant-numeric: tabular-nums`
- Prices: weight 500, color = Bone White
- Percentages: signed (+ / −), color = Pulse Red / Pulse Green per signal
- Scores: weight 500, signed if non-zero, Pewter Steel
- Ticker codes: weight 400, all-caps, Distant Fog when secondary

### Banned
- ⛔ `Inter` (overused, generic for premium contexts)
- ⛔ Generic serifs (`Times New Roman`, `Georgia`, `Garamond`, `Palatino`)
- ⛔ Any font under `12px` body text minimum on touch surfaces
- ⛔ All-caps body copy (only micro-labels and ticker codes get all-caps)
- ⛔ Headlines exceeding `4rem` on desktop — restraint > scale
- ⛔ Mixed weight contrasts within a single label (no 300 + 700 jumps)

## 4. Component Stylings

### Buttons
- **Primary:** Distressed Brass fill, Ink Charcoal text, `rounded-md` (6px), 36px height, weight 500. **No glow, no shadow.** Active state: `translate-y-[1px]` for tactile press.
- **Secondary:** Transparent fill, Whisper Border, Pewter Steel text. Hover: text → Bone White, border → Active Border
- **Ghost:** No border, text-only, Pewter Steel. Hover: Brass Wash background
- **Icon-only:** 32px square, Pewter Steel icon stroke, no fill, hover → Brass Wash background
- **Banned:** outer glow shadows · gradient backgrounds · 8px+ corner radius · ALL-CAPS button text

### Cards (Stock Cards, Brief Cards, Radar Cards)
- **Fill:** Card Pewter (#1c1c20)
- **Border:** 1px Whisper Border (rgba(255,255,255,0.06))
- **Corners:** `rounded-lg` (8px). Not 2.5rem — this is a dense trader UI, not a marketing site.
- **Shadow:** subtle, tinted to background — `0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.3)`
- **Padding:** 10px (Kanban stock card) / 16px (standalone cards)
- **Hover state:** lift to Hover Lift surface + border → Active Border
- **Dragging state (Kanban):** scale 0.98 + rotate 1deg + opacity 0.5 + brass border
- **Selected state:** Brass Wash background + Active Border outline + 2px brass left-edge bar
- **Active radar level decoration:** 2px solid left-edge bar — 🔴=Pulse Red, 🟡=Pulse Amber, ⚪️=Distant Fog (no left bar)

### Kanban Columns (preserved paradigm — central feature)
- **Width:** `min(85vw, 320px)` per column
- **Snap:** `scroll-snap-type: x mandatory` on container; `scroll-snap-align: start` per column
- **Header:** column name (weight 600, 14px) + ticker count chip (Pewter Steel, monospace, in pill) + ⋮ menu (icon-only button) — all on one row with 12px horizontal padding
- **Body:** 8px vertical stack of stock cards; "+ Add stock" ghost button at bottom; subtle `border-top: 1px Whisper Border` between header and body
- **Drop-target state:** entire column gets Active Border outline + Brass Wash overlay (rgba 0.04)
- **Column reorder:** drag column header → cards swap positions; cursor → `grab` / `grabbing`
- **Add-column slot:** at end of row; dashed Whisper Border outline; "+ 新增看板" centered in Pewter Steel

### Stock Card (the heart of the watchlist)
- 4-row tight stack within 10px padding:
  1. **Top row:** Market badge chip (10px caps, Pewter Steel on Hover Lift background) + **company name** (14px, weight 600, Bone White) + ⋮ menu button (right-aligned)
  2. **Ticker row:** `Geist Mono`, 11px, Distant Fog
  3. **Price row:** `Geist Mono`, 15px, weight 500, Bone White, **right-aligned within row**; pct change `Geist Mono` 13px, signed, signal color
  4. **Signal chips (optional):** small pills with trigger.desc, 10px text, border color by weight sign (Pulse Red border if +, Pulse Green if −)

### Radar Card (in /radar — distinct from stock card)
- Larger padding (16px), 4-row layout
- **Header row:** market badge + name + ticker + score chip (right) + level emoji (🔴/🟡/⚪️) + level label
- **Top Call row:** "Top Call: " (Distant Fog) + headline (Pewter Steel)
- **Trigger chips row:** flex-wrap pills, max 6 visible; positive triggers brass-outlined, negative brass-outlined-dashed
- **Flows row (A-share only):** "🌏 北上：" + count/rank/cumulative; mono numbers
- **Footer:** source label (Distant Fog 10px) + "📝 完整 morning note" (ghost button, brass on hover) + "详情 →" (ghost button)

### Inputs / Forms
- **Field:** 36px height, Card Pewter fill, Whisper Border, Bone White text, 14px weight 400, `rounded-md` (6px), 10px horizontal padding
- **Label:** 12px weight 500 Pewter Steel, positioned above field with 6px gap; never floating-label
- **Focus state:** border → Distressed Brass, 0 0 0 2px Brass Wash ring
- **Error state:** border → Pulse Red, error text below in Pulse Red 12px
- **Helper text:** 11px Distant Fog below field

### Tab Bar (fixed bottom on mobile, top on desktop ≥1024px)
- **Mobile:** fixed bottom, 56px height, Elevated Charcoal fill, `border-top: 1px Whisper Border`, `padding-bottom: env(safe-area-inset-bottom)`
- **Per-tab:** vertical stack icon (24px line-art) + label (10px Pewter Steel)
- **Active tab:** icon Distressed Brass + label Distressed Brass + 2px brass top-edge bar above the tab
- **Desktop ≥1024px:** transforms into horizontal top nav, icons hidden, label-only with brass underline for active
- **Tab icons:** line-art (not filled), 24×24px, 1.5px stroke. Specific icons:
  - 🏠 Home → home outline icon (door + roof line)
  - 📋 Watchlist → kanban columns icon (3 vertical bars)
  - 🌅 Radar → concentric circle pulse icon
  - 📰 Briefs → document with horizontal lines icon
  - 🧪 Backtest → line-chart icon
  - ⚙️ Settings → gear icon
- **Note:** the emoji prefixes are DESIGN DOC labels only — the actual rendered UI uses line-art icons (no emojis in chrome). Signal emojis 🔴🟡⚪️ in card content remain (functional glyphs, not chrome)

### Loading States
- **Skeletal shimmer** matching exact layout dimensions (card → card-shaped skeleton with stock-card field positions)
- 1.5s linear infinite shimmer using `bg-gradient-to-r from-transparent via-Hover-Lift/40 to-transparent`
- **Banned:** circular spinners · pulsing dots · "Loading…" plain text

### Empty States
- For empty Kanban column: subtle dashed-border drop-zone with "拖拽卡片到此处 · 或点下方 + 加入" in Distant Fog, 12px, centered
- For empty watchlist: ASCII-style line-drawing of an empty briefcase + "去添加你的第一只股票 →" CTA button
- **Banned:** generic "No data" text · sad emoji illustrations · third-party "undraw" SVGs

### Error States
- Inline error chip directly under the failing element, Pulse Red background at 8% alpha, Pulse Red 1px border, Pulse Red text 12px
- "⚠ 拉取失败 [重试]" pattern: inline icon + label + ghost-button retry on the same line

## 5. Layout Principles

### Container
- Max-width: **1400px** centered on desktop
- Page padding: **16px** mobile / **24px** tablet / **32px** desktop
- Section vertical gaps: `clamp(2rem, 5vw, 4rem)`

### Grid System
- **CSS Grid** over Flexbox math. Use `grid-template-columns: repeat(12, 1fr)` with explicit `grid-column-span` per element
- **No `calc()` percentage hacks**
- Mobile (< 768px): collapse to single column EXCEPT Kanban (horizontal scroll preserved)
- Tablet (768–1024px): 2-column for detail/list pairs
- Desktop (≥ 1024px): 3-12 column flexibility per page

### Per-page layout
- **Home (`/`)** — Asymmetric two-column hero (60/40 split), left = headline with inline ticker chips, right = live "📊 Market pulse" card with mini sparklines. Below: full-width "Today's radar levels" horizontal scroll strip.
- **Watchlist (`/watchlist`)** — KANBAN. Top bar (search + add + filter pills). Horizontal scroll columns. Footer with import/export icons.
- **Radar (`/radar`)** — Vertical stack of radar cards (sorted by score desc). Top: level-filter pills + refresh button. No grid — single-column dense stack with breathing room.
- **Briefs (`/briefs`)** — Calendar-grid view: 7 cols (days) × N rows (weeks); each cell shows brief headline + level chip. Click → /briefs/[date] detail.
- **Brief detail (`/briefs/[date]`)** — Magazine layout: full-width hero with date and overall vibe; below, 2-column at desktop (left = market notes, right = top 5 stocks)
- **Backtest (`/backtest`)** — Data table with sticky header, sortable columns, monospace numbers, expandable rows
- **Stock detail (`/stock/[ticker]`)** — 12-col split: chart (cols 1-8) + signals/perspectives (cols 9-12). Below: financials table, holders, news feed. Sticky price header at top while scrolling.
- **Settings (`/settings`)** — Two-column on desktop: left nav (sections list), right content. Single column on mobile with collapsible sections.

### Banned Layouts
- ⛔ Centered Hero on `/` (variance 6 > 4 threshold) — use asymmetric split
- ⛔ Generic 3-equal-column "features grid" anywhere
- ⛔ Absolute-positioned text overlapping images
- ⛔ Horizontal scroll on mobile EXCEPT for Kanban (justified by paradigm)
- ⛔ `h-screen` — use `min-h-[100dvh]` for full-height sections

## 6. Motion & Interaction

### Easing
- **Default:** spring physics `{stiffness: 100, damping: 20}` via Framer Motion
- **Number updates:** 240ms ease-out count-up via CSS counter or animated value
- **Card transitions:** `transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), border-color 150ms ease`
- **Page transitions:** subtle fade (120ms) + slide up 8px on route change; no full-page reload feel

### Specific Interactions
- **Card drag (Kanban):** on drag start → scale to 0.98, rotate 1deg, opacity 0.5, cursor `grabbing`; on hover-over-column → column highlights via Brass Wash; on drop → snap with spring physics + toast "✓ <ticker> → <column>"
- **Stock card hover:** lift to Hover Lift surface + border to Active Border, 150ms ease
- **Tab switch:** brass underline animates from old tab to new tab (200ms spring); content fades (120ms)
- **Refresh button:** rotates 360deg on click (300ms ease-out); button disabled during fetch
- **Number count-up (price updates):** 240ms ease-out from old to new value; color flash brass-wash for 600ms then back
- **Modal/Dialog:** scale from 0.96 + fade in (200ms spring); backdrop fades in (150ms)

### Banned Motion
- ⛔ Infinite-loop shimmer on every card (too much movement; reserve shimmer for actual loading states)
- ⛔ Bouncing chevrons / scroll indicators
- ⛔ Custom mouse cursors
- ⛔ Animating `top` / `left` / `width` / `height` — only `transform` and `opacity`
- ⛔ Full-page slide-over transitions on mobile (jarring + sluggish on iOS)

## 7. Anti-Patterns (Banned)

Encode these as explicit "NEVER DO" rules at every Stitch generation prompt:

### Visual / Typography
- ⛔ No `Inter` font anywhere
- ⛔ No generic serifs (`Times New Roman`, `Georgia`, `Garamond`)
- ⛔ No pure black `#000000` — Ink Charcoal `#0a0a0b` always
- ⛔ No neon glow / outer shadows
- ⛔ No oversaturated colors (sat > 80%)
- ⛔ No purple / violet / indigo (the "AI palette")
- ⛔ No gradient-text headers
- ⛔ No more than ONE chromatic accent (Distressed Brass)
- ⛔ No decorative emojis in chrome (tab bar, buttons, headers) — signal emojis 🔴🟡⚪️ in card content are functional glyphs and PERMITTED

### Copy / Content
- ⛔ No AI clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionary"
- ⛔ No fake percentages: "99.99%", "10x faster", round-numbered conversion stats
- ⛔ No generic placeholder names: "John Doe", "Acme Inc", "Nexus", "Lorem"
- ⛔ No "建议买入 / 建议卖出 / 必涨 / 明天会涨" — replace with "信号偏多/偏空/中性" (inherits MORNING_NOTE_DOCTRINE)
- ⛔ No scroll-indicator UI: "Scroll to explore", "Swipe down", bouncing chevrons
- ⛔ No "Loading…" plain text — use skeletal shimmer instead

### Layout / Component
- ⛔ No 3-equal-column "features grid"
- ⛔ No centered Hero on landing
- ⛔ No overlapping text-over-image without clear contrast
- ⛔ No `h-screen` (use `min-h-[100dvh]`)
- ⛔ No floating-label inputs (label above is always)
- ⛔ No circular spinners (skeletal shimmer only)
- ⛔ No `Unsplash` direct URLs (use `picsum.photos` or asset/svg placeholders)

### Data Display
- ⛔ No body-font numbers — every number MUST be `Geist Mono` tabular
- ⛔ No comma-as-thousands-separator inconsistency — pick one (English uses `,` per locale)
- ⛔ No currency symbol mixed with number without space when needed for readability

---

## Appendix A — How to Feed This to Stitch 2.0

1. Open [labs.google.com/stitch](https://labs.google.com/stitch)
2. Create a new project: **"Stock Monitor v2"**
3. In the project's persistent design context (or first message), paste the contents of this file
4. For each screen, write a prompt like:
   > "Generate the **Watchlist (Kanban) screen** per DESIGN.md. Show 3 columns (长期持有 / 机会跟踪 / 仅观察) with 4 stock cards each. Default dark theme. Include realistic A-share/HK/US ticker data — 600519.SH 贵州茅台, 00700.HK 腾讯控股, AAPL 苹果 etc. Mobile-first viewport (375×812 iPhone 15 Pro)."
5. Iterate by referencing DESIGN.md section anchors:
   > "Adjust the stock card per DESIGN.md §4 'Stock Card'. The pct change should be Pulse Red (#e11d48) for positive, Geist Mono 13px."
6. Cross-reference [`STITCH_PROMPTS.md`](./STITCH_PROMPTS.md) in this repo for ready-to-paste per-screen prompts.

## Appendix B — Tokens at a glance (copy-paste for Stitch)

```
Background      Ink Charcoal      #0a0a0b
Surface (top)   Elevated Charcoal #141417
Surface (card)  Card Pewter       #1c1c20
Surface (hover) Hover Lift        #23232a
Border          Whisper Border    rgba(255,255,255,0.06)
Border (active) Active Border     rgba(202,138,4,0.4)
Text primary    Bone White        #fafafa
Text secondary  Pewter Steel      #a1a1aa
Text tertiary   Distant Fog       #52525b
Accent          Distressed Brass  #ca8a04
Accent fill     Brass Wash        rgba(202,138,4,0.12)
Signal up       Pulse Red         #e11d48
Signal down     Pulse Green       #16a34a
Signal neutral  Pulse Amber       #eab308

Font sans       Geist
Font mono       Geist Mono
CJK fallback    PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC

Corner radius   6px (button) · 8px (card) · 12px (dialog)
Page max-width  1400px centered
Page padding    16/24/32 mobile/tablet/desktop
Section gap     clamp(2rem, 5vw, 4rem)
Tap target min  44px
```
