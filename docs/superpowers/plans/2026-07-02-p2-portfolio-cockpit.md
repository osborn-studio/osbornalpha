# P2 我的投资驾驶舱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/portfolio` — the approved 3-column cockpit (持仓+股票池侧栏 ｜ 焦点个股+决策条 ｜ 信号+未平决策) consuming the P1a decision APIs and P1b ui primitives.

**Architecture:** Client page (`'use client'`, matching dashboard/watchlist convention) with a `lg:grid-cols-[280px_1fr_320px]` grid. New pure P&L helpers (`src/lib/portfolio/pnl.ts`, TDD) compute unrealized P&L from positions × live quotes. New thin hooks (`usePortfolio`, `useDecisions`) follow the `useBatchQuotes` fetch pattern. Decision/Trade entry are small client forms POSTing to the existing P1a routes then refetching. Focus-stock selection is URL-driven (`?s=TICKER`, same as dashboard).

**Tech Stack:** existing hooks (`useWatchlist`, `useBatchQuotes`, `useSignals`), `KlineChart({ticker, basePrice})`, ui primitives (`Panel/Metric/Tag/Button/Card`), utils (`formatPrice/formatPct/classifyMarket/cn`).

**Scope notes (YAGNI):** `/portfolio/decisions|positions|review` sub-pages and the review-scoring cron are P2b/P3 — NOT here. Watchlist kanban stays at `/watchlist`; the cockpit's left rail only reads it. TabBar gains a 💼 entry (full IA re-shuffle is P6).

---

## File Structure

- Create: `src/lib/portfolio/pnl.ts` + `pnl.test.ts` — pure P&L / decision-lookup helpers
- Create: `src/lib/hooks/usePortfolio.ts` — `usePortfolio()` + `useDecisions()` + `postDecision()` + `postTrade()`
- Create: `src/components/portfolio/DecisionForm.tsx` — 30-second decision entry
- Create: `src/components/portfolio/TradeForm.tsx` — trade entry (prefills price from quote, links open decision)
- Create: `src/components/portfolio/PositionsRail.tsx` — left column
- Create: `src/components/portfolio/FocusPanel.tsx` — center column
- Create: `src/components/portfolio/SignalsRail.tsx` — right column
- Create: `src/app/(app)/portfolio/page.tsx` — assembly
- Modify: `src/components/TabBar.tsx` — add 💼 我的投资 → `/portfolio` after 股票池

---

### Task 1: Pure P&L helpers (TDD)

**Files:** Create `src/lib/portfolio/pnl.test.ts` then `src/lib/portfolio/pnl.ts`.

- [ ] **Step 1: failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { unrealizedPnl, portfolioSummary, latestOpenDecision } from './pnl';
import type { Position, Decision } from '@/lib/supabase/database.types';

const pos = (o: Partial<Position>): Position => ({
  user_id: 'u', ticker: '300750', shares: 100, avg_cost: 400,
  realized_pnl: 0, currency: 'CNY', opened_at: '2026-01-01', closed_at: null, ...o,
});

describe('unrealizedPnl', () => {
  it('computes value and pct from live price', () => {
    const r = unrealizedPnl(pos({}), 480);
    expect(r).toEqual({ value: 8000, pct: 20 });
  });
  it('returns null without a price or for closed positions', () => {
    expect(unrealizedPnl(pos({}), null)).toBeNull();
    expect(unrealizedPnl(pos({ shares: 0, closed_at: '2026-02-01' }), 480)).toBeNull();
  });
});

describe('portfolioSummary', () => {
  it('aggregates market value, unrealized and realized', () => {
    const s = portfolioSummary(
      [pos({}), pos({ ticker: 'NVDA', shares: 10, avg_cost: 100, realized_pnl: 50, currency: 'USD' })],
      { '300750': 480, NVDA: 120 },
    );
    expect(s.marketValue).toBe(100 * 480 + 10 * 120);
    expect(s.unrealized).toBe(8000 + 200);
    expect(s.realized).toBe(50);
    expect(s.openCount).toBe(2);
  });
  it('skips closed positions and missing quotes gracefully', () => {
    const s = portfolioSummary([pos({ shares: 0, closed_at: 'x', realized_pnl: 300 }), pos({ ticker: 'X' })], {});
    expect(s.openCount).toBe(1);
    expect(s.unrealized).toBe(0); // no quote for X yet
    expect(s.realized).toBe(300);
    expect(s.marketValue).toBe(0);
  });
});

describe('latestOpenDecision', () => {
  const d = (o: Partial<Decision>): Decision => ({
    id: 'd1', user_id: 'u', ticker: '300750', market: 'A', action: 'buy', thesis: null,
    confidence: null, entry_low: null, entry_high: null, target_price: 520, stop_loss: 418,
    horizon: null, source_type: 'manual', source_ref: null, status: 'open',
    decided_at: '2026-06-28T00:00:00Z', expires_at: null, ...o,
  });
  it('picks the newest open decision for the ticker', () => {
    const got = latestOpenDecision(
      [d({ id: 'a', decided_at: '2026-06-01T00:00:00Z' }), d({ id: 'b', decided_at: '2026-06-28T00:00:00Z' }),
       d({ id: 'c', status: 'executed', decided_at: '2026-06-30T00:00:00Z' }), d({ id: 'x', ticker: 'NVDA' })],
      '300750',
    );
    expect(got?.id).toBe('b');
  });
  it('returns null when none open', () => {
    expect(latestOpenDecision([d({ status: 'cancelled' })], '300750')).toBeNull();
  });
});
```

- [ ] **Step 2:** red run (`npx vitest run src/lib/portfolio/pnl.test.ts`). **Step 3: implement**

```ts
// Pure cockpit math: positions × live prices → P&L; decisions → discipline lookups.
// Kept free of hooks/fetch so the node-env vitest covers it.

import type { Position, Decision } from '@/lib/supabase/database.types';

export interface Pnl { value: number; pct: number }

export function unrealizedPnl(p: Position, price: number | null | undefined): Pnl | null {
  if (!price || p.shares <= 0 || p.closed_at) return null;
  const value = (price - p.avg_cost) * p.shares;
  const pct = p.avg_cost > 0 ? ((price - p.avg_cost) / p.avg_cost) * 100 : 0;
  return { value, pct };
}

export interface PortfolioSummaryOut {
  marketValue: number; unrealized: number; realized: number; openCount: number;
}

export function portfolioSummary(
  positions: Position[],
  prices: Record<string, number | null | undefined>,
): PortfolioSummaryOut {
  let marketValue = 0, unrealized = 0, realized = 0, openCount = 0;
  for (const p of positions) {
    realized += p.realized_pnl;
    if (p.shares <= 0 || p.closed_at) continue;
    openCount++;
    const price = prices[p.ticker];
    if (!price) continue;
    marketValue += price * p.shares;
    const u = unrealizedPnl(p, price);
    if (u) unrealized += u.value;
  }
  return { marketValue, unrealized, realized, openCount };
}

export function latestOpenDecision(decisions: Decision[], ticker: string): Decision | null {
  const open = decisions.filter((d) => d.ticker === ticker && d.status === 'open');
  if (!open.length) return null;
  return open.reduce((a, b) => (a.decided_at >= b.decided_at ? a : b));
}
```

- [ ] **Step 4:** green (6 tests) + `npm test` (expect 138). **Step 5:** commit `feat(portfolio): pure cockpit P&L helpers`.

---

### Task 2: Data hooks + mutations

**Files:** Create `src/lib/hooks/usePortfolio.ts`. No unit tests (thin fetch glue, same treatment as useBatchQuotes).

- [ ] **Step 1: implement**

```ts
'use client';

// Cockpit data plumbing: /api/portfolio + /api/decisions readers with refetch,
// and post helpers for decisions/trades. Same minimal-fetch style as useBatchQuotes.

import { useCallback, useEffect, useState } from 'react';
import type { Decision, DecisionStatus, Position, Trade } from '@/lib/supabase/database.types';

export interface PortfolioData {
  positions: Position[];
  totals: { realized_pnl: number; open_count: number };
}

export function usePortfolio() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `http ${res.status}`);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

export function useDecisions(opts: { ticker?: string; status?: DecisionStatus } = {}) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const { ticker, status } = opts;

  const refetch = useCallback(async () => {
    const qs = new URLSearchParams();
    if (ticker) qs.set('ticker', ticker);
    if (status) qs.set('status', status);
    try {
      const res = await fetch(`/api/decisions${qs.size ? `?${qs}` : ''}`);
      const j = await res.json();
      if (res.ok) setDecisions(j.decisions ?? []);
    } finally {
      setLoading(false);
    }
  }, [ticker, status]);

  useEffect(() => { refetch(); }, [refetch]);
  return { decisions, loading, refetch };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `http ${res.status}`);
  return j as T;
}

export function postDecision(input: Record<string, unknown>) {
  return postJson<{ decision: Decision }>('/api/decisions', input);
}
export function postTrade(input: Record<string, unknown>) {
  return postJson<{ trade: Trade }>('/api/trades', input);
}
```

- [ ] **Step 2:** `npx tsc --noEmit` clean; `npm test` unchanged. Commit `feat(portfolio): cockpit data hooks and mutations`.

---

### Task 3: DecisionForm + TradeForm

**Files:** Create `src/components/portfolio/DecisionForm.tsx`, `src/components/portfolio/TradeForm.tsx`.

Both are compact client forms using ui primitives; on success call `onDone()` (parent refetches) and show inline error text on failure (e.g. oversell 400 message surfaces verbatim).

- [ ] **Step 1: `DecisionForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { postDecision } from '@/lib/hooks/usePortfolio';
import { classifyMarket } from '@/lib/utils';
import type { DecisionAction } from '@/lib/supabase/database.types';

const ACTIONS: Array<{ a: DecisionAction; label: string; variant: 'primary' | 'danger' | 'secondary' }> = [
  { a: 'buy', label: '买入', variant: 'primary' },
  { a: 'sell', label: '卖出', variant: 'danger' },
  { a: 'hold', label: '观望', variant: 'secondary' },
];

export function DecisionForm({ ticker, onDone }: { ticker: string; onDone: () => void }) {
  const [action, setAction] = useState<DecisionAction | null>(null);
  const [thesis, setThesis] = useState('');
  const [confidence, setConfidence] = useState(70);
  const [target, setTarget] = useState('');
  const [stop, setStop] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!action) return;
    setBusy(true); setErr(null);
    try {
      await postDecision({
        ticker, market: classifyMarket(ticker), action, thesis: thesis || undefined,
        confidence, target_price: target ? Number(target) : undefined,
        stop_loss: stop ? Number(stop) : undefined, source_type: 'manual',
      });
      setAction(null); setThesis(''); setTarget(''); setStop('');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border border-[var(--border-active,var(--border))] bg-[var(--accent-wash,transparent)] p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] tracking-wider text-[var(--accent)]">决策条</span>
        {ACTIONS.map(({ a, label, variant }) => (
          <Button key={a} size="sm" variant={action === a ? variant : 'ghost'} onClick={() => setAction(action === a ? null : a)}>
            {label}
          </Button>
        ))}
      </div>
      {action && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-0.5">理由
            <input value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="一句话理由"
              className="w-44 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">信心 {confidence}%
            <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-24" />
          </label>
          <label className="flex flex-col gap-0.5">目标价
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal"
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">止损
            <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal"
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? '记录中…' : '记录决策'}</Button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-[var(--down)]">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: `TradeForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { postTrade } from '@/lib/hooks/usePortfolio';
import type { Decision, TradeDirection } from '@/lib/supabase/database.types';

export function TradeForm({ ticker, currentPrice, openDecision, onDone }: {
  ticker: string;
  currentPrice: number | null;
  openDecision: Decision | null;
  onDone: () => void;
}) {
  const [show, setShow] = useState(false);
  const [direction, setDirection] = useState<TradeDirection>('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openForm(d: TradeDirection) {
    setDirection(d);
    if (!price && currentPrice) setPrice(String(currentPrice));
    setShow(true);
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await postTrade({
        ticker, direction, price: Number(price), quantity: Number(quantity),
        fee: fee ? Number(fee) : 0,
        decision_id: openDecision?.id,
      });
      setShow(false); setQuantity(''); setFee('');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] tracking-wider text-[var(--text-dim)]">成交录入</span>
        <Button size="sm" variant="secondary" onClick={() => openForm('buy')}>买入成交</Button>
        <Button size="sm" variant="secondary" onClick={() => openForm('sell')}>卖出成交</Button>
        {openDecision && <span className="text-[10px] text-[var(--accent)]">将关联未平决策</span>}
      </div>
      {show && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
          <span className={direction === 'buy' ? 'text-[var(--up)]' : 'text-[var(--down)]'}>{direction === 'buy' ? '买入' : '卖出'}</span>
          <label className="flex flex-col gap-0.5">价格
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">数量
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric"
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">费用
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0"
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <Button size="sm" onClick={submit} disabled={busy || !price || !quantity}>{busy ? '提交中…' : '确认成交'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setShow(false)}>取消</Button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-[var(--down)]">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` clean. Commit `feat(portfolio): decision and trade entry forms`.

---

### Task 4: Rails + page assembly + TabBar

**Files:** Create `PositionsRail.tsx`, `FocusPanel.tsx`, `SignalsRail.tsx`, `src/app/(app)/portfolio/page.tsx`; modify `TabBar.tsx`.

- [ ] **Step 1: `src/components/portfolio/PositionsRail.tsx`**

```tsx
'use client';

import { Panel, Metric, Tag } from '@/components/ui';
import { unrealizedPnl, portfolioSummary } from '@/lib/portfolio/pnl';
import { cn, formatPct, formatPrice } from '@/lib/utils';
import type { Position } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useBatchQuotes';

export function PositionsRail({ positions, quotes, watchTickers, focus, onFocus }: {
  positions: Position[];
  quotes: Record<string, LiveQuote | null>;
  watchTickers: string[];
  focus: string | null;
  onFocus: (t: string) => void;
}) {
  const prices = Object.fromEntries(Object.entries(quotes).map(([t, q]) => [t, q?.price ?? null]));
  const sum = portfolioSummary(positions, prices);
  const open = positions.filter((p) => p.shares > 0 && !p.closed_at);
  const held = new Set(open.map((p) => p.ticker));

  return (
    <div className="space-y-3">
      <Panel title={`持仓 · ${open.length}`}>
        <div className="space-y-[var(--row-gap)]">
          {open.map((p) => {
            const q = quotes[p.ticker];
            const u = unrealizedPnl(p, q?.price ?? null);
            return (
              <button key={p.ticker} onClick={() => onFocus(p.ticker)}
                className={cn(
                  'num flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs',
                  focus === p.ticker
                    ? 'border-l-2 border-[var(--accent)] bg-[var(--bg-card)]'
                    : 'border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg-card)]',
                )}>
                <span>{q?.name ?? p.ticker}</span>
                <span className={u && u.value >= 0 ? 'text-up' : 'text-down'}>
                  {u ? formatPct(u.pct) : '--'}
                </span>
              </button>
            );
          })}
          {!open.length && <p className="text-xs text-[var(--text-dim)]">暂无持仓——从决策条开始记录你的第一笔</p>}
        </div>
        <div className="mt-2 flex gap-3 border-t border-[var(--border)] pt-2">
          <Metric label="总浮盈" value={formatPrice(sum.unrealized)} change={sum.unrealized} />
          <Metric label="总市值" value={formatPrice(sum.marketValue)} />
          <Metric label="已实现" value={formatPrice(sum.realized)} change={sum.realized} />
        </div>
      </Panel>

      <Panel title="股票池 · 观察中">
        <div className="space-y-1">
          {watchTickers.filter((t) => !held.has(t)).slice(0, 20).map((t) => {
            const q = quotes[t];
            return (
              <button key={t} onClick={() => onFocus(t)}
                className={cn('num flex w-full items-center justify-between px-2 py-1 text-left text-xs rounded',
                  focus === t ? 'bg-[var(--bg-card)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]')}>
                <span>{q?.name ?? t}</span>
                {q && <span className={q.change_pct >= 0 ? 'text-up' : 'text-down'}>{formatPct(q.change_pct)}</span>}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: `src/components/portfolio/FocusPanel.tsx`**

```tsx
'use client';

import { Card, Metric, Tag } from '@/components/ui';
import { KlineChart } from '@/components/KlineChart';
import { DecisionForm } from './DecisionForm';
import { TradeForm } from './TradeForm';
import { latestOpenDecision, unrealizedPnl } from '@/lib/portfolio/pnl';
import { formatPct, formatPrice } from '@/lib/utils';
import type { Decision, Position } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useBatchQuotes';

export function FocusPanel({ ticker, quote, position, decisions, onChanged }: {
  ticker: string;
  quote: LiveQuote | null;
  position: Position | null;
  decisions: Decision[];
  onChanged: () => void;
}) {
  const open = latestOpenDecision(decisions, ticker);
  const u = position ? unrealizedPnl(position, quote?.price ?? null) : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-serif text-lg text-[var(--text)]">{quote?.name ?? ticker}</span>
          <span className="ml-2 text-xs text-[var(--text-dim)]">{ticker}</span>
        </div>
        {quote && (
          <div className="num text-base" >
            <span className={quote.change_pct >= 0 ? 'text-up' : 'text-down'}>
              {formatPrice(quote.price)} {formatPct(quote.change_pct)}
            </span>
          </div>
        )}
      </div>

      {quote && <KlineChart ticker={ticker} basePrice={quote.price} />}

      <div data-density="data" className="grid grid-cols-2 gap-[var(--row-gap)] sm:grid-cols-5">
        <Metric label="持仓成本" value={position ? formatPrice(position.avg_cost) : '--'} />
        <Metric label="浮盈" value={u ? formatPct(u.pct) : '--'} change={u?.value} />
        <Metric label="目标价" value={open?.target_price ? formatPrice(open.target_price) : '--'} />
        <Metric label="止损" value={open?.stop_loss ? formatPrice(open.stop_loss) : '--'} />
        <Metric label="信心度" value={open?.confidence != null ? `${open.confidence}%` : '--'} />
      </div>

      <DecisionForm ticker={ticker} onDone={onChanged} />
      <TradeForm ticker={ticker} currentPrice={quote?.price ?? null} openDecision={open} onDone={onChanged} />

      {open && (
        <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-xs text-[var(--text-dim)]">
          📌 未平决策：{new Date(open.decided_at).toLocaleDateString('zh-CN')}
          {' '}{open.action === 'buy' ? '买入' : open.action === 'sell' ? '卖出' : open.action}
          {open.confidence != null && ` · 信心 ${open.confidence}%`}
          {open.thesis && ` · 「${open.thesis}」`}
          {open.target_price && quote && (
            <Tag tone={quote.price >= open.target_price ? 'up' : 'accent'} className="ml-1">
              距目标价 {formatPct(((open.target_price - quote.price) / quote.price) * 100)}
            </Tag>
          )}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: `src/components/portfolio/SignalsRail.tsx`**

```tsx
'use client';

import { Panel, Tag } from '@/components/ui';
import { useSignals } from '@/lib/hooks/useSignals';
import type { Decision } from '@/lib/supabase/database.types';

export function SignalsRail({ ticker, openDecisions, onFocus }: {
  ticker: string | null;
  openDecisions: Decision[];
  onFocus: (t: string) => void;
}) {
  const { events, stats, loading } = useSignals(ticker);

  return (
    <div className="space-y-3">
      <Panel title={ticker ? `信号 · ${ticker}` : '信号'}>
        {loading && <p className="text-xs text-[var(--text-dim)]">加载中…</p>}
        {!loading && !events.length && <p className="text-xs text-[var(--text-dim)]">近期无信号</p>}
        <div className="space-y-1 text-xs">
          {events.slice(0, 6).map((e: any, i: number) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[var(--text-dim)]">{String(e.date ?? '').slice(5)}</span>
              <span className="truncate pl-2">{(e.triggers ?? []).join('·')}</span>
            </div>
          ))}
        </div>
        {stats && (
          <p className="mt-2 border-t border-[var(--border)] pt-1.5 text-[10px] text-[var(--text-dim)]">
            5日胜率 {(stats.hit_rate_5d * 100).toFixed(0)}% · 均5日 {stats.avg_forward_5d_pct.toFixed(1)}%
          </p>
        )}
      </Panel>

      <Panel title={`未平决策 · ${openDecisions.length}`}>
        <div className="space-y-1 text-xs">
          {openDecisions.slice(0, 8).map((d) => (
            <button key={d.id} onClick={() => onFocus(d.ticker)}
              className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-[var(--bg-card)]">
              <span className="num">{d.ticker}</span>
              <Tag tone={d.action === 'buy' || d.action === 'add' ? 'up' : d.action === 'sell' || d.action === 'trim' ? 'down' : 'neutral'}>
                {d.action}
              </Tag>
            </button>
          ))}
          {!openDecisions.length && <p className="text-[var(--text-dim)]">暂无未平决策</p>}
        </div>
      </Panel>

      <p className="text-center text-[10px] text-[var(--text-dim)]">🎩 按 ⌘K 呼出 Copilot 分析当前标的</p>
    </div>
  );
}
```

- [ ] **Step 4: `src/app/(app)/portfolio/page.tsx`**

```tsx
'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useBatchQuotes } from '@/lib/hooks/useBatchQuotes';
import { useDecisions, usePortfolio } from '@/lib/hooks/usePortfolio';
import { PositionsRail } from '@/components/portfolio/PositionsRail';
import { FocusPanel } from '@/components/portfolio/FocusPanel';
import { SignalsRail } from '@/components/portfolio/SignalsRail';

function CockpitInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: portfolio, refetch: refetchPortfolio } = usePortfolio();
  const { decisions, refetch: refetchDecisions } = useDecisions();
  const { groups } = useWatchlist();

  const positions = portfolio?.positions ?? [];
  const openPositions = positions.filter((p) => p.shares > 0 && !p.closed_at);
  const watchTickers = useMemo(() => [...new Set(groups.flatMap((g) => g.tickers))], [groups]);
  const allTickers = useMemo(
    () => [...new Set([...openPositions.map((p) => p.ticker), ...watchTickers])],
    [openPositions, watchTickers],
  );
  const { quotes } = useBatchQuotes(allTickers, { refreshIntervalMs: 60_000 });

  const focus = params.get('s') || openPositions[0]?.ticker || watchTickers[0] || null;
  const setFocus = (t: string) => router.replace(`/portfolio?s=${encodeURIComponent(t)}`, { scroll: false });

  const openDecisions = decisions.filter((d) => d.status === 'open');
  const onChanged = () => { refetchPortfolio(); refetchDecisions(); };

  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_1fr_320px]">
      <PositionsRail positions={positions} quotes={quotes} watchTickers={watchTickers} focus={focus} onFocus={setFocus} />
      {focus ? (
        <FocusPanel
          ticker={focus}
          quote={quotes[focus] ?? null}
          position={openPositions.find((p) => p.ticker === focus) ?? null}
          decisions={decisions}
          onChanged={onChanged}
        />
      ) : (
        <div className="flex items-center justify-center text-sm text-[var(--text-dim)]">
          股票池为空——先到 📋 股票池 添加观察标的
        </div>
      )}
      <SignalsRail ticker={focus} openDecisions={openDecisions} onFocus={setFocus} />
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense>
      <CockpitInner />
    </Suspense>
  );
}
```

- [ ] **Step 5: TabBar** — in `src/components/TabBar.tsx` TABS array, insert after 股票池:

```ts
  { id: 'portfolio', emoji: '💼', label: '我的投资', href: '/portfolio' },
```

- [ ] **Step 6:** `npx tsc --noEmit`, `npm run build` (expect `/portfolio` route, `ƒ`), `npm test` (138). Commit `feat(portfolio): 3-column investment cockpit page + tab`.

**Implementation notes for this task:**
- VERIFY import paths before using: `LiveQuote` may be exported from `useBatchQuotes.ts` or `useQuote.ts` — check and import from wherever it actually lives (re-export if needed). Same for `useSignals`'s state field names — match the real hook, not this plan's guess; adjust `SignalsRail` accordingly (the plan's `events`/`stats` shapes came from a repo survey but re-verify).
- `KlineChart` props are `{ ticker, basePrice }` — verify signature before use.
- If `useSearchParams` requires a `<Suspense>` boundary at build (Next 14 CSR bailout), the wrapper above handles it; keep it.

---

### Task 5: Visual verification + review + merge

- [ ] Dev preview `/portfolio` (auth may block — verify what's verifiable: build output, then ask Osborn to check live after deploy). Verify: 3 columns render; decision form posts (401 when unauthenticated is expected locally); focus switching updates URL.
- [ ] Final combined review (spec vs plan + quality) of the whole branch.
- [ ] Merge to main, push, deploy; Osborn does the first real decision+trade entry on osbornalpha.com as acceptance.
