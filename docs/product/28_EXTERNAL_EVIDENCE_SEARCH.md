# External Evidence Search

## Purpose

The external-evidence layer supplies current public context to AI Perspectives,
News / Reports, and Copilot without mixing web retrieval into the LLM router.
Structured market prices and financial metrics remain owned by the existing
quote and fundamentals providers.

## Request flow

1. API routes authenticate the browser session before invoking the service.
2. `normalizeEvidenceSearchRequest` validates the ticker, scopes, freshness,
   and result limit.
3. `buildEvidenceQueries` produces at most four market-aware queries.
4. `resolveEvidenceSearchProvider` selects Tavily, Brave, or Serper. An explicit
   `SEARCH_PROVIDER` value fails closed when that provider has no credential.
5. The service runs at most two provider requests concurrently, normalizes and
   ranks results, then returns an honest `complete`, `partial`, `unavailable`,
   or `error` status.
6. Best-effort persistence records the request hash, audit metadata, canonical
   URLs, short provider snippets, and ticker links. Raw queries and credentials
   are not stored.

## Public contracts

- `GET /api/news/:ticker` returns verified headline metadata, conservative
  headline sentiment, source links, and provider/status metadata.
- `GET /api/reports/:ticker` prefers Tushare `report_rc` for A-share report
  metadata and supplements it with public search links.
- `POST /api/perspectives/:ticker` fetches one shared evidence snapshot for all
  personas and returns only citation IDs that exist in that snapshot.
- Copilot exposes `web_search` for news, filing, broker, company, industry, and
  macro context. Its original `search` tool remains security lookup only.

Provider snippets are untrusted input. Prompts prohibit following instructions
inside retrieved content, and citations are validated against normalized results
before they are displayed. The service never bypasses paywalls or claims to have
read report bodies that were not provided by the search API.

## Caching and freshness

- News and filing search: 15 minutes.
- General research search: 30 minutes.
- Broker search: 6 hours.
- Provider freshness filters are reinforced after retrieval: results with an
  explicit publication date older than the requested window are discarded.
  Undated public evidence is retained and shown as having an unknown date.

The `external-evidence` cache tag can be purged through the existing cache
revalidation route.

## Deployment

Apply `supabase/migrations/20260904000000_external_evidence.sql` before enabling
persistence. The tables use RLS with no browser policies and are writable only
through the service-role client after route-level authentication.

Configure one provider credential on the server:

```text
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=
BRAVE_SEARCH_API_KEY=
SERPER_API_KEY=
SEARCH_COST_MICRO_USD_PER_QUERY=
```

Only the selected provider key is required. None of these variables may use the
`NEXT_PUBLIC_` prefix. When no provider is configured, APIs return an explicit
unavailable state and the UI does not fall back to mock news.
