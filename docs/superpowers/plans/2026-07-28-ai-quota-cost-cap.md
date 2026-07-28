# AI Quota and Daily Cost Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise Copilot quotas to Free 20 / Pro 100, allow 9000 output tokens per model turn, record real token costs, and enforce an atomic CNY 8.8 per-user daily platform-AI cost cap.

**Architecture:** Keep feature-count quotas in `usage_events`, add a versioned pure pricing module, and enforce monetary budget through service-role-only PostgreSQL reservation/settlement functions. All platform LLM calls pass through a budget wrapper that reserves conservative cost before the request and settles actual provider usage afterward; BYO and admin calls bypass monetary enforcement.

**Tech Stack:** Next.js 15 route handlers, TypeScript, Vitest, Supabase/PostgreSQL migrations and RPC, next-intl.

---

## File map

**Create**

- `src/lib/billing/llm-pricing.ts` — normalized token usage, versioned model prices, integer micro-RMB cost and conservative reservation calculations.
- `src/lib/billing/llm-pricing.test.ts` — pure pricing and fallback tests.
- `src/lib/billing/cost-budget.ts` — authenticated platform-budget reserve/settle/release wrapper.
- `src/lib/billing/cost-budget.test.ts` — wrapper behavior with a fake RPC client.
- `supabase/migrations/20260728090000_llm_daily_cost_budget.sql` — audit columns, reservations table, atomic database functions and grants.
- `supabase/tests/llm_daily_cost_budget.sql` — pgTAP coverage for concurrency-safe budget rules and permissions.

**Modify**

- `src/lib/billing/quota.ts` and `quota.test.ts` — explicit Free/Pro feature limits.
- `src/lib/llm/openai-compat.ts`, `openai-compat.test.ts` — preserve cache-hit/miss usage.
- `src/lib/llm/anthropic-compat.ts`, `anthropic-compat.test.ts` — return normalized usage.
- `src/app/api/copilot/route.ts` and route tests — 9000 tokens, per-turn budget, aggregate usage and stable errors.
- `src/app/api/perspectives/[ticker]/route.ts` and tests — platform budget wrapper and cost aggregation.
- `src/lib/brief/composer.ts`, `src/app/api/brief/preview/route.ts` and tests — propagate and enforce preview token cost without affecting `skipLLM`.
- `src/app/api/usage/today/route.ts` and tests — return daily cost.
- `src/components/QuotaNotice.tsx`, `UsageToday.tsx`, their tests, and `messages/{zh,en}/{common,components}.json` — distinguish count quota from monetary budget.
- `src/lib/supabase/database.types.ts` — migration/RPC types.
- `.env.example` — documented safe defaults.

### Task 1: Replace the quota multiplier with an explicit plan matrix

**Files:**

- Modify: `src/lib/billing/quota.test.ts`
- Modify: `src/lib/billing/quota.ts`

- [ ] **Step 1: Write the failing quota policy tests**

Replace the existing `limitFor` Free/Pro assertions with:

```ts
describe('limitFor', () => {
  it('uses explicit free limits', () => {
    expect(limitFor('copilot', 'free', 'user')).toBe(20);
    expect(limitFor('perspectives', 'free', 'user')).toBe(5);
    expect(limitFor('brief_preview', 'free', 'user')).toBe(2);
  });

  it('uses explicit pro limits', () => {
    expect(limitFor('copilot', 'pro', 'user')).toBe(100);
    expect(limitFor('perspectives', 'pro', 'user')).toBe(50);
    expect(limitFor('brief_preview', 'pro', 'user')).toBe(20);
  });

  it('keeps admin unlimited and unknown plans on free', () => {
    expect(limitFor('copilot', 'free', 'admin')).toBe(-1);
    expect(limitFor('copilot', 'pro', 'admin')).toBe(-1);
    expect(limitFor('copilot', 'unknown', 'user')).toBe(20);
    expect(limitFor('perspectives', null, null)).toBe(5);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/lib/billing/quota.test.ts
```

Expected: FAIL because Copilot still returns 3/30.

- [ ] **Step 3: Implement the explicit matrix**

In `quota.ts`, replace `BASE_LIMITS` and `PRO_MULTIPLIER` with:

```ts
type MeteredPlan = 'free' | 'pro';

const PLAN_LIMITS: Record<MeteredPlan, Record<QuotaFeature, number>> = {
  free: { copilot: 20, perspectives: 5, brief_preview: 2 },
  pro: { copilot: 100, perspectives: 50, brief_preview: 20 },
};

export function limitFor(feature: QuotaFeature, plan: string | null, role: string | null): number {
  if (role === 'admin') return -1;
  const effective: MeteredPlan = plan === 'pro' ? 'pro' : 'free';
  return PLAN_LIMITS[effective][feature];
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/lib/billing/quota.test.ts
```

Expected: all quota tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/quota.ts src/lib/billing/quota.test.ts
git commit -m "feat: set explicit free and pro AI quotas"
```

### Task 2: Add normalized usage and versioned DeepSeek pricing

**Files:**

- Create: `src/lib/billing/llm-pricing.ts`
- Create: `src/lib/billing/llm-pricing.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing pricing tests**

Create `llm-pricing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  calculateCostMicrormb,
  normalizeUsage,
  reservationCostMicrormb,
} from './llm-pricing';

describe('normalizeUsage', () => {
  it('preserves DeepSeek cache token detail', () => {
    expect(normalizeUsage({
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 600,
      prompt_cache_miss_tokens: 400,
      completion_tokens: 250,
    })).toEqual({
      inputTokens: 1000,
      cacheHitInputTokens: 600,
      cacheMissInputTokens: 400,
      outputTokens: 250,
      estimated: false,
    });
  });

  it('prices missing cache detail as cache misses', () => {
    expect(normalizeUsage({ prompt_tokens: 1000, completion_tokens: 250 }))
      .toMatchObject({ cacheHitInputTokens: 0, cacheMissInputTokens: 1000 });
  });
});

describe('DeepSeek V4 Flash pricing', () => {
  it('calculates integer micro-RMB with a 7.2 exchange rate', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 1_000_000,
      estimated: false,
    }, 7_200_000)).toBe(3_024_000);
  });

  it('reserves current estimated input plus 9000 output tokens', () => {
    expect(reservationCostMicrormb(
      'deepseek',
      'deepseek-v4-flash',
      10_000,
      9_000,
      7_200_000,
    )).toBeGreaterThan(0);
  });

  it('rejects an unpriced platform model', () => {
    expect(() => calculateCostMicrormb('deepseek', 'unknown', {
      inputTokens: 1,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1,
      outputTokens: 0,
      estimated: false,
    }, 7_200_000)).toThrow('pricing_unavailable');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -- src/lib/billing/llm-pricing.test.ts
```

Expected: FAIL because `llm-pricing.ts` does not exist.

- [ ] **Step 3: Implement the pure pricing module**

Create `llm-pricing.ts` with these public contracts:

```ts
export interface NormalizedUsage {
  inputTokens: number;
  cacheHitInputTokens: number;
  cacheMissInputTokens: number;
  outputTokens: number;
  estimated: boolean;
}

export const PRICING_VERSION = 'deepseek-2026-04-24';
export const DEFAULT_USD_CNY_MICROS = 7_200_000;
export const DEFAULT_DAILY_LIMIT_MICRORMB = 8_800_000;

const PRICES = {
  'deepseek:deepseek-v4-flash': {
    cacheHitInputUsdPerMillion: 0.0028,
    cacheMissInputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
  },
} as const;

export function normalizeUsage(raw: unknown): NormalizedUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const input = nonNegativeInt(u.prompt_tokens);
  const output = nonNegativeInt(u.completion_tokens);
  const hit = Math.min(input, nonNegativeInt(u.prompt_cache_hit_tokens));
  const suppliedMiss = nonNegativeInt(u.prompt_cache_miss_tokens);
  const miss = hit + suppliedMiss === input ? suppliedMiss : input - hit;
  return {
    inputTokens: input,
    cacheHitInputTokens: hit,
    cacheMissInputTokens: miss,
    outputTokens: output,
    estimated: false,
  };
}

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function priceFor(provider: string, model: string) {
  const price = PRICES[`${provider}:${model}` as keyof typeof PRICES];
  if (!price) throw new Error('pricing_unavailable');
  return price;
}

export function calculateCostMicrormb(
  provider: string,
  model: string,
  usage: NormalizedUsage,
  usdCnyMicros: number,
): number {
  const p = priceFor(provider, model);
  const usd =
    usage.cacheHitInputTokens * p.cacheHitInputUsdPerMillion / 1_000_000 +
    usage.cacheMissInputTokens * p.cacheMissInputUsdPerMillion / 1_000_000 +
    usage.outputTokens * p.outputUsdPerMillion / 1_000_000;
  return Math.ceil(usd * usdCnyMicros);
}

export function reservationCostMicrormb(
  provider: string,
  model: string,
  estimatedInputTokens: number,
  maxOutputTokens: number,
  usdCnyMicros: number,
): number {
  return calculateCostMicrormb(provider, model, {
    inputTokens: estimatedInputTokens,
    cacheHitInputTokens: 0,
    cacheMissInputTokens: estimatedInputTokens,
    outputTokens: maxOutputTokens,
    estimated: true,
  }, usdCnyMicros);
}
```

Add documented defaults to `.env.example`:

```dotenv
LLM_DAILY_COST_LIMIT_MICRORMB=8800000
LLM_USD_CNY_MICROS=7200000
LLM_RESERVATION_TTL_SECONDS=300
```

- [ ] **Step 4: Run tests and verify GREEN**

```bash
npm test -- src/lib/billing/llm-pricing.test.ts
```

Expected: all pricing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/billing/llm-pricing.ts src/lib/billing/llm-pricing.test.ts
git commit -m "feat: add versioned LLM token pricing"
```

### Task 3: Add atomic PostgreSQL budget reservations

**Files:**

- Create: `supabase/migrations/20260728090000_llm_daily_cost_budget.sql`
- Create: `supabase/tests/llm_daily_cost_budget.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the failing pgTAP contract**

Create `supabase/tests/llm_daily_cost_budget.sql` with a transaction that:

```sql
begin;
select plan(7);

-- Seed one auth user and call RPCs with service_role in the local test DB.
-- The exact UUID is stable so repeated local runs remain deterministic.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values (
  '00000000-0000-4000-8000-000000000088',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'budget-test@example.invalid', ''
);

select ok(
  (public.reserve_llm_daily_budget(
    '00000000-0000-4000-8000-000000000088',
    'copilot', 'deepseek', 'deepseek-v4-flash',
    6000000, 8800000, 300
  )).allowed,
  'first reservation is allowed'
);

select isnt(
  (public.reserve_llm_daily_budget(
    '00000000-0000-4000-8000-000000000088',
    'copilot', 'deepseek', 'deepseek-v4-flash',
    3000000, 8800000, 300
  )).allowed,
  true,
  'second reservation cannot cross 8.8 RMB'
);

create temporary table first_reservation as
select * from public.reserve_llm_daily_budget(
  '00000000-0000-4000-8000-000000000088',
  'copilot', 'deepseek', 'deepseek-v4-flash',
  2000000, 8800000, 300
);

select lives_ok(
  format(
    'select public.settle_llm_budget(%L, 1250000)',
    (select reservation_id from first_reservation)
  ),
  'settlement succeeds'
);

select lives_ok(
  format(
    'select public.settle_llm_budget(%L, 1250000)',
    (select reservation_id from first_reservation)
  ),
  'settlement is idempotent'
);

select is(
  (select settled_micrormb from public.llm_cost_reservations
   where id = (select reservation_id from first_reservation)),
  1250000::bigint,
  'idempotent settlement charges once'
);

insert into public.llm_cost_reservations (
  user_id, feature, provider, model, reserved_micrormb, status, expires_at
) values (
  '00000000-0000-4000-8000-000000000088',
  'copilot', 'deepseek', 'deepseek-v4-flash',
  8800000, 'reserved', now() - interval '1 second'
);

select ok(
  (public.reserve_llm_daily_budget(
    '00000000-0000-4000-8000-000000000088',
    'copilot', 'deepseek', 'deepseek-v4-flash',
    1000000, 8800000, 300
  )).allowed,
  'expired reservations do not consume budget'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.reserve_llm_daily_budget(uuid,text,text,text,bigint,bigint,integer)',
    'execute'
  ),
  false,
  'authenticated clients cannot reserve budget directly'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the database test and verify RED**

```bash
supabase test db supabase/tests/llm_daily_cost_budget.sql
```

Expected: FAIL because the table and functions do not exist.

- [ ] **Step 3: Write the migration**

The migration must:

```sql
alter table public.usage_events
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists input_tokens bigint not null default 0,
  add column if not exists cache_hit_input_tokens bigint not null default 0,
  add column if not exists cache_miss_input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0,
  add column if not exists cost_micrormb bigint not null default 0,
  add column if not exists pricing_version text,
  add column if not exists usd_cny_micros bigint,
  add column if not exists usage_estimated boolean not null default false;

create table public.llm_cost_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('copilot','perspectives','brief_preview')),
  provider text not null,
  model text not null,
  reserved_micrormb bigint not null check (reserved_micrormb >= 0),
  settled_micrormb bigint check (settled_micrormb >= 0),
  status text not null check (status in ('reserved','settled','released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index llm_cost_reservations_user_day
  on public.llm_cost_reservations (user_id, created_at);

alter table public.llm_cost_reservations enable row level security;
```

Implement `reserve_llm_daily_budget` with a per-user transaction advisory lock:

```sql
perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
v_day_start := date_trunc('day', now() + interval '8 hours') - interval '8 hours';
v_day_end := v_day_start + interval '1 day';

select coalesce(sum(
  case when status = 'settled' then settled_micrormb
       when status = 'reserved' and expires_at > now() then reserved_micrormb
       else 0 end
), 0)
into v_used
from public.llm_cost_reservations
where user_id = p_user_id
  and created_at >= v_day_start and created_at < v_day_end;
```

Return a composite/table row containing `allowed`, `reservation_id`, `used_micrormb`, and `limit_micrormb`. Make `settle_llm_budget` and `release_llm_budget` lock by reservation ID and no-op when already terminal. Revoke all three functions from `public`, `anon`, and `authenticated`; grant only to `service_role`.

Update `database.types.ts` with `LlmCostReservation`, the added `UsageEvent`
fields, and RPC argument/result records using the exact SQL column names above.

- [ ] **Step 4: Reset the local database and verify GREEN**

```bash
supabase db reset
supabase test db supabase/tests/llm_daily_cost_budget.sql
```

Expected: migration succeeds and all 7 pgTAP assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260728090000_llm_daily_cost_budget.sql \
  supabase/tests/llm_daily_cost_budget.sql src/lib/supabase/database.types.ts
git commit -m "feat: add atomic daily LLM cost budget"
```

### Task 4: Add the server-side budget wrapper

**Files:**

- Create: `src/lib/billing/cost-budget.ts`
- Create: `src/lib/billing/cost-budget.test.ts`

- [ ] **Step 1: Write failing wrapper tests**

Test these outcomes with an injected fake client:

```ts
it('returns a reservation for an allowed platform call', async () => {
  const fake = fakeRpc({ allowed: true, reservation_id: 'r1', used_micrormb: 0 });
  const result = await reserveCostBudget(fake, USER_ID, {
    feature: 'copilot',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    estimatedInputTokens: 10_000,
    maxOutputTokens: 9_000,
  });
  expect(result.reservationId).toBe('r1');
});

it('throws daily_cost_exhausted when the atomic reservation is denied', async () => {
  const fake = fakeRpc({ allowed: false, reservation_id: null, used_micrormb: 8_800_000 });
  await expect(reserveCostBudget(fake, USER_ID, REQUEST))
    .rejects.toThrow('daily_cost_exhausted');
});

it('fails closed when a platform reservation RPC is unavailable', async () => {
  const fake = fakeRpcError('database unavailable');
  await expect(reserveCostBudget(fake, USER_ID, REQUEST))
    .rejects.toThrow('budget_unavailable');
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- src/lib/billing/cost-budget.test.ts
```

Expected: FAIL because the wrapper does not exist.

- [ ] **Step 3: Implement the wrapper**

Expose:

```ts
export interface CostReservation {
  reservationId: string;
  reservedMicrormb: number;
  settle(usage: NormalizedUsage): Promise<{ costMicrormb: number }>;
  release(): Promise<void>;
}

export async function reserveCostBudget(
  supabase: SupabaseClient,
  userId: string,
  request: {
    feature: QuotaFeature;
    provider: string;
    model: string;
    estimatedInputTokens: number;
    maxOutputTokens: number;
  },
): Promise<CostReservation>;
```

Parse configuration with safe defaults:

```ts
const dailyLimit = positiveInt(
  process.env.LLM_DAILY_COST_LIMIT_MICRORMB,
  DEFAULT_DAILY_LIMIT_MICRORMB,
);
const usdCnyMicros = positiveInt(
  process.env.LLM_USD_CNY_MICROS,
  DEFAULT_USD_CNY_MICROS,
);
const ttlSeconds = positiveInt(process.env.LLM_RESERVATION_TTL_SECONDS, 300);
```

`settle()` calculates actual cost and invokes `settle_llm_budget`; `release()` invokes `release_llm_budget`. Both methods are idempotent in memory as well as in SQL.

- [ ] **Step 4: Run wrapper and pricing tests**

```bash
npm test -- src/lib/billing/cost-budget.test.ts src/lib/billing/llm-pricing.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/cost-budget.ts src/lib/billing/cost-budget.test.ts
git commit -m "feat: wrap platform LLM calls with cost reservations"
```

### Task 5: Preserve provider token usage in both adapters

**Files:**

- Modify: `src/lib/llm/openai-compat.ts`
- Modify: `src/lib/llm/openai-compat.test.ts`
- Modify: `src/lib/llm/anthropic-compat.ts`
- Modify: `src/lib/llm/anthropic-compat.test.ts`

- [ ] **Step 1: Add failing adapter tests**

For OpenAI-compatible responses, mock:

```json
{
  "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
  "usage": {
    "prompt_tokens": 100,
    "prompt_cache_hit_tokens": 60,
    "prompt_cache_miss_tokens": 40,
    "completion_tokens": 25
  }
}
```

Assert `toolChat(...).usage` equals normalized 100/60/40/25. For Anthropic-compatible responses, mock `usage: {input_tokens: 100, output_tokens: 25}` and assert 100 input tokens are conservatively classified as cache misses.

- [ ] **Step 2: Run adapter tests and verify RED**

```bash
npm test -- src/lib/llm/openai-compat.test.ts src/lib/llm/anthropic-compat.test.ts
```

Expected: OpenAI cache detail and Anthropic usage assertions FAIL.

- [ ] **Step 3: Return `NormalizedUsage` from both adapters**

Import `normalizeUsage` into `openai-compat.ts`; replace the private two-field `Usage` type and parser. Extend `responseToTurn` and `anthropicToolChat` to include:

```ts
usage: normalizeUsage({
  prompt_tokens: data.usage?.input_tokens,
  completion_tokens: data.usage?.output_tokens,
})
```

Keep existing return fields unchanged so current callers remain source-compatible.

- [ ] **Step 4: Run adapter tests and verify GREEN**

```bash
npm test -- src/lib/llm/openai-compat.test.ts src/lib/llm/anthropic-compat.test.ts
```

Expected: all adapter tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/openai-compat.ts src/lib/llm/openai-compat.test.ts \
  src/lib/llm/anthropic-compat.ts src/lib/llm/anthropic-compat.test.ts
git commit -m "feat: preserve LLM cache and token usage"
```

### Task 6: Enforce and aggregate cost in Copilot

**Files:**

- Modify: `src/app/api/copilot/route.ts`
- Modify: `src/app/api/copilot/loop.ts`
- Test: `src/app/api/copilot/route.test.ts`

- [ ] **Step 1: Add failing Copilot route tests**

Add route-level tests proving:

```ts
it('passes max_tokens 9000 to every model turn', async () => {
  await runAuthenticatedPlatformCopilot();
  expect(toolChatMock).toHaveBeenCalled();
  for (const [, options] of toolChatMock.mock.calls) {
    expect(options.max_tokens).toBe(9000);
  }
});

it('emits daily_cost_exhausted and stops when reservation is denied', async () => {
  reserveCostBudgetMock.mockRejectedValue(new Error('daily_cost_exhausted'));
  const events = await readSse(await POST(platformRequest()));
  expect(events).toContainEqual(expect.objectContaining({
    type: 'error',
    code: 'daily_cost_exhausted',
  }));
  expect(toolChatMock).not.toHaveBeenCalled();
});

it('aggregates all model-turn usage into the run ledger', async () => {
  toolChatMock
    .mockResolvedValueOnce(turnWithUsage(100, 20, true))
    .mockResolvedValueOnce(turnWithUsage(200, 30, false));
  await readSse(await POST(platformRequest()));
  expect(recordUsageMock).toHaveBeenCalledWith('copilot', expect.objectContaining({
    inputTokens: 300,
    outputTokens: 50,
    costMicrormb: expect.any(Number),
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  }));
});
```

- [ ] **Step 2: Run the Copilot tests and verify RED**

```bash
npm test -- src/app/api/copilot/route.test.ts
```

Expected: FAIL on 3000 max tokens, missing budget error, and zero token ledger.

- [ ] **Step 3: Implement per-turn reserve/settle**

Extend `ModelTurn` to include `usage: NormalizedUsage`. In `callModel`:

```ts
const MAX_OUTPUT_TOKENS = 9_000;
const estimatedInputTokens = estimateSerializedTokens(systemPrompt, messages);
const reservation = provider.source === 'env'
  ? await reserveCostBudget(runDb!, userId!, {
      feature: 'copilot',
      provider: provider.provider,
      model: provider.model,
      estimatedInputTokens,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
  : null;

try {
  const response = provider.protocol === 'anthropic'
    ? await anthropicToolChat(cfg, { ...common, max_tokens: MAX_OUTPUT_TOKENS })
    : await toolChat(cfg, { ...common, max_tokens: MAX_OUTPUT_TOKENS, thinking: 'disabled' });
  const settlement = reservation ? await reservation.settle(response.usage) : { costMicrormb: 0 };
  aggregate.add(response.usage, settlement.costMicrormb);
  return response;
} catch (error) {
  await reservation?.release();
  throw error;
}
```

Implement and export:

```ts
export function estimateSerializedTokens(system: string, messages: OaiMessage[]): number {
  return Math.ceil(JSON.stringify([{ role: 'system', content: system }, ...messages]).length / 3);
}
```

Add:

```ts
it('conservatively estimates serialized model input', () => {
  const payload = [{ role: 'user' as const, content: 'abcdef' }];
  expect(estimateSerializedTokens('system', payload))
    .toBe(Math.ceil(JSON.stringify([
      { role: 'system', content: 'system' },
      ...payload,
    ]).length / 3));
});
```

Translate `daily_cost_exhausted`, `budget_unavailable`, and
`pricing_unavailable` into stable SSE codes without replacing them with the
generic provider failure message.

Extend `RecordUsageMeta` and `recordUsage` to insert aggregate provider/model/token/cost/pricing fields while still writing legacy `tokens_in/out`.

- [ ] **Step 4: Run Copilot and billing tests**

```bash
npm test -- src/app/api/copilot/route.test.ts src/app/api/copilot/loop.test.ts src/lib/billing
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/copilot/route.ts src/app/api/copilot/route.test.ts \
  src/app/api/copilot/loop.ts src/lib/billing/quota.ts
git commit -m "feat: enforce Copilot cost budget and 9000 token turns"
```

### Task 7: Enforce cost in perspectives and brief preview

**Files:**

- Modify: `src/app/api/perspectives/[ticker]/route.ts`
- Test: `src/app/api/perspectives/[ticker]/route.test.ts`
- Modify: `src/lib/brief/composer.ts`
- Modify: `src/app/api/brief/preview/route.ts`
- Test: `src/app/api/brief/preview/route.test.ts`

- [ ] **Step 1: Add failing route tests**

Perspectives:

```ts
it('returns a cost-specific quota payload when budget is exhausted', async () => {
  reserveCostBudgetMock.mockRejectedValue(new Error('daily_cost_exhausted'));
  const response = await GET(authenticatedTickerRequest());
  expect(await response.json()).toMatchObject({
    source: 'cost_quota',
    errorCode: 'daily_cost_exhausted',
    cost: { limitMicrormb: 8_800_000 },
  });
});
```

Brief:

```ts
it('returns 429 daily_cost_exhausted for an LLM preview', async () => {
  reserveCostBudgetMock.mockRejectedValue(new Error('daily_cost_exhausted'));
  const response = await GET(previewRequest({ skipLLM: false }));
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ code: 'daily_cost_exhausted' });
});

it('does not reserve budget for skipLLM=true', async () => {
  await GET(previewRequest({ skipLLM: true }));
  expect(reserveCostBudgetMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused route tests and verify RED**

```bash
npm test -- 'src/app/api/perspectives/[ticker]/route.test.ts' \
  src/app/api/brief/preview/route.test.ts
```

Expected: FAIL because neither route enforces monetary budget.

- [ ] **Step 3: Add the shared budget wrapper to every platform model call**

Refactor the perspective generation boundary and `generateDailyBrief` LLM boundary to accept an optional callback:

```ts
type MeteredLlmCall = <T>(
  request: MeteredCallRequest,
  invoke: () => Promise<T & { usage: NormalizedUsage }>,
) => Promise<T & { usage: NormalizedUsage; costMicrormb: number }>;
```

Route handlers create this callback only for `source === 'env'`. The callback reserves, invokes, settles, and releases on error. Aggregate all returned usage into the final `recordUsage`; preserve `skipLLM=true` as a zero-call path.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm test -- 'src/app/api/perspectives/[ticker]/route.test.ts' \
  src/app/api/brief/preview/route.test.ts src/lib/brief
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/perspectives/[ticker]/route.ts' \
  'src/app/api/perspectives/[ticker]/route.test.ts' \
  src/lib/brief/composer.ts src/app/api/brief/preview/route.ts \
  src/app/api/brief/preview/route.test.ts
git commit -m "feat: enforce cost budget across platform AI features"
```

### Task 8: Expose cost usage and distinct UI errors

**Files:**

- Modify: `src/app/api/usage/today/route.ts`
- Test: `src/app/api/usage/today/route.test.ts`
- Modify: `src/components/QuotaNotice.tsx`
- Create or modify: `src/components/QuotaNotice.test.tsx`
- Modify: `src/components/UsageToday.tsx`
- Create or modify: `src/components/UsageToday.test.tsx`
- Modify: `messages/zh/common.json`
- Modify: `messages/en/common.json`
- Modify: `messages/zh/components.json`
- Modify: `messages/en/components.json`

- [ ] **Step 1: Add failing API and component tests**

API assertion:

```ts
expect(await response.json()).toMatchObject({
  cost: {
    usedMicrormb: 1_250_000,
    limitMicrormb: 8_800_000,
    currency: 'CNY',
  },
});
```

Component assertion:

```tsx
render(<QuotaNotice
  used={0}
  limit={20}
  plan="free"
  reason="daily_cost_exhausted"
  costLimitMicrormb={8_800_000}
/>);
expect(screen.getByText(/8\\.8/)).toBeInTheDocument();
expect(screen.queryByText(/0\\/20/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- src/app/api/usage/today/route.test.ts \
  src/components/QuotaNotice.test.tsx src/components/UsageToday.test.tsx
```

Expected: FAIL because cost fields and reason-specific UI do not exist.

- [ ] **Step 3: Return and render daily cost**

Extend `QuotaNoticeProps`:

```ts
reason?: 'quota_exhausted' | 'daily_cost_exhausted';
costLimitMicrormb?: number;
```

Use dedicated `common.quota.costTitle` and `costDescription` translations. Extend `/api/usage/today` to sum `settled_micrormb` from today's settled reservation rows, ignoring released and expired reservations. Extend `UsageToday` response and render:

```tsx
<div className="flex items-center justify-between border-t border-border pt-2">
  <span className="text-text-dim">{t('platformCost')}</span>
  <span className="tabular-nums">
    ¥{(data.cost.usedMicrormb / 1_000_000).toFixed(2)}
    /¥{(data.cost.limitMicrormb / 1_000_000).toFixed(2)}
  </span>
</div>
```

Chinese copy:

```json
{
  "costTitle": "今日平台 AI 成本额度已用完",
  "costDescription": "平台额度为每天 ¥{limit}。可使用自己的 API Key，或等待北京时间 00:00 重置。"
}
```

Add equivalent natural English strings.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm test -- src/app/api/usage/today/route.test.ts \
  src/components/QuotaNotice.test.tsx src/components/UsageToday.test.tsx
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/usage/today/route.ts src/app/api/usage/today/route.test.ts \
  src/components/QuotaNotice.tsx src/components/QuotaNotice.test.tsx \
  src/components/UsageToday.tsx src/components/UsageToday.test.tsx \
  messages/zh/common.json messages/en/common.json \
  messages/zh/components.json messages/en/components.json
git commit -m "feat: show daily platform AI cost usage"
```

### Task 9: Full verification and production rollout notes

**Files:**

- Modify: `docs/runbooks/production-observability-alerts.md`
- Modify only when implementation deviates from the approved contract: `docs/superpowers/specs/2026-07-28-ai-quota-cost-cap-design.md`

- [ ] **Step 1: Search for unmetered platform LLM paths**

```bash
rg -n "toolChat\\(|anthropicToolChat\\(|chat\\(" src \
  -g '*.ts' -g '!*.test.ts'
```

Expected: every interactive `source === 'env'` call is either inside the new metered wrapper or explicitly documented as a platform-owned cron/non-user path.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: zero failed tests.

- [ ] **Step 3: Run static verification**

```bash
npm run typecheck
git diff --check
```

Expected: TypeScript exits 0 and `git diff --check` prints nothing.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: Next.js production build exits 0.

- [ ] **Step 5: Re-run database verification**

```bash
supabase db reset
supabase test db supabase/tests/llm_daily_cost_budget.sql
```

Expected: all migrations apply and all budget assertions PASS.

- [ ] **Step 6: Update the runbook**

Document:

```markdown
## Per-user AI cost budget

- Beijing-day hard limit: ¥8.80 across Copilot, perspectives, and brief preview.
- Free/Pro Copilot count limits: 20/100.
- Cost rejection code: `daily_cost_exhausted`.
- Inspect settled and expired reservations without recording prompts, API keys,
  complete email addresses, or raw provider responses.
```

- [ ] **Step 7: Review the final diff against the approved spec**

Check every requirement in Sections 1–12 of the design and record any deliberate deviation in the design document before release.

- [ ] **Step 8: Commit verification documentation**

```bash
git add docs/runbooks/production-observability-alerts.md \
  docs/superpowers/specs/2026-07-28-ai-quota-cost-cap-design.md
git commit -m "docs: add AI daily cost budget operations"
```
