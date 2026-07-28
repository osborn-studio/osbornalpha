# osbornALPHA Securities Master Data and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship a local-first securities master covering the approved A-share, exchange-fund, convertible-bond, Hong Kong Main Board, S&P 500, NASDAQ Top 500, and U.S.-listed Chinese issuer universes, then remove the user-facing force-add path.

**Architecture:** Normalize every provider behind typed adapters, validate complete snapshots before staging, and commit one scope at a time through a Supabase transaction. Search is a read-only database RPC; authenticated exact misses use a separate retry-safe POST resolver. Watchlist writes accept only verified active master records, while existing unknown holdings are preserved as inactive legacy identities.

**Tech Stack:** Next.js 15 App Router, TypeScript 5.6, React 19, Supabase/PostgreSQL, Vitest, Playwright, Tushare HTTP API, Nasdaq Trader/Nasdaq screener, State Street validation feed, Vercel Cron, osstack.

**Approved specification:** `docs/superpowers/specs/2026-07-15-security-master-data-search-design.md`

**osstack tracking card:** `card_d3e2dd44`

---

## Delivery Order

The work is intentionally split into independently testable slices:

1. Domain contracts and canonical ticker normalization.
2. Supabase schema, RLS, search RPC, and generated-style TypeScript types.
3. China and Hong Kong source adapters.
4. U.S. source adapters and deterministic universe selection.
5. Snapshot validation, staging, transactional writer, CLI, and cron.
6. Local search and authenticated exact resolver.
7. Watchlist API and UI removal of force-add.
8. Admin health view and telemetry.
9. Full verification and production rollout.

Do not start a later task while an earlier task's focused tests are red. Commit after every task so osstack can revert or hand off at a known-good boundary.

### Task 1: Domain Model and Canonical Normalization

**Files:**
- Create: `src/lib/securities/model.ts`
- Create: `src/lib/securities/normalize.ts`
- Create: `src/lib/securities/normalize.test.ts`
- Modify: `src/lib/stocks/wind-normalize.ts`
- Modify: `src/lib/stocks/asset-type.ts`
- Modify: `src/lib/stocks/asset-type.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the two runtime tools used by normalization and scripts**

Run:

```bash
npm install pinyin-pro@3.28.1
npm install --save-dev tsx@4.23.1
```

Add scripts:

```json
{
  "securities:sync": "tsx scripts/securities-sync.ts",
  "securities:reconcile": "tsx scripts/securities-reconcile.ts"
}
```

- [ ] **Step 2: Write failing normalization tests**

Create table-driven tests for these exact expectations:

```ts
import { describe, expect, it } from 'vitest';
import { buildAliases, normalizeSecurityTicker } from './normalize';

describe('normalizeSecurityTicker', () => {
  it.each([
    ['002463', 'A', '002463.SZ'],
    ['sz002463', 'A', '002463.SZ'],
    ['600519', 'A', '600519.SH'],
    ['430047', 'A', '430047.BJ'],
    ['700', 'HK', '00700.HK'],
    ['00700.HK', 'HK', '00700.HK'],
    ['brk-b', 'US', 'BRK.B'],
    ['BRK/B', 'US', 'BRK.B'],
    ['AAPL.O', 'US', 'AAPL'],
  ])('%s in %s becomes %s', (input, market, expected) => {
    expect(normalizeSecurityTicker(input, market as 'A' | 'HK' | 'US')).toBe(expected);
  });
});

describe('buildAliases', () => {
  it('builds ticker, vendor, name, full-pinyin and initials aliases', () => {
    const aliases = buildAliases({
      ticker: '002463.SZ', symbol: '002463', name: '沪电股份', market: 'A',
    });
    expect(aliases.map((row) => row.alias)).toEqual(expect.arrayContaining([
      '002463', '002463.sz', 'sz002463', 'hudiangufen', 'hdgf',
    ]));
  });
});
```

Use the actual `pinyin-pro` output in the final assertion after the first test run; store pinyin without tone marks and with no whitespace.

- [ ] **Step 3: Run the focused test and confirm the red state**

Run:

```bash
npx vitest run src/lib/securities/normalize.test.ts
```

Expected: FAIL because `model.ts` and `normalize.ts` do not exist.

- [ ] **Step 4: Implement stable contracts**

Define these contracts exactly in `model.ts`:

```ts
import type { AssetType, Market } from '@/lib/supabase/database.types';

export type CoreMarket = Extract<Market, 'A' | 'HK' | 'US'>;
export type SecurityUniverse =
  | 'a_stock' | 'a_exchange_fund' | 'a_cb' | 'hk_main'
  | 'sp500' | 'nasdaq_top500' | 'us_china';
export type FundSubtype = 'etf' | 'lof' | 'closed_end' | 'reit' | 'other_exchange_fund';
export type InstrumentForm = 'common_stock' | 'adr' | 'share_class' | 'fund_unit' | 'bond';

export interface NormalizedSecurity {
  ticker: string;
  symbol: string;
  name: string;
  name_en: string | null;
  full_name: string | null;
  pinyin: string | null;
  market: CoreMarket;
  exchange: 'SSE' | 'SZSE' | 'BSE' | 'HKEX' | 'NASDAQ' | 'NYSE' | 'AMEX';
  asset_type: AssetType;
  fund_subtype: FundSubtype | null;
  instrument_form: InstrumentForm;
  currency: 'CNY' | 'HKD' | 'USD';
  country_code: string | null;
  industry: string | null;
  list_status: 'listed' | 'paused' | 'delisted' | 'pending';
  list_date: string | null;
  delist_date: string | null;
  is_active: boolean;
  source: string;
  source_updated_at: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface NormalizedAlias {
  alias: string;
  ticker: string;
  alias_type: 'symbol' | 'vendor' | 'former_symbol' | 'name' | 'pinyin';
  source: string;
}

export interface NormalizedMembership {
  ticker: string;
  universe: SecurityUniverse;
  rank: number | null;
  market_cap_usd: number | null;
  as_of_date: string;
  is_active: boolean;
  source: string;
}

export interface SecuritySnapshot {
  source: string;
  scope: SecurityUniverse;
  asOf: string;
  securities: NormalizedSecurity[];
  aliases: NormalizedAlias[];
  memberships: NormalizedMembership[];
}
```

Implement `normalizeSecurityTicker`, `normalizeAlias`, `buildAliases`, and `isCompleteCodeQuery` in `normalize.ts`. Keep `AssetType` unchanged; ADR must be `asset_type='stock', instrument_form='adr'`, and LOF/closed-end/REIT must use `asset_type='fund'`.

- [ ] **Step 5: Make legacy helpers delegate to the canonical implementation**

Keep the public `normalizeWindTicker()` API, but delegate A/HK/US forms to `normalizeSecurityTicker`. Update `classifyAssetType()` so provider-supplied `asset_type` wins over ticker-prefix guessing; retain guessing only for legacy data.

- [ ] **Step 6: Run focused and existing stock tests**

Run:

```bash
npx vitest run src/lib/securities/normalize.test.ts src/lib/stocks/asset-type.test.ts
npm run typecheck
```

Expected: all tests pass and `tsc --noEmit` exits 0.

- [ ] **Step 7: Commit the domain slice**

```bash
git add package.json package-lock.json src/lib/securities src/lib/stocks/wind-normalize.ts src/lib/stocks/asset-type.ts src/lib/stocks/asset-type.test.ts
git commit -m "feat: add canonical security identity model"
```

### Task 2: Supabase Schema, RLS, and Search RPC

**Files:**
- Create: `supabase/migrations/20260715130000_security_master_data.sql`
- Create: `src/lib/securities/schema-contract.test.ts`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write a schema contract test before the migration**

Read the migration as text and assert the presence of all six structures, their RLS declarations, the search RPC, and the transactional commit RPC:

```ts
const required = [
  'security_aliases', 'security_universe_memberships', 'security_sync_runs',
  'security_discovery_candidates', 'security_sync_staging',
  'security_resolve_rate_limits', 'search_securities', 'commit_security_sync',
  'promote_verified_security',
  'consume_security_resolve_quota',
];
for (const token of required) expect(sql).toContain(token);
expect(sql).toContain('enable row level security');
expect(sql).toContain('on delete restrict');
```

- [ ] **Step 2: Confirm the schema test fails**

```bash
npx vitest run src/lib/securities/schema-contract.test.ts
```

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Create the additive migration**

The migration must:

```sql
create extension if not exists pg_trgm;

alter table public.stocks_universe
  add column if not exists symbol text,
  add column if not exists name_en text,
  add column if not exists full_name text,
  add column if not exists exchange text,
  add column if not exists asset_type text not null default 'unknown',
  add column if not exists fund_subtype text,
  add column if not exists instrument_form text,
  add column if not exists currency text,
  add column if not exists country_code text,
  add column if not exists list_status text not null default 'listed',
  add column if not exists list_date date,
  add column if not exists delist_date date,
  add column if not exists source text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.stocks_universe add constraint stocks_universe_asset_type_check
  check (asset_type in ('stock','etf','convertible_bond','fund','index','unknown')) not valid;
alter table public.stocks_universe validate constraint stocks_universe_asset_type_check;
```

Create:

```sql
create table public.security_aliases (
  alias text not null,
  ticker text not null references public.stocks_universe(ticker) on delete cascade,
  alias_type text not null check (alias_type in ('symbol','vendor','former_symbol','name','pinyin')),
  source text not null,
  primary key (alias, ticker, alias_type)
);

create table public.security_universe_memberships (
  ticker text not null references public.stocks_universe(ticker) on delete cascade,
  universe text not null,
  rank integer,
  market_cap_usd numeric,
  as_of_date date not null,
  is_active boolean not null default true,
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (ticker, universe)
);
```

Create `security_sync_runs`, `security_discovery_candidates`, and `security_sync_staging` with the exact fields and statuses from the approved specification. `security_sync_staging` must use `(run_id, record_kind, natural_key)` as its primary key and have no public policies. Add public SELECT policies only for `stocks_universe`, `security_aliases`, and `security_universe_memberships`; service-role-only tables get RLS enabled and no browser policy.

Create a private `security-snapshots` Supabase Storage bucket with a 30-day lifecycle documented for production. Create `security_resolve_rate_limits(subject_hash text, window_started_at timestamptz, attempts integer)` with `subject_hash` as the primary key and no browser policies. Add a security-definer `consume_security_resolve_quota(p_subject_hash text, p_limit integer, p_window_seconds integer)` that atomically rotates the window, increments the counter, returns boolean, fixes `search_path`, and is executable only by the service role.

Add indexes for ticker/symbol prefix, trigram names/pinyin, active market/type, alias lookup, membership scope/rank, and run status/time.

- [ ] **Step 4: Implement `search_securities` as a stable read-only RPC**

The SQL function accepts `(p_query text, p_limit integer default 10)` and returns the compatibility fields plus metadata:

```sql
returns table (
  t text, n text, py text, m market_t, asset_type text, exchange text,
  list_status text, match_kind text, verification_status text, selectable boolean
)
```

Normalize with `lower(trim(p_query))`, cap the limit to `1..30`, search exact canonical ticker, exact alias, ticker prefix, name, English name, pinyin, then trigram fuzzy matches. Use a numeric score and `ticker ASC` as the deterministic tie-breaker. Return inactive rows only for exact canonical ticker matches, with `selectable=false`.

- [ ] **Step 5: Implement `commit_security_sync`**

The security-definer function must set a safe `search_path`, lock the run row, require `status='staged'`, upsert securities before aliases and memberships, deactivate only memberships within the current scope, update run counters/status/checksum/snapshot path, and delete that run's staging rows. Reject calls from non-service contexts by revoking execute from `public`, `anon`, and `authenticated`.

Do not add the watchlist foreign key in this migration; production backfill must happen first.

Add a separate service-only `promote_verified_security(p_security jsonb, p_aliases jsonb, p_memberships jsonb)` function for exact resolver self-healing. It validates required scalar fields and approved universe names, upserts one security plus its aliases/memberships in one transaction, and never deactivates any existing identity or membership. Revoke execute from `public`, `anon`, and `authenticated`. This function must not call or bypass full-snapshot count gates; it is reachable only after the server has verified one record against an approved primary adapter.

- [ ] **Step 6: Update TypeScript database interfaces**

Add typed rows for every new field/table and RPC arguments/results. Keep the existing `AssetType` union byte-for-byte unchanged.

- [ ] **Step 7: Verify and commit the schema slice**

```bash
npx vitest run src/lib/securities/schema-contract.test.ts
npm run typecheck
git diff --check
git add supabase/migrations/20260715130000_security_master_data.sql src/lib/supabase/database.types.ts src/lib/securities/schema-contract.test.ts
git commit -m "feat: add securities master data schema"
```

### Task 3: Tushare A-Share, Fund, Bond, and Hong Kong Adapters

**Files:**
- Create: `src/lib/securities/sources/tushare-client.ts`
- Create: `src/lib/securities/sources/tushare-a.ts`
- Create: `src/lib/securities/sources/tushare-funds.ts`
- Create: `src/lib/securities/sources/tushare-cb.ts`
- Create: `src/lib/securities/sources/tushare-hk.ts`
- Create: `src/lib/securities/sources/tushare.test.ts`

- [ ] **Step 1: Write fixture-driven failing tests**

Use inline provider fixtures and injected `fetch` functions. Assert:

```ts
expect(aSnapshot.memberships).toContainEqual(expect.objectContaining({
  ticker: '002463.SZ', universe: 'a_stock', is_active: true,
}));
expect(etf.asset_type).toBe('etf');
expect(etf.fund_subtype).toBe('etf');
expect(reit.asset_type).toBe('fund');
expect(reit.fund_subtype).toBe('reit');
expect(activeCb.ticker).toBe('113001.SH');
expect(hkSnapshot.securities.map((row) => row.ticker)).toContain('00700.HK');
expect(hkSnapshot.securities.map((row) => row.ticker)).not.toContain('08001.HK');
```

Also assert malformed `fields/items`, Tushare non-zero response codes, and missing `TUSHARE_TOKEN` return typed source errors without logging the token or response body.

- [ ] **Step 2: Confirm red tests**

```bash
npx vitest run src/lib/securities/sources/tushare.test.ts
```

- [ ] **Step 3: Implement one strict Tushare client**

`tushare-client.ts` must accept `apiName`, `params`, requested `fields`, timeout, and injected fetch. Convert `fields/items` to records only after confirming every item has the same width. Throw `SecuritySourceError` with a stable code such as `source_auth`, `source_schema`, `source_timeout`, or `source_http`; never include credentials or full payloads.

- [ ] **Step 4: Implement the four adapters**

- A shares: `stock_basic(list_status='L')`, reject B-share prefixes `200`/`900` and `market='CDR'`.
- Funds: union `fund_basic(market='E',status='L')` and `etf_basic(list_status='L')`; ETF exact membership wins, `fund_type='REITs'` maps to REIT, and unresolved non-ETF exchange funds map to `other_exchange_fund` without becoming unknown assets.
- Convertible bonds: call `cb_basic`, active when `list_date <= asOf` and no effective `delist_date`.
- Hong Kong: `hk_basic(list_status='L')`, accept only `market='主板'`, normalize to five digits, and exclude GEM.

Each adapter returns a complete `SecuritySnapshot`, aliases included, and never writes the database.

- [ ] **Step 5: Verify adapters and commit**

```bash
npx vitest run src/lib/securities/sources/tushare.test.ts src/lib/securities/normalize.test.ts
npm run typecheck
git add src/lib/securities/sources
git commit -m "feat: add China and Hong Kong security adapters"
```

### Task 4: U.S. Exchange and Universe Adapters

**Files:**
- Create: `src/lib/securities/sources/nasdaq-directory.ts`
- Create: `src/lib/securities/sources/nasdaq-screener.ts`
- Create: `src/lib/securities/sources/sp500.ts`
- Create: `src/lib/securities/sources/us-universes.ts`
- Create: `src/lib/securities/sources/us-universes.test.ts`
- Create: `data/securities/us-china-overrides.json`

- [ ] **Step 1: Write deterministic U.S. selection tests**

Fixtures must include common stock, ADR, ETF, warrant, preferred share, test issue, missing market cap, `BRK/B`, China, Hong Kong, Cayman/China override, and an exclude override.

Assert:

```ts
expect(top500).toHaveLength(500);
expect(top500[0]).toMatchObject({ rank: 1 });
expect(selectNasdaqTop500(shuffledFixture)).toEqual(top500);
expect(chinaTickers).toEqual(expect.arrayContaining(['BABA', 'PDD']));
expect(chinaTickers).not.toContain('OTC1');
expect(normalizeUsSymbol('BRK/B')).toBe('BRK.B');
```

- [ ] **Step 2: Confirm red tests**

```bash
npx vitest run src/lib/securities/sources/us-universes.test.ts
```

- [ ] **Step 3: Implement exchange identity and screener adapters**

Use Nasdaq Trader Symbol Directory as the identity baseline. Parse pipe-delimited files, require the terminator record, reject test issues, and map NASDAQ/NYSE/NYSE American to `NASDAQ`/`NYSE`/`AMEX`. Parse the Nasdaq screener response with strict field checks; market cap must become a finite USD number or null.

Exclude names/symbol metadata containing warrants, rights, units, preferred stock, notes, bonds, and ETFs. ADRs remain `asset_type='stock', instrument_form='adr'`.

- [ ] **Step 4: Implement deterministic memberships**

`selectNasdaqTop500()` sorts by `market_cap_usd DESC, ticker ASC`, assigns ranks 1..500, and requires exactly 500 records. `selectUsChina()` intersects current NYSE/NASDAQ/AMEX common stocks/ADRs with country China/Hong Kong plus the reviewed include list, then applies excludes.

Create this non-placeholder override file:

```json
{
  "schema_version": 1,
  "includes": [],
  "excludes": []
}
```

The reconciliation report, not an undocumented hardcoded list, owns additions. Every future entry must include ticker, reason, source_url, reviewed_at, and reviewer.

- [ ] **Step 5: Implement the S&P adapter with an authorization gate**

`sp500.ts` accepts a normalized official snapshot supplied by either `SP500_CONSTITUENTS_URL` or a private Supabase Storage object path. It must reject non-HTTPS remote URLs, redirects to unapproved hosts, fewer than 490 or more than 510 securities, and files without source date/checksum. State Street SPY daily holdings may be used only as a secondary count/ticker reconciliation feed; it cannot commit the `sp500` membership by itself.

Return `source_authorization_required` when no approved official snapshot is configured. This failure must leave the prior S&P membership untouched while allowing other scopes to sync.

- [ ] **Step 6: Verify and commit U.S. adapters**

```bash
npx vitest run src/lib/securities/sources/us-universes.test.ts
npm run typecheck
git add src/lib/securities/sources data/securities/us-china-overrides.json
git commit -m "feat: add US security universe adapters"
```

### Task 5: Snapshot Validation, Writer, CLI, and Cron

**Files:**
- Create: `src/lib/securities/sync/thresholds.ts`
- Create: `src/lib/securities/sync/validate.ts`
- Create: `src/lib/securities/sync/writer.ts`
- Create: `src/lib/securities/sync/service.ts`
- Create: `src/lib/securities/sync/validate.test.ts`
- Create: `src/lib/securities/sync/service.test.ts`
- Create: `scripts/securities-sync.ts`
- Create: `scripts/securities-reconcile.ts`
- Create: `src/app/api/cron/securities-sync/route.ts`
- Create: `src/app/api/cron/securities-sync/route.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write failing validation tests**

Test the exact initial minima from the specification, 80% relative count, 5% identity deactivation, 5% S&P change, 15% NASDAQ Top 500 change, duplicate canonical ticker, conflicting primary vendor identity, missing required fields, and alias ambiguity that is allowed for names but rejected for a single source's primary ID.

- [ ] **Step 2: Implement pure validation**

Return a structured result instead of throwing for expected rejection:

```ts
export interface SnapshotValidation {
  accepted: boolean;
  errors: Array<{ code: string; message: string; count?: number }>;
  checksum: string;
  counts: { fetched: number; securities: number; aliases: number; memberships: number };
}
```

Compute SHA-256 over stable JSON sorted by ticker/alias/universe. No validator may read the network or database directly; pass previous counts/memberships as input.

- [ ] **Step 3: Implement the service-role writer**

The writer creates a `running` sync row, uploads the normalized snapshot to private `security-snapshots` storage, batches staging upserts by `run_id`, sets the run to `staged`, and calls `commit_security_sync`. On validation rejection, set `status='rejected'` without staging. On failure, store only stable error code and sanitized message.

Use batches of 500 and make repeated runs with the same checksum no-op successes. Cleanup failed staging after 24 hours.

- [ ] **Step 4: Implement scope orchestration**

`syncSecurityScopes({ scopes, dryRun, asOf })` invokes adapters independently and returns one result per scope. A failed S&P source must not suppress A/HK/other U.S. results. Exact source errors never deactivate old rows.

- [ ] **Step 5: Implement CLI and reconciliation report**

The CLI accepts:

```text
--scope all|a_stock|a_exchange_fund|a_cb|hk_main|sp500|nasdaq_top500|us_china
--dry-run
--apply
--as-of YYYY-MM-DD
--json
```

Default to dry-run; require exactly one of `--dry-run` or `--apply`. Print counts, validation errors, inserts/updates/deactivations, and checksum without secrets. `securities-reconcile.ts` emits unresolved U.S.-China identities and all legacy watchlist tickers without modifying rows.

- [ ] **Step 6: Add a strictly protected cron**

Unlike the older permissive crons, return 503 when `CRON_SECRET` is absent and 401 unless `Authorization: Bearer <secret>` matches. Do not implement `?force=1`. Configure two Vercel schedules:

```json
{ "path": "/api/cron/securities-sync?region=asia", "schedule": "30 21 * * *" }
{ "path": "/api/cron/securities-sync?region=us", "schedule": "30 0 * * *" }
```

The route maps `asia` to A/fund/CB/HK and `us` to exchange/SP500/Top500/China scopes. Set `maxDuration=300`.

- [ ] **Step 7: Verify and commit the sync engine**

```bash
npx vitest run src/lib/securities/sync src/app/api/cron/securities-sync/route.test.ts
npm run typecheck
git add src/lib/securities/sync scripts/securities-sync.ts scripts/securities-reconcile.ts src/app/api/cron/securities-sync vercel.json
git commit -m "feat: add guarded securities synchronization"
```

### Task 6: Database-First Search and Exact Resolver

**Files:**
- Create: `src/lib/securities/search.ts`
- Create: `src/lib/securities/search.test.ts`
- Create: `src/lib/securities/discovery.ts`
- Create: `src/lib/securities/discovery.test.ts`
- Create: `src/lib/securities/legacy-search.ts`
- Create: `src/app/api/search/route.test.ts`
- Create: `src/app/api/securities/resolve/route.ts`
- Create: `src/app/api/securities/resolve/route.test.ts`
- Modify: `src/app/api/search/route.ts`

- [ ] **Step 1: Write route and ranking tests first**

Required cases:

- empty query returns `{source:'empty',results:[]}`;
- exact `002463` ranks above fuzzy names;
- alias ambiguity returns both rows and never auto-selects;
- external fetch is never called by GET;
- `SECURITY_MASTER_SEARCH_ENABLED=false` delegates to the isolated legacy implementation;
- inactive exact ticker returns `selectable=false`;
- unauthenticated resolver returns 401;
- resolver rejects invalid/non-complete input with 400;
- trusted unique `002463` resolves, promotes once, and returns selectable;
- repeated resolver calls do not duplicate master/membership rows;
- exact promotion never deactivates another ticker or membership;
- Eastmoney-only discovery returns `external-unverified, selectable=false` and queues one candidate;
- timeout returns 504 with a stable code and no provider body.

- [ ] **Step 2: Replace mock-first GET with the RPC**

`src/lib/securities/search.ts` calls `supabase.rpc('search_securities', {p_query,p_limit})`, maps the database rows to the current `t/n/py/m/asset_type` response, and adds exchange/list status/match/verification/selectable. `GET /api/search` validates query length `1..80`, limit `1..30`, normalizes the query, and performs no provider call or write.

Keep a local mock fallback only when Supabase is not configured in developer guest mode. Production database errors return 503 and a stable `security_master_unavailable` error instead of silently presenting the 30-row mock as complete.

Move the current mock/TW/Eastmoney implementation unchanged into `legacy-search.ts`. The route delegates to it only when `SECURITY_MASTER_SEARCH_ENABLED='false'`; every other value uses the master search. This keeps rollback explicit without mixing external calls into the new search path.

- [ ] **Step 3: Implement authenticated exact resolution**

`POST /api/securities/resolve`:

1. authenticates through `getServerSupabase()`;
2. validates JSON `{query:string}` and complete-code shape;
3. requires `SECURITY_RATE_LIMIT_SECRET`, computes HMAC-SHA256 hashes for `user:<uuid>` and `ip:<forwarded-ip>`, and calls the service-only `consume_security_resolve_quota` RPC for both subjects after authentication and before any provider request;
4. calls only the inferred market's approved primary adapter with a 1.5-second total budget;
5. proves membership in an approved scope;
6. runs the single-record required-field, alias-conflict, and approved-membership validator, then calls `promote_verified_security` to upsert without any deactivation; or
7. stores a schema-checked discovery candidate and returns `selectable=false`.

Do not accept provider, URL, scope, metadata, name, or market from the browser.

- [ ] **Step 4: Verify and commit search**

```bash
npx vitest run src/lib/securities/search.test.ts src/lib/securities/discovery.test.ts src/app/api/search/route.test.ts src/app/api/securities/resolve/route.test.ts
npm run typecheck
git add src/lib/securities/search.ts src/lib/securities/discovery.ts src/lib/securities/*.test.ts src/app/api/search src/app/api/securities
git commit -m "feat: make security search database first"
```

### Task 7: Watchlist Integrity and One-Step Add UI

**Files:**
- Create: `src/lib/watchlist/security-validation.ts`
- Create: `src/lib/watchlist/security-validation.test.ts`
- Create: `src/app/api/watchlist/route.test.ts`
- Create: `src/app/api/watchlist/sync/route.test.ts`
- Create: `supabase/migrations/20260715140000_watchlist_security_fk.sql`
- Modify: `src/app/api/watchlist/route.ts`
- Modify: `src/app/api/watchlist/sync/route.ts`
- Modify: `src/app/(app)/watchlist/page.tsx`
- Modify: `messages/zh/watchlist.json`
- Modify: `messages/en/watchlist.json`
- Modify: `src/lib/data/custom-stocks.ts`

- [ ] **Step 1: Write API and UI-state tests**

Test that single and bulk writes reject unknown/inactive/pending tickers, accept verified active tickers, preserve existing inactive legacy rows on reads, and never trust client-supplied names or asset types.

Extract the search state transition into a pure helper and test:

```ts
expect(nextSearchAction({ localResults: [], query: '002463' })).toBe('resolve');
expect(nextSearchAction({ localResults: [verified], query: '002463' })).toBe('select');
expect(canAddResult({ ...verified, selectable: false })).toBe(false);
```

- [ ] **Step 2: Enforce validation in every write path**

`POST /api/watchlist` and `PUT /api/watchlist/sync` must batch-load all requested tickers from `stocks_universe`, require `is_active=true` and `list_status='listed'`, replace client ticker forms with canonical ticker, and return 422 `{error:'security_not_selectable',tickers:[...]}` for any rejection before deleting or rewriting current items.

- [ ] **Step 3: Remove force-add from the UI**

On local zero results for a complete code, automatically call the resolver under the existing loading state. Render unverified candidates disabled with a concise localized “待验证”/“Pending verification” status. Enter only selects a `selectable=true` result. Delete the `confirm()` branch and stop emitting `stock_force_added`; emit `security_resolve_started/completed/failed` instead.

Continue reading old custom-stock names for legacy cards during rollout, but stop calling `addCustomStock`. Do not delete users' localStorage during this release.

- [ ] **Step 4: Add the post-backfill FK migration**

The migration first inserts missing historical tickers as inactive pending legacy identities using canonical market inference, then adds:

```sql
alter table public.watchlist_items
  add constraint watchlist_items_ticker_fkey
  foreign key (ticker) references public.stocks_universe(ticker)
  on delete restrict not valid;
alter table public.watchlist_items validate constraint watchlist_items_ticker_fkey;
```

It must not delete or rewrite a user's watchlist item.

- [ ] **Step 5: Verify and commit the watchlist slice**

```bash
npx vitest run src/lib/watchlist src/app/api/watchlist
npm run typecheck
git add src/lib/watchlist src/app/api/watchlist src/app/'(app)'/watchlist/page.tsx messages supabase/migrations/20260715140000_watchlist_security_fk.sql src/lib/data/custom-stocks.ts
git commit -m "fix: make watchlist adds use verified securities"
```

### Task 8: Admin Sync Health and Product Telemetry

**Files:**
- Create: `src/lib/admin/securities-health.ts`
- Create: `src/lib/admin/securities-health.test.ts`
- Create: `src/app/api/admin/securities/route.ts`
- Create: `src/app/api/admin/securities/route.test.ts`
- Create: `src/app/(app)/admin/securities/page.tsx`
- Create: `src/app/(app)/admin/securities/AdminSecuritiesClient.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `messages/zh/admin.json`
- Modify: `messages/en/admin.json`

- [ ] **Step 1: Test health aggregation and admin authorization**

Fixtures must produce current active count, last successful/rejected run, data age, changed/deactivated counts, candidate backlog, local search hit rate, zero-result rate, resolver rate, and force-add legacy ratio. Assert non-admin 403 and unauthenticated 401 before admin client creation.

- [ ] **Step 2: Implement the admin API**

Reuse `requireAdminUser()` before `getAdminSupabase()`. Query only bounded windows and aggregate server-side. Return one row per scope plus global search metrics and these canaries: `002463.SZ`, `113001.SH`, `00700.HK`, `AAPL`, `BABA`.

- [ ] **Step 3: Build a restrained operations view**

Use the existing admin visual system. Show a compact table, status icons, counts, age, last result, and error code. Add a refresh icon button with tooltip. Do not expose tokens, raw payloads, source URLs containing query strings, or a client-side “override” button.

- [ ] **Step 4: Verify and commit admin health**

```bash
npx vitest run src/lib/admin/securities-health.test.ts src/app/api/admin/securities/route.test.ts
npm run typecheck
git add src/lib/admin/securities-health* src/app/api/admin/securities src/app/'(app)'/admin/securities src/app/'(app)'/layout.tsx messages
git commit -m "feat: add securities sync health monitoring"
```

### Task 9: Full Review, Browser Verification, and Production Rollout

**Files:**
- Create: `docs/release/2026-07-15-security-master-rollout.md`
- Create: `tests/security-search.spec.ts`
- Create: `scripts/benchmark-security-search.ts`
- Modify only if verification finds a defect: files from Tasks 1-8 and their tests

- [ ] **Step 1: Run local deterministic quality gates**

```bash
npm test
npm run typecheck
npm run build
npx supabase db lint --local
git diff --check
```

Expected: every command exits 0. If local Supabase is unavailable, start it with `npx supabase start`, rerun migrations from a clean database, and record the exact output in the rollout document.

Create `benchmark-security-search.ts` to issue 200 exact and 200 name/pinyin RPC searches against a seeded local or preview database, discard the first 20 warmups, sort durations, and print P50/P95 JSON. Fail with exit 1 when exact P95 exceeds 200 ms or name/pinyin P95 exceeds 300 ms.

Run:

```bash
npx tsx scripts/benchmark-security-search.ts
```

- [ ] **Step 2: Run security and contract review**

Review service-role import paths, RLS, security-definer search paths, cron auth, resolver rate limiting, provider schema validation, log redaction, and GET write count. Run:

```bash
osstack govern check --changed --workspace "$PWD"
osstack contracts check --workspace "$PWD"
```

Address every blocking finding with a focused regression test and separate fix commit.

- [ ] **Step 3: Run source dry-runs without database writes**

```bash
npm run securities:sync -- --scope all --dry-run --json > /tmp/security-master-dry-run.json
npm run securities:reconcile -- --json > /tmp/security-master-reconcile.json
```

Verify the approved minima, exactly 500 NASDAQ Top 500 memberships, no OTC Chinese securities, no unresolved alias conflicts, and no secrets in either file. S&P may proceed only when the authorized official snapshot gate passes.

- [ ] **Step 4: Apply the first migration and initial snapshot**

Use the linked production Supabase project:

```bash
npx supabase migration list --linked
npx supabase db push --linked --include-all
npm run securities:sync -- --scope all --apply --json
```

Before applying, create a Supabase backup/checkpoint and save the dry-run checksum. After apply, query active counts and all fixed canaries. Do not apply the watchlist FK migration until all historical items join an identity row.

- [ ] **Step 5: Run browser tests against a local production build**

Add Playwright tests for desktop `1440x900` and mobile `390x844`:

- search `002463`, click the verified result once, and see one card;
- search `00700`, `AAPL`, and `BABA`;
- disable quote network and confirm identity still renders with “行情暂不可用”;
- confirm no native confirm dialog appears;
- confirm long names and result metadata do not overflow.

Run:

```bash
npm run build
npm run start -- --port 3100
npx playwright test tests/security-search.spec.ts
```

Capture screenshots and inspect them before continuing.

- [ ] **Step 6: Deploy a Vercel preview and smoke test**

```bash
vercel deploy --yes
```

Verify preview search, resolver authentication, watchlist add, admin health, and cron 401 without the bearer secret. Confirm `TUSHARE_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SECURITY_RATE_LIMIT_SECRET`, and `SECURITY_MASTER_SEARCH_ENABLED` exist without printing values; verify an authorized S&P snapshot setting exists before enabling that scope.

- [ ] **Step 7: Rehearse rollback before production**

On preview, set `SECURITY_MASTER_SEARCH_ENABLED=false` and verify the isolated legacy search responds; set it back to true and verify master search. Run an apply attempt with an intentionally invalid-count fixture and confirm the last active membership counts do not change. Confirm disabling the new Vercel cron leaves search available from the last successful snapshot. Record the commands, before/after counts, and outcome in the rollout document.

- [ ] **Step 8: Deploy production only after every gate is green**

```bash
vercel deploy --prod --yes
```

Run production canaries through the public API and an authenticated browser. Observe 30 minutes for 500 responses, unexpected deactivations, search latency, zero results, and sync run errors. Keep `SECURITY_MASTER_SEARCH_ENABLED` available for immediate search rollback; disabling cron must not remove the last valid snapshot.

- [ ] **Step 9: Generate osstack evidence and close the card**

```bash
osstack proof --workspace "$PWD" --json
osstack kanban comment card_d3e2dd44 "Production rollout verified; proof pack attached."
osstack kanban move card_d3e2dd44 done
```

The rollout document must record commit SHA, migration versions, dry-run/apply counts and checksums, test totals, preview and production deployment URLs, browser screenshots, production canary results, and any intentionally deferred licensed scope. A deferred required scope keeps the card in `blocked`, not `done`.

---

## Completion Checklist

- [ ] Existing `AssetType` remains compatible.
- [ ] All seven approved universe scopes have a successful or explicitly blocked run.
- [ ] `002463` is a local exact hit and one-click add.
- [ ] GET search has zero write side effects.
- [ ] Resolver and cron are authenticated, bounded, and rate-limited.
- [ ] External outages retain the last valid snapshot.
- [ ] No historical watchlist row is deleted.
- [ ] Force-add is absent from the ordinary user flow.
- [ ] Full test, type, build, migration, browser, and production smoke gates pass.
- [ ] osstack proof exists and `card_d3e2dd44` reflects the truthful final state.
