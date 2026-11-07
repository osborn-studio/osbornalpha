Read-only review of `93940410`; extraction files match the commit. Ran 19 targeted assertions plus seven tokenizer probes; full test suites were not run. Opus IDs below are descriptive.

| ID | CLOSED? | note |
|---|---|---|
| T9-01 / review finding 1 | CLOSED | Adjacent repeated digits survive; overlapping fake-bold duplicates are removed. |
| T9-02 / review finding 2 | NOT CLOSED | Original `Cost 2025 2024` passes, but period-word substrings still misclassify financial rows; R3. |
| T9-03 | CLOSED | Separately drawn parentheses merge correctly; offsets remain valid. New over-merging regression: R2. |
| T9-04 | CLOSED | Break-after occurs after the matching closing element; nested examples pass. |
| T9-05 | CLOSED | Inline markup preserves `1<span>23</span>4` as `1234`. |
| Opus: U+2212 | CLOSED | Minus sign accepted in numeric cells. |
| Opus: bilingual trailing labels | CLOSED | Trailing labels receive separate nonnumeric cells. |
| Opus: multi-line labels | NOT CLOSED | Continuations can attach to the wrong row; headings and notes are swallowed; R1. |
| Opus: controls/surrogates | CLOSED | Controls removed, lone surrogates replaced, valid supplementary characters retained. |
| Opus: HTML source newlines | CLOSED | Source whitespace folds; block boundaries remain line breaks. |
| Opus: quadratic tokenizer | CLOSED | Inspected scan advances without repeated suffix searches; seven 80 KB malformed inputs completed in 0–8 ms. |
| Opus: ix:header | CLOSED | Hidden header content excluded. |
| Opus: charset | NOT CLOSED | Basic decoding works, but commented metadata overrides valid UTF-8; R4. |
| Opus: default maxPages | CLOSED | Omitted limit defaults to 1,500; oversized document rejected and destroyed. |
| Opus: signal → destroy | CLOSED | Aborting invokes destruction; rejecting loader probe settles. |
| Opus: canonical pages.json | CLOSED | Recursive key sorting gives identical hashes despite reordered object construction. |
| Opus: header_lines cap | CLOSED | Collection capped at six lines, with width boundary. |
| Opus: vacuous test | CLOSED | Assertion now checks extracted text and its stored code-point offset. |

Paths below are relative to `src/lib/documents/extract/`.

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| R1 | P2 | `tables.ts:117`, `tables.ts:169` | Same-x lines within 1.8 em are claimed without sufficient continuation evidence; “above” wins even at equal spacing. `Revenue 100 200` / `from contracts with customers` / `Cost 100 200`, spaced 14 pt at height 10, attaches the continuation to **Cost**. A nearby statement title and “See accompanying notes” also become body-label cells. | Preserve ambiguous lines as independent rows/header text. Require stronger continuation evidence and resolve both neighboring candidates before claiming a line. |
| R2 | P2 | `tables.ts:56` | Every offset-adjacent item merges, including complete numbers from separate columns. At height 10, `1,234` occupying x=300–325 and `3,456` at x=327–352 become numeric cell `1,2343,456`. With two numeric columns the table disappears; with a third, corrupted numeric cells survive. | Restrict merging to supported numeric fragments using geometry and column context; do not automatically concatenate independently complete numbers. |
| R3 | P2 | `tables.ts:46`, `tables.ts:78` | Unanchored period-label matching still discards legitimate financial amounts. Aligned `Revenue 3000 2800` / `Prior year ended adjustment 2025 2024` / `Profit 975 776` produces **no table**. | Require actual header structure/context instead of a period-word substring inside a financial label. |
| R4 | P2 | `html.ts:43` | Charset sniffing reads commented-out tags. Fully valid UTF-8 `<!-- <meta charset="windows-1252"> --><p>日本 café</p>` extracts as `æ—¥æœ¬ cafÃ©`. | Parse active metadata during encoding sniffing; exclude comments and other non-element contexts. |

The explicit `附註 2025 2024` header probe passed. Valid UTF-8 without misleading metadata passed. Every emitted cell in the merge/wrapping probes—including supplementary-character evidence—sliced its page text correctly; offset validity does not establish correct row or column assignment.

VERDICT: fail (0 P1, 4 P2)