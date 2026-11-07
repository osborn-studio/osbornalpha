# Macro loading performance — 2026-11-07

The production authenticated baseline included a 13,106 ms cycle-table request. The previous process-local strategy memo did not share work across cold Vercel instances. The overview rebuilt observation/provenance facts on every request and reset its loading state during same-query refreshes.

## Change

- Persist only small shared macro fact views in Next Data Cache (five-minute maximum age), keyed by snapshots, publication/input revisions, catalog and deployment identity. Authentication and feature gates remain before lookup. Fresh collection health and user judgments remain outside the cached fact values; no authenticated response is public-CDN cached.
- Reject or bypass unverifiable revision state. Absolute expiry checks prevent Next stale-while-revalidate from returning over-age entries. Errors are not stored.
- Combine first history page with exact count, stop over-cap downloads early, batch frozen snapshot and fallback reads, parallelize independent review inputs. Preserve original manifest hashes and current/baseline cutoffs.
- Component-local overview in-flight reuse and same-query refresh retention; account changes clear state. Region changes never display the prior region as current. New mounts still authenticate.

## Measurements and limits

[Read-only profiles](read-only-profile.json) compare three baseline and optimized local processes against production data using the existing anon-only builder profiler. These exclude authenticated HTTP handling and manifest persistence; publish-state reads in that profiler are unavailable by design. They **do not exercise the new shared Next cache**.

Cold medians: US transmission 1,892 → 1,579 ms; policy response 2,816 → 2,138 ms; CN transmission 1,005 → 1,082 ms. Cycle-table baseline 3,420 ms (n=3, range 2,783–5,858) versus optimized 4,230.5 ms (n=2, range 4,210–4,251); its third sample failed with a network fetch error. Query counts fell from 35 to 27 for policy response and 64 to 51 for cycle-table, while transferred data remained approximately 9.5 MB and 21 MB. **These samples do not establish a cycle latency improvement or meet the original latency target.**

Fixture checks demonstrate fallback reads 8 → 2 for snapshot facts and 12 → 2 for reviews, exact manifest hash parity, and cache reuse across isolated process memo instances through the installed Next adapter. They establish behavior, not production response-time guarantees. First build after a new input/deployment version still performs cold work; cross-instance cache persistence depends on Vercel's Next Data Cache backend.

Additional trusted read-only overview samples (same code, no cache / process-cold / process-warm; no HTTP session cost): US 3,065 / 1,767 / 543 ms, CN 2,530 / 1,556 / 552 ms; database HTTP reads 8 / 8 / 5. One sequence per region, not p95. This measures the immutable-fact reuse path; cross-instance Next persistence still needs deployment acceptance.

## Validation

Strategy tests: 100 targeted pass; final combined macro run 1,183 pass and 77 environment-gated database tests skipped locally. Scoped lint/type checks pass; full local typecheck is blocked by the existing dependency symlink missing pdfjs-dist declarations. CI must run the full repository and PostgreSQL checks before merge. Overview fixture/React StrictMode browser checks pass for query isolation, no same-query refresh flash, logout/401 clearing and zero page errors; 48 final overview/cache/hook/route tests pass.

[MiniMax design review](mmx-cache-review.md) approves the stated auth/version/expiry design. Production acceptance must measure authenticated overview and strategy cold/warm routes after deployment, verify valid publication-state reads and fresh judgment data, and compare hashes. No production deployment or complete performance-target claim is made by this report.
