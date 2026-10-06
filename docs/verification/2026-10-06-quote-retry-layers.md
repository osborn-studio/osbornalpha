# Quote retry layers and local acceptance (D3.2 partial)

This is a candidate source change, not production activation or a24h service acceptance.
Synthetic fixtures call no provider, paid quote endpoint or production database.

## Client behavior

`requestQuoteBatch` replaces the hook's inline retry loop. The shared5s result
cache and per-URL in-flight promise remain in the hook. A chunk attempts transport
at most twice, each including response JSON decoding with a25s deadline. A50s
monotonic total budget includes the delay. A timer also rejects operations that
ignore abort; late results cannot populate the shared cache. Browser suspension
can defer timer delivery: the limit is an execution budget, not a realtime SLA.

Transient network/timeout/HTTP408,429,500–599 errors are eligible for one retry.
HTTP client errors and malformed JSON are terminal. Retry-After integer seconds
and standard HTTP-date set the minimum retry wait; waits that do not fit the
remaining budget are refused, never shortened. Missing/invalid headers retain
the existing250ms default. Valid partial/stale responses are returned once,
retaining their source metadata; missing ticker/client-cache semantics remain
in `mergeQuoteBatchResults`.

## Retry multiplication still requiring server work

These are distinct limits, not one verified end-to-end bound:

| Layer | Current source behavior | Remaining concern |
| --- | --- | --- |
| Browser chunk | max2 HTTP requests,25s/attempt,50s total including wait | Broad watchlists still start multiple chunks in parallel; no new concurrency cap here |
| Quote route gateway | one batched gateway call per HTTP request | Client retry may start another gateway call; server disconnect cancellation not established |
| Per-ticker fallback | max2 calls/source,2.5s timeout and200ms inter-attempt wait | A/HK/US three fallback sources; A may additionally reach Tushare; cooperative cancellation/provider inner retries need full audit |
| Tushare daily synthesis | two parallel helper calls per wrapper attempt | Abort propagation absent at this wrapper; no claim underlying paid work stops on browser timeout |
| Scheduled workflow | curl retry2 (max3),30s or60s per attempt | Workflow unchanged; curl multiplication is separate from browser chunk policy |

At the wrapper level, an A-share HTTP request can reach one batched gateway call
plus eight fallback wrapper invocations per ticker (three public sources and
Tushare, each twice). Two browser requests can double that wrapper work. This
is not an exact wire-request count: inner provider caches/retries and Tushare's
parallel helper calls change it. The client deadline cannot impose a server
compute/cost limit by itself. Next batch should propagate a server-wide deadline
and abort to providers, then stub429/Retry-After behavior there before adjusting
workflow retry/alert semantics.

Availability and preferred-source quality remain separate: a usable fallback
must retain its source identity and must never count as a successful Wind probe.
The read-only20-run inventory is documented in PA management; no schedule was
changed, no failed run rerun, and no fresh quote probe was requested.

## Verification and audit disposition

Finite osstack initial task_8ee03fb2 and final task_7237e11f passed. Final
verification covers five quote suites (client/request/diagnostics/source-timeout/route),
typecheck, lint and diff whitespace. No database migration or provider call was
needed for this client change.

Strict isolated Claude Opus5.5 task_cde8eac7 reviewed source and synthetic fixtures.
Accepted unread-body cleanup: abort controller in finally releases error responses
and losing operations; success is already fully decoded. Added cooperative abort,
second transient failure,24s response plus30s Retry-After refusal, and late200
recovery regressions. Final changes were host verified, not second reviewed.

Rejected the audit claim that Promise.race loses rejection handlers after settling:
handlers remain attached to both inputs. A standalone Node late-rejection control
recorded zero unhandled rejections; Vitest cooperative-abort regression likewise
passes with unhandled rejection checking. An additional noop catch would be
redundant; it was not added.

Remote PR71 remains draft1bf26cc; this local batch is held for aggregate push.
Server admission/production flags, credentials, provider selection and Actions
schedules remain unchanged. D3.2 is partial; D3.3/D3.4 are not claimed complete.

## Server budget candidate follow-up (15:24 batch)

The quote route now awaits at most20s with caller-disconnect cancellation.
An already-aborted request dispatches no provider work. Gateway and TWSE waits
are additionally bounded at5s; fallback source attempts receive the route signal
as a parent of the existing2.5s timeout. A cancelled fallback aborts its loop
before subsequent retries or sources. Before any route cache write, the request
signal is checked; late returned provider work cannot populate quoteCache.
Caller-cancelled requests return503 with quote_request_cancelled; hard-budget
expiry has a distinct TimeoutError and quote_request_timeout code.

This does not cancel all underlying work: TWSE batch and cached Tushare functions
still ignore the supplied route signal, and shared provider caches may perform
work independently. Their wrappers stop awaiting them and prevent new route
steps, but no paid-work cancellation or complete end-to-end compute/cost cap
is claimed. Signal support and provider Retry-After handling remain explicit
D3.2 follow-up work. No provider order, paid fallback configuration or workflow
frequency is changed. Existing normal partial/stale behavior remains covered.

Opus audit identified partial results lost at the hard deadline. Added a14s
per-ticker soft fallback bound after the <=5s gateway wait: normally at <=19s
the route proceeds through its existing stale/null assembly, preserving valid
gateway/fresh-cache results. The outer20s bound remains a final guard.
Cancelled/soft-expired source loops stop further dispatch; retry sleeps now
remove listeners/timers on cancellation. Tushare wrappers use a single attempt
to avoid overlapping new paid calls while an abort-ignoring previous call runs.

Accepted all3 Opus findings: fix exact signal-call test signature; soft deadline
preserves partial results; add pre-abort/disconnect/late-cache/partial-stale route
regressions. Also addressed retry-sleep cleanup and paid-wrapper overlap notes.
Remaining TWSE/Tushare inner cancellation and server provider Retry-After
semantics are still open; this batch is not all of D3.2.

## TWSE inner quote cancellation (interrupted15:54, resumed16:24)

TWSE quote APIs accept an optional AbortSignal; batch route and registry pass
it through. A4s provider wrapper covers both fetch and JSON-body await, with
cooperative abort and a race for implementations ignoring abort. Checks before
dispatch and before synchronous provider-cache writes prevent late cancelled
responses/bodies populating the shared TWSE quote cache. Successful independent
callers and60s cache hits keep existing semantics; pre-aborted cache reads are
refused. Daily/universe network helpers remain unchanged.

Six new synthetic tests cover pre-abort, cooperative fetch abort, stalled body
deadline/late-cache refusal, late fetch response, independent caller/cache-hit
isolation, invalid JSON and missing tickers. Initial task_5fcc7576 passed eight
focused suites (TWSE existing/new plus six quote/route suites), typecheck/lint/diff.
No live TWSE request, production call or Actions run was made.

The previous15:54 turn was interrupted after passing local verification and
before audit/disposition/commit;16:24 resumed those exact worktree changes.
Tushare shared cached operations and provider Retry-After remain independent
follow-up work. This does not claim abort stops all underlying provider compute.

Opus5.5 task_d768769b found three issues, all addressed: fresh module-cache hits
were lost on timeout; a one-microtask late-response test could miss guard damage;
route/registry forwarding lacked regression coverage. Cache lookup now precedes
the miss-only timeout wrapper. Provider timeout retains hits and returns null
for misses, preserving the prior null failure contract; caller cancellation
always throws. This means provider timeout misses are recorded as empty by the
existing route metadata, not as a newly invented timeout marker. A richer
provider outcome contract remains possible follow-up work.

Late-response controls now use JSON spies and drained event-loop turns: after
cancellation/expiry the body must not be read and a follow-up request must fetch
again. Added timeout mixed hit/miss, late-fetch timeout, registry pre-abort and
route TWSE disconnect/late-cache tests. No claim of individual guard mutation
coverage: guards are redundant, and no mutation harness was run in this batch.
Final task_410d8652 passed all eight selected suites/typecheck/lint/diff with0
verifier issues. Nine new provider tests and the route forwarding regression
are synthetic. Final edits host verified, not second-reviewed.

Next Data Cache30s plus module cache60s freshness, concurrent-miss deduplication,
Tushare cached cancellation and provider Retry-After remain open. No freshness
or shared-cache policy was silently changed. Remote PR71 still draft1bf26cc;
local work held for aggregate push with no new Actions or production requests.
