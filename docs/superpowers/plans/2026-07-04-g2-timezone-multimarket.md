# G2 跨时区/多市场时钟 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans。Spec: `docs/superpowers/specs/2026-07-04-g2-timezone-multimarket-design.md`。

**Goal:** /today 多市场时钟条（A/HK/US，美股 DST 正确）+ 全站时间戳浏览器时区自动/设置覆盖 + cron 保持北京锚定并移除欺骗性简报时间输入。

**Architecture:** 表驱动纯函数时钟（`MARKET_SESSIONS` + Intl 时区判定）；显示时区经 `TimezoneProvider` context 从 `user_preferences.timezone` 读（`''`=auto=浏览器）；formatDate 助手加可选 tz 参数默认行为不变。

**Tech Stack:** Next.js 14 App Router、next-intl（无路由模式）、Supabase（RLS）、vitest、Playwright。

**Branch:** `feat/g2-timezone`（从 main 切）。**禁触** `src/components/KlineChart.tsx`、`src/lib/brief/composer.ts`（他 session 未暂存改动在工作区）。

---

## Tasks

### T1: 时钟引擎泛化（TDD）

**Files:**
- Modify: `src/lib/today/clock.ts`
- Test: `src/lib/today/clock.test.ts`（既有 8 测试**一字不改**，新增追加）

- [ ] **Step 1: 先写失败测试**（追加到 clock.test.ts）

```ts
import { marketPhase, marketOfTicker } from './clock';

describe('marketPhase — multi-market', () => {
  // US 夏令时（EDT, UTC-4）：2026-07-06 是周一。13:30 UTC = 09:30 EDT 开盘整点
  it('US summer (EDT): Mon 13:30 UTC → open, 390 min to close', () => {
    const r = marketPhase('US', new Date('2026-07-06T13:30:00Z'));
    expect(r.phase).toBe('open');
    expect(r.phaseKey).toBe('open');
    expect(r.minutes).toBe(390);
  });
  // US 冬令时（EST, UTC-5）：2026-01-05 是周一。13:30 UTC = 08:30 EST 盘前 60 分钟
  it('US winter (EST): Mon 13:30 UTC → pre, 60 min to open', () => {
    const r = marketPhase('US', new Date('2026-01-05T13:30:00Z'));
    expect(r.phase).toBe('pre');
    expect(r.phaseKey).toBe('pre');
    expect(r.minutes).toBe(60);
  });
  // 跨日陷阱：北京周六 09:00 = 纽约周五 21:00（EDT）→ US 是 closed 不是 weekend
  it('cross-date: Sat 01:00 UTC (Fri 21:00 NY) → US closed, not weekend', () => {
    const r = marketPhase('US', new Date('2026-07-04T01:00:00Z')); // 周六 UTC
    expect(r.phase).toBe('closed');
  });
  // 反向：北京周一 08:00 = 纽约周日 20:00 → US weekend
  it('cross-date: Mon 00:00 UTC (Sun 20:00 NY) → US weekend', () => {
    const r = marketPhase('US', new Date('2026-07-06T00:00:00Z')); // 周一 UTC = 纽约周日晚
    expect(r.phase).toBe('weekend');
  });
  // HK 午休：周一 04:30 UTC = 12:30 香港
  it('HK lunch: Mon 04:30 UTC → lunch, 30 min to afternoon open', () => {
    const r = marketPhase('HK', new Date('2026-07-06T04:30:00Z'));
    expect(r.phase).toBe('lunch');
    expect(r.phaseKey).toBe('lunch');
    expect(r.minutes).toBe(30);
  });
  // HK 下午段到 16:00：周一 07:00 UTC = 15:00 香港 → openAfternoon, 60 min
  it('HK afternoon: Mon 07:00 UTC → openAfternoon, 60 min to close', () => {
    const r = marketPhase('HK', new Date('2026-07-06T07:00:00Z'));
    expect(r.phaseKey).toBe('openAfternoon');
    expect(r.minutes).toBe(60);
  });
  // A 股经新引擎与旧函数一致
  it('A via marketPhase matches aShareMarketPhase phaseKey/minutes', () => {
    const now = new Date('2026-06-29T02:00:00Z');
    const a = marketPhase('A', now);
    expect(a.phaseKey).toBe('openMorning');
    expect(a.minutes).toBe(90);
  });
});

describe('marketOfTicker', () => {
  it.each([
    ['600519.SH', 'A'], ['300750.SZ', 'A'], ['830799.BJ', 'A'],
    ['0700.HK', 'HK'], ['aapl', 'US'], ['BRK.B', 'US'],
  ])('%s → %s', (t, m) => expect(marketOfTicker(t)).toBe(m));
});
```

- [ ] **Step 2: 跑测试确认失败**：`npm test -- clock` → FAIL（marketPhase not exported）

- [ ] **Step 3: 实现**。clock.ts 重构为表驱动；`toBeijingParts` 泛化为 `toZoneParts(now, tz)`（内容同现函数，仅 timeZone 参数化）：

```ts
export type ClockMarket = 'A' | 'HK' | 'US'; // G3: 'JP' | 'KR' | 'TW' 只加表行

interface MarketSessionSpec {
  tz: string;
  sessions: Array<{ open: number; close: number }>; // 当地分钟数；2 段=有午休
}

const MARKET_SESSIONS: Record<ClockMarket, MarketSessionSpec> = {
  A:  { tz: 'Asia/Shanghai',    sessions: [{ open: 570, close: 690 }, { open: 780, close: 900 }] },
  HK: { tz: 'Asia/Hong_Kong',   sessions: [{ open: 570, close: 720 }, { open: 780, close: 960 }] },
  US: { tz: 'America/New_York', sessions: [{ open: 570, close: 960 }] },
};

export interface MarketPhaseV2 {
  phase: 'pre' | 'open' | 'lunch' | 'closed' | 'weekend';
  phaseKey: MarketPhaseKey; // 'open' 追加进 MarketPhaseKey 联合
  minutes?: number;
}

export function marketPhase(market: ClockMarket, now: Date): MarketPhaseV2 {
  const spec = MARKET_SESSIONS[market];
  const { weekday, hour, minute } = toZoneParts(now, spec.tz);
  if (weekday === 0 || weekday === 6) return { phase: 'weekend', phaseKey: 'weekend' };
  const m = hour * 60 + minute;
  const [s1, s2] = spec.sessions;
  if (m < s1.open) return { phase: 'pre', phaseKey: 'pre', minutes: s1.open - m };
  if (m < s1.close) {
    return s2
      ? { phase: 'open', phaseKey: 'openMorning', minutes: s1.close - m }
      : { phase: 'open', phaseKey: 'open', minutes: s1.close - m };
  }
  if (s2 && m < s2.open) return { phase: 'lunch', phaseKey: 'lunch', minutes: s2.open - m };
  if (s2 && m < s2.close) return { phase: 'open', phaseKey: 'openAfternoon', minutes: s2.close - m };
  return { phase: 'closed', phaseKey: 'closed' };
}

export function marketOfTicker(ticker: string): ClockMarket {
  if (/\.(SH|SZ|BJ)$/i.test(ticker)) return 'A';
  if (/\.HK$/i.test(ticker)) return 'HK';
  return 'US';
}
```

`aShareMarketPhase` 重写为薄包装（返回类型/label 逐字节兼容既有测试）：

```ts
export function aShareMarketPhase(now: Date): MarketPhase {
  const p = marketPhase('A', now);
  const labels: Record<MarketPhaseKey, (n?: number) => string> = {
    pre: (n) => `盘前 · A股开盘还有 ${n} 分钟`,
    openMorning: (n) => `盘中 · 午休还有 ${n} 分钟`,
    lunch: (n) => `午休 · 下午开盘还有 ${n} 分钟`,
    openAfternoon: (n) => `盘中 · 收盘还有 ${n} 分钟`,
    open: () => '盘中',
    closed: () => '已收盘',
    weekend: () => '周末休市',
  };
  return { ...p, label: labels[p.phaseKey](p.minutes) };
}
```

- [ ] **Step 4: 跑全量 clock 测试** → 既有 8 + 新增全绿
- [ ] **Step 5: Commit** `feat(clock): table-driven multi-market phase engine (A/HK/US, DST-safe)`

### T2: locale.ts tz 参数（TDD）

**Files:** Modify `src/lib/i18n/locale.ts` + `src/lib/i18n/locale.test.ts`

- [ ] **Step 1: 失败测试**（追加）：

```ts
describe('formatDateTimeLocale timezone override', () => {
  const iso = '2026-07-04T01:30:00Z';
  it('renders differently in Shanghai vs New_York', () => {
    const sh = formatDateTimeLocale(iso, 'en', 'Asia/Shanghai');   // Jul 4 09:30
    const ny = formatDateTimeLocale(iso, 'en', 'America/New_York'); // Jul 3 21:30
    expect(sh).not.toBe(ny);
    expect(sh).toContain('9:30');
    expect(ny).toContain('9:30');
  });
  it('tz omitted keeps prior behavior (no throw, non-empty)', () => {
    expect(formatDateTimeLocale(iso, 'zh').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 实现**：两个助手加第三参 `tz?: string`，透传 `{ timeZone: tz }`（undefined 时传空对象保持原行为）：

```ts
export function formatDateLocale(iso: string, locale: AppLocale, tz?: string): string {
  return new Date(iso).toLocaleDateString(INTL_TAG[locale], tz ? { timeZone: tz } : undefined);
}
export function formatDateTimeLocale(iso: string, locale: AppLocale, tz?: string): string {
  return new Date(iso).toLocaleString(INTL_TAG[locale], tz ? { timeZone: tz } : undefined);
}
```

- [ ] **Step 3: 测试绿 → Commit** `feat(i18n): optional timezone param on date formatters`

### T3: 迁移 + TimezoneProvider + 设置页时区卡 + 简报时间假输入移除

**Files:**
- Create: `supabase/migrations/20260704000000_timezone_auto_default.sql`
- Create: `src/components/TimezoneProvider.tsx`
- Modify: `src/app/(app)/layout.tsx`（包 Provider）
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `messages/{zh,en}/settings.json`

- [ ] **Step 1: 迁移 SQL**（字段从未被应用读写，存量值全是无人选择的默认，安全清空）：

```sql
-- timezone '' = auto (follow browser). The old default 'Asia/Shanghai' was never
-- user-chosen (field had zero readers/writers before G2) — reset to auto.
alter table public.user_preferences alter column timezone set default '';
update public.user_preferences set timezone = '' where timezone = 'Asia/Shanghai';
```

应用：`supabase db push --yes`（已 link）。

- [ ] **Step 2: TimezoneProvider**（client component；登录态读一次 prefs，context 缓存）：

```tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

// '' / null / 未登录 / 未配置 → undefined = 跟随浏览器时区
const TimezoneContext = createContext<string | undefined>(undefined);
export function useDisplayTimezone(): string | undefined { return useContext(TimezoneContext); }

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [tz, setTz] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await sb.from('user_preferences')
        .select('timezone').eq('user_id', user.id).maybeSingle();
      const v = (data as any)?.timezone;
      if (v) setTz(v);
    });
  }, []);
  return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>;
}
```

layout.tsx: `<TimezoneProvider>` 包住现 `<>...</>` 内容（Provider 是 client、layout 是 server —— 合法组合）。

- [ ] **Step 3: settings.json 扩展**（zh/en 同 shape）：

zh 追加：
```json
"timezone": {
  "heading": "🕐 时区",
  "auto": "自动（跟随浏览器）",
  "hint": "影响全站时间显示；行情时段判定始终按各交易所当地时间。"
},
"brief": {
  "heading": "⏰ 简报投递",
  "schedule": "每日 08:30 北京时间（UTC+8）投递",
  "localEquiv": "≈ 你的本地时间 {time}"
}
```
en 对应：`"timezone": {"heading":"🕐 Timezone","auto":"Auto (follow browser)","hint":"Affects all displayed times; market-hours detection always uses each exchange's local time."}, "brief": {"heading":"⏰ Brief Delivery","schedule":"Delivered daily at 08:30 Beijing time (UTC+8)","localEquiv":"≈ {time} in your local time"}`

- [ ] **Step 4: 设置页改造**（该页整体仍是硬编码中文=G1d 范围，本任务只动两块，新 UI 必须走 `useTranslations('settings')`）：
  - 新「时区」卡（放语言卡后面）：`<select>` 选项 = auto + `['Asia/Shanghai','Asia/Hong_Kong','Asia/Taipei','Asia/Tokyo','Asia/Seoul','America/New_York','America/Los_Angeles','Europe/London','UTC']`（时区 ID 本身不翻译，auto 用 `t('timezone.auto')`）；onChange 即时 upsert（模式照抄 `selectLanguage`）：`{ user_id, timezone: value }`，auto 存 `''`；成功后 `router.refresh()`。当前值初始化：mount 时从 user_preferences 读（与 Provider 相同查询）。
  - 「简报时间」卡：删除 `<input type="time">` 与 localStorage `brief-time` 读写；替换为两行只读文本 `t('brief.schedule')` + `t('brief.localEquiv', { time })`，其中 `time` = 用 `Intl.DateTimeFormat(undefined, { timeZone: 覆盖tz或浏览器默认, hour:'2-digit', minute:'2-digit' })` 把今天 00:30 UTC 格式化。
- [ ] **Step 5: gates**：`npx tsc --noEmit` + `npm test`
- [ ] **Step 6: Commit** `feat(settings): timezone preference card + honest brief-delivery copy`

### T4: /today 多市场时钟条 + 雷达页时间戳

**Files:**
- Modify: `src/app/(app)/today/page.tsx`
- Modify: `messages/{zh,en}/today.json`
- Modify: `src/app/(app)/radar/page.tsx`

- [ ] **Step 1: today.json**：`phase.*` 键改为市场无关文案（去掉"A股"字样；新增 `open`）+ 新 `clock.market.*`：

zh：
```json
"phase": {
  "pre": "盘前 · {minutes} 分钟后开盘",
  "openMorning": "盘中 · 午休还有 {minutes} 分钟",
  "lunch": "午休 · {minutes} 分钟后开盘",
  "openAfternoon": "盘中 · 收盘还有 {minutes} 分钟",
  "open": "盘中 · 收盘还有 {minutes} 分钟",
  "closed": "已收盘",
  "weekend": "周末休市"
},
"clock": { "market": { "A": "A股", "HK": "港股", "US": "美股" } }
```
en：
```json
"phase": {
  "pre": "Pre-market · opens in {minutes} min",
  "openMorning": "Trading · {minutes} min to lunch break",
  "lunch": "Lunch break · opens in {minutes} min",
  "openAfternoon": "Trading · {minutes} min to close",
  "open": "Trading · {minutes} min to close",
  "closed": "Closed",
  "weekend": "Weekend — closed"
},
"clock": { "market": { "A": "A-shares", "HK": "Hong Kong", "US": "US" } }
```

- [ ] **Step 2: today/page.tsx**：

```tsx
import { marketPhase, marketOfTicker, type ClockMarket, type MarketPhaseV2 } from '@/lib/today/clock';

const MARKET_ORDER: ClockMarket[] = ['A', 'HK', 'US'];

// allTickers 已有；市场集：
const markets = useMemo(() => {
  const s = new Set(allTickers.map(marketOfTicker));
  const list = MARKET_ORDER.filter((m) => s.has(m));
  return list.length > 0 ? list : (['A'] as ClockMarket[]);
}, [allTickers]);

const [phases, setPhases] = useState<Partial<Record<ClockMarket, MarketPhaseV2>>>({});
useEffect(() => {
  const tick = () => setPhases(Object.fromEntries(markets.map((m) => [m, marketPhase(m, new Date())])));
  tick();
  const id = setInterval(tick, 60_000);
  return () => clearInterval(id);
}, [markets]);
```

渲染（替换现单行 phase div）：

```tsx
<div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-text-dim">
  {markets.map((m) => {
    const p = phases[m];
    if (!p) return null;
    const dot = p.phase === 'open' ? 'bg-[var(--up)]' : p.phase === 'lunch' ? 'bg-[var(--warn,#eab308)]' : 'bg-[var(--text-dim)]';
    return (
      <span key={m} className="inline-flex items-center gap-1.5">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="font-semibold">{t(`clock.market.${m}`)}</span>
        {t(`phase.${p.phaseKey}`, { minutes: p.minutes ?? 0 })}
      </span>
    );
  })}
</div>
```

注意：`--warn` 若 globals.css 无此 token，用现有黄色语义 token（实现时查 globals.css，不新造）。旧 `aShareMarketPhase` import/单行渲染删除。

- [ ] **Step 3: radar/page.tsx 时间戳**：`'use client'` 组件内 `const locale = useLocale() as AppLocale; const tz = useDisplayTimezone();`，
  `· 生成 {new Date(generatedAt).toLocaleTimeString('zh-CN')}` → `· 生成 {formatDateTimeLocale(generatedAt, locale, tz)}`（"生成"两字保持 zh 硬编码不动——本页整体属 G1d 范围）。
- [ ] **Step 4: gates**：tsc + `npm test` + `npm run build`
- [ ] **Step 5: Commit** `feat(today): multi-market clock strip + timezone-aware radar timestamp`

### T5: 终审 + 合并（coordinator）

- [ ] review 重点：US DST 两测例日期换算再核（2026-07-06 EDT / 2026-01-05 EST）；既有 8 clock 测试零改动；`phase.pre` 文案不再含"A股"后 e2e zh 断言是否受影响（e2e 只断言标题，应无关——核实）；TimezoneProvider 未登录/未配置路径不抛错；设置页 upsert RLS 路径（onConflict user_id）。
- [ ] `supabase db push --yes` 已执行确认（T3 迁移落生产）。
- [ ] 全量 gates：tsc / npm test / build / npm run e2e。
- [ ] merge --no-ff 进 main + push；更新记忆（G2 完成，G1d 待办置顶）。
