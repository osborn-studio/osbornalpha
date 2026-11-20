# Foreign research: dispositions of the 18 open review rows (R15)

Date: 2026-11-20. Source: the 18 rows marked "Open" in `C-verify-disposition.md` (same directory). Finding texts are in
`C3-mmx.md` … `C8-mmx.md`; all are rated P1 by the reviewer. Each row was re-checked against `main` at `20b7fa9e`: the
module has had no functional change since it merged (#252, #260 and test-harness commits only), so every row still
reproduced as recorded. None was fixed by a later pull request.

The module stays closed: no flag, licence, adapter or cron is touched by this work.

Dispositions used: **fix** (code change with a test that failed first), **not a defect** (reason against the spec or
plan, with the test that shows the guarded state), **owner** (needs an owner decision).

Pull requests: **A** = access, licence gating and atomic writes (one migration); **B** = parse, extraction, summary
and the rules hook (durable model I/O, deadlines, context budget); **C** = evaluation and replay. A, B and C are
independent of each other.

| # | ID(s) | Finding (short) | Reproduces on main | Disposition | PR | Evidence |
|---|---|---|---|---|---|---|
| 1 | C3-AUD-02 | Licence can change between the commit-time check and document insert / promotion | Yes (`upload.ts:66-67` is the only check; validation downloads and hashes the PDF after it) | fix: the licence is re-read and re-checked as the last step before the document row is inserted and again before the object is moved. The remaining window (milliseconds between that read and the move) cannot be closed across Storage and yields exactly the state of a commit that finished just before the licence change; that state is gated separately at processing, publication and in every public view | A | pending |
| 2 | C4-001 | A F3 adapter that ignores the deadline holds the lease past the route budget | Yes (`parse.ts:44-46`; latent, the production port is unavailable) | fix: `runParse` refuses an expired deadline before dispatch and races the port call against the deadline → `f3_timeout`, lease released, port write left pending for reconciliation | B | pending |
| 3 | C5-R3, C5-R4, C5-R13 | Raw model requests / responses of an extraction are written only after all calls; a crash loses them; a half-written pair is not retried; non-`LlmError` details are dropped | Yes (`extract/run.ts:45-75`) | fix: every call's request is stored before dispatch and its response or error right after, as registered private writes; the consolidated envelopes are retried once per missing object; the error message of an unexpected provider exception is kept in the private record | B | pending |
| 4 | C5-R5 | A rules failure after `extractCommit` leaves draft candidates of a run marked failed | Yes (`extract/run.ts:118-130`) | not a defect: candidates are drafts (`extracted` / `unverified`), never effective; with no receipt for the new `rules_input_hash` the report carries `rules_stale` (blocker 12) and cannot be published; the next extraction supersedes them and any review action re-runs the rules | B (test only) | pending |
| 5 | C5-R8 | Candidate commit and scope update are two fenced calls | Yes (`extract/run.ts:118-121`) | not a defect: two fenced calls are the plan's design (P-R2-04, `broker_extract_set_scope`); a takeover between them leaves `scope` null, which is blocker 5 (`report_incomplete:scope`) and is set by the next extraction or by the bind action | B (test only) | pending |
| 6 | C5-R10, C5-R11 | Retry feedback is outside the context budget; a single oversize page is dispatched anyway | Yes (`extract/run.ts:29-36,53,60`) | fix: feedback is capped and reserved in the chunk budget; a page that cannot fit the model context with prompt, schema, feedback and output reservation fails the run with `page_exceeds_context` before any model call | B | pending |
| 7 | C6-009 | `bindReport` is three separate writes (draft columns, analyst binding, materialize); the plan requires one RPC | Yes (`review.ts:98-100`) | fix: new RPC `broker_report_bind` (lock draft, update, bind, materialize, one transaction) | A (migration) | pending |
| 8 | C6-012 | Unpublish commits before its access-log row is written | Yes (`review.ts:120-122`) | fix: new RPC `broker_report_unpublish_logged` writes the `unpublish` access-log row in the same transaction; the best-effort `research_audit_log` line stays best effort as everywhere else in the module (`audit.ts`) | A (migration) | pending |
| 9 | C6-018 – C6-021 | Rules re-run after a quarantine verdict: report derived from an unchecked key prefix; failure not durable; receipt hash not compared; review batch opened after the change commits | Yes (`quarantine-hook-rules.ts`, `review.ts:37-42`) | fix (018–020): the natural key is validated, the batch is opened before lookup so a failure is recorded, "not applicable" is told apart from "failed", and the receipt's input hash is compared with the report's current `rules_input_hash`. C6-021 not a defect: a change without a receipt is `rules_stale` (blocker 12) and publish itself re-materializes and re-runs the rules | B | pending |
| 10 | C7-02 | Summary / title-translation request and response are stored only after the model call returns | Yes (`summary/run.ts:33`) | fix: request stored before the call, response or error right after | B | pending |
| 11 | C7-04, C7-05 | Title commit is followed by materialize and rules outside the lease; a summary is committed under the digest read before the call | Yes (`summary/run.ts:47,53`) | not a defect: after a title commit without its follow-up the report is `materialize_stale` / `rules_stale` or fails blocker 15 for the new title surface, so nothing stale can be published; a summary's `input_hash` correctly names the inputs it was generated from, and both `approveSummary` and the approval trigger refuse it with `summary_stale` when the digest has moved | B (test only) | pending |
| 12 | C7-06 | Summary approval demotes the previous approved summary and approves the new one in two writes | Yes (`summary/run.ts:51`) | fix: new RPC `broker_summary_approve` does both in one transaction | A (migration) | pending |
| 13 | C8-05, C8-09, C8-10, C8-21, C8-35, C8-36 | Gold-eval model I/O is written after the calls, without provenance; a partial eval leaves objects without a receipt; no run rows | Yes (`eval.ts:86-99`) | fix (05, 09, 21, 36): per-call durable records under the registered `eval/{sha}/` prefix; envelopes carry document, parse run, licence version, prompt, schema, model, registry and behavior digest. Not a defect (10, 35): `broker_report_runs` has no eval kind (spec §4.3) and a document's run history must not list evaluation runs; the receipt (§4.10) is the durable record of a complete evaluation, and every object of a partial one is a registered write that purge removes | B | pending |
| 14 | C8-11, C8-38 | `evalStats` ignores missing, duplicate or unexpected extracted documents | Yes (`eval.ts:35-36`) | fix: the document sets must match one to one, else `eval_document_set_mismatch` | C | pending |
| 15 | C8-15 – C8-17 | Metric inputs are not validated (span bounds, page, occurrence) | Yes (`eval.ts:20,29-30`) | fix: gold rows are validated against the pinned artifact before any model call; `occurrence` must be a positive integer on both sides (no silent default). C8-16 not a defect: extracted rows are built from the pinned artifact in the same call | C | pending |
| 16 | C8-24, C8-25 | Replay does not compare page or extractor identity | Yes (`replay.ts:68-70`) | fix: the reproduced candidate must match page and source text, and the snapshot's extractor must equal the run's model and registry | C | pending |
| 17 | C8-28 – C8-30 | `checked` counts skipped rows; the snapshot hash is not verified | Yes (`replay.ts:53,72`) | fix: `checked` counts rows that passed every applicable check and incomplete evidence is a mismatch (C); the stored snapshot hash is verified in the database by a new function `broker_publication_snapshot_ok` (A). C8-30's `unpublished_at` point is not a defect: replaying a retired publication is the purpose of snapshot replay | A (migration) + C | pending |
| 18 | C8-31 – C8-34 | Test coverage: unit cases, skipped PG suite, fabricated receipt, licence-flag assertions | Partly: C8-32 does not reproduce as a gap (CI runs `test:db` with `S4_TEST_STATE` and `scripts/ci/research-checks.ts:80` fails on any skipped critical test) | fix: the cases listed in C8-31 arrive with rows 14–17; the PG pipeline suite runs `runGoldEval` on a real manifest (C8-33); each public licence flag is flipped and read as `anon` and as `authenticated` (C8-34) | A (C8-34), C (C8-31, C8-33) | pending |

## Migration

One migration in PR A, `supabase/migrations/20261212090000_broker_research_r15.sql`. It only creates four new
functions and sets their grants; it runs no statement against an existing table, view, trigger or function body.
It is applied to production after merge by the coordinating session and locked in a separate one-file pull request.

## Owner questions

None so far.

## Not verified

Filled in at the end.
