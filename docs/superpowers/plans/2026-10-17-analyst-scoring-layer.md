# Analyst Scoring Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level `/analyst` section where analyst recommendations are recorded append-only, scored on 5/20/60 trading-day forward returns, and simulated into one equal-weight paper book per analyst; let a portfolio decision reference ("adopt") a recommendation.

**Architecture:** Three layers connected only by recommendation id: `/research` produces ideas (untouched), `/analyst` freezes, simulates and scores recommendations (new Supabase tables `analyst_profiles`, `recommendations`, `recommendation_scores`), `/portfolio` records real trades and gains one nullable `decisions.recommendation_id`. The existing forward-return kernel in `src/lib/portfolio/review.ts` is extracted to `src/lib/scoring/forward.ts` and shared. The paper book is a pure function over stored recommendations and scores (no live quotes). S4/S6 stay in research.

**Tech Stack:** Next.js 15 App Router (client pages + Route Handlers), Supabase JS with RLS (`getServerSupabase()`), Postgres migrations under `supabase/migrations`, next-intl message domains, vitest (node env, `src/**/*.test.ts`), Playwright e2e, Tailwind with CSS-variable theme and `@/components/ui` primitives.

**Spec:** `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`

**Branch:** `codex/analyst-scoring-m1` (already created from `main` at `afa59b7`).

**Conventions you must follow (observed in this codebase):**
- Route Handlers start with `export const dynamic = 'force-dynamic';`, read the user via `getServerSupabase()` + `auth.getUser()`, and return `{ error }` JSON with `401` when the message is `'not authenticated'`.
- PostgREST returns Postgres `numeric` as strings; every store has `coerce*Row` mappers and unit tests for them only (I/O glue is not unit-tested).
- Inserts/updates go through `(supabase as any).from(...)` like `src/lib/portfolio/store.ts`.
- Client pages are `'use client'`, use `useTranslations('<domain>')`, `Panel`/`Metric`/`Tag`/`Button` from `@/components/ui`, CSS variables such as `text-[var(--text-dim)]`, and `formatPrice`/`formatPct` from `@/lib/utils`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run commands from the repo root `/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha`.

---

## File structure

**Create**

| Path | Responsibility |
|---|---|
| `src/lib/scoring/forward.ts` | Pure forward-return scorer shared by portfolio reviews and analyst recommendations |
| `src/lib/scoring/forward.test.ts` | Kernel tests (ported from review tests + base/last close assertions) |
| `supabase/migrations/20261017090000_analyst_scoring.sql` | New tables, `decisions.recommendation_id`, RLS |
| `src/lib/analyst/validate.ts` (+ `.test.ts`) | Request parsing for profiles, recommendations, withdraw |
| `src/lib/analyst/book.ts` (+ `.test.ts`) | Pure equal-weight paper book over recommendations + scores |
| `src/lib/analyst/store.ts` (+ `.test.ts`) | Supabase I/O for profiles and recommendations; row coercion |
| `src/lib/analyst/score-store.ts` (+ `.test.ts`) | On-demand scoring refresh; sets fill price once |
| `src/lib/analyst/http.ts` | Error → HTTP status mapping for analyst routes |
| `src/app/api/analyst/profiles/route.ts` | GET list (with book summaries) / POST create |
| `src/app/api/analyst/profiles/[id]/route.ts` | PATCH rename / note / archive |
| `src/app/api/analyst/recommendations/route.ts` | GET list / POST create |
| `src/app/api/analyst/recommendations/[id]/withdraw/route.ts` | POST withdraw |
| `src/app/api/analyst/book/route.ts` | GET one analyst's book |
| `src/app/api/analyst/scores/route.ts` | POST refresh scores |
| `src/lib/hooks/useAnalyst.ts` | Client fetch helpers and types for the analyst pages |
| `src/components/analyst/AnalystDisclaimer.tsx` | Fixed footer disclaimer |
| `src/components/analyst/ProfileForm.tsx` | Create analyst profile |
| `src/components/analyst/RecommendationForm.tsx` | Create recommendation |
| `src/components/analyst/BookTables.tsx` | Positions + closed lots tables |
| `src/app/(app)/analyst/page.tsx` | Overview: profile cards, forms, refresh scores |
| `src/app/(app)/analyst/[analystId]/page.tsx` | One analyst: summary, book, timeline, withdraw |
| `messages/zh/analyst.json`, `messages/en/analyst.json` | New message domain |
| `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md` | Boundary ADR |

**Modify**

| Path | Change |
|---|---|
| `src/lib/portfolio/review.ts` | Thin wrapper over `scoreForward` |
| `src/lib/supabase/database.types.ts` | New types; `Decision.recommendation_id`; table map |
| `src/lib/portfolio/review.test.ts`, `src/lib/portfolio/pnl.test.ts` | Add `recommendation_id: null` to `Decision` fixtures |
| `src/lib/portfolio/validate.ts` (+ `.test.ts`) | `isUuid`, optional `recommendation_id` on decisions |
| `src/lib/portfolio/store.ts` | `createDecision` verifies the referenced recommendation |
| `src/app/api/decisions/route.ts` | Map recommendation errors to 404/409 |
| `src/components/portfolio/DecisionForm.tsx` | Optional "adopt recommendation" select |
| `src/app/(app)/portfolio/decisions/page.tsx` | Source column with "adopted" tag |
| `messages/{zh,en}/portfolio.json` | New keys for adopt/select/column |
| `messages/{zh,en}/common.json` | `nav.analyst` |
| `src/i18n/request.ts` | Register `analyst` domain |
| `src/i18n/messages-parity.test.ts` | Include `analyst` and `portfolio` in parity check |
| `src/components/TabBar.tsx` | 7th tab |
| `messages/GLOSSARY.md` | Five new terms |
| `e2e/authed.spec.ts` | `/analyst` renders with disclaimer |
| `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md` | `recommendations.analyst_id` FK becomes `on delete cascade` (see Task 2) |

---

### Task 1: Extract the forward-return kernel

**Files:**
- Create: `src/lib/scoring/forward.ts`
- Create: `src/lib/scoring/forward.test.ts`
- Modify: `src/lib/portfolio/review.ts`

- [ ] **Step 1: Write the failing kernel test**

Create `src/lib/scoring/forward.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreForward, callDirection, type ForwardCall } from './forward';
import type { KlineBar } from '@/lib/data/sources/eastmoney';

const call = (o: Partial<ForwardCall> = {}): ForwardCall => ({
  market: 'A', action: 'buy', at: '2026-06-01T00:00:00Z', confidence: null, ...o,
});

// One bar per calendar day starting at startDate, closes as given (no gaps).
function makeBars(startDate: string, closes: number[]): KlineBar[] {
  const start = new Date(startDate + 'T00:00:00Z');
  return closes.map((close, i) => {
    const t = new Date(start.getTime() + i * 86400000);
    return { time: t.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 };
  });
}

describe('callDirection', () => {
  it('maps buy/add to +1, sell/trim/pass to -1, hold to 0', () => {
    expect(callDirection('buy')).toBe(1);
    expect(callDirection('add')).toBe(1);
    expect(callDirection('sell')).toBe(-1);
    expect(callDirection('trim')).toBe(-1);
    expect(callDirection('pass')).toBe(-1);
    expect(callDirection('hold')).toBe(0);
  });
});

describe('scoreForward — base bar', () => {
  it('uses the call-day bar as base and reports base/last close', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[60] = 123;
    const res = scoreForward(call(), makeBars('2026-06-01', closes));
    expect(res).not.toBeNull();
    expect(res!.base_close).toBe(100);
    expect(res!.base_date).toBe('2026-06-01');
    expect(res!.last_close).toBe(123);
    expect(res!.last_close_date).toBe('2026-07-31');
    expect(res!.forward_5d_pct).toBe(0);
  });

  it('falls back to the next trading day when the call day has no bar', () => {
    const res = scoreForward(call(), makeBars('2026-06-02', Array.from({ length: 61 }, () => 100)));
    expect(res!.base_date).toBe('2026-06-02');
  });

  it('returns null when every bar is before the call date', () => {
    expect(scoreForward(call(), makeBars('2026-05-01', Array.from({ length: 10 }, () => 100)))).toBeNull();
  });

  it('refuses a zero or non-finite base close', () => {
    expect(scoreForward(call(), makeBars('2026-06-01', [0, 100, 100, 100, 100, 110]))).toBeNull();
  });

  it('normalizes a late-UTC timestamp into the exchange trading day', () => {
    // 2026-06-01T23:00Z is 2026-06-02 07:00 in Shanghai → base must be the 06-02 bar (200).
    const bars = makeBars('2026-06-01', [100, 200, 200, 200, 200, 200, 220]);
    const res = scoreForward(call({ at: '2026-06-01T23:00:00Z' }), bars);
    expect(res!.base_close).toBe(200);
    expect(res!.forward_5d_pct).toBeCloseTo(10);
  });
});

describe('scoreForward — windows', () => {
  it('returns null when fewer than 5 bars follow the base', () => {
    expect(scoreForward(call(), makeBars('2026-06-01', [100, 100, 100, 100, 100]))).toBeNull();
  });

  it('fills 5d and leaves 20d/60d null with 5-19 following bars', () => {
    const res = scoreForward(call(), makeBars('2026-06-01', [100, 100, 100, 100, 100, 110, 100, 100, 100, 100, 100]));
    expect(res!.forward_5d_pct).toBe(10);
    expect(res!.forward_20d_pct).toBeNull();
    expect(res!.forward_60d_pct).toBeNull();
  });

  it('fills 5d and 20d, leaves 60d null with 20-59 following bars', () => {
    const closes = Array.from({ length: 41 }, () => 100);
    closes[5] = 105; closes[20] = 120;
    const res = scoreForward(call(), makeBars('2026-06-01', closes));
    expect(res!.forward_5d_pct).toBe(5);
    expect(res!.forward_20d_pct).toBe(20);
    expect(res!.forward_60d_pct).toBeNull();
  });
});

describe('scoreForward — hit / score / calibration', () => {
  it('buy + rising price → hit, score from 20d', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 110; closes[20] = 130;
    const res = scoreForward(call({ action: 'buy' }), makeBars('2026-06-01', closes));
    expect(res!.hit).toBe(true);
    expect(res!.score).toBe(30);
  });

  it('sell + falling price → hit, positive score', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 90; closes[20] = 80;
    const res = scoreForward(call({ action: 'sell' }), makeBars('2026-06-01', closes));
    expect(res!.hit).toBe(true);
    expect(res!.score).toBe(20);
  });

  it('hold → hit and score null, forwards populated', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 105;
    const res = scoreForward(call({ action: 'hold' }), makeBars('2026-06-01', closes));
    expect(res!.hit).toBeNull();
    expect(res!.score).toBeNull();
    expect(res!.forward_5d_pct).toBe(5);
  });

  it('uses 5d for the score when 20d is unavailable', () => {
    const res = scoreForward(call(), makeBars('2026-06-01', [100, 100, 100, 100, 100, 108, 100, 100, 100, 100, 100]));
    expect(res!.score).toBe(8);
  });

  it('flat 20d gives score 0, not the 5d fallback', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 110; closes[20] = 100;
    const res = scoreForward(call(), makeBars('2026-06-01', closes));
    expect(res!.score).toBe(0);
  });

  it('buckets confidence by 20 points and null stays null', () => {
    const bars = makeBars('2026-06-01', Array.from({ length: 61 }, () => 100));
    expect(scoreForward(call({ confidence: 100 }), bars)!.calibration_bucket).toBe('80-100');
    expect(scoreForward(call({ confidence: 45 }), bars)!.calibration_bucket).toBe('40-60');
    expect(scoreForward(call({ confidence: null }), bars)!.calibration_bucket).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/scoring/forward.test.ts`
Expected: FAIL — `Cannot find module './forward'`.

- [ ] **Step 3: Create the kernel**

Create `src/lib/scoring/forward.ts`:

```ts
// Shared forward-return scoring kernel. Pure: no fetch, no Supabase, so the
// node-env vitest covers it. Used by portfolio decision reviews
// (src/lib/portfolio/review.ts) and analyst recommendation scores
// (src/lib/analyst/score-store.ts). Rules are frozen here; both callers must
// stay byte-for-byte comparable.

import type { DecisionAction, Market } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';

export interface ForwardCall {
  market: Market;
  action: DecisionAction;
  /** UTC timestamptz of the call (decision.decided_at / recommendation.recommended_at). */
  at: string;
  confidence: number | null;
}

export interface ForwardScore {
  /** Close of the first bar on/after the call's exchange-local date. */
  base_close: number;
  base_date: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
  /** Close/date of the newest bar supplied — the book's "last price". */
  last_close: number;
  last_close_date: string;
}

export function callDirection(action: DecisionAction): 1 | -1 | 0 {
  if (action === 'buy' || action === 'add') return 1;
  if (action === 'sell' || action === 'trim' || action === 'pass') return -1;
  return 0;
}

function pct(base: number, value: number): number {
  return ((value - base) / base) * 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function calibrationBucket(confidence: number | null): string | null {
  if (confidence === null) return null;
  const bucket = Math.min(Math.floor(confidence / 20), 4);
  return `${bucket * 20}-${bucket * 20 + 20}`;
}

// Kline bar dates are exchange-local trading days; normalize the UTC call
// time into the exchange timezone before extracting the date, otherwise
// late-night calls drift one trading day.
const EXCHANGE_TZ: Record<string, string> = { A: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };

export function exchangeDate(at: string, market: string): string {
  try {
    // en-CA locale formats as YYYY-MM-DD.
    return new Date(at).toLocaleDateString('en-CA', { timeZone: EXCHANGE_TZ[market] ?? 'Asia/Shanghai' });
  } catch {
    return at.slice(0, 10);
  }
}

export function scoreForward(call: ForwardCall, bars: KlineBar[]): ForwardScore | null {
  const callDate = exchangeDate(call.at, call.market);
  const baseIdx = bars.findIndex((b) => b.time >= callDate);
  if (baseIdx === -1) return null;

  const base = bars[baseIdx].close;
  // Bad feed data (0/NaN close) would poison every downstream pct with
  // Infinity/NaN and get persisted — refuse to score instead.
  if (!Number.isFinite(base) || base <= 0) return null;

  const forwardAt = (n: number): number | null => {
    const bar = bars[baseIdx + n];
    return bar ? pct(base, bar.close) : null;
  };

  const forward_5d_pct = forwardAt(5);
  if (forward_5d_pct === null) return null;

  const forward_20d_pct = forwardAt(20);
  const forward_60d_pct = forwardAt(60);

  const dir = callDirection(call.action);
  const hit = dir !== 0 ? forward_5d_pct * dir > 0 : null;
  const score = dir !== 0 ? round1((forward_20d_pct ?? forward_5d_pct) * dir) : null;
  const last = bars[bars.length - 1];

  return {
    base_close: base,
    base_date: bars[baseIdx].time,
    forward_5d_pct,
    forward_20d_pct,
    forward_60d_pct,
    hit,
    score,
    calibration_bucket: calibrationBucket(call.confidence),
    last_close: last.close,
    last_close_date: last.time,
  };
}
```

- [ ] **Step 4: Run the kernel test**

Run: `npx vitest run src/lib/scoring/forward.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Turn `review.ts` into a wrapper**

Replace the whole of `src/lib/portfolio/review.ts` with:

```ts
// Decision scoring for /portfolio/review. The forward-return rules live in the
// shared kernel (src/lib/scoring/forward.ts); this file only adapts a Decision
// row into a ForwardCall and the result into a decision_reviews draft.

import type { Decision } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';
import { scoreForward } from '@/lib/scoring/forward';

export interface DecisionReviewDraft {
  decision_id: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
}

export function scoreDecision(d: Decision, bars: KlineBar[]): DecisionReviewDraft | null {
  const s = scoreForward({ market: d.market, action: d.action, at: d.decided_at, confidence: d.confidence }, bars);
  if (!s) return null;
  return {
    decision_id: d.id,
    forward_5d_pct: s.forward_5d_pct,
    forward_20d_pct: s.forward_20d_pct,
    forward_60d_pct: s.forward_60d_pct,
    hit: s.hit,
    score: s.score,
    calibration_bucket: s.calibration_bucket,
  };
}
```

- [ ] **Step 6: Run the old review tests unchanged**

Run: `npx vitest run src/lib/portfolio/review.test.ts src/lib/scoring/forward.test.ts`
Expected: PASS for both files; `review.test.ts` is not edited in this task.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scoring/forward.ts src/lib/scoring/forward.test.ts src/lib/portfolio/review.ts
git commit -m "refactor(scoring): extract forward-return kernel shared by reviews and analyst scores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Types and migration

**Files:**
- Create: `supabase/migrations/20261017090000_analyst_scoring.sql`
- Modify: `src/lib/supabase/database.types.ts` (around lines 246-271 and the `Tables` map near line 485)
- Modify: `src/lib/portfolio/review.test.ts`, `src/lib/portfolio/pnl.test.ts` (Decision fixtures)
- Modify: `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`

- [ ] **Step 1: Add the types**

In `src/lib/supabase/database.types.ts`, directly after the `TradeDirection` line (line 251), add:

```ts
// ─── Analyst scoring layer (spec 2026-10-17) ───
export type AnalystKind = 'human' | 'agent';
export type RecommendationSource = 'manual' | 'copilot' | 'playbook' | 'signal' | 'import';

export interface AnalystProfile {
  id: string;
  user_id: string;
  display_name: string;
  kind: AnalystKind;
  is_self: boolean;
  note: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface Recommendation {
  id: string;
  user_id: string;
  analyst_id: string;
  ticker: string;
  market: Market;
  action: DecisionAction;
  /** What the analyst said; never used as the fill price. */
  reference_price: number | null;
  rationale: string | null;
  confidence: number | null;
  target_price: number | null;
  stop_loss: number | null;
  horizon: DecisionHorizon | null;
  thesis_ref: string | null;
  source_type: RecommendationSource;
  source_ref: Record<string, unknown> | null;
  recommended_at: string;
  created_at: string;
  withdrawn_at: string | null;
  withdraw_reason: string | null;
  /** Close of the first bar on/after recommended_at; set once by the scorer. */
  fill_price: number | null;
  fill_date: string | null;
}

export interface RecommendationScore {
  recommendation_id: string;
  user_id: string;
  scored_at: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
  last_close: number | null;
  last_close_date: string | null;
}
```

In the `Decision` interface add, after `expires_at: string | null;`:

```ts
  /** Adoption link to an analyst recommendation (nullable). */
  recommendation_id: string | null;
```

In the `Tables` map, after the `decision_reviews` line, add:

```ts
      analyst_profiles: { Row: AnalystProfile; Insert: Partial<AnalystProfile>; Update: Partial<AnalystProfile> };
      recommendations: { Row: Recommendation; Insert: Partial<Recommendation>; Update: Partial<Recommendation> };
      recommendation_scores: { Row: RecommendationScore; Insert: Partial<RecommendationScore>; Update: Partial<RecommendationScore> };
```

- [ ] **Step 2: Fix the Decision fixtures**

In `src/lib/portfolio/review.test.ts` there are two fixture builders (`const d = ...` near line 6 and `const base = ...` inside `review hardening`). In both, change

```ts
    decided_at: '2026-06-01T00:00:00Z', expires_at: null, ...o,
```

to

```ts
    decided_at: '2026-06-01T00:00:00Z', expires_at: null, recommendation_id: null, ...o,
```

In `src/lib/portfolio/pnl.test.ts` (the `latestOpenDecision` fixture near line 84) change

```ts
    decided_at: '2026-06-28T00:00:00Z', expires_at: null, ...o,
```

to

```ts
    decided_at: '2026-06-28T00:00:00Z', expires_at: null, recommendation_id: null, ...o,
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If any other `Decision` literal fails with "Property 'recommendation_id' is missing", add `recommendation_id: null` to that literal too.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261017090000_analyst_scoring.sql`:

```sql
-- Analyst scoring layer (spec docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md).
-- analyst_profiles: who made a call (humans and agents; one is_self row per owner).
-- recommendations: append-only calls; only withdrawn_at/withdraw_reason and the
--   one-shot fill_price/fill_date are ever updated (enforced by the API layer).
-- recommendation_scores: forward 5/20/60 results, same kernel as decision_reviews.
-- decisions.recommendation_id: the single research→analyst→portfolio link ("adopted").
-- All tables RLS own-rows-only, same pattern as 20260702090000_decision_layer.sql.

create table public.analyst_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  kind         text not null default 'human' check (kind in ('human','agent')),
  is_self      boolean not null default false,
  note         text,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create unique index analyst_profiles_user_name on public.analyst_profiles (user_id, lower(display_name)) where archived_at is null;
create unique index analyst_profiles_user_self on public.analyst_profiles (user_id) where is_self;

create table public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- cascade (not restrict) so deleting an auth user can cascade through profiles.
  -- Profiles are never deleted by the API; they are archived.
  analyst_id      uuid not null references public.analyst_profiles(id) on delete cascade,
  ticker          text not null,
  market          text not null check (market in ('A','HK','US')),
  action          text not null check (action in ('buy','sell','trim','add','hold','pass')),
  reference_price numeric check (reference_price > 0),
  rationale       text,
  confidence      int check (confidence between 0 and 100),
  target_price    numeric,
  stop_loss       numeric,
  horizon         text check (horizon in ('short','mid','long')),
  thesis_ref      text,
  source_type     text not null default 'manual' check (source_type in ('manual','copilot','playbook','signal','import')),
  source_ref      jsonb,
  recommended_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  withdraw_reason text,
  fill_price      numeric check (fill_price > 0),
  fill_date       date
);
create index recommendations_user_analyst on public.recommendations (user_id, analyst_id, recommended_at desc);
create index recommendations_user_ticker  on public.recommendations (user_id, ticker, recommended_at desc);

create table public.recommendation_scores (
  recommendation_id  uuid primary key references public.recommendations(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  scored_at          timestamptz not null default now(),
  forward_5d_pct     numeric,
  forward_20d_pct    numeric,
  forward_60d_pct    numeric,
  hit                boolean,
  score              numeric,
  calibration_bucket text,
  last_close         numeric,
  last_close_date    date
);

alter table public.decisions add column recommendation_id uuid references public.recommendations(id) on delete set null;
create index decisions_recommendation on public.decisions (recommendation_id) where recommendation_id is not null;

do $$
declare t text;
begin
  foreach t in array array['analyst_profiles','recommendations','recommendation_scores']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || ' own select', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || ' own insert', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id)', t || ' own update', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || ' own delete', t);
  end loop;
end $$;
```

- [ ] **Step 5: Amend the spec for the FK change**

In `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md` §4, change

```
  analyst_id      uuid not null references public.analyst_profiles(id) on delete restrict,
```

to

```
  analyst_id      uuid not null references public.analyst_profiles(id) on delete cascade,
```

and in §8 change the sentence `删除档案不提供（`on delete restrict`），只归档。` to `删除档案不提供 API，只归档；外键用 cascade 以便 auth 用户删除时级联，不靠 restrict 保护。`

- [ ] **Step 6: Rehearse the migration on a local cluster**

Run: `LC_ALL=C npm run test:migrations`
Expected: exits 0 and prints the fresh/seeded schema hash (the script applies every file in `supabase/migrations` in order on a throwaway Postgres). If Postgres binaries are missing the script tells you how it provisions them; follow the existing memory note `alpha-local-db-harness-env.md` (LC_ALL=C, no `.env.local`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261017090000_analyst_scoring.sql src/lib/supabase/database.types.ts src/lib/portfolio/review.test.ts src/lib/portfolio/pnl.test.ts docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md
git commit -m "feat(analyst): schema and types for analyst profiles, recommendations and scores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Analyst request validation

**Files:**
- Modify: `src/lib/portfolio/validate.ts` (export `isUuid`)
- Create: `src/lib/analyst/validate.ts`
- Create: `src/lib/analyst/validate.test.ts`

- [ ] **Step 1: Export a UUID guard from the portfolio validator**

In `src/lib/portfolio/validate.ts`, after `const MAX_SOURCE_REF_BYTES = 16384;` add:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
```

- [ ] **Step 2: Write the failing validation tests**

Create `src/lib/analyst/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseProfileInput, parseProfilePatch, parseRecommendationInput, parseWithdrawInput } from './validate';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('parseProfileInput', () => {
  it('accepts a trimmed display name and defaults kind to human', () => {
    const r = parseProfileInput({ display_name: '  张三 ' });
    expect(r).toEqual({ ok: true, value: { display_name: '张三', kind: 'human', note: undefined } });
  });
  it('accepts kind agent and a note', () => {
    const r = parseProfileInput({ display_name: 'John', kind: 'agent', note: 'copilot' });
    expect(r.ok && r.value.kind).toBe('agent');
    expect(r.ok && r.value.note).toBe('copilot');
  });
  it('rejects blank, missing or over-long names', () => {
    expect(parseProfileInput({})).toEqual({ ok: false, error: 'display_name required' });
    expect(parseProfileInput({ display_name: '   ' })).toEqual({ ok: false, error: 'display_name required' });
    expect(parseProfileInput({ display_name: 'x'.repeat(61) })).toEqual({ ok: false, error: 'display_name too long (max 60)' });
  });
  it('rejects an unknown kind', () => {
    expect(parseProfileInput({ display_name: 'a', kind: 'robot' })).toEqual({ ok: false, error: 'kind must be human|agent' });
  });
});

describe('parseProfilePatch', () => {
  it('requires at least one field', () => {
    expect(parseProfilePatch({})).toEqual({ ok: false, error: 'nothing to update' });
  });
  it('accepts rename, note clear and archive flag', () => {
    expect(parseProfilePatch({ display_name: ' 新名 ' })).toEqual({ ok: true, value: { display_name: '新名' } });
    expect(parseProfilePatch({ note: null })).toEqual({ ok: true, value: { note: null } });
    expect(parseProfilePatch({ archived: true })).toEqual({ ok: true, value: { archived: true } });
  });
  it('rejects a non-boolean archived', () => {
    expect(parseProfilePatch({ archived: 'yes' })).toEqual({ ok: false, error: 'archived must be boolean' });
  });
});

describe('parseRecommendationInput', () => {
  const base = { analyst_id: UUID, ticker: '600519.sh', market: 'A', action: 'buy' };

  it('uppercases ticker, defaults source to manual and leaves optionals undefined', () => {
    const r = parseRecommendationInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ticker).toBe('600519.SH');
    expect(r.value.source_type).toBe('manual');
    expect(r.value.reference_price).toBeUndefined();
    expect(r.value.recommended_at).toBeUndefined();
  });
  it('rejects a non-uuid analyst_id', () => {
    expect(parseRecommendationInput({ ...base, analyst_id: 'abc' })).toEqual({ ok: false, error: 'analyst_id must be a uuid' });
  });
  it('rejects markets outside A|HK|US and unknown actions', () => {
    expect(parseRecommendationInput({ ...base, market: 'JP' })).toEqual({ ok: false, error: 'market must be A|HK|US' });
    expect(parseRecommendationInput({ ...base, action: 'short' })).toEqual({ ok: false, error: 'action must be one of buy|sell|trim|add|hold|pass' });
  });
  it('rejects non-positive reference_price and out-of-range confidence', () => {
    expect(parseRecommendationInput({ ...base, reference_price: 0 })).toEqual({ ok: false, error: 'reference_price must be > 0' });
    expect(parseRecommendationInput({ ...base, confidence: 101 })).toEqual({ ok: false, error: 'confidence must be 0-100' });
  });
  it('rejects a future recommended_at and an unparseable one', () => {
    expect(parseRecommendationInput({ ...base, recommended_at: 'yesterday' })).toEqual({ ok: false, error: 'recommended_at must be a valid date string' });
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(parseRecommendationInput({ ...base, recommended_at: future })).toEqual({ ok: false, error: 'recommended_at must not be in the future' });
  });
  it('rejects a date-only recommended_at (would be read as UTC midnight and shift US calls a day)', () => {
    expect(parseRecommendationInput({ ...base, recommended_at: '2026-06-03' })).toEqual({ ok: false, error: 'recommended_at must include a time' });
    const r = parseRecommendationInput({ ...base, recommended_at: '2026-06-03T09:30:00+08:00' });
    expect(r.ok && r.value.recommended_at).toBe('2026-06-03T01:30:00.000Z');
  });
  it('keeps a known source_type and drops arrays passed as source_ref', () => {
    const r = parseRecommendationInput({ ...base, source_type: 'playbook', source_ref: [1, 2] });
    expect(r.ok && r.value.source_type).toBe('playbook');
    expect(r.ok && r.value.source_ref).toBeUndefined();
  });
  it('caps rationale and thesis_ref length', () => {
    expect(parseRecommendationInput({ ...base, rationale: 'x'.repeat(4001) })).toEqual({ ok: false, error: 'rationale too long (max 4000)' });
    expect(parseRecommendationInput({ ...base, thesis_ref: 'x'.repeat(201) })).toEqual({ ok: false, error: 'thesis_ref too long (max 200)' });
  });
});

describe('parseWithdrawInput', () => {
  it('accepts an empty body and an optional reason', () => {
    expect(parseWithdrawInput(undefined)).toEqual({ ok: true, value: { reason: undefined } });
    expect(parseWithdrawInput({ reason: '口误' })).toEqual({ ok: true, value: { reason: '口误' } });
  });
  it('caps the reason', () => {
    expect(parseWithdrawInput({ reason: 'x'.repeat(4001) })).toEqual({ ok: false, error: 'reason too long (max 4000)' });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/analyst/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`.

- [ ] **Step 4: Implement the validator**

Create `src/lib/analyst/validate.ts`:

```ts
// Request validation for the analyst layer. Dependency-free (no fetch, no
// Supabase) so the node-env vitest covers it. Mirrors portfolio/validate.ts.

import type { AnalystKind, DecisionAction, DecisionHorizon, Market, RecommendationSource } from '@/lib/supabase/database.types';
import { isUuid, type Parsed } from '@/lib/portfolio/validate';

const KINDS: AnalystKind[] = ['human', 'agent'];
const MARKETS: Market[] = ['A', 'HK', 'US'];
const ACTIONS: DecisionAction[] = ['buy', 'sell', 'trim', 'add', 'hold', 'pass'];
const HORIZONS: DecisionHorizon[] = ['short', 'mid', 'long'];
const SOURCES: RecommendationSource[] = ['manual', 'copilot', 'playbook', 'signal', 'import'];

const MAX_NAME = 60;
const MAX_TICKER = 20;
const MAX_TEXT = 4000;
const MAX_THESIS_REF = 200;
const MAX_SOURCE_REF_BYTES = 16384;

function optionalString(v: unknown, max: number, field: string): Parsed<string | undefined> {
  if (typeof v !== 'string') return { ok: true, value: undefined };
  if (v.length > max) return { ok: false, error: `${field} too long (max ${max})` };
  return { ok: true, value: v };
}

function num(b: Record<string, unknown>, k: string): number | undefined {
  return typeof b[k] === 'number' && Number.isFinite(b[k] as number) ? (b[k] as number) : undefined;
}

export interface ProfileInput { display_name: string; kind: AnalystKind; note?: string }

export function parseProfileInput(body: unknown): Parsed<ProfileInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.display_name !== 'string' || !b.display_name.trim()) return { ok: false, error: 'display_name required' };
  const display_name = b.display_name.trim();
  if (display_name.length > MAX_NAME) return { ok: false, error: `display_name too long (max ${MAX_NAME})` };
  if (b.kind !== undefined && !KINDS.includes(b.kind as AnalystKind)) return { ok: false, error: 'kind must be human|agent' };
  const note = optionalString(b.note, MAX_TEXT, 'note');
  if (!note.ok) return note;
  return { ok: true, value: { display_name, kind: (b.kind as AnalystKind | undefined) ?? 'human', note: note.value } };
}

export interface ProfilePatch { display_name?: string; note?: string | null; archived?: boolean }

export function parseProfilePatch(body: unknown): Parsed<ProfilePatch> {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: ProfilePatch = {};
  if (b.display_name !== undefined) {
    if (typeof b.display_name !== 'string' || !b.display_name.trim()) return { ok: false, error: 'display_name required' };
    const display_name = b.display_name.trim();
    if (display_name.length > MAX_NAME) return { ok: false, error: `display_name too long (max ${MAX_NAME})` };
    patch.display_name = display_name;
  }
  if (b.note !== undefined) {
    if (b.note === null) patch.note = null;
    else {
      const note = optionalString(b.note, MAX_TEXT, 'note');
      if (!note.ok) return note;
      if (note.value !== undefined) patch.note = note.value;
    }
  }
  if (b.archived !== undefined) {
    if (typeof b.archived !== 'boolean') return { ok: false, error: 'archived must be boolean' };
    patch.archived = b.archived;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'nothing to update' };
  return { ok: true, value: patch };
}

export interface RecommendationInput {
  analyst_id: string;
  ticker: string;
  market: Market;
  action: DecisionAction;
  reference_price?: number;
  rationale?: string;
  confidence?: number;
  target_price?: number;
  stop_loss?: number;
  horizon?: DecisionHorizon;
  thesis_ref?: string;
  source_type: RecommendationSource;
  source_ref?: Record<string, unknown>;
  recommended_at?: string;
}

export function parseRecommendationInput(body: unknown): Parsed<RecommendationInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(b.analyst_id)) return { ok: false, error: 'analyst_id must be a uuid' };
  if (typeof b.ticker !== 'string' || !b.ticker.trim()) return { ok: false, error: 'ticker required' };
  const ticker = b.ticker.trim().toUpperCase();
  if (ticker.length > MAX_TICKER) return { ok: false, error: `ticker too long (max ${MAX_TICKER})` };
  if (!MARKETS.includes(b.market as Market)) return { ok: false, error: 'market must be A|HK|US' };
  if (!ACTIONS.includes(b.action as DecisionAction)) return { ok: false, error: `action must be one of ${ACTIONS.join('|')}` };
  const reference_price = num(b, 'reference_price');
  if (b.reference_price !== undefined && !(reference_price !== undefined && reference_price > 0)) return { ok: false, error: 'reference_price must be > 0' };
  const confidence = num(b, 'confidence');
  if (confidence !== undefined && (confidence < 0 || confidence > 100)) return { ok: false, error: 'confidence must be 0-100' };
  const rationale = optionalString(b.rationale, MAX_TEXT, 'rationale');
  if (!rationale.ok) return rationale;
  const thesis_ref = optionalString(b.thesis_ref, MAX_THESIS_REF, 'thesis_ref');
  if (!thesis_ref.ok) return thesis_ref;
  let recommended_at: string | undefined;
  if (typeof b.recommended_at === 'string') {
    const ms = Date.parse(b.recommended_at);
    if (isNaN(ms)) return { ok: false, error: 'recommended_at must be a valid date string' };
    // A bare date parses as UTC midnight, which is the previous trading day in New York.
    if (!/T\d{2}:\d{2}/.test(b.recommended_at)) return { ok: false, error: 'recommended_at must include a time' };
    if (ms > Date.now() + 60_000) return { ok: false, error: 'recommended_at must not be in the future' };
    recommended_at = new Date(ms).toISOString();
  }
  const source_ref =
    typeof b.source_ref === 'object' && b.source_ref !== null && !Array.isArray(b.source_ref)
      ? (b.source_ref as Record<string, unknown>)
      : undefined;
  if (source_ref !== undefined && JSON.stringify(source_ref).length > MAX_SOURCE_REF_BYTES) {
    return { ok: false, error: 'source_ref too large (max 16KB)' };
  }
  return {
    ok: true,
    value: {
      analyst_id: b.analyst_id,
      ticker,
      market: b.market as Market,
      action: b.action as DecisionAction,
      reference_price,
      rationale: rationale.value,
      confidence,
      target_price: num(b, 'target_price'),
      stop_loss: num(b, 'stop_loss'),
      horizon: HORIZONS.includes(b.horizon as DecisionHorizon) ? (b.horizon as DecisionHorizon) : undefined,
      thesis_ref: thesis_ref.value,
      source_type: SOURCES.includes(b.source_type as RecommendationSource) ? (b.source_type as RecommendationSource) : 'manual',
      source_ref,
      recommended_at,
    },
  };
}

export interface WithdrawInput { reason?: string }

export function parseWithdrawInput(body: unknown): Parsed<WithdrawInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const reason = optionalString(b.reason, MAX_TEXT, 'reason');
  if (!reason.ok) return reason;
  return { ok: true, value: { reason: reason.value } };
}
```

- [ ] **Step 5: Run the validation tests**

Run: `npx vitest run src/lib/analyst/validate.test.ts src/lib/portfolio/validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portfolio/validate.ts src/lib/analyst/validate.ts src/lib/analyst/validate.test.ts
git commit -m "feat(analyst): request validation for profiles, recommendations and withdrawals

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Equal-weight paper book (pure)

**Files:**
- Create: `src/lib/analyst/book.ts`
- Create: `src/lib/analyst/book.test.ts`

- [ ] **Step 1: Write the failing book tests**

Create `src/lib/analyst/book.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBook, type BookInput } from './book';
import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

let seq = 0;
function rec(o: Partial<Recommendation>): Recommendation {
  seq += 1;
  return {
    id: `r${seq}`, user_id: 'u', analyst_id: 'a', ticker: '600519.SH', market: 'A', action: 'buy',
    reference_price: null, rationale: null, confidence: null, target_price: null, stop_loss: null,
    horizon: null, thesis_ref: null, source_type: 'manual', source_ref: null,
    recommended_at: `2026-06-${String(seq).padStart(2, '0')}T01:00:00Z`, created_at: '2026-06-01T01:00:00Z',
    withdrawn_at: null, withdraw_reason: null, fill_price: 100, fill_date: '2026-06-01', ...o,
  };
}
function score(id: string, o: Partial<RecommendationScore> = {}): RecommendationScore {
  return {
    recommendation_id: id, user_id: 'u', scored_at: '2026-07-01T00:00:00Z',
    forward_5d_pct: 1, forward_20d_pct: 2, forward_60d_pct: null, hit: true, score: 2,
    calibration_bucket: null, last_close: 110, last_close_date: '2026-07-01', ...o,
  };
}
const row = (r: Recommendation, s: RecommendationScore | null = null): BookInput => ({ recommendation: r, score: s });

describe('buildBook — positions', () => {
  it('opens one unit per buy and averages the fill on add', () => {
    const a = rec({ action: 'buy', fill_price: 100 });
    const b = rec({ action: 'add', fill_price: 120 });
    const book = buildBook([row(a, score(a.id)), row(b, score(b.id, { last_close: 132 }))]);
    expect(book.positions).toHaveLength(1);
    const p = book.positions[0];
    expect(p.units).toBe(2);
    expect(p.avg_fill).toBe(110);
    expect(p.last_close).toBe(132); // newest score wins
    expect(p.unrealized_pct).toBe(20);
    expect(p.weight).toBe(1);
    expect(p.opened_at).toBe(a.recommended_at);
  });

  it('splits weight across tickers by units', () => {
    const a = rec({ ticker: 'AAA.SH' });
    const b = rec({ ticker: 'BBB.SH' });
    const c = rec({ ticker: 'BBB.SH', action: 'add' });
    const book = buildBook([row(a), row(b), row(c)]);
    const byTicker = Object.fromEntries(book.positions.map((p) => [p.ticker, p.weight]));
    expect(byTicker['AAA.SH']).toBeCloseTo(1 / 3);
    expect(byTicker['BBB.SH']).toBeCloseTo(2 / 3);
  });

  it('leaves last_close and unrealized null when no score exists yet', () => {
    const book = buildBook([row(rec({}))]);
    expect(book.positions[0].last_close).toBeNull();
    expect(book.positions[0].unrealized_pct).toBeNull();
  });
});

describe('buildBook — exits', () => {
  it('trim removes one unit and books one realized lot', () => {
    const a = rec({ action: 'buy', fill_price: 100 });
    const b = rec({ action: 'add', fill_price: 100 });
    const c = rec({ action: 'trim', fill_price: 150 });
    const book = buildBook([row(a), row(b), row(c)]);
    expect(book.positions[0].units).toBe(1);
    expect(book.closed).toEqual([{ ticker: '600519.SH', units: 1, avg_fill: 100, exit_price: 150, realized_pct: 50, closed_at: c.recommended_at, recommendation_id: c.id }]);
  });

  it('sell closes every unit at the average fill', () => {
    const a = rec({ action: 'buy', fill_price: 100 });
    const b = rec({ action: 'add', fill_price: 200 });
    const c = rec({ action: 'sell', fill_price: 120 });
    const book = buildBook([row(a), row(b), row(c)]);
    expect(book.positions).toHaveLength(0);
    expect(book.closed[0].units).toBe(2);
    expect(book.closed[0].realized_pct).toBe(-20); // 120/150 - 1
    expect(book.summary.avg_realized_pct).toBe(-20);
  });

  it('counts sells with no open position instead of booking them', () => {
    const book = buildBook([row(rec({ action: 'sell' }))]);
    expect(book.closed).toHaveLength(0);
    expect(book.summary.no_position_to_sell).toBe(1);
  });
});

describe('buildBook — exclusions and counters', () => {
  it('skips unpriced recommendations and counts them', () => {
    const book = buildBook([row(rec({ fill_price: null, fill_date: null }))]);
    expect(book.positions).toHaveLength(0);
    expect(book.summary.unpriced).toBe(1);
    expect(book.summary.recommendations).toBe(1);
  });

  it('ignores withdrawn recommendations entirely', () => {
    const a = rec({ withdrawn_at: '2026-06-05T00:00:00Z' });
    const book = buildBook([row(a, score(a.id))]);
    expect(book.positions).toHaveLength(0);
    expect(book.summary.recommendations).toBe(0);
    expect(book.summary.scorable).toBe(0);
  });

  it('hold and pass never touch the book but count as recommendations', () => {
    const h = rec({ action: 'hold' });
    const p = rec({ action: 'pass' });
    const book = buildBook([row(h, score(h.id, { hit: null, score: null })), row(p, score(p.id, { hit: false, score: -3 }))]);
    expect(book.positions).toHaveLength(0);
    expect(book.summary.recommendations).toBe(2);
    expect(book.summary.scorable).toBe(1);
    expect(book.summary.hit_rate).toBe(0);
    expect(book.summary.avg_score).toBe(-3);
  });

  it('processes in recommended_at order regardless of input order', () => {
    const buy = rec({ action: 'buy', recommended_at: '2026-06-01T00:00:00Z' });
    const sell = rec({ action: 'sell', recommended_at: '2026-06-02T00:00:00Z', fill_price: 110 });
    const book = buildBook([row(sell), row(buy)]);
    expect(book.positions).toHaveLength(0);
    expect(book.closed).toHaveLength(1);
    expect(book.summary.no_position_to_sell).toBe(0);
  });

  it('returns an empty book with null ratios for no input', () => {
    const book = buildBook([]);
    expect(book.positions).toEqual([]);
    expect(book.closed).toEqual([]);
    expect(book.summary).toEqual({
      recommendations: 0, scorable: 0, hits: 0, hit_rate: null, n_score: 0, avg_score: null,
      open_positions: 0, avg_unrealized_pct: null, closed_lots: 0, avg_realized_pct: null,
      unpriced: 0, no_position_to_sell: 0,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/analyst/book.test.ts`
Expected: FAIL — `Cannot find module './book'`.

- [ ] **Step 3: Implement the book**

Create `src/lib/analyst/book.ts`:

```ts
// Equal-weight paper book for one analyst. Pure and replayable: every input is
// already stored (recommendations with their one-shot fill_price, plus scores
// carrying last_close), so no live quotes are needed and the same rows always
// produce the same book.
//
// Rules (spec §6): buy/add opens 1 notional unit at fill_price; trim removes 1
// unit; sell removes all units; hold/pass leave the book alone. Unpriced rows,
// sells with no position, and withdrawn rows are counted, never booked. No cash,
// NAV, fees, FX or corporate-action adjustments.

import type { Market, Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

export interface BookInput { recommendation: Recommendation; score: RecommendationScore | null }

export interface BookPosition {
  ticker: string;
  market: Market;
  units: number;
  avg_fill: number;
  last_close: number | null;
  last_close_date: string | null;
  unrealized_pct: number | null;
  weight: number;
  opened_at: string;
}

export interface ClosedLot {
  ticker: string;
  units: number;
  avg_fill: number;
  exit_price: number;
  realized_pct: number;
  closed_at: string;
  recommendation_id: string;
}

export interface BookSummary {
  recommendations: number;
  scorable: number;
  hits: number;
  hit_rate: number | null;
  n_score: number;
  avg_score: number | null;
  open_positions: number;
  avg_unrealized_pct: number | null;
  closed_lots: number;
  avg_realized_pct: number | null;
  unpriced: number;
  no_position_to_sell: number;
}

export interface Book { positions: BookPosition[]; closed: ClosedLot[]; summary: BookSummary }

interface Open { market: Market; units: number; avg_fill: number; opened_at: string }

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pctChange = (from: number, to: number) => round2((to / from - 1) * 100);

function byTime(a: BookInput, b: BookInput): number {
  const ra = a.recommendation, rb = b.recommendation;
  return ra.recommended_at.localeCompare(rb.recommended_at)
    || ra.created_at.localeCompare(rb.created_at)
    || ra.id.localeCompare(rb.id);
}

export function buildBook(rows: BookInput[]): Book {
  const live = rows.filter((r) => r.recommendation.withdrawn_at === null).sort(byTime);
  const open = new Map<string, Open>();
  const closed: ClosedLot[] = [];
  let unpriced = 0;
  let noPositionToSell = 0;

  for (const { recommendation: r } of live) {
    if (r.action === 'hold' || r.action === 'pass') continue;
    if (r.fill_price === null) { unpriced += 1; continue; }
    const pos = open.get(r.ticker);
    if (r.action === 'buy' || r.action === 'add') {
      if (!pos) open.set(r.ticker, { market: r.market, units: 1, avg_fill: r.fill_price, opened_at: r.recommended_at });
      else {
        pos.avg_fill = (pos.avg_fill * pos.units + r.fill_price) / (pos.units + 1);
        pos.units += 1;
      }
      continue;
    }
    // sell / trim
    if (!pos || pos.units === 0) { noPositionToSell += 1; continue; }
    const units = r.action === 'sell' ? pos.units : 1;
    closed.push({
      ticker: r.ticker, units, avg_fill: round2(pos.avg_fill), exit_price: r.fill_price,
      realized_pct: pctChange(pos.avg_fill, r.fill_price), closed_at: r.recommended_at, recommendation_id: r.id,
    });
    pos.units -= units;
    if (pos.units === 0) open.delete(r.ticker);
  }

  // Newest score per ticker supplies the book's last price.
  const lastByTicker = new Map<string, { close: number; date: string }>();
  for (const { recommendation: r, score: s } of live) {
    if (!s || s.last_close === null || s.last_close_date === null) continue;
    const cur = lastByTicker.get(r.ticker);
    if (!cur || s.last_close_date > cur.date) lastByTicker.set(r.ticker, { close: s.last_close, date: s.last_close_date });
  }

  const totalUnits = [...open.values()].reduce((a, p) => a + p.units, 0);
  const positions: BookPosition[] = [...open.entries()].map(([ticker, p]) => {
    const last = lastByTicker.get(ticker) ?? null;
    return {
      ticker,
      market: p.market,
      units: p.units,
      avg_fill: round2(p.avg_fill),
      last_close: last?.close ?? null,
      last_close_date: last?.date ?? null,
      unrealized_pct: last ? pctChange(p.avg_fill, last.close) : null,
      weight: totalUnits ? p.units / totalUnits : 0,
      opened_at: p.opened_at,
    };
  });

  const scorable = live.filter((r) => r.score?.hit !== null && r.score?.hit !== undefined);
  const hits = scorable.filter((r) => r.score!.hit === true).length;
  const scores = live.map((r) => r.score?.score).filter((v): v is number => typeof v === 'number');

  return {
    positions,
    closed,
    summary: {
      recommendations: live.length,
      scorable: scorable.length,
      hits,
      hit_rate: scorable.length ? round2((hits / scorable.length) * 100) : null,
      n_score: scores.length,
      avg_score: mean(scores),
      open_positions: positions.length,
      avg_unrealized_pct: mean(positions.map((p) => p.unrealized_pct).filter((v): v is number => v !== null)),
      closed_lots: closed.length,
      avg_realized_pct: mean(closed.map((c) => c.realized_pct)),
      unpriced,
      no_position_to_sell: noPositionToSell,
    },
  };
}
```

- [ ] **Step 4: Run the book tests**

Run: `npx vitest run src/lib/analyst/book.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyst/book.ts src/lib/analyst/book.test.ts
git commit -m "feat(analyst): pure equal-weight paper book over recommendations and scores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Analyst store (Supabase I/O) and HTTP error mapping

**Files:**
- Create: `src/lib/analyst/store.ts`
- Create: `src/lib/analyst/store.test.ts`
- Create: `src/lib/analyst/http.ts`

- [ ] **Step 1: Write the failing coercion tests**

Create `src/lib/analyst/store.test.ts`:

```ts
// Only the pure row mappers are unit-tested; the rest of store.ts is thin I/O
// glue over an RLS-authenticated Supabase client (same treatment as
// src/lib/portfolio/store.test.ts).

import { describe, expect, it } from 'vitest';
import { coerceProfileRow, coerceRecommendationRow, coerceScoreRow } from './store';

describe('coerceRecommendationRow', () => {
  it('turns PostgREST numeric strings into numbers and keeps nulls', () => {
    const out = coerceRecommendationRow({
      id: 'r1', analyst_id: 'a1', ticker: 'NVDA', market: 'US', action: 'buy',
      reference_price: '120.5', confidence: 70, target_price: null, stop_loss: '99', fill_price: '121.25', fill_date: '2026-06-01',
    });
    expect(out.reference_price).toBe(120.5);
    expect(out.target_price).toBeNull();
    expect(out.stop_loss).toBe(99);
    expect(out.fill_price).toBe(121.25);
    expect(out.ticker).toBe('NVDA');
  });
});

describe('coerceScoreRow', () => {
  it('coerces every numeric column and preserves booleans', () => {
    const out = coerceScoreRow({ recommendation_id: 'r1', forward_5d_pct: '1.5', forward_20d_pct: null, forward_60d_pct: '-2', score: '3', hit: true, last_close: '110', last_close_date: '2026-07-01' });
    expect(out.forward_5d_pct).toBe(1.5);
    expect(out.forward_20d_pct).toBeNull();
    expect(out.forward_60d_pct).toBe(-2);
    expect(out.score).toBe(3);
    expect(out.hit).toBe(true);
    expect(out.last_close).toBe(110);
  });
});

describe('coerceProfileRow', () => {
  it('passes rows through untouched (no numerics)', () => {
    const row = { id: 'a1', user_id: 'u', display_name: '我', kind: 'human', is_self: true, note: null, created_at: 'x', archived_at: null };
    expect(coerceProfileRow(row)).toEqual(row);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/analyst/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Implement the store**

Create `src/lib/analyst/store.ts`:

```ts
// Supabase I/O for the analyst layer. Every call runs as the signed-in user
// (RLS enforced). Recommendations are append-only: this module exposes create
// and withdraw, nothing else mutates a row except the scorer's one-shot fill.

import { getServerSupabase } from '@/lib/supabase/server';
import type { AnalystProfile, Recommendation, RecommendationScore } from '@/lib/supabase/database.types';
import type { ProfileInput, ProfilePatch, RecommendationInput } from './validate';
import type { BookInput } from './book';

// PostgREST serializes Postgres `numeric` as JSON strings; coerce at the read
// boundary so pure functions always do real arithmetic.
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function coerceProfileRow(row: Record<string, unknown>): AnalystProfile {
  return row as unknown as AnalystProfile;
}

export function coerceRecommendationRow(row: Record<string, unknown>): Recommendation {
  const r = row as unknown as Recommendation;
  return {
    ...r,
    reference_price: n(r.reference_price),
    target_price: n(r.target_price),
    stop_loss: n(r.stop_loss),
    fill_price: n(r.fill_price),
  };
}

export function coerceScoreRow(row: Record<string, unknown>): RecommendationScore {
  const r = row as unknown as RecommendationScore;
  return {
    ...r,
    forward_5d_pct: n(r.forward_5d_pct),
    forward_20d_pct: n(r.forward_20d_pct),
    forward_60d_pct: n(r.forward_60d_pct),
    score: n(r.score),
    last_close: n(r.last_close),
  };
}

export async function requireUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return { supabase, userId: data.user.id };
}

// ─── Profiles ───

// The owner's own "我" profile is created lazily; the partial unique index on
// (user_id) where is_self makes a concurrent double-create fail with 23505, in
// which case we simply re-read.
export async function ensureSelfProfile(): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const { data: existing, error } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('is_self', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return coerceProfileRow(existing as Record<string, unknown>);

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  const display_name = (profile as { display_name?: string | null } | null)?.display_name?.trim() || '我';
  const { data: created, error: insErr } = await (supabase as any)
    .from('analyst_profiles')
    .insert({ user_id: userId, display_name, kind: 'human', is_self: true })
    .select('*')
    .single();
  if (insErr) {
    if (insErr.code !== '23505') throw new Error(insErr.message);
    const { data: again, error: againErr } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('is_self', true).single();
    if (againErr) throw new Error(againErr.message);
    return coerceProfileRow(again as Record<string, unknown>);
  }
  return coerceProfileRow(created);
}

export async function listProfiles(opts: { includeArchived?: boolean } = {}): Promise<AnalystProfile[]> {
  await ensureSelfProfile();
  const { supabase, userId } = await requireUser();
  let q = supabase.from('analyst_profiles').select('*').eq('user_id', userId).order('is_self', { ascending: false }).order('created_at', { ascending: true });
  if (!opts.includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(coerceProfileRow);
}

export async function getProfile(id: string): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('analyst not found');
  return coerceProfileRow(data as Record<string, unknown>);
}

export async function createProfile(input: ProfileInput): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await (supabase as any)
    .from('analyst_profiles')
    .insert({ user_id: userId, display_name: input.display_name, kind: input.kind, note: input.note ?? null })
    .select('*')
    .single();
  if (error) throw new Error(error.code === '23505' ? 'analyst name taken' : error.message);
  return coerceProfileRow(data);
}

export async function patchProfile(id: string, patch: ProfilePatch): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const current = await getProfile(id);
  if (patch.archived && current.is_self) throw new Error('self profile cannot be archived');
  const update: Record<string, unknown> = {};
  if (patch.display_name !== undefined) update.display_name = patch.display_name;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.archived !== undefined) update.archived_at = patch.archived ? new Date().toISOString() : null;
  const { data, error } = await (supabase as any)
    .from('analyst_profiles').update(update).eq('id', id).eq('user_id', userId).select('*').single();
  if (error) throw new Error(error.code === '23505' ? 'analyst name taken' : error.message);
  return coerceProfileRow(data);
}

// ─── Recommendations ───

export interface RecommendationView extends Recommendation {
  score: RecommendationScore | null;
  /** portfolio decision ids that adopted this recommendation */
  adopted_by: string[];
}

export async function listRecommendations(opts: { analystId?: string; ticker?: string; openOnly?: boolean } = {}): Promise<RecommendationView[]> {
  const { supabase, userId } = await requireUser();
  let q = supabase.from('recommendations').select('*').eq('user_id', userId).order('recommended_at', { ascending: false }).limit(500);
  if (opts.analystId) q = q.eq('analyst_id', opts.analystId);
  if (opts.ticker) q = q.eq('ticker', opts.ticker.trim().toUpperCase());
  if (opts.openOnly) q = q.is('withdrawn_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const recs = ((data ?? []) as Record<string, unknown>[]).map(coerceRecommendationRow);
  if (recs.length === 0) return [];
  const ids = recs.map((r) => r.id);
  const [{ data: scoreRows, error: sErr }, { data: decisionRows, error: dErr }] = await Promise.all([
    supabase.from('recommendation_scores').select('*').eq('user_id', userId).in('recommendation_id', ids),
    supabase.from('decisions').select('id, recommendation_id').eq('user_id', userId).in('recommendation_id', ids),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (dErr) throw new Error(dErr.message);
  const scores = new Map(((scoreRows ?? []) as Record<string, unknown>[]).map(coerceScoreRow).map((s) => [s.recommendation_id, s]));
  const adopted = new Map<string, string[]>();
  for (const d of (decisionRows ?? []) as Array<{ id: string; recommendation_id: string | null }>) {
    if (!d.recommendation_id) continue;
    adopted.set(d.recommendation_id, [...(adopted.get(d.recommendation_id) ?? []), d.id]);
  }
  return recs.map((r) => ({ ...r, score: scores.get(r.id) ?? null, adopted_by: adopted.get(r.id) ?? [] }));
}

export async function createRecommendation(input: RecommendationInput): Promise<Recommendation> {
  const { supabase, userId } = await requireUser();
  const analyst = await getProfile(input.analyst_id);
  if (analyst.archived_at) throw new Error('analyst archived');
  const { recommended_at, ...rest } = input;
  const { data, error } = await (supabase as any)
    .from('recommendations')
    .insert({ ...rest, user_id: userId, recommended_at: recommended_at ?? new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return coerceRecommendationRow(data);
}

export async function withdrawRecommendation(id: string, reason: string | undefined): Promise<Recommendation> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await (supabase as any)
    .from('recommendations')
    .update({ withdrawn_at: new Date().toISOString(), withdraw_reason: reason ?? null })
    .eq('id', id).eq('user_id', userId).is('withdrawn_at', null)
    .select('*');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    const { data: existing } = await supabase.from('recommendations').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    throw new Error(existing ? 'recommendation withdrawn' : 'recommendation not found');
  }
  return coerceRecommendationRow(rows[0]);
}

// Strip the view-only fields so buildBook() receives a plain Recommendation.
function toBookInput(view: RecommendationView): BookInput {
  const { score, ...rest } = view;
  const recommendation: Recommendation & { adopted_by?: string[] } = { ...rest };
  delete recommendation.adopted_by;
  return { recommendation, score };
}

// Rows for buildBook(): every recommendation of one analyst with its score.
export async function loadBookRows(analystId: string): Promise<BookInput[]> {
  const views = await listRecommendations({ analystId });
  return views.map(toBookInput);
}

// Rows for every analyst at once (overview summaries), grouped by analyst_id.
export async function loadBookRowsByAnalyst(): Promise<Map<string, BookInput[]>> {
  const views = await listRecommendations();
  const groups = new Map<string, BookInput[]>();
  for (const view of views) {
    const row = toBookInput(view);
    groups.set(view.analyst_id, [...(groups.get(view.analyst_id) ?? []), row]);
  }
  return groups;
}
```

- [ ] **Step 4: Add the HTTP error mapper**

Create `src/lib/analyst/http.ts`:

```ts
// One place that turns store error messages into HTTP statuses for the
// /api/analyst routes. Anything not listed is a 500 so unexpected failures stay loud.

import { NextResponse } from 'next/server';

const STATUS: Record<string, number> = {
  'not authenticated': 401,
  'analyst not found': 404,
  'recommendation not found': 404,
  'analyst archived': 409,
  'analyst name taken': 409,
  'self profile cannot be archived': 409,
  'recommendation withdrawn': 409,
};

export function analystError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: STATUS[msg] ?? 500 });
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/lib/analyst/store.test.ts && npm run typecheck`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analyst/store.ts src/lib/analyst/store.test.ts src/lib/analyst/http.ts
git commit -m "feat(analyst): Supabase store for profiles and append-only recommendations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Score refresh with one-shot fill price

**Files:**
- Create: `src/lib/analyst/score-store.ts`
- Create: `src/lib/analyst/score-store.test.ts`

- [ ] **Step 1: Write the failing test for the pure gate**

Create `src/lib/analyst/score-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { needsScoring } from './score-store';
import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

const rec = (o: Partial<Recommendation>): Recommendation => ({
  id: 'r1', user_id: 'u', analyst_id: 'a', ticker: 'NVDA', market: 'US', action: 'buy',
  reference_price: null, rationale: null, confidence: null, target_price: null, stop_loss: null,
  horizon: null, thesis_ref: null, source_type: 'manual', source_ref: null,
  recommended_at: new Date().toISOString(), created_at: new Date().toISOString(),
  withdrawn_at: null, withdraw_reason: null, fill_price: null, fill_date: null, ...o,
});
const score = (o: Partial<RecommendationScore>): RecommendationScore => ({
  recommendation_id: 'r1', user_id: 'u', scored_at: 'x', forward_5d_pct: 1, forward_20d_pct: null, forward_60d_pct: null,
  hit: true, score: 1, calibration_bucket: null, last_close: 1, last_close_date: '2026-01-01', ...o,
});
const DAY = 86400000;

describe('needsScoring', () => {
  it('scores anything without a score', () => {
    expect(needsScoring(rec({}), undefined)).toBe(true);
  });
  it('stops once the 60d window is resolved', () => {
    expect(needsScoring(rec({}), score({ forward_60d_pct: 3 }))).toBe(false);
  });
  it('keeps re-scoring immature rows younger than 90 days', () => {
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 10 * DAY).toISOString() }), score({}))).toBe(true);
  });
  it('gives up on immature rows older than 90 days', () => {
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 91 * DAY).toISOString() }), score({}))).toBe(false);
  });
  it('never scores withdrawn rows', () => {
    expect(needsScoring(rec({ withdrawn_at: 'x' }), undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/analyst/score-store.test.ts`
Expected: FAIL — `Cannot find module './score-store'`.

- [ ] **Step 3: Implement the refresh**

Create `src/lib/analyst/score-store.ts`:

```ts
// On-demand scoring of analyst recommendations (POST /api/analyst/scores).
// Same shape as src/lib/portfolio/review-store.ts: no cron, no service role;
// the signed-in user refreshes their own rows. Uses the shared kernel so a
// recommendation and a portfolio decision made at the same time score alike.
// First successful score also writes the recommendation's one-shot fill_price
// (= base close) which the paper book uses as the hypothetical fill.

import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { scoreForward } from '@/lib/scoring/forward';
import { coerceRecommendationRow, coerceScoreRow, requireUser } from './store';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function needsScoring(rec: Recommendation, score: RecommendationScore | undefined): boolean {
  if (rec.withdrawn_at !== null) return false;
  if (!score) return true;
  if (score.forward_60d_pct !== null) return false;
  return Date.now() - new Date(rec.recommended_at).getTime() < NINETY_DAYS_MS;
}

export async function refreshRecommendationScores(): Promise<{ scored: number; skipped: number }> {
  const { supabase, userId } = await requireUser();
  const [{ data: recRows, error: rErr }, { data: scoreRows, error: sErr }] = await Promise.all([
    supabase.from('recommendations').select('*').eq('user_id', userId).is('withdrawn_at', null),
    supabase.from('recommendation_scores').select('*').eq('user_id', userId),
  ]);
  if (rErr) throw new Error(rErr.message);
  if (sErr) throw new Error(sErr.message);

  const recs = ((recRows ?? []) as Record<string, unknown>[]).map(coerceRecommendationRow);
  const scores = new Map(((scoreRows ?? []) as Record<string, unknown>[]).map(coerceScoreRow).map((s) => [s.recommendation_id, s]));
  const candidates = recs.filter((r) => needsScoring(r, scores.get(r.id)));
  if (candidates.length === 0) return { scored: 0, skipped: 0 };

  // 120 daily bars ≈ 6 months; a recommendation older than that has no base bar
  // in range and is skipped (same limitation as decision reviews).
  const barsByTicker = new Map<string, Awaited<ReturnType<typeof fetchEastmoneyKline>>>();
  for (const ticker of new Set(candidates.map((r) => r.ticker))) {
    try {
      barsByTicker.set(ticker, await fetchEastmoneyKline(ticker, 'D', 120));
    } catch {
      barsByTicker.set(ticker, null); // skip this ticker, keep going
    }
  }

  const now = new Date().toISOString();
  const scoreUpserts: Array<Record<string, unknown>> = [];
  const fills: Array<{ id: string; fill_price: number; fill_date: string }> = [];
  let skipped = 0;
  for (const r of candidates) {
    const kline = barsByTicker.get(r.ticker);
    const s = kline ? scoreForward({ market: r.market, action: r.action, at: r.recommended_at, confidence: r.confidence }, kline.bars) : null;
    if (!s) { skipped += 1; continue; }
    scoreUpserts.push({
      recommendation_id: r.id, user_id: userId, scored_at: now,
      forward_5d_pct: s.forward_5d_pct, forward_20d_pct: s.forward_20d_pct, forward_60d_pct: s.forward_60d_pct,
      hit: s.hit, score: s.score, calibration_bucket: s.calibration_bucket,
      last_close: s.last_close, last_close_date: s.last_close_date,
    });
    if (r.fill_price === null) fills.push({ id: r.id, fill_price: s.base_close, fill_date: s.base_date });
  }

  if (scoreUpserts.length) {
    const { error } = await (supabase as any).from('recommendation_scores').upsert(scoreUpserts, { onConflict: 'recommendation_id' });
    if (error) throw new Error(error.message);
  }
  // One-shot: the `is('fill_price', null)` guard means a fill, once written, never moves.
  for (const f of fills) {
    const { error } = await (supabase as any).from('recommendations')
      .update({ fill_price: f.fill_price, fill_date: f.fill_date })
      .eq('id', f.id).eq('user_id', userId).is('fill_price', null);
    if (error) throw new Error(error.message);
  }
  return { scored: scoreUpserts.length, skipped };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/analyst && npm run typecheck`
Expected: PASS for all four analyst test files, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyst/score-store.ts src/lib/analyst/score-store.test.ts
git commit -m "feat(analyst): on-demand recommendation scoring with one-shot fill price

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: API routes

**Files:**
- Create: `src/app/api/analyst/profiles/route.ts`
- Create: `src/app/api/analyst/profiles/[id]/route.ts`
- Create: `src/app/api/analyst/recommendations/route.ts`
- Create: `src/app/api/analyst/recommendations/[id]/withdraw/route.ts`
- Create: `src/app/api/analyst/book/route.ts`
- Create: `src/app/api/analyst/scores/route.ts`

No unit tests here: routes are thin glue, like `src/app/api/decisions/route.ts`. Verification is `typecheck` + `lint` now and the e2e smoke in Task 13.

- [ ] **Step 1: Profiles list/create**

Create `src/app/api/analyst/profiles/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createProfile, listProfiles, loadBookRowsByAnalyst } from '@/lib/analyst/store';
import { buildBook, type BookSummary } from '@/lib/analyst/book';
import { parseProfileInput } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';

// GET → { profiles: Array<AnalystProfile & { summary: BookSummary }> }
export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get('archived') === '1';
  try {
    const [profiles, rowsByAnalyst] = await Promise.all([listProfiles({ includeArchived }), loadBookRowsByAnalyst()]);
    const empty: BookSummary = buildBook([]).summary;
    const out = profiles.map((p) => ({ ...p, summary: rowsByAnalyst.has(p.id) ? buildBook(rowsByAnalyst.get(p.id)!).summary : empty }));
    return NextResponse.json({ profiles: out });
  } catch (e) {
    return analystError(e);
  }
}

export async function POST(req: Request) {
  const parsed = parseProfileInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const profile = await createProfile(parsed.value);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (e) {
    return analystError(e);
  }
}
```

- [ ] **Step 2: Profile patch**

Create `src/app/api/analyst/profiles/[id]/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { patchProfile } from '@/lib/analyst/store';
import { parseProfilePatch } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });
  const parsed = parseProfilePatch(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const profile = await patchProfile(id, parsed.value);
    return NextResponse.json({ profile });
  } catch (e) {
    return analystError(e);
  }
}
```

- [ ] **Step 3: Recommendations list/create**

Create `src/app/api/analyst/recommendations/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createRecommendation, listRecommendations } from '@/lib/analyst/store';
import { parseRecommendationInput } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

// GET ?analyst=<uuid>&ticker=<code>&open=1 → { recommendations: RecommendationView[] }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const analyst = url.searchParams.get('analyst');
  if (analyst !== null && !isUuid(analyst)) return NextResponse.json({ error: 'analyst must be a uuid' }, { status: 400 });
  try {
    const recommendations = await listRecommendations({
      analystId: analyst ?? undefined,
      ticker: url.searchParams.get('ticker') ?? undefined,
      openOnly: url.searchParams.get('open') === '1',
    });
    return NextResponse.json({ recommendations });
  } catch (e) {
    return analystError(e);
  }
}

export async function POST(req: Request) {
  const parsed = parseRecommendationInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const recommendation = await createRecommendation(parsed.value);
    return NextResponse.json({ recommendation }, { status: 201 });
  } catch (e) {
    return analystError(e);
  }
}
```

- [ ] **Step 4: Withdraw**

Create `src/app/api/analyst/recommendations/[id]/withdraw/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withdrawRecommendation } from '@/lib/analyst/store';
import { parseWithdrawInput } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });
  const parsed = parseWithdrawInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const recommendation = await withdrawRecommendation(id, parsed.value.reason);
    return NextResponse.json({ recommendation });
  } catch (e) {
    return analystError(e);
  }
}
```

- [ ] **Step 5: Book**

Create `src/app/api/analyst/book/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getProfile, loadBookRows } from '@/lib/analyst/store';
import { buildBook } from '@/lib/analyst/book';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

// GET ?analyst=<uuid> → { profile, book: { positions, closed, summary } }
export async function GET(req: Request) {
  const analyst = new URL(req.url).searchParams.get('analyst');
  if (!isUuid(analyst)) return NextResponse.json({ error: 'analyst must be a uuid' }, { status: 400 });
  try {
    const [profile, rows] = await Promise.all([getProfile(analyst), loadBookRows(analyst)]);
    return NextResponse.json({ profile, book: buildBook(rows) });
  } catch (e) {
    return analystError(e);
  }
}
```

- [ ] **Step 6: Scores refresh**

Create `src/app/api/analyst/scores/route.ts`:

```ts
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { refreshRecommendationScores } from '@/lib/analyst/score-store';
import { analystError } from '@/lib/analyst/http';

export async function POST() {
  try {
    return NextResponse.json(await refreshRecommendationScores());
  } catch (e) {
    return analystError(e);
  }
}
```

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/analyst
git commit -m "feat(analyst): API routes for profiles, recommendations, book and score refresh

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Message domain and navigation label

**Files:**
- Create: `messages/zh/analyst.json`, `messages/en/analyst.json`
- Modify: `messages/zh/common.json`, `messages/en/common.json` (`nav` block)
- Modify: `src/i18n/request.ts` (`MESSAGE_DOMAINS`)
- Modify: `src/i18n/messages-parity.test.ts`

- [ ] **Step 1: Extend the parity test first (it will fail until the files exist)**

In `src/i18n/messages-parity.test.ts` change the two type unions and the loop:

```ts
type Domain = 'common' | 'components' | 'portfolio' | 'analyst';

function messageKeys(locale: 'en' | 'zh', file: Domain) {
```

```ts
function section(locale: 'en' | 'zh', file: Domain, name: string): Record<string, string> {
```

```ts
  it('keeps Chinese and English keys in parity', () => {
    for (const file of ['common', 'components', 'portfolio', 'analyst'] as const) {
      expect(messageKeys('zh', file)).toEqual(messageKeys('en', file));
    }
  });
```

Run: `npx vitest run src/i18n/messages-parity.test.ts`
Expected: FAIL — `ENOENT ... messages/zh/analyst.json`.

- [ ] **Step 2: Chinese domain**

Create `messages/zh/analyst.json`:

```json
{
  "title": "分析师评分",
  "subtitle": "分析师建议的模拟账本与前向评分。研究在「研究」里做，实盘在「我的投资」里记，这里只回答：建议如果照做，结果如何。",
  "disclaimer": "分析师模拟盘为假设成交的记分工具，不构成投资建议。Analyst paper books are hypothetical-fill scorekeeping and do not constitute investment advice.",
  "nav": { "back": "← 返回总览" },
  "common": { "loading": "加载中…", "none": "--", "n": "n={n}", "error": "加载失败：{message}" },
  "kind": { "human": "人", "agent": "Agent" },
  "action": { "buy": "买入", "sell": "卖出", "trim": "减仓", "add": "加仓", "hold": "持有", "pass": "观望" },
  "horizon": { "short": "短期", "mid": "中期", "long": "长期", "none": "未定" },
  "market": { "A": "A股", "HK": "港股", "US": "美股" },
  "profiles": {
    "title": "分析师 · {count}",
    "empty": "还没有分析师档案——先创建一个，或直接给「我」登记第一条建议。",
    "self": "我",
    "recommendations": "建议",
    "hitRate": "命中率",
    "avgScore": "平均评分",
    "openPositions": "模拟持仓",
    "view": "查看账本 →"
  },
  "profileForm": {
    "title": "新建分析师",
    "displayName": "显示名",
    "kind": "类型",
    "note": "备注（可选）",
    "submit": "创建",
    "submitting": "创建中…"
  },
  "recommendationForm": {
    "title": "登记建议",
    "analyst": "分析师",
    "ticker": "代码",
    "tickerPlaceholder": "600519.SH / 0700.HK / NVDA",
    "market": "市场",
    "action": "动作",
    "referencePrice": "参考价（分析师口述，不作成交价）",
    "rationale": "理由",
    "confidence": "信心 {pct}%",
    "targetPrice": "目标价",
    "stopLoss": "止损",
    "horizon": "期限",
    "thesisRef": "论点引用（可选）",
    "recommendedAt": "建议时间（默认现在）",
    "submit": "登记建议",
    "submitting": "登记中…",
    "saved": "已登记。成交价与评分在下次「刷新评分」后出现。"
  },
  "scores": {
    "refresh": "刷新评分",
    "refreshing": "刷新中…",
    "result": "已评分 {scored} 条，跳过 {skipped} 条",
    "pending": "评分待刷新"
  },
  "book": {
    "summaryTitle": "账本摘要",
    "recommendations": "建议数",
    "scorable": "可计分",
    "hitRate": "命中率",
    "avgScore": "平均评分",
    "openPositions": "持仓数",
    "avgUnrealized": "浮动均值",
    "avgRealized": "已实现均值",
    "unpriced": "待定价",
    "noPositionToSell": "无仓可卖",
    "positionsTitle": "模拟持仓 · {count}",
    "positionsEmpty": "暂无模拟持仓",
    "closedTitle": "已平仓 · {count}",
    "columns": {
      "ticker": "代码",
      "units": "份数",
      "avgFill": "均价",
      "lastClose": "最新价",
      "unrealized": "浮动%",
      "weight": "权重",
      "openedAt": "建仓日",
      "exitPrice": "卖价",
      "realized": "已实现%",
      "closedAt": "平仓日"
    },
    "rule": "等权规则：每条买入/加仓开 1 份，减仓减 1 份，卖出清仓；成交价取建议日 K 线收盘。不含现金、费用、汇率、分红与拆股调整。"
  },
  "timeline": {
    "title": "建议时间线 · {count}",
    "empty": "尚无建议",
    "columns": {
      "date": "日期",
      "ticker": "代码",
      "action": "动作",
      "referencePrice": "参考价",
      "fillPrice": "成交价",
      "confidence": "信心",
      "d5": "5d",
      "d20": "20d",
      "d60": "60d",
      "hit": "命中",
      "score": "评分",
      "status": "状态",
      "actions": ""
    },
    "hitYes": "✓",
    "hitNo": "✗",
    "open": "有效",
    "withdrawn": "已撤回",
    "adopted": "已采纳",
    "withdraw": "撤回",
    "withdrawPrompt": "撤回原因（可选）",
    "withdrawing": "撤回中…"
  }
}
```

- [ ] **Step 3: English domain**

Create `messages/en/analyst.json`:

```json
{
  "title": "Analyst Scoring",
  "subtitle": "Paper books and forward scores for analyst recommendations. Research happens under Research, real trades under Portfolio; this page only answers: if the calls were followed, how did they do?",
  "disclaimer": "Analyst paper books are hypothetical-fill scorekeeping and do not constitute investment advice. 分析师模拟盘为假设成交的记分工具，不构成投资建议。",
  "nav": { "back": "← Back to overview" },
  "common": { "loading": "Loading…", "none": "--", "n": "n={n}", "error": "Failed to load: {message}" },
  "kind": { "human": "Human", "agent": "Agent" },
  "action": { "buy": "Buy", "sell": "Sell", "trim": "Trim", "add": "Add", "hold": "Hold", "pass": "Pass" },
  "horizon": { "short": "Short", "mid": "Mid", "long": "Long", "none": "Unset" },
  "market": { "A": "A-share", "HK": "HK", "US": "US" },
  "profiles": {
    "title": "Analysts · {count}",
    "empty": "No analyst profiles yet — create one, or record the first recommendation under “Me”.",
    "self": "Me",
    "recommendations": "Calls",
    "hitRate": "Hit rate",
    "avgScore": "Avg score",
    "openPositions": "Paper positions",
    "view": "View book →"
  },
  "profileForm": {
    "title": "New analyst",
    "displayName": "Display name",
    "kind": "Kind",
    "note": "Note (optional)",
    "submit": "Create",
    "submitting": "Creating…"
  },
  "recommendationForm": {
    "title": "Record recommendation",
    "analyst": "Analyst",
    "ticker": "Ticker",
    "tickerPlaceholder": "600519.SH / 0700.HK / NVDA",
    "market": "Market",
    "action": "Action",
    "referencePrice": "Reference price (as stated; not the fill)",
    "rationale": "Rationale",
    "confidence": "Confidence {pct}%",
    "targetPrice": "Target",
    "stopLoss": "Stop loss",
    "horizon": "Horizon",
    "thesisRef": "Thesis reference (optional)",
    "recommendedAt": "Recommended at (defaults to now)",
    "submit": "Record",
    "submitting": "Recording…",
    "saved": "Recorded. Fill price and score appear after the next “Refresh scores”."
  },
  "scores": {
    "refresh": "Refresh scores",
    "refreshing": "Refreshing…",
    "result": "Scored {scored}, skipped {skipped}",
    "pending": "Score pending"
  },
  "book": {
    "summaryTitle": "Book summary",
    "recommendations": "Calls",
    "scorable": "Scorable",
    "hitRate": "Hit rate",
    "avgScore": "Avg score",
    "openPositions": "Positions",
    "avgUnrealized": "Avg unrealized",
    "avgRealized": "Avg realized",
    "unpriced": "Unpriced",
    "noPositionToSell": "Sell w/o position",
    "positionsTitle": "Paper positions · {count}",
    "positionsEmpty": "No paper positions",
    "closedTitle": "Closed lots · {count}",
    "columns": {
      "ticker": "Ticker",
      "units": "Units",
      "avgFill": "Avg fill",
      "lastClose": "Last",
      "unrealized": "Unrealized %",
      "weight": "Weight",
      "openedAt": "Opened",
      "exitPrice": "Exit",
      "realized": "Realized %",
      "closedAt": "Closed"
    },
    "rule": "Equal-weight rule: each buy/add opens 1 unit, trim removes 1, sell closes all; fill = K-line close on the recommendation day. No cash, fees, FX, dividends or split adjustments."
  },
  "timeline": {
    "title": "Recommendation timeline · {count}",
    "empty": "No recommendations yet",
    "columns": {
      "date": "Date",
      "ticker": "Ticker",
      "action": "Action",
      "referencePrice": "Ref price",
      "fillPrice": "Fill",
      "confidence": "Conf.",
      "d5": "5d",
      "d20": "20d",
      "d60": "60d",
      "hit": "Hit",
      "score": "Score",
      "status": "Status",
      "actions": ""
    },
    "hitYes": "✓",
    "hitNo": "✗",
    "open": "Open",
    "withdrawn": "Withdrawn",
    "adopted": "Adopted",
    "withdraw": "Withdraw",
    "withdrawPrompt": "Reason (optional)",
    "withdrawing": "Withdrawing…"
  }
}
```

- [ ] **Step 4: Nav label and domain registration**

In `messages/zh/common.json` `nav` block add `"analyst": "分析"` after `"portfolio": "我的投资",`.
In `messages/en/common.json` `nav` block add `"analyst": "Analyst"` after `"portfolio": "Portfolio",`.

In `src/i18n/request.ts` change the `MESSAGE_DOMAINS` array to end with:

```ts
  // Internal operations dashboard:
  'admin',
  // Analyst scoring layer (spec 2026-10-17):
  'analyst',
] as const;
```

- [ ] **Step 5: Run parity test**

Run: `npx vitest run src/i18n/messages-parity.test.ts`
Expected: PASS. If `portfolio` parity fails, the zh/en portfolio files already differ before this task — fix the missing key in whichever locale lacks it rather than dropping `portfolio` from the list.

- [ ] **Step 6: Commit**

```bash
git add messages/zh/analyst.json messages/en/analyst.json messages/zh/common.json messages/en/common.json src/i18n/request.ts src/i18n/messages-parity.test.ts
git commit -m "feat(i18n): analyst message domain and nav label

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Seventh tab

**Files:**
- Modify: `src/components/TabBar.tsx`

- [ ] **Step 1: Widen the navKey union**

In `src/components/TabBar.tsx` change

```ts
  navKey: 'today' | 'watchlist' | 'intel' | 'portfolio' | 'tools' | 'settings';
```

to

```ts
  navKey: 'today' | 'watchlist' | 'intel' | 'portfolio' | 'analyst' | 'tools' | 'settings';
```

- [ ] **Step 2: Insert the tab after portfolio**

Directly after the `portfolio` entry's closing `},` and before the `tools` entry, add:

```tsx
  {
    id: 'analyst', navKey: 'analyst', href: '/analyst',
    // Scoreboard glyph — rounded frame + two score rows
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 10h4M13 10h4M7 14h4M13 14h4" />
      </svg>
    ),
  },
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.tsx
git commit -m "feat(nav): analyst tab in the bottom tab bar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Client hooks, components and pages

**Files:**
- Create: `src/lib/hooks/useAnalyst.ts`
- Create: `src/components/analyst/AnalystDisclaimer.tsx`
- Create: `src/components/analyst/ProfileForm.tsx`
- Create: `src/components/analyst/RecommendationForm.tsx`
- Create: `src/components/analyst/BookTables.tsx`
- Create: `src/app/(app)/analyst/page.tsx`
- Create: `src/app/(app)/analyst/[analystId]/page.tsx`

No unit tests (client glue); verified by typecheck/lint now and the browser pass in Task 13.

- [ ] **Step 1: Fetch helpers**

Create `src/lib/hooks/useAnalyst.ts`:

```ts
'use client';

// Fetch helpers for the analyst pages. Same minimal style as usePortfolio.ts:
// plain fetch, `{ error }` body on failure, typed results.

import type { AnalystProfile, Recommendation } from '@/lib/supabase/database.types';
import type { Book, BookSummary } from '@/lib/analyst/book';
import type { RecommendationView } from '@/lib/analyst/store';

export type ProfileWithSummary = AnalystProfile & { summary: BookSummary };
export type { RecommendationView, Book, BookSummary };

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `http ${res.status}`);
  return j as T;
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export const fetchProfiles = () => fetch('/api/analyst/profiles').then((r) => json<{ profiles: ProfileWithSummary[] }>(r));
export const createProfile = (body: Record<string, unknown>) => post('/api/analyst/profiles', body).then((r) => json<{ profile: AnalystProfile }>(r));
export const patchProfile = (id: string, body: Record<string, unknown>) =>
  fetch(`/api/analyst/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => json<{ profile: AnalystProfile }>(r));

export const fetchRecommendations = (q: { analyst?: string; ticker?: string; open?: boolean } = {}) => {
  const qs = new URLSearchParams();
  if (q.analyst) qs.set('analyst', q.analyst);
  if (q.ticker) qs.set('ticker', q.ticker);
  if (q.open) qs.set('open', '1');
  return fetch(`/api/analyst/recommendations${qs.size ? `?${qs}` : ''}`).then((r) => json<{ recommendations: RecommendationView[] }>(r));
};
export const createRecommendation = (body: Record<string, unknown>) =>
  post('/api/analyst/recommendations', body).then((r) => json<{ recommendation: Recommendation }>(r));
export const withdrawRecommendation = (id: string, reason?: string) =>
  post(`/api/analyst/recommendations/${encodeURIComponent(id)}/withdraw`, { reason }).then((r) => json<{ recommendation: Recommendation }>(r));

export const fetchBook = (analyst: string) =>
  fetch(`/api/analyst/book?analyst=${encodeURIComponent(analyst)}`).then((r) => json<{ profile: AnalystProfile; book: Book }>(r));
export const refreshScores = () => post('/api/analyst/scores').then((r) => json<{ scored: number; skipped: number }>(r));
```

- [ ] **Step 2: Disclaimer footer**

Create `src/components/analyst/AnalystDisclaimer.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

export function AnalystDisclaimer() {
  const t = useTranslations('analyst');
  return (
    <footer className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-dim)]">
      {t('disclaimer')}
    </footer>
  );
}
```

- [ ] **Step 3: Profile form**

Create `src/components/analyst/ProfileForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel } from '@/components/ui';
import { createProfile } from '@/lib/hooks/useAnalyst';
import type { AnalystKind } from '@/lib/supabase/database.types';

const inputCls = 'w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm';

export function ProfileForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations('analyst');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AnalystKind>('human');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await createProfile({ display_name: name, kind, note: note || undefined });
      setName(''); setNote(''); setKind('human');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <Panel title={t('profileForm.title')}>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5">{t('profileForm.displayName')}
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-40`} maxLength={60} />
        </label>
        <label className="flex flex-col gap-0.5">{t('profileForm.kind')}
          <select value={kind} onChange={(e) => setKind(e.target.value as AnalystKind)} className={`${inputCls} w-28`}>
            <option value="human">{t('kind.human')}</option>
            <option value="agent">{t('kind.agent')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('profileForm.note')}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} w-56`} />
        </label>
        <Button size="sm" onClick={submit} disabled={busy || !name.trim()}>{busy ? t('profileForm.submitting') : t('profileForm.submit')}</Button>
      </div>
      {err && <p className="mt-1 text-xs text-[var(--down)]">{err}</p>}
    </Panel>
  );
}
```

- [ ] **Step 4: Recommendation form**

Create `src/components/analyst/RecommendationForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel } from '@/components/ui';
import { createRecommendation } from '@/lib/hooks/useAnalyst';
import { classifyMarket } from '@/lib/utils';
import type { AnalystProfile, DecisionAction, DecisionHorizon, Market } from '@/lib/supabase/database.types';

const ACTIONS: DecisionAction[] = ['buy', 'add', 'trim', 'sell', 'hold', 'pass'];
const MARKETS: Market[] = ['A', 'HK', 'US'];
const HORIZONS: Array<DecisionHorizon | ''> = ['', 'short', 'mid', 'long'];
const inputCls = 'rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm';
const num = (s: string) => (s.trim() ? Number(s) : undefined);

export function RecommendationForm({ profiles, defaultAnalystId, onCreated }: {
  profiles: AnalystProfile[];
  defaultAnalystId?: string;
  onCreated: () => void;
}) {
  const t = useTranslations('analyst');
  const [analystId, setAnalystId] = useState(defaultAnalystId ?? profiles[0]?.id ?? '');
  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState<Market>('A');
  const [marketTouched, setMarketTouched] = useState(false);
  const [action, setAction] = useState<DecisionAction>('buy');
  const [referencePrice, setReferencePrice] = useState('');
  const [rationale, setRationale] = useState('');
  const [confidence, setConfidence] = useState(70);
  const [target, setTarget] = useState('');
  const [stop, setStop] = useState('');
  const [horizon, setHorizon] = useState<DecisionHorizon | ''>('');
  const [thesisRef, setThesisRef] = useState('');
  const [recommendedAt, setRecommendedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onTicker(v: string) {
    setTicker(v);
    if (!marketTouched) {
      const m = classifyMarket(v);
      if (MARKETS.includes(m)) setMarket(m);
    }
  }

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await createRecommendation({
        analyst_id: analystId, ticker, market, action,
        reference_price: num(referencePrice), rationale: rationale || undefined, confidence,
        target_price: num(target), stop_loss: num(stop), horizon: horizon || undefined,
        thesis_ref: thesisRef || undefined, source_type: 'manual',
        recommended_at: recommendedAt ? new Date(recommendedAt).toISOString() : undefined,
      });
      setTicker(''); setReferencePrice(''); setRationale(''); setTarget(''); setStop(''); setThesisRef(''); setRecommendedAt('');
      setMsg({ ok: true, text: t('recommendationForm.saved') });
      onCreated();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  return (
    <Panel title={t('recommendationForm.title')}>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5">{t('recommendationForm.analyst')}
          <select value={analystId} onChange={(e) => setAnalystId(e.target.value)} className={`${inputCls} w-36`}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.is_self ? t('profiles.self') : p.display_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.ticker')}
          <input value={ticker} onChange={(e) => onTicker(e.target.value)} placeholder={t('recommendationForm.tickerPlaceholder')} className={`${inputCls} w-36`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.market')}
          <select value={market} onChange={(e) => { setMarket(e.target.value as Market); setMarketTouched(true); }} className={`${inputCls} w-24`}>
            {MARKETS.map((m) => <option key={m} value={m}>{t(`market.${m}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.action')}
          <select value={action} onChange={(e) => setAction(e.target.value as DecisionAction)} className={`${inputCls} w-24`}>
            {ACTIONS.map((a) => <option key={a} value={a}>{t(`action.${a}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.referencePrice')}
          <input value={referencePrice} onChange={(e) => setReferencePrice(e.target.value)} inputMode="decimal" className={`${inputCls} w-24`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.confidence', { pct: confidence })}
          <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-24" />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.targetPrice')}
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" className={`${inputCls} w-20`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.stopLoss')}
          <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" className={`${inputCls} w-20`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.horizon')}
          <select value={horizon} onChange={(e) => setHorizon(e.target.value as DecisionHorizon | '')} className={`${inputCls} w-24`}>
            {HORIZONS.map((h) => <option key={h} value={h}>{h ? t(`horizon.${h}`) : t('horizon.none')}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.thesisRef')}
          <input value={thesisRef} onChange={(e) => setThesisRef(e.target.value)} className={`${inputCls} w-40`} maxLength={200} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.recommendedAt')}
          <input type="datetime-local" value={recommendedAt} onChange={(e) => setRecommendedAt(e.target.value)} className={`${inputCls} w-48`} />
        </label>
        <label className="flex w-full flex-col gap-0.5">{t('recommendationForm.rationale')}
          <input value={rationale} onChange={(e) => setRationale(e.target.value)} className={inputCls} maxLength={4000} />
        </label>
        <Button size="sm" onClick={submit} disabled={busy || !analystId || !ticker.trim()}>
          {busy ? t('recommendationForm.submitting') : t('recommendationForm.submit')}
        </Button>
      </div>
      {msg && <p className={`mt-1 text-xs ${msg.ok ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>{msg.text}</p>}
    </Panel>
  );
}
```

- [ ] **Step 5: Book tables**

Create `src/components/analyst/BookTables.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Metric, Panel } from '@/components/ui';
import { formatPct, formatPrice } from '@/lib/utils';
import type { Book } from '@/lib/analyst/book';

const pctOrDash = (v: number | null) => (v === null ? '--' : formatPct(v));
const withN = (v: number | null, n: number, t: (k: string, o?: Record<string, number>) => string) =>
  v === null ? '--' : `${formatPct(v, false)} · ${t('common.n', { n })}`;

export function BookSummaryPanel({ book }: { book: Book }) {
  const t = useTranslations('analyst');
  const s = book.summary;
  return (
    <Panel title={t('book.summaryTitle')}>
      <div className="flex flex-wrap gap-6">
        <Metric label={t('book.recommendations')} value={String(s.recommendations)} />
        <Metric label={t('book.hitRate')} value={withN(s.hit_rate, s.scorable, t)} />
        <Metric label={t('book.avgScore')} value={s.avg_score === null ? '--' : `${s.avg_score.toFixed(1)} · ${t('common.n', { n: s.n_score })}`} change={s.avg_score ?? undefined} />
        <Metric label={t('book.openPositions')} value={String(s.open_positions)} />
        <Metric label={t('book.avgUnrealized')} value={pctOrDash(s.avg_unrealized_pct)} change={s.avg_unrealized_pct ?? undefined} />
        <Metric label={t('book.avgRealized')} value={withN(s.avg_realized_pct, s.closed_lots, t)} change={s.avg_realized_pct ?? undefined} />
        <Metric label={t('book.unpriced')} value={String(s.unpriced)} />
        <Metric label={t('book.noPositionToSell')} value={String(s.no_position_to_sell)} />
      </div>
      <p className="mt-2 text-xs text-[var(--text-dim)]">{t('book.rule')}</p>
    </Panel>
  );
}

export function BookTables({ book }: { book: Book }) {
  const t = useTranslations('analyst');
  const th = 'pb-1 font-normal';
  return (
    <>
      <Panel title={t('book.positionsTitle', { count: book.positions.length })}>
        {book.positions.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">{t('book.positionsEmpty')}</p>
        ) : (
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className={th}>{t('book.columns.ticker')}</th>
                <th className={th}>{t('book.columns.units')}</th>
                <th className={th}>{t('book.columns.avgFill')}</th>
                <th className={th}>{t('book.columns.lastClose')}</th>
                <th className={th}>{t('book.columns.unrealized')}</th>
                <th className={th}>{t('book.columns.weight')}</th>
                <th className={th}>{t('book.columns.openedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {book.positions.map((p) => (
                <tr key={p.ticker} className="border-t border-[var(--border)]">
                  <td className="py-1">{p.ticker}</td>
                  <td className="py-1">{p.units}</td>
                  <td className="py-1">{formatPrice(p.avg_fill)}</td>
                  <td className="py-1">{p.last_close === null ? '--' : formatPrice(p.last_close)}</td>
                  <td className={`py-1 ${p.unrealized_pct === null ? '' : p.unrealized_pct >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>{pctOrDash(p.unrealized_pct)}</td>
                  <td className="py-1">{formatPct(p.weight * 100, false)}</td>
                  <td className="py-1">{p.opened_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {book.closed.length > 0 && (
        <Panel title={t('book.closedTitle', { count: book.closed.length })}>
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className={th}>{t('book.columns.ticker')}</th>
                <th className={th}>{t('book.columns.units')}</th>
                <th className={th}>{t('book.columns.avgFill')}</th>
                <th className={th}>{t('book.columns.exitPrice')}</th>
                <th className={th}>{t('book.columns.realized')}</th>
                <th className={th}>{t('book.columns.closedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {book.closed.map((c) => (
                <tr key={c.recommendation_id} className="border-t border-[var(--border)]">
                  <td className="py-1">{c.ticker}</td>
                  <td className="py-1">{c.units}</td>
                  <td className="py-1">{formatPrice(c.avg_fill)}</td>
                  <td className="py-1">{formatPrice(c.exit_price)}</td>
                  <td className={`py-1 ${c.realized_pct >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>{formatPct(c.realized_pct)}</td>
                  <td className="py-1">{c.closed_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
```

- [ ] **Step 6: Overview page**

Create `src/app/(app)/analyst/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel, Tag } from '@/components/ui';
import { fetchProfiles, refreshScores, type ProfileWithSummary } from '@/lib/hooks/useAnalyst';
import { AnalystDisclaimer } from '@/components/analyst/AnalystDisclaimer';
import { ProfileForm } from '@/components/analyst/ProfileForm';
import { RecommendationForm } from '@/components/analyst/RecommendationForm';

export default function AnalystOverviewPage() {
  const t = useTranslations('analyst');
  const [profiles, setProfiles] = useState<ProfileWithSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { profiles } = await fetchProfiles();
      setProfiles(profiles);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProfiles([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const r = await refreshScores();
      setRefreshMsg(t('scores.result', r));
      await load();
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : String(e));
    } finally { setRefreshing(false); }
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-dim)]">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? t('scores.refreshing') : t('scores.refresh')}</Button>
          {refreshMsg && <span className="text-xs text-[var(--text-dim)]">{refreshMsg}</span>}
        </div>
      </header>

      {profiles === null ? (
        <p className="text-sm text-[var(--text-dim)]">{t('common.loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--down)]">{t('common.error', { message: error })}</p>
      ) : (
        <Panel title={t('profiles.title', { count: profiles.length })}>
          {profiles.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">{t('profiles.empty')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => (
                <Link key={p.id} href={`/analyst/${p.id}`} className="rounded-md border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.is_self ? t('profiles.self') : p.display_name}</span>
                    <Tag tone={p.kind === 'agent' ? 'accent' : 'neutral'}>{t(`kind.${p.kind}`)}</Tag>
                  </div>
                  <dl className="num mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-[var(--text-dim)]">{t('profiles.recommendations')}</dt><dd>{p.summary.recommendations}</dd>
                    <dt className="text-[var(--text-dim)]">{t('profiles.hitRate')}</dt><dd>{p.summary.hit_rate === null ? '--' : `${p.summary.hit_rate.toFixed(0)}% · ${t('common.n', { n: p.summary.scorable })}`}</dd>
                    <dt className="text-[var(--text-dim)]">{t('profiles.avgScore')}</dt><dd>{p.summary.avg_score === null ? '--' : p.summary.avg_score.toFixed(1)}</dd>
                    <dt className="text-[var(--text-dim)]">{t('profiles.openPositions')}</dt><dd>{p.summary.open_positions}</dd>
                  </dl>
                  <div className="mt-2 text-xs text-[var(--accent)]">{t('profiles.view')}</div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      )}

      {profiles && profiles.length > 0 && <RecommendationForm profiles={profiles} onCreated={load} />}
      <ProfileForm onCreated={load} />
      <AnalystDisclaimer />
    </div>
  );
}
```

- [ ] **Step 7: Analyst detail page**

Create `src/app/(app)/analyst/[analystId]/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel, Tag } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { fetchBook, fetchRecommendations, withdrawRecommendation, type Book, type RecommendationView } from '@/lib/hooks/useAnalyst';
import type { AnalystProfile } from '@/lib/supabase/database.types';
import { AnalystDisclaimer } from '@/components/analyst/AnalystDisclaimer';
import { BookSummaryPanel, BookTables } from '@/components/analyst/BookTables';

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

export default function AnalystDetailPage() {
  const t = useTranslations('analyst');
  const { analystId } = useParams<{ analystId: string }>();
  const [profile, setProfile] = useState<AnalystProfile | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [recs, setRecs] = useState<RecommendationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([fetchBook(analystId), fetchRecommendations({ analyst: analystId })]);
      setProfile(b.profile); setBook(b.book); setRecs(r.recommendations); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [analystId]);

  useEffect(() => { load(); }, [load]);

  async function withdraw(id: string) {
    const reason = window.prompt(t('timeline.withdrawPrompt')) ?? undefined;
    setBusyId(id);
    try {
      await withdrawRecommendation(id, reason || undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }

  const th = 'pb-1 font-normal';
  return (
    <div className="space-y-4 p-4">
      <Link href="/analyst" className="text-sm text-[var(--text-dim)] hover:text-[var(--text)]">{t('nav.back')}</Link>
      {error && <p className="text-sm text-[var(--down)]">{t('common.error', { message: error })}</p>}
      {!profile || !book ? (
        !error && <p className="text-sm text-[var(--text-dim)]">{t('common.loading')}</p>
      ) : (
        <>
          <header className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{profile.is_self ? t('profiles.self') : profile.display_name}</h1>
            <Tag tone={profile.kind === 'agent' ? 'accent' : 'neutral'}>{t(`kind.${profile.kind}`)}</Tag>
            {profile.note && <span className="text-sm text-[var(--text-dim)]">{profile.note}</span>}
          </header>
          <BookSummaryPanel book={book} />
          <BookTables book={book} />
          <Panel title={t('timeline.title', { count: recs.length })}>
            {recs.length === 0 ? (
              <p className="text-sm text-[var(--text-dim)]">{t('timeline.empty')}</p>
            ) : (
              <table className="num w-full text-left text-xs">
                <thead>
                  <tr className="text-[var(--text-dim)]">
                    <th className={th}>{t('timeline.columns.date')}</th>
                    <th className={th}>{t('timeline.columns.ticker')}</th>
                    <th className={th}>{t('timeline.columns.action')}</th>
                    <th className={th}>{t('timeline.columns.referencePrice')}</th>
                    <th className={th}>{t('timeline.columns.fillPrice')}</th>
                    <th className={th}>{t('timeline.columns.confidence')}</th>
                    <th className={th}>{t('timeline.columns.d5')}</th>
                    <th className={th}>{t('timeline.columns.d20')}</th>
                    <th className={th}>{t('timeline.columns.d60')}</th>
                    <th className={th}>{t('timeline.columns.hit')}</th>
                    <th className={th}>{t('timeline.columns.score')}</th>
                    <th className={th}>{t('timeline.columns.status')}</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.id} className={`border-t border-[var(--border)] ${r.withdrawn_at ? 'opacity-50' : ''}`}>
                      <td className="py-1">{r.recommended_at.slice(0, 10)}</td>
                      <td className="py-1"><Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="text-accent hover:underline">{r.ticker}</Link></td>
                      <td className="py-1">{t(`action.${r.action}`)}</td>
                      <td className="py-1">{r.reference_price === null ? '--' : formatPrice(r.reference_price)}</td>
                      <td className="py-1">{r.fill_price === null ? <span className="text-[var(--text-dim)]">{t('scores.pending')}</span> : formatPrice(r.fill_price)}</td>
                      <td className="py-1">{r.confidence ?? '--'}</td>
                      <td className="py-1">{pct(r.score?.forward_5d_pct)}</td>
                      <td className="py-1">{pct(r.score?.forward_20d_pct)}</td>
                      <td className="py-1">{pct(r.score?.forward_60d_pct)}</td>
                      <td className="py-1">{r.score?.hit === true ? t('timeline.hitYes') : r.score?.hit === false ? t('timeline.hitNo') : '--'}</td>
                      <td className="py-1">{r.score?.score === null || r.score?.score === undefined ? '--' : r.score.score.toFixed(1)}</td>
                      <td className="py-1">
                        <span className="flex gap-1">
                          <Tag tone={r.withdrawn_at ? 'down' : 'neutral'}>{r.withdrawn_at ? t('timeline.withdrawn') : t('timeline.open')}</Tag>
                          {r.adopted_by.length > 0 && <Tag tone="up">{t('timeline.adopted')}</Tag>}
                        </span>
                      </td>
                      <td className="py-1">
                        {!r.withdrawn_at && (
                          <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => withdraw(r.id)}>
                            {busyId === r.id ? t('timeline.withdrawing') : t('timeline.withdraw')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
      <AnalystDisclaimer />
    </div>
  );
}
```

- [ ] **Step 8: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all exit 0. `next build` must list `/analyst` and `/analyst/[analystId]` plus the six `/api/analyst/*` routes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/hooks/useAnalyst.ts src/components/analyst 'src/app/(app)/analyst'
git commit -m "feat(analyst): overview and analyst detail pages with paper book and timeline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Portfolio adoption link

**Files:**
- Modify: `src/lib/portfolio/validate.ts` (`DecisionInput`, `parseDecisionInput`)
- Modify: `src/lib/portfolio/validate.test.ts`
- Modify: `src/lib/portfolio/store.ts` (`createDecision`)
- Modify: `src/app/api/decisions/route.ts` (error mapping)
- Modify: `src/components/portfolio/DecisionForm.tsx`
- Modify: `src/app/(app)/portfolio/decisions/page.tsx`
- Modify: `messages/zh/portfolio.json`, `messages/en/portfolio.json`

- [ ] **Step 1: Write the failing validation tests**

Append to `src/lib/portfolio/validate.test.ts` (after the existing `parseDecisionInput` describe block; add the import of `parseDecisionInput` if the file does not already import it):

```ts
describe('parseDecisionInput — recommendation_id', () => {
  const base = { ticker: '600519.SH', market: 'A', action: 'buy', source_type: 'manual' };
  it('is undefined when omitted', () => {
    const r = parseDecisionInput(base);
    expect(r.ok && r.value.recommendation_id).toBeUndefined();
  });
  it('accepts a uuid', () => {
    const r = parseDecisionInput({ ...base, recommendation_id: '11111111-1111-4111-8111-111111111111' });
    expect(r.ok && r.value.recommendation_id).toBe('11111111-1111-4111-8111-111111111111');
  });
  it('rejects a non-uuid and an empty string', () => {
    expect(parseDecisionInput({ ...base, recommendation_id: 'abc' })).toEqual({ ok: false, error: 'recommendation_id must be a uuid' });
    expect(parseDecisionInput({ ...base, recommendation_id: '' })).toEqual({ ok: false, error: 'recommendation_id must be a uuid' });
  });
  it('treats null as omitted', () => {
    const r = parseDecisionInput({ ...base, recommendation_id: null });
    expect(r.ok && r.value.recommendation_id).toBeUndefined();
  });
});
```

Run: `npx vitest run src/lib/portfolio/validate.test.ts`
Expected: FAIL — the "rejects a non-uuid" case returns `ok: true` today.

- [ ] **Step 2: Extend the validator**

In `src/lib/portfolio/validate.ts`, add to `DecisionInput`:

```ts
  recommendation_id?: string;
```

In `parseDecisionInput`, after the `horizon`/`source_type` lines and before `return {`, add:

```ts
  let recommendation_id: string | undefined;
  if (b.recommendation_id !== undefined && b.recommendation_id !== null) {
    if (!isUuid(b.recommendation_id)) return { ok: false, error: 'recommendation_id must be a uuid' };
    recommendation_id = b.recommendation_id;
  }
```

and add `recommendation_id,` to the returned `value` object (after `expires_at: expires_at.value,`).

Run: `npx vitest run src/lib/portfolio/validate.test.ts`
Expected: PASS.

- [ ] **Step 3: Verify the recommendation in `createDecision`**

In `src/lib/portfolio/store.ts` replace `createDecision` with:

```ts
export async function createDecision(input: DecisionInput): Promise<Decision> {
  const { supabase, userId } = await requireUser();
  // Adoption link: the recommendation must be the caller's and still open.
  // RLS already hides other users' rows, so "not found" covers both cases.
  if (input.recommendation_id) {
    const { data: rec, error: rErr } = await supabase
      .from('recommendations').select('id, withdrawn_at').eq('id', input.recommendation_id).eq('user_id', userId).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!rec) throw new Error('recommendation not found');
    if ((rec as { withdrawn_at: string | null }).withdrawn_at) throw new Error('recommendation withdrawn');
  }
  const { data, error } = await (supabase as any)
    .from('decisions')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return coerceDecisionRow(data);
}
```

- [ ] **Step 4: Map the new errors in the decisions route**

In `src/app/api/decisions/route.ts` replace the `POST` catch block with:

```ts
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'not authenticated' ? 401 : msg === 'recommendation not found' ? 404 : msg === 'recommendation withdrawn' ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
```

- [ ] **Step 5: Message keys**

In `messages/zh/portfolio.json`:
- in `decisionForm` add `"adopt": "采纳建议"` and `"adoptNone": "不关联"`;
- in `decisions.columns` add `"source": "来源"`;
- in `decisions` add `"adopted": "采纳建议"`, `"adoptedWithdrawn": "建议已撤回"` and `"sourceSelf": "自主"`.

In `messages/en/portfolio.json`:
- in `decisionForm` add `"adopt": "Adopt recommendation"` and `"adoptNone": "None"`;
- in `decisions.columns` add `"source": "Source"`;
- in `decisions` add `"adopted": "Adopted"`, `"adoptedWithdrawn": "Rec. withdrawn"` and `"sourceSelf": "Own"`.

Run: `npx vitest run src/i18n/messages-parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Adopt select in the decision form**

In `src/components/portfolio/DecisionForm.tsx`:

Change the react import to `import { useEffect, useState } from 'react';` and add

```ts
import { fetchRecommendations, type RecommendationView } from '@/lib/hooks/useAnalyst';
```

Inside the component, after `const [err, setErr] = useState<string | null>(null);` add:

```ts
  const [recs, setRecs] = useState<RecommendationView[]>([]);
  const [recommendationId, setRecommendationId] = useState('');
  useEffect(() => {
    let alive = true;
    setRecommendationId('');
    fetchRecommendations({ ticker, open: true })
      .then((r) => { if (alive) setRecs(r.recommendations.filter((x) => x.adopted_by.length === 0)); })
      .catch(() => { if (alive) setRecs([]); });
    return () => { alive = false; };
  }, [ticker]);
```

In `submit()`, add `recommendation_id: recommendationId || undefined,` to the `postDecision({...})` object, and add `setRecommendationId('');` to the reset line after success.

In the JSX, inside the `{action && (<div ...>` block, before the confidence label, add:

```tsx
          {recs.length > 0 && (
            <label className="flex flex-col gap-0.5">{t('decisionForm.adopt')}
              <select value={recommendationId} onChange={(e) => setRecommendationId(e.target.value)}
                className="w-48 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1">
                <option value="">{t('decisionForm.adoptNone')}</option>
                {recs.map((r) => (
                  <option key={r.id} value={r.id}>{r.recommended_at.slice(0, 10)} · {t(`action.${r.action}`)}{r.rationale ? ` · ${r.rationale.slice(0, 24)}` : ''}</option>
                ))}
              </select>
            </label>
          )}
```

- [ ] **Step 7: Source column on the decision log**

In `src/app/(app)/portfolio/decisions/page.tsx`:

Add the import

```ts
import { fetchRecommendations } from '@/lib/hooks/useAnalyst';
```

After `const [cancellingId, setCancellingId] = useState<string | null>(null);` add a map of withdrawn recommendation ids so a decision whose recommendation was later withdrawn is labelled (spec §8):

```ts
  // recommendation id → withdrawn? Loaded once; the analyst layer is read-only from here.
  const [withdrawn, setWithdrawn] = useState<Record<string, boolean>>({});
  useEffect(() => {
    fetchRecommendations()
      .then((r) => setWithdrawn(Object.fromEntries(r.recommendations.map((x) => [x.id, x.withdrawn_at !== null]))))
      .catch(() => setWithdrawn({}));
  }, []);
```

In the table header add after the `status` header:

```tsx
                <th className="pb-1 font-normal">{t('decisions.columns.source')}</th>
```

and in each row after the status `<td>`:

```tsx
                  <td className="py-1">
                    {d.recommendation_id ? (
                      <Link href="/analyst" className="hover:underline">
                        <Tag tone={withdrawn[d.recommendation_id] ? 'down' : 'up'}>
                          {withdrawn[d.recommendation_id] ? t('decisions.adoptedWithdrawn') : t('decisions.adopted')}
                        </Tag>
                      </Link>
                    ) : (
                      <span className="text-[var(--text-dim)]">{t('decisions.sourceSelf')}</span>
                    )}
                  </td>
```

- [ ] **Step 8: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/portfolio src/i18n`
Expected: all exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/lib/portfolio/validate.ts src/lib/portfolio/validate.test.ts src/lib/portfolio/store.ts src/app/api/decisions/route.ts src/components/portfolio/DecisionForm.tsx 'src/app/(app)/portfolio/decisions/page.tsx' messages/zh/portfolio.json messages/en/portfolio.json
git commit -m "feat(portfolio): decisions can adopt an analyst recommendation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: ADR and glossary

**Files:**
- Create: `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md`
- Modify: `messages/GLOSSARY.md`

- [ ] **Step 1: Write the ADR**

Create `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md`:

```markdown
# 研究 / 分析 / 我的投资 三层边界

状态：已采纳（2026-10-17）。首轮实施见 `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`。

## 决定

OsbornAlpha 内部按产出物分三层，只以建议 id 单向连接：

| 层 | 路由 | 产出物 | 真值来源 |
|---|---|---|---|
| 研究 Research | `/research` | 建议（recommendation） | 人 + 工具的方法论 |
| 分析 Analyst | `/analyst` | 分析师模拟账本 + 前向评分 | 冻结规则，系统自己是权威 |
| 我的投资 Portfolio | `/portfolio` | 真实交易 + 持仓 | 外部事实（手工记录，将来券商同步） |

- research 产出建议；analyst 登记、冻结成交价（建议日 K 线收盘）、模拟、打分；portfolio 的决定可通过 `decisions.recommendation_id` 引用一条建议（采纳）。
- 实盘永远不改写建议和评分；analyst 永远不写 `trades`。
- 前向评分内核只有一份：`src/lib/scoring/forward.ts`，portfolio 的决定复盘与 analyst 的建议评分共用。
- `analyst_profiles.kind ∈ {human, agent}`：AI Agent 是分析师。research 侧的 `research_decisions.analyst_id`、`research_analyst_identities.analyst_id` 在语义上等于 `analyst_profiles.id`，但不建外键（S4 库与组合库是否同库未核实）。

## 不搬的东西

- **S4/S6 留在 research。** `research_decisions.arm ∈ {human_baseline, ai_candidate, collab, averaged}` 按 thesis-week 配对，评的是研究方法哪条路径更准，是方法论自检（与 `/research/evals` 同类），不是分析师的建议表现。首轮 analyst 不接 S5 引擎。
- **「我的决定」留在 portfolio。** `decisions` 是实盘账本上的采纳事件；「我」在 analyst 里只是一个 `is_self` 档案。
- **portfolio 不加账户层。** v4 M1a 的账户 / 版本化账本仍是接券商同步时的债务。

## 与 2026-09-22 v4 方案的关系

v4 主张把 OSanalyst 融进 `/portfolio`。本 ADR 改为分层：v4 反对的是同一账户两份真值，而实盘账本与分析师模拟账本是不同账户，模拟成交不进 `trades`，所以不冲突。v4 的 M2（权重 / NAV / 规则执行）、M3（团队权限）如需实施，落在 analyst 层。

## 术语

研究 Research · 分析 Analyst · 我的投资 Portfolio · 建议 Recommendation · 采纳 Adopt · 撤回 Withdraw · 模拟账本 Simulated Book。见 `messages/GLOSSARY.md`。
```

- [ ] **Step 2: Glossary rows**

In `messages/GLOSSARY.md`, in the main `核心术语对照` table, add after the `| 决策 | Decision | |` row:

```markdown
| 建议（分析师建议） | Recommendation | analyst 层对象；与"决策 Decision"（portfolio 实盘采纳事件）区分 |
| 分析师 | Analyst | 含 AI Agent；主导航 tab「分析」= Analyst |
| 模拟账本 / 模拟持仓 | Simulated Book / Paper Position | analyst 层等权假设账本，不是实盘 |
| 采纳 | Adopt | 实盘决定引用一条建议 |
| 撤回 | Withdraw | 建议只能撤回不能修改 |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/2026-10-17-research-analyst-portfolio-boundary.md messages/GLOSSARY.md
git commit -m "docs(adr): research / analyst / portfolio boundary and glossary terms

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Full verification

**Files:**
- Modify: `e2e/authed.spec.ts`

- [ ] **Step 1: Add the e2e assertion**

In `e2e/authed.spec.ts`, after the `/portfolio` assertion and before `/tools`, add:

```ts
  await page.goto('/analyst');
  await expect(page.getByText(/不构成投资建议/)).toBeVisible();
```

- [ ] **Step 2: Unit tests, types, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green. Known pre-existing local flakes are listed in the memory note `alpha-local-db-harness-env.md`; anything in `src/lib/scoring`, `src/lib/analyst`, `src/lib/portfolio` or `src/i18n` failing is yours.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0, routes `/analyst`, `/analyst/[analystId]`, `/api/analyst/*` listed.

- [ ] **Step 4: Migration rehearsal**

Run: `LC_ALL=C npm run test:migrations`
Expected: exit 0.

- [ ] **Step 5: e2e (only if credentials exist)**

Run: `E2E_EMAIL=... E2E_PASSWORD=... npm run e2e -- e2e/authed.spec.ts`
Expected: PASS; without credentials the suite self-skips — say so in the report rather than claiming it ran.

- [ ] **Step 6: Browser pass on the dev server**

Start the dev server through the app's preview tool (`preview_start` with the `.claude/launch.json` entry; create one with `npm run dev` on port 3000 if missing). Then:
1. Open `/analyst` signed in. Confirm the "我" card exists, create a profile, record a recommendation, click 刷新评分 and read the `已评分 / 跳过` message.
2. Open the analyst detail page: summary metrics, timeline row with `评分待刷新` or a fill price, withdraw works and the row dims.
3. Open `/portfolio`, pick the same ticker, open the decision bar: the 采纳建议 select appears with the open recommendation; record a decision; `/portfolio/decisions` shows the 采纳建议 tag; back on the analyst page the recommendation shows 已采纳.
4. `resize_window` preset `mobile`, screenshot the bottom tab bar with 7 tabs; confirm no horizontal overflow. If a label wraps, shorten `nav.analyst` only.
5. `read_console_messages` with `onlyErrors: true` — must be empty for these pages.

- [ ] **Step 7: Commit**

```bash
git add e2e/authed.spec.ts
git commit -m "test(e2e): analyst page renders with disclaimer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 8: Report**

List, with the actual command output, what passed, what was skipped (e2e without credentials, mobile screenshot result), and anything left for a follow-up. Do not push or open a PR unless asked.
