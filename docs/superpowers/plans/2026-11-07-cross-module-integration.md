# Cross-module integration — execution plan (2026-11-07)

Spec: `docs/superpowers/specs/2026-11-07-cross-module-integration-design.md`. Tooling: code by Codex CLI gpt-6-sol (medium); audits by mmx MiniMax-M3; PG17 tests run by the commander (`LC_ALL=C`, `.claude/scratch/db-one.ts` for single files, `npm run test:db` for the gate). Logs: `docs/audits/2026-11-07-integration/`.

The table below preserves the original execution order. Current disposition: A1 #120, D #118, A2 relayed to main by #125, B #123, C #124 and F #127 are merged. F4 itself is on main via #117. Macro v2 is the current method after #129 and #132; #131 confirms its active input licences. Registration, publishability and production flags must be verified separately; a merged PR is not proof of deployment. E remains blocked on the foreign runtime; G / judgment_calibration remains unavailable without a calibrated probability method.

Release follow-up: #133 repairs the production JSONB lookup, #134 the public manifest route, #135 adds the evidence-backed four-quadrant clock and #136 the versioned cross-instance fact cache. All are merged into `e0b82b25`. v2 is registered/publishable with unchanged hash; old-snapshot version mismatch remains a legitimate abstention. Final production state and logged-in acceptance are tracked in [the release record](../../audits/2026-11-07-launch-closeout/README.md), separately from the original flag intentions below. This follow-up code and test tooling used `gpt-6.1-sol`; mmx supplied independent audit/acceptance advice, not proof that production tests passed.

Further merged closeout work (#137–#141, `dc47ba2e`): F6 page-set/bbox validation and a diagnostic availability command (#137); stale-cache build coalescing plus browser-cache bypass (#138); release records (#139); company replay isolated from live tracking reads (#140); and an offline industry reconciliation diagnostic with an I-3 decision plan (#141). These changes do not enable F6 disabled kinds, implement I-3 valuation publishing, supply issuer/industry judgment methods, or grant source licences. The replacement widget #142 subsequently shipped separately at `98e9a819`, including #144/#145/#148. Native Chrome production acceptance confirms US/CN phases, quantitative breakdowns and readable real upstream inputs in source drawers. This is not user aesthetic approval or full mobile/logout/raw-download acceptance. Historical `dc47ba2e` cache samples remain historical; #150 cold-path optimization is not deployed. See [release evidence](../../audits/2026-11-07-launch-closeout/README.md).

Flags turn on by default in code only when the pair's PG17 end-to-end test passes against the real provider.

| PR | Pair | Base | Can start | Contents | Flag after |
|---|---|---|---|---|---|
| 0 | spec + plan | main | now | this plan, spec, audit | — |
| A1 | judgments→macro (consumer side) | main | now | AUD-01/02/10/14/16: fail-closed F4 HTTP parser, as-of batch visibility in `classifyAsOf`, shared `'1'` flag parser; PG17 test for future-finalized batch | `MACRO_JUDGMENTS_ENABLED` off at initial integration; see current disposition above |
| D | docs→company | stacked on #114 + #115 | now | `/api/documents/by-filing/[filingId]` read-only exact-key resolver, company `f3-source-drawer.tsx` adapter over F3 doc/page/citation routes, PG17 e2e with real F3 + company rows | `NEXT_PUBLIC_COMPANY_F3_DRAWER` on iff e2e passes |
| A2 | judgments→macro (F4 side) | main after F4 | F4 lands | F4 `deps.ts` uses shared parser, `macro-bridge.integration.test.ts` real macro + F4 producer/settler + anon route + P3/P4 parser | stays off until `macro_regime@v2` publishable (owner Q1) |
| B | judgments→industry | after F4 | F4 lands | whitelist `industry_metrics`, delegate input builder to `src/lib/industry/judgment-input.ts`, real-route test | off (no industry method — owner Q2) |
| C | judgments→company | after F4 + #115 | both land | company renders F4 `JudgmentCard`, parser from F4 types, contract test | off (no issuer method — owner Q2) |
| F | F6→F3 | after #114 | F3 lands + D8 licence | extraction_gold adapter over real F3 candidates | registry disabled until D8 |
| E, G | docs→foreign, F6→F4 | after foreign runtime / F4 probability method | blocked | per spec §2.5/§2.6 | off |

Per task: Codex prompt in `.claude/scratch/integ/<task>-prompt.md` → commit → mmx audit `<task>-mmx.md` → Codex fix P1/P2 → re-audit once → PG17 → PR.
