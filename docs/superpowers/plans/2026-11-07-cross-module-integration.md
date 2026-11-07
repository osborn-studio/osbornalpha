# Cross-module integration — execution plan (2026-11-07)

Spec: `docs/superpowers/specs/2026-11-07-cross-module-integration-design.md`. Tooling: code by Codex CLI gpt-6-sol (medium); audits by mmx MiniMax-M3; PG17 tests run by the commander (`LC_ALL=C`, `.claude/scratch/db-one.ts` for single files, `npm run test:db` for the gate). Logs: `docs/audits/2026-11-07-integration/`.

The table below preserves the original execution order. Current disposition: A1 #120, D #118, A2 relayed to main by #125, B #123, C #124 and F #127 are merged. F4 itself is on main via #117. Macro v2 is the current method after #129 and #132; #131 confirms its active input licences. Registration, publishability and production flags must be verified separately; a merged PR is not proof of deployment. E remains blocked on the foreign runtime; G / judgment_calibration remains unavailable without a calibrated probability method.

Release follow-up: #133 repairs the production JSONB lookup, #134 the public manifest route, #135 adds the evidence-backed four-quadrant clock and #136 the versioned cross-instance fact cache. All are merged into `e0b82b25`. v2 is registered/publishable with unchanged hash; old-snapshot version mismatch remains a legitimate abstention. Final production state and logged-in acceptance are tracked in [the release record](../../audits/2026-11-07-launch-closeout/README.md), separately from the original flag intentions below. This follow-up code and test tooling used `gpt-6.1-sol`; mmx supplied independent audit/acceptance advice, not proof that production tests passed.

Further merged closeout work (#137–#141, `dc47ba2e`): F6 page-set/bbox validation and a diagnostic availability command (#137); stale-cache build coalescing plus browser-cache bypass (#138); release records (#139); company replay isolated from live tracking reads (#140); and an offline industry reconciliation diagnostic with an I-3 decision plan (#141). These changes do not enable F6 disabled kinds, implement I-3 valuation publishing, supply issuer/industry judgment methods, or grant source licences. The replacement widget #142 subsequently shipped separately at `98e9a819`, including #144/#145/#148. Native Chrome production acceptance confirms US/CN phases, quantitative breakdowns and readable real upstream inputs in source drawers. This is not user aesthetic approval or full mobile/logout/raw-download acceptance. Historical `dc47ba2e` cache samples remain historical; #150 is merged at the current code baseline, with deployment and post-change latency tracked separately below. See [release evidence](../../audits/2026-11-07-launch-closeout/README.md).

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


## Remaining release tasks

Reconciled against code at `ab11d6e3b41a603169fda19df2db2d69fdad70c9` (2026-11-07). PRs [#142](https://github.com/osborn-studio/osbornalpha/pull/142)–[#153](https://github.com/osborn-studio/osbornalpha/pull/153) are all merged and their merge commits are ancestors of this baseline. “Merged” means code is on main; “deployed” requires an exact production SHA; “verified” applies only to the named check and revision. Owner/licensor decisions and missing source evidence are dependency blockers; absent pipeline/DTO/runner/SQL work is remaining implementation, and browser/operations checks are unverified. These states may coexist. The original execution table above remains historical.

| Merged PR | Delivered boundary | What remains outside that evidence |
|---|---|---|
| #142 | Snapshot-bound clock widget and wrapped mobile keyboard navigation | User aesthetic acceptance; complete current-production browser matrix |
| #143 | Release records, deterministic calibration cohort and PostgreSQL teardown regressions | A historical PR-body “CI pending” is not the current main result |
| #144 | Independent widget fixture regressions | Real production auth, full upstream lineage and destination-page acceptance |
| #145 | Requested issuer binding and fact/run provenance gate | Real CN PDF reconciliation, issuer methodology and company readiness |
| #146 | Strategy auth-event isolation, URL/late-response guards; local handler/cache harness | Live logout/account switch, distributed cache and production latency |
| #147 | Disabled I-3 calendar/official/membership/marks preparation; strict provider-byte date ingress | Actual valuation computation, ingestion orchestration, publication or activation |
| #148 | Gold-admission preflight and calibration evidence structure validation | Source authentication, human truth, licences or activation of disabled eval kinds |
| #149 | Independent company HTTP provenance/default-off rendering tests | Live provider/DB/browser acceptance or new production behavior |
| #150 | Metadata-only manifest confirmation after persistence; detached canonical body | Measured production speedup: simulated response bytes fell 6,338,261 → 217, while request bytes and two request count remain |
| #151 | Deterministic settlement admission-boundary tests | Any change to settlement production thresholds or semantics |
| #152 | Synthetic real-component destinations, handler contracts, transport/lineage fixtures and dedicated CI | Browser-to-real-handler E2E, live auth/storage/SQL/provider provenance |
| #153 | Strict provider-date regression suite and dedicated CI | Live industry provider/data acceptance or enabling I-3 |

### Deployment and verification

Release-main deployed exact `ab11d6e3` after full Application checks and Macro source fixture checks succeeded. Deployment `dpl_66sLJmdeMoowiUjBVy1Pag49uXgK` is READY; public method and US/CN card responses match that SHA, with active/publishable v2 and unchanged formula hash. Three anonymous strategy endpoints each returned 401/no-store twice. #146/#150 are deployed, but no new authenticated or performance acceptance is claimed. The sanitized receipt is committed with the [release record](../../audits/2026-11-07-launch-closeout/README.md). The prior `98e9a819` authenticated US/CN evidence remains valid for that revision only. No new authenticated acceptance is inferred from a release deployment or from fixture CI. This documentation session has no new parent browser evidence. The old cycle first observation of 16,114 ms and later hits of 1,167/663 ms are historical observations, not a baseline or result for the new deployment.

| Task / owner | Current state and exact closure evidence still required |
|---|---|
| Macro browser / parent | Current-production US/CN source/destination flows, mobile keyboard/layout, console, Chinese/light theme, logout/account switch and raw-download bytes/hash; user judges aesthetics. Existing #142/#144/#152 fixture tests cover only their declared layers. |
| Macro performance / release + browser owners | Re-measure current exact SHA with signed-in full-body requests and first-observed/repeat timings after #146/#150. No p95/SLA, controlled cold-start or cross-instance claim without corresponding samples and method. Cold history scans remain a separate implementation question. |
| Industry I-3 / H, A, C, evidence and integration owners | `official`/`valuation` jobs still return `deferred_i3`. Decide H/PE/comparator and PB basis, membership/financial calendar policy, separate scheme/marks/official rights and backfill capacity; obtain independent gold. Then resolve SQL comparator-basis and exact 1% rounding mismatch, implement approved formula/manifest/RPC stage-publish-activate/replay and operational acceptance. See [preparation contracts](../../../src/lib/industry/VALUATION-PREPARATION.md). Adapter preparation does not close these decisions or implementation tasks. |
| Company / F2, F3, F4 + operations owners | Production reads still use `emptyPdfLocatorSource`: public CN values remain withheld. Supply per-value PDF reconciliation and authorised source evidence. No issuer methodology in F4 `REGISTRY`; company judgments default off. Stable inbox event DTO, human financial/event gold and expert comparison remain pending. Verify target migrations, initial digest, freshness and accessible documents/citations; predecessor-lineage reads remain a documented gap. See [readiness record](../../audits/2026-11-07-company-readiness-next/readiness.md). |
| F6 / facts, F3-D8, F4 + release owners | `extraction_gold` and `judgment_calibration` remain disabled. Independently transcribe/review and migrate 50 pending legacy cases with real provenance; synthetic fixtures cannot substitute. D8 licence/retention and real extraction labels are pending. Calibration requires registered probability methodology, auditable visible settled-forecast export, eligible real samples, approved metric thresholds and reviewed runner/release integration. CN needs real Tushare gold/replay; privileged report, live replay, release manifest/expert evidence remain operational gates. Other disabled kinds retain their registry prerequisites. See [admission contract](../../evals/f6-gold-admission.md). |
| Foreign research / runtime + owner D1–D7 | Runtime and decisions remain blockers for integration E; no delivery is inferred from F3/F4 merge or macro deployment. |

This reconciliation changes documentation only. Test counts in linked PR/audit reports are historical execution evidence, not tests rerun by this documentation editor. It grants no licences, changes no flags and supplies no human gold or production methodology.
