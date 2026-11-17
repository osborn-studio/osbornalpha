The supplied path still contains **Draft 6**, with no §0.6. Commit `339fa1e6` mentions Draft 7, but its diff does not update the spec. These findings apply to the available text.

- **N9 — still open:** §5.8 copies the old RPC’s four trailing `DEFAULT NULL` parameters, then appends required `p_method_manifest`. This violates PostgreSQL’s parameter-default ordering rule. Move it before the defaulted parameters or remove defaults in the new signature. [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createfunction.html)
- **N10 — still open:** §5.2 still omits `strategy-view-model.ts::unitSuffix`, which returns `''` for `usd_mn` and `usd_bn`. Both `nodeDisplay` and `flowRows` consequently lose the currency scale.

Earlier dispositions remain **closed at design level**, not implementation verification:

- **N1:** Invariant 9 binds manifest metadata and contributions to the gated catalog and stored result.
- **N2:** Retirement SQL now supplies the required event fields and allocates sequence numbers from the event table.
- **N7:** Schema expansion precedes registration/deployment; retirement follows verification.
- **N8:** Separate v2 RPC, retained old RPC and explicit permissions resolve the overload/security issue. N9 remains distinct.

**D1:** No publication-rule violation in the prescribed design. P1 permits flag-gated server reads; display additionally requires the publishable, eligible, same-snapshot F4 card and reconciliation. The amended P1 §3.2 authorizes labelled rule shares while categorical `display.percent` remains null.

**Presets:** P1’s amendment explicitly permits fixed-preset computation without persistence or quota charges. Arbitrary saved analyses retain the quota RPC. Database and computation costs remain, including per-instance cold starts; these are documented limitations.

| # | Severity P1/P2/P3 | Section | Defect | Concrete fix |
|---|---|---|---|---|
| R7-1 | P2 | Document identity / missing §0.6 | The requested final-review artifact is absent: the spec still contains the exact N9/N10 defects reported in round 6. A commit title cannot establish their closure. No additional new P1 identified in the available draft. | Commit the actual Draft 7 text, including §0.6, corrected RPC signature and localized transmission-unit requirements, then review that immutable revision. |

not ready