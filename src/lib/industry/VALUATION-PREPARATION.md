# I-3 preparation remains disabled

These internal modules prepare implementation against industry specification §6.1–6.4 and the [#141 decision plan](../../../docs/audits/2026-11-07-industry-closeout.md). They do not implement or enable the valuation pipeline. `official` and `valuation` jobs still return `deferred_i3`; public pages still show valuation disabled. No formula, method version/hash, schema, license, production flag or public route changes are included.

## Delivered contracts

- `providers/tushare-valuation.ts`: injectable, paged `sw_daily` (one code/year segment) and explicit SSE `trade_cal` adapters using existing raw-page hashing/snapshot capture and exact decimal decoding. No live fetch is initiated by importing them.
- `valuation-ingestion.ts`: complete daily calendar validation, including closed days and page evidence; returns sorted open dates and retained evidence. Official observation planning validates keys, dates, decimals and page hashes, filters explicit expected dates, retains native source units, collapses equivalent decimals deterministically, and excludes conflicting natural keys. Outputs fit existing `OfficialInput`; no observation RPC is invoked. Missing metrics count unavailable unique expected slots (absent dates, nulls and conflicts), never convert nulls to zero. Negative source observations are retained for later quality/method decisions.
- `valuation-preparation.ts`: membership at `on=D, knownBy=D`; unique primary A security effective on D; current `ok` mark selection with exact market-cap consistency checks and observation metadata retained. Missing/ambiguous securities and missing marks remain explicit roles. It labels inputs `reconstruction`, uses `factsAsOf=D`, and does not read or calculate financial facts. Marks observed after D are intentionally allowed by §6.1; a future activated result becomes available at activation, never retroactively at D.
- Alignment diagnostics validate one run/code/metric/date grid against one explicitly supplied candidate official metric, reject mismatched keys and ambiguous current observations, ignore superseded observations, and delegate only numerical counts to #141. Candidate mapping does not approve comparability. The result remains `diagnostic_only`, with no official values, database pair rows or publication authority. SQL must re-read current observations at eventual staging; this helper is not a transactional current-version guarantee.

All outputs are internal research materials. Adapter availability does not grant source rights. Expected-date sampling and provenance must be carried into a future approved run/manifest implementation; open dates alone do not constitute an expected-date policy.

## Exact decisions and evidence still required

1. **H / method owner:** choose proposed `pe_ttm_sw` validation or retain the existing whole-company PE with no official anchor. Approve metric identities, formulas, numerator/denominator sets, source share classes, free-share proxy limitations, financial reporting calendar, TTM cutoff/period/version consistency, losses, nonpositive equity, missing inputs, minimum sample handling, IPO sixth trading day, suspensions and delistings. Existing `total_share` includes A/H/B and cannot be silently treated as A-only. PB remains unverified; market cap has no official comparator. Revise §6.3/§6.4 and version/hash contracts before implementation. Shared “TTM” wording is not comparability approval.
2. **Membership/history owner:** K3's inclusive upstream exit day and exclusive delisting cutoff remain the approved reconstruction rules. Historical reconstruction is not observed historical membership. Approve any change to historical treatment or suppression (G), and any method-specific new-stock/suspension/unresolved-member exclusions under H. These helpers introduce none.
3. **A / licensing owner:** separately review scheme, marks and official datasets, currently internal. Making official values public only permits the licensed replay field; it does not authorize derived valuation publication or marks use. This change grants nothing.
4. **C / operations owner:** confirm 5000-point official availability, historical marks backfill depth and storage capacity. Confirm complete trading-calendar coverage and explicit monthly/weekly sampling boundaries for the recent two-year window; empty market data cannot establish a holiday.
5. **Evidence owner:** independent exchange golden set (5 companies including A+H × 2 days), 3 industries × 4 official PE/PB dates, and original evidence across reporting-calendar transitions, loss-heavy industries, A+H/A+B, missing marks/free shares, new listings and suspensions. Existing two industries × five days and synthetic tests do not satisfy this.
6. **Reconciliation/integration owner:** at least 24 valid pairs per individual code/metric, complete expected calendar, ≥90% paired coverage, ≥95% within 1%, fresh official versions for carried dates. Reconcile existing SQL PE mapping with H/basis rules. The forward migration `20261120093000_industry_exact_pair_tolerance.sql` aligns staging's 1% predicate with #141's exact cross multiplication; `rel_diff` remains a rounded display diagnostic and must not be used to reclassify pairs. Real PostgreSQL synthetic regressions cover both sides of the boundary and prevent a just-outside pair from qualifying a 23/25 series. Existing stored pairs are not rewritten; future staging/restaging uses the corrected predicate. This arithmetic correction does not resolve the comparator mapping or authorize publication. Validate actual stage/publish/activate, current-observation races, dependencies, carry compatibility, manifests and replay before integration. No new qualification adapter is enabled here.
7. **E / CN data and Q2 owners:** CN real-facts acceptance, worker/readiness gates, production scheduling and judgment methodology remain separate prerequisites. No flags, workers, licenses, cron, judgments or production writes change.

The future pipeline still needs approved formula computation, valuation manifests/replay, actual official ingestion orchestration and receipts through existing RPCs, reconciliation writes, carry/dependency handling, publication, activation, percentiles and operational acceptance. This preparation makes no claim that full I-3 is delivered.

## Verification scope

Dedicated fixture/synthetic tests cover real recorded provider fields, range requests, incomplete calendars, evidence, conflicting observations, deterministic equivalent evidence, membership knowledge boundaries, primary security ambiguity, current-mark revisions, arithmetic consistency and reconciliation identity. Existing jobs tests retain disabled behavior. No live provider, production, database publication or license validation was performed.


## Executable aligned evidence check

Use Node 22 and `node --import tsx scripts/industry/aligned-reconciliation-check.ts <private-input.json>` to validate one candidate series offline. Unlike the numeric-only `reconciliation-check.ts`, this command checks supplied row identities before counting. It does not query observations, prove source authenticity/currentness, approve a comparator, validate sampling completeness against a calendar, or assess production readiness.

The JSON contract is:

- `query`: `runId` (nonempty string without surrounding whitespace), `code` (six digits, without `.SI`), `metric` (`pe_ttm`, `pe_static`, `pb`, or `market_cap`), `officialMetric` (source metric: `pe`, `pb`, `total_mv`, `float_mv`, or `close`), and `expectedDates` (nonempty unique legal ISO dates).
- `computed`: rows with `run_id`, `scheme: "sw2021"`, `version: "2021"`, `code`, `metric`, `trade_date`, `status` (`ok` or `missing`), and `value` (plain decimal string for `ok`, null for `missing`). Each supplied row must match the query and an expected date, with no duplicate dates.
- `official`: rows with `scheme`, `version`, `code`, `metric`, `trade_date`, decimal-string `value`, `observation_id`, timezone-bearing `observed_at`, and `status` (`ok` or `superseded`). Current rows must match the candidate query. Every current observation ID must be a nonempty string without surrounding whitespace and may occur only once across the series; each date may have only one current row. Superseded rows never supply evidence. Observations after the trade date remain allowed for reconstruction.

Missing expected rows count unavailable. A single observation relabelled across 24 dates is rejected, even if all values agree. Runtime selector validation also applies to an empty row set. Supported metric names are syntax validation only: arbitrary candidate pairings remain internal experiments, including PB; market cap still has no approved official comparator. No new mapping or comparability rule is introduced.

Stdout contains only `diagnostic_only`, counts and threshold booleans. Exit 0 means the **numeric** thresholds passed; 1 means they failed; 2 means invalid file/arguments/input, with a fixed sanitized stderr message. Input files remain private research material. Even a 0 cannot clear H, licenses, independent evidence, current-observation races or database publication/activation gates. Use the existing complete-calendar preparation and an explicitly approved expected-date policy upstream; passing a shortened expected list cannot prove coverage of the required window.

## Readiness inventory: decisions versus implementation

| Remaining decision/evidence | Owner acceptance contract |
| --- | --- |
| H: method/comparator | Signed choice, revised §6.3/§6.4, exact identities/formulas/share classes/financial calendar/exclusions/sample policy, and version/hash contracts. Matching numeric names or thresholds cannot substitute. |
| G: history | Explicit approval for any departure from K3 reconstruction and any historical suppression policy. |
| A: source rights | Separate scheme, marks and official dataset decisions; official replay rights do not grant derived valuation rights. |
| C: operations | Verified 5000-point availability, marks history/storage, complete calendar and explicit two-year sampling boundaries. |
| Independent evidence | Original exchange records for 5 companies including A+H × 2 days; 3 industries × 4 official PE/PB dates; reporting transitions and the edge cases above. Fixtures and relabelled observations do not qualify. |
| E/Q2: dependencies | CN real-facts acceptance, worker/readiness gates and judgment methodology accepted by their owners. |

| Remaining implementation | Dependency and acceptance |
| --- | --- |
| Official ingestion orchestration | Rights/capacity/calendar policy; persisted raw evidence and actual observation RPC receipts. Existing adapters alone do not implement the job. |
| Formula computation | H/version contracts first; approved financial/member/marks rules with independent golden assertions. |
| Reconciliation and carry | Approved comparator mapping, complete per-code/metric expected sets, fresh official versions, 24/90%/95% thresholds, race and dependency checks through real staging. |
| Valuation manifests/replay | Formula/config/source version identities, reproducible reconstruction and compatible carries; current diagnostic counts are not a manifest. |
| Publish/activate/percentiles | Actual stage/publish/activate acceptance plus replay, dependencies and operational approval; existing RPC infrastructure alone is insufficient. |

This slice adds evidence consistency checks and an offline executable diagnostic only. Both actual jobs remain `deferred_i3`. It supplies no real golden set, licensing decision, H selection or I-3 completion.
