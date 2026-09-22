# Second Independent Static Audit — Alpha S4

Static reading only; no execution, no tests run. Findings are limited to what the supplied files support. I've excluded everything already dispositioned in your prior-findings list (receipt reconstruction, journal bounding, whole-chain quarantine policy, Monday period, descriptive stream, definer-migration privilege model, etc.).

---

## P0

**1. The migration grants on pre-existing tables without establishing permissive RLS policies for `alpha_s4_runtime`.**
`supabase/migrations/20260922090000_research_s4.sql` creates `s4_owner` policies only for the eight *new* S4 tables (the `do $$ ... foreach` loop). For the pre-existing tables it merely grants privileges: `select on public.profiles, research_entities, research_theses, stocks_universe, security_aliases` and `select, insert on research_source_documents, research_audit_log`. A `GRANT` does not satisfy RLS. If any of those tables has RLS enabled with policies scoped to `authenticated` (the normal Supabase shape), `alpha_s4_runtime` matches no permissive policy and every read returns zero rows / every insert is rejected.

Concrete consequences, in severity order:
- `transaction()` (`db.ts`) reads `public.profiles` and fails `scope_denied` when `profile.rows[0]?.role !== 'admin'` — a missing policy makes **every S4 operation fail closed**, indistinguishable from a real authorization denial.
- `addRecord()` inserts into `research_audit_log` on every record — a missing INSERT policy breaks all writes with a SQLSTATE that `http.ts` masks to `internal_error`/500.
- `research_theses` / `research_entities` returning empty does **not** fail: `buildCards` silently produces exploration-only fanout with `entities=[]`, and `selectFanout` reports `matched:0, omitted:0`. That is a silent-wrong-output path, not a fail-closed one.

The `s4_controlled_copy` restrictive policy added to `research_source_documents` only narrows; it cannot grant runtime visibility. Note the asymmetry is visible in the file itself: the migration is careful to create owner policies for its own tables and creates none for the tables it newly grants on.

**Fix:** add explicit permissive policies (or `to public` / role-inclusive policies) for `alpha_s4_runtime` on all seven pre-existing tables, and assert them in the migration (`select 1 from pg_policies ...`) rather than relying on an untested inherited shape.

---

## P1

**2. Quarantine is not a write-path gate.**
`anchor.ts` sets every `research_s4_observation_state` row for the owner to `anchor_status='integrity_failed'` and logs "stop evaluation." Nothing in `decisions.ts`, `cards.ts`, or `read.ts` reads `anchor_status` before writing. After quarantine, `submitDecision` continues to create new `Observation` rows (`anchor_status:'anchor_pending'` in the payload, plus a fresh state row), and `revealCards`/`reviewHistory`/`citation` continue to append outbox rows via `addRecord` default `outbox:true`. Each subsequent worker run re-detects the torn journal, re-fails, and re-quarantines — now including observations created *after* the operator was told to stop. The fail-closed intent is documented but unenforced.

**Fix:** in `transaction()` or `candidateFor()`, reject mutating operations when the owner has any `anchor_status='integrity_failed'` row (or a dedicated owner-level quarantine flag), with a distinct error code so the UI can explain it. The existing `explanations` map in `page.tsx` has no entry for this state either.

**3. `research_s4_source_id` can bind S4 candidates to an uncontrolled source document.**
```sql
select id from public.research_source_documents
where user_id=p_owner and p_owner=auth.uid() and content_hash=p_hash
```
No filter on `metadata->>'s4_controlled_copy'='true'`. `import.ts` only sets that marker on the insert path; on the dedupe path it adopts whatever document already matched the hash. The adopted row is then referenced by `research_source_versions`, read by `buildCards`/`citation`, and — because it lacks the marker — falls outside the `s4_controlled_copy` restrictive policy and outside `research_s4_copy_marker`. The stated invariant ("controlled copies never enter legacy clients or external-model pipelines") is therefore not maintained for deduped imports. The material exposure is bounded (the owner already held those bytes), but the containment label is wrong and the protection is silently absent.

**Fix:** restrict the definer function to `metadata->>'s4_controlled_copy'='true'`, and insert a new controlled row otherwise.

**4. `source_key` semantics are load-bearing in two places that cannot both hold.**
`read.ts:citation` resolves the backing document by `v.source_key = digest(fact.source_ref)`, where `fact.source_ref` is the full `source_ref` copied from `research_source_versions`. The migration declares `unique(user_id, source_key)`. If `prepareCandidate` derives `sourceKey` from the *versioned* ref, the unique constraint is correct but nothing guarantees `digest(source_ref) === sourceKey` — citation silently returns no row and fails `hash_mismatch` for every fact. If it derives `sourceKey` from the version-independent identity (owner_system/scope/source_id), citation works but importing a second version of the same upstream source violates `unique(user_id,source_key)`, surfacing as an unmapped SQLSTATE → 500 `internal_error`. `import.ts` already has a dedicated `source_version_conflict` path for `version_identity`; it has none for `source_key`.

This is not resolvable from the supplied files (`prepareCandidate` is not included) — it needs to be pinned down explicitly, with citation looking up by `version_identity` or by `source_version_id` carried on the fact rather than by a re-derived digest.

**5. Frozen-calendar exhaustion converts into a hard first-decision outage.**
`planObservationSessions` requires `cutoff` inside `calendar.range`, then `candidates.length === policy.max_wait_trading_sessions`, then `observationWindowEnds(full.at(-1)!.close)` which requires `start + max(windows_trading_sessions)` further sessions to exist. As local time approaches the calendar's tail, all three fail with `rule_unsupported` → `data_insufficient` → 422. Because `makeObservation` is forced true whenever `!row.last_observation_id`, **the first decision on any candidate becomes impossible** near the tail — including `reject` and `defer`, where the operator arguably wants a record, not a market window. There is no advance warning surface (no "calendar expires on" in `researchOptions` or the UI), and `page.tsx` has no `explanations` entry for `data_insufficient`, so the user sees `操作失败：data_insufficient`.

**Fix:** expose remaining calendar headroom in `/options`, add the error explanation, and consider allowing `reject`/`defer` to record without a market observation.

**6. `drainOutbox` holds the owner advisory lock across up to 500 `fsync`s plus three directory syncs.**
The journal write path is inside `transaction()`, which takes `pg_advisory_xact_lock(hashtextextended(userId,0))` — the same lock every UI mutation needs. A drain of a 500-record backlog blocks all of that owner's reveals, decisions, and history reads for the duration of 500 serialized `file.sync()` calls. `statement_timeout: 15000` does not bound it (it's per statement), and no `idle_in_transaction_session_timeout` is set. On the worker side `anchor-worker.ts` runs `do { ... } while(remaining>0)` with no iteration cap, so `--once` does not terminate while a UI session keeps producing outbox rows faster than 500/pass.

**Fix:** batch the fsync (write N lines, one `sync()`), cap `--once` at a fixed number of passes, and set `idle_in_transaction_session_timeout` on the runtime role.

---

## P2

**7. Read operations manufacture outbox rows.** `reviewHistory` and `citation` call `addRecord(...,'ExposureEvent',...)` with default `outbox:true`. Journal length therefore grows with *viewing*, not just with decisions — including the UI's "查看 / 刷新历史" button, which is trivially repeatable. Consider `outbox:false` for read-provenance exposures, or a per-period dedupe.

**8. jsonb round-trip fragility in the receipt hash.** `anchor.ts` recomputes `digest(row.event)` from the jsonb column. Today every field is a string or null, so it's safe. The moment any numeric field is added to the outbox `event` (`records.ts`), Postgres `jsonb` numeric normalization can change the canonical form and trigger **whole-owner quarantine** on previously valid rows. Store the canonical text alongside the jsonb, or hash the text column.

**9. `research_s4_candidates.status` is unconstrained.** `grant update(revision,status,last_observation_id)` with no CHECK; `submitDecision` writes `input.action` directly. Add `check(status in ('candidate', ...DECISION_ACTIONS))` so the DB, not the Ajv schema alone, bounds the value.

**10. Symlink hardening is terminal-component only.** `controlledDirectory` lstat-checks `root` and `dir` and the file is opened `O_NOFOLLOW`, but `mkdir(root,{recursive:true})` follows symlinked intermediate components of an operator-supplied `root`. Same-uid, operator-config, so low — but `O_DIRECTORY|O_NOFOLLOW` on each component, or `realpath` comparison, would close it.

**11. `listCandidates` takes `FOR UPDATE` row locks on up to 100 candidates.** `candidateFor` is called per row, each performing `bindingFor` + `serverTime` + `authorize` — an N+1 that row-locks the owner's entire visible set for the duration of a list render.

**12. Minor.** `selectFanout`'s comparator never returns `0` (unstable ordering under equal digests); `matched.slice(0,8)` is recomputed inside the `filter` predicate. `observationWindowEnds` hardcodes `'13:00'` for half-days rather than reading it from policy. `page.tsx:explanations` is missing `input_limit`, `future_input`, `source_version_conflict`, `hash_mismatch`, `data_insufficient`, `internal_error`. Local session tokens have no maximum lifetime or revocation identifier.

---

**Not defects, for the record:** the append cap's `continue` correctly leaves `previous` unadvanced; journal-generator consumption never interleaves with appends (appends begin only after `next.done`); deleting `receipts.jsonl` fails closed via the `row.anchored_at || row.receipt_hash` check; `parseStrict` runs only on HMAC-verified bytes in `auth.ts`; the `citation` `text !== fact.text` comparison is a genuine end-to-end check on the UTF-8 byte-span arithmetic in `buildCards`.