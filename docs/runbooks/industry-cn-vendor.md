# Gildata SW2021 industry ingest

The two jobs retain raw response bytes and publish generation-scoped snapshots of current constituents and quarterly vendor-reported financials. The vendor terms bar third-party display. Only administrators can read these snapshots. Commit synthetic fixtures only to this public repository.

Set `GILDATA_API_KEY` for live requests. `GILDATA_MAX_CALLS_PER_RUN` caps dispatched attempts including retries (default 80). `GILDATA_MIN_INTERVAL_MS` spaces requests (default 1000). A full pass requires 31 calls per job, or 62 for both, before retries.

Apply `supabase/migrations/20261214090000_industry_vendor_gildata.sql` before the first write. Apply requires Supabase service credentials, a code version, the full industry universe and `INDUSTRY_CN_VENDOR_ENABLED=1`. Cron is disabled by default and has no schedule in `vercel.json`.

With credentials supplied by the operator's environment, use the following commands.

```sh
# Plan the calls without contacting Gildata.
node --import tsx scripts/industry/vendor-sync.ts --job gildata-memberships --plan

# Fetch and validate one industry without writing. Omit --fixtures for a live preview.
node --import tsx scripts/industry/vendor-sync.ts --job gildata-industry-financials --l1 801080.SI --from-year 2024 --to-year 2025 --fixtures src/lib/vendor/gildata/fixtures

# Publish a complete generation.
INDUSTRY_CN_VENDOR_ENABLED=1 node --import tsx scripts/industry/vendor-sync.ts --job gildata-memberships --apply
```

A failed fetch or parse leaves the previous active generation in place. Apply retains captured bytes and retrievals, records parser rejections in quarantine, finishes the batch and records the freshness attempt. A staging or activation failure leaves a failed generation for inspection. Unchanged snapshots record a successful batch and freshness without advancing the generation.
