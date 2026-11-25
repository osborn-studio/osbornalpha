# P0 PR 5 · DQ dataset registry

The application has 49 distinct persisted dataset names. The existing 22 entries retain their identifiers, producers and cadence. The other 27 already had writers. The exact-set test pins the strings independently of the registry and the producer scan derives its pattern from that registry.

## Inventory

Paths in the last column are relative to `src/lib/` unless they start with `src/app/` or `scripts/`. They identify pre-change TypeScript literals and string-building sites, including fixtures and readers. For the original 22, “registry” means `dq/datasets.ts`, including its market and reconcile expansions. SQL-owned writes are described below the table.

| Persisted value | Producer | Cadence | Source | Previous literal or construction |
| --- | --- | --- | --- | --- |
| `topics.replay` | topic-verify | weekly | derived | `registry` |
| `company.events` | company-digest | daily | derived | `registry` |
| `entities.sec` | sec-company-tickers | event | sec | `registry` |
| `entities.research-link` | research-entity-link | event | derived | `registry` |
| `entities.identifiers` | fill-identifiers | event | openfigi, gleif, hkex | `registry` |
| `entities.cninfo` | fill-cninfo-org-id | event | cninfo | `registry` |
| `entities.ah-link` | link-ah | event | openfigi, gleif, hkex | `registry` |
| `entities.windows` | backfill-windows | event | derived | `registry` |
| `entities.sec-submissions` | sec-submissions | event | sec | `registry` |
| `facts.us` | facts-sync (freshness), dq-resolver (manual batch) | daily | sec | `registry`, `evidence/fixtures/facts.ts`, `facts/db-contract.ts`, `judgments/db-contract.ts`, `judgments/testing/facts-fixture.ts`, `topics/fixtures/published.ts` |
| `facts.cn` | facts-sync (freshness), dq-resolver (manual batch) | daily | tushare | `registry`, `evidence/fixtures/facts.ts`, `judgments/testing/facts-fixture.ts` |
| `facts.acceptance` | enrich-acceptance | daily | sec | `registry` |
| `dq.filer-categories` | filer-categories | event | sec | `registry` |
| `reconcile.us.companyfacts_vs_ixbrl` | reconcile | weekly | derived | `registry`, `facts/memory-facts-db.ts` |
| `reconcile.cn.tushare_vs_cninfo_pdf_gold` | reconcile | weekly | derived | `registry`, `facts/memory-facts-db.ts` |
| `reconcile.us.companyfacts_vs_gold` | reconcile | weekly | derived | `registry`, `facts/memory-facts-db.ts` |
| `reconcile.sec.filing_date_vs_submissions` | enrich-acceptance | event | derived | `registry` |
| `reconcile.sec.filer_category` | filer-categories | event | derived | `registry` |
| `reconcile.entities.isin_hkex_vs_gleif` | fill-identifiers | event | derived | `registry` |
| `reconcile.facts.lineage_same_day` | reconcile | weekly | derived | `registry`, `facts/memory-facts-db.ts` |
| `dq.calendar.us` | filing-calendar | daily | sec | `registry` |
| `dq.calendar.cn` | filing-calendar | daily | tushare | `registry` |
| `macro.fred` | ts-fred | daily | fred | `evidence/fixtures/macro.ts`, `evidence/sources.ts`, `macro/db-contract.ts`, `macro/freshness.ts`, `macro/ingest.ts`, `src/app/api/cron/macro-sync/route.ts`, `topics/fixtures/published.ts` |
| `macro.akshare` | py-akshare | daily | akshare | `evidence/sources.ts`, `macro/freshness.ts`, `macro/ingest.ts`, `src/app/api/macro/ingest/route.ts` |
| `judgments` | ts-judgments | event · receipt or quarantine only | derived | `judgments/db-contract.ts`, `judgments/memory-judgments-db.ts`, `judgments/register.ts`, `src/app/api/admin/dq/quarantine/[id]/route.ts` |
| `judgments.settle` | ts-judgments | daily | derived | `dq/judgments-resolver.ts`, `judgments/admin-actions.ts`, `judgments/settle.ts` |
| `judgments.produce.macro_regime` | ts-judgments | event · receipt or quarantine only | derived | `judgments/compensate.ts`, `judgments/on-macro-published.ts`, `judgments/settle.ts`, `judgments/testing/macro-fixture.ts` |
| `judgments.calibrate` | ts-judgments | event | derived | `judgments/calibrate.ts` |
| `issuers.a_stock` | load-a-share | daily | tushare, cninfo | `industry/load-a-share.ts` |
| `issuers.a_stock.targeted` | load-a-share | event · receipt or quarantine only | tushare, cninfo | `industry/load-a-share.ts` |
| `facts.hk` | documents-candidates | event · receipt or quarantine only | derived | `documents/hk-facts/facts-port-contract.ts`, `documents/hk-facts/promote.ts`, `documents/hk-facts/resolve.ts` |
| `broker_research` | broker-research-verify (freshness), broker-research-parse, broker-research-extract, broker-research-review, broker-research-summary | daily | internal | `broker-research/admin-read.ts`, `broker-research/db-contract.ts`, `broker-research/db.ts`, `broker-research/extract/run.ts`, `broker-research/memory-db.ts`, `broker-research/parse.ts`, `broker-research/pg-db.ts`, `broker-research/quarantine-hook-rules.ts`, `broker-research/review.ts`, `broker-research/rules.ts`, `broker-research/summary/run.ts`, `broker-research/verify.ts`, `src/app/api/admin/dq/quarantine/[id]/route.ts` |
| `industry.agg.sw2021` | industry-agg | weekly | derived | `evidence/resolvers/industry.ts`, `industry/e2e-fixture.ts`, `industry/read.ts`, `industry/run-aggregation.ts` |
| `industry.sw2021.memberships` | industry-sw-resolve | weekly | derived | `industry/e2e-fixture.ts`, `industry/read.ts`, `industry/resolve-memberships.ts` |
| `industry.sw2021.classifications` | industry-sw-classify | weekly | tushare | `industry/classifications.ts` |
| `industry.agg.sic` | industry-agg | weekly | derived | `evidence/fixtures/industry.ts`, `evidence/resolvers/industry.ts`, `industry/e2e-fixture.ts`, `industry/read.ts`, `industry/run-aggregation-us.ts`, `topics/fixtures/published.ts` |
| `industry.sic.memberships` | industry-sic | weekly | sec | `industry/read.ts`, `industry/sic.ts`, `scripts/industry/sic-coverage.ts` |
| `industry.sic.classifications` | industry-sic-classify | weekly | sec | `industry/sic.ts` |
| `industry.sw2021.source` | industry-sw-members | weekly | tushare | `industry/source-memberships.ts` |
| `industry.marks` | industry-marks | weekly | tushare | `industry/db-contract.ts`, `industry/marks.ts`, `industry/memory-industry-db.ts` |
| `industry.official` | apply_observations | event · receipt or quarantine only | tushare | `industry/memory-industry-db.ts` |
| `vendor.gildata.industry.members.sw2021` | industry-vendor-gildata | weekly | gildata | `industry/vendor/types.ts` |
| `vendor.gildata.industry.fin.sw2021` | industry-vendor-gildata | weekly | gildata | `industry/vendor/types.ts` |
| `documents.edgar` | documents-sync | daily | sec | `documents/sync.ts` |
| `documents.cninfo` | documents-sync | daily | cninfo | `documents/sync.ts` |
| `documents.hkexnews` | documents-sync | daily | hkexnews | `documents/sync.ts` |
| `documents.upload` | documents-upload | event · receipt or quarantine only | internal | `documents/upload.ts` |
| `documents.extract` | documents-extract | daily | derived | `documents/extract/run.ts` |
| `documents.candidates` | documents-candidates | daily | derived | `documents/candidates/run.ts`, `documents/hk-facts/promote.ts`, `scripts/documents/promote-hk.ts` |

For receipt-only and quarantine-only entries, `event` describes the trigger in registry metadata. Those paths supply no cadence to the freshness table. The targeted issuer loader still records freshness only for full-universe runs. The weekly topic and inline reconcile entries keep their original registry cadence. The broker verify cron owns the shared dataset's daily freshness.

The judgments publication hook and compensation job construct the name from the methodology ID. The production registry currently contains `macro_regime`. Document sync uses the three listed sources. Upload has its own manual producer. Reconcile cycle and market names follow the same expansions as before. Existing jobs that pass a cadence literal continue passing that literal.

## Writer boundaries and exemptions

The trace started with the dataset fields of batch inserts, freshness upserts and RPC arguments, quarantine keys, and inline or cycle reconciliation writes. The macro DB forwards its run dataset into the freshness RPC. The settlement and industry RPCs can create quarantine rows themselves. The securities layer supplies upstream security records. It has no additional DQ dataset writer. The read-only evaluation manifest can look up a module and market supplied by the manifest, and the facts resolver forwards the stored quarantine dataset when it opens a manual batch. This checkout contains no `src/lib/industry-cn/` directory.

SQL is outside the TypeScript scan. Existing migrations own literal writes of `industry.marks` and `industry.official` (the `apply_observations` RPC), `judgments` (settlement quarantine), and `documents.extract` (extraction quarantine). The facts extension also constructs market and reconcile names in SQL. These migrations remain byte-for-byte intact. The official-observation entry names the actual RPC because it has no standalone batch producer.

The scan covers non-test TypeScript and TSX in `src/` and `scripts/`, including fixture directories, memory implementations and shared DB contracts. It exempts three files.

- `src/lib/dq/datasets.ts` defines the identifiers.
- `src/lib/industry/vendor/types.ts` owns `FRESHNESS`. A test compares its values with all Gildata inventory entries. The merged ingestion uses those two names for batches, quarantine and weekly freshness. The merge introduced no other DQ dataset writers with unregistered names.
- `src/lib/judgments/types.ts` is a frozen formula input. Its settlement DB contract documents the literal quarantine dataset.

Contract cases use the registry for real names. Synthetic names such as the randomized macro, judgments and industry contract datasets exercise arbitrary names, and are outside the persisted-name list. Test files can assert literal expected values independently.

Audit calls and admin action wrappers use action names. Translation functions consume namespaces, query builders take relation or column names, and origin metadata identifies adapters. The destination distinguishes these from dataset fields. For example, settling a judgment can write the dataset and log an audit action with the same spelling. The scan allows the audit argument in context, and still checks other matches on that line. `broker_research.publish`, `documents.purge`, `industry.license_set` and `judgments.methodology_id` have no dataset writer.

## Admin visibility

`dashboardDatasets` takes the sorted union of inventory names, loaded datasets and the selected filter. The API returns this list to the client for its dataset selector. A clean database now offers 49 choices instead of 22. On a populated database, the number of additional choices depends on which names already appeared in the loaded rows.

`freshnessOf` reads persisted rows. Dashboard KPIs, quarantine pagination and alert rows use queried records and counts. The calendar and reconcile blocks use their own tables and the view helpers format the resulting rows. Neither the API filter validation nor any write path enumerates the inventory to create records. This permits one full inventory. The filer-category job, facts sync, and the seven entity-key scripts look up existing names for their cadence. Their lookups continue to resolve to the same values. The registry's sole runtime dependency is the existing reconcile-ID module, whose own imports are type-only.

## Changed files and tests

The table identifies the producer, reader and fixture changes. The two remaining TypeScript files are `dq/datasets.ts` and `dq/datasets.test.ts`. The latter is the only changed Vitest file. It adds the independent 49-value pin and source validation, expands the family coverage and derives the scanner from the inventory. Its historical cadence and producer assertions now match those fields while permitting the new metadata. Shared contract and fixture modules substitute real dataset constants for the same literal arguments and expected values.

## Verification

The initial command `npx vitest run src/lib/dq/datasets.test.ts` produced 6 passes and 2 failures on the original implementation. The failures identified the omitted dataset values and the absent source field. An intermediate run of the same command passed 8 tests. The final affected run included the restored, expanded leaf-coverage assertion and passed all 825 tests in 44 files.

The exact affected Vitest invocation, shown with shell line continuations, was:

```zsh
~/.local/bin/ssd-run npx vitest run 'src/app/api/admin/dq/quarantine/[id]/route.test.ts' \
  src/app/api/admin/dq/route.test.ts \
  src/app/api/cron/macro-sync/route.test.ts \
  src/app/api/macro/ingest/route.test.ts \
  src/app/api/macro/publish-judgment.test.ts \
  src/lib/broker-research/admin-read.test.ts \
  src/lib/broker-research/db.test.ts \
  src/lib/broker-research/extract/run.test.ts \
  src/lib/broker-research/parse.test.ts \
  src/lib/broker-research/quarantine-hook-rules.test.ts \
  src/lib/broker-research/review.test.ts \
  src/lib/broker-research/rules.test.ts \
  src/lib/broker-research/summary/run.test.ts \
  src/lib/broker-research/verify.test.ts \
  src/lib/documents/candidates/run.test.ts \
  src/lib/documents/extract/run.test.ts \
  src/lib/documents/hk-facts/promote.test.ts \
  src/lib/documents/hk-facts/resolve.test.ts \
  src/lib/documents/sync.test.ts \
  src/lib/documents/upload.test.ts \
  src/lib/dq/dashboard-blocks.test.ts \
  src/lib/dq/dashboard-view.test.ts \
  src/lib/dq/dashboard.test.ts \
  src/lib/dq/datasets.test.ts \
  src/lib/dq/freshness.test.ts \
  src/lib/dq/judgments-resolver.test.ts \
  src/lib/evidence/resolvers/industry.test.ts \
  src/lib/industry/classifications.test.ts \
  src/lib/industry/e2e-fixture.test.ts \
  src/lib/industry/load-a-share.test.ts \
  src/lib/industry/marks.test.ts \
  src/lib/industry/read.test.ts \
  src/lib/industry/resolve-memberships.test.ts \
  src/lib/industry/run-aggregation-us.test.ts \
  src/lib/industry/run-aggregation.test.ts \
  src/lib/industry/sic.test.ts \
  src/lib/industry/source-memberships.test.ts \
  src/lib/judgments/calibrate.test.ts \
  src/lib/judgments/compensate.test.ts \
  src/lib/judgments/register.test.ts \
  src/lib/judgments/settle.test.ts \
  src/lib/macro/freshness.test.ts \
  src/lib/macro/ingest.test.ts \
  src/lib/topics/verify.test.ts
```

| Remaining command, in order | Result |
| --- | --- |
| `~/.local/bin/ssd-run npm run typecheck` | Passed, zero diagnostics |
| `~/.local/bin/ssd-run npm run lint` | Passed, zero errors or warnings |
| `~/.local/bin/ssd-run npm test` | One full run. 11,030 cases passed, 41 failed, 998 skipped. 993 files passed, 7 failed, 57 skipped. Vitest reported 5 unhandled errors. |
| `git diff --check` | Passed |

The seven failing suites match the sandbox failures recorded in [PR 4 verification](04-sec-consolidation-evidence.md). Gold registration (9), gold lock updates (20) and the aligned-reconciliation CLI (3) failed on scratch-directory creation. The migration-history CLI (1), Tushare timeout (1), stock page (7) and S6 market suite setup encountered local socket restrictions or their resulting timeouts. A successful unrestricted full-suite run remains unverified.

The diff has zero paths in common with the frozen-file manifest. There are no changes under `supabase/`, `docs/methodologies/` or to any catalog or methodology constant.
