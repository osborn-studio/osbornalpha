# Company research closeout — 2026-11-07

Scope: `docs/runbooks/company-research.md`, company research spec (§0 takes precedence), company components, company/tracking routes, digest/evidence adapters and F4 registry. Local source inspection only; no production queries, secrets, license changes or fabricated judgments/gold labels.

## Selected bug: replay reads the live inbox

`CompanyTrackingView` unconditionally called `isWatching(issuerId)`, which calls `/api/tracking/inbox?limit=1`. That route reads materialized events and receipts and runs the evidence gate, even when the view was replaying an `asOf` snapshot. The replay event load waited for this unrelated membership read. `CompanyHeader` independently mounted a `TrackButton` with the same inbox probe.

The client membership helper now returns false without I/O when supplied an `asOf`; the tracking view passes its replay date and starts replay event reads without waiting for live membership. The header mounts the live tracking control only outside replay. Replay rows still come from `/api/companies/:ticker/events?asOf=…`, mark-read remains disabled, and exiting replay restores the existing live controls and membership checks. The false sentinel is internal: replay does not display the live "not tracking" state.

## Wiring inventory and remaining dependencies

| Area | Existing wiring | Remaining / owner dependency |
| --- | --- | --- |
| Real source drawer | F3 adapter resolves `/api/documents/by-filing/:id`, verifies detail identity, citation/page binding and text hashes, and obtains authenticated signed downloads. Default F3 flag is on in current code/runbook. | Actual accessible document/extraction/citation records must exist; missing/restricted/ambiguous bindings remain explicit states. HK facts and transcripts need upstream ingestion/contracts. No fixture may be promoted into real source evidence. |
| Tracking / digest | Watches and receipts use session RLS; events use service-role reads scoped to watched issuers. Digest rebuilds evidence before event replacement, uses attempt/revision fences, retries stale computation once, and preserves sweep quota/backoff. | Replay membership/inbox leak fixed here. Production migrations, first full materialization and freshness verification remain operator work; not performed in this task. |
| Public evidence | Statements, metrics, event payloads and inbox share the evidence gate; failed evidence withholds values. US evidence uses replayable EDGAR snapshots. | `productionReadDeps().pdf` still uses `emptyPdfLocatorSource`: CN per-value PDF reconciliation/registration is not wired. F3 citations alone do not supply the required `PdfLocatorSource` contract. CN public values must remain withheld. Tushare snapshot redistribution remains admin-only. |
| Judgments | Company requests F4 `subject_type=issuer`, `view=latest/as_known`; validates the response and renders F4 cards behind the default-off judgments flag. | `REGISTRY` contains only `macroRegimeV2`, no production issuer methodology. An honest empty issuer view is expected. F4 stable event DTO (id, tenant scope, observation time, receipt semantics) remains unspecified; do not manufacture judgment inbox events or issuer/industry methods. |
| Human acceptance | Fixture manifest keeps pending expectations; spec §0 #72 prohibits using implementation output as truth. | Independent transcription, events gold, expert sampling and regression comparison remain owner work. No human gold matrix claimed. |

## Verification

- Regression unit test first failed on the old implementation with `TrackingApiError: not_authenticated` from an intentionally unavailable inbox; after the fix no fetch occurs in replay.
- Targeted company, component, tracking/cron route and i18n suite: **374 passed, 55 skipped, 47 passing files / 3 skipped files**. Skips include PG-backed integrations and pending human fixtures; this is not a claim that database gates or a gold matrix passed.
- `npm run typecheck`, `npm run lint`, `git diff --check`: passed (Node 22.22.1).
- A local Chromium smoke mounts the real `CompanyHeader` and `CompanyTrackingView`, with stubbed UI/context and local API responses: verifies initial replay makes no tracking request, uses the dated event endpoint, hides the header tracking control and disables mark-read; switching to live restores membership reads and switching back restores replay. No page errors. This is component runtime evidence, not a full application/database e2e.
- Added a seeded local Playwright regression in `e2e/company.spec.ts`; **not executed** here. Full seeded Supabase e2e, `test:db`, `test:migrations`, full repository `npm test`, production materialization and provider network behavior are not verified by this change.
- mmx review outcome recorded in the final report; its first 8,000-token response stopped at `max_tokens` with thinking only and is not counted as a completed review.

No SQL, production setting, license, methodology registry or gold fixture was changed.
