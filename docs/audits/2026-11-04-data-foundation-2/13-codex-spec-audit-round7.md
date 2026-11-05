**R6-1 — PARTIAL:** §4.5 now checks every referenced fact’s owning run, but §7.1 membership merges still use `TableClient.update` outside the scope lock, and §7.3 flips status after the RPC; the requested serialization remains incomplete.

**R7-1 · P1 — The resolving conflict blocks its own promotion.**  
[§4.5](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:251) requires `resolve_facts_quarantine` to apply `promote_quarantined` eligibility, including **no open `same_day_conflict` for that K/date**; [§7.3](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:420) explicitly leaves the item open until the function succeeds.

With published, quarantined A=10 and B=20, accepting B persists `[B]` but skips B because the resolving item remains open. The route then closes the item, materializes without B, and marks the hook `done`. Public current-value queries continue returning an earlier disclosure, despite the accepted decision; repeat POST does not repair a completed hook. This deterministic failure is introduced by moving promotion before the status transition.

**Fix:** perform the status transition, persisted choice, eligibility checks, and promotion atomically inside the resolver, supplying the resolving admin identity; make membership changes participate in the same locking protocol. Extend §11.2 to assert that accepting a published conflict actually exposes the chosen fact and materializes it.

Read-only; no files changed.

**Final verdict: not ready for an implementation plan—blocking items are incomplete R6-1 serialization and R7-1’s self-blocked promotion; owner decisions A/B/C remain pending.**