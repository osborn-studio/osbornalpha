# mmx audit and disposition

Executed `mmx --help` and `mmx text chat --help`, then `mmx text chat --messages-file ... --max-tokens 24000 --output json --non-interactive --no-color`. Model returned: `MiniMax-M3.1-Flash`; stop reason `end_turn`. Submitted only candidate source and test context. An earlier 10,000-token attempt exhausted its budget without final text and was not accepted as an audit. The following is the actual final text from the completed audit, with no thinking content.

## Verdict: REQUEST CHANGES

1. **Medium — Same-URL reload temporarily returns the stale result.**  
   `tick` changes, but `result` records only `url`. The render caused by `reload()` therefore returns the previous result until the passive effect runs and replaces it with `loading`. This can re-expose a stale account payload for a commit. Include the request generation/tick in `result` and require a match, or invalidate the result synchronously in `reload()`. The existing test invokes the new effect before observing state, so it misses this behavior.

2. **Low — The auth test does not independently prove that `SIGNED_OUT` clears visible successful data.**  
   It first sends `TOKEN_REFRESHED`, asserts `loading`, and then sends `SIGNED_OUT` while already loading. A regression that still fetches on `SIGNED_OUT` but omits clearing an already-visible successful result could pass. Add an isolated `OK → SIGNED_OUT → immediate loading` case.

3. **Low — The benchmark’s `p50_ms` is not the median for even sample counts.**  
   The warm phase has 12 samples, but `times[Math.floor(times.length / 2)]` selects the upper-middle value (`times[6]`). The median is the average of `times[5]` and `times[6]`. This makes the reported local performance statistic inaccurate.

## Disposition

1. Fixed: `result` records the reload tick and render requires both URL and tick identity. Added an assertion immediately after reload before running the effect; observed it fail before the fix.
2. Fixed: added isolated `ok → SIGNED_OUT → immediate loading → 401` regression.
3. Fixed: even sample count median averages both middle values. Reran benchmark and regenerated evidence.

Final candidate: 108 targeted tests pass; ESLint and TypeScript pass. Follow-up final audit recorded below.

## Follow-up final audit

Model `MiniMax-M3.1-Flash`, stop reason `end_turn`. Source and prior findings were provided after the fixes.

## Verdict: APPROVE

1. **Resolved — Same-URL reload no longer exposes stale data.**  
   `result` now includes `tick`, and the returned state requires `result.tick === tick`. The reload regression test confirms the immediate state is `loading`.

2. **Resolved — `SIGNED_OUT` independently clears visible successful data.**  
   The isolated test now verifies `OK → SIGNED_OUT → immediate loading` before the replacement response resolves.

3. **Resolved — `p50_ms` correctly computes the median.**  
   The formula averages the lower-middle and upper-middle samples for even counts and remains correct for odd counts.

All three prior findings are resolved.
