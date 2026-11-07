You are auditing a design spec in this repository (read-only). Spec: docs/superpowers/specs/2026-11-04-industry-research-design.md (5th draft). Prior audit trail: docs/audits/2026-11-04-industry-research/ (round 4 = 06-codex-round4.md, verdict "not ready"; the 5th draft claims to apply U1–U6 fixes verbatim, never re-audited).

Since the spec was written, plan 2 (disclosure facts store) LANDED on main. Landed code you must check the spec against:
- supabase/migrations/20261105090000_dq_foundation.sql, 20261105091000_issuers.sql, 20261106090000_financial_facts.sql
- src/lib/facts/* (types.ts FactsDb/readFacts envelope, derive.ts, read.ts, scope.ts, public-route.ts), src/lib/dq/*, src/lib/entities/*, src/lib/db/*
- docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md §16 (implementation record / deviations)
- src/lib/i18n messages-parity test, messages/*/, vercel.json

Scope is LIMITED to:
1. Defects newly introduced by the 5th draft (the U1–U6 applications): are they correct and executable in PostgreSQL 17 / Supabase (e.g. deferrable self-FK on a column that is now the PK target, partial unique + exclusion, trigger semantics, security definer owner role nologin needing table privileges, revokes from service_role, grants)?
2. Incompatibilities between the spec and the LANDED plan-2/plan-1 code: names, signatures, envelope shapes, derive.ts metric names and rule vocabulary, state_rev semantics, migration filenames/timestamps (new migrations must use timestamp prefix 20261111HHMMSS_), constraint names actually present, RLS/grant patterns, existing table columns (issuer_industry_memberships, industry_classifications, issuers.cninfo_org_id existence, stocks_universe), dq_freshness check name, recordAttempt signature, etc.
3. Final verdict: ready / not ready for an implementation plan, given that verification items 1/2 (sw_daily comparator basis, total_share basis) are NOT done and TUSHARE_TOKEN is unavailable, so I-3 (valuation) is excluded from the plan by the spec's own rule.

Do NOT re-litigate settled design choices from rounds 1–4. Output: a table of findings V1..Vn with severity P1/P2/P3, spec section, landed file:line evidence, concrete prescribed fix text. Then the verdict line.
