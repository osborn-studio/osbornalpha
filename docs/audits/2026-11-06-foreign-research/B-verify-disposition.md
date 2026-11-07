# B1–B5 verification disposition

Each finding received a focused probe test against the committed implementation. A failing probe was retained after the fix; a passing probe was removed. The existing tests also cover several of the passing behaviors.

| ID | Reproduced? | Action | Test name |
|---|---|---|---|
| B1-01 | No | Removed probe. `currency-marks/1` intentionally supports CNY, HKD, and USD; the B1 plan explicitly expects `EUR` with `€` to fail as `unknown_currency`. | `B1-01: unsupported EUR evidence remains unknown in currency-marks/1` (removed) |
| B1-02 | Yes | Anchored price parsing to one number with at most one surrounding mark; retained regression. | `B1-02: rejects compound prices as untyped` |
| B1-03 | Yes | Kept ASCII case-insensitive mark spelling, but stopped NFKC normalization of page marks and added token boundaries. `Rmb`, `RMB`, and `CN¥` still match. | `B1-03: recognizes listed marks but ignores embedded tokens and altered page marks` |
| B2-01 | No | Removed probe. §5.4 explicitly requires `ticker_issuer_conflict` when distinct candidates resolve to different issuers; the B2 plan explicitly calls for both `.A` candidates. | `B2-01: different owners of .A candidates remain a conflict per §5.4` (removed) |
| B4-01 | Yes | R1 now skips an already `unverified` row with no span and still reports a confirmed row with no span. Retained regression and updated the existing R1 expectation. | `B4-01: skips already unverified rows without spans but blocks confirmed rows` |
| B5-01 | No | Removed probe. Both sign cases and wrong-sign rejection already pass. | `B5-01: grounds upside and downside only to matching signs` (removed) |
| B5-02 | No | Removed probe. Known mismatched price currency already returns `currency_mismatch`. | `B5-02: known wrong price currency yields currency_mismatch` (removed) |
| B5-03 | No | Removed probe. Currency prefixes adjacent to prices remain visible; identifier masking does not mask `HK$` or `US$`. | `B5-03: currency prefixes adjacent to prices remain visible` (removed) |
| B3-08 | No | Removed probe. The implementation retains one row per distinct normalized value with the same conflict group; equal values collapse as §6.2 requires, with source chunks in `merged_from`. | `B3-08: each distinct conflict value retains a row and shared group` (removed) |
| B3-09 | No | Removed probe. §5.2 specifies first verbatim hit plus `detail.multiple_hits`; the located row remains reviewable. | `B3-09: first verbatim hit is located and other hits are recorded` (removed) |
| B3-10 | No | Removed probe. `locateQuote` uses `indexOf(quote)` and the quote's UTF-16 length, so the stored quote equals the page slice for a located row, including emoji. | `B3-10: located source text is the exact UTF-16 page slice` (removed) |

Final verification: `npm run typecheck && npm run lint && npx vitest run src/lib/broker-research` passed. Vitest reported 14 files passed, 1 skipped; 189 tests passed, 68 skipped.
