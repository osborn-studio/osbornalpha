# Re-review: market-pair offline checker (static review only)

**The prior P1 is closed.** An XHKG target is now rejected. I found no remaining P0 or P1 issues, and six P2 issues listed below.

I reviewed only the supplied code. I didn't run the tests, and I couldn't see inside `validateMarketHandoff`, `parseStrict` or `digest`. Findings that depend on those functions are marked as conditional.

## Prior P1: unsupported target MIC with the XNYS calendar — closed

- `market-pair.ts` now runs `proposal.target_listing_mics.includes(target.security.listing_mic)`, and the list only contains `["XNYS"]`. An XHKG target with a valid XNYS date range throws `market_identity_mismatch`.
- The benchmark MIC must equal the proposal's `ARCX`. A SPY bundle relabelled as XNYS is rejected.
- ARCX priced on the XNYS calendar is flagged as `calendar_venue_compatibility_unverified` on every result, and `accepted_for_evaluation` is always `false`. This is fail-closed.

## Other areas checked (no blocking issues)

- **Source identity:**
  - A SPY target is rejected.
  - The two legs can't have the same ticker.
  - The benchmark ticker, MIC and currency are pinned to the proposal.
  - `benchmark_identity_unverified` and `pair_source_rights_unverified` are always reported.
- **Proposal version status:**
  - The checker refuses to run unless the proposal is `unreleased` and closed to real evaluation.
  - The proposal's calendar version must match `calendar.json`.
  - The proposal's status and JCS digest are included in the output.
- **Shared price evidence:** in real mode, a byte-identical `prices` evidence hash in both legs sets `legs_share_price_evidence` and downgrades the status to incomplete.
- **Error-leg reporting:** errors from validating each bundle are tagged `target` or `benchmark`. `printMarketError` only passes through those two values.
- **Pair digest:** it covers the policy, the calendar and both bundle hashes, stored under named keys. Changing a bar changes the digest. Swapping the legs is rejected.

## Remaining P2 issues

1. **A pair with no sessions can pass as `contract_valid`.** If the range contains no calendar sessions, then `aligned` and `unavailable` are both empty and the status becomes `contract_valid` with `aligned_session_count: 0`. This only matters if `validateMarketHandoff` doesn't already require at least one in-calendar bar. Fix: add `&& aligned.length>0` to the `contract_valid` condition.

2. **The shared-evidence check is narrow.** It only matches hashes on evidence labelled `kind==='prices'`.
   - (Conditional) If the handoff check doesn't require each bar's `price_ref` to point to a `prices` item, copied content filed under another kind would get through. Fix: build both hash sets from the evidence the bars actually reference through `price_ref`.
   - It also misses a benchmark that reuses the target's `source_url` with different bytes, and a benchmark whose OHLC bars are identical to the target's. Checking for either would be a cheap extra blocker.

3. **`parent_market_policy_sha256` is never checked.** The proposal pins a parent policy hash, but nothing compares it with the actual `market-policy/1.0` file, so the parent could drift without anyone noticing. Similarly, `session_calendar.calendar_mic` isn't compared with the calendar's own MIC field, if `calendar.json` has one.

4. **Some errors don't say which leg they concern.**
   - `readMarketFile` errors in `check-market-pair.ts` aren't tagged, so exit code 3 doesn't tell you which file failed. Fix: wrap each read and `Object.assign(error,{leg})`.
   - The unsupported-target-MIC error and `target.security.ticker==='SPY'` are clearly about the target but are reported without `leg`. This is optional to change.

5. **Test gaps:**
   - The pair CLI test labelled "gap" actually hits `market_identity_mismatch`, because `missing.synthetic.json` isn't SPY. Exit code 2 (incomplete) is never exercised through the pair CLI. Add a SPY fixture with a gap, or a benchmark with a popped bar written to a temp file.
   - No test checks the `leg` field in the CLI output.
   - The XHKG test can't tell whether the pair-level check fired or the handoff check did. Assert that `leg` is undefined, or target the pair check directly.
   - In the shared-evidence test, `status:'contract_incomplete'` could also come from real-mode per-leg blockers. The `legs_share_price_evidence` assertion is the only one that actually covers this path, which is acceptable, but the status assertion shouldn't be read as independent coverage.

6. **(Conditional) Lowercase tickers could get past the SPY checks.** If `validateMarketHandoff` doesn't enforce uppercase tickers, a target of `spy` would pass the `==='SPY'` check and the same-ticker check. Fix: compare case-folded tickers, or confirm that the schema enforces the format.
