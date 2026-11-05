R5-1 — **RESOLVED**: §§4.5/5.3 derive dispositions from persistent open conflict membership, covering abandonment and retry; §11.2 adds that regression test.  
R5-2 — **RESOLVED**: §§4.5–4.6 provide the narrowly granted `fact_state_rev` accessor; `STABLE` preserves the calling query’s snapshot. [PostgreSQL semantics](https://www.postgresql.org/docs/17/xfunc-volatility.html)  
R5-3 — **PARTIAL**: §7.3 checks only the original `payload.run_id`; §7.1 permits subsequent runs to extend `fact_ids` without updating that run reference.

**R6-1 · P1 — The single-run refusal can bypass the new open-only publication dispositions.**  
Sections **4.5, 5.3, 7.1, 7.3** of the [sixth draft](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:419):

1. Publish A=10; stage conflicting B=20 in run R1, register the conflict, then abandon R1. A remains `ok`.
2. Retry B as B′ in R2. Merge B′ into the existing item; its `payload.run_id` remains R1. This matches landed [`quarantine()`](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/src/lib/dq/quarantine.ts:31), which reuses the existing item without updating its payload.
3. Before R2 publishes, accept the conflict with `chosen_fact_ids=[B′]`. The gate passes because R1 is abandoned. Promotion skips B′ because R2 is staged; materialization completes and the hook reaches `done`.
4. Publish R2. The conflict is now resolved, so the new **open-only** disposition scan skips it. B′ remains quarantined while **unchosen A remains public**, contrary to the persisted decision.

Fix: check the owning runs of **all existing referenced facts**, and serialize that check and resolution with membership changes/publication under the scope lock; add this retry-and-resolve sequence to §11.2.

No other new defects found within the three-change scope; review was read-only.

**Final verdict: not ready for an implementation plan—R6-1 is the sole blocking item in this review; owner decisions A/B/C remain pending.**