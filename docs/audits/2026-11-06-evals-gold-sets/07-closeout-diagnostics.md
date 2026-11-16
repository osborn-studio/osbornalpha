# F6 bounded closeout — 2026-11-07

Implementation author: GPT-6.1 Sol CLI. Scope: F6-owned adapter, validators,
tests and documentation only. No subagents, production access, licence changes,
gold edits, threshold changes, merge or deployment.

## Delivered

- F3 read adapter rejects incomplete/non-one-based/duplicate page sets before
  inspecting candidates, and rejects value citation boxes beyond PDF page width.
  Invalid evidence remains a whole-document read error.
- `validate.ts --availability` reports actual F6 enablement, reasons, F4 method
  identities/versions and probability export availability. Its success means
  inventory completed (`diagnostic_only`), never an evaluation gate pass.
- Offline operator command and external follow-ups are documented in
  `docs/evals/f6-closeout-diagnostics.md`. Root TODOS contains no F6 item to close.

## Verification

Three new regression tests failed before implementation (page set, bbox width,
new diagnostic); all passed afterwards. The handler inventory assertion was
updated to include the additive flag.

Using an independent `npm ci --ignore-scripts` install of the committed lockfile
under scratch with Node 22.22.1:

- F6/admin unit suites: 746 passed. The default run skipped the 23 DB-gated cases.
- Those exact 23 cases executed separately: 3 suites passed on isolated PostgreSQL
  17.10 (F3 hook, F6 store, F6 facts/frozen replay). Cluster stopped and removed.
- Touched TypeScript files: ESLint passed with zero warnings.
- Full repository `npm run typecheck`: passed with the locked dependencies and Node 22.
- Gold/lock/redaction/availability diagnostics passed. Both disabled kinds were
  also invoked through the real run CLI and refused with `kind_not_enabled`, exit 2.

An initial shared-dependency run used Node 26 and lacked `pdfjs-dist`, so its
TypeScript diagnostics were not accepted as validation. The final dependency
install is isolated; no dependency install was run in the main checkout.

## Independent mmx review

The sanitized diff and test plan were sent via mmx CLI. Attempt 1 used a 6,000
token budget, stopped at max_tokens and returned thinking only: no final verdict
was claimed. Attempt 2 used 16,000 tokens and returned an actual final text block
(stop_reason=end_turn): no correctness defects found. It did not independently
run tests or inspect the full surrounding repository; supplied test results were
context, not mmx verification. Raw responses and extracted final text are retained
in the scratch evidence directory.

Non-blocking feedback: add the flag to the header usage example (fixed); avoid
requiring exactly one registered method in the new diagnostic test (fixed with
arrayContaining); retain the existing missing_page reason for invalid page sets
to preserve adapter error semantics. The primary CLI also checked the surrounding
registry, adapter and wrapper sources and ran the actual script entrypoints.

## Remaining evidence boundaries

No human accuracy gold was created or evaluated. Legacy plan2 is still not ready;
synthetic-us only proves machinery. D8 extraction licensing and F4 settled,
visible probability exports/thresholds remain external blockers. Both extraction
and judgment calibration kinds stay disabled. Local PG17 proves neither hosted
Supabase behaviour nor production readiness. No full application build, network
source verification, release manifest approval or deployed smoke test was claimed.
