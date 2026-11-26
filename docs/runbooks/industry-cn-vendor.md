# Gildata SW2021 industry ingest

The two jobs retain raw response bytes and publish generation-scoped snapshots of current constituents and quarterly vendor-reported financials. Who can read these snapshots is set by two licence rows (see "Opening and closing the pages"); with the rows at `internal` only administrators can. The vendor's personal-account terms do not allow giving data to third parties; the owner decided on 2026-11-26, with that risk stated, to open the pages to signed-in users. Commit synthetic fixtures only to this public repository.

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

## Opening and closing the pages

The SW2021 pages (`/intel/industries?scheme=sw2021`, the industry page and its constituents) and the drawer's replay (`/api/industries/vendor/replay`) read two rows of `industry_dataset_licenses` on every request:

| `scheme:sw2021:2021` | `vendor:gildata:industry-financials` | Who sees the pages |
|---|---|---|
| `public` | `public` | every signed-in user |
| either one `internal` | | administrators only, with the admin-only bar |
| a row missing or unreadable | | nobody |

There is no flag and no deploy involved. The only write path is the SQL function `public.set_industry_dataset_license(p_key, p_status, p_by, p_note)`. It updates the row and writes the `industry.license_set` row of `research_audit_log` (from, to, note) in the same transaction. `p_by` is the id of the administrator making the decision; `p_note` should name the decision. Do not update the table directly.

Before opening, read design note section 2.3: `scheme:sw2021:2021` also opens the older Tushare-based `/api/industries?scheme=sw2021` routes, without sign-in and with cached answers.

**Open.** The scheme row goes through the admin route, which calls the function and then drops the cached classification trees. Signed in as an administrator, from the site's own origin:

```sh
curl -X POST "$SITE/api/admin/industries/licenses" -H 'content-type: application/json' -b "$ADMIN_COOKIE_JAR" \
  -d '{"dataset_key":"scheme:sw2021:2021","status":"public","note":"owner decision 2026-11-26: SW2021 pages open to signed-in users"}'
```

The admin route accepts only the four keys in `src/lib/industry/licenses.ts`, so the vendor row is set by calling the function in SQL with the service or owner role:

```sql
select public.set_industry_dataset_license('vendor:gildata:industry-financials', 'public', '<administrator user id>', 'owner decision 2026-11-26: SW2021 pages open to signed-in users');
```

Check: `select dataset_key, status, decided_by, decided_at from public.industry_dataset_licenses where dataset_key in ('scheme:sw2021:2021','vendor:gildata:industry-financials');` then load the list page as a non-admin user and open one number's source and replay it.

**Close (revert).** Either row at `internal` is enough, and the pages and the replay route are withheld from non-admins on their next request; nothing is cached. The quickest revert that touches nothing else is the vendor row:

```sql
select public.set_industry_dataset_license('vendor:gildata:industry-financials', 'internal', '<administrator user id>', '<reason>');
```

To close the Tushare-based `/api/industries?scheme=sw2021` routes as well, set `scheme:sw2021:2021` back to `internal` through the admin route (same call as above with `"status":"internal"`); it revalidates the `industries` cache tag, and CDN copies of earlier answers can persist until they expire.

Each call leaves one audit row: `select created_at, actor, detail from public.research_audit_log where action = 'industry.license_set' order by created_at desc limit 5;`
