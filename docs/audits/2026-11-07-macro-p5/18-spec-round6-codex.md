Reviewed **Draft 6**; “draft-2” is a stale reference. These are design closures, not implementation-test results.

- **N1 — closed:** Invariant 9 now binds rendered metadata to the gated catalog and requires a `change_kind` corruption test.
- **N2 — closed:** The retirement INSERT supplies `occurred_at` and `reason`; locking, sequence allocation and idempotency match the schema.
- **N7 — closed:** Schema expansion now precedes registration/deployment; retirement follows verification.
- **N8 — closed:** The separately named v2 RPC, retained old RPC and explicit same-transaction permissions resolve the overload/security defect. A different declaration defect appears below.

Earlier P1 dispositions checked against code:

- **Closed:** C1, C2, C3, C7, C11, C12, C14, C18, C20–C23; R-C1–R-C5, R-C8, R-C13; T-C1–T-C4.
- **Closed with documented limitations:** C13 and R-C6—historical settlement/version behavior and subsequent quarantine decisions, respectively.

**D1:** Flag-gated snapshot reads comply with P1’s server-read contract. Display additionally requires a publishable, eligible, same-snapshot F4 card and reconciliation. P1 §3.2 explicitly permits labelled rule shares while categorical `display.percent` remains null. This does not violate “只有满足既有发布条件才展示”.

**Presets:** P1 explicitly authorizes fixed-preset computation without persistence or quota charges. This is a documented quota exception; arbitrary saved analyses still use the quota RPC. Database/computation costs remain, including cold-instance costs.

Only new defects follow.

| # | Severity P1/P2/P3 | Section | Defect | Concrete fix |
|---|---|---|---|---|
| N9 | P1 | §5.8 v2 RPC declaration | **The prescribed parameter order is invalid PostgreSQL.** “旧 RPC 的全部参数逐字” copies four trailing parameters with `DEFAULT NULL` from `20261114090000_macro_workbench.sql:708`, then appends required `p_method_manifest jsonb`. PostgreSQL requires every input parameter following a defaulted parameter to have a default. Schema expansion therefore fails before rollout. This is distinct from N8’s overload/permissions issue. [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createfunction.html) | Put required `p_method_manifest` before the defaulted tail in the separately named v2 function, or explicitly remove defaults from its copied parameters. Specify the complete signature and matching grants; test migration execution and both RPC generations. |
| N10 | P2 | §4.5, §5.2, §6 | **New liquidity units disappear in the transmission UI.** The prescribed unit work updates `macro-format.ts` and translations, but transmission uses its own `strategy-view-model.ts::unitSuffix`, which returns an empty string for both `usd_mn` and `usd_bn`. `nodeDisplay` and `flowRows` consequently render TGA/WALCL and RRP amounts without their different scales. Catalog correctness alone does not fix these consumers. | Include the strategy formatter in D1’s unit work. Render localized million/billion USD labels in both node cards and the equivalent table; test each unit through `nodeDisplay` and `flowRows` without changing stored values. |

not ready