Read-only review completed; no files modified. **S** denotes the fourth-draft industry spec; **F2/F4** denote the referenced upstream specs.

| Finding | Status | Fourth-draft assessment |
|---|---|---|
| T1 | RESOLVED | S §§4.3, 6.4, 9 remove official values from public rows/manifests and gate their separate projection. |
| T2 | RESOLVED | S §§5.4, 6.4 remove `recompute_from` from freshness ordering and declare `fingerprint_at` for both run types. |
| T3 | PARTIAL | S §§4.4–4.5 combine resolution and application, but the new supersession sequence cannot satisfy its own constraints; see U1. |
| T4 | RESOLVED | S §4.3 authorizes metric rows through a helper that obtains scheme/version from their run. |
| T5 | PARTIAL | S §§4.3, 6.1–6.2 introduce observation UUIDs, but replacement ordering and content-based idempotency introduce U2/U3. |
| T6 | RESOLVED | S §6.4 requires method/config/formula/comparator compatibility, forces full recomputation otherwise, and recalculates publication eligibility. |
| R2 | RESOLVED | S §§4.6, 16 require evidence for `point_in_time` and explicitly classify all v1 SW2021 runs as reconstruction. |
| R5 | RESOLVED | S §§4.3, 4.8, 9 close the previously identified official-value disclosure path. |
| R6 | PARTIAL | S §§5.4, 6.4 repair chronological activation, but the new dependency table cannot faithfully represent mixed revisions within a run; see U4. |
| R8 | PARTIAL | S §§5.3, 6.4 stop equating observation availability with trade date, but assigning availability at run creation still permits backdating; see U6. |
| R11 | RESOLVED | S §4.3 supplies the previously missing policy lookup and replaces the missing watermark contract with declared fields. |
| N4 | PARTIAL | S §7.1 adopts F4’s `table_rows` rule and intentional historical lookahead rejection, but its `updated_at` assignment does not establish when results became available; see U6. |
| N5 | PARTIAL | S §§4.4–4.5 make failed applications retryable and countable, but successful supersession remains blocked by U1. |

The following defects arise from fourth-draft changes, checked against the third-draft Git version.

**U1 — P1 — S §§4.3–4.5: Membership supersession has no executable statement order.**

Step 1 sets `status='superseded'` before filling `superseded_by`, immediately violating both the CHECK and lifecycle trigger. Supplying the future UUID immediately instead violates the non-deferrable self-FK; inserting the new `ok` row first conflicts with current-row uniqueness/exclusion.

Additionally, the migration never explicitly drops landed `issuer_industry_memberships_no_overlap`, whose predicate includes **all** statuses: retained superseded versions still conflict with their replacements. Merely adding the new partial exclusion does not replace it. CHECK constraints cannot be deferred. [PostgreSQL constraint documentation](https://www.postgresql.org/docs/17/sql-createtable.html).

**Prescribed fix:**

> Explicitly drop `issuer_industry_memberships_no_overlap`. Retain the new `status='ok'` exclusion and partial natural-key uniqueness. Declare `superseded_by`’s self-FK `DEFERRABLE INITIALLY DEFERRED`. Preallocate replacement membership UUIDs; update each old row’s `status` and `superseded_by` together; then insert the replacement rows with those UUIDs and commit resolution in the same transaction. Do not temporarily permit a null successor.

The landed classification FK points **from memberships to classifications**; it does not depend on the removed membership primary key and should remain intact.

**U2 — P1 — S §§4.3, 6.1–6.2: Observation replacement inserts into an occupied unique slot.**

Section 6.1 says to insert the new `ok` observation and then supersede the old one. The newly added partial unique index rejects the insert immediately. Being in one transaction does not defer a unique index. Section 6.2 inherits the same algorithm. [PostgreSQL uniqueness documentation](https://www.postgresql.org/docs/16/sql-createtable.html).

**Prescribed fix:**

> Serialize each observation’s natural key with a transaction-scoped lock, including when no current row exists. Validate and deduplicate the incoming observation first. For an accepted replacement, update the existing `ok` observation to `superseded`, then insert the new `ok` observation with `supersedes=old.observation_id`, in one transaction. Any insertion failure rolls back the supersession. Apply this order to both marks and official values.

**U3 — P2 — S §§4.3, 6.1–6.2: Permanent raw-hash uniqueness discards legitimate reversions.**

For observations A → B → A, the final response matches an old, superseded hash and is declared a duplicate. B remains current although the provider has reverted to A. The third draft compared against the current value; this failure is introduced by uniqueness across all historical hashes.

**Prescribed fix:**

> Replace permanent `(natural_key, raw_hash)` uniqueness with `(natural_key, fetch_event_id)` uniqueness, where `fetch_event_id` identifies a persisted fetch and is reused only when retrying that fetch. Compare new fetches with the current observation: identical current content is a duplicate; content matching a superseded observation creates a new observation. Preserve `raw_hash` as evidence, not observation identity.

Add an A → B → A test with three distinct fetch events.

**U4 — P1 — S §§4.3, 5.4, 6.4: One dependency revision per issuer cannot describe the new activation invariant.**

`industry_run_dependencies` permits only one revision per `(run_id, issuer_id)`, but a valuation run can carry old cells using revision 8 and recompute recent cells using revision 10. Separate F2 `read_facts` calls can also return different revisions during a build. F2 guarantees revision consistency **within each read**, not across the industry run.

Choosing the fingerprint revision mislabels actual inputs; choosing a maximum can conceal a regressed cell; choosing a minimum can reject valid progress. A later `fingerprint_at` resolves none of these cases.

**Prescribed fix:**

> Record dependencies per logical cell and issuer, keyed by `(run_kind, run_id, cell_key, issuer_id)`. Populate `state_rev` from the actual `read_facts` envelope used by that cell, or copy it from the frozen manifest for reused/carried cells. Validate dependency completeness against each cell’s candidate-member set. At activation, compare matching cell/issuer dependencies against the currently active run and reject any revision decrease. Do not substitute fingerprint revisions or aggregate revisions with MIN/MAX.

Treat `fingerprint_at` only as orchestration metadata, not evidence of input freshness.

**U5 — P1 — S §§4.3, 6.4: The new publication guard is not an exclusive publication path.**

The spec retains service-role table writes while using a session setting as proof that the publishing function is executing. A direct SQL writer can set that same custom setting; session scope can also leave it enabled after the function returns. The stated rejection covers `UPDATE`, leaving `INSERT ... published=true` unspecified. PostgreSQL accepts custom two-part setting names. [PostgreSQL custom settings documentation](https://www.postgresql.org/docs/current/runtime-config-custom.html).

**Prescribed fix:**

> Revoke direct INSERT/UPDATE/DELETE on valuation rows and pairs from `service_role`; grant only execution of controlled SECURITY DEFINER staging/publishing functions owned by a dedicated non-login role. Staging functions accept only building runs and force `published=false` and `series_qualified=false`. The publication function locks the run, validates matching pairs, computes qualification, and sets publication flags. Freeze rows and pairs after publication; activation revalidates the publication invariant. Remove the session setting as an authorization mechanism.

Test direct inserts as well as updates, including an explicitly forged `industry.publishing` setting.

**U6 — P1 — S §§4.3, 5.3–5.4, 6.4, 7.1: Run creation backdates results that do not yet exist.**

The run is created **before** fingerprinting, reading inputs, computing, and publication, yet every row receives `updated_at=run.created_at`. For example, a run created before UTC midnight can consume a correction observed after midnight and later qualify for an F4 judgment dated the preceding day. This directly contradicts the new claim that availability never precedes the result or its inputs.

The intended rejection of historical judgments is sound; the timestamp chosen to implement it is not.

**Prescribed fix:**

> Replace every `updated_at = run.created_at` rule with a publication timestamp assigned during final activation, after all input reads, computation, and reconciliation. Keep building rows inaccessible. Set the rows’ `updated_at` and the run’s `activated_at` from the same database timestamp captured at that final stage, and prohibit later mutation. F4 derives availability from this timestamp using its existing UTC rule. Carried rows receive the new publication timestamp because they are republished in the new run.

Add a cross-UTC-midnight test proving that a post-midnight correction cannot enter a judgment with the preceding date.

External API uncertainty remains: I have not established Tushare historical completeness/pagination, `sw_daily` comparator semantics, `daily_basic` share-class coverage, `trade_cal` fields, or CNInfo historical identity stability; the existing verification gates remain necessary.

**Verdict:** **not ready** for implementation planning. U1/U2 block ordinary replacement operations; U4 leaves dependency non-regression unprovable; U5 permits publication bypass; and U6 still permits lookahead. Apply those blocking fixes and the U3 reversion fix before proceeding.