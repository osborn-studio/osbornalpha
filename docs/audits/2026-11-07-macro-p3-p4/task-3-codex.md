| # | Sev P1/P2/P3 | File:line | Defect | Fix |
|---|---|---|---|---|
| 1 | P2 | `src/lib/macro/strategy/hash.ts:12` | Sparse arrays break manifest identity: `canonicalJson(Array(1))` equals `canonicalJson([])`, while JSON storage converts the hole to `null`. Reproduced: a stored manifest’s hash no longer matches its stored body. Tests omit this case. | Reject sparse arrays before hashing; add a storage-round-trip test asserting the stored body reproduces its hash. |
| 2 | P3 | `src/lib/macro/strategy/db.ts:338` | Memory recovery filters completed outputs before limiting; production scans only the oldest 50 running rows first. With 50 unfinished rows preceding a recorded completion, memory returns that completion while production returns nothing. Shared tests miss this divergence. | Mirror production’s ordering and scan cap in memory; add a shared test with 51 mixed running rows. |

fix required