# Investment clock publication freshness

Investigation baseline: `2d3c5ad5b754891ac579b08111398473f6d2d94a` (2026-11-08 UTC). This record describes the source fix; it does not claim production deployment or authenticated acceptance.

## Evidence and cause

The parent observed the CN clock warning “Input snapshot is stale relative to active overview,” with coverage 60% and a zero-point Stagflation/Recession margin. The frontend deliberately compares the latest public judgment’s immutable `macro_snapshot` input ID to the active overview ID and refuses a current quadrant when they differ. Its limitation labels come from the judgment’s own snapshot. Coverage exactly 0.6 and zero margin do not themselves prevent classification; insufficient calibration also does not suppress categorical selection.

An ordinary public judgment GET at 2026-11-08T05:09:32Z returned `X-Vercel-Cache: MISS`, `Age: 0`, and exact code version `2d3c5ad5…`. CN still selected open judgment `2fc6cdb9-95ca-883a-982f-824a398b9731`, registered 2026-11-07T13:39:01.490Z, bound to snapshot `a256aa8c-7188-4fbf-97c3-42250d688899`. This establishes that the old public selection was also served on a cache miss. It does not establish the active snapshot ID or prove a particular cron failure. Authenticated snapshot inspection was unavailable to this worker; no user tokens or production writes were used.

Both production publication callsites passed only `{db}` into `publishRegion`. Its enabled default hook was a no-op that reported `hook: ok`. The real producer existed only in applying settlement compensation. The configured settlement schedule is daily 03:00 UTC, before the daily US snapshot sync at 05:30 UTC; CN ingest may publish between settlement scans too. New snapshots could therefore remain unmatched until a later applying scan. Settlement preview does not generate judgments. The overview cache reads active selection live and keys immutable facts by snapshot and publication state; there is no evidence here that bypassing that cache or the stale-snapshot guard would repair the missing producer.

## Change

The server-only macro write composition now supplies a lazy production judgment callback to both US sync and CN ingest finish. Under exact `MACRO_JUDGMENTS_ENABLED=1`, it uses `productionJudgmentDeps`, the registered `macro_regime@v2` code method, the normal resolver table and `produce`/`registerJudgment`, with the callback snapshot’s region, as-of date and explicit snapshot ID binding. A dedicated `judgments.produce.macro_regime` batch records outcomes. Returned failures, quarantine or noncompletion cannot report hook success.

Publication remains valid when judgment generation fails. Keyed replay still skips the hook; settlement compensation remains recovery and its marker is untouched. No publication permissions, methodology/coverage thresholds, flags, cron schedules, SQL, or frontend guards change. A newer active snapshot cannot redirect an older callback. Registration retains duplicate and concurrent unique-key handling.

## Verification and limits

Actual production composition and both route handlers are tested through real publication, classification, producer and registration against local memory persistence. CN evidence includes an explicitly synthetic bond-history extension, ingested through the normal hash/parser/derivation path, to reach exactly 60% coverage. Tests cover exact/off flags, preview/no-native gates, keyed replay, thrown dependency failure, returned producer failure, compensation recovery, concurrent first registration and an older callback after active publication advances. Existing macro, F4 and clock guard suites also run.

The public judgments API retains `public, max-age=300`; a newly registered card can still take up to that normal cache lifetime to become visible. This change does not recover an already-unmatched production snapshot by itself or prove the deployed scheduler is healthy. Production closure requires the parent to compare active and judgment snapshot IDs and inspect the authorized job receipt; deploying or manually invoking jobs was outside this worker’s scope.
