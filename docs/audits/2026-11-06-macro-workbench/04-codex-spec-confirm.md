## Prior findings

| id | adequate? | gap |
|---|---|---|
| M1 | yes | Official-host replacements and fixture admission address attribution; author-verified endpoints accepted. |
| M2 | yes | AFRE stock growth and MLF remain explicitly missing. |
| M3 | yes | One SAFE fixing series, native unit and monthly selection are specified. |
| M4 | yes | Yahoo removed; unsupported assets restricted; fixed-count acceptance removed. |
| M5 | yes | Publisher/via attribution and individual rights gates added. |
| M6 | partial | Define derived `available_at` from **all** input versions and transformation availability; native `first_seen` alone does not cover derivatives. |
| M7 | partial | Persist transformation version/parameters and every comparison input used by displayed changes and classification. Latest-only snapshot manifests omit delta dependencies. |
| M8 | partial | Specify YoY division precision/rounding and enforce `value`–`value_text` equality. Landed `rangeRule`/`jumpRule` reject strings; define their finite-number conversion boundary explicitly. |
| M9 | partial | Shared reconciliation writes remain unspecified. Define `recordAttempt({ok})` for partial batches and serialize attempts: landed freshness updates assume one concurrent writer. |
| M10 | partial | Specify atomic queue resolution, promotion, audit and dependent-snapshot handling. Reject stale deliveries before allocating versions; an older response must not become the latest revision. |
| M11 | partial | Timeliness must test the **next expected period’s** release deadline. Latest period + lag falsely marks a normally released monthly value late shortly after publication. Define event/missing-lag behavior. |
| M12 | yes | Facts publish independently; F4 display gate and compensation hook added. |
| M13 | yes | F4 result fields, UUID references, numeric axes, ties and percentage-point margin align. |
| M14 | partial | `macro_series` upserts overwrite historical catalogs. Preserve immutable catalog/rule versions and bind replay to them; rejecting non-`v1.0` does not prevent catalog drift within `v1.0`. |
| M15 | partial | Instantiate per-series adjustment and GDP single-quarter versus cumulative basis. Give native inputs zero judgment weight and explicitly separate them from derived indicators. |
| M16 | partial | Publication revision changes only on publish. Concurrent ingestion/promotion can leave a stale manifest publishable; bind computation to an input revision changed by those mutations, checked under the same lock. |
| M17 | yes | Target-range changes are correctly labeled derived effective-date events; meeting calendars remain separate. |
| M18 | yes | Complete frozen analysis inputs, append-only runs and pagination failure behavior are specified. |
| M19 | yes | Changes default, exploratory levels, lag direction and numerical rejection rules added. |
| M20 | yes | Separate sample gates, overlap handling and deterministic cycle rules added. |
| M21 | yes | All mock-backed Today rows removed. |
| M22 | partial | Dedicated atomic counting is viable, but request idempotency is absent: retries can create duplicate runs and consume quota twice. |
| M23 | yes | Route authentication, fail-closed secrets, own-row reads and private analysis caching are explicit. |
| M24 | partial | Chunk protocol lacks batch identity, chunk IDs/counts, retry accounting and verified completion. Cron can also publish partially received CN observations before `complete:true`. |
| M25 | yes | Required migration timestamp, lock, suite registration, grants tests and bucket-only migration specified. |
| M26 | yes | Regional envelopes and verified-or-missing acceptance replace incompatible assumptions. |

## New findings

| id | severity | section | defect | fix |
|---|---|---|---|---|
| N1 | P2 | §2, §4.3 | `create_macro_analysis_run` is granted to `authenticated` while accepting caller-supplied inputs, hashes, results and status. Direct PostgREST calls bypass server computation and can persist fabricated results or unlimited `failed` rows. | Make result persistence service-only; derive the user from the verified server session. Keep quota enforcement in the transaction and revoke authenticated execution. |
| N2 | P2 | §4.1, §4.3 | `macro_evidence` keys retrieval metadata solely by content SHA. Identical bytes retrieved at different times/URLs cannot retain separate receipts. An A→B→A revision either inherits A’s old `fetched_at` or overwrites historical provenance. | Deduplicate byte objects by SHA, but append retrieval receipts with separate IDs. Bind observations/version availability to the appropriate receipt. |
| N3 | P2 | §4.4 | Python completion publishes CN immediately, but derivation appears only in the Vercel cron path. New CN index/month-end inputs can therefore publish alongside stale or absent derived indicators until the next cron. | Run the shared derivation stage after verified CN completion and before publication; require its outputs to match the completed input manifest. |

## Verdict

**not ready**

Draft 2 resolves the major source-selection, judgment-gating and F4 result-shape problems. Remaining gaps affect historical replay, revision ordering, atomic publication and retry-safe ingestion; the new authenticated write RPC also breaks the promised server-computed analysis boundary. These contracts need correction before an implementation plan can reliably scope the work.