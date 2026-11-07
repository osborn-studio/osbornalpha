# Codex plan audit, round 3 (incremental) — F3 disclosure document pipeline

Read-only. Plan: `docs/superpowers/plans/2026-11-06-document-pipeline.md`. Spec: `docs/superpowers/specs/2026-11-04-document-pipeline-design.md`. Prior rounds: `01-codex-plan-round1.md`, `03-codex-plan-round2.md` and dispositions `02-…`, `04-disposition-round2.md` in `docs/audits/2026-11-06-document-pipeline/`. Round-2 fix diff: `git diff 535cc2f 4b484c2 -- docs/superpowers/plans/`.

1. Verify R2-P1-1, R2-P2-1 and R1-P2-7 are CLOSED (or say why not).
2. Find NEW P1/P2 defects introduced by the round-2 diff, notably: `FactCitations.unit_currency` and the relaxation of the publish-time evidence rule from exactly-one to at-least-one `unit` citation (does that let a fact publish with ambiguous/contradictory unit evidence?); `withLeaseHeartbeat`/`guardCalls` (can an aborted phase still write via an un-wrapped client, or leave partial state; timer leaks in tests); `too_many_pages`, 240 s budget; `unit_split_pages`; cross-task signature drift.
Same defect categories and coordination rules as previous rounds. Skip nits; do not re-raise closed items.

Output: (a) `| ID | CLOSED? | note |`; (b) `| ID | Sev | Task/location | Defect | Concrete fix |` (IDs R3-P1-1…); (c) `VERDICT: ready` or `VERDICT: not ready (N P1, M P2)`.
