# TWSE quote cache retention — local candidate, 2026-10-06

## Behavior

The quote cache uses monotonic elapsed time for its60s lookup TTL. A cache miss sends cache:no-store without Next revalidate options: an old Data Cache response can no longer be stamped as newly fetched in the module cache. Successful entries retain their request-start timestamp, so time waiting for fetch/body counts toward retention. A monotonically increasing request generation prevents an older in-flight request from replacing a later successful cache entry, including equal clock ticks. The older caller still receives its own successful response; this does not establish upstream temporal ordering or cancel concurrent requests.

Exact duplicate ticker strings are requested once within a batch. Public result keys, parsing, invalid/null behavior, cached-hit/miss merging and4s cancellation/late-write guards remain unchanged. Daily/universe endpoints retain existing behavior. Provider-declared updated_at/delayed fields are not independently verified; this is cache retention, not market freshness certification.

## Evidence

Finite osstack task_f4ad123a initially passed source/cancellation/cache tests and typecheck/lint/diff. Strict Claude CLI claude-opus-5-5 audit task_375b7e41 reviewed source/synthetic only with no tools/MCP. Accepted both findings: response-arrival stamping could renew an older concurrent response, and tests lacked in-flight clock movement. Changed to request-start stamping with generation ordering; added out-of-order and equal-tick controls and a slow-response retention test. Accepted the minor explicit single-fetch assertion. Seven cache tests cover boundary TTL, wall-clock rollback, duplicate strings, failed miss, out-of-order responses (two cases) and in-flight elapsed time.

Post-audit task_919c603a passed eight provider/quote utility suites/typecheck/lint/diff; its nonexistent plural api/quotes filter provided no route coverage. Final task_9c414e32 corrects this to api/quote/batch/route.test.ts and verifies nine suites, typecheck/lint/diff. Final edits host verified, not second-reviewed. Every provider request used synthetic fetch mocks, with no production or network calls.

## Deployment gates and remaining debt

Removing Next Data Cache reduces cross-instance cache reuse. Before production, use an isolated Next runtime to verify fetch option semantics and measure request rate with ordinary traffic patterns; do not stress live provider/Supabase. No cross-request/instance dedup, distributed rate limiting, cache size/expired-key reclamation or shared ownership is added. Case aliases such as2330.TW/2330.tw remain distinct strings. Cached hits are checked at lookup and may wait alongside a bounded missing-ticker fetch before returning; no absolute returned-price age guarantee. Source timestamp validation, Tushare cache freshness/Retry-After, alert reconciliation/recovery and ordinary24h acceptance remain open. No push, Actions, schedules, release or private processing in this batch.
