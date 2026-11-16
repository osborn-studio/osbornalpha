Reviewed **Draft 5**; “draft-2” is a stale reference. These are design dispositions, not implementation-test results.

- **N1 — still open (P1):** Invariant 9 binds contributions and observation roles, but not the manifest’s rendered `unit`, `type`, or `change_kind` to the versioned catalog. Changing only DFF’s `change_kind` from `bp` to `pct` changes a 4→4.25 move from **25 bp to 6.25%**, while every specified invariant still passes. Validate all rendered method metadata against the gated catalog; add metadata-only corruption tests.
- **N2 — still open (P1):** Sequence allocation and locking are fixed. The claimed executable SQL still omits `occurred_at` from the INSERT; it appears only in a comment. `20261116090000_judgments.sql` declares it `NOT NULL` without a default. Put `occurred_at, reason` and their values into the actual statement.
- **N3 — closed:** Snapshot and record version checks are separated; `record_missing` precedes the rule-version check.
- **N4 — closed:** Republish must copy the manifest, with a publish→supersede→republish equality test. The null-manifest fallback is explicit.
- **N5 — closed:** Event identity now distinguishes region, series/tenor, kind and date.
- **N6 — closed:** `data_hash` excludes cutoff and compares frozen data identity separately from the replay receipt hash.

Earlier P1 dispositions checked against code:

- **Closed:** R-C1, R-C2, R-C3, R-C4, R-C5, R-C8, R-C13—publication amendment, number-free failures, rule/support validation, production method switches, adapter routing, response-state union and transmission-version dispatch.
- **Closed with documented limitation:** R-C6—historical batch eligibility is specified; subsequent quarantine decisions remain an acknowledged limitation.
- **Closed:** T-C1–T-C4—separate margin arithmetic, latest-observation binding, targeted CHECK replacement and isolated historical v1 tests.

**D1:** Flag-gated snapshot reads are permitted by P1’s server-read contract. Display additionally requires the same-snapshot publishable F4 card and reconciliation. The explicit P1 §3.2 amendment permits labelled rule shares while categorical `display.percent` remains null. This does **not** violate the owner’s publication condition.

**Presets:** P1 explicitly authorizes on-demand fixed-preset computation without stored runs or quota charges. This is a bounded quota exception; arbitrary saved analyses still use the quota RPC. Database and computation costs remain, including cold-instance costs.

Only new defects follow.

| # | Severity P1/P2/P3 | Section | Defect | Concrete fix |
|---|---|---|---|---|
| N7 | P1 | §5.7–§5.8 rollout | **The revised deployment order activates code before its required schema exists.** The sequence is sync→deploy→migration, but that migration also adds `method_manifest`, changes the publish RPC and permits weekly catalog rows. New `db.publishSnapshot` calls cannot use the extra argument before migration; catalog synchronization encounters the old frequency CHECK. This is a schema incompatibility, independent of the documented v1/v2 overlap. | Split schema expansion from retirement. Apply backward-compatible column, constraint and RPC changes first; register v2; deploy; verify publication of an A snapshot and v2 production; retire v1 separately. Test old code against expanded schema and new code against expanded schema. |
| N8 | P1 | §5.2, §5.8 publish RPC | **Adding a defaulted argument with `CREATE OR REPLACE` creates a distinct overload, not a replacement of the existing RPC.** The spec gives no old-signature compatibility/removal policy or permissions for the new signature. Existing signature-specific revocations do not protect the new `SECURITY DEFINER` overload; PostgreSQL grants new functions PUBLIC execution by default. [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createfunction.html) | Specify the exact RPC signatures and transition. Prefer a separately named v2 RPC during overlap, or explicitly replace the old signature with a compatible wrapper. In the same transaction, revoke execution from PUBLIC/anon/authenticated and grant only service_role for every new signature. Test both client generations and unauthorized execution. |

not ready