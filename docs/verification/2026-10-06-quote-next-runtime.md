# Quote caches in an isolated production Next runtime

The harness builds and starts a temporary Next15.5.26 fixture importing the actual batch route and TWSE provider source. It uses the installed dependency tree and an explicit source alias, without changing production code or cache TTLs. The child receives only PATH, NODE_ENV and telemetry-disable settings; no developer .env or credentials are copied. Generated instrumentation returns only synthetic TWSE responses and has no network delegate.

## Evidence and audit

Initial task_c9da486c failed source alias resolution and widened NODE_ENV typing. Corrected alias fixture and const environment. Task_4a6e9c9c passed the initial runtime/typecheck/lint/diff, but its immediate forced hit did not independently prove retention non-renewal. The final fixture forces another hit at about35s, then checks fresh data at about61s; a route timestamp renewed at35s would return the old price and fail.

Strict source/synthetic Claude CLI claude-opus-5-5 task_83033d34 found3 issues, all addressed: overlap barrier, process-tree ownership, and actual Next patch/source attribution. The provider response waits for6 server route entries before release, so the cold same-set requests overlap while uncached. Next build/start run in captured detached POSIX groups; cleanup confirms kill(-pgid,0) gives ESRCH before directory removal. A separate test starts a real parent+worker to validate group cleanup. Unconfirmed groups retain their directory, and collected cleanup errors are printed.

Instrumentation records fetch.__nextPatched=false at registration, and the route wrapper requires it true on every request. Source/cache/stale flags, prices and exact provider ex_ch sets are asserted. Thus the fixture exercises Next's fetch wrapper rather than merely replacing an already-patched fetch and claiming Data Cache interaction. Generated test endpoints are temporary, never published in the application.

Final verification and disposition: `/Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-quote-next-20261006-2224/`. Final task_311edfcb passed0 verifier issues: built production fixture/real61s checks, real worker-group and ownership tests, typecheck/lint/diff; owned Next group absent and temporary fixture removed. Final fixes are host-verified, not a second Opus review.

## Scope

One process: repeated warm route/module hits do not refetch, forced35s module hit does not renew the original provider age, six overlapping exact-set requests issue one upstream fixture fetch, and actual elapsed61s expiration gets a new response. All returned quotes are synthetic; no market-timestamp freshness or actual provider rate acceptance is claimed.

This does not cover deployed authentication/middleware, Vercel instance topology, overlapping different miss-sets, cross-process deduplication, distributed rate limiting, provider backoff/Retry-After, or ordinary24h operation. The worker-group test covers normal/internal-timeout cleanup; external SIGKILL of the harness itself cannot execute finally and is not claimed safe. Parent interruption needs separate acceptance before unattended long-running use. A port-probe/rebind race fails closed at startup/request assertions and is not eliminated.

Earlier full2069 DB/typecheck/lint/build proof remains at0a0da6b; this batch adds test harness code only. Product release still needs current-head grouped CI and target role/schema/backup/migration/canary gates. No production service is enabled or changed.

Consolidated pre-push task_f33f266c at f4784ae passed full2071 tests,14 critical suites/113 critical tests/0 critical skips,42 migrations applied on owned PostgreSQL17.10 (stopped), typecheck/lint/production build/diff with0 verifier issues. This closes the earlier latest-head aggregate regression gate locally. Current-head Linux CI remains required; no production equivalence.
