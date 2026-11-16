Incremental adversarial review, round 2 (final spec round) of docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md (draft 2).
Round 1 findings: docs/audits/2026-11-07-macro-p3-p4/02-codex-spec-round1.md ; the spec's §0 table states how each was handled.
Upstream contracts (read-only, sibling worktrees): ../macro-workbench-bbde80/docs/superpowers/specs/2026-11-04-macro-workbench-design.md, ../macro-workbench-bbde80/docs/superpowers/plans/2026-11-06-macro-workbench.md (shared contract lines 40-420; Task 14 ~10600-10900; Task 15 ~11360-11620), ../judgment-framework-50f9e1/docs/superpowers/specs/2026-11-04-judgment-framework-design.md (§3, §9, §10, §11.1), src/app/api/perspectives/[ticker]/route.ts, src/lib/billing/quota.ts.

Tasks:
1. For each round-1 finding #1-#21: RESOLVED / PARTIAL / NOT RESOLVED with one-line reason.
2. Only NEW defects introduced by draft 2 (or still-blocking ones), same severity scale P1/P2/P3, each with a concrete fix. Focus: manifest/cutoff semantics and replay, RPC state machines (review pointer, explanation claim/finish), validator false-positive/negative risk, F4 API assumptions (does F4 expose what §5.2/§6.4 read? if not, what minimal fallback), capability matrix consistency.
Output: table 1 (finding, status, reason), table 2 (| # | Sev | Section | Defect | Fix |), then one-line verdict: "ready for an implementation plan" or "ready with P2 fixes" or "not ready".
