# Aggregate quote/alert verification and cascade fix — 2026-10-06 local candidate

## Evidence

At28b4e4d, finite osstack task_00469808 passed isolated PostgreSQL17.10 full regression:2048 tests,13 critical suites/99 critical tests/no critical skips,41 deployment migrations. Owned local DB stopped. Typecheck, lint, production build and diff checks passed. No Supabase production equivalence or live deployment is claimed.

Strict Claude CLI claude-opus-5-5 integration audit task_ce488653 reviewed17 source/synthetic files with no tools/MCP. It covers quote/alert integration only, not the entire inactive I1 PR. Three findings:

1. **Accepted, open before consolidated push:** route cache uses receipt-time wall clock and no generation guard, potentially renewing old TWSE module cache hits and allowing older responses to overwrite newer entries. Next batch must carry provider retention provenance into route cache, monotonic request-start timestamps and generation ordering; synthetic overlap/old-hit/clock tests. Pure provider fix alone does not close this.
2. **Accepted capacity gap, open before consolidated push:** exact-count/row equality safely refuses truncated evidence, but a PostgREST row cap below10000 causes busy windows to fail. Keep refusal until bounded complete pagination or isolated DB aggregation is verified. No partial healthy evaluation, no increasing paid resources or production probes. A consistent snapshot/count strategy and API cap acceptance are required; naive pagination over a changing table is insufficient.
3. **Accepted, locally fixed:** retrying each hanging free provider twice could consume14s before paid fallback. Timeout now moves directly to the next source; fast errors/empty responses retain the one retry. Three hanging free sources consume7.5s before the existing configured paid helper, with no paid retry, no added provider configuration or real paid calls. Cancellation during free providers still prevents paid dispatch.

Final focused task_a0023720 passes seven quote utility/route suites, typecheck/lint/diff0 issues, including the two new synthetic cascade controls. Final edit host verified, not second-reviewed. The2048-test build evidence is before this fix; latest full regression/build must run after remaining integration fixes, before consolidated push. No push/Actions/production/provider/alerts/private processing. Next/runtime and PostgREST roles remain separate integration gates.
