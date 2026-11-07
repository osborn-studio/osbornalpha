| id | P1/P2/P3 | file:line | defect | concrete fix |
|---|---|---|---|---|
| T8-1 | P2 | scripts/macro/collect.py:218 | If AKShare raises after receiving a response, captured bytes never reach `caps`; the exception handler also discards earlier evidence. Reproduced: parser failure leaves zero retained captures. | Retain captures in `finally`; persist failed-call evidence for diagnosis/replay while marking the series failed. |
| T8-2 | P2 | scripts/macro/collect.py:221 | HTTP 200 plus an empty DataFrame reports `ok:true`. Reproduced with zero claims. Alongside successful series, this hides a missing source from batch failures and `failed_series`. | Require usable target-series claims; report an explicit empty-series failure otherwise. |
| T8-3 | P2 | src/lib/macro/cn-series.ts:53 | CPI backfill replaces the current leaf with historical leaves ending in 2025. A fresh `--mode backfill` omits all available 2026 CPI observations while reporting success. | Include the current catalog path alongside historical leaves; regenerate JSON and test coverage through the current era. |

Verdict: fix P1/P2