## Final static re-audit — local S4

Scope: the supplied production files only, re-read against dispositions 1–8. I ran nothing; all test results referenced are yours.

### Residual P0 / P1

**None concrete.** I have no runnable failure trace against the supplied code. Specifically, the paths I tried hardest to break and could not:

- **Write gating.** `assertWritableChain` is called first in `importCandidate`, `revealCards`, and `submitDecision`; `research_s4_integrity` has no runtime DELETE/UPDATE grant and no clearing path, so quarantine is terminal until operator action. `read.ts` (`listCandidates`/`reviewHistory`/`candidateStatus`/`citation`) deliberately omits it and only appends display `ExposureEvent`s — consistent with disposition 4.
- **Anchor crash consistency.** Append → `file.sync()` → SQL ack ordering holds on both branches: recovered entries are fsynced before the early `acknowledge`, newly appended entries are held in `pending` until after the final `sync()`. A transaction killed mid-drain (including by `idle_in_transaction_session_timeout=30s`) leaves durable journal entries with `anchored_at is null`, which the next pass recovers, re-verifies against `receiptBody`, and acks. The `appended>=500` `continue` skips `previous=entry.receipt_hash` only after no further appends occur, so the chain cannot fork; `remaining` is counted after acks, so the worker's loop terminates correctly.
- **Decision integrity.** `replayRequest` precedes the `expectedRevision` check (correct for idempotency), the three referenced records are re-fetched and cross-checked (`baseline_label_ref`, `exposed_artifact_ids`, `actor_kind`, same `evaluation_period_id`), the CAS `update … and revision=$5` is under the per-owner advisory lock, and the column grants (`revision,status,last_observation_id`) match exactly what is written. `makeObservation` implies `security`, so `security.ticker` on the `observation.securities` path is never null-dereferenced. `state` is always present in both branches.
- **Quote/citation round-trip.** `start` accumulates `byteLength(line+'\n')` over *all* first-8 lines including skipped blanks, and `end=start+byteLength(text)` where `text` is a codepoint prefix of `line` — so `bytes.subarray(start,end)` is exactly `text`, and the fatal-UTF-8 decode plus `text!==fact.text` equality check closes the rest. `index>7` matches the ≤8 quote cap.
- **Column grants vs. writes.** Every `update` in the codebase is covered by an explicit column grant; every other table write is insert-only against `research_s4_immutable`.

### One assumption I could not verify

`decisions.ts` and `read.ts researchOptions` select `exchange`, `currency`, and `metadata` from `public.stocks_universe`; the S4 migration also grants select on `public.security_aliases`. None of the three supplied legacy migrations define those columns or that table. I am treating this as supplied-by-one-of-the-other-22-migrations rather than a finding — the S4 migration's `grant … on public.security_aliases` would itself abort if the table were absent, and you report all 25 apply. Flagging only so the assumption is explicit, not as a P0/P1.

### Residual P2

1. **`read.ts citation` calls `serverTime(db)` twice** (once for `evaluation_period_id`, once for `displayed_at`). Two different instants in one record; across a Monday 00:00 UTC boundary the period label and the display timestamp disagree. One-line fix: hoist to a single `const at`.
2. **Unguarded shape access in `cards.ts`.** `row.imported.candidate.entity_candidates.map(...)` and `...row.imported.candidate.wiki_revision_refs` (spread in `revealCards`) throw `TypeError` if the frozen verifier treats those as optional, surfacing as HTTP 500 `internal_error` rather than 422 `invalid_schema`. If `verifyCandidatePack` makes both required this is inert; if not, it is a wrong error class, not data loss.
3. **Journal re-read cost is quadratic across passes.** Each `drainOutbox` pass re-parses and re-verifies the entire `receipts.jsonl` before appending ≤500 entries, all inside the DB transaction. At the worker's 20-pass ceiling that is ~10k entries re-verified 20 times under a 30 s idle-in-transaction timeout. It fails closed and recovers (see above), so this is a throughput ceiling that manifests as `anchor_backlog_remaining`, not a correctness defect.
4. **`ThesisRevision.previous_revision_id` is hardcoded `null`.** Revision lineage for a given `thesis_id` is never linked across candidates. `buildCards`' early return keeps it to one revision per candidate, so no intra-candidate breakage, but the field carries no information.
5. **`DecisionForm` request-key reuse.** `attempt.current` only rotates on a changed body signature, so a deliberate second *identical* decision replays as `duplicate:true` while `decide()` still shows 决定已保存. Consider rotating the key after a successful submit.
6. **`report()` does not refresh `revision` on `revision_conflict`.** The user must manually 查看/刷新历史 before the retry can succeed; the message asks them to re-check but the state is not reloaded.
7. **`anchor.ts` fsyncs `dirname(root)`** with plain `O_RDONLY`, no `O_NOFOLLOW`/`O_DIRECTORY` and no `controlledDirectory` check — the one path in the module that escapes the validated tree. Read-only `fsync`, so impact is effectively nil; it is an inconsistency with the module's own contract rather than an exploit.
8. **`listCandidates` silently drops rows** on `scope_denied`/`policy_blocked`. A candidate whose binding expired disappears from the picker with no notice; the UI's empty state reads 尚无可访问候选. Intentional-looking, but worth a distinct count/notice for operator debugging.

### Net

No concrete residual P0 or P1. The P2s above are the complete list I can support from the supplied text; items 1, 4, 5 and 6 are one- or two-line changes, and 2 is conditional on the frozen verifier's required-field set.