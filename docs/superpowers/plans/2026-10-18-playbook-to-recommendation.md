# Playbook → Recommendation Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an approved research playbook run of kind `PAPER_TRADE` be registered, in one click and per company, as analyst recommendations owned by a fixed agent profile "Research Playbook".

**Architecture:** Two research-side Route Handlers (`GET .../registration` prefills, `POST .../register` validates and batch-inserts) write into the analyst layer's `recommendations` table through new store functions; research never reads back from analyst except to compute "already registered". All candidate resolution, default mapping and idempotency splitting live in one pure module with tests. The research playbooks page gets an inline registration form component.

**Tech Stack:** Next.js 15 App Router Route Handlers, Supabase JS (RLS, same project for research_* and analyst tables), vitest (node env), existing helpers: `requireResearchUser`/`withResearch`/`audit` (research), `requireUser`/`parseRecommendationInput`/`coerceRecommendationRow` (analyst), `normalizeSecurityTicker`/`inferCoreMarket` from `@/lib/securities/ticker`.

**Spec:** `docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md`
**Branch:** `codex/playbook-recommendations` (already created from `main`).

**Conventions (observed):**
- Research routes: `export const dynamic = 'force-dynamic'`, body wrapped in `withResearch(async () => { const ctx = await requireResearchUser(); ... })`; thrown `PlaybookError(message, status)` maps to `{ error: { code: 'PLAYBOOK_ERROR', message } }` with that status; returning a `NextResponse` from the callback passes it through unchanged.
- Research pages are `'use client'` with zh hard-coded copy (i18n exemption; do not touch `messages/*`).
- Analyst store: `requireUser()`, `(supabase as any).from(...)` for writes, `coerce*Row` on reads, errors thrown as `Error('<message>')` and mapped by `src/lib/analyst/http.ts`.
- Repo hook: run `git commit` in its own shell command with no `-n` token anywhere in that command (`sed -n`, `grep -n` next to it trigger a false positive). Never bypass hooks.

---

## File structure

**Create**

| Path | Responsibility |
|---|---|
| `src/lib/research/playbook-registration.ts` | Pure: company set, ticker resolution, defaults mapping, registrability, request-body parsing, idempotency split |
| `src/lib/research/playbook-registration.test.ts` | Tests for every pure rule |
| `src/app/api/research/playbooks/[id]/registration/route.ts` | GET prefill view |
| `src/app/api/research/playbooks/[id]/register/route.ts` | POST validate + batch insert + audit |
| `src/components/research/PlaybookRegisterForm.tsx` | Inline form: loads prefill, lets the user edit/select, submits |

**Modify**

| Path | Change |
|---|---|
| `src/lib/analyst/store.ts` | `PLAYBOOK_ANALYST_NAME`, `findPlaybookProfile`, `ensurePlaybookProfile`, `createRecommendations`, `listPlaybookRecommendations`; `listRecommendations` gains `sourceType` |
| `src/app/api/analyst/recommendations/route.ts` | `?source=<RecommendationSource>` filter |
| `src/app/(app)/research/playbooks/page.tsx` | Register button + inline form on approved PAPER_TRADE rows; "已登记 N 条 · 查看" |
| `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md`, `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md` | First automated delivery channel noted |

---

### Task 1: Pure registration module

**Files:**
- Create: `src/lib/research/playbook-registration.ts`
- Create: `src/lib/research/playbook-registration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/research/playbook-registration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildRegistrationCandidates, companyIdsFor, confidenceFromMemo, findDuplicateItem, horizonFromWeeks,
  isRegistrable, parseRegisterBody, registrationDefaults, splitRegistration,
  type ExistingPlaybookRecommendation, type RegisterItem, type SecurityRow,
} from './playbook-registration';
import type { Entity, InvestmentMemo, PlaybookRun, Thesis } from './types';

const run = (o: Partial<PlaybookRun> = {}): PlaybookRun => ({
  id: 'run-1', memo_id: null, thesis_id: 'th-1', proposed_action: 'PAPER_TRADE', rationale: '算力缺口持续',
  risks: [], approval_status: 'APPROVED', human_decision: 'ok', review_at: '2026-06-03T02:00:00Z', created_at: '2026-06-01T00:00:00Z', ...o,
});
const thesis = (o: Partial<Thesis> = {}): Thesis => ({
  id: 'th-1', title: 'AI 算力', body: '', company_ids: ['e-a', 'e-b'], theme_ids: [], supporting_evidence_ids: [],
  invalidation_conditions: ['x'], watch_metrics: ['y'], status: 'ACTIVE', created_at: 'c', updated_at: 'u', horizon_weeks: [4, 13, 26], ...o,
});
const memo = (o: Partial<InvestmentMemo> = {}): InvestmentMemo => ({
  id: 'm-1', title: 'memo', company_ids: ['e-b', 'e-c'], theme_ids: [], one_line_conclusion: '', thesis: '', supporting_evidence: [],
  counter_arguments: [], key_variables: [], invalidation_conditions: [], open_questions: [], related_impacts: [], confidence: 'HIGH',
  axiom_check_results: [], provenance: { model: 'claude-x' }, status: 'REVIEWED', created_at: 'c', updated_at: 'u', ...o,
});
const entity = (id: string, o: Partial<Entity> = {}): Entity => ({
  id, type: 'COMPANY', name: `公司${id}`, aliases: [], ticker: null, description: null, metadata: {}, created_at: 'c', updated_at: 'u', ...o,
});
const sec = (entity_id: string, exchange_code: string, market: string, o: Partial<SecurityRow> = {}): SecurityRow =>
  ({ entity_id, exchange_code, market, is_primary: true, valid_to: null, ...o });

describe('companyIdsFor', () => {
  it('puts thesis companies first and appends memo companies without duplicates', () => {
    expect(companyIdsFor(thesis(), memo())).toEqual(['e-a', 'e-b', 'e-c']);
  });
  it('works with only a memo or nothing', () => {
    expect(companyIdsFor(null, memo())).toEqual(['e-b', 'e-c']);
    expect(companyIdsFor(null, null)).toEqual([]);
  });
});

describe('buildRegistrationCandidates — ticker resolution', () => {
  it('prefers the primary, open security row', () => {
    const c = buildRegistrationCandidates([entity('e-a')], ['e-a'], [sec('e-a', '600519.SH', 'A')], []);
    expect(c[0]).toMatchObject({ entity_id: 'e-a', ticker: '600519.SH', market: 'A', ticker_source: 'security', supported: true, selected: true });
  });
  it('ignores non-primary or closed security rows', () => {
    const c = buildRegistrationCandidates([entity('e-a')], ['e-a'], [sec('e-a', '600519.SH', 'A', { is_primary: false }), sec('e-a', '000001.SZ', 'A', { valid_to: '2025-01-01' })], []);
    expect(c[0].ticker_source).toBe('none');
    expect(c[0].supported).toBe(false);
    expect(c[0].selected).toBe(false);
  });
  it('falls back to entities.ticker and infers the market', () => {
    const c = buildRegistrationCandidates([entity('e-a', { ticker: '0700.hk' })], ['e-a'], [], []);
    expect(c[0]).toMatchObject({ ticker: '00700.HK', market: 'HK', ticker_source: 'entity', supported: true });
  });
  it('marks market=other and unparseable tickers as unsupported', () => {
    const c = buildRegistrationCandidates([entity('e-a', { ticker: '7203.T' }), entity('e-b')], ['e-a', 'e-b'], [sec('e-b', 'XYZ', 'other')], []);
    expect(c.map((x) => x.supported)).toEqual([false, false]);
    expect(c.map((x) => x.ticker)).toEqual([null, null]);
  });
  it('keeps thesis order, then sorts the rest by name, and drops unknown ids', () => {
    const c = buildRegistrationCandidates([entity('e-c', { name: 'Zeta' }), entity('e-b', { name: 'Alpha' }), entity('e-a', { name: 'Mid' })], ['e-a', 'e-c', 'e-b', 'ghost'], [], []);
    expect(c.map((x) => x.entity_id)).toEqual(['e-a', 'e-c', 'e-b']);
  });
  it('marks already registered companies and deselects them', () => {
    const existing: ExistingPlaybookRecommendation[] = [{ id: 'r-9', ticker: '600519.SH', market: 'A', entity_id: 'e-a' }];
    const c = buildRegistrationCandidates([entity('e-a')], ['e-a'], [sec('e-a', '600519.SH', 'A')], existing);
    expect(c[0].registered_recommendation_id).toBe('r-9');
    expect(c[0].selected).toBe(false);
  });
});

describe('defaults', () => {
  it('maps memo confidence to 30/60/85 and defaults to 50', () => {
    expect(confidenceFromMemo('LOW')).toBe(30);
    expect(confidenceFromMemo('MEDIUM')).toBe(60);
    expect(confidenceFromMemo('HIGH')).toBe(85);
    expect(confidenceFromMemo(undefined)).toBe(50);
  });
  it('maps the longest thesis horizon in weeks to short/mid/long', () => {
    expect(horizonFromWeeks([2, 8])).toBe('short');
    expect(horizonFromWeeks([4, 13, 26])).toBe('mid');
    expect(horizonFromWeeks([52])).toBe('long');
    expect(horizonFromWeeks(undefined)).toBeNull();
    expect(horizonFromWeeks([])).toBeNull();
  });
  it('builds defaults from run + thesis + memo', () => {
    expect(registrationDefaults(run(), thesis(), memo())).toEqual({
      action: 'buy', confidence: 85, horizon: 'mid', recommended_at: '2026-06-03T02:00:00Z', rationale: '算力缺口持续', thesis_ref: 'th-1',
    });
  });
  it('falls back to created_at when review_at is missing and to 50/null without memo/thesis', () => {
    expect(registrationDefaults(run({ review_at: null, thesis_id: null }), null, null)).toEqual({
      action: 'buy', confidence: 50, horizon: null, recommended_at: '2026-06-01T00:00:00Z', rationale: '算力缺口持续', thesis_ref: null,
    });
  });
});

describe('isRegistrable', () => {
  it('requires PAPER_TRADE and APPROVED', () => {
    expect(isRegistrable(run())).toBe(true);
    expect(isRegistrable(run({ approval_status: 'PENDING' }))).toBe(false);
    expect(isRegistrable(run({ proposed_action: 'WATCHLIST' }))).toBe(false);
  });
});

describe('parseRegisterBody', () => {
  const item = { entity_id: 'e-a', ticker: '600519.SH', market: 'A', action: 'buy' };
  it('accepts 1-20 items and optional shared fields', () => {
    const r = parseRegisterBody({ items: [item], rationale: 'r', recommended_at: '2026-06-03T02:00:00Z' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(1);
    expect(r.value.items[0]).toMatchObject({ entity_id: 'e-a', ticker: '600519.SH', market: 'A', action: 'buy' });
    expect(r.value.rationale).toBe('r');
  });
  it('rejects empty, too many, bad market/action, bad entity_id and non-object items', () => {
    expect(parseRegisterBody({ items: [] })).toEqual({ ok: false, error: 'items must have 1-20 entries' });
    expect(parseRegisterBody({ items: Array.from({ length: 21 }, () => item) })).toEqual({ ok: false, error: 'items must have 1-20 entries' });
    expect(parseRegisterBody({ items: [{ ...item, market: 'JP' }] })).toEqual({ ok: false, error: 'items[0].market must be A|HK|US' });
    expect(parseRegisterBody({ items: [{ ...item, action: 'short' }] })).toEqual({ ok: false, error: 'items[0].action must be one of buy|sell|trim|add|hold|pass' });
    expect(parseRegisterBody({ items: [{ ...item, entity_id: 42 }] })).toEqual({ ok: false, error: 'items[0].entity_id must be a string or null' });
    expect(parseRegisterBody({ items: ['x'] })).toEqual({ ok: false, error: 'items[0] must be an object' });
  });
  it('treats missing entity_id as null and drops non-numeric optionals', () => {
    const r = parseRegisterBody({ items: [{ ticker: 'NVDA', market: 'US', action: 'sell', confidence: 'high', target_price: 'x' }] });
    expect(r.ok && r.value.items[0]).toMatchObject({ entity_id: null, confidence: undefined, target_price: undefined });
  });
});

describe('findDuplicateItem', () => {
  it('returns the index of the first item repeating an earlier ticker+market', () => {
    const items: RegisterItem[] = [
      { entity_id: null, ticker: 'NVDA', market: 'US', action: 'buy' },
      { entity_id: null, ticker: '600519.SH', market: 'A', action: 'buy' },
      { entity_id: 'e-x', ticker: 'NVDA', market: 'US', action: 'sell' },
    ];
    expect(findDuplicateItem(items)).toBe(2);
    expect(findDuplicateItem(items.slice(0, 2))).toBeNull();
  });
});

describe('splitRegistration', () => {
  const existing: ExistingPlaybookRecommendation[] = [
    { id: 'r-1', ticker: '600519.SH', market: 'A', entity_id: 'e-a' },
    { id: 'r-2', ticker: 'NVDA', market: 'US', entity_id: null },
  ];
  it('skips entity matches and manual ticker+market matches, keeps the rest', () => {
    const items: RegisterItem[] = [
      { entity_id: 'e-a', ticker: '600519.SH', market: 'A', action: 'buy' },
      { entity_id: null, ticker: 'NVDA', market: 'US', action: 'buy' },
      { entity_id: 'e-b', ticker: '00700.HK', market: 'HK', action: 'buy' },
    ];
    const r = splitRegistration(items, existing);
    expect(r.toCreate.map((i) => i.ticker)).toEqual(['00700.HK']);
    expect(r.skipped).toEqual([
      { entity_id: 'e-a', ticker: '600519.SH', reason: 'already_registered' },
      { entity_id: null, ticker: 'NVDA', reason: 'already_registered' },
    ]);
  });
  it('does not skip an entity-less item just because an entity row has the same ticker', () => {
    const r = splitRegistration([{ entity_id: 'e-z', ticker: '600519.SH', market: 'A', action: 'buy' }], existing);
    expect(r.toCreate).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/research/playbook-registration.test.ts`
Expected: FAIL — `Cannot find module './playbook-registration'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/research/playbook-registration.ts`:

```ts
// Pure rules for registering an approved PAPER_TRADE playbook run as analyst
// recommendations (spec docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md).
// No I/O here: the two research routes feed rows in and persist the result.

import type { DecisionAction, DecisionHorizon } from '@/lib/supabase/database.types';
import type { CoreMarket } from '@/lib/securities/model';
import { inferCoreMarket, normalizeSecurityTicker } from '@/lib/securities/ticker';
import type { Confidence, Entity, InvestmentMemo, PlaybookRun, Thesis } from './types';

export const CORE_MARKETS: CoreMarket[] = ['A', 'HK', 'US'];
const ACTIONS: DecisionAction[] = ['buy', 'sell', 'trim', 'add', 'hold', 'pass'];
const HORIZONS: DecisionHorizon[] = ['short', 'mid', 'long'];
const MAX_ITEMS = 20;
const MAX_TEXT = 4000;

/** Subset of research_entity_securities the resolver needs. */
export interface SecurityRow { entity_id: string; exchange_code: string; market: string; is_primary: boolean; valid_to: string | null }

/** An analyst recommendation already created from this run (source_ref.entity_id may be null for manual rows). */
export interface ExistingPlaybookRecommendation { id: string; ticker: string; market: string; entity_id: string | null }

export interface RegistrationCandidate {
  entity_id: string;
  name: string;
  ticker: string | null;
  market: CoreMarket | null;
  ticker_source: 'security' | 'entity' | 'none';
  supported: boolean;
  selected: boolean;
  registered_recommendation_id: string | null;
}

export interface RegistrationDefaults {
  action: DecisionAction;
  confidence: number;
  horizon: DecisionHorizon | null;
  recommended_at: string;
  rationale: string;
  thesis_ref: string | null;
}

export interface RegisterItem {
  entity_id: string | null;
  ticker: string;
  market: CoreMarket;
  action: DecisionAction;
  confidence?: number;
  horizon?: DecisionHorizon;
  target_price?: number;
  stop_loss?: number;
}

export interface RegisterBody { items: RegisterItem[]; rationale?: string; recommended_at?: string }

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function isRegistrable(run: PlaybookRun): boolean {
  return run.proposed_action === 'PAPER_TRADE' && run.approval_status === 'APPROVED';
}

/** Thesis companies first (their order), then memo companies not already present. */
export function companyIdsFor(thesis: Thesis | null, memo: InvestmentMemo | null): string[] {
  const out: string[] = [];
  for (const id of [...(thesis?.company_ids ?? []), ...(memo?.company_ids ?? [])]) if (!out.includes(id)) out.push(id);
  return out;
}

function resolveTicker(entity: Entity, securities: SecurityRow[]): Pick<RegistrationCandidate, 'ticker' | 'market' | 'ticker_source'> {
  const primary = securities.find((s) => s.entity_id === entity.id && s.is_primary && s.valid_to === null);
  if (primary) {
    const market = CORE_MARKETS.includes(primary.market as CoreMarket) ? (primary.market as CoreMarket) : null;
    const ticker = market ? normalizeSecurityTicker(primary.exchange_code, market) : null;
    return ticker && market ? { ticker, market, ticker_source: 'security' } : { ticker: null, market: null, ticker_source: 'none' };
  }
  if (entity.ticker) {
    const market = inferCoreMarket(entity.ticker);
    const ticker = market ? normalizeSecurityTicker(entity.ticker, market) : null;
    if (ticker && market) return { ticker, market, ticker_source: 'entity' };
  }
  return { ticker: null, market: null, ticker_source: 'none' };
}

/**
 * One candidate per known company id, in companyIdsFor() order (thesis ids first, then memo ids).
 */
export function buildRegistrationCandidates(
  entities: Entity[],
  companyIds: string[],
  securities: SecurityRow[],
  existing: ExistingPlaybookRecommendation[],
): RegistrationCandidate[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const known = companyIds.filter((id) => byId.has(id));
  return known.map((id) => {
    const entity = byId.get(id)!;
    const resolved = resolveTicker(entity, securities);
    const supported = resolved.ticker !== null;
    const registered = existing.find((r) => r.entity_id === id) ?? null;
    return {
      entity_id: id,
      name: entity.name,
      ...resolved,
      supported,
      selected: supported && registered === null,
      registered_recommendation_id: registered?.id ?? null,
    };
  });
}

export function confidenceFromMemo(confidence: Confidence | undefined): number {
  if (confidence === 'LOW') return 30;
  if (confidence === 'MEDIUM') return 60;
  if (confidence === 'HIGH') return 85;
  return 50;
}

export function horizonFromWeeks(weeks: number[] | undefined): DecisionHorizon | null {
  if (!weeks || weeks.length === 0) return null;
  const max = Math.max(...weeks);
  return max <= 8 ? 'short' : max <= 26 ? 'mid' : 'long';
}

export function registrationDefaults(run: PlaybookRun, thesis: Thesis | null, memo: InvestmentMemo | null): RegistrationDefaults {
  return {
    action: 'buy',
    confidence: confidenceFromMemo(memo?.confidence),
    horizon: horizonFromWeeks(thesis?.horizon_weeks),
    // The research judgment was made when the run was approved, not when the user clicks register.
    recommended_at: run.review_at ?? run.created_at,
    rationale: run.rationale,
    thesis_ref: run.thesis_id ?? null,
  };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function parseRegisterBody(body: unknown): Parsed<RegisterBody> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) return { ok: false, error: `items must have 1-${MAX_ITEMS} entries` };
  const items: RegisterItem[] = [];
  for (let i = 0; i < b.items.length; i++) {
    const raw = b.items[i];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: `items[${i}] must be an object` };
    const it = raw as Record<string, unknown>;
    if (it.entity_id !== undefined && it.entity_id !== null && typeof it.entity_id !== 'string') return { ok: false, error: `items[${i}].entity_id must be a string or null` };
    if (typeof it.ticker !== 'string' || !it.ticker.trim()) return { ok: false, error: `items[${i}].ticker required` };
    if (!CORE_MARKETS.includes(it.market as CoreMarket)) return { ok: false, error: `items[${i}].market must be A|HK|US` };
    if (!ACTIONS.includes(it.action as DecisionAction)) return { ok: false, error: `items[${i}].action must be one of ${ACTIONS.join('|')}` };
    items.push({
      entity_id: typeof it.entity_id === 'string' ? it.entity_id : null,
      ticker: it.ticker.trim().toUpperCase(),
      market: it.market as CoreMarket,
      action: it.action as DecisionAction,
      confidence: num(it.confidence),
      horizon: HORIZONS.includes(it.horizon as DecisionHorizon) ? (it.horizon as DecisionHorizon) : undefined,
      target_price: num(it.target_price),
      stop_loss: num(it.stop_loss),
    });
  }
  if (b.rationale !== undefined && (typeof b.rationale !== 'string' || b.rationale.length > MAX_TEXT)) return { ok: false, error: `rationale must be a string up to ${MAX_TEXT} chars` };
  if (b.recommended_at !== undefined && typeof b.recommended_at !== 'string') return { ok: false, error: 'recommended_at must be a string' };
  return { ok: true, value: { items, rationale: b.rationale as string | undefined, recommended_at: b.recommended_at as string | undefined } };
}

/** Index of the first item that repeats an earlier (ticker, market), or null. */
export function findDuplicateItem(items: RegisterItem[]): number | null {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const key = `${items[i].market}:${items[i].ticker}`;
    if (seen.has(key)) return i;
    seen.add(key);
  }
  return null;
}

/** Idempotency: an item is skipped when its entity was already registered from this run, or — for manual rows — the same ticker+market was. */
export function splitRegistration(items: RegisterItem[], existing: ExistingPlaybookRecommendation[]) {
  const toCreate: RegisterItem[] = [];
  const skipped: Array<{ entity_id: string | null; ticker: string; reason: 'already_registered' }> = [];
  for (const item of items) {
    const hit = item.entity_id !== null
      ? existing.some((r) => r.entity_id === item.entity_id)
      : existing.some((r) => r.entity_id === null && r.ticker === item.ticker && r.market === item.market);
    if (hit) skipped.push({ entity_id: item.entity_id, ticker: item.ticker, reason: 'already_registered' });
    else toCreate.push(item);
  }
  return { toCreate, skipped };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/research/playbook-registration.test.ts`
Expected: PASS (19 tests). Then `npm run typecheck` → exit 0 and `npx eslint src/lib/research/playbook-registration.ts src/lib/research/playbook-registration.test.ts` → clean. If `Thesis` in `./types` does not allow `horizon_weeks` in the fixture spread, it is declared optional there already (`horizon_weeks?: number[]`); do not edit types.

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/playbook-registration.ts src/lib/research/playbook-registration.test.ts
git commit -m "feat(research): pure rules for registering a PAPER_TRADE run as analyst recommendations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Analyst store additions

**Files:**
- Modify: `src/lib/analyst/store.ts`
- Modify: `src/lib/analyst/store.test.ts`
- Modify: `src/app/api/analyst/recommendations/route.ts`

- [ ] **Step 1: Write the failing test for the pure helper**

Append to `src/lib/analyst/store.test.ts`:

```ts
import { toExistingPlaybookRecommendation } from './store';

describe('toExistingPlaybookRecommendation', () => {
  it('reads entity_id from source_ref and keeps ticker/market', () => {
    const rec = { id: 'r1', ticker: '600519.SH', market: 'A', source_ref: { playbook_run_id: 'run-1', entity_id: 'e-a' } } as unknown as Parameters<typeof toExistingPlaybookRecommendation>[0];
    expect(toExistingPlaybookRecommendation(rec)).toEqual({ id: 'r1', ticker: '600519.SH', market: 'A', entity_id: 'e-a' });
  });
  it('yields entity_id null when source_ref lacks a string entity_id', () => {
    const rec = { id: 'r2', ticker: 'NVDA', market: 'US', source_ref: { playbook_run_id: 'run-1' } } as unknown as Parameters<typeof toExistingPlaybookRecommendation>[0];
    expect(toExistingPlaybookRecommendation(rec).entity_id).toBeNull();
  });
});
```

(Put the import at the top of the file with the other `./store` import.)

Run: `npx vitest run src/lib/analyst/store.test.ts` → FAIL (`toExistingPlaybookRecommendation` is not exported).

- [ ] **Step 2: Extend `listRecommendations` with a source filter**

In `src/lib/analyst/store.ts` change the signature and add one filter line:

```ts
export async function listRecommendations(opts: { analystId?: string; ticker?: string; openOnly?: boolean; sourceType?: RecommendationSource } = {}): Promise<RecommendationView[]> {
```

and after the `openOnly` line:

```ts
  if (opts.sourceType) q = q.eq('source_type', opts.sourceType);
```

Add `RecommendationSource` to the type import from `@/lib/supabase/database.types`.

- [ ] **Step 3: Add the playbook profile and batch helpers**

Append to `src/lib/analyst/store.ts` (after `createRecommendation`):

```ts
// ─── Playbook delivery (research → analyst) ───

/** Display name of the agent profile that owns every recommendation registered from a research playbook run. */
export const PLAYBOOK_ANALYST_NAME = 'Research Playbook';

/** The playbook agent profile, archived or not; null when it was never created. */
export async function findPlaybookProfile(): Promise<AnalystProfile | null> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('kind', 'agent')
    .ilike('display_name', PLAYBOOK_ANALYST_NAME).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? coerceProfileRow(data as Record<string, unknown>) : null;
}

/**
 * Lazily create the playbook agent profile. An archived one is un-archived
 * rather than duplicated (the active-name unique index would reject a twin).
 */
export async function ensurePlaybookProfile(): Promise<AnalystProfile> {
  const existing = await findPlaybookProfile();
  if (existing && existing.archived_at === null) return existing;
  const { supabase, userId } = await requireUser();
  if (existing) {
    const { data, error } = await (supabase as any).from('analyst_profiles').update({ archived_at: null })
      .eq('id', existing.id).eq('user_id', userId).select('*').single();
    if (error) throw new Error(error.message);
    return coerceProfileRow(data);
  }
  const { data, error } = await (supabase as any).from('analyst_profiles')
    .insert({ user_id: userId, display_name: PLAYBOOK_ANALYST_NAME, kind: 'agent', note: 'research playbook PAPER_TRADE 的自动归属' })
    .select('*').single();
  if (error?.code === '23505') {
    const again = await findPlaybookProfile();
    if (again) return again;
  }
  if (error) throw new Error(error.message);
  return coerceProfileRow(data);
}

/** Insert several already-validated recommendations in one request. All must belong to the same, active analyst. */
export async function createRecommendations(inputs: RecommendationInput[]): Promise<Recommendation[]> {
  if (inputs.length === 0) return [];
  const { supabase, userId } = await requireUser();
  const analystIds = new Set(inputs.map((i) => i.analyst_id));
  if (analystIds.size !== 1) throw new Error('recommendations must share one analyst');
  const analyst = await getProfile(inputs[0].analyst_id);
  if (analyst.archived_at) throw new Error('analyst archived');
  const now = new Date().toISOString();
  const rows = inputs.map(({ recommended_at, ...rest }) => ({ ...rest, user_id: userId, recommended_at: recommended_at ?? now }));
  const { data, error } = await (supabase as any).from('recommendations').insert(rows).select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(coerceRecommendationRow);
}

/** Shape the research side needs to compute "already registered" (pure; tested). */
export function toExistingPlaybookRecommendation(r: Recommendation): { id: string; ticker: string; market: string; entity_id: string | null } {
  const entity = r.source_ref && typeof r.source_ref.entity_id === 'string' ? r.source_ref.entity_id : null;
  return { id: r.id, ticker: r.ticker, market: r.market, entity_id: entity };
}

/** Every recommendation the signed-in user registered from one playbook run (withdrawn ones included — they still count as registered). */
export async function listPlaybookRecommendations(runId: string): Promise<Recommendation[]> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('recommendations').select('*').eq('user_id', userId)
    .eq('source_type', 'playbook').eq('source_ref->>playbook_run_id', runId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(coerceRecommendationRow);
}
```

- [ ] **Step 4: Expose the source filter on the list route**

In `src/app/api/analyst/recommendations/route.ts` GET, read and validate the new param and pass it through:

```ts
const SOURCES: RecommendationSource[] = ['manual', 'copilot', 'playbook', 'signal', 'import'];
```

(top-level constant; add `import type { RecommendationSource } from '@/lib/supabase/database.types';`), then inside `GET` after the `analyst` check:

```ts
  const source = url.searchParams.get('source');
  if (source !== null && !SOURCES.includes(source as RecommendationSource)) return NextResponse.json({ error: `source must be one of ${SOURCES.join('|')}` }, { status: 400 });
```

and add `sourceType: (source as RecommendationSource | null) ?? undefined,` to the `listRecommendations({...})` call. Update the route's comment line to `// GET ?analyst=<uuid>&ticker=<code>&open=1&source=<RecommendationSource> → { recommendations: RecommendationView[] }`.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/lib/analyst && npm run typecheck && npm run lint`
Expected: all pass. If typecheck rejects `.eq('source_ref->>playbook_run_id', runId)` on the typed client, cast that one builder with `(supabase as any)` like the writes do.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analyst/store.ts src/lib/analyst/store.test.ts src/app/api/analyst/recommendations/route.ts
git commit -m "feat(analyst): playbook agent profile, batch create, per-run lookup and source filter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Research routes — prefill and register

**Files:**
- Create: `src/app/api/research/playbooks/[id]/registration/route.ts`
- Create: `src/app/api/research/playbooks/[id]/register/route.ts`

Both routes are thin; verified by typecheck/lint/build. Read `src/app/api/research/playbooks/[id]/approve/route.ts` for the surrounding style first.

- [ ] **Step 1: Prefill route**

Create `src/app/api/research/playbooks/[id]/registration/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { requireResearchUser } from '@/lib/research/store';
import { withResearch } from '@/lib/research/api';
import { getPlaybookRun, PlaybookError } from '@/lib/research/playbooks';
import { getThesis } from '@/lib/research/theses';
import { getMemo } from '@/lib/research/memos';
import { listEntities } from '@/lib/research/entities';
import {
  buildRegistrationCandidates, companyIdsFor, isRegistrable, registrationDefaults, type SecurityRow,
} from '@/lib/research/playbook-registration';
import { findPlaybookProfile, listPlaybookRecommendations, toExistingPlaybookRecommendation } from '@/lib/analyst/store';

/**
 * GET → RegistrationView (spec §5): everything the inline form needs to register
 * an approved PAPER_TRADE run as analyst recommendations, plus what was already
 * registered from it. Research reads analyst rows only to show that status.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const run = await getPlaybookRun(ctx, id);
    if (!run) throw new PlaybookError('playbook run not found', 404);
    const [thesis, memo] = await Promise.all([
      run.thesis_id ? getThesis(ctx, run.thesis_id) : Promise.resolve(null),
      run.memo_id ? getMemo(ctx, run.memo_id) : Promise.resolve(null),
    ]);
    const companyIds = companyIdsFor(thesis, memo);
    const [entities, securities, existingRows, analyst] = await Promise.all([
      companyIds.length ? listEntities(ctx, { type: 'COMPANY' }) : Promise.resolve([]),
      companyIds.length ? loadSecurities(ctx, companyIds) : Promise.resolve([] as SecurityRow[]),
      listPlaybookRecommendations(run.id),
      findPlaybookProfile(),
    ]);
    const existing = existingRows.map(toExistingPlaybookRecommendation);
    return {
      run: { id: run.id, proposed_action: run.proposed_action, approval_status: run.approval_status, rationale: run.rationale, review_at: run.review_at ?? null, thesis_id: run.thesis_id ?? null, memo_id: run.memo_id ?? null },
      source_title: thesis?.title ?? memo?.title ?? '',
      defaults: registrationDefaults(run, thesis, memo),
      candidates: buildRegistrationCandidates(entities, companyIds, securities, existing),
      analyst: analyst ? { id: analyst.id, display_name: analyst.display_name } : null,
      registered_count: existing.length,
      registrable: isRegistrable(run),
    };
  });
}

async function loadSecurities(ctx: Awaited<ReturnType<typeof requireResearchUser>>, entityIds: string[]): Promise<SecurityRow[]> {
  const { data, error } = await ctx.supabase.from('research_entity_securities')
    .select('entity_id, exchange_code, market, is_primary, valid_to').eq('user_id', ctx.userId).in('entity_id', entityIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    entity_id: String(s.entity_id), exchange_code: String(s.exchange_code), market: String(s.market),
    is_primary: Boolean(s.is_primary), valid_to: s.valid_to ? String(s.valid_to) : null,
  }));
}
```

- [ ] **Step 2: Register route**

Create `src/app/api/research/playbooks/[id]/register/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { audit, requireResearchUser } from '@/lib/research/store';
import { withResearch } from '@/lib/research/api';
import { getPlaybookRun, PlaybookError } from '@/lib/research/playbooks';
import { getThesis } from '@/lib/research/theses';
import { getMemo } from '@/lib/research/memos';
import {
  findDuplicateItem, isRegistrable, parseRegisterBody, registrationDefaults, splitRegistration,
} from '@/lib/research/playbook-registration';
import { parseRecommendationInput, type RecommendationInput } from '@/lib/analyst/validate';
import { createRecommendations, ensurePlaybookProfile, listPlaybookRecommendations, toExistingPlaybookRecommendation } from '@/lib/analyst/store';

const bad = (message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: { code: 'VALIDATION_ERROR', message, ...extra } }, { status: 400 });

/**
 * POST { items, rationale?, recommended_at? } → { created, skipped, analyst_id } (spec §6).
 * Every item is validated with the analyst validator before anything is written;
 * already-registered items are skipped; the rest are inserted in one request.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseRegisterBody(await req.json().catch(() => ({})));
  if (!parsed.ok) return bad(parsed.error);
  const dup = findDuplicateItem(parsed.value.items);
  if (dup !== null) return bad('duplicate_item', { item_index: dup });

  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const run = await getPlaybookRun(ctx, id);
    if (!run) throw new PlaybookError('playbook run not found', 404);
    if (!isRegistrable(run)) throw new PlaybookError('run_not_registrable', 422);
    const [thesis, memo] = await Promise.all([
      run.thesis_id ? getThesis(ctx, run.thesis_id) : Promise.resolve(null),
      run.memo_id ? getMemo(ctx, run.memo_id) : Promise.resolve(null),
    ]);
    const defaults = registrationDefaults(run, thesis, memo);
    // A human profile already named "Research Playbook" blocks the agent profile; surface it as a 409 the page can show.
    const analyst = await ensurePlaybookProfile().catch((e: unknown) => {
      if (e instanceof Error && e.message === 'analyst name taken') throw new PlaybookError('analyst name taken: rename the existing “Research Playbook” profile in /analyst', 409);
      throw e;
    });

    const inputs: RecommendationInput[] = [];
    for (let i = 0; i < parsed.value.items.length; i++) {
      const item = parsed.value.items[i];
      const candidate = parseRecommendationInput({
        analyst_id: analyst.id,
        ticker: item.ticker,
        market: item.market,
        action: item.action,
        confidence: item.confidence ?? defaults.confidence,
        horizon: item.horizon ?? defaults.horizon ?? undefined,
        target_price: item.target_price,
        stop_loss: item.stop_loss,
        rationale: parsed.value.rationale ?? defaults.rationale,
        thesis_ref: defaults.thesis_ref ?? undefined,
        source_type: 'playbook',
        source_ref: { playbook_run_id: run.id, thesis_id: run.thesis_id ?? null, memo_id: run.memo_id ?? null, entity_id: item.entity_id, model: memo?.provenance?.model ?? null },
        recommended_at: parsed.value.recommended_at ?? defaults.recommended_at,
      });
      if (!candidate.ok) return bad(candidate.error, { item_index: i, entity_id: item.entity_id });
      inputs.push(candidate.value);
    }

    const existing = (await listPlaybookRecommendations(run.id)).map(toExistingPlaybookRecommendation);
    const { toCreate, skipped } = splitRegistration(parsed.value.items, existing);
    const keep = new Set(toCreate.map((t) => `${t.market}:${t.ticker}`));
    const created = await createRecommendations(inputs.filter((inp) => keep.has(`${inp.market}:${inp.ticker}`)));
    await audit(ctx, 'playbook.register', run.id, {
      created_ids: created.map((r) => r.id), skipped_entity_ids: skipped.map((s) => s.entity_id), analyst_id: analyst.id,
    });
    return { created, skipped, analyst_id: analyst.id };
  });
}
```

Note the filter after `splitRegistration`: `inputs` and `parsed.value.items` are index-aligned and both carry the normalized `(market, ticker)`; a `Set` keyed on that pair keeps exactly the items that are not skipped.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: exit 0. If `ctx.supabase.from(...).in(...)` complains under `ResearchSupabase` (it is `any`-typed, so it should not), keep the code and cast only where TypeScript insists.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/api/research/playbooks/[id]/registration' 'src/app/api/research/playbooks/[id]/register'
git commit -m "feat(research): prefill and register routes for PAPER_TRADE → analyst recommendations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Inline registration form and page wiring

**Files:**
- Create: `src/components/research/PlaybookRegisterForm.tsx`
- Modify: `src/app/(app)/research/playbooks/page.tsx`

No unit tests (client glue; research pages use zh hard-coded copy and are i18n-exempt). Verified by typecheck/lint/build and the unauthenticated render check in Task 6.

- [ ] **Step 1: The form component**

Create `src/components/research/PlaybookRegisterForm.tsx`:

```tsx
'use client';

// Inline form under an approved PAPER_TRADE run: loads the prefill view from
// /api/research/playbooks/[id]/registration, lets the user pick companies and
// adjust ticker / market / action / confidence / horizon, then POSTs to
// /api/research/playbooks/[id]/register. zh copy is hard-coded (research i18n exemption).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { RegistrationCandidate, RegistrationDefaults } from '@/lib/research/playbook-registration';
import type { CoreMarket } from '@/lib/securities/model';
import type { DecisionAction, DecisionHorizon } from '@/lib/supabase/database.types';

interface RegistrationView {
  run: { id: string; rationale: string; review_at: string | null };
  source_title: string;
  defaults: RegistrationDefaults;
  candidates: RegistrationCandidate[];
  analyst: { id: string; display_name: string } | null;
  registered_count: number;
  registrable: boolean;
}

interface Row {
  key: string;
  entity_id: string | null;
  name: string;
  ticker: string;
  market: CoreMarket | '';
  action: DecisionAction;
  confidence: number;
  horizon: DecisionHorizon | '';
  selected: boolean;
  registered: boolean;
  note: string | null;
}

const ACTIONS: DecisionAction[] = ['buy', 'add', 'trim', 'sell', 'hold', 'pass'];
const ACTION_ZH: Record<DecisionAction, string> = { buy: '买入', add: '加仓', trim: '减仓', sell: '卖出', hold: '持有', pass: '观望' };
const MARKETS: CoreMarket[] = ['A', 'HK', 'US'];
const HORIZON_ZH: Record<DecisionHorizon, string> = { short: '短期', mid: '中期', long: '长期' };
const input = 'rounded border px-2 py-1 text-xs';

// datetime-local wants local wall-clock minutes; the API wants ISO with zone.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PlaybookRegisterForm({ runId, onRegistered }: { runId: string; onRegistered: () => void }) {
  const [view, setView] = useState<RegistrationView | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [rationale, setRationale] = useState('');
  const [recommendedAt, setRecommendedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research/playbooks/${runId}/registration`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) { setNotice(`读取失败：${data?.error?.message ?? res.status}`); return; }
    const v = data as RegistrationView;
    setView(v);
    setRationale(v.defaults.rationale);
    setRecommendedAt(toLocalInput(v.defaults.recommended_at));
    setRows(v.candidates.map((c) => ({
      key: c.entity_id, entity_id: c.entity_id, name: c.name, ticker: c.ticker ?? '', market: c.market ?? '',
      action: v.defaults.action, confidence: v.defaults.confidence, horizon: v.defaults.horizon ?? '',
      selected: c.selected, registered: c.registered_recommendation_id !== null,
      note: c.registered_recommendation_id ? '已登记' : !c.supported ? (c.ticker_source === 'none' ? '无标的，请手填' : '市场不支持') : null,
    })));
  }, [runId]);

  useEffect(() => { void load(); }, [load]);

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addManualRow() {
    const key = `manual-${Date.now()}`;
    setRows((rs) => [...rs, { key, entity_id: null, name: '手填', ticker: '', market: '', action: view?.defaults.action ?? 'buy',
      confidence: view?.defaults.confidence ?? 50, horizon: view?.defaults.horizon ?? '', selected: true, registered: false, note: null }]);
  }

  const chosen = rows.filter((r) => r.selected && r.ticker.trim() && r.market);

  async function submit() {
    if (!view || chosen.length === 0) return;
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(`/api/research/playbooks/${runId}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: chosen.map((r) => ({ entity_id: r.entity_id, ticker: r.ticker.trim(), market: r.market, action: r.action, confidence: r.confidence, horizon: r.horizon || undefined })),
          rationale: rationale || undefined,
          recommended_at: recommendedAt ? new Date(recommendedAt).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const where = typeof data?.error?.item_index === 'number' ? `（第 ${data.error.item_index + 1} 行）` : '';
        setNotice(`登记失败${where}：${data?.error?.message ?? res.status}`);
        return;
      }
      setNotice(`已登记 ${data.created?.length ?? 0} 条，跳过 ${data.skipped?.length ?? 0} 条。`);
      await load();
      onRegistered();
    } finally { setBusy(false); }
  }

  if (!view) return <p className="mt-2 text-xs text-gray-500">{notice ?? '读取登记信息…'}</p>;

  return (
    <div className="mt-2 space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">登记为分析师建议 · 来源「{view.source_title || '—'}」</span>
        {view.analyst && (
          <Link href={`/analyst/${view.analyst.id}`} className="underline">归属 {view.analyst.display_name}</Link>
        )}
        {!view.analyst && <span className="text-gray-500">归属「Research Playbook」（首次登记时创建）</span>}
        {view.registered_count > 0 && <span className="text-gray-500">已登记 {view.registered_count} 条</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">建议时间（默认审批时间，不得晚于现在）
          <input type="datetime-local" className={`${input} w-52`} value={recommendedAt} onChange={(e) => setRecommendedAt(e.target.value)} />
        </label>
        <label className="flex min-w-[20rem] flex-1 flex-col gap-0.5">理由（整批共用）
          <input className={input} value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={4000} />
        </label>
      </div>
      <table className="w-full text-left">
        <thead className="text-gray-500">
          <tr><th className="pr-2">选</th><th className="pr-2">公司</th><th className="pr-2">标的</th><th className="pr-2">市场</th><th className="pr-2">方向</th><th className="pr-2">信心</th><th className="pr-2">期限</th><th>状态</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.registered ? 'opacity-60' : ''}>
              <td className="pr-2"><input type="checkbox" checked={r.selected} disabled={r.registered} onChange={(e) => update(r.key, { selected: e.target.checked })} /></td>
              <td className="pr-2">{r.name}</td>
              <td className="pr-2"><input className={`${input} w-28`} value={r.ticker} placeholder="600519.SH / 00700.HK / NVDA" onChange={(e) => update(r.key, { ticker: e.target.value })} disabled={r.registered} /></td>
              <td className="pr-2">
                <select className={input} value={r.market} onChange={(e) => update(r.key, { market: e.target.value as CoreMarket | '' })} disabled={r.registered}>
                  <option value="">—</option>
                  {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </td>
              <td className="pr-2">
                <select className={input} value={r.action} onChange={(e) => update(r.key, { action: e.target.value as DecisionAction })} disabled={r.registered}>
                  {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_ZH[a]}</option>)}
                </select>
              </td>
              <td className="pr-2"><input type="number" min={0} max={100} className={`${input} w-16`} value={r.confidence} onChange={(e) => update(r.key, { confidence: Number(e.target.value) })} disabled={r.registered} /></td>
              <td className="pr-2">
                <select className={input} value={r.horizon} onChange={(e) => update(r.key, { horizon: e.target.value as DecisionHorizon | '' })} disabled={r.registered}>
                  <option value="">未定</option>
                  {(Object.keys(HORIZON_ZH) as DecisionHorizon[]).map((h) => <option key={h} value={h}>{HORIZON_ZH[h]}</option>)}
                </select>
              </td>
              <td className="text-gray-500">{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addManualRow} className="rounded border px-2 py-1">新增一行</button>
        <button type="button" onClick={submit} disabled={busy || !view.registrable || chosen.length === 0} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
          {busy ? '登记中…' : `登记 ${chosen.length} 条为建议`}
        </button>
        {!view.registrable && <span className="text-red-700">该 run 不是已批准的 PAPER_TRADE，不能登记。</span>}
        {notice && <span className="text-blue-800">{notice}</span>}
      </div>
      <p className="text-gray-500">模拟成交价取建议日 K 线收盘，由 /analyst 的「刷新评分」写入；不构成投资建议。</p>
    </div>
  );
}
```

- [ ] **Step 2: Page wiring**

In `src/app/(app)/research/playbooks/page.tsx`:

1. Add imports:
```ts
import { PlaybookRegisterForm } from '@/components/research/PlaybookRegisterForm';
```

2. Add state next to the others:
```ts
  const [openRegister, setOpenRegister] = useState<string | null>(null);
  // playbook_run_id → { count, analyst_id } for "已登记 N 条 · 查看"
  const [registered, setRegistered] = useState<Record<string, { count: number; analyst_id: string }>>({});
```

3. Extend `load()` — after the memos fetch, add:
```ts
    const rRes = await fetch('/api/analyst/recommendations?source=playbook');
    const rData = await rRes.json().catch(() => ({ recommendations: [] }));
    const byRun: Record<string, { count: number; analyst_id: string }> = {};
    for (const rec of (rData.recommendations ?? []) as Array<{ analyst_id: string; source_ref: Record<string, unknown> | null }>) {
      const runId = rec.source_ref && typeof rec.source_ref.playbook_run_id === 'string' ? rec.source_ref.playbook_run_id : null;
      if (!runId) continue;
      byRun[runId] = { count: (byRun[runId]?.count ?? 0) + 1, analyst_id: rec.analyst_id };
    }
    setRegistered(byRun);
```

4. In the ③ 历史 list, inside each `<li>` after the `<p className="mt-0.5 text-xs text-gray-600">{run.rationale}</p>` line, add:
```tsx
              {run.proposed_action === 'PAPER_TRADE' && run.approval_status === 'APPROVED' && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setOpenRegister((cur) => (cur === run.id ? null : run.id))}
                    className="rounded border border-blue-300 px-2 py-0.5 text-blue-800"
                  >
                    {openRegister === run.id ? '收起' : registered[run.id] ? '再登记' : '登记为建议'}
                  </button>
                  {registered[run.id] && (
                    <Link href={`/analyst/${registered[run.id].analyst_id}`} className="underline">
                      已登记 {registered[run.id].count} 条 · 查看
                    </Link>
                  )}
                </div>
              )}
              {openRegister === run.id && <PlaybookRegisterForm runId={run.id} onRegistered={() => void load()} />}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: exit 0; build lists `/api/research/playbooks/[id]/registration` and `/api/research/playbooks/[id]/register`.

- [ ] **Step 4: Commit**

```bash
git add src/components/research/PlaybookRegisterForm.tsx 'src/app/(app)/research/playbooks/page.tsx'
git commit -m "feat(research): one-click registration form on approved PAPER_TRADE runs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Documentation sync

**Files:**
- Modify: `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md`
- Modify: `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`
- Modify: `docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md` (status line)

- [ ] **Step 1: ADR**

In the ADR's first bullet under 决定, replace the parenthetical `（首轮建议由人手工在 /analyst 登记，research 侧尚无自动产出，\`thesis_ref\` 只是可选引用；research → analyst 的自动投递是后续工作）` with `（首条自动投递通道：research 的 playbook \`PAPER_TRADE\` 运行审批通过后，可在 /research/playbooks 一键登记为建议，归属 Agent 档案「Research Playbook」，\`source_type = 'playbook'\`，\`source_ref\` 记 run / thesis / memo / entity；其他来源仍为手工登记，\`thesis_ref\` 为可选引用。设计见 \`docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md\`）`.

- [ ] **Step 2: Analyst spec §1.1 point 4**

In `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md` §1.1 item 4, append the sentence `playbook 投递已于 2026-10-18 实现（见同目录 playbook-to-recommendation 设计）。`

- [ ] **Step 3: This feature's spec status**

In `docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md` change `状态：设计待审阅，未实施。` to `状态：已实施（分支 \`codex/playbook-recommendations\`）。`

- [ ] **Step 4: Commit**

```bash
git add docs/adr/2026-10-17-research-analyst-portfolio-boundary.md docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md
git commit -m "docs: record the playbook → recommendation delivery channel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

- [ ] **Step 1:** `LC_ALL=C npx vitest run` → all green (whole suite). `npm run typecheck && npm run lint` → exit 0. `npm run build` → exit 0 with the two new research routes listed.
- [ ] **Step 2:** Dev server (`preview_start` name `stock-monitor`): open `/research/playbooks` unauthenticated → the admin gate message renders (no crash); `read_console_messages onlyErrors` shows only the expected 401/403. The signed-in flow (register → 已登记 N 条 → `/analyst/<id>` shows the rows) cannot be exercised here without credentials; say so in the report.
- [ ] **Step 3:** Report: command outputs, what was skipped, follow-ups (e.g. auto-registration at approval time, WATCHLIST → watchlist entry, thesis-level recommendations).
