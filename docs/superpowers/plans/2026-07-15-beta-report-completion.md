# osbornALPHA Beta Report Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining beta-report recommendations by shipping watchlist activation, durable AI telemetry, quote-source diagnostics, and a secure internal usage dashboard.

**Architecture:** Keep `user_events` as first-party product telemetry, add `ai_runs` for sanitized Copilot lifecycle persistence, and derive admin metrics server-side after an explicit admin-role check. Deliver three vertical slices on the existing Next.js 14 and Supabase stack, with additive migrations first and Vercel production deployment last.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase/Postgres/RLS, next-intl, Vitest, Playwright, Vercel Node.js 22.

**Design spec:** `docs/superpowers/specs/2026-07-15-beta-report-completion-design.md`

---

## File Map

### New files

- `supabase/migrations/20260715090000_beta_observability.sql`: additive `user_events` fields, `ai_runs`, indexes, and RLS.
- `src/lib/analytics/sanitize.ts`: recursive metadata and request-context sanitization.
- `src/lib/analytics/sanitize.test.ts`: sanitization and normalization tests.
- `src/lib/stocks/asset-type.ts`: stable asset classification contract.
- `src/lib/stocks/asset-type.test.ts`: classification matrix.
- `src/lib/watchlist/onboarding.ts`: sample board and primary-board helpers.
- `src/lib/watchlist/onboarding.test.ts`: non-destructive onboarding tests.
- `src/lib/watchlist/insight.ts`: deterministic post-add monitoring insight.
- `src/lib/watchlist/insight.test.ts`: quote-state insight tests.
- `src/components/WatchlistOnboarding.tsx`: empty-state action surface.
- `src/components/PostAddInsight.tsx`: immediate monitoring value and Copilot handoff.
- `src/lib/copilot/runs.ts`: `ai_runs` lifecycle persistence helpers.
- `src/lib/copilot/runs.test.ts`: lifecycle and failure-isolation tests.
- `src/lib/quotes/diagnostics.ts`: source-attempt outcomes and aggregation.
- `src/lib/quotes/diagnostics.test.ts`: retry, timeout, fallback, and aggregation tests.
- `src/lib/admin/auth.ts`: reusable authenticated admin-role guard.
- `src/lib/admin/usage.ts`: pure usage aggregation functions and response types.
- `src/lib/admin/usage.test.ts`: funnel, AI, and quote metric tests.
- `src/app/api/admin/usage/route.ts`: secure aggregate data endpoint.
- `src/app/(app)/admin/usage/page.tsx`: protected usage page shell.
- `src/app/(app)/admin/usage/AdminUsageClient.tsx`: range control and dashboard rendering.
- `messages/zh/admin.json` and `messages/en/admin.json`: localized admin dashboard copy.
- `src/lib/security/scanner-paths.ts`: scanner path matcher.
- `src/lib/security/scanner-paths.test.ts`: blocked and allowed path tests.

### Existing files to modify

- `src/lib/supabase/database.types.ts`: `AssetType`, expanded `UserEvent`, and `AiRun` types.
- `src/lib/analytics/client.ts`: durable anonymous ID and safe telemetry payload.
- `src/app/api/events/route.ts`: server-derived request context and sanitized metadata.
- `src/app/api/search/route.ts`: return `asset_type` for every result.
- `src/app/(app)/watchlist/page.tsx`: onboarding, result-click telemetry, and post-add insight state.
- `messages/zh/market.json` and `messages/en/market.json`: onboarding, asset-type, and insight copy.
- `src/app/api/copilot/loop.ts`: additive `run` event type only.
- `src/app/api/copilot/route.ts`: create and finalize `ai_runs` around the stream.
- `src/app/(app)/copilot/CopilotClient.tsx`: AI events, `run_id`, and copy action.
- `messages/zh/market.json` and `messages/en/market.json`: Copilot copy status strings.
- `src/app/api/quote/batch/route.ts`: capture and return source diagnostics.
- `src/lib/hooks/useQuote.ts`: include source diagnostics in quote telemetry.
- `src/i18n/request.ts`: register the `admin` message domain.
- `src/middleware.ts`: early scanner rejection.

---

## Phase 1: Telemetry Foundation

### Task 1: Add the observability schema and shared sanitization

**Files:**
- Create: `supabase/migrations/20260715090000_beta_observability.sql`
- Create: `src/lib/analytics/sanitize.ts`
- Create: `src/lib/analytics/sanitize.test.ts`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write failing sanitization tests**

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeEventMetadata, normalizeReferrer, safeHeader } from './sanitize';

describe('analytics sanitization', () => {
  it('removes secret-shaped keys recursively and caps strings', () => {
    expect(sanitizeEventMetadata({
      ticker: 'AAPL',
      api_key: 'should-not-survive',
      nested: { accessToken: 'hidden', note: 'x'.repeat(600) },
    })).toEqual({ ticker: 'AAPL', nested: { note: 'x'.repeat(500) } });
  });

  it('keeps only origin and pathname from referrers', () => {
    expect(normalizeReferrer('https://www.osbornalpha.com/watchlist?q=secret#x'))
      .toBe('https://www.osbornalpha.com/watchlist');
  });

  it('length-limits request headers', () => {
    expect(safeHeader('a'.repeat(800), 500)).toHaveLength(500);
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run src/lib/analytics/sanitize.test.ts`

Expected: FAIL because `./sanitize` does not exist.

- [ ] **Step 3: Implement the sanitization boundary**

```ts
const SECRET_KEY = /api.?key|access.?token|refresh.?token|authorization|password|secret/i;

export function safeHeader(value: string | null, max = 500): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function normalizeReferrer(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

export function sanitizeEventMetadata(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 4) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (SECRET_KEY.test(key)) return [];
    if (typeof child === 'string') return [[key, child.slice(0, 500)]];
    if (typeof child === 'number' || typeof child === 'boolean' || child === null) return [[key, child]];
    if (Array.isArray(child)) return [[key, child.slice(0, 50).map((item) =>
      typeof item === 'string' ? item.slice(0, 200) : item)]];
    if (typeof child === 'object') return [[key, sanitizeEventMetadata(child, depth + 1)]];
    return [];
  }));
}
```

- [ ] **Step 4: Add the additive migration**

```sql
alter table public.user_events add column if not exists anonymous_id text;
alter table public.user_events add column if not exists user_agent text;
alter table public.user_events add column if not exists referrer text;

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text,
  method_id text not null,
  question text,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  content_md text,
  verdict jsonb,
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.ai_runs enable row level security;
create index if not exists ai_runs_user_created_idx on public.ai_runs (user_id, created_at desc);
create index if not exists ai_runs_status_created_idx on public.ai_runs (status, created_at desc);
create index if not exists ai_runs_ticker_created_idx on public.ai_runs (ticker, created_at desc);

drop policy if exists "ai_runs own select" on public.ai_runs;
create policy "ai_runs own select" on public.ai_runs for select using (auth.uid() = user_id);
drop policy if exists "ai_runs own insert" on public.ai_runs;
create policy "ai_runs own insert" on public.ai_runs for insert with check (auth.uid() = user_id);
drop policy if exists "ai_runs own update" on public.ai_runs;
create policy "ai_runs own update" on public.ai_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 5: Add exact TypeScript row types**

```ts
export type AssetType = 'stock' | 'etf' | 'convertible_bond' | 'fund' | 'index' | 'unknown';

export interface AiRun {
  id: string;
  user_id: string;
  ticker: string | null;
  method_id: string;
  question: string | null;
  status: 'running' | 'completed' | 'failed';
  content_md: string | null;
  verdict: Record<string, unknown> | null;
  error_code: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}
```

Also add `anonymous_id`, `user_agent`, and `referrer` to `UserEvent`, and register `ai_runs` in `Database.public.Tables`.

- [ ] **Step 6: Run focused tests and type checking**

Run: `npx vitest run src/lib/analytics/sanitize.test.ts`

Expected: 3 tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit the foundation**

```bash
git add supabase/migrations/20260715090000_beta_observability.sql src/lib/analytics/sanitize.ts src/lib/analytics/sanitize.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: add beta observability schema"
```

### Task 2: Enrich first-party product events

**Files:**
- Modify: `src/lib/analytics/client.ts`
- Modify: `src/app/api/events/route.ts`
- Test: `src/lib/analytics/sanitize.test.ts`

- [ ] **Step 1: Add failing identity and payload tests**

Extend the analytics test with a pure exported `sanitizeEventName` contract:

```ts
it('accepts stable event names and rejects malformed names', () => {
  expect(sanitizeEventName('watchlist_viewed')).toBe('watchlist_viewed');
  expect(sanitizeEventName('bad event name')).toBeNull();
  expect(sanitizeEventName('x'.repeat(81))).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and see it fail**

Run: `npx vitest run src/lib/analytics/sanitize.test.ts`

Expected: FAIL because `sanitizeEventName` is not exported.

- [ ] **Step 3: Implement durable anonymous identity in the browser client**

```ts
const SESSION_KEY = 'osbornalpha:session-id';
const ANONYMOUS_KEY = 'osbornalpha:anonymous-id';

function browserId(storage: Storage, key: string): string {
  let id = storage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    storage.setItem(key, id);
  }
  return id;
}
```

Use `sessionStorage` for `session_id`, `localStorage` for `anonymous_id`, sanitize metadata before serialization, and retain the sendBeacon-to-fetch fallback.

- [ ] **Step 4: Enrich the server route from trusted request context**

```ts
const anonymousId = safeString(body.anonymous_id, 120);
const metadata = sanitizeEventMetadata(body.metadata);
const userAgent = safeHeader(req.headers.get('user-agent'));
const referrer = normalizeReferrer(req.headers.get('referer'));

await sb.from('user_events').insert({
  user_id: user?.id ?? null,
  anonymous_id: anonymousId,
  session_id: sessionId,
  event_name: eventName,
  path,
  metadata,
  user_agent: userAgent,
  referrer,
});
```

Return 400 for malformed event names and preserve the existing best-effort 200 response for storage failures.

- [ ] **Step 5: Verify tests and types**

Run: `npx vitest run src/lib/analytics/sanitize.test.ts`

Expected: all analytics tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit event enrichment**

```bash
git add src/lib/analytics/client.ts src/lib/analytics/sanitize.ts src/lib/analytics/sanitize.test.ts src/app/api/events/route.ts
git commit -m "feat: enrich product telemetry context"
```

### Checkpoint 1: Telemetry foundation

- [ ] Run `npm test`; expect all tests PASS.
- [ ] Run `npm run typecheck`; expect exit 0.
- [ ] Inspect the migration for additive-only statements and no destructive DDL.
- [ ] Update the osstack telemetry card with test counts and commit IDs.

---

## Phase 2: Watchlist Activation

### Task 3: Classify and expose asset types in search

**Files:**
- Create: `src/lib/stocks/asset-type.ts`
- Create: `src/lib/stocks/asset-type.test.ts`
- Modify: `src/app/api/search/route.ts`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the classification matrix**

```ts
import { describe, expect, it } from 'vitest';
import { classifyAssetType } from './asset-type';

describe('classifyAssetType', () => {
  it.each([
    [{ ticker: '600519.SH', name: '贵州茅台' }, 'stock'],
    [{ ticker: '510300.SH', name: '沪深300ETF', securityTypeName: 'ETF' }, 'etf'],
    [{ ticker: '113001.SH', name: '银行转债', securityTypeName: '可转债' }, 'convertible_bond'],
    [{ ticker: '161725.SZ', name: '招商白酒', securityTypeName: '基金' }, 'fund'],
    [{ ticker: '000001.SH', name: '上证指数', securityTypeName: '指数' }, 'index'],
    [{ ticker: 'AAPL', name: 'Apple' }, 'stock'],
  ] as const)('classifies %o as %s', (input, expected) => {
    expect(classifyAssetType(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `npx vitest run src/lib/stocks/asset-type.test.ts`

Expected: FAIL because `asset-type.ts` does not exist.

- [ ] **Step 3: Implement deterministic classification**

```ts
export function classifyAssetType(input: {
  ticker: string;
  name?: string;
  securityTypeName?: string;
  classify?: string;
}): AssetType {
  const text = `${input.name ?? ''} ${input.securityTypeName ?? ''} ${input.classify ?? ''}`;
  const code = input.ticker.split('.')[0];
  if (/可转债|转债|convertible/i.test(text) || /^(110|111|113|118|123|127|128)\d{3}$/.test(code)) return 'convertible_bond';
  if (/ETF|交易型开放式/i.test(text) || /^(51|56|58|15)\d{4}$/.test(code)) return 'etf';
  if (/指数|index/i.test(text)) return 'index';
  if (/基金|fund/i.test(text)) return 'fund';
  if (/^[A-Z][A-Z.]{0,9}$/.test(input.ticker) || /\.(SH|SZ|BJ|HK|TW|TWO|T|KS|KQ)$/.test(input.ticker)) return 'stock';
  return 'unknown';
}
```

- [ ] **Step 4: Add `asset_type` to all search paths**

Extend `UniverseRow` in the route response, preserve Eastmoney's `SecurityTypeName` and `Classify` through `parseEastmoney`, and map local/Taiwan hits through `classifyAssetType` before merging.

The response row must have this exact shape:

```ts
interface SearchResponseRow {
  t: string;
  n: string;
  py: string;
  m: Market;
  asset_type: AssetType;
}
```

- [ ] **Step 5: Verify classification and the search route build**

Run: `npx vitest run src/lib/stocks/asset-type.test.ts`

Expected: classification matrix PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit search classification**

```bash
git add src/lib/stocks/asset-type.ts src/lib/stocks/asset-type.test.ts src/app/api/search/route.ts src/lib/supabase/database.types.ts
git commit -m "feat: label search results by asset type"
```

### Task 4: Add empty-watchlist onboarding

**Files:**
- Create: `src/lib/watchlist/onboarding.ts`
- Create: `src/lib/watchlist/onboarding.test.ts`
- Create: `src/components/WatchlistOnboarding.tsx`
- Modify: `src/app/(app)/watchlist/page.tsx`
- Modify: `messages/zh/market.json`
- Modify: `messages/en/market.json`

- [ ] **Step 1: Write non-destructive onboarding tests**

```ts
import { describe, expect, it } from 'vitest';
import { createPrimaryBoard, installSampleBoard } from './onboarding';

describe('watchlist onboarding', () => {
  it('creates one empty primary board when no board exists', () => {
    expect(createPrimaryBoard([], '我的股票池')[0]).toMatchObject({ name: '我的股票池', tickers: [] });
  });

  it('does not overwrite existing user boards', () => {
    const current = [{ id: 'mine', name: '我的', tickers: ['AAPL'] }];
    expect(installSampleBoard(current, '示例股票池')).toEqual([
      ...current,
      expect.objectContaining({ name: '示例股票池' }),
    ]);
  });

  it('does not install the sample twice', () => {
    const once = installSampleBoard([], '示例股票池');
    expect(installSampleBoard(once, '示例股票池')).toEqual(once);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run src/lib/watchlist/onboarding.test.ts`

Expected: FAIL because onboarding helpers do not exist.

- [ ] **Step 3: Implement the sample and primary-board helpers**

```ts
export const SAMPLE_TICKERS = ['600519.SH', '00700.HK', 'AAPL'];

export function createPrimaryBoard(groups: WatchlistGroup[], name: string): WatchlistGroup[] {
  if (groups.length > 0) return groups;
  return [{ id: `primary_${Date.now()}`, name, tickers: [] }];
}

export function installSampleBoard(groups: WatchlistGroup[], name: string): WatchlistGroup[] {
  if (groups.some((group) => group.id === 'sample_watchlist')) return groups;
  return [...groups, { id: 'sample_watchlist', name, tickers: [...SAMPLE_TICKERS] }];
}
```

- [ ] **Step 4: Build the empty-state component**

The component accepts three command callbacks and renders icon-plus-text buttons with stable dimensions:

```tsx
interface Props {
  onSearch: () => void;
  onImport: () => void;
  onSample: () => void;
}

export function WatchlistOnboarding({ onSearch, onImport, onSample }: Props) {
  const t = useTranslations('market.watchlist.onboarding');
  return (
    <section className="border-y border-border py-6">
      <h2 className="text-base font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-text-dim">{t('description')}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button onClick={onSearch} className="min-h-20 rounded-md border border-border p-3 text-left">{t('search')}</button>
        <button onClick={onImport} className="min-h-20 rounded-md border border-border p-3 text-left">{t('import')}</button>
        <button onClick={onSample} className="min-h-20 rounded-md border border-border p-3 text-left">{t('sample')}</button>
      </div>
    </section>
  );
}
```

The current package has no icon library. Use the watchlist's existing text symbols (`＋`, `📥`, and `◎`) with localized `title` attributes; do not add a dependency or hand-drawn SVG for this release.

- [ ] **Step 5: Wire the three actions and telemetry**

In `watchlist/page.tsx`:

```ts
function openPrimaryAdd() {
  const next = createPrimaryBoard(groups, t('onboarding.defaultBoard'));
  if (next !== groups) persist(next);
  setView('kanban');
  setAddingInGroup(next[0].id);
  trackEvent('watchlist_empty_action_selected', { action: 'search' });
}

function installSample() {
  const next = installSampleBoard(groups, t('onboarding.sampleBoard'));
  persist(next);
  trackEvent('watchlist_sample_installed', { tickers: SAMPLE_TICKERS });
}
```

Record `watchlist_viewed` once after hydration with group and ticker counts. Replace the passive empty sentence with `WatchlistOnboarding`.

- [ ] **Step 6: Add complete Chinese and English copy**

Add these exact localized values and do not leave inline placeholder copy in the component:

```jsonc
// messages/zh/market.json
{
  "title": "建立你的第一份监控清单",
  "description": "加入真实关注的标的，行情和 AI 分析会从这里开始。",
  "search": "＋ 搜索并添加",
  "import": "📥 批量导入",
  "sample": "◎ 使用示例股票池",
  "defaultBoard": "我的股票池",
  "sampleBoard": "跨市场示例",
  "installed": "示例股票池已加入"
}

// messages/en/market.json
{
  "title": "Build your first watchlist",
  "description": "Add assets you actually follow. Quotes and AI analysis start here.",
  "search": "＋ Search and add",
  "import": "📥 Bulk import",
  "sample": "◎ Use a sample watchlist",
  "defaultBoard": "My Watchlist",
  "sampleBoard": "Cross-market Sample",
  "installed": "Sample watchlist added"
}
```

- [ ] **Step 7: Verify onboarding**

Run: `npx vitest run src/lib/watchlist/onboarding.test.ts src/lib/watchlist/store.test.ts src/lib/watchlist/sync.test.ts`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 8: Commit onboarding**

```bash
git add src/lib/watchlist/onboarding.ts src/lib/watchlist/onboarding.test.ts src/components/WatchlistOnboarding.tsx 'src/app/(app)/watchlist/page.tsx' messages/zh/market.json messages/en/market.json
git commit -m "feat: guide empty watchlist activation"
```

### Task 5: Add search selection telemetry and immediate monitoring insight

**Files:**
- Create: `src/lib/watchlist/insight.ts`
- Create: `src/lib/watchlist/insight.test.ts`
- Create: `src/components/PostAddInsight.tsx`
- Modify: `src/app/(app)/watchlist/page.tsx`
- Modify: `messages/zh/market.json`
- Modify: `messages/en/market.json`

- [ ] **Step 1: Write insight behavior tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildPostAddInsight } from './insight';

describe('buildPostAddInsight', () => {
  it('describes positive movement without making a recommendation', () => {
    const insight = buildPostAddInsight({ ticker: 'AAPL', assetType: 'stock', quote: { change_pct: 2.4, delayed: false } });
    expect(insight.tone).toBe('up');
    expect(insight.messageKey).toBe('positive');
  });

  it('exposes unavailable and stale states', () => {
    expect(buildPostAddInsight({ ticker: 'AAPL', assetType: 'stock', quote: null }).messageKey).toBe('unavailable');
    expect(buildPostAddInsight({ ticker: 'AAPL', assetType: 'stock', quote: { change_pct: 0, delayed: true } }).stale).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/watchlist/insight.test.ts`

Expected: FAIL because the insight module does not exist.

- [ ] **Step 3: Implement a pure, non-advisory insight model**

```ts
export interface PostAddInsight {
  ticker: string;
  assetType: AssetType;
  tone: 'up' | 'down' | 'flat' | 'unknown';
  messageKey: 'positive' | 'negative' | 'flat' | 'unavailable';
  changePct: number | null;
  stale: boolean;
}

export function buildPostAddInsight(input: {
  ticker: string;
  assetType: AssetType;
  quote: Pick<LiveQuote, 'change_pct' | 'delayed'> | null;
}): PostAddInsight {
  if (!input.quote) return { ...input, tone: 'unknown', messageKey: 'unavailable', changePct: null, stale: false };
  const change = input.quote.change_pct;
  return {
    ticker: input.ticker,
    assetType: input.assetType,
    tone: change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat',
    messageKey: change > 0.05 ? 'positive' : change < -0.05 ? 'negative' : 'flat',
    changePct: change,
    stale: input.quote.delayed,
  };
}
```

- [ ] **Step 4: Render the post-add panel**

`PostAddInsight` accepts the added search result, current quote, `onDismiss`, and `onAnalyze`. It renders market and localized asset-type swatches, quote freshness, neutral monitoring copy, a dismiss icon button, and the command button for full analysis.

The analysis action must be:

```ts
router.push(`/copilot?ticker=${encodeURIComponent(result.t)}`);
trackEvent('post_add_ai_clicked', {
  ticker: result.t,
  market: result.m,
  asset_type: result.asset_type,
});
```

- [ ] **Step 5: Track search result clicks and set post-add state**

Change result buttons to call a local selection handler before `onAdd`:

```ts
function selectResult(result: SearchResult) {
  trackEvent('stock_search_result_clicked', {
    ticker: result.t,
    market: result.m,
    asset_type: result.asset_type,
    rank: results.findIndex((row) => row.t === result.t),
  });
  onAdd(result);
}
```

At the page level, store `lastAdded: SearchResult | null`. Set it only after a successful non-duplicate add, render `PostAddInsight`, and record `post_add_insight_viewed` once per added ticker.

Force-added results must call `classifyAssetType` and carry the same `asset_type` field.

- [ ] **Step 6: Add localized asset-type and insight strings**

Add exact keys for asset types and the post-add panel:

```jsonc
// Chinese values
{
  "assetTypes": { "stock": "股票", "etf": "ETF", "convertible_bond": "可转债", "fund": "基金", "index": "指数", "unknown": "其他" },
  "postAdd": {
    "title": "已开始监控 {ticker}",
    "positive": "当前涨幅 {change}，留意后续量价是否持续。",
    "negative": "当前跌幅 {change}，留意下行是否继续扩大。",
    "flat": "当前波动有限，等待新的价格或事件信号。",
    "unavailable": "已加入股票池，行情暂不可用。",
    "stale": "当前使用延迟行情",
    "analyze": "用 John 深度分析",
    "dismiss": "关闭监控提示"
  }
}

// English values
{
  "assetTypes": { "stock": "Stock", "etf": "ETF", "convertible_bond": "Convertible", "fund": "Fund", "index": "Index", "unknown": "Other" },
  "postAdd": {
    "title": "Now monitoring {ticker}",
    "positive": "Up {change}; watch whether price and volume follow through.",
    "negative": "Down {change}; watch whether downside pressure expands.",
    "flat": "Price movement is limited; wait for a new price or event signal.",
    "unavailable": "Added to your watchlist; quote data is temporarily unavailable.",
    "stale": "Using delayed quote data",
    "analyze": "Run a John analysis",
    "dismiss": "Dismiss monitoring insight"
  }
}
```

- [ ] **Step 7: Verify the activation slice**

Run: `npx vitest run src/lib/stocks/asset-type.test.ts src/lib/watchlist/onboarding.test.ts src/lib/watchlist/insight.test.ts`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 8: Commit immediate value**

```bash
git add src/lib/watchlist/insight.ts src/lib/watchlist/insight.test.ts src/components/PostAddInsight.tsx 'src/app/(app)/watchlist/page.tsx' messages/zh/market.json messages/en/market.json
git commit -m "feat: show insight after adding an asset"
```

### Checkpoint 2: Activation browser flow

- [ ] Start the app with `npm run dev -- --hostname 127.0.0.1` on an available port.
- [ ] Use Playwright at 390x844 and 1440x900 to verify empty onboarding, sample installation, search labels, post-add insight, and Copilot handoff.
- [ ] Assert `document.documentElement.scrollWidth === document.documentElement.clientWidth` at 390 px.
- [ ] Save screenshots under `/tmp/osbornalpha-beta-activation-mobile.png` and `/tmp/osbornalpha-beta-activation-desktop.png`.
- [ ] Update the osstack activation card with screenshot paths, test counts, and commit IDs.

---

## Phase 3: AI Run Persistence

### Task 6: Build the `ai_runs` lifecycle store

**Files:**
- Create: `src/lib/copilot/runs.ts`
- Create: `src/lib/copilot/runs.test.ts`

- [ ] **Step 1: Write lifecycle tests against a mock query boundary**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAiRun, completeAiRun, failAiRun } from './runs';

function makeRunDb() {
  const single = vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  return { client: { from: vi.fn(() => ({ insert, update })) } as any, insert, update };
}

it('creates a running row with capped question text', async () => {
  const db = makeRunDb();
  await createAiRun(db.client, { userId: 'u1', ticker: 'AAPL', methodId: 'john-cameron-5step', question: 'x'.repeat(3000) });
  expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'running', question: 'x'.repeat(2000) }));
});

it('completes with sanitized text and duration', async () => {
  const db = makeRunDb();
  await completeAiRun(db.client, 'run-1', { contentMd: 'answer', verdict: { rating: 'hold' }, durationMs: 1200 });
  expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', duration_ms: 1200 }));
});

it('uses stable failure codes', async () => {
  const db = makeRunDb();
  await failAiRun(db.client, 'run-1', { errorCode: 'provider_error', partialContent: 'safe', durationMs: 500 });
  expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error_code: 'provider_error' }));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/copilot/runs.test.ts`

Expected: FAIL because the lifecycle module does not exist.

- [ ] **Step 3: Implement focused lifecycle helpers**

```ts
export async function createAiRun(db: RunDb, input: CreateRunInput): Promise<string> {
  const { data, error } = await db.from('ai_runs').insert({
    user_id: input.userId,
    ticker: input.ticker ?? null,
    method_id: input.methodId,
    question: input.question?.slice(0, 2000) ?? null,
    status: 'running',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function completeAiRun(db: RunDb, id: string, input: CompleteRunInput): Promise<void> {
  const { error } = await db.from('ai_runs').update({
    status: 'completed',
    content_md: sanitizeAiText(input.contentMd),
    verdict: input.verdict ?? null,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    completed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}
```

Implement `failAiRun` with the same ID-scoped update. Export a `stableAiErrorCode` mapper for quota, provider, stream, and unknown errors.

- [ ] **Step 4: Verify lifecycle isolation**

Run: `npx vitest run src/lib/copilot/runs.test.ts src/app/api/copilot/loop.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the store**

```bash
git add src/lib/copilot/runs.ts src/lib/copilot/runs.test.ts
git commit -m "feat: persist copilot run lifecycle"
```

### Task 7: Persist Copilot streams server-side

**Files:**
- Modify: `src/app/api/copilot/loop.ts`
- Modify: `src/app/api/copilot/route.ts`
- Modify: `src/app/api/copilot/loop.test.ts`

- [ ] **Step 1: Add a failing additive-event test**

Extend the loop event type test to accept:

```ts
const event: CopilotEvent = { type: 'run', run_id: '00000000-0000-0000-0000-000000000001' };
expect(event.type).toBe('run');
```

- [ ] **Step 2: Run the loop test and verify the type failure**

Run: `npx vitest run src/app/api/copilot/loop.test.ts`

Expected: TypeScript/Vitest transform fails because `run` is not part of `CopilotEvent`.

- [ ] **Step 3: Add the run event and route persistence**

Add this union member:

```ts
| { type: 'run'; run_id: string }
```

Inside the stream, after provider and quota checks succeed:

```ts
const runStartedAt = Date.now();
let runId: string | null = null;
let runFailed = false;
let runErrorCode = 'unknown';

try {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    runId = await createAiRun(sb as any, {
      userId: user.id,
      ticker: ticker || null,
      methodId: resolvedMethod.id,
      question,
    });
    send({ type: 'run', run_id: runId });
  }
} catch (error) {
  console.warn('ai run create failed', { message: error instanceof Error ? error.message : String(error) });
}
```

Set `runFailed` and `runErrorCode` whenever `onEvent` sees an error event. In `finally`, best-effort call `completeAiRun` or `failAiRun` using sanitized accumulated text, verdict, and `Date.now() - runStartedAt`.

- [ ] **Step 4: Keep stream behavior backward compatible**

The order must be `steps`, optional `run`, normal tokens/tool summaries/verdict, and `done`. A persistence error only emits a structured server warning and never a new user-visible stream error.

- [ ] **Step 5: Verify route-adjacent tests and types**

Run: `npx vitest run src/app/api/copilot/loop.test.ts src/lib/copilot/runs.test.ts`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit server persistence**

```bash
git add src/app/api/copilot/loop.ts src/app/api/copilot/loop.test.ts src/app/api/copilot/route.ts src/lib/copilot/runs.ts
git commit -m "feat: record copilot stream outcomes"
```

### Task 8: Complete Copilot client telemetry and copying

**Files:**
- Modify: `src/app/(app)/copilot/CopilotClient.tsx`
- Modify: `messages/zh/market.json`
- Modify: `messages/en/market.json`

- [ ] **Step 1: Add run identity and terminal tracking state**

```ts
const [runId, setRunId] = useState<string | null>(null);
const [copied, setCopied] = useState(false);
```

Reset both at the beginning of every `run`.

- [ ] **Step 2: Handle the additive stream event**

```ts
if (e.type === 'run') {
  setRunId(e.run_id);
  trackEvent('ai_analysis_started', { run_id: e.run_id, ticker: tk || null, method_id: activeId });
}
```

Track `ai_analysis_completed` after the stream closes without an error and `ai_analysis_failed` when an error event or fetch failure occurs. Include `run_id` when available.

- [ ] **Step 3: Add the safe copy command**

```ts
const copyAnalysis = useCallback(async () => {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  setCopied(true);
  trackEvent('ai_analysis_copied', { run_id: runId, ticker: ticker || null, method_id: activeId });
}, [text, runId, ticker, activeId]);
```

Render a copy command only when `text` is non-empty. Use an existing icon or compact text command and a localized copied confirmation.

- [ ] **Step 4: Verify type safety and focused tests**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npx vitest run src/app/api/copilot/loop.test.ts src/lib/copilot/runs.test.ts src/lib/llm/openai-compat.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit client telemetry**

```bash
git add 'src/app/(app)/copilot/CopilotClient.tsx' messages/zh/market.json messages/en/market.json
git commit -m "feat: track and copy copilot analyses"
```

### Checkpoint 3: AI data loop

- [ ] Run `npm test`; expect all tests PASS.
- [ ] Run `npm run typecheck`; expect exit 0.
- [ ] Inspect client and server diffs to confirm no raw tool arguments/results are persisted.
- [ ] Verify every terminal run path calls either `completeAiRun` or `failAiRun` when a run ID exists.
- [ ] Update the osstack AI card with commit IDs and test counts.

---

## Phase 4: Reliability and Admin Operations

### Task 9: Add per-source quote diagnostics

**Files:**
- Create: `src/lib/quotes/diagnostics.ts`
- Create: `src/lib/quotes/diagnostics.test.ts`
- Modify: `src/app/api/quote/batch/route.ts`
- Modify: `src/lib/hooks/useQuote.ts`

- [ ] **Step 1: Write outcome and aggregation tests**

```ts
import { describe, expect, it } from 'vitest';
import { classifySourceFailure, aggregateSourceAttempts } from './diagnostics';

describe('quote diagnostics', () => {
  it('classifies aborts and timeout messages as timeout', () => {
    expect(classifySourceFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe('timeout');
    expect(classifySourceFailure(new Error('connect timeout'))).toBe('timeout');
  });

  it('aggregates attempts by source', () => {
    expect(aggregateSourceAttempts([
      { ticker: 'AAPL', source: 'eastmoney', outcome: 'empty', attempts: 2, duration_ms: 20 },
      { ticker: 'AAPL', source: 'sina', outcome: 'success', attempts: 1, duration_ms: 10 },
    ])).toEqual({
      eastmoney: { attempted: 1, succeeded: 0, failed: 1, retries: 1, duration_ms: 20 },
      sina: { attempted: 1, succeeded: 1, failed: 0, retries: 0, duration_ms: 10 },
    });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/quotes/diagnostics.test.ts`

Expected: FAIL because the diagnostics module does not exist.

- [ ] **Step 3: Implement diagnostic types and aggregation**

```ts
export type SourceOutcome = 'success' | 'empty' | 'timeout' | 'error';
export interface SourceAttempt {
  ticker: string;
  source: string;
  outcome: SourceOutcome;
  attempts: number;
  duration_ms: number;
}

export function classifySourceFailure(error: unknown): Exclude<SourceOutcome, 'success' | 'empty'> {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'AbortError' || /timeout|timed out|abort/i.test(message) ? 'timeout' : 'error';
}
```

Implement `aggregateSourceAttempts` as a pure reducer with integer counters.

- [ ] **Step 4: Return quote plus diagnostics from resolution**

Refactor the route's source loop to return:

```ts
interface QuoteResolution {
  quote: QuoteShape | null;
  attempts: SourceAttempt[];
  selectedSource: string | null;
}
```

Measure each source across both retry attempts, preserve cascade ordering, and keep Tushare as the final A-share layer. Fresh cache hits select `cache`; stale recovery retains upstream attempts and increments the existing stale count.

- [ ] **Step 5: Add response metadata and client event fields**

Return `sources`, `failed_tickers`, and `selected_sources` under `meta`. In `useQuote.ts`, include those exact fields in `quote_batch_loaded`; include `failed_tickers` if the request resolves but some quotes are null.

- [ ] **Step 6: Verify diagnostics and existing registry behavior**

Run: `npx vitest run src/lib/quotes/diagnostics.test.ts src/lib/data/sources/registry.test.ts`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit diagnostics**

```bash
git add src/lib/quotes/diagnostics.ts src/lib/quotes/diagnostics.test.ts src/app/api/quote/batch/route.ts src/lib/hooks/useQuote.ts
git commit -m "feat: attribute quote source degradation"
```

### Task 10: Build secure admin aggregation

**Files:**
- Create: `src/lib/admin/auth.ts`
- Create: `src/lib/admin/usage.ts`
- Create: `src/lib/admin/usage.test.ts`
- Create: `src/app/api/admin/usage/route.ts`

- [ ] **Step 1: Write pure aggregation tests**

```ts
import { describe, expect, it } from 'vitest';
import { aggregateUsage } from './usage';

const event = (event_name: string, user_id: string | null, metadata: Record<string, unknown> = {}) => ({
  event_name, user_id, anonymous_id: user_id ? null : 'anon-1', metadata, created_at: '2026-07-15T00:00:00Z',
});
const run = (status: 'completed' | 'failed', user_id: string, ticker: string, duration_ms: number) => ({
  status, user_id, ticker, duration_ms, method_id: 'john-cameron-5step', error_code: null, created_at: '2026-07-15T00:00:00Z',
});

it('computes activation and AI conversion using unique users', () => {
  const result = aggregateUsage({
    confirmedUsers: [{ id: 'u1' }, { id: 'u2' }],
    events: [
      event('watchlist_viewed', 'u1'),
      event('watchlist_stock_added', 'u1', { ticker: 'AAPL' }),
      event('post_add_insight_viewed', 'u1'),
      event('post_add_ai_clicked', 'u1'),
    ],
    aiRuns: [run('completed', 'u1', 'AAPL', 1200)],
  });
  expect(result.funnel).toMatchObject({ registrations: 2, watchlist_viewers: 1, activated_users: 1, activation_rate: 0.5 });
  expect(result.ai.completion_rate).toBe(1);
});

it('excludes unknown event names from funnel metrics', () => {
  expect(aggregateUsage({ confirmedUsers: [], events: [event('wp_scan', null)], aiRuns: [] }).funnel.watchlist_viewers).toBe(0);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/admin/usage.test.ts`

Expected: FAIL because the admin usage module does not exist.

- [ ] **Step 3: Implement the admin guard**

```ts
export class AdminForbidden extends Error {}

export async function requireAdminUser() {
  const sb = await getServerSupabase();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) throw new Error('not authenticated');
  const { data: profile, error: profileError } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (profile?.role !== 'admin') throw new AdminForbidden('admin role required');
  return user;
}
```

- [ ] **Step 4: Implement pure aggregation**

`aggregateUsage` must return stable sections:

```ts
export interface AdminUsageResponse {
  window: { key: '24h' | '7d' | '30d'; from: string; to: string };
  funnel: { registrations: number; watchlist_viewers: number; activated_users: number; activation_rate: number };
  search: { submitted: number; clicked: number; force_added: number; added: number };
  ai: { total: number; completed: number; failed: number; completion_rate: number; median_duration_ms: number | null; by_method: Record<string, number>; post_add_click_rate: number };
  popular_tickers: Array<{ ticker: string; adds: number }>;
  quotes: { batches: number; failed_tickers: number; stale: number; sources: Record<string, { attempted: number; succeeded: number; failed: number; duration_ms: number }> };
  recent_ai_failures: Array<{ ticker: string | null; method_id: string; error_code: string | null; created_at: string }>;
}
```

Use unique non-null `user_id`, fall back to `anonymous_id` for anonymous funnel events, calculate medians from sorted numeric durations, and cap list outputs.

- [ ] **Step 5: Implement the secure aggregate route**

Parse `range` through an exact map:

```ts
const WINDOWS = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 } as const;
const requested = request.nextUrl.searchParams.get('range');
const windowKey = requested && Object.prototype.hasOwnProperty.call(WINDOWS, requested)
  ? requested as keyof typeof WINDOWS
  : '7d';
```

Call `requireAdminUser()` before constructing `getAdminSupabase()`. Then query length-limited rows from `user_events`, `ai_runs`, and Supabase Auth `listUsers`, filter to the time window, and pass plain arrays to `aggregateUsage`.

Map no session to 401, `AdminForbidden` to 403, and unexpected errors to a safe 500 body.

- [ ] **Step 6: Verify admin logic**

Run: `npx vitest run src/lib/admin/usage.test.ts`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit secure aggregation**

```bash
git add src/lib/admin/auth.ts src/lib/admin/usage.ts src/lib/admin/usage.test.ts src/app/api/admin/usage/route.ts
git commit -m "feat: aggregate beta usage for admins"
```

### Task 11: Add the internal usage dashboard and scanner rejection

**Files:**
- Create: `src/app/(app)/admin/usage/page.tsx`
- Create: `src/app/(app)/admin/usage/AdminUsageClient.tsx`
- Create: `messages/zh/admin.json`
- Create: `messages/en/admin.json`
- Modify: `src/i18n/request.ts`
- Create: `src/lib/security/scanner-paths.ts`
- Create: `src/lib/security/scanner-paths.test.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Write scanner matcher tests**

```ts
import { describe, expect, it } from 'vitest';
import { isScannerPath } from './scanner-paths';

it.each(['/wp-admin', '/wp-admin/install.php', '/wp-login.php', '/xmlrpc.php', '/.env', '/.git/config'])('blocks %s', (path) => {
  expect(isScannerPath(path)).toBe(true);
});

it.each(['/watchlist', '/api/events', '/settings', '/stock/.gitlab'])('allows %s', (path) => {
  expect(isScannerPath(path)).toBe(false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/security/scanner-paths.test.ts`

Expected: FAIL because the scanner module does not exist.

- [ ] **Step 3: Implement scanner rejection before auth**

```ts
const EXACT = new Set(['/wp-login.php', '/xmlrpc.php', '/.env']);
const PREFIXES = ['/wp-admin', '/.git'];

export function isScannerPath(pathname: string): boolean {
  return EXACT.has(pathname) || PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
```

At the start of middleware, before locale rewriting or Supabase setup:

```ts
if (isScannerPath(rawPathname)) {
  return new NextResponse('Not Found', { status: 404, headers: { 'cache-control': 'public, max-age=3600' } });
}
```

- [ ] **Step 4: Register localized admin copy**

Add `admin` to `MESSAGE_DOMAINS`. Create matching Chinese and English JSON trees for title, range labels, funnel metrics, AI metrics, quote metrics, popular tickers, source health, recent failures, loading, empty, and per-panel error states.

- [ ] **Step 5: Build the protected page shell**

```tsx
export default async function AdminUsagePage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof AdminForbidden) return <AdminDenied />;
    redirect('/login?next=%2Fadmin%2Fusage');
  }
  return <AdminUsageClient />;
}
```

The denied state must not expose aggregate data.

- [ ] **Step 6: Build the dashboard client**

Use a fixed segmented control for `24h`, `7d`, and `30d`. Fetch `/api/admin/usage?range=${range}` on selection. Render compact metric bands, one funnel row, a popular-ticker table, a source-health table, and recent AI failures. Do not put page sections inside decorative cards or use oversized hero typography.

The fetch state is:

```ts
type ViewState =
  | { status: 'loading'; data: AdminUsageResponse | null }
  | { status: 'ready'; data: AdminUsageResponse }
  | { status: 'error'; data: AdminUsageResponse | null; message: string };
```

Preserve the previous successful data while a new range loads or one panel fails.

- [ ] **Step 7: Verify scanner tests, types, and build**

Run: `npx vitest run src/lib/security/scanner-paths.test.ts src/lib/admin/usage.test.ts`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: production build succeeds and `/admin/usage` plus `/api/admin/usage` are listed.

- [ ] **Step 8: Commit operations UI and scanner handling**

```bash
git add 'src/app/(app)/admin/usage/page.tsx' 'src/app/(app)/admin/usage/AdminUsageClient.tsx' src/lib/security/scanner-paths.ts src/lib/security/scanner-paths.test.ts src/middleware.ts src/i18n/request.ts messages/zh/admin.json messages/en/admin.json
git commit -m "feat: add beta operations dashboard"
```

### Checkpoint 4: Complete local release candidate

- [ ] Run `npm test`; expected: all test files and tests PASS.
- [ ] Run `npm run typecheck`; expected: exit 0.
- [ ] Run `npm run build`; expected: exit 0.
- [ ] Start the production build locally and verify `/wp-admin/install.php` returns 404 without an auth redirect.
- [ ] Verify unauthenticated `/admin/usage` redirects to login and an authenticated non-admin API call returns 403.
- [ ] Use Playwright at 390x844 and 1440x900 for watchlist and admin visual checks.
- [ ] Inspect browser console and network logs for uncaught errors, raw tool JSON, and horizontal overflow.
- [ ] Run `git diff origin/main...HEAD --check`; expected: no whitespace errors.
- [ ] Run a code review focused on authentication, service-role ordering, RLS, event privacy, and stream terminal states.
- [ ] Update all osstack development cards with evidence and move them to done only after their acceptance criteria pass.

---

## Phase 5: Database Migration and Production Release

### Task 12: Apply, deploy, smoke test, and close osstack

**Files:**
- No additional product files expected.
- Update plan checkboxes and osstack comments with real evidence only.

- [ ] **Step 1: Verify release identity and repository state**

Run: `git status --short --branch`

Expected: clean feature branch.

Run: `git log -1 --format='%an <%ae>'`

Expected: `gilosbornhello <osbornhello@gmail.com>` so Vercel team access accepts the deployment.

- [ ] **Step 2: Push the feature branch for remote backup**

Run: `git push -u origin codex/osbornalpha-beta-completion`

Expected: push succeeds without force.

- [ ] **Step 3: Apply the additive Supabase migration**

Use the linked production project `mzfcaabhuwtfvsvadvsv`. Apply only `20260715090000_beta_observability.sql`, then query the catalog to verify:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'user_events'
  and column_name in ('anonymous_id', 'user_agent', 'referrer');

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'ai_runs';
```

Expected: all three event columns and all designed AI run columns exist; RLS is enabled.

- [ ] **Step 4: Merge the reviewed branch to `main` without rewriting history**

Fetch current `origin/main`, verify the feature branch still descends from it, then fast-forward or create a normal merge commit. Do not force-push and do not touch unrelated dirty files in the original workspace.

- [ ] **Step 5: Verify Vercel project configuration**

Inspect project `stock-monitor` under team `team_B2Z3dd7qoz7rJQGfLHpR0E8W`.

Expected: Node.js Version remains `22.x`; production domain remains `www.osbornalpha.com`.

- [ ] **Step 6: Wait for the production deployment to become Ready**

Inspect the deployment associated with the merge commit. If Vercel reports `TEAM_ACCESS_REQUIRED`, verify commit author before creating any deployment-trigger commit. Do not mark the card done for `UNKNOWN`, `BLOCKED`, or preview-only deployments.

- [ ] **Step 7: Run public production smoke tests**

Verify:

```text
POST /api/events                         -> { ok: true }
GET  /api/search?q=510300                -> result includes asset_type=etf
GET  /api/search?q=113001                -> convertible bond when source returns it, or typed force-add fallback in UI
GET  /api/quote/batch?tickers=AAPL,600519.SH -> meta.sources and selected_sources present
GET  /wp-admin/install.php               -> 404, not 307
HEAD /watchlist                          -> unauthenticated redirect to /login
HEAD /admin/usage                        -> unauthenticated redirect to /login
```

- [ ] **Step 8: Verify production data paths**

Insert a clearly labeled anonymous event named `release_smoke_test` with metadata containing the deployed commit. Verify `anonymous_id`, `user_agent`, and normalized `referrer` behavior through Supabase. Verify the `ai_runs` schema and policies without spending model quota; use an authenticated owner run only if an owner session is already available.

- [ ] **Step 9: Verify the admin path with owner authorization**

With an existing authenticated admin session, load `/admin/usage?range=24h` and confirm funnel, AI, popular ticker, and source-health sections render. Confirm a non-admin request to `/api/admin/usage` receives 403.

- [ ] **Step 10: Monitor and close**

Monitor Vercel logs and new event rows for 30 minutes. Confirm no repeated 500s, no AI raw JSON, no failed migration reads, and no scanner auth redirects. Add deployment ID, production URL, commit, migration result, smoke outputs, and monitoring result to the osstack release card. Move the release card to `done` only when every production gate passes.

---

## osstack Card Decomposition

Create and manage these cards in dependency order:

1. `Beta telemetry foundation` - Tasks 1-2.
2. `Beta watchlist activation` - Tasks 3-5; depends on card 1 for event context.
3. `Persist Copilot runs` - Tasks 6-8; depends on card 1 and the migration.
4. `Quote diagnostics and admin usage` - Tasks 9-11; depends on cards 1 and 3.
5. `Beta completion release` - Task 12; depends on all development cards.

Each card moves `triage -> ready -> running -> done`. Use `blocked` only for a concrete failed gate and record the failure evidence in a comment. Every card comment must include current commit, commands run, pass/fail counts, and any residual risk.

## Final Acceptance Checklist

- [ ] Empty users see search, import, and sample onboarding actions.
- [ ] Search results and force-add fallbacks show canonical ticker, market, and asset type.
- [ ] Adding an asset immediately shows neutral monitoring value without an automatic LLM call.
- [ ] Post-add AI action opens the correct Copilot ticker.
- [ ] Product events contain anonymous/session identity and server-derived request context without secret metadata.
- [ ] Every persisted Copilot run reaches completed or failed when persistence is available.
- [ ] Copilot copy action records an event linked to `run_id`.
- [ ] Quote batch metadata attributes attempts and failures by source and ticker.
- [ ] Admin dashboard is accessible only to `profiles.role=admin` and reports all specified metrics.
- [ ] Scanner paths return a cheap 404 and do not enter auth routing.
- [ ] Full tests, typecheck, build, Playwright, migration verification, production smoke tests, and monitoring pass.
- [ ] osstack release card contains deployment evidence and is moved to `done`.
