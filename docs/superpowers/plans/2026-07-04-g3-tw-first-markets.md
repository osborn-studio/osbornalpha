# G3 日韩台市场（台湾先行）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans。Spec: `docs/superpowers/specs/2026-07-04-g3-jp-kr-tw-markets-design.md`。

**Goal:** Market 架构一次扩到六市场（A/HK/US/JP/KR/TW），台股接 TWSE/TPEx 官方免费源达到 HK/US 同级体验；JP/KR 留 EODHD 占位适配器。

**Architecture:** 数据源注册表 `quoteSourcesFor(market)` 取代硬编码级联；classifyMarket 单一真源；twse 适配器带 60s 内存缓存 + 原生多标的合并应对 3req/5s 限流。

**Branch:** `feat/g3-tw-markets`（从 main 切）。**禁触** `src/components/KlineChart.tsx`、`src/lib/brief/composer.ts`。

---

### T1: 六市场地基（类型 + 迁移 + 解析 + 时钟 + i18n）

**Files:**
- Modify: `src/lib/supabase/database.types.ts`、`src/lib/utils.ts`、`src/lib/today/clock.ts`、TypeScript 点名的所有 union 消费文件
- Create: `supabase/migrations/20260704090000_markets_jp_kr_tw.sql`
- Modify: `messages/{zh,en}/{components,today,market}.json`、`src/app/(app)/today/page.tsx`
- Test: `src/lib/utils.test.ts`（若无则新建）、`src/lib/today/clock.test.ts`（追加）

- [ ] **Step 1: 失败测试**（classifyMarket 六市场 + 新时钟行）：

```ts
// utils.test.ts (追加/新建)
import { describe, it, expect } from 'vitest';
import { classifyMarket } from './utils';

describe('classifyMarket — six markets', () => {
  it.each([
    ['600519.SH', 'A'], ['300750.SZ', 'A'], ['830799.BJ', 'A'],
    ['0700.HK', 'HK'], ['AAPL', 'US'], ['BRK.B', 'US'],
    ['7203.T', 'JP'], ['005930.KS', 'KR'], ['035720.KQ', 'KR'],
    ['2330.TW', 'TW'], ['5483.TWO', 'TW'], ['2330.tw', 'TW'], // 大小写
  ])('%s → %s', (t, m) => expect(classifyMarket(t)).toBe(m));
  // 关键陷阱：.TW 不能被 .T 规则吃掉（$ 锚定保证，测试锁死）
  it('.TW is not JP', () => expect(classifyMarket('2330.TW')).not.toBe('JP'));
});
```

```ts
// clock.test.ts 追加
describe('marketPhase — JP/KR/TW', () => {
  // 东京周一 03:00 UTC = 12:00 JST → 午休，30 分钟后下午开盘（12:30）
  it('JP lunch: Mon 03:00 UTC → lunch, 30 min', () => {
    const r = marketPhase('JP', new Date('2026-07-06T03:00:00Z'));
    expect(r.phaseKey).toBe('lunch'); expect(r.minutes).toBe(30);
  });
  // 东京 15:30 收盘（2024-11 起）：06:00 UTC = 15:00 JST → openAfternoon, 30 min
  it('JP closes 15:30: Mon 06:00 UTC → openAfternoon, 30 min', () => {
    const r = marketPhase('JP', new Date('2026-07-06T06:00:00Z'));
    expect(r.phaseKey).toBe('openAfternoon'); expect(r.minutes).toBe(30);
  });
  // 首尔单段 09:00–15:30：周一 01:00 UTC = 10:00 KST → open
  it('KR single session: Mon 01:00 UTC → open', () => {
    const r = marketPhase('KR', new Date('2026-07-06T01:00:00Z'));
    expect(r.phaseKey).toBe('open'); expect(r.minutes).toBe(330);
  });
  // 台北单段 09:00–13:30：周一 05:00 UTC = 13:00 CST → open, 30 min
  it('TW single session: Mon 05:00 UTC → open, 30 min', () => {
    const r = marketPhase('TW', new Date('2026-07-06T05:00:00Z'));
    expect(r.phaseKey).toBe('open'); expect(r.minutes).toBe(30);
  });
});
```

- [ ] **Step 2: 实现**：
  - `database.types.ts`: `export type Market = 'A' | 'HK' | 'US' | 'JP' | 'KR' | 'TW';`
  - `utils.ts` classifyMarket（唯一真源）：

```ts
export function classifyMarket(ticker: string): Market {
  const t = ticker.toUpperCase();
  if (/\.(SH|SZ|BJ)$/.test(t)) return 'A';
  if (/\.HK$/.test(t)) return 'HK';
  if (/\.(TW|TWO)$/.test(t)) return 'TW';
  if (/\.(KS|KQ)$/.test(t)) return 'KR';
  if (/\.T$/.test(t)) return 'JP';
  return 'US';
}
```

  - `clock.ts`: 删本地 `marketOfTicker` 实现改为 `export { classifyMarket as marketOfTicker } from '@/lib/utils';`；`ClockMarket` 删除、`MARKET_SESSIONS: Record<Market, MarketSessionSpec>` 补三行：
    `JP: { tz: 'Asia/Tokyo', sessions: [{open:540,close:690},{open:750,close:930}] }`（09:00–11:30, 12:30–15:30）
    `KR: { tz: 'Asia/Seoul', sessions: [{open:540,close:930}] }`（09:00–15:30）
    `TW: { tz: 'Asia/Taipei', sessions: [{open:540,close:810}] }`（09:00–13:30）
  - `today/page.tsx`: `MARKET_ORDER` = `['A','HK','US','JP','KR','TW']`。
  - `npx tsc --noEmit` 会点名所有 Market union 消费点（DecisionForm/CopilotClient/WatchlistScreener/agent tools/radar 等）——逐个补分支：货币映射加 `JP:'JP¥', KR:'₩', TW:'NT$'`；市场下拉/过滤 UI **不加**新选项（spec 决策），仅让类型通过（用 exhaustive 兜底或显式列举）。
  - i18n：`components.market` + `today.clock.market` 加 `JP/KR/TW`（zh: 日股/韩股/台股；en: Japan/Korea/Taiwan）；`market.sourcePending`（zh: 数据源未接入；en: Data source not connected）入 market.json；GLOSSARY.md 补行。
  - 迁移 SQL：

```sql
-- PG12+: ADD VALUE 允许在事务内，但新值不能在同一事务中使用（下方 check 约束是 text 列，不触碰 enum 新值）
alter type market_t add value if not exists 'JP';
alter type market_t add value if not exists 'KR';
alter type market_t add value if not exists 'TW';

alter table public.decisions drop constraint if exists decisions_market_check;
alter table public.decisions add constraint decisions_market_check
  check (market in ('A','HK','US','JP','KR','TW'));
```

  执行 `supabase db push --yes`。若 drop constraint 因命名不同失败：先用 Management API 查 `select conname from pg_constraint where conrelid='public.decisions'::regclass and contype='c'` 再改名重推（报告中注明）。
- [ ] **Step 3: 全量测试绿 + tsc 干净**
- [ ] **Step 4: Commit** `feat(markets): six-market foundation (types, migration, parser, clocks, i18n)`

### T2: TWSE/TPEx 适配器（TDD，fixture 驱动）

**Files:**
- Create: `src/lib/data/sources/twse.ts` + `src/lib/data/sources/twse.test.ts`

- [ ] **Step 1: 失败测试**——纯解析函数用内联 fixture（不打真网）：

```ts
import { describe, it, expect } from 'vitest';
import { parseMisQuote, parseStockDayBars, twseExCh } from './twse';

describe('twseExCh', () => {
  it('maps .TW to tse and .TWO to otc', () => {
    expect(twseExCh('2330.TW')).toBe('tse_2330.tw');
    expect(twseExCh('5483.TWO')).toBe('otc_5483.tw');
  });
});

describe('parseMisQuote', () => {
  const msg = { c: '2330', n: '台積電', z: '1,085.00', y: '1,080.00', o: '1,082.00',
    h: '1,090.00', l: '1,078.00', v: '25,331', d: '20260706', t: '13:30:00' };
  it('coerces comma-separated strings to numbers', () => {
    const q = parseMisQuote(msg, '2330.TW')!;
    expect(q.price).toBe(1085);            // 千分位剥离（TWSE 全是带逗号字符串！）
    expect(q.prev_close).toBe(1080);
    expect(q.change_pct).toBeCloseTo(0.463, 2);
    expect(q.currency).toBe('NT$');
    expect(q.market).toBe('TW');
  });
  it('returns null when z is "-" (no trade yet)', () => {
    expect(parseMisQuote({ ...msg, z: '-' }, '2330.TW')).toBeNull();
  });
});

describe('parseStockDayBars', () => {
  it('parses TWSE STOCK_DAY rows (comma numbers, ROC dates)', () => {
    const rows = [['115/07/06', '25,331,405', '27,462,105,140', '1,082.00', '1,090.00', '1,078.00', '1,085.00', '+5.00', '18,204']];
    const bars = parseStockDayBars(rows);
    expect(bars[0]).toMatchObject({ date: '2026-07-06', open: 1082, high: 1090, low: 1078, close: 1085 });
    expect(bars[0].volume).toBe(25331405);
  });
});
```

⚠️ ROC 民国纪年：STOCK_DAY 日期是 `115/07/06`（民国 115 = 2026）——`+1911` 换算，测试锁死。

- [ ] **Step 2: 实现** `twse.ts`：
  - `twseExCh(ticker)`、`parseMisQuote(msg, ticker)`（返回 quote/batch 的 QuoteShape 子集：source:'twse'、name 取 `n`、amplitude=((h-l)/y)*100、market_cap/pe/pb/turnover/volume_ratio=null、delayed:false）、`parseStockDayBars(rows)` 三个纯函数导出（可测）。
  - `fetchTwseQuotesBatch(tickers: string[])`：一次 GET `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exChs.join('|')}&json=1&delay=0`（Referer `https://mis.twse.com.tw/stock/index.jsp`），解析 msgArray → Map；**模块级缓存 60s**（`Map<ticker,{q,at}>`），命中不打网。`fetchTwseQuote(t)` = batch([t]) 取一。超时 4s AbortController（照抄 sina.ts 模式）。
  - `fetchTwseKline(ticker, period, limit)`：仅 `.TW`（TPEx 上柜 K 线本期不做，返回 null——报告注明）；按月倒序拉 `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=YYYYMM01&stockNo=XXXX&response=json` 直到满足 limit（上限 8 个月），月间 300ms 延时防限流；`period` W/M 由日线聚合（纯函数 `aggregateBars(bars, 'W'|'M')`，ISO 周/自然月，附 2-3 条单测）。
  - `fetchTwseUniverse()`：`https://openapi.twse.com.tw/v1/opendata/t187ap03_L`（上市）+ `https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O`（上柜），映射 `{t: 公司代號.TW|.TWO, n: 公司簡稱, py: '', m: 'TW'}`，`unstable_cache` 24h，任一端点失败返回另一端点结果（不整体失败）。
- [ ] **Step 3: 测试绿 → Commit** `feat(data): TWSE/TPEx adapter (quotes, daily kline, universe)`

### T3: 数据源注册表 + EODHD 占位 + 三消费点接线

**Files:**
- Create: `src/lib/data/sources/registry.ts` + `registry.test.ts`、`src/lib/data/sources/eodhd.ts`
- Modify: `src/app/api/quote/[ticker]/route.ts`、`src/app/api/quote/batch/route.ts`、`src/lib/brief/radar.ts`（resolveQuote）、`src/app/api/kline/[ticker]/route.ts`

- [ ] **Step 1: 失败测试**：

```ts
import { quoteSourcesFor } from './registry';
it('routes markets to sources', () => {
  expect(quoteSourcesFor('A').map(s => s.name)).toEqual(['eastmoney', 'sina', 'tencent']);
  expect(quoteSourcesFor('TW').map(s => s.name)).toEqual(['twse']);
  expect(quoteSourcesFor('JP').map(s => s.name)).toEqual([]); // EODHD 未配置
});
```

- [ ] **Step 2: 实现**：
  - `eodhd.ts`：`isEodhdConfigured() = !!process.env.EODHD_API_TOKEN`；`fetchEodhdQuote(ticker)`——EODHD 代码映射 `.T→.TSE`、`.KS→.KO`、`.KQ→.KQ`，GET `https://eodhd.com/api/real-time/{code}?api_token=...&fmt=json`，解析为 QuoteShape 子集（**头注标明：未订阅未实测，shape 按公开文档**）。
  - `registry.ts`：`interface NamedFetcher { name: string; fetch(t: string): Promise<any|null> }`；`quoteSourcesFor(market)`：A/HK/US→[eastmoney,sina,tencent]、TW→[twse]、JP/KR→ EODHD 配置了则 [eodhd] 否则 []。
  - `quote/[ticker]`：级联改 `for (const s of quoteSourcesFor(classifyMarket(ticker)))` + 保留 A 股 tushareFallback 兜底（顺序与现状逐字节一致：eastmoney→sina→tencent→tushare）；全 miss 返回现有 404 shape + `pending: quoteSourcesFor(...).length === 0`（JP/KR 未接源标记，供前端）。
  - `quote/batch`：先按市场分组；TW 组一次 `fetchTwseQuotesBatch`；其余按现逻辑（走注册表循环）。响应 shape 不变。
  - `radar.ts` resolveQuote：同样改注册表循环；`/api/radar/batch` 入口把 `quoteSourcesFor(market).length===0` 的标的直接标 `{ skipped: 'source-pending' }` 不进 buildRadar（不烧时间/配额）。
  - `kline/[ticker]`：`classifyMarket(ticker)==='TW'` → fetchTwseKline，否则现 eastmoney 路径。
- [ ] **Step 3: 全量测试绿 + tsc + Commit** `feat(data): market-routed source registry + EODHD stub + wiring`

### T4: 搜索合并台股 + JP/KR 占位 UX

**Files:**
- Modify: `src/app/api/search/route.ts`、`src/app/(app)/stock/[ticker]/page.tsx`

- [ ] **Step 1**: search route——东财结果之外并入 `searchUniverse(await fetchTwseUniverse(), query)`（复用现打分器），合并去重（按 ticker），总量仍截断现有 limit。台股可按代码（2330）与中文名（台積電/繁体）检索。
- [ ] **Step 2**: stock 页——`quote 为 null 且 classifyMarket(ticker) ∈ {JP,KR}` 时，价格区显示 `t('stock.sourcePending')`（market.json 键 T1 已加）小字徽章；不影响其他市场的现有空态。
- [ ] **Step 3**: `npm run build` + 手工 curl `/api/search?q=2330`、`/api/quote/2330.TW`（真网验证台积电报价）。
- [ ] **Step 4: Commit** `feat(markets): TW search universe + JP/KR source-pending UX`

### T5: 终审 + 合并（coordinator）

- review 重点：classifyMarket 后缀锚定（`.T`/`.TW`/`.TWO`/`.KS`）与全部旧调用点行为不回归（A/HK/US 分类零变化）；quote/[ticker] 对 A 股的级联顺序与 shape 逐字节不变；mis 限流缓存真实生效（60s 内重复请求零新连接）；ROC 日期换算；迁移在生产实际生效（Management API 插 market='TW' 决策行冒烟后删除）；radar batch 对 JP/KR 的跳过。
- 全量 gates：tsc / npm test / build / e2e + 真网 `/api/quote/2330.TW`、`/api/kline/2330.TW?limit=30`。
- merge --no-ff 进 main + push + 记忆更新。
