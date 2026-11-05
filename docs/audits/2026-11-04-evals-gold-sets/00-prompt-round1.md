You are an adversarial senior reviewer. Audit the design spec at

    docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md

(OsbornAlpha, Next.js 15 / Supabase Postgres / vitest). It designs the evaluation harness ("F6 评测与黄金集") that must produce the independent-verification evidence the mandate requires for every research module: official reconciliation against primary documents, dual-source consistency, replay consistency across code versions, regression against ChaosAI reference samples (comparison only, never imported), extraction gold sets (F3), judgment calibration (F4), expert sampling records and third-party model audit records.

Read first, in this order, and challenge the spec against them:
1. The governing mandate: docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md (§0–§5; §5 is binding: primary sources only, every number replayable, facts vs judgments, missing stays missing, ChaosAI data never imported).
2. Plan 1 spec docs/superpowers/specs/2026-11-04-data-foundation-design.md §5, §9, §11, §14 (what actually landed).
3. Plan 2 spec docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md §4.8 (FactsDb), §5, §9 (read APIs), §11 (tests, gold assertions), §12, §13.
4. Landed code: supabase/migrations/20261105090000_dq_foundation.sql (dq_reconciliations, RLS), src/lib/dq/batches.ts, src/lib/dq/quarantine.ts, src/lib/dq/dashboard.ts, src/lib/db/table-client.ts, src/app/api/admin/dq/route.ts, src/app/(app)/admin/dq/AdminDqClient.tsx, scripts/ci/research-checks.ts, scripts/ci/research-db.ts, .github/workflows/ci.yml, vercel.json, src/lib/entities/resolve.ts, src/lib/research/earnings-quality-vendor/METHOD.md, src/lib/research/evals.ts (existing LLM eval tables research_eval_cases/runs), docs/research/chaosai-integration-2026-11-04/EVIDENCE.json, docs/audits/2026-11-04-data-foundation-2/ (existing audit record layout).

Challenge, with concrete section references:
- Internal contradictions (e.g. storage decisions vs the dq_reconciliations semantics, outcome taxonomy vs thresholds, ci vs report mode behaviour, lock-file rules vs PR workflow).
- Infeasibility against landed code (TableClient capabilities, RLS/grants, criticalSuites inventory rule, CI workflow, Vercel cron limits, CDN caching of public read APIs, resolveIssuer signature, FactsDb read filters).
- Mandate violations or loopholes: any path by which ChaosAI reference values could leak into data tables or UI; any way the harness could generate or "correct" gold values; any place a missing value could be masked; privacy (expert identities, foreign research PDFs, credentials in reports).
- Whether the gold-set contract is actually sufficient for "replayable with source file, page/row, available date, unit, transform, code version"; whether tolerance semantics are consistent with the dq_reconciliations column comment; decimal handling.
- Whether replay_consistency's three-state classification and the explanations ledger are sound (can a bug hide as "explained"? can data drift be misattributed?).
- Scope creep vs genuine day-one gaps (what is missing that the first module cannot ship without; what is unnecessary).
- Test strategy: does the harness prove it can fail; are the integration tests implementable with the plan-2 pgFactsDb before plan 2 is implemented (ordering/dependency problems)?
- Phases and effort realism; owner decisions that are actually hidden in prose.

Output: a markdown report starting with a one-sentence bold verdict line (`**Verdict: …**`), then a table with columns `# | Severity (P1 blocking / P2 should fix before plan / P3 nice to have) | Spec section | Issue | Why it matters | Suggested fix`, then a short "Verify before implementing" list. Say explicitly when you are unsure about an external API or tool behaviour instead of asserting it. Do not modify any files.
