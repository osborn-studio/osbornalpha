# MiniMax acceptance-plan advice — 2026-11-07

Source: `mmx text chat --model MiniMax-M3.1-Flash`, retry with 8,000 output tokens; `stop_reason=end_turn`. First attempt exhausted its budget in thinking and is not an audit result. This is independent test-design advice, not a code review or evidence that these tests ran.

Reviewer disposition: item 3 below says auth is evaluated "after cache lookup"; the implemented and required order is **before cache access**. Collection and public macro judgments are dataset views, not per-account private data; authorization isolation still must be tested. Revision-change/expiry and two-account advice may be covered by deterministic tests rather than mutating production state. Any unexecuted production check must be explicitly marked unverified, not copied as a pass.

## Original final answer

*Acceptance-plan criteria and required evidence only; not a code audit. Release gate = all 5 pass.*

**1. Truthfulness of the logged-in macro clock (US/CN real snapshots)**
- Pass: US shows coverage as explicitly partial (~60%) with source + as-of timestamp; US growth axis is labeled unavailable/missing (never 0%, blank, or interpolated); CN tie is shown as a tie (both tied values/entities visible, not silently broken or re-ordered).
- Evidence: screenshots + snapshot payload/trace for both locales; no placeholder or synthetic numbers.

**2. Shared pure-fact cache: 300s expiry and correct key**
- Pass: TTL = 300s; key includes all four revisions (snapshot, catalog, deploy, input); changing any one causes a miss; at/after expiry a refetch occurs and expired data is not served; only pure facts are cached.
- Evidence: hit/miss + timestamp logs across a revision bump and TTL boundary.

**3. Auth flags checked outside the cache; judgments/collection stay fresh**
- Pass: auth/permission flags evaluated on every request after cache lookup, never stored in or served from the shared entry; judgments and collection results are computed/fetched fresh (own TTL) and never returned from the 300s pure-fact cache.
- Evidence: request traces showing flag evaluation on a cache hit, plus an upstream change reflected immediately.

**4. Account isolation**
- Pass: two accounts with identical revisions receive identical pure facts but correct account-scoped differences; no response for account B contains account A's data, flags, judgments, or collection; downgraded/flagged accounts still see correctly redacted content.
- Evidence: paired A/B response diffs + negative authorization test.

**5. Honest performance claims**
- Pass: every published number (p50/p95 latency, hit rate, freshness, coverage) comes from a named, dated workload with hit-vs-miss split; claims state the ~60% coverage and known gaps (US growth axis); no "real-time/complete/live" wording beyond measured freshness (300s); unverified claims removed or marked as targets.
- Evidence: benchmark run + claim-to-metric mapping table.

**Gate:** Any unlabeled partial coverage, fabricated/zero-filled missing axis, silently broken CN tie, stale served judgment, cross-account leak, or unsupported performance claim blocks release.
