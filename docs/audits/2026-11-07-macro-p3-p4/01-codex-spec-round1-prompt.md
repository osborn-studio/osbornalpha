You are an adversarial reviewer of a design spec for an investment-research product (OsbornAlpha, Next.js 15 + Supabase).

Spec under review: docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md (macro workbench phases P3 transmission/history and P4 explanation layer).

It builds on contracts that are NOT on this branch; read them from the sibling worktrees (read-only):
- P1+P2 spec: ../macro-workbench-bbde80/docs/superpowers/specs/2026-11-04-macro-workbench-design.md
- P1+P2 plan (shared contract section lines 40-420, events/cycles Task 14 near line 10600-10900, correlation Task 15 near 11360): ../macro-workbench-bbde80/docs/superpowers/plans/2026-11-06-macro-workbench.md
- F4 judgment framework spec: ../judgment-framework-50f9e1/docs/superpowers/specs/2026-11-04-judgment-framework-design.md (§3.2 kinds and percent rules, §8 calibration, §9 display, §11.1 macro_regime, §12.1)
- Mandate: docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md §5 and teardown docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md §7-§11
- Existing metering: src/app/api/perspectives/[ticker]/route.ts, src/lib/billing/metered-llm.ts, src/lib/billing/quota.ts

Find defects that would cause: wrong or non-replayable public numbers; judgments (regime, probabilities, win rates) leaking as facts or percentages before calibration; incompatibility with the P1+P2 contracts or F4 contracts as actually specified; unverifiable LLM output reaching users; migration/RLS/security holes; ambiguity an implementer cannot resolve; violations of the mandate (primary sources only, missing is missing, facts vs judgments).
Check especially: event-window independence and base/end definitions; cycle boundary definitions vs daily series availability; the DFEDTAR merge; the number-binding validator (can it be bypassed? false rejections?); review idempotency and "current" row semantics; dependency/flag strategy while P1+P2 and F4 are unmerged; quota reuse.

Output: a markdown table | # | Severity P1/P2/P3 | Section | Defect | Concrete fix |, then a one-line verdict: "ready for an implementation plan" or "not ready". Be concrete; no praise.
