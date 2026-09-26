# Source Extension (WP-A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the §5.1 columns, constraints, indexes and backfill to `research_source_documents`, extend the types and `ingestSource`, keep every existing path and the 1198-test suite green.

**Architecture:** One replayable SQL migration; types and `rowToSource` gain defaults so mocks and legacy rows behave unchanged; `ingestSource` validates and writes the new optional fields with defaults matching the backfill. DB behavior is pinned by an integration test that runs only with `S4_TEST_STATE`.

**Tech Stack:** Node 22, vitest, `pg`, isolated PostgreSQL 17 via `scripts/s4/local-db.ts` (run with `LC_ALL=en_US.UTF-8`).

Spec: `docs/superpowers/specs/2026-09-25-source-extension-design.md`.

---

### Task 1: Migration + DB integration test

**Files:** Create `supabase/migrations/20260925230000_research_source_extension.sql`, `src/lib/research/s4/source-extension.integration.test.ts`.

- [ ] Write the integration test (skips without `S4_TEST_STATE`): connect with `adminUrl`; assert columns exist; replay the migration file with `admin.query(readFileSync(...))` and expect no error; insert a NEWS row and a NOTE row with only legacy columns; expect `available_at = ingested_at`, `permission` public/private, `source_version '1'`, `market null`; expect check violations for `market 'EU'`, `permission 'secret'`, `origin_type 'rumor'`, `source_version '0'`; expect `update ... set available_at` and `set source_version` to raise `immutable`; expect `update ... set event_time`, `set permission='licensed'` to succeed.
- [ ] Run it: FAIL (columns missing). Write the migration exactly as in the spec (full trigger function body repeated with the two added fields). Re-run local-db to pick up the new migration file (`LC_ALL=en_US.UTF-8 npx tsx scripts/s4/local-db.ts`), run the test: PASS. Commit `feat: extend research_source_documents with availability, vintage, cluster, origin, market and permission`.

### Task 2: Types, rowToSource, ingestSource (TDD)

**Files:** Modify `src/lib/research/types.ts`, `src/lib/research/sources.ts`, `src/lib/research/sources.test.ts`.

- [ ] Add tests: `rowToSource` of a legacy row (no new keys) returns `available_at === ingested_at`, `source_version '1'`, `permission 'public'`, nulls elsewhere; `ingestSource` rejects `permission:'secret'`, `market:'EU'`, `available_at:'yesterday'`; inserts default `available_at` equal to the inserted `ingested_at` and `permission` by type; passes explicit values through; `getSource` round-trips them via the mock store.
- [ ] Run: FAIL. Implement: `types.ts` constants/types; `rowToSource` defaults; `IngestSourceInput` fields + validation; insert payload. Run sources tests + typecheck: PASS. Commit `feat: expose source availability, market and permission in types and ingest`.

### Task 3: Full verification and review

- [ ] `S4_TEST_STATE=<state> npx vitest run` (expect 1198+ pass), `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] Mutation checks: drop `permission` backfill line → integration test fails; drop `available_at` from the trigger → immutability test fails; drop permission validation in `ingestSource` → unit test fails.
- [ ] Codex CLI review (medium) of the branch diff; fix P1/P2 with tests; push and open PR.
