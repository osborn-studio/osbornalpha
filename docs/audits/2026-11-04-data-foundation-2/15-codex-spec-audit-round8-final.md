R7-1 — **RESOLVED**: §§4.5/7.3 close the item, persist the decision, and promote atomically; §11.2 tests that accepted facts become visible.

R6-1 remainder — **RESOLVED**: §§4.5/7.1 move membership merges under the same scope lock as resolution and publication; §11.2 adds concurrent-merge coverage.

**No new defects found within the two-change scope.** The landed [`quarantine()`](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/src/lib/dq/quarantine.ts:31) creates the item before the RPC, so `item_id` exists when membership is merged. For a newly created item, §6.1 step 7 supplies the staged facts in its initial payload; an intervening acceptance therefore encounters `run_pending` under §4.5. That ordering alone establishes neither an implementation incompatibility nor wrong public data or evidence loss. References: [spec §§4.5–7.3](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:235).

**Final verdict: ready for an implementation plan with owner decisions A/B/C pending (§14).**