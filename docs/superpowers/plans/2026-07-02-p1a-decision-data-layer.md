# P1a 决策数据层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the decision→trade→position attribution data layer (5 Supabase tables + pure position engine + REST APIs) that everything in OsbornAlpha V3 depends on.

**Architecture:** One SQL migration adds `decisions`, `trades`, `positions`, `decision_reviews`, `artifacts` (all RLS-scoped per user). A pure, unit-tested position engine (`src/lib/portfolio/positions.ts`) recomputes holdings from trade history (weighted-average cost). A thin store module (`src/lib/portfolio/store.ts`) does Supabase I/O; API routes stay thin like the existing `/api/llm/settings` pattern.

**Tech Stack:** Next.js 14 route handlers, Supabase (RLS), vitest. Spec: `docs/superpowers/specs/2026-07-02-osbornalpha-v3-refactor-design.md` §2.

**Design deviation from spec (approved rationale):** `entry_zone numrange` is replaced by `entry_low`/`entry_high` numeric columns — supabase-js has no native numrange support and two columns keep client code trivial.

---

## File Structure

- Create: `supabase/migrations/20260702090000_decision_layer.sql` — 5 tables + RLS
- Modify: `src/lib/supabase/database.types.ts` — row types + Database map
- Create: `src/lib/portfolio/positions.ts` — pure position engine
- Create: `src/lib/portfolio/positions.test.ts`
- Create: `src/lib/portfolio/validate.ts` — input validation (shared by API + future agent tools)
- Create: `src/lib/portfolio/validate.test.ts`
- Create: `src/lib/portfolio/store.ts` — Supabase CRUD + recalc wiring
- Create: `src/app/api/decisions/route.ts` — GET list / POST create
- Create: `src/app/api/decisions/[id]/route.ts` — PATCH status
- Create: `src/app/api/trades/route.ts` — GET list / POST create (+position recalc, +decision auto-execute)
- Create: `src/app/api/portfolio/route.ts` — GET aggregated positions

---

### Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/20260702090000_decision_layer.sql`

- [ ] **Step 1: Write the migration**

```sql
-- V3 decision layer: decisions → trades → positions → decision_reviews attribution
-- chain, plus artifacts (skill outputs). Every table is RLS-scoped to its owner.
-- positions is derived state: recomputed from trades by src/lib/portfolio/positions.ts.

create table public.decisions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  ticker       text not null,
  market       text not null check (market in ('A','HK','US')),
  action       text not null check (action in ('buy','sell','trim','add','hold','pass')),
  thesis       text,
  confidence   int check (confidence between 0 and 100),
  entry_low    numeric,
  entry_high   numeric,
  target_price numeric,
  stop_loss    numeric,
  horizon      text check (horizon in ('short','mid','long')),
  source_type  text not null default 'manual'
               check (source_type in ('manual','copilot','signal','radar','skill')),
  source_ref   jsonb,
  status       text not null default 'open'
               check (status in ('open','executed','expired','cancelled')),
  decided_at   timestamptz not null default now(),
  expires_at   timestamptz
);
create index decisions_user_ticker on public.decisions (user_id, ticker, decided_at desc);

create table public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  decision_id uuid references public.decisions(id) on delete set null,
  ticker      text not null,
  direction   text not null check (direction in ('buy','sell')),
  price       numeric not null check (price > 0),
  quantity    numeric not null check (quantity > 0),
  fee         numeric not null default 0 check (fee >= 0),
  currency    text not null default 'CNY',
  executed_at timestamptz not null default now(),
  note        text
);
create index trades_user_ticker on public.trades (user_id, ticker, executed_at);

create table public.positions (
  user_id      uuid not null references auth.users(id) on delete cascade,
  ticker       text not null,
  shares       numeric not null default 0,
  avg_cost     numeric not null default 0,
  realized_pnl numeric not null default 0,
  currency     text not null default 'CNY',
  opened_at    timestamptz not null,
  closed_at    timestamptz,
  primary key (user_id, ticker)
);

create table public.decision_reviews (
  id                 uuid primary key default gen_random_uuid(),
  decision_id        uuid not null references public.decisions(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  scored_at          timestamptz not null default now(),
  forward_5d_pct     numeric,
  forward_20d_pct    numeric,
  forward_60d_pct    numeric,
  hit                boolean,
  score              numeric,
  calibration_bucket text
);
create unique index decision_reviews_decision on public.decision_reviews (decision_id);

create table public.artifacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  skill_id   text not null,
  ticker     text,
  title      text not null,
  content_md text not null,
  params     jsonb,
  created_at timestamptz not null default now()
);
create index artifacts_user_skill on public.artifacts (user_id, skill_id, created_at desc);

-- RLS: own-rows-only for all four verbs, mirroring llm_settings conventions.
do $$
declare t text;
begin
  foreach t in array array['decisions','trades','positions','decision_reviews','artifacts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s own select" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s own insert" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s own update" on public.%I for update using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s own delete" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;
```

- [ ] **Step 2: Sanity-check the SQL locally**

Run: `npx sql-formatter --version >/dev/null 2>&1 || true` (no local Postgres; review by eye that every table has RLS + user_id FK, and the `do $$` block covers all 5 tables)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260702090000_decision_layer.sql
git commit -m "feat(db): decision layer migration — decisions/trades/positions/reviews/artifacts"
```

> ⚠️ **Manual step for Osborn (end of plan):** apply this migration in the Supabase dashboard (SQL editor, project `mzfcaabhuwtfvsvadvsv`) — same procedure used for `llm_settings`.

---

### Task 2: Row types

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (append before `export type Database`)

- [ ] **Step 1: Add row interfaces**

```ts
export type DecisionAction = 'buy' | 'sell' | 'trim' | 'add' | 'hold' | 'pass';
export type DecisionSource = 'manual' | 'copilot' | 'signal' | 'radar' | 'skill';
export type DecisionStatus = 'open' | 'executed' | 'expired' | 'cancelled';
export type DecisionHorizon = 'short' | 'mid' | 'long';
export type TradeDirection = 'buy' | 'sell';

export interface Decision {
  id: string;
  user_id: string;
  ticker: string;
  market: Market;
  action: DecisionAction;
  thesis: string | null;
  confidence: number | null;
  entry_low: number | null;
  entry_high: number | null;
  target_price: number | null;
  stop_loss: number | null;
  horizon: DecisionHorizon | null;
  source_type: DecisionSource;
  source_ref: Record<string, unknown> | null;
  status: DecisionStatus;
  decided_at: string;
  expires_at: string | null;
}

export interface Trade {
  id: string;
  user_id: string;
  decision_id: string | null;
  ticker: string;
  direction: TradeDirection;
  price: number;
  quantity: number;
  fee: number;
  currency: string;
  executed_at: string;
  note: string | null;
}

export interface Position {
  user_id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  realized_pnl: number;
  currency: string;
  opened_at: string;
  closed_at: string | null;
}

export interface DecisionReview {
  id: string;
  decision_id: string;
  user_id: string;
  scored_at: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
}

export interface Artifact {
  id: string;
  user_id: string;
  skill_id: string;
  ticker: string | null;
  title: string;
  content_md: string;
  params: Record<string, unknown> | null;
  created_at: string;
}
```

- [ ] **Step 2: Register in the `Database` map** (inside `Tables: {`)

```ts
      decisions: { Row: Decision; Insert: Partial<Decision>; Update: Partial<Decision> };
      trades: { Row: Trade; Insert: Partial<Trade>; Update: Partial<Trade> };
      positions: { Row: Position; Insert: Partial<Position>; Update: Partial<Position> };
      decision_reviews: { Row: DecisionReview; Insert: Partial<DecisionReview>; Update: Partial<DecisionReview> };
      artifacts: { Row: Artifact; Insert: Partial<Artifact>; Update: Partial<Artifact> };
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: no errors
```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat(db): decision-layer row types"
```

---

### Task 3: Pure position engine (TDD)

**Files:**
- Create: `src/lib/portfolio/positions.test.ts`
- Create: `src/lib/portfolio/positions.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computePositions, type TradeLike } from './positions';

const t = (o: Partial<TradeLike>): TradeLike => ({
  ticker: '300750',
  direction: 'buy',
  price: 100,
  quantity: 100,
  fee: 0,
  currency: 'CNY',
  executed_at: '2026-01-01T00:00:00Z',
  ...o,
});

describe('computePositions', () => {
  it('single buy opens a position at cost incl. fee', () => {
    const [p] = computePositions([t({ price: 100, quantity: 100, fee: 10 })]);
    expect(p.shares).toBe(100);
    expect(p.avgCost).toBeCloseTo(100.1); // (100*100+10)/100
    expect(p.realizedPnl).toBe(0);
    expect(p.closedAt).toBeNull();
  });

  it('second buy re-weights average cost', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 100 }),
      t({ price: 120, quantity: 100, executed_at: '2026-01-02T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(200);
    expect(p.avgCost).toBeCloseTo(110);
  });

  it('sell realizes pnl net of fee and keeps avg cost', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 200 }),
      t({ direction: 'sell', price: 130, quantity: 100, fee: 5, executed_at: '2026-01-03T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(100);
    expect(p.avgCost).toBeCloseTo(100);
    expect(p.realizedPnl).toBeCloseTo(100 * 30 - 5); // 2995
  });

  it('selling everything closes the position', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 100 }),
      t({ direction: 'sell', price: 90, quantity: 100, executed_at: '2026-01-04T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(0);
    expect(p.closedAt).toBe('2026-01-04T00:00:00Z');
    expect(p.realizedPnl).toBeCloseTo(-1000);
  });

  it('re-buying after close reopens with fresh openedAt', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 100 }),
      t({ direction: 'sell', price: 110, quantity: 100, executed_at: '2026-01-05T00:00:00Z' }),
      t({ price: 105, quantity: 50, executed_at: '2026-02-01T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(50);
    expect(p.avgCost).toBeCloseTo(105);
    expect(p.openedAt).toBe('2026-02-01T00:00:00Z');
    expect(p.closedAt).toBeNull();
    expect(p.realizedPnl).toBeCloseTo(1000); // carried across the reopen
  });

  it('throws on oversell (no shorting)', () => {
    expect(() =>
      computePositions([
        t({ price: 100, quantity: 100 }),
        t({ direction: 'sell', price: 100, quantity: 150, executed_at: '2026-01-06T00:00:00Z' }),
      ]),
    ).toThrow(/oversell/i);
  });

  it('groups by ticker and sorts trades by time internally', () => {
    const ps = computePositions([
      t({ ticker: 'NVDA', currency: 'USD', executed_at: '2026-01-02T00:00:00Z' }),
      t({ ticker: '300750', executed_at: '2026-01-03T00:00:00Z' }),
      t({ ticker: 'NVDA', currency: 'USD', price: 120, executed_at: '2026-01-01T00:00:00Z' }),
    ]);
    expect(ps).toHaveLength(2);
    const nvda = ps.find((p) => p.ticker === 'NVDA')!;
    expect(nvda.shares).toBe(200);
    expect(nvda.avgCost).toBeCloseTo(110);
    expect(nvda.currency).toBe('USD');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/portfolio/positions.test.ts`
Expected: FAIL — `Cannot find module './positions'`

- [ ] **Step 3: Implement**

```ts
// Pure position engine: derives holdings from a trade log using
// weighted-average cost. Buy fees capitalize into cost; sell fees reduce
// realized PnL. No shorting: an oversell throws so the API layer can 400.

export interface TradeLike {
  ticker: string;
  direction: 'buy' | 'sell';
  price: number;
  quantity: number;
  fee: number;
  currency: string;
  executed_at: string;
}

export interface PositionState {
  ticker: string;
  shares: number;
  avgCost: number;
  realizedPnl: number;
  currency: string;
  openedAt: string;
  closedAt: string | null;
}

export function computePositions(trades: TradeLike[]): PositionState[] {
  const byTicker = new Map<string, TradeLike[]>();
  for (const tr of trades) {
    const list = byTicker.get(tr.ticker) ?? [];
    list.push(tr);
    byTicker.set(tr.ticker, list);
  }

  const out: PositionState[] = [];
  for (const [ticker, list] of byTicker) {
    list.sort((a, b) => a.executed_at.localeCompare(b.executed_at));
    let shares = 0;
    let avgCost = 0;
    let realizedPnl = 0;
    let openedAt = list[0].executed_at;
    let closedAt: string | null = null;

    for (const tr of list) {
      if (tr.direction === 'buy') {
        if (shares === 0) {
          openedAt = tr.executed_at;
          closedAt = null;
        }
        avgCost = (shares * avgCost + tr.quantity * tr.price + tr.fee) / (shares + tr.quantity);
        shares += tr.quantity;
      } else {
        if (tr.quantity > shares) {
          throw new Error(`oversell: ${ticker} sell ${tr.quantity} > held ${shares}`);
        }
        realizedPnl += (tr.price - avgCost) * tr.quantity - tr.fee;
        shares -= tr.quantity;
        if (shares === 0) closedAt = tr.executed_at;
      }
    }

    out.push({
      ticker,
      shares,
      avgCost: shares > 0 ? avgCost : 0,
      realizedPnl,
      currency: list[list.length - 1].currency,
      openedAt,
      closedAt,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/portfolio/positions.test.ts`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio/positions.ts src/lib/portfolio/positions.test.ts
git commit -m "feat(portfolio): pure weighted-average-cost position engine"
```

---

### Task 4: Input validation (TDD)

**Files:**
- Create: `src/lib/portfolio/validate.test.ts`
- Create: `src/lib/portfolio/validate.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { parseDecisionInput, parseTradeInput } from './validate';

describe('parseDecisionInput', () => {
  it('accepts a minimal valid decision', () => {
    const r = parseDecisionInput({ ticker: '300750', market: 'A', action: 'buy' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ ticker: '300750', market: 'A', action: 'buy', source_type: 'manual' });
  });

  it('rejects unknown action and bad confidence', () => {
    expect(parseDecisionInput({ ticker: 'X', market: 'A', action: 'yolo' }).ok).toBe(false);
    expect(parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', confidence: 150 }).ok).toBe(false);
  });

  it('rejects inverted entry zone', () => {
    const r = parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', entry_low: 100, entry_high: 90 });
    expect(r.ok).toBe(false);
  });
});

describe('parseTradeInput', () => {
  it('accepts a valid trade with defaults', () => {
    const r = parseTradeInput({ ticker: 'NVDA', direction: 'buy', price: 120.5, quantity: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ fee: 0, currency: 'CNY' });
  });

  it('rejects non-positive price/quantity', () => {
    expect(parseTradeInput({ ticker: 'X', direction: 'buy', price: 0, quantity: 1 }).ok).toBe(false);
    expect(parseTradeInput({ ticker: 'X', direction: 'sell', price: 10, quantity: -5 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/portfolio/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`

- [ ] **Step 3: Implement**

```ts
// Shared request validation for the decision layer. Used by API routes now
// and by copilot agent tools (P1c) later — keep it dependency-free.

import type { DecisionAction, DecisionHorizon, DecisionSource, Market, TradeDirection } from '@/lib/supabase/database.types';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ACTIONS: DecisionAction[] = ['buy', 'sell', 'trim', 'add', 'hold', 'pass'];
const MARKETS: Market[] = ['A', 'HK', 'US'];
const SOURCES: DecisionSource[] = ['manual', 'copilot', 'signal', 'radar', 'skill'];
const HORIZONS: DecisionHorizon[] = ['short', 'mid', 'long'];

export interface DecisionInput {
  ticker: string;
  market: Market;
  action: DecisionAction;
  thesis?: string;
  confidence?: number;
  entry_low?: number;
  entry_high?: number;
  target_price?: number;
  stop_loss?: number;
  horizon?: DecisionHorizon;
  source_type: DecisionSource;
  source_ref?: Record<string, unknown>;
  expires_at?: string;
}

export function parseDecisionInput(body: unknown): Parsed<DecisionInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.ticker !== 'string' || !b.ticker.trim()) return { ok: false, error: 'ticker required' };
  if (!MARKETS.includes(b.market as Market)) return { ok: false, error: 'market must be A|HK|US' };
  if (!ACTIONS.includes(b.action as DecisionAction)) return { ok: false, error: `action must be one of ${ACTIONS.join('|')}` };
  const num = (k: string): number | undefined => (typeof b[k] === 'number' && Number.isFinite(b[k] as number) ? (b[k] as number) : undefined);
  const confidence = num('confidence');
  if (confidence !== undefined && (confidence < 0 || confidence > 100)) return { ok: false, error: 'confidence must be 0-100' };
  const entry_low = num('entry_low');
  const entry_high = num('entry_high');
  if (entry_low !== undefined && entry_high !== undefined && entry_low > entry_high) {
    return { ok: false, error: 'entry_low must be <= entry_high' };
  }
  const horizon = HORIZONS.includes(b.horizon as DecisionHorizon) ? (b.horizon as DecisionHorizon) : undefined;
  const source_type = SOURCES.includes(b.source_type as DecisionSource) ? (b.source_type as DecisionSource) : 'manual';
  return {
    ok: true,
    value: {
      ticker: b.ticker.trim().toUpperCase(),
      market: b.market as Market,
      action: b.action as DecisionAction,
      thesis: typeof b.thesis === 'string' ? b.thesis : undefined,
      confidence,
      entry_low,
      entry_high,
      target_price: num('target_price'),
      stop_loss: num('stop_loss'),
      horizon,
      source_type,
      source_ref: typeof b.source_ref === 'object' && b.source_ref !== null ? (b.source_ref as Record<string, unknown>) : undefined,
      expires_at: typeof b.expires_at === 'string' ? b.expires_at : undefined,
    },
  };
}

export interface TradeInput {
  ticker: string;
  direction: TradeDirection;
  price: number;
  quantity: number;
  fee: number;
  currency: string;
  decision_id?: string;
  executed_at?: string;
  note?: string;
}

export function parseTradeInput(body: unknown): Parsed<TradeInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.ticker !== 'string' || !b.ticker.trim()) return { ok: false, error: 'ticker required' };
  if (b.direction !== 'buy' && b.direction !== 'sell') return { ok: false, error: 'direction must be buy|sell' };
  if (typeof b.price !== 'number' || !(b.price > 0)) return { ok: false, error: 'price must be > 0' };
  if (typeof b.quantity !== 'number' || !(b.quantity > 0)) return { ok: false, error: 'quantity must be > 0' };
  const fee = typeof b.fee === 'number' && b.fee >= 0 ? b.fee : 0;
  return {
    ok: true,
    value: {
      ticker: b.ticker.trim().toUpperCase(),
      direction: b.direction,
      price: b.price,
      quantity: b.quantity,
      fee,
      currency: typeof b.currency === 'string' && b.currency ? b.currency : 'CNY',
      decision_id: typeof b.decision_id === 'string' ? b.decision_id : undefined,
      executed_at: typeof b.executed_at === 'string' ? b.executed_at : undefined,
      note: typeof b.note === 'string' ? b.note : undefined,
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/portfolio/validate.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio/validate.ts src/lib/portfolio/validate.test.ts
git commit -m "feat(portfolio): decision/trade input validation"
```

---

### Task 5: Store module (Supabase I/O)

**Files:**
- Create: `src/lib/portfolio/store.ts`

No unit test here — it's thin I/O glue over an RLS-authenticated client (same treatment as the existing `src/lib/llm/settings-store.ts`). Logic-bearing pieces (engine, validation) are already tested.

- [ ] **Step 1: Implement**

```ts
// Supabase I/O for the decision layer. All calls run as the signed-in user
// (RLS enforced). recalcPositions is the single write-path for positions:
// after every trade insert we recompute that ticker from full trade history.

import { getServerSupabase } from '@/lib/supabase/server';
import type { Decision, DecisionStatus, Position, Trade } from '@/lib/supabase/database.types';
import { computePositions } from './positions';
import type { DecisionInput, TradeInput } from './validate';

async function requireUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return { supabase, userId: data.user.id };
}

export async function listDecisions(opts: { ticker?: string; status?: DecisionStatus } = {}): Promise<Decision[]> {
  const { supabase, userId } = await requireUser();
  let q = supabase.from('decisions').select('*').eq('user_id', userId).order('decided_at', { ascending: false }).limit(200);
  if (opts.ticker) q = q.eq('ticker', opts.ticker);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Decision[];
}

export async function createDecision(input: DecisionInput): Promise<Decision> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from('decisions')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Decision;
}

export async function updateDecisionStatus(id: string, status: DecisionStatus): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from('decisions').update({ status }).eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listTrades(ticker?: string): Promise<Trade[]> {
  const { supabase, userId } = await requireUser();
  let q = supabase.from('trades').select('*').eq('user_id', userId).order('executed_at', { ascending: false }).limit(500);
  if (ticker) q = q.eq('ticker', ticker);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Trade[];
}

export async function createTrade(input: TradeInput): Promise<Trade> {
  const { supabase, userId } = await requireUser();

  // Pre-check oversell against current trade history before writing anything.
  const { data: history, error: hErr } = await supabase
    .from('trades').select('*').eq('user_id', userId).eq('ticker', input.ticker);
  if (hErr) throw new Error(hErr.message);
  const candidate = {
    ticker: input.ticker,
    direction: input.direction,
    price: input.price,
    quantity: input.quantity,
    fee: input.fee,
    currency: input.currency,
    executed_at: input.executed_at ?? new Date().toISOString(),
  };
  computePositions([...(history ?? []) as Trade[], candidate]); // throws on oversell

  const { data, error } = await supabase
    .from('trades')
    .insert({ ...input, executed_at: candidate.executed_at, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const trade = data as Trade;

  await recalcPositions(trade.ticker);
  if (trade.decision_id) {
    await supabase.from('decisions').update({ status: 'executed' })
      .eq('id', trade.decision_id).eq('user_id', userId).eq('status', 'open');
  }
  return trade;
}

export async function recalcPositions(ticker: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('trades').select('*').eq('user_id', userId).eq('ticker', ticker);
  if (error) throw new Error(error.message);
  const [pos] = computePositions((data ?? []) as Trade[]);
  if (!pos) return;
  const row: Position = {
    user_id: userId,
    ticker,
    shares: pos.shares,
    avg_cost: pos.avgCost,
    realized_pnl: pos.realizedPnl,
    currency: pos.currency,
    opened_at: pos.openedAt,
    closed_at: pos.closedAt,
  };
  const { error: upErr } = await supabase.from('positions').upsert(row, { onConflict: 'user_id,ticker' });
  if (upErr) throw new Error(upErr.message);
}

export async function getPortfolio(): Promise<{ positions: Position[]; totals: { realized_pnl: number; open_count: number } }> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('positions').select('*').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const positions = (data ?? []) as Position[];
  return {
    positions,
    totals: {
      realized_pnl: positions.reduce((s, p) => s + Number(p.realized_pnl), 0),
      open_count: positions.filter((p) => Number(p.shares) > 0).length,
    },
  };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: no errors
```bash
git add src/lib/portfolio/store.ts
git commit -m "feat(portfolio): supabase store with trade->position recalc wiring"
```

---

### Task 6: API routes

**Files:**
- Create: `src/app/api/decisions/route.ts`
- Create: `src/app/api/decisions/[id]/route.ts`
- Create: `src/app/api/trades/route.ts`
- Create: `src/app/api/portfolio/route.ts`

- [ ] **Step 1: `src/app/api/decisions/route.ts`**

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listDecisions, createDecision } from '@/lib/portfolio/store';
import { parseDecisionInput } from '@/lib/portfolio/validate';
import type { DecisionStatus } from '@/lib/supabase/database.types';

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const decisions = await listDecisions({
      ticker: url.searchParams.get('ticker') ?? undefined,
      status: (url.searchParams.get('status') as DecisionStatus | null) ?? undefined,
    });
    return NextResponse.json({ decisions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  const parsed = parseDecisionInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const decision = await createDecision(parsed.value);
    return NextResponse.json({ decision }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
```

- [ ] **Step 2: `src/app/api/decisions/[id]/route.ts`**

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { updateDecisionStatus } from '@/lib/portfolio/store';
import type { DecisionStatus } from '@/lib/supabase/database.types';

const STATUSES: DecisionStatus[] = ['open', 'executed', 'expired', 'cancelled'];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!STATUSES.includes(body.status as DecisionStatus)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join('|')}` }, { status: 400 });
  }
  try {
    await updateDecisionStatus(params.id, body.status as DecisionStatus);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
```

- [ ] **Step 3: `src/app/api/trades/route.ts`**

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listTrades, createTrade } from '@/lib/portfolio/store';
import { parseTradeInput } from '@/lib/portfolio/validate';

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const trades = await listTrades(url.searchParams.get('ticker') ?? undefined);
    return NextResponse.json({ trades });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  const parsed = parseTradeInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const trade = await createTrade(parsed.value);
    return NextResponse.json({ trade }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'not authenticated') return NextResponse.json({ error: msg }, { status: 401 });
    if (/oversell/i.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 4: `src/app/api/portfolio/route.ts`**

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPortfolio } from '@/lib/portfolio/store';

export async function GET() {
  try {
    return NextResponse.json(await getPortfolio());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}
```

- [ ] **Step 5: Full test + build + commit**

Run: `npm test` — Expected: all pass (86 existing + 12 new)
Run: `npm run build` — Expected: clean build, new routes listed
```bash
git add src/app/api/decisions src/app/api/trades src/app/api/portfolio
git commit -m "feat(api): decisions/trades/portfolio REST endpoints"
```

---

### Task 7: Live verification (after Osborn applies the migration)

- [ ] **Step 1: Apply migration** — Osborn runs `supabase/migrations/20260702090000_decision_layer.sql` in Supabase SQL editor (project `mzfcaabhuwtfvsvadvsv`).

- [ ] **Step 2: Smoke test locally against prod Supabase**

Run: `npm run dev`, sign in, then:
```bash
curl -s -X POST localhost:3000/api/decisions -H 'content-type: application/json' \
  -b "<auth cookies>" \
  -d '{"ticker":"300750","market":"A","action":"buy","thesis":"测试决策","confidence":75,"target_price":520,"stop_loss":418}'
```
Expected: 201 with decision row. Then POST a trade referencing `decision_id`, GET `/api/portfolio`, verify shares/avg_cost and the decision flipped to `executed`.
(Practical path: verify via the browser network tab once P2 UI exists; this task may be deferred to P2 kickoff.)

- [ ] **Step 3: Push**

```bash
git push origin main
```
