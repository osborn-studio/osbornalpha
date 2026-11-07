You are auditing a design spec in this repository (read-only). Repo: OsbornAlpha (Next.js 15 + Supabase).

Spec under audit: docs/superpowers/specs/2026-11-04-macro-workbench-design.md (macro workbench, scope P1 data + P2 relations/events; P3/P4 are explicitly out of scope — do not report missing P3/P4).
It was written BEFORE two data-foundation plans landed on main. This is ONE incremental round: check every assumption of the spec against (a) the landed code and (b) the mandate, and report NEW defects plus a final verdict.

Hard mandate (binding): docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md §5 —
primary sources only (statistics bureaus/customs/central banks/official exchanges/index companies); AKShare/Tushare are ADAPTERS only and must record the upstream;
every displayed number replayable (source file hash, row locator, available_at, transform, code version) — if not replayable it does not ship;
facts and judgments are separate layers — judgments need methodology_version, input snapshot, falsifiable condition, settlement and calibration, and no percentage may be shown before calibration;
missing stays missing (no placeholders, no proxies, no unit conversions, no mixing definitions); zh/en; every chart has a table equivalent; UI follows DESIGN.md and src/app/globals.css tokens.

Landed code to check against:
- Plan 1 DQ layer: src/lib/dq/{batches,quarantine,freshness,rules,dashboard}.ts, supabase/migrations/20261105090000_dq_foundation.sql (shared ingest_batches, dq_quarantine, dq_freshness, dq_reconciliations; check constraints, RLS, INFO_CODES, the freshness cadence enum). The data-foundation spec docs/superpowers/specs/2026-11-04-data-foundation-design.md §5.1/§5.3 replaces the macro spec's own batch table with shared ingest_batches (dataset 'macro.*').
- Plan 2 facts store (pattern reference for raw evidence, lossless numerics, atomic publish, public read routes): src/lib/facts/*, supabase/migrations/20261106090000_financial_facts.sql, src/lib/facts/snapshot-store.ts (raw bytes bucket with sha256 paths), src/lib/facts/json-numbers.ts, src/app/api/facts/**, src/app/api/cron/facts-sync/route.ts.
- Shared infra: src/lib/db/table-client.ts, supabase/migrations.lock.json + scripts/ci/research-checks.ts (criticalSuites), src/lib/billing/quota.ts, middleware.ts, src/i18n/request.ts (MESSAGE_DOMAINS), existing Today MacroGlance component (grep MacroGlance), /intel page, vercel.json crons, authorizedCronRequest.
- F4 judgment layer (being built in parallel, NOT on main): read the contract in the sibling worktree, read-only:
  /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/judgment-framework-50f9e1/docs/superpowers/specs/2026-11-04-judgment-framework-design.md (§3.5, §7.1, §11.1, §12.1, §19 item 8) and its plan docs/superpowers/plans/2026-11-06-judgment-framework.md (lines ~160-300: Regime, RegimeResult, MacroSnapshotRow, MacroObservationRef, MacroReadApi incl. observation(observationId), snapshotsSince, seriesCatalog, classifyAsOf; margin_pp in percentage points; growth_axis/inflation_axis typed number|null; catalog_version).

Owner decisions already made (do not re-litigate, but check they are implemented honestly): China macro via an AKShare script adapter with upstream recorded (NBS / customs / PBoC); FRED for US; visible to all logged-in users. Environment facts: FRED_API_KEY is NOT available locally, but FRED's public CSV endpoint https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES> works without a key; AKShare needs a Python runtime and must stay a local script, never a Vercel dependency. Regime/judgment cards must render against the F4 contract behind a flag that defaults off.

Things to examine specifically (verify each against code/docs, do not assume):
1. Every place the spec still uses its own tables/paths that the landed DQ layer replaces (batches, quarantine, freshness enum and windows, producer names, dataset naming, quarantine semantics "same key different value").
2. Primary-source honesty: which AKShare functions actually fetch from the official publisher vs. from aggregators (eastmoney, jin10, sina); yfinance as an asset source; FRED as a republisher (license/attribution, e.g. SP500/ISM removal). What must be recorded per observation (actual fetch host vs. original publisher) so the provenance does not lie; what to drop or mark missing.
3. Replayability: available_at for FRED CSV (no realtime/vintage info without the API key — what can honestly be claimed), raw-evidence storage (plan 2 snapshot-store pattern vs. the spec's macro-raw bucket; local harness only has storage.buckets — migrations cannot reference storage.objects), row locators, lossless numeric parsing, vintage_id semantics.
4. Facts vs judgments: the spec's regime card/score/coverage/margin on the overview and Today; what must move behind the F4 flag; mismatches between the spec's regime output and F4's RegimeResult/MacroSnapshotRow/MacroReadApi (types, ids, units, catalog_version, classifyAsOf as-of semantics using available_at ≤ cutoff).
5. Schema/RLS/migration rules: migration timestamp must be 20261114HHMMSS_*; lock file; anon read of status='ok' only; snapshot active-switch atomicity; numeric types; bigint[] vs uuid ids.
6. API/route/auth: cron auth helper, ingest endpoint for the local Python script, quotas (does quota.ts support a new feature as specified?), "visible to all logged-in users" vs middleware.
7. P2 statistics: correlation on levels of trending series (spurious), lag sign convention, event-window sample sizes, cycle segmentation determinism, seed runs, n thresholds — anything that would display misleading numbers.
8. Anything in P1/P2 that cannot be built or tested as written in this repo.

Output format (markdown):
## Findings
A table: id (M1..Mn) | severity P1/P2/P3 | spec section | defect (what is wrong, with file/line evidence from landed code or docs) | prescribed fix (concrete, implementable).
P1 = would publish wrong/unreplayable public data, violate the mandate, or be incompatible with landed code; P2 = would cause rework or a misleading UI; P3 = clarity.
## Verdict
One of: "ready for an implementation plan after the P1/P2 fixes above are applied as prescribed" / "not ready" — with one paragraph of reasoning.
Be concrete and terse. Do not rewrite the spec.
