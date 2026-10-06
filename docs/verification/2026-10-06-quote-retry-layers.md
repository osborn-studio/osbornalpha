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
