# SEC consolidation evidence

The SEC transport forwards the original URL, ordered headers, method, body, signal and redirect option. Existing callers still own response parsing, retries, evidence retention and error mapping. The process-wide interval is 150 ms. The frozen-file list has no overlap with the changed paths.

## Verification

Original consolidation checks ran sequentially from the worktree root. Counts refer to individual Vitest cases.

| Command | Runs in order |
| --- | --- |
| `~/.local/bin/ssd-run npx vitest run src/lib/sources/sec-contract.test.ts` | Original production code. First run 37 passed and 13 failed. Correcting expected error prefixes and supplying the original script URL to the fixture-recorder test harness gave 50 passed. |
| `~/.local/bin/ssd-run npx vitest run src/lib/sources/sec-consolidation.test.ts` | Two runs against original production code, each with four failures. After correcting the synthetic SIC response, the failures were 11 raw dispatch sites, 120 vs 150 ms in the catalogue check, simultaneous SIC and documents requests, and the missing transport. |
| Affected Vitest command below | First run 252 passed and one failed on the mixed SEC/non-SEC document interval. Fixing per-instance pacing across host transitions gave 253 passed. Final run after the SIC reservation and test harness changes also gave 253 passed. Includes all 50 characterization cases and all four consolidation cases. |
| `~/.local/bin/ssd-run npm run typecheck` | First run found one incomplete test context. Final run passed after wiring the in-memory dependencies. |
| `~/.local/bin/ssd-run npm run lint` | Passed with zero warnings. |
| `~/.local/bin/ssd-run npm test` | One full run. 993 files passed, seven failed, and 57 skipped. 11,026 cases passed, 41 failed, and 998 skipped. Vitest reported five unhandled errors. All 16 affected files passed. |
| `git diff --check` | Passed. |

```zsh
~/.local/bin/ssd-run npx vitest run src/lib/sources/sec-{contract,consolidation}.test.ts src/lib/{entities/identifiers/sec-submissions,facts/providers/edgar-companyfacts,dq/filer-categories,dq/reconcile/pair-us-ixbrl,industry/providers/sec-sic,industry/sic,documents/deps}.test.ts src/lib/documents/sources/{shared,edgar,cninfo,hkexnews}.test.ts src/lib/research/ingest/collectors/{edgar,cninfo,hkexnews}.test.ts
```

The sandbox denied scratch-directory creation for 32 failing cases in gold registration, gold lock updates and the aligned-reconciliation CLI. Socket restrictions affected the migration-history CLI (one case), the Tushare localhost timeout test (one case), the stock page (seven cases), and the S6 market suite's setup. A passing full-suite run remains unverified.

Follow-up verification, in execution order (all npm/npx commands used `~/.local/bin/ssd-run`):

1. `npx vitest run src/lib/industry/sic.test.ts -t 'missing CIK without admitting|remaining shared interval'` ran twice before implementation. Both runs had two failures and 17 filtered cases. Reordering the first assertion exposed two admissions instead of one. The contention case observed 150 ms instead of the remaining 110 ms.
2. `npx vitest run src/lib/sources src/lib/industry src/lib/documents src/lib/research/ingest src/lib/entities src/lib/facts/providers src/lib/dq` had 2,103 passed, three failed and 314 skipped (149 files passed, one failed, 16 skipped). The failures were the aligned-reconciliation CLI scratch-directory cases.
3. `npm run typecheck` passed. `npm run lint` passed with zero warnings.
4. `npm test` ran once. 11,028 cases passed, 41 failed and 998 skipped (993 files passed, seven failed, 57 skipped). Five unhandled errors. The affected sandbox suites are named above.

The new tests use injected fetch functions. For scripts that invoke `main()` unconditionally, the test loads the real module with only that invocation replaced by an export of its HTTP helper. The script cases exercise the helpers and their errors without writing a fixture or exiting the test process.

## Pacing and compatibility

### Where each requester waits, before → after

| Requester | Before consolidation | After consolidation |
| --- | --- | --- |
| Submissions snapshot | Shared 120 ms before the main GET and each history GET | Same points, shared 150 ms. The standalone acceptance CLI also retains its 120 ms pause between issuers. |
| Companyfacts | Shared 120 ms before each attempt | Same point, shared 150 ms. Retry backoff stays separate. |
| DQ filer categories | Shared 120 ms before the filing document | Same point, shared 150 ms |
| DQ iXBRL pair | Shared 120 ms before the filing document | Same point, shared 150 ms |
| DQ iXBRL fixture recorder | Shared 120 ms before each GET | Same point, shared 150 ms |
| DQ US sample selector | Shared 120 ms before each GET | Same point, shared 150 ms |
| Documents EDGAR | Instance-local 120 ms before each dispatch, including retries and allowed redirect hops | Same points, shared 150 ms. The local queue still orders calls across hosts. |
| Research EDGAR | Per-run 120 ms before each request | Same point, shared 150 ms, before creating the timeout |
| SIC memberships | After each successful claim except the first, wait 150 ms before looking up the issuer | Same row wait and lookup order. Only a valid CIK enters shared admission immediately before fetch. |
| SIC submissions called directly | Immediate GET | Shared admission before GET, immediate on an idle pacer |
| SIC code list | Immediate GET | Shared admission before GET, immediate on an idle pacer |
| Industry fixture recorder | Immediate GET, one SEC request per invocation | Shared admission before that GET, immediate on an idle pacer |

For an uncontended sequential requester previously paced at 120 ms, raising the interval to 150 ms adds **at most 30 ms per dispatch**, and only if the previous response arrived in under 150 ms. Elapsed processing time counts too. At 135 ms since the previous start the increase is 15 ms. At 150 ms or later it is zero. SIC's full row wait already supplies 150 ms. Any further membership delay requires another SEC dispatch in that interval. Shared queue contention is separate from the 30 ms bound. Production wall-clock impact is unknown.

### SEC requests per scheduled run

| Job | Production size and SEC dispatch count |
| --- | --- |
| Documents sync, EDGAR | Scheduled limit 25 issuers. Up to 25 submissions lists (history disabled), 1,250 primary documents (50 new items per issuer) and 1,250 filing indexes, plus distinct matching XBRL assets from those indexes. Known refs skip downloads. Each logical GET can add up to four retries and three redirect hops. Exact total **unknown**. See `vercel.json`, `api/cron/documents-sync/route.ts`, `documents/sync.ts` and `documents/sources/{edgar,shared}.ts`. |
| US companyfacts sync | Scheduled limit 25 issuers, one companyfacts GET per issuer reaching fetch. A full batch without retries makes 25. Four retries per issuer give a ceiling of 125 attempts, subject to the deadline. Enrichment below adds separate requests. See `vercel.json`, `api/cron/facts-sync/route.ts`, `facts/sync.ts` and `facts/providers/edgar-companyfacts.ts`. |
| Submissions enrichment | In US facts sync, up to 25 main GETs, one per published issuer with pending in-window filings, plus one per requested history page. No pending filings means zero. Exact total **unknown**. The standalone acceptance and identity scripts use database-selected issuer sets or explicit inputs, so their totals are also **unknown**. See `facts/providers/sec-acceptance.ts`, `entities/identifiers/sec-submissions.ts`, `scripts/facts/enrich-acceptance.ts` and `scripts/entity-keys/sec-submissions.ts`. |
| SIC memberships | Scheduled limit 200. Zero to 200 submissions GETs, one per successfully claimed row with a valid CIK reaching fetch, no retry. With 200 such rows that is 200 requests and 199 original row waits. See `vercel.json`, `industry/sic.ts` and `industry/providers/sec-sic.ts`. |

Documents and US facts sync have a 240 s internal deadline and stop starting issuers below 90 s remaining. The industry cron has a 300 s route limit. Its 240 s internal deadline applies only to aggregate-sic.

## Existing tests edited

- The follow-up adds two cases in `src/lib/industry/sic.test.ts` for missing-CIK admission and contention after lookup. The existing row-wait count case is unchanged.

- `src/lib/documents/deps.test.ts` checks the EDGAR interval passed by production wiring. The expected value changed from 120 to 150.
- `src/lib/facts/providers/edgar-companyfacts.test.ts` updates the two interval assertions and their descriptions.
- `src/lib/entities/identifiers/sec-submissions.test.ts` updates two interval descriptions and resets the shared pacer before each case. The assertions already used the exported interval.

## Found, not changed

The documents sync path persists `acquisition.user_agent`. The research collector copies fetch error messages into failure receipts. The transport creates only the fixed error `sec_host_rejected` for rejected input URLs and has no logging or storage.

## Host inventory

The following 85 paths contain a literal SEC hostname under `src/` or `scripts/`, including test data and comments. The inventory command was `rg -il '(www|data)\.sec\.gov' src scripts | sort`.

Paths that dispatch through the transport using supplied or constructed URLs **without** a literal hostname include `src/lib/dq/filer-categories.ts`, `src/lib/dq/reconcile/pair-us-ixbrl.ts`, `src/lib/documents/sources/shared.ts`, `src/lib/research/ingest/collectors/shared.ts` and `scripts/dq/select-us-sample.ts`. The two generic clients retain direct fetch only in the non-SEC branch. `us-sample-live.ts` supplies SEC URLs to the sample script. The issuer loader delegates confirmation to the submissions adapter. The ticker parser reads a previously downloaded file.

The source guard scans production TypeScript and JavaScript for literal hostnames, SEC calls and pacer references, and also checks the generic collector. It walks the syntax tree for raw fetch calls, including property calls and injected-fetch fallbacks. It permits the CIK-based submissions client method and the non-SEC branch of the generic clients. This is a structural guard for the repository’s call forms. It does not perform whole-program alias analysis.

### HTTP dispatch

- `src/lib/sources/sec-transport.ts`

### Requests routed through the transport

- `scripts/dq/record-ixbrl-fixture.ts`
- `scripts/industry/record-fixture.ts`
- `src/lib/entities/identifiers/sec-submissions.ts`
- `src/lib/facts/providers/edgar-companyfacts.ts`
- `src/lib/industry/providers/sec-sic.ts`

### Requests delegated to an adapter or injected client

- `scripts/entity-keys/load-sec-issuers.ts`
- `src/lib/documents/sources/edgar.ts`
- `src/lib/research/ingest/collectors/edgar.ts`
- `src/lib/dq/reconcile/us-sample-live.ts`

### Catalogue, validation, provenance, examples and offline data

- `scripts/entity-keys/parse-sec-tickers.ts`
- `src/lib/company/db-contract.ts`
- `src/lib/company/route-test-kit.ts`
- `src/lib/company/test-builders.ts`
- `src/lib/documents/db-contract.ts`
- `src/lib/dq/reconcile/us-sample.ts`
- `src/lib/evals/kinds/official-test-support.ts`
- `src/lib/research/earnings-quality-vendor/METHOD.md`
- `src/lib/research/earnings-quality-vendor/earnings-quality.mjs`
- `src/lib/research/earnings-quality-vendor/quality-fixtures.json`
- `src/lib/research/entity-keys/first-cohort.json`
- `src/lib/sources/catalog.ts`

### Tests, snapshots and recorded fixtures

- `src/app/api/companies/[ticker]/events/__snapshots__/route.lineage.test.ts.snap`
- `src/app/api/companies/[ticker]/facts/route.lineage.test.ts`
- `src/app/api/companies/[ticker]/overview/__snapshots__/route.lineage.test.ts.snap`
- `src/app/api/companies/[ticker]/statements/route.lineage.test.ts`
- `src/app/api/facts/[ticker]/route.test.ts`
- `src/components/company/drawer-model.test.ts`
- `src/lib/company/company-research.integration.test.ts`
- `src/lib/company/db.test.ts`
- `src/lib/company/documents-bridge.integration.test.ts`
- `src/lib/company/evidence-gate.test.ts`
- `src/lib/company/evidence-index.test.ts`
- `src/lib/company/fixtures/manifest.json`
- `src/lib/company/handlers/facts-comparability.test.ts`
- `src/lib/company/handlers/target-fence.test.ts`
- `src/lib/company/replay-evidence.test.ts`
- `src/lib/documents/fixtures/edgar/index-000132165526000039.json`
- `src/lib/documents/sources/edgar.test.ts`
- `src/lib/documents/sources/shared.test.ts`
- `src/lib/documents/sync-us.integration.test.ts`
- `src/lib/documents/sync.test.ts`
- `src/lib/dq/filer-categories.test.ts`
- `src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json`
- `src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm`
- `src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm`
- `src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm.meta.json`
- `src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm`
- `src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm.meta.json`
- `src/lib/dq/raw-store.test.ts`
- `src/lib/dq/reconcile/ixbrl-pair.integration.test.ts`
- `src/lib/dq/reconcile/ixbrl-trim.test.ts`
- `src/lib/dq/reconcile/ixbrl.test.ts`
- `src/lib/dq/reconcile/pair-us-ixbrl.test.ts`
- `src/lib/dq/reconcile/us-sample-live.test.ts`
- `src/lib/dq/reconcile/us-sample.test.ts`
- `src/lib/entities/identifiers/sec-submissions.test.ts`
- `src/lib/evals/cli/deps.test.ts`
- `src/lib/evals/fixtures/gold/facts/synthetic-us.json`
- `src/lib/evals/gold/diff.test.ts`
- `src/lib/evals/gold/legacy-plan2.test.ts`
- `src/lib/evals/gold/load.test.ts`
- `src/lib/evals/gold/schema.test.ts`
- `src/lib/evals/hash-source.test.ts`
- `src/lib/evals/validate/expert.test.ts`
- `src/lib/evals/validate/manifest.test.ts`
- `src/lib/facts/fixtures/edgar/CIK0000320193.revised.json`
- `src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json`
- `src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json`
- `src/lib/facts/fixtures/gold/plan2.json`
- `src/lib/facts/providers/edgar-companyfacts.test.ts`
- `src/lib/facts/snapshot-store.test.ts`
- `src/lib/industry/fixtures/sec/sic-codes.html`
- `src/lib/industry/fixtures/sec/submissions-0000320193.json`
- `src/lib/industry/fixtures/sec/submissions-0000789019.json`
- `src/lib/industry/fixtures/sec/submissions-0001045810.json`
- `src/lib/industry/providers/sec-sic.test.ts`
- `src/lib/industry/sic.test.ts`
- `src/lib/research/cluster/normalize.test.ts`
- `src/lib/research/cluster/run.test.ts`
- `src/lib/research/fanout/rule.test.ts`
- `src/lib/research/ingest/__fixtures__/collectors/edgar-8k-pltr-20260803.htm`
- `src/lib/research/ingest/collectors/edgar.test.ts`
- `src/lib/sources/sec-consolidation.test.ts`
- `src/lib/sources/sec-contract.test.ts`

## Changed and added files

- `docs/research/data-source-layer-2026-11-24/04-sec-consolidation-evidence.md`
- `scripts/dq/record-ixbrl-fixture.ts`
- `scripts/dq/select-us-sample.ts`
- `scripts/industry/record-fixture.ts`
- `src/lib/documents/deps.test.ts`
- `src/lib/documents/deps.ts`
- `src/lib/documents/sources/edgar.ts`
- `src/lib/documents/sources/shared.ts`
- `src/lib/dq/filer-categories.ts`
- `src/lib/dq/reconcile/pair-us-ixbrl.ts`
- `src/lib/entities/identifiers/sec-submissions.test.ts`
- `src/lib/entities/identifiers/sec-submissions.ts`
- `src/lib/facts/providers/edgar-companyfacts.test.ts`
- `src/lib/facts/providers/edgar-companyfacts.ts`
- `src/lib/facts/providers/shared.ts`
- `src/lib/industry/providers/sec-sic.ts`
- `src/lib/industry/sic.test.ts`
- `src/lib/industry/sic.ts`
- `src/lib/research/ingest/collectors/edgar.ts`
- `src/lib/research/ingest/collectors/shared.ts`
- `src/lib/research/ingest/collectors/types.ts`
- `src/lib/sources/pacer.ts`
- `src/lib/sources/sec-consolidation.test.ts`
- `src/lib/sources/sec-contract.test.ts`
- `src/lib/sources/sec-transport.ts`
