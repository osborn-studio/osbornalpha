# Industry coverage — why so few SIC industries show a value (diagnosis, 2026-11-20)

Scope: the US SIC aggregates on `/intel/industries` (method `industry-agg-us/1.0`, spec
`docs/superpowers/specs/2026-11-04-industry-research-design.md` §19). No code changed for this document.

Sources:

- Repository at `main` 20b7fa9e.
- Production `stock-monitor`, read-only SQL run by the coordinating session on 2026-11-20 (queries QA–QK; the SQL
  and raw results are kept outside the repository in the sessions' shared notes folder). Active run: generation 5,
  `facts_as_of` 2026-11-17, created 2026-11-17 15:06:45 UTC.
- SEC `data.sec.gov` XBRL API, fetched 2026-11-20, for seven named filers (§4, §5).

Two kinds of number appear below and are labelled:

- **Run**: counts and values stored by generation 5.
- **Today's facts**: the method's pick recomputed in SQL on the facts as they are on 2026-11-20. The recomputation
  was checked against the run: cut at the run's creation time it gives the same members-with-data count and the
  same USD sum as the run in all 111 industry-year cells checked (37 industries × 3 fiscal years; revenue and net
  income). Today's facts differ from the run only because 64 more issuers have synced since (743 → 807).

## 1. Answer

1. **The issuer universe is the main cause.** 407 of 444 SIC codes cannot show a value because they have fewer
   than five member companies: 244 have none and 163 have one to four. Only 37 codes can ever pass with today's
   universe. The S&P 500 universe that the scope code expects was never loaded (§3).
2. **Sync back-off is no longer a cause.** 807 of 815 scope issuers are synced. The eight that are not affect two
   industries (§6).
3. **Of the 37 codes that can show, 13 to 15 do (run).** On today's facts 21 to 23 would. That gain is not real
   coverage: see point 4.
4. **A correctness defect inflates coverage and values.** For foreign filers that report in another currency, the
   run sums the USD "convenience translation" printed in their 20-F. Spec §19.4 says such filers are excluded and
   nothing is converted. 8 or 9 of the shown revenue cells per year contain such members. With them excluded, as
   the spec requires, 8 industries show per year on the run's facts, and 12 to 14 on today's facts (§4).
5. **R2 (more fiscal years, TTM) does not improve coverage and is not defined by the spec.** §19.3 says TTM is
   out of scope pending a separate amendment, and §19.2 fixes the three-year window on purpose (§8).

## 2. Which gate stops how many industries

Run, generation 5, `revenue_sum`, 444 codes per fiscal year (QA):

| Gate | FY2023 | FY2024 | FY2025 |
|---|---|---|---|
| No member | 244 | 244 | 244 |
| One to four members (`DISPLAY_MIN_MEMBERS_SIC` = 5) | 163 | 163 | 163 |
| Five or more members, under 80 % with data (`DISPLAY_MIN_COVERAGE` = 0.8) | 22 | 23 | 24 |
| Shown | 15 | 14 | 13 |

Other metrics, shown codes (run): net income 17 / 21 / 23; net margin 10 / 12 / 8; revenue year-on-year
10 / 12 / 10; gross margin 2 / 2 / 1 (eight financial codes are excluded from gross margin by rule, five more
have no member with both inputs).

Member counts per code (QB): 0 → 244 codes; 1 → 86; 2 → 42; 3 → 23; 4 → 12; 5–9 → 20; 10–19 → 9; 20 or more → 8.
The 37 codes with five or more members hold 524 of the 811 members.

No industry fails on unresolved members or on period alignment at the industry level; ambiguous fiscal periods
affect at most two members of the 37 codes in any year.

## 3. The universe

- US facts scope = issuers owning an active ticker in `sp500`, `nasdaq_top500` or `us_china`
  (`src/lib/facts/scope.ts:24`). SIC membership is loaded for the same issuers.
- Production (QE, QI): `nasdaq_top500` 500 active tickers, `us_china` 321, **`sp500` no row at all, active or
  inactive**. Union 810 tickers, 815 scope issuers, 812 with a SIC code (without: Ares Capital, Bank OZK,
  First Financial Bankshares).
- `nasdaq_top500` is the 500 largest Nasdaq-listed common stocks and ADRs by market capitalisation, built from
  the Nasdaq Trader symbol directory and the Nasdaq screener (`src/lib/securities/sources/us-universes.ts:86`).
  `us_china` is US-listed issuers with country CN or HK plus a reviewed override list. So the universe holds
  almost no NYSE-listed company that is not Chinese.
- The S&P 500 loader exists (`src/lib/securities/sources/sp500.ts`) and is called by the US securities cron, but
  it needs `SP500_CONSTITUENTS_URL` on an approved host (`www.spglobal.com`) or `SP500_CONSTITUENTS_STORAGE_PATH`,
  and fails with `source_authorization_required` otherwise. Neither is configured, so it has never written a row.
  The constituent list is S&P Global's; using it needs a licence or a written permission.

Effect of adding issuers: 35 codes have three or four members and need one or two more; 128 have one or two.
How many would cross five with the S&P 500, or with any other list, is **unknown** without the list and its SIC
codes. It can be measured without publishing anything: load the universe, sync SIC and facts, run
`aggregate-sic` as a dry run.

## 4. Correctness defect: convenience-translated USD is summed

Rule today (`src/lib/industry/aggregate-us.ts`, `pickInputsUs`): among an issuer's current annual facts for a
concept and fiscal-year bucket, keep unit `USD`; exactly one → use it. A fact in another currency for the same
period is ignored.

Spec §19.4: "外币申报者（CNY/EUR 等）因此被排除并计入覆盖分母，不折算" (foreign-currency filers are excluded,
counted in the coverage denominator, and not converted).

What the SEC data shows (`us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax`, annual):

| Filer | 20-F accession (filed) | FY2025 in CNY | FY2025 in USD |
|---|---|---|---|
| Baidu | 0001193125-26-109289 (2026-03-17) | 129,079,000,000 | 18,458,000,000 |
| JD.com | 0001193125-26-157870 (2026-04-16) | 1,309,085,000,000 | 187,197,000,000 |
| PDD Holdings | 0001104659-26-050727 (2026-04-29) | 431,845,713,000 | 61,753,116,000 |

For all three, each year's CNY value is repeated in three consecutive 20-Fs, while the USD value exists only in
the 20-F in which that year is the latest. The implied rate changes each year (Baidu: 6.99 for FY2025, 7.30 for
FY2024). That is the "US$" convenience column of the latest year. Not verified: the note in the filing text that
names it a convenience translation; the API exposes neither the note nor the XBRL context.

Genuine USD reporters on Form 20-F look different: Daqo New Energy (`us-gaap:Revenues`) and Grab Holdings
(`ifrs-full:Revenue`) carry USD only, and each year's USD value is repeated in consecutive filings. So the facts
alone separate the two cases: a non-USD fact for the same issuer, concept and exact period.

Scale (QG, today's facts): 20-F filers with both a USD and a non-USD annual revenue for the same period:
79 (FY2023), 92 (FY2024), 93 (FY2025), plus one to three on 20-F/A. 10-K filers: none.

Consequences in live numbers:

- These issuers count as "with data", which raises coverage.
- Their translated USD is in the sums. Share of the industry's summed revenue coming from them (run): SIC 7389
  61–63 % in every year; 5990 94 % (FY2023); 8200 19 % (FY2025); 3711 12–14 % (FY2023, FY2024).
- Year-on-year for them includes the exchange-rate change. JD.com FY2025: +13.0 % in CNY, +17.9 % in USD.

Shown revenue cells (codes with five or more members and 80 % coverage):

| | FY2023 | FY2024 | FY2025 |
|---|---|---|---|
| Run: shown | 15 | 14 | 13 |
| Run: shown cells with at least one such member | 9 | 9 | 8 |
| Run's facts, such members excluded: shown | 8 | 8 | 8 |
| Today's facts, rule as today: would show | 21 | 22 | 23 |
| Today's facts, such members excluded: would show | 12 | 14 | 13 |

Codes that stop showing on the run's facts: FY2023 2834, 3674, 3711, 5990, 6282, 7011, 7389; FY2024 3674, 3711,
7011, 7371, 7389, 8071; FY2025 5961, 7011, 7389, 8071, 8200. The next generation will differ from both the run and
these figures in any case, because of the 64 issuers synced since.

Fix (decided by the coordinating session; separate pull request): the pick excludes an issuer's concept-period
when a non-USD fact exists for the same exact period, with its own labelled reason; nothing is converted; method
version bump; old generations stay replayable.

## 5. Second accuracy risk: bank revenue (observed, not counted)

`revenue` maps to `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` and IFRS
`Revenue` (`src/lib/facts/concepts.ts:22`). Banks report no total-revenue line:

- Fifth Third Bancorp files none of these tags for FY2025 → revenue is missing. That is correct.
- Huntington Bancshares files only the contract-revenue tag: 1,562,000,000 for FY2025, next to interest and
  dividend income of 10,310,000,000 and net income of 2,211,000,000. The mapping accepts the 1.56 bn as revenue.
  It is fee income, not total revenue.

How many members of the financial codes are in the second case is not measured. The bank codes 6021 and 6022 are
below the coverage gate (2 of 7 and 4 of 10 with revenue), so the page shows no value for them, but the API
returns the sums and net margins.

## 6. The eight unsynced issuers

| Issuer | State | Cause | SIC (members) |
|---|---|---|---|
| Bank OZK | failed | `no_companyfacts` at the SEC | none |
| Definium Therapeutics | failed | `parse_error` | 2833 (3) |
| Heartflow | failed | `parse_error` | 3841 (8) |
| NorthWestern Energy Group | failed | `parse_error` | 4931 (5) |
| Skyline Builders Group Holding | failed | `parse_error` | 1700 (5) |
| Sportradar Group | failed | `parse_error` | 7370 (26) |
| Roku | never attempted, scope reasons empty | no longer in a universe; `next_due_at` 2026-11-07 never served | 4841 (3) |
| First Financial Bankshares | never attempted, scope reasons empty | same | none |

On today's facts, syncing them would let two industries pass for revenue: 3841 (6 of 8 → 7 of 8) and 4931
(3 of 5 → 4 of 5, if NorthWestern has FY data). 1700 already passes at 4 of 5. The `parse_error` cause is not
diagnosed here.

## 7. Why the remaining industries are under 80 % (today's facts, FY2025)

14 of the 37 codes are under 80 % for revenue with the rule as it is today. Their uncounted members (QC):

| Reason | Members | Codes that would pass if this alone were cured |
|---|---|---|
| No mapped revenue fact, net income present | 39 | 11 (2834, 2836, 3841, 4899, 4931, 5990, 6021, 6022, 7370, 7373, 8742) |
| No annual fact for that fiscal year | 15 | 8 |
| Other currency only | 5 | 3 |
| Not synced | 3 | 2 |
| Ambiguous fiscal period | 0 | 0 |

After the fix of §4, foreign-currency filers become the largest group: 69 more members in the 37 codes move from
counted to excluded for FY2025, and ten more codes fall under 80 %.

The first row mixes three cases that the database cannot separate, because unmapped tags are not stored:
companies with no revenue (development-stage drug companies in 2834 and 2836), banks without a total-revenue line
(§5), and companies whose revenue is under a tag that is not in the mapping.

## 8. Remedies

"Missing stays missing" holds for every row: none lowers a threshold. The spec offers no other threshold level
(§19.6), so none is proposed.

| # | Remedy | Blocks today | Size | Needs |
|---|---|---|---|---|
| 1 | Exclude convenience-translated USD (§4) | wrong values in 8–9 shown cells per year | S | nothing; within spec §19.4; being built |
| 2 | Enlarge the US universe | 407 codes under five members | L (list, SIC, facts sync for each new issuer, cron budget) | **Owner**: which list. S&P 500 needs a licence. A public primary alternative is the SEC's own registrant and exchange list. Effect unknown until measured by dry run |
| 3 | Inventory the unmapped revenue tags of the 39 members, then extend the mapping where the tag is total revenue | up to 11 codes | S for the inventory; M for a mapping generation with gold checks | inventory: nothing. Mapping change: facts spec rules |
| 4 | A revenue definition for banks (for example net interest income plus non-interest income), and rejecting the contract-revenue tag as total revenue for them | 6021, 6022; wrong values of §5 | M | **Owner / spec amendment** (facts spec and §19.4) |
| 5 | Measure coverage over USD reporters only (foreign-currency filers leave the denominator, labelled as such) | after remedy 1, FY2025: 13 → 16 codes shown; FY2024: 14 → 18 | M | **Owner / spec amendment** of §19.4 and §19.6; it changes the coverage rule |
| 6 | Fix the five `parse_error` issuers; retire or re-admit the two scope rows with empty reasons | 2 codes | S | nothing |
| 7 | Coarser grouping (2- or 3-digit SIC) | — | M | not useful: groups passing both gates on the run are 13–15 at four digits, 16–18 at three, 11–13 at two (QH). Also excluded by §19.1 (no primary name table) |
| 8 | R2: more fiscal years and TTM | none | M | **Spec amendment**: §19.3 excludes TTM ("需要跨财年日历对齐，另行修订"); §19.2 limits the window to three completed fiscal years to bound survivorship bias from applying today's constituents to past years |

## 9. Not verified

- The filing-text note that names the USD column a convenience translation (§4).
- How many financial-code members carry the contract-revenue tag as "revenue" (§5).
- The split of the 39 members of §7 row 1.
- The cause of the five `parse_error` failures (§6).
- Any effect of a larger universe (§3).
- The scheduled `aggregate-sic` run of 2026-11-22 04:30 UTC; it will publish a new generation on today's facts with
  the rule as it is, unless the fix is deployed first.
