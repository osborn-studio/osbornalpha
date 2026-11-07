# Codex review — Task 10, commit 939865f (gpt-6-astra, medium; final message only, raw log not committed)

Quarter metadata is normalized inconsistently between direct and HTTP metric projections, causing false hash differences for TTM metrics. Tests could not be executed because the Vitest executable was unavailable.

Review comment:

- [P2] Normalize HTTP quarter tuples to the direct projection format — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/projections/facts.ts:153-153
  For TTM metrics, the public metrics route returns `inputs: m.inputs` unchanged, so `quarter` is a `[start, end]` array, not the string declared here. The HTTP projection copies that array directly, while `metricsOnce` converts it to `start~end`. Consequently, identical metric data produces different projection hashes through the direct and HTTP paths. Declare the actual tuple type and apply the same normalization in both paths; add a route-equivalence test containing a TTM input.
Quarter metadata is normalized inconsistently between direct and HTTP metric projections, causing false hash differences for TTM metrics. Tests could not be executed because the Vitest executable was unavailable.

Review comment:

- [P2] Normalize HTTP quarter tuples to the direct projection format — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/projections/facts.ts:153-153
  For TTM metrics, the public metrics route returns `inputs: m.inputs` unchanged, so `quarter` is a `[start, end]` array, not the string declared here. The HTTP projection copies that array directly, while `metricsOnce` converts it to `start~end`. Consequently, identical metric data produces different projection hashes through the direct and HTTP paths. Declare the actual tuple type and apply the same normalization in both paths; add a route-equivalence test containing a TTM input.
