# Independent MiniMax audit

Model: MiniMax-M2.5. CLI: `mmx text chat`, JSON output. Actual stop reason: `end_turn`. Reviewed full implementation/test diff and benchmark test plus reported validation. Raw request/response preserved in the task evidence directory. Initial test-design request stopped at max_tokens and was not treated as approval; a second design request completed with end_turn.

## Verdict: **PASS — no blockers**

The change is a correct, appropriately scoped optimization of pure manifest replay.

### Correctness

- Daily history is now obtained once per column per `buildCycleTable` invocation, but the resulting row order is unchanged. The existing `dayPick` calls and boundary modes remain exactly as before, preserving endpoint selection and stable duplicate behavior.
- Monthly history uses the same `Map` construction and insertion order as the previous implementation. Therefore monthly last-wins semantics for duplicate months are preserved.
- `cellOf` retains its original ordering of restricted, coverage, truncation, cutoff, and missing-value checks. Projection caching does not bypass any of these conditions.
- No numeric parsing or arithmetic was moved or changed, so exact decimal and basis-point calculations remain intact.
- Empty episode and column sets are safe: no history is needed, and no indexed history access occurs.

### Provenance, isolation, and security

- The production change is read-only and introduces no cache spanning invocations or manifests. Each call rebuilds its own projections.
- There are no changes to authentication, authorization, network access, persistence, tenant scoping, or request handling.
- The benchmark explicitly verifies that the canonical manifest body and `manifest_hash` remain unchanged after building the view.
- Pinned whole-view digests cover all three boundaries, including endpoint evidence and decimal values.

### Test and performance adequacy

- New regression tests cover daily duplicate selection, monthly last-wins behavior, exact decimal output, and fresh per-invocation projection behavior.
- The benchmark verifies:
  - identical pinned canonical views for `event_day`, `first_trading_day`, and `month_end`;
  - unchanged manifest serialization/hash;
  - isolation between differently sourced manifests;
  - repeated invocation equality;
  - role inspection bounded to one manifest scan per active column rather than one per cell;
  - reproducible local CPU timing without implying production latency.
- The reported reductions directly address repeated history preparation while retaining the same observable output.

### Minor, non-blocking observation

A column marked `truncated` is now projected once even though `cellOf` will immediately return `history_truncated`. This can add one avoidable scan for truncated histories compared with the old early-return path. It does not affect correctness or the measured active-column workload; guarding projection with the existing `readState` check would be an optional follow-up.

Disposition: no blockers. The optional truncated-column scan guard is left for follow-up; current change preserves truncation output and adds no network calls. Prepared projections are invocation-local and never alter frozen input/hash identity. No production speedup or deployment is claimed.
