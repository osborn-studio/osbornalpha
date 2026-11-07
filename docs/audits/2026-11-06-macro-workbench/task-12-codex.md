| id | P1/P2/P3 | file:line | defect | concrete fix |
|---|---|---|---|---|
| T12-1 | P2 | src/lib/macro/read-api.ts:69 | `classifyAsOf` ignores `judgments`: even with the flag off, it returns computed regime scores and states. This violates §0.2’s disabled-mode `regime = null` requirement. | Gate classification and return `regime: null` when disabled; test both explicit `judgments:false` and the unset environment flag. |
| T12-2 | P2 | src/lib/macro/replay.test.ts:43 | Replay derives while `SEED_BATCH` is `running`, but `seriesHistory` hides running-batch rows. Every derivation receives empty inputs, silently skipping derived indicators; the remaining native rows let replay assertions pass without proving derived-data replay. | Use `eligibleHistory(..., {includeBatch: SEED_BATCH, maxRows:20000})`; assert expected derived indicators exist and their complete ancestry reaches recorded evidence. |

Verdict: fix P1/P2