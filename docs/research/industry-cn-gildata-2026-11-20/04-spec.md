# 04 — Specification draft: Chinese industry research on Gildata data (first release)

Status: draft for owner review, 2026-11-20. Not yet a `docs/superpowers/specs/` document; it
becomes one (as an amendment A2 to `2026-11-04-industry-research-design.md`) after the owner
answers the questions in §13 and the probe in PR-0 has run. Names of existing tables, functions
and files are from the tree at `20b7fa9e`. Names marked *(new)* are proposals.

## 1. Goal and scope

Serve the 31 Shenwan level-1 industries at `/intel/industries` (`scheme=sw2021`) with:

1. classification and constituents;
2. a financial heatmap and list (revenue YoY, parent net profit YoY, gross margin, ROE; annual
   and single-quarter);
3. an industry detail page with series, coverage and constituents;
4. valuation (PE TTM, PB, PS) with percentiles;
5. prosperity dimensions;
6. a stage grouping view, once a lifecycle method is registered;
7. a source drawer and replay for every figure.

Data for 1–5 comes from Gildata under the owner's 2026-11-20 exception to "primary sources
only". Everything else in the mandate applies.

**Not in the first release:** sub-industry matrix, hype-cycle strips, stock-selection table,
sub-industry report pages, industry chain, Shenwan levels 2 and 3 aggregates, Hong Kong
industries, our own company-level aggregation of A-share statements (path C in `03-mapping.md`;
it is the planned second release), Copilot tools.

## 2. Where the mandate constrains the design

| Rule (playbook §5) | Consequence here |
|---|---|
| 1. Primary sources only — **owner exception for Gildata, Chinese industry data** | The exception is recorded as a row in the licence table with the owner as `decided_by`, and as a sentence in the amended spec. It covers Gildata only. Competitor data is still never imported; their 31 × 10 grid may be used as a regression sample to explain differences, never as an input. |
| 2. Every number replayable | Raw vendor responses are stored byte-exact before parsing; a figure without a stored response cannot be staged (DB constraint, §4.2). Replay never calls the vendor. |
| 2. …and opens its source | New evidence kind for vendor observations (§6). The drawer says what the vendor did not tell us ("as-of not provided", "aggregation method not published") instead of leaving a blank. |
| 3. Facts apart from judgments | Vendor-reported figures and our derived statistics carry `MarkTag` `fact`. Stage, composite prosperity and valuation verdict are registered methods (§7) and render only inside `JudgmentArea` / `JudgmentCard`. A vendor's own index is a vendor judgment, stored and labelled separately. |
| 3. No percent without settlement | Composite prosperity shows no number until calibrated (owner decision D). |
| 4. Missing stays missing | No placeholder axis, no proxy metric, no forward-fill. Parse failures go to `dq_quarantine`; the cell is `missing` with a reason. Negative PE is `missing` (`invalid_denominator`). |
| 4. Point-in-time constituents, explicit aggregation | Vendor-reported aggregates do **not** satisfy this (method unpublished, members unknown). They are therefore labelled "vendor-reported", `history_class` is `reconstruction` at best, and path C (our 整体法 over listed members) is the target state. Owner question Q5. |
| 5. Licence before release | All vendor datasets default to `internal`. Public display requires an explicit licence row flip per dataset by an admin with a note citing the contract clause (§8). |
| 6. `DESIGN.md` tokens, zh/en, table equivalents | Existing component tests (`design-tokens.test.ts`, `messages-parity.test.ts`, `SeriesChart` table check) extend to every new component. |
| Claude Design first | No UI PR starts before the canvas for its screen exists (`05-design-brief.md`). |

Engineering constraints from the existing tree:

- `src/lib/industry/types.ts` and `src/lib/facts/types.ts` are inside the `macro_regime@v2`
  formula-hash closure and must not change. New types go in `src/lib/industry/types-cn-vendor.ts`
  *(new)*. Vendor data does **not** enter the facts store in this release (that would add a
  facts `Source` value).
- Metric lists are CHECK constraints: any new metric is a migration plus a method version.
- Protected tables are written only through SECURITY DEFINER functions; `service_role` has no
  DML. New tables follow the same pattern.
- Each migration is added to `migrations.lock.json` in the same PR.

## 3. Routes

No new top-level route.

| Route | Change |
|---|---|
| `/intel/industries?scheme=sw2021` | Served (today: no data). List + heatmap. New search params: `basis=annual\|quarter`, `metric` gains nothing new in PR-3, `view=grid\|stages` *(new)*. Stage anchors `#stage-growth-mid` etc. exist only in `view=stages`. |
| `/intel/industries/sw2021/[code]` | Served. Sections: latest values, series, valuation, prosperity dimensions, judgments, constituents link. |
| `/intel/industries/sw2021/[code]/constituents` | Served from Gildata-sourced memberships. |
| Default scheme | Stays `sic` until Q8 is answered. |
| `GET /api/industries`, `/[scheme]/[code]`, `/constituents`, `/replay` | Accept `scheme=sw2021` (already valid); responses gain `origin` per cell: `computed` \| `vendor_reported` *(new)*, and `vendor` block in the header (publisher, product, fetch window). `replay?mode=recompute` returns 501 for `vendor_reported` cells (same convention as SIC); `mode=original` returns the stored-response excerpt and parse result. |
| `/api/admin/industries/licenses` | Accepts the new dataset keys (§8). |
| `/api/admin/industries/vendor` *(new)* | Admin-only: list fetch events, quarantine, parser failures; no raw key material. |
| `/api/cron/industry-sync?job=` | New job names (§5), script-only until Q9. |

## 4. Data model additions

### 4.1 Raw vendor responses *(new, shared, not industry-specific)*

Pattern copied from `macro_evidence_objects` + `macro_retrievals` and the `disclosure-raw`
bucket; neither can be reused as-is (closed adapter CHECK; `Source` type pinned).

- Private bucket `vendor-raw` *(new)*: object key `gildata/<sha256>.bin`, `upsert:false`,
  with content type recorded in the table.
- `vendor_evidence_objects` *(new)*: `sha256` pk, `vendor` ('gildata'), `object_path`,
  `content_type`, `byte_length`, `created_at`.
- `vendor_retrievals` *(new)*: `retrieval_id` pk, `vendor`, `product` (for example
  'datamap-mcp'), `interface` (tool name), `request_canonical` jsonb (arguments only; **no
  key, no URL with a key**), `query_template_id`, `query_template_version`, `sha256` fk,
  `http_status`, `fetched_at`, `vendor_as_of` (nullable), `batch_id` fk `ingest_batches`,
  `attempt`, `outcome` ('ok' \| 'error' \| 'rate_limited' \| 'parse_failed').
- RLS: no public read. Service role inserts through `record_vendor_retrieval()` *(new)*.
- A DB test asserts that no column of either table matches the key pattern, and the client
  refuses to record a request whose canonical form contains the key (§5.1).

### 4.2 Classification and membership (existing tables)

- `industry_classifications`: rows for `scheme='sw2021'`, `version='2021'`, levels 1–3 if
  returned. `attributes` gains `{source:'gildata', vendor_code, retrieval_id}`. If the vendor's
  Shenwan version is not 2021, stop and ask (Q-probe 11).
- `industry_source_memberships`: `source='gildata'` (the column is free text today; confirm no
  CHECK), `raw_hash` = response sha256, `locator` = JSON pointer or table row index inside the
  response, `in_date` / `out_date` if returned, otherwise null with
  `provenance.availability='effective_date_assumed'` and `in_date` = first observation date.
- Resolution through the existing `apply_industry_memberships`. One source is authoritative per
  run (`source` recorded on the run, §4.3); the other, if present, is only reconciled
  (`dq_reconciliations`, dataset `industry.membership.sw2021.gildata_vs_tushare` *(new)*).

### 4.3 Vendor-reported aggregates and valuation *(new tables, existing run pattern)*

Kept out of `industry_metrics` because that table's activation checks (expected grid against
issuer `state_rev`, manifests of members and facts) do not apply to ready-made vendor figures.

- `industry_vendor_runs` *(new)*: `run_id`, `scheme`, `version`, `level`, `dataset_key`
  (§8), `generation` (monotonic per key; one `active`), `vendor`, `product`, `fetched_from`,
  `fetched_to`, `parser_version`, `mapping_version`, `code_version`, `expected_grid`, `status`
  (`building → active | failed`, `active → superseded`), `coverage_summary`, `activated_at`,
  `batch_id`.
- `industry_vendor_observations` *(new)*: `run_id`, `code`, `metric`, `period_start`,
  `period_end`, `duration` (`3M|12M|TTM|INSTANT`), `status` (`ok|missing`), `missing_reason`
  (existing vocabulary plus `vendor_not_provided`, `parse_failed`, `invalid_denominator`),
  `value_text` (exact decimal string as received), `value` numeric, `unit`, `vendor_as_of`,
  `retrieval_id` fk **not null when status='ok'**, `locator`, `n_members` (nullable),
  `updated_at`.
- Metric CHECK for this table: `revenue_sum`, `net_income_parent_sum`, `revenue_yoy`,
  `net_income_yoy`, `gross_margin`, `roe`, `ocf_sum`, `pe_ttm`, `pb_lf`, `ps_ttm`,
  `vendor_prosperity_index`. Final list after the probe.
- Functions *(new)*: `create_industry_vendor_run`, `stage_industry_vendor_observations`,
  `activate_industry_vendor_run` (grid completeness against `expected_grid`; generation greater
  than active; every `ok` row has a retrieval whose object exists; one activation timestamp),
  `fail_industry_vendor_run`. Rows frozen after activation (same trigger pattern as
  `industry_rows_frozen`).
- RLS: `"… licensed read"` policy calling `industry_dataset_is_public(dataset_key)` on the run.
- Availability time of a vendor cell = activation time (same rule as today), never the period
  end and never the vendor as-of.

### 4.4 Derived statistics *(new)*

- `industry_derived_stats` *(new)*: `run_id` fk to the vendor run (or metric run in release
  2), `code`, `stat` (`cagr_3y`, `pctile_own_history`), `metric`, `window`, `period_end`,
  `status`, `missing_reason`, `value_text`, `value`, `formula_version`, `inputs` jsonb (list of
  observation keys), `n_samples`.
- Computed in the same job as activation of its inputs and activated with the run, so a page
  never mixes generations.
- Rules: CAGR needs both end points `ok`; percentile needs `n_samples ≥ 36` month-end samples
  for valuation (existing §6.5 rule) and ≥ 8 annual or ≥ 12 quarterly samples for financial
  dimensions (to be fixed in the amended spec); otherwise `missing` with reason
  `insufficient_history`.

### 4.5 Path C (release 2, outline only)

Company statements from Gildata stored as vendor observations per issuer, then the existing
`industry-agg/1.0` run produces `industry_metrics` rows with manifests. It needs: an
issuer-level vendor table, a reader that presents vendor rows to `aggregate.ts` without
touching `facts/types.ts`, `ocf_sum` added to `AGG_METRICS` (method `industry-agg/1.1`), history
start moved from 2021-12-31 to 2015-12-31, and the call budget from Q6. When both exist for a
cell, the page shows the computed figure and offers the vendor-reported one as a comparison in
the drawer, with the difference.

## 5. Ingestion and refresh

### 5.1 Client — `src/lib/vendor/gildata/` *(new)*

- Server-only module. Reads `GILDATA_API_KEY` from the environment; scripts load it with
  `node --env-file`. Absent key → every job returns `{skipped:'gildata_unavailable'}`.
- **Key hygiene**: the key is injected at the transport boundary only. If the product requires
  the key in the URL (reported by third parties, unverified), the URL is built inside one
  function, never logged, never returned, never stored; errors are rewrapped with the key
  replaced by `***` before leaving the module; a unit test feeds a fake key through every error
  path and asserts it appears in no log line, thrown message or recorded row. The key is never
  included in prompts sent to coding agents.
- **Query templates**: every call uses a named, versioned template
  (`gildata-templates.ts` *(new)*, for example `sw_l1_constituents/1`), with typed arguments.
  No free-form prompts and no model in the loop. If the probe shows the interface accepts
  structured parameters, templates carry those instead of text.
- **Record before parse**: `record_vendor_retrieval()` stores the response bytes and row, then
  the parser runs on the stored bytes. A fixture mode replays recorded responses (same pattern
  as `SnapshotCapture`).
- **Parsers**: one per interface, versioned (`parser_version`), strict schema (zod). Unknown
  columns, changed units, fewer rows than requested or a non-tabular answer → `parse_failed`,
  row in `dq_quarantine`, cell `missing`. A parser never infers a number from prose.
- **Limits**: single-flight, configurable minimum interval, bounded retries on 5xx and rate
  limits with back-off, a per-run call budget (`GILDATA_MAX_CALLS_PER_RUN`, default set after
  Q6); exceeding the budget fails the run rather than activating a partial grid.

### 5.2 Jobs (added to `INDUSTRY_JOBS`)

| Job | Does | Cadence (after Q9) | Freshness key |
|---|---|---|---|
| `gildata-catalog` | Lists the server's tools and schemas; stores them; diff against last | weekly | `vendor.gildata.catalog` |
| `gildata-classification` | Shenwan tree → `industry_classifications` | monthly | `industry.class.sw2021` |
| `gildata-memberships` | Constituents per level-1 → source memberships → resolve | weekly | `industry.members.sw2021` |
| `gildata-industry-financials` | 31 × periods × metrics → vendor run → activate | weekly, and daily in report seasons (April, August, October) | `industry.vendor.fin.sw2021` |
| `gildata-industry-valuation` | PE, PB, PS → vendor run; month-end history backfill once | weekly | `industry.vendor.val.sw2021` |
| `gildata-reconcile` | Gildata vs Tushare membership; vendor vs computed when both exist | after each run | `dq_reconciliations` |

All gated by `INDUSTRY_CN_VENDOR_ENABLED=1` *(new)* for `--apply`; dry-run prints the plan and
the expected call count without calling the vendor. Script-only first
(`scripts/industry/sync.ts --job gildata-… [--apply]`); cron entries in `vercel.json` only
after one clean manual cycle and Q9.

### 5.3 Stale and failure behaviour

A failed run leaves the previous active generation in place. `dq_freshness` turns the page
header to `stale` after the expected cadence; the figures stay visible with the stale chip
(state `stale` shows a value). If the vendor service ends, the pages keep the last generation,
stale, until an admin withdraws the run.

## 6. Source drawer and replay

- New evidence kind `vendor_observation` *(new)* in `EVIDENCE_KINDS`, payload `evidence-ref/1`:
  `source.publisher='恒生聚源 Gildata'`, `source.adapter='gildata-datamap'`,
  `source.locator` = interface name + template id + row locator, `source.evidence_sha256`,
  `source.url` omitted (no public URL exists; never a keyed URL),
  `times.period`, `times.available_at` (activation), `times.ingested_at` (fetch),
  `times.vendor_as_of` *(new optional field)*, `transform.mapping_version`,
  `transform.method_version` (`vendor-reported/1` for V figures; the formula version for
  derived statistics), `licence.status`, `attribution_key`.
- New evidence kind `industry_membership` closes audit item R4 for both schemes (coordinate
  with the session that owns R4; whichever lands first defines it).
- Drawer sections reuse `identity, source, times, transform, licence, links`. For a derived
  statistic the `links` section lists each input observation, each opening its own drawer.
- When the dataset is `internal` and the viewer is not an admin, the drawer input is the
  existing `withheld` variant: no value, licence note only.
- `scripts/industry/replay-check.ts` gains a vendor mode: re-parse the stored bytes of a sample
  of cells and compare with the stored value (target 50 of 50).

## 7. Judgments

Three methods, each its own later spec and PR set under the existing framework; none ships in
the first three PRs.

| Method id (proposed) | Type / kind | Inputs | Blockers |
|---|---|---|---|
| `industry_lifecycle_stage@v1` | `industry_lifecycle_stage` / categorical | three 3-year revenue CAGRs, ROE (`industry_derived_stats`, `industry_vendor_observations`) | method spec (audit O6); tables added to `PUBLIC_TABLES`; origin `table_rows × gildata`; `licenses.json` entry confirmed; `industry_aggregate` resolver; back-test |
| `valuation_verdict@v1` | `valuation_verdict` / categorical | PB and PS percentiles | same; valuation history depth |
| `industry_prosperity@v1` | `industry_prosperity` / score | five dimension percentiles | same; shows no number until calibrated |

`INDUSTRY_JUDGMENTS_ENABLED` stays the page gate. `judgment-input.ts` gains natural keys for
the two new tables. The stage grouping view reads the latest open judgment per industry through
`GET /api/judgments`; with no publishable method it renders the ungrouped list described in
`03-mapping.md` §3.

## 8. Licence datasets, public versus admin-only

New keys added to `DATASET_KEYS` (closed set, so a code change plus seed rows), all default
`internal`:

| Key *(new)* | Covers | Public when |
|---|---|---|
| `scheme:sw2021:2021` (existing) | Shenwan names, codes, tree, membership | owner confirms rights to show Shenwan classification |
| `vendor:gildata:industry-financials` | vendor-reported aggregates | contract allows display of vendor figures |
| `vendor:gildata:industry-valuation` | vendor-reported PE/PB/PS | same |
| `vendor:gildata:derived` | CAGRs, percentiles computed from the above | contract allows display of derived figures (may be allowed when raw is not — Q3) |
| `vendor:gildata:vendor-judgment` | the vendor's prosperity index or any stage field | contract allows it **and** owner wants it shown |

Until then: non-admin users see the existing `unlicensed` page state (mapped to research state
`withheld`) on `scheme=sw2021`; admins see the full pages with the `adminPreview` notice.
Judgment cards whose inputs include an `internal` dataset are not publishable. The public
footer shows publisher and relay chips ("恒生聚源 Gildata") only once a dataset is public, with
the attribution wording from the contract (Q4).

Admin-only regardless of licence: `/api/admin/industries/vendor`, raw responses, quarantine.

## 9. Flags and environment

| Name | Default | Effect |
|---|---|---|
| `GILDATA_API_KEY` | absent | jobs skip with `gildata_unavailable` |
| `INDUSTRY_CN_VENDOR_ENABLED` *(new)* | off | `--apply` on `gildata-*` jobs |
| `GILDATA_MAX_CALLS_PER_RUN` *(new)* | set after Q6 | per-run budget |
| `INDUSTRY_JUDGMENTS_ENABLED` | off | judgment area |
| `FACTS_CN_ENABLED`, `FACTS_CN_INDUSTRY_UNIVERSE` | off | unchanged; needed only for path C |
| licence rows | `internal` | visibility (not an env flag, by design) |

Production gets the key only as a Vercel environment variable set by the owner through the CLI;
it is never committed and never in `.env*` files in the repository.

## 10. zh / en

- `messages/{zh,en}/industries.json`: new keys under existing groups — `metrics` (`ocf`,
  `psTtm`, `pbLf`), `states` (`vendorReported`, `vendorAsOfMissing`, `noStageMethod`),
  `missing` (`vendorNotProvided`, `parseFailed`, `insufficientHistory`), `drawer.kind`
  (`vendor`, `derived`), `sources` (Gildata attribution), and new groups `stages`, `prosperity`.
- Industry names: `name_zh` from the vendor (subject to the Shenwan rights answer); `name_en`
  from a reviewed static table in the repository (`sw2021-names-en.ts` *(new)*, 31 rows), not
  machine-translated at runtime.
- No raw codes in copy (existing `no-raw-codes.test.ts` extended to the new reasons).
- Wording rules: "vendor-reported / 供应商口径" for V figures; no "建议买入/卖出"; stage labels
  are judgment labels and never appear in the heatmap or list columns as if they were facts.

## 11. Tests

Per PR, runnable in CI (no vendor calls in CI; recorded fixtures only):

- Client: key redaction on every path; budget; back-off; record-before-parse ordering.
- Parsers: golden fixtures recorded with the real key by the owner or an owner-approved run,
  stored with the key and any account identifiers removed; a changed-shape fixture must produce
  `parse_failed`.
- DB (integration, `LC_ALL=C`, existing harness): an `ok` observation without a retrieval is
  rejected; activation refuses an incomplete grid and an older generation; rows frozen after
  activation; RLS hides `internal` datasets from `anon` and `authenticated`, shows them to
  admins.
- Read API: `origin` present; `withheld` for non-admins; `replay` modes.
- Derived statistics: CAGR and percentile property tests (monotonic, bounds, `missing`
  propagation, `n_samples` thresholds).
- UI: design-token, message-parity, no-raw-codes, table-equivalent and client-bundle tests
  extended; e2e in fixture mode (`INDUSTRY_E2E_FIXTURES=1`) for list, detail, drawer, withheld,
  stale, phone width.
- `migrations.lock.json` updated; `test:migrations` rehearsal.
- Acceptance before any dataset goes public: vendor replay-check 50/50; membership
  reconciliation report; an owner-signed licence note in the licence row.

## 12. Phased plan (one PR at a time)

| PR | Content | Depends on | Migration | Visible |
|---|---|---|---|---|
| **PR-0** | Probe: `scripts/industry/gildata-probe.ts` (read-only, budgeted, redacted), recorded fixtures, and `docs/audits/<date>-industry-cn-gildata/01-verification.md` answering questions 9–20 of `02`; amendment A2 to the industry spec with final names | key; Q1 | no | nothing |
| **PR-1** | Vendor raw store (`vendor_evidence_objects`, `vendor_retrievals`, bucket) and `src/lib/vendor/gildata` client with templates, redaction, budget, fixture mode | PR-0 | yes | nothing |
| **PR-2** | Classification and membership from Gildata into the existing tables; new licence keys; `industry_membership` evidence kind; reconciliation vs Tushare; constituents page works for `sw2021` (admin preview) | PR-1; canvas for constituents state | yes (licence seeds; small) | admins only |
| PR-3 | `industry_vendor_runs` / `_observations`, financials job, read API `origin`, list + heatmap for `sw2021` | PR-2; canvas | yes | admins only |
| PR-4 | Detail page sections, `vendor_observation` drawer, vendor replay-check | PR-3; canvas | no | admins only |
| PR-5 | Valuation job, `industry_derived_stats`, percentile bars | PR-3; canvas | yes | admins only |
| PR-6 | Prosperity dimensions (derived), detail and list views | PR-5; canvas | yes if `ocf_sum` not yet in | admins only |
| PR-7 | Lifecycle method spec + method document (docs only) | O6 answer | no | nothing |
| PR-8 | `industry_aggregate` resolver, `industry_lifecycle_stage@v1` registered (draft, not publishable), back-test report | PR-5, PR-7 | likely | admins only |
| PR-9 | Stage grouping view | PR-8; canvas | no | admins only |
| PR-10 | Cron entries, runbook, public release checklist; licence flips are an owner action, not a PR | licence answers | no | public if allowed |
| Release 2 | Path C: company inputs and our own aggregation | Q5, Q6 | yes | — |

PR-0 to PR-2 touch `scripts/industry`, `src/lib/vendor/**` (new), `src/lib/industry/licenses.ts`,
`classifications.ts`, `source-memberships.ts`, `src/lib/evidence/**`. The US SIC session works
in `method-us.ts`, `read.ts` and `src/components/industries/**`; PR-3 onwards must be
serialised with it (`read.ts`, components, `messages/*/industries.json`).

## 13. Owner decisions (each one line)

Licence and scope first.

1. **Q1** Which Gildata product and edition is the account, and is it personal or institutional?
2. **Q2** Does your Gildata agreement allow showing Gildata figures to OsbornAlpha users other than you (signed-in, or public)?
3. **Q3** If raw vendor figures may not be shown, may figures we derive from them (CAGRs, percentiles, stage labels) be shown?
4. **Q4** What attribution wording does the contract require, and does it cover Shenwan industry names and codes?
5. **Q5** Is "vendor-reported" industry aggregates acceptable for the first release, with our own 整体法 computation as release 2, or must release 1 already be our own computation?
6. **Q6** What is the monthly call or cost ceiling we must stay under?
7. **Q7** May raw responses be stored on our Supabase storage, and must they be deleted if the account ends?
8. **Q8** Should Chinese-locale visitors land on `sw2021` by default once it is public, with `sic` staying the default for English?
9. **Q9** May the refresh run as a Vercel cron with the key in production environment variables, or script-only from your machine?
10. **Q10** Do you want the lifecycle and prosperity method spec written now (audit O6), with the rule limited to stated numeric thresholds and no macro override?
11. **Q11** If Gildata has its own prosperity index or stage field, do you want it shown (labelled as the vendor's judgment) or left out?
12. **Q12** Should the composite prosperity appear as an ordered label until calibrated (decision D), or be withheld entirely until then?
13. **Q13** Is the sub-industry layer (their 9 groups / 106 reports) out of scope for good, or a later module built on Shenwan levels 2–3 and topic research?
14. **Q14** Should the existing Tushare Shenwan path be kept as a reconciliation source, or retired once Gildata membership is in?
15. **Q15** Who records the parser fixtures with the real key: you, or a session you authorise for a bounded number of read-only calls?
