# 06 — Build notes: Gildata ingestion (first build PR)

Written 2026-11-24 with the first build PR of `04-spec.md`. It records what was built, what
differs from the spec and why, the answer each owner question (§13) was given for this PR, and
what the next PRs need.

## 1. What this PR contains

Admin-only, switched off by default, no UI.

| Part | Where |
|---|---|
| Source interface (`VendorSource`, `VendorRawStore`) | `src/lib/vendor/` |
| Gildata client, query templates, response decoding, parsers | `src/lib/vendor/gildata/` |
| Shenwan level-1 ↔ Gildata industry-code mapping (31 rows) | `src/lib/industry/vendor/sw2021-gildata-codes.ts` |
| Storage, run lifecycle, licence row | `supabase/migrations/20261214090000_industry_vendor_gildata.sql` |
| Ingest jobs, receipts, gates | `src/lib/industry/vendor/` |
| Script | `scripts/industry/vendor-sync.ts` |
| Cron route (not scheduled) | `src/app/api/cron/industry-vendor-sync/route.ts` |
| Admin read API | `src/app/api/admin/industries/vendor/route.ts` |
| Runbook | `docs/runbooks/industry-cn-vendor.md` |

Datasets ingested: current constituents of the 31 Shenwan level-1 industries (one call per
industry) and the vendor's industry financial aggregates for every quarter end from 2016 (one
call per industry). 62 calls for a full refresh of both.

## 2. Is there a data-source adapter layer in the repository?

No single one. Three separate conventions exist:

| Area | How a source is chosen | Shared interface |
|---|---|---|
| Quotes and daily bars | `src/lib/data/sources/registry.ts` routes a market to an ordered list of `NamedFetcher`s (DataGateway/Wind first when configured, then Eastmoney, Sina, Tencent, TWSE, EODHD); the multi-source daily bars of #316 sit on the same fetchers | Yes, but for quotes only: `fetch(ticker)` returning a quote |
| Company facts | `src/lib/facts/sync.ts` picks by market (`US → edgar`, `CN → tushare`); the two adapters are injected as `fetchUs / fetchCn / parseUs / parseCn` in `SyncDeps` | No. `Source` is a closed type inside the hash-pinned `facts/types.ts` |
| Industry | `src/lib/industry/providers/` (Tushare, SEC SIC), called directly by each job | No |
| Macro | `src/lib/macro/providers/fred.ts`, with the adapter name in a CHECK constraint | No |

The shared pieces that do exist are plumbing, not an adapter interface: the request pacer and
budget in `facts/providers/shared.ts`, the raw-bytes store pattern (`snapshot-store.ts`), ingest
batches, freshness, quarantine, and the licence switch `industry_dataset_licenses`.

This PR therefore adds a small interface, `src/lib/vendor/source.ts`: a `VendorSource` takes a
templated request and returns the exact response bytes with their hash; a `VendorRawStore` keeps
those bytes. Gildata is its first implementation, with a live transport and a fixture
transport. It reuses the existing pacer, batches, freshness and licence table. Tushare, EDGAR
and FRED were not moved onto it: two of them sit behind hash-pinned types, and moving them is a
change with its own risk and no user-visible gain today.

## 3. Differences from `04-spec.md`

1. **New vendor tables for classification and membership** instead of rows in
   `industry_classifications` and `industry_source_memberships` (§4.2). The existing membership
   table needs level-2 and level-3 codes and an entry date per row and feeds the Tushare
   resolver; the vendor returns a level-1 list with no dates. Snapshots are stored as received.
   Resolving securities to issuers and dating entries and exits from successive snapshots is the
   next PR.
2. **Own job module, script and cron route** instead of new names in `INDUSTRY_JOBS` (§5.2).
   The US SIC pipeline's files are not touched.
3. **Dry run calls the vendor and writes nothing**; `--plan` is the mode without calls (§5.2
   had the dry run make no calls). The task for this PR asked for a dry run against the real
   service.
4. **Freshness names do not start with `industry.`**, so the public freshness payload does not
   mention the vendor.
5. **No `initialize` call.** `tools/call` works on its own, verified live.
6. **Scope**: valuation, prosperity, derived statistics, evidence kinds, the replay CLI and
   every page are later PRs. Only the 12 financial metrics of §4.3 are staged.

## 4. New live findings (2026-11-24, 9 read-only calls)

- One call with "2016年至2026年各季度末" returns all 43 quarter ends for one industry in one
  block. A two-year range came back as 8 overlapping blocks; the parser accepts identical
  repeats and rejects conflicting ones.
- The financial table carries the vendor's six-digit industry code and name on every row, so
  the classification is confirmed by the same call (no extra call per industry).
- Constituent codes come without an exchange suffix (six digits).
- An industry name the service does not know returns `code 0`, zero results and a "0 rows"
  message, with HTTP 200.
- A missing figure is a single `-`.

### Dry run against the live service, 2026-11-24 (nothing written)

`scripts/industry/vendor-sync.ts`, default mode, key loaded with `node --env-file`, receipts
with counts and codes only.

| Job | Calls | Industries ok / failed | Result |
|---|---|---|---|
| `gildata-industry-financials` (2016–2026) | 31 | 31 / 0 | 43 quarter ends per industry (1,333 industry-periods); 15,996 cells = 15,910 with a value + 86 the vendor left empty; 727,309 response bytes |
| `gildata-memberships` | 31 | 31 / 0 | 5,817 constituent rows; 397,604 response bytes |

Every response passed the request–response check (interface label, industry code and name,
scheme label, column set, dates). With the run above, the level-1 code mapping is confirmed for
all 31 industries against the vendor's own code and name. `--apply` without
`INDUSTRY_CN_VENDOR_ENABLED=1` was refused with `job_disabled`.

## 5. Owner questions Q1–Q18: what this PR assumes

| Q | Assumption taken | Needs the owner before |
|---|---|---|
| Q1 personal or institutional | Personal (the stricter reading) | any display beyond admins |
| Q2 show vendor figures to users | No. Tables have no public or signed-in read policy; the read API answers `unlicensed` to non-admins | flipping anything public |
| Q3 show derived figures | No (nothing derived is built here) | PR with derived statistics going public |
| Q4 attribution wording | Not needed while admin-only; rows carry publisher and interface label | public release |
| Q5 vendor-reported aggregates in release 1 | Yes, labelled `origin: vendor_reported`, `history_class: reconstruction` | — |
| Q6 call ceiling | 80 calls per run enforced in the client (`GILDATA_MAX_CALLS_PER_RUN`); a full refresh is 62 | scheduling a cadence |
| Q7 store raw responses | Yes, in a private bucket (`vendor-raw`) and admin-only tables; deletion on account end is possible by the database owner, no automatic retention rule | **confirm** — see §6 |
| Q8 default scheme for Chinese visitors | Unchanged (`sic`) | UI PR |
| Q9 cron with the key in production | Route exists, returns 403 unless `INDUSTRY_CN_VENDOR_ENABLED=1`, and is not in `vercel.json`; script from the owner's machine is the supported path | setting the key in Vercel |
| Q10 lifecycle method spec | Not written here. Seam: `VendorObservationReader`; no stage field exists | judgments PR |
| Q11 vendor prosperity index | Not ingested | prosperity PR |
| Q12 composite prosperity | Not built | prosperity PR |
| Q13 sub-industry layer | Out of scope | — |
| Q14 keep Tushare Shenwan path | Kept and untouched; reconciliation is a later PR | — |
| Q15 who records fixtures | This session made 9 bounded read-only calls for shapes and 63 for the dry run; the committed fixtures hold synthetic figures and invented securities | — |
| Q16 single quarters | Not derived here; cumulative and TTM are stored as received | derived-statistics PR |
| Q17 ask for the interface edition | Not assumed; would remove the free-text risk and may give constituent dates | owner's call |
| Q18 ROE definition | Both average and TTM are stored; choice is a display decision | UI PR |

## 6. Two things the owner should know

1. **The repository is public.** Real vendor figures must never be committed. The fixtures in
   `src/lib/vendor/gildata/fixtures/` keep the real column headers, public industry names and
   codes, and dates; every figure and every security name and code is invented.
2. **Storing raw responses (Q7) is the one assumption that touches the vendor terms.** The
   public agreement does not address it. The data stays in a private bucket and admin-only
   tables, readable only by the service role and admins. If the owner prefers not to store raw
   responses, replay from stored bytes is not possible and the design has to change before the
   first `--apply`.

## 7. Before the first `--apply` (owner / coordinating session)

1. Merge; apply `20261214090000_industry_vendor_gildata.sql` to production; add it to
   `supabase/migrations.lock.json`.
2. Run from a clean checkout with the Supabase service environment and the key:
   `--job gildata-industry-financials --apply` and `--job gildata-memberships --apply`, with
   `INDUSTRY_CN_VENDOR_ENABLED=1` in that shell only.
3. Nothing needs to be set in Vercel for the script path. The cron route stays off.
