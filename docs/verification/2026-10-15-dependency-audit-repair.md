# Dependency audit repair (2026-10-15)

After #69 merged, CI on `main` (run 38780xxxxxx at 8246bcb6) and on #70 (dispatched run 38781142730 at 80ae2479) passed every application, database, migration, runtime and build gate and failed only the final `npm audit --omit=dev --audit-level=high` step, because three high advisories were published after the 2026-10-04 runs:

| Package | Was | Now | Advisory |
|---|---|---|---|
| next (direct) | 15.5.26 | 15.5.28 | GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p (SSG/ISR cache poisoning, self-hosted) |
| sharp (override under next) | 0.35.4 | 0.35.5 | GHSA-wq5f-xc86-pv6w (librsvg CVE-2026-96889) |
| source-map-js (transitive, new override) | 1.2.1 | 1.2.2 | GHSA-68fv-2mgg-jv7q (event-loop DoS) |

Lock comparison: 38 changed nodes, all within next/@next, sharp/@img and source-map-js. The remaining advisory is one moderate (ajv `$data` ReDoS), below the CI threshold.

This commit also carries the sharp runtime smoke (`scripts/ci/sharp-runtime-smoke.mjs`, CI step "Next-resolved patched image runtime") from 5e86401 on the closed #71, which the #72/#73 split had dropped.

Local verification (Node 22, isolated PostgreSQL 17.10, Mac arm64): lint, typecheck, build pass; vitest 194 files / 1508 passed / 64 skipped; migration rehearsal PASS (fresh schema equals seeded upgrade); `test:db` 205 files / 1572 passed, 12 critical suites / 65 critical tests / 0 critical skips, 39 migrations; sharp smoke decodes and resizes a synthetic SVG with sharp 0.35.5 / rsvg 2.63.2; `npm audit --omit=dev --audit-level=high` exits 0. The Mac native smoke does not prove the Linux artifact; CI runs the same smoke on ubuntu.
