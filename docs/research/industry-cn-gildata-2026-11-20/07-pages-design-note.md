# 07 — Design note: Chinese industry pages (admin-only), first build

Date: 2026-11-25. Basis: canvas section 7 (`06-canvas.md`, confirmed by the owner on
2026-11-25), `04-spec.md` §3/§6/§8, and what the Gildata ingest (`06-build-notes-ingest.md`)
actually stores: SW2021 level-1 classifications, current constituents, 12 quarterly
vendor-reported metrics per industry, each with a retrieval and a row locator.

## 1. Routes

No new top-level route (spec §3). On the existing industry routes, `scheme=sw2021` is now
served from the active vendor generations:

| Route | Artboards |
|---|---|
| `/intel/industries?scheme=sw2021` | `Cn-List`, `M-Cn-List`, `Cn-States` |
| `/intel/industries/sw2021/[code]` | `Cn-Detail`, `M-Cn-Detail` |
| `/intel/industries/sw2021/[code]/constituents` | `Cn-Constituents`, `M-Cn-Constituents` |
| source drawer on every number | `Cn-Drawer`, `M-Cn-Drawer` |
| `GET /api/admin/industries/vendor` (existing, admin-only) | new views `grid`, `replay` |

The default scheme stays `sic`. The public `/api/industries*` routes are not changed and never
return vendor rows. The older Tushare-based `sw2021` read model stays in `src/lib/industry/`
for reconciliation and its API, but the three pages no longer render it.

## 2. Gate

Access is decided on the server before any vendor row is read:

1. Licence rows `scheme:sw2021:2021` and `vendor:gildata:industry-financials` must both exist
   with status `internal` or `public`; a missing row or a failed lookup closes the page for
   everyone.
2. The viewer must be an admin. In this release a `public` licence status does not open the
   pages to other users: the vendor terms bar third-party display, so opening them is a code
   change, not a row update.
3. Anyone else gets the `Cn-States` withheld page: no grid, no skeleton, no industry list, no
   counts, no dates. The vendor read functions are not called, so nothing vendor-derived can
   be in the HTML, the RSC payload or page metadata.

Pages are `force-dynamic`; vendor views are never put in the last-good-view cache
(`stale-views.ts`) or any shared cache; the admin API answers `Cache-Control: no-store`.

## 3. What is built now

| Artboard part | Built | Notes |
|---|---|---|
| Admin-only bar, scheme switch state (`internal preview` / `withheld`) | yes | |
| Vendor run bar: generation, activation time, `reconstructed`, origin tag | yes | |
| List: signed heatmap + table equivalent | yes | 31 industries × up to 10 fiscal years |
| List metrics | yes | revenue YoY (derived `yoy/1`), parent net profit YoY (vendor), gross margin, ROE (average) |
| Basis toggle | partly | `annual` (fiscal-year ends) and `quarter-end` (cumulative, as reported). Single-quarter differencing is shown disabled, "not yet available" |
| Detail: latest values, series chart + table, constituents preview | yes | all 12 stored metrics selectable; gap = missing, nothing interpolated |
| "Member set changed" mark on a derived YoY | yes | when the vendor member count differs between the two periods |
| Constituents | yes | current snapshot only, paged; six-digit code as returned by the vendor |
| Source drawer: vendor observation, derived statistic, membership | yes | publisher, product, interface, template, row locator, response SHA-256, fetched at, activation, parser and mapping versions, licence; "not provided by vendor" stated line by line; no URL |
| Replay | yes | admin API `view=replay` re-parses the archived response for one cell and compares with the stored text; it never calls the vendor |
| Missing cells | yes | `vendor not provided`, `no prior period`, `invalid denominator`; never 0, never blank |
| States | yes | withheld, admin preview, empty (no active run), read error, stale chip |
| zh / en, phone layouts (table first, one period with a stepper) | yes | English industry names from a reviewed static table |

`yoy/1`: `value(t) ÷ value(t − 1 year) − 1` on the same cumulative metric and the same period
end one year earlier; computed in decimal arithmetic at read time from two stored vendor
observations; missing when either input is missing (reason carried over), when there is no
year-earlier period (`no prior period`), or when the base is zero or negative (`invalid
denominator`). The drawer lists both inputs, each opening its own vendor-observation drawer.

## 4. Shown as "not yet available" (the section stays and says so)

| Artboard part | Why |
|---|---|
| Valuation and percentiles | valuation is not ingested |
| Prosperity dimensions, vendor prosperity index | not ingested; percentiles need the derived-statistics work |
| Stages view (`view=stages`), lifecycle / valuation / composite judgment cards | no registered method; the page shows "no stage method published" and "no judgment" |
| Single-quarter basis, 3-year CAGR | derived statistics beyond `yoy/1` are a later PR |
| Coverage column and low-coverage state | canvas assumption (vendor members ÷ members we resolve) needs issuer resolution, which does not exist yet; the column is omitted rather than filled |
| Constituents: member since / until, date basis, date picker | entry and exit dating needs successive snapshots; the page shows the snapshot's fetch date and states that dating is not available |
| Constituents: weight | not provided by the vendor (stated in the table) |
| Constituents: company link, reconciliation note | securities are not yet resolved to issuers; no reconciliation report exists |
| Revised marker, retracted run, generation history in the drawer | one generation exists and there is no retraction path; added when a second generation or a withdrawal exists |
| Hub card and stock-page industry row (`Cn-Entry`), `Cn-Future` | outside this task (list, detail, constituents) |

## 5. Public-repository rule

Fixtures and tests use the synthetic Gildata fixtures in `src/lib/vendor/gildata/fixtures/`
and invented rows only. No real vendor figure appears in code, tests, docs or PR text.
