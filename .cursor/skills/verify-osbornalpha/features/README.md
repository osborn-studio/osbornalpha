# osbornalpha feature map

The maintained list of user-facing features that `verify-osbornalpha` knows how to drive. Every file follows the same four sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`.
A proof that drives one entry point is incomplete when the file lists others.

| feature | file | journey (`scripts/drive.mjs`) | modes | needs internet |
|---|---|---|---|---|
| Landing page + zh/en i18n + design showcase | [landing-i18n.md](landing-i18n.md) | `landing` | guest, gate | no |
| Guest watchlist: search, add, persist, de-dup | [watchlist.md](watchlist.md) | `watchlist` | guest | yes (quotes) |
| Portfolio quote + K-line chart (+ Company Research unavailable state, research chain) | [stock-detail.md](stock-detail.md) | `stock` | guest | yes |
| Public market-data & search API | [market-data-api.md](market-data-api.md) | `quote-api` | guest, gate | yes |
| Auth gate (signed-out access control) | [auth-gate.md](auth-gate.md) | `auth-gate` | guest, gate | no |
| Macro Workbench guest view + static allocation template (hypothesis MarkCard) + research footer + research chain | [macro-workbench.md](macro-workbench.md) | `macro` | guest | no |

Not yet mapped (need real Supabase / credentials): sign-in and register, Macro data behind `/api/macro/*` (investment clock + breakdown, judgment slot, Fed liquidity / CN policy-rate series — see [macro-workbench.md](macro-workbench.md) Gotchas), Company Research at `/stock/[ticker]`, signed-in portfolio positions, `/research/*`, `/briefs`, `/settings`, `/copilot`, `/admin` (incl. `/admin/dq` data-quality dashboard — `src/app/(app)/admin/dq/`), Stripe billing, the Hermes / John Cameron CLI skills.

Not yet mapped (public read APIs that need a migrated Supabase with issuers/facts data — guest/gate modes have no anon DB, so these cannot be driven locally without credentials):
- Disclosure facts store (#102, CN path enabled in #104): `GET /api/facts/[ticker]` (`src/app/api/facts/[ticker]/route.ts`), `GET /api/facts/[ticker]/metrics` (`…/metrics/route.ts`), `GET /api/filings/[ticker]` (`src/app/api/filings/[ticker]/route.ts`). Spec: `docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md` §9; runbook: `docs/runbooks/data-foundation.md`. Without `NEXT_PUBLIC_SUPABASE_*` they 500 via `getAnonSupabase()`. #104 added real Tushare fixtures + §15 verification and turned CN sync on; it did **not** change these public read routes or make them driveable in guest/gate.
- Issuer resolve (data-foundation-1): `GET /api/entities/resolve` (`src/app/api/entities/resolve/route.ts`) — same anon Supabase + `issuers` / `issuer_securities` tables.
- Deprecated Tushare financials: `GET /api/financials/[ticker]` (`src/app/api/financials/[ticker]/route.ts`) needs `TUSHARE_TOKEN`; responses carry `Deprecation: true` and `Link` successor `/api/facts/{ticker}`. Prefer facts once seeded.
- Ops-only (not a user journey): `POST /api/cron/facts-sync` (`src/app/api/cron/facts-sync/route.ts`) — cron secret; `vercel.json` schedules US + CN (#104). CN is on by default, needs `TUSHARE_TOKEN` (503 `tushare_unconfigured` without it), kill-switched by `FACTS_CN_ENABLED=0`.
- Ops-only (not a user journey): `POST /api/cron/macro-sync` (FRED + CN official-HTTP collectors, #227/#228/#233) and the company evidence/digest CLI health work (#230: chunked evidence writes, freshness backlog tolerance) — no UI surface; covered by the repo's unit/integration tests, not by this skill.
- Research sections behind the research chain (chain itself is mapped in [macro-workbench.md](macro-workbench.md) / [stock-detail.md](stock-detail.md)): Industry research `/intel/industries` (+ `[scheme]/[code]`, `/constituents`; unified research UI since #261, read models in `src/lib/industry/`) and Company research `/intel/companies` read a migrated Supabase; guest renders their fail-closed/error states only. `INDUSTRY_E2E_FIXTURES=1` (`src/lib/industry/e2e-fixture.ts`) serves synthetic rows for the repo's Playwright suite — not product data, so it is not used here.
- Foreign broker research (#252, shared research UI #260): public `/intel/foreign-research` (+ `/[reportId]`, `/institutions/[institutionId]`) and `GET /api/broker-research/{reports,reports/[reportId],institutions,history,by-ticker/[ticker]}` are closed by default (public flag in broker-research settings, read over service-role Supabase; guest `GET /api/broker-research/reports` → 500 `internal` "reports unavailable"); the private library `/admin/broker-research/*` + `/api/admin/broker-research/*` is admin-only; crons `broker-research-outbox` / `broker-research-verify` and `macro-strategy-warm` are ops-only.
- Platform LLM base URL (`LLM_BASE_URL`, #255, `src/lib/llm/platform-base-url.ts`): operator config for LLM/copilot features, which need real LLM credentials.
