# Data Source Map

Use available local and connected data sources before inventing new acquisition paths.

## Stock Monitor APIs

Use local or production Stock Monitor endpoints when available:

- `/api/search` for ticker resolution.
- `/api/stocks/[ticker]` for stock metadata.
- `/api/kline/[ticker]` for price series.
- `/api/signals/[ticker]` for technical and internal signals.
- `/api/flows/[ticker]` for A-share capital flow where available.
- `/api/holders/[ticker]` for holder data where available.
- `/api/perspectives/[ticker]` for AI committee perspectives.
- `/api/radar/[ticker]` and `/api/radar/batch` for radar-style priority signals.

## Local Code Sources

Relevant modules:

- `src/lib/data/sources/tushare.ts`
- `src/lib/data/sources/tushare-cached.ts`
- `src/lib/data/sources/eastmoney.ts`
- `src/lib/data/sources/sina.ts`
- `src/lib/data/sources/tencent.ts`
- `src/lib/stocks/search.ts`
- `src/lib/stocks/wind-normalize.ts`
- `src/lib/data/evidence-confidence.ts`

## WindPy

Use WindPy only when the user has a working local interface, exported files, or provides data. Do not claim live WindPy access unless it has been verified in the current environment.

## Tushare

Use Tushare for A-share structured data when a token or cache is available. Prefer cached data for repeatable local research.

## Source Files

For deep research, keep source files under a research workspace:

```text
research-books/<Company-or-Theme>/
  sources/
  references/
  chapters/
  exports/
```

## RAG Layer

RAG is a retrieval layer behind structured workflows. Do not make it the first product surface. Index source metadata, dates, issuer, company, ticker, source class, and workflow tags.
