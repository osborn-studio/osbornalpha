<!-- 21_REPORT_TEMPLATES_AND_OUTPUTS — osbornalpha 生成物模板与结构（每日简报/委员会观点/雷达 + JSON shapes） — 最后更新 2026-06-20 -->

# 21 · 报告模板与产出结构（Report Templates & Outputs）

> 术语以 [`00_TERMINOLOGY_CONSISTENCY.md`](./00_TERMINOLOGY_CONSISTENCY.md) 为准。
> 本文档完全对照 `src/lib/brief/composer.ts`、`digest-takes.ts`、`radar.ts`、`radar-digest.ts`、`calendar.ts`、`src/lib/data/personas.ts` 以及 `/api/brief/*`、`/api/perspectives/*`、`/api/radar/*` 的实际实现。

osbornalpha 的核心产出有三类：① **每日简报**（Sentinel Morning Note，composer.ts）② **AI 委员会观点**（perspectives + digest-takes）③ **信号雷达**（radar / radar-digest）。三者共享同一套合规与「机构 morning note」写作纪律。

---

## 1. 写作纪律（贯穿所有 LLM 产出）

### 1.1 Morning-note doctrine（`composer.ts: MORNING_NOTE_DOCTRINE`）

「osbornalpha 早间研究主管」系统提示，四块规则：
- **数据来源 hierarchy**：优先 MCP/已验证数据（Tushare、东方财富、FRED、EDGAR）；严禁以网络搜索为主源；来源不明的数字标 `[UNSOURCED]`；缺数据宁可说「暂无数据」不编造。
- **时效**：所有数据 ≤90 天；引用价格/财报需附时间戳（如「截至 16:00 CST」）。
- **风格**：Be opinionated；Lead with the headline；"No news is a valid morning note"；区分 actionable（财报/并购/评级）vs noise；2 分钟可读完（1 页）。
- **合规**：严禁「建议买入/卖出/必涨/明天会涨」，替换为「信号偏多/偏空/中性」「注意力优先级」；末尾必含免责声明。

### 1.2 合规替换（`composer.ts: COMPLIANCE_REPLACEMENTS`）

所有 Markdown / HTML 产出在输出前过一遍正则替换：

| 命中词 | 替换为 |
|---|---|
| 建议买入 | 信号偏多 |
| 建议卖出 | 信号偏空 |
| 推荐买入 | 注意力优先级偏多 |
| 必涨 | 上行概率较高 |
| 必跌 | 下行概率较高 |
| 强烈推荐 | 高信心信号 |
| 明天会涨 | 短期信号偏多 |
| 我建议 | 综合视角倾向 |
| 应该买 | 决策辅助参考为多 |
| 稳赚 | 历史回测正向 |

---

## 2. 每日简报（Sentinel Morning Note，`composer.ts`）

### 2.1 生成管线（`generateDailyBrief(watchlist, opts)`）

```
1. enrich 每只股：东方财富报价 + (A 股) Tushare daily_basic / fina_indicator
2. computeTriggers → 信号评分（见 §2.2）
3. 按 score 排序取 Top N（默认 5；同分按 |当日涨跌| 排序）
4. 对每只 Top 跑 9-persona AI 委员会（DeepSeek，并发 Promise.allSettled）
5a. generateTopCall：为 #1 标的用 LLM 生成「Top Call」标题
5b. deriveTradeIdeas：从置信 ≥7 的视角派生交易想法
6. composeMarkdown（Telegram）+ 7. composeHTML（Email）→ applyCompliance
```

参数：`topN`（默认 5）、`skipLLM`（跳过委员会与 Top Call）。默认股票池 `DEFAULT_WATCHLIST`（茅台/完美世界/比亚迪/宁德/腾讯/阿里/AAPL/NVDA/MSFT/GOOGL）。

### 2.2 信号触发（`computeTriggers`）→ score = Σ weight

| rule | 条件 | weight |
|---|---|---|
| large_move | \|当日涨跌\| ≥ 5% | +3 |
| medium_move | \|当日涨跌\| ≥ 3% | +2 |
| high_turnover | 换手率 ≥ 5%（A 股）| +2 |
| anomalous_volume | 量比 ≥ 2x | +2 |
| high_amplitude | 振幅 ≥ 5% | +1 |
| low_pe | 0 < PE TTM < 15 | +1 |
| high_pe | PE TTM > 80 | +1 |
| quality_value | ROE > 20% 且 PB < 5 | +1 |

### 2.3 共识分与总体标签

- 每股共识 `consensusScore`：Σ(bullish=+confidence, bearish=−confidence, neutral=0) / n + 5，范围 0–10（无视角默认 5）。
- 总体信心 `overall` = 各股共识均值；标签 `overall_label`：≥7 `偏多偏强` · ≥6 `偏多` · ≥5 `中性` · ≥4 `偏空` · 否则 `偏空偏强`。

### 2.4 Markdown 段序（`composeMarkdown` —— Telegram 推送体）

机构标准段序，**严格按此顺序**：

```
1. Header
   *Sentinel Morning Note · {date}*
   _由 osbornalpha AI 委员会编辑 · 截至生成时刻数据_
   📊 委员会信心：*{overall}/10* — {overall_label}
   📋 {watchlist_count} 只股票池 · Top {n} 进入注意力优先级

2. Top Call（仅当 topCall 存在）
   🎯 *Top Call · {headline}*
   {rationale}
     ↗ {name} ({ticker}) {currency}{price} {±change%}

3. Overnight & Pre-Market Developments
   （若无 Top → "今日无重大事件，维持持仓。（No news is a valid morning note.）"）
   逐条 #1..#N：
     *#i {name}* ({ticker})  {★★★☆☆ 共识/2}  共识 {consensus}/10
     💰 {currency}{price}  {±change%}
     📍 {triggers 描述 · 拼接}          （有触发时）
     📐 PE {x} · PB {y} · ROE {z}%       （有基本面时）
     🤖 {b} 多 / {n} 中 / {s} 空          （有视角时）
       🟢 {代表多方大师}：{summary≤90}
       🔴 {代表空方大师}：{summary≤90}

4. Trade Ideas（置信 ≥ 7/10）
   （无高置信 → "💡 Trade Ideas — 今日无高置信（≥7/10）信号，观望为主"）
   逐条：
     *📈 偏多 / 📉 偏空* {name} ({ticker}) · 置信 {conviction}/10
       论点：{thesis}
       ⚠️ 风险：{对立视角，或通用风险提示}

5. Footer
   🔗 完整简报 / K 线 / 财报 / 股东持仓 / Backtest 排行榜：{URL}
   _本内容由 AI 自动生成，仅作为决策辅助参考，不构成任何投资建议。_
   _数据源：东方财富 · Tushare Pro · DeepSeek V4 Flash（AI 委员会）_
```

- 星级：`★×round(min(consensus,10)/2) + ☆` 补满 5 颗。
- 置信标签即 `📊 委员会信心：{overall}/10 — {overall_label}`（落地页样例卡中的「置信度 7.8」即此值）。

### 2.5 HTML 段序（`composeHTML` —— Email 推送体）

与 Markdown 同构，inline CSS、email-safe `max-width:640px` 容器，暗色 `HTML_PALETTE`（bg `#0d1117`、accent `#58a6ff`、涨 `#ef4444` / 跌 `#10b981`、warn `#f59e0b`）。段序：Header（含信心条）→ Top Call（accent 渐变卡）→ Overnight & Pre-Market（每股卡含星级/价格/触发/基本面/多空代表）→ Trade Ideas（左色条卡）→ Footer（链接 + 双行免责 + 数据源）。

### 2.6 主题行（`subject`）

- 有 Top Call：`Sentinel {date} · {headline}`
- 否则：`Sentinel Morning Note · {date} · {overall_label}`

### 2.7 `DailyBrief` JSON（`/api/brief/preview` 返回全量；composer.ts 导出）

```ts
interface DailyBrief {
  date: string;            // YYYY-MM-DD
  generated_at: string;    // ISO
  watchlist_count: number;
  top: BriefStockBlock[];
  overall_confidence: number;
  overall_label: '中性' | '偏多' | '偏空' | '偏多偏强' | '偏空偏强';
  top_call?: { headline: string; rationale: string; ticker: string };
  trade_ideas?: Array<{ ticker; name; bias: 'bull'|'bear'; thesis; risk; conviction: number }>;
  markdown: string;        // §2.4 产物（已合规替换）
  html?: string;           // §2.5 产物
  subject?: string;        // §2.6
  meta: { duration_ms: number; tokens?: {input;output}; est_cost_usd?; failures?; provider?; model? };
}

interface BriefStockBlock {
  ticker; name; market; currency: string;
  price; change_pct; score: number;
  triggers: SignalTrigger[];           // { rule, desc, weight }
  pe_ttm; pb; roe: number | null;
  consensus: number;                   // 0-10
  perspectives: PerspectiveResult[];   // 见 §3.2
}
```

### 2.8 API 形态

- **`GET /api/brief/preview`** —— params `watchlist=A,B,C`、`topN`、`skipLLM=true`、`format=json|markdown|md`。`format=markdown` 返回 `brief.markdown`（`text/markdown`）；否则返回完整 `DailyBrief`；出错 `{ error, stack }` (500)。
- **`POST /api/brief/send`** —— body `{ watchlist?, topN?, skipLLM?, channels?:('telegram'|'email')[], chatId?, to?, text?, subject? }`。
  - 有 `text` → raw 模式：`{ mode:'raw', channels:{ telegram, email } }`。
  - 否则 brief 模式：`{ mode:'brief', channels:{ telegram?, email? }, brief_meta:{ date, subject, overall_confidence, overall_label, top_count, has_top_call, trade_ideas_count, duration_ms } }`（注意：返回的是 `brief_meta` 摘要，非全量简报）。

---

## 3. AI 投资委员会观点（`personas.ts` + `/api/perspectives/[ticker]`）

### 3.1 九位 persona（`PERSONAS`）

| id | name | style |
|---|---|---|
| buffett | 巴菲特 | 价值投资 / 护城河 / 长期持有 |
| munger | 芒格 | 多元思维模型 / 反向思考 / 复利 |
| druckenmiller | 德鲁肯米勒 | 宏观对冲 / 流动性 / 顺势 |
| marks | 霍华德·马克斯 | 周期 / 风险 / 钟摆思维 |
| lynch | 彼得·林奇 | 成长股 / 身边的机会 / Tenbagger |
| burry | 迈克尔·伯里 | 逆向 / 危机 / 数据洞察 |
| zhang_kun | 张坤 | 优质成长 / 长期持有 / 消费医药 |
| li_lu | 李录 | 价值投资 + 中国视角 / 安全边际 |
| duan_yongping | 段永平 | 平常心 / 商业本质 /「本分」哲学 |

每个 persona 有长 Chinese system prompt（角色 / 核心信念 / 绝不会做 / 风格）。

### 3.2 输入 / 输出契约

**输入 `StockContext`**（`buildUserMessage` 拼成中文 user prompt，仅含已传字段，附今日日期、≤90 天时效、数据来源约束）：
```ts
interface StockContext {
  ticker; name; market; currency: string;
  price; change_pct: number;
  pe_ttm?; pb?; roe? : number | null;
  market_cap_label?: string;
  dividend_yield?; gross_margin?; net_margin?: number | null;
  financial_summary?: string;   // 5 年同比摘要
  events?: string[];            // 近期重大事件
}
```

**LLM 被要求输出严格 JSON**：
```json
{"stance":"bullish"|"neutral"|"bearish","confidence":0-10,"summary":"<≤120字>","cites":["<数据点1>","<数据点2>"]}
```
要求 summary 至少引用 1 个具体数据点；禁「建议买入/卖出/明天会涨」（用信号偏多/偏空/中性）；cites 为数据来源标签。

**解析后 `PerspectiveResult`**（stance 校验、confidence clamp 0–10、summary≤300、cites≤6）：
```ts
interface PerspectiveResult {
  persona: Persona;
  name: string;
  stance: Stance;          // bullish | neutral | bearish
  confidence: number;      // 0-10
  summary: string;
  cites: string[];
}
```

### 3.3 `GET /api/perspectives/[ticker]` 返回

- 无 LLM key（200）：`{ source:'no-key', ticker, error, perspectives:[] }`
- 无报价（502）：`{ source:'no-quote', ticker, error, perspectives:[] }`
- 成功（200）：
```ts
{
  source: string,                 // 如 "deepseek+eastmoney+tushare"
  ticker: string,
  context: StockContext,
  perspectives: PerspectiveResult[],
  meta: {
    generated_at; provider; model: string;
    duration_ms: number;
    personas_attempted; personas_succeeded: number;
    tokens: { input; output };
    est_cost_usd: number;
    failures?: Array<{ persona; err }>;   // 最多 3 条
  }
}
```
可选 `?personas=buffett,munger,...` 过滤。每 persona 调用参数：`max_tokens:400, temperature:0.7, timeoutMs:30000, responseJson:true`。

### 3.4 委员会简评（`digest-takes.ts` —— 雷达里的一句话 take）

`/api/perspectives` 的「廉价共识」姐妹：对每只 actionable（🔴/🟡）股生成 **一句 ≤40 字** 的中文 take（华尔街晨会主管口吻），并发跑、单股失败不阻塞。
- env 门控：`LLM_DIGEST_TAKE === 'on'` 才启用。
- 调用参数：`max_tokens:120, temperature:0.55, timeoutMs:20000`；输出去引号、取首行、硬截 80 字。
- 结构：
```ts
interface DigestTake { ticker: string; take: string; est_cost_usd: number; model: string; error?: string; }
```

---

## 4. 信号雷达（`radar.ts` + `radar-digest.ts` + `calendar.ts`）

### 4.1 单股 `RadarPayload`（`buildRadar(ticker)`）

```ts
type RadarLevel = 'red' | 'yellow' | 'white';
interface RadarTrigger { rule: string; desc: string; weight: number; }

interface RadarPayload {
  ticker; name: string;
  market: 'A' | 'HK' | 'US';
  currency; as_of: string;          // ISO
  radar_level: RadarLevel;
  level_label: string;              // 关注 / 留意 / 平静
  score: number;                    // Σ triggers[].weight
  headline: string;                 // buildHeadline 拼接
  sections: {
    price: { value; change_pct; pe_ttm; pb: number|null; currency; market_cap_label; source: string };
    flows: { available: boolean; north_top10_count_30d; north_latest_rank;
             north_latest_date; north_latest_amount_yi; north_total_amount_30d_yi;
             limit_streak; limit_30d_count };
    events: Array<{ date; title; url: string|null }>;     // 实际恒为空（anns_d 需 >5000 积分，已跳过）
    calendar: { next_earnings_days: number|null; next_earnings_date: string|null;
                upcoming: Array<{ kind; date; days_until; title }> };
    fundamentals: { roe; gross_margin; net_margin; dividend_yield: number|null };
  };
  triggers: RadarTrigger[];
  markdown: string;
  disclaimer: string;               // '本简报仅作决策辅助，不构成投资建议'
}
```

### 4.2 评级与触发

- 分级（`levelFromScore`）：`score ≥ 8` → red/关注；`≥ 4` → yellow/留意；否则 white/平静。
- 触发来源：价格异动（large/medium_move、high_turnover、anomalous_volume、high_amplitude，权重同 §2.2）；北上资金（+1/+2/+3，`north_top3_today +3`）；连板 `min(5, streak)`；日历催化 `earnings_t1 +5 / earnings_t7 +3 / earnings_t14 +1`、`dividend_ex_imminent +2`、`share_unlock_imminent −2`、`guidance_recent +2/−2/+1`（按预增/预减）。
- headline：拼接「单日 +X% / 财报临近 T-n（T-1 用「财报前夜」）/ n 连板 / 北上前十 #r / 今日 N 条公告」；white 兜底「今日无重大事件，维持持仓」。

### 4.3 日历（`calendar.ts: CalendarPayload`）

```ts
type CalendarEventKind = 'earnings_announce'|'earnings_guidance'|'dividend_ex_date'|'dividend_record'|'share_unlock';
interface CalendarEvent { kind: CalendarEventKind; date: string; days_until: number; title: string; details: Record<string,unknown>; }
interface CalendarPayload {
  ticker; as_of: string; horizon_days: number;
  events: CalendarEvent[];
  next_earnings: { date; days_until: number; source: 'actual'|'pre'|'modify' } | null;
}
```
仅 A 股 + 需 Tushare；`next_earnings_days`（radar 消费）= `next_earnings.days_until`。
（`dividend_record` 在联合类型里声明但 `buildCalendar` 当前不产出。）

### 4.4 雷达日报聚合（`radar-digest.ts: RadarDigest`）

`buildRadarDigest(tickers)` 扇出 `buildRadar`、按 score 降序、分桶红/黄/白，渲染 Telegram markdown（红黄出完整卡、白折叠成一行列表）+ Email HTML + subject（如 `🌅 雷达 {date} · 🔴N · 🟡M`）：

```ts
interface RadarDigest {
  date: string;                          // ISO yyyy-mm-dd（北京）
  generated_at: string;
  totals: Record<RadarLevel, number>;    // { red, yellow, white }
  by_level: Record<RadarLevel, RadarPayload[]>;
  errors: Array<{ ticker; error: string }>;
  takes: DigestTake[];                   // §3.4，未开 LLM_DIGEST_TAKE 时为空
  total_llm_cost_usd: number;
  markdown: string;                      // Telegram
  html: string;                          // Email
  subject: string;
  order: string[];                       // 全量排序 ticker，高→低分
}
```

---

## 5. 产出物速查

| 产出 | 生成函数 | Markdown | HTML | JSON 入口 | 段序 |
|---|---|---|---|---|---|
| 每日简报 | `generateDailyBrief` | ✓ Telegram | ✓ Email | `GET /api/brief/preview` | Header → Top Call → Overnight → Trade Ideas → Footer |
| 委员会观点（单股） | persona × `chat` | — | — | `GET /api/perspectives/[ticker]` | 看多 / 中性 / 看空 分组 |
| 委员会一句话 take | `buildDigestTakes` | （嵌雷达）| — | （随 radar-digest）| 单句 ≤40 字 |
| 单股雷达 | `buildRadar` | ✓（卡内 `markdown`）| — | `GET /api/radar/batch` | Top Call + 信号 + 流向/事件 + 日历 |
| 雷达日报 | `buildRadarDigest` | ✓ Telegram | ✓ Email | （cron / 内部）| 红 → 黄 → 白（折叠）|
