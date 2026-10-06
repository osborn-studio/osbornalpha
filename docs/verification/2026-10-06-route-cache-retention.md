# Route cache retention provenance — local candidate, 2026-10-06

## Aggregate finding1 closure

Route quote retention now uses monotonic request-start time for fresh60s and stale15m lookup. Each route request has a generation; an older in-flight result cannot replace a later successfully retained result. Wind and ordinary fallback retain at route start. TWSE quote objects carry original source request-start provenance in a WeakMap, including module hits and older responses refused by the provider cache generation. The route retains at min(route start, provider start), so an old module hit cannot get a renewed age via forced route refresh. Provenance is process-local and never serialized. `_` still bypasses only route fresh-cache lookup; no full provider flush is promised.

## Audit and verification

Initial task_3853a461 passed. Strict Claude CLI claude-opus-5-5 task_154e677b found no scoped correctness defects and three test gaps, all handled:

1. Original route mock accepted any object: changed to identity-sensitive provenance and argument assertion. Added real route+TWSE+sharing/timeout composition with synthetic fetch only, proving module-hit age across force and expiry and no JSON provenance leak.
2. Route fixtures could reuse process-local entries with changed clocks: route test imports now reset/reload modules per case; new real integration cases also reset modules. Provider cache cases retain distinct ticker fixtures; audit found no current false pass there. No test-only product reset API added.
3. Request budget helper was absent from supplied audit context: source inspection confirms synchronous dispatch. Test asserts gateway dispatch before advancing clock. Real provider starts later test proves min selects route start, at exact route TTL expiry while provider module still hits.

Final task_f0736ffa passes eleven provider/quote utility/route suites, typecheck/lint/diff0 issues. Eight provider cache tests and two new real-module composition tests; fetch mocked, no provider/DB/alerts. Final test refinements host verified, not second-reviewed. Evidence /Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-route-cache-20261006-2054/disposition.md.

## Limits and next gates

This establishes process-local retention, not market timestamp freshness, upstream temporal ordering, distributed/overlapping dedup or real Next fetch/cache execution. Metrics still use wall clock and may reflect clock adjustments; retention does not. Stale cache is explicitly delayed; actual source timestamps retained. Quote cache capacity/reclamation, case aliases and request-rate/runtime acceptance remain. Aggregate finding2 (cron server row cap and complete aggregation) still blocks consolidated push, followed by latest full regression/build. Real PostgREST receipt acknowledgement/roles, recovery/outbox and production/login/human-input gates remain open. A gateway null-valued key excluding fallback is separately triaged, not fixed here. No push/Actions/production changes/private processing.
