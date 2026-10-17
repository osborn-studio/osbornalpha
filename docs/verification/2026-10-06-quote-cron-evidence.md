# Quote cron evidence completeness (D3.3 partial)

The15-minute quote cron now requests an exact count alongside event rows and
reads up to10001 rows as an overflow sentinel. Before evaluation, persistence or
delivery, it requires an array, a safe nonnegative integer count<=10000 and
count===returned rows.length. A server row cap, overflow, missing count/data or
source error therefore cannot silently become a healthy partial window.
Unauthorized/missing-secret requests still dispatch no database work. Errors
remain fixed and contain no database details. Real empty[] with count0 retains
the existing empty-window behavior; this does not detect a broken event writer.

Initial sentinel-only candidate passed local tests but Opus5.5 task_42e6a301
identified two issues: a server row cap can defeat the sentinel; mocks did not
model it. Both accepted: added exact count and count/rows equality, missing or
invalid count controls,1000-returned/5000-total truncation, exact-cap and empty
complete evidence, select options assertion. Also added wrong/empty bearer and
malformed-row refusals. Final task_3cfbf3b0 passed18 route tests plus existing
observability tests, typecheck/lint/diff with0 verifier issues. Final fixes host
verified, not re-reviewed. All database/delivery behavior is stubbed synthetic;
no production reads or alerts were sent.

Deployment gates remain open: verify authoritative count semantics and actual
server row cap, use an isolated query plan/performance check for the15-minute
indexed range before enabling this exact-count query in production. Exact
count adds database work even though it uses one request; bounded returned rows
alone do not bound scanned rows or I/O. Production Supabase load must not be
used for stress verification. No new query frequency or repeated production
probe was introduced.

Source unavailability/overflow still returns500 without persisting a healthy
run; operational failure monitoring must account for it. Alert recovery and
reliable delivery remain open: service insertion precedes dispatch/update, and
23505 currently suppresses retry even if delivery was never completed. This
batch does not fix or claim end-to-end alert delivery. D3.4 ordinary24h accepted
production evidence is also outstanding. No merge/deploy approval inferred.
