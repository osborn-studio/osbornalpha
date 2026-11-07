| id | P1/P2/P3 | file:line | defect | concrete fix |
|---|---|---|---|---|
| T16-1 | P2 | `src/app/api/macro/series/[id]/versions/route.ts:19` | Provenance drops persisted `code_version`, including for derived observations. The drawer cannot identify the implementation needed to replay the displayed value, violating mandate §5.2. Retrieval tool versions are not a substitute. | Return `code_version` for every observation/input; carry it through `ProvenanceJson` and display it, including derived parents. |
| T16-2 | P2 | `src/components/macro/macro-format.ts:50` | `unitSuffix` discards every non-percent unit. CN FX therefore displays values such as `710.26` without “CNY per 100 USD”; Task 17 also inherits unitless WTI prices. | Render localized catalog units for all supported units in values and drawer headings. |
| T16-3 | P3 | `src/components/macro/view-model.ts:59` | Passes all 24 frozen sparkline observations through, while the table header and accessible label claim “Last 12.” | Either slice to the last 12 observations or change both localized labels to 24. |

Verdict: fix P1/P2