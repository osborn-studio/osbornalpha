# Company issuer provenance and judgments readiness

Base: `dc47ba2e` (includes company closeout PR #140, `fdc5a7fb`). Scope: company evidence and issuer judgments consumers only. Root shared task index, global docs, macro/industry/evals, migrations, flags and data grants were not changed.

## Fixes

- `evidenceEligible` now requires a nonblank run ID equal to the fact's `run_id`. A correct fact/hash/filing with another run's code/tool metadata is incomplete evidence, including for CN admin reads. Spec basis: company design §0.1 item 2 (fact → run → batch provenance), #62–63. The existing CN PDF admin exception remains limited to PDF conditions.
- `checkJudgmentsResponse` now requires the requested issuer ID and compares it with the response envelope before accepting cards or an empty list. `JudgmentsView` passes its issuer prop. Latest and replay reads reject another issuer's response; valid merged cards still use the original issuer plus `merged_from`. Spec basis: company design §10.4 issuer-scoped F4 consumer.

These are fail-closed consumer defenses. Production evidence RPC already joins provenance through the fact's run; this patch protects the shared gate against malformed adapter records rather than claiming observed production corruption. No production issuer methodology or CN reconciliation data was fabricated.

## Verification

Node 22 via `PATH=/opt/homebrew/opt/node@22/bin:$PATH`:

- Regression first: three wrong-issuer component tests failed before the issuer guard; two market-parametrized run-provenance tests failed before the evidence guard.
- `vitest run src/lib/company --maxWorkers=1`: **290 passed, 55 skipped**, 32 passing files and 3 skipped files. Includes contract tests, real F4 handler over memory DB, rendered component checks, and evidence dictionary withholding. PostgreSQL-backed integrations and pending human fixtures are skipped; no gold acceptance claimed.
- `npm run typecheck`: passed. Initial shared dependency tree lacked `pdfjs-dist`; declared version 4.10.38 was unpacked into a private scratch dependency overlay before the passing run. Shared dependencies and lockfile were not changed.
- ESLint on all eight changed source/test files, with `--max-warnings=0`: passed. `git diff --check`: passed.
- No native browser, full suite, full Next build, seeded application e2e, production queries, migrations, or live provider behavior were run. Tests and typecheck do not establish those gates.

## Five independent gpt-6.1-sol sessions

Five concurrent read-only Codex CLI sessions, each explicitly `-m gpt-6.1-sol -s read-only`, reviewed this worktree. Each returned a final report and exit code 0. Their bounded inspection is not a claim of exhaustive review:

| Session | Scope | Result |
| --- | --- | --- |
| 1 (`01a1b684-5dcb-71d0-baa4-1aaa8f90918c`) | Base evidence provenance | Missing fact/run binding; fixed and regression tested. |
| 2 (`01a1b684-5dc8-78d1-995b-8516320b94c5`) | CN PDF and admin exception | No additional concrete bug within five source reads. |
| 3 (`01a1b684-5dc4-72e3-a2db-e91eec0cae1c`) | Issuer judgments scope | Missing requested issuer binding; fixed and regression tested. |
| 4 (`01a1b684-5dd5-7492-944d-94b9f4730eb1`) | Issuer lineage read scoping | No new violation; known predecessor read gaps remain as documented. |
| 5 (`01a1b684-5dea-7471-bf78-e8b29f1bb1a3`) | Snapshot download / evidence binding | No additional concrete bug within five source reads. |

## Exact remaining blockers / default-off behavior

- **Public CN financial values remain withheld**: `productionReadDeps().pdf` is still `emptyPdfLocatorSource`. A real per-fact PDF reconciliation/registration source is required; F3 citations alone do not satisfy it. No licensed Tushare snapshot redistribution was granted.
- **Company judgments remains default-off**: `NEXT_PUBLIC_COMPANY_JUDGMENTS` was not enabled. `REGISTRY` has no production issuer methodology. Valid issuer methodologies, real provenance and their release evidence remain prerequisites; fixture methods are not production methods.
- **Judgment inbox integration remains blocked** on F4's stable event DTO: id, tenant scope, observation time and receipt semantics.
- **Human acceptance remains pending**: independent financial transcription, events gold, expert sampling and regression comparison. No generated labels or implementation-derived gold were added.
- **Operator readiness remains unverified**: target migrations, initial full digest materialization, freshness checks and actual accessible document/extraction/citation records require authorized operational execution. This PR makes no deployment-readiness claim.

## mmx audit

Attempt 1 reached `stop_reason=max_tokens` with thinking only and is **not** counted. Attempt 2 reviewed the narrowed production diff and verification summary with `mmx text chat`, model `MiniMax-M3.1-Flash`, and returned `stop_reason=end_turn` plus a final text block:

> Final audit verdict: PASS — no concrete blocking bugs identified.
>
> The changes correctly bind judgment envelopes to the requested issuer while preserving `merged_from` card behavior, and require evidence `runId` to be nonblank and exactly match `GateFact.run_id`. No regression is evident given the passing tests, typecheck, and lint.

No blocking finding required revision. This audit does not replace the unrun database, native-browser, production, or human acceptance gates.
